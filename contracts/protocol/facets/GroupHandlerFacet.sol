// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { IBosonGroupHandler } from "../../interfaces/IBosonGroupHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { ProtocolBase } from "../ProtocolBase.sol";
import { ProtocolLib } from "../ProtocolLib.sol";

/**
 * @title GroupHandlerFacet
 *
 * @notice Handles groups within the protocol
 */
contract GroupHandlerFacet is IBosonGroupHandler, ProtocolBase {

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
        // TODO: assign correct sellerid to the group
        // _group.sellerId = getSellerIdByOperator(msg.sender); 

        // limit maximum number of offers to avoid running into block gas limit in a loop
        require(_group.offerIds.length <= protocolStorage().maxOffersPerGroup, TOO_MANY_OFFERS);

        // Get the next group and increment the counter
        uint256 groupId = protocolCounters().nextGroupId++;

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

        // modify incoming struct so event value represents true state
        _group.id = groupId; 
      
        // Notify watchers of state change
        emit GroupCreated(groupId, _group.sellerId, _group);
    }

    /**
     * @notice Adds offers to an existing group
     *
     * Emits a GroupUpdated event if successful.
     *
     * Reverts if:
     * 
     * - caller is not the seller
     * - any of offers belongs to different seller
     * - any of offers does not exist
     * - offer exists in a different group
     * - number of offers exceeds maximum allowed number per group
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
        // limit maximum number of offers to avoid running into block gas limit in a loop
        require(_offerIds.length <= protocolStorage().maxOffersPerGroup, TOO_MANY_OFFERS);

        // Get storage location for group
        (bool exists, Group storage group) = fetchGroup(_groupId);

        require(exists, NO_SUCH_GROUP);

        // TODO check seller ID matches msg.sender
        // address sellerId = getSellerIdByOperator(msg.sender);
        // require(sellerId == group.sellerId, NOT_OPERATOR);

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
        emit GroupUpdated(_groupId, group.sellerId, group); // TODO: group.sellerId will be replaced by sellerId
    }

    /**
     * @notice Removes offers from an existing group
     *
     * Emits a GroupUpdated event if successful.
     *
     * Reverts if:
     * 
     * - caller is not the seller
     * - any offer is not part of the group
     * - number of offers exceeds maximum allowed number per group
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
        // limit maximum number of offers to avoid running into block gas limit in a loop
        require(_offerIds.length <= protocolStorage().maxOffersPerGroup, TOO_MANY_OFFERS);

        // Get storage location for group
        (bool exists, Group storage group) = fetchGroup(_groupId);

        require(exists, NO_SUCH_GROUP);

        // TODO check seller ID matches msg.sender
        // address sellerId = getSellerIdByOperator(msg.sender);
        // require(sellerId == group.sellerId, NOT_OPERATOR);

        for (uint i = 0; i < _offerIds.length; i++) {
            uint offerId = _offerIds[i];
            
            // Offer should belong to the group
            (, uint256 groupId) = getGroupIdByOffer(offerId);
            require(_groupId == groupId, OFFER_NOT_IN_GROUP);

            // remove groupIdByOffer mapping
            delete protocolStorage().groupIdByOffer[offerId];

            // remove from to group struct
            group.offerIds.push(_offerIds[i]);
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
        emit GroupUpdated(_groupId, group.sellerId, group); // TODO: group.sellerId will be replaced by sellerId
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