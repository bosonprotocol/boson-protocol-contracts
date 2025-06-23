import "./BosonTypes.sol";

// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

// Access Control Roles
bytes32 constant ADMIN = keccak256("ADMIN"); // Role Admin
bytes32 constant PAUSER = keccak256("PAUSER"); // Role for pausing the protocol
bytes32 constant PROTOCOL = keccak256("PROTOCOL"); // Role for facets of the ProtocolDiamond
bytes32 constant CLIENT = keccak256("CLIENT"); // Role for clients of the ProtocolDiamond
bytes32 constant UPGRADER = keccak256("UPGRADER"); // Role for performing contract and config upgrades
bytes32 constant FEE_COLLECTOR = keccak256("FEE_COLLECTOR"); // Role for collecting fees from the protocol

// Generic
uint256 constant HUNDRED_PERCENT = 10000; // 100% in basis points
uint256 constant PROTOCOL_ENTITY_ID = 0; // Entity ID for the protocol itself

// Pause Handler
uint256 constant ALL_REGIONS_MASK = (1 << (uint256(type(BosonTypes.PausableRegion).max) + 1)) - 1;

// Reentrancy guard
uint256 constant NOT_ENTERED = 1;
uint256 constant ENTERED = 2;

// Twin handler
uint256 constant SINGLE_TWIN_RESERVED_GAS = 160000;
uint256 constant MINIMAL_RESIDUAL_GAS = 230000;

// Config related
bytes32 constant VOUCHER_PROXY_SALT = keccak256(abi.encodePacked("BosonVoucherProxy"));

// Funds related
string constant NATIVE_CURRENCY = "Native currency";
string constant TOKEN_NAME_UNSPECIFIED = "Token name unavailable";

// EIP712Lib
string constant PROTOCOL_NAME = "Boson Protocol";
string constant PROTOCOL_VERSION = "V2";
bytes32 constant EIP712_DOMAIN_TYPEHASH = keccak256(
    bytes("EIP712Domain(string name,string version,address verifyingContract,bytes32 salt)")
);

// BosonVoucher
string constant VOUCHER_NAME = "Boson Voucher (rNFT)";
string constant VOUCHER_SYMBOL = "BOSON_VOUCHER_RNFT";

// Meta Transactions - Error
string constant FUNCTION_CALL_NOT_SUCCESSFUL = "Function call not successful";

// External contracts errors
string constant OWNABLE_ZERO_ADDRESS = "Ownable: new owner is the zero address"; // exception message from OpenZeppelin Ownable
string constant ERC721_INVALID_TOKEN_ID = "ERC721: invalid token ID"; // exception message from OpenZeppelin ERC721

// Meta Transactions - Structs
bytes32 constant META_TRANSACTION_TYPEHASH = keccak256(
    bytes(
        "MetaTransaction(uint256 nonce,address from,address contractAddress,string functionName,bytes functionSignature)"
    )
);
bytes32 constant OFFER_DETAILS_TYPEHASH = keccak256("MetaTxOfferDetails(address buyer,uint256 offerId)");
bytes32 constant META_TX_COMMIT_TO_OFFER_TYPEHASH = keccak256(
    "MetaTxCommitToOffer(uint256 nonce,address from,address contractAddress,string functionName,MetaTxOfferDetails offerDetails)MetaTxOfferDetails(address buyer,uint256 offerId)"
);
bytes32 constant CONDITIONAL_OFFER_DETAILS_TYPEHASH = keccak256(
    "MetaTxConditionalOfferDetails(address buyer,uint256 offerId,uint256 tokenId)"
);
bytes32 constant META_TX_COMMIT_TO_CONDITIONAL_OFFER_TYPEHASH = keccak256(
    "MetaTxCommitToConditionalOffer(uint256 nonce,address from,address contractAddress,string functionName,MetaTxConditionalOfferDetails offerDetails)MetaTxConditionalOfferDetails(address buyer,uint256 offerId,uint256 tokenId)"
);
bytes32 constant EXCHANGE_DETAILS_TYPEHASH = keccak256("MetaTxExchangeDetails(uint256 exchangeId)");
bytes32 constant META_TX_EXCHANGE_TYPEHASH = keccak256(
    "MetaTxExchange(uint256 nonce,address from,address contractAddress,string functionName,MetaTxExchangeDetails exchangeDetails)MetaTxExchangeDetails(uint256 exchangeId)"
);
bytes32 constant FUND_DETAILS_TYPEHASH = keccak256(
    "MetaTxFundDetails(uint256 entityId,address[] tokenList,uint256[] tokenAmounts)"
);
bytes32 constant META_TX_FUNDS_TYPEHASH = keccak256(
    "MetaTxFund(uint256 nonce,address from,address contractAddress,string functionName,MetaTxFundDetails fundDetails)MetaTxFundDetails(uint256 entityId,address[] tokenList,uint256[] tokenAmounts)"
);
bytes32 constant DISPUTE_RESOLUTION_DETAILS_TYPEHASH = keccak256(
    "MetaTxDisputeResolutionDetails(uint256 exchangeId,uint256 buyerPercentBasisPoints,bytes32 sigR,bytes32 sigS,uint8 sigV)"
);
bytes32 constant META_TX_DISPUTE_RESOLUTIONS_TYPEHASH = keccak256(
    "MetaTxDisputeResolution(uint256 nonce,address from,address contractAddress,string functionName,MetaTxDisputeResolutionDetails disputeResolutionDetails)MetaTxDisputeResolutionDetails(uint256 exchangeId,uint256 buyerPercentBasisPoints,bytes32 sigR,bytes32 sigS,uint8 sigV)"
);

// Function names
string constant COMMIT_TO_OFFER = "commitToOffer(address,uint256)";
string constant COMMIT_TO_CONDITIONAL_OFFER = "commitToConditionalOffer(address,uint256,uint256)";
string constant CANCEL_VOUCHER = "cancelVoucher(uint256)";
string constant REDEEM_VOUCHER = "redeemVoucher(uint256)";
string constant COMPLETE_EXCHANGE = "completeExchange(uint256)";
string constant WITHDRAW_FUNDS = "withdrawFunds(uint256,address[],uint256[])";
string constant RETRACT_DISPUTE = "retractDispute(uint256)";
string constant RAISE_DISPUTE = "raiseDispute(uint256)";
string constant ESCALATE_DISPUTE = "escalateDispute(uint256)";
string constant RESOLVE_DISPUTE = "resolveDispute(uint256,uint256,bytes32,bytes32,uint8)";
