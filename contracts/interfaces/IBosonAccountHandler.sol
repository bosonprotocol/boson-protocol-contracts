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
     *
     * @param _seller - the fully populated struct with seller id set to 0x0
     */
    function createSeller(BosonTypes.Seller calldata _seller)
    external;

    /**
     * @notice Gets the next account Id that can be assigned to an account.
     *
     * @return nextAccountId - the account Id
     */
    function getNextAccountId()
    external
    view 
    returns(uint256 nextAccountId);

}