const hre = require("hardhat");
const ethers = hre.ethers;
const { expect, assert } = require("chai");
const { gasLimit } = require("../../environments");

const Role = require("../../scripts/domain/Role");
const Seller = require("../../scripts/domain/Seller");
const Twin = require("../../scripts/domain/Twin");
const Bundle = require("../../scripts/domain/Bundle");
const Offer = require("../../scripts/domain/Offer");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { getEvent } = require("../../scripts/util/test-events.js");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");

/**
 *  Test the Boson Bundle Handler interface
 */
describe("IBosonBundleHandler", function () {
  // Common vars
  let InterfaceIds;
  let accounts, deployer, rando, operator, admin, clerk, treasury;
  let erc165,
    protocolDiamond,
    accessController,
    twinHandler,
    accountHandler,
    bundleHandler,
    bosonToken,
    twin,
    support,
    id,
    sellerId,
    supplyAvailable,
    supplyIds,
    tokenId,
    tokenAddress,
    key,
    value;
  let offerHandler, bundleHandlerFacet_Factory;
  let seller, active;
  let bundleStruct;
  let twinIdsToAdd, twinIdsToRemove;
  let bundle, bundleId, offerIds, twinIds, nextBundleId, invalidBundleId, bundleInstance;
  let offer, oneMonth, oneWeek, exists, expected;
  let offerId,
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
    await deployProtocolHandlerFacets(protocolDiamond, ["AccountHandlerFacet"]);
    await deployProtocolHandlerFacets(protocolDiamond, ["TwinHandlerFacet"]);
    await deployProtocolHandlerFacets(protocolDiamond, ["OfferHandlerFacet"]);
    await deployProtocolHandlerFacets(protocolDiamond, ["BundleHandlerFacet"]);

    // Add config Handler, so twin id starts at 1
    const protocolConfig = [
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0",
      "100",
      "100",
      "100",
    ];
    await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);

    // Cast Diamond to IERC165
    erc165 = await ethers.getContractAt("IERC165", protocolDiamond.address);
    // Cast Diamond to IBosonAccountHandler
    accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);
    // Cast Diamond to ITwinHandler
    twinHandler = await ethers.getContractAt("IBosonTwinHandler", protocolDiamond.address);
    // Cast Diamond to IBundleHandler
    bundleHandler = await ethers.getContractAt("IBosonBundleHandler", protocolDiamond.address);
    // Cast Diamond to IOfferHandler
    offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);

    // Deploy the mock tokens
    [bosonToken] = await deployMockTokens(gasLimit);
  });

  // Interface support (ERC-156 provided by ProtocolDiamond, others by deployed facets)
  context("📋 Interfaces", async function () {
    context("👉 supportsInterface()", async function () {
      it("should indicate support for IBosonBundleHandler interface", async function () {
        // Current interfaceId for IBosonBundleHandler
        support = await erc165.supportsInterface(InterfaceIds.IBosonBundleHandler);

        // Test
        await expect(support, "IBosonBundleHandler interface not supported").is.true;
      });
    });
  });

  // All supported methods
  context("📋 Bundler Handler Methods", async function () {
    beforeEach(async function () {
      // create a seller
      // Required constructor params
      id = "1"; // argument sent to contract for createSeller will be ignored
      active = true;

      // Create a valid seller, then set fields in tests directly
      seller = new Seller(id, operator.address, admin.address, clerk.address, treasury.address, active);
      expect(seller.isValid()).is.true;
      await accountHandler.connect(admin).createSeller(seller);

      // create 5 twins
      for (let i = 0; i < 5; i++) {
        // Required constructor params for Twin
        id = sellerId = "1";
        supplyAvailable = "1000";
        tokenId = "2048";
        supplyIds = ["3", "4"];
        tokenAddress = bosonToken.address;

        // Create a valid twin.
        twin = new Twin(id, sellerId, supplyAvailable, supplyIds, tokenId, tokenAddress);
        expect(twin.isValid()).is.true;

        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(operator).approve(twinHandler.address, 1); // approving the twin handler

        // Create a twin.
        await twinHandler.connect(operator).createTwin(twin);
      }

      // create 5 offers
      for (let i = 0; i < 5; i++) {
        // Some periods in milliseconds
        oneWeek = 604800 * 1000; //  7 days in milliseconds
        oneMonth = 2678400 * 1000; // 31 days in milliseconds

        // Required constructor params
        offerId = sellerId = "1"; // argument sent to contract for createOffer will be ignored
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

        // Create a valid offer.
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
          offerChecksum,
          voided
        );

        expect(offer.isValid()).is.true;

        await offerHandler.connect(operator).createOffer(offer);
      }

      // The first bundle id
      bundleId = nextBundleId = "1";
      invalidBundleId = "666";

      // Required constructor params for Bundle
      offerIds = ["2", "3", "5"];
      twinIds = ["2", "3", "5"];

      bundle = new Bundle(bundleId, sellerId, offerIds, twinIds);

      expect(bundle.isValid()).is.true;

      // How that bundle looks as a returned struct
      bundleStruct = bundle.toStruct();

      // initialize bundleHandler
      bundleHandlerFacet_Factory = await ethers.getContractFactory("BundleHandlerFacet");
    });

    context("👉 createBundle()", async function () {
      it("should emit a BundleCreated event", async function () {
        const tx = await bundleHandler.connect(operator).createBundle(bundle);
        const txReceipt = await tx.wait();

        const event = getEvent(txReceipt, bundleHandlerFacet_Factory, "BundleCreated");

        bundleInstance = Bundle.fromStruct(event.bundle);
        // Validate the instance
        expect(bundleInstance.isValid()).to.be.true;

        assert.equal(event.bundleId.toString(), nextBundleId, "Bundle Id is incorrect");
        assert.equal(event.sellerId.toString(), bundle.sellerId, "Seller Id is incorrect");
        assert.equal(bundleInstance.toString(), bundle.toString(), "Bundle struct is incorrect");
      });

      it("should update state", async function () {
        // Create a a bundle
        await bundleHandler.connect(operator).createBundle(bundle);

        // Get the bundle as a struct
        [, bundleStruct] = await bundleHandler.connect(rando).getBundle(bundleId);

        // Parse into entity
        let returnedBundle = Bundle.fromStruct(bundleStruct);

        // Returned values should match the input in createBundle
        for ([key, value] of Object.entries(bundle)) {
          expect(JSON.stringify(returnedBundle[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should ignore any provided id and assign the next available", async function () {
        bundle.id = "444";

        // Create a bundle, testing for the event
        const tx = await bundleHandler.connect(operator).createBundle(bundle);
        const txReceipt = await tx.wait();

        const event = getEvent(txReceipt, bundleHandlerFacet_Factory, "BundleCreated");

        bundleInstance = Bundle.fromStruct(event.bundle);
        // Validate the instance
        expect(bundleInstance.isValid()).to.be.true;

        assert.equal(event.bundleId.toString(), nextBundleId, "Bundle Id is incorrect");
        assert.equal(event.sellerId.toString(), bundle.sellerId, "Seller Id is incorrect");
        assert.equal(bundleInstance.toStruct().toString(), bundleStruct.toString(), "Bundle struct is incorrect");

        // wrong bundle id should not exist
        [exists] = await bundleHandler.connect(rando).getBundle(bundle.id);
        expect(exists).to.be.false;

        // next bundle id should exist
        [exists] = await bundleHandler.connect(rando).getBundle(nextBundleId);
        expect(exists).to.be.true;
      });

      it("should create bundle without any offer", async function () {
        bundle.offerIds = [];

        // Create a bundle, testing for the event
        await bundleHandler.connect(operator).createBundle(bundle);

        let returnedBundle;
        // bundle should have no offers
        [, returnedBundle] = await bundleHandler.connect(rando).getBundle(nextBundleId);
        assert.equal(returnedBundle.offerIds, bundle.offerIds.toString(), "Offer ids should be empty");
      });

      it("should create bundle without any twin", async function () {
        bundle.twinIds = [];

        // Create a bundle, testing for the event
        await bundleHandler.connect(operator).createBundle(bundle);

        let returnedBundle;
        // bundle should have no twins
        [, returnedBundle] = await bundleHandler.connect(rando).getBundle(nextBundleId);
        assert.equal(returnedBundle.twinIds, bundle.twinIds.toString(), "Twin ids should be empty");
      });

      it("Twin is already part of another bundle", async function () {
        // create first bundle
        await bundleHandler.connect(operator).createBundle(bundle);

        // Set offer that is NOT already part of another bundle
        bundle.offerIds = ["1"];
        // Set twin that is already part of another bundle
        bundle.twinIds = ["1", "2", "4"];

        const expectedNextBundleId = (parseInt(nextBundleId) + 1).toString();
        const expectedBundle = bundle.clone();
        expectedBundle.id = expectedNextBundleId;

        // create another bundle
        const tx = await bundleHandler.connect(operator).createBundle(bundle);
        const txReceipt = await tx.wait();

        const event = getEvent(txReceipt, bundleHandlerFacet_Factory, "BundleCreated");

        bundleInstance = Bundle.fromStruct(event.bundle);
        // Validate the instance
        expect(bundleInstance.isValid()).to.be.true;

        assert.equal(event.bundleId.toString(), expectedNextBundleId, "Bundle Id is incorrect");
        assert.equal(event.sellerId.toString(), expectedBundle.sellerId, "Seller Id is incorrect");
        assert.equal(bundleInstance.toString(), expectedBundle.toString(), "Bundle struct is incorrect");
      });

      it("should ignore any provided seller and assign seller id of msg.sender", async function () {
        // set some other sellerId
        bundle.sellerId = "123";

        // Create a bundle, testing for the event
        const tx = await bundleHandler.connect(operator).createBundle(bundle);
        const txReceipt = await tx.wait();

        const event = getEvent(txReceipt, bundleHandlerFacet_Factory, "BundleCreated");

        const bundleInstance = Bundle.fromStruct(event.bundle);
        // Validate the instance
        expect(bundleInstance.isValid()).to.be.true;

        assert.equal(event.bundleId.toString(), nextBundleId, "Bundle Id is incorrect");
        assert.equal(event.sellerId.toString(), sellerId, "Seller Id is incorrect");
        assert.equal(bundleInstance.toStruct().toString(), bundleStruct.toString(), "Bundle struct is incorrect");
      });
    });

    context("💔 Revert Reasons", async function () {
      it("Caller not operator of any seller", async function () {
        // Attempt to Create a bundle, expecting revert
        await expect(bundleHandler.connect(rando).createBundle(bundle)).to.revertedWith(RevertReasons.NOT_OPERATOR);
      });

      it("Caller is not the seller of all offers", async function () {
        // create another seller and an offer
        seller = new Seller(id, rando.address, rando.address, rando.address, rando.address, active);
        await accountHandler.connect(rando).createSeller(seller);
        await offerHandler.connect(rando).createOffer(offer); // creates an offer with id 6

        // add offer belonging to another seller
        bundle.offerIds = ["2", "6"];

        // Attempt to create a bundle, expecting revert
        await expect(bundleHandler.connect(operator).createBundle(bundle)).to.revertedWith(RevertReasons.NOT_OPERATOR);
      });

      it("Offer does not exist", async function () {
        // Invalid offer id
        bundle.offerIds = ["1", "999"];

        // Attempt to create a bundle, expecting revert
        await expect(bundleHandler.connect(operator).createBundle(bundle)).to.revertedWith(RevertReasons.NO_SUCH_OFFER);

        // Invalid offer id
        bundle.offerIds = ["0", "4"];

        // Attempt to create a bundle, expecting revert
        await expect(bundleHandler.connect(operator).createBundle(bundle)).to.revertedWith(RevertReasons.NO_SUCH_OFFER);
      });

      it("Caller is not the seller of all twins", async function () {
        // create another seller and a twin
        let expectedNewTwinId = "6";
        seller = new Seller(id, rando.address, rando.address, rando.address, rando.address, active);
        await accountHandler.connect(rando).createSeller(seller);
        await bosonToken.connect(rando).approve(twinHandler.address, 1); // approving the twin handler
        const tx = await twinHandler.connect(rando).createTwin(twin); // creates a twin with id 6
        const txReceipt = await tx.wait();
        const event = getEvent(txReceipt, twinHandler, "TwinCreated");
        assert.equal(event.twinId.toString(), expectedNewTwinId, "Twin Id is not 6");

        // add twin belonging to another seller
        bundle.twinIds = ["2", "6"];

        // Attempt to create a bundle, expecting revert
        await expect(bundleHandler.connect(operator).createBundle(bundle)).to.revertedWith(RevertReasons.NOT_OPERATOR);
      });

      it("Twin does not exist", async function () {
        // Invalid twin id
        bundle.twinIds = ["1", "999"];

        // Attempt to create a bundle, expecting revert
        await expect(bundleHandler.connect(operator).createBundle(bundle)).to.revertedWith(RevertReasons.NO_SUCH_TWIN);

        // Invalid twin id
        bundle.twinIds = ["0", "4"];

        // Attempt to create a bundle, expecting revert
        await expect(bundleHandler.connect(operator).createBundle(bundle)).to.revertedWith(RevertReasons.NO_SUCH_TWIN);
      });

      it("Offer is already part of another bundle", async function () {
        // create first bundle
        await bundleHandler.connect(operator).createBundle(bundle);

        // Set add offer that is already part of another bundle
        bundle.offerIds = ["1", "2", "4"];

        // Attempt to create a bundle, expecting revert
        await expect(bundleHandler.connect(operator).createBundle(bundle)).to.revertedWith(
          RevertReasons.OFFER_MUST_BE_UNIQUE
        );
      });

      it("Offer is duplicated", async function () {
        // Try to add the same offer twice
        bundle.offerIds = ["1", "1", "4"];

        // Attempt to create a bundle, expecting revert
        await expect(bundleHandler.connect(operator).createBundle(bundle)).to.revertedWith(
          RevertReasons.OFFER_MUST_BE_UNIQUE
        );
      });

      it("Adding too many offers", async function () {
        // Try to add the more than 100 offers
        bundle.offerIds = [...Array(101).keys()];

        // Attempt to create a bundle, expecting revert
        await expect(bundleHandler.connect(operator).createBundle(bundle)).to.revertedWith(
          RevertReasons.TOO_MANY_OFFERS
        );
      });

      it("Twin is duplicated", async function () {
        // Try to add the same twin twice
        bundle.twinIds = ["1", "1", "4"];

        // Attempt to create a bundle, expecting revert
        await expect(bundleHandler.connect(operator).createBundle(bundle)).to.revertedWith(
          RevertReasons.TWIN_ALREADY_EXISTS_IN_SAME_BUNDLE
        );
      });

      it("Adding too many twins", async function () {
        // Try to add the more than 100 twins
        bundle.twinIds = [...Array(101).keys()];

        // Attempt to create a bundle, expecting revert
        await expect(bundleHandler.connect(operator).createBundle(bundle)).to.revertedWith(
          RevertReasons.TOO_MANY_TWINS
        );
      });
    });

    context("👉 getBundle()", async function () {
      beforeEach(async function () {
        // Create a bundle
        await bundleHandler.connect(operator).createBundle(bundle);

        // id of the current bundle and increment nextBundleId
        id = nextBundleId++;
      });

      it("should return true for exists if bundle is found", async function () {
        // Get the exists flag
        [exists] = await bundleHandler.connect(rando).getBundle(bundleId);

        // Validate
        expect(exists).to.be.true;
      });

      it("should return false for exists if bundle is not found", async function () {
        // Get the exists flag
        [exists] = await bundleHandler.connect(rando).getBundle(invalidBundleId);

        // Validate
        expect(exists).to.be.false;
      });

      it("should return the details of the bundle as a struct if found", async function () {
        // Get the bundle as a struct
        [, bundleStruct] = await bundleHandler.connect(rando).getBundle(bundleId);

        // Parse into entity
        bundle = Bundle.fromStruct(bundleStruct);

        // Validate
        expect(bundle.isValid()).to.be.true;
      });
    });

    context("👉 getNextBundleId()", async function () {
      beforeEach(async function () {
        // Create a bundle
        await bundleHandler.connect(operator).createBundle(bundle);

        // id of the current bundle and increment nextBundleId
        id = nextBundleId++;
      });

      it("should return the next bundle id", async function () {
        // What we expect the next bundle id to be
        expected = nextBundleId;

        // Get the next bundle id
        nextBundleId = await bundleHandler.connect(rando).getNextBundleId();

        // Verify expectation
        expect(nextBundleId.toString() == expected).to.be.true;
      });

      it("should be incremented after a bundle is created", async function () {
        // Create another bundle
        bundle.offerIds = ["1", "4"];
        await bundleHandler.connect(operator).createBundle(bundle);

        // What we expect the next bundle id to be
        expected = ++nextBundleId;

        // Get the next bundle id
        nextBundleId = await bundleHandler.connect(rando).getNextBundleId();

        // Verify expectation
        expect(nextBundleId.toString() == expected).to.be.true;
      });

      it("should not be incremented when only getNextBundleId is called", async function () {
        // What we expect the next bundle id to be
        expected = nextBundleId;

        // Get the next bundle id
        nextBundleId = await bundleHandler.connect(rando).getNextBundleId();

        // Verify expectation
        expect(nextBundleId.toString() == expected).to.be.true;

        // Call again
        nextBundleId = await bundleHandler.connect(rando).getNextBundleId();

        // Verify expectation
        expect(nextBundleId.toString() == expected).to.be.true;
      });
    });

    context("👉 addTwinsToBundle()", async function () {
      beforeEach(async function () {
        // Create a bundle
        await bundleHandler.connect(operator).createBundle(bundle);

        // set the new fields
        twinIdsToAdd = ["1", "4"];
        bundle.twinIds = [...bundle.twinIds, ...twinIdsToAdd];

        bundleStruct = bundle.toStruct();
      });

      it("should emit a BundleUpdated event", async function () {
        // Add twins to a bundle, testing for the event
        const tx = await bundleHandler.connect(operator).addTwinsToBundle(bundle.id, twinIdsToAdd);
        const txReceipt = await tx.wait();

        const event = getEvent(txReceipt, bundleHandlerFacet_Factory, "BundleUpdated");

        const bundleInstance = Bundle.fromStruct(event.bundle);
        // Validate the instance
        expect(bundleInstance.isValid()).to.be.true;

        assert.equal(event.bundleId.toString(), bundle.id, "Bundle Id is incorrect");
        assert.equal(event.sellerId.toString(), bundle.sellerId, "Seller Id is incorrect");
        assert.equal(bundleInstance.toString(), bundle.toString(), "Bundle struct is incorrect");
      });

      it("should add twins to correct bundle", async function () {
        // Create a new bundle of id 2
        let expectedNewBundleId = "2";
        const newBundle = bundle.clone();
        newBundle.id = expectedNewBundleId;
        newBundle.twinIds = ["3"];
        newBundle.offerIds = ["1"];
        const tx = await bundleHandler.connect(operator).createBundle(newBundle); // creates new bundle of id 2
        const txReceipt = await tx.wait();
        const event = getEvent(txReceipt, bundleHandler, "BundleCreated");
        assert.equal(event.bundleId.toString(), expectedNewBundleId, "Bundle Id is not 2"); // verify that bundle id is 2

        // Add a new twin to bundle of id 1.
        let bundleIdToAddTwin = bundle.id;
        twinIdsToAdd = ["1"];

        // Bundle with id 1 does not have this twin.
        [, bundleStruct] = await bundleHandler.connect(rando).getBundle(bundleIdToAddTwin);
        let returnedBundle = Bundle.fromStruct(bundleStruct);
        expect(returnedBundle.twinIds.includes(twinIdsToAdd[0])).is.false;

        // Bundle with id 2 does not have this twin.
        [, bundleStruct] = await bundleHandler.connect(rando).getBundle(newBundle.id);
        returnedBundle = Bundle.fromStruct(bundleStruct);
        expect(returnedBundle.twinIds.includes(twinIdsToAdd[0])).is.false;

        // Adding the twins to bundle of id 1.
        await bundleHandler.connect(operator).addTwinsToBundle(bundleIdToAddTwin, twinIdsToAdd);

        // Bundle with id 1 now has this twin.
        [, bundleStruct] = await bundleHandler.connect(rando).getBundle(bundleIdToAddTwin);
        returnedBundle = Bundle.fromStruct(bundleStruct);
        expect(returnedBundle.twinIds.includes(twinIdsToAdd[0])).is.true;

        // Bundle with id 2 does not have this twin.
        [, bundleStruct] = await bundleHandler.connect(rando).getBundle(newBundle.id);
        returnedBundle = Bundle.fromStruct(bundleStruct);
        expect(returnedBundle.twinIds.includes(twinIdsToAdd[0])).is.false;
      });

      it("should update state", async function () {
        // Add twins to a bundle,
        await bundleHandler.connect(operator).addTwinsToBundle(bundle.id, twinIdsToAdd);

        // Get the bundle as a struct
        [, bundleStruct] = await bundleHandler.connect(rando).getBundle(bundle.id);

        // Parse into entity
        const returnedBundle = Bundle.fromStruct(bundleStruct);

        // Returned values should reflect the changes done with addTwinsToBundle
        for ([key, value] of Object.entries(bundle)) {
          expect(JSON.stringify(returnedBundle[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("Twin is already part of another bundle", async function () {
        // Create a new bundle with twinIds.
        const newBundle = bundle.clone();
        newBundle.twinIds = ["1"];
        newBundle.offerIds = ["1"];
        await bundleHandler.connect(operator).createBundle(newBundle);

        // Add Same twinIds to the first bundle, testing for the event
        const tx = await bundleHandler.connect(operator).addTwinsToBundle(bundle.id, twinIdsToAdd);
        const txReceipt = await tx.wait();

        const event = getEvent(txReceipt, bundleHandlerFacet_Factory, "BundleUpdated");

        const bundleInstance = Bundle.fromStruct(event.bundle);
        // Validate the instance
        expect(bundleInstance.isValid()).to.be.true;

        assert.equal(event.bundleId.toString(), bundle.id, "Bundle Id is incorrect");
        assert.equal(event.sellerId.toString(), bundle.sellerId, "Seller Id is incorrect");
        assert.equal(bundleInstance.toString(), bundle.toString(), "Bundle struct is incorrect");
      });

      context("💔 Revert Reasons", async function () {
        it("Caller is not the seller of the bundle", async function () {
          // Attempt to add twins to bundle, expecting revert
          await expect(bundleHandler.connect(rando).addTwinsToBundle(bundle.id, twinIdsToAdd)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );
        });

        it("Adding nothing", async function () {
          // Try to add nothing
          twinIdsToAdd = [];

          // Attempt to add twins from the bundle, expecting revert
          await expect(bundleHandler.connect(operator).addTwinsToBundle(bundle.id, twinIdsToAdd)).to.revertedWith(
            RevertReasons.NOTHING_UPDATED
          );
        });

        it("Adding too many twins", async function () {
          // Try to add the more than 100 twins
          twinIdsToAdd = [...Array(101).keys()];

          // Attempt to add twins to a bundle, expecting revert
          await expect(bundleHandler.connect(operator).addTwinsToBundle(bundle.id, twinIdsToAdd)).to.revertedWith(
            RevertReasons.TOO_MANY_TWINS
          );
        });

        it("Bundle does not exist", async function () {
          // Set invalid id
          bundle.id = "444";

          // Attempt to add twins to the bundle, expecting revert
          await expect(bundleHandler.connect(operator).addTwinsToBundle(bundle.id, twinIdsToAdd)).to.revertedWith(
            RevertReasons.NO_SUCH_BUNDLE
          );

          // Set invalid id
          bundle.id = "0";

          // Attempt to add twins to bundle, expecting revert
          await expect(bundleHandler.connect(operator).addTwinsToBundle(bundle.id, twinIdsToAdd)).to.revertedWith(
            RevertReasons.NO_SUCH_BUNDLE
          );
        });

        it("Caller is not the seller of all twins", async function () {
          // create another seller and a twin
          let expectedNewTwinId = "6";
          seller = new Seller(id, rando.address, rando.address, rando.address, rando.address, active);
          await accountHandler.connect(rando).createSeller(seller);
          await bosonToken.connect(rando).approve(twinHandler.address, 1); // approving the twin handler
          const tx = await twinHandler.connect(rando).createTwin(twin); // creates a twin with id 6
          const txReceipt = await tx.wait();
          const event = getEvent(txReceipt, twinHandler, "TwinCreated");
          assert.equal(event.twinId.toString(), expectedNewTwinId, "Twin Id is not 6");

          // add twin belonging to another seller
          twinIdsToAdd = ["1", "6"];

          // Attempt to add twins to bundle, expecting revert
          await expect(bundleHandler.connect(operator).addTwinsToBundle(bundle.id, twinIdsToAdd)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );
        });

        it("Twin does not exist", async function () {
          // Set invalid twin id
          twinIdsToAdd = ["1", "999"];

          // Attempt to add twins to a bundle, expecting revert
          await expect(bundleHandler.connect(operator).addTwinsToBundle(bundle.id, twinIdsToAdd)).to.revertedWith(
            RevertReasons.NO_SUCH_TWIN
          );

          // Set invalid twin id
          twinIdsToAdd = ["0", "2"];

          // Attempt to add twins to a bundle, expecting revert
          await expect(bundleHandler.connect(operator).addTwinsToBundle(bundle.id, twinIdsToAdd)).to.revertedWith(
            RevertReasons.NO_SUCH_TWIN
          );
        });

        it("Twin already exists in the same bundle", async function () {
          // Try to add the same twin twice
          twinIdsToAdd = ["1"];

          // Add twin to bundle once
          await bundleHandler.connect(operator).addTwinsToBundle(bundle.id, twinIdsToAdd);

          // Attempt to add same twin again into the same bundle, expecting revert
          await expect(bundleHandler.connect(operator).addTwinsToBundle(bundle.id, twinIdsToAdd)).to.revertedWith(
            RevertReasons.TWIN_ALREADY_EXISTS_IN_SAME_BUNDLE
          );
        });

        it("Twin is duplicated", async function () {
          // Try to add the same twin twice
          twinIdsToAdd = ["1", "1", "4"];

          // Attempt to add twins to a bundle, expecting revert
          await expect(bundleHandler.connect(operator).addTwinsToBundle(bundle.id, twinIdsToAdd)).to.revertedWith(
            RevertReasons.TWIN_ALREADY_EXISTS_IN_SAME_BUNDLE
          );
        });
      });
    });

    context("👉 removeTwinsFromBundle()", async function () {
      beforeEach(async function () {
        bundle.twinIds = ["1", "2", "3", "4", "5"];
        // Create a bundle
        await bundleHandler.connect(operator).createBundle(bundle);

        // set the new fields
        twinIdsToRemove = ["1", "4"];
        bundle.twinIds = ["5", "2", "3"]; // ["1","2","3","4","5"] -> ["5","2","3","4"] -> ["5","2","3"]

        bundleStruct = bundle.toStruct();
      });

      it("should emit a BundleUpdated event", async function () {
        // Remove twins from a bundle, testing for the event
        const tx = await bundleHandler.connect(operator).removeTwinsFromBundle(bundle.id, twinIdsToRemove);
        const txReceipt = await tx.wait();

        const event = getEvent(txReceipt, bundleHandlerFacet_Factory, "BundleUpdated");

        const bundleInstance = Bundle.fromStruct(event.bundle);
        // Validate the instance
        expect(bundleInstance.isValid()).to.be.true;

        assert.equal(event.bundleId.toString(), bundle.id, "Bundle Id is incorrect");
        assert.equal(event.sellerId.toString(), bundle.sellerId, "Seller Id is incorrect");
        assert.equal(bundleInstance.toString(), bundle.toString(), "Bundle struct is incorrect");
      });

      it("should remove twins from correct bundle", async function () {
        let bundleIdToRemoveTwin = bundle.id; // Bundle from which we want we want to remove new twin Ids.
        twinIdsToRemove = ["2"]; // The Twin id which we want to remove.

        // Get the bundle as a struct, expect that twinId does exist.
        [, bundleStruct] = await bundleHandler.connect(rando).getBundle(bundleIdToRemoveTwin);
        let returnedBundle = Bundle.fromStruct(bundleStruct);
        expect(returnedBundle.twinIds.includes(twinIdsToRemove[0])).is.true;

        // Removing the twins from the same bundle.
        await bundleHandler.connect(operator).removeTwinsFromBundle(bundleIdToRemoveTwin, twinIdsToRemove);

        // Get the bundle as a struct, expect that twinId now doesn't exist.
        [, bundleStruct] = await bundleHandler.connect(rando).getBundle(bundleIdToRemoveTwin);
        returnedBundle = Bundle.fromStruct(bundleStruct);
        expect(returnedBundle.twinIds.includes(twinIdsToRemove[0])).is.false;
      });

      it("should update state", async function () {
        // Remove twin from a bundle,
        await bundleHandler.connect(operator).removeTwinsFromBundle(bundle.id, twinIdsToRemove);

        // Get the bundle as a struct
        [, bundleStruct] = await bundleHandler.connect(rando).getBundle(bundle.id);

        // Parse into entity
        const returnedBundle = Bundle.fromStruct(bundleStruct);

        // Returned values should  reflect the changes done with removeTwinsFromBundle
        for ([key, value] of Object.entries(bundle)) {
          expect(JSON.stringify(returnedBundle[key]) === JSON.stringify(value)).is.true;
        }
      });

      context("💔 Revert Reasons", async function () {
        it("Bundle does not exist", async function () {
          // Set invalid id
          bundle.id = "444";

          // Attempt to remove twins from the bundle, expecting revert
          await expect(
            bundleHandler.connect(operator).removeTwinsFromBundle(bundle.id, twinIdsToRemove)
          ).to.revertedWith(RevertReasons.NO_SUCH_BUNDLE);

          // Set invalid id
          bundle.id = "0";

          // Attempt to remove twins from bundle, expecting revert
          await expect(
            bundleHandler.connect(operator).removeTwinsFromBundle(bundle.id, twinIdsToRemove)
          ).to.revertedWith(RevertReasons.NO_SUCH_BUNDLE);
        });

        it("Caller is not seller of a bundle", async function () {
          // Attempt to remove twins from the bundle, expecting revert
          await expect(bundleHandler.connect(rando).removeTwinsFromBundle(bundle.id, twinIdsToRemove)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );
        });

        it("Twin is not a part of the bundle", async function () {
          // inexisting twin
          twinIdsToRemove = ["6"];

          // Attempt to remove twins from the bundle, expecting revert
          await expect(
            bundleHandler.connect(operator).removeTwinsFromBundle(bundle.id, twinIdsToRemove)
          ).to.revertedWith(RevertReasons.TWIN_NOT_IN_BUNDLE);

          // create a twin and add it to another bundle
          await bosonToken.connect(operator).approve(twinHandler.address, 1); //approving the twin handler
          await twinHandler.connect(operator).createTwin(twin);
          bundle.twinIds = ["6"];
          bundle.offerIds = ["1"];
          await bundleHandler.connect(operator).createBundle(bundle);

          // Attempt to remove twins from a bundle, expecting revert
          await expect(
            bundleHandler.connect(operator).removeTwinsFromBundle(bundle.id, twinIdsToRemove)
          ).to.revertedWith(RevertReasons.TWIN_NOT_IN_BUNDLE);
        });

        it("Removing too many twins", async function () {
          // Try to remove the more than 100 twins
          twinIdsToRemove = [...Array(101).keys()];

          // Attempt to remove twins from the bundle, expecting revert
          await expect(
            bundleHandler.connect(operator).removeTwinsFromBundle(bundle.id, twinIdsToRemove)
          ).to.revertedWith(RevertReasons.TOO_MANY_TWINS);
        });

        it("Removing nothing", async function () {
          // Try to remove nothing
          twinIdsToRemove = [];

          // Attempt to remove twins from the bundle, expecting revert
          await expect(
            bundleHandler.connect(operator).removeTwinsFromBundle(bundle.id, twinIdsToRemove)
          ).to.revertedWith(RevertReasons.NOTHING_UPDATED);
        });
      });
    });
  });
});
