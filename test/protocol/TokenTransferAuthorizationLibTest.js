const { ethers } = require("hardhat");
const { AbiCoder, getContractFactory } = ethers;
const { expect } = require("chai");

/**
 * Focused unit tests for {TokenTransferAuthorizationLib} — kept here so we can
 * exercise edge cases of the queue's transient-storage helpers without paying
 * the full protocol-deploy cost of the integration tests.
 */
describe("TokenTransferAuthorizationLib", function () {
  let consumer;

  // Same enum as the Solidity-side `BosonTypes.TokenTransferAuthorizationStrategy`.
  const TokenTransferAuthorizationStrategy = { None: 0 };

  before(async function () {
    const Consumer = await getContractFactory("MockTokenTransferAuthorizationLibConsumer");
    consumer = await Consumer.deploy();
    await consumer.waitForDeployment();
  });

  context("👉 popNext()", async function () {
    it("returns empty bytes when the queue is exhausted (over-popped)", async function () {
      // Build a 1-entry queue with an explicit `(None, "")` envelope.
      // The consumer drains it once, then pops one more time — the extra pop
      // hits the `head >= len` early return inside `popNext` and returns `bytes("")`.
      const noneEntry = AbiCoder.defaultAbiCoder().encode(
        ["uint8", "bytes"],
        [TokenTransferAuthorizationStrategy.None, "0x"]
      );
      // Send a real transaction (not staticCall) — TSTORE inside loadQueue is
      // forbidden in a STATICCALL context per EIP-1153, so the consumer reports
      // results via an event.
      await expect(consumer.probePopWhenExhausted([noneEntry]))
        .to.emit(consumer, "Probed")
        .withArgs([noneEntry], true);
    });
  });
});
