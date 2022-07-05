const { expect } = require("chai");
const DisputeDates = require("../../scripts/domain/DisputeDates");

/**
 *  Test the DisputeDates domain entity
 */
describe("DisputeDates", function () {
  // Suite-wide scope
  let disputeDates, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
  let disputed, escalated, finalized, timeout;

  beforeEach(async function () {
    // Required constructor params
    disputed = "1661441758";
    escalated = "0";
    finalized = "1661442001";
    timeout = "166145000";
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated DisputeDates instance", async function () {
      disputeDates = new DisputeDates(disputed, escalated, finalized, timeout);
      expect(disputeDates.disputedIsValid()).is.true;
      expect(disputeDates.escalatedIsValid()).is.true;
      expect(disputeDates.finalizedIsValid()).is.true;
      expect(disputeDates.timeoutIsValid()).is.true;
      expect(disputeDates.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create a valid disputeDates, then set fields in tests directly
      disputeDates = new DisputeDates(disputed, escalated, finalized, timeout);
      expect(disputeDates.isValid()).is.true;
    });

    it("Always present, disputed must be the string representation of a BigNumber", async function () {
      // Invalid field value
      disputeDates.disputed = "zedzdeadbaby";
      expect(disputeDates.disputedIsValid()).is.false;
      expect(disputeDates.isValid()).is.false;

      // Invalid field value
      disputeDates.disputed = new Date();
      expect(disputeDates.disputedIsValid()).is.false;
      expect(disputeDates.isValid()).is.false;

      // Invalid field value
      disputeDates.disputed = 12;
      expect(disputeDates.disputedIsValid()).is.false;
      expect(disputeDates.isValid()).is.false;

      // Valid field value
      disputeDates.disputed = "0";
      expect(disputeDates.disputedIsValid()).is.true;
      expect(disputeDates.isValid()).is.true;

      // Valid field value
      disputeDates.disputed = "126";
      expect(disputeDates.disputedIsValid()).is.true;
      expect(disputeDates.isValid()).is.true;
    });

    it("If present, escalated must be the string representation of a BigNumber", async function () {
      // Invalid field value
      disputeDates.escalated = "zedzdeadbaby";
      expect(disputeDates.escalatedIsValid()).is.false;
      expect(disputeDates.isValid()).is.false;

      // Invalid field value
      disputeDates.escalated = new Date();
      expect(disputeDates.escalatedIsValid()).is.false;
      expect(disputeDates.isValid()).is.false;

      // Invalid field value
      disputeDates.escalated = 12;
      expect(disputeDates.escalatedIsValid()).is.false;
      expect(disputeDates.isValid()).is.false;

      // Valid field value
      disputeDates.escalated = "0";
      expect(disputeDates.escalatedIsValid()).is.true;
      expect(disputeDates.isValid()).is.true;

      // Valid field value
      disputeDates.escalated = "126";
      expect(disputeDates.escalatedIsValid()).is.true;
      expect(disputeDates.isValid()).is.true;

      // Valid field value
      disputeDates.escalated = null;
      expect(disputeDates.escalatedIsValid()).is.true;
      expect(disputeDates.isValid()).is.true;

      // Valid field value
      disputeDates.escalated = undefined;
      expect(disputeDates.escalatedIsValid()).is.true;
      expect(disputeDates.isValid()).is.true;
    });

    it("If present, finalized must be the string representation of a BigNumber", async function () {
      // Invalid field value
      disputeDates.finalized = "zedzdeadbaby";
      expect(disputeDates.finalizedIsValid()).is.false;
      expect(disputeDates.isValid()).is.false;

      // Invalid field value
      disputeDates.finalized = new Date();
      expect(disputeDates.finalizedIsValid()).is.false;
      expect(disputeDates.isValid()).is.false;

      // Invalid field value
      disputeDates.finalized = 12;
      expect(disputeDates.finalizedIsValid()).is.false;
      expect(disputeDates.isValid()).is.false;

      // Valid field value
      disputeDates.finalized = "0";
      expect(disputeDates.finalizedIsValid()).is.true;
      expect(disputeDates.isValid()).is.true;

      // Valid field value
      disputeDates.finalized = "126";
      expect(disputeDates.finalizedIsValid()).is.true;
      expect(disputeDates.isValid()).is.true;

      // Valid field value
      disputeDates.finalized = null;
      expect(disputeDates.finalizedIsValid()).is.true;
      expect(disputeDates.isValid()).is.true;

      // Valid field value
      disputeDates.finalized = undefined;
      expect(disputeDates.finalizedIsValid()).is.true;
      expect(disputeDates.isValid()).is.true;
    });

    it("Always present, timeout must be the string representation of a BigNumber", async function () {
      // Invalid field value
      disputeDates.timeout = "zedzdeadbaby";
      expect(disputeDates.timeoutIsValid()).is.false;
      expect(disputeDates.isValid()).is.false;

      // Invalid field value
      disputeDates.timeout = new Date();
      expect(disputeDates.timeoutIsValid()).is.false;
      expect(disputeDates.isValid()).is.false;

      // Invalid field value
      disputeDates.timeout = 12;
      expect(disputeDates.timeoutIsValid()).is.false;
      expect(disputeDates.isValid()).is.false;

      // Valid field value
      disputeDates.timeout = "0";
      expect(disputeDates.timeoutIsValid()).is.true;
      expect(disputeDates.isValid()).is.true;

      // Valid field value
      disputeDates.timeout = "126";
      expect(disputeDates.timeoutIsValid()).is.true;
      expect(disputeDates.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create a valid disputeDates, then set fields in tests directly
      disputeDates = new DisputeDates(disputed, escalated, finalized, timeout);
      expect(disputeDates.isValid()).is.true;

      // Get plain object
      object = {
        disputed,
        escalated,
        finalized,
        timeout,
      };

      // Struct representation
      struct = [disputed, escalated, finalized, timeout];
    });

    context("👉 Static", async function () {
      it("DisputeDates.fromObject() should return a DisputeDates instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = DisputeDates.fromObject(object);

        // Is a DisputeDates instance
        expect(promoted instanceof DisputeDates).is.true;

        // Key values all match
        for ([key, value] of Object.entries(disputeDates)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("DisputeDates.fromStruct() should return an DisputeDates instance from a struct representation", async function () {
        // Get instance from struct
        disputeDates = DisputeDates.fromStruct(struct);

        // Ensure it marshals back to a valid disputeDates
        expect(disputeDates.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the DisputeDates instance", async function () {
        dehydrated = disputeDates.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(disputeDates)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.clone() should return another DisputeDates instance with the same property values", async function () {
        // Get plain object
        clone = disputeDates.clone();

        // Is an DisputeDates instance
        expect(clone instanceof DisputeDates).is.true;

        // Key values all match
        for ([key, value] of Object.entries(disputeDates)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the DisputeDates instance", async function () {
        // Get plain object
        object = disputeDates.toObject();

        // Not an DisputeDates instance
        expect(object instanceof DisputeDates).is.false;

        // Key values all match
        for ([key, value] of Object.entries(disputeDates)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });
    });
  });
});
