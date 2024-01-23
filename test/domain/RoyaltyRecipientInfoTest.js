const { ethers } = require("hardhat");
const { expect } = require("chai");
const { RoyaltyRecipientInfo } = require("../../scripts/domain/RoyaltyRecipientInfo");

/**
 *  Test the RoyaltyRecipientInfo domain entity
 */
describe("RoyaltyRecipientInfo", function () {
  // Suite-wide scope
  let royaltyRecipientInfo, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
  let accounts, wallet, minRoyaltyPercentage;

  beforeEach(async function () {
    // Get a list of accounts
    accounts = await ethers.getSigners();
    wallet = accounts[0].address;

    // Required constructor params
    minRoyaltyPercentage = "2000";
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated RoyaltyRecipientInfo instance", async function () {
      // Create a valid royalty recipients
      royaltyRecipientInfo = new RoyaltyRecipientInfo(wallet, minRoyaltyPercentage);
      expect(royaltyRecipientInfo.walletIsValid()).is.true;
      expect(royaltyRecipientInfo.minRoyaltyPercentageIsValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create a valid royalty recipients, then set fields in tests directly
      royaltyRecipientInfo = new RoyaltyRecipientInfo(wallet, minRoyaltyPercentage);
      expect(royaltyRecipientInfo.isValid()).is.true;
    });

    it("Always present, wallet must be a string representation of an EIP-55 compliant address", async function () {
      // Invalid field value
      royaltyRecipientInfo.wallet = "0xASFADF";
      expect(royaltyRecipientInfo.walletIsValid()).is.false;
      expect(royaltyRecipientInfo.isValid()).is.false;

      // Invalid field value
      royaltyRecipientInfo.wallet = "zedzdeadbaby";
      expect(royaltyRecipientInfo.walletIsValid()).is.false;
      expect(royaltyRecipientInfo.isValid()).is.false;

      // Valid field value
      royaltyRecipientInfo.wallet = accounts[0].address;
      expect(royaltyRecipientInfo.walletIsValid()).is.true;
      expect(royaltyRecipientInfo.isValid()).is.true;

      // Valid field value
      royaltyRecipientInfo.wallet = "0xec2fd5bd6fc7b576dae82c0b9640969d8de501a2";
      expect(royaltyRecipientInfo.walletIsValid()).is.true;
      expect(royaltyRecipientInfo.isValid()).is.true;
    });

    it("Always present, minRoyaltyPercentage must be the string representation of a BigNumber", async function () {
      // Invalid field value
      royaltyRecipientInfo.minRoyaltyPercentage = "zedzdeadbaby";
      expect(royaltyRecipientInfo.minRoyaltyPercentageIsValid()).is.false;
      expect(royaltyRecipientInfo.isValid()).is.false;

      // Invalid field value
      royaltyRecipientInfo.minRoyaltyPercentage = new Date();
      expect(royaltyRecipientInfo.minRoyaltyPercentageIsValid()).is.false;
      expect(royaltyRecipientInfo.isValid()).is.false;

      // Invalid field value
      royaltyRecipientInfo.minRoyaltyPercentage = 12;
      expect(royaltyRecipientInfo.minRoyaltyPercentageIsValid()).is.false;
      expect(royaltyRecipientInfo.isValid()).is.false;

      // Valid field value
      royaltyRecipientInfo.minRoyaltyPercentage = "0";
      expect(royaltyRecipientInfo.minRoyaltyPercentageIsValid()).is.true;
      expect(royaltyRecipientInfo.isValid()).is.true;

      // Valid field value
      royaltyRecipientInfo.minRoyaltyPercentage = "126";
      expect(royaltyRecipientInfo.minRoyaltyPercentageIsValid()).is.true;
      expect(royaltyRecipientInfo.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create a valid royalty recipients, then set fields in tests directly
      royaltyRecipientInfo = new RoyaltyRecipientInfo(wallet, minRoyaltyPercentage);
      expect(royaltyRecipientInfo.isValid()).is.true;

      // Get plain object
      object = {
        wallet,
        minRoyaltyPercentage,
      };

      // Struct representation
      struct = [wallet, minRoyaltyPercentage];
    });

    context("👉 Static", async function () {
      it("RoyaltyRecipientInfo.fromObject() should return a RoyaltyRecipientInfo instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = RoyaltyRecipientInfo.fromObject(object);

        // Is a RoyaltyRecipientInfo instance
        expect(promoted instanceof RoyaltyRecipientInfo).is.true;

        // Key values all match
        for ([key, value] of Object.entries(royaltyRecipientInfo)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("RoyaltyRecipientInfo.fromStruct() should return a RoyaltyRecipientInfo instance from a struct representation", async function () {
        // Get struct from instance
        royaltyRecipientInfo = RoyaltyRecipientInfo.fromStruct(struct);

        // Ensure it is valid
        expect(royaltyRecipientInfo.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the RoyaltyRecipientInfo instance", async function () {
        dehydrated = royaltyRecipientInfo.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(royaltyRecipientInfo)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.clone() should return another RoyaltyRecipientInfo instance with the same property values", async function () {
        // Get plain object
        clone = royaltyRecipientInfo.clone();

        // Is a RoyaltyRecipientInfo instance
        expect(clone instanceof RoyaltyRecipientInfo).is.true;

        // Key values all match
        for ([key, value] of Object.entries(royaltyRecipientInfo)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the RoyaltyRecipientInfo instance", async function () {
        // Get plain object
        object = royaltyRecipientInfo.toObject();

        // Not a RoyaltyRecipientInfo instance
        expect(object instanceof RoyaltyRecipientInfo).is.false;

        // Key values all match
        for ([key, value] of Object.entries(royaltyRecipientInfo)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toStruct() should return a struct representation of the RoyaltyRecipientInfo instance", async function () {
        // Get struct from royalty recipients
        struct = royaltyRecipientInfo.toStruct();

        // Marshal back to a royalty recipients instance
        royaltyRecipientInfo = RoyaltyRecipientInfo.fromStruct(struct);

        // Ensure it marshals back to a valid royalty recipients
        expect(royaltyRecipientInfo.isValid()).to.be.true;
      });
    });
  });
});
