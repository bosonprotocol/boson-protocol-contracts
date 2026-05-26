/**
 * Reentrancy target enumeration helper.
 *
 * Given the protocol diamond's combined ABI, build the table of TO targets
 * (state-modifying entry points carrying `nonReentrant`) that the reentrancy
 * matrix test attempts to re-enter. Each entry is a name + zero-argument
 * calldata blob; the test arms the malicious contract with that calldata and
 * expects the protocol's reentrancy guard to reject the inner call.
 *
 * The list below is the curated allowlist of nonReentrant TO functions. It is
 * the JS mirror of the facet inspection captured in the implementation plan.
 * Functions deliberately excluded:
 *   - MetaTransactionsHandlerFacet.executeMetaTransaction* (no nonReentrant by design)
 *   - ExchangeHandlerFacet.onVoucherTransferred (no nonReentrant by design)
 *   - ExchangeHandlerFacet.completeExchangeBatch / DisputeHandlerFacet.expireDisputeBatch
 *       (no nonReentrant; they iterate over single-exchange functions that have it)
 */

const { ZeroAddress, Interface } = require("ethers");

const HANDLER_INTERFACES = [
  "IBosonAgentHandler",
  "IBosonBundleHandler",
  "IBosonBuyerHandler",
  "IBosonConfigHandler",
  "IBosonDisputeHandler",
  "IBosonDisputeResolverHandler",
  "IBosonExchangeCommitHandler",
  "IBosonExchangeHandler",
  "IBosonExchangeManagementHandler",
  "IBosonFundsHandler",
  "IBosonGroupHandler",
  "IBosonMetaTransactionsHandler",
  "IBosonOfferHandler",
  "IBosonOrchestrationHandler",
  "IBosonPauseHandler",
  "IBosonPriceDiscoveryHandler",
  "IBosonSellerHandler",
  "IBosonSequentialCommitHandler",
  "IBosonTwinHandler",
];

/**
 * Build a single ethers Interface that combines every Boson handler ABI.
 * The protocol diamond exposes the union of these interfaces; combining them
 * here lets us encode TO calldata for any facet's function from a single
 * place.
 */
function buildCombinedInterface() {
  const merged = [];
  const seen = new Set();
  for (const name of HANDLER_INTERFACES) {
    let artifact;
    try {
      artifact = require(`../../artifacts/contracts/interfaces/handlers/${name}.sol/${name}.json`);
    } catch (_e) {
      // Interface not compiled yet; caller should compile first.
      continue;
    }
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

// Canonical list of nonReentrant TO targets, grouped by facet.
const NON_REENTRANT_FUNCTIONS = [
  // AgentHandlerFacet
  "createAgent",
  "updateAgent",
  // BundleHandlerFacet
  "createBundle",
  // BuyerHandlerFacet
  "createBuyer",
  "updateBuyer",
  // ConfigHandlerFacet (admin-gated)
  "setTokenAddress",
  "setTreasuryAddress",
  "setVoucherBeaconAddress",
  "setBeaconProxyAddress",
  "setPriceDiscoveryAddress",
  "setProtocolFeePercentage",
  "setProtocolFeeTable",
  "setProtocolFeeFlatBoson",
  "setMaxEscalationResponsePeriod",
  "setMaxTotalOfferFeePercentage",
  "setMaxRoyaltyPercentage",
  "setBuyerEscalationDepositPercentage",
  "setAuthTokenContract",
  "setMinResolutionPeriod",
  "setMaxResolutionPeriod",
  "setMinDisputePeriod",
  "setAccessControllerAddress",
  "setMutualizerGasStipend",
  // DisputeHandlerFacet
  "raiseDispute",
  "retractDispute",
  "extendDisputeTimeout",
  "expireDispute",
  "resolveDispute",
  "escalateDispute",
  "decideDispute",
  "refuseEscalatedDispute",
  "expireEscalatedDispute",
  // DisputeResolverHandlerFacet
  "createDisputeResolver",
  "updateDisputeResolver",
  "optInToDisputeResolverUpdate",
  "addFeesToDisputeResolver",
  "removeFeesFromDisputeResolver",
  "addSellersToAllowList",
  "removeSellersFromAllowList",
  // ExchangeCommitFacet
  "commitToOffer",
  "commitToBuyerOffer",
  "commitToConditionalOffer",
  // ExchangeHandlerFacet
  "completeExchange",
  "revokeVoucher",
  "cancelVoucher",
  "expireVoucher",
  "extendVoucher",
  "redeemVoucher",
  // FundsHandlerFacet
  "depositFunds",
  "withdrawFunds",
  "withdrawProtocolFees",
  // GroupHandlerFacet
  "createGroup",
  "addOffersToGroup",
  "removeOffersFromGroup",
  "setGroupCondition",
  // MetaTransactionsHandlerFacet
  "setAllowlistedFunctions",
  // OfferHandlerFacet
  "createOffer",
  "createOfferBatch",
  "reserveRange",
  "voidOffer",
  "voidOfferBatch",
  "voidNonListedOffer",
  "voidNonListedOfferBatch",
  "extendOffer",
  "extendOfferBatch",
  "updateOfferRoyaltyRecipients",
  "updateOfferRoyaltyRecipientsBatch",
  "updateOfferMutualizer",
  // OrchestrationHandlerFacet1
  "createSellerAndOffer",
  "createOfferWithCondition",
  "createOfferAddToGroup",
  "createOfferAndTwinWithBundle",
  // OrchestrationHandlerFacet2
  "raiseAndEscalateDispute",
  "commitToOfferAndRedeemVoucher",
  "commitToConditionalOfferAndRedeemVoucher",
  "createOfferCommitAndRedeem",
  // PauseHandlerFacet
  "pause",
  "unpause",
  // PriceDiscoveryHandlerFacet
  "commitToPriceDiscoveryOffer",
  // SellerHandlerFacet
  "createSeller",
  "updateSeller",
  "optInToSellerUpdate",
  "createNewCollection",
  "updateSellerSalt",
  "addRoyaltyRecipients",
  "updateRoyaltyRecipients",
  "removeRoyaltyRecipients",
  // SequentialCommitHandlerFacet
  "sequentialCommitToOffer",
  // TwinHandlerFacet
  "createTwin",
  "removeTwin",
];

/**
 * Build a zero-value placeholder for any solidity ABI type.
 *
 * The protocol's reentrancy guard fires before any input validation, so we can
 * safely pass all-zero arguments — the guard will revert before any meaningful
 * decode of the body. The few functions that hit a role check, region pause
 * check, or function-selector allowlist BEFORE the nonReentrant modifier are
 * filtered out at test runtime.
 */
function zeroValueFor(input) {
  const t = input.type;
  if (t.endsWith("[]")) return [];
  const fixedArr = t.match(/^(.+)\[(\d+)\]$/);
  if (fixedArr) {
    const baseInput = { ...input, type: fixedArr[1], components: input.components };
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
 * Build the TO_TARGETS list from the diamond's interface.
 *
 * Each entry: { name, calldata, selector }.
 *
 * @param {Interface} diamondInterface - ethers Interface for the protocol diamond
 * @returns {Array<{ name: string, calldata: string, selector: string }>}
 */
function buildReentrancyTargets(diamondInterface) {
  const out = [];
  for (const name of NON_REENTRANT_FUNCTIONS) {
    const frag = diamondInterface.fragments.find(
      (f) =>
        f.type === "function" &&
        f.name === name &&
        (f.stateMutability === "nonpayable" || f.stateMutability === "payable")
    );
    if (!frag) {
      out.push({ name, calldata: null, selector: null, missing: true });
      continue;
    }
    const args = frag.inputs.map((input) => zeroValueFor(input));
    let calldata = null;
    let error = null;
    try {
      calldata = diamondInterface.encodeFunctionData(name, args);
    } catch (e) {
      error = e.message;
    }
    out.push({
      name,
      calldata,
      selector: frag.selector,
      error,
    });
  }
  return out;
}

module.exports = {
  NON_REENTRANT_FUNCTIONS,
  HANDLER_INTERFACES,
  buildReentrancyTargets,
  buildCombinedInterface,
  zeroValueFor,
};
