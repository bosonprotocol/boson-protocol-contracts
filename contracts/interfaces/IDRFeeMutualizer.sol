// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

/**
 * @title IDRFeeMutualizer
 * @notice Interface for the DR Fee Mutualizer contract that handles dispute resolver fee coverage
 * @dev This contract is responsible for managing DR fee coverage, requests, and returns
 */
interface IDRFeeMutualizer {
    /**
     * @notice Context information for DR fee operations
     * @param offerId The ID of the offer associated with the fee
     * @param exchangeId The ID of the exchange associated with the fee
     * @param disputeResolverId The ID of the dispute resolver associated with the fee
     */
    struct DRFeeContext {
        uint256 offerId;
        uint256 exchangeId;
        uint256 disputeResolverId;
    }

    /**
     * @notice Request structure for DR fee operations
     * @param seller The address of the seller
     * @param feeAmount The amount of the fee
     * @param tokenAddress The address of the token used for the fee (address(0) for native currency)
     * @param context Additional context information for the fee request
     */
    struct DRFeeRequest {
        address seller;
        uint256 feeAmount;
        address tokenAddress;
        DRFeeContext context;
    }

    /**
     * @notice Checks if a seller is covered for a specific DR fee
     * @param request The DR fee request to check coverage for
     * @return bool True if the seller is covered, false otherwise
     */
    function isSellerCovered(DRFeeRequest calldata request) external view returns (bool);

    /**
     * @notice Requests a DR fee for a seller
     * @param request The DR fee request to process
     * @return bool True if the request was successful, false otherwise
     * @return bytes32 The UUID of the fee request
     */
    function requestDRFee(DRFeeRequest calldata request) external returns (bool, bytes32);

    /**
     * @notice Returns a DR fee to the mutualizer
     * @param uuid The unique identifier of the fee request to return
     * @param feeAmount The amount being returned (0 = fee was used, >0 = fee returned)
     * @dev This function is payable to handle native currency returns
     * @dev Zero feeAmount signals that DR fee was used (dispute escalated and resolved)
     * @dev Non-zero feeAmount signals that DR fee was returned (dispute not escalated or not resolved)
     */
    function returnDRFee(bytes32 uuid, uint256 feeAmount) external payable;
}
