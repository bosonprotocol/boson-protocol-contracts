// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

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
     * @notice Initializes the contract after the deployment.
     * This function is callable only once
     *
     * @param _beaconAddress - address of the Beacon to initialize
     */
    function initialize(address _beaconAddress) external initializer {
        // set the beacon address
        BeaconClientLib.getBeaconSlot().value = _beaconAddress;
    }

    /**
     * @notice Modifier to protect initializer function from being invoked twice.
     */
    modifier initializer() {
        // solhint-disable-next-line custom-errors
        require(!BeaconClientLib.getBeaconSlot().initialized, "Initializable: contract is already initialized"); // not using Custom Errors here to match OZ 4.9.* errors
        _;
        BeaconClientLib.getBeaconSlot().initialized = true;
    }

    /**
     * @notice Returns the address to which the fallback function
     * and {_fallback} should delegate.
     * Implementation address is supplied by the Beacon
     *
     * @return address of the Beacon implementation
     */
    function _implementation() internal view override returns (address) {
        // Return the current implementation address
        return IClientExternalAddresses(BeaconClientLib._beacon()).getImplementation();
    }
}
