const { ethers } = require("hardhat");
const { expect, assert } = require("chai");

const DisputeResolver = require("../../scripts/domain/DisputeResolver");
const { DisputeResolverFee, DisputeResolverFeeList } = require("../../scripts/domain/DisputeResolverFee");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const DisputeResolverUpdateFields = require("../../scripts/domain/DisputeResolverUpdateFields");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { getEvent, setupTestEnvironment, getSnapshot, revertToSnapshot } = require("../util/utils.js");
const { oneWeek } = require("../util/constants");
const { mockSeller, mockDisputeResolver, mockVoucherInitValues, mockAuthToken, accountId } = require("../util/mock");

/**
 *  Test the Boson Dispute Resolver Handler
 */
describe("DisputeResolverHandler", function () {
  // Common vars
  let pauser, rando, assistant, admin, clerk, treasury, other1, other2, other3, other4, other5;
  let accountHandler, configHandler, pauseHandler;
  let seller, seller2;
  let emptyAuthToken;
  let disputeResolver,
    disputeResolverStruct,
    disputeResolver2,
    disputeResolver2Struct,
    expectedDisputeResolver,
    expectedDisputeResolverStruct,
    disputeResolverPendingUpdate,
    disputeResolverPendingUpdateStruct;
  let disputeResolverFees,
    disputeResolverFeeList,
    disputeResolverFeeListStruct,
    disputeResolverFeeListStruct2,
    disputeResolverFees2,
    feeTokenAddressesToRemove;
  let sellerAllowList, returnedSellerAllowList, idsToCheck, expectedStatus, allowedSellersToAdd, allowedSellersToRemove;
  let invalidAccountId, key, value, exists;
  let voucherInitValues;
  let snapshotId;

  async function isValidDisputeResolverEvent(
    tx,
    eventName,
    disputeResolverId,
    disputeResolverStruct,
    disputeResolverFeeList,
    disputeResolverFeeListArrayPosition,
    sellerAllowList,
    executedBy
  ) {
    let valid = true;

    const txReceipt = await tx.wait();
    const event = getEvent(txReceipt, accountHandler, eventName);

    try {
      if (eventName == "DisputeResolverCreated") {
        assert.equal(
          event.disputeResolver.toString(),
          disputeResolverStruct.toString(),
          "Dispute Resolver is incorrect"
        );
        expect(DisputeResolver.fromStruct(event.disputeResolver).isValid()).is.true;
        assert.deepEqual(
          event.sellerAllowList.map((v) => v.toString()),
          sellerAllowList,
          "sellerAllowList is incorrect"
        );
      }

      assert.equal(event.disputeResolverId.toString(), disputeResolverId, "Dispute Resolver Id is incorrect");
      assert.equal(event.executedBy, executedBy, "executedBy is incorrect");

      const disputeResolverFeeListStruct = event[disputeResolverFeeListArrayPosition]; //DisputeResolverFees[] is in element 2 of the event array
      const disputeResolverFeeListObject = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct);
      expect(disputeResolverFeeListObject.isValid()).is.true;
      assert.equal(
        disputeResolverFeeListObject.toString(),
        disputeResolverFeeList.toString(),
        "Dispute Resolver Fee List is incorrect"
      );
    } catch (e) {
      console.log("Error in isValidDisputeResolverEvent ", e);
      valid = false;
    }

    return valid;
  }

  before(async function () {
    accountId.next(true);

    // Specify contracts needed for this test
    const contracts = {
      accountHandler: "IBosonAccountHandler",
      configHandler: "IBosonConfigHandler",
      pauseHandler: "IBosonPauseHandler",
    };

    ({
      signers: [pauser, admin, treasury, rando, other1, other2, other3, other4, other5],
      contractInstances: { accountHandler, configHandler, pauseHandler },
    } = await setupTestEnvironment(contracts));

    // make all account the same
    assistant = clerk = admin;

    // Get snapshot id
    snapshotId = await getSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();
  });

  // All supported Dispute Resolver methods
  context("📋 Dispute Resolver Methods", async function () {
    beforeEach(async function () {
      // The first dispute resolver id
      invalidAccountId = "666";

      // AuthToken
      emptyAuthToken = mockAuthToken();
      expect(emptyAuthToken.isValid()).is.true;

      // Create two additional sellers and create seller allow list
      seller = mockSeller(assistant.address, admin.address, clerk.address, treasury.address);
      seller2 = mockSeller(other1.address, other1.address, other1.address, other1.address);
      let seller3 = mockSeller(other2.address, other2.address, other2.address, other2.address);

      // VoucherInitValues
      voucherInitValues = mockVoucherInitValues();
      expect(voucherInitValues.isValid()).is.true;

      await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);
      await accountHandler.connect(other1).createSeller(seller2, emptyAuthToken, voucherInitValues);
      await accountHandler.connect(other2).createSeller(seller3, emptyAuthToken, voucherInitValues);

      // Make a sellerAllowList
      sellerAllowList = ["3", "1"];

      // Create a valid dispute resolver, then set fields in tests directly
      disputeResolver = mockDisputeResolver(assistant.address, admin.address, clerk.address, treasury.address);
      expect(disputeResolver.isValid()).is.true;

      // How that dispute resolver looks as a returned struct
      disputeResolverStruct = disputeResolver.toStruct();

      disputeResolverPendingUpdate = disputeResolver.clone();
      disputeResolverPendingUpdate.id = "0";
      disputeResolverPendingUpdate.admin = ethers.constants.AddressZero;
      disputeResolverPendingUpdate.clerk = ethers.constants.AddressZero;
      disputeResolverPendingUpdate.treasury = ethers.constants.AddressZero;
      disputeResolverPendingUpdate.assistant = ethers.constants.AddressZero;
      disputeResolverPendingUpdate.escalationResponsePeriod = "0";
      disputeResolverPendingUpdate.metadataUri = "";
      disputeResolverPendingUpdate.active = false;

      disputeResolverPendingUpdateStruct = disputeResolverPendingUpdate.toStruct();

      //Create DisputeResolverFee array
      disputeResolverFees = [
        new DisputeResolverFee(other1.address, "MockToken1", "100"),
        new DisputeResolverFee(other2.address, "MockToken2", "0"),
        new DisputeResolverFee(other3.address, "MockToken3", "50"),
      ];

      disputeResolverFeeList = new DisputeResolverFeeList(disputeResolverFees);
    });

    afterEach(async function () {
      // Reset
      accountId.next(true);
    });

    context("👉 createDisputeResolver()", async function () {
      beforeEach(async function () {
        expectedDisputeResolver = disputeResolver.clone();
        expectedDisputeResolver.active = true;
        expectedDisputeResolverStruct = expectedDisputeResolver.toStruct();
      });

      it("should emit a DisputeResolverCreated event if Dispute Resolver Fees are supplied", async function () {
        const tx = await accountHandler
          .connect(admin)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
        const valid = await isValidDisputeResolverEvent(
          tx,
          "DisputeResolverCreated",
          expectedDisputeResolver.id,
          expectedDisputeResolverStruct,
          disputeResolverFeeList,
          2,
          sellerAllowList,
          admin.address
        );
        expect(valid).is.true;
      });

      it("should emit a DisputeResolverCreated event if NO Dispute Resolver Fees are supplied", async function () {
        disputeResolverFees = [];
        disputeResolverFeeList = new DisputeResolverFeeList(disputeResolverFees);
        const tx = await accountHandler
          .connect(admin)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
        const valid = await isValidDisputeResolverEvent(
          tx,
          "DisputeResolverCreated",
          expectedDisputeResolver.id,
          expectedDisputeResolverStruct,
          disputeResolverFeeList,
          2,
          sellerAllowList,
          admin.address
        );
        expect(valid).is.true;
      });

      it("should update state if Dispute Resolver Fees and Seller Allow List are supplied", async function () {
        // Create a dispute resolver
        await accountHandler
          .connect(admin)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

        // Get the dispute resolver data as structs
        [, disputeResolverStruct, disputeResolverFeeListStruct, returnedSellerAllowList] = await accountHandler
          .connect(rando)
          .getDisputeResolver(disputeResolver.id);

        // Parse into entity
        let returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);
        let returnedDisputeResolverFeeList = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct);
        expect(returnedDisputeResolver.isValid()).is.true;
        expect(returnedDisputeResolverFeeList.isValid()).is.true;

        // Returned values should match the expectedDisputeResolver
        for ([key, value] of Object.entries(expectedDisputeResolver)) {
          expect(JSON.stringify(returnedDisputeResolver[key]) === JSON.stringify(value)).is.true;
        }

        assert.equal(
          returnedDisputeResolverFeeList.toString(),
          disputeResolverFeeList.toString(),
          "Dispute Resolver Fee List is incorrect"
        );

        expect(returnedSellerAllowList.toString()).to.eql(sellerAllowList.toString(), "Allowed list wrong");

        // check that mappings of allowed selleres were updated
        idsToCheck = ["1", "2", "3", "4"];
        expectedStatus = [true, false, true, false]; // 1 and 3 are allowed
        const areSellersAllowed = await accountHandler.connect(rando).areSellersAllowed(disputeResolver.id, idsToCheck);

        expect(areSellersAllowed).to.eql(expectedStatus, "Wrong statuses reported");
      });

      it("should update state if NO Dispute Resolver Fees are supplied and seller allow list is empty", async function () {
        disputeResolverFees = [];
        disputeResolverFeeList = new DisputeResolverFeeList(disputeResolverFees);
        sellerAllowList = [];

        // Create a dispute resolver
        await accountHandler
          .connect(admin)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

        // Get the dispute resolver data as structs
        [, disputeResolverStruct, disputeResolverFeeListStruct, returnedSellerAllowList] = await accountHandler
          .connect(rando)
          .getDisputeResolver(disputeResolver.id);

        // Parse into entity
        let returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);
        let returnedDisputeResolverFeeList = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct);
        expect(returnedDisputeResolver.isValid()).is.true;
        expect(returnedDisputeResolverFeeList.isValid()).is.true;

        // Returned values should match the expectedDisputeResolver
        for ([key, value] of Object.entries(expectedDisputeResolver)) {
          expect(JSON.stringify(returnedDisputeResolver[key]) === JSON.stringify(value)).is.true;
        }

        assert.equal(
          returnedDisputeResolverFeeList.toString(),
          disputeResolverFeeList.toString(),
          "Dispute Resolver Fee List is incorrect"
        );

        expect(returnedSellerAllowList).to.eql(sellerAllowList, "Allowed list wrong");

        // check that mappings of allowed selleres were updated
        idsToCheck = ["1", "2", "3", "4"];
        expectedStatus = [true, true, true, false]; // ids 1,2 and 3 are sellers so the should be allowed
        const areSellersAllowed = await accountHandler.connect(rando).areSellersAllowed(disputeResolver.id, idsToCheck);

        expect(areSellersAllowed).to.eql(expectedStatus, "Wrong statuses reported");
      });

      it("should allow same fee token to be specified for multiple dispute resolvers", async function () {
        // Create a dispute resolver 1
        await accountHandler
          .connect(admin)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

        // Get the dispute resolver data as structs
        [, disputeResolverStruct, disputeResolverFeeListStruct] = await accountHandler
          .connect(rando)
          .getDisputeResolver(expectedDisputeResolver.id);

        // Parse into entity
        let returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);
        let returnedDisputeResolverFeeList = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct);
        expect(returnedDisputeResolver.isValid()).is.true;
        expect(returnedDisputeResolverFeeList.isValid()).is.true;

        // Returned values should match the expectedDisputeResolver
        for ([key, value] of Object.entries(expectedDisputeResolver)) {
          expect(JSON.stringify(returnedDisputeResolver[key]) === JSON.stringify(value)).is.true;
        }

        assert.equal(
          returnedDisputeResolverFeeList.toString(),
          disputeResolverFeeList.toString(),
          "Dispute Resolver Fee List is incorrect"
        );

        // Create a dispute resolver 2
        disputeResolver2 = mockDisputeResolver(other1.address, other1.address, other1.address, other1.address, true);
        expect(disputeResolver2.isValid()).is.true;

        await accountHandler
          .connect(other1)
          .createDisputeResolver(disputeResolver2, disputeResolverFees, sellerAllowList);

        let disputeResolverStruct2;

        // Get the dispute resolver data as structs
        [, disputeResolverStruct2, disputeResolverFeeListStruct2] = await accountHandler
          .connect(rando)
          .getDisputeResolver(disputeResolver2.id);

        // Parse into entity
        let returnedDisputeResolver2 = DisputeResolver.fromStruct(disputeResolverStruct2);
        let returnedDisputeResolverFeeList2 = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct2);
        expect(returnedDisputeResolver2.isValid()).is.true;
        expect(returnedDisputeResolverFeeList2.isValid()).is.true;

        // Returned values should match the expectedDisputeResolver
        for ([key, value] of Object.entries(disputeResolver2)) {
          expect(JSON.stringify(returnedDisputeResolver2[key]) === JSON.stringify(value)).is.true;
        }

        assert.equal(
          returnedDisputeResolverFeeList2.toString(),
          disputeResolverFeeList.toString(),
          "Dispute Resolver Fee List is incorrect"
        );
      });

      it("should ignore any provided id and assign the next available", async function () {
        const id = disputeResolver.id;
        disputeResolver.id = "444";

        // Create a dispute resolver, testing for the event
        const tx = await accountHandler
          .connect(admin)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
        const valid = await isValidDisputeResolverEvent(
          tx,
          "DisputeResolverCreated",
          expectedDisputeResolver.id,
          expectedDisputeResolverStruct,
          disputeResolverFeeList,
          2,
          sellerAllowList,
          admin.address
        );
        expect(valid).is.true;

        // wrong dispute resolver id should not exist
        [exists] = await accountHandler.connect(rando).getDisputeResolver(disputeResolver.id);
        expect(exists).to.be.false;

        // next dispute resolver id should exist
        [exists] = await accountHandler.connect(rando).getDisputeResolver(id);
        expect(exists).to.be.true;
      });

      it("should be possible to use non-unique treasury address", async function () {
        const tx = await accountHandler
          .connect(admin)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
        let valid = await isValidDisputeResolverEvent(
          tx,
          "DisputeResolverCreated",
          expectedDisputeResolver.id,
          expectedDisputeResolverStruct,
          disputeResolverFeeList,
          2,
          sellerAllowList,
          admin.address
        );
        expect(valid).is.true;

        // Create a valid dispute resolver, then set fields in tests directly
        disputeResolver2 = mockDisputeResolver(other1.address, other1.address, other1.address, treasury.address, true);
        expect(disputeResolver2.isValid()).is.true;
        expectedDisputeResolverStruct = disputeResolver2.toStruct();

        const tx2 = await accountHandler
          .connect(other1)
          .createDisputeResolver(disputeResolver2, disputeResolverFees, sellerAllowList);
        valid = await isValidDisputeResolverEvent(
          tx2,
          "DisputeResolverCreated",
          disputeResolver2.id,
          expectedDisputeResolverStruct,
          disputeResolverFeeList,
          2,
          sellerAllowList,
          other1.address
        );
        expect(valid).is.true;
      });

      context("💔 Revert Reasons", async function () {
        it("The dispute resolvers region of protocol is paused", async function () {
          // Pause the dispute resolvers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.DisputeResolvers]);

          // Attempt to create a dispute resolver, expecting revert
          await expect(
            accountHandler.connect(admin).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList)
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("Any address is the zero address", async function () {
          disputeResolver.assistant = ethers.constants.AddressZero;

          // Attempt to Create a DisputeResolver, expecting revert
          await expect(
            accountHandler.connect(admin).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList)
          ).to.revertedWith(RevertReasons.INVALID_ADDRESS);

          disputeResolver.assistant = assistant.address;
          disputeResolver.admin = ethers.constants.AddressZero;

          // Attempt to Create a DisputeResolver, expecting revert
          await expect(
            accountHandler.connect(admin).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList)
          ).to.revertedWith(RevertReasons.INVALID_ADDRESS);

          disputeResolver.admin = admin.address;
          disputeResolver.clerk = ethers.constants.AddressZero;

          // Attempt to Create a DisputeResolver, expecting revert
          await expect(
            accountHandler.connect(admin).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList)
          ).to.revertedWith(RevertReasons.INVALID_ADDRESS);

          disputeResolver.clerk = clerk.address;
          disputeResolver.treasury = ethers.constants.AddressZero;

          // Attempt to Create a DisputeResolver, expecting revert
          await expect(
            accountHandler.connect(admin).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList)
          ).to.revertedWith(RevertReasons.INVALID_ADDRESS);
        });

        it("Address is not unique to this dispute resolver Id", async function () {
          disputeResolver2 = mockDisputeResolver(
            assistant.address,
            assistant.address,
            assistant.address,
            assistant.address
          );
          expect(disputeResolver2.isValid()).is.true;
          disputeResolver2Struct = disputeResolver2.toStruct();

          //Create dispute resolver 1
          accountHandler.connect(admin).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

          // Attempt to create another dispute resolver with same addresses
          await expect(
            accountHandler.connect(admin).createDisputeResolver(disputeResolver2, disputeResolverFees, sellerAllowList)
          ).to.revertedWith(RevertReasons.DISPUTE_RESOLVER_ADDRESS_MUST_BE_UNIQUE);
        });

        it("DisputeResolverFees above max", async function () {
          await configHandler.setMaxFeesPerDisputeResolver(2);

          // Attempt to Create a DisputeResolver, expecting revert
          await expect(
            accountHandler.connect(admin).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList)
          ).to.revertedWith(RevertReasons.INVALID_AMOUNT_DISPUTE_RESOLVER_FEES);
        });

        it("EscalationResponsePeriod is invalid", async function () {
          await configHandler.setMaxEscalationResponsePeriod(oneWeek);

          // Attempt to Create a DisputeResolver, expecting revert
          await expect(
            accountHandler.connect(admin).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList)
          ).to.revertedWith(RevertReasons.INVALID_ESCALATION_PERIOD);

          disputeResolver.escalationResponsePeriod = 0;

          // Attempt to Create a DisputeResolver, expecting revert
          await expect(
            accountHandler.connect(admin).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList)
          ).to.revertedWith(RevertReasons.INVALID_ESCALATION_PERIOD);
        });

        it("Duplicate dispute resolver fees", async function () {
          //Create new DisputeResolverFee array
          disputeResolverFees2 = [
            new DisputeResolverFee(other1.address, "MockToken1", "0"),
            new DisputeResolverFee(other3.address, "MockToken3", "10"),
            new DisputeResolverFee(other2.address, "MockToken2", "30"),
            new DisputeResolverFee(other2.address, "MockToken2", "0"),
          ];

          // Create a dispute resolver
          await expect(
            accountHandler.connect(admin).createDisputeResolver(disputeResolver, disputeResolverFees2, sellerAllowList)
          ).to.revertedWith(RevertReasons.DUPLICATE_DISPUTE_RESOLVER_FEES);
        });

        it("Number of seller ids above max", async function () {
          sellerAllowList = new Array(101).fill("1");

          // Attempt to Create a DisputeResolver, expecting revert
          await expect(
            accountHandler.connect(admin).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList)
          ).to.revertedWith(RevertReasons.INVALID_AMOUNT_ALLOWED_SELLERS);
        });

        it("Duplicate dispute resolver fees", async function () {
          //Create new sellerAllowList array
          sellerAllowList = ["3", "2", "8"];

          // Create a dispute resolver
          await expect(
            accountHandler.connect(admin).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList)
          ).to.revertedWith(RevertReasons.NO_SUCH_SELLER);
        });

        it("Some seller id is duplicated", async function () {
          //Create new sellerAllowList array
          sellerAllowList = ["1", "2", "1"];

          // Create a dispute resolver
          await expect(
            accountHandler.connect(admin).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList)
          ).to.revertedWith(RevertReasons.SELLER_ALREADY_APPROVED);
        });

        it("Caller is not the supplied admin", async function () {
          disputeResolver.assistant = rando.address;
          disputeResolver.clerk = rando.address;

          // Create a dispute resolver
          await expect(
            accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList)
          ).to.revertedWith(RevertReasons.NOT_ADMIN_ASSISTANT_AND_CLERK);
        });

        it("Caller is not the supplied assistant", async function () {
          disputeResolver.admin = rando.address;
          disputeResolver.clerk = rando.address;

          // Create a dispute resolver
          await expect(
            accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList)
          ).to.revertedWith(RevertReasons.NOT_ADMIN_ASSISTANT_AND_CLERK);
        });

        it("Caller is not the supplied clerk", async function () {
          disputeResolver.admin = rando.address;
          disputeResolver.assistant = rando.address;

          // Create a dispute resolver
          await expect(
            accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList)
          ).to.revertedWith(RevertReasons.NOT_ADMIN_ASSISTANT_AND_CLERK);
        });

        it("Active is false", async function () {
          disputeResolver.active = false;

          // Attempt to Create a DR, expecting revert
          await expect(
            accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList)
          ).to.revertedWith(RevertReasons.MUST_BE_ACTIVE);
        });
      });
    });

    context("👉 getDisputeResolver()", async function () {
      beforeEach(async function () {
        //Create DisputeResolverFee array
        disputeResolverFees = [
          new DisputeResolverFee(other1.address, "MockToken1", "50"),
          new DisputeResolverFee(other2.address, "MockToken2", "0"),
          new DisputeResolverFee(other3.address, "MockToken3", "123"),
        ];

        sellerAllowList = ["1"];

        // Create a dispute resolver
        await accountHandler
          .connect(admin)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
      });

      it("should return true for exists if dispute resolver is found", async function () {
        // Get the exists flag
        [exists] = await accountHandler.connect(rando).getDisputeResolver(disputeResolver.id);

        // Validate
        expect(exists).to.be.true;
      });

      it("should return false for exists if dispute resolver is not found", async function () {
        // Get the exists flag
        [exists] = await accountHandler.connect(rando).getDisputeResolver(invalidAccountId);

        // Validate
        expect(exists).to.be.false;
      });

      it("should return the details of the dispute resolver as structs if found", async function () {
        // Get the dispute resolver as a struct
        [, disputeResolverStruct, disputeResolverFeeListStruct, returnedSellerAllowList] = await accountHandler
          .connect(rando)
          .getDisputeResolver(disputeResolver.id);

        // Parse into entity
        disputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);
        disputeResolverFeeList = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct);

        // Validate
        expect(disputeResolver.isValid()).to.be.true;
        expect(disputeResolverFeeList.isValid()).to.be.true;

        let valid =
          Array.isArray(returnedSellerAllowList) &&
          returnedSellerAllowList.reduce(
            (previousAllowedSeller, currentAllowedSeller) =>
              previousAllowedSeller && typeof ethers.BigNumber.from(currentAllowedSeller) === "object",
            true
          );
        expect(valid).to.be.true;
      });
    });

    context("👉 areSellersAllowed()", async function () {
      beforeEach(async function () {
        //Create DisputeResolverFee array
        disputeResolverFees = [new DisputeResolverFee(other1.address, "MockToken1", "0")];
      });

      it("Dispute resolver allows all sellers", async function () {
        // Make a sellerAllowList
        sellerAllowList = [];

        // Create a dispute resolver
        await accountHandler
          .connect(admin)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

        idsToCheck = ["1", "2", "3", "4"];
        expectedStatus = [true, true, true, false]; // 1,2 and 3 are sellers, 4 is not a seller

        // Get the statuese flag
        const areSellersAllowed = await accountHandler.connect(rando).areSellersAllowed(disputeResolver.id, idsToCheck);

        expect(areSellersAllowed).to.eql(expectedStatus, "Wrong statuses reported");
      });

      it("Dispute resolver has an allow list", async function () {
        // Make a sellerAllowList
        sellerAllowList = ["3", "1"];

        // Create a dispute resolver
        await accountHandler
          .connect(admin)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

        idsToCheck = ["1", "2", "3", "4"];
        expectedStatus = [true, false, true, false]; // 1 and 3 are allowed, 2 is not, 4 is not a seller

        // Get the statuese flag
        const areSellersAllowed = await accountHandler.connect(rando).areSellersAllowed(disputeResolver.id, idsToCheck);

        expect(areSellersAllowed).to.eql(expectedStatus, "Wrong statuses reported");
      });

      it("Dispute resolved does not exist", async function () {
        // not DR id
        const id = "16";

        idsToCheck = ["1", "2", "3", "4"];
        expectedStatus = [false, false, false, false]; // since DR does not exist everything is false

        // Get the statuese flag
        const areSellersAllowed = await accountHandler.connect(rando).areSellersAllowed(id, idsToCheck);

        expect(areSellersAllowed).to.eql(expectedStatus, "Wrong statuses reported");
      });
    });

    context("👉 updateDisputeResolver()", async function () {
      beforeEach(async function () {
        // Create a dispute resolver from objects in Dispute Resolver Methods beforeEach
        await accountHandler
          .connect(admin)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

        expectedDisputeResolver = disputeResolver.clone();
        expectedDisputeResolverStruct = expectedDisputeResolver.toStruct();
      });

      it("should emit a DisputeResolverUpdatePending event with correct values if values change", async function () {
        disputeResolver.escalationResponsePeriod = Number(
          Number(disputeResolver.escalationResponsePeriod) - oneWeek
        ).toString();
        disputeResolver.assistant = disputeResolverPendingUpdate.assistant = other1.address;
        disputeResolver.admin = disputeResolverPendingUpdate.admin = other2.address;
        disputeResolver.clerk = disputeResolverPendingUpdate.clerk = other3.address;
        disputeResolver.treasury = other4.address;
        disputeResolver.metadataUri = "https://ipfs.io/ipfs/updatedUri";
        disputeResolver.active = true;
        expect(disputeResolver.isValid()).is.true;
        disputeResolverPendingUpdateStruct = disputeResolverPendingUpdate.toStruct();

        expectedDisputeResolver = disputeResolver.clone();
        expectedDisputeResolver.active = true;

        // Update a dispute resolver
        const tx = await accountHandler.connect(admin).updateDisputeResolver(disputeResolver);

        // Testing for the DisputeResolverUpdatePending event
        await expect(tx)
          .to.emit(accountHandler, "DisputeResolverUpdatePending")
          .withArgs(disputeResolver.id, disputeResolverPendingUpdateStruct, admin.address);

        // Assistant admin and clerk needs owner approval and won't be updated until then
        expectedDisputeResolver.assistant = assistant.address;
        expectedDisputeResolver.admin = admin.address;
        expectedDisputeResolver.clerk = clerk.address;
        expectedDisputeResolverStruct = expectedDisputeResolver.toStruct();

        // Testing for the DisputeResolverUpdateApplied event
        await expect(tx)
          .to.emit(accountHandler, "DisputeResolverUpdateApplied")
          .withArgs(
            disputeResolver.id,
            expectedDisputeResolverStruct,
            disputeResolverPendingUpdateStruct,
            admin.address
          );
      });

      it("should update state of all fields except Id and active flag and fees", async function () {
        disputeResolver.escalationResponsePeriod = Number(
          Number(disputeResolver.escalationResponsePeriod) - oneWeek
        ).toString();
        disputeResolver.assistant = other1.address;
        disputeResolver.admin = other2.address;
        disputeResolver.clerk = other3.address;
        disputeResolver.treasury = other4.address;
        disputeResolver.metadataUri = "https://ipfs.io/ipfs/updatedUri";
        disputeResolver.active = true;
        expect(disputeResolver.isValid()).is.true;

        expectedDisputeResolver = disputeResolver.clone();

        // Update dispute resolver
        await accountHandler.connect(admin).updateDisputeResolver(disputeResolver);

        // Approve assistant update
        await accountHandler
          .connect(other1)
          .optInToDisputeResolverUpdate(disputeResolver.id, [DisputeResolverUpdateFields.Assistant]);

        // Approve admin update
        await accountHandler
          .connect(other2)
          .optInToDisputeResolverUpdate(disputeResolver.id, [DisputeResolverUpdateFields.Admin]);

        // Approve clerk update
        await accountHandler
          .connect(other3)
          .optInToDisputeResolverUpdate(disputeResolver.id, [DisputeResolverUpdateFields.Clerk]);

        // Get the disupte resolver as structs
        [, disputeResolverStruct, disputeResolverFeeListStruct] = await accountHandler
          .connect(rando)
          .getDisputeResolver(disputeResolver.id);

        // Parse into entity
        let returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);
        let returnedDisputeResolverFeeList = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct);
        expect(returnedDisputeResolver.isValid()).is.true;
        expect(returnedDisputeResolverFeeList.isValid()).is.true;

        // Returned values should match the input in updateDisputeResolver
        for ([key, value] of Object.entries(expectedDisputeResolver)) {
          expect(JSON.stringify(returnedDisputeResolver[key]) === JSON.stringify(value)).is.true;
        }
        assert.equal(
          returnedDisputeResolverFeeList.toString(),
          disputeResolverFeeList.toString(),
          "Dispute Resolver Fee List is incorrect"
        );

        //Check that old addresses are no longer mapped. We don't map the treasury address.
        [exists] = await accountHandler.connect(rando).getDisputeResolverByAddress(assistant.address);
        expect(exists).to.be.false;

        [exists] = await accountHandler.connect(rando).getDisputeResolverByAddress(admin.address);
        expect(exists).to.be.false;

        [exists] = await accountHandler.connect(rando).getDisputeResolverByAddress(clerk.address);
        expect(exists).to.be.false;

        //Check that new addresses are mapped. We don't map the treasury address.
        [exists] = await accountHandler.connect(rando).getDisputeResolverByAddress(disputeResolver.assistant);
        expect(exists).to.be.true;

        [exists] = await accountHandler.connect(rando).getDisputeResolverByAddress(disputeResolver.admin);
        expect(exists).to.be.true;

        [exists] = await accountHandler.connect(rando).getDisputeResolverByAddress(disputeResolver.clerk);
        expect(exists).to.be.true;
      });

      it("should ignore active flag passed in", async function () {
        disputeResolver.active = true;
        disputeResolver.assistant = other2.address;
        expect(disputeResolver.isValid()).is.true;

        // Update disupte resolver
        await accountHandler.connect(admin).updateDisputeResolver(disputeResolver);

        // Get the disupte resolver as a struct
        [, disputeResolverStruct] = await accountHandler.connect(rando).getDisputeResolver(disputeResolver.id);

        // Parse into entity
        let returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);

        // Returned values should match expected values
        for ([key, value] of Object.entries(expectedDisputeResolver)) {
          expect(JSON.stringify(returnedDisputeResolver[key]) === JSON.stringify(value)).is.true;
        }

        expectedDisputeResolver.active = true;
        expect(expectedDisputeResolver.isValid()).is.true;

        disputeResolver.active = false;

        // Update disupte resolver
        await accountHandler.connect(admin).updateDisputeResolver(disputeResolver);

        // Get the disupte resolver as a struct
        [, disputeResolverStruct] = await accountHandler.connect(rando).getDisputeResolver(disputeResolver.id);

        // Parse into entity
        returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);

        // Returned values should match expected values
        for ([key, value] of Object.entries(expectedDisputeResolver)) {
          expect(JSON.stringify(returnedDisputeResolver[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should update only one address", async function () {
        disputeResolver.assistant = other2.address;
        expect(disputeResolver.isValid()).is.true;

        expectedDisputeResolver = disputeResolver.clone();
        disputeResolverStruct = disputeResolver.toStruct();

        // Update disupte resolver
        await accountHandler.connect(admin).updateDisputeResolver(disputeResolver);

        // Approve the update
        await accountHandler
          .connect(other2)
          .optInToDisputeResolverUpdate(disputeResolver.id, [DisputeResolverUpdateFields.Assistant]);

        // Get the disupte resolver as a struct
        [, disputeResolverStruct] = await accountHandler.connect(rando).getDisputeResolver(disputeResolver.id);

        // Parse into entity
        let returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);

        // Returned values should match expected values
        for ([key, value] of Object.entries(expectedDisputeResolver)) {
          expect(JSON.stringify(returnedDisputeResolver[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should update the correct dispute resolver", async function () {
        // Configure another dispute resolver
        disputeResolver2 = mockDisputeResolver(other1.address, other1.address, other1.address, other1.address);
        expect(disputeResolver2.isValid()).is.true;

        const expectedDisputeResolver2 = disputeResolver2.clone();
        const expectedDisputeResolverStruct2 = expectedDisputeResolver2.toStruct();

        //Create DisputeResolverFee array
        disputeResolverFees2 = [new DisputeResolverFee(rando.address, "RandomToken", "0")];

        const disputeResolverFeeList2 = new DisputeResolverFeeList(disputeResolverFees2);

        //Create disputeResolver2 testing, for the event
        const tx = await accountHandler
          .connect(other1)
          .createDisputeResolver(disputeResolver2, disputeResolverFees2, sellerAllowList);
        const valid = await isValidDisputeResolverEvent(
          tx,
          "DisputeResolverCreated",
          disputeResolver2.id,
          expectedDisputeResolverStruct2,
          disputeResolverFeeList2,
          2,
          sellerAllowList,
          other1.address
        );
        expect(valid).is.true;

        //Update first dispute resolver values
        disputeResolver.escalationResponsePeriod = Number(
          Number(disputeResolver.escalationResponsePeriod) - oneWeek
        ).toString();
        disputeResolver.assistant = rando.address;
        disputeResolver.admin = rando.address;
        disputeResolver.clerk = rando.address;
        disputeResolver.treasury = rando.address;
        disputeResolver.metadataUri = "https://ipfs.io/ipfs/updatedUri";
        expect(disputeResolver.isValid()).is.true;

        expectedDisputeResolver = disputeResolver.clone();
        expectedDisputeResolverStruct = expectedDisputeResolver.toStruct();

        // Update the first dispute resolver
        await accountHandler.connect(admin).updateDisputeResolver(disputeResolver);

        // Approve assistant, clerk and admin update
        await accountHandler
          .connect(rando)
          .optInToDisputeResolverUpdate(disputeResolver.id, [
            DisputeResolverUpdateFields.Assistant,
            DisputeResolverUpdateFields.Admin,
            DisputeResolverUpdateFields.Clerk,
          ]);

        [, disputeResolverStruct, disputeResolverFeeListStruct] = await accountHandler
          .connect(rando)
          .getDisputeResolver(expectedDisputeResolver.id);

        // Parse into entity
        let returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);
        let returnedDisputeResolverFeeList = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct);
        expect(returnedDisputeResolver.isValid()).is.true;
        expect(returnedDisputeResolverFeeList.isValid()).is.true;

        // Returned values should match expectedDisputeResolver
        for ([key, value] of Object.entries(expectedDisputeResolver)) {
          expect(JSON.stringify(returnedDisputeResolver[key]) === JSON.stringify(value)).is.true;
        }

        assert.equal(
          returnedDisputeResolverFeeList.toString(),
          disputeResolverFeeList.toString(),
          "Dispute Resolver Fee List is incorrect"
        );

        //Check dispute resolver 2 hasn't been changed
        [, disputeResolver2Struct, disputeResolverFeeListStruct2] = await accountHandler
          .connect(rando)
          .getDisputeResolver(disputeResolver2.id);

        // Parse into entity
        let returnedDisputeResolver2 = DisputeResolver.fromStruct(disputeResolver2Struct);
        let returnedDisputeResolverFeeList2 = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct2);
        expect(returnedDisputeResolver2.isValid()).is.true;
        expect(returnedDisputeResolverFeeList2.isValid()).is.true;

        //returnedDisputeResolver2 should still contain original values
        for ([key, value] of Object.entries(expectedDisputeResolver2)) {
          expect(JSON.stringify(returnedDisputeResolver2[key]) === JSON.stringify(value)).is.true;
        }

        assert.equal(
          returnedDisputeResolverFeeList2.toString(),
          disputeResolverFeeList2.toString(),
          "Dispute Resolver Fee List is incorrect"
        );
      });

      it("should be able to only update second time with new admin address", async function () {
        disputeResolver.admin = other2.address;
        expectedDisputeResolver = disputeResolver.clone();
        expectedDisputeResolverStruct = expectedDisputeResolver.toStruct();

        disputeResolverPendingUpdate.admin = other2.address;
        disputeResolverPendingUpdateStruct = disputeResolverPendingUpdate.toStruct();

        // Update a dispute resolver, testing for the event
        await expect(accountHandler.connect(admin).updateDisputeResolver(disputeResolver))
          .to.emit(accountHandler, "DisputeResolverUpdatePending")
          .withArgs(disputeResolver.id, disputeResolverPendingUpdateStruct, admin.address);

        disputeResolverPendingUpdate.admin = ethers.constants.AddressZero;
        disputeResolverPendingUpdateStruct = disputeResolverPendingUpdate.toStruct();

        // Approve admin update
        await expect(
          accountHandler
            .connect(other2)
            .optInToDisputeResolverUpdate(disputeResolver.id, [DisputeResolverUpdateFields.Admin])
        )
          .to.emit(accountHandler, "DisputeResolverUpdateApplied")
          .withArgs(
            disputeResolver.id,
            expectedDisputeResolverStruct,
            disputeResolverPendingUpdateStruct,
            other2.address
          );

        disputeResolver.admin = other3.address;
        expectedDisputeResolver = disputeResolver.clone();
        expectedDisputeResolverStruct = expectedDisputeResolver.toStruct();

        disputeResolverPendingUpdate.admin = other3.address;
        disputeResolverPendingUpdateStruct = disputeResolverPendingUpdate.toStruct();

        //Update a dispute resolver, testing for the event
        await expect(accountHandler.connect(other2).updateDisputeResolver(disputeResolver))
          .to.emit(accountHandler, "DisputeResolverUpdatePending")
          .withArgs(disputeResolver.id, disputeResolverPendingUpdateStruct, other2.address);

        disputeResolverPendingUpdate.admin = ethers.constants.AddressZero;
        disputeResolverPendingUpdateStruct = disputeResolverPendingUpdate.toStruct();

        // Approve admin update
        await expect(
          accountHandler
            .connect(other3)
            .optInToDisputeResolverUpdate(disputeResolver.id, [DisputeResolverUpdateFields.Admin])
        )
          .to.emit(accountHandler, "DisputeResolverUpdateApplied")
          .withArgs(
            disputeResolver.id,
            expectedDisputeResolverStruct,
            disputeResolverPendingUpdateStruct,
            other3.address
          );

        // Attempt to update the dispute resolver with original admin address, expecting revert
        await expect(accountHandler.connect(admin).updateDisputeResolver(disputeResolver)).to.revertedWith(
          RevertReasons.NOT_ADMIN
        );
      });

      it("should be possible to use non-unique treasury address", async function () {
        // Update dispute resolver fields
        disputeResolver.assistant = other1.address;
        disputeResolver.admin = other2.address;
        disputeResolver.clerk = other3.address;
        disputeResolver.active = true;
        expect(disputeResolver.isValid()).is.true;

        expectedDisputeResolverStruct = disputeResolver.toStruct();

        disputeResolverPendingUpdate.assistant = other1.address;
        disputeResolverPendingUpdate.admin = other2.address;
        disputeResolverPendingUpdate.clerk = other3.address;
        disputeResolverPendingUpdateStruct = disputeResolverPendingUpdate.toStruct();

        // Request to update a dispute resolver, testing for the DisputeResolerUpdatePending event
        await expect(accountHandler.connect(admin).updateDisputeResolver(disputeResolver))
          .to.emit(accountHandler, "DisputeResolverUpdatePending")
          .withArgs(disputeResolver.id, disputeResolverPendingUpdateStruct, admin.address);

        // Approve assistant update
        await accountHandler
          .connect(other1)
          .optInToDisputeResolverUpdate(disputeResolver.id, [DisputeResolverUpdateFields.Assistant]);

        // Approve admin update
        await accountHandler
          .connect(other2)
          .optInToDisputeResolverUpdate(disputeResolver.id, [DisputeResolverUpdateFields.Admin]);

        // Approve clerk update
        await accountHandler
          .connect(other3)
          .optInToDisputeResolverUpdate(disputeResolver.id, [DisputeResolverUpdateFields.Clerk]);

        // Configure another dispute resolver
        disputeResolver2 = mockDisputeResolver(rando.address, rando.address, rando.address, rando.address);
        expect(disputeResolver2.isValid()).is.true;

        // Create another dispute resolver
        await accountHandler
          .connect(rando)
          .createDisputeResolver(disputeResolver2, disputeResolverFees, sellerAllowList);

        disputeResolver2.treasury = treasury.address;
        disputeResolver2Struct = disputeResolver2.toStruct();

        disputeResolverPendingUpdate.admin = ethers.constants.AddressZero;
        disputeResolverPendingUpdate.assistant = ethers.constants.AddressZero;
        disputeResolverPendingUpdate.clerk = ethers.constants.AddressZero;
        disputeResolverPendingUpdateStruct = disputeResolverPendingUpdate.toStruct();

        // Update new dispute resolver with same treasury address, testing for the event
        await expect(accountHandler.connect(rando).updateDisputeResolver(disputeResolver2))
          .to.emit(accountHandler, "DisputeResolverUpdateApplied")
          .withArgs(disputeResolver2.id, disputeResolver2Struct, disputeResolverPendingUpdateStruct, rando.address);
      });

      it("should be possible to use the same address for assistant, admin, clerk, and treasury", async function () {
        // Update dispute resolver fields
        disputeResolver.assistant = other1.address;
        disputeResolver.admin = other1.address;
        disputeResolver.clerk = other1.address;
        disputeResolver.treasury = other1.address;
        expect(disputeResolver.isValid()).is.true;

        // Treasury is the only address that doesn't need owner opt-in
        expectedDisputeResolver = disputeResolver.clone();
        expectedDisputeResolver.assistant = assistant.address;
        expectedDisputeResolver.admin = admin.address;
        expectedDisputeResolver.clerk = clerk.address;
        expectedDisputeResolverStruct = expectedDisputeResolver.toStruct();

        disputeResolverPendingUpdate.assistant = other1.address;
        disputeResolverPendingUpdate.admin = other1.address;
        disputeResolverPendingUpdate.clerk = other1.address;
        disputeResolverPendingUpdateStruct = disputeResolverPendingUpdate.toStruct();

        // Update a dispute resolver
        const tx = await accountHandler.connect(admin).updateDisputeResolver(disputeResolver);

        // Testing for the DisputeResolverUpdateApplied event
        await expect(tx)
          .to.emit(accountHandler, "DisputeResolverUpdateApplied")
          .withArgs(
            disputeResolver.id,
            expectedDisputeResolverStruct,
            disputeResolverPendingUpdateStruct,
            admin.address
          );

        // Testing for the DisputeResolverUpdatePending event
        await expect(tx)
          .to.emit(accountHandler, "DisputeResolverUpdatePending")
          .withArgs(disputeResolver.id, disputeResolverPendingUpdateStruct, admin.address);

        expectedDisputeResolver = disputeResolver.clone();
        expectedDisputeResolverStruct = expectedDisputeResolver.toStruct();

        disputeResolverPendingUpdate.assistant = ethers.constants.AddressZero;
        disputeResolverPendingUpdate.admin = ethers.constants.AddressZero;
        disputeResolverPendingUpdate.clerk = ethers.constants.AddressZero;
        disputeResolverPendingUpdateStruct = disputeResolverPendingUpdate.toStruct();

        // Approve assistant update
        await expect(
          accountHandler
            .connect(other1)
            .optInToDisputeResolverUpdate(disputeResolver.id, [
              DisputeResolverUpdateFields.Assistant,
              DisputeResolverUpdateFields.Admin,
              DisputeResolverUpdateFields.Clerk,
            ])
        )
          .to.emit(accountHandler, "DisputeResolverUpdateApplied")
          .withArgs(
            disputeResolver.id,
            expectedDisputeResolverStruct,
            disputeResolverPendingUpdateStruct,
            other1.address
          );
      });

      context("💔 Revert Reasons", async function () {
        it("The dispute resolvers region of protocol is paused", async function () {
          // Pause the dispute resolvers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.DisputeResolvers]);

          // Attempt to update a dispute resolver, expecting revert
          await expect(accountHandler.connect(admin).updateDisputeResolver(disputeResolver)).to.revertedWith(
            RevertReasons.REGION_PAUSED
          );
        });

        it("Dispute resolver does not exist", async function () {
          // Set invalid id
          disputeResolver.id = "444";

          // Attempt to update the dispute resolver, expecting revert
          await expect(accountHandler.connect(other1).updateDisputeResolver(disputeResolver)).to.revertedWith(
            RevertReasons.NO_SUCH_DISPUTE_RESOLVER
          );

          // Set invalid id
          disputeResolver.id = "0";

          // Attempt to update the dispute resolver, expecting revert
          await expect(accountHandler.connect(other1).updateDisputeResolver(disputeResolver)).to.revertedWith(
            RevertReasons.NO_SUCH_DISPUTE_RESOLVER
          );
        });

        it("Caller is not dispute resolver admin address", async function () {
          // Attempt to update the disputer resolver, expecting revert
          await expect(accountHandler.connect(other2).updateDisputeResolver(disputeResolver)).to.revertedWith(
            RevertReasons.NOT_ADMIN
          );
        });

        it("Any address is the zero address", async function () {
          disputeResolver.assistant = ethers.constants.AddressZero;

          // Attempt to update the disputer resolver, expecting revert
          await expect(accountHandler.connect(admin).updateDisputeResolver(disputeResolver)).to.revertedWith(
            RevertReasons.INVALID_ADDRESS
          );

          disputeResolver.assistant = assistant.address;
          disputeResolver.admin = ethers.constants.AddressZero;

          // Attempt to update the disputer resolver, expecting revert
          await expect(accountHandler.connect(admin).updateDisputeResolver(disputeResolver)).to.revertedWith(
            RevertReasons.INVALID_ADDRESS
          );

          disputeResolver.admin = admin.address;
          disputeResolver.clerk = ethers.constants.AddressZero;

          // Attempt to update the disputer resolver, expecting revert
          await expect(accountHandler.connect(admin).updateDisputeResolver(disputeResolver)).to.revertedWith(
            RevertReasons.INVALID_ADDRESS
          );

          disputeResolver.clerk = clerk.address;
          disputeResolver.treasury = ethers.constants.AddressZero;

          // Attempt to update the disputer resolver, expecting revert
          await expect(accountHandler.connect(admin).updateDisputeResolver(disputeResolver)).to.revertedWith(
            RevertReasons.INVALID_ADDRESS
          );
        });

        it("Address is not unique to this dispute resolver Id", async function () {
          disputeResolver2 = mockDisputeResolver(other1.address, other1.address, other1.address, other1.address);
          expect(disputeResolver2.isValid()).is.true;
          disputeResolver2Struct = disputeResolver2.toStruct();
          await accountHandler
            .connect(other1)
            .createDisputeResolver(disputeResolver2, disputeResolverFees, sellerAllowList);

          //Set each address value to be same as disputeResolver2 and expect revert
          disputeResolver.assistant = other1.address;

          // Attempt to update dispute resolver 1 with non-unique admin address, expecting revert
          await expect(accountHandler.connect(admin).updateDisputeResolver(disputeResolver)).to.revertedWith(
            RevertReasons.DISPUTE_RESOLVER_ADDRESS_MUST_BE_UNIQUE
          );

          disputeResolver.assistant = assistant.address;
          disputeResolver.admin = other1.address;

          // Attempt to update dispute resolver 1 with non-unique admin address, expecting revert
          await expect(accountHandler.connect(admin).updateDisputeResolver(disputeResolver)).to.revertedWith(
            RevertReasons.DISPUTE_RESOLVER_ADDRESS_MUST_BE_UNIQUE
          );

          disputeResolver.admin = admin.address;
          disputeResolver.clerk = other1.address;

          // Attempt to update dispute resolver 1 with non-unique clerk address, expecting revert
          await expect(accountHandler.connect(admin).updateDisputeResolver(disputeResolver)).to.revertedWith(
            RevertReasons.DISPUTE_RESOLVER_ADDRESS_MUST_BE_UNIQUE
          );
        });

        it("Address is not unique to this dispute resolver Id", async function () {
          disputeResolver2 = mockDisputeResolver(other1.address, other1.address, other1.address, other1.address);
          expect(disputeResolver2.isValid()).is.true;

          //disputeResolver2Struct = disputeResolver2.toStruct();
          await accountHandler
            .connect(other1)
            .createDisputeResolver(disputeResolver2, disputeResolverFees, sellerAllowList);

          //Set dispute resolver 2's admin address to dispute resolver 1's assistant address
          disputeResolver2.admin = assistant.address;

          // Attempt to update dispute resolver 1 with non-unique admin address, expecting revert
          await expect(accountHandler.connect(other1).updateDisputeResolver(disputeResolver2)).to.revertedWith(
            RevertReasons.DISPUTE_RESOLVER_ADDRESS_MUST_BE_UNIQUE
          );

          //Set dispute resolver 2's assistant address to dispute resolver 1's clerk address
          disputeResolver2.admin = other2.address;
          disputeResolver2.assistant = clerk.address;

          // Attempt to update dispute resolver 1 with non-unique assistant address, expecting revert
          await expect(accountHandler.connect(other1).updateDisputeResolver(disputeResolver2)).to.revertedWith(
            RevertReasons.DISPUTE_RESOLVER_ADDRESS_MUST_BE_UNIQUE
          );

          //Set dispute resolver 2's clerk address to dispute resolver 1's admin address
          disputeResolver2.assistant = other1.address;
          disputeResolver2.clerk = admin.address;

          // Attempt to update dispute resolver 1 with non-unique clerk address, expecting revert
          await expect(accountHandler.connect(other1).updateDisputeResolver(disputeResolver2)).to.revertedWith(
            RevertReasons.DISPUTE_RESOLVER_ADDRESS_MUST_BE_UNIQUE
          );
        });

        it("EscalationResponsePeriod is invalid", async function () {
          await configHandler.setMaxEscalationResponsePeriod(oneWeek);

          // New escalation period has to be different from the current escalation period
          disputeResolver.escalationResponsePeriod = oneWeek + 1;

          // Attempt to update a DisputeResolver, expecting revert
          await expect(accountHandler.connect(admin).updateDisputeResolver(disputeResolver)).to.revertedWith(
            RevertReasons.INVALID_ESCALATION_PERIOD
          );

          disputeResolver.escalationResponsePeriod = 0;

          // Attempt to update a DisputeResolver, expecting revert
          await expect(accountHandler.connect(admin).updateDisputeResolver(disputeResolver)).to.revertedWith(
            RevertReasons.INVALID_ESCALATION_PERIOD
          );
        });
        it("No updates applied or set to pending", async function () {
          await expect(accountHandler.connect(admin).updateDisputeResolver(disputeResolver)).to.revertedWith(
            RevertReasons.NO_UPDATE_APPLIED
          );
        });
      });
    });

    context("👉 addFeesToDisputeResolver()", async function () {
      beforeEach(async function () {
        await accountHandler
          .connect(admin)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

        // How that dispute resolver looks as a returned struct
        disputeResolverStruct = disputeResolver.toStruct();

        expectedDisputeResolver = disputeResolver.clone();
        expectedDisputeResolverStruct = expectedDisputeResolver.toStruct();
      });

      it("should emit a DisputeResolverFeesAdded event", async function () {
        const disputeResolverFeesToAdd = [
          new DisputeResolverFee(other4.address, "MockToken4", "0"),
          new DisputeResolverFee(other5.address, "MockToken5", "50"),
        ];

        const addedDisputeResolverFeeList = new DisputeResolverFeeList(disputeResolverFeesToAdd);

        const tx = await accountHandler
          .connect(admin)
          .addFeesToDisputeResolver(disputeResolver.id, disputeResolverFeesToAdd);

        const valid = await isValidDisputeResolverEvent(
          tx,
          "DisputeResolverFeesAdded",
          disputeResolver.id,
          "dummy value",
          addedDisputeResolverFeeList,
          1,
          [],
          admin.address
        );

        expect(valid).is.true;
      });

      it("should update DisputeResolverFee state only", async function () {
        const disputeResolverFeesToAdd = [
          new DisputeResolverFee(other4.address, "MockToken4", "0"),
          new DisputeResolverFee(other5.address, "MockToken5", "50"),
        ];

        const expectedDisputeResolverFees = [...disputeResolverFees, ...disputeResolverFeesToAdd];

        const expectedDisputeResolverFeeList = new DisputeResolverFeeList(expectedDisputeResolverFees);

        // Add fees to dispute resolver
        await accountHandler.connect(admin).addFeesToDisputeResolver(disputeResolver.id, disputeResolverFeesToAdd);

        // Get the dispute resolver data as structs
        [, disputeResolverStruct, disputeResolverFeeListStruct, returnedSellerAllowList] = await accountHandler
          .connect(rando)
          .getDisputeResolver(disputeResolver.id);

        // Parse into entity
        let returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);
        let returnedDisputeResolverFeeList = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct);
        expect(returnedDisputeResolver.isValid()).is.true;
        expect(returnedDisputeResolverFeeList.isValid()).is.true;

        // Returned values should match expectedDisputeResolver
        for ([key, value] of Object.entries(expectedDisputeResolver)) {
          expect(JSON.stringify(returnedDisputeResolver[key]) === JSON.stringify(value)).is.true;
        }

        assert.equal(
          returnedDisputeResolverFeeList.toString(),
          expectedDisputeResolverFeeList.toString(),
          "Dispute Resolver Fee List is incorrect"
        );

        expect(returnedSellerAllowList.toString()).to.eql(sellerAllowList.toString(), "Allowed list wrong");
      });

      context("💔 Revert Reasons", async function () {
        it("The dispute resolvers region of protocol is paused", async function () {
          const disputeResolverFeesToAdd = [
            new DisputeResolverFee(other4.address, "MockToken4", "400"),
            new DisputeResolverFee(other5.address, "MockToken5", "500"),
          ];

          // Pause the dispute resolvers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.DisputeResolvers]);

          // Attempt to add dispute resolver fees, expecting revert
          await expect(
            accountHandler.connect(admin).addFeesToDisputeResolver(disputeResolver.id, disputeResolverFeesToAdd)
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("Dispute resolver does not exist", async function () {
          // Set invalid id
          disputeResolver.id = "444";

          // Attempt to add fees to the dispute resolver, expecting revert
          await expect(
            accountHandler.connect(admin).addFeesToDisputeResolver(disputeResolver.id, disputeResolverFees)
          ).to.revertedWith(RevertReasons.NO_SUCH_DISPUTE_RESOLVER);

          // Set invalid id
          disputeResolver.id = "0";

          // Attempt to add fees to the dispute resolver, expecting revert
          await expect(
            accountHandler.connect(admin).addFeesToDisputeResolver(disputeResolver.id, disputeResolverFees)
          ).to.revertedWith(RevertReasons.NO_SUCH_DISPUTE_RESOLVER);
        });

        it("Caller is not dispute resolver admin address", async function () {
          // Attempt to add fees to the dispute resolver, expecting revert
          await expect(
            accountHandler.connect(rando).addFeesToDisputeResolver(disputeResolver.id, disputeResolverFees)
          ).to.revertedWith(RevertReasons.NOT_ADMIN);
        });

        it("DisputeResolverFees empty", async function () {
          disputeResolverFees = [];

          // Attempt to add fees to the dispute resolver, expecting revert
          await expect(
            accountHandler.connect(admin).addFeesToDisputeResolver(disputeResolver.id, disputeResolverFees)
          ).to.revertedWith(RevertReasons.INVALID_AMOUNT_DISPUTE_RESOLVER_FEES);
        });

        it("DisputeResolverFees above max", async function () {
          await configHandler.setMaxFeesPerDisputeResolver(2);

          // Attempt to add fees to the dispute resolver, expecting revert
          await expect(
            accountHandler.connect(admin).addFeesToDisputeResolver(disputeResolver.id, disputeResolverFees)
          ).to.revertedWith(RevertReasons.INVALID_AMOUNT_DISPUTE_RESOLVER_FEES);
        });

        it("Duplicate dispute resolver fees", async function () {
          //Add to DisputeResolverFee array
          disputeResolverFees.push(new DisputeResolverFee(other4.address, "MockToken4", "0"));
          disputeResolverFees.push(new DisputeResolverFee(other5.address, "MockToken5", "0"));
          disputeResolverFeeList = new DisputeResolverFeeList(disputeResolverFees);

          // Attempt to add fees to the dispute resolver, expecting revert
          await expect(
            accountHandler.connect(admin).addFeesToDisputeResolver(disputeResolver.id, disputeResolverFees)
          ).to.revertedWith(RevertReasons.DUPLICATE_DISPUTE_RESOLVER_FEES);
        });
      });
    });

    context("👉 removeFeesFromDisputeResolver()", async function () {
      beforeEach(async function () {
        await accountHandler
          .connect(admin)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

        // How that dispute resolver looks as a returned struct
        disputeResolverStruct = disputeResolver.toStruct();

        expectedDisputeResolver = disputeResolver.clone();
        expectedDisputeResolverStruct = expectedDisputeResolver.toStruct();
      });

      it("should emit a DisputeResolverFeesRemoved event", async function () {
        feeTokenAddressesToRemove = [other1.address, other2.address, other3.address];

        await expect(
          accountHandler.connect(admin).removeFeesFromDisputeResolver(disputeResolver.id, feeTokenAddressesToRemove)
        )
          .to.emit(accountHandler, "DisputeResolverFeesRemoved")
          .withArgs(disputeResolver.id, feeTokenAddressesToRemove, admin.address);
      });

      it("should update the DisputeResolverFee state only if the first DisputeResolverFee is removed", async function () {
        feeTokenAddressesToRemove = [other1.address];

        // Remove fees from dispute resolver
        await accountHandler
          .connect(admin)
          .removeFeesFromDisputeResolver(disputeResolver.id, feeTokenAddressesToRemove);

        // Get the dispute resolver data as structs
        [, disputeResolverStruct, disputeResolverFeeListStruct, returnedSellerAllowList] = await accountHandler
          .connect(rando)
          .getDisputeResolver(disputeResolver.id);

        // Parse into entity
        let returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);
        let returnedDisputeResolverFeeList = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct);
        expect(returnedDisputeResolver.isValid()).is.true;
        expect(returnedDisputeResolverFeeList.isValid()).is.true;

        // Returned values should match expectedDisputeResolver
        for ([key, value] of Object.entries(expectedDisputeResolver)) {
          expect(JSON.stringify(returnedDisputeResolver[key]) === JSON.stringify(value)).is.true;
        }

        const expectedDisputeResolverFees = [disputeResolverFees[2], disputeResolverFees[1]];

        const expectedDisputeResolverFeeList = new DisputeResolverFeeList(expectedDisputeResolverFees);
        assert.equal(
          returnedDisputeResolverFeeList.toString(),
          expectedDisputeResolverFeeList.toString(),
          "Dispute Resolver Fee List is incorrect"
        );
      });

      it("should update state only if the last DisputeResolverFee is removed", async function () {
        feeTokenAddressesToRemove = [other3.address];

        // Remove fees from dispute resolver
        await accountHandler
          .connect(admin)
          .removeFeesFromDisputeResolver(disputeResolver.id, feeTokenAddressesToRemove);

        // Get the dispute resolver data as structs
        [, disputeResolverStruct, disputeResolverFeeListStruct, returnedSellerAllowList] = await accountHandler
          .connect(rando)
          .getDisputeResolver(disputeResolver.id);

        // Parse into entity
        let returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);
        let returnedDisputeResolverFeeList = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct);
        expect(returnedDisputeResolver.isValid()).is.true;
        expect(returnedDisputeResolverFeeList.isValid()).is.true;

        // Returned values should match expectedDisputeResolver
        for ([key, value] of Object.entries(expectedDisputeResolver)) {
          expect(JSON.stringify(returnedDisputeResolver[key]) === JSON.stringify(value)).is.true;
        }

        const expectedDisputeResolverFees = [disputeResolverFees[0], disputeResolverFees[1]];

        const expectedDisputeResolverFeeList = new DisputeResolverFeeList(expectedDisputeResolverFees);
        assert.equal(
          returnedDisputeResolverFeeList.toString(),
          expectedDisputeResolverFeeList.toString(),
          "Dispute Resolver Fee List is incorrect"
        );
      });

      it("should update DisputeResolverFee state only if some DisputeResolverFees are removed", async function () {
        feeTokenAddressesToRemove = [other1.address, other3.address];

        // Remove fees from dispute resolver
        await accountHandler
          .connect(admin)
          .removeFeesFromDisputeResolver(disputeResolver.id, feeTokenAddressesToRemove);

        // Get the dispute resolver data as structs
        [, disputeResolverStruct, disputeResolverFeeListStruct, returnedSellerAllowList] = await accountHandler
          .connect(rando)
          .getDisputeResolver(disputeResolver.id);

        // Parse into entity
        let returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);
        let returnedDisputeResolverFeeList = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct);
        expect(returnedDisputeResolver.isValid()).is.true;
        expect(returnedDisputeResolverFeeList.isValid()).is.true;

        // Returned values should match expectedDisputeResolver
        for ([key, value] of Object.entries(expectedDisputeResolver)) {
          expect(JSON.stringify(returnedDisputeResolver[key]) === JSON.stringify(value)).is.true;
        }

        const expectedisputeResolverFees = [new DisputeResolverFee(other2.address, "MockToken2", "0")];

        const expectedDisputeResolverFeeList = new DisputeResolverFeeList(expectedisputeResolverFees);
        assert.equal(
          returnedDisputeResolverFeeList.toString(),
          expectedDisputeResolverFeeList.toString(),
          "Dispute Resolver Fee List is incorrect"
        );

        expect(returnedSellerAllowList.toString()).to.eql(sellerAllowList.toString(), "Allowed list wrong");
      });

      it("should update DisputeResolverFee state only if all DisputeResolverFees are removed", async function () {
        const feeTokenAddressesToRemove = [other1.address, other2.address, other3.address];

        // Remove fees from dispute resolver
        await accountHandler
          .connect(admin)
          .removeFeesFromDisputeResolver(disputeResolver.id, feeTokenAddressesToRemove);

        // Get the dispute resolver data as structs
        [, disputeResolverStruct, disputeResolverFeeListStruct, returnedSellerAllowList] = await accountHandler
          .connect(rando)
          .getDisputeResolver(disputeResolver.id);

        // Parse into entity
        let returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);
        let returnedDisputeResolverFeeList = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct);
        expect(returnedDisputeResolver.isValid()).is.true;
        expect(returnedDisputeResolverFeeList.isValid()).is.true;

        // Returned values should match expectedDisputeResolver
        for ([key, value] of Object.entries(expectedDisputeResolver)) {
          expect(JSON.stringify(returnedDisputeResolver[key]) === JSON.stringify(value)).is.true;
        }

        const expectedisputeResolverFees = [];

        const expectedDisputeResolverFeeList = new DisputeResolverFeeList(expectedisputeResolverFees);
        assert.equal(
          returnedDisputeResolverFeeList.toString(),
          expectedDisputeResolverFeeList.toString(),
          "Dispute Resolver Fee List is incorrect"
        );

        expect(returnedSellerAllowList.toString()).to.eql(sellerAllowList.toString(), "Allowed list wrong");
      });

      context("💔 Revert Reasons", async function () {
        beforeEach(async function () {
          feeTokenAddressesToRemove = [other1.address, other2.address, other3.address];
        });

        it("The dispute resolvers region of protocol is paused", async function () {
          // Pause the dispute resolvers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.DisputeResolvers]);

          // Attempt to remove dispute resolver fees, expecting revert
          await expect(
            accountHandler.connect(admin).removeFeesFromDisputeResolver(disputeResolver.id, feeTokenAddressesToRemove)
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("Dispute resolver does not exist", async function () {
          // Set invalid id
          disputeResolver.id = "444";

          // Attempt to remove fees from the dispute resolver, expecting revert
          await expect(
            accountHandler.connect(admin).removeFeesFromDisputeResolver(disputeResolver.id, feeTokenAddressesToRemove)
          ).to.revertedWith(RevertReasons.NO_SUCH_DISPUTE_RESOLVER);

          // Set invalid id
          disputeResolver.id = "0";

          // Attempt to remove fees from the dispute resolver, expecting revert
          await expect(
            accountHandler.connect(admin).removeFeesFromDisputeResolver(disputeResolver.id, feeTokenAddressesToRemove)
          ).to.revertedWith(RevertReasons.NO_SUCH_DISPUTE_RESOLVER);
        });

        it("Caller is not dispute resolver admin address", async function () {
          // Attempt to remove fees from the dispute resolver, expecting revert
          await expect(
            accountHandler.connect(rando).removeFeesFromDisputeResolver(disputeResolver.id, feeTokenAddressesToRemove)
          ).to.revertedWith(RevertReasons.NOT_ADMIN);
        });

        it("DisputeResolverFees empty", async function () {
          feeTokenAddressesToRemove = [];

          // Attempt to remove fees from the dispute resolver, expecting revert
          await expect(
            accountHandler.connect(admin).removeFeesFromDisputeResolver(disputeResolver.id, feeTokenAddressesToRemove)
          ).to.revertedWith(RevertReasons.INVALID_AMOUNT_DISPUTE_RESOLVER_FEES);
        });

        it("DisputeResolverFees above max", async function () {
          await configHandler.setMaxFeesPerDisputeResolver(2);

          // Attempt to remove fees from the dispute resolver, expecting revert
          await expect(
            accountHandler.connect(admin).removeFeesFromDisputeResolver(disputeResolver.id, feeTokenAddressesToRemove)
          ).to.revertedWith(RevertReasons.INVALID_AMOUNT_DISPUTE_RESOLVER_FEES);
        });

        it("DisputeResolverFee in array does not exist for Dispute Resolver", async function () {
          feeTokenAddressesToRemove = [other4.address, other5.address];

          // Attempt to remove fees from the dispute resolver, expecting revert
          await expect(
            accountHandler.connect(admin).removeFeesFromDisputeResolver(disputeResolver.id, feeTokenAddressesToRemove)
          ).to.revertedWith(RevertReasons.DISPUTE_RESOLVER_FEE_NOT_FOUND);
        });
      });
    });

    context("👉 addSellersToAllowList()", async function () {
      beforeEach(async function () {
        await accountHandler
          .connect(admin)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

        // make another seller with id = "5"
        let seller4 = mockSeller(other3.address, other3.address, other3.address, other3.address);

        await accountHandler.connect(other3).createSeller(seller4, emptyAuthToken, voucherInitValues);

        // AuthToken
        emptyAuthToken = mockAuthToken();
        expect(emptyAuthToken.isValid()).is.true;

        sellerAllowList = ["3", "1"];
        allowedSellersToAdd = ["2", "5"];

        // How that dispute resolver looks as a returned struct
        disputeResolverStruct = disputeResolver.toStruct();

        expectedDisputeResolver = disputeResolver.clone();
        expectedDisputeResolverStruct = expectedDisputeResolver.toStruct();
      });

      it("should emit an AllowedSellersAdded event", async function () {
        // add sellers, test for event
        await expect(accountHandler.connect(admin).addSellersToAllowList(disputeResolver.id, allowedSellersToAdd))
          .to.emit(accountHandler, "AllowedSellersAdded")
          .withArgs(disputeResolver.id, allowedSellersToAdd, admin.address);
      });

      it("should update SellerAllowList state only", async function () {
        const expectedSellerAllowList = [...sellerAllowList, ...allowedSellersToAdd];

        // Add seller ids to seller allow list
        await accountHandler.connect(admin).addSellersToAllowList(disputeResolver.id, allowedSellersToAdd);

        // Get the dispute resolver data as structs
        [, disputeResolverStruct, disputeResolverFeeListStruct, returnedSellerAllowList] = await accountHandler
          .connect(rando)
          .getDisputeResolver(disputeResolver.id);

        // Parse into entity
        let returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);
        let returnedDisputeResolverFeeList = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct);
        expect(returnedDisputeResolver.isValid()).is.true;
        expect(returnedDisputeResolverFeeList.isValid()).is.true;

        // Returned values should match expectedDisputeResolver
        for ([key, value] of Object.entries(expectedDisputeResolver)) {
          expect(JSON.stringify(returnedDisputeResolver[key]) === JSON.stringify(value)).is.true;
        }

        assert.equal(
          returnedDisputeResolverFeeList.toString(),
          disputeResolverFeeList.toString(),
          "Dispute Resolver Fee List is incorrect"
        );

        expect(returnedSellerAllowList.toString()).to.eql(expectedSellerAllowList.toString(), "Allowed list wrong");

        // check that mappings of allowed selleres were updated
        idsToCheck = ["1", "2", "3", "5"];
        expectedStatus = [true, true, true, true]; // 1 and 3 are allowed
        const areSellersAllowed = await accountHandler.connect(rando).areSellersAllowed(disputeResolver.id, idsToCheck);

        expect(areSellersAllowed).to.eql(expectedStatus, "Wrong statuses reported");
      });

      context("💔 Revert Reasons", async function () {
        it("The dispute resolvers region of protocol is paused", async function () {
          // Pause the dispute resolvers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.DisputeResolvers]);

          // Attempt to add sellers to a dispute resolver allow list, expecting revert
          await expect(
            accountHandler.connect(admin).addSellersToAllowList(disputeResolver.id, allowedSellersToAdd)
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("Dispute resolver does not exist", async function () {
          // Set invalid id
          disputeResolver.id = "444";

          // Attempt to add sellers to the allow list, expecting revert
          await expect(
            accountHandler.connect(admin).addSellersToAllowList(disputeResolver.id, allowedSellersToAdd)
          ).to.revertedWith(RevertReasons.NO_SUCH_DISPUTE_RESOLVER);

          // Set invalid id
          disputeResolver.id = "0";

          // Attempt to add sellers to the allow list, expecting revert
          await expect(
            accountHandler.connect(admin).addSellersToAllowList(disputeResolver.id, allowedSellersToAdd)
          ).to.revertedWith(RevertReasons.NO_SUCH_DISPUTE_RESOLVER);
        });

        it("Caller is not dispute resolver admin address", async function () {
          // Attempt to add sellers to the allow list, expecting revert
          await expect(
            accountHandler.connect(rando).addSellersToAllowList(disputeResolver.id, allowedSellersToAdd)
          ).to.revertedWith(RevertReasons.NOT_ADMIN);
        });

        it("SellerAllowList empty", async function () {
          allowedSellersToAdd = [];

          // Attempt to add sellers to the allow list, expecting revert
          await expect(
            accountHandler.connect(admin).addSellersToAllowList(disputeResolver.id, allowedSellersToAdd)
          ).to.revertedWith(RevertReasons.INVALID_AMOUNT_ALLOWED_SELLERS);
        });

        it("SellerAllowList above max", async function () {
          allowedSellersToAdd = new Array(101).fill("1");

          // Attempt to add sellers to the allow list, expecting revert
          await expect(
            accountHandler.connect(admin).addSellersToAllowList(disputeResolver.id, allowedSellersToAdd)
          ).to.revertedWith(RevertReasons.INVALID_AMOUNT_ALLOWED_SELLERS);
        });

        it("Some seller does not exist", async function () {
          // Add invalid id
          allowedSellersToAdd = ["2", "4", "6"];

          // Attempt to add sellers to the allow list, expecting revert
          await expect(
            accountHandler.connect(admin).addSellersToAllowList(disputeResolver.id, allowedSellersToAdd)
          ).to.revertedWith(RevertReasons.NO_SUCH_SELLER);
        });

        it("Seller id is already approved", async function () {
          // New, but duplicated
          allowedSellersToAdd = ["2", "5", "2"];

          // Attempt to add sellers to the allow listr, expecting revert
          await expect(
            accountHandler.connect(admin).addSellersToAllowList(disputeResolver.id, allowedSellersToAdd)
          ).to.revertedWith(RevertReasons.SELLER_ALREADY_APPROVED);

          // Duplicate existing seller id
          allowedSellersToAdd = ["2", "1"];

          // Attempt to add sellers to the allow list, expecting revert
          await expect(
            accountHandler.connect(admin).addSellersToAllowList(disputeResolver.id, allowedSellersToAdd)
          ).to.revertedWith(RevertReasons.SELLER_ALREADY_APPROVED);
        });
      });
    });

    context("👉 removeSellersFromAllowList()", async function () {
      beforeEach(async function () {
        sellerAllowList = ["1", "3", "2"];
        allowedSellersToRemove = ["1", "2"];

        // How that dispute resolver looks as a returned struct
        disputeResolverStruct = disputeResolver.toStruct();

        expectedDisputeResolver = disputeResolver.clone();
        expectedDisputeResolverStruct = expectedDisputeResolver.toStruct();

        await accountHandler
          .connect(admin)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

        // make another seller with id = "5"
        const seller4 = mockSeller(other3.address, other3.address, other3.address, other3.address);

        // AuthToken
        emptyAuthToken = mockAuthToken();
        expect(emptyAuthToken.isValid()).is.true;

        await accountHandler.connect(other3).createSeller(seller4, emptyAuthToken, voucherInitValues);

        sellerAllowList.push("5");
        await accountHandler.connect(admin).addSellersToAllowList(disputeResolver.id, ["5"]);
      });

      afterEach(async function () {
        // Reset
        accountId.next(true);
      });

      it("should emit a AllowedSellersRemoved event", async function () {
        await expect(
          accountHandler.connect(admin).removeSellersFromAllowList(disputeResolver.id, allowedSellersToRemove)
        )
          .to.emit(accountHandler, "AllowedSellersRemoved")
          .withArgs(disputeResolver.id, allowedSellersToRemove, admin.address);
      });

      it("should update SellerAllowList state only if some Allowed Sellers are removed", async function () {
        // Remove fees from dispute resolver
        await accountHandler.connect(admin).removeSellersFromAllowList(disputeResolver.id, allowedSellersToRemove);

        // Get the dispute resolver data as structs
        [, disputeResolverStruct, disputeResolverFeeListStruct, returnedSellerAllowList] = await accountHandler
          .connect(rando)
          .getDisputeResolver(disputeResolver.id);

        // Parse into entity
        let returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);
        let returnedDisputeResolverFeeList = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct);
        expect(returnedDisputeResolver.isValid()).is.true;
        expect(returnedDisputeResolverFeeList.isValid()).is.true;

        // Returned values should match expectedDisputeResolver
        for ([key, value] of Object.entries(expectedDisputeResolver)) {
          expect(JSON.stringify(returnedDisputeResolver[key]) === JSON.stringify(value)).is.true;
        }

        assert.equal(
          returnedDisputeResolverFeeList.toString(),
          disputeResolverFeeList.toString(),
          "Dispute Resolver Fee List is incorrect"
        );

        const expectedSellerAllowList = ["5", "3"];
        expect(returnedSellerAllowList.toString()).to.eql(expectedSellerAllowList.toString(), "Allowed list wrong");

        // check that mappings of allowed selleres were updated
        idsToCheck = ["1", "2", "3", "5"];
        expectedStatus = [false, false, true, true]; // 3 and 5 are allowed
        const areSellersAllowed = await accountHandler.connect(rando).areSellersAllowed(disputeResolver.id, idsToCheck);

        expect(areSellersAllowed).to.eql(expectedStatus, "Wrong statuses reported");
      });

      it("should update SellerAllowList state only if all allowed sellers are removed", async function () {
        allowedSellersToRemove = sellerAllowList;

        // Remove fees from dispute resolver
        await accountHandler.connect(admin).removeSellersFromAllowList(disputeResolver.id, allowedSellersToRemove);

        // Get the dispute resolver data as structs
        [, disputeResolverStruct, disputeResolverFeeListStruct, returnedSellerAllowList] = await accountHandler
          .connect(rando)
          .getDisputeResolver(disputeResolver.id);

        // Parse into entity
        let returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);
        let returnedDisputeResolverFeeList = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct);
        expect(returnedDisputeResolver.isValid()).is.true;
        expect(returnedDisputeResolverFeeList.isValid()).is.true;

        // Returned values should match expectedDisputeResolver
        for ([key, value] of Object.entries(expectedDisputeResolver)) {
          expect(JSON.stringify(returnedDisputeResolver[key]) === JSON.stringify(value)).is.true;
        }

        assert.equal(
          returnedDisputeResolverFeeList.toString(),
          disputeResolverFeeList.toString(),
          "Dispute Resolver Fee List is incorrect"
        );

        const expectedSellerAllowList = [];
        expect(returnedSellerAllowList.toString()).to.eql(expectedSellerAllowList.toString(), "Allowed list wrong");

        // make another seller with id = "6"
        const seller6 = mockSeller(other4.address, other4.address, other4.address, other4.address);
        await accountHandler.connect(other4).createSeller(seller6, emptyAuthToken, voucherInitValues);

        // check that mappings of allowed selleres were updated
        idsToCheck = ["1", "2", "3", "4", "5", "6"];
        expectedStatus = [true, true, true, false, true, true]; // everything was removed, so every seller is allowed. 5 is not a seller
        const areSellersAllowed = await accountHandler.connect(rando).areSellersAllowed(disputeResolver.id, idsToCheck);
        expect(areSellersAllowed).to.eql(expectedStatus, "Wrong statuses reported");
      });

      context("💔 Revert Reasons", async function () {
        it("The dispute resolvers region of protocol is paused", async function () {
          // Pause the dispute resolvers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.DisputeResolvers]);

          // Attempt to remove sellers from a dispute resolver allow list, expecting revert
          await expect(
            accountHandler.connect(admin).removeSellersFromAllowList(disputeResolver.id, allowedSellersToRemove)
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("Dispute resolver does not exist", async function () {
          // Set invalid id
          disputeResolver.id = "444";

          // Attempt to remove sellers from the allowed list, expecting revert
          await expect(
            accountHandler.connect(admin).removeSellersFromAllowList(disputeResolver.id, allowedSellersToRemove)
          ).to.revertedWith(RevertReasons.NO_SUCH_DISPUTE_RESOLVER);

          // Set invalid id
          disputeResolver.id = "0";

          // Attempt to remove sellers from the allowed list, expecting revert
          await expect(
            accountHandler.connect(admin).removeSellersFromAllowList(disputeResolver.id, allowedSellersToRemove)
          ).to.revertedWith(RevertReasons.NO_SUCH_DISPUTE_RESOLVER);
        });

        it("Caller is not dispute resolver admin address", async function () {
          // Attempt to remove sellers from the allowed list, expecting revert
          await expect(
            accountHandler.connect(rando).removeSellersFromAllowList(disputeResolver.id, allowedSellersToRemove)
          ).to.revertedWith(RevertReasons.NOT_ADMIN);
        });

        it("SellerAllowList empty", async function () {
          allowedSellersToRemove = [];

          // Attempt to remove sellers from the allowed list, expecting revert
          await expect(
            accountHandler.connect(admin).removeSellersFromAllowList(disputeResolver.id, allowedSellersToRemove)
          ).to.revertedWith(RevertReasons.INVALID_AMOUNT_ALLOWED_SELLERS);
        });

        it("SellerAllowList above max", async function () {
          allowedSellersToRemove = new Array(101).fill("1");

          // Attempt to remove sellers from the allowed list, expecting revert
          await expect(
            accountHandler.connect(admin).removeSellersFromAllowList(disputeResolver.id, allowedSellersToRemove)
          ).to.revertedWith(RevertReasons.INVALID_AMOUNT_ALLOWED_SELLERS);
        });

        it("Seller id is not approved", async function () {
          // make another seller with id = "6"
          const seller6 = mockSeller(other4.address, other4.address, other4.address, other4.address);
          await accountHandler.connect(other4).createSeller(seller6, emptyAuthToken, voucherInitValues);

          // seller exists, it's not approved
          allowedSellersToRemove = ["2", "4", "6"];

          // Attempt to remove sellers from the allowed list, expecting revert
          await expect(
            accountHandler.connect(admin).removeSellersFromAllowList(disputeResolver.id, allowedSellersToRemove)
          ).to.revertedWith(RevertReasons.SELLER_NOT_APPROVED);

          // remove same id twice
          allowedSellersToRemove = ["2", "4", "2"];

          // Attempt to remove sellers from the allowed list, expecting revert
          await expect(
            accountHandler.connect(admin).removeSellersFromAllowList(disputeResolver.id, allowedSellersToRemove)
          ).to.revertedWith(RevertReasons.SELLER_NOT_APPROVED);
        });
      });
    });

    context("👉 optInToDisputeResolverUpdate()", function () {
      beforeEach(async function () {
        expectedDisputeResolver = disputeResolver.clone();
        expectedDisputeResolverStruct = expectedDisputeResolver.toStruct();

        await accountHandler
          .connect(admin)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
      });

      it("New assistant should opt-in to update disputeResolver", async function () {
        disputeResolver.assistant = other1.address;
        expectedDisputeResolver.assistant = other1.address;
        expectedDisputeResolverStruct = expectedDisputeResolver.toStruct();

        await accountHandler.connect(admin).updateDisputeResolver(disputeResolver);

        await expect(
          accountHandler
            .connect(other1)
            .optInToDisputeResolverUpdate(disputeResolver.id, [DisputeResolverUpdateFields.Assistant])
        )
          .to.emit(accountHandler, "DisputeResolverUpdateApplied")
          .withArgs(
            disputeResolver.id,
            expectedDisputeResolverStruct,
            disputeResolverPendingUpdateStruct,
            other1.address
          );
      });

      it("New admin should opt-in to update disputeResolver", async function () {
        disputeResolver.admin = other1.address;
        expectedDisputeResolver.admin = other1.address;
        expectedDisputeResolverStruct = expectedDisputeResolver.toStruct();

        await accountHandler.connect(admin).updateDisputeResolver(disputeResolver);

        await expect(
          accountHandler
            .connect(other1)
            .optInToDisputeResolverUpdate(disputeResolver.id, [DisputeResolverUpdateFields.Admin])
        )
          .to.emit(accountHandler, "DisputeResolverUpdateApplied")
          .withArgs(
            disputeResolver.id,
            expectedDisputeResolverStruct,
            disputeResolverPendingUpdateStruct,
            other1.address
          );
      });

      it("New clerk should opt-in to update disputeResolver", async function () {
        disputeResolver.clerk = other1.address;
        expectedDisputeResolver.clerk = other1.address;
        expectedDisputeResolverStruct = expectedDisputeResolver.toStruct();

        await accountHandler.connect(admin).updateDisputeResolver(disputeResolver);

        await expect(
          accountHandler
            .connect(other1)
            .optInToDisputeResolverUpdate(disputeResolver.id, [DisputeResolverUpdateFields.Clerk])
        )
          .to.emit(accountHandler, "DisputeResolverUpdateApplied")
          .withArgs(
            disputeResolver.id,
            expectedDisputeResolverStruct,
            disputeResolverPendingUpdateStruct,
            other1.address
          );
      });

      it("Should update admin, clerk and assistant in a single call ", async function () {
        disputeResolver.clerk = expectedDisputeResolver.clerk = other1.address;
        disputeResolver.admin = expectedDisputeResolver.admin = other1.address;
        disputeResolver.assistant = expectedDisputeResolver.assistant = other1.address;
        expectedDisputeResolverStruct = expectedDisputeResolver.toStruct();

        await accountHandler.connect(admin).updateDisputeResolver(disputeResolver);

        await expect(
          accountHandler
            .connect(other1)
            .optInToDisputeResolverUpdate(disputeResolver.id, [
              DisputeResolverUpdateFields.Clerk,
              DisputeResolverUpdateFields.Admin,
              DisputeResolverUpdateFields.Assistant,
            ])
        )
          .to.emit(accountHandler, "DisputeResolverUpdateApplied")
          .withArgs(
            disputeResolver.id,
            expectedDisputeResolverStruct,
            disputeResolverPendingUpdateStruct,
            other1.address
          );
      });

      it("If updateDisputeResolver is called twice with no optIn in between, disputeResolverPendingUpdate is populated with the data from second call", async function () {
        disputeResolver.assistant = disputeResolverPendingUpdate.assistant = other1.address;
        disputeResolverPendingUpdateStruct = disputeResolverPendingUpdate.toStruct();

        await expect(accountHandler.connect(admin).updateDisputeResolver(disputeResolver))
          .to.emit(accountHandler, "DisputeResolverUpdatePending")
          .withArgs(disputeResolver.id, disputeResolverPendingUpdateStruct, admin.address);

        const disputeResolverPendingUpdate2 = disputeResolverPendingUpdate.clone();
        disputeResolver.assistant =
          expectedDisputeResolver.assistant =
          disputeResolverPendingUpdate2.assistant =
            other2.address;
        let disputeResolverPendingUpdate2Struct = disputeResolverPendingUpdate2.toStruct();

        await expect(accountHandler.connect(admin).updateDisputeResolver(disputeResolver))
          .to.emit(accountHandler, "DisputeResolverUpdatePending")
          .withArgs(disputeResolver.id, disputeResolverPendingUpdate2Struct, admin.address);

        await expect(
          accountHandler
            .connect(other1)
            .optInToDisputeResolverUpdate(disputeResolver.id, [DisputeResolverUpdateFields.Assistant])
        ).to.revertedWith(RevertReasons.UNAUTHORIZED_CALLER_UPDATE);

        disputeResolverPendingUpdate.assistant = ethers.constants.AddressZero;
        disputeResolverPendingUpdate2Struct = disputeResolverPendingUpdate.toStruct();

        expectedDisputeResolverStruct = expectedDisputeResolver.toStruct();

        await expect(
          accountHandler
            .connect(other2)
            .optInToDisputeResolverUpdate(disputeResolver.id, [DisputeResolverUpdateFields.Assistant])
        )
          .to.emit(accountHandler, "DisputeResolverUpdateApplied")
          .withArgs(
            disputeResolver.id,
            expectedDisputeResolverStruct,
            disputeResolverPendingUpdate2Struct,
            other2.address
          );
      });

      it("Should not emit 'DisputeResolverUpdateApplied' event if caller doesn't specify any field", async function () {
        disputeResolver.assistant = other1.address;
        await accountHandler.connect(admin).updateDisputeResolver(disputeResolver);

        await expect(accountHandler.connect(other1).optInToDisputeResolverUpdate(disputeResolver.id, [])).to.not.emit(
          accountHandler,
          "DisputeResolverUpdateApplied"
        );
      });

      it("Should not emit 'DisputeResolverUpdateApplied'event if there is no pending update for specified field", async function () {
        disputeResolver.assistant = other1.address;
        await accountHandler.connect(admin).updateDisputeResolver(disputeResolver);

        await expect(
          accountHandler
            .connect(other1)
            .optInToDisputeResolverUpdate(disputeResolver.id, [DisputeResolverUpdateFields.Clerk])
        ).to.not.emit(accountHandler, "DisputeResolverUpdateApplied");
      });

      context("💔 Revert Reasons", async function () {
        it("There are no pending updates", async function () {
          disputeResolver.clerk = other1.address;
          disputeResolver.admin = other1.address;
          disputeResolver.assistant = other1.address;
          expectedDisputeResolver = disputeResolver.clone();
          expectedDisputeResolver.active = true;
          expectedDisputeResolverStruct = expectedDisputeResolver.toStruct();

          // No pending update auth token
          await accountHandler.connect(admin).updateDisputeResolver(disputeResolver);

          await expect(
            accountHandler
              .connect(other1)
              .optInToDisputeResolverUpdate(disputeResolver.id, [
                DisputeResolverUpdateFields.Clerk,
                DisputeResolverUpdateFields.Admin,
                DisputeResolverUpdateFields.Assistant,
              ])
          )
            .to.emit(accountHandler, "DisputeResolverUpdateApplied")
            .withArgs(
              disputeResolver.id,
              expectedDisputeResolverStruct,
              disputeResolverPendingUpdateStruct,
              other1.address
            );

          await expect(
            accountHandler.connect(other1).optInToDisputeResolverUpdate(disputeResolver.id, [])
          ).to.revertedWith(RevertReasons.NO_PENDING_UPDATE_FOR_ACCOUNT);
        });

        it("Caller is not the new admin", async function () {
          disputeResolver.admin = other1.address;
          disputeResolverStruct = disputeResolver.toStruct();

          await accountHandler.connect(admin).updateDisputeResolver(disputeResolver);

          await expect(
            accountHandler
              .connect(other2)
              .optInToDisputeResolverUpdate(disputeResolver.id, [DisputeResolverUpdateFields.Admin])
          ).to.revertedWith(RevertReasons.UNAUTHORIZED_CALLER_UPDATE);
        });

        it("Caller is not the new clerk", async function () {
          disputeResolver.clerk = other1.address;
          disputeResolverStruct = disputeResolver.toStruct();

          await accountHandler.connect(admin).updateDisputeResolver(disputeResolver);

          await expect(
            accountHandler
              .connect(other2)
              .optInToDisputeResolverUpdate(disputeResolver.id, [DisputeResolverUpdateFields.Clerk])
          ).to.revertedWith(RevertReasons.UNAUTHORIZED_CALLER_UPDATE);
        });

        it("Caller is not the new assistant", async function () {
          disputeResolver.assistant = other1.address;
          disputeResolverStruct = disputeResolver.toStruct();

          await accountHandler.connect(admin).updateDisputeResolver(disputeResolver);

          await expect(
            accountHandler
              .connect(other2)
              .optInToDisputeResolverUpdate(disputeResolver.id, [DisputeResolverUpdateFields.Assistant])
          ).to.revertedWith(RevertReasons.UNAUTHORIZED_CALLER_UPDATE);
        });

        it("The DisputeResolvers region of protocol is paused", async function () {
          disputeResolver.assistant = other1.address;

          await accountHandler.connect(admin).updateDisputeResolver(disputeResolver);

          // Pause the disputeResolvers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.DisputeResolvers]);

          await expect(
            accountHandler.connect(rando).optInToDisputeResolverUpdate(disputeResolver.id, [])
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("Admin is not unique to this disputeResolver", async function () {
          // Update disputeResolver admin
          disputeResolver.admin = other1.address;
          await accountHandler.connect(admin).updateDisputeResolver(disputeResolver);

          // Create disputeResolver with same admin
          disputeResolver2 = mockDisputeResolver(other1.address, other1.address, other1.address, other1.address);
          expect(disputeResolver2.isValid()).is.true;

          await accountHandler
            .connect(other1)
            .createDisputeResolver(disputeResolver2, disputeResolverFees, sellerAllowList);

          // Attemp to approve the update with non-unique admin, expecting revert
          await expect(
            accountHandler
              .connect(other1)
              .optInToDisputeResolverUpdate(disputeResolver.id, [DisputeResolverUpdateFields.Admin])
          ).to.revertedWith(RevertReasons.DISPUTE_RESOLVER_ADDRESS_MUST_BE_UNIQUE);
        });

        it("Clerk is not unique to this disputeResolver", async function () {
          // Update disputeResolver clerk
          disputeResolver.clerk = other1.address;
          await accountHandler.connect(admin).updateDisputeResolver(disputeResolver);

          // Create disputeResolver with same clerk
          disputeResolver2 = mockDisputeResolver(other1.address, other1.address, other1.address, other1.address);
          expect(disputeResolver2.isValid()).is.true;

          await accountHandler
            .connect(other1)
            .createDisputeResolver(disputeResolver2, disputeResolverFees, sellerAllowList);

          // Attemp to approve the update with non-unique clerk, expecting revert
          await expect(
            accountHandler
              .connect(other1)
              .optInToDisputeResolverUpdate(disputeResolver.id, [DisputeResolverUpdateFields.Clerk])
          ).to.revertedWith(RevertReasons.DISPUTE_RESOLVER_ADDRESS_MUST_BE_UNIQUE);
        });

        it("Assistant is not unique to this disputeResolver", async function () {
          // Update disputeResolver assistant
          disputeResolver.assistant = other1.address;
          await accountHandler.connect(admin).updateDisputeResolver(disputeResolver);

          // Create disputeResolver with same assistant
          disputeResolver2 = mockDisputeResolver(other1.address, other1.address, other1.address, other1.address);
          expect(disputeResolver2.isValid()).is.true;

          await accountHandler
            .connect(other1)
            .createDisputeResolver(disputeResolver2, disputeResolverFees, sellerAllowList);

          // Attemp to approve the update with non-unique assistant, expecting revert
          await expect(
            accountHandler
              .connect(other1)
              .optInToDisputeResolverUpdate(disputeResolver.id, [DisputeResolverUpdateFields.Assistant])
          ).to.revertedWith(RevertReasons.DISPUTE_RESOLVER_ADDRESS_MUST_BE_UNIQUE);
        });
      });
    });
  });
});
