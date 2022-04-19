// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {BosonTypes} from "../../domain/BosonTypes.sol";
import {IBosonAccountEvents} from "../events/IBosonAccountEvents.sol";
import {IBosonGroupEvents} from "../events/IBosonGroupEvents.sol";
import {IBosonOfferEvents} from "../events/IBosonOfferEvents.sol";

/**
 * @title IBosonOrchestrationHandler
 *
 * @notice Combines creation of multiple entities (accounts, offers, groups, twins, bundles) in a single transaction
 *
 * The ERC-165 identifier for this interface is: 0x8db6d85b
 */
interface IBosonOrchestrationHandler is IBosonAccountEvents, IBosonGroupEvents, IBosonOfferEvents{
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
     *   - Buyer cancel penalty is greater than price
     *   - Voided is set to true
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     */
    function createSellerAndOffer(BosonTypes.Seller calldata _seller, BosonTypes.Offer memory _offer) external;

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
     *   - Buyer cancel penalty is greater than price
     *   - Voided is set to true
     * - Condition includes invalid combination of parameters
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _condition - the fully populated condition struct
     */
    function createOfferWithCondition(
        BosonTypes.Offer memory _offer,
        BosonTypes.Condition memory _condition
    )
    external;
}
