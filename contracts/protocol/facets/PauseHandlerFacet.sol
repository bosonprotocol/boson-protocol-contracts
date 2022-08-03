// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;
import "../../domain/BosonConstants.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { BosonTypes } from "../../domain/BosonTypes.sol";
import { ProtocolBase } from "../bases/OfferBase.sol";
import { IBosonPauseHandler } from "../../interfaces/handlers/IBosonPauseHandler.sol";

/**
 * @title PauseHandlerFacet
 *
 * @notice Handles pausing all or part of the protocol.
 */
contract PauseHandlerFacet is ProtocolBase, IBosonPauseHandler {
    /**
     * @notice Facet Initializer
     */
    function initialize() public onlyUnInitialized(type(IBosonPauseHandler).interfaceId) {
        DiamondLib.addSupportedInterface(type(IBosonPauseHandler).interfaceId);
    }

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
    function pause(BosonTypes.PausableRegion[] calldata _regions) external {
        // Make sure at least one region is specified
        require(_regions.length > 0, NO_REGIONS_SPECIFIED);

        // Make sure the protocol isn't already paused
        require(protocolStatus().pauseScenario == 0, ALREADY_PAUSED);

        // Build the pause scenario from the regions
        uint256 region;
        uint256 scenario;
        for (uint256 i = 0; i < _regions.length; i++) {
            region = 2**uint256(_regions[i]);
            scenario += region;
        }

        // Store the pause scenario
        protocolStatus().pauseScenario = scenario;

        // Notify watchers of state change
        emit ProtocolPaused(_regions, msgSender());
    }

    /**
     * @notice Unpauses the protocol
     *
     * Emits a ProtocolUnpaused event if successful.
     *
     * Reverts if:
     * - caller does not have PAUSER role
     * - no part of the protocol is currently paused
     */
    function unpause() external {
        // Make sure the protocol is already paused
        require(protocolStatus().pauseScenario > 0, NOT_PAUSED);

        // Clear the pause scenario
        protocolStatus().pauseScenario = 0;

        // Notify watchers of state change
        emit ProtocolUnpaused(msgSender());
    }
}
