const { expect } = require("chai");
const Facet = require("../../scripts/domain/Facet");

/**
 *  Test the Facet domain entity
 */
describe("Facet", function () {
  // Suite-wide scope
  let facet, object;
  let facetAddress, functionSelectors;

  before(async function () {
    // Required constructor params
    facetAddress = "0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e";
    functionSelectors = [
      "0x2a0acc6a",
      "0x0a35239b",
      "0x4b718f8b",
      "0x7b669974",
      "0xfe6d8124",
      "0xbca93eba",
      "0x1f931c1c",
      "0xcdffacc6",
      "0x52ef6b2c",
      "0xadfca15e",
      "0x7a0ed627",
    ];
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated Facet instance", async function () {
      facet = new Facet(facetAddress, functionSelectors);

      expect(facet.facetAddressIsValid()).is.true;
      expect(facet.functionSelectorsIsValid()).is.true;
      expect(facet.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create a valid Facet, then set fields in tests directly
      facet = new Facet(facetAddress, functionSelectors);
    });

    it("Always present, facetAddress must be a valid EIP-55 address", async function () {
      // Invalid field value
      facet.facetAddress = 12;
      expect(facet.facetAddressIsValid()).is.false;
      expect(facet.isValid()).is.false;

      // Invalid field value
      facet.facetAddress = "zedzdeadbaby";
      expect(facet.facetAddressIsValid()).is.false;
      expect(facet.isValid()).is.false;

      // Valid field value
      facet.facetAddress = "0x610178dA211FEF7D417bC0e6FeD39F05609AD788";
      expect(facet.facetAddressIsValid()).is.true;
      expect(facet.isValid()).is.true;
    });

    it("Always present, functionSelectors must be an array of strings representing a bytes4 BigNumber", async function () {
      // Invalid field value
      facet.functionSelectors = 12;
      expect(facet.functionSelectorsIsValid()).is.false;
      expect(facet.isValid()).is.false;

      // Invalid field value
      facet.functionSelectors = "zedzdeadbaby";
      expect(facet.functionSelectorsIsValid()).is.false;
      expect(facet.isValid()).is.false;

      // Invalid field value
      facet.functionSelectors = ["0", "x", 12];
      expect(facet.functionSelectorsIsValid()).is.false;
      expect(facet.isValid()).is.false;

      // Valid field value
      facet.functionSelectors = ["0x2a0acc6a", "0x0a35239b", "0x4b718f8b"];
      expect(facet.functionSelectorsIsValid()).is.true;
      expect(facet.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create a valid Facet instance, then operate on its methods in the tests
      facet = new Facet(facetAddress, functionSelectors);

      // Get plain object
      object = {
        facetAddress,
        functionSelectors,
      };
    });

    context("👉 Static", async function () {
      it("Facet.fromObject() should return a Facet instance with the same values as the given plain object", async function () {
        // Promote to instance
        const promoted = Facet.fromObject(object);

        // Is a Facet instance
        expect(promoted instanceof Facet).is.true;

        // Key values all match
        for (const [key, value] of Object.entries(facet)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the Facet instance", async function () {
        const dehydrated = facet.toString();
        const rehydrated = JSON.parse(dehydrated);

        for (const [key, value] of Object.entries(facet)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.clone() should return another Facet instance with the same property values", async function () {
        // Get plain object
        const clone = facet.clone();

        // Is an Facet instance
        expect(clone instanceof Facet).is.true;

        // Key values all match
        for (const [key, value] of Object.entries(facet)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the Facet instance", async function () {
        // Get plain object
        const object = facet.toObject();

        // Not an Facet instance
        expect(object instanceof Facet).is.false;

        // Key values all match
        for (const [key, value] of Object.entries(facet)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });
    });
  });
});
