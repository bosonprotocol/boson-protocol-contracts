const { ethers } = require("hardhat");
const { ZeroAddress, getContractAt, MaxUint256, parseUnits } = ethers;
const { assert, expect } = require("chai");

const ExchangeState = require("../../scripts/domain/ExchangeState");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const Group = require("../../scripts/domain/Group");
const Condition = require("../../scripts/domain/Condition");
const EvaluationMethod = require("../../scripts/domain/EvaluationMethod");
const TokenType = require("../../scripts/domain/TokenType");
const GatingType = require("../../scripts/domain/GatingType");
const OfferCreator = require("../../scripts/domain/OfferCreator");
const { RoyaltyInfo } = require("../../scripts/domain/RoyaltyInfo");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const {
  setupTestEnvironment,
  getSnapshot,
  revertToSnapshot,
  prepareDataSignature,
  calculateCloneAddress,
  calculateBosonProxyAddress,
} = require("../util/utils.js");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const {
  mockOffer,
  mockDisputeResolver,
  mockSeller,
  mockVoucherInitValues,
  mockAuthToken,
  mockCondition,
  accountId,
} = require("../util/mock");

/**
 * Tests for the atomic commit-and-redeem orchestration methods on
 * OrchestrationHandlerFacet2:
 *   - commitToOfferAndRedeemVoucher(uint256)
 *   - commitToConditionalOfferAndRedeemVoucher(uint256, uint256)
 *   - createOfferCommitAndRedeem(FullOffer, address, bytes, uint256)
 *
 * These methods perform `commitToOffer*` immediately followed by `redeemVoucher`
 * in a single transaction, hardcoding the buyer to `_msgSender()` so the redeem
 * step can pass its `checkBuyer` equivalent.
 */
describe("IBosonOrchestrationHandler — commit and redeem", function () {
  let deployer, pauser, admin, treasury, buyer, adminDR, treasuryDR;
  let assistant, assistantDR;
  let accountHandler,
    offerHandler,
    exchangeHandler,
    exchangeCommitHandler,
    groupHandler,
    fundsHandler,
    orchestrationHandler,
    pauseHandler;
  let configHandler;
  let bosonToken;
  let bosonErrors;
  let protocolDiamondAddress;
  let beaconProxyAddress;
  let snapshotId;

  let seller, disputeResolver, disputeResolverId;
  let DRFeeNative;
  let voucherInitValues, emptyAuthToken;
  let offer, offerDates, offerDurations;
  let agentId, offerFeeLimit;

  before(async function () {
    accountId.next(true);

    [bosonToken] = await deployMockTokens();

    const contracts = {
      accountHandler: "IBosonAccountHandler",
      groupHandler: "IBosonGroupHandler",
      offerHandler: "IBosonOfferHandler",
      exchangeHandler: "IBosonExchangeHandler",
      exchangeCommitHandler: "IBosonExchangeCommitHandler",
      fundsHandler: "IBosonFundsHandler",
      orchestrationHandler: "IBosonOrchestrationHandler",
      pauseHandler: "IBosonPauseHandler",
      configHandler: "IBosonConfigHandler",
    };

    ({
      signers: [pauser, admin, treasury, buyer, , adminDR, treasuryDR],
      contractInstances: {
        accountHandler,
        groupHandler,
        offerHandler,
        exchangeHandler,
        exchangeCommitHandler,
        fundsHandler,
        orchestrationHandler,
        pauseHandler,
        configHandler,
      },
      diamondAddress: protocolDiamondAddress,
    } = await setupTestEnvironment(contracts, { bosonTokenAddress: await bosonToken.getAddress() }));

    beaconProxyAddress = await calculateBosonProxyAddress(await configHandler.getAddress());

    bosonErrors = await getContractAt("BosonErrors", protocolDiamondAddress);

    // Same admin/assistant simplification used by OrchestrationHandlerTest.js
    assistant = admin;
    assistantDR = adminDR;

    [deployer] = await ethers.getSigners();

    snapshotId = await getSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();
    accountId.next(true);
  });

  // Common setup: register DR + seller + create offer + deposit seller funds
  beforeEach(async function () {
    // Dispute resolver
    disputeResolver = mockDisputeResolver(
      await assistantDR.getAddress(),
      await adminDR.getAddress(),
      ZeroAddress,
      await treasuryDR.getAddress(),
      true
    );
    disputeResolverId = disputeResolver.id;

    DRFeeNative = parseUnits("0.33", "ether").toString();
    const disputeResolverFees = [new DisputeResolverFee(ZeroAddress, "Native", DRFeeNative)];
    await accountHandler.connect(adminDR).createDisputeResolver(disputeResolver, disputeResolverFees, []);

    // Seller
    seller = mockSeller(
      await assistant.getAddress(),
      await assistant.getAddress(),
      ZeroAddress,
      await treasury.getAddress()
    );
    voucherInitValues = mockVoucherInitValues();
    emptyAuthToken = mockAuthToken();

    // Offer
    ({ offer, offerDates, offerDurations } = await mockOffer());
    offer.sellerId = seller.id;
    // Allow redemption to start immediately
    offerDates.voucherRedeemableFrom = "0";

    agentId = "0";
    offerFeeLimit = MaxUint256;

    // Create seller + offer in one go
    await orchestrationHandler
      .connect(assistant)
      .createSellerAndOffer(
        seller,
        offer,
        offerDates,
        offerDurations,
        { disputeResolverId, mutualizerAddress: ZeroAddress },
        emptyAuthToken,
        voucherInitValues,
        agentId,
        offerFeeLimit
      );

    // Deposit seller funds: sellerDeposit + DR fee per exchange
    const fundsToDeposit = (BigInt(offer.sellerDeposit) + BigInt(DRFeeNative)) * BigInt(offer.quantityAvailable);
    await fundsHandler
      .connect(assistant)
      .depositFunds(seller.id, ZeroAddress, fundsToDeposit, { value: fundsToDeposit });
  });

  context("👉 commitToOfferAndRedeemVoucher()", async function () {
    it("emits BuyerCommitted and VoucherRedeemed; exchange ends in Redeemed state", async function () {
      const offerId = "1";

      const tx = await orchestrationHandler
        .connect(buyer)
        .commitToOfferAndRedeemVoucher(offerId, { value: offer.price });

      await expect(tx).to.emit(exchangeCommitHandler, "BuyerCommitted");
      await expect(tx)
        .to.emit(exchangeHandler, "VoucherRedeemed")
        .withArgs(offerId, "1", await buyer.getAddress());

      const [exists, state] = await exchangeHandler.getExchangeState("1");
      assert.isTrue(exists);
      assert.equal(state, ExchangeState.Redeemed);
    });

    it("reverts when the offer is conditional (use commitToConditionalOfferAndRedeemVoucher instead)", async function () {
      // Create a second offer that is part of a conditional group
      offer.id = "0";
      await offerHandler
        .connect(assistant)
        .createOffer(
          offer,
          offerDates,
          offerDurations,
          { disputeResolverId, mutualizerAddress: ZeroAddress },
          agentId,
          offerFeeLimit
        );
      const conditionalOfferId = "2";

      // Simple threshold condition over an ERC20 token (bosonToken) — buyer has 0, so commit would fail anyway,
      // but we expect to fail earlier with GROUP_HAS_CONDITION.
      const condition = new Condition(
        EvaluationMethod.Threshold,
        TokenType.FungibleToken,
        await bosonToken.getAddress(),
        GatingType.PerAddress,
        "0",
        "100",
        "1",
        "0"
      );
      const group = new Group("1", seller.id, [conditionalOfferId]);
      await groupHandler.connect(assistant).createGroup(group, condition);

      await expect(
        orchestrationHandler.connect(buyer).commitToOfferAndRedeemVoucher(conditionalOfferId, { value: offer.price })
      ).to.revertedWithCustomError(bosonErrors, RevertReasons.GROUP_HAS_CONDITION);
    });

    it("reverts when caller does not send enough native currency", async function () {
      await expect(
        orchestrationHandler.connect(buyer).commitToOfferAndRedeemVoucher("1", { value: 0 })
      ).to.revertedWithCustomError(bosonErrors, RevertReasons.INSUFFICIENT_VALUE_RECEIVED);
    });

    it("reverts with OfferCreatorMustBeSeller when the offer is buyer-created", async function () {
      // Without this guard, a malicious caller could route a buyer-created offer
      // through commitToOfferAndRedeemVoucher: the orchestration skips both the
      // voucher mint and the buyer-ownership check on redeem, so the seller's
      // pre-deposited funds would be encumbered, the (skipped) voucher's twins
      // would land at _msgSender(), and the actual buyer would be left with
      // nothing. The check inside commitToStaticOfferShared blocks this.

      // Register the buyer so they can author a buyer-created offer.
      await accountHandler.connect(buyer).createBuyer({ id: "0", wallet: await buyer.getAddress(), active: true });
      const buyerAccountId = "3"; // DR=1, seller=2, buyer=3

      const buyerOffer = offer.clone();
      buyerOffer.id = "0";
      buyerOffer.sellerId = "0";
      buyerOffer.creator = OfferCreator.Buyer;
      buyerOffer.buyerId = buyerAccountId;
      buyerOffer.collectionIndex = "0";
      buyerOffer.royaltyInfo = [new RoyaltyInfo([], [])];

      await offerHandler
        .connect(buyer)
        .createOffer(
          buyerOffer,
          offerDates,
          offerDurations,
          { disputeResolverId, mutualizerAddress: ZeroAddress },
          agentId,
          offerFeeLimit
        );
      const buyerOfferId = "2";

      await expect(
        orchestrationHandler.connect(buyer).commitToOfferAndRedeemVoucher(buyerOfferId, { value: buyerOffer.price })
      ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_CREATOR_MUST_BE_SELLER);
    });

    it("reverts when the orchestration region is paused", async function () {
      await pauseHandler.connect(pauser).pause([PausableRegion.Orchestration]);

      await expect(orchestrationHandler.connect(buyer).commitToOfferAndRedeemVoucher("1", { value: offer.price }))
        .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
        .withArgs(PausableRegion.Orchestration);
    });

    it("atomic: when redeem step would revert (voucherRedeemableFrom in future), the whole tx reverts and no commit takes effect", async function () {
      // Re-create the offer with redeemable date in the far future
      const futureRedeemableFrom = (
        BigInt((await ethers.provider.getBlock("latest")).timestamp) +
        60n * 60n * 24n * 365n
      ).toString();
      offer.id = "0";
      offerDates.voucherRedeemableFrom = futureRedeemableFrom;
      await offerHandler
        .connect(assistant)
        .createOffer(
          offer,
          offerDates,
          offerDurations,
          { disputeResolverId, mutualizerAddress: ZeroAddress },
          agentId,
          offerFeeLimit
        );

      const futureOfferId = "2";

      const nextExchangeIdBefore = await exchangeHandler.getNextExchangeId();

      await expect(
        orchestrationHandler.connect(buyer).commitToOfferAndRedeemVoucher(futureOfferId, { value: offer.price })
      ).to.revertedWithCustomError(bosonErrors, RevertReasons.VOUCHER_NOT_REDEEMABLE);

      // Counter must not have advanced — the commit was rolled back
      const nextExchangeIdAfter = await exchangeHandler.getNextExchangeId();
      assert.equal(nextExchangeIdAfter.toString(), nextExchangeIdBefore.toString());
    });
  });

  context("👉 commitToConditionalOfferAndRedeemVoucher()", async function () {
    let conditionalOfferId, condition;

    beforeEach(async function () {
      // Create a second offer with an ERC721-ownership condition the buyer satisfies.
      offer.id = "0";
      await offerHandler
        .connect(assistant)
        .createOffer(
          offer,
          offerDates,
          offerDurations,
          { disputeResolverId, mutualizerAddress: ZeroAddress },
          agentId,
          offerFeeLimit
        );
      conditionalOfferId = "2";

      const [foreign721] = await deployMockTokens(["Foreign721"]);
      // Mint a known token id to the buyer
      await foreign721.connect(deployer).mint("42", "1");
      await foreign721.connect(deployer).transferFrom(deployer.address, buyer.address, "42");

      condition = new Condition(
        EvaluationMethod.SpecificToken,
        TokenType.NonFungibleToken,
        await foreign721.getAddress(),
        GatingType.PerTokenId,
        "42",
        "0",
        "1",
        "42"
      );
      const group = new Group("1", seller.id, [conditionalOfferId]);
      await groupHandler.connect(assistant).createGroup(group, condition);
    });

    it("emits ConditionalCommitAuthorized, BuyerCommitted, and VoucherRedeemed; exchange ends in Redeemed", async function () {
      const tx = await orchestrationHandler
        .connect(buyer)
        .commitToConditionalOfferAndRedeemVoucher(conditionalOfferId, "42", { value: offer.price });

      await expect(tx).to.emit(exchangeCommitHandler, "ConditionalCommitAuthorized");
      await expect(tx).to.emit(exchangeCommitHandler, "BuyerCommitted");
      await expect(tx)
        .to.emit(exchangeHandler, "VoucherRedeemed")
        .withArgs(conditionalOfferId, "1", await buyer.getAddress());

      const [exists, state] = await exchangeHandler.getExchangeState("1");
      assert.isTrue(exists);
      assert.equal(state, ExchangeState.Redeemed);
    });

    it("reverts when token id is outside the condition's range", async function () {
      await expect(
        orchestrationHandler
          .connect(buyer)
          .commitToConditionalOfferAndRedeemVoucher(conditionalOfferId, "999", { value: offer.price })
      ).to.revertedWithCustomError(bosonErrors, RevertReasons.TOKEN_ID_NOT_IN_CONDITION_RANGE);
    });

    it("reverts when the offer has no group (no condition)", async function () {
      // Offer #1 is the seller's first offer with no group attached
      await expect(
        orchestrationHandler.connect(buyer).commitToConditionalOfferAndRedeemVoucher("1", "42", { value: offer.price })
      ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_GROUP);
    });
  });

  context("👉 createOfferCommitAndRedeem()", async function () {
    // EIP-712 type definition mirrors the verifyOffer payload in ExchangeCommitBase.sol.
    const eip712TypeDefinition = {
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

    let newOffer, newOfferDates, newOfferDurations, drParams;
    let newCondition;
    let message;

    beforeEach(async function () {
      // Build a fresh offer separate from the offer #1 created in the outer beforeEach.
      ({ offer: newOffer, offerDates: newOfferDates, offerDurations: newOfferDurations, drParams } = await mockOffer());

      // id=0 signals "create me", seller-created with zero seller deposit so the
      // seller pre-funding pull is a no-op (no extra msg.value beyond price needed).
      newOffer.id = "0";
      newOffer.sellerId = seller.id;
      newOffer.sellerDeposit = "0";
      newOfferDates.voucherRedeemableFrom = "0"; // redeem immediately

      // Point at the DR registered in the outer beforeEach (mockOffer's default id is unrelated).
      drParams.disputeResolverId = disputeResolverId;

      // Default to a non-conditional offer; conditional-path test overrides below.
      newCondition = mockCondition({ method: EvaluationMethod.None, threshold: "0", maxCommits: "0" });

      // The signed message uses a single RoyaltyInfo struct; the on-chain call uses the array form.
      const signedOffer = newOffer.clone();
      signedOffer.royaltyInfo = signedOffer.royaltyInfo[0];

      message = {
        offer: signedOffer,
        offerDates: newOfferDates,
        offerDurations: newOfferDurations,
        drParameters: drParams,
        condition: newCondition,
        agentId: agentId.toString(),
        feeLimit: offerFeeLimit.toString(),
        useDepositedFunds: false,
      };
    });

    it("happy path: emits OfferCreated, BuyerCommitted, and VoucherRedeemed; exchange ends in Redeemed", async function () {
      const signature = await prepareDataSignature(
        assistant,
        eip712TypeDefinition,
        "FullOffer",
        message,
        await orchestrationHandler.getAddress()
      );

      const tx = await orchestrationHandler
        .connect(buyer)
        .createOfferCommitAndRedeem(
          [newOffer, newOfferDates, newOfferDurations, drParams, newCondition, agentId, offerFeeLimit, false],
          assistant.address,
          signature,
          "0",
          { value: newOffer.price }
        );

      // New offer is offerId=2 (offer #1 was created in the outer beforeEach), exchangeId=1
      // (no commits have happened in this test before now).
      await expect(tx).to.emit(offerHandler, "OfferCreated");
      await expect(tx).to.emit(exchangeCommitHandler, "BuyerCommitted");
      await expect(tx)
        .to.emit(exchangeHandler, "VoucherRedeemed")
        .withArgs("2", "1", await buyer.getAddress());

      // Unconditional offer should not emit a ConditionalCommitAuthorized event
      await expect(tx).to.not.emit(exchangeCommitHandler, "ConditionalCommitAuthorized");

      const [exists, state] = await exchangeHandler.getExchangeState("1");
      assert.isTrue(exists);
      assert.equal(state, ExchangeState.Redeemed);
    });

    it("reverts with OfferCreatorMustBeSeller when offer.creator is Buyer", async function () {
      newOffer.creator = OfferCreator.Buyer;
      newOffer.buyerId = "1"; // any non-zero id passes initial validation; the orchestration rejects up-front
      const signedOffer = newOffer.clone();
      signedOffer.royaltyInfo = signedOffer.royaltyInfo[0];
      message.offer = signedOffer;

      // The signature path is irrelevant — the orchestration rejects buyer-created offers
      // before reaching verifyOffer. We still produce one to keep the call shape valid.
      const signature = await prepareDataSignature(
        assistant,
        eip712TypeDefinition,
        "FullOffer",
        message,
        await orchestrationHandler.getAddress()
      );

      await expect(
        orchestrationHandler
          .connect(buyer)
          .createOfferCommitAndRedeem(
            [newOffer, newOfferDates, newOfferDurations, drParams, newCondition, agentId, offerFeeLimit, false],
            assistant.address,
            signature,
            "0",
            { value: newOffer.price }
          )
      ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_CREATOR_MUST_BE_SELLER);
    });

    it("conditional offer: emits ConditionalCommitAuthorized in addition to OfferCreated, BuyerCommitted, and VoucherRedeemed", async function () {
      // SpecificToken condition: the buyer must own a specific NFT token id.
      const [foreign721] = await deployMockTokens(["Foreign721"]);
      const conditionalTokenId = "12";
      await foreign721.connect(deployer).mint(conditionalTokenId, "1");
      await foreign721.connect(deployer).transferFrom(deployer.address, buyer.address, conditionalTokenId);

      newCondition = mockCondition({
        method: EvaluationMethod.SpecificToken,
        tokenType: TokenType.NonFungibleToken,
        tokenAddress: await foreign721.getAddress(),
        gating: GatingType.PerTokenId,
        minTokenId: conditionalTokenId,
        threshold: "0",
        maxCommits: "1",
        maxTokenId: "22",
      });
      message.condition = newCondition;

      const signature = await prepareDataSignature(
        assistant,
        eip712TypeDefinition,
        "FullOffer",
        message,
        await orchestrationHandler.getAddress()
      );

      const tx = await orchestrationHandler
        .connect(buyer)
        .createOfferCommitAndRedeem(
          [newOffer, newOfferDates, newOfferDurations, drParams, newCondition, agentId, offerFeeLimit, false],
          assistant.address,
          signature,
          conditionalTokenId,
          { value: newOffer.price }
        );

      await expect(tx).to.emit(offerHandler, "OfferCreated");
      await expect(tx).to.emit(exchangeCommitHandler, "ConditionalCommitAuthorized");
      await expect(tx).to.emit(exchangeCommitHandler, "BuyerCommitted");
      await expect(tx).to.emit(exchangeHandler, "VoucherRedeemed");

      const [exists, state] = await exchangeHandler.getExchangeState("1");
      assert.isTrue(exists);
      assert.equal(state, ExchangeState.Redeemed);
    });
  });

  context("👉 redeem step transfers bundled twins", async function () {
    it("transfers an ERC721 twin to the committer atomically", async function () {
      // Use the orchestration's `commitToOfferAndRedeemVoucher` against an offer
      // that has a bundled ERC721 twin so we exercise transferTwins via the new path.

      const [foreign721] = await deployMockTokens(["Foreign721"]);
      await foreign721.connect(assistant).mint("1000", "1");
      await foreign721.connect(assistant).setApprovalForAll(protocolDiamondAddress, true);

      // Twin: ERC721 with supply 1
      const twin = {
        id: "1",
        sellerId: seller.id,
        amount: "0",
        tokenId: "1000",
        supplyAvailable: "1",
        tokenAddress: await foreign721.getAddress(),
        tokenType: TokenType.NonFungibleToken,
      };

      const twinHandlerIface = await getContractAt("IBosonTwinHandler", protocolDiamondAddress);
      await twinHandlerIface.connect(assistant).createTwin(twin);

      // Bundle the twin with offer #1
      const bundleHandlerIface = await getContractAt("IBosonBundleHandler", protocolDiamondAddress);
      await bundleHandlerIface.connect(assistant).createBundle({
        id: "1",
        sellerId: seller.id,
        offerIds: ["1"],
        twinIds: ["1"],
      });

      const tx = await orchestrationHandler.connect(buyer).commitToOfferAndRedeemVoucher("1", { value: offer.price });

      await expect(tx).to.emit(exchangeHandler, "VoucherRedeemed");

      // Buyer should now own the twin token
      assert.equal(await foreign721.ownerOf("1000"), buyer.address);
    });
  });

  context("👉 voucher NFT lifecycle is skipped", async function () {
    // The orchestration would mint the voucher to the buyer and burn it again
    // in the same transaction, so {commitToOfferInternal} and
    // {ExchangeRedeemBase.redeemVoucherInternal} skip both the
    // bosonVoucher.issueVoucher() / burnVoucher() calls and the matching
    // voucherCount[buyerId] inc/dec writes. Verify all of these from the outside.
    let bosonVoucherClone;

    beforeEach(async function () {
      const expectedCloneAddress = calculateCloneAddress(
        await accountHandler.getAddress(),
        beaconProxyAddress,
        admin.address
      );
      bosonVoucherClone = await getContractAt("IBosonVoucher", expectedCloneAddress);
    });

    it("commitToOfferAndRedeemVoucher does NOT emit any ERC721 Transfer events", async function () {
      const tx = await orchestrationHandler.connect(buyer).commitToOfferAndRedeemVoucher("1", { value: offer.price });

      await expect(tx).to.not.emit(bosonVoucherClone, "Transfer");
      // Token id was never minted — ownerOf reverts.
      const tokenId = (1n << 128n) | 1n; // offerId=1, exchangeId=1
      await expect(bosonVoucherClone.ownerOf(tokenId)).to.be.reverted;
    });

    it("commitToConditionalOfferAndRedeemVoucher does NOT emit any ERC721 Transfer events", async function () {
      // Set up a conditional offer (#2) with a SpecificToken condition the buyer satisfies.
      offer.id = "0";
      await offerHandler
        .connect(assistant)
        .createOffer(
          offer,
          offerDates,
          offerDurations,
          { disputeResolverId, mutualizerAddress: ZeroAddress },
          agentId,
          offerFeeLimit
        );
      const conditionalOfferId = "2";

      const [foreign721] = await deployMockTokens(["Foreign721"]);
      await foreign721.connect(deployer).mint("42", "1");
      await foreign721.connect(deployer).transferFrom(deployer.address, buyer.address, "42");

      const condition = new Condition(
        EvaluationMethod.SpecificToken,
        TokenType.NonFungibleToken,
        await foreign721.getAddress(),
        GatingType.PerTokenId,
        "42",
        "0",
        "1",
        "42"
      );
      const group = new Group("1", seller.id, [conditionalOfferId]);
      await groupHandler.connect(assistant).createGroup(group, condition);

      const tx = await orchestrationHandler
        .connect(buyer)
        .commitToConditionalOfferAndRedeemVoucher(conditionalOfferId, "42", { value: offer.price });

      await expect(tx).to.not.emit(bosonVoucherClone, "Transfer");
      const tokenId = (BigInt(conditionalOfferId) << 128n) | 1n;
      await expect(bosonVoucherClone.ownerOf(tokenId)).to.be.reverted;
    });

    it("voucherCount stays consistent — the buyer can update their wallet right after the orchestration", async function () {
      // If voucherCount[buyerId] were left non-zero, updateBuyer would revert with
      // WalletOwnsVouchers. The orchestration skips both the inc and the dec, so the
      // counter is back to 0 afterwards and updateBuyer should succeed.
      await orchestrationHandler.connect(buyer).commitToOfferAndRedeemVoucher("1", { value: offer.price });

      // Read the buyer id from the exchange we just redeemed.
      const [, exchangeStruct] = await exchangeHandler.getExchange("1");
      const buyerId = exchangeStruct.buyerId;
      const newWallet = pauser; // any unused signer
      const updated = { id: buyerId, wallet: await newWallet.getAddress(), active: true };

      await expect(accountHandler.connect(buyer).updateBuyer(updated)).to.not.be.reverted;
    });
  });
});
