const hre = require("hardhat");
const { getSigners, parseUnits, ZeroAddress } = hre.ethers;
const { expect } = require("chai");
const Offer = require("../../scripts/domain/Offer");
const OfferCreator = require("../../scripts/domain/OfferCreator");
const PriceType = require("../../scripts/domain/PriceType");
const { RoyaltyInfo } = require("../../scripts/domain/RoyaltyInfo");

/**
 *  Test the Offer domain entity
 */
describe("Offer", function () {
  // Suite-wide scope
  let offer, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
  let accounts;
  let id,
    sellerId,
    price,
    sellerDeposit,
    buyerCancelPenalty,
    quantityAvailable,
    exchangeToken,
    priceType,
    metadataUri,
    metadataHash,
    voided,
    collectionIndex,
    royaltyInfo,
    creator,
    buyerId;

  beforeEach(async function () {
    // Get a list of accounts
    accounts = await getSigners();

    // Required constructor params
    id = sellerId = "0";
    price = parseUnits("1.5", "ether").toString();
    sellerDeposit = parseUnits("0.25", "ether").toString();
    buyerCancelPenalty = parseUnits("0.05", "ether").toString();
    quantityAvailable = "1";
    exchangeToken = ZeroAddress.toString(); // Zero addy ~ chain base currency
    priceType = PriceType.Static;
    metadataHash = "QmYXc12ov6F2MZVZwPs5XeCBbf61cW3wKRk8h3D5NTYj4T"; // not an actual metadataHash, just some data for tests
    metadataUri = `https://ipfs.io/ipfs/${metadataHash}`;
    voided = false;
    collectionIndex = "2";
    royaltyInfo = [
      new RoyaltyInfo(
        accounts.slice(0, 3).map((a) => a.address),
        ["16", "32", "64"]
      ),
    ];
    creator = OfferCreator.Seller;
    buyerId = "0";
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated Offer instance", async function () {
      // Create a valid offer, then set fields in tests directly
      offer = new Offer(
        id,
        sellerId,
        price,
        sellerDeposit,
        buyerCancelPenalty,
        quantityAvailable,
        exchangeToken,
        priceType,
        creator,
        metadataUri,
        metadataHash,
        voided,
        collectionIndex,
        royaltyInfo,
        buyerId
      );
      expect(offer.idIsValid()).is.true;
      expect(offer.creatorIdIsValid()).is.true;
      expect(offer.priceIsValid()).is.true;
      expect(offer.sellerDepositIsValid()).is.true;
      expect(offer.buyerCancelPenaltyIsValid()).is.true;
      expect(offer.quantityAvailableIsValid()).is.true;
      expect(offer.exchangeTokenIsValid()).is.true;
      expect(offer.priceTypeIsValid()).is.true;
      expect(offer.metadataUriIsValid()).is.true;
      expect(offer.metadataHashIsValid()).is.true;
      expect(offer.voidedIsValid()).is.true;
      expect(offer.collectionIndexIsValid()).is.true;
      expect(offer.royaltyInfoIsValid()).is.true;
      expect(offer.creatorIsValid()).is.true;
      expect(offer.buyerIdIsValid()).is.true;
      expect(offer.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create a valid offer, then set fields in tests directly
      offer = new Offer(
        id,
        sellerId,
        price,
        sellerDeposit,
        buyerCancelPenalty,
        quantityAvailable,
        exchangeToken,
        priceType,
        creator,
        metadataUri,
        metadataHash,
        voided,
        collectionIndex,
        royaltyInfo,
        buyerId
      );
      expect(offer.isValid()).is.true;
    });

    it("Always present, id must be the string representation of a BigNumber", async function () {
      // Invalid field value
      offer.id = "zedzdeadbaby";
      expect(offer.idIsValid()).is.false;
      expect(offer.isValid()).is.false;

      // Invalid field value
      offer.id = new Date();
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

    it("Always present, price must be the string representation of a BigNumber", async function () {
      // Invalid field value
      offer.price = "zedzdeadbaby";
      expect(offer.priceIsValid()).is.false;
      expect(offer.isValid()).is.false;

      // Valid field value
      offer.price = "0";
      expect(offer.priceIsValid()).is.true;
      expect(offer.isValid()).is.true;

      // Invalid field value
      offer.price = new Date();
      expect(offer.priceIsValid()).is.false;
      expect(offer.isValid()).is.false;

      // Valid field value
      offer.price = "126";
      expect(offer.priceIsValid()).is.true;
      expect(offer.isValid()).is.true;
    });

    it("Always present, sellerDeposit must be the string representation of a BigNumber", async function () {
      // Invalid field value
      offer.sellerDeposit = "zedzdeadbaby";
      expect(offer.sellerDepositIsValid()).is.false;
      expect(offer.isValid()).is.false;

      // Valid field value
      offer.sellerDeposit = "0";
      expect(offer.sellerDepositIsValid()).is.true;
      expect(offer.isValid()).is.true;

      // Valid field value
      offer.sellerDeposit = "126";
      expect(offer.sellerDepositIsValid()).is.true;
      expect(offer.isValid()).is.true;

      // Invalid field value
      offer.sellerDeposit = new Date();
      expect(offer.sellerDepositIsValid()).is.false;
      expect(offer.isValid()).is.false;
    });

    it("Always present, buyerCancelPenalty must be the string representation of a BigNumber", async function () {
      // Invalid field value
      offer.buyerCancelPenalty = "zedzdeadbaby";
      expect(offer.buyerCancelPenaltyIsValid()).is.false;
      expect(offer.isValid()).is.false;

      // Valid field value
      offer.buyerCancelPenalty = "0";
      expect(offer.buyerCancelPenaltyIsValid()).is.true;
      expect(offer.isValid()).is.true;

      // Valid field value
      offer.buyerCancelPenalty = "126";
      expect(offer.buyerCancelPenaltyIsValid()).is.true;
      expect(offer.isValid()).is.true;

      // Invalid field value
      offer.buyerCancelPenalty = new Date();
      expect(offer.buyerCancelPenaltyIsValid()).is.false;
      expect(offer.isValid()).is.false;
    });

    it("Always present, quantityAvailable must be the string representation of a BigNumber", async function () {
      // Invalid field value
      offer.quantityAvailable = "zedzdeadbaby";
      expect(offer.quantityAvailableIsValid()).is.false;
      expect(offer.isValid()).is.false;

      // Valid field value
      offer.quantityAvailable = "0";
      expect(offer.quantityAvailableIsValid()).is.true;
      expect(offer.isValid()).is.true;

      // Valid field value
      offer.quantityAvailable = "126";
      expect(offer.quantityAvailableIsValid()).is.true;
      expect(offer.isValid()).is.true;

      // Invalid field value
      offer.quantityAvailable = new Date();
      expect(offer.quantityAvailableIsValid()).is.false;
      expect(offer.isValid()).is.false;
    });

    it("Always present, sellerId must be the string representation of a BigNumber", async function () {
      // Invalid field value
      offer.creatorId = "zedzdeadbaby";
      expect(offer.creatorIdIsValid()).is.false;
      expect(offer.isValid()).is.false;

      // Valid field value
      offer.creatorId = "0";
      expect(offer.creatorIdIsValid()).is.true;
      expect(offer.isValid()).is.true;

      // Valid field value
      offer.creatorId = "126";
      expect(offer.creatorIdIsValid()).is.true;
      expect(offer.isValid()).is.true;

      // Invalid field value
      offer.creatorId = new Date();
      expect(offer.creatorIdIsValid()).is.false;
      expect(offer.isValid()).is.false;
    });

    it("Always present, exchangeToken must be a string representation of an EIP-55 compliant address", async function () {
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

    it("Always present, priceType must be a valid PriceType", async function () {
      // Invalid field value
      offer.priceType = "zedzdeadbaby";
      expect(offer.priceTypeIsValid()).is.false;
      expect(offer.isValid()).is.false;

      // Invalid field value
      offer.priceType = new Date();
      expect(offer.priceTypeIsValid()).is.false;
      expect(offer.isValid()).is.false;

      // Invalid field value
      offer.priceType = 12;
      expect(offer.priceTypeIsValid()).is.false;
      expect(offer.isValid()).is.false;

      // Invalid field value
      offer.priceType = "0";
      expect(offer.priceTypeIsValid()).is.false;
      expect(offer.isValid()).is.false;

      // Invalid field value
      offer.priceType = "126";
      expect(offer.priceTypeIsValid()).is.false;
      expect(offer.isValid()).is.false;

      // Valid field value
      offer.priceType = PriceType.Static;
      expect(offer.priceTypeIsValid()).is.true;
      expect(offer.isValid()).is.true;

      // Valid field value
      offer.priceType = PriceType.Discovery;
      expect(offer.priceTypeIsValid()).is.true;
      expect(offer.isValid()).is.true;
    });

    it("Always present, metadataUri must be a non-empty string", async function () {
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

    it("Always present, metadataHash must be a non-empty string", async function () {
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

    it("Always present, voided must be a boolean", async function () {
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

    it("Always present, collectionIndex must be the string representation of a BigNumber", async function () {
      // Invalid field value
      offer.collectionIndex = "zedzdeadbaby";
      expect(offer.collectionIndexIsValid()).is.false;
      expect(offer.isValid()).is.false;

      // Invalid field value
      offer.collectionIndex = new Date();
      expect(offer.collectionIndexIsValid()).is.false;
      expect(offer.isValid()).is.false;

      // Invalid field value
      offer.collectionIndex = 12;
      expect(offer.collectionIndexIsValid()).is.false;
      expect(offer.isValid()).is.false;

      // Valid field value
      offer.collectionIndex = "0";
      expect(offer.collectionIndexIsValid()).is.true;
      expect(offer.isValid()).is.true;

      // Valid field value
      offer.collectionIndex = "126";
      expect(offer.collectionIndexIsValid()).is.true;
      expect(offer.isValid()).is.true;
    });

    it("Always present, royaltyInfo must be a RoyaltyInfo instance", async function () {
      // Invalid field value
      offer.royaltyInfo = 12;
      expect(offer.royaltyInfoIsValid()).is.false;
      expect(offer.isValid()).is.false;

      // Invalid field value
      offer.royaltyInfo = "zedzdeadbaby";
      expect(offer.royaltyInfoIsValid()).is.false;
      expect(offer.isValid()).is.false;

      // Valid field value
      offer.royaltyInfo = [
        new RoyaltyInfo(
          accounts.slice(0, 3).map((a) => a.address),
          ["16", "32", "64"]
        ),
      ];
      expect(offer.royaltyInfoIsValid()).is.true;
      expect(offer.isValid()).is.true;

      // Valid field value
      offer.royaltyInfo = [new RoyaltyInfo([], [])];
      expect(offer.royaltyInfoIsValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Required constructor params
      id = sellerId = "90125";

      // Create a valid offer, then set fields in tests directly
      offer = new Offer(
        id,
        sellerId,
        price,
        sellerDeposit,
        buyerCancelPenalty,
        quantityAvailable,
        exchangeToken,
        priceType,
        creator,
        metadataUri,
        metadataHash,
        voided,
        collectionIndex,
        royaltyInfo,
        buyerId
      );
      expect(offer.isValid()).is.true;

      // Create plain object
      object = {
        id,
        sellerId,
        price,
        sellerDeposit,
        buyerCancelPenalty,
        quantityAvailable,
        exchangeToken,
        priceType,
        metadataUri,
        metadataHash,
        voided,
        collectionIndex,
        royaltyInfo,
        creator,
        buyerId,
      };
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
          offer.creatorId,
          offer.price,
          offer.sellerDeposit,
          offer.buyerCancelPenalty,
          offer.quantityAvailable,
          offer.exchangeToken,
          offer.priceType,
          offer.creator,
          offer.metadataUri,
          offer.metadataHash,
          offer.voided,
          offer.collectionIndex,
          royaltyInfo.map((ri) => ri.toStruct()),
          offer.buyerId,
        ];

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
        offer = Offer.fromStruct(struct);

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
