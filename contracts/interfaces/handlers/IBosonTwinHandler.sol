// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { BosonTypes } from "../../domain/BosonTypes.sol";
import { IBosonTwinEvents } from "../events/IBosonTwinEvents.sol";

/**
 * @title IBosonTwinHandler
 *
 * @notice Handles creation, removal, and querying of twins within the protocol.
 *
 * The ERC-165 identifier for this interface is: 0x44f98e5d
 */
interface IBosonTwinHandler is IBosonTwinEvents {
    /**
     * @notice Creates a Twin
     *
     * Emits a TwinCreated event if successful.
     *
     * Reverts if:
     * - seller does not exist
     * - Not approved to transfer the seller's token
     *
     * @param _twin - the fully populated struct with twin id set to 0x0
     */
    function createTwin(BosonTypes.Twin memory _twin) external;

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
     * Does not increment the counter.
     *
     * @return nextTwinId - the next twin id
     */
    function getNextTwinId() external view returns (uint256 nextTwinId);

    /**
     * @notice Removes the twin.
     *
     * Emits a TwinDeleted event if successful.
     *
     * Reverts if:
     * - caller is not the seller.
     * - Twin does not exist.
     * - Twin has bundles.
     *
     * @param _twinId - the id of the twin to check.
     */
    function removeTwin(uint256 _twinId) external;
}
