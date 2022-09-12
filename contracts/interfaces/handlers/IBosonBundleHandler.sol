// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { BosonTypes } from "../../domain/BosonTypes.sol";
import { IBosonBundleEvents } from "../events/IBosonBundleEvents.sol";

/**
 * @title IBosonBundleHandler
 *
 * @notice Handles bundling of offers and twins within the protocol
 *
 * The ERC-165 identifier for this interface is: 0x7b53dece
 */
interface IBosonBundleHandler is IBosonBundleEvents {
    /**
     * @notice Creates a Bundle.
     *
     * Emits a BundleCreated event if successful.
     *
     * Reverts if:
     * - The bundles region of protocol is paused
     * - Seller does not exist
     * - Either offer ids or twin ids are empty
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
     * @dev Does not increment the counter.
     *
     * @return nextBundleId - the next bundle id
     */
    function getNextBundleId() external view returns (uint256 nextBundleId);

    /**
     * @notice Gets the bundle id for a given offer id.
     *
     * @param _offerId - the offer Id.
     * @return exists - whether the bundle Id exists
     * @return bundleId  - the bundle Id.
     */
    function getBundleIdByOffer(uint256 _offerId) external view returns (bool exists, uint256 bundleId);

    /**
     * @notice Gets the bundle id for a given twin id.
     *
     * @param _twinId - the twin Id.
     * @return exists - whether the bundle Id exist
     * @return bundleId  - the bundle Id.
     */
    function getBundleIdByTwin(uint256 _twinId) external view returns (bool exists, uint256 bundleId);
}
