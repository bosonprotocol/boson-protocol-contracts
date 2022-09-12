// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { DiamondLib } from "../DiamondLib.sol";
import { IERC165 } from "../../interfaces/IERC165.sol";

/**
 * @title ERC165Facet
 *
 * @notice Implements the ERC165 specification
 */
contract ERC165Facet is IERC165 {
    /**
     * @notice Implements ERC-165 interface detection standard.
     *
     * @param _interfaceId - the sighash of the given interface
     * @return true if interface represented by sighash is supported
     */
    function supportsInterface(bytes4 _interfaceId) public view returns (bool) {
        // Get the DiamontStorage struct
        return DiamondLib.supportsInterface(_interfaceId);
    }
}
