const hre = require("hardhat");
const ethers = hre.ethers;
const { expect, assert } = require("chai");

const Role = require("../../scripts/domain/Role");
const Exchange = require("../../scripts/domain/Exchange");
const Voucher = require("../../scripts/domain/Voucher");
const Seller = require("../../scripts/domain/Seller");
const Buyer = require("../../scripts/domain/Buyer");
const DisputeResolver = require("../../scripts/domain/DisputeResolver");
const ExchangeState = require("../../scripts/domain/ExchangeState");
const Dispute = require("../../scripts/domain/Dispute");
const DisputeState = require("../../scripts/domain/DisputeState");
const DisputeDates = require("../../scripts/domain/DisputeDates");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const { setNextBlockTimestamp, prepareDataSignatureParameters } = require("../../scripts/util/test-utils.js");
const { oneWeek, oneMonth } = require("../utils/constants");
const { mockOffer } = require("../utils/mock");

/**
 *  Test the Boson Dispute Handler interface
 */
describe("IBosonDisputeHandler", function () {
  // Common vars
  let InterfaceIds;
  let accounts, deployer, operator, admin, clerk, treasury, rando, buyer, other1, other2;
  let erc165,
    protocolDiamond,
    accessController,
    accountHandler,
    exchangeHandler,
    offerHandler,
    fundsHandler,
    disputeHandler;
  let bosonVoucher, bosonToken, gasLimit;
  let id, buyerId, offer, offerId, seller, sellerId;
  let block, blockNumber, tx, clients;
  let support, newTime;
  let price, quantityAvailable, resolutionPeriod, fulfillmentPeriod, sellerDeposit;
  let voucherRedeemableFrom, offerDates, offerDurations;
  let protocolFeePercentage, protocolFeeFlatBoson;
  let voucher, committedDate, validUntilDate, redeemedDate, expired;
  let exchange, exchangeStruct, finalizedDate, state;
  let dispute, disputedDate, escalatedDate, complaint, disputeStruct, timeout, newDisputeTimeout;
  let disputeDates, disputeDatesStruct;
  let exists, response;
  let disputeResolver, active;
  let buyerPercent;
  let resolutionType, customSignatureType, message, r, s, v;
  let returnedDispute, returnedDisputeDates;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();
  });

  beforeEach(async function () {
    // Make accounts available
    accounts = await ethers.getSigners();
    deployer = accounts[0];
    operator = accounts[1];
    admin = accounts[2];
    clerk = accounts[3];
    treasury = accounts[4];
    buyer = accounts[5];
    disputeResolver = accounts[6];
    rando = accounts[7];
    other1 = accounts[8];
    other2 = accounts[9];

    // Deploy the Protocol Diamond
    [protocolDiamond, , , accessController] = await deployProtocolDiamond();

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Grant PROTOCOL role to ProtocolDiamond address and renounces admin
    await accessController.grantRole(Role.PROTOCOL, protocolDiamond.address);

    // Cut the protocol handler facets into the Diamond
    await deployProtocolHandlerFacets(protocolDiamond, [
      "AccountHandlerFacet",
      "ExchangeHandlerFacet",
      "OfferHandlerFacet",
      "FundsHandlerFacet",
      "DisputeHandlerFacet",
    ]);

    // Deploy the Protocol client implementation/proxy pairs (currently just the Boson Voucher)
    const protocolClientArgs = [accessController.address, protocolDiamond.address];
    [, , clients] = await deployProtocolClients(protocolClientArgs, gasLimit);
    [bosonVoucher] = clients;
    await accessController.grantRole(Role.CLIENT, bosonVoucher.address);

    // Deploy the boson token
    [bosonToken] = await deployMockTokens(gasLimit, ["BosonToken"]);

    // set protocolFees
    protocolFeePercentage = "200"; // 2 %
    protocolFeeFlatBoson = ethers.utils.parseUnits("0.01", "ether").toString();

    // Add config Handler, so ids start at 1, and so voucher address can be found
    const protocolConfig = [
      // Protocol addresses
      {
        treasuryAddress: "0x0000000000000000000000000000000000000000",
        tokenAddress: bosonToken.address,
        voucherAddress: bosonVoucher.address,
      },
      // Protocol limits
      {
        maxOffersPerGroup: 0,
        maxTwinsPerBundle: 0,
        maxOffersPerBundle: 0,
        maxOffersPerBatch: 0,
        maxTokensPerWithdrawal: 0,
      },
      // Protocol fees
      {
        percentage: protocolFeePercentage,
        flatBoson: protocolFeeFlatBoson,
      },
    ];

    // Deploy the Config facet, initializing the protocol config
    await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);

    // Cast Diamond to IERC165
    erc165 = await ethers.getContractAt("IERC165", protocolDiamond.address);

    // Cast Diamond to IBosonAccountHandler
    accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);

    // Cast Diamond to IBosonOfferHandler
    offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);

    // Cast Diamond to IBosonExchangeHandler
    exchangeHandler = await ethers.getContractAt("IBosonExchangeHandler", protocolDiamond.address);

    // Cast Diamond to IBosonFundsHandler
    fundsHandler = await ethers.getContractAt("IBosonFundsHandler", protocolDiamond.address);

    // Cast Diamond to IBosonDisputeHandler
    disputeHandler = await ethers.getContractAt("IBosonDisputeHandler", protocolDiamond.address);
  });

  // Interface support (ERC-156 provided by ProtocolDiamond, others by deployed facets)
  context("📋 Interfaces", async function () {
    context("👉 supportsInterface()", async function () {
      it("should indicate support for IBosonDisputeHandler interface", async function () {
        // Current interfaceId for IBosonDisputeHandler
        support = await erc165.supportsInterface(InterfaceIds.IBosonDisputeHandler);

        // Test
        await expect(support, "IBosonDisputeHandler interface not supported").is.true;
      });
    });
  });

  // All supported Dispute methods
  context("📋 Dispute Handler Methods", async function () {
    beforeEach(async function () {
      // Initial ids for all the things
      id = offerId = sellerId = "1";
      buyerId = "3"; // created after seller and dispute resolver

      // Create a valid seller
      seller = new Seller(id, operator.address, admin.address, clerk.address, treasury.address, true);
      expect(seller.isValid()).is.true;
      await accountHandler.connect(admin).createSeller(seller);

      // Create a valid dispute resolver
      active = true;
      const disputeResolverEntity = new DisputeResolver(id.toString(), disputeResolver.address, active);
      expect(disputeResolverEntity.isValid()).is.true;

      // Register the dispute resolver
      await accountHandler.connect(rando).createDisputeResolver(disputeResolverEntity);

      // Mock offer
      const mo = await mockOffer();
      offer = mo.offer;
      price = offer.price;
      sellerDeposit = offer.sellerDeposit;
      fulfillmentPeriod = offer.fulfillmentPeriod;
      resolutionPeriod = offer.resolutionPeriod;
      quantityAvailable = offer.quantityAvailable;
      expect(offer.isValid()).is.true;

      offerDates = mo.offerDates;
      voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
      expect(offerDates.isValid()).is.true;

      offerDurations = mo.offerDurations;
      expect(offerDurations.isValid()).is.true;

      // Create the offer
      await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations);

      // Required voucher constructor params
      committedDate = "0";
      validUntilDate = "0";
      redeemedDate = "0";
      expired = false;
      voucher = new Voucher(committedDate, validUntilDate, redeemedDate, expired);

      // Required exchange constructor params
      finalizedDate = "0";
      state = ExchangeState.Committed;
      exchange = new Exchange(id, offerId, buyerId, finalizedDate, voucher, state);

      // Deposit seller funds so the commit will succeed
      const fundsToDeposit = ethers.BigNumber.from(sellerDeposit).mul(quantityAvailable);
      await fundsHandler
        .connect(operator)
        .depositFunds(seller.id, ethers.constants.AddressZero, fundsToDeposit, { value: fundsToDeposit });

      // Commit to offer, creating a new exchange
      await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

      // Set time forward to the offer's voucherRedeemableFrom
      await setNextBlockTimestamp(Number(voucherRedeemableFrom));

      // Redeem voucher
      await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

      // Set the dispute reason and buyer percent
      complaint = "Tastes weird";
      buyerPercent = "0";
    });

    context("👉 raiseDispute()", async function () {
      it("should emit a DisputeRaised event", async function () {
        // Raise a dispute, testing for the event
        await expect(disputeHandler.connect(buyer).raiseDispute(exchange.id, complaint))
          .to.emit(disputeHandler, "DisputeRaised")
          .withArgs(exchange.id, buyerId, sellerId, complaint, buyer.address);
      });

      it("should update state", async function () {
        // Raise a dispute
        tx = await disputeHandler.connect(buyer).raiseDispute(exchange.id, complaint);

        // Get the block timestamp of the confirmed tx and set disputedDate
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);
        disputedDate = block.timestamp.toString();
        timeout = ethers.BigNumber.from(disputedDate).add(resolutionPeriod).toString();

        // expected values
        dispute = new Dispute(exchange.id, complaint, DisputeState.Resolving, buyerPercent);
        disputeDates = new DisputeDates(disputedDate, "0", "0", timeout);

        // Get the dispute as a struct
        [, disputeStruct, disputeDatesStruct] = await disputeHandler.connect(rando).getDispute(exchange.id);

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
        it("Caller does not hold a voucher for the given exchange id", async function () {
          // Attempt to raise a dispute, expecting revert
          await expect(disputeHandler.connect(rando).raiseDispute(exchange.id, complaint)).to.revertedWith(
            RevertReasons.NOT_VOUCHER_HOLDER
          );
        });

        it("Exchange id is invalid", async function () {
          // An invalid exchange id
          const exchangeId = "666";

          // Attempt to raise a dispute, expecting revert
          await expect(disputeHandler.connect(buyer).raiseDispute(exchangeId, complaint)).to.revertedWith(
            RevertReasons.NO_SUCH_EXCHANGE
          );
        });

        it("exchange is not in a redeemed state - completed", async function () {
          // Set time forward to run out the fulfillment period
          newTime = Number((voucherRedeemableFrom + Number(fulfillmentPeriod) + 1).toString().substring(0, 11));
          await setNextBlockTimestamp(newTime);

          // Complete exchange
          await exchangeHandler.connect(operator).completeExchange(exchange.id);

          // Attempt to raise a dispute, expecting revert
          await expect(disputeHandler.connect(buyer).raiseDispute(exchange.id, complaint)).to.revertedWith(
            RevertReasons.INVALID_STATE
          );
        });

        it("exchange is not in a redeemed state - disputed already", async function () {
          // Raise a dispute, put it into DISPUTED state
          await disputeHandler.connect(buyer).raiseDispute(exchange.id, complaint);

          // Attempt to raise a dispute, expecting revert
          await expect(disputeHandler.connect(buyer).raiseDispute(exchange.id, complaint)).to.revertedWith(
            RevertReasons.INVALID_STATE
          );
        });

        it("The complaint is blank", async function () {
          complaint = "";

          // Attempt to raise a dispute, expecting revert
          await expect(disputeHandler.connect(buyer).raiseDispute(exchange.id, complaint)).to.revertedWith(
            RevertReasons.COMPLAINT_MISSING
          );
        });

        it("The fulfilment period has already elapsed", async function () {
          // Get the redemption date
          [, exchangeStruct] = await exchangeHandler.connect(rando).getExchange(exchange.id);
          const voucherRedeemedDate = exchangeStruct.voucher.redeemedDate;

          // Set time forward past the dispute resolution period
          await setNextBlockTimestamp(voucherRedeemedDate.add(fulfillmentPeriod).add(1).toNumber());

          // Attempt to raise a dispute, expecting revert
          await expect(disputeHandler.connect(buyer).raiseDispute(exchange.id, complaint)).to.revertedWith(
            RevertReasons.FULFILLMENT_PERIOD_HAS_ELAPSED
          );
        });
      });
    });

    context("👉 retractDispute()", async function () {
      beforeEach(async function () {
        // Raise a dispute
        tx = await disputeHandler.connect(buyer).raiseDispute(exchange.id, complaint);

        // Get the block timestamp of the confirmed tx and set disputedDate
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);
        disputedDate = block.timestamp.toString();
        timeout = ethers.BigNumber.from(disputedDate).add(resolutionPeriod).toString();
      });

      it("should emit a DisputeRetracted event", async function () {
        // Retract the dispute, testing for the event
        await expect(disputeHandler.connect(buyer).retractDispute(exchange.id))
          .to.emit(disputeHandler, "DisputeRetracted")
          .withArgs(exchange.id, buyer.address);
      });

      it("should update state", async function () {
        // Retract the dispute
        tx = await disputeHandler.connect(buyer).retractDispute(exchange.id);

        // Get the block timestamp of the confirmed tx and set finalizedDate
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);
        finalizedDate = block.timestamp.toString();

        dispute = new Dispute(exchange.id, complaint, DisputeState.Retracted, buyerPercent);
        disputeDates = new DisputeDates(disputedDate, "0", finalizedDate, timeout);

        // Get the dispute as a struct
        [, disputeStruct, disputeDatesStruct] = await disputeHandler.connect(rando).getDispute(exchange.id);

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
        [exists, response] = await disputeHandler.connect(rando).getDisputeState(exchange.id);

        // It should match DisputeState.Retracted
        assert.equal(response, DisputeState.Retracted, "Dispute state is incorrect");

        // exchange should also be finalized
        // Get the exchange as a struct
        [, exchangeStruct] = await exchangeHandler.connect(rando).getExchange(exchange.id);

        // Parse into entity
        let returnedExchange = Exchange.fromStruct(exchangeStruct);

        // FinalizeDate should be set correctly
        assert.equal(returnedExchange.finalizedDate, finalizedDate, "Exchange finalizeDate is incorect");
      });

      it("dispute can be retracted if it's in escalated state", async function () {
        // Escalate a dispute
        await disputeHandler.connect(buyer).escalateDispute(exchange.id);

        // Retract the dispute, testing for the event
        await expect(disputeHandler.connect(buyer).retractDispute(exchange.id))
          .to.emit(disputeHandler, "DisputeRetracted")
          .withArgs(exchange.id, buyer.address);
      });

      context("💔 Revert Reasons", async function () {
        it("Exchange does not exist", async function () {
          // An invalid exchange id
          const exchangeId = "666";

          // Attempt to retract the dispute, expecting revert
          await expect(disputeHandler.connect(buyer).retractDispute(exchangeId)).to.revertedWith(
            RevertReasons.NO_SUCH_EXCHANGE
          );
        });

        it("Exchange is not in a disputed state", async function () {
          exchange.id++;

          // Commit to offer, creating a new exchange
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

          // Attempt to retract the dispute, expecting revert
          await expect(disputeHandler.connect(buyer).retractDispute(exchange.id)).to.revertedWith(
            RevertReasons.INVALID_STATE
          );
        });

        it("Caller is not the buyer for the given exchange id", async function () {
          // Attempt to retract the dispute, expecting revert
          await expect(disputeHandler.connect(rando).retractDispute(exchange.id)).to.revertedWith(
            RevertReasons.NOT_VOUCHER_HOLDER
          );
        });

        it("Dispute is in some state other than resolving or escalated", async function () {
          // Retract the dispute, put it into RETRACTED state
          await disputeHandler.connect(buyer).retractDispute(exchange.id);

          // Attempt to retract the dispute, expecting revert
          await expect(disputeHandler.connect(buyer).retractDispute(exchange.id)).to.revertedWith(
            RevertReasons.INVALID_STATE
          );
        });
      });
    });

    context("👉 extendDisputeTimeout()", async function () {
      beforeEach(async function () {
        // Raise a dispute
        tx = await disputeHandler.connect(buyer).raiseDispute(exchange.id, complaint);

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
        await expect(disputeHandler.connect(operator).extendDisputeTimeout(exchange.id, newDisputeTimeout))
          .to.emit(disputeHandler, "DisputeTimeoutExtended")
          .withArgs(exchange.id, newDisputeTimeout, operator.address);
      });

      it("should update state", async function () {
        // Extend the dispute timeout
        await disputeHandler.connect(operator).extendDisputeTimeout(exchange.id, newDisputeTimeout);

        dispute = new Dispute(exchange.id, complaint, DisputeState.Resolving, "0");
        disputeDates = new DisputeDates(disputedDate, "0", "0", newDisputeTimeout);

        // Get the dispute as a struct
        [, disputeStruct, disputeDatesStruct] = await disputeHandler.connect(rando).getDispute(exchange.id);

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
        [exists, response] = await disputeHandler.connect(rando).getDisputeTimeout(exchange.id);

        // It should match newDisputeTimeout
        assert.equal(response, newDisputeTimeout, "Dispute timeout is incorrect");
      });

      it("dispute timeout can be extended multiple times", async function () {
        // Extend the dispute timeout
        await disputeHandler.connect(operator).extendDisputeTimeout(exchange.id, newDisputeTimeout);

        // not strictly necessary, but it shows that we can extend event if we are past original timeout
        await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

        // extend for another week
        newDisputeTimeout = ethers.BigNumber.from(newDisputeTimeout).add(oneWeek).toString();

        // Extend the dispute timeout, testing for the event
        await expect(disputeHandler.connect(operator).extendDisputeTimeout(exchange.id, newDisputeTimeout))
          .to.emit(disputeHandler, "DisputeTimeoutExtended")
          .withArgs(exchange.id, newDisputeTimeout, operator.address);
      });

      context("💔 Revert Reasons", async function () {
        it("Exchange does not exist", async function () {
          // An invalid exchange id
          const exchangeId = "666";

          // Attempt to extend the dispute timeout, expecting revert
          await expect(
            disputeHandler.connect(operator).extendDisputeTimeout(exchangeId, newDisputeTimeout)
          ).to.revertedWith(RevertReasons.NO_SUCH_EXCHANGE);
        });

        it("Exchange is not in a disputed state", async function () {
          exchange.id++;

          // Commit to offer, creating a new exchange
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

          // Attempt to extend the dispute timeout, expecting revert
          await expect(
            disputeHandler.connect(operator).extendDisputeTimeout(exchange.id, newDisputeTimeout)
          ).to.revertedWith(RevertReasons.INVALID_STATE);
        });

        it("Caller is not the seller", async function () {
          // Attempt to extend the dispute timeout, expecting revert
          await expect(
            disputeHandler.connect(rando).extendDisputeTimeout(exchange.id, newDisputeTimeout)
          ).to.revertedWith(RevertReasons.NOT_OPERATOR);
        });

        it("Dispute has expired already", async function () {
          // Set time forward past the dispute resolution period
          await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

          // Attempt to extend the dispute timeout, expecting revert
          await expect(
            disputeHandler.connect(operator).extendDisputeTimeout(exchange.id, newDisputeTimeout)
          ).to.revertedWith(RevertReasons.DISPUTE_HAS_EXPIRED);
        });

        it("new dispute timeout is before the current dispute timeout", async function () {
          newDisputeTimeout = ethers.BigNumber.from(timeout).sub(oneWeek).toString();

          // Attempt to extend the dispute timeout, expecting revert
          await expect(
            disputeHandler.connect(operator).extendDisputeTimeout(exchange.id, newDisputeTimeout)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_TIMEOUT);
        });

        it("Dispute is in some state other than resolving", async function () {
          // Retract the dispute, put it into RETRACTED state
          await disputeHandler.connect(buyer).retractDispute(exchange.id);

          // Attempt to expire the dispute, expecting revert
          await expect(
            disputeHandler.connect(operator).extendDisputeTimeout(exchange.id, newDisputeTimeout)
          ).to.revertedWith(RevertReasons.INVALID_STATE);
        });
      });
    });

    context("👉 expireDispute()", async function () {
      beforeEach(async function () {
        // Raise a dispute
        tx = await disputeHandler.connect(buyer).raiseDispute(exchange.id, complaint);

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
        await expect(disputeHandler.connect(rando).expireDispute(exchange.id))
          .to.emit(disputeHandler, "DisputeExpired")
          .withArgs(exchange.id, rando.address);
      });

      it("should update state", async function () {
        // Set time forward past the dispute resolution period
        await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

        // Expire the dispute
        tx = await disputeHandler.connect(rando).expireDispute(exchange.id);

        // Get the block timestamp of the confirmed tx and set finalizedDate
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);
        finalizedDate = block.timestamp.toString();

        dispute = new Dispute(exchange.id, complaint, DisputeState.Retracted, buyerPercent);
        disputeDates = new DisputeDates(disputedDate, "0", finalizedDate, timeout);

        // Get the dispute as a struct
        [, disputeStruct, disputeDatesStruct] = await disputeHandler.connect(rando).getDispute(exchange.id);

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
        [exists, response] = await disputeHandler.connect(rando).getDisputeState(exchange.id);

        // It should match DisputeState.Retracted
        assert.equal(response, DisputeState.Retracted, "Dispute state is incorrect");

        // exchange should also be finalized
        // Get the exchange as a struct
        [, exchangeStruct] = await exchangeHandler.connect(rando).getExchange(exchange.id);

        // Parse into entity
        let returnedExchange = Exchange.fromStruct(exchangeStruct);

        // FinalizeDate should be set correctly
        assert.equal(returnedExchange.finalizedDate, finalizedDate, "Exchange finalizeDate is incorect");
      });

      context("💔 Revert Reasons", async function () {
        it("Exchange does not exist", async function () {
          // An invalid exchange id
          const exchangeId = "666";

          // Attempt to expire the dispute, expecting revert
          await expect(disputeHandler.connect(rando).expireDispute(exchangeId)).to.revertedWith(
            RevertReasons.NO_SUCH_EXCHANGE
          );
        });

        it("Exchange is not in a disputed state", async function () {
          exchange.id++;

          // Commit to offer, creating a new exchange
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

          // Attempt to expire the dispute, expecting revert
          await expect(disputeHandler.connect(rando).expireDispute(exchange.id)).to.revertedWith(
            RevertReasons.INVALID_STATE
          );
        });

        it("Dispute has not expired yet", async function () {
          // Attempt to expire the dispute, expecting revert
          await expect(disputeHandler.connect(rando).expireDispute(exchange.id)).to.revertedWith(
            RevertReasons.DISPUTE_STILL_VALID
          );
        });

        it("Dispute timeout has been extended", async function () {
          // Extend the dispute timeout
          await disputeHandler
            .connect(operator)
            .extendDisputeTimeout(exchange.id, Number(timeout) + 2 * Number(oneWeek));

          // put past original timeout where normally it would not revert
          await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

          // Attempt to expire the dispute, expecting revert
          await expect(disputeHandler.connect(rando).expireDispute(exchange.id)).to.revertedWith(
            RevertReasons.DISPUTE_STILL_VALID
          );
        });

        it("Dispute is in escalated state", async function () {
          // Escalate a dispute
          await disputeHandler.connect(buyer).escalateDispute(exchange.id);

          // Attempt to expire the dispute, expecting revert
          await expect(disputeHandler.connect(rando).expireDispute(exchange.id)).to.revertedWith(
            RevertReasons.INVALID_STATE
          );
        });

        it("Dispute is in some state other than resolving", async function () {
          // Retract the dispute, put it into RETRACTED state
          await disputeHandler.connect(buyer).retractDispute(exchange.id);

          // Attempt to expire the dispute, expecting revert
          await expect(disputeHandler.connect(rando).expireDispute(exchange.id)).to.revertedWith(
            RevertReasons.INVALID_STATE
          );
        });
      });
    });

    context("👉 resolveDispute()", async function () {
      beforeEach(async function () {
        // Raise a dispute
        tx = await disputeHandler.connect(buyer).raiseDispute(exchange.id, complaint);

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
          exchangeId: exchange.id,
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
          await expect(disputeHandler.connect(buyer).resolveDispute(exchange.id, buyerPercent, r, s, v))
            .to.emit(disputeHandler, "DisputeResolved")
            .withArgs(exchange.id, buyerPercent, buyer.address);
        });

        it("should update state", async function () {
          // Resolve the dispute
          tx = await disputeHandler.connect(buyer).resolveDispute(exchange.id, buyerPercent, r, s, v);

          // Get the block timestamp of the confirmed tx and set finalizedDate
          blockNumber = tx.blockNumber;
          block = await ethers.provider.getBlock(blockNumber);
          finalizedDate = block.timestamp.toString();

          dispute = new Dispute(exchange.id, complaint, DisputeState.Resolved, buyerPercent);
          disputeDates = new DisputeDates(disputedDate, "0", finalizedDate, timeout);

          // Get the dispute as a struct
          [, disputeStruct, disputeDatesStruct] = await disputeHandler.connect(rando).getDispute(exchange.id);

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
          [exists, response] = await disputeHandler.connect(rando).getDisputeState(exchange.id);

          // It should match DisputeState.Resolved
          assert.equal(response, DisputeState.Resolved, "Dispute state is incorrect");

          // exchange should also be finalized
          // Get the exchange as a struct
          [, exchangeStruct] = await exchangeHandler.connect(rando).getExchange(exchange.id);

          // Parse into entity
          let returnedExchange = Exchange.fromStruct(exchangeStruct);

          // FinalizeDate should be set correctly
          assert.equal(returnedExchange.finalizedDate, finalizedDate, "Exchange finalizeDate is incorect");
        });

        it("Buyer can also have a seller account and this will work", async function () {
          // Create a valid seller with buyer's wallet
          seller = new Seller(id, buyer.address, buyer.address, buyer.address, buyer.address, true);
          expect(seller.isValid()).is.true;
          await accountHandler.connect(buyer).createSeller(seller);

          // Resolve the dispute, testing for the event
          await expect(disputeHandler.connect(buyer).resolveDispute(exchange.id, buyerPercent, r, s, v))
            .to.emit(disputeHandler, "DisputeResolved")
            .withArgs(exchange.id, buyerPercent, buyer.address);
        });

        it("Dispute can be mutualy resolved even if it's in escalated state", async function () {
          // escalate dispute
          await disputeHandler.connect(buyer).escalateDispute(exchange.id);

          // Resolve the dispute, testing for the event
          await expect(disputeHandler.connect(buyer).resolveDispute(exchange.id, buyerPercent, r, s, v))
            .to.emit(disputeHandler, "DisputeResolved")
            .withArgs(exchange.id, buyerPercent, buyer.address);
        });

        it("Dispute can be mutualy resolved even if it's in escalated state and past the resolution period", async function () {
          // escalate dispute
          await disputeHandler.connect(buyer).escalateDispute(exchange.id);

          // Set time forward to the dispute expiration date
          await setNextBlockTimestamp(Number(timeout) + oneWeek);

          // Resolve the dispute, testing for the event
          await expect(disputeHandler.connect(buyer).resolveDispute(exchange.id, buyerPercent, r, s, v))
            .to.emit(disputeHandler, "DisputeResolved")
            .withArgs(exchange.id, buyerPercent, buyer.address);
        });

        it("Dispute can be mutualy resolved if it's past original timeout, but it was extended", async function () {
          // Extend the dispute timeout
          await disputeHandler
            .connect(operator)
            .extendDisputeTimeout(exchange.id, Number(timeout) + 2 * Number(oneWeek));

          // put past original timeout where normally it would not revert
          await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

          // Resolve the dispute, testing for the event
          await expect(disputeHandler.connect(buyer).resolveDispute(exchange.id, buyerPercent, r, s, v))
            .to.emit(disputeHandler, "DisputeResolved")
            .withArgs(exchange.id, buyerPercent, buyer.address);
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
          await expect(disputeHandler.connect(operator).resolveDispute(exchange.id, buyerPercent, r, s, v))
            .to.emit(disputeHandler, "DisputeResolved")
            .withArgs(exchange.id, buyerPercent, operator.address);
        });

        it("should update state", async function () {
          // Resolve the dispute
          tx = await disputeHandler.connect(operator).resolveDispute(exchange.id, buyerPercent, r, s, v);

          // Get the block timestamp of the confirmed tx and set finalizedDate
          blockNumber = tx.blockNumber;
          block = await ethers.provider.getBlock(blockNumber);
          finalizedDate = block.timestamp.toString();

          dispute = new Dispute(exchange.id, complaint, DisputeState.Resolved, buyerPercent);
          disputeDates = new DisputeDates(disputedDate, "0", finalizedDate, timeout);

          // Get the dispute as a struct
          [, disputeStruct, disputeDatesStruct] = await disputeHandler.connect(rando).getDispute(exchange.id);

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
          [exists, response] = await disputeHandler.connect(rando).getDisputeState(exchange.id);

          // It should match DisputeState.Resolved
          assert.equal(response, DisputeState.Resolved, "Dispute state is incorrect");

          // exchange should also be finalized
          // Get the exchange as a struct
          [, exchangeStruct] = await exchangeHandler.connect(rando).getExchange(exchange.id);

          // Parse into entity
          let returnedExchange = Exchange.fromStruct(exchangeStruct);

          // FinalizeDate should be set correctly
          assert.equal(returnedExchange.finalizedDate, finalizedDate, "Exchange finalizeDate is incorect");
        });

        it("Operator can also have a buyer account and this will work", async function () {
          // Create a valid buyer with operator's wallet
          buyer = new Buyer(id, operator.address, active);
          expect(buyer.isValid()).is.true;
          await accountHandler.connect(operator).createBuyer(buyer);

          // Resolve the dispute, testing for the event
          await expect(disputeHandler.connect(operator).resolveDispute(exchange.id, buyerPercent, r, s, v))
            .to.emit(disputeHandler, "DisputeResolved")
            .withArgs(exchange.id, buyerPercent, operator.address);
        });

        it("Dispute can be mutualy resolved even if it's in escalated state", async function () {
          // escalate dispute
          await disputeHandler.connect(buyer).escalateDispute(exchange.id);

          // Resolve the dispute, testing for the event
          await expect(disputeHandler.connect(operator).resolveDispute(exchange.id, buyerPercent, r, s, v))
            .to.emit(disputeHandler, "DisputeResolved")
            .withArgs(exchange.id, buyerPercent, operator.address);
        });

        it("Dispute can be mutualy resolved even if it's in escalated state and past the resolution period", async function () {
          // escalate dispute
          await disputeHandler.connect(buyer).escalateDispute(exchange.id);

          // Set time forward to the dispute expiration date
          await setNextBlockTimestamp(Number(timeout) + oneWeek);

          // Resolve the dispute, testing for the event
          await expect(disputeHandler.connect(operator).resolveDispute(exchange.id, buyerPercent, r, s, v))
            .to.emit(disputeHandler, "DisputeResolved")
            .withArgs(exchange.id, buyerPercent, operator.address);
        });

        it("Dispute can be mutualy resolved if it's past original timeout, but it was extended", async function () {
          // Extend the dispute timeout
          await disputeHandler
            .connect(operator)
            .extendDisputeTimeout(exchange.id, Number(timeout) + 2 * Number(oneWeek));

          // put past original timeout where normally it would not revert
          await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

          // Resolve the dispute, testing for the event
          await expect(disputeHandler.connect(operator).resolveDispute(exchange.id, buyerPercent, r, s, v))
            .to.emit(disputeHandler, "DisputeResolved")
            .withArgs(exchange.id, buyerPercent, operator.address);
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

        it("Specified buyer percent exceeds 100%", async function () {
          // Set buyer percent above 100%
          buyerPercent = "12000"; // 120%

          // Attempt to resolve the dispute, expecting revert
          await expect(
            disputeHandler.connect(operator).resolveDispute(exchange.id, buyerPercent, r, s, v)
          ).to.revertedWith(RevertReasons.INVALID_BUYER_PERCENT);
        });

        it("Dispute has expired", async function () {
          // Set time forward to the dispute expiration date
          await setNextBlockTimestamp(Number(timeout));

          // Attempt to resolve the dispute, expecting revert
          await expect(
            disputeHandler.connect(operator).resolveDispute(exchange.id, buyerPercent, r, s, v)
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
          exchange.id++;

          // Commit to offer, creating a new exchange
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

          // Attempt to resolve the dispute, expecting revert
          await expect(
            disputeHandler.connect(operator).resolveDispute(exchange.id, buyerPercent, r, s, v)
          ).to.revertedWith(RevertReasons.INVALID_STATE);
        });

        it("Caller is neither the seller nor the buyer for the given exchange id", async function () {
          // Wallet without any account
          // Attempt to resolve the dispute, expecting revert
          await expect(
            disputeHandler.connect(rando).resolveDispute(exchange.id, buyerPercent, r, s, v)
          ).to.revertedWith(RevertReasons.NOT_BUYER_OR_SELLER);

          // Wallet with seller account, but not the seller in this exchange
          // Create a valid seller
          seller = new Seller(id, other1.address, other1.address, other1.address, other1.address, true);
          expect(seller.isValid()).is.true;
          await accountHandler.connect(other1).createSeller(seller);
          // Attempt to resolve the dispute, expecting revert
          await expect(
            disputeHandler.connect(other1).resolveDispute(exchange.id, buyerPercent, r, s, v)
          ).to.revertedWith(RevertReasons.NOT_BUYER_OR_SELLER);

          // Wallet with buyer account, but not the buyer in this exchange
          // Create a valid buyer
          buyer = new Buyer(id, other2.address, active);
          expect(buyer.isValid()).is.true;
          await accountHandler.connect(other2).createBuyer(buyer);
          // Attempt to resolve the dispute, expecting revert
          await expect(
            disputeHandler.connect(other2).resolveDispute(exchange.id, buyerPercent, r, s, v)
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
            disputeHandler.connect(operator).resolveDispute(exchange.id, buyerPercent, r, s, v)
          ).to.revertedWith(RevertReasons.SIGNER_AND_SIGNATURE_DO_NOT_MATCH);

          // Attempt to resolve the dispute, expecting revert
          await expect(
            disputeHandler.connect(buyer).resolveDispute(exchange.id, buyerPercent, r, s, v)
          ).to.revertedWith(RevertReasons.SIGNER_AND_SIGNATURE_DO_NOT_MATCH);
        });

        it("signature resolution does not match input buyerPercent ", async function () {
          // Set different buyer percentage
          buyerPercent = (Number(buyerPercent) + 1000).toString(); // add 10%

          // Attempt to resolve the dispute, expecting revert
          await expect(
            disputeHandler.connect(operator).resolveDispute(exchange.id, buyerPercent, r, s, v)
          ).to.revertedWith(RevertReasons.SIGNER_AND_SIGNATURE_DO_NOT_MATCH);
        });

        it("signature has invalid field", async function () {
          // Attempt to resolve the dispute, expecting revert
          await expect(
            disputeHandler.connect(operator).resolveDispute(exchange.id, buyerPercent, r, s, "0")
          ).to.revertedWith(RevertReasons.INVALID_SIGNATURE);
          await expect(
            disputeHandler
              .connect(operator)
              .resolveDispute(exchange.id, buyerPercent, r, ethers.utils.hexZeroPad("0x", 32), v)
          ).to.revertedWith(RevertReasons.INVALID_SIGNATURE);
          await expect(
            disputeHandler
              .connect(operator)
              .resolveDispute(exchange.id, buyerPercent, ethers.utils.hexZeroPad("0x", 32), s, v)
          ).to.revertedWith(RevertReasons.INVALID_SIGNATURE);
        });

        it("dispute state is neither resolving or escalated", async function () {
          // Retract the dispute, put it into RETRACTED state
          await disputeHandler.connect(buyer).retractDispute(exchange.id);

          // Attempt to resolve the dispute, expecting revert
          await expect(
            disputeHandler.connect(operator).resolveDispute(exchange.id, buyerPercent, r, s, v)
          ).to.revertedWith(RevertReasons.INVALID_STATE);
        });
      });
    });

    context("👉 escalateDispute()", async function () {
      beforeEach(async function () {
        // Raise a dispute
        tx = await disputeHandler.connect(buyer).raiseDispute(exchange.id, complaint);

        // Get the block timestamp of the confirmed tx and set disputedDate
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);
        disputedDate = block.timestamp.toString();
        timeout = ethers.BigNumber.from(disputedDate).add(resolutionPeriod).toString();
      });

      it("should emit a DisputeEscalated event", async function () {
        // Escalate the dispute, testing for the event
        await expect(disputeHandler.connect(buyer).escalateDispute(exchange.id))
          .to.emit(disputeHandler, "DisputeEscalated")
          .withArgs(exchange.id, offer.disputeResolverId, buyer.address);
      });

      it("should update state", async function () {
        // Escalate the dispute
        tx = await disputeHandler.connect(buyer).escalateDispute(exchange.id);

        // Get the block timestamp of the confirmed tx and set escalatedDate
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);
        escalatedDate = block.timestamp.toString();

        dispute = new Dispute(exchange.id, complaint, DisputeState.Escalated, "0");
        disputeDates = new DisputeDates(disputedDate, escalatedDate, "0", timeout);

        // Get the dispute as a struct
        [, disputeStruct, disputeDatesStruct] = await disputeHandler.connect(rando).getDispute(exchange.id);

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
        [exists, response] = await disputeHandler.connect(rando).getDisputeState(exchange.id);

        // It should match DisputeState.Escalated
        assert.equal(response, DisputeState.Escalated, "Dispute state is incorrect");
      });

      context("💔 Revert Reasons", async function () {
        it("Exchange does not exist", async function () {
          // An invalid exchange id
          const exchangeId = "666";

          // Attempt to escalate the dispute, expecting revert
          await expect(disputeHandler.connect(buyer).escalateDispute(exchangeId)).to.revertedWith(
            RevertReasons.NO_SUCH_EXCHANGE
          );
        });

        it("Exchange is not in a disputed state", async function () {
          exchange.id++;

          // Commit to offer, creating a new exchange
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

          // Attempt to escalate the dispute, expecting revert
          await expect(disputeHandler.connect(buyer).escalateDispute(exchange.id)).to.revertedWith(
            RevertReasons.INVALID_STATE
          );
        });

        it("Caller is not the buyer for the given exchange id", async function () {
          // Attempt to retract the dispute, expecting revert
          await expect(disputeHandler.connect(rando).escalateDispute(exchange.id)).to.revertedWith(
            RevertReasons.NOT_VOUCHER_HOLDER
          );
        });

        it("Dispute has expired", async function () {
          // Set time forward past the dispute resolution period
          await setNextBlockTimestamp(Number(timeout) + oneWeek);

          // Attempt to escalate the dispute, expecting revert
          await expect(disputeHandler.connect(buyer).escalateDispute(exchange.id)).to.revertedWith(
            RevertReasons.DISPUTE_HAS_EXPIRED
          );
        });

        it("Dispute is in some state other than resolving", async function () {
          // Retract the dispute, put it into RETRACTED state
          await disputeHandler.connect(buyer).retractDispute(exchange.id);

          // Attempt to escalate the dispute, expecting revert
          await expect(disputeHandler.connect(buyer).escalateDispute(exchange.id)).to.revertedWith(
            RevertReasons.INVALID_STATE
          );
        });
      });
    });

    context("👉 decideDispute()", async function () {
      beforeEach(async function () {
        // Raise a dispute
        tx = await disputeHandler.connect(buyer).raiseDispute(exchange.id, complaint);

        // Get the block timestamp of the confirmed tx and set disputedDate
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);
        disputedDate = block.timestamp.toString();
        timeout = ethers.BigNumber.from(disputedDate).add(resolutionPeriod).toString();

        // Escalate the dispute
        tx = await disputeHandler.connect(buyer).escalateDispute(exchange.id);

        // Get the block timestamp of the confirmed tx and set escalatedDate
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);
        escalatedDate = block.timestamp.toString();

        // buyer percent used in tests
        buyerPercent = "4321";
      });

      it("should emit a DisputeDecided event", async function () {
        // Escalate the dispute, testing for the event
        await expect(disputeHandler.connect(disputeResolver).decideDispute(exchange.id, buyerPercent))
          .to.emit(disputeHandler, "DisputeDecided")
          .withArgs(exchange.id, buyerPercent, disputeResolver.address);
      });

      it("should update state", async function () {
        // Decide the dispute
        tx = await disputeHandler.connect(disputeResolver).decideDispute(exchange.id, buyerPercent);

        // Get the block timestamp of the confirmed tx and set finalizedDate
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);
        finalizedDate = block.timestamp.toString();

        dispute = new Dispute(exchange.id, complaint, DisputeState.Decided, buyerPercent);
        disputeDates = new DisputeDates(disputedDate, escalatedDate, finalizedDate, timeout);

        // Get the dispute as a struct
        [, disputeStruct, disputeDatesStruct] = await disputeHandler.connect(rando).getDispute(exchange.id);

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
        [exists, response] = await disputeHandler.connect(rando).getDisputeState(exchange.id);

        // It should match DisputeState.Decided
        assert.equal(response, DisputeState.Decided, "Dispute state is incorrect");
      });

      context("💔 Revert Reasons", async function () {
        it("Specified buyer percent exceeds 100%", async function () {
          // Set buyer percent above 100%
          buyerPercent = "12000"; // 120%

          // Attempt to decide the dispute, expecting revert
          await expect(
            disputeHandler.connect(disputeResolver).decideDispute(exchange.id, buyerPercent)
          ).to.revertedWith(RevertReasons.INVALID_BUYER_PERCENT);
        });

        it("Exchange does not exist", async function () {
          // An invalid exchange id
          const exchangeId = "666";

          // Attempt to decide the dispute, expecting revert
          await expect(disputeHandler.connect(disputeResolver).decideDispute(exchangeId, buyerPercent)).to.revertedWith(
            RevertReasons.NO_SUCH_EXCHANGE
          );
        });

        it("Exchange is not in a disputed state", async function () {
          exchange.id++;

          // Commit to offer, creating a new exchange
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

          // Attempt to decide the dispute, expecting revert
          await expect(
            disputeHandler.connect(disputeResolver).decideDispute(exchange.id, buyerPercent)
          ).to.revertedWith(RevertReasons.INVALID_STATE);
        });

        it("Caller is not the dispute resolver for this dispute", async function () {
          // Attempt to decide the dispute, expecting revert
          await expect(disputeHandler.connect(rando).decideDispute(exchange.id, buyerPercent)).to.revertedWith(
            RevertReasons.NOT_DISPUTE_RESOLVER_WALLET
          );
        });

        it("Dispute state is not escalated", async function () {
          exchange.id++;

          // Commit to offer, creating a new exchange
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

          // Redeem voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Raise a dispute
          await disputeHandler.connect(buyer).raiseDispute(exchange.id, complaint);

          // Attempt to decide the dispute, expecting revert
          await expect(
            disputeHandler.connect(disputeResolver).decideDispute(exchange.id, buyerPercent)
          ).to.revertedWith(RevertReasons.INVALID_STATE);
        });
      });
    });

    context("👉 getDispute()", async function () {
      beforeEach(async function () {
        // Raise a dispute
        tx = await disputeHandler.connect(buyer).raiseDispute(exchange.id, complaint);

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);
        disputedDate = block.timestamp.toString();
        timeout = ethers.BigNumber.from(disputedDate).add(resolutionPeriod).toString();

        // Expected value for dispute
        dispute = new Dispute(exchange.id, complaint, DisputeState.Resolving, buyerPercent);
        disputeDates = new DisputeDates(disputedDate, "0", "0", timeout);
      });

      it("should return true for exists if exchange id is valid", async function () {
        // Get the dispute
        [exists, response] = await disputeHandler.connect(rando).getDispute(exchange.id);

        // Test existence flag
        expect(exists).to.be.true;
      });

      it("should return false for exists if exchange id is not valid", async function () {
        // Get the dispute
        [exists, response] = await disputeHandler.connect(rando).getDispute(exchange.id + 10);

        // Test existence flag
        expect(exists).to.be.false;
      });

      it("should return the expected dispute if exchange id is valid", async function () {
        // Get the exchange
        [exists, disputeStruct, disputeDatesStruct] = await disputeHandler.connect(rando).getDispute(exchange.id);

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
        exchange.id++;

        // Commit to offer, creating a new exchange
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

        // Get the exchange
        [exists, response] = await exchangeHandler.connect(rando).getExchange(exchange.id);

        // Test existence flag
        expect(exists).to.be.true;

        // Get the dispute
        [exists, disputeStruct, disputeDatesStruct] = await disputeHandler.connect(rando).getDispute(exchange.id);

        // Test existence flag
        expect(exists).to.be.false;

        // dispute struct and dispute dates should contain the default values
        // expected values
        dispute = new Dispute("0", "", 0, "0");
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
        tx = await disputeHandler.connect(buyer).raiseDispute(exchange.id, complaint);
      });

      it("should return true for exists if exchange id is valid", async function () {
        // Get the dispute state
        [exists, response] = await disputeHandler.connect(rando).getDisputeState(exchange.id);

        // Test existence flag
        expect(exists).to.be.true;
      });

      it("should return false for exists if exchange id is not valid", async function () {
        // Attempt to get the dispute state for invalid dispute
        [exists, response] = await disputeHandler.connect(rando).getDisputeState(exchange.id + 10);

        // Test existence flag
        expect(exists).to.be.false;
      });

      it("should return the expected dispute state if exchange id is valid", async function () {
        // TODO when retract/resolve/decide is implemented, use it here, since DisputeState.Resolving is default value
        // Get the dispute state
        [exists, response] = await disputeHandler.connect(rando).getDisputeState(exchange.id);

        // It should match DisputeState.Resolving
        assert.equal(response, DisputeState.Resolving, "Dispute state is incorrect");
      });
    });

    context("👉 getDisputeTimeout()", async function () {
      beforeEach(async function () {
        // Raise a dispute
        tx = await disputeHandler.connect(buyer).raiseDispute(exchange.id, complaint);

        // Get the block timestamp of the confirmed tx and set disputedDate
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);
        disputedDate = block.timestamp.toString();
        timeout = ethers.BigNumber.from(disputedDate).add(resolutionPeriod).toString();
      });

      it("should return true for exists if exchange id is valid", async function () {
        // Get the dispute state
        [exists, response] = await disputeHandler.connect(rando).getDisputeTimeout(exchange.id);

        // Test existence flag
        expect(exists).to.be.true;
      });

      it("should return false for exists if exchange id is not valid", async function () {
        // Attempt to get the dispute state for invalid dispute
        [exists, response] = await disputeHandler.connect(rando).getDisputeTimeout(exchange.id + 10);

        // Test existence flag
        expect(exists).to.be.false;
      });

      it("should return the expected dispute timeout if exchange id is valid", async function () {
        // Get the dispute timeout
        [exists, response] = await disputeHandler.connect(rando).getDisputeTimeout(exchange.id);

        // It should match DisputeState.Resolving
        assert.equal(response, timeout, "Dispute timeout is incorrect");
      });
    });

    context("👉 isDisputeFinalized()", async function () {
      it("should return false if exchange is not disputed", async function () {
        // Dispute not raised, ask if dispute is finalized
        [exists, response] = await disputeHandler.connect(rando).isDisputeFinalized(exchange.id);

        // It should not be finalized
        assert.equal(exists, false, "Incorrectly reports existence");
        assert.equal(response, false, "Incorrectly reports finalized state");
      });

      it("should return false if exchange does not exist", async function () {
        // Exchange does not exist, ask if dispute is finalized
        [exists, response] = await disputeHandler.connect(rando).isDisputeFinalized(exchange.id + 10);

        // It should not be finalized
        assert.equal(exists, false, "Incorrectly reports existence");
        assert.equal(response, false, "Incorrectly reports finalized state");
      });

      context("disputed exchange", async function () {
        beforeEach(async function () {
          // Raise a dispute
          await disputeHandler.connect(buyer).raiseDispute(exchange.id, complaint);
        });

        it("should return false if dispute is in Resolving state", async function () {
          // Dispute in resolving state, ask if exchange is finalized
          [exists, response] = await disputeHandler.connect(rando).isDisputeFinalized(exchange.id);

          // It should exist, but not be finalized
          assert.equal(exists, true, "Incorrectly reports existence");
          assert.equal(response, false, "Incorrectly reports finalized state");
        });

        it("should return true if dispute is in Retracted state", async function () {
          // Retract dispute
          await disputeHandler.connect(buyer).retractDispute(exchange.id);

          // Dispute in retracted state, ask if exchange is finalized
          [exists, response] = await disputeHandler.connect(rando).isDisputeFinalized(exchange.id);

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
            exchangeId: exchange.id,
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
          await disputeHandler.connect(operator).resolveDispute(exchange.id, buyerPercent, r, s, v);

          // Dispute in resolved state, ask if exchange is finalized
          [exists, response] = await disputeHandler.connect(rando).isDisputeFinalized(exchange.id);

          // It should exist and be finalized
          assert.equal(exists, true, "Incorrectly reports existence");
          assert.equal(response, true, "Incorrectly reports unfinalized state");
        });

        it("should return true if dispute is in Decided state", async function () {
          buyerPercent = "1234";

          // Escalate dispute
          await disputeHandler.connect(buyer).escalateDispute(exchange.id);

          // Retract dispute
          await disputeHandler.connect(disputeResolver).decideDispute(exchange.id, buyerPercent);

          // Dispute in decided state, ask if exchange is finalized
          [exists, response] = await disputeHandler.connect(rando).isDisputeFinalized(exchange.id);

          // It should exist and be finalized
          assert.equal(exists, true, "Incorrectly reports existence");
          assert.equal(response, true, "Incorrectly reports unfinalized state");
        });
      });
    });
  });
});
