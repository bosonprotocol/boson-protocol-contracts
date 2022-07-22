// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IBosonGroupEvents } from "../../interfaces/events/IBosonGroupEvents.sol";
import { ProtocolBase } from "./../bases/ProtocolBase.sol";
import { ProtocolLib } from "./../libs/ProtocolLib.sol";
import { INVALID_CONDITION_PARAMETERS, NOTHING_UPDATED, NOT_OPERATOR, NO_SUCH_GROUP, OFFER_MUST_BE_UNIQUE, TOO_MANY_OFFERS } from "./../../domain/BosonConstants.sol";

/**
 * @title GroupBase
 *
 * @dev Provides methods for group creation that can be shared accross facets
 */
contract GroupBase is ProtocolBase, IBosonGroupEvents {
    /**
     * @notice Creates a group.
     *
     * Emits a GroupCreated event if successful.
     *
     * Reverts if:
     *
     * - Caller is not an operator
     * - any of offers belongs to different seller
     * - any of offers does not exist
     * - offer exists in a different group
     * - number of offers exceeds maximum allowed number per group
     *
     * @param _group - the fully populated struct with group id set to 0x0
     */
    function createGroupInternal(Group memory _group) internal {
        // get seller id, make sure it exists and store it to incoming struct
        (bool exists, uint256 sellerId) = getSellerIdByOperator(msgSender());
        require(exists, NOT_OPERATOR);

        // limit maximum number of offers to avoid running into block gas limit in a loop
        require(_group.offerIds.length <= protocolLimits().maxOffersPerGroup, TOO_MANY_OFFERS);

        // condition must be valid
        require(validateCondition(_group.condition), INVALID_CONDITION_PARAMETERS);

        // Get the next group and increment the counter
        uint256 groupId = protocolCounters().nextGroupId++;

        for (uint256 i = 0; i < _group.offerIds.length; i++) {
            // make sure offer exists and belongs to the seller
            getValidOffer(_group.offerIds[i]);

            // Offer should not belong to another group already
            (bool exist, ) = getGroupIdByOffer(_group.offerIds[i]);
            require(!exist, OFFER_MUST_BE_UNIQUE);

            // add to groupIdByOffer mapping
            protocolLookups().groupIdByOffer[_group.offerIds[i]] = groupId;
        }

        // Get storage location for group
        (, Group storage group) = fetchGroup(groupId);

        // Set group props individually since memory structs can't be copied to storage
        group.id = _group.id = groupId;
        group.sellerId = _group.sellerId = sellerId;
        group.offerIds = _group.offerIds;
        group.condition = _group.condition;

        // Notify watchers of state change
        emit GroupCreated(groupId, sellerId, _group, msgSender());
    }

    /**
     * @dev this might change, depending on how checks at the time of the commit will be implemented
     * @notice Validates that condition parameters make sense
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
    function addOffersToGroupInternal(uint256 _groupId, uint256[] memory _offerIds) internal {
        // check if group can be updated
        (uint256 sellerId, Group storage group) = preUpdateChecks(_groupId, _offerIds);

        for (uint256 i = 0; i < _offerIds.length; i++) {
            uint256 offerId = _offerIds[i];
            // make sure offer exist and belong to the seller
            getValidOffer(offerId);

            // Offer should not belong to another group already
            (bool exist, ) = getGroupIdByOffer(offerId);
            require(!exist, OFFER_MUST_BE_UNIQUE);

            // add to groupIdByOffer mapping
            protocolLookups().groupIdByOffer[offerId] = _groupId;

            // add to group struct
            group.offerIds.push(offerId);
        }

        // Notify watchers of state change
        emit GroupUpdated(_groupId, sellerId, group, msgSender());
    }

    /**
     * @dev Before performing an update, make sure update can be done
     * and return seller id and group storage pointer for further use
     *
     * Reverts if:
     *
     * - caller is not the seller
     * - offer ids is an empty list
     * - number of offers exceeds maximum allowed number per group
     * - group does not exist
     *
     * @param _groupId  - the id of the group to be updated
     * @param _offerIds - array of offer ids to be removed to the group
     * @return sellerId  - the seller Id
     * @return group - the group details
     */
    function preUpdateChecks(uint256 _groupId, uint256[] memory _offerIds)
        internal
        view
        returns (uint256 sellerId, Group storage group)
    {
        // make sure that at least something will be updated
        require(_offerIds.length != 0, NOTHING_UPDATED);

        // limit maximum number of offers to avoid running into block gas limit in a loop
        require(_offerIds.length <= protocolLimits().maxOffersPerGroup, TOO_MANY_OFFERS);

        // Get storage location for group
        bool exists;
        (exists, group) = fetchGroup(_groupId);

        require(exists, NO_SUCH_GROUP);

        // Get seller id, we assume seller id exists if group exists
        (, sellerId) = getSellerIdByOperator(msgSender());

        // Caller's seller id must match group seller id
        require(sellerId == group.sellerId, NOT_OPERATOR);
    }
}
