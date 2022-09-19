// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../domain/BosonConstants.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

/**
 * @title AccessController
 *
 * @notice Implements centralized role-based access for Boson Protocol contracts.
 */
contract AccessController is AccessControlUpgradeable {
    /**
     * @notice Initializer
     *
     * Not using a constructur since AccessController is upgradeable
     *
     * Grants ADMIN role to deployer.
     * Sets ADMIN as role admin for all other roles.
     */
    function initialize() external initializer {
        __AccessControl_init_unchained();

        _setupRole(ADMIN, msg.sender);
        _setRoleAdmin(ADMIN, ADMIN);
        _setRoleAdmin(PAUSER, ADMIN);
        _setRoleAdmin(PROTOCOL, ADMIN);
        _setRoleAdmin(CLIENT, ADMIN);
        _setRoleAdmin(UPGRADER, ADMIN);
        _setRoleAdmin(FEE_COLLECTOR, ADMIN);
    }
}
