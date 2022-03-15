const { expect } = require("chai");
const Buyer = require("../../scripts/domain/Buyer");
const Twin = require("../../scripts/domain/Twin");

/**
 *  Test the Buyer domain entity
 */
describe("Buyer", function() {

    // Suite-wide scope
    let buyer, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
    let id, wallet, active;

    context("📋 Constructor", async function () {

        beforeEach( async function () {

            // Get a list of accounts
            accounts = await ethers.getSigners();
            wallet = accounts[1].address;

            // Required constructor params
            id = "0";
            active = true;
        });

        it("Should allow creation of valid, fully populated Buyer instance", async function () {
            id = "250";

            // Create a valid buyer
            buyer = new Buyer(id, wallet, active);
            expect(buyer.idIsValid()).is.true;
            expect(buyer.walletIsValid()).is.true;
            expect(buyer.activeIsValid()).is.true;
            expect(buyer.isValid()).is.true;

        });

    });

    context("📋 Field validations", async function () {

        beforeEach( async function () {

            // Required constructor params
            id = "199";

            // Create a valid buyer, then set fields in tests directly
            buyer = new Buyer(id, wallet, active);
            expect(buyer.isValid()).is.true;
        });

        it("Always present, id must be the string representation of a BigNumber", async function() {

            // Invalid field value
            buyer.id = "zedzdeadbaby";
            expect(buyer.idIsValid()).is.false;
            expect(buyer.isValid()).is.false;

            // Invalid field value
            buyer.id = new Date();
            expect(buyer.idIsValid()).is.false;
            expect(buyer.isValid()).is.false;

            // Invalid field value
            buyer.id = 12;
            expect(buyer.idIsValid()).is.false;
            expect(buyer.isValid()).is.false;

            // Valid field value
            buyer.id = "0";
            expect(buyer.idIsValid()).is.true;
            expect(buyer.isValid()).is.true;

            // Valid field value
            buyer.id = "126";
            expect(buyer.idIsValid()).is.true;
            expect(buyer.isValid()).is.true;

        });

        it("Always present, wallet must be a string representation of an EIP-55 compliant address", async function() {

            // Invalid field value
            buyer.wallet = "0xASFADF";
            expect(buyer.walletIsValid()).is.false;
            expect(buyer.isValid()).is.false;

            // Invalid field value
            buyer.wallet = "zedzdeadbaby";
            expect(buyer.walletIsValid()).is.false;
            expect(buyer.isValid()).is.false;

            // Valid field value
            buyer.wallet = accounts[0].address;
            expect(buyer.walletIsValid()).is.true;
            expect(buyer.isValid()).is.true;

            // Valid field value
            buyer.wallet = "0xec2fd5bd6fc7b576dae82c0b9640969d8de501a2";
            expect(buyer.walletIsValid()).is.true;
            expect(buyer.isValid()).is.true;

        });

        it("Always present, active must be a boolean", async function() {

            // Invalid field value
            buyer.active = 12;
            expect(buyer.activeIsValid()).is.false;
            expect(buyer.isValid()).is.false;

            // Invalid field value
            buyer.active = "zedzdeadbaby";
            expect(buyer.activeIsValid()).is.false;
            expect(buyer.isValid()).is.false;

            // Valid field value
            buyer.active = false;
            expect(buyer.activeIsValid()).is.true;
            expect(buyer.isValid()).is.true;

            // Valid field value
            buyer.active = true;
            expect(buyer.activeIsValid()).is.true;
            expect(buyer.isValid()).is.true;

        });
    })

    context("📋 Utility functions", async function () {

        beforeEach( async function () {

            // Required constructor params
            id = "2";

            // Create a valid buyer, then set fields in tests directly
            buyer = new Buyer(id, wallet, active);
            expect(buyer.isValid()).is.true;

            // Get plain object
            object = {
                id,
                wallet,
                active
            }

            // Struct representation
            struct = [
                id,
                wallet,
                active
            ]

        })

        context("👉 Static", async function () {

            it("Buyer.fromObject() should return a Buyer instance with the same values as the given plain object", async function () {

                // Promote to instance
                promoted = Buyer.fromObject(object);

                // Is a Buyer instance
                expect(promoted instanceof Buyer).is.true;

                // Key values all match
                for ([key, value] of Object.entries(buyer)) {
                    expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
                }

            });

            it("Buyer.fromStruct() should return a Buyer instance from a struct representation", async function () {

                // Get an instance from the struct
                buyer = Buyer.fromStruct(struct);

                // Ensure it is valid
                expect(buyer.isValid()).to.be.true;

            });

        });

        context("👉 Instance", async function () {

            it("instance.toString() should return a JSON string representation of the Buyer instance", async function () {

                dehydrated = buyer.toString();
                rehydrated = JSON.parse(dehydrated);

                for ([key, value] of Object.entries(buyer)) {
                    expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
                }

            });

            it("instance.toObject() should return a plain object representation of the Buyer instance", async function () {

                // Get plain object
                object = buyer.toObject();

                // Not a Buyer instance
                expect(object instanceof Buyer).is.false;

                // Key values all match
                for ([key, value] of Object.entries(buyer)) {
                    expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
                }

            });

            it("Buyer.toStruct() should return a struct representation of the Buyer instance", async function () {

                // Get struct from buyer
                struct = buyer.toStruct();

                // Marshal back to a buyer instance
                buyer = Buyer.fromStruct(struct)

                // Ensure it marshals back to a valid buyer
                expect(buyer.isValid()).to.be.true;

            });

            it("instance.clone() should return another Buyer instance with the same property values", async function () {

                // Get plain object
                clone = buyer.clone();

                // Is a Buyer instance
                expect(clone instanceof Buyer).is.true;

                // Key values all match
                for ([key, value] of Object.entries(buyer)) {
                    expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
                }

            });

        });
    });
});
