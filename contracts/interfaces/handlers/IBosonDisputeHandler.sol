// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {BosonTypes} from "../../domain/BosonTypes.sol";
import {IBosonDisputeEvents} from "../events/IBosonDisputeEvents.sol";

/**
 * @title IBosonDisputeHandler
 *
 * @notice Handles disputes associated with exchanges within the protocol.
 *
 * The ERC-165 identifier for this interface is: 0xb9463b81
 */
interface IBosonDisputeHandler is IBosonDisputeEvents {

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
     * @notice Gets the details about a given dispute.
     *
     * @param _exchangeId - the id of the exchange to check
     * @return exists - true if the dispute exists
     * @return dispute - the dispute details. See {BosonTypes.Dispute}
     */
    function getDispute(uint256 _exchangeId) external view returns(bool exists, BosonTypes.Dispute memory dispute);
}
