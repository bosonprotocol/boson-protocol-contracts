const { ethers } = require("hardhat");
const { expect } = require("chai");
const { ZeroAddress, getContractFactory, parseUnits, MaxUint256 } = ethers;
const { getSnapshot, revertToSnapshot, setupTestEnvironment, getEvent } = require("../../util/utils.js");
const { deployMockTokens } = require("../../../scripts/util/deploy-mock-tokens");
const {
  mockSeller,
  mockBuyer,
  mockOffer,
  mockAuthToken,
  accountId,
  mockVoucherInitValues,
} = require("../../util/mock");
const DisputeState = require("../../../scripts/domain/DisputeState.js");

const TWO_HOURS = 2 * 60 * 60;
const ONE_ETHER = parseUnits("1", "ether");
const TEN_ETHER = parseUnits("10", "ether");

describe("UMADisputeResolverAdapter", function () {
  let UMAAdapterFactory;
  let umaAdapter, mockUMAOracle, mockToken;
  let deployer, buyer, seller, treasuryWallet;
  let disputeHandler, exchangeHandler, exchangeCommitHandler, offerHandler, accountHandler, fundsHandler;
  let snapshotId;

  const challengePeriod = TWO_HOURS;
  const buyerPercent = 7500; // 75%
  const additionalInfo = "Product was damaged during shipping";

  let offer, sellerStruct, buyerStruct;
  let exchangeId, offerId, sellerId, buyerId;

  beforeEach(async function () {
    accountId.next(true);

    const contracts = {
      accountHandler: "IBosonAccountHandler",
      exchangeHandler: "IBosonExchangeHandler",
      exchangeCommitHandler: "IBosonExchangeCommitHandler",
      offerHandler: "IBosonOfferHandler",
      disputeHandler: "IBosonDisputeHandler",
      fundsHandler: "IBosonFundsHandler",
    };

    ({
      signers: [deployer, buyer, seller, treasuryWallet],
      contractInstances: {
        accountHandler,
        exchangeHandler,
        exchangeCommitHandler,
        offerHandler,
        disputeHandler,
        fundsHandler,
      },
    } = await setupTestEnvironment(contracts));

    // Deploy mock token for testing
    [mockToken] = await deployMockTokens(["Foreign20"]);
    await mockToken.mint(await buyer.getAddress(), TEN_ETHER);
    await mockToken.mint(await seller.getAddress(), TEN_ETHER);

    // Deploy mock UMA Oracle
    const MockUMAOracleFactory = await getContractFactory("MockOptimisticOracleV3");
    mockUMAOracle = await MockUMAOracleFactory.deploy();
    await mockUMAOracle.waitForDeployment();

    // Set minimum bond for our test token
    await mockUMAOracle.setMinimumBond(await mockToken.getAddress(), ONE_ETHER);

    // Deploy UMA Adapter (deployer will be the owner)
    UMAAdapterFactory = await getContractFactory("UMADisputeResolverAdapter");
    umaAdapter = await UMAAdapterFactory.connect(deployer).deploy(
      await accountHandler.getAddress(),
      await mockUMAOracle.getAddress(),
      challengePeriod
    );
    await umaAdapter.waitForDeployment();

    snapshotId = await getSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();
  });

  context("constructor", async function () {
    it("should deploy successfully with valid parameters", async function () {
      expect(await umaAdapter.BOSON_PROTOCOL()).to.equal(await accountHandler.getAddress());
      expect(await umaAdapter.UMA_ORACLE()).to.equal(await mockUMAOracle.getAddress());
      expect(await umaAdapter.challengePeriod()).to.equal(challengePeriod);
      expect(await umaAdapter.disputeResolverId()).to.equal(0);
      expect(await umaAdapter.isRegistered()).to.be.false;
    });

    context("💔 Revert Reasons", async function () {
      it("should revert if protocol address is zero", async function () {
        await expect(
          UMAAdapterFactory.connect(deployer).deploy(ZeroAddress, await mockUMAOracle.getAddress(), challengePeriod)
        ).to.be.revertedWithCustomError(umaAdapter, "InvalidProtocolAddress");
      });

      it("should revert if UMA oracle address is zero", async function () {
        await expect(
          UMAAdapterFactory.connect(deployer).deploy(await accountHandler.getAddress(), ZeroAddress, challengePeriod)
        ).to.be.revertedWithCustomError(umaAdapter, "InvalidUMAOracleAddress");
      });
    });
  });

  context("registerDisputeResolver", async function () {
    it("should register dispute resolver successfully", async function () {
      const disputeResolverFees = [
        {
          tokenAddress: await mockToken.getAddress(),
          tokenName: "MockToken",
          feeAmount: "0",
        },
      ];
      const sellerAllowList = [];

      expect(await umaAdapter.isRegistered()).to.be.false;
      expect(await umaAdapter.disputeResolverId()).to.equal(0);

      const tx = await umaAdapter
        .connect(deployer)
        .registerDisputeResolver(
          await treasuryWallet.getAddress(),
          "ipfs://uma-adapter-metadata",
          disputeResolverFees,
          sellerAllowList
        );

      await expect(tx).to.emit(umaAdapter, "DisputeResolverRegistered").withArgs(1);

      expect(await umaAdapter.isRegistered()).to.be.true;
      expect(await umaAdapter.disputeResolverId()).to.equal(1);

      const [exists, disputeResolver] = await umaAdapter.getDisputeResolver();
      expect(exists).to.be.true;
      expect(disputeResolver.id).to.equal(1);
      expect(disputeResolver.assistant).to.equal(await umaAdapter.getAddress());
      expect(disputeResolver.admin).to.equal(await umaAdapter.getAddress());
      expect(disputeResolver.treasury).to.equal(await treasuryWallet.getAddress());
      expect(disputeResolver.metadataUri).to.equal("ipfs://uma-adapter-metadata");
      expect(disputeResolver.escalationResponsePeriod).to.equal(challengePeriod);
      expect(disputeResolver.active).to.be.true;
    });

    context("💔 Revert Reasons", async function () {
      it("should revert if not called by owner", async function () {
        const disputeResolverFees = [];
        const sellerAllowList = [];

        await expect(
          umaAdapter
            .connect(buyer)
            .registerDisputeResolver(
              await treasuryWallet.getAddress(),
              "ipfs://metadata",
              disputeResolverFees,
              sellerAllowList
            )
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should revert if already registered", async function () {
        const disputeResolverFees = [];
        const sellerAllowList = [];

        // First registration
        await umaAdapter
          .connect(deployer)
          .registerDisputeResolver(
            await treasuryWallet.getAddress(),
            "ipfs://metadata",
            disputeResolverFees,
            sellerAllowList
          );

        // Second registration should fail
        await expect(
          umaAdapter
            .connect(deployer)
            .registerDisputeResolver(
              await treasuryWallet.getAddress(),
              "ipfs://metadata2",
              disputeResolverFees,
              sellerAllowList
            )
        ).to.be.revertedWithCustomError(umaAdapter, "AlreadyRegistered");
      });
    });
  });

  /**
   * Helper function to create a complete test setup with seller, buyer, offer, exchange and escalated dispute
   */
  async function createEscalatedDisputeSetup() {
    sellerStruct = mockSeller(
      await seller.getAddress(),
      await seller.getAddress(),
      ZeroAddress,
      await treasuryWallet.getAddress()
    );
    const voucherInitValues = mockVoucherInitValues();
    await accountHandler.connect(seller).createSeller(sellerStruct, mockAuthToken(), voucherInitValues);
    sellerId = sellerStruct.id;

    buyerStruct = mockBuyer(await buyer.getAddress());
    await accountHandler.connect(buyer).createBuyer(buyerStruct);
    buyerId = buyerStruct.id;

    const disputeResolverFees = [
      {
        tokenAddress: await mockToken.getAddress(),
        tokenName: "MockToken",
        feeAmount: "0",
      },
    ];
    const sellerAllowList = [];

    expect(await umaAdapter.isRegistered()).to.equal(false);
    const tx = await umaAdapter
      .connect(deployer)
      .registerDisputeResolver(
        await treasuryWallet.getAddress(),
        "ipfs://uma-adapter-metadata",
        disputeResolverFees,
        sellerAllowList
      );

    expect(tx).to.emit(umaAdapter, "DisputeResolverRegistered").withArgs(1);
    expect(await umaAdapter.isRegistered()).to.equal(true);

    const disputeResolverId = await umaAdapter.disputeResolverId();

    const mockOfferData = await mockOffer();
    offer = mockOfferData.offer;

    mockOfferData.offerDates.voucherRedeemableFrom = Math.floor(Date.now() / 1000) - 1; // 1 second ago

    offer.sellerId = sellerId;
    offer.exchangeToken = await mockToken.getAddress();

    await mockToken.connect(seller).approve(await accountHandler.getAddress(), offer.sellerDeposit);
    await fundsHandler.connect(seller).depositFunds(sellerId, await mockToken.getAddress(), offer.sellerDeposit);

    mockOfferData.drParams.disputeResolverId = disputeResolverId;

    await offerHandler.connect(seller).createOffer(
      mockOfferData.offer,
      mockOfferData.offerDates,
      mockOfferData.offerDurations,
      mockOfferData.drParams,
      "0", // agentId
      MaxUint256 // unlimited offeFeeLimit
    );
    offerId = offer.id;

    await mockToken.connect(buyer).approve(await accountHandler.getAddress(), offer.price);
    await exchangeCommitHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId);

    exchangeId = offerId;

    await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);
    await disputeHandler.connect(buyer).raiseDispute(exchangeId);

    await disputeHandler.connect(buyer).escalateDispute(exchangeId);

    return { exchangeId, offerId, sellerId, buyerId, disputeResolverId };
  }

  context("assertTruthForDispute", async function () {
    it("should create UMA assertion - resolve to true", async function () {
      const { exchangeId: testExchangeId } = await createEscalatedDisputeSetup();

      await mockToken.connect(buyer).approve(await umaAdapter.getAddress(), ONE_ETHER);

      const tx = await umaAdapter.connect(buyer).assertTruthForDispute(testExchangeId, buyerPercent, additionalInfo);

      await expect(tx).to.emit(umaAdapter, "DisputeEscalatedToUMA");

      const receipt = await tx.wait();
      const event = getEvent(receipt, UMAAdapterFactory, "DisputeEscalatedToUMA");
      const assertionId = event.assertionId;

      expect(await umaAdapter.assertionToExchange(assertionId)).to.equal(testExchangeId);
      expect(await umaAdapter.exchangeToAssertion(testExchangeId)).to.equal(assertionId);

      await mockUMAOracle.triggerResolvedCallback(await umaAdapter.getAddress(), assertionId, true);

      const [disputeExists, disputeState] = await disputeHandler.getDisputeState(testExchangeId);
      expect(disputeExists).to.be.true;
      expect(disputeState).to.equal(DisputeState.Decided);

      const [disputeExists2, disputeData] = await disputeHandler.getDispute(testExchangeId);
      expect(disputeExists2).to.be.true;
      expect(disputeData.buyerPercent).to.equal(buyerPercent);

      expect(await umaAdapter.assertionToExchange(assertionId)).to.equal(0);
      expect(await umaAdapter.exchangeToAssertion(testExchangeId)).to.equal(ethers.ZeroHash);
    });
    it("should create UMA assertion - resolve to false", async function () {
      const { exchangeId: testExchangeId } = await createEscalatedDisputeSetup();

      await mockToken.connect(buyer).approve(await umaAdapter.getAddress(), ONE_ETHER);

      const tx = await umaAdapter.connect(buyer).assertTruthForDispute(testExchangeId, buyerPercent, additionalInfo);

      await expect(tx).to.emit(umaAdapter, "DisputeEscalatedToUMA");

      // Get the assertion ID from the event
      const receipt = await tx.wait();
      const event = getEvent(receipt, UMAAdapterFactory, "DisputeEscalatedToUMA");
      const assertionId = event.assertionId;

      expect(await umaAdapter.assertionToExchange(assertionId)).to.equal(testExchangeId);
      expect(await umaAdapter.exchangeToAssertion(testExchangeId)).to.equal(assertionId);

      await mockUMAOracle.triggerResolvedCallback(await umaAdapter.getAddress(), assertionId, false);

      const [disputeExists, disputeState] = await disputeHandler.getDisputeState(testExchangeId);
      expect(disputeExists).to.be.true;
      expect(disputeState).to.equal(DisputeState.Decided);

      const [disputeExists2, disputeData] = await disputeHandler.getDispute(testExchangeId);
      expect(disputeExists2).to.be.true;
      expect(disputeData.buyerPercent).to.equal(0);

      expect(await umaAdapter.assertionToExchange(assertionId)).to.equal(0);
      expect(await umaAdapter.exchangeToAssertion(testExchangeId)).to.equal(ethers.ZeroHash);
    });

    context("💔 Revert Reasons", async function () {
      it("should revert if buyer percent is invalid (> 10000)", async function () {
        const { exchangeId: testExchangeId } = await createEscalatedDisputeSetup();

        await mockToken.connect(buyer).approve(await umaAdapter.getAddress(), ONE_ETHER);

        await expect(
          umaAdapter.connect(buyer).assertTruthForDispute(
            testExchangeId,
            10001, // Invalid: > 10000
            additionalInfo
          )
        ).to.be.revertedWithCustomError(umaAdapter, "InvalidBuyerPercent");
      });

      it("should revert if exchange does not exist", async function () {
        const invalidExchangeId = 999999;

        await expect(
          umaAdapter.connect(buyer).assertTruthForDispute(invalidExchangeId, buyerPercent, additionalInfo)
        ).to.be.revertedWithCustomError(umaAdapter, "InvalidExchangeId");
      });

      it("should revert if dispute is not escalated", async function () {
        const { exchangeId } = await createEscalatedDisputeSetup();

        await disputeHandler.connect(buyer).retractDispute(exchangeId);

        await expect(
          umaAdapter.connect(buyer).assertTruthForDispute(exchangeId, buyerPercent, additionalInfo)
        ).to.be.revertedWithCustomError(umaAdapter, "DisputeNotEscalated");
      });

      it("should revert if assertion already exists for exchange", async function () {
        const { exchangeId: testExchangeId } = await createEscalatedDisputeSetup();

        await mockToken.connect(buyer).approve(await umaAdapter.getAddress(), ONE_ETHER * 2n);

        await umaAdapter.connect(buyer).assertTruthForDispute(testExchangeId, buyerPercent, additionalInfo);

        // Second assertion should fail
        await expect(
          umaAdapter.connect(buyer).assertTruthForDispute(testExchangeId, buyerPercent, additionalInfo)
        ).to.be.revertedWithCustomError(umaAdapter, "AssertionAlreadyExists");
      });

      it("should revert if not assigned dispute resolver", async function () {
        // Create an escalated dispute setup but with different dispute resolver
        const { exchangeId: testExchangeId } = await createEscalatedDisputeSetup();

        // Create another UMA adapter with different ID
        const anotherUMAAdapter = await UMAAdapterFactory.connect(deployer).deploy(
          await accountHandler.getAddress(),
          await mockUMAOracle.getAddress(),
          challengePeriod
        );
        await anotherUMAAdapter.waitForDeployment();

        await mockToken.connect(buyer).approve(await anotherUMAAdapter.getAddress(), ONE_ETHER);

        await expect(
          anotherUMAAdapter.connect(buyer).assertTruthForDispute(testExchangeId, buyerPercent, additionalInfo)
        ).to.be.revertedWithCustomError(anotherUMAAdapter, "NotAssignedDisputeResolver");
      });
    });
  });

  context("assertionResolvedCallback", async function () {
    it("should handle resolved callback with true result", async function () {
      const { exchangeId: testExchangeId } = await createEscalatedDisputeSetup();

      await mockToken.connect(buyer).approve(await umaAdapter.getAddress(), ONE_ETHER);

      const tx = await umaAdapter.connect(buyer).assertTruthForDispute(testExchangeId, buyerPercent, additionalInfo);

      const receipt = await tx.wait();
      const event = getEvent(receipt, UMAAdapterFactory, "DisputeEscalatedToUMA");
      const assertionId = event.assertionId;

      expect(await umaAdapter.assertionToExchange(assertionId)).to.equal(testExchangeId);
      expect(await umaAdapter.exchangeToAssertion(testExchangeId)).to.equal(assertionId);

      const resolveTx = await mockUMAOracle.triggerResolvedCallback(await umaAdapter.getAddress(), assertionId, true);

      await expect(resolveTx).to.emit(umaAdapter, "UMAAssertionResolved").withArgs(assertionId, testExchangeId, true);

      const [disputeExists, disputeData] = await disputeHandler.getDispute(testExchangeId);
      expect(disputeExists).to.be.true;
      expect(disputeData.buyerPercent).to.equal(buyerPercent);

      expect(await umaAdapter.assertionToExchange(assertionId)).to.equal(0);
      expect(await umaAdapter.exchangeToAssertion(testExchangeId)).to.equal(ethers.ZeroHash);
    });

    it("should handle resolved callback with false result", async function () {
      const { exchangeId: testExchangeId } = await createEscalatedDisputeSetup();

      await mockToken.connect(buyer).approve(await umaAdapter.getAddress(), ONE_ETHER);

      const tx = await umaAdapter.connect(buyer).assertTruthForDispute(testExchangeId, buyerPercent, additionalInfo);

      const receipt = await tx.wait();
      const event = getEvent(receipt, UMAAdapterFactory, "DisputeEscalatedToUMA");
      const assertionId = event.assertionId;

      // Mock UMA oracle resolves assertion as false
      const resolveTx = await mockUMAOracle.triggerResolvedCallback(await umaAdapter.getAddress(), assertionId, false);

      await expect(resolveTx).to.emit(umaAdapter, "UMAAssertionResolved").withArgs(assertionId, testExchangeId, false);

      // Verify dispute was decided with 0% for buyer
      const [disputeExists, disputeData] = await disputeHandler.getDispute(testExchangeId);
      expect(disputeExists).to.be.true;
      expect(disputeData.buyerPercent).to.equal(0);

      expect(await umaAdapter.assertionToExchange(assertionId)).to.equal(0);
      expect(await umaAdapter.exchangeToAssertion(testExchangeId)).to.equal(ethers.ZeroHash);
    });

    context("💔 Revert Reasons", async function () {
      it("should revert if not called by UMA Oracle", async function () {
        const dummyAssertionId = ethers.randomBytes(32);

        await expect(
          umaAdapter.connect(buyer).assertionResolvedCallback(dummyAssertionId, true)
        ).to.be.revertedWithCustomError(umaAdapter, "OnlyUMAOracle");
      });

      it("should revert if assertion not found", async function () {
        const nonExistentAssertionId = ethers.randomBytes(32);

        await expect(
          mockUMAOracle.triggerResolvedCallback(await umaAdapter.getAddress(), nonExistentAssertionId, true)
        ).to.be.revertedWithCustomError(umaAdapter, "AssertionNotFound");
      });
    });
  });

  context("assertionDisputedCallback", async function () {
    it("should handle disputed callback for existing assertion", async function () {
      const { exchangeId: testExchangeId } = await createEscalatedDisputeSetup();

      await mockToken.connect(buyer).approve(await umaAdapter.getAddress(), ONE_ETHER);

      const tx = await umaAdapter.connect(buyer).assertTruthForDispute(testExchangeId, buyerPercent, additionalInfo);

      const receipt = await tx.wait();
      const event = getEvent(receipt, UMAAdapterFactory, "DisputeEscalatedToUMA");
      const assertionId = event.assertionId;

      const disputeTx = await mockUMAOracle.triggerDisputedCallback(await umaAdapter.getAddress(), assertionId);

      const disputeReceipt = await disputeTx.wait();
      const disputeEvent = getEvent(disputeReceipt, UMAAdapterFactory, "DisputeContested");
      expect(disputeEvent.exchangeId).to.equal(testExchangeId);
      expect(disputeEvent.assertionId).to.equal(assertionId);
      expect(disputeEvent.timestamp).to.be.greaterThan(0);
    });

    it("should handle disputed callback for non-existent assertion gracefully", async function () {
      const nonExistentAssertionId = ethers.randomBytes(32);
      const tx = await mockUMAOracle.triggerDisputedCallback(await umaAdapter.getAddress(), nonExistentAssertionId);

      const receipt = await tx.wait();
      expect(receipt.logs.length).to.equal(0); // No events should be emitted
    });

    context("💔 Revert Reasons", async function () {
      it("should revert if not called by UMA Oracle", async function () {
        const dummyAssertionId = ethers.randomBytes(32);

        await expect(
          umaAdapter.connect(buyer).assertionDisputedCallback(dummyAssertionId)
        ).to.be.revertedWithCustomError(umaAdapter, "OnlyUMAOracle");
      });
    });
  });

  context("addFeesToDisputeResolver and removeFeesFromDisputeResolver", async function () {
    beforeEach(async function () {
      const disputeResolverFees = [];
      const sellerAllowList = [];

      await umaAdapter
        .connect(deployer)
        .registerDisputeResolver(
          await treasuryWallet.getAddress(),
          "ipfs://metadata",
          disputeResolverFees,
          sellerAllowList
        );
    });

    it("should add fees to dispute resolver successfully", async function () {
      const newFees = [
        {
          tokenAddress: await mockToken.getAddress(),
          tokenName: "MockToken",
          feeAmount: parseUnits("10", "ether"),
        },
      ];

      const tx = await umaAdapter.connect(deployer).addFeesToDisputeResolver(newFees);
      expect(tx).to.emit(disputeHandler, "DisputeResolverFeesAdded").withArgs(1, newFees, deployer.address);
    });

    it("should remove fees from dispute resolver successfully", async function () {
      const feesToAdd = [
        {
          tokenAddress: await mockToken.getAddress(),
          tokenName: "MockToken",
          feeAmount: parseUnits("5", "ether"),
        },
      ];

      await umaAdapter.connect(deployer).addFeesToDisputeResolver(feesToAdd);

      let [, , fees] = await umaAdapter.getDisputeResolver();
      expect(fees.length).to.equal(1);

      const tokensToRemove = [await mockToken.getAddress()];
      await umaAdapter.connect(deployer).removeFeesFromDisputeResolver(tokensToRemove);

      [, , fees] = await umaAdapter.getDisputeResolver();
      expect(fees.length).to.equal(0);
    });

    context("💔 Revert Reasons", async function () {
      it("should revert addFeesToDisputeResolver if not called by owner", async function () {
        const newFees = [
          {
            tokenAddress: await mockToken.getAddress(),
            tokenName: "MockToken",
            feeAmount: parseUnits("10", "ether"),
          },
        ];

        await expect(umaAdapter.connect(buyer).addFeesToDisputeResolver(newFees)).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert addFeesToDisputeResolver if not registered", async function () {
        // Deploy a new unregistered adapter
        const newAdapter = await UMAAdapterFactory.connect(deployer).deploy(
          await accountHandler.getAddress(),
          await mockUMAOracle.getAddress(),
          challengePeriod
        );
        await newAdapter.waitForDeployment();

        const newFees = [
          {
            tokenAddress: await mockToken.getAddress(),
            tokenName: "MockToken",
            feeAmount: parseUnits("10", "ether"),
          },
        ];

        await expect(newAdapter.connect(deployer).addFeesToDisputeResolver(newFees)).to.be.revertedWithCustomError(
          newAdapter,
          "NotRegistered"
        );
      });

      it("should revert removeFeesFromDisputeResolver if not called by owner", async function () {
        const tokensToRemove = [await mockToken.getAddress()];

        await expect(umaAdapter.connect(buyer).removeFeesFromDisputeResolver(tokensToRemove)).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });

      it("should revert removeFeesFromDisputeResolver if not registered", async function () {
        const newAdapter = await UMAAdapterFactory.connect(deployer).deploy(
          await accountHandler.getAddress(),
          await mockUMAOracle.getAddress(),
          challengePeriod
        );
        await newAdapter.waitForDeployment();

        const tokensToRemove = [await mockToken.getAddress()];

        await expect(
          newAdapter.connect(deployer).removeFeesFromDisputeResolver(tokensToRemove)
        ).to.be.revertedWithCustomError(newAdapter, "NotRegistered");
      });
    });
  });

  context("setChallengePeriod", async function () {
    it("should set challenge period successfully", async function () {
      const newChallengePeriod = 4 * 60 * 60; // 4 hours

      expect(await umaAdapter.challengePeriod()).to.equal(challengePeriod);

      await umaAdapter.connect(deployer).setChallengePeriod(newChallengePeriod);

      expect(await umaAdapter.challengePeriod()).to.equal(newChallengePeriod);
    });

    context("💔 Revert Reasons", async function () {
      it("should revert if not called by owner", async function () {
        const newChallengePeriod = 4 * 60 * 60; // 4 hours

        await expect(umaAdapter.connect(buyer).setChallengePeriod(newChallengePeriod)).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });
  });
});
