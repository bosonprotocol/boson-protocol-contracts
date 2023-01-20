const { expect } = require("chai");
const Range = require("../../scripts/domain/Range");

/**
 *  Test the Range domain entity
 */
describe("Range", function () {
  // Suite-wide scope
  let range, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
  let start, length, minted, lastBurnedTokenId;

  beforeEach(async function () {
    // Required constructor params
    start = "15";
    length = "20000";
    minted = "1500";
    lastBurnedTokenId = "1";
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated Range instance", async function () {
      range = new Range(start, length, minted, lastBurnedTokenId);
      expect(range.startIsValid()).is.true;
      expect(range.lengthIsValid()).is.true;
      expect(range.mintedIsValid()).is.true;
      expect(range.lastBurnedTokenIdIsValid()).is.true;
      expect(range.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create a valid range, then set fields in tests directly
      range = new Range(start, length, minted, lastBurnedTokenId);
      expect(range.isValid()).is.true;
    });

    it("Always present, start must be the string representation of a BigNumber", async function () {
      // Invalid field value
      range.start = "zedzdeadbaby";
      expect(range.startIsValid()).is.false;
      expect(range.isValid()).is.false;

      // Invalid field value
      range.start = new Date();
      expect(range.startIsValid()).is.false;
      expect(range.isValid()).is.false;

      // Invalid field value
      range.start = 12;
      expect(range.startIsValid()).is.false;
      expect(range.isValid()).is.false;

      // Valid field value
      range.start = "0";
      expect(range.startIsValid()).is.true;
      expect(range.isValid()).is.true;

      // Valid field value
      range.start = "126";
      expect(range.startIsValid()).is.true;
      expect(range.isValid()).is.true;
    });

    it("Always present, length must be the string representation of a BigNumber", async function () {
      // Invalid field value
      range.length = "zedzdeadbaby";
      expect(range.lengthIsValid()).is.false;
      expect(range.isValid()).is.false;

      // Invalid field value
      range.length = new Date();
      expect(range.lengthIsValid()).is.false;
      expect(range.isValid()).is.false;

      // Invalid field value
      range.length = 12;
      expect(range.lengthIsValid()).is.false;
      expect(range.isValid()).is.false;

      // Valid field value
      range.length = "0";
      expect(range.lengthIsValid()).is.true;
      expect(range.isValid()).is.true;

      // Valid field value
      range.length = "126";
      expect(range.lengthIsValid()).is.true;
      expect(range.isValid()).is.true;
    });

    it("If present, minted must be the string representation of a BigNumber", async function () {
      // Invalid field value
      range.minted = "zedzdeadbaby";
      expect(range.mintedIsValid()).is.false;
      expect(range.isValid()).is.false;

      // Invalid field value
      range.minted = new Date();
      expect(range.mintedIsValid()).is.false;
      expect(range.isValid()).is.false;

      // Invalid field value
      range.minted = 12;
      expect(range.mintedIsValid()).is.false;
      expect(range.isValid()).is.false;

      // Valid field value
      range.minted = "0";
      expect(range.mintedIsValid()).is.true;
      expect(range.isValid()).is.true;

      // Valid field value
      range.minted = "126";
      expect(range.mintedIsValid()).is.true;
      expect(range.isValid()).is.true;
    });

    it("If present, lastBurnedTokenId must be the string representation of a BigNumber", async function () {
      // Invalid field value
      range.lastBurnedTokenId = "zedzdeadbaby";
      expect(range.lastBurnedTokenIdIsValid()).is.false;
      expect(range.isValid()).is.false;

      // Invalid field value
      range.lastBurnedTokenId = new Date();
      expect(range.lastBurnedTokenIdIsValid()).is.false;
      expect(range.isValid()).is.false;

      // Invalid field value
      range.lastBurnedTokenId = 12;
      expect(range.lastBurnedTokenIdIsValid()).is.false;
      expect(range.isValid()).is.false;

      // Valid field value
      range.lastBurnedTokenId = "0";
      expect(range.lastBurnedTokenIdIsValid()).is.true;
      expect(range.isValid()).is.true;

      // Valid field value
      range.lastBurnedTokenId = "126";
      expect(range.lastBurnedTokenIdIsValid()).is.true;
      expect(range.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create a valid range, then set fields in tests directly
      range = new Range(start, length, minted, lastBurnedTokenId);
      expect(range.isValid()).is.true;

      // Get plain object
      object = {
        start,
        length,
        minted,
        lastBurnedTokenId,
      };

      // Struct representation
      struct = [start, length, minted, lastBurnedTokenId];
    });

    context("👉 Static", async function () {
      it("Range.fromObject() should return a Range instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = Range.fromObject(object);

        // Is a Range instance
        expect(promoted instanceof Range).is.true;

        // Key values all match
        for ([key, value] of Object.entries(range)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("Range.fromStruct() should return an Range instance from a struct representation", async function () {
        // Get instance from struct
        range = Range.fromStruct(struct);

        // Ensure it marshals back to a valid range
        expect(range.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the Range instance", async function () {
        dehydrated = range.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(range)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.clone() should return another Range instance with the same property values", async function () {
        // Get plain object
        clone = range.clone();

        // Is an Range instance
        expect(clone instanceof Range).is.true;

        // Key values all match
        for ([key, value] of Object.entries(range)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the Range instance", async function () {
        // Get plain object
        object = range.toObject();

        // Not an Range instance
        expect(object instanceof Range).is.false;

        // Key values all match
        for ([key, value] of Object.entries(range)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });
    });
  });
});
