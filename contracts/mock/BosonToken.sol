// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

/**
 * @title BosonToken
 *
 * @notice Mock Boson Token contract for Unit Testing
 */
contract BosonToken {

    mapping(address => uint256) internal balances;

    /**
      * @notice Sets the balance for a mock holder address.
      *
      * @param _holder - the address of the holder
      * @param _balance - the balance for the holder
      */
    function setHolderBalance(address _holder, uint256 _balance)
    external
    {
        balances[_holder] = _balance;
    }

    /**
     * @notice The faux ERC-20 balanceOf implementation
     */
    function balanceOf(address _holder)
    external
    view
    returns (uint256) {
        return balances[_holder];
    }

    receive() external payable {}

}