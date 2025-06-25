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
    error InvalidProtocolAddress();
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
        if (_bosonProtocol == address(0)) revert InvalidProtocolAddress();
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
     * @param _sellerId The seller ID
     * @param _feeAmount The fee amount to cover
     * @param _tokenAddress The token address (address(0) for native currency)
     * @param _disputeResolverId The dispute resolver ID (0 for universal agreement covering all dispute resolvers)
     * @return bool True if the seller is covered, false otherwise
     * @dev Checks for both specific dispute resolver agreements and universal agreements (disputeResolverId = 0)
     */
    function isSellerCovered(
        uint256 _sellerId,
        uint256 _feeAmount,
        address _tokenAddress,
        uint256 _disputeResolverId
    ) public view override returns (bool) {
        // Check if agreement exists and is valid
        uint256 agreementId = sellerToDisputeResolverToAgreement[_sellerId][_disputeResolverId];
        if (agreementId == 0 && _disputeResolverId != 0) {
            // If no specific agreement exists, check for "any dispute resolver" agreement
            agreementId = sellerToDisputeResolverToAgreement[_sellerId][0];
        }
        if (agreementId == 0) return false;

        Agreement storage agreement = agreements[agreementId];

        // Basic agreement validation
        if (agreement.startTime == 0 || agreement.isVoided) return false;
        if (block.timestamp > agreement.startTime + agreement.timePeriod) return false;
        if (agreement.tokenAddress != _tokenAddress) return false;
        if (_feeAmount > agreement.maxAmountPerTx) return false;
        if (agreement.totalMutualized + _feeAmount > agreement.maxAmountTotal) return false;

        // Check pool balance
        return poolBalances[_tokenAddress] >= _feeAmount;
    }

    /**
     * @notice Requests a DR fee for a seller
     * @param _sellerId The seller ID
     * @param _feeAmount The fee amount to cover
     * @param _tokenAddress The token address (address(0) for native currency)
     * @param _exchangeId The exchange ID
     * @param _disputeResolverId The dispute resolver ID (0 for universal agreement)
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
        uint256 _sellerId,
        uint256 _feeAmount,
        address _tokenAddress,
        uint256 _exchangeId,
        uint256 _disputeResolverId
    ) external override onlyProtocol nonReentrant returns (bool success) {
        if (_feeAmount == 0) revert InvalidAmount();
        if (!isSellerCovered(_sellerId, _feeAmount, _tokenAddress, _disputeResolverId)) {
            return false;
        }

        uint256 agreementId = sellerToDisputeResolverToAgreement[_sellerId][_disputeResolverId];
        if (agreementId == 0 && _disputeResolverId != 0) {
            // If no specific agreement exists, check for "any dispute resolver" agreement
            agreementId = sellerToDisputeResolverToAgreement[_sellerId][0];
        }
        Agreement storage agreement = agreements[agreementId];

        agreement.totalMutualized += _feeAmount;
        // isSellerCovered checks for pool balance, so we can safely subtract feeAmount from pool balance
        unchecked {
            poolBalances[_tokenAddress] -= _feeAmount;
        }

        feeInfoByExchange[_exchangeId] = FeeInfo({ token: _tokenAddress, amount: _feeAmount, sellerId: _sellerId });

        FundsLib.transferFundsOut(_tokenAddress, payable(BOSON_PROTOCOL), _feeAmount);

        emit DRFeeProvided(_exchangeId, _sellerId, _feeAmount);
        return true;
    }

    /**
     * @notice Returns a DR fee to the mutualizer
     * @param _exchangeId The exchange ID
     * @param _feeAmount The amount being returned (0 means protocol kept all fees)
     * @dev Only callable by the Boson protocol. For native currency, feeAmount must equal msg.value.
     *
     * Reverts if:
     * - Caller is not the Boson protocol
     * - exchangeId is not found
     * - msg.value != feeAmount for native currency
     * - msg.value > 0 for ERC20 tokens
     * - ERC20 or native currency transfer fails
     */
    function returnDRFee(uint256 _exchangeId, uint256 _feeAmount) external payable override onlyProtocol nonReentrant {
        FeeInfo storage feeInfo = feeInfoByExchange[_exchangeId];
        if (feeInfo.amount == 0) revert InvalidExchangeId();

        // Fee is being returned, add back to pool (if any)
        if (_feeAmount > 0) {
            FundsLib.validateIncomingPayment(feeInfo.token, _feeAmount);
            poolBalances[feeInfo.token] += _feeAmount;
        }

        delete feeInfoByExchange[_exchangeId];

        emit DRFeeReturned(_exchangeId, feeInfo.sellerId, feeInfo.amount, _feeAmount);
    }

    // ============= Pool Management =============

    /**
     * @notice Deposits funds to the mutualizer pool
     * @param _tokenAddress The token address (address(0) for native currency)
     * @param _amount The amount to deposit (for native currency msg.value == amount)
     * @dev For native currency deposits, the amount parameter should equal to msg.value
     *
     * Reverts if:
     * - Deposits are restricted and caller is not owner
     * - amount is 0
     * - amount is not equal to msg.value for native currency
     * - msg.value > 0 for ERC20 tokens
     * - ERC20 or native currency transfer fails
     */
    function deposit(address _tokenAddress, uint256 _amount) external payable nonReentrant {
        if (depositRestrictedToOwner && msg.sender != owner()) revert DepositsRestrictedToOwner();
        if (_amount == 0) revert InvalidAmount();

        FundsLib.validateIncomingPayment(_tokenAddress, _amount);
        poolBalances[_tokenAddress] += _amount;

        emit FundsDeposited(msg.sender, _tokenAddress, _amount);
    }

    /**
     * @notice Withdraws funds from the mutualizer pool
     * @param _tokenAddress The token address (address(0) for native currency)
     * @param _amount The amount to withdraw
     * @param _to The address to withdraw to
     * @dev Only callable by the contract owner
     *
     * Reverts if:
     * - Caller is not owner
     * - amount is 0
     * - to is zero address
     * - Pool balance is insufficient
     * - ERC20 or native currency transfer fails
     */
    function withdraw(address _tokenAddress, uint256 _amount, address payable _to) external onlyOwner nonReentrant {
        if (_amount == 0) revert InvalidAmount();
        if (_to == address(0)) revert InvalidRecipient();
        if (poolBalances[_tokenAddress] < _amount) revert InsufficientPoolBalance();

        unchecked {
            poolBalances[_tokenAddress] -= _amount;
        }

        FundsLib.transferFundsOut(_tokenAddress, _to, _amount);

        emit FundsWithdrawn(_to, _tokenAddress, _amount);
    }

    /**
     * @notice Gets pool balance for a token
     * @param _tokenAddress The token address (address(0) for native currency)
     * @return balance The pool balance
     */
    function getPoolBalance(address _tokenAddress) external view returns (uint256 balance) {
        return poolBalances[_tokenAddress];
    }

    // ============= Agreement Management =============

    /**
     * @notice Creates a new agreement between seller and dispute resolver
     * @param _sellerId The seller ID
     * @param _disputeResolverId The dispute resolver ID (0 for "any dispute resolver" i.e. universal agreement)
     * @param _maxAmountPerTx The maximum mutualized amount per transaction
     * @param _maxAmountTotal The maximum total mutualized amount
     * @param _timePeriod The time period for the agreement (in seconds)
     * @param _premium The premium amount to be paid by seller
     * @param _refundOnCancel Whether premium is refunded on cancellation
     * @param _tokenAddress The token address for the agreement (address(0) for native currency)
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
        uint256 _sellerId,
        uint256 _disputeResolverId,
        uint256 _maxAmountPerTx,
        uint256 _maxAmountTotal,
        uint256 _timePeriod,
        uint256 _premium,
        bool _refundOnCancel,
        address _tokenAddress
    ) external onlyOwner returns (uint256 agreementId) {
        if (_sellerId == 0) revert InvalidSellerId();
        if (_maxAmountPerTx == 0) revert MaxAmountPerTxMustBeGreaterThanZero();
        if (_maxAmountTotal < _maxAmountPerTx) revert MaxTotalMustBeGreaterThanOrEqualToMaxPerTx();
        if (_timePeriod == 0) revert TimePeriodMustBeGreaterThanZero();

        uint256 existingAgreementId = sellerToDisputeResolverToAgreement[_sellerId][_disputeResolverId];
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
                maxAmountPerTx: _maxAmountPerTx,
                maxAmountTotal: _maxAmountTotal,
                timePeriod: _timePeriod,
                premium: _premium,
                refundOnCancel: _refundOnCancel,
                tokenAddress: _tokenAddress,
                startTime: 0,
                totalMutualized: 0,
                isVoided: false,
                sellerId: _sellerId
            })
        );

        sellerToDisputeResolverToAgreement[_sellerId][_disputeResolverId] = agreementId;

        emit AgreementCreated(agreementId, _sellerId, _disputeResolverId);
    }

    /**
     * @notice Voids an existing agreement
     * @param _agreementId The ID of the agreement to void
     * @dev Can be called by the seller or owner (if refundOnCancel is true). Calculates time-based refunds.
     *
     * Reverts if:
     * - agreementId is invalid
     * - Agreement is already voided
     * - Caller is not authorized
     * - ERC20 or native currency transfer fails
     * - Seller not found
     */
    function voidAgreement(uint256 _agreementId) external {
        if (_agreementId == 0 || _agreementId >= agreements.length) revert InvalidAgreementId();
        bool premiumRefunded;
        Agreement storage agreement = agreements[_agreementId];
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
                        IBosonFundsHandler(BOSON_PROTOCOL).depositFunds{ value: refundAmount }(
                            agreement.sellerId,
                            tokenAddress,
                            refundAmount
                        );
                    }
                    premiumRefunded = true;
                }
            }
        }

        emit AgreementVoided(_agreementId, premiumRefunded);
    }

    /**
     * @notice Pays premium to activate an agreement
     * @param _agreementId The ID of the agreement to activate
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
    function payPremium(uint256 _agreementId) external payable nonReentrant {
        if (_agreementId == 0 || _agreementId >= agreements.length) revert InvalidAgreementId();

        Agreement storage agreement = agreements[_agreementId];
        if (agreement.startTime > 0) revert AgreementAlreadyActive();
        if (agreement.isVoided) revert AgreementIsVoided();

        FundsLib.validateIncomingPayment(agreement.tokenAddress, agreement.premium);
        poolBalances[agreement.tokenAddress] += agreement.premium;
        agreement.startTime = block.timestamp;

        emit AgreementActivated(_agreementId, agreement.sellerId);
    }

    // ============= Admin Functions =============

    /**
     * @notice Sets whether deposits are restricted to owner only
     * @param _restricted Whether deposits are restricted to owner only
     * @dev Only callable by the contract owner
     *
     * Reverts if:
     * - Caller is not owner
     */
    function setDepositRestriction(bool _restricted) external onlyOwner {
        depositRestrictedToOwner = _restricted;
    }

    /**
     * @notice Gets agreement details
     * @param _agreementId The ID of the agreement
     * @return agreement The details of the agreement
     * @dev Reverts if agreementId is invalid
     *
     * Reverts if:
     * - agreementId is 0 or >= agreements.length
     */
    function getAgreement(uint256 _agreementId) external view returns (Agreement memory) {
        if (_agreementId == 0 || _agreementId >= agreements.length) revert InvalidAgreementId();
        return agreements[_agreementId];
    }

    /**
     * @notice Gets agreement ID for a seller and dispute resolver
     * @param _sellerId The seller ID
     * @param _disputeResolverId The dispute resolver ID (0 for universal agreement)
     * @return agreementId The ID of the agreement (0 if not found)
     * @dev Checks for both specific dispute resolver agreements and universal agreements (disputeResolverId = 0)
     */
    function getAgreementId(uint256 _sellerId, uint256 _disputeResolverId) external view returns (uint256) {
        uint256 agreementId = sellerToDisputeResolverToAgreement[_sellerId][_disputeResolverId];
        if (agreementId == 0 && _disputeResolverId != 0) {
            // If no specific agreement exists, check for "any dispute resolver" agreement
            agreementId = sellerToDisputeResolverToAgreement[_sellerId][0];
        }
        return agreementId;
    }
}
