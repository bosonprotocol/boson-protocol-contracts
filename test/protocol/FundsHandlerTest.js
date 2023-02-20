const hre = require("hardhat");
const ethers = hre.ethers;
const { expect, assert } = require("chai");
const Role = require("../../scripts/domain/Role");
const { Funds, FundsList } = require("../../scripts/domain/Funds");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const PriceDiscovery = require("../../scripts/domain/PriceDiscovery");
const Direction = require("../../scripts/domain/Direction");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployAndCutFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const {
  setNextBlockTimestamp,
  getEvent,
  eventEmittedWithArgs,
  prepareDataSignatureParameters,
  applyPercentage,
  calculateContractAddress,
  getFacetsWithArgs,
} = require("../util/utils.js");
const { oneWeek, oneMonth, maxPriorityFeePerGas } = require("../util/constants");
const {
  mockOffer,
  mockDisputeResolver,
  mockVoucherInitValues,
  mockSeller,
  mockAuthToken,
  mockAgent,
  mockBuyer,
  accountId,
} = require("../util/mock");

/**
 *  Test the Boson Funds Handler interface
 */
describe("IBosonFundsHandler", function () {
  // Common vars
  let InterfaceIds;
  let deployer,
    pauser,
    rando,
    assistant,
    admin,
    clerk,
    treasury,
    feeCollector,
    assistantDR,
    adminDR,
    clerkDR,
    treasuryDR,
    other,
    protocolTreasury;
  let erc165,
    protocolDiamond,
    accessController,
    accountHandler,
    fundsHandler,
    exchangeHandler,
    offerHandler,
    configHandler,
    disputeHandler,
    pauseHandler;
  let support;
  let seller;
  let buyer, offerToken, offerNative;
  let mockToken, bosonToken;
  let depositAmount;
  let offerTokenProtocolFee, offerNativeProtocolFee, price, sellerDeposit;
  let offerDates, voucherRedeemableFrom;
  let resolutionPeriod, offerDurations;
  let protocolFeePercentage, protocolFeeFlatBoson, buyerEscalationDepositPercentage;
  let block, blockNumber;
  let protocolId, exchangeId, buyerId, randoBuyerId, sellerPayoff, buyerPayoff, protocolPayoff;
  let sellersAvailableFunds,
    buyerAvailableFunds,
    protocolAvailableFunds,
    expectedSellerAvailableFunds,
    expectedBuyerAvailableFunds,
    expectedProtocolAvailableFunds;
  let tokenListSeller, tokenListBuyer, tokenAmountsSeller, tokenAmountsBuyer, tokenList, tokenAmounts;
  let tx, txReceipt, txCost, event;
  let disputeResolverFees, disputeResolver, disputeResolverId;
  let buyerPercentBasisPoints;
  let resolutionType, customSignatureType, message, r, s, v;
  let disputedDate, escalatedDate, timeout;
  let voucherInitValues;
  let emptyAuthToken;
  let agent,
    agentId,
    agentFeePercentage,
    agentFee,
    agentPayoff,
    agentOffer,
    agentOfferProtocolFee,
    expectedAgentAvailableFunds,
    agentAvailableFunds;
  let DRFee, buyerEscalationDeposit;
  let protocolInitializationFacet;
  let buyer1, buyer2, buyer3;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();

    // Deploy the mock token
    [mockToken] = await deployMockTokens(["Foreign20"]);
  });

  beforeEach(async function () {
    // Make accounts available
    [
      deployer,
      pauser,
      admin,
      treasury,
      rando,
      buyer,
      feeCollector,
      adminDR,
      treasuryDR,
      other,
      protocolTreasury,
      buyer1,
      buyer2,
      buyer3,
    ] = await ethers.getSigners();

    // make all account the same
    assistant = clerk = admin;
    assistantDR = clerkDR = adminDR;

    // Deploy the Protocol Diamond
    [protocolDiamond, , , , accessController] = await deployProtocolDiamond(maxPriorityFeePerGas);

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Grant PROTOCOL role to ProtocolDiamond address and renounces admin
    await accessController.grantRole(Role.PROTOCOL, protocolDiamond.address);

    // Temporarily grant PAUSER role to pauser account
    await accessController.grantRole(Role.PAUSER, pauser.address);

    // Deploy the Protocol client implementation/proxy pairs (currently just the Boson Voucher)
    const protocolClientArgs = [protocolDiamond.address];
    const [, beacons, proxies] = await deployProtocolClients(protocolClientArgs, maxPriorityFeePerGas);
    const [beacon] = beacons;
    const [proxy] = proxies;

    // Deploy the boson token
    [bosonToken] = await deployMockTokens(["BosonToken"]);

    // set protocolFees
    protocolFeePercentage = "200"; // 2 %
    protocolFeeFlatBoson = ethers.utils.parseUnits("0.01", "ether").toString();
    buyerEscalationDepositPercentage = "1000"; // 10%

    // Add config Handler, so offer id starts at 1
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
        maxTotalOfferFeePercentage: 10000, //100%
        maxRoyaltyPecentage: 1000, //10%
        maxResolutionPeriod: oneMonth,
        minDisputePeriod: oneWeek,
        maxPremintedVouchers: 1000,
      },
      // Protocol fees
      {
        percentage: protocolFeePercentage,
        flatBoson: protocolFeeFlatBoson,
        buyerEscalationDepositPercentage,
      },
    ];

    const facetNames = [
      "SellerHandlerFacet",
      "BuyerHandlerFacet",
      "AgentHandlerFacet",
      "DisputeResolverHandlerFacet",
      "FundsHandlerFacet",
      "ExchangeHandlerFacet",
      "OfferHandlerFacet",
      "PauseHandlerFacet",
      "AccountHandlerFacet",
      "ProtocolInitializationHandlerFacet",
      "ConfigHandlerFacet",
    ];

    const facetsToDeploy = await getFacetsWithArgs(facetNames, protocolConfig);

    const wethFactory = await ethers.getContractFactory("WETH9");
    const weth = await wethFactory.deploy();
    await weth.deployed();

    // Add WETH
    facetsToDeploy["ExchangeHandlerFacet"].constructorArgs = [weth.address];

    // Cut the protocol handler facets into the Diamond
    const { deployedFacets } = await deployAndCutFacets(protocolDiamond.address, facetsToDeploy, maxPriorityFeePerGas);
    protocolInitializationFacet = deployedFacets.find((f) => f.name === "ProtocolInitializationHandlerFacet").contract;

    // Cast Diamond to IERC165
    erc165 = await ethers.getContractAt("ERC165Facet", protocolDiamond.address);

    // Cast Diamond to IBosonAccountHandler. Use this interface to call all individual account handlers
    accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);

    // Cast Diamond to IBosonFundsHandler
    fundsHandler = await ethers.getContractAt("IBosonFundsHandler", protocolDiamond.address);

    // Cast Diamond to IBosonOfferHandler
    offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);

    // Cast Diamond to IBosonExchangeHandler
    exchangeHandler = await ethers.getContractAt("IBosonExchangeHandler", protocolDiamond.address);

    // Cast Diamond to IBosonPauseHandler
    pauseHandler = await ethers.getContractAt("IBosonPauseHandler", protocolDiamond.address);

    // Cast Diamond to IBosonConfigHandler
    configHandler = await ethers.getContractAt("IBosonConfigHandler", protocolDiamond.address);

    // Deploy the mock token
    [mockToken] = await deployMockTokens(["Foreign20"]);
  });

  // Interface support (ERC-156 provided by ProtocolDiamond, others by deployed facets)
  context("📋 Interfaces", async function () {
    context("👉 supportsInterface()", async function () {
      it("should indicate support for IBosonFundsHandler interface", async function () {
        // Current interfaceId for IBosonFundsHandler
        support = await erc165.supportsInterface(InterfaceIds.IBosonFundsHandler);

        // Test
        expect(support, "IBosonFundsHandler interface not supported").is.true;
      });
    });
  });

  // All supported methods - single offer
  context("📋 Funds Handler Methods", async function () {
    beforeEach(async function () {
      // Create a valid seller, then set fields in tests directly
      seller = mockSeller(assistant.address, admin.address, clerk.address, treasury.address);
      expect(seller.isValid()).is.true;

      // VoucherInitValues
      voucherInitValues = mockVoucherInitValues();
      expect(voucherInitValues.isValid()).is.true;

      // AuthToken
      emptyAuthToken = mockAuthToken();
      expect(emptyAuthToken.isValid()).is.true;

      await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

      // top up assistants account
      await mockToken.mint(assistant.address, "1000000");

      // approve protocol to transfer the tokens
      await mockToken.connect(assistant).approve(protocolDiamond.address, "1000000");

      // set the deposit amount
      depositAmount = "100";

      // Set agent id as zero as it is optional for createOffer().
      agentId = "0";
    });

    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    context("👉 depositFunds()", async function () {
      it("should emit a FundsDeposited event", async function () {
        // Deposit funds, testing for the event
        // Deposit token
        await expect(fundsHandler.connect(assistant).depositFunds(seller.id, mockToken.address, depositAmount))
          .to.emit(fundsHandler, "FundsDeposited")
          .withArgs(seller.id, assistant.address, mockToken.address, depositAmount);

        // Deposit native currency
        await expect(
          fundsHandler
            .connect(rando)
            .depositFunds(seller.id, ethers.constants.AddressZero, depositAmount, { value: depositAmount })
        )
          .to.emit(fundsHandler, "FundsDeposited")
          .withArgs(seller.id, rando.address, ethers.constants.AddressZero, depositAmount);
      });

      it("should update state", async function () {
        // Deposit token
        await fundsHandler.connect(assistant).depositFunds(seller.id, mockToken.address, depositAmount);

        // Read on chain state
        let returnedAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));

        // Chain state should match the expected available funds
        let expectedAvailableFunds = new FundsList([new Funds(mockToken.address, "Foreign20", depositAmount)]);
        expect(returnedAvailableFunds).to.eql(expectedAvailableFunds);

        // Deposit native currency to the same seller id
        await fundsHandler
          .connect(rando)
          .depositFunds(seller.id, ethers.constants.AddressZero, depositAmount, { value: depositAmount });

        // Get new on chain state
        returnedAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));

        // Chain state should match the expected available funds
        expectedAvailableFunds.funds.push(new Funds(ethers.constants.AddressZero, "Native currency", depositAmount));
        expect(returnedAvailableFunds).to.eql(expectedAvailableFunds);
      });

      it("should be possible to top up the account", async function () {
        // Deposit token
        await fundsHandler.connect(assistant).depositFunds(seller.id, mockToken.address, depositAmount);

        // Read on chain state
        let returnedAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));

        // Chain state should match the expected available funds
        let expectedAvailableFunds = new FundsList([new Funds(mockToken.address, "Foreign20", depositAmount)]);
        expect(returnedAvailableFunds).to.eql(expectedAvailableFunds);

        // Deposit the same token again
        await fundsHandler.connect(assistant).depositFunds(seller.id, mockToken.address, 2 * depositAmount);

        // Get new on chain state
        returnedAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));

        // Chain state should match the expected available funds
        expectedAvailableFunds = new FundsList([new Funds(mockToken.address, "Foreign20", `${3 * depositAmount}`)]);
        expect(returnedAvailableFunds).to.eql(expectedAvailableFunds);
      });

      context("💔 Revert Reasons", async function () {
        it("The funds region of protocol is paused", async function () {
          // Pause the funds region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Funds]);

          // Attempt to deposit funds, expecting revert
          await expect(
            fundsHandler.connect(assistant).depositFunds(seller.id, mockToken.address, depositAmount)
          ).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("Seller id does not exist", async function () {
          // Attempt to deposit the funds, expecting revert
          seller.id = "555";
          await expect(
            fundsHandler.connect(rando).depositFunds(seller.id, mockToken.address, depositAmount)
          ).to.revertedWith(RevertReasons.NO_SUCH_SELLER);
        });

        it("Native currency deposited, but the token address is not zero", async function () {
          // Attempt to deposit the funds, expecting revert
          await expect(
            fundsHandler
              .connect(rando)
              .depositFunds(seller.id, mockToken.address, depositAmount, { value: depositAmount })
          ).to.revertedWith(RevertReasons.NATIVE_WRONG_ADDRESS);
        });

        it("Native currency deposited, but the amount does not match msg.value", async function () {
          // Attempt to deposit the funds, expecting revert
          await expect(
            fundsHandler
              .connect(rando)
              .depositFunds(seller.id, ethers.constants.AddressZero, depositAmount * 2, { value: depositAmount })
          ).to.revertedWith(RevertReasons.NATIVE_WRONG_AMOUNT);
        });

        it("Token address contract does not support transferFrom", async function () {
          // Deploy a contract without the transferFrom
          [bosonToken] = await deployMockTokens(["BosonToken"]);

          // Attempt to deposit the funds, expecting revert
          await expect(
            fundsHandler.connect(rando).depositFunds(seller.id, bosonToken.address, depositAmount)
          ).to.revertedWith(RevertReasons.SAFE_ERC20_LOW_LEVEL_CALL);
        });

        it("Token address is not a contract", async function () {
          // Attempt to deposit the funds, expecting revert
          await expect(
            fundsHandler.connect(rando).depositFunds(seller.id, admin.address, depositAmount)
          ).to.revertedWith("");
        });

        it("Token contract revert for another reason", async function () {
          // insufficient funds
          // approve more than account actually have
          await mockToken.connect(rando).approve(protocolDiamond.address, depositAmount);
          // Attempt to deposit the funds, expecting revert
          await expect(
            fundsHandler.connect(rando).depositFunds(seller.id, mockToken.address, depositAmount)
          ).to.revertedWith(RevertReasons.ERC20_EXCEEDS_BALANCE);

          // not approved
          depositAmount = "10000000";
          await expect(
            fundsHandler.connect(assistant).depositFunds(seller.id, mockToken.address, depositAmount)
          ).to.revertedWith(RevertReasons.ERC20_INSUFFICIENT_ALLOWANCE);
        });

        it("Received ERC20 token amount differs from the expected value", async function () {
          // Deploy ERC20 with fees
          const [Foreign20WithFee] = await deployMockTokens(["Foreign20WithFee"]);

          // mint tokens and approve
          await Foreign20WithFee.mint(assistant.address, depositAmount);
          await Foreign20WithFee.connect(assistant).approve(protocolDiamond.address, depositAmount);

          // Attempt to deposit funds, expecting revert
          await expect(
            fundsHandler.connect(assistant).depositFunds(seller.id, Foreign20WithFee.address, depositAmount)
          ).to.revertedWith(RevertReasons.INSUFFICIENT_VALUE_RECEIVED);
        });

        it("ERC20 transferFrom returns false", async function () {
          const [foreign20ReturnFalse] = await deployMockTokens(["Foreign20TransferFromReturnFalse"]);

          await foreign20ReturnFalse.connect(assistant).mint(assistant.address, depositAmount);
          await foreign20ReturnFalse.connect(assistant).approve(protocolDiamond.address, depositAmount);

          await expect(
            fundsHandler.connect(assistant).depositFunds(seller.id, foreign20ReturnFalse.address, depositAmount)
          ).to.revertedWith(RevertReasons.SAFE_ERC20_NOT_SUCCEEDED);
        });
      });
    });

    context("💸 withdraw", async function () {
      beforeEach(async function () {
        // Initial ids for all the things
        exchangeId = "1";

        // Create a valid dispute resolver
        disputeResolver = mockDisputeResolver(
          assistantDR.address,
          adminDR.address,
          clerkDR.address,
          treasuryDR.address,
          true
        );
        expect(disputeResolver.isValid()).is.true;

        //Create DisputeResolverFee array so offer creation will succeed
        disputeResolverFees = [
          new DisputeResolverFee(ethers.constants.AddressZero, "Native", "0"),
          new DisputeResolverFee(mockToken.address, "mockToken", "0"),
        ];

        // Make empty seller list, so every seller is allowed
        const sellerAllowList = [];

        // Register the dispute resolver
        await accountHandler
          .connect(adminDR)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

        // Mock offer
        const { offer, offerDates, offerDurations, disputeResolverId, offerFees } = await mockOffer();
        offer.quantityAvailable = "2";

        offerNative = offer;

        offerToken = offer.clone();
        offerToken.id = "2";
        offerToken.exchangeToken = mockToken.address;

        // Check if domais are valid
        expect(offerNative.isValid()).is.true;
        expect(offerToken.isValid()).is.true;
        expect(offerDates.isValid()).is.true;
        expect(offerDurations.isValid()).is.true;

        // Set used variables
        voucherRedeemableFrom = offerDates.voucherRedeemableFrom;

        // Create both offers
        await Promise.all([
          offerHandler
            .connect(assistant)
            .createOffer(offerNative, offerDates, offerDurations, disputeResolverId, agentId),
          offerHandler
            .connect(assistant)
            .createOffer(offerToken, offerDates, offerDurations, disputeResolverId, agentId),
        ]);

        // Set used variables
        price = offerToken.price;
        sellerDeposit = offerToken.sellerDeposit;
        offerTokenProtocolFee = offerNativeProtocolFee = offerFees.protocolFee;

        // top up seller's and buyer's account
        await Promise.all([mockToken.mint(assistant.address, sellerDeposit), mockToken.mint(buyer.address, price)]);

        // approve protocol to transfer the tokens
        await Promise.all([
          mockToken.connect(assistant).approve(protocolDiamond.address, sellerDeposit),
          mockToken.connect(buyer).approve(protocolDiamond.address, price),
        ]);

        // deposit to seller's pool
        await Promise.all([
          fundsHandler.connect(assistant).depositFunds(seller.id, mockToken.address, sellerDeposit),
          fundsHandler
            .connect(assistant)
            .depositFunds(seller.id, ethers.constants.AddressZero, sellerDeposit, { value: sellerDeposit }),
        ]);

        // commit to both offers
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id);
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerNative.id, { value: offerNative.price });

        buyerId = accountId.next().value;
      });

      afterEach(async function () {
        // Reset the accountId iterator
        accountId.next(true);
      });

      context("👉 withdrawFunds()", async function () {
        beforeEach(async function () {
          // cancel the voucher, so both seller and buyer have something to withdraw
          await exchangeHandler.connect(buyer).cancelVoucher(exchangeId); // canceling the voucher in tokens
          await exchangeHandler.connect(buyer).cancelVoucher(++exchangeId); // canceling the voucher in the native currency

          // expected payoffs - they are the same for token and native currency
          // buyer: price - buyerCancelPenalty
          buyerPayoff = ethers.BigNumber.from(offerToken.price).sub(offerToken.buyerCancelPenalty).toString();

          // seller: sellerDeposit + buyerCancelPenalty
          sellerPayoff = ethers.BigNumber.from(offerToken.sellerDeposit).add(offerToken.buyerCancelPenalty).toString();
        });

        it("should emit a FundsWithdrawn event", async function () {
          // Withdraw funds, testing for the event
          // Withdraw tokens
          tokenListSeller = [mockToken.address, ethers.constants.AddressZero];
          tokenListBuyer = [ethers.constants.AddressZero, mockToken.address];

          // Withdraw amounts
          tokenAmountsSeller = [sellerPayoff, ethers.BigNumber.from(sellerPayoff).div("2").toString()];
          tokenAmountsBuyer = [buyerPayoff, ethers.BigNumber.from(buyerPayoff).div("5").toString()];

          // seller withdrawal
          const tx = await fundsHandler.connect(clerk).withdrawFunds(seller.id, tokenListSeller, tokenAmountsSeller);
          await expect(tx)
            .to.emit(fundsHandler, "FundsWithdrawn")
            .withArgs(seller.id, treasury.address, mockToken.address, sellerPayoff, clerk.address);

          await expect(tx)
            .to.emit(fundsHandler, "FundsWithdrawn")
            .withArgs(
              seller.id,
              treasury.address,
              ethers.constants.Zero,
              ethers.BigNumber.from(sellerPayoff).div("2"),
              clerk.address
            );

          // buyer withdrawal
          const tx2 = await fundsHandler.connect(buyer).withdrawFunds(buyerId, tokenListBuyer, tokenAmountsBuyer);
          await expect(tx2)
            .to.emit(fundsHandler, "FundsWithdrawn", buyer.address)
            .withArgs(
              buyerId,
              buyer.address,
              mockToken.address,
              ethers.BigNumber.from(buyerPayoff).div("5"),
              buyer.address
            );

          await expect(tx2)
            .to.emit(fundsHandler, "FundsWithdrawn")
            .withArgs(buyerId, buyer.address, ethers.constants.Zero, buyerPayoff, buyer.address);
        });

        it("should update state", async function () {
          // WITHDRAW ONE TOKEN PARTIALLY

          // Read on chain state
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
          const treasuryBalanceBefore = await ethers.provider.getBalance(treasury.address);

          // Chain state should match the expected available funds before the withdrawal
          expectedSellerAvailableFunds = new FundsList([
            new Funds(mockToken.address, "Foreign20", sellerPayoff),
            new Funds(ethers.constants.AddressZero, "Native currency", sellerPayoff),
          ]);
          expect(sellersAvailableFunds).to.eql(
            expectedSellerAvailableFunds,
            "Seller available funds mismatch before withdrawal"
          );

          // withdraw funds
          const withdrawAmount = ethers.BigNumber.from(sellerPayoff)
            .sub(ethers.utils.parseUnits("0.1", "ether"))
            .toString();
          await fundsHandler.connect(clerk).withdrawFunds(seller.id, [ethers.constants.AddressZero], [withdrawAmount]);

          // Read on chain state
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
          const treasuryBalanceAfter = await ethers.provider.getBalance(treasury.address);

          // Chain state should match the expected available funds after the withdrawal
          // Native currency available funds are reduced for the withdrawal amount
          expectedSellerAvailableFunds.funds[1] = new Funds(
            ethers.constants.AddressZero,
            "Native currency",
            ethers.BigNumber.from(sellerPayoff).sub(withdrawAmount).toString()
          );
          expect(sellersAvailableFunds).to.eql(
            expectedSellerAvailableFunds,
            "Seller available funds mismatch after withdrawal"
          );
          // Native currency balance is increased for the withdrawAmount
          expect(treasuryBalanceAfter).to.eql(
            treasuryBalanceBefore.add(withdrawAmount),
            "Treasury token balance mismatch"
          );

          // WITHDRAW ONE TOKEN FULLY

          // Read on chain state
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
          const buyerBalanceBefore = await mockToken.balanceOf(buyer.address);

          // Chain state should match the expected available funds before the withdrawal
          expectedBuyerAvailableFunds = new FundsList([
            new Funds(mockToken.address, "Foreign20", buyerPayoff),
            new Funds(ethers.constants.AddressZero, "Native currency", buyerPayoff),
          ]);
          expect(buyerAvailableFunds).to.eql(
            expectedBuyerAvailableFunds,
            "Buyer available funds mismatch before withdrawal"
          );

          // withdraw funds
          await fundsHandler.connect(buyer).withdrawFunds(buyerId, [mockToken.address], [buyerPayoff]);

          // Read on chain state
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
          const buyerBalanceAfter = await mockToken.balanceOf(buyer.address);

          // Chain state should match the expected available funds after the withdrawal
          // Since all tokens are withdrawn, token should be removed from the list
          expectedBuyerAvailableFunds = new FundsList([
            new Funds(ethers.constants.AddressZero, "Native currency", buyerPayoff),
          ]);
          expect(buyerAvailableFunds).to.eql(
            expectedBuyerAvailableFunds,
            "Buyer available funds mismatch after withdrawal"
          );
          // Token balance is increased for the buyer payoff
          expect(buyerBalanceAfter).to.eql(buyerBalanceBefore.add(buyerPayoff), "Buyer token balance mismatch");
        });

        it("should allow to withdraw all funds at once", async function () {
          // Read on chain state
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
          const treasuryNativeBalanceBefore = await ethers.provider.getBalance(treasury.address);
          const treasuryTokenBalanceBefore = await mockToken.balanceOf(treasury.address);

          // Chain state should match the expected available funds before the withdrawal
          expectedSellerAvailableFunds = new FundsList([
            new Funds(mockToken.address, "Foreign20", sellerPayoff),
            new Funds(ethers.constants.AddressZero, "Native currency", sellerPayoff),
          ]);
          expect(sellersAvailableFunds).to.eql(
            expectedSellerAvailableFunds,
            "Seller available funds mismatch before withdrawal"
          );

          // withdraw all funds
          await fundsHandler.connect(clerk).withdrawFunds(seller.id, [], []);

          // Read on chain state
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
          const treasuryNativeBalanceAfter = await ethers.provider.getBalance(treasury.address);
          const treasuryTokenBalanceAfter = await mockToken.balanceOf(treasury.address);

          // Chain state should match the expected available funds after the withdrawal
          // Funds available should be an empty list
          expectedSellerAvailableFunds = new FundsList([]);
          expect(sellersAvailableFunds).to.eql(
            expectedSellerAvailableFunds,
            "Seller available funds mismatch after withdrawal"
          );
          // Native currency balance is increased for the withdrawAmount
          expect(treasuryNativeBalanceAfter).to.eql(
            treasuryNativeBalanceBefore.add(sellerPayoff),
            "Treasury native currency balance mismatch"
          );
          expect(treasuryTokenBalanceAfter).to.eql(
            treasuryTokenBalanceBefore.add(sellerPayoff),
            "Treasury token balance mismatch"
          );
        });

        it("if user has more different tokens than maximum number allowed to withdraw, only part of it is withdrawn", async function () {
          // set maximum tokens per withdraw to 1
          await configHandler.connect(deployer).setMaxTokensPerWithdrawal("1");

          // Read on chain state
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
          const treasuryNativeBalanceBefore = await ethers.provider.getBalance(treasury.address);
          const treasuryTokenBalanceBefore = await mockToken.balanceOf(treasury.address);

          // Chain state should match the expected available funds before the withdrawal
          expectedSellerAvailableFunds = new FundsList([
            new Funds(mockToken.address, "Foreign20", sellerPayoff),
            new Funds(ethers.constants.AddressZero, "Native currency", sellerPayoff),
          ]);
          expect(sellersAvailableFunds).to.eql(
            expectedSellerAvailableFunds,
            "Seller available funds mismatch before withdrawal"
          );

          // withdraw all funds
          await fundsHandler.connect(clerk).withdrawFunds(seller.id, [], []);

          // Read on chain state
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
          let treasuryNativeBalanceAfter = await ethers.provider.getBalance(treasury.address);
          const treasuryTokenBalanceAfter = await mockToken.balanceOf(treasury.address);

          // Chain state should match the expected available funds after the withdrawal
          // Funds available should still have the entries from above the threshold
          expectedSellerAvailableFunds = new FundsList([
            new Funds(ethers.constants.AddressZero, "Native currency", sellerPayoff),
          ]);
          expect(sellersAvailableFunds).to.eql(
            expectedSellerAvailableFunds,
            "Seller available funds mismatch after first withdrawal"
          );
          // Token balance is increased for sellerPayoff, while native currency balance remains the same
          expect(treasuryNativeBalanceAfter).to.eql(
            treasuryNativeBalanceBefore,
            "Treasury native currency balance mismatch after first withdrawal"
          );
          expect(treasuryTokenBalanceAfter).to.eql(
            treasuryTokenBalanceBefore.add(sellerPayoff),
            "Treasury token balance mismatch after first withdrawal"
          );

          // withdraw all funds again
          await fundsHandler.connect(clerk).withdrawFunds(seller.id, [], []);

          // Read on chain state
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
          treasuryNativeBalanceAfter = await ethers.provider.getBalance(treasury.address);

          // Chain state should match the expected available funds after the withdrawal
          // Funds available should now be an empty list
          expectedSellerAvailableFunds = new FundsList([]);
          expect(sellersAvailableFunds).to.eql(
            expectedSellerAvailableFunds,
            "Seller available funds mismatch after second withdrawal"
          );
          // Native currency balance is increased for the withdrawAmount
          expect(treasuryNativeBalanceAfter).to.eql(
            treasuryNativeBalanceBefore.add(sellerPayoff),
            "Treasury native currency balance mismatch after second withdrawal"
          );
        });

        it("It's possible to withdraw same toke twice if in total enough available funds", async function () {
          let reduction = ethers.utils.parseUnits("0.1", "ether").toString();
          // Withdraw token
          tokenListSeller = [mockToken.address, mockToken.address];
          tokenAmountsSeller = [ethers.BigNumber.from(sellerPayoff).sub(reduction).toString(), reduction];

          // seller withdrawal
          const tx = await fundsHandler.connect(clerk).withdrawFunds(seller.id, tokenListSeller, tokenAmountsSeller);
          await expect(tx)
            .to.emit(fundsHandler, "FundsWithdrawn")
            .withArgs(
              seller.id,
              treasury.address,
              mockToken.address,
              ethers.BigNumber.from(sellerPayoff).sub(reduction).toString(),
              clerk.address
            );

          await expect(tx)
            .to.emit(fundsHandler, "FundsWithdrawn")
            .withArgs(seller.id, treasury.address, mockToken.address, reduction, clerk.address);
        });

        context("Agent Withdraws funds", async function () {
          beforeEach(async function () {
            // Create a valid agent,
            agentId = "4";
            agent = mockAgent(other.address);
            agent.id = agentId;
            expect(agent.isValid()).is.true;

            // Create an agent
            await accountHandler.connect(rando).createAgent(agent);

            // Mock offer
            const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
            agentOffer = offer.clone();
            agentOffer.id = "3";
            exchangeId = "3";
            agentOffer.exchangeToken = mockToken.address;

            // Create offer with agent
            await offerHandler
              .connect(assistant)
              .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id);

            // Set used variables
            price = agentOffer.price;
            sellerDeposit = agentOffer.sellerDeposit;
            voucherRedeemableFrom = offerDates.voucherRedeemableFrom;

            // top up seller's and buyer's account
            await mockToken.mint(assistant.address, sellerDeposit);
            await mockToken.mint(buyer.address, price);

            // approve protocol to transfer the tokens
            await mockToken.connect(assistant).approve(protocolDiamond.address, sellerDeposit);
            await mockToken.connect(buyer).approve(protocolDiamond.address, price);

            // deposit to seller's pool
            await fundsHandler.connect(assistant).depositFunds(seller.id, mockToken.address, sellerDeposit);

            // commit to agent offer
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, agentOffer.id);

            // Set time forward to the offer's voucherRedeemableFrom
            await setNextBlockTimestamp(Number(voucherRedeemableFrom));

            // succesfully redeem exchange
            await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);
          });

          it("Withdraw when exchange is completed, it emits a FundsWithdrawn event", async function () {
            // Complete the exchange
            await exchangeHandler.connect(buyer).completeExchange(exchangeId);

            agentPayoff = applyPercentage(agentOffer.price, agent.feePercentage);

            // Check the balance BEFORE withdrawFunds()
            const feeCollectorNativeBalanceBefore = await mockToken.balanceOf(agent.wallet);

            await expect(fundsHandler.connect(other).withdrawFunds(agentId, [mockToken.address], [agentPayoff]))
              .to.emit(fundsHandler, "FundsWithdrawn")
              .withArgs(agentId, agent.wallet, mockToken.address, agentPayoff, agent.wallet);

            // Check the balance AFTER withdrawFunds()
            const feeCollectorNativeBalanceAfter = await mockToken.balanceOf(agent.wallet);

            // Expected balance
            const expectedFeeCollectorNativeBalanceAfter = ethers.BigNumber.from(feeCollectorNativeBalanceBefore).add(
              agentPayoff
            );

            // Check agent wallet balance and verify the transfer really happened.
            expect(feeCollectorNativeBalanceAfter).to.eql(
              expectedFeeCollectorNativeBalanceAfter,
              "Agent did not receive their fee"
            );
          });

          it("Withdraw when dispute is retracted, it emits a FundsWithdrawn event", async function () {
            // ProtocolInitializationHandlerFacet has to be passed to deploy function works
            const facetsToDeploy = await getFacetsWithArgs(["DisputeHandlerFacet"]);

            await deployAndCutFacets(
              protocolDiamond.address,
              facetsToDeploy,
              maxPriorityFeePerGas,
              "2.1.0",
              protocolInitializationFacet
            );

            // Cast Diamond to IBosonDisputeHandler
            disputeHandler = await ethers.getContractAt("IBosonDisputeHandler", protocolDiamond.address);

            // raise the dispute
            await disputeHandler.connect(buyer).raiseDispute(exchangeId);

            // retract from the dispute
            await disputeHandler.connect(buyer).retractDispute(exchangeId);

            agentPayoff = ethers.BigNumber.from(agentOffer.price).mul(agent.feePercentage).div("10000").toString();

            // Check the balance BEFORE withdrawFunds()
            const feeCollectorNativeBalanceBefore = await mockToken.balanceOf(agent.wallet);

            await expect(fundsHandler.connect(other).withdrawFunds(agentId, [mockToken.address], [agentPayoff]))
              .to.emit(fundsHandler, "FundsWithdrawn")
              .withArgs(agentId, agent.wallet, mockToken.address, agentPayoff, agent.wallet);

            // Check the balance AFTER withdrawFunds()
            const feeCollectorNativeBalanceAfter = await mockToken.balanceOf(agent.wallet);

            // Expected balance
            const expectedFeeCollectorNativeBalanceAfter = ethers.BigNumber.from(feeCollectorNativeBalanceBefore).add(
              agentPayoff
            );

            // Check agent wallet balance and verify the transfer really happened.
            expect(feeCollectorNativeBalanceAfter).to.eql(
              expectedFeeCollectorNativeBalanceAfter,
              "Agent did not receive their fee"
            );
          });
        });

        context("💔 Revert Reasons", async function () {
          it("The funds region of protocol is paused", async function () {
            // Withdraw tokens
            tokenListBuyer = [ethers.constants.AddressZero, mockToken.address];

            // Withdraw amounts
            tokenAmountsBuyer = [buyerPayoff, ethers.BigNumber.from(buyerPayoff).div("5").toString()];

            // Pause the funds region of the protocol
            await pauseHandler.connect(pauser).pause([PausableRegion.Funds]);

            // Attempt to withdraw funds, expecting revert
            await expect(
              fundsHandler.connect(buyer).withdrawFunds(buyerId, tokenListBuyer, tokenAmountsBuyer)
            ).to.revertedWith(RevertReasons.REGION_PAUSED);
          });

          it("Caller is not authorized to withdraw", async function () {
            // Attempt to withdraw the buyer funds, expecting revert
            await expect(fundsHandler.connect(rando).withdrawFunds(buyerId, [], [])).to.revertedWith(
              RevertReasons.NOT_AUTHORIZED
            );

            // Attempt to withdraw the seller funds, expecting revert
            await expect(fundsHandler.connect(rando).withdrawFunds(seller.id, [], [])).to.revertedWith(
              RevertReasons.NOT_AUTHORIZED
            );

            // Attempt to withdraw the seller funds as treasury, expecting revert
            await expect(fundsHandler.connect(treasury).withdrawFunds(seller.id, [], [])).to.revertedWith(
              RevertReasons.NOT_AUTHORIZED
            );
          });

          it("Token list address does not match token amount address", async function () {
            // Withdraw token
            tokenList = [mockToken.address, ethers.constants.AddressZero];
            tokenAmounts = [sellerPayoff];

            // Attempt to withdraw the funds, expecting revert
            await expect(fundsHandler.connect(clerk).withdrawFunds(seller.id, tokenList, tokenAmounts)).to.revertedWith(
              RevertReasons.TOKEN_AMOUNT_MISMATCH
            );
          });

          it("Caller wants to withdraw more different tokens than allowed", async function () {
            tokenList = new Array(101).fill(ethers.constants.AddressZero);
            tokenAmounts = new Array(101).fill("1");

            // Attempt to withdraw the funds, expecting revert
            await expect(fundsHandler.connect(clerk).withdrawFunds(seller.id, tokenList, tokenAmounts)).to.revertedWith(
              RevertReasons.TOO_MANY_TOKENS
            );
          });

          it("Caller tries to withdraw more than they have in the available funds", async function () {
            // Withdraw token
            tokenList = [mockToken.address];
            tokenAmounts = [ethers.BigNumber.from(sellerPayoff).mul("2")];

            // Attempt to withdraw the funds, expecting revert
            await expect(fundsHandler.connect(clerk).withdrawFunds(seller.id, tokenList, tokenAmounts)).to.revertedWith(
              RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS
            );
          });

          it("Caller tries to withdraw the same token twice", async function () {
            // Withdraw token
            tokenList = [mockToken.address, mockToken.address];
            tokenAmounts = [sellerPayoff, sellerPayoff];

            // Attempt to withdraw the funds, expecting revert
            await expect(fundsHandler.connect(clerk).withdrawFunds(seller.id, tokenList, tokenAmounts)).to.revertedWith(
              RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS
            );
          });

          it("Nothing to withdraw", async function () {
            // Withdraw token
            tokenList = [mockToken.address];
            tokenAmounts = ["0"];

            await expect(fundsHandler.connect(clerk).withdrawFunds(seller.id, tokenList, tokenAmounts)).to.revertedWith(
              RevertReasons.NOTHING_TO_WITHDRAW
            );

            // first withdraw everything
            await fundsHandler.connect(clerk).withdrawFunds(seller.id, [], []);

            // Attempt to withdraw the funds, expecting revert
            await expect(fundsHandler.connect(clerk).withdrawFunds(seller.id, [], [])).to.revertedWith(
              RevertReasons.NOTHING_TO_WITHDRAW
            );
          });

          it("Transfer of funds failed - revert in fallback", async function () {
            // deploy a contract that cannot receive funds
            const [fallbackErrorContract] = await deployMockTokens(["FallbackError"]);

            // commit to offer on behalf of some contract
            tx = await exchangeHandler
              .connect(buyer)
              .commitToOffer(fallbackErrorContract.address, offerNative.id, { value: price });
            txReceipt = await tx.wait();
            event = getEvent(txReceipt, exchangeHandler, "BuyerCommitted");
            exchangeId = event.exchangeId;
            const fallbackContractBuyerId = event.buyerId;

            // revoke the voucher so the contract gets credited some funds
            await exchangeHandler.connect(assistant).revokeVoucher(exchangeId);

            // we call a fallbackContract which calls fundsHandler.withdraw, which should revert
            await expect(
              fallbackErrorContract.withdrawFunds(
                fundsHandler.address,
                fallbackContractBuyerId,
                [ethers.constants.AddressZero],
                [offerNative.price]
              )
            ).to.revertedWith(RevertReasons.TOKEN_TRANSFER_FAILED);
          });

          it("Transfer of funds failed - no payable fallback or receive", async function () {
            // deploy a contract that cannot receive funds
            const [fallbackErrorContract] = await deployMockTokens(["WithoutFallbackError"]);

            // commit to offer on behalf of some contract
            tx = await exchangeHandler
              .connect(buyer)
              .commitToOffer(fallbackErrorContract.address, offerNative.id, { value: price });
            txReceipt = await tx.wait();
            event = getEvent(txReceipt, exchangeHandler, "BuyerCommitted");
            exchangeId = event.exchangeId;
            const fallbackContractBuyerId = event.buyerId;

            // revoke the voucher so the contract gets credited some funds
            await exchangeHandler.connect(assistant).revokeVoucher(exchangeId);

            // we call a fallbackContract which calls fundsHandler.withdraw, which should revert
            await expect(
              fallbackErrorContract.withdrawFunds(
                fundsHandler.address,
                fallbackContractBuyerId,
                [ethers.constants.AddressZero],
                [offerNative.price]
              )
            ).to.revertedWith(RevertReasons.TOKEN_TRANSFER_FAILED);
          });

          it("Transfer of funds failed - ERC20 token does not exist anymore", async function () {
            // destruct mockToken
            await mockToken.destruct();

            await expect(fundsHandler.connect(clerk).withdrawFunds(seller.id, [], [])).to.revertedWith(
              RevertReasons.EOA_FUNCTION_CALL_SAFE_ERC20
            );
          });

          it("Transfer of funds failed - revert durin ERC20 transfer", async function () {
            // pause mockToken
            await mockToken.pause();

            await expect(fundsHandler.connect(clerk).withdrawFunds(seller.id, [], [])).to.revertedWith(
              RevertReasons.ERC20_PAUSED
            );
          });

          it("Transfer of funds failed - ERC20 transfer returns false", async function () {
            const [foreign20ReturnFalse] = await deployMockTokens(["Foreign20TransferReturnFalse"]);

            await foreign20ReturnFalse.connect(assistant).mint(assistant.address, sellerDeposit);
            await foreign20ReturnFalse.connect(assistant).approve(protocolDiamond.address, sellerDeposit);

            await fundsHandler.connect(assistant).depositFunds(seller.id, foreign20ReturnFalse.address, sellerDeposit);

            await expect(
              fundsHandler.connect(clerk).withdrawFunds(seller.id, [foreign20ReturnFalse.address], [sellerDeposit])
            ).to.revertedWith(RevertReasons.SAFE_ERC20_NOT_SUCCEEDED);
          });
        });
      });

      context("👉 withdrawProtocolFees()", async function () {
        beforeEach(async function () {
          const tokenExchangeId = exchangeId;
          const nativeExchangeId = ++exchangeId;

          // succesfully finalize the exchange so the protocol gets some fees
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));
          await exchangeHandler.connect(buyer).redeemVoucher(tokenExchangeId);
          await exchangeHandler.connect(buyer).redeemVoucher(nativeExchangeId);
          await exchangeHandler.connect(buyer).completeExchange(tokenExchangeId);
          await exchangeHandler.connect(buyer).completeExchange(nativeExchangeId);

          // expected payoffs - they are the same for token and native currency
          // buyer: 0
          buyerPayoff = 0;

          // seller: sellerDeposit + offerToken.price
          sellerPayoff = ethers.BigNumber.from(offerToken.sellerDeposit).add(offerToken.price).toString();

          // protocol: protocolFee
          protocolPayoff = offerTokenProtocolFee;

          // grant fee collecor role
          await accessController.grantRole(Role.FEE_COLLECTOR, feeCollector.address);

          // set the protocol id
          protocolId = "0";
        });

        it("should emit a FundsWithdrawn event", async function () {
          // Withdraw funds, testing for the event
          tokenList = [mockToken.address, ethers.constants.AddressZero];
          tokenAmounts = [protocolPayoff, protocolPayoff];

          // protocol fee withdrawal
          const tx = await fundsHandler.connect(feeCollector).withdrawProtocolFees(tokenList, tokenAmounts);
          await expect(tx)
            .to.emit(fundsHandler, "FundsWithdrawn")
            .withArgs(protocolId, protocolTreasury.address, mockToken.address, protocolPayoff, feeCollector.address);

          await expect(tx)
            .to.emit(fundsHandler, "FundsWithdrawn")
            .withArgs(
              protocolId,
              protocolTreasury.address,
              ethers.constants.Zero,
              protocolPayoff,
              feeCollector.address
            );
        });

        it("should update state", async function () {
          // Read on chain state
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
          const protocolTreasuryNativeBalanceBefore = await ethers.provider.getBalance(protocolTreasury.address);
          const protocolTreasuryTokenBalanceBefore = await mockToken.balanceOf(protocolTreasury.address);

          // Chain state should match the expected available funds before the withdrawal
          expectedProtocolAvailableFunds = new FundsList([
            new Funds(mockToken.address, "Foreign20", protocolPayoff),
            new Funds(ethers.constants.AddressZero, "Native currency", protocolPayoff),
          ]);
          expect(protocolAvailableFunds).to.eql(
            expectedProtocolAvailableFunds,
            "Protocol available funds mismatch before withdrawal"
          );

          // withdraw funds
          const partialFeeWithdrawAmount = ethers.BigNumber.from(protocolPayoff)
            .sub(ethers.utils.parseUnits("0.01", "ether"))
            .toString();

          tx = await fundsHandler
            .connect(feeCollector)
            .withdrawProtocolFees(
              [mockToken.address, ethers.constants.AddressZero],
              [protocolPayoff, partialFeeWithdrawAmount]
            );

          // calcualte tx costs
          txReceipt = await tx.wait();
          txCost = tx.gasPrice.mul(txReceipt.gasUsed);

          // Read on chain state
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
          const protocolTreasuryNativeBalanceAfter = await ethers.provider.getBalance(protocolTreasury.address);
          const protocolTreasuryTokenBalanceAfter = await mockToken.balanceOf(protocolTreasury.address);

          // Chain state should match the expected available funds after the withdrawal
          // Native currency available funds are reduced for the withdrawal amount
          // Mock token is fully withdrawn
          expectedProtocolAvailableFunds = new FundsList([
            new Funds(
              ethers.constants.AddressZero,
              "Native currency",
              ethers.BigNumber.from(protocolPayoff).sub(partialFeeWithdrawAmount).toString()
            ),
          ]);

          expect(protocolAvailableFunds).to.eql(
            expectedProtocolAvailableFunds,
            "Protocol available funds mismatch after withdrawal"
          );
          // Native currency balance is increased for the partialFeeWithdrawAmount
          expect(protocolTreasuryNativeBalanceAfter).to.eql(
            protocolTreasuryNativeBalanceBefore.add(partialFeeWithdrawAmount),
            "Fee collector token balance mismatch"
          );
          // Token balance is increased for the protocol fee
          expect(protocolTreasuryTokenBalanceAfter).to.eql(
            protocolTreasuryTokenBalanceBefore.add(protocolPayoff),
            "Fee collector token balance mismatch"
          );
        });

        it("should allow to withdraw all funds at once", async function () {
          // Read on chain state
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
          const protocolTreasuryNativeBalanceBefore = await ethers.provider.getBalance(protocolTreasury.address);
          const protocolTreasuryTokenBalanceBefore = await mockToken.balanceOf(protocolTreasury.address);

          // Chain state should match the expected available funds before the withdrawal
          expectedProtocolAvailableFunds = new FundsList([
            new Funds(mockToken.address, "Foreign20", protocolPayoff),
            new Funds(ethers.constants.AddressZero, "Native currency", protocolPayoff),
          ]);
          expect(protocolAvailableFunds).to.eql(
            expectedProtocolAvailableFunds,
            "Protocol available funds mismatch before withdrawal"
          );

          // withdraw all funds
          tx = await fundsHandler.connect(feeCollector).withdrawProtocolFees([], []);

          // calcualte tx costs
          txReceipt = await tx.wait();
          txCost = tx.gasPrice.mul(txReceipt.gasUsed);

          // Read on chain state
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
          const protocolTreasuryNativeBalanceAfter = await ethers.provider.getBalance(protocolTreasury.address);
          const protocolTreasuryTokenBalanceAfter = await mockToken.balanceOf(protocolTreasury.address);

          // Chain state should match the expected available funds after the withdrawal
          // Funds available should be an empty list
          expectedProtocolAvailableFunds = new FundsList([]);
          expect(protocolAvailableFunds).to.eql(
            expectedProtocolAvailableFunds,
            "Protocol available funds mismatch after withdrawal"
          );
          // Native currency balance is increased for the partialFeeWithdrawAmount
          expect(protocolTreasuryNativeBalanceAfter).to.eql(
            protocolTreasuryNativeBalanceBefore.add(protocolPayoff),
            "Fee collector native currency balance mismatch"
          );
          // Token balance is increased for the protocol fee
          expect(protocolTreasuryTokenBalanceAfter).to.eql(
            protocolTreasuryTokenBalanceBefore.add(protocolPayoff),
            "Fee collector token balance mismatch"
          );
        });

        it("if protocol has more different tokens than maximum number allowed to withdraw, only part of it is withdrawn", async function () {
          // set maximum tokens per withdraw to 1
          await configHandler.connect(deployer).setMaxTokensPerWithdrawal("1");

          // Read on chain state
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
          let protocolTreasuryNativeBalanceBefore = await ethers.provider.getBalance(protocolTreasury.address);
          const protocolTreasuryTokenBalanceBefore = await mockToken.balanceOf(protocolTreasury.address);

          // Chain state should match the expected available funds before the withdrawal
          expectedProtocolAvailableFunds = new FundsList([
            new Funds(mockToken.address, "Foreign20", protocolPayoff),
            new Funds(ethers.constants.AddressZero, "Native currency", protocolPayoff),
          ]);
          expect(protocolAvailableFunds).to.eql(
            expectedProtocolAvailableFunds,
            "Protocol available funds mismatch before withdrawal"
          );

          // withdraw all funds
          let tx = await fundsHandler.connect(feeCollector).withdrawProtocolFees([], []);

          // calcualte tx costs
          txReceipt = await tx.wait();
          txCost = tx.gasPrice.mul(txReceipt.gasUsed);

          // Read on chain state
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
          let protocolTreasuryNativeBalanceAfter = await ethers.provider.getBalance(protocolTreasury.address);
          const protocolTreasuryTokenBalanceAfter = await mockToken.balanceOf(protocolTreasury.address);

          // Chain state should match the expected available funds after the withdrawal
          // Funds available should still have the entries from above the threshold
          expectedProtocolAvailableFunds = new FundsList([
            new Funds(ethers.constants.AddressZero, "Native currency", protocolPayoff),
          ]);
          expect(protocolAvailableFunds).to.eql(
            expectedProtocolAvailableFunds,
            "Protocol available funds mismatch after first withdrawal"
          );
          // Token balance is increased for protocolFee, while native currency balance is reduced only for tx costs
          expect(protocolTreasuryNativeBalanceAfter).to.eql(
            protocolTreasuryNativeBalanceBefore,
            "Fee collector native currency balance mismatch after first withdrawal"
          );
          expect(protocolTreasuryTokenBalanceAfter).to.eql(
            protocolTreasuryTokenBalanceBefore.add(protocolPayoff),
            "Fee collector token balance mismatch after first withdrawal"
          );

          // withdraw all funds again
          tx = await fundsHandler.connect(feeCollector).withdrawProtocolFees([], []);

          // calcualte tx costs
          txReceipt = await tx.wait();
          txCost = tx.gasPrice.mul(txReceipt.gasUsed);

          // Read on chain state
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
          protocolTreasuryNativeBalanceAfter = await ethers.provider.getBalance(protocolTreasury.address);

          // Chain state should match the expected available funds after the withdrawal
          // Funds available should now be an empty list
          expectedProtocolAvailableFunds = new FundsList([]);
          expect(protocolAvailableFunds).to.eql(
            expectedProtocolAvailableFunds,
            "Protocol available funds mismatch after second withdrawal"
          );
          // Native currency balance is increased for the protocol fee
          expect(protocolTreasuryNativeBalanceAfter).to.eql(
            protocolTreasuryNativeBalanceBefore.add(offerTokenProtocolFee),
            "Fee collector native currency balance mismatch after second withdrawal"
          );
        });

        it("It's possible to withdraw same token twice if in total enough available funds", async function () {
          let reduction = ethers.utils.parseUnits("0.01", "ether").toString();
          // Withdraw token
          tokenList = [mockToken.address, mockToken.address];
          tokenAmounts = [ethers.BigNumber.from(protocolPayoff).sub(reduction).toString(), reduction];

          // protocol fee withdrawal
          const tx = await fundsHandler.connect(feeCollector).withdrawProtocolFees(tokenList, tokenAmounts);
          await expect(tx)
            .to.emit(fundsHandler, "FundsWithdrawn")
            .withArgs(
              protocolId,
              protocolTreasury.address,
              mockToken.address,
              ethers.BigNumber.from(protocolPayoff).sub(reduction).toString(),
              feeCollector.address
            );

          await expect(tx)
            .to.emit(fundsHandler, "FundsWithdrawn")
            .withArgs(protocolId, protocolTreasury.address, mockToken.address, reduction, feeCollector.address);
        });

        context("💔 Revert Reasons", async function () {
          it("The funds region of protocol is paused", async function () {
            // Withdraw funds, testing for the event
            tokenList = [mockToken.address, ethers.constants.AddressZero];
            tokenAmounts = [protocolPayoff, protocolPayoff];

            // Pause the funds region of the protocol
            await pauseHandler.connect(pauser).pause([PausableRegion.Funds]);

            // Attempt to withdraw funds, expecting revert
            await expect(
              fundsHandler.connect(feeCollector).withdrawProtocolFees(tokenList, tokenAmounts)
            ).to.revertedWith(RevertReasons.REGION_PAUSED);
          });

          it("Caller is not authorized to withdraw", async function () {
            // Attempt to withdraw the protocol fees, expecting revert
            await expect(fundsHandler.connect(rando).withdrawProtocolFees([], [])).to.revertedWith(
              RevertReasons.ACCESS_DENIED
            );
          });

          it("Token list address does not match token amount address", async function () {
            // Withdraw token
            tokenList = [mockToken.address, ethers.constants.AddressZero];
            tokenAmounts = [sellerPayoff];

            // Attempt to withdraw the funds, expecting revert
            await expect(
              fundsHandler.connect(feeCollector).withdrawProtocolFees(tokenList, tokenAmounts)
            ).to.revertedWith(RevertReasons.TOKEN_AMOUNT_MISMATCH);
          });

          it("Caller wants to withdraw more different tokens than allowed", async function () {
            tokenList = new Array(101).fill(ethers.constants.AddressZero);
            tokenAmounts = new Array(101).fill("1");

            // Attempt to withdraw the funds, expecting revert
            await expect(
              fundsHandler.connect(feeCollector).withdrawProtocolFees(tokenList, tokenAmounts)
            ).to.revertedWith(RevertReasons.TOO_MANY_TOKENS);
          });

          it("Caller tries to withdraw more than they have in the available funds", async function () {
            // Withdraw token
            tokenList = [mockToken.address];
            tokenAmounts = [ethers.BigNumber.from(offerTokenProtocolFee).mul("2")];

            // Attempt to withdraw the funds, expecting revert
            await expect(
              fundsHandler.connect(feeCollector).withdrawProtocolFees(tokenList, tokenAmounts)
            ).to.revertedWith(RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS);
          });

          it("Caller tries to withdraw the same token twice", async function () {
            // Withdraw token
            tokenList = [mockToken.address, mockToken.address];
            tokenAmounts = [offerTokenProtocolFee, offerTokenProtocolFee];

            // Attempt to withdraw the funds, expecting revert
            await expect(
              fundsHandler.connect(feeCollector).withdrawProtocolFees(tokenList, tokenAmounts)
            ).to.revertedWith(RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS);
          });

          it("Nothing to withdraw", async function () {
            // Withdraw token
            tokenList = [mockToken.address];
            tokenAmounts = ["0"];

            await expect(
              fundsHandler.connect(feeCollector).withdrawProtocolFees(tokenList, tokenAmounts)
            ).to.revertedWith(RevertReasons.NOTHING_TO_WITHDRAW);

            // first withdraw everything
            await fundsHandler.connect(feeCollector).withdrawProtocolFees([], []);

            // Attempt to withdraw the funds, expecting revert
            await expect(fundsHandler.connect(feeCollector).withdrawProtocolFees([], [])).to.revertedWith(
              RevertReasons.NOTHING_TO_WITHDRAW
            );
          });

          it("Transfer of funds failed - revert in fallback", async function () {
            // deploy a contract that cannot receive funds
            const [fallbackErrorContract] = await deployMockTokens(["FallbackError"]);

            // temporarily grant ADMIN role to deployer account
            await accessController.grantRole(Role.ADMIN, deployer.address);

            // set treasury to this contract
            await configHandler.connect(deployer).setTreasuryAddress(fallbackErrorContract.address);

            // attempt to withdraw the funds, expecting revert
            await expect(
              fundsHandler
                .connect(feeCollector)
                .withdrawProtocolFees([ethers.constants.AddressZero], [offerNativeProtocolFee])
            ).to.revertedWith(RevertReasons.TOKEN_TRANSFER_FAILED);
          });

          it("Transfer of funds failed - no payable fallback or receive", async function () {
            // deploy a contract that cannot receive funds
            const [fallbackErrorContract] = await deployMockTokens(["WithoutFallbackError"]);

            // temporarily grant ADMIN role to deployer account
            await accessController.grantRole(Role.ADMIN, deployer.address);

            // set treasury to this contract
            await configHandler.connect(deployer).setTreasuryAddress(fallbackErrorContract.address);

            // attempt to withdraw the funds, expecting revert
            await expect(
              fundsHandler
                .connect(feeCollector)
                .withdrawProtocolFees([ethers.constants.AddressZero], [offerNativeProtocolFee])
            ).to.revertedWith(RevertReasons.TOKEN_TRANSFER_FAILED);
          });

          it("Transfer of funds failed - ERC20 token does not exist anymore", async function () {
            // destruct mockToken
            await mockToken.destruct();

            await expect(fundsHandler.connect(feeCollector).withdrawProtocolFees([], [])).to.revertedWith(
              RevertReasons.EOA_FUNCTION_CALL_SAFE_ERC20
            );
          });

          it("Transfer of funds failed - revert during ERC20 transfer", async function () {
            // pause mockToken
            await mockToken.pause();

            await expect(fundsHandler.connect(feeCollector).withdrawProtocolFees([], [])).to.revertedWith(
              RevertReasons.ERC20_PAUSED
            );
          });
        });
      });
    });

    context("👉 getAvailableFunds()", async function () {
      it("Returns info also for ERC20 tokens without the name", async function () {
        // Deploy the mock token with no name
        [mockToken] = await deployMockTokens(["Foreign20NoName"]);
        // top up assistants account
        await mockToken.mint(assistant.address, "1000000");
        // approve protocol to transfer the tokens
        await mockToken.connect(assistant).approve(protocolDiamond.address, "1000000");

        // Deposit token
        await fundsHandler.connect(assistant).depositFunds(seller.id, mockToken.address, depositAmount);

        // Read on chain state
        let returnedAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));

        // Chain state should match the expected available funds
        let expectedAvailableFunds = new FundsList([
          new Funds(mockToken.address, "Token name unspecified", depositAmount),
        ]);
        expect(returnedAvailableFunds).to.eql(expectedAvailableFunds);
      });
    });
  });

  // Funds library methods.
  // Cannot be invoked directly, so tests calls the methods that use them
  context("📋 FundsLib  Methods", async function () {
    beforeEach(async function () {
      // Create a valid seller
      seller = mockSeller(assistant.address, admin.address, clerk.address, treasury.address);
      expect(seller.isValid()).is.true;

      // VoucherInitValues
      voucherInitValues = mockVoucherInitValues();
      expect(voucherInitValues.isValid()).is.true;

      // AuthToken
      emptyAuthToken = mockAuthToken();
      expect(emptyAuthToken.isValid()).is.true;

      await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

      // Create a valid dispute resolver
      disputeResolver = mockDisputeResolver(
        assistantDR.address,
        adminDR.address,
        clerkDR.address,
        treasuryDR.address,
        true
      );
      expect(disputeResolver.isValid()).is.true;

      //Create DisputeResolverFee array so offer creation will succeed
      DRFee = ethers.utils.parseUnits("0", "ether").toString();
      disputeResolverFees = [
        new DisputeResolverFee(ethers.constants.AddressZero, "Native", "0"),
        new DisputeResolverFee(mockToken.address, "mockToken", DRFee),
      ];

      // Make empty seller list, so every seller is allowed
      const sellerAllowList = [];
      buyerEscalationDeposit = applyPercentage(DRFee, buyerEscalationDepositPercentage);

      // Register the dispute resolver
      await accountHandler
        .connect(adminDR)
        .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

      const { offer, ...mo } = await mockOffer();
      offer.quantityAvailable = "2";
      offerNative = offer;
      expect(offerNative.isValid()).is.true;

      offerToken = offerNative.clone();
      offerToken.id = "2";
      offerToken.exchangeToken = mockToken.address;

      offerDates = mo.offerDates;
      expect(offerDates.isValid()).is.true;

      offerDurations = mo.offerDurations;
      expect(offerDurations.isValid()).is.true;

      disputeResolverId = mo.disputeResolverId;

      agentId = "0"; // agent id is optional while creating an offer
      // Create both offers
      await Promise.all([
        offerHandler
          .connect(assistant)
          .createOffer(offerNative, offerDates, offerDurations, disputeResolverId, agentId),
        offerHandler.connect(assistant).createOffer(offerToken, offerDates, offerDurations, disputeResolverId, agentId),
      ]);

      // Set used variables
      price = offerToken.price;
      offerTokenProtocolFee = mo.offerFees.protocolFee;
      sellerDeposit = offerToken.sellerDeposit;
      voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
      resolutionPeriod = offerDurations.resolutionPeriod;

      // top up seller's and buyer's account
      await mockToken.mint(assistant.address, `${2 * sellerDeposit}`);
      await mockToken.mint(buyer.address, `${2 * price}`);

      // approve protocol to transfer the tokens
      await mockToken.connect(assistant).approve(protocolDiamond.address, `${2 * sellerDeposit}`);
      await mockToken.connect(buyer).approve(protocolDiamond.address, `${2 * price}`);

      // deposit to seller's pool
      await fundsHandler.connect(assistant).depositFunds(seller.id, mockToken.address, `${2 * sellerDeposit}`);
      await fundsHandler
        .connect(assistant)
        .depositFunds(seller.id, ethers.constants.AddressZero, `${2 * sellerDeposit}`, {
          value: `${2 * sellerDeposit}`,
        });

      // Agents
      // Create a valid agent,
      agentId = "3";
      agentFeePercentage = "500"; //5%
      agent = mockAgent(other.address);

      expect(agent.isValid()).is.true;

      // Create an agent
      await accountHandler.connect(rando).createAgent(agent);

      agentOffer = offerToken.clone();
      agentOffer.id = "3";
      agentOfferProtocolFee = mo.offerFees.protocolFee;

      randoBuyerId = "4"; // 1: seller, 2: disputeResolver, 3: agent, 4: rando
    });

    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    context("👉 encumberFunds()", async function () {
      it("should emit a FundsEncumbered event", async function () {
        let buyerId = "4"; // 1: seller, 2: disputeResolver, 3: agent, 4: buyer

        // Commit to an offer with erc20 token, test for FundsEncumbered event
        const tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id);
        await expect(tx)
          .to.emit(exchangeHandler, "FundsEncumbered")
          .withArgs(buyerId, mockToken.address, price, buyer.address);

        await expect(tx)
          .to.emit(exchangeHandler, "FundsEncumbered")
          .withArgs(seller.id, mockToken.address, sellerDeposit, buyer.address);

        // Commit to an offer with native currency, test for FundsEncumbered event
        const tx2 = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerNative.id, { value: price });
        await expect(tx2)
          .to.emit(exchangeHandler, "FundsEncumbered")
          .withArgs(buyerId, ethers.constants.AddressZero, price, buyer.address);

        await expect(tx2)
          .to.emit(exchangeHandler, "FundsEncumbered")
          .withArgs(seller.id, ethers.constants.AddressZero, sellerDeposit, buyer.address);
      });

      it("should update state", async function () {
        // contract token value
        const contractTokenBalanceBefore = await mockToken.balanceOf(protocolDiamond.address);
        // contract native token balance
        const contractNativeBalanceBefore = await ethers.provider.getBalance(protocolDiamond.address);
        // seller's available funds
        const sellersAvailableFundsBefore = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));

        // Commit to an offer with erc20 token
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id);

        // Check that token balance increased
        const contractTokenBalanceAfter = await mockToken.balanceOf(protocolDiamond.address);
        // contract token balance should increase for the incoming price
        // seller's deposit was already held in the contract's pool before
        expect(contractTokenBalanceAfter.sub(contractTokenBalanceBefore).toString()).to.eql(
          price,
          "Token wrong balance increase"
        );

        // Check that seller's pool balance was reduced
        let sellersAvailableFundsAfter = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
        // token is the first on the list of the available funds and the amount should be decreased for the sellerDeposit
        expect(
          ethers.BigNumber.from(sellersAvailableFundsBefore.funds[0].availableAmount)
            .sub(ethers.BigNumber.from(sellersAvailableFundsAfter.funds[0].availableAmount))
            .toString()
        ).to.eql(sellerDeposit, "Token seller available funds mismatch");

        // Commit to an offer with native currency
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerNative.id, { value: price });

        // check that native currency balance increased
        const contractNativeBalanceAfter = await ethers.provider.getBalance(protocolDiamond.address);
        // contract token balance should increase for the incoming price
        // seller's deposit was already held in the contract's pool before
        expect(contractNativeBalanceAfter.sub(contractNativeBalanceBefore).toString()).to.eql(
          price,
          "Native currency wrong balance increase"
        );

        // Check that seller's pool balance was reduced
        sellersAvailableFundsAfter = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
        // native currency is the second on the list of the available funds and the amount should be decreased for the sellerDeposit
        expect(
          ethers.BigNumber.from(sellersAvailableFundsBefore.funds[1].availableAmount)
            .sub(ethers.BigNumber.from(sellersAvailableFundsAfter.funds[1].availableAmount))
            .toString()
        ).to.eql(sellerDeposit, "Native currency seller available funds mismatch");
      });

      context("seller's available funds drop to 0", async function () {
        it("token should be removed from the tokenList", async function () {
          // seller's available funds
          let sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
          expect(sellersAvailableFunds.funds.length).to.eql(2, "Funds length mismatch");
          expect(sellersAvailableFunds.funds[0].tokenAddress).to.eql(
            mockToken.address,
            "Token contract address mismatch"
          );
          expect(sellersAvailableFunds.funds[1].tokenAddress).to.eql(
            ethers.constants.AddressZero,
            "Native currency address mismatch"
          );

          // Commit to offer with token twice to empty the seller's pool
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id);
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id);

          // Token address should be removed and have only native currency in the list
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
          expect(sellersAvailableFunds.funds.length).to.eql(1, "Funds length mismatch");
          expect(sellersAvailableFunds.funds[0].tokenAddress).to.eql(
            ethers.constants.AddressZero,
            "Native currency address mismatch"
          );

          // Commit to offer with token twice to empty the seller's pool
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerNative.id, { value: price });
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerNative.id, { value: price });

          // Seller available funds must be empty
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
          expect(sellersAvailableFunds.funds.length).to.eql(0, "Funds length mismatch");
        });

        it("token should be removed from the token list even when list length - 1 is different from index", async function () {
          // length - 1 is different from index when index isn't the first or last element in the list
          // Deploy a new mock token
          let TokenContractFactory = await ethers.getContractFactory("Foreign20");
          const otherToken = await TokenContractFactory.deploy();
          await otherToken.deployed();

          // Add otherToken to DR fees
          await accountHandler
            .connect(adminDR)
            .addFeesToDisputeResolver(disputeResolver.id, [
              new DisputeResolverFee(otherToken.address, "Other Token", "0"),
            ]);

          // top up seller's and buyer's account
          await otherToken.mint(assistant.address, sellerDeposit);

          // approve protocol to transfer the tokens
          await otherToken.connect(assistant).approve(protocolDiamond.address, sellerDeposit);

          // deposit to seller's pool
          await fundsHandler.connect(assistant).depositFunds(seller.id, otherToken.address, sellerDeposit);

          // seller's available funds
          let sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
          expect(sellersAvailableFunds.funds.length).to.eql(3, "Funds length mismatch");
          expect(sellersAvailableFunds.funds[0].tokenAddress).to.eql(
            mockToken.address,
            "Token contract address mismatch"
          );
          expect(sellersAvailableFunds.funds[1].tokenAddress).to.eql(
            ethers.constants.AddressZero,
            "Native currency address mismatch"
          );
          expect(sellersAvailableFunds.funds[2].tokenAddress).to.eql(
            otherToken.address,
            "Boson token address mismatch"
          );

          // Commit to offer with token twice to empty the seller's pool
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerNative.id, { value: price });
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerNative.id, { value: price });

          // Native currency address should be removed and have only mock token and other token in the list
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
          expect(sellersAvailableFunds.funds.length).to.eql(2, "Funds length mismatch");
          expect(sellersAvailableFunds.funds[0].tokenAddress).to.eql(
            mockToken.address,
            "Token contract address mismatch"
          );
          expect(sellersAvailableFunds.funds[1].tokenAddress).to.eql(
            otherToken.address,
            "Other token address mismatch"
          );
        });
      });

      it("when someone else deposits on buyer's behalf, callers funds are transferred", async function () {
        // buyer will commit to an offer on rando's behalf
        // get token balance before the commit
        const buyerTokenBalanceBefore = await mockToken.balanceOf(buyer.address);
        const randoTokenBalanceBefore = await mockToken.balanceOf(rando.address);

        // commit to an offer with token on rando's behalf
        await exchangeHandler.connect(buyer).commitToOffer(rando.address, offerToken.id);

        // get token balance after the commit
        const buyerTokenBalanceAfter = await mockToken.balanceOf(buyer.address);
        const randoTokenBalanceAfter = await mockToken.balanceOf(rando.address);

        // buyer's balance should decrease, rando's should remain
        expect(buyerTokenBalanceBefore.sub(buyerTokenBalanceAfter).toString()).to.eql(
          price,
          "Buyer's token balance should decrease for a price"
        );
        expect(randoTokenBalanceAfter.toString()).to.eql(
          randoTokenBalanceBefore.toString(),
          "Rando's token balance should remain the same"
        );
        // make sure that rando is actually the buyer of the exchange
        let exchange;
        [, exchange] = await exchangeHandler.getExchange("1");
        expect(exchange.buyerId.toString()).to.eql(randoBuyerId, "Wrong buyer id");

        // get native currency balance before the commit
        const buyerNativeBalanceBefore = await ethers.provider.getBalance(buyer.address);
        const randoNativeBalanceBefore = await ethers.provider.getBalance(rando.address);

        // commit to an offer with native currency on rando's behalf
        tx = await exchangeHandler.connect(buyer).commitToOffer(rando.address, offerNative.id, { value: price });
        txReceipt = await tx.wait();
        txCost = tx.gasPrice.mul(txReceipt.gasUsed);

        // get token balance after the commit
        const buyerNativeBalanceAfter = await ethers.provider.getBalance(buyer.address);
        const randoNativeBalanceAfter = await ethers.provider.getBalance(rando.address);

        // buyer's balance should decrease, rando's should remain
        expect(buyerNativeBalanceBefore.sub(buyerNativeBalanceAfter).sub(txCost).toString()).to.eql(
          price,
          "Buyer's native balance should decrease for a price"
        );
        expect(randoNativeBalanceAfter.toString()).to.eql(
          randoNativeBalanceBefore.toString(),
          "Rando's native balance should remain the same"
        );
        // make sure that rando is actually the buyer of the exchange
        [, exchange] = await exchangeHandler.getExchange("2");
        expect(exchange.buyerId.toString()).to.eql(randoBuyerId, "Wrong buyer id");

        // make sure that randoBuyerId actually belongs to rando address
        [, buyer] = await accountHandler.getBuyer(randoBuyerId);
        expect(buyer.wallet).to.eql(rando.address, "Wrong buyer address");
      });

      it("if offer is preminted, only sellers funds are encumbered", async function () {
        // deposit to seller's pool to cover for the price
        const buyerId = mockBuyer().id;
        await mockToken.mint(assistant.address, `${2 * price}`);
        await mockToken.connect(assistant).approve(protocolDiamond.address, `${2 * price}`);
        await fundsHandler.connect(assistant).depositFunds(seller.id, mockToken.address, `${2 * price}`);
        await fundsHandler.connect(assistant).depositFunds(seller.id, ethers.constants.AddressZero, `${2 * price}`, {
          value: `${2 * price}`,
        });

        // get token balance before the commit
        const buyerTokenBalanceBefore = await mockToken.balanceOf(buyer.address);

        const sellersAvailableFundsBefore = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));

        // reserve a range and premint vouchers
        await offerHandler.connect(assistant).reserveRange(offerToken.id, offerToken.quantityAvailable);
        const voucherCloneAddress = calculateContractAddress(accountHandler.address, "1");
        const bosonVoucher = await ethers.getContractAt("BosonVoucher", voucherCloneAddress);
        await bosonVoucher.connect(assistant).preMint(offerToken.id, offerToken.quantityAvailable);

        // commit to an offer via preminted voucher
        let tokenId = "1";
        tx = await bosonVoucher.connect(assistant).transferFrom(assistant.address, buyer.address, tokenId);

        // it should emit FundsEncumbered event with amount equal to sellerDeposit + price
        let encumberedFunds = ethers.BigNumber.from(sellerDeposit).add(price);
        await expect(tx)
          .to.emit(exchangeHandler, "FundsEncumbered")
          .withArgs(seller.id, mockToken.address, encumberedFunds, bosonVoucher.address);

        // Check that seller's pool balance was reduced
        let sellersAvailableFundsAfter = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
        // token is the first on the list of the available funds and the amount should be decreased for the sellerDeposit and price
        expect(
          ethers.BigNumber.from(sellersAvailableFundsBefore.funds[0].availableAmount)
            .sub(ethers.BigNumber.from(sellersAvailableFundsAfter.funds[0].availableAmount))
            .toString()
        ).to.eql(encumberedFunds.toString(), "Token seller available funds mismatch");

        // buyer's token balance should stay the same
        const buyerTokenBalanceAfter = await mockToken.balanceOf(buyer.address);
        expect(buyerTokenBalanceBefore.toString()).to.eql(
          buyerTokenBalanceAfter.toString(),
          "Buyer's token balance should remain the same"
        );

        // make sure that buyer is actually the buyer of the exchange
        let exchange;
        [, exchange] = await exchangeHandler.getExchange(tokenId);
        expect(exchange.buyerId.toString()).to.eql(buyerId, "Wrong buyer id");

        // get native currency balance before the commit
        const buyerNativeBalanceBefore = await ethers.provider.getBalance(buyer.address);

        // reserve a range and premint vouchers
        tokenId = await exchangeHandler.getNextExchangeId();
        await offerHandler.connect(assistant).reserveRange(offerNative.id, offerNative.quantityAvailable);
        await bosonVoucher.connect(assistant).preMint(offerNative.id, offerNative.quantityAvailable);

        // commit to an offer via preminted voucher
        tx = await bosonVoucher.connect(assistant).transferFrom(assistant.address, buyer.address, tokenId);

        // it should emit FundsEncumbered event with amount equal to sellerDeposit + price
        encumberedFunds = ethers.BigNumber.from(sellerDeposit).add(price);
        await expect(tx)
          .to.emit(exchangeHandler, "FundsEncumbered")
          .withArgs(seller.id, ethers.constants.AddressZero, encumberedFunds, bosonVoucher.address);

        // buyer's balance should remain the same
        const buyerNativeBalanceAfter = await ethers.provider.getBalance(buyer.address);
        expect(buyerNativeBalanceBefore.toString()).to.eql(
          buyerNativeBalanceAfter.toString(),
          "Buyer's native balance should remain the same"
        );

        // Check that seller's pool balance was reduced
        sellersAvailableFundsAfter = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
        // native currency the second on the list of the available funds and the amount should be decreased for the sellerDeposit and price
        expect(
          ethers.BigNumber.from(sellersAvailableFundsBefore.funds[1].availableAmount)
            .sub(ethers.BigNumber.from(sellersAvailableFundsAfter.funds[1].availableAmount))
            .toString()
        ).to.eql(encumberedFunds.toString(), "Native currency seller available funds mismatch");

        // make sure that buyer is actually the buyer of the exchange
        [, exchange] = await exchangeHandler.getExchange(tokenId);
        expect(exchange.buyerId.toString()).to.eql(buyerId, "Wrong buyer id");
      });

      context("💔 Revert Reasons", async function () {
        it("Insufficient native currency sent", async function () {
          // Attempt to commit to an offer, expecting revert
          await expect(
            exchangeHandler
              .connect(buyer)
              .commitToOffer(buyer.address, offerNative.id, { value: ethers.BigNumber.from(price).sub("1").toString() })
          ).to.revertedWith(RevertReasons.INSUFFICIENT_VALUE_RECEIVED);
        });

        it("Native currency sent together with ERC20 token transfer", async function () {
          // Attempt to commit to an offer, expecting revert
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id, { value: price })
          ).to.revertedWith(RevertReasons.NATIVE_NOT_ALLOWED);
        });

        it("Token address contract does not support transferFrom", async function () {
          // Deploy a contract without the transferFrom
          [bosonToken] = await deployMockTokens(["BosonToken"]);

          // create an offer with a bad token contrat
          offerToken.exchangeToken = bosonToken.address;
          offerToken.id = "3";

          // add to DR fees
          await accountHandler
            .connect(adminDR)
            .addFeesToDisputeResolver(disputeResolver.id, [
              new DisputeResolverFee(offerToken.exchangeToken, "BadContract", "0"),
            ]);
          await offerHandler
            .connect(assistant)
            .createOffer(offerToken, offerDates, offerDurations, disputeResolverId, agentId);

          // Attempt to commit to an offer, expecting revert
          await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id)).to.revertedWith(
            RevertReasons.SAFE_ERC20_LOW_LEVEL_CALL
          );
        });

        it("Token address is not a contract", async function () {
          // create an offer with a bad token contrat
          offerToken.exchangeToken = admin.address;
          offerToken.id = "3";

          // add to DR fees
          await accountHandler
            .connect(adminDR)
            .addFeesToDisputeResolver(disputeResolver.id, [
              new DisputeResolverFee(offerToken.exchangeToken, "NotAContract", "0"),
            ]);

          await offerHandler
            .connect(assistant)
            .createOffer(offerToken, offerDates, offerDurations, disputeResolverId, agentId);

          // Attempt to commit to an offer, expecting revert
          await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id)).to.revertedWith(
            RevertReasons.EOA_FUNCTION_CALL
          );
        });

        it("Token contract revert for another reason", async function () {
          // insufficient funds
          // approve more than account actually have
          await mockToken.connect(rando).approve(protocolDiamond.address, price);
          // Attempt to commit to an offer, expecting revert
          await expect(exchangeHandler.connect(rando).commitToOffer(rando.address, offerToken.id)).to.revertedWith(
            RevertReasons.ERC20_EXCEEDS_BALANCE
          );

          // not approved
          await mockToken
            .connect(rando)
            .approve(protocolDiamond.address, ethers.BigNumber.from(price).sub("1").toString());
          // Attempt to commit to an offer, expecting revert
          await expect(exchangeHandler.connect(rando).commitToOffer(rando.address, offerToken.id)).to.revertedWith(
            RevertReasons.ERC20_INSUFFICIENT_ALLOWANCE
          );
        });

        it("Seller'a availableFunds is less than the required sellerDeposit", async function () {
          // create an offer with token with higher seller deposit
          offerToken.sellerDeposit = ethers.BigNumber.from(offerToken.sellerDeposit).mul("4");
          offerToken.id = "3";
          await offerHandler
            .connect(assistant)
            .createOffer(offerToken, offerDates, offerDurations, disputeResolverId, agentId);

          // Attempt to commit to an offer, expecting revert
          await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id)).to.revertedWith(
            RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS
          );

          // create an offer with native currency with higher seller deposit
          offerNative.sellerDeposit = ethers.BigNumber.from(offerNative.sellerDeposit).mul("4");
          offerNative.id = "4";
          await offerHandler
            .connect(assistant)
            .createOffer(offerNative, offerDates, offerDurations, disputeResolverId, agentId);

          // Attempt to commit to an offer, expecting revert
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerNative.id, { value: price })
          ).to.revertedWith(RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS);
        });

        it("Seller'a availableFunds is less than the required sellerDeposit + price for preminted offer", async function () {
          // reserve a range and premint vouchers for offer in tokens
          await offerHandler.connect(assistant).reserveRange(offerToken.id, offerToken.quantityAvailable);
          const voucherCloneAddress = calculateContractAddress(accountHandler.address, "1");
          const bosonVoucher = await ethers.getContractAt("BosonVoucher", voucherCloneAddress);
          await bosonVoucher.connect(assistant).preMint(offerToken.id, offerToken.quantityAvailable);

          // Seller's availableFunds is 2*sellerDeposit which is less than sellerDeposit + price.
          // Add the check in case if the sellerDeposit is changed in the future
          assert.isBelow(Number(sellerDeposit), Number(price), "Seller's availableFunds is not less than price");
          // Attempt to commit to an offer via preminted voucher, expecting revert
          let tokenId = "1";
          await expect(
            bosonVoucher.connect(assistant).transferFrom(assistant.address, buyer.address, tokenId)
          ).to.revertedWith(RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS);

          // reserve a range and premint vouchers for offer in native currency
          tokenId = await exchangeHandler.getNextExchangeId();
          await offerHandler.connect(assistant).reserveRange(offerNative.id, offerNative.quantityAvailable);
          await bosonVoucher.connect(assistant).preMint(offerNative.id, offerNative.quantityAvailable);

          // Attempt to commit to an offer, expecting revert
          await expect(
            bosonVoucher.connect(assistant).transferFrom(assistant.address, buyer.address, tokenId)
          ).to.revertedWith(RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS);
        });

        it("Received ERC20 token amount differs from the expected value", async function () {
          // Deploy ERC20 with fees
          const [Foreign20WithFee] = await deployMockTokens(["Foreign20WithFee"]);

          // add to DR fees
          DRFee = ethers.utils.parseUnits("0", "ether").toString();
          await accountHandler
            .connect(adminDR)
            .addFeesToDisputeResolver(disputeResolverId, [
              new DisputeResolverFee(Foreign20WithFee.address, "Foreign20WithFee", DRFee),
            ]);

          // Create an offer with ERC20 with fees
          // Prepare an absolute zero offer
          offerToken.exchangeToken = Foreign20WithFee.address;
          offerToken.sellerDeposit = "0";
          offerToken.id++;

          // Create a new offer
          await offerHandler
            .connect(assistant)
            .createOffer(offerToken, offerDates, offerDurations, disputeResolverId, agentId);

          // mint tokens and approve
          await Foreign20WithFee.mint(buyer.address, offerToken.price);
          await Foreign20WithFee.connect(buyer).approve(protocolDiamond.address, offerToken.price);

          // Attempt to commit to offer, expecting revert
          await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id)).to.revertedWith(
            RevertReasons.INSUFFICIENT_VALUE_RECEIVED
          );
        });
      });
    });

    context("👉 releaseFunds()", async function () {
      beforeEach(async function () {
        // ids
        protocolId = "0";
        buyerId = "4";
        exchangeId = "1";

        // commit to offer
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id);
      });

      context("Final state COMPLETED", async function () {
        beforeEach(async function () {
          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // succesfully redeem exchange
          await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

          // expected payoffs
          // buyer: 0
          buyerPayoff = 0;

          // seller: sellerDeposit + price - protocolFee
          sellerPayoff = ethers.BigNumber.from(offerToken.sellerDeposit)
            .add(offerToken.price)
            .sub(offerTokenProtocolFee)
            .toString();

          // protocol: protocolFee
          protocolPayoff = offerTokenProtocolFee;
        });

        it("should emit a FundsReleased event", async function () {
          // Complete the exchange, expecting event
          const tx = await exchangeHandler.connect(buyer).completeExchange(exchangeId);

          await expect(tx)
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, buyer.address);

          await expect(tx)
            .to.emit(exchangeHandler, "ProtocolFeeCollected")
            .withArgs(exchangeId, offerToken.exchangeToken, protocolPayoff, buyer.address);
        });

        it("should update state", async function () {
          // commit again, so seller has nothing in available funds
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id);

          // Read on chain state
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
          agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

          // Chain state should match the expected available funds
          expectedSellerAvailableFunds = new FundsList([
            new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
          ]);
          expectedBuyerAvailableFunds = new FundsList([]);
          expectedProtocolAvailableFunds = new FundsList([]);
          expectedAgentAvailableFunds = new FundsList([]);
          expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
          expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
          expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
          expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

          // Complete the exchange so the funds are released
          await exchangeHandler.connect(buyer).completeExchange(exchangeId);

          // Available funds should be increased for
          // buyer: 0
          // seller: sellerDeposit + price - protocolFee - agentFee
          // protocol: protocolFee
          // agent: 0
          expectedSellerAvailableFunds.funds.push(new Funds(mockToken.address, "Foreign20", sellerPayoff));
          expectedProtocolAvailableFunds.funds.push(new Funds(mockToken.address, "Foreign20", offerTokenProtocolFee));
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
          agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
          expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
          expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
          expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
          expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

          // complete another exchange so we test funds are only updated, no new entry is created
          await exchangeHandler.connect(buyer).redeemVoucher(++exchangeId);
          await exchangeHandler.connect(buyer).completeExchange(exchangeId);

          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
          agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
          expectedSellerAvailableFunds.funds[1] = new Funds(
            mockToken.address,
            "Foreign20",
            ethers.BigNumber.from(sellerPayoff).mul(2).toString()
          );
          expectedProtocolAvailableFunds.funds[0] = new Funds(
            mockToken.address,
            "Foreign20",
            ethers.BigNumber.from(protocolPayoff).mul(2).toString()
          );
          expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
          expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
          expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
          expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
        });

        context("Offer has an agent", async function () {
          beforeEach(async function () {
            // Create Agent offer
            await offerHandler
              .connect(assistant)
              .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id);

            // Commit to Offer
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, agentOffer.id);

            // succesfully redeem exchange
            exchangeId = "2";
            await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

            // expected payoffs
            // buyer: 0
            buyerPayoff = 0;

            // agentPayoff: agentFee
            agentFee = ethers.BigNumber.from(agentOffer.price).mul(agentFeePercentage).div("10000").toString();
            agentPayoff = agentFee;

            // seller: sellerDeposit + price - protocolFee - agentFee
            sellerPayoff = ethers.BigNumber.from(agentOffer.sellerDeposit)
              .add(agentOffer.price)
              .sub(agentOfferProtocolFee)
              .sub(agentFee)
              .toString();

            // protocol: protocolFee
            protocolPayoff = agentOfferProtocolFee;
          });

          it("should emit a FundsReleased event", async function () {
            // Complete the exchange, expecting event
            const tx = await exchangeHandler.connect(buyer).completeExchange(exchangeId);

            // Complete the exchange, expecting event
            await expect(tx)
              .to.emit(exchangeHandler, "FundsReleased")
              .withArgs(exchangeId, seller.id, agentOffer.exchangeToken, sellerPayoff, buyer.address);

            await expect(tx)
              .to.emit(exchangeHandler, "ProtocolFeeCollected")
              .withArgs(exchangeId, agentOffer.exchangeToken, protocolPayoff, buyer.address);

            await expect(tx)
              .to.emit(exchangeHandler, "FundsReleased")
              .withArgs(exchangeId, agentId, agentOffer.exchangeToken, agentPayoff, buyer.address);
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
            ]);
            expectedBuyerAvailableFunds = new FundsList([]);
            expectedProtocolAvailableFunds = new FundsList([]);
            expectedAgentAvailableFunds = new FundsList([]);
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

            // Complete the exchange so the funds are released
            await exchangeHandler.connect(buyer).completeExchange(exchangeId);

            // Available funds should be increased for
            // buyer: 0
            // seller: sellerDeposit + price - protocolFee - agentFee
            // protocol: protocolFee
            // agent: agentFee
            expectedSellerAvailableFunds.funds.push(new Funds(mockToken.address, "Foreign20", sellerPayoff));
            expectedProtocolAvailableFunds.funds.push(new Funds(mockToken.address, "Foreign20", agentOfferProtocolFee));
            expectedAgentAvailableFunds.funds.push(new Funds(mockToken.address, "Foreign20", agentPayoff));
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
          });
        });
      });

      context("Final state REVOKED", async function () {
        beforeEach(async function () {
          // expected payoffs
          // buyer: sellerDeposit + price
          buyerPayoff = ethers.BigNumber.from(offerToken.sellerDeposit).add(offerToken.price).toString();

          // seller: 0
          sellerPayoff = 0;

          // protocol: 0
          protocolPayoff = 0;
        });

        it("should emit a FundsReleased event", async function () {
          // Revoke the voucher, expecting event
          await expect(exchangeHandler.connect(assistant).revokeVoucher(exchangeId))
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, assistant.address);
        });

        it("should update state", async function () {
          // Read on chain state
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
          agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

          // Chain state should match the expected available funds
          expectedSellerAvailableFunds = new FundsList([
            new Funds(mockToken.address, "Foreign20", sellerDeposit),
            new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
          ]);
          expectedBuyerAvailableFunds = new FundsList([]);
          expectedProtocolAvailableFunds = new FundsList([]);
          expectedAgentAvailableFunds = new FundsList([]);
          expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
          expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
          expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
          expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

          // Revoke the voucher so the funds are released
          await exchangeHandler.connect(assistant).revokeVoucher(exchangeId);

          // Available funds should be increased for
          // buyer: sellerDeposit + price
          // seller: 0
          // protocol: 0
          // agent: 0
          expectedBuyerAvailableFunds.funds.push(new Funds(mockToken.address, "Foreign20", buyerPayoff));
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
          agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
          expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
          expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
          expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
          expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

          // Test that if buyer has some funds available, and gets more, the funds are only updated
          // Commit again
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id);

          // Revoke another voucher
          await exchangeHandler.connect(assistant).revokeVoucher(++exchangeId);

          // Available funds should be increased for
          // buyer: sellerDeposit + price
          // seller: 0; but during the commitToOffer, sellerDeposit is encumbered
          // protocol: 0
          // agent: 0
          expectedBuyerAvailableFunds.funds[0] = new Funds(
            mockToken.address,
            "Foreign20",
            ethers.BigNumber.from(buyerPayoff).mul(2).toString()
          );
          expectedSellerAvailableFunds = new FundsList([
            new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
          ]);
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
          agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
          expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
          expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
          expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
          expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
        });

        context("Offer has an agent", async function () {
          beforeEach(async function () {
            // Create Agent offer
            await offerHandler
              .connect(assistant)
              .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id);

            // top up seller's and buyer's account
            await mockToken.mint(assistant.address, `${2 * sellerDeposit}`);
            await mockToken.mint(buyer.address, `${2 * price}`);

            // approve protocol to transfer the tokens
            await mockToken.connect(assistant).approve(protocolDiamond.address, `${2 * sellerDeposit}`);
            await mockToken.connect(buyer).approve(protocolDiamond.address, `${2 * price}`);

            // deposit to seller's pool
            await fundsHandler.connect(assistant).depositFunds(seller.id, mockToken.address, `${2 * sellerDeposit}`);

            // Commit to Offer
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, agentOffer.id);

            // expected payoffs
            // buyer: sellerDeposit + price
            buyerPayoff = ethers.BigNumber.from(agentOffer.sellerDeposit).add(agentOffer.price).toString();

            // seller: 0
            sellerPayoff = 0;

            // protocol: 0
            protocolPayoff = 0;

            // agent: 0
            agentPayoff = 0;

            exchangeId = "2";
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(mockToken.address, "Foreign20", `${2 * sellerDeposit}`),
              new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
            ]);
            expectedBuyerAvailableFunds = new FundsList([]);
            expectedProtocolAvailableFunds = new FundsList([]);
            expectedAgentAvailableFunds = new FundsList([]);
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

            // Revoke the voucher so the funds are released
            await exchangeHandler.connect(assistant).revokeVoucher(exchangeId);

            // Available funds should be increased for
            // buyer: sellerDeposit + price
            // seller: 0
            // protocol: 0
            // agent: 0
            expectedBuyerAvailableFunds.funds.push(new Funds(mockToken.address, "Foreign20", buyerPayoff));
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

            // Test that if buyer has some funds available, and gets more, the funds are only updated
            // Commit again
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, agentOffer.id);

            // Revoke another voucher
            await exchangeHandler.connect(assistant).revokeVoucher(++exchangeId);

            // Available funds should be increased for
            // buyer: sellerDeposit + price
            // seller: 0; but during the commitToOffer, sellerDeposit is encumbered
            // protocol: 0
            // agent: 0
            expectedBuyerAvailableFunds.funds[0] = new Funds(
              mockToken.address,
              "Foreign20",
              ethers.BigNumber.from(buyerPayoff).mul(2).toString()
            );
            expectedSellerAvailableFunds = new FundsList([
              new Funds(mockToken.address, "Foreign20", `${sellerDeposit}`),
              new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
            ]);
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
          });
        });
      });

      context("Final state CANCELED", async function () {
        beforeEach(async function () {
          // expected payoffs
          // buyer: price - buyerCancelPenalty
          buyerPayoff = ethers.BigNumber.from(offerToken.price).sub(offerToken.buyerCancelPenalty).toString();

          // seller: sellerDeposit + buyerCancelPenalty
          sellerPayoff = ethers.BigNumber.from(offerToken.sellerDeposit).add(offerToken.buyerCancelPenalty).toString();

          // protocol: 0
          protocolPayoff = 0;
        });

        it("should emit a FundsReleased event", async function () {
          // Cancel the voucher, expecting event
          const tx = await exchangeHandler.connect(buyer).cancelVoucher(exchangeId);
          await expect(tx)
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, buyer.address);

          await expect(tx)
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, buyer.address);

          await expect(tx).to.not.emit(exchangeHandler, "ProtocolFeeCollected");
        });

        it("should update state", async function () {
          // Read on chain state
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
          agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

          // Chain state should match the expected available funds
          expectedSellerAvailableFunds = new FundsList([
            new Funds(mockToken.address, "Foreign20", sellerDeposit),
            new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
          ]);
          expectedBuyerAvailableFunds = new FundsList([]);
          expectedProtocolAvailableFunds = new FundsList([]);
          expectedAgentAvailableFunds = new FundsList([]);
          expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
          expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
          expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
          expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

          // Cancel the voucher, so the funds are released
          await exchangeHandler.connect(buyer).cancelVoucher(exchangeId);

          // Available funds should be increased for
          // buyer: price - buyerCancelPenalty
          // seller: sellerDeposit + buyerCancelPenalty; note that seller has sellerDeposit in availableFunds from before
          // protocol: 0
          // agent: 0
          expectedSellerAvailableFunds.funds[0] = new Funds(
            mockToken.address,
            "Foreign20",
            ethers.BigNumber.from(sellerDeposit).add(sellerPayoff).toString()
          );
          expectedBuyerAvailableFunds.funds.push(new Funds(mockToken.address, "Foreign20", buyerPayoff));
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
          agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
          expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
          expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
          expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
          expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
        });

        context("Offer has an agent", async function () {
          beforeEach(async function () {
            // Create Agent offer
            await offerHandler
              .connect(assistant)
              .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id);

            // top up seller's and buyer's account
            await mockToken.mint(assistant.address, `${2 * sellerDeposit}`);
            await mockToken.mint(buyer.address, `${2 * price}`);

            // approve protocol to transfer the tokens
            await mockToken.connect(assistant).approve(protocolDiamond.address, `${2 * sellerDeposit}`);
            await mockToken.connect(buyer).approve(protocolDiamond.address, `${2 * price}`);

            // deposit to seller's pool
            await fundsHandler.connect(assistant).depositFunds(seller.id, mockToken.address, `${sellerDeposit}`);

            // Commit to Offer
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, agentOffer.id);

            // expected payoffs
            // buyer: price - buyerCancelPenalty
            buyerPayoff = ethers.BigNumber.from(agentOffer.price).sub(agentOffer.buyerCancelPenalty).toString();

            // seller: sellerDeposit + buyerCancelPenalty
            sellerPayoff = ethers.BigNumber.from(agentOffer.sellerDeposit)
              .add(agentOffer.buyerCancelPenalty)
              .toString();

            // protocol: 0
            protocolPayoff = 0;

            // agent: 0
            agentPayoff = 0;

            exchangeId = "2";
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(mockToken.address, "Foreign20", sellerDeposit),
              new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
            ]);
            expectedBuyerAvailableFunds = new FundsList([]);
            expectedProtocolAvailableFunds = new FundsList([]);
            expectedAgentAvailableFunds = new FundsList([]);
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

            // Cancel the voucher, so the funds are released
            await exchangeHandler.connect(buyer).cancelVoucher(exchangeId);

            // Available funds should be increased for
            // buyer: price - buyerCancelPenalty
            // seller: sellerDeposit + buyerCancelPenalty; note that seller has sellerDeposit in availableFunds from before
            // protocol: 0
            // agent: 0
            expectedSellerAvailableFunds.funds[0] = new Funds(
              mockToken.address,
              "Foreign20",
              ethers.BigNumber.from(sellerDeposit).add(sellerPayoff).toString()
            );
            expectedBuyerAvailableFunds.funds.push(new Funds(mockToken.address, "Foreign20", buyerPayoff));
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
          });
        });
      });

      context("Final state DISPUTED", async function () {
        beforeEach(async function () {
          // ProtocolInitializationHandlerFacet has to be passed to deploy function works
          const facetsToDeploy = await getFacetsWithArgs(["DisputeHandlerFacet"]);

          await deployAndCutFacets(
            protocolDiamond.address,
            facetsToDeploy,
            maxPriorityFeePerGas,
            "2.1.0",
            protocolInitializationFacet
          );

          // Cast Diamond to IBosonDisputeHandler
          disputeHandler = await ethers.getContractAt("IBosonDisputeHandler", protocolDiamond.address);

          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // succesfully redeem exchange
          await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

          // raise the dispute
          tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Get the block timestamp of the confirmed tx and set disputedDate
          blockNumber = tx.blockNumber;
          block = await ethers.provider.getBlock(blockNumber);
          disputedDate = block.timestamp.toString();
          timeout = ethers.BigNumber.from(disputedDate).add(resolutionPeriod).toString();
        });

        context("Final state DISPUTED - RETRACTED", async function () {
          beforeEach(async function () {
            // expected payoffs
            // buyer: 0
            buyerPayoff = 0;

            // seller: sellerDeposit + price - protocolFee
            sellerPayoff = ethers.BigNumber.from(offerToken.sellerDeposit)
              .add(offerToken.price)
              .sub(offerTokenProtocolFee)
              .toString();

            // protocol: 0
            protocolPayoff = offerTokenProtocolFee;
          });

          it("should emit a FundsReleased event", async function () {
            // Retract from the dispute, expecting event
            const tx = await disputeHandler.connect(buyer).retractDispute(exchangeId);

            await expect(tx)
              .to.emit(disputeHandler, "ProtocolFeeCollected")
              .withArgs(exchangeId, offerToken.exchangeToken, protocolPayoff, buyer.address);

            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, buyer.address);

            //check that FundsReleased event was NOT emitted with buyer Id
            const txReceipt = await tx.wait();
            const match = eventEmittedWithArgs(txReceipt, disputeHandler, "FundsReleased", [
              exchangeId,
              buyerId,
              offerToken.exchangeToken,
              buyerPayoff,
              buyer.address,
            ]);
            expect(match).to.be.false;
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(mockToken.address, "Foreign20", sellerDeposit),
              new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
            ]);
            expectedBuyerAvailableFunds = new FundsList([]);
            expectedProtocolAvailableFunds = new FundsList([]);
            expectedAgentAvailableFunds = new FundsList([]);
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

            // Retract from the dispute, so the funds are released
            await disputeHandler.connect(buyer).retractDispute(exchangeId);

            // Available funds should be increased for
            // buyer: 0
            // seller: sellerDeposit + price - protocol fee; note that seller has sellerDeposit in availableFunds from before
            // protocol: protocolFee
            // agent: 0
            expectedSellerAvailableFunds.funds[0] = new Funds(
              mockToken.address,
              "Foreign20",
              ethers.BigNumber.from(sellerDeposit).add(sellerPayoff).toString()
            );
            expectedProtocolAvailableFunds.funds[0] = new Funds(mockToken.address, "Foreign20", protocolPayoff);
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
          });

          context("Offer has an agent", async function () {
            beforeEach(async function () {
              // expected payoffs
              // buyer: 0
              buyerPayoff = 0;

              // agentPayoff: agentFee
              agentFee = ethers.BigNumber.from(agentOffer.price).mul(agentFeePercentage).div("10000").toString();
              agentPayoff = agentFee;

              // seller: sellerDeposit + price - protocolFee - agentFee
              sellerPayoff = ethers.BigNumber.from(agentOffer.sellerDeposit)
                .add(agentOffer.price)
                .sub(agentOfferProtocolFee)
                .sub(agentFee)
                .toString();

              // protocol: 0
              protocolPayoff = agentOfferProtocolFee;

              // Exchange id
              exchangeId = "2";
              await offerHandler
                .connect(assistant)
                .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id);
              await exchangeHandler.connect(buyer).commitToOffer(buyer.address, agentOffer.id);

              // succesfully redeem exchange
              await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

              // raise the dispute
              await disputeHandler.connect(buyer).raiseDispute(exchangeId);
            });

            it("should emit a FundsReleased event", async function () {
              // Retract from the dispute, expecting event
              const tx = await disputeHandler.connect(buyer).retractDispute(exchangeId);

              await expect(tx)
                .to.emit(disputeHandler, "ProtocolFeeCollected")
                .withArgs(exchangeId, offerToken.exchangeToken, protocolPayoff, buyer.address);

              await expect(tx)
                .to.emit(disputeHandler, "FundsReleased")
                .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, buyer.address);

              await expect(tx)
                .to.emit(exchangeHandler, "FundsReleased")
                .withArgs(exchangeId, agentId, agentOffer.exchangeToken, agentPayoff, buyer.address);
            });

            it("should update state", async function () {
              // Read on chain state
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

              // Chain state should match the expected available funds
              expectedSellerAvailableFunds = new FundsList([
                new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
              ]);
              expectedBuyerAvailableFunds = new FundsList([]);
              expectedProtocolAvailableFunds = new FundsList([]);
              expectedAgentAvailableFunds = new FundsList([]);
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

              // Retract from the dispute, so the funds are released
              await disputeHandler.connect(buyer).retractDispute(exchangeId);

              // Available funds should be increased for
              // buyer: 0
              // seller: sellerDeposit + price - protocol fee - agentFee;
              // protocol: protocolFee
              // agent: agentFee
              expectedSellerAvailableFunds.funds.push(
                new Funds(mockToken.address, "Foreign20", ethers.BigNumber.from(sellerPayoff).toString())
              );
              expectedProtocolAvailableFunds.funds[0] = new Funds(mockToken.address, "Foreign20", protocolPayoff);
              expectedAgentAvailableFunds.funds.push(new Funds(mockToken.address, "Foreign20", agentPayoff));
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
            });
          });
        });

        context("Final state DISPUTED - RETRACTED via expireDispute", async function () {
          beforeEach(async function () {
            // expected payoffs
            // buyer: 0
            buyerPayoff = 0;

            // seller: sellerDeposit + price - protocolFee
            sellerPayoff = ethers.BigNumber.from(offerToken.sellerDeposit)
              .add(offerToken.price)
              .sub(offerTokenProtocolFee)
              .toString();

            // protocol: protocolFee
            protocolPayoff = offerTokenProtocolFee;

            await setNextBlockTimestamp(Number(timeout));
          });

          it("should emit a FundsReleased event", async function () {
            // Expire the dispute, expecting event
            const tx = await disputeHandler.connect(rando).expireDispute(exchangeId);
            await expect(tx)
              .to.emit(disputeHandler, "ProtocolFeeCollected")
              .withArgs(exchangeId, offerToken.exchangeToken, protocolPayoff, rando.address);

            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, rando.address);

            //check that FundsReleased event was NOT emitted with buyer Id
            const txReceipt = await tx.wait();
            const match = eventEmittedWithArgs(txReceipt, disputeHandler, "FundsReleased", [
              exchangeId,
              buyerId,
              offerToken.exchangeToken,
              buyerPayoff,
              rando.address,
            ]);
            expect(match).to.be.false;
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(mockToken.address, "Foreign20", sellerDeposit),
              new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
            ]);
            expectedBuyerAvailableFunds = new FundsList([]);
            expectedProtocolAvailableFunds = new FundsList([]);
            expectedAgentAvailableFunds = new FundsList([]);
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

            // Expire the dispute, so the funds are released
            await disputeHandler.connect(rando).expireDispute(exchangeId);

            // Available funds should be increased for
            // buyer: 0
            // seller: sellerDeposit + price - protocol fee; note that seller has sellerDeposit in availableFunds from before
            // protocol: protocolFee
            // agent: 0
            expectedSellerAvailableFunds.funds[0] = new Funds(
              mockToken.address,
              "Foreign20",
              ethers.BigNumber.from(sellerDeposit).add(sellerPayoff).toString()
            );
            expectedProtocolAvailableFunds.funds[0] = new Funds(mockToken.address, "Foreign20", protocolPayoff);
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
          });

          context("Offer has an agent", async function () {
            beforeEach(async function () {
              // Create Agent offer
              await offerHandler
                .connect(assistant)
                .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id);

              // Commit to Offer
              await exchangeHandler.connect(buyer).commitToOffer(buyer.address, agentOffer.id);

              // expected payoffs
              // buyer: 0
              buyerPayoff = 0;

              // agentPayoff: agentFee
              agentFee = ethers.BigNumber.from(agentOffer.price).mul(agentFeePercentage).div("10000").toString();
              agentPayoff = agentFee;

              // seller: sellerDeposit + price - protocolFee - agent fee
              sellerPayoff = ethers.BigNumber.from(agentOffer.sellerDeposit)
                .add(agentOffer.price)
                .sub(agentOfferProtocolFee)
                .sub(agentFee)
                .toString();

              // protocol: protocolFee
              protocolPayoff = agentOfferProtocolFee;

              // Exchange id
              exchangeId = "2";

              // succesfully redeem exchange
              await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

              // raise the dispute
              tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

              // Get the block timestamp of the confirmed tx and set disputedDate
              blockNumber = tx.blockNumber;
              block = await ethers.provider.getBlock(blockNumber);
              disputedDate = block.timestamp.toString();
              timeout = ethers.BigNumber.from(disputedDate).add(resolutionPeriod).toString();

              await setNextBlockTimestamp(Number(timeout));
            });

            it("should emit a FundsReleased event", async function () {
              // Expire the dispute, expecting event
              const tx = await disputeHandler.connect(rando).expireDispute(exchangeId);

              // Complete the exchange, expecting event
              await expect(tx)
                .to.emit(exchangeHandler, "FundsReleased")
                .withArgs(exchangeId, agentId, agentOffer.exchangeToken, agentPayoff, rando.address);

              await expect(tx)
                .to.emit(exchangeHandler, "FundsReleased")
                .withArgs(exchangeId, seller.id, agentOffer.exchangeToken, sellerPayoff, rando.address);

              await expect(tx)
                .to.emit(exchangeHandler, "ProtocolFeeCollected")
                .withArgs(exchangeId, agentOffer.exchangeToken, protocolPayoff, rando.address);
            });

            it("should update state", async function () {
              // Read on chain state
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

              // Chain state should match the expected available funds
              expectedSellerAvailableFunds = new FundsList([
                new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
              ]);
              expectedBuyerAvailableFunds = new FundsList([]);
              expectedProtocolAvailableFunds = new FundsList([]);
              expectedAgentAvailableFunds = new FundsList([]);
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

              // Expire the dispute, so the funds are released
              await disputeHandler.connect(rando).expireDispute(exchangeId);

              // Available funds should be increased for
              // buyer: 0
              // seller: sellerDeposit + price - protocol fee - agent fee;
              // protocol: protocolFee
              // agent: agent fee
              expectedSellerAvailableFunds = new FundsList([
                new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
                new Funds(mockToken.address, "Foreign20", sellerPayoff),
              ]);

              expectedProtocolAvailableFunds.funds[0] = new Funds(mockToken.address, "Foreign20", protocolPayoff);
              expectedAgentAvailableFunds.funds[0] = new Funds(mockToken.address, "Foreign20", agentPayoff);
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
            });
          });
        });

        context("Final state DISPUTED - RESOLVED", async function () {
          beforeEach(async function () {
            buyerPercentBasisPoints = "5566"; // 55.66%

            // expected payoffs
            // buyer: (price + sellerDeposit)*buyerPercentage
            buyerPayoff = ethers.BigNumber.from(offerToken.price)
              .add(offerToken.sellerDeposit)
              .mul(buyerPercentBasisPoints)
              .div("10000")
              .toString();

            // seller: (price + sellerDeposit)*(1-buyerPercentage)
            sellerPayoff = ethers.BigNumber.from(offerToken.price)
              .add(offerToken.sellerDeposit)
              .sub(buyerPayoff)
              .toString();

            // protocol: 0
            protocolPayoff = 0;

            // Set the message Type, needed for signature
            resolutionType = [
              { name: "exchangeId", type: "uint256" },
              { name: "buyerPercentBasisPoints", type: "uint256" },
            ];

            customSignatureType = {
              Resolution: resolutionType,
            };

            message = {
              exchangeId: exchangeId,
              buyerPercentBasisPoints,
            };

            // Collect the signature components
            ({ r, s, v } = await prepareDataSignatureParameters(
              buyer, // Assistant is the caller, seller should be the signer.
              customSignatureType,
              "Resolution",
              message,
              disputeHandler.address
            ));
          });

          it("should emit a FundsReleased event", async function () {
            // Resolve the dispute, expecting event
            const tx = await disputeHandler
              .connect(assistant)
              .resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v);
            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, assistant.address);

            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, assistant.address);

            await expect(tx).to.not.emit(disputeHandler, "ProtocolFeeCollected");
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(mockToken.address, "Foreign20", sellerDeposit),
              new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
            ]);
            expectedBuyerAvailableFunds = new FundsList([]);
            expectedProtocolAvailableFunds = new FundsList([]);
            expectedAgentAvailableFunds = new FundsList([]);
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

            // Resolve the dispute, so the funds are released
            await disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v);

            // Available funds should be increased for
            // buyer: (price + sellerDeposit)*buyerPercentage
            // seller: (price + sellerDeposit)*(1-buyerPercentage); note that seller has sellerDeposit in availableFunds from before
            // protocol: 0
            // agent: 0
            expectedSellerAvailableFunds.funds[0] = new Funds(
              mockToken.address,
              "Foreign20",
              ethers.BigNumber.from(sellerDeposit).add(sellerPayoff).toString()
            );
            expectedBuyerAvailableFunds = new FundsList([new Funds(mockToken.address, "Foreign20", buyerPayoff)]);
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
          });

          context("Offer has an agent", async function () {
            beforeEach(async function () {
              // Create Agent offer
              await offerHandler
                .connect(assistant)
                .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id);

              // Commit to Offer
              await exchangeHandler.connect(buyer).commitToOffer(buyer.address, agentOffer.id);

              exchangeId = "2";

              // succesfully redeem exchange
              await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

              // raise the dispute
              await disputeHandler.connect(buyer).raiseDispute(exchangeId);

              buyerPercentBasisPoints = "5566"; // 55.66%

              // expected payoffs
              // buyer: (price + sellerDeposit)*buyerPercentage
              buyerPayoff = ethers.BigNumber.from(agentOffer.price)
                .add(agentOffer.sellerDeposit)
                .mul(buyerPercentBasisPoints)
                .div("10000")
                .toString();

              // seller: (price + sellerDeposit)*(1-buyerPercentage)
              sellerPayoff = ethers.BigNumber.from(agentOffer.price)
                .add(agentOffer.sellerDeposit)
                .sub(buyerPayoff)
                .toString();

              // protocol: 0
              protocolPayoff = 0;

              // Set the message Type, needed for signature
              resolutionType = [
                { name: "exchangeId", type: "uint256" },
                { name: "buyerPercentBasisPoints", type: "uint256" },
              ];

              customSignatureType = {
                Resolution: resolutionType,
              };

              message = {
                exchangeId: exchangeId,
                buyerPercentBasisPoints,
              };

              // Collect the signature components
              ({ r, s, v } = await prepareDataSignatureParameters(
                buyer, // Assistant is the caller, seller should be the signer.
                customSignatureType,
                "Resolution",
                message,
                disputeHandler.address
              ));
            });

            it("should update state", async function () {
              // Read on chain state
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

              // Chain state should match the expected available funds
              expectedSellerAvailableFunds = new FundsList([
                new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
              ]);
              expectedBuyerAvailableFunds = new FundsList([]);
              expectedProtocolAvailableFunds = new FundsList([]);
              expectedAgentAvailableFunds = new FundsList([]);
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

              // Resolve the dispute, so the funds are released
              await disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v);

              // Available funds should be increased for
              // buyer: (price + sellerDeposit)*buyerPercentage
              // seller: (price + sellerDeposit)*(1-buyerPercentage);
              // protocol: 0
              // agent: 0
              expectedSellerAvailableFunds.funds.push(
                new Funds(mockToken.address, "Foreign20", ethers.BigNumber.from(sellerPayoff).toString())
              );
              expectedBuyerAvailableFunds = new FundsList([new Funds(mockToken.address, "Foreign20", buyerPayoff)]);
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
            });
          });
        });

        context("Final state DISPUTED - ESCALATED - RETRACTED", async function () {
          beforeEach(async function () {
            // expected payoffs
            // buyer: 0
            buyerPayoff = 0;

            // seller: sellerDeposit + price - protocolFee + buyerEscalationDeposit
            sellerPayoff = ethers.BigNumber.from(offerToken.sellerDeposit)
              .add(offerToken.price)
              .sub(offerTokenProtocolFee)
              .add(buyerEscalationDeposit)
              .toString();

            // protocol: 0
            protocolPayoff = offerTokenProtocolFee;

            // Escalate the dispute
            await disputeHandler.connect(buyer).escalateDispute(exchangeId);
          });

          it("should emit a FundsReleased event", async function () {
            // Retract from the dispute, expecting event
            const tx = await disputeHandler.connect(buyer).retractDispute(exchangeId);

            await expect(tx)
              .to.emit(disputeHandler, "ProtocolFeeCollected")
              .withArgs(exchangeId, offerToken.exchangeToken, protocolPayoff, buyer.address);

            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, buyer.address);

            //check that FundsReleased event was NOT emitted with buyer Id
            const txReceipt = await tx.wait();
            const match = eventEmittedWithArgs(txReceipt, disputeHandler, "FundsReleased", [
              exchangeId,
              buyerId,
              offerToken.exchangeToken,
              buyerPayoff,
              buyer.address,
            ]);
            expect(match).to.be.false;
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(mockToken.address, "Foreign20", sellerDeposit),
              new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
            ]);
            expectedBuyerAvailableFunds = new FundsList([]);
            expectedProtocolAvailableFunds = new FundsList([]);
            expectedAgentAvailableFunds = new FundsList([]);
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

            // Retract from the dispute, so the funds are released
            await disputeHandler.connect(buyer).retractDispute(exchangeId);

            // Available funds should be increased for
            // buyer: 0
            // seller: sellerDeposit + price - protocol fee + buyerEscalationDeposit; note that seller has sellerDeposit in availableFunds from before
            // protocol: protocolFee
            // agent: 0
            expectedSellerAvailableFunds.funds[0] = new Funds(
              mockToken.address,
              "Foreign20",
              ethers.BigNumber.from(sellerDeposit).add(sellerPayoff).toString()
            );
            expectedProtocolAvailableFunds.funds[0] = new Funds(mockToken.address, "Foreign20", protocolPayoff);
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
          });

          context("Offer has an agent", async function () {
            beforeEach(async function () {
              // expected payoffs
              // buyer: 0
              buyerPayoff = 0;

              // agentPayoff: agentFee
              agentFee = ethers.BigNumber.from(agentOffer.price).mul(agentFeePercentage).div("10000").toString();
              agentPayoff = agentFee;

              // seller: sellerDeposit + price - protocolFee - agentFee + buyerEscalationDeposit
              sellerPayoff = ethers.BigNumber.from(agentOffer.sellerDeposit)
                .add(agentOffer.price)
                .sub(agentOfferProtocolFee)
                .sub(agentFee)
                .add(buyerEscalationDeposit)
                .toString();

              // protocol: 0
              protocolPayoff = agentOfferProtocolFee;

              // Exchange id
              exchangeId = "2";
              await offerHandler
                .connect(assistant)
                .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id);

              // approve protocol to transfer the tokens
              await mockToken.connect(buyer).approve(protocolDiamond.address, agentOffer.price);
              await mockToken.mint(buyer.address, agentOffer.price);
              await exchangeHandler.connect(buyer).commitToOffer(buyer.address, agentOffer.id);

              // succesfully redeem exchange
              await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

              // raise the dispute
              await disputeHandler.connect(buyer).raiseDispute(exchangeId);

              // escalate the dispute
              await mockToken.mint(buyer.address, buyerEscalationDeposit);
              await mockToken.connect(buyer).approve(protocolDiamond.address, buyerEscalationDeposit);
              await disputeHandler.connect(buyer).escalateDispute(exchangeId);
            });

            it("should update state", async function () {
              // Read on chain state
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

              // Chain state should match the expected available funds
              expectedSellerAvailableFunds = new FundsList([
                new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
              ]);
              expectedBuyerAvailableFunds = new FundsList([]);
              expectedProtocolAvailableFunds = new FundsList([]);
              expectedAgentAvailableFunds = new FundsList([]);
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

              // Retract from the dispute, so the funds are released
              await disputeHandler.connect(buyer).retractDispute(exchangeId);

              // Available funds should be increased for
              // buyer: 0
              // seller: sellerDeposit + price - protocol fee - agentFee  + buyerEscalationDeposit;
              // protocol: protocolFee
              // agent: agentFee
              expectedSellerAvailableFunds.funds.push(
                new Funds(mockToken.address, "Foreign20", ethers.BigNumber.from(sellerPayoff).toString())
              );
              expectedProtocolAvailableFunds.funds[0] = new Funds(mockToken.address, "Foreign20", protocolPayoff);
              expectedAgentAvailableFunds.funds.push(new Funds(mockToken.address, "Foreign20", agentPayoff));
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
            });
          });
        });

        context("Final state DISPUTED - ESCALATED - RESOLVED", async function () {
          beforeEach(async function () {
            buyerPercentBasisPoints = "5566"; // 55.66%

            // expected payoffs
            // buyer: (price + sellerDeposit + buyerEscalationDeposit)*buyerPercentage
            buyerPayoff = ethers.BigNumber.from(offerToken.price)
              .add(offerToken.sellerDeposit)
              .add(buyerEscalationDeposit)
              .mul(buyerPercentBasisPoints)
              .div("10000")
              .toString();

            // seller: (price + sellerDeposit + buyerEscalationDeposit)*(1-buyerPercentage)
            sellerPayoff = ethers.BigNumber.from(offerToken.price)
              .add(offerToken.sellerDeposit)
              .add(buyerEscalationDeposit)
              .sub(buyerPayoff)
              .toString();

            // protocol: 0
            protocolPayoff = 0;

            // Set the message Type, needed for signature
            resolutionType = [
              { name: "exchangeId", type: "uint256" },
              { name: "buyerPercentBasisPoints", type: "uint256" },
            ];

            customSignatureType = {
              Resolution: resolutionType,
            };

            message = {
              exchangeId: exchangeId,
              buyerPercentBasisPoints,
            };

            // Collect the signature components
            ({ r, s, v } = await prepareDataSignatureParameters(
              buyer, // Assistant is the caller, seller should be the signer.
              customSignatureType,
              "Resolution",
              message,
              disputeHandler.address
            ));

            // Escalate the dispute
            await disputeHandler.connect(buyer).escalateDispute(exchangeId);
          });

          it("should emit a FundsReleased event", async function () {
            // Resolve the dispute, expecting event
            const tx = await disputeHandler
              .connect(assistant)
              .resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v);
            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, assistant.address);

            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, assistant.address);

            await expect(tx).to.not.emit(disputeHandler, "ProtocolFeeCollected");
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(mockToken.address, "Foreign20", sellerDeposit),
              new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
            ]);
            expectedBuyerAvailableFunds = new FundsList([]);
            expectedProtocolAvailableFunds = new FundsList([]);
            expectedAgentAvailableFunds = new FundsList([]);
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

            // Resolve the dispute, so the funds are released
            await disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v);

            // Available funds should be increased for
            // buyer: (price + sellerDeposit + buyerEscalationDeposit)*buyerPercentage
            // seller: (price + sellerDeposit + buyerEscalationDeposit)*(1-buyerPercentage); note that seller has sellerDeposit in availableFunds from before
            // protocol: 0
            // agent: 0
            expectedBuyerAvailableFunds.funds[0] = new Funds(mockToken.address, "Foreign20", buyerPayoff);
            expectedSellerAvailableFunds.funds[0] = new Funds(
              mockToken.address,
              "Foreign20",
              ethers.BigNumber.from(sellerDeposit).add(sellerPayoff).toString()
            );
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
          });

          context("Offer has an agent", async function () {
            beforeEach(async function () {
              // Create Agent offer
              await offerHandler
                .connect(assistant)
                .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id);

              // approve protocol to transfer the tokens
              await mockToken.connect(buyer).approve(protocolDiamond.address, agentOffer.price);
              await mockToken.mint(buyer.address, agentOffer.price);

              // Commit to Offer
              await exchangeHandler.connect(buyer).commitToOffer(buyer.address, agentOffer.id);

              exchangeId = "2";

              // succesfully redeem exchange
              await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

              // raise the dispute
              await disputeHandler.connect(buyer).raiseDispute(exchangeId);

              buyerPercentBasisPoints = "5566"; // 55.66%

              // expected payoffs
              // buyer: (price + sellerDeposit + buyerEscalationDeposit)*buyerPercentage
              buyerPayoff = ethers.BigNumber.from(agentOffer.price)
                .add(agentOffer.sellerDeposit)
                .add(buyerEscalationDeposit)
                .mul(buyerPercentBasisPoints)
                .div("10000")
                .toString();

              // seller: (price + sellerDeposit + buyerEscalationDeposit)*(1-buyerPercentage)
              sellerPayoff = ethers.BigNumber.from(agentOffer.price)
                .add(agentOffer.sellerDeposit)
                .add(buyerEscalationDeposit)
                .sub(buyerPayoff)
                .toString();

              // protocol: 0
              protocolPayoff = 0;

              // Set the message Type, needed for signature
              resolutionType = [
                { name: "exchangeId", type: "uint256" },
                { name: "buyerPercentBasisPoints", type: "uint256" },
              ];

              customSignatureType = {
                Resolution: resolutionType,
              };

              message = {
                exchangeId: exchangeId,
                buyerPercentBasisPoints,
              };

              // Collect the signature components
              ({ r, s, v } = await prepareDataSignatureParameters(
                buyer, // Assistant is the caller, seller should be the signer.
                customSignatureType,
                "Resolution",
                message,
                disputeHandler.address
              ));

              // escalate the dispute
              await mockToken.mint(buyer.address, buyerEscalationDeposit);
              await mockToken.connect(buyer).approve(protocolDiamond.address, buyerEscalationDeposit);
              await disputeHandler.connect(buyer).escalateDispute(exchangeId);
            });

            it("should update state", async function () {
              // Read on chain state
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

              // Chain state should match the expected available funds
              expectedSellerAvailableFunds = new FundsList([
                new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
              ]);
              expectedBuyerAvailableFunds = new FundsList([]);
              expectedProtocolAvailableFunds = new FundsList([]);
              expectedAgentAvailableFunds = new FundsList([]);
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

              // Resolve the dispute, so the funds are released
              await disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v);

              // Available funds should be increased for
              // buyer: (price + sellerDeposit + buyerEscalationDeposit)*buyerPercentage
              // seller: (price + sellerDeposit + buyerEscalationDeposit)*(1-buyerPercentage);
              // protocol: 0
              // agent: 0
              expectedSellerAvailableFunds.funds.push(
                new Funds(mockToken.address, "Foreign20", ethers.BigNumber.from(sellerPayoff).toString())
              );
              expectedBuyerAvailableFunds = new FundsList([new Funds(mockToken.address, "Foreign20", buyerPayoff)]);
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
            });
          });
        });

        context("Final state DISPUTED - ESCALATED - DECIDED", async function () {
          beforeEach(async function () {
            buyerPercentBasisPoints = "5566"; // 55.66%

            // expected payoffs
            // buyer: (price + sellerDeposit + buyerEscalationDeposit)*buyerPercentage
            buyerPayoff = ethers.BigNumber.from(offerToken.price)
              .add(offerToken.sellerDeposit)
              .add(buyerEscalationDeposit)
              .mul(buyerPercentBasisPoints)
              .div("10000")
              .toString();

            // seller: (price + sellerDeposit + buyerEscalationDeposit)*(1-buyerPercentage)
            sellerPayoff = ethers.BigNumber.from(offerToken.price)
              .add(offerToken.sellerDeposit)
              .add(buyerEscalationDeposit)
              .sub(buyerPayoff)
              .toString();

            // protocol: 0
            protocolPayoff = 0;

            // escalate the dispute
            await disputeHandler.connect(buyer).escalateDispute(exchangeId);
          });

          it("should emit a FundsReleased event", async function () {
            // Decide the dispute, expecting event
            const tx = await disputeHandler.connect(assistantDR).decideDispute(exchangeId, buyerPercentBasisPoints);
            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, assistantDR.address);

            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, assistantDR.address);

            await expect(tx).to.not.emit(disputeHandler, "ProtocolFeeCollected");
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(mockToken.address, "Foreign20", sellerDeposit),
              new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
            ]);
            expectedBuyerAvailableFunds = new FundsList([]);
            expectedProtocolAvailableFunds = new FundsList([]);
            expectedAgentAvailableFunds = new FundsList([]);
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

            // Decide the dispute, so the funds are released
            await disputeHandler.connect(assistantDR).decideDispute(exchangeId, buyerPercentBasisPoints);

            // Available funds should be increased for
            // buyer: (price + sellerDeposit + buyerEscalationDeposit)*buyerPercentage
            // seller: (price + sellerDeposit + buyerEscalationDeposit)*(1-buyerPercentage); note that seller has sellerDeposit in availableFunds from before
            // protocol: 0
            // agent: 0
            expectedBuyerAvailableFunds.funds[0] = new Funds(mockToken.address, "Foreign20", buyerPayoff);
            expectedSellerAvailableFunds.funds[0] = new Funds(
              mockToken.address,
              "Foreign20",
              ethers.BigNumber.from(sellerDeposit).add(sellerPayoff).toString()
            );
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
          });

          context("Offer has an agent", async function () {
            beforeEach(async function () {
              // Create Agent offer
              await offerHandler
                .connect(assistant)
                .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id);

              // approve protocol to transfer the tokens
              await mockToken.connect(buyer).approve(protocolDiamond.address, agentOffer.price);
              await mockToken.mint(buyer.address, agentOffer.price);

              // Commit to Offer
              await exchangeHandler.connect(buyer).commitToOffer(buyer.address, agentOffer.id);

              exchangeId = "2";

              // succesfully redeem exchange
              await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

              // raise the dispute
              tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

              // Get the block timestamp of the confirmed tx and set disputedDate
              blockNumber = tx.blockNumber;
              block = await ethers.provider.getBlock(blockNumber);
              disputedDate = block.timestamp.toString();
              timeout = ethers.BigNumber.from(disputedDate).add(resolutionPeriod).toString();

              buyerPercentBasisPoints = "5566"; // 55.66%

              // expected payoffs
              // buyer: (price + sellerDeposit + buyerEscalationDeposit)*buyerPercentage
              buyerPayoff = ethers.BigNumber.from(agentOffer.price)
                .add(agentOffer.sellerDeposit)
                .add(buyerEscalationDeposit)
                .mul(buyerPercentBasisPoints)
                .div("10000")
                .toString();

              // seller: (price + sellerDeposit + buyerEscalationDeposit)*(1-buyerPercentage)
              sellerPayoff = ethers.BigNumber.from(agentOffer.price)
                .add(agentOffer.sellerDeposit)
                .add(buyerEscalationDeposit)
                .sub(buyerPayoff)
                .toString();

              // protocol: 0
              protocolPayoff = 0;

              // escalate the dispute
              await mockToken.mint(buyer.address, buyerEscalationDeposit);
              await mockToken.connect(buyer).approve(protocolDiamond.address, buyerEscalationDeposit);
              await disputeHandler.connect(buyer).escalateDispute(exchangeId);
            });

            it("should update state", async function () {
              // Read on chain state
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

              // Chain state should match the expected available funds
              expectedSellerAvailableFunds = new FundsList([
                new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
              ]);
              expectedBuyerAvailableFunds = new FundsList([]);
              expectedProtocolAvailableFunds = new FundsList([]);
              expectedAgentAvailableFunds = new FundsList([]);
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

              // Decide the dispute, so the funds are released
              await disputeHandler.connect(assistantDR).decideDispute(exchangeId, buyerPercentBasisPoints);

              // Available funds should be increased for
              // buyer: (price + sellerDeposit + buyerEscalationDeposit)*buyerPercentage
              // seller: (price + sellerDeposit + buyerEscalationDeposit)*(1-buyerPercentage);
              // protocol: 0
              // agent: 0
              expectedSellerAvailableFunds.funds.push(
                new Funds(mockToken.address, "Foreign20", ethers.BigNumber.from(sellerPayoff).toString())
              );
              expectedBuyerAvailableFunds = new FundsList([new Funds(mockToken.address, "Foreign20", buyerPayoff)]);
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
            });
          });
        });

        context(
          "Final state DISPUTED - ESCALATED - REFUSED via expireEscalatedDispute (fail to resolve)",
          async function () {
            beforeEach(async function () {
              // expected payoffs
              // buyer: price + buyerEscalationDeposit
              buyerPayoff = ethers.BigNumber.from(offerToken.price).add(buyerEscalationDeposit).toString();

              // seller: sellerDeposit
              sellerPayoff = offerToken.sellerDeposit;

              // protocol: 0
              protocolPayoff = 0;

              // Escalate the dispute
              tx = await disputeHandler.connect(buyer).escalateDispute(exchangeId);

              // Get the block timestamp of the confirmed tx and set escalatedDate
              blockNumber = tx.blockNumber;
              block = await ethers.provider.getBlock(blockNumber);
              escalatedDate = block.timestamp.toString();

              await setNextBlockTimestamp(Number(escalatedDate) + Number(disputeResolver.escalationResponsePeriod));
            });

            it("should emit a FundsReleased event", async function () {
              // Expire the dispute, expecting event
              const tx = await disputeHandler.connect(rando).expireEscalatedDispute(exchangeId);
              await expect(tx)
                .to.emit(disputeHandler, "FundsReleased")
                .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, rando.address);
              await expect(tx)
                .to.emit(disputeHandler, "FundsReleased")
                .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, rando.address);

              await expect(tx).to.not.emit(disputeHandler, "ProtocolFeeCollected");
            });

            it("should update state", async function () {
              // Read on chain state
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

              // Chain state should match the expected available funds
              expectedSellerAvailableFunds = new FundsList([
                new Funds(mockToken.address, "Foreign20", sellerDeposit),
                new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
              ]);
              expectedBuyerAvailableFunds = new FundsList([]);
              expectedProtocolAvailableFunds = new FundsList([]);
              expectedAgentAvailableFunds = new FundsList([]);
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

              // Expire the escalated dispute, so the funds are released
              await disputeHandler.connect(rando).expireEscalatedDispute(exchangeId);

              // Available funds should be increased for
              // buyer: price + buyerEscalationDeposit
              // seller: sellerDeposit; note that seller has sellerDeposit in availableFunds from before
              // protocol: 0
              // agent: 0
              expectedBuyerAvailableFunds.funds[0] = new Funds(mockToken.address, "Foreign20", buyerPayoff);
              expectedSellerAvailableFunds.funds[0] = new Funds(
                mockToken.address,
                "Foreign20",
                ethers.BigNumber.from(sellerDeposit).add(sellerPayoff).toString()
              );
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
            });

            context("Offer has an agent", async function () {
              beforeEach(async function () {
                // Create Agent offer
                await offerHandler
                  .connect(assistant)
                  .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id);

                // approve protocol to transfer the tokens
                await mockToken.connect(buyer).approve(protocolDiamond.address, agentOffer.price);
                await mockToken.mint(buyer.address, agentOffer.price);

                // Commit to Offer
                await exchangeHandler.connect(buyer).commitToOffer(buyer.address, agentOffer.id);

                exchangeId = "2";

                // succesfully redeem exchange
                await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

                // raise the dispute
                tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

                // expected payoffs
                // buyer: price + buyerEscalationDeposit
                buyerPayoff = ethers.BigNumber.from(offerToken.price).add(buyerEscalationDeposit).toString();

                // seller: sellerDeposit
                sellerPayoff = offerToken.sellerDeposit;

                // protocol: 0
                protocolPayoff = 0;

                // Escalate the dispute
                await mockToken.mint(buyer.address, buyerEscalationDeposit);
                await mockToken.connect(buyer).approve(protocolDiamond.address, buyerEscalationDeposit);
                tx = await disputeHandler.connect(buyer).escalateDispute(exchangeId);

                // Get the block timestamp of the confirmed tx and set escalatedDate
                blockNumber = tx.blockNumber;
                block = await ethers.provider.getBlock(blockNumber);
                escalatedDate = block.timestamp.toString();

                await setNextBlockTimestamp(Number(escalatedDate) + Number(disputeResolver.escalationResponsePeriod));
              });

              it("should update state", async function () {
                // Read on chain state
                sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
                buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
                protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
                agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

                // Chain state should match the expected available funds
                expectedSellerAvailableFunds = new FundsList([
                  new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
                ]);
                expectedBuyerAvailableFunds = new FundsList([]);
                expectedProtocolAvailableFunds = new FundsList([]);
                expectedAgentAvailableFunds = new FundsList([]);
                expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
                expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
                expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
                expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

                // Expire the escalated dispute, so the funds are released
                await disputeHandler.connect(rando).expireEscalatedDispute(exchangeId);

                // Available funds should be increased for
                // buyer: price + buyerEscalationDeposit
                // seller: sellerDeposit;
                // protocol: 0
                // agent: 0
                expectedBuyerAvailableFunds.funds[0] = new Funds(mockToken.address, "Foreign20", buyerPayoff);
                expectedSellerAvailableFunds.funds.push(
                  new Funds(mockToken.address, "Foreign20", ethers.BigNumber.from(sellerPayoff).toString())
                );
                sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
                buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
                protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
                agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
                expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
                expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
                expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
                expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
              });
            });
          }
        );

        context(
          "Final state DISPUTED - ESCALATED - REFUSED via refuseEscalatedDispute (explicit refusal)",
          async function () {
            beforeEach(async function () {
              // expected payoffs
              // buyer: price + buyerEscalationDeposit
              buyerPayoff = ethers.BigNumber.from(offerToken.price).add(buyerEscalationDeposit).toString();

              // seller: sellerDeposit
              sellerPayoff = offerToken.sellerDeposit;

              // protocol: 0
              protocolPayoff = 0;

              // Escalate the dispute
              tx = await disputeHandler.connect(buyer).escalateDispute(exchangeId);
            });

            it("should emit a FundsReleased event", async function () {
              // Expire the dispute, expecting event
              const tx = await disputeHandler.connect(assistantDR).refuseEscalatedDispute(exchangeId);

              await expect(tx)
                .to.emit(disputeHandler, "FundsReleased")
                .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, assistantDR.address);

              await expect(tx)
                .to.emit(disputeHandler, "FundsReleased")
                .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, assistantDR.address);

              await expect(tx).to.not.emit(disputeHandler, "ProtocolFeeCollected");

              //check that FundsReleased event was NOT emitted with  rando address
              const txReceipt = await tx.wait();
              const match = eventEmittedWithArgs(txReceipt, disputeHandler, "FundsReleased", [
                exchangeId,
                seller.id,
                offerToken.exchangeToken,
                sellerPayoff,
                rando.address,
              ]);
              expect(match).to.be.false;
            });

            it("should update state", async function () {
              // Read on chain state
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

              // Chain state should match the expected available funds
              expectedSellerAvailableFunds = new FundsList([
                new Funds(mockToken.address, "Foreign20", sellerDeposit),
                new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
              ]);
              expectedBuyerAvailableFunds = new FundsList([]);
              expectedProtocolAvailableFunds = new FundsList([]);
              expectedAgentAvailableFunds = new FundsList([]);
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

              // Expire the escalated dispute, so the funds are released
              await disputeHandler.connect(assistantDR).refuseEscalatedDispute(exchangeId);

              // Available funds should be increased for
              // buyer: price + buyerEscalationDeposit
              // seller: sellerDeposit; note that seller has sellerDeposit in availableFunds from before
              // protocol: 0
              // agent: 0
              expectedBuyerAvailableFunds.funds[0] = new Funds(mockToken.address, "Foreign20", buyerPayoff);
              expectedSellerAvailableFunds.funds[0] = new Funds(
                mockToken.address,
                "Foreign20",
                ethers.BigNumber.from(sellerDeposit).add(sellerPayoff).toString()
              );
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
            });

            context("Offer has an agent", async function () {
              beforeEach(async function () {
                // Create Agent offer
                await offerHandler
                  .connect(assistant)
                  .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id);

                // approve protocol to transfer the tokens
                await mockToken.connect(buyer).approve(protocolDiamond.address, agentOffer.price);
                await mockToken.mint(buyer.address, agentOffer.price);

                // Commit to Offer
                await exchangeHandler.connect(buyer).commitToOffer(buyer.address, agentOffer.id);

                exchangeId = "2";

                // succesfully redeem exchange
                await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

                // raise the dispute
                await disputeHandler.connect(buyer).raiseDispute(exchangeId);

                // expected payoffs
                // buyer: price + buyerEscalationDeposit
                buyerPayoff = ethers.BigNumber.from(offerToken.price).add(buyerEscalationDeposit).toString();

                // seller: sellerDeposit
                sellerPayoff = offerToken.sellerDeposit;

                // protocol: 0
                protocolPayoff = 0;

                // Escalate the dispute
                await mockToken.mint(buyer.address, buyerEscalationDeposit);
                await mockToken.connect(buyer).approve(protocolDiamond.address, buyerEscalationDeposit);
                await disputeHandler.connect(buyer).escalateDispute(exchangeId);
              });

              it("should update state", async function () {
                // Read on chain state
                sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
                buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
                protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
                agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

                // Chain state should match the expected available funds
                expectedSellerAvailableFunds = new FundsList([
                  new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
                ]);
                expectedBuyerAvailableFunds = new FundsList([]);
                expectedProtocolAvailableFunds = new FundsList([]);
                expectedAgentAvailableFunds = new FundsList([]);
                expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
                expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
                expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
                expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

                // Expire the escalated dispute, so the funds are released
                await disputeHandler.connect(assistantDR).refuseEscalatedDispute(exchangeId);

                // Available funds should be increased for
                // buyer: price + buyerEscalationDeposit
                // seller: sellerDeposit;
                // protocol: 0
                // agent: 0
                expectedBuyerAvailableFunds.funds[0] = new Funds(mockToken.address, "Foreign20", buyerPayoff);
                expectedSellerAvailableFunds.funds.push(
                  new Funds(mockToken.address, "Foreign20", ethers.BigNumber.from(sellerPayoff).toString())
                );
                sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
                buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
                protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
                agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
                expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
                expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
                expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
                expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
              });
            });
          }
        );
      });

      context("Changing the protocol fee", async function () {
        beforeEach(async function () {
          // Cast Diamond to IBosonConfigHandler
          configHandler = await ethers.getContractAt("IBosonConfigHandler", protocolDiamond.address);

          // expected payoffs
          // buyer: 0
          buyerPayoff = 0;

          // seller: sellerDeposit + price - protocolFee
          sellerPayoff = ethers.BigNumber.from(offerToken.sellerDeposit)
            .add(offerToken.price)
            .sub(offerTokenProtocolFee)
            .toString();
        });

        it("Protocol fee for existing exchanges should be the same as at the offer creation", async function () {
          // set the new procol fee
          protocolFeePercentage = "300"; // 3%
          await configHandler.connect(deployer).setProtocolFeePercentage(protocolFeePercentage);

          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // succesfully redeem exchange
          await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

          // Complete the exchange, expecting event
          const tx = await exchangeHandler.connect(buyer).completeExchange(exchangeId);
          await expect(tx)
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, buyer.address);

          await expect(tx)
            .to.emit(exchangeHandler, "ProtocolFeeCollected")
            .withArgs(exchangeId, offerToken.exchangeToken, offerTokenProtocolFee, buyer.address);
        });

        it("Protocol fee for new exchanges should be the same as at the offer creation", async function () {
          // set the new procol fee
          protocolFeePercentage = "300"; // 3%
          await configHandler.connect(deployer).setProtocolFeePercentage(protocolFeePercentage);

          // similar as teste before, excpet the commit to offer is done after the procol fee change

          // commit to offer and get the correct exchangeId
          tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id);
          txReceipt = await tx.wait();
          event = getEvent(txReceipt, exchangeHandler, "BuyerCommitted");
          exchangeId = event.exchangeId.toString();

          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // succesfully redeem exchange
          await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

          // Complete the exchange, expecting event
          tx = await exchangeHandler.connect(buyer).completeExchange(exchangeId);
          await expect(tx)
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, buyer.address);

          await expect(tx)
            .to.emit(exchangeHandler, "ProtocolFeeCollected")
            .withArgs(exchangeId, offerToken.exchangeToken, offerTokenProtocolFee, buyer.address);
        });

        context("Offer has an agent", async function () {
          beforeEach(async function () {
            exchangeId = "2";

            // Cast Diamond to IBosonConfigHandler
            configHandler = await ethers.getContractAt("IBosonConfigHandler", protocolDiamond.address);

            // expected payoffs
            // buyer: 0
            buyerPayoff = 0;

            // agentPayoff: agentFee
            agentFee = ethers.BigNumber.from(agentOffer.price).mul(agentFeePercentage).div("10000").toString();
            agentPayoff = agentFee;

            // seller: sellerDeposit + price - protocolFee - agentFee
            sellerPayoff = ethers.BigNumber.from(agentOffer.sellerDeposit)
              .add(agentOffer.price)
              .sub(agentOfferProtocolFee)
              .sub(agentFee)
              .toString();

            // protocol: protocolFee
            protocolPayoff = agentOfferProtocolFee;

            // Create Agent Offer before setting new protocol fee as 3%
            await offerHandler
              .connect(assistant)
              .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id);

            // Commit to Agent Offer
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, agentOffer.id);

            // set the new procol fee
            protocolFeePercentage = "300"; // 3%
            await configHandler.connect(deployer).setProtocolFeePercentage(protocolFeePercentage);
          });

          it("Protocol fee for existing exchanges should be the same as at the agent offer creation", async function () {
            // Set time forward to the offer's voucherRedeemableFrom
            await setNextBlockTimestamp(Number(voucherRedeemableFrom));

            // succesfully redeem exchange
            await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

            // Complete the exchange, expecting event
            const tx = await exchangeHandler.connect(buyer).completeExchange(exchangeId);

            await expect(tx)
              .to.emit(exchangeHandler, "FundsReleased")
              .withArgs(exchangeId, seller.id, agentOffer.exchangeToken, sellerPayoff, buyer.address);

            await expect(tx)
              .to.emit(exchangeHandler, "ProtocolFeeCollected")
              .withArgs(exchangeId, agentOffer.exchangeToken, protocolPayoff, buyer.address);

            await expect(tx)
              .to.emit(exchangeHandler, "FundsReleased")
              .withArgs(exchangeId, agentId, agentOffer.exchangeToken, agentPayoff, buyer.address);
          });

          it("Protocol fee for new exchanges should be the same as at the agent offer creation", async function () {
            // similar as tests before, excpet the commit to offer is done after the protocol fee change

            // top up seller's and buyer's account
            await mockToken.mint(assistant.address, sellerDeposit);
            await mockToken.mint(buyer.address, price);

            // approve protocol to transfer the tokens
            await mockToken.connect(assistant).approve(protocolDiamond.address, sellerDeposit);
            await mockToken.connect(buyer).approve(protocolDiamond.address, price);

            // deposit to seller's pool
            await fundsHandler.connect(assistant).depositFunds(seller.id, mockToken.address, sellerDeposit);

            // commit to offer and get the correct exchangeId
            tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, agentOffer.id);
            txReceipt = await tx.wait();
            event = getEvent(txReceipt, exchangeHandler, "BuyerCommitted");
            exchangeId = event.exchangeId.toString();

            // Set time forward to the offer's voucherRedeemableFrom
            await setNextBlockTimestamp(Number(voucherRedeemableFrom));

            // succesfully redeem exchange
            await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

            // Complete the exchange, expecting event
            tx = await exchangeHandler.connect(buyer).completeExchange(exchangeId);

            // Complete the exchange, expecting event
            await expect(tx)
              .to.emit(exchangeHandler, "FundsReleased")
              .withArgs(exchangeId, seller.id, agentOffer.exchangeToken, sellerPayoff, buyer.address);

            await expect(tx)
              .to.emit(exchangeHandler, "ProtocolFeeCollected")
              .withArgs(exchangeId, agentOffer.exchangeToken, protocolPayoff, buyer.address);

            await expect(tx)
              .to.emit(exchangeHandler, "FundsReleased")
              .withArgs(exchangeId, agentId, agentOffer.exchangeToken, agentPayoff, buyer.address);
          });
        });
      });
    });

    context("👉 releaseFunds() - Sequential commit", async function () {
      let priceDiscoveryContract;
      let resellersAvailableFunds, expectedResellersAvailableFunds;

      before(async function () {
        // Deploy PriceDiscovery contract
        const PriceDiscoveryFactory = await ethers.getContractFactory("PriceDiscovery");
        priceDiscoveryContract = await PriceDiscoveryFactory.deploy();
        await priceDiscoveryContract.deployed();
      });

      // const directions = ["increasing", "constant", "decreasing", "mixed"];
      const directions = ["increasing"];

      let buyerChains;
      beforeEach(async function () {
        buyerChains = {
          increasing: [
            { buyer: buyer1, price: "150" },
            { buyer: buyer2, price: "160" },
            { buyer: buyer3, price: "400" },
          ],
          constant: [
            { buyer: buyer1, price: "100" },
            { buyer: buyer2, price: "100" },
            { buyer: buyer3, price: "100" },
          ],
          decreasing: [
            { buyer: buyer1, price: "90" },
            { buyer: buyer2, price: "85" },
            { buyer: buyer3, price: "50" },
          ],
          mixed: [
            { buyer: buyer1, price: "130" },
            { buyer: buyer2, price: "130" },
            { buyer: buyer3, price: "120" },
          ],
        };
      });

      const fees = [
        {
          protocol: 0,
          royalties: 0,
        },
        {
          protocol: 1000,
          royalties: 0,
        },
        {
          protocol: 0,
          royalties: 600,
        },
        {
          protocol: 300,
          royalties: 400, // less than profit
        },
        {
          protocol: 8500, // ridiculously high
          royalties: 700,
        },
      ];

      directions.forEach((direction) => {
        let bosonVoucherClone;
        let offer;

        context(`Direction: ${direction}`, async function () {
          fees.forEach((fee) => {
            context(`protocol fee: ${fee.protocol / 100}%; royalties: ${fee.royalties / 100}%`, async function () {
              let expectedCloneAddress;
              let voucherOwner, previousPrice;
              let payoutInformation = [];
              let totalRoyalties, totalProtocolFee;

              beforeEach(async function () {
                expectedCloneAddress = calculateContractAddress(accountHandler.address, "1");
                bosonVoucherClone = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);

                // set fees
                await configHandler.setProtocolFeePercentage(fee.protocol);
                await bosonVoucherClone.connect(assistant).setRoyaltyPercentage(fee.royalties);

                offer = offerToken.clone();
                offer.id = "3";
                offer.price = "100";
                offer.sellerDeposit = "10";
                offer.buyerCancelPenalty = "30";

                // approve protocol to transfer the tokens

                // deposit to seller's pool
                await fundsHandler.connect(clerk).withdrawFunds(seller.id, [], []); // withdraw all, so it's easier to test
                await mockToken.connect(assistant).mint(assistant.address, offer.sellerDeposit);
                await mockToken.connect(assistant).approve(fundsHandler.address, offer.sellerDeposit);
                await fundsHandler.connect(assistant).depositFunds(seller.id, mockToken.address, offer.sellerDeposit);

                await offerHandler
                  .connect(assistant)
                  .createOffer(offer, offerDates, offerDurations, disputeResolverId, 0);

                // ids
                exchangeId = "1";
                protocolId = "0";

                // Create buyer with protocol address to not mess up ids in tests
                await accountHandler.createBuyer(mockBuyer(exchangeHandler.address));

                // commit to offer
                await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offer.id);

                // ids
                exchangeId = "1";
                agentId = "3";
                buyerId = 5;

                voucherOwner = buyer; // voucherOwner is the first buyer
                previousPrice = offer.price;
                totalRoyalties = new ethers.BigNumber.from(0);
                totalProtocolFee = new ethers.BigNumber.from(0);
                for (const trade of buyerChains[direction]) {
                  // Prepare calldata for PriceDiscovery contract
                  let order = {
                    seller: voucherOwner.address,
                    buyer: trade.buyer.address,
                    voucherContract: expectedCloneAddress,
                    tokenId: exchangeId,
                    exchangeToken: offer.exchangeToken,
                    price: ethers.BigNumber.from(offer.price).mul(trade.price).div(100),
                  };

                  const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilBuyOrder", [
                    order,
                  ]);

                  const priceDiscovery = new PriceDiscovery(
                    order.price,
                    priceDiscoveryContract.address,
                    priceDiscoveryData,
                    Direction.Buy
                  );

                  // voucher owner approves protocol to transfer the tokens
                  await mockToken.mint(voucherOwner.address, order.price);
                  await mockToken.connect(voucherOwner).approve(protocolDiamond.address, order.price);

                  // Voucher owner approves PriceDiscovery contract to transfer the tokens
                  await bosonVoucherClone.connect(voucherOwner).setApprovalForAll(priceDiscoveryContract.address, true);

                  // Buyer approves protocol to transfer the tokens
                  await mockToken.mint(trade.buyer.address, order.price);
                  await mockToken.connect(trade.buyer).approve(protocolDiamond.address, order.price);

                  // commit to offer
                  await exchangeHandler
                    .connect(trade.buyer)
                    .sequentialCommitToOffer(trade.buyer.address, exchangeId, priceDiscovery, {
                      gasPrice: 0,
                    });

                  // Fees, royalites and immediate payout
                  const royalties = order.price.mul(fee.royalties).div(10000);
                  const protocolFee = order.price.mul(fee.protocol).div(10000);
                  const reducedSecondaryPrice = order.price.sub(royalties).sub(protocolFee);
                  const immediatePayout = reducedSecondaryPrice.lte(previousPrice)
                    ? reducedSecondaryPrice
                    : previousPrice;
                  payoutInformation.push({ buyerId: buyerId++, immediatePayout, reducedSecondaryPrice });

                  // Total royalties and fees
                  totalRoyalties = totalRoyalties.add(royalties);
                  totalProtocolFee = totalProtocolFee.add(protocolFee);

                  voucherOwner = trade.buyer; // last buyer is voucherOwner in next iteration
                  previousPrice = order.price;
                }
              });

              context("Final state COMPLETED", async function () {
                let resellerPayoffs;
                beforeEach(async function () {
                  // Set time forward to the offer's voucherRedeemableFrom
                  await setNextBlockTimestamp(Number(voucherRedeemableFrom));

                  // succesfully redeem exchange
                  await exchangeHandler.connect(voucherOwner).redeemVoucher(exchangeId);

                  // expected payoffs
                  // last buyer: 0

                  // resellers
                  resellerPayoffs = payoutInformation.map((pi) => {
                    return { id: pi.buyerId, payoff: pi.reducedSecondaryPrice.sub(pi.immediatePayout).toString() };
                  });

                  // seller: sellerDeposit + price - protocolFee + royalties
                  const initialFee = applyPercentage(offer.price, fee.protocol);
                  sellerPayoff = ethers.BigNumber.from(offer.sellerDeposit)
                    .add(offer.price)
                    .add(totalRoyalties)
                    .sub(initialFee)
                    .toString();

                  // protocol: protocolFee
                  protocolPayoff = totalProtocolFee.add(initialFee).toString();
                });

                it("should emit a FundsReleased event", async function () {
                  // Complete the exchange, expecting event
                  const tx = await exchangeHandler.connect(voucherOwner).completeExchange(exchangeId);

                  await expect(tx)
                    .to.emit(exchangeHandler, "FundsReleased")
                    .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, voucherOwner.address);

                  for (const resellerPayoff of resellerPayoffs) {
                    if (resellerPayoff.payoff != "0") {
                      await expect(tx)
                        .to.emit(exchangeHandler, "FundsReleased")
                        .withArgs(
                          exchangeId,
                          resellerPayoff.id,
                          offer.exchangeToken,
                          resellerPayoff.payoff,
                          voucherOwner.address
                        );
                    }
                  }

                  if (protocolPayoff != "0") {
                    await expect(tx)
                      .to.emit(exchangeHandler, "ProtocolFeeCollected")
                      .withArgs(exchangeId, offer.exchangeToken, protocolPayoff, voucherOwner.address);
                  } else {
                    await expect(tx).to.not.emit(exchangeHandler, "ProtocolFeeCollected");
                  }
                });

                it("should update state", async function () {
                  // // commit again, so seller has nothing in available funds
                  // await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offer.id);

                  // Read on chain state
                  sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
                  buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
                  protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
                  agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
                  resellersAvailableFunds = (
                    await Promise.all(resellerPayoffs.map((r) => fundsHandler.getAvailableFunds(r.id)))
                  ).map((returnedValue) => FundsList.fromStruct(returnedValue));

                  // Chain state should match the expected available funds
                  expectedSellerAvailableFunds = new FundsList([]);
                  expectedBuyerAvailableFunds = new FundsList([]);
                  expectedProtocolAvailableFunds = new FundsList([]);
                  expectedAgentAvailableFunds = new FundsList([]);
                  expectedResellersAvailableFunds = new Array(resellerPayoffs.length).fill(new FundsList([]));
                  expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
                  expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
                  expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
                  expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
                  expect(resellersAvailableFunds).to.eql(expectedResellersAvailableFunds);

                  // Complete the exchange so the funds are released
                  await exchangeHandler.connect(voucherOwner).completeExchange(exchangeId);

                  // Available funds should be increased for
                  // buyer: 0
                  // seller: sellerDeposit + price - protocolFee - agentFee + royalties
                  // protocol: protocolFee
                  // agent: 0
                  expectedSellerAvailableFunds.funds.push(new Funds(mockToken.address, "Foreign20", sellerPayoff));
                  if (protocolPayoff != "0") {
                    expectedProtocolAvailableFunds.funds.push(
                      new Funds(mockToken.address, "Foreign20", protocolPayoff)
                    );
                  }
                  expectedResellersAvailableFunds = resellerPayoffs.map((r) => {
                    return new FundsList(r.payoff != "0" ? [new Funds(mockToken.address, "Foreign20", r.payoff)] : []);
                  });

                  sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
                  buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
                  protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
                  agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
                  resellersAvailableFunds = (
                    await Promise.all(resellerPayoffs.map((r) => fundsHandler.getAvailableFunds(r.id)))
                  ).map((returnedValue) => FundsList.fromStruct(returnedValue));

                  expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
                  expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
                  expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
                  expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
                  expect(resellersAvailableFunds).to.eql(expectedResellersAvailableFunds);
                });
              });
            });
          });
        });
      });

      context("Final state REVOKED", async function () {
        beforeEach(async function () {
          // expected payoffs
          // buyer: sellerDeposit + price
          buyerPayoff = ethers.BigNumber.from(offerToken.sellerDeposit).add(offerToken.price).toString();

          // seller: 0
          sellerPayoff = 0;

          // protocol: 0
          protocolPayoff = 0;
        });

        it("should emit a FundsReleased event", async function () {
          // Revoke the voucher, expecting event
          await expect(exchangeHandler.connect(assistant).revokeVoucher(exchangeId))
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, assistant.address);
        });

        it("should update state", async function () {
          // Read on chain state
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
          agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

          // Chain state should match the expected available funds
          expectedSellerAvailableFunds = new FundsList([
            new Funds(mockToken.address, "Foreign20", sellerDeposit),
            new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
          ]);
          expectedBuyerAvailableFunds = new FundsList([]);
          expectedProtocolAvailableFunds = new FundsList([]);
          expectedAgentAvailableFunds = new FundsList([]);
          expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
          expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
          expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
          expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

          // Revoke the voucher so the funds are released
          await exchangeHandler.connect(assistant).revokeVoucher(exchangeId);

          // Available funds should be increased for
          // buyer: sellerDeposit + price
          // seller: 0
          // protocol: 0
          // agent: 0
          expectedBuyerAvailableFunds.funds.push(new Funds(mockToken.address, "Foreign20", buyerPayoff));
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
          agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
          expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
          expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
          expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
          expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

          // Test that if buyer has some funds available, and gets more, the funds are only updated
          // Commit again
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id);

          // Revoke another voucher
          await exchangeHandler.connect(assistant).revokeVoucher(++exchangeId);

          // Available funds should be increased for
          // buyer: sellerDeposit + price
          // seller: 0; but during the commitToOffer, sellerDeposit is encumbered
          // protocol: 0
          // agent: 0
          expectedBuyerAvailableFunds.funds[0] = new Funds(
            mockToken.address,
            "Foreign20",
            ethers.BigNumber.from(buyerPayoff).mul(2).toString()
          );
          expectedSellerAvailableFunds = new FundsList([
            new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
          ]);
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
          agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
          expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
          expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
          expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
          expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
        });

        context("Offer has an agent", async function () {
          beforeEach(async function () {
            // Create Agent offer
            await offerHandler
              .connect(assistant)
              .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id);

            // top up seller's and buyer's account
            await mockToken.mint(assistant.address, `${2 * sellerDeposit}`);
            await mockToken.mint(buyer.address, `${2 * price}`);

            // approve protocol to transfer the tokens
            await mockToken.connect(assistant).approve(protocolDiamond.address, `${2 * sellerDeposit}`);
            await mockToken.connect(buyer).approve(protocolDiamond.address, `${2 * price}`);

            // deposit to seller's pool
            await fundsHandler.connect(assistant).depositFunds(seller.id, mockToken.address, `${2 * sellerDeposit}`);

            // Commit to Offer
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, agentOffer.id);

            // expected payoffs
            // buyer: sellerDeposit + price
            buyerPayoff = ethers.BigNumber.from(agentOffer.sellerDeposit).add(agentOffer.price).toString();

            // seller: 0
            sellerPayoff = 0;

            // protocol: 0
            protocolPayoff = 0;

            // agent: 0
            agentPayoff = 0;

            exchangeId = "2";
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(mockToken.address, "Foreign20", `${2 * sellerDeposit}`),
              new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
            ]);
            expectedBuyerAvailableFunds = new FundsList([]);
            expectedProtocolAvailableFunds = new FundsList([]);
            expectedAgentAvailableFunds = new FundsList([]);
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

            // Revoke the voucher so the funds are released
            await exchangeHandler.connect(assistant).revokeVoucher(exchangeId);

            // Available funds should be increased for
            // buyer: sellerDeposit + price
            // seller: 0
            // protocol: 0
            // agent: 0
            expectedBuyerAvailableFunds.funds.push(new Funds(mockToken.address, "Foreign20", buyerPayoff));
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

            // Test that if buyer has some funds available, and gets more, the funds are only updated
            // Commit again
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, agentOffer.id);

            // Revoke another voucher
            await exchangeHandler.connect(assistant).revokeVoucher(++exchangeId);

            // Available funds should be increased for
            // buyer: sellerDeposit + price
            // seller: 0; but during the commitToOffer, sellerDeposit is encumbered
            // protocol: 0
            // agent: 0
            expectedBuyerAvailableFunds.funds[0] = new Funds(
              mockToken.address,
              "Foreign20",
              ethers.BigNumber.from(buyerPayoff).mul(2).toString()
            );
            expectedSellerAvailableFunds = new FundsList([
              new Funds(mockToken.address, "Foreign20", `${sellerDeposit}`),
              new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
            ]);
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
          });
        });
      });

      context("Final state CANCELED", async function () {
        beforeEach(async function () {
          // expected payoffs
          // buyer: price - buyerCancelPenalty
          buyerPayoff = ethers.BigNumber.from(offerToken.price).sub(offerToken.buyerCancelPenalty).toString();

          // seller: sellerDeposit + buyerCancelPenalty
          sellerPayoff = ethers.BigNumber.from(offerToken.sellerDeposit).add(offerToken.buyerCancelPenalty).toString();

          // protocol: 0
          protocolPayoff = 0;
        });

        it("should emit a FundsReleased event", async function () {
          // Cancel the voucher, expecting event
          const tx = await exchangeHandler.connect(buyer).cancelVoucher(exchangeId);
          await expect(tx)
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, buyer.address);

          await expect(tx)
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, buyer.address);

          await expect(tx).to.not.emit(exchangeHandler, "ProtocolFeeCollected");
        });

        it("should update state", async function () {
          // Read on chain state
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
          agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

          // Chain state should match the expected available funds
          expectedSellerAvailableFunds = new FundsList([
            new Funds(mockToken.address, "Foreign20", sellerDeposit),
            new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
          ]);
          expectedBuyerAvailableFunds = new FundsList([]);
          expectedProtocolAvailableFunds = new FundsList([]);
          expectedAgentAvailableFunds = new FundsList([]);
          expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
          expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
          expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
          expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

          // Cancel the voucher, so the funds are released
          await exchangeHandler.connect(buyer).cancelVoucher(exchangeId);

          // Available funds should be increased for
          // buyer: price - buyerCancelPenalty
          // seller: sellerDeposit + buyerCancelPenalty; note that seller has sellerDeposit in availableFunds from before
          // protocol: 0
          // agent: 0
          expectedSellerAvailableFunds.funds[0] = new Funds(
            mockToken.address,
            "Foreign20",
            ethers.BigNumber.from(sellerDeposit).add(sellerPayoff).toString()
          );
          expectedBuyerAvailableFunds.funds.push(new Funds(mockToken.address, "Foreign20", buyerPayoff));
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
          agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
          expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
          expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
          expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
          expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
        });

        context("Offer has an agent", async function () {
          beforeEach(async function () {
            // Create Agent offer
            await offerHandler
              .connect(assistant)
              .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id);

            // top up seller's and buyer's account
            await mockToken.mint(assistant.address, `${2 * sellerDeposit}`);
            await mockToken.mint(buyer.address, `${2 * price}`);

            // approve protocol to transfer the tokens
            await mockToken.connect(assistant).approve(protocolDiamond.address, `${2 * sellerDeposit}`);
            await mockToken.connect(buyer).approve(protocolDiamond.address, `${2 * price}`);

            // deposit to seller's pool
            await fundsHandler.connect(assistant).depositFunds(seller.id, mockToken.address, `${sellerDeposit}`);

            // Commit to Offer
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, agentOffer.id);

            // expected payoffs
            // buyer: price - buyerCancelPenalty
            buyerPayoff = ethers.BigNumber.from(agentOffer.price).sub(agentOffer.buyerCancelPenalty).toString();

            // seller: sellerDeposit + buyerCancelPenalty
            sellerPayoff = ethers.BigNumber.from(agentOffer.sellerDeposit)
              .add(agentOffer.buyerCancelPenalty)
              .toString();

            // protocol: 0
            protocolPayoff = 0;

            // agent: 0
            agentPayoff = 0;

            exchangeId = "2";
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(mockToken.address, "Foreign20", sellerDeposit),
              new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
            ]);
            expectedBuyerAvailableFunds = new FundsList([]);
            expectedProtocolAvailableFunds = new FundsList([]);
            expectedAgentAvailableFunds = new FundsList([]);
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

            // Cancel the voucher, so the funds are released
            await exchangeHandler.connect(buyer).cancelVoucher(exchangeId);

            // Available funds should be increased for
            // buyer: price - buyerCancelPenalty
            // seller: sellerDeposit + buyerCancelPenalty; note that seller has sellerDeposit in availableFunds from before
            // protocol: 0
            // agent: 0
            expectedSellerAvailableFunds.funds[0] = new Funds(
              mockToken.address,
              "Foreign20",
              ethers.BigNumber.from(sellerDeposit).add(sellerPayoff).toString()
            );
            expectedBuyerAvailableFunds.funds.push(new Funds(mockToken.address, "Foreign20", buyerPayoff));
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
          });
        });
      });

      context("Final state DISPUTED", async function () {
        beforeEach(async function () {
          // ProtocolInitializationHandlerFacet has to be passed to deploy function works
          const facetsToDeploy = await getFacetsWithArgs(["DisputeHandlerFacet"]);

          await deployAndCutFacets(
            protocolDiamond.address,
            facetsToDeploy,
            maxPriorityFeePerGas,
            "2.1.0",
            protocolInitializationFacet
          );

          // Cast Diamond to IBosonDisputeHandler
          disputeHandler = await ethers.getContractAt("IBosonDisputeHandler", protocolDiamond.address);

          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // succesfully redeem exchange
          await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

          // raise the dispute
          tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Get the block timestamp of the confirmed tx and set disputedDate
          blockNumber = tx.blockNumber;
          block = await ethers.provider.getBlock(blockNumber);
          disputedDate = block.timestamp.toString();
          timeout = ethers.BigNumber.from(disputedDate).add(resolutionPeriod).toString();
        });

        context("Final state DISPUTED - RETRACTED", async function () {
          beforeEach(async function () {
            // expected payoffs
            // buyer: 0
            buyerPayoff = 0;

            // seller: sellerDeposit + price - protocolFee
            sellerPayoff = ethers.BigNumber.from(offerToken.sellerDeposit)
              .add(offerToken.price)
              .sub(offerTokenProtocolFee)
              .toString();

            // protocol: 0
            protocolPayoff = offerTokenProtocolFee;
          });

          it("should emit a FundsReleased event", async function () {
            // Retract from the dispute, expecting event
            const tx = await disputeHandler.connect(buyer).retractDispute(exchangeId);

            await expect(tx)
              .to.emit(disputeHandler, "ProtocolFeeCollected")
              .withArgs(exchangeId, offerToken.exchangeToken, protocolPayoff, buyer.address);

            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, buyer.address);

            //check that FundsReleased event was NOT emitted with buyer Id
            const txReceipt = await tx.wait();
            const match = eventEmittedWithArgs(txReceipt, disputeHandler, "FundsReleased", [
              exchangeId,
              buyerId,
              offerToken.exchangeToken,
              buyerPayoff,
              buyer.address,
            ]);
            expect(match).to.be.false;
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(mockToken.address, "Foreign20", sellerDeposit),
              new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
            ]);
            expectedBuyerAvailableFunds = new FundsList([]);
            expectedProtocolAvailableFunds = new FundsList([]);
            expectedAgentAvailableFunds = new FundsList([]);
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

            // Retract from the dispute, so the funds are released
            await disputeHandler.connect(buyer).retractDispute(exchangeId);

            // Available funds should be increased for
            // buyer: 0
            // seller: sellerDeposit + price - protocol fee; note that seller has sellerDeposit in availableFunds from before
            // protocol: protocolFee
            // agent: 0
            expectedSellerAvailableFunds.funds[0] = new Funds(
              mockToken.address,
              "Foreign20",
              ethers.BigNumber.from(sellerDeposit).add(sellerPayoff).toString()
            );
            expectedProtocolAvailableFunds.funds[0] = new Funds(mockToken.address, "Foreign20", protocolPayoff);
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
          });

          context("Offer has an agent", async function () {
            beforeEach(async function () {
              // expected payoffs
              // buyer: 0
              buyerPayoff = 0;

              // agentPayoff: agentFee
              agentFee = ethers.BigNumber.from(agentOffer.price).mul(agentFeePercentage).div("10000").toString();
              agentPayoff = agentFee;

              // seller: sellerDeposit + price - protocolFee - agentFee
              sellerPayoff = ethers.BigNumber.from(agentOffer.sellerDeposit)
                .add(agentOffer.price)
                .sub(agentOfferProtocolFee)
                .sub(agentFee)
                .toString();

              // protocol: 0
              protocolPayoff = agentOfferProtocolFee;

              // Exchange id
              exchangeId = "2";
              await offerHandler
                .connect(assistant)
                .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id);
              await exchangeHandler.connect(buyer).commitToOffer(buyer.address, agentOffer.id);

              // succesfully redeem exchange
              await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

              // raise the dispute
              await disputeHandler.connect(buyer).raiseDispute(exchangeId);
            });

            it("should emit a FundsReleased event", async function () {
              // Retract from the dispute, expecting event
              const tx = await disputeHandler.connect(buyer).retractDispute(exchangeId);

              await expect(tx)
                .to.emit(disputeHandler, "ProtocolFeeCollected")
                .withArgs(exchangeId, offerToken.exchangeToken, protocolPayoff, buyer.address);

              await expect(tx)
                .to.emit(disputeHandler, "FundsReleased")
                .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, buyer.address);

              await expect(tx)
                .to.emit(exchangeHandler, "FundsReleased")
                .withArgs(exchangeId, agentId, agentOffer.exchangeToken, agentPayoff, buyer.address);
            });

            it("should update state", async function () {
              // Read on chain state
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

              // Chain state should match the expected available funds
              expectedSellerAvailableFunds = new FundsList([
                new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
              ]);
              expectedBuyerAvailableFunds = new FundsList([]);
              expectedProtocolAvailableFunds = new FundsList([]);
              expectedAgentAvailableFunds = new FundsList([]);
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

              // Retract from the dispute, so the funds are released
              await disputeHandler.connect(buyer).retractDispute(exchangeId);

              // Available funds should be increased for
              // buyer: 0
              // seller: sellerDeposit + price - protocol fee - agentFee;
              // protocol: protocolFee
              // agent: agentFee
              expectedSellerAvailableFunds.funds.push(
                new Funds(mockToken.address, "Foreign20", ethers.BigNumber.from(sellerPayoff).toString())
              );
              expectedProtocolAvailableFunds.funds[0] = new Funds(mockToken.address, "Foreign20", protocolPayoff);
              expectedAgentAvailableFunds.funds.push(new Funds(mockToken.address, "Foreign20", agentPayoff));
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
            });
          });
        });

        context("Final state DISPUTED - RETRACTED via expireDispute", async function () {
          beforeEach(async function () {
            // expected payoffs
            // buyer: 0
            buyerPayoff = 0;

            // seller: sellerDeposit + price - protocolFee
            sellerPayoff = ethers.BigNumber.from(offerToken.sellerDeposit)
              .add(offerToken.price)
              .sub(offerTokenProtocolFee)
              .toString();

            // protocol: protocolFee
            protocolPayoff = offerTokenProtocolFee;

            await setNextBlockTimestamp(Number(timeout));
          });

          it("should emit a FundsReleased event", async function () {
            // Expire the dispute, expecting event
            const tx = await disputeHandler.connect(rando).expireDispute(exchangeId);
            await expect(tx)
              .to.emit(disputeHandler, "ProtocolFeeCollected")
              .withArgs(exchangeId, offerToken.exchangeToken, protocolPayoff, rando.address);

            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, rando.address);

            //check that FundsReleased event was NOT emitted with buyer Id
            const txReceipt = await tx.wait();
            const match = eventEmittedWithArgs(txReceipt, disputeHandler, "FundsReleased", [
              exchangeId,
              buyerId,
              offerToken.exchangeToken,
              buyerPayoff,
              rando.address,
            ]);
            expect(match).to.be.false;
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(mockToken.address, "Foreign20", sellerDeposit),
              new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
            ]);
            expectedBuyerAvailableFunds = new FundsList([]);
            expectedProtocolAvailableFunds = new FundsList([]);
            expectedAgentAvailableFunds = new FundsList([]);
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

            // Expire the dispute, so the funds are released
            await disputeHandler.connect(rando).expireDispute(exchangeId);

            // Available funds should be increased for
            // buyer: 0
            // seller: sellerDeposit + price - protocol fee; note that seller has sellerDeposit in availableFunds from before
            // protocol: protocolFee
            // agent: 0
            expectedSellerAvailableFunds.funds[0] = new Funds(
              mockToken.address,
              "Foreign20",
              ethers.BigNumber.from(sellerDeposit).add(sellerPayoff).toString()
            );
            expectedProtocolAvailableFunds.funds[0] = new Funds(mockToken.address, "Foreign20", protocolPayoff);
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
          });

          context("Offer has an agent", async function () {
            beforeEach(async function () {
              // Create Agent offer
              await offerHandler
                .connect(assistant)
                .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id);

              // Commit to Offer
              await exchangeHandler.connect(buyer).commitToOffer(buyer.address, agentOffer.id);

              // expected payoffs
              // buyer: 0
              buyerPayoff = 0;

              // agentPayoff: agentFee
              agentFee = ethers.BigNumber.from(agentOffer.price).mul(agentFeePercentage).div("10000").toString();
              agentPayoff = agentFee;

              // seller: sellerDeposit + price - protocolFee - agent fee
              sellerPayoff = ethers.BigNumber.from(agentOffer.sellerDeposit)
                .add(agentOffer.price)
                .sub(agentOfferProtocolFee)
                .sub(agentFee)
                .toString();

              // protocol: protocolFee
              protocolPayoff = agentOfferProtocolFee;

              // Exchange id
              exchangeId = "2";

              // succesfully redeem exchange
              await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

              // raise the dispute
              tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

              // Get the block timestamp of the confirmed tx and set disputedDate
              blockNumber = tx.blockNumber;
              block = await ethers.provider.getBlock(blockNumber);
              disputedDate = block.timestamp.toString();
              timeout = ethers.BigNumber.from(disputedDate).add(resolutionPeriod).toString();

              await setNextBlockTimestamp(Number(timeout));
            });

            it("should emit a FundsReleased event", async function () {
              // Expire the dispute, expecting event
              const tx = await disputeHandler.connect(rando).expireDispute(exchangeId);

              // Complete the exchange, expecting event
              await expect(tx)
                .to.emit(exchangeHandler, "FundsReleased")
                .withArgs(exchangeId, agentId, agentOffer.exchangeToken, agentPayoff, rando.address);

              await expect(tx)
                .to.emit(exchangeHandler, "FundsReleased")
                .withArgs(exchangeId, seller.id, agentOffer.exchangeToken, sellerPayoff, rando.address);

              await expect(tx)
                .to.emit(exchangeHandler, "ProtocolFeeCollected")
                .withArgs(exchangeId, agentOffer.exchangeToken, protocolPayoff, rando.address);
            });

            it("should update state", async function () {
              // Read on chain state
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

              // Chain state should match the expected available funds
              expectedSellerAvailableFunds = new FundsList([
                new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
              ]);
              expectedBuyerAvailableFunds = new FundsList([]);
              expectedProtocolAvailableFunds = new FundsList([]);
              expectedAgentAvailableFunds = new FundsList([]);
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

              // Expire the dispute, so the funds are released
              await disputeHandler.connect(rando).expireDispute(exchangeId);

              // Available funds should be increased for
              // buyer: 0
              // seller: sellerDeposit + price - protocol fee - agent fee;
              // protocol: protocolFee
              // agent: agent fee
              expectedSellerAvailableFunds = new FundsList([
                new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
                new Funds(mockToken.address, "Foreign20", sellerPayoff),
              ]);

              expectedProtocolAvailableFunds.funds[0] = new Funds(mockToken.address, "Foreign20", protocolPayoff);
              expectedAgentAvailableFunds.funds[0] = new Funds(mockToken.address, "Foreign20", agentPayoff);
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
            });
          });
        });

        context("Final state DISPUTED - RESOLVED", async function () {
          beforeEach(async function () {
            buyerPercentBasisPoints = "5566"; // 55.66%

            // expected payoffs
            // buyer: (price + sellerDeposit)*buyerPercentage
            buyerPayoff = ethers.BigNumber.from(offerToken.price)
              .add(offerToken.sellerDeposit)
              .mul(buyerPercentBasisPoints)
              .div("10000")
              .toString();

            // seller: (price + sellerDeposit)*(1-buyerPercentage)
            sellerPayoff = ethers.BigNumber.from(offerToken.price)
              .add(offerToken.sellerDeposit)
              .sub(buyerPayoff)
              .toString();

            // protocol: 0
            protocolPayoff = 0;

            // Set the message Type, needed for signature
            resolutionType = [
              { name: "exchangeId", type: "uint256" },
              { name: "buyerPercentBasisPoints", type: "uint256" },
            ];

            customSignatureType = {
              Resolution: resolutionType,
            };

            message = {
              exchangeId: exchangeId,
              buyerPercentBasisPoints,
            };

            // Collect the signature components
            ({ r, s, v } = await prepareDataSignatureParameters(
              buyer, // Assistant is the caller, seller should be the signer.
              customSignatureType,
              "Resolution",
              message,
              disputeHandler.address
            ));
          });

          it("should emit a FundsReleased event", async function () {
            // Resolve the dispute, expecting event
            const tx = await disputeHandler
              .connect(assistant)
              .resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v);
            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, assistant.address);

            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, assistant.address);

            await expect(tx).to.not.emit(disputeHandler, "ProtocolFeeCollected");
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(mockToken.address, "Foreign20", sellerDeposit),
              new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
            ]);
            expectedBuyerAvailableFunds = new FundsList([]);
            expectedProtocolAvailableFunds = new FundsList([]);
            expectedAgentAvailableFunds = new FundsList([]);
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

            // Resolve the dispute, so the funds are released
            await disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v);

            // Available funds should be increased for
            // buyer: (price + sellerDeposit)*buyerPercentage
            // seller: (price + sellerDeposit)*(1-buyerPercentage); note that seller has sellerDeposit in availableFunds from before
            // protocol: 0
            // agent: 0
            expectedSellerAvailableFunds.funds[0] = new Funds(
              mockToken.address,
              "Foreign20",
              ethers.BigNumber.from(sellerDeposit).add(sellerPayoff).toString()
            );
            expectedBuyerAvailableFunds = new FundsList([new Funds(mockToken.address, "Foreign20", buyerPayoff)]);
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
          });

          context("Offer has an agent", async function () {
            beforeEach(async function () {
              // Create Agent offer
              await offerHandler
                .connect(assistant)
                .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id);

              // Commit to Offer
              await exchangeHandler.connect(buyer).commitToOffer(buyer.address, agentOffer.id);

              exchangeId = "2";

              // succesfully redeem exchange
              await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

              // raise the dispute
              await disputeHandler.connect(buyer).raiseDispute(exchangeId);

              buyerPercentBasisPoints = "5566"; // 55.66%

              // expected payoffs
              // buyer: (price + sellerDeposit)*buyerPercentage
              buyerPayoff = ethers.BigNumber.from(agentOffer.price)
                .add(agentOffer.sellerDeposit)
                .mul(buyerPercentBasisPoints)
                .div("10000")
                .toString();

              // seller: (price + sellerDeposit)*(1-buyerPercentage)
              sellerPayoff = ethers.BigNumber.from(agentOffer.price)
                .add(agentOffer.sellerDeposit)
                .sub(buyerPayoff)
                .toString();

              // protocol: 0
              protocolPayoff = 0;

              // Set the message Type, needed for signature
              resolutionType = [
                { name: "exchangeId", type: "uint256" },
                { name: "buyerPercentBasisPoints", type: "uint256" },
              ];

              customSignatureType = {
                Resolution: resolutionType,
              };

              message = {
                exchangeId: exchangeId,
                buyerPercentBasisPoints,
              };

              // Collect the signature components
              ({ r, s, v } = await prepareDataSignatureParameters(
                buyer, // Assistant is the caller, seller should be the signer.
                customSignatureType,
                "Resolution",
                message,
                disputeHandler.address
              ));
            });

            it("should update state", async function () {
              // Read on chain state
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

              // Chain state should match the expected available funds
              expectedSellerAvailableFunds = new FundsList([
                new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
              ]);
              expectedBuyerAvailableFunds = new FundsList([]);
              expectedProtocolAvailableFunds = new FundsList([]);
              expectedAgentAvailableFunds = new FundsList([]);
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

              // Resolve the dispute, so the funds are released
              await disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v);

              // Available funds should be increased for
              // buyer: (price + sellerDeposit)*buyerPercentage
              // seller: (price + sellerDeposit)*(1-buyerPercentage);
              // protocol: 0
              // agent: 0
              expectedSellerAvailableFunds.funds.push(
                new Funds(mockToken.address, "Foreign20", ethers.BigNumber.from(sellerPayoff).toString())
              );
              expectedBuyerAvailableFunds = new FundsList([new Funds(mockToken.address, "Foreign20", buyerPayoff)]);
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
            });
          });
        });

        context("Final state DISPUTED - ESCALATED - RETRACTED", async function () {
          beforeEach(async function () {
            // expected payoffs
            // buyer: 0
            buyerPayoff = 0;

            // seller: sellerDeposit + price - protocolFee + buyerEscalationDeposit
            sellerPayoff = ethers.BigNumber.from(offerToken.sellerDeposit)
              .add(offerToken.price)
              .sub(offerTokenProtocolFee)
              .add(buyerEscalationDeposit)
              .toString();

            // protocol: 0
            protocolPayoff = offerTokenProtocolFee;

            // Escalate the dispute
            await disputeHandler.connect(buyer).escalateDispute(exchangeId);
          });

          it("should emit a FundsReleased event", async function () {
            // Retract from the dispute, expecting event
            const tx = await disputeHandler.connect(buyer).retractDispute(exchangeId);

            await expect(tx)
              .to.emit(disputeHandler, "ProtocolFeeCollected")
              .withArgs(exchangeId, offerToken.exchangeToken, protocolPayoff, buyer.address);

            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, buyer.address);

            //check that FundsReleased event was NOT emitted with buyer Id
            const txReceipt = await tx.wait();
            const match = eventEmittedWithArgs(txReceipt, disputeHandler, "FundsReleased", [
              exchangeId,
              buyerId,
              offerToken.exchangeToken,
              buyerPayoff,
              buyer.address,
            ]);
            expect(match).to.be.false;
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(mockToken.address, "Foreign20", sellerDeposit),
              new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
            ]);
            expectedBuyerAvailableFunds = new FundsList([]);
            expectedProtocolAvailableFunds = new FundsList([]);
            expectedAgentAvailableFunds = new FundsList([]);
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

            // Retract from the dispute, so the funds are released
            await disputeHandler.connect(buyer).retractDispute(exchangeId);

            // Available funds should be increased for
            // buyer: 0
            // seller: sellerDeposit + price - protocol fee + buyerEscalationDeposit; note that seller has sellerDeposit in availableFunds from before
            // protocol: protocolFee
            // agent: 0
            expectedSellerAvailableFunds.funds[0] = new Funds(
              mockToken.address,
              "Foreign20",
              ethers.BigNumber.from(sellerDeposit).add(sellerPayoff).toString()
            );
            expectedProtocolAvailableFunds.funds[0] = new Funds(mockToken.address, "Foreign20", protocolPayoff);
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
          });

          context("Offer has an agent", async function () {
            beforeEach(async function () {
              // expected payoffs
              // buyer: 0
              buyerPayoff = 0;

              // agentPayoff: agentFee
              agentFee = ethers.BigNumber.from(agentOffer.price).mul(agentFeePercentage).div("10000").toString();
              agentPayoff = agentFee;

              // seller: sellerDeposit + price - protocolFee - agentFee + buyerEscalationDeposit
              sellerPayoff = ethers.BigNumber.from(agentOffer.sellerDeposit)
                .add(agentOffer.price)
                .sub(agentOfferProtocolFee)
                .sub(agentFee)
                .add(buyerEscalationDeposit)
                .toString();

              // protocol: 0
              protocolPayoff = agentOfferProtocolFee;

              // Exchange id
              exchangeId = "2";
              await offerHandler
                .connect(assistant)
                .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id);

              // approve protocol to transfer the tokens
              await mockToken.connect(buyer).approve(protocolDiamond.address, agentOffer.price);
              await mockToken.mint(buyer.address, agentOffer.price);
              await exchangeHandler.connect(buyer).commitToOffer(buyer.address, agentOffer.id);

              // succesfully redeem exchange
              await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

              // raise the dispute
              await disputeHandler.connect(buyer).raiseDispute(exchangeId);

              // escalate the dispute
              await mockToken.mint(buyer.address, buyerEscalationDeposit);
              await mockToken.connect(buyer).approve(protocolDiamond.address, buyerEscalationDeposit);
              await disputeHandler.connect(buyer).escalateDispute(exchangeId);
            });

            it("should update state", async function () {
              // Read on chain state
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

              // Chain state should match the expected available funds
              expectedSellerAvailableFunds = new FundsList([
                new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
              ]);
              expectedBuyerAvailableFunds = new FundsList([]);
              expectedProtocolAvailableFunds = new FundsList([]);
              expectedAgentAvailableFunds = new FundsList([]);
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

              // Retract from the dispute, so the funds are released
              await disputeHandler.connect(buyer).retractDispute(exchangeId);

              // Available funds should be increased for
              // buyer: 0
              // seller: sellerDeposit + price - protocol fee - agentFee  + buyerEscalationDeposit;
              // protocol: protocolFee
              // agent: agentFee
              expectedSellerAvailableFunds.funds.push(
                new Funds(mockToken.address, "Foreign20", ethers.BigNumber.from(sellerPayoff).toString())
              );
              expectedProtocolAvailableFunds.funds[0] = new Funds(mockToken.address, "Foreign20", protocolPayoff);
              expectedAgentAvailableFunds.funds.push(new Funds(mockToken.address, "Foreign20", agentPayoff));
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
            });
          });
        });

        context("Final state DISPUTED - ESCALATED - RESOLVED", async function () {
          beforeEach(async function () {
            buyerPercentBasisPoints = "5566"; // 55.66%

            // expected payoffs
            // buyer: (price + sellerDeposit + buyerEscalationDeposit)*buyerPercentage
            buyerPayoff = ethers.BigNumber.from(offerToken.price)
              .add(offerToken.sellerDeposit)
              .add(buyerEscalationDeposit)
              .mul(buyerPercentBasisPoints)
              .div("10000")
              .toString();

            // seller: (price + sellerDeposit + buyerEscalationDeposit)*(1-buyerPercentage)
            sellerPayoff = ethers.BigNumber.from(offerToken.price)
              .add(offerToken.sellerDeposit)
              .add(buyerEscalationDeposit)
              .sub(buyerPayoff)
              .toString();

            // protocol: 0
            protocolPayoff = 0;

            // Set the message Type, needed for signature
            resolutionType = [
              { name: "exchangeId", type: "uint256" },
              { name: "buyerPercentBasisPoints", type: "uint256" },
            ];

            customSignatureType = {
              Resolution: resolutionType,
            };

            message = {
              exchangeId: exchangeId,
              buyerPercentBasisPoints,
            };

            // Collect the signature components
            ({ r, s, v } = await prepareDataSignatureParameters(
              buyer, // Assistant is the caller, seller should be the signer.
              customSignatureType,
              "Resolution",
              message,
              disputeHandler.address
            ));

            // Escalate the dispute
            await disputeHandler.connect(buyer).escalateDispute(exchangeId);
          });

          it("should emit a FundsReleased event", async function () {
            // Resolve the dispute, expecting event
            const tx = await disputeHandler
              .connect(assistant)
              .resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v);
            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, assistant.address);

            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, assistant.address);

            await expect(tx).to.not.emit(disputeHandler, "ProtocolFeeCollected");
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(mockToken.address, "Foreign20", sellerDeposit),
              new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
            ]);
            expectedBuyerAvailableFunds = new FundsList([]);
            expectedProtocolAvailableFunds = new FundsList([]);
            expectedAgentAvailableFunds = new FundsList([]);
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

            // Resolve the dispute, so the funds are released
            await disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v);

            // Available funds should be increased for
            // buyer: (price + sellerDeposit + buyerEscalationDeposit)*buyerPercentage
            // seller: (price + sellerDeposit + buyerEscalationDeposit)*(1-buyerPercentage); note that seller has sellerDeposit in availableFunds from before
            // protocol: 0
            // agent: 0
            expectedBuyerAvailableFunds.funds[0] = new Funds(mockToken.address, "Foreign20", buyerPayoff);
            expectedSellerAvailableFunds.funds[0] = new Funds(
              mockToken.address,
              "Foreign20",
              ethers.BigNumber.from(sellerDeposit).add(sellerPayoff).toString()
            );
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
          });

          context("Offer has an agent", async function () {
            beforeEach(async function () {
              // Create Agent offer
              await offerHandler
                .connect(assistant)
                .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id);

              // approve protocol to transfer the tokens
              await mockToken.connect(buyer).approve(protocolDiamond.address, agentOffer.price);
              await mockToken.mint(buyer.address, agentOffer.price);

              // Commit to Offer
              await exchangeHandler.connect(buyer).commitToOffer(buyer.address, agentOffer.id);

              exchangeId = "2";

              // succesfully redeem exchange
              await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

              // raise the dispute
              await disputeHandler.connect(buyer).raiseDispute(exchangeId);

              buyerPercentBasisPoints = "5566"; // 55.66%

              // expected payoffs
              // buyer: (price + sellerDeposit + buyerEscalationDeposit)*buyerPercentage
              buyerPayoff = ethers.BigNumber.from(agentOffer.price)
                .add(agentOffer.sellerDeposit)
                .add(buyerEscalationDeposit)
                .mul(buyerPercentBasisPoints)
                .div("10000")
                .toString();

              // seller: (price + sellerDeposit + buyerEscalationDeposit)*(1-buyerPercentage)
              sellerPayoff = ethers.BigNumber.from(agentOffer.price)
                .add(agentOffer.sellerDeposit)
                .add(buyerEscalationDeposit)
                .sub(buyerPayoff)
                .toString();

              // protocol: 0
              protocolPayoff = 0;

              // Set the message Type, needed for signature
              resolutionType = [
                { name: "exchangeId", type: "uint256" },
                { name: "buyerPercentBasisPoints", type: "uint256" },
              ];

              customSignatureType = {
                Resolution: resolutionType,
              };

              message = {
                exchangeId: exchangeId,
                buyerPercentBasisPoints,
              };

              // Collect the signature components
              ({ r, s, v } = await prepareDataSignatureParameters(
                buyer, // Assistant is the caller, seller should be the signer.
                customSignatureType,
                "Resolution",
                message,
                disputeHandler.address
              ));

              // escalate the dispute
              await mockToken.mint(buyer.address, buyerEscalationDeposit);
              await mockToken.connect(buyer).approve(protocolDiamond.address, buyerEscalationDeposit);
              await disputeHandler.connect(buyer).escalateDispute(exchangeId);
            });

            it("should update state", async function () {
              // Read on chain state
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

              // Chain state should match the expected available funds
              expectedSellerAvailableFunds = new FundsList([
                new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
              ]);
              expectedBuyerAvailableFunds = new FundsList([]);
              expectedProtocolAvailableFunds = new FundsList([]);
              expectedAgentAvailableFunds = new FundsList([]);
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

              // Resolve the dispute, so the funds are released
              await disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v);

              // Available funds should be increased for
              // buyer: (price + sellerDeposit + buyerEscalationDeposit)*buyerPercentage
              // seller: (price + sellerDeposit + buyerEscalationDeposit)*(1-buyerPercentage);
              // protocol: 0
              // agent: 0
              expectedSellerAvailableFunds.funds.push(
                new Funds(mockToken.address, "Foreign20", ethers.BigNumber.from(sellerPayoff).toString())
              );
              expectedBuyerAvailableFunds = new FundsList([new Funds(mockToken.address, "Foreign20", buyerPayoff)]);
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
            });
          });
        });

        context("Final state DISPUTED - ESCALATED - DECIDED", async function () {
          beforeEach(async function () {
            buyerPercentBasisPoints = "5566"; // 55.66%

            // expected payoffs
            // buyer: (price + sellerDeposit + buyerEscalationDeposit)*buyerPercentage
            buyerPayoff = ethers.BigNumber.from(offerToken.price)
              .add(offerToken.sellerDeposit)
              .add(buyerEscalationDeposit)
              .mul(buyerPercentBasisPoints)
              .div("10000")
              .toString();

            // seller: (price + sellerDeposit + buyerEscalationDeposit)*(1-buyerPercentage)
            sellerPayoff = ethers.BigNumber.from(offerToken.price)
              .add(offerToken.sellerDeposit)
              .add(buyerEscalationDeposit)
              .sub(buyerPayoff)
              .toString();

            // protocol: 0
            protocolPayoff = 0;

            // escalate the dispute
            await disputeHandler.connect(buyer).escalateDispute(exchangeId);
          });

          it("should emit a FundsReleased event", async function () {
            // Decide the dispute, expecting event
            const tx = await disputeHandler.connect(assistantDR).decideDispute(exchangeId, buyerPercentBasisPoints);
            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, assistantDR.address);

            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, assistantDR.address);

            await expect(tx).to.not.emit(disputeHandler, "ProtocolFeeCollected");
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(mockToken.address, "Foreign20", sellerDeposit),
              new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
            ]);
            expectedBuyerAvailableFunds = new FundsList([]);
            expectedProtocolAvailableFunds = new FundsList([]);
            expectedAgentAvailableFunds = new FundsList([]);
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

            // Decide the dispute, so the funds are released
            await disputeHandler.connect(assistantDR).decideDispute(exchangeId, buyerPercentBasisPoints);

            // Available funds should be increased for
            // buyer: (price + sellerDeposit + buyerEscalationDeposit)*buyerPercentage
            // seller: (price + sellerDeposit + buyerEscalationDeposit)*(1-buyerPercentage); note that seller has sellerDeposit in availableFunds from before
            // protocol: 0
            // agent: 0
            expectedBuyerAvailableFunds.funds[0] = new Funds(mockToken.address, "Foreign20", buyerPayoff);
            expectedSellerAvailableFunds.funds[0] = new Funds(
              mockToken.address,
              "Foreign20",
              ethers.BigNumber.from(sellerDeposit).add(sellerPayoff).toString()
            );
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
          });

          context("Offer has an agent", async function () {
            beforeEach(async function () {
              // Create Agent offer
              await offerHandler
                .connect(assistant)
                .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id);

              // approve protocol to transfer the tokens
              await mockToken.connect(buyer).approve(protocolDiamond.address, agentOffer.price);
              await mockToken.mint(buyer.address, agentOffer.price);

              // Commit to Offer
              await exchangeHandler.connect(buyer).commitToOffer(buyer.address, agentOffer.id);

              exchangeId = "2";

              // succesfully redeem exchange
              await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

              // raise the dispute
              tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

              // Get the block timestamp of the confirmed tx and set disputedDate
              blockNumber = tx.blockNumber;
              block = await ethers.provider.getBlock(blockNumber);
              disputedDate = block.timestamp.toString();
              timeout = ethers.BigNumber.from(disputedDate).add(resolutionPeriod).toString();

              buyerPercentBasisPoints = "5566"; // 55.66%

              // expected payoffs
              // buyer: (price + sellerDeposit + buyerEscalationDeposit)*buyerPercentage
              buyerPayoff = ethers.BigNumber.from(agentOffer.price)
                .add(agentOffer.sellerDeposit)
                .add(buyerEscalationDeposit)
                .mul(buyerPercentBasisPoints)
                .div("10000")
                .toString();

              // seller: (price + sellerDeposit + buyerEscalationDeposit)*(1-buyerPercentage)
              sellerPayoff = ethers.BigNumber.from(agentOffer.price)
                .add(agentOffer.sellerDeposit)
                .add(buyerEscalationDeposit)
                .sub(buyerPayoff)
                .toString();

              // protocol: 0
              protocolPayoff = 0;

              // escalate the dispute
              await mockToken.mint(buyer.address, buyerEscalationDeposit);
              await mockToken.connect(buyer).approve(protocolDiamond.address, buyerEscalationDeposit);
              await disputeHandler.connect(buyer).escalateDispute(exchangeId);
            });

            it("should update state", async function () {
              // Read on chain state
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

              // Chain state should match the expected available funds
              expectedSellerAvailableFunds = new FundsList([
                new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
              ]);
              expectedBuyerAvailableFunds = new FundsList([]);
              expectedProtocolAvailableFunds = new FundsList([]);
              expectedAgentAvailableFunds = new FundsList([]);
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

              // Decide the dispute, so the funds are released
              await disputeHandler.connect(assistantDR).decideDispute(exchangeId, buyerPercentBasisPoints);

              // Available funds should be increased for
              // buyer: (price + sellerDeposit + buyerEscalationDeposit)*buyerPercentage
              // seller: (price + sellerDeposit + buyerEscalationDeposit)*(1-buyerPercentage);
              // protocol: 0
              // agent: 0
              expectedSellerAvailableFunds.funds.push(
                new Funds(mockToken.address, "Foreign20", ethers.BigNumber.from(sellerPayoff).toString())
              );
              expectedBuyerAvailableFunds = new FundsList([new Funds(mockToken.address, "Foreign20", buyerPayoff)]);
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
            });
          });
        });

        context(
          "Final state DISPUTED - ESCALATED - REFUSED via expireEscalatedDispute (fail to resolve)",
          async function () {
            beforeEach(async function () {
              // expected payoffs
              // buyer: price + buyerEscalationDeposit
              buyerPayoff = ethers.BigNumber.from(offerToken.price).add(buyerEscalationDeposit).toString();

              // seller: sellerDeposit
              sellerPayoff = offerToken.sellerDeposit;

              // protocol: 0
              protocolPayoff = 0;

              // Escalate the dispute
              tx = await disputeHandler.connect(buyer).escalateDispute(exchangeId);

              // Get the block timestamp of the confirmed tx and set escalatedDate
              blockNumber = tx.blockNumber;
              block = await ethers.provider.getBlock(blockNumber);
              escalatedDate = block.timestamp.toString();

              await setNextBlockTimestamp(Number(escalatedDate) + Number(disputeResolver.escalationResponsePeriod));
            });

            it("should emit a FundsReleased event", async function () {
              // Expire the dispute, expecting event
              const tx = await disputeHandler.connect(rando).expireEscalatedDispute(exchangeId);
              await expect(tx)
                .to.emit(disputeHandler, "FundsReleased")
                .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, rando.address);
              await expect(tx)
                .to.emit(disputeHandler, "FundsReleased")
                .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, rando.address);

              await expect(tx).to.not.emit(disputeHandler, "ProtocolFeeCollected");
            });

            it("should update state", async function () {
              // Read on chain state
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

              // Chain state should match the expected available funds
              expectedSellerAvailableFunds = new FundsList([
                new Funds(mockToken.address, "Foreign20", sellerDeposit),
                new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
              ]);
              expectedBuyerAvailableFunds = new FundsList([]);
              expectedProtocolAvailableFunds = new FundsList([]);
              expectedAgentAvailableFunds = new FundsList([]);
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

              // Expire the escalated dispute, so the funds are released
              await disputeHandler.connect(rando).expireEscalatedDispute(exchangeId);

              // Available funds should be increased for
              // buyer: price + buyerEscalationDeposit
              // seller: sellerDeposit; note that seller has sellerDeposit in availableFunds from before
              // protocol: 0
              // agent: 0
              expectedBuyerAvailableFunds.funds[0] = new Funds(mockToken.address, "Foreign20", buyerPayoff);
              expectedSellerAvailableFunds.funds[0] = new Funds(
                mockToken.address,
                "Foreign20",
                ethers.BigNumber.from(sellerDeposit).add(sellerPayoff).toString()
              );
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
            });

            context("Offer has an agent", async function () {
              beforeEach(async function () {
                // Create Agent offer
                await offerHandler
                  .connect(assistant)
                  .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id);

                // approve protocol to transfer the tokens
                await mockToken.connect(buyer).approve(protocolDiamond.address, agentOffer.price);
                await mockToken.mint(buyer.address, agentOffer.price);

                // Commit to Offer
                await exchangeHandler.connect(buyer).commitToOffer(buyer.address, agentOffer.id);

                exchangeId = "2";

                // succesfully redeem exchange
                await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

                // raise the dispute
                tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

                // expected payoffs
                // buyer: price + buyerEscalationDeposit
                buyerPayoff = ethers.BigNumber.from(offerToken.price).add(buyerEscalationDeposit).toString();

                // seller: sellerDeposit
                sellerPayoff = offerToken.sellerDeposit;

                // protocol: 0
                protocolPayoff = 0;

                // Escalate the dispute
                await mockToken.mint(buyer.address, buyerEscalationDeposit);
                await mockToken.connect(buyer).approve(protocolDiamond.address, buyerEscalationDeposit);
                tx = await disputeHandler.connect(buyer).escalateDispute(exchangeId);

                // Get the block timestamp of the confirmed tx and set escalatedDate
                blockNumber = tx.blockNumber;
                block = await ethers.provider.getBlock(blockNumber);
                escalatedDate = block.timestamp.toString();

                await setNextBlockTimestamp(Number(escalatedDate) + Number(disputeResolver.escalationResponsePeriod));
              });

              it("should update state", async function () {
                // Read on chain state
                sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
                buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
                protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
                agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

                // Chain state should match the expected available funds
                expectedSellerAvailableFunds = new FundsList([
                  new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
                ]);
                expectedBuyerAvailableFunds = new FundsList([]);
                expectedProtocolAvailableFunds = new FundsList([]);
                expectedAgentAvailableFunds = new FundsList([]);
                expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
                expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
                expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
                expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

                // Expire the escalated dispute, so the funds are released
                await disputeHandler.connect(rando).expireEscalatedDispute(exchangeId);

                // Available funds should be increased for
                // buyer: price + buyerEscalationDeposit
                // seller: sellerDeposit;
                // protocol: 0
                // agent: 0
                expectedBuyerAvailableFunds.funds[0] = new Funds(mockToken.address, "Foreign20", buyerPayoff);
                expectedSellerAvailableFunds.funds.push(
                  new Funds(mockToken.address, "Foreign20", ethers.BigNumber.from(sellerPayoff).toString())
                );
                sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
                buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
                protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
                agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
                expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
                expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
                expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
                expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
              });
            });
          }
        );

        context(
          "Final state DISPUTED - ESCALATED - REFUSED via refuseEscalatedDispute (explicit refusal)",
          async function () {
            beforeEach(async function () {
              // expected payoffs
              // buyer: price + buyerEscalationDeposit
              buyerPayoff = ethers.BigNumber.from(offerToken.price).add(buyerEscalationDeposit).toString();

              // seller: sellerDeposit
              sellerPayoff = offerToken.sellerDeposit;

              // protocol: 0
              protocolPayoff = 0;

              // Escalate the dispute
              tx = await disputeHandler.connect(buyer).escalateDispute(exchangeId);
            });

            it("should emit a FundsReleased event", async function () {
              // Expire the dispute, expecting event
              const tx = await disputeHandler.connect(assistantDR).refuseEscalatedDispute(exchangeId);

              await expect(tx)
                .to.emit(disputeHandler, "FundsReleased")
                .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, assistantDR.address);

              await expect(tx)
                .to.emit(disputeHandler, "FundsReleased")
                .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, assistantDR.address);

              await expect(tx).to.not.emit(disputeHandler, "ProtocolFeeCollected");

              //check that FundsReleased event was NOT emitted with  rando address
              const txReceipt = await tx.wait();
              const match = eventEmittedWithArgs(txReceipt, disputeHandler, "FundsReleased", [
                exchangeId,
                seller.id,
                offerToken.exchangeToken,
                sellerPayoff,
                rando.address,
              ]);
              expect(match).to.be.false;
            });

            it("should update state", async function () {
              // Read on chain state
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

              // Chain state should match the expected available funds
              expectedSellerAvailableFunds = new FundsList([
                new Funds(mockToken.address, "Foreign20", sellerDeposit),
                new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
              ]);
              expectedBuyerAvailableFunds = new FundsList([]);
              expectedProtocolAvailableFunds = new FundsList([]);
              expectedAgentAvailableFunds = new FundsList([]);
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

              // Expire the escalated dispute, so the funds are released
              await disputeHandler.connect(assistantDR).refuseEscalatedDispute(exchangeId);

              // Available funds should be increased for
              // buyer: price + buyerEscalationDeposit
              // seller: sellerDeposit; note that seller has sellerDeposit in availableFunds from before
              // protocol: 0
              // agent: 0
              expectedBuyerAvailableFunds.funds[0] = new Funds(mockToken.address, "Foreign20", buyerPayoff);
              expectedSellerAvailableFunds.funds[0] = new Funds(
                mockToken.address,
                "Foreign20",
                ethers.BigNumber.from(sellerDeposit).add(sellerPayoff).toString()
              );
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
            });

            context("Offer has an agent", async function () {
              beforeEach(async function () {
                // Create Agent offer
                await offerHandler
                  .connect(assistant)
                  .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id);

                // approve protocol to transfer the tokens
                await mockToken.connect(buyer).approve(protocolDiamond.address, agentOffer.price);
                await mockToken.mint(buyer.address, agentOffer.price);

                // Commit to Offer
                await exchangeHandler.connect(buyer).commitToOffer(buyer.address, agentOffer.id);

                exchangeId = "2";

                // succesfully redeem exchange
                await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

                // raise the dispute
                await disputeHandler.connect(buyer).raiseDispute(exchangeId);

                // expected payoffs
                // buyer: price + buyerEscalationDeposit
                buyerPayoff = ethers.BigNumber.from(offerToken.price).add(buyerEscalationDeposit).toString();

                // seller: sellerDeposit
                sellerPayoff = offerToken.sellerDeposit;

                // protocol: 0
                protocolPayoff = 0;

                // Escalate the dispute
                await mockToken.mint(buyer.address, buyerEscalationDeposit);
                await mockToken.connect(buyer).approve(protocolDiamond.address, buyerEscalationDeposit);
                await disputeHandler.connect(buyer).escalateDispute(exchangeId);
              });

              it("should update state", async function () {
                // Read on chain state
                sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
                buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
                protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
                agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));

                // Chain state should match the expected available funds
                expectedSellerAvailableFunds = new FundsList([
                  new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
                ]);
                expectedBuyerAvailableFunds = new FundsList([]);
                expectedProtocolAvailableFunds = new FundsList([]);
                expectedAgentAvailableFunds = new FundsList([]);
                expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
                expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
                expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
                expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

                // Expire the escalated dispute, so the funds are released
                await disputeHandler.connect(assistantDR).refuseEscalatedDispute(exchangeId);

                // Available funds should be increased for
                // buyer: price + buyerEscalationDeposit
                // seller: sellerDeposit;
                // protocol: 0
                // agent: 0
                expectedBuyerAvailableFunds.funds[0] = new Funds(mockToken.address, "Foreign20", buyerPayoff);
                expectedSellerAvailableFunds.funds.push(
                  new Funds(mockToken.address, "Foreign20", ethers.BigNumber.from(sellerPayoff).toString())
                );
                sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
                buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
                protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
                agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(agentId));
                expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
                expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
                expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
                expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
              });
            });
          }
        );
      });

      context("Changing the protocol fee", async function () {
        beforeEach(async function () {
          // Cast Diamond to IBosonConfigHandler
          configHandler = await ethers.getContractAt("IBosonConfigHandler", protocolDiamond.address);

          // expected payoffs
          // buyer: 0
          buyerPayoff = 0;

          // seller: sellerDeposit + price - protocolFee
          sellerPayoff = ethers.BigNumber.from(offerToken.sellerDeposit)
            .add(offerToken.price)
            .sub(offerTokenProtocolFee)
            .toString();
        });

        it("Protocol fee for existing exchanges should be the same as at the offer creation", async function () {
          // set the new procol fee
          protocolFeePercentage = "300"; // 3%
          await configHandler.connect(deployer).setProtocolFeePercentage(protocolFeePercentage);

          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // succesfully redeem exchange
          await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

          // Complete the exchange, expecting event
          const tx = await exchangeHandler.connect(buyer).completeExchange(exchangeId);
          await expect(tx)
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, buyer.address);

          await expect(tx)
            .to.emit(exchangeHandler, "ProtocolFeeCollected")
            .withArgs(exchangeId, offerToken.exchangeToken, offerTokenProtocolFee, buyer.address);
        });

        it("Protocol fee for new exchanges should be the same as at the offer creation", async function () {
          // set the new procol fee
          protocolFeePercentage = "300"; // 3%
          await configHandler.connect(deployer).setProtocolFeePercentage(protocolFeePercentage);

          // similar as teste before, excpet the commit to offer is done after the procol fee change

          // commit to offer and get the correct exchangeId
          tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id);
          txReceipt = await tx.wait();
          event = getEvent(txReceipt, exchangeHandler, "BuyerCommitted");
          exchangeId = event.exchangeId.toString();

          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // succesfully redeem exchange
          await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

          // Complete the exchange, expecting event
          tx = await exchangeHandler.connect(buyer).completeExchange(exchangeId);
          await expect(tx)
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, buyer.address);

          await expect(tx)
            .to.emit(exchangeHandler, "ProtocolFeeCollected")
            .withArgs(exchangeId, offerToken.exchangeToken, offerTokenProtocolFee, buyer.address);
        });

        context("Offer has an agent", async function () {
          beforeEach(async function () {
            exchangeId = "2";

            // Cast Diamond to IBosonConfigHandler
            configHandler = await ethers.getContractAt("IBosonConfigHandler", protocolDiamond.address);

            // expected payoffs
            // buyer: 0
            buyerPayoff = 0;

            // agentPayoff: agentFee
            agentFee = ethers.BigNumber.from(agentOffer.price).mul(agentFeePercentage).div("10000").toString();
            agentPayoff = agentFee;

            // seller: sellerDeposit + price - protocolFee - agentFee
            sellerPayoff = ethers.BigNumber.from(agentOffer.sellerDeposit)
              .add(agentOffer.price)
              .sub(agentOfferProtocolFee)
              .sub(agentFee)
              .toString();

            // protocol: protocolFee
            protocolPayoff = agentOfferProtocolFee;

            // Create Agent Offer before setting new protocol fee as 3%
            await offerHandler
              .connect(assistant)
              .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id);

            // Commit to Agent Offer
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, agentOffer.id);

            // set the new procol fee
            protocolFeePercentage = "300"; // 3%
            await configHandler.connect(deployer).setProtocolFeePercentage(protocolFeePercentage);
          });

          it("Protocol fee for existing exchanges should be the same as at the agent offer creation", async function () {
            // Set time forward to the offer's voucherRedeemableFrom
            await setNextBlockTimestamp(Number(voucherRedeemableFrom));

            // succesfully redeem exchange
            await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

            // Complete the exchange, expecting event
            const tx = await exchangeHandler.connect(buyer).completeExchange(exchangeId);

            await expect(tx)
              .to.emit(exchangeHandler, "FundsReleased")
              .withArgs(exchangeId, seller.id, agentOffer.exchangeToken, sellerPayoff, buyer.address);

            await expect(tx)
              .to.emit(exchangeHandler, "ProtocolFeeCollected")
              .withArgs(exchangeId, agentOffer.exchangeToken, protocolPayoff, buyer.address);

            await expect(tx)
              .to.emit(exchangeHandler, "FundsReleased")
              .withArgs(exchangeId, agentId, agentOffer.exchangeToken, agentPayoff, buyer.address);
          });

          it("Protocol fee for new exchanges should be the same as at the agent offer creation", async function () {
            // similar as tests before, excpet the commit to offer is done after the protocol fee change

            // top up seller's and buyer's account
            await mockToken.mint(assistant.address, sellerDeposit);
            await mockToken.mint(buyer.address, price);

            // approve protocol to transfer the tokens
            await mockToken.connect(assistant).approve(protocolDiamond.address, sellerDeposit);
            await mockToken.connect(buyer).approve(protocolDiamond.address, price);

            // deposit to seller's pool
            await fundsHandler.connect(assistant).depositFunds(seller.id, mockToken.address, sellerDeposit);

            // commit to offer and get the correct exchangeId
            tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, agentOffer.id);
            txReceipt = await tx.wait();
            event = getEvent(txReceipt, exchangeHandler, "BuyerCommitted");
            exchangeId = event.exchangeId.toString();

            // Set time forward to the offer's voucherRedeemableFrom
            await setNextBlockTimestamp(Number(voucherRedeemableFrom));

            // succesfully redeem exchange
            await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

            // Complete the exchange, expecting event
            tx = await exchangeHandler.connect(buyer).completeExchange(exchangeId);

            // Complete the exchange, expecting event
            await expect(tx)
              .to.emit(exchangeHandler, "FundsReleased")
              .withArgs(exchangeId, seller.id, agentOffer.exchangeToken, sellerPayoff, buyer.address);

            await expect(tx)
              .to.emit(exchangeHandler, "ProtocolFeeCollected")
              .withArgs(exchangeId, agentOffer.exchangeToken, protocolPayoff, buyer.address);

            await expect(tx)
              .to.emit(exchangeHandler, "FundsReleased")
              .withArgs(exchangeId, agentId, agentOffer.exchangeToken, agentPayoff, buyer.address);
          });
        });
      });
    });
  });
});
