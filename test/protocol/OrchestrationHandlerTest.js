const hre = require("hardhat");
const ethers = hre.ethers;
const { assert, expect } = require("chai");
const { gasLimit } = require("../../environments");

const Role = require("../../scripts/domain/Role");
const Seller = require("../../scripts/domain/Seller");
const DisputeResolver = require("../../scripts/domain/DisputeResolver");
const Offer = require("../../scripts/domain/Offer");
const OfferDates = require("../../scripts/domain/OfferDates");
const OfferDurations = require("../../scripts/domain/OfferDurations");
const Group = require("../../scripts/domain/Group");
const Condition = require("../../scripts/domain/Condition");
const EvaluationMethod = require("../../scripts/domain/EvaluationMethod");
const Twin = require("../../scripts/domain/Twin");
const Bundle = require("../../scripts/domain/Bundle");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { getEvent, calculateProtocolFee } = require("../../scripts/util/test-utils.js");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const { oneMonth } = require("../utils/constants");
const { mockTwin, mockOffer } = require("../utils/mock");

/**
 *  Test the Boson Orchestration Handler interface
 */
describe("IBosonOrchestrationHandler", function () {
  // Common vars
  let InterfaceIds;
  let accounts, deployer, rando, operator, admin, clerk, treasury, other1, other2;
  let erc165,
    protocolDiamond,
    accessController,
    accountHandler,
    offerHandler,
    groupHandler,
    twinHandler,
    bundleHandler,
    orchestrationHandler,
    offerStruct,
    key,
    value;
  let offer, nextOfferId, support, exists;
  let nextAccountId;
  let seller, sellerStruct, active;
  let disputeResolver;
  let id, sellerId;
  let offerDates, offerDatesStruct;
  let offerDurations, offerDurationsStruct;
  let protocolFeePercentage, protocolFeeFlatBoson;
  let group, groupStruct, nextGroupId;
  let method, tokenAddress, tokenId, threshold, maxCommits;
  let offerIds, condition;
  let twin, twinStruct, twinIds, nextTwinId;
  let bundle, bundleStruct, bundleId, nextBundleId;
  let bosonToken;
  let foreign721, foreign1155, fallbackError;

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
    other1 = accounts[6];
    other2 = accounts[7];

    // Deploy the Protocol Diamond
    [protocolDiamond, , , accessController] = await deployProtocolDiamond();

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Cut the protocol handler facets into the Diamond
    await deployProtocolHandlerFacets(protocolDiamond, [
      "AccountHandlerFacet",
      "OfferHandlerFacet",
      "GroupHandlerFacet",
      "TwinHandlerFacet",
      "BundleHandlerFacet",
      "OrchestrationHandlerFacet",
    ]);

    // Deploy the mock tokens
    [bosonToken, foreign721, foreign1155, fallbackError] = await deployMockTokens(gasLimit);

    // set protocolFees
    protocolFeePercentage = "200"; // 2 %
    protocolFeeFlatBoson = ethers.utils.parseUnits("0.01", "ether").toString();

    // Add config Handler, so offer id starts at 1
    const protocolConfig = [
      // Protocol addresses
      {
        treasuryAddress: "0x0000000000000000000000000000000000000000",
        tokenAddress: bosonToken.address,
        voucherAddress: "0x0000000000000000000000000000000000000000",
      },
      // Protocol limits
      {
        maxOffersPerGroup: 100,
        maxTwinsPerBundle: 100,
        maxOffersPerBundle: 100,
        maxOffersPerBatch: 100,
        maxTokensPerWithdrawal: 100,
      },
      // Protocol fees
      {
        percentage: protocolFeePercentage,
        flatBoson: protocolFeeFlatBoson,
      },
    ];
    await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);

    // Cast Diamond to IERC165
    erc165 = await ethers.getContractAt("IERC165", protocolDiamond.address);

    // Cast Diamond to IBosonAccountHandler
    accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);

    // Cast Diamond to IOfferHandler
    offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);

    // Cast Diamond to IGroupHandler
    groupHandler = await ethers.getContractAt("IBosonGroupHandler", protocolDiamond.address);

    // Cast Diamond to ITwinHandler
    twinHandler = await ethers.getContractAt("IBosonTwinHandler", protocolDiamond.address);

    // Cast Diamond to IBundleHandler
    bundleHandler = await ethers.getContractAt("IBosonBundleHandler", protocolDiamond.address);

    // Cast Diamond to IOrchestrationHandler
    orchestrationHandler = await ethers.getContractAt("IBosonOrchestrationHandler", protocolDiamond.address);
  });

  // Interface support (ERC-156 provided by ProtocolDiamond, others by deployed facets)
  context("📋 Interfaces", async function () {
    context("👉 supportsInterface()", async function () {
      it("should indicate support for IBosonOrchestrationHandler interface", async function () {
        // Current interfaceId for IBosonOrchestrationHandler
        support = await erc165.supportsInterface(InterfaceIds.IBosonOrchestrationHandler);

        // Test
        await expect(support, "IBosonOrchestrationHandler interface not supported").is.true;
      });
    });
  });

  // All supported methods - single offer
  context("📋 Orchestration Handler Methods", async function () {
    beforeEach(async function () {
      // Required constructor params
      id = "1"; // dispute resolver gets id "1"

      // Create a valid dispute resolver
      active = true;
      disputeResolver = new DisputeResolver(id.toString(), other1.address, active);
      expect(disputeResolver.isValid()).is.true;

      // Register the dispute resolver
      await accountHandler.connect(rando).createDisputeResolver(disputeResolver);

      // The first seller id
      nextAccountId = id = sellerId = "2"; // argument sent to contract for createSeller will be ignored
      // Create a valid seller, then set fields in tests directly
      seller = new Seller(sellerId, operator.address, admin.address, clerk.address, treasury.address, active);
      expect(seller.isValid()).is.true;

      // How that seller looks as a returned struct
      sellerStruct = seller.toStruct();

      // The first offer id
      nextOfferId = "1";

      // Mock offer, offerDates and offerDurations
      ({ offer, offerDates, offerDurations } = await mockOffer());
      offer.disputeResolverId = "1";
      offer.sellerId = "2";
      offerDates.validFrom = ethers.BigNumber.from(Date.now()).toString();
      offerDates.validUntil = ethers.BigNumber.from(Date.now() + oneMonth * 6).toString();

      // Check if domains are valid
      expect(offer.isValid()).is.true;
      expect(offerDates.isValid()).is.true;
      expect(offerDurations.isValid()).is.true;

      // Set domains transformed into struct
      offerStruct = offer.toStruct();
      offerDatesStruct = offerDates.toStruct();
      offerDurationsStruct = offerDurations.toStruct();
    });

    context("👉 createSellerAndOffer()", async function () {
      it("should emit a SellerCreated and OfferCreated events", async function () {
        // Create a seller and an offer, testing for the event
        await expect(
          orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer, offerDates, offerDurations)
        )
          .to.emit(orchestrationHandler, "SellerCreated")
          .withArgs(seller.id, sellerStruct, operator.address)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, offer.sellerId, offerStruct, offerDatesStruct, offerDurationsStruct, operator.address);
      });

      it("should update state", async function () {
        // Create a seller and an offer
        await orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer, offerDates, offerDurations);

        // Get the seller as a struct
        [, sellerStruct] = await accountHandler.connect(rando).getSeller(id);

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);

        // Returned values should match the input in createSellerAndOffer
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }

        // Get the offer as a struct
        [, offerStruct, offerDatesStruct, offerDurationsStruct] = await offerHandler.connect(rando).getOffer(offer.id);

        // Parse into entities
        let returnedOffer = Offer.fromStruct(offerStruct);
        let returnedOfferDates = OfferDates.fromStruct(offerDatesStruct);
        let returnedOfferDurations = OfferDurations.fromStruct(offerDurationsStruct);

        // Returned values should match the input in createSellerAndOffer
        for ([key, value] of Object.entries(offer)) {
          expect(JSON.stringify(returnedOffer[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDates)) {
          expect(JSON.stringify(returnedOfferDates[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDurations)) {
          expect(JSON.stringify(returnedOfferDurations[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should ignore any provided id and assign the next available", async function () {
        seller.id = "444";
        offer.id = "555";

        // Create a seller and an offer, testing for the event
        await expect(
          orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer, offerDates, offerDurations)
        )
          .to.emit(orchestrationHandler, "SellerCreated")
          .withArgs(nextAccountId, sellerStruct, operator.address)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, offer.sellerId, offerStruct, offerDatesStruct, offerDurationsStruct, operator.address);

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

        // Create a seller and an offer, testing for the event
        await expect(
          orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer, offerDates, offerDurations)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offerStruct, offerDatesStruct, offerDurationsStruct, operator.address);
      });

      it("should ignore any provided protocol fee and calculate the correct one", async function () {
        // set some protocole fee
        offer.protocolFee = "999";

        // Create a seller and an offer, testing for the event
        await expect(
          orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer, offerDates, offerDurations)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offerStruct, offerDatesStruct, offerDurationsStruct, operator.address);
      });

      it("If exchange token is $BOSON, fee should be flat boson fee", async function () {
        // Prepare an offer with $BOSON as exchange token
        offer.exchangeToken = bosonToken.address;
        offer.protocolFee = protocolFeeFlatBoson;

        // Create a seller and an offer, testing for the event
        await expect(
          orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer, offerDates, offerDurations)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offer.toStruct(), offerDatesStruct, offerDurationsStruct, operator.address);
      });

      it("For absolute zero offers, dispute resolver can be unspecified", async function () {
        // Prepare an absolute zero offer
        offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = offer.protocolFee = "0";
        offer.disputeResolverId = "0";

        // Create a seller and an offer, testing for the event
        await expect(
          orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer, offerDates, offerDurations)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offer.toStruct(), offerDatesStruct, offerDurationsStruct, operator.address);
      });

      it("Should allow creation of an offer with unlimited supply", async function () {
        // Prepare an absolute zero offer
        offer.quantityAvailable = ethers.constants.MaxUint256.toString();

        // Create a seller and an offer, testing for the event
        await expect(
          orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer, offerDates, offerDurations)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offer.toStruct(), offerDatesStruct, offerDurationsStruct, operator.address);
      });

      context("💔 Revert Reasons", async function () {
        it("active is false", async function () {
          seller.active = false;

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer, offerDates, offerDurations)
          ).to.revertedWith(RevertReasons.MUST_BE_ACTIVE);
        });

        it("addresses are the zero address", async function () {
          seller.clerk = ethers.constants.AddressZero;

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer, offerDates, offerDurations)
          ).to.revertedWith(RevertReasons.INVALID_ADDRESS);

          seller.clerk = clerk.address;
          seller.admin = ethers.constants.AddressZero;

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer, offerDates, offerDurations)
          ).to.revertedWith(RevertReasons.INVALID_ADDRESS);
        });

        it("addresses are not unique to this seller Id", async function () {
          // Create a seller
          await accountHandler.connect(admin).createSeller(seller);

          seller.admin = other1.address;
          seller.clerk = other2.address;

          // Attempt to create a seller with non-unique operator, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer, offerDates, offerDurations)
          ).to.revertedWith(RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE);

          seller.admin = admin.address;
          seller.operator = other1.address;

          // Attempt to create a seller with non-unique admin, expecting revert
          await expect(
            orchestrationHandler.connect(other1).createSellerAndOffer(seller, offer, offerDates, offerDurations)
          ).to.revertedWith(RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE);

          seller.clerk = clerk.address;
          seller.admin = other2.address;

          // Attempt to create a seller with non-unique clerk, expecting revert
          await expect(
            orchestrationHandler.connect(other1).createSellerAndOffer(seller, offer, offerDates, offerDurations)
          ).to.revertedWith(RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE);
        });

        it("Caller is not operator the specified in seller", async function () {
          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler.connect(rando).createSellerAndOffer(seller, offer, offerDates, offerDurations)
          ).to.revertedWith(RevertReasons.NOT_OPERATOR);
        });

        it("Valid from date is greater than valid until date", async function () {
          // Reverse the from and until dates
          offerDates.validFrom = ethers.BigNumber.from(Date.now() + oneMonth * 6).toString(); // 6 months from now
          offerDates.validUntil = ethers.BigNumber.from(Date.now()).toString(); // now

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer, offerDates, offerDurations)
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Valid until date is not in the future", async function () {
          // Set until date in the past
          offerDates.validUntil = ethers.BigNumber.from(Date.now() - oneMonth * 6).toString(); // 6 months ago
          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer, offerDates, offerDurations)
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Buyer cancel penalty is less than item price", async function () {
          // Set buyer cancel penalty higher than offer price
          offer.buyerCancelPenalty = ethers.BigNumber.from(offer.price).add(10).toString();

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer, offerDates, offerDurations)
          ).to.revertedWith(RevertReasons.OFFER_PENALTY_INVALID);
        });

        it("Offer cannot be voided at the time of the creation", async function () {
          // Set voided flag to true
          offer.voided = true;

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer, offerDates, offerDurations)
          ).to.revertedWith(RevertReasons.OFFER_MUST_BE_ACTIVE);
        });

        it("Both voucher expiration date and voucher expiraton period are defined", async function () {
          // Set both voucherRedeemableUntil and voucherValid
          offerDates.voucherRedeemableUntil = (Number(offerDates.voucherRedeemableFrom) + oneMonth).toString();
          offerDurations.voucherValid = oneMonth.toString();

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer, offerDates, offerDurations)
          ).to.revertedWith(RevertReasons.AMBIGUOUS_VOUCHER_EXPIRY);
        });

        it("Neither of voucher expiration date and voucher expiraton period are defined", async function () {
          // Set both voucherRedeemableUntil and voucherValid to "0"
          offerDates.voucherRedeemableUntil = "0";
          offerDurations.voucherValid = "0";

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer, offerDates, offerDurations)
          ).to.revertedWith(RevertReasons.AMBIGUOUS_VOUCHER_EXPIRY);
        });

        it("Voucher redeemable period is fixed, but it ends before it starts", async function () {
          // Set both voucherRedeemableUntil that is less than voucherRedeemableFrom
          offerDates.voucherRedeemableUntil = (Number(offerDates.voucherRedeemableFrom) - 10).toString();
          offerDurations.voucherValid = "0";

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer, offerDates, offerDurations)
          ).to.revertedWith(RevertReasons.REDEMPTION_PERIOD_INVALID);
        });

        it("Voucher redeemable period is fixed, but it ends before offer expires", async function () {
          // Set both voucherRedeemableUntil that is more than voucherRedeemableFrom but less than validUntil
          offerDates.voucherRedeemableFrom = "0";
          offerDates.voucherRedeemableUntil = (Number(offerDates.validUntil) - 10).toString();
          offerDurations.voucherValid = "0";

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer, offerDates, offerDurations)
          ).to.revertedWith(RevertReasons.REDEMPTION_PERIOD_INVALID);
        });

        it("Fulfillment period is set to zero", async function () {
          // Set fulfilment period to 0
          offerDurations.fulfillmentPeriod = "0";

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer, offerDates, offerDurations)
          ).to.revertedWith(RevertReasons.INVALID_FULFILLMENT_PERIOD);
        });

        it("Resolution period is set to zero", async function () {
          // Set dispute duration period to 0
          offerDurations.resolutionPeriod = "0";

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer, offerDates, offerDurations)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_DURATION);
        });

        it("Available quantity is set to zero", async function () {
          // Set available quantity to 0
          offer.quantityAvailable = "0";

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer, offerDates, offerDurations)
          ).to.revertedWith(RevertReasons.INVALID_QUANTITY_AVAILABLE);
        });

        it("Dispute resolver wallet is not registered", async function () {
          // Set some address that is not registered as a dispute resolver
          offer.disputeResolverId = "16";

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer, offerDates, offerDurations)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        it("For absolute zero offer, specified dispute resolver is not registered", async function () {
          // Prepare an absolute zero offer, but specify dispute resolver
          offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = offer.protocolFee = "0";
          offer.disputeResolverId = "16";

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer, offerDates, offerDurations)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);
        });
      });
    });

    context("👉 createOfferWithCondition()", async function () {
      beforeEach(async function () {
        // prepare a group struct. We are not passing it as an argument, but just need to validate.

        // The first group id
        nextGroupId = "1";

        // Required constructor params for Condition
        method = EvaluationMethod.Threshold;
        tokenAddress = accounts[0].address; // just need an address
        tokenType = TokenType.MultiToken;
        tokenId = "5150";
        threshold = "1";
        maxCommits = "1";

        // Required constructor params for Group
        id = nextGroupId;
        sellerId = "2"; // "1" is dispute resolver
        offerIds = ["1"];

        condition = new Condition(method, tokenType, tokenAddress, tokenId, threshold, maxCommits);
        expect(condition.isValid()).to.be.true;

        group = new Group(nextGroupId, sellerId, offerIds, condition);

        expect(group.isValid()).is.true;

        // How that group looks as a returned struct
        groupStruct = group.toStruct();

        // create a seller
        await accountHandler.connect(admin).createSeller(seller);
      });

      it("should emit an OfferCreated and GroupCreated events", async function () {
        // Create an offer with condition, testing for the events
        const tx = await orchestrationHandler
          .connect(operator)
          .createOfferWithCondition(offer, offerDates, offerDurations, condition);

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offerStruct, offerDatesStruct, offerDurationsStruct, operator.address);

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // GroupCreated event
        const eventGroupCreated = getEvent(txReceipt, orchestrationHandler, "GroupCreated");
        const groupInstance = Group.fromStruct(eventGroupCreated.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(eventGroupCreated.groupId.toString(), group.id, "Group Id is incorrect");
        assert.equal(eventGroupCreated.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(eventGroupCreated.executedBy.toString(), operator.address, "Executed by is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
      });

      it("should update state", async function () {
        // Create an offer with condition
        await orchestrationHandler
          .connect(operator)
          .createOfferWithCondition(offer, offerDates, offerDurations, condition);

        // Get the offer as a struct
        [, offerStruct, offerDatesStruct, offerDurationsStruct] = await offerHandler.connect(rando).getOffer(offer.id);

        // Parse into entities
        let returnedOffer = Offer.fromStruct(offerStruct);
        let returnedOfferDates = OfferDates.fromStruct(offerDatesStruct);
        let returnedOfferDurations = OfferDurations.fromStruct(offerDurationsStruct);

        // Returned values should match the input in createSellerAndOffer
        for ([key, value] of Object.entries(offer)) {
          expect(JSON.stringify(returnedOffer[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDates)) {
          expect(JSON.stringify(returnedOfferDates[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDurations)) {
          expect(JSON.stringify(returnedOfferDurations[key]) === JSON.stringify(value)).is.true;
        }

        // Get the group as a struct
        [, groupStruct] = await groupHandler.connect(rando).getGroup(nextGroupId);

        // Parse into entity
        const returnedGroup = Group.fromStruct(groupStruct);

        // Returned values should match what is expected for the silently created group
        for ([key, value] of Object.entries(group)) {
          expect(JSON.stringify(returnedGroup[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should ignore any provided offer id and assign the next available", async function () {
        offer.id = "555";

        // Create an offer with condition, testing for the events
        const tx = await orchestrationHandler
          .connect(operator)
          .createOfferWithCondition(offer, offerDates, offerDurations, condition);

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offerStruct, offerDatesStruct, offerDurationsStruct, operator.address);

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // GroupCreated event
        const eventGroupCreated = getEvent(txReceipt, orchestrationHandler, "GroupCreated");
        const groupInstance = Group.fromStruct(eventGroupCreated.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(eventGroupCreated.groupId.toString(), nextGroupId, "Group Id is incorrect");
        assert.equal(eventGroupCreated.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
      });

      it("should ignore any provided seller and assign seller id of msg.sender", async function () {
        // set some other sellerId
        offer.sellerId = "123";

        // Create an offer with condition, testing for the events
        const tx = await orchestrationHandler
          .connect(operator)
          .createOfferWithCondition(offer, offerDates, offerDurations, condition);

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offerStruct, offerDatesStruct, offerDurationsStruct, operator.address);

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // GroupCreated event
        const eventGroupCreated = getEvent(txReceipt, orchestrationHandler, "GroupCreated");
        const groupInstance = Group.fromStruct(eventGroupCreated.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(eventGroupCreated.groupId.toString(), nextGroupId, "Group Id is incorrect");
        assert.equal(eventGroupCreated.sellerId.toString(), sellerId, "Seller Id is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
      });

      it("should ignore any provided protocol fee and calculate the correct one", async function () {
        // set some protocole fee
        offer.protocolFee = "999";

        // Create an offer with condition, testing for the events
        await expect(
          orchestrationHandler.connect(operator).createOfferWithCondition(offer, offerDates, offerDurations, condition)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offerStruct, offerDatesStruct, offerDurationsStruct, operator.address);
      });

      it("If exchange token is $BOSON, fee should be flat boson fee", async function () {
        // Prepare an offer with $BOSON as exchange token
        offer.exchangeToken = bosonToken.address;
        offer.protocolFee = protocolFeeFlatBoson;

        // Create an offer with condition, testing for the events
        await expect(
          orchestrationHandler.connect(operator).createOfferWithCondition(offer, offerDates, offerDurations, condition)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offer.toStruct(), offerDatesStruct, offerDurationsStruct, operator.address);
      });

      it("For absolute zero offers, dispute resolver can be unspecified", async function () {
        // Prepare an absolute zero offer
        offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = offer.protocolFee = "0";
        offer.disputeResolverId = "0";

        // Create an offer with condition, testing for the events
        await expect(
          orchestrationHandler.connect(operator).createOfferWithCondition(offer, offerDates, offerDurations, condition)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offer.toStruct(), offerDatesStruct, offerDurationsStruct, operator.address);
      });

      it("Should allow creation of an offer with unlimited supply", async function () {
        // Prepare an absolute zero offer
        offer.quantityAvailable = ethers.constants.MaxUint256.toString();

        // Create an offer with condition, testing for the events
        await expect(
          orchestrationHandler.connect(operator).createOfferWithCondition(offer, offerDates, offerDurations, condition)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offer.toStruct(), offerDatesStruct, offerDurationsStruct, operator.address);
      });

      context("💔 Revert Reasons", async function () {
        it("Caller not operator of any seller", async function () {
          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler.connect(rando).createOfferWithCondition(offer, offerDates, offerDurations, condition)
          ).to.revertedWith(RevertReasons.NOT_OPERATOR);
        });

        it("Valid from date is greater than valid until date", async function () {
          // Reverse the from and until dates
          offerDates.validFrom = ethers.BigNumber.from(Date.now() + oneMonth * 6).toString(); // 6 months from now
          offerDates.validUntil = ethers.BigNumber.from(Date.now()).toString(); // now

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, condition)
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Valid until date is not in the future", async function () {
          // Set until date in the past
          offerDates.validUntil = ethers.BigNumber.from(Date.now() - oneMonth * 6).toString(); // 6 months ago

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, condition)
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Buyer cancel penalty is less than item price", async function () {
          // Set buyer cancel penalty higher than offer price
          offer.buyerCancelPenalty = ethers.BigNumber.from(offer.price).add(10).toString();

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, condition)
          ).to.revertedWith(RevertReasons.OFFER_PENALTY_INVALID);
        });

        it("Offer cannot be voided at the time of the creation", async function () {
          // Set voided flag to true
          offer.voided = true;

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, condition)
          ).to.revertedWith(RevertReasons.OFFER_MUST_BE_ACTIVE);
        });

        it("Both voucher expiration date and voucher expiraton period are defined", async function () {
          // Set both voucherRedeemableUntil and voucherValid
          offerDates.voucherRedeemableUntil = (Number(offerDates.voucherRedeemableFrom) + oneMonth).toString();
          offerDurations.voucherValid = oneMonth.toString();

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, condition)
          ).to.revertedWith(RevertReasons.AMBIGUOUS_VOUCHER_EXPIRY);
        });

        it("Neither of voucher expiration date and voucher expiraton period are defined", async function () {
          // Set both voucherRedeemableUntil and voucherValid to "0"
          offerDates.voucherRedeemableUntil = "0";
          offerDurations.voucherValid = "0";

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, condition)
          ).to.revertedWith(RevertReasons.AMBIGUOUS_VOUCHER_EXPIRY);
        });

        it("Voucher redeemable period is fixed, but it ends before it starts", async function () {
          // Set both voucherRedeemableUntil that is less than voucherRedeemableFrom
          offerDates.voucherRedeemableUntil = (Number(offerDates.voucherRedeemableFrom) - 10).toString();
          offerDurations.voucherValid = "0";

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, condition)
          ).to.revertedWith(RevertReasons.REDEMPTION_PERIOD_INVALID);
        });

        it("Voucher redeemable period is fixed, but it ends before offer expires", async function () {
          // Set both voucherRedeemableUntil that is more than voucherRedeemableFrom but less than validUntil
          offerDates.voucherRedeemableFrom = "0";
          offerDates.voucherRedeemableUntil = (Number(offerDates.validUntil) - 10).toString();
          offerDurations.voucherValid = "0";

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, condition)
          ).to.revertedWith(RevertReasons.REDEMPTION_PERIOD_INVALID);
        });

        it("Fulfillment period is set to zero", async function () {
          // Set fulfilment period to 0
          offerDurations.fulfillmentPeriod = "0";

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, condition)
          ).to.revertedWith(RevertReasons.INVALID_FULFILLMENT_PERIOD);
        });

        it("Resolution period is set to zero", async function () {
          // Set dispute duration period to 0
          offerDurations.resolutionPeriod = "0";

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, condition)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_DURATION);
        });

        it("Available quantity is set to zero", async function () {
          // Set available quantity to 0
          offer.quantityAvailable = "0";

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, condition)
          ).to.revertedWith(RevertReasons.INVALID_QUANTITY_AVAILABLE);
        });

        it("Dispute resolver wallet is not registered", async function () {
          // Set some address that is not registered as a dispute resolver
          offer.disputeResolverId = "16";

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, condition)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        it("For absolute zero offer, specified dispute resolver is not registered", async function () {
          // Prepare an absolute zero offer, but specify dispute resolver
          offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = offer.protocolFee = "0";
          offer.disputeResolverId = "16";

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, condition)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        it("Condition 'None' has some values in other fields", async function () {
          method = EvaluationMethod.None;
          condition = new Condition(method, tokenType, tokenAddress, tokenId, threshold, maxCommits);
          group.condition = condition;

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, condition)
          ).to.revertedWith(RevertReasons.INVALID_CONDITION_PARAMETERS);
        });

        it("Condition 'Threshold' has zero token contract address", async function () {
          method = EvaluationMethod.Threshold;
          tokenAddress = ethers.constants.AddressZero;
          condition = new Condition(method, tokenType, tokenAddress, tokenId, threshold, maxCommits);
          group.condition = condition;

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, condition)
          ).to.revertedWith(RevertReasons.INVALID_CONDITION_PARAMETERS);
        });

        it("Condition 'SpecificToken' has has zero token contract address", async function () {
          method = EvaluationMethod.SpecificToken;
          tokenAddress = ethers.constants.AddressZero;
          condition = new Condition(method, tokenType, tokenAddress, tokenId, threshold, maxCommits);
          group.condition = condition;

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, condition)
          ).to.revertedWith(RevertReasons.INVALID_CONDITION_PARAMETERS);
        });
      });
    });

    context("👉 createOfferAddToGroup()", async function () {
      beforeEach(async function () {
        // create a seller
        await accountHandler.connect(admin).createSeller(seller);

        // The first group id
        nextGroupId = "1";

        // create 3 offers
        for (let i = 0; i < 3; i++) {
          // Mock offer, offerDates and offerDurations
          ({ offer, offerDates, offerDurations } = await mockOffer());
          offer.id = `${i + 1}`;
          offer.price = ethers.utils.parseUnits(`${1.5 + i * 1}`, "ether").toString();
          offer.sellerDeposit = ethers.utils.parseUnits(`${0.25 + i * 0.1}`, "ether").toString();
          offer.protocolFee = calculateProtocolFee(offer.price, protocolFeePercentage);
          offer.buyerCancelPenalty = ethers.utils.parseUnits(`${0.05 + i * 0.1}`, "ether").toString();
          offer.quantityAvailable = `${(i + 1) * 2}`;
          offer.disputeResolverId = "1";
          offer.sellerId = "2"; // "1" is dispute resolver

          offerDates.validFrom = ethers.BigNumber.from(Date.now() + oneMonth * i).toString();
          offerDates.validUntil = ethers.BigNumber.from(Date.now() + oneMonth * 6 * (i + 1)).toString();

          // Check if domains are valid
          expect(offer.isValid()).is.true;
          expect(offerDates.isValid()).is.true;
          expect(offerDurations.isValid()).is.true;

          // Create the offer
          await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations);

          nextOfferId++;
        }
        offerDatesStruct = offerDates.toStruct();
        offerDurationsStruct = offerDurations.toStruct();

        // Required constructor params for Condition
        method = EvaluationMethod.Threshold;
        tokenType = TokenType.MultiToken;
        tokenAddress = accounts[0].address; // just need an address
        tokenId = "5150";
        threshold = "1";
        maxCommits = "3";

        // Required constructor params for Group
        id = nextGroupId;
        sellerId = "2"; // "1" is dispute resolver;
        offerIds = ["1", "3"];

        condition = new Condition(method, tokenType, tokenAddress, tokenId, threshold, maxCommits);
        expect(condition.isValid()).to.be.true;

        group = new Group(nextGroupId, sellerId, offerIds, condition);

        expect(group.isValid()).is.true;

        // Create a group
        await groupHandler.connect(operator).createGroup(group);

        // after another offer is added
        offer.id = nextOfferId.toString(); // not necessary as input parameter
        group.offerIds = ["1", "3", "4"];

        // How that group and offer look as a returned struct
        groupStruct = group.toStruct();
        offerStruct = offer.toStruct();
      });

      it("should emit an OfferCreated and GroupUpdated events", async function () {
        // Create an offer, add it to the group, testing for the events
        const tx = await orchestrationHandler
          .connect(operator)
          .createOfferAddToGroup(offer, offerDates, offerDurations, nextGroupId);

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offerStruct, offerDatesStruct, offerDurationsStruct, operator.address);

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // GroupUpdated event
        const eventGroupUpdated = getEvent(txReceipt, orchestrationHandler, "GroupUpdated");
        const groupInstance = Group.fromStruct(eventGroupUpdated.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(eventGroupUpdated.groupId.toString(), group.id, "Group Id is incorrect");
        assert.equal(eventGroupUpdated.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
      });

      it("should update state", async function () {
        // Create an offer, add it to the group
        await orchestrationHandler
          .connect(operator)
          .createOfferAddToGroup(offer, offerDates, offerDurations, nextGroupId);

        // Get the offer as a struct
        [, offerStruct, offerDatesStruct, offerDurationsStruct] = await offerHandler.connect(rando).getOffer(offer.id);

        // Parse into entities
        let returnedOffer = Offer.fromStruct(offerStruct);
        let returnedOfferDates = OfferDates.fromStruct(offerDatesStruct);
        let returnedOfferDurations = OfferDurations.fromStruct(offerDurationsStruct);

        // Returned values should match the input in createSellerAndOffer
        for ([key, value] of Object.entries(offer)) {
          expect(JSON.stringify(returnedOffer[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDates)) {
          expect(JSON.stringify(returnedOfferDates[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDurations)) {
          expect(JSON.stringify(returnedOfferDurations[key]) === JSON.stringify(value)).is.true;
        }

        // Get the group as a struct
        [, groupStruct] = await groupHandler.connect(rando).getGroup(nextGroupId);

        // Parse into entity
        const returnedGroup = Group.fromStruct(groupStruct);

        // Returned values should match what is expected for the update group
        for ([key, value] of Object.entries(group)) {
          expect(JSON.stringify(returnedGroup[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should ignore any provided offer id and assign the next available", async function () {
        offer.id = "555";

        // Create an offer, add it to the group, testing for the events
        const tx = await orchestrationHandler
          .connect(operator)
          .createOfferAddToGroup(offer, offerDates, offerDurations, nextGroupId);

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offerStruct, offerDatesStruct, offerDurationsStruct, operator.address);

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // GroupUpdated event
        const eventGroupUpdated = getEvent(txReceipt, orchestrationHandler, "GroupUpdated");
        const groupInstance = Group.fromStruct(eventGroupUpdated.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(eventGroupUpdated.groupId.toString(), nextGroupId, "Group Id is incorrect");
        assert.equal(eventGroupUpdated.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
      });

      it("should ignore any provided seller and assign seller id of msg.sender", async function () {
        // set some other sellerId
        offer.sellerId = "123";

        // Create an offer, add it to the group, testing for the events
        const tx = await orchestrationHandler
          .connect(operator)
          .createOfferAddToGroup(offer, offerDates, offerDurations, nextGroupId);

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offerStruct, offerDatesStruct, offerDurationsStruct, operator.address);

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // GroupUpdated event
        const eventGroupUpdated = getEvent(txReceipt, orchestrationHandler, "GroupUpdated");
        const groupInstance = Group.fromStruct(eventGroupUpdated.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(eventGroupUpdated.groupId.toString(), nextGroupId, "Group Id is incorrect");
        assert.equal(eventGroupUpdated.sellerId.toString(), sellerId, "Seller Id is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
      });

      it("should ignore any provided protocol fee and calculate the correct one", async function () {
        // set some protocole fee
        offer.protocolFee = "999";

        // Create an offer, add it to the group, testing for the events
        await expect(
          orchestrationHandler.connect(operator).createOfferAddToGroup(offer, offerDates, offerDurations, nextGroupId)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offerStruct, offerDatesStruct, offerDurationsStruct, operator.address);
      });

      it("If exchange token is $BOSON, fee should be flat boson fee", async function () {
        // Prepare an offer with $BOSON as exchange token
        offer.exchangeToken = bosonToken.address;
        offer.protocolFee = protocolFeeFlatBoson;

        // Create an offer, add it to the group, testing for the events
        await expect(
          orchestrationHandler.connect(operator).createOfferAddToGroup(offer, offerDates, offerDurations, nextGroupId)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offer.toStruct(), offerDatesStruct, offerDurationsStruct, operator.address);
      });

      it("For absolute zero offers, dispute resolver can be unspecified", async function () {
        // Prepare an absolute zero offer
        offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = offer.protocolFee = "0";
        offer.disputeResolverId = "0";

        // Create an offer, add it to the group, testing for the events
        await expect(
          orchestrationHandler.connect(operator).createOfferAddToGroup(offer, offerDates, offerDurations, nextGroupId)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offer.toStruct(), offerDatesStruct, offerDurationsStruct, operator.address);
      });

      it("Should allow creation of an offer with unlimited supply", async function () {
        // Prepare an absolute zero offer
        offer.quantityAvailable = ethers.constants.MaxUint256.toString();

        // Create an offer, add it to the group, testing for the events
        await expect(
          orchestrationHandler.connect(operator).createOfferAddToGroup(offer, offerDates, offerDurations, nextGroupId)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offer.toStruct(), offerDatesStruct, offerDurationsStruct, operator.address);
      });

      context("💔 Revert Reasons", async function () {
        it("Caller not operator of any seller", async function () {
          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler.connect(rando).createOfferAddToGroup(offer, offerDates, offerDurations, nextGroupId)
          ).to.revertedWith(RevertReasons.NOT_OPERATOR);
        });

        it("Valid from date is greater than valid until date", async function () {
          // Reverse the from and until dates
          offerDates.validFrom = ethers.BigNumber.from(Date.now() + oneMonth * 6).toString(); // 6 months from now
          offerDates.validUntil = ethers.BigNumber.from(Date.now()).toString(); // now

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferAddToGroup(offer, offerDates, offerDurations, nextGroupId)
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Valid until date is not in the future", async function () {
          // Set until date in the past
          offerDates.validUntil = ethers.BigNumber.from(Date.now() - oneMonth * 6).toString(); // 6 months ago

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferAddToGroup(offer, offerDates, offerDurations, nextGroupId)
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Buyer cancel penalty is less than item price", async function () {
          // Set buyer cancel penalty higher than offer price
          offer.buyerCancelPenalty = ethers.BigNumber.from(offer.price).add(10).toString();

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferAddToGroup(offer, offerDates, offerDurations, nextGroupId)
          ).to.revertedWith(RevertReasons.OFFER_PENALTY_INVALID);
        });

        it("Offer cannot be voided at the time of the creation", async function () {
          // Set voided flag to true
          offer.voided = true;

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferAddToGroup(offer, offerDates, offerDurations, nextGroupId)
          ).to.revertedWith(RevertReasons.OFFER_MUST_BE_ACTIVE);
        });

        it("Both voucher expiration date and voucher expiraton period are defined", async function () {
          // Set both voucherRedeemableUntil and voucherValid
          offerDates.voucherRedeemableUntil = ethers.BigNumber.from(offerDates.voucherRedeemableFrom)
            .add(oneMonth)
            .toString();
          offerDurations.voucherValid = oneMonth.toString();

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferAddToGroup(offer, offerDates, offerDurations, nextGroupId)
          ).to.revertedWith(RevertReasons.AMBIGUOUS_VOUCHER_EXPIRY);
        });

        it("Neither of voucher expiration date and voucher expiraton period are defined", async function () {
          // Set both voucherRedeemableUntil and voucherValid to "0"
          offerDates.voucherRedeemableUntil = "0";
          offerDurations.voucherValid = "0";

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferAddToGroup(offer, offerDates, offerDurations, nextGroupId)
          ).to.revertedWith(RevertReasons.AMBIGUOUS_VOUCHER_EXPIRY);
        });

        it("Voucher redeemable period is fixed, but it ends before it starts", async function () {
          // Set both voucherRedeemableUntil that is less than voucherRedeemableFrom
          offerDates.voucherRedeemableUntil = ethers.BigNumber.from(offerDates.voucherRedeemableFrom)
            .sub(10)
            .toString();
          offerDurations.voucherValid = "0";

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferAddToGroup(offer, offerDates, offerDurations, nextGroupId)
          ).to.revertedWith(RevertReasons.REDEMPTION_PERIOD_INVALID);
        });

        it("Voucher redeemable period is fixed, but it ends before offer expires", async function () {
          // Set both voucherRedeemableUntil that is more than voucherRedeemableFrom but less than validUntil
          offerDates.voucherRedeemableFrom = "0";
          offerDates.voucherRedeemableUntil = (Number(offerDates.validUntil) - 10).toString();
          offerDurations.voucherValid = "0";

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferAddToGroup(offer, offerDates, offerDurations, nextGroupId)
          ).to.revertedWith(RevertReasons.REDEMPTION_PERIOD_INVALID);
        });

        it("Fulfillment period is set to zero", async function () {
          // Set fulfilment period to 0
          offerDurations.fulfillmentPeriod = "0";

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferAddToGroup(offer, offerDates, offerDurations, nextGroupId)
          ).to.revertedWith(RevertReasons.INVALID_FULFILLMENT_PERIOD);
        });

        it("Resolution period is set to zero", async function () {
          // Set dispute duration period to 0
          offerDurations.resolutionPeriod = "0";

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferAddToGroup(offer, offerDates, offerDurations, nextGroupId)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_DURATION);
        });

        it("Available quantity is set to zero", async function () {
          // Set available quantity to 0
          offer.quantityAvailable = "0";

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferAddToGroup(offer, offerDates, offerDurations, nextGroupId)
          ).to.revertedWith(RevertReasons.INVALID_QUANTITY_AVAILABLE);
        });

        it("Dispute resolver wallet is not registered", async function () {
          // Set some address that is not registered as a dispute resolver
          offer.disputeResolverId = "16";

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferAddToGroup(offer, offerDates, offerDurations, nextGroupId)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        it("For absolute zero offer, specified dispute resolver is not registered", async function () {
          // Prepare an absolute zero offer, but specify dispute resolver
          offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = offer.protocolFee = "0";
          offer.disputeResolverId = "16";

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferAddToGroup(offer, offerDates, offerDurations, nextGroupId)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        it("Group does not exist", async function () {
          // Set invalid id
          let invalidGroupId = "444";

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAddToGroup(offer, offerDates, offerDurations, invalidGroupId)
          ).to.revertedWith(RevertReasons.NO_SUCH_GROUP);

          // Set invalid id
          invalidGroupId = "0";

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAddToGroup(offer, offerDates, offerDurations, invalidGroupId)
          ).to.revertedWith(RevertReasons.NO_SUCH_GROUP);
        });

        it("Caller is not the seller of the group", async function () {
          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler.connect(rando).createOfferAddToGroup(offer, offerDates, offerDurations, nextGroupId)
          ).to.revertedWith(RevertReasons.NOT_OPERATOR);
        });
      });
    });

    context("👉 createOfferAndTwinWithBundle()", async function () {
      beforeEach(async function () {
        // prepare a bundle struct. We are not passing it as an argument, but just need to validate.

        // The first bundle id
        bundleId = nextBundleId = "1";

        // Required constructor params for Bundle
        offerIds = ["1"];
        twinIds = ["1"];

        bundle = new Bundle(bundleId, sellerId, offerIds, twinIds);

        expect(bundle.isValid()).is.true;

        // How that bundle looks as a returned struct
        bundleStruct = bundle.toStruct();

        nextTwinId = "1";

        // Create a valid twin.
        twin = mockTwin(bosonToken.address);
        twin.sellerId = sellerId;
        // How that twin looks as a returned struct
        twinStruct = twin.toStruct();

        // create a seller
        await accountHandler.connect(admin).createSeller(seller);

        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(operator).approve(twinHandler.address, 1); // approving the twin handler
      });

      it("should emit an OfferCreated, a TwinCreated and a BundleCreated events", async function () {
        // Create an offer, a twin and a bundle, testing for the events
        const tx = await orchestrationHandler
          .connect(operator)
          .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, twin);

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offerStruct, offerDatesStruct, offerDurationsStruct, operator.address);

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // TwinCreated event
        const eventTwinCreated = getEvent(txReceipt, orchestrationHandler, "TwinCreated");
        const twinInstance = Twin.fromStruct(eventTwinCreated.twin);
        // Validate the instance
        expect(twinInstance.isValid()).to.be.true;

        assert.equal(eventTwinCreated.twinId.toString(), twin.id, "Twin Id is incorrect");
        assert.equal(eventTwinCreated.sellerId.toString(), twin.sellerId, "Seller Id is incorrect");
        assert.equal(twinInstance.toString(), twin.toString(), "Twin struct is incorrect");

        // BundleCreated event
        const eventBundleCreated = getEvent(txReceipt, orchestrationHandler, "BundleCreated");
        const bundleInstance = Bundle.fromStruct(eventBundleCreated.bundle);
        // Validate the instance
        expect(bundleInstance.isValid()).to.be.true;

        assert.equal(eventBundleCreated.bundleId.toString(), bundle.id, "Bundle Id is incorrect");
        assert.equal(eventBundleCreated.sellerId.toString(), bundle.sellerId, "Seller Id is incorrect");
        assert.equal(bundleInstance.toString(), bundle.toString(), "Bundle struct is incorrect");
      });

      it("should update state", async function () {
        // Create an offer, a twin and a bundle
        await orchestrationHandler
          .connect(operator)
          .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, twin);

        // Get the offer as a struct
        [, offerStruct, offerDatesStruct, offerDurationsStruct] = await offerHandler.connect(rando).getOffer(offer.id);

        // Parse into entities
        let returnedOffer = Offer.fromStruct(offerStruct);
        let returnedOfferDates = OfferDates.fromStruct(offerDatesStruct);
        let returnedOfferDurations = OfferDurations.fromStruct(offerDurationsStruct);

        // Returned values should match the input in createSellerAndOffer
        for ([key, value] of Object.entries(offer)) {
          expect(JSON.stringify(returnedOffer[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDates)) {
          expect(JSON.stringify(returnedOfferDates[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDurations)) {
          expect(JSON.stringify(returnedOfferDurations[key]) === JSON.stringify(value)).is.true;
        }

        // Get the twin as a struct
        [, twinStruct] = await twinHandler.connect(rando).getTwin(nextTwinId);

        // Parse into entity
        const returnedTwin = Twin.fromStruct(twinStruct);

        // Returned values should match the input in createOfferAndTwinWithBundle
        for ([key, value] of Object.entries(twin)) {
          expect(JSON.stringify(returnedTwin[key]) === JSON.stringify(value)).is.true;
        }

        // Get the bundle as a struct
        [, bundleStruct] = await bundleHandler.connect(rando).getBundle(bundleId);

        // Parse into entity
        let returnedBundle = Bundle.fromStruct(bundleStruct);

        // Returned values should match what is expected for the silently created bundle
        for ([key, value] of Object.entries(bundle)) {
          expect(JSON.stringify(returnedBundle[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should ignore any provided ids and assign the next available", async function () {
        offer.id = "555";
        twin.id = "777";

        // Create an offer, a twin and a bundle, testing for the events
        const tx = await orchestrationHandler
          .connect(operator)
          .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, twin);

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offerStruct, offerDatesStruct, offerDurationsStruct, operator.address);

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // TwinCreated event
        const eventTwinCreated = getEvent(txReceipt, orchestrationHandler, "TwinCreated");
        const twinInstance = Twin.fromStruct(eventTwinCreated.twin);
        // Validate the instance
        expect(twinInstance.isValid()).to.be.true;

        assert.equal(eventTwinCreated.twinId.toString(), nextTwinId, "Twin Id is incorrect");
        assert.equal(eventTwinCreated.sellerId.toString(), twin.sellerId, "Seller Id is incorrect");
        assert.equal(twinInstance.toString(), Twin.fromStruct(twinStruct).toString(), "Twin struct is incorrect");

        // BundleCreated event
        const eventBundleCreated = getEvent(txReceipt, orchestrationHandler, "BundleCreated");
        const bundleInstance = Bundle.fromStruct(eventBundleCreated.bundle);
        // Validate the instance
        expect(bundleInstance.isValid()).to.be.true;

        assert.equal(eventBundleCreated.bundleId.toString(), nextBundleId, "Bundle Id is incorrect");
        assert.equal(eventBundleCreated.sellerId.toString(), bundle.sellerId, "Seller Id is incorrect");
        assert.equal(
          bundleInstance.toString(),
          Bundle.fromStruct(bundleStruct).toString(),
          "Bundle struct is incorrect"
        );
      });

      it("should ignore any provided seller and assign seller id of msg.sender", async function () {
        // set some other sellerId
        offer.sellerId = "123";
        twin.sellerId = "456";

        // Create an offer, a twin and a bundle, testing for the events
        const tx = await orchestrationHandler
          .connect(operator)
          .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, twin);

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offerStruct, offerDatesStruct, offerDurationsStruct, operator.address);

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // TwinCreated event
        const eventTwinCreated = getEvent(txReceipt, orchestrationHandler, "TwinCreated");
        const twinInstance = Twin.fromStruct(eventTwinCreated.twin);
        // Validate the instance
        expect(twinInstance.isValid()).to.be.true;

        assert.equal(eventTwinCreated.twinId.toString(), nextTwinId, "Twin Id is incorrect");
        assert.equal(eventTwinCreated.sellerId.toString(), sellerId, "Seller Id is incorrect");
        assert.equal(twinInstance.toString(), Twin.fromStruct(twinStruct).toString(), "Twin struct is incorrect");

        // BundleCreated event
        const eventBundleCreated = getEvent(txReceipt, orchestrationHandler, "BundleCreated");
        const bundleInstance = Bundle.fromStruct(eventBundleCreated.bundle);
        // Validate the instance
        expect(bundleInstance.isValid()).to.be.true;

        assert.equal(eventBundleCreated.bundleId.toString(), nextBundleId, "Bundle Id is incorrect");
        assert.equal(eventBundleCreated.sellerId.toString(), sellerId, "Seller Id is incorrect");
        assert.equal(
          bundleInstance.toString(),
          Bundle.fromStruct(bundleStruct).toString(),
          "Bundle struct is incorrect"
        );
      });

      it("should ignore any provided protocol fee and calculate the correct one", async function () {
        // set some protocole fee
        offer.protocolFee = "999";

        // Create an offer, a twin and a bundle, testing for the events
        await expect(
          orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, offerDates, offerDurations, twin)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offerStruct, offerDatesStruct, offerDurationsStruct, operator.address);
      });

      it("If exchange token is $BOSON, fee should be flat boson fee", async function () {
        // Prepare an offer with $BOSON as exchange token
        offer.exchangeToken = bosonToken.address;
        offer.protocolFee = protocolFeeFlatBoson;

        // Create an offer, a twin and a bundle, testing for the events
        await expect(
          orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, offerDates, offerDurations, twin)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offer.toStruct(), offerDatesStruct, offerDurationsStruct, operator.address);
      });

      it("For absolute zero offers, dispute resolver can be unspecified", async function () {
        // Prepare an absolute zero offer
        offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = offer.protocolFee = "0";
        offer.disputeResolverId = "0";

        // Create an offer, a twin and a bundle, testing for the events
        await expect(
          orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, offerDates, offerDurations, twin)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offer.toStruct(), offerDatesStruct, offerDurationsStruct, operator.address);
      });

      it("Should allow creation of an offer with unlimited supply", async function () {
        // Prepare an absolute zero offer
        offer.quantityAvailable = ethers.constants.MaxUint256.toString();

        // Create an offer, a twin and a bundle, testing for the events
        await expect(
          orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, offerDates, offerDurations, twin)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offer.toStruct(), offerDatesStruct, offerDurationsStruct, operator.address);
      });

      context("💔 Revert Reasons", async function () {
        it("Caller not operator of any seller", async function () {
          // Attempt to create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler.connect(rando).createOfferAndTwinWithBundle(offer, offerDates, offerDurations, twin)
          ).to.revertedWith(RevertReasons.NOT_OPERATOR);
        });

        it("Valid from date is greater than valid until date", async function () {
          // Reverse the from and until dates
          offerDates.validFrom = ethers.BigNumber.from(Date.now() + oneMonth * 6).toString(); // 6 months from now
          offerDates.validUntil = ethers.BigNumber.from(Date.now()).toString(); // now

          // Attempt to create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, offerDates, offerDurations, twin)
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Valid until date is not in the future", async function () {
          // Set until date in the past
          offerDates.validUntil = ethers.BigNumber.from(Date.now() - oneMonth * 6).toString(); // 6 months ago

          // Attempt to create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, offerDates, offerDurations, twin)
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Buyer cancel penalty is less than item price", async function () {
          // Set buyer cancel penalty higher than offer price
          offer.buyerCancelPenalty = ethers.BigNumber.from(offer.price).add(10).toString();

          // Attempt to create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, offerDates, offerDurations, twin)
          ).to.revertedWith(RevertReasons.OFFER_PENALTY_INVALID);
        });

        it("Offer cannot be voided at the time of the creation", async function () {
          // Set voided flag to true
          offer.voided = true;

          // Attempt to create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, offerDates, offerDurations, twin)
          ).to.revertedWith(RevertReasons.OFFER_MUST_BE_ACTIVE);
        });

        it("Both voucher expiration date and voucher expiraton period are defined", async function () {
          // Set both voucherRedeemableUntil and voucherValid
          offerDates.voucherRedeemableUntil = (Number(offerDates.voucherRedeemableFrom) + oneMonth).toString();
          offerDurations.voucherValid = oneMonth.toString();

          // Attempt to create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, offerDates, offerDurations, twin)
          ).to.revertedWith(RevertReasons.AMBIGUOUS_VOUCHER_EXPIRY);
        });

        it("Neither of voucher expiration date and voucher expiraton period are defined", async function () {
          // Set both voucherRedeemableUntil and voucherValid to "0"
          offerDates.voucherRedeemableUntil = "0";
          offerDurations.voucherValid = "0";

          // Attempt to create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, offerDates, offerDurations, twin)
          ).to.revertedWith(RevertReasons.AMBIGUOUS_VOUCHER_EXPIRY);
        });

        it("Voucher redeemable period is fixed, but it ends before it starts", async function () {
          // Set both voucherRedeemableUntil that is less than voucherRedeemableFrom
          offerDates.voucherRedeemableUntil = (Number(offerDates.voucherRedeemableFrom) - 10).toString();
          offerDurations.voucherValid = "0";

          // Attempt to create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, offerDates, offerDurations, twin)
          ).to.revertedWith(RevertReasons.REDEMPTION_PERIOD_INVALID);
        });

        it("Voucher redeemable period is fixed, but it ends before offer expires", async function () {
          // Set both voucherRedeemableUntil that is more than voucherRedeemableFrom but less than validUntil
          offerDates.voucherRedeemableFrom = "0";
          offerDates.voucherRedeemableUntil = (Number(offerDates.validUntil) - 10).toString();
          offerDurations.voucherValid = "0";

          // Attempt to create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, offerDates, offerDurations, twin)
          ).to.revertedWith(RevertReasons.REDEMPTION_PERIOD_INVALID);
        });

        it("Fulfillment period is set to zero", async function () {
          // Set fulfilment period to 0
          offerDurations.fulfillmentPeriod = "0";

          // Attempt to create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, offerDates, offerDurations, twin)
          ).to.revertedWith(RevertReasons.INVALID_FULFILLMENT_PERIOD);
        });

        it("Resolution period is set to zero", async function () {
          // Set dispute duration period to 0
          offerDurations.resolutionPeriod = "0";

          // Attempt to create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, offerDates, offerDurations, twin)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_DURATION);
        });

        it("Available quantity is set to zero", async function () {
          // Set available quantity to 0
          offer.quantityAvailable = "0";

          // Attempt to create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, offerDates, offerDurations, twin)
          ).to.revertedWith(RevertReasons.INVALID_QUANTITY_AVAILABLE);
        });

        it("Dispute resolver wallet is not registered", async function () {
          // Set some address that is not registered as a dispute resolver
          offer.disputeResolverId = "16";

          // Attempt to create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, offerDates, offerDurations, twin)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        it("For absolute zero offer, specified dispute resolver is not registered", async function () {
          // Prepare an absolute zero offer, but specify dispute resolver
          offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = offer.protocolFee = "0";
          offer.disputeResolverId = "16";

          // Attempt to create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, offerDates, offerDurations, twin)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        it("should revert if protocol is not approved to transfer the ERC20 token", async function () {
          // Approving the twinHandler contract to transfer seller's tokens
          await bosonToken.connect(operator).approve(twinHandler.address, 0); // approving the twin handler

          //ERC20 token address
          twin.tokenAddress = bosonToken.address;

          await expect(
            orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, offerDates, offerDurations, twin)
          ).to.revertedWith(RevertReasons.NO_TRANSFER_APPROVED);
        });

        it("should revert if protocol is not approved to transfer the ERC721 token", async function () {
          //ERC721 token address
          twin.tokenAddress = foreign721.address;

          await expect(
            orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, offerDates, offerDurations, twin)
          ).to.revertedWith(RevertReasons.NO_TRANSFER_APPROVED);
        });

        it("should revert if protocol is not approved to transfer the ERC1155 token", async function () {
          //ERC1155 token address
          twin.tokenAddress = foreign1155.address;

          await expect(
            orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, offerDates, offerDurations, twin)
          ).to.revertedWith(RevertReasons.NO_TRANSFER_APPROVED);
        });

        context("Token address is unsupported", async function () {
          it("Token address is a zero address", async function () {
            twin.tokenAddress = ethers.constants.AddressZero;

            await expect(
              orchestrationHandler
                .connect(operator)
                .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, twin)
            ).to.be.revertedWith(RevertReasons.UNSUPPORTED_TOKEN);
          });

          it("Token address is a contract address that does not support the isApprovedForAll", async function () {
            twin.tokenAddress = twinHandler.address;

            await expect(
              orchestrationHandler
                .connect(operator)
                .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, twin)
            ).to.be.revertedWith(RevertReasons.UNSUPPORTED_TOKEN);
          });

          it("Token address is a contract that reverts from a fallback method", async function () {
            twin.tokenAddress = fallbackError.address;

            await expect(
              orchestrationHandler
                .connect(operator)
                .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, twin)
            ).to.be.revertedWith(RevertReasons.UNSUPPORTED_TOKEN);
          });
        });
      });
    });

    context("👉 createOfferWithConditionAndTwinAndBundle()", async function () {
      beforeEach(async function () {
        // prepare a group struct. We are not passing it as an argument, but just need to validate.
        // The first group id
        nextGroupId = "1";

        // Required constructor params for Condition
        method = EvaluationMethod.Threshold;
        tokenType = TokenType.MultiToken;
        tokenAddress = accounts[0].address; // just need an address
        tokenId = "5150";
        threshold = "1";
        maxCommits = "1";

        // Required constructor params for Group
        id = nextGroupId;
        sellerId = "2"; // "1" is dispute resolver;
        offerIds = ["1"];

        condition = new Condition(method, tokenType, tokenAddress, tokenId, threshold, maxCommits);
        expect(condition.isValid()).to.be.true;

        group = new Group(nextGroupId, sellerId, offerIds, condition);

        expect(group.isValid()).is.true;

        // How that group looks as a returned struct
        groupStruct = group.toStruct();

        // prepare a bundle struct. We are not passing it as an argument, but just need to validate.
        // The first bundle id
        bundleId = nextBundleId = "1";

        // Required constructor params for Bundle
        offerIds = ["1"];
        twinIds = ["1"];

        bundle = new Bundle(bundleId, sellerId, offerIds, twinIds);

        expect(bundle.isValid()).is.true;

        // How that bundle looks as a returned struct
        bundleStruct = bundle.toStruct();

        nextTwinId = "1";
        // Create a valid twin.
        twin = mockTwin(bosonToken.address);
        twin.sellerId = "2";

        // How that twin looks as a returned struct
        twinStruct = twin.toStruct();

        // create a seller
        await accountHandler.connect(admin).createSeller(seller);

        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(operator).approve(twinHandler.address, 1); // approving the twin handler
      });

      it("should emit an OfferCreated, a GroupCreated, a TwinCreated and a BundleCreated events", async function () {
        // Create an offer with condition, twin and bundle
        const tx = await orchestrationHandler
          .connect(operator)
          .createOfferWithConditionAndTwinAndBundle(offer, offerDates, offerDurations, condition, twin);

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offerStruct, offerDatesStruct, offerDurationsStruct, operator.address);

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // GroupCreated event
        const eventGroupCreated = getEvent(txReceipt, orchestrationHandler, "GroupCreated");
        const groupInstance = Group.fromStruct(eventGroupCreated.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(eventGroupCreated.groupId.toString(), group.id, "Group Id is incorrect");
        assert.equal(eventGroupCreated.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");

        // TwinCreated event
        const eventTwinCreated = getEvent(txReceipt, orchestrationHandler, "TwinCreated");
        const twinInstance = Twin.fromStruct(eventTwinCreated.twin);
        // Validate the instance
        expect(twinInstance.isValid()).to.be.true;

        assert.equal(eventTwinCreated.twinId.toString(), twin.id, "Twin Id is incorrect");
        assert.equal(eventTwinCreated.sellerId.toString(), twin.sellerId, "Seller Id is incorrect");
        assert.equal(twinInstance.toString(), twin.toString(), "Twin struct is incorrect");

        // BundleCreated event
        const eventBundleCreated = getEvent(txReceipt, orchestrationHandler, "BundleCreated");
        const bundleInstance = Bundle.fromStruct(eventBundleCreated.bundle);
        // Validate the instance
        expect(bundleInstance.isValid()).to.be.true;

        assert.equal(eventBundleCreated.bundleId.toString(), bundle.id, "Bundle Id is incorrect");
        assert.equal(eventBundleCreated.sellerId.toString(), bundle.sellerId, "Seller Id is incorrect");
        assert.equal(bundleInstance.toString(), bundle.toString(), "Bundle struct is incorrect");
      });

      it("should update state", async function () {
        // Create an offer with condition, twin and bundle
        await orchestrationHandler
          .connect(operator)
          .createOfferWithConditionAndTwinAndBundle(offer, offerDates, offerDurations, condition, twin);

        // Get the offer as a struct
        [, offerStruct, offerDatesStruct, offerDurationsStruct] = await offerHandler.connect(rando).getOffer(offer.id);

        // Parse into entities
        let returnedOffer = Offer.fromStruct(offerStruct);
        let returnedOfferDates = OfferDates.fromStruct(offerDatesStruct);
        let returnedOfferDurations = OfferDurations.fromStruct(offerDurationsStruct);

        // Returned values should match the input in createSellerAndOffer
        for ([key, value] of Object.entries(offer)) {
          expect(JSON.stringify(returnedOffer[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDates)) {
          expect(JSON.stringify(returnedOfferDates[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDurations)) {
          expect(JSON.stringify(returnedOfferDurations[key]) === JSON.stringify(value)).is.true;
        }

        // Get the group as a struct
        [, groupStruct] = await groupHandler.connect(rando).getGroup(nextGroupId);

        // Parse into entity
        const returnedGroup = Group.fromStruct(groupStruct);

        // Returned values should match should match what is expected for the silently created group
        for ([key, value] of Object.entries(group)) {
          expect(JSON.stringify(returnedGroup[key]) === JSON.stringify(value)).is.true;
        }

        // Get the twin as a struct
        [, twinStruct] = await twinHandler.connect(rando).getTwin(nextTwinId);

        // Parse into entity
        const returnedTwin = Twin.fromStruct(twinStruct);

        // Returned values should match the input in createOfferWithConditionAndTwinAndBundle
        for ([key, value] of Object.entries(twin)) {
          expect(JSON.stringify(returnedTwin[key]) === JSON.stringify(value)).is.true;
        }

        // Get the bundle as a struct
        [, bundleStruct] = await bundleHandler.connect(rando).getBundle(bundleId);

        // Parse into entity
        let returnedBundle = Bundle.fromStruct(bundleStruct);

        // Returned values should match what is expected for the silently created bundle
        for ([key, value] of Object.entries(bundle)) {
          expect(JSON.stringify(returnedBundle[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should ignore any provided ids and assign the next available", async function () {
        offer.id = "555";
        twin.id = "777";

        // Create an offer with condition, twin and bundle
        const tx = await orchestrationHandler
          .connect(operator)
          .createOfferWithConditionAndTwinAndBundle(offer, offerDates, offerDurations, condition, twin);

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offerStruct, offerDatesStruct, offerDurationsStruct, operator.address);

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // GroupCreated event
        const eventGroupCreated = getEvent(txReceipt, orchestrationHandler, "GroupCreated");
        const groupInstance = Group.fromStruct(eventGroupCreated.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(eventGroupCreated.groupId.toString(), nextGroupId, "Group Id is incorrect");
        assert.equal(eventGroupCreated.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");

        // TwinCreated event
        const eventTwinCreated = getEvent(txReceipt, orchestrationHandler, "TwinCreated");
        const twinInstance = Twin.fromStruct(eventTwinCreated.twin);
        // Validate the instance
        expect(twinInstance.isValid()).to.be.true;

        assert.equal(eventTwinCreated.twinId.toString(), nextTwinId, "Twin Id is incorrect");
        assert.equal(eventTwinCreated.sellerId.toString(), twin.sellerId, "Seller Id is incorrect");
        assert.equal(twinInstance.toString(), Twin.fromStruct(twinStruct).toString(), "Twin struct is incorrect");

        // BundleCreated event
        const eventBundleCreated = getEvent(txReceipt, orchestrationHandler, "BundleCreated");
        const bundleInstance = Bundle.fromStruct(eventBundleCreated.bundle);
        // Validate the instance
        expect(bundleInstance.isValid()).to.be.true;

        assert.equal(eventBundleCreated.bundleId.toString(), nextBundleId, "Bundle Id is incorrect");
        assert.equal(eventBundleCreated.sellerId.toString(), bundle.sellerId, "Seller Id is incorrect");
        assert.equal(
          bundleInstance.toString(),
          Bundle.fromStruct(bundleStruct).toString(),
          "Bundle struct is incorrect"
        );
      });

      it("should ignore any provided seller and assign seller id of msg.sender", async function () {
        // set some other sellerId
        offer.sellerId = "123";
        twin.sellerId = "456";

        // Create an offer with condition, twin and bundle
        const tx = await orchestrationHandler
          .connect(operator)
          .createOfferWithConditionAndTwinAndBundle(offer, offerDates, offerDurations, condition, twin);

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offerStruct, offerDatesStruct, offerDurationsStruct, operator.address);

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // GroupCreated event
        const eventGroupCreated = getEvent(txReceipt, orchestrationHandler, "GroupCreated");
        const groupInstance = Group.fromStruct(eventGroupCreated.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(eventGroupCreated.groupId.toString(), nextGroupId, "Group Id is incorrect");
        assert.equal(eventGroupCreated.sellerId.toString(), sellerId, "Seller Id is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");

        // TwinCreated event
        const eventTwinCreated = getEvent(txReceipt, orchestrationHandler, "TwinCreated");
        const twinInstance = Twin.fromStruct(eventTwinCreated.twin);
        // Validate the instance
        expect(twinInstance.isValid()).to.be.true;

        assert.equal(eventTwinCreated.twinId.toString(), nextTwinId, "Twin Id is incorrect");
        assert.equal(eventTwinCreated.sellerId.toString(), sellerId, "Seller Id is incorrect");
        assert.equal(twinInstance.toString(), Twin.fromStruct(twinStruct).toString(), "Twin struct is incorrect");

        // BundleCreated event
        const eventBundleCreated = getEvent(txReceipt, orchestrationHandler, "BundleCreated");
        const bundleInstance = Bundle.fromStruct(eventBundleCreated.bundle);
        // Validate the instance
        expect(bundleInstance.isValid()).to.be.true;

        assert.equal(eventBundleCreated.bundleId.toString(), nextBundleId, "Bundle Id is incorrect");
        assert.equal(eventBundleCreated.sellerId.toString(), sellerId, "Seller Id is incorrect");
        assert.equal(
          bundleInstance.toString(),
          Bundle.fromStruct(bundleStruct).toString(),
          "Bundle struct is incorrect"
        );
      });

      it("should ignore any provided protocol fee and calculate the correct one", async function () {
        // set some protocole fee
        offer.protocolFee = "999";

        // Create an offer with condition, twin and bundle testing for the events
        await expect(
          orchestrationHandler
            .connect(operator)
            .createOfferWithConditionAndTwinAndBundle(offer, offerDates, offerDurations, condition, twin)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offerStruct, offerDatesStruct, offerDurationsStruct, operator.address);
      });

      it("If exchange token is $BOSON, fee should be flat boson fee", async function () {
        // Prepare an offer with $BOSON as exchange token
        offer.exchangeToken = bosonToken.address;
        offer.protocolFee = protocolFeeFlatBoson;

        // Create an offer with condition, twin and bundle testing for the events
        await expect(
          orchestrationHandler
            .connect(operator)
            .createOfferWithConditionAndTwinAndBundle(offer, offerDates, offerDurations, condition, twin)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offer.toStruct(), offerDatesStruct, offerDurationsStruct, operator.address);
      });

      it("For absolute zero offers, dispute resolver can be unspecified", async function () {
        // Prepare an absolute zero offer
        offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = offer.protocolFee = "0";
        offer.disputeResolverId = "0";

        // Create an offer with condition, twin and bundle testing for the events
        await expect(
          orchestrationHandler
            .connect(operator)
            .createOfferWithConditionAndTwinAndBundle(offer, offerDates, offerDurations, condition, twin)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offer.toStruct(), offerDatesStruct, offerDurationsStruct, operator.address);
      });

      it("Should allow creation of an offer with unlimited supply", async function () {
        // Prepare an absolute zero offer
        offer.quantityAvailable = ethers.constants.MaxUint256.toString();

        // Create an offer with condition, twin and bundle testing for the events
        await expect(
          orchestrationHandler
            .connect(operator)
            .createOfferWithConditionAndTwinAndBundle(offer, offerDates, offerDurations, condition, twin)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offer.toStruct(), offerDatesStruct, offerDurationsStruct, operator.address);
      });
    });

    context("👉 createSellerAndOfferWithCondition()", async function () {
      beforeEach(async function () {
        // prepare a group struct. We are not passing it as an argument, but just need to validate.

        // The first group id
        nextGroupId = "1";

        // Required constructor params for Condition
        method = EvaluationMethod.Threshold;
        tokenType = TokenType.MultiToken;
        tokenAddress = accounts[0].address; // just need an address
        tokenId = "5150";
        threshold = "1";
        maxCommits = "1";

        // Required constructor params for Group
        id = nextGroupId;
        sellerId = "2"; // "1" is dispute resolver;
        offerIds = ["1"];

        condition = new Condition(method, tokenType, tokenAddress, tokenId, threshold, maxCommits);
        expect(condition.isValid()).to.be.true;

        group = new Group(nextGroupId, sellerId, offerIds, condition);

        expect(group.isValid()).is.true;

        // How that group looks as a returned struct
        groupStruct = group.toStruct();
      });

      it("should emit a SellerCreated, an OfferCreated, and a GroupCreated event", async function () {
        // Create a seller and an offer with condition, testing for the events
        const tx = await orchestrationHandler
          .connect(operator)
          .createSellerAndOfferWithCondition(seller, offer, offerDates, offerDurations, condition);

        // SellerCreated and OfferCreated events
        await expect(tx)
          .to.emit(orchestrationHandler, "SellerCreated")
          .withArgs(seller.id, sellerStruct, operator.address)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offerStruct, offerDatesStruct, offerDurationsStruct, operator.address);

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // GroupCreated event
        const eventGroupCreated = getEvent(txReceipt, orchestrationHandler, "GroupCreated");
        const groupInstance = Group.fromStruct(eventGroupCreated.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(eventGroupCreated.groupId.toString(), group.id, "Group Id is incorrect");
        assert.equal(eventGroupCreated.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
      });

      it("should update state", async function () {
        // Create a seller and an offer with condition
        await orchestrationHandler
          .connect(operator)
          .createSellerAndOfferWithCondition(seller, offer, offerDates, offerDurations, condition);

        // Get the seller as a struct
        [, sellerStruct] = await accountHandler.connect(rando).getSeller(seller.id);

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);

        // Returned values should match the input in createSellerAndOfferWithCondition
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }

        // Get the offer as a struct
        [, offerStruct, offerDatesStruct, offerDurationsStruct] = await offerHandler.connect(rando).getOffer(offer.id);

        // Parse into entities
        let returnedOffer = Offer.fromStruct(offerStruct);
        let returnedOfferDates = OfferDates.fromStruct(offerDatesStruct);
        let returnedOfferDurations = OfferDurations.fromStruct(offerDurationsStruct);

        // Returned values should match the input in createSellerAndOffer
        for ([key, value] of Object.entries(offer)) {
          expect(JSON.stringify(returnedOffer[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDates)) {
          expect(JSON.stringify(returnedOfferDates[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDurations)) {
          expect(JSON.stringify(returnedOfferDurations[key]) === JSON.stringify(value)).is.true;
        }

        // Get the group as a struct
        [, groupStruct] = await groupHandler.connect(rando).getGroup(nextGroupId);

        // Parse into entity
        const returnedGroup = Group.fromStruct(groupStruct);

        // Returned values should match what is expected for the silently created group
        for ([key, value] of Object.entries(group)) {
          expect(JSON.stringify(returnedGroup[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should ignore any provided ids and assign the next available", async function () {
        offer.id = "555";
        seller.id = "444";

        // Create a seller and an offer with condition, testing for the events
        const tx = await orchestrationHandler
          .connect(operator)
          .createSellerAndOfferWithCondition(seller, offer, offerDates, offerDurations, condition);

        // SellerCreated and OfferCreated events
        await expect(tx)
          .to.emit(orchestrationHandler, "SellerCreated")
          .withArgs(seller.id, sellerStruct)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offerStruct, offerDatesStruct, offerDurationsStruct, operator.address);

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // GroupCreated event
        const eventGroupCreated = getEvent(txReceipt, orchestrationHandler, "GroupCreated");
        const groupInstance = Group.fromStruct(eventGroupCreated.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(eventGroupCreated.groupId.toString(), nextOfferId, "Group Id is incorrect");
        assert.equal(eventGroupCreated.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
      });
    });

    context("👉 createSellerAndOfferAndTwinWithBundle()", async function () {
      beforeEach(async function () {
        // prepare a bundle struct. We are not passing it as an argument, but just need to validate.

        // The first bundle id
        bundleId = nextBundleId = "1";

        // Required constructor params for Bundle
        offerIds = ["1"];
        twinIds = ["1"];

        bundle = new Bundle(bundleId, sellerId, offerIds, twinIds);

        expect(bundle.isValid()).is.true;

        // How that bundle looks as a returned struct
        bundleStruct = bundle.toStruct();

        nextTwinId = "1";

        // Create a valid twin.
        twin = mockTwin(bosonToken.address);
        twin.sellerId = "2";

        // How that twin looks as a returned struct
        twinStruct = twin.toStruct();
      });

      it("should emit a SellerCreated, an OfferCreated, a TwinCreated and a BundleCreated event", async function () {
        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(operator).approve(twinHandler.address, 1); // approving the twin handler

        // Create a seller, an offer with condition and a twin with bundle, testing for the events
        const tx = await orchestrationHandler
          .connect(operator)
          .createSellerAndOfferAndTwinWithBundle(seller, offer, offerDates, offerDurations, twin);

        // SellerCreated and OfferCreated events
        await expect(tx)
          .to.emit(orchestrationHandler, "SellerCreated")
          .withArgs(seller.id, sellerStruct, operator.address)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offerStruct, offerDatesStruct, offerDurationsStruct, operator.address);

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // TwinCreated event
        const eventTwinCreated = getEvent(txReceipt, orchestrationHandler, "TwinCreated");
        const twinInstance = Twin.fromStruct(eventTwinCreated.twin);
        // Validate the instance
        expect(twinInstance.isValid()).to.be.true;

        assert.equal(eventTwinCreated.twinId.toString(), twin.id, "Twin Id is incorrect");
        assert.equal(eventTwinCreated.sellerId.toString(), twin.sellerId, "Seller Id is incorrect");
        assert.equal(eventTwinCreated.executedBy.toString(), operator.address, "Executed by is incorrect");
        assert.equal(twinInstance.toString(), twin.toString(), "Twin struct is incorrect");

        // BundleCreated event
        const eventBundleCreated = getEvent(txReceipt, orchestrationHandler, "BundleCreated");
        const bundleInstance = Bundle.fromStruct(eventBundleCreated.bundle);
        // Validate the instance
        expect(bundleInstance.isValid()).to.be.true;

        assert.equal(eventBundleCreated.bundleId.toString(), bundle.id, "Bundle Id is incorrect");
        assert.equal(eventBundleCreated.sellerId.toString(), bundle.sellerId, "Seller Id is incorrect");
        assert.equal(eventBundleCreated.executedBy.toString(), operator.address, "Executed by is incorrect");
        assert.equal(bundleInstance.toString(), bundle.toString(), "Bundle struct is incorrect");
      });

      it("should update state", async function () {
        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(operator).approve(twinHandler.address, 1); // approving the twin handler

        // Create a seller, an offer with condition and a twin with bundle, testing for the events
        await orchestrationHandler
          .connect(operator)
          .createSellerAndOfferAndTwinWithBundle(seller, offer, offerDates, offerDurations, twin);

        // Get the seller as a struct
        [, sellerStruct] = await accountHandler.connect(rando).getSeller(seller.id);

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);

        // Returned values should match the input in createSellerAndOfferAndTwinWithBundle
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }

        // Get the offer as a struct
        [, offerStruct, offerDatesStruct, offerDurationsStruct] = await offerHandler.connect(rando).getOffer(offer.id);

        // Parse into entities
        let returnedOffer = Offer.fromStruct(offerStruct);
        let returnedOfferDates = OfferDates.fromStruct(offerDatesStruct);
        let returnedOfferDurations = OfferDurations.fromStruct(offerDurationsStruct);

        // Returned values should match the input in createSellerAndOffer
        for ([key, value] of Object.entries(offer)) {
          expect(JSON.stringify(returnedOffer[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDates)) {
          expect(JSON.stringify(returnedOfferDates[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDurations)) {
          expect(JSON.stringify(returnedOfferDurations[key]) === JSON.stringify(value)).is.true;
        }

        // Get the twin as a struct
        [, twinStruct] = await twinHandler.connect(rando).getTwin(nextTwinId);

        // Parse into entity
        const returnedTwin = Twin.fromStruct(twinStruct);

        // Returned values should match the input in createSellerAndOfferAndTwinWithBundle
        for ([key, value] of Object.entries(twin)) {
          expect(JSON.stringify(returnedTwin[key]) === JSON.stringify(value)).is.true;
        }

        // Get the bundle as a struct
        [, bundleStruct] = await bundleHandler.connect(rando).getBundle(bundleId);

        // Parse into entity
        let returnedBundle = Bundle.fromStruct(bundleStruct);

        // Returned values should match what is expected for the silently created bundle
        for ([key, value] of Object.entries(bundle)) {
          expect(JSON.stringify(returnedBundle[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should ignore any provided ids and assign the next available", async function () {
        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(operator).approve(twinHandler.address, 1); // approving the twin handler

        seller.id = "333";
        offer.id = "555";
        twin.id = "777";

        // Create a seller, an offer with condition and a twin with bundle, testing for the events
        const tx = await orchestrationHandler
          .connect(operator)
          .createSellerAndOfferAndTwinWithBundle(seller, offer, offerDates, offerDurations, twin);

        // SellerCreated and OfferCreated events
        await expect(tx)
          .to.emit(orchestrationHandler, "SellerCreated")
          .withArgs(seller.id, sellerStruct, operator.address)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offerStruct, offerDatesStruct, offerDurationsStruct, operator.address);

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // TwinCreated event
        const eventTwinCreated = getEvent(txReceipt, orchestrationHandler, "TwinCreated");
        const twinInstance = Twin.fromStruct(eventTwinCreated.twin);
        // Validate the instance
        expect(twinInstance.isValid()).to.be.true;

        assert.equal(eventTwinCreated.twinId.toString(), nextTwinId, "Twin Id is incorrect");
        assert.equal(eventTwinCreated.sellerId.toString(), twin.sellerId, "Seller Id is incorrect");
        assert.equal(twinInstance.toString(), Twin.fromStruct(twinStruct).toString(), "Twin struct is incorrect");

        // BundleCreated event
        const eventBundleCreated = getEvent(txReceipt, orchestrationHandler, "BundleCreated");
        const bundleInstance = Bundle.fromStruct(eventBundleCreated.bundle);
        // Validate the instance
        expect(bundleInstance.isValid()).to.be.true;

        assert.equal(eventBundleCreated.bundleId.toString(), nextBundleId, "Bundle Id is incorrect");
        assert.equal(eventBundleCreated.sellerId.toString(), bundle.sellerId, "Seller Id is incorrect");
        assert.equal(
          bundleInstance.toString(),
          Bundle.fromStruct(bundleStruct).toString(),
          "Bundle struct is incorrect"
        );
      });
    });

    context("👉 createSellerAndOfferWithConditionAndTwinAndBundle()", async function () {
      beforeEach(async function () {
        // prepare a group struct. We are not passing it as an argument, but just need to validate.
        // The first group id
        nextGroupId = "1";

        // Required constructor params for Condition
        method = EvaluationMethod.Threshold;
        tokenType = TokenType.MultiToken;
        tokenAddress = accounts[0].address; // just need an address
        tokenId = "5150";
        threshold = "1";
        maxCommits = "1";

        // Required constructor params for Group
        id = nextGroupId;
        sellerId = "2"; // "1" is dispute resolver;
        offerIds = ["1"];

        condition = new Condition(method, tokenType, tokenAddress, tokenId, threshold, maxCommits);
        expect(condition.isValid()).to.be.true;

        group = new Group(nextGroupId, sellerId, offerIds, condition);

        expect(group.isValid()).is.true;

        // How that group looks as a returned struct
        groupStruct = group.toStruct();

        // prepare a bundle struct. We are not passing it as an argument, but just need to validate.
        // The first bundle id
        bundleId = nextBundleId = "1";

        // Required constructor params for Bundle
        offerIds = ["1"];
        twinIds = ["1"];

        bundle = new Bundle(bundleId, sellerId, offerIds, twinIds);

        expect(bundle.isValid()).is.true;

        // How that bundle looks as a returned struct
        bundleStruct = bundle.toStruct();

        nextTwinId = "1";

        // Create a valid twin.
        twin = mockTwin(bosonToken.address);
        twin.sellerId = sellerId;

        // How that twin looks as a returned struct
        twinStruct = twin.toStruct();
      });

      it("should emit a SellerCreated, an OfferCreated, a GroupCreated, a TwinCreated and a BundleCreated event", async function () {
        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(operator).approve(twinHandler.address, 1); // approving the twin handler

        // Create a seller, an offer with condition, twin and bundle
        const tx = await orchestrationHandler
          .connect(operator)
          .createSellerAndOfferWithConditionAndTwinAndBundle(
            seller,
            offer,
            offerDates,
            offerDurations,
            condition,
            twin
          );

        // SellerCreated and OfferCreated events
        await expect(tx)
          .to.emit(orchestrationHandler, "SellerCreated")
          .withArgs(seller.id, sellerStruct, operator.address)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offerStruct, offerDatesStruct, offerDurationsStruct, operator.address);

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // GroupCreated event
        const eventGroupCreated = getEvent(txReceipt, orchestrationHandler, "GroupCreated");
        const groupInstance = Group.fromStruct(eventGroupCreated.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(eventGroupCreated.groupId.toString(), group.id, "Group Id is incorrect");
        assert.equal(eventGroupCreated.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");

        // TwinCreated event
        const eventTwinCreated = getEvent(txReceipt, orchestrationHandler, "TwinCreated");
        const twinInstance = Twin.fromStruct(eventTwinCreated.twin);
        // Validate the instance
        expect(twinInstance.isValid()).to.be.true;

        assert.equal(eventTwinCreated.twinId.toString(), twin.id, "Twin Id is incorrect");
        assert.equal(eventTwinCreated.sellerId.toString(), twin.sellerId, "Seller Id is incorrect");
        assert.equal(twinInstance.toString(), twin.toString(), "Twin struct is incorrect");

        // BundleCreated event
        const eventBundleCreated = getEvent(txReceipt, orchestrationHandler, "BundleCreated");
        const bundleInstance = Bundle.fromStruct(eventBundleCreated.bundle);
        // Validate the instance
        expect(bundleInstance.isValid()).to.be.true;

        assert.equal(eventBundleCreated.bundleId.toString(), bundle.id, "Bundle Id is incorrect");
        assert.equal(eventBundleCreated.sellerId.toString(), bundle.sellerId, "Seller Id is incorrect");
        assert.equal(bundleInstance.toString(), bundle.toString(), "Bundle struct is incorrect");
      });

      it("should update state", async function () {
        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(operator).approve(twinHandler.address, 1); // approving the twin handler

        // Create a seller, an offer with condition, twin and bundle
        await orchestrationHandler
          .connect(operator)
          .createSellerAndOfferWithConditionAndTwinAndBundle(
            seller,
            offer,
            offerDates,
            offerDurations,
            condition,
            twin
          );

        // Get the seller as a struct
        [, sellerStruct] = await accountHandler.connect(rando).getSeller(seller.id);

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);

        // Returned values should match the input in createSellerAndOfferWithConditionAndTwinAndBundle
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }

        // Get the offer as a struct
        [, offerStruct, offerDatesStruct, offerDurationsStruct] = await offerHandler.connect(rando).getOffer(offer.id);

        // Parse into entities
        let returnedOffer = Offer.fromStruct(offerStruct);
        let returnedOfferDates = OfferDates.fromStruct(offerDatesStruct);
        let returnedOfferDurations = OfferDurations.fromStruct(offerDurationsStruct);

        // Returned values should match the input in createSellerAndOffer
        for ([key, value] of Object.entries(offer)) {
          expect(JSON.stringify(returnedOffer[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDates)) {
          expect(JSON.stringify(returnedOfferDates[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDurations)) {
          expect(JSON.stringify(returnedOfferDurations[key]) === JSON.stringify(value)).is.true;
        }

        // Get the group as a struct
        [, groupStruct] = await groupHandler.connect(rando).getGroup(nextGroupId);

        // Parse into entity
        const returnedGroup = Group.fromStruct(groupStruct);

        // Returned values should match should match what is expected for the silently created group
        for ([key, value] of Object.entries(group)) {
          expect(JSON.stringify(returnedGroup[key]) === JSON.stringify(value)).is.true;
        }

        // Get the twin as a struct
        [, twinStruct] = await twinHandler.connect(rando).getTwin(nextTwinId);

        // Parse into entity
        const returnedTwin = Twin.fromStruct(twinStruct);

        // Returned values should match the input in createSellerAndOfferWithConditionAndTwinAndBundle
        for ([key, value] of Object.entries(twin)) {
          expect(JSON.stringify(returnedTwin[key]) === JSON.stringify(value)).is.true;
        }

        // Get the bundle as a struct
        [, bundleStruct] = await bundleHandler.connect(rando).getBundle(bundleId);

        // Parse into entity
        let returnedBundle = Bundle.fromStruct(bundleStruct);

        // Returned values should match what is expected for the silently created bundle
        for ([key, value] of Object.entries(bundle)) {
          expect(JSON.stringify(returnedBundle[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should ignore any provided ids and assign the next available", async function () {
        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(operator).approve(twinHandler.address, 1); // approving the twin handler

        seller.id = "333";
        offer.id = "555";
        twin.id = "777";

        // Create a seller, an offer with condition, twin and bundle
        const tx = await orchestrationHandler
          .connect(operator)
          .createSellerAndOfferWithConditionAndTwinAndBundle(
            seller,
            offer,
            offerDates,
            offerDurations,
            condition,
            twin
          );

        // SellerCreated and OfferCreated events
        await expect(tx)
          .to.emit(orchestrationHandler, "SellerCreated")
          .withArgs(seller.id, sellerStruct, operator.address)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offerStruct, offerDatesStruct, offerDurationsStruct, operator.address);

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // GroupCreated event
        const eventGroupCreated = getEvent(txReceipt, orchestrationHandler, "GroupCreated");
        const groupInstance = Group.fromStruct(eventGroupCreated.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(eventGroupCreated.groupId.toString(), nextGroupId, "Group Id is incorrect");
        assert.equal(eventGroupCreated.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");

        // TwinCreated event
        const eventTwinCreated = getEvent(txReceipt, orchestrationHandler, "TwinCreated");
        const twinInstance = Twin.fromStruct(eventTwinCreated.twin);
        // Validate the instance
        expect(twinInstance.isValid()).to.be.true;

        assert.equal(eventTwinCreated.twinId.toString(), nextTwinId, "Twin Id is incorrect");
        assert.equal(eventTwinCreated.sellerId.toString(), twin.sellerId, "Seller Id is incorrect");
        assert.equal(twinInstance.toString(), Twin.fromStruct(twinStruct).toString(), "Twin struct is incorrect");

        // BundleCreated event
        const eventBundleCreated = getEvent(txReceipt, orchestrationHandler, "BundleCreated");
        const bundleInstance = Bundle.fromStruct(eventBundleCreated.bundle);
        // Validate the instance
        expect(bundleInstance.isValid()).to.be.true;

        assert.equal(eventBundleCreated.bundleId.toString(), nextBundleId, "Bundle Id is incorrect");
        assert.equal(eventBundleCreated.sellerId.toString(), bundle.sellerId, "Seller Id is incorrect");
        assert.equal(
          bundleInstance.toString(),
          Bundle.fromStruct(bundleStruct).toString(),
          "Bundle struct is incorrect"
        );
      });
    });
  });
});
