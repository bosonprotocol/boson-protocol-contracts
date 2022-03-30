// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../domain/BosonTypes.sol";

/**
 * @title IBosonTwinHandler
 *
 * @notice Manages twinning associated with offers within the protocol.
 *
 * The ERC-165 identifier for this interface is: 0x00000000 // TODO: Recalc
 */
interface IBosonTwinHandler {
    /// Events
    event TwinCreated(uint256 indexed twinId, uint256 indexed sellerId, BosonTypes.Twin twin);
    event BundleCreated(uint256 indexed bundleId, uint256 indexed sellerId, BosonTypes.Bundle bundle);

    /**
     * @notice Creates a Twin
     *
     * Emits a TwinCreated event if successful.
     *
     * Reverts if:
     * - Not approved to transfer the seller's token
     *
     * @param _twin - the fully populated struct with twin id set to 0x0
     * @param _sellerOperator - placeholder for seller's operator address. TODO: Remove when Create seller is implemented.
     */
    function createTwin(BosonTypes.Twin memory _twin, address _sellerOperator) external;

    /**
     * @notice Gets the details about a given twin.
     *
     * @param _twinId - the id of the twin to check
     * @return exists - the twin was found
     * @return twin - the twin details. See {BosonTypes.Twin}
     */
    function getTwin(uint256 _twinId) external view returns (bool exists, BosonTypes.Twin memory twin);

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
     * @return exists - the offer was found
     * @return bundle - the offer details. See {BosonTypes.Bundle}
     */
    function getBundle(uint256 _bundleId) external view returns (bool exists, BosonTypes.Bundle memory bundle);
}
