// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { BosonTypes } from "../../domain/BosonTypes.sol";
import { BosonErrors } from "../../domain/BosonErrors.sol";
import { IBosonDisputeEvents } from "../events/IBosonDisputeEvents.sol";
import { IBosonFundsLibEvents } from "../events/IBosonFundsEvents.sol";

/**
 * @title IBosonDisputeHandler
 *
 * @notice Handles disputes associated with exchanges within the protocol.
 *
 * The ERC-165 identifier for this interface is: 0x712f4b28
 */
interface IBosonDisputeHandler is BosonErrors, IBosonDisputeEvents, IBosonFundsLibEvents {
    /**
     * @notice Raises a dispute.
     *
     * Reverts if:
     * - The disputes region of protocol is paused
     * - Caller does not hold a voucher for the given exchange id
     * - Exchange does not exist
     * - Exchange is not in a Redeemed state
     * - Dispute period has elapsed already
     *
     * @param _exchangeId - the id of the associated exchange
     */
    function raiseDispute(uint256 _exchangeId) external;

    /**
     * @notice Retracts the dispute and release the funds.
     *
     * Emits a DisputeRetracted event if successful.
     *
     * Reverts if:
     * - The disputes region of protocol is paused
     * - Exchange does not exist
     * - Exchange is not in a Disputed state
     * - Caller is not the buyer for the given exchange id
     * - Dispute is in some state other than Resolving or Escalated
     * - Dispute was escalated and escalation period has elapsed
     *
     * @param _exchangeId - the id of the associated exchange
     */
    function retractDispute(uint256 _exchangeId) external;

    /**
     * @notice Extends the dispute timeout, allowing more time for mutual resolution.
     * As a consequence, buyer also gets more time to escalate the dispute.
     *
     * Emits a DisputeTimeoutExtened event if successful.
     *
     * Reverts if:
     * - The disputes region of protocol is paused
     * - Exchange does not exist
     * - Exchange is not in a Disputed state
     * - Caller is not the seller
     * - Dispute has expired already
     * - New dispute timeout is before the current dispute timeout
     * - Dispute is in some state other than Resolving
     *
     * @param _exchangeId - the id of the associated exchange
     * @param _newDisputeTimeout - new date when resolution period ends
     */
    function extendDisputeTimeout(uint256 _exchangeId, uint256 _newDisputeTimeout) external;

    /**
     * @notice Expires the dispute and releases the funds.
     *
     * Emits a DisputeExpired event if successful.
     *
     * Reverts if:
     * - The disputes region of protocol is paused
     * - Exchange does not exist
     * - Exchange is not in a Disputed state
     * - Dispute is still valid
     * - Dispute is in some state other than Resolving
     *
     * @param _exchangeId - the id of the associated exchange
     */
    function expireDispute(uint256 _exchangeId) external;

    /**
     * @notice Expires a batch of disputes and releases the funds.
     *
     * Emits a DisputeExpired event for every dispute if successful.
     *
     * Reverts if:
     * - The disputes region of protocol is paused
     * - For any dispute:
     *   - Exchange does not exist
     *   - Exchange is not in a Disputed state
     *   - Dispute is still valid
     *   - Dispute is in some state other than Resolving
     *
     * @param _exchangeIds - the array of ids of the associated exchanges
     */
    function expireDisputeBatch(uint256[] calldata _exchangeIds) external;

    /**
     * @notice Resolves a dispute by providing the information about the funds split.
     * Callable by the buyer or seller, but the caller must provide the resolution signed by the other party.
     *
     * Emits a DisputeResolved event if successful.
     *
     * Reverts if:
     * - The disputes region of protocol is paused
     * - Specified buyer percent exceeds 100%
     * - Dispute has expired (resolution period has ended and dispute was not escalated)
     * - Exchange does not exist
     * - Exchange is not in the Disputed state
     * - Caller is neither the seller nor the buyer
     * - Signature does not belong to the address of the other party
     * - Dispute state is neither Resolving nor escalated
     * - Dispute was escalated and escalation period has elapsed
     *
     * @param _exchangeId  - the id of the associated exchange
     * @param _buyerPercent - percentage of the pot that goes to the buyer
     * @param _signature - signature of the other party. If the signer is EOA, it must be ECDSA signature in the format of (r,s,v) struct, otherwise, it must be a valid ERC1271 signature.

     */
    function resolveDispute(uint256 _exchangeId, uint256 _buyerPercent, bytes calldata _signature) external;

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
    function escalateDispute(uint256 _exchangeId) external payable;

    /**
     * @notice Decides a dispute by providing the information about the funds split. Callable by the dispute resolver specified in the offer.
     *
     * Emits a DisputeDecided event if successful.
     *
     * Reverts if:
     * - The disputes region of protocol is paused
     * - Specified buyer percent exceeds 100%
     * - Exchange does not exist
     * - Exchange is not in the Disputed state
     * - Caller is not the dispute resolver for this dispute
     * - Dispute state is not Escalated
     * - Dispute escalation response period has elapsed
     *
     * @param _exchangeId  - the id of the associated exchange
     * @param _buyerPercent - percentage of the pot that goes to the buyer
     */
    function decideDispute(uint256 _exchangeId, uint256 _buyerPercent) external;

    /**
     * @notice Enables dispute resolver to explicitly refuse to resolve a dispute in Escalated state and releases the funds.
     *
     * Emits an EscalatedDisputeRefused event if successful.
     *
     * Reverts if:
     * - The disputes region of protocol is paused
     * - Exchange does not exist
     * - Exchange is not in a Disputed state
     * - Dispute is in some state other than Escalated
     * - Dispute escalation response period has elapsed
     * - Caller is not the dispute resolver for this dispute
     *
     * @param _exchangeId - the id of the associated exchange
     */
    function refuseEscalatedDispute(uint256 _exchangeId) external;

    /**
     * @notice Expires the dispute in escalated state and release the funds.
     *
     * Emits an EscalatedDisputeExpired event if successful.
     *
     * Reverts if:
     * - The disputes region of protocol is paused
     * - Exchange does not exist
     * - Exchange is not in a Disputed state
     * - Dispute is in some state other than Escalated
     * - Dispute escalation period has not passed yet
     *
     * @param _exchangeId - the id of the associated exchange
     */
    function expireEscalatedDispute(uint256 _exchangeId) external;

    /**
     * @notice Gets the details about a given dispute.
     *
     * @param _exchangeId - the id of the associated exchange
     * @return exists - true if the dispute exists
     * @return dispute - the dispute details. See {BosonTypes.Dispute}
     * @return disputeDates - the dispute dates details {BosonTypes.DisputeDates}
     */
    function getDispute(
        uint256 _exchangeId
    )
        external
        view
        returns (bool exists, BosonTypes.Dispute memory dispute, BosonTypes.DisputeDates memory disputeDates);

    /**
     * @notice Gets the state of a given dispute.
     *
     * @param _exchangeId - the id of the associated exchange
     * @return exists - true if the dispute exists
     * @return state - the dispute state. See {BosonTypes.DisputeState}
     */
    function getDisputeState(uint256 _exchangeId) external view returns (bool exists, BosonTypes.DisputeState state);

    /**
     * @notice Gets the timeout of a given dispute.
     *
     * @param _exchangeId - the id of the associated exchange
     * @return exists - true if the dispute exists
     * @return timeout - the end of resolution period
     */
    function getDisputeTimeout(uint256 _exchangeId) external view returns (bool exists, uint256 timeout);

    /**
     * @notice Checks if the given dispute is in a Finalized state.
     *
     * Returns true if
     * - Dispute state is Retracted, Resolved, Decided or Refused
     *
     * @param _exchangeId - the id of the associated exchange
     * @return exists - true if the dispute exists
     * @return isFinalized - true if the dispute is finalized
     */
    function isDisputeFinalized(uint256 _exchangeId) external view returns (bool exists, bool isFinalized);
}
