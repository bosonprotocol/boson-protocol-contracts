// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { DiamondLib } from "../DiamondLib.sol";
import { IERC165 } from "../../interfaces/IERC165.sol";

/**
 * @title ERC165Facet
 *
 */
contract ERC165Facet is IERC165 {
    /**
     * @notice Onboard implementation of ERC-165 interface detection standard.
     *
     * @param _interfaceId - the sighash of the given interface
     */
    function supportsInterface(bytes4 _interfaceId) public view returns (bool) {
        // Get the DiamontStorage struct
        return DiamondLib.supportsInterface(_interfaceId);
    }
}
