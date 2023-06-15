const hre = require("hardhat");
const { getSigners } = hre.ethers;
const { expect } = require("chai");
const Twin = require("../../scripts/domain/Twin.js");
const TokenType = require("../../scripts/domain/TokenType.js");
const { mockTwin } = require("../util/mock");

/**
 *  Test the Twin domain entity
 */
describe("Twin", function () {
  // Suite-wide scope
  let twin, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
  let tokenAddress;

  beforeEach(async function () {
    // Get a list of accounts
    const accounts = await getSigners();
    tokenAddress = accounts[0].address;
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated Twin instance", async function () {
      twin = mockTwin(tokenAddress);
      expect(twin.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create a valid twin, then set fields in tests directly
      twin = mockTwin(tokenAddress);
      expect(twin.idIsValid()).is.true;
      expect(twin.sellerIdIsValid()).is.true;
      expect(twin.amountIsValid()).is.true;
      expect(twin.supplyAvailableIsValid()).is.true;
      expect(twin.tokenIdIsValid()).is.true;
      expect(twin.tokenAddressIsValid()).is.true;
      expect(twin.tokenTypeIsValid()).is.true;
      expect(twin.isValid()).is.true;
    });

    it("Always present, id must be the string representation of a BigNumber", async function () {
      // Invalid field value
      twin.id = "zedzdeadbaby";
      expect(twin.idIsValid()).is.false;
      expect(twin.isValid()).is.false;

      // Invalid field value
      twin.id = new Date();
      expect(twin.idIsValid()).is.false;
      expect(twin.isValid()).is.false;

      // Invalid field value
      twin.id = 12;
      expect(twin.idIsValid()).is.false;
      expect(twin.isValid()).is.false;

      // Valid field value
      twin.id = "0";
      expect(twin.idIsValid()).is.true;
      expect(twin.isValid()).is.true;

      // Valid field value
      twin.id = "126";
      expect(twin.idIsValid()).is.true;
      expect(twin.isValid()).is.true;
    });

    it("Always present, sellerId must be the string representation of a BigNumber", async function () {
      // Invalid field value
      twin.sellerId = "zedzdeadbaby";
      expect(twin.sellerIdIsValid()).is.false;
      expect(twin.isValid()).is.false;

      // Invalid field value
      twin.sellerId = new Date();
      expect(twin.sellerIdIsValid()).is.false;
      expect(twin.isValid()).is.false;

      // Invalid field value
      twin.sellerId = 12;
      expect(twin.sellerIdIsValid()).is.false;
      expect(twin.isValid()).is.false;

      // Valid field value
      twin.sellerId = "0";
      expect(twin.sellerIdIsValid()).is.true;
      expect(twin.isValid()).is.true;

      // Valid field value
      twin.sellerId = "126";
      expect(twin.sellerIdIsValid()).is.true;
      expect(twin.isValid()).is.true;
    });

    it("Always present, amount must be the string representation of a BigNumber", async function () {
      // Invalid field value
      twin.amount = "zedzdeadbaby";
      expect(twin.amountIsValid()).is.false;
      expect(twin.isValid()).is.false;

      // Invalid field value
      twin.amount = new Date();
      expect(twin.amountIsValid()).is.false;
      expect(twin.isValid()).is.false;

      // Invalid field value
      twin.amount = 12;
      expect(twin.amountIsValid()).is.false;
      expect(twin.isValid()).is.false;

      // Valid field value
      twin.amount = "0";
      expect(twin.amountIsValid()).is.true;
      expect(twin.isValid()).is.true;

      // Valid field value
      twin.amount = "126";
      expect(twin.amountIsValid()).is.true;
      expect(twin.isValid()).is.true;
    });

    it("Always present, supplyAvailable must be the string representation of a BigNumber", async function () {
      // Invalid field value
      twin.supplyAvailable = "zedzdeadbaby";
      expect(twin.supplyAvailableIsValid()).is.false;
      expect(twin.isValid()).is.false;

      // Invalid field value
      twin.supplyAvailable = new Date();
      expect(twin.supplyAvailableIsValid()).is.false;
      expect(twin.isValid()).is.false;

      // Invalid field value
      twin.supplyAvailable = 12;
      expect(twin.supplyAvailableIsValid()).is.false;
      expect(twin.isValid()).is.false;

      // Invalid field value
      twin.supplyAvailable = ["1", "2"];
      expect(twin.supplyAvailableIsValid()).is.false;
      expect(twin.isValid()).is.false;

      // Valid field value
      twin.supplyAvailable = "126";
      expect(twin.supplyAvailableIsValid()).is.true;
      expect(twin.isValid()).is.true;
    });

    it("Always present, tokenId must be the string representation of a BigNumber", async function () {
      // Invalid field value
      twin.tokenId = "zedzdeadbaby";
      expect(twin.tokenIdIsValid()).is.false;
      expect(twin.isValid()).is.false;

      // Invalid field value
      twin.tokenId = new Date();
      expect(twin.tokenIdIsValid()).is.false;
      expect(twin.isValid()).is.false;

      // Invalid field value
      twin.tokenId = 12;
      expect(twin.tokenIdIsValid()).is.false;
      expect(twin.isValid()).is.false;

      // Valid field value
      twin.tokenId = "0";
      expect(twin.tokenIdIsValid()).is.true;
      expect(twin.isValid()).is.true;

      // Valid field value
      twin.tokenId = "126";
      expect(twin.tokenIdIsValid()).is.true;
      expect(twin.isValid()).is.true;
    });

    it("Always present, tokenAddress must be a string representation of an EIP-55 compliant address", async function () {
      // Invalid field value
      twin.tokenAddress = "0xASFADF";
      expect(twin.tokenAddressIsValid()).is.false;
      expect(twin.isValid()).is.false;

      // Invalid field value
      twin.tokenAddress = "zedzdeadbaby";
      expect(twin.tokenAddressIsValid()).is.false;
      expect(twin.isValid()).is.false;

      // Valid field value
      twin.tokenAddress = tokenAddress;
      expect(twin.tokenAddressIsValid()).is.true;
      expect(twin.isValid()).is.true;

      // Valid field value
      twin.tokenAddress = "0xec2fd5bd6fc7b576dae82c0b9640969d8de501a2";
      expect(twin.tokenAddressIsValid()).is.true;
      expect(twin.isValid()).is.true;
    });

    it("Always present, tokenType must be a valid TokenType", async function () {
      // Invalid field value
      twin.tokenType = "zedzdeadbaby";
      expect(twin.tokenTypeIsValid()).is.false;
      expect(twin.isValid()).is.false;

      // Invalid field value
      twin.tokenType = new Date();
      expect(twin.tokenTypeIsValid()).is.false;
      expect(twin.isValid()).is.false;

      // Invalid field value
      twin.tokenType = 12;
      expect(twin.tokenTypeIsValid()).is.false;
      expect(twin.isValid()).is.false;

      // Invalid field value
      twin.tokenType = "0";
      expect(twin.tokenTypeIsValid()).is.false;
      expect(twin.isValid()).is.false;

      // Invalid field value
      twin.tokenType = "126";
      expect(twin.tokenTypeIsValid()).is.false;
      expect(twin.isValid()).is.false;

      // Valid field value
      twin.tokenType = TokenType.FungibleToken;
      expect(twin.tokenTypeIsValid()).is.true;
      expect(twin.isValid()).is.true;

      // Valid field value
      twin.tokenType = TokenType.NonFungibleToken;
      expect(twin.tokenTypeIsValid()).is.true;
      expect(twin.isValid()).is.true;

      // Valid field value
      twin.tokenType = TokenType.MultiToken;
      expect(twin.tokenTypeIsValid()).is.true;
      expect(twin.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create a valid twin, then set fields in tests directly
      twin = mockTwin(tokenAddress);
      expect(twin.isValid()).is.true;

      const { id, sellerId, amount, supplyAvailable, tokenId, tokenType } = twin;

      // Get plain object
      object = {
        id,
        sellerId,
        amount,
        supplyAvailable,
        tokenId,
        tokenAddress,
        tokenType,
      };

      // Struct representation
      struct = [id, sellerId, amount, supplyAvailable, tokenId, tokenAddress, tokenType];
    });

    context("👉 Static", async function () {
      it("Twin.fromObject() should return a Twin instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = Twin.fromObject(object);

        // Is a Twin instance
        expect(promoted instanceof Twin).is.true;

        // Key values all match
        for ([key, value] of Object.entries(twin)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("Twin.fromStruct() should return a Twin instance from a struct representation", async function () {
        // Get an instance from the struct
        twin = Twin.fromStruct(struct);

        // Ensure it is valid
        expect(twin.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the Twin instance", async function () {
        dehydrated = twin.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(twin)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.clone() should return another Twin instance with the same property values", async function () {
        // Get plain object
        clone = twin.clone();

        // Is an Twin instance
        expect(clone instanceof Twin).is.true;

        // Key values all match
        for ([key, value] of Object.entries(twin)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the Twin instance", async function () {
        // Get plain object
        object = twin.toObject();

        // Not an Twin instance
        expect(object instanceof Twin).is.false;

        // Key values all match
        for ([key, value] of Object.entries(twin)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toStruct() should return a struct representation of the Twin instance", async function () {
        // Get struct from twin
        struct = twin.toStruct();

        // Marshal back to a twin instance
        twin = Twin.fromStruct(struct);

        // Ensure it marshals back to a valid twin
        expect(twin.isValid()).to.be.true;
      });
    });
  });
});
