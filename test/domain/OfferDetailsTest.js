const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");
const OfferDetails = require("../../scripts/domain/OfferDetails");

/**
 *  Test the OfferDetails domain entity
 */
describe("OfferDetails", function () {
  // Suite-wide scope
  let offerDetails, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
  let accounts;
  let buyer, offerId, msgValue;

  beforeEach(async function () {
    // Get accounts
    accounts = await ethers.getSigners();

    // Required constructor params
    buyer = accounts[0].address;
    offerId = "1";
    msgValue = "1";
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated OfferDetails instance", async function () {
      // Create a valid offerDetails, then set fields in tests directly
      offerDetails = new OfferDetails(buyer, offerId, msgValue);
      expect(offerDetails.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create a valid offerDetails, then set fields in tests directly
      offerDetails = new OfferDetails(buyer, offerId, msgValue);
      expect(offerDetails.isValid()).is.true;
    });

    it("Always present, buyer must be a string representation of an EIP-55 compliant address", async function () {
      // Invalid field value
      offerDetails.buyer = "0xASFADF";
      expect(offerDetails.buyerIsValid()).is.false;
      expect(offerDetails.isValid()).is.false;

      // Invalid field value
      offerDetails.buyer = "zedzdeadbaby";
      expect(offerDetails.buyerIsValid()).is.false;
      expect(offerDetails.isValid()).is.false;

      // Valid field value
      offerDetails.buyer = accounts[0].address;
      expect(offerDetails.buyerIsValid()).is.true;
      expect(offerDetails.isValid()).is.true;

      // Valid field value
      offerDetails.buyer = "0xec2fd5bd6fc7b576dae82c0b9640969d8de501a2";
      expect(offerDetails.buyerIsValid()).is.true;
      expect(offerDetails.isValid()).is.true;
    });

    it("Always present, offerId must be the string representation of a BigNumber", async function () {
      // Invalid field value
      offerDetails.offerId = "zedzdeadbaby";
      expect(offerDetails.offerIdIsValid()).is.false;
      expect(offerDetails.isValid()).is.false;

      // Invalid field value
      offerDetails.offerId = new Date();
      expect(offerDetails.offerIdIsValid()).is.false;
      expect(offerDetails.isValid()).is.false;

      // Invalid field value
      offerDetails.offerId = 12;
      expect(offerDetails.offerIdIsValid()).is.false;
      expect(offerDetails.isValid()).is.false;

      // Valid field value
      offerDetails.offerId = "0";
      expect(offerDetails.offerIdIsValid()).is.true;
      expect(offerDetails.isValid()).is.true;

      // Valid field value
      offerDetails.offerId = "126";
      expect(offerDetails.offerIdIsValid()).is.true;
      expect(offerDetails.isValid()).is.true;
    });

    it("Always present, msgValue must be the string representation of a BigNumber", async function () {
      // Invalid field value
      offerDetails.msgValue = "zedzdeadbaby";
      expect(offerDetails.msgValueIsValid()).is.false;
      expect(offerDetails.isValid()).is.false;

      // Invalid field value
      offerDetails.msgValue = new Date();
      expect(offerDetails.msgValueIsValid()).is.false;
      expect(offerDetails.isValid()).is.false;

      // Invalid field value
      offerDetails.msgValue = 12;
      expect(offerDetails.msgValueIsValid()).is.false;
      expect(offerDetails.isValid()).is.false;

      // Valid field value
      offerDetails.msgValue = "0";
      expect(offerDetails.msgValueIsValid()).is.true;
      expect(offerDetails.isValid()).is.true;

      // Valid field value
      offerDetails.msgValue = "126";
      expect(offerDetails.msgValueIsValid()).is.true;
      expect(offerDetails.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create a valid offerDetails, then set fields in tests directly
      offerDetails = new OfferDetails(buyer, offerId, msgValue);
      expect(offerDetails.isValid()).is.true;

      // Create plain object
      object = {
        buyer,
        offerId,
        msgValue,
      };
    });

    context("👉 Static", async function () {
      it("OfferDetails.fromObject() should return a OfferDetails instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = OfferDetails.fromObject(object);

        // Is a OfferDetails instance
        expect(promoted instanceof OfferDetails).is.true;

        // Key values all match
        for ([key, value] of Object.entries(offerDetails)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("OfferDetails.fromStruct() should return a OfferDetails instance with the same values as the given struct", async function () {
        struct = [offerDetails.buyer, offerDetails.offerId, offerDetails.msgValue];

        // Get struct
        offerDetails = OfferDetails.fromStruct(struct);

        // Ensure it marshals back to a valid offerDetails
        expect(offerDetails.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the OfferDetails instance", async function () {
        dehydrated = offerDetails.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(offerDetails)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the OfferDetails instance", async function () {
        // Get plain object
        object = offerDetails.toObject();

        // Not an OfferDetails instance
        expect(object instanceof OfferDetails).is.false;

        // Key values all match
        for ([key, value] of Object.entries(offerDetails)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("OfferDetails.toStruct() should return a struct representation of the OfferDetails instance", async function () {
        // Get struct from offerDetails
        struct = offerDetails.toStruct();

        // Marshal back to an offerDetails instance
        offerDetails = OfferDetails.fromStruct(struct);

        // Ensure it marshals back to a valid offerDetails
        expect(offerDetails.isValid()).to.be.true;
      });

      it("instance.clone() should return another OfferDetails instance with the same property values", async function () {
        // Get plain object
        clone = offerDetails.clone();

        // Is an OfferDetails instance
        expect(clone instanceof OfferDetails).is.true;

        // Key values all match
        for ([key, value] of Object.entries(offerDetails)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });
    });
  });
});
