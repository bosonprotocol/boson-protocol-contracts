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

  function encodeAuthQueue(entries) {
    return AbiCoder.defaultAbiCoder().encode(["bytes[]"], [entries]);
  }

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
      const queue = encodeAuthQueue([noneEntry]);

      const [drained, extraPopWasEmpty] = await consumer.probePopWhenExhausted.staticCall(queue);
      expect(drained.length).to.equal(1);
      expect(drained[0]).to.equal(noneEntry);
      expect(extraPopWasEmpty).to.equal(true);
    });
  });
});
