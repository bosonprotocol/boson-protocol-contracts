// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title FallbackError
 *
 * @notice Mock contract having a fallback function for Unit Testing
 */
contract FallbackError {
    /**
     * @notice Fallback function
     */
    fallback() external payable {
        revert("Error from fallback function");
    }
}
