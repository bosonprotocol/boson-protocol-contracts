// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { IDRFeeMutualizer } from "../../interfaces/IDRFeeMutualizer.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title DRFeeMutualizer
 * @notice Reference implementation of DR Fee Mutualizer with agreement management
 */
contract DRFeeMutualizer is IDRFeeMutualizer, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // Custom errors
    error OnlyProtocol();
    error InvalidExchangeId();
    error IncorrectNativeAmount();
    error NativeCurrencyNotAllowed();
    error InvalidAmount();
    error InvalidRecipient();
    error InsufficientPoolBalance();
    error InvalidSellerAddress();
    error MaxAmountPerTxMustBeGreaterThanZero();
    error MaxTotalMustBeGreaterThanOrEqualToMaxPerTx();
    error TimePeriodMustBeGreaterThanZero();
    error AgreementAlreadyExists();
    error InvalidAgreementId();
    error AgreementAlreadyVoided();
    error AgreementAlreadyActive();
    error AgreementIsVoided();
    error IncorrectPremiumAmount();
    error MustSendNativeCurrency();
    error DepositsRestrictedToOwner();
    error AccessDenied();

    struct Agreement {
        uint256 maxAmountPerTx; // Maximum mutualized amount per transaction
        uint256 maxAmountTotal; // Maximum total mutualized amount
        uint256 timePeriod; // Time period for the agreement (in seconds)
        uint256 premium; // Premium amount to be paid by seller
        bool refundOnCancel; // Whether premium is refunded on cancellation
        address tokenAddress; // Token address for the agreement (address(0) for native)
        uint256 startTime; // When the agreement becomes active (0 if not activated)
        uint256 totalMutualized; // Total amount mutualized so far
        bool isActive; // Whether the agreement is currently active
        bool isVoided; // Whether the agreement has been voided
    }

    // Events
    event FundsDeposited(address indexed depositor, address indexed tokenAddress, uint256 amount);

    event FundsWithdrawn(address indexed to, address indexed tokenAddress, uint256 amount);

    event DRFeeProvided(uint256 indexed exchangeId, address indexed seller, uint256 feeAmount);

    event AgreementCreated(uint256 indexed agreementId, address indexed seller, uint256 indexed disputeResolverId);

    event AgreementActivated(uint256 indexed agreementId, address indexed seller);

    event AgreementVoided(uint256 indexed agreementId, bool premiumRefunded);

    address public immutable bosonProtocol;

    // Storage
    mapping(address => uint256) public poolBalances; // tokenAddress => balance
    mapping(uint256 => uint256) public feeAmountByExchange; // exchangeId => feeAmount
    mapping(uint256 => address) public tokenAddressByExchange; // exchangeId => tokenAddress

    // Agreement management
    mapping(address => mapping(uint256 => uint256)) public sellerToDisputeResolverToAgreement; // seller => disputeResolverId => agreementId
    mapping(uint256 => Agreement) public agreements;
    mapping(uint256 => address) public agreementSeller; // agreementId => seller (reverse mapping)
    uint256 public nextAgreementId = 1;
    bool public depositRestrictedToOwner = false;

    constructor(address _bosonProtocol) {
        bosonProtocol = _bosonProtocol;
    }

    /**
     * @notice Modifier to restrict access to boson protocol only
     */
    modifier onlyProtocol() {
        if (msg.sender != bosonProtocol) revert OnlyProtocol();
        _;
    }

    // ============= IDRFeeMutualizer Implementation =============

    /**
     * @notice Checks if a seller is covered for a specific DR fee
     * @param seller The seller address
     * @param feeAmount The fee amount to cover
     * @param tokenAddress The token address (address(0) for native)
     * @param disputeResolverId The dispute resolver ID
     * @return bool True if the seller is covered, false otherwise
     */
    function isSellerCovered(
        address seller,
        uint256 feeAmount,
        address tokenAddress,
        uint256 disputeResolverId
    ) external view override returns (bool) {
        // Check if agreement exists and is valid
        uint256 agreementId = sellerToDisputeResolverToAgreement[seller][disputeResolverId];
        if (agreementId == 0) return false;

        Agreement storage agreement = agreements[agreementId];

        // Basic agreement validation
        if (!agreement.isActive || agreement.isVoided) return false;
        if (block.timestamp > agreement.startTime + agreement.timePeriod) return false;
        if (agreement.tokenAddress != tokenAddress) return false;
        if (feeAmount > agreement.maxAmountPerTx) return false;
        if (agreement.totalMutualized + feeAmount > agreement.maxAmountTotal) return false;

        // Check pool balance
        return poolBalances[tokenAddress] >= feeAmount;
    }

    /**
     * @notice Requests a DR fee for a seller
     * @param seller The seller address
     * @param feeAmount The fee amount to cover
     * @param tokenAddress The token address (address(0) for native currency)
     * @param exchangeId The exchange ID
     * @param disputeResolverId The dispute resolver ID
     * @return success True if the request was successful, false otherwise
     */
    function requestDRFee(
        address seller,
        uint256 feeAmount,
        address tokenAddress,
        uint256 exchangeId,
        uint256 disputeResolverId
    ) external override onlyProtocol nonReentrant returns (bool success) {
        // Check if seller is covered
        if (!this.isSellerCovered(seller, feeAmount, tokenAddress, disputeResolverId)) {
            return false;
        }

        uint256 agreementId = sellerToDisputeResolverToAgreement[seller][disputeResolverId];
        Agreement storage agreement = agreements[agreementId];

        // Update agreement and pool
        agreement.totalMutualized += feeAmount;
        poolBalances[tokenAddress] -= feeAmount;

        // Store tracking info
        feeAmountByExchange[exchangeId] = feeAmount;
        tokenAddressByExchange[exchangeId] = tokenAddress;

        emit DRFeeProvided(exchangeId, seller, feeAmount);
        return true;
    }

    /**
     * @notice Returns a DR fee to the mutualizer
     * @param exchangeId The exchange ID
     * @param feeAmount The amount being returned (0 = fee was used, >0 = fee returned)
     */
    function returnDRFee(uint256 exchangeId, uint256 feeAmount) external payable override onlyProtocol nonReentrant {
        address tokenAddress = tokenAddressByExchange[exchangeId];
        if (tokenAddress == address(0) && feeAmountByExchange[exchangeId] == 0) revert InvalidExchangeId();

        if (feeAmount > 0) {
            // Fee is being returned, add back to pool
            if (tokenAddress == address(0)) {
                if (msg.value != feeAmount) revert IncorrectNativeAmount();
                poolBalances[address(0)] += feeAmount;
            } else {
                if (msg.value != 0) revert NativeCurrencyNotAllowed();
                IERC20(tokenAddress).safeTransferFrom(msg.sender, address(this), feeAmount);
                poolBalances[tokenAddress] += feeAmount;
            }
        }

        // Clean up tracking
        delete feeAmountByExchange[exchangeId];
        delete tokenAddressByExchange[exchangeId];
    }

    // ============= Pool Management =============

    /**
     * @notice Deposits funds to the mutualizer pool
     * @param tokenAddress The token address (address(0) for native currency)
     * @param amount The amount to deposit (ignored for native currency, use msg.value)
     */
    function deposit(address tokenAddress, uint256 amount) external payable nonReentrant {
        if (depositRestrictedToOwner && msg.sender != owner()) revert DepositsRestrictedToOwner();

        if (tokenAddress == address(0)) {
            if (msg.value == 0) revert MustSendNativeCurrency();
            poolBalances[address(0)] += msg.value;
            emit FundsDeposited(msg.sender, address(0), msg.value);
        } else {
            if (msg.value != 0) revert NativeCurrencyNotAllowed();
            if (amount == 0) revert InvalidAmount();

            IERC20(tokenAddress).safeTransferFrom(msg.sender, address(this), amount);
            poolBalances[tokenAddress] += amount;
            emit FundsDeposited(msg.sender, tokenAddress, amount);
        }
    }

    /**
     * @notice Withdraws funds from the mutualizer pool
     * @param tokenAddress The token address (address(0) for native currency)
     * @param amount The amount to withdraw
     * @param to The address to withdraw to
     */
    function withdraw(address tokenAddress, uint256 amount, address payable to) external onlyOwner nonReentrant {
        if (amount == 0) revert InvalidAmount();
        if (to == address(0)) revert InvalidRecipient();
        if (poolBalances[tokenAddress] < amount) revert InsufficientPoolBalance();

        poolBalances[tokenAddress] -= amount;

        if (tokenAddress == address(0)) {
            to.transfer(amount);
        } else {
            IERC20(tokenAddress).safeTransfer(to, amount);
        }

        emit FundsWithdrawn(to, tokenAddress, amount);
    }

    /**
     * @notice Gets pool balance for a token
     * @param tokenAddress The token address (address(0) for native currency)
     * @return balance The pool balance
     */
    function getPoolBalance(address tokenAddress) external view returns (uint256 balance) {
        return poolBalances[tokenAddress];
    }

    // ============= Agreement Management =============

    /**
     * @notice Creates a new agreement between seller and dispute resolver
     * @param seller The seller address
     * @param disputeResolverId The dispute resolver ID
     * @param maxAmountPerTx The maximum mutualized amount per transaction
     * @param maxAmountTotal The maximum total mutualized amount
     * @param timePeriod The time period for the agreement (in seconds)
     * @param premium The premium amount to be paid by seller
     * @param refundOnCancel Whether premium is refunded on cancellation
     * @param tokenAddress The token address for the agreement (address(0) for native)
     * @return agreementId The ID of the created agreement
     */
    function newAgreement(
        address seller,
        uint256 disputeResolverId,
        uint256 maxAmountPerTx,
        uint256 maxAmountTotal,
        uint256 timePeriod,
        uint256 premium,
        bool refundOnCancel,
        address tokenAddress
    ) external onlyOwner returns (uint256 agreementId) {
        if (seller == address(0)) revert InvalidSellerAddress();
        if (maxAmountPerTx == 0) revert MaxAmountPerTxMustBeGreaterThanZero();
        if (maxAmountTotal < maxAmountPerTx) revert MaxTotalMustBeGreaterThanOrEqualToMaxPerTx();
        if (timePeriod == 0) revert TimePeriodMustBeGreaterThanZero();
        if (sellerToDisputeResolverToAgreement[seller][disputeResolverId] != 0) revert AgreementAlreadyExists();

        agreementId = nextAgreementId++;

        agreements[agreementId] = Agreement({
            maxAmountPerTx: maxAmountPerTx,
            maxAmountTotal: maxAmountTotal,
            timePeriod: timePeriod,
            premium: premium,
            refundOnCancel: refundOnCancel,
            tokenAddress: tokenAddress,
            startTime: 0,
            totalMutualized: 0,
            isActive: false,
            isVoided: false
        });

        sellerToDisputeResolverToAgreement[seller][disputeResolverId] = agreementId;
        agreementSeller[agreementId] = seller;

        emit AgreementCreated(agreementId, seller, disputeResolverId);
    }

    /**
     * @notice Voids an existing agreement
     * @param agreementId The ID of the agreement to void
     */
    function voidAgreement(uint256 agreementId) external {
        if (agreementId == 0 || agreementId >= nextAgreementId) revert InvalidAgreementId();

        Agreement storage agreement = agreements[agreementId];
        if (agreement.isVoided) revert AgreementAlreadyVoided();

        address seller = agreementSeller[agreementId];

        // Check authorization: either owner or the seller (if refundOnCancel is true)
        if (msg.sender != owner() && !(msg.sender == seller && agreement.refundOnCancel)) {
            revert AccessDenied();
        }

        agreement.isVoided = true;

        bool premiumRefunded = false;
        if (agreement.isActive && agreement.refundOnCancel) {
            // Simple refund logic - could be enhanced with usage-based calculation
            uint256 refundAmount = agreement.premium;
            if (refundAmount > 0) {
                poolBalances[agreement.tokenAddress] += refundAmount;
                premiumRefunded = true;
            }
        }

        emit AgreementVoided(agreementId, premiumRefunded);
    }

    /**
     * @notice Pays premium to activate an agreement
     * @param agreementId The ID of the agreement to activate
     */
    function payPremium(uint256 agreementId) external payable nonReentrant {
        if (agreementId == 0 || agreementId >= nextAgreementId) revert InvalidAgreementId();

        Agreement storage agreement = agreements[agreementId];
        if (agreement.isActive) revert AgreementAlreadyActive();
        if (agreement.isVoided) revert AgreementIsVoided();

        if (agreement.tokenAddress == address(0)) {
            if (msg.value != agreement.premium) revert IncorrectPremiumAmount();
            poolBalances[address(0)] += agreement.premium;
        } else {
            if (msg.value != 0) revert NativeCurrencyNotAllowed();
            IERC20(agreement.tokenAddress).safeTransferFrom(msg.sender, address(this), agreement.premium);
            poolBalances[agreement.tokenAddress] += agreement.premium;
        }

        agreement.isActive = true;
        agreement.startTime = block.timestamp;

        emit AgreementActivated(agreementId, msg.sender);
    }

    // ============= Admin Functions =============

    /**
     * @notice Sets whether deposits are restricted to owner only
     * @param restricted Whether deposits are restricted to owner only
     */
    function setDepositRestriction(bool restricted) external onlyOwner {
        depositRestrictedToOwner = restricted;
    }

    /**
     * @notice Gets agreement details
     * @param agreementId The ID of the agreement
     * @return agreement The details of the agreement
     */
    function getAgreement(uint256 agreementId) external view returns (Agreement memory) {
        if (agreementId == 0 || agreementId >= nextAgreementId) revert InvalidAgreementId();
        return agreements[agreementId];
    }

    /**
     * @notice Gets agreement ID for a seller and dispute resolver
     * @param seller The seller address
     * @param disputeResolverId The dispute resolver ID
     * @return agreementId The ID of the agreement
     */
    function getAgreementId(address seller, uint256 disputeResolverId) external view returns (uint256) {
        return sellerToDisputeResolverToAgreement[seller][disputeResolverId];
    }
}
