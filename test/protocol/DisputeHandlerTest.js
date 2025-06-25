const { ethers } = require("hardhat");
const { ZeroAddress, provider, zeroPadBytes, MaxUint256, parseUnits, getContractAt, id } = ethers;
const { expect, assert } = require("chai");
const Exchange = require("../../scripts/domain/Exchange");
const Dispute = require("../../scripts/domain/Dispute");
const DisputeState = require("../../scripts/domain/DisputeState");
const DisputeDates = require("../../scripts/domain/DisputeDates");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { toHexString } = require("../../scripts/util/utils.js");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const {
  setNextBlockTimestamp,
  prepareDataSignatureParameters,
  applyPercentage,
  setupTestEnvironment,
  getSnapshot,
  revertToSnapshot,
} = require("../util/utils.js");
const { oneWeek, oneMonth } = require("../util/constants");
const {
  mockOffer,
  mockDisputeResolver,
  mockSeller,
  mockAuthToken,
  mockVoucherInitValues,
  mockBuyer,
  accountId,
} = require("../util/mock");
const { FacetCutAction } = require("../../scripts/util/diamond-utils.js");

/**
 *  Test the Boson Dispute Handler interface
 */
describe("IBosonDisputeHandler", function () {
  // Common vars
  let InterfaceIds;
  let pauser,
    assistant,
    admin,
    clerk,
    treasury,
    rando,
    buyer,
    other1,
    other2,
    assistantDR,
    adminDR,
    clerkDR,
    treasuryDR;
  let erc165,
    protocolDiamond,
    accountHandler,
    exchangeHandler,
    offerHandler,
    fundsHandler,
    disputeHandler,
    pauseHandler;
  let buyerId, offer, offerId, seller;
  let block, blockNumber, tx;
  let support, newTime;
  let price, quantityAvailable, resolutionPeriod, disputePeriod, sellerDeposit;
  let voucherRedeemableFrom, offerDates, offerDurations, drParams;
  let buyerEscalationDepositPercentage;
  let exchangeStruct, voucherStruct, finalizedDate, exchangeId;
  let dispute,
    disputedDate,
    escalatedDate,
    disputeStruct,
    timeout,
    newDisputeTimeout,
    escalationPeriod,
    disputesToExpire;
  let disputeDates, disputeDatesStruct;
  let exists, response;
  let disputeResolver, disputeResolverFees, disputeResolverId;
  let buyerPercentBasisPoints;
  let resolutionType, customSignatureType, message, r, s, v;
  let returnedDispute, returnedDisputeDates;
  let DRFeeNative, DRFeeToken, buyerEscalationDepositNative, buyerEscalationDepositToken;
  let voucherInitValues;
  let emptyAuthToken;
  let agentId;
  let snapshotId;
  let offerFeeLimit;
  let bosonErrors;

  before(async function () {
    accountId.next(true);

    // get interface Ids
    InterfaceIds = await getInterfaceIds();

    // Specify contracts needed for this test
    const contracts = {
      erc165: "ERC165Facet",
      accountHandler: "IBosonAccountHandler",
      offerHandler: "IBosonOfferHandler",
      exchangeHandler: "IBosonExchangeHandler",
      fundsHandler: "IBosonFundsHandler",
      disputeHandler: "IBosonDisputeHandler",
      pauseHandler: "IBosonPauseHandler",
    };

    ({
      signers: [pauser, admin, treasury, buyer, rando, other1, other2, adminDR, treasuryDR],
      contractInstances: {
        erc165,
        accountHandler,
        offerHandler,
        exchangeHandler,
        fundsHandler,
        disputeHandler,
        pauseHandler,
      },
      protocolConfig: [, , , , buyerEscalationDepositPercentage],
    } = await setupTestEnvironment(contracts));

    bosonErrors = await getContractAt("BosonErrors", await accountHandler.getAddress());

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

  // Interface support (ERC-156 provided by ProtocolDiamond, others by deployed facets)
  context("📋 Interfaces", async function () {
    context("👉 supportsInterface()", async function () {
      it("should indicate support for IBosonDisputeHandler interface", async function () {
        // Current interfaceId for IBosonDisputeHandler
        support = await erc165.supportsInterface(InterfaceIds.IBosonDisputeHandler);

        // Test
        expect(support, "IBosonDisputeHandler interface not supported").is.true;
      });
    });
  });

  // All supported Dispute methods - single
  context("📋 Dispute Handler Methods", async function () {
    beforeEach(async function () {
      // Initial ids for all the things
      offerId = "1";
      agentId = "0"; // agent id is optional while creating an offer
      offerFeeLimit = MaxUint256; // unlimited offer fee to not affect the tests

      // Create a valid seller
      seller = mockSeller(
        await assistant.getAddress(),
        await admin.getAddress(),
        clerk.address,
        await treasury.getAddress()
      );
      expect(seller.isValid()).is.true;

      // VoucherInitValues
      voucherInitValues = mockVoucherInitValues();
      expect(voucherInitValues.isValid()).is.true;

      // AuthToken
      emptyAuthToken = mockAuthToken();
      expect(emptyAuthToken.isValid()).is.true;

      await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

      // Create a valid dispute resolver
      disputeResolver = mockDisputeResolver(
        await assistantDR.getAddress(),
        await adminDR.getAddress(),
        clerkDR.address,
        await treasuryDR.getAddress(),
        true
      );
      expect(disputeResolver.isValid()).is.true;

      //Create DisputeResolverFee array so offer creation will succeed
      DRFeeNative = "0";
      disputeResolverFees = [new DisputeResolverFee(ZeroAddress, "Native", DRFeeNative)];

      // Make empty seller list, so every seller is allowed
      const sellerAllowList = [];

      // Register the dispute resolver
      await accountHandler
        .connect(adminDR)
        .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

      // buyer escalation deposit used in multiple tests
      buyerEscalationDepositNative = applyPercentage(DRFeeNative, buyerEscalationDepositPercentage);

      // Mock offer
      ({ offer, offerDates, offerDurations, drParams } = await mockOffer());
      offer.quantityAvailable = "5";

      // Check if domains are valid
      expect(offer.isValid()).is.true;
      expect(offerDates.isValid()).is.true;
      expect(offerDurations.isValid()).is.true;

      // Create the offer
      await offerHandler
        .connect(assistant)
        .createOffer(offer, offerDates, offerDurations, drParams, agentId, offerFeeLimit);

      // Set used variables
      price = offer.price;
      quantityAvailable = offer.quantityAvailable;
      sellerDeposit = offer.sellerDeposit;
      voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
      resolutionPeriod = offerDurations.resolutionPeriod;
      disputePeriod = offerDurations.disputePeriod;
      escalationPeriod = disputeResolver.escalationResponsePeriod;

      // Deposit seller funds so the commit will succeed
      const fundsToDeposit = BigInt(sellerDeposit) * BigInt(quantityAvailable);
      await fundsHandler
        .connect(assistant)
        .depositFunds(seller.id, ZeroAddress, fundsToDeposit, { value: fundsToDeposit });

      buyerId = accountId.next().value;
    });

    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    context("Single", async function () {
      beforeEach(async function () {
        exchangeId = "1";

        // Commit to offer, creating a new exchange
        await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

        // Set time forward to the offer's voucherRedeemableFrom
        await setNextBlockTimestamp(Number(voucherRedeemableFrom));

        // Redeem voucher
        await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

        // Set the buyer percent
        buyerPercentBasisPoints = "0";
      });

      context("👉 raiseDispute()", async function () {
        it("should emit a DisputeRaised event", async function () {
          // Raise a dispute, testing for the event
          await expect(disputeHandler.connect(buyer).raiseDispute(exchangeId))
            .to.emit(disputeHandler, "DisputeRaised")
            .withArgs(exchangeId, buyerId, seller.id, await buyer.getAddress());
        });

        it("should update state", async function () {
          // Raise a dispute
          tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Get the block timestamp of the confirmed tx and set disputedDate
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          disputedDate = block.timestamp;
          timeout = BigInt(disputedDate) + BigInt(resolutionPeriod);

          // expected values
          dispute = new Dispute(exchangeId, DisputeState.Resolving, buyerPercentBasisPoints);
          disputeDates = new DisputeDates(disputedDate.toString(), "0", "0", timeout.toString());

          // Get the dispute as a struct
          [, disputeStruct, disputeDatesStruct] = await disputeHandler.connect(rando).getDispute(exchangeId);

          // Parse into entity
          returnedDispute = Dispute.fromStruct(disputeStruct);
          returnedDisputeDates = DisputeDates.fromStruct(disputeDatesStruct);

          // Returned values should match expected dispute data
          for (const [key, value] of Object.entries(dispute)) {
            expect(JSON.stringify(returnedDispute[key]) === JSON.stringify(value)).is.true;
          }
          for (const [key, value] of Object.entries(disputeDates)) {
            expect(JSON.stringify(returnedDisputeDates[key]) === JSON.stringify(value)).is.true;
          }
        });

        context("💔 Revert Reasons", async function () {
          it("The disputes region of protocol is paused", async function () {
            // Pause the disputes region of the protocol
            await pauseHandler.connect(pauser).pause([PausableRegion.Disputes]);

            // Attempt to raise a dispute, expecting revert
            await expect(disputeHandler.connect(buyer).raiseDispute(exchangeId))
              .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
              .withArgs(PausableRegion.Disputes);
          });

          it("Caller does not hold a voucher for the given exchange id", async function () {
            // Attempt to raise a dispute, expecting revert
            await expect(disputeHandler.connect(rando).raiseDispute(exchangeId)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.NOT_VOUCHER_HOLDER
            );
          });

          it("Exchange id is invalid", async function () {
            // An invalid exchange id
            const exchangeId = "666";

            // Attempt to raise a dispute, expecting revert
            await expect(disputeHandler.connect(buyer).raiseDispute(exchangeId)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.NO_SUCH_EXCHANGE
            );
          });

          it("exchange is not in a redeemed state - completed", async function () {
            const blockNumber = await provider.getBlockNumber();
            const block = await provider.getBlock(blockNumber);
            const currentTime = block.timestamp;

            // Set time forward to run out the dispute period
            newTime = Number((voucherRedeemableFrom + Number(disputePeriod) + 1).toString().substring(0, 11));

            if (newTime <= currentTime) {
              newTime += currentTime;
            }

            await setNextBlockTimestamp(newTime);

            // Complete exchange
            await exchangeHandler.connect(assistant).completeExchange(exchangeId);

            // Attempt to raise a dispute, expecting revert
            await expect(disputeHandler.connect(buyer).raiseDispute(exchangeId)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_STATE
            );
          });

          it("exchange is not in a redeemed state - disputed already", async function () {
            // Raise a dispute, put it into DISPUTED state
            await disputeHandler.connect(buyer).raiseDispute(exchangeId);

            // Attempt to raise a dispute, expecting revert
            await expect(disputeHandler.connect(buyer).raiseDispute(exchangeId)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_STATE
            );
          });

          it("The dispute period has already elapsed", async function () {
            // Get the redemption date
            [, , voucherStruct] = await exchangeHandler.connect(rando).getExchange(exchangeId);
            const voucherRedeemedDate = voucherStruct.redeemedDate;

            // Set time forward past the dispute period
            await setNextBlockTimestamp(Number(voucherRedeemedDate + BigInt(disputePeriod) + 1n));

            // Attempt to raise a dispute, expecting revert
            await expect(disputeHandler.connect(buyer).raiseDispute(exchangeId)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.DISPUTE_PERIOD_HAS_ELAPSED
            );
          });
        });
      });

      context("👉 retractDispute()", async function () {
        beforeEach(async function () {
          // Raise a dispute
          tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Get the block timestamp of the confirmed tx and set disputedDate
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          disputedDate = block.timestamp.toString();
          timeout = BigInt(disputedDate) + BigInt(resolutionPeriod);
        });

        it("should emit a DisputeRetracted event", async function () {
          // Retract the dispute, testing for the event
          await expect(disputeHandler.connect(buyer).retractDispute(exchangeId))
            .to.emit(disputeHandler, "DisputeRetracted")
            .withArgs(exchangeId, await buyer.getAddress());
        });

        it("should update state", async function () {
          // Retract the dispute
          tx = await disputeHandler.connect(buyer).retractDispute(exchangeId);

          // Get the block timestamp of the confirmed tx and set finalizedDate
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          finalizedDate = block.timestamp.toString();

          dispute = new Dispute(exchangeId, DisputeState.Retracted, buyerPercentBasisPoints);
          disputeDates = new DisputeDates(disputedDate, "0", finalizedDate, timeout);

          // Get the dispute as a struct
          [, disputeStruct, disputeDatesStruct] = await disputeHandler.connect(rando).getDispute(exchangeId);

          // Parse into entities
          returnedDispute = Dispute.fromStruct(disputeStruct);
          returnedDisputeDates = DisputeDates.fromStruct(disputeDatesStruct);

          // Returned values should match expected dispute and dispute dates
          for (const [key, value] of Object.entries(dispute)) {
            expect(JSON.stringify(returnedDispute[key]) === JSON.stringify(value)).is.true;
          }
          for (const [key, value] of Object.entries(disputeDates)) {
            expect(JSON.stringify(returnedDisputeDates[key]) === JSON.stringify(value)).is.true;
          }

          // Get the dispute state
          [exists, response] = await disputeHandler.connect(rando).getDisputeState(exchangeId);

          // It should match DisputeState.Retracted
          assert.equal(response, DisputeState.Retracted, "Dispute state is incorrect");

          // exchange should also be finalized
          // Get the exchange as a struct
          [, exchangeStruct] = await exchangeHandler.connect(rando).getExchange(exchangeId);

          // Parse into entity
          let returnedExchange = Exchange.fromStruct(exchangeStruct);

          // FinalizeDate should be set correctly
          assert.equal(returnedExchange.finalizedDate, finalizedDate, "Exchange finalizeDate is incorect");
        });

        it("dispute can be retracted if it's in escalated state", async function () {
          // Escalate a dispute
          await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

          // Retract the dispute, testing for the event
          await expect(disputeHandler.connect(buyer).retractDispute(exchangeId))
            .to.emit(disputeHandler, "DisputeRetracted")
            .withArgs(exchangeId, await buyer.getAddress());
        });

        context("💔 Revert Reasons", async function () {
          it("The disputes region of protocol is paused", async function () {
            // Pause the disputes region of the protocol
            await pauseHandler.connect(pauser).pause([PausableRegion.Disputes]);

            // Attempt to retract a dispute, expecting revert
            await expect(disputeHandler.connect(buyer).retractDispute(exchangeId))
              .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
              .withArgs(PausableRegion.Disputes);
          });

          it("Exchange does not exist", async function () {
            // An invalid exchange id
            const exchangeId = "666";

            // Attempt to retract the dispute, expecting revert
            await expect(disputeHandler.connect(buyer).retractDispute(exchangeId)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.NO_SUCH_EXCHANGE
            );
          });

          it("Exchange is not in a disputed state", async function () {
            exchangeId++;

            // Commit to offer, creating a new exchange
            await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

            // Attempt to retract the dispute, expecting revert
            await expect(disputeHandler.connect(buyer).retractDispute(exchangeId)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_STATE
            );
          });

          it("Caller is not the buyer for the given exchange id", async function () {
            // Attempt to retract the dispute, expecting revert
            await expect(disputeHandler.connect(rando).retractDispute(exchangeId)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.NOT_VOUCHER_HOLDER
            );
          });

          it("Dispute is in some state other than resolving or escalated", async function () {
            // Retract the dispute, put it into RETRACTED state
            await disputeHandler.connect(buyer).retractDispute(exchangeId);

            // Attempt to retract the dispute, expecting revert
            await expect(disputeHandler.connect(buyer).retractDispute(exchangeId)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_STATE
            );
          });
        });

        it("Dispute was escalated and escalation period has elapsed", async function () {
          // Escalate the dispute
          tx = await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

          // Get the block timestamp of the confirmed tx and set escalatedDate
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          escalatedDate = block.timestamp.toString();

          await setNextBlockTimestamp(Number(escalatedDate) + Number(escalationPeriod) + 1);

          // Attempt to retract the dispute, expecting revert
          await expect(disputeHandler.connect(buyer).retractDispute(exchangeId)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.DISPUTE_HAS_EXPIRED
          );
        });
      });

      context("👉 extendDisputeTimeout()", async function () {
        beforeEach(async function () {
          // Raise a dispute
          tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Get the block timestamp of the confirmed tx and set disputedDate
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          disputedDate = block.timestamp.toString();
          timeout = BigInt(disputedDate) + BigInt(resolutionPeriod);

          // extend timeout for a month
          newDisputeTimeout = BigInt(timeout) + oneMonth;
        });

        it("should emit a DisputeTimeoutExtended event", async function () {
          // Extend the dispute timeout, testing for the event
          await expect(disputeHandler.connect(assistant).extendDisputeTimeout(exchangeId, newDisputeTimeout))
            .to.emit(disputeHandler, "DisputeTimeoutExtended")
            .withArgs(exchangeId, newDisputeTimeout, await assistant.getAddress());
        });

        it("should update state", async function () {
          // Extend the dispute timeout
          await disputeHandler.connect(assistant).extendDisputeTimeout(exchangeId, newDisputeTimeout);

          dispute = new Dispute(exchangeId, DisputeState.Resolving, "0");
          disputeDates = new DisputeDates(disputedDate, "0", "0", newDisputeTimeout);

          // Get the dispute as a struct
          [, disputeStruct, disputeDatesStruct] = await disputeHandler.connect(rando).getDispute(exchangeId);

          // Parse into entities
          returnedDispute = Dispute.fromStruct(disputeStruct);
          returnedDisputeDates = DisputeDates.fromStruct(disputeDatesStruct);

          // Returned values should match the expected dispute and dispute dates
          for (const [key, value] of Object.entries(dispute)) {
            expect(JSON.stringify(returnedDispute[key]) === JSON.stringify(value)).is.true;
          }
          for (const [key, value] of Object.entries(disputeDates)) {
            expect(JSON.stringify(returnedDisputeDates[key]) === JSON.stringify(value)).is.true;
          }

          // Get the dispute timeout
          [exists, response] = await disputeHandler.connect(rando).getDisputeTimeout(exchangeId);

          // It should match newDisputeTimeout
          assert.equal(response, newDisputeTimeout, "Dispute timeout is incorrect");
        });

        it("dispute timeout can be extended multiple times", async function () {
          // Extend the dispute timeout
          await disputeHandler.connect(assistant).extendDisputeTimeout(exchangeId, newDisputeTimeout);

          // not strictly necessary, but it shows that we can extend event if we are past original timeout
          await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

          // extend for another week
          newDisputeTimeout = BigInt(newDisputeTimeout) + oneWeek;

          // Extend the dispute timeout, testing for the event
          await expect(disputeHandler.connect(assistant).extendDisputeTimeout(exchangeId, newDisputeTimeout))
            .to.emit(disputeHandler, "DisputeTimeoutExtended")
            .withArgs(exchangeId, newDisputeTimeout, await assistant.getAddress());
        });

        context("💔 Revert Reasons", async function () {
          it("The disputes region of protocol is paused", async function () {
            // Pause the disputes region of the protocol
            await pauseHandler.connect(pauser).pause([PausableRegion.Disputes]);

            // Attempt to extend a dispute timeout, expecting revert
            await expect(disputeHandler.connect(assistant).extendDisputeTimeout(exchangeId, newDisputeTimeout))
              .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
              .withArgs(PausableRegion.Disputes);
          });

          it("Exchange does not exist", async function () {
            // An invalid exchange id
            const exchangeId = "666";

            // Attempt to extend the dispute timeout, expecting revert
            await expect(
              disputeHandler.connect(assistant).extendDisputeTimeout(exchangeId, newDisputeTimeout)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_EXCHANGE);
          });

          it("Exchange is not in a disputed state", async function () {
            exchangeId++;

            // Commit to offer, creating a new exchange
            await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

            // Attempt to extend the dispute timeout, expecting revert
            await expect(
              disputeHandler.connect(assistant).extendDisputeTimeout(exchangeId, newDisputeTimeout)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_STATE);
          });

          it("Caller is not the seller", async function () {
            // Attempt to extend the dispute timeout, expecting revert
            await expect(
              disputeHandler.connect(rando).extendDisputeTimeout(exchangeId, newDisputeTimeout)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_ASSISTANT);
          });

          it("Dispute has expired already", async function () {
            // Set time forward past the dispute resolution period
            await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

            // Attempt to extend the dispute timeout, expecting revert
            await expect(
              disputeHandler.connect(assistant).extendDisputeTimeout(exchangeId, newDisputeTimeout)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.DISPUTE_HAS_EXPIRED);
          });

          it("new dispute timeout is before the current dispute timeout", async function () {
            newDisputeTimeout = BigInt(timeout) - oneWeek;

            // Attempt to extend the dispute timeout, expecting revert
            await expect(
              disputeHandler.connect(assistant).extendDisputeTimeout(exchangeId, newDisputeTimeout)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_DISPUTE_TIMEOUT);
          });

          it("Dispute is in some state other than resolving", async function () {
            // Retract the dispute, put it into RETRACTED state
            await disputeHandler.connect(buyer).retractDispute(exchangeId);

            // Attempt to expire the dispute, expecting revert
            await expect(
              disputeHandler.connect(assistant).extendDisputeTimeout(exchangeId, newDisputeTimeout)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_STATE);
          });
        });
      });

      context("👉 expireDispute()", async function () {
        beforeEach(async function () {
          // Raise a dispute
          tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Get the block timestamp of the confirmed tx and set disputedDate
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          disputedDate = block.timestamp.toString();
          timeout = BigInt(disputedDate) + BigInt(resolutionPeriod);
        });

        it("should emit a DisputeExpired event", async function () {
          // Set time forward past the dispute resolution period
          await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

          // Expire the dispute, testing for the event
          await expect(disputeHandler.connect(rando).expireDispute(exchangeId))
            .to.emit(disputeHandler, "DisputeExpired")
            .withArgs(exchangeId, await rando.getAddress());
        });

        it("should update state", async function () {
          // Set time forward past the dispute resolution period
          await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

          // Expire the dispute
          tx = await disputeHandler.connect(rando).expireDispute(exchangeId);

          // Get the block timestamp of the confirmed tx and set finalizedDate
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          finalizedDate = block.timestamp.toString();

          dispute = new Dispute(exchangeId, DisputeState.Retracted, buyerPercentBasisPoints);
          disputeDates = new DisputeDates(disputedDate, "0", finalizedDate, timeout);

          // Get the dispute as a struct
          [, disputeStruct, disputeDatesStruct] = await disputeHandler.connect(rando).getDispute(exchangeId);

          // Parse into entities
          returnedDispute = Dispute.fromStruct(disputeStruct);
          returnedDisputeDates = DisputeDates.fromStruct(disputeDatesStruct);

          // Returned values should match the expected dispute and dispute dates
          for (const [key, value] of Object.entries(dispute)) {
            expect(JSON.stringify(returnedDispute[key]) === JSON.stringify(value)).is.true;
          }
          for (const [key, value] of Object.entries(disputeDates)) {
            expect(JSON.stringify(returnedDisputeDates[key]) === JSON.stringify(value)).is.true;
          }

          // Get the dispute state
          [exists, response] = await disputeHandler.connect(rando).getDisputeState(exchangeId);

          // It should match DisputeState.Retracted
          assert.equal(response, DisputeState.Retracted, "Dispute state is incorrect");

          // exchange should also be finalized
          // Get the exchange as a struct
          [, exchangeStruct] = await exchangeHandler.connect(rando).getExchange(exchangeId);

          // Parse into entity
          let returnedExchange = Exchange.fromStruct(exchangeStruct);

          // FinalizeDate should be set correctly
          assert.equal(returnedExchange.finalizedDate, finalizedDate, "Exchange finalizeDate is incorect");
        });

        context("💔 Revert Reasons", async function () {
          it("The disputes region of protocol is paused", async function () {
            // Set time forward past the dispute resolution period
            await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

            // Pause the disputes region of the protocol
            await pauseHandler.connect(pauser).pause([PausableRegion.Disputes]);

            // Attempt to expire a dispute, expecting revert
            await expect(disputeHandler.connect(rando).expireDispute(exchangeId))
              .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
              .withArgs(PausableRegion.Disputes);
          });

          it("Exchange does not exist", async function () {
            // An invalid exchange id
            const exchangeId = "666";

            // Attempt to expire the dispute, expecting revert
            await expect(disputeHandler.connect(rando).expireDispute(exchangeId)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.NO_SUCH_EXCHANGE
            );
          });

          it("Exchange is not in a disputed state", async function () {
            exchangeId++;

            // Commit to offer, creating a new exchange
            await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

            // Attempt to expire the dispute, expecting revert
            await expect(disputeHandler.connect(rando).expireDispute(exchangeId)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_STATE
            );
          });

          it("Dispute has not expired yet", async function () {
            // Attempt to expire the dispute, expecting revert
            await expect(disputeHandler.connect(rando).expireDispute(exchangeId)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.DISPUTE_STILL_VALID
            );
          });

          it("Dispute timeout has been extended", async function () {
            // Extend the dispute timeout
            await disputeHandler
              .connect(assistant)
              .extendDisputeTimeout(exchangeId, Number(timeout) + 2 * Number(oneWeek));

            // put past original timeout where normally it would not revert
            await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

            // Attempt to expire the dispute, expecting revert
            await expect(disputeHandler.connect(rando).expireDispute(exchangeId)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.DISPUTE_STILL_VALID
            );
          });

          it("Dispute is in some state other than resolving", async function () {
            // Retract the dispute, put it into RETRACTED state
            await disputeHandler.connect(buyer).retractDispute(exchangeId);

            // Attempt to expire the dispute, expecting revert
            await expect(disputeHandler.connect(rando).expireDispute(exchangeId)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_STATE
            );
          });
        });
      });

      context("👉 resolveDispute()", async function () {
        beforeEach(async function () {
          // Raise a dispute
          tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Get the block timestamp of the confirmed tx and set disputedDate
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          disputedDate = block.timestamp.toString();
          timeout = BigInt(disputedDate) + BigInt(resolutionPeriod);

          buyerPercentBasisPoints = "1234";

          // Set the message Type, needed for signature
          resolutionType = [
            { name: "exchangeId", type: "uint256" },
            { name: "buyerPercentBasisPoints", type: "uint256" },
          ];

          customSignatureType = {
            Resolution: resolutionType,
          };

          message = {
            exchangeId: exchangeId,
            buyerPercentBasisPoints,
          };
        });

        context("👉 buyer is the caller", async function () {
          beforeEach(async function () {
            // Collect the signature components
            ({ r, s, v } = await prepareDataSignatureParameters(
              assistant, // When buyer is the caller, seller should be the signer.
              customSignatureType,
              "Resolution",
              message,
              await disputeHandler.getAddress()
            ));
          });

          it("should emit a DisputeResolved event", async function () {
            // Resolve the dispute, testing for the event
            await expect(disputeHandler.connect(buyer).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v))
              .to.emit(disputeHandler, "DisputeResolved")
              .withArgs(exchangeId, buyerPercentBasisPoints, await buyer.getAddress());
          });

          it("should update state", async function () {
            // Resolve the dispute
            tx = await disputeHandler.connect(buyer).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v);

            // Get the block timestamp of the confirmed tx and set finalizedDate
            blockNumber = tx.blockNumber;
            block = await provider.getBlock(blockNumber);
            finalizedDate = block.timestamp.toString();

            dispute = new Dispute(exchangeId, DisputeState.Resolved, buyerPercentBasisPoints);
            disputeDates = new DisputeDates(disputedDate, "0", finalizedDate, timeout);

            // Get the dispute as a struct
            [, disputeStruct, disputeDatesStruct] = await disputeHandler.connect(rando).getDispute(exchangeId);

            // Parse into entities
            returnedDispute = Dispute.fromStruct(disputeStruct);
            returnedDisputeDates = DisputeDates.fromStruct(disputeDatesStruct);

            // Returned values should match the expected dispute and dispute dates
            for (const [key, value] of Object.entries(dispute)) {
              expect(JSON.stringify(returnedDispute[key]) === JSON.stringify(value)).is.true;
            }
            for (const [key, value] of Object.entries(disputeDates)) {
              expect(JSON.stringify(returnedDisputeDates[key]) === JSON.stringify(value)).is.true;
            }

            // Get the dispute state
            [exists, response] = await disputeHandler.connect(rando).getDisputeState(exchangeId);

            // It should match DisputeState.Resolved
            assert.equal(response, DisputeState.Resolved, "Dispute state is incorrect");

            // exchange should also be finalized
            // Get the exchange as a struct
            [, exchangeStruct] = await exchangeHandler.connect(rando).getExchange(exchangeId);

            // Parse into entity
            let returnedExchange = Exchange.fromStruct(exchangeStruct);

            // FinalizeDate should be set correctly
            assert.equal(returnedExchange.finalizedDate, finalizedDate, "Exchange finalizeDate is incorect");
          });

          it("Buyer can also have a seller account and this will work", async function () {
            // Create a valid seller with buyer's wallet
            seller = mockSeller(
              await buyer.getAddress(),
              await buyer.getAddress(),
              ZeroAddress,
              await buyer.getAddress()
            );
            expect(seller.isValid()).is.true;

            await accountHandler.connect(buyer).createSeller(seller, emptyAuthToken, voucherInitValues);

            // Resolve the dispute, testing for the event
            await expect(disputeHandler.connect(buyer).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v))
              .to.emit(disputeHandler, "DisputeResolved")
              .withArgs(exchangeId, buyerPercentBasisPoints, await buyer.getAddress());
          });

          it("Dispute can be mutually resolved even if it's in escalated state", async function () {
            // escalate dispute
            await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

            // Resolve the dispute, testing for the event
            await expect(disputeHandler.connect(buyer).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v))
              .to.emit(disputeHandler, "DisputeResolved")
              .withArgs(exchangeId, buyerPercentBasisPoints, await buyer.getAddress());
          });

          it("Dispute can be mutually resolved even if it's in escalated state and past the resolution period", async function () {
            // Set time forward before the dispute original expiration date
            await setNextBlockTimestamp(Number(BigInt(disputedDate) + BigInt(resolutionPeriod) / 2n));

            // escalate dispute
            await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

            // Set time forward to the dispute original expiration date
            await setNextBlockTimestamp(Number(timeout) + 10);

            // Resolve the dispute, testing for the event
            await expect(disputeHandler.connect(buyer).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v))
              .to.emit(disputeHandler, "DisputeResolved")
              .withArgs(exchangeId, buyerPercentBasisPoints, await buyer.getAddress());
          });

          it("Dispute can be mutually resolved if it's past original timeout, but it was extended", async function () {
            // Extend the dispute timeout
            await disputeHandler
              .connect(assistant)
              .extendDisputeTimeout(exchangeId, Number(timeout) + 2 * Number(oneWeek));

            // put past original timeout where normally it would not revert
            await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

            // Resolve the dispute, testing for the event
            await expect(disputeHandler.connect(buyer).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v))
              .to.emit(disputeHandler, "DisputeResolved")
              .withArgs(exchangeId, buyerPercentBasisPoints, await buyer.getAddress());
          });
        });

        context("👉 seller is the caller", async function () {
          beforeEach(async function () {
            // Collect the signature components
            ({ r, s, v } = await prepareDataSignatureParameters(
              buyer, // When seller is the caller, buyer should be the signer.
              customSignatureType,
              "Resolution",
              message,
              await disputeHandler.getAddress()
            ));
          });

          it("should emit a DisputeResolved event", async function () {
            // Resolve the dispute, testing for the event
            await expect(disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v))
              .to.emit(disputeHandler, "DisputeResolved")
              .withArgs(exchangeId, buyerPercentBasisPoints, await assistant.getAddress());
          });

          it("should update state", async function () {
            // Resolve the dispute
            tx = await disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v);

            // Get the block timestamp of the confirmed tx and set finalizedDate
            blockNumber = tx.blockNumber;
            block = await provider.getBlock(blockNumber);
            finalizedDate = block.timestamp.toString();

            dispute = new Dispute(exchangeId, DisputeState.Resolved, buyerPercentBasisPoints);
            disputeDates = new DisputeDates(disputedDate, "0", finalizedDate, timeout);

            // Get the dispute as a struct
            [, disputeStruct, disputeDatesStruct] = await disputeHandler.connect(rando).getDispute(exchangeId);

            // Parse into entities
            returnedDispute = Dispute.fromStruct(disputeStruct);
            returnedDisputeDates = DisputeDates.fromStruct(disputeDatesStruct);

            // Returned values should match the expected dispute and dispute dates
            for (const [key, value] of Object.entries(dispute)) {
              expect(JSON.stringify(returnedDispute[key]) === JSON.stringify(value)).is.true;
            }
            for (const [key, value] of Object.entries(disputeDates)) {
              expect(JSON.stringify(returnedDisputeDates[key]) === JSON.stringify(value)).is.true;
            }

            // Get the dispute state
            [exists, response] = await disputeHandler.connect(rando).getDisputeState(exchangeId);

            // It should match DisputeState.Resolved
            assert.equal(response, DisputeState.Resolved, "Dispute state is incorrect");

            // exchange should also be finalized
            // Get the exchange as a struct
            [, exchangeStruct] = await exchangeHandler.connect(rando).getExchange(exchangeId);

            // Parse into entity
            let returnedExchange = Exchange.fromStruct(exchangeStruct);

            // FinalizeDate should be set correctly
            assert.equal(returnedExchange.finalizedDate, finalizedDate, "Exchange finalizeDate is incorect");
          });

          it("Assistant can also have a buyer account and this will work", async function () {
            // Create a valid buyer with assistant's wallet
            let buyer = mockBuyer(await assistant.getAddress());
            expect(buyer.isValid()).is.true;
            await accountHandler.connect(assistant).createBuyer(buyer);

            // Resolve the dispute, testing for the event
            await expect(disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v))
              .to.emit(disputeHandler, "DisputeResolved")
              .withArgs(exchangeId, buyerPercentBasisPoints, await assistant.getAddress());
          });

          it("Dispute can be mutually resolved even if it's in escalated state", async function () {
            // escalate dispute
            await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

            // Resolve the dispute, testing for the event
            await expect(disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v))
              .to.emit(disputeHandler, "DisputeResolved")
              .withArgs(exchangeId, buyerPercentBasisPoints, await assistant.getAddress());
          });

          it("Dispute can be mutually resolved even if it's in escalated state and past the resolution period", async function () {
            // Set time forward before the dispute original expiration date
            await setNextBlockTimestamp(Number(BigInt(disputedDate) + BigInt(resolutionPeriod) / 2n));

            // escalate dispute
            await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

            // Set time forward to the dispute original expiration date
            await setNextBlockTimestamp(Number(timeout) + 10);

            // Resolve the dispute, testing for the event
            await expect(disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v))
              .to.emit(disputeHandler, "DisputeResolved")
              .withArgs(exchangeId, buyerPercentBasisPoints, await assistant.getAddress());
          });

          it("Dispute can be mutually resolved if it's past original timeout, but it was extended", async function () {
            // Extend the dispute timeout
            await disputeHandler
              .connect(assistant)
              .extendDisputeTimeout(exchangeId, Number(timeout) + 2 * Number(oneWeek));

            // put past original timeout where normally it would not revert
            await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

            // Resolve the dispute, testing for the event
            await expect(disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v))
              .to.emit(disputeHandler, "DisputeResolved")
              .withArgs(exchangeId, buyerPercentBasisPoints, await assistant.getAddress());
          });
        });

        context("💔 Revert Reasons", async function () {
          beforeEach(async function () {
            // Collect the signature components
            ({ r, s, v } = await prepareDataSignatureParameters(
              buyer, // When seller is the caller, buyer should be the signer.
              customSignatureType,
              "Resolution",
              message,
              await disputeHandler.getAddress()
            ));
          });

          it("The disputes region of protocol is paused", async function () {
            // Pause the disputes region of the protocol
            await pauseHandler.connect(pauser).pause([PausableRegion.Disputes]);

            // Attempt to resolve a dispute, expecting revert
            await expect(disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v))
              .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
              .withArgs(PausableRegion.Disputes);
          });

          it("Specified buyer percent exceeds 100%", async function () {
            // Set buyer percent above 100%
            buyerPercentBasisPoints = "12000"; // 120%

            // Attempt to resolve the dispute, expecting revert
            await expect(
              disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_BUYER_PERCENT);
          });

          it("Dispute has expired", async function () {
            // Set time forward to the dispute expiration date
            await setNextBlockTimestamp(Number(timeout) + 1);

            // Attempt to resolve the dispute, expecting revert
            await expect(
              disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.DISPUTE_HAS_EXPIRED);
          });

          it("Exchange does not exist", async function () {
            // An invalid exchange id
            const exchangeId = "666";

            // Attempt to resolve the dispute, expecting revert
            await expect(
              disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_EXCHANGE);
          });

          it("Exchange is not in a disputed state", async function () {
            exchangeId++;

            // Commit to offer, creating a new exchange
            await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

            // Attempt to resolve the dispute, expecting revert
            await expect(
              disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_STATE);
          });

          it("Caller is neither the seller nor the buyer for the given exchange id", async function () {
            // Wallet without any account
            // Attempt to resolve the dispute, expecting revert
            await expect(
              disputeHandler.connect(rando).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_BUYER_OR_SELLER);

            // Wallet with seller account, but not the seller in this exchange
            // Create a valid seller
            seller = mockSeller(
              await other1.getAddress(),
              await other1.getAddress(),
              ZeroAddress,
              await other1.getAddress()
            );
            expect(seller.isValid()).is.true;

            await accountHandler.connect(other1).createSeller(seller, emptyAuthToken, voucherInitValues);
            // Attempt to resolve the dispute, expecting revert
            await expect(
              disputeHandler.connect(other1).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_BUYER_OR_SELLER);

            // Wallet with buyer account, but not the buyer in this exchange
            // Create a valid buyer
            let buyer = mockBuyer(await other2.getAddress());
            expect(buyer.isValid()).is.true;
            await accountHandler.connect(other2).createBuyer(buyer);

            // Attempt to resolve the dispute, expecting revert
            await expect(
              disputeHandler.connect(other2).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_BUYER_OR_SELLER);
          });

          it("signature does not belong to the address of the other party", async function () {
            // Collect the signature components
            ({ r, s, v } = await prepareDataSignatureParameters(
              rando,
              customSignatureType,
              "Resolution",
              message,
              await disputeHandler.getAddress()
            ));

            // Attempt to resolve the dispute, expecting revert
            await expect(
              disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.SIGNER_AND_SIGNATURE_DO_NOT_MATCH);

            // Attempt to resolve the dispute, expecting revert
            await expect(
              disputeHandler.connect(buyer).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.SIGNER_AND_SIGNATURE_DO_NOT_MATCH);
          });

          it("signature resolution does not match input buyerPercentBasisPoints ", async function () {
            // Set different buyer percentage
            buyerPercentBasisPoints = (Number(buyerPercentBasisPoints) + 1000).toString(); // add 10%

            // Attempt to resolve the dispute, expecting revert
            await expect(
              disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.SIGNER_AND_SIGNATURE_DO_NOT_MATCH);
          });

          it("signature has invalid field", async function () {
            // Attempt to resolve the dispute, expecting revert
            await expect(
              disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, "0")
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_SIGNATURE);
            await expect(
              disputeHandler
                .connect(assistant)
                .resolveDispute(exchangeId, buyerPercentBasisPoints, r, zeroPadBytes("0x", 32), v)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_SIGNATURE);
            await expect(
              disputeHandler
                .connect(assistant)
                .resolveDispute(exchangeId, buyerPercentBasisPoints, zeroPadBytes("0x", 32), s, v)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_SIGNATURE);
            await expect(
              disputeHandler
                .connect(assistant)
                .resolveDispute(exchangeId, buyerPercentBasisPoints, r, toHexString(MaxUint256), v)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_SIGNATURE);
          });

          it("dispute state is neither resolving or escalated", async function () {
            // Retract the dispute, put it into RETRACTED state
            await disputeHandler.connect(buyer).retractDispute(exchangeId);

            // Attempt to resolve the dispute, expecting revert
            await expect(
              disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_STATE);
          });
        });
      });

      context("👉 escalateDispute()", async function () {
        async function createDisputeExchangeWithToken() {
          // utility function that deploys a mock token, creates a offer with it, creates an exchange and push it into escalated state
          // deploy a mock token
          const [mockToken] = await deployMockTokens(["Foreign20"]);

          // add to DR fees
          DRFeeToken = "0";
          await accountHandler
            .connect(adminDR)
            .addFeesToDisputeResolver(drParams.disputeResolverId, [
              new DisputeResolverFee(await mockToken.getAddress(), "MockToken", DRFeeToken),
            ]);

          // create an offer with a mock token contract
          offer.exchangeToken = await mockToken.getAddress();
          offer.sellerDeposit = offer.price = offer.buyerCancelPenalty = "0";
          offer.id++;

          // create an offer with erc20 exchange token
          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, drParams, agentId, offerFeeLimit);

          // mint tokens to buyer and approve the protocol
          buyerEscalationDepositToken = applyPercentage(DRFeeToken, buyerEscalationDepositPercentage);
          await mockToken.mint(await buyer.getAddress(), buyerEscalationDepositToken);
          await mockToken.connect(buyer).approve(await disputeHandler.getAddress(), buyerEscalationDepositToken);

          // Commit to offer and put exchange all the way to dispute
          await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offer.id);
          await exchangeHandler.connect(buyer).redeemVoucher(++exchangeId);
          await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          return mockToken;
        }

        beforeEach(async function () {
          // Raise a dispute
          tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Get the block timestamp of the confirmed tx and set disputedDate
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          disputedDate = block.timestamp.toString();
          timeout = BigInt(disputedDate) + BigInt(resolutionPeriod);
        });

        it("should emit FundsEncumbered and DisputeEscalated events", async function () {
          // Escalate the dispute, testing for the event
          const tx = await disputeHandler
            .connect(buyer)
            .escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

          await expect(tx)
            .to.emit(disputeHandler, "FundsEncumbered")
            .withArgs(buyerId, ZeroAddress, buyerEscalationDepositNative, await buyer.getAddress());

          await expect(tx)
            .to.emit(disputeHandler, "DisputeEscalated")
            .withArgs(exchangeId, drParams.disputeResolverId, await buyer.getAddress());
        });

        it("should update state", async function () {
          // Protocol balance before
          const escrowBalanceBefore = await provider.getBalance(await disputeHandler.getAddress());

          // Escalate the dispute
          tx = await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

          // Get the block timestamp of the confirmed tx and set escalatedDate
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          escalatedDate = block.timestamp.toString();
          timeout = BigInt(escalatedDate) + BigInt(escalationPeriod);

          dispute = new Dispute(exchangeId, DisputeState.Escalated, "0");
          disputeDates = new DisputeDates(disputedDate, escalatedDate, "0", timeout);

          // Get the dispute as a struct
          [, disputeStruct, disputeDatesStruct] = await disputeHandler.connect(rando).getDispute(exchangeId);

          // Parse into entities
          returnedDispute = Dispute.fromStruct(disputeStruct);
          returnedDisputeDates = DisputeDates.fromStruct(disputeDatesStruct);

          // Returned values should match the expected dispute and dispute dates
          for (const [key, value] of Object.entries(dispute)) {
            expect(JSON.stringify(returnedDispute[key]) === JSON.stringify(value)).is.true;
          }
          for (const [key, value] of Object.entries(disputeDates)) {
            expect(JSON.stringify(returnedDisputeDates[key]) === JSON.stringify(value)).is.true;
          }

          // Get the dispute state
          [exists, response] = await disputeHandler.connect(rando).getDisputeState(exchangeId);

          // It should match DisputeState.Escalated
          assert.equal(response, DisputeState.Escalated, "Dispute state is incorrect");

          // Protocol balance should increase for buyer escalation deposit
          const escrowBalanceAfter = await provider.getBalance(await disputeHandler.getAddress());
          expect(escrowBalanceAfter - escrowBalanceBefore).to.equal(
            buyerEscalationDepositNative,
            "Escrow balance mismatch"
          );
        });

        it("should be possible to pay escalation deposit in ERC20 token", async function () {
          const mockToken = await createDisputeExchangeWithToken();

          // Protocol balance before
          const escrowBalanceBefore = await mockToken.balanceOf(await disputeHandler.getAddress());

          // Escalate the dispute, testing for the events
          const tx = await disputeHandler.connect(buyer).escalateDispute(exchangeId);
          await expect(tx)
            .to.emit(disputeHandler, "FundsEncumbered")
            .withArgs(buyerId, await mockToken.getAddress(), buyerEscalationDepositToken, await buyer.getAddress());

          await expect(tx)
            .to.emit(disputeHandler, "DisputeEscalated")
            .withArgs(exchangeId, drParams.disputeResolverId, await buyer.getAddress());

          // Protocol balance should increase for buyer escalation deposit
          const escrowBalanceAfter = await mockToken.balanceOf(await disputeHandler.getAddress());
          expect(escrowBalanceAfter - escrowBalanceBefore).to.equal(
            buyerEscalationDepositToken,
            "Escrow balance mismatch"
          );
        });

        context("💔 Revert Reasons", async function () {
          it("The disputes region of protocol is paused", async function () {
            // Pause the disputes region of the protocol
            await pauseHandler.connect(pauser).pause([PausableRegion.Disputes]);

            // Attempt to escalate a dispute, expecting revert
            await expect(
              disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative })
            )
              .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
              .withArgs(PausableRegion.Disputes);
          });

          it("Exchange does not exist", async function () {
            // An invalid exchange id
            const exchangeId = "666";

            // Attempt to escalate the dispute, expecting revert
            await expect(disputeHandler.connect(buyer).escalateDispute(exchangeId), {
              value: buyerEscalationDepositNative,
            }).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_EXCHANGE);
          });

          it("Exchange is not in a disputed state", async function () {
            exchangeId++;

            // Commit to offer, creating a new exchange
            await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

            // Attempt to escalate the dispute, expecting revert
            await expect(disputeHandler.connect(buyer).escalateDispute(exchangeId), {
              value: buyerEscalationDepositNative,
            }).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_STATE);
          });

          it("Caller is not the buyer for the given exchange id", async function () {
            // Attempt to retract the dispute, expecting revert
            await expect(disputeHandler.connect(rando).escalateDispute(exchangeId), {
              value: buyerEscalationDepositNative,
            }).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_VOUCHER_HOLDER);
          });

          it("Dispute has expired", async function () {
            // Set time forward past the dispute resolution period
            await setNextBlockTimestamp(Number(timeout + oneWeek));

            // Attempt to escalate the dispute, expecting revert
            await expect(disputeHandler.connect(buyer).escalateDispute(exchangeId), {
              value: buyerEscalationDepositNative,
            }).to.revertedWithCustomError(bosonErrors, RevertReasons.DISPUTE_HAS_EXPIRED);
          });

          it("Dispute is in some state other than resolving", async function () {
            // Retract the dispute, put it into RETRACTED state
            await disputeHandler.connect(buyer).retractDispute(exchangeId);

            // Attempt to escalate the dispute, expecting revert
            await expect(disputeHandler.connect(buyer).escalateDispute(exchangeId)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_STATE
            );
          });

          it("Dispute resolver is not specified (absolute zero offer)", async function () {
            // Create and absolute zero offer without DR
            // Prepare an absolute zero offer
            offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = "0";
            offer.id++;
            drParams.disputeResolverId = "0";

            // Create a new offer
            await offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, drParams, agentId, offerFeeLimit);

            // Commit to offer and put exchange all the way to dispute
            await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offer.id);
            await exchangeHandler.connect(buyer).redeemVoucher(++exchangeId);
            await disputeHandler.connect(buyer).raiseDispute(exchangeId);

            // Attempt to escalate the dispute, expecting revert
            await expect(disputeHandler.connect(buyer).escalateDispute(exchangeId)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.ESCALATION_NOT_ALLOWED
            );
          });

          it.skip("Insufficient native currency sent", async function () {
            // Attempt to escalate the dispute, expecting revert
            await expect(
              disputeHandler.connect(buyer).escalateDispute(exchangeId, {
                value: BigInt(buyerEscalationDepositNative) - 1n,
              })
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INSUFFICIENT_VALUE_RECEIVED);
          });

          it("Native currency sent together with ERC20 token transfer", async function () {
            await createDisputeExchangeWithToken();

            // Attempt to escalate the dispute, expecting revert
            await expect(
              disputeHandler.connect(buyer).escalateDispute(exchangeId, {
                value: 1n,
              })
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.NATIVE_NOT_ALLOWED);
          });

          it.skip("Token contract reverts for another reason", async function () {
            // prepare a disputed exchange
            const mockToken = await createDisputeExchangeWithToken();

            // get rid of some tokens, so buyer has insufficient funds
            await mockToken.connect(buyer).transfer(await other1.getAddress(), buyerEscalationDepositToken);

            // Attempt to commit to an offer, expecting revert
            await expect(disputeHandler.connect(buyer).escalateDispute(exchangeId)).to.revertedWith(
              RevertReasons.ERC20_EXCEEDS_BALANCE
            );

            // not approved
            await mockToken
              .connect(buyer)
              .approve(await protocolDiamond.getAddress(), BigInt(buyerEscalationDepositToken) - "1".toString());

            // Attempt to commit to an offer, expecting revert
            await expect(disputeHandler.connect(buyer).escalateDispute(exchangeId)).to.revertedWith(
              RevertReasons.ERC20_INSUFFICIENT_ALLOWANCE
            );
          });

          it.skip("Received ERC20 token amount differs from the expected value", async function () {
            // Deploy ERC20 with fees
            const [Foreign20WithFee] = await deployMockTokens(["Foreign20WithFee"]);

            // add to DR fees
            DRFeeToken = parseUnits("2", "ether").toString();
            await accountHandler
              .connect(adminDR)
              .addFeesToDisputeResolver(disputeResolverId, [
                new DisputeResolverFee(await Foreign20WithFee.getAddress(), "Foreign20WithFee", "0"),
              ]);

            // Create an offer with ERC20 with fees
            // Prepare an absolute zero offer
            offer.exchangeToken = await Foreign20WithFee.getAddress();
            offer.sellerDeposit = offer.price = offer.buyerCancelPenalty = "0";
            offer.id++;

            // Create a new offer
            await offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, {
                disputeResolverId: disputeResolverId,
                mutualizerAddress: ZeroAddress
              }, agentId, offerFeeLimit);

            // mint tokens and approve
            buyerEscalationDepositToken = applyPercentage(DRFeeToken, buyerEscalationDepositPercentage);
            await Foreign20WithFee.mint(await buyer.getAddress(), buyerEscalationDepositToken);
            await Foreign20WithFee.connect(buyer).approve(
              await protocolDiamond.getAddress(),
              buyerEscalationDepositToken
            );

            // Commit to offer and put exchange all the way to dispute
            await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offer.id);
            await exchangeHandler.connect(buyer).redeemVoucher(++exchangeId);
            await disputeHandler.connect(buyer).raiseDispute(exchangeId);

            // Attempt to escalate the dispute, expecting revert
            await expect(disputeHandler.connect(buyer).escalateDispute(exchangeId)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INSUFFICIENT_VALUE_RECEIVED
            );
          });
        });
      });

      context("👉 decideDispute()", async function () {
        beforeEach(async function () {
          // Raise a dispute
          tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Get the block timestamp of the confirmed tx and set disputedDate
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          disputedDate = block.timestamp.toString();

          // Escalate the dispute
          tx = await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

          // Get the block timestamp of the confirmed tx and set escalatedDate
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          escalatedDate = block.timestamp.toString();
          timeout = BigInt(escalatedDate) + BigInt(escalationPeriod);

          // buyer percent used in tests
          buyerPercentBasisPoints = "4321";
        });

        it("should emit a DisputeDecided event", async function () {
          // Escalate the dispute, testing for the event
          await expect(disputeHandler.connect(assistantDR).decideDispute(exchangeId, buyerPercentBasisPoints))
            .to.emit(disputeHandler, "DisputeDecided")
            .withArgs(exchangeId, buyerPercentBasisPoints, await assistantDR.getAddress());
        });

        it("should update state", async function () {
          // Decide the dispute
          tx = await disputeHandler.connect(assistantDR).decideDispute(exchangeId, buyerPercentBasisPoints);

          // Get the block timestamp of the confirmed tx and set finalizedDate
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          finalizedDate = block.timestamp.toString();

          dispute = new Dispute(exchangeId, DisputeState.Decided, buyerPercentBasisPoints);
          disputeDates = new DisputeDates(disputedDate, escalatedDate, finalizedDate, timeout);

          // Get the dispute as a struct
          [, disputeStruct, disputeDatesStruct] = await disputeHandler.connect(rando).getDispute(exchangeId);

          // Parse into entities
          let returnedDispute = Dispute.fromStruct(disputeStruct);
          const returnedDisputeDates = DisputeDates.fromStruct(disputeDatesStruct);

          // Returned values should match the expected dispute and dispute dates
          for (const [key, value] of Object.entries(dispute)) {
            expect(JSON.stringify(returnedDispute[key]) === JSON.stringify(value)).is.true;
          }
          for (const [key, value] of Object.entries(disputeDates)) {
            expect(JSON.stringify(returnedDisputeDates[key]) === JSON.stringify(value)).is.true;
          }

          // Get the dispute state
          [exists, response] = await disputeHandler.connect(rando).getDisputeState(exchangeId);

          // It should match DisputeState.Decided
          assert.equal(response, DisputeState.Decided, "Dispute state is incorrect");
        });

        context("💔 Revert Reasons", async function () {
          it("The disputes region of protocol is paused", async function () {
            // Pause the disputes region of the protocol
            await pauseHandler.connect(pauser).pause([PausableRegion.Disputes]);

            // Attempt to decide a dispute, expecting revert
            await expect(disputeHandler.connect(assistantDR).decideDispute(exchangeId, buyerPercentBasisPoints))
              .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
              .withArgs(PausableRegion.Disputes);
          });

          it("Specified buyer percent exceeds 100%", async function () {
            // Set buyer percent above 100%
            buyerPercentBasisPoints = "12000"; // 120%

            // Attempt to decide the dispute, expecting revert
            await expect(
              disputeHandler.connect(assistantDR).decideDispute(exchangeId, buyerPercentBasisPoints)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_BUYER_PERCENT);
          });

          it("Exchange does not exist", async function () {
            // An invalid exchange id
            const exchangeId = "666";

            // Attempt to decide the dispute, expecting revert
            await expect(
              disputeHandler.connect(assistantDR).decideDispute(exchangeId, buyerPercentBasisPoints)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_EXCHANGE);
          });

          it("Exchange is not in a disputed state", async function () {
            exchangeId++;

            // Commit to offer, creating a new exchange
            await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

            // Attempt to decide the dispute, expecting revert
            await expect(
              disputeHandler.connect(assistantDR).decideDispute(exchangeId, buyerPercentBasisPoints)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_STATE);
          });

          it("Caller is not the dispute resolver for this dispute", async function () {
            // Attempt to decide the dispute, expecting revert
            await expect(
              disputeHandler.connect(rando).decideDispute(exchangeId, buyerPercentBasisPoints)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_DISPUTE_RESOLVER_ASSISTANT);
          });

          it("Dispute state is not escalated", async function () {
            exchangeId++;

            // Commit to offer, creating a new exchange
            await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

            // Redeem voucher
            await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

            // Raise a dispute
            await disputeHandler.connect(buyer).raiseDispute(exchangeId);

            // Attempt to decide the dispute, expecting revert
            await expect(
              disputeHandler.connect(assistantDR).decideDispute(exchangeId, buyerPercentBasisPoints)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_STATE);
          });

          it("Dispute escalation response period has elapsed", async function () {
            // Set time past escalation period
            await setNextBlockTimestamp(Number(escalatedDate) + Number(escalationPeriod) + 1);

            // Attempt to decide the dispute, expecting revert
            await expect(
              disputeHandler.connect(assistantDR).decideDispute(exchangeId, buyerPercentBasisPoints)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.DISPUTE_HAS_EXPIRED);
          });
        });
      });

      context("👉 expireEscalatedDispute()", async function () {
        beforeEach(async function () {
          // Raise a dispute
          tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Get the block timestamp of the confirmed tx and set disputedDate
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          disputedDate = block.timestamp.toString();

          // Escalate the dispute
          tx = await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

          // Get the block timestamp of the confirmed tx and set escalatedDate
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          escalatedDate = block.timestamp.toString();
          timeout = BigInt(escalatedDate) + BigInt(escalationPeriod);
        });

        it("should emit a EscalatedDisputeExpired event", async function () {
          // Set time forward past the dispute escalation period
          await setNextBlockTimestamp(Number(escalatedDate) + Number(escalationPeriod) + 1);

          // Expire the escalated dispute, testing for the event
          await expect(disputeHandler.connect(rando).expireEscalatedDispute(exchangeId))
            .to.emit(disputeHandler, "EscalatedDisputeExpired")
            .withArgs(exchangeId, await rando.getAddress());
        });

        it("should update state", async function () {
          // Set time forward past the dispute escalation period
          await setNextBlockTimestamp(Number(escalatedDate) + Number(escalationPeriod) + 1);

          // Expire the dispute
          tx = await disputeHandler.connect(rando).expireEscalatedDispute(exchangeId);

          // Get the block timestamp of the confirmed tx and set finalizedDate
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          finalizedDate = block.timestamp.toString();

          dispute = new Dispute(exchangeId, DisputeState.Refused, buyerPercentBasisPoints);
          disputeDates = new DisputeDates(disputedDate, escalatedDate, finalizedDate, timeout);

          // Get the dispute as a struct
          [, disputeStruct, disputeDatesStruct] = await disputeHandler.connect(rando).getDispute(exchangeId);

          // Parse into entities
          returnedDispute = Dispute.fromStruct(disputeStruct);
          returnedDisputeDates = DisputeDates.fromStruct(disputeDatesStruct);

          // Returned values should match the expected dispute and dispute dates
          for (const [key, value] of Object.entries(dispute)) {
            expect(JSON.stringify(returnedDispute[key]) === JSON.stringify(value)).is.true;
          }
          for (const [key, value] of Object.entries(disputeDates)) {
            expect(JSON.stringify(returnedDisputeDates[key]) === JSON.stringify(value)).is.true;
          }

          // Get the dispute state
          [exists, response] = await disputeHandler.connect(rando).getDisputeState(exchangeId);

          // It should match DisputeState.Refused
          assert.equal(response, DisputeState.Refused, "Dispute state is incorrect");

          // exchange should also be finalized
          // Get the exchange as a struct
          [, exchangeStruct] = await exchangeHandler.connect(rando).getExchange(exchangeId);

          // Parse into entity
          let returnedExchange = Exchange.fromStruct(exchangeStruct);

          // FinalizeDate should be set correctly
          assert.equal(returnedExchange.finalizedDate, finalizedDate, "Exchange finalizeDate is incorect");
        });

        context("💔 Revert Reasons", async function () {
          it("The disputes region of protocol is paused", async function () {
            // Set time forward past the dispute escalation period
            await setNextBlockTimestamp(Number(escalatedDate) + Number(escalationPeriod) + 1);

            // Pause the disputes region of the protocol
            await pauseHandler.connect(pauser).pause([PausableRegion.Disputes]);

            // Attempt to expire an escalated dispute, expecting revert
            await expect(disputeHandler.connect(rando).expireEscalatedDispute(exchangeId))
              .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
              .withArgs(PausableRegion.Disputes);
          });

          it("Exchange does not exist", async function () {
            // An invalid exchange id
            const exchangeId = "666";

            // Attempt to expire the escalated dispute, expecting revert
            await expect(disputeHandler.connect(rando).expireEscalatedDispute(exchangeId)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.NO_SUCH_EXCHANGE
            );
          });

          it("Exchange is not in a disputed state", async function () {
            exchangeId++;

            // Commit to offer, creating a new exchange
            await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

            // Attempt to expire the escalated dispute, expecting revert
            await expect(disputeHandler.connect(rando).expireEscalatedDispute(exchangeId)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_STATE
            );
          });

          it("Dispute escalation period has not passed yet", async function () {
            // Attempt to expire the escalated dispute, expecting revert
            await expect(disputeHandler.connect(rando).expireEscalatedDispute(exchangeId)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.DISPUTE_STILL_VALID
            );
          });

          it("Dispute is in some state other than escalated", async function () {
            exchangeId++;

            // Commit to offer, creating a new exchange
            await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

            // Redeem voucher
            await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

            // Raise a dispute
            await disputeHandler.connect(buyer).raiseDispute(exchangeId);

            // dispute raised but not escalated
            // Attempt to expire the escalated dispute, expecting revert
            await expect(disputeHandler.connect(rando).expireEscalatedDispute(exchangeId)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_STATE
            );

            // Retract the dispute, put it into RETRACTED state
            await disputeHandler.connect(buyer).retractDispute(exchangeId);

            // Attempt to expire the retracted dispute, expecting revert
            await expect(disputeHandler.connect(rando).expireEscalatedDispute(exchangeId)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_STATE
            );
          });
        });
      });

      context("👉 refuseEscalatedDispute()", async function () {
        beforeEach(async function () {
          // Raise a dispute
          tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Get the block timestamp of the confirmed tx and set disputedDate
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          disputedDate = block.timestamp.toString();

          // Escalate the dispute
          tx = await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

          // Get the block timestamp of the confirmed tx and set escalatedDate
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          escalatedDate = block.timestamp.toString();
          timeout = BigInt(escalatedDate) + BigInt(escalationPeriod);
        });

        it("should emit a EscalatedDisputeRefused event", async function () {
          // Refuse the escalated dispute, testing for the event
          await expect(disputeHandler.connect(assistantDR).refuseEscalatedDispute(exchangeId))
            .to.emit(disputeHandler, "EscalatedDisputeRefused")
            .withArgs(exchangeId, await assistantDR.getAddress());
        });

        it("should update state", async function () {
          // Refuse the dispute
          tx = await disputeHandler.connect(assistantDR).refuseEscalatedDispute(exchangeId);

          // Get the block timestamp of the confirmed tx and set finalizedDate
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          finalizedDate = block.timestamp.toString();

          dispute = new Dispute(exchangeId, DisputeState.Refused, buyerPercentBasisPoints);
          disputeDates = new DisputeDates(disputedDate, escalatedDate, finalizedDate, timeout);

          // Get the dispute as a struct
          [, disputeStruct, disputeDatesStruct] = await disputeHandler.connect(rando).getDispute(exchangeId);

          // Parse into entities
          returnedDispute = Dispute.fromStruct(disputeStruct);
          returnedDisputeDates = DisputeDates.fromStruct(disputeDatesStruct);

          // Returned values should match the expected dispute and dispute dates
          for (const [key, value] of Object.entries(dispute)) {
            expect(JSON.stringify(returnedDispute[key]) === JSON.stringify(value)).is.true;
          }
          for (const [key, value] of Object.entries(disputeDates)) {
            expect(JSON.stringify(returnedDisputeDates[key]) === JSON.stringify(value)).is.true;
          }

          // Get the dispute state
          [exists, response] = await disputeHandler.connect(rando).getDisputeState(exchangeId);

          // It should match DisputeState.Refused
          assert.equal(response, DisputeState.Refused, "Dispute state is incorrect");

          // exchange should also be finalized
          // Get the exchange as a struct
          [, exchangeStruct] = await exchangeHandler.connect(rando).getExchange(exchangeId);

          // Parse into entity
          let returnedExchange = Exchange.fromStruct(exchangeStruct);

          // FinalizeDate should be set correctly
          assert.equal(returnedExchange.finalizedDate, finalizedDate, "Exchange finalizeDate is incorect");
        });

        context("💔 Revert Reasons", async function () {
          it("The disputes region of protocol is paused", async function () {
            // Pause the disputes region of the protocol
            await pauseHandler.connect(pauser).pause([PausableRegion.Disputes]);

            // Attempt to refuse an escalated dispute, expecting revert
            await expect(disputeHandler.connect(assistantDR).refuseEscalatedDispute(exchangeId))
              .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
              .withArgs(PausableRegion.Disputes);
          });

          it("Exchange does not exist", async function () {
            // An invalid exchange id
            const exchangeId = "666";

            // Attempt to refuse the escalated dispute, expecting revert
            await expect(
              disputeHandler.connect(assistantDR).refuseEscalatedDispute(exchangeId)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_EXCHANGE);
          });

          it("Exchange is not in a disputed state", async function () {
            exchangeId++;

            // Commit to offer, creating a new exchange
            await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

            // Attempt to refuse the escalated dispute, expecting revert
            await expect(
              disputeHandler.connect(assistantDR).refuseEscalatedDispute(exchangeId)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_STATE);
          });

          it("Dispute is in some state other than escalated", async function () {
            exchangeId++;

            // Commit to offer, creating a new exchange
            await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

            // Redeem voucher
            await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

            // Raise a dispute
            await disputeHandler.connect(buyer).raiseDispute(exchangeId);

            // dispute raised but not escalated
            // Attempt to refuse the escalated dispute, expecting revert
            await expect(
              disputeHandler.connect(assistantDR).refuseEscalatedDispute(exchangeId)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_STATE);

            // Retract the dispute, put it into RETRACTED state
            await disputeHandler.connect(buyer).retractDispute(exchangeId);

            // Attempt to refuse the retracted dispute, expecting revert
            await expect(
              disputeHandler.connect(assistantDR).refuseEscalatedDispute(exchangeId)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_STATE);
          });

          it("Dispute escalation response period has elapsed", async function () {
            // Set time forward past the dispute escalation period
            await setNextBlockTimestamp(Number(escalatedDate) + Number(escalationPeriod) + 1);

            // Attempt to refuse the escalated dispute, expecting revert
            await expect(
              disputeHandler.connect(assistantDR).refuseEscalatedDispute(exchangeId)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.DISPUTE_HAS_EXPIRED);
          });

          it("Caller is not the dispute resolver for this dispute", async function () {
            // Attempt to refuse the escalated dispute, expecting revert
            await expect(disputeHandler.connect(rando).refuseEscalatedDispute(exchangeId)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.NOT_DISPUTE_RESOLVER_ASSISTANT
            );
          });
        });
      });

      context("👉 getDispute()", async function () {
        beforeEach(async function () {
          // Raise a dispute
          tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Get the block timestamp of the confirmed tx
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          disputedDate = block.timestamp.toString();
          timeout = BigInt(disputedDate) + BigInt(resolutionPeriod);

          // Expected value for dispute
          dispute = new Dispute(exchangeId, DisputeState.Resolving, buyerPercentBasisPoints);
          disputeDates = new DisputeDates(disputedDate, "0", "0", timeout);
        });

        it("should return true for exists if exchange id is valid", async function () {
          // Get the dispute
          [exists, response] = await disputeHandler.connect(rando).getDispute(exchangeId);

          // Test existence flag
          expect(exists).to.be.true;
        });

        it("should return false for exists if exchange id is not valid", async function () {
          // Get the dispute
          [exists, response] = await disputeHandler.connect(rando).getDispute(exchangeId + 10);

          // Test existence flag
          expect(exists).to.be.false;
        });

        it("should return the expected dispute if exchange id is valid", async function () {
          // Get the exchange
          [exists, disputeStruct, disputeDatesStruct] = await disputeHandler.connect(rando).getDispute(exchangeId);

          // It should match the expected dispute struct
          assert.equal(dispute.toString(), Dispute.fromStruct(disputeStruct).toString(), "Dispute struct is incorrect");

          // It should match the expected dispute dates struct
          assert.equal(
            disputeDates.toString(),
            DisputeDates.fromStruct(disputeDatesStruct).toString(),
            "Dispute dates are incorrect"
          );
        });

        it("should return false for exists if exchange id is valid, but dispute was not raised", async function () {
          exchangeId++;

          // Commit to offer, creating a new exchange
          await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

          // Get the exchange
          [exists, response] = await exchangeHandler.connect(rando).getExchange(exchangeId);

          // Test existence flag
          expect(exists).to.be.true;

          // Get the dispute
          [exists, disputeStruct, disputeDatesStruct] = await disputeHandler.connect(rando).getDispute(exchangeId);

          // Test existence flag
          expect(exists).to.be.false;

          // dispute struct and dispute dates should contain the default values
          // expected values
          dispute = new Dispute("0", 0, "0");
          disputeDates = new DisputeDates("0", "0", "0", "0");

          // Parse into entity
          returnedDispute = Dispute.fromStruct(disputeStruct);
          returnedDisputeDates = DisputeDates.fromStruct(disputeDatesStruct);

          // Returned values should match expected dispute data
          for (const [key, value] of Object.entries(dispute)) {
            expect(JSON.stringify(returnedDispute[key]) === JSON.stringify(value)).is.true;
          }

          // Returned values should match expected dispute dates data
          for (const [key, value] of Object.entries(disputeDates)) {
            expect(JSON.stringify(returnedDisputeDates[key]) === JSON.stringify(value)).is.true;
          }
        });
      });

      context("👉 getDisputeState()", async function () {
        beforeEach(async function () {
          // Raise a dispute
          tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Get the block timestamp of the confirmed tx and set disputedDate
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          disputedDate = block.timestamp.toString();
          timeout = (BigInt(disputedDate) + BigInt(resolutionPeriod)).toString();
        });

        it("should return true for exists if exchange id is valid", async function () {
          // Get the dispute state
          [exists, response] = await disputeHandler.connect(rando).getDisputeState(exchangeId);

          // Test existence flag
          expect(exists).to.be.true;
        });

        it("should return false for exists if exchange id is not valid", async function () {
          // Attempt to get the dispute state for invalid dispute
          [exists, response] = await disputeHandler.connect(rando).getDisputeState(exchangeId + 10);

          // Test existence flag
          expect(exists).to.be.false;
        });

        it("should return the expected dispute state if exchange id is valid and disupte has been raised", async function () {
          // Get the dispute state
          [exists, response] = await disputeHandler.connect(rando).getDisputeState(exchangeId);

          // It should match DisputeState.Resolving
          assert.equal(response, DisputeState.Resolving, "Dispute state is incorrect");
        });

        it("should return the expected dispute state if exchange id is valid and dispute has been retracted", async function () {
          // Buyer retracts dispute
          await disputeHandler.connect(buyer).retractDispute(exchangeId);

          // Get the dispute state
          [exists, response] = await disputeHandler.connect(rando).getDisputeState(exchangeId);

          // It should match DisputeState.Retracted
          assert.equal(response, DisputeState.Retracted, "Dispute state is incorrect");
        });

        it("should return the expected dispute state if exchange id is valid and dispute has expired", async function () {
          // Set time forward to the dispute's timeout
          await setNextBlockTimestamp(Number(timeout) + 1);

          // Anyone calls expireDispute
          await disputeHandler.connect(rando).expireDispute(exchangeId);

          // Get the dispute state
          [exists, response] = await disputeHandler.connect(rando).getDisputeState(exchangeId);

          // It should match DisputeState.Retracted
          assert.equal(response, DisputeState.Retracted, "Dispute state is incorrect");
        });

        it("should return the expected dispute state if exchange id is valid and dispute has been resolved", async function () {
          // Get the block timestamp of the confirmed tx and set disputedDate
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          disputedDate = block.timestamp.toString();
          timeout = (BigInt(disputedDate) + BigInt(resolutionPeriod)).toString();

          buyerPercentBasisPoints = "1234";

          // Set the message Type, needed for signature
          resolutionType = [
            { name: "exchangeId", type: "uint256" },
            { name: "buyerPercentBasisPoints", type: "uint256" },
          ];

          customSignatureType = {
            Resolution: resolutionType,
          };

          message = {
            exchangeId: exchangeId,
            buyerPercentBasisPoints,
          };

          // Collect the signature components
          ({ r, s, v } = await prepareDataSignatureParameters(
            assistant, // When buyer is the caller, seller should be the signer.
            customSignatureType,
            "Resolution",
            message,
            await disputeHandler.getAddress()
          ));

          // Buyer resolves dispute
          await disputeHandler.connect(buyer).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v);

          // Get the dispute state
          [exists, response] = await disputeHandler.connect(rando).getDisputeState(exchangeId);

          // It should match DisputeState.Resolved
          assert.equal(response, DisputeState.Resolved, "Dispute state is incorrect");
        });

        it("should return the expected dispute state if exchange id is valid and dispute been escalated", async function () {
          // Buyer escalates dispute
          await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

          // Get the dispute state
          [exists, response] = await disputeHandler.connect(rando).getDisputeState(exchangeId);

          // It should match DisputeState.Escalated
          assert.equal(response, DisputeState.Escalated, "Dispute state is incorrect");
        });

        it("should return the expected dispute state if exchange id is valid and dispute been decided", async function () {
          // Buyer escalates dispute
          tx = await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

          // Get the block timestamp of the confirmed tx and set escalatedDate
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          escalatedDate = block.timestamp.toString();
          timeout = (BigInt(escalatedDate) + BigInt(escalationPeriod)).toString();

          // buyer percent used in tests
          buyerPercentBasisPoints = "4321";

          // Decide dispute
          await disputeHandler.connect(assistantDR).decideDispute(exchangeId, buyerPercentBasisPoints);

          // Get the dispute state
          [exists, response] = await disputeHandler.connect(rando).getDisputeState(exchangeId);

          // It should match DisputeState.Decided
          assert.equal(response, DisputeState.Decided, "Dispute state is incorrect");
        });

        it("should return the expected dispute state if exchange id is valid and dispute been refused", async function () {
          // Buyer escalates dispute
          tx = await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

          // Dispute resolver refuses dispute
          await disputeHandler.connect(assistantDR).refuseEscalatedDispute(exchangeId);

          // Get the dispute state
          [exists, response] = await disputeHandler.connect(rando).getDisputeState(exchangeId);

          // It should match DisputeState.Refused
          assert.equal(response, DisputeState.Refused, "Dispute state is incorrect");
        });
      });

      context("👉 getDisputeTimeout()", async function () {
        beforeEach(async function () {
          // Raise a dispute
          tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Get the block timestamp of the confirmed tx and set disputedDate
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          disputedDate = block.timestamp.toString();
          timeout = BigInt(disputedDate) + BigInt(resolutionPeriod);
        });

        it("should return true for exists if exchange id is valid", async function () {
          // Get the dispute state
          [exists, response] = await disputeHandler.connect(rando).getDisputeTimeout(exchangeId);

          // Test existence flag
          expect(exists).to.be.true;
        });

        it("should return false for exists if exchange id is not valid", async function () {
          // Attempt to get the dispute state for invalid dispute
          [exists, response] = await disputeHandler.connect(rando).getDisputeTimeout(exchangeId + 10);

          // Test existence flag
          expect(exists).to.be.false;
        });

        it("should return the expected dispute timeout if exchange id is valid", async function () {
          // Get the dispute timeout
          [exists, response] = await disputeHandler.connect(rando).getDisputeTimeout(exchangeId);

          // It should match the expected timeout
          assert.equal(response, timeout, "Dispute timeout is incorrect");
        });
      });

      context("👉 isDisputeFinalized()", async function () {
        it("should return false if exchange is not disputed", async function () {
          // Dispute not raised, ask if dispute is finalized
          [exists, response] = await disputeHandler.connect(rando).isDisputeFinalized(exchangeId);

          // It should not be finalized
          assert.equal(exists, false, "Incorrectly reports existence");
          assert.equal(response, false, "Incorrectly reports finalized state");
        });

        it("should return false if exchange does not exist", async function () {
          // Exchange does not exist, ask if dispute is finalized
          [exists, response] = await disputeHandler.connect(rando).isDisputeFinalized(exchangeId + 10);

          // It should not be finalized
          assert.equal(exists, false, "Incorrectly reports existence");
          assert.equal(response, false, "Incorrectly reports finalized state");
        });

        context("disputed exchange", async function () {
          beforeEach(async function () {
            // Raise a dispute
            await disputeHandler.connect(buyer).raiseDispute(exchangeId);
          });

          it("should return false if dispute is in Resolving state", async function () {
            // Dispute in resolving state, ask if exchange is finalized
            [exists, response] = await disputeHandler.connect(rando).isDisputeFinalized(exchangeId);

            // It should exist, but not be finalized
            assert.equal(exists, true, "Incorrectly reports existence");
            assert.equal(response, false, "Incorrectly reports finalized state");
          });

          it("should return true if dispute is in Retracted state", async function () {
            // Retract dispute
            await disputeHandler.connect(buyer).retractDispute(exchangeId);

            // Dispute in retracted state, ask if exchange is finalized
            [exists, response] = await disputeHandler.connect(rando).isDisputeFinalized(exchangeId);

            // It should exist and be finalized
            assert.equal(exists, true, "Incorrectly reports existence");
            assert.equal(response, true, "Incorrectly reports unfinalized state");
          });

          it("should return true if dispute is in Resolved state", async function () {
            buyerPercentBasisPoints = "1234";

            // Set the message Type, needed for signature
            resolutionType = [
              { name: "exchangeId", type: "uint256" },
              { name: "buyerPercentBasisPoints", type: "uint256" },
            ];

            customSignatureType = {
              Resolution: resolutionType,
            };

            message = {
              exchangeId: exchangeId,
              buyerPercentBasisPoints,
            };

            // Collect the signature components
            ({ r, s, v } = await prepareDataSignatureParameters(
              buyer, // When seller is the caller, buyer should be the signer.
              customSignatureType,
              "Resolution",
              message,
              await disputeHandler.getAddress()
            ));

            // Retract dispute
            await disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v);

            // Dispute in resolved state, ask if exchange is finalized
            [exists, response] = await disputeHandler.connect(rando).isDisputeFinalized(exchangeId);

            // It should exist and be finalized
            assert.equal(exists, true, "Incorrectly reports existence");
            assert.equal(response, true, "Incorrectly reports unfinalized state");
          });

          it("should return true if dispute is in Decided state", async function () {
            buyerPercentBasisPoints = "1234";

            // Escalate dispute
            await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

            // Decide dispute
            await disputeHandler.connect(assistantDR).decideDispute(exchangeId, buyerPercentBasisPoints);

            // Dispute in decided state, ask if exchange is finalized
            [exists, response] = await disputeHandler.connect(rando).isDisputeFinalized(exchangeId);

            // It should exist and be finalized
            assert.equal(exists, true, "Incorrectly reports existence");
            assert.equal(response, true, "Incorrectly reports unfinalized state");
          });

          it("should return true if dispute is in Refused state", async function () {
            // Escalate the dispute
            tx = await disputeHandler
              .connect(buyer)
              .escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

            // Get the block timestamp of the confirmed tx and set escalatedDate
            blockNumber = tx.blockNumber;
            block = await provider.getBlock(blockNumber);
            escalatedDate = block.timestamp.toString();

            await setNextBlockTimestamp(Number(escalatedDate) + Number(escalationPeriod) + 1);

            // Expire dispute
            await disputeHandler.connect(rando).expireEscalatedDispute(exchangeId);

            // Dispute in decided state, ask if exchange is finalized
            [exists, response] = await disputeHandler.connect(rando).isDisputeFinalized(exchangeId);

            // It should exist and be finalized
            assert.equal(exists, true, "Incorrectly reports existence");
            assert.equal(response, true, "Incorrectly reports unfinalized state");
          });
        });
      });
    });

    context("Batch", async function () {
      beforeEach(async function () {
        // Set time forward to the offer's voucherRedeemableFrom
        await setNextBlockTimestamp(Number(voucherRedeemableFrom));

        for (exchangeId = 1; exchangeId <= 5; exchangeId++) {
          // Commit to offer, creating a new exchange
          await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

          // Redeem voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);
        }
      });

      context("👉 expireDisputeBatch()", async function () {
        beforeEach(async function () {
          // Set the buyer percent
          buyerPercentBasisPoints = "0";

          disputesToExpire = ["2", "3", "4"];
          dispute = {};
          disputeDates = {};

          for (exchangeId of disputesToExpire) {
            // Raise a dispute for exchanges 2,3 and 4
            tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

            // Get the block timestamp of the confirmed tx and set disputedDate
            blockNumber = tx.blockNumber;
            block = await provider.getBlock(blockNumber);
            disputedDate = block.timestamp;
            timeout = BigInt(disputedDate) + BigInt(resolutionPeriod);

            dispute[exchangeId] = new Dispute(exchangeId, DisputeState.Retracted, buyerPercentBasisPoints);
            disputeDates[exchangeId] = new DisputeDates(disputedDate, "0", finalizedDate, timeout);
          }
        });

        it("should emit a DisputeExpired event for all events", async function () {
          // Set time forward past the dispute resolution period
          await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

          // Expire the disputes, testing for the event
          const tx = disputeHandler.connect(rando).expireDisputeBatch(disputesToExpire);
          await expect(tx)
            .to.emit(disputeHandler, "DisputeExpired")
            .withArgs("2", await rando.getAddress());

          await expect(tx)
            .to.emit(disputeHandler, "DisputeExpired")
            .withArgs("3", await rando.getAddress());

          await expect(tx)
            .to.emit(disputeHandler, "DisputeExpired")
            .withArgs("4", await rando.getAddress());
        });

        it("should update state", async function () {
          // Set time forward past the dispute resolution period
          await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

          // Expire the dispute
          tx = await disputeHandler.connect(rando).expireDisputeBatch(disputesToExpire);

          // Get the block timestamp of the confirmed tx and set finalizedDate
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          finalizedDate = block.timestamp.toString();

          // verify that state for all disputes was updated
          for (exchangeId of disputesToExpire) {
            disputeDates[exchangeId].finalized = finalizedDate;

            // Get the dispute as a struct
            [, disputeStruct, disputeDatesStruct] = await disputeHandler.connect(rando).getDispute(exchangeId);

            // Parse into entities
            returnedDispute = Dispute.fromStruct(disputeStruct);
            returnedDisputeDates = DisputeDates.fromStruct(disputeDatesStruct);

            // Returned values should match the expected dispute and dispute dates
            for (const [key, value] of Object.entries(dispute[exchangeId])) {
              expect(JSON.stringify(returnedDispute[key]) === JSON.stringify(value)).is.true;
            }
            for (const [key, value] of Object.entries(disputeDates[exchangeId])) {
              expect(JSON.stringify(returnedDisputeDates[key]) === JSON.stringify(value)).is.true;
            }

            // Get the dispute state
            [exists, response] = await disputeHandler.connect(rando).getDisputeState(exchangeId);

            // It should match DisputeState.Retracted
            assert.equal(response, DisputeState.Retracted, "Dispute state is incorrect");

            // exchange should also be finalized
            // Get the exchange as a struct
            [, exchangeStruct] = await exchangeHandler.connect(rando).getExchange(exchangeId);

            // Parse into entity
            let returnedExchange = Exchange.fromStruct(exchangeStruct);

            // FinalizeDate should be set correctly
            assert.equal(returnedExchange.finalizedDate, finalizedDate, "Exchange finalizeDate is incorect");
          }
        });

        context("💔 Revert Reasons", async function () {
          it("The disputes region of protocol is paused", async function () {
            // Set time forward past the dispute resolution period
            await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

            // Pause the disputes region of the protocol
            await pauseHandler.connect(pauser).pause([PausableRegion.Disputes]);

            // Attempt to expire a dispute batch, expecting revert
            await expect(disputeHandler.connect(rando).expireDisputeBatch(disputesToExpire))
              .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
              .withArgs(PausableRegion.Disputes);
          });

          it("Exchange does not exist", async function () {
            await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

            // Add an invalid exchange id
            disputesToExpire.push("666");

            // Attempt to expire the disputes, expecting revert
            await expect(disputeHandler.connect(rando).expireDisputeBatch(disputesToExpire)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.NO_SUCH_EXCHANGE
            );
          });

          it("Exchange is not in a disputed state", async function () {
            await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

            // add exchange that is not disputed
            disputesToExpire.push("1");

            // Attempt to expire the disputes, expecting revert
            await expect(disputeHandler.connect(rando).expireDisputeBatch(disputesToExpire)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_STATE
            );
          });

          it("Dispute has not expired yet", async function () {
            // Attempt to expire the disputes, expecting revert
            await expect(disputeHandler.connect(rando).expireDisputeBatch(disputesToExpire)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.DISPUTE_STILL_VALID
            );
          });

          it("Dispute is in some state other than resolving", async function () {
            await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

            // Retract the dispute, put it into RETRACTED state
            await disputeHandler.connect(buyer).retractDispute("3");

            // Attempt to expire the disputes, expecting revert
            await expect(disputeHandler.connect(rando).expireDisputeBatch(disputesToExpire)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_STATE
            );
          });
        });
      });
    });
  });

  // Internal functions, tested with TestDisputeHandlerFacet
  context("📋 Internal Dispute Handler Methods", async function () {
    let testDisputeHandler;
    beforeEach(async function () {
      // Deploy test facet and cut the test functions
      const TestDisputeHandlerFacet = await ethers.getContractFactory("TestDisputeHandlerFacet");
      const testDisputeHandlerFacet = await TestDisputeHandlerFacet.deploy();
      await testDisputeHandlerFacet.waitForDeployment();

      const protocolDiamondAddress = await disputeHandler.getAddress();
      const cutFacetViaDiamond = await getContractAt("DiamondCutFacet", protocolDiamondAddress);

      // Define the facet cut
      const facetCuts = [
        {
          facetAddress: await testDisputeHandlerFacet.getAddress(),
          action: FacetCutAction.Add,
          functionSelectors: [id("finalizeDispute(uint256,uint8)").slice(0, 10)],
        },
      ];

      // Send the DiamondCut transaction
      await cutFacetViaDiamond.diamondCut(facetCuts, ZeroAddress, "0x");

      testDisputeHandler = await getContractAt("TestDisputeHandlerFacet", protocolDiamondAddress);
    });

    context("👉 finalizeDispute()", async function () {
      const invalidFinalStates = ["Resolving", "Escalated"];

      invalidFinalStates.forEach((finalState) => {
        it(`final state is ${finalState}`, async function () {
          const exchangeId = 1;

          await expect(
            testDisputeHandler.finalizeDispute(exchangeId, DisputeState[finalState])
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_TARGET_DISPUTE_STATE);
        });
      });
    });
  });
});
