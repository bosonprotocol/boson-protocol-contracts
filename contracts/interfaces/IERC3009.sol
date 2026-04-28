// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

/**
 * @title IERC3009
 *
 * @notice Minimal subset of EIP-3009 (Transfer With Authorization) used by
 *         BosonERC3009Forwarder. Only `receiveWithAuthorization` is required:
 *         the EIP-3009 spec mandates `msg.sender == to` for that variant, which
 *         prevents an observer from replaying the signed authorization.
 *
 * The ERC-165 interface ID is the XOR of the function selectors.
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

    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);
}
