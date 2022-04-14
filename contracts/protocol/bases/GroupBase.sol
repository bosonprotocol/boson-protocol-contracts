// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IBosonGroupEvents } from "../../interfaces/events/IBosonGroupEvents.sol";
import { ProtocolBase } from "./../bases/ProtocolBase.sol";
import { ProtocolLib } from "./../libs/ProtocolLib.sol";

/**
 * @title GroupBase
 *
 * @dev Provides methods for group creation that can be shared accross facets
 */
contract GroupBase is ProtocolBase, IBosonGroupEvents {
    /**
     * @notice Creates a group.
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
     * @return groupId id of newly created group
     * @return sellerId id of the group's seller
     */
    function createGroupInternal(
        Group memory _group
    )
    internal returns (uint256 groupId, uint256 sellerId)
    {
        // get seller id, make sure it exists and store it to incoming struct
        bool exists;
        (exists, sellerId) = getSellerIdByOperator(msg.sender);
        require(exists, NOT_OPERATOR);
        
        // limit maximum number of offers to avoid running into block gas limit in a loop
        require(_group.offerIds.length <= protocolStorage().maxOffersPerGroup, TOO_MANY_OFFERS);
        
        // condition must be valid
        require(validateCondition(_group.condition), INVALID_CONDITION_PARAMETERS);

        // Get the next group and increment the counter
        groupId = protocolCounters().nextGroupId++;

        for (uint i = 0; i < _group.offerIds.length; i++) {
            // make sure offer exists and belongs to the seller
            getValidOffer(_group.offerIds[i]);
            
            // Offer should not belong to another group already
            (bool exist, ) = getGroupIdByOffer(_group.offerIds[i]);
            require(!exist, OFFER_MUST_BE_UNIQUE);

            // add to groupIdByOffer mapping
            protocolStorage().groupIdByOffer[_group.offerIds[i]] = groupId;
        }
       
        // Get storage location for group
        (, Group storage group) = fetchGroup(groupId);

        // Set group props individually since memory structs can't be copied to storage
        group.id = _group.id = groupId;
        group.sellerId = _group.sellerId = sellerId;
        group.offerIds = _group.offerIds;
        group.condition = _group.condition;

        // Notify watchers of state change
        emit GroupCreated(groupId, sellerId, _group);

    }

       /**
     * @dev this might change, depending on how checks at the time of the commit will be implemented
     * @notice Validates that condition parameters make sense 
     *
     * Reverts if:
     * 
     * - evaluation method None has fields different from 0
     * - evaluation method AboveThreshold contract address is zero address
     * - evaluation method SpecificToken contract address is zero address
     *
     * @param _condition - fully populated condition struct
     * @return valid - validity of condition
     * 
     */
    function validateCondition(Condition memory _condition) internal pure returns (bool valid) {
        if (_condition.method == EvaluationMethod.None) {
            valid  = _condition.tokenAddress == address(0) && _condition.tokenId == 0 && _condition.threshold == 0;
        } else if (_condition.method ==  EvaluationMethod.AboveThreshold) {
            valid = _condition.tokenAddress != address(0);
        } else if (_condition.method ==  EvaluationMethod.SpecificToken){
            valid = _condition.tokenAddress != address(0);
        }
    }
}
