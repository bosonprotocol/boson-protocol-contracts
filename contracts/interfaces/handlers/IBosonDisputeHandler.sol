// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {BosonTypes} from "../../domain/BosonTypes.sol";
import {IBosonDisputeEvents} from "../events/IBosonDisputeEvents.sol";
import {IBosonFundsLibEvents} from "../events/IBosonFundsEvents.sol";

/**
 * @title IBosonDisputeHandler
 *
 * @notice Handles disputes associated with exchanges within the protocol.
 *
 * The ERC-165 identifier for this interface is: 0x374702cd
 */
interface IBosonDisputeHandler is IBosonDisputeEvents, IBosonFundsLibEvents {

    /**
     * @notice Raise a dispute
     *
     * Emits an DisputeRaised event if successful.
     *
     * Reverts if:
     * - caller does not hold a voucher for the given exchange id
     * - exchange does not exist
     * - exchange is not in a redeemed state
     * - the complaint is blank
     * 
     * @param _exchangeId - the id of the associated offer
     * @param _complaint - the buyer's complaint description
     */
    function raiseDispute(uint256 _exchangeId, string calldata _complaint) external;

    /**
     * @notice Retract the dispute and release the funds
     *
     * Emits an DisputeRetracted event if successful.
     *
     * Reverts if:
     * - exchange does not exist
     * - exchange is not in a disputed state
     * - caller is not the buyer for the given exchange id
     * - dispute is in some state other than resolving
     *
     * @param _exchangeId - the id of the associated exchange
     */
    function retractDispute(uint256 _exchangeId) external;

     /**
     * @notice Resolve a dispute by providing the information about the split. Callable by the buyer or seller, but they must provide the resolution signed by the other party
     *
     * Reverts if:
     * - dispute has expired
     * - exchange does not exist
     * - exchange is not in the disputed state
     * - callers is neither the seller or the buyer
     * - signature does not belong to the address of the other party
     * - dispute state is neither resolving or escalated
     *
     * @param _exchangeId  - exchange id to resolve dispute
     * @param _resolution - resolution struct with the information about the split.
     * @param _sigR - r part of the signer's signature.
     * @param _sigS - s part of the signer's signature.
     * @param _sigV - v part of the signer's signature.
     */
    function resolveDispute(uint256 _exchangeId, BosonTypes.Resolution calldata _resolution, bytes32 _sigR,
        bytes32 _sigS,
        uint8 _sigV) external;

    /**
     * @notice Gets the details about a given dispute.
     *
     * @param _exchangeId - the id of the exchange to check
     * @return exists - true if the dispute exists
     * @return dispute - the dispute details. See {BosonTypes.Dispute}
     * @return disputeDates - the dispute dates details {BosonTypes.DisputeDates}
     */
    function getDispute(uint256 _exchangeId)
    external
    view
    returns(bool exists, BosonTypes.Dispute memory dispute, BosonTypes.DisputeDates memory disputeDates);
       
    /**
     * @notice Gets the state of a given dispute.
     *
     * @param _exchangeId - the id of the exchange to check
     * @return exists - true if the dispute exists
     * @return state - the dispute state. See {BosonTypes.DisputeState}
     */
    function getDisputeState(uint256 _exchangeId) external view returns(bool exists, BosonTypes.DisputeState state);

    /**
     * @notice Is the given dispute in a finalized state?
     *
     * Returns true if
     * - Dispute state is Retracted, Resolved, or Decided
     *
     * @param _exchangeId - the id of the exchange to check
     * @return exists - true if the dispute exists
     * @return isFinalized - true if the dispute is finalized
     */
    function isDisputeFinalized(uint256 _exchangeId) external view returns(bool exists, bool isFinalized);
}
