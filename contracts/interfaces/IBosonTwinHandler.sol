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
    event TwinCreated(uint256 indexed twinId, uint256 indexed sellerId, BosonTypes.Twin twin);

    /**
     * @notice Creates an Twin
     *
     * Emits an TwinCreated event if successful.
     *
     * Reverts if:
     * - Not approved to transfer the seller's token
     *
     * @param _twin - the fully populated struct with twin id set to 0x0
     */
    function addTwin(BosonTypes.Twin calldata _twin)
    external;
}
