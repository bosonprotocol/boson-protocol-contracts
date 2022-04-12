// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { IBosonBundleHandler } from "../../interfaces/IBosonBundleHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { ProtocolBase } from "../ProtocolBase.sol";
import { ProtocolLib } from "../ProtocolLib.sol";

/**
 * @title BundleHandlerFacet
 *
 * @notice Manages bundling associated with offers and twins within the protocol
 */
contract BundleHandlerFacet is IBosonBundleHandler, ProtocolBase {

    /**
     * @notice Facet Initializer
     */
    function initialize()
    public
    onlyUnInitialized(type(IBosonBundleHandler).interfaceId)
    {
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
     *
     * @param _bundle - the fully populated struct with bundle id set to 0x0
     */
    function createBundle(
        Bundle memory _bundle
    )
    external
    override
    {
        // get seller id, make sure it exists and store it to incoming struct
        (bool exists, uint256 sellerId) = getSellerIdByOperator(msg.sender);
        require(exists, NOT_OPERATOR);
        _bundle.sellerId = sellerId;

        // limit maximum number of offers to avoid running into block gas limit in a loop
        require(_bundle.offerIds.length <= protocolStorage().maxOffersPerBundle, TOO_MANY_OFFERS);

        // limit maximum number of twins to avoid running into block gas limit in a loop
        require(_bundle.twinIds.length <= protocolStorage().maxTwinsPerBundle, TOO_MANY_TWINS);

        // Get the next bundle and increment the counter
        uint256 bundleId = protocolCounters().nextBundleId++;

        for (uint i = 0; i < _bundle.offerIds.length; i++) {
            // make sure all offers exist and belong to the seller
            getValidOffer(_bundle.offerIds[i]);

            (bool bundleByOfferExists, ) = getBundleIdByOffer(_bundle.offerIds[i]);
            require(!bundleByOfferExists, OFFER_MUST_BE_UNIQUE);

            // Add to bundleIdByOffer mapping
            protocolStorage().bundleIdByOffer[_bundle.offerIds[i]] = bundleId;
        }

        for (uint i = 0; i < _bundle.twinIds.length; i++) {
            // make sure all twins exist and belong to the seller
            getValidTwin(_bundle.twinIds[i]);

            // A twin can belong to multiple bundles
            (bool bundlesForTwinExist, uint256[] memory bundleIds) = getBundleIdsByTwin(_bundle.twinIds[i]);
            if (bundlesForTwinExist) {
                for (uint j = 0; j < bundleIds.length; j++) {
                    require((bundleIds[j] != bundleId), TWIN_ALREADY_EXISTS_IN_SAME_BUNDLE);
                }
            }

            // Push to bundleIdsByTwin mapping
            protocolStorage().bundleIdsByTwin[_bundle.twinIds[i]].push(bundleId);
        }

        // Get storage location for bundle
        (, Bundle storage bundle) = fetchBundle(bundleId);

        // Set bundle props individually since memory structs can't be copied to storage
        bundle.id = bundleId;
        bundle.sellerId = _bundle.sellerId;
        bundle.offerIds = _bundle.offerIds;
        bundle.twinIds = _bundle.twinIds;

        // modify incoming struct so event value represents true state
        _bundle.id = bundleId;

        // Notify watchers of state change
        emit BundleCreated(bundleId, _bundle.sellerId, _bundle);
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
    function getValidTwin(uint256 _twinId) internal view returns (Twin storage twin){
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

    /**
     * @notice Gets the details about a given bundle.
     *
     * @param _bundleId - the id of the bundle to check
     * @return exists - the bundle was found
     * @return bundle - the bundle details. See {BosonTypes.Bundle}
     */
    function getBundle(uint256 _bundleId) external view returns(bool exists, Bundle memory bundle) {
        return fetchBundle(_bundleId);
    }

    /**
     * @notice Gets the next bundle id.
     *
     * Does not increment the counter.
     *
     * @return nextBundleId - the next bundle id
     */
    function getNextBundleId() public view returns(uint256 nextBundleId) {
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
     *
     * @param _bundleId  - the id of the bundle to be updated
     * @param _twinIds - array of twin ids to be added to the bundle
     */
    function addTwinsToBundle(
        uint256 _bundleId,
        uint256[] calldata _twinIds
    )
    external
    override
    {
        // check if bundle can be updated
        (uint256 sellerId, Bundle storage bundle) = preBundleUpdateChecks(_bundleId, _twinIds);

        for (uint i = 0; i < _twinIds.length; i++) {
            uint twinId = _twinIds[i];
            // make sure twin exist and belong to the seller
            getValidTwin(twinId);

            // Twin can already be associated with a different bundle, but it cannot be added to the same bundle twice.
            (bool bundlesForTwinExist, uint256[] memory bundleIds) = getBundleIdsByTwin(twinId);
            if (bundlesForTwinExist) {
                for (uint j = 0; j < bundleIds.length; j++) {
                    // Revert if bundleId already exists in the bundleIdsByTwin mapping
                    require((bundleIds[j] != _bundleId), TWIN_ALREADY_EXISTS_IN_SAME_BUNDLE);
                }
            }

            // add to bundleIdsByTwin mapping
            protocolStorage().bundleIdsByTwin[twinId].push(_bundleId);

            // add to bundle struct
            bundle.twinIds.push(twinId);
        }

        // Notify watchers of state change
        emit BundleUpdated(_bundleId, sellerId, bundle);
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
    function removeTwinsFromBundle(
        uint256 _bundleId,
        uint256[] calldata _twinIds
    )
    external
    override
    {
        // check if bundle can be updated
        (uint256 sellerId, Bundle storage bundle) = preBundleUpdateChecks(_bundleId, _twinIds);

        for (uint i = 0; i < _twinIds.length; i++) {
            uint twinId = _twinIds[i];

            // Get all bundleIds that are associated to this Twin.
            (bool bundlesForTwinExist, uint256[] memory bundleIds) = getBundleIdsByTwin(twinId);

            // Revert here if no bundles found
            require(bundlesForTwinExist, TWIN_NOT_IN_BUNDLE);

            // remove bundleId from the bundleIdsByTwin mapping
            bool foundMatchingBundle;
            for (uint j = 0; j < bundleIds.length; j++) {
                if (bundleIds[j] == _bundleId) {
                    foundMatchingBundle = true;
                    protocolStorage().bundleIdsByTwin[twinId][j] = bundleIds[bundleIds.length - 1];
                    protocolStorage().bundleIdsByTwin[twinId].pop();
                    break;
                }
            }
            require(foundMatchingBundle, TWIN_NOT_IN_BUNDLE);

            // Also remove from the bundle struct
            uint256 twinIdsLength = bundle.twinIds.length;
            for (uint j = 0; j < twinIdsLength; j++) {
                if (bundle.twinIds[j] == twinId) {
                    bundle.twinIds[j] = bundle.twinIds[twinIdsLength - 1];
                    bundle.twinIds.pop();
                    break;
                }
            }
        }

        // Notify watchers of state change
        emit BundleUpdated(_bundleId, sellerId, bundle);
    }

    /**
     * @dev Before performing an update, make sure update can be done
     * and return seller id and bundle storage pointer for further use.
     *
     * Reverts if:
     * - caller is not the seller
     * - twin ids is an empty list
     * - number of twins exceeds maximum allowed number per bundle
     * - bundle does not exist
     *
     * @param _bundleId  - the id of the bundle to be updated
     * @param _twinIds - array of twin ids to be removed to the bundle
     * @return sellerId  - the seller Id
     * @return bundle - the bundle details
     */
    function preBundleUpdateChecks(uint256 _bundleId, uint256[] calldata _twinIds) internal view returns (uint256 sellerId, Bundle storage bundle) {
        // make sure that at least something will be updated
        require(_twinIds.length != 0, NOTHING_UPDATED);

        // limit maximum number of twins to avoid running into block gas limit in a loop
        require(_twinIds.length <= protocolStorage().maxTwinsPerBundle, TOO_MANY_TWINS);

        // Get storage location for bundle
        bool exists;
        (exists, bundle) = fetchBundle(_bundleId);
        require(exists, NO_SUCH_BUNDLE);

        // Get seller id, we assume seller id exists if bundle exists
        (, sellerId) = getSellerIdByOperator(msg.sender);

        // Caller's seller id must match bundle seller id
        require(sellerId == bundle.sellerId, NOT_OPERATOR);
    }
}
