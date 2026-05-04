// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/**
 * @dev Subset of the EIP-2612 ("Permit") interface used by the protocol's
 * authorization queue. Only `permit` is needed: the protocol calls it to set
 * allowance on the user's behalf, then follows up with a standard
 * `safeTransferFrom`.
 */
interface IERC2612 {
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}
