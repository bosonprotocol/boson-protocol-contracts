// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { BosonTypes } from "../../domain/BosonTypes.sol";
import { BosonErrors } from "../../domain/BosonErrors.sol";
import { IBosonAccountEvents } from "../events/IBosonAccountEvents.sol";
import { IBosonGroupEvents } from "../events/IBosonGroupEvents.sol";
import { IBosonOfferEvents } from "../events/IBosonOfferEvents.sol";
import { IBosonTwinEvents } from "../events/IBosonTwinEvents.sol";
import { IBosonBundleEvents } from "../events/IBosonBundleEvents.sol";

/**
 * @title IBosonOrchestrationHandler
 *
 * @notice Combines creation of multiple entities (accounts, offers, groups, twins, bundles) in a single transaction
 *
 * The ERC-165 identifier for this interface is: 0x2ba5f075
 */
interface IBosonOrchestrationHandler is
    IBosonAccountEvents,
    IBosonGroupEvents,
    IBosonOfferEvents,
    IBosonTwinEvents,
    IBosonBundleEvents,
    BosonErrors
{
    /**
     * @notice Raises a dispute and immediately escalates it.
     *
     * Caller must send (or for ERC20, approve the transfer of) the
     * buyer escalation deposit percentage of the offer price, which
     * will be added to the pot for resolution.
     *
     * Emits a DisputeRaised and a DisputeEscalated event if successful.
     *
     * Reverts if:
     * - The disputes region of protocol is paused
     * - The orchestration region of protocol is paused
     * - Caller is not the buyer for the given exchange id
     * - Exchange does not exist
     * - Exchange is not in a Redeemed state
     * - Dispute period has elapsed already
     * - Dispute resolver is not specified (absolute zero offer)
     * - Offer price is in native token and caller does not send enough
     * - Offer price is in some ERC20 token and caller also sends native currency
     * - If contract at token address does not support ERC20 function transferFrom
     * - If calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - Received ERC20 token amount differs from the expected value
     *
     * @param _exchangeId - the id of the associated exchange
     */
    function raiseAndEscalateDispute(uint256 _exchangeId) external payable;

    /**
     * @notice Creates a seller (with optional auth token) and an offer in a single transaction.
     *
     * Limitations:
     * 1. If chosen dispute resolver has seller allow list, this method will not succeed, since seller that will be created
     * cannot be on that list. To avoid the failure you can
     * - Choose a dispute resolver without seller allow list
     * - Make an absolute zero offer without any dispute resolver specified
     * - First create a seller {AccountHandler.createSeller}, make sure that dispute resolver adds seller to its allow list
     *   and then continue with the offer creation
     * 2. Only the default royalty recipient can be used. Other royalty recipients can be added to seller later and next offers can use them.
     *
     * Emits a SellerCreated and an OfferCreated event if successful.
     *
     * Reverts if:
     * - The sellers region of protocol is paused
     * - The offers region of protocol is paused
     * - The orchestration region of protocol is paused
     * - Caller is not the supplied admin or does not own supplied auth token
     * - Caller is not the supplied assistant
     * - Supplied clerk is not a zero address
     * - Admin address is zero address and AuthTokenType == None
     * - AuthTokenType is not unique to this seller
     * - Seller salt is not unique
     * - Clone creation fails
     * - In seller struct:
     *   - Address values are zero address
     *   - Addresses are not unique to this seller
     *   - Seller is not active (if active == false)
     * - In offer struct:
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Both voucher expiration date and voucher expiration period are defined
     *   - Neither voucher expiration date nor voucher expiration period are defined
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
     *   - Royalty recipient is not on seller's allow list
     *   - Royalty percentage is less than the value decided by the admin
     *   - Total royalty percentage is more than max royalty percentage
     *   - Collection does not exist
     * - When agent id is non zero:
     *   - If Agent does not exist
     * - If the sum of agent fee amount and protocol fee amount is greater than the offer fee limit determined by the protocol
     * - If the sum of agent fee amount and protocol fee amount is greater than fee limit set by seller
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _seller - the fully populated seller struct
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _drParameters - the id of chosen dispute resolver (can be 0) and mutualizer address (0 for self-mutualization)
     * @param _authToken - optional AuthToken struct that specifies an AuthToken type and tokenId that the seller can use to do admin functions
     * @param _voucherInitValues - the fully populated BosonTypes.VoucherInitValues struct
     * @param _agentId - the id of agent
     * @param _feeLimit - the maximum fee that seller is willing to pay per exchange (for static offers)
     */
    function createSellerAndOffer(
        BosonTypes.Seller calldata _seller,
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        BosonTypes.DRParameters calldata _drParameters,
        BosonTypes.AuthToken calldata _authToken,
        BosonTypes.VoucherInitValues calldata _voucherInitValues,
        uint256 _agentId,
        uint256 _feeLimit
    ) external;

    /**
     * @notice Creates a seller (with optional auth token), an offer and reserve range for preminting in a single transaction.
     *
     * Limitation of the method:
     * If chosen dispute resolver has seller allow list, this method will not succeed, since seller that will be created
     * cannot be on that list. To avoid the failure you can
     * - Choose a dispute resolver without seller allow list
     * - Make an absolute zero offer without any dispute resolver specified
     * - First create a seller {AccountHandler.createSeller}, make sure that dispute resolver adds seller to its allow list
     *   and then continue with the offer creation
     *
     * Emits a SellerCreated, an OfferCreated and a RangeReserved event if successful.
     *
     * Reverts if:
     * - The sellers region of protocol is paused
     * - The offers region of protocol is paused
     * - The orchestration region of protocol is paused
     * - The exchanges region of protocol is paused
     * - Caller is not the supplied assistant
     * - Caller is not the supplied admin or does not own supplied auth token
     * - Supplied clerk is not a zero address
     * - Admin address is zero address and AuthTokenType == None
     * - AuthTokenType is not unique to this seller
     * - Reserved range length is zero
     * - Reserved range length is greater than quantity available
     * - Reserved range length is greater than maximum allowed range length
     * - Seller salt is not unique
     * - Clone creation fails
     * - In seller struct:
     *   - Address values are zero address
     *   - Addresses are not unique to this seller
     *   - Seller is not active (if active == false)
     * - In offer struct:
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Both voucher expiration date and voucher expiration period are defined
     *   - Neither voucher expiration date nor voucher expiration period are defined
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
     *   - Royalty recipient is not on seller's allow list
     *   - Royalty percentage is less than the value decided by the admin
     *   - Total royalty percentage is more than max royalty percentage
     *   - Collection does not exist
     * - When agent id is non zero:
     *   - If Agent does not exist
     * - If the sum of agent fee amount and protocol fee amount is greater than the offer fee limit determined by the protocol
     * - If the sum of agent fee amount and protocol fee amount is greater than fee limit set by seller
     * - _to is not the BosonVoucher contract address or the BosonVoucher contract owner
     *
     * @dev No reentrancy guard here since already implemented by called functions. If added here, they would clash.
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _seller - the fully populated seller struct
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _drParameters - the id of chosen dispute resolver (can be 0) and mutualizer address (0 for self-mutualization)
     * @param _premintParameters - struct containing the amount of tokens to be reserved for preminting and the address to send the pre-minted vouchers to (contract address or contract owner)
     * @param _authToken - optional AuthToken struct that specifies an AuthToken type and tokenId that the seller can use to do admin functions
     * @param _voucherInitValues - the fully populated BosonTypes.VoucherInitValues struct
     * @param _agentId - the id of agent
     * @param _feeLimit - the maximum fee that seller is willing to pay per exchange (for static offers)
     */
    function createSellerAndPremintedOffer(
        BosonTypes.Seller memory _seller,
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        BosonTypes.DRParameters calldata _drParameters,
        BosonTypes.PremintParameters calldata _premintParameters,
        BosonTypes.AuthToken calldata _authToken,
        BosonTypes.VoucherInitValues calldata _voucherInitValues,
        uint256 _agentId,
        uint256 _feeLimit
    ) external;

    /**
     * @notice Takes an offer and a condition, creates an offer, then creates a group with that offer and the given condition.
     *
     * Emits an OfferCreated and a GroupCreated event if successful.
     *
     * Reverts if:
     * - The offers region of protocol is paused
     * - The groups region of protocol is paused
     * - The orchestration region of protocol is paused
     * - In offer struct:
     *   - Caller is not an assistant
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Both voucher expiration date and voucher expiration period are defined
     *   - Neither voucher expiration date nor voucher expiration period are defined
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
     *   - Royalty recipient is not on seller's allow list
     *   - Royalty percentage is less than the value decided by the admin
     *   - Total royalty percentage is more than max royalty percentage
     *   - Collection does not exist
     * - Condition includes invalid combination of parameters
     * - When agent id is non zero:
     *   - If Agent does not exist
     * - If the sum of agent fee amount and protocol fee amount is greater than the offer fee limit determined by the protocol
     * - If the sum of agent fee amount and protocol fee amount is greater than fee limit set by seller
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _drParameters - the id of chosen dispute resolver (can be 0) and mutualizer address (0 for self-mutualization)
     * @param _condition - the fully populated condition struct
     * @param _agentId - the id of agent
     * @param _feeLimit - the maximum fee that seller is willing to pay per exchange (for static offers)
     */
    function createOfferWithCondition(
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        BosonTypes.DRParameters calldata _drParameters,
        BosonTypes.Condition memory _condition,
        uint256 _agentId,
        uint256 _feeLimit
    ) external;

    /**
     * @notice Takes an offer, range for preminting and a condition, creates an offer, then creates a group with that offer and the given condition and then reservers range for preminting.
     *
     * Emits an OfferCreated, a GroupCreated and a RangeReserved event if successful.
     *
     * Reverts if:
     * - The offers region of protocol is paused
     * - The groups region of protocol is paused
     * - The exchanges region of protocol is paused
     * - The orchestration region of protocol is paused
     * - Reserved range length is zero
     * - Reserved range length is greater than quantity available
     * - Reserved range length is greater than maximum allowed range length
     * - In offer struct:
     *   - Caller is not an assistant
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Both voucher expiration date and voucher expiration period are defined
     *   - Neither voucher expiration date nor voucher expiration period are defined
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
     *   - Royalty recipient is not on seller's allow list
     *   - Royalty percentage is less than the value decided by the admin
     *   - Total royalty percentage is more than max royalty percentage
     *   - Collection does not exist
     * - Condition includes invalid combination of parameters
     * - When agent id is non zero:
     *   - If Agent does not exist
     * - If the sum of agent fee amount and protocol fee amount is greater than the offer fee limit determined by the protocol
     * - If the sum of agent fee amount and protocol fee amount is greater than fee limit set by seller
     * - _to is not the BosonVoucher contract address or the BosonVoucher contract owner
     *
     * @dev No reentrancy guard here since already implemented by called functions. If added here, they would clash.
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _drParameters - the id of chosen dispute resolver (can be 0) and mutualizer address (0 for self-mutualization)
     * @param _premintParameters - struct containing the amount of tokens to be reserved for preminting and the address to send the pre-minted vouchers to (contract address or contract owner)
     * @param _condition - the fully populated condition struct
     * @param _agentId - the id of agent
     * @param _feeLimit - the maximum fee that seller is willing to pay per exchange (for static offers)
     */
    function createPremintedOfferWithCondition(
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        BosonTypes.DRParameters calldata _drParameters,
        BosonTypes.PremintParameters calldata _premintParameters,
        BosonTypes.Condition calldata _condition,
        uint256 _agentId,
        uint256 _feeLimit
    ) external;

    /**
     * @notice Takes an offer and group ID, creates an offer and adds it to the existing group with given id.
     *
     * Emits an OfferCreated and a GroupUpdated event if successful.
     *
     * Reverts if:
     * - The offers region of protocol is paused
     * - The groups region of protocol is paused
     * - The orchestration region of protocol is paused
     * - In offer struct:
     *   - Caller is not an assistant
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Both voucher expiration date and voucher expiration period are defined
     *   - Neither voucher expiration date nor voucher expiration period are defined
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
     *   - Royalty recipient is not on seller's allow list
     *   - Royalty percentage is less than the value decided by the admin
     *   - Total royalty percentage is more than max royalty percentage
     *   - Collection does not exist
     * - When adding to the group if:
     *   - Group does not exists
     *   - Caller is not the assistant of the group
     * - When agent id is non zero:
     *   - If Agent does not exist
     * - If the sum of agent fee amount and protocol fee amount is greater than the offer fee limit determined by the protocol
     * - If the sum of agent fee amount and protocol fee amount is greater than fee limit set by seller
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _drParameters - the id of chosen dispute resolver (can be 0) and mutualizer address (0 for self-mutualization)
     * @param _groupId - id of the group, to which offer will be added
     * @param _agentId - the id of agent
     * @param _feeLimit - the maximum fee that seller is willing to pay per exchange (for static offers)
     */
    function createOfferAddToGroup(
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        BosonTypes.DRParameters calldata _drParameters,
        uint256 _groupId,
        uint256 _agentId,
        uint256 _feeLimit
    ) external;

    /**
     * @notice Takes an offer, a range for preminting and group ID, creates an offer and adds it to the existing group with given id and reserves the range for preminting.
     *
     * Emits an OfferCreated, a GroupUpdated and a RangeReserved event if successful.
     *
     * Reverts if:
     * - The offers region of protocol is paused
     * - The groups region of protocol is paused
     * - The exchanges region of protocol is paused
     * - The orchestration region of protocol is paused
     * - Reserved range length is zero
     * - Reserved range length is greater than quantity available
     * - Reserved range length is greater than maximum allowed range length
     * - In offer struct:
     *   - Caller is not an assistant
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Both voucher expiration date and voucher expiration period are defined
     *   - Neither voucher expiration date nor voucher expiration period are defined
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
     *   - Royalty recipient is not on seller's allow list
     *   - Royalty percentage is less than the value decided by the admin
     *   - Total royalty percentage is more than max royalty percentage
     *   - Collection does not exist
     * - When adding to the group if:
     *   - Group does not exists
     *   - Caller is not the assistant of the group
     * - When agent id is non zero:
     *   - If Agent does not exist
     * - If the sum of agent fee amount and protocol fee amount is greater than the offer fee limit determined by the protocol
     * - If the sum of agent fee amount and protocol fee amount is greater than fee limit set by seller
     * - _to is not the BosonVoucher contract address or the BosonVoucher contract owner
     *
     * @dev No reentrancy guard here since already implemented by called functions. If added here, they would clash.
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _drParameters - the id of chosen dispute resolver (can be 0) and mutualizer address (0 for self-mutualization)
     * @param _premintParameters - struct containing the amount of tokens to be reserved for preminting and the address to send the pre-minted vouchers to (contract address or contract owner)
     * @param _groupId - id of the group, to which offer will be added
     * @param _agentId - the id of agent
     * @param _feeLimit - the maximum fee that seller is willing to pay per exchange (for static offers)
     */
    function createPremintedOfferAddToGroup(
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        BosonTypes.DRParameters calldata _drParameters,
        BosonTypes.PremintParameters calldata _premintParameters,
        uint256 _groupId,
        uint256 _agentId,
        uint256 _feeLimit
    ) external;

    /**
     * @notice Takes an offer and a twin, creates an offer, creates a twin, then creates a bundle with that offer and the given twin.
     *
     * Emits an OfferCreated, a TwinCreated and a BundleCreated event if successful.
     *
     * Reverts if:
     * - The offers region of protocol is paused
     * - The twins region of protocol is paused
     * - The bundles region of protocol is paused
     * - The orchestration region of protocol is paused
     * - In offer struct:
     *   - Caller is not an assistant
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Both voucher expiration date and voucher expiration period are defined
     *   - Neither voucher expiration date nor voucher expiration period are defined
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
     *   - Royalty recipient is not on seller's allow list
     *   - Royalty percentage is less than the value decided by the admin
     *   - Total royalty percentage is more than max royalty percentage
     *   - Collection does not exist
     * - When creating twin if
     *   - Not approved to transfer the seller's token
     *   - SupplyAvailable is zero
     *   - Twin is NonFungibleToken and amount was set
     *   - Twin is NonFungibleToken and end of range would overflow
     *   - Twin is NonFungibleToken with unlimited supply and starting token id is too high
     *   - Twin is NonFungibleToken and range is already being used in another twin of the seller
     *   - Twin is FungibleToken or MultiToken and amount was not set
     * - When agent id is non zero:
     *   - If Agent does not exist
     * - If the sum of agent fee amount and protocol fee amount is greater than the offer fee limit determined by the protocol
     * - If the sum of agent fee amount and protocol fee amount is greater than fee limit set by seller
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _drParameters - the id of chosen dispute resolver (can be 0) and mutualizer address (0 for self-mutualization)
     * @param _twin - the fully populated twin struct
     * @param _agentId - the id of agent
     * @param _feeLimit - the maximum fee that seller is willing to pay per exchange (for static offers)
     */
    function createOfferAndTwinWithBundle(
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        BosonTypes.DRParameters calldata _drParameters,
        BosonTypes.Twin memory _twin,
        uint256 _agentId,
        uint256 _feeLimit
    ) external;

    /**
     * @notice Takes an offer, a range for preminting and a twin, creates an offer, creates a twin, then creates a bundle with that offer and the given twin and reserves the range for preminting.
     *
     * Emits an OfferCreated, a TwinCreated and a BundleCreated and a RangeReserved event if successful.
     *
     * Reverts if:
     * - The offers region of protocol is paused
     * - The twins region of protocol is paused
     * - The bundles region of protocol is paused
     * - The exchanges region of protocol is paused
     * - The orchestration region of protocol is paused
     * - Reserved range length is zero
     * - Reserved range length is greater than quantity available
     * - Reserved range length is greater than maximum allowed range length
     * - In offer struct:
     *   - Caller is not an assistant
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Both voucher expiration date and voucher expiration period are defined
     *   - Neither voucher expiration date nor voucher expiration period are defined
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
     *   - Royalty recipient is not on seller's allow list
     *   - Royalty percentage is less than the value decided by the admin
     *   - Total royalty percentage is more than max royalty percentage
     *   - Collection does not exist
     * - When creating twin if
     *   - Not approved to transfer the seller's token
     *   - SupplyAvailable is zero
     *   - Twin is NonFungibleToken and amount was set
     *   - Twin is NonFungibleToken and end of range would overflow
     *   - Twin is NonFungibleToken with unlimited supply and starting token id is too high
     *   - Twin is NonFungibleToken and range is already being used in another twin of the seller
     *   - Twin is FungibleToken or MultiToken and amount was not set
     * - When agent id is non zero:
     *   - If Agent does not exist
     * - If the sum of agent fee amount and protocol fee amount is greater than the offer fee limit determined by the protocol
     * - If the sum of agent fee amount and protocol fee amount is greater than fee limit set by seller
     * - _to is not the BosonVoucher contract address or the BosonVoucher contract owner
     *
     * @dev No reentrancy guard here since already implemented by called functions. If added here, they would clash.
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _drParameters - the id of chosen dispute resolver (can be 0) and mutualizer address (0 for self-mutualization)
     * @param _premintParameters - struct containing the amount of tokens to be reserved for preminting and the address to send the pre-minted vouchers to (contract address or contract owner)
     * @param _twin - the fully populated twin struct
     * @param _agentId - the id of agent
     * @param _feeLimit - the maximum fee that seller is willing to pay per exchange (for static offers)
     */
    function createPremintedOfferAndTwinWithBundle(
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        BosonTypes.DRParameters calldata _drParameters,
        BosonTypes.PremintParameters calldata _premintParameters,
        BosonTypes.Twin memory _twin,
        uint256 _agentId,
        uint256 _feeLimit
    ) external;

    /**
     * @notice Takes an offer, a condition and a twin, creates an offer, then creates a group with that offer and the given condition.
     * It then creates a twin, then creates a bundle with that offer and the given twin.
     *
     * Emits an OfferCreated, a GroupCreated, a TwinCreated and a BundleCreated event if successful.
     *
     * Reverts if:
     * - The offers region of protocol is paused
     * - The groups region of protocol is paused
     * - The twins region of protocol is paused
     * - The bundles region of protocol is paused
     * - The orchestration region of protocol is paused
     * - In offer struct:
     *   - Caller is not an assistant
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Both voucher expiration date and voucher expiration period are defined
     *   - Neither voucher expiration date nor voucher expiration period are defined
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
     *   - Royalty recipient is not on seller's allow list
     *   - Royalty percentage is less than the value decided by the admin
     *   - Total royalty percentage is more than max royalty percentage
     *   - Collection does not exist
     * - Condition includes invalid combination of parameters
     * - When creating twin if
     *   - Not approved to transfer the seller's token
     *   - SupplyAvailable is zero
     *   - Twin is NonFungibleToken and amount was set
     *   - Twin is NonFungibleToken and end of range would overflow
     *   - Twin is NonFungibleToken with unlimited supply and starting token id is too high
     *   - Twin is NonFungibleToken and range is already being used in another twin of the seller
     *   - Twin is FungibleToken or MultiToken and amount was not set
     * - When agent id is non zero:
     *   - If Agent does not exist
     * - If the sum of agent fee amount and protocol fee amount is greater than the offer fee limit determined by the protocol
     * - If the sum of agent fee amount and protocol fee amount is greater than fee limit set by seller
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _drParameters - the id of chosen dispute resolver (can be 0) and mutualizer address (0 for self-mutualization)
     * @param _condition - the fully populated condition struct
     * @param _twin - the fully populated twin struct
     * @param _agentId - the id of agent
     * @param _feeLimit - the maximum fee that seller is willing to pay per exchange (for static offers)
     */
    function createOfferWithConditionAndTwinAndBundle(
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        BosonTypes.DRParameters calldata _drParameters,
        BosonTypes.Condition memory _condition,
        BosonTypes.Twin memory _twin,
        uint256 _agentId,
        uint256 _feeLimit
    ) external;

    /**
     * @notice Takes an offer, a range for preminting, a condition and a twin, creates an offer, then creates a group with that offer and the given condition.
     * It then creates a twin, then creates a bundle with that offer and the given twin and reserves the range for preminting.
     *
     * Emits an OfferCreated, a GroupCreated, a TwinCreated, a BundleCreated and a RangeReserved event if successful.
     *
     * Reverts if:
     * - The offers region of protocol is paused
     * - The groups region of protocol is paused
     * - The twins region of protocol is paused
     * - The bundles region of protocol is paused
     * - The exchanges region of protocol is paused
     * - The orchestration region of protocol is paused
     * - Reserved range length is zero
     * - Reserved range length is greater than quantity available
     * - Reserved range length is greater than maximum allowed range length
     * - In offer struct:
     *   - Caller is not an assistant
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Both voucher expiration date and voucher expiration period are defined
     *   - Neither voucher expiration date nor voucher expiration period are defined
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
     *   - Royalty recipient is not on seller's allow list
     *   - Royalty percentage is less than the value decided by the admin
     *   - Total royalty percentage is more than max royalty percentage
     *   - Collection does not exist
     * - Condition includes invalid combination of parameters
     * - When creating twin if
     *   - Not approved to transfer the seller's token
     *   - SupplyAvailable is zero
     *   - Twin is NonFungibleToken and amount was set
     *   - Twin is NonFungibleToken and end of range would overflow
     *   - Twin is NonFungibleToken with unlimited supply and starting token id is too high
     *   - Twin is NonFungibleToken and range is already being used in another twin of the seller
     *   - Twin is FungibleToken or MultiToken and amount was not set
     * - When agent id is non zero:
     *   - If Agent does not exist
     * - If the sum of agent fee amount and protocol fee amount is greater than the offer fee limit determined by the protocol
     * - If the sum of agent fee amount and protocol fee amount is greater than fee limit set by seller
     * - _to is not the BosonVoucher contract address or the BosonVoucher contract owner
     *
     * @dev No reentrancy guard here since already implemented by called functions. If added here, they would clash.
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _drParameters - the id of chosen dispute resolver (can be 0) and mutualizer address (0 for self-mutualization)
     * @param _premintParameters - struct containing the amount of tokens to be reserved for preminting and the address to send the pre-minted vouchers to (contract address or contract owner)
     * @param _condition - the fully populated condition struct
     * @param _twin - the fully populated twin struct
     * @param _agentId - the id of agent
     * @param _feeLimit - the maximum fee that seller is willing to pay per exchange (for static offers)
     */
    function createPremintedOfferWithConditionAndTwinAndBundle(
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        BosonTypes.DRParameters calldata _drParameters,
        BosonTypes.PremintParameters calldata _premintParameters,
        BosonTypes.Condition calldata _condition,
        BosonTypes.Twin memory _twin,
        uint256 _agentId,
        uint256 _feeLimit
    ) external;

    /**
     * @notice Takes a seller, an offer, a condition and an optional auth token. Creates a seller, creates an offer,
     * then creates a group with that offer and the given condition.
     *
     * Limitation of the method:
     * If chosen dispute resolver has seller allow list, this method will not succeed, since seller that will be created
     * cannot be on that list. To avoid the failure you can
     * - Choose a dispute resolver without seller allow list
     * - Make an absolute zero offer without any dispute resolver specified
     * - First create a seller {AccountHandler.createSeller}, make sure that dispute resolver adds seller to its allow list
     *   and then continue with the offer creation
     *
     * Emits a SellerCreated, an OfferCreated and a GroupCreated event if successful.
     *
     * Reverts if:
     * - The sellers region of protocol is paused
     * - The offers region of protocol is paused
     * - The groups region of protocol is paused
     * - The orchestration region of protocol is paused
     * - Caller is not the supplied admin or does not own supplied auth token
     * - Caller is not the supplied assistant
     * - Supplied clerk is not a zero address
     * - Admin address is zero address and AuthTokenType == None
     * - AuthTokenType is not unique to this seller
     * - Seller salt is not unique
     * - Clone creation fails
     * - In seller struct:
     *   - Address values are zero address
     *   - Addresses are not unique to this seller
     *   - Seller is not active (if active == false)
     * - In offer struct:
     *   - Caller is not an assistant
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Both voucher expiration date and voucher expiration period are defined
     *   - Neither voucher expiration date nor voucher expiration period are defined
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
     *   - Royalty recipient is not on seller's allow list
     *   - Royalty percentage is less than the value decided by the admin
     *   - Total royalty percentage is more than max royalty percentage
     *   - Collection does not exist
     * - Condition includes invalid combination of parameters
     * - When agent id is non zero:
     *   - If Agent does not exist
     * - If the sum of agent fee amount and protocol fee amount is greater than the offer fee limit determined by the protocol
     * - If the sum of agent fee amount and protocol fee amount is greater than fee limit set by seller
     *
     * @param _seller - the fully populated seller struct
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _drParameters - the id of chosen dispute resolver (can be 0) and mutualizer address (0 for self-mutualization)
     * @param _condition - the fully populated condition struct
     * @param _authToken - optional AuthToken struct that specifies an AuthToken type and tokenId that the seller can use to do admin functions
     * @param _voucherInitValues - the fully populated BosonTypes.VoucherInitValues struct
     * @param _agentId - the id of agent
     * @param _feeLimit - the maximum fee that seller is willing to pay per exchange (for static offers)
     */
    function createSellerAndOfferWithCondition(
        BosonTypes.Seller memory _seller,
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        BosonTypes.DRParameters calldata _drParameters,
        BosonTypes.Condition memory _condition,
        BosonTypes.AuthToken calldata _authToken,
        BosonTypes.VoucherInitValues calldata _voucherInitValues,
        uint256 _agentId,
        uint256 _feeLimit
    ) external;

    /**
     * @notice Takes a seller, an offer, a range for preminting, a condition and an optional auth token. Creates a seller, creates an offer,
     * then creates a group with that offer and the given condition and reserves the range for preminting.
     *
     * Limitation of the method:
     * If chosen dispute resolver has seller allow list, this method will not succeed, since seller that will be created
     * cannot be on that list. To avoid the failure you can
     * - Choose a dispute resolver without seller allow list
     * - Make an absolute zero offer without any dispute resolver specified
     * - First create a seller {AccountHandler.createSeller}, make sure that dispute resolver adds seller to its allow list
     *   and then continue with the offer creation
     *
     * Emits a SellerCreated, an OfferCreated, a GroupCreated and a RangeReserved event if successful.
     *
     * Reverts if:
     * - The sellers region of protocol is paused
     * - The offers region of protocol is paused
     * - The groups region of protocol is paused
     * - The exchanges region of protocol is paused
     * - The orchestration region of protocol is paused
     * - Caller is not the supplied assistant
     * - Caller is not the supplied admin or does not own supplied auth token
     * - Supplied clerk is not a zero address
     * - Admin address is zero address and AuthTokenType == None
     * - AuthTokenType is not unique to this seller
     * - Reserved range length is zero
     * - Reserved range length is greater than quantity available
     * - Reserved range length is greater than maximum allowed range length
     * - Seller salt is not unique
     * - Clone creation fails
     * - In seller struct:
     *   - Address values are zero address
     *   - Addresses are not unique to this seller
     *   - Seller is not active (if active == false)
     * - In offer struct:
     *   - Caller is not an assistant
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Both voucher expiration date and voucher expiration period are defined
     *   - Neither voucher expiration date nor voucher expiration period are defined
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
     *   - Royalty recipient is not on seller's allow list
     *   - Royalty percentage is less than the value decided by the admin
     *   - Total royalty percentage is more than max royalty percentage
     *   - Collection does not exist
     * - Condition includes invalid combination of parameters
     * - When agent id is non zero:
     *   - If Agent does not exist
     * - If the sum of agent fee amount and protocol fee amount is greater than the offer fee limit determined by the protocol
     * - If the sum of agent fee amount and protocol fee amount is greater than fee limit set by seller
     * - _to is not the BosonVoucher contract address or the BosonVoucher contract owner
     *
     * @dev No reentrancy guard here since already implemented by called functions. If added here, they would clash.
     *
     * @param _seller - the fully populated seller struct
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _drParameters - the id of chosen dispute resolver (can be 0) and mutualizer address (0 for self-mutualization)
     * @param _premintParameters - struct containing the amount of tokens to be reserved for preminting and the address to send the pre-minted vouchers to (contract address or contract owner)
     * @param _condition - the fully populated condition struct
     * @param _authToken - optional AuthToken struct that specifies an AuthToken type and tokenId that the seller can use to do admin functions
     * @param _voucherInitValues - the fully populated BosonTypes.VoucherInitValues struct
     * @param _agentId - the id of agent
     * @param _feeLimit - the maximum fee that seller is willing to pay per exchange (for static offers)
     */
    function createSellerAndPremintedOfferWithCondition(
        BosonTypes.Seller memory _seller,
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        BosonTypes.DRParameters calldata _drParameters,
        BosonTypes.PremintParameters calldata _premintParameters,
        BosonTypes.Condition calldata _condition,
        BosonTypes.AuthToken calldata _authToken,
        BosonTypes.VoucherInitValues calldata _voucherInitValues,
        uint256 _agentId,
        uint256 _feeLimit
    ) external;

    /**
     * @notice Takes a seller, an offer, a twin, and an optional auth token. Creates a seller, creates an offer, creates a twin,
     * then creates a bundle with that offer and the given twin.
     *
     * Limitation of the method:
     * If chosen dispute resolver has seller allow list, this method will not succeed, since seller that will be created
     * cannot be on that list. To avoid the failure you can
     * - Choose a dispute resolver without seller allow list
     * - Make an absolute zero offer without any dispute resolver specified
     * - First create a seller {AccountHandler.createSeller}, make sure that dispute resolver adds seller to its allow list
     *   and then continue with the offer creation
     *
     * Emits a SellerCreated, an OfferCreated, a TwinCreated and a BundleCreated event if successful.
     *
     * Reverts if:
     * - The sellers region of protocol is paused
     * - The offers region of protocol is paused
     * - The twins region of protocol is paused
     * - The bundles region of protocol is paused
     * - The orchestration region of protocol is paused
     * - Caller is not the supplied admin or does not own supplied auth token
     * - Caller is not the supplied assistant
     * - Supplied clerk is not a zero address
     * - Admin address is zero address and AuthTokenType == None
     * - AuthTokenType is not unique to this seller
     * - Seller salt is not unique
     * - Clone creation fails
     * - In seller struct:
     *   - Address values are zero address
     *   - Addresses are not unique to this seller
     *   - Seller is not active (if active == false)
     * - In offer struct:
     *   - Caller is not an assistant
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Both voucher expiration date and voucher expiration period are defined
     *   - Neither voucher expiration date nor voucher expiration period are defined
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
     *   - Royalty recipient is not on seller's allow list
     *   - Royalty percentage is less than the value decided by the admin
     *   - Total royalty percentage is more than max royalty percentage
     *   - Collection does not exist
     * - When creating twin if
     *   - Not approved to transfer the seller's token
     *   - SupplyAvailable is zero
     *   - Twin is NonFungibleToken and amount was set
     *   - Twin is NonFungibleToken and end of range would overflow
     *   - Twin is NonFungibleToken with unlimited supply and starting token id is too high
     *   - Twin is NonFungibleToken and range is already being used in another twin of the seller
     *   - Twin is FungibleToken or MultiToken and amount was not set
     * - When agent id is non zero:
     *   - If Agent does not exist
     * - If the sum of agent fee amount and protocol fee amount is greater than the offer fee limit determined by the protocol
     * - If the sum of agent fee amount and protocol fee amount is greater than fee limit set by seller
     *
     * @param _seller - the fully populated seller struct
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _drParameters - the id of chosen dispute resolver (can be 0) and mutualizer address (0 for self-mutualization)
     * @param _twin - the fully populated twin struct
     * @param _authToken - optional AuthToken struct that specifies an AuthToken type and tokenId that the seller can use to do admin functions
     * @param _voucherInitValues - the fully populated BosonTypes.VoucherInitValues struct
     * @param _agentId - the id of agent
     * @param _feeLimit - the maximum fee that seller is willing to pay per exchange (for static offers)
     */
    function createSellerAndOfferAndTwinWithBundle(
        BosonTypes.Seller memory _seller,
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        BosonTypes.DRParameters calldata _drParameters,
        BosonTypes.Twin memory _twin,
        BosonTypes.AuthToken calldata _authToken,
        BosonTypes.VoucherInitValues calldata _voucherInitValues,
        uint256 _agentId,
        uint256 _feeLimit
    ) external;

    /**
     * @notice Takes a seller, an offer, a range for preminting, a twin, and an optional auth token. Creates a seller, creates an offer, creates a twin,
     * then creates a bundle with that offer and the given twin and reserves the range for preminting.
     *
     * Limitation of the method:
     * If chosen dispute resolver has seller allow list, this method will not succeed, since seller that will be created
     * cannot be on that list. To avoid the failure you can
     * - Choose a dispute resolver without seller allow list
     * - Make an absolute zero offer without any dispute resolver specified
     * - First create a seller {AccountHandler.createSeller}, make sure that dispute resolver adds seller to its allow list
     *   and then continue with the offer creation
     *
     * Emits a SellerCreated, an OfferCreated, a TwinCreated, a BundleCreated and a RangeReserved event if successful.
     *
     * Reverts if:
     * - The sellers region of protocol is paused
     * - The offers region of protocol is paused
     * - The twins region of protocol is paused
     * - The bundles region of protocol is paused
     * - The exchanges region of protocol is paused
     * - The orchestration region of protocol is paused
     * - Caller is not the supplied assistant
     * - Caller is not the supplied admin or does not own supplied auth token
     * - Supplied clerk is not a zero address
     * - Admin address is zero address and AuthTokenType == None
     * - AuthTokenType is not unique to this seller
     * - Reserved range length is zero
     * - Reserved range length is greater than quantity available
     * - Reserved range length is greater than maximum allowed range length
     * - Seller salt is not unique
     * - Clone creation fails
     * - In seller struct:
     *   - Address values are zero address
     *   - Addresses are not unique to this seller
     *   - Seller is not active (if active == false)
     * - In offer struct:
     *   - Caller is not an assistant
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Both voucher expiration date and voucher expiration period are defined
     *   - Neither voucher expiration date nor voucher expiration period are defined
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
     *   - Royalty recipient is not on seller's allow list
     *   - Royalty percentage is less than the value decided by the admin
     *   - Total royalty percentage is more than max royalty percentage
     *   - Collection does not exist
     * - When creating twin if
     *   - Not approved to transfer the seller's token
     *   - SupplyAvailable is zero
     *   - Twin is NonFungibleToken and amount was set
     *   - Twin is NonFungibleToken and end of range would overflow
     *   - Twin is NonFungibleToken with unlimited supply and starting token id is too high
     *   - Twin is NonFungibleToken and range is already being used in another twin of the seller
     *   - Twin is FungibleToken or MultiToken and amount was not set
     * - When agent id is non zero:
     *   - If Agent does not exist
     * - If the sum of agent fee amount and protocol fee amount is greater than the offer fee limit determined by the protocol
     * - If the sum of agent fee amount and protocol fee amount is greater than fee limit set by seller
     * - _to is not the BosonVoucher contract address or the BosonVoucher contract owner
     *
     * @dev No reentrancy guard here since already implemented by called functions. If added here, they would clash.
     *
     * @param _seller - the fully populated seller struct
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _drParameters - the id of chosen dispute resolver (can be 0) and mutualizer address (0 for self-mutualization)
     * @param _premintParameters - struct containing the amount of tokens to be reserved for preminting and the address to send the pre-minted vouchers to (contract address or contract owner)
     * @param _twin - the fully populated twin struct
     * @param _authToken - optional AuthToken struct that specifies an AuthToken type and tokenId that the seller can use to do admin functions
     * @param _voucherInitValues - the fully populated BosonTypes.VoucherInitValues struct
     * @param _agentId - the id of agent
     * @param _feeLimit - the maximum fee that seller is willing to pay per exchange (for static offers)
     */
    function createSellerAndPremintedOfferAndTwinWithBundle(
        BosonTypes.Seller memory _seller,
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        BosonTypes.DRParameters calldata _drParameters,
        BosonTypes.PremintParameters calldata _premintParameters,
        BosonTypes.Twin memory _twin,
        BosonTypes.AuthToken calldata _authToken,
        BosonTypes.VoucherInitValues calldata _voucherInitValues,
        uint256 _agentId,
        uint256 _feeLimit
    ) external;

    /**
     * @notice Takes a seller, an offer, a condition and a twin, and an optional auth token. Creates a seller an offer,
     * then creates a group with that offer and the given condition. It then creates a twin and a bundle with that offer and the given twin.
     *
     * Limitation of the method:
     * If chosen dispute resolver has seller allow list, this method will not succeed, since seller that will be created
     * cannot be on that list. To avoid the failure you can
     * - Choose a dispute resolver without seller allow list
     * - Make an absolute zero offer without any dispute resolver specified
     * - First create a seller {AccountHandler.createSeller}, make sure that dispute resolver adds seller to its allow list
     *   and then continue with the offer creation
     *
     * Emits an SellerCreated, OfferCreated, a GroupCreated, a TwinCreated and a BundleCreated event if successful.
     *
     * Reverts if:
     * - The sellers region of protocol is paused
     * - The offers region of protocol is paused
     * - The groups region of protocol is paused
     * - The twins region of protocol is paused
     * - The bundles region of protocol is paused
     * - The orchestration region of protocol is paused
     * - Caller is not the supplied admin or does not own supplied auth token
     * - Caller is not the supplied assistant
     * - Supplied clerk is not a zero address
     * - Admin address is zero address and AuthTokenType == None
     * - AuthTokenType is not unique to this seller
     * - Seller salt is not unique
     * - Clone creation fails
     * - In seller struct:
     *   - Address values are zero address
     *   - Addresses are not unique to this seller
     *   - Seller is not active (if active == false)
     * - In offer struct:
     *   - Caller is not an assistant
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Both voucher expiration date and voucher expiration period are defined
     *   - Neither voucher expiration date nor voucher expiration period are defined
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
     *   - Royalty recipient is not on seller's allow list
     *   - Royalty percentage is less than the value decided by the admin
     *   - Total royalty percentage is more than max royalty percentage
     *   - Collection does not exist
     * - Condition includes invalid combination of parameters
     * - When creating twin if
     *   - Not approved to transfer the seller's token
     *   - SupplyAvailable is zero
     *   - Twin is NonFungibleToken and amount was set
     *   - Twin is NonFungibleToken and end of range would overflow
     *   - Twin is NonFungibleToken with unlimited supply and starting token id is too high
     *   - Twin is NonFungibleToken and range is already being used in another twin of the seller
     *   - Twin is FungibleToken or MultiToken and amount was not set
     * - When agent id is non zero:
     *   - If Agent does not exist
     * - If the sum of agent fee amount and protocol fee amount is greater than the offer fee limit determined by the protocol
     * - If the sum of agent fee amount and protocol fee amount is greater than fee limit set by seller
     *
     * @param _seller - the fully populated seller struct
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _drParameters - the id of chosen dispute resolver (can be 0) and mutualizer address (0 for self-mutualization)
     * @param _condition - the fully populated condition struct
     * @param _twin - the fully populated twin struct
     * @param _authToken - optional AuthToken struct that specifies an AuthToken type and tokenId that the seller can use to do admin functions
     * @param _voucherInitValues - the fully populated BosonTypes.VoucherInitValues struct
     * @param _agentId - the id of agent
     * @param _feeLimit - the maximum fee that seller is willing to pay per exchange (for static offers)
     */
    function createSellerAndOfferWithConditionAndTwinAndBundle(
        BosonTypes.Seller memory _seller,
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        BosonTypes.DRParameters calldata _drParameters,
        BosonTypes.Condition memory _condition,
        BosonTypes.Twin memory _twin,
        BosonTypes.AuthToken calldata _authToken,
        BosonTypes.VoucherInitValues calldata _voucherInitValues,
        uint256 _agentId,
        uint256 _feeLimit
    ) external;

    /**
     * @notice Takes a seller, an offer, a range for preminting, a condition and a twin, and an optional auth token. Creates a seller an offer,
     * then creates a group with that offer and the given condition. It then creates a twin and a bundle with that offer and the given twin
     * and reserves a range for preminting.
     *
     * Limitation of the method:
     * If chosen dispute resolver has seller allow list, this method will not succeed, since seller that will be created
     * cannot be on that list. To avoid the failure you can
     * - Choose a dispute resolver without seller allow list
     * - Make an absolute zero offer without any dispute resolver specified
     * - First create a seller {AccountHandler.createSeller}, make sure that dispute resolver adds seller to its allow list
     *   and then continue with the offer creation
     *
     * Emits an SellerCreated, OfferCreated, a GroupCreated, a TwinCreated, a BundleCreated and a RangeReserved event if successful.
     *
     * Reverts if:
     * - The sellers region of protocol is paused
     * - The offers region of protocol is paused
     * - The groups region of protocol is paused
     * - The twins region of protocol is paused
     * - The bundles region of protocol is paused
     * - The exchanges region of protocol is paused
     * - The orchestration region of protocol is paused
     * - Caller is not the supplied assistant
     * - Caller is not the supplied admin or does not own supplied auth token
     * - Supplied clerk is not a zero address
     * - Admin address is zero address and AuthTokenType == None
     * - AuthTokenType is not unique to this seller
     * - Reserved range length is zero
     * - Reserved range length is greater than quantity available
     * - Reserved range length is greater than maximum allowed range length
     * - Seller salt is not unique
     * - Clone creation fails
     * - In seller struct:
     *   - Address values are zero address
     *   - Addresses are not unique to this seller
     *   - Seller is not active (if active == false)
     * - In offer struct:
     *   - Caller is not an assistant
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Both voucher expiration date and voucher expiration period are defined
     *   - Neither voucher expiration date nor voucher expiration period are defined
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
     *   - Royalty recipient is not on seller's allow list
     *   - Royalty percentage is less than the value decided by the admin
     *   - Total royalty percentage is more than max royalty percentage
     *   - Collection does not exist
     * - Condition includes invalid combination of parameters
     * - When creating twin if
     *   - Not approved to transfer the seller's token
     *   - SupplyAvailable is zero
     *   - Twin is NonFungibleToken and amount was set
     *   - Twin is NonFungibleToken and end of range would overflow
     *   - Twin is NonFungibleToken with unlimited supply and starting token id is too high
     *   - Twin is NonFungibleToken and range is already being used in another twin of the seller
     *   - Twin is FungibleToken or MultiToken and amount was not set
     * - When agent id is non zero:
     *   - If Agent does not exist
     * - If the sum of agent fee amount and protocol fee amount is greater than the offer fee limit determined by the protocol
     * - If the sum of agent fee amount and protocol fee amount is greater than fee limit set by seller
     * - _to is not the BosonVoucher contract address or the BosonVoucher contract owner
     *
     * @dev No reentrancy guard here since already implemented by called functions. If added here, they would clash.
     *
     * @param _seller - the fully populated seller struct
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _drParameters - the id of chosen dispute resolver (can be 0) and mutualizer address (0 for self-mutualization)
     * @param _premintParameters - struct containing the amount of tokens to be reserved for preminting and the address to send the pre-minted vouchers to (contract address or contract owner)
     * @param _condition - the fully populated condition struct
     * @param _twin - the fully populated twin struct
     * @param _authToken - optional AuthToken struct that specifies an AuthToken type and tokenId that the seller can use to do admin functions
     * @param _voucherInitValues - the fully populated BosonTypes.VoucherInitValues struct
     * @param _agentId - the id of agent
     * @param _feeLimit - the maximum fee that seller is willing to pay per exchange (for static offers)
     */
    function createSellerAndPremintedOfferWithConditionAndTwinAndBundle(
        BosonTypes.Seller memory _seller,
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        BosonTypes.DRParameters calldata _drParameters,
        BosonTypes.PremintParameters calldata _premintParameters,
        BosonTypes.Condition calldata _condition,
        BosonTypes.Twin memory _twin,
        BosonTypes.AuthToken calldata _authToken,
        BosonTypes.VoucherInitValues calldata _voucherInitValues,
        uint256 _agentId,
        uint256 _feeLimit
    ) external;
}
