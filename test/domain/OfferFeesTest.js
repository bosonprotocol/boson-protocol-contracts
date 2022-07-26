const { expect } = require("chai");
const OfferFees = require("../../scripts/domain/OfferFees");

/**
 *  Test the OfferFees domain entity
 */
describe("OfferFees", function () {
  // Suite-wide scope
  let offerFees, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
  let protocolFee, agentFee;

  beforeEach(async function () {
    // Required constructor params
    protocolFee = "500";
    agentFee = "1000";
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated OfferFees instance", async function () {
      // Create a valid offerFees, then set fields in tests directly
      offerFees = new OfferFees(protocolFee, agentFee);
      expect(offerFees.protocolFeeIsValid()).is.true;
      expect(offerFees.agentFeeIsValid()).is.true;
      expect(offerFees.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create a valid offerFees, then set fields in tests directly
      offerFees = new OfferFees(protocolFee, agentFee);
      expect(offerFees.isValid()).is.true;
    });

    it("Always present, protocolFee must be the string representation of a BigNumber", async function () {
      // Invalid field value
      offerFees.protocolFee = "zedzdeadbaby";
      expect(offerFees.protocolFeeIsValid()).is.false;
      expect(offerFees.isValid()).is.false;

      // Invalid field value
      offerFees.protocolFee = new Date();
      expect(offerFees.protocolFeeIsValid()).is.false;
      expect(offerFees.isValid()).is.false;

      // Invalid field value
      offerFees.protocolFee = 12;
      expect(offerFees.protocolFeeIsValid()).is.false;
      expect(offerFees.isValid()).is.false;

      // Valid field value
      offerFees.protocolFee = "0";
      expect(offerFees.protocolFeeIsValid()).is.true;
      expect(offerFees.isValid()).is.true;

      // Valid field value
      offerFees.protocolFee = "126";
      expect(offerFees.protocolFeeIsValid()).is.true;
      expect(offerFees.isValid()).is.true;
    });

    it("Always present, agentFee must be the string representation of a BigNumber", async function () {
      // Invalid field value
      offerFees.agentFee = "zedzdeadbaby";
      expect(offerFees.agentFeeIsValid()).is.false;
      expect(offerFees.isValid()).is.false;

      // Invalid field value
      offerFees.agentFee = new Date();
      expect(offerFees.agentFeeIsValid()).is.false;
      expect(offerFees.isValid()).is.false;

      // Invalid field value
      offerFees.agentFee = 12;
      expect(offerFees.agentFeeIsValid()).is.false;
      expect(offerFees.isValid()).is.false;

      // Valid field value
      offerFees.agentFee = "0";
      expect(offerFees.agentFeeIsValid()).is.true;
      expect(offerFees.isValid()).is.true;

      // Valid field value
      offerFees.agentFee = "126";
      expect(offerFees.agentFeeIsValid()).is.true;
      expect(offerFees.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create a valid offerFees, then set fields in tests directly
      offerFees = new OfferFees(protocolFee, agentFee);
      expect(offerFees.isValid()).is.true;

      // Create plain object
      object = {
        protocolFee,
        agentFee,
      };
    });

    context("👉 Static", async function () {
      it("OfferFees.fromObject() should return a OfferFees instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = OfferFees.fromObject(object);

        // Is a OfferFees instance
        expect(promoted instanceof OfferFees).is.true;

        // Key values all match
        for ([key, value] of Object.entries(offerFees)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("OfferFees.fromStruct() should return a OfferFees instance with the same values as the given struct", async function () {
        struct = [offerFees.protocolFee, offerFees.agentFee];

        // Get struct
        offerFees = OfferFees.fromStruct(struct);

        // Ensure it marshals back to a valid offerFees
        expect(offerFees.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the OfferFees instance", async function () {
        dehydrated = offerFees.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(offerFees)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the OfferFees instance", async function () {
        // Get plain object
        object = offerFees.toObject();

        // Not an OfferFees instance
        expect(object instanceof OfferFees).is.false;

        // Key values all match
        for ([key, value] of Object.entries(offerFees)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("OfferFees.toStruct() should return a struct representation of the OfferFees instance", async function () {
        // Get struct from offerFees
        struct = offerFees.toStruct();

        // Marshal back to an offerFees instance
        offerFees = OfferFees.fromStruct(struct);

        // Ensure it marshals back to a valid offerFees
        expect(offerFees.isValid()).to.be.true;
      });

      it("instance.clone() should return another OfferFees instance with the same property values", async function () {
        // Get plain object
        clone = offerFees.clone();

        // Is an OfferFees instance
        expect(clone instanceof OfferFees).is.true;

        // Key values all match
        for ([key, value] of Object.entries(offerFees)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });
    });
  });
});
