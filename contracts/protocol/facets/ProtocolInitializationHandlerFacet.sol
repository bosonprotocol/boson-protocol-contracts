// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import "../../domain/BosonConstants.sol";
import { IBosonProtocolInitializationHandler } from "../../interfaces/handlers/IBosonProtocolInitializationHandler.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { ProtocolBase } from "../bases/ProtocolBase.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { BeaconClientProxy } from "../../protocol/clients/proxy/BeaconClientProxy.sol";

/**
 * @title BosonProtocolInitializationHandler
 *
 * @notice Handle initializion of new versions after 2.1.0.
 *
 */
contract ProtocolInitializationHandlerFacet is IBosonProtocolInitializationHandler, ProtocolBase {
    address private immutable thisAddress; // used to prevent invocation of initialize directly on deployed contract. Variable is not used by the protocol.

    /**
     * @notice Modifier to protect initializer function from being invoked twice for a given version.
     */
    modifier onlyUninitializedVersion(bytes32 _version) {
        ProtocolLib.ProtocolStatus storage ps = protocolStatus();
        if (ps.initializedVersions[_version]) revert AlreadyInitialized();
        ps.initializedVersions[_version] = true;
        _;
    }

    /**
     * @notice Constructor
     *
     * @dev This constructor is used to prevent invocation of initialize directly on deployed contract.
     */
    constructor() {
        thisAddress = address(this);
    }

    /**
     * @notice Initializes the protocol after the deployment.
     * This function is callable only once for each version
     *
     * Reverts if:
     * - Is invoked directly on the deployed contract (not via proxy)
     * - Version is not set
     * - Length of _addresses and _calldata arrays do not match
     * - Any of delegate calls to _addresses reverts
     * - For upgrade to v2.2.0:
     *   - If versions is set already
     *   - If _initializationData cannot be decoded to uin256
     *   - If _initializationData is represents value
     *
     * @param _version - version of the protocol
     * @param _addresses - array of facet addresses to call initialize methods
     * @param _calldata -  array of facets initialize methods encoded as calldata
     *                    _calldata order must match _addresses order
     * @param _isUpgrade - flag to indicate whether this is first deployment or upgrade
     * @param _initializationData - data for initialization of the protocol, using this facet (only if _isUpgrade == true)
     * @param _interfacesToRemove - array of interfaces to remove from the diamond
     * @param _interfacesToAdd - array of interfaces to add to the diamond
     */
    function initialize(
        bytes32 _version,
        address[] calldata _addresses,
        bytes[] calldata _calldata,
        bool _isUpgrade,
        bytes calldata _initializationData,
        bytes4[] calldata _interfacesToRemove,
        bytes4[] calldata _interfacesToAdd
    ) external onlyUninitializedVersion(_version) {
        if (address(this) == thisAddress) revert DirectInitializationNotAllowed();
        if (_version == bytes32(0)) revert VersionMustBeSet();
        if (_addresses.length != _calldata.length) revert AddressesAndCalldataLengthMismatch();

        // Delegate call to initialize methods of facets declared in _addresses
        for (uint256 i = 0; i < _addresses.length; ) {
            (bool success, bytes memory error) = _addresses[i].delegatecall(_calldata[i]);

            // Handle result
            if (!success) {
                if (error.length > 0) {
                    // bubble up the error
                    assembly {
                        revert(add(32, error), mload(error))
                    }
                } else {
                    // Reverts with default message
                    revert ProtocolInitializationFailed();
                }
            }

            unchecked {
                i++;
            }
        }

        ProtocolLib.ProtocolStatus storage status = protocolStatus();
        if (_isUpgrade) {
            if (_version == bytes32("2.2.0")) {
                initV2_2_0(_initializationData);
            } else if (_version == bytes32("2.2.1")) {
                initV2_2_1();
            } else if (_version == bytes32("2.3.0")) {
                initV2_3_0(_initializationData);
            }
        }

        removeInterfaces(_interfacesToRemove);
        addInterfaces(_interfacesToAdd);

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
        if (protocolStatus().version != bytes32(0)) revert WrongCurrentVersion();

        // Initialize limits.maxPremintedVouchers (configHandlerFacet initializer)
        uint256 _maxPremintedVouchers = abi.decode(_initializationData, (uint256));
        if (_maxPremintedVouchers == 0) revert ValueZeroNotAllowed();
        protocolLimits().maxPremintedVouchers = _maxPremintedVouchers;
        emit MaxPremintedVouchersChanged(_maxPremintedVouchers, msgSender());
    }

    /**
     * @notice Initializes the version 2.2.0.
     */
    function initV2_2_1() internal view {
        // Current version must be 2.2.0
        if (protocolStatus().version != bytes32("2.2.0")) revert WrongCurrentVersion();
    }

    /**
     * @notice Initializes the version 2.3.0.
     *
     * V2.3.0 adds the minimal resolution period. Cannot be initialized with ConfigHandlerFacet.initialize since it would reset the counters.
     *
     * Reverts if:
     *  - Current version is not 2.2.1
     *  - There are already twins. This version adds a new mapping for twins which make it incompatible with previous versions.
     *  - minResolutionPeriod is not present in _initializationData parameter
     *  - if minResolutionPeriod is greater than maxResolutionPeriod
     *
     * @param _initializationData - data representing uint256 _minResolutionPeriod
     */
    function initV2_3_0(bytes calldata _initializationData) internal {
        // Current version must be 2.2.1
        if (protocolStatus().version != bytes32("2.2.1")) revert WrongCurrentVersion();

        if (protocolCounters().nextTwinId != 1) revert TwinsAlreadyExist();

        // Decode initialization data
        uint256 _minResolutionPeriod = abi.decode(_initializationData, (uint256));

        // cache protocol limits
        ProtocolLib.ProtocolLimits storage limits = protocolLimits();

        // make sure _minResolutionPeriod is less than maxResolutionPeriod
        if (limits.maxResolutionPeriod < _minResolutionPeriod) revert InvalidResolutionPeriod();

        // Initialize limits.maxPremintedVouchers (configHandlerFacet initializer)
        if (_minResolutionPeriod == 0) revert ValueZeroNotAllowed();
        limits.minResolutionPeriod = _minResolutionPeriod;
        emit MinResolutionPeriodChanged(_minResolutionPeriod, msgSender());

        // Deploy a new voucher proxy
        protocolAddresses().beaconProxy = address(new BeaconClientProxy{ salt: VOUCHER_PROXY_SALT }());
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
        for (uint256 i = 0; i < _interfaces.length; ) {
            DiamondLib.addSupportedInterface(_interfaces[i]);

            unchecked {
                i++;
            }
        }
    }

    function removeInterfaces(bytes4[] calldata _interfaces) internal {
        for (uint256 i = 0; i < _interfaces.length; ) {
            DiamondLib.removeSupportedInterface(_interfaces[i]);

            unchecked {
                i++;
            }
        }
    }
}
