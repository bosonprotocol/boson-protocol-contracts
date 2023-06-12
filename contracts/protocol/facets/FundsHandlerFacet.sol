// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.18;

import "../../domain/BosonConstants.sol";
import { IBosonFundsHandler } from "../../interfaces/handlers/IBosonFundsHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { PausableBase } from "../bases/ProtocolBase.sol";
import { ProtocolBase } from "../bases/ProtocolBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { FundsLib } from "../libs/FundsLib.sol";
import { IERC20 } from "../../interfaces/IERC20.sol";
import { IERC20Metadata } from "../../interfaces/IERC20Metadata.sol";

/**
 * @title FundsHandlerFacet
 *
 * @notice Handles custody and withdrawal of buyer and seller funds.
 */
contract FundsHandlerFacet is IBosonFundsHandler, ProtocolBase {
    /**
     * @notice Facet Initializer
     * This function is callable only once.
     */
    function initialize() public onlyUninitialized(type(IBosonFundsHandler).interfaceId) {
        DiamondLib.addSupportedInterface(type(IBosonFundsHandler).interfaceId);
    }

    /**
     * @notice Receives funds from the caller, maps funds to the seller id and stores them so they can be used during the commitToOffer.
     *
     * Emits FundsDeposited event if successful.
     *
     * Reverts if:
     * - The funds region of protocol is paused
     * - Seller id does not exist
     * - It receives some native currency (e.g. ETH), but token address is not zero
     * - It receives some native currency (e.g. ETH), and the amount does not match msg.value
     * - Contract at token address does not support ERC20 function transferFrom
     * - Calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - Received ERC20 token amount differs from the expected value
     *
     * @param _sellerId - id of the seller that will be credited
     * @param _tokenAddress - contract address of token that is being deposited (0 for native currency)
     * @param _amount - amount to be credited
     */
    function depositFunds(
        uint256 _sellerId,
        address _tokenAddress,
        uint256 _amount
    ) external payable override fundsNotPaused nonReentrant {
        // Check seller exists in sellers mapping
        (bool exists, , ) = fetchSeller(_sellerId);

        // Seller must exist
        require(exists, NO_SUCH_SELLER);

        if (msg.value != 0) {
            // Receiving native currency
            require(_tokenAddress == address(0), NATIVE_WRONG_ADDRESS);
            require(_amount == msg.value, NATIVE_WRONG_AMOUNT);
        } else {
            // Transfer tokens from the caller
            FundsLib.transferFundsToProtocol(_tokenAddress, _amount);
        }

        // Increase available funds
        FundsLib.increaseAvailableFunds(_sellerId, _tokenAddress, _amount);

        emit FundsDeposited(_sellerId, msgSender(), _tokenAddress, _amount);
    }

    /**
     * @notice Withdraws the specified funds. Can be called for seller, buyer or agent.
     *
     * Emits FundsWithdrawn event if successful.
     *
     * Reverts if:
     * - The funds region of protocol is paused
     * - Caller is not associated with the entity id
     * - Token list length does not match amount list length
     * - Token list length exceeds the maximum allowed number of tokens
     * - Caller tries to withdraw more that they have in available funds
     * - There is nothing to withdraw
     * - Transfer of funds is not successful
     *
     * @param _entityId - id of entity for which funds should be withdrawn
     * @param _tokenList - list of contract addresses of tokens that are being withdrawn
     * @param _tokenAmounts - list of amounts to be withdrawn, corresponding to tokens in tokenList
     */
    function withdrawFunds(
        uint256 _entityId,
        address[] calldata _tokenList,
        uint256[] calldata _tokenAmounts
    ) external override fundsNotPaused nonReentrant {
        address payable sender = payable(msgSender());

        // Address that will receive the funds
        address payable destinationAddress;

        // First check if the caller is a buyer
        (bool exists, uint256 callerId) = getBuyerIdByWallet(sender);
        if (exists && callerId == _entityId) {
            // Caller is a buyer
            destinationAddress = sender;
        } else {
            // Check if the caller is an assistant
            (exists, callerId) = getSellerIdByAssistant(sender);
            if (exists && callerId == _entityId) {
                // Caller is an assistant. In this case funds are transferred to the treasury address
                (, Seller storage seller, ) = fetchSeller(callerId);
                destinationAddress = seller.treasury;
            } else {
                (exists, callerId) = getAgentIdByWallet(sender);
                if (exists && callerId == _entityId) {
                    // Caller is an agent
                    destinationAddress = sender;
                } else {
                    // In this branch, caller is neither buyer, assistant or agent or does not match the _entityId
                    revert(NOT_AUTHORIZED);
                }
            }
        }

        withdrawFundsInternal(destinationAddress, _entityId, _tokenList, _tokenAmounts);
    }

    /**
     * @notice Withdraws the protocol fees.
     *
     * @dev Can only be called by the FEE_COLLECTOR role.
     *
     * Emits FundsWithdrawn event if successful.
     *
     * Reverts if:
     * - The funds region of protocol is paused
     * - Caller does not have the FEE_COLLECTOR role
     * - Token list length does not match amount list length
     * - Token list length exceeds the maximum allowed number of tokens
     * - Caller tries to withdraw more that they have in available funds
     * - There is nothing to withdraw
     * - Transfer of funds is not successful
     *
     * @param _tokenList - list of contract addresses of tokens that are being withdrawn
     * @param _tokenAmounts - list of amounts to be withdrawn, corresponding to tokens in tokenList
     */
    function withdrawProtocolFees(
        address[] calldata _tokenList,
        uint256[] calldata _tokenAmounts
    ) external override fundsNotPaused onlyRole(FEE_COLLECTOR) nonReentrant {
        // Withdraw the funds
        withdrawFundsInternal(protocolAddresses().treasury, 0, _tokenList, _tokenAmounts);
    }

    /**
     * @notice Returns the information about the funds that an entity can use as a sellerDeposit and/or withdraw from the protocol.
     *
     * @param _entityId - id of entity for which availability of funds should be checked
     * @return availableFunds - list of token addresses, token names and amount that can be used as a seller deposit or be withdrawn
     */
    function getAvailableFunds(uint256 _entityId) external view override returns (Funds[] memory availableFunds) {
        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        // get list of token addresses for the entity
        address[] storage tokenList = lookups.tokenList[_entityId];
        availableFunds = new Funds[](tokenList.length);

        // Get entity's availableFunds storage pointer
        mapping(address => uint256) storage entityFunds = lookups.availableFunds[_entityId];

        for (uint256 i = 0; i < tokenList.length; i++) {
            address tokenAddress = tokenList[i];
            string memory tokenName;

            if (tokenAddress == address(0)) {
                // If tokenAddress is 0, it represents the native currency
                tokenName = NATIVE_CURRENCY;
            } else {
                // Try to get token name
                try IERC20Metadata(tokenAddress).name() returns (string memory name) {
                    tokenName = name;
                } catch {
                    tokenName = TOKEN_NAME_UNSPECIFIED;
                }
            }

            // Add entry to the return variable
            availableFunds[i].tokenAddress = tokenAddress;
            availableFunds[i].tokenName = tokenName;
            availableFunds[i].availableAmount = entityFunds[tokenAddress];
        }
    }

    /**
     * @notice Withdraws the specified funds.
     *
     * Emits FundsWithdrawn event if successful.
     *
     * Reverts if:
     * - Caller is not associated with the entity id
     * - Token list length does not match amount list length
     * - Caller tries to withdraw more that they have in available funds
     * - There is nothing to withdraw
     * - Transfer of funds is not successful
     *
     * @param _destinationAddress - wallet that will receive funds
     * @param _entityId - entity id
     * @param _tokenList - list of contract addresses of tokens that are being withdrawn
     * @param _tokenAmounts - list of amounts to be withdrawn, corresponding to tokens in tokenList
     */
    function withdrawFundsInternal(
        address payable _destinationAddress,
        uint256 _entityId,
        address[] calldata _tokenList,
        uint256[] calldata _tokenAmounts
    ) internal {
        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        // Make sure that the data is complete
        require(_tokenList.length == _tokenAmounts.length, TOKEN_AMOUNT_MISMATCH);

        // Two possible options: withdraw all, or withdraw only specified tokens and amounts
        if (_tokenList.length == 0) {
            // Withdraw everything

            // Get list of all user's tokens
            address[] memory tokenList = lookups.tokenList[_entityId];

            // Make sure that at least something will be withdrawn
            require(tokenList.length != 0, NOTHING_TO_WITHDRAW);

            // Get entity's availableFunds storage pointer
            mapping(address => uint256) storage entityFunds = lookups.availableFunds[_entityId];

            // Transfer funds
            for (uint256 i = 0; i < tokenList.length; i++) {
                // Get available funds from storage
                uint256 availableFunds = entityFunds[tokenList[i]];
                FundsLib.transferFundsFromProtocol(_entityId, tokenList[i], _destinationAddress, availableFunds);
            }
        } else {
            for (uint256 i = 0; i < _tokenList.length; i++) {
                // Make sure that at least something will be withdrawn
                require(_tokenAmounts[i] > 0, NOTHING_TO_WITHDRAW);

                // Transfer funds
                FundsLib.transferFundsFromProtocol(_entityId, _tokenList[i], _destinationAddress, _tokenAmounts[i]);
            }
        }
    }
}
