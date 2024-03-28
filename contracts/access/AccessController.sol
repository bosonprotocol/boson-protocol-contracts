// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import "../domain/BosonConstants.sol";
import "./AccessControl.sol";

/**
 * @title AccessController
 *
 * @notice Implements centralized role-based access for Boson Protocol contracts.
 */
contract AccessController is AccessControl {
    /**
     * @notice Constructor
     *
     * Grants ADMIN role to the provided address.
     * Sets ADMIN as role admin for all other roles.
     *
     * @param _defaultAdmin - the address to grant the ADMIN role to
     */
    constructor(address _defaultAdmin) {
        require(_defaultAdmin != address(0), "Invalid address");
        _setupRole(ADMIN, _defaultAdmin);
        _setRoleAdmin(ADMIN, ADMIN);
        _setRoleAdmin(PAUSER, ADMIN);
        _setRoleAdmin(PROTOCOL, ADMIN);
        _setRoleAdmin(CLIENT, ADMIN);
        _setRoleAdmin(UPGRADER, ADMIN);
        _setRoleAdmin(FEE_COLLECTOR, ADMIN);
    }
}
