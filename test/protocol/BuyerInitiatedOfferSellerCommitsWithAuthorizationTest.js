const { ethers } = require("hardhat");
const {
  getContractAt,
  ZeroAddress,
  getSigners,
  getContractFactory,
  MaxUint256,
  parseUnits,
  randomBytes,
  zeroPadValue,
  AbiCoder,
  Signature,
  encodeBytes32String,
} = ethers;
const { expect } = require("chai");

const OfferCreator = require("../../scripts/domain/OfferCreator");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const { RoyaltyInfo } = require("../../scripts/domain/RoyaltyInfo");
const {
  applyPercentage,
  calculateCloneAddress,
  calculateBosonProxyAddress,
  setupTestEnvironment,
  getSnapshot,
  revertToSnapshot,
  deriveTokenId,
  getEvent,
  prepareDataSignature,
} = require("../util/utils.js");
const {
  mockOffer,
  mockDisputeResolver,
  mockSeller,
  mockBuyer,
  mockVoucherInitValues,
  mockAuthToken,
  accountId,
} = require("../util/mock");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");

// AuthorizationType enum mirror
const AuthorizationType = { None: 0, ERC3009: 1 };

// EIP-712 types for ERC-3009 ReceiveWithAuthorization (matches MockERC3009Token)
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

// Generic metatx type
const META_TRANSACTION_TYPES = {
  MetaTransaction: [
    { name: "nonce", type: "uint256" },
    { name: "from", type: "address" },
    { name: "contractAddress", type: "address" },
    { name: "functionName", type: "string" },
    { name: "functionSignature", type: "bytes" },
  ],
};

/**
 * Test the Buyer-Initiated Exchange feature (BPIP-9), specifically the
 * `commitToOffer() - Seller Commits` (a.k.a. `commitToBuyerOffer`) context,
 * but invoked through `executeMetaTransactionWithAuthorization` with an
 * ERC-3009 authorization queue instead of a pre-approved ERC-20 allowance.
 *
 * Mirrors the original `commitToOffer() - Seller Commits` context from
 * `BuyerInitiatedOfferTest.js`:
 *   - The exchange token is a MockERC3009Token (kept under the variable name
 *     `mockToken` to minimize diff with the original).
 *   - The seller (assistant) signs both the metatx and a single-entry ERC-3009
 *     authorization for `sellerDeposit`. No `approve` call is made.
 *   - The buyer pre-deposits the price into the protocol via the standard
 *     approve+depositFunds flow, since this context only exercises the
 *     seller-side commit.
 */
describe("Buyer-Initiated Exchange — Seller Commits with authorization", function () {
  let pauser, rando, assistant, admin, treasury, adminDR, treasuryDR, buyer1, buyer2, assistant2;
  let accountHandler, fundsHandler, exchangeHandler, exchangeCommitHandler, offerHandler, pauseHandler;
  let metaTransactionsHandler;
  let seller, seller2;
  let offer, offerDates, offerDurations, offerFees;
  let buyerCreatedOffer;
  let mockToken;
  let buyerEscalationDepositPercentage;
  let buyerId, buyerId2, sellerId, sellerId2;
  let disputeResolver;
  let voucherInitValues, emptyAuthToken;
  let agentId, offerFeeLimit;
  let snapshot;
  let nextOfferId;
  let weth;
  let protocolDiamondAddress;
  let bosonErrors;
  let deployer;

  before(async function () {
    [, pauser, rando, assistant, admin, , treasury, , adminDR, , treasuryDR, buyer1, buyer2, assistant2] =
      await getSigners();

    const wethFactory = await getContractFactory("WETH9");
    weth = await wethFactory.deploy();
    await weth.waitForDeployment();

    const contracts = {
      accountHandler: "IBosonAccountHandler",
      offerHandler: "IBosonOfferHandler",
      exchangeHandler: "IBosonExchangeHandler",
      exchangeCommitHandler: "IBosonExchangeCommitHandler",
      fundsHandler: "IBosonFundsHandler",
      pauseHandler: "IBosonPauseHandler",
      metaTransactionsHandler: "IBosonMetaTransactionsHandler",
    };

    // Deploy ERC-3009 token; keep variable name `mockToken` to minimize the diff with the original.
    const Mock3009 = await getContractFactory("MockERC3009Token");
    mockToken = await Mock3009.deploy("Foreign20", "F20");
    await mockToken.waitForDeployment();

    ({
      signers: [pauser, admin, treasury, rando, adminDR, treasuryDR, assistant2],
      contractInstances: {
        accountHandler,
        offerHandler,
        exchangeHandler,
        exchangeCommitHandler,
        fundsHandler,
        pauseHandler,
        metaTransactionsHandler,
      },
      protocolConfig: [, , , , buyerEscalationDepositPercentage],
      diamondAddress: protocolDiamondAddress,
    } = await setupTestEnvironment(contracts, { wethAddress: await weth.getAddress() }));

    bosonErrors = await getContractAt("BosonErrors", protocolDiamondAddress);

    [deployer] = await getSigners();

    assistant = admin;

    snapshot = await getSnapshot();
  });

  beforeEach(async function () {
    await revertToSnapshot(snapshot);
    snapshot = await getSnapshot();

    accountId.next(true);

    seller = mockSeller(
      await assistant.getAddress(),
      await admin.getAddress(),
      ZeroAddress,
      await treasury.getAddress()
    );
    expect(seller.isValid()).is.true;

    voucherInitValues = mockVoucherInitValues();
    expect(voucherInitValues.isValid()).is.true;

    emptyAuthToken = mockAuthToken();
    expect(emptyAuthToken.isValid()).is.true;
    await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);
    sellerId = seller.id;

    seller2 = mockSeller(
      await assistant2.getAddress(),
      await assistant2.getAddress(),
      ZeroAddress,
      await treasury.getAddress()
    );
    expect(seller2.isValid()).is.true;
    await accountHandler.connect(assistant2).createSeller(seller2, emptyAuthToken, voucherInitValues);
    sellerId2 = seller2.id;

    const buyer = mockBuyer(await buyer1.getAddress());
    expect(buyer.isValid()).is.true;
    await accountHandler.connect(buyer1).createBuyer(buyer);
    buyerId = buyer.id;

    const buyerEntity2 = mockBuyer(await buyer2.getAddress());
    expect(buyerEntity2.isValid()).is.true;
    await accountHandler.connect(buyer2).createBuyer(buyerEntity2);
    buyerId2 = buyerEntity2.id;

    disputeResolver = mockDisputeResolver(
      await adminDR.getAddress(),
      await adminDR.getAddress(),
      ZeroAddress,
      await treasuryDR.getAddress(),
      true
    );
    expect(disputeResolver.isValid()).is.true;

    const disputeResolverFees = [
      new DisputeResolverFee(ZeroAddress, "Native", "0"),
      new DisputeResolverFee(await mockToken.getAddress(), "Foreign20", "0"),
    ];

    await accountHandler.connect(adminDR).createDisputeResolver(disputeResolver, disputeResolverFees, []);

    nextOfferId = "1";

    ({ offer, offerDates, offerDurations, offerFees } = await mockOffer());

    // Buyer-created offer denominated in the ERC-3009 token
    buyerCreatedOffer = offer.clone();
    buyerCreatedOffer.sellerId = "0";
    buyerCreatedOffer.creator = OfferCreator.Buyer;
    buyerCreatedOffer.buyerId = buyerId;
    buyerCreatedOffer.collectionIndex = "0";
    buyerCreatedOffer.royaltyInfo = [new RoyaltyInfo([], [])];
    buyerCreatedOffer.exchangeToken = await mockToken.getAddress();

    agentId = "0";
    offerFeeLimit = MaxUint256;

    // Top up the seller's wallet so they can sign auths for sellerDeposit.
    await mockToken.mint(await assistant.getAddress(), parseUnits("100", "ether").toString());
    await mockToken.mint(await assistant2.getAddress(), parseUnits("100", "ether").toString());

    // Top up buyers and pre-deposit the price into protocol via the standard path.
    // This context exercises the seller-side commit only; buyer-side allowance
    // is intentionally kept on the standard `approve` + `depositFunds` flow.
    await mockToken.mint(await buyer1.getAddress(), parseUnits("100", "ether").toString());
    await mockToken.mint(await buyer2.getAddress(), parseUnits("100", "ether").toString());
  });

  afterEach(async function () {
    accountId.next(true);
  });

  // Helpers ---------------------------------------------------------------

  async function signReceiveWithAuthorization(signer, params) {
    const { chainId } = await ethers.provider.getNetwork();
    const domain = {
      name: await mockToken.name(),
      version: "1",
      chainId,
      verifyingContract: await mockToken.getAddress(),
    };
    const sig = await signer.signTypedData(domain, RECEIVE_WITH_AUTHORIZATION_TYPES, params);
    const split = Signature.from(sig);
    return { v: split.v, r: split.r, s: split.s };
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
    const { v, r, s } = await signReceiveWithAuthorization(signer, params);
    return AbiCoder.defaultAbiCoder().encode(
      ["uint256", "uint256", "bytes32", "uint8", "bytes32", "bytes32"],
      [validAfter, validBefore, authNonce, v, r, s]
    );
  }

  function encodeAuthQueue(entries) {
    return AbiCoder.defaultAbiCoder().encode(["bytes[]"], [entries]);
  }

  /**
   * Drop-in replacement for
   *   `exchangeCommitHandler.connect(sellerSigner).commitToBuyerOffer(offerId, sellerParams)`
   *
   * Wraps the call in `executeMetaTransactionWithAuthorization`. The seller signs
   * both the metatx and a single-entry ERC-3009 auth for `amount`. If `amount` is
   * 0, no auth is needed (`AuthorizationType.None`). For revert tests that want
   * the safeTransferFrom fallback path, set `forceFallback: true` to insert an
   * empty queue entry instead of a real auth.
   */
  async function commitToBuyerOfferWithAuth({
    caller,
    sellerSigner,
    targetOfferId,
    sellerParams,
    amount,
    forceFallback = false,
  }) {
    caller = caller ?? deployer;

    const fragment = exchangeCommitHandler.interface.getFunction("commitToBuyerOffer");
    const functionName = fragment.format("sighash");
    const fnSig = exchangeCommitHandler.interface.encodeFunctionData("commitToBuyerOffer", [
      targetOfferId,
      sellerParams,
    ]);

    const metatxNonce = parseInt(randomBytes(8));
    const metatxMessage = {
      nonce: metatxNonce,
      from: await sellerSigner.getAddress(),
      contractAddress: await metaTransactionsHandler.getAddress(),
      functionName,
      functionSignature: fnSig,
    };
    const signature = await prepareDataSignature(
      sellerSigner,
      META_TRANSACTION_TYPES,
      "MetaTransaction",
      metatxMessage,
      await metaTransactionsHandler.getAddress()
    );

    let authType = AuthorizationType.None;
    let authPayload = "0x";
    if (forceFallback) {
      authType = AuthorizationType.ERC3009;
      authPayload = encodeAuthQueue(["0x"]);
    } else if (amount && BigInt(amount) > 0n) {
      authType = AuthorizationType.ERC3009;
      authPayload = encodeAuthQueue([await buildAuthEntry(sellerSigner, amount)]);
    }

    return metaTransactionsHandler
      .connect(caller)
      .executeMetaTransactionWithAuthorization(
        await sellerSigner.getAddress(),
        functionName,
        fnSig,
        metatxNonce,
        signature,
        authType,
        authPayload
      );
  }

  // -----------------------------------------------------------------------

  context("🤝 Seller Commitment to Buyer Offers", async function () {
    let price, sellerDeposit;

    beforeEach(async function () {
      await offerHandler
        .connect(buyer1)
        .createOffer(
          buyerCreatedOffer,
          offerDates,
          offerDurations,
          { disputeResolverId: disputeResolver.id, mutualizerAddress: ZeroAddress },
          agentId,
          offerFeeLimit
        );

      price = buyerCreatedOffer.price;
      sellerDeposit = buyerCreatedOffer.sellerDeposit;

      // Buyer pre-deposits payment via the standard approve+depositFunds flow.
      await mockToken.connect(buyer1).approve(protocolDiamondAddress, price);
      await fundsHandler.connect(buyer1).depositFunds(buyerId, await mockToken.getAddress(), price);
    });

    context("👉 commitToOffer() with authorization - Seller Commits", async function () {
      it("should emit SellerCommitted, FundsDeposited, and FundsEncumbered events when seller commits to buyer offer", async function () {
        const expectedExchangeId = "1";

        const sellerParams = {
          collectionIndex: 0,
          royaltyInfo: { recipients: [ZeroAddress], bps: [0] },
          mutualizerAddress: ZeroAddress,
        };

        const tx = await commitToBuyerOfferWithAuth({
          sellerSigner: assistant,
          targetOfferId: nextOfferId,
          sellerParams,
          amount: sellerDeposit,
        });

        const receipt = await tx.wait();
        const event = getEvent(receipt, exchangeCommitHandler, "SellerCommitted");

        expect(event[0]).to.equal(BigInt(nextOfferId));
        expect(event[1]).to.equal(BigInt(sellerId));
        expect(event[2]).to.equal(BigInt(expectedExchangeId));
        expect(event[5]).to.equal(await assistant.getAddress());

        const exchange = event[3];
        expect(exchange[0]).to.equal(BigInt(expectedExchangeId));
        expect(exchange[1]).to.equal(BigInt(nextOfferId));
        expect(exchange[2]).to.equal(buyerId);
        expect(exchange[3]).to.equal(0n);

        const voucher = event[4];
        expect(voucher[0]).to.be.gt(0);
        expect(voucher[1]).to.be.gt(0);

        await expect(tx)
          .to.emit(fundsHandler, "FundsDeposited")
          .withArgs(sellerId, assistant.address, buyerCreatedOffer.exchangeToken, buyerCreatedOffer.sellerDeposit);
        await expect(tx)
          .to.emit(fundsHandler, "FundsEncumbered")
          .withArgs(sellerId, buyerCreatedOffer.exchangeToken, buyerCreatedOffer.sellerDeposit, assistant.address);
      });

      it("should update state correctly when seller commits to buyer offer", async function () {
        const expectedExchangeId = "1";

        const externalId = "Brand1";
        voucherInitValues.collectionSalt = encodeBytes32String(externalId);
        await accountHandler.connect(assistant).createNewCollection(externalId, voucherInitValues);

        const sellerParams = {
          collectionIndex: 1,
          royaltyInfo: { recipients: [ZeroAddress], bps: [0] },
          mutualizerAddress: ZeroAddress,
        };

        await commitToBuyerOfferWithAuth({
          sellerSigner: assistant,
          targetOfferId: nextOfferId,
          sellerParams,
          amount: sellerDeposit,
        });

        const [existsExchange, exchange] = await exchangeHandler.getExchange(expectedExchangeId);
        expect(existsExchange).to.be.true;
        expect(exchange.buyerId).to.equal(buyerId);

        const [existsOffer, updatedOffer] = await offerHandler.getOffer(nextOfferId);
        expect(existsOffer).to.be.true;
        expect(updatedOffer.sellerId).to.equal(sellerId);
        expect(updatedOffer.collectionIndex).to.equal(1);
      });

      it("should mint voucher to buyer when seller commits", async function () {
        const expectedExchangeId = "1";

        const sellerParams = {
          collectionIndex: 0,
          royaltyInfo: { recipients: [ZeroAddress], bps: [0] },
          mutualizerAddress: ZeroAddress,
        };

        await commitToBuyerOfferWithAuth({
          sellerSigner: assistant,
          targetOfferId: nextOfferId,
          sellerParams,
          amount: sellerDeposit,
        });

        const [existsOffer, updatedOffer] = await offerHandler.getOffer(nextOfferId);
        expect(existsOffer).to.be.true;
        expect(updatedOffer.sellerId).to.equal(sellerId);

        const voucherTokenId = deriveTokenId(nextOfferId, expectedExchangeId);
        const voucherCloneAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          await calculateBosonProxyAddress(await accountHandler.getAddress()),
          seller.assistant
        );
        const voucherContract = await getContractAt("IBosonVoucher", voucherCloneAddress);
        const voucherOwner = await voucherContract.ownerOf(voucherTokenId);
        expect(voucherOwner).to.equal(await buyer1.getAddress());
      });

      it("should handle multiple sellers committing to different buyer offers", async function () {
        const buyerCreatedOffer2 = buyerCreatedOffer.clone();
        buyerCreatedOffer2.buyerId = buyerId2;

        await offerHandler
          .connect(buyer2)
          .createOffer(
            buyerCreatedOffer2,
            offerDates,
            offerDurations,
            { disputeResolverId: disputeResolver.id, mutualizerAddress: ZeroAddress },
            agentId,
            offerFeeLimit
          );

        // 2nd buyer pre-deposits via standard path
        await mockToken.connect(buyer2).approve(protocolDiamondAddress, price);
        await fundsHandler.connect(buyer2).depositFunds(buyerId2, await mockToken.getAddress(), price);

        const sellerParams = {
          collectionIndex: 0,
          royaltyInfo: { recipients: [ZeroAddress], bps: [0] },
          mutualizerAddress: ZeroAddress,
        };

        await expect(
          commitToBuyerOfferWithAuth({
            sellerSigner: assistant,
            targetOfferId: "1",
            sellerParams,
            amount: sellerDeposit,
          })
        ).to.emit(exchangeCommitHandler, "SellerCommitted");

        await expect(
          commitToBuyerOfferWithAuth({
            sellerSigner: assistant2,
            targetOfferId: "2",
            sellerParams,
            amount: sellerDeposit,
          })
        ).to.emit(exchangeCommitHandler, "SellerCommitted");

        const [, exchange1] = await exchangeHandler.getExchange("1");
        const [, exchange2] = await exchangeHandler.getExchange("2");

        expect(exchange1.buyerId).to.equal(buyerId);
        expect(exchange2.buyerId).to.equal(buyerId2);

        const [, offer1] = await offerHandler.getOffer("1");
        const [, offer2] = await offerHandler.getOffer("2");
        expect(offer1.sellerId).to.equal(sellerId);
        expect(offer2.sellerId).to.equal(sellerId2);
      });

      context("💔 Revert Reasons", async function () {
        it("should revert if seller has insufficient deposit funds", async function () {
          // Auth signs less than the offer's sellerDeposit → token-side recovery
          // mismatches → InvalidAuthorization (revert).
          const insufficientDeposit = parseUnits("0.1", "ether");

          const sellerParams = {
            collectionIndex: 0,
            royaltyInfo: { recipients: [ZeroAddress], bps: [0] },
            mutualizerAddress: ZeroAddress,
          };

          await expect(
            commitToBuyerOfferWithAuth({
              sellerSigner: assistant,
              targetOfferId: nextOfferId,
              sellerParams,
              amount: insufficientDeposit,
            })
          ).to.be.reverted;
        });

        it("should revert if buyer has insufficient payment funds", async function () {
          // 2nd buyer creates an offer but does NOT pre-deposit; commit tries to
          // encumber from buyer's available funds → InsufficientAvailableFunds.
          const buyerCreatedOffer2 = buyerCreatedOffer.clone();
          buyerCreatedOffer2.buyerId = buyerId2;

          await offerHandler
            .connect(buyer2)
            .createOffer(
              buyerCreatedOffer2,
              offerDates,
              offerDurations,
              { disputeResolverId: disputeResolver.id, mutualizerAddress: ZeroAddress },
              agentId,
              offerFeeLimit
            );

          const sellerParams = {
            collectionIndex: 0,
            royaltyInfo: { recipients: [ZeroAddress], bps: [0] },
            mutualizerAddress: ZeroAddress,
          };

          await expect(
            commitToBuyerOfferWithAuth({
              sellerSigner: assistant,
              targetOfferId: "2",
              sellerParams,
              amount: sellerDeposit,
            })
          ).to.be.revertedWithCustomError(exchangeCommitHandler, "InsufficientAvailableFunds");
        });

        it("should revert if non-seller tries to commit to buyer offer", async function () {
          const sellerParams = {
            collectionIndex: 0,
            royaltyInfo: { recipients: [ZeroAddress], bps: [0] },
            mutualizerAddress: ZeroAddress,
          };

          await expect(
            commitToBuyerOfferWithAuth({
              sellerSigner: rando,
              targetOfferId: nextOfferId,
              sellerParams,
              amount: sellerDeposit,
            })
          ).to.be.revertedWithCustomError(exchangeCommitHandler, "NotAssistant");
        });

        it("should revert if collection index exceeds seller's additional collections", async function () {
          const sellerParams = {
            collectionIndex: 1,
            royaltyInfo: { recipients: [ZeroAddress], bps: [0] },
            mutualizerAddress: ZeroAddress,
          };

          await expect(
            commitToBuyerOfferWithAuth({
              sellerSigner: assistant,
              targetOfferId: nextOfferId,
              sellerParams,
              amount: sellerDeposit,
            })
          ).to.be.revertedWithCustomError(exchangeCommitHandler, "NoSuchCollection");
        });

        it("should revert if mutualizer is EOA", async function () {
          const sellerParams = {
            collectionIndex: 0,
            royaltyInfo: { recipients: [ZeroAddress], bps: [0] },
            mutualizerAddress: assistant.address,
          };

          await expect(
            commitToBuyerOfferWithAuth({
              sellerSigner: assistant,
              targetOfferId: nextOfferId,
              sellerParams,
              amount: sellerDeposit,
            })
          ).to.be.revertedWithCustomError(exchangeCommitHandler, RevertReasons.UNSUPPORTED_MUTUALIZER);
        });

        it("should revert if mutualizer does not support IDRFeeMutualizer interface", async function () {
          const sellerParams = {
            collectionIndex: 0,
            royaltyInfo: { recipients: [ZeroAddress], bps: [0] },
            mutualizerAddress: await mockToken.getAddress(),
          };

          await expect(
            commitToBuyerOfferWithAuth({
              sellerSigner: assistant,
              targetOfferId: nextOfferId,
              sellerParams,
              amount: sellerDeposit,
            })
          ).to.be.revertedWithCustomError(exchangeCommitHandler, RevertReasons.UNSUPPORTED_MUTUALIZER);
        });
      });
    });
  });
});
