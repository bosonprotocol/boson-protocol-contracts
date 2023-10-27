const hre = require("hardhat");
const ethers = hre.ethers;
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond");
const { deployAndCutFacets } = require("../../scripts/util/deploy-protocol-handler-facets");
const { getFacetsWithArgs, calculateContractAddress, applyPercentage } = require("../util/utils");
const { oneWeek, oneMonth, maxPriorityFeePerGas, ROYALTY_REGISTRY_ADDRESS } = require("../util/constants");

const { mockSeller, mockAuthToken, mockVoucherInitValues, mockOffer, mockDisputeResolver } = require("../util/mock");
const { assert } = require("chai");
const Role = require("../../scripts/domain/Role");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const RoyaltyInfo = require("../../scripts/domain/RoyaltyInfo");
const { RoyaltyRecipient, RoyaltyRecipientList } = require("../../scripts/domain/RoyaltyRecipient.js");

// Requirements to run this test:
// - Royalty registry is a submodule. If you didn't clone repository recursively, run `git submodule update --init --recursive` to get it.
// - Set hardhat config to hardhat-fork.config.js. e.g.:
//   npx hardhat test test/integration/royalty-registry.js --config ./hardhat-fork.config.js
describe("[@skip-on-coverage] Royalty registry integration", function () {
  let royaltyRegistry;
  let bosonVoucher, bosonToken;
  let deployer, protocol, assistant, buyer, DR, other1, other2;
  let seller, royaltyInfo;
  let offerHandler, exchangeHandler;
  let offerId, offerPrice, exchangeId;

  before(async function () {
    let protocolTreasury;
    [deployer, protocol, assistant, protocolTreasury, buyer, DR, other1, other2] = await ethers.getSigners();

    royaltyRegistry = await ethers.getContractAt("RoyaltyEngineV1", ROYALTY_REGISTRY_ADDRESS);

    // Deploy diamond
    let [protocolDiamond, , , , accessController] = await deployProtocolDiamond(maxPriorityFeePerGas);

    // Cast Diamond to contract interfaces
    const accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);
    offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);
    const fundsHandler = await ethers.getContractAt("IBosonFundsHandler", protocolDiamond.address);
    exchangeHandler = await ethers.getContractAt("IBosonExchangeHandler", protocolDiamond.address);

    // Grant roles
    await accessController.grantRole(Role.PROTOCOL, protocol.address);
    await accessController.grantRole(Role.PROTOCOL, protocolDiamond.address);
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    const protocolClientArgs = [protocolDiamond.address];

    const [, beacons, proxies, bv] = await deployProtocolClients(protocolClientArgs, maxPriorityFeePerGas);

    [bosonVoucher] = bv;
    const [beacon] = beacons;
    const [proxy] = proxies;

    const protocolFeeFlatBoson = ethers.utils.parseUnits("0.01", "ether").toString();
    const buyerEscalationDepositPercentage = "1000"; // 10%

    [bosonToken] = await deployMockTokens();

    // Add config Handler, so ids start at 1, and so voucher address can be found
    const protocolConfig = [
      // Protocol addresses
      {
        treasury: protocolTreasury.address,
        token: bosonToken.address,
        voucherBeacon: beacon.address,
        beaconProxy: proxy.address,
      },
      // Protocol limits
      {
        maxExchangesPerBatch: 100,
        maxOffersPerGroup: 100,
        maxTwinsPerBundle: 100,
        maxOffersPerBundle: 100,
        maxOffersPerBatch: 100,
        maxTokensPerWithdrawal: 100,
        maxFeesPerDisputeResolver: 100,
        maxEscalationResponsePeriod: oneMonth,
        maxDisputesPerBatch: 100,
        maxAllowedSellers: 100,
        maxTotalOfferFeePercentage: 4000, //40%
        maxRoyaltyPercentage: 1000, //10%
        maxResolutionPeriod: oneMonth,
        minDisputePeriod: oneWeek,
        maxPremintedVouchers: 10000,
      },
      //Protocol fees
      {
        percentage: 200, // 2%
        flatBoson: protocolFeeFlatBoson,
        buyerEscalationDepositPercentage,
      },
    ];

    const facetNames = [
      "DisputeResolverHandlerFacet",
      "ExchangeHandlerFacet",
      "OfferHandlerFacet",
      "AccountHandlerFacet",
      "SellerHandlerFacet",
      "FundsHandlerFacet",
      "ProtocolInitializationHandlerFacet",
      "ConfigHandlerFacet",
    ];

    const facetsToDeploy = await getFacetsWithArgs(facetNames, protocolConfig);

    // Cut the protocol handler facets into the Diamond
    await deployAndCutFacets(protocolDiamond.address, facetsToDeploy, maxPriorityFeePerGas);

    seller = mockSeller(assistant.address, assistant.address, assistant.address, assistant.address);

    const emptyAuthToken = mockAuthToken();
    const voucherInitValues = mockVoucherInitValues();
    voucherInitValues.royaltyPercentage = 100; // 1%
    await accountHandler.connect(assistant).createSeller(seller, emptyAuthToken, voucherInitValues);

    // Add royalty recipients
    const royaltyRecipientList = new RoyaltyRecipientList([
      new RoyaltyRecipient(other1.address, "100", "other1"),
      new RoyaltyRecipient(other2.address, "200", "other2"),
    ]);
    await accountHandler.connect(assistant).addRoyaltyRecipients(seller.id, royaltyRecipientList.toStruct());

    const disputeResolver = mockDisputeResolver(DR.address, DR.address, DR.address, DR.address, true);

    const disputeResolverFees = [new DisputeResolverFee(ethers.constants.AddressZero, "Native", "0")];
    const sellerAllowList = [];

    await accountHandler.connect(DR).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

    const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
    offer.quantityAvailable = 10;
    offer.royaltyInfo = new RoyaltyInfo([other1.address], [100]);
    royaltyInfo = offer.royaltyInfo;
    offerPrice = offer.price;

    await offerHandler
      .connect(assistant)
      .createOffer(offer.toStruct(), offerDates.toStruct(), offerDurations.toStruct(), disputeResolverId, "0");

    const voucherAddress = calculateContractAddress(accountHandler.address, seller.id);
    bosonVoucher = await ethers.getContractAt("BosonVoucher", voucherAddress);

    // Pool needs to cover both seller deposit and price
    const pool = ethers.BigNumber.from(offer.sellerDeposit).add(offer.price);
    await fundsHandler.connect(assistant).depositFunds(seller.id, ethers.constants.AddressZero, pool, {
      value: pool,
    });

    exchangeId = 1;
    offerId = 1;
  });

  context("EIP2981", function () {
    it("Normal voucher", async function () {
      // Commit to an offer
      await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: offerPrice });

      // get royalty info directly from voucher contract
      let [recipient, royaltyAmount] = await bosonVoucher.royaltyInfo(exchangeId, offerPrice);

      // Expectations
      let expectedRecipient = other1.address;
      let expectedRoyaltyAmount = applyPercentage(offerPrice, royaltyInfo.bps[0]);

      assert.equal(recipient, expectedRecipient, "Receiver address is incorrect");
      assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");

      // get royalty info directly from royalty registry
      let [recipients, amounts] = await royaltyRegistry.getRoyaltyView(bosonVoucher.address, exchangeId, offerPrice);

      // Expectations
      let expectedRecipients = [expectedRecipient];
      let expectedRoyaltyAmounts = [expectedRoyaltyAmount];

      assert.deepEqual(recipients, expectedRecipients, "Receiver address is incorrect");
      assert.deepEqual(
        amounts.map((a) => a.toString()),
        expectedRoyaltyAmounts,
        "Royalty amount is incorrect"
      );
    });

    it("Preminted voucher", async function () {
      await offerHandler.connect(assistant).reserveRange(offerId, 1, assistant.address);
      await bosonVoucher.connect(assistant).preMint(offerId, 1);

      // get royalty info directly from voucher contract
      let [recipient, royaltyAmount] = await bosonVoucher.royaltyInfo(exchangeId, offerPrice);

      // Expectations
      let expectedRecipient = other1.address;
      let expectedRoyaltyAmount = applyPercentage(offerPrice, royaltyInfo.bps[0]);

      assert.equal(recipient, expectedRecipient, "Receiver address is incorrect");
      assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");

      // get royalty info directly from royalty registry
      let [recipients, amounts] = await royaltyRegistry.getRoyaltyView(bosonVoucher.address, exchangeId, offerPrice);

      // Expectations
      let expectedRecipients = [expectedRecipient];
      let expectedRoyaltyAmounts = [expectedRoyaltyAmount];

      assert.deepEqual(recipients, expectedRecipients, "Receiver address is incorrect");
      assert.deepEqual(
        amounts.map((a) => a.toString()),
        expectedRoyaltyAmounts,
        "Royalty amount is incorrect"
      );
    });

    it("Preminted voucher - multiple ranges", async function () {
      // create offer
      const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
      offer.quantityAvailable = "10";
      offer.royaltyInfo = new RoyaltyInfo([other1.address], [100]);
      royaltyInfo = offer.royaltyInfo;
      offerPrice = offer.price;
      const offerStruct = offer.toStruct();
      const offerDatesStruct = offerDates.toStruct();
      const offerDurationsStruct = offerDurations.toStruct();

      for (let i = 0; i < 50; i++) {
        await offerHandler
          .connect(assistant)
          .createOffer(offerStruct, offerDatesStruct, offerDurationsStruct, disputeResolverId, "0");
        offerId++;

        // reserve length
        await offerHandler.connect(assistant).reserveRange(offerId, 10, assistant.address);
        // await bosonVoucher.connect(assistant).preMint(offerId, 10);
      }
      offerId = 25;
      exchangeId = (offerId - 2) * 10 + 5; // offer 5 has vouchers between 31 and 40

      await bosonVoucher.connect(assistant).preMint(offerId, 10);

      // get royalty info directly from voucher contract
      let [recipient, royaltyAmount] = await bosonVoucher.royaltyInfo(exchangeId, offerPrice);

      // Expectations
      let expectedRecipient = other1.address;
      let expectedRoyaltyAmount = applyPercentage(offerPrice, royaltyInfo.bps[0]);

      assert.equal(recipient, expectedRecipient, "Receiver address is incorrect");
      assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");

      // get royalty info directly from royalty registry
      let [recipients, amounts] = await royaltyRegistry.getRoyaltyView(bosonVoucher.address, exchangeId, offerPrice);

      // Expectations
      let expectedRecipients = [expectedRecipient];
      let expectedRoyaltyAmounts = [expectedRoyaltyAmount];

      assert.deepEqual(recipients, expectedRecipients, "Receiver address is incorrect");
      assert.deepEqual(
        amounts.map((a) => a.toString()),
        expectedRoyaltyAmounts,
        "Royalty amount is incorrect"
      );
    });
  });
});
