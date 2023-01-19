// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

/**
 * @title TestFacetLib
 *
 * @dev A library to test diamond storage
 *
 * @author Cliff Hall <cliff@futurescale.com> (https://twitter.com/seaofarrows)
 */
library TestFacetLib {
    bytes32 internal constant TEST_FACET_STORAGE_POSITION = keccak256("diamond.test.facet.storage");

    struct TestFacetStorage {
        // a test address
        address testAddress;
        // facet initialization state
        bool initialized;
    }

    function testFacetStorage() internal pure returns (TestFacetStorage storage tfs) {
        bytes32 position = TEST_FACET_STORAGE_POSITION;
        assembly {
            tfs.slot := position
        }
    }
}
