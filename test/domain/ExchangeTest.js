const { expect } = require("chai");
const { ZeroAddress } = require("ethers");
const Exchange = require("../../scripts/domain/Exchange");
const ExchangeState = require("../../scripts/domain/ExchangeState");

/**
 *  Test the Exchange domain entity
 */
describe("Exchange", function () {
  // Suite-wide scope
  let object, promoted, clone, dehydrated, rehydrated, key, value, struct;
  let id, offerId, buyerId;
  let exchange, finalizedDate, state, mutualizerAddress;

  beforeEach(async function () {
    // Required exchange constructor params
    id = "50";
    offerId = "2112";
    buyerId = "99";
    finalizedDate = "1661447000";
    state = ExchangeState.Completed;
    mutualizerAddress = ZeroAddress;
    exchange = new Exchange(id, offerId, buyerId, finalizedDate, state, mutualizerAddress);
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated Exchange instance", async function () {
      exchange = new Exchange(id, offerId, buyerId, finalizedDate, state, mutualizerAddress);
      expect(exchange.idIsValid()).is.true;
      expect(exchange.offerIdIsValid()).is.true;
      expect(exchange.comitterIsValid()).is.true;
      expect(exchange.finalizedDateIsValid()).is.true;
      expect(exchange.stateIsValid()).is.true;
      expect(exchange.mutualizerAddressIsValid()).is.true;
      expect(exchange.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create a valid exchange, then set fields in tests directly
      exchange = new Exchange(id, offerId, buyerId, finalizedDate, state, mutualizerAddress);
      expect(exchange.isValid()).is.true;
    });

    it("Always present, id must be the string representation of a non-zero BigNumber", async function () {
      // Invalid field value
      exchange.id = "zedzdeadbaby";
      expect(exchange.idIsValid()).is.false;
      expect(exchange.isValid()).is.false;

      // Invalid field value
      exchange.id = new Date();
      expect(exchange.idIsValid()).is.false;
      expect(exchange.isValid()).is.false;

      // Invalid field value
      exchange.id = "0";
      expect(exchange.idIsValid()).is.false;
      expect(exchange.isValid()).is.false;

      // Valid field value
      exchange.id = "126";
      expect(exchange.idIsValid()).is.true;
      expect(exchange.isValid()).is.true;
    });

    it("Always present, offerId must be the string representation of a non-zero BigNumber", async function () {
      // Invalid field value
      exchange.offerId = "zedzdeadbaby";
      expect(exchange.offerIdIsValid()).is.false;
      expect(exchange.isValid()).is.false;

      // Valid field value
      exchange.offerId = "0";
      expect(exchange.offerIdIsValid()).is.false;
      expect(exchange.isValid()).is.false;

      // Invalid field value
      exchange.offerId = new Date();
      expect(exchange.offerIdIsValid()).is.false;
      expect(exchange.isValid()).is.false;

      // Valid field value
      exchange.offerId = "126";
      expect(exchange.offerIdIsValid()).is.true;
      expect(exchange.isValid()).is.true;
    });

    it("Always present, buyerId must be the string representation of a non-zero BigNumber", async function () {
      // Invalid field value
      exchange.comitter = "zedzdeadbaby";
      expect(exchange.comitterIsValid()).is.false;
      expect(exchange.isValid()).is.false;

      // Valid field value
      exchange.comitter = "0";
      expect(exchange.comitterIsValid()).is.false;
      expect(exchange.isValid()).is.false;

      // Valid field value
      exchange.comitter = "126";
      expect(exchange.comitterIsValid()).is.true;
      expect(exchange.isValid()).is.true;

      // Invalid field value
      exchange.comitter = new Date();
      expect(exchange.comitterIsValid()).is.false;
      expect(exchange.isValid()).is.false;
    });

    it("If present, finalizedDate must be the string representation of a non-zero BigNumber", async function () {
      // Invalid field value
      exchange.finalizedDate = "zedzdeadbaby";
      expect(exchange.finalizedDateIsValid()).is.false;
      expect(exchange.isValid()).is.false;

      // Valid field value
      exchange.finalizedDate = "0";
      expect(exchange.finalizedDateIsValid()).is.false;
      expect(exchange.isValid()).is.false;

      // Valid field value
      exchange.finalizedDate = "126";
      expect(exchange.finalizedDateIsValid()).is.true;
      expect(exchange.isValid()).is.true;

      // Valid field value
      exchange.finalizedDate = null;
      expect(exchange.finalizedDateIsValid()).is.true;
      expect(exchange.isValid()).is.true;

      // Invalid field value
      exchange.finalizedDate = new Date();
      expect(exchange.finalizedDateIsValid()).is.false;
      expect(exchange.isValid()).is.false;

      // Valid field value
      exchange.finalizedDate = undefined;
      expect(exchange.finalizedDateIsValid()).is.true;
      expect(exchange.isValid()).is.true;
    });

    it("Always present, mutualizerAddress must be a valid ethereum address", async function () {
      // Invalid field value
      exchange.mutualizerAddress = "notanaddress";
      expect(exchange.mutualizerAddressIsValid()).is.false;
      expect(exchange.isValid()).is.false;

      // Invalid field value
      exchange.mutualizerAddress = "0x";
      expect(exchange.mutualizerAddressIsValid()).is.false;
      expect(exchange.isValid()).is.false;

      // Valid field value
      exchange.mutualizerAddress = ZeroAddress;
      expect(exchange.mutualizerAddressIsValid()).is.true;
      expect(exchange.isValid()).is.true;

      // Valid field value
      exchange.mutualizerAddress = "0x1234567890123456789012345678901234567890";
      expect(exchange.mutualizerAddressIsValid()).is.true;
      expect(exchange.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create a valid exchange, then set fields in tests directly
      exchange = new Exchange(id, offerId, buyerId, finalizedDate, state, mutualizerAddress);
      expect(exchange.isValid()).is.true;

      // Get plain object
      object = {
        id,
        offerId,
        buyerId,
        finalizedDate,
        state,
        mutualizerAddress,
      };

      // Struct representation
      struct = [id, offerId, buyerId, finalizedDate, state, mutualizerAddress];
    });

    context("👉 Static", async function () {
      it("Exchange.fromObject() should return a Exchange instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = Exchange.fromObject(object);

        // Is a Exchange instance
        expect(promoted instanceof Exchange).is.true;

        // Key values all match
        for ([key, value] of Object.entries(exchange)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("Exchange.fromStruct() should return an Exchange instance from a struct representation", async function () {
        // Get instance from struct
        exchange = Exchange.fromStruct(struct);

        // Ensure it marshals back to a valid exchange
        expect(exchange.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the Exchange instance", async function () {
        dehydrated = exchange.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(exchange)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.clone() should return another Exchange instance with the same property values", async function () {
        // Get plain object
        clone = exchange.clone();

        // Is an Exchange instance
        expect(clone instanceof Exchange).is.true;

        // Key values all match
        for ([key, value] of Object.entries(exchange)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the Exchange instance", async function () {
        // Get plain object
        object = exchange.toObject();

        // Not an Exchange instance
        expect(object instanceof Exchange).is.false;

        // Key values all match
        for ([key, value] of Object.entries(exchange)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toStruct() should return a struct representation of the Exchange instance", async function () {
        // Get struct from resolver
        struct = exchange.toStruct();

        // Marshal back to a exchange instance
        exchange = Exchange.fromStruct(struct);

        // Ensure it marshals back to a valid exchange
        expect(exchange.isValid()).to.be.true;
      });
    });
  });
});
