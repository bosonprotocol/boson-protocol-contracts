const { expect } = require("chai");
const Resolution = require("../../scripts/domain/Resolution");

/**
 *  Test the Resolution domain entity
 */
describe("Resolution", function() {

    // Suite-wide scope
    let resolution, object, promoted, clone, dehydrated, rehydrated, key, value;
    let buyerPercent;

    context("📋 Constructor", async function () {

        beforeEach( async function () {

            // Required constructor params
            buyerPercent = "21";

        });

        it("Should allow creation of valid, fully populated Resolution instance", async function () {

            resolution = new Resolution(buyerPercent);
            expect(resolution.buyerPercentIsValid()).is.true;
            expect(resolution.isValid()).is.true;

        });

    });

    context("📋 Field validations", async function () {

        beforeEach( async function () {

            // Required constructor params
            buyerPercent = "51";

            // Create a valid resolution, then set fields in tests directly
            resolution = new Resolution(buyerPercent);
            expect(resolution.isValid()).is.true;

        });

        it("Always present, buyerPercent must be the string representation of a BigNumber between 0 and 10000", async function() {

            // Invalid field value
            resolution.buyerPercent = "zedzdeadbaby";
            expect(resolution.buyerPercentIsValid()).is.false;
            expect(resolution.isValid()).is.false;

            // Invalid field value
            resolution.buyerPercent = new Date();
            expect(resolution.buyerPercentIsValid()).is.false;
            expect(resolution.isValid()).is.false;

            // Invalid field value
            resolution.buyerPercent = 12;
            expect(resolution.buyerPercentIsValid()).is.false;
            expect(resolution.isValid()).is.false;

            // Valid field value
            resolution.buyerPercent = "12000";
            expect(resolution.buyerPercentIsValid()).is.false;
            expect(resolution.isValid()).is.false;

            // Valid field value
            resolution.buyerPercent = "0";
            expect(resolution.buyerPercentIsValid()).is.true;
            expect(resolution.isValid()).is.true;

            // Valid field value
            resolution.buyerPercent = "10000";
            expect(resolution.buyerPercentIsValid()).is.true;
            expect(resolution.isValid()).is.true;

        });

    })

    context("📋 Utility functions", async function () {

        beforeEach( async function () {

            // Required constructor params
            buyerPercent = "5000";

            // Create a valid resolution, then set fields in tests directly
            resolution = new Resolution(buyerPercent);
            expect(resolution.isValid()).is.true;

            // Get plain object
            object = {
                buyerPercent
            }

        })

        context("👉 Static", async function () {

            it("Resolution.fromObject() should return a Resolution instance with the same values as the given plain object", async function () {

                // Promote to instance
                promoted = Resolution.fromObject(object);

                // Is a Resolution instance
                expect(promoted instanceof Resolution).is.true;

                // Key values all match
                for ([key, value] of Object.entries(resolution)) {
                    expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
                }

            });

        });

        context("👉 Instance", async function () {

            it("instance.toString() should return a JSON string representation of the Resolution instance", async function () {

                dehydrated = resolution.toString();
                rehydrated = JSON.parse(dehydrated);

                for ([key, value] of Object.entries(resolution)) {
                    expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
                }

            });

            it("instance.clone() should return another Resolution instance with the same property values", async function () {

                // Get plain object
                clone = resolution.clone();

                // Is an Resolution instance
                expect(clone instanceof Resolution).is.true;

                // Key values all match
                for ([key, value] of Object.entries(resolution)) {
                    expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
                }

            });

            it("instance.toObject() should return a plain object representation of the Resolution instance", async function () {

                // Get plain object
                object = resolution.toObject();

                // Not an Resolution instance
                expect(object instanceof Resolution).is.false;

                // Key values all match
                for ([key, value] of Object.entries(resolution)) {
                    expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
                }

            });
        });

    })

});
