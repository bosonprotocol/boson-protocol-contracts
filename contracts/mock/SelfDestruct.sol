// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

/**
 * @title SelfDestructor
 *
 * @notice Simple contract that can be used to destruct itself or other contracts via delegatecall.
 */
contract SelfDestructor {
    /**
     * @notice Method to delete the contract code. If called with delegatecall, calling contract will be destructed.
     */
    function destruct() external {
        selfdestruct(payable(msg.sender));
    }
}
