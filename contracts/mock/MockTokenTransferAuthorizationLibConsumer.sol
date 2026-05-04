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
     * @notice Loads `_packed` into transient storage, pops every entry once, then
     *         calls {popNext} one extra time and reports whether that final pop
     *         returned empty bytes (the exhausted-queue early return).
     *
     * @param _packed - abi.encode(bytes[] queue) payload
     * @return drained - the popped entries, in queue order
     * @return extraPopWasEmpty - true iff the (length+1)th pop returned empty bytes
     */
    function probePopWhenExhausted(
        bytes calldata _packed
    ) external returns (bytes[] memory drained, bool extraPopWasEmpty) {
        TokenTransferAuthorizationLib.loadQueue(_packed);

        // Drain the queue
        bytes[] memory all = abi.decode(_packed, (bytes[]));
        drained = new bytes[](all.length);
        for (uint256 i = 0; i < all.length; ++i) {
            drained[i] = TokenTransferAuthorizationLib.popNext();
        }

        // One extra pop — this is the exhausted-queue path under test.
        bytes memory extra = TokenTransferAuthorizationLib.popNext();
        extraPopWasEmpty = extra.length == 0;
    }
}
