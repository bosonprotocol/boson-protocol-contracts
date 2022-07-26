// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../../domain/BosonConstants.sol";
import { IBosonFundsHandler } from "../../interfaces/handlers/IBosonFundsHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { ProtocolBase } from "../bases/ProtocolBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { FundsLib } from "../libs/FundsLib.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/**
 * @title FundsHandlerFacet
 *
 * @notice Handles custody and withdrawal of buyer and seller funds
 */
contract FundsHandlerFacet is IBosonFundsHandler, ProtocolBase {
    /**
     * @notice Facet Initializer
     */
    function initialize() public onlyUnInitialized(type(IBosonFundsHandler).interfaceId) {
        DiamondLib.addSupportedInterface(type(IBosonFundsHandler).interfaceId);
    }

    /**
     * @notice Receives funds from the caller and stores it to the seller id, so they can be used during the commitToOffer
     *
     * Reverts if:
     * - seller id does not exist
     * - it receives some native currency (e.g. ETH), but token address is not zero
     * - it receives some native currency (e.g. ETH), and the amount does not match msg.value
     * - if contract at token address does not support erc20 function transferFrom
     * - if calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     *
     * @param _sellerId - id of the seller that will be credited
     * @param _tokenAddress - contract address of token that is being deposited (0 for native currency)
     * @param _amount - amount to be credited
     */
    function depositFunds(
        uint256 _sellerId,
        address _tokenAddress,
        uint256 _amount
    ) external payable override {
        //Check Seller exists in sellers mapping
        (bool exists, ) = fetchSeller(_sellerId);

        //Seller must exist
        require(exists, NO_SUCH_SELLER);

        if (msg.value != 0) {
            // receiving native currency
            require(_tokenAddress == address(0), NATIVE_WRONG_ADDRESS);
            require(_amount == msg.value, NATIVE_WRONG_AMOUNT);
        } else {
            // transfer tokens from the caller
            FundsLib.transferFundsToProtocol(_tokenAddress, _amount);
        }

        // increase available funds
        FundsLib.increaseAvailableFunds(_sellerId, _tokenAddress, _amount);

        emit FundsDeposited(_sellerId, msgSender(), _tokenAddress, _amount);
    }

    /**
     * @notice For a given seller or buyer id it returns the information about the funds that can use as a sellerDeposit and/or be withdrawn
     *
     * @param _entityId - seller or buyer id to check
     * @return availableFunds - list of token addresses, token names and amount that can be used as a seller deposit or be withdrawn
     */
    function getAvailableFunds(uint256 _entityId) external view override returns (Funds[] memory availableFunds) {
        // get list of token addresses for the entity
        address[] memory tokenList = protocolLookups().tokenList[_entityId];
        availableFunds = new Funds[](tokenList.length);

        for (uint256 i = 0; i < tokenList.length; i++) {
            address tokenAddress = tokenList[i];
            string memory tokenName;

            if (tokenAddress == address(0)) {
                // it tokenAddress is 0, it represents the native currency
                tokenName = NATIVE_CURRENCY;
            } else {
                // try to get token name
                try IERC20Metadata(tokenAddress).name() returns (string memory name) {
                    tokenName = name;
                } catch {
                    tokenName = TOKEN_NAME_UNSPECIFIED;
                }
            }

            // retrieve available amount from the stroage
            uint256 availableAmount = protocolLookups().availableFunds[_entityId][tokenAddress];

            // add entry to the return variable
            availableFunds[i] = Funds(tokenAddress, tokenName, availableAmount);
        }
    }

    /**
     * @notice Withdraw the specified funds
     *
     * Reverts if:
     * - caller is not associated with the entity id
     * - token list length does not match amount list length
     * - token list length exceeds the maximum allowed number of tokens
     * - caller tries to withdraw more that they have in available funds
     * - there is nothing to withdraw
     * - transfer of funds is not succesful
     *
     * @param _entityId - seller or buyer id
     * @param _tokenList - list of contract addresses of tokens that are being withdrawn
     * @param _tokenAmounts - list of amounts to be withdrawn, corresponding to tokens in tokenList
     */
    function withdrawFunds(
        uint256 _entityId,
        address[] calldata _tokenList,
        uint256[] calldata _tokenAmounts
    ) external override {
        // address that will receive the funds
        address payable destinationAddress;

        // first check if the caller is a buyer
        (bool exists, uint256 callerId) = getBuyerIdByWallet(msgSender());
        if (exists && callerId == _entityId) {
            // caller is a buyer
            destinationAddress = payable(msgSender());
        } else {
            // check if the caller is a clerk
            (exists, callerId) = getSellerIdByClerk(msgSender());
            if (exists && callerId == _entityId) {
                // caller is a clerk. In this case funds are transferred to the treasury address
                (, Seller storage seller) = fetchSeller(callerId);
                destinationAddress = seller.treasury;
            } else {
                // in this branch, caller is neither buyer or clerk or does not match the _entityId
                revert(NOT_AUTHORIZED);
            }
        }

        withdrawFundsInternal(destinationAddress, _entityId, _tokenList, _tokenAmounts);
    }

    /**
     * @notice Withdraw the protocol fees
     *
     * Reverts if:
     * - caller does not have the FEE_COLLECTOR role
     * - token list length does not match amount list length
     * - token list length exceeds the maximum allowed number of tokens
     * - caller tries to withdraw more that they have in available funds
     * - there is nothing to withdraw
     * - transfer of funds is not succesful
     *
     * @param _tokenList - list of contract addresses of tokens that are being withdrawn
     * @param _tokenAmounts - list of amounts to be withdrawn, corresponding to tokens in tokenList
     */
    function withdrawProtocolFees(address[] calldata _tokenList, uint256[] calldata _tokenAmounts)
        external
        override
        onlyRole(FEE_COLLECTOR)
    {
        // withdraw the funds
        withdrawFundsInternal(payable(msgSender()), 0, _tokenList, _tokenAmounts);
    }

    /**
     * @notice Withdraw the specified funds
     *
     * Reverts if:
     * - caller is not associated with the entity id
     * - token list length does not match amount list length
     * - token list length exceeds the maximum allowed number of tokens
     * - caller tries to withdraw more that they have in available funds
     * - there is nothing to withdraw
     * - transfer of funds is not succesful
     *
     * @param _destinationAddress - wallet that will receive funds
     * @param _entityId - seller or buyer id
     * @param _tokenList - list of contract addresses of tokens that are being withdrawn
     * @param _tokenAmounts - list of amounts to be withdrawn, corresponding to tokens in tokenList
     */
    function withdrawFundsInternal(
        address payable _destinationAddress,
        uint256 _entityId,
        address[] calldata _tokenList,
        uint256[] calldata _tokenAmounts
    ) internal {
        // make sure that the data is complete
        require(_tokenList.length == _tokenAmounts.length, TOKEN_AMOUNT_MISMATCH);

        // limit maximum number of tokens to avoid running into block gas limit in a loop
        uint256 maxTokensPerWithdrawal = protocolLimits().maxTokensPerWithdrawal;
        require(_tokenList.length <= maxTokensPerWithdrawal, TOO_MANY_TOKENS);

        // two possible options: withdraw all, or withdraw only specified tokens and amounts
        if (_tokenList.length == 0) {
            // withdraw everything

            // get list of all user's tokens
            address[] memory tokenList = protocolLookups().tokenList[_entityId];

            // make sure that at least something will be withdrawn
            require(tokenList.length != 0, NOTHING_TO_WITHDRAW);

            // make sure that tokenList is not too long
            uint256 len = maxTokensPerWithdrawal <= tokenList.length ? maxTokensPerWithdrawal : tokenList.length;

            for (uint256 i = 0; i < len; i++) {
                // get available fnds from storage
                uint256 availableFunds = protocolLookups().availableFunds[_entityId][tokenList[i]];
                FundsLib.transferFundsFromProtocol(_entityId, tokenList[i], _destinationAddress, availableFunds);
            }
        } else {
            for (uint256 i = 0; i < _tokenList.length; i++) {
                // make sure that at least something will be withdrawn
                require(_tokenAmounts[i] > 0, NOTHING_TO_WITHDRAW);
                FundsLib.transferFundsFromProtocol(_entityId, _tokenList[i], _destinationAddress, _tokenAmounts[i]);
            }
        }
    }
}
