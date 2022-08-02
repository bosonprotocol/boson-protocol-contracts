const { expect } = require("chai");
const VoucherInitValues = require("../../scripts/domain/VoucherInitValues");

/**
 *  Test the VoucherInitValues domain entity
 */
describe("VoucherInitValues", function () {
  // Suite-wide scope
  let voucherInitValues, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
  let contractURI, royaltyPercentage;

  beforeEach(async function () {
    // Required constructor params
    contractURI = `https://ipfs.io/ipfs/QmW2WQi7j6c7UgJTarActp7tDNikE4B2qXtFCfLPdsgaTQ`;
    royaltyPercentage = "100"; // 1%
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated VoucherInitValues instance", async function () {
      // Create valid voucherInitValues
      voucherInitValues = new VoucherInitValues(contractURI, royaltyPercentage);
      expect(voucherInitValues.contractURIIsValid()).is.true;
      expect(voucherInitValues.royaltyPercentageIsValid()).is.true;
      expect(voucherInitValues.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create valid voucherInitValues, then set fields in tests directly
      voucherInitValues = new VoucherInitValues(contractURI, royaltyPercentage);
      expect(voucherInitValues.isValid()).is.true;
    });

    it("Always present, contractURI must be a string", async function () {
      // Invalid field value
      voucherInitValues.contractURI = 12;
      expect(voucherInitValues.contractURIIsValid()).is.false;
      expect(voucherInitValues.isValid()).is.false;

      // Valid field value
      voucherInitValues.contractURI = "zedzdeadbaby";
      expect(voucherInitValues.contractURIIsValid()).is.true;
      expect(voucherInitValues.isValid()).is.true;

      // Valid field value
      voucherInitValues.contractURI = "QmYXc12ov6F2MZVZwPs5XeCBbf61cW3wKRk8h3D5NTYj4T";
      expect(voucherInitValues.contractURIIsValid()).is.true;
      expect(voucherInitValues.isValid()).is.true;

      // Valid field value
      voucherInitValues.contractURI = "";
      expect(voucherInitValues.contractURIIsValid()).is.true;
      expect(voucherInitValues.isValid()).is.true;
    });

    it("Always present, royaltyPercentage must be the string representation of a BigNumber", async function () {
      // Invalid field value
      voucherInitValues.royaltyPercentage = "zedzdeadbaby";
      expect(voucherInitValues.royaltyPercentageIsValid()).is.false;
      expect(voucherInitValues.isValid()).is.false;

      // Invalid field value
      voucherInitValues.royaltyPercentage = new Date();
      expect(voucherInitValues.royaltyPercentageIsValid()).is.false;
      expect(voucherInitValues.isValid()).is.false;

      // Invalid field value
      voucherInitValues.royaltyPercentage = 12;
      expect(voucherInitValues.royaltyPercentageIsValid()).is.false;
      expect(voucherInitValues.isValid()).is.false;

      // Valid field value
      voucherInitValues.royaltyPercentage = "0";
      expect(voucherInitValues.royaltyPercentageIsValid()).is.true;
      expect(voucherInitValues.isValid()).is.true;

      // Valid field value
      voucherInitValues.royaltyPercentage = "126";
      expect(voucherInitValues.royaltyPercentageIsValid()).is.true;
      expect(voucherInitValues.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create valid voucherInitValues, then set fields in tests directly
      voucherInitValues = new VoucherInitValues(contractURI, royaltyPercentage);

      expect(voucherInitValues.isValid()).is.true;

      // Get plain object
      object = {
        contractURI,
        royaltyPercentage,
      };

      // Struct representation
      struct = [contractURI, royaltyPercentage];
    });

    context("👉 Static", async function () {
      it("VoucherInitValues.fromObject() should return a VoucherInitValues instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = VoucherInitValues.fromObject(object);

        // Is a Buyer instance
        expect(promoted instanceof VoucherInitValues).is.true;

        // Key values all match
        for ([key, value] of Object.entries(voucherInitValues)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("VoucherInitValues.fromStruct() should return a VoucherInitValues instance from a struct representation", async function () {
        // Get an instance from the struct
        voucherInitValues = VoucherInitValues.fromStruct(struct);

        // Ensure it is valid
        expect(voucherInitValues.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the VoucherInitValues instance", async function () {
        dehydrated = voucherInitValues.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(voucherInitValues)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the VoucherInitValues instance", async function () {
        // Get plain object
        object = voucherInitValues.toObject();

        // Not a VoucherInitValues instance
        expect(object instanceof VoucherInitValues).is.false;

        // Key values all match
        for ([key, value] of Object.entries(voucherInitValues)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("VoucherInitValues.toStruct() should return a struct representation of the VoucherInitValues instance", async function () {
        // Get struct from voucherInitValues
        struct = voucherInitValues.toStruct();

        // Marshal back to a voucherInitValues instance
        voucherInitValues = VoucherInitValues.fromStruct(struct);

        // Ensure it marshals back to a valid voucherInitValues
        expect(voucherInitValues.isValid()).to.be.true;
      });

      it("instance.clone() should return another VoucherInitValues instance with the same property values", async function () {
        // Get plain object
        clone = voucherInitValues.clone();

        // Is a VoucherInitValues instance
        expect(clone instanceof VoucherInitValues).is.true;

        // Key values all match
        for ([key, value] of Object.entries(voucherInitValues)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });
    });
  });
});
