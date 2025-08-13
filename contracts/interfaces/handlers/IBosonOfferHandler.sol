// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { BosonTypes } from "../../domain/BosonTypes.sol";
import { BosonErrors } from "../../domain/BosonErrors.sol";
import { IBosonOfferEvents } from "../events/IBosonOfferEvents.sol";

/**
 * @title IBosonOfferHandler
 *
 * @notice Handles creation, voiding, and querying of offers within the protocol.
 *
 * The ERC-165 identifier for this interface is: 0x7ecaa4b3
 */
interface IBosonOfferHandler is BosonErrors, IBosonOfferEvents {
    /**
     * @notice Creates an offer.
     *
     * Emits an OfferCreated event if successful.
     *
     * Reverts if:
     * - The offers region of protocol is paused
     * - Caller is not an assistant or a buyer
     * - sellerId is not 0 when offer is created by the buyer
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
     * - Seller is not on dispute resolver's seller allow list if offer is created by the seller
     * - Dispute resolver does not accept fees in the exchange token
     * - Buyer cancel penalty is greater than price
     * - Collection does not exist if offer is created by the seller
     * - Collection id is different from 0 if offer is created by the buyer
     * - When agent id is non zero:
     *   - If Agent does not exist
     * - If the sum of agent fee amount and protocol fee amount is greater than the offer fee limit determined by the protocol
     * - If the sum of agent fee amount and protocol fee amount is greater than fee limit set by caller
     * If the seller is creating an offer and:
     *   - Royalty recipient is not on seller's allow list
     *   - Royalty percentage is less than the value decided by the admin
     *   - Total royalty percentage is more than max royalty percentage
     * If the buyer is creating an offer and royalties are set.
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _drParameters - the id of chosen dispute resolver (can be 0) and mutualizer address (0 for self-mutualization)
     * @param _agentId - the id of agent
     * @param _feeLimit - the maximum fee that seller is willing to pay per exchange (for static offers)
     */
    function createOffer(
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        BosonTypes.DRParameters calldata _drParameters,
        uint256 _agentId,
        uint256 _feeLimit
    ) external;

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
     *   - Royalty recipient is not on seller's allow list
     *   - Royalty percentage is less than the value decided by the admin
     *   - Total royalty percentage is more than max royalty percentage
     * - When agent ids are non zero:
     *   - If Agent does not exist
     *   - If the sum of agent fee amount and protocol fee amount is greater than the offer fee limit
     *
     * @param _offers - the array of fully populated Offer structs with offer id set to 0x0 and voided set to false
     * @param _offerDates - the array of fully populated offer dates structs
     * @param _offerDurations - the array of fully populated offer durations structs
     * @param _drParameters - the array of ids of chosen dispute resolvers (can be 0) and mutualizer address (0 for self-mutualization)
     * @param _agentIds - the array of ids of agents
     * @param _feeLimits - the array of maximum fees that seller is willing to pay per exchange (for static offers)
     */
    function createOfferBatch(
        BosonTypes.Offer[] calldata _offers,
        BosonTypes.OfferDates[] calldata _offerDates,
        BosonTypes.OfferDurations[] calldata _offerDurations,
        BosonTypes.DRParameters[] calldata _drParameters,
        uint256[] calldata _agentIds,
        uint256[] calldata _feeLimits
    ) external;

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
    function reserveRange(uint256 _offerId, uint256 _length, address _to) external;

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
     * - Caller is not authorized (for seller-created offers: not the seller assistant; for buyer-created offers: not the buyer who created it)
     * - Offer has already been voided
     *
     * @param _offerId - the id of the offer to void
     */
    function voidOffer(uint256 _offerId) external;

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
     * - Caller is not authorized (for seller-created offers: not the seller assistant; for buyer-created offers: not the buyer who created it)
     * - Offer has already been voided
     *
     * @param _offerIds - list of ids of offers to void
     */
    function voidOfferBatch(uint256[] calldata _offerIds) external;

    /**
     * @notice Voids a non-listed offer. (offers used in `createOfferAndCommit`)
     * It prevents the offer from being used in future exchanges even if it was already signed.
     *
     * Emits a NonListedOfferVoided event if successful.
     *
     * Reverts if:
     * - The offers region of protocol is paused
     * - Caller is not the assistant of the offer
     * - Offer has already been voided
     *
     * @param _fullOffer - the fully populated struct containing offer, offer dates, offer durations, dispute resolution parameters, condition, agent id and fee limit
     */
    function voidNonListedOffer(BosonTypes.FullOffer calldata _fullOffer) external;

    /**
     * @notice Voids multiple a non-listed offer. (offers used in `createOfferAndCommit`)
     * It prevents the offers from being used in future exchanges even if they were already signed.
     *
     * Emits NonListedOfferVoided events if successful.
     *
     * Reverts if:
     * - The number of elements in offers, offerDates, offerDurations, disputeResolverIds, agentIds and feeLimits do not match
     * - The offers region of protocol is paused
     * - Caller is not the authorized to void the offer
     * - Offer has already been voided
     *
     * @param _fullOffers - the list fully populated structs containing offer, offer dates, offer durations, dispute resolution parameters, condition, agent id and fee limit
     */
    function voidNonListedOfferBatch(BosonTypes.FullOffer[] calldata _fullOffers) external;

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
    function extendOffer(uint256 _offerId, uint256 _validUntilDate) external;

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
    function extendOfferBatch(uint256[] calldata _offerIds, uint256 _validUntilDate) external;

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
    function updateOfferRoyaltyRecipients(uint256 _offerId, BosonTypes.RoyaltyInfo calldata _royaltyInfo) external;

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
    ) external;

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
    function updateOfferMutualizer(uint256 _offerId, address _newMutualizer) external;

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
        returns (
            bool exists,
            BosonTypes.Offer memory offer,
            BosonTypes.OfferDates memory offerDates,
            BosonTypes.OfferDurations memory offerDurations,
            BosonTypes.DisputeResolutionTerms memory disputeResolutionTerms,
            BosonTypes.OfferFees memory offerFees
        );

    /**
     * @notice Gets the next offer id.
     *
     * @dev Does not increment the counter.
     *
     * @return nextOfferId - the next offer id
     */
    function getNextOfferId() external view returns (uint256 nextOfferId);

    /**
     * @notice Checks if offer is voided or not.
     *
     * @param _offerId - the id of the offer to check
     * @return exists - the offer was found
     * @return offerVoided - true if voided, false otherwise
     */
    function isOfferVoided(uint256 _offerId) external view returns (bool exists, bool offerVoided);

    /**
     * @notice Gets the agent id for a given offer id.
     *
     * @param _offerId - the offer id
     * @return exists - whether the agent id exists
     * @return agentId - the agent id
     */
    function getAgentIdByOffer(uint256 _offerId) external view returns (bool exists, uint256 agentId);
}
