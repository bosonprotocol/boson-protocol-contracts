// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { IBosonTwinHandler } from "../../interfaces/handlers/IBosonTwinHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { TwinBase } from "../bases/TwinBase.sol";
import "../../domain/BosonConstants.sol";

/**
 * @title TwinHandlerFacet
 *
 * @notice Manages digital twinning associated with exchanges within the protocol
 */
contract TwinHandlerFacet is IBosonTwinHandler, TwinBase {
    /**
     * @notice Facet Initializer
     */
    function initialize() public onlyUnInitialized(type(IBosonTwinHandler).interfaceId) {
        DiamondLib.addSupportedInterface(type(IBosonTwinHandler).interfaceId);
    }

    /**
     * @notice Creates a Twin.
     *
     * Emits a TwinCreated event if successful.
     *
     * Reverts if:
     * - The twins region of protocol is paused
     * - seller does not exist
     * - Not approved to transfer the seller's token
     * - supplyAvailable is zero
     * - Twin is NonFungibleToken and amount was set
     * - Twin is NonFungibleToken and range is already being used in another twin of the seller
     * - Twin is FungibleToken or MultiToken and amount was not set
     *
     * @param _twin - the fully populated struct with twin id set to 0x0
     */
    function createTwin(Twin memory _twin) external override twinsNotPaused nonReentrant {
        createTwinInternal(_twin);
    }

    /**
     * @notice Removes the twin.
     *
     * Emits a TwinDeleted event if successful.
     *
     * Reverts if:
     * - The twins region of protocol is paused
     * - caller is not the seller.
     * - Twin does not exist.
     * - Bundle for twin exists
     *
     * @param _twinId - the id of the twin to check.
     */
    function removeTwin(uint256 _twinId) external override twinsNotPaused nonReentrant {
        // Get storage location for twin
        (bool exists, Twin memory twin) = fetchTwin(_twinId);
        require(exists, NO_SUCH_TWIN);

        // Get seller id
        (, uint256 sellerId) = getSellerIdByOperator(msgSender());
        // Caller's seller id must match twin seller id
        require(sellerId == twin.sellerId, NOT_OPERATOR);

        // Check if there are bundles for this twin
        (bool bundleForTwinExist, ) = fetchBundleIdByTwin(_twinId);
        require(!bundleForTwinExist, BUNDLE_FOR_TWIN_EXISTS);

        // delete struct
        delete protocolEntities().twins[_twinId];

        // Also remove from twinRangesBySeller mapping
        if (twin.tokenType == TokenType.NonFungibleToken) {
            TokenRange[] storage twinRanges = protocolLookups().twinRangesBySeller[sellerId][twin.tokenAddress];
            for (uint256 index = 0; index < twinRanges.length; index++) {
                if (twinRanges[index].start == twin.tokenId) {
                    twinRanges[index] = twinRanges[twinRanges.length - 1];
                    twinRanges.pop();
                    break;
                }
            }
        }

        // Notify watchers of state change
        emit TwinDeleted(_twinId, twin.sellerId, msgSender());
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
     * Does not increment the counter.
     *
     * @return nextTwinId - the next twin id
     */
    function getNextTwinId() public view override returns (uint256 nextTwinId) {
        nextTwinId = protocolCounters().nextTwinId;
    }
}
