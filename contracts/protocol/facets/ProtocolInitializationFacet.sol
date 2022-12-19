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
    modifier onlyUninitializedVersion(bytes32 _version) {
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
     * @param _initializationData - data for initialization of the protocol, using this facet
     * @param _addresses - array of facet addresses to call initialize methods
     * @param _calldata -  array of facets initialize methods encoded as calldata
     *                    _calldata order must match _addresses order
     * @param _isUpgrade - flag to indicate whether this is first deployment or upgrade
     * @param interfacesToRemove - array of interfaces to remove from the diamond
     * @param interfacesToAdd - array of interfaces to add to the diamond
     */
    function initialize(
        bytes32 _version,
        bytes calldata _initializationData,
        address[] calldata _addresses,
        bytes[] calldata _calldata,
        bool _isUpgrade,
        bytes4[] calldata interfacesToRemove,
        bytes4[] calldata interfacesToAdd
    ) external onlyUninitializedVersion(_version) {
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

        ProtocolLib.ProtocolStatus storage status = protocolStatus();
        if (_isUpgrade) {
            if (_version == bytes32("2.2.0")) {
                initV2_2_0(_initializationData);
            }
        }

        removeInterfaces(interfacesToRemove);
        addInterfaces(interfacesToAdd);

        status.version = _version;
        emit ProtocolInitialized(string(abi.encodePacked(_version)));
    }

    /**
     * @notice Initializes the version 2.2.0.
     *
     * V2.2.0 adds the limit for the number of preminted vouchers. Cannot be initialized with ConfigHandlerFacet.initialize since it would reset the counters.
     *
     * @param _initializationData - data representing uint256 _maxPremintedVouchers
     */
    function initV2_2_0(bytes calldata _initializationData) internal {
        // v2.2.0 can only be initialized if the current version does not exist yet
        require(protocolStatus().version == 0x0, WRONG_CURRENT_VERSION);

        // Initialize limits.maxPremintedVouchers (configHandlerFacet initializer)
        uint256 _maxPremintedVouchers = abi.decode(_initializationData, (uint256));
        require(_maxPremintedVouchers != 0, VALUE_ZERO_NOT_ALLOWED);
        protocolLimits().maxPremintedVouchers = _maxPremintedVouchers;
        emit MaxPremintedVouchersChanged(_maxPremintedVouchers, msgSender());
    }

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
