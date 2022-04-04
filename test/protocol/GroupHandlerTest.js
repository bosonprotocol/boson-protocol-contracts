const hre = require("hardhat");
const ethers = hre.ethers;
const { assert, expect } = require("chai");
const { gasLimit } = require("../../environments");

const Role = require("../../scripts/domain/Role");
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
  let accounts, deployer, rando;
  let erc165, protocolDiamond, accessController, offerHandler, groupHandler, key, value;
  let offer, oneMonth, oneWeek, support, expected, exists;
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
    seller,
    exchangeToken,
    metadataUri,
    metadataHash,
    voided;
  let group, nextGroupId, invalidGroupId;
  let offerIds, condition;
  let groupHandlerFacet_Factory;
  let method, tokenAddress, tokenId, threshold;
  let groupStruct;
  let offerIdsToAdd, offerIdsToRemove;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();
  });

  beforeEach(async function () {
    // Make accounts available
    accounts = await ethers.getSigners();
    deployer = accounts[0];
    seller = accounts[1];
    rando = accounts[2];

    // Deploy the Protocol Diamond
    [protocolDiamond, , , accessController] = await deployProtocolDiamond();

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Cut the protocol handler facets into the Diamond
    await deployProtocolHandlerFacets(protocolDiamond, ["OfferHandlerFacet"]);
    await deployProtocolHandlerFacets(protocolDiamond, ["GroupHandlerFacet"]);

    // Add config Handler, so ids starts at 1
    const protocolConfig = [
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0",
      "100",
    ];
    await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);

    // Cast Diamond to IERC165
    erc165 = await ethers.getContractAt("IERC165", protocolDiamond.address);

    // Cast Diamond to IOfferHandler and IGroupHandler
    offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);
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

        await offerHandler.connect(seller).createOffer(offer);
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
        const tx = await groupHandler.connect(seller).createGroup(group);
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
        await groupHandler.connect(seller).createGroup(group);

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
        const tx = await groupHandler.connect(seller).createGroup(group);
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
        await groupHandler.connect(seller).createGroup(group);

        // group should have no offers
        let returnedGroup;
        [, returnedGroup] = await groupHandler.connect(rando).getGroup(nextGroupId);
        assert.equal(returnedGroup.offerIds, group.offerIds.toString(), "Offer ids should be empty");
      });

      xit("should ignore any provided seller and assign seller id of msg.sender", async function () {
        // TODO: add when accounthandler is finished

        group.seller = rando;

        // Create a group, testing for the event
        await expect(groupHandler.connect(seller).createGroup(group))
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
          await expect(groupHandler.connect(seller).createGroup(group)).to.revertedWith(RevertReasons.NO_SUCH_OFFER);

          // Invalid offer id
          group.offerIds = ["0", "4"];

          // Attempt to create a group, expecting revert
          await expect(groupHandler.connect(seller).createGroup(group)).to.revertedWith(RevertReasons.NO_SUCH_OFFER);
        });

        it("Offer is already part of another group", async function () {
          // create first group
          await groupHandler.connect(seller).createGroup(group);

          // Add offer that is already part of another group
          group.offerIds = ["1", "2", "4"];

          // Attempt to create a group, expecting revert
          await expect(groupHandler.connect(seller).createGroup(group)).to.revertedWith(
            RevertReasons.OFFER_MUST_BE_UNIQUE
          );
        });

        it("Offer is duplicated", async function () {
          // Try to add the same offer twice
          group.offerIds = ["1", "1", "4"];

          // Attempt to create a group, expecting revert
          await expect(groupHandler.connect(seller).createGroup(group)).to.revertedWith(
            RevertReasons.OFFER_MUST_BE_UNIQUE
          );
        });

        it("Adding too many offers", async function () {
          // Try to add the more than 100 offers
          group.offerIds = [...Array(101).keys()];

          // Attempt to create a group, expecting revert
          await expect(groupHandler.connect(seller).createGroup(group)).to.revertedWith(RevertReasons.TOO_MANY_OFFERS);
        });

        it("Condition 'None' has some values in other fields", async function () {
          method = EvaluationMethod.None;
          condition = new Condition(method, tokenAddress, tokenId, threshold);
          group.condition = condition;

          // Attempt to update the offer, expecting revert
          await expect(groupHandler.connect(seller).createGroup(group)).to.revertedWith(
            RevertReasons.INVALID_CONDITION_PARAMETERS
          );
        });

        it("Condition 'AboveThreshold' has zero token contract address", async function () {
          method = EvaluationMethod.AboveThreshold;
          tokenAddress = ethers.constants.AddressZero;
          condition = new Condition(method, tokenAddress, tokenId, threshold);
          group.condition = condition;

          // Attempt to update the offer, expecting revert
          await expect(groupHandler.connect(seller).createGroup(group)).to.revertedWith(
            RevertReasons.INVALID_CONDITION_PARAMETERS
          );
        });

        it("Condition 'SpecificToken' has has zero token contract address", async function () {
          method = EvaluationMethod.SpecificToken;
          tokenAddress = ethers.constants.AddressZero;
          condition = new Condition(method, tokenAddress, tokenId, threshold);
          group.condition = condition;

          // Attempt to update the offer, expecting revert
          await expect(groupHandler.connect(seller).createGroup(group)).to.revertedWith(
            RevertReasons.INVALID_CONDITION_PARAMETERS
          );
        });
      });
    });

    context("👉 addOffersToGroup()", async function () {
      beforeEach(async function () {
        // Create a group
        await groupHandler.connect(seller).createGroup(group);

        // set the new fields
        offerIdsToAdd = ["1", "4"];
        group.offerIds = [...group.offerIds, ...offerIdsToAdd];

        groupStruct = group.toStruct();
      });

      it("should emit a GroupUpdated event", async function () {
        // Add offers to a group, testing for the event
        const tx = await groupHandler.connect(seller).addOffersToGroup(group.id, offerIdsToAdd);
        const txReceipt = await tx.wait();

        const event = getEvent(txReceipt, groupHandlerFacet_Factory, "GroupUpdated");

        const groupInstance = Group.fromStruct(event.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(event.groupId.toString(), group.id, "Group Id is incorrect");
        assert.equal(event.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
      });

      it("should update state", async function () {
        // Add offers to a group,
        await groupHandler.connect(seller).addOffersToGroup(group.id, offerIdsToAdd);

        // Get the group as a struct
        [, groupStruct] = await groupHandler.connect(rando).getGroup(group.id);

        // Parse into entity
        const returnedGroup = Group.fromStruct(groupStruct);

        // Returned values should reflect the changes done with addOffersToGroup
        for ([key, value] of Object.entries(group)) {
          expect(JSON.stringify(returnedGroup[key]) === JSON.stringify(value)).is.true;
        }
      });

      context("💔 Revert Reasons", async function () {
        it("Group does not exist", async function () {
          // Set invalid id
          group.id = "444";

          // Attempt to add offers to the group, expecting revert
          await expect(groupHandler.connect(seller).addOffersToGroup(group.id, offerIdsToAdd)).to.revertedWith(
            RevertReasons.NO_SUCH_GROUP
          );

          // Set invalid id
          group.id = "0";

          // Attempt to add offers to group, expecting revert
          await expect(groupHandler.connect(seller).addOffersToGroup(group.id, offerIdsToAdd)).to.revertedWith(
            RevertReasons.NO_SUCH_GROUP
          );
        });

        xit("Caller is not seller of a group", async function () {
          // TODO: add when accounthandler is finished
        });

        xit("Caller is not the seller of all offers", async function () {
          // TODO whan account handler is implemented
        });

        it("Offer is already part of another group", async function () {
          // create another group
          group.offerIds = ["1"];
          await groupHandler.connect(seller).createGroup(group);

          // Attempt to add offers to a group, expecting revert
          await expect(groupHandler.connect(seller).addOffersToGroup(group.id, offerIdsToAdd)).to.revertedWith(
            RevertReasons.OFFER_MUST_BE_UNIQUE
          );
        });

        it("Offer is duplicated", async function () {
          // Try to add the same offer twice
          offerIdsToAdd = ["1", "1", "4"];

          // Attempt to add offers to a group, expecting revert
          await expect(groupHandler.connect(seller).addOffersToGroup(group.id, offerIdsToAdd)).to.revertedWith(
            RevertReasons.OFFER_MUST_BE_UNIQUE
          );
        });

        it("Adding too many offers", async function () {
          // Try to add the more than 100 offers
          offerIdsToAdd = [...Array(101).keys()];

          // Attempt to add offers to a group, expecting revert
          await expect(groupHandler.connect(seller).addOffersToGroup(group.id, offerIdsToAdd)).to.revertedWith(
            RevertReasons.TOO_MANY_OFFERS
          );
        });

        it("Adding nothing", async function () {
          // Try to add nothing
          offerIdsToAdd = [];

          // Attempt to add offers from the group, expecting revert
          await expect(groupHandler.connect(seller).addOffersToGroup(group.id, offerIdsToAdd)).to.revertedWith(
            RevertReasons.NOTHING_UPDATED
          );
        });

        it("Offer does not exist", async function () {
          // Set invalid offer id
          offerIdsToAdd = ["1", "999"];

          // Attempt to add offers to a group, expecting revert
          await expect(groupHandler.connect(seller).addOffersToGroup(group.id, offerIdsToAdd)).to.revertedWith(
            RevertReasons.NO_SUCH_OFFER
          );

          // Set invalid offer id
          offerIdsToAdd = ["0", "2"];

          // Attempt to add offers to a group, expecting revert
          await expect(groupHandler.connect(seller).addOffersToGroup(group.id, offerIdsToAdd)).to.revertedWith(
            RevertReasons.NO_SUCH_OFFER
          );
        });
      });
    });

    context("👉 removeOffersFromGroup()", async function () {
      beforeEach(async function () {
        group.offerIds = ["1", "2", "3", "4", "5"];
        // Create a group
        await groupHandler.connect(seller).createGroup(group);

        // set the new fields
        offerIdsToRemove = ["1", "4"];
        group.offerIds = ["5", "2", "3"]; // ["1","2","3","4","5"] -> ["5","2","3","4"] -> ["5","2","3"]

        groupStruct = group.toStruct();
      });

      it("should emit a GroupUpdated event", async function () {
        // Remove offers from a group, testing for the event
        const tx = await groupHandler.connect(seller).removeOffersFromGroup(group.id, offerIdsToRemove);
        const txReceipt = await tx.wait();

        const event = getEvent(txReceipt, groupHandlerFacet_Factory, "GroupUpdated");

        const groupInstance = Group.fromStruct(event.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(event.groupId.toString(), group.id, "Group Id is incorrect");
        assert.equal(event.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
      });

      it("should update state", async function () {
        // Remove offer to a group,
        await groupHandler.connect(seller).removeOffersFromGroup(group.id, offerIdsToRemove);

        // Get the group as a struct
        [, groupStruct] = await groupHandler.connect(rando).getGroup(group.id);

        // Parse into entity
        const returnedGroup = Group.fromStruct(groupStruct);

        // Returned values should  reflect the changes done with removeOffersFromGroup
        for ([key, value] of Object.entries(group)) {
          expect(JSON.stringify(returnedGroup[key]) === JSON.stringify(value)).is.true;
        }
      });

      context("💔 Revert Reasons", async function () {
        it("Group does not exist", async function () {
          // Set invalid id
          group.id = "444";

          // Attempt to remove offers from the group, expecting revert
          await expect(groupHandler.connect(seller).removeOffersFromGroup(group.id, offerIdsToRemove)).to.revertedWith(
            RevertReasons.NO_SUCH_GROUP
          );

          // Set invalid id
          group.id = "0";

          // Attempt to remove offers from group, expecting revert
          await expect(groupHandler.connect(seller).removeOffersFromGroup(group.id, offerIdsToRemove)).to.revertedWith(
            RevertReasons.NO_SUCH_GROUP
          );
        });

        xit("Caller is not seller of a group", async function () {
          // TODO: add when accounthandler is finished
        });

        it("Offer is not a part of the group", async function () {
          // inexisting offer
          offerIdsToRemove = ["6"];

          // Attempt to remove offers from the group, expecting revert
          await expect(groupHandler.connect(seller).removeOffersFromGroup(group.id, offerIdsToRemove)).to.revertedWith(
            RevertReasons.OFFER_NOT_IN_GROUP
          );

          // create an offer and add it to another group
          await offerHandler.connect(seller).createOffer(offer);
          group.offerIds = ["6"];
          await groupHandler.connect(seller).createGroup(group);

          // Attempt to remove offers to a group, expecting revert
          await expect(groupHandler.connect(seller).removeOffersFromGroup(group.id, offerIdsToRemove)).to.revertedWith(
            RevertReasons.OFFER_NOT_IN_GROUP
          );
        });

        it("Removing too many offers", async function () {
          // Try to remove the more than 100 offers
          offerIdsToRemove = [...Array(101).keys()];

          // Attempt to remove offers from the group, expecting revert
          await expect(groupHandler.connect(seller).removeOffersFromGroup(group.id, offerIdsToRemove)).to.revertedWith(
            RevertReasons.TOO_MANY_OFFERS
          );
        });

        it("Removing nothing", async function () {
          // Try to remove nothing
          offerIdsToRemove = [];

          // Attempt to remove offers from the group, expecting revert
          await expect(groupHandler.connect(seller).removeOffersFromGroup(group.id, offerIdsToRemove)).to.revertedWith(
            RevertReasons.NOTHING_UPDATED
          );
        });
      });
    });

    context("👉 setGroupCondition()", async function () {
      beforeEach(async function () {
        // Create a group
        await groupHandler.connect(seller).createGroup(group);

        // id of the current group and increment nextGroupId
        id = nextGroupId++;

        // Required constructor params for Condition
        method = EvaluationMethod.SpecificToken;
        tokenAddress = accounts[1].address; // just need an address
        tokenId = "88775544";
        threshold = "0";

        condition = new Condition(method, tokenAddress, tokenId, threshold);
        expect(condition.isValid()).to.be.true;

        groupStruct = group.toStruct();
      });

      it("should emit a GroupUpdated event", async function () {
        // Update a group, testing for the event
        const tx = await groupHandler.connect(seller).setGroupCondition(group.id, condition);
        const txReceipt = await tx.wait();

        const event = getEvent(txReceipt, groupHandlerFacet_Factory, "GroupUpdated");

        const groupInstance = Group.fromStruct(event.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        group.condition = condition;

        assert.equal(event.groupId.toString(), group.id, "Group Id is incorrect");
        assert.equal(event.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
      });

      it("should update state", async function () {
        // Set a new condition
        await groupHandler.connect(seller).setGroupCondition(group.id, condition);

        // Get the group as a struct
        [, groupStruct] = await groupHandler.connect(rando).getGroup(group.id);

        // Parse into entity
        const returnedGroup = Group.fromStruct(groupStruct);

        // Returned values should match the input in setGroupCondition
        expect(returnedGroup.condition.toString() === condition.toString()).is.true;
      });

      context("💔 Revert Reasons", async function () {
        it("Group does not exist", async function () {
          // Set invalid id
          group.id = "444";

          // Attempt to update the group, expecting revert
          await expect(groupHandler.connect(seller).setGroupCondition(group.id, condition)).to.revertedWith(
            RevertReasons.NO_SUCH_GROUP
          );

          // Set invalid id
          group.id = "0";

          // Attempt to update the offer, expecting revert
          await expect(groupHandler.connect(seller).setGroupCondition(group.id, condition)).to.revertedWith(
            RevertReasons.NO_SUCH_GROUP
          );
        });

        xit("Caller is not seller of a group", async function () {
          // TODO: add when accounthandler is finished
        });

        it("Condition 'None' has some values in other fields", async function () {
          method = EvaluationMethod.None;
          condition = new Condition(method, tokenAddress, tokenId, threshold);

          // Attempt to update the offer, expecting revert
          await expect(groupHandler.connect(seller).setGroupCondition(group.id, condition)).to.revertedWith(
            RevertReasons.INVALID_CONDITION_PARAMETERS
          );
        });

        it("Condition 'AboveThreshold' has zero token contract address", async function () {
          method = EvaluationMethod.AboveThreshold;
          tokenAddress = ethers.constants.AddressZero;
          condition = new Condition(method, tokenAddress, tokenId, threshold);

          // Attempt to update the offer, expecting revert
          await expect(groupHandler.connect(seller).setGroupCondition(group.id, condition)).to.revertedWith(
            RevertReasons.INVALID_CONDITION_PARAMETERS
          );
        });

        it("Condition 'SpecificToken' has has zero token contract address", async function () {
          method = EvaluationMethod.SpecificToken;
          tokenAddress = ethers.constants.AddressZero;
          condition = new Condition(method, tokenAddress, tokenId, threshold);

          // Attempt to update the offer, expecting revert
          await expect(groupHandler.connect(seller).setGroupCondition(group.id, condition)).to.revertedWith(
            RevertReasons.INVALID_CONDITION_PARAMETERS
          );
        });
      });
    });

    context("👉 getGroup()", async function () {
      beforeEach(async function () {
        // Create a group
        await groupHandler.connect(seller).createGroup(group);

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
        await groupHandler.connect(rando).createGroup(group);

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
        await groupHandler.connect(seller).createGroup(group);

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
