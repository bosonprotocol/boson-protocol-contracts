// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.21;

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

    event FunctionsAllowlisted(bytes32[] functionNameHashes, bool isAllowlisted, address indexed executedBy);
}
