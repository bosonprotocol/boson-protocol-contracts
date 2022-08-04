const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");
const Receipt = require("../../scripts/domain/Receipt.js");
const { mockReceipt, mockExchange, mockOffer, mockDispute, mockTwinReceipt } = require("../utils/mock");

/**
 *  Test the Twin domain entity
 */
describe("Receipt", function () {
  // Suite-wide scope
  let receipt, object, promoted, clone, dehydrated, rehydrated, key, value, struct;

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated Receipt instance", async function () {
      receipt = await mockReceipt();
      expect(receipt.exchangeIsValid()).is.true;
      expect(receipt.offerIsValid()).is.true;
      expect(receipt.disputeIsValid()).is.true;
      expect(receipt.twinReceiptsIsValid()).is.true;
      expect(receipt.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create a valid receipt, then set fields in tests directly
      receipt = await mockReceipt();
      expect(receipt.exchangeIsValid()).is.true;
      expect(receipt.offerIsValid()).is.true;
      expect(receipt.disputeIsValid()).is.true;
      expect(receipt.twinReceiptsIsValid()).is.true;
      expect(receipt.isValid()).is.true;
    });

    it("Exchange must be a valid exchange instance", async function () {
      // Invalid field value
      receipt.exchange = 12;
      expect(receipt.exchangeIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.exchange = "zedzdeadbaby";
      expect(receipt.exchangeIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Valid field value
      receipt.exchange = true;
      expect(receipt.exchangeIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Valid field value
      receipt.exchange = new Date();
      expect(receipt.exchangeIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Valid field value
      receipt.exchange = mockExchange();
      expect(receipt.exchangeIsValid()).is.true;
      expect(receipt.isValid()).is.true;
    });

    it("Offer must be a valid offer instance", async function () {
      // Invalid field value
      receipt.offer = 12;
      expect(receipt.offerIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.offer = "zedzdeadbaby";
      expect(receipt.offerIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Valid field value
      receipt.offer = true;
      expect(receipt.offerIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Valid field value
      receipt.offer = new Date();
      expect(receipt.offerIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Valid field value
      const { offer } = await mockOffer();
      receipt.offer = offer;
      expect(receipt.offerIsValid()).is.true;
      expect(receipt.isValid()).is.true;
    });

    it("Dispute must be a valid dispute instance", async function () {
      // Invalid field value
      receipt.dispute = 12;
      expect(receipt.disputeIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.dispute = "zedzdeadbaby";
      expect(receipt.disputeIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Valid field value
      receipt.dipsute = true;
      expect(receipt.disputeIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Valid field value
      receipt.dispute = new Date();
      expect(receipt.disputeIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Valid field value
      receipt.dispute = mockDispute();
      expect(receipt.disputeIsValid()).is.true;
      expect(receipt.isValid()).is.true;
    });

    it("TwinReceipt must be a valid twinReceipt instance", async function () {
      // Invalid field value
      receipt.twinReceipts = 12;
      expect(receipt.twinReceiptsIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.twinReceipts = "zedzdeadbaby";
      expect(receipt.twinReceiptsIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Valid field value
      receipt.twinReceipts = true;
      expect(receipt.twinReceiptsIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Valid field value
      receipt.twinReceipts = new Date();
      expect(receipt.twinReceiptsIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Valid field value
      receipt.twinReceipts = [mockTwinReceipt(ethers.constants.AddressZero)];
      expect(receipt.twinReceiptsIsValid()).is.true;
      expect(receipt.isValid()).is.true;
    });

    context("📋 Utility functions", async function () {
      beforeEach(async function () {
        // Create a valid receipt then set fields in tests directly
        receipt = await mockReceipt();
        expect(receipt.isValid()).is.true;

        const { exchange, offer, dispute, twinReceipts } = receipt;

        // Get plain object
        object = {
          exchange,
          offer,
          dispute,
          twinReceipts,
        };

        // Struct representation
        struct = [
          exchange.toStruct(),
          offer.toStruct(),
          dispute.toStruct(),
          twinReceipts.map((twinReceipt) => twinReceipt.toStruct()),
        ];
      });

      context("👉 Static", async function () {
        it("Receipt.fromObject() should return a Receipt instance with the same values as the given plain object", async function () {
          // Promote to instance
          promoted = Receipt.fromObject(object);

          // Is a Receipt instance
          expect(promoted instanceof Receipt).is.true;

          // Key values all match
          for ([key, value] of Object.entries(receipt)) {
            expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
          }
        });

        it("Receipt.fromStruct() should return a Receipt instance from a struct representation", async function () {
          // Get an instance from the struct
          receipt = Receipt.fromStruct(struct);

          // Ensure it is valid
          expect(receipt.isValid()).to.be.true;
        });
      });

      context("👉 Instance", async function () {
        it("instance.toString() should return a JSON string representation of the Receipt instance", async function () {
          dehydrated = receipt.toString();
          rehydrated = JSON.parse(dehydrated);

          for ([key, value] of Object.entries(receipt)) {
            expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
          }
        });

        it("instance.clone() should return another Receipt instance with the same property values", async function () {
          // Get plain object
          clone = receipt.clone();

          // Is an Twin instance
          expect(clone instanceof Receipt).is.true;

          // Key values all match
          for ([key, value] of Object.entries(receipt)) {
            expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
          }
        });

        it("instance.toObject() should return a plain object representation of the Receipt instance", async function () {
          // Get plain object
          object = receipt.toObject();

          // Not an Receipt instance
          expect(object instanceof Receipt).is.false;

          // Key values all match
          for ([key, value] of Object.entries(receipt)) {
            expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
          }
        });

        it("instance.toStruct() should return a struct representation of the Receipt instance", async function () {
          // Get struct from receipt
          struct = receipt.toStruct();

          // Marshal back to a twin instance
          receipt = Receipt.fromStruct(struct);

          // Ensure it marshals back to a valid twin
          expect(receipt.isValid()).to.be.true;
        });
      });
    });
  });
});
