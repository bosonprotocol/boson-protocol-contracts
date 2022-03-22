// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../domain/BosonTypes.sol";

/**
 * @title IBosonTwinHandler
 *
 * @notice Manages twinning associated with offers within the protocol.
 *
 * The ERC-165 identifier for this interface is: 0x00000000 // TODO: Recalc
 */
interface IBosonTwinHandler {

    /// Events
    event TwinCreated(uint256 indexed twinId, uint256 indexed sellerId);

    /**
     * @notice Creates a Twin
     *
     * Emits a TwinCreated event if successful.
     *
     * Reverts if:
     * - Not approved to transfer the seller's token
     *
     * @param _twin - the fully populated struct with twin id set to 0x0
     */
    function createTwin(BosonTypes.Twin memory _twin)
    external;

    /**
     * @notice Check if Protocol's treasuryAddress is approved to transfer seller’s tokens.
     *
     * @param _tokenAddress - the address of the seller's twin token contract.
     * @param _operator - the seller's operator address.
     * @param _spender - the treasuryAddress of protocol.
     * @return _isApproved - the approve status.
     */
    function isTokenTransferApproved(address _tokenAddress, address _operator, address _spender)
    external view returns(bool _isApproved);
}
