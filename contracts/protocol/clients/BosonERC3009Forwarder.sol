// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import { IERC3009 } from "../../interfaces/IERC3009.sol";
import { IBosonFundsHandler } from "../../interfaces/handlers/IBosonFundsHandler.sol";
import { IBosonExchangeCommitHandler } from "../../interfaces/handlers/IBosonExchangeCommitHandler.sol";

/**
 * @title BosonERC3009Forwarder
 *
 * @notice Stateless forwarder that lets a holder of an ERC-3009-compliant token
 *         (e.g. USDC) execute a Boson protocol call in a single transaction.
 *
 * Two signatures are required from the token owner:
 *
 *   1. **Token authorization** — standard ERC-3009 `receiveWithAuthorization`
 *      signature. Binds the token recipient (this forwarder) and the value.
 *   2. **Action authorization** — EIP-712 signature under this forwarder's own
 *      domain, binding the protocol-call parameters (entityId / committer +
 *      offerId) to the specific ERC-3009 authorization being consumed. Without
 *      this, an observer could front-run the tx and re-route the funds (e.g.
 *      swap entityId to credit a different account, or swap committer to mint
 *      the voucher to themselves).
 *
 * The action typehash includes the ERC-3009 sig's `(v, r, s)`, which implicitly
 * commit to the full ERC-3009 message (token domain, from, to, value,
 * validAfter, validBefore, nonce). The ERC-3009 nonce is single-use, so once
 * the auth is consumed both signatures are unusable. Cross-chain replay is
 * prevented by chainId-binding on both EIP-712 domains.
 *
 * Per-call flow:
 *   1. Verify the action signature recovers to `from` (cheap; runs first so a
 *      bad sig costs the attacker only base gas).
 *   2. Pull `value` tokens from `from` via `IERC3009.receiveWithAuthorization`.
 *      EIP-3009 enforces `msg.sender == to`, so only this forwarder can
 *      consume the user's authorization.
 *   3. `forceApprove(protocol, value)` — exact allowance.
 *   4. Call the protocol (no msg.value; ERC-20-only).
 *   5. Defensively reset allowance to zero if the protocol pulled less than
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
 *
 * Action signatures are ECDSA-only. Smart-contract wallets (ERC-1271) are not
 * supported; this matches ERC-3009 itself, which is defined for EOAs.
 */
contract BosonERC3009Forwarder is ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    /// @notice ECDSA signature components — used for the action signature.
    struct Signature {
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    bytes32 private constant DEPOSIT_FUNDS_ACTION_TYPEHASH =
        keccak256("DepositFundsAction(uint256 entityId,uint8 v,bytes32 r,bytes32 s)");
    bytes32 private constant COMMIT_TO_OFFER_ACTION_TYPEHASH =
        keccak256("CommitToOfferAction(address committer,uint256 offerId,uint8 v,bytes32 r,bytes32 s)");

    error InvalidProtocolAddress();
    error InvalidTokenAddress();
    error ZeroValue();
    error InvalidActionSignature();

    address public immutable protocol;

    constructor(address _protocol) EIP712("BosonERC3009Forwarder", "1") {
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
     * @param v, r, s      ERC-3009 ECDSA signature components from `from`
     * @param entityId     Boson seller or buyer id to credit
     * @param actionSig    EIP-712 ECDSA signature by `from` over
     *                     `DepositFundsAction(entityId, v, r, s)` under this forwarder's domain
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
        uint256 entityId,
        Signature calldata actionSig
    ) external nonReentrant {
        bytes32 structHash = keccak256(abi.encode(DEPOSIT_FUNDS_ACTION_TYPEHASH, entityId, v, r, s));
        _verifyActionSignature(structHash, from, actionSig);

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
     * @param actionSig    EIP-712 ECDSA signature by `from` over
     *                     `CommitToOfferAction(committer, offerId, v, r, s)` under this forwarder's domain
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
        uint256 offerId,
        Signature calldata actionSig
    ) external nonReentrant {
        bytes32 structHash = keccak256(abi.encode(COMMIT_TO_OFFER_ACTION_TYPEHASH, committer, offerId, v, r, s));
        _verifyActionSignature(structHash, from, actionSig);

        _pullWithAuthorization(token, from, value, validAfter, validBefore, nonce, v, r, s);
        _approveAndCall(token, value, abi.encodeCall(IBosonExchangeCommitHandler.commitToOffer, (committer, offerId)));
    }

    function _verifyActionSignature(bytes32 structHash, address from, Signature calldata sig) private view {
        bytes32 digest = _hashTypedDataV4(structHash);
        if (ECDSA.recover(digest, sig.v, sig.r, sig.s) != from) revert InvalidActionSignature();
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
