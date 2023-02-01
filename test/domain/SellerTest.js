const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");
const Seller = require("../../scripts/domain/Seller");

/**
 *  Test the Seller domain entity
 */
describe("Seller", function () {
  // Suite-wide scope
  let seller, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
  let accounts, id, assistant, admin, clerk, treasury, active;

  beforeEach(async function () {
    // Get a list of accounts
    accounts = await ethers.getSigners();
    assistant = accounts[0].address;
    admin = accounts[1].address;
    clerk = accounts[2].address;
    treasury = accounts[3].address;

    // Required constructor params
    id = "78";
    active = true;
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated Seller instance", async function () {
      // Create a valid seller
      seller = new Seller(id, assistant, admin, clerk, treasury, active);
      expect(seller.idIsValid()).is.true;
      expect(seller.assistantIsValid()).is.true;
      expect(seller.adminIsValid()).is.true;
      expect(seller.clerkIsValid()).is.true;
      expect(seller.treasuryIsValid()).is.true;
      expect(seller.activeIsValid()).is.true;
      expect(seller.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create a valid seller, then set fields in tests directly
      seller = new Seller(id, assistant, admin, clerk, treasury, active);
      expect(seller.isValid()).is.true;
    });

    it("Always present, id must be the string representation of a BigNumber", async function () {
      // Invalid field value
      seller.id = "zedzdeadbaby";
      expect(seller.idIsValid()).is.false;
      expect(seller.isValid()).is.false;

      // Invalid field value
      seller.id = new Date();
      expect(seller.idIsValid()).is.false;
      expect(seller.isValid()).is.false;

      // Invalid field value
      seller.id = 12;
      expect(seller.idIsValid()).is.false;
      expect(seller.isValid()).is.false;

      // Valid field value
      seller.id = "0";
      expect(seller.idIsValid()).is.true;
      expect(seller.isValid()).is.true;

      // Valid field value
      seller.id = "126";
      expect(seller.idIsValid()).is.true;
      expect(seller.isValid()).is.true;
    });

    it("Always present, assistant must be a string representation of an EIP-55 compliant address", async function () {
      // Invalid field value
      seller.assistant = "0xASFADF";
      expect(seller.assistantIsValid()).is.false;
      expect(seller.isValid()).is.false;

      // Invalid field value
      seller.assistant = "zedzdeadbaby";
      expect(seller.assistantIsValid()).is.false;
      expect(seller.isValid()).is.false;

      // Valid field value
      seller.assistant = accounts[0].address;
      expect(seller.assistantIsValid()).is.true;
      expect(seller.isValid()).is.true;

      // Valid field value
      seller.assistant = "0xec2fd5bd6fc7b576dae82c0b9640969d8de501a2";
      expect(seller.assistantIsValid()).is.true;
      expect(seller.isValid()).is.true;
    });

    it("Always present, admin must be a string representation of an EIP-55 compliant address", async function () {
      // Invalid field value
      seller.admin = "0xASFADF";
      expect(seller.adminIsValid()).is.false;
      expect(seller.isValid()).is.false;

      // Invalid field value
      seller.admin = "zedzdeadbaby";
      expect(seller.adminIsValid()).is.false;
      expect(seller.isValid()).is.false;

      // Valid field value
      seller.admin = accounts[0].address;
      expect(seller.adminIsValid()).is.true;
      expect(seller.isValid()).is.true;

      // Valid field value
      seller.admin = "0xec2fd5bd6fc7b576dae82c0b9640969d8de501a2";
      expect(seller.adminIsValid()).is.true;
      expect(seller.isValid()).is.true;
    });

    it("Always present, clerk must be a string representation of an EIP-55 compliant address", async function () {
      // Invalid field value
      seller.clerk = "0xASFADF";
      expect(seller.clerkIsValid()).is.false;
      expect(seller.isValid()).is.false;

      // Invalid field value
      seller.clerk = "zedzdeadbaby";
      expect(seller.clerkIsValid()).is.false;
      expect(seller.isValid()).is.false;

      // Valid field value
      seller.clerk = accounts[0].address;
      expect(seller.clerkIsValid()).is.true;
      expect(seller.isValid()).is.true;

      // Valid field value
      seller.clerk = "0xec2fd5bd6fc7b576dae82c0b9640969d8de501a2";
      expect(seller.clerkIsValid()).is.true;
      expect(seller.isValid()).is.true;
    });

    it("Always present, treasury must be a string representation of an EIP-55 compliant address", async function () {
      // Invalid field value
      seller.treasury = "0xASFADF";
      expect(seller.treasuryIsValid()).is.false;
      expect(seller.isValid()).is.false;

      // Invalid field value
      seller.treasury = "zedzdeadbaby";
      expect(seller.treasuryIsValid()).is.false;
      expect(seller.isValid()).is.false;

      // Valid field value
      seller.treasury = accounts[0].address;
      expect(seller.treasuryIsValid()).is.true;
      expect(seller.isValid()).is.true;

      // Valid field value
      seller.treasury = "0xec2fd5bd6fc7b576dae82c0b9640969d8de501a2";
      expect(seller.treasuryIsValid()).is.true;
      expect(seller.isValid()).is.true;
    });

    it("Always present, active must be a boolean", async function () {
      // Invalid field value
      seller.active = 12;
      expect(seller.activeIsValid()).is.false;
      expect(seller.isValid()).is.false;

      // Invalid field value
      seller.active = "zedzdeadbaby";
      expect(seller.activeIsValid()).is.false;
      expect(seller.isValid()).is.false;

      // Valid field value
      seller.active = false;
      expect(seller.activeIsValid()).is.true;
      expect(seller.isValid()).is.true;

      // Valid field value
      seller.active = true;
      expect(seller.activeIsValid()).is.true;
      expect(seller.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create a valid seller, then set fields in tests directly
      seller = new Seller(id, assistant, admin, clerk, treasury, active);
      expect(seller.isValid()).is.true;

      // Get plain object
      object = {
        id,
        assistant,
        admin,
        clerk,
        treasury,
        active,
      };

      // Struct representation
      struct = [id, assistant, admin, clerk, treasury, active];
    });

    context("👉 Static", async function () {
      it("Seller.fromObject() should return a Seller instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = Seller.fromObject(object);

        // Is a Seller instance
        expect(promoted instanceof Seller).is.true;

        // Key values all match
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("Seller.fromStruct() should return a Seller instance from a struct representation", async function () {
        // Get struct from instance
        seller = Seller.fromStruct(struct);

        // Ensure it is valid
        expect(seller.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the Seller instance", async function () {
        dehydrated = seller.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.clone() should return another Seller instance with the same property values", async function () {
        // Get plain object
        clone = seller.clone();

        // Is a Seller instance
        expect(clone instanceof Seller).is.true;

        // Key values all match
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the Seller instance", async function () {
        // Get plain object
        object = seller.toObject();

        // Not a Seller instance
        expect(object instanceof Seller).is.false;

        // Key values all match
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toStruct() should return a struct representation of the Seller instance", async function () {
        // Get struct from seller
        struct = seller.toStruct();

        // Marshal back to a seller instance
        seller = Seller.fromStruct(struct);

        // Ensure it marshals back to a valid seller
        expect(seller.isValid()).to.be.true;
      });
    });
  });
});
