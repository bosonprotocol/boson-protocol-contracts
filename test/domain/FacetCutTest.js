const { expect } = require("chai");
const FacetCut = require("../../scripts/domain/FacetCut");
const FacetCutAction = require("../../scripts/domain/FacetCutAction");

/**
 *  Test the FacetCut domain entity
 */
describe("FacetCut", function () {
  // Suite-wide scope
  let facet, object;
  let facetAddress, action, functionSelectors;

  before(async function () {
    // Required constructor params
    facetAddress = "0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e";
    action = FacetCutAction.Add;
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
    it("Should allow creation of valid, fully populated FacetCut instance", async function () {
      facet = new FacetCut(facetAddress, action, functionSelectors);

      expect(facet.facetAddressIsValid()).is.true;
      expect(facet.actionIsValid()).is.true;
      expect(facet.functionSelectorsIsValid()).is.true;
      expect(facet.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create a valid FacetCut, then set fields in tests directly
      facet = new FacetCut(facetAddress, action, functionSelectors);
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
      expect(facet.actionIsValid()).is.true;
      expect(facet.functionSelectorsIsValid()).is.true;
      expect(facet.isValid()).is.true;
    });

    it("Always present, action must be a valid FacetCutAction", async function () {
      // Invalid field value
      facet.action = "zedzdeadbaby";
      expect(facet.actionIsValid()).is.false;
      expect(facet.isValid()).is.false;

      // Invalid field value
      facet.action = "0";
      expect(facet.actionIsValid()).is.false;
      expect(facet.isValid()).is.false;

      // Invalid field value
      facet.action = "126";
      expect(facet.actionIsValid()).is.false;
      expect(facet.isValid()).is.false;

      // Valid field value
      facet.action = FacetCutAction.Add;
      expect(facet.actionIsValid()).is.true;
      expect(facet.isValid()).is.true;

      // Valid field value
      facet.action = FacetCutAction.Replace;
      expect(facet.actionIsValid()).is.true;
      expect(facet.isValid()).is.true;

      // Valid field value
      facet.action = FacetCutAction.Remove;
      expect(facet.actionIsValid()).is.true;
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
      // Create a valid FacetCut instance, then operate on its methods in the tests
      facet = new FacetCut(facetAddress, action, functionSelectors);

      // Get plain object
      object = {
        facetAddress,
        action,
        functionSelectors,
      };
    });

    context("👉 Static", async function () {
      it("FacetCut.fromObject() should return a FacetCut instance with the same values as the given plain object", async function () {
        // Promote to instance
        const promoted = FacetCut.fromObject(object);

        // Is a FacetCut instance
        expect(promoted instanceof FacetCut).is.true;

        // Key values all match
        for (const [key, value] of Object.entries(facet)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the FacetCut instance", async function () {
        const dehydrated = facet.toString();
        const rehydrated = JSON.parse(dehydrated);

        for (const [key, value] of Object.entries(facet)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.clone() should return another FacetCut instance with the same property values", async function () {
        // Get plain object
        const clone = facet.clone();

        // Is an FacetCut instance
        expect(clone instanceof FacetCut).is.true;

        // Key values all match
        for (const [key, value] of Object.entries(facet)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the FacetCut instance", async function () {
        // Get plain object
        const object = facet.toObject();

        // Not an FacetCut instance
        expect(object instanceof FacetCut).is.false;

        // Key values all match
        for (const [key, value] of Object.entries(facet)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });
    });
  });
});
