const { expect } = require("chai");
const Voucher = require("../../scripts/domain/Voucher");

/**
 *  Test the Voucher domain entity
 */
describe("Voucher", function() {

    // Suite-wide scope
    let voucher, object, promoted, clone, dehydrated, rehydrated, key, value;
    let exchangeId;

    context("📋 Constructor", async function () {

        beforeEach( async function () {

            // Required constructor params
            exchangeId = "2112";

        });

        it("Should allow creation of valid, fully populated Voucher instance", async function () {

            voucher = new Voucher(exchangeId);
            expect(voucher.exchangeIdIsValid()).is.true;
            expect(voucher.isValid()).is.true;

        });

    });

    context("📋 Field validations", async function () {

        beforeEach( async function () {

            // Required constructor params
            exchangeId = "5150";

            // Create a valid voucher, then set fields in tests directly
            voucher = new Voucher(exchangeId);
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

    })

    context("📋 Utility functions", async function () {

        beforeEach( async function () {

            // Required constructor params
            exchangeId = "90125";

            // Create a valid voucher, then set fields in tests directly
            voucher = new Voucher(exchangeId);
            expect(voucher.isValid()).is.true;

            // Get plain object
            object = {
                exchangeId
            }

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
        });

    })

});