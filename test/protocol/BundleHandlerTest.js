const hre = require("hardhat");
const ethers = hre.ethers;
const { expect, assert } = require("chai");
const { gasLimit } = require("../../environments");

const Role = require("../../scripts/domain/Role");
const Seller = require("../../scripts/domain/Seller");
const Bundle = require("../../scripts/domain/Bundle");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { getEvent } = require("../../scripts/util/test-utils.js");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
const { mockOffer, mockTwin, mockDisputeResolver } = require("../utils/mock");
const { oneMonth } = require("../utils/constants");

/**
 *  Test the Boson Bundle Handler interface
 */
describe("IBosonBundleHandler", function () {
  // Common vars
  let InterfaceIds;
  let deployer, rando, operator, admin, clerk, treasury, buyer, operatorDR, adminDR, clerkDR, treasuryDR;
  let erc165,
    protocolDiamond,
    accessController,
    twinHandler,
    accountHandler,
    bundleHandler,
    exchangeHandler,
    fundsHandler,
    bosonToken,
    twin,
    support,
    id,
    sellerId,
    key,
    value,
    invalidTwinId;
  let offerHandler, bundleHandlerFacet_Factory;
  let seller, active, nextAccountId;
  let bundleStruct;
  let twinIdsToAdd, twinIdsToRemove, offerIdsToAdd, offerIdsToRemove;
  let bundle, bundleId, offerIds, twinId, twinIds, nextBundleId, invalidBundleId, bundleInstance;
  let offer, exists, expected;
  let offerId, invalidOfferId, price, sellerDeposit;
  let offerDates, offerDurations;
  let protocolFeePercentage, protocolFeeFlatBoson, buyerEscalationDepositPercentage;
  let disputeResolver, disputeResolverFees, disputeResolverId;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();

    // Mock offer
    ({ offer, offerDates, offerDurations, disputeResolverId } = await mockOffer());
    price = offer.price;
    sellerDeposit = offer.sellerDeposit;

    // Check if domains are valid
    expect(offer.isValid()).is.true;
    expect(offerDates.isValid()).is.true;
    expect(offerDurations.isValid()).is.true;
  });

  beforeEach(async function () {
    // Make accounts available
    [deployer, operator, admin, clerk, treasury, rando, buyer, operatorDR, adminDR, clerkDR, treasuryDR] =
      await ethers.getSigners();

    // Deploy the Protocol Diamond
    [protocolDiamond, , , accessController] = await deployProtocolDiamond();

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Grant PROTOCOL role to ProtocolDiamond address and renounces admin
    await accessController.grantRole(Role.PROTOCOL, protocolDiamond.address);

    // Cut the protocol handler facets into the Diamond
    await deployProtocolHandlerFacets(protocolDiamond, [
      "AccountHandlerFacet",
      "TwinHandlerFacet",
      "OfferHandlerFacet",
      "BundleHandlerFacet",
      "ExchangeHandlerFacet",
      "FundsHandlerFacet",
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

    // Add config Handler, so twin id starts at 1
    const protocolConfig = [
      // Protocol addresses
      {
        treasuryAddress: ethers.constants.AddressZero,
        tokenAddress: bosonToken.address,
        voucherBeaconAddress: beacon.address,
        beaconProxyAddress: proxy.address,
      },
      // Protocol limits
      {
        maxOffersPerGroup: 100,
        maxTwinsPerBundle: 100,
        maxOffersPerBundle: 100,
        maxOffersPerBatch: 100,
        maxTokensPerWithdrawal: 100,
        maxFeesPerDisputeResolver: 100,
        maxEscalationResponsePeriod: oneMonth,
        maxDisputesPerBatch: 100,
        maxAllowedSellers: 100,
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
    // Cast Diamond to IBosonAccountHandler
    accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);
    // Cast Diamond to ITwinHandler
    twinHandler = await ethers.getContractAt("IBosonTwinHandler", protocolDiamond.address);
    // Cast Diamond to IBundleHandler
    bundleHandler = await ethers.getContractAt("IBosonBundleHandler", protocolDiamond.address);
    // Cast Diamond to IOfferHandler
    offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);
    // Cast Diamond to IBosonExchangeHandler
    exchangeHandler = await ethers.getContractAt("IBosonExchangeHandler", protocolDiamond.address);
    // Cast Diamond to IBosonFundsHandler
    fundsHandler = await ethers.getContractAt("IBosonFundsHandler", protocolDiamond.address);

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
      id = nextAccountId = "1"; // argument sent to contract for createSeller will be ignored
      active = true;

      // Create a valid seller, then set fields in tests directly
      seller = new Seller(id, operator.address, admin.address, clerk.address, treasury.address, active);
      expect(seller.isValid()).is.true;
      await accountHandler.connect(admin).createSeller(seller);

      id = ++nextAccountId;

      // Create a valid dispute resolver
      disputeResolver = await mockDisputeResolver(
        operatorDR.address,
        adminDR.address,
        clerkDR.address,
        treasuryDR.address,
        false
      );
      expect(disputeResolver.isValid()).is.true;

      //Create DisputeResolverFee array so offer creation will succeed
      disputeResolverFees = [new DisputeResolverFee(ethers.constants.AddressZero, "Native", "0")];

      // Make empty seller list, so every seller is allowed
      const sellerAllowList = [];

      // Register and activate the dispute resolver
      await accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
      await accountHandler.connect(deployer).activateDisputeResolver(id);

      // create 5 twins
      for (let i = 0; i < 5; i++) {
        // Create a valid twin.
        twin = mockTwin(bosonToken.address);
        expect(twin.isValid()).is.true;

        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(operator).approve(twinHandler.address, 1); // approving the twin handler

        // Create a twin.
        await twinHandler.connect(operator).createTwin(twin);
      }

      // create 5 offers
      for (let i = 0; i < 5; i++) {
        await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId);
      }

      // The first bundle id
      bundleId = nextBundleId = "1";
      invalidBundleId = "666";

      // Required constructor params for Bundle
      offerIds = ["2", "3", "5"];
      twinIds = ["2", "3", "5"];
      sellerId = twin.sellerId;

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
        assert.equal(event.executedBy.toString(), operator.address, "Executed by is incorrect");
        assert.equal(bundleInstance.toStruct().toString(), bundleStruct.toString(), "Bundle struct is incorrect");
      });

      context("💔 Revert Reasons", async function () {
        it("Caller not operator of any seller", async function () {
          // Attempt to Create a bundle, expecting revert
          await expect(bundleHandler.connect(rando).createBundle(bundle)).to.revertedWith(RevertReasons.NOT_OPERATOR);
        });

        it("Caller is not the seller of all offers", async function () {
          // create another seller and an offer
          let expectedNewOfferId = "6";
          seller = new Seller(id, rando.address, rando.address, rando.address, rando.address, active);
          await accountHandler.connect(rando).createSeller(seller);
          const tx = await offerHandler
            .connect(rando)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId); // creates an offer with id 6
          const txReceipt = await tx.wait();
          const event = getEvent(txReceipt, offerHandler, "OfferCreated");
          assert.equal(event.offerId.toString(), expectedNewOfferId, "Offer Id is not 6");

          // add offer belonging to another seller
          bundle.offerIds = ["2", "6"];

          // Attempt to create a bundle, expecting revert
          await expect(bundleHandler.connect(operator).createBundle(bundle)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );
        });

        it("Offer does not exist", async function () {
          // Invalid offer id
          bundle.offerIds = ["1", "999"];

          // Attempt to create a bundle, expecting revert
          await expect(bundleHandler.connect(operator).createBundle(bundle)).to.revertedWith(
            RevertReasons.NO_SUCH_OFFER
          );

          // Invalid offer id
          bundle.offerIds = ["0", "4"];

          // Attempt to create a bundle, expecting revert
          await expect(bundleHandler.connect(operator).createBundle(bundle)).to.revertedWith(
            RevertReasons.NO_SUCH_OFFER
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
          bundle.twinIds = ["2", "6"];

          // Attempt to create a bundle, expecting revert
          await expect(bundleHandler.connect(operator).createBundle(bundle)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );
        });

        it("Twin does not exist", async function () {
          // Invalid twin id
          bundle.twinIds = ["1", "999"];

          // Attempt to create a bundle, expecting revert
          await expect(bundleHandler.connect(operator).createBundle(bundle)).to.revertedWith(
            RevertReasons.NO_SUCH_TWIN
          );

          // Invalid twin id
          bundle.twinIds = ["0", "4"];

          // Attempt to create a bundle, expecting revert
          await expect(bundleHandler.connect(operator).createBundle(bundle)).to.revertedWith(
            RevertReasons.NO_SUCH_TWIN
          );
        });

        it("Offer is already part of another bundle", async function () {
          // create first bundle
          await bundleHandler.connect(operator).createBundle(bundle);

          // Set add offer that is already part of another bundle
          bundle.offerIds = ["1", "2", "4"];

          // Attempt to create a bundle, expecting revert
          await expect(bundleHandler.connect(operator).createBundle(bundle)).to.revertedWith(
            RevertReasons.BUNDLE_OFFER_MUST_BE_UNIQUE
          );
        });

        it("Offer is duplicated", async function () {
          // Try to add the same offer twice
          bundle.offerIds = ["1", "1", "4"];

          // Attempt to create a bundle, expecting revert
          await expect(bundleHandler.connect(operator).createBundle(bundle)).to.revertedWith(
            RevertReasons.BUNDLE_OFFER_MUST_BE_UNIQUE
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
            RevertReasons.BUNDLE_TWIN_MUST_BE_UNIQUE
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

        it("Exchange already exists for the offerId in bundle", async function () {
          // Deposit seller funds so the commit will succeed
          await fundsHandler
            .connect(operator)
            .depositFunds(seller.id, ethers.constants.AddressZero, sellerDeposit, { value: sellerDeposit });

          // Commit to an offer
          let offerIdToCommit = bundle.offerIds[0];
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerIdToCommit, { value: price });

          // Attempt to Create a bundle, expecting revert
          await expect(bundleHandler.connect(operator).createBundle(bundle)).to.revertedWith(
            RevertReasons.EXCHANGE_FOR_OFFER_EXISTS
          );
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

          // Attempt to Create a bundle, expecting revert
          await expect(bundleHandler.connect(operator).createBundle(bundle)).to.revertedWith(
            RevertReasons.BUNDLE_TWIN_MUST_BE_UNIQUE
          );
        });

        it("Insufficient Twin supply to cover bundle offers", async function () {
          let expectedNewTwinId = "6";
          const newTwin = twin.clone();
          newTwin.supplyAvailable = "1";
          await twinHandler.connect(operator).createTwin(newTwin); // creates a twin with id 6

          bundle.twinIds = ["1", expectedNewTwinId];
          await expect(bundleHandler.connect(operator).createBundle(bundle)).to.revertedWith(
            RevertReasons.INSUFFICIENT_TWIN_SUPPLY_TO_COVER_BUNDLE_OFFERS
          );
        });

        it("Offers quantity is unlimited but twin supply is not", async function () {
          const newOffer = offer.clone();
          newOffer.quantityAvailable = ethers.constants.MaxUint256.toString();
          let expectedNewOfferId = "6";

          await offerHandler.connect(operator).createOffer(newOffer, offerDates, offerDurations, disputeResolverId);

          bundle.offerIds = [expectedNewOfferId];
          await expect(bundleHandler.connect(operator).createBundle(bundle)).to.revertedWith(
            RevertReasons.INSUFFICIENT_TWIN_SUPPLY_TO_COVER_BUNDLE_OFFERS
          );
        });
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
        bundle.twinIds = ["1"];
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
        assert.equal(event.executedBy.toString(), operator.address, "Executed by is incorrect");
        assert.equal(bundleInstance.toString(), bundle.toString(), "Bundle struct is incorrect");
      });

      it("should add twins to correct bundle", async function () {
        // Create a new bundle of id 2
        let expectedNewBundleId = "2";
        const newBundle = bundle.clone();
        newBundle.id = expectedNewBundleId;
        newBundle.twinIds = ["1"];
        newBundle.offerIds = ["1"];
        const tx = await bundleHandler.connect(operator).createBundle(newBundle); // creates new bundle of id 2
        const txReceipt = await tx.wait();
        const event = getEvent(txReceipt, bundleHandler, "BundleCreated");
        assert.equal(event.bundleId.toString(), expectedNewBundleId, "Bundle Id is not 2"); // verify that bundle id is 2

        // Add a new twin to bundle of id 1.
        let bundleIdToAddTwin = bundle.id;
        twinIdsToAdd = ["4"];

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
            RevertReasons.BUNDLE_TWIN_MUST_BE_UNIQUE
          );
        });

        it("Twin is duplicated", async function () {
          // Try to add the same twin twice
          twinIdsToAdd = ["1", "1", "4"];

          // Attempt to add twins to a bundle, expecting revert
          await expect(bundleHandler.connect(operator).addTwinsToBundle(bundle.id, twinIdsToAdd)).to.revertedWith(
            RevertReasons.BUNDLE_TWIN_MUST_BE_UNIQUE
          );
        });

        it("Twin is already part of another bundle", async function () {
          // Create a new bundle with twinIds.
          const newBundle = bundle.clone();
          newBundle.twinIds = ["1"];
          newBundle.offerIds = ["1"];
          await bundleHandler.connect(operator).createBundle(newBundle);

          // Attempt to add same twinIds to the frist bundle, expecting revert
          await expect(bundleHandler.connect(operator).addTwinsToBundle(bundle.id, twinIdsToAdd)).to.revertedWith(
            RevertReasons.BUNDLE_TWIN_MUST_BE_UNIQUE
          );
        });

        it("Insufficient Twin supply to cover bundle offers", async function () {
          let expectedNewTwinId = 6;
          const newTwin = twin.clone();
          newTwin.supplyAvailable = 1;
          await twinHandler.connect(operator).createTwin(newTwin); // creates a twin with id 6

          twinIdsToAdd = [expectedNewTwinId];
          await expect(bundleHandler.connect(operator).addTwinsToBundle(bundle.id, twinIdsToAdd)).to.revertedWith(
            RevertReasons.INSUFFICIENT_TWIN_SUPPLY_TO_COVER_BUNDLE_OFFERS
          );
        });

        it("Offers quantity is unlimited but twin supply is not", async function () {
          const newOffer = offer.clone();
          newOffer.quantityAvailable = ethers.constants.MaxUint256.toString();
          let expectedNewOfferId = "6";
          let expectedNewTwinId = "6";

          await offerHandler.connect(operator).createOffer(newOffer, offerDates, offerDurations, disputeResolverId);

          const newTwin = twin.clone();
          newTwin.supplyAvailable = ethers.constants.MaxUint256.toString();

          await twinHandler.connect(operator).createTwin(newTwin);

          bundle.twinIds = [expectedNewTwinId];
          bundle.offerIds = [expectedNewOfferId];
          bundle.id = ++nextBundleId;

          await bundleHandler.connect(operator).createBundle(bundle);

          await expect(bundleHandler.connect(operator).addTwinsToBundle(bundle.id, ["1"])).to.revertedWith(
            RevertReasons.INSUFFICIENT_TWIN_SUPPLY_TO_COVER_BUNDLE_OFFERS
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
        assert.equal(event.executedBy.toString(), operator.address, "Executed by is incorrect");
        assert.equal(bundleInstance.toString(), bundle.toString(), "Bundle struct is incorrect");
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

    context("👉 addOffersToBundle()", async function () {
      beforeEach(async function () {
        // Create a bundle
        await bundleHandler.connect(operator).createBundle(bundle);

        // set the new fields
        offerIdsToAdd = ["1", "4"];
        bundle.offerIds = [...bundle.offerIds, ...offerIdsToAdd];

        bundleStruct = bundle.toStruct();
      });

      it("should emit a BundleUpdated event", async function () {
        // Add offers to a bundle, testing for the event
        const tx = await bundleHandler.connect(operator).addOffersToBundle(bundle.id, offerIdsToAdd);
        const txReceipt = await tx.wait();

        const event = getEvent(txReceipt, bundleHandlerFacet_Factory, "BundleUpdated");

        const bundleInstance = Bundle.fromStruct(event.bundle);
        // Validate the instance
        expect(bundleInstance.isValid()).to.be.true;

        assert.equal(event.bundleId.toString(), bundle.id, "Bundle Id is incorrect");
        assert.equal(event.sellerId.toString(), bundle.sellerId, "Seller Id is incorrect");
        assert.equal(event.executedBy.toString(), operator.address, "Executed by is incorrect");
        assert.equal(bundleInstance.toString(), bundle.toString(), "Bundle struct is incorrect");
      });

      it("should add offers to correct bundle", async function () {
        // Create a new bundle of id 2
        let expectedNewBundleId = "2";
        const newBundle = bundle.clone();
        newBundle.id = expectedNewBundleId;
        newBundle.offerIds = ["4"];
        // Twin must be unique to a bundle
        newBundle.twinIds = ["1"];
        const tx = await bundleHandler.connect(operator).createBundle(newBundle); // creates new bundle of id 2
        const txReceipt = await tx.wait();
        const event = getEvent(txReceipt, bundleHandler, "BundleCreated");
        assert.equal(event.bundleId.toString(), expectedNewBundleId, "Bundle Id is not 2"); // verify that bundle id is 2

        let bundleIdToAddOffer = bundle.id; // Bundle in which we want we want to add new offer Ids.
        offerIdsToAdd = ["1"]; // The Offer id which we want to add.

        // Bundle with id 1 does not have this offer id.
        [, bundleStruct] = await bundleHandler.connect(rando).getBundle(bundleIdToAddOffer);
        let returnedBundle = Bundle.fromStruct(bundleStruct);
        expect(returnedBundle.offerIds.includes(offerIdsToAdd[0])).is.false;

        // Bundle with id 2 does not have this offer id.
        [, bundleStruct] = await bundleHandler.connect(rando).getBundle(newBundle.id);
        returnedBundle = Bundle.fromStruct(bundleStruct);
        expect(returnedBundle.offerIds.includes(offerIdsToAdd[0])).is.false;

        // Adding the offers to bundle of id 1.
        await bundleHandler.connect(operator).addOffersToBundle(bundleIdToAddOffer, offerIdsToAdd);

        // Bundle with id 1 now has this offer id.
        [, bundleStruct] = await bundleHandler.connect(rando).getBundle(bundleIdToAddOffer);
        returnedBundle = Bundle.fromStruct(bundleStruct);
        expect(returnedBundle.offerIds.includes(offerIdsToAdd[0])).is.true;

        // Bundle with id 2 does not have this offer id.
        [, bundleStruct] = await bundleHandler.connect(rando).getBundle(newBundle.id);
        returnedBundle = Bundle.fromStruct(bundleStruct);
        expect(returnedBundle.offerIds.includes(offerIdsToAdd[0])).is.false;
      });

      it("should update state", async function () {
        // Add offers to a bundle,
        await bundleHandler.connect(operator).addOffersToBundle(bundle.id, offerIdsToAdd);

        // Get the bundle as a struct
        [, bundleStruct] = await bundleHandler.connect(rando).getBundle(bundle.id);

        // Parse into entity
        const returnedBundle = Bundle.fromStruct(bundleStruct);

        // Returned values should reflect the changes done with addOffersToBundle
        for ([key, value] of Object.entries(bundle)) {
          expect(JSON.stringify(returnedBundle[key]) === JSON.stringify(value)).is.true;
        }
      });

      context("💔 Revert Reasons", async function () {
        it("Caller is not the seller of a bundle", async function () {
          // Attempt to add offers to bundle, expecting revert
          await expect(bundleHandler.connect(rando).addOffersToBundle(bundle.id, offerIdsToAdd)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );
        });

        it("Adding nothing", async function () {
          // Try to add nothing
          offerIdsToAdd = [];

          // Attempt to add offers to the bundle, expecting revert
          await expect(bundleHandler.connect(operator).addOffersToBundle(bundle.id, offerIdsToAdd)).to.revertedWith(
            RevertReasons.NOTHING_UPDATED
          );
        });

        it("Adding too many offers", async function () {
          // Try to add the more than 100 offers
          offerIdsToAdd = [...Array(101).keys()];

          // Attempt to add offers to a bundle, expecting revert
          await expect(bundleHandler.connect(operator).addOffersToBundle(bundle.id, offerIdsToAdd)).to.revertedWith(
            RevertReasons.TOO_MANY_OFFERS
          );
        });

        it("Bundle does not exist", async function () {
          // Set invalid id
          bundle.id = "444";

          // Attempt to add offers to the bundle, expecting revert
          await expect(bundleHandler.connect(operator).addOffersToBundle(bundle.id, offerIdsToAdd)).to.revertedWith(
            RevertReasons.NO_SUCH_BUNDLE
          );

          // Set invalid id
          bundle.id = "0";

          // Attempt to add offers to bundle, expecting revert
          await expect(bundleHandler.connect(operator).addOffersToBundle(bundle.id, offerIdsToAdd)).to.revertedWith(
            RevertReasons.NO_SUCH_BUNDLE
          );
        });

        it("Caller is not the seller of all offers", async function () {
          // create another seller and an offer
          let expectedNewOfferId = "6";
          seller = new Seller(id, rando.address, rando.address, rando.address, rando.address, active);
          await accountHandler.connect(rando).createSeller(seller);
          const tx = await offerHandler
            .connect(rando)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId); // creates an offer with id 6
          const txReceipt = await tx.wait();
          const event = getEvent(txReceipt, offerHandler, "OfferCreated");
          assert.equal(event.offerId.toString(), expectedNewOfferId, "Offer Id is not 6");

          // add offer belonging to another seller
          offerIdsToAdd = ["1", "6"];

          // Attempt to add offers to bundle, expecting revert
          await expect(bundleHandler.connect(operator).addOffersToBundle(bundle.id, offerIdsToAdd)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );
        });

        it("Offer is already part of another bundle", async function () {
          // create another bundle
          bundle.offerIds = ["1"];
          // Twin must be unique to a bundle";
          bundle.twinIds = ["1"];
          await bundleHandler.connect(operator).createBundle(bundle);

          // Attempt to add offers to a bundle, expecting revert
          await expect(bundleHandler.connect(operator).addOffersToBundle(bundle.id, offerIdsToAdd)).to.revertedWith(
            RevertReasons.BUNDLE_OFFER_MUST_BE_UNIQUE
          );
        });

        it("Offer is duplicated", async function () {
          // Try to add the same offer twice
          offerIdsToAdd = ["1", "1", "4"];

          // Attempt to add offers to a bundle, expecting revert
          await expect(bundleHandler.connect(operator).addOffersToBundle(bundle.id, offerIdsToAdd)).to.revertedWith(
            RevertReasons.BUNDLE_OFFER_MUST_BE_UNIQUE
          );
        });

        it("Offer does not exist", async function () {
          // Set invalid offer id
          offerIdsToAdd = ["1", "999"];

          // Attempt to add offers to a bundle, expecting revert
          await expect(bundleHandler.connect(operator).addOffersToBundle(bundle.id, offerIdsToAdd)).to.revertedWith(
            RevertReasons.NO_SUCH_OFFER
          );

          // Set invalid offer id
          offerIdsToAdd = ["0", "2"];

          // Attempt to add offers to a bundle, expecting revert
          await expect(bundleHandler.connect(operator).addOffersToBundle(bundle.id, offerIdsToAdd)).to.revertedWith(
            RevertReasons.NO_SUCH_OFFER
          );
        });

        it("Exchange already exists for the offerId in bundle", async function () {
          // Deposit seller funds so the commit will succeed
          await fundsHandler
            .connect(operator)
            .depositFunds(seller.id, ethers.constants.AddressZero, sellerDeposit, { value: sellerDeposit });

          // Commit to an offer
          let offerIdToCommit = offerIdsToAdd[0];
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerIdToCommit, { value: price });

          // Attempt to add offers to a bundle, expecting revert
          await expect(bundleHandler.connect(operator).addOffersToBundle(bundle.id, offerIdsToAdd)).to.revertedWith(
            RevertReasons.EXCHANGE_FOR_OFFER_EXISTS
          );
        });

        it("Offer supply is greater than bundle twins supply", async function () {
          let expectedNewOfferId = 6;
          const newOffer = offer.clone();

          // twin has supply for cover 3 offers
          newOffer.quantityAvailable = 4;
          await offerHandler.connect(operator).createOffer(newOffer, offerDates, offerDurations, disputeResolverId); // creates a offer with id 6

          await expect(
            bundleHandler.connect(operator).addOffersToBundle(bundle.id, [expectedNewOfferId])
          ).to.revertedWith(RevertReasons.INSUFFICIENT_TWIN_SUPPLY_TO_COVER_BUNDLE_OFFERS);
        });

        it("Offers quantity is unlimited but twins supply is not", async function () {
          const newOffer = offer.clone();
          newOffer.quantityAvailable = ethers.constants.MaxUint256.toString();
          let expectedNewOfferId = "6";

          await offerHandler.connect(operator).createOffer(newOffer, offerDates, offerDurations, disputeResolverId);

          await expect(
            bundleHandler.connect(operator).addOffersToBundle(bundle.id, [expectedNewOfferId])
          ).to.revertedWith(RevertReasons.INSUFFICIENT_TWIN_SUPPLY_TO_COVER_BUNDLE_OFFERS);
        });
      });
    });

    context("👉 removeOffersFromBundle()", async function () {
      beforeEach(async function () {
        bundle.offerIds = ["1", "2", "3", "4"];

        //Create a new Twin with supply enough to cover 4 offers
        twin.supplyAvailable = 4000;
        let expectedNewTwinId = "6";

        await twinHandler.connect(operator).createTwin(twin);

        // Create a bundle
        bundle.twinIds = [expectedNewTwinId];
        await bundleHandler.connect(operator).createBundle(bundle);

        // set the new fields
        offerIdsToRemove = ["1", "4"];
        bundle.offerIds = ["3", "2"]; // ["1","2","3","4"] -> ["4","2","3"] -> ["3","2"]

        bundleStruct = bundle.toStruct();
      });

      it("should emit a BundleUpdated event", async function () {
        // Remove offers from a bundle, testing for the event
        const tx = await bundleHandler.connect(operator).removeOffersFromBundle(bundle.id, offerIdsToRemove);
        const txReceipt = await tx.wait();

        const event = getEvent(txReceipt, bundleHandlerFacet_Factory, "BundleUpdated");

        const bundleInstance = Bundle.fromStruct(event.bundle);
        // Validate the instance
        expect(bundleInstance.isValid()).to.be.true;

        assert.equal(event.bundleId.toString(), bundle.id, "Bundle Id is incorrect");
        assert.equal(event.sellerId.toString(), bundle.sellerId, "Seller Id is incorrect");
        assert.equal(event.executedBy.toString(), operator.address, "Executed by is incorrect");
        assert.equal(bundleInstance.toString(), bundle.toString(), "Bundle struct is incorrect");
      });

      it("should remove offers from correct bundle", async function () {
        // Create a new bundle of id 2
        let expectedNewBundleId = "2";
        const newBundle = bundle.clone();
        newBundle.id = expectedNewBundleId;
        newBundle.offerIds = ["5"];
        //Twin must be unique to a bundle"
        newBundle.twinIds = ["1"];
        const tx = await bundleHandler.connect(operator).createBundle(newBundle); // creates new bundle of id 2
        const txReceipt = await tx.wait();
        const event = getEvent(txReceipt, bundleHandler, "BundleCreated");
        assert.equal(event.bundleId.toString(), expectedNewBundleId, "Bundle Id is not 2"); // verify that bundle id is 2

        let bundleIdToRemoveOffer = bundle.id; // Bundle in which we want we want to add new offer Ids.
        offerIdsToRemove = ["2"]; // The Offer id which we want to add.

        // Expect that the Bundle with id 1 has this offer.
        [, bundleStruct] = await bundleHandler.connect(rando).getBundle(bundleIdToRemoveOffer);
        let returnedBundle = Bundle.fromStruct(bundleStruct);
        expect(returnedBundle.offerIds.includes(offerIdsToRemove[0])).is.true;

        // Expect that the Bundle with id 2 does not have this offer.
        [, bundleStruct] = await bundleHandler.connect(rando).getBundle(newBundle.id);
        returnedBundle = Bundle.fromStruct(bundleStruct);
        expect(returnedBundle.offerIds.includes(offerIdsToRemove[0])).is.false;

        // Removing the offer from the bundle of id 1.
        await bundleHandler.connect(operator).removeOffersFromBundle(bundleIdToRemoveOffer, offerIdsToRemove);

        // Expect that the bundle with id 2 still does not have this offer.
        [, bundleStruct] = await bundleHandler.connect(rando).getBundle(newBundle.id);
        returnedBundle = Bundle.fromStruct(bundleStruct);
        expect(returnedBundle.offerIds.includes(offerIdsToRemove[0])).is.false;
      });

      it("should update state", async function () {
        // Remove offer from a bundle,
        await bundleHandler.connect(operator).removeOffersFromBundle(bundle.id, offerIdsToRemove);

        // Get the bundle as a struct
        [, bundleStruct] = await bundleHandler.connect(rando).getBundle(bundle.id);

        // Parse into entity
        const returnedBundle = Bundle.fromStruct(bundleStruct);

        // Returned values should  reflect the changes done with removeOffersFromBundle
        for ([key, value] of Object.entries(bundle)) {
          expect(JSON.stringify(returnedBundle[key]) === JSON.stringify(value)).is.true;
        }
      });

      context("💔 Revert Reasons", async function () {
        it("Bundle does not exist", async function () {
          // Set invalid id
          bundle.id = "444";

          // Attempt to remove offers from the bundle, expecting revert
          await expect(
            bundleHandler.connect(operator).removeOffersFromBundle(bundle.id, offerIdsToRemove)
          ).to.revertedWith(RevertReasons.NO_SUCH_BUNDLE);

          // Set invalid id
          bundle.id = "0";

          // Attempt to remove offers from bundle, expecting revert
          await expect(
            bundleHandler.connect(operator).removeOffersFromBundle(bundle.id, offerIdsToRemove)
          ).to.revertedWith(RevertReasons.NO_SUCH_BUNDLE);
        });

        it("Caller is not seller of a bundle", async function () {
          // Attempt to remove offers from the bundle, expecting revert
          await expect(
            bundleHandler.connect(rando).removeOffersFromBundle(bundle.id, offerIdsToRemove)
          ).to.revertedWith(RevertReasons.NOT_OPERATOR);
        });

        it("Offer is not a part of the bundle", async function () {
          // inexisting offer
          offerIdsToRemove = ["6"];

          // Attempt to remove offers from the bundle, expecting revert
          await expect(
            bundleHandler.connect(operator).removeOffersFromBundle(bundle.id, offerIdsToRemove)
          ).to.revertedWith(RevertReasons.OFFER_NOT_IN_BUNDLE);

          // create an offer and add it to another bundle
          await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId);
          bundle.offerIds = ["6"];

          // Twin must be unique to a bundle
          bundle.twinIds = ["1"];
          await bundleHandler.connect(operator).createBundle(bundle);

          // Attempt to remove offers from a bundle, expecting revert
          await expect(
            bundleHandler.connect(operator).removeOffersFromBundle(bundle.id, offerIdsToRemove)
          ).to.revertedWith(RevertReasons.OFFER_NOT_IN_BUNDLE);
        });

        it("Removing too many offers", async function () {
          // Try to remove the more than 100 offers
          offerIdsToRemove = [...Array(101).keys()];

          // Attempt to remove offers from the bundle, expecting revert
          await expect(
            bundleHandler.connect(operator).removeOffersFromBundle(bundle.id, offerIdsToRemove)
          ).to.revertedWith(RevertReasons.TOO_MANY_OFFERS);
        });

        it("Removing nothing", async function () {
          // Try to remove nothing
          offerIdsToRemove = [];

          // Attempt to remove offers from the bundle, expecting revert
          await expect(
            bundleHandler.connect(operator).removeOffersFromBundle(bundle.id, offerIdsToRemove)
          ).to.revertedWith(RevertReasons.NOTHING_UPDATED);
        });

        it("Exchange already exists for the offerId in bundle", async function () {
          // Deposit seller funds so the commit will succeed
          await fundsHandler
            .connect(operator)
            .depositFunds(seller.id, ethers.constants.AddressZero, sellerDeposit, { value: sellerDeposit });

          // Commit to an offer
          let offerIdToCommit = offerIdsToRemove[0];
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerIdToCommit, { value: price });

          // Attempt to remove offers from the bundle, expecting revert
          await expect(
            bundleHandler.connect(operator).removeOffersFromBundle(bundle.id, offerIdsToRemove)
          ).to.revertedWith(RevertReasons.EXCHANGE_FOR_OFFER_EXISTS);
        });
      });
    });

    context("👉 getBundleIdByOffer()", async function () {
      beforeEach(async function () {
        // Create a bundle
        await bundleHandler.connect(operator).createBundle(bundle);

        // Offer id that we want to test
        offerId = bundle.offerIds[0];
      });

      it("should return true for exists if bundle id is found", async function () {
        // Get the exists flag
        [exists] = await bundleHandler.connect(rando).getBundleIdByOffer(offerId);

        // Validate
        expect(exists).to.be.true;
      });

      it("should return false for exists if bundle id is not found", async function () {
        invalidOfferId = "666";

        // Get the exists flag
        [exists] = await bundleHandler.connect(rando).getBundleIdByOffer(invalidOfferId);

        // Validate
        expect(exists).to.be.false;
      });

      it("should return the bundle id if found", async function () {
        // Get the bundle id
        [, bundleId] = await bundleHandler.connect(rando).getBundleIdByOffer(offerId);

        // Validate
        assert.equal(bundleId.toString(), bundle.id, "Bundle Id is incorrect");
      });
    });

    context("👉 getBundleIdByTwin()", async function () {
      beforeEach(async function () {
        // Create a twin with id 6
        await bosonToken.connect(operator).approve(twinHandler.address, 1); // approving the twin handler
        await twinHandler.connect(operator).createTwin(twin);

        // Create a bundle
        await bundleHandler.connect(operator).createBundle(bundle);

        // Twin id that we want to test
        twinId = "6";
      });

      it("should return true for exists if bundle id is found", async function () {
        // Get the exists flag
        [exists] = await bundleHandler.connect(rando).getBundleIdByTwin(bundle.twinIds[0]);

        // Validate
        expect(exists).to.be.true;
      });

      it("should return false for exists if bundle id is not found", async function () {
        invalidTwinId = "666";

        // Get the exists flag
        [exists] = await bundleHandler.connect(rando).getBundleIdByTwin(invalidTwinId);

        // Validate
        expect(exists).to.be.false;
      });

      it("should return the bundle id if found", async function () {
        // Add Twin id to bundle
        twinIdsToAdd = [twinId];
        await bundleHandler.connect(operator).addTwinsToBundle(bundle.id, twinIdsToAdd);

        const expectedBundleId = bundle.id;

        // Get the bundle id
        [, bundleId] = await bundleHandler.connect(rando).getBundleIdByTwin(twinId);

        // Validate
        assert.equal(bundleId.toString(), expectedBundleId.toString(), "Bundle Ids are incorrect");
      });
    });

    context("👉 removeBundle()", async function () {
      beforeEach(async function () {
        // Create a bundle
        await bundleHandler.connect(operator).createBundle(bundle);
      });

      it("should emit a BundleDeleted event", async function () {
        // Expect bundle to be found.
        [exists] = await bundleHandler.connect(rando).getBundle(bundle.id);
        expect(exists).to.be.true;

        // Remove the bundle, testing for the event.
        await expect(bundleHandler.connect(operator).removeBundle(bundle.id))
          .to.emit(bundleHandler, "BundleDeleted")
          .withArgs(bundle.id, bundle.sellerId, operator.address);

        // Expect bundle to be not found.
        [exists] = await bundleHandler.connect(rando).getBundle(bundle.id);
        expect(exists).to.be.false;
      });

      it("should remove all mappings for the removed bundle", async function () {
        // Expect bundle to be found.
        [exists] = await bundleHandler.connect(rando).getBundle(bundle.id);
        expect(exists).to.be.true;

        // Expect bundleIdByOffer mapping to be found.
        [exists] = await bundleHandler.connect(rando).getBundleIdByOffer(bundle.offerIds[0]);
        expect(exists).to.be.true;

        // Expect the bundleIdByTwin mapping to be found.
        [exists] = await bundleHandler.connect(rando).getBundleIdByTwin(bundle.twinIds[0]);
        expect(exists).to.be.true;

        // Remove the bundle, testing for the event.
        await expect(bundleHandler.connect(operator).removeBundle(bundle.id))
          .to.emit(bundleHandler, "BundleDeleted")
          .withArgs(bundle.id, bundle.sellerId, operator.address);

        // Expect bundle to be not found.
        [exists] = await bundleHandler.connect(rando).getBundle(bundle.id);
        expect(exists).to.be.false;

        // Expect bundleIdByOffer mapping to be not found.
        [exists] = await bundleHandler.connect(rando).getBundleIdByOffer(bundle.offerIds[0]);
        expect(exists).to.be.false;

        // Expect the bundleIdByTwin mapping to be not found.
        [exists] = await bundleHandler.connect(rando).getBundleIdByTwin(bundle.twinIds[0]);
        expect(exists).to.be.false;
      });

      context("💔 Revert Reasons", async function () {
        it("Bundle does not exist", async function () {
          let nonExistentBundleId = "999";

          // Attempt to Remove a bundle, expecting revert
          await expect(bundleHandler.connect(operator).removeBundle(nonExistentBundleId)).to.revertedWith(
            RevertReasons.NO_SUCH_BUNDLE
          );
        });

        it("Caller is not the seller", async function () {
          // Attempt to Remove a bundle, expecting revert
          await expect(bundleHandler.connect(rando).removeBundle(bundle.id)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );
        });

        it("Exchange exists for bundled offer", async function () {
          // Deposit seller funds so the commit will succeed
          await fundsHandler
            .connect(operator)
            .depositFunds(seller.id, ethers.constants.AddressZero, sellerDeposit, { value: sellerDeposit });

          // Commit to an offer
          let offerIdToCommit = bundle.offerIds[0];
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerIdToCommit, { value: price });

          // Attempt to Remove a bundle, expecting revert
          await expect(bundleHandler.connect(operator).removeBundle(bundle.id)).to.revertedWith(
            RevertReasons.EXCHANGE_FOR_BUNDLED_OFFERS_EXISTS
          );
        });
      });
    });
  });
});
