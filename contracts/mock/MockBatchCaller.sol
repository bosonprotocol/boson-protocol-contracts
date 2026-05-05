// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.35;

/**
 * @title MockBatchCaller
 *
 * @notice Test helper that performs multiple sequential calls to a target
 * contract from inside a single external transaction. Used to exercise
 * transient-storage isolation between sibling protocol calls — concretely,
 * to prove that `executeMetaTransactionWithTokenTransferAuthorization`
 * clears its authorization queue at the end of its successful path so a
 * subsequent call in the same transaction can't pop leftover entries.
 *
 * Each entry in `_calldata` is forwarded as-is via low-level `call`. Reverts
 * are bubbled up so test assertions see the original revert reason.
 */
contract MockBatchCaller {
    function batch(address _target, bytes[] calldata _calldata) external payable {
        for (uint256 i = 0; i < _calldata.length; i++) {
            (bool ok, bytes memory ret) = _target.call(_calldata[i]);
            if (!ok) {
                assembly {
                    revert(add(ret, 32), mload(ret))
                }
            }
        }
    }
}
