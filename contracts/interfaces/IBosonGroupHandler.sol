// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../domain/BosonTypes.sol";

/**
 * @title IBosonGroupHandler
 *
 * @notice Manages creation, voiding, and querying of groups within the protocol.
 *
 * The ERC-165 identifier for this interface is: 0xaf7dd438
 */
interface IBosonGroupHandler {
    /// Events
    event GroupCreated(uint256 indexed groupId, uint256 indexed sellerId, BosonTypes.Group group);

    /**
     * @notice Creates a group.
     *
     * Emits a GroupCreated event if successful.
     *
     * Reverts if:
     *
     * - any of offers belongs to different seller
     * - any of offers does not exist
     * - offer exists in a different group
     * - number of offers exceeds maximum allowed number per group
     *
     * @param _group - the fully populated struct with group id set to 0x0
     */
    function createGroup(BosonTypes.Group memory _group) external;

    /**
     * @notice Gets the details about a given group.
     *
     * @param _groupId - the id of the group to check
     * @return exists - the group was found
     * @return group - the group details. See {BosonTypes.Group}
     */
    function getGroup(uint256 _groupId) external view returns (bool exists, BosonTypes.Group memory group);

    /**
     * @notice Gets the next group id.
     *
     * Does not increment the counter.
     *
     * @return nextGroupId - the next group id
     */
    function getNextGroupId() external view returns (uint256 nextGroupId);
}
