const { expect } = require("chai");
const { oneMonth } = require("../util/constants");
const { ZeroAddress } = require("ethers");
const DisputeResolutionTerms = require("../../scripts/domain/DisputeResolutionTerms");

/**
 *  Test the DisputeResolutionTerms domain entity
 */
describe("DisputeResolutionTerms", function () {
  // Suite-wide scope
  let disputeResolutionTerms, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
  let disputeResolverId, escalationResponsePeriod, feeAmount, buyerEscalationDeposit;

  beforeEach(async function () {
    // Required constructor params
    disputeResolverId = "2";
    escalationResponsePeriod = oneMonth.toString();
    feeAmount = "50";
    buyerEscalationDeposit = "12345";
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated DisputeResolutionTerms instance", async function () {
      disputeResolutionTerms = new DisputeResolutionTerms(
        disputeResolverId,
        escalationResponsePeriod,
        feeAmount,
        buyerEscalationDeposit,
        ZeroAddress
      );
      expect(disputeResolutionTerms.disputeResolverIdIsValid()).is.true;
      expect(disputeResolutionTerms.escalationResponsePeriodIsValid()).is.true;
      expect(disputeResolutionTerms.feeAmountIsValid()).is.true;
      expect(disputeResolutionTerms.buyerEscalationDepositIsValid()).is.true;
      expect(disputeResolutionTerms.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create a valid disputeResolutionTerms, then set fields in tests directly
      disputeResolutionTerms = new DisputeResolutionTerms(
        disputeResolverId,
        escalationResponsePeriod,
        feeAmount,
        buyerEscalationDeposit,
        ZeroAddress
      );
      expect(disputeResolutionTerms.isValid()).is.true;
    });

    it("Always present, disputeResolverId must be the string representation of a BigNumber", async function () {
      // Invalid field value
      disputeResolutionTerms.disputeResolverId = "zedzdeadbaby";
      expect(disputeResolutionTerms.disputeResolverIdIsValid()).is.false;
      expect(disputeResolutionTerms.isValid()).is.false;

      // Valid field value
      disputeResolutionTerms.disputeResolverId = "0";
      expect(disputeResolutionTerms.disputeResolverIdIsValid()).is.true;
      expect(disputeResolutionTerms.isValid()).is.true;

      // Invalid field value
      disputeResolutionTerms.disputeResolverId = new Date();
      expect(disputeResolutionTerms.disputeResolverIdIsValid()).is.false;
      expect(disputeResolutionTerms.isValid()).is.false;

      // Valid field value
      disputeResolutionTerms.disputeResolverId = "126";
      expect(disputeResolutionTerms.disputeResolverIdIsValid()).is.true;
      expect(disputeResolutionTerms.isValid()).is.true;
    });

    it("Always present, escalationResponsePeriod must be the string representation of a BigNumber", async function () {
      // Invalid field value
      disputeResolutionTerms.escalationResponsePeriod = "zedzdeadbaby";
      expect(disputeResolutionTerms.escalationResponsePeriodIsValid()).is.false;
      expect(disputeResolutionTerms.isValid()).is.false;

      // Valid field value
      disputeResolutionTerms.escalationResponsePeriod = "0";
      expect(disputeResolutionTerms.escalationResponsePeriodIsValid()).is.true;
      expect(disputeResolutionTerms.isValid()).is.true;

      // Invalid field value
      disputeResolutionTerms.escalationResponsePeriod = new Date();
      expect(disputeResolutionTerms.escalationResponsePeriodIsValid()).is.false;
      expect(disputeResolutionTerms.isValid()).is.false;

      // Valid field value
      disputeResolutionTerms.escalationResponsePeriod = "126";
      expect(disputeResolutionTerms.escalationResponsePeriodIsValid()).is.true;
      expect(disputeResolutionTerms.isValid()).is.true;
    });

    it("Always present, feeAmount must be the string representation of a BigNumber and be less than or equal to 100000", async function () {
      // Invalid field value
      disputeResolutionTerms.feeAmount = "zedzdeadbaby";
      expect(disputeResolutionTerms.feeAmountIsValid()).is.false;
      expect(disputeResolutionTerms.isValid()).is.false;

      // Invalid field value
      disputeResolutionTerms.feeAmount = "12345";
      expect(disputeResolutionTerms.feeAmountIsValid()).is.false;
      expect(disputeResolutionTerms.isValid()).is.false;

      // Valid field value
      disputeResolutionTerms.feeAmount = "0";
      expect(disputeResolutionTerms.feeAmountIsValid()).is.true;
      expect(disputeResolutionTerms.isValid()).is.true;

      // Invalid field value
      disputeResolutionTerms.feeAmount = new Date();
      expect(disputeResolutionTerms.feeAmountIsValid()).is.false;
      expect(disputeResolutionTerms.isValid()).is.false;

      // Valid field value
      disputeResolutionTerms.feeAmount = "126";
      expect(disputeResolutionTerms.feeAmountIsValid()).is.true;
      expect(disputeResolutionTerms.isValid()).is.true;
    });

    it("Always present, buyerEscalationDeposit must be the string representation of a BigNumber", async function () {
      // Invalid field value
      disputeResolutionTerms.buyerEscalationDeposit = "zedzdeadbaby";
      expect(disputeResolutionTerms.buyerEscalationDepositIsValid()).is.false;
      expect(disputeResolutionTerms.isValid()).is.false;

      // Valid field value
      disputeResolutionTerms.buyerEscalationDeposit = "0";
      expect(disputeResolutionTerms.buyerEscalationDepositIsValid()).is.true;
      expect(disputeResolutionTerms.isValid()).is.true;

      // Valid field value
      disputeResolutionTerms.buyerEscalationDeposit = "126";
      expect(disputeResolutionTerms.buyerEscalationDepositIsValid()).is.true;
      expect(disputeResolutionTerms.isValid()).is.true;

      // Invalid field value
      disputeResolutionTerms.buyerEscalationDeposit = new Date();
      expect(disputeResolutionTerms.buyerEscalationDepositIsValid()).is.false;
      expect(disputeResolutionTerms.isValid()).is.false;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create a valid disputeResolutionTerms, then set fields in tests directly
      disputeResolutionTerms = new DisputeResolutionTerms(
        disputeResolverId,
        escalationResponsePeriod,
        feeAmount,
        buyerEscalationDeposit,
        ZeroAddress
      );
      expect(disputeResolutionTerms.isValid()).is.true;

      // Get plain object
      object = {
        disputeResolverId,
        escalationResponsePeriod,
        feeAmount,
        buyerEscalationDeposit,
        mutualizerAddress: ZeroAddress
      };

      // Struct representation
      struct = [disputeResolverId, escalationResponsePeriod, feeAmount, buyerEscalationDeposit, ZeroAddress];
    });

    context("👉 Static", async function () {
      it("DisputeResolutionTerms.fromObject() should return a DisputeResolutionTerms instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = DisputeResolutionTerms.fromObject(object);

        // Is a DisputeResolutionTerms instance
        expect(promoted instanceof DisputeResolutionTerms).is.true;

        // Key values all match
        for ([key, value] of Object.entries(disputeResolutionTerms)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("DisputeResolutionTerms.fromStruct() should return an DisputeResolutionTerms instance from a struct representation", async function () {
        // Get instance from struct
        disputeResolutionTerms = DisputeResolutionTerms.fromStruct(struct);

        // Ensure it marshals back to a valid disputeResolutionTerms
        expect(disputeResolutionTerms.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the DisputeResolutionTerms instance", async function () {
        dehydrated = disputeResolutionTerms.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(disputeResolutionTerms)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.clone() should return another DisputeResolutionTerms instance with the same property values", async function () {
        // Get plain object
        clone = disputeResolutionTerms.clone();

        // Is an DisputeResolutionTerms instance
        expect(clone instanceof DisputeResolutionTerms).is.true;

        // Key values all match
        for ([key, value] of Object.entries(disputeResolutionTerms)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the DisputeResolutionTerms instance", async function () {
        // Get plain object
        object = disputeResolutionTerms.toObject();

        // Not an DisputeResolutionTerms instance
        expect(object instanceof DisputeResolutionTerms).is.false;

        // Key values all match
        for ([key, value] of Object.entries(disputeResolutionTerms)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });
    });
  });
});
