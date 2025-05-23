const hre = require("hardhat");
const { getSigners } = hre.ethers;
const { expect } = require("chai");
const Condition = require("../../scripts/domain/Condition");
const EvaluationMethod = require("../../scripts/domain/EvaluationMethod");
const TokenType = require("../../scripts/domain/TokenType");
const GatingType = require("../../scripts/domain/GatingType");

/**
 *  Test the Condition domain entity
 */
describe("Condition", function () {
  // Suite-wide scope
  let condition, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
  let accounts, method, tokenType, tokenAddress, gating, minTokenId, threshold, maxCommits, maxTokenId;

  beforeEach(async function () {
    // Get a list of accounts
    accounts = await getSigners();
    tokenAddress = accounts[1].address;

    // Required constructor params
    method = EvaluationMethod.None;
    tokenType = TokenType.MultiToken;
    gating = GatingType.PerAddress;
    minTokenId = "1";
    threshold = "1";
    maxCommits = "3";
    maxTokenId = "0";
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated Condition instance", async function () {
      // Create a valid condition
      condition = new Condition(method, tokenType, tokenAddress, gating, minTokenId, threshold, maxCommits, maxTokenId);
      expect(condition.methodIsValid()).is.true;
      expect(condition.tokenTypeIsValid()).is.true;
      expect(condition.tokenAddressIsValid()).is.true;
      expect(condition.gatingIsValid()).is.true;
      expect(condition.minTokenIdIsValid()).is.true;
      expect(condition.thresholdIsValid()).is.true;
      expect(condition.maxCommitsIsValid()).is.true;
      expect(condition.maxTokenIdIsValid()).is.true;
      expect(condition.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Required constructor params
      method = EvaluationMethod.SpecificToken;

      // Create a valid condition, then set fields in tests directly
      condition = new Condition(method, tokenType, tokenAddress, gating, minTokenId, threshold, maxCommits, maxTokenId);
      expect(condition.isValid()).is.true;
    });

    it("Always present, method must be a valid EvaluationMethod enum value", async function () {
      // Invalid field value
      condition.method = "zedzdeadbaby";
      expect(condition.methodIsValid()).is.false;
      expect(condition.isValid()).is.false;

      // Invalid field value
      condition.method = "0";
      expect(condition.methodIsValid()).is.false;
      expect(condition.isValid()).is.false;

      // Invalid field value
      condition.method = new Date();
      expect(condition.methodIsValid()).is.false;
      expect(condition.isValid()).is.false;

      // Invalid field value
      condition.method = "126";
      expect(condition.methodIsValid()).is.false;
      expect(condition.isValid()).is.false;

      // Invalid field value
      condition.method = new Date();
      expect(condition.methodIsValid()).is.false;
      expect(condition.isValid()).is.false;

      // Invalid field value
      condition.method = EvaluationMethod.Types.length; // outside of enum range
      expect(condition.methodIsValid()).is.false;
      expect(condition.isValid()).is.false;

      // Valid field value
      condition.method = EvaluationMethod.Threshold;
      expect(condition.methodIsValid()).is.true;
      expect(condition.isValid()).is.true;

      // Valid field value
      condition.method = EvaluationMethod.SpecificToken;
      expect(condition.methodIsValid()).is.true;
      expect(condition.isValid()).is.true;
    });

    it("Always present, tokenType must be a valid TokenType enum value", async function () {
      // Invalid field value
      condition.tokenType = "zedzdeadbaby";
      expect(condition.tokenTypeIsValid()).is.false;
      expect(condition.isValid()).is.false;

      // Invalid field value
      condition.tokenType = "0";
      expect(condition.tokenTypeIsValid()).is.false;
      expect(condition.isValid()).is.false;

      // Invalid field value
      condition.tokenType = new Date();
      expect(condition.tokenTypeIsValid()).is.false;
      expect(condition.isValid()).is.false;

      // Invalid field value
      condition.tokenType = "126";
      expect(condition.tokenTypeIsValid()).is.false;
      expect(condition.isValid()).is.false;

      // Invalid field value
      condition.tokenType = new Date();
      expect(condition.tokenTypeIsValid()).is.false;
      expect(condition.isValid()).is.false;

      // Invalid field value
      condition.tokenType = TokenType.Types.length; // outside of enum range
      expect(condition.tokenTypeIsValid()).is.false;
      expect(condition.isValid()).is.false;

      // Valid field value
      condition.tokenType = TokenType.FungibleToken;
      expect(condition.tokenTypeIsValid()).is.true;
      expect(condition.isValid()).is.true;

      // Valid field value
      condition.tokenType = TokenType.NonFungibleToken;
      expect(condition.tokenTypeIsValid()).is.true;
      expect(condition.isValid()).is.true;
    });

    it("Always present, tokenAddress must be a string representation of an EIP-55 compliant address", async function () {
      // Invalid field value
      condition.tokenAddress = "0xASFADF";
      expect(condition.tokenAddressIsValid()).is.false;
      expect(condition.isValid()).is.false;

      // Invalid field value
      condition.tokenAddress = "zedzdeadbaby";
      expect(condition.tokenAddressIsValid()).is.false;
      expect(condition.isValid()).is.false;

      // Valid field value
      condition.tokenAddress = accounts[0].address;
      expect(condition.tokenAddressIsValid()).is.true;
      expect(condition.isValid()).is.true;

      // Valid field value
      condition.tokenAddress = "0xec2fd5bd6fc7b576dae82c0b9640969d8de501a2";
      expect(condition.tokenAddressIsValid()).is.true;
      expect(condition.isValid()).is.true;
    });

    it("Always present, gating must be a valid GatingType enum value", async function () {
      // Invalid field value
      condition.gating = "zedzdeadbaby";
      expect(condition.gatingIsValid()).is.false;
      expect(condition.isValid()).is.false;

      // Invalid field value
      condition.gating = "0";
      expect(condition.gatingIsValid()).is.false;
      expect(condition.isValid()).is.false;

      // Invalid field value
      condition.gating = new Date();
      expect(condition.gatingIsValid()).is.false;
      expect(condition.isValid()).is.false;

      // Invalid field value
      condition.gating = "126";
      expect(condition.gatingIsValid()).is.false;
      expect(condition.isValid()).is.false;

      // Invalid field value
      condition.gating = new Date();
      expect(condition.gatingIsValid()).is.false;
      expect(condition.isValid()).is.false;

      // Invalid field value
      condition.gating = GatingType.Types.length; // outside of enum range
      expect(condition.gatingIsValid()).is.false;
      expect(condition.isValid()).is.false;

      // Valid field value
      condition.gating = GatingType.PerTokenId;
      expect(condition.gatingIsValid()).is.true;
      expect(condition.isValid()).is.true;
    });

    it("Always present, minTokenId must be the string representation of a BigNumber", async function () {
      // Invalid field value
      condition.minTokenId = "zedzdeadbaby";
      expect(condition.minTokenIdIsValid()).is.false;
      expect(condition.isValid()).is.false;

      // Valid field value
      condition.minTokenId = "0";
      expect(condition.minTokenIdIsValid()).is.true;
      expect(condition.isValid()).is.true;

      // Valid field value
      condition.minTokenId = "126";
      expect(condition.minTokenIdIsValid()).is.true;
      expect(condition.isValid()).is.true;
    });

    it("Always present, threshold must be the string representation of a BigNumber", async function () {
      // Invalid field value
      condition.threshold = "zedzdeadbaby";
      expect(condition.thresholdIsValid()).is.false;
      expect(condition.isValid()).is.false;

      // Valid field value
      condition.threshold = "0";
      expect(condition.thresholdIsValid()).is.true;
      expect(condition.isValid()).is.true;

      // Invalid field value
      condition.threshold = new Date();
      expect(condition.thresholdIsValid()).is.false;
      expect(condition.isValid()).is.false;

      // Valid field value
      condition.threshold = "126";
      expect(condition.thresholdIsValid()).is.true;
      expect(condition.isValid()).is.true;
    });

    it("Always present, maxCommits must be the string representation of a BigNumber", async function () {
      // Invalid field value
      condition.maxCommits = "zedzdeadbaby";
      expect(condition.maxCommitsIsValid()).is.false;
      expect(condition.isValid()).is.false;

      // Valid field value
      condition.maxCommits = "0";
      expect(condition.maxCommitsIsValid()).is.true;
      expect(condition.isValid()).is.true;

      // Valid field value
      condition.maxCommits = "126";
      expect(condition.maxCommitsIsValid()).is.true;
      expect(condition.isValid()).is.true;

      // Invalid field value
      condition.maxCommits = new Date();
      expect(condition.maxCommitsIsValid()).is.false;
      expect(condition.isValid()).is.false;
    });

    it("Always present, maxTokenId must be the string representation of a BigNumber", async function () {
      // Invalid field value
      condition.maxTokenId = "zedzdeadbaby";
      expect(condition.maxTokenIdIsValid()).is.false;
      expect(condition.isValid()).is.false;

      // Invalid field value
      condition.maxTokenId = new Date();
      expect(condition.maxTokenIdIsValid()).is.false;
      expect(condition.isValid()).is.false;

      // Invalid field value
      condition.maxTokenId = 12;
      expect(condition.maxTokenIdIsValid()).is.false;
      expect(condition.isValid()).is.false;

      // Valid field value
      condition.maxTokenId = "0";
      expect(condition.maxTokenIdIsValid()).is.true;
      expect(condition.isValid()).is.true;

      // Valid field value
      condition.maxTokenId = "126";
      expect(condition.maxTokenIdIsValid()).is.true;
      expect(condition.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Required constructor params
      method = EvaluationMethod.Threshold;

      // Create a valid condition, then set fields in tests directly
      condition = new Condition(method, tokenType, tokenAddress, gating, minTokenId, threshold, maxCommits, maxTokenId);
      expect(condition.isValid()).is.true;

      // Get plain object
      object = {
        method,
        tokenType,
        tokenAddress,
        gating,
        minTokenId,
        threshold,
        maxCommits,
        maxTokenId,
      };

      // Struct representation
      struct = [method, tokenType, tokenAddress, gating, minTokenId, threshold, maxCommits, maxTokenId];
    });

    context("👉 Static", async function () {
      it("Condition.fromObject() should return a Condition instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = Condition.fromObject(object);

        // Is a Condition instance
        expect(promoted instanceof Condition).is.true;

        // Key values all match
        for ([key, value] of Object.entries(condition)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("Condition.fromStruct() should return a Condition instance from a struct representation", async function () {
        // Get condition from struct
        condition = Condition.fromStruct(struct);

        // Ensure it marshals back to a valid condition
        expect(condition.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the Condition instance", async function () {
        dehydrated = condition.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(condition)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the Condition instance", async function () {
        // Get plain object
        object = condition.toObject();

        // Not a Condition instance
        expect(object instanceof Condition).is.false;

        // Key values all match
        for ([key, value] of Object.entries(condition)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toStruct() should return a struct representation of the Condition instance", async function () {
        // Get struct from condition
        struct = condition.toStruct();

        // Marshal back to a condition instance
        condition = Condition.fromStruct(struct);

        // Ensure it marshals back to a valid condition
        expect(condition.isValid()).to.be.true;
      });

      it("instance.clone() should return another Condition instance with the same property values", async function () {
        // Get plain object
        clone = condition.clone();

        // Is a Condition instance
        expect(clone instanceof Condition).is.true;

        // Key values all match
        for ([key, value] of Object.entries(condition)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });
    });
  });
});
