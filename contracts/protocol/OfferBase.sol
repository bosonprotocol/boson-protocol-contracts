// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { BosonTypes } from "../domain/BosonTypes.sol";
import { BosonConstants } from "../domain/BosonConstants.sol";
import { ProtocolBase } from "./ProtocolBase.sol";
import { ProtocolLib } from "./ProtocolLib.sol";
import { IBosonOfferHandler } from "../interfaces/IBosonOfferHandler.sol";

/**
 * @title OfferBase
 *
 * @dev Provides methods for offer creation that can be shared accross facets
 */
abstract contract OfferBase is ProtocolBase, IBosonOfferHandler {
    // event OfferCreated(uint256 indexed offerId, uint256 indexed sellerId, BosonTypes.Offer offer);

    /**
     * @dev Internal helper to create offer, which can be reused between creatOffer and createBatchOffer
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
    function createOfferInternal(BosonTypes.Offer memory _offer) internal returns (uint256 offerId) {
        // get seller id, make sure it exists and store it to incoming struct
        (bool exists, uint256 sellerId) = getSellerIdByOperator(msg.sender);
        require(exists, NO_SUCH_SELLER);
        _offer.sellerId = sellerId;

        // Get the next offerId and increment the counter
        offerId = ProtocolLib.protocolCounters().nextOfferId++;

        // modify incoming struct so event value represents true state
        _offer.id = offerId;

        storeOffer(_offer);

        // Notify watchers of state change
        emit OfferCreated(offerId, _offer.sellerId, _offer);
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
    function storeOffer(BosonTypes.Offer memory _offer) internal {
        // validFrom date must be less than validUntil date
        require(_offer.validFromDate < _offer.validUntilDate, OFFER_PERIOD_INVALID);

        // validUntil date must be in the future
        require(_offer.validUntilDate > block.timestamp, OFFER_PERIOD_INVALID);

        // buyerCancelPenalty should be less or equal to the item price
        require(_offer.buyerCancelPenalty <= _offer.price, OFFER_PENALTY_INVALID);

        // when creating offer, it cannot be set to voided
        require(!_offer.voided, OFFER_MUST_BE_ACTIVE);

        // Get storage location for offer
        (, BosonTypes.Offer storage offer) = fetchOffer(_offer.id);

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
        offer.offerChecksum = _offer.offerChecksum;
    }
}
