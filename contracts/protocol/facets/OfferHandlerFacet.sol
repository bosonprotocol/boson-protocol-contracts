// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { IBosonOfferHandler } from "../../interfaces/handlers/IBosonOfferHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { OfferBase } from "../bases/OfferBase.sol";
import "../../domain/BosonConstants.sol";
import { BosonTypes } from "../../domain/BosonTypes.sol";

/**
 * @title OfferHandlerFacet
 *
 * @notice Handles offer management requests and queries.
 */
contract OfferHandlerFacet is IBosonOfferHandler, OfferBase {
    /**
     * @notice Initializes facet.
     * This function is callable only once.
     */
    function initialize() public onlyUninitialized(type(IBosonOfferHandler).interfaceId) {
        DiamondLib.addSupportedInterface(type(IBosonOfferHandler).interfaceId);
    }

    /**
     * @notice Creates an offer.
     *
     * Emits an OfferCreated event if successful.
     *
     * Reverts if:
     * - The offers region of protocol is paused
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
     * - Collection does not exist
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
    function createOffer(
        Offer memory _offer,
        OfferDates calldata _offerDates,
        OfferDurations calldata _offerDurations,
        BosonTypes.DRParameters calldata _drParameters,
        uint256 _agentId,
        uint256 _feeLimit
    ) external override offersNotPaused nonReentrant {
        createOfferInternal(_offer, _offerDates, _offerDurations, _drParameters, _agentId, _feeLimit, true);
    }

    /**
     * @notice Creates a batch of offers.
     *
     * Emits an OfferCreated event for every offer if successful.
     *
     * Reverts if:
     * - The offers region of protocol is paused
     * - Number of elements in offers, offerDates, offerDurations, disputeResolverIds, agentIds, feeLimits and mutualizerAddresses do not match
     * - For any offer:
     *   - Caller is not an assistant
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Both voucher expiration date and voucher expiration period are defined
     *   - Neither of voucher expiration date and voucher expiration period are defined
     *   - Voucher redeemable period is fixed, but it ends before it starts
     *   - Voucher redeemable period is fixed, but it ends before offer expires
     *   - Dispute period is less than minimum dispute period
     *   - Resolution period is not between the minimum and the maximum resolution period
     *   - Voided is set to true
     *   - Available quantity is set to zero
     *   - Dispute resolver wallet is not registered, except for absolute zero offers with unspecified dispute resolver
     *   - Dispute resolver is not active, except for absolute zero offers with unspecified dispute resolver
     *   - Seller is not on dispute resolver's seller allow list
     *   - Dispute resolver does not accept fees in the exchange token
     *   - Buyer cancel penalty is greater than price
     *   - Collection does not exist
     * - When agent ids are non zero:
     *   - If Agent does not exist
     * - If the sum of agent fee amount and protocol fee amount is greater than the offer fee limit determined by the protocol
     * - If the sum of agent fee amount and protocol fee amount is greater than fee limit set by seller
     * - Royalty recipient is not on seller's allow list
     * - Royalty percentage is less than the value decided by the admin
     * - Total royalty percentage is more than max royalty percentage
     *
     * @param _offers - the array of fully populated Offer structs with offer id set to 0x0 and voided set to false
     * @param _offerDates - the array of fully populated offer dates structs
     * @param _offerDurations - the array of fully populated offer durations structs
     * @param _drParameters - the array of ids of chosen dispute resolvers (can be 0) and mutualizer address (0 for self-mutualization)
     * @param _agentIds - the array of ids of agents
     * @param _feeLimits - the array of maximum fees that seller is willing to pay per exchange (for static offers)
     */
    function createOfferBatch(
        Offer[] calldata _offers,
        OfferDates[] calldata _offerDates,
        OfferDurations[] calldata _offerDurations,
        DRParameters[] calldata _drParameters,
        uint256[] calldata _agentIds,
        uint256[] calldata _feeLimits
    ) external override offersNotPaused nonReentrant {
        // Number of offer dates structs, offer durations structs and drParameters must match the number of offers
        if (
            _offers.length != _offerDates.length ||
            _offers.length != _offerDurations.length ||
            _offers.length != _drParameters.length ||
            _offers.length != _agentIds.length ||
            _offers.length != _feeLimits.length
        ) {
            revert ArrayLengthMismatch();
        }
        for (uint256 i; i < _offers.length; ) {
            // Create offer and update structs values to represent true state
            createOfferInternal(
                _offers[i],
                _offerDates[i],
                _offerDurations[i],
                _drParameters[i],
                _agentIds[i],
                _feeLimits[i],
                true
            );
            unchecked {
                i++;
            }
        }
    }

    /**
     * @notice Reserves a range of vouchers to be associated with an offer
     *
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
    function reserveRange(uint256 _offerId, uint256 _length, address _to) external override nonReentrant {
        reserveRangeInternal(_offerId, _length, _to);
    }

    /**
     * @notice Voids a given offer.
     * Existing exchanges are not affected.
     * No further vouchers can be issued against a voided offer.
     *
     * Emits an OfferVoided event if successful.
     *
     * Reverts if:
     * - The offers region of protocol is paused
     * - Offer id is invalid
     * - Caller is not the assistant of the offer
     * - Offer has already been voided
     *
     * @param _offerId - the id of the offer to void
     */
    function voidOffer(uint256 _offerId) external override offersNotPaused nonReentrant {
        voidOfferInternal(_offerId);
    }

    /**
     * @notice  Voids a batch of offers.
     * Existing exchanges are not affected.
     * No further vouchers can be issued against a voided offer.
     *
     * Emits an OfferVoided event for every offer if successful.
     *
     * Reverts if, for any offer:
     * - The offers region of protocol is paused
     * - Offer id is invalid
     * - Caller is not the assistant of the offer
     * - Offer has already been voided
     *
     * @param _offerIds - list of ids of offers to void
     */
    function voidOfferBatch(uint256[] calldata _offerIds) external override offersNotPaused nonReentrant {
        for (uint256 i = 0; i < _offerIds.length; ) {
            voidOfferInternal(_offerIds[i]);

            unchecked {
                i++;
            }
        }
    }

    /**
     * @notice Voids a non-listed offer. (offers used in `createOfferAndCommit`)
     * It prevents the offer from being used in future exchanges even if it was already signed.
     *
     * Emits an OfferVoided event if successful.
     *
     * Reverts if:
     * - The offers region of protocol is paused
     * - Caller is not the authorized to void the offer
     * - Offer has already been voided
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _drParameters - the id of chosen dispute resolver (can be 0) and mutualizer address (0 for self-mutualization)
     * @param _agentId - the id of agent
     * @param _feeLimit - the maximum fee that seller is willing to pay per exchange (for static offers)
     */
    function voidNonListedOffer(
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        BosonTypes.DRParameters calldata _drParameters,
        uint256 _agentId,
        uint256 _feeLimit
    ) external override offersNotPaused nonReentrant {
        voidNonListedOfferInternal(_offer, _offerDates, _offerDurations, _drParameters, _agentId, _feeLimit);
    }

    /**
     * @notice Voids multiple a non-listed offer. (offers used in `createOfferAndCommit`)
     * It prevents the offers from being used in future exchanges even if they were already signed.
     *
     * Emits an OfferVoided events if successful.
     *
     * Reverts if:
     * - The number of elements in offers, offerDates, offerDurations, disputeResolverIds, agentIds and feeLimits do not match
     * - The offers region of protocol is paused
     * - Caller is not the authorized to void the offer
     * - Offer has already been voided
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _drParameters - the id of chosen dispute resolver (can be 0) and mutualizer address (0 for self-mutualization)
     * @param _agentId - the id of agent
     * @param _feeLimit - the maximum fee that seller is willing to pay per exchange (for static offers)
     */
    function voidNonListedOfferBatch(
        BosonTypes.Offer[] calldata _offer,
        BosonTypes.OfferDates[] calldata _offerDates,
        BosonTypes.OfferDurations[] calldata _offerDurations,
        BosonTypes.DRParameters[] calldata _drParameters,
        uint256[] calldata _agentId,
        uint256[] calldata _feeLimit
    ) external override offersNotPaused nonReentrant {
        if (
            _offer.length != _offerDates.length ||
            _offer.length != _offerDurations.length ||
            _offer.length != _drParameters.length ||
            _offer.length != _agentId.length ||
            _offer.length != _feeLimit.length
        ) {
            revert ArrayLengthMismatch();
        }

        for (uint256 i; i < _offer.length; ++i) {
            voidNonListedOfferInternal(_offer[i], _offerDates[i], _offerDurations[i], _drParameters[i], _agentId[i], _feeLimit[i]);
        }    
    }

    /**
     * @notice Sets new valid until date.
     *
     * Emits an OfferExtended event if successful.
     *
     * Reverts if:
     * - The offers region of protocol is paused
     * - Offer does not exist
     * - Caller is not the assistant of the offer
     * - New valid until date is before existing valid until dates
     * - Offer has voucherRedeemableUntil set and new valid until date is greater than that
     *
     *  @param _offerId - the id of the offer to extend
     *  @param _validUntilDate - new valid until date
     */
    function extendOffer(uint256 _offerId, uint256 _validUntilDate) external override offersNotPaused nonReentrant {
        extendOfferInternal(_offerId, _validUntilDate);
    }

    /**
     * @notice Sets new valid until date for a batch of offers.
     *
     * Emits an OfferExtended event for every offer if successful.
     *
     * Reverts if:
     * - The offers region of protocol is paused
     * - For any of the offers:
     *   - Offer does not exist
     *   - Caller is not the assistant of the offer
     *   - New valid until date is before existing valid until dates
     *   - Offer has voucherRedeemableUntil set and new valid until date is greater than that
     *
     *  @param _offerIds - list of ids of the offers to extend
     *  @param _validUntilDate - new valid until date
     */
    function extendOfferBatch(
        uint256[] calldata _offerIds,
        uint256 _validUntilDate
    ) external override offersNotPaused nonReentrant {
        for (uint256 i = 0; i < _offerIds.length; ) {
            extendOfferInternal(_offerIds[i], _validUntilDate);

            unchecked {
                i++;
            }
        }
    }

    /**
     * @notice Sets new valid royalty info.
     *
     * Emits an OfferRoyaltyInfoUpdated event if successful.
     *
     * Reverts if:
     * - The offers region of protocol is paused
     * - Offer does not exist
     * - Caller is not the assistant of the offer
     * - New royalty info is invalid
     *
     *  @param _offerId - the id of the offer to be updated
     *  @param _royaltyInfo - new royalty info
     */
    function updateOfferRoyaltyRecipients(
        uint256 _offerId,
        RoyaltyInfo calldata _royaltyInfo
    ) external override offersNotPaused nonReentrant {
        updateOfferRoyaltyRecipientsInternal(_offerId, _royaltyInfo);
    }

    /**
     * @notice Sets new valid until date for a batch of offers.
     *
     * Emits an OfferExtended event for every offer if successful.
     *
     * Reverts if:
     * - The offers region of protocol is paused
     * - For any of the offers:
     *   - Offer does not exist
     *   - Caller is not the assistant of the offer
     *   - New royalty info is invalid
     *
     *  @param _offerIds - list of ids of the offers to extend
     *  @param _royaltyInfo - new royalty info
     */
    function updateOfferRoyaltyRecipientsBatch(
        uint256[] calldata _offerIds,
        BosonTypes.RoyaltyInfo calldata _royaltyInfo
    ) external override offersNotPaused nonReentrant {
        for (uint256 i = 0; i < _offerIds.length; ) {
            updateOfferRoyaltyRecipientsInternal(_offerIds[i], _royaltyInfo);

            unchecked {
                i++;
            }
        }
    }

    /**
     * @notice Updates the mutualizer address for an offer.
     *
     * Emits an OfferMutualizerUpdated event if successful.
     *
     * Reverts if:
     * - The offers region of protocol is paused
     * - Offer does not exist
     * - Caller is not the assistant of the offer
     * - Offer has already been voided
     *
     * @param _offerId - the id of the offer to update
     * @param _newMutualizer - the new mutualizer address (can be zero for self-mutualization)
     */
    function updateOfferMutualizer(
        uint256 _offerId,
        address _newMutualizer
    ) external override offersNotPaused nonReentrant {
        updateOfferMutualizerInternal(_offerId, _newMutualizer);
    }

    /**
     * @notice Internal function to void a given offer, used by both single and batch void functions.
     * Existing exchanges are not affected.
     * No further vouchers can be issued against a voided offer.
     *
     * Emits an OfferVoided event if successful.
     *
     * Reverts if:
     * - The offers region of protocol is paused
     * - Offer id is invalid
     * - Caller is not authorized (for seller-created offers: not the seller assistant; for buyer-created offers: not the buyer who created it)
     * - Offer has already been voided
     *
     * @param _offerId - the id of the offer to void
     */
    function voidOfferInternal(uint256 _offerId) internal {
        // Get offer. Make sure caller is authorized to void it
        (Offer storage offer, uint256 creatorId) = getValidOfferWithCreatorCheck(_offerId);

        // Void the offer
        offer.voided = true;

        // Notify listeners of state change - emit creatorId as the "sellerId" parameter for consistency
        emit OfferVoided(_offerId, creatorId, _msgSender());
    }

    /**
     * @notice Voids a non-listed offer. (offers used in `createOfferAndCommit`)
     * It prevents the offer from being used in future exchanges even if it was already signed.
     *
     * Emits an OfferVoided event if successful.
     *
     * Reverts if:
     * - The offers region of protocol is paused
     * - Caller is not the authorized to void the offer
     * - Offer has already been voided
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _drParameters - the id of chosen dispute resolver (can be 0) and mutualizer address (0 for self-mutualization)
     * @param _agentId - the id of agent
     * @param _feeLimit - the maximum fee that seller is willing to pay per exchange (for static offers)
     */
    function voidNonListedOfferInternal(
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        BosonTypes.DRParameters calldata _drParameters,
        uint256 _agentId,
        uint256 _feeLimit
    ) internal {
        // Make sure the caller is authorized to void the offer
        address sender = _msgSender();
        if (_offer.creator == BosonTypes.OfferCreator.Seller) {
            (, Seller storage seller, ) = fetchSeller(_offer.sellerId);
            if (seller.assistant != sender) revert NotAssistant();
        } else {
            uint256 buyerId = getValidBuyer(payable(sender));
            if (_offer.buyerId != buyerId) {
                revert NotBuyerWallet();
            }
        }

        bytes32 offerHash = getOfferHash(_offer, _offerDates, _offerDurations, _drParameters, _agentId, _feeLimit);

        ProtocolLib.ProtocolLookups storage pl = protocolLookups();
        if (pl.isOfferVoided[offerHash]) {
            revert OfferHasBeenVoided();
        }

        pl.isOfferVoided[offerHash] = true;
    }

    /**
     * @notice Internal function to set new valid until date, used by both single and batch extend functions.
     *
     * Emits an OfferExtended event if successful.
     *
     * Reverts if:
     * - The offers region of protocol is paused
     * - Offer does not exist
     * - Caller is not the assistant of the offer
     * - New valid until date is before existing valid until dates
     * - Offer has voucherRedeemableUntil set and new valid until date is greater than that
     *
     *  @param _offerId - the id of the offer to extend
     *  @param _validUntilDate - new valid until date
     */
    function extendOfferInternal(uint256 _offerId, uint256 _validUntilDate) internal {
        // Make sure the caller is the assistant, offer exists and is not voided
        Offer storage offer = getValidOfferWithSellerCheck(_offerId);

        // Fetch the offer dates
        OfferDates storage offerDates = fetchOfferDates(_offerId);

        // New valid until date must be greater than existing one
        if (offerDates.validUntil >= _validUntilDate) revert InvalidOfferPeriod();

        // If voucherRedeemableUntil is set, _validUntilDate must be less or equal than that
        if (offerDates.voucherRedeemableUntil > 0) {
            if (_validUntilDate > offerDates.voucherRedeemableUntil) revert InvalidOfferPeriod();
        }

        // Update the valid until property
        offerDates.validUntil = _validUntilDate;

        // Notify watchers of state change
        emit OfferExtended(_offerId, offer.sellerId, _validUntilDate, _msgSender());
    }

    /**
     * @notice Internal function to update the royalty recipients, used by both single and batch update functions.
     *
     * Emits an OfferRoyaltyInfoUpdated event if successful.
     *
     * Reverts if:
     * - The offers region of protocol is paused
     * - Offer does not exist
     * - Caller is not the assistant of the offer
     * - New royalty info is invalid
     *
     *  @param _offerId - the id of the offer to be updated
     *  @param _royaltyInfo - new royalty info
     */
    function updateOfferRoyaltyRecipientsInternal(uint256 _offerId, RoyaltyInfo calldata _royaltyInfo) internal {
        // Make sure the caller is the assistant, offer exists and is not voided
        Offer storage offer = getValidOfferWithSellerCheck(_offerId);

        validateRoyaltyInfo(protocolLookups(), protocolLimits(), offer.sellerId, _royaltyInfo);

        // Add new entry to the royaltyInfo array
        offer.royaltyInfo.push(_royaltyInfo);

        // Notify watchers of state change
        emit OfferRoyaltyInfoUpdated(_offerId, offer.sellerId, _royaltyInfo, _msgSender());
    }

    /**
     * @notice Internal function to update the mutualizer address for an offer.
     *
     * Emits an OfferMutualizerUpdated event if successful.
     *
     * Reverts if:
     * - The offers region of protocol is paused
     * - Offer does not exist
     * - Caller is not the assistant of the offer
     * - Offer has already been voided
     * - New mutualizer address is the same as the existing one
     *
     * @param _offerId - the id of the offer to update
     * @param _newMutualizer - the new mutualizer address (can be zero for self-mutualization)
     */
    function updateOfferMutualizerInternal(uint256 _offerId, address _newMutualizer) internal {
        // Make sure the caller is the assistant, offer exists and is not voided
        Offer storage offer = getValidOfferWithSellerCheck(_offerId);

        DisputeResolutionTerms storage disputeResolutionTerms = fetchDisputeResolutionTerms(_offerId);
        if (disputeResolutionTerms.mutualizerAddress == _newMutualizer) revert SameMutualizerAddress();
        disputeResolutionTerms.mutualizerAddress = payable(_newMutualizer);

        emit OfferMutualizerUpdated(_offerId, offer.sellerId, _newMutualizer, _msgSender());
    }

    /**
     * @notice Gets the details about a given offer.
     *
     * @param _offerId - the id of the offer to retrieve
     * @return exists - the offer was found
     * @return offer - the offer details. See {BosonTypes.Offer}
     * @return offerDates - the offer dates details. See {BosonTypes.OfferDates}
     * @return offerDurations - the offer durations details. See {BosonTypes.OfferDurations}
     * @return disputeResolutionTerms - the details about the dispute resolution terms. See {BosonTypes.DisputeResolutionTerms}
     * @return offerFees - the offer fees details. See {BosonTypes.OfferFees}
     */
    function getOffer(
        uint256 _offerId
    )
        external
        view
        override
        returns (
            bool exists,
            Offer memory offer,
            OfferDates memory offerDates,
            OfferDurations memory offerDurations,
            DisputeResolutionTerms memory disputeResolutionTerms,
            OfferFees memory offerFees
        )
    {
        (exists, offer) = fetchOffer(_offerId);
        if (exists) {
            offerDates = fetchOfferDates(_offerId);
            offerDurations = fetchOfferDurations(_offerId);
            disputeResolutionTerms = fetchDisputeResolutionTerms(_offerId);
            offerFees = fetchOfferFees(_offerId);
        }
    }

    /**
     * @notice Gets the next offer id.
     *
     * @dev Does not increment the counter.
     *
     * @return nextOfferId - the next offer id
     */
    function getNextOfferId() external view override returns (uint256 nextOfferId) {
        nextOfferId = protocolCounters().nextOfferId;
    }

    /**
     * @notice Checks if offer is voided or not.
     *
     * @param _offerId - the id of the offer to check
     * @return exists - the offer was found
     * @return offerVoided - true if voided, false otherwise
     */
    function isOfferVoided(uint256 _offerId) external view override returns (bool exists, bool offerVoided) {
        Offer storage offer;
        (exists, offer) = fetchOffer(_offerId);
        offerVoided = offer.voided;
    }

    /**
     * @notice Gets the agent id for a given offer id.
     *
     * @param _offerId - the offer id
     * @return exists - whether the agent id exists
     * @return agentId - the agent id
     */
    function getAgentIdByOffer(uint256 _offerId) external view override returns (bool exists, uint256 agentId) {
        return fetchAgentIdByOffer(_offerId);
    }
}
