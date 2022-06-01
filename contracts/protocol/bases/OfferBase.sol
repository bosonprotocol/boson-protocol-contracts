// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IBosonOfferEvents } from "../../interfaces/events/IBosonOfferEvents.sol";
import { ProtocolBase } from "./../bases/ProtocolBase.sol";
import { ProtocolLib } from "./../libs/ProtocolLib.sol";

/**
 * @title OfferBase
 *
 * @dev Provides methods for offer creation that can be shared accross facets
 */
contract OfferBase is ProtocolBase, IBosonOfferEvents {
    /**
     * @dev Internal helper to create offer, which can be reused among different facets
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
    function createOfferInternal(Offer memory _offer, OfferDates calldata _offerDates, OfferDurations calldata _offerDurations) internal {
        // get seller id, make sure it exists and store it to incoming struct
        (bool exists, uint256 sellerId) = getSellerIdByOperator(msg.sender);
        require(exists, NOT_OPERATOR);
        _offer.sellerId = sellerId;

        // Get the next offerId and increment the counter
        uint256 offerId = protocolCounters().nextOfferId++;
        _offer.id = offerId;

        // Store the offer
        storeOffer(_offer, _offerDates, _offerDurations);

        // Notify watchers of state change
        emit OfferCreated(offerId, sellerId, _offer, _offerDates, _offerDurations);
    }

    /**
     * @notice Validates offer struct and store it to storage
     *
     * Reverts if:
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
     * @param _offer - the fully populated struct with offer id set to offer to be updated and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     */
    function storeOffer(Offer memory _offer, OfferDates calldata _offerDates, OfferDurations calldata _offerDurations) internal {
        // validFrom date must be less than validUntil date
        require(_offerDates.validFrom < _offerDates.validUntil, OFFER_PERIOD_INVALID);

        // validUntil date must be in the future
        require(_offerDates.validUntil > block.timestamp, OFFER_PERIOD_INVALID);

        // exactly one of redeemableUntil and voucherValid must be zero
        require(_offerDates.redeemableUntil ^ _offerDurations.voucherValid == 0, VOUCHER_EXPIRY_UNDEFINED);

        // if redeemableUntil exist, it must be greater than validUntil
        if (_offerDates.redeemableUntil > 0) {
            require(_offerDates.redeemableFrom < _offerDates.redeemableUntil, REDEMPTION_PERIOD_INVALID);
            require(_offerDates.redeemableUntil >= _offerDates.validUntil, REDEMPTION_PERIOD_INVALID);
        }

        // fulfillment period must be grater than zero
        require(_offerDurations.fulfillmentPeriod > 0, INVALID_FULFILLMENT_PERIOD);

        // dispute duration must be grater than zero
        require(_offerDurations.disputeValid > 0, INVALID_DISPUTE_DURATION);

        // when creating offer, it cannot be set to voided
        require(!_offer.voided, OFFER_MUST_BE_ACTIVE);

        // quantity must be greater than zero
        require(_offer.quantityAvailable > 0, INVALID_QUANTITY_AVAILABLE);

        // specified resolver must be registered // TODO: add when dispute resolver implemented
        // require(protocolStorage().disputeResolverIdByWallet[_offer.disputeResolver] != 0, INVALID_DISPUTE_RESOLVER);

        // Calculate and set the protocol fee
        uint256 protocolFee = protocolStorage().protocolFeePercentage*(_offer.price + _offer.sellerDeposit)/10000;
        _offer.protocolFee = protocolFee;
        
        // condition for succesfull payout when exchange final state is revoked        
        require(_offer.sellerDeposit >= protocolFee, OFFER_DEPOSIT_INVALID);

        // condition for succesfull payout when exchange final state is canceled
        require(_offer.buyerCancelPenalty + protocolFee <= _offer.price, OFFER_PENALTY_INVALID);

        // Get storage location for offer
        (, Offer storage offer) = fetchOffer(_offer.id);

        // Set offer props individually since memory structs can't be copied to storage
        offer.id = _offer.id;
        offer.sellerId = _offer.sellerId;
        offer.price = _offer.price;
        offer.sellerDeposit = _offer.sellerDeposit;
        offer.protocolFee = _offer.protocolFee;
        offer.buyerCancelPenalty = _offer.buyerCancelPenalty;
        offer.quantityAvailable = _offer.quantityAvailable;
        offer.disputeResolver = _offer.disputeResolver;
        offer.exchangeToken = _offer.exchangeToken;
        offer.metadataUri = _offer.metadataUri;
        offer.offerChecksum = _offer.offerChecksum;

        // Get storage location for offer dates
        OfferDates storage offerDates = fetchOfferDates(_offer.id);

        // Set offer dates props individually since calldata structs can't be copied to storage
        offerDates.validFrom = _offerDates.validFrom;
        offerDates.validUntil = _offerDates.validUntil;
        offerDates.redeemableFrom = _offerDates.redeemableFrom;
        offerDates.redeemableUntil = _offerDates.redeemableUntil;

        // Get storage location for offer durations
        OfferDurations storage offerDurations = fetchOfferDurations(_offer.id);

        // Set offer durations props individually since calldata structs can't be copied to storage
        offerDurations.fulfillmentPeriod = _offerDurations.fulfillmentPeriod;
        offerDurations.voucherValid = _offerDurations.voucherValid;
        offerDurations.disputeValid = _offerDurations.disputeValid;
    }
}
