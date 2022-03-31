// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { IBosonExchangeHandler } from "../../interfaces/IBosonExchangeHandler.sol";
import { IBosonAccountHandler } from "../../interfaces/IBosonAccountHandler.sol";
import { IBosonVoucher } from "../../interfaces/IBosonVoucher.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { ProtocolBase } from "../ProtocolBase.sol";
import { ProtocolLib } from "../ProtocolLib.sol";

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
        bool exists;
        Offer storage offer;

        // Get the offer
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
        uint256 exchangeId = protocolCounters().nextAccountId++;
        Exchange storage exchange = protocolStorage().exchanges[exchangeId];
        exchange.offerId = _offerId;
        exchange.buyerId = buyerId;
        exchange.state = ExchangeState.Committed;

        // Decrement offer's quantity available
        offer.quantityAvailable--;

        // Issue voucher
        IBosonVoucher bosonVoucher = IBosonVoucher(protocolStorage().voucherAddress);
        bosonVoucher.issueVoucher(exchangeId, buyer);

        // Notify watchers of state change
        emit BuyerCommitted(_offerId, buyerId, exchangeId, exchange);

    }

    /**
     * @notice Gets the details about a given exchange.
     *
     * @param _exchangeId - the id of the exchange to check
     * @return exists - the exchange exists
     * @return exchange - the exchange details. See {BosonTypes.Exchange}
     */
    function getExchange(uint256 _exchangeId)
    external
    view
    returns(bool exists, Exchange memory exchange) {
        return fetchExchange(_exchangeId);
    }

}