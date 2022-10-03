// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import { IBosonOfferEvents } from "../../interfaces/events/IBosonOfferEvents.sol";
import { ProtocolBase } from "./../bases/ProtocolBase.sol";
import { ProtocolLib } from "./../libs/ProtocolLib.sol";
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
     * - Caller is not an operator
     * - Valid from date is greater than valid until date
     * - Valid until date is not in the future
     * - Both voucher expiration date and voucher expiration period are defined
     * - Neither of voucher expiration date and voucher expiration period are defined
     * - Voucher redeemable period is fixed, but it ends before it starts
     * - Voucher redeemable period is fixed, but it ends before offer expires
     * - Dispute period is less than minimum dispute period
     * - Resolution period is set to zero or above the maximum resolution period
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
        (bool exists, uint256 sellerId) = getSellerIdByOperator(msgSender());
        require(exists, NOT_OPERATOR);
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
     * - Resolution period is set to zero or above the maximum resolution period
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
        require(_offerDates.validFrom < _offerDates.validUntil, OFFER_PERIOD_INVALID);

        // validUntil date must be in the future
        require(_offerDates.validUntil > block.timestamp, OFFER_PERIOD_INVALID);

        // exactly one of voucherRedeemableUntil and voucherValid must be zero
        // if voucherRedeemableUntil exist, it must be greater than validUntil
        if (_offerDates.voucherRedeemableUntil > 0) {
            require(_offerDurations.voucherValid == 0, AMBIGUOUS_VOUCHER_EXPIRY);
            require(_offerDates.voucherRedeemableFrom < _offerDates.voucherRedeemableUntil, REDEMPTION_PERIOD_INVALID);
            require(_offerDates.voucherRedeemableUntil >= _offerDates.validUntil, REDEMPTION_PERIOD_INVALID);
        } else {
            require(_offerDurations.voucherValid > 0, AMBIGUOUS_VOUCHER_EXPIRY);
        }

        // Operate in a block to avoid "stack too deep" error
        {
            // Cache protocol limits for reference
            ProtocolLib.ProtocolLimits storage limits = protocolLimits();

            // dispute period must be greater than or equal to the minimum dispute period
            require(_offerDurations.disputePeriod >= limits.minDisputePeriod, INVALID_DISPUTE_PERIOD);

            // dispute duration must be greater than zero
            require(
                _offerDurations.resolutionPeriod > 0 && _offerDurations.resolutionPeriod <= limits.maxResolutionPeriod,
                INVALID_RESOLUTION_PERIOD
            );
        }

        // when creating offer, it cannot be set to voided
        require(!_offer.voided, OFFER_MUST_BE_ACTIVE);

        // quantity must be greater than zero
        require(_offer.quantityAvailable > 0, INVALID_QUANTITY_AVAILABLE);

        // Specified resolver must be registered and active, except for absolute zero offers with unspecified dispute resolver.
        // If price and sellerDeposit are 0, seller is not obliged to choose dispute resolver, which is done by setting _disputeResolverId to 0.
        // In this case, there is no need to check the validity of the dispute resolver. However, if one (or more) of {price, sellerDeposit, _disputeResolverId}
        // is different from 0, it must be checked that dispute resolver exists, supports the exchange token and seller is allowed to choose them.
        DisputeResolutionTerms memory disputeResolutionTerms;
        if (_offer.price != 0 || _offer.sellerDeposit != 0 || _disputeResolverId != 0) {
            (
                bool exists,
                DisputeResolver storage disputeResolver,
                DisputeResolverFee[] storage disputeResolverFees
            ) = fetchDisputeResolver(_disputeResolverId);
            require(exists && disputeResolver.active, INVALID_DISPUTE_RESOLVER);

            // Operate in a block to avoid "stack too deep" error
            {
                // Cache protocol lookups for reference
                ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

                // check that seller is on the DR allow list
                if (lookups.allowedSellers[_disputeResolverId].length > 0) {
                    // if length == 0, dispute resolver allows any seller
                    // if length > 0, we check that it is on allow list
                    require(lookups.allowedSellerIndex[_disputeResolverId][_offer.sellerId] > 0, SELLER_NOT_APPROVED);
                }

                // get the index of DisputeResolverFee and make sure DR supports the exchangeToken
                uint256 feeIndex = lookups.disputeResolverFeeTokenIndex[_disputeResolverId][_offer.exchangeToken];
                require(feeIndex > 0, DR_UNSUPPORTED_FEE);

                uint256 feeAmount = disputeResolverFees[feeIndex - 1].feeAmount;

                // store DR terms
                disputeResolutionTerms.disputeResolverId = _disputeResolverId;
                disputeResolutionTerms.escalationResponsePeriod = disputeResolver.escalationResponsePeriod;
                disputeResolutionTerms.feeAmount = feeAmount;
                disputeResolutionTerms.buyerEscalationDeposit =
                    (feeAmount * protocolFees().buyerEscalationDepositPercentage) /
                    10000;

                protocolEntities().disputeResolutionTerms[_offer.id] = disputeResolutionTerms;
            }
        }

        // Get storage location for offer fees
        OfferFees storage offerFees = fetchOfferFees(_offer.id);

        // Get the agent
        (bool agentExists, Agent storage agent) = fetchAgent(_agentId);

        // Make sure agent exists if _agentId is not zero.
        require(_agentId == 0 || agentExists, NO_SUCH_AGENT);

        // Operate in a block to avoid "stack too deep" error
        {
            // Set variable to eliminate multiple SLOAD
            uint256 offerPrice = _offer.price;

            // condition for successful payout when exchange final state is canceled
            require(_offer.buyerCancelPenalty <= offerPrice, OFFER_PENALTY_INVALID);

            // Calculate and set the protocol fee
            uint256 protocolFee = _offer.exchangeToken == protocolAddresses().token
                ? protocolFees().flatBoson
                : (protocolFees().percentage * offerPrice) / 10000;

            // Calculate the agent fee amount
            uint256 agentFeeAmount = (agent.feePercentage * offerPrice) / 10000;

            uint256 totalOfferFeeLimit = (protocolLimits().maxTotalOfferFeePercentage * offerPrice) / 10000;

            // Sum of agent fee amount and protocol fee amount should be <= offer fee limit
            require((agentFeeAmount + protocolFee) <= totalOfferFeeLimit, AGENT_FEE_AMOUNT_TOO_HIGH);

            //Set offer fees props individually since calldata structs can't be copied to storage
            offerFees.protocolFee = protocolFee;
            offerFees.agentFee = agentFeeAmount;

            // Store the agent id for the offer
            protocolLookups().agentIdByOffer[_offer.id] = _agentId;
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
}
