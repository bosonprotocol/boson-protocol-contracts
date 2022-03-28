// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title Test4FacetFallback
 *
 * @notice Mock contract having a fallback function for Unit Testing
 */
contract Test4FacetFallback {

    /**
     * Fallback function
     */
    fallback() external payable { revert("Error from fallback function"); }

}