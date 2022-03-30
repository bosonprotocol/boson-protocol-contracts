// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { IBosonOfferHandler } from "../../interfaces/IBosonOfferHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { ProtocolBase } from "../ProtocolBase.sol";
import { ProtocolLib } from "../ProtocolLib.sol";

/**
 * @title OfferHandlerFacet
 *
 * @notice Handles offers within the protocol
 */
contract OfferHandlerFacet is IBosonOfferHandler, ProtocolBase {

    /**
     * @notice Facet Initializer
     */
    function initialize()
    public
    onlyUnInitialized(type(IBosonOfferHandler).interfaceId)
    {
        DiamondLib.addSupportedInterface(type(IBosonOfferHandler).interfaceId);
    }

    /////////////////////////////////////
    ///    SINGLE OFFER MANAGEMENT    ///
    /////////////////////////////////////

    /**
     * @notice Creates an offer.
     *
     * Emits an OfferCreated event if successful.
     *
     * Reverts if:
     * - internal any of validations to store offer fails
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     */
    function createOffer(
        Offer memory _offer
    )
    external
    override
    {        
        // Get the next offerId and increment the counter
        uint256 offerId = protocolCounters().nextOfferId++;
        
        // modify incoming struct so event value represents true state
        _offer.id = offerId;

        storeOffer(_offer);
      
        // Notify watchers of state change
        emit OfferCreated(offerId, _offer.sellerId, _offer);
    }

    /**
     * @notice Updates an existing offer.
     *
     * Emits an OfferUpdated event if successful.
     *
     * Reverts if:
     * - Offer is not updateable, i.e. is voided or some exchanges exist
     * - Any other validation for offer creation fails
     *
     * @param _offer - the fully populated struct with offer id set to offer to be updated and voided set to false
     */
    function updateOffer(
        Offer memory _offer
    )
    external
    override
    {
        // Offer must be updateable
        (, bool updateable) = isOfferUpdateable(_offer.id);
        require(updateable, OFFER_NOT_UPDATEABLE);

        storeOffer(_offer);

        // Notify watchers of state change
        emit OfferUpdated(_offer.id, _offer.sellerId, _offer);
    }
    
    /**
     * @notice Validates offer struct and store it to storage
     *
     * Reverts if:
     * - Valid from date is greater than valid until date
     * - Valid until date is not in the future
     * - Buyer cancel penalty is greater than price
     * - Voided is set to true
     *
     * @param _offer - the fully populated struct with offer id set to offer to be updated and voided set to false
     */
    function storeOffer(Offer memory _offer) internal {
        // TODO: check seller ID matches msg.sender

        // validFrom date must be less than validUntil date
        require(_offer.validFromDate < _offer.validUntilDate, OFFER_PERIOD_INVALID);

        // validUntil date must be in the future
        require(_offer.validUntilDate > block.timestamp, OFFER_PERIOD_INVALID);

        // buyerCancelPenalty should be less or equal to the item price
        require(_offer.buyerCancelPenalty <= _offer.price, OFFER_PENALTY_INVALID);

        // when creating offer, it cannot be set to voided
        require(!_offer.voided, OFFER_MUST_BE_ACTIVE);

        // Get storage location for offer
        (,Offer storage offer) = fetchOffer(_offer.id);

        // Set offer props individually since memory structs can't be copied to storage
        offer.id = _offer.id;
        offer.sellerId = _offer.sellerId;
        offer.price = _offer.price;
        offer.sellerDeposit = _offer.sellerDeposit;
        offer.buyerCancelPenalty = _offer.buyerCancelPenalty;
        offer.quantityAvailable = _offer.quantityAvailable;
        offer.validFromDate = _offer.validFromDate;
        offer.validUntilDate = _offer.validUntilDate;
        offer.redeemableFromDate = _offer.redeemableFromDate;
        offer.fulfillmentPeriodDuration = _offer.fulfillmentPeriodDuration;
        offer.voucherValidDuration = _offer.voucherValidDuration;
        offer.exchangeToken = _offer.exchangeToken;
        offer.metadataUri = _offer.metadataUri;
        offer.metadataHash = _offer.metadataHash;

    }

    /**
     * @notice Voids a given offer.
     *
     * Emits an OfferVoided event if successful.
     * Existing exchanges are not affected.
     * No further vouchers can be issued against a voided offer.
     *
     * Reverts if:
     * - Offer ID is invalid
     * - Offer is not owned by caller
     * - Offer has already been voided
     *
     * @param _offerId - the id of the offer to check
     */
    function voidOffer(uint256 _offerId)
    external
    override
    {
        // Get offer
        Offer storage offer = getValidOffer(_offerId);

        // Void the offer
        offer.voided = true;

        // Notify listeners of state change
        emit OfferVoided(_offerId, offer.sellerId);

    }

    /**
     * @notice Sets new valid until date
     *
     * Emits an OfferUpdated event if successful.
     *
     * Reverts if:
     * - Offer does not exist
     * - Caller is not the seller (TODO)
     * - New valid until date is before existing valid until dates
     *
     *  @param _offerId - the id of the offer to check
     *  @param _validUntilDate - new valid until date
     */
    function extendOffer(
        uint256 _offerId, uint _validUntilDate
    )
    external
    override
    {
        // Get offer
        Offer storage offer = getValidOffer(_offerId);

        // New valid until date must be greater than existing one
        require(offer.validUntilDate < _validUntilDate, OFFER_PERIOD_INVALID);

        // Void the offer
        offer.validUntilDate = _validUntilDate;

        // Notify watchers of state change
        emit OfferUpdated(_offerId, offer.sellerId, offer);
    }

    /**
     * @notice Gets offer from protocol storage, makes sure it exist and not voided
     *
     * Reverts if:
     * - Offer does not exist
     * - Caller is not the seller (TODO)
     * - Offer already voided
     *
     *  @param _offerId - the id of the offer to check
     */
    function getValidOffer(uint256 _offerId) internal view returns (Offer storage offer){

        bool exists;
        Seller storage seller;

        // Get offer
        (exists, offer) = fetchOffer(_offerId);

        // Offer must already exist
        require(exists, NO_SUCH_OFFER);

        // Get seller, we assume seller exists if offer exists
        (,seller) = fetchSeller(offer.sellerId);

        // Caller must be seller's operator address
        //require(seller.operator == msg.sender, NOT_OPERATOR); // TODO add back when AccountHandler is working

        // Offer must not already be voided
        require(!offer.voided, OFFER_ALREADY_VOIDED);
    }

    /**
     * @notice Gets the details about a given offer.
     *
     * @param _offerId - the id of the offer to check
     * @return exists - the offer was found
     * @return offer - the offer details. See {BosonTypes.Offer}
     */
    function getOffer(uint256 _offerId)
    external
    view
    returns(bool exists, Offer memory offer) {
        return fetchOffer(_offerId);
    }

    /**
     * @notice Gets the next offer id.
     *
     * Does not increment the counter.
     *
     * @return nextOfferId - the next offer id
     */
    function getNextOfferId()
    public
    view
    returns(uint256 nextOfferId) {

        nextOfferId = protocolCounters().nextOfferId;

    }

    /**
     * @notice Tells if offer is voided or not
     *
     * @param _offerId - the id of the offer to check
     * @return exists - the offer was found
     * @return offerVoided - true if voided, false otherwise
     */
    function isOfferVoided(uint256 _offerId)
    public
    view
    returns(bool exists, bool offerVoided) {
        Offer memory offer;
        (exists, offer) = fetchOffer(_offerId);
        offerVoided = offer.voided;
    }


    /**
     * @notice Tells if offer is can be updated or not
     *
     * Offer is updateable if:
     * - it exists
     * - is not voided
     * - has no exchanges
     *
     * @param _offerId - the id of the offer to check
     * @return exists - the offer was found
     * @return offerUpdateable - true if updateable, false otherwise
     */
    function isOfferUpdateable(uint256 _offerId)
    public
    view
    returns(bool exists, bool offerUpdateable)
    {
        // Get the offer
        Offer storage offer;
        (exists, offer) = fetchOffer(_offerId);

        // Offer must exist, not be voided, and have no exchanges to be updateable
        offerUpdateable =
            exists &&
            !offer.voided &&
            (protocolStorage().exchangesByOffer[_offerId].length == 0);
        
    }


    //////////////////////////////
    ///    GROUP MANAGEMENT    ///
    //////////////////////////////

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
     *
     * @param _group - the fully populated struct with group id set to 0x0
     */
    function createGroup(
        Group memory _group
    )
    external
    override
    {
        // Get the next group and increment the counter
        uint256 groupId = protocolCounters().nextGroupId++;

        // modify incoming struct so event value represents true state
        _group.id = groupId; 

        storeGroup(_group);
      
        // Notify watchers of state change
        emit GroupCreated(groupId, _group.sellerId, _group);
    }


    /**
     * @notice Updates an existing group.
     *
     * Emits a GroupUpdated event if successful.
     *
     * Reverts if:
     * 
     * - seller does not match caller
     * - group does not exist
     * - any of offers belongs to different seller
     * - any of offers does not exist
     * - offer exists in a different group
     *
     * @param _group - the fully populated struct with group id set to id of group to be updated
     */
    function updateGroup(
        Group memory _group
    )
    external
    override {
        (bool exists,)=fetchGroup(_group.id);

        require(exists, NO_SUCH_GROUP);

        storeGroup(_group);
      
        // Notify watchers of state change
        emit GroupCreated(_group.id, _group.sellerId, _group);
    }

    /**
     * @notice Validates group struct and store it to storage
     *
     * Reverts if:
     * - seller does not match caller
     * - any of offers belongs to different seller
     * - any of offers does not exist
     * - offer exists in a different group
     *
     * @param _group - the fully populated struct with group id set to id of group to be stored
     */
    function storeGroup(
        Group memory _group
    )
    internal
    {
        // TODO: check seller ID matches msg.sender

        // limit maximum number of offers to avoid running into block gas limit in a loop
        require(_group.offerIds.length <= protocolStorage().maxOffersPerGroup, TOO_MANY_OFFERS);

        for (uint i = 0; i < _group.offerIds.length; i++) {
            // make sure all offers exist and belong to the seller
            getValidOffer(_group.offerIds[i]);
            
            // Add to groupByOffer mapping
            require(protocolStorage().groupByOffer[_group.offerIds[i]] == 0, OFFER_MUST_BE_UNIQUE);
            protocolStorage().groupByOffer[_group.offerIds[i]] = _group.id;
        }
       
        // Get storage location for group
        (,Group storage group) = fetchGroup(_group.id);

        // Set group props individually since memory structs can't be copied to storage
        group.id = _group.id;
        group.sellerId = _group.sellerId;
        group.offerIds = _group.offerIds;
        group.condition = _group.condition;
      
    }

    /**
     * @notice Gets the details about a given group.
     *
     * @param _groupId - the id of the group to check
     * @return exists - the offer was found
     * @return group - the offer details. See {BosonTypes.Group}
     */
    function getGroup(uint256 _groupId)
    external
    view
    returns(bool exists, Group memory group) {
        return fetchGroup(_groupId);
    }

}