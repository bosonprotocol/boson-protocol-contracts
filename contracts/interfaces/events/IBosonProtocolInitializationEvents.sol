// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;

/**
 * @title IBosonInitializationEvents
 *
 * @notice Defines events related to initialization of the protocol.
 */
interface IBosonProtocolInitializationEvents {
    event ProtocolInitialized(bytes32 version);
}
