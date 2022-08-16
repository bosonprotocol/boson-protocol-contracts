// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./../../domain/BosonConstants.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { BosonTypes } from "../../domain/BosonTypes.sol";

/**
 * @title PausableBase
 *
 * @dev Provides modifiers for regional pausing
 */
contract PausableBase is BosonTypes {
    /**
     * @dev Modifier that checks the Offers region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier offersNotPaused() {
        require(!paused(PausableRegion.Offers), REGION_PAUSED);
        _;
    }

    /**
     * @dev Modifier that checks the Twins region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier twinsNotPaused() {
        require(!paused(PausableRegion.Twins), REGION_PAUSED);
        _;
    }

    /**
     * @dev Modifier that checks the Bundles region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier bundlesNotPaused() {
        require(!paused(PausableRegion.Bundles), REGION_PAUSED);
        _;
    }

    /**
     * @dev Modifier that checks the Groups region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier groupsNotPaused() {
        require(!paused(PausableRegion.Groups), REGION_PAUSED);
        _;
    }

    /**
     * @dev Modifier that checks the Sellers region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier sellersNotPaused() {
        require(!paused(PausableRegion.Sellers), REGION_PAUSED);
        _;
    }

    /**
     * @dev Modifier that checks the Buyers region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier buyersNotPaused() {
        require(!paused(PausableRegion.Buyers), REGION_PAUSED);
        _;
    }

    /**
     * @dev Modifier that checks the Agents region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier agentsNotPaused() {
        require(!paused(PausableRegion.Agents), REGION_PAUSED);
        _;
    }

    /**
     * @dev Modifier that checks the DisputeResolvers region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier disputeResolversNotPaused() {
        require(!paused(PausableRegion.DisputeResolvers), REGION_PAUSED);
        _;
    }

    /**
     * @dev Modifier that checks the Exchanges region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier exchangesNotPaused() {
        require(!paused(PausableRegion.Exchanges), REGION_PAUSED);
        _;
    }

    /**
     * @dev Modifier that checks the Disputes region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier disputesNotPaused() {
        require(!paused(PausableRegion.Disputes), REGION_PAUSED);
        _;
    }

    /**
     * @dev Modifier that checks the Funds region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier fundsNotPaused() {
        require(!paused(PausableRegion.Funds), REGION_PAUSED);
        _;
    }

    /**
     * @dev Modifier that checks the Orchestration region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier orchestrationNotPaused() {
        require(!paused(PausableRegion.Orchestration), REGION_PAUSED);
        _;
    }

    /**
     * @dev Modifier that checks the MetaTransaction region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier metaTransactionsNotPaused() {
        require(!paused(PausableRegion.MetaTransaction), REGION_PAUSED);
        _;
    }

    /**
     * @dev Check if a region of the protocol is paused.
     *
     * @param _region the region to check pause status for
     */
    function paused(PausableRegion _region) internal view returns (bool) {
        // Region enum value must be used as the exponent in a power of 2
        uint256 powerOfTwo = 2**uint256(_region);
        return (ProtocolLib.protocolStatus().pauseScenario & powerOfTwo) == powerOfTwo;
    }
}
