const hre = require("hardhat");
const ethers = hre.ethers;
const { expect, assert } = require("chai");

const Role = require("../../scripts/domain/Role");
const Exchange = require("../../scripts/domain/Exchange");
const Dispute = require("../../scripts/domain/Dispute");
const DisputeState = require("../../scripts/domain/DisputeState");
const DisputeDates = require("../../scripts/domain/DisputeDates");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const {
  setNextBlockTimestamp,
  prepareDataSignatureParameters,
  applyPercentage,
} = require("../../scripts/util/test-utils.js");
const { oneWeek, oneMonth } = require("../utils/constants");
const {
  mockOffer,
  mockDisputeResolver,
  mockSeller,
  mockAuthToken,
  mockVoucherInitValues,
  mockBuyer,
} = require("../utils/mock");

/**
 *  Test the Boson Dispute Handler interface
 */
describe("IBosonDisputeHandler", function () {
  // Common vars
  let InterfaceIds;
  let deployer,
    pauser,
    operator,
    admin,
    clerk,
    treasury,
    rando,
    buyer,
    other1,
    other2,
    operatorDR,
    adminDR,
    clerkDR,
    treasuryDR;
  let erc165,
    protocolDiamond,
    accessController,
    accountHandler,
    exchangeHandler,
    offerHandler,
    fundsHandler,
    disputeHandler,
    pauseHandler;
  let bosonToken, gasLimit;
  let buyerId, offer, offerId, seller, nextAccountId;
  let block, blockNumber, tx;
  let support, newTime;
  let price, quantityAvailable, resolutionPeriod, fulfillmentPeriod, sellerDeposit;
  let voucherRedeemableFrom, offerDates, offerDurations;
  let protocolFeePercentage, protocolFeeFlatBoson, buyerEscalationDepositPercentage;
  let exchangeStruct, finalizedDate, exchangeId;
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
  let buyerPercent;
  let resolutionType, customSignatureType, message, r, s, v;
  let returnedDispute, returnedDisputeDates;
  let DRFeeNative, DRFeeToken, buyerEscalationDepositNative, buyerEscalationDepositToken;
  let voucherInitValues;
  let emptyAuthToken;
  let agentId;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();
  });

  beforeEach(async function () {
    // Make accounts available
    [
      deployer,
      pauser,
      operator,
      admin,
      clerk,
      treasury,
      buyer,
      rando,
      other1,
      other2,
      operatorDR,
      adminDR,
      clerkDR,
      treasuryDR,
    ] = await ethers.getSigners();

    // Deploy the Protocol Diamond
    [protocolDiamond, , , accessController] = await deployProtocolDiamond();

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Grant PROTOCOL role to ProtocolDiamond address and renounces admin
    await accessController.grantRole(Role.PROTOCOL, protocolDiamond.address);

    // Temporarily grant PAUSER role to pauser account
    await accessController.grantRole(Role.PAUSER, pauser.address);

    // Cut the protocol handler facets into the Diamond
    await deployProtocolHandlerFacets(protocolDiamond, [
      "SellerHandlerFacet",
      "BuyerHandlerFacet",
      "DisputeResolverHandlerFacet",
      "ExchangeHandlerFacet",
      "OfferHandlerFacet",
      "FundsHandlerFacet",
      "DisputeHandlerFacet",
      "PauseHandlerFacet",
    ]);

    // Deploy the Protocol client implementation/proxy pairs (currently just the Boson Voucher)
    const protocolClientArgs = [accessController.address, protocolDiamond.address];
    const [, beacons, proxies] = await deployProtocolClients(protocolClientArgs, gasLimit);
    const [beacon] = beacons;
    const [proxy] = proxies;

    // Deploy the boson token
    [bosonToken] = await deployMockTokens(gasLimit, ["BosonToken"]);

    // set protocolFees
    protocolFeePercentage = "200"; // 2 %
    protocolFeeFlatBoson = ethers.utils.parseUnits("0.01", "ether").toString();
    buyerEscalationDepositPercentage = "1000"; // 10%

    // Add config Handler, so ids start at 1, and so voucher address can be found
    const protocolConfig = [
      // Protocol addresses
      {
        treasury: ethers.constants.AddressZero,
        token: bosonToken.address,
        voucherBeacon: beacon.address,
        beaconProxy: proxy.address,
      },
      // Protocol limits
      {
        maxExchangesPerBatch: 0,
        maxOffersPerGroup: 0,
        maxTwinsPerBundle: 0,
        maxOffersPerBundle: 0,
        maxOffersPerBatch: 0,
        maxTokensPerWithdrawal: 0,
        maxFeesPerDisputeResolver: 100,
        maxEscalationResponsePeriod: oneMonth,
        maxDisputesPerBatch: 100,
        maxAllowedSellers: 100,
        maxTotalOfferFeePercentage: 4000, //40%
        maxRoyaltyPecentage: 1000, //10%
      },
      // Protocol fees
      {
        percentage: protocolFeePercentage,
        flatBoson: protocolFeeFlatBoson,
      },
      buyerEscalationDepositPercentage,
    ];

    // Deploy the Config facet, initializing the protocol config
    await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);

    // Cast Diamond to IERC165
    erc165 = await ethers.getContractAt("IERC165", protocolDiamond.address);

    // Cast Diamond to IBosonAccountHandler. Use this interface to call all individual account handlers
    accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);

    // Cast Diamond to IBosonOfferHandler
    offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);

    // Cast Diamond to IBosonExchangeHandler
    exchangeHandler = await ethers.getContractAt("IBosonExchangeHandler", protocolDiamond.address);

    // Cast Diamond to IBosonFundsHandler
    fundsHandler = await ethers.getContractAt("IBosonFundsHandler", protocolDiamond.address);

    // Cast Diamond to IBosonDisputeHandler
    disputeHandler = await ethers.getContractAt("IBosonDisputeHandler", protocolDiamond.address);

    // Cast Diamond to IBosonPauseHandler
    pauseHandler = await ethers.getContractAt("IBosonPauseHandler", protocolDiamond.address);
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
      offerId = nextAccountId = "1";
      buyerId = "3"; // created after seller and dispute resolver
      agentId = "0"; // agent id is optional while creating an offer

      // Create a valid seller
      seller = mockSeller(operator.address, admin.address, clerk.address, treasury.address);
      expect(seller.isValid()).is.true;

      // VoucherInitValues
      voucherInitValues = mockVoucherInitValues();
      expect(voucherInitValues.isValid()).is.true;

      // AuthToken
      emptyAuthToken = mockAuthToken();
      expect(emptyAuthToken.isValid()).is.true;

      await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

      ++nextAccountId;

      // Create a valid dispute resolver
      disputeResolver = mockDisputeResolver(operatorDR.address, adminDR.address, clerkDR.address, treasuryDR.address);
      disputeResolver.id = nextAccountId.toString();
      expect(disputeResolver.isValid()).is.true;

      //Create DisputeResolverFee array so offer creation will succeed
      DRFeeNative = ethers.utils.parseUnits("1", "ether").toString();
      disputeResolverFees = [new DisputeResolverFee(ethers.constants.AddressZero, "Native", DRFeeNative)];

      // Make empty seller list, so every seller is allowed
      const sellerAllowList = [];

      // Register and activate the dispute resolver
      await accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
      await accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id);

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
      await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

      // Set used variables
      price = offer.price;
      quantityAvailable = offer.quantityAvailable;
      sellerDeposit = offer.sellerDeposit;
      voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
      resolutionPeriod = offerDurations.resolutionPeriod;
      fulfillmentPeriod = offerDurations.fulfillmentPeriod;
      escalationPeriod = disputeResolver.escalationResponsePeriod;

      // Deposit seller funds so the commit will succeed
      const fundsToDeposit = ethers.BigNumber.from(sellerDeposit).mul(quantityAvailable);
      await fundsHandler
        .connect(operator)
        .depositFunds(seller.id, ethers.constants.AddressZero, fundsToDeposit, { value: fundsToDeposit });
    });

    context("Single", async function () {
      beforeEach(async function () {
        exchangeId = "1";

        // Commit to offer, creating a new exchange
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

        // Set time forward to the offer's voucherRedeemableFrom
        await setNextBlockTimestamp(Number(voucherRedeemableFrom));

        // Redeem voucher
        await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

        // Set the buyer percent
        buyerPercent = "0";
      });

      context("👉 raiseDispute()", async function () {
        it("should emit a DisputeRaised event", async function () {
          // Raise a dispute, testing for the event
          await expect(disputeHandler.connect(buyer).raiseDispute(exchangeId))
            .to.emit(disputeHandler, "DisputeRaised")
            .withArgs(exchangeId, buyerId, seller.id, buyer.address);
        });

        it("should update state", async function () {
          // Raise a dispute
          tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Get the block timestamp of the confirmed tx and set disputedDate
          blockNumber = tx.blockNumber;
          block = await ethers.provider.getBlock(blockNumber);
          disputedDate = block.timestamp.toString();
          timeout = ethers.BigNumber.from(disputedDate).add(resolutionPeriod).toString();

          // expected values
          dispute = new Dispute(exchangeId, DisputeState.Resolving, buyerPercent);
          disputeDates = new DisputeDates(disputedDate, "0", "0", timeout);

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
            await expect(disputeHandler.connect(buyer).raiseDispute(exchangeId)).to.revertedWith(
              RevertReasons.REGION_PAUSED
            );
          });

          it("Caller does not hold a voucher for the given exchange id", async function () {
            // Attempt to raise a dispute, expecting revert
            await expect(disputeHandler.connect(rando).raiseDispute(exchangeId)).to.revertedWith(
              RevertReasons.NOT_VOUCHER_HOLDER
            );
          });

          it("Exchange id is invalid", async function () {
            // An invalid exchange id
            const exchangeId = "666";

            // Attempt to raise a dispute, expecting revert
            await expect(disputeHandler.connect(buyer).raiseDispute(exchangeId)).to.revertedWith(
              RevertReasons.NO_SUCH_EXCHANGE
            );
          });

          it("exchange is not in a redeemed state - completed", async function () {
            // Set time forward to run out the fulfillment period
            newTime = Number((voucherRedeemableFrom + Number(fulfillmentPeriod) + 1).toString().substring(0, 11));
            await setNextBlockTimestamp(newTime);

            // Complete exchange
            await exchangeHandler.connect(operator).completeExchange(exchangeId);

            // Attempt to raise a dispute, expecting revert
            await expect(disputeHandler.connect(buyer).raiseDispute(exchangeId)).to.revertedWith(
              RevertReasons.INVALID_STATE
            );
          });

          it("exchange is not in a redeemed state - disputed already", async function () {
            // Raise a dispute, put it into DISPUTED state
            await disputeHandler.connect(buyer).raiseDispute(exchangeId);

            // Attempt to raise a dispute, expecting revert
            await expect(disputeHandler.connect(buyer).raiseDispute(exchangeId)).to.revertedWith(
              RevertReasons.INVALID_STATE
            );
          });

          it("The fulfilment period has already elapsed", async function () {
            // Get the redemption date
            [, exchangeStruct] = await exchangeHandler.connect(rando).getExchange(exchangeId);
            const voucherRedeemedDate = exchangeStruct.voucher.redeemedDate;

            // Set time forward past the dispute resolution period
            await setNextBlockTimestamp(voucherRedeemedDate.add(fulfillmentPeriod).add(1).toNumber());

            // Attempt to raise a dispute, expecting revert
            await expect(disputeHandler.connect(buyer).raiseDispute(exchangeId)).to.revertedWith(
              RevertReasons.FULFILLMENT_PERIOD_HAS_ELAPSED
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
          block = await ethers.provider.getBlock(blockNumber);
          disputedDate = block.timestamp.toString();
          timeout = ethers.BigNumber.from(disputedDate).add(resolutionPeriod).toString();
        });

        it("should emit a DisputeRetracted event", async function () {
          // Retract the dispute, testing for the event
          await expect(disputeHandler.connect(buyer).retractDispute(exchangeId))
            .to.emit(disputeHandler, "DisputeRetracted")
            .withArgs(exchangeId, buyer.address);
        });

        it("should update state", async function () {
          // Retract the dispute
          tx = await disputeHandler.connect(buyer).retractDispute(exchangeId);

          // Get the block timestamp of the confirmed tx and set finalizedDate
          blockNumber = tx.blockNumber;
          block = await ethers.provider.getBlock(blockNumber);
          finalizedDate = block.timestamp.toString();

          dispute = new Dispute(exchangeId, DisputeState.Retracted, buyerPercent);
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
            .withArgs(exchangeId, buyer.address);
        });

        context("💔 Revert Reasons", async function () {
          it("The disputes region of protocol is paused", async function () {
            // Pause the disputes region of the protocol
            await pauseHandler.connect(pauser).pause([PausableRegion.Disputes]);

            // Attempt to retract a dispute, expecting revert
            await expect(disputeHandler.connect(buyer).retractDispute(exchangeId)).to.revertedWith(
              RevertReasons.REGION_PAUSED
            );
          });

          it("Exchange does not exist", async function () {
            // An invalid exchange id
            const exchangeId = "666";

            // Attempt to retract the dispute, expecting revert
            await expect(disputeHandler.connect(buyer).retractDispute(exchangeId)).to.revertedWith(
              RevertReasons.NO_SUCH_EXCHANGE
            );
          });

          it("Exchange is not in a disputed state", async function () {
            exchangeId++;

            // Commit to offer, creating a new exchange
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

            // Attempt to retract the dispute, expecting revert
            await expect(disputeHandler.connect(buyer).retractDispute(exchangeId)).to.revertedWith(
              RevertReasons.INVALID_STATE
            );
          });

          it("Caller is not the buyer for the given exchange id", async function () {
            // Attempt to retract the dispute, expecting revert
            await expect(disputeHandler.connect(rando).retractDispute(exchangeId)).to.revertedWith(
              RevertReasons.NOT_VOUCHER_HOLDER
            );
          });

          it("Dispute is in some state other than resolving or escalated", async function () {
            // Retract the dispute, put it into RETRACTED state
            await disputeHandler.connect(buyer).retractDispute(exchangeId);

            // Attempt to retract the dispute, expecting revert
            await expect(disputeHandler.connect(buyer).retractDispute(exchangeId)).to.revertedWith(
              RevertReasons.INVALID_STATE
            );
          });
        });

        it("Dispute was escalated and escalation period has elapsed", async function () {
          // Escalate the dispute
          tx = await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

          // Get the block timestamp of the confirmed tx and set escalatedDate
          blockNumber = tx.blockNumber;
          block = await ethers.provider.getBlock(blockNumber);
          escalatedDate = block.timestamp.toString();

          await setNextBlockTimestamp(Number(escalatedDate) + Number(escalationPeriod));

          // Attempt to retract the dispute, expecting revert
          await expect(disputeHandler.connect(buyer).retractDispute(exchangeId)).to.revertedWith(
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
          block = await ethers.provider.getBlock(blockNumber);
          disputedDate = block.timestamp.toString();
          timeout = ethers.BigNumber.from(disputedDate).add(resolutionPeriod).toString();

          // extend timeout for a month
          newDisputeTimeout = ethers.BigNumber.from(timeout).add(oneMonth).toString();
        });

        it("should emit a DisputeTimeoutExtended event", async function () {
          // Extend the dispute timeout, testing for the event
          await expect(disputeHandler.connect(operator).extendDisputeTimeout(exchangeId, newDisputeTimeout))
            .to.emit(disputeHandler, "DisputeTimeoutExtended")
            .withArgs(exchangeId, newDisputeTimeout, operator.address);
        });

        it("should update state", async function () {
          // Extend the dispute timeout
          await disputeHandler.connect(operator).extendDisputeTimeout(exchangeId, newDisputeTimeout);

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
          await disputeHandler.connect(operator).extendDisputeTimeout(exchangeId, newDisputeTimeout);

          // not strictly necessary, but it shows that we can extend event if we are past original timeout
          await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

          // extend for another week
          newDisputeTimeout = ethers.BigNumber.from(newDisputeTimeout).add(oneWeek).toString();

          // Extend the dispute timeout, testing for the event
          await expect(disputeHandler.connect(operator).extendDisputeTimeout(exchangeId, newDisputeTimeout))
            .to.emit(disputeHandler, "DisputeTimeoutExtended")
            .withArgs(exchangeId, newDisputeTimeout, operator.address);
        });

        context("💔 Revert Reasons", async function () {
          it("The disputes region of protocol is paused", async function () {
            // Pause the disputes region of the protocol
            await pauseHandler.connect(pauser).pause([PausableRegion.Disputes]);

            // Attempt to extend a dispute timeout, expecting revert
            await expect(
              disputeHandler.connect(operator).extendDisputeTimeout(exchangeId, newDisputeTimeout)
            ).to.revertedWith(RevertReasons.REGION_PAUSED);
          });

          it("Exchange does not exist", async function () {
            // An invalid exchange id
            const exchangeId = "666";

            // Attempt to extend the dispute timeout, expecting revert
            await expect(
              disputeHandler.connect(operator).extendDisputeTimeout(exchangeId, newDisputeTimeout)
            ).to.revertedWith(RevertReasons.NO_SUCH_EXCHANGE);
          });

          it("Exchange is not in a disputed state", async function () {
            exchangeId++;

            // Commit to offer, creating a new exchange
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

            // Attempt to extend the dispute timeout, expecting revert
            await expect(
              disputeHandler.connect(operator).extendDisputeTimeout(exchangeId, newDisputeTimeout)
            ).to.revertedWith(RevertReasons.INVALID_STATE);
          });

          it("Caller is not the seller", async function () {
            // Attempt to extend the dispute timeout, expecting revert
            await expect(
              disputeHandler.connect(rando).extendDisputeTimeout(exchangeId, newDisputeTimeout)
            ).to.revertedWith(RevertReasons.NOT_OPERATOR);
          });

          it("Dispute has expired already", async function () {
            // Set time forward past the dispute resolution period
            await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

            // Attempt to extend the dispute timeout, expecting revert
            await expect(
              disputeHandler.connect(operator).extendDisputeTimeout(exchangeId, newDisputeTimeout)
            ).to.revertedWith(RevertReasons.DISPUTE_HAS_EXPIRED);
          });

          it("new dispute timeout is before the current dispute timeout", async function () {
            newDisputeTimeout = ethers.BigNumber.from(timeout).sub(oneWeek).toString();

            // Attempt to extend the dispute timeout, expecting revert
            await expect(
              disputeHandler.connect(operator).extendDisputeTimeout(exchangeId, newDisputeTimeout)
            ).to.revertedWith(RevertReasons.INVALID_DISPUTE_TIMEOUT);
          });

          it("Dispute is in some state other than resolving", async function () {
            // Retract the dispute, put it into RETRACTED state
            await disputeHandler.connect(buyer).retractDispute(exchangeId);

            // Attempt to expire the dispute, expecting revert
            await expect(
              disputeHandler.connect(operator).extendDisputeTimeout(exchangeId, newDisputeTimeout)
            ).to.revertedWith(RevertReasons.INVALID_STATE);
          });
        });
      });

      context("👉 expireDispute()", async function () {
        beforeEach(async function () {
          // Raise a dispute
          tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Get the block timestamp of the confirmed tx and set disputedDate
          blockNumber = tx.blockNumber;
          block = await ethers.provider.getBlock(blockNumber);
          disputedDate = block.timestamp.toString();
          timeout = ethers.BigNumber.from(disputedDate).add(resolutionPeriod).toString();
        });

        it("should emit a DisputeExpired event", async function () {
          // Set time forward past the dispute resolution period
          await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

          // Expire the dispute, testing for the event
          await expect(disputeHandler.connect(rando).expireDispute(exchangeId))
            .to.emit(disputeHandler, "DisputeExpired")
            .withArgs(exchangeId, rando.address);
        });

        it("should update state", async function () {
          // Set time forward past the dispute resolution period
          await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

          // Expire the dispute
          tx = await disputeHandler.connect(rando).expireDispute(exchangeId);

          // Get the block timestamp of the confirmed tx and set finalizedDate
          blockNumber = tx.blockNumber;
          block = await ethers.provider.getBlock(blockNumber);
          finalizedDate = block.timestamp.toString();

          dispute = new Dispute(exchangeId, DisputeState.Retracted, buyerPercent);
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
            await expect(disputeHandler.connect(rando).expireDispute(exchangeId)).to.revertedWith(
              RevertReasons.REGION_PAUSED
            );
          });

          it("Exchange does not exist", async function () {
            // An invalid exchange id
            const exchangeId = "666";

            // Attempt to expire the dispute, expecting revert
            await expect(disputeHandler.connect(rando).expireDispute(exchangeId)).to.revertedWith(
              RevertReasons.NO_SUCH_EXCHANGE
            );
          });

          it("Exchange is not in a disputed state", async function () {
            exchangeId++;

            // Commit to offer, creating a new exchange
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

            // Attempt to expire the dispute, expecting revert
            await expect(disputeHandler.connect(rando).expireDispute(exchangeId)).to.revertedWith(
              RevertReasons.INVALID_STATE
            );
          });

          it("Dispute has not expired yet", async function () {
            // Attempt to expire the dispute, expecting revert
            await expect(disputeHandler.connect(rando).expireDispute(exchangeId)).to.revertedWith(
              RevertReasons.DISPUTE_STILL_VALID
            );
          });

          it("Dispute timeout has been extended", async function () {
            // Extend the dispute timeout
            await disputeHandler
              .connect(operator)
              .extendDisputeTimeout(exchangeId, Number(timeout) + 2 * Number(oneWeek));

            // put past original timeout where normally it would not revert
            await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

            // Attempt to expire the dispute, expecting revert
            await expect(disputeHandler.connect(rando).expireDispute(exchangeId)).to.revertedWith(
              RevertReasons.DISPUTE_STILL_VALID
            );
          });

          it("Dispute is in some state other than resolving", async function () {
            // Retract the dispute, put it into RETRACTED state
            await disputeHandler.connect(buyer).retractDispute(exchangeId);

            // Attempt to expire the dispute, expecting revert
            await expect(disputeHandler.connect(rando).expireDispute(exchangeId)).to.revertedWith(
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
          block = await ethers.provider.getBlock(blockNumber);
          disputedDate = block.timestamp.toString();
          timeout = ethers.BigNumber.from(disputedDate).add(resolutionPeriod).toString();

          buyerPercent = "1234";

          // Set the message Type, needed for signature
          resolutionType = [
            { name: "exchangeId", type: "uint256" },
            { name: "buyerPercent", type: "uint256" },
          ];

          customSignatureType = {
            Resolution: resolutionType,
          };

          message = {
            exchangeId: exchangeId,
            buyerPercent,
          };
        });

        context("👉 buyer is the caller", async function () {
          beforeEach(async function () {
            // Collect the signature components
            ({ r, s, v } = await prepareDataSignatureParameters(
              operator, // When buyer is the caller, seller should be the signer.
              customSignatureType,
              "Resolution",
              message,
              disputeHandler.address
            ));
          });

          it("should emit a DisputeResolved event", async function () {
            // Resolve the dispute, testing for the event
            await expect(disputeHandler.connect(buyer).resolveDispute(exchangeId, buyerPercent, r, s, v))
              .to.emit(disputeHandler, "DisputeResolved")
              .withArgs(exchangeId, buyerPercent, buyer.address);
          });

          it("should update state", async function () {
            // Resolve the dispute
            tx = await disputeHandler.connect(buyer).resolveDispute(exchangeId, buyerPercent, r, s, v);

            // Get the block timestamp of the confirmed tx and set finalizedDate
            blockNumber = tx.blockNumber;
            block = await ethers.provider.getBlock(blockNumber);
            finalizedDate = block.timestamp.toString();

            dispute = new Dispute(exchangeId, DisputeState.Resolved, buyerPercent);
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
            seller = mockSeller(buyer.address, buyer.address, buyer.address, buyer.address);
            expect(seller.isValid()).is.true;

            await accountHandler.connect(buyer).createSeller(seller, emptyAuthToken, voucherInitValues);

            // Resolve the dispute, testing for the event
            await expect(disputeHandler.connect(buyer).resolveDispute(exchangeId, buyerPercent, r, s, v))
              .to.emit(disputeHandler, "DisputeResolved")
              .withArgs(exchangeId, buyerPercent, buyer.address);
          });

          it("Dispute can be mutually resolved even if it's in escalated state", async function () {
            // escalate dispute
            await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

            // Resolve the dispute, testing for the event
            await expect(disputeHandler.connect(buyer).resolveDispute(exchangeId, buyerPercent, r, s, v))
              .to.emit(disputeHandler, "DisputeResolved")
              .withArgs(exchangeId, buyerPercent, buyer.address);
          });

          it("Dispute can be mutually resolved even if it's in escalated state and past the resolution period", async function () {
            // Set time forward before the dispute original expiration date
            await setNextBlockTimestamp(
              ethers.BigNumber.from(disputedDate)
                .add(resolutionPeriod / 2)
                .toNumber()
            );

            // escalate dispute
            await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

            // Set time forward to the dispute original expiration date
            await setNextBlockTimestamp(Number(timeout) + 10);

            // Resolve the dispute, testing for the event
            await expect(disputeHandler.connect(buyer).resolveDispute(exchangeId, buyerPercent, r, s, v))
              .to.emit(disputeHandler, "DisputeResolved")
              .withArgs(exchangeId, buyerPercent, buyer.address);
          });

          it("Dispute can be mutually resolved if it's past original timeout, but it was extended", async function () {
            // Extend the dispute timeout
            await disputeHandler
              .connect(operator)
              .extendDisputeTimeout(exchangeId, Number(timeout) + 2 * Number(oneWeek));

            // put past original timeout where normally it would not revert
            await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

            // Resolve the dispute, testing for the event
            await expect(disputeHandler.connect(buyer).resolveDispute(exchangeId, buyerPercent, r, s, v))
              .to.emit(disputeHandler, "DisputeResolved")
              .withArgs(exchangeId, buyerPercent, buyer.address);
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
              disputeHandler.address
            ));
          });

          it("should emit a DisputeResolved event", async function () {
            // Resolve the dispute, testing for the event
            await expect(disputeHandler.connect(operator).resolveDispute(exchangeId, buyerPercent, r, s, v))
              .to.emit(disputeHandler, "DisputeResolved")
              .withArgs(exchangeId, buyerPercent, operator.address);
          });

          it("should update state", async function () {
            // Resolve the dispute
            tx = await disputeHandler.connect(operator).resolveDispute(exchangeId, buyerPercent, r, s, v);

            // Get the block timestamp of the confirmed tx and set finalizedDate
            blockNumber = tx.blockNumber;
            block = await ethers.provider.getBlock(blockNumber);
            finalizedDate = block.timestamp.toString();

            dispute = new Dispute(exchangeId, DisputeState.Resolved, buyerPercent);
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

          it("Operator can also have a buyer account and this will work", async function () {
            // Create a valid buyer with operator's wallet
            buyer = mockBuyer(operator.address);
            expect(buyer.isValid()).is.true;
            await accountHandler.connect(operator).createBuyer(buyer);

            // Resolve the dispute, testing for the event
            await expect(disputeHandler.connect(operator).resolveDispute(exchangeId, buyerPercent, r, s, v))
              .to.emit(disputeHandler, "DisputeResolved")
              .withArgs(exchangeId, buyerPercent, operator.address);
          });

          it("Dispute can be mutually resolved even if it's in escalated state", async function () {
            // escalate dispute
            await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

            // Resolve the dispute, testing for the event
            await expect(disputeHandler.connect(operator).resolveDispute(exchangeId, buyerPercent, r, s, v))
              .to.emit(disputeHandler, "DisputeResolved")
              .withArgs(exchangeId, buyerPercent, operator.address);
          });

          it("Dispute can be mutually resolved even if it's in escalated state and past the resolution period", async function () {
            // Set time forward before the dispute original expiration date
            await setNextBlockTimestamp(
              ethers.BigNumber.from(disputedDate)
                .add(resolutionPeriod / 2)
                .toNumber()
            );

            // escalate dispute
            await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

            // Set time forward to the dispute original expiration date
            await setNextBlockTimestamp(Number(timeout) + 10);

            // Resolve the dispute, testing for the event
            await expect(disputeHandler.connect(operator).resolveDispute(exchangeId, buyerPercent, r, s, v))
              .to.emit(disputeHandler, "DisputeResolved")
              .withArgs(exchangeId, buyerPercent, operator.address);
          });

          it("Dispute can be mutually resolved if it's past original timeout, but it was extended", async function () {
            // Extend the dispute timeout
            await disputeHandler
              .connect(operator)
              .extendDisputeTimeout(exchangeId, Number(timeout) + 2 * Number(oneWeek));

            // put past original timeout where normally it would not revert
            await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

            // Resolve the dispute, testing for the event
            await expect(disputeHandler.connect(operator).resolveDispute(exchangeId, buyerPercent, r, s, v))
              .to.emit(disputeHandler, "DisputeResolved")
              .withArgs(exchangeId, buyerPercent, operator.address);
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
              disputeHandler.address
            ));
          });

          it("The disputes region of protocol is paused", async function () {
            // Pause the disputes region of the protocol
            await pauseHandler.connect(pauser).pause([PausableRegion.Disputes]);

            // Attempt to resolve a dispute, expecting revert
            await expect(
              disputeHandler.connect(operator).resolveDispute(exchangeId, buyerPercent, r, s, v)
            ).to.revertedWith(RevertReasons.REGION_PAUSED);
          });

          it("Specified buyer percent exceeds 100%", async function () {
            // Set buyer percent above 100%
            buyerPercent = "12000"; // 120%

            // Attempt to resolve the dispute, expecting revert
            await expect(
              disputeHandler.connect(operator).resolveDispute(exchangeId, buyerPercent, r, s, v)
            ).to.revertedWith(RevertReasons.INVALID_BUYER_PERCENT);
          });

          it("Dispute has expired", async function () {
            // Set time forward to the dispute expiration date
            await setNextBlockTimestamp(Number(timeout));

            // Attempt to resolve the dispute, expecting revert
            await expect(
              disputeHandler.connect(operator).resolveDispute(exchangeId, buyerPercent, r, s, v)
            ).to.revertedWith(RevertReasons.DISPUTE_HAS_EXPIRED);
          });

          it("Exchange does not exist", async function () {
            // An invalid exchange id
            const exchangeId = "666";

            // Attempt to resolve the dispute, expecting revert
            await expect(
              disputeHandler.connect(operator).resolveDispute(exchangeId, buyerPercent, r, s, v)
            ).to.revertedWith(RevertReasons.NO_SUCH_EXCHANGE);
          });

          it("Exchange is not in a disputed state", async function () {
            exchangeId++;

            // Commit to offer, creating a new exchange
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

            // Attempt to resolve the dispute, expecting revert
            await expect(
              disputeHandler.connect(operator).resolveDispute(exchangeId, buyerPercent, r, s, v)
            ).to.revertedWith(RevertReasons.INVALID_STATE);
          });

          it("Caller is neither the seller nor the buyer for the given exchange id", async function () {
            // Wallet without any account
            // Attempt to resolve the dispute, expecting revert
            await expect(
              disputeHandler.connect(rando).resolveDispute(exchangeId, buyerPercent, r, s, v)
            ).to.revertedWith(RevertReasons.NOT_BUYER_OR_SELLER);

            // Wallet with seller account, but not the seller in this exchange
            // Create a valid seller
            seller = mockSeller(other1.address, other1.address, other1.address, other1.address);
            expect(seller.isValid()).is.true;

            await accountHandler.connect(other1).createSeller(seller, emptyAuthToken, voucherInitValues);
            // Attempt to resolve the dispute, expecting revert
            await expect(
              disputeHandler.connect(other1).resolveDispute(exchangeId, buyerPercent, r, s, v)
            ).to.revertedWith(RevertReasons.NOT_BUYER_OR_SELLER);

            // Wallet with buyer account, but not the buyer in this exchange
            // Create a valid buyer
            buyer = mockBuyer(other2.address);
            expect(buyer.isValid()).is.true;
            await accountHandler.connect(other2).createBuyer(buyer);

            // Attempt to resolve the dispute, expecting revert
            await expect(
              disputeHandler.connect(other2).resolveDispute(exchangeId, buyerPercent, r, s, v)
            ).to.revertedWith(RevertReasons.NOT_BUYER_OR_SELLER);
          });

          it("signature does not belong to the address of the other party", async function () {
            // Collect the signature components
            ({ r, s, v } = await prepareDataSignatureParameters(
              rando,
              customSignatureType,
              "Resolution",
              message,
              disputeHandler.address
            ));

            // Attempt to resolve the dispute, expecting revert
            await expect(
              disputeHandler.connect(operator).resolveDispute(exchangeId, buyerPercent, r, s, v)
            ).to.revertedWith(RevertReasons.SIGNER_AND_SIGNATURE_DO_NOT_MATCH);

            // Attempt to resolve the dispute, expecting revert
            await expect(
              disputeHandler.connect(buyer).resolveDispute(exchangeId, buyerPercent, r, s, v)
            ).to.revertedWith(RevertReasons.SIGNER_AND_SIGNATURE_DO_NOT_MATCH);
          });

          it("signature resolution does not match input buyerPercent ", async function () {
            // Set different buyer percentage
            buyerPercent = (Number(buyerPercent) + 1000).toString(); // add 10%

            // Attempt to resolve the dispute, expecting revert
            await expect(
              disputeHandler.connect(operator).resolveDispute(exchangeId, buyerPercent, r, s, v)
            ).to.revertedWith(RevertReasons.SIGNER_AND_SIGNATURE_DO_NOT_MATCH);
          });

          it("signature has invalid field", async function () {
            // Attempt to resolve the dispute, expecting revert
            await expect(
              disputeHandler.connect(operator).resolveDispute(exchangeId, buyerPercent, r, s, "0")
            ).to.revertedWith(RevertReasons.INVALID_SIGNATURE);
            await expect(
              disputeHandler
                .connect(operator)
                .resolveDispute(exchangeId, buyerPercent, r, ethers.utils.hexZeroPad("0x", 32), v)
            ).to.revertedWith(RevertReasons.INVALID_SIGNATURE);
            await expect(
              disputeHandler
                .connect(operator)
                .resolveDispute(exchangeId, buyerPercent, ethers.utils.hexZeroPad("0x", 32), s, v)
            ).to.revertedWith(RevertReasons.INVALID_SIGNATURE);
          });

          it("dispute state is neither resolving or escalated", async function () {
            // Retract the dispute, put it into RETRACTED state
            await disputeHandler.connect(buyer).retractDispute(exchangeId);

            // Attempt to resolve the dispute, expecting revert
            await expect(
              disputeHandler.connect(operator).resolveDispute(exchangeId, buyerPercent, r, s, v)
            ).to.revertedWith(RevertReasons.INVALID_STATE);
          });
        });
      });

      context("👉 escalateDispute()", async function () {
        async function createDisputeExchangeWithToken() {
          // utility function that deploys a mock token, creates a offer with it, creates an exchange and push it into escalated state
          // deploy a mock token
          const [mockToken] = await deployMockTokens(gasLimit, ["Foreign20"]);

          // add to DR fees
          DRFeeToken = ethers.utils.parseUnits("2", "ether").toString();
          await accountHandler
            .connect(adminDR)
            .addFeesToDisputeResolver(disputeResolverId, [
              new DisputeResolverFee(mockToken.address, "MockToken", DRFeeToken),
            ]);

          // create an offer with a mock token contract
          offer.exchangeToken = mockToken.address;
          offer.sellerDeposit = offer.price = offer.buyerCancelPenalty = "0";
          offer.id++;

          // create an offer with erc20 exchange token
          await offerHandler
            .connect(operator)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

          // mint tokens to buyer and approve the protocol
          buyerEscalationDepositToken = applyPercentage(DRFeeToken, buyerEscalationDepositPercentage);
          await mockToken.mint(buyer.address, buyerEscalationDepositToken);
          await mockToken.connect(buyer).approve(protocolDiamond.address, buyerEscalationDepositToken);

          // Commit to offer and put exchange all the way to dispute
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offer.id);
          await exchangeHandler.connect(buyer).redeemVoucher(++exchangeId);
          await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          return mockToken;
        }

        beforeEach(async function () {
          // Raise a dispute
          tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Get the block timestamp of the confirmed tx and set disputedDate
          blockNumber = tx.blockNumber;
          block = await ethers.provider.getBlock(blockNumber);
          disputedDate = block.timestamp.toString();
          timeout = ethers.BigNumber.from(disputedDate).add(resolutionPeriod).toString();
        });

        it("should emit a DisputeEscalated event", async function () {
          // Escalate the dispute, testing for the event
          await expect(
            disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative })
          )
            .to.emit(disputeHandler, "DisputeEscalated")
            .withArgs(exchangeId, disputeResolverId, buyer.address);
        });

        it("should update state", async function () {
          // Protocol balance before
          const escrowBalanceBefore = await ethers.provider.getBalance(protocolDiamond.address);

          // Escalate the dispute
          tx = await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

          // Get the block timestamp of the confirmed tx and set escalatedDate
          blockNumber = tx.blockNumber;
          block = await ethers.provider.getBlock(blockNumber);
          escalatedDate = block.timestamp.toString();
          timeout = ethers.BigNumber.from(escalatedDate).add(escalationPeriod).toString();

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
          const escrowBalanceAfter = await ethers.provider.getBalance(protocolDiamond.address);
          expect(escrowBalanceAfter.sub(escrowBalanceBefore)).to.equal(
            buyerEscalationDepositNative,
            "Escrow balance mismatch"
          );
        });

        it("should be possible to pay escalation deposit in ERC20 token", async function () {
          const mockToken = await createDisputeExchangeWithToken();

          // Protocol balance before
          const escrowBalanceBefore = await mockToken.balanceOf(protocolDiamond.address);

          // Escalate the dispute, testing for the event
          await expect(disputeHandler.connect(buyer).escalateDispute(exchangeId))
            .to.emit(disputeHandler, "DisputeEscalated")
            .withArgs(exchangeId, disputeResolverId, buyer.address);

          // Protocol balance should increase for buyer escalation deposit
          const escrowBalanceAfter = await mockToken.balanceOf(protocolDiamond.address);
          expect(escrowBalanceAfter.sub(escrowBalanceBefore)).to.equal(
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
            ).to.revertedWith(RevertReasons.REGION_PAUSED);
          });

          it("Exchange does not exist", async function () {
            // An invalid exchange id
            const exchangeId = "666";

            // Attempt to escalate the dispute, expecting revert
            await expect(disputeHandler.connect(buyer).escalateDispute(exchangeId), {
              value: buyerEscalationDepositNative,
            }).to.revertedWith(RevertReasons.NO_SUCH_EXCHANGE);
          });

          it("Exchange is not in a disputed state", async function () {
            exchangeId++;

            // Commit to offer, creating a new exchange
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

            // Attempt to escalate the dispute, expecting revert
            await expect(disputeHandler.connect(buyer).escalateDispute(exchangeId), {
              value: buyerEscalationDepositNative,
            }).to.revertedWith(RevertReasons.INVALID_STATE);
          });

          it("Caller is not the buyer for the given exchange id", async function () {
            // Attempt to retract the dispute, expecting revert
            await expect(disputeHandler.connect(rando).escalateDispute(exchangeId), {
              value: buyerEscalationDepositNative,
            }).to.revertedWith(RevertReasons.NOT_VOUCHER_HOLDER);
          });

          it("Dispute has expired", async function () {
            // Set time forward past the dispute resolution period
            await setNextBlockTimestamp(Number(timeout) + oneWeek);

            // Attempt to escalate the dispute, expecting revert
            await expect(disputeHandler.connect(buyer).escalateDispute(exchangeId), {
              value: buyerEscalationDepositNative,
            }).to.revertedWith(RevertReasons.DISPUTE_HAS_EXPIRED);
          });

          it("Dispute is in some state other than resolving", async function () {
            // Retract the dispute, put it into RETRACTED state
            await disputeHandler.connect(buyer).retractDispute(exchangeId);

            // Attempt to escalate the dispute, expecting revert
            await expect(disputeHandler.connect(buyer).escalateDispute(exchangeId)).to.revertedWith(
              RevertReasons.INVALID_STATE
            );
          });

          it("Dispute resolver is not specified (absolute zero offer)", async function () {
            // Create and absolute zero offer without DR
            // Prepare an absolute zero offer
            offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = "0";
            offer.id++;
            disputeResolverId = "0";

            // Create a new offer
            await offerHandler
              .connect(operator)
              .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

            // Commit to offer and put exchange all the way to dispute
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offer.id);
            await exchangeHandler.connect(buyer).redeemVoucher(++exchangeId);
            await disputeHandler.connect(buyer).raiseDispute(exchangeId);

            // Attempt to escalate the dispute, expecting revert
            await expect(disputeHandler.connect(buyer).escalateDispute(exchangeId)).to.revertedWith(
              RevertReasons.ESCALATION_NOT_ALLOWED
            );
          });

          it("Insufficient native currency sent", async function () {
            // Attempt to escalate the dispute, expecting revert
            await expect(
              disputeHandler.connect(buyer).escalateDispute(exchangeId, {
                value: ethers.BigNumber.from(buyerEscalationDepositNative).sub("1").toString(),
              })
            ).to.revertedWith(RevertReasons.INSUFFICIENT_VALUE_SENT);
          });

          it("Native currency sent together with ERC20 token transfer", async function () {
            await createDisputeExchangeWithToken();

            // Attempt to escalate the dispute, expecting revert
            await expect(
              disputeHandler.connect(buyer).escalateDispute(exchangeId, {
                value: ethers.BigNumber.from(buyerEscalationDepositNative).sub("1").toString(),
              })
            ).to.revertedWith(RevertReasons.NATIVE_NOT_ALLOWED);
          });

          it("Token address is not a contract", async function () {
            // prepare a disputed exchange
            const mockToken = await createDisputeExchangeWithToken();

            // self destruct a contract
            await mockToken.destruct();

            // Attempt to commit to an offer, expecting revert
            await expect(disputeHandler.connect(buyer).escalateDispute(exchangeId)).to.revertedWith(
              RevertReasons.EOA_FUNCTION_CALL
            );
          });

          it("Token contract revert for another reason", async function () {
            // prepare a disputed exchange
            const mockToken = await createDisputeExchangeWithToken();

            // get rid of some tokens, so buyer has insufficient funds
            await mockToken.connect(buyer).transfer(other1.address, buyerEscalationDepositNative);

            // Attempt to commit to an offer, expecting revert
            await expect(disputeHandler.connect(buyer).escalateDispute(exchangeId)).to.revertedWith(
              RevertReasons.ERC20_EXCEEDS_BALANCE
            );

            // not approved
            await mockToken
              .connect(buyer)
              .approve(protocolDiamond.address, ethers.BigNumber.from(buyerEscalationDepositToken).sub("1").toString());
            // Attempt to commit to an offer, expecting revert
            await expect(disputeHandler.connect(buyer).escalateDispute(exchangeId)).to.revertedWith(
              RevertReasons.ERC20_INSUFFICIENT_ALLOWANCE
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
          block = await ethers.provider.getBlock(blockNumber);
          disputedDate = block.timestamp.toString();

          // Escalate the dispute
          tx = await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

          // Get the block timestamp of the confirmed tx and set escalatedDate
          blockNumber = tx.blockNumber;
          block = await ethers.provider.getBlock(blockNumber);
          escalatedDate = block.timestamp.toString();
          timeout = ethers.BigNumber.from(escalatedDate).add(escalationPeriod).toString();

          // buyer percent used in tests
          buyerPercent = "4321";
        });

        it("should emit a DisputeDecided event", async function () {
          // Escalate the dispute, testing for the event
          await expect(disputeHandler.connect(operatorDR).decideDispute(exchangeId, buyerPercent))
            .to.emit(disputeHandler, "DisputeDecided")
            .withArgs(exchangeId, buyerPercent, operatorDR.address);
        });

        it("should update state", async function () {
          // Decide the dispute
          tx = await disputeHandler.connect(operatorDR).decideDispute(exchangeId, buyerPercent);

          // Get the block timestamp of the confirmed tx and set finalizedDate
          blockNumber = tx.blockNumber;
          block = await ethers.provider.getBlock(blockNumber);
          finalizedDate = block.timestamp.toString();

          dispute = new Dispute(exchangeId, DisputeState.Decided, buyerPercent);
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
            await expect(disputeHandler.connect(operatorDR).decideDispute(exchangeId, buyerPercent)).to.revertedWith(
              RevertReasons.REGION_PAUSED
            );
          });

          it("Specified buyer percent exceeds 100%", async function () {
            // Set buyer percent above 100%
            buyerPercent = "12000"; // 120%

            // Attempt to decide the dispute, expecting revert
            await expect(disputeHandler.connect(operatorDR).decideDispute(exchangeId, buyerPercent)).to.revertedWith(
              RevertReasons.INVALID_BUYER_PERCENT
            );
          });

          it("Exchange does not exist", async function () {
            // An invalid exchange id
            const exchangeId = "666";

            // Attempt to decide the dispute, expecting revert
            await expect(disputeHandler.connect(operatorDR).decideDispute(exchangeId, buyerPercent)).to.revertedWith(
              RevertReasons.NO_SUCH_EXCHANGE
            );
          });

          it("Exchange is not in a disputed state", async function () {
            exchangeId++;

            // Commit to offer, creating a new exchange
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

            // Attempt to decide the dispute, expecting revert
            await expect(disputeHandler.connect(operatorDR).decideDispute(exchangeId, buyerPercent)).to.revertedWith(
              RevertReasons.INVALID_STATE
            );
          });

          it("Caller is not the dispute resolver for this dispute", async function () {
            // Attempt to decide the dispute, expecting revert
            await expect(disputeHandler.connect(rando).decideDispute(exchangeId, buyerPercent)).to.revertedWith(
              RevertReasons.NOT_DISPUTE_RESOLVER_OPERATOR
            );
          });

          it("Dispute state is not escalated", async function () {
            exchangeId++;

            // Commit to offer, creating a new exchange
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

            // Redeem voucher
            await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

            // Raise a dispute
            await disputeHandler.connect(buyer).raiseDispute(exchangeId);

            // Attempt to decide the dispute, expecting revert
            await expect(disputeHandler.connect(operatorDR).decideDispute(exchangeId, buyerPercent)).to.revertedWith(
              RevertReasons.INVALID_STATE
            );
          });

          it("Dispute escalation response period has elapsed", async function () {
            // Set time past escalation period
            await setNextBlockTimestamp(Number(escalatedDate) + Number(escalationPeriod));

            // Attempt to decide the dispute, expecting revert
            await expect(disputeHandler.connect(operatorDR).decideDispute(exchangeId, buyerPercent)).to.revertedWith(
              RevertReasons.DISPUTE_HAS_EXPIRED
            );
          });
        });
      });

      context("👉 expireEscalatedDispute()", async function () {
        beforeEach(async function () {
          // Raise a dispute
          tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Get the block timestamp of the confirmed tx and set disputedDate
          blockNumber = tx.blockNumber;
          block = await ethers.provider.getBlock(blockNumber);
          disputedDate = block.timestamp.toString();

          // Escalate the dispute
          tx = await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

          // Get the block timestamp of the confirmed tx and set escalatedDate
          blockNumber = tx.blockNumber;
          block = await ethers.provider.getBlock(blockNumber);
          escalatedDate = block.timestamp.toString();
          timeout = ethers.BigNumber.from(escalatedDate).add(escalationPeriod).toString();
        });

        it("should emit a EscalatedDisputeExpired event", async function () {
          // Set time forward past the dispute escalation period
          await setNextBlockTimestamp(Number(escalatedDate) + Number(escalationPeriod));

          // Expire the escalated dispute, testing for the event
          await expect(disputeHandler.connect(rando).expireEscalatedDispute(exchangeId))
            .to.emit(disputeHandler, "EscalatedDisputeExpired")
            .withArgs(exchangeId, rando.address);
        });

        it("should update state", async function () {
          // Set time forward past the dispute escalation period
          await setNextBlockTimestamp(Number(escalatedDate) + Number(escalationPeriod));

          // Expire the dispute
          tx = await disputeHandler.connect(rando).expireEscalatedDispute(exchangeId);

          // Get the block timestamp of the confirmed tx and set finalizedDate
          blockNumber = tx.blockNumber;
          block = await ethers.provider.getBlock(blockNumber);
          finalizedDate = block.timestamp.toString();

          dispute = new Dispute(exchangeId, DisputeState.Refused, buyerPercent);
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
            await setNextBlockTimestamp(Number(escalatedDate) + Number(escalationPeriod));

            // Pause the disputes region of the protocol
            await pauseHandler.connect(pauser).pause([PausableRegion.Disputes]);

            // Attempt to expire an escalated dispute, expecting revert
            await expect(disputeHandler.connect(rando).expireEscalatedDispute(exchangeId)).to.revertedWith(
              RevertReasons.REGION_PAUSED
            );
          });

          it("Exchange does not exist", async function () {
            // An invalid exchange id
            const exchangeId = "666";

            // Attempt to expire the escalated dispute, expecting revert
            await expect(disputeHandler.connect(rando).expireEscalatedDispute(exchangeId)).to.revertedWith(
              RevertReasons.NO_SUCH_EXCHANGE
            );
          });

          it("Exchange is not in a disputed state", async function () {
            exchangeId++;

            // Commit to offer, creating a new exchange
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

            // Attempt to expire the escalated dispute, expecting revert
            await expect(disputeHandler.connect(rando).expireEscalatedDispute(exchangeId)).to.revertedWith(
              RevertReasons.INVALID_STATE
            );
          });

          it("Dispute escalation period has not passed yet", async function () {
            // Attempt to expire the escalated dispute, expecting revert
            await expect(disputeHandler.connect(rando).expireEscalatedDispute(exchangeId)).to.revertedWith(
              RevertReasons.DISPUTE_STILL_VALID
            );
          });

          it("Dispute is in some state other than escalated", async function () {
            exchangeId++;

            // Commit to offer, creating a new exchange
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

            // Redeem voucher
            await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

            // Raise a dispute
            await disputeHandler.connect(buyer).raiseDispute(exchangeId);

            // dispute raised but not escalated
            // Attempt to expire the escalated dispute, expecting revert
            await expect(disputeHandler.connect(rando).expireEscalatedDispute(exchangeId)).to.revertedWith(
              RevertReasons.INVALID_STATE
            );

            // Retract the dispute, put it into RETRACTED state
            await disputeHandler.connect(buyer).retractDispute(exchangeId);

            // Attempt to expire the retracted dispute, expecting revert
            await expect(disputeHandler.connect(rando).expireEscalatedDispute(exchangeId)).to.revertedWith(
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
          block = await ethers.provider.getBlock(blockNumber);
          disputedDate = block.timestamp.toString();

          // Escalate the dispute
          tx = await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

          // Get the block timestamp of the confirmed tx and set escalatedDate
          blockNumber = tx.blockNumber;
          block = await ethers.provider.getBlock(blockNumber);
          escalatedDate = block.timestamp.toString();
          timeout = ethers.BigNumber.from(escalatedDate).add(escalationPeriod).toString();
        });

        it("should emit a EscalatedDisputeRefused event", async function () {
          // Expire the escalated dispute, testing for the event
          await expect(disputeHandler.connect(operatorDR).refuseEscalatedDispute(exchangeId))
            .to.emit(disputeHandler, "EscalatedDisputeRefused")
            .withArgs(exchangeId, operatorDR.address);
        });

        it("should update state", async function () {
          // Expire the dispute
          tx = await disputeHandler.connect(operatorDR).refuseEscalatedDispute(exchangeId);

          // Get the block timestamp of the confirmed tx and set finalizedDate
          blockNumber = tx.blockNumber;
          block = await ethers.provider.getBlock(blockNumber);
          finalizedDate = block.timestamp.toString();

          dispute = new Dispute(exchangeId, DisputeState.Refused, buyerPercent);
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
            await expect(disputeHandler.connect(operatorDR).refuseEscalatedDispute(exchangeId)).to.revertedWith(
              RevertReasons.REGION_PAUSED
            );
          });

          it("Exchange does not exist", async function () {
            // An invalid exchange id
            const exchangeId = "666";

            // Attempt to refuse the escalated dispute, expecting revert
            await expect(disputeHandler.connect(operatorDR).refuseEscalatedDispute(exchangeId)).to.revertedWith(
              RevertReasons.NO_SUCH_EXCHANGE
            );
          });

          it("Exchange is not in a disputed state", async function () {
            exchangeId++;

            // Commit to offer, creating a new exchange
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

            // Attempt to refuse the escalated dispute, expecting revert
            await expect(disputeHandler.connect(operatorDR).refuseEscalatedDispute(exchangeId)).to.revertedWith(
              RevertReasons.INVALID_STATE
            );
          });

          it("Dispute is in some state other than escalated", async function () {
            exchangeId++;

            // Commit to offer, creating a new exchange
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

            // Redeem voucher
            await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

            // Raise a dispute
            await disputeHandler.connect(buyer).raiseDispute(exchangeId);

            // dispute raised but not escalated
            // Attempt to refuse the escalated dispute, expecting revert
            await expect(disputeHandler.connect(operatorDR).refuseEscalatedDispute(exchangeId)).to.revertedWith(
              RevertReasons.INVALID_STATE
            );

            // Retract the dispute, put it into RETRACTED state
            await disputeHandler.connect(buyer).retractDispute(exchangeId);

            // Attempt to refuse the retracted dispute, expecting revert
            await expect(disputeHandler.connect(operatorDR).refuseEscalatedDispute(exchangeId)).to.revertedWith(
              RevertReasons.INVALID_STATE
            );
          });

          it("Dispute escalation response period has elapsed", async function () {
            // Set time forward past the dispute escalation period
            await setNextBlockTimestamp(Number(escalatedDate) + Number(escalationPeriod));

            // Attempt to refuse the escalated dispute, expecting revert
            await expect(disputeHandler.connect(operatorDR).refuseEscalatedDispute(exchangeId)).to.revertedWith(
              RevertReasons.DISPUTE_HAS_EXPIRED
            );
          });

          it("Caller is not the dispute resolver for this dispute", async function () {
            // Attempt to refuse the escalated dispute, expecting revert
            await expect(disputeHandler.connect(rando).refuseEscalatedDispute(exchangeId)).to.revertedWith(
              RevertReasons.NOT_DISPUTE_RESOLVER_OPERATOR
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
          block = await ethers.provider.getBlock(blockNumber);
          disputedDate = block.timestamp.toString();
          timeout = ethers.BigNumber.from(disputedDate).add(resolutionPeriod).toString();

          // Expected value for dispute
          dispute = new Dispute(exchangeId, DisputeState.Resolving, buyerPercent);
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
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

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

        it("should return the expected dispute state if exchange id is valid", async function () {
          // TODO when retract/resolve/decide is implemented, use it here, since DisputeState.Resolving is default value
          // Get the dispute state
          [exists, response] = await disputeHandler.connect(rando).getDisputeState(exchangeId);

          // It should match DisputeState.Resolving
          assert.equal(response, DisputeState.Resolving, "Dispute state is incorrect");
        });
      });

      context("👉 getDisputeTimeout()", async function () {
        beforeEach(async function () {
          // Raise a dispute
          tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Get the block timestamp of the confirmed tx and set disputedDate
          blockNumber = tx.blockNumber;
          block = await ethers.provider.getBlock(blockNumber);
          disputedDate = block.timestamp.toString();
          timeout = ethers.BigNumber.from(disputedDate).add(resolutionPeriod).toString();
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
            buyerPercent = "1234";

            // Set the message Type, needed for signature
            resolutionType = [
              { name: "exchangeId", type: "uint256" },
              { name: "buyerPercent", type: "uint256" },
            ];

            customSignatureType = {
              Resolution: resolutionType,
            };

            message = {
              exchangeId: exchangeId,
              buyerPercent,
            };

            // Collect the signature components
            ({ r, s, v } = await prepareDataSignatureParameters(
              buyer, // When seller is the caller, buyer should be the signer.
              customSignatureType,
              "Resolution",
              message,
              disputeHandler.address
            ));

            // Retract dispute
            await disputeHandler.connect(operator).resolveDispute(exchangeId, buyerPercent, r, s, v);

            // Dispute in resolved state, ask if exchange is finalized
            [exists, response] = await disputeHandler.connect(rando).isDisputeFinalized(exchangeId);

            // It should exist and be finalized
            assert.equal(exists, true, "Incorrectly reports existence");
            assert.equal(response, true, "Incorrectly reports unfinalized state");
          });

          it("should return true if dispute is in Decided state", async function () {
            buyerPercent = "1234";

            // Escalate dispute
            await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

            // Retract dispute
            await disputeHandler.connect(operatorDR).decideDispute(exchangeId, buyerPercent);

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
            block = await ethers.provider.getBlock(blockNumber);
            escalatedDate = block.timestamp.toString();

            await setNextBlockTimestamp(Number(escalatedDate) + Number(escalationPeriod));

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
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

          // Redeem voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);
        }
      });

      context("👉 expireDisputeBatch()", async function () {
        beforeEach(async function () {
          // Set the buyer percent
          buyerPercent = "0";

          disputesToExpire = ["2", "3", "4"];
          dispute = {};
          disputeDates = {};

          for (exchangeId of disputesToExpire) {
            // Raise a dispute for exchanges 2,3 and 4
            tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

            // Get the block timestamp of the confirmed tx and set disputedDate
            blockNumber = tx.blockNumber;
            block = await ethers.provider.getBlock(blockNumber);
            disputedDate = block.timestamp.toString();
            timeout = ethers.BigNumber.from(disputedDate).add(resolutionPeriod).toString();

            dispute[exchangeId] = new Dispute(exchangeId, DisputeState.Retracted, buyerPercent);
            disputeDates[exchangeId] = new DisputeDates(disputedDate, "0", finalizedDate, timeout);
          }
        });

        it("should emit a DisputeExpired event for all events", async function () {
          // Set time forward past the dispute resolution period
          await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

          // Expire the disputes, testing for the event
          const tx = disputeHandler.connect(rando).expireDisputeBatch(disputesToExpire);
          await expect(tx).to.emit(disputeHandler, "DisputeExpired").withArgs("2", rando.address);

          await expect(tx).to.emit(disputeHandler, "DisputeExpired").withArgs("3", rando.address);

          await expect(tx).to.emit(disputeHandler, "DisputeExpired").withArgs("4", rando.address);
        });

        it("should update state", async function () {
          // Set time forward past the dispute resolution period
          await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

          // Expire the dispute
          tx = await disputeHandler.connect(rando).expireDisputeBatch(disputesToExpire);

          // Get the block timestamp of the confirmed tx and set finalizedDate
          blockNumber = tx.blockNumber;
          block = await ethers.provider.getBlock(blockNumber);
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
            await expect(disputeHandler.connect(rando).expireDisputeBatch(disputesToExpire)).to.revertedWith(
              RevertReasons.REGION_PAUSED
            );
          });

          it("Exchange does not exist", async function () {
            await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

            // Add an invalid exchange id
            disputesToExpire.push("666");

            // Attempt to expire the disputes, expecting revert
            await expect(disputeHandler.connect(rando).expireDisputeBatch(disputesToExpire)).to.revertedWith(
              RevertReasons.NO_SUCH_EXCHANGE
            );
          });

          it("Exchange is not in a disputed state", async function () {
            await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

            // add exchange that is not disputed
            disputesToExpire.push("1");

            // Attempt to expire the disputes, expecting revert
            await expect(disputeHandler.connect(rando).expireDisputeBatch(disputesToExpire)).to.revertedWith(
              RevertReasons.INVALID_STATE
            );
          });

          it("Dispute has not expired yet", async function () {
            // Attempt to expire the disputes, expecting revert
            await expect(disputeHandler.connect(rando).expireDisputeBatch(disputesToExpire)).to.revertedWith(
              RevertReasons.DISPUTE_STILL_VALID
            );
          });

          it("Dispute is in some state other than resolving", async function () {
            await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

            // Retract the dispute, put it into RETRACTED state
            await disputeHandler.connect(buyer).retractDispute("3");

            // Attempt to expire the disputes, expecting revert
            await expect(disputeHandler.connect(rando).expireDisputeBatch(disputesToExpire)).to.revertedWith(
              RevertReasons.INVALID_STATE
            );
          });

          it("Expiring too many disputes", async function () {
            // Try to expire the more than 100 disputes
            disputesToExpire = [...Array(101).keys()];

            // Attempt to expire the disputes, expecting revert
            await expect(disputeHandler.connect(rando).expireDisputeBatch(disputesToExpire)).to.revertedWith(
              RevertReasons.TOO_MANY_DISPUTES
            );
          });
        });
      });
    });
  });
});
