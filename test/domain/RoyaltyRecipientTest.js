const { ethers } = require("hardhat");
const { expect } = require("chai");
const { RoyaltyRecipient } = require("../../scripts/domain/RoyaltyRecipient");

/**
 *  Test the RoyaltyRecipient domain entity
 */
describe("RoyaltyRecipient", function () {
  // Suite-wide scope
  let royaltyRecipient, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
  let accounts, wallet, minRoyaltyPercentage, externalId;

  beforeEach(async function () {
    // Get a list of accounts
    accounts = await ethers.getSigners();
    wallet = accounts[0].address;

    // Required constructor params
    minRoyaltyPercentage = "2000";
    externalId = `https://ipfs.io/ipfs/royaltyRecipient1`;
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated RoyaltyRecipient instance", async function () {
      // Create a valid royalty recipients
      royaltyRecipient = new RoyaltyRecipient(wallet, minRoyaltyPercentage, externalId);
      expect(royaltyRecipient.walletIsValid()).is.true;
      expect(royaltyRecipient.minRoyaltyPercentageIsValid()).is.true;
      expect(royaltyRecipient.externalIdIsValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create a valid royalty recipients, then set fields in tests directly
      royaltyRecipient = new RoyaltyRecipient(wallet, minRoyaltyPercentage, externalId);
      expect(royaltyRecipient.isValid()).is.true;
    });

    it("Always present, wallet must be a string representation of an EIP-55 compliant address", async function () {
      // Invalid field value
      royaltyRecipient.wallet = "0xASFADF";
      expect(royaltyRecipient.walletIsValid()).is.false;
      expect(royaltyRecipient.isValid()).is.false;

      // Invalid field value
      royaltyRecipient.wallet = "zedzdeadbaby";
      expect(royaltyRecipient.walletIsValid()).is.false;
      expect(royaltyRecipient.isValid()).is.false;

      // Valid field value
      royaltyRecipient.wallet = accounts[0].address;
      expect(royaltyRecipient.walletIsValid()).is.true;
      expect(royaltyRecipient.isValid()).is.true;

      // Valid field value
      royaltyRecipient.wallet = "0xec2fd5bd6fc7b576dae82c0b9640969d8de501a2";
      expect(royaltyRecipient.walletIsValid()).is.true;
      expect(royaltyRecipient.isValid()).is.true;
    });

    it("Always present, minRoyaltyPercentage must be the string representation of a BigNumber", async function () {
      // Invalid field value
      royaltyRecipient.minRoyaltyPercentage = "zedzdeadbaby";
      expect(royaltyRecipient.minRoyaltyPercentageIsValid()).is.false;
      expect(royaltyRecipient.isValid()).is.false;

      // Invalid field value
      royaltyRecipient.minRoyaltyPercentage = new Date();
      expect(royaltyRecipient.minRoyaltyPercentageIsValid()).is.false;
      expect(royaltyRecipient.isValid()).is.false;

      // Invalid field value
      royaltyRecipient.minRoyaltyPercentage = 12;
      expect(royaltyRecipient.minRoyaltyPercentageIsValid()).is.false;
      expect(royaltyRecipient.isValid()).is.false;

      // Valid field value
      royaltyRecipient.minRoyaltyPercentage = "0";
      expect(royaltyRecipient.minRoyaltyPercentageIsValid()).is.true;
      expect(royaltyRecipient.isValid()).is.true;

      // Valid field value
      royaltyRecipient.minRoyaltyPercentage = "126";
      expect(royaltyRecipient.minRoyaltyPercentageIsValid()).is.true;
      expect(royaltyRecipient.isValid()).is.true;
    });

    it("Always present, externalId must be a non-empty string", async function () {
      // Invalid field value
      royaltyRecipient.externalId = 12;
      expect(royaltyRecipient.externalIdIsValid()).is.false;
      expect(royaltyRecipient.isValid()).is.false;

      // Valid field value
      royaltyRecipient.externalId = "zedzdeadbaby";
      expect(royaltyRecipient.externalIdIsValid()).is.true;
      expect(royaltyRecipient.isValid()).is.true;

      // Valid field value
      royaltyRecipient.externalId = "https://ipfs.io/ipfs/QmYXc12ov6F2MZVZwPs5XeCBbf61cW3wKRk8h3D5NTYj4T";
      expect(royaltyRecipient.externalIdIsValid()).is.true;
      expect(royaltyRecipient.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create a valid royalty recipients, then set fields in tests directly
      royaltyRecipient = new RoyaltyRecipient(wallet, minRoyaltyPercentage, externalId);
      expect(royaltyRecipient.isValid()).is.true;

      // Get plain object
      object = {
        wallet,
        minRoyaltyPercentage,
        externalId,
      };

      // Struct representation
      struct = [wallet, minRoyaltyPercentage, externalId];
    });

    context("👉 Static", async function () {
      it("RoyaltyRecipient.fromObject() should return a RoyaltyRecipient instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = RoyaltyRecipient.fromObject(object);

        // Is a RoyaltyRecipient instance
        expect(promoted instanceof RoyaltyRecipient).is.true;

        // Key values all match
        for ([key, value] of Object.entries(royaltyRecipient)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("RoyaltyRecipient.fromStruct() should return a RoyaltyRecipient instance from a struct representation", async function () {
        // Get struct from instance
        royaltyRecipient = RoyaltyRecipient.fromStruct(struct);

        // Ensure it is valid
        expect(royaltyRecipient.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the RoyaltyRecipient instance", async function () {
        dehydrated = royaltyRecipient.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(royaltyRecipient)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.clone() should return another RoyaltyRecipient instance with the same property values", async function () {
        // Get plain object
        clone = royaltyRecipient.clone();

        // Is a RoyaltyRecipient instance
        expect(clone instanceof RoyaltyRecipient).is.true;

        // Key values all match
        for ([key, value] of Object.entries(royaltyRecipient)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the RoyaltyRecipient instance", async function () {
        // Get plain object
        object = royaltyRecipient.toObject();

        // Not a RoyaltyRecipient instance
        expect(object instanceof RoyaltyRecipient).is.false;

        // Key values all match
        for ([key, value] of Object.entries(royaltyRecipient)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toStruct() should return a struct representation of the RoyaltyRecipient instance", async function () {
        // Get struct from royalty recipients
        struct = royaltyRecipient.toStruct();

        // Marshal back to a royalty recipients instance
        royaltyRecipient = RoyaltyRecipient.fromStruct(struct);

        // Ensure it marshals back to a valid royalty recipients
        expect(royaltyRecipient.isValid()).to.be.true;
      });
    });
  });
});
