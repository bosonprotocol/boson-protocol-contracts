const hre = require("hardhat");
const ethers = hre.ethers;
const { assert, expect } = require("chai");
const { gasLimit } = require("../../environments");

const Role = require("../../scripts/domain/Role");
const Seller = require("../../scripts/domain/Seller");
const Group = require("../../scripts/domain/Group");
const Condition = require("../../scripts/domain/Condition");
const EvaluationMethod = require("../../scripts/domain/EvaluationMethod");
const TokenType = require("../../scripts/domain/TokenType");
const AuthToken = require("../../scripts/domain/AuthToken");
const AuthTokenType = require("../../scripts/domain/AuthTokenType");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const { getEvent } = require("../../scripts/util/test-utils.js");
const { oneMonth } = require("../utils/constants");
const { mockOffer, mockDisputeResolver } = require("../utils/mock");

/**
 *  Test the Boson Group Handler interface
 */
describe("IBosonGroupHandler", function () {
  // Common vars
  let InterfaceIds;
  let accounts, deployer, rando, operator, admin, clerk, treasury, operatorDR, adminDR, clerkDR, treasuryDR;
  let erc165, protocolDiamond, accessController, accountHandler, offerHandler, groupHandler, bosonToken, key, value;
  let offer, support, expected, exists;
  let seller, active;
  let id, sellerId, nextAccountId;
  let offerDates;
  let offerDurations;
  let protocolFeePercentage, protocolFeeFlatBoson, buyerEscalationDepositPercentage;
  let group, nextGroupId, invalidGroupId;
  let offerIds, condition;
  let groupHandlerFacet_Factory;
  let method, tokenType, tokenAddress, tokenId, threshold, maxCommits;
  let groupStruct;
  let offerIdsToAdd, offerIdsToRemove;
  let disputeResolver, disputeResolverFees, disputeResolverId;
  let contractURI;
  let emptyAuthToken;
  let agentId;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();
  });

  beforeEach(async function () {
    // Make accounts available
    [deployer, rando, operator, admin, clerk, treasury, operatorDR, adminDR, clerkDR, treasuryDR] =
      await ethers.getSigners();
    accounts = await ethers.getSigners();

    // Deploy the Protocol Diamond
    [protocolDiamond, , , accessController] = await deployProtocolDiamond();

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Cut the protocol handler facets into the Diamond
    await deployProtocolHandlerFacets(protocolDiamond, ["SellerHandlerFacet", "DisputeResolverHandlerFacet"]);
    await deployProtocolHandlerFacets(protocolDiamond, ["OfferHandlerFacet"]);
    await deployProtocolHandlerFacets(protocolDiamond, ["GroupHandlerFacet"]);

    // Deploy the boson token
    [bosonToken] = await deployMockTokens(gasLimit, ["BosonToken"]);

    // set protocolFees
    protocolFeePercentage = "200"; // 2 %
    protocolFeeFlatBoson = ethers.utils.parseUnits("0.01", "ether").toString();
    buyerEscalationDepositPercentage = "1000"; // 10%

    // Add config Handler, so ids starts at 1
    const protocolConfig = [
      // Protocol addresses
      {
        treasuryAddress: ethers.constants.AddressZero,
        tokenAddress: bosonToken.address,
        voucherBeaconAddress: ethers.constants.AddressZero,
        beaconProxyAddress: ethers.constants.AddressZero,
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
      id = nextAccountId = "1"; // argument sent to contract for createSeller will be ignored
      agentId = "0"; // agent id is optional while creating an offer

      active = true;

      // Create a valid seller, then set fields in tests directly
      seller = new Seller(id, operator.address, admin.address, clerk.address, treasury.address, active);
      expect(seller.isValid()).is.true;
      contractURI = `https://ipfs.io/ipfs/QmW2WQi7j6c7UgJTarActp7tDNikE4B2qXtFCfLPdsgaTQ`;

      // AuthToken
      emptyAuthToken = new AuthToken("0", AuthTokenType.None);
      expect(emptyAuthToken.isValid()).is.true;

      await accountHandler.connect(admin).createSeller(seller, contractURI, emptyAuthToken);

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
      await accountHandler.connect(deployer).activateDisputeResolver(++nextAccountId);

      // The first group id
      nextGroupId = "1";
      invalidGroupId = "666";

      // create 5 offers
      for (let i = 0; i < 5; i++) {
        // Mock offer, offerDates and offerDurations
        ({ offer, offerDates, offerDurations, disputeResolverId } = await mockOffer());

        // Set unique offer properties based on index
        offer.id = `${i + 1}`;
        offer.price = ethers.utils.parseUnits(`${1.5 + i * 1}`, "ether").toString();
        offer.sellerDeposit = ethers.utils.parseUnits(`${0.25 + i * 0.1}`, "ether").toString();
        offer.buyerCancelPenalty = ethers.utils.parseUnits(`${0.05 + i * 0.1}`, "ether").toString();
        offer.quantityAvailable = `${(i + 1) * 2}`;
        offerDates.validFrom = ethers.BigNumber.from(Date.now() + oneMonth * i).toString();
        offerDates.validUntil = ethers.BigNumber.from(Date.now() + oneMonth * 6 * (i + 1)).toString();

        // Check if domains are valid
        expect(offer.isValid()).is.true;
        expect(offerDates.isValid()).is.true;
        expect(offerDurations.isValid()).is.true;

        // Create the offer
        await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);
      }

      // Required constructor params for Condition
      method = EvaluationMethod.Threshold;
      tokenType = TokenType.MultiToken;
      tokenAddress = accounts[0].address; // just need an address
      tokenId = "5150";
      threshold = "1";
      maxCommits = "1";

      // Required constructor params for Group
      id = nextGroupId;
      sellerId = "1";
      offerIds = ["2", "3", "5"];

      condition = new Condition(method, tokenType, tokenAddress, tokenId, threshold, maxCommits);
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
        assert.equal(event.executedBy.toString(), operator.address, "Executed by is incorrect");
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
        assert.equal(event.executedBy.toString(), operator.address, "Executed by is incorrect");
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

      it("should ignore any provided seller and assign seller id of msg.sender", async function () {
        // set some other sellerId
        offer.sellerId = "123";

        // Create a group, testing for the event
        const tx = await groupHandler.connect(operator).createGroup(group);
        const txReceipt = await tx.wait();

        const event = getEvent(txReceipt, groupHandlerFacet_Factory, "GroupCreated");

        const groupInstance = Group.fromStruct(event.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(event.groupId.toString(), nextGroupId, "Group Id is incorrect");
        assert.equal(event.sellerId.toString(), sellerId, "Seller Id is incorrect");
        assert.equal(event.executedBy.toString(), operator.address, "Executed by is incorrect");
        assert.equal(groupInstance.toStruct().toString(), groupStruct.toString(), "Group struct is incorrect");
      });

      context("💔 Revert Reasons", async function () {
        it("Caller not operator of any seller", async function () {
          // Attempt to Create a group, expecting revert
          await expect(groupHandler.connect(rando).createGroup(group)).to.revertedWith(RevertReasons.NOT_OPERATOR);
        });

        it("Caller is not the seller of all offers", async function () {
          // create another seller and an offer
          seller = new Seller(id, rando.address, rando.address, rando.address, rando.address, active);
          contractURI = `https://ipfs.io/ipfs/QmW2WQi7j6c7UgJTarActp7tDNikE4B2qXtFCfLPdsgaTQ`;
          await accountHandler.connect(rando).createSeller(seller, contractURI, emptyAuthToken);
          await offerHandler.connect(rando).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId); // creates an offer with id 6

          // add offer belonging to another seller
          group.offerIds = ["2", "6"];

          // Attempt to create a group, expecting revert
          await expect(groupHandler.connect(operator).createGroup(group)).to.revertedWith(RevertReasons.NOT_OPERATOR);
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

        it("Condition 'None' has some values in other fields", async function () {
          method = EvaluationMethod.None;
          condition = new Condition(method, tokenType, tokenAddress, tokenId, threshold, maxCommits);
          group.condition = condition;

          // Attempt to create the group, expecting revert
          await expect(groupHandler.connect(operator).createGroup(group)).to.revertedWith(
            RevertReasons.INVALID_CONDITION_PARAMETERS
          );
        });

        it("Condition 'Threshold' has zero token contract address", async function () {
          method = EvaluationMethod.Threshold;
          tokenAddress = ethers.constants.AddressZero;
          condition = new Condition(method, tokenType, tokenAddress, tokenId, threshold, maxCommits);
          group.condition = condition;

          // Attempt to create the group, expecting revert
          await expect(groupHandler.connect(operator).createGroup(group)).to.revertedWith(
            RevertReasons.INVALID_CONDITION_PARAMETERS
          );
        });

        it("Condition 'SpecificToken' has has zero token contract address", async function () {
          method = EvaluationMethod.SpecificToken;
          tokenAddress = ethers.constants.AddressZero;
          condition = new Condition(method, tokenType, tokenAddress, tokenId, threshold, maxCommits);
          group.condition = condition;

          // Attempt to create the group, expecting revert
          await expect(groupHandler.connect(operator).createGroup(group)).to.revertedWith(
            RevertReasons.INVALID_CONDITION_PARAMETERS
          );
        });
      });
    });

    context("👉 addOffersToGroup()", async function () {
      beforeEach(async function () {
        // Create a group
        await groupHandler.connect(operator).createGroup(group);

        // set the new fields
        offerIdsToAdd = ["1", "4"];
        group.offerIds = [...group.offerIds, ...offerIdsToAdd];

        groupStruct = group.toStruct();
      });

      it("should emit a GroupUpdated event", async function () {
        // Add offers to a group, testing for the event
        const tx = await groupHandler.connect(operator).addOffersToGroup(group.id, offerIdsToAdd);
        const txReceipt = await tx.wait();

        const event = getEvent(txReceipt, groupHandlerFacet_Factory, "GroupUpdated");

        const groupInstance = Group.fromStruct(event.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(event.groupId.toString(), group.id, "Group Id is incorrect");
        assert.equal(event.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(event.executedBy.toString(), operator.address, "Executed by is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
      });

      it("should update state", async function () {
        // Add offers to a group,
        await groupHandler.connect(operator).addOffersToGroup(group.id, offerIdsToAdd);

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
          await expect(groupHandler.connect(operator).addOffersToGroup(group.id, offerIdsToAdd)).to.revertedWith(
            RevertReasons.NO_SUCH_GROUP
          );

          // Set invalid id
          group.id = "0";

          // Attempt to add offers to group, expecting revert
          await expect(groupHandler.connect(operator).addOffersToGroup(group.id, offerIdsToAdd)).to.revertedWith(
            RevertReasons.NO_SUCH_GROUP
          );
        });

        it("Caller is not the seller of the group", async function () {
          // Attempt to add offers to group, expecting revert
          await expect(groupHandler.connect(rando).addOffersToGroup(group.id, offerIdsToAdd)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );
        });

        it("Caller is not the seller of all offers", async function () {
          // create another seller and an offer
          seller = new Seller(id, rando.address, rando.address, rando.address, rando.address, active);
          contractURI = `https://ipfs.io/ipfs/QmW2WQi7j6c7UgJTarActp7tDNikE4B2qXtFCfLPdsgaTQ`;
          await accountHandler.connect(rando).createSeller(seller, contractURI, emptyAuthToken);
          await offerHandler.connect(rando).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId); // creates an offer with id 6

          // add offer belonging to another seller
          offerIdsToAdd = ["1", "6"];

          // Attempt to add offers to group, expecting revert
          await expect(groupHandler.connect(operator).addOffersToGroup(group.id, offerIdsToAdd)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );
        });

        it("Offer is already part of another group", async function () {
          // create another group
          group.offerIds = ["1"];
          await groupHandler.connect(operator).createGroup(group);

          // Attempt to add offers to a group, expecting revert
          await expect(groupHandler.connect(operator).addOffersToGroup(group.id, offerIdsToAdd)).to.revertedWith(
            RevertReasons.OFFER_MUST_BE_UNIQUE
          );
        });

        it("Offer is duplicated", async function () {
          // Try to add the same offer twice
          offerIdsToAdd = ["1", "1", "4"];

          // Attempt to add offers to a group, expecting revert
          await expect(groupHandler.connect(operator).addOffersToGroup(group.id, offerIdsToAdd)).to.revertedWith(
            RevertReasons.OFFER_MUST_BE_UNIQUE
          );
        });

        it("Adding too many offers", async function () {
          // Try to add the more than 100 offers
          offerIdsToAdd = [...Array(101).keys()];

          // Attempt to add offers to a group, expecting revert
          await expect(groupHandler.connect(operator).addOffersToGroup(group.id, offerIdsToAdd)).to.revertedWith(
            RevertReasons.TOO_MANY_OFFERS
          );
        });

        it("Adding nothing", async function () {
          // Try to add nothing
          offerIdsToAdd = [];

          // Attempt to add offers from the group, expecting revert
          await expect(groupHandler.connect(operator).addOffersToGroup(group.id, offerIdsToAdd)).to.revertedWith(
            RevertReasons.NOTHING_UPDATED
          );
        });

        it("Offer does not exist", async function () {
          // Set invalid offer id
          offerIdsToAdd = ["1", "999"];

          // Attempt to add offers to a group, expecting revert
          await expect(groupHandler.connect(operator).addOffersToGroup(group.id, offerIdsToAdd)).to.revertedWith(
            RevertReasons.NO_SUCH_OFFER
          );

          // Set invalid offer id
          offerIdsToAdd = ["0", "2"];

          // Attempt to add offers to a group, expecting revert
          await expect(groupHandler.connect(operator).addOffersToGroup(group.id, offerIdsToAdd)).to.revertedWith(
            RevertReasons.NO_SUCH_OFFER
          );
        });
      });
    });

    context("👉 removeOffersFromGroup()", async function () {
      beforeEach(async function () {
        group.offerIds = ["1", "2", "3", "4", "5"];
        // Create a group
        await groupHandler.connect(operator).createGroup(group);

        // set the new fields
        offerIdsToRemove = ["1", "4"];
        group.offerIds = ["5", "2", "3"]; // ["1","2","3","4","5"] -> ["5","2","3","4"] -> ["5","2","3"]

        groupStruct = group.toStruct();
      });

      it("should emit a GroupUpdated event", async function () {
        // Remove offers from a group, testing for the event
        const tx = await groupHandler.connect(operator).removeOffersFromGroup(group.id, offerIdsToRemove);
        const txReceipt = await tx.wait();

        const event = getEvent(txReceipt, groupHandlerFacet_Factory, "GroupUpdated");

        const groupInstance = Group.fromStruct(event.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(event.groupId.toString(), group.id, "Group Id is incorrect");
        assert.equal(event.groupId.toString(), group.id, "Group Id is incorrect");
        assert.equal(event.executedBy.toString(), operator.address, "Executed by is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
      });

      it("should update state", async function () {
        // Remove offer from a group,
        await groupHandler.connect(operator).removeOffersFromGroup(group.id, offerIdsToRemove);

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
          await expect(
            groupHandler.connect(operator).removeOffersFromGroup(group.id, offerIdsToRemove)
          ).to.revertedWith(RevertReasons.NO_SUCH_GROUP);

          // Set invalid id
          group.id = "0";

          // Attempt to remove offers from group, expecting revert
          await expect(
            groupHandler.connect(operator).removeOffersFromGroup(group.id, offerIdsToRemove)
          ).to.revertedWith(RevertReasons.NO_SUCH_GROUP);
        });

        it("Caller is not the seller of the group", async function () {
          // Attempt to remove offers from the group, expecting revert
          await expect(groupHandler.connect(rando).removeOffersFromGroup(group.id, offerIdsToRemove)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );
        });

        it("Offer is not a part of the group", async function () {
          // inexisting offer
          offerIdsToRemove = ["6"];

          // Attempt to remove offers from the group, expecting revert
          await expect(
            groupHandler.connect(operator).removeOffersFromGroup(group.id, offerIdsToRemove)
          ).to.revertedWith(RevertReasons.OFFER_NOT_IN_GROUP);

          // create an offer and add it to another group
          await offerHandler
            .connect(operator)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);
          group.offerIds = ["6"];
          await groupHandler.connect(operator).createGroup(group);

          // Attempt to remove offers from a group, expecting revert
          await expect(
            groupHandler.connect(operator).removeOffersFromGroup(group.id, offerIdsToRemove)
          ).to.revertedWith(RevertReasons.OFFER_NOT_IN_GROUP);
        });

        it("Removing too many offers", async function () {
          // Try to remove the more than 100 offers
          offerIdsToRemove = [...Array(101).keys()];

          // Attempt to remove offers from the group, expecting revert
          await expect(
            groupHandler.connect(operator).removeOffersFromGroup(group.id, offerIdsToRemove)
          ).to.revertedWith(RevertReasons.TOO_MANY_OFFERS);
        });

        it("Removing nothing", async function () {
          // Try to remove nothing
          offerIdsToRemove = [];

          // Attempt to remove offers from the group, expecting revert
          await expect(
            groupHandler.connect(operator).removeOffersFromGroup(group.id, offerIdsToRemove)
          ).to.revertedWith(RevertReasons.NOTHING_UPDATED);
        });
      });
    });

    context("👉 setGroupCondition()", async function () {
      beforeEach(async function () {
        // Create a group
        await groupHandler.connect(operator).createGroup(group);

        // id of the current group and increment nextGroupId
        id = nextGroupId++;

        // Required constructor params for Condition
        method = EvaluationMethod.SpecificToken;
        tokenType = TokenType.MultiToken;
        tokenAddress = accounts[1].address; // just need an address
        tokenId = "88775544";
        threshold = "0";
        maxCommits = "1";

        condition = new Condition(method, tokenType, tokenAddress, tokenId, threshold, maxCommits);
        expect(condition.isValid()).to.be.true;

        groupStruct = group.toStruct();
      });

      it("should emit a GroupUpdated event", async function () {
        // Update a group, testing for the event
        const tx = await groupHandler.connect(operator).setGroupCondition(group.id, condition);
        const txReceipt = await tx.wait();

        const event = getEvent(txReceipt, groupHandlerFacet_Factory, "GroupUpdated");

        const groupInstance = Group.fromStruct(event.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        group.condition = condition;

        assert.equal(event.groupId.toString(), group.id, "Group Id is incorrect");
        assert.equal(event.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(event.executedBy.toString(), operator.address, "Executed by is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
      });

      it("should update state", async function () {
        // Set a new condition
        await groupHandler.connect(operator).setGroupCondition(group.id, condition);

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
          await expect(groupHandler.connect(operator).setGroupCondition(group.id, condition)).to.revertedWith(
            RevertReasons.NO_SUCH_GROUP
          );

          // Set invalid id
          group.id = "0";

          // Attempt to update the group, expecting revert
          await expect(groupHandler.connect(operator).setGroupCondition(group.id, condition)).to.revertedWith(
            RevertReasons.NO_SUCH_GROUP
          );
        });

        it("Caller is not the seller of the group", async function () {
          // Attempt to remove offers from the group, expecting revert
          await expect(groupHandler.connect(rando).setGroupCondition(group.id, condition)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );
        });

        it("Condition 'None' has some values in other fields", async function () {
          method = EvaluationMethod.None;
          condition = new Condition(method, tokenType, tokenAddress, tokenId, threshold, maxCommits);

          // Attempt to update the group, expecting revert
          await expect(groupHandler.connect(operator).setGroupCondition(group.id, condition)).to.revertedWith(
            RevertReasons.INVALID_CONDITION_PARAMETERS
          );
        });

        it("Condition 'Threshold' has zero token contract address", async function () {
          method = EvaluationMethod.Threshold;
          tokenAddress = ethers.constants.AddressZero;
          condition = new Condition(method, tokenType, tokenAddress, tokenId, threshold, maxCommits);

          // Attempt to update the group, expecting revert
          await expect(groupHandler.connect(operator).setGroupCondition(group.id, condition)).to.revertedWith(
            RevertReasons.INVALID_CONDITION_PARAMETERS
          );
        });

        it("Condition 'Threshold' has zero max commits", async function () {
          method = EvaluationMethod.Threshold;
          condition.maxCommits = "0";

          // Attempt to update the group, expecting revert
          await expect(groupHandler.connect(operator).setGroupCondition(group.id, condition)).to.revertedWith(
            RevertReasons.INVALID_CONDITION_PARAMETERS
          );
        });

        it("Condition 'SpecificToken' has zero token contract address", async function () {
          method = EvaluationMethod.SpecificToken;
          tokenAddress = ethers.constants.AddressZero;
          condition = new Condition(method, tokenType, tokenAddress, tokenId, threshold, maxCommits);

          // Attempt to update the group, expecting revert
          await expect(groupHandler.connect(operator).setGroupCondition(group.id, condition)).to.revertedWith(
            RevertReasons.INVALID_CONDITION_PARAMETERS
          );
        });

        it("Condition 'SpecificToken' has zero max commits", async function () {
          method = EvaluationMethod.SpecificToken;
          condition.maxCommits = "0";

          // Attempt to update the group, expecting revert
          await expect(groupHandler.connect(operator).setGroupCondition(group.id, condition)).to.revertedWith(
            RevertReasons.INVALID_CONDITION_PARAMETERS
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
