// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.34;

/**
 * @title TransientAuthLib
 *
 * @notice Parks a queue of authorization payloads (e.g. ERC-3009 signed
 * authorizations) in transient storage for the duration of a single transaction.
 *
 * The metatransaction entry point loads the queue once via `loadQueue`. Each
 * subsequent `transferFundsIn` call pops the next entry via `popNext`. An empty
 * entry (length 0) signals "no authorization for this transfer — fall back to
 * the default ERC-20 allowance path". An exhausted queue returns empty bytes.
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
