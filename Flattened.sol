// Sources flattened with hardhat v2.19.2 https://hardhat.org

// SPDX-License-Identifier: GPL-3.0-or-later AND MIT

// File contracts/interfaces/diamond/IDiamondCut.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity 0.8.22;

/**
 * @title IDiamondCut
 *
 * @notice Manages Diamond Facets.
 *
 * Reference Implementation  : https://github.com/mudgen/diamond-2-hardhat
 * EIP-2535 Diamond Standard : https://eips.ethereum.org/EIPS/eip-2535
 *
 * The ERC-165 identifier for this interface is: 0x1f931c1c
 *
 * @author Nick Mudge <nick@perfectabstractions.com> (https://twitter.com/mudgen)
 */
interface IDiamondCut {
    event DiamondCut(FacetCut[] _diamondCut, address _init, bytes _calldata);

    enum FacetCutAction {
        Add,
        Replace,
        Remove
    }

    struct FacetCut {
        address facetAddress;
        FacetCutAction action;
        bytes4[] functionSelectors;
    }

    /**
     * @notice Cuts facets of the Diamond.
     *
     * Adds/replaces/removes any number of function selectors.
     *
     * If populated, _calldata is executed with delegatecall on _init
     *
     * Reverts if caller does not have UPGRADER role
     *
     * @param _facetCuts - contains the facet addresses and function selectors
     * @param _init - the address of the contract or facet to execute _calldata
     * @param _calldata - a function call, including function selector and arguments
     */
    function diamondCut(FacetCut[] calldata _facetCuts, address _init, bytes calldata _calldata) external;
}

// File contracts/interfaces/IAccessControl.sol

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts v4.4.1 (access/IAccessControl.sol)

pragma solidity 0.8.22;

/**
 * @dev External interface of AccessControl declared to support ERC165 detection.
 */
interface IAccessControl {
    /**
     * @dev Emitted when `newAdminRole` is set as ``role``'s admin role, replacing `previousAdminRole`
     *
     * `DEFAULT_ADMIN_ROLE` is the starting admin for all roles, despite
     * {RoleAdminChanged} not being emitted signaling this.
     *
     * _Available since v3.1._
     */
    event RoleAdminChanged(bytes32 indexed role, bytes32 indexed previousAdminRole, bytes32 indexed newAdminRole);

    /**
     * @dev Emitted when `account` is granted `role`.
     *
     * `sender` is the account that originated the contract call, an admin role
     * bearer except when using {AccessControl-_setupRole}.
     */
    event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender);

    /**
     * @dev Emitted when `account` is revoked `role`.
     *
     * `sender` is the account that originated the contract call:
     *   - if using `revokeRole`, it is the admin role bearer
     *   - if using `renounceRole`, it is the role bearer (i.e. `account`)
     */
    event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender);

    /**
     * @dev Returns `true` if `account` has been granted `role`.
     */
    function hasRole(bytes32 role, address account) external view returns (bool);

    /**
     * @dev Returns the admin role that controls `role`. See {grantRole} and
     * {revokeRole}.
     *
     * To change a role's admin, use {AccessControl-_setRoleAdmin}.
     */
    function getRoleAdmin(bytes32 role) external view returns (bytes32);

    /**
     * @dev Grants `role` to `account`.
     *
     * If `account` had not been already granted `role`, emits a {RoleGranted}
     * event.
     *
     * Requirements:
     *
     * - the caller must have ``role``'s admin role.
     */
    function grantRole(bytes32 role, address account) external;

    /**
     * @dev Revokes `role` from `account`.
     *
     * If `account` had been granted `role`, emits a {RoleRevoked} event.
     *
     * Requirements:
     *
     * - the caller must have ``role``'s admin role.
     */
    function revokeRole(bytes32 role, address account) external;

    /**
     * @dev Revokes `role` from the calling account.
     *
     * Roles are often managed via {grantRole} and {revokeRole}: this function's
     * purpose is to provide a mechanism for accounts to lose their privileges
     * if they are compromised (such as when a trusted device is misplaced).
     *
     * If the calling account had been granted `role`, emits a {RoleRevoked}
     * event.
     *
     * Requirements:
     *
     * - the caller must be `account`.
     */
    function renounceRole(bytes32 role, address account) external;
}

// File contracts/diamond/DiamondLib.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity 0.8.22;

/**
 * @title DiamondLib
 *
 * @notice Provides Diamond storage slot and supported interface checks.
 *
 * @notice Based on Nick Mudge's gas-optimized diamond-2 reference,
 * with modifications to support role-based access and management of
 * supported interfaces. Also added copious code comments throughout.
 *
 * Reference Implementation  : https://github.com/mudgen/diamond-2-hardhat
 * EIP-2535 Diamond Standard : https://eips.ethereum.org/EIPS/eip-2535
 *
 * N.B. Facet management functions from original `DiamondLib` were refactored/extracted
 * to JewelerLib, since business facets also use this library for access control and
 * managing supported interfaces.
 *
 * @author Nick Mudge <nick@perfectabstractions.com> (https://twitter.com/mudgen)
 * @author Cliff Hall <cliff@futurescale.com> (https://twitter.com/seaofarrows)
 */
library DiamondLib {
    bytes32 internal constant DIAMOND_STORAGE_POSITION = keccak256("diamond.standard.diamond.storage");

    struct DiamondStorage {
        // Maps function selectors to the facets that execute the functions
        // and maps the selectors to their position in the selectorSlots array.
        // func selector => address facet, selector position
        mapping(bytes4 => bytes32) facets;
        // Array of slots of function selectors.
        // Each slot holds 8 function selectors.
        mapping(uint256 => bytes32) selectorSlots;
        // The number of function selectors in selectorSlots
        uint16 selectorCount;
        // Used to query if a contract implement is an interface.
        // Used to implement ERC-165.
        mapping(bytes4 => bool) supportedInterfaces;
        // The Boson Protocol AccessController
        IAccessControl accessController;
    }

    /**
     * @notice Gets the Diamond storage slot.
     *
     * @return ds - Diamond storage slot cast to DiamondStorage
     */
    function diamondStorage() internal pure returns (DiamondStorage storage ds) {
        bytes32 position = DIAMOND_STORAGE_POSITION;
        assembly {
            ds.slot := position
        }
    }

    /**
     * @notice Adds a supported interface to the Diamond.
     *
     * @param _interfaceId - the interface to add
     */
    function addSupportedInterface(bytes4 _interfaceId) internal {
        // Get the DiamondStorage struct
        DiamondStorage storage ds = diamondStorage();

        // Flag the interfaces as supported
        ds.supportedInterfaces[_interfaceId] = true;
    }

    /**
     * @notice Removes a supported interface from the Diamond.
     *
     * @param _interfaceId - the interface to remove
     */
    function removeSupportedInterface(bytes4 _interfaceId) internal {
        // Get the DiamondStorage struct
        DiamondStorage storage ds = diamondStorage();

        // Flag the interfaces as unsupported
        ds.supportedInterfaces[_interfaceId] = false;
    }

    /**
     * @notice Checks if a specific interface is supported.
     * Implementation of ERC-165 interface detection standard.
     *
     * @param _interfaceId - the sighash of the given interface
     * @return - whether or not the interface is supported
     */
    function supportsInterface(bytes4 _interfaceId) internal view returns (bool) {
        // Get the DiamondStorage struct
        DiamondStorage storage ds = diamondStorage();

        // Return the value
        return ds.supportedInterfaces[_interfaceId];
    }
}

// File contracts/domain/BosonTypes.sol

// Original license: SPDX_License_Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

/**
 * @title BosonTypes
 *
 * @notice Enums and structs used by the Boson Protocol contract ecosystem.
 */

contract BosonTypes {
    enum PausableRegion {
        Offers,
        Twins,
        Bundles,
        Groups,
        Sellers,
        Buyers,
        DisputeResolvers,
        Agents,
        Exchanges,
        Disputes,
        Funds,
        Orchestration,
        MetaTransaction,
        PriceDiscovery,
        SequentialCommit
    }

    enum EvaluationMethod {
        None, // None should always be at index 0. Never change this value.
        Threshold,
        SpecificToken
    }

    enum GatingType {
        PerAddress,
        PerTokenId
    }

    enum ExchangeState {
        Committed,
        Revoked,
        Canceled,
        Redeemed,
        Completed,
        Disputed
    }

    enum DisputeState {
        Resolving,
        Retracted,
        Resolved,
        Escalated,
        Decided,
        Refused
    }

    enum TokenType {
        FungibleToken,
        NonFungibleToken,
        MultiToken
    } // ERC20, ERC721, ERC1155

    enum MetaTxInputType {
        Generic,
        CommitToOffer,
        Exchange,
        Funds,
        CommitToConditionalOffer,
        ResolveDispute
    }

    enum AuthTokenType {
        None,
        Custom, // For future use
        Lens,
        ENS
    }

    enum SellerUpdateFields {
        Admin,
        Assistant,
        Clerk, // Deprecated.
        AuthToken
    }

    enum DisputeResolverUpdateFields {
        Admin,
        Assistant,
        Clerk // Deprecated.
    }

    enum PriceType {
        Static, // Default should always be at index 0. Never change this value.
        Discovery
    }

    struct AuthToken {
        uint256 tokenId;
        AuthTokenType tokenType;
    }

    struct Seller {
        uint256 id;
        address assistant;
        address admin;
        address clerk; // Deprecated. Kept for backwards compatibility.
        address payable treasury;
        bool active;
        string metadataUri;
    }

    struct Buyer {
        uint256 id;
        address payable wallet;
        bool active;
    }

    struct RoyaltyRecipient {
        uint256 id;
        address payable wallet;
    }

    struct DisputeResolver {
        uint256 id;
        uint256 escalationResponsePeriod;
        address assistant;
        address admin;
        address clerk; // Deprecated. Kept for backwards compatibility.
        address payable treasury;
        string metadataUri;
        bool active;
    }

    struct DisputeResolverFee {
        address tokenAddress;
        string tokenName;
        uint256 feeAmount;
    }

    struct Agent {
        uint256 id;
        uint256 feePercentage;
        address payable wallet;
        bool active;
    }

    struct DisputeResolutionTerms {
        uint256 disputeResolverId;
        uint256 escalationResponsePeriod;
        uint256 feeAmount;
        uint256 buyerEscalationDeposit;
    }

    struct Offer {
        uint256 id;
        uint256 sellerId;
        uint256 price;
        uint256 sellerDeposit;
        uint256 buyerCancelPenalty;
        uint256 quantityAvailable;
        address exchangeToken;
        PriceType priceType;
        string metadataUri;
        string metadataHash;
        bool voided;
        uint256 collectionIndex;
        RoyaltyInfo[] royaltyInfo;
    }

    struct OfferDates {
        uint256 validFrom;
        uint256 validUntil;
        uint256 voucherRedeemableFrom;
        uint256 voucherRedeemableUntil;
    }

    struct OfferDurations {
        uint256 disputePeriod;
        uint256 voucherValid;
        uint256 resolutionPeriod;
    }

    struct Group {
        uint256 id;
        uint256 sellerId;
        uint256[] offerIds;
    }

    struct Condition {
        EvaluationMethod method;
        TokenType tokenType;
        address tokenAddress;
        GatingType gating; // added in v2.3.0. All conditions created before that have a default value of "PerAddress"
        uint256 minTokenId;
        uint256 threshold;
        uint256 maxCommits;
        uint256 maxTokenId;
    }

    struct Exchange {
        uint256 id;
        uint256 offerId;
        uint256 buyerId;
        uint256 finalizedDate;
        ExchangeState state;
    }

    struct ExchangeCosts {
        uint256 resellerId;
        uint256 price;
        uint256 protocolFeeAmount;
        uint256 royaltyAmount;
        uint256 royaltyInfoIndex;
    }

    struct Voucher {
        uint256 committedDate;
        uint256 validUntilDate;
        uint256 redeemedDate;
        bool expired;
    }

    struct Dispute {
        uint256 exchangeId;
        uint256 buyerPercent;
        DisputeState state;
    }

    struct DisputeDates {
        uint256 disputed;
        uint256 escalated;
        uint256 finalized;
        uint256 timeout;
    }

    struct Receipt {
        uint256 exchangeId;
        uint256 offerId;
        uint256 buyerId;
        uint256 sellerId;
        uint256 price;
        uint256 sellerDeposit;
        uint256 buyerCancelPenalty;
        OfferFees offerFees;
        uint256 agentId;
        address exchangeToken;
        uint256 finalizedDate;
        Condition condition;
        uint256 committedDate;
        uint256 redeemedDate;
        bool voucherExpired;
        uint256 disputeResolverId;
        uint256 disputedDate;
        uint256 escalatedDate;
        DisputeState disputeState;
        TwinReceipt[] twinReceipts;
    }

    struct TokenRange {
        uint256 start;
        uint256 end;
        uint256 twinId;
    }

    struct Twin {
        uint256 id;
        uint256 sellerId;
        uint256 amount; // ERC1155 / ERC20 (amount to be transferred to each buyer on redemption)
        uint256 supplyAvailable; // all
        uint256 tokenId; // ERC1155 / ERC721 (must be initialized with the initial pointer position of the ERC721 ids available range)
        address tokenAddress; // all
        TokenType tokenType;
    }

    struct TwinReceipt {
        uint256 twinId;
        uint256 tokenId; // only for ERC721 and ERC1155
        uint256 amount; // only for ERC1155 and ERC20
        address tokenAddress;
        TokenType tokenType;
    }

    struct Bundle {
        uint256 id;
        uint256 sellerId;
        uint256[] offerIds;
        uint256[] twinIds;
    }

    struct Funds {
        address tokenAddress;
        string tokenName;
        uint256 availableAmount;
    }

    struct MetaTransaction {
        uint256 nonce;
        address from;
        address contractAddress;
        string functionName;
        bytes functionSignature;
    }

    struct HashInfo {
        bytes32 typeHash;
        function(bytes memory) internal pure returns (bytes32) hashFunction;
    }

    struct OfferFees {
        uint256 protocolFee;
        uint256 agentFee;
    }

    struct VoucherInitValues {
        string contractURI;
        uint256 royaltyPercentage;
        bytes32 collectionSalt;
    }

    struct Collection {
        address collectionAddress;
        string externalId;
    }

    struct PriceDiscovery {
        uint256 price;
        Side side;
        address priceDiscoveryContract;
        address conduit;
        bytes priceDiscoveryData;
    }

    enum Side {
        Ask,
        Bid,
        Wrapper // Side is not relevant from the protocol perspective
    }

    struct RoyaltyInfo {
        address payable[] recipients;
        uint256[] bps;
    }

    struct RoyaltyRecipientInfo {
        address payable wallet;
        uint256 minRoyaltyPercentage;
    }

    struct PremintParameters {
        uint256 reservedRangeLength;
        address to;
    }

    struct Payoff {
        uint256 seller;
        uint256 buyer;
        uint256 protocol;
        uint256 agent;
    }
}

// File contracts/domain/BosonConstants.sol

// Original license: SPDX_License_Identifier: GPL-3.0-or-later
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

// File contracts/domain/BosonErrors.sol

// Original license: SPDX_License_Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

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
    // Buyer is involved in an non-finalized exchange
    error WalletOwnsVouchers();
    // Escalation period is not greater than zero or is more than the max allowed
    error InvalidEscalationPeriod();
    // Action would remove the last supported fee from the DR (must always have at least one)
    error InexistentDisputeResolverFees();
    // Trying to add a fee that already exists
    error DuplicateDisputeResolverFees();
    // Trying to add a fee with non-zero amount
    error FeeAmountNotYetSupported();
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

    // Meta-Transactions related
    // Meta-transaction nonce is invalid
    error NonceUsedAlready();
    // Signature does not match the signer
    error SignerAndSignatureDoNotMatch();
    // Function signature does not match it's name
    error InvalidFunctionName();
    // Signature has invalid parameters
    error InvalidSignature();
    // Function is not allowed to be executed as a meta-transaction
    error FunctionNotAllowlisted();

    // Dispute related
    // Dispute cannot be raised since the period to do it has elapsed
    error DisputePeriodHasElapsed();
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
}

// File contracts/interfaces/events/IClientExternalAddressesEvents.sol

// Original license: SPDX_License_Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

/**
 * @title IClientExternalAddressesEvents
 *
 * @notice Defines events related to management of Boson Protocol clients.
 */
interface IClientExternalAddressesEvents {
    event Upgraded(address indexed implementation, address indexed executedBy);
    event ProtocolAddressChanged(address indexed protocol, address indexed executedBy);
}

// File contracts/interfaces/clients/IClientExternalAddresses.sol

// Original license: SPDX_License_Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

/**
 * @title IClientExternalAddresses
 *
 * @notice ClientExternalAddresses is used to set and get addresses used either by proxies or
 * by protocol clients.
 *
 *
 * The ERC-165 identifier for this interface is: 0x344552b3
 */
interface IClientExternalAddresses is IClientExternalAddressesEvents {
    /**
     * @notice Sets the implementation address.
     *
     * @param _implementation - the implementation address
     */
    function setImplementation(address _implementation) external;

    /**
     * @notice Gets the implementation address.
     *
     * @return the implementation address
     */
    function getImplementation() external view returns (address);

    /**
     * @notice Gets the address of the Boson Protocol AccessController contract.
     *
     * @return the address of the AccessController contract
     */
    function getAccessController() external view returns (IAccessControl);

    /**
     * @notice Set the ProtocolDiamond address.
     *
     * Emits a ProtocolAddressChanged event.
     *
     * @param _protocolAddress - the ProtocolDiamond address
     */
    function setProtocolAddress(address _protocolAddress) external;

    /**
     * @notice Gets the address of the ProtocolDiamond contract.
     *
     * @return the ProtocolDiamond address
     */
    function getProtocolAddress() external view returns (address);
}

// File contracts/interfaces/events/IBosonConfigEvents.sol

// Original license: SPDX_License_Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

/**
 * @title IBosonConfigEvents
 *
 * @notice Defines events related to management of configuration within the protocol.
 */
interface IBosonConfigEvents {
    event TokenAddressChanged(address indexed tokenAddress, address indexed executedBy);
    event TreasuryAddressChanged(address indexed treasuryAddress, address indexed executedBy);
    event VoucherBeaconAddressChanged(address indexed voucherBeaconAddress, address indexed executedBy);
    event BeaconProxyAddressChanged(address indexed beaconProxyAddress, address indexed executedBy);
    event PriceDiscoveryAddressChanged(address indexed priceDiscoveryAddress, address indexed executedBy);
    event ProtocolFeePercentageChanged(uint256 feePercentage, address indexed executedBy);
    event ProtocolFeeFlatBosonChanged(uint256 feeFlatBoson, address indexed executedBy);
    event MaxEscalationResponsePeriodChanged(uint256 maxEscalationResponsePeriod, address indexed executedBy);
    event BuyerEscalationFeePercentageChanged(uint256 buyerEscalationFeePercentage, address indexed executedBy);
    event AuthTokenContractChanged(
        BosonTypes.AuthTokenType indexed authTokenType,
        address indexed authTokenContract,
        address indexed executedBy
    );
    event MaxTotalOfferFeePercentageChanged(uint16 maxTotalOfferFeePercentage, address indexed executedBy);
    event MaxRoyaltyPercentageChanged(uint16 maxRoyaltyPercentage, address indexed executedBy);
    event MinResolutionPeriodChanged(uint256 minResolutionPeriod, address indexed executedBy);
    event MaxResolutionPeriodChanged(uint256 maxResolutionPeriod, address indexed executedBy);
    event MinDisputePeriodChanged(uint256 minDisputePeriod, address indexed executedBy);
    event MaxPremintedVouchersChanged(uint256 maxPremintedVouchers, address indexed executedBy);
    event AccessControllerAddressChanged(address indexed accessControllerAddress, address indexed executedBy);
}

// File contracts/interfaces/handlers/IBosonConfigHandler.sol

// Original license: SPDX_License_Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

/**
 * @title IBosonConfigHandler
 *
 * @notice Handles management of configuration within the protocol.
 *
 * The ERC-165 identifier for this interface is: 0xe27f0773
 */
interface IBosonConfigHandler is IBosonConfigEvents, BosonErrors {
    /**
     * @notice Sets the Boson Token (ERC-20 contract) address.
     *
     * Emits a TokenAddressChanged event.
     *
     * Reverts if _tokenAddress is the zero address
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _tokenAddress - the Boson Token (ERC-20 contract) address
     */
    function setTokenAddress(address payable _tokenAddress) external;

    /**
     * @notice Gets the Boson Token (ERC-20 contract) address.
     *
     * @return the Boson Token (ERC-20 contract) address
     */
    function getTokenAddress() external view returns (address payable);

    /**
     * @notice Sets the Boson Protocol multi-sig wallet address.
     *
     * Emits a TreasuryAddressChanged event.
     *
     * Reverts if _treasuryAddress is the zero address
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _treasuryAddress - the the multi-sig wallet address
     */
    function setTreasuryAddress(address payable _treasuryAddress) external;

    /**
     * @notice Gets the Boson Protocol multi-sig wallet address.
     *
     * @return the Boson Protocol multi-sig wallet address
     */
    function getTreasuryAddress() external view returns (address payable);

    /**
     * @notice Sets the Boson Voucher beacon contract address.
     *
     * Emits a VoucherBeaconAddressChanged event.
     *
     * Reverts if _voucherBeaconAddress is the zero address
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _voucherBeaconAddress - the Boson Voucher beacon contract address
     */
    function setVoucherBeaconAddress(address _voucherBeaconAddress) external;

    /**
     * @notice Gets the Boson Voucher beacon contract address.
     *
     * @return the Boson Voucher beacon contract address
     */
    function getVoucherBeaconAddress() external view returns (address);

    /**
     * @notice Sets the Boson Voucher reference proxy implementation address.
     *
     * Emits a BeaconProxyAddressChanged event.
     *
     * Reverts if _beaconProxyAddress is the zero address
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _beaconProxyAddress - reference proxy implementation address
     */
    function setBeaconProxyAddress(address _beaconProxyAddress) external;

    /**
     * @notice Gets the beaconProxy address.
     *
     * @return the beaconProxy address
     */
    function getBeaconProxyAddress() external view returns (address);

    /**
     * @notice Sets the Boson Price Discovery contract address.
     *
     * Emits a PriceDiscoveryAddressChanged event if successful.
     *
     * Reverts if _priceDiscovery is the zero address
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _priceDiscovery - the Boson Price Discovery contract address
     */
    function setPriceDiscoveryAddress(address _priceDiscovery) external;

    /**
     * @notice Gets the Boson Price Discovery contract address.
     *
     * @return the Boson Price Discovery contract address
     */
    function getPriceDiscoveryAddress() external view returns (address);

    /**
     * @notice Sets the protocol fee percentage.
     *
     * Emits a ProtocolFeePercentageChanged event.
     *
     * Reverts if the _protocolFeePercentage is greater than 10000.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _protocolFeePercentage - the percentage that will be taken as a fee from the net of a Boson Protocol sale or auction (after royalties)
     *
     * N.B. Represent percentage value as an unsigned int by multiplying the percentage by 100:
     * e.g, 1.75% = 175, 100% = 10000
     */
    function setProtocolFeePercentage(uint256 _protocolFeePercentage) external;

    /**
     * @notice Gets the protocol fee percentage.
     *
     * @return the protocol fee percentage
     */
    function getProtocolFeePercentage() external view returns (uint256);

    /**
     * @notice Sets the flat protocol fee for exchanges in $BOSON.
     *
     * Emits a ProtocolFeeFlatBosonChanged event.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _protocolFeeFlatBoson - the flat fee taken for exchanges in $BOSON
     *
     */
    function setProtocolFeeFlatBoson(uint256 _protocolFeeFlatBoson) external;

    /**
     * @notice Gets the flat protocol fee for exchanges in $BOSON.
     *
     * @return the flat fee taken for exchanges in $BOSON
     */
    function getProtocolFeeFlatBoson() external view returns (uint256);

    /**
     * @notice Sets the maximum escalation response period a dispute resolver can specify.
     *
     * Emits a MaxEscalationResponsePeriodChanged event.
     *
     * Reverts if _maxEscalationResponsePeriod is zero.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxEscalationResponsePeriod - the maximum escalation response period that a {BosonTypes.DisputeResolver} can specify
     */
    function setMaxEscalationResponsePeriod(uint256 _maxEscalationResponsePeriod) external;

    /**
     * @notice Gets the maximum escalation response period a dispute resolver can specify.
     *
     * @return the maximum escalation response period that a {BosonTypes.DisputeResolver} can specify
     */
    function getMaxEscalationResponsePeriod() external view returns (uint256);

    /**
     * @notice Sets the total offer fee percentage limit which will validate the sum of (Protocol Fee percentage + Agent Fee percentage) of an offer fee.
     *
     * Emits a MaxTotalOfferFeePercentageChanged event.
     *
     * Reverts if the _maxTotalOfferFeePercentage is greater than 10000.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxTotalOfferFeePercentage - the maximum total offer fee percentage
     *
     * N.B. Represent percentage value as an unsigned int by multiplying the percentage by 100:
     * e.g, 1.75% = 175, 100% = 10000
     */
    function setMaxTotalOfferFeePercentage(uint16 _maxTotalOfferFeePercentage) external;

    /**
     * @notice Gets the total offer fee percentage limit which will validate the sum of (Protocol Fee percentage + Agent Fee percentage) of an offer fee.
     *
     * @return the maximum total offer fee percentage
     */
    function getMaxTotalOfferFeePercentage() external view returns (uint16);

    /**
     * @notice Sets the buyer escalation fee percentage.
     *
     * Emits a BuyerEscalationFeePercentageChanged event.
     *
     * Reverts if the _buyerEscalationDepositPercentage is greater than 10000.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _buyerEscalationDepositPercentage - the percentage of the DR fee that will be charged to buyer if they want to escalate the dispute
     *
     * N.B. Represent percentage value as an unsigned int by multiplying the percentage by 100:
     * e.g, 1.75% = 175, 100% = 10000
     */
    function setBuyerEscalationDepositPercentage(uint256 _buyerEscalationDepositPercentage) external;

    /**
     * @notice Gets the buyer escalation fee percentage.
     *
     * @return the percentage of the DR fee that will be charged to buyer if they want to escalate the dispute
     */
    function getBuyerEscalationDepositPercentage() external view returns (uint256);

    /**
     * @notice Sets the contract address for the given AuthTokenType.
     *
     * Emits an AuthTokenContractChanged event.
     *
     * Reverts if _authTokenType is None
     * Reverts if _authTokenType is Custom
     * Reverts if _authTokenContract is the zero address
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _authTokenType - the auth token type, as an Enum value
     * @param _authTokenContract the address of the auth token contract (e.g. Lens or ENS contract address)
     */
    function setAuthTokenContract(BosonTypes.AuthTokenType _authTokenType, address _authTokenContract) external;

    /**
     * @notice Gets the contract address for the given AuthTokenType.
     *
     * @param _authTokenType - the auth token type, as an Enum value
     * @return the address of the auth token contract (e.g. Lens or ENS contract address) for the given AuthTokenType
     */
    function getAuthTokenContract(BosonTypes.AuthTokenType _authTokenType) external view returns (address);

    /**
     * @notice Sets the maximum royalty percentage that can be set by the seller.
     *
     * Emits a MaxRoyaltyPercentageChanged event.
     *
     * Reverts if:
     * - The _maxRoyaltyPercentage is zero.
     * - The _maxRoyaltyPercentage is greater than 10000.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxRoyaltyPercentage - the maximum royalty percentage
     *
     * N.B. Represent percentage value as an unsigned int by multiplying the percentage by 100:
     * e.g, 1.75% = 175, 100% = 10000
     */
    function setMaxRoyaltyPercentage(uint16 _maxRoyaltyPercentage) external;

    /**
     * @notice Gets the maximum royalty percentage that can be set by the seller.
     *
     * @return the maximum royalty percentage
     */
    function getMaxRoyaltyPercentage() external view returns (uint16);

    /**
     * @notice Sets the minimum resolution period a seller can specify.
     *
     * Emits a MinResolutionPeriodChanged event.
     *
     * Reverts if _minResolutionPeriod is zero.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _minResolutionPeriod - the minimum resolution period that a {BosonTypes.Seller} can specify
     */
    function setMinResolutionPeriod(uint256 _minResolutionPeriod) external;

    /**
     * @notice Gets the minimum resolution period a seller can specify.
     *
     * @return the minimum resolution period that a {BosonTypes.Seller} can specify
     */
    function getMinResolutionPeriod() external view returns (uint256);

    /**
     * @notice Sets the maximum resolution period a seller can specify.
     *
     * Emits a MaxResolutionPeriodChanged event.
     *
     * Reverts if _maxResolutionPeriod is zero.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxResolutionPeriod - the maximum resolution period that a {BosonTypes.Seller} can specify
     */
    function setMaxResolutionPeriod(uint256 _maxResolutionPeriod) external;

    /**
     * @notice Gets the maximum resolution period a seller can specify.
     *
     * @return the maximum resolution period that a {BosonTypes.Seller} can specify
     */
    function getMaxResolutionPeriod() external view returns (uint256);

    /**
     * @notice Sets the minimum dispute period a seller can specify.
     *
     * Emits a MinDisputePeriodChanged event.
     *
     * Reverts if _minDisputePeriod is zero.
     *
     * @param _minDisputePeriod - the minimum dispute period that a {BosonTypes.Seller} can specify
     */
    function setMinDisputePeriod(uint256 _minDisputePeriod) external;

    /**
     * @notice Gets the minimum dispute period a seller can specify.
     */
    function getMinDisputePeriod() external view returns (uint256);

    /**
     * @notice Sets the access controller address.
     *
     * Emits an AccessControllerAddressChanged event.
     *
     * Reverts if _accessControllerAddress is the zero address
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _accessControllerAddress - access controller address
     */
    function setAccessControllerAddress(address _accessControllerAddress) external;

    /**
     * @notice Gets the access controller address.
     *
     * @return the access controller address
     */
    function getAccessControllerAddress() external view returns (address);
}

// File contracts/protocol/libs/ProtocolLib.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity 0.8.22;

/**
 * @title ProtocolLib
 *
 * @notice Provides access to the protocol addresses, limits, entities, fees, counters, initializers and  metaTransactions slots for Facets.
 */
library ProtocolLib {
    bytes32 internal constant PROTOCOL_ADDRESSES_POSITION = keccak256("boson.protocol.addresses");
    bytes32 internal constant PROTOCOL_LIMITS_POSITION = keccak256("boson.protocol.limits");
    bytes32 internal constant PROTOCOL_ENTITIES_POSITION = keccak256("boson.protocol.entities");
    bytes32 internal constant PROTOCOL_LOOKUPS_POSITION = keccak256("boson.protocol.lookups");
    bytes32 internal constant PROTOCOL_FEES_POSITION = keccak256("boson.protocol.fees");
    bytes32 internal constant PROTOCOL_COUNTERS_POSITION = keccak256("boson.protocol.counters");
    bytes32 internal constant PROTOCOL_STATUS_POSITION = keccak256("boson.protocol.initializers");
    bytes32 internal constant PROTOCOL_META_TX_POSITION = keccak256("boson.protocol.metaTransactions");

    // Protocol addresses storage
    struct ProtocolAddresses {
        // Address of the Boson Protocol treasury
        address payable treasury;
        // Address of the Boson Token (ERC-20 contract)
        address payable token;
        // Address of the Boson Protocol Voucher beacon
        address voucherBeacon;
        // Address of the Boson Beacon proxy implementation
        address beaconProxy;
        // Address of the Boson Price Discovery
        address priceDiscovery;
    }

    // Protocol limits storage
    struct ProtocolLimits {
        // limit on the resolution period that a seller can specify
        uint256 maxResolutionPeriod;
        // limit on the escalation response period that a dispute resolver can specify
        uint256 maxEscalationResponsePeriod;
        // lower limit for dispute period
        uint256 minDisputePeriod;
        // limit how many exchanges can be processed in single batch transaction
        uint16 maxExchangesPerBatch;
        // limit how many offers can be added to the group
        uint16 maxOffersPerGroup;
        // limit how many offers can be added to the bundle
        uint16 maxOffersPerBundle;
        // limit how many twins can be added to the bundle
        uint16 maxTwinsPerBundle;
        // limit how many offers can be processed in single batch transaction
        uint16 maxOffersPerBatch;
        // limit how many different tokens can be withdrawn in a single transaction
        uint16 maxTokensPerWithdrawal;
        // limit how many dispute resolver fee structs can be processed in a single transaction
        uint16 maxFeesPerDisputeResolver;
        // limit how many disputes can be processed in single batch transaction
        uint16 maxDisputesPerBatch;
        // limit how many sellers can be added to or removed from an allow list in a single transaction
        uint16 maxAllowedSellers;
        // limit the sum of (protocol fee percentage + agent fee percentage) of an offer fee
        uint16 maxTotalOfferFeePercentage;
        // limit the max royalty percentage that can be set by the seller
        uint16 maxRoyaltyPercentage;
        // limit the max number of vouchers that can be preminted in a single transaction
        uint256 maxPremintedVouchers;
        // lower limit for resolution period
        uint256 minResolutionPeriod;
    }

    // Protocol fees storage
    struct ProtocolFees {
        // Percentage that will be taken as a fee from the net of a Boson Protocol exchange
        uint256 percentage; // 1.75% = 175, 100% = 10000
        // Flat fee taken for exchanges in $BOSON
        uint256 flatBoson;
        // buyer escalation deposit percentage
        uint256 buyerEscalationDepositPercentage;
    }

    // Protocol entities storage
    struct ProtocolEntities {
        // offer id => offer
        mapping(uint256 => BosonTypes.Offer) offers;
        // offer id => offer dates
        mapping(uint256 => BosonTypes.OfferDates) offerDates;
        // offer id => offer fees
        mapping(uint256 => BosonTypes.OfferFees) offerFees;
        // offer id => offer durations
        mapping(uint256 => BosonTypes.OfferDurations) offerDurations;
        // offer id => dispute resolution terms
        mapping(uint256 => BosonTypes.DisputeResolutionTerms) disputeResolutionTerms;
        // exchange id => exchange
        mapping(uint256 => BosonTypes.Exchange) exchanges;
        // exchange id => voucher
        mapping(uint256 => BosonTypes.Voucher) vouchers;
        // exchange id => dispute
        mapping(uint256 => BosonTypes.Dispute) disputes;
        // exchange id => dispute dates
        mapping(uint256 => BosonTypes.DisputeDates) disputeDates;
        // seller id => seller
        mapping(uint256 => BosonTypes.Seller) sellers;
        // buyer id => buyer
        mapping(uint256 => BosonTypes.Buyer) buyers;
        // dispute resolver id => dispute resolver
        mapping(uint256 => BosonTypes.DisputeResolver) disputeResolvers;
        // dispute resolver id => dispute resolver fee array
        mapping(uint256 => BosonTypes.DisputeResolverFee[]) disputeResolverFees;
        // agent id => agent
        mapping(uint256 => BosonTypes.Agent) agents;
        // group id => group
        mapping(uint256 => BosonTypes.Group) groups;
        // group id => condition
        mapping(uint256 => BosonTypes.Condition) conditions;
        // bundle id => bundle
        mapping(uint256 => BosonTypes.Bundle) bundles;
        // twin id => twin
        mapping(uint256 => BosonTypes.Twin) twins;
        // entity id => auth token
        mapping(uint256 => BosonTypes.AuthToken) authTokens;
        // exchange id => sequential commit info
        mapping(uint256 => BosonTypes.ExchangeCosts[]) exchangeCosts;
        // entity id => royalty recipient account
        mapping(uint256 => BosonTypes.RoyaltyRecipient) royaltyRecipients;
    }

    // Protocol lookups storage
    struct ProtocolLookups {
        // offer id => exchange ids
        mapping(uint256 => uint256[]) exchangeIdsByOffer;
        // offer id => bundle id
        mapping(uint256 => uint256) bundleIdByOffer;
        // twin id => bundle id
        mapping(uint256 => uint256) bundleIdByTwin;
        // offer id => group id
        mapping(uint256 => uint256) groupIdByOffer;
        // offer id => agent id
        mapping(uint256 => uint256) agentIdByOffer;
        // seller assistant address => sellerId
        mapping(address => uint256) sellerIdByAssistant;
        // seller admin address => sellerId
        mapping(address => uint256) sellerIdByAdmin;
        // seller clerk address => sellerId
        // @deprecated sellerIdByClerk is no longer used. Keeping it for backwards compatibility.
        mapping(address => uint256) sellerIdByClerk;
        // buyer wallet address => buyerId
        mapping(address => uint256) buyerIdByWallet;
        // dispute resolver assistant address => disputeResolverId
        mapping(address => uint256) disputeResolverIdByAssistant;
        // dispute resolver admin address => disputeResolverId
        mapping(address => uint256) disputeResolverIdByAdmin;
        // dispute resolver clerk address => disputeResolverId
        // @deprecated disputeResolverIdByClerk is no longer used. Keeping it for backwards compatibility.
        mapping(address => uint256) disputeResolverIdByClerk;
        // dispute resolver id to fee token address => index of the token address
        mapping(uint256 => mapping(address => uint256)) disputeResolverFeeTokenIndex;
        // agent wallet address => agentId
        mapping(address => uint256) agentIdByWallet;
        // account id => token address => amount
        mapping(uint256 => mapping(address => uint256)) availableFunds;
        // account id => all tokens with balance > 0
        mapping(uint256 => address[]) tokenList;
        // account id => token address => index on token addresses list
        mapping(uint256 => mapping(address => uint256)) tokenIndexByAccount;
        // seller id => cloneAddress
        mapping(uint256 => address) cloneAddress;
        // buyer id => number of active vouchers
        mapping(uint256 => uint256) voucherCount;
        // buyer address => groupId => commit count (addresses that have committed to conditional offers)
        mapping(address => mapping(uint256 => uint256)) conditionalCommitsByAddress;
        // AuthTokenType => Auth NFT contract address.
        mapping(BosonTypes.AuthTokenType => address) authTokenContracts;
        // AuthTokenType => tokenId => sellerId
        mapping(BosonTypes.AuthTokenType => mapping(uint256 => uint256)) sellerIdByAuthToken;
        // seller id => token address (only ERC721) => start and end of token ids range
        mapping(uint256 => mapping(address => BosonTypes.TokenRange[])) twinRangesBySeller;
        // seller id => token address (only ERC721) => twin ids
        // @deprecated twinIdsByTokenAddressAndBySeller is no longer used. Keeping it for backwards compatibility.
        mapping(uint256 => mapping(address => uint256[])) twinIdsByTokenAddressAndBySeller;
        // exchange id => BosonTypes.TwinReceipt
        mapping(uint256 => BosonTypes.TwinReceipt[]) twinReceiptsByExchange;
        // dispute resolver id => list of allowed sellers
        mapping(uint256 => uint256[]) allowedSellers;
        // dispute resolver id => seller id => index of allowed seller in allowedSellers
        mapping(uint256 => mapping(uint256 => uint256)) allowedSellerIndex;
        // exchange id => condition
        mapping(uint256 => BosonTypes.Condition) exchangeCondition;
        // groupId => offerId => index on Group.offerIds array
        mapping(uint256 => mapping(uint256 => uint256)) offerIdIndexByGroup;
        // seller id => Seller
        mapping(uint256 => BosonTypes.Seller) pendingAddressUpdatesBySeller;
        // seller id => AuthToken
        mapping(uint256 => BosonTypes.AuthToken) pendingAuthTokenUpdatesBySeller;
        // dispute resolver id => DisputeResolver
        mapping(uint256 => BosonTypes.DisputeResolver) pendingAddressUpdatesByDisputeResolver;
        // twin id => range id
        mapping(uint256 => uint256) rangeIdByTwin;
        // tokenId => groupId =>  commit count (count how many times a token has been used as gate for this group)
        mapping(uint256 => mapping(uint256 => uint256)) conditionalCommitsByTokenId;
        // seller id => collections
        mapping(uint256 => BosonTypes.Collection[]) additionalCollections;
        // seller id => seller salt used to create collections
        mapping(uint256 => bytes32) sellerSalt;
        // seller salt => is used
        mapping(bytes32 => bool) isUsedSellerSalt;
        // seller id => royalty recipients info
        mapping(uint256 => BosonTypes.RoyaltyRecipientInfo[]) royaltyRecipientsBySeller;
        // seller id => royalty recipient => index of royalty recipient in royaltyRecipientsBySeller
        mapping(uint256 => mapping(address => uint256)) royaltyRecipientIndexBySellerAndRecipient;
        // royalty recipient wallet address => agentId
        mapping(address => uint256) royaltyRecipientIdByWallet;
    }

    // Incrementing id counters
    struct ProtocolCounters {
        // Next account id
        uint256 nextAccountId;
        // Next offer id
        uint256 nextOfferId;
        // Next exchange id
        uint256 nextExchangeId;
        // Next twin id
        uint256 nextTwinId;
        // Next group id
        uint256 nextGroupId;
        // Next twin id
        uint256 nextBundleId;
    }

    // Storage related to Meta Transactions
    struct ProtocolMetaTxInfo {
        // The current sender address associated with the transaction
        address currentSenderAddress;
        // A flag that tells us whether the current transaction is a meta-transaction or a regular transaction.
        bool isMetaTransaction;
        // The domain Separator of the protocol
        bytes32 domainSeparator;
        // address => nonce => nonce used indicator
        mapping(address => mapping(uint256 => bool)) usedNonce;
        // The cached chain id
        uint256 cachedChainId;
        // map function name to input type
        mapping(string => BosonTypes.MetaTxInputType) inputType;
        // map input type => hash info
        mapping(BosonTypes.MetaTxInputType => BosonTypes.HashInfo) hashInfo;
        // Can function be executed using meta transactions
        mapping(bytes32 => bool) isAllowlisted;
    }

    // Individual facet initialization states
    struct ProtocolStatus {
        // the current pause scenario, a sum of PausableRegions as powers of two
        uint256 pauseScenario;
        // reentrancy status
        uint256 reentrancyStatus;
        // interface id => initialized?
        mapping(bytes4 => bool) initializedInterfaces;
        // version => initialized?
        mapping(bytes32 => bool) initializedVersions;
        // Current protocol version
        bytes32 version;
        // Incoming voucher id
        uint256 incomingVoucherId;
        // Incoming voucher clone address
        address incomingVoucherCloneAddress;
    }

    /**
     * @dev Gets the protocol addresses slot
     *
     * @return pa - the protocol addresses slot
     */
    function protocolAddresses() internal pure returns (ProtocolAddresses storage pa) {
        bytes32 position = PROTOCOL_ADDRESSES_POSITION;
        assembly {
            pa.slot := position
        }
    }

    /**
     * @notice Gets the protocol limits slot
     *
     * @return pl - the protocol limits slot
     */
    function protocolLimits() internal pure returns (ProtocolLimits storage pl) {
        bytes32 position = PROTOCOL_LIMITS_POSITION;
        assembly {
            pl.slot := position
        }
    }

    /**
     * @notice Gets the protocol entities slot
     *
     * @return pe - the protocol entities slot
     */
    function protocolEntities() internal pure returns (ProtocolEntities storage pe) {
        bytes32 position = PROTOCOL_ENTITIES_POSITION;
        assembly {
            pe.slot := position
        }
    }

    /**
     * @notice Gets the protocol lookups slot
     *
     * @return pl - the protocol lookups slot
     */
    function protocolLookups() internal pure returns (ProtocolLookups storage pl) {
        bytes32 position = PROTOCOL_LOOKUPS_POSITION;
        assembly {
            pl.slot := position
        }
    }

    /**
     * @notice Gets the protocol fees slot
     *
     * @return pf - the protocol fees slot
     */
    function protocolFees() internal pure returns (ProtocolFees storage pf) {
        bytes32 position = PROTOCOL_FEES_POSITION;
        assembly {
            pf.slot := position
        }
    }

    /**
     * @notice Gets the protocol counters slot
     *
     * @return pc - the protocol counters slot
     */
    function protocolCounters() internal pure returns (ProtocolCounters storage pc) {
        bytes32 position = PROTOCOL_COUNTERS_POSITION;
        assembly {
            pc.slot := position
        }
    }

    /**
     * @notice Gets the protocol meta-transactions storage slot
     *
     * @return pmti - the protocol meta-transactions storage slot
     */
    function protocolMetaTxInfo() internal pure returns (ProtocolMetaTxInfo storage pmti) {
        bytes32 position = PROTOCOL_META_TX_POSITION;
        assembly {
            pmti.slot := position
        }
    }

    /**
     * @notice Gets the protocol status slot
     *
     * @return ps - the the protocol status slot
     */
    function protocolStatus() internal pure returns (ProtocolStatus storage ps) {
        bytes32 position = PROTOCOL_STATUS_POSITION;
        assembly {
            ps.slot := position
        }
    }
}

// File contracts/protocol/bases/PausableBase.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity 0.8.22;

/**
 * @title PausableBase
 *
 * @notice Provides modifiers for regional pausing
 */
contract PausableBase is BosonTypes {
    /**
     * @notice Modifier that checks the Offers region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier offersNotPaused() {
        revertIfPaused(PausableRegion.Offers);
        _;
    }

    /**
     * @notice Modifier that checks the Twins region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier twinsNotPaused() {
        revertIfPaused(PausableRegion.Twins);
        _;
    }

    /**
     * @notice Modifier that checks the Bundles region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier bundlesNotPaused() {
        revertIfPaused(PausableRegion.Bundles);
        _;
    }

    /**
     * @notice Modifier that checks the Groups region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier groupsNotPaused() {
        revertIfPaused(PausableRegion.Groups);
        _;
    }

    /**
     * @notice Modifier that checks the Sellers region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier sellersNotPaused() {
        revertIfPaused(PausableRegion.Sellers);
        _;
    }

    /**
     * @notice Modifier that checks the Buyers region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier buyersNotPaused() {
        revertIfPaused(PausableRegion.Buyers);
        _;
    }

    /**
     * @notice Modifier that checks the Agents region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier agentsNotPaused() {
        revertIfPaused(PausableRegion.Agents);
        _;
    }

    /**
     * @notice Modifier that checks the DisputeResolvers region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier disputeResolversNotPaused() {
        revertIfPaused(PausableRegion.DisputeResolvers);
        _;
    }

    /**
     * @notice Modifier that checks the Exchanges region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier exchangesNotPaused() {
        revertIfPaused(PausableRegion.Exchanges);
        _;
    }

    /**
     * @notice Modifier that checks the Disputes region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier disputesNotPaused() {
        revertIfPaused(PausableRegion.Disputes);
        _;
    }

    /**
     * @notice Modifier that checks the Funds region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier fundsNotPaused() {
        revertIfPaused(PausableRegion.Funds);
        _;
    }

    /**
     * @notice Modifier that checks the Orchestration region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier orchestrationNotPaused() {
        revertIfPaused(PausableRegion.Orchestration);
        _;
    }

    /**
     * @notice Modifier that checks the MetaTransaction region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier metaTransactionsNotPaused() {
        revertIfPaused(PausableRegion.MetaTransaction);
        _;
    }

    /**
     * @notice Modifier that checks the PriceDiscovery region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier priceDiscoveryNotPaused() {
        revertIfPaused(PausableRegion.PriceDiscovery);
        _;
    }

    /**
     * @notice Modifier that checks the SequentialCommit region is not paused
     *
     * Reverts if region is paused
     *
     * See: {BosonTypes.PausableRegion}
     */
    modifier sequentialCommitNotPaused() {
        revertIfPaused(PausableRegion.SequentialCommit);
        _;
    }

    /**
     * @notice Checks if a region of the protocol is paused.
     *
     * Reverts if region is paused
     *
     * @param _region the region to check pause status for
     */
    function revertIfPaused(PausableRegion _region) internal view {
        // Region enum value must be used as the exponent in a power of 2
        uint256 powerOfTwo = 1 << uint256(_region);
        if ((ProtocolLib.protocolStatus().pauseScenario & powerOfTwo) == powerOfTwo)
            revert BosonErrors.RegionPaused(_region);
    }
}

// File contracts/protocol/bases/ReentrancyGuardBase.sol

// Original license: SPDX_License_Identifier: MIT

pragma solidity 0.8.22;

/**
 * @notice Contract module that helps prevent reentrant calls to a function.
 *
 * The majority of code, comments and general idea is taken from OpenZeppelin implementation.
 * Code was adjusted to work with the storage layout used in the protocol.
 * Reference implementation: OpenZeppelin Contracts v4.4.1 (security/ReentrancyGuard.sol)
 *
 * Inheriting from `ReentrancyGuard` will make the {nonReentrant} modifier
 * available, which can be applied to functions to make sure there are no nested
 * (reentrant) calls to them.
 *
 * @dev Because there is a single `nonReentrant` guard, functions marked as
 * `nonReentrant` may not call one another. This can be worked around by making
 * those functions `private`, and then adding `external` `nonReentrant` entry
 * points to them.
 *
 * TIP: If you would like to learn more about reentrancy and alternative ways
 * to protect against it, check out our blog post
 * https://blog.openzeppelin.com/reentrancy-after-istanbul/[Reentrancy After Istanbul].
 */
abstract contract ReentrancyGuardBase {
    /**
     * @notice Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        ProtocolLib.ProtocolStatus storage ps = ProtocolLib.protocolStatus();
        // On the first call to nonReentrant, ps.reentrancyStatus will be NOT_ENTERED
        if (ps.reentrancyStatus == ENTERED) revert BosonErrors.ReentrancyGuard();

        // Any calls to nonReentrant after this point will fail
        ps.reentrancyStatus = ENTERED;

        _;

        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        ps.reentrancyStatus = NOT_ENTERED;
    }
}

// File contracts/protocol/libs/EIP712Lib.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity 0.8.22;

/**
 * @title EIP712Lib
 *
 * @dev Provides the domain separator and chain id.
 */
library EIP712Lib {
    /**
     * @notice Generates the domain separator hash.
     * @dev Using the chainId as the salt enables the client to be active on one chain
     * while a metatx is signed for a contract on another chain. That could happen if the client is,
     * for instance, a metaverse scene that runs on one chain while the contracts it interacts with are deployed on another chain.
     *
     * @param _name - the name of the protocol
     * @param _version -  The version of the protocol
     * @return the domain separator hash
     */
    function buildDomainSeparator(string memory _name, string memory _version) internal view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    EIP712_DOMAIN_TYPEHASH,
                    keccak256(bytes(_name)),
                    keccak256(bytes(_version)),
                    address(this),
                    block.chainid
                )
            );
    }

    /**
     * @notice Recovers the Signer from the Signature components.
     *
     * Reverts if:
     * - Signer is the zero address
     *
     * @param _user  - the sender of the transaction
     * @param _hashedMetaTx - hashed meta transaction
     * @param _sigR - r part of the signer's signature
     * @param _sigS - s part of the signer's signature
     * @param _sigV - v part of the signer's signature
     * @return true if signer is same as _user parameter
     */
    function verify(
        address _user,
        bytes32 _hashedMetaTx,
        bytes32 _sigR,
        bytes32 _sigS,
        uint8 _sigV
    ) internal returns (bool) {
        // Ensure signature is unique
        // See https://github.com/OpenZeppelin/openzeppelin-contracts/blob/04695aecbd4d17dddfd55de766d10e3805d6f42f/contracts/cryptography/ECDSA.sol#63
        if (
            uint256(_sigS) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0 ||
            (_sigV != 27 && _sigV != 28)
        ) revert BosonErrors.InvalidSignature();

        address signer = ecrecover(toTypedMessageHash(_hashedMetaTx), _sigV, _sigR, _sigS);
        if (signer == address(0)) revert BosonErrors.InvalidSignature();
        return signer == _user;
    }

    /**
     * @notice Gets the domain separator from storage if matches with the chain id and diamond address, else, build new domain separator.
     *
     * @return the domain separator
     */
    function getDomainSeparator() private returns (bytes32) {
        ProtocolLib.ProtocolMetaTxInfo storage pmti = ProtocolLib.protocolMetaTxInfo();
        uint256 cachedChainId = pmti.cachedChainId;

        if (block.chainid == cachedChainId) {
            return pmti.domainSeparator;
        } else {
            bytes32 domainSeparator = buildDomainSeparator(PROTOCOL_NAME, PROTOCOL_VERSION);
            pmti.domainSeparator = domainSeparator;
            pmti.cachedChainId = block.chainid;

            return domainSeparator;
        }
    }

    /**
     * @notice Generates EIP712 compatible message hash.
     *
     * @dev Accepts message hash and returns hash message in EIP712 compatible form
     * so that it can be used to recover signer from signature signed using EIP712 formatted data
     * https://eips.ethereum.org/EIPS/eip-712
     * "\\x19" makes the encoding deterministic
     * "\\x01" is the version byte to make it compatible to EIP-191
     *
     * @param _messageHash  - the message hash
     * @return the EIP712 compatible message hash
     */
    function toTypedMessageHash(bytes32 _messageHash) internal returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", getDomainSeparator(), _messageHash));
    }

    /**
     * @notice Gets the current message sender address from storage.
     *
     * @return the the current message sender address from storage
     */
    function getCurrentSenderAddress() internal view returns (address) {
        return ProtocolLib.protocolMetaTxInfo().currentSenderAddress;
    }

    /**
     * @notice Returns the message sender address.
     *
     * @dev Could be msg.sender or the message sender address from storage (in case of meta transaction).
     *
     * @return the message sender address
     */
    function msgSender() internal view returns (address) {
        bool isItAMetaTransaction = ProtocolLib.protocolMetaTxInfo().isMetaTransaction;

        // Get sender from the storage if this is a meta transaction
        if (isItAMetaTransaction) {
            address sender = getCurrentSenderAddress();
            if (sender == address(0)) revert BosonErrors.InvalidAddress();

            return sender;
        } else {
            return msg.sender;
        }
    }
}

// File contracts/protocol/bases/ProtocolBase.sol

// Original license: SPDX_License_Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

/**
 * @title ProtocolBase
 *
 * @notice Provides domain and common modifiers to Protocol facets
 */
abstract contract ProtocolBase is PausableBase, ReentrancyGuardBase, BosonErrors {
    /**
     * @notice Modifier to protect initializer function from being invoked twice.
     */
    modifier onlyUninitialized(bytes4 interfaceId) {
        ProtocolLib.ProtocolStatus storage ps = protocolStatus();
        if (ps.initializedInterfaces[interfaceId]) revert AlreadyInitialized();
        ps.initializedInterfaces[interfaceId] = true;
        _;
    }

    /**
     * @notice Modifier that checks that the caller has a specific role.
     *
     * Reverts if caller doesn't have role.
     *
     * See: {AccessController.hasRole}
     *
     * @param _role - the role to check
     */
    modifier onlyRole(bytes32 _role) {
        DiamondLib.DiamondStorage storage ds = DiamondLib.diamondStorage();
        if (!ds.accessController.hasRole(_role, msgSender())) revert AccessDenied();
        _;
    }

    /**
     * @notice Get the Protocol Addresses slot
     *
     * @return pa - the Protocol Addresses slot
     */
    function protocolAddresses() internal pure returns (ProtocolLib.ProtocolAddresses storage pa) {
        pa = ProtocolLib.protocolAddresses();
    }

    /**
     * @notice Get the Protocol Limits slot
     *
     * @return pl - the Protocol Limits slot
     */
    function protocolLimits() internal pure returns (ProtocolLib.ProtocolLimits storage pl) {
        pl = ProtocolLib.protocolLimits();
    }

    /**
     * @notice Get the Protocol Entities slot
     *
     * @return pe - the Protocol Entities slot
     */
    function protocolEntities() internal pure returns (ProtocolLib.ProtocolEntities storage pe) {
        pe = ProtocolLib.protocolEntities();
    }

    /**
     * @notice Get the Protocol Lookups slot
     *
     * @return pl - the Protocol Lookups slot
     */
    function protocolLookups() internal pure returns (ProtocolLib.ProtocolLookups storage pl) {
        pl = ProtocolLib.protocolLookups();
    }

    /**
     * @notice Get the Protocol Fees slot
     *
     * @return pf - the Protocol Fees slot
     */
    function protocolFees() internal pure returns (ProtocolLib.ProtocolFees storage pf) {
        pf = ProtocolLib.protocolFees();
    }

    /**
     * @notice Get the Protocol Counters slot
     *
     * @return pc the Protocol Counters slot
     */
    function protocolCounters() internal pure returns (ProtocolLib.ProtocolCounters storage pc) {
        pc = ProtocolLib.protocolCounters();
    }

    /**
     * @notice Get the Protocol meta-transactions storage slot
     *
     * @return pmti the Protocol meta-transactions storage slot
     */
    function protocolMetaTxInfo() internal pure returns (ProtocolLib.ProtocolMetaTxInfo storage pmti) {
        pmti = ProtocolLib.protocolMetaTxInfo();
    }

    /**
     * @notice Get the Protocol Status slot
     *
     * @return ps the Protocol Status slot
     */
    function protocolStatus() internal pure returns (ProtocolLib.ProtocolStatus storage ps) {
        ps = ProtocolLib.protocolStatus();
    }

    /**
     * @notice Gets a seller id from storage by assistant address
     *
     * @param _assistant - the assistant address of the seller
     * @return exists - whether the seller id exists
     * @return sellerId  - the seller id
     */
    function getSellerIdByAssistant(address _assistant) internal view returns (bool exists, uint256 sellerId) {
        // Get the seller id
        sellerId = protocolLookups().sellerIdByAssistant[_assistant];

        // Determine existence
        exists = (sellerId > 0);
    }

    /**
     * @notice Gets a seller id from storage by admin address
     *
     * @param _admin - the admin address of the seller
     * @return exists - whether the seller id exists
     * @return sellerId  - the seller id
     */
    function getSellerIdByAdmin(address _admin) internal view returns (bool exists, uint256 sellerId) {
        // Get the seller id
        sellerId = protocolLookups().sellerIdByAdmin[_admin];

        // Determine existence
        exists = (sellerId > 0);
    }

    /**
     * @notice Gets a seller id from storage by auth token.  A seller will have either an admin address or an auth token
     *
     * @param _authToken - the potential _authToken of the seller.
     * @return exists - whether the seller id exists
     * @return sellerId  - the seller id
     */
    function getSellerIdByAuthToken(
        AuthToken calldata _authToken
    ) internal view returns (bool exists, uint256 sellerId) {
        // Get the seller id
        sellerId = protocolLookups().sellerIdByAuthToken[_authToken.tokenType][_authToken.tokenId];

        // Determine existence
        exists = (sellerId > 0);
    }

    /**
     * @notice Gets a buyer id from storage by wallet address
     *
     * @param _wallet - the wallet address of the buyer
     * @return exists - whether the buyer id exists
     * @return buyerId  - the buyer id
     */
    function getBuyerIdByWallet(address _wallet) internal view returns (bool exists, uint256 buyerId) {
        // Get the buyer id
        buyerId = protocolLookups().buyerIdByWallet[_wallet];

        // Determine existence
        exists = (buyerId > 0);
    }

    /**
     * @notice Gets a agent id from storage by wallet address
     *
     * @param _wallet - the wallet address of the buyer
     * @return exists - whether the buyer id exists
     * @return agentId  - the buyer id
     */
    function getAgentIdByWallet(address _wallet) internal view returns (bool exists, uint256 agentId) {
        // Get the buyer id
        agentId = protocolLookups().agentIdByWallet[_wallet];

        // Determine existence
        exists = (agentId > 0);
    }

    /**
     * @notice Gets a dispute resolver id from storage by assistant address
     *
     * @param _assistant - the assistant address of the dispute resolver
     * @return exists - whether the dispute resolver id exists
     * @return disputeResolverId  - the dispute resolver  id
     */
    function getDisputeResolverIdByAssistant(
        address _assistant
    ) internal view returns (bool exists, uint256 disputeResolverId) {
        // Get the dispute resolver id
        disputeResolverId = protocolLookups().disputeResolverIdByAssistant[_assistant];

        // Determine existence
        exists = (disputeResolverId > 0);
    }

    /**
     * @notice Gets a dispute resolver id from storage by admin address
     *
     * @param _admin - the admin address of the dispute resolver
     * @return exists - whether the dispute resolver id exists
     * @return disputeResolverId  - the dispute resolver id
     */
    function getDisputeResolverIdByAdmin(
        address _admin
    ) internal view returns (bool exists, uint256 disputeResolverId) {
        // Get the dispute resolver id
        disputeResolverId = protocolLookups().disputeResolverIdByAdmin[_admin];

        // Determine existence
        exists = (disputeResolverId > 0);
    }

    /**
     * @notice Gets a group id from storage by offer id
     *
     * @param _offerId - the offer id
     * @return exists - whether the group id exists
     * @return groupId  - the group id.
     */
    function getGroupIdByOffer(uint256 _offerId) internal view returns (bool exists, uint256 groupId) {
        // Get the group id
        groupId = protocolLookups().groupIdByOffer[_offerId];

        // Determine existence
        exists = (groupId > 0);
    }

    /**
     * @notice Fetches a given seller from storage by id
     *
     * @param _sellerId - the id of the seller
     * @return exists - whether the seller exists
     * @return seller - the seller details. See {BosonTypes.Seller}
     * @return authToken - optional AuthToken struct that specifies an AuthToken type and tokenId that the user can use to do admin functions
     */
    function fetchSeller(
        uint256 _sellerId
    ) internal view returns (bool exists, Seller storage seller, AuthToken storage authToken) {
        // Cache protocol entities for reference
        ProtocolLib.ProtocolEntities storage entities = protocolEntities();

        // Get the seller's slot
        seller = entities.sellers[_sellerId];

        //Get the seller's auth token's slot
        authToken = entities.authTokens[_sellerId];

        // Determine existence
        exists = (_sellerId > 0 && seller.id == _sellerId);
    }

    /**
     * @notice Fetches a given buyer from storage by id
     *
     * @param _buyerId - the id of the buyer
     * @return exists - whether the buyer exists
     * @return buyer - the buyer details. See {BosonTypes.Buyer}
     */
    function fetchBuyer(uint256 _buyerId) internal view returns (bool exists, BosonTypes.Buyer storage buyer) {
        // Get the buyer's slot
        buyer = protocolEntities().buyers[_buyerId];

        // Determine existence
        exists = (_buyerId > 0 && buyer.id == _buyerId);
    }

    /**
     * @notice Fetches a given dispute resolver from storage by id
     *
     * @param _disputeResolverId - the id of the dispute resolver
     * @return exists - whether the dispute resolver exists
     * @return disputeResolver - the dispute resolver details. See {BosonTypes.DisputeResolver}
     * @return disputeResolverFees - list of fees dispute resolver charges per token type. Zero address is native currency. See {BosonTypes.DisputeResolverFee}
     */
    function fetchDisputeResolver(
        uint256 _disputeResolverId
    )
        internal
        view
        returns (
            bool exists,
            BosonTypes.DisputeResolver storage disputeResolver,
            BosonTypes.DisputeResolverFee[] storage disputeResolverFees
        )
    {
        // Cache protocol entities for reference
        ProtocolLib.ProtocolEntities storage entities = protocolEntities();

        // Get the dispute resolver's slot
        disputeResolver = entities.disputeResolvers[_disputeResolverId];

        //Get dispute resolver's fee list slot
        disputeResolverFees = entities.disputeResolverFees[_disputeResolverId];

        // Determine existence
        exists = (_disputeResolverId > 0 && disputeResolver.id == _disputeResolverId);
    }

    /**
     * @notice Fetches a given agent from storage by id
     *
     * @param _agentId - the id of the agent
     * @return exists - whether the agent exists
     * @return agent - the agent details. See {BosonTypes.Agent}
     */
    function fetchAgent(uint256 _agentId) internal view returns (bool exists, BosonTypes.Agent storage agent) {
        // Get the agent's slot
        agent = protocolEntities().agents[_agentId];

        // Determine existence
        exists = (_agentId > 0 && agent.id == _agentId);
    }

    /**
     * @notice Fetches a given offer from storage by id
     *
     * @param _offerId - the id of the offer
     * @return exists - whether the offer exists
     * @return offer - the offer details. See {BosonTypes.Offer}
     */
    function fetchOffer(uint256 _offerId) internal view returns (bool exists, Offer storage offer) {
        // Get the offer's slot
        offer = protocolEntities().offers[_offerId];

        // Determine existence
        exists = (_offerId > 0 && offer.id == _offerId);
    }

    /**
     * @notice Fetches the offer dates from storage by offer id
     *
     * @param _offerId - the id of the offer
     * @return offerDates - the offer dates details. See {BosonTypes.OfferDates}
     */
    function fetchOfferDates(uint256 _offerId) internal view returns (BosonTypes.OfferDates storage offerDates) {
        // Get the offerDates slot
        offerDates = protocolEntities().offerDates[_offerId];
    }

    /**
     * @notice Fetches the offer durations from storage by offer id
     *
     * @param _offerId - the id of the offer
     * @return offerDurations - the offer durations details. See {BosonTypes.OfferDurations}
     */
    function fetchOfferDurations(
        uint256 _offerId
    ) internal view returns (BosonTypes.OfferDurations storage offerDurations) {
        // Get the offer's slot
        offerDurations = protocolEntities().offerDurations[_offerId];
    }

    /**
     * @notice Fetches the dispute resolution terms from storage by offer id
     *
     * @param _offerId - the id of the offer
     * @return disputeResolutionTerms - the details about the dispute resolution terms. See {BosonTypes.DisputeResolutionTerms}
     */
    function fetchDisputeResolutionTerms(
        uint256 _offerId
    ) internal view returns (BosonTypes.DisputeResolutionTerms storage disputeResolutionTerms) {
        // Get the disputeResolutionTerms slot
        disputeResolutionTerms = protocolEntities().disputeResolutionTerms[_offerId];
    }

    /**
     * @notice Fetches a given group from storage by id
     *
     * @param _groupId - the id of the group
     * @return exists - whether the group exists
     * @return group - the group details. See {BosonTypes.Group}
     */
    function fetchGroup(uint256 _groupId) internal view returns (bool exists, Group storage group) {
        // Get the group's slot
        group = protocolEntities().groups[_groupId];

        // Determine existence
        exists = (_groupId > 0 && group.id == _groupId);
    }

    /**
     * @notice Fetches the Condition from storage by group id
     *
     * @param _groupId - the id of the group
     * @return condition - the condition details. See {BosonTypes.Condition}
     */
    function fetchCondition(uint256 _groupId) internal view returns (BosonTypes.Condition storage condition) {
        // Get the offerDates slot
        condition = protocolEntities().conditions[_groupId];
    }

    /**
     * @notice Fetches a given exchange from storage by id
     *
     * @param _exchangeId - the id of the exchange
     * @return exists - whether the exchange exists
     * @return exchange - the exchange details. See {BosonTypes.Exchange}
     */
    function fetchExchange(uint256 _exchangeId) internal view returns (bool exists, Exchange storage exchange) {
        // Get the exchange's slot
        exchange = protocolEntities().exchanges[_exchangeId];

        // Determine existence
        exists = (_exchangeId > 0 && exchange.id == _exchangeId);
    }

    /**
     * @notice Fetches a given voucher from storage by exchange id
     *
     * @param _exchangeId - the id of the exchange associated with the voucher
     * @return voucher - the voucher details. See {BosonTypes.Voucher}
     */
    function fetchVoucher(uint256 _exchangeId) internal view returns (Voucher storage voucher) {
        // Get the voucher
        voucher = protocolEntities().vouchers[_exchangeId];
    }

    /**
     * @notice Fetches a given dispute from storage by exchange id
     *
     * @param _exchangeId - the id of the exchange associated with the dispute
     * @return exists - whether the dispute exists
     * @return dispute - the dispute details. See {BosonTypes.Dispute}
     */
    function fetchDispute(
        uint256 _exchangeId
    ) internal view returns (bool exists, Dispute storage dispute, DisputeDates storage disputeDates) {
        // Cache protocol entities for reference
        ProtocolLib.ProtocolEntities storage entities = protocolEntities();

        // Get the dispute's slot
        dispute = entities.disputes[_exchangeId];

        // Get the disputeDates slot
        disputeDates = entities.disputeDates[_exchangeId];

        // Determine existence
        exists = (_exchangeId > 0 && dispute.exchangeId == _exchangeId);
    }

    /**
     * @notice Fetches a given twin from storage by id
     *
     * @param _twinId - the id of the twin
     * @return exists - whether the twin exists
     * @return twin - the twin details. See {BosonTypes.Twin}
     */
    function fetchTwin(uint256 _twinId) internal view returns (bool exists, Twin storage twin) {
        // Get the twin's slot
        twin = protocolEntities().twins[_twinId];

        // Determine existence
        exists = (_twinId > 0 && twin.id == _twinId);
    }

    /**
     * @notice Fetches a given bundle from storage by id
     *
     * @param _bundleId - the id of the bundle
     * @return exists - whether the bundle exists
     * @return bundle - the bundle details. See {BosonTypes.Bundle}
     */
    function fetchBundle(uint256 _bundleId) internal view returns (bool exists, Bundle storage bundle) {
        // Get the bundle's slot
        bundle = protocolEntities().bundles[_bundleId];

        // Determine existence
        exists = (_bundleId > 0 && bundle.id == _bundleId);
    }

    /**
     * @notice Gets offer from protocol storage, makes sure it exist and not voided
     *
     * Reverts if:
     * - Offer does not exist
     * - Offer already voided
     *
     *  @param _offerId - the id of the offer to check
     */
    function getValidOffer(uint256 _offerId) internal view returns (Offer storage offer) {
        bool exists;

        // Get offer
        (exists, offer) = fetchOffer(_offerId);

        // Offer must already exist
        if (!exists) revert NoSuchOffer();

        // Offer must not already be voided
        if (offer.voided) revert OfferHasBeenVoided();
    }

    /**
     * @notice Gets offer and seller from protocol storage
     *
     * Reverts if:
     * - Offer does not exist
     * - Offer already voided
     * - Seller assistant is not the caller
     *
     *  @param _offerId - the id of the offer to check
     *  @return offer - the offer details. See {BosonTypes.Offer}
     */
    function getValidOfferWithSellerCheck(uint256 _offerId) internal view returns (Offer storage offer) {
        // Get offer
        offer = getValidOffer(_offerId);

        // Get seller, we assume seller exists if offer exists
        (, Seller storage seller, ) = fetchSeller(offer.sellerId);

        // Caller must be seller's assistant address
        if (seller.assistant != msgSender()) revert NotAssistant();
    }

    /**
     * @notice Gets the bundle id for a given offer id.
     *
     * @param _offerId - the offer id.
     * @return exists - whether the bundle id exists
     * @return bundleId  - the bundle id.
     */
    function fetchBundleIdByOffer(uint256 _offerId) internal view returns (bool exists, uint256 bundleId) {
        // Get the bundle id
        bundleId = protocolLookups().bundleIdByOffer[_offerId];

        // Determine existence
        exists = (bundleId > 0);
    }

    /**
     * @notice Gets the bundle id for a given twin id.
     *
     * @param _twinId - the twin id.
     * @return exists - whether the bundle id exist
     * @return bundleId  - the bundle id.
     */
    function fetchBundleIdByTwin(uint256 _twinId) internal view returns (bool exists, uint256 bundleId) {
        // Get the bundle id
        bundleId = protocolLookups().bundleIdByTwin[_twinId];

        // Determine existence
        exists = (bundleId > 0);
    }

    /**
     * @notice Gets the exchange ids for a given offer id.
     *
     * @param _offerId - the offer id.
     * @return exists - whether the exchange Ids exist
     * @return exchangeIds  - the exchange Ids.
     */
    function getExchangeIdsByOffer(
        uint256 _offerId
    ) internal view returns (bool exists, uint256[] storage exchangeIds) {
        // Get the exchange Ids
        exchangeIds = protocolLookups().exchangeIdsByOffer[_offerId];

        // Determine existence
        exists = (exchangeIds.length > 0);
    }

    /**
     * @notice Make sure the caller is buyer associated with the exchange
     *
     * Reverts if
     * - caller is not the buyer associated with exchange
     *
     * @param _currentBuyer - id of current buyer associated with the exchange
     */
    function checkBuyer(uint256 _currentBuyer) internal view {
        // Get the caller's buyer account id
        (, uint256 buyerId) = getBuyerIdByWallet(msgSender());

        // Must be the buyer associated with the exchange (which is always voucher holder)
        if (buyerId != _currentBuyer) revert NotVoucherHolder();
    }

    /**
     * @notice Get a valid exchange and its associated voucher
     *
     * Reverts if
     * - Exchange does not exist
     * - Exchange is not in the expected state
     *
     * @param _exchangeId - the id of the exchange to complete
     * @param _expectedState - the state the exchange should be in
     * @return exchange - the exchange
     * @return voucher - the voucher
     */
    function getValidExchange(
        uint256 _exchangeId,
        ExchangeState _expectedState
    ) internal view returns (Exchange storage exchange, Voucher storage voucher) {
        // Get the exchange
        bool exchangeExists;
        (exchangeExists, exchange) = fetchExchange(_exchangeId);

        // Make sure the exchange exists
        if (!exchangeExists) revert NoSuchExchange();

        // Make sure the exchange is in expected state
        if (exchange.state != _expectedState) revert InvalidState();

        // Get the voucher
        voucher = fetchVoucher(_exchangeId);
    }

    /**
     * @notice Returns the current sender address.
     */
    function msgSender() internal view returns (address) {
        return EIP712Lib.msgSender();
    }

    /**
     * @notice Gets the agent id for a given offer id.
     *
     * @param _offerId - the offer id.
     * @return exists - whether the exchange id exist
     * @return agentId - the agent id.
     */
    function fetchAgentIdByOffer(uint256 _offerId) internal view returns (bool exists, uint256 agentId) {
        // Get the agent id
        agentId = protocolLookups().agentIdByOffer[_offerId];

        // Determine existence
        exists = (agentId > 0);
    }

    /**
     * @notice Fetches the offer fees from storage by offer id
     *
     * @param _offerId - the id of the offer
     * @return offerFees - the offer fees details. See {BosonTypes.OfferFees}
     */
    function fetchOfferFees(uint256 _offerId) internal view returns (BosonTypes.OfferFees storage offerFees) {
        // Get the offerFees slot
        offerFees = protocolEntities().offerFees[_offerId];
    }

    /**
     * @notice Fetches a list of twin receipts from storage by exchange id
     *
     * @param _exchangeId - the id of the exchange
     * @return exists - whether one or more twin receipt exists
     * @return twinReceipts - the list of twin receipts. See {BosonTypes.TwinReceipt}
     */
    function fetchTwinReceipts(
        uint256 _exchangeId
    ) internal view returns (bool exists, TwinReceipt[] storage twinReceipts) {
        // Get the twin receipts slot
        twinReceipts = protocolLookups().twinReceiptsByExchange[_exchangeId];

        // Determine existence
        exists = (_exchangeId > 0 && twinReceipts.length > 0);
    }

    /**
     * @notice Fetches a condition from storage by exchange id
     *
     * @param _exchangeId - the id of the exchange
     * @return exists - whether one condition exists for the exchange
     * @return condition - the condition. See {BosonTypes.Condition}
     */
    function fetchConditionByExchange(
        uint256 _exchangeId
    ) internal view returns (bool exists, Condition storage condition) {
        // Get the condition slot
        condition = protocolLookups().exchangeCondition[_exchangeId];

        // Determine existence
        exists = (_exchangeId > 0 && condition.method != EvaluationMethod.None);
    }

    /**
     * @notice calculate the protocol fee for a given exchange
     *
     * @param _exchangeToken - the token used for the exchange
     * @param _price - the price of the exchange
     * @return protocolFee - the protocol fee
     */
    function getProtocolFee(address _exchangeToken, uint256 _price) internal view returns (uint256 protocolFee) {
        // Calculate and set the protocol fee
        return
            _exchangeToken == protocolAddresses().token
                ? protocolFees().flatBoson
                : (protocolFees().percentage * _price) / HUNDRED_PERCENT;
    }

    /**
     * @notice Fetches a clone address from storage by seller id and collection index
     * If the collection index is 0, the clone address is the seller's main collection,
     * otherwise it is the clone address of the additional collection at the given index.
     *
     * @param _lookups - storage slot for protocol lookups
     * @param _sellerId - the id of the seller
     * @param _collectionIndex - the index of the collection
     * @return cloneAddress - the clone address
     */
    function getCloneAddress(
        ProtocolLib.ProtocolLookups storage _lookups,
        uint256 _sellerId,
        uint256 _collectionIndex
    ) internal view returns (address cloneAddress) {
        return
            _collectionIndex == 0
                ? _lookups.cloneAddress[_sellerId]
                : _lookups.additionalCollections[_sellerId][_collectionIndex - 1].collectionAddress;
    }

    /**
     * @notice Internal helper to get royalty information and seller for a chosen exchange.
     *
     * Reverts if exchange does not exist.
     *
     * @param _queryId - offer id or exchange id
     * @param _isExchangeId - indicates if the query represents the exchange id
     * @return royaltyInfo - list of royalty recipients and corresponding bps
     * @return royaltyInfoIndex - index of the royalty info
     * @return treasury - the seller's treasury address
     */
    function fetchRoyalties(
        uint256 _queryId,
        bool _isExchangeId
    ) internal view returns (RoyaltyInfo storage royaltyInfo, uint256 royaltyInfoIndex, address treasury) {
        RoyaltyInfo[] storage royaltyInfoAll;
        if (_isExchangeId) {
            (bool exists, Exchange storage exchange) = fetchExchange(_queryId);
            if (!exists) revert NoSuchExchange();
            _queryId = exchange.offerId;
        }

        // not using fetchOffer to reduce gas costs (limitation of royalty registry)
        ProtocolLib.ProtocolEntities storage pe = protocolEntities();
        Offer storage offer = pe.offers[_queryId];
        treasury = pe.sellers[offer.sellerId].treasury;
        royaltyInfoAll = pe.offers[_queryId].royaltyInfo;

        uint256 royaltyInfoLength = royaltyInfoAll.length;
        if (royaltyInfoLength == 0) revert NoSuchOffer();
        royaltyInfoIndex = royaltyInfoLength - 1;
        // get the last royalty info
        return (royaltyInfoAll[royaltyInfoIndex], royaltyInfoIndex, treasury);
    }

    /**
     * @notice Helper function that calculates the total royalty percentage for a given exchange
     *
     * @param _bps - storage slot for array of royalty percentages
     * @return totalBps - the total royalty percentage
     */
    function getTotalRoyaltyPercentage(uint256[] storage _bps) internal view returns (uint256 totalBps) {
        uint256 bpsLength = _bps.length;
        for (uint256 i = 0; i < bpsLength; ) {
            totalBps += _bps[i];

            unchecked {
                i++;
            }
        }
    }
}

// File contracts/protocol/clients/proxy/Proxy.sol

// Original license: SPDX_License_Identifier: MIT

pragma solidity 0.8.22;

/**
 * @notice This abstract contract provides a fallback function that delegates all calls to another contract using the EVM
 * instruction `delegatecall`. We refer to the second contract as the _implementation_ behind the proxy, and it has to
 * be specified by overriding the virtual {_implementation} function.
 *
 * Additionally, delegation to the implementation can be triggered manually through the {_fallback} function, or to a
 * different contract through the {_delegate} function.
 *
 * The success and return data of the delegated call will be returned back to the caller of the proxy.
 */
abstract contract Proxy {
    /**
     * @notice Delegates the current call to `implementation`.
     *
     * This function does not return to its internal call site, it will return directly to the external caller.
     *
     * @param implementation - the address of the implementation to which the call should be delegated
     */
    function _delegate(address implementation) internal virtual {
        assembly {
            // Copy msg.data. We take full control of memory in this inline assembly
            // block because it will not return to Solidity code. We overwrite the
            // Solidity scratch pad at memory position 0.
            calldatacopy(0, 0, calldatasize())

            // Call the implementation.
            // out and outsize are 0 because we don't know the size yet.
            let result := delegatecall(gas(), implementation, 0, calldatasize(), 0, 0)

            // Copy the returned data.
            returndatacopy(0, 0, returndatasize())

            switch result
            // delegatecall returns 0 on error.
            case 0 {
                revert(0, returndatasize())
            }
            default {
                return(0, returndatasize())
            }
        }
    }

    /**
     * @notice This is a virtual function that should be overridden so it returns the address to which the fallback function
     * and {_fallback} should delegate.
     *
     * @return the address to which the fallback function should delegate
     */
    function _implementation() internal view virtual returns (address);

    /**
     * @notice Delegates the current call to the address returned by `_implementation()`.
     *
     * This function does not return to its internal call site, it will return directly to the external caller.
     */
    function _fallback() internal virtual {
        _beforeFallback();
        _delegate(_implementation());
    }

    /**
     * @notice Fallback function that delegates calls to the address returned by `_implementation()`. Will run if no other
     * function in the contract matches the call data.
     */
    fallback() external payable virtual {
        _fallback();
    }

    /**
     * @notice Fallback function that delegates calls to the address returned by `_implementation()`. Will run if call data
     * is empty.
     */
    receive() external payable virtual {
        _fallback();
    }

    /**
     * @notice Hook that is called before falling back to the implementation. Can happen as part of a manual `_fallback`
     * call, or as part of the Solidity `fallback` or `receive` functions.
     *
     * If overridden should call `super._beforeFallback()`.
     */
    function _beforeFallback() internal virtual {}
}

// File contracts/protocol/libs/BeaconClientLib.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity 0.8.22;

/**
 * @title BeaconClientLib
 *
 * @notice
 * - Defines BeaconSlot position
 * - Provides BeaconSlot accessor
 * - Defines hasRole function
 */
library BeaconClientLib {
    /**
     * @dev The storage slot of the UpgradeableBeacon contract which defines the implementation for this proxy.
     * This is bytes32(uint256(keccak256('eip1967.proxy.beacon')) - 1)) and is validated in the constructor.
     */
    bytes32 internal constant _BEACON_SLOT = 0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50;

    struct BeaconSlot {
        address value;
        bool initialized;
    }

    /**
     * @notice Returns a `BeaconSlot` with member `value`.
     *
     * @return r - the BeaconSlot storage slot cast to BeaconSlot
     */
    function getBeaconSlot() internal pure returns (BeaconSlot storage r) {
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := _BEACON_SLOT
        }
    }

    /**
     * @notice Returns the address of the Beacon
     *
     * @return the Beacon address
     */
    function _beacon() internal view returns (address) {
        return getBeaconSlot().value;
    }

    /**
     * @notice Checks that the caller has a specific role.
     *
     * Reverts if caller doesn't have role.
     *
     * See: {AccessController.hasRole}
     *
     * @param _role - the role to check
     * @return whether caller has role
     */
    function hasRole(bytes32 _role) internal view returns (bool) {
        // retrieve accessController from Beacon
        IAccessControl accessController = IClientExternalAddresses(_beacon()).getAccessController();

        // forward the check to accessController
        return accessController.hasRole(_role, msg.sender);
    }
}

// File contracts/protocol/clients/proxy/BeaconClientProxy.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity 0.8.22;

/**
 * @title BeaconClientProxy
 *
 * @notice Delegates calls to a Boson Protocol Client implementation contract,
 * such that functions on it execute in the context (address, storage)
 * of this proxy, allowing the implementation contract to be upgraded
 * without losing the accumulated state data.
 *
 * Protocol clients are the contracts in the system that communicate with
 * the facets of the ProtocolDiamond rather than acting as facets themselves.
 *
 * Each Protocol client contract will be deployed behind its own proxy for
 * future upgradability.
 */
contract BeaconClientProxy is Proxy {
    /**
     * @notice Initializes the contract after the deployment.
     * This function is callable only once
     *
     * @param _beaconAddress - address of the Beacon to initialize
     */
    function initialize(address _beaconAddress) external initializer {
        // set the beacon address
        BeaconClientLib.getBeaconSlot().value = _beaconAddress;
    }

    /**
     * @notice Modifier to protect initializer function from being invoked twice.
     */
    modifier initializer() {
        require(!BeaconClientLib.getBeaconSlot().initialized, "Initializable: contract is already initialized");
        _;
        BeaconClientLib.getBeaconSlot().initialized = true;
    }

    /**
     * @notice Returns the address to which the fallback function
     * and {_fallback} should delegate.
     * Implementation address is supplied by the Beacon
     *
     * @return address of the Beacon implementation
     */
    function _implementation() internal view override returns (address) {
        // Return the current implementation address
        return IClientExternalAddresses(BeaconClientLib._beacon()).getImplementation();
    }
}

// File contracts/protocol/facets/ConfigHandlerFacet.sol

// Original license: SPDX_License_Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

/**
 * @title ConfigHandlerFacet
 *
 * @notice Handles management and queries of various protocol-related settings.
 */
contract ConfigHandlerFacet is IBosonConfigHandler, ProtocolBase {
    /**
     * @notice Initializes facet.
     * This function is callable only once.
     *
     * @param _addresses - struct of Boson Protocol addresses (Boson Token (ERC-20) contract, treasury, and Voucher contract)
     * @param _limits - struct with Boson Protocol limits
     * @param _fees - struct of Boson Protocol fees
     */
    function initialize(
        ProtocolLib.ProtocolAddresses calldata _addresses,
        ProtocolLib.ProtocolLimits calldata _limits,
        ProtocolLib.ProtocolFees calldata _fees
    ) public onlyUninitialized(type(IBosonConfigHandler).interfaceId) {
        // Register supported interfaces
        DiamondLib.addSupportedInterface(type(IBosonConfigHandler).interfaceId);

        // Initialize protocol config params
        // _addresses.beaconProxy is ignored, since it's deployed later in this function
        setTokenAddress(_addresses.token);
        setTreasuryAddress(_addresses.treasury);
        setVoucherBeaconAddress(_addresses.voucherBeacon);
        setPriceDiscoveryAddress(_addresses.priceDiscovery);
        setProtocolFeePercentage(_fees.percentage);
        setProtocolFeeFlatBoson(_fees.flatBoson);
        setMaxEscalationResponsePeriod(_limits.maxEscalationResponsePeriod);
        setBuyerEscalationDepositPercentage(_fees.buyerEscalationDepositPercentage);
        setMaxTotalOfferFeePercentage(_limits.maxTotalOfferFeePercentage);
        setMaxRoyaltyPercentage(_limits.maxRoyaltyPercentage);
        setMaxResolutionPeriod(_limits.maxResolutionPeriod);
        setMinResolutionPeriod(_limits.minResolutionPeriod);
        setMinDisputePeriod(_limits.minDisputePeriod);

        // Initialize protocol counters
        ProtocolLib.ProtocolCounters storage pc = protocolCounters();
        pc.nextAccountId = 1;
        pc.nextBundleId = 1;
        pc.nextExchangeId = 1;
        pc.nextGroupId = 1;
        pc.nextOfferId = 1;
        pc.nextTwinId = 1;

        // Initialize reentrancyStatus
        protocolStatus().reentrancyStatus = NOT_ENTERED;

        // Initialize protocol meta-transaction config params
        ProtocolLib.ProtocolMetaTxInfo storage pmti = protocolMetaTxInfo();
        pmti.domainSeparator = EIP712Lib.buildDomainSeparator(PROTOCOL_NAME, PROTOCOL_VERSION);
        pmti.cachedChainId = block.chainid;

        // Deploy Boson Voucher proxy contract
        address beaconProxy = address(new BeaconClientProxy{ salt: VOUCHER_PROXY_SALT }());
        setBeaconProxyAddress(beaconProxy);
    }

    /**
     * @notice Sets the Boson Token (ERC-20 contract) address.
     *
     * Emits a TokenAddressChanged event if successful.
     *
     * Reverts if _tokenAddress is the zero address
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _tokenAddress - the Boson Token (ERC-20 contract) address
     */
    function setTokenAddress(address payable _tokenAddress) public override onlyRole(ADMIN) nonReentrant {
        checkNonZeroAddress(_tokenAddress);
        protocolAddresses().token = _tokenAddress;
        emit TokenAddressChanged(_tokenAddress, msgSender());
    }

    /**
     * @notice Gets the Boson Token (ERC-20 contract) address.
     *
     * @return the Boson Token (ERC-20 contract) address
     */
    function getTokenAddress() external view override returns (address payable) {
        return protocolAddresses().token;
    }

    /**
     * @notice Sets the Boson Protocol multi-sig wallet address.
     *
     * Emits a TreasuryAddressChanged event if successful.
     *
     * Reverts if _treasuryAddress is the zero address
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _treasuryAddress - the the multi-sig wallet address
     */
    function setTreasuryAddress(address payable _treasuryAddress) public override onlyRole(ADMIN) nonReentrant {
        checkNonZeroAddress(_treasuryAddress);
        protocolAddresses().treasury = _treasuryAddress;
        emit TreasuryAddressChanged(_treasuryAddress, msgSender());
    }

    /**
     * @notice Gets the Boson Protocol multi-sig wallet address.
     *
     * @return the Boson Protocol multi-sig wallet address
     */
    function getTreasuryAddress() external view override returns (address payable) {
        return protocolAddresses().treasury;
    }

    /**
     * @notice Sets the Boson Voucher beacon contract address.
     *
     * Emits a VoucherBeaconAddressChanged event if successful.
     *
     * Reverts if _voucherBeaconAddress is the zero address
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _voucherBeaconAddress - the Boson Voucher beacon contract address
     */
    function setVoucherBeaconAddress(address _voucherBeaconAddress) public override onlyRole(ADMIN) nonReentrant {
        checkNonZeroAddress(_voucherBeaconAddress);
        protocolAddresses().voucherBeacon = _voucherBeaconAddress;
        emit VoucherBeaconAddressChanged(_voucherBeaconAddress, msgSender());
    }

    /**
     * @notice Gets the Boson Voucher beacon contract address.
     *
     * @return the Boson Voucher beacon contract address
     */
    function getVoucherBeaconAddress() external view override returns (address) {
        return protocolAddresses().voucherBeacon;
    }

    /**
     * @notice Sets the Boson Voucher reference proxy implementation address.
     *
     * Emits a BeaconProxyAddressChanged event if successful.
     *
     * Reverts if _beaconProxyAddress is the zero address
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _beaconProxyAddress - reference proxy implementation address
     */
    function setBeaconProxyAddress(address _beaconProxyAddress) public override onlyRole(ADMIN) nonReentrant {
        checkNonZeroAddress(_beaconProxyAddress);
        protocolAddresses().beaconProxy = _beaconProxyAddress;
        emit BeaconProxyAddressChanged(_beaconProxyAddress, msgSender());
    }

    /**
     * @notice Gets the beaconProxy address.
     *
     * @return the beaconProxy address
     */
    function getBeaconProxyAddress() external view override returns (address) {
        return protocolAddresses().beaconProxy;
    }

    /**
     * @notice Sets the Boson Price Discovery contract address.
     *
     * Emits a PriceDiscoveryAddressChanged event if successful.
     *
     * Reverts if _priceDiscovery is the zero address
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _priceDiscovery - the Boson Price Discovery contract address
     */
    function setPriceDiscoveryAddress(address _priceDiscovery) public override onlyRole(ADMIN) nonReentrant {
        checkNonZeroAddress(_priceDiscovery);
        protocolAddresses().priceDiscovery = _priceDiscovery;
        emit PriceDiscoveryAddressChanged(_priceDiscovery, msgSender());
    }

    /**
     * @notice Gets the Boson Price Discovery contract address.
     *
     * @return the Boson Price Discovery contract address
     */
    function getPriceDiscoveryAddress() external view override returns (address) {
        return protocolAddresses().priceDiscovery;
    }

    /**
     * @notice Sets the protocol fee percentage.
     *
     * Emits a ProtocolFeePercentageChanged event if successful.
     *
     * Reverts if the _protocolFeePercentage is greater than 10000.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _protocolFeePercentage - the percentage that will be taken as a fee from the net of a Boson Protocol sale or auction (after royalties)
     *
     * N.B. Represent percentage value as an unsigned int by multiplying the percentage by 100:
     * e.g, 1.75% = 175, 100% = 10000
     */
    function setProtocolFeePercentage(uint256 _protocolFeePercentage) public override onlyRole(ADMIN) nonReentrant {
        // Make sure percentage is less than 10000
        checkMaxPercententage(_protocolFeePercentage);

        // Store fee percentage
        protocolFees().percentage = _protocolFeePercentage;

        // Notify watchers of state change
        emit ProtocolFeePercentageChanged(_protocolFeePercentage, msgSender());
    }

    /**
     * @notice Gets the protocol fee percentage.
     *
     * @return the protocol fee percentage
     */
    function getProtocolFeePercentage() external view override returns (uint256) {
        return protocolFees().percentage;
    }

    /**
     * @notice Sets the flat protocol fee for exchanges in $BOSON.
     *
     * Emits a ProtocolFeeFlatBosonChanged event if successful.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _protocolFeeFlatBoson - the flat fee taken for exchanges in $BOSON
     *
     */
    function setProtocolFeeFlatBoson(uint256 _protocolFeeFlatBoson) public override onlyRole(ADMIN) nonReentrant {
        // Store fee percentage
        protocolFees().flatBoson = _protocolFeeFlatBoson;

        // Notify watchers of state change
        emit ProtocolFeeFlatBosonChanged(_protocolFeeFlatBoson, msgSender());
    }

    /**
     * @notice Gets the flat protocol fee for exchanges in $BOSON.
     *
     * @return the flat fee taken for exchanges in $BOSON
     */
    function getProtocolFeeFlatBoson() external view override returns (uint256) {
        return protocolFees().flatBoson;
    }

    /**
     * @notice Sets the maximum escalation response period a dispute resolver can specify.
     *
     * Emits a MaxEscalationResponsePeriodChanged event if successful.
     *
     * Reverts if the _maxEscalationResponsePeriod is zero.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxEscalationResponsePeriod - the maximum escalation response period that a {BosonTypes.DisputeResolver} can specify
     */
    function setMaxEscalationResponsePeriod(
        uint256 _maxEscalationResponsePeriod
    ) public override onlyRole(ADMIN) nonReentrant {
        // Make sure _maxEscalationResponsePeriod is greater than 0
        checkNonZeroValue(_maxEscalationResponsePeriod);

        protocolLimits().maxEscalationResponsePeriod = _maxEscalationResponsePeriod;
        emit MaxEscalationResponsePeriodChanged(_maxEscalationResponsePeriod, msgSender());
    }

    /**
     * @notice Gets the maximum escalation response period a dispute resolver can specify.
     *
     * @return the maximum escalation response period that a {BosonTypes.DisputeResolver} can specify
     */
    function getMaxEscalationResponsePeriod() external view override returns (uint256) {
        return protocolLimits().maxEscalationResponsePeriod;
    }

    /**
     * @notice Sets the total offer fee percentage limit that will validate the sum of (Protocol Fee percentage + Agent Fee percentage) of an offer fee.
     *
     * Emits a MaxTotalOfferFeePercentageChanged event if successful.
     *
     * Reverts if _maxTotalOfferFeePercentage is greater than 10000.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxTotalOfferFeePercentage - the maximum total offer fee percentage
     *
     * N.B. Represent percentage value as an unsigned int by multiplying the percentage by 100:
     * e.g, 1.75% = 175, 100% = 10000
     */
    function setMaxTotalOfferFeePercentage(
        uint16 _maxTotalOfferFeePercentage
    ) public override onlyRole(ADMIN) nonReentrant {
        // Make sure percentage is less than 10000
        checkMaxPercententage(_maxTotalOfferFeePercentage);

        // Store fee percentage
        protocolLimits().maxTotalOfferFeePercentage = _maxTotalOfferFeePercentage;

        // Notify watchers of state change
        emit MaxTotalOfferFeePercentageChanged(_maxTotalOfferFeePercentage, msgSender());
    }

    /**
     * @notice Gets the total offer fee percentage limit that will validate the sum of (Protocol Fee percentage + Agent Fee percentage) of an offer fee.
     *
     * @return the maximum total offer fee percentage
     */
    function getMaxTotalOfferFeePercentage() external view override returns (uint16) {
        return protocolLimits().maxTotalOfferFeePercentage;
    }

    /**
     * @notice Sets the maximum royalty percentage that can be set by the seller.
     *
     * Emits a MaxRoyaltyPercentageChanged event if successful.
     *
     * Reverts if:
     * - The _maxRoyaltyPercentage is zero.
     * - The _maxRoyaltyPercentage is greater than 10000.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxRoyaltyPercentage - the maximum royalty percentage
     *
     * N.B. Represent percentage value as an unsigned int by multiplying the percentage by 100:
     * e.g, 1.75% = 175, 100% = 10000
     */
    function setMaxRoyaltyPercentage(uint16 _maxRoyaltyPercentage) public override onlyRole(ADMIN) nonReentrant {
        // Make sure percentage is greater than 0
        checkNonZeroValue(_maxRoyaltyPercentage);

        // Make sure percentage is less than 10000
        checkMaxPercententage(_maxRoyaltyPercentage);

        // Store fee percentage
        protocolLimits().maxRoyaltyPercentage = _maxRoyaltyPercentage;

        // Notify watchers of state change
        emit MaxRoyaltyPercentageChanged(_maxRoyaltyPercentage, msgSender());
    }

    /**
     * @notice Gets the maximum royalty percentage that can be set by the seller.
     *
     * @return the maximum royalty percentage
     */
    function getMaxRoyaltyPercentage() external view override returns (uint16) {
        return protocolLimits().maxRoyaltyPercentage;
    }

    /**
     * @notice Sets the buyer escalation fee percentage.
     *
     * Emits a BuyerEscalationFeePercentageChanged event if successful.
     *
     * Reverts if the _buyerEscalationDepositPercentage is greater than 10000.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _buyerEscalationDepositPercentage - the percentage of the DR fee that will be charged to buyer if they want to escalate the dispute
     *
     * N.B. Represent percentage value as an unsigned int by multiplying the percentage by 100:
     * e.g, 1.75% = 175, 100% = 10000
     */
    function setBuyerEscalationDepositPercentage(
        uint256 _buyerEscalationDepositPercentage
    ) public override onlyRole(ADMIN) nonReentrant {
        // Make sure percentage is less than 10000
        checkMaxPercententage(_buyerEscalationDepositPercentage);

        // Store fee percentage
        protocolFees().buyerEscalationDepositPercentage = _buyerEscalationDepositPercentage;

        // Notify watchers of state change
        emit BuyerEscalationFeePercentageChanged(_buyerEscalationDepositPercentage, msgSender());
    }

    /**
     * @notice Gets the buyer escalation fee percentage.
     *
     * @return the percentage of the DR fee that will be charged to buyer if they want to escalate the dispute
     */
    function getBuyerEscalationDepositPercentage() external view override returns (uint256) {
        return protocolFees().buyerEscalationDepositPercentage;
    }

    /**
     * @notice Sets the contract address for the given AuthTokenType.
     *
     * Emits an AuthTokenContractChanged event if successful.
     *
     * Reverts if:
     * - _authTokenType is None.
     * - _authTokenType is Custom.
     * - _authTokenContract is the zero address.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _authTokenType - the auth token type, as an Enum value
     * @param _authTokenContract the address of the auth token contract (e.g. Lens or ENS contract address)
     */
    function setAuthTokenContract(
        AuthTokenType _authTokenType,
        address _authTokenContract
    ) external override onlyRole(ADMIN) nonReentrant {
        if (_authTokenType == AuthTokenType.None || _authTokenType == AuthTokenType.Custom)
            revert InvalidAuthTokenType();
        checkNonZeroAddress(_authTokenContract);
        protocolLookups().authTokenContracts[_authTokenType] = _authTokenContract;
        emit AuthTokenContractChanged(_authTokenType, _authTokenContract, msgSender());
    }

    /**
     * @notice Gets the contract address for the given AuthTokenType.
     *
     * @param _authTokenType - the auth token type, as an Enum value
     * @return the address of the auth token contract (e.g. Lens or ENS contract address) for the given AuthTokenType
     */
    function getAuthTokenContract(AuthTokenType _authTokenType) external view returns (address) {
        return protocolLookups().authTokenContracts[_authTokenType];
    }

    /**
     * @notice Sets the minimum resolution period a seller can specify.
     *
     * Emits a MinResolutionPeriodChanged event.
     *
     * Reverts if _minResolutionPeriod is zero.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _minResolutionPeriod - the minimum resolution period that a {BosonTypes.Seller} can specify
     */
    function setMinResolutionPeriod(uint256 _minResolutionPeriod) public override onlyRole(ADMIN) nonReentrant {
        // Make sure _maxResolutionPeriod is greater than 0
        checkNonZeroValue(_minResolutionPeriod);

        // cache protocol limits
        ProtocolLib.ProtocolLimits storage limits = protocolLimits();

        // Make sure _minResolutionPeriod is less than _maxResolutionPeriod
        if (_minResolutionPeriod > limits.maxResolutionPeriod) revert InvalidResolutionPeriod();

        limits.minResolutionPeriod = _minResolutionPeriod;
        emit MinResolutionPeriodChanged(_minResolutionPeriod, msgSender());
    }

    /**
     * @notice Gets the minimum resolution period a seller can specify.
     *
     * @return the minimum resolution period that a {BosonTypes.Seller} can specify
     */
    function getMinResolutionPeriod() external view override returns (uint256) {
        return protocolLimits().minResolutionPeriod;
    }

    /**
     * @notice Sets the maximum resolution period a seller can specify.
     *
     * Emits a MaxResolutionPeriodChanged event if successful.
     *
     * Reverts if the _maxResolutionPeriod is zero.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxResolutionPeriod - the maximum resolution period that a {BosonTypes.Seller} can specify
     */
    function setMaxResolutionPeriod(uint256 _maxResolutionPeriod) public override onlyRole(ADMIN) nonReentrant {
        // Make sure _maxResolutionPeriod is greater than 0
        checkNonZeroValue(_maxResolutionPeriod);

        // cache protocol limits
        ProtocolLib.ProtocolLimits storage limits = protocolLimits();

        // Make sure _maxResolutionPeriod is greater than _minResolutionPeriod
        if (_maxResolutionPeriod < limits.minResolutionPeriod) revert InvalidResolutionPeriod();

        limits.maxResolutionPeriod = _maxResolutionPeriod;
        emit MaxResolutionPeriodChanged(_maxResolutionPeriod, msgSender());
    }

    /**
     * @notice Gets the maximum resolution period a seller can specify.
     *
     * @return the maximum resolution period that a {BosonTypes.Seller} can specify
     */
    function getMaxResolutionPeriod() external view override returns (uint256) {
        return protocolLimits().maxResolutionPeriod;
    }

    /**
     * @notice Sets the minimum dispute period a seller can specify.
     *
     * Emits a MinDisputePeriodChanged event if successful.
     *
     * Reverts if the _minDisputePeriod is zero.
     *
     * @param _minDisputePeriod - the minimum resolution period that a {BosonTypes.Seller} can specify
     */
    function setMinDisputePeriod(uint256 _minDisputePeriod) public override onlyRole(ADMIN) nonReentrant {
        // Make sure _minDisputePeriod is greater than 0
        checkNonZeroValue(_minDisputePeriod);

        protocolLimits().minDisputePeriod = _minDisputePeriod;
        emit MinDisputePeriodChanged(_minDisputePeriod, msgSender());
    }

    /**
     * @notice Gets the minimum dispute period a seller can specify.
     */
    function getMinDisputePeriod() external view override returns (uint256) {
        return protocolLimits().minDisputePeriod;
    }

    /**
     * @notice Sets the access controller address.
     *
     * Emits an AccessControllerAddressChanged event if successful.
     *
     * Reverts if _accessControllerAddress is the zero address
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _accessControllerAddress - access controller address
     */
    function setAccessControllerAddress(
        address _accessControllerAddress
    ) external override onlyRole(ADMIN) nonReentrant {
        checkNonZeroAddress(_accessControllerAddress);
        DiamondLib.diamondStorage().accessController = IAccessControl(_accessControllerAddress);
        emit AccessControllerAddressChanged(_accessControllerAddress, msgSender());
    }

    /**
     * @notice Gets the access controller address.
     *
     * @return the access controller address
     */
    function getAccessControllerAddress() external view returns (address) {
        return address(DiamondLib.diamondStorage().accessController);
    }

    /**
     * @notice Checks that supplied value is not 0.
     *
     * Reverts if the value is zero
     */
    function checkNonZeroValue(uint256 _value) internal pure {
        if (_value == 0) revert ValueZeroNotAllowed();
    }

    /**
     * @notice Checks that supplied value is not address 0.
     *
     * Reverts if the value is address zero
     */
    function checkNonZeroAddress(address _address) internal pure {
        if (_address == address(0)) revert InvalidAddress();
    }

    /**
     * @notice Checks that supplied value is less or equal to 10000 (100%).
     *
     * Reverts if the value more than 10000
     */
    function checkMaxPercententage(uint256 _percentage) internal pure {
        if (_percentage > HUNDRED_PERCENT) revert InvalidFeePercentage();
    }
}
