// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { BosonTypes } from "../../domain/BosonTypes.sol";
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
 * The ERC-165 identifier for this interface is: 0xf9419534
 */
interface IBosonOrchestrationHandler is
    IBosonAccountEvents,
    IBosonGroupEvents,
    IBosonOfferEvents,
    IBosonTwinEvents,
    IBosonBundleEvents
{
    /**
     * @notice Creates a seller and an offer in a single transaction.
     *
     * Emits a SellerCreated and an OfferCreated event if successful.
     *
     * Reverts if:
     * - caller is not the same as operator address
     * - in seller struct:
     *   - Address values are zero address
     *   - Addresses are not unique to this seller
     *   - Seller is not active (if active == false)
     * - in offer struct:
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Both voucher expiration date and voucher expiraton period are defined
     *   - Neither of voucher expiration date and voucher expiraton period are defined
     *   - Voucher redeemable period is fixed, but it ends before it starts
     *   - Voucher redeemable period is fixed, but it ends before offer expires
     *   - Fulfillment period is set to zero
     *   - Resolution period is set to zero
     *   - Voided is set to true
     *   - Available quantity is set to zero
     *   - Dispute resolver wallet is not registered, except for absolute zero offers with unspecified dispute resolver
     *   - Dispute resolver is not active, except for absolute zero offers with unspecified dispute resolver
     *   - Dispute resolver does not accept fees in the exchange token
     *   - Buyer cancel penalty is greater than price
     *
     * @param _seller - the fully populated seller struct
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _disputeResolverId - the id of chosen dispute resolver (can be 0)
     */
    function createSellerAndOffer(
        BosonTypes.Seller calldata _seller,
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        uint256 _disputeResolverId
    ) external;

    /**
     * @notice Takes an offer and a condition, creates an offer, then a group with that offer and the given condition.
     *
     * Emits an OfferCreated and a GroupCreated event if successful.
     *
     * Reverts if:
     * - in offer struct:
     *   - Caller is not an operator
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Both voucher expiration date and voucher expiraton period are defined
     *   - Neither of voucher expiration date and voucher expiraton period are defined
     *   - Voucher redeemable period is fixed, but it ends before it starts
     *   - Voucher redeemable period is fixed, but it ends before offer expires
     *   - Fulfillment period is set to zero
     *   - Resolution period is set to zero
     *   - Voided is set to true
     *   - Available quantity is set to zero
     *   - Dispute resolver wallet is not registered, except for absolute zero offers with unspecified dispute resolver
     *   - Dispute resolver is not active, except for absolute zero offers with unspecified dispute resolver
     *   - Dispute resolver does not accept fees in the exchange token
     *   - Buyer cancel penalty is greater than price
     * - Condition includes invalid combination of parameters
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _disputeResolverId - the id of chosen dispute resolver (can be 0)
     * @param _condition - the fully populated condition struct
     */
    function createOfferWithCondition(
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        uint256 _disputeResolverId,
        BosonTypes.Condition memory _condition
    ) external;

    /**
     * @notice Takes an offer and group ID, creates an offer and adds it to the existing group with given id
     *
     * Emits an OfferCreated and a GroupUpdated event if successful.
     *
     * Reverts if:
     * - in offer struct:
     *   - Caller is not an operator
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Both voucher expiration date and voucher expiraton period are defined
     *   - Neither of voucher expiration date and voucher expiraton period are defined
     *   - Voucher redeemable period is fixed, but it ends before it starts
     *   - Voucher redeemable period is fixed, but it ends before offer expires
     *   - Fulfillment period is set to zero
     *   - Resolution period is set to zero
     *   - Voided is set to true
     *   - Available quantity is set to zero
     *   - Dispute resolver wallet is not registered, except for absolute zero offers with unspecified dispute resolver
     *   - Dispute resolver is not active, except for absolute zero offers with unspecified dispute resolver
     *   - Dispute resolver does not accept fees in the exchange token
     *   - Buyer cancel penalty is greater than price
     * - when adding to the group if:
     *   - Group does not exists
     *   - Caller is not the operator of the group
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _disputeResolverId - the id of chosen dispute resolver (can be 0)
     * @param _groupId - id of the group, where offer will be added
     */
    function createOfferAddToGroup(
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        uint256 _disputeResolverId,
        uint256 _groupId
    ) external;

    /**
     * @notice Takes an offer and a twin, creates an offer, creates a twin, then a bundle with that offer and the given twin
     *
     * Emits an OfferCreated, a TwinCreated and a BundleCreated event if successful.
     *
     * Reverts if:
     * - in offer struct:
     *   - Caller is not an operator
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Both voucher expiration date and voucher expiraton period are defined
     *   - Neither of voucher expiration date and voucher expiraton period are defined
     *   - Voucher redeemable period is fixed, but it ends before it starts
     *   - Voucher redeemable period is fixed, but it ends before offer expires
     *   - Fulfillment period is set to zero
     *   - Resolution period is set to zero
     *   - Voided is set to true
     *   - Available quantity is set to zero
     *   - Dispute resolver wallet is not registered, except for absolute zero offers with unspecified dispute resolver
     *   - Dispute resolver is not active, except for absolute zero offers with unspecified dispute resolver
     *   - Dispute resolver does not accept fees in the exchange token
     *   - Buyer cancel penalty is greater than price
     * - when creating twin if
     *   - Not approved to transfer the seller's token
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _disputeResolverId - the id of chosen dispute resolver (can be 0)
     * @param _twin - the fully populated twin struct
     */
    function createOfferAndTwinWithBundle(
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        uint256 _disputeResolverId,
        BosonTypes.Twin memory _twin
    ) external;

    /**
     * @notice Takes an offer, a condition and a twin, creates an offer, then a group with that offer and the given condition, then creates a twin, then a bundle with that offer and the given twin
     *
     * Emits an OfferCreated, a GroupCreated, a TwinCreated and a BundleCreated event if successful.
     *
     * Reverts if:
     * - in offer struct:
     *   - Caller is not an operator
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Both voucher expiration date and voucher expiraton period are defined
     *   - Neither of voucher expiration date and voucher expiraton period are defined
     *   - Voucher redeemable period is fixed, but it ends before it starts
     *   - Voucher redeemable period is fixed, but it ends before offer expires
     *   - Fulfillment period is set to zero
     *   - Resolution period is set to zero
     *   - Voided is set to true
     *   - Available quantity is set to zero
     *   - Dispute resolver wallet is not registered, except for absolute zero offers with unspecified dispute resolver
     *   - Dispute resolver is not active, except for absolute zero offers with unspecified dispute resolver
     *   - Dispute resolver does not accept fees in the exchange token
     *   - Buyer cancel penalty is greater than price
     * - Condition includes invalid combination of parameters
     * - when creating twin if
     *   - Not approved to transfer the seller's token
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _disputeResolverId - the id of chosen dispute resolver (can be 0)
     * @param _condition - the fully populated condition struct
     * @param _twin - the fully populated twin struct
     */
    function createOfferWithConditionAndTwinAndBundle(
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        uint256 _disputeResolverId,
        BosonTypes.Condition memory _condition,
        BosonTypes.Twin memory _twin
    ) external;

    /**
     * @notice Takes a seller, an offer and a condition, creates a seller, creates an offer, then a group with that offer and the given condition.
     *
     * Emits a SellerCreated, an OfferCreated and a GroupCreated event if successful.
     *
     * Reverts if:
     * - caller is not the same as operator address
     * - in seller struct:
     *   - Address values are zero address
     *   - Addresses are not unique to this seller
     *   - Seller is not active (if active == false)
     * - in offer struct:
     *   - Caller is not an operator
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Both voucher expiration date and voucher expiraton period are defined
     *   - Neither of voucher expiration date and voucher expiraton period are defined
     *   - Voucher redeemable period is fixed, but it ends before it starts
     *   - Voucher redeemable period is fixed, but it ends before offer expires
     *   - Fulfillment period is set to zero
     *   - Resolution period is set to zero
     *   - Voided is set to true
     *   - Available quantity is set to zero
     *   - Dispute resolver wallet is not registered, except for absolute zero offers with unspecified dispute resolver
     *   - Dispute resolver is not active, except for absolute zero offers with unspecified dispute resolver
     *   - Dispute resolver does not accept fees in the exchange token
     *   - Buyer cancel penalty is greater than price
     * - Condition includes invalid combination of parameters
     *
     * @param _seller - the fully populated seller struct
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _disputeResolverId - the id of chosen dispute resolver (can be 0)
     * @param _condition - the fully populated condition struct
     */
    function createSellerAndOfferWithCondition(
        BosonTypes.Seller memory _seller,
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        uint256 _disputeResolverId,
        BosonTypes.Condition memory _condition
    ) external;

    /**
     * @notice Takes a seller, an offer and a twin, creates a seller, creates an offer, creates a twin, then a bundle with that offer and the given twin
     *
     * Emits a SellerCreated, an OfferCreated, a TwinCreated and a BundleCreated event if successful.
     *
     * Reverts if:
     * - caller is not the same as operator address
     * - in seller struct:
     *   - Address values are zero address
     *   - Addresses are not unique to this seller
     *   - Seller is not active (if active == false)
     * - in offer struct:
     *   - Caller is not an operator
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Both voucher expiration date and voucher expiraton period are defined
     *   - Neither of voucher expiration date and voucher expiraton period are defined
     *   - Voucher redeemable period is fixed, but it ends before it starts
     *   - Voucher redeemable period is fixed, but it ends before offer expires
     *   - Fulfillment period is set to zero
     *   - Resolution period is set to zero
     *   - Voided is set to true
     *   - Available quantity is set to zero
     *   - Dispute resolver wallet is not registered, except for absolute zero offers with unspecified dispute resolver
     *   - Dispute resolver is not active, except for absolute zero offers with unspecified dispute resolver
     *   - Dispute resolver does not accept fees in the exchange token
     *   - Buyer cancel penalty is greater than price
     * - when creating twin if
     *   - Not approved to transfer the seller's token
     *
     * @param _seller - the fully populated seller struct
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _disputeResolverId - the id of chosen dispute resolver (can be 0)
     * @param _twin - the fully populated twin struct
     */
    function createSellerAndOfferAndTwinWithBundle(
        BosonTypes.Seller memory _seller,
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        uint256 _disputeResolverId,
        BosonTypes.Twin memory _twin
    ) external;

    /**
     * @notice Takes a seller, an offer, a condition and a twin, creates a sellerm an offer, then a group with that offer and the given condition, then creates a twin, then a bundle with that offer and the given twin
     *
     * Emits an SellerCreated, OfferCreated, a GroupCreated, a TwinCreated and a BundleCreated event if successful.
     *
     * Reverts if:
     * - caller is not the same as operator address
     * - in seller struct:
     *   - Address values are zero address
     *   - Addresses are not unique to this seller
     *   - Seller is not active (if active == false)
     * - in offer struct:
     *   - Caller is not an operator
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Both voucher expiration date and voucher expiraton period are defined
     *   - Neither of voucher expiration date and voucher expiraton period are defined
     *   - Voucher redeemable period is fixed, but it ends before it starts
     *   - Voucher redeemable period is fixed, but it ends before offer expires
     *   - Fulfillment period is set to zero
     *   - Resolution period is set to zero
     *   - Voided is set to true
     *   - Available quantity is set to zero
     *   - Dispute resolver wallet is not registered, except for absolute zero offers with unspecified dispute resolver
     *   - Dispute resolver is not active, except for absolute zero offers with unspecified dispute resolver
     *   - Dispute resolver does not accept fees in the exchange token
     *   - Buyer cancel penalty is greater than price
     * - Condition includes invalid combination of parameters
     * - when creating twin if
     *   - Not approved to transfer the seller's token
     *
     * @param _seller - the fully populated seller struct
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _disputeResolverId - the id of chosen dispute resolver (can be 0)
     * @param _condition - the fully populated condition struct
     * @param _twin - the fully populated twin struct
     */
    function createSellerAndOfferWithConditionAndTwinAndBundle(
        BosonTypes.Seller memory _seller,
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        uint256 _disputeResolverId,
        BosonTypes.Condition memory _condition,
        BosonTypes.Twin memory _twin
    ) external;
}
