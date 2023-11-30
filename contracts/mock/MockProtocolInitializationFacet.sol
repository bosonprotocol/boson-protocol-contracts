// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

/**
 * @title MockBosonProtocolInitializationHandler
 *
 * @notice Simulates state of the protocol in tests before v2.1.0.
 *
 */
contract MockProtocolInitializationHandlerFacet {
    /**
     * @notice No-op function to simulate state of the protocol in tests before v 2.1.0., but still compatible with new deploy script.
     */
    function initialize(
        bytes32,
        address[] calldata,
        bytes[] calldata,
        bool,
        bytes calldata,
        bytes4[] calldata,
        bytes4[] calldata
    ) external {}
}
