const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");
const Receipt = require("../../scripts/domain/Receipt.js");
const { mockReceipt, mockOffer, mockTwinReceipt, mockCondition } = require("../util/mock");
const DisputeState = require("../../scripts/domain/DisputeState");

/**
 *  Test the Receipt domain entity
 */
describe("Receipt", function () {
  // Suite-wide scope
  let receipt, object, promoted, clone, dehydrated, rehydrated, key, value, struct, accounts;

  beforeEach(async function () {
    // Get a list of accounts
    accounts = await ethers.getSigners();
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated Receipt instance", async function () {
      receipt = await mockReceipt();
      expect(receipt.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create a valid receipt, then set fields in tests directly
      receipt = await mockReceipt();
      expect(receipt.exchangeIdIsValid()).is.true;
      expect(receipt.offerIdIsValid()).is.true;
      expect(receipt.buyerIdIsValid()).is.true;
      expect(receipt.sellerIdIsValid()).is.true;
      expect(receipt.priceIsValid()).is.true;
      expect(receipt.sellerDepositIsValid()).is.true;
      expect(receipt.buyerCancelPenaltyIsValid()).is.true;
      expect(receipt.offerFeesIsValid()).is.true;
      expect(receipt.agentIdIsValid()).is.true;
      expect(receipt.exchangeTokenIsValid()).is.true;
      expect(receipt.finalizedDateIsValid()).is.true;
      expect(receipt.conditionIsValid()).is.true;
      expect(receipt.committedDateIsValid()).is.true;
      expect(receipt.redeemedDateIsValid()).is.true;
      expect(receipt.voucherExpiredIsValid()).is.true;
      expect(receipt.disputeResolverIdIsValid()).is.true;
      expect(receipt.disputedDateIsValid()).is.true;
      expect(receipt.escalatedDateIsValid()).is.true;
      expect(receipt.disputeStateIsValid()).is.true;
      expect(receipt.twinReceiptsIsValid()).is.true;
      expect(receipt.isValid()).is.true;
    });

    it("Always present, exchangeId must be the string representation of a non-zero BigNumber", async function () {
      // Invalid field value
      receipt.exchangeId = "zedzdeadbaby";
      expect(receipt.exchangeIdIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.exchangeId = new Date();
      expect(receipt.exchangeIdIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.exchangeId = 12;
      expect(receipt.exchangeIdIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.exchangeId = "0";
      expect(receipt.exchangeIdIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Valid field value
      receipt.exchangeId = "126";
      expect(receipt.exchangeIdIsValid()).is.true;
      expect(receipt.isValid()).is.true;
    });

    it("Always present, offerId must be the string representation of a non-zero BigNumber", async function () {
      // Invalid field value
      receipt.offerId = "zedzdeadbaby";
      expect(receipt.offerIdIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.offerId = new Date();
      expect(receipt.offerIdIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.offerId = 12;
      expect(receipt.offerIdIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.offerId = "0";
      expect(receipt.offerIdIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Valid field value
      receipt.offerId = "126";
      expect(receipt.offerIdIsValid()).is.true;
      expect(receipt.isValid()).is.true;
    });

    it("Always present, buyerId must be the string representation of a non-zero BigNumber", async function () {
      // Invalid field value
      receipt.buyerId = "zedzdeadbaby";
      expect(receipt.buyerIdIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.buyerId = new Date();
      expect(receipt.buyerIdIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.buyerId = 12;
      expect(receipt.buyerIdIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.buyerId = "0";
      expect(receipt.buyerIdIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Valid field value
      receipt.buyerId = "126";
      expect(receipt.buyerIdIsValid()).is.true;
      expect(receipt.isValid()).is.true;
    });

    it("Always present, price must be the string representation of BigNumber", async function () {
      // Invalid field value
      receipt.price = "zedzdeadbaby";
      expect(receipt.priceIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.price = new Date();
      expect(receipt.priceIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.price = 12;
      expect(receipt.priceIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Valid field value
      receipt.price = "0";
      expect(receipt.priceIsValid()).is.true;
      expect(receipt.isValid()).is.true;

      // Valid field value
      receipt.price = "126";
      expect(receipt.priceIsValid()).is.true;
      expect(receipt.isValid()).is.true;
    });

    it("Always present, sellerDeposit must be the string representation of BigNumber", async function () {
      // Invalid field value
      receipt.sellerDeposit = "zedzdeadbaby";
      expect(receipt.sellerDepositIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.sellerDeposit = new Date();
      expect(receipt.sellerDepositIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.sellerDeposit = 12;
      expect(receipt.sellerDepositIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Valid field value
      receipt.sellerDeposit = "0";
      expect(receipt.sellerDepositIsValid()).is.true;
      expect(receipt.isValid()).is.true;

      // Valid field value
      receipt.sellerDeposit = "126";
      expect(receipt.sellerDepositIsValid()).is.true;
      expect(receipt.isValid()).is.true;
    });

    it("Always present, buyerCancelPenalty must be the string representation of BigNumber", async function () {
      // Invalid field value
      receipt.buyerCancelPenalty = "zedzdeadbaby";
      expect(receipt.buyerCancelPenaltyIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.buyerCancelPenalty = new Date();
      expect(receipt.buyerCancelPenaltyIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.buyerCancelPenalty = 12;
      expect(receipt.buyerCancelPenaltyIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Valid field value
      receipt.buyerCancelPenalty = "0";
      expect(receipt.buyerCancelPenaltyIsValid()).is.true;
      expect(receipt.isValid()).is.true;

      // Valid field value
      receipt.buyerCancelPenalty = "126";
      expect(receipt.buyerCancelPenaltyIsValid()).is.true;
      expect(receipt.isValid()).is.true;
    });

    it("Always present, offerFees must be a valid OfferFees instance", async function () {
      // Invalid field value
      receipt.offerFees = 12;
      expect(receipt.offerFeesIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.offerFees = "zedzdeadbaby";
      expect(receipt.offerFeesIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Valid field value
      receipt.offerFees = true;
      expect(receipt.offerFeesIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Valid field value
      receipt.offerFees = new Date();
      expect(receipt.offerFeesIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      const mo = await mockOffer();
      // Valid field value
      receipt.offerFees = mo.offerFees;
      expect(receipt.offerFeesIsValid()).is.true;
      expect(receipt.isValid()).is.true;
    });

    it("If present, agentId must be the string representation of BigNumber", async function () {
      // Invalid field value
      receipt.agentId = "zedzdeadbaby";
      expect(receipt.agentIdIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.agentId = new Date();
      expect(receipt.agentIdIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.agentId = 12;
      expect(receipt.agentIdIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Valid field value
      receipt.agentId = "0";
      expect(receipt.priceIsValid()).is.true;
      expect(receipt.isValid()).is.true;

      // Valid field value
      receipt.agentId = "126";
      expect(receipt.agentIdIsValid()).is.true;
      expect(receipt.isValid()).is.true;
    });

    it("Always present, exchangeToken must be a string representation of an EIP-55 compliant address", async function () {
      // Invalid field value
      receipt.exchangeToken = "0xASFADF";
      expect(receipt.exchangeTokenIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.exchangeToken = "zedzdeadbaby";
      expect(receipt.exchangeTokenIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Valid field value
      receipt.exchangeToken = accounts[0].address;
      expect(receipt.exchangeTokenIsValid()).is.true;
      expect(receipt.isValid()).is.true;

      // Valid field value
      receipt.exchangeToken = "0xec2fd5bd6fc7b576dae82c0b9640969d8de501a2";
      expect(receipt.exchangeTokenIsValid()).is.true;
      expect(receipt.isValid()).is.true;
    });

    it("If present, finalizedDate must be the string representation of BigNumber", async function () {
      // Invalid field value
      receipt.finalizedDate = "zedzdeadbaby";
      expect(receipt.finalizedDateIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.finalizedDate = new Date();
      expect(receipt.finalizedDateIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.finalizedDate = 12;
      expect(receipt.finalizedDateIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.finalizedDate = "0";
      expect(receipt.finalizedDateIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Valid field value
      receipt.finalizedDate = "126";
      expect(receipt.finalizedDateIsValid()).is.true;
      expect(receipt.isValid()).is.true;
    });

    it("If present, condition must be a valid Condition instance", async function () {
      // Invalid field value
      receipt.condition = "zedzdeadbaby";
      expect(receipt.conditionIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.condition = new Date();
      expect(receipt.conditionIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.condition = 12;
      expect(receipt.conditionIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Valid field value
      receipt.condition = "126";
      expect(receipt.conditionIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Valid field value
      receipt.condition = mockCondition(ethers.constants.AddressZero);
      expect(receipt.conditionIsValid()).is.true;
      expect(receipt.isValid()).is.true;
    });

    it("Always present, committedDate must be the string representation of BigNumber", async function () {
      // Invalid field value
      receipt.committedDate = "zedzdeadbaby";
      expect(receipt.committedDateIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.committedDate = new Date();
      expect(receipt.committedDateIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.committedDate = 12;
      expect(receipt.committedDateIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Valid field value
      receipt.committedDate = "126";
      expect(receipt.committedDateIsValid()).is.true;
      expect(receipt.isValid()).is.true;
    });

    it("If present, redeemedDate must be the string representation of BigNumber", async function () {
      // Invalid field value
      receipt.redeemedDate = "zedzdeadbaby";
      expect(receipt.redeemedDateIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.redeemedDate = new Date();
      expect(receipt.redeemedDateIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.redeemedDate = 12;
      expect(receipt.redeemedDateIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Valid field value
      receipt.redeemedDate = "0";
      expect(receipt.redeemedDateIsValid()).is.true;
      expect(receipt.isValid()).is.true;

      // Valid field value
      receipt.redeemedDate = "126";
      expect(receipt.redeemedDateIsValid()).is.true;
      expect(receipt.isValid()).is.true;
    });

    it("Always present, voucherExpired must be a boolean", async function () {
      // Invalid field value
      receipt.voucherExpired = 12;
      expect(receipt.voucherExpiredIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.voucherExpired = "zedzdeadbaby";
      expect(receipt.voucherExpiredIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Valid field value
      receipt.voucherExpired = false;
      expect(receipt.voucherExpiredIsValid()).is.true;
      expect(receipt.isValid()).is.true;

      // Valid field value
      receipt.voucherExpired = true;
      expect(receipt.voucherExpiredIsValid()).is.true;
      expect(receipt.isValid()).is.true;
    });

    it("If present, disputeResolverId must be the string representation of BigNumber", async function () {
      // Invalid field value
      receipt.disputeResolverId = "zedzdeadbaby";
      expect(receipt.disputeResolverIdIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.disputeResolverId = new Date();
      expect(receipt.disputeResolverIdIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.disputeResolverId = 12;
      expect(receipt.disputeResolverIdIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Valid field value
      receipt.disputeResolverId = "0";
      expect(receipt.disputeResolverIdIsValid()).is.true;
      expect(receipt.isValid()).is.true;

      // Valid field value
      receipt.disputeResolverId = "126";
      expect(receipt.disputeResolverIdIsValid()).is.true;
      expect(receipt.isValid()).is.true;
    });

    it("If present, disputedDate must be the string representation of BigNumber", async function () {
      // Invalid field value
      receipt.disputedDate = "zedzdeadbaby";
      expect(receipt.disputedDateIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.disputedDate = new Date();
      expect(receipt.disputedDateIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.disputedDate = 12;
      expect(receipt.disputedDateIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Valid field value
      receipt.disputedDate = "0";
      expect(receipt.disputedDateIsValid()).is.true;
      expect(receipt.isValid()).is.true;

      // Valid field value
      receipt.disputedDate = "126";
      expect(receipt.disputedDateIsValid()).is.true;
      expect(receipt.isValid()).is.true;
    });

    it("If present, escalatedDate must be the string representation of BigNumber", async function () {
      // Invalid field value
      receipt.escalatedDate = "zedzdeadbaby";
      expect(receipt.escalatedDateIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.escalatedDate = new Date();
      expect(receipt.escalatedDateIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.escalatedDate = 12;
      expect(receipt.escalatedDateIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Valid field value
      receipt.escalatedDate = "0";
      expect(receipt.escalatedDateIsValid()).is.true;
      expect(receipt.isValid()).is.true;

      // Valid field value
      receipt.escalatedDate = "126";
      expect(receipt.escalatedDateIsValid()).is.true;
      expect(receipt.isValid()).is.true;
    });

    it("If present, disputeState must be the string representation of a BigNumber", async function () {
      // Invalid field value
      receipt.disputeState = "zedzdeadbaby";
      expect(receipt.disputeStateIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.disputeState = "0";
      expect(receipt.disputeStateIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.disputeState = "126";
      expect(receipt.disputeStateIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Invalid field value
      receipt.disputeState = new Date();
      expect(receipt.disputeStateIsValid()).is.false;
      expect(receipt.isValid()).is.false;

      // Valid field value
      receipt.disputeState = DisputeState.Resolving;
      expect(receipt.disputeStateIsValid()).is.true;
      expect(receipt.isValid()).is.true;
    });

    it("twinReceipt must be a valid TwinReceipt instance", async function () {
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
        receipt = object = await mockReceipt();
        expect(receipt.isValid()).is.true;

        const {
          exchangeId,
          offerId,
          buyerId,
          sellerId,
          price,
          sellerDeposit,
          buyerCancelPenalty,
          offerFees,
          agentId,
          exchangeToken,
          finalizedDate,
          condition,
          committedDate,
          redeemedDate,
          voucherExpired,
          disputeResolverId,
          disputedDate,
          escalatedDate,
          disputeState,
          twinReceipts,
        } = receipt;

        // Struct representation
        struct = [
          exchangeId,
          offerId,
          buyerId,
          sellerId,
          price,
          sellerDeposit,
          buyerCancelPenalty,
          offerFees.toStruct(),
          agentId,
          exchangeToken,
          finalizedDate,
          condition.toStruct(),
          committedDate,
          redeemedDate,
          voucherExpired,
          disputeResolverId,
          disputedDate,
          escalatedDate,
          disputeState,
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

          // Is an Receipt instance
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

          // Marshal back to a receipt instance
          receipt = Receipt.fromStruct(struct);

          // Ensure it marshals back to a valid receipt
          expect(receipt.isValid()).to.be.true;
        });
      });
    });
  });
});
