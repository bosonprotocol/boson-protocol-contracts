// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import "../../domain/BosonConstants.sol";
import { IDiamondCut } from "../../interfaces/diamond/IDiamondCut.sol";
import { DiamondLib } from "../DiamondLib.sol";
import { JewelerLib } from "../JewelerLib.sol";
import { EIP712Lib } from "../../protocol/libs/EIP712Lib.sol";

/**
 * @title DiamondCutFacet
 *
 * @notice Provides diamond facet management functionality based on Nick Mudge's gas-optimized diamond-2 reference,
 * with modifications to support role-based access and management of
 * supported interfaces. Also added copious code comments throughout.
 *
 * Reference Implementation  : https://github.com/mudgen/diamond-2-hardhat
 * EIP-2535 Diamond Standard : https://eips.ethereum.org/EIPS/eip-2535
 *
 * @author Nick Mudge <nick@perfectabstractions.com> (https://twitter.com/mudgen)
 * @author Cliff Hall <cliff@futurescale.com> (https://twitter.com/seaofarrows)
 */
contract DiamondCutFacet is IDiamondCut {
    /**
     * @notice Cuts facets of the Diamond
     *
     * Adds/replaces/removes any number of function selectors
     *
     * If populated, _calldata is executed with delegatecall on _init
     *
     * Reverts if caller does not have UPGRADER role
     *
     * @param _facetCuts - contains the facet addresses and function selectors
     * @param _init - the address of the contract or facet to execute _calldata
     * @param _calldata - a function call, including function selector and arguments
     */
    function diamondCut(FacetCut[] calldata _facetCuts, address _init, bytes calldata _calldata) external override {
        // Get the diamond storage slot
        DiamondLib.DiamondStorage storage ds = DiamondLib.diamondStorage();

        // Ensure the caller has the UPGRADER role
        require(ds.accessController.hasRole(UPGRADER, msg.sender), "Caller must have UPGRADER role");

        // Make the cuts
        JewelerLib.diamondCut(_facetCuts, _init, _calldata);
    }
}
