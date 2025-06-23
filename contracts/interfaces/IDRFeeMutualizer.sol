// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

/**
 * @title IDRFeeMutualizer
 * @notice Interface for dispute resolver fee mutualization
 * @dev This interface defines the core functionality for mutualizing dispute resolver fees
 */
interface IDRFeeMutualizer {
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
    ) external view returns (bool);

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
    ) external returns (bool success);

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
    function returnDRFee(uint256 exchangeId, uint256 feeAmount) external payable;
}
