// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { IBosonGroupHandler } from "../../interfaces/handlers/IBosonGroupHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { GroupBase } from "../bases/GroupBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import "../../domain/BosonConstants.sol";

/**
 * @title GroupHandlerFacet
 *
 * @notice Handles grouping of offers and conditions.
 */
contract GroupHandlerFacet is IBosonGroupHandler, GroupBase {
    /**
     * @notice Facet Initializer
     * This function is callable only once.
     */
    function initialize() public onlyUninitialized(type(IBosonGroupHandler).interfaceId) {
        DiamondLib.addSupportedInterface(type(IBosonGroupHandler).interfaceId);
    }

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
     * - Condition fields are invalid
     *
     * @param _group - the fully populated struct with group id set to 0x0
     * @param _condition - the fully populated condition struct
     */
    function createGroup(
        Group memory _group,
        Condition calldata _condition
    ) external override groupsNotPaused nonReentrant {
        createGroupInternal(_group, _condition, true);
    }

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
     * @param _groupId - the id of the group to be updated
     * @param _offerIds - array of offer ids to be added to the group
     */
    function addOffersToGroup(
        uint256 _groupId,
        uint256[] calldata _offerIds
    ) external override groupsNotPaused nonReentrant {
        addOffersToGroupInternal(_groupId, _offerIds);
    }

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
     * @param _groupId - the id of the group to be updated
     * @param _offerIds - array of offer ids to be removed from the group
     */
    function removeOffersFromGroup(
        uint256 _groupId,
        uint256[] calldata _offerIds
    ) external override groupsNotPaused nonReentrant {
        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        // Check if group can be updated
        (uint256 sellerId, Group storage group) = preUpdateChecks(_groupId, _offerIds);

        for (uint256 i = 0; i < _offerIds.length; ) {
            uint256 offerId = _offerIds[i];

            // Offer should belong to the group
            (, uint256 groupId) = getGroupIdByOffer(offerId);
            if (_groupId != groupId) revert OfferNotInGroup();

            // Remove groupIdByOffer mapping
            delete lookups.groupIdByOffer[offerId];

            uint256 len = group.offerIds.length;
            // Get the index in the offerIds array, which is 1 less than the offerIdIndexByGroup index
            mapping(uint256 => uint256) storage offerIdIndexes = lookups.offerIdIndexByGroup[groupId];
            uint256 index = offerIdIndexes[offerId] - 1;

            if (index != len - 1) {
                // If index == len - 1 then only pop and delete are needed
                // Need to fill gap caused by delete if more than one element in storage array
                uint256 offerIdToMove = group.offerIds[len - 1];
                // Copy the last token in the array to this index to fill the gap
                group.offerIds[index] = offerIdToMove;
                // Reset index mapping. Should be index in offerIds array + 1
                offerIdIndexes[offerIdToMove] = index + 1;
            }
            // Delete last offer id in the array, which was just moved to fill the gap
            group.offerIds.pop();
            // Delete from index mapping
            delete offerIdIndexes[offerId];

            unchecked {
                i++;
            }
        }

        // Get the condition
        Condition storage condition = fetchCondition(_groupId);

        // Notify watchers of state change
        emit GroupUpdated(_groupId, sellerId, group, condition, _msgSender());
    }

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
    function setGroupCondition(
        uint256 _groupId,
        Condition calldata _condition
    ) external override groupsNotPaused nonReentrant {
        // Validate condition parameters
        if (!validateCondition(_condition)) revert InvalidConditionParameters();

        // Verify group exists
        (bool exists, Group storage group) = fetchGroup(_groupId);
        if (!exists) revert NoSuchGroup();

        // Get message sender
        address sender = _msgSender();

        // Get seller id, we assume seller id exists if offer exists
        (, uint256 sellerId) = getSellerIdByAssistant(sender);

        // Caller's seller id must match group seller id
        if (sellerId != group.sellerId) revert NotAssistant();

        // Store new condition
        storeCondition(_groupId, _condition);

        // Notify watchers of state change
        emit GroupUpdated(group.id, sellerId, group, _condition, sender);
    }

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
    ) external view override returns (bool exists, Group memory group, Condition memory condition) {
        (exists, group) = fetchGroup(_groupId);
        if (exists) {
            condition = fetchCondition(_groupId);
        }
    }

    /**
     * @notice Gets the next group id.
     *
     * @dev Does not increment the counter.
     *
     * @return nextGroupId - the next group id
     */
    function getNextGroupId() public view override returns (uint256 nextGroupId) {
        nextGroupId = protocolCounters().nextGroupId;
    }
}
