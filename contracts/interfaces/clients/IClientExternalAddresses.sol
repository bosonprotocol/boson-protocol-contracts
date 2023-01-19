// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.16;

import { IAccessControl } from "../IAccessControl.sol";
import { IClientExternalAddressesEvents } from "../events/IClientExternalAddressesEvents.sol";

/**
 * @title IClientExternalAddresses
 *
 * @notice ClientExternalAddresses is used to set and get addresses used either by proxies or
 * by protocol clients.
 *
 *
 * The ERC-165 identifier for this interface is: 0x344552b3
 */
interface IClientExternalAddresses is IClientExternalAddressesEvents {
    /**
     * @notice Sets the implementation address.
     *
     * @param _implementation - the implementation address
     */
    function setImplementation(address _implementation) external;

    /**
     * @notice Gets the implementation address.
     *
     * @return the implementation address
     */
    function getImplementation() external view returns (address);

    /**
     * @notice Gets the address of the Boson Protocol AccessController contract.
     *
     * @return the address of the AccessController contract
     */
    function getAccessController() external view returns (IAccessControl);

    /**
     * @notice Set the ProtocolDiamond address.
     *
     * Emits a ProtocolAddressChanged event.
     *
     * @param _protocolAddress - the ProtocolDiamond address
     */
    function setProtocolAddress(address _protocolAddress) external;

    /**
     * @notice Gets the address of the ProtocolDiamond contract.
     *
     * @return the ProtocolDiamond address
     */
    function getProtocolAddress() external view returns (address);
}
