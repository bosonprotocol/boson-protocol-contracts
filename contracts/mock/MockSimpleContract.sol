// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

contract MockSimpleContract {
    event TestEvent(uint256 indexed _value);

    function testEvent() external {
        emit TestEvent(1);
    }

    function testRevert() external pure {
        revert("Reverted");
    }
}
