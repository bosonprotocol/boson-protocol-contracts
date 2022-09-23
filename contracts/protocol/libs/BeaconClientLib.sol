// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import { IAccessControlUpgradeable } from "../../interfaces/IAccessControlUpgradeable.sol";
import { IClientExternalAddresses } from "../../interfaces/clients/IClientExternalAddresses.sol";

/**
 * @title BeaconClientLib
 *
 * @notice
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
        bool initialized;
    }

    /**
     * @notice Returns a `BeaconSlot` with member `value`.
     *
     * @return r - the BeaconSlot storage slot cast to BeaconSlot
     */
    function getBeaconSlot() internal pure returns (BeaconSlot storage r) {
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _BEACON_SLOT
        }
    }

    /**
     * @notice Returns the address of the Beacon
     *
     * @return the Beacon address
     */
    function _beacon() internal view returns (address) {
        return getBeaconSlot().value;
    }

    /**
     * @notice Checks that the caller has a specific role.
     *
     * Reverts if caller doesn't have role.
     *
     * See: {AccessController.hasRole}
     *
     * @param role - the role to check
     * @return  whether caller has role
     */
    function hasRole(bytes32 role) internal view returns (bool) {
        // retrieve accessController from Beacon
        IAccessControlUpgradeable accessController = IClientExternalAddresses(_beacon()).getAccessController();

        // forward the check to accessController
        return accessController.hasRole(role, msg.sender);
    }
}
