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
    function createSeller(BosonTypes.Seller calldata _seller)
    external;

    /**
     * @notice Gets the details about a seller.
     *
     * @param _sellerId - the id of the seller to check
     * @return exists - the seller was found
     * @return seller - the seller details. See {BosonTypes.Seller}
     */
    function getSeller(uint256 _sellerId)
    external
    view
    returns(bool exists, BosonTypes.Seller memory seller);

    /**
     * @notice Gets the next account Id that can be assigned to an account.
     *
     *  Does not increment the counter.
     * 
     * @return nextAccountId - the account Id
     */
    function getNextAccountId()
    external
    view 
    returns(uint256 nextAccountId);

}