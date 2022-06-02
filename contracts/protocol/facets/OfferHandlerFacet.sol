// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { IBosonOfferHandler } from "../../interfaces/handlers/IBosonOfferHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { OfferBase } from "../bases/OfferBase.sol";

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
     * - Caller is not an operator
     * - Valid from date is greater than valid until date
     * - Valid until date is not in the future
     * - Both voucher expiration date and voucher expiraton period are defined
     * - Neither of voucher expiration date and voucher expiraton period are defined
     * - Voucher redeemable period is fixed, but it ends before it starts
     * - Voucher redeemable period is fixed, but it ends before offer expires
     * - Fulfillment period is set to zero
     * - Dispute duration is set to zero
     * - Voided is set to true
     * - Available quantity is set to zero
     * - Dispute resolver wallet is not registered
     * - Seller deposit is less than protocol fee
     * - Sum of buyer cancel penalty and protocol fee is greater than price
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     */
    function createOffer(
        Offer memory _offer,
        OfferDates calldata _offerDates, OfferDurations calldata _offerDurations
    )
    external
    override
    {    
        createOfferInternal(_offer, _offerDates, _offerDurations);
    }

    /**
     * @notice Creates a batch of offers.
     *
     * Emits an OfferCreated event for every offer if successful.
     *
     * Reverts if:
     * - Number of offers exceeds maximum allowed number per batch
     * - Number of elements in offers, offerDates and offerDurations do not match
     * - for any offer:
     *   - Caller is not an operator
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Both voucher expiration date and voucher expiraton period are defined
     *   - Neither of voucher expiration date and voucher expiraton period are defined
     *   - Voucher redeemable period is fixed, but it ends before it starts
     *   - Voucher redeemable period is fixed, but it ends before offer expires
     *   - Fulfillment period is set to zero
     *   - Dispute duration is set to zero
     *   - Voided is set to true
     *   - Available quantity is set to zero
     *   - Dispute resolver wallet is not registered
     *   - Seller deposit is less than protocol fee
     *   - Sum of buyer cancel penalty and protocol fee is greater than price
     *
     * @param _offers - the array of fully populated Offer structs with offer id set to 0x0 and voided set to false
     * @param _offerDates - the array of fully populated offer dates structs
     * @param _offerDurations - the array of fully populated offer durations structs
     */
    function createOfferBatch(
        Offer[] calldata _offers,
        OfferDates[] calldata _offerDates, OfferDurations[] calldata _offerDurations
    )
    external
    override
    {
        // limit maximum number of offers to avoid running into block gas limit in a loop
        require(_offers.length <= protocolStorage().maxOffersPerBatch, TOO_MANY_OFFERS);
        // number of offer dates structs and offer durations structs must match the number of offers
        require(_offers.length == _offerDates.length, ARRAY_LENGTH_MISMATCH);
        require(_offers.length == _offerDurations.length, ARRAY_LENGTH_MISMATCH);

        for (uint256 i = 0; i < _offers.length; i++) {        
            // create offer and update structs values to represent true state
            createOfferInternal(_offers[i], _offerDates[i], _offerDurations[i]);
        }
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
     * - Number of offers exceeds maximum allowed number per batch
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
     * Emits an OfferExtended event if successful.
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
    public
    override
    {
        // Make sure the caller is the operator, offer exists and is not voided
        Offer storage offer = getValidOffer(_offerId);

        // Fetch the offer dates
        OfferDates storage offerDates = fetchOfferDates(_offerId); 

        // New valid until date must be greater than existing one
        require(offerDates.validUntil < _validUntilDate, OFFER_PERIOD_INVALID);

        // Update the valid until property
        offerDates.validUntil = _validUntilDate;

        // Notify watchers of state change
        emit OfferExtended(_offerId, offer.sellerId, _validUntilDate);
    }

    /**
     * @notice Sets new valid until date
     *
     * Emits an OfferExtended event if successful.
     *
     * Reverts if:
     * - Number of offers exceeds maximum allowed number per batch
     * - For any of the offers:
     *   - Offer does not exist
     *   - Caller is not the operator of the offer
     *   - New valid until date is before existing valid until dates
     *
     *  @param _offerIds - list of ids of the offers to extemd
     *  @param _validUntilDate - new valid until date
     */
    function extendOfferBatch(uint256[] calldata _offerIds, uint256 _validUntilDate) external {
        // limit maximum number of offers to avoid running into block gas limit in a loop
        require(_offerIds.length <= protocolStorage().maxOffersPerBatch, TOO_MANY_OFFERS);
        for (uint i = 0; i < _offerIds.length; i++) { 
            extendOffer(_offerIds[i], _validUntilDate);
        }
    }

    /**
     * @notice Gets the details about a given offer.
     *
     * @param _offerId - the id of the offer to check
     * @return exists - the offer was found
     * @return offer - the offer details. See {BosonTypes.Offer}
     * @return offerDates - the offer dates details. See {BosonTypes.OfferDates}
     * @return offerDurations - the offer durations details. See {BosonTypes.OfferDurations}
     */
    function getOffer(uint256 _offerId)
    external
    view
    returns(bool exists, Offer memory offer, OfferDates memory offerDates, OfferDurations memory offerDurations) {
        (exists, offer) = fetchOffer(_offerId);
        if (exists) {
            offerDates = fetchOfferDates(_offerId);
            offerDurations = fetchOfferDurations(_offerId);
        }
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

}