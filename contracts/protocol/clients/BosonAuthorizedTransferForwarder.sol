// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import { IERC3009 } from "../../interfaces/IERC3009.sol";
import { IBosonFundsHandler } from "../../interfaces/handlers/IBosonFundsHandler.sol";
import { IBosonExchangeCommitHandler } from "../../interfaces/handlers/IBosonExchangeCommitHandler.sol";
import { IBosonMetaTransactionsHandler } from "../../interfaces/handlers/IBosonMetaTransactionsHandler.sol";

/**
 * @title BosonAuthorizedTransferForwarder
 *
 * @notice Stateless forwarder that lets a token holder execute a Boson protocol
 *         call in a single transaction by signing an off-chain authorization —
 *         no separate `approve` tx required. Two authorization flavours are
 *         supported:
 *
 *           - **ERC-3009** (`receiveWithAuthorization`) — used by USDC and
 *             other regulated stablecoins. The signature binds the recipient
 *             (this forwarder) and the amount.
 *           - **EIP-2612** (`permit`) — used by most modern DeFi tokens.
 *             The signature grants an allowance to the spender (this
 *             forwarder), which is then consumed via `transferFrom`.
 *
 * Both flavours additionally require an **action signature**: an EIP-712
 * signature by the token owner over the protocol-call parameters, bound to
 * the inner authorization. Without this, an observer could front-run the tx
 * and re-route the funds (swap entityId to credit a different account, or
 * swap committer/offerId to mint the voucher elsewhere). The action sig is
 * verified before any token movement, so a bad sig costs the attacker only
 * base gas.
 *
 * Binding strategies differ between the two flavours because their security
 * properties differ:
 *
 * - **ERC-3009**: action typehash embeds the inner sig's `(v, r, s)`. The
 *   inner sig itself commits to the full ERC-3009 message (token domain,
 *   value, nonce, validAfter, validBefore), so binding to `(v, r, s)` is
 *   sufficient. There is no `try/catch` around `receiveWithAuthorization`,
 *   so a mismatched token, value, or window causes the whole tx to revert.
 *   Replay protection comes for free from ERC-3009's one-shot bytes32 nonce.
 *
 * - **EIP-2612 permit**: the `permit()` call is wrapped in `try/catch` for
 *   front-runner DoS resilience (a mempool observer can otherwise consume
 *   the permit nonce ahead of the user's tx). That fallback to standing
 *   allowance, however, means the inner `(v, r, s)` is not a sufficient
 *   binding on its own — an attacker could replay an old action signature
 *   against a new permit's allowance and redirect the user's funds to an
 *   already-signed-for offer or entity. The action typehash therefore binds
 *   the protocol-call parameters explicitly: `(entityId | committer+offerId,
 *   token, value, deadline, actionNonce)`. The `actionNonce` is one-shot per
 *   signer (tracked in `usedActionNonces`); explicit `(token, value, deadline)`
 *   bind the user's intent independently of which permit ends up being
 *   consumed at execution time.
 *
 * Cross-chain replay is prevented on both signatures via chainId-bound
 * EIP-712 domains.
 *
 * Per-call flow (both flavours):
 *   1. Verify the action signature recovers to `from`.
 *   2. Pull `value` tokens from `from` to this forwarder.
 *      - ERC-3009: `receiveWithAuthorization(from, this, value, ..., v, r, s)`
 *      - EIP-2612: `try permit(from, this, value, deadline, v, r, s)` then
 *        `transferFrom(from, this, value)`. The permit call is tolerated to
 *        revert (a front-runner could have already consumed the nonce); what
 *        matters is that the resulting allowance is sufficient — if it isn't,
 *        the transferFrom reverts with the standard ERC-20 error.
 *   3. `forceApprove(protocol, value)` — exact allowance.
 *   4. Call the protocol (no msg.value; ERC-20-only).
 *   5. Defensively reset allowance to zero if any residual remains.
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
 * `commitToBuyerOffer` is not supported because it identifies the seller via
 * `_msgSender()`, which would require this forwarder to be registered as
 * each seller's assistant — not viable for a generic per-deployment courier.
 *
 * Action signatures are ECDSA-only.
 */
contract BosonAuthorizedTransferForwarder is ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    /// @notice ECDSA signature components — used for the action signature.
    struct Signature {
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    /// @notice Bundled parameters for `redeemPremintedOfferWithAuthorization`.
    /// Bundled to avoid stack-too-deep — the entry point also takes the
    /// action signature, the trusted-forwarder relay calldata, and the
    /// buyer's redeem-meta-tx signature as separate args.
    struct RedeemPremintedParams {
        // ERC-3009 (buyer's payment)
        address token;
        address buyer;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 erc3009Nonce;
        uint8 v;
        bytes32 r;
        bytes32 s;
        // Voucher / exchange routing
        address voucher;
        uint256 tokenId;
        uint256 sellerId;
        // Replay protection / meta-tx coordination
        uint256 actionNonce;
        uint256 redeemNonce;
    }

    bytes32 private constant DEPOSIT_FUNDS_WITH_AUTHORIZATION_TYPEHASH =
        keccak256("DepositFundsWithAuthorization(uint256 entityId,uint8 v,bytes32 r,bytes32 s)");
    bytes32 private constant DEPOSIT_FUNDS_WITH_PERMIT_TYPEHASH =
        keccak256(
            "DepositFundsWithPermit(uint256 entityId,address token,uint256 value,uint256 deadline,uint256 actionNonce)"
        );
    bytes32 private constant COMMIT_TO_OFFER_WITH_AUTHORIZATION_TYPEHASH =
        keccak256("CommitToOfferWithAuthorization(address committer,uint256 offerId,uint8 v,bytes32 r,bytes32 s)");
    bytes32 private constant COMMIT_TO_OFFER_WITH_PERMIT_TYPEHASH =
        keccak256(
            "CommitToOfferWithPermit(address committer,uint256 offerId,address token,uint256 value,uint256 deadline,uint256 actionNonce)"
        );
    bytes32 private constant REDEEM_PREMINTED_OFFER_WITH_AUTHORIZATION_TYPEHASH =
        keccak256(
            "RedeemPremintedOfferWithAuthorization(address buyer,address voucher,uint256 tokenId,uint256 sellerId,uint256 actionNonce,uint8 v,bytes32 r,bytes32 s)"
        );

    string private constant REDEEM_VOUCHER_FUNCTION_NAME = "redeemVoucher(uint256)";
    bytes4 private constant REDEEM_VOUCHER_SELECTOR = bytes4(keccak256(bytes(REDEEM_VOUCHER_FUNCTION_NAME)));

    error InvalidProtocolAddress();
    error InvalidTokenAddress();
    error ZeroValue();
    error InvalidActionSignature();
    error ActionNonceAlreadyUsed();
    error InvalidVoucherAddress();
    error InvalidTrustedForwarderAddress();
    error VoucherNotReceivedByBuyer();

    address public immutable protocol;

    /// @notice Tracks consumed action nonces per signer for the EIP-2612 permit
    ///         flow. Each (signer, nonce) pair is one-shot — same pattern as
    ///         the protocol's MetaTransactionsHandler `usedNonce` map.
    mapping(address => mapping(uint256 => bool)) public usedActionNonces;

    constructor(address _protocol) EIP712("BosonAuthorizedTransferForwarder", "1") {
        if (_protocol == address(0)) revert InvalidProtocolAddress();
        protocol = _protocol;
    }

    // ---------- ERC-3009 entry points ----------

    /**
     * @notice Pulls `value` tokens from `from` via ERC-3009 and credits them to
     *         `entityId` in the Boson protocol.
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
        bytes32 structHash = keccak256(abi.encode(DEPOSIT_FUNDS_WITH_AUTHORIZATION_TYPEHASH, entityId, v, r, s));
        _verifyActionSignature(structHash, from, actionSig);

        _pullWithAuthorization(token, from, value, validAfter, validBefore, nonce, v, r, s);
        _approveAndCall(token, value, abi.encodeCall(IBosonFundsHandler.depositFunds, (entityId, token, value)));
    }

    /**
     * @notice Pulls `value` tokens from `from` via ERC-3009 and commits to
     *         offer `offerId` on behalf of `committer`.
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
        bytes32 structHash = keccak256(
            abi.encode(COMMIT_TO_OFFER_WITH_AUTHORIZATION_TYPEHASH, committer, offerId, v, r, s)
        );
        _verifyActionSignature(structHash, from, actionSig);

        _pullWithAuthorization(token, from, value, validAfter, validBefore, nonce, v, r, s);
        _approveAndCall(token, value, abi.encodeCall(IBosonExchangeCommitHandler.commitToOffer, (committer, offerId)));
    }

    // ---------- EIP-2612 entry points ----------

    /**
     * @notice Pulls `value` tokens from `from` via EIP-2612 permit and credits
     *         them to `entityId` in the Boson protocol.
     *
     * @param actionNonce  One-shot nonce chosen by the signer. Marked used in
     *                     `usedActionNonces` on success; reverts if already
     *                     used. Required because permit's `try/catch` allows
     *                     fallback to standing allowance, so the action sig
     *                     must independently bind every meaningful parameter
     *                     and prevent replay.
     */
    function depositFundsWithPermit(
        address token,
        address from,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s,
        uint256 entityId,
        uint256 actionNonce,
        Signature calldata actionSig
    ) external nonReentrant {
        if (token == address(0)) revert InvalidTokenAddress();
        if (value == 0) revert ZeroValue();
        _consumeActionNonce(from, actionNonce);
        bytes32 structHash = keccak256(
            abi.encode(DEPOSIT_FUNDS_WITH_PERMIT_TYPEHASH, entityId, token, value, deadline, actionNonce)
        );
        _verifyActionSignature(structHash, from, actionSig);

        _pullWithPermit(token, from, value, deadline, v, r, s);
        _approveAndCall(token, value, abi.encodeCall(IBosonFundsHandler.depositFunds, (entityId, token, value)));
    }

    /**
     * @notice Pulls `value` tokens from `from` via EIP-2612 permit and commits
     *         to offer `offerId` on behalf of `committer`.
     *
     * @param actionNonce  One-shot nonce chosen by the signer. See
     *                     `depositFundsWithPermit` for rationale.
     */
    function commitToOfferWithPermit(
        address token,
        address from,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s,
        address payable committer,
        uint256 offerId,
        uint256 actionNonce,
        Signature calldata actionSig
    ) external nonReentrant {
        if (token == address(0)) revert InvalidTokenAddress();
        if (value == 0) revert ZeroValue();
        _consumeActionNonce(from, actionNonce);
        bytes32 structHash = keccak256(
            abi.encode(COMMIT_TO_OFFER_WITH_PERMIT_TYPEHASH, committer, offerId, token, value, deadline, actionNonce)
        );
        _verifyActionSignature(structHash, from, actionSig);

        _pullWithPermit(token, from, value, deadline, v, r, s);
        _approveAndCall(token, value, abi.encodeCall(IBosonExchangeCommitHandler.commitToOffer, (committer, offerId)));
    }

    // ---------- ERC-3009 + voucher transfer + redeem (single tx) ----------

    /**
     * @notice Single-tx "buy + redeem" for a preminted static-price offer.
     *
     * Stitches together four signatures, all signed off-chain:
     *
     *   - buyer's ERC-3009 `receiveWithAuthorization` for the offer price
     *     (`params.{token, value, validAfter, validBefore, erc3009Nonce, v, r, s}`)
     *   - buyer's forwarder action sig binding the protocol-call params and
     *     the inner ERC-3009 sig's `(v, r, s)` (`actionSig` over the new
     *     `RedeemPremintedOfferWithAuthorization` typehash, replay-protected
     *     by `params.actionNonce` in `usedActionNonces[buyer][...]`)
     *   - seller's ERC-2771 ForwardRequest (signed under
     *     `trustedForwarder`'s domain) authorising
     *     `BosonVoucher.transferFrom(seller, buyer, tokenId)`
     *     (`trustedForwarderCalldata`, opaque to this contract)
     *   - buyer's protocol redeem meta-tx signature
     *     (`redeemSignature`, consumed by the protocol's
     *     `MetaTransactionsHandler.executeMetaTransaction`)
     *
     * Preconditions on the seller side:
     *   - Offer is created with a reserved range and vouchers preminted to
     *     the seller's assistant.
     *   - Seller has deposited the per-voucher seller-deposit into the
     *     protocol. The forwarder covers the price portion at runtime by
     *     pulling the buyer's tokens via ERC-3009 and depositing them to
     *     `params.sellerId`'s pool just before the voucher transfer.
     *   - `BosonVoucher` was deployed with `trustedForwarder` as its
     *     ERC-2771 forwarder.
     *
     * Net effect: voucher is transferred and committed to the buyer, the
     * exchange transitions to Redeemed in the same tx, and any twin NFTs
     * land directly in the buyer's wallet.
     */
    function redeemPremintedOfferWithAuthorization(
        RedeemPremintedParams calldata params,
        Signature calldata actionSig,
        address trustedForwarder,
        bytes calldata trustedForwarderCalldata,
        bytes calldata redeemSignature
    ) external nonReentrant {
        if (params.token == address(0)) revert InvalidTokenAddress();
        if (params.value == 0) revert ZeroValue();
        if (params.voucher == address(0)) revert InvalidVoucherAddress();
        if (trustedForwarder == address(0)) revert InvalidTrustedForwarderAddress();

        _consumeActionNonce(params.buyer, params.actionNonce);
        _verifyActionSignature(_redeemPremintedStructHash(params), params.buyer, actionSig);

        // Pull buyer's tokens via ERC-3009 (atomic; reverts on any mismatch).
        _pullForRedeemPreminted(params);

        // Deposit the price portion to the seller's pool. After this the
        // seller's pool has at least sellerDeposit + price, so the
        // commit-on-transfer below can encumber successfully.
        _approveAndCall(
            params.token,
            params.value,
            abi.encodeCall(IBosonFundsHandler.depositFunds, (params.sellerId, params.token, params.value))
        );

        // Relay seller's voucher transfer through the trusted forwarder.
        // The trusted forwarder verifies the seller's ForwardRequest signature,
        // then calls BosonVoucher.transferFrom(seller, buyer, tokenId) with
        // the seller appended to the calldata (ERC-2771). The first transfer
        // of a preminted voucher fires onPremintedVoucherTransferred which
        // commits `buyer` as the exchange's buyerId and encumbers
        // sellerDeposit + price from the seller's pool.
        (bool ok, bytes memory ret) = trustedForwarder.call(trustedForwarderCalldata);
        if (!ok) {
            // Bubble the trusted forwarder's revert verbatim. Empty returndata
            // becomes a 0-byte silent revert — acceptable for a misbehaving
            // forwarder; the canonical paths (OZ MinimalForwarder etc.) always
            // surface a reason.
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }

        // Defensive post-condition: confirm the voucher actually landed at
        // the buyer. Catches a misbehaving trusted forwarder that returns
        // success without transferring, or a seller signing a transfer to
        // someone other than the buyer.
        if (IERC721(params.voucher).ownerOf(params.tokenId) != params.buyer) {
            revert VoucherNotReceivedByBuyer();
        }

        // Buyer's redeem meta-tx, executed via the protocol's meta-tx handler.
        // exchangeId is the lower 128 bits of the voucher tokenId.
        uint256 exchangeId = params.tokenId & type(uint128).max;
        bytes memory redeemFunctionSignature = abi.encodeWithSelector(REDEEM_VOUCHER_SELECTOR, exchangeId);

        IBosonMetaTransactionsHandler(protocol).executeMetaTransaction(
            params.buyer,
            REDEEM_VOUCHER_FUNCTION_NAME,
            redeemFunctionSignature,
            params.redeemNonce,
            redeemSignature
        );
    }

    // ---------- internals ----------

    function _verifyActionSignature(bytes32 structHash, address from, Signature calldata sig) private view {
        bytes32 digest = _hashTypedDataV4(structHash);
        (address recovered, ECDSA.RecoverError err) = ECDSA.tryRecover(digest, sig.v, sig.r, sig.s);
        if (err != ECDSA.RecoverError.NoError || recovered != from) revert InvalidActionSignature();
    }

    function _consumeActionNonce(address from, uint256 nonce) private {
        if (usedActionNonces[from][nonce]) revert ActionNonceAlreadyUsed();
        usedActionNonces[from][nonce] = true;
    }

    function _pullForRedeemPreminted(RedeemPremintedParams calldata params) private {
        // Wrapped in a helper so the calldata struct fields don't all live
        // on the stack of the main entry point at once (avoids
        // stack-too-deep without enabling viaIR).
        IERC3009(params.token).receiveWithAuthorization(
            params.buyer,
            address(this),
            params.value,
            params.validAfter,
            params.validBefore,
            params.erc3009Nonce,
            params.v,
            params.r,
            params.s
        );
    }

    function _redeemPremintedStructHash(RedeemPremintedParams calldata params) private pure returns (bytes32) {
        // Two-step encode to dodge stack-too-deep without viaIR. The output is
        // bit-identical to a single `abi.encode(typehash, ... 8 fields ...)`
        // because every argument is a static-size type — `bytes.concat` just
        // splices the two encodings together.
        return
            keccak256(
                bytes.concat(
                    abi.encode(
                        REDEEM_PREMINTED_OFFER_WITH_AUTHORIZATION_TYPEHASH,
                        params.buyer,
                        params.voucher,
                        params.tokenId,
                        params.sellerId,
                        params.actionNonce
                    ),
                    abi.encode(params.v, params.r, params.s)
                )
            );
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

    function _pullWithPermit(
        address token,
        address from,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) private {
        if (token == address(0)) revert InvalidTokenAddress();
        if (value == 0) revert ZeroValue();
        // Tolerate permit failure: a front-runner may have already consumed the
        // nonce. What matters is the resulting allowance — `transferFrom` will
        // revert naturally if it isn't sufficient.
        try IERC20Permit(token).permit(from, address(this), value, deadline, v, r, s) {} catch {}
        IERC20(token).safeTransferFrom(from, address(this), value);
    }

    function _approveAndCall(address token, uint256 value, bytes memory callData) private {
        IERC20(token).forceApprove(protocol, value);

        (bool ok, bytes memory ret) = protocol.call(callData);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }

        // Defensive: zero out any residual allowance unconditionally. The
        // protocol normally pulls exactly `value`, so the allowance is already
        // 0 and this is a no-op SSTORE. Always-running keeps the path simple
        // and trivially auditable.
        IERC20(token).forceApprove(protocol, 0);
    }
}
