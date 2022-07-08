// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IAccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/IAccessControlUpgradeable.sol";
import { IBosonVoucherBeacon } from "../../../interfaces/clients/IBosonVoucherBeacon.sol";
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

    struct BeaconSlot {
        address value;
    }

    /**
     * @dev Returns an `BeaconSlot` with member `value`.
     */
    function getBeaconSlot() internal pure returns (BeaconSlot storage r) {
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _BEACON_SLOT
        }
    }

    function initialize(address _beaconAddress, IAccessControlUpgradeable _accessController, address _protocolAddress) external initializer() {
        _setBeacon(_beaconAddress);
        _setAddresses(_accessController, _protocolAddress);
    }

    function _beforeFallback() internal override {
        // Retrieve the latest values of accessControler and protocolAddress from the beacon

       (IAccessControlUpgradeable accessController, address protocolAddress) = IBosonVoucherBeacon(_beacon()).getAddresses();
       
        _setAddresses(accessController, protocolAddress);
        // probably better that storing is to retireve these two inside the client lib
        // also probably better for view calls
        // and we don't need initialize
    }

    /**
     * @dev Returns the address to which the fallback function
     * and {_fallback} should delegate.
     * Implementation address is supplied by the beacon
     */
    function _implementation()
    internal
    view
    override
    returns (address) {
        // Return the current implementation address
        return IBosonVoucherBeacon(_beacon()).implementation();
    }

    function _beacon() internal view returns (address) {
        return getBeaconSlot().value;
    }

    function _setBeacon(address _beaconAddress) internal {
        BeaconSlot storage beaconSlot = getBeaconSlot();
        beaconSlot.value = _beaconAddress;
    }

    function _setAddresses(IAccessControlUpgradeable accessController, address protocolAddress) internal {
         // Get the ProxyStorage struct
        ClientLib.ProxyStorage storage ps = ClientLib.proxyStorage();

        // Store the AccessController address
        ps.accessController = accessController;

        // Store the Protocol Diamond address
        ps.protocolDiamond = protocolAddress;

    }
}