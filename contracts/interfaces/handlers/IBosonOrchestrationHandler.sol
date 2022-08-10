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
 * The ERC-165 identifier for this interface is: 0xc411e7c6
 */
interface IBosonOrchestrationHandler is
    IBosonAccountEvents,
    IBosonGroupEvents,
    IBosonOfferEvents,
    IBosonTwinEvents,
    IBosonBundleEvents
{
    /**
     * @notice Creates a seller (with optional auth token) and an offer in a single transaction.
     *
     * Limitation of the method:
     * If chosen dispute resolver has seller allow list, this method will not succeed, since seller that will be created
     * cannot be on that list. To avoid the failure you can
     * - choose a dispute resolver without seller allow list
     * - make an absolute zero offer without and dispute resolver specified
     * - first create a seller {AccountHandler.createSeller}, make sure that dispute resolver adds seller to its allow list
     *   and then continue with the offer creation
     *
     * Emits a SellerCreated and an OfferCreated event if successful.
     *
     * Reverts if:
     * - The sellers region of protocol is paused
     * - The offers region of protocol is paused
     * - The orchestration region of protocol is paused
     * - caller is not the same as operator address
     * - Admin address is zero address and AuthTokenType == None
     * - AuthTokenType is not unique to this seller
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
     *   - Seller is not on dispute resolver's seller allow list
     *   - Dispute resolver does not accept fees in the exchange token
     *   - Buyer cancel penalty is greater than price
     * - When agent id is non zero:
     *   - If Agent does not exist
     *   - If the sum of Agent fee amount and protocol fee amount is greater than the offer fee limit
     *
     * @param _seller - the fully populated seller struct
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _disputeResolverId - the id of chosen dispute resolver (can be 0)
     * @param _authToken - optional AuthToken struct that specifies an AuthToken type and tokenId that the user can use to do admin functions
     * @param _voucherInitValues - the fully populated BosonTypes.VoucherInitValues struct
     * @param _agentId - the id of agent
     */
    function createSellerAndOffer(
        BosonTypes.Seller calldata _seller,
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        uint256 _disputeResolverId,
        BosonTypes.AuthToken calldata _authToken,
        BosonTypes.VoucherInitValues calldata _voucherInitValues,
        uint256 _agentId
    ) external;

    /**
     * @notice Takes an offer and a condition, creates an offer, then a group with that offer and the given condition.
     *
     * Emits an OfferCreated and a GroupCreated event if successful.
     *
     * Reverts if:
     * - The offers region of protocol is paused
     * - The groups region of protocol is paused
     * - The orchestration region of protocol is paused
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
     *   - Seller is not on dispute resolver's seller allow list
     *   - Dispute resolver does not accept fees in the exchange token
     *   - Buyer cancel penalty is greater than price
     * - Condition includes invalid combination of parameters
     * - When agent id is non zero:
     *   - If Agent does not exist
     *   - If the sum of Agent fee amount and protocol fee amount is greater than the offer fee limit
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _disputeResolverId - the id of chosen dispute resolver (can be 0)
     * @param _condition - the fully populated condition struct
     * @param _agentId - the id of agent
     */
    function createOfferWithCondition(
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        uint256 _disputeResolverId,
        BosonTypes.Condition memory _condition,
        uint256 _agentId
    ) external;

    /**
     * @notice Takes an offer and group ID, creates an offer and adds it to the existing group with given id
     *
     * Emits an OfferCreated and a GroupUpdated event if successful.
     *
     * Reverts if:
     * - The offers region of protocol is paused
     * - The groups region of protocol is paused
     * - The orchestration region of protocol is paused
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
     *   - Seller is not on dispute resolver's seller allow list
     *   - Dispute resolver does not accept fees in the exchange token
     *   - Buyer cancel penalty is greater than price
     * - when adding to the group if:
     *   - Group does not exists
     *   - Caller is not the operator of the group
     * - When agent id is non zero:
     *   - If Agent does not exist
     *   - If the sum of Agent fee amount and protocol fee amount is greater than the offer fee limit
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _disputeResolverId - the id of chosen dispute resolver (can be 0)
     * @param _groupId - id of the group, where offer will be added
     * @param _agentId - the id of agent
     */
    function createOfferAddToGroup(
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        uint256 _disputeResolverId,
        uint256 _groupId,
        uint256 _agentId
    ) external;

    /**
     * @notice Takes an offer and a twin, creates an offer, creates a twin, then a bundle with that offer and the given twin
     *
     * Emits an OfferCreated, a TwinCreated and a BundleCreated event if successful.
     *
     * Reverts if:
     * - The offers region of protocol is paused
     * - The twins region of protocol is paused
     * - The orchestration region of protocol is paused
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
     *   - Seller is not on dispute resolver's seller allow list
     *   - Dispute resolver does not accept fees in the exchange token
     *   - Buyer cancel penalty is greater than price
     * - when creating twin if
     *   - Not approved to transfer the seller's token
     * - When agent id is non zero:
     *   - If Agent does not exist
     *   - If the sum of Agent fee amount and protocol fee amount is greater than the offer fee limit
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _disputeResolverId - the id of chosen dispute resolver (can be 0)
     * @param _twin - the fully populated twin struct
     * @param _agentId - the id of agent
     */
    function createOfferAndTwinWithBundle(
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        uint256 _disputeResolverId,
        BosonTypes.Twin memory _twin,
        uint256 _agentId
    ) external;

    /**
     * @notice Takes an offer, a condition and a twin, creates an offer, then a group with that offer and the given condition, then creates a twin, then a bundle with that offer and the given twin
     *
     * Emits an OfferCreated, a GroupCreated, a TwinCreated and a BundleCreated event if successful.
     *
     * Reverts if:
     * - The offers region of protocol is paused
     * - The groups region of protocol is paused
     * - The twins region of protocol is paused
     * - The bundles region of protocol is paused
     * - The orchestration region of protocol is paused
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
     *   - Seller is not on dispute resolver's seller allow list
     *   - Dispute resolver does not accept fees in the exchange token
     *   - Buyer cancel penalty is greater than price
     * - Condition includes invalid combination of parameters
     * - when creating twin if
     *   - Not approved to transfer the seller's token
     * - When agent id is non zero:
     *   - If Agent does not exist
     *   - If the sum of Agent fee amount and protocol fee amount is greater than the offer fee limit
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _disputeResolverId - the id of chosen dispute resolver (can be 0)
     * @param _condition - the fully populated condition struct
     * @param _twin - the fully populated twin struct
     * @param _agentId - the id of agent
     */
    function createOfferWithConditionAndTwinAndBundle(
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        uint256 _disputeResolverId,
        BosonTypes.Condition memory _condition,
        BosonTypes.Twin memory _twin,
        uint256 _agentId
    ) external;

    /**
     * @notice Takes a seller, an offer, a condition and an optional auth token, creates a seller, creates an offer, then a group with that offer and the given condition.
     *
     * Limitation of the method:
     * If chosen dispute resolver has seller allow list, this method will not succeed, since seller that will be created
     * cannot be on that list. To avoid the failure you can
     * - choose a dispute resolver without seller allow list
     * - make an absolute zero offer without and dispute resolver specified
     * - first create a seller {AccountHandler.createSeller}, make sure that dispute resolver adds seller to its allow list
     *   and then continue with the offer creation
     *
     * Emits a SellerCreated, an OfferCreated and a GroupCreated event if successful.
     *
     * Reverts if:
     * - The sellers region of protocol is paused
     * - The offers region of protocol is paused
     * - The groups region of protocol is paused
     * - The orchestration region of protocol is paused
     * - caller is not the same as operator address
     * - Admin address is zero address and AuthTokenType == None
     * - AuthTokenType is not unique to this seller
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
     *   - Seller is not on dispute resolver's seller allow list
     *   - Dispute resolver does not accept fees in the exchange token
     *   - Buyer cancel penalty is greater than price
     * - Condition includes invalid combination of parameters
     * - When agent id is non zero:
     *   - If Agent does not exist
     *   - If the sum of Agent fee amount and protocol fee amount is greater than the offer fee limit
     *
     * @param _seller - the fully populated seller struct
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _disputeResolverId - the id of chosen dispute resolver (can be 0)
     * @param _condition - the fully populated condition struct
     * @param _authToken - optional AuthToken struct that specifies an AuthToken type and tokenId that the user can use to do admin functions
     * @param _voucherInitValues - the fully populated BosonTypes.VoucherInitValues struct
     * @param _agentId - the id of agent
     */
    function createSellerAndOfferWithCondition(
        BosonTypes.Seller memory _seller,
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        uint256 _disputeResolverId,
        BosonTypes.Condition memory _condition,
        BosonTypes.AuthToken calldata _authToken,
        BosonTypes.VoucherInitValues calldata _voucherInitValues,
        uint256 _agentId
    ) external;

    /**
     * @notice Takes a seller, an offer, a twin, and an optional auth token, creates a seller, creates an offer, creates a twin, then a bundle with that offer and the given twin
     *
     * Limitation of the method:
     * If chosen dispute resolver has seller allow list, this method will not succeed, since seller that will be created
     * cannot be on that list. To avoid the failure you can
     * - choose a dispute resolver without seller allow list
     * - make an absolute zero offer without and dispute resolver specified
     * - first create a seller {AccountHandler.createSeller}, make sure that dispute resolver adds seller to its allow list
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
     * - caller is not the same as operator address
     * - Admin address is zero address and AuthTokenType == None
     * - AuthTokenType is not unique to this seller
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
     *   - Seller is not on dispute resolver's seller allow list
     *   - Dispute resolver does not accept fees in the exchange token
     *   - Buyer cancel penalty is greater than price
     * - when creating twin if
     *   - Not approved to transfer the seller's token
     * - When agent id is non zero:
     *   - If Agent does not exist
     *   - If the sum of Agent fee amount and protocol fee amount is greater than the offer fee limit
     *
     * @param _seller - the fully populated seller struct
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _disputeResolverId - the id of chosen dispute resolver (can be 0)
     * @param _twin - the fully populated twin struct
     * @param _authToken - optional AuthToken struct that specifies an AuthToken type and tokenId that the user can use to do admin functions
     * @param _voucherInitValues - the fully populated BosonTypes.VoucherInitValues struct
     * @param _agentId - the id of agent
     */
    function createSellerAndOfferAndTwinWithBundle(
        BosonTypes.Seller memory _seller,
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        uint256 _disputeResolverId,
        BosonTypes.Twin memory _twin,
        BosonTypes.AuthToken calldata _authToken,
        BosonTypes.VoucherInitValues calldata _voucherInitValues,
        uint256 _agentId
    ) external;

    /**
     * @notice Takes a seller, an offer, a condition and a twin, and an optional auth token, creates a seller an offer, then a group with that offer and the given condition, then creates a twin, then a bundle with that offer and the given twin
     *
     * Limitation of the method:
     * If chosen dispute resolver has seller allow list, this method will not succeed, since seller that will be created
     * cannot be on that list. To avoid the failure you can
     * - choose a dispute resolver without seller allow list
     * - make an absolute zero offer without and dispute resolver specified
     * - first create a seller {AccountHandler.createSeller}, make sure that dispute resolver adds seller to its allow list
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
     * - caller is not the same as operator address
     * - Admin address is zero address and AuthTokenType == None
     * - AuthTokenType is not unique to this seller
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
     *   - Seller is not on dispute resolver's seller allow list
     *   - Dispute resolver does not accept fees in the exchange token
     *   - Buyer cancel penalty is greater than price
     * - Condition includes invalid combination of parameters
     * - when creating twin if
     *   - Not approved to transfer the seller's token
     * - When agent id is non zero:
     *   - If Agent does not exist
     *   - If the sum of Agent fee amount and protocol fee amount is greater than the offer fee limit
     *
     * @param _seller - the fully populated seller struct
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _disputeResolverId - the id of chosen dispute resolver (can be 0)
     * @param _condition - the fully populated condition struct
     * @param _twin - the fully populated twin struct
     * @param _authToken - optional AuthToken struct that specifies an AuthToken type and tokenId that the user can use to do admin functions
     * @param _voucherInitValues - the fully populated BosonTypes.VoucherInitValues struct
     * @param _agentId - the id of agent
     */
    function createSellerAndOfferWithConditionAndTwinAndBundle(
        BosonTypes.Seller memory _seller,
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        uint256 _disputeResolverId,
        BosonTypes.Condition memory _condition,
        BosonTypes.Twin memory _twin,
        BosonTypes.AuthToken calldata _authToken,
        BosonTypes.VoucherInitValues calldata _voucherInitValues,
        uint256 _agentId
    ) external;
}
