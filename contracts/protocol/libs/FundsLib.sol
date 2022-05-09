// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {NATIVE_NOT_ALLOWED, TOKEN_TRANSFER_FAILED, INSUFFICIENT_VALUE_SENT, INSUFFICIENT_AVAILABLE_FUNDS} from "../../domain/BosonConstants.sol";
import {BosonTypes} from "../../domain/BosonTypes.sol";
import {ProtocolLib} from "../libs/ProtocolLib.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title FundsLib
 *
 * @dev 
 */
library FundsLib {
    event FundsEnucumbered(address indexed exchangeToken, uint256 amount);
    
    /**
     * @notice Takes in the exchange id and encumbers buyer's and seller's funds during the commitToOffer
     *
     * Reverts if:
     * - offer price is in native token and buyer caller does not send enough
     * - offer price is in some ERC20 token and caller also send native currency
     * - if contract at token address does not support erc20 function transferFrom
     * - if calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - if seller has less funds available than sellerDeposit
     *
     * @param _offerId - id of the offer with the details
     */
    function encumberFunds(uint256 _offerId) internal {
        // Load protocol storage
        ProtocolLib.ProtocolStorage storage ps = ProtocolLib.protocolStorage();

        // fetch offer to get the exchange token, price and seller 
        // this will be called only from commitToOffer so we expecte that exchange and consequently offer actually exist
        BosonTypes.Offer storage offer = ps.offers[_offerId];
        address exchangeToken = offer.exchangeToken;
        uint256 price = offer.price;

        // validate buyer inputs
        if (exchangeToken == address(0)) {
            // if transfer is in native currency, msg.value must match offer price
            require(msg.value == price, INSUFFICIENT_VALUE_SENT);
        } else {
            // when price is in erc20 token, transferring native currency is not allowed
            require(msg.value == 0, NATIVE_NOT_ALLOWED);

            // if transfer is in ERC20 token, try to transfer the amount from buyer to the protocol
            transferFundsToProtocol(exchangeToken, price);
        }

        // make sure that seller has enough funds in the pool and reduce the available funds
        uint256 sellerId = offer.sellerId;
        uint256 sellerDeposit = offer.sellerDeposit;
        uint256 availableFunds = ps.availableFunds[sellerId][exchangeToken];
        require(availableFunds >= sellerDeposit, INSUFFICIENT_AVAILABLE_FUNDS);
        ps.availableFunds[sellerId][exchangeToken] = availableFunds - sellerDeposit;

        // if availableFunds are totally emptied, the token address is removed from the seller's tokenList
        if (availableFunds == sellerDeposit) {
            uint len = ps.tokenList[sellerId].length;
            for (uint i = 0; i < len; i++) {
                if (ps.tokenList[sellerId][i] == exchangeToken) {
                    ps.tokenList[sellerId][i] = ps.tokenList[sellerId][len-1];
                    ps.tokenList[sellerId].pop();
                }
            }
        }

        emit FundsEnucumbered(exchangeToken, price + sellerDeposit);
    }

    /**
     * @notice Tries to transfer tokens from the caller to the protocol
     *
     * Reverts if:
     * - if contract at token address does not support erc20 function transferFrom
     * - if calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     *
     * @param _tokenAddress - address of the token to be transferred
     * @param _amount - amount to be transferred
     */
    function transferFundsToProtocol(address _tokenAddress, uint256 _amount) internal {
        // transfer ERC20 tokens from the caller
        try IERC20(_tokenAddress).transferFrom(msg.sender, address(this), _amount)  {
        } catch (bytes memory error) {
            string memory reason = error.length == 0 ? TOKEN_TRANSFER_FAILED : string(error);
            revert(reason);
        }
    }
}
