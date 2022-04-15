// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {BosonTypes} from "../../domain/BosonTypes.sol";
import {IBosonBundleEvents} from "../events/IBosonBundleEvents.sol";

/**
 * @title IBosonBundleHandler
 *
 * @notice Handles bundling of offers and twins within the protocol
 *
 * The ERC-165 identifier for this interface is: 0xa13dc8bd
 */
interface IBosonBundleHandler is IBosonBundleEvents {

    /**
     * @notice Creates a bundle.
     *
     * Emits a BundleCreated event if successful.
     *
     * Reverts if:
     * - Seller does not exist
     * - any of offers belongs to different seller
     * - any of offers does not exist
     * - offer exists in a different bundle
     * - number of offers exceeds maximum allowed number per bundle
     * - any of twins belongs to different seller
     * - any of twins does not exist
     * - number of twins exceeds maximum allowed number per bundle
     * - duplicate twins added in same bundle
     *
     * @param _bundle - the fully populated struct with bundle id set to 0x0
     */
    function createBundle(BosonTypes.Bundle memory _bundle) external;

    /**
     * @notice Gets the details about a given bundle.
     *
     * @param _bundleId - the id of the bundle to check
     * @return exists - the bundle was found
     * @return bundle - the bundle details. See {BosonTypes.Bundle}
     */
    function getBundle(uint256 _bundleId) external view returns (bool exists, BosonTypes.Bundle memory bundle);

    /**
     * @notice Gets the next bundle id.
     *
     * Does not increment the counter.
     *
     * @return nextBundleId - the next bundle id
     */
    function getNextBundleId() external view returns (uint256 nextBundleId);

    /**
     * @notice Adds twins to an existing bundle
     *
     * Emits a BundleUpdated event if successful.
     *
     * Reverts if:
     * - caller is not the seller
     * - twin ids is an empty list
     * - number of twins exceeds maximum allowed number per bundle
     * - bundle does not exist
     * - any of twins belongs to different seller
     * - any of twins does not exist
     * - twin already exists in the same bundle
     * - twin ids contains duplicated twins
     *
     * @param _bundleId  - the id of the bundle to be updated
     * @param _twinIds - array of twin ids to be added to the bundle
     */
    function addTwinsToBundle(uint256 _bundleId, uint256[] calldata _twinIds) external;

    /**
     * @notice Removes twins from an existing bundle
     *
     * Emits a BundleUpdated event if successful.
     *
     * Reverts if:
     * - caller is not the seller
     * - twin ids is an empty list
     * - number of twins exceeds maximum allowed number per bundle
     * - bundle does not exist
     * - any twin is not part of the bundle
     *
     * @param _bundleId  - the id of the bundle to be updated
     * @param _twinIds - array of twin ids to be removed to the bundle
     */
    function removeTwinsFromBundle(uint256 _bundleId, uint256[] calldata _twinIds) external;

    /**
     * @notice Adds offers to an existing bundle
     *
     * Emits a BundleUpdated event if successful.
     *
     * Reverts if:
     * - caller is not the seller
     * - offer ids is an empty list
     * - number of offers exceeds maximum allowed number per bundle
     * - bundle does not exist
     * - any of offers belongs to different seller
     * - any of offers does not exist
     * - offer exists in a different bundle
     * - offer ids contains duplicated offers
     *
     * @param _bundleId  - the id of the bundle to be updated
     * @param _offerIds - array of offer ids to be added to the bundle
     */
    function addOffersToBundle(uint256 _bundleId, uint256[] calldata _offerIds) external;

    /**
     * @notice Removes offers from an existing bundle
     *
     * Emits a BundleUpdated event if successful.
     *
     * Reverts if:
     * - caller is not the seller
     * - offer ids is an empty list
     * - number of offers exceeds maximum allowed number per bundle
     * - bundle does not exist
     * - any offer is not part of the bundle
     *
     * @param _bundleId  - the id of the bundle to be updated
     * @param _offerIds - array of offer ids to be removed to the bundle
     */
    function removeOffersFromBundle(uint256 _bundleId, uint256[] calldata _offerIds) external;

    /**
     * @notice Removes the bundle.
     *
     * Emits a BundleDeleted event if successful.
     *
     * Reverts if:
     * - caller is not the seller.
     * - Bundle does not exist.
     * - exchanges exists for bundled offers.
     *
     * @param _bundleId - the id of the bundle to check.
     */
    function removeBundle(uint256 _bundleId) external;

    /**
     * @notice Gets the bundle id for a given offer id.
     *
     * @param _offerId - the offer Id.
     * @return exists - whether the bundle Id exists
     * @return bundleId  - the bundle Id.
     */
    function getBundleIdByOffer(uint256 _offerId) external view returns (bool exists, uint256 bundleId);

    /**
     * @notice Gets the bundle ids for a given twin id.
     *
     * @param _twinId - the twin Id.
     * @return exists - whether the bundle Ids exist
     * @return bundleIds  - the bundle Ids.
     */
    function getBundleIdsByTwin(uint256 _twinId) external view returns (bool exists, uint256[] memory bundleIds);
}
