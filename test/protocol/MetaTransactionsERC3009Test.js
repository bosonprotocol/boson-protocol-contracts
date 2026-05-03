const { ethers } = require("hardhat");
const { ZeroAddress, getContractFactory, getSigners, randomBytes, zeroPadValue, AbiCoder, MaxUint256, Signature } =
  ethers;
const { expect } = require("chai");

const { mockSeller, mockVoucherInitValues, mockAuthToken, mockDisputeResolver, accountId } = require("../util/mock");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const { prepareDataSignature, setupTestEnvironment, getSnapshot, revertToSnapshot } = require("../util/utils.js");

const AuthorizationStrategy = {
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
  return AbiCoder.defaultAbiCoder().encode(["uint8", "bytes"], [AuthorizationStrategy.ERC3009, erc3009Data]);
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
        .executeMetaTransactionWithAuthorization(
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
        .executeMetaTransactionWithAuthorization(
          await assistant.getAddress(),
          message.functionName,
          fnSig,
          nonce,
          signature,
          queue
        )
    ).to.be.reverted;
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
        .executeMetaTransactionWithAuthorization(
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
});
