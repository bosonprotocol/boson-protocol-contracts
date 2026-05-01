const { ethers } = require("hardhat");
const {
  ZeroAddress,
  getSigners,
  getContractAt,
  provider,
  parseUnits,
  getContractFactory,
  MaxUint256,
  parseEther,
  randomBytes,
  zeroPadValue,
  AbiCoder,
  Signature,
  encodeBytes32String,
} = ethers;
const { expect, assert } = require("chai");

const Exchange = require("../../scripts/domain/Exchange");
const Voucher = require("../../scripts/domain/Voucher");
const Group = require("../../scripts/domain/Group");
const EvaluationMethod = require("../../scripts/domain/EvaluationMethod");
const TokenType = require("../../scripts/domain/TokenType");
const GatingType = require("../../scripts/domain/GatingType");
const PriceType = require("../../scripts/domain/PriceType");
const OfferCreator = require("../../scripts/domain/OfferCreator");
const DisputeResolutionTerms = require("../../scripts/domain/DisputeResolutionTerms");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const { RoyaltyInfo } = require("../../scripts/domain/RoyaltyInfo");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const {
  mockOffer,
  mockDisputeResolver,
  mockAuthToken,
  mockVoucherInitValues,
  mockSeller,
  mockBuyer,
  mockVoucher,
  mockExchange,
  mockCondition,
  accountId,
} = require("../util/mock");
const {
  getEvent,
  setNextBlockTimestamp,
  calculateVoucherExpiry,
  prepareDataSignature,
  calculateCloneAddress,
  calculateBosonProxyAddress,
  applyPercentage,
  deriveTokenId,
  setupTestEnvironment,
  getSnapshot,
  revertToSnapshot,
} = require("../util/utils.js");
const { oneMonth } = require("../util/constants");
const { FundsList } = require("../../scripts/domain/Funds");

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

// EIP-712 types for the metatx that wraps commitToOffer (mirrors metatx test setup)
const COMMIT_TO_OFFER_TYPES = {
  MetaTxCommitToOffer: [
    { name: "nonce", type: "uint256" },
    { name: "from", type: "address" },
    { name: "contractAddress", type: "address" },
    { name: "functionName", type: "string" },
    { name: "offerDetails", type: "MetaTxOfferDetails" },
  ],
  MetaTxOfferDetails: [
    { name: "buyer", type: "address" },
    { name: "offerId", type: "uint256" },
  ],
};

const COMMIT_TO_OFFER_FN_NAME = "commitToOffer(address,uint256)";

// EIP-712 types for the generic metatx that wraps `createOfferAndCommit`
const META_TRANSACTION_TYPES = {
  MetaTransaction: [
    { name: "nonce", type: "uint256" },
    { name: "from", type: "address" },
    { name: "contractAddress", type: "address" },
    { name: "functionName", type: "string" },
    { name: "functionSignature", type: "bytes" },
  ],
};

// EIP-712 type definition for the FullOffer struct (signed by the offer creator)
const FULL_OFFER_TYPES = {
  FullOffer: [
    { name: "offer", type: "Offer" },
    { name: "offerDates", type: "OfferDates" },
    { name: "offerDurations", type: "OfferDurations" },
    { name: "drParameters", type: "DRParameters" },
    { name: "condition", type: "Condition" },
    { name: "agentId", type: "uint256" },
    { name: "feeLimit", type: "uint256" },
    { name: "useDepositedFunds", type: "bool" },
  ],
  Condition: [
    { name: "method", type: "uint8" },
    { name: "tokenType", type: "uint8" },
    { name: "tokenAddress", type: "address" },
    { name: "gating", type: "uint8" },
    { name: "minTokenId", type: "uint256" },
    { name: "threshold", type: "uint256" },
    { name: "maxCommits", type: "uint256" },
    { name: "maxTokenId", type: "uint256" },
  ],
  DRParameters: [
    { name: "disputeResolverId", type: "uint256" },
    { name: "mutualizerAddress", type: "address" },
  ],
  OfferDurations: [
    { name: "disputePeriod", type: "uint256" },
    { name: "voucherValid", type: "uint256" },
    { name: "resolutionPeriod", type: "uint256" },
  ],
  OfferDates: [
    { name: "validFrom", type: "uint256" },
    { name: "validUntil", type: "uint256" },
    { name: "voucherRedeemableFrom", type: "uint256" },
    { name: "voucherRedeemableUntil", type: "uint256" },
  ],
  Offer: [
    { name: "sellerId", type: "uint256" },
    { name: "price", type: "uint256" },
    { name: "sellerDeposit", type: "uint256" },
    { name: "buyerCancelPenalty", type: "uint256" },
    { name: "quantityAvailable", type: "uint256" },
    { name: "exchangeToken", type: "address" },
    { name: "metadataUri", type: "string" },
    { name: "metadataHash", type: "string" },
    { name: "collectionIndex", type: "uint256" },
    { name: "royaltyInfo", type: "RoyaltyInfo" },
    { name: "creator", type: "uint8" },
    { name: "buyerId", type: "uint256" },
  ],
  RoyaltyInfo: [
    { name: "recipients", type: "address[]" },
    { name: "bps", type: "uint256[]" },
  ],
};


/**
 *  Test the Boson Exchange Handler `commitToOffer` flow when invoked via
 *  `executeMetaTransactionWithAuthorization` with an ERC-3009 authorization
 *  queue, instead of a pre-approved ERC-20 allowance.
 *
 *  Mirrors the original `commitToOffer()` context in `ExchangeHandlerTest.js`,
 *  except:
 *    - The exchange token is a MockERC3009Token (kept under the variable name
 *      `foreign20` to minimize diff with the original).
 *    - The buyer never calls `approve` — they sign an ERC-3009 receive
 *      authorization and a metatx, and the relayer submits.
 */
describe("IBosonExchangeHandler — commitToOffer with authorization", function () {
  let deployer, pauser, assistant, admin, treasury, rando, buyer, newOwner, adminDR, treasuryDR;
  let accountHandler,
    exchangeHandler,
    exchangeCommitHandler,
    offerHandler,
    fundsHandler,
    groupHandler,
    pauseHandler,
    configHandler,
    metaTransactionsHandler;
  let voucherImplementation;
  let beaconProxyAddress;
  let buyerId, offerId, seller;
  let block, blockNumber, tx, txReceipt, event;
  let price, sellerPool;
  let voucherRedeemableFrom;
  let voucherValid;
  let protocolFeePercentage;
  let voucher;
  let exchange, exchangeId;
  let disputeResolver, disputeResolverFees;
  let foreign20, foreign721;
  let expectedCloneAddress;
  let voucherInitValues, royaltyPercentage1, seller1Treasury;
  let emptyAuthToken;
  let agentId;
  let offer, offerFees;
  let offerDates, offerDurations, drParams;
  let protocolDiamondAddress;
  let snapshotId;
  let offerFeeLimit;
  let bosonErrors;
  let weth;

  before(async function () {
    accountId.next(true);

    const wethFactory = await getContractFactory("WETH9");
    weth = await wethFactory.deploy();
    await weth.waitForDeployment();

    const contracts = {
      accountHandler: "IBosonAccountHandler",
      offerHandler: "IBosonOfferHandler",
      exchangeHandler: "IBosonExchangeHandler",
      exchangeCommitHandler: "IBosonExchangeCommitHandler",
      fundsHandler: "IBosonFundsHandler",
      groupHandler: "IBosonGroupHandler",
      pauseHandler: "IBosonPauseHandler",
      configHandler: "IBosonConfigHandler",
      metaTransactionsHandler: "IBosonMetaTransactionsHandler",
    };

    ({
      signers: [pauser, admin, treasury, buyer, rando, newOwner, , adminDR, treasuryDR],
      contractInstances: {
        accountHandler,
        offerHandler,
        exchangeHandler,
        exchangeCommitHandler,
        fundsHandler,
        groupHandler,
        pauseHandler,
        configHandler,
        metaTransactionsHandler,
      },
      protocolConfig: [, , protocolFeePercentage],
      extraReturnValues: { voucherImplementation },
      diamondAddress: protocolDiamondAddress,
    } = await setupTestEnvironment(contracts, {
      wethAddress: await weth.getAddress(),
    }));

    bosonErrors = await getContractAt("BosonErrors", protocolDiamondAddress);

    [deployer] = await getSigners();

    assistant = admin;

    // Deploy ERC-3009 token; keep variable name `foreign20` for diff parity.
    const Mock3009 = await getContractFactory("MockERC3009Token");
    foreign20 = await Mock3009.deploy("Foreign20", "F20");
    await foreign20.waitForDeployment();

    // Foreign721 used for conditional offer tests
    [foreign721] = await deployMockTokens(["Foreign721"]);

    beaconProxyAddress = await calculateBosonProxyAddress(protocolDiamondAddress);

    snapshotId = await getSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();
  });

  // Helpers ---------------------------------------------------------------

  async function signReceiveWithAuthorization(signer, params) {
    const { chainId } = await provider.getNetwork();
    const domain = {
      name: await foreign20.name(),
      version: "1",
      chainId,
      verifyingContract: await foreign20.getAddress(),
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
   * Drop-in replacement for `exchangeCommitHandler.connect(caller).commitToOffer(buyerAddress, offerId)`.
   * Wraps the call in an `executeMetaTransactionWithAuthorization` whose queue carries a single ERC-3009
   * authorization signed by `buyerSigner`. If `amount` is 0 (price-zero offers), the queue is skipped.
   */
  async function commitToOfferWithAuth({ caller, buyerSigner, buyerAddress, offerId: targetOfferId, amount }) {
    caller = caller ?? deployer;
    buyerAddress = buyerAddress ?? (await buyerSigner.getAddress());
    amount = amount ?? price;

    const metatxNonce = parseInt(randomBytes(8));
    const fnSig = exchangeCommitHandler.interface.encodeFunctionData("commitToOffer", [buyerAddress, targetOfferId]);

    const message = {
      nonce: metatxNonce,
      from: await buyerSigner.getAddress(),
      contractAddress: await metaTransactionsHandler.getAddress(),
      functionName: COMMIT_TO_OFFER_FN_NAME,
      offerDetails: { buyer: buyerAddress, offerId: targetOfferId.toString() },
    };

    const signature = await prepareDataSignature(
      buyerSigner,
      COMMIT_TO_OFFER_TYPES,
      "MetaTxCommitToOffer",
      message,
      await metaTransactionsHandler.getAddress()
    );

    let authType = AuthorizationType.None;
    let authPayload = "0x";
    if (BigInt(amount) > 0n) {
      authType = AuthorizationType.ERC3009;
      authPayload = encodeAuthQueue([await buildAuthEntry(buyerSigner, amount)]);
    }

    return metaTransactionsHandler
      .connect(caller)
      .executeMetaTransactionWithAuthorization(
        await buyerSigner.getAddress(),
        COMMIT_TO_OFFER_FN_NAME,
        fnSig,
        metatxNonce,
        signature,
        authType,
        authPayload
      );
  }

  // -----------------------------------------------------------------------

  context("📋 Exchange Handler Methods", async function () {
    beforeEach(async function () {
      exchangeId = offerId = "1";
      agentId = "0";
      offerFeeLimit = MaxUint256;

      seller = mockSeller(
        await assistant.getAddress(),
        await admin.getAddress(),
        ZeroAddress,
        await treasury.getAddress()
      );
      expect(seller.isValid()).is.true;

      emptyAuthToken = mockAuthToken();
      expect(emptyAuthToken.isValid()).is.true;

      seller1Treasury = seller.treasury;
      royaltyPercentage1 = "500";
      voucherInitValues = mockVoucherInitValues();
      voucherInitValues.royaltyPercentage = royaltyPercentage1;
      expect(voucherInitValues.isValid()).is.true;

      await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);
      expectedCloneAddress = calculateCloneAddress(
        await accountHandler.getAddress(),
        beaconProxyAddress,
        admin.address
      );

      disputeResolver = mockDisputeResolver(
        await adminDR.getAddress(),
        await adminDR.getAddress(),
        ZeroAddress,
        await treasuryDR.getAddress(),
        true
      );
      expect(disputeResolver.isValid()).is.true;

      const DRFee = parseEther("0.1");
      // Add foreign20 to DR fees so offers using it as exchangeToken can be created.
      disputeResolverFees = [
        new DisputeResolverFee(ZeroAddress, "Native", DRFee.toString()),
        new DisputeResolverFee(await foreign20.getAddress(), "Foreign20", "0"),
      ];

      await accountHandler.connect(adminDR).createDisputeResolver(disputeResolver, disputeResolverFees, []);

      const mo = await mockOffer();
      ({ offerDates, offerDurations, drParams } = mo);
      offer = mo.offer;
      offerFees = mo.offerFees;
      offerFees.protocolFee = applyPercentage(offer.price, protocolFeePercentage);

      offer.quantityAvailable = "10";
      offer.exchangeToken = await foreign20.getAddress();
      offer.royaltyInfo = [new RoyaltyInfo([ZeroAddress], [voucherInitValues.royaltyPercentage])];

      offerDurations.voucherValid = (oneMonth * 12n).toString();

      expect(offer.isValid()).is.true;
      expect(offerDates.isValid()).is.true;
      expect(offerDurations.isValid()).is.true;

      await offerHandler
        .connect(assistant)
        .createOffer(offer, offerDates, offerDurations, drParams, agentId, offerFeeLimit);

      price = offer.price;
      voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
      voucherValid = offerDurations.voucherValid;
      sellerPool = parseUnits("15", "ether").toString();

      voucher = mockVoucher();
      voucher.redeemedDate = "0";

      exchange = mockExchange();

      buyerId = accountId.next().value;
      exchange.buyerId = buyerId;
      exchange.finalizedDate = "0";

      // Seller deposits the offer-token pool. Seller side keeps the standard
      // approve+depositFunds path — the test focus is the buyer-side auth.
      await foreign20.mint(await assistant.getAddress(), sellerPool);
      await foreign20.connect(assistant).approve(protocolDiamondAddress, sellerPool);
      await fundsHandler.connect(assistant).depositFunds(seller.id, await foreign20.getAddress(), sellerPool);

      // Top up buyers; deliberately NO approve calls on the buyer side.
      await foreign20.mint(await buyer.getAddress(), parseEther("10").toString());
      await foreign20.mint(await newOwner.getAddress(), parseEther("10").toString());
    });

    afterEach(async function () {
      accountId.next(true);
    });

    context("👉 commitToOffer() with authorization", async function () {
      it("should emit a BuyerCommitted, FundsDeposited and FundsEncumbered event", async function () {
        tx = await commitToOfferWithAuth({
          buyerSigner: buyer,
          buyerAddress: await buyer.getAddress(),
          offerId,
        });
        txReceipt = await tx.wait();
        event = getEvent(txReceipt, exchangeHandler, "BuyerCommitted");

        blockNumber = tx.blockNumber;
        block = await provider.getBlock(blockNumber);

        voucher.committedDate = block.timestamp.toString();
        voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

        assert.equal(event.exchangeId.toString(), exchangeId, "Exchange id is incorrect");
        assert.equal(event.offerId.toString(), offerId, "Offer id is incorrect");
        assert.equal(event.buyerId.toString(), buyerId, "Buyer id is incorrect");

        assert.equal(
          Exchange.fromStruct(event.exchange).toString(),
          exchange.toString(),
          "Exchange struct is incorrect"
        );

        assert.equal(Voucher.fromStruct(event.voucher).toString(), voucher.toString(), "Voucher struct is incorrect");

        await expect(tx).to.not.emit(exchangeHandler, "ConditionalCommitAuthorized");

        await expect(tx)
          .to.emit(fundsHandler, "FundsDeposited")
          .withArgs(buyerId, buyer.address, offer.exchangeToken, offer.price);
        await expect(tx)
          .to.emit(fundsHandler, "FundsEncumbered")
          .withArgs(buyerId, offer.exchangeToken, price, buyer.address);
      });

      it("should increment the next exchange id counter", async function () {
        await commitToOfferWithAuth({ buyerSigner: buyer, offerId });

        const nextExchangeId = await exchangeHandler.connect(rando).getNextExchangeId();
        expect(nextExchangeId).to.equal(BigInt(exchangeId) + 1n);
      });

      it("should issue the voucher on the correct clone", async function () {
        const bosonVoucherClone = await getContractAt("IBosonVoucher", expectedCloneAddress);

        // Create a new seller to get a new clone
        const seller2 = mockSeller(
          await rando.getAddress(),
          await rando.getAddress(),
          ZeroAddress,
          await rando.getAddress()
        );
        seller2.id = "3";
        expect(seller2.isValid()).is.true;

        await accountHandler.connect(rando).createSeller(seller2, emptyAuthToken, voucherInitValues);

        const expectedClone2 = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          rando.address
        );
        const bosonVoucherClone2 = await getContractAt("IBosonVoucher", expectedClone2);

        // Create a second offer on the new seller, also denominated in foreign20
        const { offer: offer2, offerDates: od2, offerDurations: ofd2 } = await mockOffer();
        offer2.exchangeToken = await foreign20.getAddress();
        offer2.royaltyInfo[0].bps[0] = voucherInitValues.royaltyPercentage;

        await offerHandler.connect(rando).createOffer(offer2, od2, ofd2, drParams, agentId, offerFeeLimit);

        // Fund the new seller's pool in foreign20
        await foreign20.mint(await rando.getAddress(), sellerPool);
        await foreign20.connect(rando).approve(protocolDiamondAddress, sellerPool);
        await fundsHandler.connect(rando).depositFunds(seller2.id, await foreign20.getAddress(), sellerPool);

        const buyer2 = newOwner;

        const tx1 = await commitToOfferWithAuth({ buyerSigner: buyer, offerId });
        const tokenId1 = deriveTokenId(offerId, "1");
        const tx2 = await commitToOfferWithAuth({
          buyerSigner: buyer2,
          buyerAddress: await buyer2.getAddress(),
          offerId: ++offerId,
        });
        const tokenId2 = deriveTokenId(offerId, "2");

        await expect(tx1)
          .to.emit(bosonVoucherClone, "Transfer")
          .withArgs(0n, await buyer.getAddress(), tokenId1);
        await expect(tx2)
          .to.emit(bosonVoucherClone2, "Transfer")
          .withArgs(0n, await buyer2.getAddress(), tokenId2);

        expect(await bosonVoucherClone.balanceOf(await buyer.getAddress())).to.equal("1");
        expect(await bosonVoucherClone.balanceOf(await buyer2.getAddress())).to.equal("0");
        expect(await bosonVoucherClone2.balanceOf(await buyer.getAddress())).to.equal("0");
        expect(await bosonVoucherClone2.balanceOf(await buyer2.getAddress())).to.equal("1");

        expect(await bosonVoucherClone.ownerOf(tokenId1)).to.equal(await buyer.getAddress());
        await expect(bosonVoucherClone.ownerOf(tokenId2)).to.revertedWith(RevertReasons.ERC721_INVALID_TOKEN_ID);
        expect(await bosonVoucherClone2.ownerOf(tokenId2)).to.equal(await buyer2.getAddress());
        await expect(bosonVoucherClone2.ownerOf(tokenId1)).to.revertedWith(RevertReasons.ERC721_INVALID_TOKEN_ID);

        expect(await voucherImplementation.balanceOf(await buyer.getAddress())).to.equal("0");
        expect(await voucherImplementation.balanceOf(await buyer2.getAddress())).to.equal("0");

        await expect(voucherImplementation.ownerOf(tokenId1)).to.revertedWith(RevertReasons.ERC721_INVALID_TOKEN_ID);
        await expect(voucherImplementation.ownerOf(tokenId2)).to.revertedWith(RevertReasons.ERC721_INVALID_TOKEN_ID);
      });

      it("ERC2981: issued voucher should have royalty fees", async function () {
        const bosonVoucherClone = await getContractAt("IBosonVoucher", expectedCloneAddress);

        // Create a new seller to get a new clone with a different royalty percentage
        const seller2 = mockSeller(
          await rando.getAddress(),
          await rando.getAddress(),
          ZeroAddress,
          await rando.getAddress()
        );
        seller2.id = "3";
        expect(seller2.isValid()).is.true;

        const voucherInitValues2 = mockVoucherInitValues();
        voucherInitValues2.royaltyPercentage = "800"; // 8%
        expect(voucherInitValues2.isValid()).is.true;

        await accountHandler.connect(rando).createSeller(seller2, emptyAuthToken, voucherInitValues2);

        const expectedClone2 = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          rando.address
        );
        const bosonVoucherClone2 = await getContractAt("IBosonVoucher", expectedClone2);

        const { offer: offer2, offerDates: od2, offerDurations: ofd2 } = await mockOffer();
        offer2.exchangeToken = await foreign20.getAddress();
        offer2.royaltyInfo = [new RoyaltyInfo([ZeroAddress], [voucherInitValues2.royaltyPercentage])];

        await offerHandler.connect(rando).createOffer(offer2, od2, ofd2, drParams, agentId, offerFeeLimit);

        await foreign20.mint(await rando.getAddress(), sellerPool);
        await foreign20.connect(rando).approve(protocolDiamondAddress, sellerPool);
        await fundsHandler.connect(rando).depositFunds(seller2.id, await foreign20.getAddress(), sellerPool);

        const buyer2 = newOwner;

        const tx1 = await commitToOfferWithAuth({ buyerSigner: buyer, offerId });
        const tokenId1 = deriveTokenId(offerId, "1");
        const tx2 = await commitToOfferWithAuth({
          buyerSigner: buyer2,
          buyerAddress: await buyer2.getAddress(),
          offerId: ++offerId,
        });
        const tokenId2 = deriveTokenId(offerId, "2");

        await expect(tx1)
          .to.emit(bosonVoucherClone, "Transfer")
          .withArgs(0n, await buyer.getAddress(), tokenId1);
        await expect(tx2)
          .to.emit(bosonVoucherClone2, "Transfer")
          .withArgs(0n, await buyer2.getAddress(), tokenId2);

        // Royalty for first offer (seller 1: 5%)
        let [receiver, royaltyAmount] = await bosonVoucherClone
          .connect(assistant)
          .royaltyInfo(tokenId1, offer.price);
        expect(receiver).to.equal(seller1Treasury);
        expect(royaltyAmount.toString()).to.equal(applyPercentage(price, royaltyPercentage1));

        // Royalty for second offer (seller 2: 8%)
        [receiver, royaltyAmount] = await bosonVoucherClone2
          .connect(assistant)
          .royaltyInfo(tokenId2, offer2.price);
        expect(receiver).to.equal(seller2.treasury);
        expect(royaltyAmount.toString()).to.equal(applyPercentage(offer2.price, voucherInitValues2.royaltyPercentage));
      });

      it("should allow redemption period to be defined by date rather than duration", async function () {
        const { offer: offer2, offerDates: od2, offerDurations: ofd2 } = await mockOffer();
        ofd2.voucherValid = "0";
        od2.voucherRedeemableUntil = od2.validUntil;
        offer2.exchangeToken = await foreign20.getAddress();
        offer2.royaltyInfo[0].bps[0] = voucherInitValues.royaltyPercentage;

        expect(offer2.isValid()).is.true;
        expect(od2.isValid()).is.true;
        expect(ofd2.isValid()).is.true;

        await offerHandler.connect(assistant).createOffer(offer2, od2, ofd2, drParams, agentId, offerFeeLimit);
        exchange.offerId = offerId = "2";

        tx = await commitToOfferWithAuth({ buyerSigner: buyer, offerId, amount: offer2.price });
        txReceipt = await tx.wait();
        event = getEvent(txReceipt, exchangeHandler, "BuyerCommitted");

        blockNumber = tx.blockNumber;
        block = await provider.getBlock(blockNumber);

        voucher.committedDate = block.timestamp.toString();
        voucher.validUntilDate = od2.validUntil;

        assert.equal(event.exchangeId.toString(), exchangeId, "Exchange id is incorrect");
        assert.equal(event.offerId.toString(), offerId, "Offer id is incorrect");
        assert.equal(event.buyerId.toString(), buyerId, "Buyer id is incorrect");

        assert.equal(
          Exchange.fromStruct(event.exchange).toString(),
          exchange.toString(),
          "Exchange struct is incorrect"
        );
        assert.equal(Voucher.fromStruct(event.voucher).toString(), voucher.toString(), "Voucher struct is incorrect");
      });

      it("Should decrement quantityAvailable", async function () {
        await commitToOfferWithAuth({ buyerSigner: buyer, offerId });

        const [, fetched] = await offerHandler.connect(rando).getOffer(offerId);
        expect(fetched.quantityAvailable).to.equal(9, "Quantity available should be 9");
      });

      it("Should not decrement quantityAvailable if offer is unlimited", async function () {
        let { offer: offer2, ...details } = await mockOffer();
        offer2.quantityAvailable = MaxUint256.toString();
        offer2.exchangeToken = await foreign20.getAddress();
        offer2.royaltyInfo[0].bps[0] = voucherInitValues.royaltyPercentage;
        delete details.offerFees;

        expect(offer2.isValid()).is.true;

        await offerHandler.connect(assistant).createOffer(offer2, ...Object.values(details), agentId, offerFeeLimit);
        exchange.offerId = offerId = "2";

        await commitToOfferWithAuth({ buyerSigner: buyer, offerId, amount: offer2.price });

        const [, fetched] = await offerHandler.connect(rando).getOffer(offerId);
        expect(fetched.quantityAvailable).to.equal(MaxUint256, "Quantity available should be unlimited");
      });

      it("Should not decrement seller funds if offer price and sellerDeposit is 0", async function () {
        const tokenAddresses = [ZeroAddress, await foreign20.getAddress()];
        const sellersFundsBefore = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id, tokenAddresses));

        await configHandler.connect(deployer).setProtocolFeePercentage("0");
        offerFees.protocolFee = "0";

        const mo = await mockOffer();
        const { offerDates: od2, offerDurations: ofd2, drParams: dr2 } = mo;
        const offer2 = mo.offer;
        offer2.royaltyInfo[0].bps[0] = voucherInitValues.royaltyPercentage;
        offer2.price = offer2.sellerDeposit = offer2.buyerCancelPenalty = "0";
        offer2.exchangeToken = await foreign20.getAddress();
        dr2.disputeResolverId = agentId = "0";
        exchange.offerId = offerId = "2";

        expect(offer2.isValid()).is.true;

        await offerHandler.connect(assistant).createOffer(offer2, od2, ofd2, dr2, agentId, offerFeeLimit);

        await commitToOfferWithAuth({ buyerSigner: buyer, offerId, amount: "0" });

        const sellerFundsAfter = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id, tokenAddresses));
        expect(sellerFundsAfter.toString()).to.equal(
          sellersFundsBefore.toString(),
          "Seller funds should not be decremented"
        );
      });

      it("If group has no condition, buyers can commit using this method", async function () {
        const groupId = "1";
        const offerIds = [offerId];

        const condition = mockCondition({
          method: EvaluationMethod.None,
          tokenAddress: ZeroAddress,
          threshold: "0",
          maxCommits: "0",
        });
        expect(condition.isValid()).to.be.true;

        const group = new Group(groupId, seller.id, offerIds);
        expect(group.isValid()).is.true;
        await groupHandler.connect(assistant).createGroup(group, condition);

        await expect(commitToOfferWithAuth({ buyerSigner: buyer, offerId })).to.not.reverted;
      });

      it("should work on an additional collection", async function () {
        const externalId = `Brand1`;
        voucherInitValues.collectionSalt = encodeBytes32String(externalId);
        await accountHandler.connect(assistant).createNewCollection(externalId, voucherInitValues);

        offer.collectionIndex = 1;
        offer.id = await offerHandler.getNextOfferId();
        exchangeId = await exchangeHandler.getNextExchangeId();
        const tokenId = deriveTokenId(offer.id, exchangeId);

        await offerHandler
          .connect(assistant)
          .createOffer(offer, offerDates, offerDurations, drParams, agentId, offerFeeLimit);

        await commitToOfferWithAuth({ buyerSigner: buyer, buyerAddress: buyer.address, offerId: offer.id });

        const defaultCloneAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          admin.address
        );
        const defaultBosonVoucher = await getContractAt("BosonVoucher", defaultCloneAddress);
        const additionalCollectionAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          admin.address,
          voucherInitValues.collectionSalt
        );
        const additionalCollection = await getContractAt("BosonVoucher", additionalCollectionAddress);

        expect(await defaultBosonVoucher.balanceOf(buyer.address)).to.equal("0");
        expect(await additionalCollection.balanceOf(buyer.address)).to.equal("1");

        await expect(defaultBosonVoucher.ownerOf(tokenId)).to.revertedWith(RevertReasons.ERC721_INVALID_TOKEN_ID);
        expect(await additionalCollection.ownerOf(tokenId)).to.equal(buyer.address);
      });

      it("It is possible to commit to fixed offer if price discovery region is paused", async function () {
        await pauseHandler.connect(pauser).pause([PausableRegion.PriceDiscovery]);
        await expect(commitToOfferWithAuth({ buyerSigner: buyer, offerId })).to.emit(exchangeHandler, "BuyerCommitted");
      });

      it("It is possible to commit to fixed offer if sequential commit region is paused", async function () {
        await pauseHandler.connect(pauser).pause([PausableRegion.SequentialCommit]);
        await expect(commitToOfferWithAuth({ buyerSigner: buyer, offerId })).to.emit(exchangeHandler, "BuyerCommitted");
      });

      context("💔 Revert Reasons", async function () {
        it("The exchanges region of protocol is paused", async function () {
          await pauseHandler.connect(pauser).pause([PausableRegion.Exchanges]);

          await expect(commitToOfferWithAuth({ buyerSigner: buyer, offerId }))
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Exchanges);
        });

        it("The buyers region of protocol is paused", async function () {
          await pauseHandler.connect(pauser).pause([PausableRegion.Buyers]);

          await expect(commitToOfferWithAuth({ buyerSigner: buyer, offerId }))
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Buyers);
        });

        it("buyer.address is the zero address", async function () {
          await expect(
            commitToOfferWithAuth({ buyerSigner: buyer, buyerAddress: ZeroAddress, offerId })
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_ADDRESS);
        });

        it("offer id is invalid", async function () {
          offerId = "666";

          await expect(commitToOfferWithAuth({ buyerSigner: buyer, offerId })).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.NO_SUCH_OFFER
          );
        });

        it("offer is voided", async function () {
          await offerHandler.connect(assistant).voidOffer(offerId);

          await expect(commitToOfferWithAuth({ buyerSigner: buyer, offerId })).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.OFFER_HAS_BEEN_VOIDED
          );
        });

        it("offer is not yet available for commits", async function () {
          const blk = await provider.getBlock("latest");

          offerDates.validFrom = (BigInt(blk.timestamp) + oneMonth * 6n).toString();
          offerDates.validUntil = BigInt(offerDates.validFrom + 10).toString();

          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, drParams, agentId, offerFeeLimit);

          await expect(commitToOfferWithAuth({ buyerSigner: buyer, offerId: ++offerId })).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.OFFER_NOT_AVAILABLE
          );
        });

        it("offer has expired", async function () {
          await setNextBlockTimestamp(Number(offerDates.validUntil) + 1);

          await expect(commitToOfferWithAuth({ buyerSigner: buyer, offerId })).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.OFFER_HAS_EXPIRED
          );
        });

        it("offer sold", async function () {
          offer.quantityAvailable = "1";
          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, drParams, agentId, offerFeeLimit);

          await commitToOfferWithAuth({ buyerSigner: buyer, offerId: ++offerId });

          await expect(commitToOfferWithAuth({ buyerSigner: buyer, offerId })).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.OFFER_SOLD_OUT
          );
        });

        it("Offer belongs to a group with condition", async function () {
          const groupId = "1";
          const offerIds = [offerId];

          const condition = mockCondition({
            tokenAddress: await foreign20.getAddress(),
            threshold: "50",
            maxCommits: "3",
          });
          expect(condition.isValid()).to.be.true;

          const group = new Group(groupId, seller.id, offerIds);
          expect(group.isValid()).is.true;
          await groupHandler.connect(assistant).createGroup(group, condition);

          await expect(commitToOfferWithAuth({ buyerSigner: buyer, offerId })).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.GROUP_HAS_CONDITION
          );
        });
      });
    });
  });

  // ====================================================================================
  //  CreateOfferAndCommit with authorization
  // ====================================================================================
  context("📋 Exchange Handler Methods — CreateOfferAndCommit", async function () {
    let assistantDR;
    let condition;
    let disputeResolverId;
    let disputeResolutionTerms;
    let disputePeriod;
    let message;
    const sellerParams = {
      collectionIndex: 0,
      royaltyInfo: { recipients: [], bps: [] },
      mutualizerAddress: ZeroAddress,
    };

    // Build EIP-712 signature for FullOffer (signed by offer creator)
    async function signFullOffer(signer, msg) {
      return prepareDataSignature(
        signer,
        FULL_OFFER_TYPES,
        "FullOffer",
        msg,
        await exchangeCommitHandler.getAddress()
      );
    }

    // Wraps `createOfferAndCommit` in `executeMetaTransactionWithAuthorization`.
    //
    // The queue must mirror the actual `transferFundsIn` call sequence inside the
    // protocol — entries are appended ONLY for transfers that happen. Pass:
    //   - `offerCreatorAmount > 0`        → real auth entry for the offer creator
    //   - `forceFallbackOnOfferCreator`   → empty-bytes entry (forces safeTransferFrom)
    //   - neither                         → no entry (transferFundsIn is skipped, e.g. price/deposit==0 or useDepositedFunds)
    // Same shape for the committer side.
    async function createOfferAndCommitWithAuth({
      caller,
      committerSigner,
      offerCreatorSigner,
      fullOfferTuple,
      offerCreatorAddress,
      committerAddress,
      fullOfferSignature,
      conditionalTokenId,
      sp,
      offerCreatorAmount,
      committerAmount,
      forceFallbackOnOfferCreator = false,
      forceFallbackOnCommitter = false,
    }) {
      caller = caller ?? deployer;
      sp = sp ?? sellerParams;

      const fragment = exchangeCommitHandler.interface.getFunction("createOfferAndCommit");
      const functionName = fragment.format("sighash");
      const fnSig = exchangeCommitHandler.interface.encodeFunctionData("createOfferAndCommit", [
        fullOfferTuple,
        offerCreatorAddress,
        committerAddress,
        fullOfferSignature,
        conditionalTokenId,
        sp,
      ]);

      const metatxNonce = parseInt(randomBytes(8));
      const metatxMessage = {
        nonce: metatxNonce,
        from: await committerSigner.getAddress(),
        contractAddress: await metaTransactionsHandler.getAddress(),
        functionName,
        functionSignature: fnSig,
      };
      const signature = await prepareDataSignature(
        committerSigner,
        META_TRANSACTION_TYPES,
        "MetaTransaction",
        metatxMessage,
        await metaTransactionsHandler.getAddress()
      );

      // Build queue. Order matches the protocol's transferFundsIn sequence:
      //   offerCreator pull (if !useDepositedFunds && amount>0), then committer pull.
      const entries = [];
      if (forceFallbackOnOfferCreator) {
        entries.push("0x");
      } else if (offerCreatorAmount && BigInt(offerCreatorAmount) > 0n) {
        entries.push(await buildAuthEntry(offerCreatorSigner, offerCreatorAmount));
      }
      if (forceFallbackOnCommitter) {
        entries.push("0x");
      } else if (committerAmount && BigInt(committerAmount) > 0n) {
        entries.push(await buildAuthEntry(committerSigner, committerAmount));
      }

      const noQueue = entries.length === 0;
      return metaTransactionsHandler
        .connect(caller)
        .executeMetaTransactionWithAuthorization(
          await committerSigner.getAddress(),
          functionName,
          fnSig,
          metatxNonce,
          signature,
          noQueue ? AuthorizationType.None : AuthorizationType.ERC3009,
          noQueue ? "0x" : encodeAuthQueue(entries)
        );
    }

    beforeEach(async function () {
      message = {};
      exchangeId = offerId = "1";
      agentId = "0";
      offerFeeLimit = MaxUint256;
      assistantDR = adminDR;

      seller = mockSeller(
        await assistant.getAddress(),
        await admin.getAddress(),
        ZeroAddress,
        await treasury.getAddress()
      );

      emptyAuthToken = mockAuthToken();
      seller1Treasury = seller.treasury;
      royaltyPercentage1 = "500";
      voucherInitValues = mockVoucherInitValues();
      voucherInitValues.royaltyPercentage = royaltyPercentage1;

      await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);
      expectedCloneAddress = calculateCloneAddress(
        await accountHandler.getAddress(),
        beaconProxyAddress,
        admin.address
      );

      disputeResolver = mockDisputeResolver(
        await assistantDR.getAddress(),
        await adminDR.getAddress(),
        ZeroAddress,
        await treasuryDR.getAddress(),
        true
      );

      disputeResolverFees = [
        new DisputeResolverFee(ZeroAddress, "Native", "0"),
        new DisputeResolverFee(await foreign20.getAddress(), "ERC20", "0"),
      ];

      disputeResolutionTerms = new DisputeResolutionTerms(
        disputeResolver.id,
        disputeResolver.escalationResponsePeriod,
        "0",
        "0",
        ZeroAddress
      );

      await accountHandler.connect(adminDR).createDisputeResolver(disputeResolver, disputeResolverFees, []);

      const mo = await mockOffer();
      ({ offer, offerDates, offerDurations, drParams, offerFees } = mo);
      offer.id = "0";
      offerFees.protocolFee = applyPercentage(offer.price, protocolFeePercentage);
      offer.quantityAvailable = "1";
      offer.exchangeToken = await foreign20.getAddress();
      disputeResolverId = drParams.disputeResolverId;
      offer.royaltyInfo = [new RoyaltyInfo([ZeroAddress], [voucherInitValues.royaltyPercentage])];
      offerDurations.voucherValid = (oneMonth * 12n).toString();

      condition = mockCondition({ method: EvaluationMethod.None, threshold: "0", maxCommits: "0" });

      price = offer.price;
      voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
      voucherValid = offerDurations.voucherValid;
      disputePeriod = offerDurations.disputePeriod;

      voucher = mockVoucher();
      voucher.redeemedDate = "0";
      exchange = mockExchange();
      buyerId = accountId.next().value;
      exchange.buyerId = buyerId;
      exchange.finalizedDate = "0";

      message.offerDates = offerDates;
      message.offerDurations = offerDurations;
      message.drParameters = drParams;
      message.condition = condition;
      message.agentId = agentId.toString();
      message.feeLimit = offerFeeLimit.toString();
      message.useDepositedFunds = false;

      // Top up wallets that pay during commit
      await foreign20.mint(await assistant.getAddress(), parseEther("10").toString());
      await foreign20.mint(await buyer.getAddress(), parseEther("10").toString());
    });

    context("👉 CreateOfferAndCommit with authorization", async function () {
      context("seller offer", async function () {
        afterEach(async function () {
          accountId.next(true);
        });

        it("zero seller deposit and erc20 token", async function () {
          offer.sellerDeposit = "0";

          const modifiedOffer = offer.clone();
          modifiedOffer.royaltyInfo = modifiedOffer.royaltyInfo[0];
          message.offer = modifiedOffer;

          const fullOfferSignature = await signFullOffer(assistant, message);

          tx = await createOfferAndCommitWithAuth({
            committerSigner: buyer,
            offerCreatorSigner: assistant,
            fullOfferTuple: [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, false],
            offerCreatorAddress: assistant.address,
            committerAddress: buyer.address,
            fullOfferSignature,
            conditionalTokenId: "0",
            offerCreatorAmount: "0",
            committerAmount: price,
          });

          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          voucher.committedDate = block.timestamp.toString();
          voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

          await expect(tx)
            .to.emit(exchangeHandler, "BuyerCommitted")
            .withArgs(offerId, buyerId, exchangeId, exchange.toStruct(), voucher.toStruct(), buyer.address);

          offer.id = offerId;
          await expect(tx)
            .to.emit(offerHandler, "OfferCreated")
            .withArgs(
              offerId,
              seller.id,
              offer.toStruct(),
              offerDates.toStruct(),
              offerDurations.toStruct(),
              disputeResolutionTerms.toStruct(),
              offerFees.toStruct(),
              agentId,
              buyer.address
            );

          await expect(tx)
            .to.emit(fundsHandler, "FundsDeposited")
            .withArgs(buyerId, buyer.address, offer.exchangeToken, offer.price);
          await expect(tx)
            .to.emit(fundsHandler, "FundsEncumbered")
            .withArgs(buyerId, offer.exchangeToken, price, buyer.address);

          await expect(tx).to.not.emit(exchangeHandler, "ConditionalCommitAuthorized");
          await expect(tx).to.not.emit(groupHandler, "GroupCreated");
        });

        it("non zero seller deposit and erc20 token", async function () {
          offer.sellerDeposit = parseUnits("0.1", "ether").toString();

          const modifiedOffer = offer.clone();
          modifiedOffer.royaltyInfo = modifiedOffer.royaltyInfo[0];
          message.offer = modifiedOffer;

          const fullOfferSignature = await signFullOffer(assistant, message);

          tx = await createOfferAndCommitWithAuth({
            committerSigner: buyer,
            offerCreatorSigner: assistant,
            fullOfferTuple: [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, false],
            offerCreatorAddress: assistant.address,
            committerAddress: buyer.address,
            fullOfferSignature,
            conditionalTokenId: "0",
            offerCreatorAmount: offer.sellerDeposit,
            committerAmount: price,
          });

          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          voucher.committedDate = block.timestamp.toString();
          voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

          await expect(tx)
            .to.emit(exchangeHandler, "BuyerCommitted")
            .withArgs(offerId, buyerId, exchangeId, exchange.toStruct(), voucher.toStruct(), buyer.address);

          offer.id = offerId;
          await expect(tx)
            .to.emit(offerHandler, "OfferCreated")
            .withArgs(
              offerId,
              seller.id,
              offer.toStruct(),
              offerDates.toStruct(),
              offerDurations.toStruct(),
              disputeResolutionTerms.toStruct(),
              offerFees.toStruct(),
              agentId,
              buyer.address
            );

          await expect(tx)
            .to.emit(fundsHandler, "FundsEncumbered")
            .withArgs(buyerId, offer.exchangeToken, price, buyer.address);
          await expect(tx)
            .to.emit(fundsHandler, "FundsDeposited")
            .withArgs(seller.id, assistant.address, offer.exchangeToken, offer.sellerDeposit);
          await expect(tx)
            .to.emit(fundsHandler, "FundsEncumbered")
            .withArgs(seller.id, offer.exchangeToken, offer.sellerDeposit, buyer.address);

          await expect(tx).to.not.emit(exchangeHandler, "ConditionalCommitAuthorized");
          await expect(tx).to.not.emit(groupHandler, "GroupCreated");
        });

        it("use offer creator's deposited funds", async function () {
          offer.sellerDeposit = parseUnits("0.1", "ether").toString();
          // Seller pre-deposits sellerDeposit so the commit doesn't pull from them at runtime.
          await foreign20.connect(assistant).approve(protocolDiamondAddress, offer.sellerDeposit);
          await fundsHandler
            .connect(assistant)
            .depositFunds(seller.id, await foreign20.getAddress(), offer.sellerDeposit);

          const modifiedOffer = offer.clone();
          modifiedOffer.royaltyInfo = modifiedOffer.royaltyInfo[0];
          message.offer = modifiedOffer;
          message.useDepositedFunds = true;

          const fullOfferSignature = await signFullOffer(assistant, message);

          tx = await createOfferAndCommitWithAuth({
            committerSigner: buyer,
            offerCreatorSigner: assistant,
            fullOfferTuple: [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, true],
            offerCreatorAddress: assistant.address,
            committerAddress: buyer.address,
            fullOfferSignature,
            conditionalTokenId: "0",
            offerCreatorAmount: "0", // pre-deposited; no auth needed
            committerAmount: price,
          });

          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          voucher.committedDate = block.timestamp.toString();
          voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

          await expect(tx)
            .to.emit(exchangeHandler, "BuyerCommitted")
            .withArgs(offerId, buyerId, exchangeId, exchange.toStruct(), voucher.toStruct(), buyer.address);

          offer.id = offerId;
          await expect(tx)
            .to.emit(offerHandler, "OfferCreated")
            .withArgs(
              offerId,
              seller.id,
              offer.toStruct(),
              offerDates.toStruct(),
              offerDurations.toStruct(),
              disputeResolutionTerms.toStruct(),
              offerFees.toStruct(),
              agentId,
              buyer.address
            );

          await expect(tx)
            .to.emit(fundsHandler, "FundsDeposited")
            .withArgs(buyerId, buyer.address, offer.exchangeToken, offer.price);
          await expect(tx)
            .to.emit(fundsHandler, "FundsEncumbered")
            .withArgs(buyerId, offer.exchangeToken, price, buyer.address);
          await expect(tx)
            .to.emit(fundsHandler, "FundsEncumbered")
            .withArgs(seller.id, offer.exchangeToken, offer.sellerDeposit, buyer.address);

          await expect(tx).to.not.emit(exchangeHandler, "ConditionalCommitAuthorized");
          await expect(tx).to.not.emit(groupHandler, "GroupCreated");
        });

        it("quantity available greater than 1", async function () {
          offer.sellerDeposit = "0";
          offer.quantityAvailable = "2";

          const modifiedOffer = offer.clone();
          modifiedOffer.royaltyInfo = modifiedOffer.royaltyInfo[0];
          message.offer = modifiedOffer;

          const fullOfferSignature = await signFullOffer(assistant, message);

          // 1st Commit
          await createOfferAndCommitWithAuth({
            committerSigner: buyer,
            offerCreatorSigner: assistant,
            fullOfferTuple: [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, false],
            offerCreatorAddress: assistant.address,
            committerAddress: buyer.address,
            fullOfferSignature,
            conditionalTokenId: "0",
            offerCreatorAmount: "0",
            committerAmount: price,
          });

          // 2nd Commit
          tx = await createOfferAndCommitWithAuth({
            committerSigner: buyer,
            offerCreatorSigner: assistant,
            fullOfferTuple: [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, false],
            offerCreatorAddress: assistant.address,
            committerAddress: buyer.address,
            fullOfferSignature,
            conditionalTokenId: "0",
            offerCreatorAmount: "0",
            committerAmount: price,
          });

          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          voucher.committedDate = block.timestamp.toString();
          voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

          exchange.id = ++exchangeId;
          await expect(tx)
            .to.emit(exchangeHandler, "BuyerCommitted")
            .withArgs(offerId, buyerId, exchangeId, exchange.toStruct(), voucher.toStruct(), buyer.address);

          await expect(tx)
            .to.emit(fundsHandler, "FundsDeposited")
            .withArgs(buyerId, buyer.address, offer.exchangeToken, offer.price);
          await expect(tx)
            .to.emit(fundsHandler, "FundsEncumbered")
            .withArgs(buyerId, offer.exchangeToken, price, buyer.address);

          // Offer should not be created again
          await expect(tx).to.not.emit(offerHandler, "OfferCreated");
          await expect(tx).to.not.emit(exchangeHandler, "ConditionalCommitAuthorized");
          await expect(tx).to.not.emit(groupHandler, "GroupCreated");
        });

        it("conditional offer", async function () {
          offer.sellerDeposit = "0";

          const modifiedOffer = offer.clone();
          modifiedOffer.royaltyInfo = modifiedOffer.royaltyInfo[0];
          message.offer = modifiedOffer;

          const conditionalTokenId = "12";
          condition = mockCondition({
            tokenAddress: await foreign721.getAddress(),
            threshold: "0",
            maxCommits: "3",
            tokenType: TokenType.NonFungibleToken,
            minTokenId: conditionalTokenId,
            method: EvaluationMethod.SpecificToken,
            maxTokenId: "22",
            gating: GatingType.PerAddress,
          });
          message.condition = condition;

          await foreign721.connect(buyer).mint(conditionalTokenId, "1");

          const fullOfferSignature = await signFullOffer(assistant, message);

          tx = await createOfferAndCommitWithAuth({
            committerSigner: buyer,
            offerCreatorSigner: assistant,
            fullOfferTuple: [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, false],
            offerCreatorAddress: assistant.address,
            committerAddress: buyer.address,
            fullOfferSignature,
            conditionalTokenId,
            offerCreatorAmount: "0",
            committerAmount: price,
          });

          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          voucher.committedDate = block.timestamp.toString();
          voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

          await expect(tx)
            .to.emit(exchangeHandler, "BuyerCommitted")
            .withArgs(offerId, buyerId, exchangeId, exchange.toStruct(), voucher.toStruct(), buyer.address);

          offer.id = offerId;
          await expect(tx)
            .to.emit(offerHandler, "OfferCreated")
            .withArgs(
              offerId,
              seller.id,
              offer.toStruct(),
              offerDates.toStruct(),
              offerDurations.toStruct(),
              disputeResolutionTerms.toStruct(),
              offerFees.toStruct(),
              agentId,
              buyer.address
            );

          await expect(tx)
            .to.emit(fundsHandler, "FundsEncumbered")
            .withArgs(buyerId, offer.exchangeToken, price, buyer.address);
          await expect(tx)
            .to.emit(fundsHandler, "FundsDeposited")
            .withArgs(buyerId, buyer.address, offer.exchangeToken, offer.price);

          const groupId = "1";
          const offerIds = [offerId];
          const group = new Group(groupId, seller.id, offerIds);

          await expect(tx)
            .to.emit(groupHandler, "GroupCreated")
            .withArgs(groupId, seller.id, group.toStruct(), condition.toStruct(), buyer.address);
          await expect(tx)
            .to.emit(exchangeHandler, "ConditionalCommitAuthorized")
            .withArgs(offerId, condition.gating, buyer.address, conditionalTokenId, 1, condition.maxCommits);
        });

        context("💔 Revert Reasons", async function () {
          it("Insufficient payment", async function () {
            offer.sellerDeposit = "0";
            const modifiedOffer = offer.clone();
            modifiedOffer.royaltyInfo = modifiedOffer.royaltyInfo[0];
            message.offer = modifiedOffer;
            const fullOfferSignature = await signFullOffer(assistant, message);

            // Sign auth for less than the offer price → token-side InvalidAuthorization
            await expect(
              createOfferAndCommitWithAuth({
                committerSigner: buyer,
                offerCreatorSigner: assistant,
                fullOfferTuple: [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, false],
                offerCreatorAddress: assistant.address,
                committerAddress: buyer.address,
                fullOfferSignature,
                conditionalTokenId: "0",
                offerCreatorAmount: "0",
                committerAmount: (BigInt(price) - 1n).toString(),
              })
            ).to.be.reverted;
          });

          it("Insufficient sellerDeposit", async function () {
            // Seller side queue entry empty → falls back to safeTransferFrom; seller did not approve.
            const modifiedOffer = offer.clone();
            modifiedOffer.royaltyInfo = modifiedOffer.royaltyInfo[0];
            message.offer = modifiedOffer;
            const fullOfferSignature = await signFullOffer(assistant, message);

            await expect(
              createOfferAndCommitWithAuth({
                committerSigner: buyer,
                offerCreatorSigner: assistant,
                fullOfferTuple: [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, false],
                offerCreatorAddress: assistant.address,
                committerAddress: buyer.address,
                fullOfferSignature,
                conditionalTokenId: "0",
                forceFallbackOnOfferCreator: true, // empty entry → safeTransferFrom fallback (no allowance)
                committerAmount: price,
              })
            ).to.be.revertedWith(RevertReasons.ERC20_INSUFFICIENT_ALLOWANCE);
          });

          it("Offer is voided", async function () {
            offer.sellerDeposit = "0";
            await offerHandler
              .connect(assistant)
              .voidNonListedOffer([
                offer,
                offerDates,
                offerDurations,
                drParams,
                condition,
                agentId,
                offerFeeLimit,
                false,
              ]);

            const modifiedOffer = offer.clone();
            modifiedOffer.royaltyInfo = modifiedOffer.royaltyInfo[0];
            message.offer = modifiedOffer;
            const fullOfferSignature = await signFullOffer(assistant, message);

            await expect(
              createOfferAndCommitWithAuth({
                committerSigner: buyer,
                offerCreatorSigner: assistant,
                fullOfferTuple: [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, false],
                offerCreatorAddress: assistant.address,
                committerAddress: buyer.address,
                fullOfferSignature,
                conditionalTokenId: "0",
                offerCreatorAmount: "0",
                committerAmount: price,
              })
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_HAS_BEEN_VOIDED);
          });

          it("Offer is used", async function () {
            offer.sellerDeposit = "0";
            const modifiedOffer = offer.clone();
            modifiedOffer.royaltyInfo = modifiedOffer.royaltyInfo[0];
            message.offer = modifiedOffer;
            const fullOfferSignature = await signFullOffer(assistant, message);

            await createOfferAndCommitWithAuth({
              committerSigner: buyer,
              offerCreatorSigner: assistant,
              fullOfferTuple: [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, false],
              offerCreatorAddress: assistant.address,
              committerAddress: buyer.address,
              fullOfferSignature,
              conditionalTokenId: "0",
              offerCreatorAmount: "0",
              committerAmount: price,
            });

            await expect(
              createOfferAndCommitWithAuth({
                committerSigner: buyer,
                offerCreatorSigner: assistant,
                fullOfferTuple: [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, false],
                offerCreatorAddress: assistant.address,
                committerAddress: buyer.address,
                fullOfferSignature,
                conditionalTokenId: "0",
                offerCreatorAmount: "0",
                committerAmount: price,
              })
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_SOLD_OUT);
          });

          it("Seller id does not belong to the assistant", async function () {
            offer.sellerId = "999";

            await expect(
              createOfferAndCommitWithAuth({
                committerSigner: buyer,
                offerCreatorSigner: assistant,
                fullOfferTuple: [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, false],
                offerCreatorAddress: assistant.address,
                committerAddress: buyer.address,
                fullOfferSignature: ethers.ZeroHash,
                conditionalTokenId: "0",
                offerCreatorAmount: "0",
                committerAmount: price,
              })
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_ASSISTANT);
          });

          it("Buyer provides non-zero seller params", async function () {
            const baseArgs = {
              committerSigner: buyer,
              offerCreatorSigner: assistant,
              fullOfferTuple: [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, false],
              offerCreatorAddress: assistant.address,
              committerAddress: buyer.address,
              fullOfferSignature: ethers.ZeroHash,
              conditionalTokenId: "0",
              offerCreatorAmount: "0",
              committerAmount: price,
            };

            await expect(
              createOfferAndCommitWithAuth({ ...baseArgs, sp: { ...sellerParams, collectionIndex: "1" } })
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.SELLER_PARAMS_NOT_ALLOWED);

            await expect(
              createOfferAndCommitWithAuth({
                ...baseArgs,
                sp: { ...sellerParams, royaltyInfo: { recipients: [ZeroAddress], bps: [] } },
              })
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.SELLER_PARAMS_NOT_ALLOWED);

            await expect(
              createOfferAndCommitWithAuth({
                ...baseArgs,
                sp: { ...sellerParams, royaltyInfo: { recipients: [], bps: ["1234"] } },
              })
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.SELLER_PARAMS_NOT_ALLOWED);

            await expect(
              createOfferAndCommitWithAuth({ ...baseArgs, sp: { ...sellerParams, mutualizerAddress: buyer.address } })
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.SELLER_PARAMS_NOT_ALLOWED);
          });
        });
      });

      context("buyer offer", async function () {
        beforeEach(async function () {
          offer.sellerId = "0";
          offer.creator = OfferCreator.Buyer;
          offer.buyerId = buyerId.toString();
          offer.royaltyInfo = [new RoyaltyInfo([], [])];

          await accountHandler.connect(buyer).createBuyer(mockBuyer(buyer.address));
        });

        afterEach(async function () {
          accountId.next(true);
        });

        it("zero price and erc20 token", async function () {
          offer.price = "0";
          offer.buyerCancelPenalty = "0";
          offerFees.protocolFee = "0";

          const modifiedOffer = offer.clone();
          modifiedOffer.royaltyInfo = modifiedOffer.royaltyInfo[0];
          message.offer = modifiedOffer;

          const fullOfferSignature = await signFullOffer(buyer, message);

          tx = await createOfferAndCommitWithAuth({
            committerSigner: assistant,
            offerCreatorSigner: buyer,
            fullOfferTuple: [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, false],
            offerCreatorAddress: buyer.address,
            committerAddress: assistant.address,
            fullOfferSignature,
            conditionalTokenId: "0",
            offerCreatorAmount: "0", // price=0
            committerAmount: offer.sellerDeposit,
          });

          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          voucher.committedDate = block.timestamp.toString();
          voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

          await expect(tx)
            .to.emit(exchangeHandler, "SellerCommitted")
            .withArgs(offerId, seller.id, exchangeId, exchange.toStruct(), voucher.toStruct(), assistant.address);

          offer.id = offerId;
          await expect(tx)
            .to.emit(offerHandler, "OfferCreated")
            .withArgs(
              offerId,
              offer.sellerId,
              offer.toStruct(),
              offerDates.toStruct(),
              offerDurations.toStruct(),
              disputeResolutionTerms.toStruct(),
              offerFees.toStruct(),
              agentId,
              assistant.address
            );

          await expect(tx)
            .to.emit(fundsHandler, "FundsDeposited")
            .withArgs(seller.id, assistant.address, offer.exchangeToken, offer.sellerDeposit);
          await expect(tx)
            .to.emit(fundsHandler, "FundsEncumbered")
            .withArgs(seller.id, offer.exchangeToken, offer.sellerDeposit, assistant.address);

          await expect(tx).to.not.emit(exchangeHandler, "ConditionalCommitAuthorized");
          await expect(tx).to.not.emit(groupHandler, "GroupCreated");
        });

        it("non zero price and erc20 token", async function () {
          const modifiedOffer = offer.clone();
          modifiedOffer.royaltyInfo = modifiedOffer.royaltyInfo[0];
          message.offer = modifiedOffer;

          const fullOfferSignature = await signFullOffer(buyer, message);

          tx = await createOfferAndCommitWithAuth({
            committerSigner: assistant,
            offerCreatorSigner: buyer,
            fullOfferTuple: [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, false],
            offerCreatorAddress: buyer.address,
            committerAddress: assistant.address,
            fullOfferSignature,
            conditionalTokenId: "0",
            offerCreatorAmount: price,
            committerAmount: offer.sellerDeposit,
          });

          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          voucher.committedDate = block.timestamp.toString();
          voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

          await expect(tx)
            .to.emit(exchangeHandler, "SellerCommitted")
            .withArgs(offerId, seller.id, exchangeId, exchange.toStruct(), voucher.toStruct(), assistant.address);

          await expect(tx)
            .to.emit(fundsHandler, "FundsDeposited")
            .withArgs(buyerId, buyer.address, offer.exchangeToken, offer.price);
          await expect(tx)
            .to.emit(fundsHandler, "FundsEncumbered")
            .withArgs(buyerId, offer.exchangeToken, price, assistant.address);
          await expect(tx)
            .to.emit(fundsHandler, "FundsEncumbered")
            .withArgs(seller.id, offer.exchangeToken, offer.sellerDeposit, assistant.address);

          await expect(tx).to.not.emit(exchangeHandler, "ConditionalCommitAuthorized");
          await expect(tx).to.not.emit(groupHandler, "GroupCreated");
        });

        it("use offer creator's deposited funds", async function () {
          // Buyer pre-deposits the price into protocol so the commit doesn't pull from them at runtime.
          await foreign20.connect(buyer).approve(protocolDiamondAddress, offer.price);
          await fundsHandler.connect(buyer).depositFunds(buyerId, await foreign20.getAddress(), offer.price);

          const modifiedOffer = offer.clone();
          modifiedOffer.royaltyInfo = modifiedOffer.royaltyInfo[0];
          message.offer = modifiedOffer;
          message.useDepositedFunds = true;

          const fullOfferSignature = await signFullOffer(buyer, message);

          tx = await createOfferAndCommitWithAuth({
            committerSigner: assistant,
            offerCreatorSigner: buyer,
            fullOfferTuple: [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, true],
            offerCreatorAddress: buyer.address,
            committerAddress: assistant.address,
            fullOfferSignature,
            conditionalTokenId: "0",
            offerCreatorAmount: "0", // pre-deposited
            committerAmount: offer.sellerDeposit,
          });

          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          voucher.committedDate = block.timestamp.toString();
          voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

          await expect(tx)
            .to.emit(exchangeHandler, "SellerCommitted")
            .withArgs(offerId, seller.id, exchangeId, exchange.toStruct(), voucher.toStruct(), assistant.address);

          await expect(tx)
            .to.emit(fundsHandler, "FundsEncumbered")
            .withArgs(buyerId, offer.exchangeToken, price, assistant.address);
          await expect(tx)
            .to.emit(fundsHandler, "FundsDeposited")
            .withArgs(seller.id, assistant.address, offer.exchangeToken, offer.sellerDeposit);
          await expect(tx)
            .to.emit(fundsHandler, "FundsEncumbered")
            .withArgs(seller.id, offer.exchangeToken, offer.sellerDeposit, assistant.address);

          await expect(tx).to.not.emit(exchangeHandler, "ConditionalCommitAuthorized");
          await expect(tx).to.not.emit(groupHandler, "GroupCreated");
        });

        it("conditional offer", async function () {
          offer.price = "0";
          offer.buyerCancelPenalty = "0";
          offerFees.protocolFee = "0";

          const modifiedOffer = offer.clone();
          modifiedOffer.royaltyInfo = modifiedOffer.royaltyInfo[0];
          message.offer = modifiedOffer;

          const conditionalTokenId = "12";
          condition = mockCondition({
            tokenAddress: await foreign721.getAddress(),
            threshold: "0",
            maxCommits: "3",
            tokenType: TokenType.NonFungibleToken,
            minTokenId: conditionalTokenId,
            method: EvaluationMethod.SpecificToken,
            maxTokenId: "22",
            gating: GatingType.PerAddress,
          });
          message.condition = condition;

          await foreign721.connect(buyer).mint(conditionalTokenId, "1");

          const fullOfferSignature = await signFullOffer(buyer, message);

          tx = await createOfferAndCommitWithAuth({
            committerSigner: assistant,
            offerCreatorSigner: buyer,
            fullOfferTuple: [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, false],
            offerCreatorAddress: buyer.address,
            committerAddress: assistant.address,
            fullOfferSignature,
            conditionalTokenId,
            offerCreatorAmount: "0", // price=0
            committerAmount: offer.sellerDeposit,
          });

          await expect(tx).to.emit(exchangeHandler, "SellerCommitted");
          await expect(tx).to.emit(offerHandler, "OfferCreated");
          await expect(tx).to.emit(groupHandler, "GroupCreated");
          await expect(tx)
            .to.emit(exchangeHandler, "ConditionalCommitAuthorized")
            .withArgs(offerId, condition.gating, buyer.address, conditionalTokenId, 1, condition.maxCommits);
        });

        context("💔 Revert Reasons", async function () {
          it("Insufficient payment", async function () {
            offer.price = "0";
            offer.buyerCancelPenalty = "0";
            offerFees.protocolFee = "0";
            const modifiedOffer = offer.clone();
            modifiedOffer.royaltyInfo = modifiedOffer.royaltyInfo[0];
            message.offer = modifiedOffer;
            const fullOfferSignature = await signFullOffer(buyer, message);

            await expect(
              createOfferAndCommitWithAuth({
                committerSigner: assistant,
                offerCreatorSigner: buyer,
                fullOfferTuple: [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, false],
                offerCreatorAddress: buyer.address,
                committerAddress: assistant.address,
                fullOfferSignature,
                conditionalTokenId: "0",
                offerCreatorAmount: "0",
                committerAmount: (BigInt(offer.sellerDeposit) - 1n).toString(),
              })
            ).to.be.reverted;
          });

          it("Insufficient price", async function () {
            // Buyer (offer creator) does not auth → falls back to safeTransferFrom; no allowance.
            const modifiedOffer = offer.clone();
            modifiedOffer.royaltyInfo = modifiedOffer.royaltyInfo[0];
            message.offer = modifiedOffer;
            const fullOfferSignature = await signFullOffer(buyer, message);

            await expect(
              createOfferAndCommitWithAuth({
                committerSigner: assistant,
                offerCreatorSigner: buyer,
                fullOfferTuple: [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, false],
                offerCreatorAddress: buyer.address,
                committerAddress: assistant.address,
                fullOfferSignature,
                conditionalTokenId: "0",
                forceFallbackOnOfferCreator: true, // empty queue entry → fallback path reverts
                committerAmount: offer.sellerDeposit,
              })
            ).to.be.revertedWith(RevertReasons.ERC20_INSUFFICIENT_ALLOWANCE);
          });

          it("Offer is voided", async function () {
            offer.price = "0";
            offer.buyerCancelPenalty = "0";
            offerFees.protocolFee = "0";

            await offerHandler
              .connect(buyer)
              .voidNonListedOffer([
                offer,
                offerDates,
                offerDurations,
                drParams,
                condition,
                agentId,
                offerFeeLimit,
                false,
              ]);

            const modifiedOffer = offer.clone();
            modifiedOffer.royaltyInfo = modifiedOffer.royaltyInfo[0];
            message.offer = modifiedOffer;
            const fullOfferSignature = await signFullOffer(buyer, message);

            await expect(
              createOfferAndCommitWithAuth({
                committerSigner: assistant,
                offerCreatorSigner: buyer,
                fullOfferTuple: [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, false],
                offerCreatorAddress: buyer.address,
                committerAddress: assistant.address,
                fullOfferSignature,
                conditionalTokenId: "0",
                offerCreatorAmount: "0",
                committerAmount: offer.sellerDeposit,
              })
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_HAS_BEEN_VOIDED);
          });

          it("Offer is used", async function () {
            offer.price = "0";
            offer.buyerCancelPenalty = "0";
            offerFees.protocolFee = "0";
            const modifiedOffer = offer.clone();
            modifiedOffer.royaltyInfo = modifiedOffer.royaltyInfo[0];
            message.offer = modifiedOffer;
            const fullOfferSignature = await signFullOffer(buyer, message);

            await createOfferAndCommitWithAuth({
              committerSigner: assistant,
              offerCreatorSigner: buyer,
              fullOfferTuple: [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, false],
              offerCreatorAddress: buyer.address,
              committerAddress: assistant.address,
              fullOfferSignature,
              conditionalTokenId: "0",
              offerCreatorAmount: "0",
              committerAmount: offer.sellerDeposit,
            });

            await expect(
              createOfferAndCommitWithAuth({
                committerSigner: assistant,
                offerCreatorSigner: buyer,
                fullOfferTuple: [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, false],
                offerCreatorAddress: buyer.address,
                committerAddress: assistant.address,
                fullOfferSignature,
                conditionalTokenId: "0",
                offerCreatorAmount: "0",
                committerAmount: offer.sellerDeposit,
              })
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_SOLD_OUT);
          });

          it("Buyer id does not belong to the assistant", async function () {
            offer.buyerId = "123";

            await expect(
              createOfferAndCommitWithAuth({
                committerSigner: assistant,
                offerCreatorSigner: buyer,
                fullOfferTuple: [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, false],
                offerCreatorAddress: buyer.address,
                committerAddress: assistant.address,
                fullOfferSignature: ethers.ZeroHash,
                conditionalTokenId: "0",
                offerCreatorAmount: "0",
                committerAmount: offer.sellerDeposit,
              })
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_BUYER_WALLET);
          });

          it("Mutualizer is EOA", async function () {
            offer.price = "0";
            offer.buyerCancelPenalty = "0";
            offerFees.protocolFee = "0";

            const modifiedOffer = offer.clone();
            modifiedOffer.royaltyInfo = modifiedOffer.royaltyInfo[0];
            message.offer = modifiedOffer;
            const fullOfferSignature = await signFullOffer(buyer, message);

            await expect(
              createOfferAndCommitWithAuth({
                committerSigner: assistant,
                offerCreatorSigner: buyer,
                fullOfferTuple: [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, false],
                offerCreatorAddress: buyer.address,
                committerAddress: assistant.address,
                fullOfferSignature,
                conditionalTokenId: "0",
                sp: { ...sellerParams, mutualizerAddress: buyer.address },
                offerCreatorAmount: "0",
                committerAmount: offer.sellerDeposit,
              })
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.UNSUPPORTED_MUTUALIZER);
          });

          it("Mutualizer does not support IDRFeeMutualizer interface", async function () {
            offer.price = "0";
            offer.buyerCancelPenalty = "0";
            offerFees.protocolFee = "0";

            const modifiedOffer = offer.clone();
            modifiedOffer.royaltyInfo = modifiedOffer.royaltyInfo[0];
            message.offer = modifiedOffer;
            const fullOfferSignature = await signFullOffer(buyer, message);

            await expect(
              createOfferAndCommitWithAuth({
                committerSigner: assistant,
                offerCreatorSigner: buyer,
                fullOfferTuple: [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, false],
                offerCreatorAddress: buyer.address,
                committerAddress: assistant.address,
                fullOfferSignature,
                conditionalTokenId: "0",
                sp: { ...sellerParams, mutualizerAddress: await foreign20.getAddress() },
                offerCreatorAmount: "0",
                committerAmount: offer.sellerDeposit,
              })
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.UNSUPPORTED_MUTUALIZER);
          });
        });
      });

      context("💔 Revert Reasons", async function () {
        const fullOfferSignature = ethers.ZeroHash;

        it("The exchanges region of protocol is paused", async function () {
          await pauseHandler.connect(pauser).pause([PausableRegion.Exchanges]);

          await expect(
            createOfferAndCommitWithAuth({
              committerSigner: buyer,
              offerCreatorSigner: assistant,
              fullOfferTuple: [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, false],
              offerCreatorAddress: assistant.address,
              committerAddress: buyer.address,
              fullOfferSignature,
              conditionalTokenId: "0",
              offerCreatorAmount: "0",
              committerAmount: price,
            })
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Exchanges);
        });

        it("The buyers region of protocol is paused", async function () {
          await pauseHandler.connect(pauser).pause([PausableRegion.Buyers]);

          await expect(
            createOfferAndCommitWithAuth({
              committerSigner: buyer,
              offerCreatorSigner: assistant,
              fullOfferTuple: [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, false],
              offerCreatorAddress: assistant.address,
              committerAddress: buyer.address,
              fullOfferSignature,
              conditionalTokenId: "0",
              offerCreatorAmount: "0",
              committerAmount: price,
            })
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Buyers);
        });

        it("The sellers region of protocol is paused", async function () {
          await pauseHandler.connect(pauser).pause([PausableRegion.Sellers]);

          await expect(
            createOfferAndCommitWithAuth({
              committerSigner: buyer,
              offerCreatorSigner: assistant,
              fullOfferTuple: [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, false],
              offerCreatorAddress: assistant.address,
              committerAddress: buyer.address,
              fullOfferSignature,
              conditionalTokenId: "0",
              offerCreatorAmount: "0",
              committerAmount: price,
            })
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Sellers);
        });

        it("Offer id is not 0", async function () {
          offer.id = "2";

          await expect(
            createOfferAndCommitWithAuth({
              committerSigner: buyer,
              offerCreatorSigner: assistant,
              fullOfferTuple: [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, false],
              offerCreatorAddress: assistant.address,
              committerAddress: buyer.address,
              fullOfferSignature,
              conditionalTokenId: "0",
              offerCreatorAmount: "0",
              committerAmount: price,
            })
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_OFFER);
        });

        it("Invalid royalty info", async function () {
          offer.royaltyInfo.push(new RoyaltyInfo([ZeroAddress], [voucherInitValues.royaltyPercentage]));

          await expect(
            createOfferAndCommitWithAuth({
              committerSigner: buyer,
              offerCreatorSigner: assistant,
              fullOfferTuple: [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, false],
              offerCreatorAddress: assistant.address,
              committerAddress: buyer.address,
              fullOfferSignature,
              conditionalTokenId: "0",
              offerCreatorAmount: "0",
              committerAmount: price,
            })
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_OFFER);

          offer.royaltyInfo = [];
          await expect(
            createOfferAndCommitWithAuth({
              committerSigner: buyer,
              offerCreatorSigner: assistant,
              fullOfferTuple: [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, false],
              offerCreatorAddress: assistant.address,
              committerAddress: buyer.address,
              fullOfferSignature,
              conditionalTokenId: "0",
              offerCreatorAmount: "0",
              committerAmount: price,
            })
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_OFFER);
        });

        it("Wrong price type", async function () {
          offer.priceType = PriceType.Discovery;

          await expect(
            createOfferAndCommitWithAuth({
              committerSigner: buyer,
              offerCreatorSigner: assistant,
              fullOfferTuple: [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, false],
              offerCreatorAddress: assistant.address,
              committerAddress: buyer.address,
              fullOfferSignature,
              conditionalTokenId: "0",
              offerCreatorAmount: "0",
              committerAmount: price,
            })
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_OFFER);
        });
      });
    });
  });
});
