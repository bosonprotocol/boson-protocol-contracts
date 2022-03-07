// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

/**
 * @title BosonTypes
 *
 * @notice Enums and structs used by the Boson Protocol contract ecosystem.
 */
contract BosonTypes {

    enum ExchangeState {
        Committed,
        Revoked,
        Canceled,
        Redeemed,
        Completed
    }

    enum DisputeState {
        Disputed,
        Retracted,
        Resolved,
        Escalated,
        Decided
    }

    struct Offer {
        uint256 id;
        uint256 price;
        uint256 deposit;
        uint256 penalty;
        uint256 quantity;
        uint256 validFromDate;
        uint256 validUntilDate;
        uint256 redeemableDate;
        uint256 fulfillmentPeriodDuration;
        uint256 voucherValidDuration;
        address payable seller;
        address exchangeToken;
        string metadataUri;
        string metadataHash;
        bool voided;
    }

    struct Dispute {
        uint256 exchangeId;
        string complaint;
        DisputeState state;
        Resolution resolution;
    }

    struct Exchange {
        uint256 id;
        uint256 offerId;
        address payable buyer;
        bool disputed;
        ExchangeState state;
    }

    struct Resolution {
        uint256 buyerPercent;  // Represent percentage value as an unsigned int by multiplying the percentage by 100:
        uint256 sellerPercent; // e.g, 1.75% = 175, 100% = 10000
    }

    struct Voucher {
        uint256 exchangeId;
    }

}