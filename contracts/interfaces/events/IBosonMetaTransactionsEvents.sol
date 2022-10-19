// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;

/**
 * @title IBosonMetaTransactionsEvents
 *
 * @notice Defines events related to meta-transactions in the protocol.
 */
interface IBosonMetaTransactionsEvents {
    event MetaTransactionExecuted(
        address indexed userAddress,
        address indexed relayerAddress,
        string indexed functionName,
        uint256 nonce
    );

    event FunctionsWhitelisted(string[] functionNames, bool isWhitelisted);
}
