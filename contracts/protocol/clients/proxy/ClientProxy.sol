// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IAccessControlUpgradeable } from "../../../interfaces/IAccessControlUpgradeable.sol";
import { IBosonConfigHandler } from "../../../interfaces/handlers/IBosonConfigHandler.sol";
import { ClientLib } from "../../libs/ClientLib.sol";
import { EIP712Lib } from "../../libs/EIP712Lib.sol";
import { Proxy } from "./Proxy.sol";
import { ClientExternalAddressesBase } from "./../../bases/ClientExternalAddressesBase.sol";

/**
 * @title ClientProxy
 *
 * @notice Delegates calls to a Boson Protocol Client implementation contract,
 * such that functions on it execute in the context (address, storage)
 * of this proxy, allowing the implementation contract to be upgraded
 * without losing the accumulated state data.
 *
 * Protocol clients are the contracts in the system that communicate with
 * the facets of the ProtocolDiamond rather than acting as facets themselves.
 *
 * Each Protocol client contract will be deployed behind its own proxy for
 * future upgradability.
 */
contract ClientProxy is ClientExternalAddressesBase, Proxy {
    constructor(
        address _accessController,
        address _protocolAddress,
        address _impl
    ) payable ClientExternalAddressesBase(_accessController, _protocolAddress, _impl) {}

    /**
     * @notice Returns the address to which the fallback function
     * and {_fallback} should delegate.
     *
     * @return address of the client implementation
     */
    function _implementation() internal view override(ClientExternalAddressesBase, Proxy) returns (address) {
        // Get the ProxyStorage struct
        ClientLib.ProxyStorage storage ps = ClientLib.proxyStorage();

        // Return the current implementation address
        return ps.implementation;
    }
}
