// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { IBosonTwinHandler } from "../../interfaces/handlers/IBosonTwinHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { TwinBase } from "../bases/TwinBase.sol";
import "../../domain/BosonConstants.sol";

/**
 * @title TwinHandlerFacet
 *
 * @notice Manages twin management requests and queries.
 */
contract TwinHandlerFacet is IBosonTwinHandler, TwinBase {
    /**
     * @notice Initializes facet.
     * This function is callable only once.
     */
    function initialize() public onlyUninitialized(type(IBosonTwinHandler).interfaceId) {
        DiamondLib.addSupportedInterface(type(IBosonTwinHandler).interfaceId);
    }

    /**
     * @notice Creates a Twin.
     *
     * Emits a TwinCreated event if successful.
     *
     * Reverts if:
     * - Seller does not exist
     * - Protocol is not approved to transfer the seller's token
     * - Twin supplyAvailable is zero
     * - Twin is NonFungibleToken and amount was set
     * - Twin is NonFungibleToken and end of range would overflow
     * - Twin is NonFungibleToken with unlimited supply and starting token id is too high
     * - Twin is NonFungibleToken and range is already being used in another twin of the seller
     * - Twin is FungibleToken or MultiToken and amount was not set
     * - Twin is FungibleToken or MultiToken and amount is greater than supply available
     *
     * @param _twin - the fully populated struct with twin id set to 0x0
     */
    function createTwin(Twin memory _twin) external override twinsNotPaused nonReentrant {
        createTwinInternal(_twin);
    }

    /**
     * @notice Removes a twin.
     *
     * Emits a TwinDeleted event if successful.
     *
     * Reverts if:
     * - The twins region of protocol is paused
     * - Caller is not the seller.
     * - Twin does not exist.
     * - Bundle for twin exists
     *
     * @param _twinId - the id of the twin to check
     */
    function removeTwin(uint256 _twinId) external override twinsNotPaused nonReentrant {
        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        // Get storage location for twin
        (bool exists, Twin memory twin) = fetchTwin(_twinId);
        if (!exists) revert NoSuchTwin();

        // Get message sender
        address sender = _msgSender();

        // Get seller id
        (, uint256 sellerId) = getSellerIdByAssistant(sender);
        // Caller's seller id must match twin seller id
        if (sellerId != twin.sellerId) revert NotAssistant();

        // Check if there are bundles for this twin
        (bool bundleForTwinExist, ) = fetchBundleIdByTwin(_twinId);
        if (bundleForTwinExist) revert BundleForTwinExists();

        // Delete struct
        delete protocolEntities().twins[_twinId];

        // Also remove from twinRangesBySeller mapping
        if (twin.tokenType == TokenType.NonFungibleToken) {
            TokenRange[] storage twinRanges = lookups.twinRangesBySeller[sellerId][twin.tokenAddress];
            uint256 lastIndex = twinRanges.length - 1;

            uint256 rangeIndex = lookups.rangeIdByTwin[_twinId] - 1;

            if (rangeIndex != lastIndex) {
                twinRanges[rangeIndex] = twinRanges[lastIndex];
                lookups.rangeIdByTwin[twinRanges[rangeIndex].twinId] = rangeIndex + 1;
            }

            // Remove last element
            twinRanges.pop();

            // Delete rangeIdByTwin mapping
            delete lookups.rangeIdByTwin[_twinId];
        }

        // Notify watchers of state change
        emit TwinDeleted(_twinId, twin.sellerId, sender);
    }

    /**
     * @notice Gets the details about a given twin.
     *
     * @param _twinId - the id of the twin to check
     * @return exists - the twin was found
     * @return twin - the twin details. See {BosonTypes.Twin}
     */
    function getTwin(uint256 _twinId) external view override returns (bool exists, Twin memory twin) {
        return fetchTwin(_twinId);
    }

    /**
     * @notice Gets the next twin id.
     *
     * @dev Does not increment the counter.
     *
     * @return nextTwinId - the next twin id
     */
    function getNextTwinId() public view override returns (uint256 nextTwinId) {
        nextTwinId = protocolCounters().nextTwinId;
    }
}
