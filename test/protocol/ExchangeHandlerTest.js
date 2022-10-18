const { gasLimit } = require("../../environments");
const hre = require("hardhat");
const ethers = hre.ethers;
const { expect, assert } = require("chai");

const Role = require("../../scripts/domain/Role");
const Dispute = require("../../scripts/domain/Dispute");
const Receipt = require("../../scripts/domain/Receipt");
const TwinReceipt = require("../../scripts/domain/TwinReceipt");
const Exchange = require("../../scripts/domain/Exchange");
const Voucher = require("../../scripts/domain/Voucher");
const TokenType = require("../../scripts/domain/TokenType");
const Bundle = require("../../scripts/domain/Bundle");
const ExchangeState = require("../../scripts/domain/ExchangeState");
const DisputeState = require("../../scripts/domain/DisputeState");
const Group = require("../../scripts/domain/Group");
const EvaluationMethod = require("../../scripts/domain/EvaluationMethod");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const {
  mockOffer,
  mockTwin,
  mockDisputeResolver,
  mockAuthToken,
  mockVoucherInitValues,
  mockSeller,
  mockVoucher,
  mockExchange,
  mockCondition,
  mockAgent,
  mockBuyer,
  accountId,
} = require("../util/mock");
const {
  getEvent,
  setNextBlockTimestamp,
  calculateVoucherExpiry,
  prepareDataSignatureParameters,
  calculateContractAddress,
  applyPercentage,
} = require("../util/utils.js");
const { oneWeek, oneMonth, maxPriorityFeePerGas } = require("../util/constants");
const { FundsList } = require("../../scripts/domain/Funds");
const { getSelectors, FacetCutAction } = require("../../scripts/util/diamond-utils.js");

/**
 *  Test the Boson Exchange Handler interface
 */
describe("IBosonExchangeHandler", function () {
  // Common vars
  let InterfaceIds;
  let deployer,
    pauser,
    operator,
    admin,
    clerk,
    treasury,
    rando,
    buyer,
    newOwner,
    fauxClient,
    operatorDR,
    adminDR,
    clerkDR,
    treasuryDR,
    protocolTreasury,
    bosonToken;
  let erc165,
    protocolDiamond,
    accessController,
    accountHandler,
    exchangeHandler,
    offerHandler,
    fundsHandler,
    disputeHandler,
    twinHandler,
    bundleHandler,
    groupHandler,
    pauseHandler,
    configHandler,
    mockMetaTransactionsHandler;
  let bosonVoucher, voucherImplementation;
  let bosonVoucherClone, bosonVoucherCloneAddress;
  let buyerId, offerId, seller, nextExchangeId, nextAccountId, disputeResolverId;
  let block, blockNumber, tx, txReceipt, event;
  let support, newTime;
  let price, sellerPool;
  let voucherRedeemableFrom;
  let disputePeriod, voucherValid;
  let protocolFeePercentage, protocolFeeFlatBoson, buyerEscalationDepositPercentage;
  let voucher, validUntilDate;
  let exchange, response, exists;
  let disputeResolver, disputeResolverFees;
  let foreign20, foreign721, foreign1155;
  let twin20, twin721, twin1155, twinIds, bundle, balance, owner;
  let expectedCloneAddress;
  let groupId, offerIds, condition, group;
  let voucherInitValues, royaltyPercentage1, royaltyPercentage2, seller1Treasury, seller2Treasury;
  let emptyAuthToken;
  let agentId, agent;
  let exchangesToComplete, exchangeId;
  let offer, offerFees;
  let offerDates, offerDurations;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();
  });

  beforeEach(async function () {
    // Make accounts available
    [
      deployer,
      pauser,
      admin,
      treasury,
      buyer,
      rando,
      newOwner,
      fauxClient,
      adminDR,
      treasuryDR,
      protocolTreasury,
      bosonToken,
    ] = await ethers.getSigners();

    // make all account the same
    operator = clerk = admin;
    operatorDR = clerkDR = adminDR;

    // Deploy the Protocol Diamond
    [protocolDiamond, , , , accessController] = await deployProtocolDiamond(maxPriorityFeePerGas);

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Grant PROTOCOL role to ProtocolDiamond address and renounces admin
    await accessController.grantRole(Role.PROTOCOL, protocolDiamond.address);

    // Temporarily grant PAUSER role to pauser account
    await accessController.grantRole(Role.PAUSER, pauser.address);

    // Cut the protocol handler facets into the Diamond
    await deployProtocolHandlerFacets(
      protocolDiamond,
      [
        "AccountHandlerFacet",
        "AgentHandlerFacet",
        "SellerHandlerFacet",
        "BuyerHandlerFacet",
        "DisputeResolverHandlerFacet",
        "ExchangeHandlerFacet",
        "OfferHandlerFacet",
        "FundsHandlerFacet",
        "DisputeHandlerFacet",
        "TwinHandlerFacet",
        "BundleHandlerFacet",
        "GroupHandlerFacet",
        "PauseHandlerFacet",
      ],
      maxPriorityFeePerGas
    );

    // Deploy the Protocol client implementation/proxy pairs (currently just the Boson Voucher)
    const protocolClientArgs = [protocolDiamond.address];
    const [implementations, beacons, proxies, clients] = await deployProtocolClients(
      protocolClientArgs,
      maxPriorityFeePerGas
    );
    [bosonVoucher] = clients;
    const [beacon] = beacons;
    const [proxy] = proxies;
    [voucherImplementation] = implementations;

    // Deploy the mock tokens
    [foreign20, foreign721, foreign1155] = await deployMockTokens(gasLimit, ["Foreign20", "Foreign721", "Foreign1155"]);

    // set protocolFees
    protocolFeePercentage = "200"; // 2 %
    protocolFeeFlatBoson = ethers.utils.parseUnits("0.01", "ether").toString();
    buyerEscalationDepositPercentage = "1000"; // 10%

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
        maxExchangesPerBatch: 50,
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
        maxRoyaltyPecentage: 1000, //10%
        maxResolutionPeriod: oneMonth,
        minDisputePeriod: oneWeek,
      },
      // Protocol fees
      {
        percentage: protocolFeePercentage,
        flatBoson: protocolFeeFlatBoson,
        buyerEscalationDepositPercentage,
      },
    ];

    // Deploy the Config facet, initializing the protocol config
    await deployProtocolConfigFacet(protocolDiamond, protocolConfig, maxPriorityFeePerGas);

    // Cast Diamond to IERC165
    erc165 = await ethers.getContractAt("ERC165Facet", protocolDiamond.address);

    // Cast Diamond to IBosonAccountHandler. Use this interface to call all individual account handlers
    accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);

    // Cast Diamond to IBosonOfferHandler
    offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);

    // Cast Diamond to IBosonExchangeHandler
    exchangeHandler = await ethers.getContractAt("IBosonExchangeHandler", protocolDiamond.address);

    // Cast Diamond to IBosonFundsHandler
    fundsHandler = await ethers.getContractAt("IBosonFundsHandler", protocolDiamond.address);

    // Cast Diamond to IBosonDisputeHandler
    disputeHandler = await ethers.getContractAt("IBosonDisputeHandler", protocolDiamond.address);

    // Cast Diamond to ITwinHandler
    twinHandler = await ethers.getContractAt("IBosonTwinHandler", protocolDiamond.address);

    // Cast Diamond to IBundleHandler
    bundleHandler = await ethers.getContractAt("IBosonBundleHandler", protocolDiamond.address);

    // Cast Diamond to IGroupHandler
    groupHandler = await ethers.getContractAt("IBosonGroupHandler", protocolDiamond.address);

    // Cast Diamond to IBosonPauseHandler
    pauseHandler = await ethers.getContractAt("IBosonPauseHandler", protocolDiamond.address);

    // Cast Diamond to IConfigHandler
    configHandler = await ethers.getContractAt("IBosonConfigHandler", protocolDiamond.address);

    // Deploy the mock tokens
    [foreign20, foreign721, foreign1155] = await deployMockTokens(gasLimit, ["Foreign20", "Foreign721", "Foreign1155"]);
  });

  async function upgradeMetaTransactionsHandlerFacet() {
    // Upgrade the ExchangeHandlerFacet functions
    // DiamondCutFacet
    const cutFacetViaDiamond = await ethers.getContractAt("DiamondCutFacet", protocolDiamond.address);

    // Deploy MockMetaTransactionsHandlerFacet
    const MockMetaTransactionsHandlerFacet = await ethers.getContractFactory("MockMetaTransactionsHandlerFacet");
    const mockMetaTransactionsHandlerFacet = await MockMetaTransactionsHandlerFacet.deploy();
    await mockMetaTransactionsHandlerFacet.deployed();

    // Define the facet cut
    const facetCuts = [
      {
        facetAddress: mockMetaTransactionsHandlerFacet.address,
        action: FacetCutAction.Add,
        functionSelectors: getSelectors(mockMetaTransactionsHandlerFacet),
      },
    ];

    // Send the DiamondCut transaction
    const tx = await cutFacetViaDiamond
      .connect(deployer)
      .diamondCut(facetCuts, ethers.constants.AddressZero, "0x", { gasLimit });

    // Wait for transaction to confirm
    const receipt = await tx.wait();

    // Be certain transaction was successful
    assert.equal(receipt.status, 1, `Diamond upgrade failed: ${tx.hash}`);

    // Cast Diamond to MockMetaTransactionsHandlerFacet
    mockMetaTransactionsHandler = await ethers.getContractAt(
      "MockMetaTransactionsHandlerFacet",
      protocolDiamond.address
    );
  }

  // Interface support (ERC-156 provided by ProtocolDiamond, others by deployed facets)
  context("📋 Interfaces", async function () {
    context("👉 supportsInterface()", async function () {
      it("should indicate support for IBosonExchangeHandler interface", async function () {
        // Current interfaceId for IBosonExchangeHandler
        support = await erc165.supportsInterface(InterfaceIds.IBosonExchangeHandler);

        // Test
        expect(support, "IBosonExchangeHandler interface not supported").is.true;
      });
    });
  });

  // All supported Exchange methods
  context("📋 Exchange Handler Methods", async function () {
    beforeEach(async function () {
      // Initial ids for all the things
      exchangeId = offerId = "1";
      agentId = "0"; // agent id is optional while creating an offer

      // Create a valid seller
      seller = mockSeller(operator.address, admin.address, clerk.address, treasury.address);
      expect(seller.isValid()).is.true;

      // AuthToken
      emptyAuthToken = mockAuthToken();
      expect(emptyAuthToken.isValid()).is.true;

      // VoucherInitValues
      seller1Treasury = seller.treasury;
      royaltyPercentage1 = "0"; // 0%
      voucherInitValues = mockVoucherInitValues();
      expect(voucherInitValues.isValid()).is.true;

      await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);
      expectedCloneAddress = calculateContractAddress(accountHandler.address, "1");

      // Create a valid dispute resolver
      disputeResolver = mockDisputeResolver(
        operatorDR.address,
        adminDR.address,
        clerkDR.address,
        treasuryDR.address,
        false
      );
      expect(disputeResolver.isValid()).is.true;

      //Create DisputeResolverFee array so offer creation will succeed
      disputeResolverFees = [new DisputeResolverFee(ethers.constants.AddressZero, "Native", "0")];

      // Make empty seller list, so every seller is allowed
      const sellerAllowList = [];

      // Register and activate the dispute resolver
      await accountHandler
        .connect(adminDR)
        .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
      await accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id);

      // Create the offer
      const mo = await mockOffer();
      ({ offerDates, offerDurations } = mo);
      offer = mo.offer;
      offerFees = mo.offerFees;
      offerFees.protocolFee = applyPercentage(offer.price, protocolFeePercentage);

      offer.quantityAvailable = "10";
      disputeResolverId = mo.disputeResolverId;

      // Check if domains are valid
      expect(offer.isValid()).is.true;
      expect(offerDates.isValid()).is.true;
      expect(offerDurations.isValid()).is.true;

      // Create the offer
      await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

      // Set used variables
      price = offer.price;
      voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
      voucherValid = offerDurations.voucherValid;
      disputePeriod = offerDurations.disputePeriod;
      sellerPool = ethers.utils.parseUnits("15", "ether").toString();

      // Required voucher constructor params
      voucher = mockVoucher();
      voucher.redeemedDate = "0";

      // Mock exchange
      exchange = mockExchange();

      buyerId = accountId.next().value;
      exchange.buyerId = buyerId;
      exchange.finalizedDate = "0";

      // Deposit seller funds so the commit will succeed
      await fundsHandler
        .connect(operator)
        .depositFunds(seller.id, ethers.constants.AddressZero, sellerPool, { value: sellerPool });
    });

    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    context("👉 commitToOffer()", async function () {
      it("should emit a BuyerCommitted event", async function () {
        // Commit to offer, retrieving the event
        tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });
        txReceipt = await tx.wait();
        event = getEvent(txReceipt, exchangeHandler, "BuyerCommitted");

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);

        // Update the committed date in the expected exchange struct with the block timestamp of the tx
        voucher.committedDate = block.timestamp.toString();

        // Update the validUntilDate date in the expected exchange struct
        voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

        // Examine event
        assert.equal(event.exchangeId.toString(), exchangeId, "Exchange id is incorrect");
        assert.equal(event.offerId.toString(), offerId, "Offer id is incorrect");
        assert.equal(event.buyerId.toString(), buyerId, "Buyer id is incorrect");

        // Examine the exchange struct
        assert.equal(
          Exchange.fromStruct(event.exchange).toString(),
          exchange.toString(),
          "Exchange struct is incorrect"
        );

        // Examine the voucher struct
        assert.equal(Voucher.fromStruct(event.voucher).toString(), voucher.toString(), "Voucher struct is incorrect");
      });

      it("should increment the next exchange id counter", async function () {
        // Commit to offer, creating a new exchange
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

        // Get the next exchange id and ensure it was incremented by the creation of the offer
        nextExchangeId = await exchangeHandler.connect(rando).getNextExchangeId();
        expect(nextExchangeId).to.equal(++exchangeId);
      });

      it("should issue the voucher on the correct clone", async function () {
        // Cast expectedCloneAddress to IBosonVoucher (existing clone)
        bosonVoucherClone = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);

        // Create a new seller to get new clone
        seller = mockSeller(rando.address, rando.address, rando.address, rando.address);
        seller.id = "3"; // buyer is created after seller in this test
        expect(seller.isValid()).is.true;

        await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);

        expectedCloneAddress = calculateContractAddress(accountHandler.address, "2");
        const bosonVoucherClone2 = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);

        // Create an offer with new seller
        const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();

        // Create the offer
        await offerHandler.connect(rando).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

        // Deposit seller funds so the commit will succeed
        await fundsHandler
          .connect(rando)
          .depositFunds(seller.id, ethers.constants.AddressZero, sellerPool, { value: sellerPool });

        const buyer2 = newOwner;

        // Commit to offer, creating a new exchange
        tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });
        const tx2 = await exchangeHandler.connect(deployer).commitToOffer(buyer2.address, ++offerId, { value: price });

        expect(tx).to.emit(bosonVoucherClone, "Transfer").withArgs(ethers.constants.Zero, buyer.address, "1");
        expect(tx2).to.emit(bosonVoucherClone2, "Transfer").withArgs(ethers.constants.Zero, buyer2.address, "2");

        // buyer should own 1 voucher on the clone1 address and buyer2 should own 1 voucher on clone2
        expect(await bosonVoucherClone.balanceOf(buyer.address)).to.equal("1", "Clone 1: buyer 1 balance should be 1");
        expect(await bosonVoucherClone.balanceOf(buyer2.address)).to.equal("0", "Clone 1: buyer 2 balance should be 0");
        expect(await bosonVoucherClone2.balanceOf(buyer.address)).to.equal("0", "Clone 2: buyer 1 balance should be 0");
        expect(await bosonVoucherClone2.balanceOf(buyer2.address)).to.equal(
          "1",
          "Clone 2: buyer 2 balance should be 1"
        );

        // Make sure that vouchers belong to correct buyers and that exist on the correct clone
        expect(await bosonVoucherClone.ownerOf("1")).to.equal(buyer.address, "Voucher 1: Wrong buyer address");
        await expect(bosonVoucherClone.ownerOf("2")).to.revertedWith(RevertReasons.ERC721_NON_EXISTENT);
        expect(await bosonVoucherClone2.ownerOf("2")).to.equal(buyer2.address, "Voucher 2: Wrong buyer address");
        await expect(bosonVoucherClone2.ownerOf("1")).to.revertedWith(RevertReasons.ERC721_NON_EXISTENT);

        // reference boson voucher proxy should not have any vouchers
        expect(await bosonVoucher.balanceOf(buyer.address)).to.equal(
          "0",
          "Reference proxy: buyer 1 balance should be 0"
        );
        expect(await bosonVoucher.balanceOf(buyer2.address)).to.equal(
          "0",
          "Reference proxy: buyer 2 balance should be 0"
        );

        // reference boson voucher should not have vouchers with id 1 and 2
        await expect(bosonVoucher.ownerOf("1")).to.revertedWith(RevertReasons.ERC721_NON_EXISTENT);
        await expect(bosonVoucher.ownerOf("2")).to.revertedWith(RevertReasons.ERC721_NON_EXISTENT);

        // boson voucher implemenation should not have any vouchers
        expect(await voucherImplementation.balanceOf(buyer.address)).to.equal(
          "0",
          "Voucher implementation: buyer 1 balance should be 0"
        );
        expect(await voucherImplementation.balanceOf(buyer2.address)).to.equal(
          "0",
          "Voucher implementation: buyer 2 balance should be 0"
        );

        // boson voucher implemenation should not have vouchers with id 1 and 2
        await expect(voucherImplementation.ownerOf("1")).to.revertedWith(RevertReasons.ERC721_NON_EXISTENT);
        await expect(voucherImplementation.ownerOf("2")).to.revertedWith(RevertReasons.ERC721_NON_EXISTENT);
      });

      it("ERC2981: issued voucher should have royalty fees", async function () {
        // Cast expectedCloneAddress to IBosonVoucher (existing clone)
        bosonVoucherClone = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);

        // Create a new seller to get new clone
        seller = mockSeller(rando.address, rando.address, rando.address, rando.address);
        seller.id = "3"; // buyer is created after seller in this test
        expect(seller.isValid()).is.true;

        // VoucherInitValues
        voucherInitValues.royaltyPercentage = "800"; // 8%
        expect(voucherInitValues.isValid()).is.true;

        await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);
        expectedCloneAddress = calculateContractAddress(accountHandler.address, "2");
        const bosonVoucherClone2 = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);

        // Create an offer with new seller
        const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();

        // Create the offer
        await offerHandler.connect(rando).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

        // Deposit seller funds so the commit will succeed
        await fundsHandler
          .connect(rando)
          .depositFunds(seller.id, ethers.constants.AddressZero, sellerPool, { value: sellerPool });

        const buyer2 = newOwner;

        // Commit to offer, creating a new exchange
        tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });
        const tx2 = await exchangeHandler.connect(deployer).commitToOffer(buyer2.address, ++offerId, { value: price });

        expect(tx).to.emit(bosonVoucherClone, "Transfer").withArgs(ethers.constants.Zero, buyer.address, "1");
        expect(tx2).to.emit(bosonVoucherClone2, "Transfer").withArgs(ethers.constants.Zero, buyer2.address, "2");

        // buyer should own 1 voucher on the clone1 address and buyer2 should own 1 voucher on clone2
        expect(await bosonVoucherClone.balanceOf(buyer.address)).to.equal("1", "Clone 1: buyer 1 balance should be 1");
        expect(await bosonVoucherClone.balanceOf(buyer2.address)).to.equal("0", "Clone 1: buyer 2 balance should be 0");
        expect(await bosonVoucherClone2.balanceOf(buyer.address)).to.equal("0", "Clone 2: buyer 1 balance should be 0");
        expect(await bosonVoucherClone2.balanceOf(buyer2.address)).to.equal(
          "1",
          "Clone 2: buyer 2 balance should be 1"
        );

        // Make sure that vouchers belong to correct buyers and that exist on the correct clone
        expect(await bosonVoucherClone.ownerOf("1")).to.equal(buyer.address, "Voucher 1: Wrong buyer address");
        await expect(bosonVoucherClone.ownerOf("2")).to.revertedWith(RevertReasons.ERC721_NON_EXISTENT);
        expect(await bosonVoucherClone2.ownerOf("2")).to.equal(buyer2.address, "Voucher 2: Wrong buyer address");
        await expect(bosonVoucherClone2.ownerOf("1")).to.revertedWith(RevertReasons.ERC721_NON_EXISTENT);

        // Make sure that vouchers have correct royalty fee for exchangeId 1
        exchangeId = "1";
        let receiver, royaltyAmount;
        [receiver, royaltyAmount] = await bosonVoucherClone.connect(operator).royaltyInfo(exchangeId, offer.price);

        // Expectations
        let expectedRecipient = seller1Treasury; //Expect 1st seller's treasury address as exchange id exists
        let expectedRoyaltyAmount = applyPercentage(price, royaltyPercentage1); //0% of offer price because royaltyPercentage1 is 0%

        assert.equal(receiver, expectedRecipient, "Recipient address is incorrect");
        assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");

        // Make sure that vouchers have correct royalty fee for exchangeId 2
        exchangeId = "2";
        royaltyPercentage2 = voucherInitValues.royaltyPercentage; // 8%
        seller2Treasury = seller.treasury;

        receiver, royaltyAmount;
        [receiver, royaltyAmount] = await bosonVoucherClone2.connect(operator).royaltyInfo(exchangeId, offer.price);

        // Expectations
        expectedRecipient = seller2Treasury; //Expect 2nd seller's treasury address as exchange id exists
        expectedRoyaltyAmount = applyPercentage(price, royaltyPercentage2); //8% of offer price because royaltyPercentage2 is 30%

        assert.equal(receiver, expectedRecipient, "Recipient address is incorrect");
        assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");
      });

      it("should allow redemption period to be defined by date rather than duration", async function () {
        // Create an offer specifying redemption period with end date rather than duration
        const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
        offerDurations.voucherValid = "0";
        offerDates.voucherRedeemableUntil = offerDates.validUntil; // all vouchers expire when offer expires

        // Check if domain entities are valid
        expect(offer.isValid()).is.true;
        expect(offerDates.isValid()).is.true;
        expect(offerDurations.isValid()).is.true;

        // Create the offer
        await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);
        exchange.offerId = offerId = "2"; // tested against second offer

        // Commit to offer, retrieving the event
        tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });
        txReceipt = await tx.wait();
        event = getEvent(txReceipt, exchangeHandler, "BuyerCommitted");

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);

        // Update the committed date in the expected exchange struct with the block timestamp of the tx
        voucher.committedDate = block.timestamp.toString();

        // Update the validUntilDate date in the expected exchange struct
        voucher.validUntilDate = offerDates.validUntil;

        // Examine the event
        assert.equal(event.exchangeId.toString(), exchangeId, "Exchange id is incorrect");
        assert.equal(event.offerId.toString(), offerId, "Offer id is incorrect");
        assert.equal(event.buyerId.toString(), buyerId, "Buyer id is incorrect");

        // Examine the exchange struct
        assert.equal(
          Exchange.fromStruct(event.exchange).toString(),
          exchange.toString(),
          "Exchange struct is incorrect"
        );

        // Examine the voucher struct
        assert.equal(Voucher.fromStruct(event.voucher).toString(), voucher.toString(), "Voucher struct is incorrect");
      });

      it("Should decrement quantityAvailable", async function () {
        // Commit to offer
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

        // Offer qunantityAvailable should be decremented
        const [, offer] = await offerHandler.connect(rando).getOffer(offerId);
        expect(offer.quantityAvailable).to.equal(9, "Quantity available should be 9");
      });

      it("Should not decrement quantityAvailable if offer is unlimited", async function () {
        // Create an offer with unlimited quantity
        let { offer, ...details } = await mockOffer();
        offer.quantityAvailable = ethers.constants.MaxUint256.toString();

        // Delete unnecessary field
        delete details.offerFees;

        // Check if domain entities are valid
        expect(offer.isValid()).is.true;

        // Create the offer
        await offerHandler.connect(operator).createOffer(offer, ...Object.values(details), agentId);
        exchange.offerId = offerId = "2"; // first offer is created on beforeEach

        // Commit to offer
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

        // Offer qunantityAvailable should not be decremented
        [, offer] = await offerHandler.connect(rando).getOffer(offerId);
        expect(offer.quantityAvailable).to.equal(ethers.constants.MaxUint256, "Quantity available should be unlimited");
      });

      it("Should not decrement seller funds if offer price and sellerDeposit is 0", async function () {
        // Seller funds before
        const sellersFundsBefore = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));

        // Set protocolFee to zero so we don't get the error AGENT_FEE_AMOUNT_TOO_HIGH
        protocolFeePercentage = "0";
        await configHandler.connect(deployer).setProtocolFeePercentage(protocolFeePercentage);
        offerFees.protocolFee = "0";

        // Create an absolute zero offer
        const mo = await mockOffer();
        const { offerDates, offerDurations } = mo;
        offer = mo.offer;
        offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = "0";
        // set a dummy token address otherwise protocol token (zero address) and offer token will be the same and we will get the error AGENT_FEE_AMOUNT_TOO_HIGH
        offer.exchangeToken = foreign20.address;
        disputeResolverId = agentId = "0";
        exchange.offerId = offerId = "2"; // first offer is created on beforeEach

        // Check if domain entities are valid
        expect(offer.isValid()).is.true;

        // Create the offer
        await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

        // Commit to offer
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId);

        // Seller funds after
        const sellerFundsAfter = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
        expect(sellerFundsAfter.toString()).to.equal(
          sellersFundsBefore.toString(),
          "Seller funds should not be decremented"
        );
      });

      context("💔 Revert Reasons", async function () {
        it("The exchanges region of protocol is paused", async function () {
          // Pause the exchanges region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Exchanges]);

          // Attempt to create an exchange, expecting revert
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("The buyers region of protocol is paused", async function () {
          // Pause the buyers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Buyers]);

          // Attempt to create a buyer, expecting revert
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("buyer address is the zero address", async function () {
          // Attempt to commit, expecting revert
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(ethers.constants.AddressZero, offerId, { value: price })
          ).to.revertedWith(RevertReasons.INVALID_ADDRESS);
        });

        it("offer id is invalid", async function () {
          // An invalid offer id
          offerId = "666";

          // Attempt to commit, expecting revert
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
          ).to.revertedWith(RevertReasons.NO_SUCH_OFFER);
        });

        it("offer is voided", async function () {
          // Void the offer first
          await offerHandler.connect(operator).voidOffer(offerId);

          // Attempt to commit to the voided offer, expecting revert
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
          ).to.revertedWith(RevertReasons.OFFER_HAS_BEEN_VOIDED);
        });

        it("offer is not yet available for commits", async function () {
          // Create an offer with staring date in the future
          // get current block timestamp
          const block = await ethers.provider.getBlock("latest");
          const now = block.timestamp.toString();

          // set validFrom date in the past
          offerDates.validFrom = ethers.BigNumber.from(now)
            .add(oneMonth * 6)
            .toString(); // 6 months in the future
          offerDates.validUntil = ethers.BigNumber.from(offerDates.validFrom).add(10).toString(); // just after the valid from so it succeeds.

          await offerHandler
            .connect(operator)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

          // Attempt to commit to the not availabe offer, expecting revert
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(buyer.address, ++offerId, { value: price })
          ).to.revertedWith(RevertReasons.OFFER_NOT_AVAILABLE);
        });

        it("offer has expired", async function () {
          // Go past offer expiration date
          await setNextBlockTimestamp(Number(offerDates.validUntil));

          // Attempt to commit to the expired offer, expecting revert
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
          ).to.revertedWith(RevertReasons.OFFER_HAS_EXPIRED);
        });

        it("offer sold", async function () {
          // Create an offer with only 1 item
          offer.quantityAvailable = "1";
          await offerHandler
            .connect(operator)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);
          // Commit to offer, so it's not availble anymore
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, ++offerId, { value: price });

          // Attempt to commit to the sold out offer, expecting revert
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
          ).to.revertedWith(RevertReasons.OFFER_SOLD_OUT);
        });
      });
    });

    context("👉 commitToOffer() with condition", async function () {
      context("✋ Threshold ERC20", async function () {
        beforeEach(async function () {
          // Required constructor params for Group
          groupId = "1";
          offerIds = [offerId];

          // Create Condition
          condition = mockCondition({ tokenAddress: foreign20.address, threshold: "50", maxCommits: "3" });
          expect(condition.isValid()).to.be.true;

          // Create Group
          group = new Group(groupId, seller.id, offerIds);
          expect(group.isValid()).is.true;
          await groupHandler.connect(operator).createGroup(group, condition);
        });

        it("should emit a BuyerCommitted event if user meets condition", async function () {
          // mint enough tokens for the buyer
          await foreign20.connect(buyer).mint(buyer.address, condition.threshold);

          // Commit to offer.
          // We're only concerned that the event is emitted, indicating the condition was met
          await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })).to.emit(
            exchangeHandler,
            "BuyerCommitted"
          );
        });

        it("should allow buyer to commit up to the max times for the group", async function () {
          // mint enough tokens for the buyer
          await foreign20.connect(buyer).mint(buyer.address, condition.threshold);

          // Commit to offer the maximum number of times
          for (let i = 0; i < Number(condition.maxCommits); i++) {
            // We're only concerned that the event is emitted, indicating the commit was allowed
            await expect(
              exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
            ).to.emit(exchangeHandler, "BuyerCommitted");
          }
        });

        context("💔 Revert Reasons", async function () {
          it("buyer does not meet condition for commit", async function () {
            // Attempt to commit, expecting revert
            await expect(
              exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
            ).to.revertedWith(RevertReasons.CANNOT_COMMIT);
          });

          it("buyer has exhausted allowable commits", async function () {
            // mint a token for the buyer
            await foreign20.connect(buyer).mint(buyer.address, condition.threshold);

            // Commit to offer the maximum number of times
            for (let i = 0; i < Number(condition.maxCommits); i++) {
              await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });
            }

            // Attempt to commit again after maximum commits has been reached
            await expect(
              exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
            ).to.revertedWith(RevertReasons.CANNOT_COMMIT);
          });
        });
      });

      context("✋ Threshold ERC721", async function () {
        beforeEach(async function () {
          // Required constructor params for Group
          groupId = "1";
          offerIds = [offerId];

          // Create Condition
          condition = mockCondition({
            tokenAddress: foreign721.address,
            threshold: "5",
            maxCommits: "3",
            tokenType: TokenType.NonFungibleToken,
          });
          expect(condition.isValid()).to.be.true;

          // Create Group
          group = new Group(groupId, seller.id, offerIds);
          expect(group.isValid()).is.true;
          await groupHandler.connect(operator).createGroup(group, condition);
        });

        it("should emit a BuyerCommitted event if user meets condition", async function () {
          // mint enough tokens for the buyer
          await foreign721.connect(buyer).mint(condition.tokenId, condition.threshold);

          // Commit to offer.
          // We're only concerned that the event is emitted, indicating the condition was met
          await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })).to.emit(
            exchangeHandler,
            "BuyerCommitted"
          );
        });

        it("should allow buyer to commit up to the max times for the group", async function () {
          // mint enough tokens for the buyer
          await foreign721.connect(buyer).mint(condition.tokenId, condition.threshold);

          // Commit to offer the maximum number of times
          for (let i = 0; i < Number(condition.maxCommits); i++) {
            // We're only concerned that the event is emitted, indicating the commit was allowed
            await expect(
              exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
            ).to.emit(exchangeHandler, "BuyerCommitted");
          }
        });

        context("💔 Revert Reasons", async function () {
          it("buyer does not meet condition for commit", async function () {
            // Attempt to commit, expecting revert
            await expect(
              exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
            ).to.revertedWith(RevertReasons.CANNOT_COMMIT);
          });

          it("buyer has exhausted allowable commits", async function () {
            // mint enough tokens for the buyer
            await foreign721.connect(buyer).mint(condition.tokenId, condition.threshold);

            // Commit to offer the maximum number of times
            for (let i = 0; i < Number(condition.maxCommits); i++) {
              await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });
            }

            // Attempt to commit again after maximum commits has been reached
            await expect(
              exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
            ).to.revertedWith(RevertReasons.CANNOT_COMMIT);
          });
        });
      });

      context("✋ Threshold ERC1155", async function () {
        beforeEach(async function () {
          // Required constructor params for Group
          groupId = "1";
          offerIds = [offerId];

          // Create Condition
          condition = mockCondition({
            tokenAddress: foreign1155.address,
            threshold: "20",
            maxCommits: "3",
            tokenType: TokenType.MultiToken,
            tokenId: "1",
          });
          expect(condition.isValid()).to.be.true;

          // Create Group
          group = new Group(groupId, seller.id, offerIds);
          expect(group.isValid()).is.true;
          await groupHandler.connect(operator).createGroup(group, condition);
        });

        it("should emit a BuyerCommitted event if user meets condition", async function () {
          // mint enough tokens for the buyer
          await foreign1155.connect(buyer).mint(condition.tokenId, condition.threshold);

          // Commit to offer.
          // We're only concerned that the event is emitted, indicating the condition was met
          await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })).to.emit(
            exchangeHandler,
            "BuyerCommitted"
          );
        });

        it("should allow buyer to commit up to the max times for the group", async function () {
          // mint enough tokens for the buyer
          await foreign1155.connect(buyer).mint(condition.tokenId, condition.threshold);

          // Commit to offer the maximum number of times
          for (let i = 0; i < Number(condition.maxCommits); i++) {
            // We're only concerned that the event is emitted, indicating the commit was allowed
            await expect(
              exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
            ).to.emit(exchangeHandler, "BuyerCommitted");
          }
        });

        context("💔 Revert Reasons", async function () {
          it("buyer does not meet condition for commit", async function () {
            // Attempt to commit, expecting revert
            await expect(
              exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
            ).to.revertedWith(RevertReasons.CANNOT_COMMIT);
          });

          it("buyer has exhausted allowable commits", async function () {
            // mint enough tokens for the buyer
            await foreign1155.connect(buyer).mint(condition.tokenId, condition.threshold);

            // Commit to offer the maximum number of times
            for (let i = 0; i < Number(condition.maxCommits); i++) {
              await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });
            }

            // Attempt to commit again after maximum commits has been reached
            await expect(
              exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
            ).to.revertedWith(RevertReasons.CANNOT_COMMIT);
          });
        });
      });

      context("✋ SpecificToken ERC721", async function () {
        beforeEach(async function () {
          // Required constructor params for Group
          groupId = "1";
          offerIds = [offerId];

          // Create Condition
          condition = mockCondition({
            tokenAddress: foreign721.address,
            threshold: "0",
            maxCommits: "3",
            tokenType: TokenType.NonFungibleToken,
            tokenId: "12",
            method: EvaluationMethod.SpecificToken,
          });
          expect(condition.isValid()).to.be.true;

          // Create Group
          group = new Group(groupId, seller.id, offerIds);
          expect(group.isValid()).is.true;
          await groupHandler.connect(operator).createGroup(group, condition);
        });

        it("should emit a BuyerCommitted event if user meets condition", async function () {
          // mint correct token for the buyer
          await foreign721.connect(buyer).mint(condition.tokenId, "1");

          // Commit to offer.
          // We're only concerned that the event is emitted, indicating the condition was met
          await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })).to.emit(
            exchangeHandler,
            "BuyerCommitted"
          );
        });

        it("should allow buyer to commit up to the max times for the group", async function () {
          // mint correct token for the buyer
          await foreign721.connect(buyer).mint(condition.tokenId, "1");

          // Commit to offer the maximum number of times
          for (let i = 0; i < Number(condition.maxCommits); i++) {
            // We're only concerned that the event is emitted, indicating the commit was allowed
            await expect(
              exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
            ).to.emit(exchangeHandler, "BuyerCommitted");
          }
        });

        context("💔 Revert Reasons", async function () {
          it("token id does not exist", async function () {
            // Attempt to commit, expecting revert
            await expect(
              exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
            ).to.revertedWith(RevertReasons.ERC721_NON_EXISTENT);
          });

          it("buyer does not meet condition for commit", async function () {
            // mint correct token but to another user
            await foreign721.connect(rando).mint(condition.tokenId, "1");

            // Attempt to commit, expecting revert
            await expect(
              exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
            ).to.revertedWith(RevertReasons.CANNOT_COMMIT);
          });

          it("buyer has exhausted allowable commits", async function () {
            // mint correct token for the buyer
            await foreign721.connect(buyer).mint(condition.tokenId, "1");

            // Commit to offer the maximum number of times
            for (let i = 0; i < Number(condition.maxCommits); i++) {
              await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });
            }

            // Attempt to commit again after maximum commits has been reached
            await expect(
              exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
            ).to.revertedWith(RevertReasons.CANNOT_COMMIT);
          });
        });
      });

      context("✋ Group without condition", async function () {
        beforeEach(async function () {
          // Required constructor params for Group
          groupId = "1";
          offerIds = [offerId];

          // Create Condition
          condition = mockCondition({ method: EvaluationMethod.None, threshold: "0", maxCommits: "0" });
          expect(condition.isValid()).to.be.true;

          // Create Group
          group = new Group(groupId, seller.id, offerIds);
          expect(group.isValid()).is.true;
          await groupHandler.connect(operator).createGroup(group, condition);
        });

        it("should emit a BuyerCommitted event", async function () {
          // Commit to offer.
          // We're only concerned that the event is emitted, indicating the condition was met
          await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })).to.emit(
            exchangeHandler,
            "BuyerCommitted"
          );
        });
      });
    });

    context("👉 completeExchange()", async function () {
      beforeEach(async function () {
        // Commit to offer
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });
      });

      it("should emit an ExchangeCompleted event when buyer calls", async function () {
        // Set time forward to the offer's voucherRedeemableFrom
        await setNextBlockTimestamp(Number(voucherRedeemableFrom));

        // Redeem the voucher
        await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

        // Complete the exchange, expecting event
        await expect(exchangeHandler.connect(buyer).completeExchange(exchange.id))
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchange.id, buyer.address);
      });

      it("should update state", async function () {
        // Set time forward to the offer's voucherRedeemableFrom
        await setNextBlockTimestamp(Number(voucherRedeemableFrom));

        // Redeem the voucher
        await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

        // Complete the exchange
        await exchangeHandler.connect(buyer).completeExchange(exchange.id);

        // Get the exchange state
        [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

        // It should match ExchangeState.Completed
        assert.equal(response, ExchangeState.Completed, "Exchange state is incorrect");
      });

      it("should emit an ExchangeCompleted event if operator calls after dispute period", async function () {
        // Set time forward to the offer's voucherRedeemableFrom
        await setNextBlockTimestamp(Number(voucherRedeemableFrom));

        // Redeem the voucher
        await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

        // Get the current block info
        blockNumber = await ethers.provider.getBlockNumber();
        block = await ethers.provider.getBlock(blockNumber);

        // Set time forward to run out the dispute period
        newTime = ethers.BigNumber.from(block.timestamp).add(disputePeriod).add(1).toNumber();
        await setNextBlockTimestamp(newTime);

        // Complete exchange
        await expect(exchangeHandler.connect(operator).completeExchange(exchange.id))
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchange.id, operator.address);
      });

      it("should emit an ExchangeCompleted event if anyone calls after dispute period", async function () {
        // Set time forward to the offer's voucherRedeemableFrom
        await setNextBlockTimestamp(Number(voucherRedeemableFrom));

        // Redeem the voucher
        await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

        // Get the current block info
        blockNumber = await ethers.provider.getBlockNumber();
        block = await ethers.provider.getBlock(blockNumber);

        // Set time forward to run out the dispute period
        newTime = ethers.BigNumber.from(block.timestamp).add(disputePeriod).add(1).toNumber();
        await setNextBlockTimestamp(newTime);

        // Complete exchange
        await expect(exchangeHandler.connect(rando).completeExchange(exchange.id))
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchange.id, rando.address);
      });

      context("💔 Revert Reasons", async function () {
        it("The exchanges region of protocol is paused", async function () {
          // Pause the exchanges region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Exchanges]);

          // Attempt to complete an exchange, expecting revert
          await expect(exchangeHandler.connect(operator).completeExchange(exchangeId)).to.revertedWith(
            RevertReasons.REGION_PAUSED
          );
        });

        it("exchange id is invalid", async function () {
          // An invalid exchange id
          exchangeId = "666";

          // Attempt to complete the exchange, expecting revert
          await expect(exchangeHandler.connect(operator).completeExchange(exchangeId)).to.revertedWith(
            RevertReasons.NO_SUCH_EXCHANGE
          );
        });

        it("cannot complete an exchange when it is in the committed state", async function () {
          // Get the exchange state
          [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

          // It should match ExchangeState.Committed
          assert.equal(response, ExchangeState.Committed, "Exchange state is incorrect");

          // Attempt to complete the exchange, expecting revert
          await expect(exchangeHandler.connect(operator).completeExchange(exchange.id)).to.revertedWith(
            RevertReasons.INVALID_STATE
          );
        });

        it("exchange is not in redeemed state", async function () {
          // Cancel the voucher
          await exchangeHandler.connect(buyer).cancelVoucher(exchange.id);

          // Attempt to complete the exchange, expecting revert
          await expect(exchangeHandler.connect(operator).completeExchange(exchange.id)).to.revertedWith(
            RevertReasons.INVALID_STATE
          );
        });

        it("caller is not buyer and offer dispute period has not elapsed", async function () {
          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // Redeem the voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Attempt to complete the exchange, expecting revert
          await expect(exchangeHandler.connect(rando).completeExchange(exchange.id)).to.revertedWith(
            RevertReasons.DISPUTE_PERIOD_NOT_ELAPSED
          );
        });

        it("caller is seller's operator and offer dispute period has not elapsed", async function () {
          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // Redeem the voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Attempt to complete the exchange, expecting revert
          await expect(exchangeHandler.connect(operator).completeExchange(exchange.id)).to.revertedWith(
            RevertReasons.DISPUTE_PERIOD_NOT_ELAPSED
          );
        });
      });
    });

    context("👉 completeExchangeBatch()", async function () {
      beforeEach(async function () {
        // Set time forward to the offer's voucherRedeemableFrom
        await setNextBlockTimestamp(Number(voucherRedeemableFrom));

        for (exchangeId = 1; exchangeId <= 5; exchangeId++) {
          // Commit to offer, creating a new exchange
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

          // Redeem voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);
        }

        exchangesToComplete = ["1", "2", "3", "4", "5"];
      });

      it("should emit a ExchangeCompleted event for all events", async function () {
        // Complete the exchange, expecting event
        const tx = await exchangeHandler.connect(buyer).completeExchangeBatch(exchangesToComplete);
        await expect(tx)
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchangesToComplete[0], buyer.address);

        await expect(tx)
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchangesToComplete[1], buyer.address);

        await expect(tx)
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchangesToComplete[2], buyer.address);

        await expect(tx)
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchangesToComplete[3], buyer.address);

        await expect(tx)
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchangesToComplete[4], buyer.address);
      });

      it("should update state", async function () {
        // Complete the exchange
        await exchangeHandler.connect(buyer).completeExchangeBatch(exchangesToComplete);

        for (exchangeId = 1; exchangeId <= 5; exchangeId++) {
          // Get the exchange state
          [, response] = await exchangeHandler.connect(rando).getExchangeState(exchangeId);

          // It should match ExchangeState.Completed
          assert.equal(response, ExchangeState.Completed, "Exchange state is incorrect");
        }
      });

      it("should emit an ExchangeCompleted event if operator calls after dispute period", async function () {
        // Get the current block info
        blockNumber = await ethers.provider.getBlockNumber();
        block = await ethers.provider.getBlock(blockNumber);

        // Set time forward to run out the dispute period
        newTime = ethers.BigNumber.from(block.timestamp).add(disputePeriod).add(1).toNumber();
        await setNextBlockTimestamp(newTime);

        // Complete exchange
        const tx = await exchangeHandler.connect(operator).completeExchangeBatch(exchangesToComplete);
        await expect(tx)
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchangesToComplete[0], operator.address);

        await expect(tx)
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchangesToComplete[1], operator.address);

        await expect(tx)
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchangesToComplete[2], operator.address);

        await expect(tx)
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchangesToComplete[3], operator.address);

        await expect(tx)
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchangesToComplete[4], operator.address);
      });

      it("should emit an ExchangeCompleted event if anyone calls after dispute period", async function () {
        // Get the current block info
        blockNumber = await ethers.provider.getBlockNumber();
        block = await ethers.provider.getBlock(blockNumber);

        // Set time forward to run out the dispute period
        newTime = ethers.BigNumber.from(block.timestamp).add(disputePeriod).add(1).toNumber();
        await setNextBlockTimestamp(newTime);

        // Complete exchange
        const tx = await exchangeHandler.connect(rando).completeExchangeBatch(exchangesToComplete);
        await expect(tx)
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchangesToComplete[0], rando.address);

        await expect(tx)
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchangesToComplete[1], rando.address);

        await expect(tx)
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchangesToComplete[2], rando.address);

        await expect(tx)
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchangesToComplete[3], rando.address);

        await expect(tx)
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchangesToComplete[4], rando.address);
      });

      context("💔 Revert Reasons", async function () {
        it("The exchanges region of protocol is paused", async function () {
          // Pause the exchanges region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Exchanges]);

          // Attempt to complete an exchange, expecting revert
          await expect(exchangeHandler.connect(buyer).completeExchangeBatch(exchangesToComplete)).to.revertedWith(
            RevertReasons.REGION_PAUSED
          );
        });

        it("Completing too many exchanges", async function () {
          // Try to complete more than 50 exchanges
          exchangesToComplete = [...Array(51).keys()];

          // Attempt to complete the exchange, expecting revert
          await expect(exchangeHandler.connect(rando).completeExchangeBatch(exchangesToComplete)).to.revertedWith(
            RevertReasons.TOO_MANY_EXCHANGES
          );
        });

        it("exchange id is invalid", async function () {
          // An invalid exchange id
          exchangeId = "666";

          // Add new exchange id to the array
          exchangesToComplete = [exchangeId, ...exchangesToComplete];

          // Attempt to complete the exchange, expecting revert
          await expect(exchangeHandler.connect(operator).completeExchangeBatch(exchangesToComplete)).to.revertedWith(
            RevertReasons.NO_SUCH_EXCHANGE
          );
        });

        it("exchange is not in redeemed state", async function () {
          // Create exchange with id 6
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

          exchangeId = "6";
          // Cancel the voucher for any 1 exchange
          await exchangeHandler.connect(buyer).cancelVoucher(exchangeId);

          // Add new exchange id to the array
          exchangesToComplete = [exchangeId, ...exchangesToComplete];

          // Attempt to complete the exchange, expecting revert
          await expect(exchangeHandler.connect(operator).completeExchangeBatch(exchangesToComplete)).to.revertedWith(
            RevertReasons.INVALID_STATE
          );
        });

        it("caller is not buyer and offer dispute period has not elapsed", async function () {
          // Create exchange with id 6
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

          exchangeId = "6";

          // Redeem the voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

          // Add new exchange id to the array
          exchangesToComplete = [exchangeId, ...exchangesToComplete];

          // Attempt to complete the exchange, expecting revert
          await expect(exchangeHandler.connect(rando).completeExchangeBatch(exchangesToComplete)).to.revertedWith(
            RevertReasons.DISPUTE_PERIOD_NOT_ELAPSED
          );
        });

        it("caller is seller's operator and offer dispute period has not elapsed", async function () {
          // Create exchange with id 6
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

          exchangeId = "6";

          // Redeem the voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

          // Attempt to complete the exchange, expecting revert
          await expect(exchangeHandler.connect(operator).completeExchangeBatch(exchangesToComplete)).to.revertedWith(
            RevertReasons.DISPUTE_PERIOD_NOT_ELAPSED
          );
        });
      });
    });

    context("👉 revokeVoucher()", async function () {
      beforeEach(async function () {
        // Commit to offer
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });
      });

      it("should emit an VoucherRevoked event when seller's operator calls", async function () {
        // Revoke the voucher, expecting event
        await expect(exchangeHandler.connect(operator).revokeVoucher(exchange.id))
          .to.emit(exchangeHandler, "VoucherRevoked")
          .withArgs(offerId, exchange.id, operator.address);
      });

      it("should update state", async function () {
        // Revoke the voucher
        await exchangeHandler.connect(operator).revokeVoucher(exchange.id);

        // Get the exchange state
        [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

        // It should match ExchangeState.Revoked
        assert.equal(response, ExchangeState.Revoked, "Exchange state is incorrect");
      });

      context("💔 Revert Reasons", async function () {
        it("The exchanges region of protocol is paused", async function () {
          // Pause the exchanges region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Exchanges]);

          // Attempt to complete an exchange, expecting revert
          await expect(exchangeHandler.connect(operator).revokeVoucher(exchange.id)).to.revertedWith(
            RevertReasons.REGION_PAUSED
          );
        });

        it("exchange id is invalid", async function () {
          // An invalid exchange id
          exchangeId = "666";

          // Attempt to revoke the voucher, expecting revert
          await expect(exchangeHandler.connect(operator).revokeVoucher(exchangeId)).to.revertedWith(
            RevertReasons.NO_SUCH_EXCHANGE
          );
        });

        it("exchange is not in committed state", async function () {
          // Cancel the voucher
          await exchangeHandler.connect(buyer).cancelVoucher(exchange.id);

          // Attempt to revoke the voucher, expecting revert
          await expect(exchangeHandler.connect(operator).revokeVoucher(exchange.id)).to.revertedWith(
            RevertReasons.INVALID_STATE
          );
        });

        it("caller is not seller's operator", async function () {
          // Attempt to complete the exchange, expecting revert
          await expect(exchangeHandler.connect(rando).revokeVoucher(exchange.id)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );
        });
      });
    });

    context("👉 cancelVoucher()", async function () {
      beforeEach(async function () {
        // Commit to offer, retrieving the event
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });
      });

      it("should emit an VoucherCanceled event when original buyer calls", async function () {
        // Cancel the voucher, expecting event
        await expect(exchangeHandler.connect(buyer).cancelVoucher(exchange.id))
          .to.emit(exchangeHandler, "VoucherCanceled")
          .withArgs(offerId, exchange.id, buyer.address);
      });

      it("should emit an VoucherCanceled event when new owner (not a buyer) calls", async function () {
        // Transfer voucher to new owner
        bosonVoucherCloneAddress = calculateContractAddress(exchangeHandler.address, "1");
        bosonVoucherClone = await ethers.getContractAt("IBosonVoucher", bosonVoucherCloneAddress);
        await bosonVoucherClone.connect(buyer).transferFrom(buyer.address, newOwner.address, exchange.id);

        // Cancel the voucher, expecting event
        await expect(exchangeHandler.connect(newOwner).cancelVoucher(exchange.id))
          .to.emit(exchangeHandler, "VoucherCanceled")
          .withArgs(offerId, exchange.id, newOwner.address);
      });

      it("should update state when buyer calls", async function () {
        // Cancel the voucher
        await exchangeHandler.connect(buyer).cancelVoucher(exchange.id);

        // Get the exchange state
        [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

        // It should match ExchangeState.Canceled
        assert.equal(response, ExchangeState.Canceled, "Exchange state is incorrect");
      });

      context("💔 Revert Reasons", async function () {
        it("The exchanges region of protocol is paused", async function () {
          // Pause the exchanges region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Exchanges]);

          // Attempt to complete an exchange, expecting revert
          await expect(exchangeHandler.connect(buyer).cancelVoucher(exchange.id)).to.revertedWith(
            RevertReasons.REGION_PAUSED
          );
        });

        it("exchange id is invalid", async function () {
          // An invalid exchange id
          exchangeId = "666";

          // Attempt to cancel the voucher, expecting revert
          await expect(exchangeHandler.connect(buyer).cancelVoucher(exchangeId)).to.revertedWith(
            RevertReasons.NO_SUCH_EXCHANGE
          );
        });

        it("cannot cancel when exchange is in Redeemed state", async function () {
          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // Redeem voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Get the exchange state
          [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

          // It should match ExchangeState.Redeemed
          assert.equal(response, ExchangeState.Redeemed, "Exchange state is incorrect");

          // Attempt to cancel the voucher, expecting revert
          await expect(exchangeHandler.connect(buyer).cancelVoucher(exchange.id)).to.revertedWith(
            RevertReasons.INVALID_STATE
          );
        });

        it("exchange is not in committed state", async function () {
          // Revoke the voucher
          await exchangeHandler.connect(operator).revokeVoucher(exchange.id);

          // Attempt to cancel the voucher, expecting revert
          await expect(exchangeHandler.connect(buyer).cancelVoucher(exchange.id)).to.revertedWith(
            RevertReasons.INVALID_STATE
          );
        });

        it("caller does not own voucher", async function () {
          // Attempt to cancel the voucher, expecting revert
          await expect(exchangeHandler.connect(rando).cancelVoucher(exchange.id)).to.revertedWith(
            RevertReasons.NOT_VOUCHER_HOLDER
          );
        });

        it("getCurrentSenderAddress() returns zero address and has isMetaTransaction set to true on chain", async function () {
          await upgradeMetaTransactionsHandlerFacet();

          await mockMetaTransactionsHandler.setAsMetaTransactionAndCurrentSenderAs(ethers.constants.AddressZero);

          // Attempt to cancel the voucher, expecting revert
          await expect(exchangeHandler.connect(rando).cancelVoucher(exchange.id)).to.revertedWith(
            RevertReasons.INVALID_ADDRESS
          );
        });
      });
    });

    context("👉 expireVoucher()", async function () {
      beforeEach(async function () {
        // Commit to offer, retrieving the event
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });
      });

      it("should emit an VoucherExpired event when anyone calls and voucher has expired", async function () {
        // Set time forward past the voucher's validUntilDate
        await setNextBlockTimestamp(Number(voucherRedeemableFrom) + Number(voucherValid) + Number(oneWeek));

        // Expire the voucher, expecting event
        await expect(exchangeHandler.connect(rando).expireVoucher(exchange.id))
          .to.emit(exchangeHandler, "VoucherExpired")
          .withArgs(offerId, exchange.id, rando.address);
      });

      it("should update state when anyone calls and voucher has expired", async function () {
        // Set time forward past the voucher's validUntilDate
        await setNextBlockTimestamp(Number(voucherRedeemableFrom) + Number(voucherValid) + Number(oneWeek));

        // Expire the voucher
        await exchangeHandler.connect(rando).expireVoucher(exchange.id);

        // Get the exchange state
        [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

        // It should match ExchangeState.Canceled
        assert.equal(response, ExchangeState.Canceled, "Exchange state is incorrect");
      });

      it("should update voucher expired flag when anyone calls and voucher has expired", async function () {
        // Set time forward past the voucher's validUntilDate
        await setNextBlockTimestamp(Number(voucherRedeemableFrom) + Number(voucherValid) + Number(oneWeek));

        // Expire the voucher
        await exchangeHandler.connect(rando).expireVoucher(exchange.id);

        // Get the voucher
        [, , response] = await exchangeHandler.connect(rando).getExchange(exchange.id);

        // Marshal response to entity
        voucher = Voucher.fromStruct(response);
        expect(voucher.isValid());

        // Exchange's voucher expired flag should be true
        assert.isTrue(voucher.expired, "Voucher expired flag not set");
      });

      context("💔 Revert Reasons", async function () {
        it("The exchanges region of protocol is paused", async function () {
          // Pause the exchanges region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Exchanges]);

          // Attempt to complete an exchange, expecting revert
          await expect(exchangeHandler.connect(buyer).expireVoucher(exchangeId)).to.revertedWith(
            RevertReasons.REGION_PAUSED
          );
        });

        it("exchange id is invalid", async function () {
          // Set time forward past the voucher's validUntilDate
          await setNextBlockTimestamp(Number(voucherRedeemableFrom) + Number(voucherValid) + Number(oneWeek));

          // An invalid exchange id
          exchangeId = "666";

          // Attempt to cancel the voucher, expecting revert
          await expect(exchangeHandler.connect(buyer).expireVoucher(exchangeId)).to.revertedWith(
            RevertReasons.NO_SUCH_EXCHANGE
          );
        });

        it("cannot expire voucher when exchange is in Redeemed state", async function () {
          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // Redeem the voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Get the exchange state
          [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

          // It should match ExchangeState.Redeemed
          assert.equal(response, ExchangeState.Redeemed, "Exchange state is incorrect");

          // Attempt to expire the voucher, expecting revert
          await expect(exchangeHandler.connect(buyer).expireVoucher(exchange.id)).to.revertedWith(
            RevertReasons.INVALID_STATE
          );
        });

        it("exchange is not in committed state", async function () {
          // Set time forward past the voucher's validUntilDate
          await setNextBlockTimestamp(Number(voucherRedeemableFrom) + Number(voucherValid) + Number(oneWeek));

          // Revoke the voucher
          await exchangeHandler.connect(operator).revokeVoucher(exchange.id);

          // Attempt to expire the voucher, expecting revert
          await expect(exchangeHandler.connect(buyer).expireVoucher(exchange.id)).to.revertedWith(
            RevertReasons.INVALID_STATE
          );
        });

        it("Redemption period has not yet elapsed", async function () {
          // Attempt to cancel the voucher, expecting revert
          await expect(exchangeHandler.connect(rando).expireVoucher(exchange.id)).to.revertedWith(
            RevertReasons.VOUCHER_STILL_VALID
          );
        });
      });
    });

    context("👉 redeemVoucher()", async function () {
      beforeEach(async function () {
        // Commit to offer
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });
      });

      it("should emit a VoucherRedeemed event when buyer calls", async function () {
        // Set time forward to the offer's voucherRedeemableFrom
        await setNextBlockTimestamp(Number(voucherRedeemableFrom));

        // Redeem the voucher, expecting event
        await expect(exchangeHandler.connect(buyer).redeemVoucher(exchange.id))
          .to.emit(exchangeHandler, "VoucherRedeemed")
          .withArgs(offerId, exchange.id, buyer.address);
      });

      it("should update state", async function () {
        // Set time forward to the offer's voucherRedeemableFrom
        await setNextBlockTimestamp(Number(voucherRedeemableFrom));

        // Redeem the voucher
        await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

        // Get the exchange state
        [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

        // It should match ExchangeState.Redeemed
        assert.equal(response, ExchangeState.Redeemed, "Exchange state is incorrect");
      });

      context("💔 Revert Reasons", async function () {
        it("The exchanges region of protocol is paused", async function () {
          // Pause the exchanges region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Exchanges]);

          // Attempt to complete an exchange, expecting revert
          await expect(exchangeHandler.connect(buyer).redeemVoucher(exchangeId)).to.revertedWith(
            RevertReasons.REGION_PAUSED
          );
        });

        it("exchange id is invalid", async function () {
          // An invalid exchange id
          exchangeId = "666";

          // Attempt to redeem the voucher, expecting revert
          await expect(exchangeHandler.connect(buyer).redeemVoucher(exchangeId)).to.revertedWith(
            RevertReasons.NO_SUCH_EXCHANGE
          );
        });

        it("exchange is not in committed state", async function () {
          // Revoke the voucher
          await exchangeHandler.connect(operator).revokeVoucher(exchange.id);

          // Attempt to redeem the voucher, expecting revert
          await expect(exchangeHandler.connect(buyer).redeemVoucher(exchange.id)).to.revertedWith(
            RevertReasons.INVALID_STATE
          );
        });

        it("caller does not own voucher", async function () {
          // Attempt to redeem the voucher, expecting revert
          await expect(exchangeHandler.connect(rando).redeemVoucher(exchange.id)).to.revertedWith(
            RevertReasons.NOT_VOUCHER_HOLDER
          );
        });

        it("current time is prior to offer's voucherRedeemableFrom", async function () {
          // Attempt to redeem the voucher, expecting revert
          await expect(exchangeHandler.connect(buyer).redeemVoucher(exchange.id)).to.revertedWith(
            RevertReasons.VOUCHER_NOT_REDEEMABLE
          );
        });

        it("current time is after to voucher's validUntilDate", async function () {
          // Set time forward past the voucher's validUntilDate
          await setNextBlockTimestamp(Number(voucherRedeemableFrom) + Number(voucherValid) + Number(oneWeek));

          // Attempt to redeem the voucher, expecting revert
          await expect(exchangeHandler.connect(buyer).redeemVoucher(exchange.id)).to.revertedWith(
            RevertReasons.VOUCHER_NOT_REDEEMABLE
          );
        });
      });
    });

    context("👉 redeemVoucher() with bundle", async function () {
      beforeEach(async function () {
        // Mint some tokens to be bundled
        await foreign20.connect(operator).mint(operator.address, "500");
        // Mint first two and last two tokens of range
        await foreign721.connect(operator).mint("0", "2");
        await foreign721.connect(operator).mint("8", "2");
        await foreign1155.connect(operator).mint("1", "500");

        // Approve the protocol diamond to transfer seller's tokens
        await foreign20.connect(operator).approve(protocolDiamond.address, "30");
        await foreign721.connect(operator).setApprovalForAll(protocolDiamond.address, true);
        await foreign1155.connect(operator).setApprovalForAll(protocolDiamond.address, true);

        // Create an ERC20 twin
        twin20 = mockTwin(foreign20.address);
        twin20.amount = "3";
        twin20.supplyAvailable = "30";
        expect(twin20.isValid()).is.true;

        // Create an ERC721 twin
        twin721 = mockTwin(foreign721.address, TokenType.NonFungibleToken);
        twin721.id = "2";
        twin721.amount = "0";
        twin721.supplyAvailable = "10";
        expect(twin721.isValid()).is.true;

        // Create an ERC1155 twin
        twin1155 = mockTwin(foreign1155.address, TokenType.MultiToken);
        twin1155.id = "3";
        twin1155.tokenId = "1";
        twin1155.amount = "1";
        twin1155.supplyAvailable = "10";

        expect(twin1155.isValid()).is.true;

        // All the twin ids (for mixed bundle)
        twinIds = [twin20.id, twin721.id, twin1155.id];

        // Create twins
        await twinHandler.connect(operator).createTwin(twin20.toStruct());
        await twinHandler.connect(operator).createTwin(twin721.toStruct());
        await twinHandler.connect(operator).createTwin(twin1155.toStruct());
      });

      context("📦 Offer bundled with ERC20 twin", async function () {
        beforeEach(async function () {
          // Create a new bundle
          bundle = new Bundle("1", seller.id, [offerId], [twin20.id]);
          expect(bundle.isValid()).is.true;
          await bundleHandler.connect(operator).createBundle(bundle.toStruct());

          // Commit to offer
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));
        });

        it("should transfer the twin", async function () {
          // Check the buyer's balance of the ERC20
          balance = await foreign20.balanceOf(buyer.address);
          expect(balance).to.equal(0);

          // Redeem the voucher
          await expect(exchangeHandler.connect(buyer).redeemVoucher(exchange.id))
            .to.emit(exchangeHandler, "TwinTransferred")
            .withArgs(twin20.id, twin20.tokenAddress, exchange.id, twin20.tokenId, twin20.amount, buyer.address);

          // Check the buyer's balance of the ERC20
          balance = await foreign20.balanceOf(buyer.address);
          expect(balance).to.equal(3);
        });

        it("Amount should be reduced from twin supplyAvailable", async function () {
          // Redeem the voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Check twin supplyAvailable
          const [, twin] = await twinHandler.connect(operator).getTwin(twin20.id);

          expect(twin.supplyAvailable).to.equal(twin20.supplyAvailable - twin20.amount);
        });

        it("Should not decrease twin supplyAvailable if supply is unlimited", async function () {
          // Change twin supply to unlimited
          twin20.supplyAvailable = ethers.constants.MaxUint256.toString();
          twin20.id = "4";

          // Create a new twin
          await twinHandler.connect(operator).createTwin(twin20.toStruct());

          const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
          offer.quantityAvailable = "2";

          // Create a new offer
          await offerHandler
            .connect(operator)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

          // Create a new bundle
          bundle = new Bundle("1", seller.id, [++offerId], [twin20.id]);
          await bundleHandler.connect(operator).createBundle(bundle.toStruct());

          // Commit to offer
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

          // Set time forward to the offer's voucherRedeemableFrom
          voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // Redeem the voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Check the supplyAvailable of the twin
          const [exists, twin] = await twinHandler.connect(operator).getTwin(twin20.id);
          expect(exists).to.be.true;
          expect(twin.supplyAvailable).to.equal(twin20.supplyAvailable);
        });

        it("Should transfer the twin even if supplyAvailable is equal to amount", async function () {
          const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
          offer.quantityAvailable = "1";

          // Create a new offer
          await offerHandler
            .connect(operator)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

          twin20.supplyAvailable = "3";
          twin20.id = "4";

          await twinHandler.connect(operator).createTwin(twin20.toStruct());

          // Create a new bundle
          bundle = new Bundle("1", seller.id, [++offerId], [twin20.id]);
          await bundleHandler.connect(operator).createBundle(bundle.toStruct());

          // Commit to offer
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

          // Set time forward to the offer's voucherRedeemableFrom
          voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // Redeem the second voucher
          await expect(exchangeHandler.connect(buyer).redeemVoucher(++exchange.id))
            .to.emit(exchangeHandler, "TwinTransferred")
            .withArgs(twin20.id, twin20.tokenAddress, exchange.id, "0", twin20.amount, buyer.address);

          // Check the buyer's balance
          balance = await foreign20.balanceOf(buyer.address);
          expect(balance).to.equal(3);

          const [, twin] = await twinHandler.getTwin(twin20.id);
          expect(twin.supplyAvailable).to.equal(0);
        });

        context("Twin transfer fail", async function () {
          it("should revoke exchange when buyer is an EOA", async function () {
            // Remove the approval for the protocal to transfer the seller's tokens
            await foreign20.connect(operator).approve(protocolDiamond.address, "0");

            const tx = await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

            await expect(tx)
              .to.emit(exchangeHandler, "VoucherRevoked")
              .withArgs(exchange.offerId, exchange.id, buyer.address);

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(twin20.id, twin20.tokenAddress, exchange.id, twin20.tokenId, twin20.amount, buyer.address);

            // Get the exchange state
            [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

            // It should match ExchangeState.Revoked
            assert.equal(response, ExchangeState.Revoked, "Exchange state is incorrect");
          });

          it("should revoke exchange when ERC20 contract transferFrom returns false", async function () {
            const [foreign20ReturnFalse] = await deployMockTokens(gasLimit, ["Foreign20TransferFromReturnFalse"]);

            await foreign20ReturnFalse.connect(operator).mint(operator.address, "500");
            await foreign20ReturnFalse.connect(operator).approve(protocolDiamond.address, "100");

            // Create a new ERC20 twin
            twin20 = mockTwin(foreign20ReturnFalse.address, TokenType.FungibleToken);
            twin20.id = "4";

            // Create a new twin
            await twinHandler.connect(operator).createTwin(twin20.toStruct());

            // Create a new offer
            const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();

            await offerHandler
              .connect(operator)
              .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

            // Set time forward to the offer's voucherRedeemableFrom
            voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
            await setNextBlockTimestamp(Number(voucherRedeemableFrom));

            // Create a new bundle
            await bundleHandler.connect(operator).createBundle(new Bundle("1", seller.id, [++offerId], [twin20.id]));

            // Commit to offer
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

            await expect(exchangeHandler.connect(buyer).redeemVoucher(++exchange.id))
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(twin20.id, twin20.tokenAddress, exchange.id, "0", twin20.amount, buyer.address);

            // Get the exchange state
            [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

            // It should match ExchangeState.Revoked
            assert.equal(response, ExchangeState.Revoked, "Exchange state is incorrect");
          });

          it("should raise a dispute when buyer account is a contract", async function () {
            // Remove the approval for the protocal to transfer the seller's tokens
            await foreign20.connect(operator).approve(protocolDiamond.address, "0");

            // Deploy contract to test redeem called by another contract
            let TestProtocolFunctionsFactory = await ethers.getContractFactory("TestProtocolFunctions");
            const testProtocolFunctions = await TestProtocolFunctionsFactory.deploy(protocolDiamond.address, {
              gasLimit,
            });
            await testProtocolFunctions.deployed();

            await testProtocolFunctions.commit(offerId, { value: price });

            let exchangeId = ++exchange.id;
            // Protocol should raised dispute automatically if transfer twin failed
            const tx = await testProtocolFunctions.redeem(exchangeId);

            await expect(tx)
              .to.emit(disputeHandler, "DisputeRaised")
              .withArgs(exchangeId, ++exchange.buyerId, seller.id, testProtocolFunctions.address);

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(
                twin20.id,
                twin20.tokenAddress,
                exchangeId,
                twin20.tokenId,
                twin20.amount,
                testProtocolFunctions.address
              );

            // Get the exchange state
            [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

            // It should match ExchangeState.Revoked
            assert.equal(response, ExchangeState.Disputed, "Exchange state is incorrect");
          });
        });
      });

      context("📦 Offer bundled with ERC721 twin", async function () {
        beforeEach(async function () {
          // Create a new bundle
          bundle = new Bundle("1", seller.id, [offerId], [twin721.id]);
          expect(bundle.isValid()).is.true;
          await bundleHandler.connect(operator).createBundle(bundle.toStruct());

          // Commit to offer
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));
        });

        it("Should transfer the twin", async function () {
          let tokenId = "9";

          // Check the operator owns the last ERC721 of twin range
          owner = await foreign721.ownerOf(tokenId);
          expect(owner).to.equal(operator.address);
          [exists, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

          // Redeem the voucher
          await expect(exchangeHandler.connect(buyer).redeemVoucher(exchange.id))
            .to.emit(exchangeHandler, "TwinTransferred")
            .withArgs(twin721.id, twin721.tokenAddress, exchange.id, tokenId, "0", buyer.address);

          // Check the buyer owns the last ERC721 of twin range
          owner = await foreign721.ownerOf(tokenId);
          expect(owner).to.equal(buyer.address);

          tokenId = "8";
          // Check the operator owns the last ERC721 of twin range
          owner = await foreign721.ownerOf(tokenId);
          expect(owner).to.equal(operator.address);

          // Commit to offer for the second time
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

          // Redeem the second voucher for the second time / id = 2
          await expect(exchangeHandler.connect(buyer).redeemVoucher(++exchange.id))
            .to.emit(exchangeHandler, "TwinTransferred")
            .withArgs(twin721.id, twin721.tokenAddress, exchange.id, tokenId, "0", buyer.address);

          // Check the buyer owns the last ERC721 of twin range
          owner = await foreign721.ownerOf(tokenId);
          expect(owner).to.equal(buyer.address);
        });

        it("1 should be reduced from twin supplyAvailable", async function () {
          // Redeem the voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Check twin supplyAvailable
          const [, twin] = await twinHandler.connect(operator).getTwin(twin721.id);

          expect(twin.supplyAvailable).to.equal(twin721.supplyAvailable - 1);
        });

        it("Should transfer the twin even if supplyAvailable is equal to 1", async function () {
          await foreign721.connect(operator).mint("10", "2");

          const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
          offer.quantityAvailable = "1";

          // Create a new offer
          await offerHandler
            .connect(operator)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

          twin721.supplyAvailable = "1";
          twin721.tokenId = "10";
          twin721.id = "4";

          // Create a new twin
          await twinHandler.connect(operator).createTwin(twin721.toStruct());

          // Create a new bundle
          bundle = new Bundle("1", seller.id, [++offerId], [twin721.id]);
          await bundleHandler.connect(operator).createBundle(bundle.toStruct());

          // Commit to offer
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

          // Set time forward to the offer's voucherRedeemableFrom
          voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          let tokenId = "10";
          // Redeem the second voucher
          await expect(exchangeHandler.connect(buyer).redeemVoucher(++exchange.id))
            .to.emit(exchangeHandler, "TwinTransferred")
            .withArgs(twin721.id, twin721.tokenAddress, exchange.id, tokenId, twin721.amount, buyer.address);

          // Check the buyer owns the first ERC721 in twin range
          owner = await foreign721.ownerOf(tokenId);
          expect(owner).to.equal(buyer.address);

          const [, twin] = await twinHandler.getTwin(twin721.id);
          expect(twin.supplyAvailable).to.equal(0);
        });

        context("Unlimited supply", async function () {
          let other721;
          beforeEach(async function () {
            // Deploy a new ERC721 token
            let TokenContractFactory = await ethers.getContractFactory("Foreign721");
            other721 = await TokenContractFactory.connect(rando).deploy({ gasLimit });

            // Mint enough tokens to cover the offer
            await other721.connect(operator).mint("0", "2");

            // Approve the protocol diamond to transfer seller's tokens
            await other721.connect(operator).setApprovalForAll(protocolDiamond.address, true);

            const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
            offer.quantityAvailable = "2";

            // Create a new offer
            await offerHandler
              .connect(operator)
              .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

            // Change twin supply to unlimited and token address to the new token
            twin721.supplyAvailable = ethers.constants.MaxUint256.toString();
            twin721.tokenAddress = other721.address;
            twin721.id = "4";

            // Create a new twin with the new token address
            await twinHandler.connect(operator).createTwin(twin721.toStruct());

            // Create a new bundle
            bundle = new Bundle("1", seller.id, [++offerId], [twin721.id]);
            await bundleHandler.connect(operator).createBundle(bundle.toStruct());

            // Commit to offer
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

            // Set time forward to the offer's voucherRedeemableFrom
            voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
            await setNextBlockTimestamp(Number(voucherRedeemableFrom));
          });

          it("Should not decrease twin supplyAvailable if supply is unlimited", async function () {
            // Redeem the voucher
            await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

            // Check the supplyAvailable of the twin
            const [exists, twin] = await twinHandler.connect(operator).getTwin(twin721.id);
            expect(exists).to.be.true;
            expect(twin.supplyAvailable).to.equal(twin721.supplyAvailable);
          });

          it("Transfer token order must be ascending if twin supply is unlimited", async function () {
            let exchangeId = ++exchange.id;

            // tokenId transferred to the buyer is 0
            let expectedTokenId = "0";

            // Check the operator owns the first ERC721 of twin range
            owner = await other721.ownerOf(expectedTokenId);
            expect(owner).to.equal(operator.address);

            // Redeem the voucher
            await expect(exchangeHandler.connect(buyer).redeemVoucher(exchangeId))
              .to.emit(exchangeHandler, "TwinTransferred")
              .withArgs(twin721.id, twin721.tokenAddress, exchangeId, expectedTokenId, "0", buyer.address);

            // Check the buyer owns the first ERC721 of twin range
            owner = await other721.ownerOf(expectedTokenId);
            expect(owner).to.equal(buyer.address);

            ++expectedTokenId;

            // Check the operator owns the second ERC721 of twin range
            owner = await other721.ownerOf(expectedTokenId);
            expect(owner).to.equal(operator.address);

            // Commit to offer for the second time
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

            // Redeem the voucher
            // tokenId transferred to the buyer is 1
            await expect(exchangeHandler.connect(buyer).redeemVoucher(++exchangeId))
              .to.emit(exchangeHandler, "TwinTransferred")
              .withArgs(twin721.id, twin721.tokenAddress, exchangeId, expectedTokenId, "0", buyer.address);

            // Check the buyer owns the second ERC721 of twin range
            owner = await other721.ownerOf(expectedTokenId);
            expect(owner).to.equal(buyer.address);
          });
        });

        context("Twin transfer fail", async function () {
          it("should revoke exchange when buyer is an EOA", async function () {
            // Remove the approval for the protocal to transfer the seller's tokens
            await foreign721.connect(operator).setApprovalForAll(protocolDiamond.address, false);

            const tx = await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

            await expect(tx)
              .to.emit(exchangeHandler, "VoucherRevoked")
              .withArgs(exchange.offerId, exchange.id, buyer.address);

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(twin721.id, twin721.tokenAddress, exchange.id, "9", "0", buyer.address);

            // Get the exchange state
            [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

            // It should match ExchangeState.Revoked
            assert.equal(response, ExchangeState.Revoked, "Exchange state is incorrect");
          });

          it("should raise a dispute when buyer account is a contract", async function () {
            // Deploy contract to test redeem called by another contract
            let TestProtocolFunctionsFactory = await ethers.getContractFactory("TestProtocolFunctions");
            const testProtocolFunctions = await TestProtocolFunctionsFactory.deploy(protocolDiamond.address, {
              gasLimit,
            });
            await testProtocolFunctions.deployed();

            await testProtocolFunctions.commit(offerId, { value: price });

            // Protocol should raised dispute automatically if transfer twin failed
            const tx = await testProtocolFunctions.connect(buyer).redeem(++exchange.id);

            await expect(tx)
              .to.emit(disputeHandler, "DisputeRaised")
              .withArgs(exchange.id, ++exchange.buyerId, seller.id, testProtocolFunctions.address);

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(twin721.id, twin721.tokenAddress, exchange.id, "9", "0", testProtocolFunctions.address);

            // Get the exchange state
            [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

            // It should match ExchangeState.Revoked
            assert.equal(response, ExchangeState.Disputed, "Exchange state is incorrect");
          });
        });
      });

      context("📦 Offer bundled with ERC1155 twin", async function () {
        beforeEach(async function () {
          // Create a new bundle
          bundle = new Bundle("1", seller.id, [offerId], [twin1155.id]);
          expect(bundle.isValid()).is.true;
          await bundleHandler.connect(operator).createBundle(bundle.toStruct());

          // Commit to offer
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));
        });

        it("should transfer the twin", async function () {
          let tokenId = "1";

          // Check the buyer's balance of the ERC1155
          balance = await foreign1155.balanceOf(buyer.address, tokenId);
          expect(balance).to.equal(0);

          // Redeem the voucher
          await expect(exchangeHandler.connect(buyer).redeemVoucher(exchange.id))
            .to.emit(exchangeHandler, "TwinTransferred")
            .withArgs(twin1155.id, twin1155.tokenAddress, exchange.id, tokenId, twin1155.amount, buyer.address);

          // Check the buyer's balance of the ERC1155
          balance = await foreign1155.balanceOf(buyer.address, tokenId);
          expect(balance).to.equal(1);
        });

        it("Amount should be reduced from twin supplyAvailable", async function () {
          // Redeem the voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Check twin supplyAvailable
          const [, twin] = await twinHandler.connect(operator).getTwin(twin1155.id);

          expect(twin.supplyAvailable).to.equal(twin1155.supplyAvailable - twin1155.amount);
        });

        it("Should not decrease twin supplyAvailable if supply is unlimited", async function () {
          // Change twin supply to unlimited
          twin1155.supplyAvailable = ethers.constants.MaxUint256.toString();
          twin1155.id = "4";

          // Create a new twin
          await twinHandler.connect(operator).createTwin(twin1155.toStruct());

          const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
          offer.quantityAvailable = "2";

          // Create a new offer
          await offerHandler
            .connect(operator)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

          // Create a new bundle
          bundle = new Bundle("1", seller.id, [++offerId], [twin1155.id]);
          await bundleHandler.connect(operator).createBundle(bundle.toStruct());

          // Commit to offer
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

          // Set time forward to the offer's voucherRedeemableFrom
          voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // Redeem the voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Check the supplyAvailable of the twin
          const [exists, twin] = await twinHandler.connect(operator).getTwin(twin1155.id);
          expect(exists).to.be.true;
          expect(twin.supplyAvailable).to.equal(twin1155.supplyAvailable);
        });

        it("Should transfer the twin even if supplyAvailable is equal to amount", async function () {
          const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
          offer.quantityAvailable = "1";

          // Create a new offer
          await offerHandler
            .connect(operator)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

          twin1155.supplyAvailable = "1";
          twin1155.id = "4";

          // Create a new twin
          await twinHandler.connect(operator).createTwin(twin1155.toStruct());

          // Create a new bundle
          bundle = new Bundle("1", seller.id, [++offerId], [twin1155.id]);
          await bundleHandler.connect(operator).createBundle(bundle.toStruct());

          // Commit to offer
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

          // Set time forward to the offer's voucherRedeemableFrom
          voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // Redeem the second voucher
          await expect(exchangeHandler.connect(buyer).redeemVoucher(++exchange.id))
            .to.emit(exchangeHandler, "TwinTransferred")
            .withArgs(
              twin1155.id,
              twin1155.tokenAddress,
              exchange.id,
              twin1155.tokenId,
              twin1155.amount,
              buyer.address
            );

          // Check the buyer's balance
          balance = await foreign1155.balanceOf(buyer.address, twin1155.tokenId);
          expect(balance).to.equal(1);

          const [, twin] = await twinHandler.getTwin(twin1155.id);
          expect(twin.supplyAvailable).to.equal(0);
        });

        context("Twin transfer fail", async function () {
          it("should revoke exchange when buyer is an EOA", async function () {
            // Remove the approval for the protocal to transfer the seller's tokens
            await foreign1155.connect(operator).setApprovalForAll(protocolDiamond.address, false);

            const tx = await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);
            await expect(tx)
              .to.emit(exchangeHandler, "VoucherRevoked")
              .withArgs(exchange.offerId, exchange.id, buyer.address);

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(
                twin1155.id,
                twin1155.tokenAddress,
                exchange.id,
                twin1155.tokenId,
                twin1155.amount,
                buyer.address
              );

            // Get the exchange state
            [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

            // It should match ExchangeState.Revoked
            assert.equal(response, ExchangeState.Revoked, "Exchange state is incorrect");
          });

          it("should raise a dispute when buyer account is a contract", async function () {
            // Deploy contract to test redeem called by another contract
            let TestProtocolFunctionsFactory = await ethers.getContractFactory("TestProtocolFunctions");
            const testProtocolFunctions = await TestProtocolFunctionsFactory.deploy(protocolDiamond.address, {
              gasLimit,
            });
            await testProtocolFunctions.deployed();

            await testProtocolFunctions.commit(offerId, { value: price });

            // Protocol should raised dispute automatically if transfer twin failed
            const tx = await testProtocolFunctions.redeem(++exchange.id);
            await expect(tx)
              .to.emit(disputeHandler, "DisputeRaised")
              .withArgs(exchange.id, ++exchange.buyerId, seller.id, testProtocolFunctions.address);

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(
                twin1155.id,
                twin1155.tokenAddress,
                exchange.id,
                twin1155.tokenId,
                twin1155.amount,
                testProtocolFunctions.address
              );

            // Get the exchange state
            [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

            // It should match ExchangeState.Revoked
            assert.equal(response, ExchangeState.Disputed, "Exchange state is incorrect");
          });
        });
      });

      context("📦 Offer bundled with mixed twins", async function () {
        beforeEach(async function () {
          // Create a new bundle
          bundle = new Bundle("1", seller.id, [offerId], twinIds);
          expect(bundle.isValid()).is.true;
          await bundleHandler.connect(operator).createBundle(bundle.toStruct());

          // Commit to offer
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));
        });

        it("should transfer the twins", async function () {
          let tokenIdNonFungible = "9";
          let tokenIdMultiToken = "1";

          // Check the buyer's balance of the ERC20
          balance = await foreign20.balanceOf(buyer.address);
          expect(balance).to.equal(0);

          // Check the operator owns the ERC721
          owner = await foreign721.ownerOf(tokenIdNonFungible);
          expect(owner).to.equal(operator.address);

          // Check the buyer's balance of the ERC1155
          balance = await foreign1155.balanceOf(buyer.address, tokenIdMultiToken);
          expect(balance).to.equal(0);

          let exchangeId = exchange.id;

          // Redeem the voucher
          const tx = await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

          await expect(tx)
            .to.emit(exchangeHandler, "TwinTransferred")
            .withArgs(
              twin1155.id,
              twin1155.tokenAddress,
              exchangeId,
              tokenIdMultiToken,
              twin1155.amount,
              buyer.address
            );

          await expect(tx)
            .and.to.emit(exchangeHandler, "TwinTransferred")
            .withArgs(twin20.id, twin20.tokenAddress, exchangeId, "0", twin20.amount, buyer.address);

          await expect(tx)
            .and.to.emit(exchangeHandler, "TwinTransferred")
            .withArgs(twin721.id, twin721.tokenAddress, exchangeId, tokenIdNonFungible, twin721.amount, buyer.address);

          // Check the buyer's balance of the ERC20
          balance = await foreign20.balanceOf(buyer.address);
          expect(balance).to.equal(3);

          // Check the buyer owns the ERC721
          owner = await foreign721.ownerOf(tokenIdNonFungible);
          expect(owner).to.equal(buyer.address);

          // Check the buyer's balance of the ERC1155
          balance = await foreign1155.balanceOf(buyer.address, tokenIdMultiToken);
          expect(balance).to.equal(1);
        });

        it("Should transfer the twin even if supplyAvailable is equal to amount", async function () {
          await foreign721.connect(operator).mint("10", "1");

          const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
          offer.quantityAvailable = "1";

          // Create a new offer
          await offerHandler
            .connect(operator)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

          twin1155.supplyAvailable = "1";
          twin1155.id = "4";

          // Create a new twin
          await twinHandler.connect(operator).createTwin(twin1155.toStruct());

          twin20.supplyAvailable = "3";
          twin20.id = "5";

          await twinHandler.connect(operator).createTwin(twin20.toStruct());

          twin721.supplyAvailable = "1";
          twin721.tokenId = "10";
          twin721.id = "6";

          await twinHandler.connect(operator).createTwin(twin721.toStruct());

          // Create a new bundle
          bundle = new Bundle("1", seller.id, [++offerId], [twin1155.id, twin20.id, twin721.id]);
          await bundleHandler.connect(operator).createBundle(bundle.toStruct());

          // Commit to offer
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

          // Set time forward to the offer's voucherRedeemableFrom
          voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // Redeem the second voucher
          const tx = await exchangeHandler.connect(buyer).redeemVoucher(++exchange.id);

          await expect(tx)
            .to.emit(exchangeHandler, "TwinTransferred")
            .withArgs(
              twin1155.id,
              twin1155.tokenAddress,
              exchange.id,
              twin1155.tokenId,
              twin1155.amount,
              buyer.address
            );

          await expect(tx)
            .and.to.emit(exchangeHandler, "TwinTransferred")
            .withArgs(twin721.id, twin721.tokenAddress, exchange.id, twin721.tokenId, twin721.amount, buyer.address);

          await expect(tx)
            .and.to.emit(exchangeHandler, "TwinTransferred")
            .withArgs(twin20.id, twin20.tokenAddress, exchange.id, "0", twin20.amount, buyer.address);

          // Check the buyer's balance
          balance = await foreign1155.balanceOf(buyer.address, twin1155.tokenId);
          expect(balance).to.equal(1);

          balance = await foreign721.balanceOf(buyer.address);
          expect(balance).to.equal(1);

          balance = await foreign20.balanceOf(buyer.address);
          expect(balance).to.equal(3);

          let [, twin] = await twinHandler.getTwin(twin1155.id);
          expect(twin.supplyAvailable).to.equal(0);

          [, twin] = await twinHandler.getTwin(twin721.id);
          expect(twin.supplyAvailable).to.equal(0);

          [, twin] = await twinHandler.getTwin(twin20.id);
          expect(twin.supplyAvailable).to.equal(0);
        });

        context("Unlimited supply", async function () {
          let other721;

          beforeEach(async function () {
            // Deploy a new ERC721 token
            let TokenContractFactory = await ethers.getContractFactory("Foreign721");
            other721 = await TokenContractFactory.connect(rando).deploy({ gasLimit });

            // Mint enough tokens to cover the offer
            await other721.connect(operator).mint("0", "2");

            // Approve the protocol diamond to transfer seller's tokens
            await other721.connect(operator).setApprovalForAll(protocolDiamond.address, true);

            const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
            offer.quantityAvailable = "2";

            // Create a new offer
            await offerHandler
              .connect(operator)
              .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

            // Change twin supply to unlimited and token address to the new token
            twin721.supplyAvailable = ethers.constants.MaxUint256.toString();
            twin721.tokenAddress = other721.address;
            twin721.id = "4";
            // Create a new ERC721 twin with the new token address
            await twinHandler.connect(operator).createTwin(twin721.toStruct());

            twin20.supplyAvailable = ethers.constants.MaxUint256.toString();
            twin20.id = "5";
            // Create a new ERC20 twin with the new token address
            await twinHandler.connect(operator).createTwin(twin20.toStruct());

            twin1155.supplyAvailable = ethers.constants.MaxUint256.toString();
            twin1155.id = "6";
            // Create a new ERC1155 twin with the new token address
            await twinHandler.connect(operator).createTwin(twin1155.toStruct());

            // Create a new bundle
            bundle = new Bundle("1", seller.id, [++offerId], [twin721.id, twin20.id, twin1155.id]);
            await bundleHandler.connect(operator).createBundle(bundle.toStruct());

            // Commit to offer
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

            // Set time forward to the offer's voucherRedeemableFrom
            voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
            await setNextBlockTimestamp(Number(voucherRedeemableFrom));

            ++exchange.id;
          });

          it("Should not decrease twin supplyAvailable if supply is unlimited", async function () {
            // Redeem the voucher
            const tx = await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferred")
              .withArgs(twin721.id, twin721.tokenAddress, exchange.id, "0", twin721.amount, buyer.address);

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferred")
              .withArgs(twin20.id, twin20.tokenAddress, exchange.id, twin20.tokenId, twin20.amount, buyer.address);

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferred")
              .withArgs(
                twin1155.id,
                twin1155.tokenAddress,
                exchange.id,
                twin1155.tokenId,
                twin1155.amount,
                buyer.address
              );

            // Check the supplyAvailable of each twin
            let [, twin] = await twinHandler.connect(operator).getTwin(twin721.id);
            expect(twin.supplyAvailable).to.equal(twin721.supplyAvailable);

            [, twin] = await twinHandler.connect(operator).getTwin(twin20.id);
            expect(twin.supplyAvailable).to.equal(twin20.supplyAvailable);

            [, twin] = await twinHandler.connect(operator).getTwin(twin1155.id);
            expect(twin.supplyAvailable).to.equal(twin1155.supplyAvailable);
          });

          it("Transfer token order must be ascending if twin supply is unlimited and token type is NonFungible", async function () {
            // tokenId transferred to the buyer is 0
            let expectedTokenId = "0";
            let exchangeId = exchange.id;

            // Check the operator owns the first ERC721 of twin range
            owner = await other721.ownerOf(expectedTokenId);
            expect(owner).to.equal(operator.address);

            // Redeem the voucher
            await expect(exchangeHandler.connect(buyer).redeemVoucher(exchangeId))
              .to.emit(exchangeHandler, "TwinTransferred")
              .withArgs(twin721.id, twin721.tokenAddress, exchangeId, expectedTokenId, "0", buyer.address);

            // Check the buyer owns the first ERC721 of twin range
            owner = await other721.ownerOf(expectedTokenId);
            expect(owner).to.equal(buyer.address);

            ++expectedTokenId;

            // Check the operator owns the second ERC721 of twin range
            owner = await other721.ownerOf(expectedTokenId);
            expect(owner).to.equal(operator.address);

            // Commit to offer for the second time
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

            // Redeem the voucher
            // tokenId transferred to the buyer is 1
            await expect(exchangeHandler.connect(buyer).redeemVoucher(++exchangeId))
              .to.emit(exchangeHandler, "TwinTransferred")
              .withArgs(twin721.id, twin721.tokenAddress, exchangeId, expectedTokenId, "0", buyer.address);

            // Check the buyer owns the second ERC721 of twin range
            owner = await other721.ownerOf(expectedTokenId);
            expect(owner).to.equal(buyer.address);
          });
        });

        context("Twin transfer fail", async function () {
          it("should revoke exchange when buyer is an EOA", async function () {
            // Remove the approval for the protocal to transfer the seller's tokens
            await foreign20.connect(operator).approve(protocolDiamond.address, "0");

            let exchangeId = exchange.id;
            const tx = await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

            await expect(tx)
              .to.emit(exchangeHandler, "VoucherRevoked")
              .withArgs(exchange.offerId, exchangeId, buyer.address);

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(twin20.id, twin20.tokenAddress, exchangeId, "0", twin20.amount, buyer.address);

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferred")
              .withArgs(twin721.id, twin721.tokenAddress, exchangeId, "9", "0", buyer.address);

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferred")
              .withArgs(
                twin1155.id,
                twin1155.tokenAddress,
                exchangeId,
                twin1155.tokenId,
                twin1155.amount,
                buyer.address
              );

            // Get the exchange state
            [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

            // It should match ExchangeState.Revoked
            assert.equal(response, ExchangeState.Revoked, "Exchange state is incorrect");
          });

          it("should raise a dispute when buyer account is a contract", async function () {
            // Remove the approval for the protocal to transfer the seller's tokens
            await foreign20.connect(operator).approve(protocolDiamond.address, "0");

            // Deploy contract to test redeem called by another contract
            let TestProtocolFunctionsFactory = await ethers.getContractFactory("TestProtocolFunctions");
            const testProtocolFunctions = await TestProtocolFunctionsFactory.deploy(protocolDiamond.address, {
              gasLimit,
            });
            await testProtocolFunctions.deployed();

            await testProtocolFunctions.commit(offerId, { value: price });

            let exchangeId = ++exchange.id;

            // Protocol should raised dispute automatically if transfer twin failed
            const tx = await testProtocolFunctions.redeem(exchangeId);
            await expect(tx)
              .to.emit(disputeHandler, "DisputeRaised")
              .withArgs(exchangeId, ++exchange.buyerId, seller.id, testProtocolFunctions.address);

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(twin20.id, twin20.tokenAddress, exchangeId, "0", twin20.amount, testProtocolFunctions.address);

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(twin721.id, twin721.tokenAddress, exchangeId, "9", "0", testProtocolFunctions.address);

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(
                twin1155.id,
                twin1155.tokenAddress,
                exchangeId,
                twin1155.tokenId,
                twin1155.amount,
                testProtocolFunctions.address
              );

            // Get the exchange state
            [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

            // It should match ExchangeState.Revoked
            assert.equal(response, ExchangeState.Disputed, "Exchange state is incorrect");
          });
        });
      });
    });

    context("👉 extendVoucher()", async function () {
      beforeEach(async function () {
        // Commit to offer
        tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);

        // Update the committed date in the expected exchange struct with the block timestamp of the tx
        voucher.committedDate = block.timestamp.toString();

        // Update the validUntilDate date in the expected exchange struct
        voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

        // New expiry date for extensions
        validUntilDate = ethers.BigNumber.from(voucher.validUntilDate).add(oneMonth).toString();
      });

      it("should emit an VoucherExtended event when seller's operator calls", async function () {
        // Extend the voucher, expecting event
        await expect(exchangeHandler.connect(operator).extendVoucher(exchange.id, validUntilDate))
          .to.emit(exchangeHandler, "VoucherExtended")
          .withArgs(offerId, exchange.id, validUntilDate, operator.address);
      });

      it("should update state", async function () {
        // Extend the voucher
        await exchangeHandler.connect(operator).extendVoucher(exchange.id, validUntilDate);

        // Get the voucher
        [, , response] = await exchangeHandler.connect(rando).getExchange(exchange.id);
        voucher = Voucher.fromStruct(response);

        // It should match the new validUntilDate
        assert.equal(voucher.validUntilDate, validUntilDate, "Voucher validUntilDate not updated");
      });

      context("💔 Revert Reasons", async function () {
        it("The exchanges region of protocol is paused", async function () {
          // Pause the exchanges region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Exchanges]);

          // Attempt to complete an exchange, expecting revert
          await expect(exchangeHandler.connect(operator).extendVoucher(exchange.id, validUntilDate)).to.revertedWith(
            RevertReasons.REGION_PAUSED
          );
        });

        it("exchange id is invalid", async function () {
          // An invalid exchange id
          exchangeId = "666";

          // Attempt to extend voucher, expecting revert
          await expect(exchangeHandler.connect(operator).extendVoucher(exchangeId, validUntilDate)).to.revertedWith(
            RevertReasons.NO_SUCH_EXCHANGE
          );
        });

        it("exchange is not in committed state", async function () {
          // Cancel the voucher
          await exchangeHandler.connect(buyer).cancelVoucher(exchange.id);

          // Attempt to extend voucher, expecting revert
          await expect(exchangeHandler.connect(operator).extendVoucher(exchange.id, validUntilDate)).to.revertedWith(
            RevertReasons.INVALID_STATE
          );
        });

        it("caller is not seller's operator", async function () {
          // Attempt to extend voucher, expecting revert
          await expect(exchangeHandler.connect(rando).extendVoucher(exchange.id, validUntilDate)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );
        });

        it("new date is not later than the current one", async function () {
          // New expiry date is older than current
          validUntilDate = ethers.BigNumber.from(voucher.validUntilDate).sub(oneMonth).toString();

          // Attempt to extend voucher, expecting revert
          await expect(exchangeHandler.connect(operator).extendVoucher(exchange.id, validUntilDate)).to.revertedWith(
            RevertReasons.VOUCHER_EXTENSION_NOT_VALID
          );
        });
      });
    });

    context("👉 onVoucherTransferred()", async function () {
      beforeEach(async function () {
        // Commit to offer, retrieving the event
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

        // Client used for tests
        bosonVoucherCloneAddress = calculateContractAddress(exchangeHandler.address, "1");
        bosonVoucherClone = await ethers.getContractAt("IBosonVoucher", bosonVoucherCloneAddress);
      });

      it("should emit an VoucherTransferred event when called by CLIENT-roled address", async function () {
        // Get the next buyer id
        nextAccountId = await accountHandler.connect(rando).getNextAccountId();

        // Call onVoucherTransferred, expecting event
        await expect(bosonVoucherClone.connect(buyer).transferFrom(buyer.address, newOwner.address, exchange.id))
          .to.emit(exchangeHandler, "VoucherTransferred")
          .withArgs(offerId, exchange.id, nextAccountId, bosonVoucherClone.address);
      });

      it("should update exchange when new buyer (with existing, active account) is passed", async function () {
        // Get the next buyer id
        nextAccountId = await accountHandler.connect(rando).getNextAccountId();

        // Create a buyer account for the new owner
        await accountHandler.connect(newOwner).createBuyer(mockBuyer(newOwner.address));

        // Call onVoucherTransferred
        await bosonVoucherClone.connect(buyer).transferFrom(buyer.address, newOwner.address, exchange.id);

        // Get the exchange
        [exists, response] = await exchangeHandler.connect(rando).getExchange(exchange.id);

        // Marshal response to entity
        exchange = Exchange.fromStruct(response);
        expect(exchange.isValid());

        // Exchange's voucher expired flag should be true
        assert.equal(exchange.buyerId, nextAccountId, "Exchange.buyerId not updated");
      });

      it("should update exchange when new buyer (no account) is passed", async function () {
        // Get the next buyer id
        nextAccountId = await accountHandler.connect(rando).getNextAccountId();

        // Call onVoucherTransferred
        await bosonVoucherClone.connect(buyer).transferFrom(buyer.address, newOwner.address, exchange.id);

        // Get the exchange
        [exists, response] = await exchangeHandler.connect(rando).getExchange(exchange.id);

        // Marshal response to entity
        exchange = Exchange.fromStruct(response);
        expect(exchange.isValid());

        // Exchange's voucher expired flag should be true
        assert.equal(exchange.buyerId, nextAccountId, "Exchange.buyerId not updated");
      });

      it("should be triggered when a voucher is transferred", async function () {
        // Transfer voucher, expecting event
        await expect(
          bosonVoucherClone.connect(buyer).transferFrom(buyer.address, newOwner.address, exchange.id)
        ).to.emit(exchangeHandler, "VoucherTransferred");
      });

      it("should not be triggered when a voucher is issued", async function () {
        // Get the next exchange id
        nextExchangeId = await exchangeHandler.getNextExchangeId();

        // Create a buyer account
        await accountHandler.connect(newOwner).createBuyer(mockBuyer(newOwner.address));

        // Grant PROTOCOL role to EOA address for test
        await accessController.grantRole(Role.PROTOCOL, rando.address);

        // Issue voucher, expecting no event
        await expect(bosonVoucherClone.connect(rando).issueVoucher(nextExchangeId, buyer.address)).to.not.emit(
          exchangeHandler,
          "VoucherTransferred"
        );
      });

      it("should not be triggered when a voucher is burned", async function () {
        // Grant PROTOCOL role to EOA address for test
        await accessController.grantRole(Role.PROTOCOL, rando.address);

        // Burn voucher, expecting no event
        await expect(bosonVoucherClone.connect(rando).burnVoucher(exchange.id)).to.not.emit(
          exchangeHandler,
          "VoucherTransferred"
        );
      });

      it("Should not be triggered when from and to addresses are the same", async function () {
        // Transfer voucher, expecting event
        await expect(
          bosonVoucherClone.connect(buyer).transferFrom(buyer.address, buyer.address, exchange.id)
        ).to.not.emit(exchangeHandler, "VoucherTransferred");
      });

      context("💔 Revert Reasons", async function () {
        it("The buyers region of protocol is paused", async function () {
          // Pause the buyers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Buyers]);

          // Attempt to create a buyer, expecting revert
          await expect(
            bosonVoucherClone.connect(buyer).transferFrom(buyer.address, newOwner.address, exchange.id)
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("Caller is not a clone address", async function () {
          // Attempt to call onVoucherTransferred, expecting revert
          await expect(
            exchangeHandler.connect(rando).onVoucherTransferred(exchange.id, newOwner.address)
          ).to.revertedWith(RevertReasons.ACCESS_DENIED);
        });

        it("Caller is not a clone address associated with the seller", async function () {
          // Create a new seller to get new clone
          seller = mockSeller(rando.address, rando.address, rando.address, rando.address);
          expect(seller.isValid()).is.true;

          await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);
          expectedCloneAddress = calculateContractAddress(accountHandler.address, "2");
          const bosonVoucherClone2 = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);

          // For the sake of test, mint token on bv2 with the id of token on bv1
          // Temporarily grant PROTOCOL role to deployer account
          await accessController.grantRole(Role.PROTOCOL, deployer.address);

          const newBuyer = mockBuyer(buyer.address);
          newBuyer.id = buyerId;
          await bosonVoucherClone2.issueVoucher(exchange.id, newBuyer.wallet);

          // Attempt to call onVoucherTransferred, expecting revert
          await expect(
            bosonVoucherClone2.connect(buyer).transferFrom(buyer.address, newOwner.address, exchange.id)
          ).to.revertedWith(RevertReasons.ACCESS_DENIED);
        });

        it("exchange id is invalid", async function () {
          // An invalid exchange id
          exchangeId = "666";

          // Attempt to call onVoucherTransferred, expecting revert
          await expect(
            exchangeHandler.connect(fauxClient).onVoucherTransferred(exchangeId, newOwner.address)
          ).to.revertedWith(RevertReasons.NO_SUCH_EXCHANGE);
        });

        it("exchange is not in committed state", async function () {
          // Revoke the voucher
          await exchangeHandler.connect(operator).revokeVoucher(exchange.id);

          // Attempt to call onVoucherTransferred, expecting revert
          await expect(
            exchangeHandler.connect(fauxClient).onVoucherTransferred(exchangeId, newOwner.address)
          ).to.revertedWith(RevertReasons.INVALID_STATE);
        });

        it("Voucher has expired", async function () {
          // Set time forward past the voucher's validUntilDate
          await setNextBlockTimestamp(Number(voucherRedeemableFrom) + Number(voucherValid) + Number(oneWeek));

          // Attempt to call onVoucherTransferred, expecting revert
          await expect(
            exchangeHandler.connect(fauxClient).onVoucherTransferred(exchangeId, newOwner.address)
          ).to.revertedWith(RevertReasons.VOUCHER_HAS_EXPIRED);
        });
      });
    });

    context("👉 isExchangeFinalized()", async function () {
      beforeEach(async function () {
        // Commit to offer, creating a new exchange
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });
      });

      context("👍 undisputed exchange", async function () {
        it("should return false if exchange does not exists", async function () {
          let exchangeId = "100";
          // Invalied exchange id, ask if exchange is finalized
          [exists, response] = await exchangeHandler.connect(rando).isExchangeFinalized(exchangeId);

          // It should not be exist
          assert.equal(exists, false, "Incorrectly reports existence");
          assert.equal(response, false, "Incorrectly reports finalized state");
        });

        it("should return false if exchange is in Committed state", async function () {
          // In Committed state, ask if exchange is finalized
          [exists, response] = await exchangeHandler.connect(rando).isExchangeFinalized(exchange.id);

          // It should not be finalized
          assert.equal(response, false, "Incorrectly reports finalized state");
        });

        it("should return false if exchange is in Redeemed state", async function () {
          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // Redeem voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Now in Redeemed state, ask if exchange is finalized
          [exists, response] = await exchangeHandler.connect(rando).isExchangeFinalized(exchange.id);

          // It should not be finalized
          assert.equal(response, false, "Incorrectly reports finalized state");
        });

        it("should return true if exchange is in Completed state", async function () {
          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // Redeem voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Get the current block info
          blockNumber = await ethers.provider.getBlockNumber();
          block = await ethers.provider.getBlock(blockNumber);

          // Set time forward to run out the dispute period
          newTime = ethers.BigNumber.from(voucherRedeemableFrom).add(disputePeriod).add(1).toNumber();
          await setNextBlockTimestamp(newTime);

          // Complete exchange
          await exchangeHandler.connect(operator).completeExchange(exchange.id);

          // Now in Completed state, ask if exchange is finalized
          [exists, response] = await exchangeHandler.connect(rando).isExchangeFinalized(exchange.id);

          // It should be finalized
          assert.equal(response, true, "Incorrectly reports unfinalized state");
        });

        it("should return true if exchange is in Revoked state", async function () {
          // Revoke voucher
          await exchangeHandler.connect(operator).revokeVoucher(exchange.id);

          // Now in Revoked state, ask if exchange is finalized
          [exists, response] = await exchangeHandler.connect(rando).isExchangeFinalized(exchange.id);

          // It should be finalized
          assert.equal(response, true, "Incorrectly reports unfinalized state");
        });

        it("should return true if exchange is in Canceled state", async function () {
          // Cancel voucher
          await exchangeHandler.connect(buyer).cancelVoucher(exchange.id);

          // Now in Canceled state, ask if exchange is finalized
          [exists, response] = await exchangeHandler.connect(rando).isExchangeFinalized(exchange.id);

          // It should be finalized
          assert.equal(response, true, "Incorrectly reports unfinalized state");
        });
      });

      context("👎 disputed exchange", async function () {
        beforeEach(async function () {
          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // Redeem voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Raise a dispute on the exchange
          await disputeHandler.connect(buyer).raiseDispute(exchange.id);
        });

        it("should return false if exchange has a dispute in Disputed state", async function () {
          // In Disputed state, ask if exchange is finalized
          [exists, response] = await exchangeHandler.connect(rando).isExchangeFinalized(exchange.id);

          // It should not be finalized
          assert.equal(response, false, "Incorrectly reports finalized state");
        });

        it("should return true if exchange has a dispute in Retracted state", async function () {
          // Retract Dispute
          await disputeHandler.connect(buyer).retractDispute(exchange.id);

          // Now in Retracted state, ask if exchange is finalized
          [exists, response] = await exchangeHandler.connect(rando).isExchangeFinalized(exchange.id);

          // It should be finalized
          assert.equal(response, true, "Incorrectly reports unfinalized state");
        });

        it("should return true if exchange has a dispute in Resolved state", async function () {
          const buyerPercentBasisPoints = "5566"; // 55.66%

          // Set the message Type, needed for signature
          const resolutionType = [
            { name: "exchangeId", type: "uint256" },
            { name: "buyerPercentBasisPoints", type: "uint256" },
          ];

          const customSignatureType = {
            Resolution: resolutionType,
          };

          const message = {
            exchangeId: exchange.id,
            buyerPercentBasisPoints,
          };

          // Collect the signature components
          const { r, s, v } = await prepareDataSignatureParameters(
            buyer, // Operator is the caller, seller should be the signer.
            customSignatureType,
            "Resolution",
            message,
            disputeHandler.address
          );

          // Resolve Dispute
          await disputeHandler.connect(operator).resolveDispute(exchange.id, buyerPercentBasisPoints, r, s, v);

          // Now in Resolved state, ask if exchange is finalized
          [exists, response] = await exchangeHandler.connect(rando).isExchangeFinalized(exchange.id);

          // It should be finalized
          assert.equal(response, true, "Incorrectly reports unfinalized state");
        });

        it("should return false if exchange has a dispute in Escalated state", async function () {
          // Escalate the dispute
          await disputeHandler.connect(buyer).escalateDispute(exchange.id);

          // In Escalated state, ask if exchange is finalized
          [exists, response] = await exchangeHandler.connect(rando).isExchangeFinalized(exchange.id);

          // It should not be finalized
          assert.equal(response, false, "Incorrectly reports finalized state");
        });

        it("should return true if exchange has a dispute in Decided state", async function () {
          // Escalate the dispute
          await disputeHandler.connect(buyer).escalateDispute(exchange.id);

          // Decide Dispute
          await disputeHandler.connect(operatorDR).decideDispute(exchange.id, "1111");

          // Now in Decided state, ask if exchange is finalized
          [exists, response] = await exchangeHandler.connect(rando).isExchangeFinalized(exchange.id);

          // It should be finalized
          assert.equal(response, true, "Incorrectly reports unfinalized state");
        });

        it("should return true if exchange has a dispute in Refused state", async function () {
          // Escalate the dispute
          tx = await disputeHandler.connect(buyer).escalateDispute(exchange.id);

          // Get the block timestamp of the confirmed tx and set escalatedDate
          blockNumber = tx.blockNumber;
          block = await ethers.provider.getBlock(blockNumber);
          const escalatedDate = block.timestamp.toString();

          await setNextBlockTimestamp(Number(escalatedDate) + Number(disputeResolver.escalationResponsePeriod));

          // Expire dispute
          await disputeHandler.connect(rando).expireEscalatedDispute(exchange.id);

          // Now in Decided state, ask if exchange is finalized
          [exists, response] = await exchangeHandler.connect(rando).isExchangeFinalized(exchange.id);

          // It should be finalized
          assert.equal(response, true, "Incorrectly reports unfinalized state");
        });
      });
    });

    context("👉 getNextExchangeId()", async function () {
      it("should return the next exchange id", async function () {
        // Get the next exchange id and compare it to the initial expected id
        nextExchangeId = await exchangeHandler.connect(rando).getNextExchangeId();
        expect(nextExchangeId).to.equal(exchangeId);

        // Commit to offer, creating a new exchange
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

        // Get the next exchange id and ensure it was incremented by the creation of the offer
        nextExchangeId = await exchangeHandler.connect(rando).getNextExchangeId();
        expect(nextExchangeId).to.equal(++exchangeId);
      });

      it("should not increment the counter", async function () {
        // Get the next exchange id
        nextExchangeId = await exchangeHandler.connect(rando).getNextExchangeId();
        expect(nextExchangeId).to.equal(exchangeId);

        // Get the next exchange id and ensure it was not incremented by the previous call
        nextExchangeId = await exchangeHandler.connect(rando).getNextExchangeId();
        expect(nextExchangeId).to.equal(exchangeId);
      });
    });

    context("👉 getExchange()", async function () {
      beforeEach(async function () {
        // Commit to offer
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });
      });

      it("should return true for exists if exchange id is valid", async function () {
        // Get the exchange
        [exists, response] = await exchangeHandler.connect(rando).getExchange(exchange.id);

        // Test existence flag
        expect(exists).to.be.true;
      });

      it("should return false for exists if exchange id is not valid", async function () {
        // Get the exchange
        [exists, response] = await exchangeHandler.connect(rando).getExchange(exchange.id + 10);

        // Test existence flag
        expect(exists).to.be.false;
      });

      it("should return the expected exchange if exchange id is valid", async function () {
        // Get the exchange
        [exists, response] = await exchangeHandler.connect(rando).getExchange(exchange.id);

        // It should match the expected exchange struct
        assert.equal(exchange.toString(), Exchange.fromStruct(response).toString(), "Exchange struct is incorrect");
      });
    });

    context("👉 getExchangeState()", async function () {
      beforeEach(async function () {
        // Commit to offer
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });
      });

      it("should return true for exists if exchange id is valid", async function () {
        // Get the exchange state
        [exists, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

        // Test existence flag
        expect(exists).to.be.true;
      });

      it("should return false for exists if exchange id is not valid", async function () {
        // Attempt to get the exchange state for invalid exchange
        [exists, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id + 10);

        // Test existence flag
        expect(exists).to.be.false;
      });

      it("should return the expected exchange state if exchange id is valid", async function () {
        // Get the exchange state
        [exists, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

        // It should match ExchangeState.Committed
        assert.equal(response, ExchangeState.Committed, "Exchange state is incorrect");
      });
    });

    context("getReceipt", async function () {
      beforeEach(async () => {
        // Commit to offer
        tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

        // Decrease offer quantityAvailable
        offer.quantityAvailable = "9";

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);

        // Update the committed date in the expected exchange struct with the block timestamp of the tx
        voucher.committedDate = block.timestamp.toString();

        // Update the validUntilDate date in the expected exchange struct
        voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

        // Set time forward to the offer's voucherRedeemableFrom
        await setNextBlockTimestamp(Number(voucherRedeemableFrom));

        // Redeem the voucher
        tx = await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);

        // Update the redeemedDate date in the expected exchange struct
        voucher.redeemedDate = block.timestamp.toString();
      });

      it("Should return the correct receipt", async function () {
        // Complete the exchange
        const tx = await exchangeHandler.connect(buyer).completeExchange(exchange.id);

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);

        // Update the finalizedDate date in the expected exchange struct
        exchange.finalizedDate = block.timestamp.toString();

        // Update the state in the expected exchange struct
        exchange.state = ExchangeState.Completed;

        // Get the exchange state
        [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

        // It should match ExchangeState.Completed
        assert.equal(response, ExchangeState.Completed, "Exchange state is incorrect");

        // Get receipt
        const receipt = await exchangeHandler.connect(buyer).getReceipt(exchange.id);
        const receiptObject = Receipt.fromStruct(receipt);

        const expectedReceipt = new Receipt(
          exchange.id,
          offer.id,
          buyerId,
          seller.id,
          price,
          offer.sellerDeposit,
          offer.buyerCancelPenalty,
          offerFees,
          agentId,
          offer.exchangeToken,
          exchange.finalizedDate,
          undefined,
          voucher.committedDate,
          voucher.redeemedDate,
          voucher.expired
        );
        expect(expectedReceipt.isValid()).is.true;

        expect(receiptObject).to.eql(expectedReceipt);
      });

      it("price, sellerDeposit, and disputeResolverId must be 0 if is an absolute zero offer", async function () {
        // Set protocolFee to zero so we don't get the error AGENT_FEE_AMOUNT_TOO_HIGH
        protocolFeePercentage = "0";
        await configHandler.connect(deployer).setProtocolFeePercentage(protocolFeePercentage);
        offerFees.protocolFee = "0";

        // Create a new offer with params price, sellerDeposit and disputeResolverId = 0
        const mo = await mockOffer();
        const { offerDates, offerDurations } = mo;
        offer = mo.offer;
        offer.id = offerId = "2";
        offer.price = offer.buyerCancelPenalty = offer.sellerDeposit = "0";
        // set a dummy token address otherwise protocol token (zero address) and offer token will be the same and we will get the error AGENT_FEE_AMOUNT_TOO_HIGH
        offer.exchangeToken = foreign20.address;
        disputeResolverId = agentId = "0";

        // Update voucherRedeemableFrom
        voucherRedeemableFrom = offerDates.voucherRedeemableFrom;

        // Check if domains are valid
        expect(offer.isValid()).is.true;
        expect(offerDates.isValid()).is.true;
        expect(offerDurations.isValid()).is.true;

        // Create the offer
        await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

        // Commit to offer
        tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId);

        // Decrease offer quantityAvailable
        offer.quantityAvailable = "0";
        // Increase exchange.id as is a new commitToOffer
        exchange.id = "2";

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);

        // Update the committed date in the expected exchange struct with the block timestamp of the tx
        voucher.committedDate = block.timestamp.toString();

        // Update the validUntilDate date in the expected exchange struct
        voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

        // Set time forward to the offer's voucherRedeemableFrom
        await setNextBlockTimestamp(Number(voucherRedeemableFrom));

        // Redeem the voucher
        tx = await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);

        // Update the redeemedDate date in the expected exchange struct
        voucher.redeemedDate = block.timestamp.toString();

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);

        // Update the redeemedDate date in the expected exchange struct
        voucher.redeemedDate = block.timestamp.toString();

        // Complete the exchange
        tx = await exchangeHandler.connect(buyer).completeExchange(exchange.id);

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);

        // Update the finalizedDate date in the expected exchange struct
        exchange.finalizedDate = block.timestamp.toString();

        // Update the state in the expected exchange struct
        exchange.state = ExchangeState.Completed;

        // Get the exchange state
        [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

        // It should match ExchangeState.Completed
        assert.equal(response, ExchangeState.Completed, "Exchange state is incorrect");

        // Get receipt
        const receipt = await exchangeHandler.connect(buyer).getReceipt(exchange.id);
        const receiptObject = Receipt.fromStruct(receipt);

        const expectedReceipt = new Receipt(
          exchange.id,
          offer.id,
          buyerId,
          seller.id,
          offer.price,
          offer.sellerDeposit,
          offer.buyerCancelPenalty,
          offerFees,
          agentId,
          offer.exchangeToken,
          exchange.finalizedDate,
          undefined,
          voucher.committedDate,
          voucher.redeemedDate,
          voucher.expired
        );
        expect(expectedReceipt.isValid()).is.true;

        expect(receiptObject).to.eql(expectedReceipt);
      });

      context("Disputed was raised", async function () {
        let disputedDate;
        beforeEach(async function () {
          // Raise a dispute on the exchange
          const tx = await disputeHandler.connect(buyer).raiseDispute(exchange.id);

          // Get the block timestamp of the confirmed tx
          blockNumber = tx.blockNumber;
          block = await ethers.provider.getBlock(blockNumber);

          disputedDate = block.timestamp.toString();
        });

        it("Receipt should contain dispute data if a dispute was raised for exchange", async function () {
          // Retract dispute
          const tx = await disputeHandler.connect(buyer).retractDispute(exchange.id);

          // Get the block timestamp of the confirmed tx
          blockNumber = tx.blockNumber;
          block = await ethers.provider.getBlock(blockNumber);

          // Update the finalizedDate date in the expected exchange struct
          exchange.finalizedDate = block.timestamp.toString();

          // Update the state in the expected exchange struct
          exchange.state = ExchangeState.Disputed;

          // Get the exchange state
          [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

          // It should match ExchangeState.Completed
          assert.equal(response, ExchangeState.Disputed, "Exchange state is incorrect");

          const receipt = await exchangeHandler.connect(buyer).getReceipt(exchange.id);
          const receiptObject = Receipt.fromStruct(receipt);

          const expectedDispute = new Dispute(exchange.id, DisputeState.Retracted, "0");
          expect(expectedDispute.isValid()).is.true;

          const expectedReceipt = new Receipt(
            exchange.id,
            offer.id,
            buyerId,
            seller.id,
            price,
            offer.sellerDeposit,
            offer.buyerCancelPenalty,
            offerFees,
            agentId,
            offer.exchangeToken,
            exchange.finalizedDate,
            undefined,
            voucher.committedDate,
            voucher.redeemedDate,
            voucher.expired,
            disputeResolverId,
            disputedDate,
            undefined,
            DisputeState.Retracted
          );
          expect(expectedReceipt.isValid()).is.true;

          expect(receiptObject).to.eql(expectedReceipt);
        });

        it("Receipt should contain escalatedDate if a dispute was raised and escalated", async function () {
          // Escalate a dispute
          let tx = await disputeHandler.connect(buyer).escalateDispute(exchange.id);

          // Get the block timestamp of the confirmed tx
          blockNumber = tx.blockNumber;
          block = await ethers.provider.getBlock(blockNumber);

          const escalatedDate = block.timestamp.toString();

          // Retract dispute
          tx = await disputeHandler.connect(buyer).retractDispute(exchange.id);

          // Get the block timestamp of the confirmed tx
          blockNumber = tx.blockNumber;
          block = await ethers.provider.getBlock(blockNumber);

          // Update the finalizedDate date in the expected exchange struct
          exchange.finalizedDate = block.timestamp.toString();

          // Update the state in the expected exchange struct
          exchange.state = ExchangeState.Disputed;

          // Get the exchange state
          [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

          // It should match ExchangeState.Completed
          assert.equal(response, ExchangeState.Disputed, "Exchange state is incorrect");

          const receipt = await exchangeHandler.connect(buyer).getReceipt(exchange.id);
          const receiptObject = Receipt.fromStruct(receipt);

          const expectedDispute = new Dispute(exchange.id, DisputeState.Retracted, "0");
          expect(expectedDispute.isValid()).is.true;

          const expectedReceipt = new Receipt(
            exchange.id,
            offer.id,
            buyerId,
            seller.id,
            price,
            offer.sellerDeposit,
            offer.buyerCancelPenalty,
            offerFees,
            agentId,
            offer.exchangeToken,
            exchange.finalizedDate,
            undefined,
            voucher.committedDate,
            voucher.redeemedDate,
            voucher.expired,
            disputeResolverId,
            disputedDate,
            escalatedDate,
            DisputeState.Retracted
          );
          expect(expectedReceipt.isValid()).is.true;

          expect(receiptObject).to.eql(expectedReceipt);
        });
      });

      context("TwinReceipt tests", async function () {
        beforeEach(async function () {
          // Mint some tokens to be bundled
          await foreign20.connect(operator).mint(operator.address, "500");
          await foreign721.connect(operator).mint("0", "10");

          // Approve the protocol diamond to transfer seller's tokens
          await foreign20.connect(operator).approve(protocolDiamond.address, "3");
          await foreign721.connect(operator).setApprovalForAll(protocolDiamond.address, true);

          // Create an ERC20 twin
          twin20 = mockTwin(foreign20.address);
          twin20.amount = "3";
          expect(twin20.isValid()).is.true;

          await twinHandler.connect(operator).createTwin(twin20.toStruct());

          // Create an ERC721 twin
          twin721 = mockTwin(foreign721.address, TokenType.NonFungibleToken);
          twin721.amount = "0";
          twin721.supplyAvailable = "10";
          twin721.id = "2";
          expect(twin721.isValid()).is.true;

          await twinHandler.connect(operator).createTwin(twin721.toStruct());

          // Create a new offer
          const mo = await mockOffer();
          const { offerDates, offerDurations } = mo;
          offer = mo.offer;
          offer.quantityAvailable = "10";
          offer.id = offerId = "2";
          disputeResolverId = mo.disputeResolverId;

          // Update voucherRedeemableFrom
          voucherRedeemableFrom = offerDates.voucherRedeemableFrom;

          // Check if domains are valid
          expect(offer.isValid()).is.true;
          expect(offerDates.isValid()).is.true;
          expect(offerDurations.isValid()).is.true;

          // Create the offer
          await offerHandler
            .connect(operator)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);
        });

        it("Receipt should contain twin receipt data if offer was bundled with twin", async function () {
          // Create a new bundle
          bundle = new Bundle("1", seller.id, [offerId], [twin20.id]);
          expect(bundle.isValid()).is.true;
          await bundleHandler.connect(operator).createBundle(bundle.toStruct());

          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // Commit to offer
          let tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

          // Get the block timestamp of the confirmed tx
          blockNumber = tx.blockNumber;
          block = await ethers.provider.getBlock(blockNumber);

          // Update the committed date in the expected exchange struct with the block timestamp of the tx
          voucher.committedDate = block.timestamp.toString();

          // Update the validUntilDate date in the expected exchange struct
          voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

          // Decrease expected offer quantityAvailable after commit
          offer.quantityAvailable = "9";

          // Increase expected id and offerId in exchange struct
          exchange.id = "2";
          exchange.offerId = "2";

          // Redeem the voucher
          tx = await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Get the block timestamp of the confirmed tx
          blockNumber = tx.blockNumber;
          block = await ethers.provider.getBlock(blockNumber);

          // Update the redeemedDate date in the expected exchange struct
          voucher.redeemedDate = block.timestamp.toString();

          // Complete the exchange
          tx = await exchangeHandler.connect(buyer).completeExchange(exchange.id);

          // Get the block timestamp of the confirmed tx
          blockNumber = tx.blockNumber;
          block = await ethers.provider.getBlock(blockNumber);

          // Update the finalizedDate date in the expected exchange struct
          exchange.finalizedDate = block.timestamp.toString();

          // Update the state in the expected exchange struct
          exchange.state = ExchangeState.Completed;

          // Get the exchange state
          [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

          // It should match ExchangeState.Completed
          assert.equal(response, ExchangeState.Completed, "Exchange state is incorrect");

          // Get receipt
          const receipt = await exchangeHandler.connect(buyer).getReceipt(exchange.id);
          const receiptObject = Receipt.fromStruct(receipt);

          const expectedTwinReceipt = new TwinReceipt(
            twin20.id,
            twin20.tokenId,
            twin20.amount,
            twin20.tokenAddress,
            twin20.tokenType
          );
          expect(expectedTwinReceipt.isValid()).is.true;

          const expectedReceipt = new Receipt(
            exchange.id,
            offer.id,
            buyerId,
            seller.id,
            price,
            offer.sellerDeposit,
            offer.buyerCancelPenalty,
            offerFees,
            agentId,
            offer.exchangeToken,
            exchange.finalizedDate,
            undefined,
            voucher.committedDate,
            voucher.redeemedDate,
            voucher.expired,
            undefined,
            undefined,
            undefined,
            undefined,
            [expectedTwinReceipt]
          );

          expect(expectedReceipt.isValid()).is.true;
          expect(receiptObject).to.eql(expectedReceipt);
        });

        it("Receipt should contain multiple twin receipts data if offer was bundled with multiple twin", async function () {
          // Create a new bundle
          bundle = new Bundle("1", seller.id, [offerId], [twin20.id, twin721.id]);
          expect(bundle.isValid()).is.true;
          await bundleHandler.connect(operator).createBundle(bundle.toStruct());

          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // Commit to offer
          let tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

          // Get the block timestamp of the confirmed tx
          blockNumber = tx.blockNumber;
          block = await ethers.provider.getBlock(blockNumber);

          // Update the committed date in the expected exchange struct with the block timestamp of the tx
          voucher.committedDate = block.timestamp.toString();

          // Update the validUntilDate date in the expected exchange struct
          voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

          // Decrease expected offer quantityAvailable after commit
          offer.quantityAvailable = "9";

          // Increase expected id and offerId in exchange struct
          exchange.id = "2";
          exchange.offerId = "2";

          // Redeem the voucher
          tx = await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Get the block timestamp of the confirmed tx
          blockNumber = tx.blockNumber;
          block = await ethers.provider.getBlock(blockNumber);

          // Update the redeemedDate date in the expected exchange struct
          voucher.redeemedDate = block.timestamp.toString();

          // Complete the exchange
          tx = await exchangeHandler.connect(buyer).completeExchange(exchange.id);

          // Get the block timestamp of the confirmed tx
          blockNumber = tx.blockNumber;
          block = await ethers.provider.getBlock(blockNumber);

          // Update the finalizedDate date in the expected exchange struct
          exchange.finalizedDate = block.timestamp.toString();

          // Update the state in the expected exchange struct
          exchange.state = ExchangeState.Completed;

          // Get the exchange state
          [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

          // It should match ExchangeState.Completed
          assert.equal(response, ExchangeState.Completed, "Exchange state is incorrect");

          // Get receipt
          const receipt = await exchangeHandler.connect(buyer).getReceipt(exchange.id);
          const receiptObject = Receipt.fromStruct(receipt);

          const expectedTwin20Receipt = new TwinReceipt(
            twin20.id,
            twin20.tokenId,
            twin20.amount,
            twin20.tokenAddress,
            twin20.tokenType
          );
          expect(expectedTwin20Receipt.isValid()).is.true;

          const expectedTwin721Receipt = new TwinReceipt(
            twin721.id,
            "9", // twin transfer order is descending
            twin721.amount,
            twin721.tokenAddress,
            twin721.tokenType
          );
          expect(expectedTwin721Receipt.isValid()).is.true;

          const expectedReceipt = new Receipt(
            exchange.id,
            offer.id,
            buyerId,
            seller.id,
            price,
            offer.sellerDeposit,
            offer.buyerCancelPenalty,
            offerFees,
            agentId,
            offer.exchangeToken,
            exchange.finalizedDate,
            undefined,
            voucher.committedDate,
            voucher.redeemedDate,
            voucher.expired,
            undefined,
            undefined,
            undefined,
            undefined,
            [expectedTwin20Receipt, expectedTwin721Receipt]
          );
          expect(expectedReceipt.isValid()).is.true;
          expect(receiptObject).to.eql(expectedReceipt);
        });
      });

      it("Receipt should contain condition data if offer belongs to a group", async function () {
        // Required constructor params for Group
        groupId = "1";
        offerIds = [offerId];

        // Create condition
        condition = mockCondition({ tokenAddress: foreign20.address });
        expect(condition.isValid()).to.be.true;

        // Create a new group
        group = new Group(groupId, seller.id, offerIds);
        expect(group.isValid()).is.true;
        await groupHandler.connect(operator).createGroup(group, condition);

        // Mint enough tokens for the buyer
        await foreign20.connect(buyer).mint(buyer.address, condition.threshold);

        // Commit to offer
        let tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

        // Decrease offer quantityAvailable
        offer.quantityAvailable = "9";

        // Increase expected id and offerId in exchange struct
        exchange.id = "2";
        exchange.offerId = "2";

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);

        // Update the committed date in the expected exchange struct with the block timestamp of the tx
        voucher.committedDate = block.timestamp.toString();

        // Update the validUntilDate date in the expected exchange struct
        voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

        // Set time forward to the offer's voucherRedeemableFrom
        // await setNextBlockTimestamp(Number(voucherRedeemableFrom));

        // Redeem the voucher
        tx = await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);

        // Update the redeemedDate date in the expected exchange struct
        voucher.redeemedDate = block.timestamp.toString();

        // Complete the exchange
        tx = await exchangeHandler.connect(buyer).completeExchange(exchange.id);

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);

        // Update the finalizedDate date in the expected exchange struct
        exchange.finalizedDate = block.timestamp.toString();

        // Update the state in the expected exchange struct
        exchange.state = ExchangeState.Completed;

        // Get the exchange state
        [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

        // It should match ExchangeState.Completed
        assert.equal(response, ExchangeState.Completed, "Exchange state is incorrect");

        // Get receipt
        const receipt = await exchangeHandler.connect(buyer).getReceipt(exchange.id);
        const receiptObject = Receipt.fromStruct(receipt);

        const expectedReceipt = new Receipt(
          exchange.id,
          offer.id,
          buyerId,
          seller.id,
          price,
          offer.sellerDeposit,
          offer.buyerCancelPenalty,
          offerFees,
          agentId,
          offer.exchangeToken,
          exchange.finalizedDate,
          condition,
          voucher.committedDate,
          voucher.redeemedDate,
          voucher.expired
        );
        expect(expectedReceipt.isValid()).is.true;

        expect(receiptObject).to.eql(expectedReceipt);
      });

      it("Receipt should contain agentId and agentAddress if agent for offer exists", async function () {
        // Create a valid agent
        agent = mockAgent(rando.address);
        // Set new agentId
        agentId = agent.id = "4";
        expect(agent.isValid()).is.true;

        // Create an agent
        await accountHandler.connect(rando).createAgent(agent);

        // Update agentFee
        const agentFee = ethers.BigNumber.from(offer.price).mul(agent.feePercentage).div("10000").toString();
        offerFees.agentFee = agentFee;

        // Create a new offer
        const mo = await mockOffer();
        const { offerDates, offerDurations } = mo;
        offer = mo.offer;
        offer.id = offerId = "2";
        disputeResolverId = mo.disputeResolverId;

        // Update voucherRedeemableFrom
        voucherRedeemableFrom = offerDates.voucherRedeemableFrom;

        // Check if domains are valid
        expect(offer.isValid()).is.true;
        expect(offerDates.isValid()).is.true;
        expect(offerDurations.isValid()).is.true;

        // Create the offer
        await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

        // Commit to offer
        let tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

        // Decrease offer quantityAvailable
        offer.quantityAvailable = "0";

        // Increase expected id and offerId in exchange struct
        exchange.id = "2";
        exchange.offerId = "2";

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);

        // Update the committed date in the expected exchange struct with the block timestamp of the tx
        voucher.committedDate = block.timestamp.toString();

        // Update the validUntilDate date in the expected exchange struct
        voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

        // Set time forward to the offer's voucherRedeemableFrom
        await setNextBlockTimestamp(Number(voucherRedeemableFrom));

        // Redeem the voucher
        tx = await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);

        // Update the redeemedDate date in the expected exchange struct
        voucher.redeemedDate = block.timestamp.toString();

        // Complete the exchange
        tx = await exchangeHandler.connect(buyer).completeExchange(exchange.id);

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);

        // Update the finalizedDate date in the expected exchange struct
        exchange.finalizedDate = block.timestamp.toString();

        // Update the state in the expected exchange struct
        exchange.state = ExchangeState.Completed;

        // Get the exchange state
        [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

        // It should match ExchangeState.Completed
        assert.equal(response, ExchangeState.Completed, "Exchange state is incorrect");

        // Get receipt
        const receipt = await exchangeHandler.connect(buyer).getReceipt(exchange.id);
        const receiptObject = Receipt.fromStruct(receipt);

        const expectedReceipt = new Receipt(
          exchange.id,
          offer.id,
          buyerId,
          seller.id,
          price,
          offer.sellerDeposit,
          offer.buyerCancelPenalty,
          offerFees,
          agentId,
          offer.exchangeToken,
          exchange.finalizedDate,
          undefined,
          voucher.committedDate,
          voucher.redeemedDate,
          voucher.expired
        );
        expect(expectedReceipt.isValid()).is.true;

        expect(receiptObject).to.eql(expectedReceipt);
      });

      context("💔 Revert Reasons", async function () {
        it("Exchange is not in a final state", async function () {
          await expect(exchangeHandler.connect(rando).getReceipt(exchange.id)).to.be.revertedWith(
            RevertReasons.EXCHANGE_IS_NOT_IN_A_FINAL_STATE
          );
        });

        it("Exchange id is invalid", async function () {
          const invalidExchangeId = "666";

          await expect(exchangeHandler.connect(rando).getReceipt(invalidExchangeId)).to.be.revertedWith(
            RevertReasons.NO_SUCH_EXCHANGE
          );
        });
      });
    });
  });
});
