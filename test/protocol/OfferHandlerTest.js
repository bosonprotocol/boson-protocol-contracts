const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");
const { gasLimit } = require("../../environments");

const Role = require("../../scripts/domain/Role");
const Seller = require("../../scripts/domain/Seller");
const DisputeResolver = require("../../scripts/domain/DisputeResolver");
const Offer = require("../../scripts/domain/Offer");
const OfferDates = require("../../scripts/domain/OfferDates");
const OfferDurations = require("../../scripts/domain/OfferDurations");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
const { calculateProtocolFee } = require("../../scripts/util/test-utils.js");

/**
 *  Test the Boson Offer Handler interface
 */
describe("IBosonOfferHandler", function () {
  // Common vars
  let InterfaceIds;
  let accounts, deployer, rando, operator, admin, clerk, treasury, other1;
  let erc165, protocolDiamond, accessController, accountHandler, offerHandler, bosonVoucher, offerStruct, key, value;
  let offer, nextOfferId, invalidOfferId, oneMonth, oneWeek, support, expected, exists;
  let seller, active;
  let id,
    sellerId,
    price,
    sellerDeposit,
    protocolFee,
    buyerCancelPenalty,
    quantityAvailable,
    exchangeToken,
    disputeResolverId,
    metadataUri,
    offerChecksum,
    voided;
  let validFrom,
    validUntil,
    redeemableFrom,
    redeemableUntil,
    offerDates,
    offerDatesStruct,
    offerDatesStructs,
    offerDatesList;
  let fulfillmentPeriod,
    voucherValid,
    disputeValid,
    offerDurations,
    offerDurationsStruct,
    offerDurationsStructs,
    offerDurationsList;
  let protocolFeePrecentage;
  let block, blockNumber;
  let disputeResolver;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();
  });

  beforeEach(async function () {
    // Make accounts available
    accounts = await ethers.getSigners();
    deployer = accounts[0];
    operator = accounts[1];
    admin = accounts[2];
    clerk = accounts[3];
    treasury = accounts[4];
    rando = accounts[5];
    other1 = accounts[6];

    // Deploy the Protocol Diamond
    [protocolDiamond, , , accessController] = await deployProtocolDiamond();

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Grant PROTOCOL role to ProtocolDiamond address and renounces admin
    await accessController.grantRole(Role.PROTOCOL, protocolDiamond.address);

    // Cut the protocol handler facets into the Diamond
    await deployProtocolHandlerFacets(protocolDiamond, ["AccountHandlerFacet", "OfferHandlerFacet"]);

    // Deploy the Protocol client implementation/proxy pairs (currently just the Boson Voucher)
    const protocolClientArgs = [accessController.address, protocolDiamond.address];
    [, , [bosonVoucher]] = await deployProtocolClients(protocolClientArgs, gasLimit);

    // set protocolFeePrecentage
    protocolFeePrecentage = "200"; // 2 %

    // Add config Handler, so offer id starts at 1
    const protocolConfig = [
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      bosonVoucher.address,
      protocolFeePrecentage,
      "100",
      "100",
      "100",
      "100",
      "100",
    ];
    await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);

    // Cast Diamond to IERC165
    erc165 = await ethers.getContractAt("IERC165", protocolDiamond.address);

    // Cast Diamond to IBosonAccountHandler
    accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);

    // Cast Diamond to IBosonOfferHandler
    offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);
  });

  // Interface support (ERC-156 provided by ProtocolDiamond, others by deployed facets)
  context("📋 Interfaces", async function () {
    context("👉 supportsInterface()", async function () {
      it("should indicate support for IBosonOfferHandler interface", async function () {
        // Current interfaceId for IOfferHandler
        support = await erc165.supportsInterface(InterfaceIds.IBosonOfferHandler);

        // Test
        await expect(support, "IBosonOfferHandler interface not supported").is.true;
      });
    });
  });

  // All supported methods - single offer
  context("📋 Offer Handler Methods", async function () {
    beforeEach(async function () {
      // create a seller
      // Required constructor params
      id = "1"; // argument sent to contract for createSeller will be ignored

      active = true;

      // Create a valid seller, then set fields in tests directly
      seller = new Seller(id, operator.address, admin.address, clerk.address, treasury.address, active);
      expect(seller.isValid()).is.true;

      await accountHandler.connect(admin).createSeller(seller);

      // Create a valid dispute resolver
      active = true;
      disputeResolver = new DisputeResolver(id.toString(), other1.address, active);
      expect(disputeResolver.isValid()).is.true;

      // Register the dispute resolver
      await accountHandler.connect(rando).createDisputeResolver(disputeResolver);

      // Some periods in milliseconds
      oneWeek = 604800 * 1000; //  7 days in milliseconds
      oneMonth = 2678400 * 1000; // 31 days in milliseconds

      // The first offer id
      nextOfferId = "1";
      invalidOfferId = "666";

      // Get the current block info
      blockNumber = await ethers.provider.getBlockNumber();
      block = await ethers.provider.getBlock(blockNumber);

      // Required constructor params
      id = sellerId = "1"; // argument sent to contract for createOffer will be ignored
      price = ethers.utils.parseUnits("1.5", "ether").toString();
      sellerDeposit = ethers.utils.parseUnits("0.25", "ether").toString();
      protocolFee = calculateProtocolFee(sellerDeposit, price, protocolFeePrecentage); // will be ignored, but set the correct value here for the tests
      buyerCancelPenalty = ethers.utils.parseUnits("0.05", "ether").toString();
      quantityAvailable = "1";
      exchangeToken = ethers.constants.AddressZero.toString(); // Zero addy ~ chain base currency
      disputeResolverId = "2";
      offerChecksum = "QmYXc12ov6F2MZVZwPs5XeCBbf61cW3wKRk8h3D5NTYj4T"; // not an actual offerChecksum, just some data for tests
      metadataUri = `https://ipfs.io/ipfs/${offerChecksum}`;
      voided = false;

      // Create a valid offer, then set fields in tests directly
      offer = new Offer(
        id,
        sellerId,
        price,
        sellerDeposit,
        protocolFee,
        buyerCancelPenalty,
        quantityAvailable,
        exchangeToken,
        disputeResolverId,
        metadataUri,
        offerChecksum,
        voided
      );
      expect(offer.isValid()).is.true;

      // How that offer looks as a returned struct
      offerStruct = offer.toStruct();

      // Required constructor params
      validFrom = ethers.BigNumber.from(block.timestamp).toString(); // valid from now
      validUntil = ethers.BigNumber.from(block.timestamp)
        .add(oneMonth * 6)
        .toString(); // until 6 months
      redeemableFrom = ethers.BigNumber.from(block.timestamp).add(oneWeek).toString(); // redeemable in 1 week
      redeemableUntil = "0"; // vouchers don't have fixed expiration date

      // Create a valid offerDates, then set fields in tests directly
      offerDates = new OfferDates(validFrom, validUntil, redeemableFrom, redeemableUntil);
      expect(offerDates.isValid()).is.true;

      // How that offer looks as a returned struct
      offerDatesStruct = offerDates.toStruct();

      // Required constructor params
      fulfillmentPeriod = oneMonth.toString(); // fulfillment period is one month
      voucherValid = oneMonth.toString(); // offers valid for one month
      disputeValid = oneWeek.toString(); // dispute is valid for one month

      // Create a valid offerDurations, then set fields in tests directly
      offerDurations = new OfferDurations(fulfillmentPeriod, voucherValid, disputeValid);
      expect(offerDurations.isValid()).is.true;

      // How that offer looks as a returned struct
      offerDurationsStruct = offerDurations.toStruct();
    });

    context("👉 createOffer()", async function () {
      it("should emit an OfferCreated event", async function () {
        // Create an offer, testing for the event
        await expect(offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations))
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(nextOfferId, offer.sellerId, offerStruct, offerDatesStruct, offerDurationsStruct);
      });

      it("should update state", async function () {
        // Create an offer
        await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations);

        // Get the offer as a struct
        [, offerStruct, offerDatesStruct, offerDurationsStruct] = await offerHandler.connect(rando).getOffer(offer.id);

        // Parse into entities
        let returnedOffer = Offer.fromStruct(offerStruct);
        let returnedOfferDates = OfferDates.fromStruct(offerDatesStruct);
        let returnedOfferDurations = OfferDurations.fromStruct(offerDurationsStruct);

        // Returned values should match the input in createOffer
        for ([key, value] of Object.entries(offer)) {
          expect(JSON.stringify(returnedOffer[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDates)) {
          expect(JSON.stringify(returnedOfferDates[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDurations)) {
          expect(JSON.stringify(returnedOfferDurations[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should ignore any provided id and assign the next available", async function () {
        offer.id = "444";

        // Create an offer, testing for the event
        await expect(offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations))
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(nextOfferId, offer.sellerId, offerStruct, offerDatesStruct, offerDurationsStruct);

        // wrong offer id should not exist
        [exists] = await offerHandler.connect(rando).getOffer(offer.id);
        expect(exists).to.be.false;

        // next offer id should exist
        [exists] = await offerHandler.connect(rando).getOffer(nextOfferId);
        expect(exists).to.be.true;
      });

      it("should ignore any provided seller and assign seller id of msg.sender", async function () {
        // set some other sellerId
        offer.sellerId = "123";

        // Create an offer, testing for the event
        await expect(offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations))
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offerStruct, offerDatesStruct, offerDurationsStruct);
      });

      it("should ignore any provided protocol fee and calculate the correct one", async function () {
        // set some protocole fee
        offer.protocolFee = "999";

        // Create an offer, testing for the event
        await expect(offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations))
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(nextOfferId, sellerId, offerStruct, offerDatesStruct, offerDurationsStruct);
      });

      it("after the protocol fee changes, new offers should have the new fee", async function () {
        // Cast Diamond to IBosonConfigHandler
        const configHandler = await ethers.getContractAt("IBosonConfigHandler", protocolDiamond.address);

        // set the new procol fee
        protocolFeePrecentage = "300"; // 3%
        await configHandler.connect(deployer).setProtocolFeePercentage(protocolFeePrecentage);

        offer.id = await offerHandler.getNextOfferId();
        offer.protocolFee = calculateProtocolFee(sellerDeposit, price, protocolFeePrecentage);

        // Create a new offer
        await expect(offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations))
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(nextOfferId, offer.sellerId, offer.toStruct(), offerDatesStruct, offerDurationsStruct);
      });

      context("💔 Revert Reasons", async function () {
        it("Caller not operator of any seller", async function () {
          // Attempt to Create an offer, expecting revert
          await expect(offerHandler.connect(rando).createOffer(offer, offerDates, offerDurations)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );
        });

        it("Valid from date is greater than valid until date", async function () {
          // Reverse the from and until dates
          offerDates.validFrom = ethers.BigNumber.from(Date.now() + oneMonth * 6).toString(); // 6 months from now
          offerDates.validUntil = ethers.BigNumber.from(Date.now()).toString(); // now

          // Attempt to Create an offer, expecting revert
          await expect(offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations)).to.revertedWith(
            RevertReasons.OFFER_PERIOD_INVALID
          );
        });

        it("Valid until date is not in the future", async function () {
          // Set until date in the past
          offerDates.validUntil = ethers.BigNumber.from(offerDates.validFrom - (oneMonth / 1000) * 6).toString(); // 6 months ago

          // Attempt to Create an offer, expecting revert
          await expect(offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations)).to.revertedWith(
            RevertReasons.OFFER_PERIOD_INVALID
          );
        });

        it("Seller deposit is less than protocol fee", async function () {
          // Set buyer deposit less than the protocol fee
          // First calculate the threshold where sellerDeposit == protocolFee and then reduce it for some number
          let threshold = ethers.BigNumber.from(offer.price)
            .mul(protocolFeePrecentage)
            .div(ethers.BigNumber.from("10000").sub(protocolFeePrecentage));
          offer.sellerDeposit = threshold.sub("10").toString();

          // Attempt to Create an offer, expecting revert
          await expect(offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations)).to.revertedWith(
            RevertReasons.OFFER_DEPOSIT_INVALID
          );
        });

        it("Sum of buyer cancel penalty and protocol fee is greater than price", async function () {
          // Set buyer cancel penalty higher than offer price minus protocolFee
          offer.buyerCancelPenalty = ethers.BigNumber.from(offer.price).sub(offer.protocolFee).add("10").toString();

          // Attempt to Create an offer, expecting revert
          await expect(offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations)).to.revertedWith(
            RevertReasons.OFFER_PENALTY_INVALID
          );
        });

        it("Offer cannot be voided at the time of the creation", async function () {
          // Set voided flag to true
          offer.voided = true;

          // Attempt to Create an offer, expecting revert
          await expect(offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations)).to.revertedWith(
            RevertReasons.OFFER_MUST_BE_ACTIVE
          );
        });

        it("Both voucher expiration date and voucher expiraton period are defined", async function () {
          // Set both redeemableUntil and voucherValid
          offerDates.redeemableUntil = (Number(offerDates.redeemableFrom) + oneMonth).toString();
          offerDurations.voucherValid = oneMonth.toString();

          // Attempt to Create an offer, expecting revert
          await expect(offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations)).to.revertedWith(
            RevertReasons.AMBIGOUS_VOUCHER_EXPIRY
          );
        });

        it("Neither of voucher expiration date and voucher expiraton period are defined", async function () {
          // Set both redeemableUntil and voucherValid to "0"
          offerDates.redeemableUntil = "0";
          offerDurations.voucherValid = "0";

          // Attempt to Create an offer, expecting revert
          await expect(offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations)).to.revertedWith(
            RevertReasons.AMBIGOUS_VOUCHER_EXPIRY
          );
        });

        it("Voucher redeemable period is fixed, but it ends before it starts", async function () {
          // Set both redeemableUntil that is less than redeemableFrom
          offerDates.redeemableUntil = (Number(offerDates.redeemableFrom) - 10).toString();
          offerDurations.voucherValid = "0";

          // Attempt to Create an offer, expecting revert
          await expect(offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations)).to.revertedWith(
            RevertReasons.REDEMPTION_PERIOD_INVALID
          );
        });

        it("Voucher redeemable period is fixed, but it ends before offer expires", async function () {
          // Set both redeemableUntil that is more than redeemableFrom but less than validUntil
          offerDates.redeemableFrom = "0";
          offerDates.redeemableUntil = (Number(offerDates.validUntil) - 10).toString();
          offerDurations.voucherValid = "0";

          // Attempt to Create an offer, expecting revert
          await expect(offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations)).to.revertedWith(
            RevertReasons.REDEMPTION_PERIOD_INVALID
          );
        });

        it("Fulfillment period is set to zero", async function () {
          // Set fulfilment period to 0
          offerDurations.fulfillmentPeriod = "0";

          // Attempt to Create an offer, expecting revert
          await expect(offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations)).to.revertedWith(
            RevertReasons.INVALID_FULFILLMENT_PERIOD
          );
        });

        it("Dispute duration is set to zero", async function () {
          // Set dispute duration period to 0
          offerDurations.disputeValid = "0";

          // Attempt to Create an offer, expecting revert
          await expect(offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations)).to.revertedWith(
            RevertReasons.INVALID_DISPUTE_DURATION
          );
        });

        it("Available quantity is set to zero", async function () {
          // Set available quantity to 0
          offer.quantityAvailable = "0";

          // Attempt to Create an offer, expecting revert
          await expect(offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations)).to.revertedWith(
            RevertReasons.INVALID_QUANTITY_AVAILABLE
          );
        });

        it("Dispute resolver wallet is not registered", async function () {
          // Set some address that is not registered as a dispute resolver
          offer.disputeResolverId = "16";

          // Attempt to Create an offer, expecting revert
          await expect(offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations)).to.revertedWith(
            RevertReasons.INVALID_DISPUTE_RESOLVER
          );
        });
      });
    });

    context("👉 voidOffer()", async function () {
      beforeEach(async function () {
        // Create an offer
        await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations);

        // id of the current offer and increment nextOfferId
        id = nextOfferId++;
      });

      it("should emit an OfferVoided event", async function () {
        // call getOffer with offerId to check the seller id in the event
        [, offerStruct] = await offerHandler.getOffer(id);

        // Void the offer, testing for the event
        await expect(offerHandler.connect(operator).voidOffer(id))
          .to.emit(offerHandler, "OfferVoided")
          .withArgs(id, offerStruct.sellerId);
      });

      it("should update state", async function () {
        // Voided field should be initially false
        [, offerStruct] = await offerHandler.getOffer(id);
        expect(offerStruct.voided).is.false;

        // Get the voided status
        [, voided] = await offerHandler.isOfferVoided(id);
        expect(voided).to.be.false;

        // Void the offer
        await offerHandler.connect(operator).voidOffer(id);

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
          await expect(offerHandler.connect(operator).voidOffer(id)).to.revertedWith(RevertReasons.NO_SUCH_OFFER);

          // Set invalid id
          id = "0";

          // Attempt to void the offer, expecting revert
          await expect(offerHandler.connect(operator).voidOffer(id)).to.revertedWith(RevertReasons.NO_SUCH_OFFER);
        });

        it("Caller is not seller", async function () {
          // caller is not the operator of any seller
          // Attempt to update the offer, expecting revert
          await expect(offerHandler.connect(rando).voidOffer(id)).to.revertedWith(RevertReasons.NOT_OPERATOR);

          // caller is an operator of another seller
          // Create a valid seller, then set fields in tests directly
          seller = new Seller(id, rando.address, rando.address, rando.address, rando.address, active);
          await accountHandler.connect(rando).createSeller(seller);

          // Attempt to update the offer, expecting revert
          await expect(offerHandler.connect(rando).voidOffer(id)).to.revertedWith(RevertReasons.NOT_OPERATOR);
        });

        it("Offer already voided", async function () {
          // Void the offer first
          await offerHandler.connect(operator).voidOffer(id);

          // Attempt to void the offer again, expecting revert
          await expect(offerHandler.connect(operator).voidOffer(id)).to.revertedWith(
            RevertReasons.OFFER_HAS_BEEN_VOIDED
          );
        });
      });
    });

    context("👉 extendOffer()", async function () {
      beforeEach(async function () {
        // Create an offer
        await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations);

        // id of the current offer and increment nextOfferId
        id = nextOfferId++;

        // update the values
        offerDates.validUntil = ethers.BigNumber.from(offerDates.validUntil).add("10000").toString();
        offerStruct = offer.toStruct();
      });

      it("should emit an OfferExtended event", async function () {
        // Extend the valid until date, testing for the event
        await expect(offerHandler.connect(operator).extendOffer(offer.id, offerDates.validUntil))
          .to.emit(offerHandler, "OfferExtended")
          .withArgs(id, offer.sellerId, offerDates.validUntil);
      });

      it("should update state", async function () {
        // Update an offer
        await offerHandler.connect(operator).extendOffer(offer.id, offerDates.validUntil);

        // Get the offer as a struct
        [, offerStruct, offerDatesStruct] = await offerHandler.connect(rando).getOffer(offer.id);

        // Parse into entity
        let returnedOfferDates = OfferDates.fromStruct(offerDatesStruct);

        // Returned values should match the input in createOffer
        for ([key, value] of Object.entries(offerDates)) {
          expect(JSON.stringify(returnedOfferDates[key]) === JSON.stringify(value)).is.true;
        }
      });

      context("💔 Revert Reasons", async function () {
        it("Offer does not exist", async function () {
          // Set invalid id
          id = "444";

          // Attempt to void the offer, expecting revert
          await expect(offerHandler.connect(operator).extendOffer(id, offerDates.validUntil)).to.revertedWith(
            RevertReasons.NO_SUCH_OFFER
          );

          // Set invalid id
          id = "0";

          // Attempt to void the offer, expecting revert
          await expect(offerHandler.connect(operator).extendOffer(id, offerDates.validUntil)).to.revertedWith(
            RevertReasons.NO_SUCH_OFFER
          );
        });

        it("Caller is not seller", async function () {
          // caller is not the operator of any seller
          // Attempt to update the offer, expecting revert
          await expect(offerHandler.connect(rando).extendOffer(id, offerDates.validUntil)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );

          // caller is an operator of another seller
          // Create a valid seller, then set fields in tests directly
          seller = new Seller(id, rando.address, rando.address, rando.address, rando.address, active);
          await accountHandler.connect(rando).createSeller(seller);

          // Attempt to update the offer, expecting revert
          await expect(offerHandler.connect(rando).extendOffer(id, offerDates.validUntil)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );
        });

        it("Offer is not extendable, since it's voided", async function () {
          // Void an offer
          await offerHandler.connect(operator).voidOffer(id);

          // Attempt to update an offer, expecting revert
          await expect(offerHandler.connect(operator).extendOffer(offer.id, offerDates.validUntil)).to.revertedWith(
            RevertReasons.OFFER_HAS_BEEN_VOIDED
          );
        });

        it("New valid until date is lower than the existing valid until date", async function () {
          // Make the valid until date the same as the existing offer
          offerDates.validUntil = ethers.BigNumber.from(offerDates.validUntil).sub("10000").toString();

          await expect(offerHandler.connect(operator).extendOffer(offer.id, offerDates.validUntil)).to.revertedWith(
            RevertReasons.OFFER_PERIOD_INVALID
          );

          // Make new the valid until date less than existing one
          offerDates.validUntil = ethers.BigNumber.from(offerDates.validUntil).sub("1").toString();

          // Attempt to update an offer, expecting revert
          await expect(offerHandler.connect(operator).extendOffer(offer.id, offerDates.validUntil)).to.revertedWith(
            RevertReasons.OFFER_PERIOD_INVALID
          );
        });

        it("Valid until date is not in the future", async function () {
          // Set until date in the past
          offerDates.validUntil = ethers.BigNumber.from(offerDates.validFrom - (oneMonth / 1000) * 6).toString(); // 6 months ago

          // Attempt to update an offer, expecting revert
          await expect(offerHandler.connect(operator).extendOffer(offer.id, offerDates.validUntil)).to.revertedWith(
            RevertReasons.OFFER_PERIOD_INVALID
          );
        });
      });
    });

    context("👉 getOffer()", async function () {
      beforeEach(async function () {
        // Create an offer
        await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations);

        // id of the current offer and increment nextOfferId
        id = nextOfferId++;
      });

      it("should return true for exists if offer is found", async function () {
        // Get the exists flag
        [exists] = await offerHandler.connect(rando).getOffer(id);

        // Validate
        expect(exists).to.be.true;
      });

      it("should return false for exists if offer is not found", async function () {
        // Get the exists flag
        [exists] = await offerHandler.connect(rando).getOffer(invalidOfferId);

        // Validate
        expect(exists).to.be.false;
      });

      it("should return the details of the offer as a struct if found", async function () {
        // Get the offer as a struct
        [, offerStruct, offerDatesStruct, offerDurationsStruct] = await offerHandler.connect(rando).getOffer(id);

        // Parse into entities
        offer = Offer.fromStruct(offerStruct);
        offerDates = OfferDates.fromStruct(offerDatesStruct);
        offerDurations = OfferDurations.fromStruct(offerDurationsStruct);

        // Validate
        expect(offer.isValid()).to.be.true;
        expect(offerDates.isValid()).to.be.true;
        expect(offerDurations.isValid()).to.be.true;
      });
    });

    context("👉 getNextOfferId()", async function () {
      beforeEach(async function () {
        // Create an offer
        await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations);

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
        await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations);

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
      beforeEach(async function () {
        // Create an offer
        await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations);

        // id of the current offer and increment nextOfferId
        id = nextOfferId++;
      });

      it("should return true for exists if offer is found, regardless of voided status", async function () {
        // Get the exists flag
        [exists] = await offerHandler.connect(rando).isOfferVoided(id);

        // Validate
        expect(exists).to.be.true;

        // Void offer
        await offerHandler.connect(operator).voidOffer(id);

        // Get the exists flag
        [exists] = await offerHandler.connect(rando).isOfferVoided(id);

        // Validate
        expect(exists).to.be.true;
      });

      it("should return false for exists if offer is not found", async function () {
        // Get the exists flag
        [exists] = await offerHandler.connect(rando).isOfferVoided(invalidOfferId);

        // Validate
        expect(exists).to.be.false;
      });

      it("should return the value as a bool if found", async function () {
        // Get the offer as a struct
        [, voided] = await offerHandler.connect(rando).isOfferVoided(id);

        // Validate
        expect(typeof voided === "boolean").to.be.true;
      });
    });
  });

  // All supported methods - batch offers
  context("📋 Offer Handler Methods - BATCH", async function () {
    let offers = [];
    let offerStructs = [];

    beforeEach(async function () {
      // create a seller
      // Required constructor params
      id = "1"; // argument sent to contract for createSeller will be ignored

      active = true;

      // Create a valid seller, then set fields in tests directly
      seller = new Seller(id, operator.address, admin.address, clerk.address, treasury.address, active);
      expect(seller.isValid()).is.true;

      await accountHandler.connect(admin).createSeller(seller);

      // Create a valid dispute resolver
      active = true;
      disputeResolver = new DisputeResolver(id.toString(), other1.address, active);
      expect(disputeResolver.isValid()).is.true;

      // Register the dispute resolver
      await accountHandler.connect(rando).createDisputeResolver(disputeResolver);

      // Some periods in milliseconds
      oneWeek = 604800 * 1000; //  7 days in milliseconds
      oneMonth = 2678400 * 1000; // 31 days in milliseconds

      // create 5 offers
      offers = [];
      offerStructs = [];
      offerDatesList = [];
      offerDatesStructs = [];
      offerDurationsList = [];
      offerDurationsStructs = [];

      for (let i = 0; i < 5; i++) {
        // Required constructor params
        id = `${i + 1}`;
        sellerId = "1"; //
        price = ethers.utils.parseUnits(`${1.5 + i * 1}`, "ether").toString();
        sellerDeposit = ethers.utils.parseUnits(`${0.25 + i * 0.1}`, "ether").toString();
        buyerCancelPenalty = ethers.utils.parseUnits(`${0.05 + i * 0.1}`, "ether").toString();
        protocolFee = calculateProtocolFee(sellerDeposit, price, protocolFeePrecentage);
        quantityAvailable = `${(i + 1) * 2}`;
        exchangeToken = ethers.constants.AddressZero.toString();
        disputeResolverId = "2";
        offerChecksum = "QmYXc12ov6F2MZVZwPs5XeCBbf61cW3wKRk8h3D5NTYj4T"; // not an actual offerChecksum, just some data for tests
        metadataUri = `https://ipfs.io/ipfs/${offerChecksum}`;
        voided = false;

        // Create a valid offer, then set fields in tests directly
        offer = new Offer(
          id,
          sellerId,
          price,
          sellerDeposit,
          protocolFee,
          buyerCancelPenalty,
          quantityAvailable,
          exchangeToken,
          disputeResolverId,
          metadataUri,
          offerChecksum,
          voided
        );
        expect(offer.isValid()).is.true;

        offers.push(offer);
        offerStructs.push(offer.toStruct());

        // Required constructor params
        validFrom = ethers.BigNumber.from(Date.now() + oneMonth * i).toString();
        validUntil = ethers.BigNumber.from(Date.now() + oneMonth * 6 * (i + 1)).toString();
        redeemableFrom = ethers.BigNumber.from(validUntil + oneWeek).toString();
        redeemableUntil = "0"; // vouchers don't have fixed expiration date

        // Create a valid offerDates, then set fields in tests directly
        offerDates = new OfferDates(validFrom, validUntil, redeemableFrom, redeemableUntil);
        expect(offerDates.isValid()).is.true;

        // How that offer looks as a returned struct
        offerDatesList.push(offerDates);
        offerDatesStructs.push(offerDates.toStruct());

        // Required constructor params
        fulfillmentPeriod = `${(i + 1) * oneMonth}`;
        voucherValid = `${(i + 1) * oneMonth}`;
        disputeValid = `${(i + 1) * oneWeek}`;

        // Create a valid offerDurations, then set fields in tests directly
        offerDurations = new OfferDurations(fulfillmentPeriod, voucherValid, disputeValid);
        expect(offerDurations.isValid()).is.true;

        offerDurationsList.push(offerDurations);
        offerDurationsStructs.push(offerDurations.toStruct());
      }
    });

    context("👉 createOfferBatch()", async function () {
      it("should emit an OfferCreated events for all offers", async function () {
        // Create an offer, testing for the event
        await expect(offerHandler.connect(operator).createOfferBatch(offers, offerDatesList, offerDurationsList))
          .to.emit(offerHandler, "OfferCreated")
          .withArgs("1", offer.sellerId, offerStructs[0], offerDatesStructs[0], offerDurationsStructs[0])
          .withArgs("2", offer.sellerId, offerStructs[1], offerDatesStructs[1], offerDurationsStructs[1])
          .withArgs("3", offer.sellerId, offerStructs[2], offerDatesStructs[2], offerDurationsStructs[2])
          .withArgs("4", offer.sellerId, offerStructs[3], offerDatesStructs[3], offerDurationsStructs[3])
          .withArgs("5", offer.sellerId, offerStructs[4], offerDatesStructs[4], offerDurationsStructs[4]);
      });

      it("should update state", async function () {
        // Create an offer
        await offerHandler.connect(operator).createOfferBatch(offers, offerDatesList, offerDurationsList);

        for (let i = 0; i < 5; i++) {
          // Get the offer as a struct
          [, offerStruct, offerDatesStruct, offerDurationsStruct] = await offerHandler
            .connect(rando)
            .getOffer(`${i + 1}`);

          // Parse into entities
          let returnedOffer = Offer.fromStruct(offerStruct);
          let returnedOfferDates = OfferDates.fromStruct(offerDatesStruct);
          let returnedOfferDurations = OfferDurations.fromStruct(offerDurationsStruct);

          // Returned values should match the input in createOfferBatch
          for ([key, value] of Object.entries(offers[i])) {
            expect(JSON.stringify(returnedOffer[key]) === JSON.stringify(value)).is.true;
          }
          for ([key, value] of Object.entries(offerDatesList[i])) {
            expect(JSON.stringify(returnedOfferDates[key]) === JSON.stringify(value)).is.true;
          }
          for ([key, value] of Object.entries(offerDurationsList[i])) {
            expect(JSON.stringify(returnedOfferDurations[key]) === JSON.stringify(value)).is.true;
          }
        }
      });

      it("should ignore any provided id and assign the next available", async function () {
        offers[0].id = "444";
        offers[1].id = "555";
        offers[2].id = "666";
        offers[3].id = "777";
        offers[4].id = "888";

        // Create an offer, testing for the event
        await expect(offerHandler.connect(operator).createOfferBatch(offers, offerDatesList, offerDurationsList))
          .to.emit(offerHandler, "OfferCreated")
          .withArgs("1", offer.sellerId, offerStructs[0], offerDatesStructs[0], offerDurationsStructs[0])
          .withArgs("2", offer.sellerId, offerStructs[1], offerDatesStructs[1], offerDurationsStructs[1])
          .withArgs("3", offer.sellerId, offerStructs[2], offerDatesStructs[2], offerDurationsStructs[2])
          .withArgs("4", offer.sellerId, offerStructs[3], offerDatesStructs[3], offerDurationsStructs[3])
          .withArgs("5", offer.sellerId, offerStructs[4], offerDatesStructs[4], offerDurationsStructs[4]);

        for (let i = 0; i < 5; i++) {
          // wrong offer id should not exist
          [exists] = await offerHandler.connect(rando).getOffer(offers[i].id);
          expect(exists).to.be.false;

          // next offer id should exist
          [exists] = await offerHandler.connect(rando).getOffer(`${i + 1}`);
          expect(exists).to.be.true;
        }
      });

      it("should ignore any provided seller and assign seller id of msg.sender", async function () {
        // set some other sellerId
        offers[0].sellerId = "123";
        offers[1].sellerId = "234";
        offers[2].sellerId = "345";
        offers[3].sellerId = "456";
        offers[4].sellerId = "567";

        // Create an offer, testing for the event
        await expect(offerHandler.connect(operator).createOfferBatch(offers, offerDatesList, offerDurationsList))
          .to.emit(offerHandler, "OfferCreated")
          .withArgs("1", sellerId, offerStructs[0], offerDatesStructs[0], offerDurationsStructs[0])
          .withArgs("2", sellerId, offerStructs[1], offerDatesStructs[1], offerDurationsStructs[1])
          .withArgs("3", sellerId, offerStructs[2], offerDatesStructs[2], offerDurationsStructs[2])
          .withArgs("4", sellerId, offerStructs[3], offerDatesStructs[3], offerDurationsStructs[3])
          .withArgs("5", sellerId, offerStructs[4], offerDatesStructs[4], offerDurationsStructs[4]);
      });

      context("💔 Revert Reasons", async function () {
        it("Caller not operator of any seller", async function () {
          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(rando).createOfferBatch(offers, offerDatesList, offerDurationsList)
          ).to.revertedWith(RevertReasons.NOT_OPERATOR);
        });

        it("Valid from date is greater than valid until date in some offer", async function () {
          // Reverse the from and until dates
          offerDatesList[4].validFrom = ethers.BigNumber.from(Date.now() + oneMonth * 6).toString(); // 6 months from now
          offerDatesList[4].validUntil = ethers.BigNumber.from(Date.now()).toString(); // now

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOfferBatch(offers, offerDatesList, offerDurationsList)
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Valid until date is not in the future in some offer", async function () {
          // Set until date in the past
          offerDatesList[0].validUntil = ethers.BigNumber.from(
            offerDatesList[0].validFrom - (oneMonth / 1000) * 6
          ).toString(); // 6 months ago

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOfferBatch(offers, offerDatesList, offerDurationsList)
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Seller deposit is less than protocol fee", async function () {
          // Set buyer deposit less than the protocol fee
          // First calculate the threshold where sellerDeposit == protocolFee and then reduce it for some number
          let threshold = ethers.BigNumber.from(offers[0].price)
            .mul(protocolFeePrecentage)
            .div(ethers.BigNumber.from("10000").sub(protocolFeePrecentage));
          offers[0].sellerDeposit = threshold.sub("10").toString();

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOfferBatch(offers, offerDatesList, offerDurationsList)
          ).to.revertedWith(RevertReasons.OFFER_DEPOSIT_INVALID);
        });

        it("Sum of buyer cancel penalty and protocol fee is greater than price", async function () {
          // Set buyer cancel penalty higher than offer price minus protocolFee
          offers[0].buyerCancelPenalty = ethers.BigNumber.from(offer.price)
            .add(offers[0].protocolFee)
            .add("10")
            .toString();

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOfferBatch(offers, offerDatesList, offerDurationsList)
          ).to.revertedWith(RevertReasons.OFFER_PENALTY_INVALID);
        });

        it("No offer cannot be voided at the time of the creation", async function () {
          // Set voided flag to true
          offers[1].voided = true;

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOfferBatch(offers, offerDatesList, offerDurationsList)
          ).to.revertedWith(RevertReasons.OFFER_MUST_BE_ACTIVE);
        });

        it("Creating too many offers", async function () {
          // Try to create the more than 100 offers
          offers = new Array(101).fill(offer);

          // Attempt to create the offers, expecting revert
          await expect(
            offerHandler.connect(operator).createOfferBatch(offers, offerDatesList, offerDurationsList)
          ).to.revertedWith(RevertReasons.TOO_MANY_OFFERS);
        });

        it("Dispute valid duration is 0 for some offer", async function () {
          // Set dispute valid duration to 0
          offerDurationsList[2].disputeValid = "0";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOfferBatch(offers, offerDatesList, offerDurationsList)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_DURATION);
        });

        it("For some offer, both voucher expiration date and voucher expiraton period are defined", async function () {
          // Set both redeemableUntil and voucherValid
          offerDatesList[2].redeemableUntil = ethers.BigNumber.from(offerDatesList[2].redeemableFrom)
            .add(oneMonth)
            .toString();
          offerDurationsList[2].voucherValid = oneMonth.toString();

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOfferBatch(offers, offerDatesList, offerDurationsList)
          ).to.revertedWith(RevertReasons.AMBIGOUS_VOUCHER_EXPIRY);
        });

        it("For some offer, neither of voucher expiration date and voucher expiraton period are defined", async function () {
          // Set both redeemableUntil and voucherValid to "0"
          offerDatesList[1].redeemableUntil = "0";
          offerDurationsList[1].voucherValid = "0";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOfferBatch(offers, offerDatesList, offerDurationsList)
          ).to.revertedWith(RevertReasons.AMBIGOUS_VOUCHER_EXPIRY);
        });

        it("For some offer, voucher redeemable period is fixed, but it ends before it starts", async function () {
          // Set both redeemableUntil that is less than redeemableFrom
          offerDatesList[0].redeemableUntil = ethers.BigNumber.from(offerDatesList[0].redeemableFrom)
            .sub(10)
            .toString();
          offerDurationsList[0].voucherValid = "0";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOfferBatch(offers, offerDatesList, offerDurationsList)
          ).to.revertedWith(RevertReasons.REDEMPTION_PERIOD_INVALID);
        });

        it("For some offer, voucher redeemable period is fixed, but it ends before offer expires", async function () {
          // Set both redeemableUntil that is more than redeemableFrom but less than validUntil
          offerDatesList[2].redeemableFrom = "0";
          offerDatesList[2].redeemableUntil = (Number(offerDatesList[2].validUntil) - 10).toString();
          offerDurationsList[2].voucherValid = "0";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOfferBatch(offers, offerDatesList, offerDurationsList)
          ).to.revertedWith(RevertReasons.REDEMPTION_PERIOD_INVALID);
        });

        it("For some offer, fulfillment period is set to zero", async function () {
          // Set fulfilment period to 0
          offerDurationsList[1].fulfillmentPeriod = "0";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOfferBatch(offers, offerDatesList, offerDurationsList)
          ).to.revertedWith(RevertReasons.INVALID_FULFILLMENT_PERIOD);
        });

        it("For some offer, dispute duration is set to zero", async function () {
          // Set dispute duration period to 0
          offerDurationsList[0].disputeValid = "0";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOfferBatch(offers, offerDatesList, offerDurationsList)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_DURATION);
        });

        it("For some offer, available quantity is set to zero", async function () {
          // Set available quantity to 0
          offers[2].quantityAvailable = "0";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOfferBatch(offers, offerDatesList, offerDurationsList)
          ).to.revertedWith(RevertReasons.INVALID_QUANTITY_AVAILABLE);
        });

        it("For some offer, dispute resolver wallet is not registered", async function () {
          // Set some address that is not registered as a dispute resolver
          offers[1].disputeResolverId = "16";

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOfferBatch(offers, offerDatesList, offerDurationsList)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        it("Number of dispute dates does not match the number of offers", async function () {
          // Make dispute dates longer
          offerDatesList.push(new OfferDates(validFrom, validUntil, redeemableFrom, redeemableUntil));

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOfferBatch(offers, offerDatesList, offerDurationsList)
          ).to.revertedWith(RevertReasons.ARRAY_LENGTH_MISMATCH);

          // Make dispute dates shorter
          offerDatesList = offerDatesList.slice(0, -2);

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOfferBatch(offers, offerDatesList, offerDurationsList)
          ).to.revertedWith(RevertReasons.ARRAY_LENGTH_MISMATCH);
        });

        it("Number of dispute durations does not match the number of offers", async function () {
          // Make dispute durations longer
          offerDurationsList.push(new OfferDurations(fulfillmentPeriod, voucherValid, disputeValid));

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOfferBatch(offers, offerDatesList, offerDurationsList)
          ).to.revertedWith(RevertReasons.ARRAY_LENGTH_MISMATCH);

          // Make dispute durations shorter
          offerDurationsList = offerDurationsList.slice(0, -2);

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(operator).createOfferBatch(offers, offerDatesList, offerDurationsList)
          ).to.revertedWith(RevertReasons.ARRAY_LENGTH_MISMATCH);
        });
      });
    });

    context("👉 voidOfferBatch()", async function () {
      let offersToVoid;
      beforeEach(async function () {
        // Create an offer
        await offerHandler.connect(operator).createOfferBatch(offers, offerDatesList, offerDurationsList);

        offersToVoid = ["1", "3", "5"];
      });

      it("should emit OfferVoided events", async function () {
        // call getOffer with offerId to check the seller id in the event
        [, offerStruct] = await offerHandler.getOffer(offersToVoid[0]);

        // Void offers, testing for the event
        await expect(offerHandler.connect(operator).voidOfferBatch(offersToVoid))
          .to.emit(offerHandler, "OfferVoided")
          .withArgs(offersToVoid[0], offerStruct.sellerId)
          .withArgs(offersToVoid[1], offerStruct.sellerId)
          .withArgs(offersToVoid[2], offerStruct.sellerId);
      });

      it("should update state", async function () {
        // Voided field should be initially false
        for (const id of offersToVoid) {
          [, offerStruct] = await offerHandler.getOffer(id);
          expect(offerStruct.voided).is.false;

          // Get the voided status
          [, voided] = await offerHandler.isOfferVoided(id);
          expect(voided).to.be.false;
        }

        // Void offers
        await offerHandler.connect(operator).voidOfferBatch(offersToVoid);

        for (const id of offersToVoid) {
          // Voided field should be updated
          [, offerStruct] = await offerHandler.getOffer(id);
          expect(offerStruct.voided).is.true;

          // Get the voided status
          [, voided] = await offerHandler.isOfferVoided(id);
          expect(voided).to.be.true;
        }
      });

      context("💔 Revert Reasons", async function () {
        it("Offer does not exist", async function () {
          // Set invalid id
          offersToVoid = ["1", "432", "2"];

          // Attempt to void the offer, expecting revert
          await expect(offerHandler.connect(operator).voidOfferBatch(offersToVoid)).to.revertedWith(
            RevertReasons.NO_SUCH_OFFER
          );

          // Set invalid id
          offersToVoid = ["1", "2", "0"];

          // Attempt to void the offer, expecting revert
          await expect(offerHandler.connect(operator).voidOfferBatch(offersToVoid)).to.revertedWith(
            RevertReasons.NO_SUCH_OFFER
          );
        });

        it("Caller is not seller", async function () {
          // caller is not the operator of any seller
          // Attempt to update the offer, expecting revert
          await expect(offerHandler.connect(rando).voidOfferBatch(offersToVoid)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );

          // caller is an operator of another seller
          seller = new Seller(sellerId, rando.address, rando.address, rando.address, rando.address, active);
          await accountHandler.connect(rando).createSeller(seller);

          // Attempt to update the offer, expecting revert
          await expect(offerHandler.connect(rando).voidOfferBatch(offersToVoid)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );
        });

        it("Offer already voided", async function () {
          // Void the offer first
          await offerHandler.connect(operator).voidOffer("1");

          // Attempt to void the offer again, expecting revert
          await expect(offerHandler.connect(operator).voidOfferBatch(offersToVoid)).to.revertedWith(
            RevertReasons.OFFER_HAS_BEEN_VOIDED
          );

          // try to void the same offer twice
          offersToVoid = ["1", "4", "1"];

          // Attempt to void the offer again, expecting revert
          await expect(offerHandler.connect(operator).voidOfferBatch(offersToVoid)).to.revertedWith(
            RevertReasons.OFFER_HAS_BEEN_VOIDED
          );
        });

        it("Voiding too many offers", async function () {
          // Try to void the more than 100 offers
          offersToVoid = [...Array(101).keys()];

          // Attempt to void the offers, expecting revert
          await expect(offerHandler.connect(operator).voidOfferBatch(offersToVoid)).to.revertedWith(
            RevertReasons.TOO_MANY_OFFERS
          );
        });
      });
    });

    context("👉 extendOfferBatch()", async function () {
      let offersToExtend, newValidUntilDate;
      beforeEach(async function () {
        // Create an offer
        await offerHandler.connect(operator).createOfferBatch(offers, offerDatesList, offerDurationsList);

        offersToExtend = ["1", "3", "5"];
        newValidUntilDate = ethers.BigNumber.from(offerDatesList[4].validUntil).add("10000").toString(); // offer "5" has the highest validUntilDate so we need to set something greater

        for (const offerToExtend of offersToExtend) {
          let i = offerToExtend - 1;
          offers[i].validUntilDate = newValidUntilDate;
        }
      });

      it("should emit OfferExtended events", async function () {
        // Extend the valid until date, testing for the event
        await expect(offerHandler.connect(operator).extendOfferBatch(offersToExtend, newValidUntilDate))
          .to.emit(offerHandler, "OfferExtended")
          .withArgs(offersToExtend[0], offer.sellerId, newValidUntilDate)
          .withArgs(offersToExtend[1], offer.sellerId, newValidUntilDate)
          .withArgs(offersToExtend[2], offer.sellerId, newValidUntilDate);
      });

      it("should update state", async function () {
        // Make sure that state is different from new validUntilDate
        for (const id of offersToExtend) {
          [, offerStruct] = await offerHandler.getOffer(id);
          expect(offerStruct.validUntilDate).is.not.equal(newValidUntilDate);
        }

        // Void offers
        await offerHandler.connect(operator).extendOfferBatch(offersToExtend, newValidUntilDate);

        for (const id of offersToExtend) {
          // validUntilDate field should be updated
          [, , offerDatesStruct] = await offerHandler.getOffer(id);
          expect(offerDatesStruct.validUntil).is.equal(newValidUntilDate);
        }
      });

      context("💔 Revert Reasons", async function () {
        it("Offer does not exist", async function () {
          // Set invalid id
          offersToExtend = ["1", "432", "2"];

          // Attempt to extend the offer, expecting revert
          await expect(
            offerHandler.connect(operator).extendOfferBatch(offersToExtend, newValidUntilDate)
          ).to.revertedWith(RevertReasons.NO_SUCH_OFFER);

          // Set invalid id
          offersToExtend = ["1", "2", "0"];

          // Attempt to extend the offer, expecting revert
          await expect(
            offerHandler.connect(operator).extendOfferBatch(offersToExtend, newValidUntilDate)
          ).to.revertedWith(RevertReasons.NO_SUCH_OFFER);
        });

        it("Caller is not seller", async function () {
          // caller is not the operator of any seller
          // Attempt to extend the offer, expecting revert
          await expect(offerHandler.connect(rando).extendOfferBatch(offersToExtend, newValidUntilDate)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );

          // caller is an operator of another seller
          seller = new Seller(sellerId, rando.address, rando.address, rando.address, rando.address, active);
          await accountHandler.connect(rando).createSeller(seller);

          // Attempt to extend the offer, expecting revert
          await expect(offerHandler.connect(rando).extendOfferBatch(offersToExtend, newValidUntilDate)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );
        });

        it("Offers are not extendable, since one of them it's voided", async function () {
          // Void the offer first
          await offerHandler.connect(operator).voidOffer("3");

          // Attempt to extend the offer, expecting revert
          await expect(
            offerHandler.connect(operator).extendOfferBatch(offersToExtend, newValidUntilDate)
          ).to.revertedWith(RevertReasons.OFFER_HAS_BEEN_VOIDED);
        });

        it("New valid until date is lower than the existing valid until date", async function () {
          // Make the valid until date the same as the existing offer
          newValidUntilDate = ethers.BigNumber.from(offers[4].validUntilDate).sub("10000").toString(); // same as that validUntilDate of offer 5

          await expect(
            offerHandler.connect(operator).extendOfferBatch(offersToExtend, newValidUntilDate)
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);

          // Make new the valid until date less than existing one
          newValidUntilDate = ethers.BigNumber.from(newValidUntilDate).sub("1").toString(); // less that validUntilDate of offer 5

          // Attempt to extend the offer, expecting revert
          await expect(
            offerHandler.connect(operator).extendOfferBatch(offersToExtend, newValidUntilDate)
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Valid until date is not in the future", async function () {
          // Set until date in the past
          newValidUntilDate = ethers.BigNumber.from(offerDatesList[0].validFrom - (oneMonth / 1000) * 6).toString(); // 6 months ago

          // Attempt to extend the offer, expecting revert
          await expect(
            offerHandler.connect(operator).extendOfferBatch(offersToExtend, newValidUntilDate)
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Extending too many offers", async function () {
          // Try to extend the more than 100 offers
          offersToExtend = [...Array(101).keys()];

          // Attempt to extend the offers, expecting revert
          await expect(
            offerHandler.connect(operator).extendOfferBatch(offersToExtend, newValidUntilDate)
          ).to.revertedWith(RevertReasons.TOO_MANY_OFFERS);
        });
      });
    });
  });
});
