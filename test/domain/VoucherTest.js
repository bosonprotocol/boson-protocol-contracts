const { expect } = require("chai");
const Voucher = require("../../scripts/domain/Voucher");
const Resolution = require("../../scripts/domain/Resolution");

/**
 *  Test the Voucher domain entity
 */
describe("Voucher", function() {

    // Suite-wide scope
    let voucher, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
    let exchangeId, committedDate, redeemedDate;

    beforeEach( async function () {

        // Required constructor params
        exchangeId = "2112";
        committedDate = "1661441758";
        redeemedDate = "1661442001";

    });

    context("📋 Constructor", async function () {

        it("Should allow creation of valid, fully populated Voucher instance", async function () {

            voucher = new Voucher(exchangeId, committedDate, redeemedDate);
            expect(voucher.exchangeIdIsValid()).is.true;
            expect(voucher.isValid()).is.true;

        });

    });

    context("📋 Field validations", async function () {

        beforeEach( async function () {

            // Create a valid voucher, then set fields in tests directly
            voucher = new Voucher(exchangeId, committedDate, redeemedDate);
            expect(voucher.isValid()).is.true;

        });

        it("Always present, exchangeId must be the string representation of a BigNumber", async function() {

            // Invalid field value
            voucher.exchangeId = "zedzdeadbaby";
            expect(voucher.exchangeIdIsValid()).is.false;
            expect(voucher.isValid()).is.false;

            // Invalid field value
            voucher.exchangeId = new Date();
            expect(voucher.exchangeIdIsValid()).is.false;
            expect(voucher.isValid()).is.false;

            // Invalid field value
            voucher.exchangeId = 12;
            expect(voucher.exchangeIdIsValid()).is.false;
            expect(voucher.isValid()).is.false;

            // Valid field value
            voucher.exchangeId = "0";
            expect(voucher.exchangeIdIsValid()).is.true;
            expect(voucher.isValid()).is.true;

            // Valid field value
            voucher.exchangeId = "126";
            expect(voucher.exchangeIdIsValid()).is.true;
            expect(voucher.isValid()).is.true;

        });

        it("Always present, committedDate must be the string representation of a BigNumber", async function() {

            // Invalid field value
            voucher.committedDate = "zedzdeadbaby";
            expect(voucher.committedDateIsValid()).is.false;
            expect(voucher.isValid()).is.false;

            // Invalid field value
            voucher.committedDate = new Date();
            expect(voucher.committedDateIsValid()).is.false;
            expect(voucher.isValid()).is.false;

            // Invalid field value
            voucher.committedDate = 12;
            expect(voucher.committedDateIsValid()).is.false;
            expect(voucher.isValid()).is.false;

            // Valid field value
            voucher.committedDate = "0";
            expect(voucher.committedDateIsValid()).is.true;
            expect(voucher.isValid()).is.true;

            // Valid field value
            voucher.committedDate = "126";
            expect(voucher.committedDateIsValid()).is.true;
            expect(voucher.isValid()).is.true;

        });

        it("Always present, redeemedDate must be the string representation of a BigNumber", async function() {

            // Invalid field value
            voucher.redeemedDate = "zedzdeadbaby";
            expect(voucher.redeemedDateIsValid()).is.false;
            expect(voucher.isValid()).is.false;

            // Invalid field value
            voucher.redeemedDate = new Date();
            expect(voucher.redeemedDateIsValid()).is.false;
            expect(voucher.isValid()).is.false;

            // Invalid field value
            voucher.redeemedDate = 12;
            expect(voucher.redeemedDateIsValid()).is.false;
            expect(voucher.isValid()).is.false;

            // Valid field value
            voucher.redeemedDate = "0";
            expect(voucher.redeemedDateIsValid()).is.true;
            expect(voucher.isValid()).is.true;

            // Valid field value
            voucher.redeemedDate = "126";
            expect(voucher.redeemedDateIsValid()).is.true;
            expect(voucher.isValid()).is.true;

        });

    })

    context("📋 Utility functions", async function () {

        beforeEach( async function () {

            // Create a valid voucher, then set fields in tests directly
            voucher = new Voucher(exchangeId, committedDate, redeemedDate);
            expect(voucher.isValid()).is.true;

            // Get plain object
            object = {
                exchangeId,
                committedDate,
                redeemedDate
            };

            // Struct representation
            struct = [
                exchangeId,
                committedDate,
                redeemedDate
            ];

        })

        context("👉 Static", async function () {

            it("Voucher.fromObject() should return a Voucher instance with the same values as the given plain object", async function () {

                // Promote to instance
                promoted = Voucher.fromObject(object);

                // Is a Voucher instance
                expect(promoted instanceof Voucher).is.true;

                // Key values all match
                for ([key, value] of Object.entries(voucher)) {
                    expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
                }

            });

            it("Voucher.toStruct() should return a Voucher instance from a struct representation", async function () {

                // Marshal back to a resolution instance
                voucher = Voucher.fromStruct(struct)

                // Ensure it marshals back to a valid voucher
                expect(voucher.isValid()).to.be.true;

            });

        });

        context("👉 Instance", async function () {

            it("instance.toString() should return a JSON string representation of the Voucher instance", async function () {

                dehydrated = voucher.toString();
                rehydrated = JSON.parse(dehydrated);

                for ([key, value] of Object.entries(voucher)) {
                    expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
                }

            });

            it("instance.clone() should return another Voucher instance with the same property values", async function () {

                // Get plain object
                clone = voucher.clone();

                // Is an Voucher instance
                expect(clone instanceof Voucher).is.true;

                // Key values all match
                for ([key, value] of Object.entries(voucher)) {
                    expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
                }

            });

            it("instance.toObject() should return a plain object representation of the Voucher instance", async function () {

                // Get plain object
                object = voucher.toObject();

                // Not an Voucher instance
                expect(object instanceof Voucher).is.false;

                // Key values all match
                for ([key, value] of Object.entries(voucher)) {
                    expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
                }

            });

            it("instance.toStruct() should return a struct representation of the Voucher instance", async function () {

                // Get struct from instance
                struct = voucher.toStruct();

                // Marshal back to a voucher instance
                voucher = Voucher.fromStruct(struct)

                // Ensure it marshals back to a valid voucher
                expect(voucher.isValid()).to.be.true;

            });

        });

    })

});