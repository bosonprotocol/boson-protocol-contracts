const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");
const { gasLimit } = require('../../environments');

const Role = require("../../scripts/domain/Role");
const Offer = require("../../scripts/domain/Offer");
const { InterfaceIds } = require('../../scripts/config/supported-interfaces.js');
const { RevertReasons } = require('../../scripts/config/revert-reasons.js');
const { deployProtocolDiamond } = require('../../scripts/util/deploy-protocol-diamond.js');
const { deployProtocolHandlerFacets } = require('../../scripts/util/deploy-protocol-handler-facets.js');
const { deployProtocolConfigFacet } = require('../../scripts/util/deploy-protocol-config-facet.js');

/**
 *  Test the Boson Offer Handler interface
 */
describe("IBosonOfferHandler", function() {

    // Common vars
    let accounts, deployer, rando;
    let erc165, protocolDiamond, diamondLoupe, diamondCut, accessController, offerHandler, offerHandlerFacet, offerStruct;
    let offer, nextOfferId, invalidOfferId, oneMonth, twoMonths, oneWeek, support, expected, success;
    let id,
        sellerId,
        price,
        sellerDeposit,
        buyerCancelPenalty,
        quantityAvailable,
        validFromDate,
        validUntilDate,
        redeemableFromDate,
        fulfillmentPeriodDuration,
        voucherValidDuration,
        seller,
        exchangeToken,
        metadataUri,
        metadataHash,
        voided;

    beforeEach( async function () {

        // Make accounts available
        accounts = await ethers.getSigners();
        deployer = accounts[0];
        seller = accounts[1];
        rando = accounts[2];
        
        // Deploy the Protocol Diamond
        [protocolDiamond, diamondLoupe, diamondCut, accessController] = await deployProtocolDiamond();

        // Temporarily grant UPGRADER role to deployer account
        await accessController.grantRole(Role.UPGRADER, deployer.address);

        // Cut the protocol handler facets into the Diamond
        [offerHandlerFacet] = await deployProtocolHandlerFacets(protocolDiamond, ["OfferHandlerFacet"]);

        // Add config Handler, so offer id starts at 1
        const protocolConfig = [
            '0x0000000000000000000000000000000000000000',
            '0x0000000000000000000000000000000000000000',
            '0'
        ];
        [configHandlerFacet] = await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);

        // Cast Diamond to IERC165
        erc165 = await ethers.getContractAt('IERC165', protocolDiamond.address);

        // Cast Diamond to IOfferHandler
        offerHandler = await ethers.getContractAt('IBosonOfferHandler', protocolDiamond.address);

    });

    // Interface support (ERC-156 provided by ProtocolDiamond, others by deployed facets)
    context("📋 Interfaces", async function () {

        context("👉 supportsInterface()", async function () {

            it("should indicate support for IBosonOfferHandler interface", async function () {

                // Current interfaceId for IOfferHandler
                support = await erc165.supportsInterface(InterfaceIds.IBosonOfferHandler);

                // Test
                await expect(
                    support,
                    "IBosonOfferHandler interface not supported"
                ).is.true;

            });

        });

    });

    // All supported methods
    context("📋 Offer Handler Methods", async function () {

        beforeEach( async function () {

            // Some periods in milliseconds
            oneWeek  =  604800 * 1000; //  7 days in milliseconds
            oneMonth = 2678400 * 1000; // 31 days in milliseconds
            twoMonths = oneMonth * 2;  //  2 months in milliseconds

            // The first offer id
            nextOfferId = "1";
            invalidOfferId = "666";

            // Required constructor params
            id = sellerId = "1"; // argument sent to contract for createOffer will be ignored
            price = ethers.utils.parseUnits("1.5", "ether").toString();
            sellerDeposit = price = ethers.utils.parseUnits("0.25", "ether").toString();
            buyerCancelPenalty = price = ethers.utils.parseUnits("0.05", "ether").toString();
            quantityAvailable = "1";
            validFromDate = ethers.BigNumber.from(Date.now()).toString();                   // valid from now
            validUntilDate = ethers.BigNumber.from(Date.now() + (oneMonth * 6)).toString(); // until 6 months
            redeemableFromDate = ethers.BigNumber.from(Date.now() + oneWeek).toString();    // redeemable in 1 week
            fulfillmentPeriodDuration = oneMonth.toString();                                // fulfillment period is one month
            voucherValidDuration = oneMonth.toString();                                     // offers valid for one month
            exchangeToken = ethers.constants.AddressZero.toString();                        // Zero addy ~ chain base currency
            metadataHash = "QmYXc12ov6F2MZVZwPs5XeCBbf61cW3wKRk8h3D5NTYj4T";
            metadataUri = `https://ipfs.io/ipfs/${metadataHash}`;
            voided = false;

            // Create a valid offer, then set fields in tests directly
            offer = new Offer(
                id,
                sellerId,
                price,
                sellerDeposit,
                buyerCancelPenalty,
                quantityAvailable,
                validFromDate,
                validUntilDate,
                redeemableFromDate,
                fulfillmentPeriodDuration,
                voucherValidDuration,
                exchangeToken,
                metadataUri,
                metadataHash,
                voided
            );
            expect(offer.isValid()).is.true;

            // How that offer looks as a returned struct
            offerStruct = offer.toStruct();

        });

        context("👉 createOffer()", async function () {

            it("should emit an OfferCreated event", async function () {

                // Create an offer, testing for the event
                await expect(offerHandler.connect(seller).createOffer(offer))
                    .to.emit(offerHandler, 'OfferCreated')
                    .withArgs(nextOfferId, offer.sellerId, offerStruct);

            });

            it("should update state", async function () {

                // Create an offer
                await offerHandler.connect(seller).createOffer(offer);

                // Get the offer as a struct
                [, offerStruct] = await offerHandler.connect(rando).getOffer(id);

                // Parse into entity
                let returnedOffer = Offer.fromStruct(offerStruct);

                // Returned values should match the input in createOffer
                for ([key, value] of Object.entries(offer)) {
                    expect(JSON.stringify(returnedOffer[key]) === JSON.stringify(value)).is.true;
                }
            });

            it("should ignore any provided id and assign the next available", async function () {

                offer.id = "444";

                // Create an offer, testing for the event
                await expect(offerHandler.connect(seller).createOffer(offer))
                    .to.emit(offerHandler, 'OfferCreated')
                    .withArgs(nextOfferId, offer.sellerId, offerStruct);
            });

            xit("should ignore any provided seller and assign seller id of msg.sender", async function () {
                // TODO: add when accounthandler is finished

                offer.seller = rando;

                // Create an offer, testing for the event
                await expect(offerHandler.connect(seller).createOffer(offer))
                    .to.emit(offerHandler, 'OfferCreated')
                    .withArgs(nextOfferId, offer.sellerId, offerStruct);
            });

            context("💔 Revert Reasons", async function () {

                it("Valid from date is greater than valid until date", async function () {

                    // Reverse the from and until dates
                    offer.validFromDate = ethers.BigNumber.from(Date.now() + (oneMonth * 6)).toString();   // 6 months from now
                    offer.validUntilDate = ethers.BigNumber.from(Date.now()).toString();                   // now

                    // Attempt to Create an offer, expecting revert
                    await expect(offerHandler.connect(seller).createOffer(offer))
                        .to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
                });

                it("Valid until date is not in the future", async function () {

                    // Set until date in the past
                    offer.validUntilDate = ethers.BigNumber.from(Date.now() - (oneMonth * 6)).toString();   // 6 months ago

                    // Attempt to Create an offer, expecting revert
                    await expect(offerHandler.connect(seller).createOffer(offer))
                        .to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
                });

                it("Buyer cancel penalty is less than item price", async function () {

                    // Set buyer cancel penalty higher than offer price
                    offer.buyerCancelPenalty = ethers.BigNumber.from(offer.price).add(10).toString();  

                    // Attempt to Create an offer, expecting revert
                    await expect(offerHandler.connect(seller).createOffer(offer))
                        .to.revertedWith(RevertReasons.OFFER_PENALTY_INVALID);
                });

                it("Offer cannot be voided at the time of the creation", async function () {

                    // Set voided flag to true
                    offer.voided = true;

                    // Attempt to Create an offer, expecting revert
                    await expect(offerHandler.connect(seller).createOffer(offer))
                        .to.revertedWith(RevertReasons.OFFER_MUST_BE_ACTIVE);
                });

            });

        });

        context("👉 updateOffer()", async function () {
            beforeEach( async function () {

                // Create an offer
                await offerHandler.connect(seller).createOffer(offer);

                // id of the current offer and increment nextOfferId
                id = nextOfferId++;

                // set the new fields
                offer.id = id.toString();
                offer.buyerCancelPenalty = ethers.utils.parseUnits("0.02", "ether").toString();
                offer.price = ethers.utils.parseUnits("0.1", "ether").toString();

                offerStruct = offer.toStruct();

            });

            it("should emit an OfferUpdated event", async function () {
              
                // Update an offer, testing for the event
                await expect(offerHandler.connect(seller).updateOffer(offer))
                    .to.emit(offerHandler, 'OfferUpdated')
                    .withArgs(id, offer.sellerId, offerStruct);

            });

            it("should update state", async function () {

                // Update an offer
                await offerHandler.connect(seller).updateOffer(offer);

                // Get the offer as a struct
                [, offerStruct] = await offerHandler.connect(rando).getOffer(id);

                // Parse into entity
                let returnedOffer = Offer.fromStruct(offerStruct);

                // Returned values should match the input in createOffer
                for ([key, value] of Object.entries(offer)) {
                    expect(JSON.stringify(returnedOffer[key]) === JSON.stringify(value)).is.true;
                }
            });

            context("💔 Revert Reasons", async function () {
                it("Offer does not exist", async function () {

                    // Set invalid id
                    offer.id = "444";

                    // Attempt to void the offer, expecting revert
                    await expect(offerHandler.connect(seller).updateOffer(offer))
                        .to.revertedWith(RevertReasons.OFFER_NOT_UPDATEABLE);

                    // Set invalid id
                    offer.id = "0";

                    // Attempt to void the offer, expecting revert
                    await expect(offerHandler.connect(seller).updateOffer(offer))
                        .to.revertedWith(RevertReasons.OFFER_NOT_UPDATEABLE);
                });
                
                xit("Caller is not seller", async function () {
                    // TODO: add when accounthandler is finished

                });

                it("Offer is not updateable, since its voided", async function () {

                    // Void an offer
                    await offerHandler.connect(seller).voidOffer(id);

                    // Attempt to update an offer, expecting revert
                    await expect(offerHandler.connect(seller).updateOffer(offer))
                        .to.revertedWith(RevertReasons.OFFER_NOT_UPDATEABLE);
                });

                xit("Offer is not updateable, since some exchanges exist", async function () {
                    // TODO: add when exchangeHandlerFacet.commitToOffer is implemented

                });

                it("Valid from date is greater than valid until date", async function () {

                    // Reverse the from and until dates
                    offer.validFromDate = ethers.BigNumber.from(Date.now() + (oneMonth * 6)).toString();   // 6 months from now
                    offer.validUntilDate = ethers.BigNumber.from(Date.now()).toString();                   // now

                    // Attempt to update an offer, expecting revert
                    await expect(offerHandler.connect(seller).updateOffer(offer))
                        .to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
                });

                it("Valid until date is not in the future", async function () {

                    // Set until date in the past
                    offer.validUntilDate = ethers.BigNumber.from(Date.now() - (oneMonth * 6)).toString();   // 6 months ago

                    // Attempt to update an offer, expecting revert
                    await expect(offerHandler.connect(seller).updateOffer(offer))
                        .to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
                });

                it("Buyer cancel penalty is less than item price", async function () {

                    // Set buyer cancel penalty higher than offer price
                    offer.buyerCancelPenalty = ethers.BigNumber.from(offer.price).add(10).toString();  

                    // Attempt to update an offer, expecting revert
                    await expect(offerHandler.connect(seller).updateOffer(offer))
                        .to.revertedWith(RevertReasons.OFFER_PENALTY_INVALID);
                });

                it("Offer cannot be voided at the time of the creation", async function () {

                    // Set voided flag to true
                    offer.voided = true;

                    // Attempt to update an offer, expecting revert
                    await expect(offerHandler.connect(seller).updateOffer(offer))
                        .to.revertedWith(RevertReasons.OFFER_MUST_BE_ACTIVE);
                });

            });

        });

        context("👉 voidOffer()", async function () {

            beforeEach( async function () {

                // Create an offer
                await offerHandler.connect(seller).createOffer(offer);

                // id of the current offer and increment nextOfferId
                id = nextOfferId++;

            });

            it("should emit an OfferVoided event", async function () {

                // call getOffer with offerId to check the seller id in the event
                [, offerStruct] = await offerHandler.getOffer(id);

                expect(offerStruct.voided).is.false;

                // Void the offer, testing for the event
                await expect(offerHandler.connect(seller).voidOffer(id))
                    .to.emit(offerHandler, 'OfferVoided')
                    .withArgs(id, offerStruct.sellerId);

                // Voided field should be updated
                [, offerStruct] = await offerHandler.getOffer(id);
                expect(offerStruct.voided).is.true;
            });

            it("should update state", async function () {

                // Voided field should be initially false
                [, offerStruct] = await offerHandler.getOffer(id);
                expect(offerStruct.voided).is.false;

                // Get the voided status
                [, voided] = await offerHandler.isOfferVoided(id);
                expect(voided).to.be.false;

                // Void the offer
                await offerHandler.connect(seller).voidOffer(id); 

                // Voided field should be updated
                [, offerStruct] = await offerHandler.getOffer(id);
                expect(offerStruct.voided).is.true;

                // Get the voided status
                [, voided] = await offerHandler.isOfferVoided(id);
                expect(voided).to.be.true;
            });

            context("💔 Revert Reasons", async function () {

                it("Offer does not exist", async function () {

                    // Set invalid id
                    id = "444";

                    // Attempt to void the offer, expecting revert
                    await expect(offerHandler.connect(seller).voidOffer(id))
                        .to.revertedWith(RevertReasons.NO_SUCH_OFFER);

                    // Set invalid id
                    id = "0";

                    // Attempt to void the offer, expecting revert
                    await expect(offerHandler.connect(seller).voidOffer(id))
                        .to.revertedWith(RevertReasons.NO_SUCH_OFFER);
                });

                xit("Caller is not seller", async function () {

                    // TODO: add back when AccountHandler is working

                    // Attempt to void the offer from a rando account, expecting revert
                    await expect(offerHandler.connect(rando).voidOffer(id))
                        .to.revertedWith(RevertReasons.NOT_SELLER);
                });

                it("Offer already voided", async function () {

                    // Void the offer first
                    await offerHandler.connect(seller).voidOffer(id);

                    // Attempt to void the offer again, expecting revert
                    await expect(offerHandler.connect(seller).voidOffer(id))
                        .to.revertedWith(RevertReasons.OFFER_ALREADY_VOIDED);
                });

            });

        });

        context("👉 extendOffer()", async function () {
            beforeEach( async function () {

                // Create an offer
                await offerHandler.connect(seller).createOffer(offer);

                // id of the current offer and increment nextOfferId
                id = nextOfferId++;

                // update the values
                offer.validUntilDate = ethers.BigNumber.from(offer.validUntilDate).add("10000").toString();
                offerStruct = offer.toStruct();

            });

            it("should emit an OfferUpdated event", async function () {
                offer.validUntilDate = ethers.BigNumber.from(offer.validUntilDate).add("10000").toString();
                offerStruct = offer.toStruct();

                // Extend the valid until dater, testing for the event
                await expect(offerHandler.connect(seller).extendOffer(offer.id, offer.validUntilDate))
                    .to.emit(offerHandler, 'OfferUpdated')
                    .withArgs(id, offer.sellerId, offerStruct);

            });

            it("should update state", async function () {

                // Update an offer
                await offerHandler.connect(seller).extendOffer(offer.id, offer.validUntilDate);

                // Get the offer as a struct
                [, offerStruct] = await offerHandler.connect(rando).getOffer(id);

                // Parse into entity
                let returnedOffer = Offer.fromStruct(offerStruct);

                // Returned values should match the input in createOffer
                for ([key, value] of Object.entries(offer)) {
                    expect(JSON.stringify(returnedOffer[key]) === JSON.stringify(value)).is.true;
                }
            });


            context("💔 Revert Reasons", async function () {
                it("Offer does not exist", async function () {

                    // Set invalid id
                    id = "444";

                    // Attempt to void the offer, expecting revert
                    await expect(offerHandler.connect(seller).extendOffer(id, offer.validUntilDate))
                        .to.revertedWith(RevertReasons.NO_SUCH_OFFER);

                    // Set invalid id
                    id = "0";

                    // Attempt to void the offer, expecting revert
                    await expect(offerHandler.connect(seller).extendOffer(id, offer.validUntilDate))
                        .to.revertedWith(RevertReasons.NO_SUCH_OFFER);
                });
                
                xit("Caller is not seller", async function () {
                    // TODO: add when accounthandler is finished

                });

                it("Offer is not extendable, since its voided", async function () {

                    // Void an offer
                    await offerHandler.connect(seller).voidOffer(id);

                    // Attempt to update an offer, expecting revert
                    await expect(offerHandler.connect(seller).extendOffer(offer.id, offer.validUntilDate))
                        .to.revertedWith(RevertReasons.OFFER_ALREADY_VOIDED);
                });

                it("New valid until date is lower than the existing valid until date", async function () {
                    
                    // Make the valid until date the same as the existing offer
                    offer.validUntilDate = ethers.BigNumber.from(offer.validUntilDate).sub("10000").toString();

                    await expect(offerHandler.connect(seller).extendOffer(offer.id, offer.validUntilDate))
                    .to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);

                    // Make new the valid until date less than existing one
                    offer.validUntilDate = ethers.BigNumber.from(offer.validUntilDate).sub("10000").toString();

                    // Attempt to update an offer, expecting revert
                    await expect(offerHandler.connect(seller).extendOffer(offer.id, offer.validUntilDate))
                        .to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
                });

                it("Valid until date is not in the future", async function () {

                    // Set until date in the past
                    offer.validUntilDate = ethers.BigNumber.from(Date.now() - (oneMonth * 6)).toString();   // 6 months ago

                    // Attempt to update an offer, expecting revert
                    await expect(offerHandler.connect(seller).updateOffer(offer))
                        .to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
                });

            });

        });

        context("👉 getOffer()", async function () {

            beforeEach( async function () {

                // Create an offer
                await offerHandler.connect(seller).createOffer(offer);

                // id of the current offer and increment nextOfferId
                id = nextOfferId++;

            });

            it("should return true for success if offer is found", async function () {

                // Get the success flag
                [success, ] = await offerHandler.connect(rando).getOffer(id);

                // Validate
                expect(success).to.be.true;

            });

            it("should return false for success if offer is not found", async function () {

                // Get the success flag
                [success, ] = await offerHandler.connect(rando).getOffer(invalidOfferId);

                // Validate
                expect(success).to.be.false;

            });

            it("should return the details of the offer as a struct if found", async function () {

                // Get the offer as a struct
                [, offerStruct] = await offerHandler.connect(rando).getOffer(id);

                // Parse into entity
                offer = Offer.fromStruct(offerStruct);

                // Validate
                expect(offer.isValid()).to.be.true;

            });

        });

        context("👉 getNextOfferId()", async function () {

            beforeEach( async function () {

                // Create an offer
                await offerHandler.connect(rando).createOffer(offer);

                // id of the current offer and increment nextOfferId
                id = nextOfferId++;

            });

            it("should return the next offer id", async function () {

                // What we expect the next offer id to be
                expected = nextOfferId;

                // Get the next offer id
                nextOfferId = await offerHandler.connect(rando).getNextOfferId();

                // Verify expectation
                expect(nextOfferId.toString() == expected).to.be.true;

            });

            it("should be incremented after an offer is created", async function () {

                // Create another offer
                await offerHandler.connect(seller).createOffer(offer);

                // What we expect the next offer id to be
                expected = ++nextOfferId;

                // Get the next offer id
                nextOfferId = await offerHandler.connect(rando).getNextOfferId();

                // Verify expectation
                expect(nextOfferId.toString() == expected).to.be.true;

            });

            it("should not be incremented when only getNextOfferId is called", async function () {

                // What we expect the next offer id to be
                expected = nextOfferId;

                // Get the next offer id
                nextOfferId = await offerHandler.connect(rando).getNextOfferId();

                // Verify expectation
                expect(nextOfferId.toString() == expected).to.be.true;

                // Call again
                nextOfferId = await offerHandler.connect(rando).getNextOfferId();

                // Verify expectation
                expect(nextOfferId.toString() == expected).to.be.true;

            });

        });

        context("👉 isOfferVoided()", async function () {

            beforeEach( async function () {

                // Create an offer
                await offerHandler.connect(seller).createOffer(offer);

                // id of the current offer and increment nextOfferId
                id = nextOfferId++;

            });

            it("should return true for success if offer is found, regardless of voided status", async function () {

                // Get the success flag
                [success, ] = await offerHandler.connect(rando).isOfferVoided(id);

                // Validate
                expect(success).to.be.true;

                // Void offer
                await offerHandler.connect(seller).voidOffer(id);

                // Get the success flag
                [success, ] = await offerHandler.connect(rando).isOfferVoided(id);

                // Validate
                expect(success).to.be.true;

            });

            it("should return false for success if offer is not found", async function () {

                // Get the success flag
                [success, ] = await offerHandler.connect(rando).isOfferVoided(invalidOfferId);

                // Validate
                expect(success).to.be.false;

            });

            it("should return the value as a bool if found", async function () {

                // Get the offer as a struct
                [, voided] = await offerHandler.connect(rando).isOfferVoided(id);
                
                // Validate
                expect(typeof voided === "boolean").to.be.true;

            });

        });

        context("👉 isOfferUpdateable()", async function () {

            beforeEach( async function () {

                // Create an offer
                await offerHandler.connect(seller).createOffer(offer);

                // id of the current offer and increment nextOfferId
                id = nextOfferId++;

            });

            it("should return true for success if offer is found, regardless of updateable status", async function () {

                // Get the success flag
                [success, ] = await offerHandler.connect(rando).isOfferUpdateable(id);

                // Validate
                expect(success).to.be.true;

                // Void offer
                await offerHandler.connect(seller).voidOffer(id);

                // Get the success flag
                [success, ] = await offerHandler.connect(rando).isOfferUpdateable(id);

                // Validate
                expect(success).to.be.true;

            });

            it("should return false for success if offer is not found", async function () {

                // Get the success flag
                [success, ] = await offerHandler.connect(rando).isOfferUpdateable(invalidOfferId);

                // Validate
                expect(success).to.be.false;

            });

            it("should return the value as a bool if found", async function () {

                // Get the offer as a struct
                [, updateable] = await offerHandler.connect(rando).isOfferUpdateable(id);
                
                // Validate
                expect(typeof updateable === "boolean").to.be.true;

            });

        });

    });

});