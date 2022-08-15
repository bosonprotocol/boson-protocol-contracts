/**
 * Reasons for Boson Protocol transactions to revert
 */
exports.RevertReasons = {
  // Access related
  ACCESS_DENIED: "Access denied, caller doesn't have role",
  NOT_BUYER_OR_SELLER: "Not buyer or seller",
  NOT_VOUCHER_HOLDER: "Not current voucher holder",

  // General
  INVALID_ADDRESS: "Invalid address",
  INVALID_STATE: "Invalid state",
  ARRAY_LENGTH_MISMATCH: "Array length mismatch",

  // Facet initializer related
  ALREADY_INITIALIZED: "Already initialized",

  // Offer related
  NOT_OPERATOR: "Not seller's operator",
  NO_SUCH_OFFER: "No such offer",
  OFFER_HAS_BEEN_VOIDED: "Offer has been voided",
  OFFER_PERIOD_INVALID: "Offer period invalid",
  OFFER_PENALTY_INVALID: "Offer penalty invalid",
  OFFER_MUST_BE_ACTIVE: "Offer must be active",
  OFFER_NOT_UPDATEABLE: "Offer not updateable",
  OFFER_MUST_BE_UNIQUE: "Offer must be unique to a group",
  CANNOT_COMMIT: "Caller cannot commit",
  EXCHANGE_FOR_OFFER_EXISTS: "Exchange for offer exists",
  AMBIGUOUS_VOUCHER_EXPIRY: "Exactly one of voucherRedeemableUntil and voucherValid must be non zero",
  REDEMPTION_PERIOD_INVALID: "Redemption period invalid",
  INVALID_FULFILLMENT_PERIOD: "Invalid fulfillemnt period",
  INVALID_DISPUTE_DURATION: "Invalid dispute duration",
  INVALID_DISPUTE_RESOLVER: "Invalid dispute resolver",
  INVALID_QUANTITY_AVAILABLE: "Invalid quantity available",
  DR_UNSUPPORTED_FEE: "Dispute resolver does not accept this token",
  AGENT_FEE_AMOUNT_TOO_HIGH: "Sum of Agent fee amount and protocol fee amount should be <= offer fee limit",

  // Group related
  NO_SUCH_GROUP: "No such group",
  OFFER_NOT_IN_GROUP: "Offer not part of the group",
  TOO_MANY_OFFERS: "Exceeded maximum offers in a single transaction",
  NOTHING_UPDATED: "Nothing updated",
  INVALID_CONDITION_PARAMETERS: "Invalid condition parameters",

  // Account-related
  MUST_BE_ACTIVE: "Account must be active",
  NO_SUCH_SELLER: "No such seller",
  SELLER_ADDRESS_MUST_BE_UNIQUE: "Seller address cannot be assigned to another seller Id",
  BUYER_ADDRESS_MUST_BE_UNIQUE: "Buyer address cannot be assigned to another buyer Id",
  DISPUTE_RESOLVER_ADDRESS_MUST_BE_UNIQUE: "Dispute Resolver address cannot be assigned to another dispute resolver Id",
  AGENT_ADDRESS_MUST_BE_UNIQUE: "Agent address cannot be assigned to another agent Id",
  NOT_ADMIN: "Not admin",
  NOT_BUYER_WALLET: "Not buyer's wallet address",
  NOT_AGENT_WALLET: "Not agent's wallet address",
  NO_SUCH_BUYER: "No such buyer",
  NO_SUCH_AGENT: "No such agent",
  WALLET_OWNS_VOUCHERS: "Wallet address owns vouchers",
  NOT_DISPUTE_RESOLVER_OPERATOR: "Not dispute resolver's operator address",
  NO_SUCH_DISPUTE_RESOLVER: "No such dispute resolver",
  INVALID_ESCALATION_PERIOD: "Invalid escalation period",
  INVALID_AMOUNT_DISPUTE_RESOLVER_FEES:
    "Dispute resolver fees are not present or exceeds maximum dispute resolver fees in a single transaction",
  DUPLICATE_DISPUTE_RESOLVER_FEES: "Duplicate dispute resolver fee",
  DISPUTE_RESOLVER_FEE_NOT_FOUND: "Dispute resolver fee not found",
  INVALID_AUTH_TOKEN_TYPE: "Invalid AuthTokenType ",
  ADMIN_OR_AUTH_TOKEN: "An admin address or an auth token is required",
  AUTH_TOKEN_MUST_BE_UNIQUE: "Auth token cannot be assigned to another entity of the same type",
  SELLER_ALREADY_APPROVED: "Seller id is approved already",
  SELLER_NOT_APPROVED: "Seller id is not approved",
  INVALID_AMOUNT_ALLOWED_SELLERS:
    "Allowed sellers not present or exceeds maximum allowed sellers in a single transaction",
  INVALID_AGENT_FEE_PERCENTAGE:
    "Sum of Agent fee percentage and protocol fee percentage should be <= max fee percentage limit",

  // Twin related
  NO_SUCH_TWIN: "No such twin",
  NO_TRANSFER_APPROVED: "No transfer approved",
  UNSUPPORTED_TOKEN: "Unsupported token",
  BUNDLE_FOR_TWIN_EXISTS: "Bundle for twin exists",
  INVALID_SUPPLY_AVAILABLE: "supplyAvailable can't be zero",
  INVALID_AMOUNT: "Amount must be greater than zero if token is ERC20 or ERC1155",
  INVALID_TWIN_PROPERTY: "Invalid property for selected token type",
  INVALID_TWIN_TOKEN_RANGE: "Token range is already being used in another Twin",
  INVALID_TOKEN_ADDRESS: "Token address is a contract that doesn't implement the interface for selected token type",

  // Bundle related
  NO_SUCH_BUNDLE: "No such bundle",
  TWIN_NOT_IN_BUNDLE: "Twin not part of the bundle",
  OFFER_NOT_IN_BUNDLE: "Offer not part of the bundle",
  TOO_MANY_TWINS: "Exceeded maximum twins in a single transaction",
  BUNDLE_OFFER_MUST_BE_UNIQUE: "Offer must be unique to a bundle",
  BUNDLE_TWIN_MUST_BE_UNIQUE: "Twin must be unique to a bundle",
  INSUFFICIENT_TWIN_SUPPLY_TO_COVER_BUNDLE_OFFERS:
    "Insufficient twin supplyAvailable to cover total quantity of bundle offers",

  // Exchange related
  NO_SUCH_EXCHANGE: "No such exchange",
  FULFILLMENT_PERIOD_NOT_ELAPSED: "Fulfillment period has not yet elapsed",
  EXCHANGE_FOR_BUNDLED_OFFERS_EXISTS: "Exchange for the bundled offers exists",
  VOUCHER_NOT_REDEEMABLE: "Voucher not yet valid or already expired",
  VOUCHER_EXTENSION_NOT_VALID: "Proposed date is not later than the current one",
  VOUCHER_STILL_VALID: "Voucher still valid",
  VOUCHER_HAS_EXPIRED: "Voucher has expired",
  TOO_MANY_EXCHANGES: "Exceeded maximum exchanges in a single transaction",
  EXCHANGE_IS_NOT_IN_A_FINAL_STATE: "Exchange is not in a final state",

  // Funds related
  NATIVE_WRONG_ADDRESS: "Native token address must be 0",
  NATIVE_WRONG_AMOUNT: "Transferred value must match amount",
  TOKEN_TRANSFER_FAILED: "Token transfer failed",
  INSUFFICIENT_VALUE_SENT: "Insufficient value sent",
  INSUFFICIENT_AVAILABLE_FUNDS: "Insufficient available funds",
  NATIVE_NOT_ALLOWED: "Transfer of native currency not allowed",
  TOO_MANY_TOKENS: "Too many tokens",
  TOKEN_AMOUNT_MISMATCH: "Number of amounts should match number of tokens",
  NOTHING_TO_WITHDRAW: "Nothing to withdraw",
  NOT_AUTHORIZED: "Not authorized to withdraw",

  // Outside the protocol revert reasons
  ERC20_EXCEEDS_BALANCE: "ERC20: transfer amount exceeds balance",
  ERC20_INSUFFICIENT_ALLOWANCE: "ERC20: insufficient allowance",
  ERC20_PAUSED: "ERC20Pausable: token transfer while paused",
  EOA_FUNCTION_CALL: "Transaction reverted: function call to a non-contract account",
  ERC721_NON_EXISTENT: "ERC721: invalid token ID",
  OWNABLE_NOT_OWNER: "Ownable: caller is not the owner",

  // Meta-Transactions related
  NONCE_USED_ALREADY: "Nonce used already",
  FUNCTION_CALL_NOT_SUCCESSFUL: "Function call not successful",
  INVALID_FUNCTION_SIGNATURE: "functionSignature can not be of executeMetaTransaction method",
  INVALID_SIGNATURE: "Invalid signature",
  SIGNER_AND_SIGNATURE_DO_NOT_MATCH: "Signer and signature do not match",
  INVALID_FUNCTION_NAME: "Invalid function name",

  // Dispute related
  COMPLAINT_MISSING: "Complaint missing",
  FULFILLMENT_PERIOD_HAS_ELAPSED: "Fulfillment period has already elapsed",
  DISPUTE_HAS_EXPIRED: "Dispute has expired",
  INVALID_BUYER_PERCENT: "Invalid buyer percent",
  DISPUTE_STILL_VALID: "Dispute still valid",
  INVALID_DISPUTE_TIMEOUT: "Invalid dispute timeout",
  TOO_MANY_DISPUTES: "Exceeded maximum disputes in a single transaction",
  ESCALATION_NOT_ALLOWED: "Disputes without dispute resolver cannot be escalated",

  // Config related
  FEE_PERCENTAGE_INVALID: "Percentage representation must be less than 10000",

  // ERC2981 related
  ROYALTY_FEE_INVALID: "ERC2981: royalty fee exceeds protocol limit",
};
