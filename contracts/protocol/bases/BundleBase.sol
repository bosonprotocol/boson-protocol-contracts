// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import "./../../domain/BosonConstants.sol";
import { IBosonBundleEvents } from "../../interfaces/events/IBosonBundleEvents.sol";
import { ProtocolBase } from "./../bases/ProtocolBase.sol";
import { ProtocolLib } from "./../libs/ProtocolLib.sol";

/**
 * @title BundleBase
 *
 * @notice Provides methods for bundle creation that can be shared across facets
 */
contract BundleBase is ProtocolBase, IBosonBundleEvents {
    /**
     * @notice Creates a Bundle.
     *
     * Emits a BundleCreated event if successful.
     *
     * Reverts if:
     * - The bundles region of protocol is paused
     * - Seller does not exist
     * - Either offerIds member or twinIds member is empty
     * - Any of the offers belongs to different seller
     * - Any of the offers does not exist
     * - Offer exists in a different bundle
     * - Any of the twins belongs to different seller
     * - Any of the twins does not exist
     * - Duplicate twins added in same bundle
     * - Exchange already exists for the offer id in bundle
     * - Offers' total quantity is greater than twin supply when token is nonfungible
     * - Offers' total quantity multiplied by twin amount is greater than twin supply when token is fungible or multitoken
     *
     * @param _bundle - the fully populated struct with bundle id set to 0x0
     */
    function createBundleInternal(Bundle memory _bundle) internal {
        // Cache protocol lookups and limits for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        // get message sender
        address sender = _msgSender();

        // get seller id, make sure it exists and store it to incoming struct
        (bool exists, uint256 sellerId) = getSellerIdByAssistant(sender);
        if (!exists) revert NotAssistant();

        // validate that offer ids and twin ids are not empty
        if (_bundle.offerIds.length == 0 || _bundle.twinIds.length == 0)
            revert BundleRequiresAtLeastOneTwinAndOneOffer();

        // Get the next bundle and increment the counter
        uint256 bundleId = protocolCounters().nextBundleId++;
        // Sum of offers quantity available
        uint256 offersTotalQuantityAvailable;

        for (uint256 i = 0; i < _bundle.offerIds.length; ) {
            uint256 offerId = _bundle.offerIds[i];

            // Calculate bundle offers total quantity available.
            offersTotalQuantityAvailable = calculateOffersTotalQuantity(offersTotalQuantityAvailable, offerId);

            (bool bundleByOfferExists, ) = fetchBundleIdByOffer(offerId);
            if (bundleByOfferExists) revert BundleOfferMustBeUnique();

            (bool exchangeIdsForOfferExists, ) = getExchangeIdsByOffer(offerId);
            // make sure exchange does not already exist for this offer id.
            if (exchangeIdsForOfferExists) revert ExchangeForOfferExists();

            // Add to bundleIdByOffer mapping
            lookups.bundleIdByOffer[offerId] = bundleId;

            unchecked {
                i++;
            }
        }

        for (uint256 i = 0; i < _bundle.twinIds.length; ) {
            uint256 twinId = _bundle.twinIds[i];

            // A twin can't belong to multiple bundles
            (bool bundleForTwinExist, ) = fetchBundleIdByTwin(twinId);
            if (bundleForTwinExist) revert BundleTwinMustBeUnique();

            bundleSupplyChecks(offersTotalQuantityAvailable, twinId);

            // Push to bundleIdsByTwin mapping
            lookups.bundleIdByTwin[_bundle.twinIds[i]] = bundleId;

            unchecked {
                i++;
            }
        }

        // Get storage location for bundle
        (, Bundle storage bundle) = fetchBundle(bundleId);

        // Set bundle props individually since memory structs can't be copied to storage
        bundle.id = _bundle.id = bundleId;
        bundle.sellerId = _bundle.sellerId = sellerId;
        bundle.offerIds = _bundle.offerIds;
        bundle.twinIds = _bundle.twinIds;

        // Notify watchers of state change
        emit BundleCreated(bundleId, sellerId, _bundle, sender);
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
        if (!exists) revert NoSuchTwin();

        // Get seller id, we assume seller id exists if twin exists
        (, uint256 sellerId) = getSellerIdByAssistant(_msgSender());

        // Caller's seller id must match twin seller id
        if (sellerId != twin.sellerId) revert NotAssistant();
    }

    /**
     * @notice Checks that twin has enough supply to cover all bundled offers.
     *
     * Reverts if:
     * - Offers' total quantity is greater than twin supply when token is nonfungible
     * - Offers' total quantity multiplied by twin amount is greater than twin supply when token is fungible or multitoken
     *
     * @param _offersTotalQuantity - sum of offers' total quantity available
     * @param _twinId - twin id to compare
     */
    function bundleSupplyChecks(uint256 _offersTotalQuantity, uint256 _twinId) internal view {
        // make sure twin exist and belong to the seller
        Twin storage twin = getValidTwin(_twinId);

        // twin is NonFungibleToken or bundle has an unlimited offer
        if (twin.tokenType == TokenType.NonFungibleToken || _offersTotalQuantity == type(uint256).max) {
            // the sum of all offers quantity should be less or equal twin supply
            if (_offersTotalQuantity > twin.supplyAvailable) revert InsufficientTwinSupplyToCoverBundleOffers();
        } else {
            // twin is FungibleToken or MultiToken
            // the sum of all offers quantity multiplied by twin amount should be less or equal twin supply
            if (_offersTotalQuantity * twin.amount > twin.supplyAvailable) {
                revert InsufficientTwinSupplyToCoverBundleOffers();
            }
        }
    }

    /**
     *
     * @notice Calculates bundled offers' total quantity available.
     * @param _previousTotal - previous offers' total quantity or initial value
     * @param _offerId - offer id to add to total quantity
     * @return offersTotalQuantity - previous offers' total quantity plus the current offer quantityAvailable
     */
    function calculateOffersTotalQuantity(
        uint256 _previousTotal,
        uint256 _offerId
    ) internal view returns (uint256 offersTotalQuantity) {
        // make sure all offers exist and belong to the seller
        Offer storage offer = getValidOfferWithSellerCheck(_offerId);

        // Unchecked because we're handling overflow below
        unchecked {
            // Calculate the bundle offers total quantity available.
            offersTotalQuantity = _previousTotal + offer.quantityAvailable;
        }

        // offersTotalQuantity should be max uint if overflow happens
        if (offersTotalQuantity < offer.quantityAvailable) {
            offersTotalQuantity = type(uint256).max;
        }
    }
}
