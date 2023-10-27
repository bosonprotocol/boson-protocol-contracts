// SPDX-License-Identifier: MIT
pragma solidity 0.8.21;

/**
 * @dev DAI specific aliases for ERC20 functions
 */
interface DAIAliases {
    function push(address usr, uint256 wad) external;

    function pull(address usr, uint256 wad) external;

    function move(address src, address dst, uint256 wad) external;
}
