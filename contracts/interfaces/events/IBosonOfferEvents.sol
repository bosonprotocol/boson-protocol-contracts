// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { BosonTypes } from "../../domain/BosonTypes.sol";

/**
 * @title IBosonOfferEvents
 *
 * @notice Defines events related to management of offers within the protocol.
 */
interface IBosonOfferEvents {
    event OfferCreated(
        uint256 indexed offerId,
        uint256 indexed sellerId,
        BosonTypes.Offer offer,
        BosonTypes.OfferDates offerDates,
        BosonTypes.OfferDurations offerDurations,
        BosonTypes.DisputeResolutionTerms disputeResolutionTerms,
        BosonTypes.OfferFees offerFees,
        uint256 indexed agentId,
        address executedBy
    );
    event OfferExtended(
        uint256 indexed offerId,
        uint256 indexed sellerId,
        uint256 validUntilDate,
        address indexed executedBy
    );
    event OfferVoided(uint256 indexed offerId, uint256 indexed creatorId, address indexed executedBy);
    event NonListedOfferVoided(bytes32 offerHash, uint256 indexed offererId, address indexed executedBy);
    event RangeReserved(
        uint256 indexed offerId,
        uint256 indexed sellerId,
        uint256 startExchangeId,
        uint256 endExchangeId,
        address owner,
        address indexed executedBy
    );
    event OfferRoyaltyInfoUpdated(
        uint256 indexed offerId,
        uint256 indexed sellerId,
        BosonTypes.RoyaltyInfo royaltyInfo,
        address indexed executedBy
    );
    event OfferMutualizerUpdated(
        uint256 indexed offerId,
        uint256 indexed sellerId,
        address indexed newMutualizer,
        address executedBy
    );
}
