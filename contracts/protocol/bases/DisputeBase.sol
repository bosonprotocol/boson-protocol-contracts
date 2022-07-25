// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IBosonDisputeEvents } from "../../interfaces/events/IBosonDisputeEvents.sol";
import { ProtocolBase } from "./../bases/ProtocolBase.sol";
import { ProtocolLib } from "./../libs/ProtocolLib.sol";

/**
 *
 * @title DisputeBase
 * @dev Provides methods for dispute that can be shared accross facets
 */
contract DisputeBase is ProtocolBase, IBosonDisputeEvents {
    /**
     * @notice Raise a dispute
     *
     *
     * Reverts if:
     * - caller does not hold a voucher for the given exchange id
     * - exchange does not exist
     * - the complaint is blank
     * - exchange is not in a redeemed state
     * - fulfillment period has elapsed already
     *
     * @param exchange - the exchange
     * @param _complaint - the buyer's or protocol complaint description
     * @param sellerId - the seller id
     */
    function raiseDisputeInternal(
        Exchange storage exchange,
        string memory _complaint,
        uint256 sellerId
    ) internal {
        // Buyer must provide a reason to dispute
        require(bytes(_complaint).length > 0, COMPLAINT_MISSING);

        // Make sure the fulfillment period has elapsed
        uint256 elapsed = block.timestamp - exchange.voucher.redeemedDate;
        require(elapsed < fetchOfferDurations(exchange.offerId).fulfillmentPeriod, FULFILLMENT_PERIOD_HAS_ELAPSED);

        // Make sure the caller is buyer associated with the exchange
        checkBuyer(exchange.buyerId);

        // Set the exhange state to disputed
        exchange.state = ExchangeState.Disputed;

        // Fetch the dispute and dispute dates
        (, Dispute storage dispute, DisputeDates storage disputeDates) = fetchDispute(exchange.id);

        // Set the initial values
        dispute.exchangeId = exchange.id;
        dispute.complaint = _complaint;
        dispute.state = DisputeState.Resolving;

        // Update the disputeDates
        disputeDates.disputed = block.timestamp;
        disputeDates.timeout = block.timestamp + fetchOfferDurations(exchange.offerId).resolutionPeriod;

        // Notify watchers of state change
        emit DisputeRaised(exchange.id, exchange.buyerId, sellerId, _complaint, msgSender());
    }
}
