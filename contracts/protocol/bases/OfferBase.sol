// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import { IBosonOfferEvents } from "../../interfaces/events/IBosonOfferEvents.sol";
import { ProtocolBase } from "./../bases/ProtocolBase.sol";
import { BuyerBase } from "./../bases/BuyerBase.sol";
import { ProtocolLib } from "./../libs/ProtocolLib.sol";
import { IBosonVoucher } from "../../interfaces/clients/IBosonVoucher.sol";
import { IERC165 } from "../../interfaces/IERC165.sol";
import { IDRFeeMutualizer } from "../../interfaces/clients/IDRFeeMutualizer.sol";
import "./../../domain/BosonConstants.sol";

/**
 * @title OfferBase
 *
 * @dev Provides methods for offer creation that can be shared across facets.
 */
contract OfferBase is ProtocolBase, BuyerBase, IBosonOfferEvents {
    string private constant OFFER_TYPE =
        "Offer(uint256 sellerId,uint256 price,uint256 sellerDeposit,uint256 buyerCancelPenalty,uint256 quantityAvailable,address exchangeToken,string metadataUri,string metadataHash,uint256 collectionIndex,RoyaltyInfo royaltyInfo,uint8 creator,uint256 buyerId)";
    string private constant ROYALTY_INFO_TYPE = "RoyaltyInfo(address[] recipients,uint256[] bps)";
    string private constant OFFER_DATES_TYPE =
        "OfferDates(uint256 validFrom,uint256 validUntil,uint256 voucherRedeemableFrom,uint256 voucherRedeemableUntil)";
    string private constant OFFER_DURATIONS_TYPE =
        "OfferDurations(uint256 disputePeriod,uint256 voucherValid,uint256 resolutionPeriod)";
    string private constant DR_PARAMETERS_TYPE = "DRParameters(uint256 disputeResolverId,address mutualizerAddress)";
    string private constant CONDITION_TYPE =
        "Condition(uint8 method,uint8 tokenType,address tokenAddress,uint8 gating,uint256 minTokenId,uint256 threshold,uint256 maxCommits,uint256 maxTokenId)";

    bytes32 private immutable OFFER_TYPEHASH = keccak256(bytes(string.concat(OFFER_TYPE, ROYALTY_INFO_TYPE)));
    bytes32 private constant ROYALTY_INFO_TYPEHASH = keccak256(bytes(ROYALTY_INFO_TYPE));
    bytes32 private constant OFFER_DATES_TYPEHASH = keccak256(bytes(OFFER_DATES_TYPE));
    bytes32 private constant OFFER_DURATIONS_TYPEHASH = keccak256(bytes(OFFER_DURATIONS_TYPE));
    bytes32 private constant DR_PARAMETERS_TYPEHASH = keccak256(bytes(DR_PARAMETERS_TYPE));
    bytes32 private constant CONDITION_TYPEHASH = keccak256(bytes(CONDITION_TYPE));
    bytes32 private immutable FULL_OFFER_TYPEHASH =
        keccak256(
            bytes(
                string.concat(
                    "FullOffer(Offer offer,OfferDates offerDates,OfferDurations offerDurations,DRParameters drParameters,Condition condition,uint256 agentId,uint256 feeLimit)",
                    CONDITION_TYPE,
                    DR_PARAMETERS_TYPE,
                    OFFER_TYPE,
                    OFFER_DATES_TYPE,
                    OFFER_DURATIONS_TYPE,
                    ROYALTY_INFO_TYPE
                )
            )
        );

    /**
     * @notice Creates offer. Can be reused among different facets.
     *
     * Emits an OfferCreated event if successful.
     *
     * Reverts if:
     * - Caller is not an assistant in case of seller-initiated offer
     * - sellerId is not 0 when buyer-initiated offer is created
     * - collectionIndex is not 0 when buyer-initiated offer is created
     * - royaltyInfo is not empty when buyer-initiated offer is created
     * - priceType is not Static when buyer-initiated offer is created
     * - Invalid offer creator value specified (OfferCreator.Seller or OfferCreator.Buyer)
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
     * - If the sum of agent fee amount and protocol fee amount is greater than the offer fee limit determined by the protocol
     * - If the sum of agent fee amount and protocol fee amount is greater than fee limit set by seller
     * - Royalty recipient is not on seller's allow list
     * - Royalty percentage is less than the value decided by the admin
     * - Total royalty percentage is more than max royalty percentage
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _drParameters - the id of chosen dispute resolver (can be 0) and mutualizer address (0 for self-mutualization)
     * @param _agentId - the id of agent
     * @param _feeLimit - the maximum fee that seller is willing to pay per exchange (for static offers)
     */
    function createOfferInternal(
        Offer memory _offer,
        OfferDates calldata _offerDates,
        OfferDurations calldata _offerDurations,
        BosonTypes.DRParameters calldata _drParameters,
        uint256 _agentId,
        uint256 _feeLimit,
        bool _authenticate
    ) internal returns (uint256 offerId) {
        address sender = _msgSender();

        if (_offer.creator == OfferCreator.Seller) {
            if (_offer.buyerId != 0) revert InvalidBuyerOfferFields();

            // Validate caller is seller assistant
            if (_authenticate) {
                (bool isAssistant, uint256 sellerId) = getSellerIdByAssistant(sender);
                if (!isAssistant) {
                    revert NotAssistant();
                }
                _offer.sellerId = sellerId;
            }
        } else if (_offer.creator == OfferCreator.Buyer) {
            if (
                _offer.sellerId != 0 ||
                _offer.collectionIndex != 0 ||
                _offer.royaltyInfo.length != 1 ||
                _offer.royaltyInfo[0].recipients.length != 0 ||
                _offer.royaltyInfo[0].bps.length != 0 ||
                _drParameters.mutualizerAddress != address(0) ||
                _offer.quantityAvailable != 1 ||
                _offer.priceType != PriceType.Static
            ) {
                revert InvalidBuyerOfferFields();
            }
            if (_authenticate) _offer.buyerId = getValidBuyer(payable(sender));
        }

        // Get the next offerId and increment the counter
        offerId = protocolCounters().nextOfferId++;
        _offer.id = offerId;

        // Store the offer
        storeOffer(_offer, _offerDates, _offerDurations, _drParameters, _agentId, _feeLimit);
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
     * - If the sum of agent fee amount and protocol fee amount is greater than the offer fee limit determined by the protocol
     * - If the sum of agent fee amount and protocol fee amount is greater than fee limit set by seller
     * - Royalty recipient is not on seller's allow list
     * - Royalty percentage is less than the value decided by the admin
     * - Total royalty percentage is more than max royalty percentage
     *
     * @param _offer - the fully populated struct with offer id set to offer to be updated and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _drParameters - the id of chosen dispute resolver (can be 0) and mutualizer address (0 for self-mutualization)
     * @param _agentId - the id of agent
     * @param _feeLimit - the maximum fee that seller is willing to pay per exchange (for static offers)
     */
    function storeOffer(
        Offer memory _offer,
        OfferDates calldata _offerDates,
        OfferDurations calldata _offerDurations,
        BosonTypes.DRParameters calldata _drParameters,
        uint256 _agentId,
        uint256 _feeLimit
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
            if (_offer.price != 0 || _offer.sellerDeposit != 0 || _drParameters.disputeResolverId != 0) {
                (
                    bool exists,
                    DisputeResolver storage disputeResolver,
                    DisputeResolverFee[] storage disputeResolverFees
                ) = fetchDisputeResolver(_drParameters.disputeResolverId);
                if (!exists || !disputeResolver.active) revert InvalidDisputeResolver();

                // Operate in a block to avoid "stack too deep" error
                {
                    // check that seller is on the DR allow list
                    if (lookups.allowedSellers[_drParameters.disputeResolverId].length > 0) {
                        // if length == 0, dispute resolver allows any seller
                        // if length > 0, we check that it is on allow list
                        if (lookups.allowedSellerIndex[_drParameters.disputeResolverId][_offer.sellerId] == 0)
                            revert SellerNotApproved();
                    }

                    // get the index of DisputeResolverFee and make sure DR supports the exchangeToken
                    {
                        uint256 feeIndex = lookups.disputeResolverFeeTokenIndex[_drParameters.disputeResolverId][
                            _offer.exchangeToken
                        ];
                        if (feeIndex == 0) revert DRUnsupportedFee();

                        uint256 feeAmount = disputeResolverFees[feeIndex - 1].feeAmount;

                        // store DR terms
                        disputeResolutionTerms.disputeResolverId = _drParameters.disputeResolverId;
                        disputeResolutionTerms.escalationResponsePeriod = disputeResolver.escalationResponsePeriod;
                        disputeResolutionTerms.feeAmount = feeAmount;
                        disputeResolutionTerms.buyerEscalationDeposit =
                            (feeAmount * fees.buyerEscalationDepositPercentage) /
                            HUNDRED_PERCENT;
                        disputeResolutionTerms.mutualizerAddress = _drParameters.mutualizerAddress;

                        // Validate mutualizer interface if address is not zero (non-zero means external mutualizer)
                        if (_drParameters.mutualizerAddress != address(0)) {
                            (bool success, bytes memory data) = _drParameters.mutualizerAddress.staticcall(
                                abi.encodeWithSelector(
                                    IERC165.supportsInterface.selector,
                                    type(IDRFeeMutualizer).interfaceId
                                )
                            );

                            if (!success || data.length != 32 || abi.decode(data, (bool)) == false) {
                                revert UnsupportedMutualizer();
                            }
                        }
                    }
                    protocolEntities().disputeResolutionTerms[_offer.id] = disputeResolutionTerms;
                }

                // Collection must exist. Collections with index 0 exist by default.
                if (_offer.collectionIndex > 0) {
                    if (lookups.additionalCollections[_offer.sellerId].length < _offer.collectionIndex)
                        revert NoSuchCollection();
                }
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
                if (_offer.priceType == PriceType.Static) {
                    // Calculate and set the protocol fee
                    uint256 protocolFee = _getProtocolFee(_offer.exchangeToken, offerPrice);

                    // Calculate the agent fee amount
                    uint256 agentFeeAmount = (agent.feePercentage * offerPrice) / HUNDRED_PERCENT;

                    uint256 totalOfferFeeLimit = (limits.maxTotalOfferFeePercentage * offerPrice) / HUNDRED_PERCENT;

                    // Sum of agent fee amount and protocol fee amount should be <= offer fee limit and less that fee limit set by seller
                    uint256 totalFeeAmount = agentFeeAmount + protocolFee;
                    if (totalFeeAmount > totalOfferFeeLimit) revert AgentFeeAmountTooHigh();
                    if (totalFeeAmount > _feeLimit) revert TotalFeeExceedsLimit();

                    // Set offer fees props individually since calldata structs can't be copied to storage
                    offerFees.protocolFee = protocolFee;
                    offerFees.agentFee = agentFeeAmount;
                }
            }

            // Store the agent id for the offer
            lookups.agentIdByOffer[_offer.id] = _agentId;

            if (_offer.royaltyInfo.length != 1) revert InvalidRoyaltyInfo();
            validateRoyaltyInfo(lookups, limits, _offer.sellerId, _offer.royaltyInfo[0]);
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
        offer.creator = _offer.creator;
        offer.buyerId = _offer.buyerId;
        offer.royaltyInfo.push(_offer.royaltyInfo[0]);

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
            _msgSender()
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

        address sender = _msgSender();

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

    /**
     * @notice Validates that royalty info struct contains valid data
     *
     * Reverts if:
     * - Royalty recipient is not on seller's allow list
     * - Royalty percentage is less than the value decided by the admin
     * - Total royalty percentage is more than max royalty percentage
     *
     * @param _lookups -  the storage pointer to protocol lookups
     * @param _limits - the storage pointer to protocol limits
     * @param _sellerId - the id of the seller
     * @param _royaltyInfo - the royalty info struct
     */
    function validateRoyaltyInfo(
        ProtocolLib.ProtocolLookups storage _lookups,
        ProtocolLib.ProtocolLimits storage _limits,
        uint256 _sellerId,
        RoyaltyInfo memory _royaltyInfo
    ) internal view {
        if (_royaltyInfo.recipients.length != _royaltyInfo.bps.length) revert ArrayLengthMismatch();

        RoyaltyRecipientInfo[] storage royaltyRecipients = _lookups.royaltyRecipientsBySeller[_sellerId];

        uint256 totalRoyalties;
        for (uint256 i = 0; i < _royaltyInfo.recipients.length; ) {
            uint256 royaltyRecipientId;

            if (_royaltyInfo.recipients[i] == address(0)) {
                royaltyRecipientId = 1;
            } else {
                royaltyRecipientId = _lookups.royaltyRecipientIndexBySellerAndRecipient[_sellerId][
                    _royaltyInfo.recipients[i]
                ];
                if (royaltyRecipientId == 0) revert InvalidRoyaltyRecipient();
            }

            if (_royaltyInfo.bps[i] < royaltyRecipients[royaltyRecipientId - 1].minRoyaltyPercentage)
                revert InvalidRoyaltyPercentage();

            totalRoyalties += _royaltyInfo.bps[i];

            unchecked {
                i++;
            }
        }

        if (totalRoyalties > _limits.maxRoyaltyPercentage) revert InvalidRoyaltyPercentage();
    }

    /**
     * @notice Computes the EIP712 hash of the full offer parameters.
     *
     * @param _fullOffer - the fully populated struct containing offer, offer dates, offer durations, dispute resolution parameters, condition, agent id and fee limit
     * @return - the hash of the complete offer
     */
    function getOfferHash(BosonTypes.FullOffer calldata _fullOffer) internal view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    FULL_OFFER_TYPEHASH,
                    hashOffer(_fullOffer.offer),
                    keccak256(abi.encode(OFFER_DATES_TYPEHASH, _fullOffer.offerDates)),
                    keccak256(abi.encode(OFFER_DURATIONS_TYPEHASH, _fullOffer.offerDurations)),
                    keccak256(abi.encode(DR_PARAMETERS_TYPEHASH, _fullOffer.drParameters)),
                    keccak256(abi.encode(CONDITION_TYPEHASH, _fullOffer.condition)),
                    _fullOffer.agentId,
                    _fullOffer.feeLimit
                )
            );
    }

    /**
     * @notice Hashes the modified offer struct for EIP712.
     *
     * It does not include the id, priceType, quantityAvailable since they are constant and validated elsewhere.
     * RoyaltyInfo is also simplified to a single recipients and bps list (this is also enforced in createOfferInternal).
     *
     * @param _offer - the offer to hash
     * @return - the hash of the offer
     */
    function hashOffer(BosonTypes.Offer memory _offer) internal view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    OFFER_TYPEHASH,
                    _offer.sellerId,
                    _offer.price,
                    _offer.sellerDeposit,
                    _offer.buyerCancelPenalty,
                    _offer.quantityAvailable,
                    _offer.exchangeToken,
                    keccak256(bytes(_offer.metadataUri)),
                    keccak256(bytes(_offer.metadataHash)),
                    _offer.collectionIndex,
                    keccak256(
                        abi.encode(
                            ROYALTY_INFO_TYPEHASH,
                            keccak256(abi.encodePacked(_offer.royaltyInfo[0].recipients)),
                            keccak256(abi.encodePacked(_offer.royaltyInfo[0].bps))
                        )
                    ),
                    _offer.creator,
                    _offer.buyerId
                )
            );
    }
}
