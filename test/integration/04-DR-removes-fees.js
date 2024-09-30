const { ethers } = require("hardhat");
const { ZeroAddress, provider, MaxUint256 } = ethers;
const { expect } = require("chai");

const {
  mockBuyer,
  mockSeller,
  mockAuthToken,
  mockVoucherInitValues,
  mockOffer,
  mockDisputeResolver,
  accountId,
  mockExchange,
  mockVoucher,
} = require("../util/mock");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const {
  setNextBlockTimestamp,
  calculateCloneAddress,
  calculateBosonProxyAddress,
  applyPercentage,
  setupTestEnvironment,
  getSnapshot,
  revertToSnapshot,
} = require("../util/utils.js");

/**
 *  Integration test case - exchange and offer operations should remain possible even when token fees are removed from the DR fee list
 */
describe("[@skip-on-coverage] DR removes fee", function () {
  let accountHandler, offerHandler, exchangeHandler, fundsHandler, disputeHandler;
  let expectedCloneAddress, emptyAuthToken, voucherInitValues;
  let assistant, admin, clerk, treasury, buyer, assistantDR, adminDR, clerkDR, treasuryDR;
  let buyerEscalationDepositPercentage;
  let buyerAccount, seller, disputeResolver;
  let offer, offerDates, offerDurations, disputeResolverId;
  let exchangeId;
  let disputeResolverFeeNative;
  let snapshotId;

  before(async function () {
    accountId.next(true);
    const agentId = "0"; // agent id is optional while creating an offer
    const offerFeeLimit = MaxUint256; // unlimited offer fee to not affect the tests

    // Specify contracts needed for this test
    const contracts = {
      accountHandler: "IBosonAccountHandler",
      offerHandler: "IBosonOfferHandler",
      exchangeHandler: "IBosonExchangeHandler",
      fundsHandler: "IBosonFundsHandler",
      disputeHandler: "IBosonDisputeHandler",
    };

    let protocolDiamondAddress;
    ({
      diamondAddress: protocolDiamondAddress,
      signers: [admin, treasury, buyer, adminDR, treasuryDR],
      contractInstances: { accountHandler, offerHandler, exchangeHandler, fundsHandler, disputeHandler },
      protocolConfig: [, , , ,buyerEscalationDepositPercentage],
    } = await setupTestEnvironment(contracts));

    // make all account the same
    assistant = admin;
    assistantDR = adminDR;
    clerk = clerkDR = { address: ZeroAddress };

    const beaconProxyAddress = await calculateBosonProxyAddress(protocolDiamondAddress);
    expectedCloneAddress = calculateCloneAddress(await accountHandler.getAddress(), beaconProxyAddress, admin.address);
    emptyAuthToken = mockAuthToken();
    expect(emptyAuthToken.isValid()).is.true;
    voucherInitValues = mockVoucherInitValues();
    expect(voucherInitValues.isValid()).is.true;

    // Create a seller account
    seller = mockSeller(
      await assistant.getAddress(),
      await admin.getAddress(),
      clerk.address,
      await treasury.getAddress()
    );

    expect(await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues))
      .to.emit(accountHandler, "SellerCreated")
      .withArgs(
        seller.id,
        seller.toStruct(),
        expectedCloneAddress,
        emptyAuthToken.toStruct(),
        await admin.getAddress()
      );

    // Create a dispute resolver
    disputeResolver = mockDisputeResolver(
      await assistantDR.getAddress(),
      await adminDR.getAddress(),
      clerkDR.address,
      await treasuryDR.getAddress(),
      true
    );
    expect(disputeResolver.isValid()).is.true;

    //Create DisputeResolverFee array so offer creation will succeed
    disputeResolverFeeNative = "0";
    const disputeResolverFees = [new DisputeResolverFee(ZeroAddress, "Native", disputeResolverFeeNative)];

    // Make empty seller list, so every seller is allowed
    const sellerAllowList = [];

    // Register the dispute resolver
    await accountHandler.connect(adminDR).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

    // Create a seller account
    ({ offer, offerDates, offerDurations, disputeResolverId } = await mockOffer());
    offer.quantityAvailable = "3";

    // Check if domains are valid
    expect(offer.isValid()).is.true;
    expect(offerDates.isValid()).is.true;
    expect(offerDurations.isValid()).is.true;

    // Create the offer
    await offerHandler
      .connect(assistant)
      .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId, offerFeeLimit);

    // Deposit seller funds so the commit will succeed
    const fundsToDeposit = BigInt(offer.sellerDeposit) * BigInt(offer.quantityAvailable);
    await fundsHandler.connect(assistant).depositFunds(seller.id, ZeroAddress, fundsToDeposit, {
      value: fundsToDeposit,
    });

    // Create a buyer account
    buyerAccount = mockBuyer(await buyer.getAddress());

    expect(await accountHandler.createBuyer(buyerAccount))
      .to.emit(accountHandler, "BuyerCreated")
      .withArgs(buyerAccount.id, buyerAccount.toStruct(), await buyer.getAddress());

    // Set time forward to the offer's voucherRedeemableFrom
    await setNextBlockTimestamp(Number(offerDates.voucherRedeemableFrom));

    for (exchangeId = 1; exchangeId <= 2; exchangeId++) {
      // Commit to offer, creating a new exchange
      await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offer.id, { value: offer.price });

      // Redeem voucher
      await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);
    }

    // Get snapshot id
    snapshotId = await getSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();
  });

  it("Buyer should be able to commit to offer even when DR removes fee", async function () {
    // Removes fee
    await expect(accountHandler.connect(adminDR).removeFeesFromDisputeResolver(disputeResolver.id, [ZeroAddress]))
      .to.emit(accountHandler, "DisputeResolverFeesRemoved")
      .withArgs(disputeResolver.id, [ZeroAddress], await adminDR.getAddress());

    // Commit to offer
    const tx = await exchangeHandler
      .connect(buyer)
      .commitToOffer(await buyer.getAddress(), offer.id, { value: offer.price });
    const blockTimestamp = (await provider.getBlock(tx.blockNumber)).timestamp;

    // Mock voucher
    const voucher = mockVoucher({
      committedDate: blockTimestamp.toString(),
      validUntilDate: (blockTimestamp + Number(offerDurations.voucherValid)).toString(),
      redeemedDate: "0",
    });

    exchangeId = "3";
    // Mock exchange
    const exchange = mockExchange({ id: exchangeId, buyerId: buyerAccount.id, finalizedDate: "0" });

    // Check if offer was committed
    await expect(tx)
      .to.emit(exchangeHandler, "BuyerCommitted")
      .withArgs(
        offer.id,
        buyerAccount.id,
        exchangeId,
        exchange.toStruct(),
        voucher.toStruct(),
        await buyer.getAddress()
      );
  });

  context("👉 After raise dispute actions", async function () {
    beforeEach(async function () {
      for (exchangeId = 1; exchangeId <= 2; exchangeId++) {
        // Raise a dispute
        await disputeHandler.connect(buyer).raiseDispute(exchangeId);
      }
    });

    it("Buyer should be able to escalate a dispute even when DR removes fee", async function () {
      const buyerEscalationDepositNative = applyPercentage(disputeResolverFeeNative, buyerEscalationDepositPercentage);

      // Escalate dispute before removing fee
      exchangeId = "1";
      await expect(disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative }))
        .to.emit(disputeHandler, "DisputeEscalated")
        .withArgs(exchangeId, disputeResolver.id, await buyer.getAddress());

      // Removes fee
      await expect(accountHandler.connect(adminDR).removeFeesFromDisputeResolver(disputeResolver.id, [ZeroAddress]))
        .to.emit(accountHandler, "DisputeResolverFeesRemoved")
        .withArgs(disputeResolver.id, [ZeroAddress], await adminDR.getAddress());

      // Escalate dispute after removing fee
      exchangeId = "2";
      await expect(disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative }))
        .to.emit(disputeHandler, "DisputeEscalated")
        .withArgs(exchangeId, disputeResolver.id, await buyer.getAddress());
    });

    context("👉 After escalate dispute actions", async function () {
      let buyerPercentBasisPoints;
      beforeEach(async function () {
        const buyerEscalationDepositNative = applyPercentage(
          disputeResolverFeeNative,
          buyerEscalationDepositPercentage
        );

        for (exchangeId = 1; exchangeId <= 2; exchangeId++) {
          // Escalate the dispute
          await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });
        }

        // Buyer percent used in tests
        buyerPercentBasisPoints = "4321";
      });

      it("DR should be able to decide dispute even when DR removes fee", async function () {
        exchangeId = "1";
        // Decide the dispute befor removing fee
        await expect(disputeHandler.connect(assistantDR).decideDispute(exchangeId, buyerPercentBasisPoints))
          .to.emit(disputeHandler, "DisputeDecided")
          .withArgs(exchangeId, buyerPercentBasisPoints, await assistantDR.getAddress());

        // Removes fee
        await expect(accountHandler.connect(adminDR).removeFeesFromDisputeResolver(disputeResolver.id, [ZeroAddress]))
          .to.emit(accountHandler, "DisputeResolverFeesRemoved")
          .withArgs(disputeResolver.id, [ZeroAddress], await adminDR.getAddress());

        // Decide the dispute after removing fee
        exchangeId = "2";
        await expect(disputeHandler.connect(assistantDR).decideDispute(exchangeId, buyerPercentBasisPoints))
          .to.emit(disputeHandler, "DisputeDecided")
          .withArgs(exchangeId, buyerPercentBasisPoints, await assistantDR.getAddress());
      });

      it("DR should be able to refuse to decide dispute even when DR removes fee", async function () {
        // Refuse to decide the dispute before removing fee
        exchangeId = "1";
        await expect(disputeHandler.connect(assistantDR).refuseEscalatedDispute(exchangeId))
          .to.emit(disputeHandler, "EscalatedDisputeRefused")
          .withArgs(exchangeId, await assistantDR.getAddress());

        // Removes fee
        await expect(accountHandler.connect(adminDR).removeFeesFromDisputeResolver(disputeResolver.id, [ZeroAddress]))
          .to.emit(accountHandler, "DisputeResolverFeesRemoved")
          .withArgs(disputeResolver.id, [ZeroAddress], await adminDR.getAddress());

        // Refuse to decide the dispute after removing fee
        exchangeId = "2";
        await expect(disputeHandler.connect(assistantDR).refuseEscalatedDispute(exchangeId))
          .to.emit(disputeHandler, "EscalatedDisputeRefused")
          .withArgs(exchangeId, await assistantDR.getAddress());
      });
    });
  });
});
