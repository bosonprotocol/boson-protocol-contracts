const hre = require("hardhat");
const ethers = hre.ethers;
const { assert, expect } = require("chai");
const { gasLimit } = require("../../environments");

const Role = require("../../scripts/domain/Role");
const Group = require("../../scripts/domain/Group");
const Condition = require("../../scripts/domain/Condition");
const EvaluationMethod = require("../../scripts/domain/EvaluationMethod");
const TokenType = require("../../scripts/domain/TokenType");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const { getEvent } = require("../../scripts/util/test-utils.js");
const { oneWeek, oneMonth } = require("../utils/constants");
const {
  mockOffer,
  mockDisputeResolver,
  mockSeller,
  mockAuthToken,
  mockVoucherInitValues,
  mockCondition,
  accountId,
} = require("../utils/mock");

/**
 *  Test the Boson Group Handler interface
 */
describe("IBosonGroupHandler", function () {
  // Common vars
  let InterfaceIds;
  let accounts,
    deployer,
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
    protocolTreasury;
  let erc165, protocolDiamond, accessController, accountHandler, offerHandler, groupHandler, pauseHandler;
  let bosonToken, key, value;
  let offer, support, expected, exists;
  let seller;
  let offerDates;
  let offerDurations;
  let protocolFeePercentage, protocolFeeFlatBoson, buyerEscalationDepositPercentage;
  let group, groupId;
  let offerIds, condition;
  let groupHandlerFacet_Factory;
  let groupStruct, conditionStruct;
  let offerIdsToAdd, offerIdsToRemove;
  let disputeResolver, disputeResolverFees, disputeResolverId;
  let voucherInitValues;
  let emptyAuthToken;
  let agentId;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();
  });

  beforeEach(async function () {
    // Make accounts available
    [
      deployer,
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
      protocolTreasury,
    ] = await ethers.getSigners();
    accounts = await ethers.getSigners();

    // Deploy the Protocol Diamond
    [protocolDiamond, , , , accessController] = await deployProtocolDiamond();

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Temporarily grant PAUSER role to pauser account
    await accessController.grantRole(Role.PAUSER, pauser.address);

    // Cut the protocol handler facets into the Diamond
    await deployProtocolHandlerFacets(protocolDiamond, [
      "SellerHandlerFacet",
      "DisputeResolverHandlerFacet",
      "OfferHandlerFacet",
      "GroupHandlerFacet",
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

    // Add config Handler, so ids starts at 1
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
    await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);

    // Cast Diamond to IERC165
    erc165 = await ethers.getContractAt("ERC165Facet", protocolDiamond.address);
    // Cast Diamond to IBosonAccountHandler. Use this interface to call all individual account handlers
    accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);
    // Cast Diamond to IOfferHandler
    offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);
    // Cast Diamond to IGroupHandler
    groupHandler = await ethers.getContractAt("IBosonGroupHandler", protocolDiamond.address);
    // Cast Diamond to IBosonPauseHandler
    pauseHandler = await ethers.getContractAt("IBosonPauseHandler", protocolDiamond.address);
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
      disputeResolverFees = [new DisputeResolverFee(ethers.constants.AddressZero, "Native", "0")];

      // Make empty seller list, so every seller is allowed
      const sellerAllowList = [];

      // Register and activate the dispute resolver
      await accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
      await accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id);

      // The first group id
      groupId = "1";

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

      // Required constructor params for Group
      offerIds = ["2", "3", "5"];

      condition = mockCondition({
        tokenType: TokenType.MultiToken,
        tokenAddress: accounts[0].address,
        tokenId: "5150",
      });
      expect(condition.isValid()).to.be.true;

      group = new Group(groupId, seller.id, offerIds);

      expect(group.isValid()).is.true;

      // How that group looks as a returned struct
      groupStruct = group.toStruct();

      // initialize groupHandler
      groupHandlerFacet_Factory = await ethers.getContractFactory("GroupHandlerFacet");
    });

    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    context("👉 createGroup()", async function () {
      it("should emit a GroupCreated event", async function () {
        // Create a group, testing for the event
        const tx = await groupHandler.connect(operator).createGroup(group, condition);
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
        await groupHandler.connect(operator).createGroup(group, condition);

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
        const tx = await groupHandler.connect(operator).createGroup(group, condition);
        const txReceipt = await tx.wait();

        const event = getEvent(txReceipt, groupHandlerFacet_Factory, "GroupCreated");

        const groupInstance = Group.fromStruct(event.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(event.groupId.toString(), groupId, "Group Id is incorrect");
        assert.equal(event.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(event.executedBy.toString(), operator.address, "Executed by is incorrect");
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
        await groupHandler.connect(operator).createGroup(group, condition);

        // group should have no offers
        let returnedGroup;
        [, returnedGroup] = await groupHandler.connect(rando).getGroup(groupId);
        assert.equal(returnedGroup.offerIds, group.offerIds.toString(), "Offer ids should be empty");
      });

      it("should ignore any provided seller and assign seller id of msg.sender", async function () {
        // set some other sellerId
        offer.sellerId = "123";

        // Create a group, testing for the event
        const tx = await groupHandler.connect(operator).createGroup(group, condition);
        const txReceipt = await tx.wait();

        const event = getEvent(txReceipt, groupHandlerFacet_Factory, "GroupCreated");

        const groupInstance = Group.fromStruct(event.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(event.groupId.toString(), groupId, "Group Id is incorrect");
        assert.equal(event.sellerId.toString(), seller.id, "Seller Id is incorrect");
        assert.equal(event.executedBy.toString(), operator.address, "Executed by is incorrect");
        assert.equal(groupInstance.toStruct().toString(), groupStruct.toString(), "Group struct is incorrect");
      });

      context("💔 Revert Reasons", async function () {
        it("The groups region of protocol is paused", async function () {
          // Pause the groups region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Groups]);

          // Attempt to create a group expecting revert
          await expect(groupHandler.connect(operator).createGroup(group, condition)).to.revertedWith(
            RevertReasons.REGION_PAUSED
          );
        });

        it("Caller not operator of any seller", async function () {
          // Attempt to Create a group, expecting revert
          await expect(groupHandler.connect(rando).createGroup(group, condition)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );
        });

        it("Caller is not the seller of all offers", async function () {
          // create another seller and an offer
          seller = mockSeller(rando.address, rando.address, rando.address, rando.address);

          await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);
          await offerHandler.connect(rando).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId); // creates an offer with id 6

          // add offer belonging to another seller
          group.offerIds = ["2", "6"];

          // Attempt to create a group, expecting revert
          await expect(groupHandler.connect(operator).createGroup(group, condition)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );
        });

        it("Offer does not exist", async function () {
          // Invalid offer id
          group.offerIds = ["1", "999"];

          // Attempt to create a group, expecting revert
          await expect(groupHandler.connect(operator).createGroup(group, condition)).to.revertedWith(
            RevertReasons.NO_SUCH_OFFER
          );

          // Invalid offer id
          group.offerIds = ["0", "4"];

          // Attempt to create a group, expecting revert
          await expect(groupHandler.connect(operator).createGroup(group, condition)).to.revertedWith(
            RevertReasons.NO_SUCH_OFFER
          );
        });

        it("Offer is already part of another group", async function () {
          // create first group
          await groupHandler.connect(operator).createGroup(group, condition);

          // Add offer that is already part of another group
          group.offerIds = ["1", "2", "4"];

          // Attempt to create a group, expecting revert
          await expect(groupHandler.connect(operator).createGroup(group, condition)).to.revertedWith(
            RevertReasons.OFFER_MUST_BE_UNIQUE
          );
        });

        it("Offer is duplicated", async function () {
          // Try to add the same offer twice
          group.offerIds = ["1", "1", "4"];

          // Attempt to create a group, expecting revert
          await expect(groupHandler.connect(operator).createGroup(group, condition)).to.revertedWith(
            RevertReasons.OFFER_MUST_BE_UNIQUE
          );
        });

        it("Adding too many offers", async function () {
          // Try to add the more than 100 offers
          group.offerIds = [...Array(101).keys()];

          // Attempt to create a group, expecting revert
          await expect(groupHandler.connect(operator).createGroup(group, condition)).to.revertedWith(
            RevertReasons.TOO_MANY_OFFERS
          );
        });

        context("Condition 'None' has some values in other fields", async function () {
          beforeEach(async function () {
            condition = mockCondition({ method: EvaluationMethod.None, threshold: "0", maxCommits: "0" });
          });

          it("Token address is not zero", async function () {
            condition.tokenAddress = rando.address;

            // Attempt to create the group, expecting revert
            await expect(groupHandler.connect(operator).createGroup(group, condition)).to.revertedWith(
              RevertReasons.INVALID_CONDITION_PARAMETERS
            );
          });

          it("Token id is not zero", async function () {
            condition.tokenId = "20";

            // Attempt to create the group, expecting revert
            await expect(groupHandler.connect(operator).createGroup(group, condition)).to.revertedWith(
              RevertReasons.INVALID_CONDITION_PARAMETERS
            );
          });

          it("Threshold is not zero", async function () {
            condition.threshold = "100";

            // Attempt to create the group, expecting revert
            await expect(groupHandler.connect(operator).createGroup(group, condition)).to.revertedWith(
              RevertReasons.INVALID_CONDITION_PARAMETERS
            );
          });

          it("Max commits is not zero", async function () {
            condition.maxCommits = "5";

            // Attempt to create the group, expecting revert
            await expect(groupHandler.connect(operator).createGroup(group, condition)).to.revertedWith(
              RevertReasons.INVALID_CONDITION_PARAMETERS
            );
          });
        });

        context("Condition 'Threshold' has invalid fields", async function () {
          beforeEach(async function () {
            condition = mockCondition({
              method: EvaluationMethod.Threshold,
              tokenAddress: rando.address,
              maxCommits: "10",
              threshold: "200",
            });
          });

          it("Condition 'Threshold' has zero token contract address", async function () {
            condition.tokenAddress = ethers.constants.AddressZero;

            // Attempt to create the group, expecting revert
            await expect(groupHandler.connect(operator).createGroup(group, condition)).to.revertedWith(
              RevertReasons.INVALID_CONDITION_PARAMETERS
            );
          });

          it("Condition 'Threshold' has zero maxCommits", async function () {
            condition.maxCommits = "0";

            // Attempt to create the group, expecting revert
            await expect(groupHandler.connect(operator).createGroup(group, condition)).to.revertedWith(
              RevertReasons.INVALID_CONDITION_PARAMETERS
            );
          });

          it("Condition 'Threshold' has zero threshold", async function () {
            condition.threshold = "0";

            // Attempt to create the group, expecting revert
            await expect(groupHandler.connect(operator).createGroup(group, condition)).to.revertedWith(
              RevertReasons.INVALID_CONDITION_PARAMETERS
            );
          });
        });

        context("Condition 'SpecificToken' has invalid fields", async function () {
          beforeEach(async function () {
            condition = mockCondition({
              method: EvaluationMethod.SpecificToken,
              tokenAddress: rando.address,
              threshold: "0",
              maxCommits: "5",
            });
          });

          it("Condition 'SpecificToken' has zero token contract address", async function () {
            condition.tokenAddress = ethers.constants.AddressZero;

            // Attempt to create the group, expecting revert
            await expect(groupHandler.connect(operator).createGroup(group, condition)).to.revertedWith(
              RevertReasons.INVALID_CONDITION_PARAMETERS
            );
          });

          it("Condition 'SpecificToken' has non zero threshold", async function () {
            condition.threshold = "10";

            // Attempt to create the group, expecting revert
            await expect(groupHandler.connect(operator).createGroup(group, condition)).to.revertedWith(
              RevertReasons.INVALID_CONDITION_PARAMETERS
            );
          });

          it("Condition 'SpecificToken' has zero maxCommits", async function () {
            condition.maxCommits = "0";

            // Attempt to create the group, expecting revert
            await expect(groupHandler.connect(operator).createGroup(group, condition)).to.revertedWith(
              RevertReasons.INVALID_CONDITION_PARAMETERS
            );
          });
        });
      });
    });

    context("👉 addOffersToGroup()", async function () {
      beforeEach(async function () {
        // Create a group
        await groupHandler.connect(operator).createGroup(group, condition);

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
        it("The groups region of protocol is paused", async function () {
          // Pause the groups region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Groups]);

          // Attempt to add offers to a group, expecting revert
          await expect(groupHandler.connect(operator).addOffersToGroup(group.id, offerIdsToAdd)).to.revertedWith(
            RevertReasons.REGION_PAUSED
          );
        });

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
          seller = mockSeller(rando.address, rando.address, rando.address, rando.address);

          await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);
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
          await groupHandler.connect(operator).createGroup(group, condition);

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
        await groupHandler.connect(operator).createGroup(group, condition);

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

      it("should delete even when offerIds length is 1", async function () {
        // Put 4 back in the group
        group.offerIds.push("4");

        // Remove offer from a group,
        await groupHandler.connect(operator).removeOffersFromGroup(group.id, ["1"]);

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
        it("The groups region of protocol is paused", async function () {
          // Pause the groups region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Groups]);

          // Attempt to remove offers to a group, expecting revert
          await expect(
            groupHandler.connect(operator).removeOffersFromGroup(group.id, offerIdsToRemove)
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

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
          await groupHandler.connect(operator).createGroup(group, condition);

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
        condition = mockCondition({
          tokenAddress: accounts[1].address,
          tokenId: "88775544",
          threshold: "0",
          tokenType: TokenType.MultiToken,
          method: EvaluationMethod.SpecificToken,
        });
        expect(condition.isValid()).to.be.true;

        // Create a group
        await groupHandler.connect(operator).createGroup(group, condition);

        // id of the current group and increment groupId
        groupId++;

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

        assert.equal(event.groupId.toString(), group.id, "Group Id is incorrect");
        assert.equal(event.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(event.executedBy.toString(), operator.address, "Executed by is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
      });

      it("should update state", async function () {
        // Set a new condition
        await groupHandler.connect(operator).setGroupCondition(group.id, condition);

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
          await expect(groupHandler.connect(operator).setGroupCondition(group.id, condition)).to.revertedWith(
            RevertReasons.REGION_PAUSED
          );
        });

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
          condition.method = EvaluationMethod.None;

          // Attempt to update the group, expecting revert
          await expect(groupHandler.connect(operator).setGroupCondition(group.id, condition)).to.revertedWith(
            RevertReasons.INVALID_CONDITION_PARAMETERS
          );
        });

        it("Condition 'Threshold' has zero token contract address", async function () {
          condition.method = EvaluationMethod.Threshold;
          condition.tokenAddress = ethers.constants.AddressZero;

          // Attempt to update the group, expecting revert
          await expect(groupHandler.connect(operator).setGroupCondition(group.id, condition)).to.revertedWith(
            RevertReasons.INVALID_CONDITION_PARAMETERS
          );
        });

        it("Condition 'Threshold' has zero max commits", async function () {
          condition.method = EvaluationMethod.Threshold;
          condition.maxCommits = "0";

          // Attempt to update the group, expecting revert
          await expect(groupHandler.connect(operator).setGroupCondition(group.id, condition)).to.revertedWith(
            RevertReasons.INVALID_CONDITION_PARAMETERS
          );
        });

        it("Condition 'SpecificToken' has zero token contract address", async function () {
          condition.method = EvaluationMethod.SpecificToken;
          condition.tokenAddress = ethers.constants.AddressZero;

          // Attempt to update the group, expecting revert
          await expect(groupHandler.connect(operator).setGroupCondition(group.id, condition)).to.revertedWith(
            RevertReasons.INVALID_CONDITION_PARAMETERS
          );
        });

        it("Condition 'SpecificToken' has zero max commits", async function () {
          condition.method = EvaluationMethod.SpecificToken;
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
        await groupHandler.connect(operator).createGroup(group, condition);
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
        await groupHandler.connect(operator).createGroup(group, condition);

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
        await groupHandler.connect(operator).createGroup(group, condition);

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
