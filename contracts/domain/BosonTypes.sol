// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

/**
 * @title BosonTypes
 *
 * @notice Enums and structs used by the Boson Protocol contract ecosystem.
 */

contract BosonTypes {
    enum EvaluationMethod {
        None,
        Threshold,
        SpecificToken
    }

    enum ExchangeState {
        Committed,
        Revoked,
        Canceled,
        Redeemed,
        Completed,
        Disputed
    }

    enum DisputeState {
        Resolving,
        Retracted,
        Resolved,
        Escalated,
        Decided
    }

    enum TokenType {
        FungibleToken,
        NonFungibleToken,
        MultiToken
    } // ERC20, ERC721, ERC1155

    struct Seller {
        uint256 id;
        address operator;
        address admin;
        address clerk;
        address payable treasury;
        bool active;
    }

    struct Buyer {
        uint256 id;
        address payable wallet;
        bool active;
    }

    struct DisputeResolver {
        uint256 id;
        address payable wallet;
        bool active;
    }

    struct Offer {
        uint256 id;
        uint256 sellerId;
        uint256 price;
        uint256 sellerDeposit;
        uint256 protocolFee;
        uint256 buyerCancelPenalty;
        uint256 quantityAvailable;
        address exchangeToken;
        uint256 disputeResolverId;
        string metadataUri;
        string metadataHash;
        bool voided;
    }

    struct OfferDates {
        uint256 validFrom;
        uint256 validUntil;
        uint256 voucherRedeemableFrom;
        uint256 voucherRedeemableUntil;
    }

    struct OfferDurations {
        uint256 fulfillmentPeriod;
        uint256 voucherValid;
        uint256 resolutionPeriod;
    }

    struct Group {
        uint256 id;
        uint256 sellerId;
        uint256[] offerIds;
        Condition condition;
    }

    struct Condition {
        EvaluationMethod method;
        TokenType tokenType;
        address tokenAddress;
        uint256 tokenId;
        uint256 threshold;
        uint256 maxCommits;
    }

    struct Exchange {
        uint256 id;
        uint256 offerId;
        uint256 buyerId;
        uint256 finalizedDate;
        Voucher voucher;
        ExchangeState state;
    }

    struct Voucher {
        uint256 committedDate;
        uint256 validUntilDate;
        uint256 redeemedDate;
        bool expired;
    }

    struct Dispute {
        uint256 exchangeId;
        string complaint;
        DisputeState state;
        uint256 buyerPercent;
    }

    struct DisputeDates {
        uint256 disputed;
        uint256 escalated;
        uint256 finalized;
        uint256 timeout;
    }

    struct Receipt {
        Offer offer;
        Exchange exchange;
        Dispute dispute;
    }

    struct Twin {
        uint256 id;
        uint256 sellerId;
        uint256 supplyAvailable; // ERC-1155 / ERC-20
        uint256[] supplyIds; // ERC-721
        uint256 tokenId; // ERC-1155
        address tokenAddress; // all
        TokenType tokenType;
    }

    struct Bundle {
        uint256 id;
        uint256 sellerId;
        uint256[] offerIds;
        uint256[] twinIds;
    }

    struct Funds {
        address tokenAddress;
        string tokenName;
        uint256 availableAmount;
    }

    struct MetaTransaction {
        uint256 nonce;
        address from;
        address contractAddress;
        string functionName;
        bytes functionSignature;
    }

    struct MetaTxCommitToOffer {
        uint256 nonce;
        address from;
        address contractAddress;
        string functionName;
        MetaTxOfferDetails offerDetails;
    }

    struct MetaTxOfferDetails {
        address buyer;
        uint256 offerId;
    }

    struct MetaTxExchange {
        uint256 nonce;
        address from;
        address contractAddress;
        string functionName;
        MetaTxExchangeDetails exchangeDetails;
    }

    struct MetaTxExchangeDetails {
        uint256 exchangeId;
    }

    struct MetaTxFund {
        uint256 nonce;
        address from;
        address contractAddress;
        string functionName;
        MetaTxFundDetails fundDetails;
    }

    struct MetaTxFundDetails {
        uint256 entityId;
        address[] tokenList;
        uint256[] tokenAmounts;
    }

    struct MetaTxDispute {
        uint256 nonce;
        address from;
        address contractAddress;
        string functionName;
        MetaTxDisputeDetails disputeDetails;
    }

    struct MetaTxDisputeDetails {
        uint256 exchangeId;
        string complaint;
    }

    struct MetaTxDisputeResolution {
        uint256 nonce;
        address from;
        address contractAddress;
        string functionName;
        MetaTxDisputeResolutionDetails disputeResolutionDetails;
    }

    struct MetaTxDisputeResolutionDetails {
        uint256 exchangeId;
        uint256 buyerPercent;
        bytes32 sigR;
        bytes32 sigS;
        uint8 sigV;
    }
}
