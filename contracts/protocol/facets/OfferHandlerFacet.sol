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
     * @dev Modifier to protect initializer function from being invoked twice.
     */
    modifier onlyUnInitialized()
    {
        ProtocolLib.ProtocolInitializers storage pi = ProtocolLib.protocolInitializers();
        require(!pi.offerHandler, ALREADY_INITIALIZED);
        pi.offerHandler = true;
        _;
    }

    /**
     * @notice Facet Initializer
     */
    function initialize()
    public
    onlyUnInitialized
    {
        DiamondLib.addSupportedInterface(type(IBosonOfferHandler).interfaceId);
    }

    /**
     * @notice Creates an offer.
     *
     * Emits an OfferCreated event if successful.
     *
     * Reverts if:
     * - Valid from date is greater than valid until date
     * - Valid until date is not in the future
     * - TODO Add more offer validity checks
     *
     * @param _offer - the fully populated struct with offer id set to 0x0
     */
    function createOffer(
        Offer calldata _offer
    )
    external
    override
    {
        // validFrom date must be less than validUntil date
        require(_offer.validFromDate < _offer.validUntilDate, OFFER_PERIOD_INVALID);

        // validUntil date must be in the future
        require(_offer.validUntilDate > block.timestamp, OFFER_PERIOD_INVALID);

        // Get the next offerId and increment the counter
        uint256 offerId = protocolStorage().nextOfferId++;

        // Get storage location for offer
        Offer storage offer = ProtocolLib.getOffer(offerId);

        // Set offer props individually since memory structs can't be copied to storage
        offer.id = offerId;
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
        offer.voided = _offer.voided;

        // Notify watchers of state change
        emit OfferCreated(offerId, _offer.sellerId, _offer);
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
        Offer storage offer = ProtocolLib.getOffer(_offerId);

        // Offer must already exist
        require(offer.id == _offerId, NO_SUCH_OFFER);

        // Caller must be seller's operator address
        Seller storage seller = ProtocolLib.getSeller(offer.sellerId);
        //require(seller.operator == msg.sender, NOT_OPERATOR); // TODO add back when AccountHandler is working

        // Offer must not already be voided
        require(!offer.voided, OFFER_ALREADY_VOIDED);

        // Void the offer
        offer.voided = true;

        // Notify listeners of state change
        emit OfferVoided(_offerId, offer.sellerId);

    }

    /**
     * @notice Gets the details about a given offer.
     *
     * @param _offerId - the id of the offer to check
     * @return success - the offer was found
     * @return offer - the offer details. See {BosonTypes.Offer}
     */
    function getOffer(uint256 _offerId)
    external
    view
    returns(bool success, Offer memory offer) {

        offer = ProtocolLib.getOffer(_offerId);
        success = (offer.id == _offerId);

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

        nextOfferId = ProtocolLib.protocolStorage().nextOfferId;

    }

}