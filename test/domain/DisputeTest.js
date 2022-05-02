const { expect } = require("chai");
const Dispute = require("../../scripts/domain/Dispute");
const DisputeState = require("../../scripts/domain/DisputeState");

/**
 *  Test the Dispute domain entity
 */
describe("Dispute", function () {
  // Suite-wide scope
  let dispute, object, promoted, clone, dehydrated, rehydrated, key, value;
  let exchangeId, complaint, state; //, struct; //TODO: Add to/from struct tests

  beforeEach(async function () {
    // Required constructor params
    exchangeId = "2112";
    complaint = "complain text";
    state = DisputeState.Resolving;
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated Dispute instance", async function () {
      dispute = new Dispute(exchangeId, complaint, state);
      expect(dispute.exchangeIdIsValid()).is.true;
      expect(dispute.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create a valid dispute, then set fields in tests directly
      dispute = new Dispute(exchangeId, complaint, state);
      expect(dispute.isValid()).is.true;
    });

    it("Always present, exchangeId must be the string representation of a BigNumber", async function () {
      // Invalid field value
      dispute.exchangeId = "zedzdeadbaby";
      expect(dispute.exchangeIdIsValid()).is.false;
      expect(dispute.isValid()).is.false;

      // Invalid field value
      dispute.exchangeId = new Date();
      expect(dispute.exchangeIdIsValid()).is.false;
      expect(dispute.isValid()).is.false;

      // Invalid field value
      dispute.exchangeId = 12;
      expect(dispute.exchangeIdIsValid()).is.false;
      expect(dispute.isValid()).is.false;

      // Valid field value
      dispute.exchangeId = "0";
      expect(dispute.exchangeIdIsValid()).is.true;
      expect(dispute.isValid()).is.true;

      // Valid field value
      dispute.exchangeId = "126";
      expect(dispute.exchangeIdIsValid()).is.true;
      expect(dispute.isValid()).is.true;
    });

    it("Always present, complaint must be the string representation of a BigNumber", async function () {
      // Invalid field value
      dispute.complaint = null;
      expect(dispute.complaintIsValid()).is.false;
      expect(dispute.isValid()).is.false;

      // Valid field value
      dispute.complaint = "zedzdeadbaby";
      expect(dispute.complaintIsValid()).is.true;
      expect(dispute.isValid()).is.true;

      // Valid field value
      dispute.complaint = "126";
      expect(dispute.complaintIsValid()).is.true;
      expect(dispute.isValid()).is.true;
    });

    it("Always present, state must be the string representation of a BigNumber", async function () {
      // Invalid field value
      dispute.state = "zedzdeadbaby";
      expect(dispute.stateIsValid()).is.false;
      expect(dispute.isValid()).is.false;

      // Invalid field value
      dispute.state = "0";
      expect(dispute.stateIsValid()).is.false;
      expect(dispute.isValid()).is.false;

      // Invalid field value
      dispute.state = "126";
      expect(dispute.stateIsValid()).is.false;
      expect(dispute.isValid()).is.false;

      // Invalid field value
      dispute.state = new Date();
      expect(dispute.stateIsValid()).is.false;
      expect(dispute.isValid()).is.false;

      // Valid field value
      dispute.state = DisputeState.Resolving;
      expect(dispute.stateIsValid()).is.true;
      expect(dispute.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create a valid dispute, then set fields in tests directly
      dispute = new Dispute(exchangeId, complaint, state);
      expect(dispute.isValid()).is.true;

      // Get plain object
      object = {
        exchangeId,
        complaint,
        state,
      };

      // Struct representation
      /*
            struct = [
                exchangeId,
                complaint,
                state
            ]
*/
    });

    context("👉 Static", async function () {
      it("Dispute.fromObject() should return a Dispute instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = Dispute.fromObject(object);

        // Is a Dispute instance
        expect(promoted instanceof Dispute).is.true;

        // Key values all match
        for ([key, value] of Object.entries(dispute)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the Dispute instance", async function () {
        dehydrated = dispute.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(dispute)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.clone() should return another Dispute instance with the same property values", async function () {
        // Get plain object
        clone = dispute.clone();

        // Is an Dispute instance
        expect(clone instanceof Dispute).is.true;

        // Key values all match
        for ([key, value] of Object.entries(dispute)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the Dispute instance", async function () {
        // Get plain object
        object = dispute.toObject();

        // Not an Dispute instance
        expect(object instanceof Dispute).is.false;

        // Key values all match
        for ([key, value] of Object.entries(dispute)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });
    });
  });
});
