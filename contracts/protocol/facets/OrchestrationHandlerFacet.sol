// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { IBosonOrchestrationHandler } from "../../interfaces/handlers/IBosonOrchestrationHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { AccountBase } from "../bases/AccountBase.sol";
import { GroupBase } from "../bases/GroupBase.sol";
import { OfferBase } from "../bases/OfferBase.sol";

/**
 * @title OrchestrationHandlerFacet
 *
 * @notice Combines creation of multiple entities (accounts, offers, groups, twins, bundles) in a single transaction
 */
contract OrchestrationHandlerFacet is AccountBase, OfferBase, GroupBase, IBosonOrchestrationHandler {

    /**
     * @notice Facet Initializer
     */
    function initialize()
    public
    onlyUnInitialized(type(IBosonOrchestrationHandler).interfaceId)
    {
        DiamondLib.addSupportedInterface(type(IBosonOrchestrationHandler).interfaceId);
    }

    /**
     * @notice Creates a seller and an offer in a single transaction.
     *
     * Emits a SellerCreated and an OfferCreated event if successful.
     *
     * Reverts if:
     * - caller is not the same as operator address
     * - in seller struct:
     *   - Address values are zero address
     *   - Addresses are not unique to this seller
     *   - Seller is not active (if active == false)
     * - in offer struct:
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Buyer cancel penalty is greater than price
     *   - Voided is set to true
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     */
    function createSellerAndOffer(
        Seller memory _seller,
        Offer memory _offer
    )
    external
    
    {   
        // Caller should be the operator, specified in seller
        require(_seller.operator == msg.sender, NOT_OPERATOR);

        // create seller and update structs values to represent true state
        createSellerInternal(_seller);
        createOfferInternal(_offer);
    }

    /**
     * @notice Takes an offer and a condition, creates an offer, then a group with that offer and the given condition.
     *
     * Emits a OfferCreated and an GroupCreated event if successful.
     *
     * Reverts if:
     * - in offer struct:
     *   - Caller is not an operator
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Buyer cancel penalty is greater than price
     *   - Voided is set to true
     * - condition includes invalid combination
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _condition - the fully populated condition struct
     */
    function createOfferWithCondition(
        Offer memory _offer,
        Condition memory _condition
    )
    external    
    {   
        // create seller and update structs values to represent true state
        createOfferInternal(_offer);

        // construct new group
        // - groupid is 0, and it is ignored
        // - note that _offer fields are updated during createOfferInternal, so they represent correct values
        Group memory _group = Group(0, _offer.sellerId, new uint256[](1), _condition);
        _group.offerIds[0] = _offer.id;

        // create group and update structs values to represent true state
        createGroupInternal(_group);
    } 
}