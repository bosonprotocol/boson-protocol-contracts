// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../domain/BosonConstants.sol";
import { TestFacetLib } from "./TestFacetLib.sol";
import "../diamond/ProtocolDiamond.sol";

/**
 * @title TestInitializableDiamond
 *
 * @notice Contract for testing initializeable diamond contract
 *
 */
contract TestInitializableDiamond is ProtocolDiamond {
    /**
     * @notice Constructor
     *
     * - Store the access controller
     * - Make the initial facet cuts
     * - Declare support for interfaces
     *
     * @param _accessController - the Boson Protocol AccessController
     * @param _facetCuts - the initial facet cuts to make
     * @param _interfaceIds - the initially supported ERC-165 interface ids
     */
    constructor(
        IAccessControlUpgradeable _accessController,
        IDiamondCut.FacetCut[] memory _facetCuts,
        bytes4[] memory _interfaceIds
    ) payable ProtocolDiamond(_accessController, _facetCuts, _interfaceIds) {}

    modifier onlyUnInitialized() {
        TestFacetLib.TestFacetStorage storage tfs = TestFacetLib.testFacetStorage();
        require(!tfs.initialized, ALREADY_INITIALIZED);
        tfs.initialized = true;
        _;
    }

    function initialize(address _testAddress) public onlyUnInitialized {
        TestFacetLib.TestFacetStorage storage tfs = TestFacetLib.testFacetStorage();
        tfs.testAddress = _testAddress;
    }

    function isInitialized() public view returns (bool) {
        TestFacetLib.TestFacetStorage storage tfs = TestFacetLib.testFacetStorage();
        return tfs.initialized;
    }
}
