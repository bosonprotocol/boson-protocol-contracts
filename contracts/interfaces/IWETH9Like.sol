// SPDX-License-Identifier: MIT
pragma solidity 0.8.21;

/**
 * @title IWETH9Like
 *
 * @notice Provides the minimum interface for native token wrapper
 */
interface IWETH9Like {
    function withdraw(uint256) external;

    function deposit() external payable;

    function transfer(address, uint256) external returns (bool);

    function transferFrom(address, address, uint256) external returns (bool);

    function approve(address, uint256) external returns (bool);
}
