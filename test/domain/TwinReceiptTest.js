const hre = require("hardhat");
const { getSigners } = hre.ethers;
const { expect } = require("chai");
const TwinReceipt = require("../../scripts/domain/TwinReceipt.js");
const TokenType = require("../../scripts/domain/TokenType.js");
const { mockTwinReceipt } = require("../util/mock");

/**
 *  Test the TwinReceipt domain entity
 */
describe("TwinReceipt", function () {
  // Suite-wide scope
  let twinReceipt, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
  let tokenAddress;

  beforeEach(async function () {
    // Get a list of accounts
    const accounts = await getSigners();
    tokenAddress = accounts[0].address;
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated TwinReceipt instance", async function () {
      twinReceipt = mockTwinReceipt(tokenAddress);
      expect(twinReceipt.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create a valid twinReceipt, then set fields in tests directly
      twinReceipt = mockTwinReceipt(tokenAddress);
      expect(twinReceipt.twinIdIsValid()).is.true;
      expect(twinReceipt.amountIsValid()).is.true;
      expect(twinReceipt.tokenIdIsValid()).is.true;
      expect(twinReceipt.tokenAddressIsValid()).is.true;
      expect(twinReceipt.tokenTypeIsValid()).is.true;
      expect(twinReceipt.isValid()).is.true;
    });

    it("Always present, twinId must be the string representation of a BigNumber", async function () {
      // Invalid field value
      twinReceipt.twinId = "zedzdeadbaby";
      expect(twinReceipt.twinIdIsValid()).is.false;
      expect(twinReceipt.isValid()).is.false;

      // Valid field value
      twinReceipt.twinId = "0";
      expect(twinReceipt.twinIdIsValid()).is.true;
      expect(twinReceipt.isValid()).is.true;

      // Valid field value
      twinReceipt.twinId = "126";
      expect(twinReceipt.twinIdIsValid()).is.true;
      expect(twinReceipt.isValid()).is.true;
    });

    it("Always present, amount must be the string representation of a BigNumber", async function () {
      // Invalid field value
      twinReceipt.amount = "zedzdeadbaby";
      expect(twinReceipt.amountIsValid()).is.false;
      expect(twinReceipt.isValid()).is.false;

      // Valid field value
      twinReceipt.amount = "0";
      expect(twinReceipt.amountIsValid()).is.true;
      expect(twinReceipt.isValid()).is.true;

      // Valid field value
      twinReceipt.amount = "126";
      expect(twinReceipt.amountIsValid()).is.true;
      expect(twinReceipt.isValid()).is.true;
    });

    it("Always present, tokenId must be the string representation of a BigNumber", async function () {
      // Invalid field value
      twinReceipt.tokenId = "zedzdeadbaby";
      expect(twinReceipt.tokenIdIsValid()).is.false;
      expect(twinReceipt.isValid()).is.false;

      // Valid field value
      twinReceipt.tokenId = "0";
      expect(twinReceipt.tokenIdIsValid()).is.true;
      expect(twinReceipt.isValid()).is.true;

      // Valid field value
      twinReceipt.tokenId = "126";
      expect(twinReceipt.tokenIdIsValid()).is.true;
      expect(twinReceipt.isValid()).is.true;
    });

    it("Always present, tokenAddress must be a string representation of an EIP-55 compliant address", async function () {
      // Invalid field value
      twinReceipt.tokenAddress = "0xASFADF";
      expect(twinReceipt.tokenAddressIsValid()).is.false;
      expect(twinReceipt.isValid()).is.false;

      // Invalid field value
      twinReceipt.tokenAddress = "zedzdeadbaby";
      expect(twinReceipt.tokenAddressIsValid()).is.false;
      expect(twinReceipt.isValid()).is.false;

      // Valid field value
      twinReceipt.tokenAddress = tokenAddress;
      expect(twinReceipt.tokenAddressIsValid()).is.true;
      expect(twinReceipt.isValid()).is.true;

      // Valid field value
      twinReceipt.tokenAddress = "0xec2fd5bd6fc7b576dae82c0b9640969d8de501a2";
      expect(twinReceipt.tokenAddressIsValid()).is.true;
      expect(twinReceipt.isValid()).is.true;
    });

    it("Always present, tokenType must be a valid TokenType", async function () {
      // Invalid field value
      twinReceipt.tokenType = "zedzdeadbaby";
      expect(twinReceipt.tokenTypeIsValid()).is.false;
      expect(twinReceipt.isValid()).is.false;

      // Invalid field value
      twinReceipt.tokenType = "0";
      expect(twinReceipt.tokenTypeIsValid()).is.false;
      expect(twinReceipt.isValid()).is.false;

      // Invalid field value
      twinReceipt.tokenType = "126";
      expect(twinReceipt.tokenTypeIsValid()).is.false;
      expect(twinReceipt.isValid()).is.false;

      // Valid field value
      twinReceipt.tokenType = TokenType.FungibleToken;
      expect(twinReceipt.tokenTypeIsValid()).is.true;
      expect(twinReceipt.isValid()).is.true;

      // Valid field value
      twinReceipt.tokenType = TokenType.NonFungibleToken;
      expect(twinReceipt.tokenTypeIsValid()).is.true;
      expect(twinReceipt.isValid()).is.true;

      // Valid field value
      twinReceipt.tokenType = TokenType.MultiToken;
      expect(twinReceipt.tokenTypeIsValid()).is.true;
      expect(twinReceipt.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create a valid TwinReceipt then set fields in tests directly
      twinReceipt = mockTwinReceipt(tokenAddress);
      expect(twinReceipt.isValid()).is.true;

      const { twinId, amount, tokenId, tokenType } = twinReceipt;

      // Get plain object
      object = {
        twinId,
        amount,
        tokenId,
        tokenAddress,
        tokenType,
      };

      // Struct representation
      struct = [twinId, amount, tokenId, tokenAddress, tokenType];
    });

    context("👉 Static", async function () {
      it("TwinReceipt.fromObject() should return a TwinReceipt instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = TwinReceipt.fromObject(object);

        // Is a TwinReceipt instance
        expect(promoted instanceof TwinReceipt).is.true;

        // Key values all match
        for ([key, value] of Object.entries(twinReceipt)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("TwinReceipt.fromStruct() should return a TwinReceipt instance from a struct representation", async function () {
        // Get an instance from the struct
        twinReceipt = TwinReceipt.fromStruct(struct);

        // Ensure it is valid
        expect(twinReceipt.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the TwinReceipt instance", async function () {
        dehydrated = twinReceipt.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(twinReceipt)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.clone() should return another TwinReceipt instance with the same property values", async function () {
        // Get plain object
        clone = twinReceipt.clone();

        // Is an Twin instance
        expect(clone instanceof TwinReceipt).is.true;

        // Key values all match
        for ([key, value] of Object.entries(twinReceipt)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the TwinReceipt instance", async function () {
        // Get plain object
        object = twinReceipt.toObject();

        // Not an TwinReceipt instance
        expect(object instanceof TwinReceipt).is.false;

        // Key values all match
        for ([key, value] of Object.entries(twinReceipt)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toStruct() should return a struct representation of the TwinReceipt instance", async function () {
        // Get struct from twinReceipt
        struct = twinReceipt.toStruct();

        // Marshal back to a twinReceipt instance
        twinReceipt = TwinReceipt.fromStruct(struct);

        // Ensure it marshals back to a valid twinReceipt
        expect(twinReceipt.isValid()).to.be.true;
      });
    });
  });
});
