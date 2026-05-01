const { ethers } = require("hardhat");
const { ZeroAddress, getContractAt, getContractFactory } = ethers;
const { expect } = require("chai");

const { mockSeller, mockVoucherInitValues, mockAuthToken, accountId } = require("../util/mock");
const { setupTestEnvironment, getSnapshot, revertToSnapshot, generateOfferId } = require("../util/utils.js");
const { signReceiveWithAuthorization } = require("../util/erc3009.js");

/**
 * Smoke tests for `depositFundsWithAuthorization`. Exercises the simplest auth-aware entry point
 * end-to-end (caller signs an ERC-3009 authorization, protocol pulls funds via the token's
 * `receiveWithAuthorization`, available funds are credited to the entity).
 *
 * Broader coverage (commit, escalate, sequential commit, fee-on-transfer, replay/expiry/tamper paths)
 * lives in the same per-handler test files alongside the existing non-auth tests; those are tracked
 * as a follow-up.
 */
describe("IBosonFundsHandler — depositFundsWithAuthorization", function () {
  let protocolDiamondAddress, fundsHandler, accountHandler, bosonErrors;
  let admin, treasury, assistant, otherSigner, deployer;
  let token, sellerId;
  let snapshotId;

  before(async function () {
    accountId.next(true);
    generateOfferId.next(true);

    const contracts = {
      accountHandler: "IBosonAccountHandler",
      fundsHandler: "IBosonFundsHandler",
    };

    const wethFactory = await getContractFactory("WETH9");
    const weth = await wethFactory.deploy();
    await weth.waitForDeployment();

    const setup = await setupTestEnvironment(contracts, { wethAddress: await weth.getAddress() });
    [, admin, treasury, otherSigner] = setup.signers;
    // Existing tests use admin as assistant (same signer) — match that pattern so createSeller passes
    assistant = admin;
    ({ accountHandler, fundsHandler } = setup.contractInstances);
    protocolDiamondAddress = setup.diamondAddress;
    bosonErrors = await getContractAt("BosonErrors", protocolDiamondAddress);
    [deployer] = await ethers.getSigners();

    const tokenFactory = await getContractFactory("Foreign20WithAuthorization");
    token = await tokenFactory.deploy();
    await token.waitForDeployment();

    const seller = mockSeller(
      await assistant.getAddress(),
      await admin.getAddress(),
      ZeroAddress,
      await treasury.getAddress(),
    );
    expect(seller.isValid()).is.true;

    const voucherInitValues = mockVoucherInitValues();
    const emptyAuthToken = mockAuthToken();
    await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);
    sellerId = seller.id;

    await token.mint(await assistant.getAddress(), 1_000_000n);

    snapshotId = await getSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();
  });

  it("happy path: pulls ERC20 via signed authorization and credits available funds", async function () {
    const tokenAddress = await token.getAddress();
    const amount = 12_345n;

    const before = await token.balanceOf(protocolDiamondAddress);

    const { authorization } = await signReceiveWithAuthorization({
      token,
      signer: assistant,
      from: await assistant.getAddress(),
      to: protocolDiamondAddress,
      value: amount,
    });

    await fundsHandler
      .connect(assistant)
      .depositFundsWithAuthorization(sellerId, tokenAddress, amount, authorization);

    const after = await token.balanceOf(protocolDiamondAddress);
    expect(after - before).to.equal(amount);

    const available = await fundsHandler.getAllAvailableFunds(sellerId);
    const found = available.find((f) => f.tokenAddress.toLowerCase() === tokenAddress.toLowerCase());
    expect(found).to.not.be.undefined;
    expect(BigInt(found.availableAmount)).to.equal(amount);
  });

  it("reverts with NativeNotAllowed when token address is zero", async function () {
    const { authorization } = await signReceiveWithAuthorization({
      token,
      signer: assistant,
      from: await assistant.getAddress(),
      to: protocolDiamondAddress,
      value: 1n,
    });

    await expect(
      fundsHandler.connect(assistant).depositFundsWithAuthorization(sellerId, ZeroAddress, 1n, authorization),
    ).to.be.revertedWithCustomError(bosonErrors, "NativeNotAllowed");
  });

  it("reverts when the authorization was signed by someone other than msg.sender", async function () {
    const tokenAddress = await token.getAddress();
    const amount = 100n;

    // Sign as `otherSigner` (some other party), but call as `assistant`
    const { authorization } = await signReceiveWithAuthorization({
      token,
      signer: otherSigner,
      from: await otherSigner.getAddress(),
      to: protocolDiamondAddress,
      value: amount,
    });

    // Token's signature recovery will reject because the protocol passes `from = msg.sender = assistant`,
    // but the signature was over `from = deployer`.
    await expect(
      fundsHandler.connect(assistant).depositFundsWithAuthorization(sellerId, tokenAddress, amount, authorization),
    ).to.be.reverted;
  });

  it("reverts on replay (same nonce used twice)", async function () {
    const tokenAddress = await token.getAddress();
    const amount = 100n;

    const { authorization, nonce } = await signReceiveWithAuthorization({
      token,
      signer: assistant,
      from: await assistant.getAddress(),
      to: protocolDiamondAddress,
      value: amount,
    });

    await fundsHandler
      .connect(assistant)
      .depositFundsWithAuthorization(sellerId, tokenAddress, amount, authorization);

    // Replay with the same nonce → token rejects
    await expect(
      fundsHandler.connect(assistant).depositFundsWithAuthorization(sellerId, tokenAddress, amount, authorization),
    ).to.be.reverted;

    // Sanity: the token marked the nonce as used
    expect(await token.authorizationState(await assistant.getAddress(), nonce)).to.equal(true);
  });

  it("reverts when the protocol-required amount differs from the signed amount", async function () {
    const tokenAddress = await token.getAddress();

    const { authorization } = await signReceiveWithAuthorization({
      token,
      signer: assistant,
      from: await assistant.getAddress(),
      to: protocolDiamondAddress,
      value: 100n,
    });

    // Caller asks the protocol to pull 200 even though the signature is for 100 → token rejects
    await expect(
      fundsHandler.connect(assistant).depositFundsWithAuthorization(sellerId, tokenAddress, 200n, authorization),
    ).to.be.reverted;
  });

  it("reverts InsufficientValueReceived when token under-delivers (defensive balance check)", async function () {
    const feeTokenFactory = await getContractFactory("Foreign20WithAuthorizationFeeOnTransfer");
    const feeToken = await feeTokenFactory.deploy();
    await feeToken.waitForDeployment();
    const feeTokenAddress = await feeToken.getAddress();

    await feeToken.mint(await assistant.getAddress(), 1_000_000n);

    const amount = 100n;
    const { authorization } = await signReceiveWithAuthorization({
      token: feeToken,
      signer: assistant,
      from: await assistant.getAddress(),
      to: protocolDiamondAddress,
      value: amount,
    });

    await expect(
      fundsHandler
        .connect(assistant)
        .depositFundsWithAuthorization(sellerId, feeTokenAddress, amount, authorization),
    ).to.be.revertedWithCustomError(bosonErrors, "InsufficientValueReceived");
  });
});
