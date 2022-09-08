const hre = require("hardhat");
const ethers = hre.ethers;
const { assert, expect } = require("chai");
const { gasLimit } = require("../../environments");

const Role = require("../../scripts/domain/Role");
const Seller = require("../../scripts/domain/Seller");
const Offer = require("../../scripts/domain/Offer");
const OfferDates = require("../../scripts/domain/OfferDates");
const OfferDurations = require("../../scripts/domain/OfferDurations");
const Group = require("../../scripts/domain/Group");
const Condition = require("../../scripts/domain/Condition");
const EvaluationMethod = require("../../scripts/domain/EvaluationMethod");
const Twin = require("../../scripts/domain/Twin");
const Bundle = require("../../scripts/domain/Bundle");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const DisputeResolutionTerms = require("../../scripts/domain/DisputeResolutionTerms");
const TokenType = require("../../scripts/domain/TokenType");
const AuthToken = require("../../scripts/domain/AuthToken");
const AuthTokenType = require("../../scripts/domain/AuthTokenType");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
const { getEvent, applyPercentage, calculateContractAddress } = require("../../scripts/util/test-utils.js");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const { oneWeek, oneMonth, VOUCHER_NAME, VOUCHER_SYMBOL } = require("../utils/constants");
const {
  mockTwin,
  mockOffer,
  mockDisputeResolver,
  mockSeller,
  mockVoucherInitValues,
  mockAuthToken,
  mockAgent,
  mockCondition,
  accountId,
} = require("../utils/mock");

/**
 *  Test the Boson Orchestration Handler interface
 */
describe("IBosonOrchestrationHandler", function () {
  // Common vars
  let InterfaceIds;
  let deployer,
    pauser,
    rando,
    operator,
    admin,
    clerk,
    treasury,
    other1,
    other2,
    other3,
    operatorDR,
    adminDR,
    clerkDR,
    treasuryDR,
    protocolAdmin;
  let erc165,
    protocolDiamond,
    accessController,
    accountHandler,
    offerHandler,
    exchangeHandler,
    groupHandler,
    twinHandler,
    bundleHandler,
    orchestrationHandler,
    configHandler,
    pauseHandler,
    offerStruct,
    key,
    value;
  let offer, nextOfferId, support, exists;
  let seller, sellerStruct;
  let disputeResolver, disputeResolverFees;
  let offerDates, offerDatesStruct;
  let offerFees, offerFeesStruct, agentFee;
  let offerDurations, offerDurationsStruct;
  let protocolFeePercentage, protocolFeeFlatBoson, buyerEscalationDepositPercentage;
  let group, groupStruct, nextGroupId, conditionStruct;
  let offerIds, condition;
  let twin, twinStruct, twinIds, nextTwinId;
  let bundle, bundleStruct, bundleId, nextBundleId;
  let bosonToken;
  let foreign721, foreign1155, fallbackError;
  let disputeResolutionTerms, disputeResolutionTermsStruct;
  let DRFeeNative, DRFeeToken;
  let voucherInitValues, contractURI;
  let expectedCloneAddress, bosonVoucher;
  let tx;
  let authToken, authTokenStruct, emptyAuthToken, emptyAuthTokenStruct;
  let agent, agentId;
  let sellerAllowList, allowedSellersToAdd;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();
  });

  beforeEach(async function () {
    // Make accounts available
    [
      deployer,
      pauser,
      operator,
      admin,
      clerk,
      treasury,
      rando,
      other1,
      other2,
      other3,
      operatorDR,
      adminDR,
      clerkDR,
      treasuryDR,
      protocolAdmin,
    ] = await ethers.getSigners();

    // Deploy the Protocol Diamond
    [protocolDiamond, , , , accessController] = await deployProtocolDiamond();

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    //Grant ADMIN role to and address that can call restricted functions.
    //This ADMIN role is a protocol-level role. It is not the same an admin address for an account type
    await accessController.grantRole(Role.ADMIN, protocolAdmin.address);

    // Temporarily grant PAUSER role to pauser account
    await accessController.grantRole(Role.PAUSER, pauser.address);

    // Cut the protocol handler facets into the Diamond
    await deployProtocolHandlerFacets(protocolDiamond, [
      "SellerHandlerFacet",
      "AgentHandlerFacet",
      "DisputeResolverHandlerFacet",
      "ExchangeHandlerFacet",
      "OfferHandlerFacet",
      "GroupHandlerFacet",
      "TwinHandlerFacet",
      "BundleHandlerFacet",
      "OrchestrationHandlerFacet",
      "PauseHandlerFacet",
      "AccountHandlerFacet",
    ]);

    // Deploy the mock tokens
    [bosonToken, foreign721, foreign1155, fallbackError] = await deployMockTokens(gasLimit);

    // set protocolFees
    protocolFeePercentage = "200"; // 2 %
    protocolFeeFlatBoson = ethers.utils.parseUnits("0.01", "ether").toString();
    buyerEscalationDepositPercentage = "1000"; // 10%

    // Deploy the Protocol client implementation/proxy pairs (currently just the Boson Voucher)
    const protocolClientArgs = [accessController.address, protocolDiamond.address];
    const [, [beacon], [proxy]] = await deployProtocolClients(protocolClientArgs, gasLimit);

    // Add config Handler, so offer id starts at 1
    const protocolConfig = [
      // Protocol addresses
      {
        treasury: ethers.constants.AddressZero,
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
        maxRoyaltyPecentage: 1000, //10%
        maxResolutionPeriod: oneMonth,
        minFulfillmentPeriod: oneWeek,
      },
      // Protocol fees
      {
        percentage: protocolFeePercentage,
        flatBoson: protocolFeeFlatBoson,
      },
      buyerEscalationDepositPercentage,
    ];
    await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);

    // Cast Diamond to IERC165
    erc165 = await ethers.getContractAt("ERC165Facet", protocolDiamond.address);

    // Cast Diamond to IBosonAccountHandler. Use this interface to call all individual account handlers
    accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);

    // Cast Diamond to IBosonExchangeHandler
    exchangeHandler = await ethers.getContractAt("IBosonExchangeHandler", protocolDiamond.address);

    // Cast Diamond to IBosonOfferHandler
    offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);

    // Cast Diamond to IBosonGroupHandler
    groupHandler = await ethers.getContractAt("IBosonGroupHandler", protocolDiamond.address);

    // Cast Diamond to IBosonTwinHandler
    twinHandler = await ethers.getContractAt("IBosonTwinHandler", protocolDiamond.address);

    // Cast Diamond to IBosonBundleHandler
    bundleHandler = await ethers.getContractAt("IBosonBundleHandler", protocolDiamond.address);

    // Cast Diamond to IBosonOrchestrationHandler
    orchestrationHandler = await ethers.getContractAt("IBosonOrchestrationHandler", protocolDiamond.address);

    // Cast Diamond to IBosonConfigHandler
    configHandler = await ethers.getContractAt("IBosonConfigHandler", protocolDiamond.address);

    // Cast Diamond to IBosonPauseHandler
    pauseHandler = await ethers.getContractAt("IBosonPauseHandler", protocolDiamond.address);
  });

  // Interface support (ERC-156 provided by ProtocolDiamond, others by deployed facets)
  context("📋 Interfaces", async function () {
    context("👉 supportsInterface()", async function () {
      it("should indicate support for IBosonOrchestrationHandler interface", async function () {
        // Current interfaceId for IBosonOrchestrationHandler
        support = await erc165.supportsInterface(InterfaceIds.IBosonOrchestrationHandler);

        // Test
        expect(support, "IBosonOrchestrationHandler interface not supported").is.true;
      });
    });
  });

  // All supported methods - single offer
  context("📋 Orchestration Handler Methods", async function () {
    beforeEach(async function () {
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
      DRFeeNative = "100";
      DRFeeToken = "200";
      disputeResolverFees = [
        new DisputeResolverFee(ethers.constants.AddressZero, "Native", DRFeeNative),
        new DisputeResolverFee(bosonToken.address, "Boson", DRFeeToken),
      ];

      // Make empty seller list, so every seller is allowed
      sellerAllowList = [];

      // Register and activate the dispute resolver
      await accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
      await accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id);

      // Create a valid seller, then set fields in tests directly
      seller = mockSeller(operator.address, admin.address, clerk.address, treasury.address);
      expect(seller.isValid()).is.true;

      // How that seller looks as a returned struct
      sellerStruct = seller.toStruct();

      // VoucherInitValues
      contractURI = `https://ipfs.io/ipfs/QmW2WQi7j6c7UgJTarActp7tDNikE4B2qXtFCfLPdsgaTQ`;
      voucherInitValues = mockVoucherInitValues();
      expect(voucherInitValues.isValid()).is.true;

      // AuthTokens
      emptyAuthToken = mockAuthToken();
      expect(emptyAuthToken.isValid()).is.true;
      emptyAuthTokenStruct = emptyAuthToken.toStruct();

      authToken = new AuthToken("8400", AuthTokenType.Lens);
      expect(authToken.isValid()).is.true;
      authTokenStruct = authToken.toStruct();

      // The first offer id
      nextOfferId = "1";

      // Mock offer, offerDates and offerDurations
      ({ offer, offerDates, offerDurations, offerFees } = await mockOffer());
      offer.sellerId = seller.id;
      offerDates.validFrom = ethers.BigNumber.from(Date.now()).toString();
      offerDates.validUntil = ethers.BigNumber.from(Date.now() + oneMonth * 6).toString();

      // Check if domains are valid
      expect(offer.isValid()).is.true;
      expect(offerDates.isValid()).is.true;
      expect(offerDurations.isValid()).is.true;

      // Set domains transformed into struct
      offerStruct = offer.toStruct();
      offerDatesStruct = offerDates.toStruct();
      offerDurationsStruct = offerDurations.toStruct();

      // Set despute resolution terms
      disputeResolutionTerms = new DisputeResolutionTerms(
        disputeResolver.id,
        disputeResolver.escalationResponsePeriod,
        DRFeeNative,
        applyPercentage(DRFeeNative, buyerEscalationDepositPercentage)
      );
      disputeResolutionTermsStruct = disputeResolutionTerms.toStruct();

      // Offer fees
      offerFeesStruct = offerFees.toStruct();

      // Set agent id as zero as it is optional for create Offer.
      agentId = "0";
    });

    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    context("👉 createSellerAndOffer()", async function () {
      it("should emit a SellerCreated and OfferCreated events with empty auth token", async function () {
        // Create a seller and an offer, testing for the event
        tx = await orchestrationHandler
          .connect(operator)
          .createSellerAndOffer(
            seller,
            offer,
            offerDates,
            offerDurations,
            disputeResolver.id,
            emptyAuthToken,
            voucherInitValues,
            agentId
          );

        expectedCloneAddress = calculateContractAddress(orchestrationHandler.address, "1");

        await expect(tx)
          .to.emit(orchestrationHandler, "SellerCreated")
          .withArgs(seller.id, sellerStruct, expectedCloneAddress, emptyAuthTokenStruct, operator.address);
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            offer.sellerId,
            offerStruct,
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );

        // Voucher clone contract
        bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);

        await expect(tx).to.emit(bosonVoucher, "ContractURIChanged").withArgs(contractURI);
        await expect(tx)
          .to.emit(bosonVoucher, "RoyaltyPercentageChanged")
          .withArgs(voucherInitValues.royaltyPercentage);

        bosonVoucher = await ethers.getContractAt("OwnableUpgradeable", expectedCloneAddress);

        await expect(tx)
          .to.emit(bosonVoucher, "OwnershipTransferred")
          .withArgs(ethers.constants.AddressZero, operator.address);
      });

      it("should emit a SellerCreated and OfferCreated events with auth token", async function () {
        seller.admin = ethers.constants.AddressZero;
        sellerStruct = seller.toStruct();

        // Create a seller and an offer, testing for the event
        tx = await orchestrationHandler
          .connect(operator)
          .createSellerAndOffer(
            seller,
            offer,
            offerDates,
            offerDurations,
            disputeResolver.id,
            authToken,
            voucherInitValues,
            agentId
          );

        expectedCloneAddress = calculateContractAddress(orchestrationHandler.address, "1");

        await expect(tx)
          .to.emit(orchestrationHandler, "SellerCreated")
          .withArgs(seller.id, sellerStruct, expectedCloneAddress, authTokenStruct, operator.address);

        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            offer.sellerId,
            offerStruct,
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );

        // Voucher clone contract
        bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);

        await expect(tx).to.emit(bosonVoucher, "ContractURIChanged").withArgs(contractURI);
        await expect(tx)
          .to.emit(bosonVoucher, "RoyaltyPercentageChanged")
          .withArgs(voucherInitValues.royaltyPercentage);

        bosonVoucher = await ethers.getContractAt("OwnableUpgradeable", expectedCloneAddress);

        await expect(tx)
          .to.emit(bosonVoucher, "OwnershipTransferred")
          .withArgs(ethers.constants.AddressZero, operator.address);
      });

      it("should update state", async function () {
        seller.admin = ethers.constants.AddressZero;
        sellerStruct = seller.toStruct();

        // Create a seller and an offer
        await orchestrationHandler
          .connect(operator)
          .createSellerAndOffer(
            seller,
            offer,
            offerDates,
            offerDurations,
            disputeResolver.id,
            authToken,
            voucherInitValues,
            agentId
          );

        // Get the seller as a struct
        [, sellerStruct, authTokenStruct] = await accountHandler.connect(rando).getSeller(seller.id);

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);
        let returnedAuthToken = AuthToken.fromStruct(authTokenStruct);

        // Returned values should match the input in createSellerAndOffer
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }

        // Returned auth token values should match the input in createSellerAndOffer
        for ([key, value] of Object.entries(authToken)) {
          expect(JSON.stringify(returnedAuthToken[key]) === JSON.stringify(value)).is.true;
        }

        // Get the offer as a struct
        [, offerStruct, offerDatesStruct, offerDurationsStruct, disputeResolutionTermsStruct] = await offerHandler
          .connect(rando)
          .getOffer(offer.id);

        // Parse into entities
        let returnedOffer = Offer.fromStruct(offerStruct);
        let returnedOfferDates = OfferDates.fromStruct(offerDatesStruct);
        let returnedOfferDurations = OfferDurations.fromStruct(offerDurationsStruct);
        let returnedDisputeResolutionTermsStruct = DisputeResolutionTerms.fromStruct(disputeResolutionTermsStruct);

        // Returned values should match the input in createSellerAndOffer
        for ([key, value] of Object.entries(offer)) {
          expect(JSON.stringify(returnedOffer[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDates)) {
          expect(JSON.stringify(returnedOfferDates[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDurations)) {
          expect(JSON.stringify(returnedOfferDurations[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(disputeResolutionTerms)) {
          expect(JSON.stringify(returnedDisputeResolutionTermsStruct[key]) === JSON.stringify(value)).is.true;
        }

        // Voucher clone contract
        expectedCloneAddress = calculateContractAddress(orchestrationHandler.address, "1");
        bosonVoucher = await ethers.getContractAt("OwnableUpgradeable", expectedCloneAddress);

        expect(await bosonVoucher.owner()).to.equal(operator.address, "Wrong voucher clone owner");

        bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);
        expect(await bosonVoucher.contractURI()).to.equal(contractURI, "Wrong contract URI");
        expect(await bosonVoucher.name()).to.equal(VOUCHER_NAME + " " + seller.id, "Wrong voucher client name");
        expect(await bosonVoucher.symbol()).to.equal(VOUCHER_SYMBOL + "_" + seller.id, "Wrong voucher client symbol");
      });

      it("should update state when voucherInitValues has zero royaltyPercentage and exchangeId does not exist", async function () {
        seller.admin = ethers.constants.AddressZero;

        // ERC2981 Royalty fee is 0%
        voucherInitValues.royaltyPercentage = "0"; //0%
        expect(voucherInitValues.isValid()).is.true;

        // Create a seller and an offer
        await orchestrationHandler
          .connect(operator)
          .createSellerAndOffer(
            seller,
            offer,
            offerDates,
            offerDurations,
            disputeResolver.id,
            authToken,
            voucherInitValues,
            agentId
          );

        expectedCloneAddress = calculateContractAddress(orchestrationHandler.address, "1");
        bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);
        expect(await bosonVoucher.contractURI()).to.equal(contractURI, "Wrong contract URI");
        expect(await bosonVoucher.name()).to.equal(VOUCHER_NAME + " " + seller.id, "Wrong voucher client name");
        expect(await bosonVoucher.symbol()).to.equal(VOUCHER_SYMBOL + "_" + seller.id, "Wrong voucher client symbol");

        // Prepare random parameters
        let exchangeId = "1234"; // An exchange id that does not exist
        let offerPrice = "1234567"; // A random offer price

        //Exchange exists
        let exists;
        [exists] = await exchangeHandler.connect(rando).getExchangeState(exchangeId);
        expect(exists).to.be.false;

        // Get Royalty Information for Exchange id i.e. Voucher NFT token id
        let receiver, royaltyAmount;
        [receiver, royaltyAmount] = await bosonVoucher.connect(operator).royaltyInfo(exchangeId, offerPrice);

        // Expectations
        let expectedRecipient = ethers.constants.AddressZero; //expect zero address when exchange id does not exist
        let expectedRoyaltyAmount = "0"; // Zero Fee when exchange id does not exist

        assert.equal(receiver, expectedRecipient, "Recipient address is incorrect");
        assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");
      });

      it("should update state when voucherInitValues has non zero royaltyPercentage and exchangeId does not exist", async function () {
        seller.admin = ethers.constants.AddressZero;

        // ERC2981 Royalty fee is 10%
        voucherInitValues.royaltyPercentage = "1000"; //10%
        expect(voucherInitValues.isValid()).is.true;

        // Create a seller and an offer
        await orchestrationHandler
          .connect(operator)
          .createSellerAndOffer(
            seller,
            offer,
            offerDates,
            offerDurations,
            disputeResolver.id,
            authToken,
            voucherInitValues,
            agentId
          );

        expectedCloneAddress = calculateContractAddress(orchestrationHandler.address, "1");
        bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);
        expect(await bosonVoucher.contractURI()).to.equal(contractURI, "Wrong contract URI");
        expect(await bosonVoucher.name()).to.equal(VOUCHER_NAME + " " + seller.id, "Wrong voucher client name");
        expect(await bosonVoucher.symbol()).to.equal(VOUCHER_SYMBOL + "_" + seller.id, "Wrong voucher client symbol");

        // Prepare random parameters
        let exchangeId = "1234"; // An exchange id that does not exist
        let offerPrice = "1234567"; // A random offer price

        //Exchange exists
        let exists;
        [exists] = await exchangeHandler.connect(rando).getExchangeState(exchangeId);
        expect(exists).to.be.false;

        // Get Royalty Information for Exchange id i.e. Voucher NFT token id
        let receiver, royaltyAmount;
        [receiver, royaltyAmount] = await bosonVoucher.connect(operator).royaltyInfo(exchangeId, offerPrice);

        // Expectations
        let expectedRecipient = ethers.constants.AddressZero; //expect zero address when exchange id does not exist
        let expectedRoyaltyAmount = "0"; // Zero Fee when exchange id does not exist

        assert.equal(receiver, expectedRecipient, "Recipient address is incorrect");
        assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");
      });

      it("should ignore any provided id and assign the next available", async function () {
        const sellerId = seller.id;
        seller.id = "444";
        offer.id = "555";

        // Create a seller and an offer, testing for the event
        tx = await orchestrationHandler
          .connect(operator)
          .createSellerAndOffer(
            seller,
            offer,
            offerDates,
            offerDurations,
            disputeResolver.id,
            emptyAuthToken,
            voucherInitValues,
            agentId
          );

        await expect(tx)
          .to.emit(orchestrationHandler, "SellerCreated")
          .withArgs(
            sellerId,
            sellerStruct,
            calculateContractAddress(orchestrationHandler.address, "1"),
            emptyAuthTokenStruct,
            operator.address
          );

        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            offer.sellerId,
            offerStruct,
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );

        // wrong seller id should not exist
        [exists] = await accountHandler.connect(rando).getSeller(seller.id);
        expect(exists).to.be.false;

        // next seller id should exist
        [exists] = await accountHandler.connect(rando).getSeller(sellerId);
        expect(exists).to.be.true;

        // wrong offer id should not exist
        [exists] = await offerHandler.connect(rando).getOffer(offer.id);
        expect(exists).to.be.false;

        // next offer id should exist
        [exists] = await offerHandler.connect(rando).getOffer(nextOfferId);
        expect(exists).to.be.true;
      });

      it("should ignore any provided seller and assign seller id of msg.sender", async function () {
        // set some other seller.id
        offer.sellerId = "123";

        // Create a seller and an offer, testing for the event
        await expect(
          orchestrationHandler
            .connect(operator)
            .createSellerAndOffer(
              seller,
              offer,
              offerDates,
              offerDurations,
              disputeResolver.id,
              emptyAuthToken,
              voucherInitValues,
              agentId
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            offerStruct,
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );
      });

      it("should ignore any provided protocol fee and calculate the correct one", async function () {
        // set some protocole fee
        offer.protocolFee = "999";

        // Create a seller and an offer, testing for the event
        await expect(
          orchestrationHandler
            .connect(operator)
            .createSellerAndOffer(
              seller,
              offer,
              offerDates,
              offerDurations,
              disputeResolver.id,
              emptyAuthToken,
              voucherInitValues,
              agentId
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            offerStruct,
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );
      });

      it("If exchange token is $BOSON, fee should be flat boson fee", async function () {
        // Prepare an offer with $BOSON as exchange token
        offer.exchangeToken = bosonToken.address;
        disputeResolutionTermsStruct = new DisputeResolutionTerms(
          disputeResolver.id,
          disputeResolver.escalationResponsePeriod,
          DRFeeToken,
          applyPercentage(DRFeeToken, buyerEscalationDepositPercentage)
        ).toStruct();
        offerFees.protocolFee = protocolFeeFlatBoson;
        offerFeesStruct = offerFees.toStruct();

        // Create a seller and an offer, testing for the event
        await expect(
          orchestrationHandler
            .connect(operator)
            .createSellerAndOffer(
              seller,
              offer,
              offerDates,
              offerDurations,
              disputeResolver.id,
              emptyAuthToken,
              voucherInitValues,
              agentId
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            offer.toStruct(),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );
      });

      it("For absolute zero offers, dispute resolver can be unspecified", async function () {
        // Prepare an absolute zero offer
        offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = offerFees.protocolFee = "0";
        disputeResolver.id = "0";
        disputeResolutionTermsStruct = new DisputeResolutionTerms("0", "0", "0", "0").toStruct();
        offerFeesStruct = offerFees.toStruct();

        // Create a seller and an offer, testing for the event
        await expect(
          orchestrationHandler
            .connect(operator)
            .createSellerAndOffer(
              seller,
              offer,
              offerDates,
              offerDurations,
              disputeResolver.id,
              emptyAuthToken,
              voucherInitValues,
              agentId
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            offer.toStruct(),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );
      });

      it("Should allow creation of an offer with unlimited supply", async function () {
        // Prepare an offer with unlimited supply
        offer.quantityAvailable = ethers.constants.MaxUint256.toString();

        // Create a seller and an offer, testing for the event
        await expect(
          orchestrationHandler
            .connect(operator)
            .createSellerAndOffer(
              seller,
              offer,
              offerDates,
              offerDurations,
              disputeResolver.id,
              emptyAuthToken,
              voucherInitValues,
              agentId
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            offer.toStruct(),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );
      });

      it("Should use the correct dispute resolver fee", async function () {
        // Create an offer in native currency
        await expect(
          orchestrationHandler
            .connect(operator)
            .createSellerAndOffer(
              seller,
              offer,
              offerDates,
              offerDurations,
              disputeResolver.id,
              emptyAuthToken,
              voucherInitValues,
              agentId
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            offer.id,
            seller.id,
            offerStruct,
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );

        // create another offer, now with bosonToken as exchange token
        seller = mockSeller(rando.address, rando.address, rando.address, rando.address);
        contractURI = `https://ipfs.io/ipfs/QmW2WQi7j6c7UgJTarActp7tDNikE4B2qXtFCfLPdsgaTQ`;
        offer.exchangeToken = bosonToken.address;
        offer.id = "2";
        offer.sellerId = seller.id;
        disputeResolutionTermsStruct = new DisputeResolutionTerms(
          disputeResolver.id,
          disputeResolver.escalationResponsePeriod,
          DRFeeToken,
          applyPercentage(DRFeeToken, buyerEscalationDepositPercentage)
        ).toStruct();
        offerFees.protocolFee = protocolFeeFlatBoson;
        offerFeesStruct = offerFees.toStruct();

        // Create an offer in boson token
        await expect(
          orchestrationHandler
            .connect(rando)
            .createSellerAndOffer(
              seller,
              offer,
              offerDates,
              offerDurations,
              disputeResolver.id,
              emptyAuthToken,
              voucherInitValues,
              agentId
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            offer.id,
            seller.id,
            offer.toStruct(),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            rando.address
          );
      });

      context("💔 Revert Reasons", async function () {
        it("The orchestration region of protocol is paused", async function () {
          // Pause the orchestration region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Orchestration]);

          // Attempt to orchestrate, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("The sellers region of protocol is paused", async function () {
          // Pause the sellers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Sellers]);

          // Attempt to create a offer expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("The offers region of protocol is paused", async function () {
          // Pause the offers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Offers]);

          // Attempt to create a offer expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("active is false", async function () {
          seller.active = false;

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.MUST_BE_ACTIVE);
        });

        it("addresses are the zero address", async function () {
          seller.clerk = ethers.constants.AddressZero;

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.INVALID_ADDRESS);

          seller.clerk = clerk.address;
          seller.treasury = ethers.constants.AddressZero;

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.INVALID_ADDRESS);
        });

        it("addresses are not unique to this seller Id", async function () {
          // Create a seller
          await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

          seller.admin = other1.address;
          seller.clerk = other2.address;

          // Attempt to create a seller with non-unique operator, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE);

          seller.admin = admin.address;
          seller.operator = other1.address;

          // Attempt to create a seller with non-unique admin, expecting revert
          await expect(
            orchestrationHandler
              .connect(other1)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE);

          seller.clerk = clerk.address;
          seller.admin = other2.address;

          // Attempt to create a seller with non-unique clerk, expecting revert
          await expect(
            orchestrationHandler
              .connect(other1)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE);
        });

        it("Caller is not operator the specified in seller", async function () {
          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(rando)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.NOT_OPERATOR);
        });

        it("admin address is NOT zero address and AuthTokenType is NOT None", async function () {
          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                authToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.ADMIN_OR_AUTH_TOKEN);
        });

        it("admin address is zero address and AuthTokenType is None", async function () {
          seller.admin = ethers.constants.AddressZero;

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.ADMIN_OR_AUTH_TOKEN);
        });

        it("authToken is not unique to this seller", async function () {
          // Set admin == zero address because seller will be created with auth token
          seller.admin = ethers.constants.AddressZero;

          // Create a seller
          await accountHandler.connect(rando).createSeller(seller, authToken, voucherInitValues);

          //Set seller 2's addresses to unique operator and clerk addresses
          seller.operator = other2.address;
          seller.clerk = other3.address;

          // Attempt to create a seller with non-unique authToken and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(other2)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                authToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.AUTH_TOKEN_MUST_BE_UNIQUE);
        });

        it("Valid from date is greater than valid until date", async function () {
          // Reverse the from and until dates
          offerDates.validFrom = ethers.BigNumber.from(Date.now() + oneMonth * 6).toString(); // 6 months from now
          offerDates.validUntil = ethers.BigNumber.from(Date.now()).toString(); // now

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Valid until date is not in the future", async function () {
          // Set until date in the past
          offerDates.validUntil = ethers.BigNumber.from(Date.now() - oneMonth * 6).toString(); // 6 months ago
          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Buyer cancel penalty is less than item price", async function () {
          // Set buyer cancel penalty higher than offer price
          offer.buyerCancelPenalty = ethers.BigNumber.from(offer.price).add(10).toString();

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.OFFER_PENALTY_INVALID);
        });

        it("Offer cannot be voided at the time of the creation", async function () {
          // Set voided flag to true
          offer.voided = true;

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.OFFER_MUST_BE_ACTIVE);
        });

        it("Both voucher expiration date and voucher expiraton period are defined", async function () {
          // Set both voucherRedeemableUntil and voucherValid
          offerDates.voucherRedeemableUntil = (Number(offerDates.voucherRedeemableFrom) + oneMonth).toString();
          offerDurations.voucherValid = oneMonth.toString();

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.AMBIGUOUS_VOUCHER_EXPIRY);
        });

        it("Neither of voucher expiration date and voucher expiraton period are defined", async function () {
          // Set both voucherRedeemableUntil and voucherValid to "0"
          offerDates.voucherRedeemableUntil = "0";
          offerDurations.voucherValid = "0";

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.AMBIGUOUS_VOUCHER_EXPIRY);
        });

        it("Voucher redeemable period is fixed, but it ends before it starts", async function () {
          // Set both voucherRedeemableUntil that is less than voucherRedeemableFrom
          offerDates.voucherRedeemableUntil = (Number(offerDates.voucherRedeemableFrom) - 10).toString();
          offerDurations.voucherValid = "0";

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.REDEMPTION_PERIOD_INVALID);
        });

        it("Voucher redeemable period is fixed, but it ends before offer expires", async function () {
          // Set both voucherRedeemableUntil that is more than voucherRedeemableFrom but less than validUntil
          offerDates.voucherRedeemableFrom = "0";
          offerDates.voucherRedeemableUntil = (Number(offerDates.validUntil) - 10).toString();
          offerDurations.voucherValid = "0";

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.REDEMPTION_PERIOD_INVALID);
        });

        it("Fulfillment period is set to zero", async function () {
          // Set fulfilment period to 0
          offerDurations.fulfillmentPeriod = "0";

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.INVALID_FULFILLMENT_PERIOD);
        });

        it("Resolution period is set to zero", async function () {
          // Set dispute duration period to 0
          offerDurations.resolutionPeriod = "0";

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_DURATION);
        });

        it("Available quantity is set to zero", async function () {
          // Set available quantity to 0
          offer.quantityAvailable = "0";

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.INVALID_QUANTITY_AVAILABLE);
        });

        it("Dispute resolver wallet is not registered", async function () {
          // Set some address that is not registered as a dispute resolver
          disputeResolver.id = "16";

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        it("Dispute resolver is not active", async function () {
          // create another dispute resolver, but don't activate it
          disputeResolver = mockDisputeResolver(rando.address, rando.address, rando.address, rando.address, false);
          disputeResolver.id = "2"; // mock id is 3 because seller was mocked first but here we are creating dispute resolver first
          seller.id = "3";
          await accountHandler
            .connect(rando)
            .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        it("For absolute zero offer, specified dispute resolver is not registered", async function () {
          // Prepare an absolute zero offer, but specify dispute resolver
          offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = offerFees.protocolFee = "0";
          disputeResolver.id = "16";

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        it("For absolute zero offer, specified dispute resolver is not active", async function () {
          // create another dispute resolver, but don't activate it
          disputeResolver = mockDisputeResolver(rando.address, rando.address, rando.address, rando.address, false);
          disputeResolver.id = "2"; // mock id is 3 because seller was mocked first but here we are creating dispute resolver first
          seller.id = "3";

          await accountHandler
            .connect(rando)
            .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

          // Prepare an absolute zero offer, but specify dispute resolver
          offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = offerFees.protocolFee = "0";

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        it("Seller is not on dispute resolver's seller allow list", async function () {
          // Create new seller so sellerAllowList can have an entry
          const newSeller = mockSeller(rando.address, rando.address, rando.address, rando.address);

          await accountHandler.connect(rando).createSeller(newSeller, emptyAuthToken, voucherInitValues);

          allowedSellersToAdd = ["2"]; // DR is "1", new seller is "2"
          await accountHandler.connect(adminDR).addSellersToAllowList(disputeResolver.id, allowedSellersToAdd);

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.SELLER_NOT_APPROVED);
        });

        it("Dispute resolver does not accept fees in the exchange token", async function () {
          // Set some address that is not part of dispute resolver fees
          offer.exchangeToken = rando.address;

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.DR_UNSUPPORTED_FEE);
        });
      });

      context("When offers have non zero agent ids", async function () {
        beforeEach(async function () {
          seller.id = "3"; // 1 is dispute resolver, 2 is agent because is created first
          offer.sellerId = seller.id;
          sellerStruct = seller.toStruct();
          offerStruct = offer.toStruct();

          // Required constructor params
          agentId = "2"; // argument sent to contract for createAgent will be ignored

          // Create a valid agent, then set fields in tests directly
          agent = mockAgent(other1.address);
          agent.id = agentId;
          expect(agent.isValid()).is.true;

          // Create an agent
          await accountHandler.connect(rando).createAgent(agent);

          agentFee = ethers.BigNumber.from(offer.price).mul(agent.feePercentage).div("10000").toString();
          offerFees.agentFee = agentFee;
          offerFeesStruct = offerFees.toStruct();
        });

        it("should emit a SellerCreated and OfferCreated events", async function () {
          // Create a seller and an offer, testing for the event
          const tx = await orchestrationHandler
            .connect(operator)
            .createSellerAndOffer(
              seller,
              offer,
              offerDates,
              offerDurations,
              disputeResolver.id,
              emptyAuthToken,
              voucherInitValues,
              agentId
            );

          await expect(tx)
            .to.emit(orchestrationHandler, "SellerCreated")
            .withArgs(
              seller.id,
              sellerStruct,
              calculateContractAddress(orchestrationHandler.address, "1"),
              emptyAuthTokenStruct,
              operator.address
            );

          await expect(tx)
            .to.emit(orchestrationHandler, "OfferCreated")
            .withArgs(
              nextOfferId,
              offer.sellerId,
              offerStruct,
              offerDatesStruct,
              offerDurationsStruct,
              disputeResolutionTermsStruct,
              offerFeesStruct,
              agentId,
              operator.address
            );
        });

        context("💔 Revert Reasons", async function () {
          it("Agent does not exist", async function () {
            // Set an agent id that does not exist
            let agentId = "16";

            // Seller can have admin address OR auth token
            seller.admin = ethers.constants.AddressZero;

            // Attempt to Create an offer, expecting revert
            await expect(
              orchestrationHandler
                .connect(operator)
                .createSellerAndOffer(
                  seller,
                  offer,
                  offerDates,
                  offerDurations,
                  disputeResolver.id,
                  authToken,
                  voucherInitValues,
                  agentId
                )
            ).to.revertedWith(RevertReasons.NO_SUCH_AGENT);
          });

          it("Sum of Agent fee amount and protocol fee amount should be <= than the offer fee limit", async function () {
            // Create new agent
            let id = "3"; // argument sent to contract for createAgent will be ignored

            // Create a valid agent, then set fields in tests directly
            agent = mockAgent(operator.address);
            agent.id = id;
            agent.feePercentage = "3000"; // 30%
            expect(agent.isValid()).is.true;

            // Create an agent
            await accountHandler.connect(rando).createAgent(agent);

            //Change protocol fee after creating agent
            await configHandler.connect(protocolAdmin).setProtocolFeePercentage("1100"); //11%

            // Attempt to Create an offer, expecting revert
            await expect(
              orchestrationHandler
                .connect(operator)
                .createSellerAndOffer(
                  seller,
                  offer,
                  offerDates,
                  offerDurations,
                  disputeResolver.id,
                  emptyAuthToken,
                  voucherInitValues,
                  agent.id
                )
            ).to.revertedWith(RevertReasons.AGENT_FEE_AMOUNT_TOO_HIGH);
          });
        });
      });
    });

    context("👉 createOfferWithCondition()", async function () {
      beforeEach(async function () {
        // prepare a group struct. We are not passing it as an argument, but just need to validate.

        // The first group id
        nextGroupId = "1";

        // Required constructor params for Group
        seller.id = "2"; // "1" is dispute resolver
        offerIds = ["1"];

        condition = mockCondition({ tokenAddress: other3.address, tokenType: TokenType.MultiToken, tokenId: "5150" });
        expect(condition.isValid()).to.be.true;

        group = new Group(nextGroupId, seller.id, offerIds);

        expect(group.isValid()).is.true;

        // How that group looks as a returned struct
        groupStruct = group.toStruct();

        // create a seller
        await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);
      });

      it("should emit an OfferCreated and GroupCreated events", async function () {
        // Create an offer with condition, testing for the events
        const tx = await orchestrationHandler
          .connect(operator)
          .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId);

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            offerStruct,
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // GroupCreated event
        const eventGroupCreated = getEvent(txReceipt, orchestrationHandler, "GroupCreated");
        const groupInstance = Group.fromStruct(eventGroupCreated.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(eventGroupCreated.groupId.toString(), group.id, "Group Id is incorrect");
        assert.equal(eventGroupCreated.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(eventGroupCreated.executedBy.toString(), operator.address, "Executed by is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
      });

      it("should update state", async function () {
        // Create an offer with condition
        await orchestrationHandler
          .connect(operator)
          .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId);

        // Get the offer as a struct
        [, offerStruct, offerDatesStruct, offerDurationsStruct, disputeResolutionTermsStruct] = await offerHandler
          .connect(rando)
          .getOffer(offer.id);

        // Parse into entities
        let returnedOffer = Offer.fromStruct(offerStruct);
        let returnedOfferDates = OfferDates.fromStruct(offerDatesStruct);
        let returnedOfferDurations = OfferDurations.fromStruct(offerDurationsStruct);
        let returnedDisputeResolutionTermsStruct = DisputeResolutionTerms.fromStruct(disputeResolutionTermsStruct);

        // Returned values should match the input in createSellerAndOffer
        for ([key, value] of Object.entries(offer)) {
          expect(JSON.stringify(returnedOffer[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDates)) {
          expect(JSON.stringify(returnedOfferDates[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDurations)) {
          expect(JSON.stringify(returnedOfferDurations[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(disputeResolutionTerms)) {
          expect(JSON.stringify(returnedDisputeResolutionTermsStruct[key]) === JSON.stringify(value)).is.true;
        }

        // Get the group as a struct
        [, groupStruct, conditionStruct] = await groupHandler.connect(rando).getGroup(nextGroupId);

        // Parse into entity
        const returnedGroup = Group.fromStruct(groupStruct);

        // Returned values should match what is expected for the silently created group
        for ([key, value] of Object.entries(group)) {
          expect(JSON.stringify(returnedGroup[key]) === JSON.stringify(value)).is.true;
        }

        // Parse into entity
        const returnedCondition = Condition.fromStruct(conditionStruct);

        // Returned values should match the condition
        for ([key, value] of Object.entries(condition)) {
          expect(JSON.stringify(returnedCondition[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should ignore any provided offer id and assign the next available", async function () {
        offer.id = "555";

        // Create an offer with condition, testing for the events
        const tx = await orchestrationHandler
          .connect(operator)
          .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId);

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            offerStruct,
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // GroupCreated event
        const eventGroupCreated = getEvent(txReceipt, orchestrationHandler, "GroupCreated");
        const groupInstance = Group.fromStruct(eventGroupCreated.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(eventGroupCreated.groupId.toString(), nextGroupId, "Group Id is incorrect");
        assert.equal(eventGroupCreated.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
      });

      it("should ignore any provided seller and assign seller id of msg.sender", async function () {
        // set some other seller.id
        offer.sellerId = "123";

        // Create an offer with condition, testing for the events
        const tx = await orchestrationHandler
          .connect(operator)
          .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId);

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            offerStruct,
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // GroupCreated event
        const eventGroupCreated = getEvent(txReceipt, orchestrationHandler, "GroupCreated");
        const groupInstance = Group.fromStruct(eventGroupCreated.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(eventGroupCreated.groupId.toString(), nextGroupId, "Group Id is incorrect");
        assert.equal(eventGroupCreated.sellerId.toString(), seller.id, "Seller Id is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
      });

      it("If exchange token is $BOSON, fee should be flat boson fee", async function () {
        // Prepare an offer with $BOSON as exchange token
        offer.exchangeToken = bosonToken.address;
        disputeResolutionTermsStruct = new DisputeResolutionTerms(
          disputeResolver.id,
          disputeResolver.escalationResponsePeriod,
          DRFeeToken,
          applyPercentage(DRFeeToken, buyerEscalationDepositPercentage)
        ).toStruct();
        offerFees.protocolFee = protocolFeeFlatBoson;
        offerFeesStruct = offerFees.toStruct();

        // Create an offer with condition, testing for the events
        await expect(
          orchestrationHandler
            .connect(operator)
            .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            offer.toStruct(),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );
      });

      it("For absolute zero offers, dispute resolver can be unspecified", async function () {
        // Prepare an absolute zero offer
        offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = offerFees.protocolFee = "0";
        disputeResolver.id = "0";
        disputeResolutionTermsStruct = new DisputeResolutionTerms("0", "0", "0", "0").toStruct();
        offerFeesStruct = offerFees.toStruct();

        // Create an offer with condition, testing for the events
        await expect(
          orchestrationHandler
            .connect(operator)
            .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            offer.toStruct(),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );
      });

      it("Should allow creation of an offer with unlimited supply", async function () {
        // Prepare an absolute zero offer
        offer.quantityAvailable = ethers.constants.MaxUint256.toString();

        // Create an offer with condition, testing for the events
        await expect(
          orchestrationHandler
            .connect(operator)
            .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            offer.toStruct(),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );
      });

      it("Should use the correct dispute resolver fee", async function () {
        // Create an offer with condition in native currency
        await expect(
          orchestrationHandler
            .connect(operator)
            .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            offer.id,
            seller.id,
            offerStruct,
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );

        // create another offer, now with bosonToken as exchange token
        offer.exchangeToken = bosonToken.address;
        offer.id = "2";
        disputeResolutionTermsStruct = new DisputeResolutionTerms(
          disputeResolver.id,
          disputeResolver.escalationResponsePeriod,
          DRFeeToken,
          applyPercentage(DRFeeToken, buyerEscalationDepositPercentage)
        ).toStruct();
        offerFees.protocolFee = protocolFeeFlatBoson;
        offerFeesStruct = offerFees.toStruct();

        // Create an offer with condition in boson token
        await expect(
          orchestrationHandler
            .connect(operator)
            .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            offer.id,
            seller.id,
            offer.toStruct(),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );
      });

      it("Should allow creation of an offer if DR has a sellerAllowList and seller is on it", async function () {
        // add seller to allow list
        allowedSellersToAdd = ["2"]; // DR is "1", existing seller is "2", new seller is "3"
        await accountHandler.connect(adminDR).addSellersToAllowList(disputeResolver.id, allowedSellersToAdd);

        // Create an offer with condition, testing for the events
        await expect(
          orchestrationHandler
            .connect(operator)
            .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId)
        ).to.emit(orchestrationHandler, "OfferCreated");
      });

      context("💔 Revert Reasons", async function () {
        it("The orchestration region of protocol is paused", async function () {
          // Pause the orchestration region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Orchestration]);

          // Attempt to create an offer expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("The offers region of protocol is paused", async function () {
          // Pause the offers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Offers]);

          // Attempt to orchestrate, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId)
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("The groups region of protocol is paused", async function () {
          // Pause the groups region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Offers]);

          // Attempt to create a group, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId)
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("Caller not operator of any seller", async function () {
          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(rando)
              .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId)
          ).to.revertedWith(RevertReasons.NOT_OPERATOR);
        });

        it("Valid from date is greater than valid until date", async function () {
          // Reverse the from and until dates
          offerDates.validFrom = ethers.BigNumber.from(Date.now() + oneMonth * 6).toString(); // 6 months from now
          offerDates.validUntil = ethers.BigNumber.from(Date.now()).toString(); // now

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId)
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Valid until date is not in the future", async function () {
          // Set until date in the past
          offerDates.validUntil = ethers.BigNumber.from(Date.now() - oneMonth * 6).toString(); // 6 months ago

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId)
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Buyer cancel penalty is less than item price", async function () {
          // Set buyer cancel penalty higher than offer price
          offer.buyerCancelPenalty = ethers.BigNumber.from(offer.price).add(10).toString();

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId)
          ).to.revertedWith(RevertReasons.OFFER_PENALTY_INVALID);
        });

        it("Offer cannot be voided at the time of the creation", async function () {
          // Set voided flag to true
          offer.voided = true;

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId)
          ).to.revertedWith(RevertReasons.OFFER_MUST_BE_ACTIVE);
        });

        it("Both voucher expiration date and voucher expiraton period are defined", async function () {
          // Set both voucherRedeemableUntil and voucherValid
          offerDates.voucherRedeemableUntil = (Number(offerDates.voucherRedeemableFrom) + oneMonth).toString();
          offerDurations.voucherValid = oneMonth.toString();

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId)
          ).to.revertedWith(RevertReasons.AMBIGUOUS_VOUCHER_EXPIRY);
        });

        it("Neither of voucher expiration date and voucher expiraton period are defined", async function () {
          // Set both voucherRedeemableUntil and voucherValid to "0"
          offerDates.voucherRedeemableUntil = "0";
          offerDurations.voucherValid = "0";

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId)
          ).to.revertedWith(RevertReasons.AMBIGUOUS_VOUCHER_EXPIRY);
        });

        it("Voucher redeemable period is fixed, but it ends before it starts", async function () {
          // Set both voucherRedeemableUntil that is less than voucherRedeemableFrom
          offerDates.voucherRedeemableUntil = (Number(offerDates.voucherRedeemableFrom) - 10).toString();
          offerDurations.voucherValid = "0";

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId)
          ).to.revertedWith(RevertReasons.REDEMPTION_PERIOD_INVALID);
        });

        it("Voucher redeemable period is fixed, but it ends before offer expires", async function () {
          // Set both voucherRedeemableUntil that is more than voucherRedeemableFrom but less than validUntil
          offerDates.voucherRedeemableFrom = "0";
          offerDates.voucherRedeemableUntil = (Number(offerDates.validUntil) - 10).toString();
          offerDurations.voucherValid = "0";

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId)
          ).to.revertedWith(RevertReasons.REDEMPTION_PERIOD_INVALID);
        });

        it("Fulfillment period is set to zero", async function () {
          // Set fulfilment period to 0
          offerDurations.fulfillmentPeriod = "0";

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId)
          ).to.revertedWith(RevertReasons.INVALID_FULFILLMENT_PERIOD);
        });

        it("Resolution period is set to zero", async function () {
          // Set dispute duration period to 0
          offerDurations.resolutionPeriod = "0";

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_DURATION);
        });

        it("Available quantity is set to zero", async function () {
          // Set available quantity to 0
          offer.quantityAvailable = "0";

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId)
          ).to.revertedWith(RevertReasons.INVALID_QUANTITY_AVAILABLE);
        });

        it("Dispute resolver wallet is not registered", async function () {
          // Set some address that is not registered as a dispute resolver
          disputeResolver.id = "16";

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        it("Dispute resolver is not active", async function () {
          // create another dispute resolver, but don't activate it
          disputeResolver = mockDisputeResolver(rando.address, rando.address, rando.address, rando.address, false);
          await accountHandler
            .connect(rando)
            .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        it("For absolute zero offer, specified dispute resolver is not registered", async function () {
          // Prepare an absolute zero offer, but specify dispute resolver
          offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = offerFees.protocolFee = "0";
          disputeResolver.id = "16";

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        it("For absolute zero offer, specified dispute resolver is not active", async function () {
          // create another dispute resolver, but don't activate it
          disputeResolver = mockDisputeResolver(rando.address, rando.address, rando.address, rando.address, false);
          await accountHandler
            .connect(rando)
            .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

          // Prepare an absolute zero offer, but specify dispute resolver
          offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = offerFees.protocolFee = "0";

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        it("Seller is not on dispute resolver's seller allow list", async function () {
          // Create new seller so sellerAllowList can have an entry
          const newSeller = mockSeller(rando.address, rando.address, rando.address, rando.address);
          await accountHandler.connect(rando).createSeller(newSeller, emptyAuthToken, voucherInitValues);

          allowedSellersToAdd = ["3"]; // DR is "1", existing seller is "2", new seller is "3"
          await accountHandler.connect(adminDR).addSellersToAllowList(disputeResolver.id, allowedSellersToAdd);

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId)
          ).to.revertedWith(RevertReasons.SELLER_NOT_APPROVED);
        });

        it("Dispute resolver does not accept fees in the exchange token", async function () {
          // Set some address that is not part of dispute resolver fees
          offer.exchangeToken = rando.address;

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId)
          ).to.revertedWith(RevertReasons.DR_UNSUPPORTED_FEE);
        });

        it("Condition 'None' has some values in other fields", async function () {
          condition.method = EvaluationMethod.None;

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId)
          ).to.revertedWith(RevertReasons.INVALID_CONDITION_PARAMETERS);
        });

        it("Condition 'Threshold' has zero token contract address", async function () {
          condition.method = EvaluationMethod.Threshold;
          condition.tokenAddress = ethers.constants.AddressZero;

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId)
          ).to.revertedWith(RevertReasons.INVALID_CONDITION_PARAMETERS);
        });

        it("Condition 'SpecificToken' has has zero token contract address", async function () {
          condition.method = EvaluationMethod.SpecificToken;
          condition.tokenAddress = ethers.constants.AddressZero;

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId)
          ).to.revertedWith(RevertReasons.INVALID_CONDITION_PARAMETERS);
        });
      });

      context("When offers have non zero agent ids", async function () {
        beforeEach(async function () {
          // Required constructor params
          agentId = "3"; // argument sent to contract for createAgent will be ignored

          // Create a valid agent, then set fields in tests directly
          agent = mockAgent(other1.address);
          agent.id = agentId;
          expect(agent.isValid()).is.true;

          // Create an agent
          await accountHandler.connect(rando).createAgent(agent);

          agentFee = ethers.BigNumber.from(offer.price).mul(agent.feePercentage).div("10000").toString();
          offerFees.agentFee = agentFee;
          offerFeesStruct = offerFees.toStruct();
        });

        it("should emit an OfferCreated and GroupCreated events", async function () {
          // Create an offer with condition, testing for the events
          const tx = await orchestrationHandler
            .connect(operator)
            .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId);

          // OfferCreated event
          await expect(tx)
            .to.emit(orchestrationHandler, "OfferCreated")
            .withArgs(
              nextOfferId,
              seller.id,
              offerStruct,
              offerDatesStruct,
              offerDurationsStruct,
              disputeResolutionTermsStruct,
              offerFeesStruct,
              agentId,
              operator.address
            );

          // Events with structs that contain arrays must be tested differently
          const txReceipt = await tx.wait();

          // GroupCreated event
          const eventGroupCreated = getEvent(txReceipt, orchestrationHandler, "GroupCreated");
          const groupInstance = Group.fromStruct(eventGroupCreated.group);
          // Validate the instance
          expect(groupInstance.isValid()).to.be.true;

          assert.equal(eventGroupCreated.groupId.toString(), group.id, "Group Id is incorrect");
          assert.equal(eventGroupCreated.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
          assert.equal(eventGroupCreated.executedBy.toString(), operator.address, "Executed by is incorrect");
          assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
        });

        context("💔 Revert Reasons", async function () {
          it("Agent does not exist", async function () {
            // Set an agent id that does not exist
            let agentId = "16";

            // Attempt to Create an offer, expecting revert
            await expect(
              orchestrationHandler
                .connect(operator)
                .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agentId)
            ).to.revertedWith(RevertReasons.NO_SUCH_AGENT);
          });

          it("Sum of Agent fee amount and protocol fee amount should be <= than the offer fee limit", async function () {
            // Create new agent
            let id = "4"; // argument sent to contract for createAgent will be ignored

            // Create a valid agent, then set fields in tests directly
            agent = mockAgent(operator.address);
            agent.id = id;
            agent.feePercentage = "3000"; //30%;
            expect(agent.isValid()).is.true;

            // Create an agent
            await accountHandler.connect(rando).createAgent(agent);

            //Change protocol fee after creating agent
            await configHandler.connect(protocolAdmin).setProtocolFeePercentage("1100"); //11%

            // Attempt to Create an offer, expecting revert
            await expect(
              orchestrationHandler
                .connect(operator)
                .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolver.id, condition, agent.id)
            ).to.revertedWith(RevertReasons.AGENT_FEE_AMOUNT_TOO_HIGH);
          });
        });
      });
    });

    context("👉 createOfferAddToGroup()", async function () {
      beforeEach(async function () {
        // create a seller
        await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

        // The first group id
        nextGroupId = "1";

        // create 3 offers
        for (let i = 0; i < 3; i++) {
          // Mock offer, offerDates and offerDurations
          ({ offer, offerDates, offerDurations } = await mockOffer());
          offer.id = `${i + 1}`;
          offer.price = ethers.utils.parseUnits(`${1.5 + i * 1}`, "ether").toString();
          offer.sellerDeposit = ethers.utils.parseUnits(`${0.25 + i * 0.1}`, "ether").toString();
          offer.buyerCancelPenalty = ethers.utils.parseUnits(`${0.05 + i * 0.1}`, "ether").toString();
          offer.quantityAvailable = `${(i + 1) * 2}`;
          offer.sellerId = seller.id; // "2" is dispute resolver

          offerDates.validFrom = ethers.BigNumber.from(Date.now() + oneMonth * i).toString();
          offerDates.validUntil = ethers.BigNumber.from(Date.now() + oneMonth * 6 * (i + 1)).toString();

          disputeResolver.id = "1";
          agentId = "0";

          // Check if domains are valid
          expect(offer.isValid()).is.true;
          expect(offerDates.isValid()).is.true;
          expect(offerDurations.isValid()).is.true;

          // Create the offer
          await offerHandler
            .connect(operator)
            .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId);

          nextOfferId++;
        }
        offerDatesStruct = offerDates.toStruct();
        offerDurationsStruct = offerDurations.toStruct();

        // Required constructor params for Group
        offerIds = ["1", "3"];

        condition = mockCondition({
          tokenType: TokenType.MultiToken,
          tokenAddress: other3.address,
          tokenId: "5150",
          maxCommits: "3",
        });
        expect(condition.isValid()).to.be.true;

        group = new Group(nextGroupId, seller.id, offerIds);

        expect(group.isValid()).is.true;

        // Create a group
        await groupHandler.connect(operator).createGroup(group, condition);

        // after another offer is added
        offer.id = nextOfferId.toString(); // not necessary as input parameter
        group.offerIds = ["1", "3", "4"];

        // How that group and offer look as a returned struct
        groupStruct = group.toStruct();
        offerStruct = offer.toStruct();

        // Offer fees
        offerFees.protocolFee = applyPercentage(offer.price, protocolFeePercentage);
        offerFeesStruct = offerFees.toStruct();
      });

      it("should emit an OfferCreated and GroupUpdated events", async function () {
        // Create an offer, add it to the group, testing for the events
        const tx = await orchestrationHandler
          .connect(operator)
          .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId);

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            offerStruct,
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // GroupUpdated event
        const eventGroupUpdated = getEvent(txReceipt, orchestrationHandler, "GroupUpdated");
        const groupInstance = Group.fromStruct(eventGroupUpdated.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(eventGroupUpdated.groupId.toString(), group.id, "Group Id is incorrect");
        assert.equal(eventGroupUpdated.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
      });

      it("should update state", async function () {
        // Create an offer, add it to the group
        await orchestrationHandler
          .connect(operator)
          .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId);

        // Get the offer as a struct
        [, offerStruct, offerDatesStruct, offerDurationsStruct, disputeResolutionTermsStruct] = await offerHandler
          .connect(rando)
          .getOffer(offer.id);

        // Parse into entities
        let returnedOffer = Offer.fromStruct(offerStruct);
        let returnedOfferDates = OfferDates.fromStruct(offerDatesStruct);
        let returnedOfferDurations = OfferDurations.fromStruct(offerDurationsStruct);
        let returnedDisputeResolutionTermsStruct = DisputeResolutionTerms.fromStruct(disputeResolutionTermsStruct);

        // Returned values should match the input in createSellerAndOffer
        for ([key, value] of Object.entries(offer)) {
          expect(JSON.stringify(returnedOffer[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDates)) {
          expect(JSON.stringify(returnedOfferDates[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDurations)) {
          expect(JSON.stringify(returnedOfferDurations[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(disputeResolutionTerms)) {
          expect(JSON.stringify(returnedDisputeResolutionTermsStruct[key]) === JSON.stringify(value)).is.true;
        }

        // Get the group as a struct
        [, groupStruct, conditionStruct] = await groupHandler.connect(rando).getGroup(nextGroupId);

        // Parse into entity
        const returnedGroup = Group.fromStruct(groupStruct);

        // Returned values should match what is expected for the update group
        for ([key, value] of Object.entries(group)) {
          expect(JSON.stringify(returnedGroup[key]) === JSON.stringify(value)).is.true;
        }

        // Parse into entity
        const returnedCondition = Condition.fromStruct(conditionStruct);

        // Returned values should match the condition
        for ([key, value] of Object.entries(condition)) {
          expect(JSON.stringify(returnedCondition[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should ignore any provided offer id and assign the next available", async function () {
        offer.id = "555";

        // Create an offer, add it to the group, testing for the events
        const tx = await orchestrationHandler
          .connect(operator)
          .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId);

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            offerStruct,
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // GroupUpdated event
        const eventGroupUpdated = getEvent(txReceipt, orchestrationHandler, "GroupUpdated");
        const groupInstance = Group.fromStruct(eventGroupUpdated.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(eventGroupUpdated.groupId.toString(), nextGroupId, "Group Id is incorrect");
        assert.equal(eventGroupUpdated.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
      });

      it("should ignore any provided seller and assign seller id of msg.sender", async function () {
        // set some other seller.id
        offer.sellerId = "123";

        // Create an offer, add it to the group, testing for the events
        const tx = await orchestrationHandler
          .connect(operator)
          .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId);

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            offerStruct,
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // GroupUpdated event
        const eventGroupUpdated = getEvent(txReceipt, orchestrationHandler, "GroupUpdated");
        const groupInstance = Group.fromStruct(eventGroupUpdated.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(eventGroupUpdated.groupId.toString(), nextGroupId, "Group Id is incorrect");
        assert.equal(eventGroupUpdated.sellerId.toString(), seller.id, "Seller Id is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
      });

      it("If exchange token is $BOSON, fee should be flat boson fee", async function () {
        // Prepare an offer with $BOSON as exchange token
        offer.exchangeToken = bosonToken.address;
        disputeResolutionTermsStruct = new DisputeResolutionTerms(
          disputeResolver.id,
          disputeResolver.escalationResponsePeriod,
          DRFeeToken,
          applyPercentage(DRFeeToken, buyerEscalationDepositPercentage)
        ).toStruct();
        offerFees.protocolFee = protocolFeeFlatBoson;
        offerFeesStruct = offerFees.toStruct();

        // Create an offer, add it to the group, testing for the events
        await expect(
          orchestrationHandler
            .connect(operator)
            .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            offer.toStruct(),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );
      });

      it("For absolute zero offers, dispute resolver can be unspecified", async function () {
        // Prepare an absolute zero offer
        offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = offerFees.protocolFee = "0";
        disputeResolver.id = "0";
        disputeResolutionTermsStruct = new DisputeResolutionTerms("0", "0", "0", "0").toStruct();
        offerFeesStruct = offerFees.toStruct();

        // Create an offer, add it to the group, testing for the events
        await expect(
          orchestrationHandler
            .connect(operator)
            .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            offer.toStruct(),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );
      });

      it("Should allow creation of an offer with unlimited supply", async function () {
        // Prepare an absolute zero offer
        offer.quantityAvailable = ethers.constants.MaxUint256.toString();

        // Create an offer, add it to the group, testing for the events
        await expect(
          orchestrationHandler
            .connect(operator)
            .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            offer.toStruct(),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );
      });

      it("Should use the correct dispute resolver fee", async function () {
        // Create an offer in native currency
        await expect(
          orchestrationHandler
            .connect(operator)
            .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            offer.id,
            seller.id,
            offerStruct,
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );

        // create another offer, now with bosonToken as exchange token
        offer.exchangeToken = bosonToken.address;
        offer.id++;
        disputeResolutionTermsStruct = new DisputeResolutionTerms(
          disputeResolver.id,
          disputeResolver.escalationResponsePeriod,
          DRFeeToken,
          applyPercentage(DRFeeToken, buyerEscalationDepositPercentage)
        ).toStruct();
        offerFees.protocolFee = protocolFeeFlatBoson;
        offerFeesStruct = offerFees.toStruct();

        // Create an offer in boson token
        await expect(
          orchestrationHandler
            .connect(operator)
            .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            offer.id,
            seller.id,
            offer.toStruct(),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );
      });

      it("Should allow creation of an offer if DR has a sellerAllowList and seller is on it", async function () {
        // add seller to allow list
        allowedSellersToAdd = ["2"]; // DR is "1", existing seller is "2", new seller is "3"
        await accountHandler.connect(adminDR).addSellersToAllowList(disputeResolver.id, allowedSellersToAdd);

        // Create an offer in native currency
        await expect(
          orchestrationHandler
            .connect(operator)
            .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId)
        ).to.emit(orchestrationHandler, "OfferCreated");
      });

      context("💔 Revert Reasons", async function () {
        it("The orchestration region of protocol is paused", async function () {
          // Pause the orchestration region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Orchestration]);

          // Attempt to orchestrate expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId)
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("The offers region of protocol is paused", async function () {
          // Pause the offers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Offers]);

          // Attempt to create a offer expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId)
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("The groups region of protocol is paused", async function () {
          // Pause the groups region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Groups]);

          // Attempt to create a group expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId)
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("Caller not operator of any seller", async function () {
          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler
              .connect(rando)
              .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId)
          ).to.revertedWith(RevertReasons.NOT_OPERATOR);
        });

        it("Valid from date is greater than valid until date", async function () {
          // Reverse the from and until dates
          offerDates.validFrom = ethers.BigNumber.from(Date.now() + oneMonth * 6).toString(); // 6 months from now
          offerDates.validUntil = ethers.BigNumber.from(Date.now()).toString(); // now

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId)
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Valid until date is not in the future", async function () {
          // Set until date in the past
          offerDates.validUntil = ethers.BigNumber.from(Date.now() - oneMonth * 6).toString(); // 6 months ago

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId)
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Buyer cancel penalty is less than item price", async function () {
          // Set buyer cancel penalty higher than offer price
          offer.buyerCancelPenalty = ethers.BigNumber.from(offer.price).add(10).toString();

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId)
          ).to.revertedWith(RevertReasons.OFFER_PENALTY_INVALID);
        });

        it("Offer cannot be voided at the time of the creation", async function () {
          // Set voided flag to true
          offer.voided = true;

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId)
          ).to.revertedWith(RevertReasons.OFFER_MUST_BE_ACTIVE);
        });

        it("Both voucher expiration date and voucher expiraton period are defined", async function () {
          // Set both voucherRedeemableUntil and voucherValid
          offerDates.voucherRedeemableUntil = ethers.BigNumber.from(offerDates.voucherRedeemableFrom)
            .add(oneMonth)
            .toString();
          offerDurations.voucherValid = oneMonth.toString();

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId)
          ).to.revertedWith(RevertReasons.AMBIGUOUS_VOUCHER_EXPIRY);
        });

        it("Neither of voucher expiration date and voucher expiraton period are defined", async function () {
          // Set both voucherRedeemableUntil and voucherValid to "0"
          offerDates.voucherRedeemableUntil = "0";
          offerDurations.voucherValid = "0";

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId)
          ).to.revertedWith(RevertReasons.AMBIGUOUS_VOUCHER_EXPIRY);
        });

        it("Voucher redeemable period is fixed, but it ends before it starts", async function () {
          // Set both voucherRedeemableUntil that is less than voucherRedeemableFrom
          offerDates.voucherRedeemableUntil = ethers.BigNumber.from(offerDates.voucherRedeemableFrom)
            .sub(10)
            .toString();
          offerDurations.voucherValid = "0";

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId)
          ).to.revertedWith(RevertReasons.REDEMPTION_PERIOD_INVALID);
        });

        it("Voucher redeemable period is fixed, but it ends before offer expires", async function () {
          // Set both voucherRedeemableUntil that is more than voucherRedeemableFrom but less than validUntil
          offerDates.voucherRedeemableFrom = "0";
          offerDates.voucherRedeemableUntil = (Number(offerDates.validUntil) - 10).toString();
          offerDurations.voucherValid = "0";

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId)
          ).to.revertedWith(RevertReasons.REDEMPTION_PERIOD_INVALID);
        });

        it("Fulfillment period is set to zero", async function () {
          // Set fulfilment period to 0
          offerDurations.fulfillmentPeriod = "0";

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId)
          ).to.revertedWith(RevertReasons.INVALID_FULFILLMENT_PERIOD);
        });

        it("Resolution period is set to zero", async function () {
          // Set dispute duration period to 0
          offerDurations.resolutionPeriod = "0";

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_DURATION);
        });

        it("Available quantity is set to zero", async function () {
          // Set available quantity to 0
          offer.quantityAvailable = "0";

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId)
          ).to.revertedWith(RevertReasons.INVALID_QUANTITY_AVAILABLE);
        });

        it("Dispute resolver wallet is not registered", async function () {
          // Set some address that is not registered as a dispute resolver
          disputeResolver.id = "16";

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        it("Dispute resolver is not active", async function () {
          // create another dispute resolver, but don't activate it
          disputeResolver = mockDisputeResolver(rando.address, rando.address, rando.address, rando.address, false);
          disputeResolver.id = "2"; // mock id is 3 because seller was mocked first but here we are creating dispute resolver first
          await accountHandler
            .connect(rando)
            .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        it("For absolute zero offer, specified dispute resolver is not registered", async function () {
          // Prepare an absolute zero offer, but specify dispute resolver
          offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = offerFees.protocolFee = "0";
          disputeResolver.id = "16";

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        it("For absolute zero offer, specified dispute resolver is not active", async function () {
          // create another dispute resolver, but don't activate it
          disputeResolver = mockDisputeResolver(rando.address, rando.address, rando.address, rando.address, false);
          await accountHandler
            .connect(rando)
            .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

          // Prepare an absolute zero offer, but specify dispute resolver
          offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = offerFees.protocolFee = "0";

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        it("Seller is not on dispute resolver's seller allow list", async function () {
          // Create new seller so sellerAllowList can have an entry
          const newSeller = mockSeller(rando.address, rando.address, rando.address, rando.address);

          await accountHandler.connect(rando).createSeller(newSeller, emptyAuthToken, voucherInitValues);

          allowedSellersToAdd = ["3"]; // DR is "1", existing seller is "2", new seller is "3"
          await accountHandler.connect(adminDR).addSellersToAllowList(disputeResolver.id, allowedSellersToAdd);

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId)
          ).to.revertedWith(RevertReasons.SELLER_NOT_APPROVED);
        });

        it("Dispute resolver does not accept fees in the exchange token", async function () {
          // Set some address that is not part of dispute resolver fees
          offer.exchangeToken = rando.address;

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId)
          ).to.revertedWith(RevertReasons.DR_UNSUPPORTED_FEE);
        });

        it("Group does not exist", async function () {
          // Set invalid id
          let invalidGroupId = "444";

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, invalidGroupId, agentId)
          ).to.revertedWith(RevertReasons.NO_SUCH_GROUP);

          // Set invalid id
          invalidGroupId = "0";

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, invalidGroupId, agentId)
          ).to.revertedWith(RevertReasons.NO_SUCH_GROUP);
        });

        it("Caller is not the seller of the group", async function () {
          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler
              .connect(rando)
              .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId)
          ).to.revertedWith(RevertReasons.NOT_OPERATOR);
        });
      });

      context("When offers have non zero agent ids", async function () {
        beforeEach(async function () {
          // Required constructor params
          agentId = "3"; // argument sent to contract for createAgent will be ignored

          // Create a valid agent, then set fields in tests directly
          agent = mockAgent(other1.address);
          agent.id = agentId;
          expect(agent.isValid()).is.true;

          // Create an agent
          await accountHandler.connect(rando).createAgent(agent);

          agentFee = ethers.BigNumber.from(offer.price).mul(agent.feePercentage).div("10000").toString();
          offerFees.agentFee = agentFee;
          offerFeesStruct = offerFees.toStruct();
        });

        it("should emit an OfferCreated and GroupUpdated events", async function () {
          // Create an offer, add it to the group, testing for the events
          const tx = await orchestrationHandler
            .connect(operator)
            .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId);

          // OfferCreated event
          await expect(tx)
            .to.emit(orchestrationHandler, "OfferCreated")
            .withArgs(
              nextOfferId,
              seller.id,
              offerStruct,
              offerDatesStruct,
              offerDurationsStruct,
              disputeResolutionTermsStruct,
              offerFeesStruct,
              agentId,
              operator.address
            );

          // Events with structs that contain arrays must be tested differently
          const txReceipt = await tx.wait();

          // GroupUpdated event
          const eventGroupUpdated = getEvent(txReceipt, orchestrationHandler, "GroupUpdated");
          const groupInstance = Group.fromStruct(eventGroupUpdated.group);
          // Validate the instance
          expect(groupInstance.isValid()).to.be.true;

          assert.equal(eventGroupUpdated.groupId.toString(), group.id, "Group Id is incorrect");
          assert.equal(eventGroupUpdated.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
          assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
        });

        context("💔 Revert Reasons", async function () {
          it("Agent does not exist", async function () {
            // Set an agent id that does not exist
            let agentId = "16";

            // Attempt to Create an offer, expecting revert
            await expect(
              orchestrationHandler
                .connect(operator)
                .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agentId)
            ).to.revertedWith(RevertReasons.NO_SUCH_AGENT);
          });

          it("Sum of Agent fee amount and protocol fee amount should be <= than the offer fee limit", async function () {
            // Create new agent
            let id = "4"; // argument sent to contract for createAgent will be ignored

            // Create a valid agent, then set fields in tests directly
            agent = mockAgent(operator.address);
            agent.id = id;
            agent.feePercentage = "3000"; // 30%
            expect(agent.isValid()).is.true;

            // Create an agent
            await accountHandler.connect(rando).createAgent(agent);

            //Change protocol fee after creating agent
            await configHandler.connect(protocolAdmin).setProtocolFeePercentage("1100"); //11%

            // Attempt to Create an offer, expecting revert
            await expect(
              orchestrationHandler
                .connect(operator)
                .createOfferAddToGroup(offer, offerDates, offerDurations, disputeResolver.id, nextGroupId, agent.id)
            ).to.revertedWith(RevertReasons.AGENT_FEE_AMOUNT_TOO_HIGH);
          });
        });
      });
    });

    context("👉 createOfferAndTwinWithBundle()", async function () {
      beforeEach(async function () {
        // prepare a bundle struct. We are not passing it as an argument, but just need to validate.

        // The first bundle id
        bundleId = nextBundleId = "1";

        // Required constructor params for Bundle
        offerIds = ["1"];
        twinIds = ["1"];

        bundle = new Bundle(bundleId, seller.id, offerIds, twinIds);

        expect(bundle.isValid()).is.true;

        // How that bundle looks as a returned struct
        bundleStruct = bundle.toStruct();

        nextTwinId = "1";

        // Create a valid twin.
        twin = mockTwin(bosonToken.address);
        twin.sellerId = seller.id;
        // How that twin looks as a returned struct
        twinStruct = twin.toStruct();

        // create a seller
        await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(operator).approve(twinHandler.address, 1); // approving the twin handler
      });

      it("should emit an OfferCreated, a TwinCreated and a BundleCreated events", async function () {
        // Create an offer, a twin and a bundle, testing for the events
        const tx = await orchestrationHandler
          .connect(operator)
          .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId);

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            offerStruct,
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // TwinCreated event
        const eventTwinCreated = getEvent(txReceipt, orchestrationHandler, "TwinCreated");
        const twinInstance = Twin.fromStruct(eventTwinCreated.twin);
        // Validate the instance
        expect(twinInstance.isValid()).to.be.true;

        assert.equal(eventTwinCreated.twinId.toString(), twin.id, "Twin Id is incorrect");
        assert.equal(eventTwinCreated.sellerId.toString(), twin.sellerId, "Seller Id is incorrect");
        assert.equal(twinInstance.toString(), twin.toString(), "Twin struct is incorrect");

        // BundleCreated event
        const eventBundleCreated = getEvent(txReceipt, orchestrationHandler, "BundleCreated");
        const bundleInstance = Bundle.fromStruct(eventBundleCreated.bundle);
        // Validate the instance
        expect(bundleInstance.isValid()).to.be.true;

        assert.equal(eventBundleCreated.bundleId.toString(), bundle.id, "Bundle Id is incorrect");
        assert.equal(eventBundleCreated.sellerId.toString(), bundle.sellerId, "Seller Id is incorrect");
        assert.equal(bundleInstance.toString(), bundle.toString(), "Bundle struct is incorrect");
      });

      it("should update state", async function () {
        // Create an offer, a twin and a bundle
        await orchestrationHandler
          .connect(operator)
          .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId);

        // Get the offer as a struct
        [, offerStruct, offerDatesStruct, offerDurationsStruct, disputeResolutionTermsStruct] = await offerHandler
          .connect(rando)
          .getOffer(offer.id);

        // Parse into entities
        let returnedOffer = Offer.fromStruct(offerStruct);
        let returnedOfferDates = OfferDates.fromStruct(offerDatesStruct);
        let returnedOfferDurations = OfferDurations.fromStruct(offerDurationsStruct);
        let returnedDisputeResolutionTermsStruct = DisputeResolutionTerms.fromStruct(disputeResolutionTermsStruct);

        // Returned values should match the input in createSellerAndOffer
        for ([key, value] of Object.entries(offer)) {
          expect(JSON.stringify(returnedOffer[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDates)) {
          expect(JSON.stringify(returnedOfferDates[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDurations)) {
          expect(JSON.stringify(returnedOfferDurations[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(disputeResolutionTerms)) {
          expect(JSON.stringify(returnedDisputeResolutionTermsStruct[key]) === JSON.stringify(value)).is.true;
        }

        // Get the twin as a struct
        [, twinStruct] = await twinHandler.connect(rando).getTwin(nextTwinId);

        // Parse into entity
        const returnedTwin = Twin.fromStruct(twinStruct);

        // Returned values should match the input in createOfferAndTwinWithBundle
        for ([key, value] of Object.entries(twin)) {
          expect(JSON.stringify(returnedTwin[key]) === JSON.stringify(value)).is.true;
        }

        // Get the bundle as a struct
        [, bundleStruct] = await bundleHandler.connect(rando).getBundle(bundleId);

        // Parse into entity
        let returnedBundle = Bundle.fromStruct(bundleStruct);

        // Returned values should match what is expected for the silently created bundle
        for ([key, value] of Object.entries(bundle)) {
          expect(JSON.stringify(returnedBundle[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should ignore any provided ids and assign the next available", async function () {
        offer.id = "555";
        twin.id = "777";

        // Create an offer, a twin and a bundle, testing for the events
        const tx = await orchestrationHandler
          .connect(operator)
          .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId);

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            offerStruct,
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // TwinCreated event
        const eventTwinCreated = getEvent(txReceipt, orchestrationHandler, "TwinCreated");
        const twinInstance = Twin.fromStruct(eventTwinCreated.twin);
        // Validate the instance
        expect(twinInstance.isValid()).to.be.true;

        assert.equal(eventTwinCreated.twinId.toString(), nextTwinId, "Twin Id is incorrect");
        assert.equal(eventTwinCreated.sellerId.toString(), twin.sellerId, "Seller Id is incorrect");
        assert.equal(twinInstance.toString(), Twin.fromStruct(twinStruct).toString(), "Twin struct is incorrect");

        // BundleCreated event
        const eventBundleCreated = getEvent(txReceipt, orchestrationHandler, "BundleCreated");
        const bundleInstance = Bundle.fromStruct(eventBundleCreated.bundle);
        // Validate the instance
        expect(bundleInstance.isValid()).to.be.true;

        assert.equal(eventBundleCreated.bundleId.toString(), nextBundleId, "Bundle Id is incorrect");
        assert.equal(eventBundleCreated.sellerId.toString(), bundle.sellerId, "Seller Id is incorrect");
        assert.equal(
          bundleInstance.toString(),
          Bundle.fromStruct(bundleStruct).toString(),
          "Bundle struct is incorrect"
        );
      });

      it("should ignore any provided seller and assign seller id of msg.sender", async function () {
        // set some other seller.id
        offer.sellerId = "123";
        twin.sellerId = "456";

        // Create an offer, a twin and a bundle, testing for the events
        const tx = await orchestrationHandler
          .connect(operator)
          .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId);

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            offerStruct,
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // TwinCreated event
        const eventTwinCreated = getEvent(txReceipt, orchestrationHandler, "TwinCreated");
        const twinInstance = Twin.fromStruct(eventTwinCreated.twin);
        // Validate the instance
        expect(twinInstance.isValid()).to.be.true;

        assert.equal(eventTwinCreated.twinId.toString(), nextTwinId, "Twin Id is incorrect");
        assert.equal(eventTwinCreated.sellerId.toString(), seller.id, "Seller Id is incorrect");
        assert.equal(twinInstance.toString(), Twin.fromStruct(twinStruct).toString(), "Twin struct is incorrect");

        // BundleCreated event
        const eventBundleCreated = getEvent(txReceipt, orchestrationHandler, "BundleCreated");
        const bundleInstance = Bundle.fromStruct(eventBundleCreated.bundle);
        // Validate the instance
        expect(bundleInstance.isValid()).to.be.true;

        assert.equal(eventBundleCreated.bundleId.toString(), nextBundleId, "Bundle Id is incorrect");
        assert.equal(eventBundleCreated.sellerId.toString(), seller.id, "Seller Id is incorrect");
        assert.equal(
          bundleInstance.toString(),
          Bundle.fromStruct(bundleStruct).toString(),
          "Bundle struct is incorrect"
        );
      });

      it("If exchange token is $BOSON, fee should be flat boson fee", async function () {
        // Prepare an offer with $BOSON as exchange token
        offer.exchangeToken = bosonToken.address;
        disputeResolutionTermsStruct = new DisputeResolutionTerms(
          disputeResolver.id,
          disputeResolver.escalationResponsePeriod,
          DRFeeToken,
          applyPercentage(DRFeeToken, buyerEscalationDepositPercentage)
        ).toStruct();
        offerFees.protocolFee = protocolFeeFlatBoson;
        offerFeesStruct = offerFees.toStruct();

        // Create an offer, a twin and a bundle, testing for the events
        await expect(
          orchestrationHandler
            .connect(operator)
            .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            offer.toStruct(),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );
      });

      it("For absolute zero offers, dispute resolver can be unspecified", async function () {
        // Prepare an absolute zero offer
        offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = offerFees.protocolFee = "0";
        disputeResolver.id = "0";
        disputeResolutionTermsStruct = new DisputeResolutionTerms("0", "0", "0", "0").toStruct();
        offerFeesStruct = offerFees.toStruct();

        // Create an offer, a twin and a bundle, testing for the events
        await expect(
          orchestrationHandler
            .connect(operator)
            .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            offer.toStruct(),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );
      });

      it("Should allow creation of an offer with unlimited supply", async function () {
        // Prepare an offer with unlimited supply
        offer.quantityAvailable = ethers.constants.MaxUint256.toString();
        // Twin supply should be unlimited as well
        twin.supplyAvailable = ethers.constants.MaxUint256.toString();

        // Create an offer, a twin and a bundle, testing for the events
        await expect(
          orchestrationHandler
            .connect(operator)
            .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            offer.toStruct(),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );
      });

      it("Should use the correct dispute resolver fee", async function () {
        // Create an offer in native currency
        await expect(
          orchestrationHandler
            .connect(operator)
            .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            offer.id,
            seller.id,
            offerStruct,
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );

        // create another offer, now with bosonToken as exchange token
        offer.exchangeToken = bosonToken.address;
        offer.id = "2";
        disputeResolutionTermsStruct = new DisputeResolutionTerms(
          disputeResolver.id,
          disputeResolver.escalationResponsePeriod,
          DRFeeToken,
          applyPercentage(DRFeeToken, buyerEscalationDepositPercentage)
        ).toStruct();
        offerFees.protocolFee = protocolFeeFlatBoson;
        offerFeesStruct = offerFees.toStruct();

        // Create an offer in boson token
        await expect(
          orchestrationHandler
            .connect(operator)
            .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            offer.id,
            seller.id,
            offer.toStruct(),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );
      });

      it("Should allow creation of an offer if DR has a sellerAllowList and seller is on it", async function () {
        // add seller to allow list
        allowedSellersToAdd = ["2"]; // DR is "1", existing seller is "2", new seller is "3"
        await accountHandler.connect(adminDR).addSellersToAllowList(disputeResolver.id, allowedSellersToAdd);

        // Create an offer, a twin and a bundle, testing for the events
        await expect(
          orchestrationHandler
            .connect(operator)
            .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
        ).to.emit(orchestrationHandler, "OfferCreated");
      });

      context("💔 Revert Reasons", async function () {
        it("The orchestration region of protocol is paused", async function () {
          // Pause the orchestration region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Orchestration]);

          // Attempt to orchestrate expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("The offers region of protocol is paused", async function () {
          // Pause the offers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Offers]);

          // Attempt to create a offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("The bundles region of protocol is paused", async function () {
          // Pause the bundles region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Bundles]);

          // Attempt to create a bundle, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("The twins region of protocol is paused", async function () {
          // Pause the twins region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Twins]);

          // Attempt to create a twin, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("Caller not operator of any seller", async function () {
          // Attempt to create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler
              .connect(rando)
              .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
          ).to.revertedWith(RevertReasons.NOT_OPERATOR);
        });

        it("Valid from date is greater than valid until date", async function () {
          // Reverse the from and until dates
          offerDates.validFrom = ethers.BigNumber.from(Date.now() + oneMonth * 6).toString(); // 6 months from now
          offerDates.validUntil = ethers.BigNumber.from(Date.now()).toString(); // now

          // Attempt to create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Valid until date is not in the future", async function () {
          // Set until date in the past
          offerDates.validUntil = ethers.BigNumber.from(Date.now() - oneMonth * 6).toString(); // 6 months ago

          // Attempt to create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
          ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Buyer cancel penalty is less than item price", async function () {
          // Set buyer cancel penalty higher than offer price
          offer.buyerCancelPenalty = ethers.BigNumber.from(offer.price).add(10).toString();

          // Attempt to create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
          ).to.revertedWith(RevertReasons.OFFER_PENALTY_INVALID);
        });

        it("Offer cannot be voided at the time of the creation", async function () {
          // Set voided flag to true
          offer.voided = true;

          // Attempt to create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
          ).to.revertedWith(RevertReasons.OFFER_MUST_BE_ACTIVE);
        });

        it("Both voucher expiration date and voucher expiraton period are defined", async function () {
          // Set both voucherRedeemableUntil and voucherValid
          offerDates.voucherRedeemableUntil = (Number(offerDates.voucherRedeemableFrom) + oneMonth).toString();
          offerDurations.voucherValid = oneMonth.toString();

          // Attempt to create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
          ).to.revertedWith(RevertReasons.AMBIGUOUS_VOUCHER_EXPIRY);
        });

        it("Neither of voucher expiration date and voucher expiraton period are defined", async function () {
          // Set both voucherRedeemableUntil and voucherValid to "0"
          offerDates.voucherRedeemableUntil = "0";
          offerDurations.voucherValid = "0";

          // Attempt to create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
          ).to.revertedWith(RevertReasons.AMBIGUOUS_VOUCHER_EXPIRY);
        });

        it("Voucher redeemable period is fixed, but it ends before it starts", async function () {
          // Set both voucherRedeemableUntil that is less than voucherRedeemableFrom
          offerDates.voucherRedeemableUntil = (Number(offerDates.voucherRedeemableFrom) - 10).toString();
          offerDurations.voucherValid = "0";

          // Attempt to create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
          ).to.revertedWith(RevertReasons.REDEMPTION_PERIOD_INVALID);
        });

        it("Voucher redeemable period is fixed, but it ends before offer expires", async function () {
          // Set both voucherRedeemableUntil that is more than voucherRedeemableFrom but less than validUntil
          offerDates.voucherRedeemableFrom = "0";
          offerDates.voucherRedeemableUntil = (Number(offerDates.validUntil) - 10).toString();
          offerDurations.voucherValid = "0";

          // Attempt to create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
          ).to.revertedWith(RevertReasons.REDEMPTION_PERIOD_INVALID);
        });

        it("Fulfillment period is set to zero", async function () {
          // Set fulfilment period to 0
          offerDurations.fulfillmentPeriod = "0";

          // Attempt to create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
          ).to.revertedWith(RevertReasons.INVALID_FULFILLMENT_PERIOD);
        });

        it("Resolution period is set to zero", async function () {
          // Set dispute duration period to 0
          offerDurations.resolutionPeriod = "0";

          // Attempt to create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_DURATION);
        });

        it("Available quantity is set to zero", async function () {
          // Set available quantity to 0
          offer.quantityAvailable = "0";

          // Attempt to create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
          ).to.revertedWith(RevertReasons.INVALID_QUANTITY_AVAILABLE);
        });

        it("Dispute resolver wallet is not registered", async function () {
          // Set some address that is not registered as a dispute resolver
          disputeResolver.id = "16";

          // Attempt to create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        it("Dispute resolver is not active", async function () {
          // create another dispute resolver, but don't activate it
          disputeResolver = mockDisputeResolver(rando.address, rando.address, rando.address, rando.address, false);
          await accountHandler
            .connect(rando)
            .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

          // Attempt to create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        it("For absolute zero offer, specified dispute resolver is not registered", async function () {
          // Prepare an absolute zero offer, but specify dispute resolver
          offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = offerFees.protocolFee = "0";
          disputeResolver.id = "16";

          // Attempt to create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        it("For absolute zero offer, specified dispute resolver is not active", async function () {
          // create another dispute resolver, but don't activate it
          disputeResolver = mockDisputeResolver(rando.address, rando.address, rando.address, rando.address, false);
          await accountHandler
            .connect(rando)
            .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

          // Prepare an absolute zero offer, but specify dispute resolver
          offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = offerFees.protocolFee = "0";

          // Attempt to create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
          ).to.revertedWith(RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        it("Seller is not on dispute resolver's seller allow list", async function () {
          // Create new seller so sellerAllowList can have an entry
          const newSeller = mockSeller(rando.address, rando.address, rando.address, rando.address);

          await accountHandler.connect(rando).createSeller(newSeller, emptyAuthToken, voucherInitValues);

          allowedSellersToAdd = ["3"]; // DR is "1", existing seller is "2", new seller is "3"
          await accountHandler.connect(adminDR).addSellersToAllowList(disputeResolver.id, allowedSellersToAdd);

          // Attempt to create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
          ).to.revertedWith(RevertReasons.SELLER_NOT_APPROVED);
        });

        it("Dispute resolver does not accept fees in the exchange token", async function () {
          // Set some address that is not part of dispute resolver fees
          offer.exchangeToken = rando.address;

          // Attempt to create an offer, twin and bundle, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
          ).to.revertedWith(RevertReasons.DR_UNSUPPORTED_FEE);
        });

        it("should revert if protocol is not approved to transfer the ERC20 token", async function () {
          // Approving the twinHandler contract to transfer seller's tokens
          await bosonToken.connect(operator).approve(twinHandler.address, 0); // approving the twin handler

          //ERC20 token address
          twin.tokenAddress = bosonToken.address;

          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
          ).to.revertedWith(RevertReasons.NO_TRANSFER_APPROVED);
        });

        it("should revert if protocol is not approved to transfer the ERC721 token", async function () {
          //ERC721 token address
          twin.tokenAddress = foreign721.address;

          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
          ).to.revertedWith(RevertReasons.NO_TRANSFER_APPROVED);
        });

        it("should revert if protocol is not approved to transfer the ERC1155 token", async function () {
          //ERC1155 token address
          twin.tokenAddress = foreign1155.address;

          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
          ).to.revertedWith(RevertReasons.NO_TRANSFER_APPROVED);
        });

        context("Token address is unsupported", async function () {
          it("Token address is a zero address", async function () {
            twin.tokenAddress = ethers.constants.AddressZero;

            await expect(
              orchestrationHandler
                .connect(operator)
                .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
            ).to.be.revertedWith(RevertReasons.UNSUPPORTED_TOKEN);
          });

          it("Token address is a contract address that does not support the isApprovedForAll", async function () {
            twin.tokenAddress = twinHandler.address;

            await expect(
              orchestrationHandler
                .connect(operator)
                .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
            ).to.be.revertedWith(RevertReasons.UNSUPPORTED_TOKEN);
          });

          it("Token address is a contract that reverts from a fallback method", async function () {
            twin.tokenAddress = fallbackError.address;

            await expect(
              orchestrationHandler
                .connect(operator)
                .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
            ).to.be.revertedWith(RevertReasons.UNSUPPORTED_TOKEN);
          });
        });
      });

      context("When offers have non zero agent ids", async function () {
        beforeEach(async function () {
          // Required constructor params
          agentId = "3"; // argument sent to contract for createAgent will be ignored

          // Create a valid agent, then set fields in tests directly
          agent = mockAgent(other1.address);
          agent.id = agentId;
          expect(agent.isValid()).is.true;

          // Create an agent
          await accountHandler.connect(rando).createAgent(agent);

          agentFee = ethers.BigNumber.from(offer.price).mul(agent.feePercentage).div("10000").toString();
          offerFees.agentFee = agentFee;
          offerFeesStruct = offerFees.toStruct();
        });

        it("should emit an OfferCreated, a TwinCreated and a BundleCreated events", async function () {
          // Create an offer, a twin and a bundle, testing for the events
          const tx = await orchestrationHandler
            .connect(operator)
            .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId);

          // OfferCreated event
          await expect(tx)
            .to.emit(orchestrationHandler, "OfferCreated")
            .withArgs(
              nextOfferId,
              seller.id,
              offerStruct,
              offerDatesStruct,
              offerDurationsStruct,
              disputeResolutionTermsStruct,
              offerFeesStruct,
              agentId,
              operator.address
            );

          // Events with structs that contain arrays must be tested differently
          const txReceipt = await tx.wait();

          // TwinCreated event
          const eventTwinCreated = getEvent(txReceipt, orchestrationHandler, "TwinCreated");
          const twinInstance = Twin.fromStruct(eventTwinCreated.twin);
          // Validate the instance
          expect(twinInstance.isValid()).to.be.true;

          assert.equal(eventTwinCreated.twinId.toString(), twin.id, "Twin Id is incorrect");
          assert.equal(eventTwinCreated.sellerId.toString(), twin.sellerId, "Seller Id is incorrect");
          assert.equal(twinInstance.toString(), twin.toString(), "Twin struct is incorrect");

          // BundleCreated event
          const eventBundleCreated = getEvent(txReceipt, orchestrationHandler, "BundleCreated");
          const bundleInstance = Bundle.fromStruct(eventBundleCreated.bundle);
          // Validate the instance
          expect(bundleInstance.isValid()).to.be.true;

          assert.equal(eventBundleCreated.bundleId.toString(), bundle.id, "Bundle Id is incorrect");
          assert.equal(eventBundleCreated.sellerId.toString(), bundle.sellerId, "Seller Id is incorrect");
          assert.equal(bundleInstance.toString(), bundle.toString(), "Bundle struct is incorrect");
        });

        context("💔 Revert Reasons", async function () {
          it("Agent does not exist", async function () {
            // Set an agent id that does not exist
            let agentId = "16";

            // Attempt to Create an offer, expecting revert
            await expect(
              orchestrationHandler
                .connect(operator)
                .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agentId)
            ).to.revertedWith(RevertReasons.NO_SUCH_AGENT);
          });

          it("Sum of Agent fee amount and protocol fee amount should be <= than the offer fee limit", async function () {
            // Create new agent
            let id = "4"; // argument sent to contract for createAgent will be ignored

            // Create a valid agent, then set fields in tests directly
            agent = mockAgent(operator.address);
            agent.id = id;
            agent.feePercentage = "3000"; //30%
            expect(agent.isValid()).is.true;

            // Create an agent
            await accountHandler.connect(rando).createAgent(agent);

            //Change protocol fee after creating agent
            await configHandler.connect(protocolAdmin).setProtocolFeePercentage("1100"); //11%

            // Attempt to Create an offer, expecting revert
            await expect(
              orchestrationHandler
                .connect(operator)
                .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolver.id, twin, agent.id)
            ).to.revertedWith(RevertReasons.AGENT_FEE_AMOUNT_TOO_HIGH);
          });
        });
      });
    });

    context("👉 createOfferWithConditionAndTwinAndBundle()", async function () {
      beforeEach(async function () {
        // prepare a group struct. We are not passing it as an argument, but just need to validate.
        // The first group id
        nextGroupId = "1";

        // Required constructor params for Group
        offerIds = ["1"];

        condition = mockCondition({ tokenType: TokenType.MultiToken, tokenAddress: other3.address, tokenId: "5150" });
        expect(condition.isValid()).to.be.true;

        group = new Group(nextGroupId, seller.id, offerIds);

        expect(group.isValid()).is.true;

        // How that group looks as a returned struct
        groupStruct = group.toStruct();

        // prepare a bundle struct. We are not passing it as an argument, but just need to validate.
        // The first bundle id
        bundleId = nextBundleId = "1";

        // Required constructor params for Bundle
        offerIds = ["1"];
        twinIds = ["1"];

        bundle = new Bundle(bundleId, seller.id, offerIds, twinIds);

        expect(bundle.isValid()).is.true;

        // How that bundle looks as a returned struct
        bundleStruct = bundle.toStruct();

        nextTwinId = "1";
        // Create a valid twin.
        twin = mockTwin(bosonToken.address);
        twin.sellerId = seller.id;

        // How that twin looks as a returned struct
        twinStruct = twin.toStruct();

        // create a seller
        await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(operator).approve(twinHandler.address, 1); // approving the twin handler
      });

      it("should emit an OfferCreated, a GroupCreated, a TwinCreated and a BundleCreated events", async function () {
        // Create an offer with condition, twin and bundle
        const tx = await orchestrationHandler
          .connect(operator)
          .createOfferWithConditionAndTwinAndBundle(
            offer,
            offerDates,
            offerDurations,
            disputeResolver.id,
            condition,
            twin,
            agentId
          );

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            offerStruct,
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // GroupCreated event
        const eventGroupCreated = getEvent(txReceipt, orchestrationHandler, "GroupCreated");
        const groupInstance = Group.fromStruct(eventGroupCreated.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(eventGroupCreated.groupId.toString(), group.id, "Group Id is incorrect");
        assert.equal(eventGroupCreated.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");

        // TwinCreated event
        const eventTwinCreated = getEvent(txReceipt, orchestrationHandler, "TwinCreated");
        const twinInstance = Twin.fromStruct(eventTwinCreated.twin);
        // Validate the instance
        expect(twinInstance.isValid()).to.be.true;

        assert.equal(eventTwinCreated.twinId.toString(), twin.id, "Twin Id is incorrect");
        assert.equal(eventTwinCreated.sellerId.toString(), twin.sellerId, "Seller Id is incorrect");
        assert.equal(twinInstance.toString(), twin.toString(), "Twin struct is incorrect");

        // BundleCreated event
        const eventBundleCreated = getEvent(txReceipt, orchestrationHandler, "BundleCreated");
        const bundleInstance = Bundle.fromStruct(eventBundleCreated.bundle);
        // Validate the instance
        expect(bundleInstance.isValid()).to.be.true;

        assert.equal(eventBundleCreated.bundleId.toString(), bundle.id, "Bundle Id is incorrect");
        assert.equal(eventBundleCreated.sellerId.toString(), bundle.sellerId, "Seller Id is incorrect");
        assert.equal(bundleInstance.toString(), bundle.toString(), "Bundle struct is incorrect");
      });

      it("should update state", async function () {
        // Create an offer with condition, twin and bundle
        await orchestrationHandler
          .connect(operator)
          .createOfferWithConditionAndTwinAndBundle(
            offer,
            offerDates,
            offerDurations,
            disputeResolver.id,
            condition,
            twin,
            agentId
          );

        // Get the offer as a struct
        [, offerStruct, offerDatesStruct, offerDurationsStruct, disputeResolutionTermsStruct] = await offerHandler
          .connect(rando)
          .getOffer(offer.id);

        // Parse into entities
        let returnedOffer = Offer.fromStruct(offerStruct);
        let returnedOfferDates = OfferDates.fromStruct(offerDatesStruct);
        let returnedOfferDurations = OfferDurations.fromStruct(offerDurationsStruct);
        let returnedDisputeResolutionTermsStruct = DisputeResolutionTerms.fromStruct(disputeResolutionTermsStruct);

        // Returned values should match the input in createSellerAndOffer
        for ([key, value] of Object.entries(offer)) {
          expect(JSON.stringify(returnedOffer[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDates)) {
          expect(JSON.stringify(returnedOfferDates[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDurations)) {
          expect(JSON.stringify(returnedOfferDurations[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(disputeResolutionTerms)) {
          expect(JSON.stringify(returnedDisputeResolutionTermsStruct[key]) === JSON.stringify(value)).is.true;
        }

        // Get the group as a struct
        [, groupStruct, conditionStruct] = await groupHandler.connect(rando).getGroup(nextGroupId);

        // Parse into entity
        const returnedGroup = Group.fromStruct(groupStruct);

        // Returned values should match what is expected for the silently created group
        for ([key, value] of Object.entries(group)) {
          expect(JSON.stringify(returnedGroup[key]) === JSON.stringify(value)).is.true;
        }

        // Parse into entity
        const returnedCondition = Condition.fromStruct(conditionStruct);

        // Returned values should match the condition
        for ([key, value] of Object.entries(condition)) {
          expect(JSON.stringify(returnedCondition[key]) === JSON.stringify(value)).is.true;
        }

        // Get the twin as a struct
        [, twinStruct] = await twinHandler.connect(rando).getTwin(nextTwinId);

        // Parse into entity
        const returnedTwin = Twin.fromStruct(twinStruct);

        // Returned values should match the input in createOfferWithConditionAndTwinAndBundle
        for ([key, value] of Object.entries(twin)) {
          expect(JSON.stringify(returnedTwin[key]) === JSON.stringify(value)).is.true;
        }

        // Get the bundle as a struct
        [, bundleStruct] = await bundleHandler.connect(rando).getBundle(bundleId);

        // Parse into entity
        let returnedBundle = Bundle.fromStruct(bundleStruct);

        // Returned values should match what is expected for the silently created bundle
        for ([key, value] of Object.entries(bundle)) {
          expect(JSON.stringify(returnedBundle[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should ignore any provided ids and assign the next available", async function () {
        offer.id = "555";
        twin.id = "777";

        // Create an offer with condition, twin and bundle
        const tx = await orchestrationHandler
          .connect(operator)
          .createOfferWithConditionAndTwinAndBundle(
            offer,
            offerDates,
            offerDurations,
            disputeResolver.id,
            condition,
            twin,
            agentId
          );

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            offerStruct,
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // GroupCreated event
        const eventGroupCreated = getEvent(txReceipt, orchestrationHandler, "GroupCreated");
        const groupInstance = Group.fromStruct(eventGroupCreated.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(eventGroupCreated.groupId.toString(), nextGroupId, "Group Id is incorrect");
        assert.equal(eventGroupCreated.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");

        // TwinCreated event
        const eventTwinCreated = getEvent(txReceipt, orchestrationHandler, "TwinCreated");
        const twinInstance = Twin.fromStruct(eventTwinCreated.twin);
        // Validate the instance
        expect(twinInstance.isValid()).to.be.true;

        assert.equal(eventTwinCreated.twinId.toString(), nextTwinId, "Twin Id is incorrect");
        assert.equal(eventTwinCreated.sellerId.toString(), twin.sellerId, "Seller Id is incorrect");
        assert.equal(twinInstance.toString(), Twin.fromStruct(twinStruct).toString(), "Twin struct is incorrect");

        // BundleCreated event
        const eventBundleCreated = getEvent(txReceipt, orchestrationHandler, "BundleCreated");
        const bundleInstance = Bundle.fromStruct(eventBundleCreated.bundle);
        // Validate the instance
        expect(bundleInstance.isValid()).to.be.true;

        assert.equal(eventBundleCreated.bundleId.toString(), nextBundleId, "Bundle Id is incorrect");
        assert.equal(eventBundleCreated.sellerId.toString(), bundle.sellerId, "Seller Id is incorrect");
        assert.equal(
          bundleInstance.toString(),
          Bundle.fromStruct(bundleStruct).toString(),
          "Bundle struct is incorrect"
        );
      });

      it("should ignore any provided seller and assign seller id of msg.sender", async function () {
        // set some other seller.id
        offer.sellerId = "123";
        twin.sellerId = "456";

        // Create an offer with condition, twin and bundle
        const tx = await orchestrationHandler
          .connect(operator)
          .createOfferWithConditionAndTwinAndBundle(
            offer,
            offerDates,
            offerDurations,
            disputeResolver.id,
            condition,
            twin,
            agentId
          );

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            offerStruct,
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // GroupCreated event
        const eventGroupCreated = getEvent(txReceipt, orchestrationHandler, "GroupCreated");
        const groupInstance = Group.fromStruct(eventGroupCreated.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(eventGroupCreated.groupId.toString(), nextGroupId, "Group Id is incorrect");
        assert.equal(eventGroupCreated.sellerId.toString(), seller.id, "Seller Id is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");

        // TwinCreated event
        const eventTwinCreated = getEvent(txReceipt, orchestrationHandler, "TwinCreated");
        const twinInstance = Twin.fromStruct(eventTwinCreated.twin);
        // Validate the instance
        expect(twinInstance.isValid()).to.be.true;

        assert.equal(eventTwinCreated.twinId.toString(), nextTwinId, "Twin Id is incorrect");
        assert.equal(eventTwinCreated.sellerId.toString(), seller.id, "Seller Id is incorrect");
        assert.equal(twinInstance.toString(), Twin.fromStruct(twinStruct).toString(), "Twin struct is incorrect");

        // BundleCreated event
        const eventBundleCreated = getEvent(txReceipt, orchestrationHandler, "BundleCreated");
        const bundleInstance = Bundle.fromStruct(eventBundleCreated.bundle);
        // Validate the instance
        expect(bundleInstance.isValid()).to.be.true;

        assert.equal(eventBundleCreated.bundleId.toString(), nextBundleId, "Bundle Id is incorrect");
        assert.equal(eventBundleCreated.sellerId.toString(), seller.id, "Seller Id is incorrect");
        assert.equal(
          bundleInstance.toString(),
          Bundle.fromStruct(bundleStruct).toString(),
          "Bundle struct is incorrect"
        );
      });

      it("If exchange token is $BOSON, fee should be flat boson fee", async function () {
        // Prepare an offer with $BOSON as exchange token
        offer.exchangeToken = bosonToken.address;
        disputeResolutionTermsStruct = new DisputeResolutionTerms(
          disputeResolver.id,
          disputeResolver.escalationResponsePeriod,
          DRFeeToken,
          applyPercentage(DRFeeToken, buyerEscalationDepositPercentage)
        ).toStruct();
        offerFees.protocolFee = protocolFeeFlatBoson;
        offerFeesStruct = offerFees.toStruct();

        // Create an offer with condition, twin and bundle testing for the events
        await expect(
          orchestrationHandler
            .connect(operator)
            .createOfferWithConditionAndTwinAndBundle(
              offer,
              offerDates,
              offerDurations,
              disputeResolver.id,
              condition,
              twin,
              agentId
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            offer.toStruct(),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );
      });

      it("For absolute zero offers, dispute resolver can be unspecified", async function () {
        // Prepare an absolute zero offer
        offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = offerFees.protocolFee = "0";
        disputeResolver.id = "0";
        disputeResolutionTermsStruct = new DisputeResolutionTerms("0", "0", "0", "0").toStruct();
        offerFeesStruct = offerFees.toStruct();

        // Create an offer with condition, twin and bundle testing for the events
        await expect(
          orchestrationHandler
            .connect(operator)
            .createOfferWithConditionAndTwinAndBundle(
              offer,
              offerDates,
              offerDurations,
              disputeResolver.id,
              condition,
              twin,
              agentId
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            offer.toStruct(),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );
      });

      it("Should allow creation of an offer with unlimited supply", async function () {
        // Prepare an offer with unlimited supply
        offer.quantityAvailable = ethers.constants.MaxUint256.toString();
        // Twin supply should be unlimited as well
        twin.supplyAvailable = ethers.constants.MaxUint256.toString();

        // Create an offer with condition, twin and bundle testing for the events
        await expect(
          orchestrationHandler
            .connect(operator)
            .createOfferWithConditionAndTwinAndBundle(
              offer,
              offerDates,
              offerDurations,
              disputeResolver.id,
              condition,
              twin,
              agentId
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            offer.toStruct(),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );
      });

      it("Should use the correct dispute resolver fee", async function () {
        // Create an offer in native currency
        await expect(
          orchestrationHandler
            .connect(operator)
            .createOfferWithConditionAndTwinAndBundle(
              offer,
              offerDates,
              offerDurations,
              disputeResolver.id,
              condition,
              twin,
              agentId
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            offer.id,
            seller.id,
            offerStruct,
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );

        // create another offer, now with bosonToken as exchange token
        offer.exchangeToken = bosonToken.address;
        offer.id = "2";
        disputeResolutionTermsStruct = new DisputeResolutionTerms(
          disputeResolver.id,
          disputeResolver.escalationResponsePeriod,
          DRFeeToken,
          applyPercentage(DRFeeToken, buyerEscalationDepositPercentage)
        ).toStruct();
        offerFees.protocolFee = protocolFeeFlatBoson;
        offerFeesStruct = offerFees.toStruct();

        // Create an offer in boson token
        await expect(
          orchestrationHandler
            .connect(operator)
            .createOfferWithConditionAndTwinAndBundle(
              offer,
              offerDates,
              offerDurations,
              disputeResolver.id,
              condition,
              twin,
              agentId
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            offer.id,
            seller.id,
            offer.toStruct(),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );
      });

      it("Should allow creation of an offer if DR has a sellerAllowList and seller is on it", async function () {
        // add seller to allow list
        allowedSellersToAdd = ["2"]; // DR is "1", existing seller is "2", new seller is "3"
        await accountHandler.connect(adminDR).addSellersToAllowList(disputeResolver.id, allowedSellersToAdd);

        // Create an offer with condition, twin and bundle testing for the events
        await expect(
          orchestrationHandler
            .connect(operator)
            .createOfferWithConditionAndTwinAndBundle(
              offer,
              offerDates,
              offerDurations,
              disputeResolver.id,
              condition,
              twin,
              agentId
            )
        ).to.emit(orchestrationHandler, "OfferCreated");
      });

      context("When offers have non zero agent ids", async function () {
        beforeEach(async function () {
          // Required constructor params
          agentId = "3"; // argument sent to contract for createAgent will be ignored

          // Create a valid agent, then set fields in tests directly
          agent = mockAgent(other1.address);
          agent.id = agentId;
          agent.feePercentage = "3000"; // 30%
          expect(agent.isValid()).is.true;

          // Create an agent
          await accountHandler.connect(rando).createAgent(agent);

          agentFee = ethers.BigNumber.from(offer.price).mul(agent.feePercentage).div("10000").toString();
          offerFees.agentFee = agentFee;
          offerFeesStruct = offerFees.toStruct();
        });

        it("should emit an OfferCreated, a GroupCreated, a TwinCreated and a BundleCreated events", async function () {
          // Create an offer with condition, twin and bundle
          const tx = await orchestrationHandler
            .connect(operator)
            .createOfferWithConditionAndTwinAndBundle(
              offer,
              offerDates,
              offerDurations,
              disputeResolver.id,
              condition,
              twin,
              agentId
            );

          // OfferCreated event
          await expect(tx)
            .to.emit(orchestrationHandler, "OfferCreated")
            .withArgs(
              nextOfferId,
              seller.id,
              offerStruct,
              offerDatesStruct,
              offerDurationsStruct,
              disputeResolutionTermsStruct,
              offerFeesStruct,
              agentId,
              operator.address
            );

          // Events with structs that contain arrays must be tested differently
          const txReceipt = await tx.wait();

          // GroupCreated event
          const eventGroupCreated = getEvent(txReceipt, orchestrationHandler, "GroupCreated");
          const groupInstance = Group.fromStruct(eventGroupCreated.group);
          // Validate the instance
          expect(groupInstance.isValid()).to.be.true;

          assert.equal(eventGroupCreated.groupId.toString(), group.id, "Group Id is incorrect");
          assert.equal(eventGroupCreated.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
          assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");

          // TwinCreated event
          const eventTwinCreated = getEvent(txReceipt, orchestrationHandler, "TwinCreated");
          const twinInstance = Twin.fromStruct(eventTwinCreated.twin);
          // Validate the instance
          expect(twinInstance.isValid()).to.be.true;

          assert.equal(eventTwinCreated.twinId.toString(), twin.id, "Twin Id is incorrect");
          assert.equal(eventTwinCreated.sellerId.toString(), twin.sellerId, "Seller Id is incorrect");
          assert.equal(twinInstance.toString(), twin.toString(), "Twin struct is incorrect");

          // BundleCreated event
          const eventBundleCreated = getEvent(txReceipt, orchestrationHandler, "BundleCreated");
          const bundleInstance = Bundle.fromStruct(eventBundleCreated.bundle);
          // Validate the instance
          expect(bundleInstance.isValid()).to.be.true;

          assert.equal(eventBundleCreated.bundleId.toString(), bundle.id, "Bundle Id is incorrect");
          assert.equal(eventBundleCreated.sellerId.toString(), bundle.sellerId, "Seller Id is incorrect");
          assert.equal(bundleInstance.toString(), bundle.toString(), "Bundle struct is incorrect");
        });

        context("💔 Revert Reasons", async function () {
          it("Agent does not exist", async function () {
            // Set an agent id that does not exist
            let agentId = "16";

            // Attempt to Create an offer, expecting revert
            await expect(
              orchestrationHandler
                .connect(operator)
                .createOfferWithConditionAndTwinAndBundle(
                  offer,
                  offerDates,
                  offerDurations,
                  disputeResolver.id,
                  condition,
                  twin,
                  agentId
                )
            ).to.revertedWith(RevertReasons.NO_SUCH_AGENT);
          });

          it("Sum of Agent fee amount and protocol fee amount should be <= than the offer fee limit", async function () {
            // Create new agent
            let id = "4"; // argument sent to contract for createAgent will be ignored

            // Create a valid agent, then set fields in tests directly
            agent = mockAgent(operator.address);
            agent.id = id;
            agent.feePercentage = "3000"; //30%
            expect(agent.isValid()).is.true;

            // Create an agent
            await accountHandler.connect(rando).createAgent(agent);

            //Change protocol fee after creating agent
            await configHandler.connect(protocolAdmin).setProtocolFeePercentage("1100"); //11%

            // Attempt to Create an offer, expecting revert
            await expect(
              orchestrationHandler
                .connect(operator)
                .createOfferWithConditionAndTwinAndBundle(
                  offer,
                  offerDates,
                  offerDurations,
                  disputeResolver.id,
                  condition,
                  twin,
                  agent.id
                )
            ).to.revertedWith(RevertReasons.AGENT_FEE_AMOUNT_TOO_HIGH);
          });
        });
      });

      context("💔 Revert Reasons", async function () {
        it("The orchestration region of protocol is paused", async function () {
          // Pause the orchestration region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Orchestration]);

          // Attempt to orchestrate expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithConditionAndTwinAndBundle(
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                condition,
                twin,
                agentId
              )
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("The offers region of protocol is paused", async function () {
          // Pause the offers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Offers]);

          // Attempt to create an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithConditionAndTwinAndBundle(
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                condition,
                twin,
                agentId
              )
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("The groups region of protocol is paused", async function () {
          // Pause the groups region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Groups]);

          // Attempt to create a group, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithConditionAndTwinAndBundle(
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                condition,
                twin,
                agentId
              )
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("The bundles region of protocol is paused", async function () {
          // Pause the bundles region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Bundles]);

          // Attempt to create a bundle, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithConditionAndTwinAndBundle(
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                condition,
                twin,
                agentId
              )
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("The twins region of protocol is paused", async function () {
          // Pause the twins region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Twins]);

          // Attempt to create a twin, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createOfferWithConditionAndTwinAndBundle(
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                condition,
                twin,
                agentId
              )
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });
      });
    });

    context("👉 createSellerAndOfferWithCondition()", async function () {
      beforeEach(async function () {
        // prepare a group struct. We are not passing it as an argument, but just need to validate.

        // The first group id
        nextGroupId = "1";

        // Required constructor params for Group
        offerIds = ["1"];

        condition = mockCondition({ tokenType: TokenType.MultiToken, tokenAddress: other3.address, tokenId: "5150" });
        expect(condition.isValid()).to.be.true;

        group = new Group(nextGroupId, seller.id, offerIds);

        expect(group.isValid()).is.true;

        // How that group looks as a returned struct
        groupStruct = group.toStruct();
      });

      it("should emit a SellerCreated, an OfferCreated, and a GroupCreated event", async function () {
        // Create a seller and an offer with condition, testing for the events
        const tx = await orchestrationHandler
          .connect(operator)
          .createSellerAndOfferWithCondition(
            seller,
            offer,
            offerDates,
            offerDurations,
            disputeResolver.id,
            condition,
            emptyAuthToken,
            voucherInitValues,
            agentId
          );

        expectedCloneAddress = calculateContractAddress(orchestrationHandler.address, "1");

        // SellerCreated and OfferCreated events
        await expect(tx)
          .to.emit(orchestrationHandler, "SellerCreated")
          .withArgs(seller.id, sellerStruct, expectedCloneAddress, emptyAuthTokenStruct, operator.address);

        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            offerStruct,
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // GroupCreated event
        const eventGroupCreated = getEvent(txReceipt, orchestrationHandler, "GroupCreated");
        const groupInstance = Group.fromStruct(eventGroupCreated.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(eventGroupCreated.groupId.toString(), group.id, "Group Id is incorrect");
        assert.equal(eventGroupCreated.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");

        // Voucher clone contract
        bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);

        await expect(tx).to.emit(bosonVoucher, "ContractURIChanged").withArgs(contractURI);
        await expect(tx)
          .to.emit(bosonVoucher, "RoyaltyPercentageChanged")
          .withArgs(voucherInitValues.royaltyPercentage);

        bosonVoucher = await ethers.getContractAt("OwnableUpgradeable", expectedCloneAddress);

        await expect(tx)
          .to.emit(bosonVoucher, "OwnershipTransferred")
          .withArgs(ethers.constants.AddressZero, operator.address);
      });

      it("should update state", async function () {
        // Create a seller and an offer with condition
        await orchestrationHandler
          .connect(operator)
          .createSellerAndOfferWithCondition(
            seller,
            offer,
            offerDates,
            offerDurations,
            disputeResolver.id,
            condition,
            emptyAuthToken,
            voucherInitValues,
            agentId
          );

        // Get the seller as a struct
        [, sellerStruct, authTokenStruct] = await accountHandler.connect(rando).getSeller(seller.id);

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);
        let returnedAuthToken = AuthToken.fromStruct(authTokenStruct);

        // Returned values should match the input in createSellerAndOfferWithCondition
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }

        // Returned auth token values should match the input in createSeller
        for ([key, value] of Object.entries(emptyAuthToken)) {
          expect(JSON.stringify(returnedAuthToken[key]) === JSON.stringify(value)).is.true;
        }

        // Get the offer as a struct
        [, offerStruct, offerDatesStruct, offerDurationsStruct, disputeResolutionTermsStruct] = await offerHandler
          .connect(rando)
          .getOffer(offer.id);

        // Parse into entities
        let returnedOffer = Offer.fromStruct(offerStruct);
        let returnedOfferDates = OfferDates.fromStruct(offerDatesStruct);
        let returnedOfferDurations = OfferDurations.fromStruct(offerDurationsStruct);
        let returnedDisputeResolutionTermsStruct = DisputeResolutionTerms.fromStruct(disputeResolutionTermsStruct);

        // Returned values should match the input in createSellerAndOffer
        for ([key, value] of Object.entries(offer)) {
          expect(JSON.stringify(returnedOffer[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDates)) {
          expect(JSON.stringify(returnedOfferDates[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDurations)) {
          expect(JSON.stringify(returnedOfferDurations[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(disputeResolutionTerms)) {
          expect(JSON.stringify(returnedDisputeResolutionTermsStruct[key]) === JSON.stringify(value)).is.true;
        }

        // Get the group as a struct
        [, groupStruct, conditionStruct] = await groupHandler.connect(rando).getGroup(nextGroupId);

        // Parse into entity
        const returnedGroup = Group.fromStruct(groupStruct);

        // Returned values should match what is expected for the silently created group
        for ([key, value] of Object.entries(group)) {
          expect(JSON.stringify(returnedGroup[key]) === JSON.stringify(value)).is.true;
        }

        // Parse into entity
        const returnedCondition = Condition.fromStruct(conditionStruct);

        // Returned values should match the condition
        for ([key, value] of Object.entries(condition)) {
          expect(JSON.stringify(returnedCondition[key]) === JSON.stringify(value)).is.true;
        }

        // Voucher clone contract
        expectedCloneAddress = calculateContractAddress(orchestrationHandler.address, "1");
        bosonVoucher = await ethers.getContractAt("OwnableUpgradeable", expectedCloneAddress);

        expect(await bosonVoucher.owner()).to.equal(operator.address, "Wrong voucher clone owner");

        bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);
        expect(await bosonVoucher.contractURI()).to.equal(contractURI, "Wrong contract URI");
        expect(await bosonVoucher.name()).to.equal(VOUCHER_NAME + " " + seller.id, "Wrong voucher client name");
        expect(await bosonVoucher.symbol()).to.equal(VOUCHER_SYMBOL + "_" + seller.id, "Wrong voucher client symbol");
      });

      it("should update state when voucherInitValues has zero royaltyPercentage and exchangeId does not exist", async function () {
        // ERC2981 Royalty fee is 0%
        voucherInitValues.royaltyPercentage = "0"; //0%
        expect(voucherInitValues.isValid()).is.true;

        // Create a seller and an offer with condition
        await orchestrationHandler
          .connect(operator)
          .createSellerAndOfferWithCondition(
            seller,
            offer,
            offerDates,
            offerDurations,
            disputeResolver.id,
            condition,
            emptyAuthToken,
            voucherInitValues,
            agentId
          );

        // Voucher clone contract
        expectedCloneAddress = calculateContractAddress(orchestrationHandler.address, "1");
        bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);
        expect(await bosonVoucher.contractURI()).to.equal(contractURI, "Wrong contract URI");
        expect(await bosonVoucher.name()).to.equal(VOUCHER_NAME + " " + seller.id, "Wrong voucher client name");
        expect(await bosonVoucher.symbol()).to.equal(VOUCHER_SYMBOL + "_" + seller.id, "Wrong voucher client symbol");

        // Prepare random parameters
        let exchangeId = "1234"; // An exchange id that does not exist
        let offerPrice = "1234567"; // A random offer price

        //Exchange exists
        let exists;
        [exists] = await exchangeHandler.connect(rando).getExchangeState(exchangeId);
        expect(exists).to.be.false;

        // Get Royalty Information for Exchange id i.e. Voucher NFT token id
        let receiver, royaltyAmount;
        [receiver, royaltyAmount] = await bosonVoucher.connect(operator).royaltyInfo(exchangeId, offerPrice);

        // Expectations
        let expectedRecipient = ethers.constants.AddressZero; //expect zero address when exchange id does not exist
        let expectedRoyaltyAmount = "0"; // Zero Fee when exchange id does not exist

        assert.equal(receiver, expectedRecipient, "Recipient address is incorrect");
        assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");
      });

      it("should update state when voucherInitValues has non zero royaltyPercentage and exchangeId does not exist", async function () {
        // ERC2981 Royalty fee is 10%
        voucherInitValues.royaltyPercentage = "1000"; //10%
        expect(voucherInitValues.isValid()).is.true;

        // Create a seller and an offer with condition
        await orchestrationHandler
          .connect(operator)
          .createSellerAndOfferWithCondition(
            seller,
            offer,
            offerDates,
            offerDurations,
            disputeResolver.id,
            condition,
            emptyAuthToken,
            voucherInitValues,
            agentId
          );

        // Voucher clone contract
        expectedCloneAddress = calculateContractAddress(orchestrationHandler.address, "1");
        bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);
        expect(await bosonVoucher.contractURI()).to.equal(contractURI, "Wrong contract URI");
        expect(await bosonVoucher.name()).to.equal(VOUCHER_NAME + " " + seller.id, "Wrong voucher client name");
        expect(await bosonVoucher.symbol()).to.equal(VOUCHER_SYMBOL + "_" + seller.id, "Wrong voucher client symbol");

        // Prepare random parameters
        let exchangeId = "1234"; // An exchange id that does not exist
        let offerPrice = "1234567"; // A random offer price

        //Exchange exists
        let exists;
        [exists] = await exchangeHandler.connect(rando).getExchangeState(exchangeId);
        expect(exists).to.be.false;

        // Get Royalty Information for Exchange id i.e. Voucher NFT token id
        let receiver, royaltyAmount;
        [receiver, royaltyAmount] = await bosonVoucher.connect(operator).royaltyInfo(exchangeId, offerPrice);

        // Expectations
        let expectedRecipient = ethers.constants.AddressZero; //expect zero address when exchange id does not exist
        let expectedRoyaltyAmount = "0"; // Zero Fee when exchange id does not exist

        assert.equal(receiver, expectedRecipient, "Recipient address is incorrect");
        assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");
      });

      it("should ignore any provided ids and assign the next available", async function () {
        const sellerId = seller.id;
        offer.id = "555";
        seller.id = "444";

        // Create a seller and an offer with condition, testing for the events
        const tx = await orchestrationHandler
          .connect(operator)
          .createSellerAndOfferWithCondition(
            seller,
            offer,
            offerDates,
            offerDurations,
            disputeResolver.id,
            condition,
            emptyAuthToken,
            voucherInitValues,
            agentId
          );

        // SellerCreated and OfferCreated events
        await expect(tx)
          .to.emit(orchestrationHandler, "SellerCreated")
          .withArgs(
            sellerId,
            sellerStruct,
            calculateContractAddress(orchestrationHandler.address, "1"),
            emptyAuthTokenStruct,
            operator.address
          );

        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            sellerId,
            offerStruct,
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // GroupCreated event
        const eventGroupCreated = getEvent(txReceipt, orchestrationHandler, "GroupCreated");
        const groupInstance = Group.fromStruct(eventGroupCreated.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(eventGroupCreated.groupId.toString(), nextOfferId, "Group Id is incorrect");
        assert.equal(eventGroupCreated.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
      });

      context("When offers have non zero agent ids", async function () {
        beforeEach(async function () {
          seller.id = "3"; // 1 is dispute resolver, 2 is agent.
          offer.sellerId = seller.id;
          group.sellerId = seller.id;
          sellerStruct = seller.toStruct();
          offerStruct = offer.toStruct();

          // Required constructor params
          agentId = "2"; // argument sent to contract for createAgent will be ignored

          // Create a valid agent, then set fields in tests directly
          agent = mockAgent(other1.address);
          agent.id = agentId;
          expect(agent.isValid()).is.true;

          // Create an agent
          await accountHandler.connect(rando).createAgent(agent);

          agentFee = ethers.BigNumber.from(offer.price).mul(agent.feePercentage).div("10000").toString();
          offerFees.agentFee = agentFee;
          offerFeesStruct = offerFees.toStruct();
        });

        it("should emit a SellerCreated, an OfferCreated, and a GroupCreated event", async function () {
          // Create a seller and an offer with condition, testing for the events
          const tx = await orchestrationHandler
            .connect(operator)
            .createSellerAndOfferWithCondition(
              seller,
              offer,
              offerDates,
              offerDurations,
              disputeResolver.id,
              condition,
              emptyAuthToken,
              voucherInitValues,
              agentId
            );

          // SellerCreated and OfferCreated events
          await expect(tx)
            .to.emit(orchestrationHandler, "SellerCreated")
            .withArgs(
              seller.id,
              sellerStruct,
              calculateContractAddress(orchestrationHandler.address, "1"),
              emptyAuthTokenStruct,
              operator.address
            );

          await expect(tx)
            .to.emit(orchestrationHandler, "OfferCreated")
            .withArgs(
              nextOfferId,
              seller.id,
              offerStruct,
              offerDatesStruct,
              offerDurationsStruct,
              disputeResolutionTermsStruct,
              offerFeesStruct,
              agentId,
              operator.address
            );

          // Events with structs that contain arrays must be tested differently
          const txReceipt = await tx.wait();

          // GroupCreated event
          const eventGroupCreated = getEvent(txReceipt, orchestrationHandler, "GroupCreated");
          const groupInstance = Group.fromStruct(eventGroupCreated.group);
          // Validate the instance
          expect(groupInstance.isValid()).to.be.true;

          assert.equal(eventGroupCreated.groupId.toString(), group.id, "Group Id is incorrect");
          assert.equal(eventGroupCreated.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
          assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
        });

        context("💔 Revert Reasons", async function () {
          it("Agent does not exist", async function () {
            // Set an agent id that does not exist
            let agentId = "16";

            // Attempt to Create an offer, expecting revert
            await expect(
              orchestrationHandler
                .connect(operator)
                .createSellerAndOfferWithCondition(
                  seller,
                  offer,
                  offerDates,
                  offerDurations,
                  disputeResolver.id,
                  condition,
                  emptyAuthToken,
                  voucherInitValues,
                  agentId
                )
            ).to.revertedWith(RevertReasons.NO_SUCH_AGENT);
          });

          it("Sum of Agent fee amount and protocol fee amount should be <= than the offer fee limit", async function () {
            // Create new agent
            let id = "3"; // argument sent to contract for createAgent will be ignored

            // Create a valid agent, then set fields in tests directly
            agent = mockAgent(operator.address);
            agent.id = id;
            agent.feePercentage = "3000"; //30%
            expect(agent.isValid()).is.true;

            // Create an agent
            await accountHandler.connect(rando).createAgent(agent);

            //Change protocol fee after creating agent
            await configHandler.connect(protocolAdmin).setProtocolFeePercentage("1100"); //11%

            // Attempt to Create an offer, expecting revert
            await expect(
              orchestrationHandler
                .connect(operator)
                .createSellerAndOfferWithCondition(
                  seller,
                  offer,
                  offerDates,
                  offerDurations,
                  disputeResolver.id,
                  condition,
                  emptyAuthToken,
                  voucherInitValues,
                  agent.id
                )
            ).to.revertedWith(RevertReasons.AGENT_FEE_AMOUNT_TOO_HIGH);
          });
        });
      });

      context("💔 Revert Reasons", async function () {
        it("The orchestration region of protocol is paused", async function () {
          // Pause the orchestration region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Orchestration]);

          // Attempt to orchestrate expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOfferWithCondition(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                condition,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("The sellers region of protocol is paused", async function () {
          // Pause the sellers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Sellers]);

          // Attempt to create a seller, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOfferWithCondition(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                condition,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("The offers region of protocol is paused", async function () {
          // Pause the offers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Offers]);

          // Attempt to create an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOfferWithCondition(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                condition,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("The groups region of protocol is paused", async function () {
          // Pause the groups region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Groups]);

          // Attempt to create an group, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOfferWithCondition(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                condition,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });
      });
    });

    context("👉 createSellerAndOfferAndTwinWithBundle()", async function () {
      beforeEach(async function () {
        // prepare a bundle struct. We are not passing it as an argument, but just need to validate.

        // The first bundle id
        bundleId = nextBundleId = "1";

        // Required constructor params for Bundle
        offerIds = ["1"];
        twinIds = ["1"];

        bundle = new Bundle(bundleId, seller.id, offerIds, twinIds);

        expect(bundle.isValid()).is.true;

        // How that bundle looks as a returned struct
        bundleStruct = bundle.toStruct();

        nextTwinId = "1";

        // Create a valid twin.
        twin = mockTwin(bosonToken.address);
        twin.sellerId = seller.id;

        // How that twin looks as a returned struct
        twinStruct = twin.toStruct();
      });

      it("should emit a SellerCreated, an OfferCreated, a TwinCreated and a BundleCreated event", async function () {
        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(operator).approve(twinHandler.address, 1); // approving the twin handler

        // Create a seller, an offer with condition and a twin with bundle, testing for the events
        const tx = await orchestrationHandler
          .connect(operator)
          .createSellerAndOfferAndTwinWithBundle(
            seller,
            offer,
            offerDates,
            offerDurations,
            disputeResolver.id,
            twin,
            emptyAuthToken,
            voucherInitValues,
            agentId
          );

        expectedCloneAddress = calculateContractAddress(orchestrationHandler.address, "1");

        // SellerCreated and OfferCreated events
        await expect(tx)
          .to.emit(orchestrationHandler, "SellerCreated")
          .withArgs(seller.id, sellerStruct, expectedCloneAddress, emptyAuthTokenStruct, operator.address);

        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            offerStruct,
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // TwinCreated event
        const eventTwinCreated = getEvent(txReceipt, orchestrationHandler, "TwinCreated");
        const twinInstance = Twin.fromStruct(eventTwinCreated.twin);
        // Validate the instance
        expect(twinInstance.isValid()).to.be.true;

        assert.equal(eventTwinCreated.twinId.toString(), twin.id, "Twin Id is incorrect");
        assert.equal(eventTwinCreated.sellerId.toString(), twin.sellerId, "Seller Id is incorrect");
        assert.equal(eventTwinCreated.executedBy.toString(), operator.address, "Executed by is incorrect");
        assert.equal(twinInstance.toString(), twin.toString(), "Twin struct is incorrect");

        // BundleCreated event
        const eventBundleCreated = getEvent(txReceipt, orchestrationHandler, "BundleCreated");
        const bundleInstance = Bundle.fromStruct(eventBundleCreated.bundle);
        // Validate the instance
        expect(bundleInstance.isValid()).to.be.true;

        assert.equal(eventBundleCreated.bundleId.toString(), bundle.id, "Bundle Id is incorrect");
        assert.equal(eventBundleCreated.sellerId.toString(), bundle.sellerId, "Seller Id is incorrect");
        assert.equal(eventBundleCreated.executedBy.toString(), operator.address, "Executed by is incorrect");
        assert.equal(bundleInstance.toString(), bundle.toString(), "Bundle struct is incorrect");

        // Voucher clone contract
        bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);

        await expect(tx).to.emit(bosonVoucher, "ContractURIChanged").withArgs(contractURI);
        await expect(tx)
          .to.emit(bosonVoucher, "RoyaltyPercentageChanged")
          .withArgs(voucherInitValues.royaltyPercentage);

        bosonVoucher = await ethers.getContractAt("OwnableUpgradeable", expectedCloneAddress);

        await expect(tx)
          .to.emit(bosonVoucher, "OwnershipTransferred")
          .withArgs(ethers.constants.AddressZero, operator.address);
      });

      it("should update state", async function () {
        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(operator).approve(twinHandler.address, 1); // approving the twin handler

        // Create a seller, an offer with condition and a twin with bundle, testing for the events
        await orchestrationHandler
          .connect(operator)
          .createSellerAndOfferAndTwinWithBundle(
            seller,
            offer,
            offerDates,
            offerDurations,
            disputeResolver.id,
            twin,
            emptyAuthToken,
            voucherInitValues,
            agentId
          );

        // Get the seller as a struct
        [, sellerStruct, authTokenStruct] = await accountHandler.connect(rando).getSeller(seller.id);

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);
        let returnedAuthToken = AuthToken.fromStruct(authTokenStruct);

        // Returned values should match the input in createSellerAndOfferAndTwinWithBundle
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }

        // Returned auth token values should match the input in createSeller
        for ([key, value] of Object.entries(emptyAuthToken)) {
          expect(JSON.stringify(returnedAuthToken[key]) === JSON.stringify(value)).is.true;
        }

        // Get the offer as a struct
        [, offerStruct, offerDatesStruct, offerDurationsStruct, disputeResolutionTermsStruct] = await offerHandler
          .connect(rando)
          .getOffer(offer.id);

        // Parse into entities
        let returnedOffer = Offer.fromStruct(offerStruct);
        let returnedOfferDates = OfferDates.fromStruct(offerDatesStruct);
        let returnedOfferDurations = OfferDurations.fromStruct(offerDurationsStruct);
        let returnedDisputeResolutionTermsStruct = DisputeResolutionTerms.fromStruct(disputeResolutionTermsStruct);

        // Returned values should match the input in createSellerAndOffer
        for ([key, value] of Object.entries(offer)) {
          expect(JSON.stringify(returnedOffer[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDates)) {
          expect(JSON.stringify(returnedOfferDates[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDurations)) {
          expect(JSON.stringify(returnedOfferDurations[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(disputeResolutionTerms)) {
          expect(JSON.stringify(returnedDisputeResolutionTermsStruct[key]) === JSON.stringify(value)).is.true;
        }

        // Get the twin as a struct
        [, twinStruct] = await twinHandler.connect(rando).getTwin(nextTwinId);

        // Parse into entity
        const returnedTwin = Twin.fromStruct(twinStruct);

        // Returned values should match the input in createSellerAndOfferAndTwinWithBundle
        for ([key, value] of Object.entries(twin)) {
          expect(JSON.stringify(returnedTwin[key]) === JSON.stringify(value)).is.true;
        }

        // Get the bundle as a struct
        [, bundleStruct] = await bundleHandler.connect(rando).getBundle(bundleId);

        // Parse into entity
        let returnedBundle = Bundle.fromStruct(bundleStruct);

        // Returned values should match what is expected for the silently created bundle
        for ([key, value] of Object.entries(bundle)) {
          expect(JSON.stringify(returnedBundle[key]) === JSON.stringify(value)).is.true;
        }

        // Voucher clone contract
        expectedCloneAddress = calculateContractAddress(orchestrationHandler.address, "1");
        bosonVoucher = await ethers.getContractAt("OwnableUpgradeable", expectedCloneAddress);

        expect(await bosonVoucher.owner()).to.equal(operator.address, "Wrong voucher clone owner");

        bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);
        expect(await bosonVoucher.contractURI()).to.equal(contractURI, "Wrong contract URI");
        expect(await bosonVoucher.name()).to.equal(VOUCHER_NAME + " " + seller.id, "Wrong voucher client name");
        expect(await bosonVoucher.symbol()).to.equal(VOUCHER_SYMBOL + "_" + seller.id, "Wrong voucher client symbol");
      });

      it("should update state when voucherInitValues has zero royaltyPercentage and exchangeId does not exist", async function () {
        // ERC2981 Royalty fee is 0%
        voucherInitValues.royaltyPercentage = "0"; //0%
        expect(voucherInitValues.isValid()).is.true;

        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(operator).approve(twinHandler.address, 1); // approving the twin handler

        // Create a seller, an offer with condition and a twin with bundle, testing for the events
        await orchestrationHandler
          .connect(operator)
          .createSellerAndOfferAndTwinWithBundle(
            seller,
            offer,
            offerDates,
            offerDurations,
            disputeResolver.id,
            twin,
            emptyAuthToken,
            voucherInitValues,
            agentId
          );

        // Voucher clone contract
        expectedCloneAddress = calculateContractAddress(orchestrationHandler.address, "1");
        bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);
        expect(await bosonVoucher.contractURI()).to.equal(contractURI, "Wrong contract URI");
        expect(await bosonVoucher.name()).to.equal(VOUCHER_NAME + " " + seller.id, "Wrong voucher client name");
        expect(await bosonVoucher.symbol()).to.equal(VOUCHER_SYMBOL + "_" + seller.id, "Wrong voucher client symbol");

        // Prepare random parameters
        let exchangeId = "1234"; // An exchange id that does not exist
        let offerPrice = "1234567"; // A random offer price

        //Exchange exists
        let exists;
        [exists] = await exchangeHandler.connect(rando).getExchangeState(exchangeId);
        expect(exists).to.be.false;

        // Get Royalty Information for Exchange id i.e. Voucher NFT token id
        let receiver, royaltyAmount;
        [receiver, royaltyAmount] = await bosonVoucher.connect(operator).royaltyInfo(exchangeId, offerPrice);

        // Expectations
        let expectedRecipient = ethers.constants.AddressZero; //expect zero address when exchange id does not exist
        let expectedRoyaltyAmount = "0"; // Zero Fee when exchange id does not exist

        assert.equal(receiver, expectedRecipient, "Recipient address is incorrect");
        assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");
      });

      it("should update state when voucherInitValues has non zero royaltyPercentage and exchangeId does not exist", async function () {
        // ERC2981 Royalty fee is 10%
        voucherInitValues.royaltyPercentage = "1000"; //10%
        expect(voucherInitValues.isValid()).is.true;

        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(operator).approve(twinHandler.address, 1); // approving the twin handler

        // Create a seller, an offer with condition and a twin with bundle, testing for the events
        await orchestrationHandler
          .connect(operator)
          .createSellerAndOfferAndTwinWithBundle(
            seller,
            offer,
            offerDates,
            offerDurations,
            disputeResolver.id,
            twin,
            emptyAuthToken,
            voucherInitValues,
            agentId
          );

        // Voucher clone contract
        expectedCloneAddress = calculateContractAddress(orchestrationHandler.address, "1");
        bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);
        expect(await bosonVoucher.contractURI()).to.equal(contractURI, "Wrong contract URI");
        expect(await bosonVoucher.name()).to.equal(VOUCHER_NAME + " " + seller.id, "Wrong voucher client name");
        expect(await bosonVoucher.symbol()).to.equal(VOUCHER_SYMBOL + "_" + seller.id, "Wrong voucher client symbol");

        // Prepare random parameters
        let exchangeId = "1234"; // An exchange id that does not exist
        let offerPrice = "1234567"; // A random offer price

        //Exchange exists
        let exists;
        [exists] = await exchangeHandler.connect(rando).getExchangeState(exchangeId);
        expect(exists).to.be.false;

        // Get Royalty Information for Exchange id i.e. Voucher NFT token id
        let receiver, royaltyAmount;
        [receiver, royaltyAmount] = await bosonVoucher.connect(operator).royaltyInfo(exchangeId, offerPrice);

        // Expectations
        let expectedRecipient = ethers.constants.AddressZero; //expect zero address when exchange id does not exist
        let expectedRoyaltyAmount = "0"; // Zero Fee when exchange id does not exist

        assert.equal(receiver, expectedRecipient, "Recipient address is incorrect");
        assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");
      });

      it("should ignore any provided ids and assign the next available", async function () {
        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(operator).approve(twinHandler.address, 1); // approving the twin handler

        const sellerId = seller.id;
        seller.id = "333";
        offer.id = "555";
        twin.id = "777";

        // Create a seller, an offer with condition and a twin with bundle, testing for the events
        const tx = await orchestrationHandler
          .connect(operator)
          .createSellerAndOfferAndTwinWithBundle(
            seller,
            offer,
            offerDates,
            offerDurations,
            disputeResolver.id,
            twin,
            emptyAuthToken,
            voucherInitValues,
            agentId
          );

        // SellerCreated and OfferCreated events
        await expect(tx)
          .to.emit(orchestrationHandler, "SellerCreated")
          .withArgs(
            sellerId,
            sellerStruct,
            calculateContractAddress(orchestrationHandler.address, "1"),
            emptyAuthTokenStruct,
            operator.address
          );

        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            sellerId,
            offerStruct,
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // TwinCreated event
        const eventTwinCreated = getEvent(txReceipt, orchestrationHandler, "TwinCreated");
        const twinInstance = Twin.fromStruct(eventTwinCreated.twin);
        // Validate the instance
        expect(twinInstance.isValid()).to.be.true;

        assert.equal(eventTwinCreated.twinId.toString(), nextTwinId, "Twin Id is incorrect");
        assert.equal(eventTwinCreated.sellerId.toString(), twin.sellerId, "Seller Id is incorrect");
        assert.equal(twinInstance.toString(), Twin.fromStruct(twinStruct).toString(), "Twin struct is incorrect");

        // BundleCreated event
        const eventBundleCreated = getEvent(txReceipt, orchestrationHandler, "BundleCreated");
        const bundleInstance = Bundle.fromStruct(eventBundleCreated.bundle);
        // Validate the instance
        expect(bundleInstance.isValid()).to.be.true;

        assert.equal(eventBundleCreated.bundleId.toString(), nextBundleId, "Bundle Id is incorrect");
        assert.equal(eventBundleCreated.sellerId.toString(), bundle.sellerId, "Seller Id is incorrect");
        assert.equal(
          bundleInstance.toString(),
          Bundle.fromStruct(bundleStruct).toString(),
          "Bundle struct is incorrect"
        );
      });

      context("When offers have non zero agent ids", async function () {
        beforeEach(async function () {
          seller.id = "3";
          offer.sellerId = seller.id;
          twin.sellerId = seller.id;
          bundle.sellerId = seller.id;
          sellerStruct = seller.toStruct();
          offerStruct = offer.toStruct();

          // Required constructor params
          agentId = "2"; // argument sent to contract for createAgent will be ignored

          // Create a valid agent, then set fields in tests directly
          agent = mockAgent(other1.address);
          agent.id = agentId;
          expect(agent.isValid()).is.true;

          // Create an agent
          await accountHandler.connect(rando).createAgent(agent);

          agentFee = ethers.BigNumber.from(offer.price).mul(agent.feePercentage).div("10000").toString();
          offerFees.agentFee = agentFee;
          offerFeesStruct = offerFees.toStruct();
        });

        it("should emit a SellerCreated, an OfferCreated, a TwinCreated and a BundleCreated event", async function () {
          // Approving the twinHandler contract to transfer seller's tokens
          await bosonToken.connect(operator).approve(twinHandler.address, 1); // approving the twin handler

          // Create a seller, an offer with condition and a twin with bundle, testing for the events
          const tx = await orchestrationHandler
            .connect(operator)
            .createSellerAndOfferAndTwinWithBundle(
              seller,
              offer,
              offerDates,
              offerDurations,
              disputeResolver.id,
              twin,
              emptyAuthToken,
              voucherInitValues,
              agentId
            );

          // SellerCreated and OfferCreated events
          await expect(tx)
            .to.emit(orchestrationHandler, "SellerCreated")
            .withArgs(
              seller.id,
              sellerStruct,
              calculateContractAddress(orchestrationHandler.address, "1"),
              emptyAuthTokenStruct,
              operator.address
            );

          await expect(tx)
            .to.emit(orchestrationHandler, "OfferCreated")
            .withArgs(
              nextOfferId,
              seller.id,
              offerStruct,
              offerDatesStruct,
              offerDurationsStruct,
              disputeResolutionTermsStruct,
              offerFeesStruct,
              agentId,
              operator.address
            );

          // Events with structs that contain arrays must be tested differently
          const txReceipt = await tx.wait();

          // TwinCreated event
          const eventTwinCreated = getEvent(txReceipt, orchestrationHandler, "TwinCreated");
          const twinInstance = Twin.fromStruct(eventTwinCreated.twin);
          // Validate the instance
          expect(twinInstance.isValid()).to.be.true;

          assert.equal(eventTwinCreated.twinId.toString(), twin.id, "Twin Id is incorrect");
          assert.equal(eventTwinCreated.sellerId.toString(), twin.sellerId, "Seller Id is incorrect");
          assert.equal(eventTwinCreated.executedBy.toString(), operator.address, "Executed by is incorrect");
          assert.equal(twinInstance.toString(), twin.toString(), "Twin struct is incorrect");

          // BundleCreated event
          const eventBundleCreated = getEvent(txReceipt, orchestrationHandler, "BundleCreated");
          const bundleInstance = Bundle.fromStruct(eventBundleCreated.bundle);
          // Validate the instance
          expect(bundleInstance.isValid()).to.be.true;

          assert.equal(eventBundleCreated.bundleId.toString(), bundle.id, "Bundle Id is incorrect");
          assert.equal(eventBundleCreated.sellerId.toString(), bundle.sellerId, "Seller Id is incorrect");
          assert.equal(eventBundleCreated.executedBy.toString(), operator.address, "Executed by is incorrect");
          assert.equal(bundleInstance.toString(), bundle.toString(), "Bundle struct is incorrect");
        });

        context("💔 Revert Reasons", async function () {
          it("Agent does not exist", async function () {
            // Set an agent id that does not exist
            let agentId = "16";

            // Attempt to Create an offer, expecting revert
            await expect(
              orchestrationHandler
                .connect(operator)
                .createSellerAndOfferAndTwinWithBundle(
                  seller,
                  offer,
                  offerDates,
                  offerDurations,
                  disputeResolver.id,
                  twin,
                  emptyAuthToken,
                  voucherInitValues,
                  agentId
                )
            ).to.revertedWith(RevertReasons.NO_SUCH_AGENT);
          });

          it("Sum of Agent fee amount and protocol fee amount should be <= than the offer fee limit", async function () {
            // Create new agent
            let id = "3"; // argument sent to contract for createAgent will be ignored

            // Create a valid agent, then set fields in tests directly
            agent = mockAgent(operator.address);
            agent.id = id;
            agent.feePercentage = "3000"; //30%;
            expect(agent.isValid()).is.true;

            // Create an agent
            await accountHandler.connect(rando).createAgent(agent);

            //Change protocol fee after creating agent
            await configHandler.connect(protocolAdmin).setProtocolFeePercentage("1100"); //11%

            // Attempt to Create an offer, expecting revert
            await expect(
              orchestrationHandler
                .connect(operator)
                .createSellerAndOfferAndTwinWithBundle(
                  seller,
                  offer,
                  offerDates,
                  offerDurations,
                  disputeResolver.id,
                  twin,
                  emptyAuthToken,
                  voucherInitValues,
                  agent.id
                )
            ).to.revertedWith(RevertReasons.AGENT_FEE_AMOUNT_TOO_HIGH);
          });
        });
      });

      context("💔 Revert Reasons", async function () {
        it("The orchestration region of protocol is paused", async function () {
          // Pause the orchestration region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Orchestration]);

          // Attempt to orchestrate expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOfferAndTwinWithBundle(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                twin,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("The sellers region of protocol is paused", async function () {
          // Pause the sellers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Sellers]);

          // Attempt to create a seller, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOfferAndTwinWithBundle(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                twin,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("The offers region of protocol is paused", async function () {
          // Pause the offers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Offers]);

          // Attempt to create an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOfferAndTwinWithBundle(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                twin,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("The bundles region of protocol is paused", async function () {
          // Pause the bundles region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Bundles]);

          // Attempt to create a bundle, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOfferAndTwinWithBundle(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                twin,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("The twins region of protocol is paused", async function () {
          // Pause the twins region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Twins]);

          // Attempt to create a twin expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOfferAndTwinWithBundle(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                twin,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });
      });
    });

    context("👉 createSellerAndOfferWithConditionAndTwinAndBundle()", async function () {
      beforeEach(async function () {
        // prepare a group struct. We are not passing it as an argument, but just need to validate.
        // The first group id
        nextGroupId = "1";

        offerIds = ["1"];

        condition = mockCondition({ tokenType: TokenType.MultiToken, tokenAddress: other3.address, tokenId: "5150" });
        expect(condition.isValid()).to.be.true;

        group = new Group(nextGroupId, seller.id, offerIds);

        expect(group.isValid()).is.true;

        // How that group looks as a returned struct
        groupStruct = group.toStruct();

        // prepare a bundle struct. We are not passing it as an argument, but just need to validate.
        // The first bundle id
        bundleId = nextBundleId = "1";

        // Required constructor params for Bundle
        offerIds = ["1"];
        twinIds = ["1"];

        bundle = new Bundle(bundleId, seller.id, offerIds, twinIds);

        expect(bundle.isValid()).is.true;

        // How that bundle looks as a returned struct
        bundleStruct = bundle.toStruct();

        nextTwinId = "1";

        // Create a valid twin.
        twin = mockTwin(bosonToken.address);
        twin.sellerId = seller.id;

        // How that twin looks as a returned struct
        twinStruct = twin.toStruct();
      });

      it("should emit a SellerCreated, an OfferCreated, a GroupCreated, a TwinCreated and a BundleCreated event", async function () {
        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(operator).approve(twinHandler.address, 1); // approving the twin handler

        // Create a seller, an offer with condition, twin and bundle
        const tx = await orchestrationHandler
          .connect(operator)
          .createSellerAndOfferWithConditionAndTwinAndBundle(
            seller,
            offer,
            offerDates,
            offerDurations,
            disputeResolver.id,
            condition,
            twin,
            emptyAuthToken,
            voucherInitValues,
            agentId
          );

        expectedCloneAddress = calculateContractAddress(orchestrationHandler.address, "1");

        // SellerCreated and OfferCreated events
        await expect(tx)
          .to.emit(orchestrationHandler, "SellerCreated")
          .withArgs(seller.id, sellerStruct, expectedCloneAddress, emptyAuthTokenStruct, operator.address);

        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            offerStruct,
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // GroupCreated event
        const eventGroupCreated = getEvent(txReceipt, orchestrationHandler, "GroupCreated");
        const groupInstance = Group.fromStruct(eventGroupCreated.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(eventGroupCreated.groupId.toString(), group.id, "Group Id is incorrect");
        assert.equal(eventGroupCreated.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");

        // TwinCreated event
        const eventTwinCreated = getEvent(txReceipt, orchestrationHandler, "TwinCreated");
        const twinInstance = Twin.fromStruct(eventTwinCreated.twin);
        // Validate the instance
        expect(twinInstance.isValid()).to.be.true;

        assert.equal(eventTwinCreated.twinId.toString(), twin.id, "Twin Id is incorrect");
        assert.equal(eventTwinCreated.sellerId.toString(), twin.sellerId, "Seller Id is incorrect");
        assert.equal(twinInstance.toString(), twin.toString(), "Twin struct is incorrect");

        // BundleCreated event
        const eventBundleCreated = getEvent(txReceipt, orchestrationHandler, "BundleCreated");
        const bundleInstance = Bundle.fromStruct(eventBundleCreated.bundle);
        // Validate the instance
        expect(bundleInstance.isValid()).to.be.true;

        assert.equal(eventBundleCreated.bundleId.toString(), bundle.id, "Bundle Id is incorrect");
        assert.equal(eventBundleCreated.sellerId.toString(), bundle.sellerId, "Seller Id is incorrect");
        assert.equal(bundleInstance.toString(), bundle.toString(), "Bundle struct is incorrect");

        // Voucher clone contract
        bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);

        await expect(tx).to.emit(bosonVoucher, "ContractURIChanged").withArgs(contractURI);
        await expect(tx)
          .to.emit(bosonVoucher, "RoyaltyPercentageChanged")
          .withArgs(voucherInitValues.royaltyPercentage);

        bosonVoucher = await ethers.getContractAt("OwnableUpgradeable", expectedCloneAddress);

        await expect(tx)
          .to.emit(bosonVoucher, "OwnershipTransferred")
          .withArgs(ethers.constants.AddressZero, operator.address);
      });

      it("should update state", async function () {
        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(operator).approve(twinHandler.address, 1); // approving the twin handler

        // Create a seller, an offer with condition, twin and bundle
        await orchestrationHandler
          .connect(operator)
          .createSellerAndOfferWithConditionAndTwinAndBundle(
            seller,
            offer,
            offerDates,
            offerDurations,
            disputeResolver.id,
            condition,
            twin,
            emptyAuthToken,
            voucherInitValues,
            agentId
          );

        // Get the seller as a struct
        [, sellerStruct, authTokenStruct] = await accountHandler.connect(rando).getSeller(seller.id);

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);
        let returnedAuthToken = AuthToken.fromStruct(authTokenStruct);

        // Returned values should match the input in createSellerAndOfferWithConditionAndTwinAndBundle
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }

        // Returned auth token values should match the input in createSeller
        for ([key, value] of Object.entries(emptyAuthToken)) {
          expect(JSON.stringify(returnedAuthToken[key]) === JSON.stringify(value)).is.true;
        }

        // Get the offer as a struct
        [, offerStruct, offerDatesStruct, offerDurationsStruct, disputeResolutionTermsStruct] = await offerHandler
          .connect(rando)
          .getOffer(offer.id);

        // Parse into entities
        let returnedOffer = Offer.fromStruct(offerStruct);
        let returnedOfferDates = OfferDates.fromStruct(offerDatesStruct);
        let returnedOfferDurations = OfferDurations.fromStruct(offerDurationsStruct);
        let returnedDisputeResolutionTermsStruct = DisputeResolutionTerms.fromStruct(disputeResolutionTermsStruct);

        // Returned values should match the input in createSellerAndOffer
        for ([key, value] of Object.entries(offer)) {
          expect(JSON.stringify(returnedOffer[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDates)) {
          expect(JSON.stringify(returnedOfferDates[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(offerDurations)) {
          expect(JSON.stringify(returnedOfferDurations[key]) === JSON.stringify(value)).is.true;
        }
        for ([key, value] of Object.entries(disputeResolutionTerms)) {
          expect(JSON.stringify(returnedDisputeResolutionTermsStruct[key]) === JSON.stringify(value)).is.true;
        }

        // Get the group as a struct
        [, groupStruct, conditionStruct] = await groupHandler.connect(rando).getGroup(nextGroupId);

        // Parse into entity
        const returnedGroup = Group.fromStruct(groupStruct);

        // Returned values should match what is expected for the silently created group
        for ([key, value] of Object.entries(group)) {
          expect(JSON.stringify(returnedGroup[key]) === JSON.stringify(value)).is.true;
        }

        // Parse into entity
        const returnedCondition = Condition.fromStruct(conditionStruct);

        // Returned values should match the condition
        for ([key, value] of Object.entries(condition)) {
          expect(JSON.stringify(returnedCondition[key]) === JSON.stringify(value)).is.true;
        }

        // Get the twin as a struct
        [, twinStruct] = await twinHandler.connect(rando).getTwin(nextTwinId);

        // Parse into entity
        const returnedTwin = Twin.fromStruct(twinStruct);

        // Returned values should match the input in createSellerAndOfferWithConditionAndTwinAndBundle
        for ([key, value] of Object.entries(twin)) {
          expect(JSON.stringify(returnedTwin[key]) === JSON.stringify(value)).is.true;
        }

        // Get the bundle as a struct
        [, bundleStruct] = await bundleHandler.connect(rando).getBundle(bundleId);

        // Parse into entity
        let returnedBundle = Bundle.fromStruct(bundleStruct);

        // Returned values should match what is expected for the silently created bundle
        for ([key, value] of Object.entries(bundle)) {
          expect(JSON.stringify(returnedBundle[key]) === JSON.stringify(value)).is.true;
        }

        // Voucher clone contract
        expectedCloneAddress = calculateContractAddress(orchestrationHandler.address, "1");
        bosonVoucher = await ethers.getContractAt("OwnableUpgradeable", expectedCloneAddress);

        expect(await bosonVoucher.owner()).to.equal(operator.address, "Wrong voucher clone owner");

        bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);
        expect(await bosonVoucher.contractURI()).to.equal(contractURI, "Wrong contract URI");
        expect(await bosonVoucher.name()).to.equal(VOUCHER_NAME + " " + seller.id, "Wrong voucher client name");
        expect(await bosonVoucher.symbol()).to.equal(VOUCHER_SYMBOL + "_" + seller.id, "Wrong voucher client symbol");
      });

      it("should update state when voucherInitValues has zero royaltyPercentage and exchangeId does not exist", async function () {
        // ERC2981 Royalty fee is 0%
        voucherInitValues.royaltyPercentage = "0"; //0%
        expect(voucherInitValues.isValid()).is.true;

        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(operator).approve(twinHandler.address, 1); // approving the twin handler

        // Create a seller, an offer with condition, twin and bundle
        await orchestrationHandler
          .connect(operator)
          .createSellerAndOfferWithConditionAndTwinAndBundle(
            seller,
            offer,
            offerDates,
            offerDurations,
            disputeResolver.id,
            condition,
            twin,
            emptyAuthToken,
            voucherInitValues,
            agentId
          );

        // Voucher clone contract
        expectedCloneAddress = calculateContractAddress(orchestrationHandler.address, "1");
        bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);
        expect(await bosonVoucher.contractURI()).to.equal(contractURI, "Wrong contract URI");
        expect(await bosonVoucher.name()).to.equal(VOUCHER_NAME + " " + seller.id, "Wrong voucher client name");
        expect(await bosonVoucher.symbol()).to.equal(VOUCHER_SYMBOL + "_" + seller.id, "Wrong voucher client symbol");

        // Prepare random parameters
        let exchangeId = "1234"; // An exchange id that does not exist
        let offerPrice = "1234567"; // A random offer price

        //Exchange exists
        let exists;
        [exists] = await exchangeHandler.connect(rando).getExchangeState(exchangeId);
        expect(exists).to.be.false;

        // Get Royalty Information for Exchange id i.e. Voucher NFT token id
        let receiver, royaltyAmount;
        [receiver, royaltyAmount] = await bosonVoucher.connect(operator).royaltyInfo(exchangeId, offerPrice);

        // Expectations
        let expectedRecipient = ethers.constants.AddressZero; //expect zero address when exchange id does not exist
        let expectedRoyaltyAmount = "0"; // Zero Fee when exchange id does not exist

        assert.equal(receiver, expectedRecipient, "Recipient address is incorrect");
        assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");
      });

      it("should update state when voucherInitValues has non zero royaltyPercentage and exchangeId does not exist", async function () {
        // ERC2981 Royalty fee is 10%
        voucherInitValues.royaltyPercentage = "1000"; //10%
        expect(voucherInitValues.isValid()).is.true;

        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(operator).approve(twinHandler.address, 1); // approving the twin handler

        // Create a seller, an offer with condition, twin and bundle
        await orchestrationHandler
          .connect(operator)
          .createSellerAndOfferWithConditionAndTwinAndBundle(
            seller,
            offer,
            offerDates,
            offerDurations,
            disputeResolver.id,
            condition,
            twin,
            emptyAuthToken,
            voucherInitValues,
            agentId
          );

        // Voucher clone contract
        expectedCloneAddress = calculateContractAddress(orchestrationHandler.address, "1");
        bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);
        expect(await bosonVoucher.contractURI()).to.equal(contractURI, "Wrong contract URI");
        expect(await bosonVoucher.name()).to.equal(VOUCHER_NAME + " " + seller.id, "Wrong voucher client name");
        expect(await bosonVoucher.symbol()).to.equal(VOUCHER_SYMBOL + "_" + seller.id, "Wrong voucher client symbol");

        // Prepare random parameters
        let exchangeId = "1234"; // An exchange id that does not exist
        let offerPrice = "1234567"; // A random offer price

        //Exchange exists
        let exists;
        [exists] = await exchangeHandler.connect(rando).getExchangeState(exchangeId);
        expect(exists).to.be.false;

        // Get Royalty Information for Exchange id i.e. Voucher NFT token id
        let receiver, royaltyAmount;
        [receiver, royaltyAmount] = await bosonVoucher.connect(operator).royaltyInfo(exchangeId, offerPrice);

        // Expectations
        let expectedRecipient = ethers.constants.AddressZero; //expect zero address when exchange id does not exist
        let expectedRoyaltyAmount = "0"; // Zero Fee when exchange id does not exist

        assert.equal(receiver, expectedRecipient, "Recipient address is incorrect");
        assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");
      });

      it("should ignore any provided ids and assign the next available", async function () {
        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(operator).approve(twinHandler.address, 1); // approving the twin handler

        const sellerId = seller.id;
        seller.id = "333";
        offer.id = "555";
        twin.id = "777";

        // Create a seller, an offer with condition, twin and bundle
        const tx = await orchestrationHandler
          .connect(operator)
          .createSellerAndOfferWithConditionAndTwinAndBundle(
            seller,
            offer,
            offerDates,
            offerDurations,
            disputeResolver.id,
            condition,
            twin,
            emptyAuthToken,
            voucherInitValues,
            agentId
          );

        // SellerCreated and OfferCreated events
        await expect(tx)
          .to.emit(orchestrationHandler, "SellerCreated")
          .withArgs(
            sellerId,
            sellerStruct,
            calculateContractAddress(orchestrationHandler.address, "1"),
            emptyAuthTokenStruct,
            operator.address
          );

        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            sellerId,
            offerStruct,
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            operator.address
          );

        // Events with structs that contain arrays must be tested differently
        const txReceipt = await tx.wait();

        // GroupCreated event
        const eventGroupCreated = getEvent(txReceipt, orchestrationHandler, "GroupCreated");
        const groupInstance = Group.fromStruct(eventGroupCreated.group);
        // Validate the instance
        expect(groupInstance.isValid()).to.be.true;

        assert.equal(eventGroupCreated.groupId.toString(), nextGroupId, "Group Id is incorrect");
        assert.equal(eventGroupCreated.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");

        // TwinCreated event
        const eventTwinCreated = getEvent(txReceipt, orchestrationHandler, "TwinCreated");
        const twinInstance = Twin.fromStruct(eventTwinCreated.twin);
        // Validate the instance
        expect(twinInstance.isValid()).to.be.true;

        assert.equal(eventTwinCreated.twinId.toString(), nextTwinId, "Twin Id is incorrect");
        assert.equal(eventTwinCreated.sellerId.toString(), twin.sellerId, "Seller Id is incorrect");
        assert.equal(twinInstance.toString(), Twin.fromStruct(twinStruct).toString(), "Twin struct is incorrect");

        // BundleCreated event
        const eventBundleCreated = getEvent(txReceipt, orchestrationHandler, "BundleCreated");
        const bundleInstance = Bundle.fromStruct(eventBundleCreated.bundle);
        // Validate the instance
        expect(bundleInstance.isValid()).to.be.true;

        assert.equal(eventBundleCreated.bundleId.toString(), nextBundleId, "Bundle Id is incorrect");
        assert.equal(eventBundleCreated.sellerId.toString(), bundle.sellerId, "Seller Id is incorrect");
        assert.equal(
          bundleInstance.toString(),
          Bundle.fromStruct(bundleStruct).toString(),
          "Bundle struct is incorrect"
        );
      });

      context("💔 Revert Reasons", async function () {
        it("The orchestration region of protocol is paused", async function () {
          // Pause the orchestration region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Orchestration]);

          // Attempt to orchestrate expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOfferWithConditionAndTwinAndBundle(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                condition,
                twin,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("The sellers region of protocol is paused", async function () {
          // Pause the sellers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Sellers]);

          // Attempt to create a seller, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOfferWithConditionAndTwinAndBundle(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                condition,
                twin,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("The offers region of protocol is paused", async function () {
          // Pause the offers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Offers]);

          // Attempt to create an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOfferWithConditionAndTwinAndBundle(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                condition,
                twin,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("The offers region of protocol is paused", async function () {
          // Pause the offers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Offers]);

          // Attempt to create an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOfferWithConditionAndTwinAndBundle(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                condition,
                twin,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("The groups region of protocol is paused", async function () {
          // Pause the groups region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Groups]);

          // Attempt to create a group, expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOfferWithConditionAndTwinAndBundle(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                condition,
                twin,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("The twins region of protocol is paused", async function () {
          // Pause the twins region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Twins]);

          // Attempt to create a twin expecting revert
          await expect(
            orchestrationHandler
              .connect(operator)
              .createSellerAndOfferWithConditionAndTwinAndBundle(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolver.id,
                condition,
                twin,
                emptyAuthToken,
                voucherInitValues,
                agentId
              )
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });
      });

      context("When offers have non zero agent ids", async function () {
        beforeEach(async function () {
          seller.id = "3";
          offer.sellerId = seller.id;
          twin.sellerId = seller.id;
          group.sellerId = seller.id;
          bundle.sellerId = seller.id;
          sellerStruct = seller.toStruct();
          offerStruct = offer.toStruct();

          // Required constructor params
          agentId = "2"; // argument sent to contract for createAgent will be ignored

          // Create a valid agent, then set fields in tests directly
          agent = mockAgent(other1.address);
          agent.id = agentId;
          expect(agent.isValid()).is.true;

          // Create an agent
          await accountHandler.connect(rando).createAgent(agent);

          agentFee = ethers.BigNumber.from(offer.price).mul(agent.feePercentage).div("10000").toString();
          offerFees.agentFee = agentFee;
          offerFeesStruct = offerFees.toStruct();
        });

        it("should emit a SellerCreated, an OfferCreated, a GroupCreated, a TwinCreated and a BundleCreated event", async function () {
          // Approving the twinHandler contract to transfer seller's tokens
          await bosonToken.connect(operator).approve(twinHandler.address, 1); // approving the twin handler

          expectedCloneAddress = calculateContractAddress(orchestrationHandler.address, "1");

          // Create a seller, an offer with condition, twin and bundle
          const tx = await orchestrationHandler
            .connect(operator)
            .createSellerAndOfferWithConditionAndTwinAndBundle(
              seller,
              offer,
              offerDates,
              offerDurations,
              disputeResolver.id,
              condition,
              twin,
              emptyAuthToken,
              voucherInitValues,
              agentId
            );

          // SellerCreated and OfferCreated events
          await expect(tx)
            .to.emit(orchestrationHandler, "SellerCreated")
            .withArgs(seller.id, sellerStruct, expectedCloneAddress, emptyAuthTokenStruct, operator.address);

          await expect(tx)
            .to.emit(orchestrationHandler, "OfferCreated")
            .withArgs(
              nextOfferId,
              seller.id,
              offerStruct,
              offerDatesStruct,
              offerDurationsStruct,
              disputeResolutionTermsStruct,
              offerFeesStruct,
              agentId,
              operator.address
            );

          // Events with structs that contain arrays must be tested differently
          const txReceipt = await tx.wait();

          // GroupCreated event
          const eventGroupCreated = getEvent(txReceipt, orchestrationHandler, "GroupCreated");
          const groupInstance = Group.fromStruct(eventGroupCreated.group);
          // Validate the instance
          expect(groupInstance.isValid()).to.be.true;

          assert.equal(eventGroupCreated.groupId.toString(), group.id, "Group Id is incorrect");
          assert.equal(eventGroupCreated.sellerId.toString(), group.sellerId, "Seller Id is incorrect");
          assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");

          // TwinCreated event
          const eventTwinCreated = getEvent(txReceipt, orchestrationHandler, "TwinCreated");
          const twinInstance = Twin.fromStruct(eventTwinCreated.twin);
          // Validate the instance
          expect(twinInstance.isValid()).to.be.true;

          assert.equal(eventTwinCreated.twinId.toString(), twin.id, "Twin Id is incorrect");
          assert.equal(eventTwinCreated.sellerId.toString(), twin.sellerId, "Seller Id is incorrect");
          assert.equal(twinInstance.toString(), twin.toString(), "Twin struct is incorrect");

          // BundleCreated event
          const eventBundleCreated = getEvent(txReceipt, orchestrationHandler, "BundleCreated");
          const bundleInstance = Bundle.fromStruct(eventBundleCreated.bundle);
          // Validate the instance
          expect(bundleInstance.isValid()).to.be.true;

          assert.equal(eventBundleCreated.bundleId.toString(), bundle.id, "Bundle Id is incorrect");
          assert.equal(eventBundleCreated.sellerId.toString(), bundle.sellerId, "Seller Id is incorrect");
          assert.equal(bundleInstance.toString(), bundle.toString(), "Bundle struct is incorrect");

          // Voucher clone contract
          bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);

          await expect(tx).to.emit(bosonVoucher, "ContractURIChanged").withArgs(contractURI);
          await expect(tx)
            .to.emit(bosonVoucher, "RoyaltyPercentageChanged")
            .withArgs(voucherInitValues.royaltyPercentage);

          bosonVoucher = await ethers.getContractAt("OwnableUpgradeable", expectedCloneAddress);

          await expect(tx)
            .to.emit(bosonVoucher, "OwnershipTransferred")
            .withArgs(ethers.constants.AddressZero, operator.address);
        });

        context("💔 Revert Reasons", async function () {
          it("Agent does not exist", async function () {
            // Set an agent id that does not exist
            let agentId = "16";

            // Attempt to Create an offer, expecting revert
            await expect(
              orchestrationHandler
                .connect(operator)
                .createSellerAndOfferWithConditionAndTwinAndBundle(
                  seller,
                  offer,
                  offerDates,
                  offerDurations,
                  disputeResolver.id,
                  condition,
                  twin,
                  emptyAuthToken,
                  voucherInitValues,
                  agentId
                )
            ).to.revertedWith(RevertReasons.NO_SUCH_AGENT);
          });

          it("Sum of Agent fee amount and protocol fee amount should be <= than the offer fee limit", async function () {
            // Create new agent
            let id = "3"; // argument sent to contract for createAgent will be ignored

            // Create a valid agent, then set fields in tests directly
            agent = mockAgent(operator.address);
            agent.id = id;
            agent.feePercentage = "3000"; //30%
            expect(agent.isValid()).is.true;

            // Create an agent
            await accountHandler.connect(rando).createAgent(agent);

            //Change protocol fee after creating agent
            await configHandler.connect(protocolAdmin).setProtocolFeePercentage("1100"); //11%

            // Attempt to Create an offer, expecting revert
            await expect(
              orchestrationHandler
                .connect(operator)
                .createSellerAndOfferWithConditionAndTwinAndBundle(
                  seller,
                  offer,
                  offerDates,
                  offerDurations,
                  disputeResolver.id,
                  condition,
                  twin,
                  emptyAuthToken,
                  voucherInitValues,
                  agent.id
                )
            ).to.revertedWith(RevertReasons.AGENT_FEE_AMOUNT_TOO_HIGH);
          });
        });
      });
    });
  });
});
