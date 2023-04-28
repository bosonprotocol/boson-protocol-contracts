const { ethers } = require("hardhat");
const { expect } = require("chai");
const Agreement = require("../../scripts/domain/Agreement");

/**
 *  Test the Agreement domain entity
 */
describe("Agreement", function () {
  // Suite-wide scope
  let agreement, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
  let accounts;
  let sellerAddress,
    token,
    maxMutualizedAmountPerTransaction,
    maxTotalMutualizedAmount,
    premium,
    startTimestamp,
    endTimestamp,
    refundOnCancel,
    voided;

  beforeEach(async function () {
    // Get a list of accounts
    accounts = await ethers.getSigners();

    // Required constructor params
    [sellerAddress, token] = accounts.map((a) => a.address);
    maxMutualizedAmountPerTransaction = ethers.utils.parseUnits("1.5", "ether").toString();
    maxTotalMutualizedAmount = ethers.utils.parseUnits("0.25", "ether").toString();
    premium = ethers.utils.parseUnits("0.05", "ether").toString();
    startTimestamp = "123456789";
    endTimestamp = "987654321";
    refundOnCancel = true;
    voided = false;
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated Agreement instance", async function () {
      // Create a valid agreement, then set fields in tests directly
      agreement = new Agreement(
        sellerAddress,
        token,
        maxMutualizedAmountPerTransaction,
        maxTotalMutualizedAmount,
        premium,
        startTimestamp,
        endTimestamp,
        refundOnCancel,
        voided
      );
      expect(agreement.sellerAddressIsValid()).is.true;
      expect(agreement.tokenIsValid()).is.true;
      expect(agreement.maxMutualizedAmountPerTransactionIsValid()).is.true;
      expect(agreement.maxTotalMutualizedAmountIsValid()).is.true;
      expect(agreement.premiumIsValid()).is.true;
      expect(agreement.startTimestampIsValid()).is.true;
      expect(agreement.endTimestampIsValid()).is.true;
      expect(agreement.refundOnCancelIsValid()).is.true;
      expect(agreement.voidedIsValid()).is.true;
      expect(agreement.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create a valid agreement, then set fields in tests directly
      agreement = new Agreement(
        sellerAddress,
        token,
        maxMutualizedAmountPerTransaction,
        maxTotalMutualizedAmount,
        premium,
        startTimestamp,
        endTimestamp,
        refundOnCancel,
        voided
      );
      expect(agreement.isValid()).is.true;
    });

    it("Always present, sellerAddress must be a string representation of an EIP-55 compliant address", async function () {
      // Invalid field value
      agreement.sellerAddress = "0xASFADF";
      expect(agreement.sellerAddressIsValid()).is.false;
      expect(agreement.isValid()).is.false;

      // Invalid field value
      agreement.sellerAddress = "zedzdeadbaby";
      expect(agreement.sellerAddressIsValid()).is.false;
      expect(agreement.isValid()).is.false;

      // Valid field value
      agreement.sellerAddress = accounts[0].address;
      expect(agreement.sellerAddressIsValid()).is.true;
      expect(agreement.isValid()).is.true;

      // Valid field value
      agreement.sellerAddress = "0xec2fd5bd6fc7b576dae82c0b9640969d8de501a2";
      expect(agreement.sellerAddressIsValid()).is.true;
      expect(agreement.isValid()).is.true;
    });

    it("Always present, token must be a string representation of an EIP-55 compliant address", async function () {
      // Invalid field value
      agreement.token = "0xASFADF";
      expect(agreement.tokenIsValid()).is.false;
      expect(agreement.isValid()).is.false;

      // Invalid field value
      agreement.token = "zedzdeadbaby";
      expect(agreement.tokenIsValid()).is.false;
      expect(agreement.isValid()).is.false;

      // Valid field value
      agreement.token = accounts[0].address;
      expect(agreement.tokenIsValid()).is.true;
      expect(agreement.isValid()).is.true;

      // Valid field value
      agreement.token = "0xec2fd5bd6fc7b576dae82c0b9640969d8de501a2";
      expect(agreement.tokenIsValid()).is.true;
      expect(agreement.isValid()).is.true;
    });

    it("Always present, maxMutualizedAmountPerTransaction must be the string representation of a BigNumber", async function () {
      // Invalid field value
      agreement.maxMutualizedAmountPerTransaction = "zedzdeadbaby";
      expect(agreement.maxMutualizedAmountPerTransactionIsValid()).is.false;
      expect(agreement.isValid()).is.false;

      // Invalid field value
      agreement.maxMutualizedAmountPerTransaction = new Date();
      expect(agreement.maxMutualizedAmountPerTransactionIsValid()).is.false;
      expect(agreement.isValid()).is.false;

      // Invalid field value
      agreement.maxMutualizedAmountPerTransaction = 12;
      expect(agreement.maxMutualizedAmountPerTransactionIsValid()).is.false;
      expect(agreement.isValid()).is.false;

      // Valid field value
      agreement.maxMutualizedAmountPerTransaction = "0";
      expect(agreement.maxMutualizedAmountPerTransactionIsValid()).is.true;
      expect(agreement.isValid()).is.true;

      // Valid field value
      agreement.maxMutualizedAmountPerTransaction = "126";
      expect(agreement.maxMutualizedAmountPerTransactionIsValid()).is.true;
      expect(agreement.isValid()).is.true;
    });

    it("Always present, maxTotalMutualizedAmount must be the string representation of a BigNumber", async function () {
      // Invalid field value
      agreement.maxTotalMutualizedAmount = "zedzdeadbaby";
      expect(agreement.maxTotalMutualizedAmountIsValid()).is.false;
      expect(agreement.isValid()).is.false;

      // Invalid field value
      agreement.maxTotalMutualizedAmount = new Date();
      expect(agreement.maxTotalMutualizedAmountIsValid()).is.false;
      expect(agreement.isValid()).is.false;

      // Invalid field value
      agreement.maxTotalMutualizedAmount = 12;
      expect(agreement.maxTotalMutualizedAmountIsValid()).is.false;
      expect(agreement.isValid()).is.false;

      // Valid field value
      agreement.maxTotalMutualizedAmount = "0";
      expect(agreement.maxTotalMutualizedAmountIsValid()).is.true;
      expect(agreement.isValid()).is.true;

      // Valid field value
      agreement.maxTotalMutualizedAmount = "126";
      expect(agreement.maxTotalMutualizedAmountIsValid()).is.true;
      expect(agreement.isValid()).is.true;
    });

    it("Always present, premium must be the string representation of a BigNumber", async function () {
      // Invalid field value
      agreement.premium = "zedzdeadbaby";
      expect(agreement.premiumIsValid()).is.false;
      expect(agreement.isValid()).is.false;

      // Invalid field value
      agreement.premium = new Date();
      expect(agreement.premiumIsValid()).is.false;
      expect(agreement.isValid()).is.false;

      // Invalid field value
      agreement.premium = 12;
      expect(agreement.premiumIsValid()).is.false;
      expect(agreement.isValid()).is.false;

      // Valid field value
      agreement.premium = "0";
      expect(agreement.premiumIsValid()).is.true;
      expect(agreement.isValid()).is.true;

      // Valid field value
      agreement.premium = "126";
      expect(agreement.premiumIsValid()).is.true;
      expect(agreement.isValid()).is.true;
    });

    it("Always present, startTimestamp must be the string representation of a BigNumber", async function () {
      // Invalid field value
      agreement.startTimestamp = "zedzdeadbaby";
      expect(agreement.startTimestampIsValid()).is.false;
      expect(agreement.isValid()).is.false;

      // Invalid field value
      agreement.startTimestamp = new Date();
      expect(agreement.startTimestampIsValid()).is.false;
      expect(agreement.isValid()).is.false;

      // Invalid field value
      agreement.startTimestamp = 12;
      expect(agreement.startTimestampIsValid()).is.false;
      expect(agreement.isValid()).is.false;

      // Valid field value
      agreement.startTimestamp = "0";
      expect(agreement.startTimestampIsValid()).is.true;
      expect(agreement.isValid()).is.true;

      // Valid field value
      agreement.startTimestamp = "126";
      expect(agreement.startTimestampIsValid()).is.true;
      expect(agreement.isValid()).is.true;
    });

    it("Always present, endTimestamp must be the string representation of a BigNumber", async function () {
      // Invalid field value
      agreement.endTimestamp = "zedzdeadbaby";
      expect(agreement.endTimestampIsValid()).is.false;
      expect(agreement.isValid()).is.false;

      // Invalid field value
      agreement.endTimestamp = new Date();
      expect(agreement.endTimestampIsValid()).is.false;
      expect(agreement.isValid()).is.false;

      // Invalid field value
      agreement.endTimestamp = 12;
      expect(agreement.endTimestampIsValid()).is.false;
      expect(agreement.isValid()).is.false;

      // Valid field value
      agreement.endTimestamp = "0";
      expect(agreement.endTimestampIsValid()).is.true;
      expect(agreement.isValid()).is.true;

      // Valid field value
      agreement.endTimestamp = "126";
      expect(agreement.endTimestampIsValid()).is.true;
      expect(agreement.isValid()).is.true;
    });

    it("Always present, refundOnCancel must be a boolean", async function () {
      // Invalid field value
      agreement.refundOnCancel = 12;
      expect(agreement.refundOnCancelIsValid()).is.false;
      expect(agreement.isValid()).is.false;

      // Invalid field value
      agreement.refundOnCancel = "zedzdeadbaby";
      expect(agreement.refundOnCancelIsValid()).is.false;
      expect(agreement.isValid()).is.false;

      // Valid field value
      agreement.refundOnCancel = false;
      expect(agreement.refundOnCancelIsValid()).is.true;
      expect(agreement.isValid()).is.true;

      // Valid field value
      agreement.refundOnCancel = true;
      expect(agreement.refundOnCancelIsValid()).is.true;
      expect(agreement.isValid()).is.true;
    });

    it("Always present, voided must be a boolean", async function () {
      // Invalid field value
      agreement.voided = 12;
      expect(agreement.voidedIsValid()).is.false;
      expect(agreement.isValid()).is.false;

      // Invalid field value
      agreement.voided = "zedzdeadbaby";
      expect(agreement.voidedIsValid()).is.false;
      expect(agreement.isValid()).is.false;

      // Valid field value
      agreement.voided = false;
      expect(agreement.voidedIsValid()).is.true;
      expect(agreement.isValid()).is.true;

      // Valid field value
      agreement.voided = true;
      expect(agreement.voidedIsValid()).is.true;
      expect(agreement.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Required constructor params
      [sellerAddress, token] = accounts.map((a) => a.address);

      // Create a valid agreement, then set fields in tests directly
      agreement = new Agreement(
        sellerAddress,
        token,
        maxMutualizedAmountPerTransaction,
        maxTotalMutualizedAmount,
        premium,
        startTimestamp,
        endTimestamp,
        refundOnCancel,
        voided
      );
      expect(agreement.isValid()).is.true;

      // Create plain object
      object = {
        sellerAddress,
        token,
        maxMutualizedAmountPerTransaction,
        maxTotalMutualizedAmount,
        premium,
        startTimestamp,
        endTimestamp,
        refundOnCancel,
        voided,
      };
    });

    context("👉 Static", async function () {
      it("Agreement.fromObject() should return a Agreement instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = Agreement.fromObject(object);

        // Is a Agreement instance
        expect(promoted instanceof Agreement).is.true;

        // Key values all match
        for ([key, value] of Object.entries(agreement)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("Agreement.fromStruct() should return a Agreement instance with the same values as the given struct", async function () {
        struct = [
          agreement.sellerAddress,
          agreement.token,
          agreement.maxMutualizedAmountPerTransaction,
          agreement.maxTotalMutualizedAmount,
          agreement.premium,
          agreement.startTimestamp,
          agreement.endTimestamp,
          agreement.refundOnCancel,
          agreement.voided,
        ];

        // Get struct
        agreement = Agreement.fromStruct(struct);

        // Ensure it marshals back to a valid agreement
        expect(agreement.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the Agreement instance", async function () {
        dehydrated = agreement.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(agreement)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the Agreement instance", async function () {
        // Get plain object
        object = agreement.toObject();

        // Not an Agreement instance
        expect(object instanceof Agreement).is.false;

        // Key values all match
        for ([key, value] of Object.entries(agreement)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("Agreement.toStruct() should return a struct representation of the Agreement instance", async function () {
        // Get struct from agreement
        struct = agreement.toStruct();

        // Marshal back to an agreement instance
        agreement = Agreement.fromStruct(struct);

        // Ensure it marshals back to a valid agreement
        expect(agreement.isValid()).to.be.true;
      });

      it("instance.clone() should return another Agreement instance with the same property values", async function () {
        // Get plain object
        clone = agreement.clone();

        // Is an Agreement instance
        expect(clone instanceof Agreement).is.true;

        // Key values all match
        for ([key, value] of Object.entries(agreement)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });
    });
  });
});
