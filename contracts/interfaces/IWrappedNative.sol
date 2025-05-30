// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

/**
 * @title IWrappedNative
 *
 * @notice Provides the minimum interface for native token wrapper
 */
interface IWrappedNative {
    function withdraw(uint256) external;

    function deposit() external payable;

    function transfer(address, uint256) external returns (bool);

    function transferFrom(address, address, uint256) external returns (bool);

    function approve(address, uint256) external returns (bool);
}
