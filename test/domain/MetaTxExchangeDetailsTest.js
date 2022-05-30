const { expect } = require("chai");
const MetaTxExchangeDetails = require("../../scripts/domain/MetaTxExchangeDetails");

/**
 *  Test the MetaTxExchangeDetails domain entity
 */
describe("MetaTxExchangeDetails", function () {
  // Suite-wide scope
  let exchangeDetails, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
  let exchangeId;

  beforeEach(async function () {
    // Required constructor params
    exchangeId = "1";
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated MetaTxExchangeDetails instance", async function () {
      // Create a valid exchangeDetails, then set fields in tests directly
      exchangeDetails = new MetaTxExchangeDetails(exchangeId);
      expect(exchangeDetails.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create a valid exchangeDetails, then set fields in tests directly
      exchangeDetails = new MetaTxExchangeDetails(exchangeId);
      expect(exchangeDetails.isValid()).is.true;
    });

    it("Always present, exchangeId must be the string representation of a BigNumber", async function () {
      // Invalid field value
      exchangeDetails.exchangeId = "zedzdeadbaby";
      expect(exchangeDetails.exchangeIdIsValid()).is.false;
      expect(exchangeDetails.isValid()).is.false;

      // Invalid field value
      exchangeDetails.exchangeId = new Date();
      expect(exchangeDetails.exchangeIdIsValid()).is.false;
      expect(exchangeDetails.isValid()).is.false;

      // Invalid field value
      exchangeDetails.exchangeId = 12;
      expect(exchangeDetails.exchangeIdIsValid()).is.false;
      expect(exchangeDetails.isValid()).is.false;

      // Valid field value
      exchangeDetails.exchangeId = "0";
      expect(exchangeDetails.exchangeIdIsValid()).is.true;
      expect(exchangeDetails.isValid()).is.true;

      // Valid field value
      exchangeDetails.exchangeId = "126";
      expect(exchangeDetails.exchangeIdIsValid()).is.true;
      expect(exchangeDetails.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create a valid exchangeDetails, then set fields in tests directly
      exchangeDetails = new MetaTxExchangeDetails(exchangeId);
      expect(exchangeDetails.isValid()).is.true;

      // Create plain object
      object = {
        exchangeId,
      };
    });

    context("👉 Static", async function () {
      it("MetaTxExchangeDetails.fromObject() should return a MetaTxExchangeDetails instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = MetaTxExchangeDetails.fromObject(object);

        // Is a MetaTxExchangeDetails instance
        expect(promoted instanceof MetaTxExchangeDetails).is.true;

        // Key values all match
        for ([key, value] of Object.entries(exchangeDetails)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("MetaTxExchangeDetails.fromStruct() should return a MetaTxExchangeDetails instance with the same values as the given struct", async function () {
        struct = [exchangeDetails.exchangeId];

        // Get struct
        exchangeDetails = MetaTxExchangeDetails.fromStruct(struct);

        // Ensure it marshals back to a valid exchangeDetails
        expect(exchangeDetails.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the MetaTxExchangeDetails instance", async function () {
        dehydrated = exchangeDetails.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(exchangeDetails)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the MetaTxExchangeDetails instance", async function () {
        // Get plain object
        object = exchangeDetails.toObject();

        // Not an MetaTxExchangeDetails instance
        expect(object instanceof MetaTxExchangeDetails).is.false;

        // Key values all match
        for ([key, value] of Object.entries(exchangeDetails)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("MetaTxExchangeDetails.toStruct() should return a struct representation of the MetaTxExchangeDetails instance", async function () {
        // Get struct from exchangeDetails
        struct = exchangeDetails.toStruct();

        // Marshal back to an exchangeDetails instance
        exchangeDetails = MetaTxExchangeDetails.fromStruct(struct);

        // Ensure it marshals back to a valid exchangeDetails
        expect(exchangeDetails.isValid()).to.be.true;
      });

      it("instance.clone() should return another MetaTxExchangeDetails instance with the same property values", async function () {
        // Get plain object
        clone = exchangeDetails.clone();

        // Is an MetaTxExchangeDetails instance
        expect(clone instanceof MetaTxExchangeDetails).is.true;

        // Key values all match
        for ([key, value] of Object.entries(exchangeDetails)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });
    });
  });
});
