// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "./../../domain/BosonConstants.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { BosonTypes } from "../../domain/BosonTypes.sol";

/**
 * @title PausableBase
 *
 * @notice Provides modifiers for regional pausing
 */
contract PausableBase is BosonTypes {
    /**
     * @notice Modifier that checks the Offers region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier offersNotPaused() {
        revertIfPaused(PausableRegion.Offers);
        _;
    }

    /**
     * @notice Modifier that checks the Twins region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier twinsNotPaused() {
        revertIfPaused(PausableRegion.Twins);
        _;
    }

    /**
     * @notice Modifier that checks the Bundles region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier bundlesNotPaused() {
        revertIfPaused(PausableRegion.Bundles);
        _;
    }

    /**
     * @notice Modifier that checks the Groups region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier groupsNotPaused() {
        revertIfPaused(PausableRegion.Groups);
        _;
    }

    /**
     * @notice Modifier that checks the Sellers region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier sellersNotPaused() {
        revertIfPaused(PausableRegion.Sellers);
        _;
    }

    /**
     * @notice Modifier that checks the Buyers region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier buyersNotPaused() {
        revertIfPaused(PausableRegion.Buyers);
        _;
    }

    /**
     * @notice Modifier that checks the Agents region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier agentsNotPaused() {
        revertIfPaused(PausableRegion.Agents);
        _;
    }

    /**
     * @notice Modifier that checks the DisputeResolvers region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier disputeResolversNotPaused() {
        revertIfPaused(PausableRegion.DisputeResolvers);
        _;
    }

    /**
     * @notice Modifier that checks the Exchanges region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier exchangesNotPaused() {
        revertIfPaused(PausableRegion.Exchanges);
        _;
    }

    /**
     * @notice Modifier that checks the Disputes region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier disputesNotPaused() {
        revertIfPaused(PausableRegion.Disputes);
        _;
    }

    /**
     * @notice Modifier that checks the Funds region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier fundsNotPaused() {
        revertIfPaused(PausableRegion.Funds);
        _;
    }

    /**
     * @notice Modifier that checks the Orchestration region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier orchestrationNotPaused() {
        revertIfPaused(PausableRegion.Orchestration);
        _;
    }

    /**
     * @notice Modifier that checks the MetaTransaction region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier metaTransactionsNotPaused() {
        revertIfPaused(PausableRegion.MetaTransaction);
        _;
    }

    /**
     * @notice Checks if a region of the protocol is paused.
     *
     * Reverts if region is paused
     *
     * @param _region the region to check pause status for
     */
    function revertIfPaused(PausableRegion _region) internal view {
        // Region enum value must be used as the exponent in a power of 2
        uint256 powerOfTwo = 1 << uint256(_region);
        require((ProtocolLib.protocolStatus().pauseScenario & powerOfTwo) != powerOfTwo, REGION_PAUSED);
    }
}
