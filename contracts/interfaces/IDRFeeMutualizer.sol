// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

/**
 * @title IDRFeeMutualizer
 * @notice Interface for dispute resolver fee mutualization
 */
interface IDRFeeMutualizer {
    /**
     * @notice Checks if a seller is covered for a specific DR fee
     * @param seller The seller address
     * @param feeAmount The fee amount to cover
     * @param tokenAddress The token address (address(0) for native currency)
     * @param disputeResolverId The dispute resolver ID
     * @return bool True if the seller is covered, false otherwise
     */
    function isSellerCovered(
        address seller,
        uint256 feeAmount,
        address tokenAddress,
        uint256 disputeResolverId
    ) external view returns (bool);

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
    ) external returns (bool success);

    /**
     * @notice Returns a DR fee to the mutualizer
     * @param exchangeId The exchange ID
     * @param feeAmount The amount being returned (0 = fee was used, >0 = fee returned)
     */
    function returnDRFee(uint256 exchangeId, uint256 feeAmount) external payable;
}
