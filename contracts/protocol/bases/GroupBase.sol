// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { ProtocolBase } from "./../ProtocolBase.sol";
import { ProtocolLib } from "./../ProtocolLib.sol";

/**
 * @title GroupBase
 *
 * @dev Provides methods for group creation that can be shared accross facets
 */
contract GroupBase is ProtocolBase {
    /**
     * @notice Creates a group.
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
    function createGroupInternal(
        Group memory _group
    )
    internal returns (uint256 sellerId, uint256 groupId)
    {
        // get seller id, make sure it exists and store it to incoming struct
        bool exists;
        (exists, sellerId) = getSellerIdByOperator(msg.sender);
        require(exists, NO_SUCH_SELLER);
        
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
        group.id = groupId;
        group.sellerId = _group.sellerId;
        group.offerIds = _group.offerIds;
        group.condition = _group.condition;
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
