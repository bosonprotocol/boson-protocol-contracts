const { ethers } = require("hardhat");
const { expect } = require("chai");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { ZeroAddress, MaxUint256, getContractAt, getContractFactory, parseUnits, provider, Signature } = ethers;

const {
  setupTestEnvironment,
  getSnapshot,
  revertToSnapshot,
  setNextBlockTimestamp,
  calculateBosonProxyAddress,
  calculateCloneAddress,
  deriveTokenId,
  generateOfferId,
  prepareDataSignature,
} = require("../../util/utils.js");
const {
  mockSeller,
  mockBuyer,
  mockOffer,
  mockDisputeResolver,
  mockVoucherInitValues,
  mockAuthToken,
  accountId,
} = require("../../util/mock.js");
const { DisputeResolverFee } = require("../../../scripts/domain/DisputeResolverFee");
const { RoyaltyInfo } = require("../../../scripts/domain/RoyaltyInfo");
const { RevertReasons } = require("../../../scripts/config/revert-reasons.js");

const RECEIVE_TYPES = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

const PERMIT_TYPES = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

const DEPOSIT_AUTH_ACTION_TYPES = {
  DepositFundsWithAuthorization: [
    { name: "entityId", type: "uint256" },
    { name: "v", type: "uint8" },
    { name: "r", type: "bytes32" },
    { name: "s", type: "bytes32" },
  ],
};

const DEPOSIT_PERMIT_ACTION_TYPES = {
  DepositFundsWithPermit: [
    { name: "entityId", type: "uint256" },
    { name: "token", type: "address" },
    { name: "value", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "actionNonce", type: "uint256" },
  ],
};

const COMMIT_AUTH_ACTION_TYPES = {
  CommitToOfferWithAuthorization: [
    { name: "committer", type: "address" },
    { name: "offerId", type: "uint256" },
    { name: "v", type: "uint8" },
    { name: "r", type: "bytes32" },
    { name: "s", type: "bytes32" },
  ],
};

const COMMIT_PERMIT_ACTION_TYPES = {
  CommitToOfferWithPermit: [
    { name: "committer", type: "address" },
    { name: "offerId", type: "uint256" },
    { name: "token", type: "address" },
    { name: "value", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "actionNonce", type: "uint256" },
  ],
};

function makeNonce(seed) {
  return ethers.zeroPadValue(ethers.toBeHex(seed), 32);
}

function sigToTuple(sig) {
  return { v: sig.v, r: sig.r, s: sig.s };
}

describe("BosonAuthorizedTransferForwarder", function () {
  let admin, treasury, rando, buyer, adminDR, treasuryDR, other, other2;
  let assistant, assistantDR, clerk, clerkDR;
  let accountHandler, fundsHandler, exchangeCommitHandler, exchangeHandler, offerHandler;
  let authToken, permitToken;
  let forwarder;
  let trustedForwarder;
  let protocolDiamondAddress;
  let seller, buyerEntity, offerAuthToken, offerPermitToken;
  let depositAmount;
  let snapshotId;
  let bosonErrors;
  let nonceCounter = 1;
  let voucherInitValues;
  let emptyAuthToken;

  const VALID_AFTER = 0;
  const FAR_FUTURE = 2000000000; // 2033

  async function authTokenDomain() {
    return {
      name: "Foreign20WithAuthorization",
      version: "1",
      chainId: (await provider.getNetwork()).chainId,
      verifyingContract: await authToken.getAddress(),
    };
  }

  async function permitTokenDomain() {
    return {
      name: "Foreign20WithPermit",
      version: "1",
      chainId: (await provider.getNetwork()).chainId,
      verifyingContract: await permitToken.getAddress(),
    };
  }

  async function forwarderDomain() {
    return {
      name: "BosonAuthorizedTransferForwarder",
      version: "1",
      chainId: (await provider.getNetwork()).chainId,
      verifyingContract: await forwarder.getAddress(),
    };
  }

  async function signReceive(signer, message) {
    const sig = await signer.signTypedData(await authTokenDomain(), RECEIVE_TYPES, message);
    return Signature.from(sig);
  }

  async function signPermit(signer, message) {
    const sig = await signer.signTypedData(await permitTokenDomain(), PERMIT_TYPES, message);
    return Signature.from(sig);
  }

  async function signActionTyped(signer, types, message) {
    const sig = await signer.signTypedData(await forwarderDomain(), types, message);
    return Signature.from(sig);
  }

  async function freshNonce() {
    return makeNonce(nonceCounter++);
  }

  // -- ERC-3009 builders ---------------------------------------------------

  async function authorizeERC3009(signer, value, overrides = {}) {
    await authToken.mint(await signer.getAddress(), value);
    const nonce = overrides.nonce ?? (await freshNonce());
    const message = {
      from: await signer.getAddress(),
      to: await forwarder.getAddress(),
      value,
      validAfter: overrides.validAfter ?? VALID_AFTER,
      validBefore: overrides.validBefore ?? FAR_FUTURE,
      nonce,
    };
    const sig = overrides.signWith
      ? await signReceive(overrides.signWith, message)
      : await signReceive(signer, message);
    return { message, sig };
  }

  async function buildDepositAuthCall(authSigner, value, entityId, opts = {}) {
    const { message, sig } = await authorizeERC3009(authSigner, value, opts);
    const actionSigner = opts.actionSigner ?? authSigner;
    const actionEntityId = opts.actionEntityId ?? entityId;
    const action = await signActionTyped(actionSigner, DEPOSIT_AUTH_ACTION_TYPES, {
      entityId: actionEntityId,
      v: sig.v,
      r: sig.r,
      s: sig.s,
    });
    return {
      message,
      sig,
      args: [
        await authToken.getAddress(),
        message.from,
        message.value,
        message.validAfter,
        message.validBefore,
        message.nonce,
        sig.v,
        sig.r,
        sig.s,
        entityId,
        sigToTuple(action),
      ],
    };
  }

  async function buildCommitAuthCall(authSigner, value, committer, offerId, opts = {}) {
    const { message, sig } = await authorizeERC3009(authSigner, value, opts);
    const actionSigner = opts.actionSigner ?? authSigner;
    const actionCommitter = opts.actionCommitter ?? committer;
    const actionOfferId = opts.actionOfferId ?? offerId;
    const action = await signActionTyped(actionSigner, COMMIT_AUTH_ACTION_TYPES, {
      committer: actionCommitter,
      offerId: actionOfferId,
      v: sig.v,
      r: sig.r,
      s: sig.s,
    });
    return {
      message,
      sig,
      args: [
        await authToken.getAddress(),
        message.from,
        message.value,
        message.validAfter,
        message.validBefore,
        message.nonce,
        sig.v,
        sig.r,
        sig.s,
        committer,
        offerId,
        sigToTuple(action),
      ],
    };
  }

  // -- EIP-2612 builders ---------------------------------------------------

  async function authorizePermit(signer, value, overrides = {}) {
    await permitToken.mint(await signer.getAddress(), value);
    const owner = await signer.getAddress();
    const nonce = overrides.nonce ?? (await permitToken.nonces(owner));
    const message = {
      owner,
      spender: overrides.spender ?? (await forwarder.getAddress()),
      value: overrides.permitValue ?? value,
      nonce,
      deadline: overrides.deadline ?? FAR_FUTURE,
    };
    const sig = overrides.signWith ? await signPermit(overrides.signWith, message) : await signPermit(signer, message);
    return { message, sig };
  }

  let actionNonceCounter = 1;
  function freshActionNonce() {
    return actionNonceCounter++;
  }

  async function buildDepositPermitCall(authSigner, value, entityId, opts = {}) {
    const { message, sig } = await authorizePermit(authSigner, value, opts);
    const actionSigner = opts.actionSigner ?? authSigner;
    const actionEntityId = opts.actionEntityId ?? entityId;
    const tokenAddr = await permitToken.getAddress();
    const actionToken = opts.actionToken ?? tokenAddr;
    const actionValue = opts.actionValue ?? message.value;
    const actionDeadline = opts.actionDeadline ?? message.deadline;
    const actionNonce = opts.actionNonce ?? freshActionNonce();
    const action = await signActionTyped(actionSigner, DEPOSIT_PERMIT_ACTION_TYPES, {
      entityId: actionEntityId,
      token: actionToken,
      value: actionValue,
      deadline: actionDeadline,
      actionNonce,
    });
    return {
      message,
      sig,
      actionNonce,
      args: [
        tokenAddr,
        message.owner,
        message.value,
        message.deadline,
        sig.v,
        sig.r,
        sig.s,
        entityId,
        actionNonce,
        sigToTuple(action),
      ],
    };
  }

  async function buildCommitPermitCall(authSigner, value, committer, offerId, opts = {}) {
    const { message, sig } = await authorizePermit(authSigner, value, opts);
    const actionSigner = opts.actionSigner ?? authSigner;
    const actionCommitter = opts.actionCommitter ?? committer;
    const actionOfferId = opts.actionOfferId ?? offerId;
    const tokenAddr = await permitToken.getAddress();
    const actionToken = opts.actionToken ?? tokenAddr;
    const actionValue = opts.actionValue ?? message.value;
    const actionDeadline = opts.actionDeadline ?? message.deadline;
    const actionNonce = opts.actionNonce ?? freshActionNonce();
    const action = await signActionTyped(actionSigner, COMMIT_PERMIT_ACTION_TYPES, {
      committer: actionCommitter,
      offerId: actionOfferId,
      token: actionToken,
      value: actionValue,
      deadline: actionDeadline,
      actionNonce,
    });
    return {
      message,
      sig,
      actionNonce,
      args: [
        tokenAddr,
        message.owner,
        message.value,
        message.deadline,
        sig.v,
        sig.r,
        sig.s,
        committer,
        offerId,
        actionNonce,
        sigToTuple(action),
      ],
    };
  }

  before(async function () {
    accountId.next(true);
    generateOfferId.next(true);

    // Deploy a MockForwarder to act as BosonVoucher's trusted ERC-2771 forwarder.
    // BosonVoucher impl bakes this address in at construction; the
    // redeem-preminted flow relies on it for routing the seller's voucher transfer.
    const TrustedForwarderFactory = await getContractFactory("MockForwarder");
    trustedForwarder = await TrustedForwarderFactory.deploy();
    await trustedForwarder.waitForDeployment();

    const contracts = {
      accountHandler: "IBosonAccountHandler",
      offerHandler: "IBosonOfferHandler",
      exchangeCommitHandler: "IBosonExchangeCommitHandler",
      exchangeHandler: "IBosonExchangeHandler",
      fundsHandler: "IBosonFundsHandler",
    };

    ({
      signers: [, admin, treasury, rando, buyer, , adminDR, treasuryDR, other, other2],
      contractInstances: { accountHandler, offerHandler, exchangeCommitHandler, exchangeHandler, fundsHandler },
      diamondAddress: protocolDiamondAddress,
    } = await setupTestEnvironment(contracts, { forwarderAddress: [await trustedForwarder.getAddress()] }));

    bosonErrors = await getContractAt("BosonErrors", protocolDiamondAddress);

    assistant = admin;
    assistantDR = adminDR;
    clerk = clerkDR = { address: ZeroAddress };

    const AuthTokenFactory = await getContractFactory("Foreign20WithAuthorization");
    authToken = await AuthTokenFactory.deploy();
    await authToken.waitForDeployment();

    const PermitTokenFactory = await getContractFactory("Foreign20WithPermit");
    permitToken = await PermitTokenFactory.deploy();
    await permitToken.waitForDeployment();

    const ForwarderFactory = await getContractFactory("BosonAuthorizedTransferForwarder");
    forwarder = await ForwarderFactory.deploy(protocolDiamondAddress);
    await forwarder.waitForDeployment();

    await calculateBosonProxyAddress(protocolDiamondAddress);

    voucherInitValues = mockVoucherInitValues();
    emptyAuthToken = mockAuthToken();
    seller = mockSeller(
      await assistant.getAddress(),
      await admin.getAddress(),
      clerk.address,
      await treasury.getAddress()
    );
    await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

    const drFeeAmount = parseUnits("0.001", "ether").toString();
    const disputeResolver = mockDisputeResolver(
      await assistantDR.getAddress(),
      await adminDR.getAddress(),
      clerkDR.address,
      await treasuryDR.getAddress(),
      true
    );
    const disputeResolverFees = [
      new DisputeResolverFee(ZeroAddress, "Native", drFeeAmount),
      new DisputeResolverFee(await authToken.getAddress(), "ERC3009", drFeeAmount),
      new DisputeResolverFee(await permitToken.getAddress(), "Permit", drFeeAmount),
    ];
    await accountHandler.connect(adminDR).createDisputeResolver(disputeResolver, disputeResolverFees, []);

    const buyerData = mockBuyer(await buyer.getAddress());
    await accountHandler.connect(buyer).createBuyer(buyerData);
    buyerEntity = buyerData;
    buyerEntity.id = "3";

    const baseOffer = await mockOffer();

    // ERC-3009 priced offer
    {
      const { offer, offerDates, offerDurations, drParams } = baseOffer;
      offer.exchangeToken = await authToken.getAddress();
      offer.id = "0";
      offer.quantityAvailable = "100";
      offer.royaltyInfo = [new RoyaltyInfo([ZeroAddress], ["0"])];
      offerAuthToken = offer;
      offerAuthToken.id = await offerHandler
        .connect(assistant)
        .createOffer(offerAuthToken, offerDates, offerDurations, drParams, "0", MaxUint256, { getOfferId: true });
    }

    // Permit-priced offer (needs a fresh mockOffer instance to avoid mutating the same struct)
    {
      const fresh = await mockOffer();
      const offer = fresh.offer;
      offer.exchangeToken = await permitToken.getAddress();
      offer.id = "0";
      offer.quantityAvailable = "100";
      offer.royaltyInfo = [new RoyaltyInfo([ZeroAddress], ["0"])];
      offerPermitToken = offer;
      offerPermitToken.id = await offerHandler
        .connect(assistant)
        .createOffer(offerPermitToken, fresh.offerDates, fresh.offerDurations, fresh.drParams, "0", MaxUint256, {
          getOfferId: true,
        });
    }

    // Pre-fund seller deposit pools for both tokens
    const sellerPool = parseUnits("100", "ether");
    await authToken.mint(await assistant.getAddress(), sellerPool);
    await authToken.connect(assistant).approve(protocolDiamondAddress, sellerPool);
    await fundsHandler.connect(assistant).depositFunds(seller.id, await authToken.getAddress(), sellerPool);

    await permitToken.mint(await assistant.getAddress(), sellerPool);
    await permitToken.connect(assistant).approve(protocolDiamondAddress, sellerPool);
    await fundsHandler.connect(assistant).depositFunds(seller.id, await permitToken.getAddress(), sellerPool);

    depositAmount = parseUnits("100", "ether");

    snapshotId = await getSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();
  });

  context("📋 Constructor", async function () {
    it("reverts on zero protocol address", async function () {
      const ForwarderFactory = await getContractFactory("BosonAuthorizedTransferForwarder");
      await expect(ForwarderFactory.deploy(ZeroAddress)).to.be.revertedWithCustomError(
        forwarder,
        "InvalidProtocolAddress"
      );
    });

    it("stores protocol as immutable", async function () {
      expect(await forwarder.protocol()).to.equal(protocolDiamondAddress);
    });
  });

  // ========================================================================
  //  ERC-3009 flow
  // ========================================================================

  context("📋 depositFundsWithAuthorization (ERC-3009)", async function () {
    it("credits the seller entity and emits FundsDeposited", async function () {
      const { args } = await buildDepositAuthCall(rando, depositAmount, seller.id);
      await expect(forwarder.depositFundsWithAuthorization(...args))
        .to.emit(fundsHandler, "FundsDeposited")
        .withArgs(seller.id, await forwarder.getAddress(), await authToken.getAddress(), depositAmount);
    });

    it("credits the buyer entity", async function () {
      const { args } = await buildDepositAuthCall(rando, depositAmount, buyerEntity.id);
      await expect(forwarder.depositFundsWithAuthorization(...args))
        .to.emit(fundsHandler, "FundsDeposited")
        .withArgs(buyerEntity.id, await forwarder.getAddress(), await authToken.getAddress(), depositAmount);
    });

    it("reverts when token is the zero address", async function () {
      const { args } = await buildDepositAuthCall(rando, depositAmount, seller.id);
      args[0] = ZeroAddress;
      await expect(forwarder.depositFundsWithAuthorization(...args)).to.be.revertedWithCustomError(
        forwarder,
        "InvalidTokenAddress"
      );
    });

    it("reverts when value is zero", async function () {
      const { args } = await buildDepositAuthCall(rando, depositAmount, seller.id);
      args[2] = 0;
      await expect(forwarder.depositFundsWithAuthorization(...args)).to.be.revertedWithCustomError(
        forwarder,
        "ZeroValue"
      );
    });

    it("reverts when entityId is unknown", async function () {
      const { args } = await buildDepositAuthCall(rando, depositAmount, "999999");
      await expect(forwarder.depositFundsWithAuthorization(...args)).to.be.revertedWithCustomError(
        bosonErrors,
        RevertReasons.NO_SUCH_ENTITY
      );
    });
  });

  context("📋 commitToOfferWithAuthorization (ERC-3009)", async function () {
    it("commits and credits voucher to committer == from", async function () {
      const price = BigInt(offerAuthToken.price.toString());
      const { args } = await buildCommitAuthCall(buyer, price, await buyer.getAddress(), offerAuthToken.id);
      await expect(forwarder.commitToOfferWithAuthorization(...args))
        .to.emit(exchangeCommitHandler, "BuyerCommitted")
        .withArgs(offerAuthToken.id, buyerEntity.id, anyValue, anyValue, anyValue, await forwarder.getAddress());
    });

    it("commits when committer is a third party different from signer", async function () {
      const price = BigInt(offerAuthToken.price.toString());
      const { args } = await buildCommitAuthCall(rando, price, await buyer.getAddress(), offerAuthToken.id);
      await expect(forwarder.commitToOfferWithAuthorization(...args))
        .to.emit(exchangeCommitHandler, "BuyerCommitted")
        .withArgs(offerAuthToken.id, buyerEntity.id, anyValue, anyValue, anyValue, await forwarder.getAddress());
    });

    it("reverts when authorized value is less than offer price", async function () {
      const price = BigInt(offerAuthToken.price.toString());
      const { args } = await buildCommitAuthCall(buyer, price - 1n, await buyer.getAddress(), offerAuthToken.id);
      await expect(forwarder.commitToOfferWithAuthorization(...args)).to.be.revertedWith(
        "ERC20: insufficient allowance"
      );
    });
  });

  // ========================================================================
  //  EIP-2612 (permit) flow
  // ========================================================================

  context("📋 depositFundsWithPermit (EIP-2612)", async function () {
    it("credits the seller entity and emits FundsDeposited", async function () {
      const { args } = await buildDepositPermitCall(rando, depositAmount, seller.id);
      await expect(forwarder.depositFundsWithPermit(...args))
        .to.emit(fundsHandler, "FundsDeposited")
        .withArgs(seller.id, await forwarder.getAddress(), await permitToken.getAddress(), depositAmount);
    });

    it("credits the buyer entity", async function () {
      const { args } = await buildDepositPermitCall(rando, depositAmount, buyerEntity.id);
      await expect(forwarder.depositFundsWithPermit(...args))
        .to.emit(fundsHandler, "FundsDeposited")
        .withArgs(buyerEntity.id, await forwarder.getAddress(), await permitToken.getAddress(), depositAmount);
    });

    it("reverts when token is the zero address", async function () {
      const { args } = await buildDepositPermitCall(rando, depositAmount, seller.id);
      args[0] = ZeroAddress;
      await expect(forwarder.depositFundsWithPermit(...args)).to.be.revertedWithCustomError(
        forwarder,
        "InvalidTokenAddress"
      );
    });

    it("reverts when value is zero", async function () {
      const { args } = await buildDepositPermitCall(rando, depositAmount, seller.id);
      args[2] = 0;
      await expect(forwarder.depositFundsWithPermit(...args)).to.be.revertedWithCustomError(forwarder, "ZeroValue");
    });

    it("reverts when entityId is unknown", async function () {
      const { args } = await buildDepositPermitCall(rando, depositAmount, "999999");
      await expect(forwarder.depositFundsWithPermit(...args)).to.be.revertedWithCustomError(
        bosonErrors,
        RevertReasons.NO_SUCH_ENTITY
      );
    });

    it("succeeds even if permit was already consumed (front-runner DoS resilience)", async function () {
      // Build a call, but consume the permit nonce via a direct call before invoking the forwarder.
      const { message, sig, args } = await buildDepositPermitCall(rando, depositAmount, seller.id);
      // Front-runner consumes the permit directly on the token.
      await permitToken
        .connect(other)
        .permit(message.owner, message.spender, message.value, message.deadline, sig.v, sig.r, sig.s);
      // Allowance is now set to `value` for the forwarder; forwarder's internal try/catch
      // tolerates the second permit call reverting on stale nonce.
      await expect(forwarder.depositFundsWithPermit(...args)).to.emit(fundsHandler, "FundsDeposited");
    });
  });

  context("📋 commitToOfferWithPermit (EIP-2612)", async function () {
    it("commits and credits voucher to committer == from", async function () {
      const price = BigInt(offerPermitToken.price.toString());
      const { args } = await buildCommitPermitCall(buyer, price, await buyer.getAddress(), offerPermitToken.id);
      await expect(forwarder.commitToOfferWithPermit(...args))
        .to.emit(exchangeCommitHandler, "BuyerCommitted")
        .withArgs(offerPermitToken.id, buyerEntity.id, anyValue, anyValue, anyValue, await forwarder.getAddress());
    });

    it("commits when committer is a third party different from signer", async function () {
      const price = BigInt(offerPermitToken.price.toString());
      const { args } = await buildCommitPermitCall(rando, price, await buyer.getAddress(), offerPermitToken.id);
      await expect(forwarder.commitToOfferWithPermit(...args))
        .to.emit(exchangeCommitHandler, "BuyerCommitted")
        .withArgs(offerPermitToken.id, buyerEntity.id, anyValue, anyValue, anyValue, await forwarder.getAddress());
    });

    it("reverts when permitted value is less than offer price", async function () {
      const price = BigInt(offerPermitToken.price.toString());
      const { args } = await buildCommitPermitCall(buyer, price - 1n, await buyer.getAddress(), offerPermitToken.id);
      await expect(forwarder.commitToOfferWithPermit(...args)).to.be.revertedWith("ERC20: insufficient allowance");
    });
  });

  // ========================================================================
  //  Front-run resistance — both flows
  // ========================================================================

  context("📋 Front-run resistance via action signature (ERC-3009)", async function () {
    it("depositFunds reverts when entityId is swapped after signing", async function () {
      const { args } = await buildDepositAuthCall(rando, depositAmount, buyerEntity.id, {
        actionEntityId: seller.id,
      });
      await expect(forwarder.depositFundsWithAuthorization(...args)).to.be.revertedWithCustomError(
        forwarder,
        "InvalidActionSignature"
      );
    });

    it("depositFunds reverts when action sig is signed by someone other than `from`", async function () {
      const { args } = await buildDepositAuthCall(rando, depositAmount, seller.id, {
        actionSigner: other,
      });
      await expect(forwarder.depositFundsWithAuthorization(...args)).to.be.revertedWithCustomError(
        forwarder,
        "InvalidActionSignature"
      );
    });

    it("commitToOffer reverts when committer is swapped after signing", async function () {
      const price = BigInt(offerAuthToken.price.toString());
      const { args } = await buildCommitAuthCall(buyer, price, await other.getAddress(), offerAuthToken.id, {
        actionCommitter: await buyer.getAddress(),
      });
      await expect(forwarder.commitToOfferWithAuthorization(...args)).to.be.revertedWithCustomError(
        forwarder,
        "InvalidActionSignature"
      );
    });

    it("commitToOffer reverts when offerId is swapped after signing", async function () {
      const price = BigInt(offerAuthToken.price.toString());
      const { args } = await buildCommitAuthCall(buyer, price, await buyer.getAddress(), offerAuthToken.id, {
        actionOfferId: BigInt(offerAuthToken.id) + 1n,
      });
      await expect(forwarder.commitToOfferWithAuthorization(...args)).to.be.revertedWithCustomError(
        forwarder,
        "InvalidActionSignature"
      );
    });

    it("commitToOffer reverts when action sig is signed by someone other than `from`", async function () {
      const price = BigInt(offerAuthToken.price.toString());
      const { args } = await buildCommitAuthCall(buyer, price, await buyer.getAddress(), offerAuthToken.id, {
        actionSigner: other,
      });
      await expect(forwarder.commitToOfferWithAuthorization(...args)).to.be.revertedWithCustomError(
        forwarder,
        "InvalidActionSignature"
      );
    });
  });

  context("📋 Front-run resistance via action signature (EIP-2612)", async function () {
    it("depositFunds reverts when entityId is swapped after signing", async function () {
      const { args } = await buildDepositPermitCall(rando, depositAmount, buyerEntity.id, {
        actionEntityId: seller.id,
      });
      await expect(forwarder.depositFundsWithPermit(...args)).to.be.revertedWithCustomError(
        forwarder,
        "InvalidActionSignature"
      );
    });

    it("depositFunds reverts when action sig is signed by someone other than `from`", async function () {
      const { args } = await buildDepositPermitCall(rando, depositAmount, seller.id, {
        actionSigner: other,
      });
      await expect(forwarder.depositFundsWithPermit(...args)).to.be.revertedWithCustomError(
        forwarder,
        "InvalidActionSignature"
      );
    });

    it("commitToOffer reverts when committer is swapped after signing", async function () {
      const price = BigInt(offerPermitToken.price.toString());
      const { args } = await buildCommitPermitCall(buyer, price, await other.getAddress(), offerPermitToken.id, {
        actionCommitter: await buyer.getAddress(),
      });
      await expect(forwarder.commitToOfferWithPermit(...args)).to.be.revertedWithCustomError(
        forwarder,
        "InvalidActionSignature"
      );
    });

    it("commitToOffer reverts when offerId is swapped after signing", async function () {
      const price = BigInt(offerPermitToken.price.toString());
      const { args } = await buildCommitPermitCall(buyer, price, await buyer.getAddress(), offerPermitToken.id, {
        actionOfferId: BigInt(offerPermitToken.id) + 1n,
      });
      await expect(forwarder.commitToOfferWithPermit(...args)).to.be.revertedWithCustomError(
        forwarder,
        "InvalidActionSignature"
      );
    });

    it("commitToOffer reverts when action sig is signed by someone other than `from`", async function () {
      const price = BigInt(offerPermitToken.price.toString());
      const { args } = await buildCommitPermitCall(buyer, price, await buyer.getAddress(), offerPermitToken.id, {
        actionSigner: other,
      });
      await expect(forwarder.commitToOfferWithPermit(...args)).to.be.revertedWithCustomError(
        forwarder,
        "InvalidActionSignature"
      );
    });

    it("depositFunds reverts when token is swapped after signing", async function () {
      // Action sig binds `token` explicitly. Caller passing a different token
      // (even one for which the signer happens to have a standing allowance)
      // fails on the action sig check.
      const { args } = await buildDepositPermitCall(rando, depositAmount, seller.id, {
        actionToken: await authToken.getAddress(), // signed for a different token than passed
      });
      await expect(forwarder.depositFundsWithPermit(...args)).to.be.revertedWithCustomError(
        forwarder,
        "InvalidActionSignature"
      );
    });

    it("depositFunds reverts when value is swapped after signing", async function () {
      const { args } = await buildDepositPermitCall(rando, depositAmount, seller.id, {
        actionValue: depositAmount + 1n,
      });
      await expect(forwarder.depositFundsWithPermit(...args)).to.be.revertedWithCustomError(
        forwarder,
        "InvalidActionSignature"
      );
    });

    it("depositFunds reverts when deadline is swapped after signing", async function () {
      const { args } = await buildDepositPermitCall(rando, depositAmount, seller.id, {
        actionDeadline: FAR_FUTURE - 1,
      });
      await expect(forwarder.depositFundsWithPermit(...args)).to.be.revertedWithCustomError(
        forwarder,
        "InvalidActionSignature"
      );
    });
  });

  // ========================================================================
  //  Cross-permit replay attack (the scenario the action nonce defeats)
  // ========================================================================

  context("📋 Cross-permit replay attack", async function () {
    it("attacker cannot redirect a later commit to an earlier offer using a stale action sig", async function () {
      // Setup: two offers (A, B) that happen to share the same exchange token
      // and price. User commits to A legitimately, then signs a new permit +
      // action sig for B. Attacker tries to replay the (already-used) action
      // sig for A together with the new permit's allowance.
      const price = BigInt(offerPermitToken.price.toString());

      // 1) Legit commit to offerA = offerPermitToken.id
      const offerA = offerPermitToken.id;
      const callA = await buildCommitPermitCall(buyer, price, await buyer.getAddress(), offerA);
      await forwarder.commitToOfferWithPermit(...callA.args);

      // Action nonce A has been burned. Replaying callA.args reverts.
      await permitToken.mint(await buyer.getAddress(), price);
      await expect(forwarder.commitToOfferWithPermit(...callA.args)).to.be.revertedWithCustomError(
        forwarder,
        "ActionNonceAlreadyUsed"
      );

      // 2) User now signs a new permit + action sig for the same offer (would be
      //    offer B in the real attack — same exchange token + same price suffices
      //    to demonstrate the danger). Attacker observes the pending tx and
      //    consumes the new permit directly on the token to set forwarder
      //    allowance, then tries to splice callA's action sig with the new
      //    allowance. The action nonce check rejects it.
      const callB = await buildCommitPermitCall(buyer, price, await buyer.getAddress(), offerA);
      await permitToken
        .connect(other)
        .permit(
          callB.message.owner,
          callB.message.spender,
          callB.message.value,
          callB.message.deadline,
          callB.sig.v,
          callB.sig.r,
          callB.sig.s
        );
      // Allowance is now set; attacker would normally splice callA.args here.
      // callA.args is rejected by the action-nonce mapping (already used above):
      await expect(forwarder.commitToOfferWithPermit(...callA.args)).to.be.revertedWithCustomError(
        forwarder,
        "ActionNonceAlreadyUsed"
      );

      // The legitimate user tx (callB) still works; the forwarder's permit()
      // reverts inside try/catch (nonce already consumed by attacker), but the
      // standing allowance suffices and action nonce B is unused.
      await expect(forwarder.commitToOfferWithPermit(...callB.args)).to.emit(exchangeCommitHandler, "BuyerCommitted");
    });
  });

  // ========================================================================
  //  Inner-authorization invariants
  // ========================================================================

  context("📋 ERC-3009 authorization invariants", async function () {
    it("reverts on bad ERC-3009 signature (signer != from)", async function () {
      const { args } = await buildDepositAuthCall(rando, depositAmount, seller.id, { signWith: other });
      await expect(forwarder.depositFundsWithAuthorization(...args)).to.be.revertedWithCustomError(
        authToken,
        "InvalidSignature3009"
      );
    });

    it("reverts when block.timestamp >= validBefore (expired)", async function () {
      const blk = await provider.getBlock("latest");
      const validBefore = blk.timestamp + 100;
      const { args } = await buildDepositAuthCall(rando, depositAmount, seller.id, { validBefore });
      await setNextBlockTimestamp(validBefore + 10);
      await expect(forwarder.depositFundsWithAuthorization(...args)).to.be.revertedWithCustomError(
        authToken,
        "AuthorizationExpired"
      );
    });

    it("reverts when block.timestamp <= validAfter (not yet valid)", async function () {
      const blk = await provider.getBlock("latest");
      const validAfter = blk.timestamp + 1000;
      const { args } = await buildDepositAuthCall(rando, depositAmount, seller.id, {
        validAfter,
        validBefore: validAfter + 100000,
      });
      await expect(forwarder.depositFundsWithAuthorization(...args)).to.be.revertedWithCustomError(
        authToken,
        "AuthorizationNotYetValid"
      );
    });

    it("reverts on reused nonce", async function () {
      const nonce = await freshNonce();
      const first = await buildDepositAuthCall(rando, depositAmount, seller.id, { nonce });
      await forwarder.depositFundsWithAuthorization(...first.args);
      await authToken.mint(await rando.getAddress(), depositAmount);
      await expect(forwarder.depositFundsWithAuthorization(...first.args)).to.be.revertedWithCustomError(
        authToken,
        "AuthorizationUsedOrCanceled"
      );
    });

    it("EOA calling token directly with same sig fails (CallerMustBeRecipient)", async function () {
      const { message, sig } = await authorizeERC3009(rando, depositAmount);
      await expect(
        authToken
          .connect(other2)
          .receiveWithAuthorization(
            message.from,
            message.to,
            message.value,
            message.validAfter,
            message.validBefore,
            message.nonce,
            sig.v,
            sig.r,
            sig.s
          )
      ).to.be.revertedWithCustomError(authToken, "CallerMustBeRecipient");
    });
  });

  context("📋 EIP-2612 permit invariants", async function () {
    it("reverts when permit signer is not `from`", async function () {
      const { args } = await buildDepositPermitCall(rando, depositAmount, seller.id, { signWith: other });
      // permit() reverts → caught by try/catch → no allowance set → transferFrom fails.
      await expect(forwarder.depositFundsWithPermit(...args)).to.be.revertedWith("ERC20: insufficient allowance");
    });

    it("reverts when deadline has passed", async function () {
      const blk = await provider.getBlock("latest");
      const deadline = blk.timestamp + 100;
      const { args } = await buildDepositPermitCall(rando, depositAmount, seller.id, { deadline });
      await setNextBlockTimestamp(deadline + 10);
      // Same: expired permit reverts inside try/catch → no allowance → transferFrom fails.
      await expect(forwarder.depositFundsWithPermit(...args)).to.be.revertedWith("ERC20: insufficient allowance");
    });

    it("reverts on reused action nonce (replay protection)", async function () {
      // Same call (same actionNonce) cannot be used twice — burned on first success.
      const { args } = await buildDepositPermitCall(rando, depositAmount, seller.id);
      await forwarder.depositFundsWithPermit(...args);
      await permitToken.mint(await rando.getAddress(), depositAmount);
      await expect(forwarder.depositFundsWithPermit(...args)).to.be.revertedWithCustomError(
        forwarder,
        "ActionNonceAlreadyUsed"
      );
    });
  });

  // ========================================================================
  //  Allowance / balance hygiene
  // ========================================================================

  context("📋 Allowance and balance hygiene", async function () {
    it("ERC-3009: zero allowance + balance after a successful deposit", async function () {
      const { args } = await buildDepositAuthCall(rando, depositAmount, seller.id);
      await forwarder.depositFundsWithAuthorization(...args);
      expect(await authToken.allowance(await forwarder.getAddress(), protocolDiamondAddress)).to.equal(0n);
      expect(await authToken.balanceOf(await forwarder.getAddress())).to.equal(0n);
    });

    it("ERC-3009: zero allowance + balance after a successful commit", async function () {
      const price = BigInt(offerAuthToken.price.toString());
      const { args } = await buildCommitAuthCall(buyer, price, await buyer.getAddress(), offerAuthToken.id);
      await forwarder.commitToOfferWithAuthorization(...args);
      expect(await authToken.allowance(await forwarder.getAddress(), protocolDiamondAddress)).to.equal(0n);
      expect(await authToken.balanceOf(await forwarder.getAddress())).to.equal(0n);
    });

    it("Permit: zero allowance + balance after a successful deposit", async function () {
      const { args } = await buildDepositPermitCall(rando, depositAmount, seller.id);
      await forwarder.depositFundsWithPermit(...args);
      expect(await permitToken.allowance(await forwarder.getAddress(), protocolDiamondAddress)).to.equal(0n);
      expect(await permitToken.balanceOf(await forwarder.getAddress())).to.equal(0n);
    });

    it("Permit: zero allowance + balance after a successful commit", async function () {
      const price = BigInt(offerPermitToken.price.toString());
      const { args } = await buildCommitPermitCall(buyer, price, await buyer.getAddress(), offerPermitToken.id);
      await forwarder.commitToOfferWithPermit(...args);
      expect(await permitToken.allowance(await forwarder.getAddress(), protocolDiamondAddress)).to.equal(0n);
      expect(await permitToken.balanceOf(await forwarder.getAddress())).to.equal(0n);
    });
  });

  // ==========================================================================
  //  Single-tx commit + redeem (preminted offers, ERC-3009)
  // ==========================================================================

  context("📋 redeemPremintedOfferWithAuthorization (preminted commit + redeem)", async function () {
    let bosonVoucher;
    let premintedOffer;
    let premintedTokenId;
    let premintedExchangeId;

    const REDEEM_PREMINTED_ACTION_TYPES = {
      RedeemPremintedOfferWithAuthorization: [
        { name: "buyer", type: "address" },
        { name: "voucher", type: "address" },
        { name: "tokenId", type: "uint256" },
        { name: "sellerId", type: "uint256" },
        { name: "actionNonce", type: "uint256" },
        { name: "v", type: "uint8" },
        { name: "r", type: "bytes32" },
        { name: "s", type: "bytes32" },
      ],
    };

    const FORWARD_REQUEST_TYPES = {
      ForwardRequest: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "data", type: "bytes" },
      ],
    };

    async function trustedForwarderDomain() {
      return {
        name: "MockForwarder",
        version: "0.0.1",
        chainId: (await provider.getNetwork()).chainId,
        verifyingContract: await trustedForwarder.getAddress(),
      };
    }

    async function signForwardRequest(signer, request) {
      return signer.signTypedData(await trustedForwarderDomain(), FORWARD_REQUEST_TYPES, request);
    }

    async function signRedeemMetaTx(signer, exchangeId, redeemNonce) {
      const customTransactionType = {
        MetaTxExchange: [
          { name: "nonce", type: "uint256" },
          { name: "from", type: "address" },
          { name: "contractAddress", type: "address" },
          { name: "functionName", type: "string" },
          { name: "exchangeDetails", type: "MetaTxExchangeDetails" },
        ],
        MetaTxExchangeDetails: [{ name: "exchangeId", type: "uint256" }],
      };
      const message = {
        nonce: redeemNonce,
        from: await signer.getAddress(),
        contractAddress: protocolDiamondAddress,
        functionName: "redeemVoucher(uint256)",
        exchangeDetails: { exchangeId: exchangeId.toString() },
      };
      return prepareDataSignature(signer, customTransactionType, "MetaTxExchange", message, protocolDiamondAddress);
    }

    // Build a complete tuple of (params, actionSig, trustedForwarder, fwdCalldata, redeemSignature).
    async function buildRedeemPremintedCall(opts = {}) {
      const price = BigInt(premintedOffer.price.toString());

      // Buyer's ERC-3009 receive auth (signs paying `price` to the forwarder)
      const erc3009Nonce = await freshNonce();
      const erc3009Message = {
        from: opts.from ?? (await buyer.getAddress()),
        to: await forwarder.getAddress(),
        value: opts.value ?? price,
        validAfter: opts.validAfter ?? VALID_AFTER,
        validBefore: opts.validBefore ?? FAR_FUTURE,
        nonce: erc3009Nonce,
      };
      await authToken.mint(erc3009Message.from, erc3009Message.value);
      const innerSig = await signReceive(opts.erc3009Signer ?? buyer, erc3009Message);

      // Buyer's forwarder action sig
      const tokenId = opts.tokenId ?? premintedTokenId;
      const sellerIdForAction = opts.sellerIdForAction ?? seller.id;
      const voucherForAction = opts.voucherForAction ?? (await bosonVoucher.getAddress());
      const buyerForAction = opts.buyerForAction ?? (await buyer.getAddress());
      const actionNonce = opts.actionNonce ?? freshActionNonce();
      const actionSigner = opts.actionSigner ?? buyer;
      const actionMsg = {
        buyer: buyerForAction,
        voucher: voucherForAction,
        tokenId,
        sellerId: sellerIdForAction,
        actionNonce,
        v: innerSig.v,
        r: innerSig.r,
        s: innerSig.s,
      };
      const action = await signActionTyped(actionSigner, REDEEM_PREMINTED_ACTION_TYPES, actionMsg);

      // Seller's ForwardRequest for the voucher transfer
      const transferData = bosonVoucher.interface.encodeFunctionData("transferFrom", [
        opts.transferFromAddress ?? (await assistant.getAddress()),
        opts.transferToAddress ?? (await buyer.getAddress()),
        opts.transferTokenId ?? tokenId,
      ]);
      const fwdNonce = await trustedForwarder.getNonce(await assistant.getAddress());
      const forwardRequest = {
        from: await assistant.getAddress(),
        to: await bosonVoucher.getAddress(),
        nonce: fwdNonce,
        data: transferData,
      };
      const sellerSignature = await signForwardRequest(opts.sellerSigner ?? assistant, forwardRequest);
      const fwdCalldata = trustedForwarder.interface.encodeFunctionData("execute", [forwardRequest, sellerSignature]);

      // Buyer's protocol redeem meta-tx
      const redeemNonce = opts.redeemNonce ?? freshActionNonce();
      const redeemSignature = await signRedeemMetaTx(
        opts.redeemSigner ?? buyer,
        opts.redeemExchangeId ?? premintedExchangeId,
        redeemNonce
      );

      const params = {
        token: opts.token ?? (await authToken.getAddress()),
        buyer: await buyer.getAddress(),
        value: erc3009Message.value,
        validAfter: erc3009Message.validAfter,
        validBefore: erc3009Message.validBefore,
        erc3009Nonce,
        v: innerSig.v,
        r: innerSig.r,
        s: innerSig.s,
        voucher: await bosonVoucher.getAddress(),
        tokenId,
        sellerId: seller.id,
        actionNonce,
        redeemNonce,
      };

      return {
        params,
        actionSig: sigToTuple(action),
        trustedForwarderAddress: await trustedForwarder.getAddress(),
        fwdCalldata,
        redeemSignature,
      };
    }

    async function callRedeemPreminted(parts, overrides = {}) {
      return forwarder.redeemPremintedOfferWithAuthorization(
        overrides.params ?? parts.params,
        overrides.actionSig ?? parts.actionSig,
        overrides.trustedForwarderAddress ?? parts.trustedForwarderAddress,
        overrides.fwdCalldata ?? parts.fwdCalldata,
        overrides.redeemSignature ?? parts.redeemSignature
      );
    }

    before(async function () {
      // Compute the per-seller voucher clone address. The protocol diamond
      // creates the clone via CREATE2 from the precomputed beacon proxy.
      const beaconProxyAddress = await calculateBosonProxyAddress(protocolDiamondAddress);
      const voucherAddress = await calculateCloneAddress(
        protocolDiamondAddress,
        beaconProxyAddress,
        await assistant.getAddress()
      );
      bosonVoucher = await getContractAt("BosonVoucher", voucherAddress);

      // Reserve a range and premint vouchers under our existing offerAuthToken.
      const reserveLength = "5";
      const start = BigInt(await exchangeHandler.getNextExchangeId());
      await offerHandler
        .connect(assistant)
        .reserveRange(offerAuthToken.id, reserveLength, await assistant.getAddress());
      await bosonVoucher.connect(assistant).preMint(offerAuthToken.id, reserveLength);

      premintedOffer = offerAuthToken;
      premintedExchangeId = start;
      premintedTokenId = deriveTokenId(offerAuthToken.id, start);

      // Top up the seller's pool with sellerDeposit so the commit-on-transfer
      // can encumber. The buyer's price portion is supplied by the forwarder
      // at runtime via depositFunds.
      const totalSellerDeposit = BigInt(offerAuthToken.sellerDeposit) * BigInt(reserveLength);
      await authToken.mint(await assistant.getAddress(), totalSellerDeposit);
      await authToken.connect(assistant).approve(protocolDiamondAddress, totalSellerDeposit);
      await fundsHandler.connect(assistant).depositFunds(seller.id, await authToken.getAddress(), totalSellerDeposit);

      // Refresh the outer-describe snapshot so the per-test revert preserves
      // our preminted setup. This is the last context in the file, so we don't
      // disturb earlier ones.
      snapshotId = await getSnapshot();
    });

    // Advance time past `voucherRedeemableFrom` (mockOfferDates sets it to
    // `block.timestamp + oneWeek` at offer creation) so the redeem step can
    // succeed.
    beforeEach(async function () {
      const blk = await provider.getBlock("latest");
      await setNextBlockTimestamp(blk.timestamp + 8 * 24 * 60 * 60); // +8 days
    });

    it("commits the buyer + redeems the voucher + emits VoucherRedeemed in one tx", async function () {
      const parts = await buildRedeemPremintedCall();
      await expect(callRedeemPreminted(parts))
        .to.emit(exchangeHandler, "VoucherRedeemed")
        .withArgs(premintedOffer.id, premintedExchangeId, await buyer.getAddress());
    });

    it("transfers the voucher to the buyer en route (verified by burn after redeem)", async function () {
      const parts = await buildRedeemPremintedCall();
      await callRedeemPreminted(parts);
      // After redeem the voucher is burned; ownerOf reverts.
      await expect(bosonVoucher.ownerOf(premintedTokenId)).to.be.revertedWith("ERC721: invalid token ID");
    });

    it("reverts on zero token", async function () {
      const parts = await buildRedeemPremintedCall();
      const params = { ...parts.params, token: ZeroAddress };
      await expect(callRedeemPreminted(parts, { params })).to.be.revertedWithCustomError(
        forwarder,
        "InvalidTokenAddress"
      );
    });

    it("reverts on zero value", async function () {
      const parts = await buildRedeemPremintedCall();
      const params = { ...parts.params, value: 0 };
      await expect(callRedeemPreminted(parts, { params })).to.be.revertedWithCustomError(forwarder, "ZeroValue");
    });

    it("reverts on zero voucher address", async function () {
      const parts = await buildRedeemPremintedCall();
      const params = { ...parts.params, voucher: ZeroAddress };
      await expect(callRedeemPreminted(parts, { params })).to.be.revertedWithCustomError(
        forwarder,
        "InvalidVoucherAddress"
      );
    });

    it("reverts on zero trusted forwarder address", async function () {
      const parts = await buildRedeemPremintedCall();
      await expect(callRedeemPreminted(parts, { trustedForwarderAddress: ZeroAddress })).to.be.revertedWithCustomError(
        forwarder,
        "InvalidTrustedForwarderAddress"
      );
    });

    it("reverts on reused action nonce", async function () {
      const parts = await buildRedeemPremintedCall();
      await callRedeemPreminted(parts);
      await expect(callRedeemPreminted(parts)).to.be.revertedWithCustomError(forwarder, "ActionNonceAlreadyUsed");
    });

    it("front-run: swapping voucher in the call reverts InvalidActionSignature", async function () {
      // Build a call but mutate `params.voucher` after signing the action sig.
      const parts = await buildRedeemPremintedCall();
      const params = { ...parts.params, voucher: await rando.getAddress() };
      await expect(callRedeemPreminted(parts, { params })).to.be.revertedWithCustomError(
        forwarder,
        "InvalidActionSignature"
      );
    });

    it("front-run: swapping tokenId in the call reverts InvalidActionSignature", async function () {
      const parts = await buildRedeemPremintedCall();
      const params = { ...parts.params, tokenId: BigInt(parts.params.tokenId) + 1n };
      await expect(callRedeemPreminted(parts, { params })).to.be.revertedWithCustomError(
        forwarder,
        "InvalidActionSignature"
      );
    });

    it("front-run: swapping sellerId in the call reverts InvalidActionSignature", async function () {
      const parts = await buildRedeemPremintedCall();
      const params = { ...parts.params, sellerId: BigInt(parts.params.sellerId) + 1n };
      await expect(callRedeemPreminted(parts, { params })).to.be.revertedWithCustomError(
        forwarder,
        "InvalidActionSignature"
      );
    });

    it("front-run: action sig signed by wrong key reverts InvalidActionSignature", async function () {
      const parts = await buildRedeemPremintedCall({ actionSigner: other });
      await expect(callRedeemPreminted(parts)).to.be.revertedWithCustomError(forwarder, "InvalidActionSignature");
    });

    it("VoucherNotReceivedByBuyer when seller signs a transfer to a different recipient", async function () {
      // Seller's ForwardRequest sends the voucher to `other`, not the buyer.
      // Action sig is built normally for the real buyer; the trusted forwarder
      // accepts the seller's signed request (it's well-formed) and the voucher
      // ends up at `other`. The defensive ownerOf check catches it.
      const parts = await buildRedeemPremintedCall({ transferToAddress: await other.getAddress() });
      await expect(callRedeemPreminted(parts)).to.be.revertedWithCustomError(forwarder, "VoucherNotReceivedByBuyer");
    });

    it("trusted-forwarder rejects a tampered ForwardRequest", async function () {
      // Seller signs a valid ForwardRequest, but we tamper with the calldata
      // (mutate the nonce) before passing it to the forwarder. The trusted
      // forwarder verifies the signature and reverts.
      const parts = await buildRedeemPremintedCall();
      // Decode the request, bump the nonce, re-encode without re-signing.
      const decoded = trustedForwarder.interface.decodeFunctionData("execute", parts.fwdCalldata);
      const tampered = {
        from: decoded[0].from,
        to: decoded[0].to,
        nonce: decoded[0].nonce + 1n,
        data: decoded[0].data,
      };
      const fwdCalldata = trustedForwarder.interface.encodeFunctionData("execute", [tampered, decoded[1]]);
      await expect(callRedeemPreminted(parts, { fwdCalldata })).to.be.revertedWith(
        "MockForwarder: signature does not match request"
      );
    });
  });
});
