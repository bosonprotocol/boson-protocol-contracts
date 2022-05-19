const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");
const MetaTxOfferDetails = require("../../scripts/domain/MetaTxOfferDetails");

/**
 *  Test the MetaTxOfferDetails domain entity
 */
describe("MetaTxOfferDetails", function () {
  // Suite-wide scope
  let offerDetails, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
  let accounts;
  let buyer, offerId;

  beforeEach(async function () {
    // Get accounts
    accounts = await ethers.getSigners();

    // Required constructor params
    buyer = accounts[0].address;
    offerId = "1";
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated MetaTxOfferDetails instance", async function () {
      // Create a valid offerDetails, then set fields in tests directly
      offerDetails = new MetaTxOfferDetails(buyer, offerId);
      expect(offerDetails.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create a valid offerDetails, then set fields in tests directly
      offerDetails = new MetaTxOfferDetails(buyer, offerId);
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
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create a valid offerDetails, then set fields in tests directly
      offerDetails = new MetaTxOfferDetails(buyer, offerId);
      expect(offerDetails.isValid()).is.true;

      // Create plain object
      object = {
        buyer,
        offerId,
      };
    });

    context("👉 Static", async function () {
      it("MetaTxOfferDetails.fromObject() should return a MetaTxOfferDetails instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = MetaTxOfferDetails.fromObject(object);

        // Is a MetaTxOfferDetails instance
        expect(promoted instanceof MetaTxOfferDetails).is.true;

        // Key values all match
        for ([key, value] of Object.entries(offerDetails)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("MetaTxOfferDetails.fromStruct() should return a MetaTxOfferDetails instance with the same values as the given struct", async function () {
        struct = [offerDetails.buyer, offerDetails.offerId];

        // Get struct
        offerDetails = MetaTxOfferDetails.fromStruct(struct);

        // Ensure it marshals back to a valid offerDetails
        expect(offerDetails.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the MetaTxOfferDetails instance", async function () {
        dehydrated = offerDetails.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(offerDetails)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the MetaTxOfferDetails instance", async function () {
        // Get plain object
        object = offerDetails.toObject();

        // Not an MetaTxOfferDetails instance
        expect(object instanceof MetaTxOfferDetails).is.false;

        // Key values all match
        for ([key, value] of Object.entries(offerDetails)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("MetaTxOfferDetails.toStruct() should return a struct representation of the MetaTxOfferDetails instance", async function () {
        // Get struct from offerDetails
        struct = offerDetails.toStruct();

        // Marshal back to an offerDetails instance
        offerDetails = MetaTxOfferDetails.fromStruct(struct);

        // Ensure it marshals back to a valid offerDetails
        expect(offerDetails.isValid()).to.be.true;
      });

      it("instance.clone() should return another MetaTxOfferDetails instance with the same property values", async function () {
        // Get plain object
        clone = offerDetails.clone();

        // Is an MetaTxOfferDetails instance
        expect(clone instanceof MetaTxOfferDetails).is.true;

        // Key values all match
        for ([key, value] of Object.entries(offerDetails)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });
    });
  });
});
