const { expect } = require("chai");
const OfferDurations = require("../../scripts/domain/OfferDurations");
const { oneWeek, oneMonth } = require("../util/constants");

/**
 *  Test the OfferDurations domain entity
 */
describe("OfferDurations", function () {
  // Suite-wide scope
  let offerDurations, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
  let disputePeriod, voucherValid, resolutionPeriod;

  beforeEach(async function () {
    // Required constructor params
    disputePeriod = oneMonth.toString(); // dispute period is one month
    voucherValid = oneMonth.toString(); // offers valid for one month
    resolutionPeriod = oneWeek.toString(); // dispute is valid for one month
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated OfferDurations instance", async function () {
      // Create a valid offerDurations, then set fields in tests directly
      offerDurations = new OfferDurations(disputePeriod, voucherValid, resolutionPeriod);
      expect(offerDurations.disputePeriodIsValid()).is.true;
      expect(offerDurations.voucherValidIsValid()).is.true;
      expect(offerDurations.resolutionPeriodIsValid()).is.true;
      expect(offerDurations.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create a valid offerDurations, then set fields in tests directly
      offerDurations = new OfferDurations(disputePeriod, voucherValid, resolutionPeriod);
      expect(offerDurations.isValid()).is.true;
    });

    it("Always present, disputePeriod must be the string representation of a BigNumber", async function () {
      // Invalid field value
      offerDurations.disputePeriod = "zedzdeadbaby";
      expect(offerDurations.disputePeriodIsValid()).is.false;
      expect(offerDurations.isValid()).is.false;

      // Valid field value
      offerDurations.disputePeriod = "0";
      expect(offerDurations.disputePeriodIsValid()).is.true;
      expect(offerDurations.isValid()).is.true;

      // Valid field value
      offerDurations.disputePeriod = "126";
      expect(offerDurations.disputePeriodIsValid()).is.true;
      expect(offerDurations.isValid()).is.true;
    });

    it("Always present, voucherValid must be the string representation of a BigNumber", async function () {
      // Invalid field value
      offerDurations.voucherValid = "zedzdeadbaby";
      expect(offerDurations.voucherValidIsValid()).is.false;
      expect(offerDurations.isValid()).is.false;

      // Valid field value
      offerDurations.voucherValid = "0";
      expect(offerDurations.voucherValidIsValid()).is.true;
      expect(offerDurations.isValid()).is.true;

      // Valid field value
      offerDurations.voucherValid = "126";
      expect(offerDurations.voucherValidIsValid()).is.true;
      expect(offerDurations.isValid()).is.true;
    });

    it("Always present, resolutionPeriod must be the string representation of a BigNumber", async function () {
      // Invalid field value
      offerDurations.resolutionPeriod = "zedzdeadbaby";
      expect(offerDurations.resolutionPeriodIsValid()).is.false;
      expect(offerDurations.isValid()).is.false;

      // Valid field value
      offerDurations.resolutionPeriod = "0";
      expect(offerDurations.resolutionPeriodIsValid()).is.true;
      expect(offerDurations.isValid()).is.true;

      // Valid field value
      offerDurations.resolutionPeriod = "126";
      expect(offerDurations.resolutionPeriodIsValid()).is.true;
      expect(offerDurations.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create a valid offerDurations, then set fields in tests directly
      offerDurations = new OfferDurations(disputePeriod, voucherValid, resolutionPeriod);
      expect(offerDurations.isValid()).is.true;

      // Create plain object
      object = {
        disputePeriod,
        voucherValid,
        resolutionPeriod,
      };
    });

    context("👉 Static", async function () {
      it("OfferDurations.fromObject() should return a OfferDurations instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = OfferDurations.fromObject(object);

        // Is a OfferDurations instance
        expect(promoted instanceof OfferDurations).is.true;

        // Key values all match
        for ([key, value] of Object.entries(offerDurations)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("OfferDurations.fromStruct() should return a OfferDurations instance with the same values as the given struct", async function () {
        struct = [offerDurations.disputePeriod, offerDurations.voucherValid, offerDurations.resolutionPeriod];

        // Get struct
        offerDurations = OfferDurations.fromStruct(struct);

        // Ensure it marshals back to a valid offerDurations
        expect(offerDurations.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the OfferDurations instance", async function () {
        dehydrated = offerDurations.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(offerDurations)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the OfferDurations instance", async function () {
        // Get plain object
        object = offerDurations.toObject();

        // Not an OfferDurations instance
        expect(object instanceof OfferDurations).is.false;

        // Key values all match
        for ([key, value] of Object.entries(offerDurations)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("OfferDurations.toStruct() should return a struct representation of the OfferDurations instance", async function () {
        // Get struct from offerDurations
        struct = offerDurations.toStruct();

        // Marshal back to an offerDurations instance
        offerDurations = OfferDurations.fromStruct(struct);

        // Ensure it marshals back to a valid offerDurations
        expect(offerDurations.isValid()).to.be.true;
      });

      it("instance.clone() should return another OfferDurations instance with the same property values", async function () {
        // Get plain object
        clone = offerDurations.clone();

        // Is an OfferDurations instance
        expect(clone instanceof OfferDurations).is.true;

        // Key values all match
        for ([key, value] of Object.entries(offerDurations)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });
    });
  });
});
