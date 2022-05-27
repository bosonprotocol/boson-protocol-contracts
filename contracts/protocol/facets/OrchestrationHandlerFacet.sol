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
     *   - Voided is set to true
     *   - Seller deposit is less than protocol fee
     *   - Sum of buyer cancel penalty and protocol fee is greater than price
     * - Dispute duration is zero
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _seller - the fully populated seller struct
     * @param _disputeValidDuration - the duration of disputes for exchanges associated with the offer
     */
    function createSellerAndOffer(
        Seller memory _seller,
        Offer memory _offer,
        uint256 _disputeValidDuration
    )
    external
    override
    {   
        checkAndCreateSeller(_seller);
        createOfferInternal(_offer, _disputeValidDuration);
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
     *   - Voided is set to true
     *   - Seller deposit is less than protocol fee
     *   - Sum of buyer cancel penalty and protocol fee is greater than price
     * - Dispute duration is zero
     * - Condition includes invalid combination of parameters
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _disputeValidDuration - the duration of disputes for exchanges associated with the offer
     * @param _condition - the fully populated condition struct
     */
    function createOfferWithCondition(
        Offer memory _offer,
        uint256 _disputeValidDuration,
        Condition memory _condition
    )
    public
    override
    {   
        // create offer and update structs values to represent true state
        createOfferInternal(_offer, _disputeValidDuration);

        // construct new group
        // - groupid is 0, and it is ignored
        // - note that _offer fields are updated during createOfferInternal, so they represent correct values
        Group memory _group = Group(0, _offer.sellerId, new uint256[](1), _condition);
        _group.offerIds[0] = _offer.id;

        // create group and update structs values to represent true state
        createGroupInternal(_group);
    } 

    /**
    * @notice Takes an offer and group ID, creates an offer and adds it to the existing group with given id
    *
    * Emits an OfferCreated and a GroupUpdated event if successful.
    *
    * Reverts if:
    * - in offer struct:
    *   - Caller is not an operator
    *   - Valid from date is greater than valid until date
    *   - Valid until date is not in the future
    *   - Voided is set to true
    *   - Seller deposit is less than protocol fee
    *   - Sum of buyer cancel penalty and protocol fee is greater than price
    * - Dispute duration is zero
    * - when adding to the group if:
    *   - Group does not exists
    *   - Caller is not the operator of the group
    *
    * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
    * @param _disputeValidDuration - the duration of disputes for exchanges associated with the offer
    * @param _groupId - id of the group, where offer will be added
    */
    function createOfferAddToGroup(
        Offer memory _offer,
        uint256 _disputeValidDuration,
        uint256 _groupId
    )
    external {
        // create offer and update structs values to represent true state
        createOfferInternal(_offer, _disputeValidDuration);

        // create an array with offer ids and add it to the group
        uint256[] memory _offerIds = new uint256[](1);
        _offerIds[0] = _offer.id;
        addOffersToGroupInternal(_groupId, _offerIds);
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
     *   - Voided is set to true
     *   - Seller deposit is less than protocol fee
     *   - Sum of buyer cancel penalty and protocol fee is greater than price
     * - Dispute duration is zero
     * - when creating twin if
     *   - Not approved to transfer the seller's token
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _disputeValidDuration - the duration of disputes for exchanges associated with the offer
     * @param _twin - the fully populated twin struct
     */
    function createOfferAndTwinWithBundle(
        Offer memory _offer,
        uint256 _disputeValidDuration,
        Twin memory _twin
    )
    public 
    override {
        // create seller and update structs values to represent true state
        createOfferInternal(_offer, _disputeValidDuration);

        // create twin and pack everything into a bundle
        createTwinAndBundleAfterOffer(_twin, _offer.id, _offer.sellerId);
    }

    /**
     * @notice Takes an offer, a condition and a twin, creates an offer, then a group with that offer and the given condition, then creates a twin, then a bundle with that offer and the given twin
     *
     * Emits an OfferCreated, a GroupCreated, a TwinCreated and a BundleCreated event if successful.
     *
     * Reverts if:
     * - in offer struct:
     *   - Caller is not an operator
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Voided is set to true
     *   - Seller deposit is less than protocol fee
     *   - Sum of buyer cancel penalty and protocol fee is greater than price
     * - Dispute duration is zero
     * - Condition includes invalid combination of parameters
     * - when creating twin if
     *   - Not approved to transfer the seller's token
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _disputeValidDuration - the duration of disputes for exchanges associated with the offer
     * @param _condition - the fully populated condition struct
     * @param _twin - the fully populated twin struct
     */
    function createOfferWithConditionAndTwinAndBundle(
        Offer memory _offer,
        uint256 _disputeValidDuration,
        Condition memory _condition,
        Twin memory _twin
    )
    public {
        // create offer with condition first
        createOfferWithCondition(_offer, _disputeValidDuration, _condition);
        // create twin and pack everything into a bundle
        createTwinAndBundleAfterOffer(_twin, _offer.id, _offer.sellerId);
    }

    /**
     * @notice Takes a twin, an offerId and a sellerId, creates a twin, then a bundle with that offer and the given twin
     *
     * Emits a TwinCreated and a BundleCreated event if successful.
     *
     * Reverts if:
     * - Condition includes invalid combination of parameters
     * - when creating twin if
     *   - Not approved to transfer the seller's token
     *
     * @param _twin - the fully populated twin struct
     * @param _offerId - offerid, obtained in previous steps
     * @param _sellerId - sellerId, obtained in previous steps
     */
    function createTwinAndBundleAfterOffer(Twin memory _twin, uint256 _offerId, uint256 _sellerId) internal {
        // create twin and update structs values to represent true state
        createTwinInternal(_twin);

        // construct new bundle
        // - bundleId is 0, and it is ignored
        // - note that _twin fields are updated during createTwinInternal, so they represent correct values
        Bundle memory _bundle = Bundle(0, _sellerId, new uint256[](1), new uint256[](1));
        _bundle.offerIds[0] = _offerId;
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
     *   - Voided is set to true
     *   - Seller deposit is less than protocol fee
     *   - Sum of buyer cancel penalty and protocol fee is greater than price
     * - Dispute duration is zero
     * - Condition includes invalid combination of parameters
     *
     * @param _seller - the fully populated seller struct
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _disputeValidDuration - the duration of disputes for exchanges associated with the offer
     * @param _condition - the fully populated condition struct
     */
    function createSellerAndOfferWithCondition(
        Seller memory _seller,
        Offer memory _offer,
        uint256 _disputeValidDuration,
        Condition memory _condition
    )
    external 
    override {
        checkAndCreateSeller(_seller);
        createOfferWithCondition(_offer, _disputeValidDuration, _condition);
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
     *   - Voided is set to true
     *   - Seller deposit is less than protocol fee
     *   - Sum of buyer cancel penalty and protocol fee is greater than price
     * - Dispute duration is zero
     * - when creating twin if
     *   - Not approved to transfer the seller's token
     *
     * @param _seller - the fully populated seller struct
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _disputeValidDuration - the duration of disputes for exchanges associated with the offer
     * @param _twin - the fully populated twin struct
     */
    function createSellerAndOfferAndTwinWithBundle(
        Seller memory _seller,
        Offer memory _offer,
        uint256 _disputeValidDuration,
        Twin memory _twin
    )
    external 
    override {
        checkAndCreateSeller(_seller);
        createOfferAndTwinWithBundle(_offer, _disputeValidDuration, _twin);
    }

    /**
     * @notice Takes a seller, an offer, a condition and a twin, creates a sellerm an offer, then a group with that offer and the given condition, then creates a twin, then a bundle with that offer and the given twin
     *
     * Emits an SellerCreated, OfferCreated, a GroupCreated, a TwinCreated and a BundleCreated event if successful.
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
     *   - Voided is set to true
     *   - Seller deposit is less than protocol fee
     *   - Sum of buyer cancel penalty and protocol fee is greater than price
     * - Dispute duration is zero
     * - Condition includes invalid combination of parameters
     * - when creating twin if
     *   - Not approved to transfer the seller's token
     *
     * @param _seller - the fully populated seller struct
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _disputeValidDuration - the duration of disputes for exchanges associated with the offer
     * @param _condition - the fully populated condition struct
     * @param _twin - the fully populated twin struct
     */
    function createSellerAndOfferWithConditionAndTwinAndBundle(
        Seller memory _seller,
        Offer memory _offer,
        uint256 _disputeValidDuration,
        Condition memory _condition,
        Twin memory _twin
    )
    external override {
        checkAndCreateSeller(_seller);
        createOfferWithConditionAndTwinAndBundle(_offer, _disputeValidDuration, _condition, _twin);
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