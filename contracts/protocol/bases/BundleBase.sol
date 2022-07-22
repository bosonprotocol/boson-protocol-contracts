// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IBosonBundleEvents } from "../../interfaces/events/IBosonBundleEvents.sol";
import { ProtocolBase } from "./../bases/ProtocolBase.sol";
import { ProtocolLib } from "./../libs/ProtocolLib.sol";
import { BUNDLE_OFFER_MUST_BE_UNIQUE, BUNDLE_TWIN_MUST_BE_UNIQUE, EXCHANGE_FOR_OFFER_EXISTS, INSUFFICIENT_TWIN_SUPPLY_TO_COVER_BUNDLE_OFFERS, NOT_OPERATOR, NO_SUCH_TWIN, TOO_MANY_OFFERS, TOO_MANY_TWINS } from "./../../domain/BosonConstants.sol";

/**
 * @title BundleBase
 *
 * @dev Provides methods for bundle creation that can be shared accross facets
 */
contract BundleBase is ProtocolBase, IBosonBundleEvents {
    /**
     * @notice Creates a Bundle.
     *
     * Emits a BundleCreated event if successful.
     *
     * Reverts if:
     * - Seller does not exist
     * - any of offers belongs to different seller
     * - any of offers does not exist
     * - offer exists in a different bundle
     * - number of offers exceeds maximum allowed number per bundle
     * - any of twins belongs to different seller
     * - any of twins does not exist
     * - number of twins exceeds maximum allowed number per bundle
     * - duplicate twins added in same bundle
     * - exchange already exists for the offer id in bundle
     * - offers total quantity is greater than twin supply when token is NonFungible
     * - offers total quantity multiplied by twin amount is greater than twin supply when token is Fungible or MultiToken
     *
     * @param _bundle - the fully populated struct with bundle id set to 0x0
     */
    function createBundleInternal(Bundle memory _bundle) internal {
        // get seller id, make sure it exists and store it to incoming struct
        (bool exists, uint256 sellerId) = getSellerIdByOperator(msgSender());
        require(exists, NOT_OPERATOR);

        // limit maximum number of offers to avoid running into block gas limit in a loop
        require(_bundle.offerIds.length <= protocolLimits().maxOffersPerBundle, TOO_MANY_OFFERS);

        // limit maximum number of twins to avoid running into block gas limit in a loop
        require(_bundle.twinIds.length <= protocolLimits().maxTwinsPerBundle, TOO_MANY_TWINS);

        // Get the next bundle and increment the counter
        uint256 bundleId = protocolCounters().nextBundleId++;
        // Sum of offers quantity available
        uint256 offersTotalQuantityAvailable;

        for (uint256 i = 0; i < _bundle.offerIds.length; i++) {
            uint256 offerId = _bundle.offerIds[i];

            // Calculate bundle offers total quantity available.
            offersTotalQuantityAvailable = calculateOffersTotalQuantity(offersTotalQuantityAvailable, offerId);

            (bool bundleByOfferExists, ) = fetchBundleIdByOffer(offerId);
            require(!bundleByOfferExists, BUNDLE_OFFER_MUST_BE_UNIQUE);

            (bool exchangeIdsForOfferExists, ) = getExchangeIdsByOffer(offerId);
            // make sure exchange does not already exist for this offer id.
            require(!exchangeIdsForOfferExists, EXCHANGE_FOR_OFFER_EXISTS);

            // Add to bundleIdByOffer mapping
            protocolLookups().bundleIdByOffer[offerId] = bundleId;
        }

        for (uint256 i = 0; i < _bundle.twinIds.length; i++) {
            uint256 twinId = _bundle.twinIds[i];

            // A twin can't belong to multiple bundles
            (bool bundleForTwinExist, ) = fetchBundleIdByTwin(twinId);
            require(!bundleForTwinExist, BUNDLE_TWIN_MUST_BE_UNIQUE);

            if (_bundle.offerIds.length > 0) {
                bundleSupplyChecks(offersTotalQuantityAvailable, twinId);
            }

            // Push to bundleIdsByTwin mapping
            protocolLookups().bundleIdByTwin[_bundle.twinIds[i]] = bundleId;
        }

        // Get storage location for bundle
        (, Bundle storage bundle) = fetchBundle(bundleId);

        // Set bundle props individually since memory structs can't be copied to storage
        bundle.id = _bundle.id = bundleId;
        bundle.sellerId = _bundle.sellerId = sellerId;
        bundle.offerIds = _bundle.offerIds;
        bundle.twinIds = _bundle.twinIds;

        // Notify watchers of state change
        emit BundleCreated(bundleId, sellerId, _bundle, msgSender());
    }

    /**
     * @notice Gets twin from protocol storage, makes sure it exist.
     *
     * Reverts if:
     * - Twin does not exist
     * - Caller is not the seller
     *
     *  @param _twinId - the id of the twin to check
     */
    function getValidTwin(uint256 _twinId) internal view returns (Twin storage twin) {
        bool exists;
        // Get twin
        (exists, twin) = fetchTwin(_twinId);

        // Twin must already exist
        require(exists, NO_SUCH_TWIN);

        // Get seller id, we assume seller id exists if twin exists
        (, uint256 sellerId) = getSellerIdByOperator(msgSender());

        // Caller's seller id must match twin seller id
        require(sellerId == twin.sellerId, NOT_OPERATOR);
    }

    /**
     * @notice Make sure twin has enough supply to cover all bundled offers
     *
     * Reverts if:
     * - offers total quantity is greater than twin supply when token is NonFungible
     * - offers total quantity multiplied by twin amount is greater than twin supply when token is Fungible or Multitoken
     *
     * @param offersTotalQuantity - sum of offers total quantity available
     * @param _twinId - twin id to compare
     */
    function bundleSupplyChecks(uint256 offersTotalQuantity, uint256 _twinId) internal view {
        // make sure twin exist and belong to the seller
        Twin memory twin = getValidTwin(_twinId);

        // twin is NonFungibleToken or bundle has an unlimited offer
        if (twin.tokenType == TokenType.NonFungibleToken || offersTotalQuantity == type(uint256).max) {
            // the sum of all offers quantity should be less or equal twin supply
            require(offersTotalQuantity <= twin.supplyAvailable, INSUFFICIENT_TWIN_SUPPLY_TO_COVER_BUNDLE_OFFERS);
        } else {
            // twin is FungibleToken or MultiToken
            // the sum of all offers quantity multiplied by twin amount should be less or equal twin supply
            require(
                offersTotalQuantity * twin.amount <= twin.supplyAvailable,
                INSUFFICIENT_TWIN_SUPPLY_TO_COVER_BUNDLE_OFFERS
            );
        }
    }

    /**
     *
     * @notice Calculate bundle offers total quantity available.
     * @param previousTotal - previous sum of offers total quantity or initial value
     * @param _offerId - offer id to add to total quantity
     * @return offersTotalQuantity - previous sum of offers total quantity plus the current offer quantityAvailable
     */
    function calculateOffersTotalQuantity(uint256 previousTotal, uint256 _offerId)
        internal
        view
        returns (uint256 offersTotalQuantity)
    {
        // make sure all offers exist and belong to the seller
        Offer storage offer = getValidOffer(_offerId);

        // Unchecked because we're handling overflow below
        unchecked {
            // Calculate the bundle offers total quantity available.
            offersTotalQuantity = previousTotal + offer.quantityAvailable;
        }

        // offersTotalQuantity should be max uint if overflow happens
        if (offersTotalQuantity < offer.quantityAvailable) {
            offersTotalQuantity = type(uint256).max;
        }
    }
}
