const { ethers } = require("hardhat");
const { ZeroAddress, MaxUint256 } = ethers;
const { expect } = require("chai");

const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const {
  setNextBlockTimestamp,
  applyPercentage,
  setupTestEnvironment,
  getSnapshot,
  revertToSnapshot,
} = require("../util/utils.js");
const {
  mockOffer,
  mockDisputeResolver,
  mockSeller,
  mockAuthToken,
  mockVoucherInitValues,
  accountId,
} = require("../util/mock");

/**
 *  Integration test case - the disputes can be resolved even when approved sellers are removed from the allow list
 */
describe("[@skip-on-coverage] DR removes sellers from the approved seller list", function () {
  // Common vars
  let assistant, admin, clerk, treasury, buyer, other1, assistantDR, adminDR, clerkDR, treasuryDR;
  let accountHandler, exchangeHandler, offerHandler, fundsHandler, disputeHandler;
  let offer, seller;
  let offerDates, offerDurations;
  let buyerEscalationDepositPercentage;
  let exchangeId;
  let disputeResolver, disputeResolverId;
  let buyerPercentBasisPoints;
  let buyerEscalationDepositNative;
  let emptyAuthToken;
  let snapshotId;

  before(async function () {
    accountId.next(true);

    // Specify contracts needed for this test
    const contracts = {
      accountHandler: "IBosonAccountHandler",
      offerHandler: "IBosonOfferHandler",
      exchangeHandler: "IBosonExchangeHandler",
      fundsHandler: "IBosonFundsHandler",
      disputeHandler: "IBosonDisputeHandler",
    };

    ({
      signers: [admin, treasury, buyer, other1, adminDR, treasuryDR],
      contractInstances: { accountHandler, offerHandler, exchangeHandler, fundsHandler, disputeHandler },
      protocolConfig: [, , , ,buyerEscalationDepositPercentage],
    } = await setupTestEnvironment(contracts));

    // make all account the same
    assistant = admin;
    assistantDR = adminDR;
    clerk = clerkDR = { address: ZeroAddress };

    // Get snapshot id
    snapshotId = await getSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();
  });

  context("📋 Dispute Handler Methods", async function () {
    beforeEach(async function () {
      // Initial ids for all the things
      const offerId = "1";
      const agentId = "0"; // agent id is optional while creating an offer
      const offerFeeLimit = MaxUint256;

      // Create a valid seller
      seller = mockSeller(
        await assistant.getAddress(),
        await admin.getAddress(),
        clerk.address,
        await treasury.getAddress()
      );
      expect(seller.isValid()).is.true;

      const seller2 = mockSeller(
        await other1.getAddress(),
        await other1.getAddress(),
        ZeroAddress,
        await other1.getAddress()
      );
      expect(seller2.isValid()).is.true;

      // VoucherInitValues
      const voucherInitValues = mockVoucherInitValues();
      expect(voucherInitValues.isValid()).is.true;

      // AuthToken
      emptyAuthToken = mockAuthToken();
      expect(emptyAuthToken.isValid()).is.true;

      // Create seller with id 1
      await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

      // Create seller with id 2
      await accountHandler.connect(other1).createSeller(seller2, emptyAuthToken, voucherInitValues);

      // Create a valid dispute resolver
      disputeResolver = mockDisputeResolver(
        await assistantDR.getAddress(),
        await adminDR.getAddress(),
        clerkDR.address,
        await treasuryDR.getAddress(),
        true
      );
      expect(disputeResolver.isValid()).is.true;

      // Create DisputeResolverFee array so offer creation will succeed
      const DRFeeNative = "0";
      const disputeResolverFees = [new DisputeResolverFee(ZeroAddress, "Native", DRFeeNative)];

      // Make a sellerAllowList
      const sellerAllowList = ["2", "1"];

      // Register the dispute resolver
      await accountHandler
        .connect(adminDR)
        .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

      // Buyer escalation deposit used in multiple tests
      buyerEscalationDepositNative = applyPercentage(DRFeeNative, buyerEscalationDepositPercentage);

      // Mock offer
      ({ offer, offerDates, offerDurations, disputeResolverId } = await mockOffer());
      offer.quantityAvailable = "5";

      // Check if domains are valid
      expect(offer.isValid()).is.true;
      expect(offerDates.isValid()).is.true;
      expect(offerDurations.isValid()).is.true;

      // Create the offer
      disputeResolverId = disputeResolver.id;
      await offerHandler
        .connect(assistant)
        .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId, offerFeeLimit);

      // Set used variables
      const price = offer.price;
      const quantityAvailable = offer.quantityAvailable;
      const sellerDeposit = offer.sellerDeposit;
      const voucherRedeemableFrom = offerDates.voucherRedeemableFrom;

      // Deposit seller funds so the commit will succeed
      const fundsToDeposit = BigInt(sellerDeposit) * BigInt(quantityAvailable);
      await fundsHandler
        .connect(assistant)
        .depositFunds(seller.id, ZeroAddress, fundsToDeposit, { value: fundsToDeposit });

      // Set time forward to the offer's voucherRedeemableFrom
      await setNextBlockTimestamp(Number(voucherRedeemableFrom));

      for (exchangeId = 1; exchangeId <= 3; exchangeId++) {
        // Commit to offer, creating a new exchange
        await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

        // Redeem voucher
        await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);
      }
    });

    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    context("👉 decideDispute()", async function () {
      beforeEach(async function () {
        for (exchangeId = 1; exchangeId <= 3; exchangeId++) {
          // Raise a dispute
          await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Escalate the dispute
          await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });
        }

        // buyer percent used in tests
        buyerPercentBasisPoints = "4321";
      });

      it("should decide dispute even when DR removes approved sellers", async function () {
        exchangeId = 1;
        // Decide the dispute
        await expect(disputeHandler.connect(assistantDR).decideDispute(exchangeId, buyerPercentBasisPoints))
          .to.emit(disputeHandler, "DisputeDecided")
          .withArgs(exchangeId, buyerPercentBasisPoints, await assistantDR.getAddress());

        // Remove an approved seller
        let allowedSellersToRemove = ["1"];
        exchangeId = 2;

        await expect(
          accountHandler.connect(adminDR).removeSellersFromAllowList(disputeResolverId, allowedSellersToRemove)
        )
          .to.emit(accountHandler, "AllowedSellersRemoved")
          .withArgs(disputeResolverId, allowedSellersToRemove, await adminDR.getAddress());

        // Decide the dispute
        await expect(disputeHandler.connect(assistantDR).decideDispute(exchangeId, buyerPercentBasisPoints))
          .to.emit(disputeHandler, "DisputeDecided")
          .withArgs(exchangeId, buyerPercentBasisPoints, await assistantDR.getAddress());

        // Remove another approved seller
        allowedSellersToRemove = ["2"];
        exchangeId = 3;

        await expect(
          accountHandler.connect(adminDR).removeSellersFromAllowList(disputeResolverId, allowedSellersToRemove)
        )
          .to.emit(accountHandler, "AllowedSellersRemoved")
          .withArgs(disputeResolverId, allowedSellersToRemove, await adminDR.getAddress());

        // Decide the dispute
        await expect(disputeHandler.connect(assistantDR).decideDispute(exchangeId, buyerPercentBasisPoints))
          .to.emit(disputeHandler, "DisputeDecided")
          .withArgs(exchangeId, buyerPercentBasisPoints, await assistantDR.getAddress());
      });
    });

    context("👉 refuseEscalatedDispute()", async function () {
      beforeEach(async function () {
        for (exchangeId = 1; exchangeId <= 3; exchangeId++) {
          // Raise a dispute
          await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Escalate the dispute
          await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });
        }
      });

      it("should refuse escalated dispute even when DR removes approved sellers", async function () {
        exchangeId = 1;
        // Refuse the escalated dispute, testing for the event
        await expect(disputeHandler.connect(assistantDR).refuseEscalatedDispute(exchangeId))
          .to.emit(disputeHandler, "EscalatedDisputeRefused")
          .withArgs(exchangeId, await assistantDR.getAddress());

        // Remove an approved seller
        let allowedSellersToRemove = ["1"];
        exchangeId = 2;

        await expect(
          accountHandler.connect(adminDR).removeSellersFromAllowList(disputeResolverId, allowedSellersToRemove)
        )
          .to.emit(accountHandler, "AllowedSellersRemoved")
          .withArgs(disputeResolverId, allowedSellersToRemove, await adminDR.getAddress());

        // Refuse the escalated dispute, testing for the event
        await expect(disputeHandler.connect(assistantDR).refuseEscalatedDispute(exchangeId))
          .to.emit(disputeHandler, "EscalatedDisputeRefused")
          .withArgs(exchangeId, await assistantDR.getAddress());

        // Remove another approved seller
        allowedSellersToRemove = ["2"];
        exchangeId = 3;

        await expect(
          accountHandler.connect(adminDR).removeSellersFromAllowList(disputeResolverId, allowedSellersToRemove)
        )
          .to.emit(accountHandler, "AllowedSellersRemoved")
          .withArgs(disputeResolverId, allowedSellersToRemove, await adminDR.getAddress());

        // Refuse the escalated dispute, testing for the event
        await expect(disputeHandler.connect(assistantDR).refuseEscalatedDispute(exchangeId))
          .to.emit(disputeHandler, "EscalatedDisputeRefused")
          .withArgs(exchangeId, await assistantDR.getAddress());
      });
    });
  });
});
