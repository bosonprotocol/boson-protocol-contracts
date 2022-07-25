// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { NATIVE_NOT_ALLOWED, TOKEN_TRANSFER_FAILED, INSUFFICIENT_VALUE_SENT, INSUFFICIENT_AVAILABLE_FUNDS } from "../../domain/BosonConstants.sol";
import { BosonTypes } from "../../domain/BosonTypes.sol";
import { EIP712Lib } from "../libs/EIP712Lib.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title FundsLib
 *
 * @dev
 */
library FundsLib {
    event FundsEncumbered(
        uint256 indexed entityId,
        address indexed exchangeToken,
        uint256 amount,
        address indexed executedBy
    );
    event FundsReleased(
        uint256 indexed exchangeId,
        uint256 indexed entityId,
        address indexed exchangeToken,
        uint256 amount,
        address executedBy
    );
    event ProtocolFeeCollected(
        uint256 indexed exchangeId,
        address indexed exchangeToken,
        uint256 amount,
        address indexed executedBy
    );
    event FundsWithdrawn(
        uint256 indexed sellerId,
        address indexed withdrawnTo,
        address indexed tokenAddress,
        uint256 amount,
        address executedBy
    );

    /**
     * @notice Takes in the offer id and buyer id and encumbers buyer's and seller's funds during the commitToOffer
     *
     * Reverts if:
     * - offer price is in native token and buyer caller does not send enough
     * - offer price is in some ERC20 token and caller also send native currency
     * - if contract at token address does not support erc20 function transferFrom
     * - if calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - if seller has less funds available than sellerDeposit
     *
     * @param _offerId - id of the offer with the details
     * @param _buyerId - id of the buyer
     */
    function encumberFunds(uint256 _offerId, uint256 _buyerId) internal {
        // Load protocol entities storage
        ProtocolLib.ProtocolEntities storage pe = ProtocolLib.protocolEntities();

        // fetch offer to get the exchange token, price and seller
        // this will be called only from commitToOffer so we expect that exchange actually exist
        BosonTypes.Offer storage offer = pe.offers[_offerId];
        address exchangeToken = offer.exchangeToken;
        uint256 price = offer.price;

        // validate buyer inputs
        validateIncomingPayment(exchangeToken, price);

        // decrease available funds
        uint256 sellerId = offer.sellerId;
        uint256 sellerDeposit = offer.sellerDeposit;
        decreaseAvailableFunds(sellerId, exchangeToken, sellerDeposit);

        // notify external observers
        emit FundsEncumbered(_buyerId, exchangeToken, price, EIP712Lib.msgSender());
        emit FundsEncumbered(sellerId, exchangeToken, sellerDeposit, EIP712Lib.msgSender());
    }

    /**
     * @notice Validates that incoming payments matches expectation. If token is a native currency, just make sure
     * msg.value is correct. If token is ERC20, transfer the value from the sender to the protocol
     *
     * Reverts if:
     * - offer price is in native token and buyer caller does not send enough
     * - offer price is in some ERC20 token and caller also send native currency
     * - if contract at token address does not support erc20 function transferFrom
     * - if calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     *
     * @param _exchangeToken - address of the token (0x for native currency)
     * @param _value - value expected to receive
     */
    function validateIncomingPayment(address _exchangeToken, uint256 _value) internal {
        if (_exchangeToken == address(0)) {
            // if transfer is in the native currency, msg.value must match offer price
            require(msg.value == _value, INSUFFICIENT_VALUE_SENT);
        } else {
            // when price is in an erc20 token, transferring the native currency is not allowed
            require(msg.value == 0, NATIVE_NOT_ALLOWED);

            // if transfer is in ERC20 token, try to transfer the amount from buyer to the protocol
            transferFundsToProtocol(_exchangeToken, _value);
        }
    }

    /**
     * @notice Takes in the exchange id and releases the funds to buyer and seller, depending on the state of the exchange.
     * It is called only from finalizeExchange and finalizeDispute
     *
     * @param _exchangeId - exchange id
     */
    function releaseFunds(uint256 _exchangeId) internal {
        // Load protocol entities storage
        ProtocolLib.ProtocolEntities storage pe = ProtocolLib.protocolEntities();

        // Get the exchange and its state
        // Since this should be called only from certain functions from exchangeHandler and disputeHandler
        // exhange must exist and be in a completed state, so that's not checked explicitly
        BosonTypes.Exchange storage exchange = pe.exchanges[_exchangeId];
        BosonTypes.ExchangeState exchangeState = exchange.state;

        // Get offer from storage to get the details about sellerDeposit, price, sellerId, exchangeToken and buyerCancelPenalty
        BosonTypes.Offer storage offer = pe.offers[exchange.offerId];
        uint256 sellerDeposit = offer.sellerDeposit;
        uint256 price = offer.price;

        // sum of price and sellerDeposit occurs multiple times
        uint256 pot = price + sellerDeposit;

        // calculate the payoffs depending on state exchange is in
        uint256 sellerPayoff;
        uint256 buyerPayoff;
        uint256 protocolFee;
        if (exchangeState == BosonTypes.ExchangeState.Completed) {
            // COMPLETED
            protocolFee = offer.protocolFee;
            // buyerPayoff is 0
            sellerPayoff = pot - protocolFee;
        } else if (exchangeState == BosonTypes.ExchangeState.Revoked) {
            // REVOKED
            // sellerPayoff is 0
            buyerPayoff = pot;
        } else if (exchangeState == BosonTypes.ExchangeState.Canceled) {
            // CANCELED
            uint256 buyerCancelPenalty = offer.buyerCancelPenalty;
            sellerPayoff = sellerDeposit + buyerCancelPenalty;
            buyerPayoff = price - buyerCancelPenalty;
        } else {
            // DISPUTED
            // get the information about the dispute, which must exist
            BosonTypes.Dispute storage dispute = pe.disputes[_exchangeId];
            BosonTypes.DisputeState disputeState = dispute.state;

            if (disputeState == BosonTypes.DisputeState.Retracted) {
                // RETRACTED - same as "COMPLETED"
                protocolFee = offer.protocolFee;
                // buyerPayoff is 0
                sellerPayoff = pot - protocolFee;
            } else if (disputeState == BosonTypes.DisputeState.Refused) {
                // REFUSED
                sellerPayoff = sellerDeposit;
                buyerPayoff = price;
            } else {
                // RESOLVED or DECIDED
                buyerPayoff = (pot * dispute.buyerPercent) / 10000;
                sellerPayoff = pot - buyerPayoff;
            }
        }

        // Store payoffs to availablefunds and notify the external observers
        address exchangeToken = offer.exchangeToken;
        uint256 sellerId = offer.sellerId;
        uint256 buyerId = exchange.buyerId;
        if (sellerPayoff > 0) {
            increaseAvailableFunds(sellerId, exchangeToken, sellerPayoff);
            emit FundsReleased(_exchangeId, sellerId, exchangeToken, sellerPayoff, EIP712Lib.msgSender());
        }
        if (buyerPayoff > 0) {
            increaseAvailableFunds(buyerId, exchangeToken, buyerPayoff);
            emit FundsReleased(_exchangeId, buyerId, exchangeToken, buyerPayoff, EIP712Lib.msgSender());
        }
        if (protocolFee > 0) {
            increaseAvailableFunds(0, exchangeToken, protocolFee);
            emit ProtocolFeeCollected(_exchangeId, exchangeToken, protocolFee, EIP712Lib.msgSender());
        }
    }

    /**
     * @notice Tries to transfer tokens from the caller to the protocol
     *
     * Reverts if:
     * - contract at token address does not support erc20 function transferFrom
     * - calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     *
     * @param _tokenAddress - address of the token to be transferred
     * @param _amount - amount to be transferred
     */
    function transferFundsToProtocol(address _tokenAddress, uint256 _amount) internal {
        // transfer ERC20 tokens from the caller
        try IERC20(_tokenAddress).transferFrom(EIP712Lib.msgSender(), address(this), _amount) {} catch (
            bytes memory error
        ) {
            string memory reason = error.length == 0 ? TOKEN_TRANSFER_FAILED : string(error);
            revert(reason);
        }
    }

    /**
     * @notice Tries to transfer native currency or tokens from the protocol to the recepient
     *
     * Reverts if:
     * - transfer of native currency is not successulf (i.e. recepient is a contract which reverted)
     * - contract at token address does not support erc20 function transfer
     * - available funds is less than amount to be decreased
     *
     * @param _tokenAddress - address of the token to be transferred
     * @param _to - address of the recepient
     * @param _amount - amount to be transferred
     */
    function transferFundsFromProtocol(
        uint256 _entityId,
        address _tokenAddress,
        address payable _to,
        uint256 _amount
    ) internal {
        // first decrease the amount to prevent the reentrancy attack
        FundsLib.decreaseAvailableFunds(_entityId, _tokenAddress, _amount);

        // try to transfer the funds
        if (_tokenAddress == address(0)) {
            // transfer native currency
            (bool success, ) = _to.call{ value: _amount }("");
            require(success, TOKEN_TRANSFER_FAILED);
        } else {
            try IERC20(_tokenAddress).transfer(_to, _amount) {} catch (bytes memory error) {
                string memory reason = error.length == 0 ? TOKEN_TRANSFER_FAILED : string(error);
                revert(reason);
            }
        }

        // notify the external observers
        emit FundsWithdrawn(_entityId, _to, _tokenAddress, _amount, EIP712Lib.msgSender());
    }

    /**
     * @notice Increases the amount, available to withdraw or use as a seller deposit
     *
     * @param _entityId - seller or buyer id, or 0 for protocol
     * @param _tokenAddress - funds contract address or zero address for native currency
     * @param _amount - amount to be credited
     */

    function increaseAvailableFunds(
        uint256 _entityId,
        address _tokenAddress,
        uint256 _amount
    ) internal {
        ProtocolLib.ProtocolLookups storage pl = ProtocolLib.protocolLookups();

        // if the current amount of token is 0, the token address must be added to the token list
        if (pl.availableFunds[_entityId][_tokenAddress] == 0) {
            pl.tokenList[_entityId].push(_tokenAddress);
        }

        // update the available funds
        pl.availableFunds[_entityId][_tokenAddress] += _amount;
    }

    /**
     * @notice Decreases the amount, available to withdraw or use as a seller deposit
     *
     * Reverts if:
     * - available funds is less than amount to be decreased
     *
     * @param _entityId - seller or buyer id, or 0 for protocol
     * @param _tokenAddress - funds contract address or zero address for native currency
     * @param _amount - amount to be taken away
     */
    function decreaseAvailableFunds(
        uint256 _entityId,
        address _tokenAddress,
        uint256 _amount
    ) internal {
        ProtocolLib.ProtocolLookups storage pl = ProtocolLib.protocolLookups();

        // get available fnds from storage
        uint256 availableFunds = pl.availableFunds[_entityId][_tokenAddress];

        // make sure that seller has enough funds in the pool and reduce the available funds
        require(availableFunds >= _amount, INSUFFICIENT_AVAILABLE_FUNDS);
        pl.availableFunds[_entityId][_tokenAddress] = availableFunds - _amount;

        // if availableFunds are totally emptied, the token address is removed from the seller's tokenList
        if (availableFunds == _amount) {
            uint256 len = pl.tokenList[_entityId].length;
            for (uint256 i = 0; i < len; i++) {
                if (pl.tokenList[_entityId][i] == _tokenAddress) {
                    pl.tokenList[_entityId][i] = pl.tokenList[_entityId][len - 1];
                    pl.tokenList[_entityId].pop();
                    break;
                }
            }
        }
    }
}
