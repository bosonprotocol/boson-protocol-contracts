const { ethers } = require("hardhat");
const { ZeroAddress, getContractFactory, getSigners, randomBytes, zeroPadValue, AbiCoder, MaxUint256, Signature } =
  ethers;
const { expect } = require("chai");

const { mockSeller, mockVoucherInitValues, mockAuthToken, mockDisputeResolver, accountId } = require("../util/mock");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const { prepareDataSignature, setupTestEnvironment, getSnapshot, revertToSnapshot } = require("../util/utils.js");

const TokenTransferAuthorizationStrategy = {
  None: 0,
  ERC3009: 1,
};

const RECEIVE_WITH_AUTHORIZATION_TYPES = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

const META_TRANSACTION_TYPES = {
  MetaTransaction: [
    { name: "nonce", type: "uint256" },
    { name: "from", type: "address" },
    { name: "contractAddress", type: "address" },
    { name: "functionName", type: "string" },
    { name: "functionSignature", type: "bytes" },
  ],
};

async function signReceiveWithAuthorization(signer, token, params) {
  const { chainId } = await ethers.provider.getNetwork();
  const domain = {
    name: await token.name(),
    version: "1",
    chainId,
    verifyingContract: await token.getAddress(),
  };
  const sig = await signer.signTypedData(domain, RECEIVE_WITH_AUTHORIZATION_TYPES, params);
  const split = Signature.from(sig);
  return { v: split.v, r: split.r, s: split.s };
}

function encodeAuthEntry({ validAfter, validBefore, nonce, v, r, s }) {
  const erc3009Data = AbiCoder.defaultAbiCoder().encode(
    ["uint256", "uint256", "bytes32", "uint8", "bytes32", "bytes32"],
    [validAfter, validBefore, nonce, v, r, s]
  );
  return AbiCoder.defaultAbiCoder().encode(
    ["uint8", "bytes"],
    [TokenTransferAuthorizationStrategy.ERC3009, erc3009Data]
  );
}

function encodeAuthQueue(entries) {
  return AbiCoder.defaultAbiCoder().encode(["bytes[]"], [entries]);
}

describe("ERC3009-backed metatransactions", function () {
  let deployer, assistant, adminDR, treasuryDR, rando;
  let accountHandler, fundsHandler, metaTransactionsHandler;
  let protocolDiamondAddress;
  let snapshotId;
  let token;
  let seller, disputeResolver;

  before(async function () {
    accountId.next(true);

    const contracts = {
      accountHandler: "IBosonAccountHandler",
      fundsHandler: "IBosonFundsHandler",
      metaTransactionsHandler: "IBosonMetaTransactionsHandler",
    };

    ({
      signers: [, , rando, assistant, , adminDR, treasuryDR],
      contractInstances: { accountHandler, fundsHandler, metaTransactionsHandler },
      diamondAddress: protocolDiamondAddress,
    } = await setupTestEnvironment(contracts));

    [deployer] = await getSigners();

    // Deploy the ERC-3009 mock token
    const Mock = await getContractFactory("MockERC3009Token");
    token = await Mock.deploy("USD Test", "USDT");
    await token.waitForDeployment();

    // Create seller
    seller = mockSeller(
      await assistant.getAddress(),
      await assistant.getAddress(),
      ZeroAddress,
      await assistant.getAddress()
    );
    await accountHandler.connect(assistant).createSeller(seller, mockAuthToken(), mockVoucherInitValues());

    // Create dispute resolver supporting the new token
    disputeResolver = mockDisputeResolver(
      await adminDR.getAddress(),
      await adminDR.getAddress(),
      ZeroAddress,
      await treasuryDR.getAddress(),
      true
    );
    const drFees = [
      new DisputeResolverFee(ZeroAddress, "Native", "0"),
      new DisputeResolverFee(await token.getAddress(), "USDT", "0"),
    ];
    await accountHandler.connect(adminDR).createDisputeResolver(disputeResolver, drFees, []);

    snapshotId = await getSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();
  });

  async function buildDepositMetaTx(signer, amount, nonce) {
    const fnSig = fundsHandler.interface.encodeFunctionData("depositFunds", [
      seller.id,
      await token.getAddress(),
      amount,
    ]);
    const message = {
      nonce: parseInt(nonce),
      from: await signer.getAddress(),
      contractAddress: await metaTransactionsHandler.getAddress(),
      functionName: "depositFunds(uint256,address,uint256)",
      functionSignature: fnSig,
    };
    const signature = await prepareDataSignature(
      signer,
      META_TRANSACTION_TYPES,
      "MetaTransaction",
      message,
      await metaTransactionsHandler.getAddress()
    );
    return { fnSig, message, signature };
  }

  async function buildAuthEntry(signer, value) {
    const validAfter = 0;
    const validBefore = MaxUint256;
    const authNonce = zeroPadValue("0x" + Buffer.from(randomBytes(32)).toString("hex"), 32);
    const params = {
      from: await signer.getAddress(),
      to: protocolDiamondAddress,
      value,
      validAfter,
      validBefore,
      nonce: authNonce,
    };
    const { v, r, s } = await signReceiveWithAuthorization(signer, token, params);
    return encodeAuthEntry({ validAfter, validBefore, nonce: authNonce, v, r, s });
  }

  it("pulls funds via receiveWithAuthorization when queue has a matching entry", async function () {
    const amount = "1000";
    await token.mint(await assistant.getAddress(), amount);
    // Note: NO approve() call

    const nonce = parseInt(randomBytes(8));
    const { fnSig, message, signature } = await buildDepositMetaTx(assistant, amount, nonce);
    const authEntry = await buildAuthEntry(assistant, amount);
    const queue = encodeAuthQueue([authEntry]);

    await expect(
      metaTransactionsHandler
        .connect(deployer)
        .executeMetaTransactionWithTokenTransferAuthorization(
          await assistant.getAddress(),
          message.functionName,
          fnSig,
          nonce,
          signature,
          queue
        )
    )
      .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
      .withArgs(await assistant.getAddress(), await deployer.getAddress(), message.functionName, nonce);

    expect(await token.balanceOf(protocolDiamondAddress)).to.equal(amount);
    expect(await token.balanceOf(await assistant.getAddress())).to.equal(0);
  });

  it("falls back to safeTransferFrom when called via plain executeMetaTransaction", async function () {
    // Without the auth-flavored entry point no queue is loaded, so the
    // standard ERC-20 allowance path runs unchanged.
    const amount = "500";
    await token.mint(await assistant.getAddress(), amount);
    await token.connect(assistant).approve(protocolDiamondAddress, amount);

    const nonce = parseInt(randomBytes(8));
    const { fnSig, message, signature } = await buildDepositMetaTx(assistant, amount, nonce);

    await metaTransactionsHandler
      .connect(deployer)
      .executeMetaTransaction(await assistant.getAddress(), message.functionName, fnSig, nonce, signature);

    expect(await token.balanceOf(protocolDiamondAddress)).to.equal(amount);
  });

  it("empty queue entry falls back to safeTransferFrom (reverts without allowance)", async function () {
    const amount = "500";
    await token.mint(await assistant.getAddress(), amount);
    // No approve() — fallback path will revert.

    const nonce = parseInt(randomBytes(8));
    const { fnSig, message, signature } = await buildDepositMetaTx(assistant, amount, nonce);
    const queue = encodeAuthQueue(["0x"]);

    await expect(
      metaTransactionsHandler
        .connect(deployer)
        .executeMetaTransactionWithTokenTransferAuthorization(
          await assistant.getAddress(),
          message.functionName,
          fnSig,
          nonce,
          signature,
          queue
        )
    ).to.be.reverted;
  });

  it("explicit (None, '') queue entry falls back to safeTransferFrom", async function () {
    // The empty-bytes shortcut and the explicit `(None, "")` envelope are
    // semantically equivalent — both mean "use the standard ERC-20 allowance
    // path for this transfer". The shortcut hits the early `entry.length == 0`
    // return inside `popNext`/`consumeForTransfer`; the explicit envelope
    // hits the dispatcher's tag-check on `TokenTransferAuthorizationStrategy.None`. We
    // exercise both to keep the dispatcher fully covered.
    const amount = "500";
    await token.mint(await assistant.getAddress(), amount);
    await token.connect(assistant).approve(protocolDiamondAddress, amount);

    const nonce = parseInt(randomBytes(8));
    const { fnSig, message, signature } = await buildDepositMetaTx(assistant, amount, nonce);

    // Build an explicit `(TokenTransferAuthorizationStrategy.None, "")` envelope rather
    // than the empty-bytes shortcut.
    const noneEntry = AbiCoder.defaultAbiCoder().encode(
      ["uint8", "bytes"],
      [TokenTransferAuthorizationStrategy.None, "0x"]
    );
    const queue = encodeAuthQueue([noneEntry]);

    await metaTransactionsHandler
      .connect(deployer)
      .executeMetaTransactionWithTokenTransferAuthorization(
        await assistant.getAddress(),
        message.functionName,
        fnSig,
        nonce,
        signature,
        queue
      );

    expect(await token.balanceOf(protocolDiamondAddress)).to.equal(amount);
  });

  it("reverts cleanly when the ERC-3009 signature is wrong", async function () {
    const amount = "500";
    await token.mint(await assistant.getAddress(), amount);

    const nonce = parseInt(randomBytes(8));
    const { fnSig, message, signature } = await buildDepositMetaTx(assistant, amount, nonce);

    // Sign auth as `rando` instead of `assistant` — token-side recovery will mismatch.
    const authEntry = await buildAuthEntry(rando, amount);
    const queue = encodeAuthQueue([authEntry]);

    await expect(
      metaTransactionsHandler
        .connect(deployer)
        .executeMetaTransactionWithTokenTransferAuthorization(
          await assistant.getAddress(),
          message.functionName,
          fnSig,
          nonce,
          signature,
          queue
        )
    ).to.be.reverted;

    expect(await token.balanceOf(protocolDiamondAddress)).to.equal(0);
    expect(await token.balanceOf(await assistant.getAddress())).to.equal(amount);
  });

  it("normal (non-metatx) transferFundsIn path is unaffected by transient slot", async function () {
    const amount = "200";
    await token.mint(await assistant.getAddress(), amount);
    await token.connect(assistant).approve(protocolDiamondAddress, amount);

    // Direct call — no metatx, no transient queue parked. Falls through to safeTransferFrom.
    await fundsHandler.connect(assistant).depositFunds(seller.id, await token.getAddress(), amount);

    expect(await token.balanceOf(protocolDiamondAddress)).to.equal(amount);
  });

  // ====================================================================
  //  Transient-storage hygiene
  // --------------------------------------------------------------------
  //  Transient storage (TSTORE/TLOAD) is per-transaction, not per-call.
  //  If `executeMetaTransactionWithTokenTransferAuthorization` returns
  //  successfully without clearing the queue, leftover entries (from a
  //  queue that carried more entries than the inner call consumed)
  //  persist in transient storage and can be popped by an unrelated
  //  protocol call later in the same transaction. The fix adds a
  //  `clearQueue` call at the end of the success path. These tests
  //  exercise the fix via a small batch-caller mock so two protocol
  //  calls land in one transaction.
  // ====================================================================
  context("👉 Queue cleared between sibling protocol calls in same tx", async function () {
    let batchCaller;

    beforeEach(async function () {
      const Batch = await getContractFactory("MockBatchCaller");
      batchCaller = await Batch.deploy();
      await batchCaller.waitForDeployment();
    });

    it("leftover queue entry from prior call does not leak into a follow-up plain metatx", async function () {
      // Scenario:
      //   - Call A: executeMetaTransactionWithTokenTransferAuthorization
      //     wrapping `depositFunds($10)` from `assistant`, with a queue of
      //     two entries: a valid auth for $10 + a "bogus" auth (signed for a
      //     different amount, $99). Call A's depositFunds triggers exactly
      //     one transferFundsIn — the first entry is consumed, the second
      //     stays in transient storage if `clearQueue` isn't called.
      //   - Call B: plain `executeMetaTransaction` wrapping
      //     `depositFunds($20)` from `assistant`, with allowance set so the
      //     fallback `safeTransferFrom` path can succeed.
      //
      // Pre-fix: Call B's transferFundsIn pops the leftover bogus auth and
      // calls receiveWithAuthorization with `value=$20` against a signature
      // signed for `value=$99` — token-side EIP-712 recovery returns the
      // wrong signer and reverts.
      // Post-fix: queue cleared at end of Call A; Call B sees no queue,
      // falls through to safeTransferFrom, succeeds.
      const amountA = "10";
      const amountB = "20";
      const bogusAmount = "99";

      await token.mint(await assistant.getAddress(), "30");
      // Allowance for Call B's safeTransferFrom path (post-fix).
      await token.connect(assistant).approve(protocolDiamondAddress, amountB);

      // Two distinct nonces in the same tx — `parseInt(randomBytes(8))` is
      // unreliable here (it parses only the leading byte of the array's
      // toString, so collisions in 0..255 are likely).
      const nonceA = 1;
      const nonceB = 2;

      // Build Call A: metatx-with-auth, queue with two entries
      const callA = await buildDepositMetaTx(assistant, amountA, nonceA);
      const validEntry = await buildAuthEntry(assistant, amountA);
      const bogusEntry = await buildAuthEntry(assistant, bogusAmount); // signed for wrong amount → leftover, would revert if consumed
      const queueA = encodeAuthQueue([validEntry, bogusEntry]);

      const callAData = metaTransactionsHandler.interface.encodeFunctionData(
        "executeMetaTransactionWithTokenTransferAuthorization",
        [await assistant.getAddress(), callA.message.functionName, callA.fnSig, nonceA, callA.signature, queueA]
      );

      // Build Call B: plain metatx
      const callB = await buildDepositMetaTx(assistant, amountB, nonceB);
      const callBData = metaTransactionsHandler.interface.encodeFunctionData("executeMetaTransaction", [
        await assistant.getAddress(),
        callB.message.functionName,
        callB.fnSig,
        nonceB,
        callB.signature,
      ]);

      // Run both calls in a single transaction via the batch caller.
      await batchCaller.batch(protocolDiamondAddress, [callAData, callBData]);

      // Both pulls landed.
      expect(await token.balanceOf(protocolDiamondAddress)).to.equal("30");
      expect(await token.balanceOf(await assistant.getAddress())).to.equal("0");

      // Smoking-gun assertion: assistant's allowance was decremented to 0,
      // proving Call B used safeTransferFrom (not the leftover ERC-3009
      // entry, which would have left the allowance untouched).
      expect(await token.allowance(await assistant.getAddress(), protocolDiamondAddress)).to.equal("0");

      // Seller now has $30 of available funds in the protocol.
      const available = await fundsHandler.getAvailableFunds(seller.id, [await token.getAddress()]);
      expect(available[0].availableAmount).to.equal("30");
    });

    it("two metatx-with-auth calls in same tx — second's queue is independent of first's", async function () {
      // Sanity: two consecutive metatx-with-auth calls each load and
      // consume their own queue without cross-contamination.
      const amountA = "10";
      const amountB = "20";

      await token.mint(await assistant.getAddress(), "30");
      // No allowance — both calls must use ERC-3009.

      // Use two distinct nonces. (Test 1 above only generates one nonce per
      // call so collision between unrelated tests is fine; here we need
      // two within the same tx.)
      const nonceA = 1;
      const nonceB = 2;

      const callA = await buildDepositMetaTx(assistant, amountA, nonceA);
      const queueA = encodeAuthQueue([await buildAuthEntry(assistant, amountA)]);
      const callAData = metaTransactionsHandler.interface.encodeFunctionData(
        "executeMetaTransactionWithTokenTransferAuthorization",
        [await assistant.getAddress(), callA.message.functionName, callA.fnSig, nonceA, callA.signature, queueA]
      );

      const callB = await buildDepositMetaTx(assistant, amountB, nonceB);
      const queueB = encodeAuthQueue([await buildAuthEntry(assistant, amountB)]);
      const callBData = metaTransactionsHandler.interface.encodeFunctionData(
        "executeMetaTransactionWithTokenTransferAuthorization",
        [await assistant.getAddress(), callB.message.functionName, callB.fnSig, nonceB, callB.signature, queueB]
      );

      await batchCaller.batch(protocolDiamondAddress, [callAData, callBData]);

      expect(await token.balanceOf(protocolDiamondAddress)).to.equal("30");
      expect(await token.balanceOf(await assistant.getAddress())).to.equal("0");

      const available = await fundsHandler.getAvailableFunds(seller.id, [await token.getAddress()]);
      expect(available[0].availableAmount).to.equal("30");
    });
  });
});
