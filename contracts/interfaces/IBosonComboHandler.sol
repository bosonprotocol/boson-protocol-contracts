// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../domain/BosonTypes.sol";

/**
 * @title IBosonConfigHandler
 *
 * @notice Handles management of various protocol-related settings.
 *
 * The ERC-165 identifier for this interface is: 0x0000000 // TODO recalc
 */
interface IBosonComboHandler {
    /// Events
    event OfferCreated(uint256 indexed offerId, uint256 indexed sellerId, BosonTypes.Offer offer);

    /**
     * @notice Creates a seller and an offer in a single transaction.
     *
     * Emits a SellerCreated and an OfferCreated event if successful.
     *
     * Reverts if:
     * - seller does not exist
     * - Valid from date is greater than valid until date
     * - Valid until date is not in the future
     * - Buyer cancel penalty is greater than price
     * - Voided is set to true
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     */
    function createSellerAndOffer(BosonTypes.Seller calldata _seller, BosonTypes.Offer memory _offer) external;
}
