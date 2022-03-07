// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { TestFacetLib } from "./TestFacetLib.sol";

/**
 * @title Test2FacetUpgrade
 *
 * @notice Contract for testing Diamond operations
 *
 * This facet contains a single function intended to replace a function
 * originally supplied to the Diamond by TestFacet2.
 *
 * @author Cliff Hall <cliff@futurescale.com> (https://twitter.com/seaofarrows)
 */
contract Test2FacetUpgrade {

    function test2Func13() external pure returns (string memory) {return "json";}

}