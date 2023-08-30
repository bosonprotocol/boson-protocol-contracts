// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.21;

/**
 * @title IClientExternalAddressesEvents
 *
 * @notice Defines events related to management of Boson Protocol clients.
 */
interface IClientExternalAddressesEvents {
    event Upgraded(address indexed implementation, address indexed executedBy);
    event ProtocolAddressChanged(address indexed protocol, address indexed executedBy);
}
