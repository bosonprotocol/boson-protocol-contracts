// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import { IERC3009 } from "../../interfaces/IERC3009.sol";
import { IBosonFundsHandler } from "../../interfaces/handlers/IBosonFundsHandler.sol";
import { IBosonExchangeCommitHandler } from "../../interfaces/handlers/IBosonExchangeCommitHandler.sol";

/**
 * @title BosonERC3009Forwarder
 *
 * @notice Stateless forwarder that lets a holder of an ERC-3009-compliant token
 *         (e.g. USDC) execute a Boson protocol call in a single transaction by
 *         signing an off-chain `receiveWithAuthorization` message — no separate
 *         `approve` transaction required.
 *
 * Per-call flow:
 *   1. Pull `value` tokens from `from` via `IERC3009.receiveWithAuthorization`.
 *      EIP-3009 enforces `msg.sender == to`, so only this forwarder can consume
 *      the user's authorization (front-run-proof).
 *   2. `forceApprove(protocol, value)` — exact allowance.
 *   3. Call the protocol (no msg.value; ERC-20-only).
 *   4. Defensively reset allowance to zero if the protocol pulled less than
 *      the full `value`.
 *
 * The forwarder is intentionally not payable. Native-currency offers/deposits
 * are unsupported. Token balance on the forwarder after a successful call is
 * impossible by construction; tokens force-sent out-of-band are stuck.
 *
 * The protocol's `_msgSender()` does not honour ERC-2771 from external
 * callers — it sees `msg.sender == this forwarder`. That is fine for the two
 * supported entry points:
 *   - `depositFunds`: protocol credits `_entityId`, the courier identity is
 *     irrelevant.
 *   - `commitToOffer(_committer, _offerId)`: `_committer` is a parameter, so
 *     the voucher mints to the user (typically `from`).
 *
 * `commitToBuyerOffer` is not supported because it identifies the seller
 * via `_msgSender()`, which would require this forwarder to be registered as
 * each seller's assistant — not viable for a generic per-deployment courier.
 */
contract BosonERC3009Forwarder is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error InvalidProtocolAddress();
    error InvalidTokenAddress();
    error ZeroValue();

    address public immutable protocol;

    constructor(address _protocol) {
        if (_protocol == address(0)) revert InvalidProtocolAddress();
        protocol = _protocol;
    }

    /**
     * @notice Pulls `value` tokens from `from` via ERC-3009 and credits them to
     *         `entityId` in the Boson protocol.
     *
     * @param token        ERC-3009-compliant ERC-20 token address
     * @param from         Authorizer (token owner who signed off-chain)
     * @param value        Amount to pull and deposit
     * @param validAfter   ERC-3009: authorization is valid only after this timestamp
     * @param validBefore  ERC-3009: authorization expires at this timestamp
     * @param nonce        ERC-3009: unique authorization nonce
     * @param v, r, s      ERC-3009: ECDSA signature components from `from`
     * @param entityId     Boson seller or buyer id to credit
     */
    function depositFundsWithAuthorization(
        address token,
        address from,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s,
        uint256 entityId
    ) external nonReentrant {
        _pullWithAuthorization(token, from, value, validAfter, validBefore, nonce, v, r, s);
        _approveAndCall(token, value, abi.encodeCall(IBosonFundsHandler.depositFunds, (entityId, token, value)));
    }

    /**
     * @notice Pulls `value` tokens from `from` via ERC-3009 and commits to
     *         offer `offerId` on behalf of `committer`. Voucher mints to
     *         `committer`.
     *
     * @param token        ERC-3009-compliant ERC-20 token; must equal the
     *                     offer's exchange token (validated by the protocol)
     * @param from         Authorizer (typically the buyer)
     * @param value        Offer price, exact
     * @param committer    Address that will receive the voucher (typically `from`)
     * @param offerId      Boson offer id
     */
    function commitToOfferWithAuthorization(
        address token,
        address from,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s,
        address payable committer,
        uint256 offerId
    ) external nonReentrant {
        _pullWithAuthorization(token, from, value, validAfter, validBefore, nonce, v, r, s);
        _approveAndCall(token, value, abi.encodeCall(IBosonExchangeCommitHandler.commitToOffer, (committer, offerId)));
    }

    function _pullWithAuthorization(
        address token,
        address from,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) private {
        if (token == address(0)) revert InvalidTokenAddress();
        if (value == 0) revert ZeroValue();
        IERC3009(token).receiveWithAuthorization(from, address(this), value, validAfter, validBefore, nonce, v, r, s);
    }

    function _approveAndCall(address token, uint256 value, bytes memory callData) private {
        IERC20(token).forceApprove(protocol, value);

        (bool ok, bytes memory ret) = protocol.call(callData);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }

        if (IERC20(token).allowance(address(this), protocol) != 0) {
            IERC20(token).forceApprove(protocol, 0);
        }
    }
}
