// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.35;

import { TokenTransferAuthorizationLib } from "../protocol/libs/TokenTransferAuthorizationLib.sol";

/**
 * @title MockTokenTransferAuthorizationLibConsumer
 *
 * @notice Test-only thin wrapper around {TokenTransferAuthorizationLib}'s internal
 * functions so they can be exercised directly from a unit test without going through
 * the full metatx pipeline.
 *
 * Used to exercise edge cases that are otherwise unreachable from integration tests:
 *  - {probePopWhenExhausted}: load a 1-entry queue, drain it, and call {popNext}
 *    once more in the same transaction. Hits the `head >= len` early-return inside
 *    {popNext} that's triggered when a queue is over-popped.
 */
contract MockTokenTransferAuthorizationLibConsumer {
    /**
     * @notice Emitted by {probePopWhenExhausted} so the test can assert on results
     *         from a real transaction. We can't return values via STATICCALL because
     *         {TokenTransferAuthorizationLib.loadQueue} writes to transient storage
     *         (TSTORE), which EIP-1153 forbids in a static context.
     *
     * @param drained - the entries popped while the queue was non-empty (in order)
     * @param extraPopWasEmpty - true iff the (length+1)th {popNext} returned bytes("")
     */
    event Probed(bytes[] drained, bool extraPopWasEmpty);

    /**
     * @notice Loads `_packed` into transient storage, pops every entry once, then
     *         calls {popNext} one extra time and emits {Probed} reporting whether
     *         that final pop returned empty bytes (the exhausted-queue early return).
     *
     * @param _packed - abi.encode(bytes[] queue) payload
     */
    function probePopWhenExhausted(bytes calldata _packed) external {
        TokenTransferAuthorizationLib.loadQueue(_packed);

        // Drain the queue
        bytes[] memory all = abi.decode(_packed, (bytes[]));
        bytes[] memory drained = new bytes[](all.length);
        for (uint256 i = 0; i < all.length; ++i) {
            drained[i] = TokenTransferAuthorizationLib.popNext();
        }

        // One extra pop — this is the exhausted-queue path under test.
        bytes memory extra = TokenTransferAuthorizationLib.popNext();
        emit Probed(drained, extra.length == 0);
    }
}
