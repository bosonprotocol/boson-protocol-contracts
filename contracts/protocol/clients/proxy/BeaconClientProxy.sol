// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IClientExternalAddresses } from "../../../interfaces/clients/IClientExternalAddresses.sol";
import { BeaconClientLib } from "../../libs/BeaconClientLib.sol";
import { Proxy } from "./Proxy.sol";

/**
 * @title BeaconClientProxy
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
contract BeaconClientProxy is Proxy {
    /**
     * @dev Initialize the contract after the deployment.
     * This function is callable only once
     */
    function initialize(address _beaconAddress) external initializer {
        // set the beacon address
        BeaconClientLib.getBeaconSlot().value = _beaconAddress;
    }

    modifier initializer() {
        require(!BeaconClientLib.getBeaconSlot().initialized, "Initializable: contract is already initialized");
        _;
        BeaconClientLib.getBeaconSlot().initialized = true;
    }

    /**
     * @dev Returns the address to which the fallback function
     * and {_fallback} should delegate.
     * Implementation address is supplied by the beacon
     */
    function _implementation() internal view override returns (address) {
        // Return the current implementation address
        return IClientExternalAddresses(BeaconClientLib._beacon()).getImplementation();
    }
}
