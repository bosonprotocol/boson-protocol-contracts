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
     * - seller does not match caller
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
        // TODO: check seller ID matches msg.sender

        // limit maximum number of offers to avoid running into block gas limit in a loop
        require(_group.offerIds.length <= protocolStorage().maxOffersPerGroup, TOO_MANY_OFFERS);

        // Get the next group and increment the counter
        uint256 groupId = protocolCounters().nextGroupId++;

        for (uint i = 0; i < _group.offerIds.length; i++) {
            // make sure all offers exist and belong to the seller
            getValidOffer(_group.offerIds[i]);
            
            // Add to groupByOffer mapping
            require(protocolStorage().groupByOffer[_group.offerIds[i]] == 0, OFFER_MUST_BE_UNIQUE);
            protocolStorage().groupByOffer[_group.offerIds[i]] = groupId;
        }
       
        // Get storage location for group
        (,Group storage group) = fetchGroup(groupId);

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


}