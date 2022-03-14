const { expect } = require("chai");
const Resolver = require("../../scripts/domain/Resolver");

/**
 *  Test the Resolver domain entity
 */
describe("Resolver", function() {

    // Suite-wide scope
    let resolver, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
    let accounts, id, wallet, active;

    context("📋 Constructor", async function () {

        beforeEach( async function () {

            // Get a list of accounts
            accounts = await ethers.getSigners();
            wallet = accounts[1].address;

            // Required constructor params
            id = "0";
            active = true;
        });

        it("Should allow creation of valid, fully populated Resolver instance", async function () {
            id = "170";

            // Create a valid resolver
            resolver = new Resolver(id, wallet, active);
            expect(resolver.idIsValid()).is.true;
            expect(resolver.walletIsValid()).is.true;
            expect(resolver.activeIsValid()).is.true;
            expect(resolver.isValid()).is.true;

        });

    });

    context("📋 Field validations", async function () {

        beforeEach( async function () {

            // Required constructor params
            id = "299";

            // Create a valid resolver, then set fields in tests directly
            resolver = new Resolver(id, wallet, active);
            expect(resolver.isValid()).is.true;
        });

        it("Always present, id must be the string representation of a BigNumber", async function() {

            // Invalid field value
            resolver.id = "zedzdeadbaby";
            expect(resolver.idIsValid()).is.false;
            expect(resolver.isValid()).is.false;

            // Invalid field value
            resolver.id = new Date();
            expect(resolver.idIsValid()).is.false;
            expect(resolver.isValid()).is.false;

            // Invalid field value
            resolver.id = 12;
            expect(resolver.idIsValid()).is.false;
            expect(resolver.isValid()).is.false;

            // Valid field value
            resolver.id = "0";
            expect(resolver.idIsValid()).is.true;
            expect(resolver.isValid()).is.true;

            // Valid field value
            resolver.id = "126";
            expect(resolver.idIsValid()).is.true;
            expect(resolver.isValid()).is.true;

        });

        it("Always present, wallet must be a string representation of an EIP-55 compliant address", async function() {

            // Invalid field value
            resolver.wallet = "0xASFADF";
            expect(resolver.walletIsValid()).is.false;
            expect(resolver.isValid()).is.false;

            // Invalid field value
            resolver.wallet = "zedzdeadbaby";
            expect(resolver.walletIsValid()).is.false;
            expect(resolver.isValid()).is.false;

            // Valid field value
            resolver.wallet = accounts[0].address;
            expect(resolver.walletIsValid()).is.true;
            expect(resolver.isValid()).is.true;

            // Valid field value
            resolver.wallet = "0xec2fd5bd6fc7b576dae82c0b9640969d8de501a2";
            expect(resolver.walletIsValid()).is.true;
            expect(resolver.isValid()).is.true;

        });

        it("Always present, active must be a boolean", async function() {

            // Invalid field value
            resolver.active = 12;
            expect(resolver.activeIsValid()).is.false;
            expect(resolver.isValid()).is.false;

            // Invalid field value
            resolver.active = "zedzdeadbaby";
            expect(resolver.activeIsValid()).is.false;
            expect(resolver.isValid()).is.false;

            // Valid field value
            resolver.active = false;
            expect(resolver.activeIsValid()).is.true;
            expect(resolver.isValid()).is.true;

            // Valid field value
            resolver.active = true;
            expect(resolver.activeIsValid()).is.true;
            expect(resolver.isValid()).is.true;

        });
    })

    context("📋 Utility functions", async function () {

        beforeEach( async function () {

            // Required constructor params
            id = "2";

            // Create a valid resolver, then set fields in tests directly
            resolver = new Resolver(id, wallet, active);
            expect(resolver.isValid()).is.true;

            // Get plain object
            object = {
                id,
                wallet,
                active
            }

        })

        context("👉 Static", async function () {

            it("Resolver.fromObject() should return a Resolver instance with the same values as the given plain object", async function () {

                // Promote to instance
                promoted = Resolver.fromObject(object);

                // Is a Resolver instance
                expect(promoted instanceof Resolver).is.true;

                // Key values all match
                for ([key, value] of Object.entries(resolver)) {
                    expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
                }

            });

        });

        context("👉 Instance", async function () {

            it("instance.toString() should return a JSON string representation of the Resolver instance", async function () {

                dehydrated = resolver.toString();
                rehydrated = JSON.parse(dehydrated);

                for ([key, value] of Object.entries(resolver)) {
                    expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
                }

            });

            it("instance.clone() should return another Resolver instance with the same property values", async function () {

                // Get plain object
                clone = resolver.clone();

                // Is a Resolver instance
                expect(clone instanceof Resolver).is.true;

                // Key values all match
                for ([key, value] of Object.entries(resolver)) {
                    expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
                }

            });

            it("instance.toObject() should return a plain object representation of the Resolver instance", async function () {

                // Get plain object
                object = resolver.toObject();

                // Not a Resolver instance
                expect(object instanceof Resolver).is.false;

                // Key values all match
                for ([key, value] of Object.entries(resolver)) {
                    expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
                }

            });

            it("Resolver.toStruct() should return a struct representation of the Resolver instance", async function () {

                // Get struct from resolver
                struct = resolver.toStruct();

                // Marshal back to a resolver instance
                resolver = Resolver.fromStruct(struct)

                // Ensure it marshals back to a valid resolver
                expect(resolver.isValid()).to.be.true;

            });
        });
    });
});
