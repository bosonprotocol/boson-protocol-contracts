const { ethers } = require("hardhat");
const { ZeroAddress, getContractAt, getContractFactory, provider, parseUnits, getSigners, MaxUint256 } = ethers;
const { expect, assert } = require("chai");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const {
  mockOffer,
  mockDisputeResolver,
  mockAuthToken,
  mockVoucherInitValues,
  mockSeller,
  mockVoucher,
  mockExchange,
  accountId,
} = require("../util/mock");
const {
  setNextBlockTimestamp,
  calculateVoucherExpiry,
  prepareDataSignatureParameters,
  applyPercentage,
  setupTestEnvironment,
  getSnapshot,
  revertToSnapshot,
} = require("../util/utils.js");
const { oneWeek, oneMonth } = require("../util/constants");
const { getSelectors, FacetCutAction } = require("../../scripts/util/diamond-utils.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");

/**
 *  Integration test case - After Exchange handler facet upgrade, everything is still operational
 */
describe("[@skip-on-coverage] After facet upgrade, everything is still operational", function () {
  // Common vars
  let deployer, assistant, admin, clerk, treasury, rando, buyer, assistantDR, adminDR, clerkDR, treasuryDR;
  let accountHandler, exchangeHandler, offerHandler, fundsHandler, disputeHandler, mockExchangeHandlerUpgrade;
  let buyerId, offerId, seller, disputeResolverId;
  let price, sellerPool;
  let voucherRedeemableFrom;
  let voucherValid;
  let buyerEscalationDepositPercentage;
  let voucher;
  let exchange;
  let disputeResolver;
  let agentId;
  let exchangeId;
  let offer, offerToken;
  let offerDates, offerDurations, escalationPeriod, resolutionPeriod;
  let mockToken;
  let buyerEscalationDepositNative, sellerDeposit, buyerPercentBasisPoints;
  let customSignatureType, message;
  let protocolDiamondAddress;
  let snapshotId;
  let offerFeeLimit;
  let bosonErrors;

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
      signers: [admin, treasury, buyer, rando, adminDR, treasuryDR],
      contractInstances: { accountHandler, offerHandler, exchangeHandler, fundsHandler, disputeHandler },
      protocolConfig: [, , , ,buyerEscalationDepositPercentage],
      diamondAddress: protocolDiamondAddress,
    } = await setupTestEnvironment(contracts));

    bosonErrors = await getContractAt("BosonErrors", protocolDiamondAddress);

    // make all account the same
    assistant = admin;
    assistantDR = adminDR;
    clerk = clerkDR = { address: ZeroAddress };
    [deployer] = await getSigners();

    // Initial ids for all the things
    exchangeId = offerId = "1";
    agentId = "0"; // agent id is optional while creating an offer
    offerFeeLimit = MaxUint256;

    // Get snapshot id
    snapshotId = await getSnapshot();
  });

  beforeEach(async function () {
    // Create a valid seller, then set fields in tests directly
    seller = mockSeller(
      await assistant.getAddress(),
      await admin.getAddress(),
      clerk.address,
      await treasury.getAddress()
    );
    expect(seller.isValid()).is.true;

    // VoucherInitValues
    const voucherInitValues = mockVoucherInitValues();
    expect(voucherInitValues.isValid()).is.true;

    // AuthToken
    const emptyAuthToken = mockAuthToken();
    expect(emptyAuthToken.isValid()).is.true;

    await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

    [mockToken] = await deployMockTokens(["Foreign20"]);

    // top up assistants account
    await mockToken.mint(await assistant.getAddress(), "1000000");

    // approve protocol to transfer the tokens
    await mockToken.connect(assistant).approve(protocolDiamondAddress, "1000000");
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();
  });

  async function upgradeExchangeHandlerFacet(mockFacet) {
    // Upgrade the Exchange Handler Facet functions
    // DiamondCutFacet
    const cutFacetViaDiamond = await getContractAt("DiamondCutFacet", protocolDiamondAddress);

    // Deploy MockExchangeHandlerFacet
    const MockExchangeHandlerFacet = await getContractFactory(mockFacet);
    const mockExchangeHandlerFacet = await MockExchangeHandlerFacet.deploy();
    await mockExchangeHandlerFacet.waitForDeployment();

    // Define the facet cut
    const facetCuts = [
      {
        facetAddress: await mockExchangeHandlerFacet.getAddress(),
        action: FacetCutAction.Replace,
        functionSelectors: getSelectors(mockExchangeHandlerFacet),
      },
    ];

    // Send the DiamondCut transaction
    const tx = await cutFacetViaDiamond.connect(deployer).diamondCut(facetCuts, ZeroAddress, "0x");

    // Wait for transaction to confirm
    const receipt = await tx.wait();

    // Be certain transaction was successful
    assert.equal(receipt.status, 1, `Diamond upgrade failed: ${tx.hash}`);

    // Cast Diamond to the mock exchange handler facet.
    mockExchangeHandlerUpgrade = await getContractAt(mockFacet, protocolDiamondAddress);
  }

  // Exchange methods
  context("📋 Exchange Handler Methods", async function () {
    beforeEach(async function () {
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
      const disputeResolverFees = [new DisputeResolverFee(ZeroAddress, "Native", "0")];

      // Make empty seller list, so every seller is allowed
      const sellerAllowList = [];

      // Register the dispute resolver
      await accountHandler
        .connect(adminDR)
        .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

      // Create the offer
      const mo = await mockOffer();
      ({ offerDates, offerDurations } = mo);
      offer = mo.offer;
      offer.quantityAvailable = "10";
      disputeResolverId = mo.disputeResolverId;

      // Check if domains are valid
      expect(offer.isValid()).is.true;
      expect(offerDates.isValid()).is.true;
      expect(offerDurations.isValid()).is.true;

      // Create the offer
      await offerHandler
        .connect(assistant)
        .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId, offerFeeLimit);

      // Set used variables
      price = offer.price;
      voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
      voucherValid = offerDurations.voucherValid;
      sellerPool = parseUnits("15", "ether").toString();

      // Required voucher constructor params
      voucher = mockVoucher();
      voucher.redeemedDate = "0";

      // Mock exchange
      exchange = mockExchange();

      buyerId = accountId.next().value;
      exchange.buyerId = buyerId;
      exchange.finalizedDate = "0";

      // Deposit seller funds so the commit will succeed
      await fundsHandler.connect(assistant).depositFunds(seller.id, ZeroAddress, sellerPool, { value: sellerPool });
    });

    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    context("👉 completeExchange()", async function () {
      beforeEach(async function () {
        // Commit to offer
        await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

        // Upgrade Exchange handler facet
        await upgradeExchangeHandlerFacet("MockExchangeHandlerFacet");
      });

      it("should emit an ExchangeCompleted2 event when buyer calls", async function () {
        // Set time forward to the offer's voucherRedeemableFrom
        await setNextBlockTimestamp(Number(voucherRedeemableFrom));

        // Redeem the voucher
        await mockExchangeHandlerUpgrade.connect(buyer).redeemVoucher(exchange.id);

        // Complete the exchange, expecting event
        await expect(mockExchangeHandlerUpgrade.connect(buyer).completeExchange(exchange.id))
          .to.emit(mockExchangeHandlerUpgrade, "ExchangeCompleted2")
          .withArgs(offerId, buyerId, exchange.id, await buyer.getAddress());
      });
    });

    context("👉 completeExchangeBatch()", async function () {
      it("should emit a ExchangeCompleted2 event for all events", async function () {
        // Set time forward to the offer's voucherRedeemableFrom
        await setNextBlockTimestamp(Number(voucherRedeemableFrom));

        for (exchangeId = 1; exchangeId <= 5; exchangeId++) {
          // Commit to offer, creating a new exchange
          await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });
        }

        // Upgrade Exchange handler facet
        await upgradeExchangeHandlerFacet("MockExchangeHandlerFacet");

        for (exchangeId = 1; exchangeId <= 5; exchangeId++) {
          // Redeem voucher
          await mockExchangeHandlerUpgrade.connect(buyer).redeemVoucher(exchangeId);
        }

        const exchangesToComplete = ["1", "2", "3", "4", "5"];

        // Complete the exchange, expecting event
        const tx = await mockExchangeHandlerUpgrade.connect(buyer).completeExchangeBatch(exchangesToComplete);
        await expect(tx)
          .to.emit(mockExchangeHandlerUpgrade, "ExchangeCompleted2")
          .withArgs(offerId, buyerId, exchangesToComplete[0], await buyer.getAddress());

        await expect(tx)
          .to.emit(mockExchangeHandlerUpgrade, "ExchangeCompleted2")
          .withArgs(offerId, buyerId, exchangesToComplete[1], await buyer.getAddress());

        await expect(tx)
          .to.emit(mockExchangeHandlerUpgrade, "ExchangeCompleted2")
          .withArgs(offerId, buyerId, exchangesToComplete[2], await buyer.getAddress());

        await expect(tx)
          .to.emit(mockExchangeHandlerUpgrade, "ExchangeCompleted2")
          .withArgs(offerId, buyerId, exchangesToComplete[3], await buyer.getAddress());

        await expect(tx)
          .to.emit(mockExchangeHandlerUpgrade, "ExchangeCompleted2")
          .withArgs(offerId, buyerId, exchangesToComplete[4], await buyer.getAddress());
      });
    });

    context("👉 revokeVoucher()", async function () {
      it("should emit an VoucherRevoked2 event when seller's assistant calls", async function () {
        // Commit to offer
        await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

        // Upgrade Exchange handler facet
        await upgradeExchangeHandlerFacet("MockExchangeHandlerFacet");

        // Revoke the voucher, expecting event
        await expect(mockExchangeHandlerUpgrade.connect(assistant).revokeVoucher(exchange.id))
          .to.emit(mockExchangeHandlerUpgrade, "VoucherRevoked2")
          .withArgs(offerId, exchange.id, await assistant.getAddress());
      });
    });

    context("👉 cancelVoucher()", async function () {
      it("should emit an VoucherCanceled2 event when original buyer calls", async function () {
        // Commit to offer, retrieving the event
        await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

        // Upgrade Exchange handler facet
        await upgradeExchangeHandlerFacet("MockExchangeHandlerFacet");

        // Cancel the voucher, expecting event
        await expect(mockExchangeHandlerUpgrade.connect(buyer).cancelVoucher(exchange.id))
          .to.emit(mockExchangeHandlerUpgrade, "VoucherCanceled2")
          .withArgs(offerId, exchange.id, await buyer.getAddress());
      });
    });

    context("👉 expireVoucher()", async function () {
      it("should emit an VoucherExpired2 event when anyone calls and voucher has expired", async function () {
        // Commit to offer, retrieving the event
        await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

        // Upgrade Exchange handler facet
        await upgradeExchangeHandlerFacet("MockExchangeHandlerFacet");

        // Set time forward past the voucher's validUntilDate
        await setNextBlockTimestamp(Number(voucherRedeemableFrom) + Number(voucherValid) + Number(oneWeek));

        // Expire the voucher, expecting event
        await expect(mockExchangeHandlerUpgrade.connect(rando).expireVoucher(exchange.id))
          .to.emit(mockExchangeHandlerUpgrade, "VoucherExpired2")
          .withArgs(offerId, exchange.id, await rando.getAddress());
      });
    });

    context("👉 redeemVoucher()", async function () {
      it("should emit a VoucherRedeemed2 event when buyer calls", async function () {
        // Commit to offer
        await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

        // Upgrade Exchange handler facet
        await upgradeExchangeHandlerFacet("MockExchangeHandlerFacet");

        // Set time forward to the offer's voucherRedeemableFrom
        await setNextBlockTimestamp(Number(voucherRedeemableFrom));

        // Redeem the voucher, expecting event
        await expect(mockExchangeHandlerUpgrade.connect(buyer).redeemVoucher(exchange.id))
          .to.emit(mockExchangeHandlerUpgrade, "VoucherRedeemed2")
          .withArgs(offerId, exchange.id, await buyer.getAddress());
      });
    });

    context("👉 extendVoucher()", async function () {
      it("should emit an VoucherExtended2 event when seller's assistant calls", async function () {
        // Commit to offer
        const tx = await exchangeHandler
          .connect(buyer)
          .commitToOffer(await buyer.getAddress(), offerId, { value: price });

        // Get the block timestamp of the confirmed tx
        const blockNumber = tx.blockNumber;
        const block = await provider.getBlock(blockNumber);

        // Update the committed date in the expected exchange struct with the block timestamp of the tx
        voucher.committedDate = block.timestamp.toString();

        // Update the validUntilDate date in the expected exchange struct
        voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

        // New expiry date for extensions
        const validUntilDate = BigInt(voucher.validUntilDate) + oneMonth.toString();

        // Upgrade Exchange handler facet
        await upgradeExchangeHandlerFacet("MockExchangeHandlerFacet");

        // Extend the voucher, expecting event
        await expect(mockExchangeHandlerUpgrade.connect(assistant).extendVoucher(exchange.id, validUntilDate))
          .to.emit(mockExchangeHandlerUpgrade, "VoucherExtended2")
          .withArgs(offerId, exchange.id, validUntilDate, await assistant.getAddress());
      });
    });
  });

  // Dispute methods - single
  context("📋 Dispute Handler Methods", async function () {
    beforeEach(async function () {
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
      const DRFeeNative = "0";
      const disputeResolverFees = [new DisputeResolverFee(ZeroAddress, "Native", DRFeeNative)];

      // Make empty seller list, so every seller is allowed
      const sellerAllowList = [];

      // Register the dispute resolver
      await accountHandler
        .connect(adminDR)
        .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

      // buyer escalation deposit used in multiple tests
      buyerEscalationDepositNative = applyPercentage(DRFeeNative, buyerEscalationDepositPercentage);

      // Mock offer
      ({ offer, offerDates, offerDurations, disputeResolverId } = await mockOffer());
      offer.quantityAvailable = "5";

      // Check if domains are valid
      expect(offer.isValid()).is.true;
      expect(offerDates.isValid()).is.true;
      expect(offerDurations.isValid()).is.true;

      // Create the offer
      await offerHandler
        .connect(assistant)
        .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId, offerFeeLimit);

      // Set used variables
      price = offer.price;
      const quantityAvailable = offer.quantityAvailable;
      sellerDeposit = offer.sellerDeposit;
      voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
      resolutionPeriod = offerDurations.resolutionPeriod;
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

        // Upgrade Exchange handler facet
        await upgradeExchangeHandlerFacet("MockExchangeHandlerFacet");

        // Redeem voucher
        await mockExchangeHandlerUpgrade.connect(buyer).redeemVoucher(exchangeId);

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
      });

      context("👉 retractDispute()", async function () {
        it("should emit a DisputeRetracted event", async function () {
          // Raise a dispute
          await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Retract the dispute, testing for the event
          await expect(disputeHandler.connect(buyer).retractDispute(exchangeId))
            .to.emit(disputeHandler, "DisputeRetracted")
            .withArgs(exchangeId, await buyer.getAddress());
        });
      });

      context("👉 extendDisputeTimeout()", async function () {
        it("should emit a DisputeTimeoutExtended event", async function () {
          // Raise a dispute
          const tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Get the block timestamp of the confirmed tx and set disputedDate
          const blockNumber = tx.blockNumber;
          const block = await provider.getBlock(blockNumber);
          const disputedDate = block.timestamp.toString();
          const timeout = BigInt(disputedDate) + resolutionPeriod.toString();

          // extend timeout for a month
          const newDisputeTimeout = BigInt(timeout) + oneMonth.toString();

          // Extend the dispute timeout, testing for the event
          await expect(disputeHandler.connect(assistant).extendDisputeTimeout(exchangeId, newDisputeTimeout))
            .to.emit(disputeHandler, "DisputeTimeoutExtended")
            .withArgs(exchangeId, newDisputeTimeout, await assistant.getAddress());
        });
      });

      context("👉 expireDispute()", async function () {
        it("should emit a DisputeExpired event", async function () {
          // Raise a dispute
          const tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Get the block timestamp of the confirmed tx and set disputedDate
          const blockNumber = tx.blockNumber;
          const block = await provider.getBlock(blockNumber);
          const disputedDate = block.timestamp.toString();
          const timeout = BigInt(disputedDate) + resolutionPeriod.toString();

          // Set time forward past the dispute resolution period
          await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

          // Expire the dispute, testing for the event
          await expect(disputeHandler.connect(rando).expireDispute(exchangeId))
            .to.emit(disputeHandler, "DisputeExpired")
            .withArgs(exchangeId, await rando.getAddress());
        });
      });

      context("👉 resolveDispute()", async function () {
        beforeEach(async function () {
          // Raise a dispute
          await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          buyerPercentBasisPoints = "1234";

          // Set the message Type, needed for signature
          const resolutionType = [
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
          it("should emit a DisputeResolved event", async function () {
            // Collect the signature components
            const { r, s, v } = await prepareDataSignatureParameters(
              assistant, // When buyer is the caller, seller should be the signer.
              customSignatureType,
              "Resolution",
              message,
              await disputeHandler.getAddress()
            );

            // Resolve the dispute, testing for the event
            await expect(disputeHandler.connect(buyer).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v))
              .to.emit(disputeHandler, "DisputeResolved")
              .withArgs(exchangeId, buyerPercentBasisPoints, await buyer.getAddress());
          });
        });

        context("👉 seller is the caller", async function () {
          it("should emit a DisputeResolved event", async function () {
            // Collect the signature components
            const { r, s, v } = await prepareDataSignatureParameters(
              buyer, // When seller is the caller, buyer should be the signer.
              customSignatureType,
              "Resolution",
              message,
              await disputeHandler.getAddress()
            );

            // Resolve the dispute, testing for the event
            await expect(disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v))
              .to.emit(disputeHandler, "DisputeResolved")
              .withArgs(exchangeId, buyerPercentBasisPoints, await assistant.getAddress());
          });
        });
      });

      context("👉 escalateDispute()", async function () {
        it("should emit a DisputeEscalated event", async function () {
          // Raise a dispute
          await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Escalate the dispute, testing for the event
          await expect(
            disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative })
          )
            .to.emit(disputeHandler, "DisputeEscalated")
            .withArgs(exchangeId, disputeResolverId, await buyer.getAddress());
        });
      });

      context("👉 decideDispute()", async function () {
        it("should emit a DisputeDecided event", async function () {
          // Raise a dispute
          await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Escalate the dispute
          await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

          // buyer percent used in tests
          buyerPercentBasisPoints = "4321";

          // Escalate the dispute, testing for the event
          await expect(disputeHandler.connect(assistantDR).decideDispute(exchangeId, buyerPercentBasisPoints))
            .to.emit(disputeHandler, "DisputeDecided")
            .withArgs(exchangeId, buyerPercentBasisPoints, await assistantDR.getAddress());
        });
      });

      context("👉 expireEscalatedDispute()", async function () {
        it("should emit a EscalatedDisputeExpired event", async function () {
          // Raise a dispute
          await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Escalate the dispute
          const tx = await disputeHandler
            .connect(buyer)
            .escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

          // Get the block timestamp of the confirmed tx and set escalatedDate
          const blockNumber = tx.blockNumber;
          const block = await provider.getBlock(blockNumber);
          const escalatedDate = block.timestamp.toString();

          // Set time forward past the dispute escalation period
          await setNextBlockTimestamp(Number(escalatedDate) + Number(escalationPeriod) + 1);

          // Expire the escalated dispute, testing for the event
          await expect(disputeHandler.connect(rando).expireEscalatedDispute(exchangeId))
            .to.emit(disputeHandler, "EscalatedDisputeExpired")
            .withArgs(exchangeId, await rando.getAddress());
        });
      });

      context("👉 refuseEscalatedDispute()", async function () {
        it("should emit a EscalatedDisputeRefused event", async function () {
          // Raise a dispute
          await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Escalate the dispute
          await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

          // Refuse the escalated dispute, testing for the event
          await expect(disputeHandler.connect(assistantDR).refuseEscalatedDispute(exchangeId))
            .to.emit(disputeHandler, "EscalatedDisputeRefused")
            .withArgs(exchangeId, await assistantDR.getAddress());
        });
      });
    });
  });

  // Withdraw Funds
  context("📋 Withdraw Funds", async function () {
    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    context("💸 withdraw", async function () {
      beforeEach(async function () {
        // Initial ids for all the things
        exchangeId = "1";

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
        const disputeResolverFees = [
          new DisputeResolverFee(ZeroAddress, "Native", "0"),
          new DisputeResolverFee(await mockToken.getAddress(), "mockToken", "0"),
        ];

        // Make empty seller list, so every seller is allowed
        const sellerAllowList = [];

        // Register the dispute resolver
        await accountHandler
          .connect(adminDR)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

        // Mock offer
        const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
        offer.quantityAvailable = "2";

        const offerNative = offer;

        offerToken = offer.clone();
        offerToken.id = "2";
        offerToken.exchangeToken = await mockToken.getAddress();

        // Check if domains are valid
        expect(offerNative.isValid()).is.true;
        expect(offerToken.isValid()).is.true;
        expect(offerDates.isValid()).is.true;
        expect(offerDurations.isValid()).is.true;

        // Set used variables
        voucherRedeemableFrom = offerDates.voucherRedeemableFrom;

        // Create both offers
        await Promise.all([
          offerHandler
            .connect(assistant)
            .createOffer(offerNative, offerDates, offerDurations, disputeResolverId, agentId, offerFeeLimit),
          offerHandler
            .connect(assistant)
            .createOffer(offerToken, offerDates, offerDurations, disputeResolverId, agentId, offerFeeLimit),
        ]);

        // Set used variables
        price = offerToken.price;
        sellerDeposit = offerToken.sellerDeposit;

        // top up seller's and buyer's account
        await Promise.all([
          mockToken.mint(await assistant.getAddress(), sellerDeposit),
          mockToken.mint(await buyer.getAddress(), price),
        ]);

        // approve protocol to transfer the tokens
        await Promise.all([
          mockToken.connect(assistant).approve(protocolDiamondAddress, sellerDeposit),
          mockToken.connect(buyer).approve(protocolDiamondAddress, price),
        ]);

        // deposit to seller's pool
        await Promise.all([
          fundsHandler.connect(assistant).depositFunds(seller.id, await mockToken.getAddress(), sellerDeposit),
          fundsHandler.connect(assistant).depositFunds(seller.id, ZeroAddress, sellerDeposit, { value: sellerDeposit }),
        ]);

        // commit to both offers
        await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerToken.id);
        await exchangeHandler
          .connect(buyer)
          .commitToOffer(await buyer.getAddress(), offerNative.id, { value: offerNative.price });

        buyerId = accountId.next().value;
      });

      afterEach(async function () {
        // Reset the accountId iterator
        accountId.next(true);
      });

      context("👉 withdrawFunds()", async function () {
        context("cancelVoucher() is working as expected", async function () {
          it("should emit a FundsWithdrawn event", async function () {
            // Upgrade Exchange handler facet
            await upgradeExchangeHandlerFacet("MockExchangeHandlerFacet");
            // cancel the voucher, so both seller and buyer have something to withdraw
            await mockExchangeHandlerUpgrade.connect(buyer).cancelVoucher(exchangeId); // canceling the voucher in tokens
            await mockExchangeHandlerUpgrade.connect(buyer).cancelVoucher(++exchangeId); // canceling the voucher in the native currency

            // expected payoffs - they are the same for token and native currency
            // buyer: price - buyerCancelPenalty
            const buyerPayoff = (BigInt(offerToken.price) - BigInt(offerToken.buyerCancelPenalty)).toString();

            // seller: sellerDeposit + buyerCancelPenalty
            const sellerPayoff = (BigInt(offerToken.sellerDeposit) + BigInt(offerToken.buyerCancelPenalty)).toString();

            // Withdraw funds, testing for the event
            // Withdraw tokens
            const tokenListSeller = [await mockToken.getAddress(), ZeroAddress];
            const tokenListBuyer = [ZeroAddress, await mockToken.getAddress()];

            // Withdraw amounts
            const tokenAmountsSeller = [sellerPayoff, (BigInt(sellerPayoff) / 2n).toString()];
            const tokenAmountsBuyer = [buyerPayoff, (BigInt(buyerPayoff) / 5n).toString()];

            // seller withdrawal
            const tx = await fundsHandler
              .connect(assistant)
              .withdrawFunds(seller.id, tokenListSeller, tokenAmountsSeller);
            await expect(tx)
              .to.emit(fundsHandler, "FundsWithdrawn")
              .withArgs(
                seller.id,
                await treasury.getAddress(),
                await mockToken.getAddress(),
                sellerPayoff,
                await assistant.getAddress()
              );

            await expect(tx)
              .to.emit(fundsHandler, "FundsWithdrawn")
              .withArgs(
                seller.id,
                await treasury.getAddress(),
                0n,
                BigInt(sellerPayoff) / 2n,
                await assistant.getAddress()
              );

            // buyer withdrawal
            const tx2 = await fundsHandler.connect(buyer).withdrawFunds(buyerId, tokenListBuyer, tokenAmountsBuyer);
            await expect(tx2)
              .to.emit(fundsHandler, "FundsWithdrawn")
              .withArgs(
                buyerId,
                await buyer.getAddress(),
                await mockToken.getAddress(),
                BigInt(buyerPayoff) / 5n,
                await buyer.getAddress()
              );

            await expect(tx2)
              .to.emit(fundsHandler, "FundsWithdrawn")
              .withArgs(buyerId, await buyer.getAddress(), 0n, buyerPayoff, await buyer.getAddress());
          });
        });

        context("cancelVoucher() has a bug and does not finalize any exchange", async function () {
          it("withdrawFunds() should revert", async function () {
            // Upgrade Exchange handler facet
            await upgradeExchangeHandlerFacet("MockExchangeHandlerFacetWithDefect");
            // cancel the voucher, so both seller and buyer have something to withdraw
            await mockExchangeHandlerUpgrade.connect(buyer).cancelVoucher(exchangeId); // canceling the voucher in tokens
            await mockExchangeHandlerUpgrade.connect(buyer).cancelVoucher(++exchangeId); // canceling the voucher in the native currency

            // expected payoffs - they are the same for token and native currency
            // buyer: price - buyerCancelPenalty
            const buyerPayoff = (BigInt(offerToken.price) - BigInt(offerToken.buyerCancelPenalty)).toString();

            // seller: sellerDeposit + buyerCancelPenalty
            const sellerPayoff = (BigInt(offerToken.sellerDeposit) + BigInt(offerToken.buyerCancelPenalty)).toString();

            // Withdraw funds, testing for the event
            // Withdraw tokens
            const tokenListSeller = [await mockToken.getAddress(), ZeroAddress];
            const tokenListBuyer = [ZeroAddress, await mockToken.getAddress()];

            // Withdraw amounts
            const tokenAmountsSeller = [sellerPayoff, (BigInt(sellerPayoff) / 2n).toString()];
            const tokenAmountsBuyer = [buyerPayoff, (BigInt(buyerPayoff) / 5n).toString()];

            // seller withdrawal
            // Attempt to withdraw the funds, expecting revert
            await expect(
              fundsHandler.connect(assistant).withdrawFunds(seller.id, tokenListSeller, tokenAmountsSeller)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS);

            // buyer withdrawal
            await expect(
              fundsHandler.connect(buyer).withdrawFunds(buyerId, tokenListBuyer, tokenAmountsBuyer)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS);
          });
        });
      });
    });
  });
});
