// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.21;

interface BosonErrors {
    // Pause related
    error NotPaused();
    error RegionPaused(); //ToDo consider adding the region to the error message

    // General
    error InvalidAddress();
    error InvalidState();
    error ArrayLengthMismatch();

    // Reentrancy guard
    error ReentrancyGuard();

    // Protocol initialization related
    error AlreadyInitialized();
    error ProtocolInitializationFailed();
    error VersionMustBeSet();
    error AddressesAndCalldataLengthMismatch();
    error WrongCurrentVersion();
    error DirectInitializationNotAllowed();
    error TwinsAlreadyExist();

    // Access related
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

    // Account-related
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

    // Offer related
    error NoSuchOffer();
    error InvalidOfferPeriod();
    error InvalidOfferPenalty();
    error OfferMustBeActive();
    error OfferMustBeUnique();
    error OfferHasBeenVoided();
    error OfferHasExpired();
    error OfferNotAvailable();
    error OfferSoldOut();
    error CannotCommit();
    error ExchangeForOfferExists();
    error AmbiguousVoucherExpiry();
    error InvalidRedemptionPeriod();
    error InvalidDisputePeriod();
    error InvalidResolutionPeriod();
    error InvalidDisputeResolver();
    error InvalidQuantityAvailable();
    error DRUnsupportedFee();
    error AgentFeeAmountTooHigh();
    error NoSuchCollection();

    // Group related
    error NoSuchGroup();
    error OfferNotInGroup();
    error NothingUpdated();
    error InvalidConditionParameters();
    error GroupHasNoCondition();
    error GroupHasCondition();
    error MaxCommitsReached();
    error TokenIdNotInConditionRange();
    error InvalidTokenId();

    // Exchange related
    error NoSuchExchange();
    error DisputePeriodNotElapsed();
    error VoucherNotRedeemable();
    error VoucherExtensionNotValid();
    error VoucherStillValid();
    error VoucherHasExpired();
    error ExchangeIsNotInAFinalState();
    error ExchangeAlreadyExists();
    error InvalidRangeLength();

    // Twin related
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

    // Bundle related
    error NoSuchBundle();
    error TwinNotInBundle();
    error OfferNotInBundle();
    error BundleOfferMustBeUnique();
    error BundleTwinMustBeUnique();
    error ExchangeForBundledOffersExists();
    error InsufficientTwinSupplyToCoverBundleOffers();
    error BundleRequiresAtLeastOneTwinAndOneOffer();

    // Funds related
    error NativeWrongAddress();
    error NativeWrongAmount();
    error TokenAmountMismatch();
    error NothingToWithdraw();
    error NotAuthorized();
    error TokenTransferFailed();
    error InsufficientValueReceived();
    error InsufficientAvailableFunds();
    error NativeNotAllowed();

    // Meta-Transactions related
    error NonceUsedAlready();
    error SignerAndSignatureDoNotMatch();
    error InvalidFunctionName();
    error InvalidSignature();
    error FunctionNotAllowlisted();

    // Dispute related
    error DisputePeriodHasElapsed();
    error DisputeHasExpired();
    error InvalidBuyerPercent();
    error DisputeStillValid();
    error InvalidDisputeTimeout();
    error EscalationNotAllowed();

    // Config related
    error InvalidFeePercentage();
    error ValueZeroNotAllowed();

    // BosonVoucher
    error ExchangeIdInReservedRange();
    error NoReservedRangeForOffer();
    error OfferRangeAlreadyReserved();
    error InvalidRangeStart();
    error InvalidAmountToMint();
    error NoSilentMintAllowed();
    error OfferExpiredOrVoided();
    error OfferStillValid();
    error AmountExceedsRangeOrNothingToBurn();
    error InvalidRoyaltyFee();
    error NotCommittable();
    error InvalidToAddress();
    error ExternalCallFailed();
    error InteractionNotAllowed();
}
