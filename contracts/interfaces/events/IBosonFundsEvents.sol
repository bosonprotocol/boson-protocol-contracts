// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

/**
 * @title IBosonFundsEvents
 *
 * @notice Defines events related to management of funds within the protocol.
 */
interface IBosonFundsEvents {
    event FundsDeposited(
        uint256 indexed entityId,
        address indexed executedBy,
        address indexed tokenAddress,
        uint256 amount
    );
}

interface IBosonFundsBaseEvents {
    event FundsEncumbered(
        uint256 indexed entityId,
        address indexed exchangeToken,
        uint256 amount,
        address indexed executedBy
    );
    event FundsReleased(
        uint256 indexed exchangeId,
        uint256 indexed entityId,
        address indexed exchangeToken,
        uint256 amount,
        address executedBy
    );
    event ProtocolFeeCollected(
        uint256 indexed exchangeId,
        address indexed exchangeToken,
        uint256 amount,
        address indexed executedBy
    );
    event FundsWithdrawn(
        uint256 indexed sellerId,
        address indexed withdrawnTo,
        address indexed tokenAddress,
        uint256 amount,
        address executedBy
    );
    event DRFeeRequested(
        uint256 indexed exchangeId,
        address indexed tokenAddress,
        uint256 feeAmount,
        address indexed mutualizerAddress,
        address executedBy
    );
    event DRFeeReturned(
        uint256 indexed exchangeId,
        address indexed tokenAddress,
        uint256 returnAmount,
        address payable mutualizerAddress,
        address executedBy
    );
}
