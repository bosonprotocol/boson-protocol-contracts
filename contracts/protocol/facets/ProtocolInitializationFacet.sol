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
contract ProtocolInitializationFacet is IBosonProtocolInitializationHandler, ProtocolBase {
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
     * @param _calldata - list of calldata to send to corresponding addresses
     *                    _calldata order must match _addresses order
     * @param _isUpgrade - flag to indicate whether this is first deployment or upgrade
     *
     */
    function initialize(
        bytes32 _version,
        address[] calldata _addresses,
        bytes[] calldata _calldata,
        bool _isUpgrade
    ) public onlyUnInitializedVersion(_version) onlyRole(UPGRADER) {
        for (uint256 i = 0; i < _addresses.length; i++) {
            (bool success, bytes memory error) = _addresses[i].delegatecall(_calldata[i]);

            // Handle result
            if (!success) {
                if (error.length > 0) {
                    // bubble up the error
                    revert(string(error));
                } else {
                    revert(PROTOCOL_INITIALIZATION_FAILED);
                }
            }
        }

        ProtocolLib.ProtocolStatus storage status = protocolStatus();

        if (_isUpgrade) {
            if (keccak256(abi.encodePacked(_version)) == keccak256(abi.encodePacked(bytes32(bytes("2.2.0"))))) {
                initV2_2_0();
            }
        }

        DiamondLib.addSupportedInterface(type(IBosonProtocolInitializationHandler).interfaceId);

        status.version = _version;
        emit ProtocolInitialized(_version);
    }

    /**
     * @notice Initializes the version 2.2.0.
     *
     */
    function initV2_2_0() internal {}

    /**
     * @notice Gets the current protocol version.
     *
     */
    function getVersion() external view override returns (bytes32 version) {
        ProtocolLib.ProtocolStatus storage status = protocolStatus();
        version = status.version;
    }
}
