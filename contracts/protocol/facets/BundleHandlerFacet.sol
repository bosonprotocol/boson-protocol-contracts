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
     *
     * - seller does not match caller
     * - any of offers belongs to different seller
     * - any of offers does not exist
     * - offer exists in a different bundle
     * - any of twins belongs to different seller
     * - any of twins does not exist
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

        // TODO: check seller ID matches msg.sender

        // limit maximum number of offers to avoid running into block gas limit in a loop
        require(_bundle.offerIds.length <= protocolStorage().maxOffersPerGroup, TOO_MANY_OFFERS);

        // limit maximum number of twins to avoid running into block gas limit in a loop
        require(_bundle.twinIds.length <= protocolStorage().maxTwinsPerBundle, TOO_MANY_TWINS);

        // Get the next bundle and increment the counter
        uint256 bundleId = protocolCounters().nextBundleId++;

        for (uint i = 0; i < _bundle.offerIds.length; i++) {
            // make sure all offers exist and belong to the seller
            getValidOffer(_bundle.offerIds[i]);

            (bool bundleByOfferExists, ) = getBundleIdByOffer(_bundle.offerIds[i]);
            require(!bundleByOfferExists, OFFER_MUST_BE_UNIQUE);

            // Add to bundleByOffer mapping
            protocolStorage().bundleByOffer[_bundle.offerIds[i]] = bundleId;
        }

        for (uint i = 0; i < _bundle.twinIds.length; i++) {
            // make sure all twins exist and belong to the seller
            getValidTwin(_bundle.twinIds[i]);

            // A twin can belong to multiple bundles
            (bool bundlesForTwinExist, uint256[] memory bundles) = getBundleIdsByTwin(_bundle.twinIds[i]);
            if (bundlesForTwinExist) {
                for (uint j = 0; j < bundles.length; j++) {
                    require((bundles[j] != bundleId), TWIN_ALREADY_EXISTS_IN_SAME_BUNDLE);
                }
            }

            // Push to bundlesByTwin mapping
            protocolStorage().bundlesByTwin[_bundle.twinIds[i]].push(bundleId);
        }

        // Get storage location for bundle
        (,Bundle storage bundle) = fetchBundle(bundleId);

        // Set group props individually since memory structs can't be copied to storage
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
     * - Caller is not the seller (TODO)
     *
     *  @param _twinId - the id of the twin to check
     */
    function getValidTwin(uint256 _twinId) internal view returns (Twin storage twin){

        bool exists;
        Seller storage seller;

        // Get twin
        (exists, twin) = fetchTwin(_twinId);

        // Twin must already exist
        require(exists, NO_SUCH_TWIN);

        // Get seller, we assume seller exists if twin exists
        (,seller) = fetchSeller(twin.sellerId);

        // Caller must be seller's operator address
        //require(seller.operator == msg.sender, NOT_OPERATOR); // TODO add back when AccountHandler is working

    }

    /**
     * @notice Gets the details about a given bundle.
     *
     * @param _bundleId - the id of the bundle to check
     * @return exists - the bundle was found
     * @return bundle - the bundle details. See {BosonTypes.Bundle}
     */
    function getBundle(uint256 _bundleId)
    external
    view
    returns(bool exists, Bundle memory bundle) {
        return fetchBundle(_bundleId);
    }
}
