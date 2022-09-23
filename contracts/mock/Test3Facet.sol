// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "../domain/BosonConstants.sol";
import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { TestFacetLib } from "./TestFacetLib.sol";

/**
 * @title Test3Facet
 *
 * @notice Contract for testing initializeable facets and diamond storage
 *
 * @author Nick Mudge <nick@perfectabstractions.com> (https://twitter.com/mudgen)
 * @author Cliff Hall <cliff@futurescale.com> (https://twitter.com/seaofarrows)
 */
contract Test3Facet {
    modifier onlyUnInitialized() {
        TestFacetLib.TestFacetStorage storage tfs = TestFacetLib.testFacetStorage();
        require(!tfs.initialized, ALREADY_INITIALIZED);
        tfs.initialized = true;
        _;
    }

    function initialize(address _testAddress) public onlyUnInitialized {
        // for testing revert with reason
        require(!AddressUpgradeable.isContract(_testAddress), "Address cannot be a contract");

        // For testing no reason reverts
        require(_testAddress != address(msg.sender));

        TestFacetLib.TestFacetStorage storage tfs = TestFacetLib.testFacetStorage();
        tfs.testAddress = _testAddress;
    }

    function isInitialized() public view returns (bool) {
        TestFacetLib.TestFacetStorage storage tfs = TestFacetLib.testFacetStorage();
        return tfs.initialized;
    }

    function getTestAddress() external view returns (address) {
        TestFacetLib.TestFacetStorage storage tfs = TestFacetLib.testFacetStorage();
        return tfs.testAddress;
    }
}
