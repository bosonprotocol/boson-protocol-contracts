import "./BosonTypes.sol";

// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.21;

interface BosonErrors {
    // Revert Reasons: Pause related
    // string constant NOT_PAUSED = "Protocol is not currently paused";
    // string constant REGION_PAUSED = "This region of the protocol is currently paused";
    error NotPaused();
    error RegionPaused(); //ToDo consider adding the region to the error message

    // // Revert Reasons: General
    // string constant INVALID_ADDRESS = "Invalid address";
    // string constant INVALID_STATE = "Invalid state";
    // string constant ARRAY_LENGTH_MISMATCH = "Array length mismatch";
    error InvalidAddress();
    error InvalidState();
    error ArrayLengthMismatch();

    // // Reentrancy guard
    // string constant REENTRANCY_GUARD = "ReentrancyGuard: reentrant call";
    error ReentrancyGuard();

    // // Revert Reasons: Protocol initialization related
    // string constant ALREADY_INITIALIZED = "Already initialized";
    // string constant PROTOCOL_INITIALIZATION_FAILED = "Protocol initialization failed";
    // string constant VERSION_MUST_BE_SET = "Version cannot be empty";
    // string constant ADDRESSES_AND_CALLDATA_LENGTH_MISMATCH = "Addresses and calldata must be same length";
    // string constant WRONG_CURRENT_VERSION = "Wrong current protocol version";
    // string constant DIRECT_INITIALIZATION_NOT_ALLOWED = "Direct initializtion is not allowed";
    // string constant TWINS_ALREADY_EXIST = "Should not have any twins yet";
    error AlreadyInitialized();
    error ProtocolInitializationFailed();
    error VersionMustBeSet();
    error AddressesAndCalldataLengthMismatch();
    error WrongCurrentVersion();
    error DirectInitializationNotAllowed();
    error TwinsAlreadyExist();

    // // Revert Reasons: Access related
    // string constant ACCESS_DENIED = "Access denied, caller doesn't have role";
    // string constant NOT_ASSISTANT = "Not seller's assistant";
    // string constant NOT_ADMIN = "Not admin";
    // string constant CLERK_DEPRECATED = "Clerk is deprecated and must be set to address 0";
    // string constant NOT_ADMIN_AND_ASSISTANT = "Not admin and assistant";
    // string constant NOT_BUYER_OR_SELLER = "Not buyer or seller";
    // string constant NOT_VOUCHER_HOLDER = "Not current voucher holder";
    // string constant NOT_BUYER_WALLET = "Not buyer's wallet address";
    // string constant NOT_AGENT_WALLET = "Not agent's wallet address";
    // string constant NOT_DISPUTE_RESOLVER_ASSISTANT = "Not dispute resolver's assistant address";
    error AccessDenied();
    error NotAssistant();
    error NotAdmin();
    error ClerkDeprecated();
    error NotAdminAndAssistant();
    error NotBuyerOrSeller();
    error NotVoucherHolder();
    error NotBuyerWallet();
    error NotAgentWallet();
    error NotDisputeResolverAssistant();

    // // Revert Reasons: Account-related
    // string constant NO_SUCH_SELLER = "No such seller";
    // string constant MUST_BE_ACTIVE = "Account must be active";
    // string constant SELLER_ADDRESS_MUST_BE_UNIQUE = "Seller address cannot be assigned to another seller Id";
    // string constant BUYER_ADDRESS_MUST_BE_UNIQUE = "Buyer address cannot be assigned to another buyer Id";
    // string constant DISPUTE_RESOLVER_ADDRESS_MUST_BE_UNIQUE = "Dispute resolver address cannot be assigned to another dispute resolver Id";
    // string constant AGENT_ADDRESS_MUST_BE_UNIQUE = "Agent address cannot be assigned to another agent Id";
    // string constant NO_SUCH_BUYER = "No such buyer";
    // string constant NO_SUCH_AGENT = "No such agent";
    // string constant WALLET_OWNS_VOUCHERS = "Wallet address owns vouchers";
    // string constant NO_SUCH_DISPUTE_RESOLVER = "No such dispute resolver";
    // string constant INVALID_ESCALATION_PERIOD = "Invalid escalation period";
    // string constant INEXISTENT_DISPUTE_RESOLVER_FEES = "Dispute resolver fees are not present";
    // string constant DUPLICATE_DISPUTE_RESOLVER_FEES = "Duplicate dispute resolver fee";
    // string constant FEE_AMOUNT_NOT_YET_SUPPORTED = "Non-zero dispute resolver fees not yet supported";
    // string constant DISPUTE_RESOLVER_FEE_NOT_FOUND = "Dispute resolver fee not found";
    // string constant SELLER_ALREADY_APPROVED = "Seller id is approved already";
    // string constant SELLER_NOT_APPROVED = "Seller id is not approved";
    // string constant INEXISTENT_ALLOWED_SELLERS_LIST = "Allowed sellers are not present";
    // string constant INVALID_AUTH_TOKEN_TYPE = "Invalid AuthTokenType";
    // string constant ADMIN_OR_AUTH_TOKEN = "An admin address or an auth token is required";
    // string constant AUTH_TOKEN_MUST_BE_UNIQUE = "Auth token cannot be assigned to another entity of the same type";
    // string constant INVALID_AGENT_FEE_PERCENTAGE = "Sum of agent fee percentage and protocol fee percentage should be <= max fee percentage limit";
    // string constant NO_PENDING_UPDATE_FOR_ACCOUNT = "No pending updates for the given account";
    // string constant UNAUTHORIZED_CALLER_UPDATE = "Caller has no permission to approve this update";
    // string constant NO_UPDATE_APPLIED = "No update applied or requested approval";
    // string constant CLONE_CREATION_FAILED = "Clone creation failed";
    // string constant SELLER_SALT_NOT_UNIQUE = "Seller salt not unique";
    error NoSuchSeller();
    error MustBeActive();
    error SellerAddressMustBeUnique();
    error BuyerAddressMustBeUnique();
    error DisputeResolverAddressMustBeUnique();
    error AgentAddressMustBeUnique();
    error NoSuchBuyer();
    error NoSuchAgent();
    error WalletOwnsVouchers();
    error NoSuchDisputeResolver();
    error InvalidEscalationPeriod();
    error InexistentDisputeResolverFees();
    error DuplicateDisputeResolverFees();
    error FeeAmountNotYetSupported();
    error DisputeResolverFeeNotFound();
    error SellerAlreadyApproved();
    error SellerNotApproved();
    error InexistentAllowedSellersList();
    error InvalidAuthTokenType();
    error AdminOrAuthToken();
    error AuthTokenMustBeUnique();
    error InvalidAgentFeePercentage();
    error NoPendingUpdateForAccount();
    error UnauthorizedCallerUpdate();
    error NoUpdateApplied();
    error CloneCreationFailed();
    error SellerSaltNotUnique();

    // // Revert Reasons: Offer related
    // string constant NO_SUCH_OFFER = "No such offer";
    // string constant OFFER_PERIOD_INVALID = "Offer period invalid";
    // string constant OFFER_PENALTY_INVALID = "Offer penalty invalid";
    // string constant OFFER_MUST_BE_ACTIVE = "Offer must be active";
    // string constant OFFER_MUST_BE_UNIQUE = "Offer must be unique to a group";
    // string constant OFFER_HAS_BEEN_VOIDED = "Offer has been voided";
    // string constant OFFER_HAS_EXPIRED = "Offer has expired";
    // string constant OFFER_NOT_AVAILABLE = "Offer is not yet available";
    // string constant OFFER_SOLD_OUT = "Offer has sold out";
    // string constant CANNOT_COMMIT = "Caller cannot commit";
    // string constant EXCHANGE_FOR_OFFER_EXISTS = "Exchange for offer exists";
    // string constant AMBIGUOUS_VOUCHER_EXPIRY = "Exactly one of voucherRedeemableUntil and voucherValid must be non zero";
    // string constant REDEMPTION_PERIOD_INVALID = "Redemption period invalid";
    // string constant INVALID_DISPUTE_PERIOD = "Invalid dispute period";
    // string constant INVALID_RESOLUTION_PERIOD = "Invalid resolution period";
    // string constant INVALID_DISPUTE_RESOLVER = "Invalid dispute resolver";
    // string constant INVALID_QUANTITY_AVAILABLE = "Invalid quantity available";
    // string constant DR_UNSUPPORTED_FEE = "Dispute resolver does not accept this token";
    // string constant AGENT_FEE_AMOUNT_TOO_HIGH = "Sum of agent fee amount and protocol fee amount should be <= offer fee limit";
    // string constant NO_SUCH_COLLECTION = "No such collection";
    error NoSuchOffer();
    error OfferPeriodInvalid();
    error OfferPenaltyInvalid();
    error OfferMustBeActive();
    error OfferMustBeUnique();
    error OfferHasBeenVoided();
    error OfferHasExpired();
    error OfferNotAvailable();
    error OfferSoldOut();
    error CannotCommit();
    error ExchangeForOfferExists();
    error AmbiguousVoucherExpiry();
    error RedemptionPeriodInvalid();
    error InvalidDisputePeriod(); // ToDo: put "invalid" to the end
    error InvalidResolutionPeriod(); // ToDo: put "invalid" to the end
    error InvalidDisputeResolver(); // ToDo: put "invalid" to the end
    error InvalidQuantityAvailable(); // ToDo: put "invalid" to the end
    error DRUnsupportedFee();
    error AgentFeeAmountTooHigh();
    error NoSuchCollection();

    // // Revert Reasons: Group related
    // string constant NO_SUCH_GROUP = "No such group";
    // string constant OFFER_NOT_IN_GROUP = "Offer not part of the group";
    // string constant NOTHING_UPDATED = "Nothing updated";
    // string constant INVALID_CONDITION_PARAMETERS = "Invalid condition parameters";
    // string constant GROUP_HAS_NO_CONDITION = "Offer belongs to a group without a condition. Use commitToOffer instead";
    // string constant GROUP_HAS_CONDITION = "Offer belongs to a group with a condition. Use commitToConditionalOffer instead";
    // string constant MAX_COMMITS_REACHED = "Max commits reached";
    // string constant TOKEN_ID_NOT_IN_CONDITION_RANGE = "Token id not in condition range";
    // string constant INVALID_TOKEN_ID = "ERC721 and ERC20 require zero tokenId";
    error NoSuchGroup();
    error OfferNotInGroup();
    error NothingUpdated();
    error InvalidConditionParameters();
    error GroupHasNoCondition();
    error GroupHasCondition();
    error MaxCommitsReached();
    error TokenIdNotInConditionRange();
    error InvalidTokenId();

    // // Revert Reasons: Exchange related
    // string constant NO_SUCH_EXCHANGE = "No such exchange";
    // string constant DISPUTE_PERIOD_NOT_ELAPSED = "Dispute period has not yet elapsed";
    // string constant VOUCHER_NOT_REDEEMABLE = "Voucher not yet valid or already expired";
    // string constant VOUCHER_EXTENSION_NOT_VALID = "Proposed date is not later than the current one";
    // string constant VOUCHER_STILL_VALID = "Voucher still valid";
    // string constant VOUCHER_HAS_EXPIRED = "Voucher has expired";
    // string constant EXCHANGE_IS_NOT_IN_A_FINAL_STATE = "Exchange is not in a final state";
    // string constant EXCHANGE_ALREADY_EXISTS = "Exchange already exists";
    // string constant INVALID_RANGE_LENGTH = "Range length is too large or zero";
    error NoSuchExchange();
    error DisputePeriodNotElapsed();
    error VoucherNotRedeemable();
    error VoucherExtensionNotValid();
    error VoucherStillValid();
    error VoucherHasExpired();
    error ExchangeIsNotInAFinalState();
    error ExchangeAlreadyExists();
    error InvalidRangeLength();

    // // Revert Reasons: Twin related
    // string constant NO_SUCH_TWIN = "No such twin";
    // string constant NO_TRANSFER_APPROVED = "No transfer approved";
    // string constant TWIN_TRANSFER_FAILED = "Twin could not be transferred";
    // string constant UNSUPPORTED_TOKEN = "Unsupported token";
    // string constant BUNDLE_FOR_TWIN_EXISTS = "Bundle for twin exists";
    // string constant INVALID_SUPPLY_AVAILABLE = "supplyAvailable can't be zero";
    // string constant INVALID_AMOUNT = "Invalid twin amount";
    // string constant INVALID_TWIN_PROPERTY = "Invalid property for selected token type";
    // string constant INVALID_TWIN_TOKEN_RANGE = "Token range is already being used in another twin";
    // string constant INVALID_TOKEN_ADDRESS = "Token address is a contract that doesn't implement the interface for selected token type";
    error NoSuchTwin();
    error NoTransferApproved();
    error TwinTransferUnsuccessful();
    error UnsupportedToken();
    error BundleForTwinExists();
    error InvalidSupplyAvailable();
    error InvalidAmount();
    error InvalidTwinProperty();
    error InvalidTwinTokenRange();
    error InvalidTokenAddress();

    // // Revert Reasons: Bundle related
    // string constant NO_SUCH_BUNDLE = "No such bundle";
    // string constant TWIN_NOT_IN_BUNDLE = "Twin not part of the bundle";
    // string constant OFFER_NOT_IN_BUNDLE = "Offer not part of the bundle";
    // string constant BUNDLE_OFFER_MUST_BE_UNIQUE = "Offer must be unique to a bundle";
    // string constant BUNDLE_TWIN_MUST_BE_UNIQUE = "Twin must be unique to a bundle";
    // string constant EXCHANGE_FOR_BUNDLED_OFFERS_EXISTS = "Exchange for the bundled offers exists";
    // string constant INSUFFICIENT_TWIN_SUPPLY_TO_COVER_BUNDLE_OFFERS = "Insufficient twin supplyAvailable to cover total quantity of bundle offers";
    // string constant BUNDLE_REQUIRES_AT_LEAST_ONE_TWIN_AND_ONE_OFFER = "Bundle must have at least one twin and one offer";
    error NoSuchBundle();
    error TwinNotInBundle();
    error OfferNotInBundle();
    error BundleOfferMustBeUnique();
    error BundleTwinMustBeUnique();
    error ExchangeForBundledOffersExists();
    error InsufficientTwinSupplyToCoverBundleOffers();
    error BundleRequiresAtLeastOneTwinAndOneOffer();

    // // Revert Reasons: Funds related
    // string constant NATIVE_WRONG_ADDRESS = "Native token address must be 0";
    // string constant NATIVE_WRONG_AMOUNT = "Transferred value must match amount";
    // string constant TOKEN_AMOUNT_MISMATCH = "Number of amounts should match number of tokens";
    // string constant NOTHING_TO_WITHDRAW = "Nothing to withdraw";
    // string constant NOT_AUTHORIZED = "Not authorized to withdraw";
    // string constant TOKEN_TRANSFER_FAILED = "Token transfer failed";
    // string constant INSUFFICIENT_VALUE_RECEIVED = "Insufficient value received";
    // string constant INSUFFICIENT_AVAILABLE_FUNDS = "Insufficient available funds";
    // string constant NATIVE_NOT_ALLOWED = "Transfer of native currency not allowed";
    error NativeWrongAddress();
    error NativeWrongAmount();
    error TokenAmountMismatch();
    error NothingToWithdraw();
    error NotAuthorized();
    error TokenTransferFailed();
    error InsufficientValueReceived();
    error InsufficientAvailableFunds();
    error NativeNotAllowed();

    // // Revert Reasons: Meta-Transactions related
    // string constant NONCE_USED_ALREADY = "Nonce used already";
    // string constant SIGNER_AND_SIGNATURE_DO_NOT_MATCH = "Signer and signature do not match";
    // string constant INVALID_FUNCTION_NAME = "Invalid function name";
    // string constant INVALID_SIGNATURE = "Invalid signature";
    // string constant FUNCTION_NOT_ALLOWLISTED = "Function can not be executed via meta transaction";
    error NonceUsedAlready(); // toDo: put "used" to the end
    // error FunctionCallNotSuccessful();
    error SignerAndSignatureDoNotMatch();
    error InvalidFunctionName();
    error InvalidSignature();
    error FunctionNotAllowlisted();

    // // Revert Reasons: Dispute related
    // string constant DISPUTE_PERIOD_HAS_ELAPSED = "Dispute period has already elapsed";
    // string constant DISPUTE_HAS_EXPIRED = "Dispute has expired";
    // string constant INVALID_BUYER_PERCENT = "Invalid buyer percent";
    // string constant DISPUTE_STILL_VALID = "Dispute still valid";
    // string constant INVALID_DISPUTE_TIMEOUT = "Invalid dispute timeout";
    // string constant ESCALATION_NOT_ALLOWED = "Disputes without dispute resolver cannot be escalated";
    error DisputePeriodHasElapsed();
    error DisputeHasExpired();
    error InvalidBuyerPercent();
    error DisputeStillValid();
    error InvalidDisputeTimeout();
    error EscalationNotAllowed();

    // // Revert Reasons: Config related
    // string constant FEE_PERCENTAGE_INVALID = "Percentage representation must be less than 10000";
    // string constant VALUE_ZERO_NOT_ALLOWED = "Value must be greater than 0";
    error FeePercentageInvalid();
    error ValueZeroNotAllowed();

    // // BosonVoucher
    // string constant EXCHANGE_ID_IN_RESERVED_RANGE = "Exchange id falls within a pre-minted offer's range";
    // string constant NO_RESERVED_RANGE_FOR_OFFER = "Offer id not associated with a reserved range";
    // string constant OFFER_RANGE_ALREADY_RESERVED = "Offer id already associated with a reserved range";
    // string constant INVALID_RANGE_START = "Range start too low";
    // string constant INVALID_AMOUNT_TO_MINT = "Amount to mint is greater than remaining un-minted in range";
    // string constant NO_SILENT_MINT_ALLOWED = "Only owner's mappings can be updated without event";
    // string constant OFFER_EXPIRED_OR_VOIDED = "Offer expired or voided";
    // string constant OFFER_STILL_VALID = "Offer still valid";
    // string constant AMOUNT_EXCEEDS_RANGE_OR_NOTHING_TO_BURN = "Amount exceeds the range or there is nothing to burn";
    // string constant ROYALTY_FEE_INVALID = "ERC2981: royalty fee exceeds protocol limit";
    // string constant NOT_COMMITTABLE = "Token not committable";
    // string constant INVALID_TO_ADDRESS = "Tokens can only be pre-mined to the contract or contract owner address";
    // string constant EXTERNAL_CALL_FAILED = "External call failed";
    // string constant INTERACTION_NOT_ALLOWED = "Interaction not allowed";
    error ExchangeIdInReservedRange();
    error NoReservedRangeForOffer();
    error OfferRangeAlreadyReserved();
    error InvalidRangeStart();
    error InvalidAmountToMint();
    error NoSilentMintAllowed();
    error OfferExpiredOrVoided();
    error OfferStillValid();
    error AmountExceedsRangeOrNothingToBurn();
    // error OwnableZeroAddress();
    error RoyaltyFeeInvalid();
    error NotCommittable();
    error InvalidToAddress();
    error ExternalCallFailed();
    // error ERC721InvalidTokenId();
    error InteractionNotAllowed();
}
