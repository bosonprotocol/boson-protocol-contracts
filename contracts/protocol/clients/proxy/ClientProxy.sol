// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IAccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/IAccessControlUpgradeable.sol";
import { IBosonVoucherBeacon } from "../../../interfaces/clients/IBosonVoucherBeacon.sol";
import { IBosonConfigHandler } from "../../../interfaces/handlers/IBosonConfigHandler.sol";
import { BosonConstants } from "../../../domain/BosonConstants.sol";
import { ClientLib } from "../../libs/ClientLib.sol";
import { EIP712Lib } from "../../libs/EIP712Lib.sol";
import { Proxy } from "./Proxy.sol";
import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

/**
 * @title ClientProxy
 *
 * @notice Delegates calls to a Boson Protocol Client implementation contract,
 * such that functions on it execute in the context (address, storage)
 * of this proxy, allowing the implementation contract to be upgraded
 * without losing the accumulated state data.
 *
 * Protocol clients are the contracts in the system that communicate with
 * the facets of the ProtocolDiamond rather than acting as facets themselves.
 *
 * Each Protocol client contract will be deployed behind its own proxy for
 * future upgradability.
 */
contract ClientProxy is Proxy, Initializable {
        /**
     * @dev The storage slot of the UpgradeableBeacon contract which defines the implementation for this proxy.
     * This is bytes32(uint256(keccak256('eip1967.proxy.beacon')) - 1)) and is validated in the constructor.
     */
    bytes32 internal constant _BEACON_SLOT = 0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50;


    struct AddressSlot {
        address value;
    }

    /**
     * @dev Returns an `AddressSlot` with member `value` located at `slot`.
     */
    function getBeaconSlot() internal pure returns (AddressSlot storage r) {
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _BEACON_SLOT
        }
    }

    function initialize(address _beaconAddress, IAccessControlUpgradeable accessController, address protocolAddress) external initializer() {
        // todo make initializable
        _setBeacon(_beaconAddress);

        // Get the ProxyStorage struct
        ClientLib.ProxyStorage storage ps = ClientLib.proxyStorage();

        // Store the AccessController address
        ps.accessController = accessController;

        // Store the Protocol Diamond address
        ps.protocolDiamond = protocolAddress;
    }

    function _beforeFallback() internal override {
        // store in storage

       IAccessControlUpgradeable accessController = IBosonVoucherBeacon(_beacon()).getAccessController();
       address protocolAddress =  IBosonVoucherBeacon(_beacon()).getProtocolAddress();

        // Get the ProxyStorage struct
        ClientLib.ProxyStorage storage ps = ClientLib.proxyStorage();

        // Store the AccessController address
        ps.accessController = accessController;

        // Store the Protocol Diamond address
        ps.protocolDiamond = protocolAddress;

    }

    // /**
    //  * @dev Modifier that checks that the caller has a specific role.
    //  *
    //  * Reverts if caller doesn't have role.
    //  *
    //  * See: {AccessController.hasRole}
    //  */
    // modifier onlyRole(bytes32 role) {
    //     require(ClientLib.hasRole(role), "Access denied, caller doesn't have role");
    //     _;
    // }

    // function init(
    //     address _accessController,
    //     address _protocolAddress,
    //     address _impl
    // ) external payable {

    //     // Get the ProxyStorage struct
    //     ClientLib.ProxyStorage storage ps = ClientLib.proxyStorage();

    //     // Store the AccessController address
    //     ps.accessController = IAccessControlUpgradeable(_accessController);

    //     // Store the Protocol Diamond address
    //     ps.protocolDiamond = _protocolAddress;

    //     // Store the implementation address
    //     ps.implementation = _impl;

    // }

    /**
     * @dev Returns the address to which the fallback function
     * and {_fallback} should delegate.
     */
    function _implementation()
    internal
    view
    override
    returns (address) {

        // // Get the ProxyStorage struct
        // IBosonVoucherBeacon().implementation();

        // Return the current implementation address
        return IBosonVoucherBeacon(_beacon()).implementation();

    }

    function _beacon() internal view returns (address) {
        return getBeaconSlot().value;
    }

    function _setBeacon(address _beaconAddress) internal {
        AddressSlot storage addressSlot = getBeaconSlot();
        addressSlot.value = _beaconAddress;
    }
    

}