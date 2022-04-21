const hre = require("hardhat");
const ethers = hre.ethers;
const { assert, expect } = require("chai");
const { gasLimit } = require("../../environments");

const Role = require("../../scripts/domain/Role");
const Seller = require("../../scripts/domain/Seller");
const Offer = require("../../scripts/domain/Offer");
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
const { getEvent } = require("../../scripts/util/test-utils.js");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");

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
  let group, groupStruct, nextGroupId;
  let method, tokenAddress, tokenId, threshold;
  let offerIds, condition;
  let twin, twinStruct, twinIds, nextTwinId;
  let bundle, bundleStruct, bundleId, nextBundleId;
  let bosonToken, supplyAvailable, supplyIds;
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

    // Cast Diamond to IGroupHandler
    groupHandler = await ethers.getContractAt("IBosonGroupHandler", protocolDiamond.address);

    // Cast Diamond to ITwinHandler
    twinHandler = await ethers.getContractAt("IBosonTwinHandler", protocolDiamond.address);

    // Cast Diamond to IBundleHandler
    bundleHandler = await ethers.getContractAt("IBosonBundleHandler", protocolDiamond.address);

    // Cast Diamond to IOrchestrationHandler
    orchestrationHandler = await ethers.getContractAt("IBosonOrchestrationHandler", protocolDiamond.address);

    // Deploy the mock tokens
    [bosonToken, foreign721, foreign1155, fallbackError] = await deployMockTokens(gasLimit);
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
      it("should emit a SellerCreated and OfferCreated event", async function () {
        // Create an offer, testing for the event
        await expect(orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer))
          .to.emit(orchestrationHandler, "SellerCreated")
          .withArgs(seller.id, sellerStruct)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(nextOfferId, offer.sellerId, offerStruct);
      });

      it("should update state", async function () {
        // Create an offer
        await orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer);

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
        await expect(orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer))
          .to.emit(orchestrationHandler, "SellerCreated")
          .withArgs(nextAccountId, sellerStruct)
          .to.emit(orchestrationHandler, "OfferCreated")
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
        await expect(orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer))
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offerStruct);
      });

      context("💔 Revert Reasons", async function () {
        it("active is false", async function () {
          seller.active = false;

          // Attempt to Create a seller, expecting revert
          await expect(orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer)).to.revertedWith(
            RevertReasons.MUST_BE_ACTIVE
          );
        });

        it("addresses are the zero address", async function () {
          seller.clerk = ethers.constants.AddressZero;

          // Attempt to Create a seller, expecting revert
          await expect(orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer)).to.revertedWith(
            RevertReasons.INVALID_ADDRESS
          );

          seller.clerk = clerk.address;
          seller.admin = ethers.constants.AddressZero;

          // Attempt to Create a seller, expecting revert
          await expect(orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer)).to.revertedWith(
            RevertReasons.INVALID_ADDRESS
          );
        });

        it("addresses are not unique to this seller Id", async function () {
          // Create a seller
          await accountHandler.connect(admin).createSeller(seller);

          seller.admin = other1.address;
          seller.clerk = other2.address;

          // Attempt to Create a seller with non-unique operator, expecting revert
          await expect(orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer)).to.revertedWith(
            RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE
          );

          seller.admin = admin.address;
          seller.operator = other1.address;

          // Attempt to Create a seller with non-unique admin, expecting revert
          await expect(orchestrationHandler.connect(other1).createSellerAndOffer(seller, offer)).to.revertedWith(
            RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE
          );

          seller.clerk = clerk.address;
          seller.admin = other2.address;

          // Attempt to Create a seller with non-unique clerk, expecting revert
          await expect(orchestrationHandler.connect(other1).createSellerAndOffer(seller, offer)).to.revertedWith(
            RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE
          );
        });

        it("Caller is not operator the specified in seller", async function () {
          // Attempt to Create an offer, expecting revert
          await expect(orchestrationHandler.connect(rando).createSellerAndOffer(seller, offer)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );
        });

        it("Valid from date is greater than valid until date", async function () {
          // Reverse the from and until dates
          offer.validFromDate = ethers.BigNumber.from(Date.now() + oneMonth * 6).toString(); // 6 months from now
          offer.validUntilDate = ethers.BigNumber.from(Date.now()).toString(); // now

          // Attempt to Create an offer, expecting revert
          await expect(orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer)).to.revertedWith(
            RevertReasons.OFFER_PERIOD_INVALID
          );
        });

        it("Valid until date is not in the future", async function () {
          // Set until date in the past
          offer.validUntilDate = ethers.BigNumber.from(Date.now() - oneMonth * 6).toString(); // 6 months ago

          // Attempt to Create an offer, expecting revert
          await expect(orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer)).to.revertedWith(
            RevertReasons.OFFER_PERIOD_INVALID
          );
        });

        it("Buyer cancel penalty is less than item price", async function () {
          // Set buyer cancel penalty higher than offer price
          offer.buyerCancelPenalty = ethers.BigNumber.from(offer.price).add(10).toString();

          // Attempt to Create an offer, expecting revert
          await expect(orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer)).to.revertedWith(
            RevertReasons.OFFER_PENALTY_INVALID
          );
        });

        it("Offer cannot be voided at the time of the creation", async function () {
          // Set voided flag to true
          offer.voided = true;

          // Attempt to Create an offer, expecting revert
          await expect(orchestrationHandler.connect(operator).createSellerAndOffer(seller, offer)).to.revertedWith(
            RevertReasons.OFFER_MUST_BE_ACTIVE
          );
        });
      });
    });

    context("👉 createOfferWithCondition()", async function () {
      beforeEach(async function () {
        // prepare a group struct. We are not passing it as an argument, but just need to validate.

        // The first group id
        nextGroupId = "1";

        // Required constructor params for Condition
        method = EvaluationMethod.AboveThreshold;
        tokenAddress = accounts[0].address; // just need an address
        tokenId = "5150";
        threshold = "1";

        // Required constructor params for Group
        id = nextGroupId;
        sellerId = "1";
        offerIds = ["1"];

        condition = new Condition(method, tokenAddress, tokenId, threshold);
        expect(condition.isValid()).to.be.true;

        group = new Group(nextGroupId, sellerId, offerIds, condition);

        expect(group.isValid()).is.true;

        // How that group looks as a returned struct
        groupStruct = group.toStruct();

        // create a seller
        await accountHandler.connect(admin).createSeller(seller);
      });

      it("should emit an OfferCreated and GroupCreated event", async function () {
        // Create an offer with condition, testing for the events
        const tx = await orchestrationHandler.connect(operator).createOfferWithCondition(offer, condition);
        const txReceipt = await tx.wait();

        // OfferCreated event
        const eventOfferCreated = getEvent(txReceipt, orchestrationHandler, "OfferCreated");
        const offerInstance = Offer.fromStruct(eventOfferCreated.offer);
        // Validate the instance
        expect(offerInstance.isValid()).to.be.true;

        assert.equal(eventOfferCreated.offerId.toString(), offer.id, "Offer Id is incorrect");
        assert.equal(eventOfferCreated.sellerId.toString(), offer.sellerId, "Seller Id is incorrect");
        assert.equal(offerInstance.toString(), offer.toString(), "Offer struct is incorrect");

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
        // Create an offer with condition
        await orchestrationHandler.connect(operator).createOfferWithCondition(offer, condition);

        // Get the offer as a struct
        [, offerStruct] = await offerHandler.connect(rando).getOffer(id);

        // Parse into entity
        let returnedOffer = Offer.fromStruct(offerStruct);

        // Returned values should match the input in createOffer
        for ([key, value] of Object.entries(offer)) {
          expect(JSON.stringify(returnedOffer[key]) === JSON.stringify(value)).is.true;
        }

        // Get the group as a struct
        [, groupStruct] = await groupHandler.connect(rando).getGroup(nextGroupId);

        // Parse into entity
        const returnedGroup = Group.fromStruct(groupStruct);

        // Returned values should match the input in createGroup
        for ([key, value] of Object.entries(group)) {
          expect(JSON.stringify(returnedGroup[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should ignore any provided offer id and assign the next available", async function () {
        offer.id = "555";

        // Create an offer with condition, testing for the events
        const tx = await orchestrationHandler.connect(operator).createOfferWithCondition(offer, condition);
        const txReceipt = await tx.wait();

        // OfferCreated event
        const eventOfferCreated = getEvent(txReceipt, orchestrationHandler, "OfferCreated");
        const offerInstance = Offer.fromStruct(eventOfferCreated.offer);
        // Validate the instance
        expect(offerInstance.isValid()).to.be.true;

        assert.equal(eventOfferCreated.offerId.toString(), nextOfferId, "Offer Id is incorrect");
        assert.equal(eventOfferCreated.sellerId.toString(), offer.sellerId, "Seller Id is incorrect");
        assert.equal(offerInstance.toString(), Offer.fromStruct(offerStruct).toString(), "Offer struct is incorrect");

        // GroupCreated event
        const eventGroupCreated = getEvent(txReceipt, orchestrationHandler, "GroupCreated");
        const groupInstance = Group.fromStruct(eventGroupCreated.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(eventGroupCreated.groupId.toString(), nextOfferId, "Group Id is incorrect");
        assert.equal(eventGroupCreated.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
      });

      it("should ignore any provided seller and assign seller id of msg.sender", async function () {
        // set some other sellerId
        offer.sellerId = "123";

        // Create an offer with condition, testing for the events
        const tx = await orchestrationHandler.connect(operator).createOfferWithCondition(offer, condition);
        const txReceipt = await tx.wait();

        // OfferCreated event
        const eventOfferCreated = getEvent(txReceipt, orchestrationHandler, "OfferCreated");
        const offerInstance = Offer.fromStruct(eventOfferCreated.offer);
        // Validate the instance
        expect(offerInstance.isValid()).to.be.true;

        assert.equal(eventOfferCreated.offerId.toString(), nextOfferId, "Offer Id is incorrect");
        assert.equal(eventOfferCreated.sellerId.toString(), sellerId, "Seller Id is incorrect");
        assert.equal(offerInstance.toString(), Offer.fromStruct(offerStruct).toString(), "Offer struct is incorrect");

        // GroupCreated event
        const eventGroupCreated = getEvent(txReceipt, orchestrationHandler, "GroupCreated");
        const groupInstance = Group.fromStruct(eventGroupCreated.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(eventGroupCreated.groupId.toString(), nextOfferId, "Group Id is incorrect");
        assert.equal(eventGroupCreated.sellerId.toString(), sellerId, "Seller Id is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
      });

      context("💔 Revert Reasons", async function () {
        it("Caller not operator of any seller", async function () {
          // Attempt to Create an offer, expecting revert
          await expect(orchestrationHandler.connect(rando).createOfferWithCondition(offer, condition)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );
        });

        it("Valid from date is greater than valid until date", async function () {
          // Reverse the from and until dates
          offer.validFromDate = ethers.BigNumber.from(Date.now() + oneMonth * 6).toString(); // 6 months from now
          offer.validUntilDate = ethers.BigNumber.from(Date.now()).toString(); // now

          // Attempt to Create an offer, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferWithCondition(offer, condition)
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Valid until date is not in the future", async function () {
          // Set until date in the past
          offer.validUntilDate = ethers.BigNumber.from(Date.now() - oneMonth * 6).toString(); // 6 months ago

          // Attempt to Create an offer, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferWithCondition(offer, condition)
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Buyer cancel penalty is less than item price", async function () {
          // Set buyer cancel penalty higher than offer price
          offer.buyerCancelPenalty = ethers.BigNumber.from(offer.price).add(10).toString();

          // Attempt to Create an offer, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferWithCondition(offer, condition)
          ).to.revertedWith(RevertReasons.OFFER_PENALTY_INVALID);
        });

        it("Offer cannot be voided at the time of the creation", async function () {
          // Set voided flag to true
          offer.voided = true;

          // Attempt to Create an offer, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferWithCondition(offer, condition)
          ).to.revertedWith(RevertReasons.OFFER_MUST_BE_ACTIVE);
        });

        it("Condition 'None' has some values in other fields", async function () {
          method = EvaluationMethod.None;
          condition = new Condition(method, tokenAddress, tokenId, threshold);
          group.condition = condition;

          // Attempt to create the group, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferWithCondition(offer, condition)
          ).to.revertedWith(RevertReasons.INVALID_CONDITION_PARAMETERS);
        });

        it("Condition 'AboveThreshold' has zero token contract address", async function () {
          method = EvaluationMethod.AboveThreshold;
          tokenAddress = ethers.constants.AddressZero;
          condition = new Condition(method, tokenAddress, tokenId, threshold);
          group.condition = condition;

          // Attempt to create the group, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferWithCondition(offer, condition)
          ).to.revertedWith(RevertReasons.INVALID_CONDITION_PARAMETERS);
        });

        it("Condition 'SpecificToken' has has zero token contract address", async function () {
          method = EvaluationMethod.SpecificToken;
          tokenAddress = ethers.constants.AddressZero;
          condition = new Condition(method, tokenAddress, tokenId, threshold);
          group.condition = condition;

          // Attempt to create the group, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferWithCondition(offer, condition)
          ).to.revertedWith(RevertReasons.INVALID_CONDITION_PARAMETERS);
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

        // Required constructor params for Twin
        id = nextTwinId = "1";
        supplyAvailable = "1000";
        tokenId = "2048";
        supplyIds = ["3", "4"];
        tokenAddress = bosonToken.address;

        // Create a valid twin.
        twin = new Twin(id, sellerId, supplyAvailable, supplyIds, tokenId, tokenAddress);

        // How that twin looks as a returned struct
        twinStruct = twin.toStruct();

        // create a seller
        await accountHandler.connect(admin).createSeller(seller);
      });

      it("should emit an OfferCreated, a TwinCreated and a GroupCreated event", async function () {
        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(operator).approve(twinHandler.address, 1); // approving the twin handler

        // Create an offer with condition, testing for the events
        const tx = await orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, twin);
        const txReceipt = await tx.wait();

        // OfferCreated event
        const eventOfferCreated = getEvent(txReceipt, orchestrationHandler, "OfferCreated");
        const offerInstance = Offer.fromStruct(eventOfferCreated.offer);
        // Validate the instance
        expect(offerInstance.isValid()).to.be.true;

        assert.equal(eventOfferCreated.offerId.toString(), offer.id, "Offer Id is incorrect");
        assert.equal(eventOfferCreated.sellerId.toString(), offer.sellerId, "Seller Id is incorrect");
        assert.equal(offerInstance.toString(), offer.toString(), "Offer struct is incorrect");

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

        // Create an offer with condition
        await orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, twin);

        // Get the offer as a struct
        [, offerStruct] = await offerHandler.connect(rando).getOffer(id);

        // Parse into entity
        let returnedOffer = Offer.fromStruct(offerStruct);

        // Returned values should match the input in createOffer
        for ([key, value] of Object.entries(offer)) {
          expect(JSON.stringify(returnedOffer[key]) === JSON.stringify(value)).is.true;
        }

        // Get the twin as a struct
        [, twinStruct] = await twinHandler.connect(rando).getTwin(nextTwinId);

        // Parse into entity
        const returnedTwin = Twin.fromStruct(twinStruct);

        // Returned values should match the input in createGroup
        for ([key, value] of Object.entries(twin)) {
          expect(JSON.stringify(returnedTwin[key]) === JSON.stringify(value)).is.true;
        }

        // Get the bundle as a struct
        [, bundleStruct] = await bundleHandler.connect(rando).getBundle(bundleId);

        // Parse into entity
        let returnedBundle = Bundle.fromStruct(bundleStruct);

        // Returned values should match the input in createBundle
        for ([key, value] of Object.entries(bundle)) {
          expect(JSON.stringify(returnedBundle[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should ignore any provided offer id and assign the next available", async function () {
        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(operator).approve(twinHandler.address, 1); // approving the twin handler

        offer.id = "555";
        twin.id = "777";

        // Create an offer with condition, testing for the events
        const tx = await orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, twin);
        const txReceipt = await tx.wait();

        // OfferCreated event
        const eventOfferCreated = getEvent(txReceipt, orchestrationHandler, "OfferCreated");
        const offerInstance = Offer.fromStruct(eventOfferCreated.offer);
        // Validate the instance
        expect(offerInstance.isValid()).to.be.true;

        assert.equal(eventOfferCreated.offerId.toString(), nextOfferId, "Offer Id is incorrect");
        assert.equal(eventOfferCreated.sellerId.toString(), offer.sellerId, "Seller Id is incorrect");
        assert.equal(offerInstance.toString(), Offer.fromStruct(offerStruct).toString(), "Offer struct is incorrect");

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
        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(operator).approve(twinHandler.address, 1); // approving the twin handler

        // set some other sellerId
        offer.sellerId = "123";
        twin.sellerId = "456";

        // Create an offer with condition, testing for the events
        const tx = await orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, twin);
        const txReceipt = await tx.wait();

        // OfferCreated event
        const eventOfferCreated = getEvent(txReceipt, orchestrationHandler, "OfferCreated");
        const offerInstance = Offer.fromStruct(eventOfferCreated.offer);
        // Validate the instance
        expect(offerInstance.isValid()).to.be.true;

        assert.equal(eventOfferCreated.offerId.toString(), nextOfferId, "Offer Id is incorrect");
        assert.equal(eventOfferCreated.sellerId.toString(), sellerId, "Seller Id is incorrect");
        assert.equal(offerInstance.toString(), Offer.fromStruct(offerStruct).toString(), "Offer struct is incorrect");

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

      context("💔 Revert Reasons", async function () {
        it("Caller not operator of any seller", async function () {
          // Attempt to Create an offer, twin and bundle, expecting revert
          await expect(orchestrationHandler.connect(rando).createOfferAndTwinWithBundle(offer, twin)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );
        });

        it("Valid from date is greater than valid until date", async function () {
          // Reverse the from and until dates
          offer.validFromDate = ethers.BigNumber.from(Date.now() + oneMonth * 6).toString(); // 6 months from now
          offer.validUntilDate = ethers.BigNumber.from(Date.now()).toString(); // now

          // Attempt to Create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, twin)
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Valid until date is not in the future", async function () {
          // Set until date in the past
          offer.validUntilDate = ethers.BigNumber.from(Date.now() - oneMonth * 6).toString(); // 6 months ago

          // Attempt to Create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, twin)
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Buyer cancel penalty is less than item price", async function () {
          // Set buyer cancel penalty higher than offer price
          offer.buyerCancelPenalty = ethers.BigNumber.from(offer.price).add(10).toString();

          // Attempt to Create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, twin)
          ).to.revertedWith(RevertReasons.OFFER_PENALTY_INVALID);
        });

        it("Offer cannot be voided at the time of the creation", async function () {
          // Set voided flag to true
          offer.voided = true;

          // Attempt to Create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, twin)
          ).to.revertedWith(RevertReasons.OFFER_MUST_BE_ACTIVE);
        });

        it("should revert if protocol is not approved to transfer the ERC20 token", async function () {
          //ERC20 token address
          twin.tokenAddress = bosonToken.address;

          await expect(
            orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, twin)
          ).to.revertedWith(RevertReasons.NO_TRANSFER_APPROVED);
        });

        it("should revert if protocol is not approved to transfer the ERC721 token", async function () {
          //ERC721 token address
          twin.tokenAddress = foreign721.address;

          await expect(
            orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, twin)
          ).to.revertedWith(RevertReasons.NO_TRANSFER_APPROVED);
        });

        it("should revert if protocol is not approved to transfer the ERC1155 token", async function () {
          //ERC1155 token address
          twin.tokenAddress = foreign1155.address;

          await expect(
            orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, twin)
          ).to.revertedWith(RevertReasons.NO_TRANSFER_APPROVED);
        });

        context("Token address is unsupported", async function () {
          it("Token address is a zero address", async function () {
            twin.tokenAddress = ethers.constants.AddressZero;

            await expect(
              orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, twin)
            ).to.be.revertedWith(RevertReasons.UNSUPPORTED_TOKEN);
          });

          it("Token address is a contract address that does not support the isApprovedForAll", async function () {
            twin.tokenAddress = twinHandler.address;

            await expect(
              orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, twin)
            ).to.be.revertedWith(RevertReasons.UNSUPPORTED_TOKEN);
          });

          it("Token address is a contract that reverts from a fallback method", async function () {
            twin.tokenAddress = fallbackError.address;

            await expect(
              orchestrationHandler.connect(operator).createOfferAndTwinWithBundle(offer, twin)
            ).to.be.revertedWith(RevertReasons.UNSUPPORTED_TOKEN);
          });
        });
      });
    });
  });
});
