// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {BosonTypes} from "../../domain/BosonTypes.sol";

/**
 * @title IBosonAccountEvents
 *
 * @notice Events related to management of accounts within the protocol.
 */
interface IBosonAccountEvents {
    event SellerCreated(uint256 indexed sellerId, BosonTypes.Seller seller);
    event SellerUpdated(uint256 indexed sellerId, BosonTypes.Seller seller);
    event BuyerCreated(uint256 indexed buyerId, BosonTypes.Buyer buyer);
    event BuyerUpdated(uint256 indexed buyerId, BosonTypes.Buyer buyer);
    event DisputeResolverCreated(uint256 indexed disputeResolverId, BosonTypes.DisputeResolver disputeResolver, BosonTypes.DisputeResolverFee[]);
    event DisputeResolverUpdated(uint256 indexed disputeResolverId, BosonTypes.DisputeResolver disputeResolver, BosonTypes.DisputeResolverFee[]);
}
