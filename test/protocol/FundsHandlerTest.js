const { ethers } = require("hardhat");
const { ZeroAddress, getSigners, provider, parseUnits, getContractAt, getContractFactory, MaxUint256 } = ethers;
const { expect, assert } = require("chai");
const Role = require("../../scripts/domain/Role");
const { Funds, FundsList } = require("../../scripts/domain/Funds");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const PriceDiscovery = require("../../scripts/domain/PriceDiscovery");
const Side = require("../../scripts/domain/Side");
const { RoyaltyInfo } = require("../../scripts/domain/RoyaltyInfo");
const { RoyaltyRecipientInfo, RoyaltyRecipientInfoList } = require("../../scripts/domain/RoyaltyRecipientInfo.js");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const {
  setNextBlockTimestamp,
  getEvent,
  eventEmittedWithArgs,
  prepareDataSignature,
  applyPercentage,
  calculateCloneAddress,
  calculateBosonProxyAddress,
  setupTestEnvironment,
  getSnapshot,
  revertToSnapshot,
  deriveTokenId,
  generateOfferId,
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
const PriceType = require("../../scripts/domain/PriceType.js");

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
    other2,
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
    sequentialCommitHandler,
    priceDiscoveryHandler;
  let support;
  let seller;
  let buyer, offerToken, offerNative, offerPriceDiscovery;
  let mockToken, bosonToken;
  let depositAmount;
  let offerTokenProtocolFee, offerNativeProtocolFee, priceDiscoveryProtocolFee, price, sellerDeposit;
  let offerDates, voucherRedeemableFrom;
  let resolutionPeriod, offerDurations;
  let protocolFeePercentage, buyerEscalationDepositPercentage;
  let block, blockNumber;
  let protocolId, exchangeId, buyerId, randoBuyerId, sellerPayoff, sellerPayoff2, buyerPayoff, protocolPayoff;
  let sellersAvailableFunds,
    buyerAvailableFunds,
    protocolAvailableFunds,
    royaltyRecipientsAvailableFunds,
    expectedSellerAvailableFunds,
    expectedBuyerAvailableFunds,
    expectedProtocolAvailableFunds,
    expectedRoyaltyRecipientsAvailableFunds;
  let tokenListSeller, tokenListBuyer, tokenAmountsSeller, tokenAmountsBuyer, tokenList, tokenAmounts;
  let tx, txReceipt, txCost, event;
  let disputeResolverFees, disputeResolver, disputeResolverId;
  let buyerPercentBasisPoints;
  let resolutionType, customSignatureType, message, signature;
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
  let buyer1, buyer2, buyer3;
  let protocolDiamondAddress;
  let snapshotId;
  let priceDiscoveryContract;
  let beaconProxyAddress;
  let offerFeeLimit;
  let bosonErrors;
  let bpd;

  before(async function () {
    accountId.next(true);
    generateOfferId.next(true);

    // get interface Ids
    InterfaceIds = await getInterfaceIds();

    // Add WETH
    const wethFactory = await getContractFactory("WETH9");
    const weth = await wethFactory.deploy();
    await weth.waitForDeployment();

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
      sequentialCommitHandler: "IBosonSequentialCommitHandler",
      priceDiscoveryHandler: "IBosonPriceDiscoveryHandler",
    };

    ({
      signers: [
        pauser,
        admin,
        treasury,
        rando,
        buyer,
        feeCollector,
        adminDR,
        treasuryDR,
        other,
        other2,
        buyer1,
        buyer2,
        buyer3,
      ],
      contractInstances: {
        erc165,
        accountHandler,
        offerHandler,
        exchangeHandler,
        fundsHandler,
        configHandler,
        pauseHandler,
        disputeHandler,
        sequentialCommitHandler,
        priceDiscoveryHandler,
      },
      protocolConfig: [, , protocolFeePercentage, , buyerEscalationDepositPercentage],
      diamondAddress: protocolDiamondAddress,
      extraReturnValues: { accessController },
    } = await setupTestEnvironment(contracts, {
      wethAddress: await weth.getAddress(),
    }));

    bosonErrors = await getContractAt("BosonErrors", protocolDiamondAddress);

    // make all account the same
    assistant = admin;
    assistantDR = adminDR;
    clerk = clerkDR = { address: ZeroAddress };

    [deployer, protocolTreasury] = await getSigners();

    // Deploy the mock token
    [mockToken] = await deployMockTokens(["Foreign20"]);

    // Add BosonPriceDiscovery
    const bpdFactory = await getContractFactory("BosonPriceDiscovery");
    bpd = await bpdFactory.deploy(await weth.getAddress(), protocolDiamondAddress);
    await bpd.waitForDeployment();

    await configHandler.setPriceDiscoveryAddress(await bpd.getAddress());

    // Deploy PriceDiscovery contract
    const PriceDiscoveryFactory = await ethers.getContractFactory("PriceDiscoveryMock");
    priceDiscoveryContract = await PriceDiscoveryFactory.deploy();
    await priceDiscoveryContract.waitForDeployment();

    // Get the beacon proxy address
    beaconProxyAddress = await calculateBosonProxyAddress(protocolDiamondAddress);

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
      seller = mockSeller(
        await assistant.getAddress(),
        await admin.getAddress(),
        clerk.address,
        await treasury.getAddress()
      );
      expect(seller.isValid()).is.true;

      // VoucherInitValues
      voucherInitValues = mockVoucherInitValues();
      expect(voucherInitValues.isValid()).is.true;

      // AuthToken
      emptyAuthToken = mockAuthToken();
      expect(emptyAuthToken.isValid()).is.true;

      await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

      // top up assistants account
      await mockToken.mint(await assistant.getAddress(), "1000000");

      // approve protocol to transfer the tokens
      await mockToken.connect(assistant).approve(protocolDiamondAddress, "1000000");

      // set the deposit amount
      depositAmount = 100n;

      // Set agent id as zero as it is optional for createOffer().
      agentId = "0";

      // unlimited offer fee to not affect the tests
      offerFeeLimit = MaxUint256;
    });

    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
      generateOfferId.next(true);
    });

    context("👉 depositFunds()", async function () {
      it("should emit a FundsDeposited event", async function () {
        // Deposit funds, testing for the event
        // Deposit token
        await expect(
          fundsHandler.connect(assistant).depositFunds(seller.id, await mockToken.getAddress(), depositAmount)
        )
          .to.emit(fundsHandler, "FundsDeposited")
          .withArgs(seller.id, await assistant.getAddress(), await mockToken.getAddress(), depositAmount);

        // Deposit native currency
        await expect(
          fundsHandler.connect(rando).depositFunds(seller.id, ZeroAddress, depositAmount, { value: depositAmount })
        )
          .to.emit(fundsHandler, "FundsDeposited")
          .withArgs(seller.id, await rando.getAddress(), ZeroAddress, depositAmount);
      });

      it("should update state", async function () {
        // Deposit token
        await fundsHandler.connect(assistant).depositFunds(seller.id, await mockToken.getAddress(), depositAmount);

        // Read on chain state
        let returnedAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));

        // Chain state should match the expected available funds
        let expectedAvailableFunds = new FundsList([
          new Funds(await mockToken.getAddress(), "Foreign20", depositAmount.toString()),
        ]);
        expect(returnedAvailableFunds).to.eql(expectedAvailableFunds);

        // Deposit native currency to the same seller id
        await fundsHandler.connect(rando).depositFunds(seller.id, ZeroAddress, depositAmount, { value: depositAmount });

        // Get new on chain state
        returnedAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));

        // Chain state should match the expected available funds
        expectedAvailableFunds.funds.push(new Funds(ZeroAddress, "Native currency", depositAmount.toString()));
        expect(returnedAvailableFunds).to.eql(expectedAvailableFunds);
      });

      it("should be possible to top up the account", async function () {
        // Deposit token
        await fundsHandler.connect(assistant).depositFunds(seller.id, await mockToken.getAddress(), depositAmount);

        // Read on chain state
        let returnedAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));

        // Chain state should match the expected available funds
        let expectedAvailableFunds = new FundsList([
          new Funds(await mockToken.getAddress(), "Foreign20", depositAmount.toString()),
        ]);
        expect(returnedAvailableFunds).to.eql(expectedAvailableFunds);

        // Deposit the same token again
        await fundsHandler.connect(assistant).depositFunds(seller.id, await mockToken.getAddress(), 2n * depositAmount);

        // Get new on chain state
        returnedAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));

        // Chain state should match the expected available funds
        expectedAvailableFunds = new FundsList([
          new Funds(await mockToken.getAddress(), "Foreign20", (3n * depositAmount).toString()),
        ]);
        expect(returnedAvailableFunds).to.eql(expectedAvailableFunds);
      });

      context("💔 Revert Reasons", async function () {
        it("The funds region of protocol is paused", async function () {
          // Pause the funds region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Funds]);

          // Attempt to deposit funds, expecting revert
          await expect(
            fundsHandler.connect(assistant).depositFunds(seller.id, await mockToken.getAddress(), depositAmount)
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Funds);
        });

        it("Amount to deposit is zero", async function () {
          depositAmount = 0;

          // Attempt to deposit funds, expecting revert
          await expect(
            fundsHandler.connect(assistant).depositFunds(seller.id, await mockToken.getAddress(), depositAmount)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.ZERO_DEPOSIT_NOT_ALLOWED);
        });

        it("Seller id does not exist", async function () {
          // Attempt to deposit the funds, expecting revert
          seller.id = "555";
          await expect(
            fundsHandler.connect(rando).depositFunds(seller.id, await mockToken.getAddress(), depositAmount)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_SELLER);
        });

        it("Native currency deposited, but the token address is not zero", async function () {
          // Attempt to deposit the funds, expecting revert
          await expect(
            fundsHandler
              .connect(rando)
              .depositFunds(seller.id, await mockToken.getAddress(), depositAmount, { value: depositAmount })
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NATIVE_WRONG_ADDRESS);
        });

        it("Native currency deposited, but the amount does not match msg.value", async function () {
          // Attempt to deposit the funds, expecting revert
          await expect(
            fundsHandler
              .connect(rando)
              .depositFunds(seller.id, ZeroAddress, depositAmount * 2n, { value: depositAmount })
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NATIVE_WRONG_AMOUNT);
        });

        it("Token address contract does not support transferFrom", async function () {
          // Deploy a contract without the transferFrom
          [bosonToken] = await deployMockTokens(["BosonToken"]);

          // Attempt to deposit the funds, expecting revert
          await expect(
            fundsHandler.connect(rando).depositFunds(seller.id, await bosonToken.getAddress(), depositAmount)
          ).to.revertedWith(RevertReasons.SAFE_ERC20_LOW_LEVEL_CALL);
        });

        it("No native currency deposited and token address is zero", async function () {
          // Attempt to deposit the funds, expecting revert
          await expect(
            fundsHandler.connect(rando).depositFunds(seller.id, ZeroAddress, depositAmount)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_ADDRESS);
        });

        it("Token address is not a contract", async function () {
          // Attempt to deposit the funds, expecting revert
          await expect(
            fundsHandler.connect(rando).depositFunds(seller.id, await admin.getAddress(), depositAmount)
          ).to.revertedWithoutReason();
        });

        it("Token contract revert for another reason", async function () {
          // insufficient funds
          // approve more than account actually have
          await mockToken.connect(rando).approve(protocolDiamondAddress, depositAmount);
          // Attempt to deposit the funds, expecting revert
          await expect(
            fundsHandler.connect(rando).depositFunds(seller.id, await mockToken.getAddress(), depositAmount)
          ).to.revertedWith(RevertReasons.ERC20_EXCEEDS_BALANCE);

          // not approved
          depositAmount = 10000000n;
          await expect(
            fundsHandler.connect(assistant).depositFunds(seller.id, await mockToken.getAddress(), depositAmount)
          ).to.revertedWith(RevertReasons.ERC20_INSUFFICIENT_ALLOWANCE);
        });

        it("Received ERC20 token amount differs from the expected value", async function () {
          // Deploy ERC20 with fees
          const [Foreign20WithFee] = await deployMockTokens(["Foreign20WithFee"]);

          // mint tokens and approve
          await Foreign20WithFee.mint(await assistant.getAddress(), depositAmount);
          await Foreign20WithFee.connect(assistant).approve(protocolDiamondAddress, depositAmount);

          // Attempt to deposit funds, expecting revert
          await expect(
            fundsHandler.connect(assistant).depositFunds(seller.id, await Foreign20WithFee.getAddress(), depositAmount)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INSUFFICIENT_VALUE_RECEIVED);
        });

        it("ERC20 transferFrom returns false", async function () {
          const [foreign20ReturnFalse] = await deployMockTokens(["Foreign20TransferFromReturnFalse"]);

          await foreign20ReturnFalse.connect(assistant).mint(await assistant.getAddress(), depositAmount);
          await foreign20ReturnFalse.connect(assistant).approve(protocolDiamondAddress, depositAmount);

          await expect(
            fundsHandler
              .connect(assistant)
              .depositFunds(seller.id, await foreign20ReturnFalse.getAddress(), depositAmount)
          ).to.revertedWith(RevertReasons.SAFE_ERC20_OPERATION_FAILED);
        });
      });
    });

    context("💸 withdraw", async function () {
      beforeEach(async function () {
        // Initial ids for all the things
        exchangeId = "1";

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
        disputeResolverFees = [
          new DisputeResolverFee(ZeroAddress, "Native", "0"),
          new DisputeResolverFee(await mockToken.getAddress(), "mockToken", "0"),
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
        offer.id = "0";
        offerNative = offer;

        offerToken = offer.clone();
        offerToken.id = "0";
        offerToken.exchangeToken = await mockToken.getAddress();

        // Check if domains are valid
        expect(offerNative.isValid()).is.true;
        expect(offerToken.isValid()).is.true;
        expect(offerDates.isValid()).is.true;
        expect(offerDurations.isValid()).is.true;

        // Set used variables
        voucherRedeemableFrom = offerDates.voucherRedeemableFrom;

        // Create both offers

        offerNative.id = await offerHandler
          .connect(assistant)
          .createOffer(offerNative, offerDates, offerDurations, disputeResolverId, agentId, offerFeeLimit, {
            getOfferId: true,
          });
        offerToken.id = await offerHandler
          .connect(assistant)
          .createOffer(offerToken, offerDates, offerDurations, disputeResolverId, agentId, offerFeeLimit, {
            getOfferId: true,
          });

        // Set used variables
        price = offerToken.price;
        sellerDeposit = offerToken.sellerDeposit;
        offerTokenProtocolFee = offerNativeProtocolFee = offerFees.protocolFee;

        // top up seller's and buyer's account
        await Promise.all([
          mockToken.mint(await assistant.getAddress(), sellerDeposit),
          mockToken.mint(await buyer.getAddress(), price),
        ]);

        // approve protocol to transfer the tokens
        await Promise.all([
          mockToken.connect(assistant).approve(protocolDiamondAddress, sellerDeposit),
          mockToken.connect(buyer).approve(protocolDiamondAddress, price),
        ]);

        // deposit to seller's pool
        await Promise.all([
          fundsHandler.connect(assistant).depositFunds(seller.id, await mockToken.getAddress(), sellerDeposit),
          fundsHandler.connect(assistant).depositFunds(seller.id, ZeroAddress, sellerDeposit, { value: sellerDeposit }),
        ]);

        // commit to both offers
        await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerToken.id);
        await exchangeHandler
          .connect(buyer)
          .commitToOffer(await buyer.getAddress(), offerNative.id, { value: offerNative.price });

        buyerId = accountId.next().value;
      });

      afterEach(async function () {
        // Reset the accountId iterator
        accountId.next(true);
        generateOfferId.next(true);
      });

      context("👉 withdrawFunds()", async function () {
        context("singe exchange", async function () {
          beforeEach(async function () {
            // cancel the voucher, so both seller and buyer have something to withdraw
            await exchangeHandler.connect(buyer).cancelVoucher(exchangeId); // canceling the voucher in tokens
            await exchangeHandler.connect(buyer).cancelVoucher(++exchangeId); // canceling the voucher in the native currency

            // expected payoffs - they are the same for token and native currency
            // buyer: price - buyerCancelPenalty
            buyerPayoff = BigInt(offerToken.price) - BigInt(offerToken.buyerCancelPenalty);

            // seller: sellerDeposit + buyerCancelPenalty
            sellerPayoff = BigInt(offerToken.sellerDeposit) + BigInt(offerToken.buyerCancelPenalty);
          });

          it("should emit a FundsWithdrawn event", async function () {
            // Withdraw funds, testing for the event
            // Withdraw tokens
            tokenListSeller = [await mockToken.getAddress(), ZeroAddress];
            tokenListBuyer = [ZeroAddress, await mockToken.getAddress()];

            // Withdraw amounts
            tokenAmountsSeller = [sellerPayoff, (BigInt(sellerPayoff) / 2n).toString()];
            tokenAmountsBuyer = [buyerPayoff, (BigInt(buyerPayoff) / 5n).toString()];

            // seller withdrawal
            const tx = await fundsHandler
              .connect(assistant)
              .withdrawFunds(seller.id, tokenListSeller, tokenAmountsSeller);
            await expect(tx)
              .to.emit(fundsHandler, "FundsWithdrawn")
              .withArgs(
                seller.id,
                await treasury.getAddress(),
                await mockToken.getAddress(),
                sellerPayoff,
                await assistant.getAddress()
              );

            await expect(tx)
              .to.emit(fundsHandler, "FundsWithdrawn")

              .withArgs(
                seller.id,
                await treasury.getAddress(),
                0n,
                BigInt(sellerPayoff) / 2n,
                await assistant.getAddress()
              );

            // buyer withdrawal
            const tx2 = await fundsHandler.connect(buyer).withdrawFunds(buyerId, tokenListBuyer, tokenAmountsBuyer);
            await expect(tx2)
              .to.emit(fundsHandler, "FundsWithdrawn")
              .withArgs(
                buyerId,
                await buyer.getAddress(),
                await mockToken.getAddress(),
                BigInt(buyerPayoff) / 5n,
                await buyer.getAddress()
              );

            await expect(tx2)
              .to.emit(fundsHandler, "FundsWithdrawn")
              .withArgs(buyerId, await buyer.getAddress(), 0n, buyerPayoff, await buyer.getAddress());
          });

          it("should update state", async function () {
            // WITHDRAW ONE TOKEN PARTIALLY

            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            const treasuryBalanceBefore = await provider.getBalance(await treasury.getAddress());

            // Chain state should match the expected available funds before the withdrawal
            expectedSellerAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", sellerPayoff),
              new Funds(ZeroAddress, "Native currency", sellerPayoff),
            ]);
            expect(sellersAvailableFunds).to.eql(
              expectedSellerAvailableFunds,
              "Seller available funds mismatch before withdrawal"
            );

            // withdraw funds
            const withdrawAmount = BigInt(sellerPayoff) - parseUnits("0.1", "ether");
            await fundsHandler.connect(assistant).withdrawFunds(seller.id, [ZeroAddress], [withdrawAmount]);

            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            const treasuryBalanceAfter = await provider.getBalance(await treasury.getAddress());

            // Chain state should match the expected available funds after the withdrawal
            // Native currency available funds are reduced for the withdrawal amount
            expectedSellerAvailableFunds.funds[1] = new Funds(
              ZeroAddress,
              "Native currency",
              BigInt(sellerPayoff) - BigInt(withdrawAmount)
            );
            expect(sellersAvailableFunds).to.eql(
              expectedSellerAvailableFunds,
              "Seller available funds mismatch after withdrawal"
            );

            // Native currency balance is increased for the withdrawAmount
            expect(treasuryBalanceAfter).to.eql(
              treasuryBalanceBefore + withdrawAmount,
              "Treasury token balance mismatch"
            );

            // WITHDRAW ONE TOKEN FULLY

            // Read on chain state
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            const buyerBalanceBefore = await mockToken.balanceOf(await buyer.getAddress());

            // Chain state should match the expected available funds before the withdrawal
            expectedBuyerAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", buyerPayoff),
              new Funds(ZeroAddress, "Native currency", buyerPayoff),
            ]);
            expect(buyerAvailableFunds).to.eql(
              expectedBuyerAvailableFunds,
              "Buyer available funds mismatch before withdrawal"
            );

            // withdraw funds
            await fundsHandler.connect(buyer).withdrawFunds(buyerId, [await mockToken.getAddress()], [buyerPayoff]);

            // Read on chain state
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            const buyerBalanceAfter = await mockToken.balanceOf(await buyer.getAddress());

            // Chain state should match the expected available funds after the withdrawal
            // Since all tokens are withdrawn, getAvailableFunds should return 0 for token
            expectedBuyerAvailableFunds = new FundsList([new Funds(ZeroAddress, "Native currency", buyerPayoff)]);

            expect(buyerAvailableFunds).to.eql(
              expectedBuyerAvailableFunds,
              "Buyer available funds mismatch after withdrawal"
            );
            // Token balance is increased for the buyer payoff
            expect(buyerBalanceAfter).to.eql(buyerBalanceBefore + buyerPayoff, "Buyer token balance mismatch");
          });

          it("should allow to withdraw all funds at once", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            const treasuryNativeBalanceBefore = await provider.getBalance(await treasury.getAddress());
            const treasuryTokenBalanceBefore = await mockToken.balanceOf(await treasury.getAddress());

            // Chain state should match the expected available funds before the withdrawal
            expectedSellerAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", sellerPayoff),
              new Funds(ZeroAddress, "Native currency", sellerPayoff),
            ]);
            expect(sellersAvailableFunds).to.eql(
              expectedSellerAvailableFunds,
              "Seller available funds mismatch before withdrawal"
            );

            // withdraw all funds
            await fundsHandler.connect(assistant).withdrawFunds(seller.id, [], []);

            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            const treasuryNativeBalanceAfter = await provider.getBalance(await treasury.getAddress());
            const treasuryTokenBalanceAfter = await mockToken.balanceOf(await treasury.getAddress());

            // Chain state should match the expected available funds after the withdrawal
            // Funds available should be zero
            expectedSellerAvailableFunds = new FundsList([]);

            expect(sellersAvailableFunds).to.eql(
              expectedSellerAvailableFunds,
              "Seller available funds mismatch after withdrawal"
            );
            // Native currency balance is increased for the withdrawAmount
            expect(treasuryNativeBalanceAfter).to.eql(
              treasuryNativeBalanceBefore + sellerPayoff,
              "Treasury native currency balance mismatch"
            );
            expect(treasuryTokenBalanceAfter).to.eql(
              treasuryTokenBalanceBefore + sellerPayoff,
              "Treasury token balance mismatch"
            );
          });

          it("It's possible to withdraw same token twice if in total enough available funds", async function () {
            let reduction = parseUnits("0.1", "ether");
            // Withdraw token
            tokenListSeller = [await mockToken.getAddress(), await mockToken.getAddress()];
            tokenAmountsSeller = [BigInt(sellerPayoff) - BigInt(reduction), reduction];

            // seller withdrawal
            const tx = await fundsHandler
              .connect(assistant)
              .withdrawFunds(seller.id, tokenListSeller, tokenAmountsSeller);
            await expect(tx)
              .to.emit(fundsHandler, "FundsWithdrawn")
              .withArgs(
                seller.id,
                await treasury.getAddress(),
                await mockToken.getAddress(),
                BigInt(sellerPayoff) - BigInt(reduction),
                await assistant.getAddress()
              );

            await expect(tx)
              .to.emit(fundsHandler, "FundsWithdrawn")
              .withArgs(
                seller.id,
                await treasury.getAddress(),
                await mockToken.getAddress(),
                reduction,
                await assistant.getAddress()
              );
          });

          context("Agent Withdraws funds", async function () {
            beforeEach(async function () {
              // Create a valid agent,
              agentId = "4";
              agent = mockAgent(await other.getAddress());
              agent.id = agentId;
              expect(agent.isValid()).is.true;

              // Create an agent
              await accountHandler.connect(rando).createAgent(agent);

              // Mock offer
              const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
              agentOffer = offer.clone();
              agentOffer.id = "0";
              exchangeId = "3";
              agentOffer.exchangeToken = await mockToken.getAddress();

              // Create offer with agent
              agentOffer.id = await offerHandler
                .connect(assistant)
                .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id, offerFeeLimit, {
                  getOfferId: true,
                });

              // Set used variables
              price = agentOffer.price;
              sellerDeposit = agentOffer.sellerDeposit;
              voucherRedeemableFrom = offerDates.voucherRedeemableFrom;

              // top up seller's and buyer's account
              await mockToken.mint(await assistant.getAddress(), sellerDeposit);
              await mockToken.mint(await buyer.getAddress(), price);

              // approve protocol to transfer the tokens
              await mockToken.connect(assistant).approve(protocolDiamondAddress, sellerDeposit);
              await mockToken.connect(buyer).approve(protocolDiamondAddress, price);

              // deposit to seller's pool
              await fundsHandler
                .connect(assistant)
                .depositFunds(seller.id, await mockToken.getAddress(), sellerDeposit);

              // commit to agent offer
              await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), agentOffer.id);

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

              await expect(
                fundsHandler.connect(other).withdrawFunds(agentId, [await mockToken.getAddress()], [agentPayoff])
              )
                .to.emit(fundsHandler, "FundsWithdrawn")
                .withArgs(agentId, agent.wallet, await mockToken.getAddress(), agentPayoff, agent.wallet);

              // Check the balance AFTER withdrawFunds()
              const feeCollectorNativeBalanceAfter = await mockToken.balanceOf(agent.wallet);

              // Expected balance
              const expectedFeeCollectorNativeBalanceAfter =
                BigInt(feeCollectorNativeBalanceBefore) + BigInt(agentPayoff);

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

              agentPayoff = ((BigInt(agentOffer.price) * BigInt(agent.feePercentage)) / 10000n).toString();

              // Check the balance BEFORE withdrawFunds()
              const feeCollectorNativeBalanceBefore = await mockToken.balanceOf(agent.wallet);

              await expect(
                fundsHandler.connect(other).withdrawFunds(agentId, [await mockToken.getAddress()], [agentPayoff])
              )
                .to.emit(fundsHandler, "FundsWithdrawn")
                .withArgs(agentId, agent.wallet, await mockToken.getAddress(), agentPayoff, agent.wallet);

              // Check the balance AFTER withdrawFunds()
              const feeCollectorNativeBalanceAfter = await mockToken.balanceOf(agent.wallet);

              // Expected balance
              const expectedFeeCollectorNativeBalanceAfter =
                BigInt(feeCollectorNativeBalanceBefore) + BigInt(agentPayoff);

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
              tokenListBuyer = [ZeroAddress, await mockToken.getAddress()];

              // Withdraw amounts
              tokenAmountsBuyer = [BigInt(buyerPayoff), BigInt(buyerPayoff) / 5n];

              // Pause the funds region of the protocol
              await pauseHandler.connect(pauser).pause([PausableRegion.Funds]);

              // Attempt to withdraw funds, expecting revert
              await expect(fundsHandler.connect(buyer).withdrawFunds(buyerId, tokenListBuyer, tokenAmountsBuyer))
                .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
                .withArgs(PausableRegion.Funds);
            });

            it("Caller is not authorized to withdraw", async function () {
              // Attempt to withdraw the buyer funds, expecting revert
              await expect(fundsHandler.connect(rando).withdrawFunds(buyerId, [], [])).to.revertedWithCustomError(
                bosonErrors,
                RevertReasons.NOT_AUTHORIZED
              );

              // Attempt to withdraw the seller funds, expecting revert
              await expect(fundsHandler.connect(rando).withdrawFunds(seller.id, [], [])).to.revertedWithCustomError(
                bosonErrors,
                RevertReasons.NOT_AUTHORIZED
              );

              // Attempt to withdraw the seller funds as treasury, expecting revert
              await expect(fundsHandler.connect(treasury).withdrawFunds(seller.id, [], [])).to.revertedWithCustomError(
                bosonErrors,
                RevertReasons.NOT_AUTHORIZED
              );
            });

            it("Token list address does not match token amount address", async function () {
              // Withdraw token
              tokenList = [await mockToken.getAddress(), ZeroAddress];
              tokenAmounts = [sellerPayoff];

              // Attempt to withdraw the funds, expecting revert
              await expect(
                fundsHandler.connect(assistant).withdrawFunds(seller.id, tokenList, tokenAmounts)
              ).to.revertedWithCustomError(bosonErrors, RevertReasons.TOKEN_AMOUNT_MISMATCH);
            });

            it("Caller tries to withdraw more than they have in the available funds", async function () {
              // Withdraw token
              tokenList = [await mockToken.getAddress()];
              tokenAmounts = [BigInt(sellerPayoff) * 2n];

              // Attempt to withdraw the funds, expecting revert
              await expect(
                fundsHandler.connect(assistant).withdrawFunds(seller.id, tokenList, tokenAmounts)
              ).to.revertedWithCustomError(bosonErrors, RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS);
            });

            it("Caller tries to withdraw the same token twice", async function () {
              // Withdraw token
              tokenList = [await mockToken.getAddress(), await mockToken.getAddress()];
              tokenAmounts = [sellerPayoff, sellerPayoff];

              // Attempt to withdraw the funds, expecting revert
              await expect(
                fundsHandler.connect(assistant).withdrawFunds(seller.id, tokenList, tokenAmounts)
              ).to.revertedWithCustomError(bosonErrors, RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS);
            });

            it("Nothing to withdraw", async function () {
              // Withdraw token
              tokenList = [await mockToken.getAddress()];
              tokenAmounts = ["0"];

              await expect(
                fundsHandler.connect(assistant).withdrawFunds(seller.id, tokenList, tokenAmounts)
              ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOTHING_TO_WITHDRAW);

              // first withdraw everything
              await fundsHandler.connect(assistant).withdrawFunds(seller.id, [], []);

              // Attempt to withdraw the funds, expecting revert
              await expect(fundsHandler.connect(assistant).withdrawFunds(seller.id, [], [])).to.revertedWithCustomError(
                bosonErrors,
                RevertReasons.NOTHING_TO_WITHDRAW
              );
            });

            it("Transfer of funds failed - revert in fallback", async function () {
              // deploy a contract that cannot receive funds
              const [fallbackErrorContract] = await deployMockTokens(["FallbackError"]);

              // commit to offer on behalf of some contract
              tx = await exchangeHandler
                .connect(buyer)
                .commitToOffer(await fallbackErrorContract.getAddress(), offerNative.id, { value: price });
              txReceipt = await tx.wait();
              event = getEvent(txReceipt, exchangeHandler, "BuyerCommitted");
              exchangeId = event.exchangeId;
              const fallbackContractBuyerId = event.buyerId;

              // revoke the voucher so the contract gets credited some funds
              await exchangeHandler.connect(assistant).revokeVoucher(exchangeId);

              // we call a fallbackContract which calls fundsHandler.withdraw, which should revert
              await expect(
                fallbackErrorContract.withdrawFunds(
                  await fundsHandler.getAddress(),
                  fallbackContractBuyerId,
                  [ZeroAddress],
                  [offerNative.price]
                )
              ).to.revertedWithCustomError(bosonErrors, RevertReasons.TOKEN_TRANSFER_FAILED);
            });

            it("Transfer of funds failed - no payable fallback or receive", async function () {
              // deploy a contract that cannot receive funds
              const [fallbackErrorContract] = await deployMockTokens(["WithoutFallbackError"]);

              // commit to offer on behalf of some contract
              tx = await exchangeHandler
                .connect(buyer)
                .commitToOffer(await fallbackErrorContract.getAddress(), offerNative.id, { value: price });
              txReceipt = await tx.wait();
              event = getEvent(txReceipt, exchangeHandler, "BuyerCommitted");
              exchangeId = event.exchangeId;
              const fallbackContractBuyerId = event.buyerId;

              // revoke the voucher so the contract gets credited some funds
              await exchangeHandler.connect(assistant).revokeVoucher(exchangeId);

              // we call a fallbackContract which calls fundsHandler.withdraw, which should revert
              await expect(
                fallbackErrorContract.withdrawFunds(
                  await fundsHandler.getAddress(),
                  fallbackContractBuyerId,
                  [ZeroAddress],
                  [offerNative.price]
                )
              ).to.revertedWithCustomError(bosonErrors, RevertReasons.TOKEN_TRANSFER_FAILED);
            });

            it("Transfer of funds failed - revert durin ERC20 transfer", async function () {
              // pause mockToken
              await mockToken.pause();

              await expect(fundsHandler.connect(assistant).withdrawFunds(seller.id, [], [])).to.revertedWith(
                RevertReasons.ERC20_PAUSED
              );
            });

            it("Transfer of funds failed - ERC20 transfer returns false", async function () {
              const [foreign20ReturnFalse] = await deployMockTokens(["Foreign20TransferReturnFalse"]);

              await foreign20ReturnFalse.connect(assistant).mint(await assistant.getAddress(), sellerDeposit);
              await foreign20ReturnFalse.connect(assistant).approve(protocolDiamondAddress, sellerDeposit);

              await fundsHandler
                .connect(assistant)
                .depositFunds(seller.id, await foreign20ReturnFalse.getAddress(), sellerDeposit);

              await expect(
                fundsHandler
                  .connect(assistant)
                  .withdrawFunds(seller.id, [await foreign20ReturnFalse.getAddress()], [sellerDeposit])
              ).to.revertedWith(RevertReasons.SAFE_ERC20_OPERATION_FAILED);
            });
          });
        });

        context("sequential commit", async function () {
          let royaltyRecipientId, royaltyRecipientId2;
          let tokenListRoyaltyRecipient, tokenListRoyaltyRecipient2;
          let tokenAmountsRoyaltyRecipient, tokenAmountsRoyaltyRecipient2;
          beforeEach(async function () {
            // Add royalty recipients
            const royaltyRecipientList = new RoyaltyRecipientInfoList([
              new RoyaltyRecipientInfo(other.address, "0"),
              new RoyaltyRecipientInfo(other2.address, "0"),
            ]);
            // Royalty recipients increase the accountIds by 2 in the protocol
            royaltyRecipientId = accountId.next().value;
            royaltyRecipientId2 = accountId.next().value;

            await accountHandler.connect(admin).addRoyaltyRecipients(seller.id, royaltyRecipientList.toStruct());
            const royaltySplit = {
              seller: 5000, // 50%
              other: 3000, // 30%
              other2: 2000, // 20%
            };

            const royalties = 600;
            let newRoyaltyInfo = new RoyaltyInfo(
              [ZeroAddress, other.address, other2.address],
              [
                applyPercentage(royalties, royaltySplit.seller),
                applyPercentage(royalties, royaltySplit.other),
                applyPercentage(royalties, royaltySplit.other2),
              ]
            );

            await offerHandler.connect(assistant).updateOfferRoyaltyRecipients(offerToken.id, newRoyaltyInfo);

            price = (BigInt(offerToken.price) * 11n) / 10n;
            const expectedCloneAddress = calculateCloneAddress(
              await accountHandler.getAddress(),
              beaconProxyAddress,
              admin.address
            );
            const bosonVoucherClone = await ethers.getContractAt("BosonVoucher", expectedCloneAddress);
            const tokenId = deriveTokenId(offerToken.id, exchangeId);
            let order = {
              seller: buyer.address,
              buyer: buyer2.address,
              voucherContract: expectedCloneAddress,
              tokenId: tokenId,
              exchangeToken: offerToken.exchangeToken,
              price: BigInt(price),
            };

            const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilBuyOrder", [order]);

            const priceDiscovery = new PriceDiscovery(
              order.price,
              Side.Ask,
              await priceDiscoveryContract.getAddress(),
              await priceDiscoveryContract.getAddress(),
              priceDiscoveryData
            );

            let royaltyRecipientPayoff = applyPercentage(price, applyPercentage(royalties, royaltySplit.other));
            let royaltyRecipient2Payoff = applyPercentage(price, applyPercentage(royalties, royaltySplit.other2));

            // voucher owner approves protocol to transfer the tokens
            await mockToken.mint(buyer.address, order.price);
            await mockToken.connect(buyer).approve(protocolDiamondAddress, order.price);

            // Voucher owner approves PriceDiscovery contract to transfer the tokens
            await bosonVoucherClone.connect(buyer).setApprovalForAll(await priceDiscoveryContract.getAddress(), true);

            // Buyer approves protocol to transfer the tokens
            await mockToken.mint(buyer2.address, order.price);
            await mockToken.connect(buyer2).approve(protocolDiamondAddress, order.price);

            // commit to offer
            await sequentialCommitHandler
              .connect(buyer2)
              .sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery, {
                gasPrice: 0,
              });

            // Finalize the exchange
            await setNextBlockTimestamp(Number(voucherRedeemableFrom));
            await exchangeHandler.connect(buyer2).redeemVoucher(exchangeId);
            await exchangeHandler.connect(buyer2).completeExchange(exchangeId);

            // Withdraw tokens
            tokenListRoyaltyRecipient = [await mockToken.getAddress()];
            tokenListRoyaltyRecipient2 = [await mockToken.getAddress()];

            // Withdraw amounts
            tokenAmountsRoyaltyRecipient = [royaltyRecipientPayoff];
            tokenAmountsRoyaltyRecipient2 = [royaltyRecipient2Payoff];
          });

          it("should emit a FundsWithdrawn event", async function () {
            // Withdraw funds, testing for the event
            // First royalty recipient withdrawal
            await expect(
              fundsHandler
                .connect(other)
                .withdrawFunds(royaltyRecipientId, tokenListRoyaltyRecipient, tokenAmountsRoyaltyRecipient)
            )
              .to.emit(fundsHandler, "FundsWithdrawn")
              .withArgs(
                royaltyRecipientId,
                other.address,
                await mockToken.getAddress(),
                tokenAmountsRoyaltyRecipient[0],
                other.address
              );

            // Second royalty recipient withdrawal
            await expect(
              fundsHandler
                .connect(other2)
                .withdrawFunds(royaltyRecipientId2, tokenListRoyaltyRecipient2, tokenAmountsRoyaltyRecipient2)
            )
              .to.emit(fundsHandler, "FundsWithdrawn")
              .withArgs(
                royaltyRecipientId2,
                other2.address,
                await mockToken.getAddress(),
                tokenAmountsRoyaltyRecipient2[0],
                other2.address
              );
          });

          it("should update state", async function () {
            // WITHDRAW ONE TOKEN PARTIALLY
            let royaltyRecipientPayoff = tokenAmountsRoyaltyRecipient[0];

            // Read on chain state
            let royaltyRecipientAvailableFunds = FundsList.fromStruct(
              await fundsHandler.getAllAvailableFunds(royaltyRecipientId)
            );
            const royaltyRecipientBalanceBefore = await mockToken.balanceOf(other.address);

            // Chain state should match the expected available funds before the withdrawal
            let expectedRoyaltyRecipientAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", tokenAmountsRoyaltyRecipient[0]),
            ]);
            expect(royaltyRecipientAvailableFunds).to.eql(
              expectedRoyaltyRecipientAvailableFunds,
              "Royalty recipient available funds mismatch before withdrawal"
            );

            // withdraw funds
            const withdrawAmount = BigInt(royaltyRecipientPayoff) / 2n;
            await fundsHandler
              .connect(other)
              .withdrawFunds(royaltyRecipientId, tokenListRoyaltyRecipient, [withdrawAmount]);

            // Read on chain state
            royaltyRecipientAvailableFunds = FundsList.fromStruct(
              await fundsHandler.getAllAvailableFunds(royaltyRecipientId)
            );
            const royaltyRecipientBalanceAfter = await mockToken.balanceOf(other.address);

            // Chain state should match the expected available funds after the withdrawal
            // Token available funds are reduced for the withdrawal amount
            expectedRoyaltyRecipientAvailableFunds.funds[0] = new Funds(
              await mockToken.getAddress(),
              "Foreign20",
              BigInt(royaltyRecipientPayoff) - BigInt(withdrawAmount)
            );
            expect(royaltyRecipientAvailableFunds).to.eql(
              expectedRoyaltyRecipientAvailableFunds,
              "Royalty recipient available funds mismatch after withdrawal"
            );

            // Token balance is increased for the withdrawAmount
            expect(royaltyRecipientBalanceAfter).to.eql(
              royaltyRecipientBalanceBefore + withdrawAmount,
              "Royalty recipient token balance mismatch"
            );

            // WITHDRAW ONE TOKEN FULLY

            // Read on chain state
            let royaltyRecipient2Payoff = tokenAmountsRoyaltyRecipient2[0];

            // Read on chain state
            let royaltyRecipient2AvailableFunds = FundsList.fromStruct(
              await fundsHandler.getAllAvailableFunds(royaltyRecipientId2)
            );
            const royaltyRecipient2BalanceBefore = await mockToken.balanceOf(other2.address);

            // Chain state should match the expected available funds before the withdrawal
            let expectedRoyaltyRecipient2AvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", tokenAmountsRoyaltyRecipient2[0]),
            ]);
            expect(royaltyRecipient2AvailableFunds).to.eql(
              expectedRoyaltyRecipient2AvailableFunds,
              "Royalty recipient available funds mismatch before withdrawal"
            );

            // withdraw funds
            const withdrawAmount2 = BigInt(royaltyRecipient2Payoff);
            await fundsHandler
              .connect(other2)
              .withdrawFunds(royaltyRecipientId2, tokenListRoyaltyRecipient2, [withdrawAmount2]);

            // Read on chain state
            royaltyRecipient2AvailableFunds = FundsList.fromStruct(
              await fundsHandler.getAllAvailableFunds(royaltyRecipientId2)
            );
            const royaltyRecipient2BalanceAfter = await mockToken.balanceOf(other2.address);

            // Chain state should match the expected available funds after the withdrawal
            // Fund list should be empty
            expectedRoyaltyRecipient2AvailableFunds = new FundsList([]);
            expect(royaltyRecipient2AvailableFunds).to.eql(
              expectedRoyaltyRecipient2AvailableFunds,
              "Royalty recipient available funds mismatch after withdrawal"
            );

            // Token balance is increased for the withdrawAmount
            expect(royaltyRecipient2BalanceAfter).to.eql(
              royaltyRecipient2BalanceBefore + withdrawAmount2,
              "Royalty recipient token balance mismatch"
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

          // seller: sellerDeposit + offerToken.price
          sellerPayoff = BigInt(offerToken.sellerDeposit) + BigInt(offerToken.price);

          // protocol: protocolFee
          protocolPayoff = BigInt(offerTokenProtocolFee);

          // grant fee collecor role
          await accessController.grantRole(Role.FEE_COLLECTOR, await feeCollector.getAddress());

          // set the protocol id
          protocolId = "0";
        });

        it("should emit a FundsWithdrawn event", async function () {
          // Withdraw funds, testing for the event
          tokenList = [await mockToken.getAddress(), ZeroAddress];
          tokenAmounts = [protocolPayoff, protocolPayoff];

          // protocol fee withdrawal
          const tx = await fundsHandler.connect(feeCollector).withdrawProtocolFees(tokenList, tokenAmounts);
          await expect(tx)
            .to.emit(fundsHandler, "FundsWithdrawn")
            .withArgs(
              protocolId,
              await protocolTreasury.getAddress(),
              await mockToken.getAddress(),
              protocolPayoff,
              await feeCollector.getAddress()
            );

          await expect(tx)
            .to.emit(fundsHandler, "FundsWithdrawn")
            .withArgs(
              protocolId,
              await protocolTreasury.getAddress(),
              0n,
              protocolPayoff,
              await feeCollector.getAddress()
            );
        });

        it("should update state", async function () {
          // Read on chain state
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
          const protocolTreasuryNativeBalanceBefore = await provider.getBalance(await protocolTreasury.getAddress());
          const protocolTreasuryTokenBalanceBefore = await mockToken.balanceOf(await protocolTreasury.getAddress());

          // Chain state should match the expected available funds before the withdrawal
          expectedProtocolAvailableFunds = new FundsList([
            new Funds(await mockToken.getAddress(), "Foreign20", protocolPayoff.toString()),
            new Funds(ZeroAddress, "Native currency", protocolPayoff.toString()),
          ]);

          expect(protocolAvailableFunds).to.eql(
            expectedProtocolAvailableFunds,
            "Protocol available funds mismatch before withdrawal"
          );

          // withdraw funds
          const partialFeeWithdrawAmount = BigInt(protocolPayoff) - parseUnits("0.01", "ether");
          tx = await fundsHandler
            .connect(feeCollector)
            .withdrawProtocolFees(
              [await mockToken.getAddress(), ZeroAddress],
              [protocolPayoff, partialFeeWithdrawAmount]
            );

          // calcualte tx costs
          txReceipt = await tx.wait();
          txCost = tx.gasPrice * txReceipt.gasUsed;

          // Read on chain state
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
          const protocolTreasuryNativeBalanceAfter = await provider.getBalance(await protocolTreasury.getAddress());
          const protocolTreasuryTokenBalanceAfter = await mockToken.balanceOf(await protocolTreasury.getAddress());

          // Chain state should match the expected available funds after the withdrawal
          // Native currency available funds are reduced for the withdrawal amount
          // Mock token is fully withdrawn
          expectedProtocolAvailableFunds = new FundsList([
            new Funds(ZeroAddress, "Native currency", (BigInt(protocolPayoff) - partialFeeWithdrawAmount).toString()),
          ]);

          expect(protocolAvailableFunds).to.eql(
            expectedProtocolAvailableFunds,
            "Protocol available funds mismatch after withdrawal"
          );
          // Native currency balance is increased for the partialFeeWithdrawAmount
          expect(protocolTreasuryNativeBalanceAfter).to.eql(
            protocolTreasuryNativeBalanceBefore + partialFeeWithdrawAmount,
            "Fee collector token balance mismatch"
          );
          // Token balance is increased for the protocol fee
          expect(protocolTreasuryTokenBalanceAfter).to.eql(
            protocolTreasuryTokenBalanceBefore + BigInt(protocolPayoff),
            "Fee collector token balance mismatch"
          );
        });

        it("should allow to withdraw all funds at once", async function () {
          // Read on chain state
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
          const protocolTreasuryNativeBalanceBefore = await provider.getBalance(await protocolTreasury.getAddress());
          const protocolTreasuryTokenBalanceBefore = await mockToken.balanceOf(await protocolTreasury.getAddress());

          // Chain state should match the expected available funds before the withdrawal
          expectedProtocolAvailableFunds = new FundsList([
            new Funds(await mockToken.getAddress(), "Foreign20", protocolPayoff.toString()),
            new Funds(ZeroAddress, "Native currency", protocolPayoff.toString()),
          ]);

          expect(protocolAvailableFunds).to.eql(
            expectedProtocolAvailableFunds,
            "Protocol available funds mismatch before withdrawal"
          );

          // withdraw all funds
          tx = await fundsHandler.connect(feeCollector).withdrawProtocolFees([], []);

          // calcualte tx costs
          txReceipt = await tx.wait();
          txCost = tx.gasPrice * txReceipt.gasUsed;

          // Read on chain state
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
          const protocolTreasuryNativeBalanceAfter = await provider.getBalance(await protocolTreasury.getAddress());
          const protocolTreasuryTokenBalanceAfter = await mockToken.balanceOf(await protocolTreasury.getAddress());

          // Chain state should match the expected available funds after the withdrawal
          // Funds available should be an empty list
          expectedProtocolAvailableFunds = new FundsList([]);
          expect(protocolAvailableFunds).to.eql(
            expectedProtocolAvailableFunds,
            "Protocol available funds mismatch after withdrawal"
          );
          // Native currency balance is increased for the partialFeeWithdrawAmount
          expect(protocolTreasuryNativeBalanceAfter).to.eql(
            protocolTreasuryNativeBalanceBefore + protocolPayoff,
            "Fee collector native currency balance mismatch"
          );
          // Token balance is increased for the protocol fee
          expect(protocolTreasuryTokenBalanceAfter).to.eql(
            protocolTreasuryTokenBalanceBefore + protocolPayoff,
            "Fee collector token balance mismatch"
          );
        });

        it("It's possible to withdraw same token twice if in total enough available funds", async function () {
          let reduction = parseUnits("0.01", "ether");
          // Withdraw token
          tokenList = [await mockToken.getAddress(), await mockToken.getAddress()];
          tokenAmounts = [BigInt(protocolPayoff) - reduction, reduction];

          // protocol fee withdrawal
          const tx = await fundsHandler.connect(feeCollector).withdrawProtocolFees(tokenList, tokenAmounts);
          await expect(tx)
            .to.emit(fundsHandler, "FundsWithdrawn")
            .withArgs(
              protocolId,
              await protocolTreasury.getAddress(),
              await mockToken.getAddress(),
              BigInt(protocolPayoff) - reduction,
              await feeCollector.getAddress()
            );

          await expect(tx)
            .to.emit(fundsHandler, "FundsWithdrawn")
            .withArgs(
              protocolId,
              await protocolTreasury.getAddress(),
              await mockToken.getAddress(),
              reduction,
              await feeCollector.getAddress()
            );
        });

        context("💔 Revert Reasons", async function () {
          it("The funds region of protocol is paused", async function () {
            // Withdraw funds, testing for the event
            tokenList = [await mockToken.getAddress(), ZeroAddress];
            tokenAmounts = [protocolPayoff, protocolPayoff];

            // Pause the funds region of the protocol
            await pauseHandler.connect(pauser).pause([PausableRegion.Funds]);

            // Attempt to withdraw funds, expecting revert
            await expect(fundsHandler.connect(feeCollector).withdrawProtocolFees(tokenList, tokenAmounts))
              .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
              .withArgs(PausableRegion.Funds);
          });

          it("Caller is not authorized to withdraw", async function () {
            // Attempt to withdraw the protocol fees, expecting revert
            await expect(fundsHandler.connect(rando).withdrawProtocolFees([], [])).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.ACCESS_DENIED
            );
          });

          it("Token list address does not match token amount address", async function () {
            // Withdraw token
            tokenList = [await mockToken.getAddress(), ZeroAddress];
            tokenAmounts = [sellerPayoff];

            // Attempt to withdraw the funds, expecting revert
            await expect(
              fundsHandler.connect(feeCollector).withdrawProtocolFees(tokenList, tokenAmounts)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.TOKEN_AMOUNT_MISMATCH);
          });

          it("Caller tries to withdraw more than they have in the available funds", async function () {
            // Withdraw token
            tokenList = [await mockToken.getAddress()];
            tokenAmounts = [BigInt(offerTokenProtocolFee) * 2n];

            // Attempt to withdraw the funds, expecting revert
            await expect(
              fundsHandler.connect(feeCollector).withdrawProtocolFees(tokenList, tokenAmounts)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS);
          });

          it("Caller tries to withdraw the same token twice", async function () {
            // Withdraw token
            tokenList = [await mockToken.getAddress(), await mockToken.getAddress()];
            tokenAmounts = [offerTokenProtocolFee, offerTokenProtocolFee];

            // Attempt to withdraw the funds, expecting revert
            await expect(
              fundsHandler.connect(feeCollector).withdrawProtocolFees(tokenList, tokenAmounts)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS);
          });

          it("Nothing to withdraw", async function () {
            // Withdraw token
            tokenList = [await mockToken.getAddress()];
            tokenAmounts = ["0"];

            await expect(
              fundsHandler.connect(feeCollector).withdrawProtocolFees(tokenList, tokenAmounts)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOTHING_TO_WITHDRAW);

            // first withdraw everything
            await fundsHandler.connect(feeCollector).withdrawProtocolFees([], []);

            // Attempt to withdraw the funds, expecting revert
            await expect(fundsHandler.connect(feeCollector).withdrawProtocolFees([], [])).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.NOTHING_TO_WITHDRAW
            );
          });

          it("Transfer of funds failed - revert in fallback", async function () {
            // deploy a contract that cannot receive funds
            const [fallbackErrorContract] = await deployMockTokens(["FallbackError"]);

            // temporarily grant ADMIN role to deployer account
            await accessController.grantRole(Role.ADMIN, await deployer.getAddress());

            // set treasury to this contract
            await configHandler.connect(deployer).setTreasuryAddress(await fallbackErrorContract.getAddress());

            // attempt to withdraw the funds, expecting revert
            await expect(
              fundsHandler.connect(feeCollector).withdrawProtocolFees([ZeroAddress], [offerNativeProtocolFee])
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.TOKEN_TRANSFER_FAILED);
          });

          it("Transfer of funds failed - no payable fallback or receive", async function () {
            // deploy a contract that cannot receive funds
            const [fallbackErrorContract] = await deployMockTokens(["WithoutFallbackError"]);

            // temporarily grant ADMIN role to deployer account
            await accessController.grantRole(Role.ADMIN, await deployer.getAddress());

            // set treasury to this contract
            await configHandler.connect(deployer).setTreasuryAddress(await fallbackErrorContract.getAddress());

            // attempt to withdraw the funds, expecting revert
            await expect(
              fundsHandler.connect(feeCollector).withdrawProtocolFees([ZeroAddress], [offerNativeProtocolFee])
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.TOKEN_TRANSFER_FAILED);
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

    context("👉 getAllAvailableFunds()", async function () {
      it("Returns info also for ERC20 tokens without the name", async function () {
        // Deploy the mock token with no name
        const [mockToken] = await deployMockTokens(["Foreign20NoName"]);

        // top up assistants account
        await mockToken.mint(await assistant.getAddress(), "1000000");
        // approve protocol to transfer the tokens
        await mockToken.connect(assistant).approve(protocolDiamondAddress, "1000000");

        // Deposit token
        await fundsHandler.connect(assistant).depositFunds(seller.id, await mockToken.getAddress(), depositAmount);

        // Read on chain state
        let returnedAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));

        // Chain state should match the expected available funds
        let expectedAvailableFunds = new FundsList([
          new Funds(await mockToken.getAddress(), "Token name unavailable", depositAmount.toString()),
        ]);
        expect(returnedAvailableFunds).to.eql(expectedAvailableFunds);
      });

      it("Returns info even if name consumes all the gas", async function () {
        // Deploy the mock token that consumes all gas in the name getter
        const [mockToken, mockToken2, mockToken3] = await deployMockTokens([
          "Foreign20MaliciousName",
          "Foreign20MaliciousName",
          "Foreign20",
        ]);

        // top up attackers account
        await mockToken.mint(rando.address, "1000000");
        await mockToken2.mint(rando.address, "1000000");
        await mockToken3.mint(rando.address, "1000000");

        // approve protocol to transfer the tokens
        await mockToken.connect(rando).approve(protocolDiamondAddress, "1000000");
        await mockToken2.connect(rando).approve(protocolDiamondAddress, "1000000");
        await mockToken3.connect(rando).approve(protocolDiamondAddress, "1000000");

        // Deposit token - seller
        await fundsHandler
          .connect(assistant)
          .depositFunds(seller.id, ZeroAddress, depositAmount, { value: depositAmount });
        // Deposit token - attacker
        await fundsHandler.connect(rando).depositFunds(seller.id, await mockToken.getAddress(), depositAmount);
        await fundsHandler.connect(rando).depositFunds(seller.id, await mockToken2.getAddress(), depositAmount);
        await fundsHandler.connect(rando).depositFunds(seller.id, await mockToken3.getAddress(), depositAmount);

        // Read on chain state
        let returnedAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));

        let expectedAvailableFunds = new FundsList([
          new Funds(ZeroAddress, "Native currency", depositAmount.toString()),
          new Funds(await mockToken.getAddress(), "Token name unavailable", depositAmount.toString()),
          new Funds(await mockToken2.getAddress(), "Token name unavailable", depositAmount.toString()),
          new Funds(await mockToken3.getAddress(), "Foreign20", depositAmount.toString()),
        ]);
        expect(returnedAvailableFunds).to.eql(expectedAvailableFunds);
      });
    });

    context("👉 getAvailableFunds()", async function () {
      it("Returns info even if name consumes all the gas", async function () {
        // Deploy the mock token that consumes all gas in the name getter
        const [mockToken, mockToken2] = await deployMockTokens(["Foreign20", "Foreign20MaliciousName"]);
        const ERC20 = await getContractFactory("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20");
        const mockToken3 = await ERC20.deploy("SomeToken", "STK");

        // top up assistants account
        await mockToken.mint(assistant.address, "1000000");
        await mockToken2.mint(assistant.address, "1000000");

        // approve protocol to transfer the tokens
        await mockToken.connect(assistant).approve(protocolDiamondAddress, "1000000");
        await mockToken2.connect(assistant).approve(protocolDiamondAddress, "1000000");

        // Deposit token - seller
        await fundsHandler.connect(assistant).depositFunds(seller.id, await mockToken.getAddress(), depositAmount);
        await fundsHandler
          .connect(assistant)
          .depositFunds(seller.id, ZeroAddress, depositAmount, { value: depositAmount });
        await fundsHandler.connect(assistant).depositFunds(seller.id, await mockToken2.getAddress(), depositAmount);

        // Read on chain state
        const tokenList = [ZeroAddress, await mockToken3.getAddress(), await mockToken.getAddress()];
        const returnedAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id, tokenList));

        const expectedAvailableFunds = new FundsList([
          new Funds(ZeroAddress, "Native currency", depositAmount.toString()),
          new Funds(await mockToken3.getAddress(), "SomeToken", "0"),
          new Funds(await mockToken.getAddress(), "Foreign20", depositAmount.toString()),
        ]);
        expect(returnedAvailableFunds).to.eql(expectedAvailableFunds);
      });
    });

    context("👉 getTokenList()", async function () {
      it("Returns list of tokens", async function () {
        // Deploy the mock token that consumes all gas in the name getter
        const [mockToken, mockToken2, mockToken3] = await deployMockTokens(["Foreign20", "Foreign20", "Foreign20"]);

        // top up assistants account
        await mockToken.mint(assistant.address, "1000000");
        await mockToken2.mint(assistant.address, "1000000");
        await mockToken3.mint(assistant.address, "1000000");

        // approve protocol to transfer the tokens
        await mockToken.connect(assistant).approve(protocolDiamondAddress, "1000000");
        await mockToken2.connect(assistant).approve(protocolDiamondAddress, "1000000");
        await mockToken3.connect(assistant).approve(protocolDiamondAddress, "1000000");

        // Deposit token - seller
        await fundsHandler.connect(assistant).depositFunds(seller.id, await mockToken.getAddress(), depositAmount);
        await fundsHandler
          .connect(assistant)
          .depositFunds(seller.id, ZeroAddress, depositAmount, { value: depositAmount });
        await fundsHandler.connect(assistant).depositFunds(seller.id, await mockToken2.getAddress(), depositAmount);
        await fundsHandler.connect(assistant).depositFunds(seller.id, await mockToken3.getAddress(), depositAmount);

        // Read on chain state
        const returnedTokenList = await fundsHandler.getTokenList(seller.id);
        const expectedAvailableFunds = [
          await mockToken.getAddress(),
          ZeroAddress,
          await mockToken2.getAddress(),
          await mockToken3.getAddress(),
        ];
        expect(returnedTokenList).to.eql(expectedAvailableFunds);
      });
    });

    context("👉 getTokenListPaginated()", async function () {
      let mockTokens;
      beforeEach(async function () {
        // Deploy the mock token that consumes all gas in the name getter
        mockTokens = await deployMockTokens(["Foreign20", "Foreign20", "Foreign20", "Foreign20", "Foreign20"]);

        // top up assistants account
        for (const mockToken of mockTokens) {
          await mockToken.mint(assistant.address, "1000000");
          await mockToken.connect(assistant).approve(protocolDiamondAddress, "1000000");
          await fundsHandler.connect(assistant).depositFunds(seller.id, await mockToken.getAddress(), depositAmount);
        }

        // Deposit token - seller
        await fundsHandler
          .connect(assistant)
          .depositFunds(seller.id, ZeroAddress, depositAmount, { value: depositAmount });
      });

      it("Returns list of tokens", async function () {
        const limit = 3;
        const offset = 1;

        // Read on chain state
        const returnedTokenList = await fundsHandler.getTokenListPaginated(seller.id, limit, offset);
        const expectedAvailableFunds = await Promise.all(
          mockTokens.slice(offset, offset + limit).map((token) => token.getAddress())
        );
        expect(returnedTokenList).to.eql(expectedAvailableFunds);
      });

      it("Offset is more than number of tokens", async function () {
        const limit = 2;
        const offset = 8;
        // Read on chain state
        const returnedTokenList = await fundsHandler.getTokenListPaginated(seller.id, limit, offset);
        const expectedAvailableFunds = [];
        expect(returnedTokenList).to.eql(expectedAvailableFunds);
      });

      it("Limit + offset is more than number of tokens", async function () {
        const limit = 7;
        const offset = 2;
        // Read on chain state
        const returnedTokenList = await fundsHandler.getTokenListPaginated(seller.id, limit, offset);
        const expectedAvailableFunds = [
          ...(await Promise.all(mockTokens.slice(offset).map((token) => token.getAddress()))),
          ZeroAddress,
        ];
        expect(returnedTokenList).to.eql(expectedAvailableFunds);
      });
    });
  });

  // Funds library methods.
  // Cannot be invoked directly, so tests calls the methods that use them
  context("📋 FundsBase  Methods", async function () {
    let orderPrice;
    beforeEach(async function () {
      // Create a valid seller
      seller = mockSeller(
        await assistant.getAddress(),
        await admin.getAddress(),
        clerk.address,
        await treasury.getAddress()
      );
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
        await assistantDR.getAddress(),
        await adminDR.getAddress(),
        clerkDR.address,
        await treasuryDR.getAddress(),
        true
      );
      expect(disputeResolver.isValid()).is.true;

      //Create DisputeResolverFee array so offer creation will succeed
      DRFee = parseUnits("0", "ether").toString();
      disputeResolverFees = [
        new DisputeResolverFee(ZeroAddress, "Native", "0"),
        new DisputeResolverFee(await mockToken.getAddress(), "mockToken", DRFee),
      ];

      // Make empty seller list, so every seller is allowed
      const sellerAllowList = [];
      buyerEscalationDeposit = applyPercentage(DRFee, buyerEscalationDepositPercentage);

      // Register the dispute resolver
      await accountHandler
        .connect(adminDR)
        .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

      const { offer, ...mo } = await mockOffer();
      offer.id = "0";
      offer.quantityAvailable = "2";
      offerNative = offer;

      offerToken = offerNative.clone();
      offerToken.id = "0";
      offerToken.exchangeToken = await mockToken.getAddress();

      offerPriceDiscovery = offer.clone();
      offerPriceDiscovery.id = "0";
      offerPriceDiscovery.quantityAvailable = "2";
      offerPriceDiscovery.priceType = PriceType.Discovery;
      offerPriceDiscovery.exchangeToken = await mockToken.getAddress();
      orderPrice = BigInt(offerPriceDiscovery.price) + 10000n;

      offerDates = mo.offerDates;
      expect(offerDates.isValid()).is.true;

      offerDurations = mo.offerDurations;
      expect(offerDurations.isValid()).is.true;

      disputeResolverId = mo.disputeResolverId;

      agentId = "0"; // agent id is optional while creating an offer
      offerFeeLimit = MaxUint256;
      // Create both offers
      offerNative.id = await offerHandler
        .connect(assistant)
        .createOffer(offerNative, offerDates, offerDurations, disputeResolverId, agentId, offerFeeLimit, {
          getOfferId: true,
        });
      offerToken.id = await offerHandler
        .connect(assistant)
        .createOffer(offerToken, offerDates, offerDurations, disputeResolverId, agentId, offerFeeLimit, {
          getOfferId: true,
        });
      offerPriceDiscovery.id = await offerHandler
        .connect(assistant)
        .createOffer(offerPriceDiscovery, offerDates, offerDurations, disputeResolverId, agentId, offerFeeLimit, {
          getOfferId: true,
        });
      expect(offerNative.isValid()).is.true;
      expect(offerPriceDiscovery.isValid()).is.true;
      // Set used variables
      price = offerToken.price;
      offerTokenProtocolFee = mo.offerFees.protocolFee;
      sellerDeposit = offerToken.sellerDeposit;
      voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
      resolutionPeriod = offerDurations.resolutionPeriod;

      // top up seller's and buyer's account
      await mockToken.mint(await assistant.getAddress(), `${20 * sellerDeposit}`);
      await mockToken.mint(await buyer.getAddress(), `${20 * price}`);

      // approve protocol to transfer the tokens
      await mockToken.connect(assistant).approve(protocolDiamondAddress, `${20 * sellerDeposit}`);
      await mockToken.connect(buyer).approve(protocolDiamondAddress, `${20 * price}`);

      // deposit to seller's pool
      await fundsHandler
        .connect(assistant)
        .depositFunds(seller.id, await mockToken.getAddress(), `${2 * sellerDeposit}`);
      await fundsHandler.connect(assistant).depositFunds(seller.id, ZeroAddress, `${2 * sellerDeposit}`, {
        value: `${2 * sellerDeposit}`,
      });

      // Agents
      // Create a valid agent,
      agentId = "3";
      agentFeePercentage = "500"; //5%
      agent = mockAgent(await other.getAddress());

      expect(agent.isValid()).is.true;

      // Create an agent
      await accountHandler.connect(rando).createAgent(agent);

      agentOffer = offerNative.clone();
      agentOffer.id = "0";
      agentOfferProtocolFee = mo.offerFees.protocolFee;

      randoBuyerId = "4"; // 1: seller, 2: disputeResolver, 3: agent, 4: rando
    });

    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
      generateOfferId.next(true);
    });

    context("👉 encumberFunds()", async function () {
      it("should emit a FundsEncumbered event", async function () {
        let buyerId = "4"; // 1: seller, 2: disputeResolver, 3: agent, 4: buyer

        // Commit to an offer with erc20 token, test for FundsEncumbered event
        const tx = await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerToken.id);
        await expect(tx)
          .to.emit(exchangeHandler, "FundsEncumbered")
          .withArgs(buyerId, await mockToken.getAddress(), price, await buyer.getAddress());

        await expect(tx)
          .to.emit(exchangeHandler, "FundsEncumbered")
          .withArgs(seller.id, await mockToken.getAddress(), sellerDeposit, await buyer.getAddress());

        // Commit to an offer with native currency, test for FundsEncumbered event
        const tx2 = await exchangeHandler
          .connect(buyer)
          .commitToOffer(await buyer.getAddress(), offerNative.id, { value: price });
        await expect(tx2)
          .to.emit(exchangeHandler, "FundsEncumbered")
          .withArgs(buyerId, ZeroAddress, price, await buyer.getAddress());

        await expect(tx2)
          .to.emit(exchangeHandler, "FundsEncumbered")
          .withArgs(seller.id, ZeroAddress, sellerDeposit, await buyer.getAddress());
      });

      it("should update state", async function () {
        // contract token value
        const contractTokenBalanceBefore = await mockToken.balanceOf(protocolDiamondAddress);
        // contract native token balance
        const contractNativeBalanceBefore = await provider.getBalance(protocolDiamondAddress);
        // seller's available funds
        const sellersAvailableFundsBefore = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));

        // Commit to an offer with erc20 token
        await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerToken.id);

        // Check that token balance increased
        const contractTokenBalanceAfter = await mockToken.balanceOf(protocolDiamondAddress);
        // contract token balance should increase for the incoming price
        // seller's deposit was already held in the contract's pool before
        expect(contractTokenBalanceAfter - contractTokenBalanceBefore).to.eql(
          BigInt(price),
          "Token wrong balance increase"
        );

        // Check that seller's pool balance was reduced
        let sellersAvailableFundsAfter = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
        // token is the first on the list of the available funds and the amount should be decreased for the sellerDeposit
        expect(
          BigInt(sellersAvailableFundsBefore.funds[0].availableAmount) -
            BigInt(sellersAvailableFundsAfter.funds[0].availableAmount)
        ).to.eql(BigInt(sellerDeposit), "Token seller available funds mismatch");

        // Commit to an offer with native currency
        await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerNative.id, { value: price });

        // check that native currency balance increased
        const contractNativeBalanceAfter = await provider.getBalance(protocolDiamondAddress);
        // contract token balance should increase for the incoming price
        // seller's deposit was already held in the contract's pool before
        expect(contractNativeBalanceAfter - contractNativeBalanceBefore).to.eql(
          BigInt(price),
          "Native currency wrong balance increase"
        );

        // Check that seller's pool balance was reduced
        sellersAvailableFundsAfter = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
        // native currency is the second on the list of the available funds and the amount should be decreased for the sellerDeposit
        expect(
          BigInt(sellersAvailableFundsBefore.funds[1].availableAmount) -
            BigInt(sellersAvailableFundsAfter.funds[1].availableAmount)
        ).to.eql(BigInt(sellerDeposit), "Native currency seller available funds mismatch");
      });

      context("seller's available funds drop to 0", async function () {
        it("token should be removed from the tokenList", async function () {
          // seller's available funds
          let sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
          expect(sellersAvailableFunds.funds.length).to.eql(2, "Funds length mismatch");
          expect(sellersAvailableFunds.funds[0].tokenAddress).to.eql(
            await mockToken.getAddress(),
            "Token contract address mismatch"
          );
          expect(sellersAvailableFunds.funds[1].tokenAddress).to.eql(ZeroAddress, "Native currency address mismatch");

          // Commit to offer with token twice to empty the seller's pool
          await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerToken.id);
          await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerToken.id);

          // Token address should be removed and have only native currency in the list
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
          expect(sellersAvailableFunds.funds.length).to.eql(1, "Funds length mismatch");
          expect(sellersAvailableFunds.funds[0].tokenAddress).to.eql(ZeroAddress, "Native currency address mismatch");

          // Commit to offer with token twice to empty the seller's pool
          await exchangeHandler
            .connect(buyer)
            .commitToOffer(await buyer.getAddress(), offerNative.id, { value: price });
          await exchangeHandler
            .connect(buyer)
            .commitToOffer(await buyer.getAddress(), offerNative.id, { value: price });

          // Seller available funds must be empty
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
          expect(sellersAvailableFunds.funds.length).to.eql(0, "Funds length mismatch");
        });

        it("token should be removed from the token list even when list length - 1 is different from index", async function () {
          // length - 1 is different from index when index isn't the first or last element in the list
          // Deploy a new mock token
          let TokenContractFactory = await getContractFactory("Foreign20");
          const otherToken = await TokenContractFactory.deploy();
          await otherToken.waitForDeployment();

          // Add otherToken to DR fees
          await accountHandler
            .connect(adminDR)
            .addFeesToDisputeResolver(disputeResolver.id, [
              new DisputeResolverFee(await otherToken.getAddress(), "Other Token", "0"),
            ]);

          // top up seller's and buyer's account
          await otherToken.mint(await assistant.getAddress(), sellerDeposit);

          // approve protocol to transfer the tokens
          await otherToken.connect(assistant).approve(protocolDiamondAddress, sellerDeposit);

          // deposit to seller's pool
          await fundsHandler.connect(assistant).depositFunds(seller.id, await otherToken.getAddress(), sellerDeposit);

          // seller's available funds
          let sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
          expect(sellersAvailableFunds.funds.length).to.eql(3, "Funds length mismatch");
          expect(sellersAvailableFunds.funds[0].tokenAddress).to.eql(
            await mockToken.getAddress(),
            "Token contract address mismatch"
          );
          expect(sellersAvailableFunds.funds[1].tokenAddress).to.eql(ZeroAddress, "Native currency address mismatch");
          expect(sellersAvailableFunds.funds[2].tokenAddress).to.eql(
            await otherToken.getAddress(),
            "Boson token address mismatch"
          );

          // Commit to offer with token twice to empty the seller's pool
          await exchangeHandler
            .connect(buyer)
            .commitToOffer(await buyer.getAddress(), offerNative.id, { value: price });
          await exchangeHandler
            .connect(buyer)
            .commitToOffer(await buyer.getAddress(), offerNative.id, { value: price });

          // Native currency address should be removed and have only mock token and other token in the list
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
          expect(sellersAvailableFunds.funds.length).to.eql(2, "Funds length mismatch");
          expect(sellersAvailableFunds.funds[0].tokenAddress).to.eql(
            await mockToken.getAddress(),
            "Token contract address mismatch"
          );
          expect(sellersAvailableFunds.funds[1].tokenAddress).to.eql(
            await otherToken.getAddress(),
            "Other token address mismatch"
          );
        });
      });

      it("when someone else deposits on buyer's behalf, callers funds are transferred", async function () {
        // buyer will commit to an offer on rando's behalf
        // get token balance before the commit
        const buyerTokenBalanceBefore = await mockToken.balanceOf(await buyer.getAddress());
        const randoTokenBalanceBefore = await mockToken.balanceOf(await rando.getAddress());

        // commit to an offer with token on rando's behalf
        await exchangeHandler.connect(buyer).commitToOffer(await rando.getAddress(), offerToken.id);

        // get token balance after the commit
        const buyerTokenBalanceAfter = await mockToken.balanceOf(await buyer.getAddress());
        const randoTokenBalanceAfter = await mockToken.balanceOf(await rando.getAddress());

        // buyer's balance should decrease, rando's should remain
        expect(buyerTokenBalanceBefore - buyerTokenBalanceAfter).to.eql(
          BigInt(price),
          "Buyer's token balance should decrease for a price"
        );
        expect(randoTokenBalanceAfter).to.eql(randoTokenBalanceBefore, "Rando's token balance should remain the same");
        // make sure that rando is actually the buyer of the exchange
        let exchange;
        [, exchange] = await exchangeHandler.getExchange("1");
        expect(exchange.buyerId.toString()).to.eql(randoBuyerId, "Wrong buyer id");

        // get native currency balance before the commit
        const buyerNativeBalanceBefore = await provider.getBalance(await buyer.getAddress());
        const randoNativeBalanceBefore = await provider.getBalance(await rando.getAddress());

        // commit to an offer with native currency on rando's behalf
        tx = await exchangeHandler
          .connect(buyer)
          .commitToOffer(await rando.getAddress(), offerNative.id, { value: price });
        txReceipt = await tx.wait();
        txCost = tx.gasPrice * txReceipt.gasUsed;

        // get token balance after the commit
        const buyerNativeBalanceAfter = await provider.getBalance(await buyer.getAddress());
        const randoNativeBalanceAfter = await provider.getBalance(await rando.getAddress());

        // buyer's balance should decrease, rando's should remain
        expect(buyerNativeBalanceBefore - buyerNativeBalanceAfter - txCost).to.eql(
          BigInt(price),
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
        expect(buyerStruct.wallet).to.eql(await rando.getAddress(), "Wrong buyer address");
      });

      it("if offer is preminted, only sellers funds are encumbered", async function () {
        // deposit to seller's pool to cover for the price
        const buyerId = mockBuyer().id;
        await mockToken.mint(await assistant.getAddress(), `${2 * price}`);
        await mockToken.connect(assistant).approve(protocolDiamondAddress, `${2 * price}`);
        await fundsHandler.connect(assistant).depositFunds(seller.id, await mockToken.getAddress(), `${2 * price}`);
        await fundsHandler.connect(assistant).depositFunds(seller.id, ZeroAddress, `${2 * price}`, {
          value: `${2 * price}`,
        });

        // get token balance before the commit
        const buyerTokenBalanceBefore = await mockToken.balanceOf(await buyer.getAddress());

        const sellersAvailableFundsBefore = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));

        // reserve a range and premint vouchers
        await offerHandler
          .connect(assistant)
          .reserveRange(offerToken.id, offerToken.quantityAvailable, assistant.address);
        const voucherCloneAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          admin.address
        );
        const bosonVoucher = await ethers.getContractAt("BosonVoucher", voucherCloneAddress);
        await bosonVoucher.connect(assistant).preMint(offerToken.id, offerToken.quantityAvailable);

        // commit to an offer via preminted voucher
        let exchangeId = "1";
        let tokenId = deriveTokenId(offerToken.id, exchangeId);
        tx = await bosonVoucher
          .connect(assistant)
          .transferFrom(await assistant.getAddress(), await buyer.getAddress(), tokenId);

        // it should emit FundsEncumbered event with amount equal to sellerDeposit + price
        let encumberedFunds = BigInt(sellerDeposit) + BigInt(price);
        await expect(tx)
          .to.emit(exchangeHandler, "FundsEncumbered")
          .withArgs(seller.id, await mockToken.getAddress(), encumberedFunds, await bosonVoucher.getAddress());

        // Check that seller's pool balance was reduced
        let sellersAvailableFundsAfter = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
        // token is the first on the list of the available funds and the amount should be decreased for the sellerDeposit and price
        expect(
          BigInt(sellersAvailableFundsBefore.funds[0].availableAmount) -
            BigInt(sellersAvailableFundsAfter.funds[0].availableAmount)
        ).to.eql(encumberedFunds, "Token seller available funds mismatch");

        // buyer's token balance should stay the same
        const buyerTokenBalanceAfter = await mockToken.balanceOf(await buyer.getAddress());
        expect(buyerTokenBalanceBefore.toString()).to.eql(
          buyerTokenBalanceAfter.toString(),
          "Buyer's token balance should remain the same"
        );

        // make sure that buyer is actually the buyer of the exchange
        let exchange;
        [, exchange] = await exchangeHandler.getExchange(exchangeId);
        expect(exchange.buyerId.toString()).to.eql(buyerId, "Wrong buyer id");

        // get native currency balance before the commit
        const buyerNativeBalanceBefore = await provider.getBalance(await buyer.getAddress());

        // reserve a range and premint vouchers
        exchangeId = await exchangeHandler.getNextExchangeId();
        tokenId = deriveTokenId(offerNative.id, exchangeId);
        await offerHandler
          .connect(assistant)
          .reserveRange(offerNative.id, offerNative.quantityAvailable, await assistant.getAddress());
        await bosonVoucher.connect(assistant).preMint(offerNative.id, offerNative.quantityAvailable);

        // commit to an offer via preminted voucher
        tx = await bosonVoucher
          .connect(assistant)
          .transferFrom(await assistant.getAddress(), await buyer.getAddress(), tokenId);

        // it should emit FundsEncumbered event with amount equal to sellerDeposit + price
        encumberedFunds = BigInt(sellerDeposit) + BigInt(price);
        await expect(tx)
          .to.emit(exchangeHandler, "FundsEncumbered")
          .withArgs(seller.id, ZeroAddress, encumberedFunds, await bosonVoucher.getAddress());

        // buyer's balance should remain the same
        const buyerNativeBalanceAfter = await provider.getBalance(await buyer.getAddress());
        expect(buyerNativeBalanceBefore.toString()).to.eql(
          buyerNativeBalanceAfter.toString(),
          "Buyer's native balance should remain the same"
        );

        // Check that seller's pool balance was reduced
        sellersAvailableFundsAfter = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
        // native currency the second on the list of the available funds and the amount should be decreased for the sellerDeposit and price
        expect(
          BigInt(sellersAvailableFundsBefore.funds[1].availableAmount) -
            BigInt(sellersAvailableFundsAfter.funds[1].availableAmount)
        ).to.eql(encumberedFunds, "Native currency seller available funds mismatch");

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
              .commitToOffer(await buyer.getAddress(), offerNative.id, { value: BigInt(price) - 1n })
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INSUFFICIENT_VALUE_RECEIVED);
        });

        it("Native currency sent together with ERC20 token transfer", async function () {
          // Attempt to commit to an offer, expecting revert
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerToken.id, { value: price })
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NATIVE_NOT_ALLOWED);
        });

        it("Token address contract does not support transferFrom", async function () {
          // Deploy a contract without the transferFrom
          [bosonToken] = await deployMockTokens(["BosonToken"]);

          // create an offer with a bad token contract
          offerToken.exchangeToken = await bosonToken.getAddress();

          // add to DR fees
          await accountHandler
            .connect(adminDR)
            .addFeesToDisputeResolver(disputeResolver.id, [
              new DisputeResolverFee(offerToken.exchangeToken, "BadContract", "0"),
            ]);
          offerToken.id = await offerHandler
            .connect(assistant)
            .createOffer(offerToken, offerDates, offerDurations, disputeResolverId, agentId, offerFeeLimit, {
              getOfferId: true,
            });

          // Attempt to commit to an offer, expecting revert
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerToken.id)
          ).to.revertedWith(RevertReasons.SAFE_ERC20_LOW_LEVEL_CALL);
        });

        it("Token address is not a contract", async function () {
          // create an offer with a bad token contract
          offerToken.exchangeToken = await admin.getAddress();

          // add to DR fees
          await accountHandler
            .connect(adminDR)
            .addFeesToDisputeResolver(disputeResolver.id, [
              new DisputeResolverFee(offerToken.exchangeToken, "NotAContract", "0"),
            ]);

          offerToken.id = await offerHandler
            .connect(assistant)
            .createOffer(offerToken, offerDates, offerDurations, disputeResolverId, agentId, offerFeeLimit, {
              getOfferId: true,
            });

          // Attempt to commit to an offer, expecting revert
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerToken.id)
          ).to.revertedWithoutReason();
        });

        it("Token contract revert for another reason", async function () {
          // insufficient funds
          // approve more than account actually have
          await mockToken.connect(rando).approve(protocolDiamondAddress, price);
          // Attempt to commit to an offer, expecting revert
          await expect(
            exchangeHandler.connect(rando).commitToOffer(await rando.getAddress(), offerToken.id)
          ).to.revertedWith(RevertReasons.ERC20_EXCEEDS_BALANCE);

          // not approved
          await mockToken.connect(rando).approve(protocolDiamondAddress, BigInt(price) - 1n);
          // Attempt to commit to an offer, expecting revert
          await expect(
            exchangeHandler.connect(rando).commitToOffer(await rando.getAddress(), offerToken.id)
          ).to.revertedWith(RevertReasons.ERC20_INSUFFICIENT_ALLOWANCE);
        });

        it("Seller'a availableFunds is less than the required sellerDeposit", async function () {
          // create an offer with token with higher seller deposit
          offerToken.sellerDeposit = BigInt(offerToken.sellerDeposit) * 4n;

          offerToken.id = await offerHandler
            .connect(assistant)
            .createOffer(offerToken, offerDates, offerDurations, disputeResolverId, agentId, offerFeeLimit, {
              getOfferId: true,
            });

          // Attempt to commit to an offer, expecting revert
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerToken.id)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS);

          // create an offer with native currency with higher seller deposit
          offerNative.sellerDeposit = BigInt(offerNative.sellerDeposit) * 4n;

          offerNative.id = await offerHandler
            .connect(assistant)
            .createOffer(offerNative, offerDates, offerDurations, disputeResolverId, agentId, offerFeeLimit, {
              getOfferId: true,
            });

          // Attempt to commit to an offer, expecting revert
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerNative.id, { value: price })
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS);
        });

        it("Seller'a availableFunds is less than the required sellerDeposit + price for preminted offer", async function () {
          // reserve a range and premint vouchers for offer in tokens
          await offerHandler
            .connect(assistant)
            .reserveRange(offerToken.id, offerToken.quantityAvailable, assistant.address);
          const voucherCloneAddress = calculateCloneAddress(
            await accountHandler.getAddress(),
            beaconProxyAddress,
            admin.address
          );
          const bosonVoucher = await ethers.getContractAt("BosonVoucher", voucherCloneAddress);
          await bosonVoucher.connect(assistant).preMint(offerToken.id, offerToken.quantityAvailable);

          // Seller's availableFunds is 2*sellerDeposit which is less than sellerDeposit + price.
          // Add the check in case if the sellerDeposit is changed in the future
          assert.isBelow(Number(sellerDeposit), Number(price), "Seller's availableFunds is not less than price");
          // Attempt to commit to an offer via preminted voucher, expecting revert
          let tokenId = deriveTokenId(offerToken.id, "1");
          await expect(
            bosonVoucher
              .connect(assistant)
              .transferFrom(await assistant.getAddress(), await buyer.getAddress(), tokenId)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS);

          // reserve a range and premint vouchers for offer in native currency
          exchangeId = await exchangeHandler.getNextExchangeId();
          tokenId = deriveTokenId(offerNative.id, exchangeId);
          await offerHandler
            .connect(assistant)
            .reserveRange(offerNative.id, offerNative.quantityAvailable, await assistant.getAddress());
          await bosonVoucher.connect(assistant).preMint(offerNative.id, offerNative.quantityAvailable);

          // Attempt to commit to an offer, expecting revert
          await expect(
            bosonVoucher
              .connect(assistant)
              .transferFrom(await assistant.getAddress(), await buyer.getAddress(), tokenId)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS);
        });

        it("Received ERC20 token amount differs from the expected value", async function () {
          // Deploy ERC20 with fees
          const [Foreign20WithFee] = await deployMockTokens(["Foreign20WithFee"]);

          // add to DR fees
          DRFee = parseUnits("0", "ether").toString();
          await accountHandler
            .connect(adminDR)
            .addFeesToDisputeResolver(disputeResolverId, [
              new DisputeResolverFee(await Foreign20WithFee.getAddress(), "Foreign20WithFee", DRFee),
            ]);

          // Create an offer with ERC20 with fees
          // Prepare an absolute zero offer
          offerToken.exchangeToken = await Foreign20WithFee.getAddress();
          offerToken.sellerDeposit = "0";

          // Create a new offer
          offerToken.id = await offerHandler
            .connect(assistant)
            .createOffer(offerToken, offerDates, offerDurations, disputeResolverId, agentId, offerFeeLimit, {
              getOfferId: true,
            });

          // mint tokens and approve
          await Foreign20WithFee.mint(await buyer.getAddress(), offerToken.price);
          await Foreign20WithFee.connect(buyer).approve(protocolDiamondAddress, offerToken.price);

          // Attempt to commit to offer, expecting revert
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerToken.id)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INSUFFICIENT_VALUE_RECEIVED);
        });
      });
    });

    context("👉 releaseFunds() - Static offer price", async function () {
      beforeEach(async function () {
        // ids
        protocolId = "0";
        buyerId = "4";
        exchangeId = "1";
        // commit to offer
        await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerToken.id);
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
          sellerPayoff = (
            BigInt(offerToken.sellerDeposit) +
            BigInt(offerToken.price) -
            BigInt(offerTokenProtocolFee)
          ).toString();

          // protocol: protocolFee
          protocolPayoff = offerTokenProtocolFee;
        });

        it("should emit a FundsReleased event", async function () {
          // Complete the exchange, expecting event
          const tx = await exchangeHandler.connect(buyer).completeExchange(exchangeId);

          await expect(tx)
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, await buyer.getAddress());

          await expect(tx)
            .to.emit(exchangeHandler, "ProtocolFeeCollected")
            .withArgs(exchangeId, offerToken.exchangeToken, protocolPayoff, await buyer.getAddress());
        });

        it("should update state", async function () {
          // commit again, so seller has nothing in available funds
          await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerToken.id);

          // Read on chain state
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
          agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

          // Chain state should match the expected available funds
          expectedSellerAvailableFunds = new FundsList([
            new Funds(ZeroAddress, "Native currency", `${2 * sellerDeposit}`),
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
          expectedSellerAvailableFunds.funds.push(new Funds(await mockToken.getAddress(), "Foreign20", sellerPayoff));
          expectedProtocolAvailableFunds = new FundsList([
            new Funds(await mockToken.getAddress(), "Foreign20", offerTokenProtocolFee),
          ]);
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
          agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
          expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
          expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
          expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
          expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

          // complete another exchange so we test funds are only updated, no new entry is created
          await exchangeHandler.connect(buyer).redeemVoucher(++exchangeId);
          await exchangeHandler.connect(buyer).completeExchange(exchangeId);

          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
          agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
          expectedSellerAvailableFunds.funds[1] = new Funds(
            await mockToken.getAddress(),
            "Foreign20",
            BigInt(sellerPayoff) * 2n
          );
          expectedProtocolAvailableFunds.funds[0] = new Funds(
            await mockToken.getAddress(),
            "Foreign20",
            BigInt(protocolPayoff) * 2n
          );
          expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
          expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
          expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
          expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
        });

        context("Offer has an agent", async function () {
          beforeEach(async function () {
            // Create Agent offer
            agentOffer.id = await offerHandler
              .connect(assistant)
              .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id, offerFeeLimit, {
                getOfferId: true,
              });

            // Commit to Offer
            await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), agentOffer.id, {
              value: agentOffer.price,
            });

            // succesfully redeem exchange
            exchangeId = "2";
            await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

            // expected payoffs
            // buyer: 0
            buyerPayoff = 0;

            // agentPayoff: agentFee
            agentFee = (BigInt(agentOffer.price) * BigInt(agentFeePercentage)) / 10000n;
            agentPayoff = agentFee;

            // seller: sellerDeposit + price - protocolFee - agentFee
            sellerPayoff = (
              BigInt(agentOffer.sellerDeposit) +
              BigInt(agentOffer.price) -
              BigInt(agentOfferProtocolFee) -
              BigInt(agentFee)
            ).toString();

            // protocol: protocolFee
            protocolPayoff = agentOfferProtocolFee;
          });

          it("should emit a FundsReleased event", async function () {
            // Complete the exchange, expecting event
            const tx = await exchangeHandler.connect(buyer).completeExchange(exchangeId);

            // Complete the exchange, expecting event
            await expect(tx)
              .to.emit(exchangeHandler, "FundsReleased")
              .withArgs(exchangeId, seller.id, agentOffer.exchangeToken, sellerPayoff, await buyer.getAddress());

            await expect(tx)
              .to.emit(exchangeHandler, "ProtocolFeeCollected")
              .withArgs(exchangeId, agentOffer.exchangeToken, protocolPayoff, await buyer.getAddress());

            await expect(tx)
              .to.emit(exchangeHandler, "FundsReleased")
              .withArgs(exchangeId, agentId, agentOffer.exchangeToken, agentPayoff, await buyer.getAddress());
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", `${sellerDeposit}`),
              new Funds(ZeroAddress, "Native currency", `${sellerDeposit}`),
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
            // seller: sellerDeposit + price - protocolFee - agentFee; note that seller has sellerDeposit in availableFunds from before
            // protocol: protocolFee
            // agent: agentFee
            expectedSellerAvailableFunds.funds[1] = new Funds(
              ZeroAddress,
              "Native currency",
              BigInt(sellerPayoff) + BigInt(sellerDeposit)
            );
            expectedProtocolAvailableFunds = new FundsList([
              new Funds(ZeroAddress, "Native currency", agentOfferProtocolFee),
            ]);
            expectedAgentAvailableFunds.funds.push(new Funds(ZeroAddress, "Native currency", agentPayoff));
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
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
          buyerPayoff = BigInt(offerToken.sellerDeposit) + BigInt(offerToken.price);

          // seller: 0
          sellerPayoff = 0;

          // protocol: 0
          protocolPayoff = 0;
        });

        it("should emit a FundsReleased event", async function () {
          // Revoke the voucher, expecting event
          await expect(exchangeHandler.connect(assistant).revokeVoucher(exchangeId))
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, await assistant.getAddress());
        });

        it("should update state", async function () {
          // Read on chain state
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
          agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

          // Chain state should match the expected available funds
          expectedSellerAvailableFunds = new FundsList([
            new Funds(await mockToken.getAddress(), "Foreign20", sellerDeposit),
            new Funds(ZeroAddress, "Native currency", (2n * BigInt(sellerDeposit)).toString()),
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
          expectedBuyerAvailableFunds.funds.push(new Funds(await mockToken.getAddress(), "Foreign20", buyerPayoff));
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
          agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
          expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
          expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
          expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
          expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

          // Test that if buyer has some funds available, and gets more, the funds are only updated
          // Commit again
          await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerToken.id);

          // Revoke another voucher
          await exchangeHandler.connect(assistant).revokeVoucher(++exchangeId);

          // Available funds should be increased for
          // buyer: sellerDeposit + price
          // seller: 0; but during the commitToOffer, sellerDeposit is encumbered
          // protocol: 0
          // agent: 0
          expectedBuyerAvailableFunds.funds[0] = new Funds(
            await mockToken.getAddress(),
            "Foreign20",
            BigInt(buyerPayoff) * 2n
          );
          expectedSellerAvailableFunds = new FundsList([
            new Funds(ZeroAddress, "Native currency", `${2 * sellerDeposit}`),
          ]);
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
          agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
          expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
          expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
          expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
          expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
        });

        context("Offer has an agent", async function () {
          beforeEach(async function () {
            // Create Agent offer
            agentOffer.id = await offerHandler
              .connect(assistant)
              .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id, offerFeeLimit, {
                getOfferId: true,
              });

            // top up seller's and buyer's account
            await mockToken.mint(await assistant.getAddress(), `${2 * sellerDeposit}`);
            await mockToken.mint(await buyer.getAddress(), `${2 * price}`);

            // approve protocol to transfer the tokens
            await mockToken.connect(assistant).approve(protocolDiamondAddress, `${2 * sellerDeposit}`);
            await mockToken.connect(buyer).approve(protocolDiamondAddress, `${2 * price}`);

            // deposit to seller's pool
            await fundsHandler
              .connect(assistant)
              .depositFunds(seller.id, await mockToken.getAddress(), `${2 * sellerDeposit}`);

            // Commit to Offer
            await exchangeHandler
              .connect(buyer)
              .commitToOffer(await buyer.getAddress(), agentOffer.id, { value: agentOffer.price });

            // expected payoffs
            // buyer: sellerDeposit + price
            buyerPayoff = BigInt(agentOffer.sellerDeposit) + BigInt(agentOffer.price);

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
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", `${3 * sellerDeposit}`),
              new Funds(ZeroAddress, "Native currency", `${sellerDeposit}`),
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
            expectedBuyerAvailableFunds.funds.push(new Funds(ZeroAddress, "Native currency", buyerPayoff));
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

            // Test that if buyer has some funds available, and gets more, the funds are only updated
            // Commit again
            await exchangeHandler
              .connect(buyer)
              .commitToOffer(await buyer.getAddress(), agentOffer.id, { value: agentOffer.price });

            // Revoke another voucher
            await exchangeHandler.connect(assistant).revokeVoucher(++exchangeId);

            // Available funds should be increased for
            // buyer: sellerDeposit + price
            // seller: 0; but during the commitToOffer, sellerDeposit is encumbered
            // protocol: 0
            // agent: 0
            expectedBuyerAvailableFunds.funds[0] = new Funds(ZeroAddress, "Native currency", BigInt(buyerPayoff) * 2n);
            expectedSellerAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", `${3 * sellerDeposit}`),
            ]);
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
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
          buyerPayoff = BigInt(offerToken.price) - BigInt(offerToken.buyerCancelPenalty);

          // seller: sellerDeposit + buyerCancelPenalty
          sellerPayoff = BigInt(offerToken.sellerDeposit) + BigInt(offerToken.buyerCancelPenalty);

          //protocol: 0
          protocolPayoff = 0;
        });

        it("should emit a FundsReleased event", async function () {
          // Cancel the voucher, expecting event
          const tx = await exchangeHandler.connect(buyer).cancelVoucher(exchangeId);
          await expect(tx)
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, await buyer.getAddress());

          await expect(tx)
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, await buyer.getAddress());

          await expect(tx).to.not.emit(exchangeHandler, "ProtocolFeeCollected");
        });

        it("should update state", async function () {
          // Read on chain state
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
          agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

          // Chain state should match the expected available funds
          expectedSellerAvailableFunds = new FundsList([
            new Funds(await mockToken.getAddress(), "Foreign20", sellerDeposit),
            new Funds(ZeroAddress, "Native currency", `${2 * sellerDeposit}`),
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
            await mockToken.getAddress(),
            "Foreign20",
            (BigInt(sellerDeposit) + BigInt(sellerPayoff)).toString()
          );
          expectedBuyerAvailableFunds.funds.push(new Funds(await mockToken.getAddress(), "Foreign20", buyerPayoff));
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
          agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
          expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
          expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
          expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
          expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
        });

        context("Offer has an agent", async function () {
          beforeEach(async function () {
            // Create Agent offer
            agentOffer.id = await offerHandler
              .connect(assistant)
              .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id, offerFeeLimit, {
                getOfferId: true,
              });

            // top up seller's and buyer's account
            await mockToken.mint(await assistant.getAddress(), `${2 * sellerDeposit}`);
            await mockToken.mint(await buyer.getAddress(), `${2 * price}`);

            // approve protocol to transfer the tokens
            await mockToken.connect(assistant).approve(protocolDiamondAddress, `${2 * sellerDeposit}`);
            await mockToken.connect(buyer).approve(protocolDiamondAddress, `${2 * price}`);

            // deposit to seller's pool
            await fundsHandler
              .connect(assistant)
              .depositFunds(seller.id, await mockToken.getAddress(), `${sellerDeposit}`);

            // Commit to Offer
            await exchangeHandler
              .connect(buyer)
              .commitToOffer(await buyer.getAddress(), agentOffer.id, { value: agentOffer.price });

            // expected payoffs
            // buyer: price - buyerCancelPenalty
            buyerPayoff = BigInt(agentOffer.price) - BigInt(agentOffer.buyerCancelPenalty);

            // seller: sellerDeposit + buyerCancelPenalty
            sellerPayoff = BigInt(agentOffer.sellerDeposit) + BigInt(agentOffer.buyerCancelPenalty);

            // protocol: 0
            protocolPayoff = 0;

            // agent: 0
            agentPayoff = 0;

            exchangeId = "2";
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", `${2 * sellerDeposit}`),
              new Funds(ZeroAddress, "Native currency", sellerDeposit),
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
            expectedSellerAvailableFunds.funds[1] = new Funds(
              ZeroAddress,
              "Native currency",
              (BigInt(sellerDeposit) + BigInt(sellerPayoff)).toString()
            );
            expectedBuyerAvailableFunds.funds.push(new Funds(ZeroAddress, "Native currency", buyerPayoff));
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
          });
        });
      });

      context("Final state DISPUTED", async function () {
        beforeEach(async function () {
          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // succesfully redeem exchange
          await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

          // raise the dispute
          tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Get the block timestamp of the confirmed tx and set disputedDate
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          disputedDate = block.timestamp.toString();
          timeout = BigInt(disputedDate) + BigInt(resolutionPeriod);
        });

        context("Final state DISPUTED - RETRACTED", async function () {
          beforeEach(async function () {
            // expected payoffs
            // buyer: 0
            buyerPayoff = 0;

            // seller: sellerDeposit + price - protocolFee
            sellerPayoff = BigInt(offerToken.sellerDeposit) + BigInt(offerToken.price) - BigInt(offerTokenProtocolFee);

            // protocol: 0
            protocolPayoff = offerTokenProtocolFee;
          });

          it("should emit a FundsReleased event", async function () {
            // Retract from the dispute, expecting event
            const tx = await disputeHandler.connect(buyer).retractDispute(exchangeId);

            await expect(tx)
              .to.emit(disputeHandler, "ProtocolFeeCollected")
              .withArgs(exchangeId, offerToken.exchangeToken, protocolPayoff, await buyer.getAddress());

            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, await buyer.getAddress());

            //check that FundsReleased event was NOT emitted with buyer Id
            const txReceipt = await tx.wait();
            const match = eventEmittedWithArgs(txReceipt, disputeHandler, "FundsReleased", [
              exchangeId,
              buyerId,
              offerToken.exchangeToken,
              buyerPayoff,
              await buyer.getAddress(),
            ]);
            expect(match).to.be.false;
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", sellerDeposit),
              new Funds(ZeroAddress, "Native currency", `${2 * sellerDeposit}`),
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
              await mockToken.getAddress(),
              "Foreign20",
              (BigInt(sellerDeposit) + BigInt(sellerPayoff)).toString()
            );
            expectedProtocolAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", protocolPayoff),
            ]);
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
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
              agentFee = ((BigInt(agentOffer.price) * BigInt(agentFeePercentage)) / 10000n).toString();
              agentPayoff = agentFee;

              // seller: sellerDeposit + price - protocolFee - agentFee
              sellerPayoff = (
                BigInt(agentOffer.sellerDeposit) +
                BigInt(agentOffer.price) -
                BigInt(agentOfferProtocolFee) -
                BigInt(agentFee)
              ).toString();

              // protocol: 0
              protocolPayoff = agentOfferProtocolFee;

              // Exchange id
              exchangeId = "2";
              agentOffer.id = await offerHandler
                .connect(assistant)
                .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id, offerFeeLimit, {
                  getOfferId: true,
                });
              await exchangeHandler
                .connect(buyer)
                .commitToOffer(await buyer.getAddress(), agentOffer.id, { value: agentOffer.price });

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
                .withArgs(exchangeId, agentOffer.exchangeToken, protocolPayoff, await buyer.getAddress());

              await expect(tx)
                .to.emit(disputeHandler, "FundsReleased")
                .withArgs(exchangeId, seller.id, agentOffer.exchangeToken, sellerPayoff, await buyer.getAddress());

              await expect(tx)
                .to.emit(exchangeHandler, "FundsReleased")
                .withArgs(exchangeId, agentId, agentOffer.exchangeToken, agentPayoff, await buyer.getAddress());
            });

            it("should update state", async function () {
              // Read on chain state
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

              // Chain state should match the expected available funds
              expectedSellerAvailableFunds = new FundsList([
                new Funds(await mockToken.getAddress(), "Foreign20", `${sellerDeposit}`),
                new Funds(ZeroAddress, "Native currency", `${sellerDeposit}`),
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
              expectedSellerAvailableFunds.funds[1] = new Funds(
                ZeroAddress,
                "Native currency",
                BigInt(sellerPayoff) + BigInt(sellerDeposit)
              );
              expectedProtocolAvailableFunds = new FundsList([
                new Funds(ZeroAddress, "Native currency", protocolPayoff),
              ]);
              expectedAgentAvailableFunds.funds.push(new Funds(ZeroAddress, "Native currency", agentPayoff));
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
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
            sellerPayoff = (
              BigInt(offerToken.sellerDeposit) +
              BigInt(offerToken.price) -
              BigInt(offerTokenProtocolFee)
            ).toString();

            // protocol: protocolFee
            protocolPayoff = offerTokenProtocolFee;

            await setNextBlockTimestamp(Number(timeout) + 1);
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
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", sellerDeposit),
              new Funds(ZeroAddress, "Native currency", `${2 * sellerDeposit}`),
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
              await mockToken.getAddress(),
              "Foreign20",
              (BigInt(sellerDeposit) + BigInt(sellerPayoff)).toString()
            );
            expectedProtocolAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", protocolPayoff),
            ]);
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
          });

          context("Offer has an agent", async function () {
            beforeEach(async function () {
              // Create Agent offer
              agentOffer.id = await offerHandler
                .connect(assistant)
                .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id, offerFeeLimit, {
                  getOfferId: true,
                });

              // Commit to Offer
              await exchangeHandler
                .connect(buyer)
                .commitToOffer(await buyer.getAddress(), agentOffer.id, { value: agentOffer.price });

              // expected payoffs
              // buyer: 0
              buyerPayoff = 0;

              // agentPayoff: agentFee
              agentFee = ((BigInt(agentOffer.price) * BigInt(agentFeePercentage)) / 10000n).toString();
              agentPayoff = agentFee;

              // seller: sellerDeposit + price - protocolFee - agent fee
              sellerPayoff = (
                BigInt(agentOffer.sellerDeposit) +
                BigInt(agentOffer.price) -
                BigInt(agentOfferProtocolFee) -
                BigInt(agentFee)
              ).toString();
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
              block = await provider.getBlock(blockNumber);
              disputedDate = block.timestamp.toString();
              timeout = BigInt(disputedDate) + resolutionPeriod.toString();

              await setNextBlockTimestamp(Number(timeout) + 1);
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
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

              // Chain state should match the expected available funds
              expectedSellerAvailableFunds = new FundsList([
                new Funds(await mockToken.getAddress(), "Foreign20", `${sellerDeposit}`),
                new Funds(ZeroAddress, "Native currency", `${sellerDeposit}`),
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
                new Funds(await mockToken.getAddress(), "Foreign20", sellerDeposit),
                new Funds(ZeroAddress, "Native currency", `${BigInt(sellerPayoff) + BigInt(sellerDeposit)}`),
              ]);

              expectedProtocolAvailableFunds = new FundsList([
                new Funds(ZeroAddress, "Native currency", protocolPayoff),
              ]);
              expectedAgentAvailableFunds.funds[0] = new Funds(ZeroAddress, "Native currency", agentPayoff);
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
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
            buyerPayoff =
              ((BigInt(offerToken.price) + BigInt(offerToken.sellerDeposit)) * BigInt(buyerPercentBasisPoints)) /
              10000n;

            // seller: (price + sellerDeposit)*(1-buyerPercentage)
            sellerPayoff = BigInt(offerToken.price) + BigInt(offerToken.sellerDeposit) - buyerPayoff;

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
            signature = await prepareDataSignature(
              buyer, // Assistant is the caller, seller should be the signer.
              customSignatureType,
              "Resolution",
              message,
              await disputeHandler.getAddress()
            );
          });

          it("should emit a FundsReleased event", async function () {
            // Resolve the dispute, expecting event
            const tx = await disputeHandler
              .connect(assistant)
              .resolveDispute(exchangeId, buyerPercentBasisPoints, signature);
            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, await assistant.getAddress());

            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, await assistant.getAddress());

            await expect(tx).to.not.emit(disputeHandler, "ProtocolFeeCollected");
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", sellerDeposit),
              new Funds(ZeroAddress, "Native currency", `${2 * sellerDeposit}`),
            ]);
            expectedBuyerAvailableFunds = new FundsList([]);
            expectedProtocolAvailableFunds = new FundsList([]);
            expectedAgentAvailableFunds = new FundsList([]);

            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

            // Resolve the dispute, so the funds are released
            await disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercentBasisPoints, signature);

            // Available funds should be increased for
            // buyer: (price + sellerDeposit)*buyerPercentage
            // seller: (price + sellerDeposit)*(1-buyerPercentage); note that seller has sellerDeposit in availableFunds from before
            // protocol: 0
            // agent: 0
            expectedSellerAvailableFunds.funds[0] = new Funds(
              await mockToken.getAddress(),
              "Foreign20",
              (BigInt(sellerDeposit) + BigInt(sellerPayoff)).toString()
            );
            expectedBuyerAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", buyerPayoff),
            ]);
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
          });

          context("Offer has an agent", async function () {
            beforeEach(async function () {
              // Create Agent offer
              agentOffer.id = await offerHandler
                .connect(assistant)
                .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id, offerFeeLimit, {
                  getOfferId: true,
                });

              // Commit to Offer
              await exchangeHandler
                .connect(buyer)
                .commitToOffer(await buyer.getAddress(), agentOffer.id, { value: agentOffer.price });

              exchangeId = "2";

              // succesfully redeem exchange
              await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

              // raise the dispute
              await disputeHandler.connect(buyer).raiseDispute(exchangeId);

              buyerPercentBasisPoints = "5566"; // 55.66%

              // expected payoffs
              // buyer: (price + sellerDeposit)*buyerPercentage
              buyerPayoff = (
                ((BigInt(agentOffer.price) + BigInt(agentOffer.sellerDeposit)) * BigInt(buyerPercentBasisPoints)) /
                10000n
              ).toString();

              // seller: (price + sellerDeposit)*(1-buyerPercentage)
              sellerPayoff = (
                BigInt(agentOffer.price) +
                BigInt(agentOffer.sellerDeposit) -
                BigInt(buyerPayoff)
              ).toString();

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
              signature = await prepareDataSignature(
                buyer, // Assistant is the caller, seller should be the signer.
                customSignatureType,
                "Resolution",
                message,
                await disputeHandler.getAddress()
              );
            });

            it("should update state", async function () {
              // Read on chain state
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

              // Chain state should match the expected available funds
              expectedSellerAvailableFunds = new FundsList([
                new Funds(await mockToken.getAddress(), "Foreign20", `${sellerDeposit}`),
                new Funds(ZeroAddress, "Native currency", `${sellerDeposit}`),
              ]);
              expectedBuyerAvailableFunds = new FundsList([]);
              expectedProtocolAvailableFunds = new FundsList([]);
              expectedAgentAvailableFunds = new FundsList([]);

              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

              // Resolve the dispute, so the funds are released
              await disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercentBasisPoints, signature);

              // Available funds should be increased for
              // buyer: (price + sellerDeposit)*buyerPercentage
              // seller: (price + sellerDeposit)*(1-buyerPercentage);
              // protocol: 0
              // agent: 0
              expectedSellerAvailableFunds.funds[1] = new Funds(
                ZeroAddress,
                "Native currency",
                BigInt(sellerPayoff) + BigInt(sellerDeposit)
              );
              expectedBuyerAvailableFunds = new FundsList([new Funds(ZeroAddress, "Native currency", buyerPayoff)]);
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

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
            sellerPayoff = (
              BigInt(offerToken.sellerDeposit) +
              BigInt(offerToken.price) -
              BigInt(offerTokenProtocolFee) +
              BigInt(buyerEscalationDeposit)
            ).toString();

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
              .withArgs(exchangeId, offerToken.exchangeToken, protocolPayoff, await buyer.getAddress());

            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, await buyer.getAddress());

            //check that FundsReleased event was NOT emitted with buyer Id
            const txReceipt = await tx.wait();
            const match = eventEmittedWithArgs(txReceipt, disputeHandler, "FundsReleased", [
              exchangeId,
              buyerId,
              offerToken.exchangeToken,
              buyerPayoff,
              await buyer.getAddress(),
            ]);
            expect(match).to.be.false;
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", sellerDeposit),
              new Funds(ZeroAddress, "Native currency", `${2 * sellerDeposit}`),
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
              await mockToken.getAddress(),
              "Foreign20",
              (BigInt(sellerDeposit) + BigInt(sellerPayoff)).toString()
            );
            expectedProtocolAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", protocolPayoff),
            ]);

            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
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
              agentFee = ((BigInt(agentOffer.price) * BigInt(agentFeePercentage)) / 10000n).toString();
              agentPayoff = agentFee;

              // seller: sellerDeposit + price - protocolFee - agentFee + buyerEscalationDeposit
              sellerPayoff = (
                BigInt(agentOffer.sellerDeposit) +
                BigInt(agentOffer.price) -
                BigInt(agentOfferProtocolFee) -
                BigInt(agentFee) +
                BigInt(buyerEscalationDeposit)
              ).toString();

              // protocol: 0
              protocolPayoff = agentOfferProtocolFee;

              // Exchange id
              exchangeId = "2";
              agentOffer.id = await offerHandler
                .connect(assistant)
                .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id, offerFeeLimit, {
                  getOfferId: true,
                });

              // approve protocol to transfer the tokens
              await mockToken.connect(buyer).approve(protocolDiamondAddress, agentOffer.price);
              await mockToken.mint(await buyer.getAddress(), agentOffer.price);
              await exchangeHandler
                .connect(buyer)
                .commitToOffer(await buyer.getAddress(), agentOffer.id, { value: agentOffer.price });

              // succesfully redeem exchange
              await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

              // raise the dispute
              await disputeHandler.connect(buyer).raiseDispute(exchangeId);

              // escalate the dispute
              await mockToken.mint(await buyer.getAddress(), buyerEscalationDeposit);
              await mockToken.connect(buyer).approve(protocolDiamondAddress, buyerEscalationDeposit);
              await disputeHandler.connect(buyer).escalateDispute(exchangeId);
            });

            it("should update state", async function () {
              // Read on chain state
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

              // Chain state should match the expected available funds
              expectedSellerAvailableFunds = new FundsList([
                new Funds(await mockToken.getAddress(), "Foreign20", `${sellerDeposit}`),
                new Funds(ZeroAddress, "Native currency", `${sellerDeposit}`),
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
              expectedSellerAvailableFunds.funds[1] = new Funds(
                ZeroAddress,
                "Native currency",
                BigInt(sellerPayoff) + BigInt(sellerDeposit)
              );
              expectedProtocolAvailableFunds = new FundsList([
                new Funds(ZeroAddress, "Native currency", protocolPayoff),
              ]);
              expectedAgentAvailableFunds.funds.push(new Funds(ZeroAddress, "Native currency", agentPayoff));
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
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
            buyerPayoff = (
              ((BigInt(offerToken.price) + BigInt(offerToken.sellerDeposit) + BigInt(buyerEscalationDeposit)) *
                BigInt(buyerPercentBasisPoints)) /
              10000n
            ).toString();

            // seller: (price + sellerDeposit + buyerEscalationDeposit)*(1-buyerPercentage)
            sellerPayoff = (
              BigInt(offerToken.price) +
              BigInt(offerToken.sellerDeposit) +
              BigInt(buyerEscalationDeposit) -
              BigInt(buyerPayoff)
            ).toString();

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
            signature = await prepareDataSignature(
              buyer, // Assistant is the caller, seller should be the signer.
              customSignatureType,
              "Resolution",
              message,
              await disputeHandler.getAddress()
            );

            // Escalate the dispute
            await disputeHandler.connect(buyer).escalateDispute(exchangeId);
          });

          it("should emit a FundsReleased event", async function () {
            // Resolve the dispute, expecting event
            const tx = await disputeHandler
              .connect(assistant)
              .resolveDispute(exchangeId, buyerPercentBasisPoints, signature);
            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, await assistant.getAddress());

            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, await assistant.getAddress());

            await expect(tx).to.not.emit(disputeHandler, "ProtocolFeeCollected");
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", sellerDeposit),
              new Funds(ZeroAddress, "Native currency", `${2 * sellerDeposit}`),
            ]);
            expectedBuyerAvailableFunds = new FundsList([]);
            expectedProtocolAvailableFunds = new FundsList([]);
            expectedAgentAvailableFunds = new FundsList([]);
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

            // Resolve the dispute, so the funds are released
            await disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercentBasisPoints, signature);

            // Available funds should be increased for
            // buyer: (price + sellerDeposit + buyerEscalationDeposit)*buyerPercentage
            // seller: (price + sellerDeposit + buyerEscalationDeposit)*(1-buyerPercentage); note that seller has sellerDeposit in availableFunds from before
            // protocol: 0
            // agent: 0
            expectedBuyerAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", buyerPayoff),
            ]);
            expectedSellerAvailableFunds.funds[0] = new Funds(
              await mockToken.getAddress(),
              "Foreign20",
              (BigInt(sellerDeposit) + BigInt(sellerPayoff)).toString()
            );
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
          });

          context("Offer has an agent", async function () {
            beforeEach(async function () {
              // Create Agent offer
              agentOffer.id = await offerHandler
                .connect(assistant)
                .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id, offerFeeLimit, {
                  getOfferId: true,
                });

              // approve protocol to transfer the tokens
              await mockToken.connect(buyer).approve(protocolDiamondAddress, agentOffer.price);
              await mockToken.mint(await buyer.getAddress(), agentOffer.price);

              // Commit to Offer
              await exchangeHandler
                .connect(buyer)
                .commitToOffer(await buyer.getAddress(), agentOffer.id, { value: agentOffer.price });

              exchangeId = "2";

              // succesfully redeem exchange
              await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

              // raise the dispute
              await disputeHandler.connect(buyer).raiseDispute(exchangeId);

              buyerPercentBasisPoints = "5566"; // 55.66%

              // expected payoffs
              // buyer: (price + sellerDeposit + buyerEscalationDeposit)*buyerPercentage
              buyerPayoff = (
                ((BigInt(agentOffer.price) + BigInt(agentOffer.sellerDeposit) + BigInt(buyerEscalationDeposit)) *
                  BigInt(buyerPercentBasisPoints)) /
                10000n
              ).toString();

              // seller: (price + sellerDeposit + buyerEscalationDeposit)*(1-buyerPercentage)
              sellerPayoff = (
                BigInt(agentOffer.price) +
                BigInt(agentOffer.sellerDeposit) +
                BigInt(buyerEscalationDeposit) -
                BigInt(buyerPayoff)
              ).toString();

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
              signature = await prepareDataSignature(
                buyer, // Assistant is the caller, seller should be the signer.
                customSignatureType,
                "Resolution",
                message,
                await disputeHandler.getAddress()
              );

              // escalate the dispute
              await mockToken.mint(await buyer.getAddress(), buyerEscalationDeposit);
              await mockToken.connect(buyer).approve(protocolDiamondAddress, buyerEscalationDeposit);
              await disputeHandler.connect(buyer).escalateDispute(exchangeId);
            });

            it("should update state", async function () {
              // Read on chain state
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

              // Chain state should match the expected available funds
              expectedSellerAvailableFunds = new FundsList([
                new Funds(await mockToken.getAddress(), "Foreign20", `${sellerDeposit}`),
                new Funds(ZeroAddress, "Native currency", `${sellerDeposit}`),
              ]);
              expectedBuyerAvailableFunds = new FundsList([]);
              expectedProtocolAvailableFunds = new FundsList([]);
              expectedAgentAvailableFunds = new FundsList([]);

              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

              // Resolve the dispute, so the funds are released
              await disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercentBasisPoints, signature);

              // Available funds should be increased for
              // buyer: (price + sellerDeposit + buyerEscalationDeposit)*buyerPercentage
              // seller: (price + sellerDeposit + buyerEscalationDeposit)*(1-buyerPercentage);
              // protocol: 0
              // agent: 0
              expectedSellerAvailableFunds = new FundsList([
                new Funds(await mockToken.getAddress(), "Foreign20", sellerDeposit),
                new Funds(ZeroAddress, "Native currency", BigInt(sellerPayoff) + BigInt(sellerDeposit)),
              ]);
              expectedBuyerAvailableFunds = new FundsList([new Funds(ZeroAddress, "Native currency", buyerPayoff)]);
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

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
            buyerPayoff = (
              ((BigInt(offerToken.price) + BigInt(offerToken.sellerDeposit) + BigInt(buyerEscalationDeposit)) *
                BigInt(buyerPercentBasisPoints)) /
              10000n
            ).toString();

            // seller: (price + sellerDeposit + buyerEscalationDeposit)*(1-buyerPercentage)
            sellerPayoff = (
              BigInt(offerToken.price) +
              BigInt(offerToken.sellerDeposit) +
              BigInt(buyerEscalationDeposit) -
              BigInt(buyerPayoff)
            ).toString();

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
              .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, await assistantDR.getAddress());

            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, await assistantDR.getAddress());

            await expect(tx).to.not.emit(disputeHandler, "ProtocolFeeCollected");
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", sellerDeposit),
              new Funds(ZeroAddress, "Native currency", `${2 * sellerDeposit}`),
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
            expectedBuyerAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", buyerPayoff),
            ]);
            expectedSellerAvailableFunds.funds[0] = new Funds(
              await mockToken.getAddress(),
              "Foreign20",
              (BigInt(sellerDeposit) + BigInt(sellerPayoff)).toString()
            );
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
          });

          context("Offer has an agent", async function () {
            beforeEach(async function () {
              // Create Agent offer
              agentOffer.id = await offerHandler
                .connect(assistant)
                .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id, offerFeeLimit, {
                  getOfferId: true,
                });

              // approve protocol to transfer the tokens
              await mockToken.connect(buyer).approve(protocolDiamondAddress, agentOffer.price);
              await mockToken.mint(await buyer.getAddress(), agentOffer.price);

              // Commit to Offer
              await exchangeHandler
                .connect(buyer)
                .commitToOffer(await buyer.getAddress(), agentOffer.id, { value: agentOffer.price });

              exchangeId = "2";

              // succesfully redeem exchange
              await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

              // raise the dispute
              tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

              // Get the block timestamp of the confirmed tx and set disputedDate
              blockNumber = tx.blockNumber;
              block = await provider.getBlock(blockNumber);
              disputedDate = block.timestamp.toString();
              timeout = (BigInt(disputedDate) + BigInt(resolutionPeriod)).toString();

              buyerPercentBasisPoints = "5566"; // 55.66%

              // expected payoffs
              // buyer: (price + sellerDeposit + buyerEscalationDeposit)*buyerPercentage
              buyerPayoff = (
                ((BigInt(agentOffer.price) + BigInt(agentOffer.sellerDeposit) + BigInt(buyerEscalationDeposit)) *
                  BigInt(buyerPercentBasisPoints)) /
                10000n
              ).toString();

              // seller: (price + sellerDeposit + buyerEscalationDeposit)*(1-buyerPercentage)
              sellerPayoff = (
                BigInt(agentOffer.price) +
                BigInt(agentOffer.sellerDeposit) +
                BigInt(buyerEscalationDeposit) -
                BigInt(buyerPayoff)
              ).toString();

              // protocol: 0
              protocolPayoff = 0;

              // escalate the dispute
              await mockToken.mint(await buyer.getAddress(), buyerEscalationDeposit);
              await mockToken.connect(buyer).approve(protocolDiamondAddress, buyerEscalationDeposit);
              await disputeHandler.connect(buyer).escalateDispute(exchangeId);
            });

            it("should update state", async function () {
              // Read on chain state
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

              // Chain state should match the expected available funds
              expectedSellerAvailableFunds = new FundsList([
                new Funds(await mockToken.getAddress(), "Foreign20", `${sellerDeposit}`),
                new Funds(ZeroAddress, "Native currency", `${sellerDeposit}`),
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
              expectedSellerAvailableFunds.funds[1] = new Funds(
                ZeroAddress,
                "Native currency",
                BigInt(sellerPayoff) + BigInt(sellerDeposit)
              );
              expectedBuyerAvailableFunds = new FundsList([new Funds(ZeroAddress, "Native currency", buyerPayoff)]);
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
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
              buyerPayoff = (BigInt(offerToken.price) + BigInt(buyerEscalationDeposit)).toString();

              // seller: sellerDeposit
              sellerPayoff = offerToken.sellerDeposit;

              // protocol: 0
              protocolPayoff = 0;

              // Escalate the dispute
              tx = await disputeHandler.connect(buyer).escalateDispute(exchangeId);

              // Get the block timestamp of the confirmed tx and set escalatedDate
              blockNumber = tx.blockNumber;
              block = await provider.getBlock(blockNumber);
              escalatedDate = block.timestamp.toString();

              await setNextBlockTimestamp(Number(escalatedDate) + Number(disputeResolver.escalationResponsePeriod) + 1);
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
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

              // Chain state should match the expected available funds
              expectedSellerAvailableFunds = new FundsList([
                new Funds(await mockToken.getAddress(), "Foreign20", sellerDeposit),
                new Funds(ZeroAddress, "Native currency", `${2 * sellerDeposit}`),
              ]);
              expectedBuyerAvailableFunds = new FundsList([]);
              expectedAgentAvailableFunds = new FundsList([]);
              expectedProtocolAvailableFunds = new FundsList([]);
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
              expectedBuyerAvailableFunds = new FundsList([
                new Funds(await mockToken.getAddress(), "Foreign20", buyerPayoff),
              ]);
              expectedSellerAvailableFunds.funds[0] = new Funds(
                await mockToken.getAddress(),
                "Foreign20",
                (BigInt(sellerDeposit) + BigInt(sellerPayoff)).toString()
              );
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
            });

            context("Offer has an agent", async function () {
              beforeEach(async function () {
                // Create Agent offer
                agentOffer.id = await offerHandler
                  .connect(assistant)
                  .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id, offerFeeLimit, {
                    getOfferId: true,
                  });

                // approve protocol to transfer the tokens
                await mockToken.connect(buyer).approve(protocolDiamondAddress, agentOffer.price);
                await mockToken.mint(await buyer.getAddress(), agentOffer.price);

                // Commit to Offer
                await exchangeHandler
                  .connect(buyer)
                  .commitToOffer(await buyer.getAddress(), agentOffer.id, { value: agentOffer.price });

                exchangeId = "2";

                // succesfully redeem exchange
                await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

                // raise the dispute
                tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

                // expected payoffs
                // buyer: price + buyerEscalationDeposit
                buyerPayoff = (BigInt(offerToken.price) + BigInt(buyerEscalationDeposit)).toString();

                // seller: sellerDeposit
                sellerPayoff = offerToken.sellerDeposit;

                // protocol: 0
                protocolPayoff = 0;

                // Escalate the dispute
                await mockToken.mint(await buyer.getAddress(), buyerEscalationDeposit);
                await mockToken.connect(buyer).approve(protocolDiamondAddress, buyerEscalationDeposit);
                tx = await disputeHandler.connect(buyer).escalateDispute(exchangeId);

                // Get the block timestamp of the confirmed tx and set escalatedDate
                blockNumber = tx.blockNumber;
                block = await provider.getBlock(blockNumber);
                escalatedDate = block.timestamp.toString();

                await setNextBlockTimestamp(
                  Number(escalatedDate) + Number(disputeResolver.escalationResponsePeriod) + 1
                );
              });

              it("should update state", async function () {
                // Read on chain state
                sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
                buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
                protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
                agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

                // Chain state should match the expected available funds
                expectedSellerAvailableFunds = new FundsList([
                  new Funds(await mockToken.getAddress(), "Foreign20", `${sellerDeposit}`),
                  new Funds(ZeroAddress, "Native currency", `${sellerDeposit}`),
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
                expectedBuyerAvailableFunds = new FundsList([new Funds(ZeroAddress, "Native currency", buyerPayoff)]);
                expectedSellerAvailableFunds.funds[1] = new Funds(
                  ZeroAddress,
                  "Native currency",
                  BigInt(sellerPayoff) + BigInt(sellerDeposit)
                );
                sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
                buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
                protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
                agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
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
              buyerPayoff = (BigInt(offerToken.price) + BigInt(buyerEscalationDeposit)).toString();

              // seller: sellerDeposit
              sellerPayoff = offerToken.sellerDeposit;

              // protocol: 0
              protocolPayoff = 0;

              // Escalate the dispute
              tx = await disputeHandler.connect(buyer).escalateDispute(exchangeId);
            });

            it("should emit a FundsReleased event", async function () {
              // Refuse the dispute, expecting event
              const tx = await disputeHandler.connect(assistantDR).refuseEscalatedDispute(exchangeId);

              await expect(tx)
                .to.emit(disputeHandler, "FundsReleased")
                .withArgs(
                  exchangeId,
                  seller.id,
                  offerToken.exchangeToken,
                  sellerPayoff,
                  await assistantDR.getAddress()
                );

              await expect(tx)
                .to.emit(disputeHandler, "FundsReleased")
                .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, await assistantDR.getAddress());

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
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

              // Chain state should match the expected available funds
              expectedSellerAvailableFunds = new FundsList([
                new Funds(await mockToken.getAddress(), "Foreign20", sellerDeposit),
                new Funds(ZeroAddress, "Native currency", `${2 * sellerDeposit}`),
              ]);
              expectedBuyerAvailableFunds = new FundsList([]);
              expectedProtocolAvailableFunds = new FundsList([]);
              expectedAgentAvailableFunds = new FundsList([]);
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

              // Refuse the escalated dispute, so the funds are released
              await disputeHandler.connect(assistantDR).refuseEscalatedDispute(exchangeId);

              // Available funds should be increased for
              // buyer: price + buyerEscalationDeposit
              // seller: sellerDeposit; note that seller has sellerDeposit in availableFunds from before
              // protocol: 0
              // agent: 0
              expectedBuyerAvailableFunds = new FundsList([
                new Funds(await mockToken.getAddress(), "Foreign20", buyerPayoff),
              ]);
              expectedSellerAvailableFunds = new FundsList([
                new Funds(
                  await mockToken.getAddress(),
                  "Foreign20",
                  (BigInt(sellerDeposit) + BigInt(sellerPayoff)).toString()
                ),
                new Funds(ZeroAddress, "Native currency", `${2 * sellerDeposit}`),
              ]);
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
            });

            context("Offer has an agent", async function () {
              beforeEach(async function () {
                // Create Agent offer
                agentOffer.id = await offerHandler
                  .connect(assistant)
                  .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id, offerFeeLimit, {
                    getOfferId: true,
                  });

                // approve protocol to transfer the tokens
                await mockToken.connect(buyer).approve(protocolDiamondAddress, agentOffer.price);
                await mockToken.mint(await buyer.getAddress(), agentOffer.price);

                // Commit to Offer
                await exchangeHandler
                  .connect(buyer)
                  .commitToOffer(await buyer.getAddress(), agentOffer.id, { value: agentOffer.price });

                exchangeId = "2";

                // succesfully redeem exchange
                await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

                // raise the dispute
                await disputeHandler.connect(buyer).raiseDispute(exchangeId);

                // expected payoffs
                // buyer: price + buyerEscalationDeposit
                buyerPayoff = (BigInt(offerToken.price) + BigInt(buyerEscalationDeposit)).toString();

                // seller: sellerDeposit
                sellerPayoff = offerToken.sellerDeposit;

                // protocol: 0
                protocolPayoff = 0;

                // Escalate the dispute
                await mockToken.mint(await buyer.getAddress(), buyerEscalationDeposit);
                await mockToken.connect(buyer).approve(protocolDiamondAddress, buyerEscalationDeposit);
                await disputeHandler.connect(buyer).escalateDispute(exchangeId);
              });

              it("should update state", async function () {
                // Read on chain state
                sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
                buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
                protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
                agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

                // Chain state should match the expected available funds
                expectedSellerAvailableFunds = new FundsList([
                  new Funds(await mockToken.getAddress(), "Foreign20", `${sellerDeposit}`),
                  new Funds(ZeroAddress, "Native currency", `${sellerDeposit}`),
                ]);

                expectedBuyerAvailableFunds = new FundsList([]);
                expectedProtocolAvailableFunds = new FundsList([]);
                expectedAgentAvailableFunds = new FundsList([]);
                expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
                expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
                expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
                expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

                // Refuse the escalated dispute, so the funds are released
                await disputeHandler.connect(assistantDR).refuseEscalatedDispute(exchangeId);

                // Available funds should be increased for
                // buyer: price + buyerEscalationDeposit
                // seller: sellerDeposit;
                // protocol: 0
                // agent: 0
                expectedBuyerAvailableFunds = new FundsList([new Funds(ZeroAddress, "Native currency", buyerPayoff)]);
                expectedSellerAvailableFunds = new FundsList([
                  new Funds(await mockToken.getAddress(), "Foreign20", sellerPayoff),
                  new Funds(ZeroAddress, "Native currency", `${2 * sellerDeposit}`),
                ]);

                sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
                buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
                protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
                agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
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
          configHandler = await getContractAt("IBosonConfigHandler", protocolDiamondAddress);

          // expected payoffs
          // buyer: 0
          buyerPayoff = 0;

          // seller: sellerDeposit + price - protocolFee
          sellerPayoff = BigInt(offerToken.sellerDeposit) + BigInt(offerToken.price) - BigInt(offerTokenProtocolFee);
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
            .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, await buyer.getAddress());

          await expect(tx)
            .to.emit(exchangeHandler, "ProtocolFeeCollected")
            .withArgs(exchangeId, offerToken.exchangeToken, offerTokenProtocolFee, await buyer.getAddress());
        });

        it("Protocol fee for new exchanges should be the same as at the offer creation", async function () {
          // set the new procol fee
          protocolFeePercentage = "300"; // 3%
          await configHandler.connect(deployer).setProtocolFeePercentage(protocolFeePercentage);
          // similar as teste before, excpet the commit to offer is done after the procol fee change

          // commit to offer and get the correct exchangeId
          tx = await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerToken.id);
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
            .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, await buyer.getAddress());

          await expect(tx)
            .to.emit(exchangeHandler, "ProtocolFeeCollected")
            .withArgs(exchangeId, offerToken.exchangeToken, offerTokenProtocolFee, await buyer.getAddress());
        });

        context("Offer has an agent", async function () {
          beforeEach(async function () {
            exchangeId = "2";

            // Cast Diamond to IBosonConfigHandler
            configHandler = await getContractAt("IBosonConfigHandler", protocolDiamondAddress);

            // expected payoffs
            // buyer: 0
            buyerPayoff = 0;

            // agentPayoff: agentFee
            agentFee = ((BigInt(agentOffer.price) * BigInt(agentFeePercentage)) / 10000n).toString();
            agentPayoff = agentFee;

            // seller: sellerDeposit + price - protocolFee - agentFee
            sellerPayoff =
              BigInt(agentOffer.sellerDeposit) +
              BigInt(agentOffer.price) -
              BigInt(agentOfferProtocolFee) -
              BigInt(agentFee);

            // protocol: protocolFee
            protocolPayoff = agentOfferProtocolFee;

            // Create Agent Offer before setting new protocol fee as 3%
            agentOffer.id = await offerHandler
              .connect(assistant)
              .createOffer(agentOffer, offerDates, offerDurations, disputeResolverId, agent.id, offerFeeLimit, {
                getOfferId: true,
              });

            // Commit to Agent Offer
            await exchangeHandler
              .connect(buyer)
              .commitToOffer(await buyer.getAddress(), agentOffer.id, { value: agentOffer.price });

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
              .withArgs(exchangeId, seller.id, agentOffer.exchangeToken, sellerPayoff, await buyer.getAddress());

            await expect(tx)
              .to.emit(exchangeHandler, "ProtocolFeeCollected")
              .withArgs(exchangeId, agentOffer.exchangeToken, protocolPayoff, await buyer.getAddress());

            await expect(tx)
              .to.emit(exchangeHandler, "FundsReleased")
              .withArgs(exchangeId, agentId, agentOffer.exchangeToken, agentPayoff, await buyer.getAddress());
          });

          it("Protocol fee for new exchanges should be the same as at the agent offer creation", async function () {
            // similar as tests before, excpet the commit to offer is done after the protocol fee change

            // top up seller's and buyer's account
            await mockToken.mint(await assistant.getAddress(), sellerDeposit);
            await mockToken.mint(await buyer.getAddress(), price);

            // approve protocol to transfer the tokens
            await mockToken.connect(assistant).approve(protocolDiamondAddress, sellerDeposit);
            await mockToken.connect(buyer).approve(protocolDiamondAddress, price);

            // deposit to seller's pool
            await fundsHandler.connect(assistant).depositFunds(seller.id, await mockToken.getAddress(), sellerDeposit);

            // commit to offer and get the correct exchangeId
            tx = await exchangeHandler
              .connect(buyer)
              .commitToOffer(await buyer.getAddress(), agentOffer.id, { value: agentOffer.price });
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
              .withArgs(exchangeId, seller.id, agentOffer.exchangeToken, sellerPayoff, await buyer.getAddress());

            await expect(tx)
              .to.emit(exchangeHandler, "ProtocolFeeCollected")
              .withArgs(exchangeId, agentOffer.exchangeToken, protocolPayoff, await buyer.getAddress());

            await expect(tx)
              .to.emit(exchangeHandler, "FundsReleased")
              .withArgs(exchangeId, agentId, agentOffer.exchangeToken, agentPayoff, await buyer.getAddress());
          });
        });
      });
    });

    context("👉 releaseFunds() - Sequential commit", async function () {
      let resellersAvailableFunds, expectedResellersAvailableFunds;

      const directions = ["increasing", "constant", "decreasing", "mixed"];

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

        await configHandler.connect(deployer).setMaxTotalOfferFeePercentage("10000"); // 100%
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
        let mockTokenAddress;

        context(`Direction: ${direction}`, async function () {
          const keyToId = { other: 4, other2: 5 };

          fees.forEach((fee) => {
            context(`protocol fee: ${fee.protocol / 100}%; royalties: ${fee.royalties / 100}%`, async function () {
              let voucherOwner, previousPrice;
              let totalRoyalties, protocolFee, totalRoyaltiesSplit;
              let royaltySplit, royaltyRecipientsPayoffs;
              let royaltiesPerExchange;
              let exchangeInformation;

              beforeEach(async function () {
                exchangeInformation = [];

                const expectedCloneAddress = calculateCloneAddress(
                  await accountHandler.getAddress(),
                  beaconProxyAddress,
                  admin.address
                );
                bosonVoucherClone = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);

                // Add royalty recipients
                const royaltyRecipientList = new RoyaltyRecipientInfoList([
                  new RoyaltyRecipientInfo(other.address, "0"),
                  new RoyaltyRecipientInfo(other2.address, "0"),
                ]);
                // Royalty recipients increase the accountIds by 2 in the protocol
                accountId.next();
                accountId.next();

                await accountHandler.connect(admin).addRoyaltyRecipients(seller.id, royaltyRecipientList.toStruct());
                royaltySplit = {
                  seller: 5000, // 50%
                  other: 3000, // 30%
                  other2: 2000, // 20%
                };

                // set fees
                await configHandler.setProtocolFeePercentage(fee.protocol);

                offer = offerToken.clone();
                offer.id = "0";
                offer.price = "100";
                offer.sellerDeposit = "10";
                offer.buyerCancelPenalty = "30";
                offer.royaltyInfo = [
                  new RoyaltyInfo(
                    [ZeroAddress, other.address, other2.address],
                    [
                      applyPercentage(fee.royalties, royaltySplit.seller),
                      applyPercentage(fee.royalties, royaltySplit.other),
                      applyPercentage(fee.royalties, royaltySplit.other2),
                    ]
                  ),
                ];

                // deposit to seller's pool
                await fundsHandler.connect(assistant).withdrawFunds(seller.id, [], []); // withdraw all, so it's easier to test
                await mockToken.connect(assistant).mint(assistant.address, offer.sellerDeposit);
                await mockToken.connect(assistant).approve(await fundsHandler.getAddress(), offer.sellerDeposit);
                await fundsHandler
                  .connect(assistant)
                  .depositFunds(seller.id, await mockToken.getAddress(), offer.sellerDeposit);

                offer.id = await offerHandler
                  .connect(assistant)
                  .createOffer(offer, offerDates, offerDurations, disputeResolverId, 0, offerFeeLimit, {
                    getOfferId: true,
                  });

                // Create buyer with price discovery client address to not mess up ids in tests
                await accountHandler.createBuyer(mockBuyer(await bpd.getAddress()));

                // ids
                exchangeId = "1";
                agentId = "3";
                buyerId = await accountHandler.getNextAccountId();
                protocolId = 0;

                // commit to offer
                await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offer.id);

                voucherOwner = buyer; // voucherOwner is the first buyer

                const tokenId = deriveTokenId(offer.id, exchangeId);
                for (const trade of buyerChains[direction]) {
                  // Prepare calldata for PriceDiscovery contract
                  let order = {
                    seller: voucherOwner.address,
                    buyer: trade.buyer.address,
                    voucherContract: expectedCloneAddress,
                    tokenId: tokenId,
                    exchangeToken: offer.exchangeToken,
                    price: BigInt(trade.price),
                  };

                  const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilBuyOrder", [
                    order,
                  ]);

                  const priceDiscovery = new PriceDiscovery(
                    order.price,
                    Side.Ask,
                    await priceDiscoveryContract.getAddress(),
                    await priceDiscoveryContract.getAddress(),
                    priceDiscoveryData
                  );

                  // voucher owner approves protocol to transfer the tokens
                  await mockToken.mint(voucherOwner.address, order.price);
                  await mockToken.connect(voucherOwner).approve(protocolDiamondAddress, order.price);

                  // Voucher owner approves PriceDiscovery contract to transfer the tokens
                  await bosonVoucherClone
                    .connect(voucherOwner)
                    .setApprovalForAll(await priceDiscoveryContract.getAddress(), true);

                  // Buyer approves protocol to transfer the tokens
                  await mockToken.mint(trade.buyer.address, order.price);
                  await mockToken.connect(trade.buyer).approve(protocolDiamondAddress, order.price);

                  // commit to offer
                  await sequentialCommitHandler
                    .connect(trade.buyer)
                    .sequentialCommitToOffer(trade.buyer.address, tokenId, priceDiscovery, {
                      gasPrice: 0,
                    });

                  exchangeInformation.push({ resellerId: buyerId++, price: order.price });
                  voucherOwner = trade.buyer; // last buyer is voucherOwner in next iteration
                }
                mockTokenAddress = await mockToken.getAddress();
              });

              const finalState = [
                "COMPLETED",
                "REVOKED",
                "CANCELED",
                "DISPUTED-RETRACTED",
                "DISPUTED-EXPIRED",
                "DISPUTED-RESOLVED",
                "DISPUTED-ESCALATED-RETRACTED",
                "DISPUTED-ESCALATED-RESOLVED",
                "DISPUTED-ESCALATED-DECIDED",
                "DISPUTED-ESCALATED-EXPIRED",
                "DISPUTED-ESCALATED-REFUSED",
              ];

              const finalStateSetup = {
                COMPLETED: async function () {
                  // Set time forward to the offer's voucherRedeemableFrom
                  await setNextBlockTimestamp(Number(voucherRedeemableFrom));

                  // succesfully redeem exchange
                  await exchangeHandler.connect(voucherOwner).redeemVoucher(exchangeId);
                },
                REVOKED: async function () {},
                CANCELED: async function () {},
                DISPUTED: async function () {
                  // Not a final state, but a separate setup to avoid code duplication

                  // Set time forward to the offer's voucherRedeemableFrom
                  await setNextBlockTimestamp(Number(voucherRedeemableFrom));

                  // succesfully redeem exchange
                  await exchangeHandler.connect(voucherOwner).redeemVoucher(exchangeId);

                  // raise the dispute
                  tx = await disputeHandler.connect(voucherOwner).raiseDispute(exchangeId);

                  // Get the block timestamp of the confirmed tx and set disputedDate
                  blockNumber = tx.blockNumber;
                  block = await provider.getBlock(blockNumber);
                  disputedDate = block.timestamp.toString();
                  timeout = (BigInt(disputedDate) + BigInt(resolutionPeriod) + 1n).toString();
                },
                "DISPUTED-RETRACTED": async function () {
                  await finalStateSetup["DISPUTED"]();
                },
                "DISPUTED-EXPIRED": async function () {
                  await finalStateSetup["DISPUTED"]();
                  await setNextBlockTimestamp(Number(timeout));
                },
                "DISPUTED-RESOLVED": async function () {
                  await finalStateSetup["DISPUTED"]();

                  buyerPercentBasisPoints = "5566"; // 55.66%

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
                  signature = await prepareDataSignature(
                    voucherOwner, // Assistant is the caller, seller should be the signer.
                    customSignatureType,
                    "Resolution",
                    message,
                    await disputeHandler.getAddress()
                  );
                },
                "DISPUTED-ESCALATED": async function () {
                  // Not a final state, but a separate setup to avoid code duplication

                  await finalStateSetup["DISPUTED"]();

                  // Escalate the dispute
                  await disputeHandler.connect(voucherOwner).escalateDispute(exchangeId);
                },
                "DISPUTED-ESCALATED-RETRACTED": async function () {
                  await finalStateSetup["DISPUTED-ESCALATED"]();
                },
                "DISPUTED-ESCALATED-RESOLVED": async function () {
                  // "DISPUTED-ESCALATED-RESOLVED" has more in common with "DISPUTED-RESOLVED" than "DISPUTED-ESCALATED"
                  await finalStateSetup["DISPUTED-RESOLVED"]();

                  // Escalate the dispute
                  await disputeHandler.connect(voucherOwner).escalateDispute(exchangeId);
                },
                "DISPUTED-ESCALATED-DECIDED": async function () {
                  await finalStateSetup["DISPUTED-ESCALATED"]();

                  buyerPercentBasisPoints = "4321"; // 43.21%
                },
                "DISPUTED-ESCALATED-EXPIRED": async function () {
                  await finalStateSetup["DISPUTED"]();

                  // Escalate the dispute
                  tx = await disputeHandler.connect(voucherOwner).escalateDispute(exchangeId);

                  // Get the block timestamp of the confirmed tx and set escalatedDate
                  blockNumber = tx.blockNumber;
                  block = await ethers.provider.getBlock(blockNumber);
                  escalatedDate = block.timestamp.toString();

                  await setNextBlockTimestamp(
                    Number(escalatedDate) + Number(disputeResolver.escalationResponsePeriod) + 1
                  );
                },
                "DISPUTED-ESCALATED-REFUSED": async function () {
                  await finalStateSetup["DISPUTED-ESCALATED"]();
                },
              };

              let resellerPayoffs;
              const finalStatePayouts = {
                COMPLETED: async function () {
                  buyerPayoff = "0";

                  protocolFee = BigInt(applyPercentage(offer.price, fee.protocol));
                  previousPrice = BigInt(offer.price);
                  for (const exchange of exchangeInformation) {
                    const exchangeProtocolFee = applyPercentage(exchange.price, fee.protocol);
                    const exchangeRoyalties = applyPercentage(exchange.price, fee.royalties);

                    // Total royalties and fees
                    totalRoyalties = totalRoyalties + BigInt(exchangeRoyalties);
                    protocolFee = protocolFee + BigInt(exchangeProtocolFee);

                    // Update royalties split
                    for (const [key, value] of Object.entries(totalRoyaltiesSplit)) {
                      const thisTradeRoyalties = BigInt(
                        applyPercentage(exchange.price, applyPercentage(fee.royalties, royaltySplit[key]))
                      );
                      totalRoyaltiesSplit[key] = value + thisTradeRoyalties;
                      royaltiesPerExchange.push({ id: keyToId[key], payoff: thisTradeRoyalties });
                    }

                    // Reseller payoff
                    const reducedSecondaryPrice =
                      exchange.price - BigInt(exchangeRoyalties) - BigInt(exchangeProtocolFee);
                    const priceDiff = reducedSecondaryPrice - previousPrice;

                    resellerPayoffs.push({
                      id: exchange.resellerId,
                      payoff: priceDiff > 0n ? priceDiff.toString() : "0",
                    });
                    previousPrice = exchange.price;
                  }
                  totalRoyaltiesSplit.seller = totalRoyalties - totalRoyaltiesSplit.other - totalRoyaltiesSplit.other2;

                  // seller: sellerDeposit + price - protocolFee + royalties
                  const initialFee = applyPercentage(offer.price, fee.protocol);
                  sellerPayoff = (
                    BigInt(offer.sellerDeposit) +
                    BigInt(offer.price) +
                    BigInt(totalRoyaltiesSplit.seller) -
                    BigInt(initialFee)
                  ).toString();

                  // protocol: protocolFee
                  protocolPayoff = protocolFee.toString();

                  // royalty recipients: royalties
                  royaltyRecipientsPayoffs = [
                    {
                      id: keyToId["other"],
                      payoff: totalRoyaltiesSplit.other,
                    },
                    { id: keyToId["other2"], payoff: totalRoyaltiesSplit.other2 },
                  ];
                },
                REVOKED: async function () {
                  // expected payoffs
                  // last buyer: sellerDeposit + last price
                  const lastPrice = exchangeInformation[exchangeInformation.length - 1].price;
                  buyerPayoff = (BigInt(lastPrice) + BigInt(offer.sellerDeposit)).toString();

                  // resellers: difference between original price and immediate payoff
                  previousPrice = BigInt(offer.price);
                  for (const exchange of exchangeInformation) {
                    const exchangeProtocolFee = applyPercentage(exchange.price, fee.protocol);
                    const exchangeRoyalties = applyPercentage(exchange.price, fee.royalties);

                    // Reseller payoff
                    const reducedSecondaryPrice =
                      exchange.price - BigInt(exchangeRoyalties) - BigInt(exchangeProtocolFee);
                    const priceDiff = previousPrice - reducedSecondaryPrice;

                    resellerPayoffs.push({
                      id: exchange.resellerId,
                      payoff: priceDiff > 0n ? priceDiff.toString() : "0",
                    });
                    previousPrice = exchange.price;
                  }

                  // seller: 0
                  sellerPayoff = "0";

                  // protocol: 0
                  protocolPayoff = "0";

                  // royalty recipients: 0
                  royaltyRecipientsPayoffs = [
                    {
                      id: keyToId["other"],
                      payoff: 0n,
                    },
                    { id: keyToId["other2"], payoff: 0n },
                  ];
                },
                CANCELED: async function () {
                  // expected payoffs
                  // last buyer: last price - buyerCancelPenalty
                  const lastPrice = exchangeInformation[exchangeInformation.length - 1].price;
                  buyerPayoff = (BigInt(lastPrice) - BigInt(offer.buyerCancelPenalty)).toString();

                  // resellers: difference between original price and immediate payoff
                  previousPrice = BigInt(offer.price);
                  for (const exchange of exchangeInformation) {
                    const exchangeProtocolFee = applyPercentage(exchange.price, fee.protocol);
                    const exchangeRoyalties = applyPercentage(exchange.price, fee.royalties);

                    // Reseller payoff
                    const reducedSecondaryPrice =
                      exchange.price - BigInt(exchangeRoyalties) - BigInt(exchangeProtocolFee);
                    const priceDiff = previousPrice - reducedSecondaryPrice;

                    resellerPayoffs.push({
                      id: exchange.resellerId,
                      payoff: priceDiff > 0n ? priceDiff.toString() : "0",
                    });
                    previousPrice = exchange.price;
                  }

                  // seller: sellerDeposit + buyerCancelPenalty
                  sellerPayoff = (BigInt(offer.sellerDeposit) + BigInt(offer.buyerCancelPenalty)).toString();

                  // protocol: 0
                  protocolPayoff = 0;

                  // royalty recipients: 0
                  royaltyRecipientsPayoffs = [
                    {
                      id: keyToId["other"],
                      payoff: 0n,
                    },
                    { id: keyToId["other2"], payoff: 0n },
                  ];
                },
                "DISPUTED-RETRACTED": async function () {
                  // Payoffs are the same as in the COMPLETED state
                  await finalStatePayouts["COMPLETED"]();
                },
                "DISPUTED-EXPIRED": async function () {
                  // Payoffs are the same as in the COMPLETED state
                  await finalStatePayouts["COMPLETED"]();
                },
                "DISPUTED-RESOLVED": async function () {
                  // expected payoffs
                  // last buyer: (last price + sellerDeposit)*buyerPercentage
                  const lastPrice = exchangeInformation[exchangeInformation.length - 1].price;
                  const sellerDepositSplitBuyer = BigInt(applyPercentage(offer.sellerDeposit, buyerPercentBasisPoints));
                  buyerPayoff = (
                    BigInt(applyPercentage(BigInt(lastPrice), buyerPercentBasisPoints)) + sellerDepositSplitBuyer
                  ).toString();

                  const sellerPercentBasisPoints = 10000 - parseInt(buyerPercentBasisPoints);

                  protocolFee = 0n; // if disputed, the fee is not collected on original trade
                  previousPrice = BigInt(offer.price);
                  for (const exchange of exchangeInformation) {
                    const exchangeProtocolFee = applyPercentage(exchange.price, fee.protocol);
                    const exchangeRoyalties = applyPercentage(exchange.price, fee.royalties);

                    protocolFee = protocolFee + BigInt(applyPercentage(exchangeProtocolFee, sellerPercentBasisPoints));

                    // Reseller payoff
                    const reducedSecondaryPrice =
                      exchange.price - BigInt(exchangeRoyalties) - BigInt(exchangeProtocolFee);
                    const resellerPayoff =
                      BigInt(applyPercentage(previousPrice, buyerPercentBasisPoints)) +
                      (exchange.price - BigInt(applyPercentage(exchange.price, buyerPercentBasisPoints))) -
                      BigInt(applyPercentage(exchangeRoyalties, sellerPercentBasisPoints)) -
                      BigInt(applyPercentage(exchangeProtocolFee, sellerPercentBasisPoints)) -
                      (reducedSecondaryPrice < previousPrice ? reducedSecondaryPrice : previousPrice);

                    resellerPayoffs.push({
                      id: exchange.resellerId,
                      payoff: resellerPayoff.toString(),
                    });
                    previousPrice = exchange.price;

                    // Total royalties and fees
                    const effectivePrice = applyPercentage(exchange.price, sellerPercentBasisPoints);
                    totalRoyalties =
                      totalRoyalties +
                      BigInt(applyPercentage(applyPercentage(exchange.price, fee.royalties), sellerPercentBasisPoints));

                    for (const [key, value] of Object.entries(totalRoyaltiesSplit)) {
                      const thisTradeRoyalties = BigInt(
                        applyPercentage(effectivePrice, applyPercentage(fee.royalties, royaltySplit[key]))
                      );
                      totalRoyaltiesSplit[key] = value + thisTradeRoyalties;
                      royaltiesPerExchange.push({ id: keyToId[key], payoff: thisTradeRoyalties });
                    }
                  }
                  totalRoyaltiesSplit.seller = totalRoyalties - totalRoyaltiesSplit.other - totalRoyaltiesSplit.other2;

                  // seller: sellerDeposit + price + royalties
                  // (last price + sellerDeposit)*buyerPercentage
                  sellerPayoff = (
                    BigInt(offer.price) -
                    BigInt(applyPercentage(offer.price, buyerPercentBasisPoints)) +
                    (BigInt(offer.sellerDeposit) - sellerDepositSplitBuyer) +
                    BigInt(totalRoyaltiesSplit.seller)
                  ).toString();

                  // protocol: protocolFee (only secondary market)
                  protocolPayoff = protocolFee.toString();

                  // royalty recipients: royalties
                  royaltyRecipientsPayoffs = [
                    {
                      id: keyToId["other"],
                      payoff: totalRoyaltiesSplit.other,
                    },
                    { id: keyToId["other2"], payoff: totalRoyaltiesSplit.other2 },
                  ];
                },
                "DISPUTED-ESCALATED-RETRACTED": async function () {
                  // Payoffs are the same as in the COMPLETED state
                  await finalStatePayouts["COMPLETED"]();
                },
                "DISPUTED-ESCALATED-RESOLVED": async function () {
                  // Payoffs are the same as in the "DISPUTED-RESOLVED" state
                  await finalStatePayouts["DISPUTED-RESOLVED"]();
                },
                "DISPUTED-ESCALATED-DECIDED": async function () {
                  // Payoffs are the same as in the "DISPUTED-RESOLVED" state
                  await finalStatePayouts["DISPUTED-RESOLVED"]();
                },
                "DISPUTED-ESCALATED-EXPIRED": async function () {
                  // expected payoffs
                  // last buyer: last price + buyerEscalationDeposit
                  const lastPrice = exchangeInformation[exchangeInformation.length - 1].price;
                  buyerPayoff = (BigInt(lastPrice) + BigInt(buyerEscalationDeposit)).toString();

                  // resellers: difference between original price and immediate payoff
                  previousPrice = BigInt(offer.price);
                  for (const exchange of exchangeInformation) {
                    const exchangeProtocolFee = applyPercentage(exchange.price, fee.protocol);
                    const exchangeRoyalties = applyPercentage(exchange.price, fee.royalties);

                    // Reseller payoff
                    const reducedSecondaryPrice =
                      exchange.price - BigInt(exchangeRoyalties) - BigInt(exchangeProtocolFee);
                    const priceDiff = previousPrice - reducedSecondaryPrice;

                    resellerPayoffs.push({
                      id: exchange.resellerId,
                      payoff: priceDiff > 0n ? priceDiff.toString() : "0",
                    });
                    previousPrice = exchange.price;
                  }

                  // seller: sellerDeposit
                  sellerPayoff = offer.sellerDeposit;

                  // protocol: 0
                  protocolPayoff = "0";

                  // royalty recipients: 0
                  royaltyRecipientsPayoffs = [
                    {
                      id: keyToId["other"],
                      payoff: 0n,
                    },
                    { id: keyToId["other2"], payoff: 0n },
                  ];
                },
                "DISPUTED-ESCALATED-REFUSED": async function () {
                  // Payoffs are the same as in the "DISPUTED-ESCALATED-EXPIRED" state
                  await finalStatePayouts["DISPUTED-ESCALATED-EXPIRED"]();
                },
              };

              const finalStateFinalization = {
                COMPLETED: async () => {
                  return {
                    wallet: voucherOwner,
                    handler: exchangeHandler,
                    method: "completeExchange",
                    args: [exchangeId],
                  };
                },
                REVOKED: async () => {
                  return {
                    wallet: assistant,
                    handler: exchangeHandler,
                    method: "revokeVoucher",
                    args: [exchangeId],
                  };
                },
                CANCELED: async () => {
                  return {
                    wallet: voucherOwner,
                    handler: exchangeHandler,
                    method: "cancelVoucher",
                    args: [exchangeId],
                  };
                },
                "DISPUTED-RETRACTED": async () => {
                  return {
                    wallet: voucherOwner,
                    handler: disputeHandler,
                    method: "retractDispute",
                    args: [exchangeId],
                  };
                },
                "DISPUTED-EXPIRED": async () => {
                  return {
                    wallet: rando,
                    handler: disputeHandler,
                    method: "expireDispute",
                    args: [exchangeId],
                  };
                },
                "DISPUTED-RESOLVED": async () => {
                  return {
                    wallet: assistant,
                    handler: disputeHandler,
                    method: "resolveDispute",
                    args: [exchangeId, buyerPercentBasisPoints, signature],
                  };
                },
                "DISPUTED-ESCALATED-RETRACTED": async () => {
                  // Finalization is the same as "DISPUTED-RETRACTED"
                  return finalStateFinalization["DISPUTED-RETRACTED"]();
                },
                "DISPUTED-ESCALATED-RESOLVED": async () => {
                  // Finalization is the same as "DISPUTED-RESOLVED"
                  return finalStateFinalization["DISPUTED-RESOLVED"]();
                },
                "DISPUTED-ESCALATED-DECIDED": async () => {
                  return {
                    wallet: assistantDR,
                    handler: disputeHandler,
                    method: "decideDispute",
                    args: [exchangeId, buyerPercentBasisPoints],
                  };
                },
                "DISPUTED-ESCALATED-EXPIRED": async () => {
                  return {
                    wallet: rando,
                    handler: disputeHandler,
                    method: "expireEscalatedDispute",
                    args: [exchangeId],
                  };
                },
                "DISPUTED-ESCALATED-REFUSED": async () => {
                  return {
                    wallet: assistantDR,
                    handler: disputeHandler,
                    method: "refuseEscalatedDispute",
                    args: [exchangeId],
                  };
                },
              };

              finalState.forEach((state) => {
                context(`Final state ${state}`, async function () {
                  beforeEach(async function () {
                    await finalStateSetup[state]();

                    totalRoyalties = 0n;
                    totalRoyaltiesSplit = {
                      other: 0n,
                      other2: 0n,
                    };
                    royaltiesPerExchange = [];
                    resellerPayoffs = [];
                    await finalStatePayouts[state]();
                  });

                  it("should emit a FundsReleased event", async function () {
                    // Finalize the exchange, expecting event
                    const action = await finalStateFinalization[state]();
                    const handler = action.handler;
                    const tx = await handler.connect(action.wallet)[action.method](...action.args);

                    let expectedEventCount = 0;
                    // seller
                    if (sellerPayoff != "0") {
                      expectedEventCount++;
                      await expect(tx)
                        .to.emit(handler, "FundsReleased")
                        .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, action.wallet.address);
                    }

                    // Buyer
                    if (buyerPayoff != "0") {
                      expectedEventCount++;
                      await expect(tx)
                        .to.emit(handler, "FundsReleased")
                        .withArgs(exchangeId, buyerId, offerToken.exchangeToken, buyerPayoff, action.wallet.address);
                    }

                    // resellers
                    for (const resellerPayoff of resellerPayoffs) {
                      if (resellerPayoff.payoff != "0") {
                        expectedEventCount++;
                        await expect(tx)
                          .to.emit(handler, "FundsReleased")
                          .withArgs(
                            exchangeId,
                            resellerPayoff.id,
                            offer.exchangeToken,
                            resellerPayoff.payoff,
                            action.wallet.address
                          );
                      }
                    }

                    // royalty recipients
                    for (const royaltyRecipientPayoff of royaltiesPerExchange) {
                      if (royaltyRecipientPayoff.payoff != 0n) {
                        expectedEventCount++;
                        await expect(tx)
                          .to.emit(handler, "FundsReleased")
                          .withArgs(
                            exchangeId,
                            royaltyRecipientPayoff.id,
                            offer.exchangeToken,
                            royaltyRecipientPayoff.payoff,
                            action.wallet.address
                          );
                      }
                    }

                    // Make sure exact number of FundsReleased events was emitted
                    const eventCount = (await tx.wait()).logs.filter((e) => e.eventName == "FundsReleased").length;
                    expect(eventCount).to.equal(expectedEventCount);

                    // protocol
                    if (protocolPayoff != "0") {
                      await expect(tx)
                        .to.emit(handler, "ProtocolFeeCollected")
                        .withArgs(exchangeId, offer.exchangeToken, protocolPayoff, action.wallet.address);
                    } else {
                      await expect(tx).to.not.emit(handler, "ProtocolFeeCollected");
                    }
                  });

                  it("should update state", async function () {
                    // Read on chain state
                    sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
                    buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
                    protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
                    agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
                    resellersAvailableFunds = (
                      await Promise.all(resellerPayoffs.map((r) => fundsHandler.getAllAvailableFunds(r.id)))
                    ).map((returnedValue) => FundsList.fromStruct(returnedValue));
                    royaltyRecipientsAvailableFunds = (
                      await Promise.all(royaltyRecipientsPayoffs.map((r) => fundsHandler.getAllAvailableFunds(r.id)))
                    ).map((returnedValue) => FundsList.fromStruct(returnedValue));

                    // Chain state should match the expected available funds
                    expectedSellerAvailableFunds = new FundsList([]);
                    expectedBuyerAvailableFunds = new FundsList([]);
                    expectedProtocolAvailableFunds = new FundsList([]);
                    expectedAgentAvailableFunds = new FundsList([]);
                    expectedResellersAvailableFunds = new Array(resellerPayoffs.length).fill(new FundsList([]));
                    expectedRoyaltyRecipientsAvailableFunds = new Array(royaltyRecipientsPayoffs.length).fill(
                      new FundsList([])
                    );
                    expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
                    expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
                    expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
                    expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
                    expect(resellersAvailableFunds).to.eql(expectedResellersAvailableFunds);
                    expect(royaltyRecipientsAvailableFunds).to.eql(expectedRoyaltyRecipientsAvailableFunds);

                    // Complete the exchange so the funds are released
                    const action = await finalStateFinalization[state]();
                    await action.handler.connect(action.wallet)[action.method](...action.args);

                    // Change in available funds
                    if (sellerPayoff != "0") {
                      expectedSellerAvailableFunds.funds.push(new Funds(mockTokenAddress, "Foreign20", sellerPayoff));
                    }
                    if (buyerPayoff != "0") {
                      expectedBuyerAvailableFunds.funds.push(new Funds(mockTokenAddress, "Foreign20", buyerPayoff));
                    }
                    if (protocolPayoff != "0") {
                      expectedProtocolAvailableFunds.funds.push(
                        new Funds(mockTokenAddress, "Foreign20", protocolPayoff)
                      );
                    }
                    expectedResellersAvailableFunds = resellerPayoffs.map((r) => {
                      return new FundsList(r.payoff != "0" ? [new Funds(mockTokenAddress, "Foreign20", r.payoff)] : []);
                    });
                    expectedRoyaltyRecipientsAvailableFunds = royaltyRecipientsPayoffs.map((r) => {
                      return new FundsList(r.payoff != "0" ? [new Funds(mockTokenAddress, "Foreign20", r.payoff)] : []);
                    });

                    sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
                    buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
                    protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
                    agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
                    resellersAvailableFunds = (
                      await Promise.all(resellerPayoffs.map((r) => fundsHandler.getAllAvailableFunds(r.id)))
                    ).map((returnedValue) => FundsList.fromStruct(returnedValue));
                    royaltyRecipientsAvailableFunds = (
                      await Promise.all(royaltyRecipientsPayoffs.map((r) => fundsHandler.getAllAvailableFunds(r.id)))
                    ).map((returnedValue) => FundsList.fromStruct(returnedValue));

                    expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
                    expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
                    expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
                    expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
                    expect(resellersAvailableFunds).to.eql(expectedResellersAvailableFunds);
                    expect(royaltyRecipientsAvailableFunds).to.eql(expectedRoyaltyRecipientsAvailableFunds);

                    const protocolBalance = await mockToken.balanceOf(protocolDiamondAddress);
                    const totalPayoff =
                      BigInt(sellerPayoff) +
                      BigInt(buyerPayoff) +
                      BigInt(protocolPayoff) +
                      BigInt(resellerPayoffs.reduce((acc, r) => acc + BigInt(r.payoff), 0n)) +
                      BigInt(royaltyRecipientsPayoffs.reduce((acc, r) => acc + BigInt(r.payoff), 0n));

                    // Since protocol had no funds before and nothing was withdrawn, the balance should match the total payoff
                    expect(protocolBalance).to.equal(totalPayoff);
                  });
                });
              });
            });
          });

          context("Changing the protocol fee and royalties", async function () {
            let voucherOwner, previousPrice;
            let payoutInformation;
            let totalRoyalties, totalProtocolFee;
            let resellerPayoffs;

            beforeEach(async function () {
              payoutInformation = [];

              const fees = [
                { protocol: 100, royalties: 50 },
                { protocol: 400, royalties: 200 },
                { protocol: 300, royalties: 300 },
                { protocol: 700, royalties: 100 },
              ];

              let feeIndex = 0;
              let fee = fees[feeIndex];

              // set fees
              const expectedCloneAddress = calculateCloneAddress(
                await accountHandler.getAddress(),
                beaconProxyAddress,
                admin.address
              );
              const bosonVoucherClone = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);
              await configHandler.setProtocolFeePercentage(fee.protocol);

              // create a new offer
              offer = offerToken.clone();
              offer.id = "0";
              offer.price = "100";
              offer.sellerDeposit = "10";
              offer.buyerCancelPenalty = "30";
              offer.royaltyInfo = [new RoyaltyInfo([ZeroAddress], [fee.royalties])];

              // deposit to seller's pool
              await fundsHandler.connect(assistant).withdrawFunds(seller.id, [], []); // withdraw all, so it's easier to test
              await mockToken.connect(assistant).mint(assistant.address, offer.sellerDeposit);
              await mockToken.connect(assistant).approve(await fundsHandler.getAddress(), offer.sellerDeposit);
              await fundsHandler
                .connect(assistant)
                .depositFunds(seller.id, await mockToken.getAddress(), offer.sellerDeposit);

              offer.id = await offerHandler
                .connect(assistant)
                .createOffer(offer, offerDates, offerDurations, disputeResolverId, 0, offerFeeLimit, {
                  getOfferId: true,
                });

              // ids
              exchangeId = "1";
              agentId = "3";
              buyerId = 5;

              // Create buyer with price discovery client address to not mess up ids in tests
              await accountHandler.createBuyer(mockBuyer(await bpd.getAddress()));

              // commit to offer
              await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offer.id);

              voucherOwner = buyer; // voucherOwner is the first buyer
              previousPrice = BigInt(offer.price);
              totalRoyalties = 0n;
              totalProtocolFee = 0n;
              for (const trade of buyerChains[direction]) {
                feeIndex++;
                fee = fees[feeIndex];

                // set new fee
                await configHandler.setProtocolFeePercentage(fee.protocol);
                await offerHandler
                  .connect(assistant)
                  .updateOfferRoyaltyRecipients(offer.id, new RoyaltyInfo([ZeroAddress], [fee.royalties]));

                // Prepare calldata for PriceDiscovery contract
                const tokenId = deriveTokenId(offer.id, exchangeId);
                let order = {
                  seller: voucherOwner.address,
                  buyer: trade.buyer.address,
                  voucherContract: expectedCloneAddress,
                  tokenId: tokenId,
                  exchangeToken: offer.exchangeToken,
                  price: BigInt(trade.price),
                };

                const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilBuyOrder", [
                  order,
                ]);

                const priceDiscoveryContractAddress = await priceDiscoveryContract.getAddress();
                const priceDiscovery = new PriceDiscovery(
                  order.price,
                  Side.Ask,
                  priceDiscoveryContractAddress,
                  priceDiscoveryContractAddress,
                  priceDiscoveryData
                );

                // voucher owner approves protocol to transfer the tokens
                await mockToken.mint(voucherOwner.address, order.price);
                await mockToken.connect(voucherOwner).approve(protocolDiamondAddress, order.price);

                // Voucher owner approves PriceDiscovery contract to transfer the tokens
                await bosonVoucherClone.connect(voucherOwner).setApprovalForAll(priceDiscoveryContractAddress, true);

                // Buyer approves protocol to transfer the tokens
                await mockToken.mint(trade.buyer.address, order.price);
                await mockToken.connect(trade.buyer).approve(protocolDiamondAddress, order.price);

                // commit to offer
                await sequentialCommitHandler
                  .connect(trade.buyer)
                  .sequentialCommitToOffer(trade.buyer.address, tokenId, priceDiscovery, {
                    gasPrice: 0,
                  });

                // Fees, royalties and immediate payout
                const royalties = applyPercentage(order.price, fee.royalties);
                const protocolFee = applyPercentage(order.price, fee.protocol);
                const reducedSecondaryPrice = order.price - BigInt(royalties) - BigInt(protocolFee);
                const immediatePayout = reducedSecondaryPrice <= previousPrice ? reducedSecondaryPrice : previousPrice;
                payoutInformation.push({ buyerId: buyerId++, immediatePayout, previousPrice, reducedSecondaryPrice });

                // Total royalties and fees
                totalRoyalties = totalRoyalties + BigInt(royalties);
                totalProtocolFee = totalProtocolFee + BigInt(protocolFee);

                voucherOwner = trade.buyer; // last buyer is voucherOwner in next iteration
                previousPrice = order.price;
              }

              // expected payoffs
              // buyer: 0
              buyerPayoff = 0;

              // resellers: difference between the secondary price and immediate payout
              resellerPayoffs = payoutInformation.map((pi) => {
                return { id: pi.buyerId, payoff: (pi.reducedSecondaryPrice - BigInt(pi.immediatePayout)).toString() };
              });

              // seller: sellerDeposit + price - protocolFee + royalties
              const initialFee = applyPercentage(offer.price, fees[0].protocol);
              sellerPayoff = (
                BigInt(offer.sellerDeposit) +
                BigInt(offer.price) +
                BigInt(totalRoyalties) -
                BigInt(initialFee)
              ).toString();

              // protocol: protocolFee
              protocolPayoff = (totalProtocolFee + BigInt(initialFee)).toString();
            });

            it("Fees and royalties should be the same as at the commit time", async function () {
              // set the new protocol fee
              protocolFeePercentage = "300"; // 3%
              await configHandler.connect(deployer).setProtocolFeePercentage(protocolFeePercentage);

              // Set time forward to the offer's voucherRedeemableFrom
              await setNextBlockTimestamp(Number(voucherRedeemableFrom));

              // succesfully redeem exchange
              await exchangeHandler.connect(voucherOwner).redeemVoucher(exchangeId);

              // complete exchange
              tx = await exchangeHandler.connect(voucherOwner).completeExchange(exchangeId);

              // seller
              await expect(tx)
                .to.emit(exchangeHandler, "FundsReleased")
                .withArgs(exchangeId, seller.id, offerToken.exchangeToken, sellerPayoff, voucherOwner.address);

              // resellers
              let expectedEventCount = 1; // 1 for seller
              for (const resellerPayoff of resellerPayoffs) {
                if (resellerPayoff.payoff != "0") {
                  expectedEventCount++;
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

              // Make sure exact number of FundsReleased events was emitted
              const eventCount = (await tx.wait()).logs.filter((e) => e.eventName == "FundsReleased").length;
              expect(eventCount).to.equal(expectedEventCount);

              // protocol
              if (protocolPayoff != "0") {
                await expect(tx)
                  .to.emit(exchangeHandler, "ProtocolFeeCollected")
                  .withArgs(exchangeId, offer.exchangeToken, protocolPayoff, voucherOwner.address);
              } else {
                await expect(tx).to.not.emit(exchangeHandler, "ProtocolFeeCollected");
              }
            });
          });
        });
      });
    });

    context("👉 releaseFunds() - Price discovery", async function () {
      let voucherCloneAddress, order;
      beforeEach(async function () {
        // ids
        protocolId = "0";
        buyerId = "4";
        exchangeId = "1";

        // reserve a range and premint vouchers
        await offerHandler
          .connect(assistant)
          .reserveRange(offerPriceDiscovery.id, offerPriceDiscovery.quantityAvailable, assistant.address);
        voucherCloneAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          admin.address
        );
        const bosonVoucher = await ethers.getContractAt("BosonVoucher", voucherCloneAddress);
        await bosonVoucher.connect(assistant).preMint(offerPriceDiscovery.id, offerPriceDiscovery.quantityAvailable);
        await bosonVoucher.connect(assistant).setApprovalForAll(await priceDiscoveryContract.getAddress(), true);
        const tokenId = deriveTokenId(offerPriceDiscovery.id, exchangeId);

        order = {
          seller: assistant.address,
          buyer: buyer.address,
          voucherContract: voucherCloneAddress,
          tokenId: tokenId,
          exchangeToken: offerPriceDiscovery.exchangeToken,
          price: orderPrice,
        };
        priceDiscoveryProtocolFee = applyPercentage(order.price, "200");

        const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilBuyOrder", [order]);

        const priceDiscovery = PriceDiscovery.fromObject({
          price: order.price,
          side: Side.Ask,
          priceDiscoveryContract: await priceDiscoveryContract.getAddress(),
          conduit: await priceDiscoveryContract.getAddress(),
          priceDiscoveryData: priceDiscoveryData,
        });
        await mockToken
          .connect(assistant)
          .approve(protocolDiamondAddress, order.price * BigInt(offerPriceDiscovery.quantityAvailable));

        // commit to offer
        await priceDiscoveryHandler
          .connect(buyer)
          .commitToPriceDiscoveryOffer(await buyer.getAddress(), offerPriceDiscovery.id, priceDiscovery);
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

          // protocol: protocolFee
          protocolPayoff = priceDiscoveryProtocolFee.toString();

          // seller: price - protocolFee
          sellerPayoff = BigInt(order.price) - BigInt(protocolPayoff);

          // seller: sellerDeposit
          sellerPayoff2 = BigInt(offerPriceDiscovery.sellerDeposit);
        });

        it("should emit a FundsReleased event", async function () {
          // Complete the exchange, expecting event
          const tx = await exchangeHandler.connect(buyer).completeExchange(exchangeId);

          await expect(tx)
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(exchangeId, seller.id, offerPriceDiscovery.exchangeToken, sellerPayoff, await buyer.getAddress());
          await expect(tx)
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(
              exchangeId,
              seller.id,
              offerPriceDiscovery.exchangeToken,
              sellerPayoff2,
              await buyer.getAddress()
            );
          await expect(tx)
            .to.emit(exchangeHandler, "ProtocolFeeCollected")
            .withArgs(exchangeId, offerPriceDiscovery.exchangeToken, protocolPayoff, await buyer.getAddress());
        });

        it("should update state", async function () {
          const tokenId = deriveTokenId(offerPriceDiscovery.id, "2");

          order = {
            seller: assistant.address,
            buyer: buyer.address,
            voucherContract: voucherCloneAddress,
            tokenId: tokenId,
            exchangeToken: offerPriceDiscovery.exchangeToken,
            price: orderPrice,
          };

          const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilBuyOrder", [order]);

          const priceDiscovery = PriceDiscovery.fromObject({
            price: order.price,
            side: Side.Ask,
            priceDiscoveryContract: await priceDiscoveryContract.getAddress(),
            conduit: await priceDiscoveryContract.getAddress(),
            priceDiscoveryData: priceDiscoveryData,
          });
          // commit again, so seller has nothing in available funds
          await priceDiscoveryHandler
            .connect(buyer)
            .commitToPriceDiscoveryOffer(await buyer.getAddress(), offerPriceDiscovery.id, priceDiscovery);
          // Read on chain state
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
          agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

          // Chain state should match the expected available funds
          expectedSellerAvailableFunds = new FundsList([
            new Funds(ZeroAddress, "Native currency", `${2 * sellerDeposit}`),
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
          expectedSellerAvailableFunds.funds.push(
            new Funds(await mockToken.getAddress(), "Foreign20", BigInt(sellerPayoff) + BigInt(sellerPayoff2))
          );
          expectedProtocolAvailableFunds = new FundsList([
            new Funds(await mockToken.getAddress(), "Foreign20", protocolPayoff),
          ]);
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
          agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
          expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
          expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
          expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
          expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

          // complete another exchange so we test funds are only updated, no new entry is created
          await exchangeHandler.connect(buyer).redeemVoucher(++exchangeId);
          await exchangeHandler.connect(buyer).completeExchange(exchangeId);

          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
          agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
          expectedSellerAvailableFunds.funds[1] = new Funds(
            await mockToken.getAddress(),
            "Foreign20",
            (BigInt(sellerPayoff) + BigInt(sellerPayoff2)) * 2n // completed twice
          );
          expectedProtocolAvailableFunds.funds[0] = new Funds(
            await mockToken.getAddress(),
            "Foreign20",
            BigInt(protocolPayoff) * 2n // completed twice
          );
          expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
          expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
          expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
          expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
        });
      });

      context("Final state REVOKED", async function () {
        beforeEach(async function () {
          // expected payoffs
          // buyer: sellerDeposit + price
          buyerPayoff = BigInt(offerPriceDiscovery.sellerDeposit) + BigInt(orderPrice);

          // seller: 0
          sellerPayoff = 0;

          // protocol: 0
          protocolPayoff = 0;
        });

        it("should emit a FundsReleased event", async function () {
          // Revoke the voucher, expecting event
          const tx = exchangeHandler.connect(assistant).revokeVoucher(exchangeId);
          await expect(tx)
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(
              exchangeId,
              buyerId,
              offerPriceDiscovery.exchangeToken,
              buyerPayoff,
              await assistant.getAddress()
            );
        });

        it("should update state", async function () {
          // Read on chain state
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
          agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
          // Chain state should match the expected available funds
          expectedSellerAvailableFunds = new FundsList([
            new Funds(await mockToken.getAddress(), "Foreign20", sellerDeposit),
            new Funds(ZeroAddress, "Native currency", (2n * BigInt(sellerDeposit)).toString()),
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
          expectedBuyerAvailableFunds.funds.push(new Funds(await mockToken.getAddress(), "Foreign20", buyerPayoff));
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
          agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
          expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
          expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
          expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
          expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

          // Test that if buyer has some funds available, and gets more, the funds are only updated
          // Commit again
          const tokenId = deriveTokenId(offerPriceDiscovery.id, "2");

          const order = {
            seller: assistant.address,
            buyer: buyer.address,
            voucherContract: voucherCloneAddress,
            tokenId: tokenId,
            exchangeToken: offerPriceDiscovery.exchangeToken,
            price: orderPrice,
          };

          const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilBuyOrder", [order]);

          const priceDiscovery = PriceDiscovery.fromObject({
            price: order.price,
            side: Side.Ask,
            priceDiscoveryContract: await priceDiscoveryContract.getAddress(),
            conduit: await priceDiscoveryContract.getAddress(),
            priceDiscoveryData: priceDiscoveryData,
          });
          // commit again, so seller has nothing in available funds
          await priceDiscoveryHandler
            .connect(buyer)
            .commitToPriceDiscoveryOffer(await buyer.getAddress(), offerPriceDiscovery.id, priceDiscovery);

          // Revoke another voucher
          await exchangeHandler.connect(assistant).revokeVoucher(++exchangeId);

          // Available funds should be increased for
          // buyer: 2* (sellerDeposit + price)
          // seller: 0; but during the commitToOffer, sellerDeposit is encumbered
          // protocol: 0
          // agent: 0
          expectedBuyerAvailableFunds.funds[0] = new Funds(
            await mockToken.getAddress(),
            "Foreign20",
            BigInt(buyerPayoff) * 2n
          );
          expectedSellerAvailableFunds = new FundsList([
            new Funds(ZeroAddress, "Native currency", `${2 * sellerDeposit}`),
          ]);
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
          agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
          expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
          expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
          expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
          expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
        });
      });

      context("Final state CANCELED", async function () {
        beforeEach(async function () {
          // expected payoffs
          // buyer: price - buyerCancelPenalty
          buyerPayoff = BigInt(order.price) - BigInt(offerPriceDiscovery.buyerCancelPenalty);

          // seller: sellerDeposit + buyerCancelPenalty
          sellerPayoff = BigInt(offerPriceDiscovery.sellerDeposit) + BigInt(offerPriceDiscovery.buyerCancelPenalty);

          //protocol: 0
          protocolPayoff = 0;
        });

        it("should emit a FundsReleased event", async function () {
          // Cancel the voucher, expecting event
          const tx = await exchangeHandler.connect(buyer).cancelVoucher(exchangeId);
          await expect(tx)
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(exchangeId, seller.id, offerPriceDiscovery.exchangeToken, sellerPayoff, await buyer.getAddress());

          await expect(tx)
            .to.emit(exchangeHandler, "FundsReleased")
            .withArgs(exchangeId, buyerId, offerPriceDiscovery.exchangeToken, buyerPayoff, await buyer.getAddress());

          await expect(tx).to.not.emit(exchangeHandler, "ProtocolFeeCollected");
        });

        it("should update state", async function () {
          // Read on chain state
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
          agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

          // Chain state should match the expected available funds
          expectedSellerAvailableFunds = new FundsList([
            new Funds(await mockToken.getAddress(), "Foreign20", sellerDeposit),
            new Funds(ZeroAddress, "Native currency", `${2 * sellerDeposit}`),
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
            await mockToken.getAddress(),
            "Foreign20",
            (BigInt(sellerDeposit) + BigInt(sellerPayoff)).toString()
          );
          expectedBuyerAvailableFunds.funds.push(new Funds(await mockToken.getAddress(), "Foreign20", buyerPayoff));
          sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
          protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
          agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
          expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
          expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
          expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
          expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
        });
      });

      context("Final state DISPUTED", async function () {
        beforeEach(async function () {
          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // succesfully redeem exchange
          await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

          // raise the dispute
          tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Get the block timestamp of the confirmed tx and set disputedDate
          blockNumber = tx.blockNumber;
          block = await provider.getBlock(blockNumber);
          disputedDate = block.timestamp.toString();
          timeout = BigInt(disputedDate) + BigInt(resolutionPeriod);
        });
        context("Final state DISPUTED - RETRACTED", async function () {
          beforeEach(async function () {
            // expected payoffs
            // buyer: 0
            buyerPayoff = 0;

            // protocol: 0
            protocolPayoff = BigInt(priceDiscoveryProtocolFee).toString();

            // seller: price - protocolFee
            sellerPayoff = BigInt(order.price) - BigInt(protocolPayoff);

            // seller: sellerDeposit  - protocolFee
            sellerPayoff2 = BigInt(offerPriceDiscovery.sellerDeposit);
          });
          it("should emit a FundsReleased event", async function () {
            // Retract from the dispute, expecting event
            const tx = await disputeHandler.connect(buyer).retractDispute(exchangeId);

            await expect(tx)
              .to.emit(disputeHandler, "ProtocolFeeCollected")
              .withArgs(exchangeId, offerPriceDiscovery.exchangeToken, protocolPayoff, await buyer.getAddress());

            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(
                exchangeId,
                seller.id,
                offerPriceDiscovery.exchangeToken,
                sellerPayoff,
                await buyer.getAddress()
              );

            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(
                exchangeId,
                seller.id,
                offerPriceDiscovery.exchangeToken,
                sellerPayoff2,
                await buyer.getAddress()
              );

            //check that FundsReleased event was NOT emitted with buyer Id
            const txReceipt = await tx.wait();
            const match = eventEmittedWithArgs(txReceipt, disputeHandler, "FundsReleased", [
              exchangeId,
              buyerId,
              offerPriceDiscovery.exchangeToken,
              buyerPayoff,
              await buyer.getAddress(),
            ]);
            expect(match).to.be.false;
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", sellerDeposit),
              new Funds(ZeroAddress, "Native currency", `${2 * sellerDeposit}`),
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
              await mockToken.getAddress(),
              "Foreign20",
              (BigInt(sellerDeposit) + BigInt(sellerPayoff) + BigInt(sellerPayoff2)).toString()
            );
            expectedProtocolAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", protocolPayoff),
            ]);
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
          });
        });

        context("Final state DISPUTED - RETRACTED via expireDispute", async function () {
          beforeEach(async function () {
            // expected payoffs
            // buyer: 0
            buyerPayoff = 0;

            // protocol: 0
            protocolPayoff = BigInt(priceDiscoveryProtocolFee).toString();

            // seller: price - protocolFee
            sellerPayoff = BigInt(order.price) - BigInt(protocolPayoff);

            // seller: sellerDeposit
            sellerPayoff2 = BigInt(offerPriceDiscovery.sellerDeposit);

            await setNextBlockTimestamp(Number(timeout) + 1);
          });

          it("should emit a FundsReleased event", async function () {
            // Expire the dispute, expecting event
            const tx = await disputeHandler.connect(rando).expireDispute(exchangeId);
            await expect(tx)
              .to.emit(disputeHandler, "ProtocolFeeCollected")
              .withArgs(exchangeId, offerPriceDiscovery.exchangeToken, protocolPayoff, rando.address);

            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, seller.id, offerPriceDiscovery.exchangeToken, sellerPayoff, rando.address);

            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(exchangeId, seller.id, offerPriceDiscovery.exchangeToken, sellerPayoff2, rando.address);

            //check that FundsReleased event was NOT emitted with buyer Id
            const txReceipt = await tx.wait();
            const match = eventEmittedWithArgs(txReceipt, disputeHandler, "FundsReleased", [
              exchangeId,
              buyerId,
              offerPriceDiscovery.exchangeToken,
              buyerPayoff,
              rando.address,
            ]);
            expect(match).to.be.false;
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", sellerDeposit),
              new Funds(ZeroAddress, "Native currency", `${2 * sellerDeposit}`),
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
            // protocol:  protocolFee
            // agent: 0
            expectedSellerAvailableFunds.funds[0] = new Funds(
              await mockToken.getAddress(),
              "Foreign20",
              (BigInt(sellerDeposit) + BigInt(sellerPayoff) + BigInt(sellerPayoff2)).toString()
            );
            expectedProtocolAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", protocolPayoff),
            ]);
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
          });
        });

        context("Final state DISPUTED - RESOLVED", async function () {
          beforeEach(async function () {
            buyerPercentBasisPoints = "5566"; // 55.66%

            // expected payoffs
            // buyer: (price + sellerDeposit)*buyerPercentage
            buyerPayoff =
              ((BigInt(order.price) + BigInt(offerPriceDiscovery.sellerDeposit)) * BigInt(buyerPercentBasisPoints)) /
              10000n;

            const sellerPercentBasisPoints = 10000n - BigInt(buyerPercentBasisPoints);

            sellerPayoff =
              (BigInt(offerPriceDiscovery.sellerDeposit) * (10000n - BigInt(buyerPercentBasisPoints))) / 10000n;

            const sellerPricePart = BigInt(order.price) - (BigInt(order.price) * sellerPercentBasisPoints) / 10000n;
            const sellerProtocolFeePart = (BigInt(priceDiscoveryProtocolFee) * sellerPercentBasisPoints) / 10000n;
            sellerPayoff2 = BigInt(order.price) - sellerPricePart - sellerProtocolFeePart;

            protocolPayoff = sellerProtocolFeePart;

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
            signature = await prepareDataSignature(
              buyer, // Assistant is the caller, seller should be the signer.
              customSignatureType,
              "Resolution",
              message,
              await disputeHandler.getAddress()
            );
          });

          it("should emit a FundsReleased event", async function () {
            // Resolve the dispute, expecting event
            const tx = await disputeHandler
              .connect(assistant)
              .resolveDispute(exchangeId, buyerPercentBasisPoints, signature);

            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(
                exchangeId,
                seller.id,
                offerPriceDiscovery.exchangeToken,
                sellerPayoff,
                await assistant.getAddress()
              );

            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(
                exchangeId,
                seller.id,
                offerPriceDiscovery.exchangeToken,
                sellerPayoff2,
                await assistant.getAddress()
              );

            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(
                exchangeId,
                buyerId,
                offerPriceDiscovery.exchangeToken,
                buyerPayoff,
                await assistant.getAddress()
              );

            await expect(tx)
              .to.emit(disputeHandler, "ProtocolFeeCollected")
              .withArgs(exchangeId, offerPriceDiscovery.exchangeToken, protocolPayoff, await assistant.getAddress());
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", sellerDeposit),
              new Funds(ZeroAddress, "Native currency", `${2 * sellerDeposit}`),
            ]);
            expectedBuyerAvailableFunds = new FundsList([]);
            expectedProtocolAvailableFunds = new FundsList([]);
            expectedAgentAvailableFunds = new FundsList([]);

            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

            // Resolve the dispute, so the funds are released
            await disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercentBasisPoints, signature);

            // Available funds should be increased for
            // buyer: (price + sellerDeposit)*buyerPercentage
            // protocol: protocolFee
            // agent: 0
            expectedSellerAvailableFunds.funds[0] = new Funds(
              await mockToken.getAddress(),
              "Foreign20",
              (BigInt(sellerDeposit) + BigInt(sellerPayoff) + BigInt(sellerPayoff2)).toString()
            );
            expectedBuyerAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", buyerPayoff),
            ]);
            expectedProtocolAvailableFunds.funds[0] = new Funds(
              await mockToken.getAddress(),
              "Foreign20",
              BigInt(protocolPayoff).toString()
            );
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
          });
        });

        context("Final state DISPUTED - ESCALATED - RETRACTED", async function () {
          beforeEach(async function () {
            // expected payoffs
            // buyer: 0
            buyerPayoff = 0;

            // protocol: protocolFee
            protocolPayoff = BigInt(priceDiscoveryProtocolFee).toString();

            sellerPayoff = BigInt(order.price) - BigInt(protocolPayoff);

            sellerPayoff2 = BigInt(offerPriceDiscovery.sellerDeposit);

            // Escalate the dispute
            await disputeHandler.connect(buyer).escalateDispute(exchangeId);
          });

          it("should emit a FundsReleased event", async function () {
            // Retract from the dispute, expecting event
            const tx = await disputeHandler.connect(buyer).retractDispute(exchangeId);

            await expect(tx)
              .to.emit(disputeHandler, "ProtocolFeeCollected")
              .withArgs(exchangeId, offerPriceDiscovery.exchangeToken, protocolPayoff, await buyer.getAddress());

            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(
                exchangeId,
                seller.id,
                offerPriceDiscovery.exchangeToken,
                sellerPayoff,
                await buyer.getAddress()
              );

            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(
                exchangeId,
                seller.id,
                offerPriceDiscovery.exchangeToken,
                sellerPayoff2,
                await buyer.getAddress()
              );

            //check that FundsReleased event was NOT emitted with buyer Id
            const txReceipt = await tx.wait();
            const match = eventEmittedWithArgs(txReceipt, disputeHandler, "FundsReleased", [
              exchangeId,
              buyerId,
              offerPriceDiscovery.exchangeToken,
              buyerPayoff,
              await buyer.getAddress(),
            ]);
            expect(match).to.be.false;
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", sellerDeposit),
              new Funds(ZeroAddress, "Native currency", `${2 * sellerDeposit}`),
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
              await mockToken.getAddress(),
              "Foreign20",
              (BigInt(sellerDeposit) + BigInt(sellerPayoff) + BigInt(sellerPayoff2)).toString()
            );
            expectedProtocolAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", protocolPayoff),
            ]);

            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
          });
        });

        context("Final state DISPUTED - ESCALATED - RESOLVED", async function () {
          beforeEach(async function () {
            buyerPercentBasisPoints = "5566"; // 55.66%

            // expected payoffs
            // buyer: (price + sellerDeposit + buyerEscalationDeposit)*buyerPercentage
            buyerPayoff =
              ((BigInt(order.price) + BigInt(offerPriceDiscovery.sellerDeposit)) * BigInt(buyerPercentBasisPoints)) /
              10000n;

            const sellerPercentBasisPoints = 10000n - BigInt(buyerPercentBasisPoints);

            sellerPayoff =
              (BigInt(offerPriceDiscovery.sellerDeposit) * (10000n - BigInt(buyerPercentBasisPoints))) / 10000n;

            const sellerPricePart = BigInt(order.price) - (BigInt(order.price) * sellerPercentBasisPoints) / 10000n;
            const sellerProtocolFeePart = (BigInt(priceDiscoveryProtocolFee) * sellerPercentBasisPoints) / 10000n;
            sellerPayoff2 = BigInt(order.price) - sellerPricePart - sellerProtocolFeePart;

            protocolPayoff = sellerProtocolFeePart;

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
            signature = await prepareDataSignature(
              buyer, // Assistant is the caller, seller should be the signer.
              customSignatureType,
              "Resolution",
              message,
              await disputeHandler.getAddress()
            );

            // Escalate the dispute
            await disputeHandler.connect(buyer).escalateDispute(exchangeId);
          });
          it("should emit a FundsReleased event", async function () {
            // Resolve the dispute, expecting event
            const tx = await disputeHandler
              .connect(assistant)
              .resolveDispute(exchangeId, buyerPercentBasisPoints, signature);

            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(
                exchangeId,
                seller.id,
                offerPriceDiscovery.exchangeToken,
                sellerPayoff,
                await assistant.getAddress()
              );

            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(
                exchangeId,
                seller.id,
                offerPriceDiscovery.exchangeToken,
                sellerPayoff2,
                await assistant.getAddress()
              );

            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(
                exchangeId,
                buyerId,
                offerPriceDiscovery.exchangeToken,
                buyerPayoff,
                await assistant.getAddress()
              );

            await expect(tx)
              .to.emit(disputeHandler, "ProtocolFeeCollected")
              .withArgs(exchangeId, offerPriceDiscovery.exchangeToken, protocolPayoff, await assistant.getAddress());
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", sellerDeposit),
              new Funds(ZeroAddress, "Native currency", `${2 * sellerDeposit}`),
            ]);
            expectedBuyerAvailableFunds = new FundsList([]);
            expectedProtocolAvailableFunds = new FundsList([]);
            expectedAgentAvailableFunds = new FundsList([]);
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

            // Resolve the dispute, so the funds are released
            await disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercentBasisPoints, signature);

            expectedSellerAvailableFunds.funds[0] = new Funds(
              await mockToken.getAddress(),
              "Foreign20",
              (BigInt(sellerDeposit) + BigInt(sellerPayoff) + BigInt(sellerPayoff2)).toString()
            );
            expectedBuyerAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", buyerPayoff),
            ]);
            expectedProtocolAvailableFunds.funds[0] = new Funds(
              await mockToken.getAddress(),
              "Foreign20",
              BigInt(protocolPayoff).toString()
            );
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
          });
        });

        context("Final state DISPUTED - ESCALATED - DECIDED", async function () {
          beforeEach(async function () {
            buyerPercentBasisPoints = "5566"; // 55.66%

            // expected payoffs
            // buyer: (price + sellerDeposit + buyerEscalationDeposit)*buyerPercentage
            buyerPayoff =
              ((BigInt(order.price) + BigInt(offerPriceDiscovery.sellerDeposit)) * BigInt(buyerPercentBasisPoints)) /
              10000n;

            const sellerPercentBasisPoints = 10000n - BigInt(buyerPercentBasisPoints);

            sellerPayoff =
              (BigInt(offerPriceDiscovery.sellerDeposit) * (10000n - BigInt(buyerPercentBasisPoints))) / 10000n;

            const sellerPricePart = BigInt(order.price) - (BigInt(order.price) * sellerPercentBasisPoints) / 10000n;
            const sellerProtocolFeePart = (BigInt(priceDiscoveryProtocolFee) * sellerPercentBasisPoints) / 10000n;
            sellerPayoff2 = BigInt(order.price) - sellerPricePart - sellerProtocolFeePart;

            protocolPayoff = sellerProtocolFeePart;

            // escalate the dispute
            await disputeHandler.connect(buyer).escalateDispute(exchangeId);
          });

          it("should emit a FundsReleased event", async function () {
            // Decide the dispute, expecting event
            const tx = await disputeHandler.connect(assistantDR).decideDispute(exchangeId, buyerPercentBasisPoints);

            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(
                exchangeId,
                seller.id,
                offerPriceDiscovery.exchangeToken,
                sellerPayoff,
                await assistantDR.getAddress()
              );

            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(
                exchangeId,
                seller.id,
                offerPriceDiscovery.exchangeToken,
                sellerPayoff2,
                await assistantDR.getAddress()
              );

            await expect(tx)
              .to.emit(disputeHandler, "FundsReleased")
              .withArgs(
                exchangeId,
                buyerId,
                offerPriceDiscovery.exchangeToken,
                buyerPayoff,
                await assistantDR.getAddress()
              );

            await expect(tx)
              .to.emit(disputeHandler, "ProtocolFeeCollected")
              .withArgs(exchangeId, offerPriceDiscovery.exchangeToken, protocolPayoff, await assistantDR.getAddress());
          });

          it("should update state", async function () {
            // Read on chain state
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

            // Chain state should match the expected available funds
            expectedSellerAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", sellerDeposit),
              new Funds(ZeroAddress, "Native currency", `${2 * sellerDeposit}`),
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

            expectedSellerAvailableFunds.funds[0] = new Funds(
              await mockToken.getAddress(),
              "Foreign20",
              (BigInt(sellerDeposit) + BigInt(sellerPayoff) + BigInt(sellerPayoff2)).toString()
            );
            expectedBuyerAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", buyerPayoff),
            ]);
            expectedProtocolAvailableFunds.funds[0] = new Funds(
              await mockToken.getAddress(),
              "Foreign20",
              BigInt(protocolPayoff).toString()
            );
            sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
            protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
            agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
            expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
            expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
            expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
            expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
          });
        });

        context(
          "Final state DISPUTED - ESCALATED - REFUSED via expireEscalatedDispute (fail to resolve)",
          async function () {
            beforeEach(async function () {
              // expected payoffs
              // buyer: price + buyerEscalationDeposit
              buyerPayoff = (BigInt(order.price) + BigInt(buyerEscalationDeposit)).toString();

              // seller: sellerDeposit
              sellerPayoff = offerPriceDiscovery.sellerDeposit;

              // protocol: 0
              protocolPayoff = 0;

              // Escalate the dispute
              tx = await disputeHandler.connect(buyer).escalateDispute(exchangeId);

              // Get the block timestamp of the confirmed tx and set escalatedDate
              blockNumber = tx.blockNumber;
              block = await provider.getBlock(blockNumber);
              escalatedDate = block.timestamp.toString();

              await setNextBlockTimestamp(Number(escalatedDate) + Number(disputeResolver.escalationResponsePeriod) + 1);
            });

            it("should emit a FundsReleased event", async function () {
              // Expire the dispute, expecting event
              const tx = await disputeHandler.connect(rando).expireEscalatedDispute(exchangeId);
              await expect(tx)
                .to.emit(disputeHandler, "FundsReleased")
                .withArgs(exchangeId, buyerId, offerPriceDiscovery.exchangeToken, buyerPayoff, rando.address);
              await expect(tx)
                .to.emit(disputeHandler, "FundsReleased")
                .withArgs(exchangeId, seller.id, offerPriceDiscovery.exchangeToken, sellerPayoff, rando.address);
              await expect(tx).to.not.emit(disputeHandler, "ProtocolFeeCollected");
            });

            it("should update state", async function () {
              // Read on chain state
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

              // Chain state should match the expected available funds
              expectedSellerAvailableFunds = new FundsList([
                new Funds(await mockToken.getAddress(), "Foreign20", sellerDeposit),
                new Funds(ZeroAddress, "Native currency", `${2 * sellerDeposit}`),
              ]);
              expectedBuyerAvailableFunds = new FundsList([]);
              expectedAgentAvailableFunds = new FundsList([]);
              expectedProtocolAvailableFunds = new FundsList([]);
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
              expectedBuyerAvailableFunds = new FundsList([
                new Funds(await mockToken.getAddress(), "Foreign20", buyerPayoff),
              ]);
              expectedSellerAvailableFunds.funds[0] = new Funds(
                await mockToken.getAddress(),
                "Foreign20",
                (BigInt(sellerDeposit) + BigInt(sellerPayoff)).toString()
              );
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
            });
          }
        );

        context(
          "Final state DISPUTED - ESCALATED - REFUSED via refuseEscalatedDispute (explicit refusal)",
          async function () {
            beforeEach(async function () {
              // expected payoffs
              // buyer: price + buyerEscalationDeposit
              buyerPayoff = (BigInt(order.price) + BigInt(buyerEscalationDeposit)).toString();

              // seller: sellerDeposit
              sellerPayoff = offerPriceDiscovery.sellerDeposit;

              // protocol: 0
              protocolPayoff = 0;

              // Escalate the dispute
              tx = await disputeHandler.connect(buyer).escalateDispute(exchangeId);
            });

            it("should emit a FundsReleased event", async function () {
              // Refuse the dispute, expecting event
              const tx = await disputeHandler.connect(assistantDR).refuseEscalatedDispute(exchangeId);

              await expect(tx)
                .to.emit(disputeHandler, "FundsReleased")
                .withArgs(
                  exchangeId,
                  seller.id,
                  offerPriceDiscovery.exchangeToken,
                  sellerPayoff,
                  await assistantDR.getAddress()
                );

              await expect(tx)
                .to.emit(disputeHandler, "FundsReleased")
                .withArgs(
                  exchangeId,
                  buyerId,
                  offerPriceDiscovery.exchangeToken,
                  buyerPayoff,
                  await assistantDR.getAddress()
                );

              await expect(tx).to.not.emit(disputeHandler, "ProtocolFeeCollected");

              //check that FundsReleased event was NOT emitted with  rando address
              const txReceipt = await tx.wait();
              const match = eventEmittedWithArgs(txReceipt, disputeHandler, "FundsReleased", [
                exchangeId,
                seller.id,
                offerPriceDiscovery.exchangeToken,
                sellerPayoff,
                rando.address,
              ]);
              expect(match).to.be.false;
            });

            it("should update state", async function () {
              // Read on chain state
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));

              // Chain state should match the expected available funds
              expectedSellerAvailableFunds = new FundsList([
                new Funds(await mockToken.getAddress(), "Foreign20", sellerDeposit),
                new Funds(ZeroAddress, "Native currency", `${2 * sellerDeposit}`),
              ]);
              expectedBuyerAvailableFunds = new FundsList([]);
              expectedProtocolAvailableFunds = new FundsList([]);
              expectedAgentAvailableFunds = new FundsList([]);
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);

              // Refuse the escalated dispute, so the funds are released
              await disputeHandler.connect(assistantDR).refuseEscalatedDispute(exchangeId);

              // Available funds should be increased for
              // buyer: price + buyerEscalationDeposit
              // seller: sellerDeposit; note that seller has sellerDeposit in availableFunds from before
              // protocol: 0
              // agent: 0
              expectedBuyerAvailableFunds = new FundsList([
                new Funds(await mockToken.getAddress(), "Foreign20", buyerPayoff),
              ]);
              expectedSellerAvailableFunds = new FundsList([
                new Funds(
                  await mockToken.getAddress(),
                  "Foreign20",
                  (BigInt(sellerDeposit) + BigInt(sellerPayoff)).toString()
                ),
                new Funds(ZeroAddress, "Native currency", `${2 * sellerDeposit}`),
              ]);
              sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(seller.id));
              buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(buyerId));
              protocolAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(protocolId));
              agentAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(agentId));
              expect(sellersAvailableFunds).to.eql(expectedSellerAvailableFunds);
              expect(buyerAvailableFunds).to.eql(expectedBuyerAvailableFunds);
              expect(protocolAvailableFunds).to.eql(expectedProtocolAvailableFunds);
              expect(agentAvailableFunds).to.eql(expectedAgentAvailableFunds);
            });
          }
        );
      });
    });
  });
});
