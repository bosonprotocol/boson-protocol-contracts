/**
 * Reasons for Boson Protocol transactions to revert
 */
exports.RevertReasons = {
  // Access related
  ACCESS_DENIED: "Access denied, caller doesn't have role",
  NOT_BUYER_OR_SELLER: "Not buyer or seller",
  NOT_VOUCHER_HOLDER: "Not current voucher holder",
  CAN_ONLY_REVOKE_SELF: "AccessControl: can only renounce roles for self",

  // Pause related
  NO_REGIONS_SPECIFIED: "Must specify at least one region to pause",
  REGION_DUPLICATED: "A region may only be specified once",
  ALREADY_PAUSED: "Protocol is already paused",
  NOT_PAUSED: "Protocol is not currently paused",
  REGION_PAUSED: "This region of the protocol is currently paused",

  // General
  INVALID_ADDRESS: "Invalid address",
  INVALID_STATE: "Invalid state",
  ARRAY_LENGTH_MISMATCH: "Array length mismatch",
  REENTRANCY_GUARD: "ReentrancyGuard: reentrant call",

  // Facet initializer related
  ALREADY_INITIALIZED: "Already initialized",
  PROTOCOL_INITIALIZATION_FAILED: "Protocol initialization failed",
  VERSION_MUST_BE_SET: "Version cannot be empty",
  ADDRESSES_AND_CALLDATA_MUST_BE_SAME_LENGTH: "Addresses and calldata must be same length",
  WRONG_CURRENT_VERSION: "Wrong current protocol version",
  DIRECT_INITIALIZATION_NOT_ALLOWED: "Direct initializtion is not allowed",

  // Offer related
  NOT_ASSISTANT: "Not seller's assistant",
  NO_SUCH_OFFER: "No such offer",
  OFFER_HAS_BEEN_VOIDED: "Offer has been voided",
  OFFER_PERIOD_INVALID: "Offer period invalid",
  OFFER_PENALTY_INVALID: "Offer penalty invalid",
  OFFER_MUST_BE_ACTIVE: "Offer must be active",
  OFFER_MUST_BE_UNIQUE: "Offer must be unique to a group",
  CANNOT_COMMIT: "Caller cannot commit",
  EXCHANGE_FOR_OFFER_EXISTS: "Exchange for offer exists",
  AMBIGUOUS_VOUCHER_EXPIRY: "Exactly one of voucherRedeemableUntil and voucherValid must be non zero",
  REDEMPTION_PERIOD_INVALID: "Redemption period invalid",
  INVALID_DISPUTE_PERIOD: "Invalid dispute period",
  INVALID_RESOLUTION_PERIOD: "Invalid resolution period",
  INVALID_DISPUTE_RESOLVER: "Invalid dispute resolver",
  INVALID_QUANTITY_AVAILABLE: "Invalid quantity available",
  DR_UNSUPPORTED_FEE: "Dispute resolver does not accept this token",
  AGENT_FEE_AMOUNT_TOO_HIGH: "Sum of agent fee amount and protocol fee amount should be <= offer fee limit",
  OFFER_NOT_AVAILABLE: "Offer is not yet available",
  OFFER_HAS_EXPIRED: "Offer has expired",
  OFFER_SOLD_OUT: "Offer has sold out",

  // Group related
  NO_SUCH_GROUP: "No such group",
  OFFER_NOT_IN_GROUP: "Offer not part of the group",
  TOO_MANY_OFFERS: "Exceeded maximum offers in a single transaction",
  NOTHING_UPDATED: "Nothing updated",
  INVALID_CONDITION_PARAMETERS: "Invalid condition parameters",
  MAX_COMMITS_ADDRESS_REACHED: "Max commits per address reached",
  MAX_COMMITS_TOKEN_REACHED: "Max commits per token id reached",
  GROUP_HAS_NO_CONDITION: "Offer belongs to a group without a condition. Use commitToOffer instead",
  GROUP_HAS_CONDITION: "Offer belongs to a group with a condition. Use commitToConditionalOffer instead",

  // Account-related
  MUST_BE_ACTIVE: "Account must be active",
  NO_SUCH_SELLER: "No such seller",
  SELLER_ADDRESS_MUST_BE_UNIQUE: "Seller address cannot be assigned to another seller Id",
  BUYER_ADDRESS_MUST_BE_UNIQUE: "Buyer address cannot be assigned to another buyer Id",
  DISPUTE_RESOLVER_ADDRESS_MUST_BE_UNIQUE: "Dispute resolver address cannot be assigned to another dispute resolver Id",
  AGENT_ADDRESS_MUST_BE_UNIQUE: "Agent address cannot be assigned to another agent Id",
  NOT_ADMIN: "Not admin",
  NOT_ASSISTANT_AND_CLERK: "Not assistant and clerk",
  NOT_ADMIN_ASSISTANT_AND_CLERK: "Not admin, assistant and clerk",
  NOT_BUYER_WALLET: "Not buyer's wallet address",
  NOT_AGENT_WALLET: "Not agent's wallet address",
  NO_SUCH_BUYER: "No such buyer",
  NO_SUCH_AGENT: "No such agent",
  WALLET_OWNS_VOUCHERS: "Wallet address owns vouchers",
  NOT_DISPUTE_RESOLVER_ASSISTANT: "Not dispute resolver's assistant address",
  NO_SUCH_DISPUTE_RESOLVER: "No such dispute resolver",
  INVALID_ESCALATION_PERIOD: "Invalid escalation period",
  INVALID_AMOUNT_DISPUTE_RESOLVER_FEES:
    "Dispute resolver fees are not present or exceed maximum dispute resolver fees in a single transaction",
  DUPLICATE_DISPUTE_RESOLVER_FEES: "Duplicate dispute resolver fee",
  DISPUTE_RESOLVER_FEE_NOT_FOUND: "Dispute resolver fee not found",
  FEE_AMOUNT_NOT_YET_SUPPORTED: "Non-zero dispute resolver fees not yet supported",
  INVALID_AUTH_TOKEN_TYPE: "Invalid AuthTokenType",
  ADMIN_OR_AUTH_TOKEN: "An admin address or an auth token is required",
  AUTH_TOKEN_MUST_BE_UNIQUE: "Auth token cannot be assigned to another entity of the same type",
  SELLER_ALREADY_APPROVED: "Seller id is approved already",
  SELLER_NOT_APPROVED: "Seller id is not approved",
  INVALID_AMOUNT_ALLOWED_SELLERS:
    "Allowed sellers are not present or exceed maximum allowed sellers in a single transaction",
  INVALID_AGENT_FEE_PERCENTAGE:
    "Sum of agent fee percentage and protocol fee percentage should be <= max fee percentage limit",
  NO_PENDING_UPDATE_FOR_ACCOUNT: "No pending updates for the given account",
  UNAUTHORIZED_CALLER_UPDATE: "Caller has no permission to approve this update",
  NO_UPDATE_APPLIED: "No update applied or requested approval",

  // Twin related
  NO_SUCH_TWIN: "No such twin",
  NO_TRANSFER_APPROVED: "No transfer approved",
  UNSUPPORTED_TOKEN: "Unsupported token",
  BUNDLE_FOR_TWIN_EXISTS: "Bundle for twin exists",
  INVALID_SUPPLY_AVAILABLE: "supplyAvailable can't be zero",
  INVALID_AMOUNT: "Invalid twin amount",
  INVALID_TWIN_PROPERTY: "Invalid property for selected token type",
  INVALID_TWIN_TOKEN_RANGE: "Token range is already being used in another twin",
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
  BUNDLE_REQUIRES_AT_LEAST_ONE_TWIN_AND_ONE_OFFER: "Bundle must have at least one twin and one offer",

  // Exchange related
  NO_SUCH_EXCHANGE: "No such exchange",
  DISPUTE_PERIOD_NOT_ELAPSED: "Dispute period has not yet elapsed",
  EXCHANGE_FOR_BUNDLED_OFFERS_EXISTS: "Exchange for the bundled offers exists",
  VOUCHER_NOT_REDEEMABLE: "Voucher not yet valid or already expired",
  VOUCHER_EXTENSION_NOT_VALID: "Proposed date is not later than the current one",
  VOUCHER_STILL_VALID: "Voucher still valid",
  VOUCHER_HAS_EXPIRED: "Voucher has expired",
  TOO_MANY_EXCHANGES: "Exceeded maximum exchanges in a single transaction",
  EXCHANGE_IS_NOT_IN_A_FINAL_STATE: "Exchange is not in a final state",
  INVALID_RANGE_LENGTH: "Range length is too large or zero",
  EXCHANGE_ALREADY_EXISTS: "Exchange already exists",

  // Voucher related
  EXCHANGE_ID_IN_RESERVED_RANGE: "Exchange id falls within a pre-minted offer's range",
  NO_RESERVED_RANGE_FOR_OFFER: "Offer id not associated with a reserved range",
  OFFER_RANGE_ALREADY_RESERVED: "Offer id already associated with a reserved range",
  INVALID_RANGE_START: "Range start too low",
  INVALID_AMOUNT_TO_MINT: "Amount to mint is greater than remaining un-minted in range",
  NO_SILENT_MINT_ALLOWED: "Only owner's mappings can be updated without event",
  TOO_MANY_TO_MINT: "Exceeded maximum amount to mint in a single transaction",
  OFFER_EXPIRED_OR_VOIDED: "Offer expired or voided",
  OFFER_STILL_VALID: "Offer still valid",
  NOTHING_TO_BURN: "Nothing to burn",
  NOT_COMMITTABLE: "Token not committable",
  INVALID_TO_ADDRESS: "Tokens can only be pre-mined to the contract or contract owner address",
  EXTERNAL_CALL_FAILED: "External call failed",

  // Funds related
  NATIVE_WRONG_ADDRESS: "Native token address must be 0",
  NATIVE_WRONG_AMOUNT: "Transferred value must match amount",
  TOKEN_TRANSFER_FAILED: "Token transfer failed",
  INSUFFICIENT_VALUE_RECEIVED: "Insufficient value received",
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
  EOA_FUNCTION_CALL_SAFE_ERC20: "Address: call to non-contract",
  ERC721_NON_EXISTENT: "ERC721: invalid token ID",
  ERC721_CALLER_NOT_OWNER_OR_APPROVED: "ERC721: caller is not token owner nor approved",
  OWNABLE_NOT_OWNER: "Ownable: caller is not the owner",
  OWNABLE_ZERO_ADDRESS: "Ownable: new owner is the zero address",
  SAFE_ERC20_LOW_LEVEL_CALL: "SafeERC20: low-level call failed",
  SAFE_ERC20_NOT_SUCCEEDED: "SafeERC20: ERC20 operation did not succeed",
  INITIALIZABLE_ALREADY_INITIALIZED: "Initializable: contract is already initialized",

  // Meta-Transactions related
  NONCE_USED_ALREADY: "Nonce used already",
  FUNCTION_CALL_NOT_SUCCESSFUL: "Function call not successful",
  INVALID_SIGNATURE: "Invalid signature",
  SIGNER_AND_SIGNATURE_DO_NOT_MATCH: "Signer and signature do not match",
  INVALID_FUNCTION_NAME: "Invalid function name",
  FUNCTION_NOT_ALLOWLISTED: "Function can not be executed via meta transaction",

  // Dispute related
  DISPUTE_PERIOD_HAS_ELAPSED: "Dispute period has already elapsed",
  DISPUTE_HAS_EXPIRED: "Dispute has expired",
  INVALID_BUYER_PERCENT: "Invalid buyer percent",
  DISPUTE_STILL_VALID: "Dispute still valid",
  INVALID_DISPUTE_TIMEOUT: "Invalid dispute timeout",
  TOO_MANY_DISPUTES: "Exceeded maximum disputes in a single transaction",
  ESCALATION_NOT_ALLOWED: "Disputes without dispute resolver cannot be escalated",

  // Config related
  FEE_PERCENTAGE_INVALID: "Percentage representation must be less than 10000",
  VALUE_ZERO_NOT_ALLOWED: "Value must be greater than 0",

  // ERC2981 related
  ROYALTY_FEE_INVALID: "ERC2981: royalty fee exceeds protocol limit",

  // Diamond related
  TOO_MANY_FUNCTIONS: "Too many functions on facet.",
  ONLY_UPGRADER: "Caller must have UPGRADER role",
  NO_SELECTORS_TO_CUT: "LibDiamondCut: No selectors in facet to cut",
  FUNCTION_ALREADY_EXISTS: "LibDiamondCut: Can't add function that already exists",
  REMOVING_FUNCTION_DOES_NOT_EXIST: "LibDiamondCut: Can't remove function that doesn't exist",
  REMOVING_NON_ZERO_ADDRESS_FACET: "LibDiamondCut: Remove facet address must be address(0)",
  REMOVING_IMMUTABLE_FUNCTION: "LibDiamondCut: Can't remove immutable function",
  REPLACING_IMMUTABLE_FUNCTION: "LibDiamondCut: Can't replace immutable function",
  REPLACING_WITH_SAME_FUNCTION: "LibDiamondCut: Can't replace function with same function",
  REPLACING_FUNCTION_DOES_NOT_EXIST: "LibDiamondCut: Can't replace function that doesn't exist",
  CONTRACT_NOT_ALLOWED: "Address cannot be a contract",
  INIT_REVERTED: "LibDiamondCut: _init function reverted",
  INIT_ZERO_ADDRESS_NON_EMPTY_CALLDATA: "LibDiamondCut: _init is address(0) but _calldata is not empty",
  INIT_EMPTY_CALLDATA_NON_ZERO_ADDRESS: "LibDiamondCut: _calldata is empty but _init is not address(0)",
  INIT_ADDRESS_WITH_NO_CODE: "LibDiamondCut: _init address has no code",
};
