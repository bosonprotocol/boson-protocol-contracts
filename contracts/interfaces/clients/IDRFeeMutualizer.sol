// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;

/**
 * @title IDRFeeMutualizer
 *
 * @notice This is the interface for the Dispute Resolver fee mutualizers.
 *
 * ToDo: should this be split into two interfaces? Minimal interface for the protocol and full interface for the clients?
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
     * @notice Tells if mutualizer will cover the fee amount for a given seller and requrested by a given address.
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