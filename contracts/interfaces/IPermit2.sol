// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/**
 * @dev Subset of Uniswap's Permit2 (`SignatureTransfer`) interface used by the
 * protocol's authorization queue.
 *
 * Permit2 is deployed at the canonical address
 * `0x000000000022D473030F116dDEE9F6B43aC78BA3` on every chain Boson supports.
 * The user grants a one-time on-chain `approve(PERMIT2, MaxUint256)` per token,
 * after which all subsequent pulls happen via signed `permitTransferFrom`
 * calls — the queue carries one such signature per slot.
 *
 * The `spender` baked into the signed digest is `msg.sender` of the
 * `permitTransferFrom` call (i.e. the protocol diamond), so the relayer cannot
 * substitute itself.
 */
interface IPermit2 {
    struct TokenPermissions {
        address token;
        uint256 amount;
    }

    struct PermitTransferFrom {
        TokenPermissions permitted;
        uint256 nonce;
        uint256 deadline;
    }

    struct SignatureTransferDetails {
        address to;
        uint256 requestedAmount;
    }

    function permitTransferFrom(
        PermitTransferFrom memory permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes calldata signature
    ) external;
}
