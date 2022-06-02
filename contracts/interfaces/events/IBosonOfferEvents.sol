// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {BosonTypes} from "../../domain/BosonTypes.sol";

/**
 * @title IBosonOfferEvents
 *
 * @notice Events related to management of offers within the protocol.
 */
interface IBosonOfferEvents {
    event OfferCreated(uint256 indexed offerId, uint256 indexed sellerId, BosonTypes.Offer offer, BosonTypes.OfferDates offerDates, BosonTypes.OfferDurations offerDurations);
    event OfferExtended(uint256 indexed offerId, uint256 indexed sellerId, uint256 validUntilDate);
    event OfferVoided(uint256 indexed offerId, uint256 indexed sellerId);
}
