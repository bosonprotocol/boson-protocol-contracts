// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;

import "../../domain/BosonConstants.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import "../../domain/BosonConstants.sol";
import { BosonTypes } from "../../domain/BosonTypes.sol";
import { ProtocolBase } from "../bases/OfferBase.sol";
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
     * - A region is specified more than once
     *
     * @param _regions - an array of regions to pause. See: {BosonTypes.PausableRegion}
     */
    function pause(BosonTypes.PausableRegion[] calldata _regions) external onlyRole(PAUSER) nonReentrant {
        togglePause(_regions, true);

        // Notify watchers of state change
        emit ProtocolPaused(_regions, msgSender());
    }

    /**
     * @notice Unpauses the protocol.
     *
     * Emits a ProtocolUnpaused event if successful.
     *
     * Reverts if:
     * - Caller does not have PAUSER role
     * - Protocol is not currently paused
     * - A region is specified more than once
     */
    function unpause(BosonTypes.PausableRegion[] calldata _regions) external onlyRole(PAUSER) nonReentrant {
        // Cache protocol status for reference
        ProtocolLib.ProtocolStatus storage status = protocolStatus();

        // Make sure the protocol is paused
        require(status.pauseScenario > 0, NOT_PAUSED);

        togglePause(_regions, false);

        // Notify watchers of state change
        emit ProtocolUnpaused(_regions, msgSender());
    }

    /**
     * @notice Toggles pause/unpause for some or all of the protocol.
     *
     * Toggle all regions if none are specified.
     *
     * Reverts if:
     * - A region is specified more than once
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

        // Build the toggle scenario by summing the supplied
        // enum values, first converted to powers of two
        uint8 enumVal;
        uint256 region;
        uint256 scenario = status.pauseScenario;

        uint256[] memory used = new uint256[](20); // arbitrarily a little more than # of regions
        for (uint256 i = 0; i < _regions.length; i++) {
            // Get enum value as power of 2
            enumVal = uint8(_regions[i]);
            region = 2 ** uint256(enumVal);

            // Prevent duplicates
            require(used[enumVal] != region, REGION_DUPLICATED);
            used[enumVal] = region;

            if (_pause && (scenario & region) == 0) {
                scenario = scenario + region;
            } else if (!_pause && (scenario & region) != 0) {
                scenario = scenario - region;
            }
        }

        // Store the toggle scenario
        status.pauseScenario = scenario;
    }
}
