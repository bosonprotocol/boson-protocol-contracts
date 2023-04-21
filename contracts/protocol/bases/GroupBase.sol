// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "./../../domain/BosonConstants.sol";
import { IBosonGroupEvents } from "../../interfaces/events/IBosonGroupEvents.sol";
import { ProtocolBase } from "./../bases/ProtocolBase.sol";
import { ProtocolLib } from "./../libs/ProtocolLib.sol";

/**
 * @title GroupBase
 *
 * @notice Provides methods for group creation that can be shared across facets
 */
contract GroupBase is ProtocolBase, IBosonGroupEvents {
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
     * - Number of offers exceeds maximum allowed number per group
     *
     * @param _group - the fully populated struct with group id set to 0x0
     * @param _condition - the fully populated condition struct
     */
    function createGroupInternal(Group memory _group, Condition calldata _condition) internal {
        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        // get message sender
        address sender = msgSender();

        // get seller id, make sure it exists and store it to incoming struct
        (bool exists, uint256 sellerId) = getSellerIdByAssistant(sender);
        require(exists, NOT_ASSISTANT);

        // limit maximum number of offers to avoid running into block gas limit in a loop
        require(_group.offerIds.length <= protocolLimits().maxOffersPerGroup, TOO_MANY_OFFERS);

        // condition must be valid
        require(validateCondition(_condition), INVALID_CONDITION_PARAMETERS);

        // Get the next group and increment the counter
        uint256 groupId = protocolCounters().nextGroupId++;

        for (uint256 i = 0; i < _group.offerIds.length; i++) {
            // make sure offer exists and belongs to the seller
            getValidOffer(_group.offerIds[i]);

            // Offer should not belong to another group already
            (bool exist, ) = getGroupIdByOffer(_group.offerIds[i]);
            require(!exist, OFFER_MUST_BE_UNIQUE);

            // add to groupIdByOffer mapping
            lookups.groupIdByOffer[_group.offerIds[i]] = groupId;

            // Set index mapping. Should be index in offerIds + 1
            lookups.offerIdIndexByGroup[groupId][_group.offerIds[i]] = i + 1;
        }

        // Get storage location for group
        (, Group storage group) = fetchGroup(groupId);

        // Set group props individually since memory structs can't be copied to storage
        group.id = _group.id = groupId;
        group.sellerId = _group.sellerId = sellerId;
        group.offerIds = _group.offerIds;

        // Store the condition
        storeCondition(groupId, _condition);

        // Notify watchers of state change
        emit GroupCreated(groupId, sellerId, _group, _condition, sender);
    }

    /**
     * @notice Store a condition struct associated with a given group id.
     *
     * @param _groupId - the group id
     * @param _condition - the condition
     */
    function storeCondition(uint256 _groupId, Condition calldata _condition) internal {
        // Get storage locations for condition
        Condition storage condition = fetchCondition(_groupId);

        // Set condition props individually since calldata structs can't be copied to storage
        condition.method = _condition.method;
        condition.tokenType = _condition.tokenType;
        condition.tokenAddress = _condition.tokenAddress;
        condition.tokenId = _condition.tokenId;
        condition.threshold = _condition.threshold;
        condition.maxCommits = _condition.maxCommits;
    }

    /**
     * @notice Validates that condition parameters make sense.
     *
     * Reverts if:
     * - EvaluationMethod.None and has fields different from 0
     * - EvaluationMethod.Threshold and token address or maxCommits is zero
     * - EvaluationMethod.SpecificToken and token address or maxCommits is zero
     *
     * @param _condition - fully populated condition struct
     * @return valid - validity of condition
     *
     */
    function validateCondition(Condition memory _condition) internal pure returns (bool valid) {
        if (_condition.method == EvaluationMethod.None) {
            valid = (_condition.tokenAddress == address(0) &&
                _condition.tokenId == 0 &&
                _condition.threshold == 0 &&
                _condition.maxCommits == 0);
        } else if (_condition.method == EvaluationMethod.Threshold) {
            valid = (_condition.tokenAddress != address(0) && _condition.maxCommits > 0 && _condition.threshold > 0);
        } else if (_condition.method == EvaluationMethod.SpecificToken) {
            valid = (_condition.tokenAddress != address(0) && _condition.threshold == 0 && _condition.maxCommits > 0);
        }
    }

    /**
     * @notice Adds offers to an existing group.
     *
     * Emits a GroupUpdated event if successful.
     *
     * Reverts if:
     * - Caller is not the seller
     * - Offer ids param is an empty list
     * - Current number of offers plus number of offers added exceeds maximum allowed number per group
     * - Group does not exist
     * - Any of offers belongs to different seller
     * - Any of offers does not exist
     * - Offer exists in a different group
     * - Offer ids param contains duplicated offers
     *
     * @param _groupId  - the id of the group to be updated
     * @param _offerIds - array of offer ids to be added to the group
     */
    function addOffersToGroupInternal(uint256 _groupId, uint256[] memory _offerIds) internal {
        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        // check if group can be updated
        (uint256 sellerId, Group storage group) = preUpdateChecks(_groupId, _offerIds);

        // limit maximum number of total offers to avoid running into block gas limit in a loop
        // and make sure total number of offers in group does not exceed max
        require(group.offerIds.length + _offerIds.length <= protocolLimits().maxOffersPerGroup, TOO_MANY_OFFERS);

        for (uint256 i = 0; i < _offerIds.length; i++) {
            uint256 offerId = _offerIds[i];
            // make sure offer exist and belong to the seller
            getValidOffer(offerId);

            // Offer should not belong to another group already
            (bool exist, ) = getGroupIdByOffer(offerId);
            require(!exist, OFFER_MUST_BE_UNIQUE);

            // add to groupIdByOffer mapping
            lookups.groupIdByOffer[offerId] = _groupId;

            // add to group struct
            group.offerIds.push(offerId);

            // Set index mapping. Should be index in offerIds + 1
            lookups.offerIdIndexByGroup[_groupId][offerId] = group.offerIds.length;
        }

        // Get the condition
        Condition storage condition = fetchCondition(_groupId);

        // Notify watchers of state change
        emit GroupUpdated(_groupId, sellerId, group, condition, msgSender());
    }

    /**
     * @notice Checks that update can be done before performing an update
     * and returns seller id and group storage pointer for further use.
     *
     * Reverts if:
     * - Caller is not the seller
     * - Offer ids param is an empty list
     * - Number of offers exceeds maximum allowed number per group
     * - Group does not exist
     *
     * @param _groupId  - the id of the group to be updated
     * @param _offerIds - array of offer ids to be added to or removed from the group
     * @return sellerId  - the seller id
     * @return group - the group details
     */
    function preUpdateChecks(uint256 _groupId, uint256[] memory _offerIds)
        internal
        view
        returns (uint256 sellerId, Group storage group)
    {
        // make sure that at least something will be updated
        require(_offerIds.length != 0, NOTHING_UPDATED);

        // Get storage location for group
        bool exists;
        (exists, group) = fetchGroup(_groupId);

        require(exists, NO_SUCH_GROUP);

        // Get seller id, we assume seller id exists if group exists
        (, sellerId) = getSellerIdByAssistant(msgSender());

        // Caller's seller id must match group seller id
        require(sellerId == group.sellerId, NOT_ASSISTANT);
    }
}
