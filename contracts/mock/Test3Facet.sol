// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import "../domain/BosonConstants.sol";
import { BosonErrors } from "../domain/BosonErrors.sol";
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
contract Test3Facet is BosonErrors {
    modifier onlyUninitialized() {
        TestFacetLib.TestFacetStorage storage tfs = TestFacetLib.testFacetStorage();
        if (tfs.initialized) revert AlreadyInitialized();
        tfs.initialized = true;
        _;
    }

    function initialize(address _testAddress) public onlyUninitialized {
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
