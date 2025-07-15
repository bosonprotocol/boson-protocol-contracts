// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { IERC165 } from "../IERC165.sol";

/**
 * @title IDRFeeMutualizer
 * @notice Interface for dispute resolver fee mutualization
 *
 * The ERC-165 identifier for this interface is: 0x1e0b3a78
 */
interface IDRFeeMutualizer is IERC165 {
    /**
     * @notice Checks if a seller is covered for a specific DR fee
     * @param _sellerId The seller ID
     * @param _feeAmount The fee amount to cover
     * @param _tokenAddress The token address (address(0) for native currency)
     * @param _disputeResolverId The dispute resolver ID (0 for universal agreement covering all dispute resolvers)
     * @return bool True if the seller is covered, false otherwise
     * @dev Checks for both specific dispute resolver agreements and universal agreements (disputeResolverId = 0).
     */
    function isSellerCovered(
        uint256 _sellerId,
        uint256 _feeAmount,
        address _tokenAddress,
        uint256 _disputeResolverId
    ) external view returns (bool);

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
     * Emits a {DRFeeProvided} event if successful.
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
    ) external returns (bool success);

    /**
     * @notice Returns a DR fee to the mutualizer
     * @param _exchangeId The exchange ID
     * @param _feeAmount The amount being returned (0 means protocol kept all fees)
     * @dev Only callable by the Boson protocol. For native currency, feeAmount must equal msg.value.
     *
     * Emits a {DRFeeReturned} event.
     *
     * Reverts if:
     * - Caller is not the Boson protocol
     * - exchangeId is not found
     * - msg.value != feeAmount for native currency
     * - msg.value > 0 for ERC20 tokens
     * - ERC20 or native currency transfer fails
     */
    function returnDRFee(uint256 _exchangeId, uint256 _feeAmount) external payable;
}
