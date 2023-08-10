// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.21;

import { BosonTypes } from "../../domain/BosonTypes.sol";
import { IBosonGroupEvents } from "../events/IBosonGroupEvents.sol";

/**
 * @title IBosonGroupHandler
 *
 * @notice Handles creation, voiding, and querying of groups within the protocol.
 *
 * The ERC-165 identifier for this interface is: 0x1260850f
 */
interface IBosonGroupHandler is IBosonGroupEvents {
    /**
     * @notice Creates a group.
     *
     * Emits a GroupCreated event if successful.
     *
     * Reverts if:
     * - Caller is not an assistant
     * - Any of offers belongs to different seller
     * - Any of offers does not exist
     * - Offer exists in a different group
     *
     * @param _group - the fully populated struct with group id set to 0x0
     * @param _condition - the fully populated condition struct
     */
    function createGroup(BosonTypes.Group memory _group, BosonTypes.Condition calldata _condition) external;

    /**
     * @notice Adds offers to an existing group.
     *
     * Emits a GroupUpdated event if successful.
     *
     * Reverts if:
     * - Caller is not the seller
     * - Offer ids param is an empty list
     * - Group does not exist
     * - Any of offers belongs to different seller
     * - Any of offers does not exist
     * - Offer exists in a different group
     * - Offer ids param contains duplicated offers
     *
     * @param _groupId  - the id of the group to be updated
     * @param _offerIds - array of offer ids to be added to the group
     */
    function addOffersToGroup(uint256 _groupId, uint256[] calldata _offerIds) external;

    /**
     * @notice Removes offers from an existing group.
     *
     * Emits a GroupUpdated event if successful.
     *
     * Reverts if:
     * - The groups region of protocol is paused
     * - Caller is not the seller
     * - Offer ids param is an empty list
     * - Group does not exist
     * - Any offer is not part of the group
     *
     * @param _groupId  - the id of the group to be updated
     * @param _offerIds - array of offer ids to be removed from the group
     */
    function removeOffersFromGroup(uint256 _groupId, uint256[] calldata _offerIds) external;

    /**
     * @notice Sets the condition of an existing group.
     *
     * Emits a GroupUpdated event if successful.
     *
     * Reverts if:
     * - The groups region of protocol is paused
     * - Condition includes invalid combination of fields
     * - Seller does not match caller
     * - Group does not exist
     *
     * @param _groupId - the id of the group whose condition will be set
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
     * @return condition - the group's condition details. See {BosonTypes.Condition}
     */
    function getGroup(
        uint256 _groupId
    ) external view returns (bool exists, BosonTypes.Group memory group, BosonTypes.Condition memory condition);

    /**
     * @notice Gets the next group id.
     *
     * @dev Does not increment the counter.
     *
     * @return nextGroupId - the next group id
     */
    function getNextGroupId() external view returns (uint256 nextGroupId);
}
