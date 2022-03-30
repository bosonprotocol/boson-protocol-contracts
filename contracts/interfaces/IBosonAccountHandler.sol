// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../domain/BosonTypes.sol";

/**
 * @title IBosonAccountHandler
 *
 * @notice Manages creation, update, retrieval of accounts within the protocol.
 *
 * The ERC-165 identifier for this interface is: 0xab00c0da
 */
interface IBosonAccountHandler {
    /// Events
    event SellerCreated(uint256 indexed sellerId, BosonTypes.Seller seller);
    event BuyerCreated(uint256 indexed buyerId, BosonTypes.Buyer buyer);

    /**
     * @notice Creates a seller
     *
     * Emits an SellerCreated event if successful.
     *
     * Reverts if:
     * - Address values are zero address
     * - Active is not true
     * - Addresses are not unique to this seller
     *
     * @param _seller - the fully populated struct with seller id set to 0x0
     */
    function createSeller(BosonTypes.Seller calldata _seller) external;

    /**
     * @notice Creates a Buyer
     *
     * Emits an BuyerCreated event if successful.
     *
     * Reverts if:
     * - Wallet address is zero address
     * - Active is not true
     * - Wallet address is not unique to this buyer
     *
     * @param _buyer - the fully populated struct with buyer id set to 0x0
     */
    function createBuyer(BosonTypes.Buyer calldata _buyer) external;

    /**
     * @notice Gets the details about a seller.
     *
     * @param _sellerId - the id of the seller to check
     * @return exists - the seller was found
     * @return seller - the seller details. See {BosonTypes.Seller}
     */
    function getSeller(uint256 _sellerId) external view returns (bool exists, BosonTypes.Seller memory seller);

    /**
     * @notice Gets the details about a buyer.
     *
     * @param _buyerId - the id of the buyer to check
     * @return exists - the buyer was found
     * @return buyer - the buyer details. See {BosonTypes.Buyer}
     */
    function getBuyer(uint256 _buyerId) external view returns (bool exists, BosonTypes.Buyer memory buyer);

    /**
     * @notice Fetches a given buyer from storage by id
     *
     * @param _wallet - the wallet address of the buyer
     * @return exists - whether the buyer Id exists
     * @return buyerId  - the buyer Id.
     */
    function getBuyerByWallet(address _wallet) external view returns (bool exists, uint256 buyerId);

    /**
     * @notice Gets the next account Id that can be assigned to an account.
     *
     *  Does not increment the counter.
     *
     * @return nextAccountId - the account Id
     */
    function getNextAccountId() external view returns (uint256 nextAccountId);
}
