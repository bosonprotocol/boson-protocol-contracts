// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {BosonTypes} from "../../domain/BosonTypes.sol";

/**
 * @title IBosonAccountEvents
 *
 * @notice Events related to management of accounts within the protocol.
 */
interface IBosonAccountEvents {
    event SellerCreated(uint256 indexed sellerId, BosonTypes.Seller seller, address indexed executedBy);
    event SellerUpdated(uint256 indexed sellerId, BosonTypes.Seller seller, address indexed executedBy);
    event BuyerCreated(uint256 indexed buyerId, BosonTypes.Buyer buyer, address indexed executedBy);
    event BuyerUpdated(uint256 indexed buyerId, BosonTypes.Buyer buyer,  address indexed executedBy);
    event DisputeResolverCreated(uint256 indexed disputeResolverId, BosonTypes.DisputeResolver disputeResolver,  BosonTypes.DisputeResolverFee[], address indexed executedBy);
    event DisputeResolverUpdated(uint256 indexed disputeResolverId, BosonTypes.DisputeResolver disputeResolver,  BosonTypes.DisputeResolverFee[], address indexed executedBy);
}
