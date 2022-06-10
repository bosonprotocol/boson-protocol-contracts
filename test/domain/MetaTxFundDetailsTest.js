const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");
const MetaTxFundDetails = require("../../scripts/domain/MetaTxFundDetails.js");

/**
 *  Test the MetaTxFundDetails domain entity
 */
describe("MetaTxFundDetails", function () {
  // Suite-wide scope
  let metaTxFundDetails, accounts, object, struct, promoted, clone, dehydrated, rehydrated, key, value;
  let entityId, tokenList, tokenAmounts;

  beforeEach(async function () {
    accounts = await ethers.getSigners();
    // Required constructor params
    entityId = "90125";
    tokenList = accounts[1].address;
    tokenAmounts = "100";
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated MetaTxFundDetails instance", async function () {
      metaTxFundDetails = new MetaTxFundDetails(entityId, [tokenList], [tokenAmounts]);
      expect(metaTxFundDetails.entityIdIsValid()).is.true;
      expect(metaTxFundDetails.tokenListIsValid()).is.true;
      expect(metaTxFundDetails.tokenAmountsIsValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create a valid metaTxFundDetails, then set fields in tests directly
      metaTxFundDetails = new MetaTxFundDetails(entityId, [tokenList], [tokenAmounts]);
      expect(metaTxFundDetails.isValid()).is.true;
    });

    it("Always present, entityId must be the string representation of a BigNumber", async function () {
      // Invalid field value
      metaTxFundDetails.entityId = "zedzdeadbaby";
      expect(metaTxFundDetails.entityIdIsValid()).is.false;
      expect(metaTxFundDetails.isValid()).is.false;

      // Invalid field value
      metaTxFundDetails.entityId = new Date();
      expect(metaTxFundDetails.entityIdIsValid()).is.false;
      expect(metaTxFundDetails.isValid()).is.false;

      // Invalid field value
      metaTxFundDetails.entityId = 12;
      expect(metaTxFundDetails.entityIdIsValid()).is.false;
      expect(metaTxFundDetails.isValid()).is.false;

      // Valid field value
      metaTxFundDetails.entityId = "0";
      expect(metaTxFundDetails.entityIdIsValid()).is.true;
      expect(metaTxFundDetails.isValid()).is.true;

      // Valid field value
      metaTxFundDetails.entityId = "126";
      expect(metaTxFundDetails.entityIdIsValid()).is.true;
      expect(metaTxFundDetails.isValid()).is.true;
    });

    it("Always present, tokenList must be the array containing string representation of a BigNumber", async function () {
      // Invalid field value
      metaTxFundDetails.tokenList = "zedzdeadbaby";
      expect(metaTxFundDetails.tokenListIsValid()).is.false;
      expect(metaTxFundDetails.isValid()).is.false;

      // Invalid field value
      metaTxFundDetails.tokenList = new Date();
      expect(metaTxFundDetails.tokenListIsValid()).is.false;
      expect(metaTxFundDetails.isValid()).is.false;

      // Invalid field value
      metaTxFundDetails.tokenList = 12;
      expect(metaTxFundDetails.tokenListIsValid()).is.false;
      expect(metaTxFundDetails.isValid()).is.false;

      // Valid field value
      metaTxFundDetails.tokenList = [accounts[0].address, "0xec2fd5bd6fc7b576dae82c0b9640969d8de501a2"];
      expect(metaTxFundDetails.tokenListIsValid()).is.true;
      expect(metaTxFundDetails.isValid()).is.true;

      // Valid field value
      metaTxFundDetails.tokenList = [accounts[0].address];
      expect(metaTxFundDetails.tokenListIsValid()).is.true;
      expect(metaTxFundDetails.isValid()).is.true;

      // Valid field value
      metaTxFundDetails.tokenList = [];
      expect(metaTxFundDetails.tokenListIsValid()).is.true;
      expect(metaTxFundDetails.isValid()).is.true;
    });

    it("Always present, tokenAmounts must be the array containing string representation of a BigNumber", async function () {
      // Invalid field value
      metaTxFundDetails.tokenAmounts = "zedzdeadbaby";
      expect(metaTxFundDetails.tokenAmountsIsValid()).is.false;
      expect(metaTxFundDetails.isValid()).is.false;

      // Invalid field value
      metaTxFundDetails.tokenAmounts = new Date();
      expect(metaTxFundDetails.tokenAmountsIsValid()).is.false;
      expect(metaTxFundDetails.isValid()).is.false;

      // Invalid field value
      metaTxFundDetails.tokenAmounts = 12;
      expect(metaTxFundDetails.tokenAmountsIsValid()).is.false;
      expect(metaTxFundDetails.isValid()).is.false;

      // Valid field value
      metaTxFundDetails.tokenAmounts = ["1", "2"];
      expect(metaTxFundDetails.tokenAmountsIsValid()).is.true;
      expect(metaTxFundDetails.isValid()).is.true;

      // Valid field value
      metaTxFundDetails.tokenAmounts = ["126"];
      expect(metaTxFundDetails.tokenAmountsIsValid()).is.true;
      expect(metaTxFundDetails.isValid()).is.true;

      // Valid field value
      metaTxFundDetails.tokenAmounts = [];
      expect(metaTxFundDetails.tokenAmountsIsValid()).is.true;
      expect(metaTxFundDetails.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create a valid metaTxFundDetails, then set fields in tests directly
      metaTxFundDetails = new MetaTxFundDetails(entityId, [tokenList], [tokenAmounts]);
      expect(metaTxFundDetails.isValid()).is.true;

      // Get plain object
      object = {
        entityId,
        tokenList: [tokenList],
        tokenAmounts: [tokenAmounts],
      };

      // Struct representation
      struct = [entityId, [tokenList], [tokenAmounts]];
    });

    context("👉 Static", async function () {
      it("MetaTxFundDetails.fromObject() should return a MetaTxFundDetails instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = MetaTxFundDetails.fromObject(object);

        // Is a MetaTxFundDetails instance
        expect(promoted instanceof MetaTxFundDetails).is.true;

        // Key values all match
        for ([key, value] of Object.entries(metaTxFundDetails)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("MetaTxFundDetails.fromStruct() should return a MetaTxFundDetails instance with the same values as the given struct", async function () {
        // Get condition from struct
        metaTxFundDetails = MetaTxFundDetails.fromStruct(struct);

        // Ensure it marshals back to a valid metaTxFundDetails
        expect(metaTxFundDetails.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the MetaTxFundDetails instance", async function () {
        dehydrated = metaTxFundDetails.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(metaTxFundDetails)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the MetaTxFundDetails instance", async function () {
        // Get plain object
        object = metaTxFundDetails.toObject();

        // Not an MetaTxFundDetails instance
        expect(object instanceof MetaTxFundDetails).is.false;

        // Key values all match
        for ([key, value] of Object.entries(metaTxFundDetails)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("MetaTxFundDetails.toStruct() should return a struct representation of the MetaTxFundDetails instance", async function () {
        // Get struct from metaTxFundDetails
        struct = metaTxFundDetails.toStruct();

        // Marshal back to a metaTxFundDetails instance
        metaTxFundDetails = MetaTxFundDetails.fromStruct(struct);

        // Ensure it marshals back to a valid metaTxFundDetails
        expect(metaTxFundDetails.isValid()).to.be.true;
      });

      it("instance.clone() should return another MetaTxFundDetails instance with the same property values", async function () {
        // Get plain object
        clone = metaTxFundDetails.clone();

        // Is an MetaTxFundDetails instance
        expect(clone instanceof MetaTxFundDetails).is.true;

        // Key values all match
        for ([key, value] of Object.entries(metaTxFundDetails)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });
    });
  });
});
