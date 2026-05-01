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
    AuthorizationType _authorizationType,   // None | ERC3009
    bytes   calldata _authorization         // payload (see below)
) external payable returns (bytes memory);
```

The first five parameters and their EIP-712 signing rules are identical to `executeMetaTransaction`. Two new parameters control the token-side authorization:

- `_authorizationType` — `None` keeps the legacy behavior (still uses `safeTransferFrom` for any ERC-20 pull). `ERC3009` activates the queue.
- `_authorization` — opaque bytes interpreted only when `_authorizationType != None`.

The metatx EIP-712 hash **does not cover** these two parameters. Each ERC-3009 entry inside the queue is itself an EIP-712 payload independently authenticated by the token (bound to `from`, `to == protocol`, `value`, `nonce`, validity window). Including it in the metatx hash would force the user to re-sign overlapping data.

## Authorization payload format

When `_authorizationType == ERC3009`, the payload is `abi.encode(bytes[] queue)`. Each queue entry is one of:

- **Empty bytes (`"0x"`)** — fallback marker. The corresponding `transferFundsIn` falls back to `safeTransferFrom` (i.e. the user must have approved the protocol for that specific transfer).
- **Encoded ERC-3009 fields** — `abi.encode(uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)`.

`from`, `to`, and `value` are deliberately **not** in the per-entry payload. They're derived at consumption time from the metatx caller, the protocol address, and the underlying call's `_amount` respectively. This prevents a malicious relayer from substituting an authorization that doesn't match the actual transfer.

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
function hasQueue() internal view returns (bool);             // diagnostic
```

`consumeForTransfer` does the queue pop, decodes the entry, and dispatches `IERC3009.receiveWithAuthorization`. Returns `true` when a real authorization was consumed (caller skips its fallback path) or `false` when the queue is empty/exhausted/holding a fallback marker (caller falls through to `safeTransferFrom`).

The queue head **does not advance** for transfers where `_amount == 0` (because `transferFundsIn` short-circuits on amount-zero before touching the queue). When constructing the queue off-chain, only include entries for transfers that will actually fire.

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
    }
}
```

The post-balance check is preserved on both branches, defending against fee-on-transfer or non-conforming tokens regardless of which path was taken. ERC-3009's `receiveWithAuthorization` also enforces `to == msg.sender` on the token side (so the recipient is always the protocol), which means no extra recipient check is needed in the protocol.

## Worked examples

### Single transfer (e.g. `depositFunds`)

```js
// Off-chain
const authEntry = abi.encode(
  ["uint256", "uint256", "bytes32", "uint8", "bytes32", "bytes32"],
  [validAfter, validBefore, authNonce, v, r, s]
);
const queue = abi.encode(["bytes[]"], [[authEntry]]);

// On-chain (via relayer)
metaTransactionsHandler.executeMetaTransactionWithAuthorization(
  user, "depositFunds(uint256,address,uint256)", fnSig, nonce, sig,
  AuthorizationType.ERC3009, queue
);
```

### Two transfers, both ERC-3009 (e.g. `createOfferAndCommit`, seller offer)

```
queue = [seller_auth_for_sellerDeposit, buyer_auth_for_price]
```

The protocol pops `seller_auth` for the offer-creator pull, then `buyer_auth` for the committer pull.

### Mixed: offer creator uses pre-deposited funds, committer uses ERC-3009

```
queue = [committer_auth_for_price]
```

When `useDepositedFunds == true`, the offer-creator pull is skipped entirely — no entry is needed for it. The single committer entry is at index 0 and gets popped on the first (and only) `transferFundsIn`.

### Mixed: seller uses standard allowance, buyer uses ERC-3009

```
queue = ["0x", buyer_auth_for_price]
```

The leading empty entry is the fallback marker for the seller's pull → `transferFundsIn` falls back to `safeTransferFrom` (seller must have approved beforehand). The buyer's entry is consumed for the second pull.

## Replay safety

- **Outer metatx**: nonce-tracked the same as `executeMetaTransaction`. Re-submission of the same `(userAddress, nonce)` reverts with `NonceUsedAlready`.
- **Per-entry ERC-3009**: each entry carries a `nonce` enforced by the token contract; once consumed, the token's `authorizationState[from][nonce]` is set, so a replay of the same authorization on-chain reverts on the token side.
- **Single-use within a tx**: queue entries are popped on consumption — `head` advances. A second `transferFundsIn` in the same metatx cannot reuse a popped entry; it gets the next one (or falls back to `safeTransferFrom` if the queue is exhausted).

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
