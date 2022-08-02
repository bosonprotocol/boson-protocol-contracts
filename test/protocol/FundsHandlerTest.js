const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");
const { gasLimit } = require("../../environments");
const Agent = require("../../scripts/domain/Agent");
const Role = require("../../scripts/domain/Role");
const Seller = require("../../scripts/domain/Seller");
const AuthToken = require("../../scripts/domain/AuthToken");
const AuthTokenType = require("../../scripts/domain/AuthTokenType");
const { Funds, FundsList } = require("../../scripts/domain/Funds");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const {
  setNextBlockTimestamp,
  getEvent,
  prepareDataSignatureParameters,
  applyPercentage,
} = require("../../scripts/util/test-utils.js");
const { oneMonth } = require("../utils/constants");
const { mockOffer, mockDisputeResolver } = require("../utils/mock");

/**
 *  Test the Boson Funds Handler interface
 */
describe("IBosonFundsHandler", function () {
  // Common vars
  let InterfaceIds;
  let deployer, rando, operator, admin, clerk, treasury, feeCollector, operatorDR, adminDR, clerkDR, treasuryDR, other;
  let erc165,
    protocolDiamond,
    accessController,
    accountHandler,
    fundsHandler,
    exchangeHandler,
    offerHandler,
    configHandler,
    disputeHandler;
  let support;
  let seller, active;
  let id, buyer, offerToken, offerNative, sellerId, nextAccountId;
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
  let buyerPercent;
  let resolutionType, customSignatureType, message, r, s, v;
  let disputedDate, escalatedDate, timeout;
  let contractURI;
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

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();

    // Deploy the mock token
    [mockToken] = await deployMockTokens(gasLimit, ["Foreign20"]);
  });

  beforeEach(async function () {
    // Make accounts available
    [
      deployer,
      operator,
      admin,
      clerk,
      treasury,
      rando,
      buyer,
      feeCollector,
      operatorDR,
      adminDR,
      clerkDR,
      treasuryDR,
      other,
    ] = await ethers.getSigners();

    // Deploy the Protocol Diamond
    [protocolDiamond, , , accessController] = await deployProtocolDiamond();

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Grant PROTOCOL role to ProtocolDiamond address and renounces admin
    await accessController.grantRole(Role.PROTOCOL, protocolDiamond.address);

    // Cut the protocol handler facets into the Diamond
    await deployProtocolHandlerFacets(protocolDiamond, [
      "SellerHandlerFacet",
      "BuyerHandlerFacet",
      "AgentHandlerFacet",
      "DisputeResolverHandlerFacet",
      "FundsHandlerFacet",
      "ExchangeHandlerFacet",
      "OfferHandlerFacet",
    ]);

    // Deploy the Protocol client implementation/proxy pairs (currently just the Boson Voucher)
    const protocolClientArgs = [accessController.address, protocolDiamond.address];
    const [, beacons, proxies] = await deployProtocolClients(protocolClientArgs, gasLimit);
    const [beacon] = beacons;
    const [proxy] = proxies;

    // Deploy the boson token
    [bosonToken] = await deployMockTokens(gasLimit, ["BosonToken"]);

    // set protocolFees
    protocolFeePercentage = "200"; // 2 %
    protocolFeeFlatBoson = ethers.utils.parseUnits("0.01", "ether").toString();
    buyerEscalationDepositPercentage = "1000"; // 10%

    // Add config Handler, so offer id starts at 1
    const protocolConfig = [
      // Protocol addresses
      {
        treasuryAddress: "0x0000000000000000000000000000000000000000",
        tokenAddress: bosonToken.address,
        voucherBeaconAddress: beacon.address,
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
    erc165 = await ethers.getContractAt("IERC165", protocolDiamond.address);

    // Cast Diamond to IBosonAccountHandler. Use this interface to call all individual account handlers
    accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);

    // Cast Diamond to IBosonFundsHandler
    fundsHandler = await ethers.getContractAt("IBosonFundsHandler", protocolDiamond.address);

    // Cast Diamond to IBosonOfferHandler
    offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);

    // Cast Diamond to IBosonExchangeHandler
    exchangeHandler = await ethers.getContractAt("IBosonExchangeHandler", protocolDiamond.address);

    // Deploy the mock token
    [mockToken] = await deployMockTokens(gasLimit, ["Foreign20"]);
  });

  // Interface support (ERC-156 provided by ProtocolDiamond, others by deployed facets)
  context("📋 Interfaces", async function () {
    context("👉 supportsInterface()", async function () {
      it("should indicate support for IBosonFundsHandler interface", async function () {
        // Current interfaceId for IBosonFundsHandler
        support = await erc165.supportsInterface(InterfaceIds.IBosonFundsHandler);

        // Test
        await expect(support, "IBosonFundsHandler interface not supported").is.true;
      });
    });
  });

  // All supported methods - single offer
  context("📋 Funds Handler Methods", async function () {
    beforeEach(async function () {
      // create a seller
      // Required constructor params
      id = "1"; // argument sent to contract for createSeller will be ignored

      active = true;

      // Create a valid seller, then set fields in tests directly
      seller = new Seller(id, operator.address, admin.address, clerk.address, treasury.address, active);
      expect(seller.isValid()).is.true;
      contractURI = `https://ipfs.io/ipfs/QmW2WQi7j6c7UgJTarActp7tDNikE4B2qXtFCfLPdsgaTQ`;

      // AuthToken
      emptyAuthToken = new AuthToken("0", AuthTokenType.None);
      expect(emptyAuthToken.isValid()).is.true;

      await accountHandler.connect(admin).createSeller(seller, contractURI, emptyAuthToken);

      // top up operators account
      await mockToken.mint(operator.address, "1000000");

      // approve protocol to transfer the tokens
      await mockToken.connect(operator).approve(protocolDiamond.address, "1000000");

      // set the deposit amount
      depositAmount = "100";

      // Set agent id as zero as it is optional for createOffer().
      agentId = "0";
    });

    context("👉 depositFunds()", async function () {
      it("should emit a FundsDeposited event", async function () {
        // Deposit funds, testing for the event
        // Deposit token
        await expect(fundsHandler.connect(operator).depositFunds(seller.id, mockToken.address, depositAmount))
          .to.emit(fundsHandler, "FundsDeposited")
          .withArgs(seller.id, operator.address, mockToken.address, depositAmount);

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
        await fundsHandler.connect(operator).depositFunds(seller.id, mockToken.address, depositAmount);

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
        await fundsHandler.connect(operator).depositFunds(seller.id, mockToken.address, depositAmount);

        // Read on chain state
        let returnedAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));

        // Chain state should match the expected available funds
        let expectedAvailableFunds = new FundsList([new Funds(mockToken.address, "Foreign20", depositAmount)]);
        expect(returnedAvailableFunds).to.eql(expectedAvailableFunds);

        // Deposit the same token again
        await fundsHandler.connect(operator).depositFunds(seller.id, mockToken.address, 2 * depositAmount);

        // Get new on chain state
        returnedAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));

        // Chain state should match the expected available funds
        expectedAvailableFunds = new FundsList([new Funds(mockToken.address, "Foreign20", `${3 * depositAmount}`)]);
        expect(returnedAvailableFunds).to.eql(expectedAvailableFunds);
      });

      context("💔 Revert Reasons", async function () {
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
          [bosonToken] = await deployMockTokens(gasLimit, ["BosonToken"]);

          // Attempt to deposit the funds, expecting revert
          await expect(
            fundsHandler.connect(rando).depositFunds(seller.id, bosonToken.address, depositAmount)
          ).to.revertedWith(RevertReasons.TOKEN_TRANSFER_FAILED);
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
            fundsHandler.connect(operator).depositFunds(seller.id, mockToken.address, depositAmount)
          ).to.revertedWith(RevertReasons.ERC20_INSUFFICIENT_ALLOWANCE);
        });
      });
    });

    context("👉 getAvailableFunds()", async function () {
      it("Returns info also for ERC20 tokens without the name", async function () {
        // Deploy the mock token with no name
        [mockToken] = await deployMockTokens(gasLimit, ["Foreign20NoName"]);
        // top up operators account
        await mockToken.mint(operator.address, "1000000");
        // approve protocol to transfer the tokens
        await mockToken.connect(operator).approve(protocolDiamond.address, "1000000");

        // Deposit token
        await fundsHandler.connect(operator).depositFunds(seller.id, mockToken.address, depositAmount);

        // Read on chain state
        let returnedAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));

        // Chain state should match the expected available funds
        let expectedAvailableFunds = new FundsList([
          new Funds(mockToken.address, "Token name unspecified", depositAmount),
        ]);
        expect(returnedAvailableFunds).to.eql(expectedAvailableFunds);
      });
    });

    context("💸 withdraw", async function () {
      beforeEach(async function () {
        // Initial ids for all the things
        id = sellerId = exchangeId = nextAccountId = "1";
        buyerId = "3"; // created after a seller and a dispute resolver

        active = true;

        // Create a valid dispute resolver
        disputeResolver = await mockDisputeResolver(
          operatorDR.address,
          adminDR.address,
          clerkDR.address,
          treasuryDR.address,
          false
        );
        expect(disputeResolver.isValid()).is.true;

        //Create DisputeResolverFee array so offer creation will succeed
        disputeResolverFees = [
          new DisputeResolverFee(ethers.constants.AddressZero, "Native", "0"),
          new DisputeResolverFee(mockToken.address, "mockToken", "0"),
        ];

        // Make empty seller list, so every seller is allowed
        const sellerAllowList = [];

        // Register and activate the dispute resolver
        await accountHandler
          .connect(rando)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
        await accountHandler.connect(deployer).activateDisputeResolver(++nextAccountId);

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
            .connect(operator)
            .createOffer(offerNative, offerDates, offerDurations, disputeResolverId, agentId),
          offerHandler
            .connect(operator)
            .createOffer(offerToken, offerDates, offerDurations, disputeResolverId, agentId),
        ]);

        // Set used variables
        price = offerToken.price;
        sellerDeposit = offerToken.sellerDeposit;
        offerTokenProtocolFee = offerNativeProtocolFee = offerFees.protocolFee;

        // top up seller's and buyer's account
        await mockToken.mint(operator.address, sellerDeposit);
        await mockToken.mint(buyer.address, price);

        // approve protocol to transfer the tokens
        await mockToken.connect(operator).approve(protocolDiamond.address, sellerDeposit);
        await mockToken.connect(buyer).approve(protocolDiamond.address, price);

        // deposit to seller's pool
        await fundsHandler.connect(operator).depositFunds(seller.id, mockToken.address, sellerDeposit);
        await fundsHandler.connect(operator).depositFunds(seller.id, ethers.constants.AddressZero, sellerDeposit, {
          value: sellerDeposit,
        });

        // commit to both offers
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id);
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerNative.id, { value: offerNative.price });
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
          await expect(fundsHandler.connect(clerk).withdrawFunds(sellerId, tokenListSeller, tokenAmountsSeller))
            .to.emit(fundsHandler, "FundsWithdrawn")
            .withArgs(sellerId, treasury.address, mockToken.address, sellerPayoff, clerk.address)
            .to.emit(fundsHandler, "FundsWithdrawn")
            .withArgs(
              sellerId,
              treasury.address,
              ethers.constants.Zero,
              ethers.BigNumber.from(sellerPayoff).div("2"),
              clerk.address
            );

          // buyer withdrawal
          await expect(fundsHandler.connect(buyer).withdrawFunds(buyerId, tokenListBuyer, tokenAmountsBuyer))
            .to.emit(fundsHandler, "FundsWithdrawn", buyer.address)
            .withArgs(buyerId, buyer.address, mockToken.address, ethers.BigNumber.from(buyerPayoff).div("5"))
            .to.emit(fundsHandler, "FundsWithdrawn")
            .withArgs(buyerId, buyer.address, ethers.constants.Zero, buyerPayoff, buyer.address);
        });

        it("should update state", async function () {
          // WITHDRAW ONE TOKEN PARTIALLY

          // Read on chain state
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
          await fundsHandler.connect(clerk).withdrawFunds(sellerId, [ethers.constants.AddressZero], [withdrawAmount]);

          // Read on chain state
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
          await fundsHandler.connect(clerk).withdrawFunds(sellerId, [], []);

          // Read on chain state
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
          configHandler = await ethers.getContractAt("IBosonConfigHandler", protocolDiamond.address);
          await configHandler.connect(deployer).setMaxTokensPerWithdrawal("1");

          // Read on chain state
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
          await fundsHandler.connect(clerk).withdrawFunds(sellerId, [], []);

          // Read on chain state
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
          await fundsHandler.connect(clerk).withdrawFunds(sellerId, [], []);

          // Read on chain state
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
          await expect(fundsHandler.connect(clerk).withdrawFunds(sellerId, tokenListSeller, tokenAmountsSeller))
            .to.emit(fundsHandler, "FundsWithdrawn")
            .withArgs(sellerId, treasury.address, mockToken.address, sellerPayoff, clerk.address)
            .to.emit(fundsHandler, "FundsWithdrawn")
            .withArgs(sellerId, treasury.address, mockToken.address, reduction, clerk.address);
        });

        context("Agent Withdraws funds", async function () {
          beforeEach(async function () {
            // Create a valid agent,
            agentId = "4";
            agentFeePercentage = "500"; //5%
            active = true;
            agent = new Agent(agentId, agentFeePercentage, other.address, active);
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
              .connect(operator)
              .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id);

            // Set used variables
            price = agentOffer.price;
            sellerDeposit = agentOffer.sellerDeposit;
            voucherRedeemableFrom = offerDates.voucherRedeemableFrom;

            // top up seller's and buyer's account
            await mockToken.mint(operator.address, sellerDeposit);
            await mockToken.mint(buyer.address, price);

            // approve protocol to transfer the tokens
            await mockToken.connect(operator).approve(protocolDiamond.address, sellerDeposit);
            await mockToken.connect(buyer).approve(protocolDiamond.address, price);

            // deposit to seller's pool
            await fundsHandler.connect(operator).depositFunds(seller.id, mockToken.address, sellerDeposit);

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

            agentPayoff = ethers.BigNumber.from(agentOffer.price).mul(agentFeePercentage).div("10000").toString();

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
            await deployProtocolHandlerFacets(protocolDiamond, ["DisputeHandlerFacet"]);

            // Cast Diamond to IBosonDisputeHandler
            disputeHandler = await ethers.getContractAt("IBosonDisputeHandler", protocolDiamond.address);

            // raise the dispute
            await disputeHandler.connect(buyer).raiseDispute(exchangeId, "Wrong size");

            // retract from the dispute
            await disputeHandler.connect(buyer).retractDispute(exchangeId);

            agentPayoff = ethers.BigNumber.from(agentOffer.price).mul(agentFeePercentage).div("10000").toString();

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
          it("Caller is not authorized to withdraw", async function () {
            // Attempt to withdraw the buyer funds, expecting revert
            await expect(fundsHandler.connect(rando).withdrawFunds(buyerId, [], [])).to.revertedWith(
              RevertReasons.NOT_AUTHORIZED
            );

            // Attempt to withdraw the seller funds, expecting revert
            await expect(fundsHandler.connect(rando).withdrawFunds(sellerId, [], [])).to.revertedWith(
              RevertReasons.NOT_AUTHORIZED
            );

            // not even the admin, operator or trasuary are allowed to withdraw
            // Attempt to withdraw the seller funds as admin, expecting revert
            await expect(fundsHandler.connect(admin).withdrawFunds(sellerId, [], [])).to.revertedWith(
              RevertReasons.NOT_AUTHORIZED
            );

            // Attempt to withdraw the seller funds as operator, expecting revert
            await expect(fundsHandler.connect(operator).withdrawFunds(sellerId, [], [])).to.revertedWith(
              RevertReasons.NOT_AUTHORIZED
            );

            // Attempt to withdraw the seller funds as treasury, expecting revert
            await expect(fundsHandler.connect(treasury).withdrawFunds(sellerId, [], [])).to.revertedWith(
              RevertReasons.NOT_AUTHORIZED
            );
          });

          it("Token list address does not match token amount address", async function () {
            // Withdraw token
            tokenList = [mockToken.address, ethers.constants.AddressZero];
            tokenAmounts = [sellerPayoff];

            // Attempt to withdraw the funds, expecting revert
            await expect(fundsHandler.connect(clerk).withdrawFunds(sellerId, tokenList, tokenAmounts)).to.revertedWith(
              RevertReasons.TOKEN_AMOUNT_MISMATCH
            );
          });

          it("Caller wants to withdraw more different tokens than allowed", async function () {
            tokenList = new Array(101).fill(ethers.constants.AddressZero);
            tokenAmounts = new Array(101).fill("1");

            // Attempt to withdraw the funds, expecting revert
            await expect(fundsHandler.connect(clerk).withdrawFunds(sellerId, tokenList, tokenAmounts)).to.revertedWith(
              RevertReasons.TOO_MANY_TOKENS
            );
          });

          it("Caller tries to withdraw more than they have in the available funds", async function () {
            // Withdraw token
            tokenList = [mockToken.address];
            tokenAmounts = [ethers.BigNumber.from(sellerPayoff).mul("2")];

            // Attempt to withdraw the funds, expecting revert
            await expect(fundsHandler.connect(clerk).withdrawFunds(sellerId, tokenList, tokenAmounts)).to.revertedWith(
              RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS
            );
          });

          it("Caller tries to withdraw the same token twice", async function () {
            // Withdraw token
            tokenList = [mockToken.address, mockToken.address];
            tokenAmounts = [sellerPayoff, sellerPayoff];

            // Attempt to withdraw the funds, expecting revert
            await expect(fundsHandler.connect(clerk).withdrawFunds(sellerId, tokenList, tokenAmounts)).to.revertedWith(
              RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS
            );
          });

          it("Nothing to withdraw", async function () {
            // Withdraw token
            tokenList = [mockToken.address];
            tokenAmounts = ["0"];

            await expect(fundsHandler.connect(clerk).withdrawFunds(sellerId, tokenList, tokenAmounts)).to.revertedWith(
              RevertReasons.NOTHING_TO_WITHDRAW
            );

            // first withdraw everything
            await fundsHandler.connect(clerk).withdrawFunds(sellerId, [], []);

            // Attempt to withdraw the funds, expecting revert
            await expect(fundsHandler.connect(clerk).withdrawFunds(sellerId, [], [])).to.revertedWith(
              RevertReasons.NOTHING_TO_WITHDRAW
            );
          });

          it("Transfer of funds failed - revert in fallback", async function () {
            // deploy a contract that cannot receive funds
            const [fallbackErrorContract] = await deployMockTokens(gasLimit, ["FallbackError"]);

            // commit to offer on behalf of some contract
            tx = await exchangeHandler
              .connect(buyer)
              .commitToOffer(fallbackErrorContract.address, offerNative.id, { value: price });
            txReceipt = await tx.wait();
            event = getEvent(txReceipt, exchangeHandler, "BuyerCommitted");
            exchangeId = event.exchangeId;
            const fallbackContractBuyerId = event.buyerId;

            // revoke the voucher so the contract gets credited some funds
            await exchangeHandler.connect(operator).revokeVoucher(exchangeId);

            // we call a fallbackContract which calls fundsHandler.withdraw, which should revert
            await expect(
              fallbackErrorContract.withdrawFunds(
                fundsHandler.address,
                fallbackContractBuyerId,
                [ethers.constants.AddressZero],
                [offerNative.price]
              ) // during the revoke it's released more than offerToken.price
            ).to.revertedWith(RevertReasons.TOKEN_TRANSFER_FAILED);
          });

          it("Transfer of funds failed - no payable fallback or receive", async function () {
            // deploy a contract that cannot receive funds
            const [fallbackErrorContract] = await deployMockTokens(gasLimit, ["WithoutFallbackError"]);

            // commit to offer on behalf of some contract
            tx = await exchangeHandler
              .connect(buyer)
              .commitToOffer(fallbackErrorContract.address, offerNative.id, { value: price });
            txReceipt = await tx.wait();
            event = getEvent(txReceipt, exchangeHandler, "BuyerCommitted");
            exchangeId = event.exchangeId;
            const fallbackContractBuyerId = event.buyerId;

            // revoke the voucher so the contract gets credited some funds
            await exchangeHandler.connect(operator).revokeVoucher(exchangeId);

            // we call a fallbackContract which calls fundsHandler.withdraw, which should revert
            await expect(
              fallbackErrorContract.withdrawFunds(
                fundsHandler.address,
                fallbackContractBuyerId,
                [ethers.constants.AddressZero],
                [offerNative.price]
              ) // during the revoke it's released more than offerToken.price
            ).to.revertedWith(RevertReasons.TOKEN_TRANSFER_FAILED);
          });

          it("Transfer of funds failed - ERC20 token does not exist anymore", async function () {
            // destruct mockToken
            await mockToken.destruct();

            await expect(fundsHandler.connect(clerk).withdrawFunds(sellerId, [], [])).to.revertedWith(
              RevertReasons.EOA_FUNCTION_CALL
            );
          });

          it("Transfer of funds failed - revert durin ERC20 transfer", async function () {
            // pause mockToken
            await mockToken.pause();

            await expect(fundsHandler.connect(clerk).withdrawFunds(sellerId, [], [])).to.revertedWith(
              RevertReasons.ERC20_PAUSED
            );
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

          // seller: sellerDeposit + buyerCancelPenalty
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
          await expect(fundsHandler.connect(feeCollector).withdrawProtocolFees(tokenList, tokenAmounts))
            .to.emit(fundsHandler, "FundsWithdrawn")
            .withArgs(protocolId, feeCollector.address, mockToken.address, protocolPayoff, feeCollector.address)
            .to.emit(fundsHandler, "FundsWithdrawn")
            .withArgs(protocolId, feeCollector.address, ethers.constants.Zero, protocolPayoff, feeCollector.address);
        });

        it("should update state", async function () {
          // Read on chain state
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
          const feeCollectorNativeBalanceBefore = await ethers.provider.getBalance(feeCollector.address);
          const feeCollectorTokenBalanceBefore = await mockToken.balanceOf(feeCollector.address);

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
          const feeCollectorNativeBalanceAfter = await ethers.provider.getBalance(feeCollector.address);
          const feeCollectorTokenBalanceAfter = await mockToken.balanceOf(feeCollector.address);

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
          expect(feeCollectorNativeBalanceAfter).to.eql(
            feeCollectorNativeBalanceBefore.add(partialFeeWithdrawAmount).sub(txCost),
            "Fee collector token balance mismatch"
          );
          // Token balance is increased for the protocol fee
          expect(feeCollectorTokenBalanceAfter).to.eql(
            feeCollectorTokenBalanceBefore.add(protocolPayoff),
            "Fee collector token balance mismatch"
          );
        });

        it("should allow to withdraw all funds at once", async function () {
          // Read on chain state
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
          const feeCollectorNativeBalanceBefore = await ethers.provider.getBalance(feeCollector.address);
          const feeCollectorTokenBalanceBefore = await mockToken.balanceOf(feeCollector.address);

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
          const feeCollectorNativeBalanceAfter = await ethers.provider.getBalance(feeCollector.address);
          const feeCollectorTokenBalanceAfter = await mockToken.balanceOf(feeCollector.address);

          // Chain state should match the expected available funds after the withdrawal
          // Funds available should be an empty list
          expectedProtocolAvailableFunds = new FundsList([]);
          expect(protocolAvailableFunds).to.eql(
            expectedProtocolAvailableFunds,
            "Protocol available funds mismatch after withdrawal"
          );
          // Native currency balance is increased for the partialFeeWithdrawAmount
          expect(feeCollectorNativeBalanceAfter).to.eql(
            feeCollectorNativeBalanceBefore.add(protocolPayoff).sub(txCost),
            "Fee collector native currency balance mismatch"
          );
          // Token balance is increased for the protocol fee
          expect(feeCollectorTokenBalanceAfter).to.eql(
            feeCollectorTokenBalanceBefore.add(protocolPayoff),
            "Fee collector token balance mismatch"
          );
        });

        it("if protocol has more different tokens than maximum number allowed to withdraw, only part of it is withdrawn", async function () {
          // set maximum tokens per withdraw to 1
          configHandler = await ethers.getContractAt("IBosonConfigHandler", protocolDiamond.address);
          await configHandler.connect(deployer).setMaxTokensPerWithdrawal("1");

          // Read on chain state
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
          let feeCollectorNativeBalanceBefore = await ethers.provider.getBalance(feeCollector.address);
          const feeCollectorTokenBalanceBefore = await mockToken.balanceOf(feeCollector.address);

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
          let feeCollectorNativeBalanceAfter = await ethers.provider.getBalance(feeCollector.address);
          const feeCollectorTokenBalanceAfter = await mockToken.balanceOf(feeCollector.address);

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
          expect(feeCollectorNativeBalanceAfter).to.eql(
            feeCollectorNativeBalanceBefore.sub(txCost),
            "Fee collector native currency balance mismatch after first withdrawal"
          );
          expect(feeCollectorTokenBalanceAfter).to.eql(
            feeCollectorTokenBalanceBefore.add(protocolPayoff),
            "Fee collector token balance mismatch after first withdrawal"
          );

          // update native curency balance
          feeCollectorNativeBalanceBefore = feeCollectorNativeBalanceBefore.sub(txCost);

          // withdraw all funds again
          tx = await fundsHandler.connect(feeCollector).withdrawProtocolFees([], []);

          // calcualte tx costs
          txReceipt = await tx.wait();
          txCost = tx.gasPrice.mul(txReceipt.gasUsed);

          // Read on chain state
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
          feeCollectorNativeBalanceAfter = await ethers.provider.getBalance(feeCollector.address);

          // Chain state should match the expected available funds after the withdrawal
          // Funds available should now be an empty list
          expectedProtocolAvailableFunds = new FundsList([]);
          expect(protocolAvailableFunds).to.eql(
            expectedProtocolAvailableFunds,
            "Protocol available funds mismatch after second withdrawal"
          );
          // Native currency balance is increased for the protocl fee
          expect(feeCollectorNativeBalanceAfter).to.eql(
            feeCollectorNativeBalanceBefore.add(offerTokenProtocolFee).sub(txCost),
            "Fee collector native currency balance mismatch after second withdrawal"
          );
        });

        it("It's possible to withdraw same token twice if in total enough available funds", async function () {
          let reduction = ethers.utils.parseUnits("0.01", "ether").toString();
          // Withdraw token
          tokenList = [mockToken.address, mockToken.address];
          tokenAmounts = [ethers.BigNumber.from(protocolPayoff).sub(reduction).toString(), reduction];

          // protocol fee withdrawal
          await expect(fundsHandler.connect(feeCollector).withdrawProtocolFees(tokenList, tokenAmounts))
            .to.emit(fundsHandler, "FundsWithdrawn")
            .withArgs(protocolId, feeCollector.address, mockToken.address, protocolPayoff, feeCollector.address)
            .to.emit(fundsHandler, "FundsWithdrawn")
            .withArgs(protocolId, feeCollector.address, mockToken.address, reduction, feeCollector.address);
        });

        context("💔 Revert Reasons", async function () {
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
            const [fallbackErrorContract] = await deployMockTokens(gasLimit, ["FallbackError"]);

            // grant fee collecor role to this contract
            await accessController.grantRole(Role.FEE_COLLECTOR, fallbackErrorContract.address);

            // we call a fallbackContract which calls fundsHandler.withdraw, which should revert
            await expect(
              fallbackErrorContract.withdrawProtocolFees(
                fundsHandler.address,
                [ethers.constants.AddressZero],
                [offerNativeProtocolFee]
              ) // during the revoke it's released more than offerToken.price
            ).to.revertedWith(RevertReasons.TOKEN_TRANSFER_FAILED);
          });

          it("Transfer of funds failed - no payable fallback or receive", async function () {
            // deploy a contract that cannot receive funds
            const [fallbackErrorContract] = await deployMockTokens(gasLimit, ["WithoutFallbackError"]);

            // grant fee collecor role to this contract
            await accessController.grantRole(Role.FEE_COLLECTOR, fallbackErrorContract.address);

            // we call a fallbackContract which calls fundsHandler.withdraw, which should revert
            await expect(
              fallbackErrorContract.withdrawProtocolFees(
                fundsHandler.address,
                [ethers.constants.AddressZero],
                [offerNativeProtocolFee]
              ) // during the revoke it's released more than offerToken.price
            ).to.revertedWith(RevertReasons.TOKEN_TRANSFER_FAILED);
          });

          it("Transfer of funds failed - ERC20 token does not exist anymore", async function () {
            // destruct mockToken
            await mockToken.destruct();

            await expect(fundsHandler.connect(feeCollector).withdrawProtocolFees([], [])).to.revertedWith(
              RevertReasons.EOA_FUNCTION_CALL
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
  });

  // Funds library methods.
  // Cannot be invoked directly, so tests calls the methods that use them
  context("📋 FundsLib  Methods", async function () {
    beforeEach(async function () {
      // Initial ids for all the things
      id = sellerId = nextAccountId = "1";
      active = true;

      // Create a valid seller
      seller = new Seller(id, operator.address, admin.address, clerk.address, treasury.address, true);
      expect(seller.isValid()).is.true;
      contractURI = `https://ipfs.io/ipfs/QmW2WQi7j6c7UgJTarActp7tDNikE4B2qXtFCfLPdsgaTQ`;

      // AuthToken
      emptyAuthToken = new AuthToken("0", AuthTokenType.None);
      expect(emptyAuthToken.isValid()).is.true;

      await accountHandler.connect(admin).createSeller(seller, contractURI, emptyAuthToken);

      // Create a valid dispute resolver
      disputeResolver = await mockDisputeResolver(
        operatorDR.address,
        adminDR.address,
        clerkDR.address,
        treasuryDR.address,
        false
      );
      disputeResolver.id = "2";
      expect(disputeResolver.isValid()).is.true;

      //Create DisputeResolverFee array so offer creation will succeed
      DRFee = ethers.utils.parseUnits("1", "ether").toString();
      disputeResolverFees = [
        new DisputeResolverFee(ethers.constants.AddressZero, "Native", "0"),
        new DisputeResolverFee(mockToken.address, "mockToken", DRFee),
      ];

      // Make empty seller list, so every seller is allowed
      const sellerAllowList = [];
      buyerEscalationDeposit = applyPercentage(DRFee, buyerEscalationDepositPercentage);

      // Register and activate the dispute resolver
      await accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
      await accountHandler.connect(deployer).activateDisputeResolver(++nextAccountId);

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
        offerHandler.connect(operator).createOffer(offerNative, offerDates, offerDurations, disputeResolverId, agentId),
        offerHandler.connect(operator).createOffer(offerToken, offerDates, offerDurations, disputeResolverId, agentId),
      ]);

      // Set used variables
      price = offerToken.price;
      offerTokenProtocolFee = mo.offerFees.protocolFee;
      sellerDeposit = offerToken.sellerDeposit;
      voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
      resolutionPeriod = offerDurations.resolutionPeriod;

      // top up seller's and buyer's account
      await mockToken.mint(operator.address, `${2 * sellerDeposit}`);
      await mockToken.mint(buyer.address, `${2 * price}`);

      // approve protocol to transfer the tokens
      await mockToken.connect(operator).approve(protocolDiamond.address, `${2 * sellerDeposit}`);
      await mockToken.connect(buyer).approve(protocolDiamond.address, `${2 * price}`);

      // deposit to seller's pool
      await fundsHandler.connect(operator).depositFunds(seller.id, mockToken.address, `${2 * sellerDeposit}`);
      await fundsHandler
        .connect(operator)
        .depositFunds(seller.id, ethers.constants.AddressZero, `${2 * sellerDeposit}`, {
          value: `${2 * sellerDeposit}`,
        });

      // Agents
      // Create a valid agent,
      agentId = "3";
      agentFeePercentage = "500"; //5%
      active = true;
      agent = new Agent(agentId, agentFeePercentage, other.address, active);
      expect(agent.isValid()).is.true;

      // Create an agent
      await accountHandler.connect(rando).createAgent(agent);

      agentOffer = offerToken.clone();
      agentOffer.id = "3";
      agentOfferProtocolFee = mo.offerFees.protocolFee;

      randoBuyerId = "4"; // 1: seller, 2: disputeResolver, 3: agent, 4: rando
    });

    context("👉 encumberFunds()", async function () {
      it("should emit a FundsEncumbered event", async function () {
        let buyerId = "3"; // 1: seller, 2: disputeResolver, 3: buyer

        // Commit to an offer with erc20 token, test for FundsEncumbered event
        await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id))
          .to.emit(exchangeHandler, "FundsEncumbered")
          .withArgs(buyerId, mockToken.address, price)
          .to.emit(exchangeHandler, "FundsEncumbered")
          .withArgs(sellerId, mockToken.address, sellerDeposit, buyer.address);

        // Commit to an offer with native currency, test for FundsEncumbered event
        await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerNative.id, { value: price }))
          .to.emit(exchangeHandler, "FundsEncumbered")
          .withArgs(buyerId, ethers.constants.AddressZero, price, buyer.address)
          .to.emit(exchangeHandler, "FundsEncumbered")
          .withArgs(sellerId, ethers.constants.AddressZero, sellerDeposit, buyer.address);
      });

      it("should update state", async function () {
        // contract token value
        const contractTokenBalanceBefore = await mockToken.balanceOf(protocolDiamond.address);
        // contract native token balance
        const contractNativeBalanceBefore = await ethers.provider.getBalance(protocolDiamond.address);
        // seller's available funds
        const sellersAvailableFundsBefore = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));

        // Commit to an offer with tokens
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

        // Commit to an offer with tokens
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
        // native currecny is the second on the list of the available funds and the amount should be decreased for the sellerDeposit
        expect(
          ethers.BigNumber.from(sellersAvailableFundsBefore.funds[1].availableAmount)
            .sub(ethers.BigNumber.from(sellersAvailableFundsAfter.funds[1].availableAmount))
            .toString()
        ).to.eql(sellerDeposit, "Native currency seller available funds mismatch");
      });

      it("if seller's available funds drop to 0, token should be removed from the tokenList", async function () {
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

        // Token address should be removed and have only native currency in the list
        sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
        expect(sellersAvailableFunds.funds.length).to.eql(0, "Funds length mismatch");
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

      context("💔 Revert Reasons", async function () {
        it("Insufficient native currency sent", async function () {
          // Attempt to commit to an offer, expecting revert
          await expect(
            exchangeHandler
              .connect(buyer)
              .commitToOffer(buyer.address, offerNative.id, { value: ethers.BigNumber.from(price).sub("1").toString() })
          ).to.revertedWith(RevertReasons.INSUFFICIENT_VALUE_SENT);
        });

        it("Native currency sent together with ERC20 token transfer", async function () {
          // Attempt to commit to an offer, expecting revert
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id, { value: price })
          ).to.revertedWith(RevertReasons.NATIVE_NOT_ALLOWED);
        });

        it("Token address contract does not support transferFrom", async function () {
          // Deploy a contract without the transferFrom
          [bosonToken] = await deployMockTokens(gasLimit, ["BosonToken"]);

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
            .connect(operator)
            .createOffer(offerToken, offerDates, offerDurations, disputeResolverId, agentId);

          // Attempt to commit to an offer, expecting revert
          await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id)).to.revertedWith(
            RevertReasons.TOKEN_TRANSFER_FAILED
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
            .connect(operator)
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
            .connect(operator)
            .createOffer(offerToken, offerDates, offerDurations, disputeResolverId, agentId);

          // Attempt to commit to an offer, expecting revert
          await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id)).to.revertedWith(
            RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS
          );

          // create an offer with native currency with higher seller deposit
          offerNative.sellerDeposit = ethers.BigNumber.from(offerNative.sellerDeposit).mul("4");
          offerNative.id = "4";
          await offerHandler
            .connect(operator)
            .createOffer(offerNative, offerDates, offerDurations, disputeResolverId, agentId);

          // Attempt to commit to an offer, expecting revert
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerNative.id, { value: price })
          ).to.revertedWith(RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS);
        });
      });
    });

    context("👉 releaseFunds()", async function () {
      beforeEach(async function () {
        // ids
        protocolId = "0";
        sellerId = "1";
        // disputeResolverId = "2";
        agentId = "3";
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
          await expect(exchangeHandler.connect(buyer).completeExchange(exchangeId))
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(exchangeId, sellerId, offerToken.exchangeToken, sellerPayoff, buyer.address)
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, buyer.address)
            .to.emit(exchangeHandler, "ProtocolFeeCollected")
            .withArgs(exchangeId, offerToken.exchangeToken, protocolPayoff, buyer.address);
        });

        it("should update state", async function () {
          // commit again, so seller has nothing in available funds
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id);

          // Read on chain state
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
              .connect(operator)
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
              .withArgs(exchangeId, sellerId, agentOffer.exchangeToken, sellerPayoff, buyer.address);

            await expect(tx)
              .to.emit(exchangeHandler, "ProtocolFeeCollected")
              .withArgs(exchangeId, agentOffer.exchangeToken, protocolPayoff, buyer.address);

            await expect(tx)
              .to.emit(exchangeHandler, "FundsReleased")
              .withArgs(exchangeId, agentId, agentOffer.exchangeToken, agentPayoff, buyer.address);
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
          await expect(exchangeHandler.connect(operator).revokeVoucher(exchangeId))
            .to.not.emit(exchangeHandler, "FundsReleased")
            .withArgs(exchangeId, sellerId, offerToken.exchangeToken, sellerPayoff, operator.address)
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, operator.address)
            .to.not.emit(exchangeHandler, "ProtocolFeeCollected")
            .withArgs(exchangeId, offerToken.exchangeToken, protocolPayoff, operator.address);
        });

        it("should update state", async function () {
          // Read on chain state
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
          await exchangeHandler.connect(operator).revokeVoucher(exchangeId);

          // Available funds should be increased for
          // buyer: sellerDeposit + price
          // seller: 0
          // protocol: 0
          // agent: 0
          expectedBuyerAvailableFunds.funds.push(new Funds(mockToken.address, "Foreign20", buyerPayoff));
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
          await exchangeHandler.connect(operator).revokeVoucher(++exchangeId);

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
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
              .connect(operator)
              .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id);

            // top up seller's and buyer's account
            await mockToken.mint(operator.address, `${2 * sellerDeposit}`);
            await mockToken.mint(buyer.address, `${2 * price}`);

            // approve protocol to transfer the tokens
            await mockToken.connect(operator).approve(protocolDiamond.address, `${2 * sellerDeposit}`);
            await mockToken.connect(buyer).approve(protocolDiamond.address, `${2 * price}`);

            // deposit to seller's pool
            await fundsHandler.connect(operator).depositFunds(seller.id, mockToken.address, `${2 * sellerDeposit}`);

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
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
            await exchangeHandler.connect(operator).revokeVoucher(exchangeId);

            // Available funds should be increased for
            // buyer: sellerDeposit + price
            // seller: 0
            // protocol: 0
            // agent: 0
            expectedBuyerAvailableFunds.funds.push(new Funds(mockToken.address, "Foreign20", buyerPayoff));
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
            await exchangeHandler.connect(operator).revokeVoucher(++exchangeId);

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
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
          await expect(exchangeHandler.connect(buyer).cancelVoucher(exchangeId))
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(exchangeId, sellerId, offerToken.exchangeToken, sellerPayoff, buyer.address)
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, buyer.address)
            .to.not.emit(exchangeHandler, "ProtocolFeeCollected")
            .withArgs(exchangeId, offerToken.exchangeToken, protocolPayoff, buyer.address);
        });

        it("should update state", async function () {
          // Read on chain state
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
              .connect(operator)
              .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id);

            // top up seller's and buyer's account
            await mockToken.mint(operator.address, `${2 * sellerDeposit}`);
            await mockToken.mint(buyer.address, `${2 * price}`);

            // approve protocol to transfer the tokens
            await mockToken.connect(operator).approve(protocolDiamond.address, `${2 * sellerDeposit}`);
            await mockToken.connect(buyer).approve(protocolDiamond.address, `${2 * price}`);

            // deposit to seller's pool
            await fundsHandler.connect(operator).depositFunds(seller.id, mockToken.address, `${sellerDeposit}`);

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
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
          await deployProtocolHandlerFacets(protocolDiamond, ["DisputeHandlerFacet"]);

          // Cast Diamond to IBosonDisputeHandler
          disputeHandler = await ethers.getContractAt("IBosonDisputeHandler", protocolDiamond.address);

          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // succesfully redeem exchange
          await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

          // raise the dispute
          tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId, "Wrong size");

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
              .withArgs(exchangeId, offerToken.exchangeToken, protocolPayoff, buyer.address)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, sellerId, offerToken.exchangeToken, sellerPayoff, buyer.address);
            // .to.not.emit(disputeHandler, "FundsReleased") // TODO: is possible to make sure event with exact args was not emitted?
            // .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, buyer.address);
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
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
                .connect(operator)
                .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id);
              await exchangeHandler.connect(buyer).commitToOffer(buyer.address, agentOffer.id);

              // succesfully redeem exchange
              await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

              // raise the dispute
              await disputeHandler.connect(buyer).raiseDispute(exchangeId, "Wrong size");
            });

            it("should emit a FundsReleased event", async function () {
              // Retract from the dispute, expecting event
              const tx = await disputeHandler.connect(buyer).retractDispute(exchangeId);

              await expect(tx)
                .to.emit(disputeHandler, "ProtocolFeeCollected")
                .withArgs(exchangeId, offerToken.exchangeToken, protocolPayoff, buyer.address);

              await expect(tx)
                .to.emit(disputeHandler, "FundsReleased")
                .withArgs(exchangeId, sellerId, offerToken.exchangeToken, sellerPayoff, buyer.address);

              await expect(tx)
                .to.emit(exchangeHandler, "FundsReleased")
                .withArgs(exchangeId, agentId, agentOffer.exchangeToken, agentPayoff, buyer.address);
            });

            it("should update state", async function () {
              // Read on chain state
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
            await expect(disputeHandler.connect(rando).expireDispute(exchangeId))
              .to.emit(disputeHandler, "ProtocolFeeCollected")
              .withArgs(exchangeId, offerToken.exchangeToken, protocolPayoff, rando.address)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, sellerId, offerToken.exchangeToken, sellerPayoff, rando.address);
            // .to.not.emit(disputeHandler, "FundsReleased") // TODO: is possible to make sure event with exact args was not emitted?
            // .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, rando.address);
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
                .connect(operator)
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
              tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId, "Wrong size");

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
                .withArgs(exchangeId, sellerId, agentOffer.exchangeToken, sellerPayoff, rando.address);

              await expect(tx)
                .to.emit(exchangeHandler, "ProtocolFeeCollected")
                .withArgs(exchangeId, agentOffer.exchangeToken, protocolPayoff, rando.address);
            });

            it("should update state", async function () {
              // Read on chain state
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
            buyerPercent = "5566"; // 55.66%

            // expected payoffs
            // buyer: (price + sellerDeposit)*buyerPercentage
            buyerPayoff = ethers.BigNumber.from(offerToken.price)
              .add(offerToken.sellerDeposit)
              .mul(buyerPercent)
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
              { name: "buyerPercent", type: "uint256" },
            ];

            customSignatureType = {
              Resolution: resolutionType,
            };

            message = {
              exchangeId: exchangeId,
              buyerPercent,
            };

            // Collect the signature components
            ({ r, s, v } = await prepareDataSignatureParameters(
              buyer, // Operator is the caller, seller should be the signer.
              customSignatureType,
              "Resolution",
              message,
              disputeHandler.address
            ));
          });

          it("should emit a FundsReleased event", async function () {
            // Resolve the dispute, expecting event
            await expect(disputeHandler.connect(operator).resolveDispute(exchangeId, buyerPercent, r, s, v))
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, sellerId, offerToken.exchangeToken, sellerPayoff, operator.address)
              .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, operator.address)
              .to.not.emit(disputeHandler, "ProtocolFeeCollected")
              .withArgs(exchangeId, offerToken.exchangeToken, protocolPayoff, operator.address);
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
            await disputeHandler.connect(operator).resolveDispute(exchangeId, buyerPercent, r, s, v);

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
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
                .connect(operator)
                .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id);

              // Commit to Offer
              await exchangeHandler.connect(buyer).commitToOffer(buyer.address, agentOffer.id);

              exchangeId = "2";

              // succesfully redeem exchange
              await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

              // raise the dispute
              await disputeHandler.connect(buyer).raiseDispute(exchangeId, "Wrong size");

              buyerPercent = "5566"; // 55.66%

              // expected payoffs
              // buyer: (price + sellerDeposit)*buyerPercentage
              buyerPayoff = ethers.BigNumber.from(agentOffer.price)
                .add(agentOffer.sellerDeposit)
                .mul(buyerPercent)
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
                { name: "buyerPercent", type: "uint256" },
              ];

              customSignatureType = {
                Resolution: resolutionType,
              };

              message = {
                exchangeId: exchangeId,
                buyerPercent,
              };

              // Collect the signature components
              ({ r, s, v } = await prepareDataSignatureParameters(
                buyer, // Operator is the caller, seller should be the signer.
                customSignatureType,
                "Resolution",
                message,
                disputeHandler.address
              ));
            });

            it("should update state", async function () {
              // Read on chain state
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
              await disputeHandler.connect(operator).resolveDispute(exchangeId, buyerPercent, r, s, v);

              // Available funds should be increased for
              // buyer: (price + sellerDeposit)*buyerPercentage
              // seller: (price + sellerDeposit)*(1-buyerPercentage);
              // protocol: 0
              // agent: 0
              expectedSellerAvailableFunds.funds.push(
                new Funds(mockToken.address, "Foreign20", ethers.BigNumber.from(sellerPayoff).toString())
              );
              expectedBuyerAvailableFunds = new FundsList([new Funds(mockToken.address, "Foreign20", buyerPayoff)]);
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
              .withArgs(exchangeId, offerToken.exchangeToken, protocolPayoff, buyer.address)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, sellerId, offerToken.exchangeToken, sellerPayoff, buyer.address);
            // .to.not.emit(disputeHandler, "FundsReleased") // TODO: is possible to make sure event with exact args was not emitted?
            // .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, buyer.address);
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
                .connect(operator)
                .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id);

              // approve protocol to transfer the tokens
              await mockToken.connect(buyer).approve(protocolDiamond.address, agentOffer.price);
              await mockToken.mint(buyer.address, agentOffer.price);
              await exchangeHandler.connect(buyer).commitToOffer(buyer.address, agentOffer.id);

              // succesfully redeem exchange
              await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

              // raise the dispute
              await disputeHandler.connect(buyer).raiseDispute(exchangeId, "Wrong size");

              // escalate the dispute
              await mockToken.mint(buyer.address, buyerEscalationDeposit);
              await mockToken.connect(buyer).approve(protocolDiamond.address, buyerEscalationDeposit);
              await disputeHandler.connect(buyer).escalateDispute(exchangeId);
            });

            it("should update state", async function () {
              // Read on chain state
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
            buyerPercent = "5566"; // 55.66%

            // expected payoffs
            // buyer: (price + sellerDeposit + buyerEscalationDeposit)*buyerPercentage
            buyerPayoff = ethers.BigNumber.from(offerToken.price)
              .add(offerToken.sellerDeposit)
              .add(buyerEscalationDeposit)
              .mul(buyerPercent)
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
              { name: "buyerPercent", type: "uint256" },
            ];

            customSignatureType = {
              Resolution: resolutionType,
            };

            message = {
              exchangeId: exchangeId,
              buyerPercent,
            };

            // Collect the signature components
            ({ r, s, v } = await prepareDataSignatureParameters(
              buyer, // Operator is the caller, seller should be the signer.
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
            await expect(disputeHandler.connect(operator).resolveDispute(exchangeId, buyerPercent, r, s, v))
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, sellerId, offerToken.exchangeToken, sellerPayoff, operator.address)
              .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, operator.address)
              .to.not.emit(disputeHandler, "ProtocolFeeCollected")
              .withArgs(exchangeId, offerToken.exchangeToken, protocolPayoff, operator.address);
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
            await disputeHandler.connect(operator).resolveDispute(exchangeId, buyerPercent, r, s, v);

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
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
                .connect(operator)
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
              await disputeHandler.connect(buyer).raiseDispute(exchangeId, "Wrong size");

              buyerPercent = "5566"; // 55.66%

              // expected payoffs
              // buyer: (price + sellerDeposit + buyerEscalationDeposit)*buyerPercentage
              buyerPayoff = ethers.BigNumber.from(agentOffer.price)
                .add(agentOffer.sellerDeposit)
                .add(buyerEscalationDeposit)
                .mul(buyerPercent)
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
                { name: "buyerPercent", type: "uint256" },
              ];

              customSignatureType = {
                Resolution: resolutionType,
              };

              message = {
                exchangeId: exchangeId,
                buyerPercent,
              };

              // Collect the signature components
              ({ r, s, v } = await prepareDataSignatureParameters(
                buyer, // Operator is the caller, seller should be the signer.
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
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
              await disputeHandler.connect(operator).resolveDispute(exchangeId, buyerPercent, r, s, v);

              // Available funds should be increased for
              // buyer: (price + sellerDeposit + buyerEscalationDeposit)*buyerPercentage
              // seller: (price + sellerDeposit + buyerEscalationDeposit)*(1-buyerPercentage);
              // protocol: 0
              // agent: 0
              expectedSellerAvailableFunds.funds.push(
                new Funds(mockToken.address, "Foreign20", ethers.BigNumber.from(sellerPayoff).toString())
              );
              expectedBuyerAvailableFunds = new FundsList([new Funds(mockToken.address, "Foreign20", buyerPayoff)]);
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
            buyerPercent = "5566"; // 55.66%

            // expected payoffs
            // buyer: (price + sellerDeposit + buyerEscalationDeposit)*buyerPercentage
            buyerPayoff = ethers.BigNumber.from(offerToken.price)
              .add(offerToken.sellerDeposit)
              .add(buyerEscalationDeposit)
              .mul(buyerPercent)
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
            await expect(disputeHandler.connect(operatorDR).decideDispute(exchangeId, buyerPercent))
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, sellerId, offerToken.exchangeToken, sellerPayoff, operatorDR.address)
              .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, operatorDR.address)
              .to.not.emit(disputeHandler, "ProtocolFeeCollected")
              .withArgs(exchangeId, offerToken.exchangeToken, protocolPayoff, operatorDR.address);
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
            await disputeHandler.connect(operatorDR).decideDispute(exchangeId, buyerPercent);

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
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
                .connect(operator)
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
              tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId, "Wrong size");

              // Get the block timestamp of the confirmed tx and set disputedDate
              blockNumber = tx.blockNumber;
              block = await ethers.provider.getBlock(blockNumber);
              disputedDate = block.timestamp.toString();
              timeout = ethers.BigNumber.from(disputedDate).add(resolutionPeriod).toString();

              buyerPercent = "5566"; // 55.66%

              // expected payoffs
              // buyer: (price + sellerDeposit + buyerEscalationDeposit)*buyerPercentage
              buyerPayoff = ethers.BigNumber.from(agentOffer.price)
                .add(agentOffer.sellerDeposit)
                .add(buyerEscalationDeposit)
                .mul(buyerPercent)
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
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
              await disputeHandler.connect(operatorDR).decideDispute(exchangeId, buyerPercent);

              // Available funds should be increased for
              // buyer: (price + sellerDeposit + buyerEscalationDeposit)*buyerPercentage
              // seller: (price + sellerDeposit + buyerEscalationDeposit)*(1-buyerPercentage);
              // protocol: 0
              // agent: 0
              expectedSellerAvailableFunds.funds.push(
                new Funds(mockToken.address, "Foreign20", ethers.BigNumber.from(sellerPayoff).toString())
              );
              expectedBuyerAvailableFunds = new FundsList([new Funds(mockToken.address, "Foreign20", buyerPayoff)]);
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
              await expect(disputeHandler.connect(rando).expireEscalatedDispute(exchangeId))
                .to.emit(disputeHandler, "FundsReleased")
                .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, rando.address)
                .to.not.emit(disputeHandler, "ProtocolFeeCollected")
                .withArgs(exchangeId, offerToken.exchangeToken, protocolPayoff, rando.address);
              // .to.not.emit(disputeHandler, "FundsReleased") // TODO: is possible to make sure event with exact args was not emitted?
              // .withArgs(exchangeId, sellerId, offerToken.exchangeToken, sellerPayoff, rando.address);
            });

            it("should update state", async function () {
              // Read on chain state
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
                  .connect(operator)
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
                tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId, "Wrong size");

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
                sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
                sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
              await expect(disputeHandler.connect(operatorDR).refuseEscalatedDispute(exchangeId))
                .to.emit(disputeHandler, "FundsReleased")
                .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, rando.address)
                .to.not.emit(disputeHandler, "ProtocolFeeCollected")
                .withArgs(exchangeId, offerToken.exchangeToken, protocolPayoff, rando.address);
              // .to.not.emit(disputeHandler, "FundsReleased") // TODO: is possible to make sure event with exact args was not emitted?
              // .withArgs(exchangeId, sellerId, offerToken.exchangeToken, sellerPayoff, rando.address);
            });

            it("should update state", async function () {
              // Read on chain state
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
              await disputeHandler.connect(operatorDR).refuseEscalatedDispute(exchangeId);

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
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
                  .connect(operator)
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
                await disputeHandler.connect(buyer).raiseDispute(exchangeId, "Wrong size");

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
                sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
                await disputeHandler.connect(operatorDR).refuseEscalatedDispute(exchangeId);

                // Available funds should be increased for
                // buyer: price + buyerEscalationDeposit
                // seller: sellerDeposit;
                // protocol: 0
                // agent: 0
                expectedBuyerAvailableFunds.funds[0] = new Funds(mockToken.address, "Foreign20", buyerPayoff);
                expectedSellerAvailableFunds.funds.push(
                  new Funds(mockToken.address, "Foreign20", ethers.BigNumber.from(sellerPayoff).toString())
                );
                sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
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
          await expect(exchangeHandler.connect(buyer).completeExchange(exchangeId))
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(exchangeId, sellerId, offerToken.exchangeToken, sellerPayoff, buyer.address)
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, buyer.address)
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
          await expect(exchangeHandler.connect(buyer).completeExchange(exchangeId))
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(exchangeId, sellerId, offerToken.exchangeToken, sellerPayoff, buyer.address)
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, buyer.address)
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
              .connect(operator)
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
              .withArgs(exchangeId, sellerId, agentOffer.exchangeToken, sellerPayoff, buyer.address);

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
            await mockToken.mint(operator.address, sellerDeposit);
            await mockToken.mint(buyer.address, price);

            // approve protocol to transfer the tokens
            await mockToken.connect(operator).approve(protocolDiamond.address, sellerDeposit);
            await mockToken.connect(buyer).approve(protocolDiamond.address, price);

            // deposit to seller's pool
            await fundsHandler.connect(operator).depositFunds(seller.id, mockToken.address, sellerDeposit);

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
              .withArgs(exchangeId, sellerId, agentOffer.exchangeToken, sellerPayoff, buyer.address);

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
