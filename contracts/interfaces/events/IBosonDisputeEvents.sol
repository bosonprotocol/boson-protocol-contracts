// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

/**
 * @title IBosonDisputeEvents
 *
 * @notice Defines events related to disputes within the protocol.
 */
interface IBosonDisputeEvents {
    event DisputeRaised(
        uint256 indexed exchangeId,
        uint256 indexed buyerId,
        uint256 indexed sellerId,
        address executedBy
    );
    event DisputeRetracted(uint256 indexed exchangeId, address indexed executedBy);
    event DisputeResolved(uint256 indexed exchangeId, uint256 _buyerPercent, address indexed executedBy);
    event DisputeExpired(uint256 indexed exchangeId, address indexed executedBy);
    event DisputeDecided(uint256 indexed exchangeId, uint256 _buyerPercent, address indexed executedBy);
    event DisputeTimeoutExtended(uint256 indexed exchangeId, uint256 newDisputeTimeout, address indexed executedBy);
    event DisputeEscalated(uint256 indexed exchangeId, uint256 indexed disputeResolverId, address indexed executedBy);
    event EscalatedDisputeExpired(uint256 indexed exchangeId, address indexed executedBy);
    event EscalatedDisputeRefused(uint256 indexed exchangeId, address indexed executedBy);
}
