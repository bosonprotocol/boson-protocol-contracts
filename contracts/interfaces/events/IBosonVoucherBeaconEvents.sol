// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

/**
 * @title IBosonClientEvents
 *
 * @notice Events related to management of Boson ClientProxy
 */
interface IBosonVoucherBeaconEvents {
    event Upgraded(address indexed implementation, address indexed executedBy);
    event ProtocolAddressChanged(address indexed protocol, address indexed executedBy);
    event AccessControllerAddressChanged(address indexed accessController, address indexed executedBy);
}
