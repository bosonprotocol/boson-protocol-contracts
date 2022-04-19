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
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { getEvent } = require("../../scripts/util/test-events.js");

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
  let orchestrationHandlerFacet_Factory;

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
      before(async function () {
        // initialize groupHandler
        orchestrationHandlerFacet_Factory = await ethers.getContractFactory("OrchestrationHandlerFacet");
      });

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
        const eventOfferCreated = getEvent(txReceipt, orchestrationHandlerFacet_Factory, "OfferCreated");
        const offerInstance = Offer.fromStruct(eventOfferCreated.offer);
        // Validate the instance
        expect(offerInstance.isValid()).to.be.true;

        assert.equal(eventOfferCreated.offerId.toString(), offer.id, "Offer Id is incorrect");
        assert.equal(eventOfferCreated.sellerId.toString(), offer.sellerId, "Seller Id is incorrect");
        assert.equal(offerInstance.toString(), offer.toString(), "Offer struct is incorrect");

        // GroupCreated event
        const eventGroupCreated = getEvent(txReceipt, orchestrationHandlerFacet_Factory, "GroupCreated");
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
        const eventOfferCreated = getEvent(txReceipt, orchestrationHandlerFacet_Factory, "OfferCreated");
        const offerInstance = Offer.fromStruct(eventOfferCreated.offer);
        // Validate the instance
        expect(offerInstance.isValid()).to.be.true;

        assert.equal(eventOfferCreated.offerId.toString(), nextOfferId, "Offer Id is incorrect");
        assert.equal(eventOfferCreated.sellerId.toString(), offer.sellerId, "Seller Id is incorrect");
        assert.equal(offerInstance.toString(), Offer.fromStruct(offerStruct).toString(), "Offer struct is incorrect");

        // GroupCreated event
        const eventGroupCreated = getEvent(txReceipt, orchestrationHandlerFacet_Factory, "GroupCreated");
        const groupInstance = Group.fromStruct(eventGroupCreated.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(eventGroupCreated.groupId.toString(), nextOfferId, "Group Id is incorrect");
        assert.equal(eventGroupCreated.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
      });

      it.only("should ignore any provided seller and assign seller id of msg.sender", async function () {
        // set some other sellerId
        offer.sellerId = "123";

        // Create an offer with condition, testing for the events
        const tx = await orchestrationHandler.connect(operator).createOfferWithCondition(offer, condition);
        const txReceipt = await tx.wait();

        // OfferCreated event
        const eventOfferCreated = getEvent(txReceipt, orchestrationHandlerFacet_Factory, "OfferCreated");
        const offerInstance = Offer.fromStruct(eventOfferCreated.offer);
        // Validate the instance
        expect(offerInstance.isValid()).to.be.true;

        assert.equal(eventOfferCreated.offerId.toString(), nextOfferId, "Offer Id is incorrect");
        assert.equal(eventOfferCreated.sellerId.toString(), sellerId, "Seller Id is incorrect");
        assert.equal(offerInstance.toString(), Offer.fromStruct(offerStruct).toString(), "Offer struct is incorrect");

        // GroupCreated event
        const eventGroupCreated = getEvent(txReceipt, orchestrationHandlerFacet_Factory, "GroupCreated");
        const groupInstance = Group.fromStruct(eventGroupCreated.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(eventGroupCreated.groupId.toString(), nextOfferId, "Group Id is incorrect");
        assert.equal(eventGroupCreated.sellerId.toString(), sellerId, "Seller Id is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
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

        it("Caller not operator of any seller", async function () {
          // Attempt to Create an offer, expecting revert
          await expect(orchestrationHandler.connect(rando).createSellerAndOffer(seller, offer)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );
        });

        xit("Caller is not operator the specified in seller", async function () {
          // Attempt to Create an offer, expecting revert
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
  });
});
