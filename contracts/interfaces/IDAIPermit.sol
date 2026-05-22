// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/**
 * @dev Non-standard "DAI-style" permit used by the canonical Maker DAI on
 * Ethereum mainnet and Polygon PoS. Distinct from EIP-2612 in that the
 * approval is binary (`allowed=true` ⇒ `MAX_UINT256`, `false` ⇒ `0`) and the
 * nonce is supplied in calldata instead of stored on the message.
 */
interface IDAIPermit {
    function permit(
        address holder,
        address spender,
        uint256 nonce,
        uint256 expiry,
        bool allowed,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}
