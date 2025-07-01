// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import "../../domain/BosonConstants.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import "../../domain/BosonConstants.sol";
import { BosonTypes } from "../../domain/BosonTypes.sol";
import { ProtocolBase } from "../bases/ProtocolBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { IBosonPauseHandler } from "../../interfaces/handlers/IBosonPauseHandler.sol";

/**
 * @title PauseHandlerFacet
 *
 * @notice Handles pausing all or part of the protocol.
 */
contract PauseHandlerFacet is ProtocolBase, IBosonPauseHandler {
    /**
     * @notice Initializes facet.
     * This function is callable only once.
     */
    function initialize() public onlyUninitialized(type(IBosonPauseHandler).interfaceId) {
        DiamondLib.addSupportedInterface(type(IBosonPauseHandler).interfaceId);
    }

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
    function pause(BosonTypes.PausableRegion[] calldata _regions) external onlyRole(PAUSER) nonReentrant {
        togglePause(_regions, true);

        // Notify watchers of state change
        emit ProtocolPaused(_regions, _msgSender());
    }

    /**
     * @notice Unpauses the protocol.
     *
     * Emits a ProtocolUnpaused event if successful.
     *
     * Reverts if:
     * - Caller does not have PAUSER role
     * - Protocol is not currently paused
     */
    function unpause(BosonTypes.PausableRegion[] calldata _regions) external onlyRole(PAUSER) nonReentrant {
        // Cache protocol status for reference
        ProtocolLib.ProtocolStatus storage status = protocolStatus();

        // Make sure the protocol is paused
        if (status.pauseScenario == 0) revert NotPaused();

        togglePause(_regions, false);

        // Notify watchers of state change
        emit ProtocolUnpaused(_regions, _msgSender());
    }

    /**
     * @notice Returns the regions paused
     *
     * @return regions - an array of regions that are currently paused. See: {BosonTypes.PausableRegion}
     */
    function getPausedRegions() external view returns (BosonTypes.PausableRegion[] memory regions) {
        // Cache protocol status for reference
        ProtocolLib.ProtocolStatus storage status = protocolStatus();
        uint256 totalRegions = uint256(type(BosonTypes.PausableRegion).max) + 1;

        regions = new BosonTypes.PausableRegion[](totalRegions);

        // Return all regions if all are paused.
        if (status.pauseScenario == ALL_REGIONS_MASK) {
            for (uint256 i = 0; i < totalRegions; ) {
                regions[i] = BosonTypes.PausableRegion(i);

                unchecked {
                    i++;
                }
            }
        } else {
            uint256 count = 0;

            for (uint256 i = 0; i < totalRegions; ) {
                // Check if the region is paused by bitwise AND operation with shifted 1
                if (status.pauseScenario & (1 << i) != 0) {
                    regions[count] = BosonTypes.PausableRegion(i);

                    count++;
                }

                unchecked {
                    i++;
                }
            }

            // setting the correct number of regions
            assembly {
                mstore(regions, count)
            }
        }
    }

    /**
     * @notice Toggles pause/unpause for some or all of the protocol.
     *
     * Toggle all regions if none are specified.
     *
     * @param _regions - an array of regions to pause/unpause. See: {BosonTypes.PausableRegion}
     * @param _pause - a boolean indicating whether to pause (true) or unpause (false)
     */
    function togglePause(BosonTypes.PausableRegion[] calldata _regions, bool _pause) internal {
        // Cache protocol status for reference
        ProtocolLib.ProtocolStatus storage status = protocolStatus();

        // Toggle all regions if none are specified.
        if (_regions.length == 0) {
            // Store the toggle scenario
            status.pauseScenario = _pause ? ALL_REGIONS_MASK : 0;
            return;
        }

        uint256 region;
        uint256 incomingScenario;

        // Calculate the incoming scenario as the sum of individual regions
        // Use "or" to get the correct value even if the same region is specified more than once
        for (uint256 i = 0; i < _regions.length; ) {
            // Get enum value as power of 2
            region = 1 << uint256(_regions[i]);
            incomingScenario |= region;

            unchecked {
                i++;
            }
        }

        // Store the toggle scenario
        if (_pause) {
            // for pausing, just "or" the incoming scenario with the existing one
            // equivalent to summation
            status.pauseScenario |= incomingScenario;
        } else {
            // for unpausing, "and" the inverse of the incoming scenario with the existing one
            // equivalent to subtraction
            status.pauseScenario &= ~incomingScenario;
        }
    }
}
