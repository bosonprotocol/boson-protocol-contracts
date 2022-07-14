// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IAccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/IAccessControlUpgradeable.sol";
import { IClientExternalAddresses } from "../../interfaces/clients/IClientExternalAddresses.sol";

/**
 * @title BeaconClientLib
 *
 * - Defines BeaconSlot position
 * - Provides BeaconSlot accessor
 * - Defines hasRole function
 */
library BeaconClientLib {
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

    /**
     * @dev Returns the address of the beacon
     */
    function _beacon() internal view returns (address) {
        return getBeaconSlot().value;
    }

    /**
     * @dev Checks that the caller has a specific role.
     *
     * Reverts if caller doesn't have role.
     *
     * See: {AccessController.hasRole}
     */
    function hasRole(bytes32 role) internal view returns (bool) {
        // retrieve accessController from Beacon
        IAccessControlUpgradeable accessController = IClientExternalAddresses(_beacon()).getAccessController();

        // forward the check to accessController
        return accessController.hasRole(role, msg.sender);
    }
}
