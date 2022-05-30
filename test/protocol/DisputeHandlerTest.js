const hre = require("hardhat");
const ethers = hre.ethers;
const { expect, assert } = require("chai");

const Role = require("../../scripts/domain/Role");
const Exchange = require("../../scripts/domain/Exchange");
const Voucher = require("../../scripts/domain/Voucher");
const Offer = require("../../scripts/domain/Offer");
const Seller = require("../../scripts/domain/Seller");
const ExchangeState = require("../../scripts/domain/ExchangeState");
const Dispute = require("../../scripts/domain/Dispute");
const DisputeState = require("../../scripts/domain/DisputeState");
const DisputeDates = require("../../scripts/domain/DisputeDates");
const Resolution = require("../../scripts/domain/Resolution");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
const { setNextBlockTimestamp, calculateProtocolFee } = require("../../scripts/util/test-utils.js");

/**
 *  Test the Boson Dispute Handler interface
 */
describe("IBosonDisputeHandler", function () {
  // Common vars
  let InterfaceIds;
  let accounts, deployer, operator, admin, clerk, treasury, rando, buyer;
  let erc165,
    protocolDiamond,
    accessController,
    accountHandler,
    exchangeHandler,
    offerHandler,
    fundsHandler,
    disputeHandler;
  let bosonVoucher, gasLimit;
  let id, buyerId, offer, offerId, seller, sellerId;
  let block, blockNumber, tx, clients;
  let support, oneMonth, oneWeek, newTime;
  let price,
    sellerDeposit,
    protocolFee,
    buyerCancelPenalty,
    quantityAvailable,
    validFromDate,
    redeemableFromDate,
    fulfillmentPeriodDuration,
    voucherValidDuration,
    exchangeToken,
    metadataUri,
    metadataHash,
    voided;
  let protocolFeePrecentage;
  let voucher, committedDate, validUntilDate, redeemedDate, expired;
  let exchange, finalizedDate, state;
  let dispute, disputedDate, complaint, disputeStruct, responseDispute;
  let disputeDates, expectedDisputeDates, responseDisputeDates;
  let exists, response;

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
    rando = accounts[6];

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

    // set protocolFeePrecentage
    protocolFeePrecentage = "200"; // 2 %

    // Add config Handler, so ids start at 1, and so voucher address can be found
    const protocolConfig = [
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      bosonVoucher.address,
      protocolFeePrecentage,
      "0",
      "0",
      "0",
      "0",
      "0",
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
      buyerId = "2"; // created after seller

      // Create an offer to commit to
      oneWeek = 604800 * 1000; //  7 days in milliseconds
      oneMonth = 2678400 * 1000; // 31 days in milliseconds

      // Get the current block info
      blockNumber = await ethers.provider.getBlockNumber();
      block = await ethers.provider.getBlock(blockNumber);

      // Required constructor params
      price = ethers.utils.parseUnits("1.5", "ether").toString();
      sellerDeposit = ethers.utils.parseUnits("0.25", "ether").toString();
      protocolFee = calculateProtocolFee(sellerDeposit, price, protocolFeePrecentage);
      buyerCancelPenalty = ethers.utils.parseUnits("0.05", "ether").toString();
      quantityAvailable = "2";
      validFromDate = ethers.BigNumber.from(block.timestamp).toString(); // valid from now
      validUntilDate = ethers.BigNumber.from(block.timestamp)
        .add(oneMonth * 6)
        .toString(); // until 6 months
      redeemableFromDate = ethers.BigNumber.from(block.timestamp).add(oneWeek).toString(); // redeemable in 1 week
      fulfillmentPeriodDuration = oneMonth.toString(); // fulfillment period is one month
      voucherValidDuration = oneMonth.toString(); // offers valid for one month
      exchangeToken = ethers.constants.AddressZero.toString(); // Zero addy ~ chain base currency
      metadataHash = "QmYXc12ov6F2MZVZwPs5XeCBbf61cW3wKRk8h3D5NTYj4T";
      metadataUri = `https://ipfs.io/ipfs/${metadataHash}`;
      voided = false;

      // Create a valid seller
      seller = new Seller(id, operator.address, admin.address, clerk.address, treasury.address, true);
      expect(seller.isValid()).is.true;
      await accountHandler.connect(admin).createSeller(seller);

      // Create a valid offer entity
      offer = new Offer(
        offerId,
        sellerId,
        price,
        sellerDeposit,
        protocolFee,
        buyerCancelPenalty,
        quantityAvailable,
        validFromDate,
        validUntilDate,
        redeemableFromDate,
        fulfillmentPeriodDuration,
        voucherValidDuration,
        exchangeToken,
        metadataUri,
        metadataHash,
        voided
      );
      expect(offer.isValid()).is.true;

      // Create the offer
      await offerHandler.connect(operator).createOffer(offer);

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

      // Set time forward to the offer's redeemableFromDate
      await setNextBlockTimestamp(Number(redeemableFromDate));

      // Redeem voucher
      await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

      // Set the dispute reason
      complaint = "Tastes weird";
    });

    context("👉 raiseDispute()", async function () {
      it("should emit a DisputeRaised event", async function () {
        // Raise a dispute, testing for the event
        await expect(disputeHandler.connect(buyer).raiseDispute(exchange.id, complaint))
          .to.emit(disputeHandler, "DisputeRaised")
          .withArgs(exchange.id, buyerId, sellerId, complaint);
      });

      it("should update state", async function () {
        // Raise a dispute
        tx = await disputeHandler.connect(buyer).raiseDispute(exchange.id, complaint);

        // Get the block timestamp of the confirmed tx and set disputedDate
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);
        disputedDate = block.timestamp.toString();

        // expected values
        dispute = new Dispute(exchange.id, complaint, DisputeState.Resolving, new Resolution("0"));
        expectedDisputeDates = new DisputeDates(disputedDate, "0", "0", "0");

        // Get the dispute as a struct
        [, disputeStruct, disputeDates] = await disputeHandler.connect(rando).getDispute(exchange.id);

        // Parse into entity
        const returnedDispute = Dispute.fromStruct(disputeStruct);
        const returnedDisputeDates = DisputeDates.fromStruct(disputeDates);

        // Returned values should match expected dispute data
        for (const [key, value] of Object.entries(dispute)) {
          expect(JSON.stringify(returnedDispute[key]) === JSON.stringify(value)).is.true;
        }
        for (const [key, value] of Object.entries(expectedDisputeDates)) {
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
          newTime = Number((redeemableFromDate + Number(fulfillmentPeriodDuration) + 1).toString().substring(0, 11));
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

        // Expected value for dispute
        dispute = new Dispute(exchange.id, complaint, DisputeState.Resolving, new Resolution("0"));
        disputeDates = new DisputeDates(disputedDate, "0", "0", "0");
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
        [exists, responseDispute, responseDisputeDates] = await disputeHandler.connect(rando).getDispute(exchange.id);

        // It should match the expected dispute struct
        assert.equal(dispute.toString(), Dispute.fromStruct(responseDispute).toString(), "Dispute struct is incorrect");

        // It should match the expected dispute dates struct
        assert.equal(
          disputeDates.toString(),
          DisputeDates.fromStruct(responseDisputeDates).toString(),
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
        [exists, disputeStruct, disputeDates] = await disputeHandler.connect(rando).getDispute(exchange.id);

        // Test existence flag
        expect(exists).to.be.false;

        // dispute struct and dispute dates should contain the default values
        // expected values
        dispute = new Dispute("0", "", DisputeState.Resolving, new Resolution("0"));

        // Parse into entity
        const returnedDispute = Dispute.fromStruct(disputeStruct);

        // Returned values should match expected dispute data
        for (const [key, value] of Object.entries(dispute)) {
          expect(JSON.stringify(returnedDispute[key]) === JSON.stringify(value)).is.true;
        }

        // Dispute dates should be empty
        expect(disputeDates).to.eql([], "Dispute dates should be empty");
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
          tx = await disputeHandler.connect(buyer).raiseDispute(exchange.id, complaint);
        });

        it("should return false if dispute is in Resolving state", async function () {
          // Dispute in resolving state, ask if exchange is finalized
          [exists, response] = await disputeHandler.connect(rando).isDisputeFinalized(exchange.id);

          // It should exist, but not be finalized
          assert.equal(exists, true, "Incorrectly reports existence");
          assert.equal(response, false, "Incorrectly reports finalized state");
        });

        it.skip("should return true if dispute is in Retracted state", async function () {
          // Retract dispute
          await disputeHandler.connect(buyer).retractDispute(exchange.id);

          // Dispute in retracted state, ask if exchange is finalized
          [exists, response] = await disputeHandler.connect(rando).isDisputeFinalized(exchange.id);

          // It should exist and be finalized
          assert.equal(exists, true, "Incorrectly reports existence");
          assert.equal(response, true, "Incorrectly reports unfinalized state");
        });

        it.skip("should return true if dispute is in Resolved state", async function () {
          // Retract dispute
          await disputeHandler.connect(buyer).resolveDispute(exchange.id);

          // Dispute in resolved state, ask if exchange is finalized
          [exists, response] = await disputeHandler.connect(rando).isDisputeFinalized(exchange.id);

          // It should exist and be finalized
          assert.equal(exists, true, "Incorrectly reports existence");
          assert.equal(response, true, "Incorrectly reports unfinalized state");
        });

        it.skip("should return true if dispute is in Decided state", async function () {
          // Retract dispute
          await disputeHandler.connect(buyer).decideDispute(exchange.id);

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
