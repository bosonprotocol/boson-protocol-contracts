/**
 * Reasons for Boson Protocol transactions to revert
 */
exports.RevertReasons = {
  // Access related
  ACCESS_DENIED: "Access denied, caller doesn't have role",

  // General
  INVALID_ADDRESS: "Invalid address",

  // Facet initializer related
  ALREADY_INITIALIZED: "Already initialized",

  // Offer related
  NOT_OPERATOR: "Not seller's operator",
  NO_SUCH_OFFER: "No such offer",
  OFFER_ALREADY_VOIDED: "Offer already voided",
  OFFER_PERIOD_INVALID: "Offer period invalid",
  OFFER_PENALTY_INVALID: "Offer penalty invalid",
  OFFER_MUST_BE_ACTIVE: "Offer must be active",
  OFFER_NOT_UPDATEABLE: "Offer not updateable",
  OFFER_MUST_BE_UNIQUE: "Offer must be unique to a group",

  // Group related
  TOO_MANY_OFFERS: "Exceeded maximum offers in a single transaction",

  // Account-related
  MUST_BE_ACTIVE: "Seller must be active",
  SELLER_ADDRESS_MUST_BE_UNIQUE: "Seller address cannot be assigned to another seller Id",
  BUYER_ADDRESS_MUST_BE_UNIQUE: "Buyer address cannot be assigned to another buyer Id",

  // Twin related
  NO_TRANSFER_APPROVED: "No transfer approved",
  UNSUPPORTED_TOKEN: "Unsupported token",
  TWIN_ALREADY_EXISTS_IN_SAME_BUNDLE: "Twin already exists in the same bundle",
};
