// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.35;

import { IDRFeeMutualizer } from "../interfaces/clients/IDRFeeMutualizer.sol";
import { IERC165 } from "../interfaces/IERC165.sol";

/**
 * @title MaliciousReentrant
 *
 * @notice Mock contract used exclusively in reentrancy-guard tests. After being
 * "armed" with calldata for a Boson protocol function, the contract attempts to
 * call that function from inside every callback hook (receive, fallback, ERC20
 * transfer / transferFrom, ERC721/1155 receiver hooks). The protocol's global
 * `nonReentrant` modifier must block every such call.
 *
 * Specialised subclasses pose as additional external contracts the protocol
 * trusts at runtime:
 *   - MaliciousPriceDiscovery: gets invoked by BosonPriceDiscovery via
 *     `functionCallWithValue`. The base fallback already handles this.
 *   - MaliciousMutualizer: implements IDRFeeMutualizer so the seller can
 *     register it as the offer's mutualizer.
 *
 * Verification:
 *   - The contract emits `ReentryAttempted` with `blocked = true` and the inner
 *     revert selector when the protocol's reentrancy guard kicks in.
 *   - When `bubbleUp` is set the inner revert is re-thrown so the outer
 *     transaction reverts with `ReentrancyGuard()`.
 */
contract MaliciousReentrant {
    // bytes4(keccak256("ReentrancyGuard()"))
    bytes4 internal constant REENTRANCY_GUARD_SELECTOR = 0x8beb9d16;

    address public protocol;
    bytes public attackCalldata;
    bool public armed;
    bool public bubbleUp;
    bool public reentrancyBlocked;
    bytes public lastInnerRevertData;
    bytes4 public lastInnerSelector;
    uint256 public attackCount;

    // Per-address bookkeeping so this contract can pose as an ERC20 with
    // accurate balance tracking. Boson's `transferFundsIn` compares the
    // protocol's balance before and after `transferFrom` and reverts with
    // `InsufficientValueReceived` if the delta doesn't match the requested
    // amount — without this tracking the outer tx aborts before any events
    // can be observed.
    mapping(address => uint256) public balances;

    event ReentryAttempted(bytes4 indexed toSelector, bool blocked, bytes4 innerSelector);

    /**
     * @notice Arm the contract for one re-entry attempt. After `_attack` fires
     * the contract self-disarms so a single tx with multiple hook calls does
     * not loop forever.
     *
     * @param _protocol - the protocol diamond address
     * @param _calldata - the calldata for the TO function to attempt re-entry into
     * @param _bubbleUp - if true, re-throw the inner revert so the outer call reverts with the inner reason
     */
    function arm(address _protocol, bytes calldata _calldata, bool _bubbleUp) external {
        protocol = _protocol;
        attackCalldata = _calldata;
        armed = true;
        bubbleUp = _bubbleUp;
        reentrancyBlocked = false;
        lastInnerRevertData = "";
        lastInnerSelector = bytes4(0);
        attackCount = 0;
    }

    /**
     * @notice Force-disarm the contract (used during cleanup between tests).
     */
    function disarm() external {
        armed = false;
    }

    /**
     * @notice Drive a protocol call where this contract must be `msg.sender`.
     *
     * @dev Several FROM paths in the reentrancy matrix require the malicious
     * contract to be the buyer/committer (twin redeem, price discovery,
     * sequential commit). The receiver hooks then fire on this contract and
     * trigger `_attack`. This helper lets tests initiate any protocol call
     * with this contract as `_msgSender()` and forward msg.value.
     *
     * The `protocol` address must already be set (via `arm` or a dedicated
     * setter); we reuse the one stored by `arm`.
     */
    function executeProtocolCallValue(bytes calldata _data) external payable returns (bytes memory) {
        (bool ok, bytes memory ret) = protocol.call{ value: msg.value }(_data);
        if (!ok) {
            assembly {
                revert(add(ret, 0x20), mload(ret))
            }
        }
        return ret;
    }

    /**
     * @notice Read the selector encoded in the currently armed calldata.
     */
    function targetSelector() external view returns (bytes4) {
        if (attackCalldata.length < 4) return bytes4(0);
        bytes memory cd = attackCalldata;
        bytes4 sel;
        // assembly-free copy of the first 4 bytes
        sel = bytes4(cd[0]) | (bytes4(cd[1]) >> 8) | (bytes4(cd[2]) >> 16) | (bytes4(cd[3]) >> 24);
        return sel;
    }

    /**
     * @dev Single-shot re-entry attempt. Records whether the call reverted with
     * the global reentrancy guard, emits an event and optionally bubbles up
     * the inner revert.
     */
    function _attack() internal {
        if (!armed) return;
        // Single-shot per arming so multiple callback hooks in one tx do not loop
        armed = false;
        attackCount++;

        (bool ok, bytes memory data) = protocol.call(attackCalldata);
        bytes4 inner = bytes4(0);
        if (data.length >= 4) {
            inner = bytes4(data[0]) | (bytes4(data[1]) >> 8) | (bytes4(data[2]) >> 16) | (bytes4(data[3]) >> 24);
        }
        lastInnerRevertData = data;
        lastInnerSelector = inner;
        reentrancyBlocked = !ok && inner == REENTRANCY_GUARD_SELECTOR;

        bytes4 toSel = bytes4(0);
        if (attackCalldata.length >= 4) {
            bytes memory cd = attackCalldata;
            toSel = bytes4(cd[0]) | (bytes4(cd[1]) >> 8) | (bytes4(cd[2]) >> 16) | (bytes4(cd[3]) >> 24);
        }
        emit ReentryAttempted(toSel, reentrancyBlocked, inner);

        if (bubbleUp && !ok) {
            assembly {
                revert(add(data, 0x20), mload(data))
            }
        }
    }

    /// @notice Triggered by ETH transfers (.call{value:}("") ) from FundsBase.transferFundsOut.
    receive() external payable {
        _attack();
    }

    /// @notice Triggered by BosonPriceDiscovery wrapper invoking the user-supplied price discovery contract.
    fallback() external payable {
        _attack();
    }

    // ----- ERC721 / ERC1155 receiver hooks (used when the buyer wallet is this contract) -----

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        _attack();
        return 0x150b7a02; // IERC721Receiver.onERC721Received.selector
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external returns (bytes4) {
        _attack();
        return 0xf23a6e61; // IERC1155Receiver.onERC1155Received.selector
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external returns (bytes4) {
        _attack();
        return 0xbc197c81; // IERC1155Receiver.onERC1155BatchReceived.selector
    }

    // ----- Pose as ERC20 (used when this contract is registered as an offer's exchange token) -----

    function transfer(address to, uint256 amount) external returns (bool) {
        _attack();
        // Mimic an honest ERC20 so Boson's balance-delta check in
        // `transferFundsIn`/`transferFundsOut` passes and the outer tx survives
        // long enough for our event to be observed.
        balances[to] += amount;
        return true;
    }

    function transferFrom(address, address to, uint256 amount) external returns (bool) {
        _attack();
        balances[to] += amount;
        return true;
    }

    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }

    function allowance(address, address) external view returns (uint256) {
        return type(uint128).max;
    }

    function approve(address, uint256) external returns (bool) {
        return true;
    }

    function decimals() external pure returns (uint8) {
        return 18;
    }

    function totalSupply() external pure returns (uint256) {
        return type(uint128).max;
    }

    function name() external pure returns (string memory) {
        return "MaliciousReentrant";
    }

    function symbol() external pure returns (string memory) {
        return "MAL";
    }
}

/**
 * @title MaliciousMutualizer
 *
 * @notice Variant of MaliciousReentrant that satisfies IDRFeeMutualizer so it
 * can be registered as an offer's mutualizer. Every interface method routes
 * through `_attack` to trigger re-entry into the protocol while the protocol
 * is mid-flight in commit/finalize logic.
 */
contract MaliciousMutualizer is MaliciousReentrant, IDRFeeMutualizer {
    function isSellerCovered(uint256, uint256, address, uint256) external pure override returns (bool) {
        return true;
    }

    function requestDRFee(uint256, uint256, address, uint256, uint256) external override returns (bool success) {
        _attack();
        return true;
    }

    function finalizeExchange(uint256, uint256) external override {
        _attack();
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IDRFeeMutualizer).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}

/**
 * @title MaliciousPriceDiscovery
 *
 * @notice Variant of MaliciousReentrant aimed at the price discovery path.
 * BosonPriceDiscovery calls the user-supplied price discovery contract via
 * low-level `functionCallWithValue`, which lands in `fallback`. The base
 * contract's fallback already triggers `_attack`, so this class exists mainly
 * as a labelled deployment for clarity in tests.
 */
contract MaliciousPriceDiscovery is MaliciousReentrant {
    // No additional behaviour; the fallback in MaliciousReentrant already attacks.
}
