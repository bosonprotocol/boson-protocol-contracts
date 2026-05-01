// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

/**
 * @title IERC3009
 *
 * @notice Minimal interface for tokens that implement ERC-3009 (Transfer With Authorization).
 *         Used by the Boson Protocol to pull funds from a payer without a prior `approve` step.
 *         The payer signs an EIP-712 typed authorization off chain; anyone can submit it on chain.
 *
 *         When the protocol calls `receiveWithAuthorization`, the token enforces:
 *         - `msg.sender == to` (so `to` must be set to the protocol diamond address)
 *         - the EIP-712 signature recovers to `from`
 *         - `block.timestamp` is in `[validAfter, validBefore]`
 *         - the `(authorizer, nonce)` pair has not been used or cancelled
 */
interface IERC3009 {
    /**
     * @notice Receive a transfer with a signed authorization from the payer.
     *
     * @param from - payer's address (authorizer)
     * @param to - recipient's address (must equal `msg.sender`)
     * @param value - amount to be transferred
     * @param validAfter - earliest unix timestamp at which the authorization is valid
     * @param validBefore - latest unix timestamp at which the authorization is valid
     * @param nonce - unique nonce used to prevent replay
     * @param v - signature v
     * @param r - signature r
     * @param s - signature s
     */
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

    /**
     * @notice Returns the state of an authorization.
     *
     * @param authorizer - the authorizer's address
     * @param nonce - the nonce of the authorization
     * @return true if the nonce has been used or cancelled
     */
    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);

    /**
     * @notice Cancel an authorization.
     *
     * @param authorizer - the authorizer's address
     * @param nonce - the nonce of the authorization
     * @param v - signature v
     * @param r - signature r
     * @param s - signature s
     */
    function cancelAuthorization(address authorizer, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external;
}
