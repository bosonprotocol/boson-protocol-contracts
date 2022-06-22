const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");
const MetaTxDisputeResolutionDetails = require("../../scripts/domain/MetaTxDisputeResolutionDetails.js");

/**
 *  Test the MetaTxDisputeResolutionDetails domain entity
 */
describe("MetaTxDisputeResolutionDetails", function () {
  // Suite-wide scope
  let metaTxDisputeResolutionDetails, object, struct, promoted, clone, dehydrated, rehydrated, key, value;
  let exchangeId, buyerPercent, sigR, sigS, sigV;

  beforeEach(async function () {
    // Required constructor params
    exchangeId = "90125";
    buyerPercent = "1234";
    sigR = ethers.utils.formatBytes32String("test");
    sigS = ethers.utils.formatBytes32String("test");
    sigV = "27";
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated MetaTxDisputeResolutionDetails instance", async function () {
      metaTxDisputeResolutionDetails = new MetaTxDisputeResolutionDetails(exchangeId, buyerPercent, sigR, sigS, sigV);
      expect(metaTxDisputeResolutionDetails.exchangeIdIsValid()).is.true;
      expect(metaTxDisputeResolutionDetails.buyerPercentIsValid()).is.true;
      expect(metaTxDisputeResolutionDetails.sigRIsValid()).is.true;
      expect(metaTxDisputeResolutionDetails.sigSIsValid()).is.true;
      expect(metaTxDisputeResolutionDetails.sigVIsValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create a valid MetaTxDisputeResolutionDetails, then set fields in tests directly
      metaTxDisputeResolutionDetails = new MetaTxDisputeResolutionDetails(exchangeId, buyerPercent, sigR, sigS, sigV);
      expect(metaTxDisputeResolutionDetails.isValid()).is.true;
    });

    it("Always present, exchangeId must be the string representation of a BigNumber", async function () {
      // Invalid field value
      metaTxDisputeResolutionDetails.exchangeId = "zedzdeadbaby";
      expect(metaTxDisputeResolutionDetails.exchangeIdIsValid()).is.false;
      expect(metaTxDisputeResolutionDetails.isValid()).is.false;

      // Invalid field value
      metaTxDisputeResolutionDetails.exchangeId = new Date();
      expect(metaTxDisputeResolutionDetails.exchangeIdIsValid()).is.false;
      expect(metaTxDisputeResolutionDetails.isValid()).is.false;

      // Invalid field value
      metaTxDisputeResolutionDetails.exchangeId = 12;
      expect(metaTxDisputeResolutionDetails.exchangeIdIsValid()).is.false;
      expect(metaTxDisputeResolutionDetails.isValid()).is.false;

      // Valid field value
      metaTxDisputeResolutionDetails.exchangeId = "0";
      expect(metaTxDisputeResolutionDetails.exchangeIdIsValid()).is.true;
      expect(metaTxDisputeResolutionDetails.isValid()).is.true;

      // Valid field value
      metaTxDisputeResolutionDetails.exchangeId = "126";
      expect(metaTxDisputeResolutionDetails.exchangeIdIsValid()).is.true;
      expect(metaTxDisputeResolutionDetails.isValid()).is.true;
    });

    it("Always present, buyerPercent must be the string representation of a BigNumber", async function () {
      // Invalid field value
      metaTxDisputeResolutionDetails.buyerPercent = "zedzdeadbaby";
      expect(metaTxDisputeResolutionDetails.buyerPercentIsValid()).is.false;
      expect(metaTxDisputeResolutionDetails.isValid()).is.false;

      // Invalid field value
      metaTxDisputeResolutionDetails.buyerPercent = new Date();
      expect(metaTxDisputeResolutionDetails.buyerPercentIsValid()).is.false;
      expect(metaTxDisputeResolutionDetails.isValid()).is.false;

      // Invalid field value
      metaTxDisputeResolutionDetails.buyerPercent = 12;
      expect(metaTxDisputeResolutionDetails.buyerPercentIsValid()).is.false;
      expect(metaTxDisputeResolutionDetails.isValid()).is.false;

      // Valid field value
      metaTxDisputeResolutionDetails.buyerPercent = "0";
      expect(metaTxDisputeResolutionDetails.buyerPercentIsValid()).is.true;
      expect(metaTxDisputeResolutionDetails.isValid()).is.true;

      // Valid field value
      metaTxDisputeResolutionDetails.buyerPercent = "126";
      expect(metaTxDisputeResolutionDetails.buyerPercentIsValid()).is.true;
      expect(metaTxDisputeResolutionDetails.isValid()).is.true;
    });

    it("Always present, sigR must be the string representation of a bytes32", async function () {
      // Invalid field value
      metaTxDisputeResolutionDetails.sigR = "zedzdeadbaby";
      expect(metaTxDisputeResolutionDetails.sigRIsValid()).is.false;
      expect(metaTxDisputeResolutionDetails.isValid()).is.false;

      // Invalid field value
      metaTxDisputeResolutionDetails.sigR = new Date();
      expect(metaTxDisputeResolutionDetails.sigRIsValid()).is.false;
      expect(metaTxDisputeResolutionDetails.isValid()).is.false;

      // Invalid field value
      metaTxDisputeResolutionDetails.sigR = 12;
      expect(metaTxDisputeResolutionDetails.sigRIsValid()).is.false;
      expect(metaTxDisputeResolutionDetails.isValid()).is.false;

      // Invalid field value
      metaTxDisputeResolutionDetails.sigR = "0x74657374";
      expect(metaTxDisputeResolutionDetails.sigRIsValid()).is.false;
      expect(metaTxDisputeResolutionDetails.isValid()).is.false;

      // Valid field value
      metaTxDisputeResolutionDetails.sigR = "0x7465737400000000000000000000000000000000000000000000000000000000";
      expect(metaTxDisputeResolutionDetails.sigRIsValid()).is.true;
      expect(metaTxDisputeResolutionDetails.isValid()).is.true;
    });

    it("Always present, sigS must be the string representation of a bytes32", async function () {
      // Invalid field value
      metaTxDisputeResolutionDetails.sigS = "zedzdeadbaby";
      expect(metaTxDisputeResolutionDetails.sigSIsValid()).is.false;
      expect(metaTxDisputeResolutionDetails.isValid()).is.false;

      // Invalid field value
      metaTxDisputeResolutionDetails.sigS = new Date();
      expect(metaTxDisputeResolutionDetails.sigSIsValid()).is.false;
      expect(metaTxDisputeResolutionDetails.isValid()).is.false;

      // Invalid field value
      metaTxDisputeResolutionDetails.sigS = 12;
      expect(metaTxDisputeResolutionDetails.sigSIsValid()).is.false;
      expect(metaTxDisputeResolutionDetails.isValid()).is.false;

      // Invalid field value
      metaTxDisputeResolutionDetails.sigS = "0x74657374";
      expect(metaTxDisputeResolutionDetails.sigSIsValid()).is.false;
      expect(metaTxDisputeResolutionDetails.isValid()).is.false;

      // Valid field value
      metaTxDisputeResolutionDetails.sigS = "0x7465737400000000000000000000000000000000000000000000000000000000";
      expect(metaTxDisputeResolutionDetails.sigSIsValid()).is.true;
      expect(metaTxDisputeResolutionDetails.isValid()).is.true;
    });

    it("Always present, sigV must be the string representation of a BigNumber between 0 and 255", async function () {
      // Invalid field value
      metaTxDisputeResolutionDetails.sigV = "zedzdeadbaby";
      expect(metaTxDisputeResolutionDetails.sigVIsValid()).is.false;
      expect(metaTxDisputeResolutionDetails.isValid()).is.false;

      // Invalid field value
      metaTxDisputeResolutionDetails.sigV = new Date();
      expect(metaTxDisputeResolutionDetails.sigVIsValid()).is.false;
      expect(metaTxDisputeResolutionDetails.isValid()).is.false;

      // Invalid field value
      metaTxDisputeResolutionDetails.sigV = 12;
      expect(metaTxDisputeResolutionDetails.sigVIsValid()).is.false;
      expect(metaTxDisputeResolutionDetails.isValid()).is.false;

      // Invalid field value
      metaTxDisputeResolutionDetails.sigV = "256";
      expect(metaTxDisputeResolutionDetails.sigVIsValid()).is.false;
      expect(metaTxDisputeResolutionDetails.isValid()).is.false;

      // Valid field value
      metaTxDisputeResolutionDetails.sigV = "0";
      expect(metaTxDisputeResolutionDetails.sigVIsValid()).is.true;
      expect(metaTxDisputeResolutionDetails.isValid()).is.true;

      // Valid field value
      metaTxDisputeResolutionDetails.sigV = "255";
      expect(metaTxDisputeResolutionDetails.sigVIsValid()).is.true;
      expect(metaTxDisputeResolutionDetails.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create a valid metaTxDisputeResolutionDetails, then set fields in tests directly
      metaTxDisputeResolutionDetails = new MetaTxDisputeResolutionDetails(exchangeId, buyerPercent, sigR, sigS, sigV);
      expect(metaTxDisputeResolutionDetails.isValid()).is.true;

      // Get plain object
      object = {
        exchangeId,
        buyerPercent,
        sigR,
        sigS,
        sigV,
      };

      // Struct representation
      struct = [exchangeId, buyerPercent, sigR, sigS, sigV];
    });

    context("👉 Static", async function () {
      it("MetaTxDisputeResolutionDetails.fromObject() should return a MetaTxDisputeResolutionDetails instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = MetaTxDisputeResolutionDetails.fromObject(object);

        // Is a MetaTxDisputeResolutionDetails instance
        expect(promoted instanceof MetaTxDisputeResolutionDetails).is.true;

        // Key values all match
        for ([key, value] of Object.entries(metaTxDisputeResolutionDetails)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("MetaTxDisputeResolutionDetails.fromStruct() should return a MetaTxDisputeResolutionDetails instance with the same values as the given struct", async function () {
        // Get condition from struct
        metaTxDisputeResolutionDetails = MetaTxDisputeResolutionDetails.fromStruct(struct);

        // Ensure it marshals back to a valid metaTxDisputeResolutionDetails
        expect(metaTxDisputeResolutionDetails.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the MetaTxDisputeResolutionDetails instance", async function () {
        dehydrated = metaTxDisputeResolutionDetails.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(metaTxDisputeResolutionDetails)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the MetaTxDisputeResolutionDetails instance", async function () {
        // Get plain object
        object = metaTxDisputeResolutionDetails.toObject();

        // Not an MetaTxDisputeResolutionDetails instance
        expect(object instanceof MetaTxDisputeResolutionDetails).is.false;

        // Key values all match
        for ([key, value] of Object.entries(metaTxDisputeResolutionDetails)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("MetaTxDisputeResolutionDetails.toStruct() should return a struct representation of the MetaTxDisputeResolutionDetails instance", async function () {
        // Get struct from metaTxDisputeResolutionDetails
        struct = metaTxDisputeResolutionDetails.toStruct();

        // Marshal back to a metaTxDisputeResolutionDetails instance
        metaTxDisputeResolutionDetails = MetaTxDisputeResolutionDetails.fromStruct(struct);

        // Ensure it marshals back to a valid metaTxDisputeResolutionDetails
        expect(metaTxDisputeResolutionDetails.isValid()).to.be.true;
      });

      it("instance.clone() should return another MetaTxDisputeResolutionDetails instance with the same property values", async function () {
        // Get plain object
        clone = metaTxDisputeResolutionDetails.clone();

        // Is an MetaTxDisputeResolutionDetails instance
        expect(clone instanceof MetaTxDisputeResolutionDetails).is.true;

        // Key values all match
        for ([key, value] of Object.entries(metaTxDisputeResolutionDetails)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });
    });
  });
});
