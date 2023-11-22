// SPDX-License-Identifier: MIT
pragma solidity 0.8.21;

import { IBosonOfferEvents } from "../../interfaces/events/IBosonOfferEvents.sol";
import { ProtocolBase } from "./../bases/ProtocolBase.sol";
import { ProtocolLib } from "./../libs/ProtocolLib.sol";
import { IBosonVoucher } from "../../interfaces/clients/IBosonVoucher.sol";
import "./../../domain/BosonConstants.sol";

/**
 * @title OfferBase
 *
 * @dev Provides methods for offer creation that can be shared across facets.
 */
contract OfferBase is ProtocolBase, IBosonOfferEvents {
    /**
     * @notice Creates offer. Can be reused among different facets.
     *
     * Emits an OfferCreated event if successful.
     *
     * Reverts if:
     * - Caller is not an assistant
     * - Valid from date is greater than valid until date
     * - Valid until date is not in the future
     * - Both voucher expiration date and voucher expiration period are defined
     * - Neither of voucher expiration date and voucher expiration period are defined
     * - Voucher redeemable period is fixed, but it ends before it starts
     * - Voucher redeemable period is fixed, but it ends before offer expires
     * - Dispute period is less than minimum dispute period
     * - Resolution period is not between the minimum and the maximum resolution period
     * - Voided is set to true
     * - Available quantity is set to zero
     * - Dispute resolver wallet is not registered, except for absolute zero offers with unspecified dispute resolver
     * - Dispute resolver is not active, except for absolute zero offers with unspecified dispute resolver
     * - Seller is not on dispute resolver's seller allow list
     * - Dispute resolver does not accept fees in the exchange token
     * - Buyer cancel penalty is greater than price
     * - When agent id is non zero:
     *   - If Agent does not exist
     *   - If the sum of agent fee amount and protocol fee amount is greater than the offer fee limit
     * - Royalty recipient is not on seller's allow list
     * - Royalty percentage is less that the value decided by the admin
     * - Total royalty percentage is more than max royalty percentage
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _disputeResolverId - the id of chosen dispute resolver (can be 0)
     * @param _agentId - the id of agent
     */
    function createOfferInternal(
        Offer memory _offer,
        OfferDates calldata _offerDates,
        OfferDurations calldata _offerDurations,
        uint256 _disputeResolverId,
        uint256 _agentId
    ) internal {
        // get seller id, make sure it exists and store it to incoming struct
        (bool exists, uint256 sellerId) = getSellerIdByAssistant(msgSender());
        if (!exists) revert NotAssistant();
        _offer.sellerId = sellerId;
        // Get the next offerId and increment the counter
        uint256 offerId = protocolCounters().nextOfferId++;
        _offer.id = offerId;

        // Store the offer
        storeOffer(_offer, _offerDates, _offerDurations, _disputeResolverId, _agentId);
    }

    /**
     * @notice Validates offer struct and store it to storage.
     *
     * @dev Rationale for the checks that are not obvious:
     * 1. voucher expiration date is either
     *   -  _offerDates.voucherRedeemableUntil  [fixed voucher expiration date]
     *   - max([commitment time], _offerDates.voucherRedeemableFrom) + offerDurations.voucherValid [fixed voucher expiration duration]
     * This is calculated during the commitToOffer. To avoid any ambiguity, we make sure that exactly one of _offerDates.voucherRedeemableUntil
     * and offerDurations.voucherValid is defined.
     * 2. Checks that include _offer.sellerDeposit, protocolFee, offer.buyerCancelPenalty and _offer.price
     * Exchange can have one of multiple final states and different states have different seller and buyer payoffs. If offer parameters are
     * not set appropriately, it's possible for some payoffs to become negative or unfair to some participant. By making the checks at the time
     * of the offer creation we ensure that all payoffs are possible and fair.
     *
     *
     * Reverts if:
     * - Valid from date is greater than valid until date
     * - Valid until date is not in the future
     * - Both fixed voucher expiration date and voucher redemption duration are defined
     * - Neither of fixed voucher expiration date and voucher redemption duration are defined
     * - Voucher redeemable period is fixed, but it ends before it starts
     * - Voucher redeemable period is fixed, but it ends before offer expires
     * - Dispute period is less than minimum dispute period
     * - Resolution period is not between the minimum and the maximum resolution period
     * - Voided is set to true
     * - Available quantity is set to zero
     * - Dispute resolver wallet is not registered, except for absolute zero offers with unspecified dispute resolver
     * - Dispute resolver is not active, except for absolute zero offers with unspecified dispute resolver
     * - Seller is not on dispute resolver's seller allow list
     * - Dispute resolver does not accept fees in the exchange token
     * - Buyer cancel penalty is greater than price
     * - When agent id is non zero:
     *   - If Agent does not exist
     *   - If the sum of agent fee amount and protocol fee amount is greater than the offer fee limit
     * - Royalty recipient is not on seller's allow list
     * - Royalty percentage is less that the value decided by the admin
     * - Total royalty percentage is more than max royalty percentage
     *
     * @param _offer - the fully populated struct with offer id set to offer to be updated and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _disputeResolverId - the id of chosen dispute resolver (can be 0)
     * @param _agentId - the id of agent
     */
    function storeOffer(
        Offer memory _offer,
        OfferDates calldata _offerDates,
        OfferDurations calldata _offerDurations,
        uint256 _disputeResolverId,
        uint256 _agentId
    ) internal {
        // validFrom date must be less than validUntil date
        if (_offerDates.validFrom >= _offerDates.validUntil) revert InvalidOfferPeriod();

        // validUntil date must be in the future
        if (_offerDates.validUntil <= block.timestamp) revert InvalidOfferPeriod();

        // exactly one of voucherRedeemableUntil and voucherValid must be zero
        // if voucherRedeemableUntil exist, it must be greater than validUntil
        if (_offerDates.voucherRedeemableUntil > 0) {
            if (_offerDurations.voucherValid != 0) revert AmbiguousVoucherExpiry();
            if (_offerDates.voucherRedeemableFrom >= _offerDates.voucherRedeemableUntil)
                revert InvalidRedemptionPeriod();
            if (_offerDates.voucherRedeemableUntil < _offerDates.validUntil) revert InvalidRedemptionPeriod();
        } else {
            if (_offerDurations.voucherValid == 0) revert AmbiguousVoucherExpiry();
        }

        // Cache protocol limits for reference
        ProtocolLib.ProtocolLimits storage limits = protocolLimits();

        // Operate in a block to avoid "stack too deep" error
        {
            // dispute period must be greater than or equal to the minimum dispute period
            if (_offerDurations.disputePeriod < limits.minDisputePeriod) revert InvalidDisputePeriod();

            // resolution period must be between the minimum and maximum resolution periods
            if (
                _offerDurations.resolutionPeriod < limits.minResolutionPeriod ||
                _offerDurations.resolutionPeriod > limits.maxResolutionPeriod
            ) {
                revert InvalidResolutionPeriod();
            }
        }

        // when creating offer, it cannot be set to voided
        if (_offer.voided) revert OfferMustBeActive();

        // quantity must be greater than zero
        if (_offer.quantityAvailable == 0) revert InvalidQuantityAvailable();

        DisputeResolutionTerms memory disputeResolutionTerms;
        OfferFees storage offerFees = fetchOfferFees(_offer.id);
        {
            // Cache protocol lookups for reference
            ProtocolLib.ProtocolLookups storage lookups = protocolLookups();
            ProtocolLib.ProtocolFees storage fees = protocolFees();

            // Specified resolver must be registered and active, except for absolute zero offers with unspecified dispute resolver.
            // If price and sellerDeposit are 0, seller is not obliged to choose dispute resolver, which is done by setting _disputeResolverId to 0.
            // In this case, there is no need to check the validity of the dispute resolver. However, if one (or more) of {price, sellerDeposit, _disputeResolverId}
            // is different from 0, it must be checked that dispute resolver exists, supports the exchange token and seller is allowed to choose them.
            if (_offer.price != 0 || _offer.sellerDeposit != 0 || _disputeResolverId != 0) {
                (
                    bool exists,
                    DisputeResolver storage disputeResolver,
                    DisputeResolverFee[] storage disputeResolverFees
                ) = fetchDisputeResolver(_disputeResolverId);
                if (!exists || !disputeResolver.active) revert InvalidDisputeResolver();

                // Operate in a block to avoid "stack too deep" error
                {
                    // check that seller is on the DR allow list
                    if (lookups.allowedSellers[_disputeResolverId].length > 0) {
                        // if length == 0, dispute resolver allows any seller
                        // if length > 0, we check that it is on allow list
                        if (lookups.allowedSellerIndex[_disputeResolverId][_offer.sellerId] == 0)
                            revert SellerNotApproved();
                    }

                    // get the index of DisputeResolverFee and make sure DR supports the exchangeToken
                    {
                        uint256 feeIndex = lookups.disputeResolverFeeTokenIndex[_disputeResolverId][
                            _offer.exchangeToken
                        ];
                        if (feeIndex == 0) revert DRUnsupportedFee();

                        uint256 feeAmount = disputeResolverFees[feeIndex - 1].feeAmount;

                        // store DR terms
                        disputeResolutionTerms.disputeResolverId = _disputeResolverId;
                        disputeResolutionTerms.escalationResponsePeriod = disputeResolver.escalationResponsePeriod;
                        disputeResolutionTerms.feeAmount = feeAmount;
                        disputeResolutionTerms.buyerEscalationDeposit =
                            (feeAmount * fees.buyerEscalationDepositPercentage) /
                            10000;
                    }
                    protocolEntities().disputeResolutionTerms[_offer.id] = disputeResolutionTerms;
                }

                // Collection must exist. Collections with index 0 exist by default.
                if (_offer.collectionIndex > 0) {
                    if (lookups.additionalCollections[_offer.sellerId].length < _offer.collectionIndex)
                        revert NoSuchCollection();
                }
            }

            // Operate in a block to avoid "stack too deep" error
            {
                // Get the agent
                (bool agentExists, Agent storage agent) = fetchAgent(_agentId);

                // Make sure agent exists if _agentId is not zero.
                if (_agentId != 0 && !agentExists) revert NoSuchAgent();

                // Set variable to eliminate multiple SLOAD
                uint256 offerPrice = _offer.price;

                // condition for successful payout when exchange final state is canceled
                if (_offer.buyerCancelPenalty > offerPrice) revert InvalidOfferPenalty();

                // Calculate and set the protocol fee
                uint256 protocolFee = getProtocolFee(_offer.exchangeToken, offerPrice);

                // Calculate the agent fee amount
                uint256 agentFeeAmount = (agent.feePercentage * offerPrice) / 10000;

                uint256 totalOfferFeeLimit = (limits.maxTotalOfferFeePercentage * offerPrice) / 10000;

                // Sum of agent fee amount and protocol fee amount should be <= offer fee limit
                if ((agentFeeAmount + protocolFee) > totalOfferFeeLimit) revert AgentFeeAmountTooHigh();

                //Set offer fees props individually since calldata structs can't be copied to storage
                offerFees.protocolFee = protocolFee;
                offerFees.agentFee = agentFeeAmount;
            }

            // Store the agent id for the offer
            lookups.agentIdByOffer[_offer.id] = _agentId;

            // Make sure that supplied royalties ok
            // Operate in a block to avoid "stack too deep" error
            {
                if (_offer.royaltyInfo.recipients.length != _offer.royaltyInfo.bps.length) revert ArrayLengthMismatch();

                RoyaltyRecipient[] storage royaltyRecipients = lookups.royaltyRecipientsBySeller[_offer.sellerId];

                uint256 totalRoyalties;
                for (uint256 i = 0; i < _offer.royaltyInfo.recipients.length; i++) {
                    uint256 royaltyRecipientId = lookups.royaltyRecipientIndexBySellerAndRecipient[_offer.sellerId][
                        _offer.royaltyInfo.recipients[i]
                    ];
                    if (royaltyRecipientId == 0) revert InvalidRoyaltyRecipient();

                    if (_offer.royaltyInfo.bps[i] < royaltyRecipients[royaltyRecipientId - 1].minRoyaltyPercentage)
                        revert InvalidRoyaltyPercentage();

                    totalRoyalties = _offer.royaltyInfo.bps[i];
                }

                if (totalRoyalties > limits.maxRoyaltyPercentage) revert InvalidRoyaltyPercentage();
            }
        }
        // Get storage location for offer
        (, Offer storage offer) = fetchOffer(_offer.id);

        // Set offer props individually since memory structs can't be copied to storage
        offer.id = _offer.id;
        offer.sellerId = _offer.sellerId;
        offer.price = _offer.price;
        offer.sellerDeposit = _offer.sellerDeposit;
        offer.buyerCancelPenalty = _offer.buyerCancelPenalty;
        offer.quantityAvailable = _offer.quantityAvailable;
        offer.exchangeToken = _offer.exchangeToken;
        offer.metadataUri = _offer.metadataUri;
        offer.metadataHash = _offer.metadataHash;
        offer.collectionIndex = _offer.collectionIndex;
        offer.priceType = _offer.priceType;
        offer.royaltyInfo = _offer.royaltyInfo;

        // Get storage location for offer dates
        OfferDates storage offerDates = fetchOfferDates(_offer.id);

        // Set offer dates props individually since calldata structs can't be copied to storage
        offerDates.validFrom = _offerDates.validFrom;
        offerDates.validUntil = _offerDates.validUntil;
        offerDates.voucherRedeemableFrom = _offerDates.voucherRedeemableFrom;
        offerDates.voucherRedeemableUntil = _offerDates.voucherRedeemableUntil;

        // Get storage location for offer durations
        OfferDurations storage offerDurations = fetchOfferDurations(_offer.id);

        // Set offer durations props individually since calldata structs can't be copied to storage
        offerDurations.disputePeriod = _offerDurations.disputePeriod;
        offerDurations.voucherValid = _offerDurations.voucherValid;
        offerDurations.resolutionPeriod = _offerDurations.resolutionPeriod;

        // Notify watchers of state change
        emit OfferCreated(
            _offer.id,
            _offer.sellerId,
            _offer,
            _offerDates,
            _offerDurations,
            disputeResolutionTerms,
            offerFees,
            _agentId,
            msgSender()
        );
    }

    /**
     * @notice Reserves a range of vouchers to be associated with an offer
     *
     * Reverts if:
     * - The offers region of protocol is paused
     * - The exchanges region of protocol is paused
     * - Offer does not exist
     * - Offer already voided
     * - Caller is not the seller
     * - Range length is zero
     * - Range length is greater than quantity available
     * - Range length is greater than maximum allowed range length
     * - Call to BosonVoucher.reserveRange() reverts
     * - _to is not the BosonVoucher contract address or the BosonVoucher contract owner
     *
     * @param _offerId - the id of the offer
     * @param _length - the length of the range
     * @param _to - the address to send the pre-minted vouchers to (contract address or contract owner)
     */
    function reserveRangeInternal(
        uint256 _offerId,
        uint256 _length,
        address _to
    ) internal offersNotPaused exchangesNotPaused {
        // Get offer, make sure the caller is the assistant
        Offer storage offer = getValidOfferWithSellerCheck(_offerId);

        // Invalid ranges:
        // - Empty range
        // - Too large range, since it affects exchangeId
        // - More than quantity available
        if (_length == 0 || _length > type(uint64).max || offer.quantityAvailable < _length)
            revert InvalidRangeLength();

        // Get starting token id
        ProtocolLib.ProtocolCounters storage pc = protocolCounters();
        uint256 _startId = pc.nextExchangeId;

        IBosonVoucher bosonVoucher = IBosonVoucher(
            getCloneAddress(protocolLookups(), offer.sellerId, offer.collectionIndex)
        );

        address sender = msgSender();

        // _to must be the contract address or the contract owner
        if (_to != address(bosonVoucher) && _to != sender) revert InvalidToAddress();

        // increase exchangeIds
        pc.nextExchangeId = _startId + _length;

        // decrease quantity available, unless offer is unlimited
        if (offer.quantityAvailable != type(uint256).max) {
            offer.quantityAvailable -= _length;
        }

        // Call reserveRange on voucher
        bosonVoucher.reserveRange(_offerId, _startId, _length, _to);

        // Notify external observers
        emit RangeReserved(_offerId, offer.sellerId, _startId, _startId + _length - 1, _to, sender);
    }
}
