const hre = require("hardhat");
const ethers = hre.ethers;
const { expect, assert } = require("chai");
const Role = require("../../scripts/domain/Role");
const Seller = require("../../scripts/domain/Seller");
const AuthToken = require("../../scripts/domain/AuthToken");
const AuthTokenType = require("../../scripts/domain/AuthTokenType");
const SellerUpdateFields = require("../../scripts/domain/SellerUpdateFields");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
const { calculateContractAddress } = require("../util/utils.js");
const { oneWeek, oneMonth, VOUCHER_NAME, VOUCHER_SYMBOL, maxPriorityFeePerGas } = require("../util/constants");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const { mockSeller, mockAuthToken, mockVoucherInitValues, accountId } = require("../util/mock");

/**
 *  Test the Boson Seller Handler
 */
describe("SellerHandler", function () {
  // Common vars
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
    other4,
    other5,
    other6,
    other7,
    other8,
    authTokenOwner,
    protocolTreasury,
    bosonToken;
  let protocolDiamond, accessController, accountHandler, exchangeHandler, configHandler, pauseHandler, gasLimit;
  let seller,
    sellerStruct,
    seller2,
    seller3,
    seller4,
    expectedSeller,
    pendingSellerUpdate,
    pendingSellerUpdateStruct,
    pendingAuthToken,
    pendingAuthTokenStruct;
  let authToken, authTokenStruct, emptyAuthToken, emptyAuthTokenStruct, authToken2, authToken3;
  let key, value, exists;
  let protocolFeePercentage, protocolFeeFlatBoson, buyerEscalationDepositPercentage;
  let bosonVoucher;
  let expectedCloneAddress;
  let voucherInitValues, contractURI;
  let mockAuthERC721Contract, mockAuthERC721Contract2;

  beforeEach(async function () {
    // Make accounts available
    [
      deployer,
      pauser,
      admin,
      treasury,
      rando,
      other1,
      other2,
      other3,
      other4,
      other5,
      other6,
      other7,
      other8,
      protocolTreasury,
      bosonToken,
    ] = await ethers.getSigners();

    // make all account the same
    authTokenOwner = operator = clerk = admin;

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
      ["AccountHandlerFacet", "SellerHandlerFacet", "ExchangeHandlerFacet", "OfferHandlerFacet", "PauseHandlerFacet"],
      maxPriorityFeePerGas
    );

    // Deploy mock ERC721 tokens
    [mockAuthERC721Contract, mockAuthERC721Contract2] = await deployMockTokens(gasLimit, ["Foreign721", "Foreign721"]);

    // Deploy the Protocol client implementation/proxy pairs (currently just the Boson Voucher)
    const protocolClientArgs = [protocolDiamond.address];
    const [, beacons, proxies] = await deployProtocolClients(protocolClientArgs, maxPriorityFeePerGas);
    const [beacon] = beacons;
    const [proxy] = proxies;

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
        minDisputePeriod: oneWeek,
      },
      // Protocol fees
      {
        percentage: protocolFeePercentage,
        flatBoson: protocolFeeFlatBoson,
        buyerEscalationDepositPercentage,
      },
    ];

    await deployProtocolConfigFacet(protocolDiamond, protocolConfig, maxPriorityFeePerGas);

    // Cast Diamond to IBosonAccountHandler. Use this interface to call all individual account handlers
    accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);

    // Cast Diamond to IBosonExchangeHandler
    exchangeHandler = await ethers.getContractAt("IBosonExchangeHandler", protocolDiamond.address);

    //Cast Diamond to IBosonPauseHandler
    pauseHandler = await ethers.getContractAt("IBosonPauseHandler", protocolDiamond.address);

    //Cast Diamond to IBosonConfigHandler
    configHandler = await ethers.getContractAt("IBosonConfigHandler", protocolDiamond.address);

    await expect(
      configHandler.connect(deployer).setAuthTokenContract(AuthTokenType.Lens, mockAuthERC721Contract.address)
    )
      .to.emit(configHandler, "AuthTokenContractChanged")
      .withArgs(AuthTokenType.Lens, mockAuthERC721Contract.address, deployer.address);

    await expect(
      configHandler.connect(deployer).setAuthTokenContract(AuthTokenType.ENS, mockAuthERC721Contract2.address)
    )
      .to.emit(configHandler, "AuthTokenContractChanged")
      .withArgs(AuthTokenType.ENS, mockAuthERC721Contract2.address, deployer.address);

    await mockAuthERC721Contract.connect(authTokenOwner).mint(8400, 1);
  });

  // All supported Seller methods
  context("📋 Seller Methods", async function () {
    beforeEach(async function () {
      // Create a valid seller, then set fields in tests directly
      seller = mockSeller(operator.address, admin.address, clerk.address, treasury.address);
      expect(seller.isValid()).is.true;

      // How that seller looks as a returned struct
      sellerStruct = seller.toStruct();

      // VoucherInitValues
      contractURI = `https://ipfs.io/ipfs/QmW2WQi7j6c7UgJTarActp7tDNikE4B2qXtFCfLPdsgaTQ`;
      voucherInitValues = mockVoucherInitValues();
      expect(voucherInitValues.isValid()).is.true;

      // expected address of the first clone
      expectedCloneAddress = calculateContractAddress(accountHandler.address, "1");

      // AuthTokens
      emptyAuthToken = mockAuthToken();
      expect(emptyAuthToken.isValid()).is.true;
      emptyAuthTokenStruct = emptyAuthToken.toStruct();

      authToken = new AuthToken("8400", AuthTokenType.Lens);
      expect(authToken.isValid()).is.true;
      authTokenStruct = authToken.toStruct();
    });

    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    context("👉 createSeller()", async function () {
      it("should emit a SellerCreated event when auth token is empty", async function () {
        // Create a seller, testing for the event
        const tx = await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

        await expect(tx)
          .to.emit(accountHandler, "SellerCreated")
          .withArgs(seller.id, sellerStruct, expectedCloneAddress, emptyAuthTokenStruct, admin.address);

        // Voucher clone contract
        bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);

        await expect(tx).to.emit(bosonVoucher, "ContractURIChanged").withArgs(contractURI);

        await expect(tx)
          .to.emit(bosonVoucher, "RoyaltyPercentageChanged")
          .withArgs(voucherInitValues.royaltyPercentage);

        await expect(tx)
          .to.emit(bosonVoucher, "VoucherInitialized")
          .withArgs(seller.id, voucherInitValues.royaltyPercentage, contractURI);

        bosonVoucher = await ethers.getContractAt("OwnableUpgradeable", expectedCloneAddress);

        await expect(tx)
          .to.emit(bosonVoucher, "OwnershipTransferred")
          .withArgs(ethers.constants.AddressZero, operator.address);
      });

      it("should emit a SellerCreated event when auth token is not empty", async function () {
        // Create a seller, testing for the event
        seller.admin = ethers.constants.AddressZero;
        sellerStruct = seller.toStruct();
        const tx = await accountHandler.connect(authTokenOwner).createSeller(seller, authToken, voucherInitValues);

        await expect(tx)
          .to.emit(accountHandler, "SellerCreated")
          .withArgs(seller.id, sellerStruct, expectedCloneAddress, authTokenStruct, authTokenOwner.address);

        // Voucher clone contract
        bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);

        await expect(tx).to.emit(bosonVoucher, "ContractURIChanged").withArgs(contractURI);

        await expect(tx)
          .to.emit(bosonVoucher, "RoyaltyPercentageChanged")
          .withArgs(voucherInitValues.royaltyPercentage);

        await expect(tx)
          .to.emit(bosonVoucher, "VoucherInitialized")
          .withArgs(seller.id, voucherInitValues.royaltyPercentage, contractURI);

        bosonVoucher = await ethers.getContractAt("OwnableUpgradeable", expectedCloneAddress);

        await expect(tx)
          .to.emit(bosonVoucher, "OwnershipTransferred")
          .withArgs(ethers.constants.AddressZero, operator.address);
      });

      it("should update state when authToken is empty", async function () {
        // Create a seller
        await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

        // Get the seller as a struct
        [, sellerStruct, emptyAuthTokenStruct] = await accountHandler.connect(rando).getSeller(seller.id);

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);
        let returnedAuthToken = AuthToken.fromStruct(emptyAuthTokenStruct);

        // Returned values should match the input in createSeller
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }

        // Returned auth token values should match the input in createSeller
        for ([key, value] of Object.entries(emptyAuthToken)) {
          expect(JSON.stringify(returnedAuthToken[key]) === JSON.stringify(value)).is.true;
        }

        // Voucher clone contract
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

        // Create a seller
        await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

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

        // Create a seller
        await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

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

      it("should update state when authToken is not empty", async function () {
        seller.admin = ethers.constants.AddressZero;

        // Create a seller
        await accountHandler.connect(authTokenOwner).createSeller(seller, authToken, voucherInitValues);

        // Get the seller as a struct
        [, sellerStruct, authTokenStruct] = await accountHandler.connect(rando).getSeller(seller.id);

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);
        let returnedAuthToken = AuthToken.fromStruct(authTokenStruct);

        // Returned values should match the input in createSeller
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }

        // Returned auth token values should match the input in createSeller
        for ([key, value] of Object.entries(authToken)) {
          expect(JSON.stringify(returnedAuthToken[key]) === JSON.stringify(value)).is.true;
        }

        // Voucher clone contract
        bosonVoucher = await ethers.getContractAt("OwnableUpgradeable", expectedCloneAddress);

        expect(await bosonVoucher.owner()).to.equal(operator.address, "Wrong voucher clone owner");

        bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);
        expect(await bosonVoucher.contractURI()).to.equal(contractURI, "Wrong contract URI");
        expect(await bosonVoucher.name()).to.equal(VOUCHER_NAME + " " + seller.id, "Wrong voucher client name");
        expect(await bosonVoucher.symbol()).to.equal(VOUCHER_SYMBOL + "_" + seller.id, "Wrong voucher client symbol");
      });

      it("should ignore any provided id and assign the next available", async function () {
        const sellerId = seller.id;
        seller.id = "444";

        // Create a seller, testing for the event
        await expect(accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues))
          .to.emit(accountHandler, "SellerCreated")
          .withArgs(sellerId, sellerStruct, expectedCloneAddress, emptyAuthTokenStruct, admin.address);

        // wrong seller id should not exist
        [exists] = await accountHandler.connect(rando).getSeller(seller.id);
        expect(exists).to.be.false;

        // next seller id should exist
        [exists] = await accountHandler.connect(rando).getSeller(sellerId);
        expect(exists).to.be.true;
      });

      it("should be possible to use the same address for operator, admin, clerk, and treasury", async function () {
        seller.operator = other1.address;
        seller.admin = other1.address;
        seller.clerk = other1.address;
        seller.treasury = other1.address;

        //Create struct again with new addresses
        sellerStruct = seller.toStruct();

        // Create a seller, testing for the event
        await expect(accountHandler.connect(other1).createSeller(seller, emptyAuthToken, voucherInitValues))
          .to.emit(accountHandler, "SellerCreated")
          .withArgs(seller.id, sellerStruct, expectedCloneAddress, emptyAuthTokenStruct, other1.address);
      });

      it("should be possible to use non-unique treasury address", async function () {
        // Create a seller, testing for the event
        await expect(accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues))
          .to.emit(accountHandler, "SellerCreated")
          .withArgs(seller.id, sellerStruct, expectedCloneAddress, emptyAuthTokenStruct, admin.address);

        seller.id = accountId.next().value;
        seller.operator = other1.address;
        seller.admin = other1.address;
        seller.clerk = other1.address;

        //Create struct again with new addresses
        sellerStruct = seller.toStruct();

        // expected address of the first clone
        expectedCloneAddress = calculateContractAddress(accountHandler.address, "2");

        // Create a seller, testing for the event
        await expect(accountHandler.connect(other1).createSeller(seller, emptyAuthToken, voucherInitValues))
          .to.emit(accountHandler, "SellerCreated")
          .withArgs(seller.id, sellerStruct, expectedCloneAddress, emptyAuthTokenStruct, other1.address);
      });

      it("every seller should get a different clone address", async function () {
        // Create a seller, testing for the event
        await expect(accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues))
          .to.emit(accountHandler, "SellerCreated")
          .withArgs(seller.id, sellerStruct, expectedCloneAddress, emptyAuthTokenStruct, admin.address);

        // second seller
        expectedCloneAddress = calculateContractAddress(accountHandler.address, "2");
        seller = mockSeller(other1.address, other1.address, other1.address, other1.address);

        // Create a seller, testing for the event
        await expect(accountHandler.connect(other1).createSeller(seller, emptyAuthToken, voucherInitValues))
          .to.emit(accountHandler, "SellerCreated")
          .withArgs(seller.id, seller.toStruct(), expectedCloneAddress, emptyAuthTokenStruct, other1.address);
      });

      it("should be possible to create a seller with same auth token id but different type", async function () {
        // Set admin == zero address because seller will be created with auth token
        seller.admin = ethers.constants.AddressZero;

        //Create struct again with new address
        sellerStruct = seller.toStruct();

        // Create a seller, testing for the event
        await expect(accountHandler.connect(authTokenOwner).createSeller(seller, authToken, voucherInitValues))
          .to.emit(accountHandler, "SellerCreated")
          .withArgs(seller.id, sellerStruct, expectedCloneAddress, authTokenStruct, authTokenOwner.address);

        seller.operator = other1.address;
        seller.clerk = other1.address;

        // Update operator and clerk addresses so we can create a seller with the same auth token id but different type
        const tx = await accountHandler.connect(authTokenOwner).updateSeller(seller, authToken);

        pendingSellerUpdate = seller.clone();
        pendingSellerUpdate.treasury = ethers.constants.AddressZero;
        pendingSellerUpdate.active = false;
        pendingSellerUpdate.id = "0";
        pendingSellerUpdateStruct = pendingSellerUpdate.toStruct();

        // No pending update auth token
        pendingAuthToken = authToken.clone();
        pendingAuthToken.tokenId = "0";
        pendingAuthToken.tokenType = 0;
        pendingAuthTokenStruct = pendingAuthToken.toStruct();

        await expect(tx)
          .to.emit(accountHandler, "SellerUpdatePending")
          .withArgs(seller.id, pendingSellerUpdateStruct, pendingAuthTokenStruct, authTokenOwner.address);

        sellerStruct = seller.toStruct();

        // Nothing pending left
        pendingSellerUpdate.operator = ethers.constants.AddressZero;
        pendingSellerUpdate.clerk = ethers.constants.AddressZero;
        pendingSellerUpdateStruct = pendingSellerUpdate.toStruct();

        // Operator and clerk addresses owner must approve the update
        await expect(
          await accountHandler
            .connect(other1)
            .optInToSellerUpdate(seller.id, [SellerUpdateFields.Operator, SellerUpdateFields.Clerk])
        )
          .to.emit(accountHandler, "SellerUpdateApplied")
          .withArgs(
            seller.id,
            sellerStruct,
            pendingSellerUpdateStruct,
            authTokenStruct,
            pendingAuthTokenStruct,
            other1.address
          );

        seller.id = accountId.next().value;
        seller.operator = authTokenOwner.address;
        seller.clerk = authTokenOwner.address;

        //Create struct again with new addresses
        sellerStruct = seller.toStruct();

        // Set different auth token type, keeping token Id the same
        authToken.tokenType = AuthTokenType.ENS;
        authTokenStruct = authToken.toStruct();

        // mint token on ens contract
        await mockAuthERC721Contract2.connect(authTokenOwner).mint(8400, 1);

        // expected address of the first clone
        expectedCloneAddress = calculateContractAddress(accountHandler.address, "2");

        // Create a seller, testing for the event
        await expect(accountHandler.connect(authTokenOwner).createSeller(seller, authToken, voucherInitValues))
          .to.emit(accountHandler, "SellerCreated")
          .withArgs(seller.id, sellerStruct, expectedCloneAddress, authTokenStruct, authTokenOwner.address);
      });

      it("should be possible to create a seller with same auth token type but different id", async function () {
        // Set admin == zero address because seller will be created with auth token
        seller.admin = ethers.constants.AddressZero;

        //Create struct again with new address
        sellerStruct = seller.toStruct();

        // Create a seller, testing for the event
        await expect(accountHandler.connect(authTokenOwner).createSeller(seller, authToken, voucherInitValues))
          .to.emit(accountHandler, "SellerCreated")
          .withArgs(seller.id, sellerStruct, expectedCloneAddress, authTokenStruct, authTokenOwner.address);

        seller.operator = other1.address;
        seller.clerk = other1.address;

        pendingSellerUpdate = seller.clone();
        pendingSellerUpdate.id = "0";
        pendingSellerUpdate.treasury = ethers.constants.AddressZero;
        pendingSellerUpdate.active = false;
        pendingSellerUpdateStruct = pendingSellerUpdate.toStruct();

        // No pending update auth token
        pendingAuthToken = authToken.clone();
        pendingAuthToken.tokenId = "0";
        pendingAuthToken.tokenType = 0;
        pendingAuthTokenStruct = pendingAuthToken.toStruct();

        // Update operator and clerk addresses so we can create a seller with the same auth token id but different type
        const tx = await accountHandler.connect(authTokenOwner).updateSeller(seller, authToken);

        await expect(tx)
          .to.emit(accountHandler, "SellerUpdatePending")
          .withArgs(seller.id, pendingSellerUpdateStruct, pendingAuthTokenStruct, authTokenOwner.address);

        // Nothing pending left
        pendingSellerUpdate.operator = ethers.constants.AddressZero;
        pendingSellerUpdate.clerk = ethers.constants.AddressZero;
        pendingSellerUpdateStruct = pendingSellerUpdate.toStruct();

        sellerStruct = seller.toStruct();

        // Operator and clerk addresses owner must approve the update
        await expect(
          accountHandler
            .connect(other1)
            .optInToSellerUpdate(seller.id, [SellerUpdateFields.Operator, SellerUpdateFields.Clerk])
        )
          .to.emit(accountHandler, "SellerUpdateApplied")
          .withArgs(
            seller.id,
            sellerStruct,
            pendingSellerUpdateStruct,
            authTokenStruct,
            pendingAuthTokenStruct,
            other1.address
          );

        authTokenOwner = rando;
        seller.id = accountId.next().value;
        seller.operator = authTokenOwner.address;
        seller.clerk = authTokenOwner.address;

        //Create struct again with new addresses
        sellerStruct = seller.toStruct();

        // Set different token Id, keeping auth token type the same
        authToken.tokenId = "0";
        authTokenStruct = authToken.toStruct();

        // mint the token
        await mockAuthERC721Contract.connect(rando).mint(authToken.tokenId, 1);

        // expected address of the first clone
        expectedCloneAddress = calculateContractAddress(accountHandler.address, "2");

        // Create a seller, testing for the event
        await expect(accountHandler.connect(rando).createSeller(seller, authToken, voucherInitValues))
          .to.emit(accountHandler, "SellerCreated")
          .withArgs(seller.id, sellerStruct, expectedCloneAddress, authTokenStruct, authTokenOwner.address);
      });

      context("💔 Revert Reasons", async function () {
        it("The sellers region of protocol is paused", async function () {
          // Pause the sellers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Sellers]);

          // Attempt to create a seller expecting revert
          await expect(
            accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues)
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("active is false", async function () {
          seller.active = false;

          // Attempt to Create a seller, expecting revert
          await expect(
            accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues)
          ).to.revertedWith(RevertReasons.MUST_BE_ACTIVE);
        });

        it("addresses are not unique to this seller Id when address used for same role", async function () {
          // Create a seller
          await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

          // Update seller operator
          seller.operator = other1.address;
          await accountHandler.connect(admin).updateSeller(seller, emptyAuthToken);

          // Approve the update
          await accountHandler.connect(other1).optInToSellerUpdate(seller.id, [SellerUpdateFields.Operator]);

          seller.admin = other1.address;
          seller.clerk = other1.address;

          // Attempt to Create a seller with non-unique operator, expecting revert
          await expect(
            accountHandler.connect(other1).createSeller(seller, emptyAuthToken, voucherInitValues)
          ).to.revertedWith(RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE);

          seller.admin = admin.address;
          seller.operator = operator.address;
          seller.clerk = clerk.address;

          // Attempt to Create a seller with non-unique admin, expecting revert
          await expect(
            accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues)
          ).to.revertedWith(RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE);

          // Update seller clerk
          seller.clerk = other2.address;
          await accountHandler.connect(admin).updateSeller(seller, emptyAuthToken);

          // Approve the update
          await accountHandler.connect(other2).optInToSellerUpdate(seller.id, [SellerUpdateFields.Clerk]);

          seller.admin = other2.address;
          seller.operator = other2.address;

          // Attempt to Create a seller with non-unique clerk, expecting revert
          await expect(
            accountHandler.connect(other2).createSeller(seller, emptyAuthToken, voucherInitValues)
          ).to.revertedWith(RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE);
        });

        it("addresses are not unique to this seller Id when address used for different role", async function () {
          // Create a seller
          await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

          // Update seller operator
          seller.operator = other1.address;
          await accountHandler.connect(admin).updateSeller(seller, emptyAuthToken);

          // Approve the update
          await accountHandler.connect(other1).optInToSellerUpdate(seller.id, [SellerUpdateFields.Operator]);

          seller.admin = other1.address;
          seller.clerk = other1.address;

          // Attempt to Create a seller with non-unique operator, expecting revert
          await expect(
            accountHandler.connect(other1).createSeller(seller, emptyAuthToken, voucherInitValues)
          ).to.revertedWith(RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE);

          // Update seller clerk
          seller.clerk = other2.address;
          seller.admin = admin.address;
          seller.operator = operator.address;

          await accountHandler.connect(admin).updateSeller(seller, emptyAuthToken);

          // Approve the update
          await accountHandler.connect(other2).optInToSellerUpdate(seller.id, [SellerUpdateFields.Clerk]);
          // Admin and operator are the same address
          await accountHandler
            .connect(operator)
            .optInToSellerUpdate(seller.id, [SellerUpdateFields.Operator, SellerUpdateFields.Admin]);

          seller.admin = other2.address;
          seller.operator = other2.address;

          // Attempt to Create a seller with non-unique clerk, expecting revert
          await expect(
            accountHandler.connect(other2).createSeller(seller, emptyAuthToken, voucherInitValues)
          ).to.revertedWith(RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE);

          // Update seller admin
          seller.clerk = clerk.address;
          seller.admin = other3.address;
          seller.operator = operator.address;

          await accountHandler.connect(admin).updateSeller(seller, emptyAuthToken);

          // Approve the update
          await accountHandler.connect(other3).optInToSellerUpdate(seller.id, [SellerUpdateFields.Admin]);
          // Operator and clerk are the same
          await accountHandler
            .connect(clerk)
            .optInToSellerUpdate(seller.id, [SellerUpdateFields.Clerk, SellerUpdateFields.Operator]);

          seller.operator = other3.address;
          seller.clerk = other3.address;

          // Attempt to Create a seller with non-unique admin, expecting revert
          await expect(
            accountHandler.connect(other3).createSeller(seller, emptyAuthToken, voucherInitValues)
          ).to.revertedWith(RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE);
        });

        it("addresses are not unique to this seller Id when address used for same role and the seller is created with auth token", async function () {
          // Create a seller
          seller.admin = rando.address;
          seller.operator = rando.address;
          seller.clerk = rando.address;

          seller2 = mockSeller(
            authTokenOwner.address,
            ethers.constants.AddressZero,
            authTokenOwner.address,
            authTokenOwner.address
          );

          await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);

          // Update the seller, so operator matches authTokenOwner
          seller.operator = authTokenOwner.address;
          await accountHandler.connect(rando).updateSeller(seller, emptyAuthToken);

          // Approve the update
          await accountHandler.connect(authTokenOwner).optInToSellerUpdate(seller.id, [SellerUpdateFields.Operator]);

          // Attempt to Create a seller with non-unique operator, expecting revert
          await expect(
            accountHandler.connect(authTokenOwner).createSeller(seller2, authToken, voucherInitValues)
          ).to.revertedWith(RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE);

          // Update seller operator and clerk, so clerk matches authTokenOwner
          seller.clerk = authTokenOwner.address;
          seller.operator = rando.address;
          await accountHandler.connect(rando).updateSeller(seller, emptyAuthToken);

          // Approve the update
          await accountHandler.connect(authTokenOwner).optInToSellerUpdate(seller.id, [SellerUpdateFields.Clerk]);
          await accountHandler.connect(rando).optInToSellerUpdate(seller.id, [SellerUpdateFields.Operator]);

          // Attempt to Create a seller with non-unique clerk, expecting revert
          await expect(
            accountHandler.connect(authTokenOwner).createSeller(seller2, authToken, voucherInitValues)
          ).to.revertedWith(RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE);

          // Update the seller admin and clerk, so admin matches authTokenOwner
          seller.admin = authTokenOwner.address;
          seller.clerk = rando.address;
          await accountHandler.connect(rando).updateSeller(seller, emptyAuthToken);

          // Approve the update
          await accountHandler.connect(authTokenOwner).optInToSellerUpdate(seller.id, [SellerUpdateFields.Admin]);
          await accountHandler.connect(rando).optInToSellerUpdate(seller.id, [SellerUpdateFields.Clerk]);

          // Attempt to Create a seller with non-unique operator, expecting revert
          await expect(
            accountHandler.connect(authTokenOwner).createSeller(seller2, authToken, voucherInitValues)
          ).to.revertedWith(RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE);
        });

        it("admin address is NOT zero address and AuthTokenType is NOT None", async function () {
          // Attempt to Create a seller, expecting revert
          await expect(
            accountHandler.connect(authTokenOwner).createSeller(seller, authToken, voucherInitValues)
          ).to.revertedWith(RevertReasons.ADMIN_OR_AUTH_TOKEN);
        });

        it("admin address is zero address and AuthTokenType is None", async function () {
          seller.admin = ethers.constants.AddressZero;

          // Attempt to Create a seller, expecting revert
          await expect(
            accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues)
          ).to.revertedWith(RevertReasons.ADMIN_OR_AUTH_TOKEN);
        });

        it("authToken is not unique to this seller", async function () {
          // Set admin == zero address because seller will be created with auth token
          seller.admin = ethers.constants.AddressZero;
          seller.operator = authTokenOwner.address;
          seller.clerk = authTokenOwner.address;

          // Create a seller
          await accountHandler.connect(authTokenOwner).createSeller(seller, authToken, voucherInitValues);

          // Attempt to Create a seller with non-unique authToken
          await expect(
            accountHandler.connect(authTokenOwner).createSeller(seller, authToken, voucherInitValues)
          ).to.revertedWith(RevertReasons.AUTH_TOKEN_MUST_BE_UNIQUE);
        });

        it("authTokenType is Custom", async function () {
          // Set admin == zero address because seller will be created with auth token
          seller.admin = ethers.constants.AddressZero;

          authToken.tokenType = AuthTokenType.Custom;

          // Attempt to Create a seller with AuthTokenType == Custom, expecting revert
          await expect(
            accountHandler.connect(authTokenOwner).createSeller(seller, authToken, voucherInitValues)
          ).to.revertedWith(RevertReasons.INVALID_AUTH_TOKEN_TYPE);
        });

        it("Caller is not the supplied admin", async function () {
          seller.operator = rando.address;
          seller.clerk = rando.address;

          // Attempt to Create a seller with admin not the same to caller address
          await expect(
            accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues)
          ).to.revertedWith(RevertReasons.NOT_ADMIN);
        });

        it("Caller does not own supplied auth token", async function () {
          // Set admin == zero address because seller will be created with auth token
          seller.admin = ethers.constants.AddressZero;
          seller.operator = rando.address;
          seller.clerk = rando.address;

          // Attempt to Create a seller without owning the auth token
          await expect(
            accountHandler.connect(rando).createSeller(seller, authToken, voucherInitValues)
          ).to.revertedWith(RevertReasons.NOT_ADMIN);
        });

        it("Caller is not the supplied operator", async function () {
          seller.admin = rando.address;
          seller.clerk = rando.address;

          // Attempt to Create a seller with operator not the same to caller address
          await expect(
            accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues)
          ).to.revertedWith(RevertReasons.NOT_OPERATOR_AND_CLERK);
        });

        it("Caller is not the supplied clerk", async function () {
          seller.admin = rando.address;
          seller.operator = rando.address;

          // Attempt to Create a seller with clerk not the same to caller address
          await expect(
            accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues)
          ).to.revertedWith(RevertReasons.NOT_OPERATOR_AND_CLERK);
        });
      });
    });

    context("👉 getSeller()", async function () {
      beforeEach(async function () {
        // AuthTokens
        emptyAuthToken = mockAuthToken();
        expect(emptyAuthToken.isValid()).is.true;

        authToken = new AuthToken("8400", AuthTokenType.Lens);
        expect(authToken.isValid()).is.true;

        // Seller can have either admin address or auth token
        seller.admin = ethers.constants.AddressZero;

        // Create a seller
        await accountHandler.connect(authTokenOwner).createSeller(seller, authToken, voucherInitValues);

        // Create a another seller
        seller2 = mockSeller(other1.address, other1.address, other1.address, other1.address);
        expect(seller2.isValid()).is.true;

        await accountHandler.connect(other1).createSeller(seller2, emptyAuthToken, voucherInitValues);
      });

      it("should return true for exists if seller is found", async function () {
        // Get the exists flag
        [exists] = await accountHandler.connect(rando).getSeller(seller.id);

        // Validate
        expect(exists).to.be.true;
      });

      it("should return false for exists if seller is not found", async function () {
        // Get the exists flag
        [exists] = await accountHandler.connect(rando).getSeller("666");

        // Validate
        expect(exists).to.be.false;
      });

      it("should return the details of the correct seller as a struct if found", async function () {
        // Get the seller as a struct
        [, sellerStruct, authTokenStruct] = await accountHandler.connect(rando).getSeller("1");

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);
        let returnedAuthToken = AuthToken.fromStruct(authTokenStruct);

        // Returned values should match the input in createSeller
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }

        // Returned auth token values should match the input in createSeller
        for ([key, value] of Object.entries(authToken)) {
          expect(JSON.stringify(returnedAuthToken[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should return the details of the correct seller if seller has empty authToken", async function () {
        // Get the seller as a struct
        [, sellerStruct, emptyAuthTokenStruct] = await accountHandler.connect(rando).getSeller("2");

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);
        let returnedAuthToken = AuthToken.fromStruct(emptyAuthTokenStruct);

        // Returned values should match the input in createSeller
        for ([key, value] of Object.entries(seller2)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }

        // Returned auth token values should match the input in createSeller
        for ([key, value] of Object.entries(emptyAuthToken)) {
          expect(JSON.stringify(returnedAuthToken[key]) === JSON.stringify(value)).is.true;
        }
      });
    });

    context("👉 getSellerByAddress()", async function () {
      beforeEach(async function () {
        // AuthTokens
        emptyAuthToken = mockAuthToken();
        expect(emptyAuthToken.isValid()).is.true;

        authToken = new AuthToken("8400", AuthTokenType.Lens);
        expect(authToken.isValid()).is.true;

        // Seller can have either admin address or auth token
        seller.admin = ethers.constants.AddressZero;

        // Create a seller
        await accountHandler.connect(authTokenOwner).createSeller(seller, authToken, voucherInitValues);

        // Create a another seller
        seller2 = mockSeller(other1.address, other1.address, other1.address, other1.address);
        expect(seller2.isValid()).is.true;

        contractURI = `https://ipfs.io/ipfs/QmW2WQi7j6c7UgJTarActp7tDNikE4B2qXtFCfLPdsgaTQ`;

        await accountHandler.connect(other1).createSeller(seller2, emptyAuthToken, voucherInitValues);
      });

      afterEach(async function () {
        // Reset the accountId iterator
        accountId.next(true);
      });

      it("should return the correct seller when searching on operator address", async function () {
        [exists, sellerStruct, authTokenStruct] = await accountHandler
          .connect(rando)
          .getSellerByAddress(operator.address);

        expect(exists).is.true;

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);
        let returnedAuthToken = AuthToken.fromStruct(authTokenStruct);

        // Returned values should match the input in createSeller
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }

        // Returned auth token values should match the input in createSeller
        for ([key, value] of Object.entries(authToken)) {
          expect(JSON.stringify(returnedAuthToken[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should return the correct seller when searching on admin address", async function () {
        [exists, sellerStruct, emptyAuthTokenStruct] = await accountHandler
          .connect(rando)
          .getSellerByAddress(other1.address);

        expect(exists).is.true;

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);
        let returnedAuthToken = AuthToken.fromStruct(emptyAuthTokenStruct);

        // Returned values should match the input in createSeller
        for ([key, value] of Object.entries(seller2)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }

        // Returned auth token values should match the input in createSeller
        for ([key, value] of Object.entries(emptyAuthToken)) {
          expect(JSON.stringify(returnedAuthToken[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should return the correct seller when searching on clerk address", async function () {
        [exists, sellerStruct, authTokenStruct] = await accountHandler.connect(rando).getSellerByAddress(clerk.address);

        expect(exists).is.true;

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);
        let returnedAuthToken = AuthToken.fromStruct(authTokenStruct);

        // Returned values should match the input in createSeller
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }

        // Returned auth token values should match the input in createSeller
        for ([key, value] of Object.entries(authToken)) {
          expect(JSON.stringify(returnedAuthToken[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should return exists false and default values when searching on treasury address", async function () {
        [exists, sellerStruct, emptyAuthTokenStruct] = await accountHandler
          .connect(rando)
          .getSellerByAddress(treasury.address);

        expect(exists).is.false;

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);
        let returnedAuthToken = AuthToken.fromStruct(emptyAuthTokenStruct);

        // Returned values should be the default value for it's data type
        for ([key, value] of Object.entries(returnedSeller)) {
          if (key != "active") {
            expect(value == 0).is.true || expect(value === ethers.constants.AddressZero).is.true;
          } else {
            expect(value).is.false;
          }
        }

        // Returned auth token values should be empty/default values
        for ([key, value] of Object.entries(emptyAuthToken)) {
          expect(JSON.stringify(returnedAuthToken[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should return exists false and default values when searching on unassociated address", async function () {
        [exists, sellerStruct, emptyAuthTokenStruct] = await accountHandler
          .connect(rando)
          .getSellerByAddress(deployer.address);

        expect(exists).is.false;

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);
        let returnedAuthToken = AuthToken.fromStruct(emptyAuthTokenStruct);

        // Returned values should be the default value for it's data type
        for ([key, value] of Object.entries(returnedSeller)) {
          if (key != "active") {
            expect(value == 0).is.true || expect(value === ethers.constants.AddressZero).is.true;
          } else {
            expect(value).is.false;
          }
        }

        // Returned auth token values should be empty/default values
        for ([key, value] of Object.entries(emptyAuthToken)) {
          expect(JSON.stringify(returnedAuthToken[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should return exists false and default values when searching on admin address that is zero address", async function () {
        [exists, sellerStruct, emptyAuthTokenStruct] = await accountHandler
          .connect(rando)
          .getSellerByAddress(seller.admin);

        expect(exists).is.false;

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);
        let returnedAuthToken = AuthToken.fromStruct(emptyAuthTokenStruct);

        // Returned values should be the default value for it's data type
        for ([key, value] of Object.entries(returnedSeller)) {
          if (key != "active") {
            expect(value == 0).is.true || expect(value === ethers.constants.AddressZero).is.true;
          } else {
            expect(value).is.false;
          }
        }

        // Returned auth token values should be empty/default values
        for ([key, value] of Object.entries(emptyAuthToken)) {
          expect(JSON.stringify(returnedAuthToken[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should return exists false and default values when searching on zero address", async function () {
        [exists, sellerStruct, emptyAuthTokenStruct] = await accountHandler
          .connect(rando)
          .getSellerByAddress(ethers.constants.AddressZero);

        expect(exists).is.false;

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);
        let returnedAuthToken = AuthToken.fromStruct(emptyAuthTokenStruct);

        // Returned values should be the default value for it's data type
        for ([key, value] of Object.entries(returnedSeller)) {
          if (key != "active") {
            expect(value == 0).is.true || expect(value === ethers.constants.AddressZero).is.true;
          } else {
            expect(value).is.false;
          }
        }

        // Returned auth token values should be empty/default values
        for ([key, value] of Object.entries(emptyAuthToken)) {
          expect(JSON.stringify(returnedAuthToken[key]) === JSON.stringify(value)).is.true;
        }
      });
    });

    context("👉 getSellerByAuthToken()", async function () {
      beforeEach(async function () {
        // AuthTokens
        emptyAuthToken = mockAuthToken();
        expect(emptyAuthToken.isValid()).is.true;

        authToken = new AuthToken("8400", AuthTokenType.Lens);
        expect(authToken.isValid()).is.true;

        authToken2 = new AuthToken("0", AuthTokenType.ENS);
        expect(authToken2.isValid()).is.true;

        // Seller can have either admin address or auth token
        seller.admin = ethers.constants.AddressZero;

        // Create a seller
        await accountHandler.connect(authTokenOwner).createSeller(seller, authToken, voucherInitValues);

        // Create seller 2
        seller2 = mockSeller(other1.address, other1.address, other1.address, other1.address);
        expect(seller2.isValid()).is.true;

        contractURI = `https://ipfs.io/ipfs/QmW2WQi7j6c7UgJTarActp7tDNikE4B2qXtFCfLPdsgaTQ`;

        await accountHandler.connect(other1).createSeller(seller2, emptyAuthToken, voucherInitValues);

        // Create seller 3
        seller3 = mockSeller(other5.address, ethers.constants.AddressZero, other5.address, treasury.address);
        expect(seller3.isValid()).is.true;

        contractURI = `https://ipfs.io/ipfs/QmPChd2hVbrJ6bfo3WBcTW4iZnpHm8TEzWkLHmLpXhF68A`;

        await mockAuthERC721Contract2.connect(other5).mint(authToken2.tokenId, 1);
        await accountHandler.connect(other5).createSeller(seller3, authToken2, voucherInitValues);
      });

      afterEach(async function () {
        // Reset the accountId iterator
        accountId.next(true);
      });

      it("should return the correct seller when searching on valid auth token", async function () {
        //Search on authToken
        [exists, sellerStruct, authTokenStruct] = await accountHandler.connect(rando).getSellerByAuthToken(authToken);

        expect(exists).is.true;

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);
        let returnedAuthToken = AuthToken.fromStruct(authTokenStruct);

        // Returned values should match the input in createSeller
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }

        // Returned auth token values should match the input in createSeller
        for ([key, value] of Object.entries(authToken)) {
          expect(JSON.stringify(returnedAuthToken[key]) === JSON.stringify(value)).is.true;
        }

        //Search on authToken2
        [exists, sellerStruct, authTokenStruct] = await accountHandler.connect(rando).getSellerByAuthToken(authToken2);

        expect(exists).is.true;

        // Parse into entity
        returnedSeller = Seller.fromStruct(sellerStruct);
        returnedAuthToken = AuthToken.fromStruct(authTokenStruct);

        // Returned values should match the input in createSeller
        for ([key, value] of Object.entries(seller3)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }

        // Returned auth token values should match the input in createSeller
        for ([key, value] of Object.entries(authToken2)) {
          expect(JSON.stringify(returnedAuthToken[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should return the correct seller when two sellers have same auth token Id but different auth token type", async function () {
        //create seller with same auth token Id but different auth token type from seller 1
        authToken3 = new AuthToken("8400", AuthTokenType.ENS);
        expect(authToken3.isValid()).is.true;

        // Create seller 4
        seller4 = mockSeller(rando.address, ethers.constants.AddressZero, rando.address, treasury.address);
        expect(seller4.isValid()).is.true;

        await mockAuthERC721Contract2.connect(rando).mint(authToken3.tokenId, 1);
        await accountHandler.connect(rando).createSeller(seller4, authToken3, voucherInitValues);

        //Search on authToken
        [exists, sellerStruct, authTokenStruct] = await accountHandler.connect(rando).getSellerByAuthToken(authToken);

        expect(exists).is.true;

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);
        let returnedAuthToken = AuthToken.fromStruct(authTokenStruct);

        // Returned values should match the input in createSeller
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }

        // Returned auth token values should match the input in createSeller
        for ([key, value] of Object.entries(authToken)) {
          expect(JSON.stringify(returnedAuthToken[key]) === JSON.stringify(value)).is.true;
        }

        //Search on authToken3
        [exists, sellerStruct, authTokenStruct] = await accountHandler.connect(rando).getSellerByAuthToken(authToken3);

        expect(exists).is.true;

        // Parse into entity
        returnedSeller = Seller.fromStruct(sellerStruct);
        returnedAuthToken = AuthToken.fromStruct(authTokenStruct);

        // Returned values should match the input in createSeller
        for ([key, value] of Object.entries(seller4)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }

        // Returned auth token values should match the input in createSeller
        for ([key, value] of Object.entries(authToken3)) {
          expect(JSON.stringify(returnedAuthToken[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should return the correct seller when two sellers have same auth token type but different auth token id", async function () {
        //create seller with same auth token Id but different auth token type from seller 1
        authToken3 = new AuthToken("0", AuthTokenType.Lens);
        expect(authToken3.isValid()).is.true;

        // Create seller 4
        seller4 = mockSeller(rando.address, ethers.constants.AddressZero, rando.address, treasury.address);
        expect(seller4.isValid()).is.true;

        await mockAuthERC721Contract.connect(rando).mint(authToken3.tokenId, 1);
        await accountHandler.connect(rando).createSeller(seller4, authToken3, voucherInitValues);

        //Search on authToken
        [exists, sellerStruct, authTokenStruct] = await accountHandler.connect(rando).getSellerByAuthToken(authToken);

        expect(exists).is.true;

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);
        let returnedAuthToken = AuthToken.fromStruct(authTokenStruct);

        // Returned values should match the input in createSeller
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }

        // Returned auth token values should match the input in createSeller
        for ([key, value] of Object.entries(authToken)) {
          expect(JSON.stringify(returnedAuthToken[key]) === JSON.stringify(value)).is.true;
        }

        //Search on authToken3
        [exists, sellerStruct, authTokenStruct] = await accountHandler.connect(rando).getSellerByAuthToken(authToken3);

        expect(exists).is.true;

        // Parse into entity
        returnedSeller = Seller.fromStruct(sellerStruct);
        returnedAuthToken = AuthToken.fromStruct(authTokenStruct);

        // Returned values should match the input in createSeller
        for ([key, value] of Object.entries(seller4)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }

        // Returned auth token values should match the input in createSeller
        for ([key, value] of Object.entries(authToken3)) {
          expect(JSON.stringify(returnedAuthToken[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should return exists false and default values when searching on empty auth token", async function () {
        [exists, sellerStruct, emptyAuthTokenStruct] = await accountHandler
          .connect(rando)
          .getSellerByAuthToken(emptyAuthToken);

        expect(exists).is.false;

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);
        let returnedAuthToken = AuthToken.fromStruct(emptyAuthTokenStruct);

        // Returned values should be the default value for it's data type
        for ([key, value] of Object.entries(returnedSeller)) {
          if (key != "active") {
            expect(value == 0).is.true || expect(value === ethers.constants.AddressZero).is.true;
          } else {
            expect(value).is.false;
          }
        }

        // Returned auth token values should be empty/default values
        for ([key, value] of Object.entries(emptyAuthToken)) {
          expect(JSON.stringify(returnedAuthToken[key]) === JSON.stringify(value)).is.true;
        }
      });
    });

    context("👉 updateSeller()", async function () {
      beforeEach(async function () {
        pendingSellerUpdate = seller.clone();
        pendingSellerUpdate.id = "0";
        pendingSellerUpdate.treasury = ethers.constants.AddressZero;
        pendingSellerUpdate.clerk = ethers.constants.AddressZero;
        pendingSellerUpdate.admin = ethers.constants.AddressZero;
        pendingSellerUpdate.operator = ethers.constants.AddressZero;
        pendingSellerUpdate.active = false;
        pendingSellerUpdateStruct = pendingSellerUpdate.toStruct();

        // Create a seller
        await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);
      });

      it("should emit a SellerUpdateApplied and OwnershipTransferred event with correct values if values change", async function () {
        seller.treasury = other4.address;
        // Treasury is the only values that can be update without address owner authorization
        sellerStruct = seller.toStruct();

        seller.admin = ethers.constants.AddressZero;
        seller.operator = other1.address;
        seller.clerk = other3.address;
        expect(seller.isValid()).is.true;

        pendingSellerUpdate = seller.clone();
        pendingSellerUpdate.id = "0";
        pendingSellerUpdate.treasury = ethers.constants.AddressZero;
        pendingSellerUpdate.active = false;
        expect(pendingSellerUpdate.isValid()).is.true;
        pendingSellerUpdateStruct = pendingSellerUpdate.toStruct();

        pendingAuthToken = authToken;
        pendingAuthTokenStruct = pendingAuthToken.toStruct();

        // Update seller
        let tx = await accountHandler.connect(admin).updateSeller(seller, authToken);

        // Testing for the SellerUpdateApplied event
        await expect(tx)
          .to.emit(accountHandler, "SellerUpdateApplied")
          .withArgs(
            seller.id,
            sellerStruct,
            pendingSellerUpdateStruct,
            emptyAuthTokenStruct,
            pendingAuthTokenStruct,
            admin.address
          );

        // Testing for the SellerUpdatePending event
        await expect(tx)
          .to.emit(accountHandler, "SellerUpdatePending")
          .withArgs(seller.id, pendingSellerUpdateStruct, pendingAuthTokenStruct, admin.address);

        // Update seller operator
        tx = await accountHandler.connect(other1).optInToSellerUpdate(seller.id, [SellerUpdateFields.Operator]);

        // Voucher clone contract
        const bosonVoucherCloneAddress = calculateContractAddress(exchangeHandler.address, "1");
        bosonVoucher = await ethers.getContractAt("OwnableUpgradeable", bosonVoucherCloneAddress);

        await expect(tx).to.emit(bosonVoucher, "OwnershipTransferred").withArgs(operator.address, other1.address);

        pendingSellerUpdate.operator = ethers.constants.AddressZero;
        pendingSellerUpdateStruct = pendingSellerUpdate.toStruct();
        seller.clerk = clerk.address;
        seller.admin = admin.address;
        sellerStruct = seller.toStruct();

        // Check operator update
        await expect(tx)
          .to.emit(accountHandler, "SellerUpdateApplied")
          .withArgs(
            seller.id,
            sellerStruct,
            pendingSellerUpdateStruct,
            emptyAuthTokenStruct,
            pendingAuthTokenStruct,
            other1.address
          );

        // Update seller auth token
        tx = await accountHandler
          .connect(authTokenOwner)
          .optInToSellerUpdate(seller.id, [SellerUpdateFields.AuthToken]);

        pendingAuthToken = emptyAuthToken;
        pendingAuthTokenStruct = pendingAuthToken.toStruct();
        seller.admin = ethers.constants.AddressZero;
        sellerStruct = seller.toStruct();

        // Check auth token update
        await expect(tx)
          .to.emit(accountHandler, "SellerUpdateApplied")
          .withArgs(
            seller.id,
            sellerStruct,
            pendingSellerUpdateStruct,
            authTokenStruct,
            pendingAuthTokenStruct,
            authTokenOwner.address
          );

        tx = await accountHandler.connect(other3).optInToSellerUpdate(seller.id, [SellerUpdateFields.Clerk]);

        pendingSellerUpdate.clerk = ethers.constants.AddressZero;
        pendingSellerUpdateStruct = pendingSellerUpdate.toStruct();

        seller.clerk = other3.address;
        sellerStruct = seller.toStruct();

        // Check clerk updated
        await expect(tx)
          .to.emit(accountHandler, "SellerUpdateApplied")
          .withArgs(
            seller.id,
            sellerStruct,
            pendingSellerUpdateStruct,
            authTokenStruct,
            pendingAuthTokenStruct,
            other3.address
          );
      });

      it("should not emit a SellerUpdateApplied and OwnershipTransferred event if values stay the same", async function () {
        const tx = await accountHandler.connect(admin).updateSeller(seller, emptyAuthToken);

        // Nothing should emit because values are the same
        await expect(tx).to.not.emit(accountHandler, "SellerUpdateApplied");

        // Voucher clone contract
        const bosonVoucherCloneAddress = calculateContractAddress(exchangeHandler.address, "1");
        bosonVoucher = await ethers.getContractAt("OwnableUpgradeable", bosonVoucherCloneAddress);

        // Since operator stayed the same, clone contract ownership should not be transferred
        await expect(tx).to.not.emit(bosonVoucher, "OwnershipTransferred");
      });

      it("should update state of all fields except Id and active flag", async function () {
        seller.operator = other1.address;
        seller.admin = ethers.constants.AddressZero;
        seller.clerk = other3.address;
        seller.treasury = other4.address;
        seller.active = false;

        //Update should not change id or active flag
        expectedSeller = seller.clone();
        expectedSeller.active = true;
        expect(expectedSeller.isValid()).is.true;

        // Update a seller
        await accountHandler.connect(admin).updateSeller(seller, authToken);

        // Approve operator update
        await accountHandler.connect(other1).optInToSellerUpdate(seller.id, [SellerUpdateFields.Operator]);

        // Approve clerk update
        await accountHandler.connect(other3).optInToSellerUpdate(seller.id, [SellerUpdateFields.Clerk]);

        // Approve auth token update
        await accountHandler.connect(authTokenOwner).optInToSellerUpdate(seller.id, [SellerUpdateFields.AuthToken]);

        // Get the seller as a struct
        [, sellerStruct, authTokenStruct] = await accountHandler.connect(rando).getSeller(seller.id);

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);
        let returnedAuthToken = AuthToken.fromStruct(authTokenStruct);

        // Returned values should match the expected values
        for ([key, value] of Object.entries(expectedSeller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }

        // Returned auth token values should match the input in updateSeller
        for ([key, value] of Object.entries(authToken)) {
          expect(JSON.stringify(returnedAuthToken[key]) === JSON.stringify(value)).is.true;
        }

        //Check that old addresses are no longer mapped. We don't map the treasury address.
        [exists] = await accountHandler.connect(rando).getSellerByAddress(operator.address);
        expect(exists).to.be.false;

        [exists] = await accountHandler.connect(rando).getSellerByAddress(admin.address);
        expect(exists).to.be.false;

        [exists] = await accountHandler.connect(rando).getSellerByAddress(clerk.address);
        expect(exists).to.be.false;

        //Check that new addresses are mapped. We don't map the treasury address.
        [exists] = await accountHandler.connect(rando).getSellerByAddress(seller.operator);
        expect(exists).to.be.true;

        //Zero address -- should return false
        [exists] = await accountHandler.connect(rando).getSellerByAddress(seller.admin);
        expect(exists).to.be.false;

        [exists] = await accountHandler.connect(rando).getSellerByAddress(seller.clerk);
        expect(exists).to.be.true;

        // Voucher clone contract
        const bosonVoucherCloneAddress = calculateContractAddress(exchangeHandler.address, "1");
        bosonVoucher = await ethers.getContractAt("OwnableUpgradeable", bosonVoucherCloneAddress);

        expect(await bosonVoucher.owner()).to.equal(seller.operator, "Wrong voucher clone owner");
      });

      it("should update state from auth token to empty auth token", async function () {
        seller2 = mockSeller(other1.address, ethers.constants.AddressZero, other1.address, other1.address);
        expect(seller2.isValid()).is.true;

        // msg.sender must be equal to seller's operator and clerk
        await mockAuthERC721Contract.connect(authTokenOwner).transferFrom(authTokenOwner.address, other1.address, 8400);
        authTokenOwner = other1;

        // Create a seller with auth token
        await accountHandler.connect(authTokenOwner).createSeller(seller2, authToken, voucherInitValues);

        seller2.operator = other5.address;
        seller2.admin = other6.address;
        seller2.clerk = other7.address;
        seller2.treasury = other8.address;
        seller2.active = false;

        //Update should not change id or active flag
        expectedSeller = seller2.clone();
        expectedSeller.active = true;
        expect(expectedSeller.isValid()).is.true;

        // Update seller
        await accountHandler.connect(authTokenOwner).updateSeller(seller2, emptyAuthToken);

        // Approve operator update
        await accountHandler.connect(other5).optInToSellerUpdate(seller2.id, [SellerUpdateFields.Operator]);

        // Approve admin update
        await accountHandler.connect(other6).optInToSellerUpdate(seller2.id, [SellerUpdateFields.Admin]);

        // Approve clerk update
        await accountHandler.connect(other7).optInToSellerUpdate(seller2.id, [SellerUpdateFields.Clerk]);

        // Get the seller as a struct
        [, sellerStruct, authTokenStruct] = await accountHandler.connect(rando).getSeller(seller2.id);

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);
        let returnedAuthToken = AuthToken.fromStruct(authTokenStruct);

        // Returned values should match the expected values
        for ([key, value] of Object.entries(expectedSeller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }

        // Returned auth token values should match the input in updateSeller
        for ([key, value] of Object.entries(emptyAuthToken)) {
          expect(JSON.stringify(returnedAuthToken[key]) === JSON.stringify(value)).is.true;
        }

        //Check that old addresses are no longer mapped. We don't map the treasury address.
        [exists] = await accountHandler.connect(rando).getSellerByAddress(other1.address);
        expect(exists).to.be.false;

        [exists] = await accountHandler.connect(rando).getSellerByAddress(ethers.constants.AddressZero);
        expect(exists).to.be.false;

        [exists] = await accountHandler.connect(rando).getSellerByAddress(other3.address);
        expect(exists).to.be.false;

        //Check that new addresses are mapped. We don't map the treasury address.
        [exists] = await accountHandler.connect(rando).getSellerByAddress(seller2.operator);
        expect(exists).to.be.true;

        [exists] = await accountHandler.connect(rando).getSellerByAddress(seller2.admin);
        expect(exists).to.be.true;

        [exists] = await accountHandler.connect(rando).getSellerByAddress(seller2.clerk);
        expect(exists).to.be.true;

        // Voucher clone contract
        const bosonVoucherCloneAddress = calculateContractAddress(exchangeHandler.address, "1");
        bosonVoucher = await ethers.getContractAt("OwnableUpgradeable", bosonVoucherCloneAddress);

        expect(await bosonVoucher.owner()).to.equal(seller.operator, "Wrong voucher clone owner");
      });

      it("should update state from auth token to new auth token", async function () {
        seller2 = mockSeller(other1.address, ethers.constants.AddressZero, other1.address, other1.address);
        expect(seller2.isValid()).is.true;

        // msg.sender must be equal to seller's operator and clerk
        await mockAuthERC721Contract.connect(authTokenOwner).transferFrom(authTokenOwner.address, other1.address, 8400);
        authTokenOwner = other1;

        // Create a seller with auth token
        await accountHandler.connect(authTokenOwner).createSeller(seller2, authToken, voucherInitValues);

        seller2.operator = other5.address;
        seller2.admin = ethers.constants.AddressZero;
        seller2.clerk = other7.address;
        seller2.treasury = other8.address;
        seller2.active = false;

        await mockAuthERC721Contract2.connect(authTokenOwner).mint(0, 1);

        authToken2 = new AuthToken("0", AuthTokenType.ENS);
        expect(authToken2.isValid()).is.true;

        //Update should not change id or active flag
        expectedSeller = seller2.clone();
        expectedSeller.active = true;
        expect(expectedSeller.isValid()).is.true;

        // Update seller
        await accountHandler.connect(authTokenOwner).updateSeller(seller2, authToken2);

        await accountHandler.connect(other5).optInToSellerUpdate(seller2.id, [SellerUpdateFields.Operator]);
        await accountHandler.connect(other7).optInToSellerUpdate(seller2.id, [SellerUpdateFields.Clerk]);
        await accountHandler.connect(authTokenOwner).optInToSellerUpdate(seller2.id, [SellerUpdateFields.AuthToken]);

        // Get the seller as a struct
        [, sellerStruct, authTokenStruct] = await accountHandler.connect(rando).getSeller(seller2.id);

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);
        let returnedAuthToken = AuthToken.fromStruct(authTokenStruct);

        // Returned values should match the expected values
        for ([key, value] of Object.entries(expectedSeller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }

        // Returned auth token values should match the input in updateSeller
        for ([key, value] of Object.entries(authToken2)) {
          expect(JSON.stringify(returnedAuthToken[key]) === JSON.stringify(value)).is.true;
        }

        //Check that old addresses are no longer mapped. We don't map the treasury address.
        [exists] = await accountHandler.connect(rando).getSellerByAddress(other1.address);
        expect(exists).to.be.false;

        [exists] = await accountHandler.connect(rando).getSellerByAddress(ethers.constants.AddressZero);
        expect(exists).to.be.false;

        [exists] = await accountHandler.connect(rando).getSellerByAddress(other3.address);
        expect(exists).to.be.false;

        //Check that new addresses are mapped. We don't map the treasury address.
        [exists] = await accountHandler.connect(rando).getSellerByAddress(seller2.operator);
        expect(exists).to.be.true;

        [exists] = await accountHandler.connect(rando).getSellerByAddress(seller2.admin);
        expect(exists).to.be.false;

        [exists] = await accountHandler.connect(rando).getSellerByAddress(seller2.clerk);
        expect(exists).to.be.true;

        // Voucher clone contract
        const bosonVoucherCloneAddress = calculateContractAddress(exchangeHandler.address, "1");
        bosonVoucher = await ethers.getContractAt("OwnableUpgradeable", bosonVoucherCloneAddress);

        expect(await bosonVoucher.owner()).to.equal(seller.operator, "Wrong voucher clone owner");
      });

      it("should update state correctly if values are the same", async function () {
        // Update a seller
        await accountHandler.connect(admin).updateSeller(seller, emptyAuthToken);

        // Get the seller as a struct
        [, sellerStruct, authTokenStruct] = await accountHandler.connect(rando).getSeller(seller.id);

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);
        let returnedAuthToken = AuthToken.fromStruct(authTokenStruct);

        // Returned values should match the input in updateSeller
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }

        // Returned auth token values should match the input in updateSeller
        for ([key, value] of Object.entries(emptyAuthToken)) {
          expect(JSON.stringify(returnedAuthToken[key]) === JSON.stringify(value)).is.true;
        }

        // Voucher clone contract
        const bosonVoucherCloneAddress = calculateContractAddress(exchangeHandler.address, "1");
        bosonVoucher = await ethers.getContractAt("OwnableUpgradeable", bosonVoucherCloneAddress);

        expect(await bosonVoucher.owner()).to.equal(seller.operator, "Wrong voucher clone owner");
      });

      it("should update only one address", async function () {
        seller.operator = other1.address;

        sellerStruct = seller.toStruct();

        // Update a seller
        await accountHandler.connect(admin).updateSeller(seller, emptyAuthToken);

        // Approve update
        await accountHandler.connect(other1).optInToSellerUpdate(seller.id, [SellerUpdateFields.Operator]);

        // Get the seller as a struct
        [, sellerStruct, authTokenStruct] = await accountHandler.connect(rando).getSeller(seller.id);

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);
        let returnedAuthToken = AuthToken.fromStruct(authTokenStruct);

        // Returned values should match the input in updateSeller
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }

        // Returned auth token values should match the input in updateSeller
        for ([key, value] of Object.entries(emptyAuthToken)) {
          expect(JSON.stringify(returnedAuthToken[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should update the correct seller", async function () {
        // Configure another seller
        seller2 = mockSeller(other1.address, ethers.constants.AddressZero, other1.address, other1.address);
        expect(seller2.isValid()).is.true;

        contractURI = `https://ipfs.io/ipfs/QmW2WQi7j6c7UgJTarActp7tDNikE4B2qXtFCfLPdsgaTQ`;

        // msg.sender must be equal to seller's operator and clerk
        authTokenOwner = other1;
        await mockAuthERC721Contract.connect(authTokenOwner).mint(8500, 1);

        //Seller2  auth token
        authToken2 = new AuthToken("8500", AuthTokenType.Lens);

        //Create seller2
        await accountHandler.connect(authTokenOwner).createSeller(seller2, authToken2, voucherInitValues);

        //Update seller2
        seller2.operator = rando.address;
        seller2.admin = ethers.constants.AddressZero;
        seller2.clerk = rando.address;
        seller2.treasury = rando.address;
        seller2.active = false;

        //Update should not change id or active flag
        expectedSeller = seller2.clone();
        expectedSeller.active = true;
        expect(expectedSeller.isValid()).is.true;

        //Seller2 specified wrong token Id in create. Update to correct one now
        authToken2.tokenId = "8400";

        // Update seller2
        await accountHandler.connect(authTokenOwner).updateSeller(seller2, authToken2);

        // Approve update
        await accountHandler
          .connect(rando)
          .optInToSellerUpdate(seller2.id, [SellerUpdateFields.Operator, SellerUpdateFields.Clerk]);

        // Approve auth token update
        authTokenOwner = operator;
        await accountHandler.connect(authTokenOwner).optInToSellerUpdate(seller2.id, [SellerUpdateFields.AuthToken]);

        // Check first seller hasn't changed
        [, sellerStruct, authTokenStruct] = await accountHandler.connect(rando).getSeller(seller.id);

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);
        let returnedAuthToken = AuthToken.fromStruct(authTokenStruct);

        // returnedSeller should still contain original values
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }

        // returnedAuthToken should still contain original values
        for ([key, value] of Object.entries(emptyAuthToken)) {
          expect(JSON.stringify(returnedAuthToken[key]) === JSON.stringify(value)).is.true;
        }

        // Check seller2 HAS changed
        [, sellerStruct, authTokenStruct] = await accountHandler.connect(rando).getSeller(seller2.id);

        // Parse into entity
        let returnedSeller2 = Seller.fromStruct(sellerStruct);
        let returnedAuthToken2 = AuthToken.fromStruct(authTokenStruct);

        // returnedSeller2 should contain new values
        for ([key, value] of Object.entries(expectedSeller)) {
          expect(JSON.stringify(returnedSeller2[key]) === JSON.stringify(value)).is.true;
        }

        // returnedAuthToken2 should contain new values
        for ([key, value] of Object.entries(authToken2)) {
          expect(JSON.stringify(returnedAuthToken2[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should be able to only update with new admin address", async function () {
        seller.admin = other2.address;
        sellerStruct = seller.toStruct();
        pendingSellerUpdate.admin = other2.address;
        pendingSellerUpdateStruct = pendingSellerUpdate.toStruct();

        // Update seller
        let tx = await accountHandler.connect(admin).updateSeller(seller, emptyAuthToken);

        // Testing for the SellerUpdatePending event
        await expect(tx)
          .to.emit(accountHandler, "SellerUpdatePending")
          .withArgs(seller.id, pendingSellerUpdateStruct, emptyAuthTokenStruct, admin.address);

        pendingSellerUpdate.admin = ethers.constants.AddressZero;
        pendingSellerUpdateStruct = pendingSellerUpdate.toStruct();

        // Approve update
        await expect(accountHandler.connect(other2).optInToSellerUpdate(seller.id, [SellerUpdateFields.Admin]))
          .to.emit(accountHandler, "SellerUpdateApplied")
          .withArgs(
            seller.id,
            sellerStruct,
            pendingSellerUpdateStruct,
            emptyAuthTokenStruct,
            emptyAuthTokenStruct,
            other2.address
          );

        seller.admin = other3.address;
        sellerStruct = seller.toStruct();
        pendingSellerUpdate.admin = other3.address;
        pendingSellerUpdateStruct = pendingSellerUpdate.toStruct();

        // Update seller
        tx = await accountHandler.connect(other2).updateSeller(seller, emptyAuthToken);

        // Testing for the SellerUpdatePending event
        await expect(tx)
          .to.emit(accountHandler, "SellerUpdatePending")
          .withArgs(seller.id, pendingSellerUpdateStruct, emptyAuthTokenStruct, other2.address);

        pendingSellerUpdate.admin = ethers.constants.AddressZero;
        pendingSellerUpdateStruct = pendingSellerUpdate.toStruct();

        // Approve update
        await expect(accountHandler.connect(other3).optInToSellerUpdate(seller.id, [SellerUpdateFields.Admin]))
          .to.emit(accountHandler, "SellerUpdateApplied")
          .withArgs(
            seller.id,
            sellerStruct,
            pendingSellerUpdateStruct,
            emptyAuthTokenStruct,
            emptyAuthTokenStruct,
            other3.address
          );

        // Attempt to update the seller with original admin address, expecting revert
        await expect(accountHandler.connect(admin).updateSeller(seller, emptyAuthToken)).to.revertedWith(
          RevertReasons.NOT_ADMIN
        );
      });

      it("should be able to only update with new auth token", async function () {
        seller.admin = ethers.constants.AddressZero;
        sellerStruct = seller.toStruct();

        // Update seller, testing for the event
        await expect(accountHandler.connect(admin).updateSeller(seller, authToken))
          .to.emit(accountHandler, "SellerUpdatePending")
          .withArgs(seller.id, pendingSellerUpdateStruct, authTokenStruct, admin.address);

        // Approve update
        await expect(
          accountHandler.connect(authTokenOwner).optInToSellerUpdate(seller.id, [SellerUpdateFields.AuthToken])
        )
          .to.emit(accountHandler, "SellerUpdateApplied")
          .withArgs(
            seller.id,
            sellerStruct,
            pendingSellerUpdateStruct,
            authTokenStruct,
            emptyAuthTokenStruct,
            authTokenOwner.address
          );

        seller.operator = other3.address;
        pendingSellerUpdate.operator = other3.address;
        pendingSellerUpdateStruct = pendingSellerUpdate.toStruct();

        // Transfer ownership of auth token because owner must be different from old admin
        await mockAuthERC721Contract.connect(authTokenOwner).transferFrom(authTokenOwner.address, other1.address, 8400);
        authTokenOwner = other1;

        // Update seller
        const tx = await accountHandler.connect(authTokenOwner).updateSeller(seller, authToken);

        // Testing for the SellerUpdatePending event
        await expect(tx)
          .to.emit(accountHandler, "SellerUpdatePending")
          .withArgs(seller.id, pendingSellerUpdateStruct, emptyAuthTokenStruct, authTokenOwner.address);

        sellerStruct = seller.toStruct();
        pendingSellerUpdate.operator = ethers.constants.AddressZero;
        pendingSellerUpdateStruct = pendingSellerUpdate.toStruct();

        // Approve update
        await expect(accountHandler.connect(other3).optInToSellerUpdate(seller.id, [SellerUpdateFields.Operator]))
          .to.emit(accountHandler, "SellerUpdateApplied")
          .withArgs(
            seller.id,
            sellerStruct,
            pendingSellerUpdateStruct,
            authTokenStruct,
            emptyAuthTokenStruct,
            other3.address
          );

        // Attempt to update the seller with original admin address, expecting revertStruct
        await expect(accountHandler.connect(admin).updateSeller(seller, authToken)).to.revertedWith(
          RevertReasons.NOT_ADMIN
        );
      });

      it("should be possible to use non-unique treasury address", async function () {
        seller2 = seller.clone();
        seller2.id = accountId.next().value;
        seller2.treasury = other2.address;

        seller.operator = other1.address;
        seller.admin = other1.address;
        seller.clerk = other1.address;

        pendingSellerUpdate = seller.clone();
        pendingSellerUpdate.active = false;
        pendingSellerUpdate.id = "0";
        pendingSellerUpdate.treasury = ethers.constants.AddressZero;
        pendingSellerUpdateStruct = pendingSellerUpdate.toStruct();

        // Update seller
        const tx = await accountHandler.connect(admin).updateSeller(seller, emptyAuthToken);

        // Testing for the SellerUpdatePending event
        await expect(tx)
          .to.emit(accountHandler, "SellerUpdatePending")
          .withArgs(seller.id, pendingSellerUpdateStruct, emptyAuthTokenStruct, admin.address);

        //Create struct again with new addresses
        sellerStruct = seller.toStruct();

        // Approve update
        await accountHandler
          .connect(other1)
          .optInToSellerUpdate(seller.id, [
            SellerUpdateFields.Operator,
            SellerUpdateFields.Admin,
            SellerUpdateFields.Clerk,
          ]);

        // Make sure seller treasury didn't change
        [, sellerStruct, authTokenStruct] = await accountHandler.connect(rando).getSeller(seller.id);
        let returnedSeller = Seller.fromStruct(sellerStruct);
        expect(returnedSeller.treasury).to.equal(treasury.address);

        // Create seller 2
        await accountHandler.connect(admin).createSeller(seller2, emptyAuthToken, voucherInitValues);

        // Update seller 2 treasury
        seller2.treasury = treasury.address;
        await accountHandler.connect(admin).updateSeller(seller2, emptyAuthToken);

        // Check seller 2 treasury
        [, sellerStruct, authTokenStruct] = await accountHandler.connect(rando).getSeller(seller2.id);
        let returnedSeller2 = Seller.fromStruct(sellerStruct);
        expect(returnedSeller2.treasury).to.equal(treasury.address);
      });

      it("should be possible to use the same address for operator, admin, clerk, and treasury", async function () {
        // Only treasury doesn't need owner approval and will be updated immediately
        seller.treasury = other1.address;
        sellerStruct = seller.toStruct();

        seller.operator = other1.address;
        seller.admin = other1.address;
        seller.clerk = other1.address;

        // Update seller
        const tx = await accountHandler.connect(admin).updateSeller(seller, emptyAuthToken);

        // Pending seller is filled with only admin, clerk, and operator addresses
        pendingSellerUpdate = seller.clone();
        pendingSellerUpdate.id = "0";
        pendingSellerUpdate.active = false;
        pendingSellerUpdate.treasury = ethers.constants.AddressZero;
        pendingSellerUpdateStruct = pendingSellerUpdate.toStruct();

        // Testing for the SellerUpdateApplied event
        await expect(tx)
          .to.emit(accountHandler, "SellerUpdateApplied")
          .withArgs(
            seller.id,
            sellerStruct,
            pendingSellerUpdateStruct,
            emptyAuthTokenStruct,
            emptyAuthTokenStruct,
            admin.address
          );

        // Testing for the SellerUpdatePending event
        await expect(tx)
          .to.emit(accountHandler, "SellerUpdatePending")
          .withArgs(seller.id, pendingSellerUpdateStruct, emptyAuthTokenStruct, admin.address);

        sellerStruct = seller.toStruct();
        // Nothing pending left
        pendingSellerUpdate.admin = ethers.constants.AddressZero;
        pendingSellerUpdate.clerk = ethers.constants.AddressZero;
        pendingSellerUpdate.operator = ethers.constants.AddressZero;
        pendingSellerUpdateStruct = pendingSellerUpdate.toStruct();

        // Approve update
        await expect(
          await accountHandler
            .connect(other1)
            .optInToSellerUpdate(seller.id, [
              SellerUpdateFields.Operator,
              SellerUpdateFields.Admin,
              SellerUpdateFields.Clerk,
            ])
        )
          .to.emit(accountHandler, "SellerUpdateApplied")
          .withArgs(
            seller.id,
            sellerStruct,
            pendingSellerUpdateStruct,
            emptyAuthTokenStruct,
            emptyAuthTokenStruct,
            other1.address
          );
      });

      context("💔 Revert Reasons", async function () {
        it("The sellers region of protocol is paused", async function () {
          // Pause the sellers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Sellers]);

          // Attempt to update a seller expecting revert
          await expect(accountHandler.connect(admin).updateSeller(seller, emptyAuthToken)).to.revertedWith(
            RevertReasons.REGION_PAUSED
          );
        });

        it("Seller does not exist", async function () {
          // Set invalid id
          seller.id = "444";

          // Attempt to update the seller, expecting revert
          await expect(accountHandler.connect(admin).updateSeller(seller, emptyAuthToken)).to.revertedWith(
            RevertReasons.NO_SUCH_SELLER
          );

          // Set invalid id
          seller.id = "0";

          // Attempt to update the seller, expecting revert
          await expect(accountHandler.connect(admin).updateSeller(seller, emptyAuthToken)).to.revertedWith(
            RevertReasons.NO_SUCH_SELLER
          );
        });

        it("Caller is not seller admin", async function () {
          // Attempt to update the seller, expecting revert
          await expect(accountHandler.connect(rando).updateSeller(seller, emptyAuthToken)).to.revertedWith(
            RevertReasons.NOT_ADMIN
          );
        });

        it("addresses are the zero address", async function () {
          seller.operator = ethers.constants.AddressZero;
          seller.admin = ethers.constants.AddressZero;
          seller.clerk = ethers.constants.AddressZero;

          // Attempt to update a seller, expecting revert
          await expect(accountHandler.connect(authTokenOwner).updateSeller(seller, authToken)).to.revertedWith(
            RevertReasons.INVALID_ADDRESS
          );
        });

        it("addresses are not unique to this seller Id when addresses used for same role", async function () {
          seller.id = accountId.next().value;
          seller.operator = other1.address;
          seller.admin = other1.address;
          seller.clerk = other1.address;
          seller.treasury = other1.address;
          seller.active = true;
          sellerStruct = seller.toStruct();
          expectedCloneAddress = calculateContractAddress(accountHandler.address, "2");

          //Create second seller
          await expect(accountHandler.connect(other1).createSeller(seller, emptyAuthToken, voucherInitValues))
            .to.emit(accountHandler, "SellerCreated")
            .withArgs(seller.id, sellerStruct, expectedCloneAddress, emptyAuthTokenStruct, other1.address);

          //Set operator address value to be same as first seller created in Seller Methods beforeEach
          seller.operator = operator.address; //already being used by seller 1

          // Attempt to update seller 2 with non-unique operator, expecting revert
          await expect(accountHandler.connect(other1).updateSeller(seller, emptyAuthToken)).to.revertedWith(
            RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE
          );

          seller.admin = admin.address; //already being used by seller 1
          seller.operator = other1.address;

          // Attempt to update a seller with non-unique admin, expecting revert
          await expect(accountHandler.connect(other1).updateSeller(seller, emptyAuthToken)).to.revertedWith(
            RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE
          );

          seller.clerk = clerk.address; //already being used by seller 1
          seller.admin = other1.address;

          // Attempt to Update a seller with non-unique clerk, expecting revert
          await expect(accountHandler.connect(other1).updateSeller(seller, emptyAuthToken)).to.revertedWith(
            RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE
          );
        });

        it("addresses are not unique to this seller Id when address used for different role", async function () {
          seller.id = accountId.next().value;
          seller.operator = other1.address;
          seller.admin = other1.address;
          seller.clerk = other1.address;
          seller.treasury = other1.address;
          seller.active = true;
          sellerStruct = seller.toStruct();
          expectedCloneAddress = calculateContractAddress(accountHandler.address, "2");

          //Create second seller
          await expect(accountHandler.connect(other1).createSeller(seller, emptyAuthToken, voucherInitValues))
            .to.emit(accountHandler, "SellerCreated")
            .withArgs(seller.id, sellerStruct, expectedCloneAddress, emptyAuthTokenStruct, other1.address);

          //Set seller 2's admin address to seller 1's operator address
          seller.admin = operator.address;

          // Attempt to update seller 2 with non-unique operator, expecting revert
          await expect(accountHandler.connect(other1).updateSeller(seller, emptyAuthToken)).to.revertedWith(
            RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE
          );

          //Set seller 2's operator address to seller 1's clerk address
          seller.admin = other1.address;
          seller.operator = clerk.address;

          // Attempt to update a seller with non-unique admin, expecting revert
          await expect(accountHandler.connect(other1).updateSeller(seller, emptyAuthToken)).to.revertedWith(
            RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE
          );

          //Set seller 2's clerk address to seller 1's admin address
          seller.operator = other1.address;
          seller.clerk = admin.address;

          // Attempt to Update a seller with non-unique clerk, expecting revert
          await expect(accountHandler.connect(other1).updateSeller(seller, emptyAuthToken)).to.revertedWith(
            RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE
          );
        });

        it("admin address is NOT zero address and AuthTokenType is NOT None", async function () {
          // Attempt to update a seller, expecting revert
          await expect(accountHandler.connect(admin).updateSeller(seller, authToken)).to.revertedWith(
            RevertReasons.ADMIN_OR_AUTH_TOKEN
          );
        });

        it("admin address is zero address and AuthTokenType is None", async function () {
          seller.admin = ethers.constants.AddressZero;

          // Attempt to Create a seller, expecting revert
          await expect(accountHandler.connect(admin).updateSeller(seller, emptyAuthToken)).to.revertedWith(
            RevertReasons.ADMIN_OR_AUTH_TOKEN
          );
        });

        it("authToken is not unique to this seller", async function () {
          // Set admin == zero address because seller will be updated with auth token
          seller.admin = ethers.constants.AddressZero;

          // Update seller 1 to have auth token
          await accountHandler.connect(admin).updateSeller(seller, authToken);

          await accountHandler.connect(authTokenOwner).optInToSellerUpdate(seller.id, [SellerUpdateFields.AuthToken]);

          //Set seller 2's auth token to empty
          seller2 = mockSeller(other1.address, other1.address, other1.address, other1.address);
          expect(seller2.isValid()).is.true;

          // Create a seller with auth token
          await accountHandler.connect(other1).createSeller(seller2, emptyAuthToken, voucherInitValues);

          seller2.admin = ethers.constants.AddressZero;

          // Attempt to update seller2 with non-unique authToken used by seller 1
          await expect(accountHandler.connect(other1).updateSeller(seller2, authToken)).to.revertedWith(
            RevertReasons.AUTH_TOKEN_MUST_BE_UNIQUE
          );
        });

        it("authTokenType is Custom", async function () {
          // Set admin == zero address because seller will be created with auth token
          seller.admin = ethers.constants.AddressZero;

          authToken.tokenType = AuthTokenType.Custom;

          // Attempt to Update a seller with AuthTokenType == Custom, expecting revert
          await expect(accountHandler.connect(authTokenOwner).updateSeller(seller, authToken)).to.revertedWith(
            RevertReasons.INVALID_AUTH_TOKEN_TYPE
          );
        });

        it("seller is not owner of auth token currently stored for seller", async function () {
          authTokenOwner = other1;
          //Create seller 2 with auth token
          seller2 = mockSeller(other1.address, ethers.constants.AddressZero, other1.address, other1.address);
          expect(seller2.isValid()).is.true;

          //Create auth token for token Id that seller does not own
          authToken2 = new AuthToken("0", AuthTokenType.ENS);
          expect(authToken2.isValid()).is.true;

          // Create a seller with auth token
          await mockAuthERC721Contract2.connect(authTokenOwner).mint(0, 2);

          await accountHandler.connect(authTokenOwner).createSeller(seller2, authToken2, voucherInitValues);

          //Transfer the token to a different address
          await mockAuthERC721Contract2.connect(authTokenOwner).transferFrom(authTokenOwner.address, other8.address, 0);

          // Attempt to update seller2 for token that seller doesn't own
          await expect(accountHandler.connect(authTokenOwner).updateSeller(seller2, authToken2)).to.revertedWith(
            RevertReasons.NOT_ADMIN
          );
        });

        it("auth token id does not exist", async function () {
          authTokenOwner = other1;

          //Create seller 2 with auth token
          seller2 = mockSeller(other1.address, ethers.constants.AddressZero, other1.address, other1.address);
          expect(seller2.isValid()).is.true;

          //Create auth token for token Id that seller does not own
          authToken2 = new AuthToken("0", AuthTokenType.ENS);
          expect(authToken2.isValid()).is.true;

          // Attempt to update seller2 for token Id that doesn't exist
          await expect(
            accountHandler.connect(authTokenOwner).createSeller(seller2, authToken2, voucherInitValues)
          ).to.revertedWith(RevertReasons.ERC721_NON_EXISTENT);
        });
      });
    });

    context("👉 optInToSellerUpdate()", function () {
      beforeEach(async function () {
        pendingSellerUpdate = seller.clone();
        pendingSellerUpdate.id = "0";
        pendingSellerUpdate.treasury = ethers.constants.AddressZero;
        pendingSellerUpdate.clerk = ethers.constants.AddressZero;
        pendingSellerUpdate.admin = ethers.constants.AddressZero;
        pendingSellerUpdate.operator = ethers.constants.AddressZero;
        pendingSellerUpdate.active = false;
        pendingSellerUpdateStruct = pendingSellerUpdate.toStruct();

        await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);
      });

      it("New operator should opt-in to update seller", async function () {
        seller.operator = other1.address;
        sellerStruct = seller.toStruct();

        await accountHandler.connect(admin).updateSeller(seller, emptyAuthToken);

        await expect(accountHandler.connect(other1).optInToSellerUpdate(seller.id, [SellerUpdateFields.Operator]))
          .to.emit(accountHandler, "SellerUpdateApplied")
          .withArgs(
            seller.id,
            sellerStruct,
            pendingSellerUpdateStruct,
            emptyAuthTokenStruct,
            emptyAuthTokenStruct,
            other1.address
          );
      });

      it("New admin should opt-in to update seller", async function () {
        seller.admin = other1.address;
        sellerStruct = seller.toStruct();

        await accountHandler.connect(admin).updateSeller(seller, emptyAuthToken);

        await expect(accountHandler.connect(other1).optInToSellerUpdate(seller.id, [SellerUpdateFields.Admin]))
          .to.emit(accountHandler, "SellerUpdateApplied")
          .withArgs(
            seller.id,
            sellerStruct,
            pendingSellerUpdateStruct,
            emptyAuthTokenStruct,
            emptyAuthTokenStruct,
            other1.address
          );
      });

      it("New clerk should opt-in to update seller", async function () {
        seller.clerk = other1.address;
        sellerStruct = seller.toStruct();

        await accountHandler.connect(admin).updateSeller(seller, emptyAuthToken);

        await expect(accountHandler.connect(other1).optInToSellerUpdate(seller.id, [SellerUpdateFields.Clerk]))
          .to.emit(accountHandler, "SellerUpdateApplied")
          .withArgs(
            seller.id,
            sellerStruct,
            pendingSellerUpdateStruct,
            emptyAuthTokenStruct,
            emptyAuthTokenStruct,
            other1.address
          );
      });

      it("Should update admin, clerk and operator in a single call ", async function () {
        seller.clerk = other1.address;
        seller.admin = other1.address;
        seller.operator = other1.address;
        sellerStruct = seller.toStruct();

        await accountHandler.connect(admin).updateSeller(seller, emptyAuthToken);

        await expect(
          accountHandler
            .connect(other1)
            .optInToSellerUpdate(seller.id, [
              SellerUpdateFields.Clerk,
              SellerUpdateFields.Admin,
              SellerUpdateFields.Operator,
            ])
        )
          .to.emit(accountHandler, "SellerUpdateApplied")
          .withArgs(
            seller.id,
            sellerStruct,
            pendingSellerUpdateStruct,
            emptyAuthTokenStruct,
            emptyAuthTokenStruct,
            other1.address
          );
      });

      it("Should update operator, clerk and auth token in a single call when addresses are the same ", async function () {
        seller.admin = ethers.constants.AddressZero;
        seller.operator = authTokenOwner.address;
        seller.clerk = authTokenOwner.address;
        sellerStruct = seller.toStruct();

        await accountHandler.connect(admin).updateSeller(seller, authToken);

        await expect(
          accountHandler
            .connect(authTokenOwner)
            .optInToSellerUpdate(seller.id, [
              SellerUpdateFields.Operator,
              SellerUpdateFields.Clerk,
              SellerUpdateFields.AuthToken,
            ])
        )
          .to.emit(accountHandler, "SellerUpdateApplied")
          .withArgs(
            seller.id,
            sellerStruct,
            pendingSellerUpdateStruct,
            authTokenStruct,
            emptyAuthTokenStruct,
            authTokenOwner.address
          );
      });

      it("New auth token owner should opt-in to update seller", async function () {
        seller.admin = ethers.constants.AddressZero;
        sellerStruct = seller.toStruct();

        await accountHandler.connect(admin).updateSeller(seller, authToken);

        await expect(
          accountHandler.connect(authTokenOwner).optInToSellerUpdate(seller.id, [SellerUpdateFields.AuthToken])
        )
          .to.emit(accountHandler, "SellerUpdateApplied")
          .withArgs(
            seller.id,
            sellerStruct,
            pendingSellerUpdateStruct,
            authTokenStruct,
            emptyAuthTokenStruct,
            authTokenOwner.address
          );
      });

      it("If updateSeller is called twice with no optIn in between, pendingSellerUpdate is populated with the data from second call", async function () {
        seller.operator = other1.address;

        pendingSellerUpdate = seller.clone();
        pendingSellerUpdate.id = "0";
        pendingSellerUpdate.treasury = ethers.constants.AddressZero;
        pendingSellerUpdate.clerk = ethers.constants.AddressZero;
        pendingSellerUpdate.admin = ethers.constants.AddressZero;
        pendingSellerUpdate.active = false;
        pendingSellerUpdateStruct = pendingSellerUpdate.toStruct();

        await expect(accountHandler.connect(admin).updateSeller(seller, emptyAuthToken))
          .to.emit(accountHandler, "SellerUpdatePending")
          .withArgs(seller.id, pendingSellerUpdateStruct, emptyAuthTokenStruct, admin.address);

        seller.operator = other2.address;
        sellerStruct = seller.toStruct();

        const pendingSellerUpdate2 = pendingSellerUpdate.clone();
        pendingSellerUpdate2.operator = ethers.constants.AddressZero;
        const pendingSellerUpdate2Struct = pendingSellerUpdate2.toStruct();

        await accountHandler.connect(admin).updateSeller(seller, emptyAuthToken);

        await expect(
          accountHandler.connect(other1).optInToSellerUpdate(seller.id, [SellerUpdateFields.Operator])
        ).to.revertedWith(RevertReasons.UNAUTHORIZED_CALLER_UPDATE);

        await expect(accountHandler.connect(other2).optInToSellerUpdate(seller.id, [SellerUpdateFields.Operator]))
          .to.emit(accountHandler, "SellerUpdateApplied")
          .withArgs(
            seller.id,
            sellerStruct,
            pendingSellerUpdate2Struct,
            emptyAuthTokenStruct,
            emptyAuthTokenStruct,
            other2.address
          );

        // Set admin == zero address because seller will be created with auth token
        seller.admin = ethers.constants.AddressZero;
        sellerStruct = seller.toStruct();

        await expect(accountHandler.connect(admin).updateSeller(seller, authToken))
          .to.emit(accountHandler, "SellerUpdatePending")
          .withArgs(seller.id, pendingSellerUpdate2Struct, authTokenStruct, admin.address);

        // Set different token Id, keeping auth token type the same
        const authToken2 = authToken.clone();
        authToken2.tokenId = 8500;
        const authToken2Struct = authToken2.toStruct();

        // mint the token
        await mockAuthERC721Contract.connect(rando).mint(authToken2.tokenId, 1);

        await expect(accountHandler.connect(admin).updateSeller(seller, authToken2))
          .to.emit(accountHandler, "SellerUpdatePending")
          .withArgs(seller.id, pendingSellerUpdate2Struct, authToken2Struct, admin.address);

        await expect(
          accountHandler.connect(authTokenOwner).optInToSellerUpdate(seller.id, [SellerUpdateFields.AuthToken])
        ).to.revertedWith(RevertReasons.UNAUTHORIZED_CALLER_UPDATE);

        await expect(accountHandler.connect(rando).optInToSellerUpdate(seller.id, [SellerUpdateFields.AuthToken]))
          .to.emit(accountHandler, "SellerUpdateApplied")
          .withArgs(
            seller.id,
            sellerStruct,
            pendingSellerUpdate2Struct,
            authToken2Struct,
            emptyAuthTokenStruct,
            rando.address
          );
      });

      context("💔 Revert Reasons", async function () {
        it("There are no pending updates", async function () {
          seller.clerk = other1.address;
          seller.admin = other1.address;
          seller.operator = other1.address;
          sellerStruct = seller.toStruct();

          // No pending update auth token
          await accountHandler.connect(admin).updateSeller(seller, emptyAuthToken);

          await expect(
            accountHandler
              .connect(other1)
              .optInToSellerUpdate(seller.id, [
                SellerUpdateFields.Clerk,
                SellerUpdateFields.Admin,
                SellerUpdateFields.Operator,
              ])
          )
            .to.emit(accountHandler, "SellerUpdateApplied")
            .withArgs(
              seller.id,
              sellerStruct,
              pendingSellerUpdateStruct,
              emptyAuthTokenStruct,
              emptyAuthTokenStruct,
              other1.address
            );

          await expect(accountHandler.connect(other1).optInToSellerUpdate(seller.id, [])).to.revertedWith(
            RevertReasons.NO_SELLER_PENDING_UPDATE
          );
        });

        it("authToken is not unique to this seller", async function () {
          // Set admin == zero address because seller will be created with auth token
          seller.admin = ethers.constants.AddressZero;

          // Request auth token update for seller 1
          await accountHandler.connect(admin).updateSeller(seller, authToken);

          await mockAuthERC721Contract
            .connect(authTokenOwner)
            .transferFrom(authTokenOwner.address, rando.address, 8400);

          authTokenOwner = rando;
          seller2 = mockSeller(
            authTokenOwner.address,
            ethers.constants.AddressZero,
            authTokenOwner.address,
            authTokenOwner.address
          );
          expect(seller2.isValid()).is.true;

          // Creaet seller 2 with the same auth token
          await accountHandler.connect(authTokenOwner).createSeller(seller2, authToken, voucherInitValues);

          // Attempt to update seller1 with non-unique authToken used by seller 2
          await expect(
            accountHandler.connect(authTokenOwner).optInToSellerUpdate(seller.id, [SellerUpdateFields.AuthToken])
          ).to.revertedWith(RevertReasons.AUTH_TOKEN_MUST_BE_UNIQUE);
        });

        it("Caller is not the new admin", async function () {
          seller.admin = other1.address;
          sellerStruct = seller.toStruct();

          await accountHandler.connect(admin).updateSeller(seller, emptyAuthToken);

          await expect(
            accountHandler.connect(other2).optInToSellerUpdate(seller.id, [SellerUpdateFields.Admin])
          ).to.revertedWith(RevertReasons.UNAUTHORIZED_CALLER_UPDATE);
        });

        it("Caller is not the new clerk", async function () {
          seller.clerk = other1.address;
          sellerStruct = seller.toStruct();

          await accountHandler.connect(admin).updateSeller(seller, emptyAuthToken);

          await expect(
            accountHandler.connect(other2).optInToSellerUpdate(seller.id, [SellerUpdateFields.Clerk])
          ).to.revertedWith(RevertReasons.UNAUTHORIZED_CALLER_UPDATE);
        });

        it("Caller is not the new operator", async function () {
          seller.operator = other1.address;
          sellerStruct = seller.toStruct();

          await accountHandler.connect(admin).updateSeller(seller, emptyAuthToken);

          await expect(
            accountHandler.connect(other2).optInToSellerUpdate(seller.id, [SellerUpdateFields.Operator])
          ).to.revertedWith(RevertReasons.UNAUTHORIZED_CALLER_UPDATE);
        });

        it("Should revert if the caller is not the new auth token owner", async function () {
          seller.admin = ethers.constants.AddressZero;
          sellerStruct = seller.toStruct();

          await accountHandler.connect(admin).updateSeller(seller, authToken);

          await expect(
            accountHandler.connect(other2).optInToSellerUpdate(seller.id, [SellerUpdateFields.AuthToken])
          ).to.revertedWith(RevertReasons.UNAUTHORIZED_CALLER_UPDATE);
        });

        it("The sellers region of protocol is paused", async function () {
          seller.operator = other1.address;

          await accountHandler.connect(admin).updateSeller(seller, emptyAuthToken);

          // Pause the sellers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Sellers]);

          await expect(accountHandler.connect(rando).optInToSellerUpdate(seller.id, [])).to.revertedWith(
            RevertReasons.REGION_PAUSED
          );
        });

        it("Admin is not unique to this seller", async function () {
          // Update seller admin
          seller.admin = other1.address;
          await accountHandler.connect(admin).updateSeller(seller, emptyAuthToken);

          // Create seller with same admin
          seller2 = mockSeller(other1.address, other1.address, other1.address, other1.address);
          expect(seller2.isValid()).is.true;

          await accountHandler.connect(other1).createSeller(seller2, emptyAuthToken, voucherInitValues);

          // Attemp to approve the update with non-unique admin, expecting revert
          await expect(
            accountHandler.connect(other1).optInToSellerUpdate(seller.id, [SellerUpdateFields.Admin])
          ).to.revertedWith(RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE);
        });

        it("Clerk is not unique to this seller", async function () {
          // Update seller clerk
          seller.clerk = other1.address;
          await accountHandler.connect(admin).updateSeller(seller, emptyAuthToken);

          // Create seller with same clerk
          seller2 = mockSeller(other1.address, other1.address, other1.address, other1.address);
          expect(seller2.isValid()).is.true;

          await accountHandler.connect(other1).createSeller(seller2, emptyAuthToken, voucherInitValues);

          // Attemp to approve the update with non-unique clerk, expecting revert
          await expect(
            accountHandler.connect(other1).optInToSellerUpdate(seller.id, [SellerUpdateFields.Clerk])
          ).to.revertedWith(RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE);
        });

        it("Operator is not unique to this seller", async function () {
          // Update seller operator
          seller.operator = other1.address;
          await accountHandler.connect(admin).updateSeller(seller, emptyAuthToken);

          // Create seller with same operator
          seller2 = mockSeller(other1.address, other1.address, other1.address, other1.address);
          expect(seller2.isValid()).is.true;

          await accountHandler.connect(other1).createSeller(seller2, emptyAuthToken, voucherInitValues);

          // Attemp to approve the update with non-unique operator, expecting revert
          await expect(
            accountHandler.connect(other1).optInToSellerUpdate(seller.id, [SellerUpdateFields.Operator])
          ).to.revertedWith(RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE);
        });
      });
    });
  });
});
