// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.18;

/**
 * @title IDRFeeMutualizer
 *
 * @notice This is the interface for the Dispute Resolver fee mutualizers.
 *
 * The ERC-165 identifier for this interface is: 0x41283543
 */
interface IDRFeeMutualizer {
    event DRFeeRequsted(
        address indexed sellerAddress,
        address _token,
        uint256 feeAmount,
        address feeRequester,
        bytes context
    );

    event DRFeeSent(address indexed feeRequester, address token, uint256 feeAmount, uint256 indexed uuid);
    event DRFeeReturned(uint256 indexed uuid, address indexed token, uint256 feeAmount, bytes context);

    /**
     * @notice Tells if mutualizer will cover the fee amount for a given seller and requested by a given address.
     *
     * It checks if agreement is valid, but not if the mutualizer has enough funds to cover the fee.
     *
     * @param _sellerAddress - the seller address
     * @param _token - the token address (use 0x0 for ETH)
     * @param _feeAmount - amount to cover
     * @param _feeRequester - address of the requester
     * @param _context - additional data, describing the context
     */
    function isSellerCovered(
        address _sellerAddress,
        address _token,
        uint256 _feeAmount,
        address _feeRequester,
        bytes calldata _context
    ) external view returns (bool);

    /**
     * @notice Request the mutualizer to cover the fee amount.
     *
     * @dev Verify that seller is covered and send the fee amount to the msg.sender.
     * Returned uuid can be used to track the status of the request.
     *
     * Reverts if:
     * - caller is not the protocol
     * - agreement does not exist
     * - agreement is not confirmed yet
     * - agreement is voided
     * - agreement has not started yet
     * - agreement expired
     * - fee amount exceeds max mutualized amount per transaction
     * - fee amount exceeds max total mutualized amount
     * - amount exceeds available balance
     * - token is native and transfer fails
     * - token is ERC20 and transferFrom fails
     *
     * @param _sellerAddress - the seller address
     * @param _token - the token address (use 0x0 for ETH)
     * @param _feeAmount - amount to cover
     * @param _context - additional data, describing the context
     * @return isCovered - true if the seller is covered
     * @return uuid - unique identifier of the request
     */
    function requestDRFee(
        address _sellerAddress,
        address _token,
        uint256 _feeAmount,
        bytes calldata _context
    ) external returns (bool isCovered, uint256 uuid);

    /**
     * @notice Return fee to the mutualizer.
     *
     * @dev Returned amount can be between 0 and _feeAmount that was requested for the given uuid.
     *
     * - caller is not the protocol
     * - uuid does not exist
     * - same uuid is used twice
     * - token is native and sent value is not equal to _feeAmount
     * - token is ERC20, but some native value is sent
     * - token is ERC20 and sent value is not equal to _feeAmount
     * - token is ERC20 and transferFrom fails
     *
     * @param _uuid - unique identifier of the request
     * @param _feeAmount - returned amount
     * @param _context - additional data, describing the context
     */
    function returnDRFee(uint256 _uuid, uint256 _feeAmount, bytes calldata _context) external payable;
}

/**
 * @title IDRFeeMutualizerClient
 *
 * @notice This is the interface for the Dispute Resolver fee mutualizers.
 *
 * The ERC-165 identifier for this interface is: 0x391b17cd
 */
interface IDRFeeMutualizerClient is IDRFeeMutualizer {
    struct Agreement {
        address sellerAddress;
        address token;
        uint256 maxMutualizedAmountPerTransaction;
        uint256 maxTotalMutualizedAmount;
        uint256 premium;
        uint128 startTimestamp;
        uint128 endTimestamp;
        bool refundOnCancel;
    }

    struct AgreementStatus {
        bool confirmed;
        bool voided;
        uint256 outstandingExchanges;
        uint256 totalMutualizedAmount;
    }

    event AgreementCreated(address indexed sellerAddress, uint256 indexed agreementId, Agreement agreement);
    event AgreementConfirmed(address indexed sellerAddress, uint256 indexed agreementId);
    event AgreementVoided(address indexed sellerAddress, uint256 indexed agreementId);
    event FundsDeposited(address indexed tokenAddress, uint256 amount, address indexed depositor);
    event FundsWithdrawn(address indexed tokenAddress, uint256 amount);

    /**
     * @notice Stores a new agreement between mutualizer and seller. Only contract owner can submit an agreement,
     * however it becomes valid only after seller confirms it by calling payPremium.
     *
     * Emits AgreementCreated event if successful.
     *
     * Reverts if:
     * - caller is not the contract owner
     * - max mutualized amount per transaction is greater than max total mutualized amount
     * - max mutualized amount per transaction is 0
     * - end timestamp is not greater than start timestamp
     * - end timestamp is not greater than current block timestamp
     *
     * @param _agreement - a fully populated agreement object
     */
    function newAgreement(Agreement calldata _agreement) external;

    /**
     * @notice Pay the premium for the agreement and confirm it.
     *
     * Emits AgreementConfirmed event if successful.
     *
     * Reverts if:
     * - agreement does not exist
     * - agreement is already confirmed
     * - agreement is voided
     * - agreement expired
     * - token is native and sent value is not equal to the agreement premium
     * - token is ERC20, but some native value is sent
     * - token is ERC20 and sent value is not equal to the agreement premium
     * - token is ERC20 and transferFrom fails
     *
     * @param _agreementId - a unique identifier of the agreement
     */
    function payPremium(uint256 _agreementId) external payable;

    /**
     * @notice Void the agreement.
     *
     * Emits AgreementVoided event if successful.
     *
     * Reverts if:
     * - agreement does not exist
     * - caller is not the contract owner or the seller
     * - agreement is voided already
     * - agreement expired
     *
     * @param _agreementId - a unique identifier of the agreement
     */
    function voidAgreement(uint256 _agreementId) external;

    /**
     * @notice Deposit funds to the mutualizer. Funds are used to cover the DR fees.
     *
     * Emits FundsDeposited event if successful.
     *
     * Reverts if:
     * - token is native and sent value is not equal to _amount
     * - token is ERC20, but some native value is sent
     * - token is ERC20 and sent value is not equal to _amount
     * - token is ERC20 and transferFrom fails
     *
     * @param _tokenAddress - the token address (use 0x0 for native token)
     * @param _amount - amount to transfer
     */
    function deposit(address _tokenAddress, uint256 _amount) external payable;

    /**
     * @notice Withdraw funds from the mutualizer.
     *
     * Emits FundsWithdrawn event if successful.
     *
     * Reverts if:
     * - caller is not the mutualizer owner
     * - amount exceeds available balance
     * - token is ERC20 and transferFrom fails
     *
     * @param _tokenAddress - the token address (use 0x0 for native token)
     * @param _amount - amount to transfer
     */
    function withdraw(address _tokenAddress, uint256 _amount) external;

    /**
     * @notice Returns agreement details and status for a given agreement id.
     *
     * Reverts if:
     * - agreement does not exist
     *
     * @param _agreementId - a unique identifier of the agreement
     * @return agreement - agreement details
     * @return status - agreement status
     */
    function getAgreement(
        uint256 _agreementId
    ) external view returns (Agreement memory agreement, AgreementStatus memory status);

    /**
     * @notice Returns agreement id, agreement details and status for given seller and token.
     *
     * Reverts if:
     * - agreement does not exist
     * - agreement is not confirmed yet
     *
     * @param _seller - the seller address
     * @param _token - the token address (use 0x0 for native token)
     * @return agreementId - a unique identifier of the agreement
     * @return agreement - agreement details
     * @return status - agreement status
     */
    function getConfirmedAgreementBySellerAndToken(
        address _seller,
        address _token
    ) external view returns (uint256 agreementId, Agreement memory agreement, AgreementStatus memory status);
}
