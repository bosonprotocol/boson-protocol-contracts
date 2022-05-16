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
  INVALID_STATE_TRANSITION: "Invalid state transition",

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
  EXCHANGE_FOR_OFFER_EXISTS: "Exchange for offer exists",

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
  NOT_ADMIN: "Not seller's admin",

  // Twin related
  NO_SUCH_TWIN: "No such twin",
  NO_TRANSFER_APPROVED: "No transfer approved",
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

  // Funds related
  NATIVE_WRONG_ADDRESS: "Native token address must be 0",
  NATIVE_WRONG_AMOUNT: "Transferred value must match amount",
  TOKEN_TRANSFER_FAILED: "Token transfer failed",
  INSUFFICIENT_VALUE_SENT: "Insufficient value sent",
  INSUFFICIENT_AVAILABLE_FUNDS: "Insufficient available funds",
  NATIVE_NOT_ALLOWED: "Transfer of native currency not allowed",

  // Outside the protocol revert reasons
  ERC20_EXCEEDS_BALANCE: "ERC20: transfer amount exceeds balance",
  ERC20_INSUFFICIENT_ALLOWANCE: "ERC20: insufficient allowance",

  // Meta-Transactions related
  NONCE_USED_ALREADY: "Nonce used already",
  FUNCTION_CALL_NOT_SUCCESSFUL: "Function call not successful",
  INVALID_FUNCTION_SIGNATURE: "functionSignature can not be of executeMetaTransaction method",
  INVALID_SIGNATURE: "Invalid signature",
  SIGNER_AND_SIGNATURE_DO_NOT_MATCH: "Signer and signature do not match",
};
