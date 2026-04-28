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

async function buildDomain(token) {
  const network = await provider.getNetwork();
  return {
    name: "Foreign20WithAuthorization",
    version: "1",
    chainId: network.chainId,
    verifyingContract: await token.getAddress(),
  };
}

async function signReceive(signer, token, message) {
  const domain = await buildDomain(token);
  const sig = await signer.signTypedData(domain, RECEIVE_TYPES, message);
  return Signature.from(sig);
}

function makeNonce(seed) {
  return ethers.zeroPadValue(ethers.toBeHex(seed), 32);
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

    // Deploy ERC-3009 mock token
    const TokenFactory = await getContractFactory("Foreign20WithAuthorization");
    token = await TokenFactory.deploy();
    await token.waitForDeployment();

    // Deploy forwarder
    const ForwarderFactory = await getContractFactory("BosonERC3009Forwarder");
    forwarder = await ForwarderFactory.deploy(protocolDiamondAddress);
    await forwarder.waitForDeployment();

    // Need beacon proxy precomputed for any voucher-related setup
    await calculateBosonProxyAddress(protocolDiamondAddress);

    // Create a seller (id = 1)
    voucherInitValues = mockVoucherInitValues();
    emptyAuthToken = mockAuthToken();
    seller = mockSeller(
      await assistant.getAddress(),
      await admin.getAddress(),
      clerk.address,
      await treasury.getAddress()
    );
    await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

    // Create a dispute resolver (id = 2) — required by mockOffer's drParams default
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

    // Create a buyer entity (id = 3) for the buyer-deposit test
    const buyerData = mockBuyer(await buyer.getAddress());
    await accountHandler.connect(buyer).createBuyer(buyerData);
    buyerEntity = buyerData;
    buyerEntity.id = "3";

    // Create one ERC20-priced offer (using our ERC-3009 token)
    const { offer, offerDates, offerDurations, drParams, offerFees } = await mockOffer();
    offer.exchangeToken = await token.getAddress();
    offer.id = "0";
    offer.quantityAvailable = "100";
    offer.royaltyInfo = [new RoyaltyInfo([ZeroAddress], ["0"])];
    void offerFees;

    offerToken = offer;
    offerToken.id = await offerHandler
      .connect(assistant)
      .createOffer(offerToken, offerDates, offerDurations, drParams, "0", MaxUint256, { getOfferId: true });

    // Pre-fund seller deposit (covers seller deposit + DR fee per commit, with margin)
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

  async function freshNonce() {
    return makeNonce(nonceCounter++);
  }

  async function mintAndAuth(signer, value) {
    await token.mint(await signer.getAddress(), value);
    const nonce = await freshNonce();
    const message = {
      from: await signer.getAddress(),
      to: await forwarder.getAddress(),
      value,
      validAfter: VALID_AFTER,
      validBefore: FAR_FUTURE,
      nonce,
    };
    const sig = await signReceive(signer, token, message);
    return { message, sig, nonce };
  }

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
      const { message, sig } = await mintAndAuth(rando, depositAmount);

      await expect(
        forwarder.depositFundsWithAuthorization(
          await token.getAddress(),
          message.from,
          message.value,
          message.validAfter,
          message.validBefore,
          message.nonce,
          sig.v,
          sig.r,
          sig.s,
          seller.id
        )
      )
        .to.emit(fundsHandler, "FundsDeposited")
        .withArgs(seller.id, await forwarder.getAddress(), await token.getAddress(), depositAmount);
    });

    it("credits the buyer entity", async function () {
      const { message, sig } = await mintAndAuth(rando, depositAmount);

      await expect(
        forwarder.depositFundsWithAuthorization(
          await token.getAddress(),
          message.from,
          message.value,
          message.validAfter,
          message.validBefore,
          message.nonce,
          sig.v,
          sig.r,
          sig.s,
          buyerEntity.id
        )
      )
        .to.emit(fundsHandler, "FundsDeposited")
        .withArgs(buyerEntity.id, await forwarder.getAddress(), await token.getAddress(), depositAmount);
    });

    it("reverts when token is the zero address", async function () {
      const { message, sig } = await mintAndAuth(rando, depositAmount);
      await expect(
        forwarder.depositFundsWithAuthorization(
          ZeroAddress,
          message.from,
          message.value,
          message.validAfter,
          message.validBefore,
          message.nonce,
          sig.v,
          sig.r,
          sig.s,
          seller.id
        )
      ).to.be.revertedWithCustomError(forwarder, "InvalidTokenAddress");
    });

    it("reverts when value is zero", async function () {
      const { message, sig } = await mintAndAuth(rando, depositAmount);
      await expect(
        forwarder.depositFundsWithAuthorization(
          await token.getAddress(),
          message.from,
          0,
          message.validAfter,
          message.validBefore,
          message.nonce,
          sig.v,
          sig.r,
          sig.s,
          seller.id
        )
      ).to.be.revertedWithCustomError(forwarder, "ZeroValue");
    });

    it("reverts when entityId is unknown (NoSuchEntity bubbled from protocol)", async function () {
      const { message, sig } = await mintAndAuth(rando, depositAmount);
      await expect(
        forwarder.depositFundsWithAuthorization(
          await token.getAddress(),
          message.from,
          message.value,
          message.validAfter,
          message.validBefore,
          message.nonce,
          sig.v,
          sig.r,
          sig.s,
          999999
        )
      ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_ENTITY);
    });
  });

  context("📋 commitToOfferWithAuthorization", async function () {
    it("commits and credits voucher to committer == from", async function () {
      const price = BigInt(offerToken.price.toString());
      const { message, sig } = await mintAndAuth(buyer, price);

      await expect(
        forwarder.commitToOfferWithAuthorization(
          await token.getAddress(),
          message.from,
          message.value,
          message.validAfter,
          message.validBefore,
          message.nonce,
          sig.v,
          sig.r,
          sig.s,
          await buyer.getAddress(),
          offerToken.id
        )
      )
        .to.emit(exchangeCommitHandler, "BuyerCommitted")
        .withArgs(offerToken.id, buyerEntity.id, 1, anyValue, anyValue, await forwarder.getAddress());
    });

    it("commits when committer is a third party different from signer", async function () {
      const price = BigInt(offerToken.price.toString());
      const { message, sig } = await mintAndAuth(rando, price);

      await expect(
        forwarder.commitToOfferWithAuthorization(
          await token.getAddress(),
          message.from,
          message.value,
          message.validAfter,
          message.validBefore,
          message.nonce,
          sig.v,
          sig.r,
          sig.s,
          await buyer.getAddress(),
          offerToken.id
        )
      )
        .to.emit(exchangeCommitHandler, "BuyerCommitted")
        .withArgs(offerToken.id, buyerEntity.id, 1, anyValue, anyValue, await forwarder.getAddress());
    });

    it("reverts when authorized value is less than offer price (insufficient allowance at token)", async function () {
      const price = BigInt(offerToken.price.toString());
      const { message, sig } = await mintAndAuth(buyer, price - 1n);

      // Forwarder pulls `price-1`, approves protocol `price-1`, protocol tries to pull
      // the full `price` via transferFrom — fails with the standard ERC20 allowance error.
      await expect(
        forwarder.commitToOfferWithAuthorization(
          await token.getAddress(),
          message.from,
          message.value,
          message.validAfter,
          message.validBefore,
          message.nonce,
          sig.v,
          sig.r,
          sig.s,
          await buyer.getAddress(),
          offerToken.id
        )
      ).to.be.revertedWith("ERC20: insufficient allowance");
    });
  });

  context("📋 ERC-3009 authorization invariants", async function () {
    it("reverts on bad signature (signer != from)", async function () {
      const value = depositAmount;
      await token.mint(await rando.getAddress(), value);
      const nonce = await freshNonce();
      const message = {
        from: await rando.getAddress(),
        to: await forwarder.getAddress(),
        value,
        validAfter: VALID_AFTER,
        validBefore: FAR_FUTURE,
        nonce,
      };
      // sign with the wrong signer
      const sig = await signReceive(other, token, message);

      await expect(
        forwarder.depositFundsWithAuthorization(
          await token.getAddress(),
          message.from,
          message.value,
          message.validAfter,
          message.validBefore,
          message.nonce,
          sig.v,
          sig.r,
          sig.s,
          seller.id
        )
      ).to.be.revertedWithCustomError(token, "InvalidSignature3009");
    });

    it("reverts when block.timestamp >= validBefore (expired)", async function () {
      const value = depositAmount;
      await token.mint(await rando.getAddress(), value);
      const nonce = await freshNonce();

      const blk = await provider.getBlock("latest");
      const validBefore = blk.timestamp + 100;
      const message = {
        from: await rando.getAddress(),
        to: await forwarder.getAddress(),
        value,
        validAfter: VALID_AFTER,
        validBefore,
        nonce,
      };
      const sig = await signReceive(rando, token, message);

      // jump past validBefore
      await setNextBlockTimestamp(validBefore + 10);

      await expect(
        forwarder.depositFundsWithAuthorization(
          await token.getAddress(),
          message.from,
          message.value,
          message.validAfter,
          message.validBefore,
          message.nonce,
          sig.v,
          sig.r,
          sig.s,
          seller.id
        )
      ).to.be.revertedWithCustomError(token, "AuthorizationExpired");
    });

    it("reverts when block.timestamp <= validAfter (not yet valid)", async function () {
      const value = depositAmount;
      await token.mint(await rando.getAddress(), value);
      const nonce = await freshNonce();

      const blk = await provider.getBlock("latest");
      const validAfter = blk.timestamp + 1000;
      const message = {
        from: await rando.getAddress(),
        to: await forwarder.getAddress(),
        value,
        validAfter,
        validBefore: validAfter + 100000,
        nonce,
      };
      const sig = await signReceive(rando, token, message);

      await expect(
        forwarder.depositFundsWithAuthorization(
          await token.getAddress(),
          message.from,
          message.value,
          message.validAfter,
          message.validBefore,
          message.nonce,
          sig.v,
          sig.r,
          sig.s,
          seller.id
        )
      ).to.be.revertedWithCustomError(token, "AuthorizationNotYetValid");
    });

    it("reverts on reused nonce", async function () {
      const { message, sig } = await mintAndAuth(rando, depositAmount);

      await forwarder.depositFundsWithAuthorization(
        await token.getAddress(),
        message.from,
        message.value,
        message.validAfter,
        message.validBefore,
        message.nonce,
        sig.v,
        sig.r,
        sig.s,
        seller.id
      );

      // mint more so the second pull would otherwise succeed if nonce wasn't tracked
      await token.mint(await rando.getAddress(), depositAmount);

      await expect(
        forwarder.depositFundsWithAuthorization(
          await token.getAddress(),
          message.from,
          message.value,
          message.validAfter,
          message.validBefore,
          message.nonce,
          sig.v,
          sig.r,
          sig.s,
          seller.id
        )
      ).to.be.revertedWithCustomError(token, "AuthorizationUsedOrCanceled");
    });

    it("EOA calling token directly with same sig fails (CallerMustBeRecipient)", async function () {
      const { message, sig } = await mintAndAuth(rando, depositAmount);

      // Anyone other than `to` (== forwarder) calling receiveWithAuthorization must fail
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
      const { message, sig } = await mintAndAuth(rando, depositAmount);

      await forwarder.depositFundsWithAuthorization(
        await token.getAddress(),
        message.from,
        message.value,
        message.validAfter,
        message.validBefore,
        message.nonce,
        sig.v,
        sig.r,
        sig.s,
        seller.id
      );

      expect(await token.allowance(await forwarder.getAddress(), protocolDiamondAddress)).to.equal(0n);
    });

    it("leaves zero token balance on the forwarder after a successful deposit", async function () {
      const { message, sig } = await mintAndAuth(rando, depositAmount);

      await forwarder.depositFundsWithAuthorization(
        await token.getAddress(),
        message.from,
        message.value,
        message.validAfter,
        message.validBefore,
        message.nonce,
        sig.v,
        sig.r,
        sig.s,
        seller.id
      );

      expect(await token.balanceOf(await forwarder.getAddress())).to.equal(0n);
    });

    it("leaves zero allowance and balance after a successful commit", async function () {
      const price = BigInt(offerToken.price.toString());
      const { message, sig } = await mintAndAuth(buyer, price);

      await forwarder.commitToOfferWithAuthorization(
        await token.getAddress(),
        message.from,
        message.value,
        message.validAfter,
        message.validBefore,
        message.nonce,
        sig.v,
        sig.r,
        sig.s,
        await buyer.getAddress(),
        offerToken.id
      );

      expect(await token.allowance(await forwarder.getAddress(), protocolDiamondAddress)).to.equal(0n);
      expect(await token.balanceOf(await forwarder.getAddress())).to.equal(0n);
    });
  });
});
