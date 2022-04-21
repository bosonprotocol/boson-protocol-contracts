// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { IBosonOrchestrationHandler } from "../../interfaces/handlers/IBosonOrchestrationHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { AccountBase } from "../bases/AccountBase.sol";
import { GroupBase } from "../bases/GroupBase.sol";
import { OfferBase } from "../bases/OfferBase.sol";
import { TwinBase } from "../bases/TwinBase.sol";
import { BundleBase } from "../bases/BundleBase.sol";

/**
 * @title OrchestrationHandlerFacet
 *
 * @notice Combines creation of multiple entities (accounts, offers, groups, twins, bundles) in a single transaction
 */
contract OrchestrationHandlerFacet is AccountBase, OfferBase, GroupBase, TwinBase, BundleBase, IBosonOrchestrationHandler {

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
    override
    {   
        checkAndCreateSeller(_seller);
        createOfferInternal(_offer);
    }

    /**
     * @notice Takes an offer and a condition, creates an offer, then a group with that offer and the given condition.
     *
     * Emits an OfferCreated and a GroupCreated event if successful.
     *
     * Reverts if:
     * - in offer struct:
     *   - Caller is not an operator
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Buyer cancel penalty is greater than price
     *   - Voided is set to true
     * - Condition includes invalid combination of parameters
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _condition - the fully populated condition struct
     */
    function createOfferWithCondition(
        Offer memory _offer,
        Condition memory _condition
    )
    public
    override
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


    /**
     * @notice Takes an offer and a twin, creates an offer, creates a twin, then a bundle with that offer and the given twin
     *
     * Emits an OfferCreated, a TwinCreated and a BundleCreated event if successful.
     *
     * Reverts if:
     * - in offer struct:
     *   - Caller is not an operator
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Buyer cancel penalty is greater than price
     *   - Voided is set to true
     * - when creating twin if
     *   - Not approved to transfer the seller's token
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _twin - the fully populated twin struct
     */
    function createOfferAndTwinWithBundle(
        Offer memory _offer,
        Twin memory _twin
    )
    public 
    override {
        // create seller and update structs values to represent true state
        createOfferInternal(_offer);

        // create twin and update structs values to represent true state
        createTwinInternal(_twin);

        // construct new bundle
        // - bundleId is 0, and it is ignored
        // - note that _offer fields are updated during createOfferInternal, so they represent correct values
        Bundle memory _bundle = Bundle(0, _offer.sellerId, new uint256[](1), new uint256[](1));
        _bundle.offerIds[0] = _offer.id;
        _bundle.twinIds[0] = _twin.id;

        // create bundle and update structs values to represent true state
        createBundleInternal(_bundle);

    }

    /**
     * @notice Takes a seller, an offer and a condition, creates a seller, creates an offer, then a group with that offer and the given condition.
     *
     * Emits a SellerCreated, an OfferCreated and a GroupCreated event if successful.
     *
     * Reverts if:
     * - caller is not the same as operator address
     * - in seller struct:
     *   - Address values are zero address
     *   - Addresses are not unique to this seller
     *   - Seller is not active (if active == false)
     * - in offer struct:
     *   - Caller is not an operator
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Buyer cancel penalty is greater than price
     *   - Voided is set to true
     * - Condition includes invalid combination of parameters
     *
     * @param _seller - the fully populated seller struct
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _condition - the fully populated condition struct
     */
    function createSellerAndOfferWithCondition(
        Seller memory _seller,
        Offer memory _offer,
        Condition memory _condition
    )
    external 
    override {
        checkAndCreateSeller(_seller);
        createOfferWithCondition(_offer, _condition);
    } 

    /**
     * @notice Takes a seller, an offer and a twin, creates a seller, creates an offer, creates a twin, then a bundle with that offer and the given twin
     *
     * Emits a SellerCreated, an OfferCreated, a TwinCreated and a BundleCreated event if successful.
     *
     * Reverts if:
     * - caller is not the same as operator address
     * - in seller struct:
     *   - Address values are zero address
     *   - Addresses are not unique to this seller
     *   - Seller is not active (if active == false)
     * - in offer struct:
     *   - Caller is not an operator
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Buyer cancel penalty is greater than price
     *   - Voided is set to true
     * - when creating twin if
     *   - Not approved to transfer the seller's token
     *
     * @param _seller - the fully populated seller struct
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _twin - the fully populated twin struct
     */
    function createSellerAndOfferAndTwinWithBundle(
        Seller memory _seller,
        Offer memory _offer,
        Twin memory _twin
    )
    external 
    override {
        checkAndCreateSeller(_seller);
        createOfferAndTwinWithBundle(_offer, _twin);
    }

    /**
     * @notice Make sure that call is tha same as operator address and creates a seller
     *
     * Emits a SellerCreated.
     *
     * Reverts if:
     * - caller is not the same as operator address
     * - in seller struct:
     *   - Address values are zero address
     *   - Addresses are not unique to this seller
     *   - Seller is not active (if active == false)
     *
     * @param _seller - the fully populated seller struct
     */
    function checkAndCreateSeller(Seller memory _seller) internal {
        // Caller should be the operator, specified in seller
        require(_seller.operator == msg.sender, NOT_OPERATOR);

        // create seller and update structs values to represent true state
        createSellerInternal(_seller);
    }

}