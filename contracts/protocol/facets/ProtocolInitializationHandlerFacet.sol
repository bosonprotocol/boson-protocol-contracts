// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;

import "../../domain/BosonConstants.sol";
import { IBosonProtocolInitializationHandler } from "../../interfaces/handlers/IBosonProtocolInitializationHandler.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { DisputeResolverHandlerFacet } from "./DisputeResolverHandlerFacet.sol";
import { TwinHandlerFacet } from "./TwinHandlerFacet.sol";
import { ProtocolBase } from "../bases/ProtocolBase.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";

/**
 * @title IBosonProtocolInitializationHandler
 *
 * @notice Handle initializion of new versions after 2.1.0.
 *
 */
contract ProtocolInitializationHandlerFacet is IBosonProtocolInitializationHandler, ProtocolBase {
    /**
     * @notice Initializes the protocol after the deployment.
     * This function is callable only once
     *
     * @param _version - version of the protocol
     */
    function initialize(bytes32 _version)
        public
        onlyUnInitialized(type(IBosonProtocolInitializationHandler).interfaceId)
    {
        bytes32 version = bytes32(bytes("2.2.0"));
        if (keccak256(abi.encodePacked(_version)) == keccak256(abi.encodePacked(version))) {
            initV2_2_0();
        }
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
