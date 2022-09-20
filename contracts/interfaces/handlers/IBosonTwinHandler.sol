// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.17;

import { BosonTypes } from "../../domain/BosonTypes.sol";
import { IBosonTwinEvents } from "../events/IBosonTwinEvents.sol";

/**
 * @title IBosonTwinHandler
 *
 * @notice Handles creation, removal, and querying of twins within the protocol.
 *
 * The ERC-165 identifier for this interface is: 0x60b30e70
 */
interface IBosonTwinHandler is IBosonTwinEvents {
    /**
     * @notice Creates a Twin.
     *
     * Emits a TwinCreated event if successful.
     *
     * Reverts if:
     * - The twins region of protocol is paused
     * - Seller does not exist
     * - Protocol is not approved to transfer the seller's token
     * - Twin supplyAvailable is zero
     * - Twin is NonFungibleToken and amount was set
     * - Twin is NonFungibleToken and end of range would overflow
     * - Twin is NonFungibleToken with unlimited supply and starting token id is too high
     * - Twin is NonFungibleToken and range is already being used in another twin of the seller
     * - Twin is FungibleToken or MultiToken and amount was not set
     * - Twin is FungibleToken or MultiToken and amount is greater than supply available
     *
     * @param _twin - the fully populated struct with twin id set to 0x0
     */
    function createTwin(BosonTypes.Twin memory _twin) external;

    /**
     * @notice Removes a twin.
     *
     * Emits a TwinDeleted event if successful.
     *
     * Reverts if:
     * - The twins region of protocol is paused
     * - Caller is not the seller.
     * - Twin does not exist.
     * - Bundle for twin exists
     *
     * @param _twinId - the id of the twin to check
     */
    function removeTwin(uint256 _twinId) external;

    /**
     * @notice Gets the details about a given twin.
     *
     * @param _twinId - the id of the twin to check
     * @return exists - the twin was found
     * @return twin - the twin details. See {BosonTypes.Twin}
     */
    function getTwin(uint256 _twinId) external view returns (bool exists, BosonTypes.Twin memory twin);

    /**
     * @notice Gets the next twin id.
     *
     * @dev Does not increment the counter.
     *
     * @return nextTwinId - the next twin id
     */
    function getNextTwinId() external view returns (uint256 nextTwinId);
}
