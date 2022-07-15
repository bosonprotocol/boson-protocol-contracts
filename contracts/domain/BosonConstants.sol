// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

/**
 * @title BosonConstants
 *
 * @notice Constants used by the Boson Protocol contract ecosystem.
 */
contract BosonConstants {
    // Access Control Roles
    bytes32 internal constant ADMIN = keccak256("ADMIN"); // Role Admin
    bytes32 internal constant PROTOCOL = keccak256("PROTOCOL"); // Role for facets of the ProtocolDiamond
    bytes32 internal constant CLIENT = keccak256("CLIENT"); // Role for clients of the ProtocolDiamond
    bytes32 internal constant UPGRADER = keccak256("UPGRADER"); // Role for performing contract and config upgrades
    bytes32 internal constant FEE_COLLECTOR = keccak256("FEE_COLLECTOR"); // Role for collecting fees from the protocol

    // Revert Reasons: General
    string internal constant INVALID_ADDRESS = "Invalid address";
    string internal constant INVALID_STATE = "Invalid state";
    string internal constant ARRAY_LENGTH_MISMATCH = "Array length mismatch";

    // Revert Reasons: Facet initializer related
    string internal constant ALREADY_INITIALIZED = "Already initialized";

    // Revert Reasons: Access related
    string internal constant ACCESS_DENIED = "Access denied, caller doesn't have role";
    string internal constant NOT_OPERATOR = "Not seller's operator";
    string internal constant NOT_ADMIN = "Not admin";
    string internal constant NOT_BUYER_OR_SELLER = "Not buyer or seller";
    string internal constant NOT_VOUCHER_HOLDER = "Not current voucher holder";
    string internal constant NOT_BUYER_WALLET = "Not buyer's wallet address";
    string internal constant NOT_DISPUTE_RESOLVER_OPERATOR = "Not dispute resolver's operator address";

    // Revert Reasons: Account-related
    string internal constant NO_SUCH_SELLER = "No such seller";
    string internal constant MUST_BE_ACTIVE = "Account must be active";
    string internal constant SELLER_ADDRESS_MUST_BE_UNIQUE = "Seller address cannot be assigned to another seller Id";
    string internal constant BUYER_ADDRESS_MUST_BE_UNIQUE = "Buyer address cannot be assigned to another buyer Id";
    string internal constant DISPUTE_RESOLVER_ADDRESS_MUST_BE_UNIQUE =
        "Dispute Resolver address cannot be assigned to another dispute resolver Id";
    string internal constant AGENT_ADDRESS_MUST_BE_UNIQUE = "Agent address cannot be assigned to another agent Id";
    string internal constant NO_SUCH_BUYER = "No such buyer";
    string internal constant WALLET_OWNS_VOUCHERS = "Wallet address owns vouchers";
    string internal constant NO_SUCH_DISPUTE_RESOLVER = "No such dispute resolver";
    string internal constant INVALID_ESCALATION_PERIOD = "Invalid escalation period";
    string internal constant INVALID_AMOUNT_DISPUTE_RESOLVER_FEES =
        "Dispute resolver fees are not present or exceeds maximum dispute resolver fees in a single transaction";
    string internal constant DUPLICATE_DISPUTE_RESOLVER_FEES = "Duplicate dispute resolver fee";
    string internal constant DISPUTE_RESOLVER_FEE_NOT_FOUND = "Dispute resolver fee not found";

    // Revert Reasons: Offer related
    string internal constant NO_SUCH_OFFER = "No such offer";
    string internal constant OFFER_PERIOD_INVALID = "Offer period invalid";
    string internal constant OFFER_PENALTY_INVALID = "Offer penalty invalid";
    string internal constant OFFER_MUST_BE_ACTIVE = "Offer must be active";
    string internal constant OFFER_NOT_UPDATEABLE = "Offer not updateable";
    string internal constant OFFER_MUST_BE_UNIQUE = "Offer must be unique to a group";
    string internal constant OFFER_HAS_BEEN_VOIDED = "Offer has been voided";
    string internal constant OFFER_HAS_EXPIRED = "Offer has expired";
    string internal constant OFFER_NOT_AVAILABLE = "Offer is not yet available";
    string internal constant OFFER_SOLD_OUT = "Offer has sold out";
    string internal constant CANNOT_COMMIT = "Caller cannot commit";
    string internal constant EXCHANGE_FOR_OFFER_EXISTS = "Exchange for offer exists";
    string internal constant AMBIGUOUS_VOUCHER_EXPIRY =
        "Exactly one of voucherRedeemableUntil and voucherValid must be non zero";
    string internal constant REDEMPTION_PERIOD_INVALID = "Redemption period invalid";
    string internal constant INVALID_FULFILLMENT_PERIOD = "Invalid fulfillemnt period";
    string internal constant INVALID_DISPUTE_DURATION = "Invalid dispute duration";
    string internal constant INVALID_DISPUTE_RESOLVER = "Invalid dispute resolver";
    string internal constant INVALID_QUANTITY_AVAILABLE = "Invalid quantity available";

    // Revert Reasons: Group related
    string internal constant NO_SUCH_GROUP = "No such group";
    string internal constant OFFER_NOT_IN_GROUP = "Offer not part of the group";
    string internal constant TOO_MANY_OFFERS = "Exceeded maximum offers in a single transaction";
    string internal constant NOTHING_UPDATED = "Nothing updated";
    string internal constant INVALID_CONDITION_PARAMETERS = "Invalid condition parameters";

    // Revert Reasons: Exchange related
    string internal constant NO_SUCH_EXCHANGE = "No such exchange";
    string internal constant FULFILLMENT_PERIOD_NOT_ELAPSED = "Fulfillment period has not yet elapsed";
    string internal constant VOUCHER_NOT_REDEEMABLE = "Voucher not yet valid or already expired";
    string internal constant VOUCHER_STILL_VALID = "Voucher still valid";
    string internal constant VOUCHER_HAS_EXPIRED = "Voucher has expired";

    // Revert Reasons: Twin related
    string internal constant NO_SUCH_TWIN = "No such twin";
    string internal constant NO_TRANSFER_APPROVED = "No transfer approved";
    string internal constant TWIN_TRANSFER_FAILED = "Twin could not be transferred";
    string internal constant UNSUPPORTED_TOKEN = "Unsupported token";
    string internal constant BUNDLE_FOR_TWIN_EXISTS = "Bundle for twin exists";
    string internal constant INVALID_SUPPLY_AVAILABLE = "supplyAvailable can't be zero";
    string internal constant INVALID_AMOUNT = "Amount must be greater than zero if token is ERC20 or ERC1155";
    string internal constant INVALID_TWIN_PROPERTY = "Invalid property for selected token type";

    // Revert Reasons: Bundle related
    string internal constant NO_SUCH_BUNDLE = "No such bundle";
    string internal constant TWIN_NOT_IN_BUNDLE = "Twin not part of the bundle";
    string internal constant OFFER_NOT_IN_BUNDLE = "Offer not part of the bundle";
    string internal constant TOO_MANY_TWINS = "Exceeded maximum twins in a single transaction";
    string internal constant BUNDLE_OFFER_MUST_BE_UNIQUE = "Offer must be unique to a bundle";
    string internal constant BUNDLE_TWIN_MUST_BE_UNIQUE = "Twin must be unique to a bundle";
    string internal constant EXCHANGE_FOR_BUNDLED_OFFERS_EXISTS = "Exchange for the bundled offers exists";
    string internal constant INSUFFICIENT_TWIN_SUPPLY_TO_COVER_BUNDLE_OFFERS =
        "Insufficient twin supplyAvailable to cover total quantity of bundle offers";

    // Revert Reasons: Funds related
    string internal constant NATIVE_WRONG_ADDRESS = "Native token address must be 0";
    string internal constant NATIVE_WRONG_AMOUNT = "Transferred value must match amount";
    string internal constant TOKEN_NAME_UNSPECIFIED = "Token name unspecified";
    string internal constant NATIVE_CURRENCY = "Native currency";
    string internal constant TOO_MANY_TOKENS = "Too many tokens";
    string internal constant TOKEN_AMOUNT_MISMATCH = "Number of amounts should match number of tokens";
    string internal constant NOTHING_TO_WITHDRAW = "Nothing to withdraw";
    string internal constant NOT_AUTHORIZED = "Not authorized to withdraw";

    // Revert Reasons: Meta-Transactions related
    string internal constant NONCE_USED_ALREADY = "Nonce used already";
    string internal constant FUNCTION_CALL_NOT_SUCCESSFUL = "Function call not successful";
    string internal constant INVALID_FUNCTION_SIGNATURE =
        "functionSignature can not be of executeMetaTransaction method";
    string internal constant SIGNER_AND_SIGNATURE_DO_NOT_MATCH = "Signer and signature do not match";
    string internal constant INVALID_FUNCTION_NAME = "Invalid function name";

    // Revert Reasons: Dispute related
    string internal constant COMPLAINT_MISSING = "Complaint missing";
    string internal constant FULFILLMENT_PERIOD_HAS_ELAPSED = "Fulfillment period has already elapsed";
    string internal constant DISPUTE_HAS_EXPIRED = "Dispute has expired";
    string internal constant INVALID_BUYER_PERCENT = "Invalid buyer percent";
    string internal constant DISPUTE_STILL_VALID = "Dispute still valid";
    string internal constant INVALID_DISPUTE_TIMEOUT = "Invalid dispute timeout";
    string internal constant TOO_MANY_DISPUTES = "Exceeded maximum disputes in a single transaction";

    // Revert Reasons: General
    string internal constant FEE_PERCENTAGE_INVALID = "Percentage representation must be less than 10000";
}

// TODO: Refactor to use file level constants throughout or use custom Errors
// Libraries cannot inherit BosonConstants, therefore these revert reasons are defined on the file level
string constant TOKEN_TRANSFER_FAILED = "Token transfer failed";
string constant INSUFFICIENT_VALUE_SENT = "Insufficient value sent";
string constant INSUFFICIENT_AVAILABLE_FUNDS = "Insufficient available funds";
string constant NATIVE_NOT_ALLOWED = "Transfer of native currency not allowed";
string constant INVALID_SIGNATURE = "Invalid signature";
