// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;

import "../events/IBosonProtocolInitializationEvents.sol";

interface IBosonProtocolInitializationHandler is IBosonProtocolInitializationEvents {
    /**
     * @notice Initializes the protocol after the deployment.
     * This function is callable only once
     *
     * @param _version - version of the protocol
     */
    function initialize(string calldata _version) external;
}
