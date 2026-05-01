// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/**
 * @dev Subset of the EIP-3009 ("Transfer With Authorization") interface used by
 * the protocol. Only `receiveWithAuthorization` is exposed: the protocol pulls
 * funds into itself, so it must be the `to` recipient — `transferWithAuthorization`
 * is intentionally out of scope.
 */
interface IERC3009 {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}
