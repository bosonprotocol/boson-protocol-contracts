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
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { setupTestEnvironment, getSnapshot, revertToSnapshot } = require("../util/utils.js");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const {
  mockOffer,
  mockDisputeResolver,
  mockSeller,
  mockVoucherInitValues,
  mockAuthToken,
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
  let bosonToken;
  let bosonErrors;
  let protocolDiamondAddress;
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
      },
      diamondAddress: protocolDiamondAddress,
    } = await setupTestEnvironment(contracts, { bosonTokenAddress: await bosonToken.getAddress() }));

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
});
