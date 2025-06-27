// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import { IBosonDisputeEvents } from "../../interfaces/events/IBosonDisputeEvents.sol";
import { IBosonFundsLibEvents } from "../../interfaces/events/IBosonFundsEvents.sol";
import { ProtocolBase } from "./../bases/ProtocolBase.sol";
import "../../domain/BosonConstants.sol";

/**
 *
 * @title DisputeBase
 * @notice Provides methods for dispute that can be shared across facets.
 */
contract DisputeBase is ProtocolBase, IBosonDisputeEvents, IBosonFundsLibEvents {
    /**
     * @notice Raises a dispute
     *
     * Reverts if:
     * - Caller does not hold a voucher for the given exchange id
     * - Exchange does not exist
     * - Dispute period has elapsed already
     *
     * @param _exchange - the exchange
     * @param _voucher - the associated voucher
     * @param _sellerId - the seller id
     */
    function raiseDisputeInternal(Exchange storage _exchange, Voucher storage _voucher, uint256 _sellerId) internal {
        // Fetch offer durations
        OfferDurations storage offerDurations = fetchOfferDurations(_exchange.offerId);

        // Make sure the dispute period has not elapsed
        uint256 elapsed = block.timestamp - _voucher.redeemedDate;
        if (elapsed >= offerDurations.disputePeriod) revert DisputePeriodHasElapsed();

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

    /**
     * @notice Puts the dispute into the Escalated state.
     *
     * Caller must send (or for ERC20, approve the transfer of) the
     * buyer escalation deposit percentage of the offer price, which
     * will be added to the pot for resolution.
     *
     * Emits a DisputeEscalated event if successful.
     *
     * Reverts if:
     * - The disputes region of protocol is paused
     * - Exchange does not exist
     * - Exchange is not in a Disputed state
     * - Caller is not the buyer
     * - Dispute is already expired
     * - Dispute is not in a Resolving state
     * - Dispute resolver is not specified (absolute zero offer)
     * - Offer price is in native token and caller does not send enough
     * - Offer price is in some ERC20 token and caller also sends native currency
     * - If contract at token address does not support ERC20 function transferFrom
     * - If calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - Received ERC20 token amount differs from the expected value
     *
     * @param _exchangeId - the id of the associated exchange
     */
    function escalateDisputeInternal(uint256 _exchangeId) internal disputesNotPaused {
        // Get the exchange, should be in disputed state
        (Exchange storage exchange, ) = getValidExchange(_exchangeId, ExchangeState.Disputed);

        // Make sure the caller is buyer associated with the exchange
        uint256 buyerId = exchange.buyerId;
        checkBuyer(buyerId);

        // Fetch the dispute and dispute dates
        (, Dispute storage dispute, DisputeDates storage disputeDates) = fetchDispute(_exchangeId);

        // make sure the dispute not expired already
        if (block.timestamp > disputeDates.timeout) revert DisputeHasExpired();

        // Make sure the dispute is in the resolving state
        if (dispute.state != DisputeState.Resolving) revert InvalidState();

        // Fetch the dispute resolution terms from the storage
        DisputeResolutionTerms storage disputeResolutionTerms = fetchDisputeResolutionTerms(exchange.offerId);

        // absolute zero offers can be without DR. In that case we prevent escalation
        if (disputeResolutionTerms.disputeResolverId == 0) revert EscalationNotAllowed();

        // fetch offer to get info about dispute resolver id
        (, Offer storage offer) = fetchOffer(exchange.offerId);

        // make sure buyer sent enough funds to proceed
        address exchangeToken = offer.exchangeToken;
        uint256 buyerEscalationDeposit = disputeResolutionTerms.buyerEscalationDeposit;
        validateIncomingPayment(exchangeToken, buyerEscalationDeposit);

        // fetch the escalation period from the storage
        uint256 escalationResponsePeriod = disputeResolutionTerms.escalationResponsePeriod;

        // store the time of escalation
        disputeDates.escalated = block.timestamp;
        disputeDates.timeout = block.timestamp + escalationResponsePeriod;

        // Set the dispute state
        dispute.state = DisputeState.Escalated;

        // Notify watchers of state change
        address sender = msgSender();
        emit FundsEncumbered(buyerId, exchangeToken, buyerEscalationDeposit, sender);
        emit DisputeEscalated(_exchangeId, disputeResolutionTerms.disputeResolverId, sender);
    }
}
