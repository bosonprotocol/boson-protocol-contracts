// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../domain/BosonTypes.sol";

/**
 * @title IBosonTwinHandler
 *
 * @notice Manages twinning associated with offers within the protocol.
 *
 * The ERC-165 identifier for this interface is: 0x218d6de7
 */
interface IBosonTwinHandler {
    /// Events
    event TwinCreated(uint256 indexed twinId, uint256 indexed sellerId, BosonTypes.Twin twin);

    /**
     * @notice Creates a Twin
     *
     * Emits a TwinCreated event if successful.
     *
     * Reverts if:
     * - seller does not exist
     * - Not approved to transfer the seller's token
     *
     * @param _twin - the fully populated struct with twin id set to 0x0
     */
    function createTwin(BosonTypes.Twin memory _twin) external;

    /**
     * @notice Gets the details about a given twin.
     *
     * @param _twinId - the id of the twin to check
     * @return exists - the twin was found
     * @return twin - the twin details. See {BosonTypes.Twin}
     */
    function getTwin(uint256 _twinId) external view returns (bool exists, BosonTypes.Twin memory twin);

    /**
     * @notice Gets the next twin id.
     *
     * Does not increment the counter.
     *
     * @return nextTwinId - the next twin id
     */
    function getNextTwinId() external view returns (uint256 nextTwinId);
}
