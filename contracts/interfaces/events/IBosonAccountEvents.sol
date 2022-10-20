// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;

import { BosonTypes } from "../../domain/BosonTypes.sol";

/**
 * @title IBosonAccountEvents
 *
 * @notice Defines events related to management of accounts within the protocol.
 */
interface IBosonAccountEvents {
    event SellerCreated(
        uint256 indexed sellerId,
        BosonTypes.Seller seller,
        address voucherCloneAddress,
        BosonTypes.AuthToken authToken,
        address indexed executedBy
    );
    event SellerUpdatePending(
        uint256 indexed sellerId,
        BosonTypes.Seller pendingSeller,
        BosonTypes.AuthToken pendingAuthToken,
        address indexed executedBy
    );
    event SellerUpdateApplied(
        uint256 indexed sellerId,
        BosonTypes.Seller seller,
        BosonTypes.Seller pendingSeller,
        BosonTypes.AuthToken authToken,
        BosonTypes.AuthToken pendingAuthToken,
        address indexed executedBy
    );
    event BuyerCreated(uint256 indexed buyerId, BosonTypes.Buyer buyer, address indexed executedBy);
    event BuyerUpdated(uint256 indexed buyerId, BosonTypes.Buyer buyer, address indexed executedBy);
    event AgentUpdated(uint256 indexed agentId, BosonTypes.Agent agent, address indexed executedBy);
    event DisputeResolverCreated(
        uint256 indexed disputeResolverId,
        BosonTypes.DisputeResolver disputeResolver,
        BosonTypes.DisputeResolverFee[] disputeResolverFees,
        uint256[] sellerAllowList,
        address indexed executedBy
    );
    event DisputeResolverUpdated(
        uint256 indexed disputeResolverId,
        BosonTypes.DisputeResolver disputeResolver,
        address indexed executedBy
    );
    event DisputeResolverFeesAdded(
        uint256 indexed disputeResolverId,
        BosonTypes.DisputeResolverFee[] disputeResolverFees,
        address indexed executedBy
    );
    event DisputeResolverFeesRemoved(
        uint256 indexed disputeResolverId,
        address[] feeTokensRemoved,
        address indexed executedBy
    );
    event AllowedSellersAdded(uint256 indexed disputeResolverId, uint256[] addedSellers, address indexed executedBy);
    event AllowedSellersRemoved(
        uint256 indexed disputeResolverId,
        uint256[] removedSellers,
        address indexed executedBy
    );
    event DisputeResolverActivated(
        uint256 indexed disputeResolverId,
        BosonTypes.DisputeResolver disputeResolver,
        address indexed executedBy
    );

    event AgentCreated(uint256 indexed agentId, BosonTypes.Agent agent, address indexed executedBy);
}
