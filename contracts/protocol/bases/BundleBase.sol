// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IBosonBundleEvents } from "../../interfaces/events/IBosonBundleEvents.sol";
import { ProtocolBase } from "./../bases/ProtocolBase.sol";
import { ProtocolLib } from "./../libs/ProtocolLib.sol";

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
     *
     * @param _bundle - the fully populated struct with bundle id set to 0x0
     */
    function createBundleInternal(Bundle memory _bundle) internal {
        // get seller id, make sure it exists and store it to incoming struct
        (bool exists, uint256 sellerId) = getSellerIdByOperator(msg.sender);
        require(exists, NOT_OPERATOR);

        // limit maximum number of offers to avoid running into block gas limit in a loop
        require(_bundle.offerIds.length <= protocolLimits().maxOffersPerBundle, TOO_MANY_OFFERS);

        // limit maximum number of twins to avoid running into block gas limit in a loop
        require(_bundle.twinIds.length <= protocolLimits().maxTwinsPerBundle, TOO_MANY_TWINS);

        // Get the next bundle and increment the counter
        uint256 bundleId = protocolCounters().nextBundleId++;

        for (uint i = 0; i < _bundle.offerIds.length; i++) {
            // make sure all offers exist and belong to the seller
            getValidOffer(_bundle.offerIds[i]);

            (bool bundleByOfferExists, ) = fetchBundleIdByOffer(_bundle.offerIds[i]);
            require(!bundleByOfferExists, BUNDLE_OFFER_MUST_BE_UNIQUE);

            // make sure exchange does not already exist for this offer id.
            (bool exchangeIdsForOfferExists, ) = getExchangeIdsByOffer(_bundle.offerIds[i]);
            require(!exchangeIdsForOfferExists, EXCHANGE_FOR_OFFER_EXISTS);

            // Add to bundleIdByOffer mapping
            protocolLookups().bundleIdByOffer[_bundle.offerIds[i]] = bundleId;
        }

        for (uint i = 0; i < _bundle.twinIds.length; i++) {
            // make sure all twins exist and belong to the seller
            getValidTwin(_bundle.twinIds[i]);

            // A twin can belong to multiple bundles
            (bool bundlesForTwinExist, uint256[] memory bundleIds) = fetchBundleIdsByTwin(_bundle.twinIds[i]);
            if (bundlesForTwinExist) {
                for (uint j = 0; j < bundleIds.length; j++) {
                    require((bundleIds[j] != bundleId), TWIN_ALREADY_EXISTS_IN_SAME_BUNDLE);
                }
            }

            // Push to bundleIdsByTwin mapping
            protocolLookups().bundleIdsByTwin[_bundle.twinIds[i]].push(bundleId);
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
        (, uint256 sellerId) = getSellerIdByOperator(msg.sender);

        // Caller's seller id must match twin seller id
        require(sellerId == twin.sellerId, NOT_OPERATOR);
    }
}
