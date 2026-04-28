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
  generateOfferId,
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
    { name: "v", type: "uint8" },
    { name: "r", type: "bytes32" },
    { name: "s", type: "bytes32" },
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
    { name: "v", type: "uint8" },
    { name: "r", type: "bytes32" },
    { name: "s", type: "bytes32" },
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
  let accountHandler, fundsHandler, exchangeCommitHandler, offerHandler;
  let authToken, permitToken;
  let forwarder;
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

  async function buildDepositPermitCall(authSigner, value, entityId, opts = {}) {
    const { message, sig } = await authorizePermit(authSigner, value, opts);
    const actionSigner = opts.actionSigner ?? authSigner;
    const actionEntityId = opts.actionEntityId ?? entityId;
    const action = await signActionTyped(actionSigner, DEPOSIT_PERMIT_ACTION_TYPES, {
      entityId: actionEntityId,
      v: sig.v,
      r: sig.r,
      s: sig.s,
    });
    return {
      message,
      sig,
      args: [
        await permitToken.getAddress(),
        message.owner,
        message.value,
        message.deadline,
        sig.v,
        sig.r,
        sig.s,
        entityId,
        sigToTuple(action),
      ],
    };
  }

  async function buildCommitPermitCall(authSigner, value, committer, offerId, opts = {}) {
    const { message, sig } = await authorizePermit(authSigner, value, opts);
    const actionSigner = opts.actionSigner ?? authSigner;
    const actionCommitter = opts.actionCommitter ?? committer;
    const actionOfferId = opts.actionOfferId ?? offerId;
    const action = await signActionTyped(actionSigner, COMMIT_PERMIT_ACTION_TYPES, {
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
        await permitToken.getAddress(),
        message.owner,
        message.value,
        message.deadline,
        sig.v,
        sig.r,
        sig.s,
        committer,
        offerId,
        sigToTuple(action),
      ],
    };
  }

  before(async function () {
    accountId.next(true);
    generateOfferId.next(true);

    const contracts = {
      accountHandler: "IBosonAccountHandler",
      offerHandler: "IBosonOfferHandler",
      exchangeCommitHandler: "IBosonExchangeCommitHandler",
      fundsHandler: "IBosonFundsHandler",
    };

    ({
      signers: [, admin, treasury, rando, buyer, , adminDR, treasuryDR, other, other2],
      contractInstances: { accountHandler, offerHandler, exchangeCommitHandler, fundsHandler },
      diamondAddress: protocolDiamondAddress,
    } = await setupTestEnvironment(contracts));

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

    it("reverts on reused permit (nonce already incremented)", async function () {
      const { args } = await buildDepositPermitCall(rando, depositAmount, seller.id);
      await forwarder.depositFundsWithPermit(...args);
      // Second call: the same permit has a stale nonce; permit() reverts, allowance is 0.
      await permitToken.mint(await rando.getAddress(), depositAmount);
      await expect(forwarder.depositFundsWithPermit(...args)).to.be.revertedWith("ERC20: insufficient allowance");
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
});
