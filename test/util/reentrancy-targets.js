/**
 * Reentrancy target enumeration helper.
 *
 * Builds the table of TO targets (state-modifying entry points reachable on
 * the diamond) that the reentrancy matrix test attempts to re-enter, by
 * inspecting every facet artifact under `contracts/protocol/facets/`. For
 * each facet we load its compiled artifact ABI and pick every state-modifying
 * function (stateMutability is `nonpayable` or `payable`) EXCEPT those
 * explicitly allowed to be re-entered (see `REENTRY_ALLOWED_NAMES` /
 * `REENTRY_ALLOWED_PATTERNS` below).
 *
 * The artifact ABI is the right source of truth here: Solidity emits every
 * function callable from outside the contract — including those INHERITED
 * from base contracts — with full stateMutability metadata. The matrix would
 * silently lose coverage of any inherited external/public state-modifying
 * function if we walked the facet's own AST nodes instead.
 *
 * Rationale: the matrix is a regression guard. If we only tested functions
 * that already carry `nonReentrant`, the test would silently lose coverage
 * the moment a developer drops the modifier. By testing every state-modifying
 * function and explicitly enumerating the ones meant to allow re-entry, an
 * accidental loss of protection — modifier removed, new function added without
 * a guard, internal delegate exposed — fails the test fast.
 *
 * Functions reachable on the diamond split into:
 *   - those carrying `nonReentrant` directly → guard fires from the modifier;
 *   - those that delegate to another `nonReentrant` function (e.g. orchestration
 *     `*Preminted*` wrappers, batch variants like `completeExchangeBatch` /
 *     `expireDisputeBatch`) → guard fires from the inner call;
 *   - `executeMetaTransaction[WithTokenTransferAuthorization]` → guard fires
 *     from a manual `reentrancyStatus == ENTERED` check inside `_executeMetaTx`
 *     (the modifier can't be used because the meta-tx itself needs to set the
 *     entered status on the inner call).
 *
 * All three patterns block re-entry — the matrix asserts that uniformly.
 *
 * Some orchestration wrappers (`createSellerAnd*With…`) call
 * `createSellerInternal` BEFORE delegating to their inner nonReentrant
 * function. `createSellerInternal` checks `_seller.assistant == _msgSender()`
 * and `_seller.admin == _msgSender()` before any storage writes, so zero-arg
 * calldata reverts at the assistant/admin check long before the inner guard
 * fires — yielding a false-positive "blocked" signal that would NOT detect
 * a regression where the inner delegate's `nonReentrant` is removed (or the
 * delegate is replaced with an unguarded call).
 *
 * To close that hole, those wrappers are listed in
 * `ATTACKER_DEPENDENT_OVERRIDES`. The matrix test calls
 * `rebuildCalldataForAttacker(target, attackerAddress)` at run time to swap
 * `_seller.assistant`, `_seller.admin`, `_seller.treasury`, and
 * `_seller.active` to values that pass `createSellerInternal`'s checks for
 * the specific malicious contract acting as caller in the current FROM block.
 * `createSellerInternal` then succeeds, the wrapper proceeds to call the
 * inner `nonReentrant` function, and the guard fires for real.
 */

const fs = require("fs");
const path = require("path");
const { ZeroAddress, Interface } = require("ethers");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const FACETS_ARTIFACT_DIR = path.join(REPO_ROOT, "artifacts", "contracts", "protocol", "facets");

/**
 * Function names that are EXPLICITLY allowed to be re-entered, and therefore
 * excluded from the reentrancy matrix.
 *
 * The matrix tests every other state-modifying external/public function. Any
 * function added here must have a deliberate, documented reason for skipping
 * the protocol-wide reentrancy guard.
 *
 * Currently the only intentional exception is the voucher transfer callback
 * pair — these are invoked by the protocol's own Boson Voucher mid-flow while
 * the guard is already engaged, so they MUST be allowed to execute under
 * `ENTERED` status.
 */
const REENTRY_ALLOWED_NAMES = new Set(["onVoucherTransferred", "onPremintedVoucherTransferred"]);

/**
 * Function-name patterns that are EXPLICITLY allowed to be re-entered.
 *
 * Initializers (`initialize`, `initV2_4_0External`, `initV2_2_0`, ...) are
 * one-shot bootstrap entry points guarded by `onlyUninitialized` / version
 * checks rather than `nonReentrant`. They run during deploy/upgrade flows
 * where no re-entry is possible, and adding the modifier would either be
 * redundant or interfere with the initialization sequence. We match them by
 * name so a developer adding a new `initV*` upgrade init doesn't need to
 * update this file.
 */
const REENTRY_ALLOWED_PATTERNS = [/^initialize$/, /^init[A-Z]/];

function isReentryAllowed(name) {
  if (REENTRY_ALLOWED_NAMES.has(name)) return true;
  return REENTRY_ALLOWED_PATTERNS.some((re) => re.test(name));
}

/**
 * A non-zero placeholder for `_seller.treasury` when rebuilding calldata for
 * an attacker-dependent target. `createSellerInternal` only checks the
 * treasury is non-zero, so any harmless address works — using a recognisable
 * sentinel keeps debugging easy (it shows up clearly in transaction traces).
 */
const NONZERO_TREASURY_PLACEHOLDER = "0x000000000000000000000000000000000000bEEF";

/**
 * Functions whose ARGUMENTS depend on the attacker contract's address, and
 * therefore can't be encoded once at module-load time. These wrappers call
 * `createSellerInternal()` before delegating to their inner `nonReentrant`
 * function — and `createSellerInternal()` enforces
 * `_seller.assistant == _msgSender()` AND `_seller.admin == _msgSender()`
 * (when no auth token is supplied) before any storage writes. Zero-valued
 * seller fields revert at those checks long before the inner guard fires.
 *
 * Each entry's value describes which positional argument is the `Seller`
 * tuple. At test runtime, `rebuildCalldataForAttacker(target, attackerAddr)`
 * deep-clones the cached args, overrides `_seller.assistant`, `_seller.admin`,
 * `_seller.treasury`, and `_seller.active` so `createSellerInternal` succeeds
 * for the specific malicious contract acting as caller, and re-encodes.
 * The wrapper then proceeds to the inner `nonReentrant` call, which fires
 * the guard for real.
 *
 * If a developer adds a NEW wrapper following this pattern, the matrix test
 * will fail for it (the zero-arg createSellerInternal revert is not
 * `ReentrancyGuard()`), forcing them to add an entry here.
 */
const ATTACKER_DEPENDENT_OVERRIDES = new Map([
  ["createSellerAndOfferWithCondition", { sellerArgIndex: 0 }],
  ["createSellerAndOfferAndTwinWithBundle", { sellerArgIndex: 0 }],
  ["createSellerAndOfferWithConditionAndTwinAndBundle", { sellerArgIndex: 0 }],
  ["createSellerAndPremintedOfferWithCondition", { sellerArgIndex: 0 }],
  ["createSellerAndPremintedOfferAndTwinWithBundle", { sellerArgIndex: 0 }],
  ["createSellerAndPremintedOfferWithConditionAndTwinAndBundle", { sellerArgIndex: 0 }],
]);

/**
 * Decide whether a facet ABI entry is a reentrancy-matrix target.
 *
 * Note we deliberately do NOT filter on "has the `nonReentrant` modifier" —
 * the matrix is a regression guard whose value comes precisely from catching
 * a developer who forgets the modifier on a new state-modifying function. The
 * test asserts re-entry is blocked by SOME mechanism (direct modifier,
 * delegation to an inner `nonReentrant` function, or a manual
 * `reentrancyStatus == ENTERED` check), so an unguarded function shows up as
 * a failure rather than silently disappearing from the matrix.
 */
function isMatrixTarget(abiItem) {
  if (abiItem.type !== "function") return false;
  if (abiItem.stateMutability === "view" || abiItem.stateMutability === "pure") return false;
  if (isReentryAllowed(abiItem.name)) return false;
  return true;
}

/**
 * Build a zero-value placeholder for any solidity ABI type.
 *
 * The protocol's reentrancy guard fires before any input validation for
 * functions that carry the `nonReentrant` modifier directly, so we can safely
 * pass all-zero arguments — the guard will revert before any meaningful
 * decode of the body. The few functions that hit a role check, region pause
 * check, or function-selector allowlist BEFORE the nonReentrant modifier are
 * handled at test runtime (the malicious contract is granted the relevant
 * roles in test setup).
 *
 * Dynamic arrays default to a SINGLE zero-element rather than an empty array.
 * Empty arrays would silently no-op batch entry points like
 * `completeExchangeBatch` / `expireDisputeBatch` — the loop body would never
 * execute and the inner `nonReentrant` call would never fire. A single-element
 * array forces one iteration, which is enough to trigger the inner guard.
 * This doesn't affect functions that carry `nonReentrant` at entry, since the
 * guard fires before the array is touched.
 */
function zeroValueFor(input) {
  const t = input.type;
  // For arrays (dynamic or fixed) we must build a placeholder for the element
  // type. ethers v6 ParamType exposes the element ParamType under
  // `arrayChildren` and leaves `components` null on the array node itself;
  // raw ABI JSON instead keeps `arrayChildren` undefined and stashes the
  // tuple-element fields under `components` directly. Support both.
  if (t.endsWith("[]")) {
    const baseInput = input.arrayChildren || { ...input, type: t.slice(0, -2), components: input.components };
    return [zeroValueFor(baseInput)];
  }
  const fixedArr = t.match(/^(.+)\[(\d+)\]$/);
  if (fixedArr) {
    const baseInput = input.arrayChildren || { ...input, type: fixedArr[1], components: input.components };
    const n = parseInt(fixedArr[2], 10);
    return Array.from({ length: n }, () => zeroValueFor(baseInput));
  }
  if (t === "tuple") {
    const out = {};
    for (const c of input.components || []) {
      out[c.name] = zeroValueFor(c);
    }
    return out;
  }
  if (t === "address" || t === "address payable") return ZeroAddress;
  if (t === "bool") return false;
  if (t === "string") return "";
  if (t.startsWith("bytes")) {
    if (t === "bytes") return "0x";
    // bytesN
    const n = parseInt(t.slice(5), 10);
    return "0x" + "00".repeat(n);
  }
  if (t.startsWith("uint") || t.startsWith("int")) return 0n;
  // Fallback — treat unknown as zero address
  return ZeroAddress;
}

/**
 * Enumerate every reentrancy-matrix TO target across all facets in
 * `contracts/protocol/facets/`. Each entry:
 * `{ name, facet, calldata, selector, args, attackerDependent }`.
 *
 * The matrix includes every `external`/`public`, state-modifying function on
 * every facet, MINUS the explicit allow-list in `isReentryAllowed`. That gives
 * us a regression guard: a new state-modifying function added to any facet is
 * automatically in scope, and the test fails until re-entry into it is blocked.
 *
 * Calldata is encoded from the function's own facet ABI, with every argument
 * filled in via `zeroValueFor`. Duplicates (same selector across multiple
 * facets) are deduped — keeping the first occurrence.
 *
 * `args` is the cached argument array used to build the initial calldata; it
 * is retained so attacker-dependent targets (those listed in
 * `ATTACKER_DEPENDENT_OVERRIDES`) can have their seller-struct fields rewritten
 * at run time via `rebuildCalldataForAttacker`.
 *
 * @returns {Array<{ name: string, facet: string, calldata: string, selector: string, args: any[], attackerDependent: boolean, error?: string }>}
 */
function buildReentrancyTargets() {
  if (!fs.existsSync(FACETS_ARTIFACT_DIR)) {
    throw new Error(
      `Facet artifacts not found at ${FACETS_ARTIFACT_DIR}. Run \`npx hardhat compile\` before invoking buildReentrancyTargets.`
    );
  }

  const facetDirs = fs
    .readdirSync(FACETS_ARTIFACT_DIR)
    .filter((d) => d.endsWith(".sol"))
    .sort();

  const out = [];
  const seenSelectors = new Set();

  for (const fdir of facetDirs) {
    const facetName = fdir.replace(/\.sol$/, "");
    const artifactPath = path.join(FACETS_ARTIFACT_DIR, fdir, `${facetName}.json`);
    if (!fs.existsSync(artifactPath)) continue;

    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const iface = new Interface(artifact.abi);

    for (const abiItem of artifact.abi) {
      if (!isMatrixTarget(abiItem)) continue;
      const frag = iface.getFunction(abiItem.name);
      if (!frag) continue;
      if (seenSelectors.has(frag.selector)) continue;
      seenSelectors.add(frag.selector);

      const args = frag.inputs.map((input) => zeroValueFor(input));
      let calldata = null;
      let error = null;
      try {
        calldata = iface.encodeFunctionData(frag.name, args);
      } catch (e) {
        error = e.message;
      }
      out.push({
        name: frag.name,
        facet: facetName,
        calldata,
        selector: frag.selector,
        error,
        args,
        attackerDependent: ATTACKER_DEPENDENT_OVERRIDES.has(frag.name),
      });
    }
  }

  return out;
}

/**
 * Memoised combined interface used for re-encoding attacker-dependent
 * targets. The combined interface deduplicates by signature, so any function
 * present in `ATTACKER_DEPENDENT_OVERRIDES` is guaranteed to encode here.
 */
let _combinedIfaceCache = null;
function _getCombinedInterface() {
  if (_combinedIfaceCache === null) _combinedIfaceCache = buildCombinedInterface();
  return _combinedIfaceCache;
}

/**
 * Deep-clone an args array produced by `zeroValueFor`. Values are restricted
 * to plain JS primitives (including bigints), arrays, and objects — no class
 * instances — so a manual recursive copy is both sufficient and faster than
 * `structuredClone` (which we avoid here for compatibility).
 */
function _deepCloneArgs(val) {
  if (typeof val !== "object" || val === null) return val;
  if (Array.isArray(val)) return val.map(_deepCloneArgs);
  const out = {};
  for (const k of Object.keys(val)) out[k] = _deepCloneArgs(val[k]);
  return out;
}

/**
 * Rebuild calldata for an attacker-dependent target, using the malicious
 * contract's actual address for the seller-struct fields that
 * `createSellerInternal` checks against `_msgSender()`.
 *
 * For targets without an override entry, returns the cached calldata
 * unchanged so callers can use this helper uniformly.
 *
 * Treasury is set to a non-zero placeholder (`createSellerInternal` only
 * checks non-zero). `_seller.active = true` satisfies the `MustBeActive`
 * check. `_seller.assistant = _seller.admin = attackerAddress` satisfies
 * `NotAssistant` / `NotAdmin`. With auth-token type left at zero (the default
 * from `zeroValueFor`), `createSellerInternal` takes the admin-address branch
 * and proceeds to the inner `nonReentrant` delegate, which fires the guard.
 *
 * @param {object} target - one entry from `buildReentrancyTargets()`
 * @param {string} attackerAddress - the address that will be `_msgSender()`
 *   when the malicious contract calls back into the diamond
 * @returns {string} hex calldata
 */
function rebuildCalldataForAttacker(target, attackerAddress) {
  if (!target.attackerDependent) return target.calldata;
  const overrides = ATTACKER_DEPENDENT_OVERRIDES.get(target.name);
  if (!overrides) {
    throw new Error(`No ATTACKER_DEPENDENT_OVERRIDES entry for ${target.name}`);
  }
  const args = _deepCloneArgs(target.args);
  const seller = args[overrides.sellerArgIndex];
  if (!seller || typeof seller !== "object") {
    throw new Error(
      `Expected tuple-struct at arg index ${overrides.sellerArgIndex} of ${target.name}, got ${typeof seller}`
    );
  }
  seller.assistant = attackerAddress;
  seller.admin = attackerAddress;
  seller.treasury = NONZERO_TREASURY_PLACEHOLDER;
  seller.active = true;
  return _getCombinedInterface().encodeFunctionData(target.name, args);
}

/**
 * Build a single ethers Interface combining every facet's ABI. Useful when
 * encoding a calldata blob for a function whose owning facet isn't directly
 * available as a typed instance in the test (e.g. orchestration helpers used
 * from inside another FROM block's setup).
 */
function buildCombinedInterface() {
  if (!fs.existsSync(FACETS_ARTIFACT_DIR)) {
    throw new Error(
      `Facet artifacts not found at ${FACETS_ARTIFACT_DIR}. Run \`npx hardhat compile\` before invoking buildCombinedInterface.`
    );
  }
  const merged = [];
  const seen = new Set();
  const facetDirs = fs
    .readdirSync(FACETS_ARTIFACT_DIR)
    .filter((d) => d.endsWith(".sol"))
    .sort();
  for (const fdir of facetDirs) {
    const facetName = fdir.replace(/\.sol$/, "");
    const artifactPath = path.join(FACETS_ARTIFACT_DIR, fdir, `${facetName}.json`);
    if (!fs.existsSync(artifactPath)) continue;
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    for (const item of artifact.abi) {
      if (item.type !== "function") continue;
      const sig = `${item.name}(${(item.inputs || []).map((i) => i.type).join(",")})`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      merged.push(item);
    }
  }
  return new Interface(merged);
}

module.exports = {
  buildReentrancyTargets,
  buildCombinedInterface,
  rebuildCalldataForAttacker,
  zeroValueFor,
  isReentryAllowed,
  REENTRY_ALLOWED_NAMES,
  REENTRY_ALLOWED_PATTERNS,
  ATTACKER_DEPENDENT_OVERRIDES,
};
