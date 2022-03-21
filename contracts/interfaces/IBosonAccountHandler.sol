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