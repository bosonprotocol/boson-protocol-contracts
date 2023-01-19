// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import { ClientExternalAddressesBase } from "./../../bases/ClientExternalAddressesBase.sol";

/**
 * @title Beacon
 *
 * @notice Works together with BeaconClientProxy, which calls this contract to find out what
 * the implementation address is. It also supplies the address of AccessController and ProtocolDiamond
 * to implementations behind the beacon proxy
 */
contract BosonClientBeacon is ClientExternalAddressesBase {
    constructor(address _protocolAddress, address _impl) ClientExternalAddressesBase(_protocolAddress, _impl) {}
}
