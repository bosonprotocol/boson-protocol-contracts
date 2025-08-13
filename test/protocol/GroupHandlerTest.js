const { ethers } = require("hardhat");
const { ZeroAddress, getSigners, parseUnits, getContractFactory, getContractAt, MaxUint256 } = ethers;
const { assert, expect } = require("chai");

const Group = require("../../scripts/domain/Group");
const Condition = require("../../scripts/domain/Condition");
const EvaluationMethod = require("../../scripts/domain/EvaluationMethod");
const TokenType = require("../../scripts/domain/TokenType");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { getEvent, setupTestEnvironment, getSnapshot, revertToSnapshot } = require("../util/utils.js");
const { oneMonth } = require("../util/constants");
const {
  mockOffer,
  mockDisputeResolver,
  mockSeller,
  mockAuthToken,
  mockVoucherInitValues,
  mockCondition,
  accountId,
} = require("../util/mock");
const GatingType = require("../../scripts/domain/GatingType");

/**
 *  Test the Boson Group Handler interface
 */
describe("IBosonGroupHandler", function () {
  // Common vars
  let InterfaceIds;
  let accounts, pauser, rando, assistant, admin, clerk, treasury, assistantDR, adminDR, clerkDR, treasuryDR;
  let erc165, accountHandler, offerHandler, groupHandler, pauseHandler;
  let key, value;
  let offer, support, expected, exists;
  let seller;
  let offerDates;
  let offerDurations;
  let group, groupId;
  let offerIds, condition;
  let groupHandlerFacet_Factory;
  let groupStruct, conditionStruct;
  let offerIdsToAdd, offerIdsToRemove;
  let disputeResolver, disputeResolverFees, drParams;
  let voucherInitValues;
  let emptyAuthToken;
  let agentId;
  let snapshotId;
  let offerFeeLimit;
  let bosonErrors;

  before(async function () {
    accountId.next(true);

    // get interface Ids
    InterfaceIds = await getInterfaceIds();

    // Specify contracts needed for this test
    const contracts = {
      erc165: "ERC165Facet",
      accountHandler: "IBosonAccountHandler",
      offerHandler: "IBosonOfferHandler",
      groupHandler: "IBosonGroupHandler",
      pauseHandler: "IBosonPauseHandler",
    };

    ({
      signers: [pauser, rando, admin, treasury, adminDR, treasuryDR],
      contractInstances: { erc165, accountHandler, offerHandler, groupHandler, pauseHandler },
    } = await setupTestEnvironment(contracts));

    bosonErrors = await getContractAt("BosonErrors", await accountHandler.getAddress());

    // make all account the same
    assistant = admin;
    assistantDR = adminDR;
    clerk = clerkDR = { address: ZeroAddress };

    accounts = await getSigners();

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
      it("should indicate support for IBosonGroupHandler interface", async function () {
        // Current interfaceId for IGroupHandler
        support = await erc165.supportsInterface(InterfaceIds.IBosonGroupHandler);

        // Test
        expect(support, "IBosonGroupHandler interface not supported").is.true;
      });
    });
  });

  // All supported methods
  context("📋 Group Handler Methods", async function () {
    beforeEach(async function () {
      // create a seller
      // Required constructor params
      groupId = "1"; // argument sent to contract for createSeller will be ignored
      agentId = "0"; // agent id is optional while creating an offer
      offerFeeLimit = MaxUint256; // unlimited offer fee to not affect the tests

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
      disputeResolverFees = [new DisputeResolverFee(ZeroAddress, "Native", "0")];

      // Make empty seller list, so every seller is allowed
      const sellerAllowList = [];

      // Register the dispute resolver
      await accountHandler
        .connect(adminDR)
        .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

      // The first group id
      groupId = "1";

      // create 5 offers
      for (let i = 0; i < 5; i++) {
        // Mock offer, offerDates and offerDurations
        ({ offer, offerDates, offerDurations, drParams } = await mockOffer());

        // Set unique offer properties based on index
        offer.id = `${i + 1}`;
        offer.price = parseUnits(`${1.5 + i * 1}`, "ether").toString();
        offer.sellerDeposit = parseUnits(`${0.25 + i * 0.1}`, "ether").toString();
        offer.buyerCancelPenalty = parseUnits(`${0.05 + i * 0.1}`, "ether").toString();
        offer.quantityAvailable = `${(i + 1) * 2}`;
        offerDates.validFrom = (BigInt(Date.now()) + oneMonth * BigInt(i)).toString();
        offerDates.validUntil = (BigInt(Date.now()) + oneMonth * 6n * BigInt(i + 1)).toString();

        // Check if domains are valid
        expect(offer.isValid()).is.true;
        expect(offerDates.isValid()).is.true;
        expect(offerDurations.isValid()).is.true;

        // Create the offer
        await offerHandler
          .connect(assistant)
          .createOffer(offer, offerDates, offerDurations, drParams, agentId, offerFeeLimit);
      }

      // Required constructor params for Group
      offerIds = ["2", "3", "5"];

      condition = mockCondition({
        tokenType: TokenType.MultiToken,
        tokenAddress: accounts[0].address,
        method: EvaluationMethod.Threshold,
      });
      expect(condition.isValid()).to.be.true;

      group = new Group(groupId, seller.id, offerIds);

      expect(group.isValid()).is.true;

      // How that group looks as a returned struct
      groupStruct = group.toStruct();

      // initialize groupHandler
      groupHandlerFacet_Factory = await getContractFactory("GroupHandlerFacet");
    });

    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    context("👉 createGroup()", async function () {
      it("should emit a GroupCreated event", async function () {
        // Create a group, testing for the event
        const tx = await groupHandler.connect(assistant).createGroup(group, condition);
        const txReceipt = await tx.wait();

        const event = getEvent(txReceipt, groupHandlerFacet_Factory, "GroupCreated");

        const groupInstance = Group.fromStruct(event.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(event.groupId.toString(), group.id, "Group Id is incorrect");
        assert.equal(event.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(event.executedBy.toString(), await assistant.getAddress(), "Executed by is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
      });

      it("should update state", async function () {
        // Create a group
        await groupHandler.connect(assistant).createGroup(group, condition);

        // Get the group as a struct
        [, groupStruct] = await groupHandler.connect(rando).getGroup(groupId);

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
        const tx = await groupHandler.connect(assistant).createGroup(group, condition);
        const txReceipt = await tx.wait();

        const event = getEvent(txReceipt, groupHandlerFacet_Factory, "GroupCreated");

        const groupInstance = Group.fromStruct(event.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(event.groupId.toString(), groupId, "Group Id is incorrect");
        assert.equal(event.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(event.executedBy.toString(), await assistant.getAddress(), "Executed by is incorrect");
        assert.equal(groupInstance.toStruct().toString(), groupStruct.toString(), "Group struct is incorrect");

        // wrong group id should not exist
        [exists] = await groupHandler.connect(rando).getGroup(group.id);
        expect(exists).to.be.false;

        // next group id should exist
        [exists] = await groupHandler.connect(rando).getGroup(groupId);
        expect(exists).to.be.true;
      });

      it("should create group without any offer", async function () {
        group.offerIds = [];

        // Create a group, testing for the event
        await groupHandler.connect(assistant).createGroup(group, condition);

        // group should have no offers
        let returnedGroup;
        [, returnedGroup] = await groupHandler.connect(rando).getGroup(groupId);
        assert.equal(returnedGroup.offerIds, group.offerIds.toString(), "Offer ids should be empty");
      });

      it("should ignore any provided seller and assign seller id of msg.sender", async function () {
        // set some other sellerId
        offer.creatorId = "123";

        // Create a group, testing for the event
        const tx = await groupHandler.connect(assistant).createGroup(group, condition);
        const txReceipt = await tx.wait();

        const event = getEvent(txReceipt, groupHandlerFacet_Factory, "GroupCreated");

        const groupInstance = Group.fromStruct(event.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(event.groupId.toString(), groupId, "Group Id is incorrect");
        assert.equal(event.sellerId.toString(), seller.id, "Seller Id is incorrect");
        assert.equal(event.executedBy.toString(), await assistant.getAddress(), "Executed by is incorrect");
        assert.equal(groupInstance.toStruct().toString(), groupStruct.toString(), "Group struct is incorrect");
      });

      context("💔 Revert Reasons", async function () {
        it("The groups region of protocol is paused", async function () {
          // Pause the groups region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Groups]);

          // Attempt to create a group expecting revert
          await expect(groupHandler.connect(assistant).createGroup(group, condition))
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Groups);
        });

        it("Caller not assistant of any seller", async function () {
          // Attempt to Create a group, expecting revert
          await expect(groupHandler.connect(rando).createGroup(group, condition)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.NOT_ASSISTANT
          );
        });

        it("Caller is not the seller of all offers", async function () {
          // create another seller and an offer
          seller = mockSeller(
            await rando.getAddress(),
            await rando.getAddress(),
            ZeroAddress,
            await rando.getAddress()
          );

          await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);
          await offerHandler
            .connect(rando)
            .createOffer(offer, offerDates, offerDurations, drParams, agentId, offerFeeLimit); // creates an offer with id 6

          // add offer belonging to another seller
          group.offerIds = ["2", "6"];

          // Attempt to create a group, expecting revert
          await expect(groupHandler.connect(assistant).createGroup(group, condition)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.NOT_ASSISTANT
          );
        });

        it("Offer does not exist", async function () {
          // Invalid offer id
          group.offerIds = ["1", "999"];

          // Attempt to create a group, expecting revert
          await expect(groupHandler.connect(assistant).createGroup(group, condition)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.NO_SUCH_OFFER
          );

          // Invalid offer id
          group.offerIds = ["0", "4"];

          // Attempt to create a group, expecting revert
          await expect(groupHandler.connect(assistant).createGroup(group, condition)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.NO_SUCH_OFFER
          );
        });

        it("Offer is already part of another group", async function () {
          // create first group
          await groupHandler.connect(assistant).createGroup(group, condition);

          // Add offer that is already part of another group
          group.offerIds = ["1", "2", "4"];

          // Attempt to create a group, expecting revert
          await expect(groupHandler.connect(assistant).createGroup(group, condition)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.OFFER_MUST_BE_UNIQUE
          );
        });

        it("Offer is duplicated", async function () {
          // Try to add the same offer twice
          group.offerIds = ["1", "1", "4"];

          // Attempt to create a group, expecting revert
          await expect(groupHandler.connect(assistant).createGroup(group, condition)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.OFFER_MUST_BE_UNIQUE
          );
        });

        context("Condition 'None' has some values in other fields", async function () {
          beforeEach(async function () {
            condition = mockCondition({ method: EvaluationMethod.None, threshold: "0", maxCommits: "0" });
          });

          it("Token address is not zero", async function () {
            condition.tokenAddress = await rando.getAddress();

            // Attempt to create the group, expecting revert
            await expect(groupHandler.connect(assistant).createGroup(group, condition)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_CONDITION_PARAMETERS
            );
          });

          it("Min token id is not zero", async function () {
            condition.minTokenId = "20";

            // Attempt to create the group, expecting revert
            await expect(groupHandler.connect(assistant).createGroup(group, condition)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_CONDITION_PARAMETERS
            );
          });

          it("Threshold is not zero", async function () {
            condition.threshold = "100";

            // Attempt to create the group, expecting revert
            await expect(groupHandler.connect(assistant).createGroup(group, condition)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_CONDITION_PARAMETERS
            );
          });

          it("Max commits is not zero", async function () {
            condition.maxCommits = "5";

            // Attempt to create the group, expecting revert
            await expect(groupHandler.connect(assistant).createGroup(group, condition)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_CONDITION_PARAMETERS
            );
          });

          it("Max token id is not zero", async function () {
            condition.maxTokenId = "5";

            // Attempt to create the group, expecting revert
            await expect(groupHandler.connect(assistant).createGroup(group, condition)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_CONDITION_PARAMETERS
            );
          });

          it("Token type is not FungibleToken (default enum value)", async function () {
            condition.tokenType = TokenType.NonFungibleToken;

            // Attempt to create the group, expecting revert
            await expect(groupHandler.connect(assistant).createGroup(group, condition)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_CONDITION_PARAMETERS
            );
          });

          it("Gating type is not PerAddress (default enum value)", async function () {
            condition.gating = GatingType.PerTokenId;

            // Attempt to create the group, expecting revert
            await expect(groupHandler.connect(assistant).createGroup(group, condition)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_CONDITION_PARAMETERS
            );
          });
        });

        context("Condition 'Threshold' has invalid fields", async function () {
          beforeEach(async function () {
            condition = mockCondition({
              method: EvaluationMethod.Threshold,
              tokenAddress: await rando.getAddress(),
              maxCommits: "10",
              threshold: "200",
              minTokenId: "10",
              maxTokenId: "20",
              gating: GatingType.PerAddress,
            });
          });

          it("Condition 'Threshold' has zero token contract address", async function () {
            condition.tokenAddress = ZeroAddress;

            // Attempt to create the group, expecting revert
            await expect(groupHandler.connect(assistant).createGroup(group, condition)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_CONDITION_PARAMETERS
            );
          });

          it("Condition 'Threshold' has zero maxCommits", async function () {
            condition.maxCommits = "0";

            // Attempt to create the group, expecting revert
            await expect(groupHandler.connect(assistant).createGroup(group, condition)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_CONDITION_PARAMETERS
            );
          });

          it("Condition 'Threshold' has zero threshold", async function () {
            condition.threshold = "0";

            // Attempt to create the group, expecting revert
            await expect(groupHandler.connect(assistant).createGroup(group, condition)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_CONDITION_PARAMETERS
            );
          });

          it("Condition 'Threshold' with MultiToken has maxTokenId < minTokenId", async function () {
            condition.tokenType = TokenType.MultiToken;
            condition.minTokenId = "100";
            condition.maxTokenId = "90";

            // Attempt to create the group, expecting revert
            await expect(groupHandler.connect(assistant).createGroup(group, condition)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_CONDITION_PARAMETERS
            );
          });

          it("Condition 'Threshold' with fungible token has non-zero tokenId", async function () {
            condition.tokenType = TokenType.FungibleToken;
            condition.minTokenId = "100";
            condition.maxTokenId = "110";

            // Attempt to create the group, expecting revert
            await expect(groupHandler.connect(assistant).createGroup(group, condition)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_CONDITION_PARAMETERS
            );
          });

          it("Condition 'Threshold' with non-fungible token has non-zero tokenId", async function () {
            condition.tokenType = TokenType.NonFungibleToken;
            condition.minTokenId = "100";
            condition.maxTokenId = "110";

            // Attempt to create the group, expecting revert
            await expect(groupHandler.connect(assistant).createGroup(group, condition)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_CONDITION_PARAMETERS
            );
          });

          it("Condition 'Threshold' with fungible token has per token id gating", async function () {
            condition.tokenType = TokenType.FungibleToken;
            condition.gating = GatingType.PerTokenId;

            // Attempt to create the group, expecting revert
            await expect(groupHandler.connect(assistant).createGroup(group, condition)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_CONDITION_PARAMETERS
            );
          });

          it("Condition 'Threshold' with non-fungible token has per token id gating", async function () {
            condition.tokenType = TokenType.NonFungibleToken;
            condition.gating = GatingType.PerTokenId;

            // Attempt to create the group, expecting revert
            await expect(groupHandler.connect(assistant).createGroup(group, condition)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_CONDITION_PARAMETERS
            );
          });
        });

        context("Condition 'SpecificToken' has invalid fields", async function () {
          beforeEach(async function () {
            condition = mockCondition({
              method: EvaluationMethod.SpecificToken,
              tokenAddress: await rando.getAddress(),
              threshold: "0",
              maxCommits: "5",
              tokenType: TokenType.NonFungibleToken,
            });
          });

          it("Condition 'SpecificToken' has zero token contract address", async function () {
            condition.tokenAddress = ZeroAddress;

            // Attempt to create the group, expecting revert
            await expect(groupHandler.connect(assistant).createGroup(group, condition)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_CONDITION_PARAMETERS
            );
          });

          it("Condition 'SpecificToken' has non zero threshold", async function () {
            condition.threshold = "10";

            // Attempt to create the group, expecting revert
            await expect(groupHandler.connect(assistant).createGroup(group, condition)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_CONDITION_PARAMETERS
            );
          });

          it("Condition 'SpecificToken' has zero maxCommits", async function () {
            condition.maxCommits = "0";

            // Attempt to create the group, expecting revert
            await expect(groupHandler.connect(assistant).createGroup(group, condition)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_CONDITION_PARAMETERS
            );
          });

          it("Condition 'SpecificToken' with MultiToken token type", async function () {
            condition.tokenType = TokenType.MultiToken;

            // Attempt to create the group, expecting revert
            await expect(groupHandler.connect(assistant).createGroup(group, condition)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_CONDITION_PARAMETERS
            );
          });

          it("Condition 'SpecificToken' with FungibleToken token type", async function () {
            condition.tokenType = TokenType.FungibleToken;

            // Attempt to create the group, expecting revert
            await expect(groupHandler.connect(assistant).createGroup(group, condition)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_CONDITION_PARAMETERS
            );
          });

          it("Condition 'SpecificToken' has maxTokenId < minTokenId", async function () {
            condition.minTokenId = "15";
            condition.maxTokenId = "10";

            // Attempt to create the group, expecting revert
            await expect(groupHandler.connect(assistant).createGroup(group, condition)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_CONDITION_PARAMETERS
            );
          });
        });
      });
    });

    context("👉 addOffersToGroup()", async function () {
      beforeEach(async function () {
        // Create a group
        await groupHandler.connect(assistant).createGroup(group, condition);

        // set the new fields
        offerIdsToAdd = ["1", "4"];
        group.offerIds = [...group.offerIds, ...offerIdsToAdd];

        groupStruct = group.toStruct();
      });

      it("should emit a GroupUpdated event", async function () {
        // Add offers to a group, testing for the event
        const tx = await groupHandler.connect(assistant).addOffersToGroup(group.id, offerIdsToAdd);
        const txReceipt = await tx.wait();

        const event = getEvent(txReceipt, groupHandlerFacet_Factory, "GroupUpdated");

        const groupInstance = Group.fromStruct(event.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(event.groupId.toString(), group.id, "Group Id is incorrect");
        assert.equal(event.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(event.executedBy.toString(), await assistant.getAddress(), "Executed by is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
      });

      it("should update state", async function () {
        // Add offers to a group,
        await groupHandler.connect(assistant).addOffersToGroup(group.id, offerIdsToAdd);

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
        it("The groups region of protocol is paused", async function () {
          // Pause the groups region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Groups]);

          // Attempt to add offers to a group, expecting revert
          await expect(groupHandler.connect(assistant).addOffersToGroup(group.id, offerIdsToAdd))
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Groups);
        });

        it("Group does not exist", async function () {
          // Set invalid id
          group.id = "444";

          // Attempt to add offers to the group, expecting revert
          await expect(
            groupHandler.connect(assistant).addOffersToGroup(group.id, offerIdsToAdd)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_GROUP);

          // Set invalid id
          group.id = "0";

          // Attempt to add offers to group, expecting revert
          await expect(
            groupHandler.connect(assistant).addOffersToGroup(group.id, offerIdsToAdd)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_GROUP);
        });

        it("Caller is not the seller of the group", async function () {
          // Attempt to add offers to group, expecting revert
          await expect(
            groupHandler.connect(rando).addOffersToGroup(group.id, offerIdsToAdd)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_ASSISTANT);
        });

        it("Caller is not the seller of all offers", async function () {
          // create another seller and an offer
          seller = mockSeller(
            await rando.getAddress(),
            await rando.getAddress(),
            ZeroAddress,
            await rando.getAddress()
          );

          await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);
          await offerHandler
            .connect(rando)
            .createOffer(offer, offerDates, offerDurations, drParams, agentId, offerFeeLimit); // creates an offer with id 6

          // add offer belonging to another seller
          offerIdsToAdd = ["1", "6"];

          // Attempt to add offers to group, expecting revert
          await expect(
            groupHandler.connect(assistant).addOffersToGroup(group.id, offerIdsToAdd)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_ASSISTANT);
        });

        it("Offer is already part of another group", async function () {
          // create another group
          group.offerIds = ["1"];
          await groupHandler.connect(assistant).createGroup(group, condition);

          // Attempt to add offers to a group, expecting revert
          await expect(
            groupHandler.connect(assistant).addOffersToGroup(group.id, offerIdsToAdd)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_MUST_BE_UNIQUE);
        });

        it("Offer is duplicated", async function () {
          // Try to add the same offer twice
          offerIdsToAdd = ["1", "1", "4"];

          // Attempt to add offers to a group, expecting revert
          await expect(
            groupHandler.connect(assistant).addOffersToGroup(group.id, offerIdsToAdd)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_MUST_BE_UNIQUE);
        });

        it("Adding nothing", async function () {
          // Try to add nothing
          offerIdsToAdd = [];

          // Attempt to add offers from the group, expecting revert
          await expect(
            groupHandler.connect(assistant).addOffersToGroup(group.id, offerIdsToAdd)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOTHING_UPDATED);
        });

        it("Offer does not exist", async function () {
          // Set invalid offer id
          offerIdsToAdd = ["1", "999"];

          // Attempt to add offers to a group, expecting revert
          await expect(
            groupHandler.connect(assistant).addOffersToGroup(group.id, offerIdsToAdd)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_OFFER);

          // Set invalid offer id
          offerIdsToAdd = ["0", "2"];

          // Attempt to add offers to a group, expecting revert
          await expect(
            groupHandler.connect(assistant).addOffersToGroup(group.id, offerIdsToAdd)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_OFFER);
        });
      });
    });

    context("👉 removeOffersFromGroup()", async function () {
      beforeEach(async function () {
        group.offerIds = ["1", "2", "3", "4", "5"];
        // Create a group
        await groupHandler.connect(assistant).createGroup(group, condition);

        // set the new fields
        offerIdsToRemove = ["1", "4"];
        group.offerIds = ["5", "2", "3"]; // ["1","2","3","4","5"] -> ["5","2","3","4"] -> ["5","2","3"]

        groupStruct = group.toStruct();
      });

      it("should emit a GroupUpdated event", async function () {
        // Remove offers from a group, testing for the event
        const tx = await groupHandler.connect(assistant).removeOffersFromGroup(group.id, offerIdsToRemove);
        const txReceipt = await tx.wait();

        const event = getEvent(txReceipt, groupHandlerFacet_Factory, "GroupUpdated");

        const groupInstance = Group.fromStruct(event.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(event.groupId.toString(), group.id, "Group Id is incorrect");
        assert.equal(event.executedBy.toString(), await assistant.getAddress(), "Executed by is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
      });

      it("should update state", async function () {
        // Remove offer from a group,
        await groupHandler.connect(assistant).removeOffersFromGroup(group.id, offerIdsToRemove);

        // Get the group as a struct
        [, groupStruct] = await groupHandler.connect(rando).getGroup(group.id);

        // Parse into entity
        const returnedGroup = Group.fromStruct(groupStruct);

        // Returned values should  reflect the changes done with removeOffersFromGroup
        for ([key, value] of Object.entries(group)) {
          expect(JSON.stringify(returnedGroup[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should delete even when offerIds length is 1", async function () {
        // Put 4 back in the group
        group.offerIds.push("4");

        // Remove offer from a group,
        await groupHandler.connect(assistant).removeOffersFromGroup(group.id, ["1"]);

        // Get the group as a struct
        [, groupStruct] = await groupHandler.connect(rando).getGroup(group.id);

        // Parse into entity
        const returnedGroup = Group.fromStruct(groupStruct);

        // Returned values should  reflect the changes done with removeOffersFromGroup
        for ([key, value] of Object.entries(group)) {
          expect(JSON.stringify(returnedGroup[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should delete even when offerIds length - 1 is different from index", async function () {
        // length - 1 is different from index when index isn't the first or last element in the list
        // Also remove token 5 for offerIdsToRemove to have length = 3
        offerIdsToRemove.push("5");
        // Remove 5 from expected offerIds and change order because of how removing is implemented
        group.offerIds = ["3", "2"];

        // Remove offer from a group
        await groupHandler.connect(assistant).removeOffersFromGroup(group.id, offerIdsToRemove);

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
        it("The groups region of protocol is paused", async function () {
          // Pause the groups region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Groups]);

          // Attempt to remove offers to a group, expecting revert
          await expect(groupHandler.connect(assistant).removeOffersFromGroup(group.id, offerIdsToRemove))
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Groups);
        });

        it("Group does not exist", async function () {
          // Set invalid id
          group.id = "444";

          // Attempt to remove offers from the group, expecting revert
          await expect(
            groupHandler.connect(assistant).removeOffersFromGroup(group.id, offerIdsToRemove)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_GROUP);

          // Set invalid id
          group.id = "0";

          // Attempt to remove offers from group, expecting revert
          await expect(
            groupHandler.connect(assistant).removeOffersFromGroup(group.id, offerIdsToRemove)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_GROUP);
        });

        it("Caller is not the seller of the group", async function () {
          // Attempt to remove offers from the group, expecting revert
          await expect(
            groupHandler.connect(rando).removeOffersFromGroup(group.id, offerIdsToRemove)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_ASSISTANT);
        });

        it("Offer is not a part of the group", async function () {
          // inexisting offer
          offerIdsToRemove = ["6"];

          // Attempt to remove offers from the group, expecting revert
          await expect(
            groupHandler.connect(assistant).removeOffersFromGroup(group.id, offerIdsToRemove)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_NOT_IN_GROUP);

          // create an offer and add it to another group
          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, drParams, agentId, offerFeeLimit);
          group.offerIds = ["6"];
          await groupHandler.connect(assistant).createGroup(group, condition);

          // Attempt to remove offers from a group, expecting revert
          await expect(
            groupHandler.connect(assistant).removeOffersFromGroup(group.id, offerIdsToRemove)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_NOT_IN_GROUP);
        });

        it("Removing nothing", async function () {
          // Try to remove nothing
          offerIdsToRemove = [];

          // Attempt to remove offers from the group, expecting revert
          await expect(
            groupHandler.connect(assistant).removeOffersFromGroup(group.id, offerIdsToRemove)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOTHING_UPDATED);
        });
      });
    });

    context("👉 setGroupCondition()", async function () {
      beforeEach(async function () {
        condition = mockCondition({
          tokenAddress: accounts[1].address,
          minTokenId: "88775544",
          threshold: "1",
          tokenType: TokenType.MultiToken,
          method: EvaluationMethod.Threshold,
          maxTokenId: "88775544",
        });
        expect(condition.isValid()).to.be.true;

        // Create a group
        await groupHandler.connect(assistant).createGroup(group, condition);

        // id of the current group and increment groupId
        groupId++;

        groupStruct = group.toStruct();
      });

      it("should emit a GroupUpdated event", async function () {
        // Update a group, testing for the event
        const tx = await groupHandler.connect(assistant).setGroupCondition(group.id, condition);
        const txReceipt = await tx.wait();

        const event = getEvent(txReceipt, groupHandlerFacet_Factory, "GroupUpdated");

        const groupInstance = Group.fromStruct(event.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(event.groupId.toString(), group.id, "Group Id is incorrect");
        assert.equal(event.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(event.executedBy.toString(), await assistant.getAddress(), "Executed by is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
      });

      it("should update state", async function () {
        // Set a new condition
        await groupHandler.connect(assistant).setGroupCondition(group.id, condition);

        // Get the group as a struct
        [, groupStruct, conditionStruct] = await groupHandler.connect(rando).getGroup(group.id);

        // Returned values should match the input in setGroupCondition
        expect(Condition.fromStruct(conditionStruct).toString() === condition.toString()).is.true;
      });

      context("💔 Revert Reasons", async function () {
        it("The groups region of protocol is paused", async function () {
          // Pause the groups region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Groups]);

          // Attempt to set group condition, expecting revert
          await expect(groupHandler.connect(assistant).setGroupCondition(group.id, condition))
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Groups);
        });

        it("Group does not exist", async function () {
          // Set invalid id
          group.id = "444";

          // Attempt to update the group, expecting revert
          await expect(
            groupHandler.connect(assistant).setGroupCondition(group.id, condition)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_GROUP);

          // Set invalid id
          group.id = "0";

          // Attempt to update the group, expecting revert
          await expect(
            groupHandler.connect(assistant).setGroupCondition(group.id, condition)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_GROUP);
        });

        it("Caller is not the seller of the group", async function () {
          // Attempt to remove offers from the group, expecting revert
          await expect(groupHandler.connect(rando).setGroupCondition(group.id, condition)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.NOT_ASSISTANT
          );
        });

        it("Condition 'None' has some values in other fields", async function () {
          condition.method = EvaluationMethod.None;

          // Attempt to update the group, expecting revert
          await expect(
            groupHandler.connect(assistant).setGroupCondition(group.id, condition)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_CONDITION_PARAMETERS);
        });

        it("Condition 'Threshold' has zero token contract address", async function () {
          condition.method = EvaluationMethod.Threshold;
          condition.tokenAddress = ZeroAddress;

          // Attempt to update the group, expecting revert
          await expect(
            groupHandler.connect(assistant).setGroupCondition(group.id, condition)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_CONDITION_PARAMETERS);
        });

        it("Condition 'Threshold' has zero max commits", async function () {
          condition.method = EvaluationMethod.Threshold;
          condition.maxCommits = "0";

          // Attempt to update the group, expecting revert
          await expect(
            groupHandler.connect(assistant).setGroupCondition(group.id, condition)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_CONDITION_PARAMETERS);
        });

        it("Condition 'SpecificToken' has zero token contract address", async function () {
          condition.method = EvaluationMethod.SpecificToken;
          condition.tokenAddress = ZeroAddress;

          // Attempt to update the group, expecting revert
          await expect(
            groupHandler.connect(assistant).setGroupCondition(group.id, condition)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_CONDITION_PARAMETERS);
        });

        it("Condition 'SpecificToken' has zero max commits", async function () {
          condition.method = EvaluationMethod.SpecificToken;
          condition.maxCommits = "0";

          // Attempt to update the group, expecting revert
          await expect(
            groupHandler.connect(assistant).setGroupCondition(group.id, condition)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_CONDITION_PARAMETERS);
        });
      });
    });

    context("👉 getGroup()", async function () {
      beforeEach(async function () {
        // Create a group
        await groupHandler.connect(assistant).createGroup(group, condition);
      });

      it("should return true for exists if group is found", async function () {
        // Get the exists flag
        [exists] = await groupHandler.connect(rando).getGroup(groupId);

        // Validate
        expect(exists).to.be.true;
      });

      it("should return false for exists if group is not found", async function () {
        // Get the exists flag
        [exists] = await groupHandler.connect(rando).getGroup("666");

        // Validate
        expect(exists).to.be.false;
      });

      it("should return the details of the group as a struct if found", async function () {
        // Get the group as a struct
        [, groupStruct] = await groupHandler.connect(rando).getGroup(groupId);

        // Parse into entity
        const returnedGroup = Group.fromStruct(groupStruct);

        // Validate
        expect(returnedGroup.isValid()).to.be.true;

        // Returned values should match what is expected for the silently created group
        for ([key, value] of Object.entries(group)) {
          expect(JSON.stringify(returnedGroup[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should return the details of the condition as a struct if found", async function () {
        // Get the group as a struct
        [, , conditionStruct] = await groupHandler.connect(rando).getGroup(groupId);

        // Parse into entity
        const returnedCondition = Condition.fromStruct(conditionStruct);

        // Validate
        expect(returnedCondition.isValid()).to.be.true;

        // Returned values should match the condition
        for ([key, value] of Object.entries(condition)) {
          expect(JSON.stringify(returnedCondition[key]) === JSON.stringify(value)).is.true;
        }
      });
    });

    context("👉 getNextGroupId()", async function () {
      beforeEach(async function () {
        // Create a group
        await groupHandler.connect(assistant).createGroup(group, condition);

        // id of the current group and increment groupId
        groupId++;
      });

      it("should return the next group id", async function () {
        // What we expect the next group id to be
        expected = groupId;

        // Get the next group id
        groupId = await groupHandler.connect(rando).getNextGroupId();

        // Verify expectation
        expect(groupId.toString() == expected).to.be.true;
      });

      it("should be incremented after a group is created", async function () {
        // Create another group
        group.offerIds = ["1", "4"];
        await groupHandler.connect(assistant).createGroup(group, condition);

        // What we expect the next group id to be
        expected = ++groupId;

        // Get the next group id
        groupId = await groupHandler.connect(rando).getNextGroupId();

        // Verify expectation
        expect(groupId.toString() == expected).to.be.true;
      });

      it("should not be incremented when only getNextGroupId is called", async function () {
        // What we expect the next group id to be
        expected = groupId;

        // Get the next group id
        groupId = await groupHandler.connect(rando).getNextGroupId();

        // Verify expectation
        expect(groupId.toString() == expected).to.be.true;

        // Call again
        groupId = await groupHandler.connect(rando).getNextGroupId();

        // Verify expectation
        expect(groupId.toString() == expected).to.be.true;
      });
    });
  });
});
