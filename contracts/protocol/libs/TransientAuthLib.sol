// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.34;

import { BosonTypes } from "../../domain/BosonTypes.sol";
import { BosonErrors } from "../../domain/BosonErrors.sol";
import { IERC3009 } from "../../interfaces/IERC3009.sol";
import { IERC2612 } from "../../interfaces/IERC2612.sol";
import { IPermit2 } from "../../interfaces/IPermit2.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title TransientAuthLib
 *
 * @notice Parks a queue of off-chain authorization payloads in transient
 * storage for the duration of a single transaction. Each entry self-describes
 * its strategy via a `BosonTypes.AuthorizationStrategy` tag, so a single queue
 * can carry mixed strategies (ERC-3009 today, Permit2/EIP-2612 in the future).
 *
 * The metatransaction entry point loads the queue once via `loadQueue`. Each
 * subsequent `transferFundsIn` call consumes the next entry via
 * `consumeForTransfer`, which pops the next entry and dispatches to the
 * strategy-specific helper. An empty entry (length 0) is a shortcut for
 * `(AuthorizationStrategy.None, "")` — "no authorization for this slot, fall
 * back to the default ERC-20 allowance path". An exhausted queue returns false.
 *
 * All slots are written via `TSTORE` and cleared automatically by the EVM at
 * the end of the transaction.
 */
library TransientAuthLib {
    using SafeERC20 for IERC20;

    // keccak256("boson.protocol.transient.auth.head")
    bytes32 internal constant HEAD_SLOT = 0xce5770354476e99bdde896641c71da6009bd50f30d3de00fc43d0445231eaf15;
    // keccak256("boson.protocol.transient.auth.len")
    bytes32 internal constant LEN_SLOT = 0x6618e9b8bf7496853ecb88754e3c3561fb7a12c07e953521e0f56d8f7a44c617;
    // keccak256("boson.protocol.transient.auth.entry")
    bytes32 internal constant ENTRY_NAMESPACE = 0xf8bb5ee110f42d7a27e60caaf3960b2d39746521f5b10f112b18781d106645f3;

    // Uniswap's Permit2 contract — same canonical address on every chain
    // Boson supports (Ethereum, Polygon, Optimism, Arbitrum, Base).
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

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
     * @notice If a queue is loaded, pop the next entry and dispatch to the
     *         strategy-specific helper to pull `_amount` from `_from` to `_to`.
     *
     * @return consumed true when a non-empty authorization was consumed and a
     *         token call dispatched; false when the caller should fall through
     *         to the standard ERC-20 allowance path (queue empty/exhausted, or
     *         entry tagged `AuthorizationStrategy.None`, or shortcut empty bytes).
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

        (BosonTypes.AuthorizationStrategy strategy, bytes memory data) = abi.decode(
            entry,
            (BosonTypes.AuthorizationStrategy, bytes)
        );

        if (strategy == BosonTypes.AuthorizationStrategy.None) return false;
        if (strategy == BosonTypes.AuthorizationStrategy.ERC3009) {
            _consumeERC3009(_token, _from, _to, _amount, data);
            return true;
        }
        if (strategy == BosonTypes.AuthorizationStrategy.EIP2612) {
            _consumeEIP2612(_token, _from, _to, _amount, data);
            return true;
        }
        if (strategy == BosonTypes.AuthorizationStrategy.Permit2) {
            _consumePermit2(_token, _from, _to, _amount, data);
            return true;
        }
        revert BosonErrors.UnsupportedAuthorizationStrategy();
    }

    function _consumeERC3009(address _token, address _from, address _to, uint256 _amount, bytes memory _data) private {
        (uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) = abi.decode(
            _data,
            (uint256, uint256, bytes32, uint8, bytes32, bytes32)
        );
        IERC3009(_token).receiveWithAuthorization(_from, _to, _amount, validAfter, validBefore, nonce, v, r, s);
    }

    /**
     * @dev EIP-2612 path: call the token's native `permit` to set a single-use
     *      allowance, then pull funds via `safeTransferFrom`. The user signs
     *      the permit with `value == _amount`, so the allowance is consumed
     *      exactly and no residual remains.
     */
    function _consumeEIP2612(address _token, address _from, address _to, uint256 _amount, bytes memory _data) private {
        (uint256 deadline, uint8 v, bytes32 r, bytes32 s) = abi.decode(_data, (uint256, uint8, bytes32, bytes32));
        IERC2612(_token).permit(_from, _to, _amount, deadline, v, r, s);
        IERC20(_token).safeTransferFrom(_from, _to, _amount);
    }

    /**
     * @dev Permit2 path: dispatch a signed `permitTransferFrom` to Uniswap's
     *      canonical Permit2 contract. The user must have one-time-approved
     *      Permit2 on `_token`; subsequent pulls are signature-only.
     */
    function _consumePermit2(address _token, address _from, address _to, uint256 _amount, bytes memory _data) private {
        (uint256 nonce, uint256 deadline, bytes memory signature) = abi.decode(_data, (uint256, uint256, bytes));
        IPermit2.PermitTransferFrom memory permit = IPermit2.PermitTransferFrom({
            permitted: IPermit2.TokenPermissions({ token: _token, amount: _amount }),
            nonce: nonce,
            deadline: deadline
        });
        IPermit2.SignatureTransferDetails memory transferDetails = IPermit2.SignatureTransferDetails({
            to: _to,
            requestedAmount: _amount
        });
        IPermit2(PERMIT2).permitTransferFrom(permit, transferDetails, _from, signature);
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
        // ERC-7201-style mask: zero the last byte of every entry's base slot so
        // two entries' sub-slot ranges (base, base+1, ..., base+N) cannot
        // structurally overlap. Each entry now owns a guaranteed 256-slot range
        // — comfortably above the ~7 sub-slots a typical entry uses (1 length
        // + 6 words for an ERC-3009 payload).
        return keccak256(abi.encode(ENTRY_NAMESPACE, _index)) & ~bytes32(uint256(0xff));
    }
}
