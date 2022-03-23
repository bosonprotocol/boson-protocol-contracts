// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../domain/BosonTypes.sol";

/**
 * @title IBosonOfferHandler
 *
 * @notice Manages creation, voiding, and querying of offers within the protocol.
 *
 * The ERC-165 identifier for this interface is: 0xaf7dd438
 */
interface IBosonOfferHandler {

    /// Events
    event OfferCreated(uint256 indexed offerId, uint256 indexed sellerId, BosonTypes.Offer offer);
    event OfferVoided(uint256 indexed offerId, uint256 indexed sellerId);

    /**
     * @notice Creates an offer
     *
     * Emits an OfferCreated event if successful.
     *
     * Reverts if:
     * - Valid from date is greater than valid until date
     * - Valid until date is not in the future
     *
     * @param _offer - the fully populated struct with offer id set to 0x0
     */
    function createOffer(BosonTypes.Offer calldata _offer)
    external;

    /**
     * @notice Voids a given offer
     *
     * Emits an OfferVoided event if successful.
     *
     * Note:
     * Existing exchanges are not affected.
     * No further vouchers can be issued against a voided offer.
     *
     * Reverts if:
     * - Offer ID is invalid
     * - Offer is not owned by caller
     *
     * @param _offerId - the id of the offer to check
     */
    function voidOffer(uint256 _offerId)
    external;

    /**
     * @notice Gets the details about a given offer.
     *
     * @param _offerId - the id of the offer to check
     * @return success - the offer was found
     * @return offer - the offer details. See {BosonTypes.Offer}
     */
    function getOffer(uint256 _offerId)
    external
    view
    returns(bool success, BosonTypes.Offer memory offer);

    /**
     * @notice Gets the next offer id.
     *
     * Does not increment the counter.
     *
     * @return nextOfferId - the next offer id
     */
    function getNextOfferId()
    external
    view
    returns(uint256 nextOfferId);
}