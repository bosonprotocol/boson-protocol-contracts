const { expect } = require("chai");
const Group = require("../../scripts/domain/Group");
const Condition = require("../../scripts/domain/Condition");
const EvaluationMethod = require("../../scripts/domain/EvaluationMethod");
const Twin = require("../../scripts/domain/Twin");

/**
 *  Test the Group domain entity
 */
describe("Group", function() {

    // Suite-wide scope
    let group, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
    let method, tokenAddress, tokenId;
    let accounts, id, sellerId, offerIds, condition;

    beforeEach( async function () {

        // Get a list of accounts
        accounts = await ethers.getSigners();

        // Required constructor params for Condition
        method = EvaluationMethod.AboveThreshold;
        tokenAddress = accounts[0].address; // just need an address
        tokenId = "5150";
        threshold = "1";

        // Required constructor params for Group
        id = "2112";
        sellerId = "12";
        offerIds = ["1", "2", "4", "8"];

        condition = new Condition(method, tokenAddress, tokenId, threshold);
        expect(condition.isValid()).to.be.true;
        
    });

    context("📋 Constructor", async function () {

        it("Should allow creation of valid, fully populated Group instance", async function () {
            // Create a valid group
            group = new Group(id, sellerId, offerIds, condition);

            // Test each member
            expect(group.idIsValid()).is.true;
            expect(group.sellerIdIsValid()).is.true;
            expect(group.offerIdsIsValid()).is.true;
            expect(group.conditionIsValid()).is.true;

            // Test entity
            expect(group.isValid()).is.true;


        });

    });

    context("📋 Field validations", async function () {

        beforeEach( async function () {

            // Create a valid group, then set fields in tests directly
            group = new Group(id, sellerId, offerIds, condition);
            expect(group.isValid()).is.true;

        });

        it("Always present, id must be the string representation of a BigNumber", async function() {

            // Invalid field value
            group.id = "zedzdeadbaby";
            expect(group.idIsValid()).is.false;
            expect(group.isValid()).is.false;

            // Invalid field value
            group.id = new Date();
            expect(group.idIsValid()).is.false;
            expect(group.isValid()).is.false;

            // Invalid field value
            group.id = 12;
            expect(group.idIsValid()).is.false;
            expect(group.isValid()).is.false;

            // Valid field value
            group.id = "0";
            expect(group.idIsValid()).is.true;
            expect(group.isValid()).is.true;

            // Valid field value
            group.id = "126";
            expect(group.idIsValid()).is.true;
            expect(group.isValid()).is.true;

        });

        it("Always present, sellerId must be the string representation of a BigNumber", async function() {

            // Invalid field value
            group.sellerId = "zedzdeadbaby";
            expect(group.sellerIdIsValid()).is.false;
            expect(group.isValid()).is.false;

            // Invalid field value
            group.sellerId = new Date();
            expect(group.sellerIdIsValid()).is.false;
            expect(group.isValid()).is.false;

            // Invalid field value
            group.sellerId = 12;
            expect(group.sellerIdIsValid()).is.false;
            expect(group.isValid()).is.false;

            // Valid field value
            group.sellerId = "0";
            expect(group.sellerIdIsValid()).is.true;
            expect(group.isValid()).is.true;

            // Valid field value
            group.sellerId = "126";
            expect(group.sellerIdIsValid()).is.true;
            expect(group.isValid()).is.true;

        });

        it("Always present, offerIds must be the array containing string representation of a BigNumber", async function() {

            // Invalid field value
            group.offerIds = "zedzdeadbaby";
            expect(group.offerIdsIsValid()).is.false;
            expect(group.isValid()).is.false;

            // Invalid field value
            group.offerIds = new Date();
            expect(group.offerIdsIsValid()).is.false;

            // Invalid field value
            group.offerIds = 12;
            expect(group.offerIdsIsValid()).is.false;
            expect(group.isValid()).is.false;

            // Valid field value
            group.offerIds = ["1", "2"];
            expect(group.offerIdsIsValid()).is.true;
            expect(group.isValid()).is.true;

            // Valid field value
            group.offerIds = ["126"];
            expect(group.offerIdsIsValid()).is.true;
            expect(group.isValid()).is.true;

        });
        
        it("Always present, condition must be a valid Condition instance", async function() {

            // Invalid field value
            group.condition = "zedzdeadbaby";
            expect(group.conditionIsValid()).is.false;
            expect(group.isValid()).is.false;

            // Invalid field value
            group.condition = new Date();
            expect(group.conditionIsValid()).is.false;
            expect(group.isValid()).is.false;

            // Invalid field value
            group.condition = 12;
            expect(group.conditionIsValid()).is.false;
            expect(group.isValid()).is.false;

            // Valid field value
            group.condition = "126";
            expect(group.conditionIsValid()).is.false;
            expect(group.isValid()).is.false;

            // Valid field value
            group.condition = condition;
            expect(group.conditionIsValid()).is.true;
            expect(group.isValid()).is.true;

        });

    })

    context("📋 Utility functions", async function () {

        beforeEach( async function () {

            // Create a valid group, then set fields in tests directly
            group = new Group(id, sellerId, offerIds, condition);
            expect(group.isValid()).is.true;

            // Get plain object
            object = {
                id,
                sellerId,
                offerIds,
                condition: condition.toObject()
            }

            // Struct representation
            struct = [
                id,
                sellerId,
                offerIds,
                condition.toStruct()
            ]

        })

        context("👉 Static", async function () {

            it("Group.fromObject() should return a Group instance with the same values as the given plain object", async function () {

                // Promote to instance
                promoted = Group.fromObject(object);

                // Is a Group instance
                expect(promoted instanceof Group).is.true;

                // Key values all match
                for ([key, value] of Object.entries(group)) {
                    expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
                }

            });

            it("Group.fromStruct() should return a Group instance of the struct representation", async function () {

                // Marshal back to a group instance
                group = Group.fromStruct(struct)

                // Ensure it is valid
                expect(group.isValid()).to.be.true;

            });

        });

        context("👉 Instance", async function () {

            it("instance.toString() should return a JSON string representation of the Group instance", async function () {

                dehydrated = group.toString();
                rehydrated = JSON.parse(dehydrated);

                for ([key, value] of Object.entries(group)) {
                    expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
                }

            });

            it("instance.clone() should return another Group instance with the same property values", async function () {

                // Get plain object
                clone = group.clone();

                // Is a Group instance
                expect(clone instanceof Group).is.true;

                // Key values all match
                for ([key, value] of Object.entries(group)) {
                    expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
                }

            });

            it("instance.toObject() should return a plain object representation of the Group instance", async function () {

                // Get plain object
                object = group.toObject();

                // Not a Group instance
                expect(object instanceof Group).is.false;

                // Key values all match
                for ([key, value] of Object.entries(group)) {
                    expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
                }

            });

            it("instance.toStruct() should return a struct representation of the Group instance", async function () {

                // Get struct from group
                struct = group.toStruct();

                // Marshal back to a group instance
                group = Group.fromStruct(struct)

                // Ensure it marshals back to a valid twin
                expect(group.isValid()).to.be.true;

            });

        });
    });
});
