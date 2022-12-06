// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;

import "../domain/BosonConstants.sol";
import { IBosonProtocolInitializationHandler } from "../interfaces/handlers/IBosonProtocolInitializationHandler.sol";
import { ProtocolLib } from "../protocol/libs/ProtocolLib.sol";
import { DisputeResolverHandlerFacet } from "../protocol/facets/DisputeResolverHandlerFacet.sol";
import { TwinHandlerFacet } from "../protocol/facets/TwinHandlerFacet.sol";
import { ProtocolBase } from "../protocol/bases/ProtocolBase.sol";
import { DiamondLib } from "../diamond/DiamondLib.sol";

/**
 * @title IBosonProtocolInitializationTestHandler
 *
 * @notice Mock changes to IBosonProtocolInitializationHandlerFacet.
 *
 */
contract ProtocolInitializationHandlerTestFacet is IBosonProtocolInitializationHandler, ProtocolBase {
    /**
     * @notice Modifier to protect initializer function from being invoked twice for a given version.
     */
    modifier onlyUnInitializedVersion(bytes32 _version) {
        ProtocolLib.ProtocolStatus storage ps = protocolStatus();
        require(!ps.initializedVersions[_version], ALREADY_INITIALIZED);
        ps.initializedVersions[_version] = true;
        _;
    }

    /**
     * @notice Initializes the protocol after the deployment.
     * This function is callable only once for each version
     *
     * @param _version - version of the protocol
     * @param _addresses - list of adresses to call calldata with non clashing interfaces
     * @param _calldata - list of calldata to send to corresponding addresses.
     *                    The order of the calldata must match the order of the addresses
     * @param _isUpgrade - flag to indicate whether this is first deployment or upgrade
     *
     */
    function initialize(
        bytes32 _version,
        address[] calldata _addresses,
        bytes[] calldata _calldata,
        bool _isUpgrade
    ) public onlyUnInitializedVersion(_version) {
        if (keccak256(abi.encodePacked(_version)) == keccak256(abi.encodePacked(bytes32(bytes("2.2.0"))))) {
            initV2_2_0();
        } else if (keccak256(abi.encodePacked(_version)) == keccak256(abi.encodePacked(bytes32(bytes("2.2.1"))))) {}
    }

    /**
     * @notice Initializes the version 2.2.0.
     *
     */
    function initV2_2_0() internal {
        ProtocolLib.ProtocolStatus storage status = protocolStatus();
        status.version = "2.2.0";

        DiamondLib.addSupportedInterface(type(IBosonProtocolInitializationHandler).interfaceId);

        emit ProtocolInitialized(status.version);
    }

    /**
     * @notice Gets the current protocol version.
     *
     */
    function getVersion() external view override returns (bytes32 version) {
        ProtocolLib.ProtocolStatus storage status = protocolStatus();
        version = status.version;
    }
}
