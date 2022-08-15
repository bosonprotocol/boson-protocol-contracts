const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");
const { gasLimit } = require("../../environments");

const Role = require("../../scripts/domain/Role");
const Offer = require("../../scripts/domain/Offer");
const OfferDates = require("../../scripts/domain/OfferDates");
const OfferDurations = require("../../scripts/domain/OfferDurations");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const DisputeResolutionTerms = require("../../scripts/domain/DisputeResolutionTerms");
const OfferFees = require("../../scripts/domain/OfferFees");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const { applyPercentage } = require("../../scripts/util/test-utils.js");
const { oneWeek, oneMonth } = require("../utils/constants");
const {
  mockOffer,
  mockDisputeResolver,
  mockAgent,
  mockSeller,
  mockVoucherInitValues,
  mockAuthToken,
} = require("../utils/mock");
/**
 *  Test the Boson Offer Handler interface
 */
describe("IBosonOfferHandler", function () {
  // Common vars
  let InterfaceIds;
  let deployer,
    pauser,
    rando,
    operator,
    admin,
    clerk,
    treasury,
    operatorDR,
    adminDR,
    clerkDR,
    treasuryDR,
    other,
    protocolAdmin;
  let erc165,
    protocolDiamond,
    accessController,
    accountHandler,
    offerHandler,
    configHandler,
    pauseHandler,
    bosonToken,
    offerStruct,
    key,
    value;
  let offer, nextOfferId, invalidOfferId, support, expected, exists, nextAccountId;
  let seller;
  let id, sellerId, price, voided;
  let validFrom,
    validUntil,
    voucherRedeemableFrom,
    voucherRedeemableUntil,
    offerDates,
    offerDatesStruct,
    offerDatesStructs,
    offerDatesList,
    offerFees,
    offerFeesStruct,
    offerFeesList,
    offerFeesStructs;
  let fulfillmentPeriod,
    voucherValid,
    resolutionPeriod,
    offerDurations,
    offerDurationsStruct,
    offerDurationsStructs,
    offerDurationsList,
    disputeResolverIds;
  let protocolFeePercentage, protocolFeeFlatBoson, buyerEscalationDepositPercentage, protocolFee, agentFee;
  let disputeResolver,
    disputeResolverFees,
    disputeResolverId,
    disputeResolutionTerms,
    disputeResolutionTermsStruct,
    disputeResolutionTermsStructs,
    disputeResolutionTermsList;
  let DRFeeNative, DRFeeToken;
  let voucherInitValues;
  let emptyAuthToken;
  let agent, agentId, nonZeroAgentIds;
  let sellerAllowList, allowedSellersToAdd;

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
      rando,
      operatorDR,
      adminDR,
      clerkDR,
      treasuryDR,
      other,
      protocolAdmin,
    ] = await ethers.getSigners();

    // Deploy the Protocol Diamond
    [protocolDiamond, , , accessController] = await deployProtocolDiamond();

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Grant PROTOCOL role to ProtocolDiamond address and renounces admin
    await accessController.grantRole(Role.PROTOCOL, protocolDiamond.address);

    //Grant ADMIN role to and address that can call restricted functions.
    //This ADMIN role is a protocol-level role. It is not the same an admin address for an account type
    await accessController.grantRole(Role.ADMIN, protocolAdmin.address);

    // Temporarily grant PAUSER role to pauser account
    await accessController.grantRole(Role.PAUSER, pauser.address);

    // Cut the protocol handler facets into the Diamond
    await deployProtocolHandlerFacets(protocolDiamond, [
      "SellerHandlerFacet",
      "AgentHandlerFacet",
      "DisputeResolverHandlerFacet",
      "OfferHandlerFacet",
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

    // Add config Handler, so offer id starts at 1
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
      },
      // Protocol fees
      {
        percentage: protocolFeePercentage,
        flatBoson: protocolFeeFlatBoson,
      },
      buyerEscalationDepositPercentage,
    ];

    await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);

    // Cast Diamond to IERC165
    erc165 = await ethers.getContractAt("IERC165", protocolDiamond.address);

    // Cast Diamond to IBosonAccountHandler. Use this interface to call all individual account handlers
    accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);

    // Cast Diamond to IBosonOfferHandler
    offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);

    //Cast Diamond to IBosonConfigHandler
    configHandler = await ethers.getContractAt("IBosonConfigHandler", protocolDiamond.address);

    //Cast Diamond to IBosonPauseHandler
    pauseHandler = await ethers.getContractAt("IBosonPauseHandler", protocolDiamond.address);
  });

  // Interface support (ERC-156 provided by ProtocolDiamond, others by deployed facets)
  context("📋 Interfaces", async function () {
    context("👉 supportsInterface()", async function () {
      it("should indicate support for IBosonOfferHandler interface", async function () {
        // Current interfaceId for IOfferHandler
        support = await erc165.supportsInterface(InterfaceIds.IBosonOfferHandler);

        // Test
        expect(support, "IBosonOfferHandler interface not supported").is.true;
      });
    });
  });

  // All supported methods - single offer
  context("📋 Offer Handler Methods", async function () {
    beforeEach(async function () {
      // create a seller
      // Required constructor params
      id = nextAccountId = "1"; // argument sent to contract for createSeller will be ignored

      // Create a valid seller, then set fields in tests directly
      seller = mockSeller(operator.address, admin.address, clerk.address, treasury.address);
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
        operatorDR.address,
        adminDR.address,
        clerkDR.address,
        treasuryDR.address,
        false
      );
      expect(disputeResolver.isValid()).is.true;

      //Create DisputeResolverFee array so offer creation will succeed
      DRFeeNative = "100";
      DRFeeToken = "200";
      disputeResolverFees = [
        new DisputeResolverFee(ethers.constants.AddressZero, "Native", DRFeeNative),
        new DisputeResolverFee(bosonToken.address, "Boson", DRFeeToken),
      ];

      // Make empty seller list, so every seller is allowed
      sellerAllowList = [];

      // Register and activate the dispute resolver
      await accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
      await accountHandler.connect(deployer).activateDisputeResolver(++nextAccountId);

      // The first offer id
      nextOfferId = "1";
      invalidOfferId = "666";
      sellerId = 1;

      // Mock offer
      ({ offer, offerDates, offerDurations, disputeResolverId, offerFees } = await mockOffer());

      // Check if domais are valid
      expect(offer.isValid()).is.true;
      expect(offerDates.isValid()).is.true;
      expect(offerDurations.isValid()).is.true;

      // Set domains transformed into struct
      offerStruct = offer.toStruct();
      offerDatesStruct = offerDates.toStruct();
      offerDurationsStruct = offerDurations.toStruct();

      // Set used variables
      price = offer.price;

      offerFeesStruct = offerFees.toStruct();

      // Set despute resolution terms
      disputeResolutionTerms = new DisputeResolutionTerms(
        disputeResolverId,
        disputeResolver.escalationResponsePeriod,
        DRFeeNative,
        applyPercentage(DRFeeNative, buyerEscalationDepositPercentage)
      );
      disputeResolutionTermsStruct = disputeResolutionTerms.toStruct();

      // Set agent id as zero as it is optional for createOffer().
      agentId = "0";
    });

    context("👉 createOffer()", async function () {
      it("should emit an OfferCreated event", async function () {
        // Create an offer, testing for the event
        await expect(
          offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
        )
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            offer.sellerId,
            offerStruct,
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );
      });

      it("should update state", async function () {
        // Create an offer
        await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

        // Get the offer as a struct
        [, offerStruct, offerDatesStruct, offerDurationsStruct, disputeResolutionTermsStruct, offerFeesStruct] =
          await offerHandler.connect(rando).getOffer(offer.id);

        // Parse into entities
        let returnedOffer = Offer.fromStruct(offerStruct);
        let returnedOfferDates = OfferDates.fromStruct(offerDatesStruct);
        let returnedOfferDurations = OfferDurations.fromStruct(offerDurationsStruct);
        let returnedDisputeResolutionTermsStruct = DisputeResolutionTerms.fromStruct(disputeResolutionTermsStruct);
        let returnedOfferFeesStruct = OfferFees.fromStruct(offerFeesStruct);

        // Returned values should match the input in createOffer
        for ([key, value] of Object.entries(offer)) {
          expect(JSON.stringify(returnedOffer[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDates)) {
          expect(JSON.stringify(returnedOfferDates[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDurations)) {
          expect(JSON.stringify(returnedOfferDurations[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(disputeResolutionTerms)) {
          expect(JSON.stringify(returnedDisputeResolutionTermsStruct[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerFees)) {
          expect(JSON.stringify(returnedOfferFeesStruct[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should ignore any provided id and assign the next available", async function () {
        offer.id = "444";

        // Create an offer, testing for the event
        await expect(
          offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
        )
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            offer.sellerId,
            offerStruct,
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );

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
        await expect(
          offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
        )
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            sellerId,
            offerStruct,
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );
      });

      it("after the protocol fee changes, new offers should have the new fee", async function () {
        // Cast Diamond to IBosonConfigHandler
        const configHandler = await ethers.getContractAt("IBosonConfigHandler", protocolDiamond.address);

        // set the new procol fee
        protocolFeePercentage = "300"; // 3%
        await configHandler.connect(deployer).setProtocolFeePercentage(protocolFeePercentage);

        offer.id = await offerHandler.getNextOfferId();
        protocolFee = applyPercentage(price, protocolFeePercentage);
        offerFees.protocolFee = protocolFee;
        offerFeesStruct = offerFees.toStruct();

        // Create a new offer
        await expect(
          offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
        )
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            offer.sellerId,
            offer.toStruct(),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );
      });

      it("If exchange token is $BOSON, fee should be flat boson fee", async function () {
        // Prepare an offer with $BOSON as exchange token
        offer.exchangeToken = bosonToken.address;
        disputeResolutionTerms = new DisputeResolutionTerms(
          disputeResolverId,
          disputeResolver.escalationResponsePeriod,
          DRFeeToken,
          applyPercentage(DRFeeToken, buyerEscalationDepositPercentage)
        );
        offerFees.protocolFee = protocolFeeFlatBoson;
        offerFeesStruct = offerFees.toStruct();

        // Create a new offer
        await expect(
          offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
        )
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            offer.sellerId,
            offer.toStruct(),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTerms.toStruct(),
            offerFeesStruct,
            agentId,
            operator.address
          );
      });

      it("For absolute zero offers, dispute resolver can be unspecified", async function () {
        // Prepare an absolute zero offer
        offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = offerFees.protocolFee = offerFees.agentFee = "0";
        disputeResolverId = "0";
        disputeResolutionTermsStruct = new DisputeResolutionTerms("0", "0", "0", "0").toStruct();
        offerFeesStruct = offerFees.toStruct();

        // Create a new offer
        await expect(
          offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
        )
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            offer.sellerId,
            offer.toStruct(),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );
      });

      it("Should allow creation of an offer with unlimited supply", async function () {
        // Prepare an absolute zero offer
        offer.quantityAvailable = ethers.constants.MaxUint256.toString();

        // Create a new offer
        await expect(
          offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
        )
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            offer.sellerId,
            offer.toStruct(),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );
      });

      it("Should use the correct dispute resolver fee", async function () {
        // Create an offer in native currency
        await expect(
          offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
        )
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            offer.id,
            sellerId,
            offerStruct,
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );

        // create another offer, now with bosonToken as exchange token
        offer.exchangeToken = bosonToken.address;
        offer.id = "2";
        disputeResolutionTermsStruct = new DisputeResolutionTerms(
          disputeResolverId,
          disputeResolver.escalationResponsePeriod,
          DRFeeToken,
          applyPercentage(DRFeeToken, buyerEscalationDepositPercentage)
        ).toStruct();
        offerFees.protocolFee = protocolFeeFlatBoson;
        offerFeesStruct = offerFees.toStruct();

        // Create an offer in boson token
        await expect(
          offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
        )
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            offer.id,
            sellerId,
            offer.toStruct(),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );
      });

      it("Should allow creation of an offer if DR has a sellerAllowList and seller is on it", async function () {
        // add seller to allow list
        allowedSellersToAdd = ["1"]; // existing seller is "1", DR is "2", new seller is "3"
        await accountHandler.connect(adminDR).addSellersToAllowList(disputeResolverId, allowedSellersToAdd);

        // Create an offer testing for the event
        await expect(
          offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
        ).to.emit(offerHandler, "OfferCreated");
      });

      context("💔 Revert Reasons", async function () {
        it("The offers region of protocol is paused", async function () {
          // Pause the offers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Offers]);

          // Attempt to create an offer expecting revert
          await expect(
            offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("Caller not operator of any seller", async function () {
          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(rando).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
          ).to.revertedWith(RevertReasons.NOT_OPERATOR);
        });

        it("Valid from date is greater than valid until date", async function () {
          // Reverse the from and until dates
          offerDates.validFrom = ethers.BigNumber.from(Date.now() + oneMonth * 6).toString(); // 6 months from now
          offerDates.validUntil = ethers.BigNumber.from(Date.now()).toString(); // now

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Valid until date is not in the future", async function () {
          // Set until date in the past
          offerDates.validUntil = ethers.BigNumber.from(offerDates.validFrom - (oneMonth / 1000) * 6).toString(); // 6 months ago

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Buyer cancel penalty is greater than price", async function () {
          // Set buyer cancel penalty higher than offer price
          offer.buyerCancelPenalty = ethers.BigNumber.from(offer.price).add("10").toString();

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
          ).to.revertedWith(RevertReasons.OFFER_PENALTY_INVALID);
        });

        it("Offer cannot be voided at the time of the creation", async function () {
          // Set voided flag to true
          offer.voided = true;

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
          ).to.revertedWith(RevertReasons.OFFER_MUST_BE_ACTIVE);
        });

        it("Both voucher expiration date and voucher expiraton period are defined", async function () {
          // Set both voucherRedeemableUntil and voucherValid
          offerDates.voucherRedeemableUntil = (Number(offerDates.voucherRedeemableFrom) + oneMonth).toString();
          offerDurations.voucherValid = oneMonth.toString();

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
          ).to.revertedWith(RevertReasons.AMBIGUOUS_VOUCHER_EXPIRY);
        });

        it("Neither of voucher expiration date and voucher expiraton period are defined", async function () {
          // Set both voucherRedeemableUntil and voucherValid to "0"
          offerDates.voucherRedeemableUntil = "0";
          offerDurations.voucherValid = "0";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
          ).to.revertedWith(RevertReasons.AMBIGUOUS_VOUCHER_EXPIRY);
        });

        it("Voucher redeemable period is fixed, but it ends before it starts", async function () {
          // Set both voucherRedeemableUntil that is less than voucherRedeemableFrom
          offerDates.voucherRedeemableUntil = (Number(offerDates.voucherRedeemableFrom) - 10).toString();
          offerDurations.voucherValid = "0";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
          ).to.revertedWith(RevertReasons.REDEMPTION_PERIOD_INVALID);
        });

        it("Voucher redeemable period is fixed, but it ends before offer expires", async function () {
          // Set both voucherRedeemableUntil that is more than voucherRedeemableFrom but less than validUntil
          offerDates.voucherRedeemableFrom = "0";
          offerDates.voucherRedeemableUntil = (Number(offerDates.validUntil) - 10).toString();
          offerDurations.voucherValid = "0";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
          ).to.revertedWith(RevertReasons.REDEMPTION_PERIOD_INVALID);
        });

        it("Fulfillment period is set to zero", async function () {
          // Set fulfilment period to 0
          offerDurations.fulfillmentPeriod = "0";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
          ).to.revertedWith(RevertReasons.INVALID_FULFILLMENT_PERIOD);
        });

        it("Resolution period is set to zero", async function () {
          // Set dispute duration period to 0
          offerDurations.resolutionPeriod = "0";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_DURATION);
        });

        it("Available quantity is set to zero", async function () {
          // Set available quantity to 0
          offer.quantityAvailable = "0";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
          ).to.revertedWith(RevertReasons.INVALID_QUANTITY_AVAILABLE);
        });

        it("Dispute resolver wallet is not registered", async function () {
          // Set some address that is not registered as a dispute resolver
          disputeResolverId = "16";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        it("Dispute resolver is not active", async function () {
          // create another dispute resolver, but don't activate it
          disputeResolver = mockDisputeResolver(rando.address, rando.address, rando.address, rando.address, false);
          await accountHandler
            .connect(rando)
            .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

          // Set some address that is not registered as a dispute resolver
          disputeResolverId = ++nextAccountId;

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);

          // after activation it should be possible to create the offer
          await accountHandler.connect(deployer).activateDisputeResolver(nextAccountId);

          // Create an offer, test event
          await expect(
            offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
          ).to.emit(offerHandler, "OfferCreated");
        });

        it("For absolute zero offer, specified dispute resolver is not registered", async function () {
          // Prepare an absolute zero offer, but specify dispute resolver
          offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = "0";
          disputeResolverId = "16";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        it("For absolute zero offer, specified dispute resolver is not active", async function () {
          // create another dispute resolver, but don't activate it
          disputeResolver = mockDisputeResolver(rando.address, rando.address, rando.address, rando.address, false);
          await accountHandler
            .connect(rando)
            .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

          // Prepare an absolute zero offer, but specify dispute resolver
          offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = "0";
          disputeResolverId = ++nextAccountId;

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);

          // after activation it should be possible to create the offer
          await accountHandler.connect(deployer).activateDisputeResolver(nextAccountId);

          // Create an offer, test event
          await expect(
            offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
          ).to.emit(offerHandler, "OfferCreated");
        });

        it("Seller is not on dispute resolver's seller allow list", async function () {
          // Create new seller so sellerAllowList can have an entry
          seller = mockSeller(rando.address, rando.address, rando.address, rando.address);

          await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);

          allowedSellersToAdd = ["3"]; // DR is "1", existing seller is "2", new seller is "3"
          await accountHandler.connect(adminDR).addSellersToAllowList(disputeResolverId, allowedSellersToAdd);

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
          ).to.revertedWith(RevertReasons.SELLER_NOT_APPROVED);
        });

        it("Dispute resolver does not accept fees in the exchange token", async function () {
          // Set some address that is not part of dispute resolver fees
          offer.exchangeToken = rando.address;

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
          ).to.revertedWith(RevertReasons.DR_UNSUPPORTED_FEE);
        });
      });

      context("When offer has non zero agent id", async function () {
        beforeEach(async function () {
          // Create a valid agent, then set fields in tests directly
          agent = mockAgent(other.address);
          agent.id = "3";
          agentId = agent.id;
          expect(agent.isValid()).is.true;

          // Create an agent
          await accountHandler.connect(rando).createAgent(agent);

          agentFee = ethers.BigNumber.from(offer.price).mul(agent.feePercentage).div("10000").toString();
          offerFees.agentFee = agentFee;
          offerFeesStruct = offerFees.toStruct();
        });

        it("should emit an OfferCreated event with updated agent id", async function () {
          // Create an offer, testing for the event
          await expect(
            offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
          )
            .to.emit(offerHandler, "OfferCreated")
            .withArgs(
              nextOfferId,
              offer.sellerId,
              offerStruct,
              offerDatesStruct,
              offerDurationsStruct,
              disputeResolutionTermsStruct,
              offerFeesStruct,
              agentId,
              operator.address
            );
        });

        it("after the agent fee changes, new offers should have the new agent fee", async function () {
          agent.feePercentage = "1000"; // 10%
          await accountHandler.connect(other).updateAgent(agent);

          offer.id = await offerHandler.getNextOfferId();
          protocolFee = applyPercentage(price, protocolFeePercentage);
          offerFees.protocolFee = protocolFee;

          // Calculate the new agent fee amount.
          let newOfferAgentFee = ethers.BigNumber.from(offer.price).mul(agent.feePercentage).div("10000").toString();
          offerFees.agentFee = newOfferAgentFee;
          offerFeesStruct = offerFees.toStruct();

          // Create a new offer
          await expect(
            offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
          )
            .to.emit(offerHandler, "OfferCreated")
            .withArgs(
              nextOfferId,
              offer.sellerId,
              offer.toStruct(),
              offerDatesStruct,
              offerDurationsStruct,
              disputeResolutionTermsStruct,
              offerFeesStruct,
              agentId,
              operator.address
            );

          //Check offer agent fee for New offer.
          [, , , , , offerFeesStruct] = await offerHandler.getOffer(offer.id);
          expect(offerFeesStruct.agentFee.toString()).is.equal(newOfferAgentFee);
        });

        it("after the agent fee changes, old offers should have the same agent fee", async function () {
          // Creating 1st offer
          let oldOfferId = await offerHandler.getNextOfferId();

          // Calculate the new agent fee amount.
          let oldOfferAgentFee = ethers.BigNumber.from(offer.price).mul(agent.feePercentage).div("10000").toString();

          // Create a new offer
          await offerHandler
            .connect(operator)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

          // change agent fee percentage and create a new offer
          agent.feePercentage = "1000"; // 10%
          await accountHandler.connect(other).updateAgent(agent);

          // Creating 2nd offer
          // Calculate the new agent fee amount.
          let newOfferAgentFee = ethers.BigNumber.from(offer.price).mul(agent.feePercentage).div("10000").toString();

          let newOfferId = await offerHandler.getNextOfferId();

          // Create a new offer
          await offerHandler
            .connect(operator)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

          //Check offer agent fee for New offer.
          [, , , , , offerFeesStruct] = await offerHandler.getOffer(newOfferId);
          expect(offerFeesStruct.agentFee.toString()).is.equal(newOfferAgentFee);

          //Check offer agent fee for old offer.
          [, , , , , offerFeesStruct] = await offerHandler.getOffer(oldOfferId);
          expect(offerFeesStruct.agentFee.toString()).is.equal(oldOfferAgentFee);
        });

        context("💔 Revert Reasons", async function () {
          it("Agent does not exist", async function () {
            // Set an agent id that does not exist
            let agentId = "16";

            // Attempt to Create an offer, expecting revert
            await expect(
              offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId)
            ).to.revertedWith(RevertReasons.NO_SUCH_AGENT);
          });

          it("Sum of Agent fee amount and protocol fee amount should be <= than the offer fee limit", async function () {
            // Create a valid agent, then set fields in tests directly
            agent = mockAgent(operator.address);
            agent.id = "4";
            agent.feePercentage = "3000"; //30%
            expect(agent.isValid()).is.true;

            // Create an agent
            await accountHandler.connect(rando).createAgent(agent);

            //Change protocol fee after creating agent
            await configHandler.connect(protocolAdmin).setProtocolFeePercentage("1100"); //11%

            // Attempt to Create an offer, expecting revert
            await expect(
              offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agent.id)
            ).to.revertedWith(RevertReasons.AGENT_FEE_AMOUNT_TOO_HIGH);
          });
        });
      });
    });

    context("👉 voidOffer()", async function () {
      beforeEach(async function () {
        // Create an offer
        await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

        // id of the current offer and increment nextOfferId
        id = nextOfferId++;
      });

      it("should emit an OfferVoided event", async function () {
        // call getOffer with offerId to check the seller id in the event
        [, offerStruct] = await offerHandler.getOffer(id);

        // Void the offer, testing for the event
        await expect(offerHandler.connect(operator).voidOffer(id))
          .to.emit(offerHandler, "OfferVoided")
          .withArgs(id, offerStruct.sellerId, operator.address);
      });

      it("should update state", async function () {
        // Voided field should be initially false
        [, offerStruct] = await offerHandler.getOffer(id);
        expect(offerStruct.voided).is.false;

        // Get the voided status
        [, voided] = await offerHandler.isOfferVoided(id);
        expect(voided).to.be.false;

        // Void the offer
        await offerHandler.connect(operator).voidOffer(id);

        // Voided field should be updated
        [, offerStruct] = await offerHandler.getOffer(id);
        expect(offerStruct.voided).is.true;

        // Get the voided status
        [, voided] = await offerHandler.isOfferVoided(id);
        expect(voided).to.be.true;
      });

      context("💔 Revert Reasons", async function () {
        it("The offers region of protocol is paused", async function () {
          // Pause the offers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Offers]);

          // Attempt to void an offer expecting revert
          await expect(offerHandler.connect(operator).voidOffer(id)).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("Offer does not exist", async function () {
          // Set invalid id
          id = "444";

          // Attempt to void the offer, expecting revert
          await expect(offerHandler.connect(operator).voidOffer(id)).to.revertedWith(RevertReasons.NO_SUCH_OFFER);

          // Set invalid id
          id = "0";

          // Attempt to void the offer, expecting revert
          await expect(offerHandler.connect(operator).voidOffer(id)).to.revertedWith(RevertReasons.NO_SUCH_OFFER);
        });

        it("Caller is not seller", async function () {
          // caller is not the operator of any seller
          // Attempt to update the offer, expecting revert
          await expect(offerHandler.connect(rando).voidOffer(id)).to.revertedWith(RevertReasons.NOT_OPERATOR);

          // caller is an operator of another seller
          // Create a valid seller, then set fields in tests directly
          seller = mockSeller(rando.address, rando.address, rando.address, rando.address);

          // AuthToken
          emptyAuthToken = mockAuthToken();
          expect(emptyAuthToken.isValid()).is.true;
          await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);

          // Attempt to update the offer, expecting revert
          await expect(offerHandler.connect(rando).voidOffer(id)).to.revertedWith(RevertReasons.NOT_OPERATOR);
        });

        it("Offer already voided", async function () {
          // Void the offer first
          await offerHandler.connect(operator).voidOffer(id);

          // Attempt to void the offer again, expecting revert
          await expect(offerHandler.connect(operator).voidOffer(id)).to.revertedWith(
            RevertReasons.OFFER_HAS_BEEN_VOIDED
          );
        });
      });
    });

    context("👉 extendOffer()", async function () {
      beforeEach(async function () {
        // Create an offer
        await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

        // id of the current offer and increment nextOfferId
        id = nextOfferId++;

        // update the values
        offerDates.validUntil = ethers.BigNumber.from(offerDates.validUntil).add("10000").toString();
        offerStruct = offer.toStruct();
      });

      it("should emit an OfferExtended event", async function () {
        // Extend the valid until date, testing for the event
        await expect(offerHandler.connect(operator).extendOffer(offer.id, offerDates.validUntil))
          .to.emit(offerHandler, "OfferExtended")
          .withArgs(id, offer.sellerId, offerDates.validUntil, operator.address);
      });

      it("should update state", async function () {
        // Update an offer
        await offerHandler.connect(operator).extendOffer(offer.id, offerDates.validUntil);

        // Get the offer as a struct
        [, offerStruct, offerDatesStruct] = await offerHandler.connect(rando).getOffer(offer.id);

        // Parse into entity
        let returnedOfferDates = OfferDates.fromStruct(offerDatesStruct);

        // Returned values should match the input in createOffer
        for ([key, value] of Object.entries(offerDates)) {
          expect(JSON.stringify(returnedOfferDates[key]) === JSON.stringify(value)).is.true;
        }
      });

      context("💔 Revert Reasons", async function () {
        it("The offers region of protocol is paused", async function () {
          // Pause the offers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Offers]);

          // Attempt to extend an offer expecting revert
          await expect(offerHandler.connect(operator).extendOffer(offer.id, offerDates.validUntil)).to.revertedWith(
            RevertReasons.REGION_PAUSED
          );
        });

        it("Offer does not exist", async function () {
          // Set invalid id
          id = "444";

          // Attempt to void the offer, expecting revert
          await expect(offerHandler.connect(operator).extendOffer(id, offerDates.validUntil)).to.revertedWith(
            RevertReasons.NO_SUCH_OFFER
          );

          // Set invalid id
          id = "0";

          // Attempt to void the offer, expecting revert
          await expect(offerHandler.connect(operator).extendOffer(id, offerDates.validUntil)).to.revertedWith(
            RevertReasons.NO_SUCH_OFFER
          );
        });

        it("Caller is not seller", async function () {
          // caller is not the operator of any seller
          // Attempt to update the offer, expecting revert
          await expect(offerHandler.connect(rando).extendOffer(id, offerDates.validUntil)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );

          // caller is an operator of another seller
          // Create a valid seller, then set fields in tests directly
          seller = mockSeller(rando.address, rando.address, rando.address, rando.address);

          // AuthToken
          emptyAuthToken = mockAuthToken();
          expect(emptyAuthToken.isValid()).is.true;
          await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);

          // Attempt to update the offer, expecting revert
          await expect(offerHandler.connect(rando).extendOffer(id, offerDates.validUntil)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );
        });

        it("Offer is not extendable, since it's voided", async function () {
          // Void an offer
          await offerHandler.connect(operator).voidOffer(id);

          // Attempt to update an offer, expecting revert
          await expect(offerHandler.connect(operator).extendOffer(offer.id, offerDates.validUntil)).to.revertedWith(
            RevertReasons.OFFER_HAS_BEEN_VOIDED
          );
        });

        it("New valid until date is lower than the existing valid until date", async function () {
          // Make the valid until date the same as the existing offer
          offerDates.validUntil = ethers.BigNumber.from(offerDates.validUntil).sub("10000").toString();

          await expect(offerHandler.connect(operator).extendOffer(offer.id, offerDates.validUntil)).to.revertedWith(
            RevertReasons.OFFER_PERIOD_INVALID
          );

          // Make new the valid until date less than existing one
          offerDates.validUntil = ethers.BigNumber.from(offerDates.validUntil).sub("1").toString();

          // Attempt to update an offer, expecting revert
          await expect(offerHandler.connect(operator).extendOffer(offer.id, offerDates.validUntil)).to.revertedWith(
            RevertReasons.OFFER_PERIOD_INVALID
          );
        });

        it("Valid until date is not in the future", async function () {
          // Set until date in the past
          offerDates.validUntil = ethers.BigNumber.from(offerDates.validFrom - (oneMonth / 1000) * 6).toString(); // 6 months ago

          // Attempt to update an offer, expecting revert
          await expect(offerHandler.connect(operator).extendOffer(offer.id, offerDates.validUntil)).to.revertedWith(
            RevertReasons.OFFER_PERIOD_INVALID
          );
        });

        it("Offer has voucherRedeemableUntil set and new valid until date is greater than that", async function () {
          // create a new offer with vouchers with fix expiration date
          offer.id++;
          offerDates.voucherRedeemableUntil = ethers.BigNumber.from(offerDates.validUntil).add(oneMonth).toString();
          offerDurations.voucherValid = "0"; // only one of voucherRedeemableUntil and voucherValid can be non zero
          await offerHandler
            .connect(operator)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

          // Set until date in the before offerDates.voucherRedeemableUntil
          offerDates.validUntil = ethers.BigNumber.from(offerDates.voucherRedeemableUntil).add(oneWeek).toString(); // one week after voucherRedeemableUntil

          // Attempt to update an offer, expecting revert
          await expect(offerHandler.connect(operator).extendOffer(offer.id, offerDates.validUntil)).to.revertedWith(
            RevertReasons.OFFER_PERIOD_INVALID
          );
        });
      });
    });

    context("👉 getOffer()", async function () {
      beforeEach(async function () {
        // Create an offer
        await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

        // id of the current offer and increment nextOfferId
        id = nextOfferId++;
      });

      it("should return true for exists if offer is found", async function () {
        // Get the exists flag
        [exists] = await offerHandler.connect(rando).getOffer(id);

        // Validate
        expect(exists).to.be.true;
      });

      it("should return false for exists if offer is not found", async function () {
        // Get the exists flag
        [exists] = await offerHandler.connect(rando).getOffer(invalidOfferId);

        // Validate
        expect(exists).to.be.false;
      });

      it("should return the details of the offer as a struct if found", async function () {
        // Get the offer as a struct
        [, offerStruct, offerDatesStruct, offerDurationsStruct] = await offerHandler.connect(rando).getOffer(id);

        // Parse into entities
        offer = Offer.fromStruct(offerStruct);
        offerDates = OfferDates.fromStruct(offerDatesStruct);
        offerDurations = OfferDurations.fromStruct(offerDurationsStruct);
        disputeResolutionTerms = DisputeResolutionTerms.fromStruct(disputeResolutionTermsStruct);

        // Validate
        expect(offer.isValid()).to.be.true;
        expect(offerDates.isValid()).to.be.true;
        expect(offerDurations.isValid()).to.be.true;
        expect(disputeResolutionTerms.isValid()).to.be.true;
      });
    });

    context("👉 getNextOfferId()", async function () {
      beforeEach(async function () {
        // Create an offer
        await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

        // id of the current offer and increment nextOfferId
        id = nextOfferId++;
      });

      it("should return the next offer id", async function () {
        // What we expect the next offer id to be
        expected = nextOfferId;

        // Get the next offer id
        nextOfferId = await offerHandler.connect(rando).getNextOfferId();

        // Verify expectation
        expect(nextOfferId.toString() == expected).to.be.true;
      });

      it("should be incremented after an offer is created", async function () {
        // Create another offer
        await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

        // What we expect the next offer id to be
        expected = ++nextOfferId;

        // Get the next offer id
        nextOfferId = await offerHandler.connect(rando).getNextOfferId();

        // Verify expectation
        expect(nextOfferId.toString() == expected).to.be.true;
      });

      it("should not be incremented when only getNextOfferId is called", async function () {
        // What we expect the next offer id to be
        expected = nextOfferId;

        // Get the next offer id
        nextOfferId = await offerHandler.connect(rando).getNextOfferId();

        // Verify expectation
        expect(nextOfferId.toString() == expected).to.be.true;

        // Call again
        nextOfferId = await offerHandler.connect(rando).getNextOfferId();

        // Verify expectation
        expect(nextOfferId.toString() == expected).to.be.true;
      });
    });

    context("👉 isOfferVoided()", async function () {
      beforeEach(async function () {
        // Create an offer
        await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

        // id of the current offer and increment nextOfferId
        id = nextOfferId++;
      });

      it("should return true for exists if offer is found, regardless of voided status", async function () {
        // Get the exists flag
        [exists] = await offerHandler.connect(rando).isOfferVoided(id);

        // Validate
        expect(exists).to.be.true;

        // Void offer
        await offerHandler.connect(operator).voidOffer(id);

        // Get the exists flag
        [exists] = await offerHandler.connect(rando).isOfferVoided(id);

        // Validate
        expect(exists).to.be.true;
      });

      it("should return false for exists if offer is not found", async function () {
        // Get the exists flag
        [exists] = await offerHandler.connect(rando).isOfferVoided(invalidOfferId);

        // Validate
        expect(exists).to.be.false;
      });

      it("should return the value as a bool if found", async function () {
        // Get the offer as a struct
        [, voided] = await offerHandler.connect(rando).isOfferVoided(id);

        // Validate
        expect(typeof voided === "boolean").to.be.true;
      });
    });
  });

  // All supported methods - batch offers
  context("📋 Offer Handler Methods - BATCH", async function () {
    let offers = [];
    let offerStructs = [];
    let agentIds;
    let agentId = "0";

    // Make empty seller list, so every seller is allowed
    sellerAllowList = [];

    beforeEach(async function () {
      agentIds = [];

      // create a seller
      // Required constructor params
      id = sellerId = nextAccountId = "1"; // argument sent to contract for createSeller will be ignored

      // Create a valid seller, then set fields in tests directly
      seller = mockSeller(operator.address, admin.address, clerk.address, treasury.address);
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
        operatorDR.address,
        adminDR.address,
        clerkDR.address,
        treasuryDR.address,
        false
      );
      expect(disputeResolver.isValid()).is.true;

      // Make empty seller list, so every seller is allowed
      sellerAllowList = [];

      //Create DisputeResolverFee array so offer creation will succeed
      DRFeeNative = "100";
      DRFeeToken = "200";
      disputeResolverFees = [
        new DisputeResolverFee(ethers.constants.AddressZero, "Native", DRFeeNative),
        new DisputeResolverFee(bosonToken.address, "Boson", DRFeeToken),
      ];

      // Register and activate the dispute resolver
      await accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
      await accountHandler.connect(deployer).activateDisputeResolver(++nextAccountId);

      // create 5 offers
      offers = [];
      offerStructs = [];
      offerDatesList = [];
      offerDatesStructs = [];
      offerDurationsList = [];
      offerDurationsStructs = [];
      disputeResolverIds = [];
      disputeResolutionTermsList = [];
      disputeResolutionTermsStructs = [];
      offerFeesList = [];
      offerFeesStructs = [];

      for (let i = 0; i < 5; i++) {
        // Mock offer, offerDates and offerDurations
        ({ offer, offerDates, offerDurations, disputeResolverId, offerFees } = await mockOffer());

        // Set unique offer properties based on index
        offer.id = `${i + 1}`;
        offer.price = ethers.utils.parseUnits(`${1.5 + i * 1}`, "ether").toString();
        offer.sellerDeposit = ethers.utils.parseUnits(`${0.25 + i * 0.1}`, "ether").toString();
        offer.buyerCancelPenalty = ethers.utils.parseUnits(`${0.05 + i * 0.1}`, "ether").toString();
        offer.quantityAvailable = `${(i + 1) * 2}`;

        offerDates.validFrom = validFrom = ethers.BigNumber.from(Date.now() + oneMonth * i).toString();
        offerDates.validUntil = validUntil = ethers.BigNumber.from(Date.now() + oneMonth * 6 * (i + 1)).toString();

        offerDurations.fulfillmentPeriod = fulfillmentPeriod = `${(i + 1) * oneMonth}`;
        offerDurations.voucherValid = voucherValid = `${(i + 1) * oneMonth}`;
        offerDurations.resolutionPeriod = resolutionPeriod = `${(i + 1) * oneWeek}`;

        offerFees.protocolFee = applyPercentage(offer.price, protocolFeePercentage);

        // Check if domains are valid
        expect(offer.isValid()).is.true;
        expect(offerDates.isValid()).is.true;
        expect(offerDurations.isValid()).is.true;

        offers.push(offer);
        offerStructs.push(offer.toStruct());

        offerDatesList.push(offerDates);
        offerDatesStructs.push(offerDates.toStruct());

        offerDurationsList.push(offerDurations);
        offerDurationsStructs.push(offerDurations.toStruct());

        offerFeesList.push(offerFees);
        offerFeesStructs.push(offerFees.toStruct());

        agentIds.push(agentId);

        disputeResolverIds.push(disputeResolverId);
        const disputeResolutionTerms = new DisputeResolutionTerms(
          disputeResolverId,
          disputeResolver.escalationResponsePeriod,
          DRFeeNative,
          applyPercentage(DRFeeNative, buyerEscalationDepositPercentage)
        );
        disputeResolutionTermsList.push(disputeResolutionTerms);
        disputeResolutionTermsStructs.push(disputeResolutionTerms.toStruct());
      }

      voucherRedeemableFrom = offerDatesList[0].voucherRedeemableFrom;
      voucherRedeemableUntil = offerDatesList[0].voucherRedeemableUntil;

      // change some offers to test different cases
      // offer with boson as an exchange token and unlimited supply
      offers[2].exchangeToken = bosonToken.address;
      offerFeesList[2].protocolFee = protocolFeeFlatBoson;
      offerFeesStructs[2] = offerFeesList[2].toStruct();
      offers[2].quantityAvailable = ethers.constants.MaxUint256.toString();
      offerStructs[2] = offers[2].toStruct();
      disputeResolutionTermsList[2] = new DisputeResolutionTerms(
        disputeResolverId,
        disputeResolver.escalationResponsePeriod,
        DRFeeToken,
        applyPercentage(DRFeeToken, buyerEscalationDepositPercentage)
      );
      disputeResolutionTermsStructs[2] = disputeResolutionTermsList[2].toStruct();

      // absolute zero offer
      offers[4].price =
        offers[4].sellerDeposit =
        offers[4].buyerCancelPenalty =
        offerFeesList[4].protocolFee =
        offerFeesList[4].agentFee =
          "0";
      offerStructs[4] = offers[4].toStruct();
      disputeResolverIds[4] = "0";
      disputeResolutionTermsList[4] = new DisputeResolutionTerms("0", "0", "0", "0");
      disputeResolutionTermsStructs[4] = disputeResolutionTermsList[4].toStruct();
      offerFeesStructs[4] = offerFeesList[4].toStruct();
    });

    context("👉 createOfferBatch()", async function () {
      it("should emit an OfferCreated events for all offers", async function () {
        // Create an offer, testing for the event
        const tx = await offerHandler
          .connect(operator)
          .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds);

        await expect(tx)
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            "1",
            offer.sellerId,
            offerStructs[0],
            offerDatesStructs[0],
            offerDurationsStructs[0],
            disputeResolutionTermsStructs[0],
            offerFeesStructs[0],
            agentIds[0],
            operator.address
          );

        await expect(tx)
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            "2",
            offer.sellerId,
            offerStructs[1],
            offerDatesStructs[1],
            offerDurationsStructs[1],
            disputeResolutionTermsStructs[1],
            offerFeesStructs[1],
            agentIds[1],
            operator.address
          );

        await expect(tx)
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            "3",
            offer.sellerId,
            offerStructs[2],
            offerDatesStructs[2],
            offerDurationsStructs[2],
            disputeResolutionTermsStructs[2],
            offerFeesStructs[2],
            agentIds[2],
            operator.address
          );

        await expect(tx)
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            "4",
            offer.sellerId,
            offerStructs[3],
            offerDatesStructs[3],
            offerDurationsStructs[3],
            disputeResolutionTermsStructs[3],
            offerFeesStructs[3],
            agentIds[3],
            operator.address
          );

        await expect(tx)
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            "5",
            offer.sellerId,
            offerStructs[4],
            offerDatesStructs[4],
            offerDurationsStructs[4],
            disputeResolutionTermsStructs[4],
            offerFeesStructs[4],
            agentIds[4],
            operator.address
          );
      });

      it("should update state", async function () {
        // Create an offer
        await offerHandler
          .connect(operator)
          .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds);

        for (let i = 0; i < 5; i++) {
          // Get the offer as a struct
          [, offerStruct, offerDatesStruct, offerDurationsStruct, disputeResolutionTermsStruct] = await offerHandler
            .connect(rando)
            .getOffer(`${i + 1}`);

          // Parse into entities
          let returnedOffer = Offer.fromStruct(offerStruct);
          let returnedOfferDates = OfferDates.fromStruct(offerDatesStruct);
          let returnedOfferDurations = OfferDurations.fromStruct(offerDurationsStruct);
          let returnedDisputeResolutionTermsStruct = DisputeResolutionTerms.fromStruct(disputeResolutionTermsStruct);

          // Returned values should match the input in createOfferBatch
          for ([key, value] of Object.entries(offers[i])) {
            expect(JSON.stringify(returnedOffer[key]) === JSON.stringify(value)).is.true;
          }
          for ([key, value] of Object.entries(offerDatesList[i])) {
            expect(JSON.stringify(returnedOfferDates[key]) === JSON.stringify(value)).is.true;
          }
          for ([key, value] of Object.entries(offerDurationsList[i])) {
            expect(JSON.stringify(returnedOfferDurations[key]) === JSON.stringify(value)).is.true;
          }
          for ([key, value] of Object.entries(disputeResolutionTermsList[i])) {
            expect(JSON.stringify(returnedDisputeResolutionTermsStruct[key]) === JSON.stringify(value)).is.true;
          }
        }
      });

      it("should ignore any provided id and assign the next available", async function () {
        offers[0].id = "444";
        offers[1].id = "555";
        offers[2].id = "666";
        offers[3].id = "777";
        offers[4].id = "888";

        // Create an offer, testing for the event
        const tx = await offerHandler
          .connect(operator)
          .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds);

        await expect(tx)
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            "1",
            offer.sellerId,
            offerStructs[0],
            offerDatesStructs[0],
            offerDurationsStructs[0],
            disputeResolutionTermsStructs[0],
            offerFeesStructs[0],
            agentIds[0],
            operator.address
          );

        await expect(tx)
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            "2",
            offer.sellerId,
            offerStructs[1],
            offerDatesStructs[1],
            offerDurationsStructs[1],
            disputeResolutionTermsStructs[1],
            offerFeesStructs[1],
            agentIds[1],
            operator.address
          );

        await expect(tx)
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            "3",
            offer.sellerId,
            offerStructs[2],
            offerDatesStructs[2],
            offerDurationsStructs[2],
            disputeResolutionTermsStructs[2],
            offerFeesStructs[2],
            agentIds[2],
            operator.address
          );

        await expect(tx)
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            "4",
            offer.sellerId,
            offerStructs[3],
            offerDatesStructs[3],
            offerDurationsStructs[3],
            disputeResolutionTermsStructs[3],
            offerFeesStructs[3],
            agentIds[3],
            operator.address
          );

        await expect(tx)
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            "5",
            offer.sellerId,
            offerStructs[4],
            offerDatesStructs[4],
            offerDurationsStructs[4],
            disputeResolutionTermsStructs[4],
            offerFeesStructs[4],
            agentIds[4],
            operator.address
          );

        for (let i = 0; i < 5; i++) {
          // wrong offer id should not exist
          [exists] = await offerHandler.connect(rando).getOffer(offers[i].id);
          expect(exists).to.be.false;

          // next offer id should exist
          [exists] = await offerHandler.connect(rando).getOffer(`${i + 1}`);
          expect(exists).to.be.true;
        }
      });

      it("should ignore any provided seller and assign seller id of msg.sender", async function () {
        // set some other sellerId
        offers[0].sellerId = "123";
        offers[1].sellerId = "234";
        offers[2].sellerId = "345";
        offers[3].sellerId = "456";
        offers[4].sellerId = "567";

        // Create an offer, testing for the event
        const tx = await offerHandler
          .connect(operator)
          .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds);

        await expect(tx)
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            "1",
            sellerId,
            offerStructs[0],
            offerDatesStructs[0],
            offerDurationsStructs[0],
            disputeResolutionTermsStructs[0],
            offerFeesStructs[0],
            agentIds[0],
            operator.address
          );

        await expect(tx)
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            "2",
            sellerId,
            offerStructs[1],
            offerDatesStructs[1],
            offerDurationsStructs[1],
            disputeResolutionTermsStructs[1],
            offerFeesStructs[1],
            agentIds[1],
            operator.address
          );

        await expect(tx)
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            "3",
            sellerId,
            offerStructs[2],
            offerDatesStructs[2],
            offerDurationsStructs[2],
            disputeResolutionTermsStructs[2],
            offerFeesStructs[2],
            agentIds[2],
            operator.address
          );

        await expect(tx)
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            "4",
            sellerId,
            offerStructs[3],
            offerDatesStructs[3],
            offerDurationsStructs[3],
            disputeResolutionTermsStructs[3],
            offerFeesStructs[3],
            agentIds[3],
            operator.address
          );

        await expect(tx)
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            "5",
            sellerId,
            offerStructs[4],
            offerDatesStructs[4],
            offerDurationsStructs[4],
            disputeResolutionTermsStructs[4],
            offerFeesStructs[4],
            agentIds[4],
            operator.address
          );
      });

      it("Should allow creation of an offer if DR has a sellerAllowList and seller is on it", async function () {
        // add seller to allow list
        allowedSellersToAdd = ["1"]; // existing seller is "1", DR is "2", new seller is "3"
        await accountHandler.connect(adminDR).addSellersToAllowList(disputeResolverId, allowedSellersToAdd);

        // Create an offer, testing for the event
        await expect(
          offerHandler
            .connect(operator)
            .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds)
        ).to.emit(offerHandler, "OfferCreated");
      });

      context("💔 Revert Reasons", async function () {
        it("The offers region of protocol is paused", async function () {
          // Pause the offers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Offers]);

          // Attempt to create offer batch, expecting revert
          await expect(
            offerHandler
              .connect(operator)
              .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds)
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("Caller not operator of any seller", async function () {
          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(rando)
              .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds)
          ).to.revertedWith(RevertReasons.NOT_OPERATOR);
        });

        it("Valid from date is greater than valid until date in some offer", async function () {
          // Reverse the from and until dates
          offerDatesList[4].validFrom = ethers.BigNumber.from(Date.now() + oneMonth * 6).toString(); // 6 months from now
          offerDatesList[4].validUntil = ethers.BigNumber.from(Date.now()).toString(); // now

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(operator)
              .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds)
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Valid until date is not in the future in some offer", async function () {
          // Set until date in the past
          offerDatesList[0].validUntil = ethers.BigNumber.from(
            offerDatesList[0].validFrom - (oneMonth / 1000) * 6
          ).toString(); // 6 months ago

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(operator)
              .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds)
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Buyer cancel penalty is greater than price", async function () {
          // Set buyer cancel penalty higher than offer price
          offers[0].buyerCancelPenalty = ethers.BigNumber.from(offers[0].price).add("10").toString();

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(operator)
              .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds)
          ).to.revertedWith(RevertReasons.OFFER_PENALTY_INVALID);
        });

        it("No offer cannot be voided at the time of the creation", async function () {
          // Set voided flag to true
          offers[1].voided = true;

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(operator)
              .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds)
          ).to.revertedWith(RevertReasons.OFFER_MUST_BE_ACTIVE);
        });

        it("Creating too many offers", async function () {
          // Try to create the more than 100 offers
          offers = new Array(101).fill(offer);

          // Attempt to create the offers, expecting revert
          await expect(
            offerHandler
              .connect(operator)
              .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds)
          ).to.revertedWith(RevertReasons.TOO_MANY_OFFERS);
        });

        it("Dispute valid duration is 0 for some offer", async function () {
          // Set dispute valid duration to 0
          offerDurationsList[2].resolutionPeriod = "0";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(operator)
              .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_DURATION);
        });

        it("For some offer, both voucher expiration date and voucher expiraton period are defined", async function () {
          // Set both voucherRedeemableUntil and voucherValid
          offerDatesList[2].voucherRedeemableUntil = ethers.BigNumber.from(offerDatesList[2].voucherRedeemableFrom)
            .add(oneMonth)
            .toString();
          offerDurationsList[2].voucherValid = oneMonth.toString();

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(operator)
              .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds)
          ).to.revertedWith(RevertReasons.AMBIGUOUS_VOUCHER_EXPIRY);
        });

        it("For some offer, neither of voucher expiration date and voucher expiraton period are defined", async function () {
          // Set both voucherRedeemableUntil and voucherValid to "0"
          offerDatesList[1].voucherRedeemableUntil = "0";
          offerDurationsList[1].voucherValid = "0";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(operator)
              .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds)
          ).to.revertedWith(RevertReasons.AMBIGUOUS_VOUCHER_EXPIRY);
        });

        it("For some offer, voucher redeemable period is fixed, but it ends before it starts", async function () {
          // Set both voucherRedeemableUntil that is less than voucherRedeemableFrom
          offerDatesList[0].voucherRedeemableUntil = ethers.BigNumber.from(offerDatesList[0].voucherRedeemableFrom)
            .sub(10)
            .toString();
          offerDurationsList[0].voucherValid = "0";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(operator)
              .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds)
          ).to.revertedWith(RevertReasons.REDEMPTION_PERIOD_INVALID);
        });

        it("For some offer, voucher redeemable period is fixed, but it ends before offer expires", async function () {
          // Set both voucherRedeemableUntil that is more than voucherRedeemableFrom but less than validUntil
          offerDatesList[2].voucherRedeemableFrom = "0";
          offerDatesList[2].voucherRedeemableUntil = (Number(offerDatesList[2].validUntil) - 10).toString();
          offerDurationsList[2].voucherValid = "0";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(operator)
              .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds)
          ).to.revertedWith(RevertReasons.REDEMPTION_PERIOD_INVALID);
        });

        it("For some offer, fulfillment period is set to zero", async function () {
          // Set fulfilment period to 0
          offerDurationsList[1].fulfillmentPeriod = "0";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(operator)
              .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds)
          ).to.revertedWith(RevertReasons.INVALID_FULFILLMENT_PERIOD);
        });

        it("For some offer, dispute duration is set to zero", async function () {
          // Set dispute duration period to 0
          offerDurationsList[0].resolutionPeriod = "0";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(operator)
              .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_DURATION);
        });

        it("For some offer, available quantity is set to zero", async function () {
          // Set available quantity to 0
          offers[2].quantityAvailable = "0";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(operator)
              .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds)
          ).to.revertedWith(RevertReasons.INVALID_QUANTITY_AVAILABLE);
        });

        it("For some offer, dispute resolver wallet is not registered", async function () {
          // Set some address that is not registered as a dispute resolver
          disputeResolverIds[1] = "16";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(operator)
              .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        it("For some offer, dispute resolver is not active", async function () {
          // create another dispute resolver, but don't activate it
          disputeResolver = mockDisputeResolver(rando.address, rando.address, rando.address, rando.address, false);
          await accountHandler
            .connect(rando)
            .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

          // Set some address that is not registered as a dispute resolver
          disputeResolverIds[2] = ++nextAccountId;

          // Attempt to Create offers, expecting revert
          await expect(
            offerHandler
              .connect(operator)
              .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);

          // after activation it should be possible to create the offer
          await accountHandler.connect(deployer).activateDisputeResolver(nextAccountId);

          // Create offers, test event
          await expect(
            offerHandler
              .connect(operator)
              .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds)
          ).to.emit(offerHandler, "OfferCreated");
        });

        it("For some absolute zero offer, specified dispute resolver is not registered", async function () {
          // Prepare an absolute zero offer, but specify dispute resolver
          offers[2].price = offers[2].sellerDeposit = offers[2].buyerCancelPenalty = "0";
          disputeResolverIds[2] = "16";

          // Attempt to Create offers, expecting revert
          await expect(
            offerHandler
              .connect(operator)
              .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        it("For some absolute zero offer, specified dispute resolver is not active", async function () {
          // create another dispute resolver, but don't activate it
          disputeResolver = mockDisputeResolver(rando.address, rando.address, rando.address, rando.address, false);
          await accountHandler
            .connect(rando)
            .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

          // Prepare an absolute zero offer, but specify dispute resolver
          offers[1].price = offers[1].sellerDeposit = offers[1].buyerCancelPenalty = "0";
          disputeResolverIds[1] = ++nextAccountId;

          // Attempt to Create offers, expecting revert
          await expect(
            offerHandler
              .connect(operator)
              .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);

          // after activation it should be possible to create the offer
          await accountHandler.connect(deployer).activateDisputeResolver(nextAccountId);

          // Create offers, test event
          await expect(
            offerHandler
              .connect(operator)
              .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds)
          ).to.emit(offerHandler, "OfferCreated");
        });

        it("For some offer seller is not on dispute resolver's seller allow list", async function () {
          // Create new seller so sellerAllowList can have an entry
          seller = mockSeller(rando.address, rando.address, rando.address, rando.address);

          await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);

          allowedSellersToAdd = ["3"];
          await accountHandler.connect(adminDR).addSellersToAllowList(disputeResolverId, allowedSellersToAdd);

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(operator)
              .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds)
          ).to.revertedWith(RevertReasons.SELLER_NOT_APPROVED);
        });

        it("For some offer, dispute resolver does not accept fees in the exchange token", async function () {
          // Set some address that is not part of dispute resolver fees
          offers[3].exchangeToken = rando.address;

          // Attempt to Create offers, expecting revert
          await expect(
            offerHandler
              .connect(operator)
              .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds)
          ).to.revertedWith(RevertReasons.DR_UNSUPPORTED_FEE);
        });

        it("Number of dispute dates does not match the number of offers", async function () {
          // Make dispute dates longer
          offerDatesList.push(new OfferDates(validFrom, validUntil, voucherRedeemableFrom, voucherRedeemableUntil));

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(operator)
              .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds)
          ).to.revertedWith(RevertReasons.ARRAY_LENGTH_MISMATCH);

          // Make dispute dates shorter
          offerDatesList = offerDatesList.slice(0, -2);

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(operator)
              .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds)
          ).to.revertedWith(RevertReasons.ARRAY_LENGTH_MISMATCH);
        });

        it("Number of dispute durations does not match the number of offers", async function () {
          // Make dispute durations longer
          offerDurationsList.push(new OfferDurations(fulfillmentPeriod, voucherValid, resolutionPeriod));

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(operator)
              .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds)
          ).to.revertedWith(RevertReasons.ARRAY_LENGTH_MISMATCH);

          // Make dispute durations shorter
          offerDurationsList = offerDurationsList.slice(0, -2);

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(operator)
              .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds)
          ).to.revertedWith(RevertReasons.ARRAY_LENGTH_MISMATCH);
        });

        it("Number of dispute resolvers does not match the number of offers", async function () {
          // Make dispute durations longer
          disputeResolverIds.push(disputeResolverId);

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(operator)
              .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds)
          ).to.revertedWith(RevertReasons.ARRAY_LENGTH_MISMATCH);

          // Make dispute durations shorter
          disputeResolverIds = disputeResolverIds.slice(0, -2);

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(operator)
              .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds)
          ).to.revertedWith(RevertReasons.ARRAY_LENGTH_MISMATCH);
        });
      });

      context("When offers have non zero agent ids", async function () {
        beforeEach(async function () {
          nonZeroAgentIds = [];
          let agentId = "3";
          offerFeesList = [];
          offerFeesStructs = [];

          // Create an agent: Required constructor params
          agent = mockAgent(other.address);
          agent.id = agentId;
          expect(agent.isValid()).is.true;
          // Create a valid agent
          await accountHandler.connect(rando).createAgent(agent);

          for (let i = 0; i < 5; i++) {
            // Set updated agent ids
            nonZeroAgentIds.push(agentId);

            // Set updated offerFees
            let protocolFee;
            if (offers[i].exchangeToken == bosonToken.address) {
              protocolFee = protocolFeeFlatBoson;
            } else {
              protocolFee = applyPercentage(offers[i].price, protocolFeePercentage);
            }
            let agentFee = ethers.BigNumber.from(offers[i].price).mul(agent.feePercentage).div("10000").toString();
            offerFees = new OfferFees(protocolFee, agentFee);

            offerFeesList.push(offerFees);
            offerFeesStructs.push(offerFees.toStruct());
          }
        });

        it("should emit an OfferCreated events for all offers with updated agent ids", async function () {
          // Create an offer, testing for the event
          const tx = await offerHandler
            .connect(operator)
            .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, nonZeroAgentIds);

          await expect(tx)
            .to.emit(offerHandler, "OfferCreated")
            .withArgs(
              "1",
              offer.sellerId,
              offerStructs[0],
              offerDatesStructs[0],
              offerDurationsStructs[0],
              disputeResolutionTermsStructs[0],
              offerFeesStructs[0],
              nonZeroAgentIds[0],
              operator.address
            );

          await expect(tx)
            .to.emit(offerHandler, "OfferCreated")
            .withArgs(
              "2",
              offer.sellerId,
              offerStructs[1],
              offerDatesStructs[1],
              offerDurationsStructs[1],
              disputeResolutionTermsStructs[1],
              offerFeesStructs[1],
              nonZeroAgentIds[1],
              operator.address
            );

          await expect(tx)
            .to.emit(offerHandler, "OfferCreated")
            .withArgs(
              "3",
              offer.sellerId,
              offerStructs[2],
              offerDatesStructs[2],
              offerDurationsStructs[2],
              disputeResolutionTermsStructs[2],
              offerFeesStructs[2],
              nonZeroAgentIds[2],
              operator.address
            );

          await expect(tx)
            .to.emit(offerHandler, "OfferCreated")
            .withArgs(
              "4",
              offer.sellerId,
              offerStructs[3],
              offerDatesStructs[3],
              offerDurationsStructs[3],
              disputeResolutionTermsStructs[3],
              offerFeesStructs[3],
              nonZeroAgentIds[3],
              operator.address
            );

          await expect(tx)
            .to.emit(offerHandler, "OfferCreated")
            .withArgs(
              "5",
              offer.sellerId,
              offerStructs[4],
              offerDatesStructs[4],
              offerDurationsStructs[4],
              disputeResolutionTermsStructs[4],
              offerFeesStructs[4],
              nonZeroAgentIds[4],
              operator.address
            );
        });

        context("💔 Revert Reasons", async function () {
          it("Agent does not exist", async function () {
            // Set an agent id that does not exist
            nonZeroAgentIds[1] = "16";

            // Attempt to Create an offer, expecting revert
            await expect(
              offerHandler
                .connect(operator)
                .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, nonZeroAgentIds)
            ).to.revertedWith(RevertReasons.NO_SUCH_AGENT);
          });

          it("Sum of Agent fee amount and protocol fee amount should be <= than the offer fee limit", async function () {
            // Create new agent
            let id = "4"; // argument sent to contract for createAgent will be ignored

            // Create a valid agent, then set fields in tests directly
            agent = mockAgent(operator.address);
            agent.id = id;
            agent.feePercentage = "3000"; // 30%
            expect(agent.isValid()).is.true;

            // Create an agent
            await accountHandler.connect(rando).createAgent(agent);

            //Change protocol fee after creating agent
            await configHandler.connect(protocolAdmin).setProtocolFeePercentage("1100"); //11%

            nonZeroAgentIds[1] = id;

            // Attempt to Create an offer, expecting revert
            await expect(
              offerHandler
                .connect(operator)
                .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, nonZeroAgentIds)
            ).to.revertedWith(RevertReasons.AGENT_FEE_AMOUNT_TOO_HIGH);
          });
        });
      });
    });

    context("👉 voidOfferBatch()", async function () {
      let offersToVoid;
      beforeEach(async function () {
        sellerId = "1";

        // Create an offer
        await offerHandler
          .connect(operator)
          .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds);

        offersToVoid = ["1", "3", "5"];
      });

      it("should emit OfferVoided events", async function () {
        [, offerStruct] = await offerHandler.getOffer(offersToVoid[0]);
        // call getOffer with offerId to check the seller id in the event

        // Void offers, testing for the event
        const tx = await offerHandler.connect(operator).voidOfferBatch(offersToVoid);
        await expect(tx)
          .to.emit(offerHandler, "OfferVoided")
          .withArgs(offersToVoid[0], offerStruct.sellerId, operator.address);

        await expect(tx)
          .to.emit(offerHandler, "OfferVoided")
          .withArgs(offersToVoid[1], offerStruct.sellerId, operator.address);

        await expect(tx)
          .to.emit(offerHandler, "OfferVoided")
          .withArgs(offersToVoid[2], offerStruct.sellerId, operator.address);
      });

      it("should update state", async function () {
        // Voided field should be initially false
        for (const id of offersToVoid) {
          [, offerStruct] = await offerHandler.getOffer(id);
          expect(offerStruct.voided).is.false;

          // Get the voided status
          [, voided] = await offerHandler.isOfferVoided(id);
          expect(voided).to.be.false;
        }

        // Void offers
        await offerHandler.connect(operator).voidOfferBatch(offersToVoid);

        for (const id of offersToVoid) {
          // Voided field should be updated
          [, offerStruct] = await offerHandler.getOffer(id);
          expect(offerStruct.voided).is.true;

          // Get the voided status
          [, voided] = await offerHandler.isOfferVoided(id);
          expect(voided).to.be.true;
        }
      });

      context("💔 Revert Reasons", async function () {
        it("The offers region of protocol is paused", async function () {
          // Pause the offers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Offers]);

          // Attempt to void offer batch, expecting revert
          await expect(offerHandler.connect(operator).voidOfferBatch(offersToVoid)).to.revertedWith(
            RevertReasons.REGION_PAUSED
          );
        });

        it("Offer does not exist", async function () {
          // Set invalid id
          offersToVoid = ["1", "432", "2"];

          // Attempt to void the offer, expecting revert
          await expect(offerHandler.connect(operator).voidOfferBatch(offersToVoid)).to.revertedWith(
            RevertReasons.NO_SUCH_OFFER
          );

          // Set invalid id
          offersToVoid = ["1", "2", "0"];

          // Attempt to void the offer, expecting revert
          await expect(offerHandler.connect(operator).voidOfferBatch(offersToVoid)).to.revertedWith(
            RevertReasons.NO_SUCH_OFFER
          );
        });

        it("Caller is not seller", async function () {
          // caller is not the operator of any seller
          // Attempt to update the offer, expecting revert
          await expect(offerHandler.connect(rando).voidOfferBatch(offersToVoid)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );

          // caller is an operator of another seller
          seller = mockSeller(rando.address, rando.address, rando.address, rando.address);

          // AuthToken
          emptyAuthToken = mockAuthToken();
          expect(emptyAuthToken.isValid()).is.true;

          await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);

          // Attempt to update the offer, expecting revert
          await expect(offerHandler.connect(rando).voidOfferBatch(offersToVoid)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );
        });

        it("Offer already voided", async function () {
          // Void the offer first
          await offerHandler.connect(operator).voidOffer("1");

          // Attempt to void the offer again, expecting revert
          await expect(offerHandler.connect(operator).voidOfferBatch(offersToVoid)).to.revertedWith(
            RevertReasons.OFFER_HAS_BEEN_VOIDED
          );

          // try to void the same offer twice
          offersToVoid = ["1", "4", "1"];

          // Attempt to void the offer again, expecting revert
          await expect(offerHandler.connect(operator).voidOfferBatch(offersToVoid)).to.revertedWith(
            RevertReasons.OFFER_HAS_BEEN_VOIDED
          );
        });

        it("Voiding too many offers", async function () {
          // Try to void the more than 100 offers
          offersToVoid = [...Array(101).keys()];

          // Attempt to void the offers, expecting revert
          await expect(offerHandler.connect(operator).voidOfferBatch(offersToVoid)).to.revertedWith(
            RevertReasons.TOO_MANY_OFFERS
          );
        });
      });
    });

    context("👉 extendOfferBatch()", async function () {
      let offersToExtend, newValidUntilDate;
      beforeEach(async function () {
        // Create an offer
        await offerHandler
          .connect(operator)
          .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds);

        offersToExtend = ["1", "3", "5"];
        newValidUntilDate = ethers.BigNumber.from(offerDatesList[4].validUntil).add("10000").toString(); // offer "5" has the highest validUntilDate so we need to set something greater

        for (const offerToExtend of offersToExtend) {
          let i = offerToExtend - 1;
          offers[i].validUntilDate = newValidUntilDate;
        }
      });

      it("should emit OfferExtended events", async function () {
        // Extend the valid until date, testing for the event
        const tx = await offerHandler.connect(operator).extendOfferBatch(offersToExtend, newValidUntilDate);
        await expect(tx)
          .to.emit(offerHandler, "OfferExtended")
          .withArgs(offersToExtend[0], offer.sellerId, newValidUntilDate, operator.address);

        await expect(tx)
          .to.emit(offerHandler, "OfferExtended")
          .withArgs(offersToExtend[1], offer.sellerId, newValidUntilDate, operator.address);

        await expect(tx)
          .to.emit(offerHandler, "OfferExtended")
          .withArgs(offersToExtend[2], offer.sellerId, newValidUntilDate, operator.address);
      });

      it("should update state", async function () {
        // Make sure that state is different from new validUntilDate
        for (const id of offersToExtend) {
          [, offerStruct] = await offerHandler.getOffer(id);
          expect(offerStruct.validUntilDate).is.not.equal(newValidUntilDate);
        }

        // Extend offers
        await offerHandler.connect(operator).extendOfferBatch(offersToExtend, newValidUntilDate);

        for (const id of offersToExtend) {
          // validUntilDate field should be updated
          [, , offerDatesStruct] = await offerHandler.getOffer(id);
          expect(offerDatesStruct.validUntil).is.equal(newValidUntilDate);
        }
      });

      context("💔 Revert Reasons", async function () {
        it("The offers region of protocol is paused", async function () {
          // Pause the offers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Offers]);

          // Attempt to void offer batch, expecting revert
          await expect(
            offerHandler.connect(operator).extendOfferBatch(offersToExtend, newValidUntilDate)
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("Offer does not exist", async function () {
          // Set invalid id
          offersToExtend = ["1", "432", "2"];

          // Attempt to extend the offers, expecting revert
          await expect(
            offerHandler.connect(operator).extendOfferBatch(offersToExtend, newValidUntilDate)
          ).to.revertedWith(RevertReasons.NO_SUCH_OFFER);

          // Set invalid id
          offersToExtend = ["1", "2", "0"];

          // Attempt to extend the offers, expecting revert
          await expect(
            offerHandler.connect(operator).extendOfferBatch(offersToExtend, newValidUntilDate)
          ).to.revertedWith(RevertReasons.NO_SUCH_OFFER);
        });

        it("Caller is not seller", async function () {
          // caller is not the operator of any seller
          // Attempt to extend the offers, expecting revert
          await expect(offerHandler.connect(rando).extendOfferBatch(offersToExtend, newValidUntilDate)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );

          // caller is an operator of another seller
          seller = mockSeller(rando.address, rando.address, rando.address, rando.address);

          // AuthToken
          emptyAuthToken = mockAuthToken();
          expect(emptyAuthToken.isValid()).is.true;
          await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);

          // Attempt to extend the offers, expecting revert
          await expect(offerHandler.connect(rando).extendOfferBatch(offersToExtend, newValidUntilDate)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );
        });

        it("Offers are not extendable, since one of them it's voided", async function () {
          // Void the offer first
          await offerHandler.connect(operator).voidOffer("3");

          // Attempt to extend the offers, expecting revert
          await expect(
            offerHandler.connect(operator).extendOfferBatch(offersToExtend, newValidUntilDate)
          ).to.revertedWith(RevertReasons.OFFER_HAS_BEEN_VOIDED);
        });

        it("New valid until date is lower than the existing valid until date", async function () {
          // Make the valid until date the same as the existing offer
          newValidUntilDate = ethers.BigNumber.from(offers[4].validUntilDate).sub("10000").toString(); // same as that validUntilDate of offer 5

          await expect(
            offerHandler.connect(operator).extendOfferBatch(offersToExtend, newValidUntilDate)
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);

          // Make new the valid until date less than existing one
          newValidUntilDate = ethers.BigNumber.from(newValidUntilDate).sub("1").toString(); // less that validUntilDate of offer 5

          // Attempt to extend the offers, expecting revert
          await expect(
            offerHandler.connect(operator).extendOfferBatch(offersToExtend, newValidUntilDate)
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Valid until date is not in the future", async function () {
          // Set until date in the past
          newValidUntilDate = ethers.BigNumber.from(offerDatesList[0].validFrom - (oneMonth / 1000) * 6).toString(); // 6 months ago

          // Attempt to extend the offers, expecting revert
          await expect(
            offerHandler.connect(operator).extendOfferBatch(offersToExtend, newValidUntilDate)
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Offer has voucherRedeemableUntil set and new valid until date is greater than that", async function () {
          // create a new offer with vouchers with fix expiration date
          offer.id++;
          offerDates.voucherRedeemableUntil = ethers.BigNumber.from(offerDates.validUntil).add(oneMonth).toString();
          offerDurations.voucherValid = "0"; // only one of voucherRedeemableUntil and voucherValid can be non zero
          await offerHandler
            .connect(operator)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);
          offersToExtend.push(offer.id);

          // Set until date in after the offerDates.voucherRedeemableUntil
          newValidUntilDate = ethers.BigNumber.from(offerDates.voucherRedeemableUntil).add(oneWeek).toString(); // one week after voucherRedeemableUntil

          // Attempt to extend the offers, expecting revert
          await expect(
            offerHandler.connect(operator).extendOfferBatch(offersToExtend, newValidUntilDate)
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Extending too many offers", async function () {
          // Try to extend the more than 100 offers
          offersToExtend = [...Array(101).keys()];

          // Attempt to extend the offers, expecting revert
          await expect(
            offerHandler.connect(operator).extendOfferBatch(offersToExtend, newValidUntilDate)
          ).to.revertedWith(RevertReasons.TOO_MANY_OFFERS);
        });
      });
    });
  });
});
