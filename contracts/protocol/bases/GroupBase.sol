// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

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
     * - Condition fields are invalid
     *
     * @param _group - the fully populated struct with group id set to 0x0
     * @param _condition - the fully populated condition struct
     * @param _authenticate - whether to authenticate the caller. Use false when called from a handler that already authenticated the caller. _group.sellerId must be set in this case.
     */
    function createGroupInternal(Group memory _group, Condition calldata _condition, bool _authenticate) internal {
        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        // get message sender
        address sender = _msgSender();

        // authenticate caller if needed
        if (_authenticate) {
            bool exists;
            (exists, _group.sellerId) = getSellerIdByAssistant(sender);
            if (!exists) revert NotAssistant();
        }

        // condition must be valid
        if (!validateCondition(_condition)) revert InvalidConditionParameters();

        // Get the next group and increment the counter
        uint256 groupId = protocolCounters().nextGroupId++;

        for (uint256 i; i < _group.offerIds.length; ++i) {
            // make sure offer exists and belongs to the seller
            if (_authenticate) getValidOfferWithSellerCheck(_group.offerIds[i]);

            // Offer should not belong to another group already
            (bool exist, ) = getGroupIdByOffer(_group.offerIds[i]);
            if (exist) revert OfferMustBeUnique();

            // add to groupIdByOffer mapping
            lookups.groupIdByOffer[_group.offerIds[i]] = groupId;

            // Set index mapping. Should be index in offerIds + 1
            lookups.offerIdIndexByGroup[groupId][_group.offerIds[i]] = i + 1;
        }

        // Get storage location for group
        (, Group storage group) = fetchGroup(groupId);

        // Set group props individually since memory structs can't be copied to storage
        group.id = _group.id = groupId;
        group.sellerId = _group.sellerId;
        group.offerIds = _group.offerIds;

        // Store the condition
        storeCondition(groupId, _condition);

        // Notify watchers of state change
        emit GroupCreated(groupId, _group.sellerId, _group, _condition, sender);
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
     *    - Token address, maxCommits, or threshold is zero.
     *    - Min token id is greater than max token id.
     *    - TokenType is FungibleToken or NonFungibleToken and
     *       - Min token id is not 0
     *       - Gating is not PerAddress
     * - EvaluationMethod.SpecificToken:
     *    - TokenType is FungibleToken or MultiToken
     *    - Token address, maxCommits is zero.
     *    - Threshold is not zero.
     *    - Min token id is greater than max token id.
     *
     * @param _condition - fully populated condition struct
     * @return valid - validity of condition
     *
     */
    function validateCondition(Condition calldata _condition) internal pure returns (bool) {
        if (_condition.method == EvaluationMethod.None) {
            // bitwise OR of all fields should be zero
            return
                (uint8(_condition.tokenType) |
                    uint160(_condition.tokenAddress) |
                    uint8(_condition.gating) |
                    _condition.minTokenId |
                    _condition.threshold |
                    _condition.maxCommits |
                    _condition.maxTokenId) == 0;
        }

        // SpecificToken or Threshold
        if (
            _condition.maxCommits == 0 ||
            _condition.tokenAddress == address(0) ||
            _condition.minTokenId > _condition.maxTokenId
        ) return false;

        if (_condition.method == EvaluationMethod.Threshold) {
            if (_condition.threshold == 0) return false;

            // Fungible token and NonFungible token cannot have token id range or per token id gating
            if (
                _condition.tokenType != TokenType.MultiToken &&
                (_condition.minTokenId != 0 || _condition.gating != GatingType.PerAddress)
            ) return false;
        } else {
            // SpecificToken
            // Only NonFungible is allowed
            return (_condition.tokenType == TokenType.NonFungibleToken && _condition.threshold == 0);
        }

        return true;
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

        for (uint256 i = 0; i < _offerIds.length; ) {
            uint256 offerId = _offerIds[i];

            getValidOfferWithSellerCheck(offerId);

            // Offer should not belong to another group already
            (bool exist, ) = getGroupIdByOffer(offerId);
            if (exist) revert OfferMustBeUnique();

            // add to groupIdByOffer mapping
            lookups.groupIdByOffer[offerId] = _groupId;

            // add to group struct
            group.offerIds.push(offerId);

            // Set index mapping. Should be index in offerIds + 1
            lookups.offerIdIndexByGroup[_groupId][offerId] = group.offerIds.length;

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
        if (_offerIds.length == 0) revert NothingUpdated();

        // Get storage location for group
        bool exists;
        (exists, group) = fetchGroup(_groupId);

        if (!exists) revert NoSuchGroup();

        // Get seller id, we assume seller id exists if group exists
        (, sellerId) = getSellerIdByAssistant(_msgSender());

        // Caller's seller id must match group seller id
        if (sellerId != group.sellerId) revert NotAssistant();
    }
}
