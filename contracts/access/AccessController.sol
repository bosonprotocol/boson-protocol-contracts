// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.16;

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
     * Grants ADMIN role to deployer.
     * Sets ADMIN as role admin for all other roles.
     */
    constructor() {
        _setupRole(ADMIN, msg.sender);
        _setRoleAdmin(ADMIN, ADMIN);
        _setRoleAdmin(PAUSER, ADMIN);
        _setRoleAdmin(PROTOCOL, ADMIN);
        _setRoleAdmin(CLIENT, ADMIN);
        _setRoleAdmin(UPGRADER, ADMIN);
        _setRoleAdmin(FEE_COLLECTOR, ADMIN);
    }
}
