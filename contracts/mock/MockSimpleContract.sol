// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

/**
 * @title Test2Facet
 *
 * @notice Contract for testing Diamond operations
 *
 * A bunch of functions to be added to the Diamond, with varying
 * string return values for testing invocation.
 *
 * @author Nick Mudge <nick@perfectabstractions.com> (https://twitter.com/mudgen)
 * @author Cliff Hall <cliff@futurescale.com> (https://twitter.com/seaofarrows)
 */
contract MockSimpleContract {
    event TestEvent(uint256 indexed _value);

    function testEvent() external {
        emit TestEvent(1);
    }
}
