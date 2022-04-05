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
        Offer memory _offer
    )
    external
    override
    {        
        // get seller id, make sure it exists and store it to incoming struct
        (bool exists, uint256 sellerId) = getSellerIdByOperator(msg.sender);
        require(exists, NO_SUCH_SELLER);
        _offer.sellerId = sellerId;

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

        // Get seller, we assume seller exists if offer exists
        (, Seller storage seller) = fetchSeller(_offer.sellerId);

        // Caller must be seller's operator address
        require(seller.operator == msg.sender, NOT_OPERATOR);

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
    external
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
            (protocolStorage().exchangesByOffer[_offerId].length == 0);
        
    }


}