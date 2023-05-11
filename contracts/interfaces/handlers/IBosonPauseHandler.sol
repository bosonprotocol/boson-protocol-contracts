// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.18;

import { BosonTypes } from "../../domain/BosonTypes.sol";
import { IBosonPauseEvents } from "../events/IBosonPauseEvents.sol";

/**
 * @title IBosonPauseHandler
 *
 * @notice Handles pausing all or part of the protocol.
 *
 * The ERC-165 identifier for this interface is: 0x9ddb8ca6
 */
interface IBosonPauseHandler is IBosonPauseEvents {
    /**
     * @notice Pauses some or all of the protocol.
     *
     * Emits a ProtocolPaused event if successful.
     *
     * Reverts if:
     * - Caller does not have PAUSER role
     * - No regions are specified
     * - Protocol is already paused
     * - A region is specified more than once
     *
     * @param _regions - an array of regions to pause. See: {BosonTypes.PausableRegion}
     */
    function pause(BosonTypes.PausableRegion[] calldata _regions) external;

    /**
     * @notice Unpauses the protocol.
     *
     * Emits a ProtocolUnpaused event if successful.
     *
     * Reverts if:
     * - Caller does not have PAUSER role
     * - Protocol is not currently paused
     */
    function unpause() external;
}
