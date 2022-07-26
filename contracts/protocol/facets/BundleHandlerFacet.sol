// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../../domain/BosonConstants.sol";
import { IBosonBundleHandler } from "../../interfaces/handlers/IBosonBundleHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { BundleBase } from "../bases/BundleBase.sol";

/**
 * @title BundleHandlerFacet
 *
 * @notice Manages bundling associated with offers and twins within the protocol
 */
contract BundleHandlerFacet is IBosonBundleHandler, BundleBase {
    enum BundleUpdateAttribute {
        TWIN,
        OFFER
    }

    /**
     * @notice Facet Initializer
     */
    function initialize() public onlyUnInitialized(type(IBosonBundleHandler).interfaceId) {
        DiamondLib.addSupportedInterface(type(IBosonBundleHandler).interfaceId);
    }

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
     * - offers total quantity is greater than twin supply when token is nonfungible
     * - offers total quantity multiplied by twin amount is greater than twin supply when token is fungible or multitoken
     *
     * @param _bundle - the fully populated struct with bundle id set to 0x0
     */
    function createBundle(Bundle memory _bundle) external override {
        createBundleInternal(_bundle);
    }

    /**
     * @notice Gets the details about a given bundle.
     *
     * @param _bundleId - the id of the bundle to check
     * @return exists - the bundle was found
     * @return bundle - the bundle details. See {BosonTypes.Bundle}
     */
    function getBundle(uint256 _bundleId) external view override returns (bool exists, Bundle memory bundle) {
        return fetchBundle(_bundleId);
    }

    /**
     * @notice Gets the next bundle id.
     *
     * Does not increment the counter.
     *
     * @return nextBundleId - the next bundle id
     */
    function getNextBundleId() public view override returns (uint256 nextBundleId) {
        nextBundleId = protocolCounters().nextBundleId;
    }

    /**
     * @notice Adds twins to an existing bundle
     *
     * Emits a BundleUpdated event if successful.
     *
     * Reverts if:
     * - caller is not the seller
     * - twin ids is an empty list
     * - number of twins exceeds maximum allowed number per bundle
     * - bundle does not exist
     * - any of twins belongs to different seller
     * - any of twins does not exist
     * - twin already exists in the same bundle
     * - twin ids contains duplicated twins
     * - offers total quantity is greater than twin supply when token is nonfungible
     * - offers total quantity multiplied by twin amount is greater than twin supply when token is fungible or multitoken
     *
     * @param _bundleId  - the id of the bundle to be updated
     * @param _twinIds - array of twin ids to be added to the bundle
     */
    function addTwinsToBundle(uint256 _bundleId, uint256[] calldata _twinIds) external override {
        // check if bundle can be updated
        (uint256 sellerId, Bundle storage bundle) = preBundleUpdateChecks(
            _bundleId,
            _twinIds,
            BundleUpdateAttribute.TWIN
        );

        // Sum of offers quantity available
        uint256 offersTotalQuantityAvailable;

        // Calculate bundle offers total quantity available.
        for (uint256 i = 0; i < bundle.offerIds.length; i++) {
            offersTotalQuantityAvailable = calculateOffersTotalQuantity(
                offersTotalQuantityAvailable,
                bundle.offerIds[i]
            );
        }

        for (uint256 i = 0; i < _twinIds.length; i++) {
            uint256 twinId = _twinIds[i];
            // Twin cannot be associated with a different bundle
            (bool bundleForTwinExist, ) = fetchBundleIdByTwin(twinId);
            require(!bundleForTwinExist, BUNDLE_TWIN_MUST_BE_UNIQUE);

            if (bundle.offerIds.length > 0) {
                bundleSupplyChecks(offersTotalQuantityAvailable, twinId);
            }

            // add to bundleIdByTwin mapping
            protocolLookups().bundleIdByTwin[twinId] = _bundleId;

            // add to bundle struct
            bundle.twinIds.push(twinId);
        }

        // Notify watchers of state change
        emit BundleUpdated(_bundleId, sellerId, bundle, msgSender());
    }

    /**
     * @notice Removes twins from an existing bundle
     *
     * Emits a BundleUpdated event if successful.
     *
     * Reverts if:
     * - caller is not the seller
     * - twin ids is an empty list
     * - number of twins exceeds maximum allowed number per bundle
     * - bundle does not exist
     * - any twin is not part of the bundle
     *
     * @param _bundleId  - the id of the bundle to be updated
     * @param _twinIds - array of twin ids to be removed to the bundle
     */
    function removeTwinsFromBundle(uint256 _bundleId, uint256[] calldata _twinIds) external override {
        // check if bundle can be updated
        (uint256 sellerId, Bundle storage bundle) = preBundleUpdateChecks(
            _bundleId,
            _twinIds,
            BundleUpdateAttribute.TWIN
        );

        for (uint256 i = 0; i < _twinIds.length; i++) {
            uint256 twinId = _twinIds[i];

            // Get the bundle associated to this Twin.
            (bool bundleForTwinExist, uint256 bundleId) = fetchBundleIdByTwin(twinId);
            require(bundleForTwinExist && bundleId == _bundleId, TWIN_NOT_IN_BUNDLE);

            // remove bundleId from the bundleIdByTwin mapping
            delete protocolLookups().bundleIdByTwin[twinId];

            // Also remove from the bundle struct
            uint256 twinIdsLength = bundle.twinIds.length;
            for (uint256 j = 0; j < twinIdsLength; j++) {
                if (bundle.twinIds[j] == twinId) {
                    bundle.twinIds[j] = bundle.twinIds[twinIdsLength - 1];
                    bundle.twinIds.pop();
                    break;
                }
            }
        }

        // Notify watchers of state change
        emit BundleUpdated(_bundleId, sellerId, bundle, msgSender());
    }

    /**
     * @dev Before performing an update, make sure update can be done
     * and return seller id and bundle storage pointer for further use.
     *
     * Reverts if:
     * - caller is not the seller
     * - twin ids / offer ids is an empty list.
     * - number of twins / number of offers exceeds maximum allowed number per bundle
     * - bundle does not exist
     *
     * @param _bundleId  - the id of the bundle to be updated
     * @param _ids - array of twin ids / offer ids to be added to / removed from the bundle.
     * @param _attribute attribute, one of {TWIN, OFFER}
     * @return sellerId  - the seller Id
     * @return bundle - the bundle details
     */
    function preBundleUpdateChecks(
        uint256 _bundleId,
        uint256[] calldata _ids,
        BundleUpdateAttribute _attribute
    ) internal view returns (uint256 sellerId, Bundle storage bundle) {
        // make sure that at least something will be updated
        require(_ids.length != 0, NOTHING_UPDATED);

        if (_attribute == BundleUpdateAttribute.TWIN) {
            // limit maximum number of twins to avoid running into block gas limit in a loop
            require(_ids.length <= protocolLimits().maxTwinsPerBundle, TOO_MANY_TWINS);
        } else if (_attribute == BundleUpdateAttribute.OFFER) {
            // limit maximum number of offers to avoid running into block gas limit in a loop
            require(_ids.length <= protocolLimits().maxOffersPerBundle, TOO_MANY_OFFERS);
        }

        // Get storage location for bundle
        bool exists;
        (exists, bundle) = fetchBundle(_bundleId);
        require(exists, NO_SUCH_BUNDLE);

        // Get seller id, we assume seller id exists if bundle exists
        (, sellerId) = getSellerIdByOperator(msgSender());

        // Caller's seller id must match bundle seller id
        require(sellerId == bundle.sellerId, NOT_OPERATOR);
    }

    /**
     * @notice Adds offers to an existing bundle
     *
     * Emits a BundleUpdated event if successful.
     *
     * Reverts if:
     * - caller is not the seller
     * - offer ids is an empty list
     * - number of offers exceeds maximum allowed number per bundle
     * - bundle does not exist
     * - any of offers belongs to different seller
     * - any of offers does not exist
     * - offer exists in a different bundle
     * - offer ids contains duplicated offers
     * - exchange already exists for the offer id in bundle
     *
     * @param _bundleId  - the id of the bundle to be updated
     * @param _offerIds - array of offer ids to be added to the bundle
     */
    function addOffersToBundle(uint256 _bundleId, uint256[] calldata _offerIds) external override {
        // check if bundle can be updated
        (uint256 sellerId, Bundle storage bundle) = preBundleUpdateChecks(
            _bundleId,
            _offerIds,
            BundleUpdateAttribute.OFFER
        );

        uint256 offersTotalQuantityAvailable;

        for (uint256 i = 0; i < _offerIds.length; i++) {
            uint256 offerId = _offerIds[i];

            // Calculate bundle offers total quantity available.
            offersTotalQuantityAvailable = calculateOffersTotalQuantity(offersTotalQuantityAvailable, offerId);

            // make sure exchange does not already exist for this offer id.
            (bool exchangeIdsForOfferExists, ) = getExchangeIdsByOffer(offerId);
            require(!exchangeIdsForOfferExists, EXCHANGE_FOR_OFFER_EXISTS);

            // Offer should not belong to another bundle already
            (bool exists, ) = fetchBundleIdByOffer(offerId);
            require(!exists, BUNDLE_OFFER_MUST_BE_UNIQUE);

            // add to bundleIdByOffer mapping
            protocolLookups().bundleIdByOffer[offerId] = _bundleId;

            // add to bundle struct
            bundle.offerIds.push(offerId);
        }

        for (uint256 i = 0; i < bundle.twinIds.length; i++) {
            bundleSupplyChecks(offersTotalQuantityAvailable, bundle.twinIds[i]);
        }

        // Notify watchers of state change
        emit BundleUpdated(_bundleId, sellerId, bundle, msgSender());
    }

    /**
     * @notice Removes offers from an existing bundle
     *
     * Emits a BundleUpdated event if successful.
     *
     * Reverts if:
     * - caller is not the seller
     * - offer ids is an empty list
     * - number of offers exceeds maximum allowed number per bundle
     * - bundle does not exist
     * - any offer is not part of the bundle
     * - exchange already exists for the offer id in bundle
     *
     * @param _bundleId  - the id of the bundle to be updated
     * @param _offerIds - array of offer ids to be removed to the bundle
     */
    function removeOffersFromBundle(uint256 _bundleId, uint256[] calldata _offerIds) external override {
        // check if bundle can be updated
        (uint256 sellerId, Bundle storage bundle) = preBundleUpdateChecks(
            _bundleId,
            _offerIds,
            BundleUpdateAttribute.OFFER
        );

        for (uint256 i = 0; i < _offerIds.length; i++) {
            uint256 offerId = _offerIds[i];

            // Offer should belong to the bundle
            (, uint256 bundleId) = fetchBundleIdByOffer(offerId);
            require(_bundleId == bundleId, OFFER_NOT_IN_BUNDLE);

            // make sure exchange does not already exist for this offer id.
            (bool exchangeIdsForOfferExists, ) = getExchangeIdsByOffer(offerId);
            require(!exchangeIdsForOfferExists, EXCHANGE_FOR_OFFER_EXISTS);

            // remove bundleIdByOffer mapping
            delete protocolLookups().bundleIdByOffer[offerId];

            // remove from the bundle struct
            uint256 offerIdsLength = bundle.offerIds.length;

            for (uint256 j = 0; j < offerIdsLength; j++) {
                if (bundle.offerIds[j] == offerId) {
                    bundle.offerIds[j] = bundle.offerIds[offerIdsLength - 1];
                    bundle.offerIds.pop();
                    break;
                }
            }
        }

        // Notify watchers of state change
        emit BundleUpdated(_bundleId, sellerId, bundle, msgSender());
    }

    /**
     * @notice Removes the bundle.
     *
     * Emits a BundleDeleted event if successful.
     *
     * Reverts if:
     * - caller is not the seller.
     * - Bundle does not exist.
     * - exchanges exists for bundled offers.
     *
     * @param _bundleId - the id of the bundle to check.
     */
    function removeBundle(uint256 _bundleId) external override {
        // Get storage location for bundle
        (bool exists, Bundle memory bundle) = fetchBundle(_bundleId);
        require(exists, NO_SUCH_BUNDLE);

        // Get seller id
        (, uint256 sellerId) = getSellerIdByOperator(msgSender());
        // Caller's seller id must match bundle seller id
        require(sellerId == bundle.sellerId, NOT_OPERATOR);

        // Check if offers from the bundle have any exchanges
        bundledOffersExchangeCheck(_bundleId);

        // delete from bundleIdByOffer mapping
        uint256[] memory offerIds = bundle.offerIds;
        for (uint256 i = 0; i < offerIds.length; i++) {
            delete protocolLookups().bundleIdByOffer[offerIds[i]];
        }

        // delete from bundleIdByTwin mapping
        uint256[] memory twinIds = bundle.twinIds;

        // loop over all the twins in the bundle
        for (uint256 j = 0; j < twinIds.length; j++) {
            delete protocolLookups().bundleIdByTwin[twinIds[j]];
        }

        // delete from bundles mapping
        delete protocolEntities().bundles[_bundleId];

        emit BundleDeleted(_bundleId, bundle.sellerId, msgSender());
    }

    /**
     * @notice Checks if exchanges for bundled offers exists.
     *
     * Reverts if:
     * - exchange Ids for an offer exists.
     *
     * @param _bundleId - the bundle Id.
     */
    function bundledOffersExchangeCheck(uint256 _bundleId) internal view {
        // Get storage location for bundle
        (, Bundle storage bundle) = fetchBundle(_bundleId);

        // Get the offer Ids in the bundle
        uint256[] memory offerIds = bundle.offerIds;

        for (uint256 i = 0; i < offerIds.length; i++) {
            (bool exchangeIdsForOfferExists, ) = getExchangeIdsByOffer(offerIds[i]);
            require(!exchangeIdsForOfferExists, EXCHANGE_FOR_BUNDLED_OFFERS_EXISTS);
        }
    }

    /**
     * @notice Gets the bundle id for a given offer id.
     *
     * @param _offerId - the offer Id.
     * @return exists - whether the bundle Id exists
     * @return bundleId  - the bundle Id.
     */
    function getBundleIdByOffer(uint256 _offerId) external view override returns (bool exists, uint256 bundleId) {
        return fetchBundleIdByOffer(_offerId);
    }

    /**
     * @notice Gets the bundle id for a given twin id.
     *
     * @param _twinId - the twin Id.
     * @return exists - whether the bundle Id exist
     * @return bundleId  - the bundle Id.
     */
    function getBundleIdByTwin(uint256 _twinId) external view override returns (bool exists, uint256 bundleId) {
        return fetchBundleIdByTwin(_twinId);
    }
}
