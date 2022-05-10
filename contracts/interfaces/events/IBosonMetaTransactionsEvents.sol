// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

/**
 * @title IBosonMetaTransactionsEvents
 *
 * @notice Events related to meta-transactions in the protocol.
 */
interface IBosonMetaTransactionsEvents {
    event MetaTransactionExecuted(address indexed userAddress, address payable indexed relayerAddress, bytes functionSignature, uint256 nonce);
}
