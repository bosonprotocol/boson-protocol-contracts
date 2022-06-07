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
  OFFER_DEPOSIT_INVALID: "Offer deposit invalid",
  OFFER_MUST_BE_ACTIVE: "Offer must be active",
  OFFER_NOT_UPDATEABLE: "Offer not updateable",
  OFFER_MUST_BE_UNIQUE: "Offer must be unique to a group",
  EXCHANGE_FOR_OFFER_EXISTS: "Exchange for offer exists",
  AMBIGUOUS_VOUCHER_EXPIRY: "Exactly one of voucherRedeemableUntil and voucherValid must be non zero",
  REDEMPTION_PERIOD_INVALID: "Redemption period invalid",
  INVALID_FULFILLMENT_PERIOD: "Invalid fulfillemnt period",
  INVALID_DISPUTE_DURATION: "Invalid dispute duration",
  INVALID_DISPUTE_RESOLVER: "Invalid dispute resolver",
  INVALID_QUANTITY_AVAILABLE: "Invalid quantity available",

  // Group related
  NO_SUCH_GROUP: "No such offer",
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
  NOT_ADMIN: "Not seller's admin",
  NOT_BUYER_WALLET: "Not buyer's wallet address",
  NO_SUCH_BUYER: "No such buyer",
  WALLET_OWNS_VOUCHERS: "Wallet address owns vouchers",
  NOT_DISPUTE_RESOLVER_WALLET: "Not dispute resolver's wallet address",
  NO_SUCH_DISPUTE_RESOLVER: "No such dispute resolver",

  // Twin related
  NO_SUCH_TWIN: "No such twin",
  NO_TRANSFER_APPROVED: "No transfer approved",
  TWIN_TRANSFER_FAILED: "Twin could not be transferred",
  UNSUPPORTED_TOKEN: "Unsupported token",
  TWIN_HAS_BUNDLES: "Twin has bundles",

  // Bundle related
  NO_SUCH_BUNDLE: "No such bundle",
  TWIN_NOT_IN_BUNDLE: "Twin not part of the bundle",
  OFFER_NOT_IN_BUNDLE: "Offer not part of the bundle",
  TOO_MANY_TWINS: "Exceeded maximum twins in a single transaction",
  TWIN_ALREADY_EXISTS_IN_SAME_BUNDLE: "Twin already exists in the same bundle",
  BUNDLE_OFFER_MUST_BE_UNIQUE: "Offer must be unique to a bundle",

  // Exchange related
  NO_SUCH_EXCHANGE: "No such exchange",
  FULFILLMENT_PERIOD_NOT_ELAPSED: "Fulfillment period has not yet elapsed",
  EXCHANGE_FOR_BUNDLED_OFFERS_EXISTS: "Exchange for the bundled offers exists",
  VOUCHER_NOT_REDEEMABLE: "Voucher not yet valid or already expired",
  VOUCHER_STILL_VALID: "Voucher still valid",
  VOUCHER_HAS_EXPIRED: "Voucher has expired",

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

  // Meta-Transactions related
  NONCE_USED_ALREADY: "Nonce used already",
  FUNCTION_CALL_NOT_SUCCESSFUL: "Function call not successful",
  INVALID_FUNCTION_SIGNATURE: "functionSignature can not be of executeMetaTransaction method",
  INVALID_SIGNATURE: "Invalid signature",
  SIGNER_AND_SIGNATURE_DO_NOT_MATCH: "Signer and signature do not match",
  INVALID_FUNCTION_NAME: "Invalid function name",

  // Dispute related
  COMPLAINT_MISSING: "Complaint missing",
};
