// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.18;
import "./IDRFeeMutualizer.sol";

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
