const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");
const { gasLimit } = require("../../environments");

const Role = require("../../scripts/domain/Role");
const Seller = require("../../scripts/domain/Seller");
const Offer = require("../../scripts/domain/Offer");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");

/**
 *  Test the Boson Combo Handler interface
 */
describe("IBosonComboHandler", function () {
  // Common vars
  let InterfaceIds;
  let accounts, deployer, rando, operator, admin, clerk, treasury;
  let erc165, protocolDiamond, accessController, accountHandler, offerHandler, comboHandler, offerStruct, key, value;
  let offer, nextOfferId, oneMonth, oneWeek, support, exists;
  let nextAccountId;
  let seller, sellerStruct, active;
  let id,
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
    offerChecksum,
    voided;

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

    // Deploy the Protocol Diamond
    [protocolDiamond, , , accessController] = await deployProtocolDiamond();

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Cut the protocol handler facets into the Diamond
    await deployProtocolHandlerFacets(protocolDiamond, [
      "AccountHandlerFacet",
      "OfferHandlerFacet",
      "ComboHandlerFacet",
    ]);

    // Add config Handler, so offer id starts at 1
    const protocolConfig = [
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0",
      "100",
      "100",
      "100",
      "100",
    ];
    await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);

    // Cast Diamond to IERC165
    erc165 = await ethers.getContractAt("IERC165", protocolDiamond.address);

    // Cast Diamond to IBosonAccountHandler
    accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);

    // Cast Diamond to IOfferHandler
    offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);

    // Cast Diamond to IComboHandler
    comboHandler = await ethers.getContractAt("IBosonComboHandler", protocolDiamond.address);
  });

  // Interface support (ERC-156 provided by ProtocolDiamond, others by deployed facets)
  context("📋 Interfaces", async function () {
    context("👉 supportsInterface()", async function () {
      it("should indicate support for IBosonComboHandler interface", async function () {
        // Current interfaceId for IOfferHandler
        support = await erc165.supportsInterface(InterfaceIds.IBosonComboHandler);

        // Test
        await expect(support, "IBosonComboHandler interface not supported").is.true;
      });
    });
  });

  // All supported methods - single offer
  context("📋 Combo Handler Methods", async function () {
    beforeEach(async function () {
      // The first seller id
      nextAccountId = "1";

      // Required constructor params
      id = "1"; // argument sent to contract for createSeller will be ignored

      active = true;

      // Create a valid seller, then set fields in tests directly
      seller = new Seller(id, operator.address, admin.address, clerk.address, treasury.address, active);
      expect(seller.isValid()).is.true;

      // How that seller looks as a returned struct
      sellerStruct = seller.toStruct();

      // Some periods in milliseconds
      oneWeek = 604800 * 1000; //  7 days in milliseconds
      oneMonth = 2678400 * 1000; // 31 days in milliseconds

      // The first offer id
      nextOfferId = "1";

      // Required constructor params
      id = sellerId = "1"; // argument sent to contract for createOffer will be ignored
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
      offerChecksum = "QmYXc12ov6F2MZVZwPs5XeCBbf61cW3wKRk8h3D5NTYj4T"; // not an actual offerChecksum, just some data for tests
      metadataUri = `https://ipfs.io/ipfs/${offerChecksum}`;
      voided = false;

      // Create a valid offer, then set fields in tests directly
      offer = new Offer(
        id,
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
        offerChecksum,
        voided
      );
      expect(offer.isValid()).is.true;

      // How that offer looks as a returned struct
      offerStruct = offer.toStruct();
    });

    context("👉 createSellerAndOffer()", async function () {
      it("should emit an SellerCreated and OfferCreated event", async function () {
        // Create an offer, testing for the event
        await expect(comboHandler.connect(operator).createSellerAndOffer(seller, offer))
          .to.emit(accountHandler, "SellerCreated")
          .withArgs(seller.id, sellerStruct)
          .to.emit(comboHandler, "OfferCreated")
          .withArgs(nextOfferId, offer.sellerId, offerStruct);
      });

      it("should update state", async function () {
        // Create an offer
        await comboHandler.connect(operator).createSellerAndOffer(seller, offer);

        // Get the seller as a struct
        [, sellerStruct] = await accountHandler.connect(rando).getSeller(id);

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);

        // Returned values should match the input in createSeller
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }

        // Get the offer as a struct
        [, offerStruct] = await offerHandler.connect(rando).getOffer(id);

        // Parse into entity
        let returnedOffer = Offer.fromStruct(offerStruct);

        // Returned values should match the input in createOffer
        for ([key, value] of Object.entries(offer)) {
          expect(JSON.stringify(returnedOffer[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should ignore any provided id and assign the next available", async function () {
        seller.id = "444";
        offer.id = "555";

        // Create an offer, testing for the event
        await expect(comboHandler.connect(operator).createSellerAndOffer(seller, offer))
          .to.emit(accountHandler, "SellerCreated")
          .withArgs(nextAccountId, sellerStruct)
          .to.emit(comboHandler, "OfferCreated")
          .withArgs(nextOfferId, offer.sellerId, offerStruct);

        // wrong seller id should not exist
        [exists] = await accountHandler.connect(rando).getSeller(seller.id);
        expect(exists).to.be.false;

        // next seller id should exist
        [exists] = await accountHandler.connect(rando).getSeller(nextAccountId);
        expect(exists).to.be.true;

        // wrong offer id should not exist
        [exists] = await offerHandler.connect(rando).getOffer(offer.id);
        expect(exists).to.be.false;

        // next offer id should exist
        [exists] = await offerHandler.connect(rando).getOffer(nextOfferId);
        expect(exists).to.be.true;
      });

      it("should ignore any provided seller and assign seller id of msg.sender", async function () {
        // set some other sellerId
        offer.sellerId = "123";

        // Create an offer, testing for the event
        await expect(comboHandler.connect(operator).createSellerAndOffer(seller, offer))
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offerStruct);
      });

      context("💔 Revert Reasons", async function () {
        it("Caller not operator of any seller", async function () {
          // Attempt to Create an offer, expecting revert
          await expect(offerHandler.connect(rando).createOffer(offer)).to.revertedWith(RevertReasons.NO_SUCH_SELLER);
        });

        xit("Caller is not operator the specified in seller", async function () {
          // Attempt to Create an offer, expecting revert
        });

        it("Valid from date is greater than valid until date", async function () {
          // Reverse the from and until dates
          offer.validFromDate = ethers.BigNumber.from(Date.now() + oneMonth * 6).toString(); // 6 months from now
          offer.validUntilDate = ethers.BigNumber.from(Date.now()).toString(); // now

          // Attempt to Create an offer, expecting revert
          await expect(offerHandler.connect(operator).createOffer(offer)).to.revertedWith(
            RevertReasons.OFFER_PERIOD_INVALID
          );
        });

        it("Valid until date is not in the future", async function () {
          // Set until date in the past
          offer.validUntilDate = ethers.BigNumber.from(Date.now() - oneMonth * 6).toString(); // 6 months ago

          // Attempt to Create an offer, expecting revert
          await expect(offerHandler.connect(operator).createOffer(offer)).to.revertedWith(
            RevertReasons.OFFER_PERIOD_INVALID
          );
        });

        it("Buyer cancel penalty is less than item price", async function () {
          // Set buyer cancel penalty higher than offer price
          offer.buyerCancelPenalty = ethers.BigNumber.from(offer.price).add(10).toString();

          // Attempt to Create an offer, expecting revert
          await expect(offerHandler.connect(operator).createOffer(offer)).to.revertedWith(
            RevertReasons.OFFER_PENALTY_INVALID
          );
        });

        it("Offer cannot be voided at the time of the creation", async function () {
          // Set voided flag to true
          offer.voided = true;

          // Attempt to Create an offer, expecting revert
          await expect(offerHandler.connect(operator).createOffer(offer)).to.revertedWith(
            RevertReasons.OFFER_MUST_BE_ACTIVE
          );
        });
      });
    });
  });
});
