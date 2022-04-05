const hre = require("hardhat");
const ethers = hre.ethers;
const { assert, expect } = require("chai");
const { gasLimit } = require("../../environments");

const Role = require("../../scripts/domain/Role");
const Seller = require("../../scripts/domain/Seller");
const Offer = require("../../scripts/domain/Offer");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const Group = require("../../scripts/domain/Group");
const Condition = require("../../scripts/domain/Condition");
const EvaluationMethod = require("../../scripts/domain/EvaluationMethod");
const { getEvent } = require("../../scripts/util/test-events.js");

/**
 *  Test the Boson Group Handler interface
 */
describe("IBosonGroupHandler", function () {
  // Common vars
  let InterfaceIds;
  let accounts, deployer, rando, operator, admin, clerk, treasury;
  let erc165, protocolDiamond, accessController, accountHandler, offerHandler, groupHandler, key, value;
  let offer, oneMonth, oneWeek, support, expected, exists;
  let seller, active;
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
    metadataHash,
    voided;
  let group, nextGroupId, invalidGroupId;
  let offerIds, condition;
  let groupHandlerFacet_Factory;
  let method, tokenAddress, tokenId, threshold;
  let groupStruct;

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
    await deployProtocolHandlerFacets(protocolDiamond, ["OfferHandlerFacet"]);
    await deployProtocolHandlerFacets(protocolDiamond, ["GroupHandlerFacet"]);

    // Add config Handler, so ids starts at 1
    const protocolConfig = [
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0",
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
  });

  // Interface support (ERC-156 provided by ProtocolDiamond, others by deployed facets)
  context("📋 Interfaces", async function () {
    context("👉 supportsInterface()", async function () {
      it("should indicate support for IBosonGroupHandler interface", async function () {
        // Current interfaceId for IGroupHandler
        support = await erc165.supportsInterface(InterfaceIds.IBosonGroupHandler);

        // Test
        await expect(support, "IBosonGroupHandler interface not supported").is.true;
      });
    });
  });

  // All supported methods
  context("📋 Group Handler Methods", async function () {
    beforeEach(async function () {
      // create a seller
      // Required constructor params
      id = "1"; // argument sent to contract for createSeller will be ignored

      active = true;

      // Create a valid seller, then set fields in tests directly
      seller = new Seller(id, operator.address, admin.address, clerk.address, treasury.address, active);
      expect(seller.isValid()).is.true;

      await accountHandler.connect(admin).createSeller(seller);

      // Some periods in milliseconds
      oneWeek = 604800 * 1000; //  7 days in milliseconds
      oneMonth = 2678400 * 1000; // 31 days in milliseconds

      // The first group id
      nextGroupId = "1";
      invalidGroupId = "666";

      // create 5 offers
      for (let i = 0; i < 5; i++) {
        // Required constructor params
        id = sellerId = "1"; // argument sent to contract for createGroup will be ignored
        price = ethers.utils.parseUnits(`${1.5 + i * 1}`, "ether").toString();
        sellerDeposit = price = ethers.utils.parseUnits(`${0.25 + i * 0.1}`, "ether").toString();
        buyerCancelPenalty = price = ethers.utils.parseUnits(`${0.05 + i * 0.1}`, "ether").toString();
        quantityAvailable = `${i * 2}`;
        validFromDate = ethers.BigNumber.from(Date.now() + oneMonth * i).toString();
        validUntilDate = ethers.BigNumber.from(Date.now() + oneMonth * 6 * (i + 1)).toString();
        redeemableFromDate = ethers.BigNumber.from(validUntilDate + oneWeek).toString();
        fulfillmentPeriodDuration = oneMonth.toString();
        voucherValidDuration = oneMonth.toString();
        exchangeToken = ethers.constants.AddressZero.toString();
        metadataHash = "QmYXc12ov6F2MZVZwPs5XeCBbf61cW3wKRk8h3D5NTYj4T";
        metadataUri = `https://ipfs.io/ipfs/${metadataHash}`;
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
          metadataHash,
          voided
        );
        expect(offer.isValid()).is.true;

        await offerHandler.connect(operator).createOffer(offer);
      }

      // Required constructor params for Condition
      method = EvaluationMethod.AboveThreshold;
      tokenAddress = accounts[0].address; // just need an address
      tokenId = "5150";
      threshold = "1";

      // Required constructor params for Group
      id = nextGroupId;
      sellerId = "12";
      offerIds = ["2", "3", "5"];

      condition = new Condition(method, tokenAddress, tokenId, threshold);
      expect(condition.isValid()).to.be.true;

      group = new Group(nextGroupId, sellerId, offerIds, condition);

      expect(group.isValid()).is.true;

      // How that group looks as a returned struct
      groupStruct = group.toStruct();

      // initialize groupHandler
      groupHandlerFacet_Factory = await ethers.getContractFactory("GroupHandlerFacet");
    });

    context("👉 createGroup()", async function () {
      it("should emit a GroupCreated event", async function () {
        // Create a group, testing for the event
        const tx = await groupHandler.connect(operator).createGroup(group);
        const txReceipt = await tx.wait();

        const event = getEvent(txReceipt, groupHandlerFacet_Factory, "GroupCreated");

        const groupInstance = Group.fromStruct(event.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(event.groupId.toString(), group.id, "Group Id is incorrect");
        assert.equal(event.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
      });

      it("should update state", async function () {
        // Create a group
        await groupHandler.connect(operator).createGroup(group);

        // Get the group as a struct
        [, groupStruct] = await groupHandler.connect(rando).getGroup(nextGroupId);

        // Parse into entity
        const returnedGroup = Group.fromStruct(groupStruct);

        // Returned values should match the input in createGroup
        for ([key, value] of Object.entries(group)) {
          expect(JSON.stringify(returnedGroup[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should ignore any provided id and assign the next available", async function () {
        group.id = "444";

        // Create a group, testing for the event
        const tx = await groupHandler.connect(operator).createGroup(group);
        const txReceipt = await tx.wait();

        const event = getEvent(txReceipt, groupHandlerFacet_Factory, "GroupCreated");

        const groupInstance = Group.fromStruct(event.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(event.groupId.toString(), nextGroupId, "Group Id is incorrect");
        assert.equal(event.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(groupInstance.toStruct().toString(), groupStruct.toString(), "Group struct is incorrect");

        // wrong group id should not exist
        [exists] = await groupHandler.connect(rando).getGroup(group.id);
        expect(exists).to.be.false;

        // next group id should exist
        [exists] = await groupHandler.connect(rando).getGroup(nextGroupId);
        expect(exists).to.be.true;
      });

      it("should create group without any offer", async function () {
        group.offerIds = [];

        // Create a group, testing for the event
        await groupHandler.connect(operator).createGroup(group);

        // group should have no offers
        let returnedGroup;
        [, returnedGroup] = await groupHandler.connect(rando).getGroup(nextGroupId);
        assert.equal(returnedGroup.offerIds, group.offerIds.toString(), "Offer ids should be empty");
      });

      xit("should ignore any provided seller and assign seller id of msg.sender", async function () {
        // TODO: add when accounthandler is finished

        group.seller = rando;

        // Create a group, testing for the event
        await expect(groupHandler.connect(operator).createGroup(group))
          .to.emit(groupHandler, "GroupCreated")
          .withArgs(nextGroupId, group.sellerId, groupStruct);
      });

      context("💔 Revert Reasons", async function () {
        xit("Caller is not the seller of all offers", async function () {
          // TODO whan account handler is implemented
        });

        it("Offer does not exist", async function () {
          // Invalid offer id
          group.offerIds = ["1", "999"];

          // Attempt to create a group, expecting revert
          await expect(groupHandler.connect(operator).createGroup(group)).to.revertedWith(RevertReasons.NO_SUCH_OFFER);

          // Invalid offer id
          group.offerIds = ["0", "4"];

          // Attempt to create a group, expecting revert
          await expect(groupHandler.connect(operator).createGroup(group)).to.revertedWith(RevertReasons.NO_SUCH_OFFER);
        });

        it("Offer is already part of another group", async function () {
          // create first group
          await groupHandler.connect(operator).createGroup(group);

          // Add offer that is already part of another group
          group.offerIds = ["1", "2", "4"];

          // Attempt to create a group, expecting revert
          await expect(groupHandler.connect(operator).createGroup(group)).to.revertedWith(
            RevertReasons.OFFER_MUST_BE_UNIQUE
          );
        });

        it("Offer is duplicated", async function () {
          // Try to add the same offer twice
          group.offerIds = ["1", "1", "4"];

          // Attempt to create a group, expecting revert
          await expect(groupHandler.connect(operator).createGroup(group)).to.revertedWith(
            RevertReasons.OFFER_MUST_BE_UNIQUE
          );
        });

        it("Adding too many offers", async function () {
          // Try to add the more than 100 offers
          group.offerIds = [...Array(101).keys()];

          // Attempt to create a group, expecting revert
          await expect(groupHandler.connect(operator).createGroup(group)).to.revertedWith(
            RevertReasons.TOO_MANY_OFFERS
          );
        });
      });
    });

    context("👉 getGroup()", async function () {
      beforeEach(async function () {
        // Create a group
        await groupHandler.connect(operator).createGroup(group);

        // id of the current group and increment nextGroupId
        id = nextGroupId++;
      });

      it("should return true for exists if group is found", async function () {
        // Get the exists flag
        [exists] = await groupHandler.connect(rando).getGroup(id);

        // Validate
        expect(exists).to.be.true;
      });

      it("should return false for exists if group is not found", async function () {
        // Get the exists flag
        [exists] = await groupHandler.connect(rando).getGroup(invalidGroupId);

        // Validate
        expect(exists).to.be.false;
      });

      it("should return the details of the group as a struct if found", async function () {
        // Get the group as a struct
        [, groupStruct] = await groupHandler.connect(rando).getGroup(id);

        // Parse into entity
        group = Group.fromStruct(groupStruct);

        // Validate
        expect(group.isValid()).to.be.true;
      });
    });

    context("👉 getNextGroupId()", async function () {
      beforeEach(async function () {
        // Create a group
        await groupHandler.connect(operator).createGroup(group);

        // id of the current group and increment nextGroupId
        id = nextGroupId++;
      });

      it("should return the next group id", async function () {
        // What we expect the next group id to be
        expected = nextGroupId;

        // Get the next group id
        nextGroupId = await groupHandler.connect(rando).getNextGroupId();

        // Verify expectation
        expect(nextGroupId.toString() == expected).to.be.true;
      });

      it("should be incremented after a group is created", async function () {
        // Create another group
        group.offerIds = ["1", "4"];
        await groupHandler.connect(operator).createGroup(group);

        // What we expect the next group id to be
        expected = ++nextGroupId;

        // Get the next group id
        nextGroupId = await groupHandler.connect(rando).getNextGroupId();

        // Verify expectation
        expect(nextGroupId.toString() == expected).to.be.true;
      });

      it("should not be incremented when only getNextGroupId is called", async function () {
        // What we expect the next group id to be
        expected = nextGroupId;

        // Get the next group id
        nextGroupId = await groupHandler.connect(rando).getNextGroupId();

        // Verify expectation
        expect(nextGroupId.toString() == expected).to.be.true;

        // Call again
        nextGroupId = await groupHandler.connect(rando).getNextGroupId();

        // Verify expectation
        expect(nextGroupId.toString() == expected).to.be.true;
      });
    });
  });
});
