// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {BosonTypes} from "../../domain/BosonTypes.sol";
import {IBosonAccountEvents} from "../events/IBosonAccountEvents.sol";

/**
 * @title IBosonAccountHandler
 *
 * @notice Handles creation, update, retrieval of accounts within the protocol.
 *
 * The ERC-165 identifier for this interface is: 0x18d9550a
 */
interface IBosonAccountHandler is IBosonAccountEvents {

    /**
     * @notice Creates a seller
     *
     * Emits a SellerCreated event if successful.
     *
     * Reverts if:
     * - Address values are zero address
     * - Active is not true
     * - Addresses are not unique to this seller
     *
     * @param _seller - the fully populated struct with seller id set to 0x0
     */
    function createSeller(BosonTypes.Seller memory _seller) external;

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
     * @notice Updates a seller
     *
     * Emits a SellerUpdated event if successful.
     *
     * Reverts if:
     * - Address values are zero address
     * - Addresses are not unique to this seller
     * - Caller is not the admin address of the seller
     * - Seller does not exist
     *
     * @param _seller - the fully populated seller struct
     */
    function updateSeller(BosonTypes.Seller memory _seller) external;

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
     * @notice Gets the details about a seller.
     *
     * @param _sellerId - the id of the seller to check
     * @return exists - the seller was found
     * @return seller - the seller details. See {BosonTypes.Seller}
     */
    function getSeller(uint256 _sellerId) external view returns (bool exists, BosonTypes.Seller memory seller);

    /**
     * @notice Gets the details about a seller by an address associated with that seller: operator, admin, or clerk address.
     *
     * @param _associatedAddress - the address associated with the seller. Must be an operator, admin, or clerk address.
     * @return exists - the seller was found
     * @return seller - the seller details. See {BosonTypes.Seller}
     */
    function getSellerByAddress(address _associatedAddress)
        external
        view
        returns (bool exists, BosonTypes.Seller memory seller);

    /**
     * @notice Gets the details about a buyer.
     *
     * @param _buyerId - the id of the buyer to check
     * @return exists - the buyer was found
     * @return buyer - the buyer details. See {BosonTypes.Buyer}
     */
    function getBuyer(uint256 _buyerId) external view returns (bool exists, BosonTypes.Buyer memory buyer);

    /**
     * @notice Gets the next account Id that can be assigned to an account.
     *
     *  Does not increment the counter.
     *
     * @return nextAccountId - the account Id
     */
    function getNextAccountId() external view returns (uint256 nextAccountId);
}
