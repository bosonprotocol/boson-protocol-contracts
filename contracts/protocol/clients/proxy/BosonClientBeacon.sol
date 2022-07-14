// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IAccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/IAccessControlUpgradeable.sol";
import { BosonConstants } from "../../../domain/BosonConstants.sol";
import { ClientLib } from "../../libs/ClientLib.sol";
import { ClientExternalAddressesBase } from "./../../bases/ClientExternalAddressesBase.sol";

/**
 * @title Beacon
 *
 * @notice Works together with BeaconClientProxy, which call this contract to find out what
 * the implementation address is. It also supplies the addess of AccessController and ProtocolDiamond
 * to implementations behind the beacon proxy
 */
contract BosonClientBeacon is ClientExternalAddressesBase {
    constructor(
        address _accessController,
        address _protocolAddress,
        address _impl
    ) payable ClientExternalAddressesBase(_accessController, _protocolAddress, _impl) {}
}
