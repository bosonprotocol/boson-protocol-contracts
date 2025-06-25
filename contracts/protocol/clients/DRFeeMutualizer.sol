// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { IDRFeeMutualizer } from "../../interfaces/IDRFeeMutualizer.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { FundsLib } from "../libs/FundsLib.sol";
import { IBosonFundsHandler } from "../../interfaces/handlers/IBosonFundsHandler.sol";
import { BosonTypes } from "../../domain/BosonTypes.sol";
import { IBosonAccountHandler } from "../../interfaces/handlers/IBosonAccountHandler.sol";

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
    error InvalidAmount();
    error InvalidRecipient();
    error InsufficientPoolBalance();
    error InvalidSellerId();
    error MaxAmountPerTxMustBeGreaterThanZero();
    error MaxTotalMustBeGreaterThanOrEqualToMaxPerTx();
    error TimePeriodMustBeGreaterThanZero();
    error AgreementAlreadyExists();
    error InvalidAgreementId();
    error AgreementAlreadyVoided();
    error AgreementAlreadyActive();
    error AgreementIsVoided();
    error DepositsRestrictedToOwner();
    error AccessDenied();
    error SellerNotFound();

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
        uint256 sellerId; // The seller ID for this agreement
    }

    struct FeeInfo {
        address token;
        uint256 amount;
        uint256 sellerId;
    }

    // Events
    event FundsDeposited(address indexed depositor, address indexed tokenAddress, uint256 amount);

    event FundsWithdrawn(address indexed to, address indexed tokenAddress, uint256 amount);

    event DRFeeProvided(uint256 indexed exchangeId, uint256 indexed sellerId, uint256 feeAmount);

    event DRFeeReturned(
        uint256 indexed exchangeId,
        uint256 indexed sellerId,
        uint256 originalFeeAmount,
        uint256 returnedAmount
    );

    event AgreementCreated(uint256 indexed agreementId, uint256 indexed sellerId, uint256 indexed disputeResolverId);

    event AgreementActivated(uint256 indexed agreementId, uint256 indexed sellerId);

    event AgreementVoided(uint256 indexed agreementId, bool premiumRefunded);

    address private immutable BOSON_PROTOCOL;

    // Storage
    mapping(address => uint256) public poolBalances; // tokenAddress => balance
    mapping(uint256 => FeeInfo) public feeInfoByExchange;

    // Agreement management
    mapping(uint256 => mapping(uint256 => uint256)) public sellerToDisputeResolverToAgreement; // sellerId => disputeResolverId => agreementId
    Agreement[] private agreements;
    bool public depositRestrictedToOwner;

    /**
     * @notice Constructor for DRFeeMutualizer
     * @param _bosonProtocol The address of the Boson protocol contract
     */
    constructor(address _bosonProtocol) {
        BOSON_PROTOCOL = _bosonProtocol;
        // Initialize with empty agreement at index 0 for 1-indexed access
        agreements.push(
            Agreement({
                maxAmountPerTx: 0,
                maxAmountTotal: 0,
                timePeriod: 0,
                premium: 0,
                refundOnCancel: false,
                tokenAddress: address(0),
                startTime: 0,
                totalMutualized: 0,
                isVoided: true,
                sellerId: 0
            })
        );
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
     * @param sellerId The seller ID
     * @param feeAmount The fee amount to cover
     * @param tokenAddress The token address (address(0) for native currency)
     * @param disputeResolverId The dispute resolver ID (0 for universal agreement covering all dispute resolvers)
     * @return bool True if the seller is covered, false otherwise
     * @dev Checks for both specific dispute resolver agreements and universal agreements (disputeResolverId = 0)
     */
    function isSellerCovered(
        uint256 sellerId,
        uint256 feeAmount,
        address tokenAddress,
        uint256 disputeResolverId
    ) public view override returns (bool) {
        // Check if agreement exists and is valid
        uint256 agreementId = sellerToDisputeResolverToAgreement[sellerId][disputeResolverId];
        if (agreementId == 0 && disputeResolverId != 0) {
            // If no specific agreement exists, check for "any dispute resolver" agreement
            agreementId = sellerToDisputeResolverToAgreement[sellerId][0];
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
     * @param sellerId The seller ID
     * @param feeAmount The fee amount to cover
     * @param tokenAddress The token address (address(0) for native currency)
     * @param exchangeId The exchange ID
     * @param disputeResolverId The dispute resolver ID (0 for universal agreement)
     * @return success True if the request was successful, false otherwise
     * @dev Only callable by the Boson protocol. Returns false if seller is not covered.
     *
     * Reverts if:
     * - Caller is not the Boson protocol
     * - feeAmount is 0
     * - Pool balance is insufficient
     * - ERC20 or native currency transfer fails
     */
    function requestDRFee(
        uint256 sellerId,
        uint256 feeAmount,
        address tokenAddress,
        uint256 exchangeId,
        uint256 disputeResolverId
    ) external override onlyProtocol nonReentrant returns (bool success) {
        if (feeAmount == 0) revert InvalidAmount();
        if (!isSellerCovered(sellerId, feeAmount, tokenAddress, disputeResolverId)) {
            return false;
        }

        uint256 agreementId = sellerToDisputeResolverToAgreement[sellerId][disputeResolverId];
        if (agreementId == 0 && disputeResolverId != 0) {
            // If no specific agreement exists, check for "any dispute resolver" agreement
            agreementId = sellerToDisputeResolverToAgreement[sellerId][0];
        }
        Agreement storage agreement = agreements[agreementId];

        agreement.totalMutualized += feeAmount;
        // isSellerCovered checks for pool balance, so we can safely subtract feeAmount from pool balance
        unchecked {
            poolBalances[tokenAddress] -= feeAmount;
        }

        feeInfoByExchange[exchangeId] = FeeInfo({ token: tokenAddress, amount: feeAmount, sellerId: sellerId });

        FundsLib.transferFundsOut(tokenAddress, payable(BOSON_PROTOCOL), feeAmount);

        emit DRFeeProvided(exchangeId, sellerId, feeAmount);
        return true;
    }

    /**
     * @notice Returns a DR fee to the mutualizer
     * @param exchangeId The exchange ID
     * @param feeAmount The amount being returned (0 means protocol kept all fees)
     * @dev Only callable by the Boson protocol. For native currency, feeAmount must equal msg.value.
     *
     * Reverts if:
     * - Caller is not the Boson protocol
     * - exchangeId is not found
     * - msg.value != feeAmount for native currency
     * - msg.value > 0 for ERC20 tokens
     * - ERC20 or native currency transfer fails
     */
    function returnDRFee(uint256 exchangeId, uint256 feeAmount) external payable override onlyProtocol nonReentrant {
        FeeInfo storage feeInfo = feeInfoByExchange[exchangeId];
        if (feeInfo.amount == 0) revert InvalidExchangeId();

        // Fee is being returned, add back to pool (if any)
        if (feeAmount > 0) {
            FundsLib.validateIncomingPayment(feeInfo.token, feeAmount);
            poolBalances[feeInfo.token] += feeAmount;
        }

        delete feeInfoByExchange[exchangeId];

        emit DRFeeReturned(exchangeId, feeInfo.sellerId, feeInfo.amount, feeAmount);
    }

    // ============= Pool Management =============

    /**
     * @notice Deposits funds to the mutualizer pool
     * @param tokenAddress The token address (address(0) for native currency)
     * @param amount The amount to deposit (for native currency msg.value == amount)
     * @dev For native currency deposits, the amount parameter should equal to msg.value
     *
     * Reverts if:
     * - Deposits are restricted and caller is not owner
     * - amount is 0
     * - amount is not equal to msg.value for native currency
     * - msg.value > 0 for ERC20 tokens
     * - ERC20 or native currency transfer fails
     */
    function deposit(address tokenAddress, uint256 amount) external payable nonReentrant {
        if (depositRestrictedToOwner && msg.sender != owner()) revert DepositsRestrictedToOwner();
        if (amount == 0) revert InvalidAmount();

        FundsLib.validateIncomingPayment(tokenAddress, amount);
        poolBalances[tokenAddress] += amount;

        emit FundsDeposited(msg.sender, tokenAddress, amount);
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
     * - ERC20 or native currency transfer fails
     */
    function withdraw(address tokenAddress, uint256 amount, address payable to) external onlyOwner nonReentrant {
        if (amount == 0) revert InvalidAmount();
        if (to == address(0)) revert InvalidRecipient();
        if (poolBalances[tokenAddress] < amount) revert InsufficientPoolBalance();

        unchecked {
            poolBalances[tokenAddress] -= amount;
        }

        FundsLib.transferFundsOut(tokenAddress, to, amount);

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
     * @param sellerId The seller ID
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
     * - sellerId is 0
     * - maxAmountPerTx is 0
     * - maxAmountTotal < maxAmountPerTx
     * - timePeriod is 0
     * - Active agreement exists for same dispute resolver
     */
    function newAgreement(
        uint256 sellerId,
        uint256 disputeResolverId,
        uint256 maxAmountPerTx,
        uint256 maxAmountTotal,
        uint256 timePeriod,
        uint256 premium,
        bool refundOnCancel,
        address tokenAddress
    ) external onlyOwner returns (uint256 agreementId) {
        if (sellerId == 0) revert InvalidSellerId();
        if (maxAmountPerTx == 0) revert MaxAmountPerTxMustBeGreaterThanZero();
        if (maxAmountTotal < maxAmountPerTx) revert MaxTotalMustBeGreaterThanOrEqualToMaxPerTx();
        if (timePeriod == 0) revert TimePeriodMustBeGreaterThanZero();

        uint256 existingAgreementId = sellerToDisputeResolverToAgreement[sellerId][disputeResolverId];
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

        agreementId = agreements.length;

        agreements.push(
            Agreement({
                maxAmountPerTx: maxAmountPerTx,
                maxAmountTotal: maxAmountTotal,
                timePeriod: timePeriod,
                premium: premium,
                refundOnCancel: refundOnCancel,
                tokenAddress: tokenAddress,
                startTime: 0,
                totalMutualized: 0,
                isVoided: false,
                sellerId: sellerId
            })
        );

        sellerToDisputeResolverToAgreement[sellerId][disputeResolverId] = agreementId;

        emit AgreementCreated(agreementId, sellerId, disputeResolverId);
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
     * - ERC20 or native currency transfer fails
     * - Seller not found
     */
    function voidAgreement(uint256 agreementId) external {
        if (agreementId == 0 || agreementId >= agreements.length) revert InvalidAgreementId();
        bool premiumRefunded;
        Agreement storage agreement = agreements[agreementId];
        if (agreement.isVoided) revert AgreementAlreadyVoided();

        (bool exists, BosonTypes.Seller memory seller, ) = IBosonAccountHandler(BOSON_PROTOCOL).getSeller(
            agreement.sellerId
        );
        if (!exists) revert SellerNotFound();

        // Check authorization: either owner (if refundOnCancel is true) or the seller admin
        if (msg.sender != seller.admin && !(msg.sender == owner() && agreement.refundOnCancel)) {
            revert AccessDenied();
        }

        agreement.isVoided = true;

        if (
            (agreement.startTime > 0 && agreement.refundOnCancel) &&
            (agreement.startTime + agreement.timePeriod > block.timestamp)
        ) {
            unchecked {
                uint256 remainingTime = agreement.startTime + agreement.timePeriod - block.timestamp;
                // Calculate refund as: premium * (remaining time / total time)
                // Example: If premium is 100, timePeriod is 12 months, and 3 months remain:
                // refund = 100 * 3 / 12 = 100 * 0.25 = 25
                uint256 refundAmount = (agreement.premium * remainingTime) / agreement.timePeriod;
                address tokenAddress = agreement.tokenAddress;

                if (refundAmount > 0) {
                    // Deposit seller's refund through BP funds handler
                    if (tokenAddress != address(0)) {
                        IERC20(tokenAddress).safeApprove(BOSON_PROTOCOL, refundAmount);
                        IBosonFundsHandler(BOSON_PROTOCOL).depositFunds(agreement.sellerId, tokenAddress, refundAmount);

                    } else {
                        IBosonFundsHandler(BOSON_PROTOCOL).depositFunds{value: refundAmount}(agreement.sellerId, tokenAddress, refundAmount);
                    }
                    premiumRefunded = true;
                }
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
     * - ERC20 or native currency transfer fails
     */
    function payPremium(uint256 agreementId) external payable nonReentrant {
        if (agreementId == 0 || agreementId >= agreements.length) revert InvalidAgreementId();

        Agreement storage agreement = agreements[agreementId];
        if (agreement.startTime > 0) revert AgreementAlreadyActive();
        if (agreement.isVoided) revert AgreementIsVoided();

        FundsLib.validateIncomingPayment(agreement.tokenAddress, agreement.premium);
        poolBalances[agreement.tokenAddress] += agreement.premium;
        agreement.startTime = block.timestamp;

        emit AgreementActivated(agreementId, agreement.sellerId);
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
     * - agreementId is 0 or >= agreements.length
     */
    function getAgreement(uint256 agreementId) external view returns (Agreement memory) {
        if (agreementId == 0 || agreementId >= agreements.length) revert InvalidAgreementId();
        return agreements[agreementId];
    }

    /**
     * @notice Gets agreement ID for a seller and dispute resolver
     * @param sellerId The seller ID
     * @param disputeResolverId The dispute resolver ID (0 for universal agreement)
     * @return agreementId The ID of the agreement (0 if not found)
     * @dev Checks for both specific dispute resolver agreements and universal agreements (disputeResolverId = 0)
     */
    function getAgreementId(uint256 sellerId, uint256 disputeResolverId) external view returns (uint256) {
        uint256 agreementId = sellerToDisputeResolverToAgreement[sellerId][disputeResolverId];
        if (agreementId == 0 && disputeResolverId != 0) {
            // If no specific agreement exists, check for "any dispute resolver" agreement
            agreementId = sellerToDisputeResolverToAgreement[sellerId][0];
        }
        return agreementId;
    }
}
