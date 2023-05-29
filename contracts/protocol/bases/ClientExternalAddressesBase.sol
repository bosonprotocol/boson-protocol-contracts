// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "../../domain/BosonConstants.sol";
import { IAccessControl } from "../../interfaces/IAccessControl.sol";
import { IClientExternalAddresses } from "../../interfaces/clients/IClientExternalAddresses.sol";
import { IBosonConfigHandler } from "../../interfaces/handlers/IBosonConfigHandler.sol";
import { ClientLib } from "../libs/ClientLib.sol";

/**
 * @title ClientExternalAddressesBase
 *
 * @notice Helps minimal proxies.
 */
contract ClientExternalAddressesBase is IClientExternalAddresses {
    /**
     * @dev Modifier that checks that the caller has a specific role.
     *
     * Reverts if caller doesn't have role.
     *
     * See: {AccessController.hasRole}
     *
     * @param _role - the role to check
     */
    modifier onlyRole(bytes32 _role) {
        require(ClientLib.hasRole(_role), "Access denied, caller doesn't have role");
        _;
    }

    /**
     * @notice Instantiates the contract.
     *
     * @param _protocolAddress - the ProtocolDiamond address
     * @param _impl - the implementation address
     */
    constructor(address _protocolAddress, address _impl) {
        require(_protocolAddress != address(0) && _impl != address(0), INVALID_ADDRESS);

        // Get the ProxyStorage struct
        ClientLib.ProxyStorage storage ps = ClientLib.proxyStorage();

        // Store the Protocol Diamond address
        ps.protocolDiamond = _protocolAddress;

        // Store the implementation address
        ps.implementation = _impl;
    }

    /**
     * @notice Returns the address to which the fallback function
     * and {_fallback} should delegate.
     *
     * @return the implementation address
     */
    function _implementation() internal view virtual returns (address) {
        // Get the ProxyStorage struct
        ClientLib.ProxyStorage storage ps = ClientLib.proxyStorage();

        // Return the current implementation address
        return ps.implementation;
    }

    /**
     * @notice Sets the implementation address.
     *
     * Emits an Upgraded event.
     *
     * Reverts if _impl is the zero address
     *
     * @param _impl - the implementation address
     */
    function setImplementation(address _impl) external override onlyRole(UPGRADER) {
        require(_impl != address(0), INVALID_ADDRESS);

        // Get the ProxyStorage struct
        ClientLib.ProxyStorage storage ps = ClientLib.proxyStorage();

        // Store the implementation address
        ps.implementation = _impl;

        // Notify watchers of state change
        emit Upgraded(_impl, msg.sender);
    }

    /**
     * @notice Gets the implementation address.
     *
     * @return the implementation address
     */
    function getImplementation() external view override returns (address) {
        return _implementation();
    }

    /**
     * @notice Gets the address of the Boson Protocol AccessController contract.
     *
     * @return the address of the AccessController contract
     */
    function getAccessController() public view override returns (IAccessControl) {
        // Get the ProxyStorage struct
        ClientLib.ProxyStorage storage ps = ClientLib.proxyStorage();

        // Return the current AccessController address
        return IAccessControl(IBosonConfigHandler(ps.protocolDiamond).getAccessControllerAddress());
    }

    /**
     * @notice Set the ProtocolDiamond address.
     *
     * Emits a ProtocolAddressChanged event.
     *
     * Reverts if _protocolAddress is the zero address
     *
     * @param _protocolAddress - the ProtocolDiamond address
     */
    function setProtocolAddress(address _protocolAddress) external override onlyRole(UPGRADER) {
        require(_protocolAddress != address(0), INVALID_ADDRESS);

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
     * @return the ProtocolDiamond address
     */
    function getProtocolAddress() public view override returns (address) {
        // Get the ProxyStorage struct
        ClientLib.ProxyStorage storage ps = ClientLib.proxyStorage();

        // Return the current ProtocolDiamond address
        return ps.protocolDiamond;
    }
}
