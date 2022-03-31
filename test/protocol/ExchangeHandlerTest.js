const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");

const Role = require("../../scripts/domain/Role");
const Seller = require("../../scripts/domain/Seller");
const Buyer = require("../../scripts/domain/Buyer");
const Exchange = require("../../scripts/domain/Exchange");
const Voucher = require("../../scripts/domain/Voucher");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const Offer = require("../../scripts/domain/Offer");
const ExchangeState = require("../../scripts/domain/ExchangeState");

/**
 *  Test the Boson Exchange Handler interface
 */
describe("IBosonExchangeHandler", function () {
  // Common vars
  let InterfaceIds;
  let accounts, deployer, rando, operator, admin, clerk, treasury, other1, other2;
  let erc165, protocolDiamond, accessController, accountHandler, exchangeHandler, offerHandler, gasLimit;
  let id, buyer, buyerId, offer, offerId, seller, sellerId;
  let expected, nextExchangeId;
  let support, invalidAccountId, key, value, exists,  oneMonth, oneWeek;
  let price,
      sellerDeposit,
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
  let voucher,
      voucherStruct,
      committedDate,
      validUntilDate,
      redeemedDate,
      expired;
  let exchange,
      finalizedDate,
      disputed,
      state,
      exchangeStruct;

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
    rando = accounts[5];
    buyer = accounts[6];
    other1 = accounts[7];
    other2 = accounts[8];

    // Deploy the Protocol Diamond
    [protocolDiamond, , , accessController] = await deployProtocolDiamond();

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Cut the protocol handler facets into the Diamond
    await deployProtocolHandlerFacets(protocolDiamond, ["AccountHandlerFacet", "ExchangeHandlerFacet", "OfferHandlerFacet"]);

    // Add config Handler, so ids start at 1
    const protocolConfig = [
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
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

  });

  // Interface support (ERC-156 provided by ProtocolDiamond, others by deployed facets)
  context("📋 Interfaces", async function () {
    context("👉 supportsInterface()", async function () {
      it("should indicate support for IBosonExchangeHandler interface", async function () {
        // Current interfaceId for IBosonExchangeHandler
        support = await erc165.supportsInterface(InterfaceIds.IBosonExchangeHandler);

        // Test
        await expect(support, "IBosonExchangeHandler interface not supported").is.true;
      });
    });
  });

  // All supported Seller methods
  context("📋 Exchange Handler Methods", async function () {
    beforeEach(async function () {

      // Initial ids for all the things
      id = offerId = buyerId = sellerId = "1";

      // Create an offer to commit to
      oneWeek = 604800 * 1000; //  7 days in milliseconds
      oneMonth = 2678400 * 1000; // 31 days in milliseconds

      // Required constructor params
      price = ethers.utils.parseUnits("1.5", "ether").toString();
      sellerDeposit = price = ethers.utils.parseUnits("0.25", "ether").toString();
      buyerCancelPenalty = price = ethers.utils.parseUnits("0.05", "ether").toString();
      quantityAvailable = "1";
      validFromDate = ethers.BigNumber.from(Date.now()).toString(); // valid from now
      validUntilDate = ethers.BigNumber.from(Date.now() + oneMonth * 6).toString(); // until 6 months
      redeemableFromDate = ethers.BigNumber.from(Date.now() + oneWeek).toString(); // redeemable in 1 week
      fulfillmentPeriodDuration = oneMonth.toString(); // fulfillment period is one month
      voucherValidDuration = oneMonth.toString(); // offers valid for one month
      exchangeToken = ethers.constants.AddressZero.toString(); // Zero addy ~ chain base currency
      metadataHash = "QmYXc12ov6F2MZVZwPs5XeCBbf61cW3wKRk8h3D5NTYj4T";
      metadataUri = `https://ipfs.io/ipfs/${metadataHash}`;
      voided = false;

      // Create a valid offer entity
      offer = new Offer(
          offerId,
          sellerId,
          price,
          sellerDeposit,
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
      committedDate = "1661441758";
      validUntilDate = "166145000";
      redeemedDate = "1661442001";
      expired = false;
      voucher = new Voucher(committedDate, validUntilDate, redeemedDate, expired);
      voucherStruct = [committedDate, validUntilDate, redeemedDate, expired];

      // Required exchange constructor params
      finalizedDate = "1661447000";
      disputed = false;
      state = ExchangeState.Completed;
      exchange = new Exchange(id, offerId, buyerId, finalizedDate, voucher, disputed, state);
      exchangeStruct = [id, offerId, buyerId, finalizedDate, voucherStruct, disputed, state];

    });

    context("👉 commitToOffer()", async function () {
      it.only("should emit a BuyerCommitted event", async function () {
        // Commit to offer, testing for the event
        await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId))
          .to.emit(exchangeHandler, "BuyerCommitted")
          .withArgs(offerId, buyerId, id, exchangeStruct);
      });

      it("should update state", async function () {
        // Create a seller
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId);

        // Get the exchange as a struct
        [, exchangeStruct] = await exchangeHandler.connect(rando).getExchange(id);

        // Parse into entity
        exchange = exchange.fromStruct(exchangeStruct);

        // Returned values should match the input in
        for ([key, value] of Object.entries(exchange)) {
          expect(JSON.stringify(exchange[key]) === JSON.stringify(value)).is.true;
        }
      });

      context("💔 Revert Reasons", async function () {
        it("buyer address is the zero address", async function () {
          seller.operator = ethers.constants.AddressZero;

          // Attempt to Create a seller, expecting revert
          await expect(accountHandler.connect(admin).createSeller(seller)).to.revertedWith(
            RevertReasons.INVALID_ADDRESS
          );

          seller.operator = operator.address;
          seller.clerk = ethers.constants.AddressZero;

          // Attempt to Create a seller, expecting revert
          await expect(accountHandler.connect(admin).createSeller(seller)).to.revertedWith(
            RevertReasons.INVALID_ADDRESS
          );

          seller.clerk = clerk.address;
          seller.admin = ethers.constants.AddressZero;

          // Attempt to Create a seller, expecting revert
          await expect(accountHandler.connect(rando).createSeller(seller)).to.revertedWith(
            RevertReasons.INVALID_ADDRESS
          );
        });
        // TODO test a whole lotta reasons...
      });
    });

    context("👉 getExchange()", async function () {
      beforeEach(async function () {
        // Create a seller
        await accountHandler.connect(admin).createSeller(seller);

        // id of the current seller and increment nextExchangeId
        id = nextExchangeId++;
      });

      it("should return true for exists if exchange is found", async function () {
        // Get the exists flag
        [exists] = await accountHandler.connect(rando).getSeller(id);

        // Validate
        expect(exists).to.be.true;
      });

      it("should return false for exists if exchange is not found", async function () {
        // Get the exists flag
        [exists] = await accountHandler.connect(rando).getSeller(invalidAccountId);

        // Validate
        expect(exists).to.be.false;
      });

      it("should return the details of the exchange as a struct if found", async function () {
        // Get the seller as a struct
        [, sellerStruct] = await accountHandler.connect(rando).getSeller(id);

        // Parse into entity
        seller = Seller.fromStruct(sellerStruct);

        // Validate
        expect(seller.isValid()).to.be.true;
      });
    });

    context("👉 getNextExchangeId()", async function () {
      beforeEach(async function () {
        
        // id of the current seller and increment nextExchangeId
        id = nextExchangeId++;
        
      });

      it("should return the next exchange id", async function () {
        // What we expect the next seller id to be
        expected = nextExchangeId;

        // Get the next seller id
        nextExchangeId = await accountHandler.connect(rando).getNextExchangeId();

        // Verify expectation
        expect(nextExchangeId.toString() === expected).to.be.true;
      });

      it("should be incremented after an exchange is created", async function () {
        //addresses need to be unique to seller Id, so setting them to random addresses here
        seller.operator = rando.address;
        seller.admin = other1.address;
        seller.clerk = other2.address;

        // Create another seller
        await accountHandler.connect(admin).createSeller(seller);

        // What we expect the next account id to be
        expected = ++nextExchangeId;

        // Get the next account id
        nextExchangeId = await accountHandler.connect(rando).getNextExchangeId();

        // Verify expectation
        expect(nextExchangeId.toString() === expected).to.be.true;
      });

      it("should not be incremented when only getNextExchangeId is called", async function () {
        // What we expect the next seller id to be
        expected = nextExchangeId;

        // Get the next seller id
        nextExchangeId = await accountHandler.connect(rando).getNextExchangeId();

        // Verify expectation
        expect(nextExchangeId.toString() === expected).to.be.true;

        // Call again
        nextExchangeId = await accountHandler.connect(rando).getNextExchangeId();

        // Verify expectation
        expect(nextExchangeId.toString() === expected).to.be.true;
      });
    });
  });

});
