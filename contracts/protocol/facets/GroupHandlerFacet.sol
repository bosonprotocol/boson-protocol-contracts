// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { IBosonGroupHandler } from "../../interfaces/handlers/IBosonGroupHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { GroupBase } from "../bases/GroupBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";

/**
 * @title GroupHandlerFacet
 *
 * @notice Handles groups within the protocol
 */
contract GroupHandlerFacet is IBosonGroupHandler, GroupBase {

    /**
     * @notice Facet Initializer
     */
    function initialize()
    public
    onlyUnInitialized(type(IBosonGroupHandler).interfaceId)
    {
        DiamondLib.addSupportedInterface(type(IBosonGroupHandler).interfaceId);
    }

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
    function createGroup(
        Group memory _group
    )
    external
    override
    {
        createGroupInternal(_group);
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
    function addOffersToGroup(
        uint256 _groupId,
        uint256[] calldata _offerIds
    )
    external
    override
    {
        // check if group can be updated
        (uint256 sellerId, Group storage group) = preUpdateChecks(_groupId, _offerIds);

        for (uint i = 0; i < _offerIds.length; i++) {
            uint offerId = _offerIds[i];
            // make sure offer exist and belong to the seller
            getValidOffer(offerId);
            
            // Offer should not belong to another group already
            (bool exist, ) = getGroupIdByOffer(offerId);
            require(!exist, OFFER_MUST_BE_UNIQUE);

            // add to groupIdByOffer mapping
            protocolStorage().groupIdByOffer[offerId] = _groupId;

            // add to group struct
            group.offerIds.push(offerId);
        }
             
        // Notify watchers of state change
        emit GroupUpdated(_groupId, sellerId, group);
    }

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
    function removeOffersFromGroup(
        uint256 _groupId,
        uint256[] calldata _offerIds
    )
    external
    override
    {
        // check if group can be updated
        (uint256 sellerId, Group storage group) = preUpdateChecks(_groupId, _offerIds);

        for (uint i = 0; i < _offerIds.length; i++) {
            uint offerId = _offerIds[i];
            
            // Offer should belong to the group
            (, uint256 groupId) = getGroupIdByOffer(offerId);
            require(_groupId == groupId, OFFER_NOT_IN_GROUP);

            // remove groupIdByOffer mapping
            delete protocolStorage().groupIdByOffer[offerId];

            // remove from the group struct
            uint256 offerIdsLength = group.offerIds.length;

            for (uint j = 0; j < offerIdsLength; j++) {
                if (group.offerIds[j] == offerId) {                    
                    group.offerIds[j] = group.offerIds[offerIdsLength - 1];
                    group.offerIds.pop();
                    break;
                }
            }
        }
             
        // Notify watchers of state change
        emit GroupUpdated(_groupId, sellerId, group);
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
    function preUpdateChecks(uint256 _groupId, uint256[] calldata _offerIds) internal view returns (uint256 sellerId, Group storage group) {
        // make sure that at least something will be updated
        require(_offerIds.length != 0, NOTHING_UPDATED);

        // limit maximum number of offers to avoid running into block gas limit in a loop
        require(_offerIds.length <= protocolStorage().maxOffersPerGroup, TOO_MANY_OFFERS);

        // Get storage location for group
        bool exists;
        (exists, group) = fetchGroup(_groupId);

        require(exists, NO_SUCH_GROUP);

        // Get seller id, we assume seller id exists if group exists
        (, sellerId) = getSellerIdByOperator(msg.sender);

        // Caller's seller id must match group seller id
        require(sellerId == group.sellerId, NOT_OPERATOR);
    }

      /**
     * @notice Sets the condition of an existing group.
     *
     * Emits a GroupUpdated event if successful.
     *
     * Reverts if:
     * 
     * - condition includes invalid combination of fields
     * - seller does not match caller
     * - group does not exist
     *
     * @param _groupId - the id of the group to set the condition
     * @param _condition - fully populated condition struct
     * 
     */
    function setGroupCondition(
        uint256 _groupId,
        Condition calldata _condition
    )
    external
    override {
        // validate condition parameters
        require(validateCondition(_condition), INVALID_CONDITION_PARAMETERS);
        
        // verify group exists
        (bool exists,Group storage group) = fetchGroup(_groupId);
        require(exists, NO_SUCH_GROUP);

        // Get seller id, we assume seller id exists if offer exists
        (, uint256 sellerId) = getSellerIdByOperator(msg.sender);

        // Caller's seller id must match group seller id
        require(sellerId == group.sellerId, NOT_OPERATOR);

        group.condition = _condition;
      
        // Notify watchers of state change
        emit GroupUpdated(group.id, sellerId, group);
    }

    /**
     * @notice Gets the details about a given group.
     *
     * @param _groupId - the id of the group to check
     * @return exists - the group was found
     * @return group - the group details. See {BosonTypes.Group}
     */
    function getGroup(uint256 _groupId)
    external
    view
    returns(bool exists, Group memory group) {
        return fetchGroup(_groupId);
    }

     /**
     * @notice Gets the next group id.
     *
     * Does not increment the counter.
     *
     * @return nextGroupId - the next group id
     */
    function getNextGroupId()
    public
    view
    returns(uint256 nextGroupId) {

        nextGroupId = protocolCounters().nextGroupId;

    }
}