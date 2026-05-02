// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.34;

import { IERC3009 } from "../../interfaces/IERC3009.sol";

/**
 * @title TransientAuthLib
 *
 * @notice Parks a queue of authorization payloads (e.g. ERC-3009 signed
 * authorizations) in transient storage for the duration of a single transaction.
 *
 * The metatransaction entry point loads the queue once via `loadQueue`. Each
 * subsequent `transferFundsIn` call consumes the next entry via
 * `consumeForTransfer`, which pops the next entry and (if non-empty) calls
 * `receiveWithAuthorization` on the supplied token. An empty entry signals
 * "no authorization for this transfer — fall back to the default ERC-20
 * allowance path". An exhausted queue returns false.
 *
 * All slots are written via `TSTORE` and cleared automatically by the EVM at
 * the end of the transaction.
 */
library TransientAuthLib {
    bytes32 internal constant HEAD_SLOT = keccak256("boson.protocol.transient.auth.head");
    bytes32 internal constant LEN_SLOT = keccak256("boson.protocol.transient.auth.len");
    bytes32 internal constant ENTRY_NAMESPACE = keccak256("boson.protocol.transient.auth.entry");

    /**
     * @notice Decode an `abi.encode(bytes[])` payload and store each entry in
     *         transient storage in order.
     *
     * @param _packed - abi.encode(bytes[] queue) payload
     */
    function loadQueue(bytes calldata _packed) internal {
        bytes[] memory queue = abi.decode(_packed, (bytes[]));

        uint256 length = queue.length;
        bytes32 lenSlot = LEN_SLOT;
        bytes32 headSlot = HEAD_SLOT;
        assembly {
            tstore(lenSlot, length)
            tstore(headSlot, 0)
        }

        for (uint256 i = 0; i < length; ++i) {
            _storeEntry(i, queue[i]);
        }
    }

    /**
     * @notice Pop the next queue entry. Returns empty bytes if the queue is
     *         empty, exhausted, or the popped entry is the fallback marker.
     */
    function popNext() internal returns (bytes memory entry) {
        bytes32 headSlot = HEAD_SLOT;
        bytes32 lenSlot = LEN_SLOT;
        uint256 head;
        uint256 len;
        assembly {
            head := tload(headSlot)
            len := tload(lenSlot)
        }
        if (head >= len) return bytes("");

        bytes32 base = _entryBase(head);
        uint256 entryLen;
        assembly {
            entryLen := tload(base)
            tstore(headSlot, add(head, 1))
        }

        if (entryLen == 0) return bytes("");

        entry = new bytes(entryLen);
        uint256 numWords = (entryLen + 31) / 32;
        for (uint256 w = 0; w < numWords; ++w) {
            bytes32 slot = bytes32(uint256(base) + 1 + w);
            bytes32 word;
            assembly {
                word := tload(slot)
                mstore(add(entry, mul(32, add(w, 1))), word)
            }
        }
    }

    /**
     * @notice Returns true if a queue has been loaded for this transaction.
     */
    function hasQueue() internal view returns (bool present) {
        bytes32 lenSlot = LEN_SLOT;
        uint256 len;
        assembly {
            len := tload(lenSlot)
        }
        present = len > 0;
    }

    /**
     * @notice Advance the queue head by one without doing any work — used at
     *         skip sites where a `transferFundsIn` is bypassed (zero amount,
     *         pre-deposited funds, etc.) so the off-chain caller can supply a
     *         queue with the same number of slots regardless of which
     *         transfers actually fire. No-op when no queue is loaded or it is
     *         already exhausted.
     */
    function discardNext() internal {
        bytes32 headSlot = HEAD_SLOT;
        bytes32 lenSlot = LEN_SLOT;
        uint256 head;
        uint256 len;
        assembly {
            head := tload(headSlot)
            len := tload(lenSlot)
        }
        if (head < len) {
            assembly {
                tstore(headSlot, add(head, 1))
            }
        }
    }

    /**
     * @notice If a queue is loaded, pop the next entry and (when non-empty)
     *         call `receiveWithAuthorization` on `_token` to pull `_amount`
     *         from `_from` to `_to`.
     *
     * @return consumed true when a non-empty authorization was consumed and
     *         the token call dispatched; false when the caller should fall
     *         through to the standard ERC-20 allowance path.
     */
    function consumeForTransfer(
        address _token,
        address _from,
        address _to,
        uint256 _amount
    ) internal returns (bool consumed) {
        if (!hasQueue()) return false;

        bytes memory entry = popNext();
        if (entry.length == 0) return false;

        (uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) = abi.decode(
            entry,
            (uint256, uint256, bytes32, uint8, bytes32, bytes32)
        );

        IERC3009(_token).receiveWithAuthorization(_from, _to, _amount, validAfter, validBefore, nonce, v, r, s);
        return true;
    }

    function _storeEntry(uint256 _index, bytes memory _entry) private {
        bytes32 base = _entryBase(_index);
        uint256 len = _entry.length;
        assembly {
            tstore(base, len)
        }
        uint256 numWords = (len + 31) / 32;
        for (uint256 w = 0; w < numWords; ++w) {
            bytes32 slot = bytes32(uint256(base) + 1 + w);
            bytes32 word;
            assembly {
                word := mload(add(_entry, mul(32, add(w, 1))))
                tstore(slot, word)
            }
        }
    }

    function _entryBase(uint256 _index) private pure returns (bytes32) {
        return keccak256(abi.encode(ENTRY_NAMESPACE, _index));
    }
}
