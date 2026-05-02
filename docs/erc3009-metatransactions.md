[![banner](images/banner.png)](https://bosonprotocol.io)

<h1 align="center">Boson Protocol V2</h1>

### [Intro](../README.md) | [Audits](audits.md) | [Setup](setup.md) | [Tasks](tasks.md) | [Architecture](architecture.md) | [Domain Model](domain.md) | [State Machines](state-machines.md) | [Sequences](sequences.md)

# ERC-3009 authorization in metatransactions

## Introduction

[ERC-3009](https://eips.ethereum.org/EIPS/eip-3009) ("Transfer With Authorization") lets a token holder authorize a single transfer with an off-chain signature. Tokens like USDC implement it. The protocol can pull funds via `receiveWithAuthorization` instead of the usual `safeTransferFrom`, which avoids the need for a prior `approve` transaction.

The protocol exposes this capability **only through the metatransaction flow**, via a dedicated entry point `executeMetaTransactionWithAuthorization`. A relayer can submit a single on-chain transaction that:

1. Authorizes a Boson protocol call on the user's behalf (the metatx itself).
2. Pulls the required ERC-20 funds from the user via `receiveWithAuthorization`.

The user pays no gas, holds no prior allowance, and signs everything off-chain.

When the call uses the regular `executeMetaTransaction` (or is invoked directly), `transferFundsIn` continues to use `safeTransferFrom`. Behavior outside the metatx-with-authorization entry point is unchanged.

## Components

| Concern | Location |
| --- | --- |
| New metatx entry point | [`MetaTransactionsHandlerFacet.executeMetaTransactionWithAuthorization`](../contracts/protocol/facets/MetaTransactionsHandlerFacet.sol) |
| `AuthorizationType` enum | [`BosonTypes.AuthorizationType`](../contracts/domain/BosonTypes.sol) |
| Authorization queue (transient storage) | [`TransientAuthLib`](../contracts/protocol/libs/TransientAuthLib.sol) |
| Strategy switch in fund-pull | [`FundsBase.transferFundsIn`](../contracts/protocol/bases/FundsBase.sol) |
| Token-side interface | [`IERC3009`](../contracts/interfaces/IERC3009.sol) |
| Test mock | [`MockERC3009Token`](../contracts/mock/MockERC3009Token.sol) |

## End-to-end flow

```
┌─────────┐  signs metatx     ┌─────────┐  submits tx       ┌──────────────┐
│  User   ├──────────────────▶│ Relayer ├──────────────────▶│   Protocol   │
│         │  signs ERC-3009   │         │  payload + queue  │   Diamond    │
└─────────┘  authorization(s) └─────────┘                   └──────┬───────┘
                                                                   │
                                                                   ▼
                                                            executeMetaTx
                                                            WithAuthorization
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
function executeMetaTransactionWithAuthorization(
    address _userAddress,
    string  calldata _functionName,
    bytes   calldata _functionSignature,
    uint256          _nonce,
    bytes   calldata _signature,
    bytes   calldata _authorization         // payload (see below)
) external payable returns (bytes memory);
```

The first five parameters and their EIP-712 signing rules are identical to `executeMetaTransaction`. The new parameter:

- `_authorization` — `abi.encode(bytes[] queue)`. The queue is **always** loaded when this entry point is called. If you have nothing to authorize, call `executeMetaTransaction` (without the `WithAuthorization` suffix) instead.

The metatx EIP-712 hash **does not cover** `_authorization`. Each per-entry strategy carries its own off-chain signature bound to the token, `from`, `to == protocol`, `value`, a `nonce`, and a validity window — independently authenticated. Including it in the metatx hash would force the user to re-sign overlapping data.

## Authorization payload format

`_authorization = abi.encode(bytes[] queue)`. Each queue entry is **self-describing** via a per-entry strategy tag, so a single queue can mix strategies (ERC-3009 today, Permit2 / EIP-2612 in the future). An entry is one of:

- **Empty bytes (`"0x"`)** — fallback shortcut. The corresponding `transferFundsIn` falls back to `safeTransferFrom` (i.e. the user must have approved the protocol for that specific transfer). Equivalent to `(AuthorizationStrategy.None, "")` but cheaper to encode/store.
- **`abi.encode(AuthorizationStrategy strategy, bytes data)`** — strategy-specific envelope. Today only `strategy == ERC3009` is implemented, with `data = abi.encode(uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)`. An unknown `strategy` tag reverts with `BosonErrors.UnsupportedAuthorizationStrategy`.

For the ERC-3009 strategy, `from`, `to`, and `value` are deliberately **not** in the per-entry payload. They're derived at consumption time from the metatx caller, the protocol address, and the underlying call's `_amount` respectively. This prevents a malicious relayer from substituting an authorization that doesn't match the actual transfer.

### Why a queue?

A single metatx can trigger multiple `transferFundsIn` calls. Confirmed cases:

- `createOfferAndCommit` — pulls the offer creator's deposit *and* the committer's payment.
- `commitToPriceDiscoveryOffer` — pulls the seller's portion *and* the buyer's portion.

The queue is consumed in the same order the protocol calls `transferFundsIn`. For seller-created offers, that's `[offerCreator_auth, committer_auth]`; for buyer-created offers, `[buyer_auth, seller_auth]`. Per-entry skipping (empty bytes) lets a single metatx mix ERC-3009 and standard-allowance pulls.

## Queue mechanics (transient storage)

`TransientAuthLib` is a small internal library that stores the queue in transient slots (Cancun's `tstore`/`tload`). The protocol-namespaced slots:

- `keccak256("boson.protocol.transient.auth.head")` — uint256 head pointer (next entry to consume).
- `keccak256("boson.protocol.transient.auth.len")` — uint256 total entries pushed.
- `keccak256(abi.encode("boson.protocol.transient.auth.entry", i))` — base slot for entry `i`. Slot 0 holds the entry's byte length; subsequent slots hold 32-byte words of the bytes payload.

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

`consumeForTransfer` pops the entry, decodes the `(strategy, data)` envelope, and dispatches to a strategy-specific private helper (`_consumeERC3009` today). Returns `true` when a strategy was consumed and a token call dispatched (caller skips its fallback path) or `false` when the queue is empty/exhausted, the entry is the fallback shortcut, or `strategy == None` (caller falls through to `safeTransferFrom`). An unknown strategy reverts with `BosonErrors.UnsupportedAuthorizationStrategy`.

`discardNext` advances the queue head by one without doing any work. The protocol calls it at every site where a `transferFundsIn` call is bypassed at runtime (zero amount, `useDepositedFunds=true`, etc.). This keeps the queue head in lock-step with the **logical** transfer position — not the actual one — so the off-chain caller can build a queue whose layout depends only on the function being called, not on runtime amounts or flags. `discardNext` is a no-op when the queue is empty or already exhausted.

## Strategy switch in `transferFundsIn`

```solidity
function transferFundsIn(address _tokenAddress, address _from, uint256 _amount) internal {
    if (_amount > 0) {
        uint256 protocolTokenBalanceBefore = IERC20(_tokenAddress).balanceOf(address(this));

        if (!TransientAuthLib.consumeForTransfer(_tokenAddress, _from, address(this), _amount)) {
            IERC20(_tokenAddress).safeTransferFrom(_from, address(this), _amount);
        }

        uint256 protocolTokenBalanceAfter = IERC20(_tokenAddress).balanceOf(address(this));
        if (protocolTokenBalanceAfter - protocolTokenBalanceBefore != _amount)
            revert BosonErrors.InsufficientValueReceived();
    } else {
        TransientAuthLib.discardNext();
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
  AuthorizationStrategy.ERC3009,
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
| `createOfferAndCommit(...)` — seller offer | `[seller_auth(sellerDeposit), buyer_auth(price)]` |
| `createOfferAndCommit(...)` — buyer offer | `[buyer_auth(price), seller_auth(sellerDeposit)]` |
| `commitToPriceDiscoveryOffer(...)` — ask order | `[buyer_auth(priceDiscovery.price), seller_auth(actualPrice)]` |
| `escalateDispute(exchangeId)` | `[buyer_auth(buyerEscalationDeposit)]` |

Notes:

- For any flow above, if a slot's amount is `0` at runtime, or it's the offer-creator slot in `createOfferAndCommit` with `useDepositedFunds=true`, the protocol discards that slot. Fill it with `"0x"` rather than skipping it entirely.
- A queue entry of `"0x"` for a slot whose pull **will** fire forces the standard-allowance fallback path for that single transfer (the protocol falls through to `safeTransferFrom`). This is how mixed-mode flows are expressed — see the last worked example below.
- For native-currency offers (`exchangeToken == address(0)`), `transferFundsIn` is never called — pass `AuthorizationType.None` instead of an empty queue.

### Single transfer (e.g. `depositFunds`)

```js
// Off-chain
const erc3009Data = abi.encode(
  ["uint256", "uint256", "bytes32", "uint8", "bytes32", "bytes32"],
  [validAfter, validBefore, authNonce, v, r, s]
);
const authEntry = abi.encode(
  ["uint8", "bytes"],
  [AuthorizationStrategy.ERC3009, erc3009Data]
);
const queue = abi.encode(["bytes[]"], [[authEntry]]);

// On-chain (via relayer)
metaTransactionsHandler.executeMetaTransactionWithAuthorization(
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

- **Outer metatx**: nonce-tracked the same as `executeMetaTransaction`. Re-submission of the same `(userAddress, nonce)` reverts with `NonceUsedAlready`.
- **Per-entry ERC-3009**: each entry carries a `nonce` enforced by the token contract; once consumed, the token's `authorizationState[from][nonce]` is set, so a replay of the same authorization on-chain reverts on the token side.
- **Single-use within a tx**: queue entries are popped on consumption — `head` advances. A second `transferFundsIn` in the same metatx cannot reuse a popped entry; it gets the next one (or falls back to `safeTransferFrom` if the queue is exhausted).

## Adding a new strategy (recipe)

Once the protocol gains another off-chain pull strategy (Permit2, EIP-2612 permit, etc.), the wiring is small:

1. **Add the enum value** to [`BosonTypes.AuthorizationStrategy`](../contracts/domain/BosonTypes.sol). Append at the end so existing tag values stay stable.
2. **Add a private helper** in [`TransientAuthLib`](../contracts/protocol/libs/TransientAuthLib.sol) (`_consumePermit2`, `_consumeEIP2612`, etc.) that decodes the strategy-specific `data` bytes and performs the pull. For two-step strategies like EIP-2612 (permit + transferFrom), the helper does both steps inline.
3. **Add a branch** in `consumeForTransfer` that dispatches on the new tag and calls the helper.
4. **Update the table** in this doc with one row per affected method, plus add the new strategy to the "Quick reference" shorthand expansion.
5. **Add tests** that build a queue with the new strategy and exercise the consumed-vs-discarded paths.

The wrapper format (`abi.encode(strategy, bytes)`) doesn't change — only the strategy-specific `data` payload.

## Compiler / EVM requirements

Transient storage opcodes (`TSTORE`/`TLOAD`) require the Cancun EVM and Solidity ≥ 0.8.24. The repo is pinned at:

- `pragma solidity 0.8.34;`
- `evmVersion: "cancun"` (in [`hardhat.config.js`](../hardhat.config.js))

Boson's deployment targets (Ethereum, Polygon, Optimism, Arbitrum, Base) are all post-Dencun and support Cancun.

## Tests

- [`test/protocol/MetaTransactionsERC3009Test.js`](../test/protocol/MetaTransactionsERC3009Test.js) — focused unit tests for the entry point and fallback semantics (5 tests).
- [`test/protocol/ExchangeHandlerCommitWithAuthorizationTest.js`](../test/protocol/ExchangeHandlerCommitWithAuthorizationTest.js) — `commitToOffer` and `createOfferAndCommit` flows mirroring the originals from `ExchangeHandlerTest.js` (49 tests).
- [`test/protocol/BuyerInitiatedOfferSellerCommitsWithAuthorizationTest.js`](../test/protocol/BuyerInitiatedOfferSellerCommitsWithAuthorizationTest.js) — seller-side `commitToBuyerOffer` flow mirroring `BuyerInitiatedOfferTest.js` (10 tests).

Run them all together:

```sh
npx hardhat test \
  test/protocol/MetaTransactionsERC3009Test.js \
  test/protocol/ExchangeHandlerCommitWithAuthorizationTest.js \
  test/protocol/BuyerInitiatedOfferSellerCommitsWithAuthorizationTest.js
```
