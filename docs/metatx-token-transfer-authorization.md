[![banner](images/banner.png)](https://bosonprotocol.io)

<h1 align="center">Boson Protocol V2</h1>

### [Intro](../README.md) | [Audits](audits.md) | [Setup](setup.md) | [Tasks](tasks.md) | [Architecture](architecture.md) | [Domain Model](domain.md) | [State Machines](state-machines.md) | [Sequences](sequences.md)

# Token-transfer authorization in metatransactions

## Introduction

The protocol's metatransaction flow lets a relayer submit a user-signed call. When that call needs to pull ERC-20 funds, the standard path is `safeTransferFrom`, which requires a prior on-chain `approve` from the user.

The protocol's **token-transfer authorization queue** replaces this with **off-chain signed authorizations**: the user signs once off-chain, the relayer hands the signature(s) to the protocol, and the protocol uses one of several strategies to pull the funds without ever needing a prior allowance:

| Strategy | Token requirement | Mechanism |
| --- | --- | --- |
| **ERC-3009** | Token implements EIP-3009 (e.g. USDC) | Protocol calls `receiveWithAuthorization` on the token. |
| **EIP-2612** | Token implements EIP-2612 permit (e.g. most modern stablecoins, bridged DAI on Optimism / Arbitrum) | Protocol calls `permit` on the token to provision allowance, then `safeTransferFrom`. |
| **Permit2** | Any standard ERC-20 (one-time `approve(PERMIT2, MaxUint)` per token) | Protocol calls Uniswap's universal Permit2 contract, which verifies the signature and pulls funds via `transferFrom`. |
| **DAIPermit** | Token implements the legacy DAI-style `permit` (canonical Maker DAI on Ethereum mainnet and Polygon PoS) | Protocol calls DAI's `permit(holder, spender, nonce, expiry, allowed=true, …)` to grant `MAX_UINT256` allowance, then `safeTransferFrom`. |

A single queue can carry **mixed strategies** — e.g. a buyer's deposit pulled via ERC-3009 and the seller's deposit pulled via Permit2 in the same transaction.

The capability is exposed **only through the metatransaction flow**, via a dedicated entry point `executeMetaTransactionWithTokenTransferAuthorization`. A relayer can submit a single on-chain transaction that:

1. Authorizes a Boson protocol call on the user's behalf (the metatx itself).
2. Pulls the required ERC-20 funds from the user via the per-entry strategy.

The user pays no gas, holds no prior allowance (except the one-time setup for Permit2), and signs everything off-chain.

When the call uses the regular `executeMetaTransaction` (or is invoked directly), `transferFundsIn` continues to use `safeTransferFrom`. Behavior outside the token-transfer-authorization entry point is unchanged.

## Components

| Concern | Location |
| --- | --- |
| New metatx entry point | [`MetaTransactionsHandlerFacet.executeMetaTransactionWithTokenTransferAuthorization`](../contracts/protocol/facets/MetaTransactionsHandlerFacet.sol) |
| Per-entry strategy enum | [`BosonTypes.TokenTransferAuthorizationStrategy`](../contracts/domain/BosonTypes.sol) |
| Authorization queue + strategy dispatch | [`TokenTransferAuthorizationLib`](../contracts/protocol/libs/TokenTransferAuthorizationLib.sol) |
| Strategy switch in fund-pull | [`FundsBase.transferFundsIn`](../contracts/protocol/bases/FundsBase.sol) |
| ERC-3009 token interface | [`IERC3009`](../contracts/interfaces/IERC3009.sol) |
| EIP-2612 token interface | [`IERC2612`](../contracts/interfaces/IERC2612.sol) |
| Permit2 contract interface | [`IPermit2`](../contracts/interfaces/IPermit2.sol) |
| DAI-style permit interface | [`IDAIPermit`](../contracts/interfaces/IDAIPermit.sol) |
| Test mocks | [`MockERC3009Token`](../contracts/mock/MockERC3009Token.sol), [`MockERC2612Token`](../contracts/mock/MockERC2612Token.sol), [`MockPermit2`](../contracts/mock/MockPermit2.sol), [`MockDAIPermitToken`](../contracts/mock/MockDAIPermitToken.sol) |

## End-to-end flow

```
┌─────────┐  signs metatx     ┌─────────┐  submits tx       ┌──────────────┐
│  User   ├──────────────────▶│ Relayer ├──────────────────▶│   Protocol   │
│         │  signs ERC-3009   │         │  payload + queue  │   Diamond    │
└─────────┘  authorization(s) └─────────┘                   └──────┬───────┘
                                                                   │
                                                                   ▼
                                                            executeMetaTx
                                                            With
                                                            TokenTransfer
                                                            Authorization
                                                                   │
                                                  1. validate + verify metatx
                                                  2. park queue in transient slots
                                                  3. dispatch inner protocol call
                                                                   │
                                                                   ▼
                                                            transferFundsIn
                                                                   │
                                                            queue empty?
                                                          ┌────────┴────────┐
                                                          ▼                 ▼
                                                  safeTransferFrom    receiveWithAuthorization
                                                  (default path)      (consumes one queue entry)
```

At transaction end, the EVM clears all transient slots automatically — no leftover state, no risk of cross-tx replay.

## Entry point

```solidity
function executeMetaTransactionWithTokenTransferAuthorization(
    address _userAddress,
    string  calldata _functionName,
    bytes   calldata _functionSignature,
    uint256          _nonce,
    bytes   calldata _signature,
    bytes   calldata _tokenTransferAuthorization     // payload (see below)
) external payable returns (bytes memory);
```

The first five parameters and their EIP-712 signing rules are identical to `executeMetaTransaction`. The new parameter:

- `_tokenTransferAuthorization` — `abi.encode(bytes[] queue)`. The queue is **always** loaded when this entry point is called. If you have nothing to authorize, call `executeMetaTransaction` (without the `WithTokenTransferAuthorization` suffix) instead.

The metatx EIP-712 hash **does not cover** `_tokenTransferAuthorization`. Each per-entry strategy carries its own off-chain signature bound to the token, `from`, `to == protocol`, `value`, a `nonce`, and a validity window — independently authenticated. Including it in the metatx hash would force the user to re-sign overlapping data.

## Authorization payload format

`_tokenTransferAuthorization = abi.encode(bytes[] queue)`. Each queue entry is **self-describing** via a per-entry strategy tag, so a single queue can mix strategies. An entry is one of:

- **Empty bytes (`"0x"`)** — fallback shortcut. The corresponding `transferFundsIn` falls back to `safeTransferFrom` (i.e. the user must have approved the protocol for that specific transfer). Equivalent to `(TokenTransferAuthorizationStrategy.None, "")` but cheaper to encode/store.
- **`abi.encode(TokenTransferAuthorizationStrategy strategy, bytes data)`** — strategy-specific envelope. An out-of-range `strategy` tag is rejected by Solidity's enum range check (`Panic(0x21)`) inside `abi.decode`.

The `data` payload by strategy:

| Strategy | `data` shape | Notes |
| --- | --- | --- |
| `None` | any (ignored) | Same as the empty-bytes shortcut. Use the shortcut when possible. |
| `ERC3009` | `abi.encode(uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)` | Maps onto `IERC3009.receiveWithAuthorization(from, to, value, ...)`. The user signs an EIP-712 `ReceiveWithAuthorization` typed message against the token's domain. |
| `EIP2612` | `abi.encode(uint256 deadline, uint8 v, bytes32 r, bytes32 s)` | Protocol calls `IERC2612.permit(owner, spender, value, deadline, v, r, s)` with `value == _amount` and `spender == protocol`, then follows up with `safeTransferFrom`. The user signs an EIP-712 `Permit` typed message against the token's domain. The token's `nonces(owner)` counter at signing time is implicit in the signature — no need to pass it. |
| `Permit2` | `abi.encode(uint256 nonce, uint256 deadline, bytes signature)` | Protocol calls `Permit2.permitTransferFrom(...)` at the canonical address `0x000000000022D473030F116dDEE9F6B43aC78BA3`. User must have one-time-approved Permit2 on `_token`. The signature is over a `PermitTransferFrom` EIP-712 message bound to token, amount, spender (= protocol), nonce, deadline. |
| `DAIPermit` | `abi.encode(uint256 nonce, uint256 expiry, uint8 v, bytes32 r, bytes32 s)` | Protocol calls `IDAIPermit.permit(holder, spender, nonce, expiry, allowed=true, v, r, s)` with `holder == _from` and `spender == protocol`, then follows up with `safeTransferFrom`. The user signs an EIP-712 `Permit(address holder,address spender,uint256 nonce,uint256 expiry,bool allowed)` typed message against the token's domain, **always with `allowed = true`**. Unlike EIP-2612, DAI's permit nonce is supplied in calldata and must equal `IDAIPermit(token).nonces(holder)` at execution time. `expiry == 0` is the DAI sentinel for "never expires." The permit grants **`MAX_UINT256` allowance** as a side effect; users wanting single-shot semantics should use `Permit2` instead. The protocol skips the on-chain `permit` call only when the allowance already equals `MAX_UINT256` (the exact post-permit state) — so a benign frontrun replaying the same signature is tolerated, while a pre-existing partial allowance does **not** silently swallow the user's signed permit. |

For every strategy, `from`, `to`, `token`, and `value` are deliberately **not** in the per-entry payload. They're derived at consumption time from the metatx caller, the protocol address, the offer's exchange token, and the underlying call's `_amount` respectively. This prevents a malicious relayer from substituting an authorization that doesn't match the actual transfer — the off-chain signature is bound to the same parameters the on-chain call will use.

### Why a queue?

A single metatx can trigger multiple `transferFundsIn` calls. Confirmed cases:

- `createOfferAndCommit` — pulls the offer creator's deposit *and* the committer's payment.
- `commitToPriceDiscoveryOffer` — pulls the seller's portion *and* the buyer's portion.

The queue is consumed in the same order the protocol calls `transferFundsIn`. For seller-created offers, that's `[offerCreator_auth, committer_auth]`; for buyer-created offers, `[buyer_auth, seller_auth]`. Per-entry skipping (empty bytes) lets a single metatx mix ERC-3009 and standard-allowance pulls.

## Queue mechanics (transient storage)

`TokenTransferAuthorizationLib` is a small internal library that stores the queue in transient slots (Cancun's `tstore`/`tload`). The protocol-namespaced slots:

- `keccak256("boson.protocol.transient.token-transfer-auth.head")` — uint256 head pointer (next entry to consume).
- `keccak256("boson.protocol.transient.token-transfer-auth.len")` — uint256 total entries pushed.
- `keccak256(abi.encode("boson.protocol.transient.token-transfer-auth.entry", i))` — base slot for entry `i`. Slot 0 holds the entry's byte length; subsequent slots hold 32-byte words of the bytes payload.

Public surface:

```solidity
function loadQueue(bytes calldata _packed) internal;          // metatx entry point loads once
function consumeForTransfer(                                  // FundsBase.transferFundsIn calls per-pull
    address _token,
    address _from,
    address _to,
    uint256 _amount
) internal returns (bool consumed);
function discardNext() internal;                              // skip sites pop-and-discard
function hasQueue() internal view returns (bool);             // diagnostic
```

`consumeForTransfer` pops the entry, decodes the `(strategy, data)` envelope, and dispatches to a strategy-specific private helper (`_consumeERC3009`, `_consumePermit2`, or `_consumePermit` — which covers both EIP-2612 and DAI-style permits since they share the same "permit then `safeTransferFrom`" shape). Returns `true` when a strategy was consumed and a token call dispatched (caller skips its fallback path) or `false` when the queue is empty/exhausted, the entry is the fallback shortcut, or `strategy == None` (caller falls through to `safeTransferFrom`). An out-of-range strategy tag is rejected by Solidity's enum-range check inside `abi.decode` (`Panic(0x21)`); adding a new strategy means extending the enum *and* the dispatch in lock-step.

`discardNext` advances the queue head by one without doing any work. The protocol calls it at every site where a `transferFundsIn` call is bypassed at runtime (zero amount, `useDepositedFunds=true`, etc.). This keeps the queue head in lock-step with the **logical** transfer position — not the actual one — so the off-chain caller can build a queue whose layout depends only on the function being called, not on runtime amounts or flags. `discardNext` is a no-op when the queue is empty or already exhausted.

## Strategy switch in `transferFundsIn`

```solidity
function transferFundsIn(address _tokenAddress, address _from, uint256 _amount) internal {
    if (_amount > 0) {
        uint256 protocolTokenBalanceBefore = IERC20(_tokenAddress).balanceOf(address(this));

        if (!TokenTransferAuthorizationLib.consumeForTransfer(_tokenAddress, _from, address(this), _amount)) {
            IERC20(_tokenAddress).safeTransferFrom(_from, address(this), _amount);
        }

        uint256 protocolTokenBalanceAfter = IERC20(_tokenAddress).balanceOf(address(this));
        if (protocolTokenBalanceAfter - protocolTokenBalanceBefore != _amount)
            revert BosonErrors.InsufficientValueReceived();
    } else {
        TokenTransferAuthorizationLib.discardNext();
    }
}
```

The post-balance check is preserved on both branches, defending against fee-on-transfer or non-conforming tokens regardless of which path was taken. ERC-3009's `receiveWithAuthorization` also enforces `to == msg.sender` on the token side (so the recipient is always the protocol), which means no extra recipient check is needed in the protocol.

The `else` branch is what makes the queue layout amount-independent: when a caller wires up the queue assuming all transfers will fire, but a runtime amount turns out to be zero, the slot reserved for that transfer is popped and discarded rather than spilling onto the next pull. `createOfferAndCommit` makes a similar `discardNext()` call when `useDepositedFunds=true`, where the offer-creator pull is skipped before `transferFundsIn` would even be called.

## Worked examples

### Quick reference: queue contents per flow

The queue length depends **only on the metatx-callable function**, not on runtime amounts or flags like `useDepositedFunds`. The protocol calls `discardNext()` at every skip site (zero amount, pre-deposited funds), so a slot reserved for a transfer that ends up not firing is silently popped and discarded. This lets a relayer build queues from a static template per function.

`caller_auth(amount)` denotes an ERC-3009 entry signed by the metatx caller for `amount` of the offer's `exchangeToken`. Each `_auth(amount)` shorthand expands to:

```
abi.encode(
  TokenTransferAuthorizationStrategy.ERC3009,
  abi.encode(uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)
)
```

Slots whose pull won't fire at runtime (zero amount, `useDepositedFunds=true`) get `"0x"` and are silently popped/discarded.

| Method | Queue |
| --- | --- |
| `depositFunds(entityId, token, amount)` | `[caller_auth(amount)]` |
| `commitToOffer(buyer, offerId)` | `[buyer_auth(offer.price)]` |
| `commitToConditionalOffer(buyer, offerId, tokenId)` | `[buyer_auth(offer.price)]` |
| `commitToBuyerOffer(offerId, sellerParams)` | `[seller_auth(offer.sellerDeposit)]` |
| `commitToOfferAndRedeemVoucher(offerId)` | `[buyer_auth(offer.price)]` |
| `commitToConditionalOfferAndRedeemVoucher(offerId, tokenId)` | `[buyer_auth(offer.price)]` |
| `createOfferAndCommit(...)` — seller offer | `[seller_auth(sellerDeposit), buyer_auth(price)]` |
| `createOfferAndCommit(...)` — buyer offer | `[buyer_auth(price), seller_auth(sellerDeposit)]` |
| `createOfferCommitAndRedeem(...)` — seller offer only | `[seller_auth(sellerDeposit), buyer_auth(price)]` |
| `commitToPriceDiscoveryOffer(...)` — ask order | `[buyer_auth(priceDiscovery.price), seller_auth(actualPrice)]` |
| `escalateDispute(exchangeId)` | `[buyer_auth(buyerEscalationDeposit)]` |

Notes:

- For any flow above, if a slot's amount is `0` at runtime, or it's the offer-creator slot in `createOfferAndCommit` / `createOfferCommitAndRedeem` with `useDepositedFunds=true`, the protocol discards that slot. Fill it with `"0x"` rather than skipping it entirely.
- A queue entry of `"0x"` for a slot whose pull **will** fire forces the standard-allowance fallback path for that single transfer (the protocol falls through to `safeTransferFrom`). This is how mixed-mode flows are expressed — see the last worked example below.
- For native-currency offers (`exchangeToken == address(0)`), `transferFundsIn` is never called — call `executeMetaTransaction` (without the token-transfer-authorization suffix) instead.
- The commit-and-redeem orchestration variants (`commitToOfferAndRedeemVoucher`, `commitToConditionalOfferAndRedeemVoucher`, `createOfferCommitAndRedeem`) hardcode the buyer to `_msgSender()` — there is no `_committer` parameter, so the metatx caller is always the buyer. `createOfferCommitAndRedeem` only accepts seller-created offers; the buyer-offer queue layout doesn't apply.

### Single transfer (e.g. `depositFunds`)

```js
// Off-chain
const erc3009Data = abi.encode(
  ["uint256", "uint256", "bytes32", "uint8", "bytes32", "bytes32"],
  [validAfter, validBefore, authNonce, v, r, s]
);
const authEntry = abi.encode(
  ["uint8", "bytes"],
  [TokenTransferAuthorizationStrategy.ERC3009, erc3009Data]
);
const queue = abi.encode(["bytes[]"], [[authEntry]]);

// On-chain (via relayer)
metaTransactionsHandler.executeMetaTransactionWithTokenTransferAuthorization(
  user, "depositFunds(uint256,address,uint256)", fnSig, nonce, sig,
  queue
);
```

### Two transfers, both ERC-3009 (e.g. `createOfferAndCommit`, seller offer)

```
queue = [seller_auth_for_sellerDeposit, buyer_auth_for_price]
```

The protocol pops `seller_auth` for the offer-creator pull, then `buyer_auth` for the committer pull.

### Mixed: offer creator uses pre-deposited funds, committer uses ERC-3009

```
queue = ["0x", committer_auth_for_price]
```

When `useDepositedFunds == true`, the offer-creator pull is bypassed and the protocol calls `discardNext()` for the first slot. The committer's slot is consumed on the second `transferFundsIn`. The leading slot stays in the queue (the layout is the same as a "both ERC-3009" call); it's just popped and ignored.

### Mixed: seller uses standard allowance, buyer uses ERC-3009

```
queue = ["0x", buyer_auth_for_price]
```

The leading empty entry is the fallback marker for the seller's pull (which **does** fire) → `transferFundsIn` falls back to `safeTransferFrom` (seller must have approved beforehand). The buyer's entry is consumed for the second pull.

(Same shape as the previous example, different runtime semantics: the slot is consumed-as-fallback rather than discarded. The queue layout is identical — that's the point of the uniform-queue model.)

## Replay safety

| Strategy | Single-use enforcement |
| --- | --- |
| ERC-3009 | Each entry carries a `bytes32 nonce` consumed by the token's `authorizationState[from][nonce]` map. The token reverts on replay. |
| EIP-2612 | The token's `nonces(owner)` counter auto-increments on each successful `permit`. Replaying the same signature reverts because the recovered owner won't match. The protocol calls `permit` only when the on-chain allowance doesn't already equal `_amount` — this tolerates a benign frontrun where someone replays *this* permit before us (allowance == `_amount`, skip the redundant call) but rejects diversion attempts where a *different* permit signed by the same user has set a non-matching allowance. |
| Permit2 | Permit2 maintains a 256-bit-bitmap nonce per owner. The user picks any unused nonce; Permit2 reverts on replay (`InvalidNonce`). |
| DAIPermit | The token's per-holder `nonces` counter is supplied in calldata and must match `nonces(holder)` at execution time; on success the token increments it. Replay reverts with `InvalidNonce`. The protocol skips the `permit` call only when the existing allowance equals `MAX_UINT256` — the exact post-permit state — tolerating a benign frontrun (allowance is already `MAX_UINT256`, so we transfer directly) while still consuming the user's signed permit when a pre-existing partial allowance is in place. A malicious frontrun that burned the nonce on a *different* signature reverts the on-chain `permit` and the whole metatx. |

In addition, the outer metatx is nonce-tracked the same as `executeMetaTransaction` (re-submission of the same `(userAddress, nonce)` reverts with `NonceUsedAlready`), and queue entries are popped on consumption — `head` advances. A second `transferFundsIn` in the same metatx cannot reuse a popped entry; it gets the next one (or falls back to `safeTransferFrom` if the queue is exhausted).

## Adding a new strategy (recipe)

For another off-chain pull strategy in the future:

1. **Add the enum value** to [`BosonTypes.TokenTransferAuthorizationStrategy`](../contracts/domain/BosonTypes.sol). Append at the end so existing tag values stay stable.
2. **Add a private helper** in [`TokenTransferAuthorizationLib`](../contracts/protocol/libs/TokenTransferAuthorizationLib.sol) (`_consumeXyz`) that decodes the strategy-specific `data` bytes and performs the pull. For two-step strategies (e.g. permit + transferFrom), the helper does both steps inline.
3. **Add a branch** in `consumeForTransfer` that dispatches on the new tag and calls the helper.
4. **Add an interface** in `contracts/interfaces/` if the strategy talks to an external contract.
5. **Update the table** in "Authorization payload format" above with the new `data` shape.
6. **Add tests** that build a queue with the new strategy and exercise both happy and revert paths.

The wrapper format (`abi.encode(strategy, bytes)`) doesn't change — only the strategy-specific `data` payload.

## Compiler / EVM requirements

Transient storage opcodes (`TSTORE`/`TLOAD`) require the Cancun EVM and Solidity ≥ 0.8.24. The repo is pinned at:

- `pragma solidity 0.8.35;`
- `evmVersion: "cancun"` (in [`hardhat.config.js`](../hardhat.config.js))

Boson's deployment targets (Ethereum, Polygon, Optimism, Arbitrum, Base) are all post-Dencun and support Cancun. They also all have Uniswap's Permit2 deployed at the canonical `0x000000000022D473030F116dDEE9F6B43aC78BA3`. For local Hardhat testing, [`MetaTransactionsPermitStrategiesTest.js`](../test/protocol/MetaTransactionsPermitStrategiesTest.js) injects [`MockPermit2`](../contracts/mock/MockPermit2.sol) at that address via `hardhat_setCode`.

## Tests

- [`test/protocol/MetaTransactionsERC3009Test.js`](../test/protocol/MetaTransactionsERC3009Test.js) — focused unit tests for the ERC-3009 strategy + fallback semantics (5 tests).
- [`test/protocol/MetaTransactionsPermitStrategiesTest.js`](../test/protocol/MetaTransactionsPermitStrategiesTest.js) — focused unit tests for the EIP-2612 + Permit2 strategies (6 tests).
- [`test/protocol/MetaTransactionsDAIPermitTest.js`](../test/protocol/MetaTransactionsDAIPermitTest.js) — focused unit tests for the DAI-style permit strategy (6 tests: happy path, `expiry==0` sentinel, wrong signer, expired permit, benign frontrun tolerance, malicious frontrun rejection).
- [`test/protocol/ExchangeHandlerCommitWithAuthorizationTest.js`](../test/protocol/ExchangeHandlerCommitWithAuthorizationTest.js) — `commitToOffer` and `createOfferAndCommit` flows mirroring the originals from `ExchangeHandlerTest.js` (49 tests).
- [`test/protocol/BuyerInitiatedOfferSellerCommitsWithAuthorizationTest.js`](../test/protocol/BuyerInitiatedOfferSellerCommitsWithAuthorizationTest.js) — seller-side `commitToBuyerOffer` flow mirroring `BuyerInitiatedOfferTest.js` (10 tests).

Run them all together:

```sh
npx hardhat test \
  test/protocol/MetaTransactionsERC3009Test.js \
  test/protocol/MetaTransactionsPermitStrategiesTest.js \
  test/protocol/MetaTransactionsDAIPermitTest.js \
  test/protocol/ExchangeHandlerCommitWithAuthorizationTest.js \
  test/protocol/BuyerInitiatedOfferSellerCommitsWithAuthorizationTest.js
```
