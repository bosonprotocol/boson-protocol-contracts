const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");
const OfferDates = require("../../scripts/domain/OfferDates");
const { oneWeek, oneMonth } = require("../util/constants");

/**
 *  Test the OfferDates domain entity
 */
describe("OfferDates", function () {
  // Suite-wide scope
  let offerDates, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
  let validFrom, validUntil, voucherRedeemableFrom, voucherRedeemableUntil;

  beforeEach(async function () {
    // Required constructor params
    validFrom = ethers.BigNumber.from(Date.now()).toString(); // valid from now
    validUntil = ethers.BigNumber.from(Date.now() + oneMonth * 6).toString(); // until 6 months
    voucherRedeemableFrom = ethers.BigNumber.from(Date.now() + oneWeek).toString(); // redeemable in 1 week
    voucherRedeemableUntil = ethers.BigNumber.from(Date.now() + oneWeek * 3).toString(); // redeemable for 2 weeks
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated OfferDates instance", async function () {
      // Create a valid offerDates, then set fields in tests directly
      offerDates = new OfferDates(validFrom, validUntil, voucherRedeemableFrom, voucherRedeemableUntil);
      expect(offerDates.validFromIsValid()).is.true;
      expect(offerDates.validUntilIsValid()).is.true;
      expect(offerDates.voucherRedeemableFromIsValid()).is.true;
      expect(offerDates.voucherRedeemableUntilIsValid()).is.true;
      expect(offerDates.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create a valid offerDates, then set fields in tests directly
      offerDates = new OfferDates(validFrom, validUntil, voucherRedeemableFrom, voucherRedeemableUntil);
      expect(offerDates.isValid()).is.true;
    });

    it("Always present, validFrom must be the string representation of a BigNumber", async function () {
      // Invalid field value
      offerDates.validFrom = "zedzdeadbaby";
      expect(offerDates.validFromIsValid()).is.false;
      expect(offerDates.isValid()).is.false;

      // Invalid field value
      offerDates.validFrom = new Date();
      expect(offerDates.validFromIsValid()).is.false;
      expect(offerDates.isValid()).is.false;

      // Invalid field value
      offerDates.validFrom = 12;
      expect(offerDates.validFromIsValid()).is.false;
      expect(offerDates.isValid()).is.false;

      // Valid field value
      offerDates.validFrom = "0";
      expect(offerDates.validFromIsValid()).is.true;
      expect(offerDates.isValid()).is.true;

      // Valid field value
      offerDates.validFrom = "126";
      expect(offerDates.validFromIsValid()).is.true;
      expect(offerDates.isValid()).is.true;
    });

    it("Always present, validUntil must be the string representation of a BigNumber", async function () {
      // Invalid field value
      offerDates.validUntil = "zedzdeadbaby";
      expect(offerDates.validUntilIsValid()).is.false;
      expect(offerDates.isValid()).is.false;

      // Invalid field value
      offerDates.validUntil = new Date();
      expect(offerDates.validUntilIsValid()).is.false;
      expect(offerDates.isValid()).is.false;

      // Invalid field value
      offerDates.validUntil = 12;
      expect(offerDates.validUntilIsValid()).is.false;
      expect(offerDates.isValid()).is.false;

      // Valid field value
      offerDates.validUntil = "0";
      expect(offerDates.validUntilIsValid()).is.true;
      expect(offerDates.isValid()).is.true;

      // Valid field value
      offerDates.validUntil = "126";
      expect(offerDates.validUntilIsValid()).is.true;
      expect(offerDates.isValid()).is.true;
    });

    it("Always present, voucherRedeemableFrom must be the string representation of a BigNumber", async function () {
      // Invalid field value
      offerDates.voucherRedeemableFrom = "zedzdeadbaby";
      expect(offerDates.voucherRedeemableFromIsValid()).is.false;
      expect(offerDates.isValid()).is.false;

      // Invalid field value
      offerDates.voucherRedeemableFrom = new Date();
      expect(offerDates.voucherRedeemableFromIsValid()).is.false;
      expect(offerDates.isValid()).is.false;

      // Invalid field value
      offerDates.voucherRedeemableFrom = 12;
      expect(offerDates.voucherRedeemableFromIsValid()).is.false;
      expect(offerDates.isValid()).is.false;

      // Valid field value
      offerDates.voucherRedeemableFrom = "0";
      expect(offerDates.voucherRedeemableFromIsValid()).is.true;
      expect(offerDates.isValid()).is.true;

      // Valid field value
      offerDates.voucherRedeemableFrom = "126";
      expect(offerDates.voucherRedeemableFromIsValid()).is.true;
      expect(offerDates.isValid()).is.true;
    });

    it("Always present, voucherRedeemableUntil must be the string representation of a BigNumber", async function () {
      // Invalid field value
      offerDates.voucherRedeemableUntil = "zedzdeadbaby";
      expect(offerDates.voucherRedeemableUntilIsValid()).is.false;
      expect(offerDates.isValid()).is.false;

      // Invalid field value
      offerDates.voucherRedeemableUntil = new Date();
      expect(offerDates.voucherRedeemableUntilIsValid()).is.false;
      expect(offerDates.isValid()).is.false;

      // Invalid field value
      offerDates.voucherRedeemableUntil = 12;
      expect(offerDates.voucherRedeemableUntilIsValid()).is.false;
      expect(offerDates.isValid()).is.false;

      // Valid field value
      offerDates.voucherRedeemableUntil = "0";
      expect(offerDates.voucherRedeemableUntilIsValid()).is.true;
      expect(offerDates.isValid()).is.true;

      // Valid field value
      offerDates.voucherRedeemableUntil = "126";
      expect(offerDates.voucherRedeemableUntilIsValid()).is.true;
      expect(offerDates.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create a valid offerDates, then set fields in tests directly
      offerDates = new OfferDates(validFrom, validUntil, voucherRedeemableFrom, voucherRedeemableUntil);
      expect(offerDates.isValid()).is.true;

      // Create plain object
      object = {
        validFrom,
        validUntil,
        voucherRedeemableFrom,
        voucherRedeemableUntil,
      };
    });

    context("👉 Static", async function () {
      it("OfferDates.fromObject() should return a OfferDates instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = OfferDates.fromObject(object);

        // Is a OfferDates instance
        expect(promoted instanceof OfferDates).is.true;

        // Key values all match
        for ([key, value] of Object.entries(offerDates)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("OfferDates.fromStruct() should return a OfferDates instance with the same values as the given struct", async function () {
        struct = [
          offerDates.validFrom,
          offerDates.validUntil,
          offerDates.voucherRedeemableFrom,
          offerDates.voucherRedeemableUntil,
        ];

        // Get struct
        offerDates = OfferDates.fromStruct(struct);

        // Ensure it marshals back to a valid offerDates
        expect(offerDates.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the OfferDates instance", async function () {
        dehydrated = offerDates.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(offerDates)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the OfferDates instance", async function () {
        // Get plain object
        object = offerDates.toObject();

        // Not an OfferDates instance
        expect(object instanceof OfferDates).is.false;

        // Key values all match
        for ([key, value] of Object.entries(offerDates)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("OfferDates.toStruct() should return a struct representation of the OfferDates instance", async function () {
        // Get struct from offerDates
        struct = offerDates.toStruct();

        // Marshal back to an offerDates instance
        offerDates = OfferDates.fromStruct(struct);

        // Ensure it marshals back to a valid offerDates
        expect(offerDates.isValid()).to.be.true;
      });

      it("instance.clone() should return another OfferDates instance with the same property values", async function () {
        // Get plain object
        clone = offerDates.clone();

        // Is an OfferDates instance
        expect(clone instanceof OfferDates).is.true;

        // Key values all match
        for ([key, value] of Object.entries(offerDates)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });
    });
  });
});
