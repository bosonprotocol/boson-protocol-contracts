const { expect } = require("chai");
const OfferDurations = require("../../scripts/domain/OfferDurations");

/**
 *  Test the OfferDurations domain entity
 */
describe("OfferDurations", function () {
  // Suite-wide scope
  let offerDurations, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
  let oneMonth, oneWeek;
  let fulfillmentPeriod, voucherValid, disputeValid;

  beforeEach(async function () {
    // Some periods in milliseconds
    oneWeek = 604800 * 1000; //  7 days in milliseconds
    oneMonth = 2678400 * 1000; // 31 days in milliseconds

    // Required constructor params
    fulfillmentPeriod = oneMonth.toString(); // fulfillment period is one month
    voucherValid = oneMonth.toString(); // offers valid for one month
    disputeValid = oneWeek.toString(); // dispute is valid for one month
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated OfferDurations instance", async function () {
      // Create a valid offerDurations, then set fields in tests directly
      offerDurations = new OfferDurations(fulfillmentPeriod, voucherValid, disputeValid);
      expect(offerDurations.fulfillmentPeriodIsValid()).is.true;
      expect(offerDurations.voucherValidIsValid()).is.true;
      expect(offerDurations.disputeValidIsValid()).is.true;
      expect(offerDurations.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create a valid offerDurations, then set fields in tests directly
      offerDurations = new OfferDurations(fulfillmentPeriod, voucherValid, disputeValid);
      expect(offerDurations.isValid()).is.true;
    });

    it("Always present, fulfillmentPeriod must be the string representation of a BigNumber", async function () {
      // Invalid field value
      offerDurations.fulfillmentPeriod = "zedzdeadbaby";
      expect(offerDurations.fulfillmentPeriodIsValid()).is.false;
      expect(offerDurations.isValid()).is.false;

      // Invalid field value
      offerDurations.fulfillmentPeriod = new Date();
      expect(offerDurations.fulfillmentPeriodIsValid()).is.false;
      expect(offerDurations.isValid()).is.false;

      // Invalid field value
      offerDurations.fulfillmentPeriod = 12;
      expect(offerDurations.fulfillmentPeriodIsValid()).is.false;
      expect(offerDurations.isValid()).is.false;

      // Valid field value
      offerDurations.fulfillmentPeriod = "0";
      expect(offerDurations.fulfillmentPeriodIsValid()).is.true;
      expect(offerDurations.isValid()).is.true;

      // Valid field value
      offerDurations.fulfillmentPeriod = "126";
      expect(offerDurations.fulfillmentPeriodIsValid()).is.true;
      expect(offerDurations.isValid()).is.true;
    });

    it("Always present, voucherValid must be the string representation of a BigNumber", async function () {
      // Invalid field value
      offerDurations.voucherValid = "zedzdeadbaby";
      expect(offerDurations.voucherValidIsValid()).is.false;
      expect(offerDurations.isValid()).is.false;

      // Invalid field value
      offerDurations.voucherValid = new Date();
      expect(offerDurations.voucherValidIsValid()).is.false;
      expect(offerDurations.isValid()).is.false;

      // Invalid field value
      offerDurations.voucherValid = 12;
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

    it("Always present, disputeValid must be the string representation of a BigNumber", async function () {
      // Invalid field value
      offerDurations.disputeValid = "zedzdeadbaby";
      expect(offerDurations.disputeValidIsValid()).is.false;
      expect(offerDurations.isValid()).is.false;

      // Invalid field value
      offerDurations.disputeValid = new Date();
      expect(offerDurations.disputeValidIsValid()).is.false;
      expect(offerDurations.isValid()).is.false;

      // Invalid field value
      offerDurations.disputeValid = 12;
      expect(offerDurations.disputeValidIsValid()).is.false;
      expect(offerDurations.isValid()).is.false;

      // Valid field value
      offerDurations.disputeValid = "0";
      expect(offerDurations.disputeValidIsValid()).is.true;
      expect(offerDurations.isValid()).is.true;

      // Valid field value
      offerDurations.disputeValid = "126";
      expect(offerDurations.disputeValidIsValid()).is.true;
      expect(offerDurations.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create a valid offerDurations, then set fields in tests directly
      offerDurations = new OfferDurations(fulfillmentPeriod, voucherValid, disputeValid);
      expect(offerDurations.isValid()).is.true;

      // Create plain object
      object = {
        fulfillmentPeriod,
        voucherValid,
        disputeValid,
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
        struct = [offerDurations.fulfillmentPeriod, offerDurations.voucherValid, offerDurations.disputeValid];

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
