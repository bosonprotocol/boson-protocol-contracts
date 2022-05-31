const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");
const DisputeResolver = require("../../scripts/domain/DisputeResolver");

/**
 *  Test the DisputeResolver domain entity
 */
describe("DisputeResolver", function () {
  // Suite-wide scope
  let disputeResolver, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
  let accounts, id, wallet, active;

  beforeEach(async function () {
    // Get a list of accounts
    accounts = await ethers.getSigners();
    wallet = accounts[1].address;

    // Required constructor params
    id = "170";
    active = true;
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated DisputeResolver instance", async function () {
      // Create a valid dispute resolver
      disputeResolver = new DisputeResolver(id, wallet, active);
      expect(disputeResolver.idIsValid()).is.true;
      expect(disputeResolver.walletIsValid()).is.true;
      expect(disputeResolver.activeIsValid()).is.true;
      expect(disputeResolver.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create a valid dispute resolver, then set fields in tests directly
      disputeResolver = new DisputeResolver(id, wallet, active);
      expect(disputeResolver.isValid()).is.true;
    });

    it("Always present, id must be the string representation of a BigNumber", async function () {
      // Invalid field value
      disputeResolver.id = "zedzdeadbaby";
      expect(disputeResolver.idIsValid()).is.false;
      expect(disputeResolver.isValid()).is.false;

      // Invalid field value
      disputeResolver.id = new Date();
      expect(disputeResolver.idIsValid()).is.false;
      expect(disputeResolver.isValid()).is.false;

      // Invalid field value
      disputeResolver.id = 12;
      expect(disputeResolver.idIsValid()).is.false;
      expect(disputeResolver.isValid()).is.false;

      // Valid field value
      disputeResolver.id = "0";
      expect(disputeResolver.idIsValid()).is.true;
      expect(disputeResolver.isValid()).is.true;

      // Valid field value
      disputeResolver.id = "126";
      expect(disputeResolver.idIsValid()).is.true;
      expect(disputeResolver.isValid()).is.true;
    });

    it("Always present, wallet must be a string representation of an EIP-55 compliant address", async function () {
      // Invalid field value
      disputeResolver.wallet = "0xASFADF";
      expect(disputeResolver.walletIsValid()).is.false;
      expect(disputeResolver.isValid()).is.false;

      // Invalid field value
      disputeResolver.wallet = "zedzdeadbaby";
      expect(disputeResolver.walletIsValid()).is.false;
      expect(disputeResolver.isValid()).is.false;

      // Valid field value
      disputeResolver.wallet = accounts[0].address;
      expect(disputeResolver.walletIsValid()).is.true;
      expect(disputeResolver.isValid()).is.true;

      // Valid field value
      disputeResolver.wallet = "0xec2fd5bd6fc7b576dae82c0b9640969d8de501a2";
      expect(disputeResolver.walletIsValid()).is.true;
      expect(disputeResolver.isValid()).is.true;
    });

    it("Always present, active must be a boolean", async function () {
      // Invalid field value
      disputeResolver.active = 12;
      expect(disputeResolver.activeIsValid()).is.false;
      expect(disputeResolver.isValid()).is.false;

      // Invalid field value
      disputeResolver.active = "zedzdeadbaby";
      expect(disputeResolver.activeIsValid()).is.false;
      expect(disputeResolver.isValid()).is.false;

      // Valid field value
      disputeResolver.active = false;
      expect(disputeResolver.activeIsValid()).is.true;
      expect(disputeResolver.isValid()).is.true;

      // Valid field value
      disputeResolver.active = true;
      expect(disputeResolver.activeIsValid()).is.true;
      expect(disputeResolver.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create a valid dispute resolver, then set fields in tests directly
      disputeResolver = new DisputeResolver(id, wallet, active);
      expect(disputeResolver.isValid()).is.true;

      // Get plain object
      object = {
        id,
        wallet,
        active,
      };

      // Struct representation
      struct = [id, wallet, active];
    });

    context("👉 Static", async function () {
      it("DisputeResolver.fromObject() should return a DisputeResolver instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = DisputeResolver.fromObject(object);

        // Is a DisputeResolver instance
        expect(promoted instanceof DisputeResolver).is.true;

        // Key values all match
        for ([key, value] of Object.entries(disputeResolver)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("DisputeResolver.fromStruct() should return a DisputeResolver instance from a struct representation", async function () {
        // Get struct from instance
        disputeResolver = DisputeResolver.fromStruct(struct);

        // Ensure it is valid
        expect(disputeResolver.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the DisputeResolver instance", async function () {
        dehydrated = disputeResolver.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(disputeResolver)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.clone() should return another DisputeResolver instance with the same property values", async function () {
        // Get plain object
        clone = disputeResolver.clone();

        // Is a DisputeResolver instance
        expect(clone instanceof DisputeResolver).is.true;

        // Key values all match
        for ([key, value] of Object.entries(disputeResolver)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the DisputeResolver instance", async function () {
        // Get plain object
        object = disputeResolver.toObject();

        // Not a DisputeResolver instance
        expect(object instanceof DisputeResolver).is.false;

        // Key values all match
        for ([key, value] of Object.entries(disputeResolver)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toStruct() should return a struct representation of the DisputeResolver instance", async function () {
        // Get struct from dispute resolver
        struct = disputeResolver.toStruct();

        // Marshal back to a dispute resolver instance
        disputeResolver = DisputeResolver.fromStruct(struct);

        // Ensure it marshals back to a valid dispute resolver
        expect(disputeResolver.isValid()).to.be.true;
      });
    });
  });
});
