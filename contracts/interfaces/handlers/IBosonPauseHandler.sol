// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { BosonTypes } from "../../domain/BosonTypes.sol";
import { BosonErrors } from "../../domain/BosonErrors.sol";
import { IBosonPauseEvents } from "../events/IBosonPauseEvents.sol";

/**
 * @title IBosonPauseHandler
 *
 * @notice Handles pausing all or part of the protocol.
 *
 * The ERC-165 identifier for this interface is: 0x770b96d0
 */
interface IBosonPauseHandler is IBosonPauseEvents, BosonErrors {
    /**
     * @notice Pauses some or all of the protocol.
     *
     * Emits a ProtocolPaused event if successful.
     *
     * Reverts if:
     * - Caller does not have PAUSER role
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
     *
     * @param _regions - an array of regions to pause. See: {BosonTypes.PausableRegion}
     */
    function unpause(BosonTypes.PausableRegion[] calldata _regions) external;

    /**
     * @notice Returns the regions paused
     *
     * @return regions - an array of regions that are currently paused. See: {BosonTypes.PausableRegion}
     */
    function getPausedRegions() external view returns (BosonTypes.PausableRegion[] memory regions);
}
