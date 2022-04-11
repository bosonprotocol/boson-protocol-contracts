// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { IBosonOfferHandler } from "../../interfaces/IBosonOfferHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { OfferBase } from "../OfferBase.sol";

/**
 * @title OfferHandlerFacet
 *
 * @notice Handles offers within the protocol
 */
contract OfferHandlerFacet is IBosonOfferHandler, OfferBase {

    /**
     * @notice Facet Initializer
     */
    function initialize()
    public
    onlyUnInitialized(type(IBosonOfferHandler).interfaceId)
    {
        DiamondLib.addSupportedInterface(type(IBosonOfferHandler).interfaceId);
    }

    /**
     * @notice Creates an offer.
     *
     * Emits an OfferCreated event if successful.
     *
     * Reverts if:
     * - seller does not exist
     * - Valid from date is greater than valid until date
     * - Valid until date is not in the future
     * - Buyer cancel penalty is greater than price
     * - Voided is set to true
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     */
    function createOffer(
        Offer calldata _offer
    )
    external
    override
    {        
        createOfferInternal(_offer);
    }

    /**
     * @notice Creates a batch of offers.
     *
     * Emits an OfferCreated event for every offer if successful.
     *
     * Reverts if, for any offer:
     * - seller does not exist
     * - Valid from date is greater than valid until date
     * - Valid until date is not in the future
     * - Buyer cancel penalty is greater than price
     * - Voided is set to true
     *
     * @param _offers - the array of fully populated Offer structs with offer id set to 0x0 and voided set to false
     */
    function createOfferBatch(
        Offer[] calldata _offers
    )
    external
    override
    {
        // limit maximum number of offers to avoid running into block gas limit in a loop
        require(_offers.length <= protocolStorage().maxOffersPerBatch, TOO_MANY_OFFERS);
        for (uint256 i = 0; i < _offers.length; i++) { 
            createOfferInternal(_offers[i]);
        }
    }
    

    /**
     * @notice Updates an existing offer.
     *
     * Emits an OfferUpdated event if successful.
     *
     * Reverts if:
     * - Offer does not exist
     * - Offer is not updateable, i.e. is voided or some exchanges exist
     * - Caller is not the seller
     * - Valid from date is greater than valid until date
     * - Valid until date is not in the future
     * - Buyer cancel penalty is greater than price
     * - Voided is set to true
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

        // Get seller id, we assume seller id exists if offer exists
        (, uint256 sellerId) = getSellerIdByOperator(msg.sender);

        // Caller's seller id must match offer seller id
        require(sellerId == _offer.sellerId, NOT_OPERATOR);

        storeOffer(_offer);

        // Notify watchers of state change
        emit OfferUpdated(_offer.id, _offer.sellerId, _offer);
    }   
    
    /**
     * @notice Voids a given offer.
     *
     * Emits an OfferVoided event if successful.
     *
     * Note:
     * Existing exchanges are not affected.
     * No further vouchers can be issued against a voided offer.
     *
     * Reverts if:
     * - Offer ID is invalid
     * - Caller is not the operator of the offer
     * - Offer has already been voided
     *
     * @param _offerId - the id of the offer to check
     */
    function voidOffer(uint256 _offerId)
    public
    override
    {
        // Get offer, make sure the caller is the operator
        Offer storage offer = getValidOffer(_offerId);

        // Void the offer
        offer.voided = true;

        // Notify listeners of state change
        emit OfferVoided(_offerId, offer.sellerId);

    }

    /**
     * @notice  Voids a batch of offers.
     *
     * Emits an OfferVoided event for every offer if successful.
     *
     * Note:
     * Existing exchanges are not affected.
     * No further vouchers can be issued against a voided offer.
     *
     * Reverts if, for any offer:
     * - Offer ID is invalid
     * - Caller is not the operator of the offer
     * - Offer has already been voided
     *
     * @param _offerIds - the id of the offer to check
     */
    function voidOfferBatch(uint256[] calldata _offerIds)
    external
    override
    {
        // limit maximum number of offers to avoid running into block gas limit in a loop
        require(_offerIds.length <= protocolStorage().maxOffersPerBatch, TOO_MANY_OFFERS);
        for (uint i = 0; i < _offerIds.length; i++) { 
            voidOffer(_offerIds[i]);
        }

    }

    /**
     * @notice Sets new valid until date
     *
     * Emits an OfferUpdated event if successful.
     *
     * Reverts if:
     * - Offer does not exist
     * - Caller is not the operator of the offer
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
        // Get offer, make sure the caller is the operator
        Offer storage offer = getValidOffer(_offerId);

        // New valid until date must be greater than existing one
        require(offer.validUntilDate < _validUntilDate, OFFER_PERIOD_INVALID);

        // Void the offer
        offer.validUntilDate = _validUntilDate;

        // Notify watchers of state change
        emit OfferUpdated(_offerId, offer.sellerId, offer);
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
            (protocolStorage().exchangeIdsByOffer[_offerId].length == 0);
        
    }


}