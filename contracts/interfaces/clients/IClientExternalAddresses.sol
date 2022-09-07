// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { IAccessControlUpgradeable } from "../IAccessControlUpgradeable.sol";
import { IClientExternalAddressesEvents } from "../events/IClientExternalAddressesEvents.sol";

/**
 * @title IClientExternalAddresses
 *
 * @notice ClientExternalAddresses is used to set and get addresses, used either by proxies or
 * by protocol client
 *
 *
 * The ERC-165 identifier for this interface is: 0xc4c6c36b
 */
interface IClientExternalAddresses is IClientExternalAddressesEvents {
    /**
     * @dev Set the implementation address
     */
    function setImplementation(address _implementation) external;

    /**
     * @dev Get the implementation address
     */
    function getImplementation() external view returns (address);

    /**
     * @notice Set the AccessController address
     *
     * Emits an AccessControllerAddressChanged event.
     *
     * @param _accessController - the AccessController address
     */
    function setAccessController(address _accessController) external;

    /**
     * @notice Gets the address of the AccessController.
     *
     * @return the address of the AccessController
     */
    function getAccessController() external view returns (IAccessControlUpgradeable);

    /**
     * @notice Set the ProtocolDiamond address
     *
     * Emits an ProtocolAddressChanged event.
     *
     * @param _protocol - the ProtocolDiamond address
     */
    function setProtocolAddress(address _protocol) external;

    /**
     * @notice Gets the address of the ProtocolDiamond
     *
     * @return the address of the ProtocolDiamond
     */
    function getProtocolAddress() external view returns (address);
}
