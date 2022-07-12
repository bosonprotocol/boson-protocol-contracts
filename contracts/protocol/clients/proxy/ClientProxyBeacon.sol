// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IBosonClient } from "../../../interfaces/clients/IBosonClient.sol";
import { ClientLibBeacon } from "../../libs/ClientLibBeacon.sol";
import { Proxy } from "./Proxy.sol";

/**
 * @title ClientProxyBeacon
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
contract ClientProxyBeacon is Proxy {
    /**
     * @dev Initialize the contract after the deployment.
     * This function is callable only once
     */
    function initialize(address _beaconAddress) external initializer {
        // set the beacon address
        ClientLibBeacon.getBeaconSlot().value = _beaconAddress;
    }

    /**
     * @dev Indicates that the contract has been initialized.
     */
    bool private _initialized;

    modifier initializer() {
        require(!_initialized, "Initializable: contract is already initialized");
        _;
        _initialized = true;
    }

    /**
     * @dev Returns the address to which the fallback function
     * and {_fallback} should delegate.
     * Implementation address is supplied by the beacon
     */
    function _implementation() internal view override returns (address) {
        // Return the current implementation address
        return IBosonClient(ClientLibBeacon._beacon()).getImplementation();
    }
}
