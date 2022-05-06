// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { IBosonExchangeHandler } from "../../interfaces/handlers/IBosonExchangeHandler.sol";
import { IBosonAccountHandler } from "../../interfaces/handlers/IBosonAccountHandler.sol";
import { IBosonVoucher } from "../../interfaces/clients/IBosonVoucher.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { ProtocolBase } from "../bases/ProtocolBase.sol";
import { FundsLib } from "../libs/FundsLib.sol";

/**
 * @title ExchangeHandlerFacet
 *
 * @notice Handles exchanges associated with offers within the protocol
 */
contract ExchangeHandlerFacet is IBosonExchangeHandler, ProtocolBase {

    /**
     * @notice Facet Initializer
     */
    function initialize()
    public
    onlyUnInitialized(type(IBosonExchangeHandler).interfaceId)
    {
        DiamondLib.addSupportedInterface(type(IBosonExchangeHandler).interfaceId);
    }

    /**
     * @notice Commit to an offer (first step of an exchange)
     *
     * Emits an BuyerCommitted event if successful.
     * Issues a voucher to the buyer address.
     *
     * Reverts if:
     * - offerId is invalid
     * - offer has been voided
     * - offer has expired
     * - offer is not yet available for commits
     * - offer's quantity available is zero
     * - buyer address is zero
     * - buyer account is inactive
     *
     * @param _buyer - the buyer's address (caller can commit on behalf of a buyer)
     * @param _offerId - the id of the offer to commit to
     */
    function commitToOffer(
        address payable _buyer,
        uint256 _offerId
    )
    external
    override
    {
        // Make sure buyer address is not zero address
        require(_buyer != address(0), INVALID_ADDRESS);

        // Get the offer
        bool exists;
        Offer storage offer;
        (exists, offer) = fetchOffer(_offerId);

        

        // Make sure offer exists, is available, and isn't void, expired, or sold out
        require(exists, NO_SUCH_OFFER);
        require(block.timestamp >= offer.validFromDate, OFFER_NOT_AVAILABLE);
        require(!offer.voided, OFFER_HAS_BEEN_VOIDED);
        require(block.timestamp < offer.validUntilDate, OFFER_HAS_EXPIRED);
        require(offer.quantityAvailable > 0, OFFER_SOLD_OUT);

        // Find or create the account associated with the specified buyer address
        uint256 buyerId;
        Buyer storage buyer;
        (exists, buyerId) = getBuyerIdByWallet(_buyer);
        if (exists) {

            // Fetch the existing buyer account
            (,buyer) = fetchBuyer(buyerId);

            // Make sure buyer account is active
            require(buyer.active, MUST_BE_ACTIVE);

        } else {

            // get the id that will be assigned
            buyerId = protocolCounters().nextAccountId;

            // create the buyer (id is ignored)
            IBosonAccountHandler(address(this)).createBuyer(Buyer(0, _buyer, true));

            // fetch the buyer account
            (, buyer) = fetchBuyer(buyerId);

        }

        // Create and store a new exchange
        uint256 exchangeId = protocolCounters().nextExchangeId++;
        Exchange storage exchange = protocolStorage().exchanges[exchangeId];
        exchange.id = exchangeId;
        exchange.offerId = _offerId;
        exchange.buyerId = buyerId;
        exchange.state = ExchangeState.Committed;
        exchange.voucher.committedDate = block.timestamp;

        // Map the offerId to the exchangeId as one-to-many
        protocolStorage().exchangeIdsByOffer[_offerId].push(exchangeId);

        // Decrement offer's quantity available
        offer.quantityAvailable--;

        // Issue voucher
        IBosonVoucher bosonVoucher = IBosonVoucher(protocolStorage().voucherAddress);
        bosonVoucher.issueVoucher(exchangeId, buyer);

        // Notify watchers of state change
        emit BuyerCommitted(_offerId, buyerId, exchangeId, exchange);

    }

    /**
     * @notice Complete an exchange.
     *
     * Reverts if
     * - Exchange does not exist
     * - Exchange is not in redeemed state
     * - Caller is not buyer or seller's operator
     * - Caller is seller's operator and offer fulfillment period has not elapsed
     *
     * Emits
     * - ExchangeCompleted
     *
     * @param _exchangeId - the id of the exchange to complete
     */
    function completeExchange(uint256 _exchangeId)
    external
    override
    {

        // Get the exchange
        Exchange storage exchange = getValidExchange(_exchangeId);

        // Make sure the exchange is in redeemed state
        // TODO: Uncomment check for redeemed state once redeemVoucher is working
        //require(exchange.state == ExchangeState.Redeemed, INVALID_STATE_TRANSITION);

        // Get the offer, which will definitely exist
        Offer storage offer;
        (,offer) = fetchOffer(exchange.offerId);

        // Get seller id associated with caller
        bool sellerExists;
        uint256 sellerId;
        (sellerExists, sellerId) = getSellerIdByOperator(msg.sender);

        // Seller may only call after fulfillment period elapses, buyer may call any time
        if (sellerExists && offer.sellerId == sellerId) {
            // Make sure the fulfillment period has elapsed
            uint256 elapsed = block.timestamp - exchange.voucher.redeemedDate;
            require(elapsed >= offer.fulfillmentPeriodDuration, FULFILLMENT_PERIOD_NOT_ELAPSED);
        } else {
            // Is this the buyer?
            bool buyerExists;
            uint256 buyerId;
            (buyerExists, buyerId) = getBuyerIdByWallet(msg.sender);
            require(buyerExists && buyerId == exchange.buyerId, NOT_BUYER_OR_SELLER);
        }

        // Set the exchange state to completed
        exchange.state = ExchangeState.Completed;

        // Store the time the exchange was finalized
        exchange.finalizedDate = block.timestamp;

        // Notify watchers of state change
        emit ExchangeCompleted(exchange.offerId, exchange.buyerId, exchange.id);

    }

    /**
     * @notice Revoke a voucher.
     *
     * Reverts if
     * - Exchange does not exist
     * - Exchange is not in committed state
     * - Caller is not seller's operator
     *
     * Emits
     * - VoucherRevoked
     *
     * @param _exchangeId - the id of the exchange to complete
     */
    function revokeVoucher(uint256 _exchangeId)
    external
    override
    {
        // Get the exchange
        Exchange storage exchange = getValidExchange(_exchangeId);

        // Make sure the exchange exists, is in committed state
        require(exchange.state == ExchangeState.Committed, INVALID_STATE_TRANSITION);

        // Get the offer, which will definitely exist
        Offer storage offer;
        (,offer) = fetchOffer(exchange.offerId);

        // Get seller id associated with caller
        bool sellerExists;
        uint256 sellerId;
        (sellerExists, sellerId) = getSellerIdByOperator(msg.sender);

        // Only seller's operator may call
        require(sellerExists && offer.sellerId == sellerId, NOT_OPERATOR);

        // Set the exchange state to Revoked
        exchange.state = ExchangeState.Revoked;

        // Store the time the exchange was finalized
        exchange.finalizedDate = block.timestamp;

        // Burn voucher
        IBosonVoucher bosonVoucher = IBosonVoucher(protocolStorage().voucherAddress);
        bosonVoucher.burnVoucher(_exchangeId);

        // Notify watchers of state change
        emit VoucherRevoked(offer.id, _exchangeId, msg.sender);

    }

    /**
     * @notice Is the given exchange in a finalized state?
     *
     * Returns true if
     * - Exchange state is Revoked, Canceled, or Completed
     * - Exchange is disputed and dispute state is Retracted, Resolved, or Decided
     *
     * @param _exchangeId - the id of the exchange to check
     * @return exists - true if the exchange exists
     * @return isFinalized - true if the exchange is finalized
     */
    function isExchangeFinalized(uint256 _exchangeId)
    external
    view
    returns(bool exists, bool isFinalized) {
        Exchange storage exchange;

        // Get the exchange
        (exists, exchange) = fetchExchange(_exchangeId);

        // Bail if no such exchange
        if (!exists) return (false, false);

        // Derive isFinalized from exchange state or dispute state
        if (exchange.state == ExchangeState.Disputed) {
            // Get the dispute
            Dispute storage dispute;
            (, dispute) = fetchDispute(_exchangeId);

            // Check for finalized dispute state
            isFinalized = (
                dispute.state == DisputeState.Retracted ||
                dispute.state == DisputeState.Resolved ||
                dispute.state == DisputeState.Decided
            );
        } else {
            // Check for finalized exchange state
            isFinalized = (
                exchange.state == ExchangeState.Revoked ||
                exchange.state == ExchangeState.Canceled ||
                exchange.state == ExchangeState.Completed
            );
        }
    }

    /**
     * @notice Gets the details about a given exchange.
     *
     * @param _exchangeId - the id of the exchange to check
     * @return exists - true if the exchange exists
     * @return exchange - the exchange details. See {BosonTypes.Exchange}
     */
    function getExchange(uint256 _exchangeId)
    external
    view
    returns(bool exists, Exchange memory exchange) {
        return fetchExchange(_exchangeId);
    }

    /**
     * @notice Gets the state of a given exchange.
     *
     * @param _exchangeId - the id of the exchange to check
     * @return exists - true if the exchange exists
     * @return state - the exchange state. See {BosonTypes.ExchangeStates}
     */
    function getExchangeState(uint256 _exchangeId)
    external
    view
    returns(bool exists, ExchangeState state) {
        Exchange memory exchange;
        (exists, exchange) = fetchExchange(_exchangeId);
        if (exists) state = exchange.state;
    }

    /**
     * @notice Gets the Id that will be assigned to the next exchange.
     *
     *  Does not increment the counter.
     *
     * @return nextExchangeId - the next exchange Id
     */
    function getNextExchangeId() external view returns (uint256 nextExchangeId) {
        nextExchangeId = protocolCounters().nextExchangeId;
    }

    /**
     * @notice Get a valid exchange
     *
     * Reverts if
     * - Exchange does not exist
     *
     * @param _exchangeId - the id of the exchange to complete
     * @return exchange - the exchange
     */
    function getValidExchange(uint256 _exchangeId)
    internal
    view
    returns(Exchange storage exchange)
    {
        // Get the exchange
        bool exchangeExists;
        (exchangeExists, exchange) = fetchExchange(_exchangeId);

        // Make sure the exchange exists
        require(exchangeExists, NO_SUCH_EXCHANGE);

    }
}