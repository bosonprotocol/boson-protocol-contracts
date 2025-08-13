// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { BosonTypes } from "./BosonTypes.sol";

interface BosonErrors {
    // Pause related
    // Trying to unpause a protocol when it's not paused
    error NotPaused();
    // Whenever a region is paused, and a method from that region is called
    error RegionPaused(BosonTypes.PausableRegion region);

    // General
    // Input parameter of type address is zero address
    error InvalidAddress();
    // Exchange or dispute is in different state than expected when certain action is called
    error InvalidState();
    // Two or more array parameters with different lengths
    error ArrayLengthMismatch();
    // Array elements that are not in ascending order (i.e arr[i-1] > arr[i])
    error NonAscendingOrder();
    // Called contract returned an unexpected value
    error UnexpectedDataReturned(bytes data);

    // Reentrancy guard
    // Reentrancy guard is active and second call to protocol is made
    error ReentrancyGuard();

    // Protocol initialization related
    // Trying to initialize the facet when it's already initialized
    error AlreadyInitialized(); // ToDo consider adding the facet to the error message
    // Initialization of some facet failed
    error ProtocolInitializationFailed(); // ToDo consider adding the facet to the error message
    // Trying to initialize the protocol with empty version
    error VersionMustBeSet();
    // Length of _addresses and _calldata arrays do not match
    error AddressesAndCalldataLengthMismatch(); // ToDo consider reusing ArrayLengthMismatch
    // The new protocol version is not subsequent to the current one
    error WrongCurrentVersion();
    // Initialization can be done only through proxy
    error DirectInitializationNotAllowed();
    // Initialization of v2.3.0 can be done only if not twin exists
    error TwinsAlreadyExist();

    // Access related
    // ToDo consider having a single error, with a parameter for the role
    // Caller is not authorized to call the method
    error AccessDenied();
    // Caller is not entitiy's assistant
    error NotAssistant();
    // Caller is not entitiy's admin
    error NotAdmin();
    // Caller is not entitiy's admin and assistant
    error NotAdminAndAssistant();
    // Caller is neither the buyer or the seller involved in the exchange
    error NotBuyerOrSeller();
    // Caller is not the owner of the voucher
    error NotVoucherHolder();
    // Caller is not the buyer
    error NotBuyerWallet();
    // Caller is not the agent
    error NotAgentWallet();
    // Caller is not dispute resolver assistant
    error NotDisputeResolverAssistant();
    // Supplied clerk is not zero address
    error ClerkDeprecated();

    // Account-related
    // Entity must be active
    error MustBeActive();
    // Seller's address cannot be already used in another seller
    error SellerAddressMustBeUnique();
    // Buyer's address cannot be already used in another buyer
    error BuyerAddressMustBeUnique();
    // DR's address cannot be already used in another DR
    error DisputeResolverAddressMustBeUnique();
    // Agent's address cannot be already used in another agent
    error AgentAddressMustBeUnique();
    // Seller does not exist
    error NoSuchSeller();
    // Buyer does not exist
    error NoSuchBuyer();
    // Dispute resolver does not exist
    error NoSuchDisputeResolver();
    // Agent does not exist
    error NoSuchAgent();
    // Entity does not exist
    error NoSuchEntity();
    // Buyer is involved in an non-finalized exchange
    error WalletOwnsVouchers();
    // Escalation period is not greater than zero or is more than the max allowed
    error InvalidEscalationPeriod();
    // Action would remove the last supported fee from the DR (must always have at least one)
    error InexistentDisputeResolverFees();
    // Trying to add a fee that already exists
    error DuplicateDisputeResolverFees();
    // Trying to remove a fee that does not exist
    error DisputeResolverFeeNotFound();
    // Trying to approve a seller that is already approved (list of sellers that DR will handle disputes for)
    error SellerAlreadyApproved();
    // Trying to assing a DR that had not approved the seller
    error SellerNotApproved();
    // Trying to add or removed 0 sellers
    error InexistentAllowedSellersList();
    // Custom auth token is not yet supported
    error InvalidAuthTokenType();
    // Seller must use either and address or auth token for authentication, but not both
    error AdminOrAuthToken();
    // A single auth token can only be used by one seller
    error AuthTokenMustBeUnique();
    // Sum of protocol and agent fee exceed the max allowed fee
    error InvalidAgentFeePercentage();
    // Trying to finalize the update, while it's not even started
    error NoPendingUpdateForAccount();
    // Only the account itself can finalize the update
    error UnauthorizedCallerUpdate();
    // Trying to update the account with the same values
    error NoUpdateApplied();
    // Creating a seller's collection failed
    error CloneCreationFailed();
    // Seller's salt is already used by another seller
    error SellerSaltNotUnique();

    // Offer related
    // Offer does not exist
    error NoSuchOffer();
    // Offer parameters are invalid
    error InvalidOffer();
    // Collection index is invalid for the context
    error InvalidCollectionIndex();
    // Offer finishes in the past or it starts after it finishes
    error InvalidOfferPeriod();
    // Buyer cancellation penalty is higher than the item price
    error InvalidOfferPenalty();
    // New offer must be actiove
    error OfferMustBeActive();
    // Offer can be added to same group only once
    error OfferMustBeUnique();
    // Offer has been voided
    error OfferHasBeenVoided();
    // Current timestamp is higher than offer's expiry timestamp
    error OfferHasExpired();
    // Current timestamp is lower than offer's start timestamp
    error OfferNotAvailable();
    // Offer's quantity available is zero
    error OfferSoldOut();
    // Buyer is not allowed to commit to the offer (does not meet the token gating requirements)
    error CannotCommit();
    // Bundle cannot be created since exchganes for offer exist already
    error ExchangeForOfferExists();
    // Buyer-initiated offer cannot have seller-specific fields (sellerId, collectionIndex, royaltyInfo)
    error InvalidBuyerOfferFields();
    // Seller-initiated offer cannot have buyer-specific fields (buyerId, quantityAvailable)
    error InvalidSellerOfferFields();
    // Invalid offer creator value specified
    error InvalidOfferCreator();
    // Voucher must have either a fixed expiry or a fixed redeemable period, not both
    error AmbiguousVoucherExpiry();
    // Redemption period starts after it ends or it ends before offer itself expires
    error InvalidRedemptionPeriod();
    // Dispute period is less than minimal dispute period allowed
    error InvalidDisputePeriod();
    // Resolution period is not within the allowed range or it's being misconfigured (minimal > maximal)
    error InvalidResolutionPeriod();
    // Dispute resolver does not exist or is not active
    error InvalidDisputeResolver();
    // Quantity available is zero
    error InvalidQuantityAvailable();
    // Chose DR does not support the fees in the chosen exchange token
    error DRUnsupportedFee();
    // Sum of protocol and agent fee exceeds the max allowed fee
    error AgentFeeAmountTooHigh();
    // Sum of protocol and agent fee exceeds the seller defined max fee
    error TotalFeeExceedsLimit();
    // Collection does not exist
    error NoSuchCollection();
    // Royalty recipient is not allow listed for the seller
    error InvalidRoyaltyRecipient();
    // Total royality fee exceeds the max allowed
    error InvalidRoyaltyPercentage();
    // Specified royalty recipient already added
    error RecipientNotUnique();
    // Trying to access an out of bounds royalty recipient
    error InvalidRoyaltyRecipientId();
    // Array of royalty recipients is not sorted by id
    error RoyaltyRecipientIdsNotSorted();
    // Trying to remove the default recipient (treasury)
    error CannotRemoveDefaultRecipient();
    // Supplying too many Royalty info structs
    error InvalidRoyaltyInfo();
    // Trying to change the default recipient address (treasury)
    error WrongDefaultRecipient();
    // Price discovery offer has non zero price
    error InvalidPriceDiscoveryPrice();
    // Trying to set the same mutualizer as the existing one
    error SameMutualizerAddress();

    // Group related
    // Group does not exist
    error NoSuchGroup();
    // Offer is not in a group
    error OfferNotInGroup();
    // Group remains the same
    error NothingUpdated();
    // There is a logical error in the group's condition parameters or it's not supported yet
    error InvalidConditionParameters();
    // Group does not have a condition
    error GroupHasNoCondition();
    // Group has a condition
    error GroupHasCondition();
    // User exhaused the number of commits allowed for the group
    error MaxCommitsReached();
    // The supplied token id is outside the condition's range
    error TokenIdNotInConditionRange();
    // ERC20 and ERC721 require zero token id
    error InvalidTokenId();

    // Exchange related
    // Exchange does not exist
    error NoSuchExchange();
    // Exchange cannot be completed yet
    error DisputePeriodNotElapsed();
    // Current timestamp is outside the voucher's redeemable period
    error VoucherNotRedeemable();
    // New expiration date is earlier than existing expiration date
    error VoucherExtensionNotValid();
    // Voucher cannot be expired yet
    error VoucherStillValid();
    // Voucher has expired and cannot be transferred anymore
    error VoucherHasExpired();
    // Exchange has not been finalized yet
    error ExchangeIsNotInAFinalState();
    // Exchange with the same id already exists
    error ExchangeAlreadyExists();
    // Range length is 0, is more than quantity available or it would cause an overflow
    error InvalidRangeLength();
    // Exchange is being finalized into an invalid state
    error InvalidTargeExchangeState();

    // Twin related
    // Twin does not exist
    error NoSuchTwin();
    // Seller did not approve the twin transfer
    error NoTransferApproved();
    // Twin transfer failed
    error TwinTransferUnsuccessful();
    // Token address is 0 or it does not implement the required interface
    error UnsupportedToken();
    // Twin cannot be removed if it's in a bundle
    error BundleForTwinExists();
    // Supply available is zero
    error InvalidSupplyAvailable();
    // Twin is Fungible or Multitoken and amount was set
    error InvalidAmount();
    // Twin is NonFungible and amount was not set
    error InvalidTwinProperty(); // ToDo consider replacing with InvalidAmount
    // Token range overlap with another, starting token id is too high or end of range would overflow
    error InvalidTwinTokenRange();
    // Token does not support IERC721 interface
    error InvalidTokenAddress();

    // Bundle related
    // Bundle does not exist
    error NoSuchBundle();
    // Twin is not in a bundle
    error TwinNotInBundle();
    // Offer is not in a bundle
    error OfferNotInBundle();
    // Offer can appear in a bundle only once
    error BundleOfferMustBeUnique();
    // Twin can appear in a bundle only once
    error BundleTwinMustBeUnique();
    // Twin supply does not covver all offers in the bundle
    error InsufficientTwinSupplyToCoverBundleOffers();
    // Bundle cannot be created without an offer or a twin
    error BundleRequiresAtLeastOneTwinAndOneOffer();

    // Funds related
    // Native token must be represented with zero address
    error NativeWrongAddress();
    // Amount sent along (msg.value) does not match the expected amount
    error NativeWrongAmount();
    // Token list lenght does not match the amount list length
    error TokenAmountMismatch(); // ToDo consider replacing with ArrayLengthMismatch
    // Token list is empty
    error NothingToWithdraw();
    // Call is not allowed to transfer the funds
    error NotAuthorized();
    // Token transfer failed
    error TokenTransferFailed();
    // Received amount does not match the expected amount
    error InsufficientValueReceived();
    // Seller's pool does not have enough funds to encumber
    error InsufficientAvailableFunds();
    // Native token was sent when ERC20 was expected
    error NativeNotAllowed();
    // Trying to deposit zero amount
    error ZeroDepositNotAllowed();

    // DR Fee related
    // DR fee mutualizer cannot provide coverage for the fee
    error DRFeeMutualizerCannotProvideCoverage();

    // Meta-Transactions related
    // Meta-transaction nonce is invalid
    error NonceUsedAlready();
    // Function signature does not match it's name
    error InvalidFunctionName();
    // Signature has invalid parameters
    error InvalidSignature();
    // Function is not allowed to be executed as a meta-transaction
    error FunctionNotAllowlisted();
    // Signer does not match the expected one or ERC1271 signature is not valid
    error SignatureValidationFailed();

    // Dispute related
    // Dispute cannot be raised since the period to do it has elapsed
    error DisputePeriodHasElapsed();
    // Mutualizer address does not implement the required interface
    error UnsupportedMutualizer();
    // Dispute cannot be resolved anymore and must be finalized with expireDispute
    error DisputeHasExpired();
    // Buyer gets more than 100% of the total pot
    error InvalidBuyerPercent();
    // Dispute is still valid and cannot be expired yet
    error DisputeStillValid();
    // New dispute timeout is earlier than existing dispute timeout
    error InvalidDisputeTimeout();
    // Absolute zero offers cannot be escalated
    error EscalationNotAllowed();
    // Dispute is being finalized into an invalid state
    error InvalidTargeDisputeState();

    // Config related
    // Percentage exceeds 100%
    error InvalidFeePercentage();
    // Zero config value is not allowed
    error ValueZeroNotAllowed();

    // BosonVoucher
    // Trying to issue an voucher that is in a reseverd range
    error ExchangeIdInReservedRange();
    // Trying to premint vouchers for an offer that does not have a reserved range
    error NoReservedRangeForOffer();
    // Trying to reserve a range that is already reserved
    error OfferRangeAlreadyReserved();
    // Range start at 0 is not allowed
    error InvalidRangeStart();
    // Amount to premint exceeds the range length
    error InvalidAmountToMint();
    // Trying to silent mint vouchers not belonging to the range owner
    error NoSilentMintAllowed();
    // Trying to premint the voucher of already expired offer
    error OfferExpiredOrVoided();
    // Trying to burn preminted vouchers of still valid offer
    error OfferStillValid();
    // Trying to burn more vouchers than available
    error AmountExceedsRangeOrNothingToBurn();
    // Royalty fee exceeds the max allowed
    error InvalidRoyaltyFee();
    // Trying to assign the premined vouchers to the address that is neither the contract owner nor the contract itself
    error InvalidToAddress();
    // Call to an external contract was not successful
    error ExternalCallFailed();
    // Trying to interact with external contract in a way that could result in transferring assets from the contract
    error InteractionNotAllowed();

    // Price discovery related
    // Price discovery returned a price that does not match the expected one
    error PriceMismatch();
    // Token id is mandatory for bid orders and wrappers
    error TokenIdMandatory();
    // Incoming token id does not match the expected one
    error TokenIdMismatch();
    // Using price discovery for non-price discovery offer or using ordinary commit for price discovery offer
    error InvalidPriceType();
    // Missing price discovery contract address or data
    error InvalidPriceDiscovery();
    // Trying to set incoming voucher when it's already set, indicating reentrancy
    error IncomingVoucherAlreadySet();
    // Conduit address must be zero ()
    error InvalidConduitAddress();
    // Protocol does not know what token id to use
    error TokenIdNotSet();
    // Transferring a preminted voucher to wrong recipient
    error VoucherTransferNotAllowed();
    // Price discovery contract returned a negative price
    error NegativePriceNotAllowed();
    // Price discovery did not send the voucher to the protocol
    error VoucherNotReceived();
    // Price discovery did not send the voucher from the protocol
    error VoucherNotTransferred();
    // Either token with wrong id received or wrong voucher contract made the transfer
    error UnexpectedERC721Received();
    // Royalty fee exceeds the price
    error FeeAmountTooHigh();
    // Price does not cover the cancellation penalty
    error PriceDoesNotCoverPenalty();

    // Fee Table related
    // Thrown if asset is not supported in feeTable feature.
    error FeeTableAssetNotSupported();
}
