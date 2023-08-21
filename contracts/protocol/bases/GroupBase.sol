// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

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

        // condition must be valid
        require(validateCondition(_condition), INVALID_CONDITION_PARAMETERS);

        // Get the next group and increment the counter
        uint256 groupId = protocolCounters().nextGroupId++;

        for (uint256 i = 0; i < _group.offerIds.length; i++) {
            // make sure offer exists and belongs to the seller
            getValidOfferWithSellerCheck(_group.offerIds[i]);

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
        condition.gating = _condition.gating;
        condition.minTokenId = _condition.minTokenId;
        condition.threshold = _condition.threshold;
        condition.maxCommits = _condition.maxCommits;
        condition.maxTokenId = _condition.maxTokenId;
    }

    /**
     * @notice Validates that condition parameters make sense.
     *
     * An invalid condition is one that fits any of the following criteria:
     * - EvaluationMethod.None: any field different from zero
     * - EvaluationMethod.Threshold: 
          - Token address, maxCommits, or threshold is zero.
     *    - TokenType is FungibleToken or NonFungibleToken and length and tokenId are not 0.
     * - EvaluationMethod.Threshold:
     *    - token address, maxCommits or threshold is zero
     *    - tokenType is FungibleToken or NonFungibleToken and length and tokenId is not zero
     *    - tokenType is MultiToken and length is zero when tokenId is not zero or range overflow
     * - EvaluationMethod.SpecificToken:
     *    - tokenType is FungibleToken
     *    - tokenType is NonFungibleToken and threshold is not zero
     *    - tokenId is not zero and length is zero or range overflow
     *    - tokenType is MultiToken and threshold is zero
     *    - maxCommits is zero
     *    - token address is zero
     *
     * @param _condition - fully populated condition struct
     * @return valid - validity of condition
     *
     */
    function validateCondition(Condition calldata _condition) internal pure returns (bool) {
        bool valid = true;
        if (_condition.method == EvaluationMethod.None) {
            // ToDo: alternatively OR everything or calculate empty condition keccak
            valid = (_condition.tokenAddress == address(0) &&
                _condition.minTokenId == 0 &&
                _condition.threshold == 0 &&
                _condition.maxCommits == 0 &&
                _condition.maxTokenId == 0);
        } else {
            valid =
                _condition.maxCommits > 0 &&
                _condition.tokenAddress != address(0) &&
                _condition.minTokenId <= _condition.maxTokenId;

            if (_condition.method == EvaluationMethod.Threshold) {
                valid = valid && _condition.threshold > 0;

                if (_condition.tokenType != TokenType.MultiToken) {
                    // NonFungibleToken and FungibleToken should not the tokenId
                    valid = _condition.minTokenId == 0; // don't need to explicitly check maxTokenId since checks above imply it
                }
            } else {
                // SpecificToken
                // Only NonFungible is allowed
                valid = valid && (_condition.tokenType == TokenType.NonFungibleToken && _condition.threshold == 0);
            }
        }

        return valid;
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
     * @param _groupId  - the id of the group to be updated
     * @param _offerIds - array of offer ids to be added to the group
     */
    function addOffersToGroupInternal(uint256 _groupId, uint256[] memory _offerIds) internal {
        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        // check if group can be updated
        (uint256 sellerId, Group storage group) = preUpdateChecks(_groupId, _offerIds);

        for (uint256 i = 0; i < _offerIds.length; i++) {
            uint256 offerId = _offerIds[i];

            getValidOfferWithSellerCheck(offerId);

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
     * - Group does not exist
     *
     * @param _groupId  - the id of the group to be updated
     * @param _offerIds - array of offer ids to be added to or removed from the group
     * @return sellerId  - the seller id
     * @return group - the group details
     */
    function preUpdateChecks(
        uint256 _groupId,
        uint256[] memory _offerIds
    ) internal view returns (uint256 sellerId, Group storage group) {
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
