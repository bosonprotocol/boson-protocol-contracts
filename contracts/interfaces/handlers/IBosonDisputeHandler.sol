// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {BosonTypes} from "../../domain/BosonTypes.sol";
import {IBosonDisputeEvents} from "../events/IBosonDisputeEvents.sol";

/**
 * @title IBosonDisputeHandler
 *
 * @notice Handles disputes associated with exchanges within the protocol.
 *
 * The ERC-165 identifier for this interface is: 0x5aef573c
 */
interface IBosonDisputeHandler is IBosonDisputeEvents {

    /**
     * @notice Raise a dispute
     *
     * Emits an DisputeCreated event if successful.
     *
     * Reverts if:
     * - caller does not hold a voucher for the given offer id
     * - a dispute already exists
     * - the complaint is blank
     *
     * @param _offerId - the id of the associated offer
     * @param _complaint - the buyer's complaint description
     */
    function raiseDispute(uint256 _offerId, string calldata _complaint) external;
}
