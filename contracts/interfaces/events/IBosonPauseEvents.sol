// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;

import { BosonTypes } from "../../domain/BosonTypes.sol";

/**
 * @title IBosonPauseEvents
 *
 * @notice Defines events related to pausing of the protocol.
 */
interface IBosonPauseEvents {
    // When array of regions is empty, all regions are paused
    event ProtocolPaused(BosonTypes.PausableRegion[] regions, address executedBy);
    // When array of regions is empty, all regions are unpaused
    event ProtocolUnpaused(BosonTypes.PausableRegion[] regions, address executedBy);
}
