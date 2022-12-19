// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;

import "../../domain/BosonConstants.sol";
import { IBosonBundleHandler } from "../../interfaces/handlers/IBosonBundleHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { BundleBase } from "../bases/BundleBase.sol";

/**
 * @title BundleHandlerFacet
 *
 * @notice Handles bundling of offers with twins within the protocol.
 */
contract BundleHandlerFacet is IBosonBundleHandler, BundleBase {
    /**
     * @notice Initializes facet.
     * This function is callable only once.
     */
    function initialize() public onlyUninitialized(type(IBosonBundleHandler).interfaceId) {
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
     * - Either offerIds member or twinIds member is empty
     * - Any of the offers belongs to different seller
     * - Any of the offers does not exist
     * - Offer exists in a different bundle
     * - Number of offers exceeds maximum allowed number per bundle
     * - Any of the twins belongs to different seller
     * - Any of the twins does not exist
     * - Number of twins exceeds maximum allowed number per bundle
     * - Duplicate twins added in same bundle
     * - Exchange already exists for the offer id in bundle
     * - Offers' total quantity is greater than twin supply when token is nonfungible
     * - Offers' total quantity multiplied by twin amount is greater than twin supply when token is fungible or multitoken
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
     * @dev Does not increment the counter.
     *
     * @return nextBundleId - the next bundle id
     */
    function getNextBundleId() public view override returns (uint256 nextBundleId) {
        nextBundleId = protocolCounters().nextBundleId;
    }

    /**
     * @notice Gets the bundle id for a given offer id.
     *
     * @param _offerId - the offer id
     * @return exists - whether the bundle id exists
     * @return bundleId  - the bundle id
     */
    function getBundleIdByOffer(uint256 _offerId) external view override returns (bool exists, uint256 bundleId) {
        return fetchBundleIdByOffer(_offerId);
    }

    /**
     * @notice Gets the bundle id for a given twin id.
     *
     * @param _twinId - the twin id
     * @return exists - whether the bundle id exist
     * @return bundleId  - the bundle id
     */
    function getBundleIdByTwin(uint256 _twinId) external view override returns (bool exists, uint256 bundleId) {
        return fetchBundleIdByTwin(_twinId);
    }
}
