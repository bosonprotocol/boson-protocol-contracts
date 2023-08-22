const { ethers } = require("hardhat");
const {
  ZeroAddress,
  getSigners,
  getContractAt,
  provider,
  parseUnits,
  getContractFactory,
  MaxUint256,
  parseEther,
  getImpersonatedSigner,
  toBeHex,
  keccak256,
  zeroPadBytes,
  zeroPadValue,
  id,
} = ethers;
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
const GatingType = require("../../scripts/domain/GatingType");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
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
  getMappingStoragePosition,
  paddingType,
  getEvent,
  setNextBlockTimestamp,
  calculateVoucherExpiry,
  prepareDataSignatureParameters,
  calculateCloneAddress,
  calculateBosonProxyAddress,
  applyPercentage,
  deriveTokenId,
  setupTestEnvironment,
  getSnapshot,
  revertToSnapshot,
} = require("../util/utils.js");
const { oneWeek, oneMonth } = require("../util/constants");
const { FundsList } = require("../../scripts/domain/Funds");
const { toHexString } = require("../../scripts/util/utils.js");
const { getStorageAt } = require("@nomicfoundation/hardhat-network-helpers");
const { getSelectors, FacetCutAction } = require("../../scripts/util/diamond-utils.js");

/**
 *  Test the Boson Exchange Handler interface
 */
describe("IBosonExchangeHandler", function () {
  // Common vars
  let InterfaceIds;
  let deployer,
    pauser,
    assistant,
    admin,
    clerk,
    treasury,
    rando,
    buyer,
    newOwner,
    fauxClient,
    assistantDR,
    adminDR,
    clerkDR,
    treasuryDR;
  let erc165,
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
  let beaconProxyAddress;
  let buyerId, offerId, seller, nextExchangeId, nextAccountId, disputeResolverId;
  let block, blockNumber, tx, txReceipt, event;
  let support, newTime;
  let price, sellerPool;
  let voucherRedeemableFrom;
  let disputePeriod, voucherValid;
  let protocolFeePercentage;
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
  let protocolDiamondAddress;
  let snapshotId;
  let tokenId;

  before(async function () {
    accountId.next(true);

    // get interface Ids
    InterfaceIds = await getInterfaceIds();

    // Specify contracts needed for this test
    const contracts = {
      erc165: "ERC165Facet",
      accountHandler: "IBosonAccountHandler",
      twinHandler: "IBosonTwinHandler",
      bundleHandler: "IBosonBundleHandler",
      offerHandler: "IBosonOfferHandler",
      exchangeHandler: "IBosonExchangeHandler",
      fundsHandler: "IBosonFundsHandler",
      disputeHandler: "IBosonDisputeHandler",
      groupHandler: "IBosonGroupHandler",
      pauseHandler: "IBosonPauseHandler",
      configHandler: "IBosonConfigHandler",
    };

    ({
      signers: [pauser, admin, treasury, buyer, rando, newOwner, fauxClient, adminDR, treasuryDR],
      contractInstances: {
        erc165,
        accountHandler,
        twinHandler,
        bundleHandler,
        offerHandler,
        exchangeHandler,
        fundsHandler,
        disputeHandler,
        groupHandler,
        pauseHandler,
        configHandler,
      },
      protocolConfig: [, , { percentage: protocolFeePercentage }],
      extraReturnValues: { bosonVoucher, voucherImplementation, accessController },
      diamondAddress: protocolDiamondAddress,
    } = await setupTestEnvironment(contracts));

    [deployer] = await getSigners();

    // make all account the same
    assistant = admin;
    assistantDR = adminDR;
    clerk = clerkDR = { address: ZeroAddress };

    // Deploy the mock tokens
    [foreign20, foreign721, foreign1155] = await deployMockTokens(["Foreign20", "Foreign721", "Foreign1155"]);

    // Get the beacon proxy address
    beaconProxyAddress = await calculateBosonProxyAddress(await configHandler.getAddress());

    // Get snapshot id
    snapshotId = await getSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();
  });

  async function upgradeMetaTransactionsHandlerFacet() {
    // Upgrade the ExchangeHandlerFacet functions
    // DiamondCutFacet
    const cutFacetViaDiamond = await getContractAt("DiamondCutFacet", protocolDiamondAddress);

    // Deploy MockMetaTransactionsHandlerFacet
    const MockMetaTransactionsHandlerFacet = await getContractFactory("MockMetaTransactionsHandlerFacet");
    const mockMetaTransactionsHandlerFacet = await MockMetaTransactionsHandlerFacet.deploy();
    await mockMetaTransactionsHandlerFacet.waitForDeployment();

    // Define the facet cut
    const facetCuts = [
      {
        facetAddress: await mockMetaTransactionsHandlerFacet.getAddress(),
        action: FacetCutAction.Add,
        functionSelectors: getSelectors(mockMetaTransactionsHandlerFacet),
      },
    ];

    // Send the DiamondCut transaction
    const tx = await cutFacetViaDiamond.connect(deployer).diamondCut(facetCuts, ZeroAddress, "0x");

    // Wait for transaction to confirm
    const receipt = await tx.wait();

    // Be certain transaction was successful
    assert.equal(receipt.status, 1, `Diamond upgrade failed: ${tx.hash}`);

    // Cast Diamond to MockMetaTransactionsHandlerFacet
    mockMetaTransactionsHandler = await getContractAt("MockMetaTransactionsHandlerFacet", protocolDiamondAddress);
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
      seller = mockSeller(
        await assistant.getAddress(),
        await admin.getAddress(),
        clerk.address,
        await treasury.getAddress()
      );
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
      expectedCloneAddress = calculateCloneAddress(
        await accountHandler.getAddress(),
        beaconProxyAddress,
        admin.address,
        ""
      );

      // Create a valid dispute resolver
      disputeResolver = mockDisputeResolver(
        await assistantDR.getAddress(),
        await adminDR.getAddress(),
        clerkDR.address,
        await treasuryDR.getAddress(),
        true
      );
      expect(disputeResolver.isValid()).is.true;

      //Create DisputeResolverFee array so offer creation will succeed
      disputeResolverFees = [new DisputeResolverFee(ZeroAddress, "Native", "0")];

      // Make empty seller list, so every seller is allowed
      const sellerAllowList = [];

      // Register the dispute resolver
      await accountHandler
        .connect(adminDR)
        .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

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
      await offerHandler.connect(assistant).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

      // Set used variables
      price = offer.price;
      voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
      voucherValid = offerDurations.voucherValid;
      disputePeriod = offerDurations.disputePeriod;
      sellerPool = parseUnits("15", "ether").toString();

      // Required voucher constructor params
      voucher = mockVoucher();
      voucher.redeemedDate = "0";

      // Mock exchange
      exchange = mockExchange();

      buyerId = accountId.next().value;
      exchange.buyerId = buyerId;
      exchange.finalizedDate = "0";

      // Deposit seller funds so the commit will succeed
      await fundsHandler.connect(assistant).depositFunds(seller.id, ZeroAddress, sellerPool, { value: sellerPool });
    });

    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    context("👉 commitToOffer()", async function () {
      it("should emit a BuyerCommitted event", async function () {
        // Commit to offer, retrieving the event
        tx = await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });
        txReceipt = await tx.wait();
        event = getEvent(txReceipt, exchangeHandler, "BuyerCommitted");

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await provider.getBlock(blockNumber);

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
        await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

        // Get the next exchange id and ensure it was incremented by the creation of the offer
        nextExchangeId = await exchangeHandler.connect(rando).getNextExchangeId();
        expect(nextExchangeId).to.equal(++exchangeId);
      });

      it("should issue the voucher on the correct clone", async function () {
        // Cast expectedCloneAddress to IBosonVoucher (existing clone)
        bosonVoucherClone = await getContractAt("IBosonVoucher", expectedCloneAddress);

        // Create a new seller to get new clone
        seller = mockSeller(await rando.getAddress(), await rando.getAddress(), ZeroAddress, await rando.getAddress());
        seller.id = "3"; // buyer is created after seller in this test
        expect(seller.isValid()).is.true;

        await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);

        expectedCloneAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          rando.address,
          ""
        );
        const bosonVoucherClone2 = await getContractAt("IBosonVoucher", expectedCloneAddress);

        // Create an offer with new seller
        const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();

        // Create the offer
        await offerHandler.connect(rando).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

        // Deposit seller funds so the commit will succeed
        await fundsHandler.connect(rando).depositFunds(seller.id, ZeroAddress, sellerPool, { value: sellerPool });

        const buyer2 = newOwner;

        // Commit to offer, creating a new exchange
        tx = await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });
        const tokenId1 = deriveTokenId(offerId, "1");
        const tx2 = await exchangeHandler
          .connect(deployer)
          .commitToOffer(await buyer2.getAddress(), ++offerId, { value: price });
        const tokenId2 = deriveTokenId(offerId, "2");

        await expect(tx)
          .to.emit(bosonVoucherClone, "Transfer")
          .withArgs(0n, await buyer.getAddress(), tokenId1);
        await expect(tx2)
          .to.emit(bosonVoucherClone2, "Transfer")
          .withArgs(0n, await buyer2.getAddress(), tokenId2);

        // buyer should own 1 voucher on the clone1 address and buyer2 should own 1 voucher on clone2
        expect(await bosonVoucherClone.balanceOf(await buyer.getAddress())).to.equal(
          "1",
          "Clone 1: buyer 1 balance should be 1"
        );
        expect(await bosonVoucherClone.balanceOf(await buyer2.getAddress())).to.equal(
          "0",
          "Clone 1: buyer 2 balance should be 0"
        );
        expect(await bosonVoucherClone2.balanceOf(await buyer.getAddress())).to.equal(
          "0",
          "Clone 2: buyer 1 balance should be 0"
        );
        expect(await bosonVoucherClone2.balanceOf(await buyer2.getAddress())).to.equal(
          "1",
          "Clone 2: buyer 2 balance should be 1"
        );

        // Make sure that vouchers belong to correct buyers and that exist on the correct clone
        expect(await bosonVoucherClone.ownerOf(tokenId1)).to.equal(
          await buyer.getAddress(),
          "Voucher 1: Wrong await buyer.getAddress()"
        );
        await expect(bosonVoucherClone.ownerOf(tokenId2)).to.revertedWith(RevertReasons.ERC721_INVALID_TOKEN_ID);
        expect(await bosonVoucherClone2.ownerOf(tokenId2)).to.equal(
          await buyer2.getAddress(),
          "Voucher 2: Wrong await buyer.getAddress()"
        );
        await expect(bosonVoucherClone2.ownerOf(tokenId1)).to.revertedWith(RevertReasons.ERC721_INVALID_TOKEN_ID);

        // reference boson voucher proxy should not have any vouchers
        expect(await bosonVoucher.balanceOf(await buyer.getAddress())).to.equal(
          "0",
          "Reference proxy: buyer 1 balance should be 0"
        );
        expect(await bosonVoucher.balanceOf(await buyer2.getAddress())).to.equal(
          "0",
          "Reference proxy: buyer 2 balance should be 0"
        );

        // reference boson voucher should not have vouchers with id 1 and 2
        await expect(bosonVoucher.ownerOf(tokenId1)).to.revertedWith(RevertReasons.ERC721_INVALID_TOKEN_ID);
        await expect(bosonVoucher.ownerOf(tokenId2)).to.revertedWith(RevertReasons.ERC721_INVALID_TOKEN_ID);

        // boson voucher implementation should not have any vouchers
        expect(await voucherImplementation.balanceOf(await buyer.getAddress())).to.equal(
          "0",
          "Voucher implementation: buyer 1 balance should be 0"
        );
        expect(await voucherImplementation.balanceOf(await buyer2.getAddress())).to.equal(
          "0",
          "Voucher implementation: buyer 2 balance should be 0"
        );

        // boson voucher implementation should not have vouchers with id 1 and 2
        await expect(voucherImplementation.ownerOf(tokenId1)).to.revertedWith(RevertReasons.ERC721_INVALID_TOKEN_ID);
        await expect(voucherImplementation.ownerOf(tokenId2)).to.revertedWith(RevertReasons.ERC721_INVALID_TOKEN_ID);
      });

      it("ERC2981: issued voucher should have royalty fees", async function () {
        // Cast expectedCloneAddress to IBosonVoucher (existing clone)
        bosonVoucherClone = await getContractAt("IBosonVoucher", expectedCloneAddress);

        // Create a new seller to get new clone
        seller = mockSeller(await rando.getAddress(), await rando.getAddress(), ZeroAddress, await rando.getAddress());
        seller.id = "3"; // buyer is created after seller in this test
        expect(seller.isValid()).is.true;

        // VoucherInitValues
        voucherInitValues.royaltyPercentage = "800"; // 8%
        expect(voucherInitValues.isValid()).is.true;

        await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);
        expectedCloneAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          rando.address,
          ""
        );
        const bosonVoucherClone2 = await getContractAt("IBosonVoucher", expectedCloneAddress);

        // Create an offer with new seller
        const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();

        // Create the offer
        await offerHandler.connect(rando).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

        // Deposit seller funds so the commit will succeed
        await fundsHandler.connect(rando).depositFunds(seller.id, ZeroAddress, sellerPool, { value: sellerPool });

        const buyer2 = newOwner;

        // Commit to offer, creating a new exchange
        tx = await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });
        const tokenId1 = deriveTokenId(offerId, "1");
        const tx2 = await exchangeHandler
          .connect(deployer)
          .commitToOffer(await buyer2.getAddress(), ++offerId, { value: price });
        const tokenId2 = deriveTokenId(offerId, "2");

        await expect(tx)
          .to.emit(bosonVoucherClone, "Transfer")
          .withArgs(0n, await buyer.getAddress(), tokenId1);
        await expect(tx2)
          .to.emit(bosonVoucherClone2, "Transfer")
          .withArgs(0n, await buyer2.getAddress(), tokenId2);

        // buyer should own 1 voucher on the clone1 address and buyer2 should own 1 voucher on clone2
        expect(await bosonVoucherClone.balanceOf(await buyer.getAddress())).to.equal(
          "1",
          "Clone 1: buyer 1 balance should be 1"
        );
        expect(await bosonVoucherClone.balanceOf(await buyer2.getAddress())).to.equal(
          "0",
          "Clone 1: buyer 2 balance should be 0"
        );
        expect(await bosonVoucherClone2.balanceOf(await buyer.getAddress())).to.equal(
          "0",
          "Clone 2: buyer 1 balance should be 0"
        );
        expect(await bosonVoucherClone2.balanceOf(await buyer2.getAddress())).to.equal(
          "1",
          "Clone 2: buyer 2 balance should be 1"
        );

        // Make sure that vouchers belong to correct buyers and that exist on the correct clone
        expect(await bosonVoucherClone.ownerOf(tokenId1)).to.equal(
          await buyer.getAddress(),
          "Voucher 1: Wrong await buyer.getAddress()"
        );
        await expect(bosonVoucherClone.ownerOf(tokenId2)).to.revertedWith(RevertReasons.ERC721_INVALID_TOKEN_ID);
        expect(await bosonVoucherClone2.ownerOf(tokenId2)).to.equal(
          await buyer2.getAddress(),
          "Voucher 2: Wrong await buyer.getAddress()"
        );
        await expect(bosonVoucherClone2.ownerOf(tokenId1)).to.revertedWith(RevertReasons.ERC721_INVALID_TOKEN_ID);

        // Make sure that vouchers have correct royalty fee for exchangeId 1
        exchangeId = "1";
        let receiver, royaltyAmount;
        [receiver, royaltyAmount] = await bosonVoucherClone.connect(assistant).royaltyInfo(tokenId1, offer.price);

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
        [receiver, royaltyAmount] = await bosonVoucherClone2.connect(assistant).royaltyInfo(tokenId2, offer.price);

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
        await offerHandler
          .connect(assistant)
          .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);
        exchange.offerId = offerId = "2"; // tested against second offer

        // Commit to offer, retrieving the event
        tx = await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });
        txReceipt = await tx.wait();
        event = getEvent(txReceipt, exchangeHandler, "BuyerCommitted");

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await provider.getBlock(blockNumber);

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
        await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

        // Offer qunantityAvailable should be decremented
        const [, offer] = await offerHandler.connect(rando).getOffer(offerId);
        expect(offer.quantityAvailable).to.equal(9, "Quantity available should be 9");
      });

      it("Should not decrement quantityAvailable if offer is unlimited", async function () {
        // Create an offer with unlimited quantity
        let { offer, ...details } = await mockOffer();
        offer.quantityAvailable = MaxUint256.toString();

        // Delete unnecessary field
        delete details.offerFees;

        // Check if domain entities are valid
        expect(offer.isValid()).is.true;

        // Create the offer
        await offerHandler.connect(assistant).createOffer(offer, ...Object.values(details), agentId);
        exchange.offerId = offerId = "2"; // first offer is created on beforeEach

        // Commit to offer
        await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

        // Offer qunantityAvailable should not be decremented
        [, offer] = await offerHandler.connect(rando).getOffer(offerId);
        expect(offer.quantityAvailable).to.equal(MaxUint256, "Quantity available should be unlimited");
      });

      it("Should not decrement seller funds if offer price and sellerDeposit is 0", async function () {
        let availableFundsAddresses = [ZeroAddress];
        // Seller funds before
        const sellersFundsBefore = FundsList.fromStruct(
          await fundsHandler.getAvailableFunds(seller.id, availableFundsAddresses)
        );

        // Set protocolFee to zero so we don't get the error AGENT_FEE_AMOUNT_TOO_HIGH
        let protocolFeePercentage = "0";
        await configHandler.connect(deployer).setProtocolFeePercentage(protocolFeePercentage);
        offerFees.protocolFee = "0";

        // Create an absolute zero offer
        const mo = await mockOffer();
        const { offerDates, offerDurations } = mo;
        offer = mo.offer;
        offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = "0";
        // set a dummy token address otherwise protocol token (zero address) and offer token will be the same and we will get the error AGENT_FEE_AMOUNT_TOO_HIGH
        offer.exchangeToken = await foreign20.getAddress();
        disputeResolverId = agentId = "0";
        exchange.offerId = offerId = "2"; // first offer is created on beforeEach

        // Check if domain entities are valid
        expect(offer.isValid()).is.true;

        // Create the offer
        await offerHandler
          .connect(assistant)
          .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

        // Commit to offer
        await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId);

        // Seller funds after
        const sellerFundsAfter = FundsList.fromStruct(
          await fundsHandler.getAvailableFunds(seller.id, availableFundsAddresses)
        );
        expect(sellerFundsAfter.toString()).to.equal(
          sellersFundsBefore.toString(),
          "Seller funds should not be decremented"
        );
      });

      it("If group has no condition, buyers can commit using this method", async function () {
        // Required constructor params for Group
        groupId = "1";
        offerIds = [offerId];

        // Create Condition
        condition = mockCondition({
          method: EvaluationMethod.None,
          tokenAddress: ZeroAddress,
          threshold: "0",
          maxCommits: "0",
        });
        expect(condition.isValid()).to.be.true;

        // Create Group
        group = new Group(groupId, seller.id, offerIds);
        expect(group.isValid()).is.true;
        await groupHandler.connect(assistant).createGroup(group, condition);

        await expect(
          exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price })
        ).to.not.reverted;
      });

      it("should work on an additional collection", async function () {
        // Create a new collection
        const externalId = `Brand1`;
        await accountHandler.connect(assistant).createNewCollection(externalId, voucherInitValues);

        offer.collectionIndex = 1;
        offer.id = await offerHandler.getNextOfferId();
        exchangeId = await exchangeHandler.getNextExchangeId();
        const tokenId = deriveTokenId(offer.id, exchangeId);

        // Create the offer
        await offerHandler
          .connect(assistant)
          .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

        // Commit to offer, creating a new exchange
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offer.id, { value: price });

        // expected address of the first clone and first additional collection
        const defaultCloneAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          admin.address,
          ""
        );
        const defaultBosonVoucher = await getContractAt("BosonVoucher", defaultCloneAddress);
        const additionalCollectionAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          admin.address,
          externalId
        );
        const additionalCollection = await getContractAt("BosonVoucher", additionalCollectionAddress);

        // buyer should own 1 voucher additional collection and 0 vouchers on the default clone
        expect(await defaultBosonVoucher.balanceOf(buyer.address)).to.equal(
          "0",
          "Default clone: buyer's balance should be 0"
        );
        expect(await additionalCollection.balanceOf(buyer.address)).to.equal(
          "1",
          "Additional collection: buyer's balance should be 1"
        );

        // Make sure that vouchers belong to correct buyers and that exist on the correct clone
        await expect(defaultBosonVoucher.ownerOf(tokenId)).to.revertedWith(RevertReasons.ERC721_INVALID_TOKEN_ID);
        expect(await additionalCollection.ownerOf(tokenId)).to.equal(buyer.address, "Wrong buyer address");
      });

      context("💔 Revert Reasons", async function () {
        it("The exchanges region of protocol is paused", async function () {
          // Pause the exchanges region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Exchanges]);

          // Attempt to create an exchange, expecting revert
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price })
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("The buyers region of protocol is paused", async function () {
          // Pause the buyers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Buyers]);

          // Attempt to create a buyer, expecting revert
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price })
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("buyer.address is the zero address", async function () {
          // Attempt to commit, expecting revert
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(ZeroAddress, offerId, { value: price })
          ).to.revertedWith(RevertReasons.INVALID_ADDRESS);
        });

        it("offer id is invalid", async function () {
          // An invalid offer id
          offerId = "666";

          // Attempt to commit, expecting revert
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price })
          ).to.revertedWith(RevertReasons.NO_SUCH_OFFER);
        });

        it("offer is voided", async function () {
          // Void the offer first
          await offerHandler.connect(assistant).voidOffer(offerId);

          // Attempt to commit to the voided offer, expecting revert
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price })
          ).to.revertedWith(RevertReasons.OFFER_HAS_BEEN_VOIDED);
        });

        it("offer is not yet available for commits", async function () {
          // Create an offer with staring date in the future
          // get current block timestamp
          const block = await provider.getBlock("latest");

          // set validFrom date in the past
          offerDates.validFrom = (BigInt(block.timestamp) + oneMonth * 6n).toString(); // 6 months in the future
          offerDates.validUntil = BigInt(offerDates.validFrom + 10).toString(); // just after the valid from so it succeeds.

          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

          // Attempt to commit to the not availabe offer, expecting revert
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), ++offerId, { value: price })
          ).to.revertedWith(RevertReasons.OFFER_NOT_AVAILABLE);
        });

        it("offer has expired", async function () {
          // Go past offer expiration date
          await setNextBlockTimestamp(Number(offerDates.validUntil) + 1);

          // Attempt to commit to the expired offer, expecting revert
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price })
          ).to.revertedWith(RevertReasons.OFFER_HAS_EXPIRED);
        });

        it("offer sold", async function () {
          // Create an offer with only 1 item
          offer.quantityAvailable = "1";
          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);
          // Commit to offer, so it's not availble anymore
          await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), ++offerId, { value: price });

          // Attempt to commit to the sold out offer, expecting revert
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price })
          ).to.revertedWith(RevertReasons.OFFER_SOLD_OUT);
        });

        it("Offer belongs to a group with condition", async function () {
          // Required constructor params for Group
          groupId = "1";
          offerIds = [offerId];

          // Create Condition
          condition = mockCondition({ tokenAddress: await foreign20.getAddress(), threshold: "50", maxCommits: "3" });
          expect(condition.isValid()).to.be.true;

          // Create Group
          group = new Group(groupId, seller.id, offerIds);
          expect(group.isValid()).is.true;
          await groupHandler.connect(assistant).createGroup(group, condition);

          await expect(
            exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price })
          ).to.revertedWith(RevertReasons.GROUP_HAS_CONDITION);
        });
      });
    });

    context("👉 commitToPremintedOffer()", async function () {
      let tokenId;
      beforeEach(async function () {
        // Reserve range
        await offerHandler
          .connect(assistant)
          .reserveRange(offer.id, offer.quantityAvailable, await assistant.getAddress());

        // expected address of the first clone
        const voucherCloneAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          admin.address,
          ""
        );
        bosonVoucher = await getContractAt("BosonVoucher", voucherCloneAddress);
        await bosonVoucher.connect(assistant).preMint(offer.id, offer.quantityAvailable);

        tokenId = deriveTokenId(offer.id, exchangeId);
      });

      it("should emit a BuyerCommitted event", async function () {
        // Commit to preminted offer, retrieving the event
        tx = await bosonVoucher
          .connect(assistant)
          .transferFrom(await assistant.getAddress(), await buyer.getAddress(), tokenId);
        txReceipt = await tx.wait();
        event = getEvent(txReceipt, exchangeHandler, "BuyerCommitted");

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await provider.getBlock(blockNumber);

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

      it("should not increment the next exchange id counter", async function () {
        // Get the next exchange id
        let nextExchangeIdBefore = await exchangeHandler.connect(rando).getNextExchangeId();

        // Commit to preminted offer, creating a new exchange
        await bosonVoucher
          .connect(assistant)
          .transferFrom(await assistant.getAddress(), await buyer.getAddress(), tokenId);

        // Get the next exchange id and ensure it was incremented by the creation of the offer
        nextExchangeId = await exchangeHandler.connect(rando).getNextExchangeId();
        expect(nextExchangeId).to.equal(nextExchangeIdBefore);
      });

      it("should not issue a new voucher on the clone", async function () {
        // Get next exchange id
        nextExchangeId = await exchangeHandler.connect(rando).getNextExchangeId();

        // Voucher with nextExchangeId should not exist
        await expect(bosonVoucher.ownerOf(nextExchangeId)).to.be.revertedWith(RevertReasons.ERC721_INVALID_TOKEN_ID);

        // Commit to preminted offer, creating a new exchange
        await bosonVoucher
          .connect(assistant)
          .transferFrom(await assistant.getAddress(), await buyer.getAddress(), tokenId);

        // Voucher with nextExchangeId still should not exist
        await expect(bosonVoucher.ownerOf(nextExchangeId)).to.be.revertedWith(RevertReasons.ERC721_INVALID_TOKEN_ID);
      });

      it("ERC2981: issued voucher should have royalty fees", async function () {
        // set non zero royalty percentage
        const royaltyPercentage = "10";
        await bosonVoucher.connect(assistant).setRoyaltyPercentage(royaltyPercentage);

        // Before voucher is transferred, it should have zero royalty fee
        let [receiver, royaltyAmount] = await bosonVoucher.connect(assistant).royaltyInfo(tokenId, offer.price);
        assert.equal(receiver, ZeroAddress, "Recipient address is incorrect");
        assert.equal(royaltyAmount.toString(), "0", "Royalty amount is incorrect");

        // Commit to preminted offer, creating a new exchange
        await bosonVoucher
          .connect(assistant)
          .transferFrom(await assistant.getAddress(), await buyer.getAddress(), tokenId);

        // After voucher is transferred, it should have royalty fee
        [receiver, royaltyAmount] = await bosonVoucher.connect(assistant).royaltyInfo(tokenId, offer.price);
        assert.equal(receiver, await treasury.getAddress(), "Recipient address is incorrect");
        assert.equal(
          royaltyAmount.toString(),
          applyPercentage(offer.price, royaltyPercentage),
          "Royalty amount is incorrect"
        );
      });

      it("Should not decrement quantityAvailable", async function () {
        // Offer quantityAvailable should be decremented
        let [, offer] = await offerHandler.connect(rando).getOffer(offerId);
        const quantityAvailableBefore = offer.quantityAvailable;

        // Commit to preminted offer
        await bosonVoucher
          .connect(assistant)
          .transferFrom(await assistant.getAddress(), await buyer.getAddress(), tokenId);

        // Offer quantityAvailable should be decremented
        [, offer] = await offerHandler.connect(rando).getOffer(offerId);
        assert.equal(
          offer.quantityAvailable.toString(),
          quantityAvailableBefore.toString(),
          "Quantity available should not change"
        );
      });

      it("should still be possible to commit if offer is not fully preminted", async function () {
        // Create a new offer
        offerId = await offerHandler.getNextOfferId();
        const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();

        // Create the offer
        offer.quantityAvailable = "10";
        const rangeLength = "5";
        await offerHandler
          .connect(assistant)
          .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

        // Deposit seller funds so the commit will succeed
        await fundsHandler
          .connect(rando)
          .depositFunds(seller.id, ZeroAddress, offer.sellerDeposit, { value: offer.sellerDeposit });

        // reserve half of the offer, so it's still possible to commit directly
        await offerHandler.connect(assistant).reserveRange(offerId, rangeLength, await assistant.getAddress());

        // Commit to offer directly
        await expect(
          exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: offer.price })
        ).to.emit(exchangeHandler, "BuyerCommitted");
      });

      context("Offer is part of a group", async function () {
        let groupId;
        let offerIds;

        beforeEach(async function () {
          // Required constructor params for Group
          groupId = "1";
          offerIds = [offerId];
        });

        it("Offer is part of a group that has no condition", async function () {
          condition = mockCondition({
            tokenAddress: ZeroAddress,
            threshold: "0",
            maxCommits: "0",
            tokenType: TokenType.FungibleToken,
            method: EvaluationMethod.None,
          });

          expect(condition.isValid()).to.be.true;

          group = new Group(groupId, seller.id, offerIds);
          expect(group.isValid()).is.true;

          await groupHandler.connect(assistant).createGroup(group, condition);

          await foreign721.connect(buyer).mint("123", 1);

          await expect(
            bosonVoucher
              .connect(assistant)
              .transferFrom(await assistant.getAddress(), await buyer.getAddress(), tokenId)
          ).to.emit(exchangeHandler, "BuyerCommitted");
        });

        it("Offer is part of a group with condition [ERC20, gating per address]", async function () {
          // Create Condition
          condition = mockCondition({ tokenAddress: await foreign20.getAddress(), threshold: "50", maxCommits: "3" });
          expect(condition.isValid()).to.be.true;

          // Create Group
          group = new Group(groupId, seller.id, offerIds);
          expect(group.isValid()).is.true;

          await groupHandler.connect(assistant).createGroup(group, condition);

          // mint enough tokens for the buyer
          await foreign20.connect(buyer).mint(await buyer.getAddress(), condition.threshold);

          await expect(
            bosonVoucher
              .connect(assistant)
              .transferFrom(await assistant.getAddress(), await buyer.getAddress(), tokenId)
          ).to.emit(exchangeHandler, "BuyerCommitted");
        });

        it("Offer is part of a group with condition [ERC721, threshold, gating per address]", async function () {
          condition = mockCondition({
            tokenAddress: await foreign721.getAddress(),
            threshold: "1",
            maxCommits: "3",
            tokenType: TokenType.NonFungibleToken,
            method: EvaluationMethod.Threshold,
          });

          expect(condition.isValid()).to.be.true;

          // Create Group
          group = new Group(groupId, seller.id, offerIds);
          expect(group.isValid()).is.true;

          await groupHandler.connect(assistant).createGroup(group, condition);

          await foreign721.connect(buyer).mint("123", 1);

          await expect(
            bosonVoucher
              .connect(assistant)
              .transferFrom(await assistant.getAddress(), await buyer.getAddress(), tokenId)
          ).to.emit(exchangeHandler, "BuyerCommitted");
        });

        it("Offer is part of a group with condition [ERC721, specificToken, gating per address] with range length == 1", async function () {
          // Required constructor params for Group
          groupId = "1";
          offerIds = [offerId];

          condition = mockCondition({
            tokenAddress: await foreign721.getAddress(),
            threshold: "0",
            maxCommits: "3",
            tokenType: TokenType.NonFungibleToken,
            method: EvaluationMethod.SpecificToken,
            gating: GatingType.PerAddress,
          });

          expect(condition.isValid()).to.be.true;

          // Create Group
          group = new Group(groupId, seller.id, offerIds);
          expect(group.isValid()).is.true;

          await groupHandler.connect(assistant).createGroup(group, condition);

          // mint enough tokens for the buyer
          await foreign721.connect(buyer).mint(condition.minTokenId, 1);

          await expect(
            bosonVoucher
              .connect(assistant)
              .transferFrom(await assistant.getAddress(), await buyer.getAddress(), tokenId)
          ).to.emit(exchangeHandler, "BuyerCommitted");
        });

        it("Offer is part of a group with condition [ERC721, specificToken, gating per tokenid] with range length == 1", async function () {
          // Required constructor params for Group
          groupId = "1";
          offerIds = [offerId];

          condition = mockCondition({
            tokenAddress: await foreign721.getAddress(),
            threshold: "0",
            maxCommits: "3",
            tokenType: TokenType.NonFungibleToken,
            method: EvaluationMethod.SpecificToken,
            gating: GatingType.PerTokenId,
          });

          expect(condition.isValid()).to.be.true;

          // Create Group
          group = new Group(groupId, seller.id, offerIds);
          expect(group.isValid()).is.true;

          await groupHandler.connect(assistant).createGroup(group, condition);

          // mint enough tokens for the buyer
          await foreign721.connect(buyer).mint(condition.minTokenId, 1);

          await expect(
            bosonVoucher
              .connect(assistant)
              .transferFrom(await assistant.getAddress(), await buyer.getAddress(), tokenId)
          ).to.emit(exchangeHandler, "BuyerCommitted");
        });

        it("Offer is part of a group with condition [ERC1155, gating per address] with range length == 1", async function () {
          condition = mockCondition({
            tokenAddress: await foreign1155.getAddress(),
            threshold: "2",
            maxCommits: "3",
            tokenType: TokenType.MultiToken,
            method: EvaluationMethod.Threshold,
            minTokenId: "123",
            maxTokenId: "123",
            gating: GatingType.PerAddress,
          });

          expect(condition.isValid()).to.be.true;

          // Create Group
          group = new Group(groupId, seller.id, offerIds);
          expect(group.isValid()).is.true;

          await groupHandler.connect(assistant).createGroup(group, condition);

          await foreign1155.connect(buyer).mint(condition.minTokenId, condition.threshold);

          await expect(
            bosonVoucher
              .connect(assistant)
              .transferFrom(await assistant.getAddress(), await buyer.getAddress(), tokenId)
          ).to.emit(exchangeHandler, "BuyerCommitted");
        });

        it("Offer is part of a group with condition [ERC1155, gating per tokenId] with range length == 1", async function () {
          condition = mockCondition({
            tokenAddress: await foreign1155.getAddress(),
            threshold: "2",
            maxCommits: "3",
            tokenType: TokenType.MultiToken,
            method: EvaluationMethod.Threshold,
            minTokenId: "123",
            maxTokenId: "123",
            gating: GatingType.PerTokenId,
          });

          expect(condition.isValid()).to.be.true;

          // Create Group
          group = new Group(groupId, seller.id, offerIds);
          expect(group.isValid()).is.true;

          await groupHandler.connect(assistant).createGroup(group, condition);

          await foreign1155.connect(buyer).mint(condition.minTokenId, condition.threshold);

          await expect(
            bosonVoucher
              .connect(assistant)
              .transferFrom(await assistant.getAddress(), await buyer.getAddress(), tokenId)
          ).to.emit(exchangeHandler, "BuyerCommitted");
        });
      });

      it("should work on an additional collection", async function () {
        // Create a new collection
        const externalId = `Brand1`;
        await accountHandler.connect(assistant).createNewCollection(externalId, voucherInitValues);

        offer.collectionIndex = 1;
        offer.id = await offerHandler.getNextOfferId();
        exchangeId = await exchangeHandler.getNextExchangeId();
        exchange.offerId = offer.id.toString();
        exchange.id = exchangeId.toString();
        const tokenId = deriveTokenId(offer.id, exchangeId);

        // Create the offer
        await offerHandler
          .connect(assistant)
          .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

        // Reserve range
        await offerHandler.connect(assistant).reserveRange(offer.id, offer.quantityAvailable, assistant.address);

        // expected address of the additional collection
        const voucherCloneAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          admin.address,
          externalId
        );
        bosonVoucher = await getContractAt("BosonVoucher", voucherCloneAddress);
        await bosonVoucher.connect(assistant).preMint(offer.id, offer.quantityAvailable);

        // Commit to preminted offer, retrieving the event
        tx = await bosonVoucher.connect(assistant).transferFrom(assistant.address, buyer.address, tokenId);
        txReceipt = await tx.wait();
        event = getEvent(txReceipt, exchangeHandler, "BuyerCommitted");

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await provider.getBlock(blockNumber);

        // Update the committed date in the expected exchange struct with the block timestamp of the tx
        voucher.committedDate = block.timestamp.toString();

        // Update the validUntilDate date in the expected exchange struct
        voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

        // Examine event
        assert.equal(event.exchangeId.toString(), exchangeId, "Exchange id is incorrect");
        assert.equal(event.offerId.toString(), offer.id, "Offer id is incorrect");
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

      context("💔 Revert Reasons", async function () {
        it("The exchanges region of protocol is paused", async function () {
          // Pause the exchanges region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Exchanges]);

          // Attempt to create an exchange, expecting revert
          await expect(
            bosonVoucher
              .connect(assistant)
              .transferFrom(await assistant.getAddress(), await buyer.getAddress(), tokenId)
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("The buyers region of protocol is paused", async function () {
          // Pause the buyers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Buyers]);

          // Attempt to create a buyer, expecting revert
          await expect(
            bosonVoucher
              .connect(assistant)
              .transferFrom(await assistant.getAddress(), await buyer.getAddress(), tokenId)
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("Caller is not the voucher contract, owned by the seller", async function () {
          // Attempt to commit to preminted offer, expecting revert
          await expect(
            exchangeHandler.connect(rando).commitToPreMintedOffer(await buyer.getAddress(), offerId, tokenId)
          ).to.revertedWith(RevertReasons.ACCESS_DENIED);
        });

        it("Exchange exists already", async function () {
          // Commit to preminted offer, creating a new exchange
          await bosonVoucher
            .connect(assistant)
            .transferFrom(await assistant.getAddress(), await buyer.getAddress(), tokenId);

          // impersonate voucher contract and give it some funds
          const impersonatedBosonVoucher = await getImpersonatedSigner(await bosonVoucher.getAddress());
          await provider.send("hardhat_setBalance", [
            await impersonatedBosonVoucher.getAddress(),
            toBeHex(parseEther("10")),
          ]);

          // Simulate a second commit with the same token id
          await expect(
            exchangeHandler
              .connect(impersonatedBosonVoucher)
              .commitToPreMintedOffer(await buyer.getAddress(), offerId, exchangeId)
          ).to.revertedWith(RevertReasons.EXCHANGE_ALREADY_EXISTS);
        });

        it("offer is voided", async function () {
          // Void the offer first
          await offerHandler.connect(assistant).voidOffer(offerId);

          // Attempt to commit to the voided offer, expecting revert
          await expect(
            bosonVoucher
              .connect(assistant)
              .transferFrom(await assistant.getAddress(), await buyer.getAddress(), tokenId)
          ).to.revertedWith(RevertReasons.OFFER_HAS_BEEN_VOIDED);
        });

        it("offer is not yet available for commits", async function () {
          // Create an offer with staring date in the future
          // get current block timestamp
          const block = await provider.getBlock("latest");
          const now = block.timestamp.toString();

          // Get next offer id
          offerId = await offerHandler.getNextOfferId();
          // set validFrom date in the past
          offerDates.validFrom = BigInt(now + oneMonth * 6n).toString(); // 6 months in the future
          offerDates.validUntil = BigInt(offerDates.validFrom + 10n).toString(); // just after the valid from so it succeeds.

          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

          // Reserve a range and premint vouchers
          exchangeId = await exchangeHandler.getNextExchangeId();
          await offerHandler.connect(assistant).reserveRange(offerId, "1", await assistant.getAddress());
          await bosonVoucher.connect(assistant).preMint(offerId, "1");

          tokenId = deriveTokenId(offerId, exchangeId);

          // Attempt to commit to the not available offer, expecting revert
          await expect(
            bosonVoucher
              .connect(assistant)
              .transferFrom(await assistant.getAddress(), await buyer.getAddress(), tokenId)
          ).to.revertedWith(RevertReasons.OFFER_NOT_AVAILABLE);
        });

        it("offer has expired", async function () {
          // Go past offer expiration date
          await setNextBlockTimestamp(Number(offerDates.validUntil) + 1);

          // Attempt to commit to the expired offer, expecting revert
          await expect(
            bosonVoucher
              .connect(assistant)
              .transferFrom(await assistant.getAddress(), await buyer.getAddress(), tokenId)
          ).to.revertedWith(RevertReasons.OFFER_HAS_EXPIRED);
        });

        it("should not be able to commit directly if whole offer preminted", async function () {
          // Create an offer with only 1 item
          offer.quantityAvailable = "1";
          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);
          // Commit to offer, so it's not availble anymore
          await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), ++offerId, { value: price });

          // Attempt to commit to the sold out offer, expecting revert
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price })
          ).to.revertedWith(RevertReasons.OFFER_SOLD_OUT);
        });

        it("buyer does not meet condition for commit", async function () {
          // Required constructor params for Group
          groupId = "1";
          offerIds = [offerId];

          condition = mockCondition({
            tokenAddress: await foreign721.getAddress(),
            threshold: "1",
            maxCommits: "3",
            tokenType: TokenType.NonFungibleToken,
            tokenId: "0",
            method: EvaluationMethod.Threshold,
          });

          expect(condition.isValid()).to.be.true;

          // Create Group
          group = new Group(groupId, seller.id, offerIds);
          expect(group.isValid()).is.true;

          await groupHandler.connect(assistant).createGroup(group, condition);

          await expect(
            bosonVoucher
              .connect(assistant)
              .transferFrom(await assistant.getAddress(), await buyer.getAddress(), tokenId)
          ).to.revertedWith(RevertReasons.CANNOT_COMMIT);
        });

        it("Offer is part of a group with condition [ERC721, specificToken, gating per address] with length > 1", async function () {
          // Required constructor params for Group
          groupId = "1";
          offerIds = [offerId];

          condition = mockCondition({
            tokenAddress: await foreign721.getAddress(),
            threshold: "0",
            maxCommits: "3",
            tokenType: TokenType.NonFungibleToken, // ERC721
            minTokenId: "0",
            method: EvaluationMethod.SpecificToken, // per-token
            maxTokenId: "12",
            gating: GatingType.PerAddress,
          });

          expect(condition.isValid()).to.be.true;

          // Create Group
          group = new Group(groupId, seller.id, offerIds);
          expect(group.isValid()).is.true;

          await groupHandler.connect(assistant).createGroup(group, condition);

          await expect(
            bosonVoucher
              .connect(assistant)
              .transferFrom(await assistant.getAddress(), await buyer.getAddress(), tokenId)
          ).to.revertedWith(RevertReasons.CANNOT_COMMIT);
        });

        it("Offer is part of a group with condition [ERC721, specificToken, gating per tokenId] with length > 1", async function () {
          // Required constructor params for Group
          groupId = "1";
          offerIds = [offerId];

          condition = mockCondition({
            tokenAddress: await foreign721.getAddress(),
            threshold: "0",
            maxCommits: "3",
            tokenType: TokenType.NonFungibleToken, // ERC721
            minTokenId: "0",
            method: EvaluationMethod.SpecificToken, // per-token
            maxTokenId: "12",
            gating: GatingType.PerTokenId,
          });

          expect(condition.isValid()).to.be.true;

          // Create Group
          group = new Group(groupId, seller.id, offerIds);
          expect(group.isValid()).is.true;

          await groupHandler.connect(assistant).createGroup(group, condition);

          await expect(
            bosonVoucher
              .connect(assistant)
              .transferFrom(await assistant.getAddress(), await buyer.getAddress(), tokenId)
          ).to.revertedWith(RevertReasons.CANNOT_COMMIT);
        });

        it("Offer is part of a group with condition [ERC1155, gating per address] with length > 1", async function () {
          // Required constructor params for Group
          groupId = "1";
          offerIds = [offerId];

          condition = mockCondition({
            tokenAddress: await foreign1155.getAddress(),
            threshold: "2",
            maxCommits: "3",
            tokenType: TokenType.MultiToken, // ERC1155
            tokenId: "1",
            method: EvaluationMethod.Threshold, // per-wallet
            length: "2",
            gating: GatingType.PerAddress,
          });

          expect(condition.isValid()).to.be.true;

          // Create Group
          group = new Group(groupId, seller.id, offerIds);
          expect(group.isValid()).is.true;

          await groupHandler.connect(assistant).createGroup(group, condition);

          await expect(
            bosonVoucher
              .connect(assistant)
              .transferFrom(await assistant.getAddress(), await buyer.getAddress(), tokenId)
          ).to.revertedWith(RevertReasons.CANNOT_COMMIT);
        });

        it("Offer is part of a group with condition [ERC1155, gating per tokenId] with length > 1", async function () {
          // Required constructor params for Group
          groupId = "1";
          offerIds = [offerId];

          condition = mockCondition({
            tokenAddress: await foreign1155.getAddress(),
            threshold: "2",
            maxCommits: "3",
            tokenType: TokenType.MultiToken, // ERC1155
            tokenId: "1",
            method: EvaluationMethod.Threshold, // per-wallet
            length: "2",
            gating: GatingType.PerTokenId,
          });

          expect(condition.isValid()).to.be.true;

          // Create Group
          group = new Group(groupId, seller.id, offerIds);
          expect(group.isValid()).is.true;

          await groupHandler.connect(assistant).createGroup(group, condition);

          await expect(
            bosonVoucher
              .connect(assistant)
              .transferFrom(await assistant.getAddress(), await buyer.getAddress(), tokenId)
          ).to.revertedWith(RevertReasons.CANNOT_COMMIT);
        });
      });
    });

    context("👉 commitToConditionalOffer()", async function () {
      context("✋ Threshold ERC20", async function () {
        beforeEach(async function () {
          // Required constructor params for Group
          groupId = "1";
          offerIds = [offerId];

          // Create Condition
          condition = mockCondition({ tokenAddress: await foreign20.getAddress(), threshold: "50", maxCommits: "3" });
          expect(condition.isValid()).to.be.true;

          // Create Group
          group = new Group(groupId, seller.id, offerIds);
          expect(group.isValid()).is.true;
          await groupHandler.connect(assistant).createGroup(group, condition);
        });

        it("should emit a BuyerCommitted event if user meets condition", async function () {
          // mint enough tokens for the buyer
          await foreign20.connect(buyer).mint(await buyer.getAddress(), condition.threshold);

          // Commit to offer.
          // We're only concerned that the event is emitted, indicating the condition was met
          await expect(
            exchangeHandler
              .connect(buyer)
              .commitToConditionalOffer(await buyer.getAddress(), offerId, 0, { value: price })
          ).to.emit(exchangeHandler, "BuyerCommitted");
        });

        it("should allow buyer to commit up to the max times for the group", async function () {
          // mint enough tokens for the buyer
          await foreign20.connect(buyer).mint(await buyer.getAddress(), condition.threshold);

          // Commit to offer the maximum number of times
          for (let i = 0; i < Number(condition.maxCommits); i++) {
            // We're only concerned that the event is emitted, indicating the commit was allowed
            await expect(
              exchangeHandler
                .connect(buyer)
                .commitToConditionalOffer(await buyer.getAddress(), offerId, 0, { value: price })
            ).to.emit(exchangeHandler, "BuyerCommitted");
          }
        });

        context("💔 Revert Reasons", async function () {
          it("buyer does not meet condition for commit", async function () {
            // Attempt to commit, expecting revert
            await expect(
              exchangeHandler
                .connect(buyer)
                .commitToConditionalOffer(await buyer.getAddress(), offerId, 0, { value: price })
            ).to.revertedWith(RevertReasons.CANNOT_COMMIT);
          });

          it("buyer has exhausted allowable commits", async function () {
            // mint a token for the buyer
            await foreign20.connect(buyer).mint(await buyer.getAddress(), condition.threshold);

            // Commit to offer the maximum number of times
            for (let i = 0; i < Number(condition.maxCommits); i++) {
              await exchangeHandler
                .connect(buyer)
                .commitToConditionalOffer(await buyer.getAddress(), offerId, 0, { value: price });
            }

            // Attempt to commit again after maximum commits has been reached
            await expect(
              exchangeHandler
                .connect(buyer)
                .commitToConditionalOffer(await buyer.getAddress(), offerId, 0, { value: price })
            ).to.revertedWith(RevertReasons.MAX_COMMITS_REACHED);
          });

          it("Group doesn't exist", async function () {
            // Create a new offer
            await offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

            await expect(
              exchangeHandler
                .connect(buyer)
                .commitToConditionalOffer(await buyer.getAddress(), ++offerId, 0, { value: price })
            ).to.revertedWith(RevertReasons.NO_SUCH_GROUP);
          });

          it("Caller sends non-zero tokenId", async function () {});
          await expect(
            exchangeHandler
              .connect(buyer)
              .commitToConditionalOffer(await buyer.getAddress(), offerId, 1, { value: price })
          ).to.revertedWith(RevertReasons.INVALID_TOKEN_ID);
        });
      });

      context("✋ Threshold ERC721", async function () {
        beforeEach(async function () {
          // Required constructor params for Group
          groupId = "1";
          offerIds = [offerId];

          // Create Condition
          condition = mockCondition({
            method: EvaluationMethod.Threshold,
            tokenAddress: await foreign721.getAddress(),
            threshold: "5",
            maxCommits: "3",
            tokenType: TokenType.NonFungibleToken,
          });
          expect(condition.isValid()).to.be.true;

          // Create Group
          group = new Group(groupId, seller.id, offerIds);
          expect(group.isValid()).is.true;
          await groupHandler.connect(assistant).createGroup(group, condition);
        });

        it("should emit a BuyerCommitted event if user meets condition", async function () {
          // mint enough tokens for the buyer
          await foreign721.connect(buyer).mint(condition.minTokenId, condition.threshold);

          // Commit to offer.
          // We're only concerned that the event is emitted, indicating the condition was met
          await expect(
            exchangeHandler
              .connect(buyer)
              .commitToConditionalOffer(await buyer.getAddress(), offerId, 0, { value: price })
          ).to.emit(exchangeHandler, "BuyerCommitted");
        });

        it("should allow buyer to commit up to the max times for the group", async function () {
          // mint enough tokens for the buyer
          await foreign721.connect(buyer).mint(condition.minTokenId, condition.threshold);

          // Commit to offer the maximum number of times
          for (let i = 0; i < Number(condition.maxCommits); i++) {
            // We're only concerned that the event is emitted, indicating the commit was allowed
            await expect(
              exchangeHandler
                .connect(buyer)
                .commitToConditionalOffer(await buyer.getAddress(), offerId, 0, { value: price })
            ).to.emit(exchangeHandler, "BuyerCommitted");
          }
        });

        context("💔 Revert Reasons", async function () {
          it("buyer does not meet condition for commit", async function () {
            // Attempt to commit, expecting revert
            await expect(
              exchangeHandler
                .connect(buyer)
                .commitToConditionalOffer(await buyer.getAddress(), offerId, 0, { value: price })
            ).to.revertedWith(RevertReasons.CANNOT_COMMIT);
          });

          it("buyer has exhausted allowable commits", async function () {
            // mint enough tokens for the buyer
            await foreign721.connect(buyer).mint(condition.minTokenId, condition.threshold);

            // Commit to offer the maximum number of times
            for (let i = 0; i < Number(condition.maxCommits); i++) {
              await exchangeHandler
                .connect(buyer)
                .commitToConditionalOffer(await buyer.getAddress(), offerId, 0, { value: price });
            }

            // Attempt to commit again after maximum commits has been reached
            await expect(
              exchangeHandler
                .connect(buyer)
                .commitToConditionalOffer(await buyer.getAddress(), offerId, 0, { value: price })
            ).to.revertedWith(RevertReasons.MAX_COMMITS_REACHED);
          });

          it("Caller sends non-zero tokenId", async function () {
            await expect(
              exchangeHandler
                .connect(buyer)
                .commitToConditionalOffer(await buyer.getAddress(), offerId, 1, { value: price })
            ).to.revertedWith(RevertReasons.INVALID_TOKEN_ID);
          });
        });
      });

      context("✋ SpecificToken ERC721 per address", async function () {
        let tokenId;
        beforeEach(async function () {
          // Required constructor params for Group
          groupId = "1";
          offerIds = [offerId];
          tokenId = "12";

          // Create Condition
          condition = mockCondition({
            tokenAddress: await foreign721.getAddress(),
            threshold: "0",
            maxCommits: "3",
            tokenType: TokenType.NonFungibleToken,
            minTokenId: tokenId,
            method: EvaluationMethod.SpecificToken,
            maxTokenId: "22",
            gating: GatingType.PerAddress,
          });
          expect(condition.isValid()).to.be.true;

          // Create Group
          group = new Group(groupId, seller.id, offerIds);
          expect(group.isValid()).is.true;
          await groupHandler.connect(assistant).createGroup(group, condition);

          // mint correct token for the buyer
          await foreign721.connect(buyer).mint(tokenId, "1");
        });

        it("should emit a BuyerCommitted event if user meets condition", async function () {
          // Commit to offer.
          // We're only concerned that the event is emitted, indicating the condition was met
          await expect(
            exchangeHandler
              .connect(buyer)
              .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price })
          ).to.emit(exchangeHandler, "BuyerCommitted");
        });

        it("should allow buyer to commit up to the max times for the group", async function () {
          // Commit to offer the maximum number of times
          for (let i = 0; i < Number(condition.maxCommits); i++) {
            // We're only concerned that the event is emitted, indicating the commit was allowed
            await expect(
              exchangeHandler
                .connect(buyer)
                .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price })
            ).to.emit(exchangeHandler, "BuyerCommitted");
          }
        });

        it("Allow any token from collection", async function () {
          condition.minTokenId = "0";
          condition.maxTokenId = MaxUint256.toString();

          await groupHandler.connect(assistant).setGroupCondition(group.id, condition);

          // mint any token for buyer
          tokenId = "123";
          await foreign721.connect(buyer).mint(tokenId, "1");

          // buyer can commit
          await expect(
            exchangeHandler
              .connect(buyer)
              .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price })
          ).to.emit(exchangeHandler, "BuyerCommitted");
        });

        context("💔 Revert Reasons", async function () {
          it("token id does not exist", async function () {
            tokenId = "13";
            // Attempt to commit, expecting revert
            await expect(
              exchangeHandler
                .connect(buyer)
                .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price })
            ).to.revertedWith(RevertReasons.ERC721_INVALID_TOKEN_ID);
          });

          it("buyer does not meet condition for commit", async function () {
            // Send token to another user
            await foreign721.connect(buyer).transferFrom(await buyer.getAddress(), rando.address, tokenId);

            // Attempt to commit, expecting revert
            await expect(
              exchangeHandler
                .connect(buyer)
                .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price })
            ).to.revertedWith(RevertReasons.CANNOT_COMMIT);
          });

          it("max commits per token id reached", async function () {
            // Commit to offer the maximum number of times
            for (let i = 0; i < Number(condition.maxCommits); i++) {
              await exchangeHandler
                .connect(buyer)
                .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price });
            }

            // Attempt to commit again after maximum commits has been reached
            await expect(
              exchangeHandler
                .connect(buyer)
                .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price })
            ).to.revertedWith(RevertReasons.MAX_COMMITS_REACHED);
          });

          it("token id not in condition range", async function () {
            tokenId = "666";
            // Attempt to commit, expecting revert
            await expect(
              exchangeHandler
                .connect(buyer)
                .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price })
            ).to.revertedWith(RevertReasons.TOKEN_ID_NOT_IN_CONDITION_RANGE);
          });
        });
      });

      context("✋ SpecificToken ERC721 per token id", async function () {
        let tokenId;
        beforeEach(async function () {
          // Required constructor params for Group
          groupId = "1";
          offerIds = [offerId];
          tokenId = "12";

          // Create Condition
          condition = mockCondition({
            tokenAddress: await foreign721.getAddress(),
            threshold: "0",
            maxCommits: "3",
            tokenType: TokenType.NonFungibleToken,
            minTokenId: tokenId,
            method: EvaluationMethod.SpecificToken,
            maxTokenId: "22",
            gating: GatingType.PerTokenId,
          });
          expect(condition.isValid()).to.be.true;

          // Create Group
          group = new Group(groupId, seller.id, offerIds);
          expect(group.isValid()).is.true;
          await groupHandler.connect(assistant).createGroup(group, condition);

          // mint correct token for the buyer
          await foreign721.connect(buyer).mint(tokenId, "1");
        });

        it("should emit a BuyerCommitted event if user meets condition", async function () {
          // Commit to offer.
          // We're only concerned that the event is emitted, indicating the condition was met
          await expect(
            exchangeHandler
              .connect(buyer)
              .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price })
          ).to.emit(exchangeHandler, "BuyerCommitted");
        });

        it("should allow buyer to commit up to the max times for the group", async function () {
          // Commit to offer the maximum number of times
          for (let i = 0; i < Number(condition.maxCommits); i++) {
            // We're only concerned that the event is emitted, indicating the commit was allowed
            await expect(
              exchangeHandler
                .connect(buyer)
                .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price })
            ).to.emit(exchangeHandler, "BuyerCommitted");
          }
        });

        it("Allow any token from collection", async function () {
          condition.minTokenId = "0";
          condition.maxTokenId = MaxUint256.toString();

          await groupHandler.connect(assistant).setGroupCondition(group.id, condition);

          // mint any token for buyer
          tokenId = "123";
          await foreign721.connect(buyer).mint(tokenId, "1");

          // buyer can commit
          await expect(
            exchangeHandler
              .connect(buyer)
              .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price })
          ).to.emit(exchangeHandler, "BuyerCommitted");
        });

        context("💔 Revert Reasons", async function () {
          it("token id does not exist", async function () {
            tokenId = "13";
            // Attempt to commit, expecting revert
            await expect(
              exchangeHandler
                .connect(buyer)
                .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price })
            ).to.revertedWith(RevertReasons.ERC721_INVALID_TOKEN_ID);
          });

          it("buyer does not meet condition for commit", async function () {
            // Send token to another user
            await foreign721.connect(buyer).transferFrom(await buyer.getAddress(), rando.address, tokenId);

            // Attempt to commit, expecting revert
            await expect(
              exchangeHandler
                .connect(buyer)
                .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price })
            ).to.revertedWith(RevertReasons.CANNOT_COMMIT);
          });

          it("max commits per token id reached", async function () {
            // Commit to offer the maximum number of times
            for (let i = 0; i < Number(condition.maxCommits); i++) {
              await exchangeHandler
                .connect(buyer)
                .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price });
            }

            // Attempt to commit again after maximum commits has been reached
            await expect(
              exchangeHandler
                .connect(buyer)
                .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price })
            ).to.revertedWith(RevertReasons.MAX_COMMITS_REACHED);
          });

          it("token id not in condition range", async function () {
            tokenId = "666";
            // Attempt to commit, expecting revert
            await expect(
              exchangeHandler
                .connect(buyer)
                .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price })
            ).to.revertedWith(RevertReasons.TOKEN_ID_NOT_IN_CONDITION_RANGE);
          });
        });
      });

      context("✋ Threshold ERC1155 per address", async function () {
        let tokenId;
        beforeEach(async function () {
          // Required constructor params for Group
          groupId = "1";
          offerIds = [offerId];

          // Create Condition
          condition = mockCondition({
            tokenAddress: await foreign1155.getAddress(),
            threshold: "20",
            maxCommits: "3",
            tokenType: TokenType.MultiToken,
            method: EvaluationMethod.Threshold,
            minTokenId: "123",
            maxTokenId: "128",
            gating: GatingType.PerAddress,
          });

          expect(condition.isValid()).to.be.true;

          // Create Group
          group = new Group(groupId, seller.id, offerIds);
          expect(group.isValid()).is.true;
          await groupHandler.connect(assistant).createGroup(group, condition);

          // Set random token id
          tokenId = "123";
        });

        it("should emit a BuyerCommitted event if user meets condition", async function () {
          // mint enough tokens for the buyer
          await foreign1155.connect(buyer).mint(tokenId, condition.threshold);

          // Commit to offer.
          // We're only concerned that the event is emitted, indicating the condition was met
          await expect(
            exchangeHandler
              .connect(buyer)
              .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price })
          ).to.emit(exchangeHandler, "BuyerCommitted");
        });

        it("should allow buyer to commit up to the max times for the group", async function () {
          // mint enough tokens for the buyer
          await foreign1155.connect(buyer).mint(tokenId, condition.threshold);

          // Commit to offer the maximum number of times
          for (let i = 0; i < Number(condition.maxCommits); i++) {
            // We're only concerned that the event is emitted, indicating the commit was allowed
            await expect(
              exchangeHandler
                .connect(buyer)
                .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price })
            ).to.emit(exchangeHandler, "BuyerCommitted");
          }
        });

        context("💔 Revert Reasons", async function () {
          it("buyer does not meet condition for commit", async function () {
            // Attempt to commit, expecting revert
            await expect(
              exchangeHandler
                .connect(buyer)
                .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price })
            ).to.revertedWith(RevertReasons.CANNOT_COMMIT);
          });

          it("buyer has exhausted allowable commits", async function () {
            // mint enough tokens for the buyer
            await foreign1155.connect(buyer).mint(tokenId, condition.threshold);

            // Commit to offer the maximum number of times
            for (let i = 0; i < Number(condition.maxCommits); i++) {
              await exchangeHandler
                .connect(buyer)
                .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price });
            }

            // Attempt to commit again after maximum commits has been reached
            await expect(
              exchangeHandler
                .connect(buyer)
                .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price })
            ).to.revertedWith(RevertReasons.MAX_COMMITS_REACHED);
          });
        });
      });

      context("✋ Threshold ERC1155 per token id", async function () {
        let tokenId;
        beforeEach(async function () {
          // Required constructor params for Group
          groupId = "1";
          offerIds = [offerId];
          tokenId = "12";

          // Create Condition
          condition = mockCondition({
            tokenAddress: await foreign1155.getAddress(),
            threshold: "1",
            maxCommits: "3",
            tokenType: TokenType.MultiToken,
            minTokenId: tokenId,
            method: EvaluationMethod.Threshold,
            maxTokenId: "22",
          });

          expect(condition.isValid()).to.be.true;

          // Create Group
          group = new Group(groupId, seller.id, offerIds);
          expect(group.isValid()).is.true;
          await groupHandler.connect(assistant).createGroup(group, condition);

          // mint correct token for the buyer
          await foreign1155.connect(buyer).mint(tokenId, "1");
        });

        it("should emit a BuyerCommitted event if user meets condition", async function () {
          // Commit to offer.
          // We're only concerned that the event is emitted, indicating the condition was met
          await expect(
            exchangeHandler
              .connect(buyer)
              .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price })
          ).to.emit(exchangeHandler, "BuyerCommitted");
        });

        it("should allow buyer to commit up to the max times for the group", async function () {
          // Commit to offer the maximum number of times
          for (let i = 0; i < Number(condition.maxCommits); i++) {
            // We're only concerned that the event is emitted, indicating the commit was allowed
            await expect(
              exchangeHandler
                .connect(buyer)
                .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price })
            ).to.emit(exchangeHandler, "BuyerCommitted");
          }
        });

        it("Allow any token from collection", async function () {
          condition.minTokenId = "0";
          condition.maxTokenId = MaxUint256.toString();

          await groupHandler.connect(assistant).setGroupCondition(group.id, condition);

          // mint any token for buyer
          tokenId = "123";
          await foreign1155.connect(buyer).mint(tokenId, "1");

          // buyer can commit
          await expect(
            exchangeHandler
              .connect(buyer)
              .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price })
          ).to.emit(exchangeHandler, "BuyerCommitted");
        });

        context("💔 Revert Reasons", async function () {
          it("token id does not exist", async function () {
            tokenId = "13";

            // Attempt to commit, expecting revert
            await expect(
              exchangeHandler
                .connect(buyer)
                .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price })
            ).to.revertedWith(RevertReasons.CANNOT_COMMIT);
          });

          it("buyer does not meet condition for commit", async function () {
            // Attempt to commit, expecting revert
            await expect(
              exchangeHandler.connect(rando).commitToConditionalOffer(rando.address, offerId, tokenId, { value: price })
            ).to.revertedWith(RevertReasons.CANNOT_COMMIT);
          });

          it("max commits per token id reached", async function () {
            // Commit to offer the maximum number of times
            for (let i = 0; i < Number(condition.maxCommits); i++) {
              await exchangeHandler
                .connect(buyer)
                .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price });
            }

            // Attempt to commit again after maximum commits has been reached
            await expect(
              exchangeHandler
                .connect(buyer)
                .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price })
            ).to.revertedWith(RevertReasons.MAX_COMMITS_REACHED);
          });

          it("token id not in condition range", async function () {
            tokenId = "666";
            // Attempt to commit, expecting revert
            await expect(
              exchangeHandler
                .connect(buyer)
                .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price })
            ).to.revertedWith(RevertReasons.TOKEN_ID_NOT_IN_CONDITION_RANGE);
          });
        });
      });

      context("💔 Revert Reasons", async function () {
        let tokenId;

        beforeEach(async function () {
          // Required constructor params for Group
          groupId = "1";
          offerIds = [offerId];
          tokenId = "12";

          // Create Condition
          condition = mockCondition({
            tokenAddress: await foreign721.getAddress(),
            threshold: "0",
            maxCommits: "3",
            tokenType: TokenType.NonFungibleToken,
            minTokenId: tokenId,
            method: EvaluationMethod.SpecificToken,
            maxTokenId: "22",
          });
          expect(condition.isValid()).to.be.true;

          // Create Group
          group = new Group(groupId, seller.id, offerIds);
          expect(group.isValid()).is.true;
          await groupHandler.connect(assistant).createGroup(group, condition);

          // mint correct token for the buyer
          await foreign721.connect(buyer).mint(tokenId, "1");
        });

        it("The exchanges region of protocol is paused", async function () {
          // Pause the exchanges region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Exchanges]);

          // Attempt to create an exchange, expecting revert
          await expect(
            exchangeHandler
              .connect(buyer)
              .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price })
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("The buyers region of protocol is paused", async function () {
          // Pause the buyers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Buyers]);

          // Attempt to create a buyer, expecting revert
          await expect(
            exchangeHandler
              .connect(buyer)
              .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price })
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("await buyer.getAddress() is the zero address", async function () {
          // Attempt to commit, expecting revert
          await expect(
            exchangeHandler.connect(buyer).commitToConditionalOffer(ZeroAddress, offerId, tokenId, { value: price })
          ).to.revertedWith(RevertReasons.INVALID_ADDRESS);
        });

        it("offer id is invalid", async function () {
          // An invalid offer id
          offerId = "666";

          // Attempt to commit, expecting revert
          await expect(
            exchangeHandler
              .connect(buyer)
              .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price })
          ).to.revertedWith(RevertReasons.NO_SUCH_OFFER);
        });

        it("offer is voided", async function () {
          // Void the offer first
          await offerHandler.connect(assistant).voidOffer(offerId);

          // Attempt to commit to the voided offer, expecting revert
          await expect(
            exchangeHandler
              .connect(buyer)
              .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price })
          ).to.revertedWith(RevertReasons.OFFER_HAS_BEEN_VOIDED);
        });

        it("offer is not yet available for commits", async function () {
          // Create an offer with staring date in the future
          // get current block timestamp
          const block = await ethers.provider.getBlock("latest");
          const now = block.timestamp.toString();

          // set validFrom date in the past
          offerDates.validFrom = (BigInt(now) + BigInt(oneMonth) * 6n).toString(); // 6 months in the future
          offerDates.validUntil = (BigInt(offerDates.validFrom) + 10n).toString(); // just after the valid from so it succeeds.

          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

          // add offer to group
          await groupHandler.connect(assistant).addOffersToGroup(groupId, [++offerId]);

          // Attempt to commit to the not availabe offer, expecting revert
          await expect(
            exchangeHandler
              .connect(buyer)
              .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price })
          ).to.revertedWith(RevertReasons.OFFER_NOT_AVAILABLE);
        });

        it("offer has expired", async function () {
          // Go past offer expiration date
          await setNextBlockTimestamp(Number(offerDates.validUntil) + 1);

          // Attempt to commit to the expired offer, expecting revert
          await expect(
            exchangeHandler
              .connect(buyer)
              .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price })
          ).to.revertedWith(RevertReasons.OFFER_HAS_EXPIRED);
        });

        it("offer sold", async function () {
          // Create an offer with only 1 item
          offer.quantityAvailable = "1";
          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

          // add offer to group
          await groupHandler.connect(assistant).addOffersToGroup(groupId, [++offerId]);

          // Commit to offer, so it's not availble anymore
          await exchangeHandler
            .connect(buyer)
            .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price });

          // Attempt to commit to the sold out offer, expecting revert
          await expect(
            exchangeHandler
              .connect(buyer)
              .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price })
          ).to.revertedWith(RevertReasons.OFFER_SOLD_OUT);
        });

        it("Group without condition", async function () {
          let tokenId = "0";

          // Create a new offer
          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

          // Required constructor params for Group
          groupId = "1";
          offerIds = [(++offerId).toString()];

          // Create Condition
          condition = mockCondition({ method: EvaluationMethod.None, threshold: "0", maxCommits: "0" });
          expect(condition.isValid()).to.be.true;

          // Create Group
          group = new Group(groupId, seller.id, offerIds);
          expect(group.isValid()).is.true;
          await groupHandler.connect(assistant).createGroup(group, condition);

          // Commit to offer.
          await expect(
            exchangeHandler
              .connect(buyer)
              .commitToConditionalOffer(await buyer.getAddress(), offerId, tokenId, { value: price })
          ).to.revertedWith(RevertReasons.GROUP_HAS_NO_CONDITION);
        });
      });
    });

    context("👉 completeExchange()", async function () {
      beforeEach(async function () {
        // Commit to offer
        await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });
      });

      it("should emit an ExchangeCompleted event when buyer calls", async function () {
        // Set time forward to the offer's voucherRedeemableFrom
        await setNextBlockTimestamp(Number(voucherRedeemableFrom));

        // Redeem the voucher
        await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

        // Complete the exchange, expecting event
        await expect(exchangeHandler.connect(buyer).completeExchange(exchange.id))
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchange.id, await buyer.getAddress());
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

      it("should emit an ExchangeCompleted event if assistant calls after dispute period", async function () {
        // Set time forward to the offer's voucherRedeemableFrom
        await setNextBlockTimestamp(Number(voucherRedeemableFrom));

        // Redeem the voucher
        await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

        // Get the current block info
        blockNumber = await provider.getBlockNumber();
        block = await provider.getBlock(blockNumber);

        // Set time forward to run out the dispute period
        newTime = Number(BigInt(block.timestamp) + BigInt(disputePeriod) + 1n);
        await setNextBlockTimestamp(newTime);

        // Complete exchange
        await expect(exchangeHandler.connect(assistant).completeExchange(exchange.id))
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchange.id, await assistant.getAddress());
      });

      it("should emit an ExchangeCompleted event if anyone calls after dispute period", async function () {
        // Set time forward to the offer's voucherRedeemableFrom
        await setNextBlockTimestamp(Number(voucherRedeemableFrom));

        // Redeem the voucher
        await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

        // Get the current block info
        blockNumber = await provider.getBlockNumber();
        block = await provider.getBlock(blockNumber);

        // Set time forward to run out the dispute period
        newTime = Number(BigInt(block.timestamp) + BigInt(disputePeriod) + 1n);
        await setNextBlockTimestamp(newTime);

        // Complete exchange
        await expect(exchangeHandler.connect(rando).completeExchange(exchange.id))
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchange.id, await rando.getAddress());
      });

      it("should emit an ExchangeCompleted event if another buyer calls after dispute period", async function () {
        // Set time forward to the offer's voucherRedeemableFrom
        await setNextBlockTimestamp(Number(voucherRedeemableFrom));

        // Redeem the voucher
        await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

        // Get the current block info
        blockNumber = await provider.getBlockNumber();
        block = await provider.getBlock(blockNumber);

        // Set time forward to run out the dispute period
        newTime = Number(BigInt(block.timestamp) + BigInt(disputePeriod) + 1n);
        await setNextBlockTimestamp(newTime);

        // Create a rando buyer account
        await accountHandler.connect(rando).createBuyer(mockBuyer(await rando.getAddress()));

        // Complete exchange
        await expect(exchangeHandler.connect(rando).completeExchange(exchange.id))
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchange.id, await rando.getAddress());
      });

      context("💔 Revert Reasons", async function () {
        it("The exchanges region of protocol is paused", async function () {
          // Pause the exchanges region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Exchanges]);

          // Attempt to complete an exchange, expecting revert
          await expect(exchangeHandler.connect(assistant).completeExchange(exchangeId)).to.revertedWith(
            RevertReasons.REGION_PAUSED
          );
        });

        it("exchange id is invalid", async function () {
          // An invalid exchange id
          exchangeId = "666";

          // Attempt to complete the exchange, expecting revert
          await expect(exchangeHandler.connect(assistant).completeExchange(exchangeId)).to.revertedWith(
            RevertReasons.NO_SUCH_EXCHANGE
          );
        });

        it("cannot complete an exchange when it is in the committed state", async function () {
          // Get the exchange state
          [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

          // It should match ExchangeState.Committed
          assert.equal(response, ExchangeState.Committed, "Exchange state is incorrect");

          // Attempt to complete the exchange, expecting revert
          await expect(exchangeHandler.connect(assistant).completeExchange(exchange.id)).to.revertedWith(
            RevertReasons.INVALID_STATE
          );
        });

        it("exchange is not in redeemed state", async function () {
          // Cancel the voucher
          await exchangeHandler.connect(buyer).cancelVoucher(exchange.id);

          // Attempt to complete the exchange, expecting revert
          await expect(exchangeHandler.connect(assistant).completeExchange(exchange.id)).to.revertedWith(
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

        it("caller is a buyer, but not the buyer of the exchange and offer dispute period has not elapsed", async function () {
          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // Redeem the voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Create a rando buyer account
          await accountHandler.connect(rando).createBuyer(mockBuyer(await rando.getAddress()));

          // Attempt to complete the exchange, expecting revert
          await expect(exchangeHandler.connect(rando).completeExchange(exchange.id)).to.revertedWith(
            RevertReasons.DISPUTE_PERIOD_NOT_ELAPSED
          );
        });

        it("caller is seller's assistant and offer dispute period has not elapsed", async function () {
          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // Redeem the voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Attempt to complete the exchange, expecting revert
          await expect(exchangeHandler.connect(assistant).completeExchange(exchange.id)).to.revertedWith(
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
          await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

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
          .withArgs(offerId, buyerId, exchangesToComplete[0], await buyer.getAddress());

        await expect(tx)
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchangesToComplete[1], await buyer.getAddress());

        await expect(tx)
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchangesToComplete[2], await buyer.getAddress());

        await expect(tx)
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchangesToComplete[3], await buyer.getAddress());

        await expect(tx)
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchangesToComplete[4], await buyer.getAddress());
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

      it("should emit an ExchangeCompleted event if assistant calls after dispute period", async function () {
        // Get the current block info
        blockNumber = await provider.getBlockNumber();
        block = await provider.getBlock(blockNumber);

        // Set time forward to run out the dispute period
        newTime = Number(BigInt(block.timestamp) + BigInt(disputePeriod) + 1n);
        await setNextBlockTimestamp(newTime);

        // Complete exchange
        const tx = await exchangeHandler.connect(assistant).completeExchangeBatch(exchangesToComplete);
        await expect(tx)
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchangesToComplete[0], await assistant.getAddress());

        await expect(tx)
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchangesToComplete[1], await assistant.getAddress());

        await expect(tx)
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchangesToComplete[2], await assistant.getAddress());

        await expect(tx)
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchangesToComplete[3], await assistant.getAddress());

        await expect(tx)
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchangesToComplete[4], await assistant.getAddress());
      });

      it("should emit an ExchangeCompleted event if anyone calls after dispute period", async function () {
        // Get the current block info
        blockNumber = await provider.getBlockNumber();
        block = await provider.getBlock(blockNumber);

        // Set time forward to run out the dispute period
        newTime = Number(BigInt(block.timestamp) + BigInt(disputePeriod) + 1n);
        await setNextBlockTimestamp(newTime);

        // Complete exchange
        const tx = await exchangeHandler.connect(rando).completeExchangeBatch(exchangesToComplete);
        await expect(tx)
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchangesToComplete[0], await rando.getAddress());

        await expect(tx)
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchangesToComplete[1], await rando.getAddress());

        await expect(tx)
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchangesToComplete[2], await rando.getAddress());

        await expect(tx)
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchangesToComplete[3], await rando.getAddress());

        await expect(tx)
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchangesToComplete[4], await rando.getAddress());
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

        it("exchange id is invalid", async function () {
          // An invalid exchange id
          exchangeId = "666";

          // Add new exchange id to the array
          exchangesToComplete = [exchangeId, ...exchangesToComplete];

          // Attempt to complete the exchange, expecting revert
          await expect(exchangeHandler.connect(assistant).completeExchangeBatch(exchangesToComplete)).to.revertedWith(
            RevertReasons.NO_SUCH_EXCHANGE
          );
        });

        it("exchange is not in redeemed state", async function () {
          // Create exchange with id 6
          await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

          exchangeId = "6";
          // Cancel the voucher for any 1 exchange
          await exchangeHandler.connect(buyer).cancelVoucher(exchangeId);

          // Add new exchange id to the array
          exchangesToComplete = [exchangeId, ...exchangesToComplete];

          // Attempt to complete the exchange, expecting revert
          await expect(exchangeHandler.connect(assistant).completeExchangeBatch(exchangesToComplete)).to.revertedWith(
            RevertReasons.INVALID_STATE
          );
        });

        it("caller is not buyer and offer dispute period has not elapsed", async function () {
          // Create exchange with id 6
          await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

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

        it("caller is seller's assistant and offer dispute period has not elapsed", async function () {
          // Create exchange with id 6
          await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

          exchangeId = "6";

          // Redeem the voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

          // Attempt to complete the exchange, expecting revert
          await expect(exchangeHandler.connect(assistant).completeExchangeBatch(exchangesToComplete)).to.revertedWith(
            RevertReasons.DISPUTE_PERIOD_NOT_ELAPSED
          );
        });
      });
    });

    context("👉 revokeVoucher()", async function () {
      beforeEach(async function () {
        // Commit to offer
        await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });
      });

      it("should emit an VoucherRevoked event when seller's assistant calls", async function () {
        // Revoke the voucher, expecting event
        await expect(exchangeHandler.connect(assistant).revokeVoucher(exchange.id))
          .to.emit(exchangeHandler, "VoucherRevoked")
          .withArgs(offerId, exchange.id, await assistant.getAddress());
      });

      it("should update state", async function () {
        // Revoke the voucher
        await exchangeHandler.connect(assistant).revokeVoucher(exchange.id);

        // Get the exchange state
        [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

        // It should match ExchangeState.Revoked
        assert.equal(response, ExchangeState.Revoked, "Exchange state is incorrect");
      });

      it("should work on an additional collection", async function () {
        // Create a new collection
        const externalId = `Brand1`;
        await accountHandler.connect(assistant).createNewCollection(externalId, voucherInitValues);

        offer.collectionIndex = 1;
        offer.id = await offerHandler.getNextOfferId();
        exchange.id = await exchangeHandler.getNextExchangeId();
        const tokenId = deriveTokenId(offer.id, exchange.id);

        // Create the offer
        await offerHandler
          .connect(assistant)
          .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

        // Commit to offer, creating a new exchange
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offer.id, { value: price });

        // expected address of the first additional collection
        const additionalCollectionAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          admin.address,
          externalId
        );
        const additionalCollection = await getContractAt("BosonVoucher", additionalCollectionAddress);

        // Revoke the voucher, expecting event
        await expect(exchangeHandler.connect(assistant).revokeVoucher(exchange.id))
          .to.emit(additionalCollection, "Transfer")
          .withArgs(buyer.address, ZeroAddress, tokenId);
      });

      context("💔 Revert Reasons", async function () {
        it("The exchanges region of protocol is paused", async function () {
          // Pause the exchanges region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Exchanges]);

          // Attempt to complete an exchange, expecting revert
          await expect(exchangeHandler.connect(assistant).revokeVoucher(exchange.id)).to.revertedWith(
            RevertReasons.REGION_PAUSED
          );
        });

        it("exchange id is invalid", async function () {
          // An invalid exchange id
          exchangeId = "666";

          // Attempt to revoke the voucher, expecting revert
          await expect(exchangeHandler.connect(assistant).revokeVoucher(exchangeId)).to.revertedWith(
            RevertReasons.NO_SUCH_EXCHANGE
          );
        });

        it("exchange is not in committed state", async function () {
          // Cancel the voucher
          await exchangeHandler.connect(buyer).cancelVoucher(exchange.id);

          // Attempt to revoke the voucher, expecting revert
          await expect(exchangeHandler.connect(assistant).revokeVoucher(exchange.id)).to.revertedWith(
            RevertReasons.INVALID_STATE
          );
        });

        it("caller is not seller's assistant", async function () {
          // Attempt to complete the exchange, expecting revert
          await expect(exchangeHandler.connect(rando).revokeVoucher(exchange.id)).to.revertedWith(
            RevertReasons.NOT_ASSISTANT
          );
        });
      });
    });

    context("👉 cancelVoucher()", async function () {
      beforeEach(async function () {
        // Commit to offer, retrieving the event
        await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });
      });

      it("should emit an VoucherCanceled event when original buyer calls", async function () {
        // Cancel the voucher, expecting event
        await expect(exchangeHandler.connect(buyer).cancelVoucher(exchange.id))
          .to.emit(exchangeHandler, "VoucherCanceled")
          .withArgs(offerId, exchange.id, await buyer.getAddress());
      });

      it("should emit an VoucherCanceled event when new owner (not a buyer) calls", async function () {
        // Transfer voucher to new owner
        tokenId = deriveTokenId(offerId, exchange.id);
        bosonVoucherCloneAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          admin.address,
          ""
        );
        bosonVoucherClone = await getContractAt("IBosonVoucher", bosonVoucherCloneAddress);
        await bosonVoucherClone.connect(buyer).transferFrom(buyer.address, newOwner.address, tokenId);

        // Cancel the voucher, expecting event
        await expect(exchangeHandler.connect(newOwner).cancelVoucher(exchange.id))
          .to.emit(exchangeHandler, "VoucherCanceled")
          .withArgs(offerId, exchange.id, await newOwner.getAddress());
      });

      it("should update state when buyer calls", async function () {
        // Cancel the voucher
        await exchangeHandler.connect(buyer).cancelVoucher(exchange.id);

        // Get the exchange state
        [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

        // It should match ExchangeState.Canceled
        assert.equal(response, ExchangeState.Canceled, "Exchange state is incorrect");
      });

      it("should work on an additional collection", async function () {
        // Create a new collection
        const externalId = `Brand1`;
        await accountHandler.connect(assistant).createNewCollection(externalId, voucherInitValues);

        offer.collectionIndex = 1;
        offer.id = await offerHandler.getNextOfferId();
        exchange.id = await exchangeHandler.getNextExchangeId();
        const tokenId = deriveTokenId(offer.id, exchange.id);

        // Create the offer
        await offerHandler
          .connect(assistant)
          .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

        // Commit to offer, creating a new exchange
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offer.id, { value: price });

        // expected address of the first additional collection
        const additionalCollectionAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          admin.address,
          externalId
        );
        const additionalCollection = await getContractAt("BosonVoucher", additionalCollectionAddress);

        // Cancel the voucher, expecting event
        await expect(exchangeHandler.connect(buyer).cancelVoucher(exchange.id))
          .to.emit(additionalCollection, "Transfer")
          .withArgs(buyer.address, ZeroAddress, tokenId);
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
          await exchangeHandler.connect(assistant).revokeVoucher(exchange.id);

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

          await mockMetaTransactionsHandler.setAsMetaTransactionAndCurrentSenderAs(ZeroAddress);

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
        await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });
      });

      it("should emit an VoucherExpired event when anyone calls and voucher has expired", async function () {
        // Set time forward past the voucher's validUntilDate
        await setNextBlockTimestamp(Number(voucherRedeemableFrom) + Number(voucherValid) + Number(oneWeek));

        // Expire the voucher, expecting event
        await expect(exchangeHandler.connect(rando).expireVoucher(exchange.id))
          .to.emit(exchangeHandler, "VoucherExpired")
          .withArgs(offerId, exchange.id, await rando.getAddress());
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
          await exchangeHandler.connect(assistant).revokeVoucher(exchange.id);

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

          // Set time forward past the last valid timestamp
          await setNextBlockTimestamp(Number(voucherRedeemableFrom) + Number(voucherValid));

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
        await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });
      });

      it("should emit a VoucherRedeemed event when buyer calls", async function () {
        // Set time forward to the offer's voucherRedeemableFrom
        await setNextBlockTimestamp(Number(voucherRedeemableFrom));

        // Redeem the voucher, expecting event
        await expect(exchangeHandler.connect(buyer).redeemVoucher(exchange.id))
          .to.emit(exchangeHandler, "VoucherRedeemed")
          .withArgs(offerId, exchange.id, await buyer.getAddress());
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

      it("It's possible to redeem at the the end of voucher validity period", async function () {
        // Set time forward to the offer's validUntilDate
        await setNextBlockTimestamp(Number(voucherRedeemableFrom) + Number(voucherValid));

        // Redeem the voucher, expecting event
        await expect(exchangeHandler.connect(buyer).redeemVoucher(exchange.id)).to.emit(
          exchangeHandler,
          "VoucherRedeemed"
        );
      });

      it("should work on an additional collection", async function () {
        // Create a new collection
        const externalId = `Brand1`;
        await accountHandler.connect(assistant).createNewCollection(externalId, voucherInitValues);

        offer.collectionIndex = 1;
        offer.id = await offerHandler.getNextOfferId();
        exchange.id = await exchangeHandler.getNextExchangeId();
        const tokenId = deriveTokenId(offer.id, exchange.id);

        // Create the offer
        await offerHandler
          .connect(assistant)
          .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

        // Commit to offer, creating a new exchange
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offer.id, { value: price });

        // expected address of the first additional collection
        const additionalCollectionAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          admin.address,
          externalId
        );
        const additionalCollection = await getContractAt("BosonVoucher", additionalCollectionAddress);

        // Set time forward to the offer's voucherRedeemableFrom
        await setNextBlockTimestamp(Number(voucherRedeemableFrom));

        // Redeem the voucher, expecting event
        await expect(exchangeHandler.connect(buyer).redeemVoucher(exchange.id))
          .to.emit(additionalCollection, "Transfer")
          .withArgs(buyer.address, ZeroAddress, tokenId);
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
          await exchangeHandler.connect(assistant).revokeVoucher(exchange.id);

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
          await setNextBlockTimestamp(Number(voucherRedeemableFrom) + Number(voucherValid) + 1);

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
        await foreign20.connect(assistant).mint(await assistant.getAddress(), "500");
        // Mint first two and last two tokens of range
        await foreign721.connect(assistant).mint("1", "10");
        await foreign1155.connect(assistant).mint("1", "500");

        // Approve the protocol diamond to transfer seller's tokens
        await foreign20.connect(assistant).approve(protocolDiamondAddress, "30");
        await foreign721.connect(assistant).setApprovalForAll(protocolDiamondAddress, true);
        await foreign1155.connect(assistant).setApprovalForAll(protocolDiamondAddress, true);

        // Create an ERC20 twin
        twin20 = mockTwin(await foreign20.getAddress());
        twin20.amount = "3";
        twin20.supplyAvailable = "30";
        expect(twin20.isValid()).is.true;

        // Create an ERC721 twin
        twin721 = mockTwin(await foreign721.getAddress(), TokenType.NonFungibleToken);
        twin721.id = "2";
        twin721.amount = "0";
        twin721.supplyAvailable = "10";
        twin721.tokenId = "1";
        expect(twin721.isValid()).is.true;

        // Create an ERC1155 twin
        twin1155 = mockTwin(await foreign1155.getAddress(), TokenType.MultiToken);
        twin1155.id = "3";
        twin1155.tokenId = "1";
        twin1155.amount = "1";
        twin1155.supplyAvailable = "10";

        expect(twin1155.isValid()).is.true;

        // All the twin ids (for mixed bundle)
        twinIds = [twin20.id, twin721.id, twin1155.id];

        // Create twins
        await twinHandler.connect(assistant).createTwin(twin20.toStruct());
        await twinHandler.connect(assistant).createTwin(twin721.toStruct());
        await twinHandler.connect(assistant).createTwin(twin1155.toStruct());
      });

      context("📦 Offer bundled with ERC20 twin", async function () {
        beforeEach(async function () {
          // Create a new bundle
          bundle = new Bundle("1", seller.id, [offerId], [twin20.id]);
          expect(bundle.isValid()).is.true;
          await bundleHandler.connect(assistant).createBundle(bundle.toStruct());

          // Commit to offer
          await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));
        });

        it("should transfer the twin", async function () {
          // Check the buyer's balance of the ERC20
          balance = await foreign20.balanceOf(await buyer.getAddress());
          expect(balance).to.equal(0);

          // Redeem the voucher
          await expect(exchangeHandler.connect(buyer).redeemVoucher(exchange.id, { gasLimit: 600000 }))
            .to.emit(exchangeHandler, "TwinTransferred")
            .withArgs(
              twin20.id,
              twin20.tokenAddress,
              exchange.id,
              twin20.tokenId,
              twin20.amount,
              await buyer.getAddress()
            );

          // Check the buyer's balance of the ERC20
          balance = await foreign20.balanceOf(await buyer.getAddress());
          expect(balance).to.equal(3);
        });

        it("Amount should be reduced from twin supplyAvailable", async function () {
          // Redeem the voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Check twin supplyAvailable
          const [, twin] = await twinHandler.connect(assistant).getTwin(twin20.id);

          expect(twin.supplyAvailable).to.equal(twin20.supplyAvailable - twin20.amount);
        });

        it("Should not decrease twin supplyAvailable if supply is unlimited", async function () {
          // Change twin supply to unlimited
          twin20.supplyAvailable = MaxUint256.toString();
          twin20.id = "4";

          // Create a new twin
          await twinHandler.connect(assistant).createTwin(twin20.toStruct());

          const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
          offer.quantityAvailable = "2";

          // Create a new offer
          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

          // Create a new bundle
          bundle = new Bundle("1", seller.id, [++offerId], [twin20.id]);
          await bundleHandler.connect(assistant).createBundle(bundle.toStruct());

          // Commit to offer
          await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

          // Set time forward to the offer's voucherRedeemableFrom
          voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // Redeem the voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Check the supplyAvailable of the twin
          const [exists, twin] = await twinHandler.connect(assistant).getTwin(twin20.id);
          expect(exists).to.be.true;
          expect(twin.supplyAvailable).to.equal(twin20.supplyAvailable);
        });

        it("Should transfer the twin even if supplyAvailable is equal to amount", async function () {
          const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
          offer.quantityAvailable = "1";

          // Create a new offer
          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

          twin20.supplyAvailable = "3";
          twin20.id = "4";

          await twinHandler.connect(assistant).createTwin(twin20.toStruct());

          // Create a new bundle
          bundle = new Bundle("1", seller.id, [++offerId], [twin20.id]);
          await bundleHandler.connect(assistant).createBundle(bundle.toStruct());

          // Commit to offer
          await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

          // Set time forward to the offer's voucherRedeemableFrom
          voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // Redeem the second voucher
          await expect(exchangeHandler.connect(buyer).redeemVoucher(++exchange.id))
            .to.emit(exchangeHandler, "TwinTransferred")
            .withArgs(twin20.id, twin20.tokenAddress, exchange.id, "0", twin20.amount, await buyer.getAddress());

          // Check the buyer's balance
          balance = await foreign20.balanceOf(await buyer.getAddress());
          expect(balance).to.equal(3);

          const [, twin] = await twinHandler.getTwin(twin20.id);
          expect(twin.supplyAvailable).to.equal(0);
        });

        context("Twin transfer fail", async function () {
          it("should raise a dispute when buyer is an EOA", async function () {
            // Remove the approval for the protocol to transfer the seller's tokens
            await foreign20.connect(assistant).approve(protocolDiamondAddress, "0");

            const tx = await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

            await expect(tx)
              .to.emit(disputeHandler, "DisputeRaised")
              .withArgs(exchangeId, exchange.buyerId, seller.id, await buyer.getAddress());

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(
                twin20.id,
                twin20.tokenAddress,
                exchange.id,
                twin20.tokenId,
                twin20.amount,
                await buyer.getAddress()
              );

            // Get the exchange state
            [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

            // It should match ExchangeState.Disputed
            assert.equal(response, ExchangeState.Disputed, "Exchange state is incorrect");
          });

          it("should raise a dispute exchange when ERC20 contract transferFrom returns false", async function () {
            const [foreign20ReturnFalse] = await deployMockTokens(["Foreign20TransferFromReturnFalse"]);

            await foreign20ReturnFalse.connect(assistant).mint(await assistant.getAddress(), "500");
            await foreign20ReturnFalse.connect(assistant).approve(protocolDiamondAddress, "100");

            // Create a new ERC20 twin
            twin20 = mockTwin(await foreign20ReturnFalse.getAddress(), TokenType.FungibleToken);
            twin20.id = "4";

            // Create a new twin
            await twinHandler.connect(assistant).createTwin(twin20.toStruct());

            // Create a new offer
            const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();

            await offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

            // Set time forward to the offer's voucherRedeemableFrom
            voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
            await setNextBlockTimestamp(Number(voucherRedeemableFrom));

            // Create a new bundle
            await bundleHandler.connect(assistant).createBundle(new Bundle("1", seller.id, [++offerId], [twin20.id]));

            // Commit to offer
            await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

            await expect(exchangeHandler.connect(buyer).redeemVoucher(++exchange.id))
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(twin20.id, twin20.tokenAddress, exchange.id, "0", twin20.amount, await buyer.getAddress());

            // Get the exchange state
            [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

            // It should match ExchangeState.Disputed
            assert.equal(response, ExchangeState.Disputed, "Exchange state is incorrect");
          });

          it("should raise a dispute when buyer account is a contract", async function () {
            // Remove the approval for the protocol to transfer the seller's tokens
            await foreign20.connect(assistant).approve(protocolDiamondAddress, "0");

            // Deploy contract to test redeem called by another contract
            let TestProtocolFunctionsFactory = await getContractFactory("TestProtocolFunctions");
            const testProtocolFunctions = await TestProtocolFunctionsFactory.deploy(protocolDiamondAddress);
            await testProtocolFunctions.waitForDeployment();

            await testProtocolFunctions.commit(offerId, { value: price });

            let exchangeId = ++exchange.id;
            // Protocol should raised dispute automatically if transfer twin failed
            const tx = await testProtocolFunctions.redeem(exchangeId);

            await expect(tx)
              .to.emit(disputeHandler, "DisputeRaised")
              .withArgs(exchangeId, ++exchange.buyerId, seller.id, await testProtocolFunctions.getAddress());

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(
                twin20.id,
                twin20.tokenAddress,
                exchangeId,
                twin20.tokenId,
                twin20.amount,
                await testProtocolFunctions.getAddress()
              );

            // Get the exchange state
            [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

            // It should match ExchangeState.Revoked
            assert.equal(response, ExchangeState.Disputed, "Exchange state is incorrect");
          });

          it("if twin transfers consume all available gas, redeem still succeeds, but exchange is revoked", async function () {
            const [foreign20gt, foreign20gt_2] = await deployMockTokens(["Foreign20GasTheft", "Foreign20GasTheft"]);

            // Approve the protocol diamond to transfer seller's tokens
            await foreign20gt.connect(assistant).approve(protocolDiamondAddress, "100");
            await foreign20gt_2.connect(assistant).approve(protocolDiamondAddress, "100");

            // Create two ERC20 twins that will consume all available gas
            twin20 = mockTwin(await foreign20gt.getAddress());
            twin20.amount = "1";
            twin20.supplyAvailable = "100";
            twin20.id = "4";

            await twinHandler.connect(assistant).createTwin(twin20.toStruct());

            const twin20_2 = twin20.clone();
            twin20_2.id = "5";
            twin20_2.tokenAddress = await foreign20gt_2.getAddress();
            await twinHandler.connect(assistant).createTwin(twin20_2.toStruct());

            // Create a new offer and bundle
            await offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);
            bundle = new Bundle("2", seller.id, [`${++offerId}`], [twin20.id, twin20_2.id]);
            await bundleHandler.connect(assistant).createBundle(bundle.toStruct());

            // Commit to offer
            const buyerAddress = await buyer.getAddress();
            await exchangeHandler.connect(buyer).commitToOffer(buyerAddress, offerId, { value: price });

            exchange.id = Number(exchange.id) + 1;

            // Redeem the voucher
            tx = await exchangeHandler.connect(buyer).redeemVoucher(exchange.id, { gasLimit: 1000000 }); // limit gas to speed up test

            // Voucher should be revoked and both transfers should fail
            await expect(tx)
              .to.emit(disputeHandler, "DisputeRaised")
              .withArgs(exchange.id, exchange.buyerId, seller.id, buyerAddress);

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(twin20.id, twin20.tokenAddress, exchange.id, twin20.tokenId, twin20.amount, buyerAddress);

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(
                twin20_2.id,
                twin20_2.tokenAddress,
                exchange.id,
                twin20_2.tokenId,
                twin20_2.amount,
                await buyer.getAddress()
              );
            // Get the exchange state
            [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

            // It should match ExchangeState.Disputed
            assert.equal(response, ExchangeState.Disputed, "Exchange state is incorrect");
          });

          it("should raise a dispute if ERC20 does not exist anymore", async function () {
            // Destruct the ERC20
            await foreign20.destruct();

            const tx = await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

            await expect(tx)
              .to.emit(disputeHandler, "DisputeRaised")
              .withArgs(exchangeId, exchange.buyerId, seller.id, await buyer.getAddress());

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(
                twin20.id,
                twin20.tokenAddress,
                exchange.id,
                twin20.tokenId,
                twin20.amount,
                await buyer.getAddress()
              );

            // Get the exchange state
            [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

            // It should match ExchangeState.Disputed
            assert.equal(response, ExchangeState.Disputed, "Exchange state is incorrect");
          });
        });
      });

      context("📦 Offer bundled with ERC721 twin", async function () {
        beforeEach(async function () {
          // Create a new bundle
          bundle = new Bundle("1", seller.id, [offerId], [twin721.id]);
          expect(bundle.isValid()).is.true;
          await bundleHandler.connect(assistant).createBundle(bundle.toStruct());

          // Commit to offer
          await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));
        });

        it("Should transfer the twin", async function () {
          // Start with last id
          let tokenId = "10";

          // Check the assistant owns the last ERC721 of twin range
          owner = await foreign721.ownerOf(tokenId);
          expect(owner).to.equal(await assistant.getAddress());
          [exists, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

          // Redeem the voucher
          await expect(exchangeHandler.connect(buyer).redeemVoucher(exchange.id))
            .to.emit(exchangeHandler, "TwinTransferred")
            .withArgs(twin721.id, twin721.tokenAddress, exchange.id, tokenId, "0", await buyer.getAddress());

          // Check the buyer owns the last ERC721 of twin range
          owner = await foreign721.ownerOf(tokenId);
          expect(owner).to.equal(await buyer.getAddress());

          tokenId = "9";
          // Check the assistant owns the last ERC721 of twin range
          owner = await foreign721.ownerOf(tokenId);
          expect(owner).to.equal(await assistant.getAddress());

          // Commit to offer for the second time
          await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

          // Redeem the second voucher for the second time / id = 2
          await expect(exchangeHandler.connect(buyer).redeemVoucher(++exchange.id))
            .to.emit(exchangeHandler, "TwinTransferred")
            .withArgs(twin721.id, twin721.tokenAddress, exchange.id, tokenId, "0", await buyer.getAddress());

          // Check the buyer owns the last ERC721 of twin range
          owner = await foreign721.ownerOf(tokenId);
          expect(owner).to.equal(await buyer.getAddress());
        });

        it("1 should be reduced from twin supplyAvailable", async function () {
          // Redeem the voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Check twin supplyAvailable
          const [, twin] = await twinHandler.connect(assistant).getTwin(twin721.id);

          expect(twin.supplyAvailable).to.equal(twin721.supplyAvailable - 1);
        });

        it("Should transfer the twin even if supplyAvailable is equal to 1", async function () {
          await foreign721.connect(assistant).mint("11", "1");

          const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
          offer.quantityAvailable = "1";

          // Create a new offer
          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

          twin721.supplyAvailable = "1";
          twin721.tokenId = "11";
          twin721.id = "4";

          // Create a new twin
          await twinHandler.connect(assistant).createTwin(twin721.toStruct());

          // Create a new bundle
          bundle = new Bundle("1", seller.id, [++offerId], [twin721.id]);
          await bundleHandler.connect(assistant).createBundle(bundle.toStruct());

          // Commit to offer
          await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

          // Set time forward to the offer's voucherRedeemableFrom
          voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          let tokenId = "11";

          // Redeem the second voucher
          await expect(exchangeHandler.connect(buyer).redeemVoucher(++exchange.id))
            .to.emit(exchangeHandler, "TwinTransferred")
            .withArgs(twin721.id, twin721.tokenAddress, exchange.id, tokenId, twin721.amount, await buyer.getAddress());

          // Check the buyer owns the first ERC721 in twin range
          owner = await foreign721.ownerOf(tokenId);
          expect(owner).to.equal(await buyer.getAddress());

          const [, twin] = await twinHandler.getTwin(twin721.id);
          expect(twin.supplyAvailable).to.equal(0);
        });

        context("Check twinRangesBySeller slot", async function () {
          let sellerTwinRangesSlot, protocolLookupsSlotNumber;

          beforeEach(async function () {
            // starting slot
            const protocolLookupsSlot = id("boson.protocol.lookups");
            protocolLookupsSlotNumber = BigInt(protocolLookupsSlot);

            // seller id mapping from twinRangesBySeller
            const firstMappingSlot = BigInt(
              getMappingStoragePosition(protocolLookupsSlotNumber + 22n, Number(seller.id), paddingType.START)
            );

            // token address mapping from twinRangesBySeller
            const secondMappingSlot = getMappingStoragePosition(
              firstMappingSlot,
              twin721.tokenAddress.toLowerCase(),
              paddingType.START
            );

            sellerTwinRangesSlot = BigInt(keccak256(secondMappingSlot));
          });

          it("Should reduce end in twinRangesBySeller range", async function () {
            // Redeem the voucher
            await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

            const start = await getStorageAt(protocolDiamondAddress, sellerTwinRangesSlot);
            expect(start).to.equal(zeroPadValue(toHexString(BigInt("1")), 32));

            const end = await getStorageAt(protocolDiamondAddress, sellerTwinRangesSlot + 1n);
            expect(end).to.equal(zeroPadValue(toHexString(BigInt("9")), 32));
          });

          it("Should remove element from range when transferring last twin", async function () {
            let exchangeId = 1;
            let supply = 9;

            // redeem first exchange and increase exchangeId
            await exchangeHandler.connect(buyer).redeemVoucher(exchangeId++);

            while (exchangeId <= 10) {
              await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

              await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

              let expectedStart;
              let expectedEnd;
              if (exchangeId == 10) {
                // Last transfer should remove range
                expectedStart = zeroPadValue(toHexString(BigInt("0")), 32);
                expectedEnd = zeroPadValue(toHexString(BigInt("0")), 32);
              } else {
                expectedStart = zeroPadValue(toHexString(BigInt("1")), 32);
                expectedEnd = zeroPadValue(toHexString(BigInt(--supply)), 32);
              }
              const start = await getStorageAt(protocolDiamondAddress, sellerTwinRangesSlot);
              expect(start).to.equal(expectedStart);

              const end = await getStorageAt(protocolDiamondAddress, sellerTwinRangesSlot + 1n);
              expect(end).to.equal(expectedEnd);

              exchangeId++;
            }
          });

          it("Should remove rangeIdByTwin when transfering last token from range", async () => {
            const rangeIdByTwinMappingSlot = BigInt(
              getMappingStoragePosition(protocolLookupsSlotNumber + 32n, Number(twin721.id), paddingType.START)
            );

            let exchangeId = 1;

            // redeem first exchange and increase exchangeId
            await exchangeHandler.connect(buyer).redeemVoucher(exchangeId++);

            while (exchangeId <= 10) {
              await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

              await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

              let expectedRangeId = BigInt("1");
              if (exchangeId == 10) {
                expectedRangeId = BigInt("0");
              }

              const rangeId = await getStorageAt(protocolDiamondAddress, rangeIdByTwinMappingSlot);
              expect(rangeId).to.equal(expectedRangeId);

              exchangeId++;
            }
          });

          it("If seller has more than one range for the same token should remove correct range", async () => {
            // Create a new twin with the same token addresses
            twin721.id = "4";
            twin721.tokenId = "11";

            await twinHandler.connect(assistant).createTwin(twin721.toStruct());

            // Create a new offer
            const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
            offer.quantityAvailable = "10";

            await offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

            // Bundle offer with twin
            bundle = new Bundle("2", seller.id, [++offerId], [twin721.id]);
            await bundleHandler.connect(assistant).createBundle(bundle.toStruct());

            // First range
            let range1Start = await getStorageAt(protocolDiamondAddress, sellerTwinRangesSlot);
            let expectedRange1Start = zeroPadValue(toHexString(BigInt("1")), 32);
            expect(range1Start).to.equal(expectedRange1Start);

            let range1End = await getStorageAt(protocolDiamondAddress, sellerTwinRangesSlot + 1n);
            let expectedRange1End = zeroPadValue(toHexString(BigInt("10")), 32);
            expect(range1End).to.equal(expectedRange1End);

            // Second range
            let range2Start = await getStorageAt(protocolDiamondAddress, sellerTwinRangesSlot + 2n);
            let expectedRange2Start = zeroPadValue(toHexString(BigInt("11")), 32);
            expect(range2Start).to.equal(expectedRange2Start);

            let range2End = await getStorageAt(protocolDiamondAddress, sellerTwinRangesSlot + 3n);
            let expectedRange2End = zeroPadValue(toHexString(BigInt("20")), 32);
            expect(range2End).to.equal(expectedRange2End);

            // Set time forward to the offer's voucherRedeemableFrom
            voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
            await setNextBlockTimestamp(Number(voucherRedeemableFrom));

            let exchangeId = 1;
            // Redeem all twins from first offer
            await exchangeHandler.connect(buyer).redeemVoucher(exchangeId++);

            // Reduce offer id to commit to first offer
            --offerId;

            while (exchangeId <= 10) {
              await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

              await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

              exchangeId++;
            }

            // First range now should be second range
            range1Start = await getStorageAt(protocolDiamondAddress, sellerTwinRangesSlot);
            expect(range1Start).to.equal(expectedRange2Start);
            range1End = await getStorageAt(protocolDiamondAddress, sellerTwinRangesSlot + 1n);
            expect(range1End).to.equal(expectedRange2End);

            // Second range should be empty
            const slotEmpty = zeroPadBytes(toHexString(BigInt("0")), 32);
            range2Start = await getStorageAt(protocolDiamondAddress, sellerTwinRangesSlot + 2n);
            expect(range2Start).to.equal(slotEmpty);
            range2End = await getStorageAt(protocolDiamondAddress, sellerTwinRangesSlot + 3n);
            expect(range2End).to.equal(slotEmpty);
          });
        });

        context("Unlimited supply", async function () {
          let other721;
          beforeEach(async function () {
            // Deploy a new ERC721 token
            let TokenContractFactory = await getContractFactory("Foreign721");
            other721 = await TokenContractFactory.connect(rando).deploy();

            // Mint enough tokens to cover the offer
            await other721.connect(assistant).mint("1", "2");

            // Approve the protocol diamond to transfer seller's tokens
            await other721.connect(assistant).setApprovalForAll(protocolDiamondAddress, true);

            const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
            offer.quantityAvailable = "2";

            // Create a new offer
            await offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

            // Change twin supply to unlimited and token address to the new token
            twin721.supplyAvailable = MaxUint256.toString();
            twin721.tokenAddress = await other721.getAddress();
            twin721.id = "4";
            twin721.tokenId = "1";

            // Increase exchange id
            exchange.id++;

            // Create a new twin with the new token address
            await twinHandler.connect(assistant).createTwin(twin721.toStruct());

            // Create a new bundle
            bundle = new Bundle("1", seller.id, [++offerId], [twin721.id]);
            await bundleHandler.connect(assistant).createBundle(bundle.toStruct());

            // Commit to offer
            await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

            // Set time forward to the offer's voucherRedeemableFrom
            voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
            await setNextBlockTimestamp(Number(voucherRedeemableFrom));
          });

          it("Should not decrease twin supplyAvailable if supply is unlimited", async function () {
            // Redeem the voucher
            await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

            // Check the supplyAvailable of the twin
            const [exists, twin] = await twinHandler.connect(assistant).getTwin(twin721.id);
            expect(exists).to.be.true;
            expect(twin.supplyAvailable).to.equal(twin721.supplyAvailable);
          });

          it("Transfer token order must be ascending if twin supply is unlimited", async function () {
            let exchangeId = exchange.id;

            // tokenId transferred to the buyer is 1
            let expectedTokenId = "1";

            // Check the assistant owns the first ERC721 of twin range
            owner = await other721.ownerOf(expectedTokenId);
            expect(owner).to.equal(await assistant.getAddress());

            // Redeem the voucher
            await expect(exchangeHandler.connect(buyer).redeemVoucher(exchangeId))
              .to.emit(exchangeHandler, "TwinTransferred")
              .withArgs(twin721.id, twin721.tokenAddress, exchangeId, expectedTokenId, "0", await buyer.getAddress());

            // Check the buyer owns the first ERC721 of twin range
            owner = await other721.ownerOf(expectedTokenId);
            expect(owner).to.equal(await buyer.getAddress());

            ++expectedTokenId;

            // Check the assistant owns the second ERC721 of twin range
            owner = await other721.ownerOf(expectedTokenId);
            expect(owner).to.equal(await assistant.getAddress());

            // Commit to offer for the second time
            await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

            // Redeem the voucher
            // tokenId transferred to the buyer is 1
            await expect(exchangeHandler.connect(buyer).redeemVoucher(++exchangeId))
              .to.emit(exchangeHandler, "TwinTransferred")
              .withArgs(twin721.id, twin721.tokenAddress, exchangeId, expectedTokenId, "0", await buyer.getAddress());

            // Check the buyer owns the second ERC721 of twin range
            owner = await other721.ownerOf(expectedTokenId);
            expect(owner).to.equal(await buyer.getAddress());
          });

          it("Should increase start in twinRangesBySeller range", async function () {
            // Redeem the voucher
            await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

            // starting slot
            const protocolLookupsSlot = id("boson.protocol.lookups");
            const protocolLookupsSlotNumber = BigInt(protocolLookupsSlot);

            // seller id mapping from twinRangesBySeller
            const firstMappingSlot = BigInt(
              getMappingStoragePosition(protocolLookupsSlotNumber + 22n, Number(seller.id), paddingType.START)
            );

            // token address mapping from twinRangesBySeller
            const secondMappingSlot = getMappingStoragePosition(
              firstMappingSlot,
              twin721.tokenAddress.toLowerCase(),
              paddingType.START
            );

            const range = {};
            const arrayStart = BigInt(keccak256(secondMappingSlot));
            (range.start = await getStorageAt(protocolDiamondAddress, arrayStart + 0n)),
              (range.end = await getStorageAt(protocolDiamondAddress, arrayStart + 1n));

            const expectedRange = {
              start: zeroPadValue(toHexString(BigInt("2")), 32),
              end: MaxUint256,
            };
            expect(range).to.deep.equal(expectedRange);
          });
        });

        context("Twin transfer fail", async function () {
          it("should raise a dispute when buyer is an EOA", async function () {
            // Remove the approval for the protocol to transfer the seller's tokens
            await foreign721.connect(assistant).setApprovalForAll(protocolDiamondAddress, false);

            const tx = await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

            await expect(tx)
              .to.emit(disputeHandler, "DisputeRaised")
              .withArgs(exchange.id, exchange.buyerId, seller.id, await buyer.getAddress());

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(twin721.id, twin721.tokenAddress, exchange.id, "10", "0", buyer.address);

            // Get the exchange state
            [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

            // It should match ExchangeState.Disputed
            assert.equal(response, ExchangeState.Disputed, "Exchange state is incorrect");
          });

          it("should raise a dispute when buyer account is a contract", async function () {
            // Deploy contract to test redeem called by another contract
            let TestProtocolFunctionsFactory = await getContractFactory("TestProtocolFunctions");
            const testProtocolFunctions = await TestProtocolFunctionsFactory.deploy(protocolDiamondAddress);
            await testProtocolFunctions.waitForDeployment();

            await testProtocolFunctions.commit(offerId, { value: price });

            // Protocol should raised dispute automatically if transfer twin failed
            const tx = await testProtocolFunctions.connect(buyer).redeem(++exchange.id);

            await expect(tx)
              .to.emit(disputeHandler, "DisputeRaised")
              .withArgs(exchange.id, ++exchange.buyerId, seller.id, await testProtocolFunctions.getAddress());

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(
                twin721.id,
                twin721.tokenAddress,
                exchange.id,
                "10",
                "0",
                await testProtocolFunctions.getAddress()
              );

            // Get the exchange state
            [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

            // It should match ExchangeState.Revoked
            assert.equal(response, ExchangeState.Disputed, "Exchange state is incorrect");
          });

          it("if twin transfers consume all available gas, redeem still succeeds, but exchange is revoked", async function () {
            const [foreign721gt, foreign721gt_2] = await deployMockTokens(["Foreign721GasTheft", "Foreign721GasTheft"]);

            // Approve the protocol diamond to transfer seller's tokens
            await foreign721gt.connect(assistant).setApprovalForAll(protocolDiamondAddress, true);
            await foreign721gt_2.connect(assistant).setApprovalForAll(protocolDiamondAddress, true);

            // Create two ERC721 twins that will consume all available gas
            twin721 = mockTwin(await foreign721gt.getAddress(), TokenType.NonFungibleToken);
            twin721.amount = "0";
            twin721.supplyAvailable = "10";
            twin721.id = "4";

            await twinHandler.connect(assistant).createTwin(twin721.toStruct());

            const twin721_2 = twin721.clone();
            twin721_2.id = "5";
            twin721_2.tokenAddress = await foreign721gt_2.getAddress();
            await twinHandler.connect(assistant).createTwin(twin721_2.toStruct());

            // Create a new offer and bundle
            await offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);
            bundle = new Bundle("2", seller.id, [`${++offerId}`], [twin721.id, twin721_2.id]);
            await bundleHandler.connect(assistant).createBundle(bundle.toStruct());

            // Commit to offer
            const buyerAddress = await buyer.getAddress();
            await exchangeHandler.connect(buyer).commitToOffer(buyerAddress, offerId, { value: price });

            exchange.id = Number(exchange.id) + 1;

            // Redeem the voucher
            tx = await exchangeHandler.connect(buyer).redeemVoucher(exchange.id, { gasLimit: 1000000 }); // limit gas to speed up test

            // Voucher should be revoked and both transfers should fail
            await expect(tx)
              .to.emit(disputeHandler, "DisputeRaised")
              .withArgs(exchange.id, exchange.buyerId, seller.id, buyerAddress);

            let tokenId = "9";
            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(twin721.id, twin721.tokenAddress, exchange.id, tokenId, twin721.amount, buyerAddress);

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(twin721_2.id, twin721_2.tokenAddress, exchange.id, tokenId, twin721_2.amount, buyerAddress);

            // Get the exchange state
            [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

            // It should match ExchangeState.Disputed
            assert.equal(response, ExchangeState.Disputed, "Exchange state is incorrect");
          });

          it("should raise a dispute if erc721 contract does not exist anymore", async function () {
            // Destruct the ERC721
            await foreign721.destruct();

            const tx = await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

            await expect(tx)
              .to.emit(disputeHandler, "DisputeRaised")
              .withArgs(exchange.id, exchange.buyerId, seller.id, await buyer.getAddress());

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(twin721.id, twin721.tokenAddress, exchange.id, "10", "0", await buyer.getAddress());

            // Get the exchange state
            [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

            // It should match ExchangeState.Disputed
            assert.equal(response, ExchangeState.Disputed, "Exchange state is incorrect");
          });
        });
      });

      context("📦 Offer bundled with ERC1155 twin", async function () {
        beforeEach(async function () {
          // Create a new bundle
          bundle = new Bundle("1", seller.id, [offerId], [twin1155.id]);
          expect(bundle.isValid()).is.true;
          await bundleHandler.connect(assistant).createBundle(bundle.toStruct());

          // Commit to offer
          await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));
        });

        it("should transfer the twin", async function () {
          let tokenId = "1";

          // Check the buyer's balance of the ERC1155
          balance = await foreign1155.balanceOf(await buyer.getAddress(), tokenId);
          expect(balance).to.equal(0);

          // Redeem the voucher
          await expect(exchangeHandler.connect(buyer).redeemVoucher(exchange.id))
            .to.emit(exchangeHandler, "TwinTransferred")
            .withArgs(
              twin1155.id,
              twin1155.tokenAddress,
              exchange.id,
              tokenId,
              twin1155.amount,
              await buyer.getAddress()
            );

          // Check the buyer's balance of the ERC1155
          balance = await foreign1155.balanceOf(await buyer.getAddress(), tokenId);
          expect(balance).to.equal(1);
        });

        it("Amount should be reduced from twin supplyAvailable", async function () {
          // Redeem the voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Check twin supplyAvailable
          const [, twin] = await twinHandler.connect(assistant).getTwin(twin1155.id);

          expect(twin.supplyAvailable).to.equal(twin1155.supplyAvailable - twin1155.amount);
        });

        it("Should not decrease twin supplyAvailable if supply is unlimited", async function () {
          // Change twin supply to unlimited
          twin1155.supplyAvailable = MaxUint256.toString();
          twin1155.id = "4";

          // Create a new twin
          await twinHandler.connect(assistant).createTwin(twin1155.toStruct());

          const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
          offer.quantityAvailable = "2";

          // Create a new offer
          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

          // Create a new bundle
          bundle = new Bundle("1", seller.id, [++offerId], [twin1155.id]);
          await bundleHandler.connect(assistant).createBundle(bundle.toStruct());

          // Commit to offer
          await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

          // Set time forward to the offer's voucherRedeemableFrom
          voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // Redeem the voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Check the supplyAvailable of the twin
          const [exists, twin] = await twinHandler.connect(assistant).getTwin(twin1155.id);
          expect(exists).to.be.true;
          expect(twin.supplyAvailable).to.equal(twin1155.supplyAvailable);
        });

        it("Should transfer the twin even if supplyAvailable is equal to amount", async function () {
          const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
          offer.quantityAvailable = "1";

          // Create a new offer
          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

          twin1155.supplyAvailable = "1";
          twin1155.id = "4";

          // Create a new twin
          await twinHandler.connect(assistant).createTwin(twin1155.toStruct());

          // Create a new bundle
          bundle = new Bundle("1", seller.id, [++offerId], [twin1155.id]);
          await bundleHandler.connect(assistant).createBundle(bundle.toStruct());

          // Commit to offer
          await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

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
              await buyer.getAddress()
            );

          // Check the buyer's balance
          balance = await foreign1155.balanceOf(await buyer.getAddress(), twin1155.tokenId);
          expect(balance).to.equal(1);

          const [, twin] = await twinHandler.getTwin(twin1155.id);
          expect(twin.supplyAvailable).to.equal(0);
        });

        context("Twin transfer fail", async function () {
          it("should raise a dispute when buyer is an EOA", async function () {
            // Remove the approval for the protocol to transfer the seller's tokens
            await foreign1155.connect(assistant).setApprovalForAll(protocolDiamondAddress, false);

            const tx = await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);
            await expect(tx)
              .to.emit(disputeHandler, "DisputeRaised")
              .withArgs(exchange.id, exchange.buyerId, seller.id, await buyer.getAddress());

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(
                twin1155.id,
                twin1155.tokenAddress,
                exchange.id,
                twin1155.tokenId,
                twin1155.amount,
                await buyer.getAddress()
              );

            // Get the exchange state
            [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

            // It should match ExchangeState.Disputed
            assert.equal(response, ExchangeState.Disputed, "Exchange state is incorrect");
          });

          it("should raise a dispute when buyer account is a contract", async function () {
            // Deploy contract to test redeem called by another contract
            let TestProtocolFunctionsFactory = await getContractFactory("TestProtocolFunctions");
            const testProtocolFunctions = await TestProtocolFunctionsFactory.deploy(protocolDiamondAddress);
            await testProtocolFunctions.waitForDeployment();

            await testProtocolFunctions.commit(offerId, { value: price });

            // Protocol should raised dispute automatically if transfer twin failed
            const tx = await testProtocolFunctions.redeem(++exchange.id);
            await expect(tx)
              .to.emit(disputeHandler, "DisputeRaised")
              .withArgs(exchange.id, ++exchange.buyerId, seller.id, await testProtocolFunctions.getAddress());

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(
                twin1155.id,
                twin1155.tokenAddress,
                exchange.id,
                twin1155.tokenId,
                twin1155.amount,
                await testProtocolFunctions.getAddress()
              );

            // Get the exchange state
            [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

            // It should match ExchangeState.Revoked
            assert.equal(response, ExchangeState.Disputed, "Exchange state is incorrect");
          });

          it("if twin transfers consume all available gas, redeem still succeeds, but exchange is revoked", async function () {
            const [foreign1155gt, foreign1155gt_2] = await deployMockTokens([
              "Foreign1155GasTheft",
              "Foreign1155GasTheft",
            ]);

            // Approve the protocol diamond to transfer seller's tokens
            await foreign1155gt.connect(assistant).setApprovalForAll(protocolDiamondAddress, true);
            await foreign1155gt_2.connect(assistant).setApprovalForAll(protocolDiamondAddress, true);

            // Create two ERC1155 twins that will consume all available gas
            twin1155 = mockTwin(await foreign1155gt.getAddress(), TokenType.MultiToken);
            twin1155.amount = "1";
            twin1155.tokenId = "1";
            twin1155.supplyAvailable = "10";
            twin1155.id = "4";

            await twinHandler.connect(assistant).createTwin(twin1155.toStruct());

            const twin1155_2 = twin1155.clone();
            twin1155_2.id = "5";
            twin1155_2.tokenAddress = await foreign1155gt_2.getAddress();
            await twinHandler.connect(assistant).createTwin(twin1155_2.toStruct());

            // Create a new offer and bundle
            await offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);
            bundle = new Bundle("2", seller.id, [`${++offerId}`], [twin1155.id, twin1155_2.id]);
            await bundleHandler.connect(assistant).createBundle(bundle.toStruct());

            // Commit to offer
            const buyerAddress = await buyer.getAddress();
            await exchangeHandler.connect(buyer).commitToOffer(buyerAddress, offerId, { value: price });

            exchange.id = Number(exchange.id) + 1;

            // Redeem the voucher
            tx = await exchangeHandler.connect(buyer).redeemVoucher(exchange.id, { gasLimit: 1000000 }); // limit gas to speed up test

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(
                twin1155.id,
                twin1155.tokenAddress,
                exchange.id,
                twin1155.tokenId,
                twin1155.amount,
                buyerAddress
              );

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(
                twin1155_2.id,
                twin1155_2.tokenAddress,
                exchange.id,
                twin1155_2.tokenId,
                twin1155_2.amount,
                buyerAddress
              );

            // Get the exchange state
            [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

            // It should match ExchangeState.Disputed
            assert.equal(response, ExchangeState.Disputed, "Exchange state is incorrect");
          });

          it("should raise a dispute if erc1155 contract does not exist anymore", async function () {
            // Destruct the ERC1155 contract
            await foreign1155.destruct();

            const tx = await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);
            await expect(tx)
              .to.emit(disputeHandler, "DisputeRaised")
              .withArgs(exchange.id, exchange.buyerId, seller.id, await buyer.getAddress());

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(
                twin1155.id,
                twin1155.tokenAddress,
                exchange.id,
                twin1155.tokenId,
                twin1155.amount,
                await buyer.getAddress()
              );

            // Get the exchange state
            [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

            // It should match ExchangeState.Disputed
            assert.equal(response, ExchangeState.Disputed, "Exchange state is incorrect");
          });
        });
      });

      context("📦 Offer bundled with mixed twins", async function () {
        beforeEach(async function () {
          // Create a new bundle
          bundle = new Bundle("1", seller.id, [offerId], twinIds);
          expect(bundle.isValid()).is.true;
          await bundleHandler.connect(assistant).createBundle(bundle.toStruct());

          // Commit to offer
          await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));
        });

        it("should transfer the twins", async function () {
          let tokenIdNonFungible = "10";
          let tokenIdMultiToken = "1";

          // Check the buyer's balance of the ERC20
          balance = await foreign20.balanceOf(await buyer.getAddress());
          expect(balance).to.equal(0);

          // Check the assistant owns the ERC721
          owner = await foreign721.ownerOf(tokenIdNonFungible);
          expect(owner).to.equal(await assistant.getAddress());

          // Check the buyer's balance of the ERC1155
          balance = await foreign1155.balanceOf(await buyer.getAddress(), tokenIdMultiToken);
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
              await buyer.getAddress()
            );

          await expect(tx)
            .and.to.emit(exchangeHandler, "TwinTransferred")
            .withArgs(twin20.id, twin20.tokenAddress, exchangeId, "0", twin20.amount, await buyer.getAddress());

          await expect(tx)
            .and.to.emit(exchangeHandler, "TwinTransferred")
            .withArgs(
              twin721.id,
              twin721.tokenAddress,
              exchangeId,
              tokenIdNonFungible,
              twin721.amount,
              await buyer.getAddress()
            );

          // Check the buyer's balance of the ERC20
          balance = await foreign20.balanceOf(await buyer.getAddress());
          expect(balance).to.equal(3);

          // Check the buyer owns the ERC721
          owner = await foreign721.ownerOf(tokenIdNonFungible);
          expect(owner).to.equal(await buyer.getAddress());

          // Check the buyer's balance of the ERC1155
          balance = await foreign1155.balanceOf(await buyer.getAddress(), tokenIdMultiToken);
          expect(balance).to.equal(1);
        });

        it("Should transfer the twin even if supplyAvailable is equal to amount", async function () {
          await foreign721.connect(assistant).mint("11", "1");

          const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
          offer.quantityAvailable = "1";

          // Create a new offer
          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

          twin1155.supplyAvailable = "1";
          twin1155.id = "4";

          // Create a new twin
          await twinHandler.connect(assistant).createTwin(twin1155.toStruct());

          twin20.supplyAvailable = "3";
          twin20.id = "5";

          await twinHandler.connect(assistant).createTwin(twin20.toStruct());

          twin721.supplyAvailable = "1";
          twin721.tokenId = "11";
          twin721.id = "6";

          await twinHandler.connect(assistant).createTwin(twin721.toStruct());

          // Create a new bundle
          bundle = new Bundle("1", seller.id, [++offerId], [twin1155.id, twin20.id, twin721.id]);
          await bundleHandler.connect(assistant).createBundle(bundle.toStruct());

          // Commit to offer
          await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

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
              await buyer.getAddress()
            );

          await expect(tx)
            .and.to.emit(exchangeHandler, "TwinTransferred")
            .withArgs(
              twin721.id,
              twin721.tokenAddress,
              exchange.id,
              twin721.tokenId,
              twin721.amount,
              await buyer.getAddress()
            );

          await expect(tx)
            .and.to.emit(exchangeHandler, "TwinTransferred")
            .withArgs(twin20.id, twin20.tokenAddress, exchange.id, "0", twin20.amount, await buyer.getAddress());

          // Check the buyer's balance
          balance = await foreign1155.balanceOf(await buyer.getAddress(), twin1155.tokenId);
          expect(balance).to.equal(1);

          balance = await foreign721.balanceOf(await buyer.getAddress());
          expect(balance).to.equal(1);

          balance = await foreign20.balanceOf(await buyer.getAddress());
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
            let TokenContractFactory = await getContractFactory("Foreign721");
            other721 = await TokenContractFactory.connect(rando).deploy();

            // Mint enough tokens to cover the offer
            await other721.connect(assistant).mint("1", "2");

            // Approve the protocol diamond to transfer seller's tokens
            await other721.connect(assistant).setApprovalForAll(protocolDiamondAddress, true);

            const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
            offer.quantityAvailable = "2";

            // Create a new offer
            await offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

            // Change twin supply to unlimited and token address to the new token
            twin721.supplyAvailable = MaxUint256.toString();
            twin721.tokenAddress = await other721.getAddress();
            twin721.id = "4";
            // Create a new ERC721 twin with the new token address
            await twinHandler.connect(assistant).createTwin(twin721.toStruct());

            twin20.supplyAvailable = MaxUint256.toString();
            twin20.id = "5";
            // Create a new ERC20 twin with the new token address
            await twinHandler.connect(assistant).createTwin(twin20.toStruct());

            twin1155.supplyAvailable = MaxUint256.toString();
            twin1155.id = "6";
            // Create a new ERC1155 twin with the new token address
            await twinHandler.connect(assistant).createTwin(twin1155.toStruct());

            // Create a new bundle
            bundle = new Bundle("1", seller.id, [++offerId], [twin721.id, twin20.id, twin1155.id]);
            await bundleHandler.connect(assistant).createBundle(bundle.toStruct());

            // Commit to offer
            await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

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
              .withArgs(twin721.id, twin721.tokenAddress, exchange.id, "1", twin721.amount, buyer.address);

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferred")
              .withArgs(
                twin20.id,
                twin20.tokenAddress,
                exchange.id,
                twin20.tokenId,
                twin20.amount,
                await buyer.getAddress()
              );

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferred")
              .withArgs(
                twin1155.id,
                twin1155.tokenAddress,
                exchange.id,
                twin1155.tokenId,
                twin1155.amount,
                await buyer.getAddress()
              );

            // Check the supplyAvailable of each twin
            let [, twin] = await twinHandler.connect(assistant).getTwin(twin721.id);
            expect(twin.supplyAvailable).to.equal(twin721.supplyAvailable);

            [, twin] = await twinHandler.connect(assistant).getTwin(twin20.id);
            expect(twin.supplyAvailable).to.equal(twin20.supplyAvailable);

            [, twin] = await twinHandler.connect(assistant).getTwin(twin1155.id);
            expect(twin.supplyAvailable).to.equal(twin1155.supplyAvailable);
          });

          it("Transfer token order must be ascending if twin supply is unlimited and token type is NonFungible", async function () {
            let expectedTokenId = "1";
            let exchangeId = exchange.id;

            // Check the assistant owns the first ERC721 of twin range
            owner = await other721.ownerOf(expectedTokenId);
            expect(owner).to.equal(await assistant.getAddress());

            // Redeem the voucher
            await expect(exchangeHandler.connect(buyer).redeemVoucher(exchangeId))
              .to.emit(exchangeHandler, "TwinTransferred")
              .withArgs(twin721.id, twin721.tokenAddress, exchangeId, expectedTokenId, "0", await buyer.getAddress());

            // Check the buyer owns the first ERC721 of twin range
            owner = await other721.ownerOf(expectedTokenId);
            expect(owner).to.equal(await buyer.getAddress());

            ++expectedTokenId;

            // Check the assistant owns the second ERC721 of twin range
            owner = await other721.ownerOf(expectedTokenId);
            expect(owner).to.equal(await assistant.getAddress());

            // Commit to offer for the second time
            await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

            // Redeem the voucher
            // tokenId transferred to the buyer is 1
            await expect(exchangeHandler.connect(buyer).redeemVoucher(++exchangeId))
              .to.emit(exchangeHandler, "TwinTransferred")
              .withArgs(twin721.id, twin721.tokenAddress, exchangeId, expectedTokenId, "0", await buyer.getAddress());

            // Check the buyer owns the second ERC721 of twin range
            owner = await other721.ownerOf(expectedTokenId);
            expect(owner).to.equal(await buyer.getAddress());
          });
        });

        context("Twin transfer fail", async function () {
          it("should raise a dispute when buyer is an EOA", async function () {
            // Remove the approval for the protocol to transfer the seller's tokens
            await foreign20.connect(assistant).approve(protocolDiamondAddress, "0");

            let exchangeId = exchange.id;
            const tx = await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

            await expect(tx)
              .to.emit(disputeHandler, "DisputeRaised")
              .withArgs(exchangeId, exchange.buyerId, seller.id, await buyer.getAddress());

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(twin20.id, twin20.tokenAddress, exchangeId, "0", twin20.amount, await buyer.getAddress());

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferred")
              .withArgs(twin721.id, twin721.tokenAddress, exchangeId, "10", "0", buyer.address);

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferred")
              .withArgs(
                twin1155.id,
                twin1155.tokenAddress,
                exchangeId,
                twin1155.tokenId,
                twin1155.amount,
                await buyer.getAddress()
              );

            // Get the exchange state
            [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

            // It should match ExchangeState.Disputed
            assert.equal(response, ExchangeState.Disputed, "Exchange state is incorrect");
          });

          it("should raise a dispute when buyer account is a contract", async function () {
            // Remove the approval for the protocol to transfer the seller's tokens
            await foreign20.connect(assistant).approve(protocolDiamondAddress, "0");

            // Deploy contract to test redeem called by another contract
            let TestProtocolFunctionsFactory = await getContractFactory("TestProtocolFunctions");
            const testProtocolFunctions = await TestProtocolFunctionsFactory.deploy(protocolDiamondAddress);
            await testProtocolFunctions.waitForDeployment();

            await testProtocolFunctions.commit(offerId, { value: price });

            let exchangeId = ++exchange.id;

            // Protocol should raised dispute automatically if transfer twin failed
            const tx = await testProtocolFunctions.redeem(exchangeId);
            await expect(tx)
              .to.emit(disputeHandler, "DisputeRaised")
              .withArgs(exchangeId, ++exchange.buyerId, seller.id, await testProtocolFunctions.getAddress());

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(
                twin20.id,
                twin20.tokenAddress,
                exchangeId,
                "0",
                twin20.amount,
                await testProtocolFunctions.getAddress()
              );

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(
                twin721.id,
                twin721.tokenAddress,
                exchangeId,
                "10",
                "0",
                await testProtocolFunctions.getAddress()
              );

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(
                twin1155.id,
                twin1155.tokenAddress,
                exchangeId,
                twin1155.tokenId,
                twin1155.amount,
                await testProtocolFunctions.getAddress()
              );

            // Get the exchange state
            [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

            // It should match ExchangeState.Revoked
            assert.equal(response, ExchangeState.Disputed, "Exchange state is incorrect");
          });

          it("if twin transfers consume all available gas, redeem still succeeds, but exchange is revoked", async function () {
            const [foreign20gt, foreign721gt, foreign1155gt] = await deployMockTokens([
              "Foreign20GasTheft",
              "Foreign721GasTheft",
              "Foreign1155GasTheft",
            ]);

            // Approve the protocol diamond to transfer seller's tokens
            await foreign20gt.connect(assistant).approve(protocolDiamondAddress, "100");
            await foreign721gt.connect(assistant).setApprovalForAll(protocolDiamondAddress, true);
            await foreign1155gt.connect(assistant).setApprovalForAll(protocolDiamondAddress, true);

            // Create twins that will consume all available gas
            twin20 = mockTwin(await foreign20gt.getAddress());
            twin20.amount = "1";
            twin20.supplyAvailable = "100";
            twin20.id = "4";

            twin721 = mockTwin(await foreign721gt.getAddress(), TokenType.NonFungibleToken);
            twin721.amount = "0";
            twin721.supplyAvailable = "10";
            twin721.id = "5";

            twin1155 = mockTwin(await foreign1155gt.getAddress(), TokenType.MultiToken);
            twin1155.amount = "1";
            twin1155.tokenId = "1";
            twin1155.supplyAvailable = "10";
            twin1155.id = "6";

            await twinHandler.connect(assistant).createTwin(twin20.toStruct());
            await twinHandler.connect(assistant).createTwin(twin721.toStruct());
            await twinHandler.connect(assistant).createTwin(twin1155.toStruct());

            // Create a new offer and bundle
            await offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);
            bundle = new Bundle("2", seller.id, [`${++offerId}`], [twin20.id, twin721.id, twin1155.id]);
            await bundleHandler.connect(assistant).createBundle(bundle.toStruct());

            // Commit to offer
            const buyerAddress = await buyer.getAddress();
            await exchangeHandler.connect(buyer).commitToOffer(buyerAddress, offerId, { value: price });

            exchange.id = Number(exchange.id) + 1;

            // Redeem the voucher
            tx = await exchangeHandler.connect(buyer).redeemVoucher(exchange.id, { gasLimit: 1000000 }); // limit gas to speed up test

            // Voucher should be revoked and both transfers should fail
            await expect(tx)
              .to.emit(disputeHandler, "DisputeRaised")
              .withArgs(exchange.id, exchange.buyerId, seller.id, buyerAddress);

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(twin20.id, twin20.tokenAddress, exchange.id, twin20.tokenId, twin20.amount, buyerAddress);

            let tokenId = "9";
            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(twin721.id, twin721.tokenAddress, exchange.id, tokenId, twin721.amount, buyerAddress);

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(
                twin1155.id,
                twin1155.tokenAddress,
                exchange.id,
                twin1155.tokenId,
                twin1155.amount,
                buyerAddress
              );

            // Get the exchange state
            [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

            // It should match ExchangeState.Disputed
            assert.equal(response, ExchangeState.Disputed, "Exchange state is incorrect");
          });
        });
      });
    });

    context("👉 extendVoucher()", async function () {
      beforeEach(async function () {
        // Commit to offer
        tx = await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await provider.getBlock(blockNumber);

        // Update the committed date in the expected exchange struct with the block timestamp of the tx
        voucher.committedDate = block.timestamp.toString();

        // Update the validUntilDate date in the expected exchange struct
        voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

        // New expiry date for extensions
        validUntilDate = BigInt(voucher.validUntilDate) + oneMonth.toString();
      });

      it("should emit an VoucherExtended event when seller's assistant calls", async function () {
        // Extend the voucher, expecting event
        await expect(exchangeHandler.connect(assistant).extendVoucher(exchange.id, validUntilDate))
          .to.emit(exchangeHandler, "VoucherExtended")
          .withArgs(offerId, exchange.id, validUntilDate, await assistant.getAddress());
      });

      it("should update state", async function () {
        // Extend the voucher
        await exchangeHandler.connect(assistant).extendVoucher(exchange.id, validUntilDate);

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
          await expect(exchangeHandler.connect(assistant).extendVoucher(exchange.id, validUntilDate)).to.revertedWith(
            RevertReasons.REGION_PAUSED
          );
        });

        it("exchange id is invalid", async function () {
          // An invalid exchange id
          exchangeId = "666";

          // Attempt to extend voucher, expecting revert
          await expect(exchangeHandler.connect(assistant).extendVoucher(exchangeId, validUntilDate)).to.revertedWith(
            RevertReasons.NO_SUCH_EXCHANGE
          );
        });

        it("exchange is not in committed state", async function () {
          // Cancel the voucher
          await exchangeHandler.connect(buyer).cancelVoucher(exchange.id);

          // Attempt to extend voucher, expecting revert
          await expect(exchangeHandler.connect(assistant).extendVoucher(exchange.id, validUntilDate)).to.revertedWith(
            RevertReasons.INVALID_STATE
          );
        });

        it("caller is not seller's assistant", async function () {
          // Attempt to extend voucher, expecting revert
          await expect(exchangeHandler.connect(rando).extendVoucher(exchange.id, validUntilDate)).to.revertedWith(
            RevertReasons.NOT_ASSISTANT
          );
        });

        it("new date is not later than the current one", async function () {
          // New expiry date is older than current
          validUntilDate = BigInt(voucher.validUntilDate) - oneMonth;

          // Attempt to extend voucher, expecting revert
          await expect(exchangeHandler.connect(assistant).extendVoucher(exchange.id, validUntilDate)).to.revertedWith(
            RevertReasons.VOUCHER_EXTENSION_NOT_VALID
          );
        });
      });
    });

    context("👉 onVoucherTransferred()", async function () {
      beforeEach(async function () {
        // Commit to offer, retrieving the event
        await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

        // Client used for tests
        bosonVoucherCloneAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          admin.address,
          ""
        );
        bosonVoucherClone = await getContractAt("IBosonVoucher", bosonVoucherCloneAddress);

        tokenId = deriveTokenId(offerId, exchange.id);
      });

      it("should emit an VoucherTransferred event when called by CLIENT-roled address", async function () {
        // Get the next buyer id
        nextAccountId = await accountHandler.connect(rando).getNextAccountId();

        // Call onVoucherTransferred, expecting event
        await expect(
          bosonVoucherClone.connect(buyer).transferFrom(await buyer.getAddress(), await newOwner.getAddress(), tokenId)
        )
          .to.emit(exchangeHandler, "VoucherTransferred")
          .withArgs(offerId, exchange.id, nextAccountId, await bosonVoucherClone.getAddress());
      });

      it("should update exchange when new buyer (with existing, active account) is passed", async function () {
        // Get the next buyer id
        nextAccountId = await accountHandler.connect(rando).getNextAccountId();

        // Create a buyer account for the new owner
        await accountHandler.connect(newOwner).createBuyer(mockBuyer(await newOwner.getAddress()));

        // Call onVoucherTransferred
        await bosonVoucherClone
          .connect(buyer)
          .transferFrom(await buyer.getAddress(), await newOwner.getAddress(), tokenId);

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
        await bosonVoucherClone
          .connect(buyer)
          .transferFrom(await buyer.getAddress(), await newOwner.getAddress(), tokenId);

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
          bosonVoucherClone.connect(buyer).transferFrom(await buyer.getAddress(), await newOwner.getAddress(), tokenId)
        ).to.emit(exchangeHandler, "VoucherTransferred");
      });

      it("should not be triggered when a voucher is issued", async function () {
        // Get the next exchange id
        nextExchangeId = await exchangeHandler.getNextExchangeId();

        // Create a buyer account
        await accountHandler.connect(newOwner).createBuyer(mockBuyer(await newOwner.getAddress()));

        // Grant PROTOCOL role to EOA address for test
        await accessController.grantRole(Role.PROTOCOL, await rando.getAddress());

        // Issue voucher, expecting no event
        await expect(
          bosonVoucherClone.connect(rando).issueVoucher(nextExchangeId, await buyer.getAddress())
        ).to.not.emit(exchangeHandler, "VoucherTransferred");
      });

      it("should not be triggered when a voucher is burned", async function () {
        // Grant PROTOCOL role to EOA address for test
        await accessController.grantRole(Role.PROTOCOL, await rando.getAddress());

        // Burn voucher, expecting no event
        await expect(bosonVoucherClone.connect(rando).burnVoucher(tokenId)).to.not.emit(
          exchangeHandler,
          "VoucherTransferred"
        );
      });

      it("Should not be triggered when from and to addresses are the same", async function () {
        // Transfer voucher, expecting event
        await expect(
          bosonVoucherClone.connect(buyer).transferFrom(await buyer.getAddress(), await buyer.getAddress(), tokenId)
        ).to.not.emit(exchangeHandler, "VoucherTransferred");
      });

      it("Should not be triggered when first transfer of preminted voucher happens", async function () {
        // Transfer voucher, expecting event
        await expect(
          bosonVoucherClone.connect(buyer).transferFrom(await buyer.getAddress(), await buyer.getAddress(), tokenId)
        ).to.not.emit(exchangeHandler, "VoucherTransferred");
      });

      it("should work with additional collections", async function () {
        // Create a new collection
        const externalId = `Brand1`;
        await accountHandler.connect(assistant).createNewCollection(externalId, voucherInitValues);

        offer.collectionIndex = 1;
        offer.id = await offerHandler.getNextOfferId();
        exchange.id = await exchangeHandler.getNextExchangeId();
        bosonVoucherCloneAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          admin.address,
          externalId
        );
        bosonVoucherClone = await getContractAt("IBosonVoucher", bosonVoucherCloneAddress);
        const tokenId = deriveTokenId(offer.id, exchange.id);

        // Create the offer
        await offerHandler
          .connect(assistant)
          .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

        // Commit to offer, creating a new exchange
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offer.id, { value: price });

        // Get the next buyer id
        nextAccountId = await accountHandler.connect(rando).getNextAccountId();

        // Call onVoucherTransferred, expecting event
        await expect(bosonVoucherClone.connect(buyer).transferFrom(buyer.address, newOwner.address, tokenId))
          .to.emit(exchangeHandler, "VoucherTransferred")
          .withArgs(offer.id, exchange.id, nextAccountId, await bosonVoucherClone.getAddress());
      });

      context("💔 Revert Reasons", async function () {
        it("The buyers region of protocol is paused", async function () {
          // Pause the buyers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Buyers]);

          // Attempt to create a buyer, expecting revert
          await expect(
            bosonVoucherClone
              .connect(buyer)
              .transferFrom(await buyer.getAddress(), await newOwner.getAddress(), tokenId)
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("Caller is not a clone address", async function () {
          // Attempt to call onVoucherTransferred, expecting revert
          await expect(
            exchangeHandler.connect(rando).onVoucherTransferred(exchange.id, await newOwner.getAddress())
          ).to.revertedWith(RevertReasons.ACCESS_DENIED);
        });

        it("Caller is not a clone address associated with the seller", async function () {
          // Create a new seller to get new clone
          seller = mockSeller(
            await rando.getAddress(),
            await rando.getAddress(),
            ZeroAddress,
            await rando.getAddress()
          );
          expect(seller.isValid()).is.true;

          await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);
          expectedCloneAddress = calculateCloneAddress(
            await accountHandler.getAddress(),
            beaconProxyAddress,
            rando.address,
            ""
          );
          const bosonVoucherClone2 = await getContractAt("IBosonVoucher", expectedCloneAddress);

          // For the sake of test, mint token on bv2 with the id of token on bv1
          // Temporarily grant PROTOCOL role to deployer account
          await accessController.grantRole(Role.PROTOCOL, await deployer.getAddress());

          const newBuyer = mockBuyer(await buyer.getAddress());
          newBuyer.id = buyerId;
          await bosonVoucherClone2.issueVoucher(exchange.id, newBuyer.wallet);

          // Attempt to call onVoucherTransferred, expecting revert
          await expect(
            bosonVoucherClone2
              .connect(buyer)
              .transferFrom(await buyer.getAddress(), await newOwner.getAddress(), exchange.id)
          ).to.revertedWith(RevertReasons.ACCESS_DENIED);
        });

        it("exchange id is invalid", async function () {
          // An invalid exchange id
          exchangeId = "666";

          // Attempt to call onVoucherTransferred, expecting revert
          await expect(
            exchangeHandler.connect(fauxClient).onVoucherTransferred(exchangeId, await newOwner.getAddress())
          ).to.revertedWith(RevertReasons.NO_SUCH_EXCHANGE);
        });

        it("exchange is not in committed state", async function () {
          // Revoke the voucher
          await exchangeHandler.connect(assistant).revokeVoucher(exchange.id);

          // Attempt to call onVoucherTransferred, expecting revert
          await expect(
            exchangeHandler.connect(fauxClient).onVoucherTransferred(exchangeId, await newOwner.getAddress())
          ).to.revertedWith(RevertReasons.INVALID_STATE);
        });

        it("Voucher has expired", async function () {
          // Set time forward past the voucher's validUntilDate
          await setNextBlockTimestamp(Number(voucherRedeemableFrom) + Number(voucherValid) + Number(oneWeek));

          // Attempt to call onVoucherTransferred, expecting revert
          await expect(
            exchangeHandler.connect(fauxClient).onVoucherTransferred(exchangeId, await newOwner.getAddress())
          ).to.revertedWith(RevertReasons.VOUCHER_HAS_EXPIRED);
        });
      });
    });

    context("👉 isExchangeFinalized()", async function () {
      beforeEach(async function () {
        // Commit to offer, creating a new exchange
        await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });
      });

      context("👍 undisputed exchange", async function () {
        it("should return false if exchange does not exists", async function () {
          let exchangeId = "100";
          // Invalid exchange id, ask if exchange is finalized
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
          blockNumber = await provider.getBlockNumber();
          block = await provider.getBlock(blockNumber);

          // Set time forward to run out the dispute period
          newTime = Number(BigInt(voucherRedeemableFrom) + BigInt(disputePeriod) + 1n);
          await setNextBlockTimestamp(newTime);

          // Complete exchange
          await exchangeHandler.connect(assistant).completeExchange(exchange.id);

          // Now in Completed state, ask if exchange is finalized
          [exists, response] = await exchangeHandler.connect(rando).isExchangeFinalized(exchange.id);

          // It should be finalized
          assert.equal(response, true, "Incorrectly reports unfinalized state");
        });

        it("should return true if exchange is in Revoked state", async function () {
          // Revoke voucher
          await exchangeHandler.connect(assistant).revokeVoucher(exchange.id);

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
            buyer, // Assistant is the caller, seller should be the signer.
            customSignatureType,
            "Resolution",
            message,
            await disputeHandler.getAddress()
          );

          // Resolve Dispute
          await disputeHandler.connect(assistant).resolveDispute(exchange.id, buyerPercentBasisPoints, r, s, v);

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
          await disputeHandler.connect(assistantDR).decideDispute(exchange.id, "1111");

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
          block = await provider.getBlock(blockNumber);
          const escalatedDate = block.timestamp.toString();

          await setNextBlockTimestamp(Number(escalatedDate) + Number(disputeResolver.escalationResponsePeriod) + 1);

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
        await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

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
        await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });
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
        await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });
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
        tx = await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });

        // Decrease offer quantityAvailable
        offer.quantityAvailable = "9";

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await provider.getBlock(blockNumber);

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
        block = await provider.getBlock(blockNumber);

        // Update the redeemedDate date in the expected exchange struct
        voucher.redeemedDate = block.timestamp.toString();
      });

      it("Should return the correct receipt", async function () {
        // Complete the exchange
        const tx = await exchangeHandler.connect(buyer).completeExchange(exchange.id);

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await provider.getBlock(blockNumber);

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
        let protocolFeePercentage = "0";
        await configHandler.connect(deployer).setProtocolFeePercentage(protocolFeePercentage);
        offerFees.protocolFee = "0";

        // Create a new offer with params price, sellerDeposit and disputeResolverId = 0
        const mo = await mockOffer();
        const { offerDates, offerDurations } = mo;
        offer = mo.offer;
        offer.id = offerId = "2";
        offer.price = offer.buyerCancelPenalty = offer.sellerDeposit = "0";
        // set a dummy token address otherwise protocol token (zero address) and offer token will be the same and we will get the error AGENT_FEE_AMOUNT_TOO_HIGH
        offer.exchangeToken = await foreign20.getAddress();
        disputeResolverId = agentId = "0";

        // Update voucherRedeemableFrom
        voucherRedeemableFrom = offerDates.voucherRedeemableFrom;

        // Check if domains are valid
        expect(offer.isValid()).is.true;
        expect(offerDates.isValid()).is.true;
        expect(offerDurations.isValid()).is.true;

        // Create the offer
        await offerHandler
          .connect(assistant)
          .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

        // Commit to offer
        tx = await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId);

        // Decrease offer quantityAvailable
        offer.quantityAvailable = "0";
        // Increase exchange.id as is a new commitToOffer
        exchange.id = "2";

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await provider.getBlock(blockNumber);

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
        block = await provider.getBlock(blockNumber);

        // Update the redeemedDate date in the expected exchange struct
        voucher.redeemedDate = block.timestamp.toString();

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await provider.getBlock(blockNumber);

        // Update the redeemedDate date in the expected exchange struct
        voucher.redeemedDate = block.timestamp.toString();

        // Complete the exchange
        tx = await exchangeHandler.connect(buyer).completeExchange(exchange.id);

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await provider.getBlock(blockNumber);

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
          block = await provider.getBlock(blockNumber);

          disputedDate = block.timestamp.toString();
        });

        it("Receipt should contain dispute data if a dispute was raised for exchange", async function () {
          // Retract dispute
          const tx = await disputeHandler.connect(buyer).retractDispute(exchange.id);

          // Get the block timestamp of the confirmed tx
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);

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
          block = await provider.getBlock(blockNumber);

          const escalatedDate = block.timestamp.toString();

          // Retract dispute
          tx = await disputeHandler.connect(buyer).retractDispute(exchange.id);

          // Get the block timestamp of the confirmed tx
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);

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
          await foreign20.connect(assistant).mint(assistant.address, "500");
          await foreign721.connect(assistant).mint("1", "10");

          // Approve the protocol diamond to transfer seller's tokens
          await foreign20.connect(assistant).approve(protocolDiamondAddress, "3");
          await foreign721.connect(assistant).setApprovalForAll(protocolDiamondAddress, true);

          // Create an ERC20 twin
          twin20 = mockTwin(await foreign20.getAddress());
          twin20.amount = "3";
          expect(twin20.isValid()).is.true;

          await twinHandler.connect(assistant).createTwin(twin20.toStruct());

          // Create an ERC721 twin
          twin721 = mockTwin(await foreign721.getAddress(), TokenType.NonFungibleToken);
          twin721.amount = "0";
          twin721.supplyAvailable = "10";
          twin721.id = "2";
          twin721.tokenId = "1";
          expect(twin721.isValid()).is.true;

          await twinHandler.connect(assistant).createTwin(twin721.toStruct());

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
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);
        });

        it("Receipt should contain twin receipt data if offer was bundled with twin", async function () {
          // Create a new bundle
          bundle = new Bundle("1", seller.id, [offerId], [twin20.id]);
          expect(bundle.isValid()).is.true;
          await bundleHandler.connect(assistant).createBundle(bundle.toStruct());

          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // Commit to offer
          let tx = await exchangeHandler
            .connect(buyer)
            .commitToOffer(await buyer.getAddress(), offerId, { value: price });

          // Get the block timestamp of the confirmed tx
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);

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
          block = await provider.getBlock(blockNumber);

          // Update the redeemedDate date in the expected exchange struct
          voucher.redeemedDate = block.timestamp.toString();

          // Complete the exchange
          tx = await exchangeHandler.connect(buyer).completeExchange(exchange.id);

          // Get the block timestamp of the confirmed tx
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);

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
          await bundleHandler.connect(assistant).createBundle(bundle.toStruct());

          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // Commit to offer
          let tx = await exchangeHandler
            .connect(buyer)
            .commitToOffer(await buyer.getAddress(), offerId, { value: price });

          // Get the block timestamp of the confirmed tx
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);

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
          block = await provider.getBlock(blockNumber);

          // Update the redeemedDate date in the expected exchange struct
          voucher.redeemedDate = block.timestamp.toString();

          // Complete the exchange
          tx = await exchangeHandler.connect(buyer).completeExchange(exchange.id);

          // Get the block timestamp of the confirmed tx
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);

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
            "10", // twin transfer order is descending
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
        condition = mockCondition({ tokenAddress: await foreign20.getAddress() });
        expect(condition.isValid()).to.be.true;

        // Create a new group
        group = new Group(groupId, seller.id, offerIds);
        expect(group.isValid()).is.true;
        await groupHandler.connect(assistant).createGroup(group, condition);

        // Mint enough tokens for the buyer
        await foreign20.connect(buyer).mint(await buyer.getAddress(), condition.threshold);

        // Commit to offer
        let tx = await exchangeHandler
          .connect(buyer)
          .commitToConditionalOffer(await buyer.getAddress(), offerId, 0, { value: price });

        // Decrease offer quantityAvailable
        offer.quantityAvailable = "9";

        // Increase expected id and offerId in exchange struct
        exchange.id = "2";
        exchange.offerId = "2";

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await provider.getBlock(blockNumber);

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
        block = await provider.getBlock(blockNumber);

        // Update the redeemedDate date in the expected exchange struct
        voucher.redeemedDate = block.timestamp.toString();

        // Complete the exchange
        tx = await exchangeHandler.connect(buyer).completeExchange(exchange.id);

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await provider.getBlock(blockNumber);

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
        agent = mockAgent(await rando.getAddress());
        // Set new agentId
        agentId = agent.id = "4";
        expect(agent.isValid()).is.true;

        // Create an agent
        await accountHandler.connect(rando).createAgent(agent);

        // Update agentFee
        const agentFee = ((BigInt(offer.price) * BigInt(agent.feePercentage)) / 10000n).toString();
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
        await offerHandler
          .connect(assistant)
          .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

        // Commit to offer
        let tx = await exchangeHandler
          .connect(buyer)
          .commitToOffer(await buyer.getAddress(), offerId, { value: price });

        // Decrease offer quantityAvailable
        offer.quantityAvailable = "0";

        // Increase expected id and offerId in exchange struct
        exchange.id = "2";
        exchange.offerId = "2";

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await provider.getBlock(blockNumber);

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
        block = await provider.getBlock(blockNumber);

        // Update the redeemedDate date in the expected exchange struct
        voucher.redeemedDate = block.timestamp.toString();

        // Complete the exchange
        tx = await exchangeHandler.connect(buyer).completeExchange(exchange.id);

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await provider.getBlock(blockNumber);

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
