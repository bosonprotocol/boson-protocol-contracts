// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;

import "../../domain/BosonConstants.sol";
import { IBosonProtocolInitializationHandler } from "../../interfaces/handlers/IBosonProtocolInitializationHandler.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
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
     * @param _addresses - array of facet addresses to call initialize methods
     * @param _calldata -  array of facets initialize methods encoded as calldata
     *                    _calldata order must match _addresses order
     * @param _isUpgrade - flag to indicate whether this is first deployment or upgrade
     */
    function initialize(
        bytes32 _version,
        address[] calldata _addresses,
        bytes[] calldata _calldata,
        bool _isUpgrade,
        bytes4[] calldata interfacesToRemove,
        bytes4[] calldata interfacesToAdd
    ) external onlyUnInitializedVersion(_version) {
        require(_version != bytes32(0), VERSION_MUST_BE_SET);
        require(_addresses.length == _calldata.length, ADDRESSES_AND_CALLDATA_LENGTH_MISMATCH);

        // Delegate call to initialize methods of facets declared in _addresses
        for (uint256 i = 0; i < _addresses.length; i++) {
            (bool success, bytes memory error) = _addresses[i].delegatecall(_calldata[i]);

            // Handle result
            if (!success) {
                if (error.length > 0) {
                    // bubble up the error
                    revert(string(error));
                } else {
                    // Reverts with default message
                    revert(PROTOCOL_INITIALIZATION_FAILED);
                }
            }
        }

        if (_isUpgrade) {
            if (_version == bytes32("2.2.0")) {
                initV2_2_0();
            }
        }

        removeInterfaces(interfacesToRemove);
        addInterfaces(interfacesToAdd);

        ProtocolLib.ProtocolStatus storage status = protocolStatus();
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
    function getVersion() external view override returns (string memory version) {
        ProtocolLib.ProtocolStatus storage status = protocolStatus();
        version = string(abi.encodePacked(status.version));
    }

    function addInterfaces(bytes4[] calldata _interfaces) internal {
        for (uint256 i = 0; i < _interfaces.length; i++) {
            DiamondLib.addSupportedInterface(_interfaces[i]);
        }
    }

    function removeInterfaces(bytes4[] calldata _interfaces) internal {
        for (uint256 i = 0; i < _interfaces.length; i++) {
            DiamondLib.removeSupportedInterface(_interfaces[i]);
        }
    }
}
