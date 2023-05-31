const { ethers } = require("hardhat");
const BN = ethers.BigNumber.from;
const { expect, assert } = require("chai");
const Role = require("../../scripts/domain/Role");
const Agreement = require("../../scripts/domain/Agreement");
const { Funds, FundsList } = require("../../scripts/domain/Funds");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const {
  setNextBlockTimestamp,
  getEvent,
  eventEmittedWithArgs,
  prepareDataSignatureParameters,
  applyPercentage,
  calculateContractAddress,
  setupTestEnvironment,
  getSnapshot,
  revertToSnapshot,
  deriveTokenId,
} = require("../util/utils.js");
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
// const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { oneMonth } = require("../util/constants");

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
    mutualizerOwner,
    protocolTreasury;
  let erc165,
    accessController,
    accountHandler,
    fundsHandler,
    exchangeHandler,
    offerHandler,
    configHandler,
    disputeHandler,
    pauseHandler,
    orchestrationHandler;
  let support;
  let seller;
  let buyer, offerToken, offerNative;
  let mockToken, bosonToken;
  let depositAmount;
  let offerTokenProtocolFee, offerNativeProtocolFee, price, sellerDeposit;
  let offerDates, voucherRedeemableFrom;
  let resolutionPeriod, offerDurations;
  let protocolFeePercentage, buyerEscalationDepositPercentage;
  let block, blockNumber;
  let protocolId, exchangeId, buyerId, randoBuyerId, sellerPayoff, buyerPayoff, protocolPayoff, disputeResolverPayoff;
  let sellersAvailableFunds,
    buyerAvailableFunds,
    protocolAvailableFunds,
    expectedSellerAvailableFunds,
    expectedBuyerAvailableFunds,
    expectedProtocolAvailableFunds;
  let tokenListSeller,
    tokenListBuyer,
    tokenListDR,
    tokenAmountsSeller,
    tokenAmountsBuyer,
    tokenAmountsDR,
    tokenList,
    tokenAmounts;
  let tx, txReceipt, txCost, event;
  let disputeResolverFees, disputeResolver, disputeResolverId;
  let buyerPercentBasisPoints;
  let resolutionType, customSignatureType, message, r, s, v;
  let disputedDate, escalatedDate, timeout;
  let voucherInitValues;
  let emptyAuthToken;
  let agent, agentId, agentFeePercentage, agentFee, agentPayoff, agentOffer;
  let DRFeeToken, DRFeeNative, buyerEscalationDeposit;
  let protocolDiamondAddress;
  let snapshotId;
  let mutualizer;

  before(async function () {
    accountId.next(true);

    // get interface Ids
    InterfaceIds = await getInterfaceIds();

    // Specify contracts needed for this test
    const contracts = {
      erc165: "ERC165Facet",
      accountHandler: "IBosonAccountHandler",
      offerHandler: "IBosonOfferHandler",
      exchangeHandler: "IBosonExchangeHandler",
      fundsHandler: "IBosonFundsHandler",
      configHandler: "IBosonConfigHandler",
      pauseHandler: "IBosonPauseHandler",
      disputeHandler: "IBosonDisputeHandler",
      orchestrationHandler: "IBosonOrchestrationHandler",
    };

    ({
      signers: [pauser, admin, treasury, rando, buyer, feeCollector, adminDR, treasuryDR, other, mutualizerOwner],
      contractInstances: {
        erc165,
        accountHandler,
        offerHandler,
        exchangeHandler,
        fundsHandler,
        configHandler,
        pauseHandler,
        disputeHandler,
        orchestrationHandler,
      },
      protocolConfig: [, , { percentage: protocolFeePercentage, buyerEscalationDepositPercentage }],
      diamondAddress: protocolDiamondAddress,
      extraReturnValues: { accessController },
    } = await setupTestEnvironment(contracts));

    // make all account the same
    assistant = clerk = admin;
    assistantDR = clerkDR = adminDR;

    [deployer, protocolTreasury] = await ethers.getSigners();

    // Deploy the mock token
    [mockToken] = await deployMockTokens(["Foreign20"]);

    // Deploy mutualizer
    const mutualizerFactory = await ethers.getContractFactory("DRFeeMutualizer");
    mutualizer = await mutualizerFactory.connect(mutualizerOwner).deploy(fundsHandler.address);

    // Get snapshot id
    snapshotId = await getSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();
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
      await mockToken.connect(assistant).approve(protocolDiamondAddress, "1000000");

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
          ).to.revertedWithoutReason();
        });

        it("Token contract revert for another reason", async function () {
          // insufficient funds
          // approve more than account actually have
          await mockToken.connect(rando).approve(protocolDiamondAddress, depositAmount);
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
          await Foreign20WithFee.connect(assistant).approve(protocolDiamondAddress, depositAmount);

          // Attempt to deposit funds, expecting revert
          await expect(
            fundsHandler.connect(assistant).depositFunds(seller.id, Foreign20WithFee.address, depositAmount)
          ).to.revertedWith(RevertReasons.INSUFFICIENT_VALUE_RECEIVED);
        });

        it("ERC20 transferFrom returns false", async function () {
          const [foreign20ReturnFalse] = await deployMockTokens(["Foreign20TransferFromReturnFalse"]);

          await foreign20ReturnFalse.connect(assistant).mint(assistant.address, depositAmount);
          await foreign20ReturnFalse.connect(assistant).approve(protocolDiamondAddress, depositAmount);

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
        DRFeeToken = DRFeeNative = ethers.utils.parseUnits("0.1", "ether").toString();
        disputeResolverFees = [
          new DisputeResolverFee(ethers.constants.AddressZero, "Native", DRFeeNative),
          new DisputeResolverFee(mockToken.address, "mockToken", DRFeeToken),
        ];

        // Make empty seller list, so every seller is allowed
        const sellerAllowList = [];

        // Register the dispute resolver
        await accountHandler
          .connect(adminDR)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

        // Mock offer
        const { offer, offerDates, offerDurations, offerFees } = await mockOffer();
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
            .createOffer(offerNative, offerDates, offerDurations, disputeResolver.id, agentId),
          offerHandler
            .connect(assistant)
            .createOffer(offerToken, offerDates, offerDurations, disputeResolver.id, agentId),
        ]);

        // Set used variables
        buyerEscalationDeposit = applyPercentage(DRFeeToken, buyerEscalationDepositPercentage);
        const buyerTokens = BN(offerToken.price).add(buyerEscalationDeposit);
        sellerDeposit = BN(offerToken.sellerDeposit).add(DRFeeToken);
        offerTokenProtocolFee = offerNativeProtocolFee = offerFees.protocolFee;

        // top up seller's and buyer's account
        await Promise.all([
          mockToken.mint(assistant.address, sellerDeposit),
          mockToken.mint(buyer.address, buyerTokens),
        ]);

        // approve protocol to transfer the tokens
        await Promise.all([
          mockToken.connect(assistant).approve(protocolDiamondAddress, sellerDeposit),
          mockToken.connect(buyer).approve(protocolDiamondAddress, buyerTokens),
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
          // decide a dispute so seller, buyer and dispute resolver have something to withdraw
          buyerPercentBasisPoints = "5566"; // 55.66%

          await setNextBlockTimestamp(Number(voucherRedeemableFrom));
          await exchangeHandler.connect(buyer).redeemVoucher(exchangeId); // voucher in tokens
          await orchestrationHandler.connect(buyer).raiseAndEscalateDispute(exchangeId);
          await disputeHandler.connect(assistantDR).decideDispute(exchangeId, buyerPercentBasisPoints);

          await exchangeHandler.connect(buyer).redeemVoucher(++exchangeId); // voucher in the native currency
          await orchestrationHandler
            .connect(buyer)
            .raiseAndEscalateDispute(exchangeId, { value: buyerEscalationDeposit });
          await disputeHandler.connect(assistantDR).decideDispute(exchangeId, buyerPercentBasisPoints);

          // expected payoffs - they are the same for token and native currency
          // buyer:
          const pot = BN(offerToken.price).add(offerToken.sellerDeposit).add(buyerEscalationDeposit);
          buyerPayoff = applyPercentage(pot, buyerPercentBasisPoints);

          // seller:
          sellerPayoff = pot.sub(buyerPayoff).toString();

          // dispute resolver:
          disputeResolverPayoff = DRFeeToken;
        });

        it("should emit a FundsWithdrawn event", async function () {
          // Withdraw funds, testing for the event
          // Withdraw tokens
          tokenListSeller = [mockToken.address, ethers.constants.AddressZero];
          tokenListBuyer = [ethers.constants.AddressZero, mockToken.address];
          tokenListDR = [mockToken.address, ethers.constants.AddressZero];

          // Withdraw amounts
          tokenAmountsSeller = [sellerPayoff, BN(sellerPayoff).div("2").toString()];
          tokenAmountsBuyer = [buyerPayoff, BN(buyerPayoff).div("5").toString()];
          tokenAmountsDR = [disputeResolverPayoff, BN(disputeResolverPayoff).div("3").toString()];

          // seller withdrawal
          const tx = await fundsHandler.connect(clerk).withdrawFunds(seller.id, tokenListSeller, tokenAmountsSeller);
          await expect(tx)
            .to.emit(fundsHandler, "FundsWithdrawn")
            .withArgs(seller.id, treasury.address, mockToken.address, sellerPayoff, clerk.address);

          await expect(tx)
            .to.emit(fundsHandler, "FundsWithdrawn")
            .withArgs(seller.id, treasury.address, ethers.constants.Zero, BN(sellerPayoff).div("2"), clerk.address);

          // buyer withdrawal
          const tx2 = await fundsHandler.connect(buyer).withdrawFunds(buyerId, tokenListBuyer, tokenAmountsBuyer);
          await expect(tx2)
            .to.emit(fundsHandler, "FundsWithdrawn")
            .withArgs(buyerId, buyer.address, mockToken.address, BN(buyerPayoff).div("5"), buyer.address);

          await expect(tx2)
            .to.emit(fundsHandler, "FundsWithdrawn")
            .withArgs(buyerId, buyer.address, ethers.constants.Zero, buyerPayoff, buyer.address);

          // DR withdrawal
          const tx3 = await fundsHandler
            .connect(assistantDR)
            .withdrawFunds(disputeResolver.id, tokenListDR, tokenAmountsDR);
          await expect(tx3)
            .to.emit(fundsHandler, "FundsWithdrawn")
            .withArgs(
              disputeResolver.id,
              treasuryDR.address,
              mockToken.address,
              disputeResolverPayoff,
              assistantDR.address
            );

          await expect(tx3)
            .to.emit(fundsHandler, "FundsWithdrawn")
            .withArgs(
              disputeResolver.id,
              treasuryDR.address,
              ethers.constants.Zero,
              BN(disputeResolverPayoff).div("3"),
              assistantDR.address
            );
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
          const withdrawAmount = BN(sellerPayoff).sub(ethers.utils.parseUnits("0.1", "ether")).toString();
          await fundsHandler.connect(clerk).withdrawFunds(seller.id, [ethers.constants.AddressZero], [withdrawAmount]);

          // Read on chain state
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
          const treasuryBalanceAfter = await ethers.provider.getBalance(treasury.address);

          // Chain state should match the expected available funds after the withdrawal
          // Native currency available funds are reduced for the withdrawal amount
          expectedSellerAvailableFunds.funds[1] = new Funds(
            ethers.constants.AddressZero,
            "Native currency",
            BN(sellerPayoff).sub(withdrawAmount).toString()
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
          tokenAmountsSeller = [BN(sellerPayoff).sub(reduction).toString(), reduction];

          // seller withdrawal
          const tx = await fundsHandler.connect(clerk).withdrawFunds(seller.id, tokenListSeller, tokenAmountsSeller);
          await expect(tx)
            .to.emit(fundsHandler, "FundsWithdrawn")
            .withArgs(
              seller.id,
              treasury.address,
              mockToken.address,
              BN(sellerPayoff).sub(reduction).toString(),
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
            await mockToken.connect(assistant).approve(protocolDiamondAddress, sellerDeposit);
            await mockToken.connect(buyer).approve(protocolDiamondAddress, price);

            // deposit to seller's pool
            await fundsHandler.connect(assistant).depositFunds(seller.id, mockToken.address, sellerDeposit);

            // commit to agent offer
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, agentOffer.id);

            // Set time forward to the offer's voucherRedeemableFrom
            await setNextBlockTimestamp(Number(voucherRedeemableFrom));

            // successfully redeem exchange
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
            const expectedFeeCollectorNativeBalanceAfter = BN(feeCollectorNativeBalanceBefore).add(agentPayoff);

            // Check agent wallet balance and verify the transfer really happened.
            expect(feeCollectorNativeBalanceAfter).to.eql(
              expectedFeeCollectorNativeBalanceAfter,
              "Agent did not receive their fee"
            );
          });

          it("Withdraw when dispute is retracted, it emits a FundsWithdrawn event", async function () {
            // raise the dispute
            await disputeHandler.connect(buyer).raiseDispute(exchangeId);

            // retract from the dispute
            await disputeHandler.connect(buyer).retractDispute(exchangeId);

            agentPayoff = BN(agentOffer.price).mul(agent.feePercentage).div("10000").toString();

            // Check the balance BEFORE withdrawFunds()
            const feeCollectorNativeBalanceBefore = await mockToken.balanceOf(agent.wallet);

            await expect(fundsHandler.connect(other).withdrawFunds(agentId, [mockToken.address], [agentPayoff]))
              .to.emit(fundsHandler, "FundsWithdrawn")
              .withArgs(agentId, agent.wallet, mockToken.address, agentPayoff, agent.wallet);

            // Check the balance AFTER withdrawFunds()
            const feeCollectorNativeBalanceAfter = await mockToken.balanceOf(agent.wallet);

            // Expected balance
            const expectedFeeCollectorNativeBalanceAfter = BN(feeCollectorNativeBalanceBefore).add(agentPayoff);

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
            tokenAmountsBuyer = [buyerPayoff, BN(buyerPayoff).div("5").toString()];

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
            tokenAmounts = [BN(sellerPayoff).mul("2")];

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

          it("Transfer of funds failed - revert during ERC20 transfer", async function () {
            // pause mockToken
            await mockToken.pause();

            await expect(fundsHandler.connect(clerk).withdrawFunds(seller.id, [], [])).to.revertedWith(
              RevertReasons.ERC20_PAUSED
            );
          });

          it("Transfer of funds failed - ERC20 transfer returns false", async function () {
            const [foreign20ReturnFalse] = await deployMockTokens(["Foreign20TransferReturnFalse"]);

            await foreign20ReturnFalse.connect(assistant).mint(assistant.address, sellerDeposit);
            await foreign20ReturnFalse.connect(assistant).approve(protocolDiamondAddress, sellerDeposit);

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

          // successfully finalize the exchange so the protocol gets some fees
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));
          await exchangeHandler.connect(buyer).redeemVoucher(tokenExchangeId);
          await exchangeHandler.connect(buyer).redeemVoucher(nativeExchangeId);
          await exchangeHandler.connect(buyer).completeExchange(tokenExchangeId);
          await exchangeHandler.connect(buyer).completeExchange(nativeExchangeId);

          // expected payoffs - they are the same for token and native currency
          // buyer: 0
          buyerPayoff = 0;

          // seller: sellerDeposit + offerToken.price
          sellerPayoff = BN(offerToken.sellerDeposit).add(offerToken.price).toString();

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
          const partialFeeWithdrawAmount = BN(protocolPayoff).sub(ethers.utils.parseUnits("0.01", "ether")).toString();

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
              BN(protocolPayoff).sub(partialFeeWithdrawAmount).toString()
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
          tokenAmounts = [BN(protocolPayoff).sub(reduction).toString(), reduction];

          // protocol fee withdrawal
          const tx = await fundsHandler.connect(feeCollector).withdrawProtocolFees(tokenList, tokenAmounts);
          await expect(tx)
            .to.emit(fundsHandler, "FundsWithdrawn")
            .withArgs(
              protocolId,
              protocolTreasury.address,
              mockToken.address,
              BN(protocolPayoff).sub(reduction).toString(),
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
            tokenAmounts = [BN(offerTokenProtocolFee).mul("2")];

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
        const [mockToken] = await deployMockTokens(["Foreign20NoName"]);
        // top up assistants account
        await mockToken.mint(assistant.address, "1000000");
        // approve protocol to transfer the tokens
        await mockToken.connect(assistant).approve(protocolDiamondAddress, "1000000");

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
      DRFeeToken = ethers.utils.parseUnits("0.1", "ether").toString();
      DRFeeNative = ethers.utils.parseUnits("0.2", "ether").toString();
      disputeResolverFees = [
        new DisputeResolverFee(ethers.constants.AddressZero, "Native", DRFeeNative),
        new DisputeResolverFee(mockToken.address, "mockToken", DRFeeToken),
      ];

      // Make empty seller list, so every seller is allowed
      const sellerAllowList = [];
      buyerEscalationDeposit = applyPercentage(DRFeeToken, buyerEscalationDepositPercentage);

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
      await mockToken.connect(assistant).approve(protocolDiamondAddress, `${2 * sellerDeposit}`);
      await mockToken.connect(buyer).approve(protocolDiamondAddress, `${2 * price}`);

      // deposit to seller's pool
      await fundsHandler.connect(assistant).depositFunds(seller.id, mockToken.address, `${2 * sellerDeposit}`);
      await fundsHandler
        .connect(assistant)
        .depositFunds(seller.id, ethers.constants.AddressZero, `${2 * sellerDeposit}`, {
          value: `${2 * sellerDeposit}`,
        });

      // Agents
      // Create a valid agent
      agent = mockAgent(other.address);
      agentFeePercentage = agent.feePercentage; // 5% (default)

      expect(agent.isValid()).is.true;

      // Create an agent
      await accountHandler.connect(rando).createAgent(agent);

      agentOffer = offerToken.clone();
      agentOffer.id = "3";

      randoBuyerId = "4"; // 1: seller, 2: disputeResolver, 3: agent, 4: rando
    });

    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    context("👉 encumberFunds()", async function () {
      context("Self mutualization", async function () {
        beforeEach(async function () {
          // Create both offers
          await Promise.all([
            offerHandler
              .connect(assistant)
              .createOffer(offerNative, offerDates, offerDurations, disputeResolverId, agentId),
            offerHandler
              .connect(assistant)
              .createOffer(offerToken, offerDates, offerDurations, disputeResolverId, agentId),
          ]);

          // Seller must deposit enough to cover DR fees
          const sellerPoolToken = BN(DRFeeToken).mul(2);
          const sellerPoolNative = BN(DRFeeNative).mul(2);
          await mockToken.mint(assistant.address, sellerPoolToken);

          // approve protocol to transfer the tokens
          await mockToken.connect(assistant).approve(protocolDiamondAddress, sellerPoolToken);

          // deposit to seller's pool
          await fundsHandler.connect(assistant).depositFunds(seller.id, mockToken.address, sellerPoolToken);
          await fundsHandler
            .connect(assistant)
            .depositFunds(seller.id, ethers.constants.AddressZero, sellerPoolNative, {
              value: sellerPoolNative,
            });
        });

        it("should emit a FundsEncumbered event", async function () {
          let buyerId = "4"; // 1: seller, 2: disputeResolver, 3: agent, 4: buyer

          // Commit to an offer with erc20 token, test for FundsEncumbered event
          const tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id);
          await expect(tx)
            .to.emit(exchangeHandler, "FundsEncumbered")
            .withArgs(buyerId, mockToken.address, price, buyer.address);

          await expect(tx)
            .to.emit(exchangeHandler, "FundsEncumbered")
            .withArgs(seller.id, mockToken.address, BN(sellerDeposit).add(DRFeeToken), buyer.address);

          // Commit to an offer with native currency, test for FundsEncumbered event
          const tx2 = await exchangeHandler
            .connect(buyer)
            .commitToOffer(buyer.address, offerNative.id, { value: price });
          await expect(tx2)
            .to.emit(exchangeHandler, "FundsEncumbered")
            .withArgs(buyerId, ethers.constants.AddressZero, price, buyer.address);

          await expect(tx2)
            .to.emit(exchangeHandler, "FundsEncumbered")
            .withArgs(seller.id, ethers.constants.AddressZero, BN(sellerDeposit).add(DRFeeNative), buyer.address);
        });

        it("should update state", async function () {
          // contract token value
          const contractTokenBalanceBefore = await mockToken.balanceOf(protocolDiamondAddress);
          // contract native token balance
          const contractNativeBalanceBefore = await ethers.provider.getBalance(protocolDiamondAddress);
          // seller's available funds
          const sellersAvailableFundsBefore = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));

          // Commit to an offer with erc20 token
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id);

          // Check that token balance increased
          const contractTokenBalanceAfter = await mockToken.balanceOf(protocolDiamondAddress);
          // contract token balance should increase for the incoming price
          // seller's deposit was already held in the contract's pool before
          expect(contractTokenBalanceAfter.sub(contractTokenBalanceBefore).toString()).to.eql(
            price,
            "Token wrong balance increase"
          );

          // Check that seller's pool balance was reduced
          let sellersAvailableFundsAfter = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
          // token is the first on the list of the available funds and the amount should be decreased for the sellerDeposit and DRFee
          expect(
            BN(sellersAvailableFundsBefore.funds[0].availableAmount)
              .sub(BN(sellersAvailableFundsAfter.funds[0].availableAmount))
              .toString()
          ).to.eql(BN(sellerDeposit).add(DRFeeToken).toString(), "Token seller available funds mismatch");

          // Commit to an offer with native currency
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerNative.id, { value: price });

          // check that native currency balance increased
          const contractNativeBalanceAfter = await ethers.provider.getBalance(protocolDiamondAddress);
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
            BN(sellersAvailableFundsBefore.funds[1].availableAmount)
              .sub(BN(sellersAvailableFundsAfter.funds[1].availableAmount))
              .toString()
          ).to.eql(BN(sellerDeposit).add(DRFeeNative).toString(), "Native currency seller available funds mismatch");
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
            await otherToken.connect(assistant).approve(protocolDiamondAddress, sellerDeposit);

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
          let [, buyerStruct] = await accountHandler.getBuyer(randoBuyerId);
          expect(buyerStruct.wallet).to.eql(rando.address, "Wrong buyer address");
        });

        it("if offer is preminted, only sellers funds are encumbered", async function () {
          // deposit to seller's pool to cover for the price
          const buyerId = mockBuyer().id;
          await mockToken.mint(assistant.address, `${2 * price}`);
          await mockToken.connect(assistant).approve(protocolDiamondAddress, `${2 * price}`);
          await fundsHandler.connect(assistant).depositFunds(seller.id, mockToken.address, `${2 * price}`);
          await fundsHandler.connect(assistant).depositFunds(seller.id, ethers.constants.AddressZero, `${2 * price}`, {
            value: `${2 * price}`,
          });

          // get token balance before the commit
          const buyerTokenBalanceBefore = await mockToken.balanceOf(buyer.address);

          const sellersAvailableFundsBefore = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));

          // reserve a range and premint vouchers
          await offerHandler
            .connect(assistant)
            .reserveRange(offerToken.id, offerToken.quantityAvailable, assistant.address);
          const voucherCloneAddress = calculateContractAddress(accountHandler.address, "1");
          const bosonVoucher = await ethers.getContractAt("BosonVoucher", voucherCloneAddress);
          await bosonVoucher.connect(assistant).preMint(offerToken.id, offerToken.quantityAvailable);

          // commit to an offer via preminted voucher
          let exchangeId = "1";
          let tokenId = deriveTokenId(offerToken.id, exchangeId);
          tx = await bosonVoucher.connect(assistant).transferFrom(assistant.address, buyer.address, tokenId);

          // it should emit FundsEncumbered event with amount equal to sellerDeposit + price + DRfee
          let encumberedFunds = BN(sellerDeposit).add(price).add(DRFeeToken);
          await expect(tx)
            .to.emit(exchangeHandler, "FundsEncumbered")
            .withArgs(seller.id, mockToken.address, encumberedFunds, bosonVoucher.address);

          // Check that seller's pool balance was reduced
          let sellersAvailableFundsAfter = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
          // token is the first on the list of the available funds and the amount should be decreased for the sellerDeposit and price
          expect(
            BN(sellersAvailableFundsBefore.funds[0].availableAmount)
              .sub(BN(sellersAvailableFundsAfter.funds[0].availableAmount))
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
          [, exchange] = await exchangeHandler.getExchange(exchangeId);
          expect(exchange.buyerId.toString()).to.eql(buyerId, "Wrong buyer id");

          // get native currency balance before the commit
          const buyerNativeBalanceBefore = await ethers.provider.getBalance(buyer.address);

          // reserve a range and premint vouchers
          exchangeId = await exchangeHandler.getNextExchangeId();
          tokenId = deriveTokenId(offerNative.id, exchangeId);
          await offerHandler
            .connect(assistant)
            .reserveRange(offerNative.id, offerNative.quantityAvailable, assistant.address);
          await bosonVoucher.connect(assistant).preMint(offerNative.id, offerNative.quantityAvailable);

          // commit to an offer via preminted voucher
          tx = await bosonVoucher.connect(assistant).transferFrom(assistant.address, buyer.address, tokenId);

          // it should emit FundsEncumbered event with amount equal to sellerDeposit + price + DRfee
          encumberedFunds = BN(sellerDeposit).add(price).add(DRFeeNative);
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
            BN(sellersAvailableFundsBefore.funds[1].availableAmount)
              .sub(BN(sellersAvailableFundsAfter.funds[1].availableAmount))
              .toString()
          ).to.eql(encumberedFunds.toString(), "Native currency seller available funds mismatch");

          // make sure that buyer is actually the buyer of the exchange
          [, exchange] = await exchangeHandler.getExchange(exchangeId);
          expect(exchange.buyerId.toString()).to.eql(buyerId, "Wrong buyer id");
        });

        context("💔 Revert Reasons", async function () {
          it("Insufficient native currency sent", async function () {
            // Attempt to commit to an offer, expecting revert
            await expect(
              exchangeHandler
                .connect(buyer)
                .commitToOffer(buyer.address, offerNative.id, { value: BN(price).sub("1").toString() })
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
            await expect(
              exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id)
            ).to.revertedWithoutReason();
          });

          it("Token contract revert for another reason", async function () {
            // insufficient funds
            // approve more than account actually have
            await mockToken.connect(rando).approve(protocolDiamondAddress, price);
            // Attempt to commit to an offer, expecting revert
            await expect(exchangeHandler.connect(rando).commitToOffer(rando.address, offerToken.id)).to.revertedWith(
              RevertReasons.ERC20_EXCEEDS_BALANCE
            );

            // not approved
            await mockToken.connect(rando).approve(protocolDiamondAddress, BN(price).sub("1").toString());
            // Attempt to commit to an offer, expecting revert
            await expect(exchangeHandler.connect(rando).commitToOffer(rando.address, offerToken.id)).to.revertedWith(
              RevertReasons.ERC20_INSUFFICIENT_ALLOWANCE
            );
          });

          it("Seller'a availableFunds is less than the required sellerDeposit", async function () {
            // create an offer with token with higher seller deposit
            offerToken.sellerDeposit = BN(offerToken.sellerDeposit).mul("4");
            offerToken.id = "3";
            await offerHandler
              .connect(assistant)
              .createOffer(offerToken, offerDates, offerDurations, disputeResolverId, agentId);

            // Attempt to commit to an offer, expecting revert
            await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id)).to.revertedWith(
              RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS
            );

            // create an offer with native currency with higher seller deposit
            offerNative.sellerDeposit = BN(offerNative.sellerDeposit).mul("4");
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
            await offerHandler
              .connect(assistant)
              .reserveRange(offerToken.id, offerToken.quantityAvailable, assistant.address);
            const voucherCloneAddress = calculateContractAddress(accountHandler.address, "1");
            const bosonVoucher = await ethers.getContractAt("BosonVoucher", voucherCloneAddress);
            await bosonVoucher.connect(assistant).preMint(offerToken.id, offerToken.quantityAvailable);

            // Seller's availableFunds is 2*sellerDeposit which is less than sellerDeposit + price.
            // Add the check in case if the sellerDeposit is changed in the future
            assert.isBelow(Number(sellerDeposit), Number(price), "Seller's availableFunds is not less than price");
            // Attempt to commit to an offer via preminted voucher, expecting revert
            let tokenId = deriveTokenId(offerToken.id, "1");
            await expect(
              bosonVoucher.connect(assistant).transferFrom(assistant.address, buyer.address, tokenId)
            ).to.revertedWith(RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS);

            // reserve a range and premint vouchers for offer in native currency
            exchangeId = await exchangeHandler.getNextExchangeId();
            tokenId = deriveTokenId(offerNative.id, exchangeId);
            await offerHandler
              .connect(assistant)
              .reserveRange(offerNative.id, offerNative.quantityAvailable, assistant.address);
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
            DRFeeToken = ethers.utils.parseUnits("0", "ether").toString();
            await accountHandler
              .connect(adminDR)
              .addFeesToDisputeResolver(disputeResolverId, [
                new DisputeResolverFee(Foreign20WithFee.address, "Foreign20WithFee", DRFeeToken),
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
            await Foreign20WithFee.connect(buyer).approve(protocolDiamondAddress, offerToken.price);

            // Attempt to commit to offer, expecting revert
            await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id)).to.revertedWith(
              RevertReasons.INSUFFICIENT_VALUE_RECEIVED
            );
          });
        });
      });

      context("External mutualizer", async function () {
        beforeEach(async function () {
          offerNative.feeMutualizer = offerToken.feeMutualizer = mutualizer.address;

          // Create both offers
          await Promise.all([
            offerHandler
              .connect(assistant)
              .createOffer(offerNative, offerDates, offerDurations, disputeResolverId, agentId),
            offerHandler
              .connect(assistant)
              .createOffer(offerToken, offerDates, offerDurations, disputeResolverId, agentId),
          ]);

          // Seller must deposit enough to cover DR fees
          const poolToken = BN(DRFeeToken).mul(2);
          const poolNative = BN(DRFeeNative).mul(2);
          await mockToken.mint(mutualizerOwner.address, poolToken);

          // approve protocol to transfer the tokens
          await mockToken.connect(mutualizerOwner).approve(mutualizer.address, poolToken);

          // deposit to mutualizer
          await mutualizer.connect(mutualizerOwner).deposit(mockToken.address, poolToken);
          await mutualizer.connect(mutualizerOwner).deposit(ethers.constants.AddressZero, poolNative, {
            value: poolNative,
          });

          // Create new agreements
          const latestBlock = await ethers.provider.getBlock("latest")
          const startTimestamp = BN(latestBlock.timestamp); // valid from now
          const endTimestamp = startTimestamp.add(oneMonth); // valid for 30 days
          const agreementToken = new Agreement(
            assistant.address,
            mockToken.address,
            ethers.utils.parseUnits("1", "ether"),
            ethers.utils.parseUnits("1", "ether"),
            "0",
            startTimestamp.toString(),
            endTimestamp.toString(),
            false,
            false
          );
          const agreementNative = agreementToken.clone();
          agreementNative.token = ethers.constants.AddressZero;
          await Promise.all([
            mutualizer.connect(mutualizerOwner).newAgreement(agreementToken),
            mutualizer.connect(mutualizerOwner).newAgreement(agreementNative),
          ]);

          // Confirm agreements
          const agreementIdToken = "1";
          const agreementIdNative = "2";

          await Promise.all([
            mutualizer.connect(assistant).payPremium(agreementIdToken),
            mutualizer.connect(assistant).payPremium(agreementIdNative),
          ]);
        });

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

          await expect(tx)
            .to.emit(exchangeHandler, "DRFeeEncumbered")
            .withArgs(mutualizer.address, "1", "1", mockToken.address, DRFeeToken, buyer.address); // ToDo: upgrade hardhat, and use anyValue predicate for UUID field

          // Commit to an offer with native currency, test for FundsEncumbered event
          const tx2 = await exchangeHandler
            .connect(buyer)
            .commitToOffer(buyer.address, offerNative.id, { value: price });
          await expect(tx2)
            .to.emit(exchangeHandler, "FundsEncumbered")
            .withArgs(buyerId, ethers.constants.AddressZero, price, buyer.address);

          await expect(tx2)
            .to.emit(exchangeHandler, "FundsEncumbered")
            .withArgs(seller.id, ethers.constants.AddressZero, sellerDeposit, buyer.address);

          await expect(tx2)
            .to.emit(exchangeHandler, "DRFeeEncumbered")
            .withArgs(mutualizer.address, "2", "2", ethers.constants.AddressZero, DRFeeNative, buyer.address); // ToDo: upgrade hardhat, and use anyValue predicate for UUID field
        });

        it("should update state", async function () {
          // balances before
          const [
            protocolTokenBalanceBefore,
            protocolNativeBalanceBefore,
            sellersAvailableFundsBefore,
            mutualizerTokenBalanceBefore,
            mutualizerNativeBalanceBefore,
          ] = await Promise.all([
            mockToken.balanceOf(protocolDiamondAddress),
            ethers.provider.getBalance(protocolDiamondAddress),
            FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id)),
            mockToken.balanceOf(mutualizer.address),
            ethers.provider.getBalance(mutualizer.address),
          ]);

          // Commit to an offer with erc20 token
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id);

          // Check that token balance increased
          const [protocolTokenBalanceAfter, mutualizerTokenBalanceAfter] = await Promise.all([
            mockToken.balanceOf(protocolDiamondAddress),
            mockToken.balanceOf(mutualizer.address),
          ]);
          // contract token balance should increase for the incoming price and DRFee
          // seller's deposit was already held in the contract's pool before
          expect(protocolTokenBalanceAfter.sub(protocolTokenBalanceBefore).toString()).to.eql(
            BN(price).add(DRFeeToken).toString(),
            "Token wrong balance increase"
          );
          expect(mutualizerTokenBalanceBefore.sub(mutualizerTokenBalanceAfter).toString()).to.eql(
            DRFeeToken,
            "Token wrong balance decrease"
          );

          // Check that seller's pool balance was reduced
          let sellersAvailableFundsAfter = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
          // token is the first on the list of the available funds and the amount should be decreased for the sellerDeposit and DRFee
          expect(
            BN(sellersAvailableFundsBefore.funds[0].availableAmount)
              .sub(BN(sellersAvailableFundsAfter.funds[0].availableAmount))
              .toString()
          ).to.eql(sellerDeposit, "Token seller available funds mismatch");

          // Commit to an offer with native currency
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerNative.id, { value: price });

          // check that native currency balance increased
          const [protocolNativeBalanceAfter, mutualizerNativeBalanceAfter] = await Promise.all([
            ethers.provider.getBalance(protocolDiamondAddress),
            ethers.provider.getBalance(mutualizer.address),
          ]);
          // contract token balance should increase for the incoming price and DRFee
          // seller's deposit was already held in the contract's pool before
          expect(protocolNativeBalanceAfter.sub(protocolNativeBalanceBefore).toString()).to.eql(
            BN(price).add(DRFeeNative).toString(),
            "Native currency wrong balance increase"
          );
          expect(mutualizerNativeBalanceBefore.sub(mutualizerNativeBalanceAfter).toString()).to.eql(
            DRFeeNative,
            "Native currency wrong balance decrease"
          );

          // Check that seller's pool balance was reduced
          sellersAvailableFundsAfter = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
          // native currency is the second on the list of the available funds and the amount should be decreased for the sellerDeposit
          expect(
            BN(sellersAvailableFundsBefore.funds[1].availableAmount)
              .sub(BN(sellersAvailableFundsAfter.funds[1].availableAmount))
              .toString()
          ).to.eql(sellerDeposit, "Native currency seller available funds mismatch");
        });

        context("💔 Revert Reasons", async function () {
          const Mode = { Revert: 0, Decline: 1, SendLess: 2 };
          let mockMutualizer;
          beforeEach(async function () {
            // Deploy mock mutualizer and set it to the offer
            const mockMutualizerFactory = await ethers.getContractFactory("MockDRFeeMutualizer");
            mockMutualizer = await mockMutualizerFactory.deploy();

            await offerHandler.connect(assistant).changeOfferMutualizer(offerToken.id, mockMutualizer.address);
          });

          it("Mutualizer contract reverts on the call", async function () {
            await mockMutualizer.setMode(Mode.Revert);

            // Attempt to commit to offer, expecting revert
            await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id)).to.revertedWith(
              RevertReasons.MUTUALIZER_REVERT
            );
          });

          it("Mutualizer contract declines the request", async function () {
            await mockMutualizer.setMode(Mode.Decline);

            // Attempt to commit to offer, expecting revert
            await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id)).to.revertedWith(
              RevertReasons.SELLER_NOT_COVERED
            );
          });

          it("Mutualizer contract sends less than requested - ERC20", async function () {
            await mockMutualizer.setMode(Mode.SendLess);
            await mockToken.mint(mockMutualizer.address, DRFeeToken);

            // Attempt to commit to offer, expecting revert
            await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id)).to.revertedWith(
              RevertReasons.DR_FEE_NOT_RECEIVED
            );
          });

          it("Mutualizer contract sends less than requested - native", async function () {
            await offerHandler.connect(assistant).changeOfferMutualizer(offerNative.id, mockMutualizer.address);
            await mockMutualizer.setMode(Mode.SendLess);
            await rando.sendTransaction({ to: mockMutualizer.address, value: DRFeeNative });

            // Attempt to commit to offer, expecting revert
            await expect(
              exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerNative.id, { value: price })
            ).to.revertedWith(RevertReasons.DR_FEE_NOT_RECEIVED);
          });
        });
      });
    });

    let DRFeeToSeller, DRFeeToMutualizer;

    ["self-mutualized", "external-mutualizer"].forEach((mutualizationType) => {
      context(`👉 releaseFunds() [${mutualizationType}]`, async function () {
        ["no-agent", "with-agent"].forEach((agentType) => {
          context(`👉 ${agentType}`, async function () {
            beforeEach(async function () {
              // ids
              protocolId = "0";
              buyerId = "4";
              exchangeId = "1";

              // Amounts that are returned if DR is not involved
              if (mutualizationType === "self-mutualized") {
                DRFeeToSeller = DRFeeToken;
                DRFeeToMutualizer = "0";
                offerToken.feeMutualizer = ethers.constants.AddressZero;

                // Seller must deposit enough to cover DR fees
                const sellerPoolToken = BN(DRFeeToken).mul(2);
                await mockToken.mint(assistant.address, sellerPoolToken);

                // approve protocol to transfer the tokens
                await mockToken.connect(assistant).approve(protocolDiamondAddress, sellerPoolToken);

                // deposit to seller's pool
                await fundsHandler.connect(assistant).depositFunds(seller.id, mockToken.address, sellerPoolToken);
              } else {
                DRFeeToSeller = "0";
                DRFeeToMutualizer = DRFeeToken;
                offerToken.feeMutualizer = mutualizer.address;

                // Seller must deposit enough to cover DR fees
                const poolToken = BN(DRFeeToken).mul(2);
                await mockToken.mint(mutualizerOwner.address, poolToken);

                // approve protocol to transfer the tokens
                await mockToken.connect(mutualizerOwner).approve(mutualizer.address, poolToken);

                // deposit to mutualizer
                await mutualizer.connect(mutualizerOwner).deposit(mockToken.address, poolToken);

                // Create new agreement
                const latestBlock = await ethers.provider.getBlock("latest")
                const startTimestamp = BN(latestBlock.timestamp); // valid from now
                const endTimestamp = startTimestamp.add(oneMonth); // valid for 30 days
                const agreementToken = new Agreement(
                  assistant.address,
                  mockToken.address,
                  ethers.utils.parseUnits("1", "ether"),
                  ethers.utils.parseUnits("1", "ether"),
                  "0",
                  startTimestamp.toString(),
                  endTimestamp.toString(),
                  false,
                  false
                );
                await mutualizer.connect(mutualizerOwner).newAgreement(agreementToken);
                const agreementIdToken = "1";
                await mutualizer.connect(assistant).payPremium(agreementIdToken);
              }

              // create offer
              offerToken.id = "1";
              agentId = agentType === "no-agent" ? "0" : agent.id;
              await offerHandler
                .connect(assistant)
                .createOffer(offerToken, offerDates, offerDurations, disputeResolverId, agentId),
                // commit to offer
                await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id);
            });

            let finalStates = [
              "COMPLETED",
              "REVOKED",
              "CANCELED",
              "DISPUTED - RETRACTED",
              "DISPUTED - RETRACTED via expireDispute",
              "DISPUTED - ESCALATED - RETRACTED",
              "DISPUTED - ESCALATED - RESOLVED",
              "DISPUTED - ESCALATED - DECIDED",
              "Final state DISPUTED - ESCALATED - REFUSED via expireEscalatedDispute (fail to resolve)",
              "Final state DISPUTED - ESCALATED - REFUSED via refuseEscalatedDispute (explicit refusal)",
            ];

            // only for states that need some setup before calling the final action
            let stateSetup = {
              COMPLETED: async function () {
                // Set time forward to the offer's voucherRedeemableFrom
                await setNextBlockTimestamp(Number(voucherRedeemableFrom));

                // successfully redeem exchange
                await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);
              },
              DISPUTED: async function () {
                // Set time forward to the offer's voucherRedeemableFrom
                await setNextBlockTimestamp(Number(voucherRedeemableFrom));

                // successfully redeem exchange
                await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

                // raise the dispute
                await disputeHandler.connect(buyer).raiseDispute(exchangeId);
              },
              "DISPUTED - RETRACTED via expireDispute": async function () {
                // Set time forward to the offer's voucherRedeemableFrom
                await setNextBlockTimestamp(Number(voucherRedeemableFrom));

                // successfully redeem exchange
                await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

                // raise the dispute
                tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

                // Get the block timestamp of the confirmed tx and set disputedDate
                blockNumber = tx.blockNumber;
                block = await ethers.provider.getBlock(blockNumber);
                disputedDate = block.timestamp.toString();
                timeout = BN(disputedDate).add(resolutionPeriod).toString();

                await setNextBlockTimestamp(Number(timeout));
              },
              "DISPUTED - ESCALATED": async function () {
                // Set time forward to the offer's voucherRedeemableFrom
                await setNextBlockTimestamp(Number(voucherRedeemableFrom));

                // successfully redeem exchange
                await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

                // raise the dispute
                await disputeHandler.connect(buyer).raiseDispute(exchangeId);

                // Escalate the dispute
                await disputeHandler.connect(buyer).escalateDispute(exchangeId);
              },
              "Final state DISPUTED - ESCALATED - REFUSED via expireEscalatedDispute (fail to resolve)":
                async function () {
                  // Set time forward to the offer's voucherRedeemableFrom
                  await setNextBlockTimestamp(Number(voucherRedeemableFrom));

                  // successfully redeem exchange
                  await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

                  // raise the dispute
                  await disputeHandler.connect(buyer).raiseDispute(exchangeId);

                  // Escalate the dispute
                  tx = await disputeHandler.connect(buyer).escalateDispute(exchangeId);

                  // Get the block timestamp of the confirmed tx and set escalatedDate
                  blockNumber = tx.blockNumber;
                  block = await ethers.provider.getBlock(blockNumber);
                  escalatedDate = block.timestamp.toString();

                  await setNextBlockTimestamp(Number(escalatedDate) + Number(disputeResolver.escalationResponsePeriod));
                },
            };

            stateSetup["DISPUTED - RETRACTED"] = stateSetup["DISPUTED"];
            stateSetup["DISPUTED - ESCALATED - RETRACTED"] =
              stateSetup["DISPUTED - ESCALATED - RESOLVED"] =
              stateSetup["DISPUTED - ESCALATED - DECIDED"] =
              stateSetup["Final state DISPUTED - ESCALATED - REFUSED via refuseEscalatedDispute (explicit refusal)"] =
                stateSetup["DISPUTED - ESCALATED"];

            async function getAllAvailableFunds() {
              const availableFunds = {};
              let mutualizerTokenBalance;
              [
                ...{
                  0: availableFunds.seller,
                  1: availableFunds.buyer,
                  2: availableFunds.protocol,
                  3: availableFunds.agent,
                  4: availableFunds.disputeResolver,
                  5: mutualizerTokenBalance,
                }
              ] = await Promise.all([
                fundsHandler.getAvailableFunds(seller.id),
                fundsHandler.getAvailableFunds(buyerId),
                fundsHandler.getAvailableFunds(protocolId),
                fundsHandler.getAvailableFunds(agent.id),
                fundsHandler.getAvailableFunds(disputeResolver.id),
                mockToken.balanceOf(mutualizer.address),
              ]);

              return { availableFunds, mutualizerTokenBalance };
            }

            finalStates.forEach((finalState) => {
              context(`Final state ${finalState}`, async function () {
                let payoffs, finalAction;

                beforeEach(async function () {
                  await (stateSetup[finalState] || (() => {}))();

                  // Set the payoffs
                  switch (finalState) {
                    case "COMPLETED":
                    case "DISPUTED - RETRACTED":
                    case "DISPUTED - RETRACTED via expireDispute":
                      agentFee = agentType === "no-agent" ? "0" : applyPercentage(offerToken.price, agentFeePercentage);

                      payoffs = {
                        buyer: "0",
                        seller: BN(offerToken.sellerDeposit)
                          .add(offerToken.price)
                          .sub(offerTokenProtocolFee)
                          .sub(agentFee)
                          .add(DRFeeToSeller)
                          .toString(),
                        protocol: offerTokenProtocolFee,
                        mutualizer: DRFeeToMutualizer,
                        disputeResolver: "0",
                        agent: agentFee,
                      };
                      break;
                    case "REVOKED":
                      payoffs = {
                        buyer: BN(offerToken.sellerDeposit).add(offerToken.price).toString(),
                        seller: DRFeeToSeller,
                        protocol: "0",
                        mutualizer: DRFeeToMutualizer,
                        disputeResolver: "0",
                        agent: "0",
                      };
                      break;
                    case "CANCELED":
                      payoffs = {
                        buyer: BN(offerToken.price).sub(offerToken.buyerCancelPenalty).toString(),
                        seller: BN(offerToken.sellerDeposit)
                          .add(offerToken.buyerCancelPenalty)
                          .add(DRFeeToSeller)
                          .toString(),
                        protocol: "0",
                        mutualizer: DRFeeToMutualizer,
                        disputeResolver: "0",
                        agent: "0",
                      };
                      break;
                    case "DISPUTED - ESCALATED - RETRACTED":
                      agentFee = agentType === "no-agent" ? "0" : applyPercentage(offerToken.price, agentFeePercentage);

                      payoffs = {
                        buyer: "0",
                        seller: BN(offerToken.sellerDeposit)
                          .add(offerToken.price)
                          .sub(offerTokenProtocolFee)
                          .sub(agentFee)
                          .add(buyerEscalationDeposit)
                          .toString(),
                        protocol: offerTokenProtocolFee,
                        mutualizer: "0",
                        disputeResolver: DRFeeToken,
                        agent: agentFee,
                      };
                      break;
                    case "DISPUTED - ESCALATED - RESOLVED":
                    case "DISPUTED - ESCALATED - DECIDED": {
                      buyerPercentBasisPoints = "5566"; // 55.66%
                      const pot = BN(offerToken.price).add(offerToken.sellerDeposit).add(buyerEscalationDeposit);
                      const buyerPayoffSplit = applyPercentage(pot, buyerPercentBasisPoints);

                      payoffs = {
                        buyer: buyerPayoffSplit,
                        seller: pot.sub(buyerPayoffSplit).toString(),
                        protocol: "0",
                        mutualizer: "0",
                        disputeResolver: DRFeeToken,
                        agent: "0",
                      };
                      break;
                    }
                    case "Final state DISPUTED - ESCALATED - REFUSED via expireEscalatedDispute (fail to resolve)":
                    case "Final state DISPUTED - ESCALATED - REFUSED via refuseEscalatedDispute (explicit refusal)":
                      payoffs = {
                        buyer: BN(offerToken.price).add(buyerEscalationDeposit).toString(),
                        seller: BN(offerToken.sellerDeposit).add(DRFeeToSeller).toString(),
                        protocol: "0",
                        mutualizer: DRFeeToMutualizer,
                        disputeResolver: "0",
                        agent: "0",
                      };
                      break;
                  }

                  // Set the final actions
                  switch (finalState) {
                    case "COMPLETED":
                      finalAction = {
                        handler: exchangeHandler,
                        method: "completeExchange",
                        caller: buyer,
                      };
                      break;
                    case "REVOKED":
                      finalAction = {
                        handler: exchangeHandler,
                        method: "revokeVoucher",
                        caller: assistant,
                      };
                      break;
                    case "CANCELED":
                      finalAction = {
                        handler: exchangeHandler,
                        method: "cancelVoucher",
                        caller: buyer,
                      };
                      break;
                    case "DISPUTED - RETRACTED":
                      finalAction = {
                        handler: disputeHandler,
                        method: "retractDispute",
                        caller: buyer,
                      };
                      break;
                    case "DISPUTED - RETRACTED via expireDispute":
                      finalAction = {
                        handler: disputeHandler,
                        method: "expireDispute",
                        caller: rando,
                      };
                      break;
                    case "DISPUTED - ESCALATED - RETRACTED":
                      finalAction = {
                        handler: disputeHandler,
                        method: "retractDispute",
                        caller: buyer,
                      };
                      break;
                    case "DISPUTED - ESCALATED - RESOLVED":
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

                      finalAction = {
                        handler: disputeHandler,
                        method: "resolveDispute",
                        caller: assistant,
                        additionalArgs: [buyerPercentBasisPoints, r, s, v],
                      };
                      break;
                    case "DISPUTED - ESCALATED - DECIDED":
                      finalAction = {
                        handler: disputeHandler,
                        method: "decideDispute",
                        caller: assistantDR,
                        additionalArgs: [buyerPercentBasisPoints],
                      };
                      break;
                    case "Final state DISPUTED - ESCALATED - REFUSED via expireEscalatedDispute (fail to resolve)":
                      finalAction = {
                        handler: disputeHandler,
                        method: "expireEscalatedDispute",
                        caller: rando,
                      };
                      break;
                    case "Final state DISPUTED - ESCALATED - REFUSED via refuseEscalatedDispute (explicit refusal)":
                      finalAction = {
                        handler: disputeHandler,
                        method: "refuseEscalatedDispute",
                        caller: assistantDR,
                      };
                      break;
                  }
                });

                it("should emit a FundsReleased event", async function () {
                  const { handler, caller, method, additionalArgs } = finalAction;
                  const tx = await handler.connect(caller)[method](exchangeId, ...(additionalArgs || []));
                  const txReceipt = await tx.wait();

                  // Buyer
                  let match = eventEmittedWithArgs(txReceipt, fundsHandler, "FundsReleased", [
                    exchangeId,
                    buyerId,
                    offerToken.exchangeToken,
                    payoffs.buyer,
                    caller.address,
                  ]);
                  expect(match).to.equal(payoffs.buyer !== "0");

                  // Seller
                  match = eventEmittedWithArgs(txReceipt, fundsHandler, "FundsReleased", [
                    exchangeId,
                    seller.id,
                    offerToken.exchangeToken,
                    payoffs.seller,
                    caller.address,
                  ]);
                  expect(match).to.equal(payoffs.seller !== "0");

                  // Agent
                  match = eventEmittedWithArgs(txReceipt, fundsHandler, "FundsReleased", [
                    exchangeId,
                    agent.id,
                    offerToken.exchangeToken,
                    payoffs.agent,
                    caller.address,
                  ]);
                  expect(match).to.equal(payoffs.agent !== "0");

                  // Dispute resolver
                  match = eventEmittedWithArgs(txReceipt, fundsHandler, "FundsReleased", [
                    exchangeId,
                    disputeResolver.id,
                    offerToken.exchangeToken,
                    payoffs.disputeResolver,
                    caller.address,
                  ]);
                  expect(match).to.equal(payoffs.disputeResolver !== "0");

                  // Protocol fee
                  match = eventEmittedWithArgs(txReceipt, fundsHandler, "ProtocolFeeCollected", [
                    exchangeId,
                    offerToken.exchangeToken,
                    payoffs.protocol,
                    caller.address,
                  ]);
                  expect(match).to.equal(payoffs.protocol !== "0");

                  // Mutualizer
                  if (mutualizationType === "self-mutualized") {
                    await expect(tx).to.not.emit(exchangeHandler, "DRFeeReturned");
                  } else {
                    await expect(tx)
                      .to.emit(exchangeHandler, "DRFeeReturned")
                      .withArgs(
                        mutualizer.address,
                        "1",
                        exchangeId,
                        offerToken.exchangeToken,
                        payoffs.mutualizer,
                        caller.address
                      ); // ToDo: upgrade hardhat, and use anyValue predicate for UUID field
                  }
                });

                it("should update state", async function () {
                  // Read on chain state
                  let { availableFunds, mutualizerTokenBalance: mutualizerTokenBalanceBefore } =
                    await getAllAvailableFunds();

                  // Chain state should match the expected available funds
                  let expectedAvailableFunds = {};
                  expectedAvailableFunds.seller = new FundsList([
                    new Funds(mockToken.address, "Foreign20", BN(sellerDeposit).add(DRFeeToSeller).toString()),
                    new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
                  ]);
                  expectedAvailableFunds.buyer = new FundsList([]);
                  expectedAvailableFunds.protocol = new FundsList([]);
                  expectedAvailableFunds.agent = new FundsList([]);
                  expectedAvailableFunds.disputeResolver = new FundsList([]);

                  for (let [key, value] of Object.entries(expectedAvailableFunds)) {
                    expect(FundsList.fromStruct(availableFunds[key])).to.eql(value, `${key} mismatch`);
                  }

                  // Execute the final action so the funds are released
                  const { handler, caller, method, additionalArgs } = finalAction;
                  await handler.connect(caller)[method](exchangeId, ...(additionalArgs || []));

                  // Increase available funds
                  for (let [key, value] of Object.entries(expectedAvailableFunds)) {
                    if (payoffs[key] !== "0") {
                      if (value.funds[0]) {
                        // If funds are non empty, mockToken is the first entry
                        value.funds[0].availableAmount = BN(value.funds[0].availableAmount)
                          .add(payoffs[key])
                          .toString();
                      } else {
                        value.funds.push(new Funds(mockToken.address, "Foreign20", payoffs[key]));
                      }
                    }
                  }

                  // Read on chain state
                  let mutualizerTokenBalanceAfter;
                  ({ availableFunds, mutualizerTokenBalance: mutualizerTokenBalanceAfter } =
                    await getAllAvailableFunds());

                  for (let [key, value] of Object.entries(expectedAvailableFunds)) {
                    expect(FundsList.fromStruct(availableFunds[key])).to.eql(value, `${key} mismatch`);
                  }
                  expect(mutualizerTokenBalanceAfter).to.eql(mutualizerTokenBalanceBefore.add(payoffs.mutualizer));
                });
              });
            });

            context("special cases", function () {
              let payoffs;

              beforeEach(async function () {
                // expected payoffs
                agentFee = agentType === "no-agent" ? "0" : applyPercentage(offerToken.price, agentFeePercentage);

                payoffs = {
                  buyer: "0",
                  seller: BN(offerToken.sellerDeposit)
                    .add(offerToken.price)
                    .sub(offerTokenProtocolFee)
                    .sub(agentFee)
                    .add(DRFeeToSeller)
                    .toString(),
                  protocol: offerTokenProtocolFee,
                  mutualizer: DRFeeToMutualizer,
                  disputeResolver: "0",
                  agent: agentFee,
                };
              });

              it("No new entry is created when multiple exchanges are finalized", async function () {
                // Read on chain state
                let { availableFunds, mutualizerTokenBalance: mutualizerTokenBalanceBefore } =
                  await getAllAvailableFunds();

                // Chain state should match the expected available funds
                let expectedAvailableFunds = {};
                expectedAvailableFunds.seller = new FundsList([
                  new Funds(mockToken.address, "Foreign20", BN(sellerDeposit).add(DRFeeToSeller).toString()),
                  new Funds(ethers.constants.AddressZero, "Native currency", `${2 * sellerDeposit}`),
                ]);
                expectedAvailableFunds.buyer = new FundsList([]);
                expectedAvailableFunds.protocol = new FundsList([]);
                expectedAvailableFunds.agent = new FundsList([]);
                expectedAvailableFunds.disputeResolver = new FundsList([]);

                for (let [key, value] of Object.entries(expectedAvailableFunds)) {
                  expect(FundsList.fromStruct(availableFunds[key])).to.eql(value, `${key} mismatch`);
                }

                // successfully redeem exchange
                await setNextBlockTimestamp(Number(voucherRedeemableFrom));
                await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);
                await exchangeHandler.connect(buyer).completeExchange(exchangeId);

                // Increase available funds
                for (let [key, value] of Object.entries(expectedAvailableFunds)) {
                  if (payoffs[key] !== "0") {
                    if (value.funds[0]) {
                      // If funds are non empty, mockToken is the first entry
                      value.funds[0].availableAmount = BN(value.funds[0].availableAmount).add(payoffs[key]).toString();
                    } else {
                      value.funds.push(new Funds(mockToken.address, "Foreign20", payoffs[key]));
                    }
                  }
                }

                // Read on chain state
                let mutualizerTokenBalanceAfter;
                ({ availableFunds, mutualizerTokenBalance: mutualizerTokenBalanceAfter } =
                  await getAllAvailableFunds());

                for (let [key, value] of Object.entries(expectedAvailableFunds)) {
                  expect(FundsList.fromStruct(availableFunds[key])).to.eql(value, `${key} mismatch`);
                }
                expect(mutualizerTokenBalanceAfter).to.eql(mutualizerTokenBalanceBefore.add(payoffs.mutualizer));

                // complete another exchange so we test funds are only updated, no new entry is created
                await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id);
                mutualizerTokenBalanceBefore = await mockToken.balanceOf(mutualizer.address);
                await exchangeHandler.connect(buyer).redeemVoucher(++exchangeId);
                await exchangeHandler.connect(buyer).completeExchange(exchangeId);

                // Increase available funds
                for (let [key, value] of Object.entries(expectedAvailableFunds)) {
                  if (payoffs[key] !== "0") {
                    if (value.funds[0]) {
                      // If funds are non empty, mockToken is the first entry
                      value.funds[0].availableAmount = BN(value.funds[0].availableAmount).add(payoffs[key]).toString();
                    } else {
                      value.funds.push(new Funds(mockToken.address, "Foreign20", payoffs[key]));
                    }
                  }
                }
                // sellers available funds should be decreased by the seller deposit and DR fee, because commitToOffer reduced it
                expectedAvailableFunds.seller.funds[0].availableAmount = BN(
                  expectedAvailableFunds.seller.funds[0].availableAmount
                )
                  .sub(sellerDeposit)
                  .sub(DRFeeToSeller)
                  .toString();

                // Read on chain state
                ({ availableFunds, mutualizerTokenBalance: mutualizerTokenBalanceAfter } =
                  await getAllAvailableFunds());

                for (let [key, value] of Object.entries(expectedAvailableFunds)) {
                  expect(FundsList.fromStruct(availableFunds[key])).to.eql(value, `${key} mismatch`);
                }
                expect(mutualizerTokenBalanceAfter).to.eql(mutualizerTokenBalanceBefore.add(payoffs.mutualizer));
              });

              it("Changing the mutualizer", async function () {
                let newMutualizer;
                if (mutualizationType === "self-mutualized") {
                  newMutualizer = mutualizer.address;
                } else {
                  newMutualizer = ethers.constants.AddressZero;
                }

                // Change the mutualizer
                await offerHandler.connect(assistant).changeOfferMutualizer(offerToken.id, newMutualizer);

                // Set time forward to the offer's voucherRedeemableFrom
                await setNextBlockTimestamp(Number(voucherRedeemableFrom));

                // successfully redeem exchange
                await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

                // Complete the exchange, expecting event
                const tx = await exchangeHandler.connect(buyer).completeExchange(exchangeId);

                // Check that seller gets the correct payoff depending on the mutualization type
                await expect(tx)
                  .to.emit(exchangeHandler, "FundsReleased")
                  .withArgs(exchangeId, seller.id, offerToken.exchangeToken, payoffs.seller, buyer.address);

                // Even if the mutualizer is changed, the DR fee should be returned to the old mutualizer
                if (mutualizationType === "self-mutualized") {
                  await expect(tx).to.not.emit(exchangeHandler, "DRFeeReturned");
                } else {
                  await expect(tx)
                    .to.emit(exchangeHandler, "DRFeeReturned")
                    .withArgs(
                      mutualizer.address,
                      "1",
                      exchangeId,
                      offerToken.exchangeToken,
                      payoffs.mutualizer,
                      buyer.address
                    ); // ToDo: upgrade hardhat, and use anyValue predicate for UUID field
                }
              });

              context("Changing the protocol fee", async function () {
                it("Protocol fee for existing exchanges should be the same as at the offer creation", async function () {
                  // set the new protocol fee
                  protocolFeePercentage = "300"; // 3%
                  await configHandler.connect(deployer).setProtocolFeePercentage(protocolFeePercentage);

                  // Set time forward to the offer's voucherRedeemableFrom
                  await setNextBlockTimestamp(Number(voucherRedeemableFrom));

                  // successfully redeem exchange
                  await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

                  // Complete the exchange, expecting event
                  const tx = await exchangeHandler.connect(buyer).completeExchange(exchangeId);
                  await expect(tx)
                    .to.emit(exchangeHandler, "FundsReleased")
                    .withArgs(exchangeId, seller.id, offerToken.exchangeToken, payoffs.seller, buyer.address);

                  await expect(tx)
                    .to.emit(exchangeHandler, "ProtocolFeeCollected")
                    .withArgs(exchangeId, offerToken.exchangeToken, payoffs.protocol, buyer.address);

                  // Agent
                  txReceipt = await tx.wait();
                  const match = eventEmittedWithArgs(txReceipt, fundsHandler, "FundsReleased", [
                    exchangeId,
                    agent.id,
                    offerToken.exchangeToken,
                    payoffs.agent,
                    buyer.address,
                  ]);
                  expect(match).to.equal(payoffs.agent !== "0");
                });

                it("Protocol fee for new exchanges should be the same as at the offer creation", async function () {
                  // set the new protocol fee
                  protocolFeePercentage = "300"; // 3%
                  await configHandler.connect(deployer).setProtocolFeePercentage(protocolFeePercentage);

                  // similar as test before, except the commit to offer is done after the protocol fee change

                  // commit to offer and get the correct exchangeId
                  tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id);
                  txReceipt = await tx.wait();
                  event = getEvent(txReceipt, exchangeHandler, "BuyerCommitted");
                  exchangeId = event.exchangeId.toString();

                  // Set time forward to the offer's voucherRedeemableFrom
                  await setNextBlockTimestamp(Number(voucherRedeemableFrom));

                  // successfully redeem exchange
                  await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

                  // Complete the exchange, expecting event
                  tx = await exchangeHandler.connect(buyer).completeExchange(exchangeId);
                  await expect(tx)
                    .to.emit(exchangeHandler, "FundsReleased")
                    .withArgs(exchangeId, seller.id, offerToken.exchangeToken, payoffs.seller, buyer.address);

                  await expect(tx)
                    .to.emit(exchangeHandler, "ProtocolFeeCollected")
                    .withArgs(exchangeId, offerToken.exchangeToken, payoffs.protocol, buyer.address);

                  // Agent
                  txReceipt = await tx.wait();
                  const match = eventEmittedWithArgs(txReceipt, fundsHandler, "FundsReleased", [
                    exchangeId,
                    agent.id,
                    offerToken.exchangeToken,
                    payoffs.agent,
                    buyer.address,
                  ]);
                  expect(match).to.equal(payoffs.agent !== "0");
                });
              });
            });
          });
        });
      });
    });
  });
});
