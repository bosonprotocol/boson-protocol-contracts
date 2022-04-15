// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

/**
 * @title IBosonClientEvents
 *
 * @notice Events related to management of Boson ClientProxy
 */
interface IBosonClientEvents {
    event Upgraded(address indexed implementation);
    event ProtocolAddressChanged(address indexed protocol);
    event AccessControllerAddressChanged(address indexed accessController);
}
