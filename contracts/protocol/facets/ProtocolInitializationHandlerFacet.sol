// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;

import "../../domain/BosonConstants.sol";
import { IBosonProtocolInitializationHandler } from "../../interfaces/handlers/IBosonProtocolInitializationHandler.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { DisputeResolverHandlerFacet } from "./DisputeResolverHandlerFacet.sol";
import { TwinHandlerFacet } from "./TwinHandlerFacet.sol";
import { ProtocolBase } from "../bases/ProtocolBase.sol";

contract ProtocolInitializationHandlerFacet is ProtocolBase, IBosonProtocolInitializationHandler {
    /**
     * @notice Initializes the protocol after the deployment.
     * This function is callable only once
     *
     * @param _version - version of the protocol
     */
    function initialize(string memory _version)
        external
        onlyUnInitialized(type(IBosonProtocolInitializationHandler).interfaceId)
    {
        string memory version = "2.2.0";
        if (keccak256(bytes(_version)) == keccak256(bytes(version))) {
            initV2_2_0();
        }
    }

    function initV2_2_0() internal {
        ProtocolLib.ProtocolStatus storage status = protocolStatus();
        status.version = "2.2.0";

        DisputeResolverHandlerFacet disputeResolverHandlerFacet = DisputeResolverHandlerFacet(address(this));
        disputeResolverHandlerFacet.initialize();

        TwinHandlerFacet twinHandlerFacet = TwinHandlerFacet(address(this));
        twinHandlerFacet.initialize();

        emit Initialized(status.version);
    }
}
