// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../domain/BosonTypes.sol";

/**
 * @title IBosonBundleHandler
 *
 * @notice Manages bundling associated with offers and twins within the protocol
 *
 * The ERC-165 identifier for this interface is: 0x157c2f5f
 */
interface IBosonBundleHandler {
    /// Events
    event BundleCreated(uint256 indexed bundleId, uint256 indexed sellerId, BosonTypes.Bundle bundle);

    /**
     * @notice Creates a bundle.
     *
     * Emits a BundleCreated event if successful.
     *
     * Reverts if:
     *
     * - seller does not match caller
     * - any of offers belongs to different seller
     * - any of offers does not exist
     * - offer exists in a different bundle
     * - any of twins belongs to different seller
     * - any of twins does not exist
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
}
