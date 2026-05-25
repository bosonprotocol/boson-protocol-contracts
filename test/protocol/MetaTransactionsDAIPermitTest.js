const { ethers } = require("hardhat");
const { ZeroAddress, getContractFactory, getSigners, randomBytes, AbiCoder, MaxUint256, Signature } = ethers;
const { expect } = require("chai");

const { mockSeller, mockVoucherInitValues, mockAuthToken, mockDisputeResolver, accountId } = require("../util/mock");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const { prepareDataSignature, setupTestEnvironment, getSnapshot, revertToSnapshot } = require("../util/utils.js");

// Mirrors `BosonTypes.TokenTransferAuthorizationStrategy`.
const TokenTransferAuthorizationStrategy = {
  None: 0,
  ERC3009: 1,
  EIP2612: 2,
  Permit2: 3,
  DAIPermit: 4,
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

// DAI-style permit typed data: nonce is in calldata (not stored on the message
// type), `value` is replaced by a bool `allowed`, `deadline` is `expiry`
// (0 = never expires).
const DAI_PERMIT_TYPES = {
  Permit: [
    { name: "holder", type: "address" },
    { name: "spender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "expiry", type: "uint256" },
    { name: "allowed", type: "bool" },
  ],
};

function encodeAuthQueue(entries) {
  return AbiCoder.defaultAbiCoder().encode(["bytes[]"], [entries]);
}

function wrapEntry(strategy, data) {
  return AbiCoder.defaultAbiCoder().encode(["uint8", "bytes"], [strategy, data]);
}

describe("DAI-style permit authorization queue", function () {
  let deployer, assistant, adminDR, treasuryDR, rando;
  let accountHandler, fundsHandler, metaTransactionsHandler;
  let protocolDiamondAddress;
  let snapshotId;
  let seller;
  let token;

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

  async function setupSellerAndDR() {
    accountId.next(true);

    seller = mockSeller(
      await assistant.getAddress(),
      await assistant.getAddress(),
      ZeroAddress,
      await assistant.getAddress()
    );
    await accountHandler.connect(assistant).createSeller(seller, mockAuthToken(), mockVoucherInitValues());

    const dr = mockDisputeResolver(
      await adminDR.getAddress(),
      await adminDR.getAddress(),
      ZeroAddress,
      await treasuryDR.getAddress(),
      true
    );
    const drFees = [
      new DisputeResolverFee(ZeroAddress, "Native", "0"),
      new DisputeResolverFee(await token.getAddress(), "Token", "0"),
    ];
    await accountHandler.connect(adminDR).createDisputeResolver(dr, drFees, []);
  }

  beforeEach(async function () {
    const Mock = await getContractFactory("MockDAIPermitToken");
    token = await Mock.deploy("Dai Stablecoin", "DAI");
    await token.waitForDeployment();
    await setupSellerAndDR();
  });

  async function buildDAIPermitEntry(signer, expiry, permitNonce) {
    const { chainId } = await ethers.provider.getNetwork();
    const domain = {
      name: await token.name(),
      version: "1",
      chainId,
      verifyingContract: await token.getAddress(),
    };
    const nonceToUse = permitNonce !== undefined ? permitNonce : await token.nonces(await signer.getAddress());
    const message = {
      holder: await signer.getAddress(),
      spender: protocolDiamondAddress,
      nonce: nonceToUse,
      expiry,
      allowed: true,
    };
    const sig = await signer.signTypedData(domain, DAI_PERMIT_TYPES, message);
    const split = Signature.from(sig);
    const data = AbiCoder.defaultAbiCoder().encode(
      ["uint256", "uint256", "uint8", "bytes32", "bytes32"],
      [nonceToUse, expiry, split.v, split.r, split.s]
    );
    return { entry: wrapEntry(TokenTransferAuthorizationStrategy.DAIPermit, data), split, nonce: nonceToUse };
  }

  it("pulls funds via DAI permit + transferFrom when queue carries a DAIPermit entry", async function () {
    const amount = "1000";
    await token.mint(await assistant.getAddress(), amount);
    // No prior approve — the DAI permit grants MAX allowance via the permit call.

    const metatxNonce = parseInt(randomBytes(8));
    const { fnSig, message, signature } = await buildDepositMetaTx(assistant, amount, metatxNonce);
    const { entry } = await buildDAIPermitEntry(assistant, MaxUint256);
    const queue = encodeAuthQueue([entry]);

    await expect(
      metaTransactionsHandler
        .connect(deployer)
        .executeMetaTransactionWithTokenTransferAuthorization(
          await assistant.getAddress(),
          message.functionName,
          fnSig,
          metatxNonce,
          signature,
          queue
        )
    ).to.emit(metaTransactionsHandler, "MetaTransactionExecuted");

    expect(await token.balanceOf(protocolDiamondAddress)).to.equal(amount);
    expect(await token.balanceOf(await assistant.getAddress())).to.equal(0);
    // DAI permit nonce was advanced and the protocol holds MAX allowance.
    expect(await token.nonces(await assistant.getAddress())).to.equal(1);
    expect(await token.allowance(await assistant.getAddress(), protocolDiamondAddress)).to.equal(MaxUint256);
  });

  it("tolerates `expiry == 0` as a never-expires sentinel", async function () {
    const amount = "750";
    await token.mint(await assistant.getAddress(), amount);

    const metatxNonce = parseInt(randomBytes(8));
    const { fnSig, message, signature } = await buildDepositMetaTx(assistant, amount, metatxNonce);
    const { entry } = await buildDAIPermitEntry(assistant, "0");
    const queue = encodeAuthQueue([entry]);

    await metaTransactionsHandler
      .connect(deployer)
      .executeMetaTransactionWithTokenTransferAuthorization(
        await assistant.getAddress(),
        message.functionName,
        fnSig,
        metatxNonce,
        signature,
        queue
      );

    expect(await token.balanceOf(protocolDiamondAddress)).to.equal(amount);
  });

  it("reverts when DAI permit signature is from a different signer", async function () {
    const amount = "500";
    await token.mint(await assistant.getAddress(), amount);

    const metatxNonce = parseInt(randomBytes(8));
    const { fnSig, message, signature } = await buildDepositMetaTx(assistant, amount, metatxNonce);
    // Signed by `rando` — the recovered holder won't match `_from = assistant`.
    const { entry } = await buildDAIPermitEntry(rando, MaxUint256);
    const queue = encodeAuthQueue([entry]);

    await expect(
      metaTransactionsHandler
        .connect(deployer)
        .executeMetaTransactionWithTokenTransferAuthorization(
          await assistant.getAddress(),
          message.functionName,
          fnSig,
          metatxNonce,
          signature,
          queue
        )
    ).to.be.reverted;
  });

  it("reverts when DAI permit expiry has passed", async function () {
    const amount = "500";
    await token.mint(await assistant.getAddress(), amount);

    const metatxNonce = parseInt(randomBytes(8));
    const { fnSig, message, signature } = await buildDepositMetaTx(assistant, amount, metatxNonce);
    const expired = "1";
    const { entry } = await buildDAIPermitEntry(assistant, expired);
    const queue = encodeAuthQueue([entry]);

    await expect(
      metaTransactionsHandler
        .connect(deployer)
        .executeMetaTransactionWithTokenTransferAuthorization(
          await assistant.getAddress(),
          message.functionName,
          fnSig,
          metatxNonce,
          signature,
          queue
        )
    ).to.be.reverted;
  });

  it("tolerates a benign frontrun that already consumed the same permit", async function () {
    // Frontrunner replays the same DAI permit before our metatx lands. That
    // advances the nonce and leaves the protocol with MAX allowance. Our
    // metatx then sees allowance >= _amount, skips the redundant permit
    // call, and pulls funds via the existing allowance.
    const amount = "1000";
    await token.mint(await assistant.getAddress(), amount);

    const expiry = MaxUint256;
    const ownerNonce = await token.nonces(await assistant.getAddress());
    const { entry, split } = await buildDAIPermitEntry(assistant, expiry, ownerNonce);

    // Frontrun: someone replays the permit on-chain.
    await token
      .connect(rando)
      .permit(
        await assistant.getAddress(),
        protocolDiamondAddress,
        ownerNonce,
        expiry,
        true,
        split.v,
        split.r,
        split.s
      );
    expect(await token.allowance(await assistant.getAddress(), protocolDiamondAddress)).to.equal(MaxUint256);
    expect(await token.nonces(await assistant.getAddress())).to.equal(BigInt(ownerNonce) + 1n);

    const metatxNonce = parseInt(randomBytes(8));
    const { fnSig, message, signature } = await buildDepositMetaTx(assistant, amount, metatxNonce);
    const queue = encodeAuthQueue([entry]);

    await metaTransactionsHandler
      .connect(deployer)
      .executeMetaTransactionWithTokenTransferAuthorization(
        await assistant.getAddress(),
        message.functionName,
        fnSig,
        metatxNonce,
        signature,
        queue
      );

    expect(await token.balanceOf(protocolDiamondAddress)).to.equal(amount);
    expect(await token.balanceOf(await assistant.getAddress())).to.equal(0);
  });

  it("consumes the signed permit even when a pre-existing partial allowance would have sufficed", async function () {
    // The user has a pre-existing approve() for an amount larger than the
    // transfer, and *also* submits a signed DAI permit. The helper must call
    // permit anyway (consuming the signed nonce and bumping allowance to MAX)
    // rather than silently swallowing the signature.
    const amount = "500";
    await token.mint(await assistant.getAddress(), amount);

    // Pre-existing standard allowance > _amount but < MAX.
    const preExistingAllowance = "1000";
    await token.connect(assistant).approve(protocolDiamondAddress, preExistingAllowance);

    const expiry = MaxUint256;
    const ownerNonce = await token.nonces(await assistant.getAddress());
    const { entry } = await buildDAIPermitEntry(assistant, expiry, ownerNonce);

    const metatxNonce = parseInt(randomBytes(8));
    const { fnSig, message, signature } = await buildDepositMetaTx(assistant, amount, metatxNonce);
    const queue = encodeAuthQueue([entry]);

    await metaTransactionsHandler
      .connect(deployer)
      .executeMetaTransactionWithTokenTransferAuthorization(
        await assistant.getAddress(),
        message.functionName,
        fnSig,
        metatxNonce,
        signature,
        queue
      );

    expect(await token.balanceOf(protocolDiamondAddress)).to.equal(amount);
    expect(await token.balanceOf(await assistant.getAddress())).to.equal(0);
    // Signed permit was consumed → nonce advanced and allowance is now MAX.
    expect(await token.nonces(await assistant.getAddress())).to.equal(BigInt(ownerNonce) + 1n);
    expect(await token.allowance(await assistant.getAddress(), protocolDiamondAddress)).to.equal(MaxUint256);
  });

  it("rejects a malicious frontrun that burned the signed nonce on a different sig", async function () {
    // User signs two DAI permits. Attacker frontruns the second (later-nonce)
    // permit directly on the token, which advances the nonce past what the
    // queue entry's signature targets. When the metatx tries to call permit
    // with the original (now-stale) nonce, the token reverts on the nonce
    // check — and the metatx unwinds, no funds move.
    const amount = "500";
    await token.mint(await assistant.getAddress(), amount);

    const expiry = MaxUint256;
    const baseNonce = await token.nonces(await assistant.getAddress());

    // Permit A — queued in the metatx.
    const a = await buildDAIPermitEntry(assistant, expiry, baseNonce);
    // Permit B — same signer, next nonce. Attacker burns this one directly.
    const b = await buildDAIPermitEntry(assistant, expiry, BigInt(baseNonce) + 1n);

    // Attacker reorders: submits permit B FIRST so the nonces no longer
    // match what permit A's signature was bound to. (DAI's nonce check is
    // strict equality, so any deviation reverts.)
    await expect(
      token
        .connect(rando)
        .permit(
          await assistant.getAddress(),
          protocolDiamondAddress,
          BigInt(baseNonce) + 1n,
          expiry,
          true,
          b.split.v,
          b.split.r,
          b.split.s
        )
    ).to.be.revertedWithCustomError(token, "InvalidNonce");

    // Submit permit A normally so nonce advances to 1.
    await token
      .connect(rando)
      .permit(
        await assistant.getAddress(),
        protocolDiamondAddress,
        baseNonce,
        expiry,
        true,
        a.split.v,
        a.split.r,
        a.split.s
      );
    // Reset allowance to simulate a freshly drained state (so our metatx
    // can't piggyback on the MAX allowance left by the frontrun and must
    // route back through permit, where the stale nonce triggers the revert).
    await token.connect(assistant).approve(protocolDiamondAddress, 0);

    // Now the metatx carries permit A's signature, but on-chain nonce is
    // already 1 — the call to token.permit() inside the helper reverts.
    const metatxNonce = parseInt(randomBytes(8));
    const { fnSig, message, signature } = await buildDepositMetaTx(assistant, amount, metatxNonce);
    const queue = encodeAuthQueue([a.entry]);

    const protocolBalanceBefore = await token.balanceOf(protocolDiamondAddress);
    await expect(
      metaTransactionsHandler
        .connect(deployer)
        .executeMetaTransactionWithTokenTransferAuthorization(
          await assistant.getAddress(),
          message.functionName,
          fnSig,
          metatxNonce,
          signature,
          queue
        )
    ).to.be.reverted;

    expect(await token.balanceOf(protocolDiamondAddress)).to.equal(protocolBalanceBefore);
  });
});
