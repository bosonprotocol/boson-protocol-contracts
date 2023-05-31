const { ethers } = require("hardhat");
const { expect } = require("chai");
const AgreementStatus = require("../../scripts/domain/AgreementStatus");

/**
 *  Test the AgreementStatus domain entity
 */
describe("AgreementStatus", function () {
  // Suite-wide scope
  let agreementStatus, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
  let confirmed, voided, outstandingExchanges, totalMutualizedAmount;

  beforeEach(async function () {
    // Required constructor params
    confirmed = true;
    voided = false;
    outstandingExchanges = "2";
    totalMutualizedAmount = ethers.utils.parseUnits("0.25", "ether").toString();
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated AgreementStatus instance", async function () {
      // Create a valid agreementStatus, then set fields in tests directly
      agreementStatus = new AgreementStatus(confirmed, voided, outstandingExchanges, totalMutualizedAmount);
      expect(agreementStatus.confirmedIsValid()).is.true;
      expect(agreementStatus.voidedIsValid()).is.true;
      expect(agreementStatus.outstandingExchangesIsValid()).is.true;
      expect(agreementStatus.totalMutualizedAmountIsValid()).is.true;
      expect(agreementStatus.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create a valid agreementStatus, then set fields in tests directly
      agreementStatus = new AgreementStatus(confirmed, voided, outstandingExchanges, totalMutualizedAmount);
      expect(agreementStatus.isValid()).is.true;
    });

    it("Always present, confirmed must be a boolean", async function () {
      // Invalid field value
      agreementStatus.confirmed = 12;
      expect(agreementStatus.confirmedIsValid()).is.false;
      expect(agreementStatus.isValid()).is.false;

      // Invalid field value
      agreementStatus.confirmed = "zedzdeadbaby";
      expect(agreementStatus.confirmedIsValid()).is.false;
      expect(agreementStatus.isValid()).is.false;

      // Valid field value
      agreementStatus.confirmed = false;
      expect(agreementStatus.confirmedIsValid()).is.true;
      expect(agreementStatus.isValid()).is.true;

      // Valid field value
      agreementStatus.confirmed = true;
      expect(agreementStatus.confirmedIsValid()).is.true;
      expect(agreementStatus.isValid()).is.true;
    });

    it("Always present, voided must be a boolean", async function () {
      // Invalid field value
      agreementStatus.voided = 12;
      expect(agreementStatus.voidedIsValid()).is.false;
      expect(agreementStatus.isValid()).is.false;

      // Invalid field value
      agreementStatus.voided = "zedzdeadbaby";
      expect(agreementStatus.voidedIsValid()).is.false;
      expect(agreementStatus.isValid()).is.false;

      // Valid field value
      agreementStatus.voided = false;
      expect(agreementStatus.voidedIsValid()).is.true;
      expect(agreementStatus.isValid()).is.true;

      // Valid field value
      agreementStatus.voided = true;
      expect(agreementStatus.voidedIsValid()).is.true;
      expect(agreementStatus.isValid()).is.true;
    });

    it("Always present, outstandingExchanges must be the string representation of a BigNumber", async function () {
      // Invalid field value
      agreementStatus.outstandingExchanges = "zedzdeadbaby";
      expect(agreementStatus.outstandingExchangesIsValid()).is.false;
      expect(agreementStatus.isValid()).is.false;

      // Invalid field value
      agreementStatus.outstandingExchanges = new Date();
      expect(agreementStatus.outstandingExchangesIsValid()).is.false;
      expect(agreementStatus.isValid()).is.false;

      // Invalid field value
      agreementStatus.outstandingExchanges = 12;
      expect(agreementStatus.outstandingExchangesIsValid()).is.false;
      expect(agreementStatus.isValid()).is.false;

      // Valid field value
      agreementStatus.outstandingExchanges = "0";
      expect(agreementStatus.outstandingExchangesIsValid()).is.true;
      expect(agreementStatus.isValid()).is.true;

      // Valid field value
      agreementStatus.outstandingExchanges = "126";
      expect(agreementStatus.outstandingExchangesIsValid()).is.true;
      expect(agreementStatus.isValid()).is.true;
    });

    it("Always present, totalMutualizedAmount must be the string representation of a BigNumber", async function () {
      // Invalid field value
      agreementStatus.totalMutualizedAmount = "zedzdeadbaby";
      expect(agreementStatus.totalMutualizedAmountIsValid()).is.false;
      expect(agreementStatus.isValid()).is.false;

      // Invalid field value
      agreementStatus.totalMutualizedAmount = new Date();
      expect(agreementStatus.totalMutualizedAmountIsValid()).is.false;
      expect(agreementStatus.isValid()).is.false;

      // Invalid field value
      agreementStatus.totalMutualizedAmount = 12;
      expect(agreementStatus.totalMutualizedAmountIsValid()).is.false;
      expect(agreementStatus.isValid()).is.false;

      // Valid field value
      agreementStatus.totalMutualizedAmount = "0";
      expect(agreementStatus.totalMutualizedAmountIsValid()).is.true;
      expect(agreementStatus.isValid()).is.true;

      // Valid field value
      agreementStatus.totalMutualizedAmount = "126";
      expect(agreementStatus.totalMutualizedAmountIsValid()).is.true;
      expect(agreementStatus.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create a valid agreementStatus, then set fields in tests directly
      agreementStatus = new AgreementStatus(confirmed, voided, outstandingExchanges, totalMutualizedAmount);
      expect(agreementStatus.isValid()).is.true;

      // Create plain object
      object = {
        confirmed,
        voided,
        outstandingExchanges,
        totalMutualizedAmount,
      };
    });

    context("👉 Static", async function () {
      it("AgreementStatus.fromObject() should return a AgreementStatus instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = AgreementStatus.fromObject(object);

        // Is a AgreementStatus instance
        expect(promoted instanceof AgreementStatus).is.true;

        // Key values all match
        for ([key, value] of Object.entries(agreementStatus)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("AgreementStatus.fromStruct() should return a AgreementStatus instance with the same values as the given struct", async function () {
        struct = [
          agreementStatus.confirmed,
          agreementStatus.voided,
          agreementStatus.outstandingExchanges,
          agreementStatus.totalMutualizedAmount,
        ];

        // Get struct
        agreementStatus = AgreementStatus.fromStruct(struct);

        // Ensure it marshals back to a valid agreementStatus
        expect(agreementStatus.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the AgreementStatus instance", async function () {
        dehydrated = agreementStatus.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(agreementStatus)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the AgreementStatus instance", async function () {
        // Get plain object
        object = agreementStatus.toObject();

        // Not an AgreementStatus instance
        expect(object instanceof AgreementStatus).is.false;

        // Key values all match
        for ([key, value] of Object.entries(agreementStatus)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("AgreementStatus.toStruct() should return a struct representation of the AgreementStatus instance", async function () {
        // Get struct from agreementStatus
        struct = agreementStatus.toStruct();

        // Marshal back to an agreementStatus instance
        agreementStatus = AgreementStatus.fromStruct(struct);

        // Ensure it marshals back to a valid agreementStatus
        expect(agreementStatus.isValid()).to.be.true;
      });

      it("instance.clone() should return another AgreementStatus instance with the same property values", async function () {
        // Get plain object
        clone = agreementStatus.clone();

        // Is an AgreementStatus instance
        expect(clone instanceof AgreementStatus).is.true;

        // Key values all match
        for ([key, value] of Object.entries(agreementStatus)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });
    });
  });
});
