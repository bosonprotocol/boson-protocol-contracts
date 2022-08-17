// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../../domain/BosonConstants.sol";
import { IBosonBundleHandler } from "../../interfaces/handlers/IBosonBundleHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { BundleBase } from "../bases/BundleBase.sol";

/**
 * @title BundleHandlerFacet
 *
 * @notice Manages bundling associated with offers and twins within the protocol
 */
contract BundleHandlerFacet is IBosonBundleHandler, BundleBase {
    enum BundleUpdateAttribute {
        TWIN,
        OFFER
    }

    /**
     * @notice Facet Initializer
     */
    function initialize() public onlyUnInitialized(type(IBosonBundleHandler).interfaceId) {
        DiamondLib.addSupportedInterface(type(IBosonBundleHandler).interfaceId);
    }

    /**
     * @notice Creates a Bundle.
     *
     * Emits a BundleCreated event if successful.
     *
     * Reverts if:
     * - The bundles region of protocol is paused
     * - Seller does not exist
     * - any of offers belongs to different seller
     * - any of offers does not exist
     * - offer exists in a different bundle
     * - number of offers exceeds maximum allowed number per bundle
     * - any of twins belongs to different seller
     * - any of twins does not exist
     * - number of twins exceeds maximum allowed number per bundle
     * - duplicate twins added in same bundle
     * - exchange already exists for the offer id in bundle
     * - offers total quantity is greater than twin supply when token is nonfungible
     * - offers total quantity multiplied by twin amount is greater than twin supply when token is fungible or multitoken
     *
     * @param _bundle - the fully populated struct with bundle id set to 0x0
     */
    function createBundle(Bundle memory _bundle) external override bundlesNotPaused nonReentrant {
        createBundleInternal(_bundle);
    }

    /**
     * @notice Gets the details about a given bundle.
     *
     * @param _bundleId - the id of the bundle to check
     * @return exists - the bundle was found
     * @return bundle - the bundle details. See {BosonTypes.Bundle}
     */
    function getBundle(uint256 _bundleId) external view override returns (bool exists, Bundle memory bundle) {
        return fetchBundle(_bundleId);
    }

    /**
     * @notice Gets the next bundle id.
     *
     * Does not increment the counter.
     *
     * @return nextBundleId - the next bundle id
     */
    function getNextBundleId() public view override returns (uint256 nextBundleId) {
        nextBundleId = protocolCounters().nextBundleId;
    }

    /**
     * @notice Gets the bundle id for a given offer id.
     *
     * @param _offerId - the offer Id.
     * @return exists - whether the bundle Id exists
     * @return bundleId  - the bundle Id.
     */
    function getBundleIdByOffer(uint256 _offerId) external view override returns (bool exists, uint256 bundleId) {
        return fetchBundleIdByOffer(_offerId);
    }

    /**
     * @notice Gets the bundle id for a given twin id.
     *
     * @param _twinId - the twin Id.
     * @return exists - whether the bundle Id exist
     * @return bundleId  - the bundle Id.
     */
    function getBundleIdByTwin(uint256 _twinId) external view override returns (bool exists, uint256 bundleId) {
        return fetchBundleIdByTwin(_twinId);
    }
}
