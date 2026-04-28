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

const DEPOSIT_ACTION_TYPES = {
  DepositFundsAction: [
    { name: "entityId", type: "uint256" },
    { name: "v", type: "uint8" },
    { name: "r", type: "bytes32" },
    { name: "s", type: "bytes32" },
  ],
};

const COMMIT_ACTION_TYPES = {
  CommitToOfferAction: [
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

describe("BosonERC3009Forwarder", function () {
  let admin, treasury, rando, buyer, adminDR, treasuryDR, other, other2;
  let assistant, assistantDR, clerk, clerkDR;
  let accountHandler, fundsHandler, exchangeCommitHandler, offerHandler;
  let token;
  let forwarder;
  let protocolDiamondAddress;
  let seller, buyerEntity, offerToken;
  let depositAmount;
  let snapshotId;
  let bosonErrors;
  let nonceCounter = 1;
  let voucherInitValues;
  let emptyAuthToken;

  const VALID_AFTER = 0;
  const FAR_FUTURE = 2000000000; // 2033

  async function tokenDomain() {
    return {
      name: "Foreign20WithAuthorization",
      version: "1",
      chainId: (await provider.getNetwork()).chainId,
      verifyingContract: await token.getAddress(),
    };
  }

  async function forwarderDomain() {
    return {
      name: "BosonERC3009Forwarder",
      version: "1",
      chainId: (await provider.getNetwork()).chainId,
      verifyingContract: await forwarder.getAddress(),
    };
  }

  async function signReceive(signer, message) {
    const sig = await signer.signTypedData(await tokenDomain(), RECEIVE_TYPES, message);
    return Signature.from(sig);
  }

  async function signDepositAction(signer, { entityId, v, r, s }) {
    const sig = await signer.signTypedData(await forwarderDomain(), DEPOSIT_ACTION_TYPES, { entityId, v, r, s });
    return Signature.from(sig);
  }

  async function signCommitAction(signer, { committer, offerId, v, r, s }) {
    const sig = await signer.signTypedData(await forwarderDomain(), COMMIT_ACTION_TYPES, {
      committer,
      offerId,
      v,
      r,
      s,
    });
    return Signature.from(sig);
  }

  async function freshNonce() {
    return makeNonce(nonceCounter++);
  }

  // Mints `value` to `signer` and returns an ERC-3009 receive authorization.
  async function authorize(signer, value, overrides = {}) {
    await token.mint(await signer.getAddress(), value);
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

  // Builds full param list for depositFundsWithAuthorization. Action-sig signer
  // and action-sig payload default to the from-signer and the call's own params,
  // but can be overridden to test front-run / wrong-signer paths.
  async function buildDepositCall(authSigner, value, entityId, opts = {}) {
    const { message, sig } = await authorize(authSigner, value, opts);
    const actionSigner = opts.actionSigner ?? authSigner;
    const actionEntityId = opts.actionEntityId ?? entityId;
    const action = await signDepositAction(actionSigner, {
      entityId: actionEntityId,
      v: sig.v,
      r: sig.r,
      s: sig.s,
    });
    return {
      message,
      sig,
      action,
      args: [
        await token.getAddress(),
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

  async function buildCommitCall(authSigner, value, committer, offerId, opts = {}) {
    const { message, sig } = await authorize(authSigner, value, opts);
    const actionSigner = opts.actionSigner ?? authSigner;
    const actionCommitter = opts.actionCommitter ?? committer;
    const actionOfferId = opts.actionOfferId ?? offerId;
    const action = await signCommitAction(actionSigner, {
      committer: actionCommitter,
      offerId: actionOfferId,
      v: sig.v,
      r: sig.r,
      s: sig.s,
    });
    return {
      message,
      sig,
      action,
      args: [
        await token.getAddress(),
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

    const TokenFactory = await getContractFactory("Foreign20WithAuthorization");
    token = await TokenFactory.deploy();
    await token.waitForDeployment();

    const ForwarderFactory = await getContractFactory("BosonERC3009Forwarder");
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
      new DisputeResolverFee(await token.getAddress(), "ERC3009", drFeeAmount),
    ];
    await accountHandler.connect(adminDR).createDisputeResolver(disputeResolver, disputeResolverFees, []);

    const buyerData = mockBuyer(await buyer.getAddress());
    await accountHandler.connect(buyer).createBuyer(buyerData);
    buyerEntity = buyerData;
    buyerEntity.id = "3";

    const { offer, offerDates, offerDurations, drParams } = await mockOffer();
    offer.exchangeToken = await token.getAddress();
    offer.id = "0";
    offer.quantityAvailable = "100";
    offer.royaltyInfo = [new RoyaltyInfo([ZeroAddress], ["0"])];

    offerToken = offer;
    offerToken.id = await offerHandler
      .connect(assistant)
      .createOffer(offerToken, offerDates, offerDurations, drParams, "0", MaxUint256, { getOfferId: true });

    const sellerPool = parseUnits("100", "ether");
    await token.mint(await assistant.getAddress(), sellerPool);
    await token.connect(assistant).approve(protocolDiamondAddress, sellerPool);
    await fundsHandler.connect(assistant).depositFunds(seller.id, await token.getAddress(), sellerPool);

    depositAmount = parseUnits("100", "ether");

    snapshotId = await getSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();
  });

  context("📋 Constructor", async function () {
    it("reverts on zero protocol address", async function () {
      const ForwarderFactory = await getContractFactory("BosonERC3009Forwarder");
      await expect(ForwarderFactory.deploy(ZeroAddress)).to.be.revertedWithCustomError(
        forwarder,
        "InvalidProtocolAddress"
      );
    });

    it("stores protocol as immutable", async function () {
      expect(await forwarder.protocol()).to.equal(protocolDiamondAddress);
    });
  });

  context("📋 depositFundsWithAuthorization", async function () {
    it("credits the seller entity and emits FundsDeposited", async function () {
      const { args } = await buildDepositCall(rando, depositAmount, seller.id);

      await expect(forwarder.depositFundsWithAuthorization(...args))
        .to.emit(fundsHandler, "FundsDeposited")
        .withArgs(seller.id, await forwarder.getAddress(), await token.getAddress(), depositAmount);
    });

    it("credits the buyer entity", async function () {
      const { args } = await buildDepositCall(rando, depositAmount, buyerEntity.id);

      await expect(forwarder.depositFundsWithAuthorization(...args))
        .to.emit(fundsHandler, "FundsDeposited")
        .withArgs(buyerEntity.id, await forwarder.getAddress(), await token.getAddress(), depositAmount);
    });

    it("reverts when token is the zero address", async function () {
      const { args } = await buildDepositCall(rando, depositAmount, seller.id);
      args[0] = ZeroAddress;
      await expect(forwarder.depositFundsWithAuthorization(...args)).to.be.revertedWithCustomError(
        forwarder,
        "InvalidTokenAddress"
      );
    });

    it("reverts when value is zero", async function () {
      const { args } = await buildDepositCall(rando, depositAmount, seller.id);
      args[2] = 0;
      await expect(forwarder.depositFundsWithAuthorization(...args)).to.be.revertedWithCustomError(
        forwarder,
        "ZeroValue"
      );
    });

    it("reverts when entityId is unknown (NoSuchEntity bubbled from protocol)", async function () {
      const { args } = await buildDepositCall(rando, depositAmount, "999999");
      await expect(forwarder.depositFundsWithAuthorization(...args)).to.be.revertedWithCustomError(
        bosonErrors,
        RevertReasons.NO_SUCH_ENTITY
      );
    });
  });

  context("📋 commitToOfferWithAuthorization", async function () {
    it("commits and credits voucher to committer == from", async function () {
      const price = BigInt(offerToken.price.toString());
      const { args } = await buildCommitCall(buyer, price, await buyer.getAddress(), offerToken.id);

      await expect(forwarder.commitToOfferWithAuthorization(...args))
        .to.emit(exchangeCommitHandler, "BuyerCommitted")
        .withArgs(offerToken.id, buyerEntity.id, 1, anyValue, anyValue, await forwarder.getAddress());
    });

    it("commits when committer is a third party different from signer", async function () {
      const price = BigInt(offerToken.price.toString());
      const { args } = await buildCommitCall(rando, price, await buyer.getAddress(), offerToken.id);

      await expect(forwarder.commitToOfferWithAuthorization(...args))
        .to.emit(exchangeCommitHandler, "BuyerCommitted")
        .withArgs(offerToken.id, buyerEntity.id, 1, anyValue, anyValue, await forwarder.getAddress());
    });

    it("reverts when authorized value is less than offer price (insufficient allowance at token)", async function () {
      const price = BigInt(offerToken.price.toString());
      const { args } = await buildCommitCall(buyer, price - 1n, await buyer.getAddress(), offerToken.id);
      // The action sig was correctly signed for the (price-1) authorization,
      // so it passes; failure happens later when the protocol tries to pull `price`.
      await expect(forwarder.commitToOfferWithAuthorization(...args)).to.be.revertedWith(
        "ERC20: insufficient allowance"
      );
    });
  });

  context("📋 Front-run resistance via action signature", async function () {
    it("depositFunds reverts when entityId is swapped after signing", async function () {
      // Signer authorized depositing to `seller.id`, but caller submits with a different entity.
      const { args } = await buildDepositCall(rando, depositAmount, buyerEntity.id, {
        actionEntityId: seller.id, // signed for seller, but called with buyer
      });
      await expect(forwarder.depositFundsWithAuthorization(...args)).to.be.revertedWithCustomError(
        forwarder,
        "InvalidActionSignature"
      );
    });

    it("depositFunds reverts when action sig is signed by someone other than `from`", async function () {
      const { args } = await buildDepositCall(rando, depositAmount, seller.id, {
        actionSigner: other, // wrong signer
      });
      await expect(forwarder.depositFundsWithAuthorization(...args)).to.be.revertedWithCustomError(
        forwarder,
        "InvalidActionSignature"
      );
    });

    it("depositFunds reverts when action sig is zeroed (ECDSA rejects malformed sig)", async function () {
      const { args } = await buildDepositCall(rando, depositAmount, seller.id);
      args[10] = { v: 27, r: ethers.ZeroHash, s: ethers.ZeroHash };
      await expect(forwarder.depositFundsWithAuthorization(...args)).to.be.revertedWith("ECDSA: invalid signature");
    });

    it("commitToOffer reverts when committer is swapped after signing", async function () {
      const price = BigInt(offerToken.price.toString());
      // Signed for buyer as committer, but caller submits with `other` to redirect the voucher.
      const { args } = await buildCommitCall(buyer, price, await other.getAddress(), offerToken.id, {
        actionCommitter: await buyer.getAddress(),
      });
      await expect(forwarder.commitToOfferWithAuthorization(...args)).to.be.revertedWithCustomError(
        forwarder,
        "InvalidActionSignature"
      );
    });

    it("commitToOffer reverts when offerId is swapped after signing", async function () {
      const price = BigInt(offerToken.price.toString());
      const { args } = await buildCommitCall(buyer, price, await buyer.getAddress(), offerToken.id, {
        actionOfferId: BigInt(offerToken.id) + 1n,
      });
      await expect(forwarder.commitToOfferWithAuthorization(...args)).to.be.revertedWithCustomError(
        forwarder,
        "InvalidActionSignature"
      );
    });

    it("commitToOffer reverts when action sig is signed by someone other than `from`", async function () {
      const price = BigInt(offerToken.price.toString());
      const { args } = await buildCommitCall(buyer, price, await buyer.getAddress(), offerToken.id, {
        actionSigner: other,
      });
      await expect(forwarder.commitToOfferWithAuthorization(...args)).to.be.revertedWithCustomError(
        forwarder,
        "InvalidActionSignature"
      );
    });
  });

  context("📋 ERC-3009 authorization invariants", async function () {
    it("reverts on bad ERC-3009 signature (signer != from)", async function () {
      // `from` is rando, but the receive auth is signed by `other`
      const { args } = await buildDepositCall(rando, depositAmount, seller.id, { signWith: other });
      await expect(forwarder.depositFundsWithAuthorization(...args)).to.be.revertedWithCustomError(
        token,
        "InvalidSignature3009"
      );
    });

    it("reverts when block.timestamp >= validBefore (expired)", async function () {
      const blk = await provider.getBlock("latest");
      const validBefore = blk.timestamp + 100;
      const { args } = await buildDepositCall(rando, depositAmount, seller.id, { validBefore });
      await setNextBlockTimestamp(validBefore + 10);
      await expect(forwarder.depositFundsWithAuthorization(...args)).to.be.revertedWithCustomError(
        token,
        "AuthorizationExpired"
      );
    });

    it("reverts when block.timestamp <= validAfter (not yet valid)", async function () {
      const blk = await provider.getBlock("latest");
      const validAfter = blk.timestamp + 1000;
      const { args } = await buildDepositCall(rando, depositAmount, seller.id, {
        validAfter,
        validBefore: validAfter + 100000,
      });
      await expect(forwarder.depositFundsWithAuthorization(...args)).to.be.revertedWithCustomError(
        token,
        "AuthorizationNotYetValid"
      );
    });

    it("reverts on reused nonce", async function () {
      const nonce = await freshNonce();
      const first = await buildDepositCall(rando, depositAmount, seller.id, { nonce });
      await forwarder.depositFundsWithAuthorization(...first.args);

      // Re-mint so a second pull would otherwise succeed if the token didn't track the nonce.
      await token.mint(await rando.getAddress(), depositAmount);

      // Re-build the call with the same nonce — same auth, same action sig — replay attempt.
      await expect(forwarder.depositFundsWithAuthorization(...first.args)).to.be.revertedWithCustomError(
        token,
        "AuthorizationUsedOrCanceled"
      );
    });

    it("EOA calling token directly with same sig fails (CallerMustBeRecipient)", async function () {
      const { message, sig } = await authorize(rando, depositAmount);
      await expect(
        token
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
      ).to.be.revertedWithCustomError(token, "CallerMustBeRecipient");
    });
  });

  context("📋 Allowance and balance hygiene", async function () {
    it("leaves zero allowance to protocol after a successful deposit", async function () {
      const { args } = await buildDepositCall(rando, depositAmount, seller.id);
      await forwarder.depositFundsWithAuthorization(...args);
      expect(await token.allowance(await forwarder.getAddress(), protocolDiamondAddress)).to.equal(0n);
    });

    it("leaves zero token balance on the forwarder after a successful deposit", async function () {
      const { args } = await buildDepositCall(rando, depositAmount, seller.id);
      await forwarder.depositFundsWithAuthorization(...args);
      expect(await token.balanceOf(await forwarder.getAddress())).to.equal(0n);
    });

    it("leaves zero allowance and balance after a successful commit", async function () {
      const price = BigInt(offerToken.price.toString());
      const { args } = await buildCommitCall(buyer, price, await buyer.getAddress(), offerToken.id);
      await forwarder.commitToOfferWithAuthorization(...args);
      expect(await token.allowance(await forwarder.getAddress(), protocolDiamondAddress)).to.equal(0n);
      expect(await token.balanceOf(await forwarder.getAddress())).to.equal(0n);
    });
  });
});
