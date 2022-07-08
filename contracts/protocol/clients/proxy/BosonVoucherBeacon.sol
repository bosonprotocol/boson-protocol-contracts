// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IAccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/IAccessControlUpgradeable.sol";
import { IBosonVoucherBeacon } from "../../../interfaces/clients/IBosonVoucherBeacon.sol";
import { BosonConstants } from "../../../domain/BosonConstants.sol";
import { ClientLib } from "../../libs/ClientLib.sol";

/**
 * @title Beacon
 *
 * @notice Helps minimal proxies
 */
contract BosonVoucherBeacon is IBosonVoucherBeacon, BosonConstants {

    /**
     * @dev Modifier that checks that the caller has a specific role.
     *
     * Reverts if caller doesn't have role.
     *
     * See: {AccessController.hasRole}
     */
    modifier onlyRole(bytes32 role) {
        require(ClientLib.hasRole(role), "Access denied, caller doesn't have role");
        _;
    }

    constructor(
        address _accessController,
        address _protocolAddress,
        address _implementation
    ) {

        // Get the ProxyStorage struct
        ClientLib.ProxyStorage storage ps = ClientLib.proxyStorage();

        // Store the AccessController address
        ps.accessController = IAccessControlUpgradeable(_accessController);

        // Store the Protocol Diamond address
        ps.protocolDiamond = _protocolAddress;

        // Store the implementation address
        ps.implementation = _implementation;
    }

    /**
     * @dev Returns the address to which the fallback function
     * and {_fallback} should delegate.
     */
    function implementation()
    external
    view
    override
    returns (address) {

        // Get the ProxyStorage struct
        ClientLib.ProxyStorage storage ps = ClientLib.proxyStorage();

        // Return the current implementation address
        return ps.implementation;

    }

    /**
     * @dev Set the implementation address
     */
    function setImplementation(address _implementation)
    external
    onlyRole(UPGRADER)
    override
    {
        // Get the ProxyStorage struct
        ClientLib.ProxyStorage storage ps = ClientLib.proxyStorage();

        // Store the implementation address
        ps.implementation = _implementation;

        // Notify watchers of state change
        emit Upgraded(_implementation, msg.sender);

    }


    /**
     * @notice Set the Boson Protocol AccessController
     *
     * Emits an AccessControllerAddressChanged event.
     *
     * @param _accessController - the Boson Protocol AccessController address
     */
    function setAccessController(address _accessController)
    external
    onlyRole(UPGRADER)
    override
    {
        // Get the ProxyStorage struct
        ClientLib.ProxyStorage storage ps = ClientLib.proxyStorage();

        // Store the AccessController address
        ps.accessController = IAccessControlUpgradeable(_accessController);

        // Notify watchers of state change
        emit AccessControllerAddressChanged(_accessController, msg.sender);
    }

    /**
     * @notice Gets the address of the Boson Protocol AccessController contract.
     *
     * @return the address of the AccessController contract
     */
    function getAccessController()
    public
    view
    override
    returns(IAccessControlUpgradeable)
    {
        // Get the ProxyStorage struct
        ClientLib.ProxyStorage storage ps = ClientLib.proxyStorage();

        // Return the current AccessController address
        return ps.accessController;
    }

    /**
     * @notice Set the ProtocolDiamond address
     *
     * Emits an ProtocolAddressChanged event.
     *
     * @param _protocolAddress - the ProtocolDiamond address
     */
    function setProtocolAddress(address _protocolAddress)
    external
    onlyRole(UPGRADER)
    override
    {
        // Get the ProxyStorage struct
        ClientLib.ProxyStorage storage ps = ClientLib.proxyStorage();

        // Store the ProtocolDiamond address
        ps.protocolDiamond = _protocolAddress;

        // Notify watchers of state change
        emit ProtocolAddressChanged(_protocolAddress, msg.sender);
    }

    /**
     * @notice Gets the address of the ProtocolDiamond contract.
     *
     * @return the address of the ProtocolDiamond contract
     */
    function getProtocolAddress()
    public
    override
    view
    returns(address)
    {
        // Get the ProxyStorage struct
        ClientLib.ProxyStorage storage ps = ClientLib.proxyStorage();

        // Return the current ProtocolDiamond address
        return ps.protocolDiamond;
    }


}