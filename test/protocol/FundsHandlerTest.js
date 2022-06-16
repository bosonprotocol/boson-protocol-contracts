const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");
const { gasLimit } = require("../../environments");

const Role = require("../../scripts/domain/Role");
const Seller = require("../../scripts/domain/Seller");
const DisputeResolver = require("../../scripts/domain/DisputeResolver");
const { Funds, FundsList } = require("../../scripts/domain/Funds");
const Offer = require("../../scripts/domain/Offer");
const OfferDates = require("../../scripts/domain/OfferDates");
const OfferDurations = require("../../scripts/domain/OfferDurations");

const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const {
  setNextBlockTimestamp,
  calculateProtocolFee,
  getEvent,
  prepareDataSignatureParameters,
} = require("../../scripts/util/test-utils.js");

/**
 *  Test the Boson Funds Handler interface
 */
describe("IBosonFundsHandler", function () {
  // Common vars
  let InterfaceIds;
  let accounts, deployer, rando, operator, admin, clerk, treasury, feeCollector, disputeResolver;
  let erc165,
    protocolDiamond,
    accessController,
    accountHandler,
    fundsHandler,
    exchangeHandler,
    offerHandler,
    configHandler,
    bosonVoucher,
    disputeHandler;
  let support, oneMonth, oneWeek;
  let seller, active;
  let id, buyer, offerToken, offerNative, sellerId;
  let mockToken, bosonToken;
  let depositAmount;
  let offerId,
    price,
    sellerDeposit,
    protocolFee,
    buyerCancelPenalty,
    quantityAvailable,
    exchangeToken,
    disputeResolverId,
    metadataUri,
    metadataHash,
    voided;
  let validFrom, validUntil, voucherRedeemableFrom, voucherRedeemableUntil, offerDates;
  let fulfillmentPeriod, voucherValid, resolutionPeriod, offerDurations;
  let protocolFeePercentage, protocolFeeFlatBoson;
  let block, blockNumber;
  let protocolId, exchangeId, buyerId, sellerPayoff, buyerPayoff, protocolPayoff;
  let sellersAvailableFunds,
    buyerAvailableFunds,
    protocolAvailableFunds,
    expectedSellerAvailableFunds,
    expectedBuyerAvailableFunds,
    expectedProtocolAvailableFunds;
  let tokenListSeller, tokenListBuyer, tokenAmountsSeller, tokenAmountsBuyer, tokenList, tokenAmounts;
  let tx, txReceipt, txCost, event;
  let disputeResolverEntity;
  let buyerPercent;
  let resolutionType, customSignatureType, message, r, s, v;
  let disputedDate, timeout;

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
    buyer = accounts[6];
    feeCollector = accounts[7];
    disputeResolver = accounts[8];

    // Deploy the Protocol Diamond
    [protocolDiamond, , , accessController] = await deployProtocolDiamond();

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Grant PROTOCOL role to ProtocolDiamond address and renounces admin
    await accessController.grantRole(Role.PROTOCOL, protocolDiamond.address);

    // Cut the protocol handler facets into the Diamond
    await deployProtocolHandlerFacets(protocolDiamond, [
      "AccountHandlerFacet",
      "FundsHandlerFacet",
      "ExchangeHandlerFacet",
      "OfferHandlerFacet",
    ]);

    // Deploy the Protocol client implementation/proxy pairs (currently just the Boson Voucher)
    const protocolClientArgs = [accessController.address, protocolDiamond.address];
    [, , [bosonVoucher]] = await deployProtocolClients(protocolClientArgs, gasLimit);

    // Deploy the boson token
    [bosonToken] = await deployMockTokens(gasLimit, ["BosonToken"]);

    // set protocolFees
    protocolFeePercentage = "200"; // 2 %
    protocolFeeFlatBoson = ethers.utils.parseUnits("0.01", "ether").toString();

    // Add config Handler, so offer id starts at 1
    const protocolConfig = [
      // Protocol addresses
      {
        treasuryAddress: "0x0000000000000000000000000000000000000000",
        tokenAddress: bosonToken.address,
        voucherAddress: bosonVoucher.address,
      },
      // Protocol limits
      {
        maxOffersPerGroup: 100,
        maxTwinsPerBundle: 100,
        maxOffersPerBundle: 100,
        maxOffersPerBatch: 100,
        maxTokensPerWithdrawal: 100,
      },
      // Protocol fees
      {
        percentage: protocolFeePercentage,
        flatBoson: protocolFeeFlatBoson,
      },
    ];

    await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);

    // Cast Diamond to IERC165
    erc165 = await ethers.getContractAt("IERC165", protocolDiamond.address);

    // Cast Diamond to IBosonAccountHandler
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

      await accountHandler.connect(admin).createSeller(seller);

      // top up operators account
      await mockToken.mint(operator.address, "1000000");

      // approve protocol to transfer the tokens
      await mockToken.connect(operator).approve(protocolDiamond.address, "1000000");

      // set the deposit amount
      depositAmount = "100";
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
        id = sellerId = exchangeId = "1";
        buyerId = "3"; // created after a seller and a dispute resolver

        // Create a valid dispute resolver
        active = true;
        disputeResolverEntity = new DisputeResolver(id, disputeResolver.address, active);
        expect(disputeResolverEntity.isValid()).is.true;

        // Register the dispute resolver
        await accountHandler.connect(rando).createDisputeResolver(disputeResolverEntity);

        // Create an offer to commit to
        oneWeek = 604800 * 1000; //  7 days in milliseconds
        oneMonth = 2678400 * 1000; // 31 days in milliseconds

        // Get the current block info
        blockNumber = await ethers.provider.getBlockNumber();
        block = await ethers.provider.getBlock(blockNumber);

        // Required constructor params
        price = ethers.utils.parseUnits("1.5", "ether").toString();
        sellerDeposit = ethers.utils.parseUnits("0.25", "ether").toString();
        protocolFee = calculateProtocolFee(price, protocolFeePercentage);
        buyerCancelPenalty = ethers.utils.parseUnits("0.05", "ether").toString();
        quantityAvailable = "2";
        exchangeToken = mockToken.address; // Mock token addres
        disputeResolverId = "2";
        metadataHash = "QmYXc12ov6F2MZVZwPs5XeCBbf61cW3wKRk8h3D5NTYj4T";
        metadataUri = `https://ipfs.io/ipfs/${metadataHash}`;
        voided = false;

        // Create a valid offer entity
        offerToken = new Offer(
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
          metadataHash,
          voided
        );
        expect(offerToken.isValid()).is.true;

        offerNative = offerToken.clone();
        offerNative.id = "2";
        offerNative.exchangeToken = ethers.constants.AddressZero;
        expect(offerNative.isValid()).is.true;

        // Required constructor params
        validFrom = ethers.BigNumber.from(block.timestamp).toString(); // valid from now
        validUntil = ethers.BigNumber.from(block.timestamp)
          .add(oneMonth * 6)
          .toString(); // until 6 months
        voucherRedeemableFrom = ethers.BigNumber.from(block.timestamp).add(oneWeek).toString(); // redeemable in 1 week
        voucherRedeemableUntil = "0"; // vouchers don't have fixed expiration date

        // Create a valid offerDates, then set fields in tests directly
        offerDates = new OfferDates(validFrom, validUntil, voucherRedeemableFrom, voucherRedeemableUntil);

        // Required constructor params
        fulfillmentPeriod = oneMonth.toString(); // fulfillment period is one month
        voucherValid = oneMonth.toString(); // offers valid for one month
        resolutionPeriod = oneWeek.toString(); // dispute is valid for one month

        // Create a valid offerDurations, then set fields in tests directly
        offerDurations = new OfferDurations(fulfillmentPeriod, voucherValid, resolutionPeriod);

        // Create both offers
        await offerHandler.connect(operator).createOffer(offerToken, offerDates, offerDurations);
        await offerHandler.connect(operator).createOffer(offerNative, offerDates, offerDurations);

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
          protocolPayoff = offerToken.protocolFee;

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
            feeCollectorNativeBalanceBefore.add(protocolFee).sub(txCost),
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
            tokenAmounts = [ethers.BigNumber.from(protocolFee).mul("2")];

            // Attempt to withdraw the funds, expecting revert
            await expect(
              fundsHandler.connect(feeCollector).withdrawProtocolFees(tokenList, tokenAmounts)
            ).to.revertedWith(RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS);
          });

          it("Caller tries to withdraw the same token twice", async function () {
            // Withdraw token
            tokenList = [mockToken.address, mockToken.address];
            tokenAmounts = [protocolFee, protocolFee];

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
                [offerNative.protocolFee]
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
                [offerNative.protocolFee]
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
      offerId = id = sellerId = "1";

      // Create a valid seller
      seller = new Seller(id, operator.address, admin.address, clerk.address, treasury.address, true);
      expect(seller.isValid()).is.true;
      await accountHandler.connect(admin).createSeller(seller);

      // Create a valid dispute resolver
      active = true;
      disputeResolverEntity = new DisputeResolver(id, disputeResolver.address, active);
      expect(disputeResolverEntity.isValid()).is.true;

      // Register the dispute resolver
      await accountHandler.connect(rando).createDisputeResolver(disputeResolverEntity);

      // Create an offer to commit to
      oneWeek = 604800 * 1000; //  7 days in milliseconds
      oneMonth = 2678400 * 1000; // 31 days in milliseconds

      // Get the current block info
      blockNumber = await ethers.provider.getBlockNumber();
      block = await ethers.provider.getBlock(blockNumber);

      // Required constructor params
      price = ethers.utils.parseUnits("1.5", "ether").toString();
      sellerDeposit = ethers.utils.parseUnits("0.25", "ether").toString();
      protocolFee = calculateProtocolFee(price, protocolFeePercentage);
      buyerCancelPenalty = ethers.utils.parseUnits("0.05", "ether").toString();
      quantityAvailable = "2";
      exchangeToken = mockToken.address; // MockToken address
      disputeResolverId = "2";
      metadataHash = "QmYXc12ov6F2MZVZwPs5XeCBbf61cW3wKRk8h3D5NTYj4T";
      metadataUri = `https://ipfs.io/ipfs/${metadataHash}`;
      voided = false;

      // Create a valid offer entity
      offerToken = new Offer(
        offerId,
        sellerId,
        price,
        sellerDeposit,
        protocolFee,
        buyerCancelPenalty,
        quantityAvailable,
        exchangeToken,
        disputeResolverId,
        metadataUri,
        metadataHash,
        voided
      );
      expect(offerToken.isValid()).is.true;

      offerNative = offerToken.clone();
      offerNative.id = "2";
      offerNative.exchangeToken = ethers.constants.AddressZero;
      expect(offerNative.isValid()).is.true;

      // Required constructor params
      validFrom = ethers.BigNumber.from(block.timestamp).toString(); // valid from now
      validUntil = ethers.BigNumber.from(block.timestamp)
        .add(oneMonth * 6)
        .toString(); // until 6 months
      voucherRedeemableFrom = ethers.BigNumber.from(block.timestamp).add(oneWeek).toString(); // redeemable in 1 week
      voucherRedeemableUntil = "0"; // vouchers don't have fixed expiration date

      // Create a valid offerDates, then set fields in tests directly
      offerDates = new OfferDates(validFrom, validUntil, voucherRedeemableFrom, voucherRedeemableUntil);
      expect(offerDates.isValid()).is.true;

      // Required constructor params
      fulfillmentPeriod = oneMonth.toString(); // fulfillment period is one month
      voucherValid = oneMonth.toString(); // offers valid for one month
      resolutionPeriod = oneWeek.toString(); // dispute is valid for one month

      // Create a valid offerDurations, then set fields in tests directly
      offerDurations = new OfferDurations(fulfillmentPeriod, voucherValid, resolutionPeriod);
      expect(offerDurations.isValid()).is.true;

      // Create both offers
      await offerHandler.connect(operator).createOffer(offerToken, offerDates, offerDurations);
      await offerHandler.connect(operator).createOffer(offerNative, offerDates, offerDurations);

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
        let randoBuyerId = "3"; // 1: seller, 2: disputeResolver, 3: rando
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
          await offerHandler.connect(operator).createOffer(offerToken, offerDates, offerDurations);

          // Attempt to commit to an offer, expecting revert
          await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id)).to.revertedWith(
            RevertReasons.TOKEN_TRANSFER_FAILED
          );
        });

        it("Token address is not a contract", async function () {
          // create an offer with a bad token contrat
          offerToken.exchangeToken = admin.address;
          offerToken.id = "3";
          await offerHandler.connect(operator).createOffer(offerToken, offerDates, offerDurations);

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
          await offerHandler.connect(operator).createOffer(offerToken, offerDates, offerDurations);

          // Attempt to commit to an offer, expecting revert
          await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id)).to.revertedWith(
            RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS
          );

          // create an offer with native currency with higher seller deposit
          offerNative.sellerDeposit = ethers.BigNumber.from(offerNative.sellerDeposit).mul("4");
          offerNative.id = "4";
          await offerHandler.connect(operator).createOffer(offerNative, offerDates, offerDurations);

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
        buyerId = "3";
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
            .sub(offerToken.protocolFee)
            .toString();

          // protocol: protocolFee
          protocolPayoff = offerToken.protocolFee;
        });

        it("should emit a FundsReleased event", async function () {
          // Complete the exchange, expecting event
          await expect(exchangeHandler.connect(buyer).completeExchange(exchangeId))
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(exchangeId, sellerId, offerToken.exchangeToken, sellerPayoff, buyer.address)
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, buyer.address)
            .to.emit(exchangeHandler, "ExchangeFee")
            .withArgs(exchangeId, offerToken.exchangeToken, protocolPayoff, buyer.address);
        });

        it("should update state", async function () {
          // commit again, so seller has nothing in available funds
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id);

          // Read on chain state
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));

          // Chain state should match the expected available funds
          expectedSellerAvailableFunds = new FundsList([
            new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
          ]);
          expectedBuyerAvailableFunds = new FundsList([]);
          expectedProtocolAvailableFunds = new FundsList([]);
          expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
          expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
          expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);

          // Complete the exchange so the funds are released
          await exchangeHandler.connect(buyer).completeExchange(exchangeId);

          // Available funds should be increased for
          // buyer: 0
          // seller: sellerDeposit + price - protocolFee
          // protocol: protocolFee
          expectedSellerAvailableFunds.funds.push(new Funds(mockToken.address, "Foreign20", sellerPayoff));
          expectedProtocolAvailableFunds.funds.push(new Funds(mockToken.address, "Foreign20", protocolFee));
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
          expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
          expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
          expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);

          // complete another exchange so we test funds are only updated, no new entry is created
          await exchangeHandler.connect(buyer).redeemVoucher(++exchangeId);
          await exchangeHandler.connect(buyer).completeExchange(exchangeId);

          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
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
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(exchangeId, sellerId, offerToken.exchangeToken, sellerPayoff, operator.address)
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, operator.address)
            .to.emit(exchangeHandler, "ExchangeFee")
            .withArgs(exchangeId, offerToken.exchangeToken, protocolPayoff, operator.address);
        });

        it("should update state", async function () {
          // Read on chain state
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));

          // Chain state should match the expected available funds
          expectedSellerAvailableFunds = new FundsList([
            new Funds(mockToken.address, "Foreign20", sellerDeposit),
            new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
          ]);
          expectedBuyerAvailableFunds = new FundsList([]);
          expectedProtocolAvailableFunds = new FundsList([]);
          expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
          expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
          expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);

          // Revoke the voucher so the funds are released
          await exchangeHandler.connect(operator).revokeVoucher(exchangeId);

          // Available funds should be increased for
          // buyer: sellerDeposit + price
          // seller: 0
          // protocol: 0
          expectedBuyerAvailableFunds.funds.push(new Funds(mockToken.address, "Foreign20", buyerPayoff));
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
          expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
          expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
          expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);

          // Test that if buyer has some funds available, and gets more, the funds are only updated
          // Commit again
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id);

          // Revoke another voucher
          await exchangeHandler.connect(operator).revokeVoucher(++exchangeId);

          // Available funds should be increased for
          // buyer: sellerDeposit + price
          // seller: 0; but during the commitToOffer, sellerDeposit is encumbered
          // protocol: 0
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
          expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
          expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
          expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
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
            .to.emit(exchangeHandler, "ExchangeFee")
            .withArgs(exchangeId, offerToken.exchangeToken, protocolPayoff, buyer.address);
        });

        it("should update state", async function () {
          // Read on chain state
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));

          // Chain state should match the expected available funds
          expectedSellerAvailableFunds = new FundsList([
            new Funds(mockToken.address, "Foreign20", sellerDeposit),
            new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
          ]);
          expectedBuyerAvailableFunds = new FundsList([]);
          expectedProtocolAvailableFunds = new FundsList([]);
          expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
          expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
          expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);

          // Cancel the voucher, so the funds are released
          await exchangeHandler.connect(buyer).cancelVoucher(exchangeId);

          // Available funds should be increased for
          // buyer: price - buyerCancelPenalty
          // seller: sellerDeposit + buyerCancelPenalty; note that seller has sellerDeposit in availableFunds from before
          // protocol: 0
          expectedSellerAvailableFunds.funds[0] = new Funds(
            mockToken.address,
            "Foreign20",
            ethers.BigNumber.from(sellerDeposit).add(sellerPayoff).toString()
          );
          expectedBuyerAvailableFunds.funds.push(new Funds(mockToken.address, "Foreign20", buyerPayoff));
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
          expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
          expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
          expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
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
              .sub(offerToken.protocolFee)
              .toString();

            // protocol: 0
            protocolPayoff = offerToken.protocolFee;
          });

          it("should emit a FundsReleased event", async function () {
            // Retract from the dispute, expecting event
            await expect(disputeHandler.connect(buyer).retractDispute(exchangeId))
              .to.emit(disputeHandler, "ExchangeFee")
              .withArgs(exchangeId, offerToken.exchangeToken, protocolPayoff, buyer.address)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, sellerId, offerToken.exchangeToken, sellerPayoff, buyer.address)
              .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, buyer.address);
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(mockToken.address, "Foreign20", sellerDeposit),
              new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
            ]);
            expectedBuyerAvailableFunds = new FundsList([]);
            expectedProtocolAvailableFunds = new FundsList([]);
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);

            // Retract from the dispute, so the funds are released
            await disputeHandler.connect(buyer).retractDispute(exchangeId);

            // Available funds should be increased for
            // buyer: 0
            // seller: sellerDeposit + price - protocol fee; note that seller has sellerDeposit in availableFunds from before
            // protocol: protocolFee
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
              .sub(offerToken.protocolFee)
              .toString();

            // protocol: protocolFee
            protocolPayoff = offerToken.protocolFee;

            await setNextBlockTimestamp(Number(timeout));
          });

          it("should emit a FundsReleased event", async function () {
            // Expire the dispute, expecting event
            await expect(disputeHandler.connect(rando).expireDispute(exchangeId))
              .to.emit(disputeHandler, "ExchangeFee")
              .withArgs(exchangeId, offerToken.exchangeToken, protocolPayoff, rando.address)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, sellerId, offerToken.exchangeToken, sellerPayoff, rando.address)
              .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, rando.address);
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(mockToken.address, "Foreign20", sellerDeposit),
              new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
            ]);
            expectedBuyerAvailableFunds = new FundsList([]);
            expectedProtocolAvailableFunds = new FundsList([]);
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);

            // Expire the dispute, so the funds are released
            await disputeHandler.connect(rando).expireDispute(exchangeId);

            // Available funds should be increased for
            // buyer: 0
            // seller: sellerDeposit + price - protocol fee; note that seller has sellerDeposit in availableFunds from before
            // protocol: protocolFee
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
          });
        });

        context("Final state DISPUTED - RESOLVED", async function () {
          beforeEach(async function () {
            buyerPercent = "5566"; // 55.66%

            // expected payoffs
            // buyer: 0
            buyerPayoff = ethers.BigNumber.from(offerToken.price)
              .add(offerToken.sellerDeposit)
              .mul(buyerPercent)
              .div("10000")
              .toString();

            // seller: sellerDeposit + price
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
              .to.emit(disputeHandler, "ExchangeFee")
              .withArgs(exchangeId, offerToken.exchangeToken, protocolPayoff, operator.address)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, sellerId, offerToken.exchangeToken, sellerPayoff, operator.address)
              .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, operator.address);
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(mockToken.address, "Foreign20", sellerDeposit),
              new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
            ]);
            expectedBuyerAvailableFunds = new FundsList([]);
            expectedProtocolAvailableFunds = new FundsList([]);
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);

            // Resolve the dispute, so the funds are released
            await disputeHandler.connect(operator).resolveDispute(exchangeId, buyerPercent, r, s, v);

            // Available funds should be increased for
            // buyer: (price + sellerDeposit)*buyerPercentage
            // seller: (price + sellerDeposit)*(1-buyerPercentage); note that seller has sellerDeposit in availableFunds from before
            // protocol: 0
            expectedSellerAvailableFunds.funds[0] = new Funds(
              mockToken.address,
              "Foreign20",
              ethers.BigNumber.from(sellerDeposit).add(sellerPayoff).toString()
            );
            expectedBuyerAvailableFunds = new FundsList([new Funds(mockToken.address, "Foreign20", buyerPayoff)]);
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));

            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
          });
        });

        context("Final state DISPUTED - DECIDED", async function () {
          beforeEach(async function () {
            buyerPercent = "5566"; // 55.66%

            // expected payoffs
            // buyer: 0
            buyerPayoff = ethers.BigNumber.from(offerToken.price)
              .add(offerToken.sellerDeposit)
              .mul(buyerPercent)
              .div("10000")
              .toString();

            // seller: sellerDeposit + price - protocolFee
            sellerPayoff = ethers.BigNumber.from(offerToken.price)
              .add(offerToken.sellerDeposit)
              .sub(buyerPayoff)
              .toString();

            // protocol: 0
            protocolPayoff = 0;

            // escalate the dispute
            await disputeHandler.connect(buyer).escalateDispute(exchangeId);
          });

          it("should emit a FundsReleased event", async function () {
            // Decide the dispute, expecting event
            await expect(disputeHandler.connect(disputeResolver).decideDispute(exchangeId, buyerPercent))
              .to.emit(disputeHandler, "ExchangeFee")
              .withArgs(exchangeId, offerToken.exchangeToken, protocolPayoff, disputeResolver.address)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, sellerId, offerToken.exchangeToken, sellerPayoff, disputeResolver.address)
              .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, disputeResolver.address);
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(mockToken.address, "Foreign20", sellerDeposit),
              new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
            ]);
            expectedBuyerAvailableFunds = new FundsList([]);
            expectedProtocolAvailableFunds = new FundsList([]);
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);

            // Decide the dispute, so the funds are released
            await disputeHandler.connect(disputeResolver).decideDispute(exchangeId, buyerPercent);

            // Available funds should be increased for
            // buyer: (price + sellerDeposit)*buyerPercentage
            // seller: (price + sellerDeposit)*(1-buyerPercentage); note that seller has sellerDeposit in availableFunds from before
            // protocol: 0
            expectedSellerAvailableFunds.funds[0] = new Funds(
              mockToken.address,
              "Foreign20",
              ethers.BigNumber.from(sellerDeposit).add(sellerPayoff).toString()
            );
            expectedBuyerAvailableFunds = new FundsList([new Funds(mockToken.address, "Foreign20", buyerPayoff)]);
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(sellerId));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(protocolId));
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
          });
        });
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
            .sub(offerToken.protocolFee)
            .toString();

          // set the new procol fee
          protocolFeePercentage = "300"; // 3%
          await configHandler.connect(deployer).setProtocolFeePercentage(protocolFeePercentage);
        });

        it("Protocol fee for existing exchanges should be the same as at the offer creation", async function () {
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
            .to.emit(exchangeHandler, "ExchangeFee")
            .withArgs(exchangeId, offerToken.exchangeToken, offerToken.protocolFee, buyer.address);
        });

        it("Protocol fee for new exchanges should be the same as at the offer creation", async function () {
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
            .to.emit(exchangeHandler, "ExchangeFee")
            .withArgs(exchangeId, offerToken.exchangeToken, offerToken.protocolFee, buyer.address);
        });
      });
    });
  });
});
