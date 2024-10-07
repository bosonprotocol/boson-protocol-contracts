const { ethers } = require("hardhat");
const { getContractAt, ZeroAddress, getSigners, MaxUint256, provider, parseUnits } = ethers;
const { assert, expect } = require("chai");

const Offer = require("../../scripts/domain/Offer");
const OfferDates = require("../../scripts/domain/OfferDates");
const OfferDurations = require("../../scripts/domain/OfferDurations");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const DisputeResolutionTerms = require("../../scripts/domain/DisputeResolutionTerms");
const OfferFees = require("../../scripts/domain/OfferFees");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const Range = require("../../scripts/domain/Range");
const { RoyaltyRecipientInfo, RoyaltyRecipientInfoList } = require("../../scripts/domain/RoyaltyRecipientInfo.js");
const { RoyaltyInfo } = require("../../scripts/domain/RoyaltyInfo");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const {
  applyPercentage,
  calculateCloneAddress,
  calculateBosonProxyAddress,
  setupTestEnvironment,
  getSnapshot,
  revertToSnapshot,
  deriveTokenId,
  compareOfferStructs,
  compareRoyaltyInfo,
} = require("../util/utils.js");
const { oneWeek, oneMonth, oneDay } = require("../util/constants");
const {
  mockOffer,
  mockDisputeResolver,
  mockAgent,
  mockSeller,
  mockVoucherInitValues,
  mockAuthToken,
  accountId,
} = require("../util/mock");
const { encodeBytes32String } = require("ethers");
const PriceType = require("../../scripts/domain/PriceType.js");

/**
 *  Test the Boson Offer Handler interface
 */
describe("IBosonOfferHandler", function () {
  // Common vars
  let InterfaceIds;
  let deployer,
    pauser,
    rando,
    assistant,
    admin,
    clerk,
    treasury,
    assistantDR,
    adminDR,
    clerkDR,
    treasuryDR,
    other,
    other2;
  let erc165,
    accountHandler,
    offerHandler,
    configHandler,
    pauseHandler,
    exchangeHandler,
    fundsHandler,
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
  let disputePeriod,
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
    disputeResolutionTerms,
    disputeResolutionTermsStruct,
    disputeResolutionTermsStructs,
    disputeResolutionTermsList;
  let DRFeeNative, DRFeeToken;
  let voucherInitValues;
  let emptyAuthToken;
  let agent, agentId, nonZeroAgentIds;
  let sellerAllowList, allowedSellersToAdd;
  let returnedAgentId;
  let snapshotId;
  let beaconProxyAddress;
  let offerFeeLimit;
  let bosonErrors;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();

    // reset account id (if multiple tests are run, accountId can get cached and cannot rely that other tests will reset it)
    accountId.next(true);

    // Deploy the boson token
    [bosonToken] = await deployMockTokens(["BosonToken"]);

    // Specify contracts needed for this test
    const contracts = {
      erc165: "ERC165Facet",
      accountHandler: "IBosonAccountHandler",
      offerHandler: "IBosonOfferHandler",
      exchangeHandler: "IBosonExchangeHandler",
      fundsHandler: "IBosonFundsHandler",
      configHandler: "IBosonConfigHandler",
      pauseHandler: "IBosonPauseHandler",
    };

    ({
      signers: [pauser, admin, treasury, rando, adminDR, treasuryDR, other, other2],
      contractInstances: {
        erc165,
        accountHandler,
        offerHandler,
        exchangeHandler,
        fundsHandler,
        configHandler,
        pauseHandler,
      },
      protocolConfig: [, , protocolFeePercentage, protocolFeeFlatBoson, buyerEscalationDepositPercentage],
    } = await setupTestEnvironment(contracts, { bosonTokenAddress: await bosonToken.getAddress() }));

    bosonErrors = await getContractAt("BosonErrors", await configHandler.getAddress());

    // make all account the same
    assistant = admin;
    assistantDR = adminDR;
    clerk = clerkDR = { address: ZeroAddress };
    [deployer] = await getSigners();

    // Get the beacon proxy address
    beaconProxyAddress = await calculateBosonProxyAddress(await configHandler.getAddress());

    // Get snapshot id
    snapshotId = await getSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();
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
      accountId.next(true);

      // create a seller
      // Required constructor params
      id = nextAccountId = "1"; // argument sent to contract for createSeller will be ignored

      // Create a valid seller, then set fields in tests directly
      seller = mockSeller(
        await assistant.getAddress(),
        await admin.getAddress(),
        clerk.address,
        await treasury.getAddress()
      );
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
        await assistantDR.getAddress(),
        await adminDR.getAddress(),
        clerkDR.address,
        await treasuryDR.getAddress(),
        true
      );
      expect(disputeResolver.isValid()).is.true;

      //Create DisputeResolverFee array so offer creation will succeed
      DRFeeNative = "0";
      DRFeeToken = "0";
      disputeResolverFees = [
        new DisputeResolverFee(ZeroAddress, "Native", DRFeeNative),
        new DisputeResolverFee(await bosonToken.getAddress(), "Boson", DRFeeToken),
      ];

      // Make empty seller list, so every seller is allowed
      sellerAllowList = [];

      // Register the dispute resolver
      await accountHandler
        .connect(adminDR)
        .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

      // The first offer id
      nextOfferId = "1";
      invalidOfferId = "666";
      sellerId = 1;

      // Mock offer
      ({ offer, offerDates, offerDurations, offerFees } = await mockOffer());

      // Check if domains are valid
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

      // Set dispute resolution terms
      disputeResolutionTerms = new DisputeResolutionTerms(
        disputeResolver.id,
        disputeResolver.escalationResponsePeriod,
        DRFeeNative,
        applyPercentage(DRFeeNative, buyerEscalationDepositPercentage)
      );
      disputeResolutionTermsStruct = disputeResolutionTerms.toStruct();

      // Set agent id as zero as it is optional for createOffer().
      agentId = "0";
      offerFeeLimit = MaxUint256; // unlimited offer fee to not affect the tests
    });

    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    context("👉 createOffer()", async function () {
      it("should emit an OfferCreated event", async function () {
        // Create an offer, testing for the event
        await expect(
          offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
        )
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            offer.sellerId,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );
      });

      it("should update state", async function () {
        // Create an offer
        await offerHandler
          .connect(assistant)
          .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit);

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

        [exists, returnedAgentId] = await offerHandler.getAgentIdByOffer(offer.id);
        expect(exists).to.be.false; // offer is without agent
      });

      it("should ignore any provided id and assign the next available", async function () {
        offer.id = "444";

        // Create an offer, testing for the event
        await expect(
          offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
        )
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            offer.sellerId,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
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
          offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
        )
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            sellerId,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );
      });

      it("after the protocol fee changes, new offers should have the new fee", async function () {
        // set the new procol fee
        let protocolFeePercentage = "300"; // 3%
        await configHandler.connect(deployer).setProtocolFeePercentage(protocolFeePercentage);

        offer.id = await offerHandler.getNextOfferId();
        protocolFee = applyPercentage(price, protocolFeePercentage);
        offerFees.protocolFee = protocolFee;
        offerFeesStruct = offerFees.toStruct();

        // Create a new offer
        await expect(
          offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
        )
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            offer.sellerId,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );
      });

      it("If exchange token is $BOSON, fee should be flat boson fee", async function () {
        // Prepare an offer with $BOSON as exchange token
        offer.exchangeToken = await bosonToken.getAddress();
        disputeResolutionTerms = new DisputeResolutionTerms(
          disputeResolver.id,
          disputeResolver.escalationResponsePeriod,
          DRFeeToken,
          applyPercentage(DRFeeToken, buyerEscalationDepositPercentage)
        );
        offerFees.protocolFee = protocolFeeFlatBoson;
        offerFeesStruct = offerFees.toStruct();

        // Create a new offer
        await expect(
          offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
        )
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            offer.sellerId,
            compareOfferStructs.bind(offer.toStruct()),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTerms.toStruct(),
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );
      });

      it("For absolute zero offers, dispute resolver can be unspecified", async function () {
        // Prepare an absolute zero offer
        offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = offerFees.protocolFee = offerFees.agentFee = "0";
        disputeResolver.id = "0";
        disputeResolutionTermsStruct = new DisputeResolutionTerms("0", "0", "0", "0").toStruct();
        offerFeesStruct = offerFees.toStruct();

        // Create a new offer
        await expect(
          offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
        )
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            offer.sellerId,
            compareOfferStructs.bind(offer.toStruct()),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );
      });

      it("Should allow creation of an offer with unlimited supply", async function () {
        // Prepare an absolute zero offer
        offer.quantityAvailable = MaxUint256.toString();

        // Create a new offer
        await expect(
          offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
        )
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            offer.sellerId,
            compareOfferStructs.bind(offer.toStruct()),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );
      });

      it("Should use the correct dispute resolver fee", async function () {
        // Create an offer in native currency
        await expect(
          offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
        )
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            offer.id,
            sellerId,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );

        // create another offer, now with bosonToken as exchange token
        offer.exchangeToken = await bosonToken.getAddress();
        offer.id = "2";
        disputeResolutionTermsStruct = new DisputeResolutionTerms(
          disputeResolver.id,
          disputeResolver.escalationResponsePeriod,
          DRFeeToken,
          applyPercentage(DRFeeToken, buyerEscalationDepositPercentage)
        ).toStruct();
        offerFees.protocolFee = protocolFeeFlatBoson;
        offerFeesStruct = offerFees.toStruct();

        // Create an offer in boson token
        await expect(
          offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
        )
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            offer.id,
            sellerId,
            compareOfferStructs.bind(offer.toStruct()),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );
      });

      it("Should allow creation of an offer if DR has a sellerAllowList and seller is on it", async function () {
        // Create new seller so sellerAllowList can have an entry
        seller = mockSeller(await rando.getAddress(), await rando.getAddress(), ZeroAddress, await rando.getAddress());

        await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);

        allowedSellersToAdd = ["3"];
        await accountHandler.connect(adminDR).addSellersToAllowList(disputeResolver.id, allowedSellersToAdd);

        // Attempt to Create an offer, expecting revert
        await expect(
          offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
        ).to.revertedWithCustomError(bosonErrors, RevertReasons.SELLER_NOT_APPROVED);

        // add seller to allow list
        allowedSellersToAdd = ["1"]; // existing seller is "1", DR is "2", new seller is "3"
        await accountHandler.connect(adminDR).addSellersToAllowList(disputeResolver.id, allowedSellersToAdd);

        // Create an offer testing for the event
        await expect(
          offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
        ).to.emit(offerHandler, "OfferCreated");
      });

      context("Additional collections", async function () {
        let expectedCollectionAddress;

        beforeEach(async function () {
          const externalId = "Brand1";
          voucherInitValues.collectionSalt = encodeBytes32String(externalId);

          expectedCollectionAddress = calculateCloneAddress(
            await accountHandler.getAddress(),
            beaconProxyAddress,
            admin.address,
            voucherInitValues.collectionSalt
          );

          // Create a new collection
          await accountHandler.connect(assistant).createNewCollection(externalId, voucherInitValues);

          // Update collection index
          offer.collectionIndex = "1";
        });

        it("Create offer", async function () {
          // Create an offer, testing for the event
          await expect(
            offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
          )
            .to.emit(offerHandler, "OfferCreated")
            .withArgs(
              nextOfferId,
              offer.sellerId,
              compareOfferStructs.bind(offer.toStruct()),
              offerDatesStruct,
              offerDurationsStruct,
              disputeResolutionTermsStruct,
              offerFeesStruct,
              agentId,
              assistant.address
            );
        });

        it("Reserve range", async function () {
          offer.quantityAvailable = "200";
          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit);

          // expected address of the first clone
          const bosonVoucher = await getContractAt("BosonVoucher", expectedCollectionAddress);

          const length = 100;
          const exchangeId = "1";
          const lastExchangeId = BigInt(exchangeId) + BigInt(length) - 1n;
          const firstTokenId = deriveTokenId(nextOfferId, exchangeId);

          const range = new Range(firstTokenId.toString(), length.toString(), "0", "0", assistant.address);

          // Reserve a range, testing for the event
          const tx = await offerHandler.connect(assistant).reserveRange(id, length, assistant.address);

          await expect(tx)
            .to.emit(offerHandler, "RangeReserved")
            .withArgs(nextOfferId, offer.sellerId, exchangeId, lastExchangeId, assistant.address, assistant.address);

          await expect(tx).to.emit(bosonVoucher, "RangeReserved").withArgs(nextOfferId, range.toStruct());
        });
      });

      it("Should allow creation of an offer with royalty recipients", async function () {
        // Add royalty recipients
        const royaltyRecipientList = new RoyaltyRecipientInfoList([
          new RoyaltyRecipientInfo(other.address, "100"),
          new RoyaltyRecipientInfo(other2.address, "200"),
        ]);
        // royalty recipients increment the account id in the protocol
        accountId.next();
        accountId.next();
        await accountHandler.connect(admin).addRoyaltyRecipients(seller.id, royaltyRecipientList.toStruct());

        // Add royalty info to the offer
        offer.royaltyInfo = [new RoyaltyInfo([other.address, ZeroAddress], ["150", "10"])];

        // Create an offer testing for the event
        await expect(
          offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
        )
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            offer.id,
            sellerId,
            compareOfferStructs.bind(offer.toStruct()),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            assistant.address
          );
      });

      it("Should allow create of an offer with offer type = discovery and the price is not set to zero", async function () {
        // Set offer type to discovery
        offer.priceType = PriceType.Discovery;

        // Create an offer and emit OfferCreated event
        await expect(
          offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
        ).to.emit(offerHandler, "OfferCreated");
      });

      context("💔 Revert Reasons", async function () {
        it("The offers region of protocol is paused", async function () {
          // Pause the offers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Offers]);

          // Attempt to create an offer expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Offers);
        });

        it("Caller not assistant of any seller", async function () {
          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(rando)
              .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_ASSISTANT);
        });

        it("Valid from date is greater than valid until date", async function () {
          // Reverse the from and until dates
          offerDates.validFrom = (BigInt(Date.now()) + oneMonth * 6n).toString(); // 6 months from now
          offerDates.validUntil = BigInt(Date.now()).toString(); // now

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Valid until date is not in the future", async function () {
          // get current block timestamp
          const block = await provider.getBlock("latest");
          const now = block.timestamp.toString();

          // set validFrom date in the past
          offerDates.validFrom = (BigInt(now) - oneMonth * 6n).toString(); // 6 months ago

          // set valid until > valid from
          offerDates.validUntil = (BigInt(now) - oneMonth).toString(); // 1 month ago

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Buyer cancel penalty is greater than price", async function () {
          // Set buyer cancel penalty higher than offer price
          offer.buyerCancelPenalty = (BigInt(offer.price) + 10n).toString();

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_PENALTY_INVALID);
        });

        it("Offer cannot be voided at the time of the creation", async function () {
          // Set voided flag to true
          offer.voided = true;

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_MUST_BE_ACTIVE);
        });

        it("Both voucher expiration date and voucher expiration period are defined", async function () {
          // Set both voucherRedeemableUntil and voucherValid
          offerDates.voucherRedeemableUntil = (BigInt(offerDates.voucherRedeemableFrom) + oneMonth).toString();
          offerDurations.voucherValid = oneMonth.toString();

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.AMBIGUOUS_VOUCHER_EXPIRY);
        });

        it("Neither of voucher expiration date and voucher expiration period are defined", async function () {
          // Set both voucherRedeemableUntil and voucherValid to "0"
          offerDates.voucherRedeemableUntil = "0";
          offerDurations.voucherValid = "0";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.AMBIGUOUS_VOUCHER_EXPIRY);
        });

        it("Voucher redeemable period is fixed, but it ends before it starts", async function () {
          // Set both voucherRedeemableUntil that is less than voucherRedeemableFrom
          offerDates.voucherRedeemableUntil = (Number(offerDates.voucherRedeemableFrom) - 10).toString();
          offerDurations.voucherValid = "0";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.REDEMPTION_PERIOD_INVALID);
        });

        it("Voucher redeemable period is fixed, but it ends before offer expires", async function () {
          // Set both voucherRedeemableUntil that is more than voucherRedeemableFrom but less than validUntil
          offerDates.voucherRedeemableFrom = "0";
          offerDates.voucherRedeemableUntil = (Number(offerDates.validUntil) - 10).toString();
          offerDurations.voucherValid = "0";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.REDEMPTION_PERIOD_INVALID);
        });

        it("Dispute period is less than minimum dispute period", async function () {
          // Set dispute period to less than minDisputePeriod (oneWeek)
          offerDurations.disputePeriod = (oneWeek - 1000n).toString();

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_DISPUTE_PERIOD);
        });

        it("Resolution period is less than minimum resolution period", async function () {
          // Set resolution duration period to less than minResolutionPeriod (oneWeek)
          offerDurations.resolutionPeriod = (oneWeek - 10n).toString();

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_RESOLUTION_PERIOD);
        });

        it("Resolution period is greater than protocol max resolution period", async function () {
          await configHandler.setMinResolutionPeriod(oneDay - 1n);
          // Set max resolution period to 1 day
          await configHandler.setMaxResolutionPeriod(oneDay); // 24 hours

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_RESOLUTION_PERIOD);
        });

        it("Available quantity is set to zero", async function () {
          // Set available quantity to 0
          offer.quantityAvailable = "0";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_QUANTITY_AVAILABLE);
        });

        it("Dispute resolver wallet is not registered", async function () {
          // Set some address that is not registered as a dispute resolver
          disputeResolver.id = "16";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        it("Dispute resolver wallet is not registered", async function () {
          // Set some address that is not registered as a dispute resolver
          offer.price = "0";
          disputeResolver.id = "16";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        // TODO - revisit when account deactivations are supported
        it.skip("Dispute resolver is not active", async function () {
          // create another dispute resolver, but don't activate it
          disputeResolver = mockDisputeResolver(
            await rando.getAddress(),
            await rando.getAddress(),
            ZeroAddress,
            await rando.getAddress(),
            false
          );
          await accountHandler
            .connect(rando)
            .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_DISPUTE_RESOLVER);

          // after activation it should be possible to create the offer
          await accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id);

          // Create an offer, test event
          await expect(
            offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
          ).to.emit(offerHandler, "OfferCreated");
        });

        it("For absolute zero offer, specified dispute resolver is not registered", async function () {
          // Prepare an absolute zero offer, but specify dispute resolver
          offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = "0";
          disputeResolver.id = "16";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        // TODO - revisit when account deactivations are supported
        it.skip("For absolute zero offer, specified dispute resolver is not active", async function () {
          // create another dispute resolver, but don't activate it
          disputeResolver = mockDisputeResolver(
            await rando.getAddress(),
            await rando.getAddress(),
            ZeroAddress,
            await rando.getAddress(),
            false
          );
          await accountHandler
            .connect(rando)
            .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

          // Prepare an absolute zero offer, but specify dispute resolver
          offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = "0";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_DISPUTE_RESOLVER);

          // after activation it should be possible to create the offer
          await accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id);

          // Create an offer, test event
          await expect(
            offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
          ).to.emit(offerHandler, "OfferCreated");
        });

        it("Seller is not on dispute resolver's seller allow list", async function () {
          // Create new seller so sellerAllowList can have an entry
          seller = mockSeller(
            await rando.getAddress(),
            await rando.getAddress(),
            ZeroAddress,
            await rando.getAddress()
          );

          await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);

          allowedSellersToAdd = ["3"]; // DR is "1", existing seller is "2", new seller is "3"
          await accountHandler.connect(adminDR).addSellersToAllowList(disputeResolver.id, allowedSellersToAdd);

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.SELLER_NOT_APPROVED);
        });

        it("Dispute resolver does not accept fees in the exchange token", async function () {
          // Set some address that is not part of dispute resolver fees
          offer.exchangeToken = await rando.getAddress();

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.DR_UNSUPPORTED_FEE);
        });

        it("Collection does not exist", async function () {
          // Set non existent collection index
          offer.collectionIndex = "1";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_COLLECTION);

          // Create a new collection
          const externalId = "Brand1";
          voucherInitValues.collectionSalt = encodeBytes32String(externalId);
          await accountHandler.connect(assistant).createNewCollection(externalId, voucherInitValues);

          // Set non existent collection index
          offer.collectionIndex = "2";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_COLLECTION);
        });

        context("With royalty info", async function () {
          beforeEach(async function () {
            // Add royalty recipients
            const royaltyRecipientList = new RoyaltyRecipientInfoList([
              new RoyaltyRecipientInfo(other.address, "100"),
              new RoyaltyRecipientInfo(other2.address, "200"),
            ]);
            // royalty recipients increment the account id in the protocol
            accountId.next();
            accountId.next();
            await accountHandler.connect(admin).addRoyaltyRecipients(seller.id, royaltyRecipientList.toStruct());
          });

          it("Royalty recipient is not on seller's allow list", async function () {
            // Add royalty info to the offer
            offer.royaltyInfo = [new RoyaltyInfo([other.address, rando.address], ["150", "10"])];

            // Create an offer testing for the event
            await expect(
              offerHandler
                .connect(assistant)
                .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_ROYALTY_RECIPIENT);
          });

          it("Royalty percentage is less than the value decided by the admin", async function () {
            // Add royalty info to the offer
            offer.royaltyInfo = [new RoyaltyInfo([other.address, other2.address], ["90", "250"])];

            // Create an offer testing for the event
            await expect(
              offerHandler
                .connect(assistant)
                .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_ROYALTY_PERCENTAGE);
          });

          it("Total royalty percentage is more than max royalty percentage", async function () {
            // Add royalty info to the offer
            offer.royaltyInfo = [new RoyaltyInfo([other.address, other2.address], ["5000", "4000"])];

            // Create an offer testing for the event
            await expect(
              offerHandler
                .connect(assistant)
                .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_ROYALTY_PERCENTAGE);
          });
        });
      });

      context("When offer has non zero agent id", async function () {
        beforeEach(async function () {
          // Create a valid agent, then set fields in tests directly
          agent = mockAgent(await other.getAddress());
          agent.id = "3";
          agentId = agent.id;
          expect(agent.isValid()).is.true;

          // Create an agent
          await accountHandler.connect(rando).createAgent(agent);

          agentFee = ((BigInt(offer.price) * BigInt(agent.feePercentage)) / 10000n).toString();
          offerFees.agentFee = agentFee;
          offerFeesStruct = offerFees.toStruct();
        });

        it("should emit an OfferCreated event with updated agent id", async function () {
          // Create an offer, testing for the event
          await expect(
            offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
          )
            .to.emit(offerHandler, "OfferCreated")
            .withArgs(
              nextOfferId,
              offer.sellerId,
              compareOfferStructs.bind(offerStruct),
              offerDatesStruct,
              offerDurationsStruct,
              disputeResolutionTermsStruct,
              offerFeesStruct,
              agentId,
              await assistant.getAddress()
            );

          // Check that mapping between agent and offer is correct
          [exists, returnedAgentId] = await offerHandler.getAgentIdByOffer(offer.id);
          expect(exists).to.be.true;
          expect(returnedAgentId).to.eq(agentId, "agent id mismatch");
        });

        it("after the agent fee changes, new offers should have the new agent fee", async function () {
          agent.feePercentage = "1000"; // 10%
          await accountHandler.connect(other).updateAgent(agent);

          offer.id = await offerHandler.getNextOfferId();
          protocolFee = applyPercentage(price, protocolFeePercentage);
          offerFees.protocolFee = protocolFee;

          // Calculate the new agent fee amount.
          let newOfferAgentFee = ((BigInt(offer.price) * BigInt(agent.feePercentage)) / 10000n).toString();
          offerFees.agentFee = newOfferAgentFee;
          offerFeesStruct = offerFees.toStruct();

          // Create a new offer
          await expect(
            offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
          )
            .to.emit(offerHandler, "OfferCreated")
            .withArgs(
              nextOfferId,
              offer.sellerId,
              compareOfferStructs.bind(offer.toStruct()),
              offerDatesStruct,
              offerDurationsStruct,
              disputeResolutionTermsStruct,
              offerFeesStruct,
              agentId,
              await assistant.getAddress()
            );

          //Check offer agent fee for New offer.
          [, , , , , offerFeesStruct] = await offerHandler.getOffer(offer.id);
          expect(offerFeesStruct.agentFee.toString()).is.equal(newOfferAgentFee);
        });

        it("after the agent fee changes, old offers should have the same agent fee", async function () {
          // Creating 1st offer
          let oldOfferId = await offerHandler.getNextOfferId();

          // Calculate the new agent fee amount.
          let oldOfferAgentFee = ((BigInt(offer.price) * BigInt(agent.feePercentage)) / 10000n).toString();

          // Create a new offer
          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit);

          // change agent fee percentage and create a new offer
          agent.feePercentage = "1000"; // 10%
          await accountHandler.connect(other).updateAgent(agent);

          // Creating 2nd offer
          // Calculate the new agent fee amount.
          let newOfferAgentFee = ((BigInt(offer.price) * BigInt(agent.feePercentage)) / 10000n).toString();

          let newOfferId = await offerHandler.getNextOfferId();

          // Create a new offer
          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit);

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
              offerHandler
                .connect(assistant)
                .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_AGENT);
          });

          it("Sum of agent fee amount and protocol fee amount should be <= than the protocol wide offer fee limit", async function () {
            // Create a valid agent, then set fields in tests directly
            agent = mockAgent(await assistant.getAddress());
            agent.id = "4";
            agent.feePercentage = "3000"; //30%
            expect(agent.isValid()).is.true;

            // Create an agent
            await accountHandler.connect(rando).createAgent(agent);

            //Change protocol fee after creating agent
            await configHandler.connect(deployer).setProtocolFeePercentage("1100"); //11%

            // Attempt to Create an offer, expecting revert
            await expect(
              offerHandler
                .connect(assistant)
                .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agent.id, offerFeeLimit)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.AGENT_FEE_AMOUNT_TOO_HIGH);
          });

          it("Sum of agent fee amount and protocol fee amount should be <= than the seller defined offer fee limit", async function () {
            // Set fee limit below the sum of agent fee and protocol fee
            offerFeeLimit = BigInt(agent.feePercentage) + BigInt(offerFees.protocolFee) - 1n;

            // Attempt to Create an offer, expecting revert
            await expect(
              offerHandler
                .connect(assistant)
                .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agent.id, offerFeeLimit)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.TOTAL_FEE_EXCEEDS_LIMIT);
          });
        });
      });
    });

    context("👉 voidOffer()", async function () {
      beforeEach(async function () {
        // Create an offer
        await offerHandler
          .connect(assistant)
          .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit);

        // id of the current offer and increment nextOfferId
        id = nextOfferId++;
      });

      it("should emit an OfferVoided event", async function () {
        // call getOffer with offerId to check the seller id in the event
        [, offerStruct] = await offerHandler.getOffer(id);

        // Void the offer, testing for the event
        await expect(offerHandler.connect(assistant).voidOffer(id))
          .to.emit(offerHandler, "OfferVoided")
          .withArgs(id, offerStruct.sellerId, await assistant.getAddress());
      });

      it("should update state", async function () {
        // Voided field should be initially false
        [, offerStruct] = await offerHandler.getOffer(id);
        expect(offerStruct.voided).is.false;

        // Get the voided status
        [, voided] = await offerHandler.isOfferVoided(id);
        expect(voided).to.be.false;

        // Void the offer
        await offerHandler.connect(assistant).voidOffer(id);

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
          await expect(offerHandler.connect(assistant).voidOffer(id))
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Offers);
        });

        it("Offer does not exist", async function () {
          // Set invalid id
          id = "444";

          // Attempt to void the offer, expecting revert
          await expect(offerHandler.connect(assistant).voidOffer(id)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.NO_SUCH_OFFER
          );

          // Set invalid id
          id = "0";

          // Attempt to void the offer, expecting revert
          await expect(offerHandler.connect(assistant).voidOffer(id)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.NO_SUCH_OFFER
          );
        });

        it("Caller is not seller", async function () {
          // caller is not the assistant of any seller
          // Attempt to update the offer, expecting revert
          await expect(offerHandler.connect(rando).voidOffer(id)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.NOT_ASSISTANT
          );

          // caller is an assistant of another seller
          // Create a valid seller, then set fields in tests directly
          seller = mockSeller(
            await rando.getAddress(),
            await rando.getAddress(),
            ZeroAddress,
            await rando.getAddress()
          );

          // AuthToken
          emptyAuthToken = mockAuthToken();
          expect(emptyAuthToken.isValid()).is.true;
          await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);

          // Attempt to update the offer, expecting revert
          await expect(offerHandler.connect(rando).voidOffer(id)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.NOT_ASSISTANT
          );
        });

        it("Offer already voided", async function () {
          // Void the offer first
          await offerHandler.connect(assistant).voidOffer(id);

          // Attempt to void the offer again, expecting revert
          await expect(offerHandler.connect(assistant).voidOffer(id)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.OFFER_HAS_BEEN_VOIDED
          );
        });
      });
    });

    context("👉 extendOffer()", async function () {
      context("Offers with variable voucher expiration date", async function () {
        beforeEach(async function () {
          // Create an offer
          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit);

          // id of the current offer and increment nextOfferId
          id = nextOfferId++;

          // update the values
          offerDates.validUntil = (BigInt(offerDates.validUntil) + 10000n).toString();
          offerStruct = offer.toStruct();
        });

        it("should emit an OfferExtended event", async function () {
          // Extend the valid until date, testing for the event
          await expect(offerHandler.connect(assistant).extendOffer(offer.id, offerDates.validUntil))
            .to.emit(offerHandler, "OfferExtended")
            .withArgs(id, offer.sellerId, offerDates.validUntil, await assistant.getAddress());
        });

        it("should update state", async function () {
          // Update an offer
          await offerHandler.connect(assistant).extendOffer(offer.id, offerDates.validUntil);

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
            await expect(offerHandler.connect(assistant).extendOffer(offer.id, offerDates.validUntil))
              .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
              .withArgs(PausableRegion.Offers);
          });

          it("Offer does not exist", async function () {
            // Set invalid id
            id = "444";

            // Attempt to void the offer, expecting revert
            await expect(
              offerHandler.connect(assistant).extendOffer(id, offerDates.validUntil)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_OFFER);

            // Set invalid id
            id = "0";

            // Attempt to void the offer, expecting revert
            await expect(
              offerHandler.connect(assistant).extendOffer(id, offerDates.validUntil)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_OFFER);
          });

          it("Caller is not seller", async function () {
            // caller is not the assistant of any seller
            // Attempt to update the offer, expecting revert
            await expect(offerHandler.connect(rando).extendOffer(id, offerDates.validUntil)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.NOT_ASSISTANT
            );

            // caller is an assistant of another seller
            // Create a valid seller, then set fields in tests directly
            seller = mockSeller(
              await rando.getAddress(),
              await rando.getAddress(),
              ZeroAddress,
              await rando.getAddress()
            );

            // AuthToken
            emptyAuthToken = mockAuthToken();
            expect(emptyAuthToken.isValid()).is.true;
            await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);

            // Attempt to update the offer, expecting revert
            await expect(offerHandler.connect(rando).extendOffer(id, offerDates.validUntil)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.NOT_ASSISTANT
            );
          });

          it("Offer is not extendable, since it's voided", async function () {
            // Void an offer
            await offerHandler.connect(assistant).voidOffer(id);

            // Attempt to update an offer, expecting revert
            await expect(
              offerHandler.connect(assistant).extendOffer(offer.id, offerDates.validUntil)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_HAS_BEEN_VOIDED);
          });

          it("New valid until date is lower than the existing valid until date", async function () {
            // Make the valid until date the same as the existing offer
            offerDates.validUntil = (BigInt(offerDates.validUntil) - 10000n).toString();

            await expect(
              offerHandler.connect(assistant).extendOffer(offer.id, offerDates.validUntil)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_PERIOD_INVALID);

            // Make new the valid until date less than existing one
            offerDates.validUntil = (BigInt(offerDates.validUntil) - 1n).toString();

            // Attempt to update an offer, expecting revert
            await expect(
              offerHandler.connect(assistant).extendOffer(offer.id, offerDates.validUntil)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_PERIOD_INVALID);
          });

          it("Valid until date is not in the future", async function () {
            // Set until date in the past
            offerDates.validUntil = (BigInt(offerDates.validFrom) - oneMonth * 6n).toString(); // 6 months ago

            // Attempt to update an offer, expecting revert
            await expect(
              offerHandler.connect(assistant).extendOffer(offer.id, offerDates.validUntil)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_PERIOD_INVALID);
          });
        });
      });

      context("Offers with fixed voucher expiration date", async function () {
        beforeEach(async function () {
          offerDates.voucherRedeemableUntil = (BigInt(offerDates.validUntil) + oneMonth).toString();
          offerDurations.voucherValid = "0"; // only one of voucherRedeemableUntil and voucherValid can be non zero

          // Create an offer
          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit);

          // id of the current offer and increment nextOfferId
          id = nextOfferId++;

          // update the values
          offerDates.validUntil = (BigInt(offerDates.validUntil) + 10000n).toString();
          offerStruct = offer.toStruct();
        });

        it("should emit an OfferExtended event", async function () {
          // Extend the valid until date, testing for the event
          await expect(offerHandler.connect(assistant).extendOffer(offer.id, offerDates.validUntil))
            .to.emit(offerHandler, "OfferExtended")
            .withArgs(id, offer.sellerId, offerDates.validUntil, await assistant.getAddress());
        });

        it("should update state", async function () {
          // Update an offer
          await offerHandler.connect(assistant).extendOffer(offer.id, offerDates.validUntil);

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
          it("Offer has voucherRedeemableUntil set and new valid until date is greater than that", async function () {
            // Set until date in the before offerDates.voucherRedeemableUntil
            offerDates.validUntil = BigInt(offerDates.voucherRedeemableUntil) + oneWeek.toString(); // one week after voucherRedeemableUntil

            // Attempt to update an offer, expecting revert
            await expect(
              offerHandler.connect(assistant).extendOffer(offer.id, offerDates.validUntil)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_PERIOD_INVALID);
          });
        });
      });
    });

    context("👉 updateOfferRoyaltyRecipients()", async function () {
      let newRoyaltyInfo, expectedRoyaltyInfo;
      beforeEach(async function () {
        // Create an offer
        await offerHandler
          .connect(assistant)
          .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit);

        // Register royalty recipients
        const royaltyRecipientList = new RoyaltyRecipientInfoList([
          new RoyaltyRecipientInfo(other.address, "50"),
          new RoyaltyRecipientInfo(other2.address, "50"),
          new RoyaltyRecipientInfo(rando.address, "50"),
        ]);
        // royalty recipients increment the account id in the protocol
        royaltyRecipientList.royaltyRecipientInfos.forEach(() => accountId.next());
        await accountHandler.connect(admin).addRoyaltyRecipients(seller.id, royaltyRecipientList.toStruct());

        const recipients = [other.address, other2.address, ZeroAddress, rando.address];
        const bps = ["100", "150", "500", "200"];
        newRoyaltyInfo = new RoyaltyInfo(recipients, bps);

        const expectedRecipients = [...recipients];
        expectedRecipients[2] = treasury.address;
        expectedRoyaltyInfo = new RoyaltyInfo(recipients, bps).toStruct();
      });

      it("should emit an OfferRoyaltyInfoUpdated event", async function () {
        // Update the royalty recipients, testing for the event
        await expect(offerHandler.connect(assistant).updateOfferRoyaltyRecipients(offer.id, newRoyaltyInfo))
          .to.emit(offerHandler, "OfferRoyaltyInfoUpdated")
          .withArgs(
            offer.id,
            offer.sellerId,
            compareRoyaltyInfo.bind(expectedRoyaltyInfo),
            await assistant.getAddress()
          );
      });

      it("should update state", async function () {
        // Update an offer
        await offerHandler.connect(assistant).updateOfferRoyaltyRecipients(offer.id, newRoyaltyInfo);

        // Get the offer as a struct
        [, offerStruct] = await offerHandler.connect(rando).getOffer(offer.id);

        // Parse into entity
        const returnedOffer = Offer.fromStruct(offerStruct);

        // New values should be appended to the end of offer.royaltyInfo
        offer.royaltyInfo = [new RoyaltyInfo([ZeroAddress], [voucherInitValues.royaltyPercentage]), newRoyaltyInfo];
        expect(returnedOffer).to.eql(offer);
      });

      context("💔 Revert Reasons", async function () {
        it("The offers region of protocol is paused", async function () {
          // Pause the offers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Offers]);

          // Attempt to update the offer expecting revert
          await expect(offerHandler.connect(assistant).updateOfferRoyaltyRecipients(offer.id, newRoyaltyInfo))
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Offers);
        });

        it("Offer does not exist", async function () {
          // Set invalid id
          id = "444";

          // Attempt to update the offer, expecting revert
          await expect(
            offerHandler.connect(assistant).updateOfferRoyaltyRecipients(id, newRoyaltyInfo)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_OFFER);

          // Set invalid id
          id = "0";

          // Attempt to void the offer, expecting revert
          await expect(
            offerHandler.connect(assistant).updateOfferRoyaltyRecipients(id, newRoyaltyInfo)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_OFFER);
        });

        it("Caller is not seller", async function () {
          // caller is not the assistant of any seller
          // Attempt to update the offer, expecting revert
          await expect(
            offerHandler.connect(rando).updateOfferRoyaltyRecipients(offer.id, newRoyaltyInfo)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_ASSISTANT);

          // caller is an assistant of another seller
          // Create a valid seller, then set fields in tests directly
          seller = mockSeller(
            await rando.getAddress(),
            await rando.getAddress(),
            ZeroAddress,
            await rando.getAddress()
          );

          // AuthToken
          emptyAuthToken = mockAuthToken();
          expect(emptyAuthToken.isValid()).is.true;
          await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);

          // Attempt to update the offer, expecting revert
          await expect(
            offerHandler.connect(rando).updateOfferRoyaltyRecipients(offer.id, newRoyaltyInfo)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_ASSISTANT);
        });

        it("Number of recipients and bps is different", async function () {
          // Set invalid id
          const recipients = [other.address, other2.address, ZeroAddress, rando.address];
          const bps = ["100", "150", "500"];
          newRoyaltyInfo = new RoyaltyInfo(recipients, bps);

          // Attempt to update the offer, expecting revert
          await expect(
            offerHandler.connect(assistant).updateOfferRoyaltyRecipients(id, newRoyaltyInfo)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.ARRAY_LENGTH_MISMATCH);
        });

        it("Royalty recipient is not approved", async function () {
          // Set invalid id
          const recipients = [other.address, other2.address, assistant.address, rando.address]; // assistant is not approved
          const bps = ["100", "150", "500", "100"];
          newRoyaltyInfo = new RoyaltyInfo(recipients, bps);

          // Attempt to update the offer, expecting revert
          await expect(
            offerHandler.connect(assistant).updateOfferRoyaltyRecipients(id, newRoyaltyInfo)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_ROYALTY_RECIPIENT);
        });

        it("Royalties are below the minimum", async function () {
          // Set invalid single bps
          const recipients = [other.address, other2.address, ZeroAddress, rando.address];
          const bps = ["100", "150", "500", "40"]; // 40 bps is below the minimum, set by the seller admin
          newRoyaltyInfo = new RoyaltyInfo(recipients, bps);

          // Attempt to update the offer, expecting revert
          await expect(
            offerHandler.connect(assistant).updateOfferRoyaltyRecipients(id, newRoyaltyInfo)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_ROYALTY_PERCENTAGE);
        });

        it("Total royalties are above the protocol maximum", async function () {
          // Set bps so they are over protocol minimum (10%)
          const recipients = [other.address, other2.address, ZeroAddress, rando.address];
          const bps = ["100", "150", "500", "400"];
          newRoyaltyInfo = new RoyaltyInfo(recipients, bps);

          // Attempt to update the offer, expecting revert
          await expect(
            offerHandler.connect(assistant).updateOfferRoyaltyRecipients(id, newRoyaltyInfo)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_ROYALTY_PERCENTAGE);
        });
      });
    });

    context("👉 reserveRange()", async function () {
      let firstTokenId, lastTokenId, length, range;
      let bosonVoucher;

      beforeEach(async function () {
        // Create an offer
        offer.quantityAvailable = "200";
        await offerHandler
          .connect(assistant)
          .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit);

        // id of the current offer and increment nextOfferId
        id = nextOfferId++;

        // expected address of the first clone
        const voucherCloneAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          admin.address
        );
        bosonVoucher = await getContractAt("BosonVoucher", voucherCloneAddress);

        length = 100;
        firstTokenId = 1;
        lastTokenId = firstTokenId + length - 1;
        const tokenIdStart = deriveTokenId(offer.id, firstTokenId);
        range = new Range(tokenIdStart.toString(), length.toString(), "0", "0", await assistant.getAddress());
      });

      it("should emit an RangeReserved event", async function () {
        // Reserve a range, testing for the event
        const tx = await offerHandler.connect(assistant).reserveRange(id, length, await assistant.getAddress());

        await expect(tx)
          .to.emit(offerHandler, "RangeReserved")
          .withArgs(
            id,
            offer.sellerId,
            firstTokenId,
            lastTokenId,
            await assistant.getAddress(),
            await assistant.getAddress()
          );

        await expect(tx).to.emit(bosonVoucher, "RangeReserved").withArgs(id, range.toStruct());
      });

      it("should update state", async function () {
        // Get the offer and nextExchangeId before reservation
        [, offerStruct] = await offerHandler.connect(rando).getOffer(id);
        const quantityAvailableBefore = offerStruct.quantityAvailable;
        const nextExchangeIdBefore = await exchangeHandler.getNextExchangeId();

        // Reserve a range
        await offerHandler.connect(assistant).reserveRange(id, length, await assistant.getAddress());

        // Quantity available should be updated
        [, offerStruct] = await offerHandler.connect(rando).getOffer(id);
        const quantityAvailableAfter = offerStruct.quantityAvailable;
        assert.equal(quantityAvailableBefore - quantityAvailableAfter, length, "Quantity available mismatch");

        // nextExchangeId should be updated
        const nextExchangeIdAfter = await exchangeHandler.getNextExchangeId();
        assert.equal(nextExchangeIdAfter - nextExchangeIdBefore, length, "nextExchangeId mismatch");

        // Get range object from the voucher contract
        const returnedRange = Range.fromStruct(await bosonVoucher.getRangeByOfferId(id));
        assert.equal(returnedRange.toString(), range.toString(), "Range mismatch");
      });

      it("it's possible to reserve range even if somebody already committed to", async function () {
        // Deposit seller funds so the commit will succeed
        const sellerPool = BigInt(offer.sellerDeposit) * 2n;
        await fundsHandler.connect(assistant).depositFunds(seller.id, ZeroAddress, sellerPool, { value: sellerPool });

        // Commit to the offer twice
        await exchangeHandler.connect(rando).commitToOffer(await rando.getAddress(), id, { value: price });
        await exchangeHandler.connect(rando).commitToOffer(await rando.getAddress(), id, { value: price });

        // Reserve a range, testing for the event
        await expect(offerHandler.connect(assistant).reserveRange(id, length, await assistant.getAddress()))
          .to.emit(offerHandler, "RangeReserved")
          .withArgs(
            id,
            offer.sellerId,
            firstTokenId + 2,
            lastTokenId + 2,
            await assistant.getAddress(),
            await assistant.getAddress()
          );
      });

      it("It's possible to reserve a range with maximum allowed length", async function () {
        // Create an unlimited offer
        offer.quantityAvailable = MaxUint256.toString();
        await offerHandler
          .connect(assistant)
          .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit);

        // Set maximum allowed length
        length = 2n ** 64n - 1n;
        await expect(
          offerHandler.connect(assistant).reserveRange(nextOfferId, length, await assistant.getAddress())
        ).to.emit(offerHandler, "RangeReserved");
      });

      it("Reserving range of unlimited offer does not decrease quantity available", async function () {
        // Create an unlimited offer
        offer.quantityAvailable = MaxUint256.toString();
        await offerHandler
          .connect(assistant)
          .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit);

        // Get the offer quantity available before reservation
        [, offerStruct] = await offerHandler.connect(rando).getOffer(nextOfferId);
        const quantityAvailableBefore = offerStruct.quantityAvailable;

        // Reserve a range
        await offerHandler.connect(assistant).reserveRange(nextOfferId, length, await assistant.getAddress());

        // Quantity available should not change
        [, offerStruct] = await offerHandler.connect(rando).getOffer(nextOfferId);
        const quantityAvailableAfter = offerStruct.quantityAvailable;
        assert.equal(
          quantityAvailableBefore.toString(),
          quantityAvailableAfter.toString(),
          "Quantity available mismatch"
        );
      });

      context("Owner range is contract", async function () {
        beforeEach(async function () {
          range.owner = await bosonVoucher.getAddress();
        });

        it("should emit an RangeReserved event", async function () {
          // Reserve a range, testing for the event
          const tx = await offerHandler.connect(assistant).reserveRange(id, length, await bosonVoucher.getAddress());

          await expect(tx)
            .to.emit(offerHandler, "RangeReserved")
            .withArgs(
              id,
              offer.sellerId,
              firstTokenId,
              lastTokenId,
              await bosonVoucher.getAddress(),
              await assistant.getAddress()
            );

          await expect(tx).to.emit(bosonVoucher, "RangeReserved").withArgs(id, range.toStruct());
        });

        it("should update state", async function () {
          // Get the offer and nextExchangeId before reservation
          [, offerStruct] = await offerHandler.connect(rando).getOffer(id);
          const quantityAvailableBefore = offerStruct.quantityAvailable;
          const nextExchangeIdBefore = await exchangeHandler.getNextExchangeId();

          // Reserve a range
          await offerHandler.connect(assistant).reserveRange(id, length, await bosonVoucher.getAddress());

          // Quantity available should be updated
          [, offerStruct] = await offerHandler.connect(rando).getOffer(id);
          const quantityAvailableAfter = offerStruct.quantityAvailable;
          assert.equal(quantityAvailableBefore - quantityAvailableAfter, length, "Quantity available mismatch");

          // nextExchangeId should be updated
          const nextExchangeIdAfter = await exchangeHandler.getNextExchangeId();
          assert.equal(nextExchangeIdAfter - nextExchangeIdBefore, length, "nextExchangeId mismatch");

          // Get range object from the voucher contract
          const returnedRange = Range.fromStruct(await bosonVoucher.getRangeByOfferId(id));
          assert.equal(returnedRange.toString(), range.toString(), "Range mismatch");
        });
      });

      context("💔 Revert Reasons", async function () {
        it("The offers region of protocol is paused", async function () {
          // Pause the offers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Offers]);

          // Attempt to reserve a range, expecting revert
          await expect(offerHandler.connect(assistant).reserveRange(id, length, await assistant.getAddress()))
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Offers);
        });

        it("The exchanges region of protocol is paused", async function () {
          // Pause the exchanges region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Exchanges]);

          // Attempt to reserve a range, expecting revert
          await expect(offerHandler.connect(assistant).reserveRange(id, length, await assistant.getAddress()))
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Exchanges);
        });

        it("Offer does not exist", async function () {
          // Set invalid id
          id = "444";

          // Attempt to reserve a range, expecting revert
          await expect(
            offerHandler.connect(assistant).reserveRange(id, length, await assistant.getAddress())
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_OFFER);

          // Set invalid id
          id = "0";

          // Attempt to reserve a range, expecting revert
          await expect(
            offerHandler.connect(assistant).reserveRange(id, length, await assistant.getAddress())
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_OFFER);
        });

        it("Offer already voided", async function () {
          // Void the offer first
          await offerHandler.connect(assistant).voidOffer(id);

          // Attempt to reserve a range, expecting revert
          await expect(
            offerHandler.connect(assistant).reserveRange(id, length, await assistant.getAddress())
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_HAS_BEEN_VOIDED);
        });

        it("Caller is not seller", async function () {
          // caller is not the assistant of any seller
          // Attempt to reserve a range, expecting revert
          await expect(
            offerHandler.connect(rando).reserveRange(id, length, await assistant.getAddress())
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_ASSISTANT);

          // caller is an assistant of another seller
          // Create a valid seller, then set fields in tests directly
          seller = mockSeller(
            await rando.getAddress(),
            await rando.getAddress(),
            ZeroAddress,
            await rando.getAddress()
          );

          // AuthToken
          emptyAuthToken = mockAuthToken();
          expect(emptyAuthToken.isValid()).is.true;
          await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);

          // Attempt to reserve a range, expecting revert
          await expect(
            offerHandler.connect(rando).reserveRange(id, length, await assistant.getAddress())
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_ASSISTANT);
        });

        it("Range length is zero", async function () {
          // Set length to zero
          length = 0;

          // Attempt to reserve a range, expecting revert
          await expect(
            offerHandler.connect(assistant).reserveRange(id, length, await assistant.getAddress())
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_RANGE_LENGTH);
        });

        it("Range length is greater than quantity available", async function () {
          // Set length to zero
          length = Number(offer.quantityAvailable) + 1;

          // Attempt to reserve a range, expecting revert
          await expect(
            offerHandler.connect(assistant).reserveRange(id, length, await assistant.getAddress())
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_RANGE_LENGTH);
        });

        it("Range length is greater than maximum allowed range length", async function () {
          // Create an unlimited offer
          offer.quantityAvailable = MaxUint256.toString();
          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit);

          // Set length to more than maximum allowed range length
          length = 2n ** 64n;

          // Attempt to reserve a range, expecting revert
          await expect(
            offerHandler.connect(assistant).reserveRange(nextOfferId, length, await assistant.getAddress())
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_RANGE_LENGTH);
        });

        it("Call to BosonVoucher.reserveRange() reverts", async function () {
          // Reserve a range
          await offerHandler.connect(assistant).reserveRange(id, length, await assistant.getAddress());

          // Attempt to reserve the same range again, expecting revert
          await expect(
            offerHandler.connect(assistant).reserveRange(id, length, await assistant.getAddress())
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_RANGE_ALREADY_RESERVED);
        });

        it("_to address isn't contract address or contract owner address", async function () {
          // Try to reserve range for rando address, it should fail
          await expect(
            offerHandler.connect(assistant).reserveRange(id, length, await rando.getAddress())
          ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_TO_ADDRESS);
        });
      });
    });

    context("👉 getOffer()", async function () {
      beforeEach(async function () {
        // Create an offer
        await offerHandler
          .connect(assistant)
          .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit);

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
        await offerHandler
          .connect(assistant)
          .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit);

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
        await offerHandler
          .connect(assistant)
          .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit);

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
        await offerHandler
          .connect(assistant)
          .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit);

        // id of the current offer and increment nextOfferId
        id = nextOfferId++;
      });

      it("should return true for exists if offer is found, regardless of voided status", async function () {
        // Get the exists flag
        [exists] = await offerHandler.connect(rando).isOfferVoided(id);

        // Validate
        expect(exists).to.be.true;

        // Void offer
        await offerHandler.connect(assistant).voidOffer(id);

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
    let offerFeeLimits = [];

    // Make empty seller list, so every seller is allowed
    sellerAllowList = [];

    beforeEach(async function () {
      agentId = "0";
      agentIds = [];

      // create a seller
      // Required constructor params
      id = sellerId = nextAccountId = "1"; // argument sent to contract for createSeller will be ignored

      // Create a valid seller, then set fields in tests directly
      seller = mockSeller(
        await assistant.getAddress(),
        await admin.getAddress(),
        clerk.address,
        await treasury.getAddress()
      );
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
        await assistantDR.getAddress(),
        await adminDR.getAddress(),
        clerkDR.address,
        await treasuryDR.getAddress(),
        true
      );
      expect(disputeResolver.isValid()).is.true;

      // Make empty seller list, so every seller is allowed
      sellerAllowList = [];

      //Create DisputeResolverFee array so offer creation will succeed
      DRFeeNative = "0";
      DRFeeToken = "0";
      disputeResolverFees = [
        new DisputeResolverFee(ZeroAddress, "Native", DRFeeNative),
        new DisputeResolverFee(await bosonToken.getAddress(), "Boson", DRFeeToken),
      ];

      // Register the dispute resolver
      await accountHandler
        .connect(adminDR)
        .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

      // Necessary to cover all offers resolution periods
      await configHandler.setMaxResolutionPeriod(oneWeek * 5n);

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
        ({ offer, offerDates, offerDurations, offerFees } = await mockOffer());

        // Set unique offer properties based on index
        offer.id = `${i + 1}`;
        offer.price = parseUnits(`${1.5 + i * 1}`, "ether").toString();
        offer.sellerDeposit = parseUnits(`${0.25 + i * 0.1}`, "ether").toString();
        offer.buyerCancelPenalty = parseUnits(`${0.05 + i * 0.1}`, "ether").toString();
        offer.quantityAvailable = `${(i + 1) * 2}`;

        let now = offerDates.validFrom;
        offerDates.validFrom = validFrom = (BigInt(now) + oneMonth * BigInt(i)).toString();
        offerDates.validUntil = validUntil = (BigInt(now) + oneMonth * 6n * BigInt(i + 1)).toString();

        offerDurations.disputePeriod = disputePeriod = `${BigInt(i + 1) * oneMonth}`;
        offerDurations.voucherValid = voucherValid = `${BigInt(i + 1) * oneMonth}`;
        offerDurations.resolutionPeriod = resolutionPeriod = `${BigInt(i + 1) * oneWeek}`;

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

        disputeResolverIds.push(disputeResolver.id);
        const disputeResolutionTerms = new DisputeResolutionTerms(
          disputeResolver.id,
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
      offers[2].exchangeToken = await bosonToken.getAddress();
      offerFeesList[2].protocolFee = protocolFeeFlatBoson;
      offerFeesStructs[2] = offerFeesList[2].toStruct();
      offers[2].quantityAvailable = MaxUint256.toString();
      offerStructs[2] = offers[2].toStruct();
      disputeResolutionTermsList[2] = new DisputeResolutionTerms(
        disputeResolver.id,
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

      // offer with royalty recipients
      const royaltyRecipientList = new RoyaltyRecipientInfoList([
        new RoyaltyRecipientInfo(other.address, "50"),
        new RoyaltyRecipientInfo(other2.address, "50"),
      ]);
      // royalty recipients increment the account id in the protocol
      accountId.next();
      accountId.next();

      await accountHandler.connect(admin).addRoyaltyRecipients(seller.id, royaltyRecipientList.toStruct());
      offers[3].royaltyInfo = [new RoyaltyInfo([other.address, ZeroAddress], ["150", "10"])];
      offerStructs[3] = offers[3].toStruct();

      // make offers without limits
      offerFeeLimits = new Array(5).fill(MaxUint256);
    });

    afterEach(async () => {
      // Reset the accountId iterator
      accountId.next(true);
    });

    context("👉 createOfferBatch()", async function () {
      it("should emit an OfferCreated events for all offers", async function () {
        // Create an offer, testing for the event
        const tx = await offerHandler
          .connect(assistant)
          .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds, offerFeeLimits);

        await expect(tx)
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            "1",
            offer.sellerId,
            compareOfferStructs.bind(offerStructs[0]),
            offerDatesStructs[0],
            offerDurationsStructs[0],
            disputeResolutionTermsStructs[0],
            offerFeesStructs[0],
            agentIds[0],
            await assistant.getAddress()
          );

        await expect(tx)
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            "2",
            offer.sellerId,
            compareOfferStructs.bind(offerStructs[1]),
            offerDatesStructs[1],
            offerDurationsStructs[1],
            disputeResolutionTermsStructs[1],
            offerFeesStructs[1],
            agentIds[1],
            await assistant.getAddress()
          );

        await expect(tx)
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            "3",
            offer.sellerId,
            compareOfferStructs.bind(offerStructs[2]),
            offerDatesStructs[2],
            offerDurationsStructs[2],
            disputeResolutionTermsStructs[2],
            offerFeesStructs[2],
            agentIds[2],
            await assistant.getAddress()
          );

        await expect(tx)
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            "4",
            offer.sellerId,
            compareOfferStructs.bind(offerStructs[3]),
            offerDatesStructs[3],
            offerDurationsStructs[3],
            disputeResolutionTermsStructs[3],
            offerFeesStructs[3],
            agentIds[3],
            await assistant.getAddress()
          );

        await expect(tx)
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            "5",
            offer.sellerId,
            compareOfferStructs.bind(offerStructs[4]),
            offerDatesStructs[4],
            offerDurationsStructs[4],
            disputeResolutionTermsStructs[4],
            offerFeesStructs[4],
            agentIds[4],
            await assistant.getAddress()
          );
      });

      it("should emit an OfferCreated event for all offers, one of which has offer type = discovery and the price is not set to zero", async function () {
        // Set offer type to discovery
        offers[2].priceType = PriceType.Discovery;

        // Attempt to Create an offer, expecting revert
        await expect(
          offerHandler
            .connect(assistant)
            .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds, offerFeeLimits)
        ).to.emit(offerHandler, "OfferCreated");
      });

      it("should update state", async function () {
        // Create an offers
        await offerHandler
          .connect(assistant)
          .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds, offerFeeLimits);

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

          [exists, returnedAgentId] = await offerHandler.getAgentIdByOffer(`${i + 1}`);
          expect(exists).to.be.false; // offer is without agent
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
          .connect(assistant)
          .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds, offerFeeLimits);

        await expect(tx)
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            "1",
            offer.sellerId,
            compareOfferStructs.bind(offerStructs[0]),
            offerDatesStructs[0],
            offerDurationsStructs[0],
            disputeResolutionTermsStructs[0],
            offerFeesStructs[0],
            agentIds[0],
            await assistant.getAddress()
          );

        await expect(tx)
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            "2",
            offer.sellerId,
            compareOfferStructs.bind(offerStructs[1]),
            offerDatesStructs[1],
            offerDurationsStructs[1],
            disputeResolutionTermsStructs[1],
            offerFeesStructs[1],
            agentIds[1],
            await assistant.getAddress()
          );

        await expect(tx)
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            "3",
            offer.sellerId,
            compareOfferStructs.bind(offerStructs[2]),
            offerDatesStructs[2],
            offerDurationsStructs[2],
            disputeResolutionTermsStructs[2],
            offerFeesStructs[2],
            agentIds[2],
            await assistant.getAddress()
          );

        await expect(tx)
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            "4",
            offer.sellerId,
            compareOfferStructs.bind(offerStructs[3]),
            offerDatesStructs[3],
            offerDurationsStructs[3],
            disputeResolutionTermsStructs[3],
            offerFeesStructs[3],
            agentIds[3],
            await assistant.getAddress()
          );

        await expect(tx)
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            "5",
            offer.sellerId,
            compareOfferStructs.bind(offerStructs[4]),
            offerDatesStructs[4],
            offerDurationsStructs[4],
            disputeResolutionTermsStructs[4],
            offerFeesStructs[4],
            agentIds[4],
            await assistant.getAddress()
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
          .connect(assistant)
          .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds, offerFeeLimits);

        await expect(tx)
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            "1",
            sellerId,
            compareOfferStructs.bind(offerStructs[0]),
            offerDatesStructs[0],
            offerDurationsStructs[0],
            disputeResolutionTermsStructs[0],
            offerFeesStructs[0],
            agentIds[0],
            await assistant.getAddress()
          );

        await expect(tx)
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            "2",
            sellerId,
            compareOfferStructs.bind(offerStructs[1]),
            offerDatesStructs[1],
            offerDurationsStructs[1],
            disputeResolutionTermsStructs[1],
            offerFeesStructs[1],
            agentIds[1],
            await assistant.getAddress()
          );

        await expect(tx)
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            "3",
            sellerId,
            compareOfferStructs.bind(offerStructs[2]),
            offerDatesStructs[2],
            offerDurationsStructs[2],
            disputeResolutionTermsStructs[2],
            offerFeesStructs[2],
            agentIds[2],
            await assistant.getAddress()
          );

        await expect(tx)
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            "4",
            sellerId,
            compareOfferStructs.bind(offerStructs[3]),
            offerDatesStructs[3],
            offerDurationsStructs[3],
            disputeResolutionTermsStructs[3],
            offerFeesStructs[3],
            agentIds[3],
            await assistant.getAddress()
          );

        await expect(tx)
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            "5",
            sellerId,
            compareOfferStructs.bind(offerStructs[4]),
            offerDatesStructs[4],
            offerDurationsStructs[4],
            disputeResolutionTermsStructs[4],
            offerFeesStructs[4],
            agentIds[4],
            await assistant.getAddress()
          );
      });

      it("Should allow creation of an offer if DR has a sellerAllowList and seller is on it", async function () {
        // Create new seller so sellerAllowList can have an entry
        seller = mockSeller(await rando.getAddress(), await rando.getAddress(), ZeroAddress, await rando.getAddress());

        await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);

        allowedSellersToAdd = [seller.id];
        await accountHandler.connect(adminDR).addSellersToAllowList(disputeResolver.id, allowedSellersToAdd);

        // Attempt to Create an offer, expecting revert
        await expect(
          offerHandler
            .connect(assistant)
            .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds, offerFeeLimits)
        ).to.revertedWithCustomError(bosonErrors, RevertReasons.SELLER_NOT_APPROVED);

        // add seller to allow list
        allowedSellersToAdd = ["1"];
        await accountHandler.connect(adminDR).addSellersToAllowList(disputeResolver.id, allowedSellersToAdd);

        // Create an offer, testing for the event
        await expect(
          offerHandler
            .connect(assistant)
            .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds, offerFeeLimits)
        ).to.emit(offerHandler, "OfferCreated");
      });

      context("💔 Revert Reasons", async function () {
        it("The offers region of protocol is paused", async function () {
          // Pause the offers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Offers]);

          // Attempt to create offer batch, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Offers);
        });

        it("Caller not assistant of any seller", async function () {
          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(rando)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_ASSISTANT);
        });

        it("Valid from date is greater than valid until date in some offer", async function () {
          // Reverse the from and until dates
          offerDatesList[4].validFrom = (BigInt(Date.now()) + oneMonth * 6n).toString(); // 6 months from now
          offerDatesList[4].validUntil = BigInt(Date.now()).toString(); // now

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Valid until date is not in the future in some offer", async function () {
          let now = offerDatesList[0].validFrom;

          // set validFrom date in the past
          offerDatesList[0].validFrom = (BigInt(now) - oneMonth * 6n).toString(); // 6 months ago

          // set valid until > valid from
          offerDatesList[0].validUntil = (BigInt(now) - oneMonth).toString(); // 1 month ago

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Buyer cancel penalty is greater than price", async function () {
          // Set buyer cancel penalty higher than offer price
          offers[0].buyerCancelPenalty = (BigInt(offers[0].price) + 10n).toString();

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_PENALTY_INVALID);
        });

        it("No offer cannot be voided at the time of the creation", async function () {
          // Set voided flag to true
          offers[1].voided = true;

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_MUST_BE_ACTIVE);
        });

        it("Dispute valid duration is 0 for some offer", async function () {
          // Set dispute valid duration to 0
          offerDurationsList[2].resolutionPeriod = "0";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_RESOLUTION_PERIOD);
        });

        it("For some offer, both voucher expiration date and voucher expiration period are defined", async function () {
          // Set both voucherRedeemableUntil and voucherValid
          offerDatesList[2].voucherRedeemableUntil =
            BigInt(offerDatesList[2].voucherRedeemableFrom) + oneMonth.toString();
          offerDurationsList[2].voucherValid = oneMonth.toString();

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.AMBIGUOUS_VOUCHER_EXPIRY);
        });

        it("For some offer, neither of voucher expiration date and voucher expiration period are defined", async function () {
          // Set both voucherRedeemableUntil and voucherValid to "0"
          offerDatesList[1].voucherRedeemableUntil = "0";
          offerDurationsList[1].voucherValid = "0";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.AMBIGUOUS_VOUCHER_EXPIRY);
        });

        it("For some offer, voucher redeemable period is fixed, but it ends before it starts", async function () {
          // Set both voucherRedeemableUntil that is less than voucherRedeemableFrom
          offerDatesList[0].voucherRedeemableUntil = (BigInt(offerDatesList[0].voucherRedeemableFrom) - 10n).toString();
          offerDurationsList[0].voucherValid = "0";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.REDEMPTION_PERIOD_INVALID);
        });

        it("For some offer, voucher redeemable period is fixed, but it ends before offer expires", async function () {
          // Set both voucherRedeemableUntil that is more than voucherRedeemableFrom but less than validUntil
          offerDatesList[2].voucherRedeemableFrom = "0";
          offerDatesList[2].voucherRedeemableUntil = (Number(offerDatesList[2].validUntil) - 10).toString();
          offerDurationsList[2].voucherValid = "0";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.REDEMPTION_PERIOD_INVALID);
        });

        it("For some offer, Dispute period is less than minimum dispute period", async function () {
          // Set dispute period to less than minDisputePeriod (oneWeek)
          offerDurationsList[1].disputePeriod = BigInt(oneWeek - 1000n).toString();

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_DISPUTE_PERIOD);
        });

        it("For some offer, resolution period is less than minimum dispute period", async function () {
          // Set resolution duration period to less than minResolutionPeriod (oneWeek)
          offerDurationsList[0].resolutionPeriod = (oneWeek - 10n).toString();

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_RESOLUTION_PERIOD);
        });

        it("For some offer, available quantity is set to zero", async function () {
          // Set available quantity to 0
          offers[2].quantityAvailable = "0";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_QUANTITY_AVAILABLE);
        });

        it("For some offer, dispute resolver wallet is not registered", async function () {
          // Set some address that is not registered as a dispute resolver
          disputeResolverIds[1] = "16";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        // TODO - revisit when account deactivations are supported
        it.skip("For some offer, dispute resolver is not active", async function () {
          // create another dispute resolver, but don't activate it
          disputeResolver = mockDisputeResolver(
            await rando.getAddress(),
            await rando.getAddress(),
            ZeroAddress,
            await rando.getAddress(),
            false
          );
          await accountHandler
            .connect(rando)
            .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

          // Set some address that is not registered as a dispute resolver
          disputeResolverIds[2] = ++nextAccountId;

          // Attempt to Create offers, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_DISPUTE_RESOLVER);

          // after activation it should be possible to create the offer
          await accountHandler.connect(deployer).activateDisputeResolver(nextAccountId);

          // Create offers, test event
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.emit(offerHandler, "OfferCreated");
        });

        it("For some absolute zero offer, specified dispute resolver is not registered", async function () {
          // Prepare an absolute zero offer, but specify dispute resolver
          offers[2].price = offers[2].sellerDeposit = offers[2].buyerCancelPenalty = "0";
          disputeResolverIds[2] = "16";

          // Attempt to Create offers, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        // TODO - revisit when account deactivations are supported
        it.skip("For some absolute zero offer, specified dispute resolver is not active", async function () {
          // create another dispute resolver, but don't activate it
          disputeResolver = mockDisputeResolver(
            await rando.getAddress(),
            await rando.getAddress(),
            ZeroAddress,
            await rando.getAddress(),
            false
          );
          await accountHandler
            .connect(rando)
            .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

          // Prepare an absolute zero offer, but specify dispute resolver
          offers[1].price = offers[1].sellerDeposit = offers[1].buyerCancelPenalty = "0";
          disputeResolverIds[1] = ++nextAccountId;

          // Attempt to Create offers, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_DISPUTE_RESOLVER);

          // after activation it should be possible to create the offer
          await accountHandler.connect(deployer).activateDisputeResolver(nextAccountId);

          // Create offers, test event
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.emit(offerHandler, "OfferCreated");
        });

        it("For some offer seller is not on dispute resolver's seller allow list", async function () {
          // Create new seller so sellerAllowList can have an entry
          seller = mockSeller(
            await rando.getAddress(),
            await rando.getAddress(),
            ZeroAddress,
            await rando.getAddress()
          );

          await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);

          allowedSellersToAdd = [seller.id];
          await accountHandler.connect(adminDR).addSellersToAllowList(disputeResolver.id, allowedSellersToAdd);

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.SELLER_NOT_APPROVED);
        });

        it("For some offer, dispute resolver does not accept fees in the exchange token", async function () {
          // Set some address that is not part of dispute resolver fees
          offers[3].exchangeToken = await rando.getAddress();

          // Attempt to Create offers, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.DR_UNSUPPORTED_FEE);
        });

        it("Number of dispute dates does not match the number of offers", async function () {
          // Make dispute dates longer
          offerDatesList.push(new OfferDates(validFrom, validUntil, voucherRedeemableFrom, voucherRedeemableUntil));

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.ARRAY_LENGTH_MISMATCH);

          // Make dispute dates shorter
          offerDatesList = offerDatesList.slice(0, -2);

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.ARRAY_LENGTH_MISMATCH);
        });

        it("Number of dispute durations does not match the number of offers", async function () {
          // Make dispute durations longer
          offerDurationsList.push(new OfferDurations(disputePeriod, voucherValid, resolutionPeriod));

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.ARRAY_LENGTH_MISMATCH);

          // Make dispute durations shorter
          offerDurationsList = offerDurationsList.slice(0, -2);

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.ARRAY_LENGTH_MISMATCH);
        });

        it("Number of dispute resolvers does not match the number of offers", async function () {
          // Make dispute durations longer
          disputeResolverIds.push(disputeResolver.id);

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.ARRAY_LENGTH_MISMATCH);

          // Make dispute durations shorter
          disputeResolverIds = disputeResolverIds.slice(0, -2);

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.ARRAY_LENGTH_MISMATCH);
        });

        it("Number of agents does not match the number of offers", async function () {
          // Make agentids  longer
          agentIds.push(agentId);

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.ARRAY_LENGTH_MISMATCH);

          // Make agentIds shorter
          agentIds = agentIds.slice(0, -2);

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.ARRAY_LENGTH_MISMATCH);
        });

        it("Number of offer fee limits does not match the number of offers", async function () {
          // Make offer fee limits longer
          offerFeeLimits.push(MaxUint256);

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.ARRAY_LENGTH_MISMATCH);

          // Make offer fee limits shorter
          offerFeeLimits = offerFeeLimits.slice(0, -2);

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.ARRAY_LENGTH_MISMATCH);
        });

        it("For some offer, collection does not exist", async function () {
          // Set non existent collection index
          offers[3].collectionIndex = "1";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_COLLECTION);

          // Create a new collection
          const externalId = "Brand1";
          voucherInitValues.collectionSalt = encodeBytes32String(externalId);
          await accountHandler.connect(assistant).createNewCollection(externalId, voucherInitValues);

          // Index "1" exists now, but "2" does not
          offers[3].collectionIndex = "2";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_COLLECTION);
        });

        it("Royalty recipient is not on seller's allow list", async function () {
          // Add royalty info to the offer
          offers[3].royaltyInfo = [new RoyaltyInfo([other.address, rando.address], ["150", "10"])];

          // Create an offer testing for the event
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_ROYALTY_RECIPIENT);
        });

        it("Royalty percentage is less than the value decided by the admin", async function () {
          // Add royalty info to the offer
          offers[3].royaltyInfo = [new RoyaltyInfo([other.address, other2.address], ["40", "250"])];

          // Create an offer testing for the event
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_ROYALTY_PERCENTAGE);
        });

        it("Total royalty percentage is more than max royalty percentage", async function () {
          // Add royalty info to the offer
          offers[3].royaltyInfo = [new RoyaltyInfo([other.address, other2.address], ["5000", "4000"])];

          // Create an offer testing for the event
          await expect(
            offerHandler
              .connect(assistant)
              .createOfferBatch(
                offers,
                offerDatesList,
                offerDurationsList,
                disputeResolverIds,
                agentIds,
                offerFeeLimits
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_ROYALTY_PERCENTAGE);
        });
      });

      context("When offers have non zero agent ids", async function () {
        beforeEach(async function () {
          nonZeroAgentIds = [];
          offerFeesList = [];
          offerFeesStructs = [];

          // Create an agent: Required constructor params
          agent = mockAgent(await other.getAddress());
          agentId = agent.id;
          expect(agent.isValid()).is.true;
          // Create a valid agent
          await accountHandler.connect(rando).createAgent(agent);

          for (let i = 0; i < 5; i++) {
            // Set updated agent ids
            nonZeroAgentIds.push(agentId);

            // Set updated offerFees
            let protocolFee;
            if (offers[i].exchangeToken == (await bosonToken.getAddress())) {
              protocolFee = protocolFeeFlatBoson;
            } else {
              protocolFee = applyPercentage(offers[i].price, protocolFeePercentage);
            }
            let agentFee = ((BigInt(offers[i].price) * BigInt(agent.feePercentage)) / 10000n).toString();
            offerFees = new OfferFees(protocolFee, agentFee);

            offerFeesList.push(offerFees);
            offerFeesStructs.push(offerFees.toStruct());
          }
        });

        it("should emit an OfferCreated events for all offers with updated agent ids", async function () {
          // Create an offer, testing for the event
          const tx = await offerHandler
            .connect(assistant)
            .createOfferBatch(
              offers,
              offerDatesList,
              offerDurationsList,
              disputeResolverIds,
              nonZeroAgentIds,
              offerFeeLimits
            );

          await expect(tx)
            .to.emit(offerHandler, "OfferCreated")
            .withArgs(
              "1",
              offer.sellerId,
              compareOfferStructs.bind(offerStructs[0]),
              offerDatesStructs[0],
              offerDurationsStructs[0],
              disputeResolutionTermsStructs[0],
              offerFeesStructs[0],
              nonZeroAgentIds[0],
              await assistant.getAddress()
            );

          await expect(tx)
            .to.emit(offerHandler, "OfferCreated")
            .withArgs(
              "2",
              offer.sellerId,
              compareOfferStructs.bind(offerStructs[1]),
              offerDatesStructs[1],
              offerDurationsStructs[1],
              disputeResolutionTermsStructs[1],
              offerFeesStructs[1],
              nonZeroAgentIds[1],
              await assistant.getAddress()
            );

          await expect(tx)
            .to.emit(offerHandler, "OfferCreated")
            .withArgs(
              "3",
              offer.sellerId,
              compareOfferStructs.bind(offerStructs[2]),
              offerDatesStructs[2],
              offerDurationsStructs[2],
              disputeResolutionTermsStructs[2],
              offerFeesStructs[2],
              nonZeroAgentIds[2],
              await assistant.getAddress()
            );

          await expect(tx)
            .to.emit(offerHandler, "OfferCreated")
            .withArgs(
              "4",
              offer.sellerId,
              compareOfferStructs.bind(offerStructs[3]),
              offerDatesStructs[3],
              offerDurationsStructs[3],
              disputeResolutionTermsStructs[3],
              offerFeesStructs[3],
              nonZeroAgentIds[3],
              await assistant.getAddress()
            );

          await expect(tx)
            .to.emit(offerHandler, "OfferCreated")
            .withArgs(
              "5",
              offer.sellerId,
              compareOfferStructs.bind(offerStructs[4]),
              offerDatesStructs[4],
              offerDurationsStructs[4],
              disputeResolutionTermsStructs[4],
              offerFeesStructs[4],
              nonZeroAgentIds[4],
              await assistant.getAddress()
            );
        });

        it("all offer should have an agent assigned", async function () {
          // Create an offer
          await offerHandler
            .connect(assistant)
            .createOfferBatch(
              offers,
              offerDatesList,
              offerDurationsList,
              disputeResolverIds,
              nonZeroAgentIds,
              offerFeeLimits
            );

          for (let i = 1; i < 6; i++) {
            // Check that mapping between agent and offer is correct
            [exists, returnedAgentId] = await offerHandler.getAgentIdByOffer(i);
            expect(exists).to.be.true;
            expect(returnedAgentId).to.eq(agentId, "agent id mismatch");
          }
        });

        context("💔 Revert Reasons", async function () {
          it("Agent does not exist", async function () {
            // Set an agent id that does not exist
            nonZeroAgentIds[1] = "16";

            // Attempt to Create an offer, expecting revert
            await expect(
              offerHandler
                .connect(assistant)
                .createOfferBatch(
                  offers,
                  offerDatesList,
                  offerDurationsList,
                  disputeResolverIds,
                  nonZeroAgentIds,
                  offerFeeLimits
                )
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_AGENT);
          });

          it("Sum of agent fee amount and protocol fee amount should be <= than the protocol wide offer fee limit", async function () {
            // Create new agent
            agent = mockAgent(await assistant.getAddress());
            agent.feePercentage = "3000"; // 30%
            expect(agent.isValid()).is.true;

            // Create an agent
            await accountHandler.connect(rando).createAgent(agent);

            //Change protocol fee after creating agent
            await configHandler.connect(deployer).setProtocolFeePercentage("1100"); //11%

            nonZeroAgentIds[1] = agent.id;

            // Attempt to Create an offer, expecting revert
            await expect(
              offerHandler
                .connect(assistant)
                .createOfferBatch(
                  offers,
                  offerDatesList,
                  offerDurationsList,
                  disputeResolverIds,
                  nonZeroAgentIds,
                  offerFeeLimits
                )
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.AGENT_FEE_AMOUNT_TOO_HIGH);
          });

          it("Sum of agent fee amount and protocol fee amount should be <= than the seller defined offer fee limit", async function () {
            // Set fee limit below the sum of agent fee and protocol fee
            offerFeeLimits[2] = BigInt(agent.feePercentage) + BigInt(offerFeesList[2].protocolFee) - 1n;

            // Attempt to Create an offer, expecting revert
            await expect(
              offerHandler
                .connect(assistant)
                .createOfferBatch(
                  offers,
                  offerDatesList,
                  offerDurationsList,
                  disputeResolverIds,
                  nonZeroAgentIds,
                  offerFeeLimits
                )
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.TOTAL_FEE_EXCEEDS_LIMIT);
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
          .connect(assistant)
          .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds, offerFeeLimits);

        offersToVoid = ["1", "3", "5"];
      });

      it("should emit OfferVoided events", async function () {
        [, offerStruct] = await offerHandler.getOffer(offersToVoid[0]);
        // call getOffer with offerId to check the seller id in the event

        // Void offers, testing for the event
        const tx = await offerHandler.connect(assistant).voidOfferBatch(offersToVoid);
        await expect(tx)
          .to.emit(offerHandler, "OfferVoided")
          .withArgs(offersToVoid[0], offerStruct.sellerId, await assistant.getAddress());

        await expect(tx)
          .to.emit(offerHandler, "OfferVoided")
          .withArgs(offersToVoid[1], offerStruct.sellerId, await assistant.getAddress());

        await expect(tx)
          .to.emit(offerHandler, "OfferVoided")
          .withArgs(offersToVoid[2], offerStruct.sellerId, await assistant.getAddress());
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
        await offerHandler.connect(assistant).voidOfferBatch(offersToVoid);

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
          await expect(offerHandler.connect(assistant).voidOfferBatch(offersToVoid))
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Offers);
        });

        it("Offer does not exist", async function () {
          // Set invalid id
          offersToVoid = ["1", "432", "2"];

          // Attempt to void the offer, expecting revert
          await expect(offerHandler.connect(assistant).voidOfferBatch(offersToVoid)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.NO_SUCH_OFFER
          );

          // Set invalid id
          offersToVoid = ["1", "2", "0"];

          // Attempt to void the offer, expecting revert
          await expect(offerHandler.connect(assistant).voidOfferBatch(offersToVoid)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.NO_SUCH_OFFER
          );
        });

        it("Caller is not seller", async function () {
          // caller is not the assistant of any seller
          // Attempt to update the offer, expecting revert
          await expect(offerHandler.connect(rando).voidOfferBatch(offersToVoid)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.NOT_ASSISTANT
          );

          // caller is an assistant of another seller
          seller = mockSeller(
            await rando.getAddress(),
            await rando.getAddress(),
            ZeroAddress,
            await rando.getAddress()
          );

          // AuthToken
          emptyAuthToken = mockAuthToken();
          expect(emptyAuthToken.isValid()).is.true;

          await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);

          // Attempt to update the offer, expecting revert
          await expect(offerHandler.connect(rando).voidOfferBatch(offersToVoid)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.NOT_ASSISTANT
          );
        });

        it("Offer already voided", async function () {
          // Void the offer first
          await offerHandler.connect(assistant).voidOffer("1");

          // Attempt to void the offer again, expecting revert
          await expect(offerHandler.connect(assistant).voidOfferBatch(offersToVoid)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.OFFER_HAS_BEEN_VOIDED
          );

          // try to void the same offer twice
          offersToVoid = ["1", "4", "1"];

          // Attempt to void the offer again, expecting revert
          await expect(offerHandler.connect(assistant).voidOfferBatch(offersToVoid)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.OFFER_HAS_BEEN_VOIDED
          );
        });
      });
    });

    context("👉 extendOfferBatch()", async function () {
      let offersToExtend, newValidUntilDate;
      beforeEach(async function () {
        // Create an offer
        await offerHandler
          .connect(assistant)
          .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds, offerFeeLimits);

        offersToExtend = ["1", "3", "5"];
        newValidUntilDate = (BigInt(offerDatesList[4].validUntil) + 10000n).toString(); // offer "5" has the highest validUntilDate so we need to set something greater

        for (const offerToExtend of offersToExtend) {
          let i = offerToExtend - 1;
          offers[i].validUntilDate = newValidUntilDate;
        }
      });

      it("should emit OfferExtended events", async function () {
        // Extend the valid until date, testing for the event
        const tx = await offerHandler.connect(assistant).extendOfferBatch(offersToExtend, newValidUntilDate);
        await expect(tx)
          .to.emit(offerHandler, "OfferExtended")
          .withArgs(offersToExtend[0], offer.sellerId, newValidUntilDate, await assistant.getAddress());

        await expect(tx)
          .to.emit(offerHandler, "OfferExtended")
          .withArgs(offersToExtend[1], offer.sellerId, newValidUntilDate, await assistant.getAddress());

        await expect(tx)
          .to.emit(offerHandler, "OfferExtended")
          .withArgs(offersToExtend[2], offer.sellerId, newValidUntilDate, await assistant.getAddress());
      });

      it("should update state", async function () {
        // Make sure that state is different from new validUntilDate
        for (const id of offersToExtend) {
          [, offerStruct] = await offerHandler.getOffer(id);
          expect(offerStruct.validUntilDate).is.not.equal(newValidUntilDate);
        }

        // Extend offers
        await offerHandler.connect(assistant).extendOfferBatch(offersToExtend, newValidUntilDate);

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

          // Attempt to extend offer batch, expecting revert
          await expect(offerHandler.connect(assistant).extendOfferBatch(offersToExtend, newValidUntilDate))
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Offers);
        });

        it("Offer does not exist", async function () {
          // Set invalid id
          offersToExtend = ["1", "432", "2"];

          // Attempt to extend the offers, expecting revert
          await expect(
            offerHandler.connect(assistant).extendOfferBatch(offersToExtend, newValidUntilDate)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_OFFER);

          // Set invalid id
          offersToExtend = ["1", "2", "0"];

          // Attempt to extend the offers, expecting revert
          await expect(
            offerHandler.connect(assistant).extendOfferBatch(offersToExtend, newValidUntilDate)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_OFFER);
        });

        it("Caller is not seller", async function () {
          // caller is not the assistant of any seller
          // Attempt to extend the offers, expecting revert
          await expect(
            offerHandler.connect(rando).extendOfferBatch(offersToExtend, newValidUntilDate)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_ASSISTANT);

          // caller is an assistant of another seller
          seller = mockSeller(
            await rando.getAddress(),
            await rando.getAddress(),
            ZeroAddress,
            await rando.getAddress()
          );

          // AuthToken
          emptyAuthToken = mockAuthToken();
          expect(emptyAuthToken.isValid()).is.true;
          await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);

          // Attempt to extend the offers, expecting revert
          await expect(
            offerHandler.connect(rando).extendOfferBatch(offersToExtend, newValidUntilDate)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_ASSISTANT);
        });

        it("Offers are not extendable, since one of them it's voided", async function () {
          // Void the offer first
          await offerHandler.connect(assistant).voidOffer("3");

          // Attempt to extend the offers, expecting revert
          await expect(
            offerHandler.connect(assistant).extendOfferBatch(offersToExtend, newValidUntilDate)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_HAS_BEEN_VOIDED);
        });

        it("New valid until date is lower than the existing valid until date", async function () {
          // Make the valid until date the same as the existing offer
          newValidUntilDate = (BigInt(offers[4].validUntilDate) - 10000n).toString(); // same as that validUntilDate of offer 5

          await expect(
            offerHandler.connect(assistant).extendOfferBatch(offersToExtend, newValidUntilDate)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_PERIOD_INVALID);

          // Make new the valid until date less than existing one
          newValidUntilDate = (BigInt(newValidUntilDate) - 1n).toString(); // less that validUntilDate of offer 5

          // Attempt to extend the offers, expecting revert
          await expect(
            offerHandler.connect(assistant).extendOfferBatch(offersToExtend, newValidUntilDate)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Valid until date is not in the future", async function () {
          // Set until date in the past
          newValidUntilDate = (BigInt(offerDatesList[0].validFrom) - oneMonth * 6n).toString(); // 6 months ago

          // Attempt to extend the offers, expecting revert
          await expect(
            offerHandler.connect(assistant).extendOfferBatch(offersToExtend, newValidUntilDate)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Offer has voucherRedeemableUntil set and new valid until date is greater than that", async function () {
          // create a new offer with vouchers with fix expiration date
          offer.id++;
          offerDates.voucherRedeemableUntil = BigInt(offerDates.validUntil) + oneMonth.toString();
          offerDurations.voucherValid = "0"; // only one of voucherRedeemableUntil and voucherValid can be non zero
          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit);
          offersToExtend.push(offer.id);

          // Set until date in after the offerDates.voucherRedeemableUntil
          newValidUntilDate = BigInt(offerDates.voucherRedeemableUntil) + oneWeek.toString(); // one week after voucherRedeemableUntil

          // Attempt to extend the offers, expecting revert
          await expect(
            offerHandler.connect(assistant).extendOfferBatch(offersToExtend, newValidUntilDate)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_PERIOD_INVALID);
        });
      });
    });

    context("👉 updateOfferRoyaltyRecipientsBatch()", async function () {
      let offersToUpdate, newRoyaltyInfo, expectedRoyaltyInfo;
      beforeEach(async function () {
        // Create an offer
        await offerHandler
          .connect(assistant)
          .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds, offerFeeLimits);

        // Register royalty recipients
        const royaltyRecipientList = new RoyaltyRecipientInfoList([new RoyaltyRecipientInfo(rando.address, "50")]);
        // royalty recipients increment the account id in the protocol
        accountId.next();
        await accountHandler.connect(admin).addRoyaltyRecipients(seller.id, royaltyRecipientList.toStruct());

        offersToUpdate = ["1", "4", "5"];
        const recipients = [other.address, other2.address, ZeroAddress, rando.address];
        const bps = ["100", "200", "500", "200"];
        newRoyaltyInfo = new RoyaltyInfo(recipients, bps);

        const expectedRecipients = [...recipients];
        expectedRecipients[2] = treasury.address;
        expectedRoyaltyInfo = new RoyaltyInfo(recipients, bps).toStruct();

        for (const offerToUpdate of offersToUpdate) {
          let i = offerToUpdate - 1;
          offers[i].royaltyInfo.push(newRoyaltyInfo);
        }
      });

      it("should emit OfferRoyaltyInfoUpdated events", async function () {
        // Update the royalty info, testing for the event
        const tx = await offerHandler
          .connect(assistant)
          .updateOfferRoyaltyRecipientsBatch(offersToUpdate, newRoyaltyInfo);
        await expect(tx)
          .to.emit(offerHandler, "OfferRoyaltyInfoUpdated")
          .withArgs(offersToUpdate[0], offer.sellerId, compareRoyaltyInfo.bind(expectedRoyaltyInfo), assistant.address);

        await expect(tx)
          .to.emit(offerHandler, "OfferRoyaltyInfoUpdated")
          .withArgs(offersToUpdate[1], offer.sellerId, compareRoyaltyInfo.bind(expectedRoyaltyInfo), assistant.address);

        await expect(tx)
          .to.emit(offerHandler, "OfferRoyaltyInfoUpdated")
          .withArgs(offersToUpdate[2], offer.sellerId, compareRoyaltyInfo.bind(expectedRoyaltyInfo), assistant.address);
      });

      it("should update state", async function () {
        // Update offers
        await offerHandler.connect(assistant).updateOfferRoyaltyRecipientsBatch(offersToUpdate, newRoyaltyInfo);

        for (const id of offersToUpdate) {
          // validUntilDate field should be updated
          [, offerStruct] = await offerHandler.getOffer(id);
          const returnedOffer = Offer.fromStruct(offerStruct);
          expect(returnedOffer).to.eql(offers[id - 1]);
        }
      });

      context("💔 Revert Reasons", async function () {
        it("The offers region of protocol is paused", async function () {
          // Pause the offers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Offers]);

          // Attempt to update offer batch, expecting revert
          await expect(
            offerHandler.connect(assistant).updateOfferRoyaltyRecipientsBatch(offersToUpdate, newRoyaltyInfo)
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Offers);
        });

        it("Offer does not exist", async function () {
          // Set invalid id
          offersToUpdate = ["1", "432", "2"];

          // Attempt to update the offers, expecting revert
          await expect(
            offerHandler.connect(assistant).updateOfferRoyaltyRecipientsBatch(offersToUpdate, newRoyaltyInfo)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_OFFER);

          // Set invalid id
          offersToUpdate = ["1", "2", "0"];

          // Attempt to update the offers, expecting revert
          await expect(
            offerHandler.connect(assistant).updateOfferRoyaltyRecipientsBatch(offersToUpdate, newRoyaltyInfo)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_OFFER);
        });

        it("Caller is not seller", async function () {
          // caller is not the assistant of any seller
          // Attempt to update the offers, expecting revert
          await expect(
            offerHandler.connect(rando).updateOfferRoyaltyRecipientsBatch(offersToUpdate, newRoyaltyInfo)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_ASSISTANT);

          // caller is an assistant of another seller
          seller = mockSeller(rando.address, rando.address, ZeroAddress, rando.address);

          // AuthToken
          emptyAuthToken = mockAuthToken();
          expect(emptyAuthToken.isValid()).is.true;
          await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);

          // Attempt to extend the offers, expecting revert
          await expect(
            offerHandler.connect(rando).updateOfferRoyaltyRecipientsBatch(offersToUpdate, newRoyaltyInfo)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_ASSISTANT);
        });

        it("Number of recipients and bps is different", async function () {
          // Set invalid id
          const recipients = [other.address, other2.address, ZeroAddress, rando.address];
          const bps = ["100", "150", "500"];
          newRoyaltyInfo = new RoyaltyInfo(recipients, bps);

          // Attempt to update the offer, expecting revert
          await expect(
            offerHandler.connect(assistant).updateOfferRoyaltyRecipientsBatch(offersToUpdate, newRoyaltyInfo)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.ARRAY_LENGTH_MISMATCH);
        });

        it("Royalty recipient is not approved", async function () {
          // Set invalid id
          const recipients = [other.address, other2.address, assistant.address, rando.address]; // assistant is not approved
          const bps = ["100", "150", "500", "100"];
          newRoyaltyInfo = new RoyaltyInfo(recipients, bps);

          // Attempt to update the offer, expecting revert
          await expect(
            offerHandler.connect(assistant).updateOfferRoyaltyRecipientsBatch(offersToUpdate, newRoyaltyInfo)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_ROYALTY_RECIPIENT);
        });

        it("Royalties are below the minimum", async function () {
          // Set invalid single bps
          const recipients = [other.address, other2.address, ZeroAddress, rando.address];
          const bps = ["100", "150", "500", "40"]; // 40 bps is below the minimum, set by the seller admin
          newRoyaltyInfo = new RoyaltyInfo(recipients, bps);

          // Attempt to update the offer, expecting revert
          await expect(
            offerHandler.connect(assistant).updateOfferRoyaltyRecipientsBatch(offersToUpdate, newRoyaltyInfo)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_ROYALTY_PERCENTAGE);
        });

        it("Total royalties are above the protocol maximum", async function () {
          // Set bps so they are over protocol minimum (10%)
          const recipients = [other.address, other2.address, ZeroAddress, rando.address];
          const bps = ["100", "150", "500", "400"];
          newRoyaltyInfo = new RoyaltyInfo(recipients, bps);

          // Attempt to update the offer, expecting revert
          await expect(
            offerHandler.connect(assistant).updateOfferRoyaltyRecipientsBatch(offersToUpdate, newRoyaltyInfo)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_ROYALTY_PERCENTAGE);
        });
      });
    });
  });
});
