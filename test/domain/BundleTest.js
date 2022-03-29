const { expect } = require("chai");
const Bundle = require("../../scripts/domain/Bundle.js");

/**
 *  Test the Bundle domain entity
 */
describe("Bundle", function () {
  // Suite-wide scope
  let bundle, object, struct, promoted, clone, dehydrated, rehydrated, key, value;
  let id, sellerId, offerIds, twinIds;

  beforeEach(async function () {
    // Required constructor params
    id = sellerId = "90125";
    offerIds = ["1", "2", "4", "8"];
    twinIds = ["16", "32"];
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated Bundle instance", async function () {
      bundle = new Bundle(id, sellerId, offerIds, twinIds);
      expect(bundle.idIsValid()).is.true;
      expect(bundle.sellerIdIsValid()).is.true;
      expect(bundle.offerIdsIsValid()).is.true;
      expect(bundle.twinIdsIsValid()).is.true;
      expect(bundle.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create a valid bundle, then set fields in tests directly
      bundle = new Bundle(id, sellerId, offerIds, twinIds);
      expect(bundle.isValid()).is.true;
    });

    it("Always present, id must be the string representation of a BigNumber", async function () {
      // Invalid field value
      bundle.id = "zedzdeadbaby";
      expect(bundle.idIsValid()).is.false;
      expect(bundle.isValid()).is.false;

      // Invalid field value
      bundle.id = new Date();
      expect(bundle.idIsValid()).is.false;
      expect(bundle.isValid()).is.false;

      // Invalid field value
      bundle.id = 12;
      expect(bundle.idIsValid()).is.false;
      expect(bundle.isValid()).is.false;

      // Valid field value
      bundle.id = "0";
      expect(bundle.idIsValid()).is.true;
      expect(bundle.isValid()).is.true;

      // Valid field value
      bundle.id = "126";
      expect(bundle.idIsValid()).is.true;
      expect(bundle.isValid()).is.true;
    });

    it("Always present, sellerId must be the string representation of a BigNumber", async function () {
      // Invalid field value
      bundle.sellerId = "zedzdeadbaby";
      expect(bundle.sellerIdIsValid()).is.false;
      expect(bundle.isValid()).is.false;

      // Invalid field value
      bundle.sellerId = new Date();
      expect(bundle.sellerIdIsValid()).is.false;
      expect(bundle.isValid()).is.false;

      // Invalid field value
      bundle.sellerId = 12;
      expect(bundle.sellerIdIsValid()).is.false;
      expect(bundle.isValid()).is.false;

      // Valid field value
      bundle.sellerId = "0";
      expect(bundle.sellerIdIsValid()).is.true;
      expect(bundle.isValid()).is.true;

      // Valid field value
      bundle.sellerId = "126";
      expect(bundle.sellerIdIsValid()).is.true;
      expect(bundle.isValid()).is.true;
    });

    it("Always present, offerIds must be the array containing string representation of a BigNumber", async function () {
      // Invalid field value
      bundle.offerIds = "zedzdeadbaby";
      expect(bundle.offerIdsIsValid()).is.false;
      expect(bundle.isValid()).is.false;

      // Invalid field value
      bundle.offerIds = new Date();
      expect(bundle.offerIdsIsValid()).is.false;
      expect(bundle.isValid()).is.false;

      // Invalid field value
      bundle.offerIds = 12;
      expect(bundle.offerIdsIsValid()).is.false;
      expect(bundle.isValid()).is.false;

      // Valid field value
      bundle.offerIds = ["1", "2"];
      expect(bundle.offerIdsIsValid()).is.true;
      expect(bundle.isValid()).is.true;

      // Valid field value
      bundle.offerIds = ["126"];
      expect(bundle.offerIdsIsValid()).is.true;
      expect(bundle.isValid()).is.true;
    });

    it("Always present, twinIds must be the array containing string representation of a BigNumber", async function () {
      // Invalid field value
      bundle.twinIds = "zedzdeadbaby";
      expect(bundle.twinIdsIsValid()).is.false;
      expect(bundle.isValid()).is.false;

      // Invalid field value
      bundle.twinIds = new Date();
      expect(bundle.twinIdsIsValid()).is.false;
      expect(bundle.isValid()).is.false;

      // Invalid field value
      bundle.twinIds = 12;
      expect(bundle.twinIdsIsValid()).is.false;
      expect(bundle.isValid()).is.false;

      // Valid field value
      bundle.twinIds = ["1", "2"];
      expect(bundle.twinIdsIsValid()).is.true;
      expect(bundle.isValid()).is.true;

      // Valid field value
      bundle.twinIds = ["126"];
      expect(bundle.twinIdsIsValid()).is.true;
      expect(bundle.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create a valid bundle, then set fields in tests directly
      bundle = new Bundle(id, sellerId, offerIds, twinIds);
      expect(bundle.isValid()).is.true;

      // Get plain object
      object = {
        id,
        sellerId,
        offerIds,
        twinIds,
      };

      // Struct representation
      struct = [id, sellerId, offerIds, twinIds];
    });

    context("👉 Static", async function () {
      it("Bundle.fromObject() should return a Bundle instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = Bundle.fromObject(object);

        // Is a Bundle instance
        expect(promoted instanceof Bundle).is.true;

        // Key values all match
        for ([key, value] of Object.entries(bundle)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("Bundle.fromStruct() should return a Bundle instance with the same values as the given struct", async function () {
        // Get condition from struct
        bundle = Bundle.fromStruct(struct);

        // Ensure it marshals back to a valid bundle
        expect(bundle.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the Bundle instance", async function () {
        dehydrated = bundle.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(bundle)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the Bundle instance", async function () {
        // Get plain object
        object = bundle.toObject();

        // Not an Bundle instance
        expect(object instanceof Bundle).is.false;

        // Key values all match
        for ([key, value] of Object.entries(bundle)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("Bundle.toStruct() should return a struct representation of the Bundle instance", async function () {
        // Get struct from bundle
        struct = bundle.toStruct();

        // Marshal back to a bundle instance
        bundle = Bundle.fromStruct(struct);

        // Ensure it marshals back to a valid bundle
        expect(bundle.isValid()).to.be.true;
      });

      it("instance.clone() should return another Bundle instance with the same property values", async function () {
        // Get plain object
        clone = bundle.clone();

        // Is an Bundle instance
        expect(clone instanceof Bundle).is.true;

        // Key values all match
        for ([key, value] of Object.entries(bundle)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });
    });
  });
});
