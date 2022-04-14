// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { IBosonTwinHandler } from "../../interfaces/handlers/IBosonTwinHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { TwinBase } from "../bases/TwinBase.sol";

/**
 * @title TwinHandlerFacet
 *
 * @notice Manages digital twinning associated with exchanges within the protocol
 */
contract TwinHandlerFacet is IBosonTwinHandler, TwinBase {

    /**
     * @notice Facet Initializer
     */
    function initialize()
    public
    onlyUnInitialized(type(IBosonTwinHandler).interfaceId)
    {
        DiamondLib.addSupportedInterface(type(IBosonTwinHandler).interfaceId);
    }

    /**
     * @notice Creates a Twin.
     *
     * Emits a TwinCreated event if successful.
     *
     * Reverts if:
     * - seller does not exist
     * - Not approved to transfer the seller's token
     *
     * @param _twin - the fully populated struct with twin id set to 0x0
     */
    function createTwin(
        Twin memory _twin
    )
    external
    override
    {
        createTwinInternal(_twin);
    }

    /**
     * @notice Gets the details about a given twin.
     *
     * @param _twinId - the id of the twin to check
     * @return exists - the twin was found
     * @return twin - the twin details. See {BosonTypes.Twin}
     */
    function getTwin(uint256 _twinId)
    external
    view
    returns(bool exists, Twin memory twin) {
        return fetchTwin(_twinId);
    }

    /**
     * @notice Gets the next twin id.
     *
     * Does not increment the counter.
     *
     * @return nextTwinId - the next twin id
     */
    function getNextTwinId()
    public
    view
    returns(uint256 nextTwinId) {

        nextTwinId = protocolCounters().nextTwinId;

    }

    /**
     * @notice Removes the twin.
     *
     * Emits a TwinDeleted event if successful.
     *
     * Reverts if:
     * - caller is not the seller.
     * - Twin does not exist.
     * - Twin has bundles.
     *
     * @param _twinId - the id of the twin to check.
     */
    function removeTwin(uint256 _twinId) external {
        // Get storage location for twin
        (bool exists, Twin memory twin) = fetchTwin(_twinId);
        require(exists, NO_SUCH_TWIN);

        // Get seller id
        (, uint256 sellerId) = getSellerIdByOperator(msg.sender);
        // Caller's seller id must match twin seller id
        require(sellerId == twin.sellerId, NOT_OPERATOR);

        // Check if there are bundles for this twin
        (bool bundlesForTwinExist, ) = getBundleIdsByTwin(_twinId);
        require(!bundlesForTwinExist, BUNDLES_FOR_TWIN_EXISTS);

        // delete struct
        delete protocolStorage().twins[_twinId];

        emit TwinDeleted(_twinId, twin.sellerId);
    }
}
