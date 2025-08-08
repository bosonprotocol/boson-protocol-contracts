// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { BosonTypes } from "../../domain/BosonTypes.sol";

/**
 * @title IBosonExchangeEvents
 *
 * @notice Defines events related to exchanges within the protocol.
 */
interface IBosonExchangeEvents {
    event BuyerCommitted(
        uint256 indexed offerId,
        uint256 indexed buyerId,
        uint256 indexed exchangeId,
        BosonTypes.Exchange exchange,
        BosonTypes.Voucher voucher,
        address executedBy
    );
    event SellerCommitted(
        uint256 indexed offerId,
        uint256 indexed sellerId,
        uint256 indexed exchangeId,
        BosonTypes.Exchange exchange,
        BosonTypes.Voucher voucher,
        address executedBy
    );
    event ExchangeCompleted(
        uint256 indexed offerId,
        uint256 indexed buyerId,
        uint256 indexed exchangeId,
        address executedBy
    );
    event VoucherCanceled(uint256 indexed offerId, uint256 indexed exchangeId, address indexed executedBy);
    event VoucherExpired(uint256 indexed offerId, uint256 indexed exchangeId, address indexed executedBy);
    event VoucherExtended(
        uint256 indexed offerId,
        uint256 indexed exchangeId,
        uint256 validUntil,
        address indexed executedBy
    );
    event VoucherRedeemed(uint256 indexed offerId, uint256 indexed exchangeId, address indexed executedBy);
    event VoucherRevoked(uint256 indexed offerId, uint256 indexed exchangeId, address indexed executedBy);
    event VoucherTransferred(
        uint256 indexed offerId,
        uint256 indexed exchangeId,
        uint256 indexed newBuyerId,
        address executedBy
    );
    event ConditionalCommitAuthorized(
        uint256 indexed offerId,
        BosonTypes.GatingType gating,
        address indexed buyerAddress,
        uint256 indexed tokenId,
        uint256 commitCount,
        uint256 maxCommits
    );
}
