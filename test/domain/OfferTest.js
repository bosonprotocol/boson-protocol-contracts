const { expect } = require("chai");
const Offer = require("../../scripts/domain/Offer");

/**
 *  Test the Offer domain entity
 */
describe("Offer", function() {

    // Suite-wide scope
    let offer, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
    let accounts, oneMonth, twoMonths, oneWeek;
    let id,
        price,
        deposit,
        penalty,
        quantity,
        validFromDate,
        validUntilDate,
        redeemableDate,
        fulfillmentPeriodDuration,
        voucherValidDuration,
        seller,
        exchangeToken,
        metadataUri,
        metadataHash,
        voided;

    beforeEach( async function () {

        // Get a list of accounts
        accounts = await ethers.getSigners();

        // Some periods in milliseconds
        oneWeek  =  604800 * 1000; //  7 days in milliseconds
        oneMonth = 2678400 * 1000; // 31 days in milliseconds
        twoMonths = oneMonth * 2;  //  2 months in milliseconds

        // Required constructor params
        id = "0";
        price = ethers.utils.parseUnits("1.5", "ether").toString();
        deposit = price = ethers.utils.parseUnits("0.25", "ether").toString();
        penalty = price = ethers.utils.parseUnits("0.05", "ether").toString();
        quantity = "1";
        validFromDate = ethers.BigNumber.from(Date.now()).toString();                   // valid from now
        validUntilDate = ethers.BigNumber.from(Date.now() + (oneMonth * 6)).toString(); // until 6 months
        redeemableDate = ethers.BigNumber.from(Date.now() + oneWeek).toString();        // redeemable in 1 week
        fulfillmentPeriodDuration = oneMonth.toString();                                // fulfillment period is one month
        voucherValidDuration = oneMonth.toString();                                     // offers valid for one month
        seller = accounts[0].address;
        exchangeToken = ethers.constants.AddressZero.toString();                        // Zero addy ~ chain base currency
        metadataHash = "QmYXc12ov6F2MZVZwPs5XeCBbf61cW3wKRk8h3D5NTYj4T";
        metadataUri = `https://ipfs.io/ipfs/${metadataHash}`;
        voided = false;

    });

    context("📋 Constructor", async function () {

        it("Should allow creation of valid, fully populated Offer instance", async function () {

            id = "2112";

            // Create a valid offer, then set fields in tests directly
            offer = new Offer(
                id,
                price,
                deposit,
                penalty,
                quantity,
                validFromDate,
                validUntilDate,
                redeemableDate,
                fulfillmentPeriodDuration,
                voucherValidDuration,
                seller,
                exchangeToken,
                metadataUri,
                metadataHash,
                voided
            );
            expect(offer.isValid()).is.true;

        });

    });

    context("📋 Field validations", async function () {

        beforeEach( async function () {

            // Required constructor params
            id = "5150";

            // Create a valid offer, then set fields in tests directly
            offer = new Offer(
                id,
                price,
                deposit,
                penalty,
                quantity,
                validFromDate,
                validUntilDate,
                redeemableDate,
                fulfillmentPeriodDuration,
                voucherValidDuration,
                seller,
                exchangeToken,
                metadataUri,
                metadataHash,
                voided
            );
            expect(offer.isValid()).is.true;
        });

        it("Always present, id must be the string representation of a BigNumber", async function() {

            // Invalid field value
            offer.id = "zedzdeadbaby";
            expect(offer.idIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Invalid field value
            offer.id = new Date();
            expect(offer.idIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Invalid field value
            offer.id = 12;
            expect(offer.idIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Valid field value
            offer.id = "0";
            expect(offer.idIsValid()).is.true;
            expect(offer.isValid()).is.true;

            // Valid field value
            offer.id = "126";
            expect(offer.idIsValid()).is.true;
            expect(offer.isValid()).is.true;

        });

        it("Always present, price must be the string representation of a BigNumber", async function() {

            // Invalid field value
            offer.price = "zedzdeadbaby";
            expect(offer.priceIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Invalid field value
            offer.price = new Date();
            expect(offer.priceIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Invalid field value
            offer.price = 12;
            expect(offer.priceIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Valid field value
            offer.price = "0";
            expect(offer.priceIsValid()).is.true;
            expect(offer.isValid()).is.true;

            // Valid field value
            offer.price = "126";
            expect(offer.priceIsValid()).is.true;
            expect(offer.isValid()).is.true;

        });

        it("Always present, deposit must be the string representation of a BigNumber", async function() {

            // Invalid field value
            offer.deposit = "zedzdeadbaby";
            expect(offer.depositIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Invalid field value
            offer.deposit = new Date();
            expect(offer.depositIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Invalid field value
            offer.deposit = 12;
            expect(offer.depositIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Valid field value
            offer.deposit = "0";
            expect(offer.depositIsValid()).is.true;
            expect(offer.isValid()).is.true;

            // Valid field value
            offer.deposit = "126";
            expect(offer.depositIsValid()).is.true;
            expect(offer.isValid()).is.true;

        });

        it("Always present, penalty must be the string representation of a BigNumber", async function() {

            // Invalid field value
            offer.penalty = "zedzdeadbaby";
            expect(offer.penaltyIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Invalid field value
            offer.penalty = new Date();
            expect(offer.penaltyIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Invalid field value
            offer.penalty = 12;
            expect(offer.penaltyIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Valid field value
            offer.penalty = "0";
            expect(offer.penaltyIsValid()).is.true;
            expect(offer.isValid()).is.true;

            // Valid field value
            offer.penalty = "126";
            expect(offer.penaltyIsValid()).is.true;
            expect(offer.isValid()).is.true;

        });

        it("Always present, quantity must be the string representation of a BigNumber", async function() {

            // Invalid field value
            offer.quantity = "zedzdeadbaby";
            expect(offer.quantityIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Invalid field value
            offer.quantity = new Date();
            expect(offer.quantityIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Invalid field value
            offer.quantity = 12;
            expect(offer.quantityIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Valid field value
            offer.quantity = "0";
            expect(offer.quantityIsValid()).is.true;
            expect(offer.isValid()).is.true;

            // Valid field value
            offer.quantity = "126";
            expect(offer.quantityIsValid()).is.true;
            expect(offer.isValid()).is.true;

        });

        it("Always present, validFromDate must be the string representation of a BigNumber", async function() {

            // Invalid field value
            offer.validFromDate = "zedzdeadbaby";
            expect(offer.validFromDateIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Invalid field value
            offer.validFromDate = new Date();
            expect(offer.validFromDateIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Invalid field value
            offer.validFromDate = 12;
            expect(offer.validFromDateIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Valid field value
            offer.validFromDate = "0";
            expect(offer.validFromDateIsValid()).is.true;
            expect(offer.isValid()).is.true;

            // Valid field value
            offer.validFromDate = "126";
            expect(offer.validFromDateIsValid()).is.true;
            expect(offer.isValid()).is.true;

        });

        it("Always present, validUntilDate must be the string representation of a BigNumber", async function() {

            // Invalid field value
            offer.validUntilDate = "zedzdeadbaby";
            expect(offer.validUntilDateIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Invalid field value
            offer.validUntilDate = new Date();
            expect(offer.validUntilDateIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Invalid field value
            offer.validUntilDate = 12;
            expect(offer.validUntilDateIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Valid field value
            offer.validUntilDate = "0";
            expect(offer.validUntilDateIsValid()).is.true;
            expect(offer.isValid()).is.true;

            // Valid field value
            offer.validUntilDate = "126";
            expect(offer.validUntilDateIsValid()).is.true;
            expect(offer.isValid()).is.true;

        });

        it("Always present, redeemableDate must be the string representation of a BigNumber", async function() {

            // Invalid field value
            offer.redeemableDate = "zedzdeadbaby";
            expect(offer.redeemableDateIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Invalid field value
            offer.redeemableDate = new Date();
            expect(offer.redeemableDateIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Invalid field value
            offer.redeemableDate = 12;
            expect(offer.redeemableDateIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Valid field value
            offer.redeemableDate = "0";
            expect(offer.redeemableDateIsValid()).is.true;
            expect(offer.isValid()).is.true;

            // Valid field value
            offer.redeemableDate = "126";
            expect(offer.redeemableDateIsValid()).is.true;
            expect(offer.isValid()).is.true;

        });

        it("Always present, voucherValidDuration must be the string representation of a BigNumber", async function() {

            // Invalid field value
            offer.voucherValidDuration = "zedzdeadbaby";
            expect(offer.voucherValidDurationIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Invalid field value
            offer.voucherValidDuration = new Date();
            expect(offer.voucherValidDurationIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Invalid field value
            offer.voucherValidDuration = 12;
            expect(offer.voucherValidDurationIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Valid field value
            offer.voucherValidDuration = "0";
            expect(offer.voucherValidDurationIsValid()).is.true;
            expect(offer.isValid()).is.true;

            // Valid field value
            offer.voucherValidDuration = "126";
            expect(offer.voucherValidDurationIsValid()).is.true;
            expect(offer.isValid()).is.true;

        });

        it("Always present, fulfillmentPeriodDuration must be the string representation of a BigNumber", async function() {

            // Invalid field value
            offer.fulfillmentPeriodDuration = "zedzdeadbaby";
            expect(offer.fulfillmentPeriodDurationIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Invalid field value
            offer.fulfillmentPeriodDuration = new Date();
            expect(offer.fulfillmentPeriodDurationIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Invalid field value
            offer.fulfillmentPeriodDuration = 12;
            expect(offer.fulfillmentPeriodDurationIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Valid field value
            offer.fulfillmentPeriodDuration = "0";
            expect(offer.fulfillmentPeriodDurationIsValid()).is.true;
            expect(offer.isValid()).is.true;

            // Valid field value
            offer.fulfillmentPeriodDuration = "126";
            expect(offer.fulfillmentPeriodDurationIsValid()).is.true;
            expect(offer.isValid()).is.true;

        });

        it("Always present, seller must be a string representation of an EIP-55 compliant address", async function() {

            // Invalid field value
            offer.seller = "0xASFADF";
            expect(offer.sellerIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Invalid field value
            offer.seller = "zedzdeadbaby";
            expect(offer.sellerIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Valid field value
            offer.seller = accounts[0].address;
            expect(offer.sellerIsValid()).is.true;
            expect(offer.isValid()).is.true;

            // Valid field value
            offer.seller = "0xec2fd5bd6fc7b576dae82c0b9640969d8de501a2";
            expect(offer.sellerIsValid()).is.true;
            expect(offer.isValid()).is.true;

        });

        it("Always present, exchangeToken must be a string representation of an EIP-55 compliant address", async function() {

            // Invalid field value
            offer.exchangeToken = "0xASFADF";
            expect(offer.exchangeTokenIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Invalid field value
            offer.exchangeToken = "zedzdeadbaby";
            expect(offer.exchangeTokenIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Valid field value
            offer.exchangeToken = accounts[0].address;
            expect(offer.exchangeTokenIsValid()).is.true;
            expect(offer.isValid()).is.true;

            // Valid field value
            offer.exchangeToken = "0xec2fd5bd6fc7b576dae82c0b9640969d8de501a2";
            expect(offer.exchangeTokenIsValid()).is.true;
            expect(offer.isValid()).is.true;

        });

        it("Always present, metadataUri must be a non-empty string", async function() {

            // Invalid field value
            offer.metadataUri = 12;
            expect(offer.metadataUriIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Valid field value
            offer.metadataUri = "zedzdeadbaby";
            expect(offer.metadataUriIsValid()).is.true;
            expect(offer.isValid()).is.true;

            // Valid field value
            offer.metadataUri = "https://ipfs.io/ipfs/QmYXc12ov6F2MZVZwPs5XeCBbf61cW3wKRk8h3D5NTYj4T";
            expect(offer.metadataUriIsValid()).is.true;
            expect(offer.isValid()).is.true;

        });

        it("Always present, metadataHash must be a non-empty string", async function() {

            // Invalid field value
            offer.metadataHash = 12;
            expect(offer.metadataHashIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Valid field value
            offer.metadataHash = "zedzdeadbaby";
            expect(offer.metadataHashIsValid()).is.true;
            expect(offer.isValid()).is.true;

            // Valid field value
            offer.metadataHash = "QmYXc12ov6F2MZVZwPs5XeCBbf61cW3wKRk8h3D5NTYj4T";
            expect(offer.metadataHashIsValid()).is.true;
            expect(offer.isValid()).is.true;

        });

        it("Always present, voided must be a boolean", async function() {

            // Invalid field value
            offer.voided = 12;
            expect(offer.voidedIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Invalid field value
            offer.voided = "zedzdeadbaby";
            expect(offer.voidedIsValid()).is.false;
            expect(offer.isValid()).is.false;

            // Valid field value
            offer.voided = false;
            expect(offer.voidedIsValid()).is.true;
            expect(offer.isValid()).is.true;

            // Valid field value
            offer.voided = true;
            expect(offer.voidedIsValid()).is.true;
            expect(offer.isValid()).is.true;

        });

    });

    context("📋 Utility functions", async function () {

        beforeEach( async function () {

            // Required constructor params
            id = "90125";

            // Create a valid offer, then set fields in tests directly
            offer = new Offer(
                id,
                price,
                deposit,
                penalty,
                quantity,
                validFromDate,
                validUntilDate,
                redeemableDate,
                fulfillmentPeriodDuration,
                voucherValidDuration,
                seller,
                exchangeToken,
                metadataUri,
                metadataHash,
                voided
            );
            expect(offer.isValid()).is.true;

            // Create plain object
            object = {
                id,
                price,
                deposit,
                penalty,
                quantity,
                validFromDate,
                validUntilDate,
                redeemableDate,
                fulfillmentPeriodDuration,
                voucherValidDuration,
                seller,
                exchangeToken,
                metadataUri,
                metadataHash,
                voided
            }
        });

        context("👉 Static", async function () {

            it("Offer.fromObject() should return a Offer instance with the same values as the given plain object", async function () {

                // Promote to instance
                promoted = Offer.fromObject(object);

                // Is a Offer instance
                expect(promoted instanceof Offer).is.true;

                // Key values all match
                for ([key, value] of Object.entries(offer)) {
                    expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
                }

            });

            it("Offer.fromStruct() should return a Offer instance with the same values as the given struct", async function () {

                struct = [
                    offer.id,
                    offer.price,
                    offer.deposit,
                    offer.penalty,
                    offer.quantity,
                    offer.validFromDate,
                    offer.validUntilDate,
                    offer.redeemableDate,
                    offer.fulfillmentPeriodDuration,
                    offer.voucherValidDuration,
                    offer.seller,
                    offer.exchangeToken,
                    offer.metadataUri,
                    offer.metadataHash,
                    offer.voided
                ]

                // Get struct
                offer = Offer.fromStruct(struct);

                // Ensure it marshals back to a valid offer
                expect(offer.isValid()).to.be.true;

            });

        });

        context("👉 Instance", async function () {

            it("instance.toString() should return a JSON string representation of the Offer instance", async function () {

                dehydrated = offer.toString();
                rehydrated = JSON.parse(dehydrated);

                for ([key, value] of Object.entries(offer)) {
                    expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
                }

            });

            it("instance.toObject() should return a plain object representation of the Offer instance", async function () {

                // Get plain object
                object = offer.toObject();

                // Not an Offer instance
                expect(object instanceof Offer).is.false;

                // Key values all match
                for ([key, value] of Object.entries(offer)) {
                    expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
                }

            });

            it("Offer.toStruct() should return a struct representation of the Offer instance", async function () {

                // Get struct from offer
                struct = offer.toStruct();

                // Marshal back to an offer instance
                offer = Offer.fromStruct(struct)

                // Ensure it marshals back to a valid offer
                expect(offer.isValid()).to.be.true;

            });

            it("instance.clone() should return another Offer instance with the same property values", async function () {

                // Get plain object
                clone = offer.clone();

                // Is an Offer instance
                expect(clone instanceof Offer).is.true;

                // Key values all match
                for ([key, value] of Object.entries(offer)) {
                    expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
                }

            });

        });

    });

});