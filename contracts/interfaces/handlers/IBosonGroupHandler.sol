// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {BosonTypes} from "../../domain/BosonTypes.sol";
import {IBosonGroupEvents} from "../events/IBosonGroupEvents.sol";

/**
 * @title IBosonGroupHandler
 *
 * @notice Handles creation, voiding, and querying of groups within the protocol.
 *
 * The ERC-165 identifier for this interface is: 0x4d0d87ad
 */
interface IBosonGroupHandler is IBosonGroupEvents {

    /**
     * @notice Creates a group.
     *
     * Emits a GroupCreated event if successful.
     *
     * Reverts if:
     *
     * - caller is not an operator
     * - any of offers belongs to different seller
     * - any of offers does not exist
     * - offer exists in a different group
     * - number of offers exceeds maximum allowed number per group
     *
     * @param _group - the fully populated struct with group id set to 0x0
     */
    function createGroup(BosonTypes.Group memory _group) external;

    /**
     * @notice Adds offers to an existing group
     *
     * Emits a GroupUpdated event if successful.
     *
     * Reverts if:
     *
     * - caller is not the seller
     * - offer ids is an empty list
     * - number of offers exceeds maximum allowed number per group
     * - group does not exist
     * - any of offers belongs to different seller
     * - any of offers does not exist
     * - offer exists in a different group
     * - offer ids contains duplicated offers
     *
     * @param _groupId  - the id of the group to be updated
     * @param _offerIds - array of offer ids to be added to the group
     */
    function addOffersToGroup(uint256 _groupId, uint256[] calldata _offerIds) external;

    /**
     * @notice Removes offers from an existing group
     *
     * Emits a GroupUpdated event if successful.
     *
     * Reverts if:
     *
     * - caller is not the seller
     * - offer ids is an empty list
     * - number of offers exceeds maximum allowed number per group
     * - group does not exist
     * - any offer is not part of the group
     *
     * @param _groupId  - the id of the group to be updated
     * @param _offerIds - array of offer ids to be removed to the group
     */
    function removeOffersFromGroup(uint256 _groupId, uint256[] calldata _offerIds) external;

    /**
     * @notice Sets the condition of an existing group.
     *
     * Emits a GroupUpdated event if successful.
     *
     * Reverts if:
     *
     * - seller does not match caller
     * - group does not exist
     *
     * @param _groupId - the id of the group to set the condition
     * @param _condition - fully populated condition struct
     *
     */
    function setGroupCondition(uint256 _groupId, BosonTypes.Condition calldata _condition) external;

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
