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
}
