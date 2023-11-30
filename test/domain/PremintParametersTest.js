const hre = require("hardhat");
const { getSigners } = hre.ethers;
const { expect } = require("chai");
const PremintParameters = require("../../scripts/domain/PremintParameters");

/**
 *  Test the PremintParameters domain entity
 */
describe("PremintParameters", function () {
  // Suite-wide scope
  let accounts, premintParameters, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
  let reservedRangeLength, to;

  context("📋 Constructor", async function () {
    beforeEach(async function () {
      // Get a list of accounts
      accounts = await getSigners();
      to = accounts[1].address;

      // Required constructor params
      reservedRangeLength = "12";
    });

    it("Should allow creation of valid, fully populated PremintParameters instance", async function () {
      // Create a valid premintParameters
      premintParameters = new PremintParameters(reservedRangeLength, to);
      expect(premintParameters.reservedRangeLengthIsValid()).is.true;
      expect(premintParameters.toIsValid()).is.true;
      expect(premintParameters.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Get a list of accounts
      accounts = await getSigners();
      to = accounts[1].address;

      // Required constructor params
      reservedRangeLength = "500"; //5%

      // Create a valid premintParameters, then set fields in tests directly
      premintParameters = new PremintParameters(reservedRangeLength, to);
      expect(premintParameters.isValid()).is.true;
    });

    it("Always present, reservedRangeLength must be the string representation of a BigNumber", async function () {
      // Invalid field value
      premintParameters.reservedRangeLength = "zedzdeadbaby";
      expect(premintParameters.reservedRangeLengthIsValid()).is.false;
      expect(premintParameters.isValid()).is.false;

      // Invalid field value
      premintParameters.reservedRangeLength = new Date();
      expect(premintParameters.reservedRangeLengthIsValid()).is.false;
      expect(premintParameters.isValid()).is.false;

      // Valid field value
      premintParameters.reservedRangeLength = "0";
      expect(premintParameters.reservedRangeLengthIsValid()).is.true;
      expect(premintParameters.isValid()).is.true;

      // Valid field value
      premintParameters.reservedRangeLength = "126";
      expect(premintParameters.reservedRangeLengthIsValid()).is.true;
      expect(premintParameters.isValid()).is.true;
    });

    it("Always present, to must be a string representation of an EIP-55 compliant address", async function () {
      // Invalid field value
      premintParameters.to = "0xASFADF";
      expect(premintParameters.toIsValid()).is.false;
      expect(premintParameters.isValid()).is.false;

      // Invalid field value
      premintParameters.to = "zedzdeadbaby";
      expect(premintParameters.toIsValid()).is.false;
      expect(premintParameters.isValid()).is.false;

      // Valid field value
      premintParameters.to = accounts[0].address;
      expect(premintParameters.toIsValid()).is.true;
      expect(premintParameters.isValid()).is.true;

      // Valid field value
      premintParameters.to = "0xec2fd5bd6fc7b576dae82c0b9640969d8de501a2";
      expect(premintParameters.toIsValid()).is.true;
      expect(premintParameters.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Get a list of accounts
      accounts = await getSigners();
      to = accounts[1].address;

      // Required constructor params
      reservedRangeLength = "500"; //5%

      // Create a valid premintParameters, then set fields in tests directly
      premintParameters = new PremintParameters(reservedRangeLength, to);
      expect(premintParameters.isValid()).is.true;

      // Get plain object
      object = {
        reservedRangeLength,
        to,
      };

      // Struct representation
      struct = [reservedRangeLength, to];
    });

    context("👉 Static", async function () {
      it("PremintParameters.fromObject() should return an PremintParameters instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = PremintParameters.fromObject(object);

        // Is an PremintParameters instance
        expect(promoted instanceof PremintParameters).is.true;

        // Key values all match
        for ([key, value] of Object.entries(premintParameters)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("PremintParameters.fromStruct() should return an PremintParameters instance from a struct representation", async function () {
        // Get an instance from the struct
        premintParameters = PremintParameters.fromStruct(struct);

        // Ensure it is valid
        expect(premintParameters.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the PremintParameters instance", async function () {
        dehydrated = premintParameters.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(premintParameters)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the PremintParameters instance", async function () {
        // Get plain object
        object = premintParameters.toObject();

        // Not an PremintParameters instance
        expect(object instanceof PremintParameters).is.false;

        // Key values all match
        for ([key, value] of Object.entries(premintParameters)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("PremintParameters.toStruct() should return a struct representation of the PremintParameters instance", async function () {
        // Get struct from premintParameters
        struct = premintParameters.toStruct();

        // Marshal back to an premintParameters instance
        premintParameters = PremintParameters.fromStruct(struct);

        // Ensure it marshals back to a valid premintParameters
        expect(premintParameters.isValid()).to.be.true;
      });

      it("instance.clone() should return another PremintParameters instance with the same property values", async function () {
        // Get plain object
        clone = premintParameters.clone();

        // Is an PremintParameters instance
        expect(clone instanceof PremintParameters).is.true;

        // Key values all match
        for ([key, value] of Object.entries(premintParameters)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });
    });
  });
});
