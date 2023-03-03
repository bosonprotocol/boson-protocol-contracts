const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");
const PriceDiscovery = require("../../scripts/domain/PriceDiscovery");
const Side = require("../../scripts/domain/Side");

/**
 *  Test the PriceDiscovery domain entity
 */
describe("PriceDiscovery", function () {
  // Suite-wide scope
  let priceDiscovery, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
  let accounts, price, priceDiscoveryContract, priceDiscoveryData, side;

  beforeEach(async function () {
    // Get a list of accounts
    accounts = await ethers.getSigners();

    // Required constructor params
    price = "150";
    priceDiscoveryContract = accounts[1].address;
    priceDiscoveryData = "0xdeadbeef";
    side = Side.Ask;
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated PriceDiscovery instance", async function () {
      priceDiscovery = new PriceDiscovery(price, priceDiscoveryContract, priceDiscoveryData, side);
      expect(priceDiscovery.priceIsValid()).is.true;
      expect(priceDiscovery.priceDiscoveryContractIsValid()).is.true;
      expect(priceDiscovery.priceDiscoveryDataIsValid()).is.true;
      expect(priceDiscovery.sideIsValid()).is.true;
      expect(priceDiscovery.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create a valid priceDiscovery, then set fields in tests directly
      priceDiscovery = new PriceDiscovery(price, priceDiscoveryContract, priceDiscoveryData, side);
      expect(priceDiscovery.isValid()).is.true;
    });

    it("Always present, price must be the string representation of a BigNumber", async function () {
      // Invalid field value
      priceDiscovery.price = "zedzdeadbaby";
      expect(priceDiscovery.priceIsValid()).is.false;
      expect(priceDiscovery.isValid()).is.false;

      // Invalid field value
      priceDiscovery.price = new Date();
      expect(priceDiscovery.priceIsValid()).is.false;
      expect(priceDiscovery.isValid()).is.false;

      // Invalid field value
      priceDiscovery.price = 12;
      expect(priceDiscovery.priceIsValid()).is.false;
      expect(priceDiscovery.isValid()).is.false;

      // Valid field value
      priceDiscovery.price = "0";
      expect(priceDiscovery.priceIsValid()).is.true;
      expect(priceDiscovery.isValid()).is.true;

      // Valid field value
      priceDiscovery.price = "126";
      expect(priceDiscovery.priceIsValid()).is.true;
      expect(priceDiscovery.isValid()).is.true;
    });

    it("Always present, priceDiscoveryContract must be a string representation of an EIP-55 compliant address", async function () {
      // Invalid field value
      priceDiscovery.priceDiscoveryContract = "0xASFADF";
      expect(priceDiscovery.priceDiscoveryContractIsValid()).is.false;
      expect(priceDiscovery.isValid()).is.false;

      // Invalid field value
      priceDiscovery.priceDiscoveryContract = "zedzdeadbaby";
      expect(priceDiscovery.priceDiscoveryContractIsValid()).is.false;
      expect(priceDiscovery.isValid()).is.false;

      // Valid field value
      priceDiscovery.priceDiscoveryContract = accounts[0].address;
      expect(priceDiscovery.priceDiscoveryContractIsValid()).is.true;
      expect(priceDiscovery.isValid()).is.true;

      // Valid field value
      priceDiscovery.priceDiscoveryContract = "0xec2fd5bd6fc7b576dae82c0b9640969d8de501a2";
      expect(priceDiscovery.priceDiscoveryContractIsValid()).is.true;
      expect(priceDiscovery.isValid()).is.true;
    });

    it("If present, priceDiscoveryData must be the string representation of bytes", async function () {
      // Invalid field value
      priceDiscovery.priceDiscoveryData = "zedzdeadbaby";
      expect(priceDiscovery.priceDiscoveryDataIsValid()).is.false;
      expect(priceDiscovery.isValid()).is.false;

      // Invalid field value
      priceDiscovery.priceDiscoveryData = new Date();
      expect(priceDiscovery.priceDiscoveryDataIsValid()).is.false;
      expect(priceDiscovery.isValid()).is.false;

      // Invalid field value
      priceDiscovery.priceDiscoveryData = 12;
      expect(priceDiscovery.priceDiscoveryDataIsValid()).is.false;
      expect(priceDiscovery.isValid()).is.false;

      // Invalid field value
      priceDiscovery.priceDiscoveryData = "0x1";
      expect(priceDiscovery.priceDiscoveryDataIsValid()).is.false;
      expect(priceDiscovery.isValid()).is.false;

      // Valid field value
      priceDiscovery.priceDiscoveryData = "0x";
      expect(priceDiscovery.priceDiscoveryDataIsValid()).is.true;
      expect(priceDiscovery.isValid()).is.true;

      // Valid field value
      priceDiscovery.priceDiscoveryData = "0x1234567890abcdef";
      expect(priceDiscovery.priceDiscoveryDataIsValid()).is.true;
      expect(priceDiscovery.isValid()).is.true;
    });

    it("If present, side must be a Side enum", async function () {
      // Invalid field value
      priceDiscovery.side = "zedzdeadbaby";
      expect(priceDiscovery.sideIsValid()).is.false;
      expect(priceDiscovery.isValid()).is.false;

      // Invalid field value
      priceDiscovery.side = new Date();
      expect(priceDiscovery.sideIsValid()).is.false;
      expect(priceDiscovery.isValid()).is.false;

      // Invalid field value
      priceDiscovery.side = 12;
      expect(priceDiscovery.sideIsValid()).is.false;
      expect(priceDiscovery.isValid()).is.false;

      // Valid field value
      priceDiscovery.side = Side.Bid;
      expect(priceDiscovery.sideIsValid()).is.true;
      expect(priceDiscovery.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create a valid priceDiscovery, then set fields in tests directly
      priceDiscovery = new PriceDiscovery(price, priceDiscoveryContract, priceDiscoveryData, side);
      expect(priceDiscovery.isValid()).is.true;

      // Get plain object
      object = {
        price,
        priceDiscoveryContract,
        priceDiscoveryData,
        side,
      };

      // Struct representation
      struct = [price, priceDiscoveryContract, priceDiscoveryData, side];
    });

    context("👉 Static", async function () {
      it("PriceDiscovery.fromObject() should return a PriceDiscovery instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = PriceDiscovery.fromObject(object);

        // Is a PriceDiscovery instance
        expect(promoted instanceof PriceDiscovery).is.true;

        // Key values all match
        for ([key, value] of Object.entries(priceDiscovery)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("PriceDiscovery.fromStruct() should return an PriceDiscovery instance from a struct representation", async function () {
        // Get instance from struct
        priceDiscovery = PriceDiscovery.fromStruct(struct);

        // Ensure it marshals back to a valid priceDiscovery
        expect(priceDiscovery.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the PriceDiscovery instance", async function () {
        dehydrated = priceDiscovery.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(priceDiscovery)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.clone() should return another PriceDiscovery instance with the same property values", async function () {
        // Get plain object
        clone = priceDiscovery.clone();

        // Is an PriceDiscovery instance
        expect(clone instanceof PriceDiscovery).is.true;

        // Key values all match
        for ([key, value] of Object.entries(priceDiscovery)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the PriceDiscovery instance", async function () {
        // Get plain object
        object = priceDiscovery.toObject();

        // Not an PriceDiscovery instance
        expect(object instanceof PriceDiscovery).is.false;

        // Key values all match
        for ([key, value] of Object.entries(priceDiscovery)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });
    });
  });
});
