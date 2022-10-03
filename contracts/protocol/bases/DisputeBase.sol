// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import { IBosonDisputeEvents } from "../../interfaces/events/IBosonDisputeEvents.sol";
import { ProtocolBase } from "./../bases/ProtocolBase.sol";
import { ProtocolLib } from "./../libs/ProtocolLib.sol";
import "../../domain/BosonConstants.sol";

/**
 *
 * @title DisputeBase
 * @notice Provides methods for dispute that can be shared across facets.
 */
contract DisputeBase is ProtocolBase, IBosonDisputeEvents {
    /**
     * @notice Raises a dispute
     *
     * Reverts if:
     * - Caller does not hold a voucher for the given exchange id
     * - Exchange does not exist
     * - Exchange is not in a redeemed state
     * - Dispute period has elapsed already
     *
     * @param _exchange - the exchange
     * @param _voucher - the associated voucher
     * @param _sellerId - the seller id
     */
    function raiseDisputeInternal(
        Exchange storage _exchange,
        Voucher storage _voucher,
        uint256 _sellerId
    ) internal {
        // Fetch offer durations
        OfferDurations storage offerDurations = fetchOfferDurations(_exchange.offerId);

        // Make sure the dispute period has not elapsed
        uint256 elapsed = block.timestamp - _voucher.redeemedDate;
        require(elapsed < offerDurations.disputePeriod, DISPUTE_PERIOD_HAS_ELAPSED);

        // Make sure the caller is buyer associated with the exchange
        checkBuyer(_exchange.buyerId);

        // Set the exchange state to disputed
        _exchange.state = ExchangeState.Disputed;

        // Fetch the dispute and dispute dates
        (, Dispute storage dispute, DisputeDates storage disputeDates) = fetchDispute(_exchange.id);

        // Set the initial values
        dispute.exchangeId = _exchange.id;
        dispute.state = DisputeState.Resolving;

        // Update the disputeDates
        disputeDates.disputed = block.timestamp;
        disputeDates.timeout = block.timestamp + offerDurations.resolutionPeriod;

        // Notify watchers of state change
        emit DisputeRaised(_exchange.id, _exchange.buyerId, _sellerId, msgSender());
    }
}
