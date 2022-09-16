const hre = require("hardhat");
const ethers = hre.ethers;
const { expect, assert } = require("chai");
const { gasLimit } = require("../../environments");

const Role = require("../../scripts/domain/Role");
const Bundle = require("../../scripts/domain/Bundle");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { getEvent } = require("../../scripts/util/test-utils.js");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
const {
  mockOffer,
  mockTwin,
  mockDisputeResolver,
  mockSeller,
  mockVoucherInitValues,
  mockAuthToken,
  accountId,
} = require("../utils/mock");
const { oneWeek, oneMonth } = require("../utils/constants");

/**
 *  Test the Boson Bundle Handler interface
 */
describe("IBosonBundleHandler", function () {
  // Common vars
  let InterfaceIds;
  let deployer,
    pauser,
    rando,
    operator,
    admin,
    clerk,
    treasury,
    buyer,
    operatorDR,
    adminDR,
    clerkDR,
    treasuryDR,
    protocolTreasury;
  let erc165,
    protocolDiamond,
    accessController,
    twinHandler,
    accountHandler,
    bundleHandler,
    exchangeHandler,
    fundsHandler,
    pauseHandler,
    bosonToken,
    twin,
    support,
    sellerId,
    key,
    value,
    invalidTwinId;
  let offerHandler, bundleHandlerFacet_Factory;
  let seller;
  let bundleStruct;
  let bundle, bundleId, offerIds, twinId, twinIds, nextBundleId, invalidBundleId, bundleInstance;
  let offer, exists, expected;
  let offerId, invalidOfferId, price, sellerDeposit;
  let offerDates, offerDurations;
  let protocolFeePercentage, protocolFeeFlatBoson, buyerEscalationDepositPercentage;
  let disputeResolver, disputeResolverFees, disputeResolverId;
  let voucherInitValues;
  let emptyAuthToken;
  let agentId;

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
    [
      deployer,
      pauser,
      operator,
      admin,
      clerk,
      treasury,
      rando,
      buyer,
      operatorDR,
      adminDR,
      clerkDR,
      treasuryDR,
      protocolTreasury,
    ] = await ethers.getSigners();

    // Deploy the Protocol Diamond
    [protocolDiamond, , , , accessController] = await deployProtocolDiamond();

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Grant PROTOCOL role to ProtocolDiamond address and renounces admin
    await accessController.grantRole(Role.PROTOCOL, protocolDiamond.address);

    // Temporarily grant PAUSER role to pauser account
    await accessController.grantRole(Role.PAUSER, pauser.address);

    // Cut the protocol handler facets into the Diamond
    await deployProtocolHandlerFacets(protocolDiamond, [
      "SellerHandlerFacet",
      "DisputeResolverHandlerFacet",
      "TwinHandlerFacet",
      "OfferHandlerFacet",
      "BundleHandlerFacet",
      "ExchangeHandlerFacet",
      "FundsHandlerFacet",
      "PauseHandlerFacet",
    ]);

    // Deploy the Protocol client implementation/proxy pairs (currently just the Boson Voucher)
    const protocolClientArgs = [protocolDiamond.address];
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
        treasury: protocolTreasury.address,
        token: bosonToken.address,
        voucherBeacon: beacon.address,
        beaconProxy: proxy.address,
      },
      // Protocol limits
      {
        maxExchangesPerBatch: 100,
        maxOffersPerGroup: 100,
        maxTwinsPerBundle: 100,
        maxOffersPerBundle: 100,
        maxOffersPerBatch: 100,
        maxTokensPerWithdrawal: 100,
        maxFeesPerDisputeResolver: 100,
        maxEscalationResponsePeriod: oneMonth,
        maxDisputesPerBatch: 100,
        maxAllowedSellers: 100,
        maxTotalOfferFeePercentage: 4000, //40%
        maxRoyaltyPecentage: 1000, //10%
        maxResolutionPeriod: oneMonth,
        minFulfillmentPeriod: oneWeek,
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
    erc165 = await ethers.getContractAt("ERC165Facet", protocolDiamond.address);
    // Cast Diamond to IBosonAccountHandler. Use this interface to call all individual account handlers
    accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);
    // Cast Diamond to IBosonTwinHandler
    twinHandler = await ethers.getContractAt("IBosonTwinHandler", protocolDiamond.address);
    // Cast Diamond to IBosonBundleHandler
    bundleHandler = await ethers.getContractAt("IBosonBundleHandler", protocolDiamond.address);
    // Cast Diamond to IBosonOfferHandler
    offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);
    // Cast Diamond to IBosonExchangeHandler
    exchangeHandler = await ethers.getContractAt("IBosonExchangeHandler", protocolDiamond.address);
    // Cast Diamond to IBosonFundsHandler
    fundsHandler = await ethers.getContractAt("IBosonFundsHandler", protocolDiamond.address);
    // Cast Diamond to IBosonPauseHandler
    pauseHandler = await ethers.getContractAt("IBosonPauseHandler", protocolDiamond.address);

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
        expect(support, "IBosonBundleHandler interface not supported").is.true;
      });
    });
  });

  // All supported methods
  context("📋 Bundler Handler Methods", async function () {
    beforeEach(async function () {
      // create a seller
      // Required constructor params
      agentId = "0"; // agent id is optional while creating an offer

      // Create a valid seller, then set fields in tests directly
      seller = mockSeller(operator.address, admin.address, clerk.address, treasury.address);
      expect(seller.isValid()).is.true;

      // VoucherInitValues
      voucherInitValues = mockVoucherInitValues();
      expect(voucherInitValues.isValid()).is.true;

      // AuthTokens
      emptyAuthToken = mockAuthToken();
      expect(emptyAuthToken.isValid()).is.true;

      await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

      // Create a valid dispute resolver
      disputeResolver = mockDisputeResolver(
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
      await accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id);

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
        await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);
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

    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
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

        //Get seller id by operator which created the bundle
        const [, sellerStruct] = await accountHandler.connect(rando).getSellerByAddress(operator.address);
        let expectedSellerId = sellerStruct.id;

        assert.equal(event.bundleId.toString(), nextBundleId, "Bundle Id is incorrect");
        assert.equal(event.sellerId.toString(), expectedSellerId.toString(), "Seller Id is incorrect");
        assert.equal(event.executedBy.toString(), operator.address, "Executed by is incorrect");
        assert.equal(bundleInstance.toStruct().toString(), bundleStruct.toString(), "Bundle struct is incorrect");
      });

      it("If sum of offers' quantities is more than maxUint256, total quantity is maxUint256", async function () {
        // create two offers with close to unlimited supply
        const newOffer = offer.clone();
        newOffer.quantityAvailable = ethers.constants.MaxUint256.div(10).mul(9).toString();
        const newOffer2 = newOffer.clone();
        const newOfferId = "6";
        const newOfferId2 = "7";

        await offerHandler
          .connect(operator)
          .createOffer(newOffer, offerDates, offerDurations, disputeResolverId, agentId);

        await offerHandler
          .connect(operator)
          .createOffer(newOffer2, offerDates, offerDurations, disputeResolverId, agentId);

        // create a twin with almost unlimited supply
        twin = mockTwin(bosonToken.address);
        twin.supplyAvailable = ethers.constants.MaxUint256.sub(1).toString();
        expect(twin.isValid()).is.true;

        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(operator).approve(twinHandler.address, twin.supplyAvailable); // approving the twin handler

        // Create a twin with id 6
        await twinHandler.connect(operator).createTwin(twin);

        bundle.offerIds = [...bundle.offerIds, newOfferId, newOfferId2];
        bundle.twinIds = ["6"];
        await expect(bundleHandler.connect(operator).createBundle(bundle)).to.revertedWith(
          RevertReasons.INSUFFICIENT_TWIN_SUPPLY_TO_COVER_BUNDLE_OFFERS
        );

        // create a twin with unlimited supply
        twin = mockTwin(bosonToken.address);
        twin.supplyAvailable = ethers.constants.MaxUint256.toString();
        expect(twin.isValid()).is.true;

        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(operator).approve(twinHandler.address, twin.supplyAvailable); // approving the twin handler

        // Create a twin with id 7
        await twinHandler.connect(operator).createTwin(twin);

        bundle.twinIds = ["7"];
        await expect(bundleHandler.connect(operator).createBundle(bundle)).to.not.reverted;
      });

      context("💔 Revert Reasons", async function () {
        it("The bundles region of protocol is paused", async function () {
          // Pause the bundles region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Bundles]);

          // Attempt to create a bundle, expecting revert
          await expect(bundleHandler.connect(operator).createBundle(bundle)).to.revertedWith(
            RevertReasons.REGION_PAUSED
          );
        });

        it("Caller not operator of any seller", async function () {
          // Attempt to Create a bundle, expecting revert
          await expect(bundleHandler.connect(rando).createBundle(bundle)).to.revertedWith(RevertReasons.NOT_OPERATOR);
        });

        it("Bundle has no offers", async function () {
          bundle.offerIds = [];

          // Attempt to Create a bundle, expecting revert
          await expect(bundleHandler.connect(operator).createBundle(bundle)).to.revertedWith(
            RevertReasons.BUNDLE_REQUIRES_AT_LEAST_ONE_TWIN_AND_ONE_OFFER
          );
        });

        it("Bundle has no twins", async function () {
          bundle.twinIds = [];

          // Attempt to Create a bundle, expecting revert
          await expect(bundleHandler.connect(operator).createBundle(bundle)).to.revertedWith(
            RevertReasons.BUNDLE_REQUIRES_AT_LEAST_ONE_TWIN_AND_ONE_OFFER
          );
        });

        it("Bundle has neither the twins nor the offers", async function () {
          bundle.twinIds = [];
          bundle.offerIds = [];

          // Attempt to Create a bundle, expecting revert
          await expect(bundleHandler.connect(operator).createBundle(bundle)).to.revertedWith(
            RevertReasons.BUNDLE_REQUIRES_AT_LEAST_ONE_TWIN_AND_ONE_OFFER
          );
        });

        it("Caller is not the seller of all offers", async function () {
          // create another seller and an offer
          let expectedNewOfferId = "6";
          seller = mockSeller(rando.address, rando.address, rando.address, rando.address);

          await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);
          const tx = await offerHandler
            .connect(rando)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId); // creates an offer with id 6
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
          seller = mockSeller(rando.address, rando.address, rando.address, rando.address);

          await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);
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
          newTwin.amount = newTwin.supplyAvailable = "1"; // twin amount can't be greater than supply available.
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

          await offerHandler
            .connect(operator)
            .createOffer(newOffer, offerDates, offerDurations, disputeResolverId, agentId);

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

        // increment nextBundleId
        nextBundleId++;
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

        // increment nextBundleId
        nextBundleId++;
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
        twinId = "3";
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
        const expectedBundleId = bundle.id;

        // Get the bundle id
        [, bundleId] = await bundleHandler.connect(rando).getBundleIdByTwin(twinId);

        // Validate
        assert.equal(bundleId.toString(), expectedBundleId.toString(), "Bundle Ids are incorrect");
      });
    });
  });
});
