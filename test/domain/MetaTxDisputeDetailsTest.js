const { expect } = require("chai");
const MetaTxDisputeDetails = require("../../scripts/domain/MetaTxDisputeDetails.js");

/**
 *  Test the MetaTxDisputeDetails domain entity
 */
describe("MetaTxDisputeDetails", function () {
  // Suite-wide scope
  let metaTxDisputeDetails, object, struct, promoted, clone, dehydrated, rehydrated, key, value;
  let exchangeId, complaint;

  beforeEach(async function () {
    // Required constructor params
    exchangeId = "90125";
    complaint = "Tastes weird";
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated MetaTxDisputeDetails instance", async function () {
      metaTxDisputeDetails = new MetaTxDisputeDetails(exchangeId, complaint);
      expect(metaTxDisputeDetails.exchangeIdIsValid()).is.true;
      expect(metaTxDisputeDetails.complaintIsValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create a valid MetaTxDisputeDetails, then set fields in tests directly
      metaTxDisputeDetails = new MetaTxDisputeDetails(exchangeId, complaint);
      expect(metaTxDisputeDetails.isValid()).is.true;
    });

    it("Always present, exchangeId must be the string representation of a BigNumber", async function () {
      // Invalid field value
      metaTxDisputeDetails.exchangeId = "zedzdeadbaby";
      expect(metaTxDisputeDetails.exchangeIdIsValid()).is.false;
      expect(metaTxDisputeDetails.isValid()).is.false;

      // Invalid field value
      metaTxDisputeDetails.exchangeId = new Date();
      expect(metaTxDisputeDetails.exchangeIdIsValid()).is.false;
      expect(metaTxDisputeDetails.isValid()).is.false;

      // Invalid field value
      metaTxDisputeDetails.exchangeId = 12;
      expect(metaTxDisputeDetails.exchangeIdIsValid()).is.false;
      expect(metaTxDisputeDetails.isValid()).is.false;

      // Valid field value
      metaTxDisputeDetails.exchangeId = "0";
      expect(metaTxDisputeDetails.exchangeIdIsValid()).is.true;
      expect(metaTxDisputeDetails.isValid()).is.true;

      // Valid field value
      metaTxDisputeDetails.exchangeId = "126";
      expect(metaTxDisputeDetails.exchangeIdIsValid()).is.true;
      expect(metaTxDisputeDetails.isValid()).is.true;
    });

    it("Always present, complaint must be a string", async function () {
      // Invalid field value
      metaTxDisputeDetails.complaint = null;
      expect(metaTxDisputeDetails.complaintIsValid()).is.false;
      expect(metaTxDisputeDetails.isValid()).is.false;

      // Invalid field value
      metaTxDisputeDetails.complaint = 12;
      expect(metaTxDisputeDetails.complaintIsValid()).is.false;
      expect(metaTxDisputeDetails.isValid()).is.false;

      // Valid field value
      metaTxDisputeDetails.complaint = "zedzdeadbaby";
      expect(metaTxDisputeDetails.complaintIsValid()).is.true;
      expect(metaTxDisputeDetails.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create a valid metaTxDisputeDetails, then set fields in tests directly
      metaTxDisputeDetails = new MetaTxDisputeDetails(exchangeId, complaint);
      expect(metaTxDisputeDetails.isValid()).is.true;

      // Get plain object
      object = {
        exchangeId,
        complaint,
      };

      // Struct representation
      struct = [exchangeId, complaint];
    });

    context("👉 Static", async function () {
      it("MetaTxDisputeDetails.fromObject() should return a MetaTxDisputeDetails instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = MetaTxDisputeDetails.fromObject(object);

        // Is a MetaTxDisputeDetails instance
        expect(promoted instanceof MetaTxDisputeDetails).is.true;

        // Key values all match
        for ([key, value] of Object.entries(metaTxDisputeDetails)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("MetaTxDisputeDetails.fromStruct() should return a MetaTxDisputeDetails instance with the same values as the given struct", async function () {
        // Get condition from struct
        metaTxDisputeDetails = MetaTxDisputeDetails.fromStruct(struct);

        // Ensure it marshals back to a valid metaTxDisputeDetails
        expect(metaTxDisputeDetails.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the MetaTxDisputeDetails instance", async function () {
        dehydrated = metaTxDisputeDetails.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(metaTxDisputeDetails)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the MetaTxDisputeDetails instance", async function () {
        // Get plain object
        object = metaTxDisputeDetails.toObject();

        // Not an MetaTxDisputeDetails instance
        expect(object instanceof MetaTxDisputeDetails).is.false;

        // Key values all match
        for ([key, value] of Object.entries(metaTxDisputeDetails)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("MetaTxDisputeDetails.toStruct() should return a struct representation of the MetaTxDisputeDetails instance", async function () {
        // Get struct from metaTxDisputeDetails
        struct = metaTxDisputeDetails.toStruct();

        // Marshal back to a metaTxDisputeDetails instance
        metaTxDisputeDetails = MetaTxDisputeDetails.fromStruct(struct);

        // Ensure it marshals back to a valid metaTxDisputeDetails
        expect(metaTxDisputeDetails.isValid()).to.be.true;
      });

      it("instance.clone() should return another MetaTxDisputeDetails instance with the same property values", async function () {
        // Get plain object
        clone = metaTxDisputeDetails.clone();

        // Is an MetaTxDisputeDetails instance
        expect(clone instanceof MetaTxDisputeDetails).is.true;

        // Key values all match
        for ([key, value] of Object.entries(metaTxDisputeDetails)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });
    });
  });
});
