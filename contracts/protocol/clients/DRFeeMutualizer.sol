// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { IDRFeeMutualizer } from "../../interfaces/IDRFeeMutualizer.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { FundsLib } from "../libs/FundsLib.sol";

/**
 * @title DRFeeMutualizer
 * @notice Reference implementation of DR Fee Mutualizer with agreement management
 * @dev This contract provides dispute resolver fee mutualization with configurable agreements
 */
contract DRFeeMutualizer is IDRFeeMutualizer, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // Custom errors
    error OnlyProtocol();
    error InvalidExchangeId();
    error IncorrectNativeAmount();
    error NativeNotAllowed();
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
    error TokenTransferFailed();

    struct Agreement {
        uint256 maxAmountPerTx;
        uint256 maxAmountTotal;
        uint256 timePeriod;
        uint256 premium; // Premium amount to be paid by seller
        bool refundOnCancel; // Whether premium is refunded on cancellation
        address tokenAddress; // Token address for the agreement (address(0) for native currency)
        uint256 startTime; // When the agreement becomes active (0 if not activated)
        uint256 totalMutualized; // Total amount mutualized so far
        bool isVoided;
    }

    // Events
    event FundsDeposited(address indexed depositor, address indexed tokenAddress, uint256 amount);

    event FundsWithdrawn(address indexed to, address indexed tokenAddress, uint256 amount);

    event DRFeeProvided(uint256 indexed exchangeId, address indexed seller, uint256 feeAmount);

    event AgreementCreated(uint256 indexed agreementId, address indexed seller, uint256 indexed disputeResolverId);

    event AgreementActivated(uint256 indexed agreementId, address indexed seller);

    event AgreementVoided(uint256 indexed agreementId, bool premiumRefunded);

    address public immutable BOSON_PROTOCOL;

    // Storage
    mapping(address => uint256) public poolBalances; // tokenAddress => balance
    mapping(uint256 => uint256) public feeAmountByExchange;
    mapping(uint256 => address) public tokenAddressByExchange;

    // Agreement management
    mapping(address => mapping(uint256 => uint256)) public sellerToDisputeResolverToAgreement; // seller => disputeResolverId => agreementId
    mapping(uint256 => Agreement) public agreements;
    mapping(uint256 => address) public agreementSeller; // agreementId => seller (reverse mapping)
    uint256 public nextAgreementId = 1;
    bool public depositRestrictedToOwner;

    /**
     * @notice Constructor for DRFeeMutualizer
     * @param _bosonProtocol The address of the Boson protocol contract
     */
    constructor(address _bosonProtocol) {
        BOSON_PROTOCOL = _bosonProtocol;
    }

    /**
     * @notice Modifier to restrict access to Boson protocol only
     * @dev Reverts if caller is not the BOSON_PROTOCOL address
     */
    modifier onlyProtocol() {
        if (msg.sender != BOSON_PROTOCOL) revert OnlyProtocol();
        _;
    }

    /**
     * @notice Checks if a seller is covered for a specific DR fee
     * @param seller The seller address
     * @param feeAmount The fee amount to cover
     * @param tokenAddress The token address (address(0) for native currency)
     * @param disputeResolverId The dispute resolver ID (0 for universal agreement covering all dispute resolvers)
     * @return bool True if the seller is covered, false otherwise
     * @dev Checks for both specific dispute resolver agreements and universal agreements (disputeResolverId = 0)
     */
    function isSellerCovered(
        address seller,
        uint256 feeAmount,
        address tokenAddress,
        uint256 disputeResolverId
    ) public view override returns (bool) {
        // Check if agreement exists and is valid
        uint256 agreementId = sellerToDisputeResolverToAgreement[seller][disputeResolverId];
        if (agreementId == 0 && disputeResolverId != 0) {
            // If no specific agreement exists, check for "any dispute resolver" agreement
            agreementId = sellerToDisputeResolverToAgreement[seller][0];
        }
        if (agreementId == 0) return false;

        Agreement storage agreement = agreements[agreementId];

        // Basic agreement validation
        if (agreement.startTime == 0 || agreement.isVoided) return false;
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
     * @param disputeResolverId The dispute resolver ID (0 for universal agreement)
     * @return success True if the request was successful, false otherwise
     * @dev Only callable by the Boson protocol. Returns false if seller is not covered.
     *
     * Reverts if:
     * - Caller is not the Boson protocol
     * - Native currency transfer fails
     */
    function requestDRFee(
        address seller,
        uint256 feeAmount,
        address tokenAddress,
        uint256 exchangeId,
        uint256 disputeResolverId
    ) external override onlyProtocol nonReentrant returns (bool success) {
        // Check if seller is covered - if not covered, return false
        if (!isSellerCovered(seller, feeAmount, tokenAddress, disputeResolverId)) {
            return false;
        }

        uint256 agreementId = sellerToDisputeResolverToAgreement[seller][disputeResolverId];
        if (agreementId == 0 && disputeResolverId != 0) {
            // If no specific agreement exists, check for "any dispute resolver" agreement
            agreementId = sellerToDisputeResolverToAgreement[seller][0];
        }
        Agreement storage agreement = agreements[agreementId];

        agreement.totalMutualized += feeAmount;
        poolBalances[tokenAddress] -= feeAmount;

        feeAmountByExchange[exchangeId] = feeAmount;
        tokenAddressByExchange[exchangeId] = tokenAddress;

        // Transfer funds to protocol
        if (tokenAddress == address(0)) {
            (bool transferSuccess, ) = payable(BOSON_PROTOCOL).call{ value: feeAmount }("");
            if (!transferSuccess) revert TokenTransferFailed();
        } else {
            IERC20(tokenAddress).safeTransfer(BOSON_PROTOCOL, feeAmount);
        }

        emit DRFeeProvided(exchangeId, seller, feeAmount);
        return true;
    }

    /**
     * @notice Returns a DR fee to the mutualizer
     * @param exchangeId The exchange ID
     * @param feeAmount The amount being returned (must be > 0)
     * @dev Only callable by the Boson protocol. For native currency, feeAmount must equal msg.value.
     *
     * Reverts if:
     * - Caller is not the Boson protocol
     * - feeAmount is 0
     * - exchangeId is not found
     * - msg.value != feeAmount for native currency
     * - msg.value > 0 for ERC20 tokens
     */
    function returnDRFee(uint256 exchangeId, uint256 feeAmount) external payable override onlyProtocol nonReentrant {
        if (feeAmount == 0) revert InvalidAmount();

        address tokenAddress = tokenAddressByExchange[exchangeId];
        if (feeAmountByExchange[exchangeId] == 0) revert InvalidExchangeId();

        // Fee is being returned, add back to pool
        if (tokenAddress == address(0)) {
            if (msg.value != feeAmount) revert IncorrectNativeAmount();
            poolBalances[address(0)] += feeAmount;
        } else {
            if (msg.value != 0) revert NativeNotAllowed();
            IERC20(tokenAddress).safeTransferFrom(msg.sender, address(this), feeAmount);
            poolBalances[tokenAddress] += feeAmount;
        }

        delete feeAmountByExchange[exchangeId];
        delete tokenAddressByExchange[exchangeId];
    }

    // ============= Pool Management =============

    /**
     * @notice Deposits funds to the mutualizer pool
     * @param tokenAddress The token address (address(0) for native currency)
     * @param amount The amount to deposit (ignored for native currency, use msg.value)
     * @dev For native currency deposits, the amount parameter is ignored and msg.value is used
     *
     * Reverts if:
     * - Deposits are restricted and caller is not owner
     * - tokenAddress is native but msg.value is 0
     * - tokenAddress is ERC20 but msg.value > 0
     * - tokenAddress is ERC20 and amount is 0
     */
    function deposit(address tokenAddress, uint256 amount) external payable nonReentrant {
        if (depositRestrictedToOwner && msg.sender != owner()) revert DepositsRestrictedToOwner();

        if (tokenAddress == address(0)) {
            if (msg.value == 0) revert MustSendNativeCurrency();
            poolBalances[address(0)] += msg.value;
            emit FundsDeposited(msg.sender, address(0), msg.value);
        } else {
            if (msg.value != 0) revert NativeNotAllowed();
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
     * @dev Only callable by the contract owner
     *
     * Reverts if:
     * - Caller is not owner
     * - amount is 0
     * - to is zero address
     * - Pool balance is insufficient
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
     * @param disputeResolverId The dispute resolver ID (0 for "any dispute resolver" i.e. universal agreement)
     * @param maxAmountPerTx The maximum mutualized amount per transaction
     * @param maxAmountTotal The maximum total mutualized amount
     * @param timePeriod The time period for the agreement (in seconds)
     * @param premium The premium amount to be paid by seller
     * @param refundOnCancel Whether premium is refunded on cancellation
     * @param tokenAddress The token address for the agreement (address(0) for native currency)
     * @return agreementId The ID of the created agreement
     * @dev Only callable by the contract owner. Prevents duplicate active agreements for the same dispute resolver.
     *
     * Reverts if:
     * - Caller is not owner
     * - seller is zero address
     * - maxAmountPerTx is 0
     * - maxAmountTotal < maxAmountPerTx
     * - timePeriod is 0
     * - Active agreement exists for same dispute resolver
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

        uint256 existingAgreementId = sellerToDisputeResolverToAgreement[seller][disputeResolverId];
        if (existingAgreementId != 0) {
            Agreement storage existingAgreement = agreements[existingAgreementId];
            if (
                existingAgreement.startTime > 0 &&
                !existingAgreement.isVoided &&
                block.timestamp <= existingAgreement.startTime + existingAgreement.timePeriod
            ) {
                revert AgreementAlreadyExists();
            }
        }

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
            isVoided: false
        });

        sellerToDisputeResolverToAgreement[seller][disputeResolverId] = agreementId;
        agreementSeller[agreementId] = seller;

        emit AgreementCreated(agreementId, seller, disputeResolverId);
    }

    /**
     * @notice Voids an existing agreement
     * @param agreementId The ID of the agreement to void
     * @dev Can be called by the seller or owner (if refundOnCancel is true). Calculates time-based refunds.
     *
     * Reverts if:
     * - agreementId is invalid
     * - Agreement is already voided
     * - Caller is not authorized
     * - Refund transfer fails
     */
    function voidAgreement(uint256 agreementId) external {
        if (agreementId == 0 || agreementId >= nextAgreementId) revert InvalidAgreementId();

        Agreement storage agreement = agreements[agreementId];
        if (agreement.isVoided) revert AgreementAlreadyVoided();

        address seller = agreementSeller[agreementId];

        // Check authorization: either owner (if refundOnCancel is true) or the seller
        if (msg.sender != owner() && msg.sender != seller) {
            revert AccessDenied();
        }
        if (msg.sender == owner() && !agreement.refundOnCancel) {
            revert AccessDenied();
        }

        agreement.isVoided = true;

        bool premiumRefunded = false;
        if (agreement.startTime > 0 && agreement.refundOnCancel) {
            uint256 elapsedTime = block.timestamp - agreement.startTime;
            // Calculate refund as: premium * (remaining time / total time)
            // Example: If premium is 100, timePeriod is 12 months, and 9 months have passed:
            // refund = 100 * (12 - 9) / 12 = 100 * 3/12 = 25
            uint256 refundAmount = (agreement.premium * (agreement.timePeriod - elapsedTime)) / agreement.timePeriod;

            if (refundAmount > 0) {
                // Transfer refund to seller
                if (agreement.tokenAddress == address(0)) {
                    (bool success, ) = payable(seller).call{ value: refundAmount }("");
                    if (!success) revert TokenTransferFailed();
                } else {
                    IERC20(agreement.tokenAddress).safeTransfer(seller, refundAmount);
                }
                premiumRefunded = true;
            }
        }

        emit AgreementVoided(agreementId, premiumRefunded);
    }

    /**
     * @notice Pays premium to activate an agreement
     * @param agreementId The ID of the agreement to activate
     * @dev For native currency agreements, send the premium as msg.value. For ERC20, approve the token first.
     *
     * Reverts if:
     * - agreementId is invalid
     * - Agreement is already active
     * - Agreement is voided
     * - msg.value != premium for native currency
     * - msg.value > 0 for ERC20 tokens
     */
    function payPremium(uint256 agreementId) external payable nonReentrant {
        if (agreementId == 0 || agreementId >= nextAgreementId) revert InvalidAgreementId();

        Agreement storage agreement = agreements[agreementId];
        if (agreement.startTime > 0) revert AgreementAlreadyActive();
        if (agreement.isVoided) revert AgreementIsVoided();

        if (agreement.tokenAddress == address(0)) {
            if (msg.value != agreement.premium) revert IncorrectPremiumAmount();
            poolBalances[address(0)] += agreement.premium;
        } else {
            FundsLib.validateIncomingPayment(agreement.tokenAddress, agreement.premium);
            poolBalances[agreement.tokenAddress] += agreement.premium;
        }

        agreement.startTime = block.timestamp;

        emit AgreementActivated(agreementId, msg.sender);
    }

    // ============= Admin Functions =============

    /**
     * @notice Sets whether deposits are restricted to owner only
     * @param restricted Whether deposits are restricted to owner only
     * @dev Only callable by the contract owner
     *
     * Reverts if:
     * - Caller is not owner
     */
    function setDepositRestriction(bool restricted) external onlyOwner {
        depositRestrictedToOwner = restricted;
    }

    /**
     * @notice Gets agreement details
     * @param agreementId The ID of the agreement
     * @return agreement The details of the agreement
     * @dev Reverts if agreementId is invalid
     *
     * Reverts if:
     * - agreementId is 0 or >= nextAgreementId
     */
    function getAgreement(uint256 agreementId) external view returns (Agreement memory) {
        if (agreementId == 0 || agreementId >= nextAgreementId) revert InvalidAgreementId();
        return agreements[agreementId];
    }

    /**
     * @notice Gets agreement ID for a seller and dispute resolver
     * @param seller The seller address
     * @param disputeResolverId The dispute resolver ID (0 for universal agreement)
     * @return agreementId The ID of the agreement (0 if not found)
     * @dev Checks for both specific dispute resolver agreements and universal agreements (disputeResolverId = 0)
     */
    function getAgreementId(address seller, uint256 disputeResolverId) external view returns (uint256) {
        uint256 agreementId = sellerToDisputeResolverToAgreement[seller][disputeResolverId];
        if (agreementId == 0 && disputeResolverId != 0) {
            // If no specific agreement exists, check for "any dispute resolver" agreement
            agreementId = sellerToDisputeResolverToAgreement[seller][0];
        }
        return agreementId;
    }
}
