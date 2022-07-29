// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { BosonTypes } from "../../domain/BosonTypes.sol";
import { IBosonAccountEvents } from "../events/IBosonAccountEvents.sol";

/**
 * @title IBosonBuyerHandler
 *
 * @notice Handles creation, update, retrieval of buyers within the protocol.
 *
 * The ERC-165 identifier for this interface is: 0xa6cf31c1
 */
interface IBosonBuyerHandler is IBosonAccountEvents {
    /**
     * @notice Creates a Buyer
     *
     * Emits a BuyerCreated event if successful.
     *
     * Reverts if:
     * - Wallet address is zero address
     * - Active is not true
     * - Wallet address is not unique to this buyer
     *
     * @param _buyer - the fully populated struct with buyer id set to 0x0
     */
    function createBuyer(BosonTypes.Buyer memory _buyer) external;

    /**
     * @notice Updates a buyer. All fields should be filled, even those staying the same. The wallet address cannot be updated if the current wallet address has oustanding vouchers
     *
     * Emits a BuyerUpdated event if successful.
     *
     * Reverts if:
     * - Caller is not the wallet address associated with the buyer account
     * - Wallet address is zero address
     * - Address is not unique to this buyer
     * - Buyer does not exist
     * - Current wallet address has oustanding vouchers
     *
     * @param _buyer - the fully populated buyer struct
     */
    function updateBuyer(BosonTypes.Buyer memory _buyer) external;

    /**
     * @notice Gets the details about a buyer.
     *
     * @param _buyerId - the id of the buyer to check
     * @return exists - the buyer was found
     * @return buyer - the buyer details. See {BosonTypes.Buyer}
     */
    function getBuyer(uint256 _buyerId) external view returns (bool exists, BosonTypes.Buyer memory buyer);
}
