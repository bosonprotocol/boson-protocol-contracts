// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import "../../domain/BosonConstants.sol";
import { IBosonFundsHandler } from "../../interfaces/handlers/IBosonFundsHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { ProtocolBase } from "../bases/ProtocolBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
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
     * @notice Receives funds from the caller , maps funds to the entity id and stores them so they can be used during the commitToOffer.
     *
     * Emits FundsDeposited event if successful.
     *
     * Reverts if:
     * - The funds region of protocol is paused
     * - Amount to deposit is zero
     * - Entity id is neither a seller nor a buyer
     * - It receives some native currency (e.g. ETH), but token address is not zero
     * - It receives some native currency (e.g. ETH), and the amount does not match msg.value
     * - It receives no native currency, but token address is zero
     * - Contract at token address does not support ERC20 function transferFrom
     * - Calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - Received ERC20 token amount differs from the expected value
     *
     * @param _entityId - id of the entity that will be credited
     * @param _tokenAddress - contract address of token that is being deposited (0 for native currency)
     * @param _amount - amount to be credited
     */
    function depositFunds(
        uint256 _entityId,
        address _tokenAddress,
        uint256 _amount
    ) external payable override fundsNotPaused nonReentrant {
        if (_amount == 0) revert ZeroDepositNotAllowed();

        // First check if entity is a seller
        (bool sellerExists, , ) = fetchSeller(_entityId);
        (bool buyerExists, ) = fetchBuyer(_entityId);

        if (!sellerExists && !buyerExists) revert NoSuchEntity();

        if (msg.value != 0) {
            // Receiving native currency
            if (_tokenAddress != address(0)) revert NativeWrongAddress();
            if (_amount != msg.value) revert NativeWrongAmount();
        } else {
            // Transfer tokens from the caller
            if (_tokenAddress == address(0)) revert InvalidAddress();
            transferFundsIn(_tokenAddress, _amount);
        }

        // Increase available funds
        increaseAvailableFunds(_entityId, _tokenAddress, _amount);

        emit FundsDeposited(_entityId, _msgSender(), _tokenAddress, _amount);
    }

    /**
     * @notice Withdraws the specified funds. Can be called for seller, buyer, agent or royalty recipient.
     *
     * Emits FundsWithdrawn event if successful.
     *
     * Reverts if:
     * - The funds region of protocol is paused
     * - Caller is not associated with the entity id
     * - Token list length does not match amount list length
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
        address payable destinationAddress = getDestinationAddress(_entityId);

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
     * @notice Returns list of addresses for which the entity has funds available.
     * If the list is too long, it can be retrieved in chunks by using `getTokenListPaginated` and specifying _limit and _offset.
     *
     * @param _entityId - id of entity for which availability of funds should be checked
     * @return tokenList - list of token addresses
     */
    function getTokenList(uint256 _entityId) external view override returns (address[] memory tokenList) {
        return protocolLookups().tokenList[_entityId];
    }

    /**
     * @notice Returns list of addresses for which the entity has funds available.
     *
     * @param _entityId - id of entity for which availability of funds should be checked
     * @param _limit - the maximum number of token addresses that should be returned starting from the index defined by `_offset`. If `_offset` + `_limit` exceeds total tokens, `_limit` is adjusted to return all remaining tokens.
     * @param _offset - the starting index from which to return token addresses. If `_offset` is greater than or equal to total tokens, an empty list is returned.
     * @return tokenList - list of token addresses
     */
    function getTokenListPaginated(
        uint256 _entityId,
        uint256 _limit,
        uint256 _offset
    ) external view override returns (address[] memory tokenList) {
        address[] storage tokens = protocolLookups().tokenList[_entityId];
        uint256 tokenCount = tokens.length;

        if (_offset >= tokenCount) {
            return new address[](0);
        } else if (_offset + _limit > tokenCount) {
            _limit = tokenCount - _offset;
        }

        tokenList = new address[](_limit);

        for (uint256 i = 0; i < _limit; ) {
            tokenList[i] = tokens[_offset++];

            unchecked {
                i++;
            }
        }

        return tokenList;
    }

    /**
     * @notice Returns the information about the funds that an entity can use as a sellerDeposit and/or withdraw from the protocol.
     * It tries to get information about all tokens that the entity has in availableFunds storage.
     * If the token list is too long, this call may run out of gas. In this case, the caller should use the function `getAvailableFunds` and pass the token list.
     *
     * @param _entityId - id of entity for which availability of funds should be checked
     * @return availableFunds - list of token addresses, token names and amount that can be used as a seller deposit or be withdrawn
     */
    function getAllAvailableFunds(uint256 _entityId) external view override returns (Funds[] memory availableFunds) {
        // get list of token addresses for the entity
        address[] memory tokenList = protocolLookups().tokenList[_entityId];
        return getAvailableFunds(_entityId, tokenList);
    }

    /**
     * @notice Returns the information about the funds that an entity can use as a sellerDeposit and/or withdraw from the protocol.
     * To get a list of tokens that the entity has in availableFunds storage, use the function `getTokenList`.
     *
     * @param _entityId - id of entity for which availability of funds should be checked
     * @param _tokenList - list of tokens addresses to get available funds
     * @return availableFunds - list of token addresses, token names and amount that can be used as a seller deposit or be withdrawn
     */
    function getAvailableFunds(
        uint256 _entityId,
        address[] memory _tokenList
    ) public view override returns (Funds[] memory availableFunds) {
        availableFunds = new Funds[](_tokenList.length);

        // Get entity's availableFunds storage pointer
        mapping(address => uint256) storage entityFunds = protocolLookups().availableFunds[_entityId];

        for (uint256 i = 0; i < _tokenList.length; ) {
            address tokenAddress = _tokenList[i];
            string memory tokenName;

            if (tokenAddress == address(0)) {
                // If tokenAddress is 0, it represents the native currency
                tokenName = NATIVE_CURRENCY;
            } else {
                // Try to get token name. Typically, name consumes less than 30,000 gas, but we leave some extra gas just in case
                try IERC20Metadata(tokenAddress).name{ gas: 40000 }() returns (string memory name) {
                    tokenName = name;
                } catch {
                    tokenName = TOKEN_NAME_UNSPECIFIED;
                }
            }

            // Add entry to the return variable
            availableFunds[i].tokenAddress = tokenAddress;
            availableFunds[i].tokenName = tokenName;
            availableFunds[i].availableAmount = entityFunds[tokenAddress];

            unchecked {
                i++;
            }
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
        if (_tokenList.length != _tokenAmounts.length) revert TokenAmountMismatch();

        // Two possible options: withdraw all, or withdraw only specified tokens and amounts
        if (_tokenList.length == 0) {
            // Withdraw everything

            // Get list of all user's tokens
            address[] memory tokenList = lookups.tokenList[_entityId];

            // Make sure that at least something will be withdrawn
            if (tokenList.length == 0) revert NothingToWithdraw();

            // Get entity's availableFunds storage pointer
            mapping(address => uint256) storage entityFunds = lookups.availableFunds[_entityId];

            // Transfer funds
            for (uint256 i = 0; i < tokenList.length; ) {
                // Get available funds from storage
                uint256 availableFunds = entityFunds[tokenList[i]];
                transferFundsOut(_entityId, tokenList[i], _destinationAddress, availableFunds);

                unchecked {
                    i++;
                }
            }
        } else {
            for (uint256 i = 0; i < _tokenList.length; ) {
                // Make sure that at least something will be withdrawn
                if (_tokenAmounts[i] == 0) revert NothingToWithdraw();

                // Transfer funds
                transferFundsOut(_entityId, _tokenList[i], _destinationAddress, _tokenAmounts[i]);

                unchecked {
                    i++;
                }
            }
        }
    }

    /**
     * @notice For a given entity id, it returns the address, where the funds are withdrawn.
     *
     * Reverts if:
     * - Caller is not associated with the entity id
     *
     * @param _entityId - id of entity for which funds should be withdrawn
     * @return destinationAddress - address where the funds are withdrawn
     */
    function getDestinationAddress(uint256 _entityId) internal view returns (address payable destinationAddress) {
        address payable sender = payable(_msgSender());

        // First check if the caller is a buyer
        (bool exists, uint256 callerId) = getBuyerIdByWallet(sender);
        if (exists && callerId == _entityId) {
            // Caller is a buyer
            return sender;
        }

        // Check if the caller is an assistant
        (exists, callerId) = getSellerIdByAssistant(sender);
        if (exists && callerId == _entityId) {
            // Caller is an assistant. In this case funds are transferred to the treasury address
            (, Seller storage seller, ) = fetchSeller(callerId);
            return seller.treasury;
        }

        (exists, callerId) = getAgentIdByWallet(sender);
        if (exists && callerId == _entityId) {
            // Caller is an agent
            return sender;
        }

        callerId = protocolLookups().royaltyRecipientIdByWallet[sender];
        if (callerId > 0 && callerId == _entityId) {
            // Caller is a royalty recipient
            return sender;
        }

        // In this branch, caller is neither buyer, assistant or agent or does not match the _entityId
        revert NotAuthorized();
    }
}
