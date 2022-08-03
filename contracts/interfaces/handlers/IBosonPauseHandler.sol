// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { BosonTypes } from "../../domain/BosonTypes.sol";
import { IBosonPauseEvents } from "../events/IBosonPauseEvents.sol";

/**
 * @title IBosonPauseHandler
 *
 * @notice Handles pausing all or part of the protocol.
 *
 * The ERC-165 identifier for this interface is: 0x????????
 */
interface IBosonPauseHandler is IBosonPauseEvents {
    /**
     * @notice Pause some or all of the protocol
     *
     * Emits a ProtocolPaused event if successful.
     *
     * Reverts if:
     * - caller does not have PAUSER role
     * - no regions are specified
     *
     * @param _regions - an array of regions to pause. See: {BosonTypes.PausableRegion}
     */
    function pause(BosonTypes.PausableRegion[] calldata _regions) external;

    /**
     * @notice Unpauses the protocol
     *
     * Emits a ProtocolUnpaused event if successful.
     *
     * Reverts if:
     * - caller does not have PAUSER role
     * - no part of the protocol is currently paused
     */
    function unpause() external;
}
