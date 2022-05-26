const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");
const Twin = require("../../scripts/domain/Twin.js");
const TokenType = require("../../scripts/domain/TokenType.js");

/**
 *  Test the Twin domain entity
 */
describe("Twin", function () {
  // Suite-wide scope
  let twin, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
  let accounts, id, sellerId, supplyAvailable, supplyIds, tokenId, tokenAddress, tokenType;

  beforeEach(async function () {
    // Get a list of accounts
    accounts = await ethers.getSigners();

    // Required constructor params
    id = "1000";
    sellerId = "12";
    supplyAvailable = "500";
    tokenId = "0";
    supplyIds = [];
    tokenAddress = accounts[0].address;
    tokenType = TokenType.Fungible;
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated Twin instance", async function () {
      twin = new Twin(id, sellerId, supplyAvailable, supplyIds, tokenId, tokenAddress, tokenType);
      expect(twin.idIsValid()).is.true;
      expect(twin.sellerIdIsValid()).is.true;
      expect(twin.supplyAvailableIsValid()).is.true;
      expect(twin.supplyIdsIsValid()).is.true;
      expect(twin.tokenIdIsValid()).is.true;
      expect(twin.tokenAddressIsValid()).is.true;
      expect(twin.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create a valid twin, then set fields in tests directly
      twin = new Twin(id, sellerId, supplyAvailable, supplyIds, tokenId, tokenAddress, tokenType);
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

      // Valid field value
      twin.supplyAvailable = "0";
      expect(twin.supplyAvailableIsValid()).is.true;
      expect(twin.isValid()).is.true;

      // Valid field value
      twin.supplyAvailable = "126";
      expect(twin.supplyAvailableIsValid()).is.true;
      expect(twin.isValid()).is.true;
    });

    it("Always present, supplyIds must be the array containing string representation of a BigNumber", async function () {
      // Invalid field value
      twin.supplyIds = "zedzdeadbaby";
      expect(twin.supplyIdsIsValid()).is.false;
      expect(twin.isValid()).is.false;

      // Invalid field value
      twin.supplyIds = new Date();
      expect(twin.supplyIdsIsValid()).is.false;
      expect(twin.isValid()).is.false;

      // Invalid field value
      twin.supplyIds = 12;
      expect(twin.supplyIdsIsValid()).is.false;
      expect(twin.isValid()).is.false;

      // Valid field value
      twin.supplyIds = ["1", "2"];
      expect(twin.supplyIdsIsValid()).is.true;
      expect(twin.isValid()).is.true;

      // Valid field value
      twin.supplyIds = ["126"];
      expect(twin.supplyIdsIsValid()).is.true;
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
      twin.tokenAddress = accounts[0].address;
      expect(twin.tokenAddressIsValid()).is.true;
      expect(twin.isValid()).is.true;

      // Valid field value
      twin.tokenAddress = "0xec2fd5bd6fc7b576dae82c0b9640969d8de501a2";
      expect(twin.tokenAddressIsValid()).is.true;
      expect(twin.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create a valid twin, then set fields in tests directly
      twin = new Twin(id, sellerId, supplyAvailable, supplyIds, tokenId, tokenAddress, tokenType);
      expect(twin.isValid()).is.true;

      // Get plain object
      object = {
        id,
        sellerId,
        supplyAvailable,
        supplyIds,
        tokenId,
        tokenAddress,
      };

      // Struct representation
      struct = [id, sellerId, supplyAvailable, supplyIds, tokenId, tokenAddress];
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
