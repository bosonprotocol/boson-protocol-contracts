const { ethers } = require("hardhat");
const { ZeroAddress, getSigners, provider, getContractAt, MaxUint256, parseUnits } = ethers;
const { assert, expect } = require("chai");

const Seller = require("../../scripts/domain/Seller");
const Offer = require("../../scripts/domain/Offer");
const OfferDates = require("../../scripts/domain/OfferDates");
const OfferDurations = require("../../scripts/domain/OfferDurations");
const PriceType = require("../../scripts/domain/PriceType.js");
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
const Range = require("../../scripts/domain/Range");
const { RoyaltyRecipientInfo, RoyaltyRecipientInfoList } = require("../../scripts/domain/RoyaltyRecipientInfo.js");
const { RoyaltyInfo } = require("../../scripts/domain/RoyaltyInfo");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const {
  getEvent,
  applyPercentage,
  compareOfferStructs,
  compareRoyaltyRecipientInfoLists,
  calculateCloneAddress,
  calculateBosonProxyAddress,
  setupTestEnvironment,
  getSnapshot,
  revertToSnapshot,
} = require("../util/utils.js");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const { oneWeek, oneMonth, VOUCHER_NAME, VOUCHER_SYMBOL } = require("../util/constants");
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
} = require("../util/mock");
const { setNextBlockTimestamp, deriveTokenId } = require("../util/utils");
const Dispute = require("../../scripts/domain/Dispute");
const DisputeState = require("../../scripts/domain/DisputeState");
const DisputeDates = require("../../scripts/domain/DisputeDates");

/**
 *  Test the Boson Orchestration Handler interface
 */
describe("IBosonOrchestrationHandler", function () {
  // Common vars
  let InterfaceIds;
  let deployer,
    pauser,
    buyer,
    admin,
    rando,
    assistant,
    clerk,
    treasury,
    other1,
    other2,
    assistantDR,
    adminDR,
    clerkDR,
    treasuryDR;
  let erc165,
    accountHandler,
    offerHandler,
    exchangeHandler,
    groupHandler,
    twinHandler,
    bundleHandler,
    disputeHandler,
    fundsHandler,
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
  let buyerEscalationDepositNative, buyerEscalationDepositToken;
  let price, quantityAvailable, sellerDeposit, voucherRedeemableFrom;
  let disputePeriod, escalationPeriod;
  let buyerId, exchangeId, disputeResolverId;
  let blockNumber, block, disputedDate, timeout, dispute, disputeDates;
  let disputeStruct, disputeDatesStruct;
  let returnedDispute, returnedDisputeDates;
  let newTime, voucherStruct, escalatedDate, response;
  let protocolDiamondAddress;
  let snapshotId;
  let beaconProxyAddress;
  let offerFeeLimit;
  let bosonErrors;

  before(async function () {
    // Reset the accountId iterator
    accountId.next(true);

    // get interface Ids
    InterfaceIds = await getInterfaceIds();

    // Deploy the mock tokens
    [bosonToken, foreign721, foreign1155, fallbackError] = await deployMockTokens();

    // Specify contracts needed for this test
    const contracts = {
      erc165: "ERC165Facet",
      accountHandler: "IBosonAccountHandler",
      groupHandler: "IBosonGroupHandler",
      twinHandler: "IBosonTwinHandler",
      bundleHandler: "IBosonBundleHandler",
      offerHandler: "IBosonOfferHandler",
      exchangeHandler: "IBosonExchangeHandler",
      fundsHandler: "IBosonFundsHandler",
      disputeHandler: "IBosonDisputeHandler",
      orchestrationHandler: "IBosonOrchestrationHandler",
      configHandler: "IBosonConfigHandler",
      pauseHandler: "IBosonPauseHandler",
    };

    ({
      signers: [pauser, admin, treasury, buyer, rando, other1, other2, adminDR, treasuryDR],
      contractInstances: {
        erc165,
        accountHandler,
        groupHandler,
        twinHandler,
        bundleHandler,
        offerHandler,
        exchangeHandler,
        fundsHandler,
        disputeHandler,
        orchestrationHandler,
        configHandler,
        pauseHandler,
      },
      protocolConfig: [, , protocolFeePercentage, protocolFeeFlatBoson, buyerEscalationDepositPercentage],
      diamondAddress: protocolDiamondAddress,
    } = await setupTestEnvironment(contracts, { bosonTokenAddress: await bosonToken.getAddress() }));

    bosonErrors = await getContractAt("BosonErrors", protocolDiamondAddress);

    // make all account the same
    assistant = admin;
    assistantDR = adminDR;
    clerk = clerkDR = { address: ZeroAddress };

    [deployer] = await getSigners();

    // Get the beacon proxy address
    beaconProxyAddress = await calculateBosonProxyAddress(await configHandler.getAddress());

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
        await assistantDR.getAddress(),
        await adminDR.getAddress(),
        clerkDR.address,
        await treasuryDR.getAddress(),
        true
      );
      expect(disputeResolver.isValid()).is.true;
      disputeResolverId = disputeResolver.id;

      // Create DisputeResolverFee array so offer creation will succeed
      DRFeeNative = "0";
      DRFeeToken = "0";
      disputeResolverFees = [
        new DisputeResolverFee(ZeroAddress, "Native", DRFeeNative),
        new DisputeResolverFee(await bosonToken.getAddress(), "Boson", DRFeeToken),
      ];

      // Make empty seller list, so every seller is allowed
      sellerAllowList = [];

      // Register the dispute resolver
      await accountHandler
        .connect(adminDR)
        .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

      // Create a valid seller, then set fields in tests directly
      seller = mockSeller(
        await assistant.getAddress(),
        await assistant.getAddress(),
        clerk.address,
        await treasury.getAddress()
      );
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

      // deploy mock auth token and mint one to assistant
      const [mockAuthERC721Contract] = await deployMockTokens(["Foreign721"]);
      await configHandler
        .connect(deployer)
        .setAuthTokenContract(AuthTokenType.Lens, await mockAuthERC721Contract.getAddress());
      await mockAuthERC721Contract.connect(assistant).mint(authToken.tokenId, 1);

      // The first offer id
      nextOfferId = "1";

      // Mock offer, offerDates and offerDurations
      ({ offer, offerDates, offerDurations, offerFees } = await mockOffer());
      offer.sellerId = seller.id;

      // Check if domains are valid
      expect(offer.isValid()).is.true;
      expect(offerDates.isValid()).is.true;
      expect(offerDurations.isValid()).is.true;

      // Set domains transformed into struct
      offerStruct = offer.toStruct();
      offerDatesStruct = offerDates.toStruct();
      offerDurationsStruct = offerDurations.toStruct();

      // Set dispute resolution terms
      disputeResolutionTerms = new DisputeResolutionTerms(
        disputeResolver.id,
        disputeResolver.escalationResponsePeriod,
        DRFeeNative,
        applyPercentage(DRFeeNative, buyerEscalationDepositPercentage),
        ZeroAddress
      );
      disputeResolutionTermsStruct = disputeResolutionTerms.toStruct();

      // Offer fees
      offerFeesStruct = offerFees.toStruct();

      // Set agent id as zero as it is optional for create Offer.
      agentId = "0";
      offerFeeLimit = MaxUint256; // unlimited offer fee to not affect the tests
    });

    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    context("👉 raiseAndEscalateDispute()", async function () {
      async function createDisputeExchangeWithToken() {
        // utility function that deploys a mock token, creates a offer with it and creates an exchange
        // deploy a mock token
        const [mockToken] = await deployMockTokens(["Foreign20"]);

        // add to DR fees
        DRFeeToken = "0";
        await accountHandler
          .connect(adminDR)
          .addFeesToDisputeResolver(disputeResolverId, [
            new DisputeResolverFee(await mockToken.getAddress(), "MockToken", DRFeeToken),
          ]);

        // create an offer with a mock token contract
        offer.exchangeToken = await mockToken.getAddress();
        offer.sellerDeposit = offer.price = offer.buyerCancelPenalty = "0";
        offer.id++;

        // create an offer with erc20 exchange token
        await offerHandler
          .connect(assistant)
          .createOffer(offer, offerDates, offerDurations, {
            disputeResolverId: disputeResolverId,
            mutualizerAddress: ZeroAddress
          }, agentId, offerFeeLimit);

        // mint tokens to buyer and approve the protocol
        buyerEscalationDepositToken = applyPercentage(DRFeeToken, buyerEscalationDepositPercentage);
        await mockToken.mint(await buyer.getAddress(), buyerEscalationDepositToken);
        await mockToken.connect(buyer).approve(protocolDiamondAddress, buyerEscalationDepositToken);

        // Commit to offer and put exchange all the way to dispute
        await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offer.id);
        await exchangeHandler.connect(buyer).redeemVoucher(++exchangeId);

        return mockToken;
      }

      beforeEach(async function () {
        // Create the seller and offer
        await orchestrationHandler
          .connect(assistant)
          .createSellerAndOffer(
            seller,
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            emptyAuthToken,
            voucherInitValues,
            agentId,
            offerFeeLimit
          );

        // buyer escalation deposit used in multiple tests
        buyerEscalationDepositNative = applyPercentage(DRFeeNative, buyerEscalationDepositPercentage);

        // Set used variables
        price = offer.price;
        quantityAvailable = offer.quantityAvailable;
        sellerDeposit = offer.sellerDeposit;
        voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
        disputePeriod = offerDurations.disputePeriod;
        escalationPeriod = disputeResolver.escalationResponsePeriod;

        // Deposit seller funds so the commit will succeed
        const fundsToDeposit = BigInt(sellerDeposit) * BigInt(quantityAvailable);
        await fundsHandler
          .connect(assistant)
          .depositFunds(seller.id, ZeroAddress, fundsToDeposit, { value: fundsToDeposit });

        buyerId = accountId.next().value;

        exchangeId = "1";

        // Commit to offer, creating a new exchange
        await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), nextOfferId, { value: price });

        // Set time forward to the offer's voucherRedeemableFrom
        await setNextBlockTimestamp(Number(voucherRedeemableFrom));

        // Redeem voucher
        await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);
      });

      it("should emit a DisputeRaised event", async function () {
        // Raise and Escalate a dispute, testing for the event
        await expect(
          orchestrationHandler
            .connect(buyer)
            .raiseAndEscalateDispute(exchangeId, { value: buyerEscalationDepositNative })
        )
          .to.emit(disputeHandler, "DisputeRaised")
          .withArgs(exchangeId, buyerId, seller.id, await buyer.getAddress());
      });

      it("should emit FundsEncumbered and DisputeEscalated event", async function () {
        // Raise and Escalate a dispute, testing for the events
        const tx = await orchestrationHandler
          .connect(buyer)
          .raiseAndEscalateDispute(exchangeId, { value: buyerEscalationDepositNative });

        await expect(tx)
          .to.emit(disputeHandler, "FundsEncumbered")
          .withArgs(buyerId, ZeroAddress, buyerEscalationDepositNative, await buyer.getAddress());

        await expect(tx)
          .to.emit(disputeHandler, "DisputeEscalated")
          .withArgs(exchangeId, disputeResolverId, await buyer.getAddress());
      });

      it("should update state", async function () {
        // Protocol balance before
        const escrowBalanceBefore = await provider.getBalance(protocolDiamondAddress);

        // Raise and escalate the dispute
        tx = await orchestrationHandler
          .connect(buyer)
          .raiseAndEscalateDispute(exchangeId, { value: buyerEscalationDepositNative });

        // Get the block timestamp of the confirmed tx and set escalatedDate
        blockNumber = tx.blockNumber;
        block = await provider.getBlock(blockNumber);
        disputedDate = escalatedDate = block.timestamp.toString();
        timeout = (BigInt(escalatedDate) + BigInt(escalationPeriod)).toString();

        dispute = new Dispute(exchangeId, DisputeState.Escalated, "0");
        disputeDates = new DisputeDates(disputedDate, escalatedDate, "0", timeout);

        // Get the dispute as a struct
        [, disputeStruct, disputeDatesStruct] = await disputeHandler.connect(rando).getDispute(exchangeId);

        // Parse into entities
        returnedDispute = Dispute.fromStruct(disputeStruct);
        returnedDisputeDates = DisputeDates.fromStruct(disputeDatesStruct);

        // Returned values should match the expected dispute and dispute dates
        for (const [key, value] of Object.entries(dispute)) {
          expect(JSON.stringify(returnedDispute[key]) === JSON.stringify(value)).is.true;
        }

        for (const [key, value] of Object.entries(disputeDates)) {
          expect(JSON.stringify(returnedDisputeDates[key]) === JSON.stringify(value)).is.true;
        }

        // Get the dispute state
        [exists, response] = await disputeHandler.connect(rando).getDisputeState(exchangeId);

        // It should match DisputeState.Escalated
        assert.equal(response, DisputeState.Escalated, "Dispute state is incorrect");

        // Protocol balance should increase for buyer escalation deposit
        const escrowBalanceAfter = await provider.getBalance(protocolDiamondAddress);
        expect(escrowBalanceAfter - escrowBalanceBefore).to.equal(
          buyerEscalationDepositNative,
          "Escrow balance mismatch"
        );
      });

      it("should be possible to pay escalation deposit in ERC20 token", async function () {
        const mockToken = await createDisputeExchangeWithToken();

        // Protocol balance before
        const escrowBalanceBefore = await mockToken.balanceOf(protocolDiamondAddress);

        // Escalate the dispute, testing for the events
        const tx = await orchestrationHandler.connect(buyer).raiseAndEscalateDispute(exchangeId);

        await expect(tx)
          .to.emit(disputeHandler, "FundsEncumbered")
          .withArgs(buyerId, await mockToken.getAddress(), buyerEscalationDepositToken, await buyer.getAddress());

        await expect(tx)
          .to.emit(disputeHandler, "DisputeEscalated")
          .withArgs(exchangeId, disputeResolverId, await buyer.getAddress());

        // Protocol balance should increase for buyer escalation deposit
        const escrowBalanceAfter = await mockToken.balanceOf(protocolDiamondAddress);
        expect(escrowBalanceAfter - escrowBalanceBefore).to.equal(
          buyerEscalationDepositToken,
          "Escrow balance mismatch"
        );
      });

      context("💔 Revert Reasons", async function () {
        /*
         * Reverts if:
         * - The disputes region of protocol is paused
         * - Caller is not the buyer for the given exchange id
         * - Exchange does not exist
         * - Exchange is not in a Redeemed state
         * - Dispute period has elapsed already
         * - Dispute resolver is not specified (absolute zero offer)
         * - Offer price is in native token and caller does not send enough
         * - Offer price is in some ERC20 token and caller also sends native currency
         * - If contract at token address does not support ERC20 function transferFrom
         * - If calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
         * - Received ERC20 token amount differs from the expected value
         */
        it("The orchestration region of protocol is paused", async function () {
          // Pause the orchestration region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Orchestration]);

          // Attempt to raise a dispute, expecting revert
          await expect(
            orchestrationHandler
              .connect(buyer)
              .raiseAndEscalateDispute(exchangeId, { value: buyerEscalationDepositNative })
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Orchestration);
        });

        it("The disputes region of protocol is paused", async function () {
          // Pause the disputes region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Disputes]);

          // Attempt to raise a dispute, expecting revert
          await expect(
            orchestrationHandler
              .connect(buyer)
              .raiseAndEscalateDispute(exchangeId, { value: buyerEscalationDepositNative })
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Disputes);
        });

        it("Caller is not the buyer for the given exchange id", async function () {
          // Attempt to raise and escalate the dispute, expecting revert
          await expect(
            orchestrationHandler
              .connect(rando)
              .raiseAndEscalateDispute(exchangeId, { value: buyerEscalationDepositNative })
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_VOUCHER_HOLDER);
        });

        it("Exchange id does not exist", async function () {
          // An invalid exchange id
          const exchangeId = "666";

          // Attempt to raise a dispute, expecting revert
          await expect(
            orchestrationHandler
              .connect(buyer)
              .raiseAndEscalateDispute(exchangeId, { value: buyerEscalationDepositNative })
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_EXCHANGE);
        });

        it("exchange is not in a redeemed state - completed", async function () {
          const blockNumber = await provider.getBlockNumber();
          const block = await provider.getBlock(blockNumber);
          const currentTime = block.timestamp;

          // Set time forward to run out the dispute period
          newTime = Number((voucherRedeemableFrom + Number(disputePeriod) + 1).toString().substring(0, 11));

          if (newTime <= currentTime) {
            newTime += currentTime;
          }

          await setNextBlockTimestamp(newTime);

          // Complete exchange
          await exchangeHandler.connect(assistant).completeExchange(exchangeId);

          // Attempt to raise a dispute, expecting revert
          await expect(
            orchestrationHandler
              .connect(buyer)
              .raiseAndEscalateDispute(exchangeId, { value: buyerEscalationDepositNative })
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_STATE);
        });

        it("exchange is not in a redeemed state - disputed already", async function () {
          // Raise a dispute, put it into DISPUTED state
          await orchestrationHandler.connect(buyer).raiseAndEscalateDispute(exchangeId);

          // Attempt to raise a dispute, expecting revert
          await expect(
            orchestrationHandler
              .connect(buyer)
              .raiseAndEscalateDispute(exchangeId, { value: buyerEscalationDepositNative })
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_STATE);
        });

        it("The dispute period has already elapsed", async function () {
          // Get the redemption date
          [, , voucherStruct] = await exchangeHandler.connect(rando).getExchange(exchangeId);
          const voucherRedeemedDate = voucherStruct.redeemedDate;

          // Set time forward past the dispute period
          await setNextBlockTimestamp(Number(voucherRedeemedDate + BigInt(disputePeriod) + 1n));

          // Attempt to raise a dispute, expecting revert
          await expect(
            orchestrationHandler
              .connect(buyer)
              .raiseAndEscalateDispute(exchangeId, { value: buyerEscalationDepositNative })
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.DISPUTE_PERIOD_HAS_ELAPSED);
        });
      });
    });

    context("👉 createSellerAndOffer()", async function () {
      it("should emit a SellerCreated and OfferCreated events with empty auth token", async function () {
        // Create a seller and an offer, testing for the event
        tx = await orchestrationHandler
          .connect(assistant)
          .createSellerAndOffer(
            seller,
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            emptyAuthToken,
            voucherInitValues,
            agentId,
            offerFeeLimit
          );

        expectedCloneAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          admin.address
        );

        await expect(tx)
          .to.emit(orchestrationHandler, "SellerCreated")
          .withArgs(seller.id, sellerStruct, expectedCloneAddress, emptyAuthTokenStruct, await assistant.getAddress());
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            offer.sellerId,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );

        const expectedRoyaltyRecipientInfoList = new RoyaltyRecipientInfoList([
          new RoyaltyRecipientInfo(ZeroAddress, voucherInitValues.royaltyPercentage),
        ]);

        await expect(tx)
          .to.emit(accountHandler, "RoyaltyRecipientsChanged")
          .withArgs(
            seller.id,
            compareRoyaltyRecipientInfoLists.bind(expectedRoyaltyRecipientInfoList.toStruct()),
            assistant.address
          );

        // Voucher clone contract
        bosonVoucher = await getContractAt("IBosonVoucher", expectedCloneAddress);

        await expect(tx).to.emit(bosonVoucher, "ContractURIChanged").withArgs(contractURI);

        bosonVoucher = await getContractAt("OwnableUpgradeable", expectedCloneAddress);

        await expect(tx)
          .to.emit(bosonVoucher, "OwnershipTransferred")
          .withArgs(ZeroAddress, await assistant.getAddress());
      });

      it("should emit a SellerCreated and OfferCreated events with auth token", async function () {
        seller.admin = ZeroAddress;
        sellerStruct = seller.toStruct();

        // Create a seller and an offer, testing for the event
        tx = await orchestrationHandler
          .connect(assistant)
          .createSellerAndOffer(
            seller,
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            authToken,
            voucherInitValues,
            agentId,
            offerFeeLimit
          );

        expectedCloneAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          admin.address
        );

        await expect(tx)
          .to.emit(orchestrationHandler, "SellerCreated")
          .withArgs(seller.id, sellerStruct, expectedCloneAddress, authTokenStruct, await assistant.getAddress());

        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            offer.sellerId,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );

        const expectedRoyaltyRecipientInfoList = new RoyaltyRecipientInfoList([
          new RoyaltyRecipientInfo(ZeroAddress, voucherInitValues.royaltyPercentage),
        ]);

        await expect(tx)
          .to.emit(accountHandler, "RoyaltyRecipientsChanged")
          .withArgs(
            seller.id,
            compareRoyaltyRecipientInfoLists.bind(expectedRoyaltyRecipientInfoList.toStruct()),
            assistant.address
          );

        // Voucher clone contract
        bosonVoucher = await getContractAt("IBosonVoucher", expectedCloneAddress);

        await expect(tx).to.emit(bosonVoucher, "ContractURIChanged").withArgs(contractURI);

        bosonVoucher = await getContractAt("OwnableUpgradeable", expectedCloneAddress);

        await expect(tx)
          .to.emit(bosonVoucher, "OwnershipTransferred")
          .withArgs(ZeroAddress, await assistant.getAddress());
      });

      it("should emit a SellerCreated and OfferCreated events when offer type is discovery and the price is not set to zero", async function () {
        // Set offer type to discovery
        offer.priceType = PriceType.Discovery;

        // Attempt to create a seller and an offer, expecting revert

        tx = orchestrationHandler
          .connect(assistant)
          .createSellerAndOffer(
            seller,
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            emptyAuthToken,
            voucherInitValues,
            agentId,
            offerFeeLimit
          );
        await expect(tx).to.emit(orchestrationHandler, "OfferCreated");
        await expect(tx).to.emit(orchestrationHandler, "SellerCreated");
      });

      it("should update state", async function () {
        seller.admin = ZeroAddress;
        sellerStruct = seller.toStruct();

        // Create a seller and an offer
        await orchestrationHandler
          .connect(assistant)
          .createSellerAndOffer(
            seller,
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            authToken,
            voucherInitValues,
            agentId,
            offerFeeLimit
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

        // Get the collections information
        expectedCloneAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          admin.address
        );
        const [defaultVoucherAddress, additionalCollections] = await accountHandler
          .connect(rando)
          .getSellersCollections(seller.id);
        expect(defaultVoucherAddress).to.equal(expectedCloneAddress, "Wrong default voucher address");
        expect(additionalCollections.length).to.equal(0, "Wrong number of additional collections");

        // Voucher clone contract
        bosonVoucher = await ethers.getContractAt("OwnableUpgradeable", expectedCloneAddress);

        expect(await bosonVoucher.owner()).to.equal(await assistant.getAddress(), "Wrong voucher clone owner");

        bosonVoucher = await getContractAt("IBosonVoucher", expectedCloneAddress);
        expect(await bosonVoucher.contractURI()).to.equal(contractURI, "Wrong contract URI");
        expect(await bosonVoucher.name()).to.equal(
          VOUCHER_NAME + " S" + seller.id + "_C0",
          "Wrong voucher client name"
        );
        expect(await bosonVoucher.symbol()).to.equal(
          VOUCHER_SYMBOL + "_S" + seller.id + "_C0",
          "Wrong voucher client symbol"
        );
      });

      it("should update state when voucherInitValues has zero royaltyPercentage and exchangeId does not exist", async function () {
        seller.admin = ZeroAddress;

        // ERC2981 Royalty fee is 0%
        voucherInitValues.royaltyPercentage = "0"; //0%
        expect(voucherInitValues.isValid()).is.true;
        offer.royaltyInfo = [new RoyaltyInfo([ZeroAddress], [voucherInitValues.royaltyPercentage])];

        // Create a seller and an offer
        await orchestrationHandler
          .connect(assistant)
          .createSellerAndOffer(
            seller,
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            authToken,
            voucherInitValues,
            agentId,
            offerFeeLimit
          );

        // Get the collections information
        expectedCloneAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          admin.address
        );
        const [defaultVoucherAddress, additionalCollections] = await accountHandler
          .connect(rando)
          .getSellersCollections(seller.id);
        expect(defaultVoucherAddress).to.equal(expectedCloneAddress, "Wrong default voucher address");
        expect(additionalCollections.length).to.equal(0, "Wrong number of additional collections");

        bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);
        expect(await bosonVoucher.contractURI()).to.equal(contractURI, "Wrong contract URI");
        expect(await bosonVoucher.name()).to.equal(
          VOUCHER_NAME + " S" + seller.id + "_C0",
          "Wrong voucher client name"
        );
        expect(await bosonVoucher.symbol()).to.equal(
          VOUCHER_SYMBOL + "_S" + seller.id + "_C0",
          "Wrong voucher client symbol"
        );

        // Prepare random parameters
        let exchangeId = "1234"; // An exchange id that does not exist
        let offerPrice = "1234567"; // A random offer price

        //Exchange exists
        let exists;
        [exists] = await exchangeHandler.connect(rando).getExchangeState(exchangeId);
        expect(exists).to.be.false;

        // Get Royalty Information for Exchange id i.e. Voucher token id
        let receiver, royaltyAmount;
        [receiver, royaltyAmount] = await bosonVoucher.connect(assistant).royaltyInfo(exchangeId, offerPrice);

        // Expectations
        let expectedRecipient = ZeroAddress; //expect zero address when exchange id does not exist
        let expectedRoyaltyAmount = "0"; // Zero Fee when exchange id does not exist

        assert.equal(receiver, expectedRecipient, "Recipient address is incorrect");
        assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");
      });

      it("should update state when voucherInitValues has non zero royaltyPercentage and exchangeId does not exist", async function () {
        seller.admin = ZeroAddress;

        // ERC2981 Royalty fee is 10%
        voucherInitValues.royaltyPercentage = "1000"; //10%
        expect(voucherInitValues.isValid()).is.true;
        offer.royaltyInfo = [new RoyaltyInfo([ZeroAddress], [voucherInitValues.royaltyPercentage])];

        // Create a seller and an offer
        await orchestrationHandler
          .connect(assistant)
          .createSellerAndOffer(
            seller,
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            authToken,
            voucherInitValues,
            agentId,
            offerFeeLimit
          );

        // Get the collections information
        expectedCloneAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          admin.address
        );
        const [defaultVoucherAddress, additionalCollections] = await accountHandler
          .connect(rando)
          .getSellersCollections(seller.id);
        expect(defaultVoucherAddress).to.equal(expectedCloneAddress, "Wrong default voucher address");
        expect(additionalCollections.length).to.equal(0, "Wrong number of additional collections");

        bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);
        expect(await bosonVoucher.contractURI()).to.equal(contractURI, "Wrong contract URI");
        expect(await bosonVoucher.name()).to.equal(
          VOUCHER_NAME + " S" + seller.id + "_C0",
          "Wrong voucher client name"
        );
        expect(await bosonVoucher.symbol()).to.equal(
          VOUCHER_SYMBOL + "_S" + seller.id + "_C0",
          "Wrong voucher client symbol"
        );

        // Prepare random parameters
        let exchangeId = "1234"; // An exchange id that does not exist
        let offerPrice = "1234567"; // A random offer price

        //Exchange exists
        let exists;
        [exists] = await exchangeHandler.connect(rando).getExchangeState(exchangeId);
        expect(exists).to.be.false;

        // Get Royalty Information for Exchange id i.e. Voucher token id
        let receiver, royaltyAmount;
        [receiver, royaltyAmount] = await bosonVoucher.connect(assistant).royaltyInfo(exchangeId, offerPrice);

        // Expectations
        let expectedRecipient = ZeroAddress; //expect zero address when exchange id does not exist
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
          .connect(assistant)
          .createSellerAndOffer(
            seller,
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            emptyAuthToken,
            voucherInitValues,
            agentId,
            offerFeeLimit
          );

        await expect(tx)
          .to.emit(orchestrationHandler, "SellerCreated")
          .withArgs(
            sellerId,
            sellerStruct,
            calculateCloneAddress(await accountHandler.getAddress(), beaconProxyAddress, admin.address),
            emptyAuthTokenStruct,
            await assistant.getAddress()
          );

        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            offer.sellerId,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
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
            .connect(assistant)
            .createSellerAndOffer(
              seller,
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              emptyAuthToken,
              voucherInitValues,
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );
      });

      it("should ignore any provided protocol fee and calculate the correct one", async function () {
        // set some protocole fee
        offer.protocolFee = "999";

        // Create a seller and an offer, testing for the event
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createSellerAndOffer(
              seller,
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              emptyAuthToken,
              voucherInitValues,
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );
      });

      it("If exchange token is $BOSON, fee should be flat boson fee", async function () {
        // Prepare an offer with $BOSON as exchange token
        offer.exchangeToken = await bosonToken.getAddress();
        disputeResolutionTermsStruct = new DisputeResolutionTerms(
          disputeResolver.id,
          disputeResolver.escalationResponsePeriod,
          DRFeeToken,
          applyPercentage(DRFeeToken, buyerEscalationDepositPercentage),
          ZeroAddress
        ).toStruct();
        offerFees.protocolFee = protocolFeeFlatBoson;
        offerFeesStruct = offerFees.toStruct();

        // Create a seller and an offer, testing for the event
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createSellerAndOffer(
              seller,
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              emptyAuthToken,
              voucherInitValues,
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offer.toStruct()),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );
      });

      it("For absolute zero offers, dispute resolver can be unspecified", async function () {
        // Prepare an absolute zero offer
        offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = offerFees.protocolFee = "0";
        disputeResolver.id = "0";
        disputeResolutionTermsStruct = new DisputeResolutionTerms("0", "0", "0", "0", ZeroAddress).toStruct();
        offerFeesStruct = offerFees.toStruct();

        // Create a seller and an offer, testing for the event
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createSellerAndOffer(
              seller,
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              emptyAuthToken,
              voucherInitValues,
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offer.toStruct()),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );
      });

      it("Should allow creation of an offer with unlimited supply", async function () {
        // Prepare an offer with unlimited supply
        offer.quantityAvailable = MaxUint256.toString();

        // Create a seller and an offer, testing for the event
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createSellerAndOffer(
              seller,
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              emptyAuthToken,
              voucherInitValues,
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offer.toStruct()),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );
      });

      it("Should use the correct dispute resolver fee", async function () {
        // Create an offer in native currency
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createSellerAndOffer(
              seller,
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              emptyAuthToken,
              voucherInitValues,
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            offer.id,
            seller.id,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );

        // create another offer, now with bosonToken as exchange token
        seller = mockSeller(await rando.getAddress(), await rando.getAddress(), ZeroAddress, await rando.getAddress());
        contractURI = `https://ipfs.io/ipfs/QmW2WQi7j6c7UgJTarActp7tDNikE4B2qXtFCfLPdsgaTQ`;
        offer.exchangeToken = await bosonToken.getAddress();
        offer.id = "2";
        offer.sellerId = seller.id;
        disputeResolutionTermsStruct = new DisputeResolutionTerms(
          disputeResolver.id,
          disputeResolver.escalationResponsePeriod,
          DRFeeToken,
          applyPercentage(DRFeeToken, buyerEscalationDepositPercentage),
          ZeroAddress
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
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              emptyAuthToken,
              voucherInitValues,
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            offer.id,
            seller.id,
            compareOfferStructs.bind(offer.toStruct()),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await rando.getAddress()
          );
      });

      it("Should allow creation of an offer with royalty recipients", async function () {
        // Add royalty info to the offer
        offer.royaltyInfo = [new RoyaltyInfo([ZeroAddress], ["10"])];

        // Create a seller and an offer, testing for the event
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createSellerAndOffer(
              seller,
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              emptyAuthToken,
              voucherInitValues,
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offer.toStruct()),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            assistant.address
          );
      });

      context("Preminted offer - createSellerAndPremintedOffer()", async function () {
        let firstTokenId, lastTokenId, reservedRangeLength, range;
        let premintParameters;

        beforeEach(async function () {
          offer.quantityAvailable = reservedRangeLength = 100;
          offerStruct = offer.toStruct();
          firstTokenId = 1;
          lastTokenId = firstTokenId + reservedRangeLength - 1;
          const tokenIdStart = deriveTokenId(offer.id, firstTokenId);
          range = new Range(
            tokenIdStart.toString(),
            reservedRangeLength.toString(),
            "0",
            "0",
            await assistant.getAddress()
          );
          premintParameters = [reservedRangeLength, await assistant.getAddress()];
        });

        it("should emit a SellerCreated, OfferCreated and RangeReserved events with auth token", async function () {
          seller.admin = ZeroAddress;
          sellerStruct = seller.toStruct();

          // Create a seller and a preminted offer, testing for the event
          tx = await orchestrationHandler
            .connect(assistant)
            .createSellerAndPremintedOffer(
              seller,
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              premintParameters,
              authToken,
              voucherInitValues,
              agentId,
              offerFeeLimit
            );

          expectedCloneAddress = calculateCloneAddress(
            await accountHandler.getAddress(),
            beaconProxyAddress,
            admin.address
          );

          await expect(tx)
            .to.emit(orchestrationHandler, "SellerCreated")
            .withArgs(seller.id, sellerStruct, expectedCloneAddress, authTokenStruct, await assistant.getAddress());

          await expect(tx)
            .to.emit(orchestrationHandler, "OfferCreated")
            .withArgs(
              nextOfferId,
              offer.sellerId,
              compareOfferStructs.bind(offerStruct),
              offerDatesStruct,
              offerDurationsStruct,
              disputeResolutionTermsStruct,
              offerFeesStruct,
              agentId,
              await assistant.getAddress()
            );

          await expect(tx)
            .to.emit(orchestrationHandler, "RangeReserved")
            .withArgs(
              nextOfferId,
              offer.sellerId,
              firstTokenId,
              lastTokenId,
              await assistant.getAddress(),
              await assistant.getAddress()
            );

          const expectedRoyaltyRecipientInfoList = new RoyaltyRecipientInfoList([
            new RoyaltyRecipientInfo(ZeroAddress, voucherInitValues.royaltyPercentage),
          ]);

          await expect(tx)
            .to.emit(accountHandler, "RoyaltyRecipientsChanged")
            .withArgs(
              seller.id,
              compareRoyaltyRecipientInfoLists.bind(expectedRoyaltyRecipientInfoList.toStruct()),
              assistant.address
            );

          // Voucher clone contract
          bosonVoucher = await getContractAt("IBosonVoucher", expectedCloneAddress);

          await expect(tx).to.emit(bosonVoucher, "ContractURIChanged").withArgs(contractURI);
          await expect(tx).to.emit(bosonVoucher, "RangeReserved").withArgs(nextOfferId, range.toStruct());

          bosonVoucher = await getContractAt("OwnableUpgradeable", expectedCloneAddress);

          await expect(tx)
            .to.emit(bosonVoucher, "OwnershipTransferred")
            .withArgs(ZeroAddress, await assistant.getAddress());
        });

        it("should update state", async function () {
          seller.admin = ZeroAddress;
          sellerStruct = seller.toStruct();

          // Create a seller and a preminted offer
          await orchestrationHandler
            .connect(assistant)
            .createSellerAndPremintedOffer(
              seller,
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              premintParameters,
              authToken,
              voucherInitValues,
              agentId,
              offerFeeLimit
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

          // Quantity available should be 0, since whole range is reserved
          offer.quantityAvailable = "0";

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

          // Get the collections information
          expectedCloneAddress = calculateCloneAddress(
            await accountHandler.getAddress(),
            beaconProxyAddress,
            admin.address
          );
          const [defaultVoucherAddress, additionalCollections] = await accountHandler
            .connect(rando)
            .getSellersCollections(seller.id);
          expect(defaultVoucherAddress).to.equal(expectedCloneAddress, "Wrong default voucher address");
          expect(additionalCollections.length).to.equal(0, "Wrong number of additional collections");

          // Voucher clone contract
          bosonVoucher = await ethers.getContractAt("OwnableUpgradeable", expectedCloneAddress);

          expect(await bosonVoucher.owner()).to.equal(await assistant.getAddress(), "Wrong voucher clone owner");

          bosonVoucher = await getContractAt("IBosonVoucher", expectedCloneAddress);
          expect(await bosonVoucher.contractURI()).to.equal(contractURI, "Wrong contract URI");
          expect(await bosonVoucher.name()).to.equal(
            VOUCHER_NAME + " S" + seller.id + "_C0",
            "Wrong voucher client name"
          );
          expect(await bosonVoucher.symbol()).to.equal(
            VOUCHER_SYMBOL + "_S" + seller.id + "_C0",
            "Wrong voucher client symbol"
          );
          const returnedRange = Range.fromStruct(await bosonVoucher.getRangeByOfferId(offer.id));
          assert.equal(returnedRange.toString(), range.toString(), "Range mismatch");
          const availablePremints = await bosonVoucher.getAvailablePreMints(offer.id);
          assert.equal(availablePremints.toString(), reservedRangeLength, "Available Premints mismatch");
        });
      });

      context("💔 Revert Reasons", async function () {
        it("The orchestration region of protocol is paused", async function () {
          // Pause the orchestration region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Orchestration]);

          // Attempt to orchestrate, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Orchestration);
        });

        it("The sellers region of protocol is paused", async function () {
          // Pause the sellers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Sellers]);

          // Attempt to create a offer expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Sellers);
        });

        it("The offers region of protocol is paused", async function () {
          // Pause the offers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Offers]);

          // Attempt to create a offer expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Offers);
        });

        it("The exchanges region of protocol is paused [preminted offers]", async function () {
          // Pause the exchanges region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Exchanges]);

          // Attempt to create a offer expecting revert
          const reservedRangeLength = offer.quantityAvailable;
          const premintParameters = [reservedRangeLength, await assistant.getAddress()];
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndPremintedOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                premintParameters,
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Exchanges);
        });

        it("active is false", async function () {
          seller.active = false;

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.MUST_BE_ACTIVE);
        });

        it("addresses are not unique to this seller Id", async function () {
          // Create a seller
          await accountHandler.connect(assistant).createSeller(seller, emptyAuthToken, voucherInitValues);

          // Attempt to create a seller with non-unique admin and assistant, expecting revert
          // N.B. assistant and admin are tested together, since they must be the same
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE);
        });

        it("Caller is not the supplied admin", async function () {
          seller.assistant = await rando.getAddress();

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(rando)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_ADMIN);
        });

        it("Caller does not own supplied auth token", async function () {
          seller.admin = ZeroAddress;
          seller.assistant = await rando.getAddress();

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(rando)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                authToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_ADMIN);
        });

        it("Caller is not the supplied assistant", async function () {
          seller.admin = await rando.getAddress();

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(rando)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_ASSISTANT);
        });

        it("Clerk is not a zero address", async function () {
          seller.admin = await rando.getAddress();
          seller.assistant = await rando.getAddress();
          seller.clerk = await rando.getAddress();

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(rando)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.CLERK_DEPRECATED);
        });

        it("admin address is NOT zero address and AuthTokenType is NOT None", async function () {
          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                authToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.ADMIN_OR_AUTH_TOKEN);
        });

        it("admin address is zero address and AuthTokenType is None", async function () {
          seller.admin = ZeroAddress;

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.ADMIN_OR_AUTH_TOKEN);
        });

        it("authToken is not unique to this seller", async function () {
          // Set admin == zero address because seller will be created with auth token
          seller.admin = ZeroAddress;

          // Create a seller
          await accountHandler.connect(assistant).createSeller(seller, authToken, voucherInitValues);

          // Attempt to create a seller with non-unique authToken and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                authToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.AUTH_TOKEN_MUST_BE_UNIQUE);
        });

        it("Valid from date is greater than valid until date", async function () {
          // Reverse the from and until dates
          offerDates.validFrom = (BigInt(Date.now()) + oneMonth * 6n).toString(); // 6 months from now
          offerDates.validUntil = BigInt(Date.now()).toString(); // now

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Valid until date is not in the future", async function () {
          // Get the current block info
          const blockNumber = await provider.getBlockNumber();
          const block = await provider.getBlock(blockNumber);

          // Set until date in the past
          offerDates.validUntil = (BigInt(block.timestamp) - oneMonth * 6n).toString(); // 6 months ago

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_PERIOD_INVALID);
        });

        it("Buyer cancel penalty is less than item price", async function () {
          // Set buyer cancel penalty higher than offer price
          offer.buyerCancelPenalty = BigInt(offer.price + 10).toString();

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_PENALTY_INVALID);
        });

        it("Offer cannot be voided at the time of the creation", async function () {
          // Set voided flag to true
          offer.voided = true;

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_MUST_BE_ACTIVE);
        });

        it("Both voucher expiration date and voucher expiration period are defined", async function () {
          // Set both voucherRedeemableUntil and voucherValid
          offerDates.voucherRedeemableUntil = (BigInt(offerDates.voucherRedeemableFrom) + oneMonth).toString();
          offerDurations.voucherValid = oneMonth.toString();

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.AMBIGUOUS_VOUCHER_EXPIRY);
        });

        it("Neither of voucher expiration date and voucher expiration period are defined", async function () {
          // Set both voucherRedeemableUntil and voucherValid to "0"
          offerDates.voucherRedeemableUntil = "0";
          offerDurations.voucherValid = "0";

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.AMBIGUOUS_VOUCHER_EXPIRY);
        });

        it("Voucher redeemable period is fixed, but it ends before it starts", async function () {
          // Set both voucherRedeemableUntil that is less than voucherRedeemableFrom
          offerDates.voucherRedeemableUntil = (Number(offerDates.voucherRedeemableFrom) - 10).toString();
          offerDurations.voucherValid = "0";

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.REDEMPTION_PERIOD_INVALID);
        });

        it("Voucher redeemable period is fixed, but it ends before offer expires", async function () {
          // Set both voucherRedeemableUntil that is more than voucherRedeemableFrom but less than validUntil
          offerDates.voucherRedeemableFrom = "0";
          offerDates.voucherRedeemableUntil = (Number(offerDates.validUntil) - 10).toString();
          offerDurations.voucherValid = "0";

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.REDEMPTION_PERIOD_INVALID);
        });

        it("Dispute period is less than minimum dispute period", async function () {
          // Set dispute period to less than minDisputePeriod (oneWeek)
          offerDurations.disputePeriod = (oneWeek - 1000n).toString();

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_DISPUTE_PERIOD);
        });

        it("Resolution period is less than minimum resolution period", async function () {
          // Set resolution duration period to less than minResolutionPeriod (oneWeek)
          offerDurations.resolutionPeriod = (oneWeek - 10n).toString();

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_RESOLUTION_PERIOD);
        });

        it("Resolution period is set above the maximum resolution period", async function () {
          // Set dispute duration period to 0
          offerDurations.resolutionPeriod = oneMonth + 1n;

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_RESOLUTION_PERIOD);
        });

        it("Available quantity is set to zero", async function () {
          // Set available quantity to 0
          offer.quantityAvailable = "0";

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_QUANTITY_AVAILABLE);
        });

        it("Dispute resolver wallet is not registered", async function () {
          // Set some address that is not registered as a dispute resolver
          disputeResolver.id = "16";

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        // TODO - revisit when account deactivations are supported
        it.skip("Dispute resolver is not active", async function () {
          // create another dispute resolver, but don't activate it
          disputeResolver = mockDisputeResolver(
            await rando.getAddress(),
            await rando.getAddress(),
            ZeroAddress,
            await rando.getAddress(),
            false
          );
          disputeResolver.id = "2"; // mock id is 3 because seller was mocked first but here we are creating dispute resolver first
          seller.id = "3";
          await accountHandler
            .connect(rando)
            .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        it("For absolute zero offer, specified dispute resolver is not registered", async function () {
          // Prepare an absolute zero offer, but specify dispute resolver
          offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = offerFees.protocolFee = "0";
          disputeResolver.id = "16";

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        // TODO - revisit when account deactivations are supported
        it.skip("For absolute zero offer, specified dispute resolver is not active", async function () {
          // create another dispute resolver, but don't activate it
          disputeResolver = mockDisputeResolver(
            await rando.getAddress(),
            await rando.getAddress(),
            ZeroAddress,
            await rando.getAddress(),
            false
          );
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
              .connect(assistant)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_DISPUTE_RESOLVER);
        });

        it("Seller is not on dispute resolver's seller allow list", async function () {
          // Create new seller so sellerAllowList can have an entry
          const newSeller = mockSeller(
            await rando.getAddress(),
            await rando.getAddress(),
            ZeroAddress,
            await rando.getAddress()
          );

          await accountHandler.connect(rando).createSeller(newSeller, emptyAuthToken, voucherInitValues);

          allowedSellersToAdd = ["2"]; // DR is "1", new seller is "2"
          await accountHandler.connect(adminDR).addSellersToAllowList(disputeResolver.id, allowedSellersToAdd);

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.SELLER_NOT_APPROVED);
        });

        it("Dispute resolver does not accept fees in the exchange token", async function () {
          // Set some address that is not part of dispute resolver fees
          offer.exchangeToken = await rando.getAddress();

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.DR_UNSUPPORTED_FEE);
        });

        it("Reserved range length is zero", async function () {
          // Set reserved range length to zero
          const reservedRangeLength = "0";
          const premintParameters = [reservedRangeLength, await assistant.getAddress()];

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndPremintedOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                premintParameters,
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_RANGE_LENGTH);
        });

        it("Reserved range length is greater than quantity available", async function () {
          // Set reserved range length to more than quantity available
          const reservedRangeLength = Number(offer.quantityAvailable) + 1;
          const premintParameters = [reservedRangeLength, await assistant.getAddress()];

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndPremintedOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                premintParameters,
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_RANGE_LENGTH);
        });

        it("Reserved range length is greater than maximum allowed range length", async function () {
          // Set reserved range length to more than maximum allowed range length
          const reservedRangeLength = 2n ** 64n - 1n;
          const premintParameters = [reservedRangeLength, await assistant.getAddress()];

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndPremintedOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                premintParameters,
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_RANGE_LENGTH);
        });

        it("Collection does not exist", async function () {
          // Set inexistent collection index
          offer.collectionIndex = "1";

          // Attempt to create a seller and an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_COLLECTION);
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
          agent = mockAgent(await other1.getAddress());
          agent.id = agentId;
          expect(agent.isValid()).is.true;

          // Create an agent
          await accountHandler.connect(rando).createAgent(agent);

          agentFee = ((BigInt(offer.price) * BigInt(agent.feePercentage)) / 10000n).toString();
          offerFees.agentFee = agentFee;
          offerFeesStruct = offerFees.toStruct();
        });

        it("should emit a SellerCreated and OfferCreated events", async function () {
          // Create a seller and an offer, testing for the event
          const tx = await orchestrationHandler
            .connect(assistant)
            .createSellerAndOffer(
              seller,
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              emptyAuthToken,
              voucherInitValues,
              agentId,
              offerFeeLimit
            );

          await expect(tx)
            .to.emit(orchestrationHandler, "SellerCreated")
            .withArgs(
              seller.id,
              sellerStruct,
              calculateCloneAddress(await accountHandler.getAddress(), beaconProxyAddress, admin.address),
              emptyAuthTokenStruct,
              await assistant.getAddress()
            );

          await expect(tx)
            .to.emit(orchestrationHandler, "OfferCreated")
            .withArgs(
              nextOfferId,
              offer.sellerId,
              compareOfferStructs.bind(offerStruct),
              offerDatesStruct,
              offerDurationsStruct,
              disputeResolutionTermsStruct,
              offerFeesStruct,
              agentId,
              await assistant.getAddress()
            );
        });

        context("💔 Revert Reasons", async function () {
          it("Agent does not exist", async function () {
            // Set an agent id that does not exist
            let agentId = "16";

            // Seller can have admin address OR auth token
            seller.admin = ZeroAddress;

            // Attempt to Create an offer, expecting revert
            await expect(
              orchestrationHandler
                .connect(assistant)
                .createSellerAndOffer(
                  seller,
                  offer,
                  offerDates,
                  offerDurations,
                  {
                    disputeResolverId: disputeResolver.id,
                    mutualizerAddress: ZeroAddress
                  },
                  authToken,
                  voucherInitValues,
                  agentId,
                  offerFeeLimit
                )
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_AGENT);
          });

          it("Sum of agent fee amount and protocol fee amount should be <= than the protocol wide offer fee limit", async function () {
            // Create new agent
            let id = "3"; // argument sent to contract for createAgent will be ignored

            // Create a valid agent, then set fields in tests directly
            agent = mockAgent(await assistant.getAddress());
            agent.id = id;
            agent.feePercentage = "3000"; // 30%
            expect(agent.isValid()).is.true;

            // Create an agent
            await accountHandler.connect(rando).createAgent(agent);

            //Change protocol fee after creating agent
            await configHandler.connect(deployer).setProtocolFeePercentage("1100"); //11%

            // Attempt to Create an offer, expecting revert
            await expect(
              orchestrationHandler
                .connect(assistant)
                .createSellerAndOffer(
                  seller,
                  offer,
                  offerDates,
                  offerDurations,
                  {
                    disputeResolverId: disputeResolver.id,
                    mutualizerAddress: ZeroAddress
                  },
                  emptyAuthToken,
                  voucherInitValues,
                  agent.id,
                  offerFeeLimit
                )
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.AGENT_FEE_AMOUNT_TOO_HIGH);
          });

          it("Sum of agent fee amount and protocol fee amount should be <= than the seller defined offer fee limit", async function () {
            // Set fee limit below the sum of agent fee and protocol fee
            offerFeeLimit = BigInt(agent.feePercentage) + BigInt(offerFees.protocolFee) - 1n;

            // Attempt to Create an offer, expecting revert
            await expect(
              orchestrationHandler
                .connect(assistant)
                .createSellerAndOffer(
                  seller,
                  offer,
                  offerDates,
                  offerDurations,
                  {
                    disputeResolverId: disputeResolver.id,
                    mutualizerAddress: ZeroAddress
                  },
                  emptyAuthToken,
                  voucherInitValues,
                  agent.id,
                  offerFeeLimit
                )
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.TOTAL_FEE_EXCEEDS_LIMIT);
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

        condition = mockCondition({
          tokenAddress: await other2.getAddress(),
          tokenType: TokenType.MultiToken,
          method: EvaluationMethod.Threshold,
        });
        expect(condition.isValid()).to.be.true;

        group = new Group(nextGroupId, seller.id, offerIds);

        expect(group.isValid()).is.true;

        // How that group looks as a returned struct
        groupStruct = group.toStruct();

        // create a seller
        await accountHandler.connect(assistant).createSeller(seller, emptyAuthToken, voucherInitValues);
      });

      it("should emit an OfferCreated and GroupCreated events", async function () {
        // Create an offer with condition, testing for the events
        const tx = await orchestrationHandler
          .connect(assistant)
          .createOfferWithCondition(
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            condition,
            agentId,
            offerFeeLimit
          );

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
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
        assert.equal(eventGroupCreated.executedBy.toString(), await assistant.getAddress(), "Executed by is incorrect");
        assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
      });

      it("should update state", async function () {
        // Create an offer with condition
        await orchestrationHandler
          .connect(assistant)
          .createOfferWithCondition(
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            condition,
            agentId,
            offerFeeLimit
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
      });

      it("should ignore any provided offer id and assign the next available", async function () {
        offer.id = "555";

        // Create an offer with condition, testing for the events
        const tx = await orchestrationHandler
          .connect(assistant)
          .createOfferWithCondition(
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            condition,
            agentId,
            offerFeeLimit
          );

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
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
          .connect(assistant)
          .createOfferWithCondition(
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            condition,
            agentId,
            offerFeeLimit
          );

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
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
        offer.exchangeToken = await bosonToken.getAddress();
        disputeResolutionTermsStruct = new DisputeResolutionTerms(
          disputeResolver.id,
          disputeResolver.escalationResponsePeriod,
          DRFeeToken,
          applyPercentage(DRFeeToken, buyerEscalationDepositPercentage),
          ZeroAddress
        ).toStruct();
        offerFees.protocolFee = protocolFeeFlatBoson;
        offerFeesStruct = offerFees.toStruct();

        // Create an offer with condition, testing for the events
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createOfferWithCondition(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              condition,
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offer.toStruct()),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );
      });

      it("For absolute zero offers, dispute resolver can be unspecified", async function () {
        // Prepare an absolute zero offer
        offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = offerFees.protocolFee = "0";
        disputeResolver.id = "0";
        disputeResolutionTermsStruct = new DisputeResolutionTerms("0", "0", "0", "0", ZeroAddress).toStruct();
        offerFeesStruct = offerFees.toStruct();

        // Create an offer with condition, testing for the events
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createOfferWithCondition(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              condition,
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offer.toStruct()),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );
      });

      it("Should allow creation of an offer with unlimited supply", async function () {
        // Prepare an absolute zero offer
        offer.quantityAvailable = MaxUint256.toString();

        // Create an offer with condition, testing for the events
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createOfferWithCondition(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              condition,
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offer.toStruct()),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );
      });

      it("Should use the correct dispute resolver fee", async function () {
        // Create an offer with condition in native currency
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createOfferWithCondition(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              condition,
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            offer.id,
            seller.id,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );

        // create another offer, now with bosonToken as exchange token
        offer.exchangeToken = await bosonToken.getAddress();
        offer.id = "2";
        disputeResolutionTermsStruct = new DisputeResolutionTerms(
          disputeResolver.id,
          disputeResolver.escalationResponsePeriod,
          DRFeeToken,
          applyPercentage(DRFeeToken, buyerEscalationDepositPercentage),
          ZeroAddress
        ).toStruct();
        offerFees.protocolFee = protocolFeeFlatBoson;
        offerFeesStruct = offerFees.toStruct();

        // Create an offer with condition in boson token
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createOfferWithCondition(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              condition,
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            offer.id,
            seller.id,
            compareOfferStructs.bind(offer.toStruct()),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );
      });

      it("Should allow creation of an offer if DR has a sellerAllowList and seller is on it", async function () {
        // add seller to allow list
        allowedSellersToAdd = ["2"]; // DR is "1", existing seller is "2", new seller is "3"
        await accountHandler.connect(adminDR).addSellersToAllowList(disputeResolver.id, allowedSellersToAdd);

        // Create an offer with condition, testing for the events
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createOfferWithCondition(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              condition,
              agentId,
              offerFeeLimit
            )
        ).to.emit(orchestrationHandler, "OfferCreated");
      });

      it("Should allow creation of an offer with royalty recipients", async function () {
        // Add royalty recipients
        const royaltyRecipientList = new RoyaltyRecipientInfoList([
          new RoyaltyRecipientInfo(other1.address, "100"),
          new RoyaltyRecipientInfo(other2.address, "200"),
        ]);
        await accountHandler.connect(admin).addRoyaltyRecipients(seller.id, royaltyRecipientList.toStruct());

        // Add royalty info to the offer
        offer.royaltyInfo = [new RoyaltyInfo([other1.address, ZeroAddress], ["150", "10"])];

        // Create an offer with condition, testing for the events
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createOfferWithCondition(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              condition,
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offer.toStruct()),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            assistant.address
          );
      });

      context("When offers have non zero agent ids", async function () {
        beforeEach(async function () {
          // Required constructor params
          agentId = "3"; // argument sent to contract for createAgent will be ignored

          // Create a valid agent, then set fields in tests directly
          agent = mockAgent(await other1.getAddress());
          agent.id = agentId;
          expect(agent.isValid()).is.true;

          // Create an agent
          await accountHandler.connect(rando).createAgent(agent);

          agentFee = ((BigInt(offer.price) * BigInt(agent.feePercentage)) / 10000n).toString();
          offerFees.agentFee = agentFee;
          offerFeesStruct = offerFees.toStruct();
        });

        it("should emit an OfferCreated and GroupCreated events", async function () {
          // Create an offer with condition, testing for the events
          const tx = await orchestrationHandler
            .connect(assistant)
            .createOfferWithCondition(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              condition,
              agentId,
              offerFeeLimit
            );

          // OfferCreated event
          await expect(tx)
            .to.emit(orchestrationHandler, "OfferCreated")
            .withArgs(
              nextOfferId,
              seller.id,
              compareOfferStructs.bind(offerStruct),
              offerDatesStruct,
              offerDurationsStruct,
              disputeResolutionTermsStruct,
              offerFeesStruct,
              agentId,
              await assistant.getAddress()
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
          assert.equal(
            eventGroupCreated.executedBy.toString(),
            await assistant.getAddress(),
            "Executed by is incorrect"
          );
          assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");
        });
      });

      context("Preminted offer - createPremintedOfferWithCondition()", async function () {
        let firstTokenId, lastTokenId, reservedRangeLength, range;
        let premintParameters;

        beforeEach(async function () {
          offer.quantityAvailable = reservedRangeLength = 100;
          offerStruct = offer.toStruct();
          firstTokenId = 1;
          lastTokenId = firstTokenId + reservedRangeLength - 1;

          // Voucher clone contract
          expectedCloneAddress = calculateCloneAddress(
            await accountHandler.getAddress(),
            beaconProxyAddress,
            admin.address
          );
          bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);

          const tokenIdStart = deriveTokenId(offer.id, firstTokenId);
          range = new Range(tokenIdStart.toString(), reservedRangeLength.toString(), "0", "0", expectedCloneAddress);

          premintParameters = [reservedRangeLength, expectedCloneAddress];
        });

        it("should emit an OfferCreated, a GroupCreated and a RangeReserved events", async function () {
          // Create a preminted offer with condition, testing for the events

          const tx = await orchestrationHandler
            .connect(assistant)
            .createPremintedOfferWithCondition(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              premintParameters,
              condition,
              agentId,
              offerFeeLimit
            );

          // OfferCreated event
          await expect(tx)
            .to.emit(orchestrationHandler, "OfferCreated")
            .withArgs(
              nextOfferId,
              seller.id,
              compareOfferStructs.bind(offerStruct),
              offerDatesStruct,
              offerDurationsStruct,
              disputeResolutionTermsStruct,
              offerFeesStruct,
              agentId,
              await assistant.getAddress()
            );

          // RangeReserved event (on protocol contract)
          await expect(tx)
            .to.emit(orchestrationHandler, "RangeReserved")
            .withArgs(
              nextOfferId,
              offer.sellerId,
              firstTokenId,
              lastTokenId,
              await bosonVoucher.getAddress(),
              await assistant.getAddress()
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
          assert.equal(
            eventGroupCreated.executedBy.toString(),
            await assistant.getAddress(),
            "Executed by is incorrect"
          );
          assert.equal(groupInstance.toString(), group.toString(), "Group struct is incorrect");

          // RangeReserved event (on voucher contract)
          await expect(tx).to.emit(bosonVoucher, "RangeReserved").withArgs(nextOfferId, range.toStruct());
        });

        it("should update state", async function () {
          // Create a preminted offer with condition
          await orchestrationHandler
            .connect(assistant)
            .createPremintedOfferWithCondition(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              premintParameters,
              condition,
              agentId,
              offerFeeLimit
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

          // Quantity available should be 0, since whole range is reserved
          offer.quantityAvailable = "0";

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
          const returnedRange = Range.fromStruct(await bosonVoucher.getRangeByOfferId(offer.id));
          assert.equal(returnedRange.toString(), range.toString(), "Range mismatch");
          const availablePremints = await bosonVoucher.getAvailablePreMints(offer.id);
          assert.equal(availablePremints.toString(), reservedRangeLength, "Available Premints mismatch");
        });
      });

      context("💔 Revert Reasons", async function () {
        it("The orchestration region of protocol is paused", async function () {
          // Pause the orchestration region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Orchestration]);

          // Attempt to create an offer expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOffer(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Orchestration);
        });

        it("The offers region of protocol is paused", async function () {
          // Pause the offers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Offers]);

          // Attempt to orchestrate, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createOfferWithCondition(
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                condition,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Offers);
        });

        it("The exchanges region of protocol is paused [preminted offers]", async function () {
          // Pause the exchanges region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Exchanges]);

          // Attempt to orchestrate, expecting revert
          const reservedRangeLength = offer.quantityAvailable;
          const bosonVoucherAddress = calculateCloneAddress(
            await accountHandler.getAddress(),
            beaconProxyAddress,
            admin.address
          );
          const premintParameters = [reservedRangeLength, bosonVoucherAddress];
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createPremintedOfferWithCondition(
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                premintParameters,
                condition,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Exchanges);
        });

        it("The groups region of protocol is paused", async function () {
          // Pause the groups region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Offers]);

          // Attempt to create a group, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createOfferWithCondition(
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                condition,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Offers);
        });

        it("Caller not assistant of any seller", async function () {
          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(rando)
              .createOfferWithCondition(
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                condition,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_ASSISTANT);
        });

        it("Condition 'None' has some values in other fields", async function () {
          condition.method = EvaluationMethod.None;

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createOfferWithCondition(
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                condition,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_CONDITION_PARAMETERS);
        });

        it("Condition 'Threshold' has zero token contract address", async function () {
          condition.method = EvaluationMethod.Threshold;
          condition.tokenAddress = ZeroAddress;

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createOfferWithCondition(
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                condition,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_CONDITION_PARAMETERS);
        });

        it("Condition 'SpecificToken' has has zero token contract address", async function () {
          condition.method = EvaluationMethod.SpecificToken;
          condition.tokenAddress = ZeroAddress;

          // Attempt to create an offer with condition, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createOfferWithCondition(
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                condition,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_CONDITION_PARAMETERS);
        });

        context("Offers with royalty info", async function () {
          // Other offer creation related revert reasons are tested in the previous context
          // This is an exception, since these tests make more sense if seller has multiple royalty recipients

          beforeEach(async function () {
            // Add royalty recipients
            const royaltyRecipientList = new RoyaltyRecipientInfoList([
              new RoyaltyRecipientInfo(other1.address, "100"),
              new RoyaltyRecipientInfo(other2.address, "200"),
            ]);
            await accountHandler.connect(admin).addRoyaltyRecipients(seller.id, royaltyRecipientList.toStruct());
          });

          it("Royalty recipient is not on seller's allow list", async function () {
            // Add royalty info to the offer
            offer.royaltyInfo = [new RoyaltyInfo([other1.address, rando.address], ["150", "10"])];

            // Attempt to create an offer with condition, expecting revert
            await expect(
              orchestrationHandler
                .connect(assistant)
                .createOfferWithCondition(
                  offer,
                  offerDates,
                  offerDurations,
                  {
                    disputeResolverId: disputeResolver.id,
                    mutualizerAddress: ZeroAddress
                  },
                  condition,
                  agentId,
                  offerFeeLimit
                )
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_ROYALTY_RECIPIENT);
          });

          it("Royalty percentage is less than the value decided by the admin", async function () {
            // Add royalty info to the offer
            offer.royaltyInfo = [new RoyaltyInfo([other1.address, other2.address], ["90", "250"])];

            // Attempt to create an offer with condition, expecting revert
            await expect(
              orchestrationHandler
                .connect(assistant)
                .createOfferWithCondition(
                  offer,
                  offerDates,
                  offerDurations,
                  {
                    disputeResolverId: disputeResolver.id,
                    mutualizerAddress: ZeroAddress
                  },
                  condition,
                  agentId,
                  offerFeeLimit
                )
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_ROYALTY_PERCENTAGE);
          });

          it("Total royalty percentage is more than max royalty percentage", async function () {
            // Add royalty info to the offer
            offer.royaltyInfo = [new RoyaltyInfo([other1.address, other2.address], ["5000", "4000"])];

            // Attempt to create an offer with condition, expecting revert
            await expect(
              orchestrationHandler
                .connect(assistant)
                .createOfferWithCondition(
                  offer,
                  offerDates,
                  offerDurations,
                  {
                    disputeResolverId: disputeResolver.id,
                    mutualizerAddress: ZeroAddress
                  },
                  condition,
                  agentId,
                  offerFeeLimit
                )
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_ROYALTY_PERCENTAGE);
          });
        });
      });
    });

    context("👉 createOfferAddToGroup()", async function () {
      beforeEach(async function () {
        // create a seller
        await accountHandler.connect(assistant).createSeller(seller, emptyAuthToken, voucherInitValues);

        // The first group id
        nextGroupId = "1";

        // create 3 offers
        for (let i = 0; i < 3; i++) {
          // Mock offer, offerDates and offerDurations
          ({ offer, offerDates, offerDurations } = await mockOffer());
          offer.id = `${i + 1}`;
          offer.price = parseUnits(`${1.5 + i * 1}`, "ether").toString();
          offer.sellerDeposit = parseUnits(`${0.25 + i * 0.1}`, "ether").toString();
          offer.buyerCancelPenalty = parseUnits(`${0.05 + i * 0.1}`, "ether").toString();
          offer.quantityAvailable = `${(i + 1) * 2}`;
          offer.sellerId = seller.id; // "2" is dispute resolver

          offerDates.validFrom = (BigInt(Date.now()) + oneMonth * BigInt(i)).toString();
          offerDates.validUntil = (BigInt(Date.now()) + oneMonth * 6n * BigInt(i + 1)).toString();

          disputeResolver.id = "1";
          agentId = "0";

          // Check if domains are valid
          expect(offer.isValid()).is.true;
          expect(offerDates.isValid()).is.true;
          expect(offerDurations.isValid()).is.true;

          // Create the offer
          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            }, agentId, offerFeeLimit);

          nextOfferId++;
        }
        offerDatesStruct = offerDates.toStruct();
        offerDurationsStruct = offerDurations.toStruct();

        // Required constructor params for Group
        offerIds = ["1", "3"];

        condition = mockCondition({
          tokenType: TokenType.MultiToken,
          tokenAddress: await other2.getAddress(),
          method: EvaluationMethod.Threshold,
          maxCommits: "3",
        });
        expect(condition.isValid()).to.be.true;

        group = new Group(nextGroupId, seller.id, offerIds);

        expect(group.isValid()).is.true;

        // Create a group
        await groupHandler.connect(assistant).createGroup(group, condition);

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
          .connect(assistant)
          .createOfferAddToGroup(
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            nextGroupId,
            agentId,
            offerFeeLimit
          );

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
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
          .connect(assistant)
          .createOfferAddToGroup(
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            nextGroupId,
            agentId,
            offerFeeLimit
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
          .connect(assistant)
          .createOfferAddToGroup(
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            nextGroupId,
            agentId,
            offerFeeLimit
          );

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
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
          .connect(assistant)
          .createOfferAddToGroup(
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            nextGroupId,
            agentId,
            offerFeeLimit
          );

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
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
        offer.exchangeToken = await bosonToken.getAddress();
        disputeResolutionTermsStruct = new DisputeResolutionTerms(
          disputeResolver.id,
          disputeResolver.escalationResponsePeriod,
          DRFeeToken,
          applyPercentage(DRFeeToken, buyerEscalationDepositPercentage),
          ZeroAddress
        ).toStruct();
        offerFees.protocolFee = protocolFeeFlatBoson;
        offerFeesStruct = offerFees.toStruct();

        // Create an offer, add it to the group, testing for the events
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createOfferAddToGroup(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              nextGroupId,
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offer.toStruct()),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );
      });

      it("For absolute zero offers, dispute resolver can be unspecified", async function () {
        // Prepare an absolute zero offer
        offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = offerFees.protocolFee = "0";
        disputeResolver.id = "0";
        disputeResolutionTermsStruct = new DisputeResolutionTerms("0", "0", "0", "0", ZeroAddress).toStruct();
        offerFeesStruct = offerFees.toStruct();

        // Create an offer, add it to the group, testing for the events
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createOfferAddToGroup(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              nextGroupId,
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offer.toStruct()),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );
      });

      it("Should allow creation of an offer with unlimited supply", async function () {
        // Prepare an absolute zero offer
        offer.quantityAvailable = MaxUint256.toString();

        // Create an offer, add it to the group, testing for the events
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createOfferAddToGroup(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              nextGroupId,
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offer.toStruct()),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );
      });

      it("Should use the correct dispute resolver fee", async function () {
        // Create an offer in native currency
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createOfferAddToGroup(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              nextGroupId,
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            offer.id,
            seller.id,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );

        // create another offer, now with bosonToken as exchange token
        offer.exchangeToken = await bosonToken.getAddress();
        offer.id++;
        disputeResolutionTermsStruct = new DisputeResolutionTerms(
          disputeResolver.id,
          disputeResolver.escalationResponsePeriod,
          DRFeeToken,
          applyPercentage(DRFeeToken, buyerEscalationDepositPercentage),
          ZeroAddress
        ).toStruct();
        offerFees.protocolFee = protocolFeeFlatBoson;
        offerFeesStruct = offerFees.toStruct();

        // Create an offer in boson token
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createOfferAddToGroup(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              nextGroupId,
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            offer.id,
            seller.id,
            compareOfferStructs.bind(offer.toStruct()),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );
      });

      it("Should allow creation of an offer if DR has a sellerAllowList and seller is on it", async function () {
        // add seller to allow list
        allowedSellersToAdd = ["2"]; // DR is "1", existing seller is "2", new seller is "3"
        await accountHandler.connect(adminDR).addSellersToAllowList(disputeResolver.id, allowedSellersToAdd);

        // Create an offer in native currency
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createOfferAddToGroup(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              nextGroupId,
              agentId,
              offerFeeLimit
            )
        ).to.emit(orchestrationHandler, "OfferCreated");
      });

      it("Should allow creation of an offer with royalty recipients", async function () {
        // Add royalty recipients
        const royaltyRecipientList = new RoyaltyRecipientInfoList([
          new RoyaltyRecipientInfo(other1.address, "100"),
          new RoyaltyRecipientInfo(other2.address, "200"),
        ]);
        await accountHandler.connect(admin).addRoyaltyRecipients(seller.id, royaltyRecipientList.toStruct());

        // Add royalty info to the offer
        offer.royaltyInfo = [new RoyaltyInfo([other1.address, ZeroAddress], ["150", "10"])];

        // Create an offer, add it to the group, testing for the events
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createOfferAddToGroup(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              nextGroupId,
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offer.toStruct()),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            assistant.address
          );
      });

      context("When offers have non zero agent ids", async function () {
        beforeEach(async function () {
          // Required constructor params
          agentId = "3"; // argument sent to contract for createAgent will be ignored

          // Create a valid agent, then set fields in tests directly
          agent = mockAgent(await other1.getAddress());
          agent.id = agentId;
          expect(agent.isValid()).is.true;

          // Create an agent
          await accountHandler.connect(rando).createAgent(agent);

          agentFee = ((BigInt(offer.price) * BigInt(agent.feePercentage)) / 10000n).toString();
          offerFees.agentFee = agentFee;
          offerFeesStruct = offerFees.toStruct();
        });

        it("should emit an OfferCreated and GroupUpdated events", async function () {
          // Create an offer, add it to the group, testing for the events
          const tx = await orchestrationHandler
            .connect(assistant)
            .createOfferAddToGroup(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              nextGroupId,
              agentId,
              offerFeeLimit
            );

          // OfferCreated event
          await expect(tx)
            .to.emit(orchestrationHandler, "OfferCreated")
            .withArgs(
              nextOfferId,
              seller.id,
              compareOfferStructs.bind(offerStruct),
              offerDatesStruct,
              offerDurationsStruct,
              disputeResolutionTermsStruct,
              offerFeesStruct,
              agentId,
              await assistant.getAddress()
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
      });

      context("Preminted offer - createPremintedOfferAddToGroup()", async function () {
        let firstTokenId, lastTokenId, reservedRangeLength, range;
        let premintParameters;

        beforeEach(async function () {
          offer.quantityAvailable = reservedRangeLength = 100;
          offerStruct = offer.toStruct();
          firstTokenId = 1;
          lastTokenId = firstTokenId + reservedRangeLength - 1;
          const tokenIdStart = deriveTokenId(offer.id, firstTokenId);
          range = new Range(
            tokenIdStart.toString(),
            reservedRangeLength.toString(),
            "0",
            "0",
            await assistant.getAddress()
          );

          // Voucher clone contract
          expectedCloneAddress = calculateCloneAddress(
            await accountHandler.getAddress(),
            beaconProxyAddress,
            admin.address
          );
          bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);

          premintParameters = [reservedRangeLength, await assistant.getAddress()];
        });

        it("should emit an OfferCreated, a GroupUpdated and a RangeReserved events", async function () {
          // Create a preminted offer, add it to the group, testing for the events
          const tx = await orchestrationHandler
            .connect(assistant)
            .createPremintedOfferAddToGroup(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              premintParameters,
              nextGroupId,
              agentId,
              offerFeeLimit
            );

          // OfferCreated event
          await expect(tx)
            .to.emit(orchestrationHandler, "OfferCreated")
            .withArgs(
              nextOfferId,
              seller.id,
              compareOfferStructs.bind(offerStruct),
              offerDatesStruct,
              offerDurationsStruct,
              disputeResolutionTermsStruct,
              offerFeesStruct,
              agentId,
              await assistant.getAddress()
            );

          // RangeReserved event (on protocol contract)
          await expect(tx)
            .to.emit(orchestrationHandler, "RangeReserved")
            .withArgs(
              nextOfferId,
              offer.sellerId,
              firstTokenId,
              lastTokenId,
              await assistant.getAddress(),
              await assistant.getAddress()
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

          // RangeReserved event (on voucher contract)
          await expect(tx).to.emit(bosonVoucher, "RangeReserved").withArgs(nextOfferId, range.toStruct());
        });

        it("should update state", async function () {
          // Create a preminted offer, add it to the group
          await orchestrationHandler
            .connect(assistant)
            .createPremintedOfferAddToGroup(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              premintParameters,
              nextGroupId,
              agentId,
              offerFeeLimit
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

          // Quantity available should be 0, since whole range is reserved
          offer.quantityAvailable = "0";

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

          // Voucher clone contract
          const returnedRange = Range.fromStruct(await bosonVoucher.getRangeByOfferId(offer.id));
          assert.equal(returnedRange.toString(), range.toString(), "Range mismatch");
          const availablePremints = await bosonVoucher.getAvailablePreMints(offer.id);
          assert.equal(availablePremints.toString(), reservedRangeLength, "Available Premints mismatch");
        });
      });

      context("💔 Revert Reasons", async function () {
        it("The orchestration region of protocol is paused", async function () {
          // Pause the orchestration region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Orchestration]);

          // Attempt to orchestrate expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createOfferAddToGroup(
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                nextGroupId,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Orchestration);
        });

        it("The offers region of protocol is paused", async function () {
          // Pause the offers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Offers]);

          // Attempt to create a offer expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createOfferAddToGroup(
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                nextGroupId,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Offers);
        });

        it("The exchanges region of protocol is paused [preminted offers]", async function () {
          // Pause the exchanges region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Exchanges]);

          // Attempt to create a offer expecting revert
          const reservedRangeLength = offer.quantityAvailable;
          const premintParameters = [reservedRangeLength, await assistant.getAddress()];
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createPremintedOfferAddToGroup(
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                premintParameters,
                nextGroupId,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Exchanges);
        });

        it("The groups region of protocol is paused", async function () {
          // Pause the groups region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Groups]);

          // Attempt to create a group expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createOfferAddToGroup(
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                nextGroupId,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Groups);
        });

        it("Group does not exist", async function () {
          // Set invalid id
          let invalidGroupId = "444";

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createOfferAddToGroup(
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                invalidGroupId,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_GROUP);

          // Set invalid id
          invalidGroupId = "0";

          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createOfferAddToGroup(
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                invalidGroupId,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_GROUP);
        });

        it("Caller is not the seller of the group", async function () {
          // Attempt to create an offer and add it to the group, expecting revert
          await expect(
            orchestrationHandler
              .connect(rando)
              .createOfferAddToGroup(
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                nextGroupId,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_ASSISTANT);
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
        twin = mockTwin(await bosonToken.getAddress());
        twin.sellerId = seller.id;
        // How that twin looks as a returned struct
        twinStruct = twin.toStruct();

        // create a seller
        await accountHandler.connect(assistant).createSeller(seller, emptyAuthToken, voucherInitValues);

        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1); // approving the twin handler
      });

      it("should emit an OfferCreated, a TwinCreated and a BundleCreated events", async function () {
        // Create an offer, a twin and a bundle, testing for the events
        const tx = await orchestrationHandler
          .connect(assistant)
          .createOfferAndTwinWithBundle(
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            twin,
            agentId,
            offerFeeLimit
          );

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
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
          .connect(assistant)
          .createOfferAndTwinWithBundle(
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            twin,
            agentId,
            offerFeeLimit
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
          .connect(assistant)
          .createOfferAndTwinWithBundle(
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            twin,
            agentId,
            offerFeeLimit
          );

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
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
          .connect(assistant)
          .createOfferAndTwinWithBundle(
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            twin,
            agentId,
            offerFeeLimit
          );

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
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
        offer.exchangeToken = await bosonToken.getAddress();
        disputeResolutionTermsStruct = new DisputeResolutionTerms(
          disputeResolver.id,
          disputeResolver.escalationResponsePeriod,
          DRFeeToken,
          applyPercentage(DRFeeToken, buyerEscalationDepositPercentage),
          ZeroAddress
        ).toStruct();
        offerFees.protocolFee = protocolFeeFlatBoson;
        offerFeesStruct = offerFees.toStruct();

        // Create an offer, a twin and a bundle, testing for the events
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createOfferAndTwinWithBundle(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              twin,
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offer.toStruct()),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );
      });

      it("For absolute zero offers, dispute resolver can be unspecified", async function () {
        // Prepare an absolute zero offer
        offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = offerFees.protocolFee = "0";
        disputeResolver.id = "0";
        disputeResolutionTermsStruct = new DisputeResolutionTerms("0", "0", "0", "0", ZeroAddress).toStruct();
        offerFeesStruct = offerFees.toStruct();

        // Create an offer, a twin and a bundle, testing for the events
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createOfferAndTwinWithBundle(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              twin,
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offer.toStruct()),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );
      });

      it("Should allow creation of an offer with unlimited supply", async function () {
        // Prepare an offer with unlimited supply
        offer.quantityAvailable = MaxUint256.toString();
        // Twin supply should be unlimited as well
        twin.supplyAvailable = MaxUint256.toString();

        // Create an offer, a twin and a bundle, testing for the events
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createOfferAndTwinWithBundle(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              twin,
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offer.toStruct()),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );
      });

      it("Should use the correct dispute resolver fee", async function () {
        // Create an offer in native currency
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createOfferAndTwinWithBundle(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              twin,
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            offer.id,
            seller.id,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );

        // create another offer, now with bosonToken as exchange token
        offer.exchangeToken = await bosonToken.getAddress();
        offer.id = "2";
        disputeResolutionTermsStruct = new DisputeResolutionTerms(
          disputeResolver.id,
          disputeResolver.escalationResponsePeriod,
          DRFeeToken,
          applyPercentage(DRFeeToken, buyerEscalationDepositPercentage),
          ZeroAddress
        ).toStruct();
        offerFees.protocolFee = protocolFeeFlatBoson;
        offerFeesStruct = offerFees.toStruct();

        // Create an offer in boson token
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createOfferAndTwinWithBundle(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              twin,
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            offer.id,
            seller.id,
            compareOfferStructs.bind(offer.toStruct()),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );
      });

      it("Should allow creation of an offer if DR has a sellerAllowList and seller is on it", async function () {
        // add seller to allow list
        allowedSellersToAdd = ["2"]; // DR is "1", existing seller is "2", new seller is "3"
        await accountHandler.connect(adminDR).addSellersToAllowList(disputeResolver.id, allowedSellersToAdd);

        // Create an offer, a twin and a bundle, testing for the events
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createOfferAndTwinWithBundle(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              twin,
              agentId,
              offerFeeLimit
            )
        ).to.emit(orchestrationHandler, "OfferCreated");
      });

      it("Should allow creation of an offer with royalty recipients", async function () {
        // Add royalty recipients
        const royaltyRecipientList = new RoyaltyRecipientInfoList([
          new RoyaltyRecipientInfo(other1.address, "100"),
          new RoyaltyRecipientInfo(other2.address, "200"),
        ]);
        await accountHandler.connect(admin).addRoyaltyRecipients(seller.id, royaltyRecipientList.toStruct());

        // Add royalty info to the offer
        offer.royaltyInfo = [new RoyaltyInfo([other1.address, ZeroAddress], ["150", "10"])];

        // Create an offer, a twin and a bundle, testing for the events
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createOfferAndTwinWithBundle(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              twin,
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offer.toStruct()),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            assistant.address
          );
      });

      context("When offers have non zero agent ids", async function () {
        beforeEach(async function () {
          // Required constructor params
          agentId = "3"; // argument sent to contract for createAgent will be ignored

          // Create a valid agent, then set fields in tests directly
          agent = mockAgent(await other1.getAddress());
          agent.id = agentId;
          expect(agent.isValid()).is.true;

          // Create an agent
          await accountHandler.connect(rando).createAgent(agent);

          agentFee = ((BigInt(offer.price) * BigInt(agent.feePercentage)) / 10000n).toString();
          offerFees.agentFee = agentFee;
          offerFeesStruct = offerFees.toStruct();
        });

        it("should emit an OfferCreated, a TwinCreated and a BundleCreated events", async function () {
          // Create an offer, a twin and a bundle, testing for the events
          const tx = await orchestrationHandler
            .connect(assistant)
            .createOfferAndTwinWithBundle(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              twin,
              agentId,
              offerFeeLimit
            );

          // OfferCreated event
          await expect(tx)
            .to.emit(orchestrationHandler, "OfferCreated")
            .withArgs(
              nextOfferId,
              seller.id,
              compareOfferStructs.bind(offerStruct),
              offerDatesStruct,
              offerDurationsStruct,
              disputeResolutionTermsStruct,
              offerFeesStruct,
              agentId,
              await assistant.getAddress()
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
      });

      context("Preminted offer - createPremintedOfferAndTwinWithBundle()", async function () {
        let firstTokenId, lastTokenId, reservedRangeLength, range;
        let premintParameters;

        beforeEach(async function () {
          offer.quantityAvailable = reservedRangeLength = 1;
          offerStruct = offer.toStruct();
          firstTokenId = 1;
          lastTokenId = firstTokenId + reservedRangeLength - 1;

          // Voucher clone contract
          expectedCloneAddress = calculateCloneAddress(
            await accountHandler.getAddress(),
            beaconProxyAddress,
            admin.address
          );
          bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);

          const tokenIdStart = deriveTokenId(offer.id, firstTokenId);
          range = new Range(tokenIdStart.toString(), reservedRangeLength.toString(), "0", "0", expectedCloneAddress);

          premintParameters = [reservedRangeLength, expectedCloneAddress];
        });

        it("should emit an OfferCreated, a TwinCreated, a BundleCreated and a RangeReserved events", async function () {
          // Create a preminted offer, a twin and a bundle, testing for the events
          const tx = await orchestrationHandler
            .connect(assistant)
            .createPremintedOfferAndTwinWithBundle(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              premintParameters,
              twin,
              agentId,
              offerFeeLimit
            );

          // OfferCreated event
          await expect(tx)
            .to.emit(orchestrationHandler, "OfferCreated")
            .withArgs(
              nextOfferId,
              seller.id,
              compareOfferStructs.bind(offerStruct),
              offerDatesStruct,
              offerDurationsStruct,
              disputeResolutionTermsStruct,
              offerFeesStruct,
              agentId,
              await assistant.getAddress()
            );

          // RangeReserved event (on protocol contract)
          await expect(tx)
            .to.emit(orchestrationHandler, "RangeReserved")
            .withArgs(
              nextOfferId,
              offer.sellerId,
              firstTokenId,
              lastTokenId,
              await bosonVoucher.getAddress(),
              await assistant.getAddress()
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

          // RangeReserved event (on voucher contract)
          await expect(tx).to.emit(bosonVoucher, "RangeReserved").withArgs(nextOfferId, range.toStruct());
        });

        it("should update state", async function () {
          // Create a preminted offer, a twin and a bundle
          await orchestrationHandler
            .connect(assistant)
            .createPremintedOfferAndTwinWithBundle(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              premintParameters,
              twin,
              agentId,
              offerFeeLimit
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

          // Quantity available should be 0, since whole range is reserved
          offer.quantityAvailable = "0";

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

          // Voucher clone contract
          const returnedRange = Range.fromStruct(await bosonVoucher.getRangeByOfferId(offer.id));
          assert.equal(returnedRange.toString(), range.toString(), "Range mismatch");
          const availablePremints = await bosonVoucher.getAvailablePreMints(offer.id);
          assert.equal(availablePremints.toString(), reservedRangeLength, "Available Premints mismatch");
        });
      });

      context("💔 Revert Reasons", async function () {
        it("The orchestration region of protocol is paused", async function () {
          // Pause the orchestration region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Orchestration]);

          // Attempt to orchestrate expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createOfferAndTwinWithBundle(
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                twin,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Orchestration);
        });

        it("The offers region of protocol is paused", async function () {
          // Pause the offers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Offers]);

          // Attempt to create a offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createOfferAndTwinWithBundle(
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                twin,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Offers);
        });

        it("The bundles region of protocol is paused", async function () {
          // Pause the bundles region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Bundles]);

          // Attempt to create a bundle, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createOfferAndTwinWithBundle(
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                twin,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Bundles);
        });

        it("The twins region of protocol is paused", async function () {
          // Pause the twins region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Twins]);

          // Attempt to create a twin, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createOfferAndTwinWithBundle(
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                twin,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Twins);
        });

        it("The exchanges region of protocol is paused [preminted offers]", async function () {
          // Pause the exchanges region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Exchanges]);

          // Attempt to create a twin, expecting revert
          const reservedRangeLength = offer.quantityAvailable;
          const bosonVoucherAddress = calculateCloneAddress(
            await accountHandler.getAddress(),
            beaconProxyAddress,
            admin.address
          );
          const premintParameters = [reservedRangeLength, bosonVoucherAddress];
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createPremintedOfferAndTwinWithBundle(
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                premintParameters,
                twin,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Exchanges);
        });

        it("should revert if protocol is not approved to transfer the ERC20 token", async function () {
          // Approving the twinHandler contract to transfer seller's tokens
          await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 0); // approving the twin handler

          //ERC20 token address
          twin.tokenAddress = await bosonToken.getAddress();

          await expect(
            orchestrationHandler
              .connect(assistant)
              .createOfferAndTwinWithBundle(
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                twin,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_TRANSFER_APPROVED);
        });

        it("should revert if protocol is not approved to transfer the ERC721 token", async function () {
          //ERC721 token address
          twin.tokenAddress = await foreign721.getAddress();

          await expect(
            orchestrationHandler
              .connect(assistant)
              .createOfferAndTwinWithBundle(
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                twin,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_TRANSFER_APPROVED);
        });

        it("should revert if protocol is not approved to transfer the ERC1155 token", async function () {
          //ERC1155 token address
          twin.tokenAddress = await foreign1155.getAddress();

          await expect(
            orchestrationHandler
              .connect(assistant)
              .createOfferAndTwinWithBundle(
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                twin,
                agentId,
                offerFeeLimit
              )
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_TRANSFER_APPROVED);
        });

        context("Token address is unsupported", async function () {
          it("Token address is a zero address", async function () {
            twin.tokenAddress = ZeroAddress;

            await expect(
              orchestrationHandler
                .connect(assistant)
                .createOfferAndTwinWithBundle(
                  offer,
                  offerDates,
                  offerDurations,
                  {
                    disputeResolverId: disputeResolver.id,
                    mutualizerAddress: ZeroAddress
                  },
                  twin,
                  agentId,
                  offerFeeLimit
                )
            ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.UNSUPPORTED_TOKEN);
          });

          it("Token address is a contract address that does not support the isApprovedForAll", async function () {
            twin.tokenAddress = await twinHandler.getAddress();

            await expect(
              orchestrationHandler
                .connect(assistant)
                .createOfferAndTwinWithBundle(
                  offer,
                  offerDates,
                  offerDurations,
                  {
                    disputeResolverId: disputeResolver.id,
                    mutualizerAddress: ZeroAddress
                  },
                  twin,
                  agentId,
                  offerFeeLimit
                )
            ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.UNSUPPORTED_TOKEN);
          });

          it("Token address is a contract that reverts from a fallback method", async function () {
            twin.tokenAddress = await fallbackError.getAddress();

            await expect(
              orchestrationHandler
                .connect(assistant)
                .createOfferAndTwinWithBundle(
                  offer,
                  offerDates,
                  offerDurations,
                  {
                    disputeResolverId: disputeResolver.id,
                    mutualizerAddress: ZeroAddress
                  },
                  twin,
                  agentId,
                  offerFeeLimit
                )
            ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.UNSUPPORTED_TOKEN);
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

        condition = mockCondition({
          tokenType: TokenType.MultiToken,
          tokenAddress: await other2.getAddress(),
          method: EvaluationMethod.Threshold,
        });
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
        twin = mockTwin(await bosonToken.getAddress());
        twin.sellerId = seller.id;

        // How that twin looks as a returned struct
        twinStruct = twin.toStruct();

        // create a seller
        await accountHandler.connect(assistant).createSeller(seller, emptyAuthToken, voucherInitValues);

        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1); // approving the twin handler
      });

      it("should emit an OfferCreated, a GroupCreated, a TwinCreated and a BundleCreated events", async function () {
        // Create an offer with condition, twin and bundle
        const tx = await orchestrationHandler
          .connect(assistant)
          .createOfferWithConditionAndTwinAndBundle(
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            condition,
            twin,
            agentId,
            offerFeeLimit
          );

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
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
          .connect(assistant)
          .createOfferWithConditionAndTwinAndBundle(
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            condition,
            twin,
            agentId,
            offerFeeLimit
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
          .connect(assistant)
          .createOfferWithConditionAndTwinAndBundle(
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            condition,
            twin,
            agentId,
            offerFeeLimit
          );

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
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
          .connect(assistant)
          .createOfferWithConditionAndTwinAndBundle(
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            condition,
            twin,
            agentId,
            offerFeeLimit
          );

        // OfferCreated event
        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
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
        offer.exchangeToken = await bosonToken.getAddress();
        disputeResolutionTermsStruct = new DisputeResolutionTerms(
          disputeResolver.id,
          disputeResolver.escalationResponsePeriod,
          DRFeeToken,
          applyPercentage(DRFeeToken, buyerEscalationDepositPercentage),
          ZeroAddress
        ).toStruct();
        offerFees.protocolFee = protocolFeeFlatBoson;
        offerFeesStruct = offerFees.toStruct();

        // Create an offer with condition, twin and bundle testing for the events
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createOfferWithConditionAndTwinAndBundle(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              condition,
              twin,
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offer.toStruct()),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );
      });

      it("For absolute zero offers, dispute resolver can be unspecified", async function () {
        // Prepare an absolute zero offer
        offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = offerFees.protocolFee = "0";
        disputeResolver.id = "0";
        disputeResolutionTermsStruct = new DisputeResolutionTerms("0", "0", "0", "0", ZeroAddress).toStruct();
        offerFeesStruct = offerFees.toStruct();

        // Create an offer with condition, twin and bundle testing for the events
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createOfferWithConditionAndTwinAndBundle(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              condition,
              twin,
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offer.toStruct()),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );
      });

      it("Should allow creation of an offer with unlimited supply", async function () {
        // Prepare an offer with unlimited supply
        offer.quantityAvailable = MaxUint256.toString();
        // Twin supply should be unlimited as well
        twin.supplyAvailable = MaxUint256.toString();

        // Create an offer with condition, twin and bundle testing for the events
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createOfferWithConditionAndTwinAndBundle(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              condition,
              twin,
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offer.toStruct()),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );
      });

      it("Should use the correct dispute resolver fee", async function () {
        // Create an offer in native currency
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createOfferWithConditionAndTwinAndBundle(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              condition,
              twin,
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            offer.id,
            seller.id,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );

        // create another offer, now with bosonToken as exchange token
        offer.exchangeToken = await bosonToken.getAddress();
        offer.id = "2";
        disputeResolutionTermsStruct = new DisputeResolutionTerms(
          disputeResolver.id,
          disputeResolver.escalationResponsePeriod,
          DRFeeToken,
          applyPercentage(DRFeeToken, buyerEscalationDepositPercentage),
          ZeroAddress
        ).toStruct();
        offerFees.protocolFee = protocolFeeFlatBoson;
        offerFeesStruct = offerFees.toStruct();

        // Create an offer in boson token
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createOfferWithConditionAndTwinAndBundle(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              condition,
              twin,
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            offer.id,
            seller.id,
            compareOfferStructs.bind(offer.toStruct()),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );
      });

      it("Should allow creation of an offer if DR has a sellerAllowList and seller is on it", async function () {
        // add seller to allow list
        allowedSellersToAdd = ["2"]; // DR is "1", existing seller is "2", new seller is "3"
        await accountHandler.connect(adminDR).addSellersToAllowList(disputeResolver.id, allowedSellersToAdd);

        // Create an offer with condition, twin and bundle testing for the events
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createOfferWithConditionAndTwinAndBundle(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              condition,
              twin,
              agentId,
              offerFeeLimit
            )
        ).to.emit(orchestrationHandler, "OfferCreated");
      });

      it("Should allow creation of an offer with royalty recipients", async function () {
        // Add royalty recipients
        const royaltyRecipientList = new RoyaltyRecipientInfoList([
          new RoyaltyRecipientInfo(other1.address, "100"),
          new RoyaltyRecipientInfo(other2.address, "200"),
        ]);
        await accountHandler.connect(admin).addRoyaltyRecipients(seller.id, royaltyRecipientList.toStruct());

        // Add royalty info to the offer
        offer.royaltyInfo = [new RoyaltyInfo([other1.address, ZeroAddress], ["150", "10"])];

        // Create an offer with condition, twin and bundle testing for the events
        await expect(
          orchestrationHandler
            .connect(assistant)
            .createOfferWithConditionAndTwinAndBundle(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              condition,
              twin,
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offer.toStruct()),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            assistant.address
          );
      });

      context("When offers have non zero agent ids", async function () {
        beforeEach(async function () {
          // Required constructor params
          agentId = "3"; // argument sent to contract for createAgent will be ignored

          // Create a valid agent, then set fields in tests directly
          agent = mockAgent(await other1.getAddress());
          agent.id = agentId;
          agent.feePercentage = "3000"; // 30%
          expect(agent.isValid()).is.true;

          // Create an agent
          await accountHandler.connect(rando).createAgent(agent);

          agentFee = ((BigInt(offer.price) * BigInt(agent.feePercentage)) / 10000n).toString();
          offerFees.agentFee = agentFee;
          offerFeesStruct = offerFees.toStruct();
        });

        it("should emit an OfferCreated, a GroupCreated, a TwinCreated and a BundleCreated events", async function () {
          // Create an offer with condition, twin and bundle
          const tx = await orchestrationHandler
            .connect(assistant)
            .createOfferWithConditionAndTwinAndBundle(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              condition,
              twin,
              agentId,
              offerFeeLimit
            );

          // OfferCreated event
          await expect(tx)
            .to.emit(orchestrationHandler, "OfferCreated")
            .withArgs(
              nextOfferId,
              seller.id,
              compareOfferStructs.bind(offerStruct),
              offerDatesStruct,
              offerDurationsStruct,
              disputeResolutionTermsStruct,
              offerFeesStruct,
              agentId,
              await assistant.getAddress()
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
      });

      context("Preminted offer - createPremintedOfferWithConditionAndTwinAndBundle()", async function () {
        let firstTokenId, lastTokenId, reservedRangeLength, range;
        let premintParameters;

        beforeEach(async function () {
          offer.quantityAvailable = reservedRangeLength = 1;
          offerStruct = offer.toStruct();
          firstTokenId = 1;
          lastTokenId = firstTokenId + reservedRangeLength - 1;
          const tokenIdStart = deriveTokenId(offer.id, firstTokenId);
          range = new Range(
            tokenIdStart.toString(),
            reservedRangeLength.toString(),
            "0",
            "0",
            await assistant.getAddress()
          );

          // Voucher clone contract
          expectedCloneAddress = calculateCloneAddress(
            await accountHandler.getAddress(),
            beaconProxyAddress,
            admin.address
          );
          bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);
          premintParameters = [reservedRangeLength, await assistant.getAddress()];
        });

        it("should emit an OfferCreated, a GroupCreated, a TwinCreated, a BundleCreated and a RangeReserved events", async function () {
          // Create a preminted offer with condition, twin and bundle
          const tx = await orchestrationHandler
            .connect(assistant)
            .createPremintedOfferWithConditionAndTwinAndBundle(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              premintParameters,
              condition,
              twin,
              agentId,
              offerFeeLimit
            );

          // OfferCreated event
          await expect(tx)
            .to.emit(orchestrationHandler, "OfferCreated")
            .withArgs(
              nextOfferId,
              seller.id,
              compareOfferStructs.bind(offerStruct),
              offerDatesStruct,
              offerDurationsStruct,
              disputeResolutionTermsStruct,
              offerFeesStruct,
              agentId,
              await assistant.getAddress()
            );

          // RangeReserved event (on protocol contract)
          await expect(tx)
            .to.emit(orchestrationHandler, "RangeReserved")
            .withArgs(
              nextOfferId,
              offer.sellerId,
              firstTokenId,
              lastTokenId,
              await assistant.getAddress(),
              await assistant.getAddress()
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

          // RangeReserved event (on voucher contract)
          await expect(tx).to.emit(bosonVoucher, "RangeReserved").withArgs(nextOfferId, range.toStruct());
        });

        it("should update state", async function () {
          // Create a preminted offer with condition, twin and bundle
          await orchestrationHandler
            .connect(assistant)
            .createPremintedOfferWithConditionAndTwinAndBundle(
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              premintParameters,
              condition,
              twin,
              agentId,
              offerFeeLimit
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

          // Quantity available should be 0, since whole range is reserved
          offer.quantityAvailable = "0";

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

          // Voucher clone contract
          const returnedRange = Range.fromStruct(await bosonVoucher.getRangeByOfferId(offer.id));
          assert.equal(returnedRange.toString(), range.toString(), "Range mismatch");
          const availablePremints = await bosonVoucher.getAvailablePreMints(offer.id);
          assert.equal(availablePremints.toString(), reservedRangeLength, "Available Premints mismatch");
        });
      });

      context("💔 Revert Reasons", async function () {
        it("The orchestration region of protocol is paused", async function () {
          // Pause the orchestration region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Orchestration]);

          // Attempt to orchestrate expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createOfferWithConditionAndTwinAndBundle(
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                condition,
                twin,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Orchestration);
        });

        it("The offers region of protocol is paused", async function () {
          // Pause the offers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Offers]);

          // Attempt to create an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createOfferWithConditionAndTwinAndBundle(
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                condition,
                twin,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Offers);
        });

        it("The groups region of protocol is paused", async function () {
          // Pause the groups region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Groups]);

          // Attempt to create a group, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createOfferWithConditionAndTwinAndBundle(
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                condition,
                twin,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Groups);
        });

        it("The bundles region of protocol is paused", async function () {
          // Pause the bundles region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Bundles]);

          // Attempt to create a bundle, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createOfferWithConditionAndTwinAndBundle(
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                condition,
                twin,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Bundles);
        });

        it("The twins region of protocol is paused", async function () {
          // Pause the twins region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Twins]);

          // Attempt to create a twin, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createOfferWithConditionAndTwinAndBundle(
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                condition,
                twin,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Twins);
        });

        it("The exchanges region of protocol is paused [preminted offers]", async function () {
          // Pause the exchanges region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Exchanges]);

          // Attempt to create a twin, expecting revert
          const reservedRangeLength = offer.quantityAvailable;
          const premintParameters = [reservedRangeLength, await assistant.getAddress()];
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createPremintedOfferWithConditionAndTwinAndBundle(
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                premintParameters,
                condition,
                twin,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Exchanges);
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

        condition = mockCondition({
          tokenType: TokenType.MultiToken,
          tokenAddress: await other2.getAddress(),
          method: EvaluationMethod.Threshold,
        });
        expect(condition.isValid()).to.be.true;

        group = new Group(nextGroupId, seller.id, offerIds);

        expect(group.isValid()).is.true;

        // How that group looks as a returned struct
        groupStruct = group.toStruct();
      });

      it("should emit a SellerCreated, an OfferCreated, and a GroupCreated event", async function () {
        // Create a seller and an offer with condition, testing for the events
        const tx = await orchestrationHandler
          .connect(assistant)
          .createSellerAndOfferWithCondition(
            seller,
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            condition,
            emptyAuthToken,
            voucherInitValues,
            agentId,
            offerFeeLimit
          );

        expectedCloneAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          admin.address
        );

        // SellerCreated and OfferCreated events
        await expect(tx)
          .to.emit(orchestrationHandler, "SellerCreated")
          .withArgs(seller.id, sellerStruct, expectedCloneAddress, emptyAuthTokenStruct, await assistant.getAddress());

        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );

        const expectedRoyaltyRecipientInfoList = new RoyaltyRecipientInfoList([
          new RoyaltyRecipientInfo(ZeroAddress, voucherInitValues.royaltyPercentage),
        ]);

        await expect(tx)
          .to.emit(accountHandler, "RoyaltyRecipientsChanged")
          .withArgs(
            seller.id,
            compareRoyaltyRecipientInfoLists.bind(expectedRoyaltyRecipientInfoList.toStruct()),
            assistant.address
          );

        // Events with structs that contain arrays must be tested differently //ToDo: use predicates instead
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
        bosonVoucher = await getContractAt("IBosonVoucher", expectedCloneAddress);

        await expect(tx).to.emit(bosonVoucher, "ContractURIChanged").withArgs(contractURI);

        bosonVoucher = await getContractAt("OwnableUpgradeable", expectedCloneAddress);

        await expect(tx)
          .to.emit(bosonVoucher, "OwnershipTransferred")
          .withArgs(ZeroAddress, await assistant.getAddress());
      });

      it("should update state", async function () {
        // Create a seller and an offer with condition
        await orchestrationHandler
          .connect(assistant)
          .createSellerAndOfferWithCondition(
            seller,
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            condition,
            emptyAuthToken,
            voucherInitValues,
            agentId,
            offerFeeLimit
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

        // Get the collections information
        expectedCloneAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          admin.address
        );
        const [defaultVoucherAddress, additionalCollections] = await accountHandler
          .connect(rando)
          .getSellersCollections(seller.id);
        expect(defaultVoucherAddress).to.equal(expectedCloneAddress, "Wrong default voucher address");
        expect(additionalCollections.length).to.equal(0, "Wrong number of additional collections");

        // Voucher clone contract
        bosonVoucher = await ethers.getContractAt("OwnableUpgradeable", expectedCloneAddress);

        expect(await bosonVoucher.owner()).to.equal(await assistant.getAddress(), "Wrong voucher clone owner");

        bosonVoucher = await getContractAt("IBosonVoucher", expectedCloneAddress);
        expect(await bosonVoucher.contractURI()).to.equal(contractURI, "Wrong contract URI");
        expect(await bosonVoucher.name()).to.equal(
          VOUCHER_NAME + " S" + seller.id + "_C0",
          "Wrong voucher client name"
        );
        expect(await bosonVoucher.symbol()).to.equal(
          VOUCHER_SYMBOL + "_S" + seller.id + "_C0",
          "Wrong voucher client symbol"
        );
      });

      it("should update state when voucherInitValues has zero royaltyPercentage and exchangeId does not exist", async function () {
        // ERC2981 Royalty fee is 0%
        voucherInitValues.royaltyPercentage = "0"; //0%
        expect(voucherInitValues.isValid()).is.true;
        offer.royaltyInfo = [new RoyaltyInfo([ZeroAddress], [voucherInitValues.royaltyPercentage])];

        // Create a seller and an offer with condition
        await orchestrationHandler
          .connect(assistant)
          .createSellerAndOfferWithCondition(
            seller,
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            condition,
            emptyAuthToken,
            voucherInitValues,
            agentId,
            offerFeeLimit
          );

        // Get the collections information
        expectedCloneAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          admin.address
        );
        const [defaultVoucherAddress, additionalCollections] = await accountHandler
          .connect(rando)
          .getSellersCollections(seller.id);
        expect(defaultVoucherAddress).to.equal(expectedCloneAddress, "Wrong default voucher address");
        expect(additionalCollections.length).to.equal(0, "Wrong number of additional collections");

        // Voucher clone contract
        bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);
        expect(await bosonVoucher.contractURI()).to.equal(contractURI, "Wrong contract URI");
        expect(await bosonVoucher.name()).to.equal(
          VOUCHER_NAME + " S" + seller.id + "_C0",
          "Wrong voucher client name"
        );
        expect(await bosonVoucher.symbol()).to.equal(
          VOUCHER_SYMBOL + "_S" + seller.id + "_C0",
          "Wrong voucher client symbol"
        );

        // Prepare random parameters
        let exchangeId = "1234"; // An exchange id that does not exist
        let offerPrice = "1234567"; // A random offer price

        //Exchange exists
        let exists;
        [exists] = await exchangeHandler.connect(rando).getExchangeState(exchangeId);
        expect(exists).to.be.false;

        // Get Royalty Information for Exchange id i.e. Voucher token id
        let receiver, royaltyAmount;
        [receiver, royaltyAmount] = await bosonVoucher.connect(assistant).royaltyInfo(exchangeId, offerPrice);

        // Expectations
        let expectedRecipient = ZeroAddress; //expect zero address when exchange id does not exist
        let expectedRoyaltyAmount = "0"; // Zero Fee when exchange id does not exist

        assert.equal(receiver, expectedRecipient, "Recipient address is incorrect");
        assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");
      });

      it("should update state when voucherInitValues has non zero royaltyPercentage and exchangeId does not exist", async function () {
        // ERC2981 Royalty fee is 10%
        voucherInitValues.royaltyPercentage = "1000"; //10%
        expect(voucherInitValues.isValid()).is.true;
        offer.royaltyInfo = [new RoyaltyInfo([ZeroAddress], [voucherInitValues.royaltyPercentage])];

        // Create a seller and an offer with condition
        await orchestrationHandler
          .connect(assistant)
          .createSellerAndOfferWithCondition(
            seller,
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            condition,
            emptyAuthToken,
            voucherInitValues,
            agentId,
            offerFeeLimit
          );

        // Get the collections information
        expectedCloneAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          admin.address
        );
        const [defaultVoucherAddress, additionalCollections] = await accountHandler
          .connect(rando)
          .getSellersCollections(seller.id);
        expect(defaultVoucherAddress).to.equal(expectedCloneAddress, "Wrong default voucher address");
        expect(additionalCollections.length).to.equal(0, "Wrong number of additional collections");

        // Voucher clone contract
        bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);
        expect(await bosonVoucher.contractURI()).to.equal(contractURI, "Wrong contract URI");
        expect(await bosonVoucher.name()).to.equal(
          VOUCHER_NAME + " S" + seller.id + "_C0",
          "Wrong voucher client name"
        );
        expect(await bosonVoucher.symbol()).to.equal(
          VOUCHER_SYMBOL + "_S" + seller.id + "_C0",
          "Wrong voucher client symbol"
        );

        // Prepare random parameters
        let exchangeId = "1234"; // An exchange id that does not exist
        let offerPrice = "1234567"; // A random offer price

        //Exchange exists
        let exists;
        [exists] = await exchangeHandler.connect(rando).getExchangeState(exchangeId);
        expect(exists).to.be.false;

        // Get Royalty Information for Exchange id i.e. Voucher token id
        let receiver, royaltyAmount;
        [receiver, royaltyAmount] = await bosonVoucher.connect(assistant).royaltyInfo(exchangeId, offerPrice);

        // Expectations
        let expectedRecipient = ZeroAddress; //expect zero address when exchange id does not exist
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
          .connect(assistant)
          .createSellerAndOfferWithCondition(
            seller,
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            condition,
            emptyAuthToken,
            voucherInitValues,
            agentId,
            offerFeeLimit
          );

        // SellerCreated and OfferCreated events
        await expect(tx)
          .to.emit(orchestrationHandler, "SellerCreated")
          .withArgs(
            sellerId,
            sellerStruct,
            calculateCloneAddress(await accountHandler.getAddress(), beaconProxyAddress, admin.address),
            emptyAuthTokenStruct,
            await assistant.getAddress()
          );

        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            sellerId,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
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
          agent = mockAgent(await other1.getAddress());
          agent.id = agentId;
          expect(agent.isValid()).is.true;

          // Create an agent
          await accountHandler.connect(rando).createAgent(agent);

          agentFee = ((BigInt(offer.price) * BigInt(agent.feePercentage)) / 10000n).toString();
          offerFees.agentFee = agentFee;
          offerFeesStruct = offerFees.toStruct();
        });

        it("should emit a SellerCreated, an OfferCreated, and a GroupCreated event", async function () {
          // Create a seller and an offer with condition, testing for the events
          const tx = await orchestrationHandler
            .connect(assistant)
            .createSellerAndOfferWithCondition(
              seller,
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              condition,
              emptyAuthToken,
              voucherInitValues,
              agentId,
              offerFeeLimit
            );

          // SellerCreated and OfferCreated events
          await expect(tx)
            .to.emit(orchestrationHandler, "SellerCreated")
            .withArgs(
              seller.id,
              sellerStruct,
              calculateCloneAddress(await accountHandler.getAddress(), beaconProxyAddress, admin.address),
              emptyAuthTokenStruct,
              await assistant.getAddress()
            );

          await expect(tx)
            .to.emit(orchestrationHandler, "OfferCreated")
            .withArgs(
              nextOfferId,
              seller.id,
              compareOfferStructs.bind(offerStruct),
              offerDatesStruct,
              offerDurationsStruct,
              disputeResolutionTermsStruct,
              offerFeesStruct,
              agentId,
              await assistant.getAddress()
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
      });

      context("Preminted offer - createSellerAndPremintedOfferWithCondition()", async function () {
        let firstTokenId, lastTokenId, reservedRangeLength, range;
        let premintParameters;

        beforeEach(async function () {
          offer.quantityAvailable = reservedRangeLength = 100;
          offerStruct = offer.toStruct();
          firstTokenId = 1;
          lastTokenId = firstTokenId + reservedRangeLength - 1;
          const tokenIdStart = deriveTokenId(offer.id, firstTokenId);
          range = new Range(
            tokenIdStart.toString(),
            reservedRangeLength.toString(),
            "0",
            "0",
            await assistant.getAddress()
          );
          premintParameters = [reservedRangeLength, await assistant.getAddress()];
        });

        it("should emit a SellerCreated, an OfferCreated, a GroupCreated and a RangeReserved event", async function () {
          // Create a seller and a preminted offer with condition, testing for the events
          const tx = await orchestrationHandler
            .connect(assistant)
            .createSellerAndPremintedOfferWithCondition(
              seller,
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              premintParameters,
              condition,
              emptyAuthToken,
              voucherInitValues,
              agentId,
              offerFeeLimit
            );

          expectedCloneAddress = calculateCloneAddress(
            await accountHandler.getAddress(),
            beaconProxyAddress,
            admin.address
          );

          // SellerCreated and OfferCreated RangeReserved events
          await expect(tx)
            .to.emit(orchestrationHandler, "SellerCreated")
            .withArgs(
              seller.id,
              sellerStruct,
              expectedCloneAddress,
              emptyAuthTokenStruct,
              await assistant.getAddress()
            );

          await expect(tx)
            .to.emit(orchestrationHandler, "OfferCreated")
            .withArgs(
              nextOfferId,
              seller.id,
              compareOfferStructs.bind(offerStruct),
              offerDatesStruct,
              offerDurationsStruct,
              disputeResolutionTermsStruct,
              offerFeesStruct,
              agentId,
              await assistant.getAddress()
            );

          await expect(tx)
            .to.emit(orchestrationHandler, "RangeReserved")
            .withArgs(
              nextOfferId,
              offer.sellerId,
              firstTokenId,
              lastTokenId,
              await assistant.getAddress(),
              await assistant.getAddress()
            );

          const expectedRoyaltyRecipientInfoList = new RoyaltyRecipientInfoList([
            new RoyaltyRecipientInfo(ZeroAddress, voucherInitValues.royaltyPercentage),
          ]);

          await expect(tx)
            .to.emit(accountHandler, "RoyaltyRecipientsChanged")
            .withArgs(
              seller.id,
              compareRoyaltyRecipientInfoLists.bind(expectedRoyaltyRecipientInfoList.toStruct()),
              assistant.address
            );

          // Events with structs that contain arrays must be tested differently //ToDo use predicates
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
          bosonVoucher = await getContractAt("IBosonVoucher", expectedCloneAddress);

          await expect(tx).to.emit(bosonVoucher, "ContractURIChanged").withArgs(contractURI);
          await expect(tx).to.emit(bosonVoucher, "RangeReserved").withArgs(nextOfferId, range.toStruct());

          bosonVoucher = await getContractAt("OwnableUpgradeable", expectedCloneAddress);

          await expect(tx)
            .to.emit(bosonVoucher, "OwnershipTransferred")
            .withArgs(ZeroAddress, await assistant.getAddress());
        });

        it("should update state", async function () {
          // Create a seller and an offer with condition
          await orchestrationHandler
            .connect(assistant)
            .createSellerAndPremintedOfferWithCondition(
              seller,
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              premintParameters,
              condition,
              emptyAuthToken,
              voucherInitValues,
              agentId,
              offerFeeLimit
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

          // Quantity available should be 0, since whole range is reserved
          offer.quantityAvailable = "0";

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

          // Get the collections information
          expectedCloneAddress = calculateCloneAddress(
            await accountHandler.getAddress(),
            beaconProxyAddress,
            admin.address
          );
          const [defaultVoucherAddress, additionalCollections] = await accountHandler
            .connect(rando)
            .getSellersCollections(seller.id);
          expect(defaultVoucherAddress).to.equal(expectedCloneAddress, "Wrong default voucher address");
          expect(additionalCollections.length).to.equal(0, "Wrong number of additional collections");

          // Voucher clone contract
          bosonVoucher = await ethers.getContractAt("OwnableUpgradeable", expectedCloneAddress);

          expect(await bosonVoucher.owner()).to.equal(await assistant.getAddress(), "Wrong voucher clone owner");

          bosonVoucher = await getContractAt("IBosonVoucher", expectedCloneAddress);
          expect(await bosonVoucher.contractURI()).to.equal(contractURI, "Wrong contract URI");
          expect(await bosonVoucher.name()).to.equal(
            VOUCHER_NAME + " S" + seller.id + "_C0",
            "Wrong voucher client name"
          );
          expect(await bosonVoucher.symbol()).to.equal(
            VOUCHER_SYMBOL + "_S" + seller.id + "_C0",
            "Wrong voucher client symbol"
          );
          const returnedRange = Range.fromStruct(await bosonVoucher.getRangeByOfferId(offer.id));
          assert.equal(returnedRange.toString(), range.toString(), "Range mismatch");
          const availablePremints = await bosonVoucher.getAvailablePreMints(offer.id);
          assert.equal(availablePremints.toString(), reservedRangeLength, "Available Premints mismatch");
        });
      });

      context("💔 Revert Reasons", async function () {
        it("The orchestration region of protocol is paused", async function () {
          // Pause the orchestration region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Orchestration]);

          // Attempt to orchestrate expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOfferWithCondition(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                condition,
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Orchestration);
        });

        it("The sellers region of protocol is paused", async function () {
          // Pause the sellers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Sellers]);

          // Attempt to create a seller, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOfferWithCondition(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                condition,
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Sellers);
        });

        it("The offers region of protocol is paused", async function () {
          // Pause the offers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Offers]);

          // Attempt to create an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOfferWithCondition(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                condition,
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Offers);
        });

        it("The groups region of protocol is paused", async function () {
          // Pause the groups region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Groups]);

          // Attempt to create an group, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOfferWithCondition(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                condition,
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Groups);
        });

        it("The exchanges region of protocol is paused [preminted offers]", async function () {
          // Pause the exchanges region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Exchanges]);

          // Attempt to create an group, expecting revert
          const reservedRangeLength = offer.quantityAvailable;
          const premintParameters = [reservedRangeLength, await assistant.getAddress()];
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndPremintedOfferWithCondition(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                premintParameters,
                condition,
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Exchanges);
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
        twin = mockTwin(await bosonToken.getAddress());
        twin.sellerId = seller.id;

        // How that twin looks as a returned struct
        twinStruct = twin.toStruct();
      });

      it("should emit a SellerCreated, an OfferCreated, a TwinCreated and a BundleCreated event", async function () {
        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1); // approving the twin handler

        // Create a seller, an offer with condition and a twin with bundle, testing for the events
        const tx = await orchestrationHandler
          .connect(assistant)
          .createSellerAndOfferAndTwinWithBundle(
            seller,
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            twin,
            emptyAuthToken,
            voucherInitValues,
            agentId,
            offerFeeLimit
          );

        expectedCloneAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          admin.address
        );

        // SellerCreated and OfferCreated events
        await expect(tx)
          .to.emit(orchestrationHandler, "SellerCreated")
          .withArgs(seller.id, sellerStruct, expectedCloneAddress, emptyAuthTokenStruct, await assistant.getAddress());

        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );

        const expectedRoyaltyRecipientInfoList = new RoyaltyRecipientInfoList([
          new RoyaltyRecipientInfo(ZeroAddress, voucherInitValues.royaltyPercentage),
        ]);

        await expect(tx)
          .to.emit(accountHandler, "RoyaltyRecipientsChanged")
          .withArgs(
            seller.id,
            compareRoyaltyRecipientInfoLists.bind(expectedRoyaltyRecipientInfoList.toStruct()),
            assistant.address
          );

        // Events with structs that contain arrays must be tested differently // ToDo: use predicates
        const txReceipt = await tx.wait();

        // TwinCreated event
        const eventTwinCreated = getEvent(txReceipt, orchestrationHandler, "TwinCreated");
        const twinInstance = Twin.fromStruct(eventTwinCreated.twin);
        // Validate the instance
        expect(twinInstance.isValid()).to.be.true;

        assert.equal(eventTwinCreated.twinId.toString(), twin.id, "Twin Id is incorrect");
        assert.equal(eventTwinCreated.sellerId.toString(), twin.sellerId, "Seller Id is incorrect");
        assert.equal(eventTwinCreated.executedBy.toString(), await assistant.getAddress(), "Executed by is incorrect");
        assert.equal(twinInstance.toString(), twin.toString(), "Twin struct is incorrect");

        // BundleCreated event
        const eventBundleCreated = getEvent(txReceipt, orchestrationHandler, "BundleCreated");
        const bundleInstance = Bundle.fromStruct(eventBundleCreated.bundle);
        // Validate the instance
        expect(bundleInstance.isValid()).to.be.true;

        assert.equal(eventBundleCreated.bundleId.toString(), bundle.id, "Bundle Id is incorrect");
        assert.equal(eventBundleCreated.sellerId.toString(), bundle.sellerId, "Seller Id is incorrect");
        assert.equal(
          eventBundleCreated.executedBy.toString(),
          await assistant.getAddress(),
          "Executed by is incorrect"
        );
        assert.equal(bundleInstance.toString(), bundle.toString(), "Bundle struct is incorrect");

        // Voucher clone contract
        bosonVoucher = await getContractAt("IBosonVoucher", expectedCloneAddress);

        await expect(tx).to.emit(bosonVoucher, "ContractURIChanged").withArgs(contractURI);
        bosonVoucher = await getContractAt("OwnableUpgradeable", expectedCloneAddress);

        await expect(tx)
          .to.emit(bosonVoucher, "OwnershipTransferred")
          .withArgs(ZeroAddress, await assistant.getAddress());
      });

      it("should update state", async function () {
        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1); // approving the twin handler

        // Create a seller, an offer with condition and a twin with bundle, testing for the events
        await orchestrationHandler
          .connect(assistant)
          .createSellerAndOfferAndTwinWithBundle(
            seller,
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            twin,
            emptyAuthToken,
            voucherInitValues,
            agentId,
            offerFeeLimit
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

        // Get the collections information
        expectedCloneAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          admin.address
        );
        const [defaultVoucherAddress, additionalCollections] = await accountHandler
          .connect(rando)
          .getSellersCollections(seller.id);
        expect(defaultVoucherAddress).to.equal(expectedCloneAddress, "Wrong default voucher address");
        expect(additionalCollections.length).to.equal(0, "Wrong number of additional collections");

        // Voucher clone contract
        bosonVoucher = await ethers.getContractAt("OwnableUpgradeable", expectedCloneAddress);

        expect(await bosonVoucher.owner()).to.equal(await assistant.getAddress(), "Wrong voucher clone owner");

        bosonVoucher = await getContractAt("IBosonVoucher", expectedCloneAddress);
        expect(await bosonVoucher.contractURI()).to.equal(contractURI, "Wrong contract URI");
        expect(await bosonVoucher.name()).to.equal(
          VOUCHER_NAME + " S" + seller.id + "_C0",
          "Wrong voucher client name"
        );
        expect(await bosonVoucher.symbol()).to.equal(
          VOUCHER_SYMBOL + "_S" + seller.id + "_C0",
          "Wrong voucher client symbol"
        );
      });

      it("should update state when voucherInitValues has zero royaltyPercentage and exchangeId does not exist", async function () {
        // ERC2981 Royalty fee is 0%
        voucherInitValues.royaltyPercentage = "0"; //0%
        expect(voucherInitValues.isValid()).is.true;
        offer.royaltyInfo = [new RoyaltyInfo([ZeroAddress], [voucherInitValues.royaltyPercentage])];

        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1); // approving the twin handler

        // Create a seller, an offer with condition and a twin with bundle, testing for the events
        await orchestrationHandler
          .connect(assistant)
          .createSellerAndOfferAndTwinWithBundle(
            seller,
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            twin,
            emptyAuthToken,
            voucherInitValues,
            agentId,
            offerFeeLimit
          );

        // Get the collections information
        expectedCloneAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          admin.address
        );
        const [defaultVoucherAddress, additionalCollections] = await accountHandler
          .connect(rando)
          .getSellersCollections(seller.id);
        expect(defaultVoucherAddress).to.equal(expectedCloneAddress, "Wrong default voucher address");
        expect(additionalCollections.length).to.equal(0, "Wrong number of additional collections");

        // Voucher clone contract
        bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);
        expect(await bosonVoucher.contractURI()).to.equal(contractURI, "Wrong contract URI");
        expect(await bosonVoucher.name()).to.equal(
          VOUCHER_NAME + " S" + seller.id + "_C0",
          "Wrong voucher client name"
        );
        expect(await bosonVoucher.symbol()).to.equal(
          VOUCHER_SYMBOL + "_S" + seller.id + "_C0",
          "Wrong voucher client symbol"
        );

        // Prepare random parameters
        let exchangeId = "1234"; // An exchange id that does not exist
        let offerPrice = "1234567"; // A random offer price

        //Exchange exists
        let exists;
        [exists] = await exchangeHandler.connect(rando).getExchangeState(exchangeId);
        expect(exists).to.be.false;

        // Get Royalty Information for Exchange id i.e. Voucher token id
        let receiver, royaltyAmount;
        [receiver, royaltyAmount] = await bosonVoucher.connect(assistant).royaltyInfo(exchangeId, offerPrice);

        // Expectations
        let expectedRecipient = ZeroAddress; //expect zero address when exchange id does not exist
        let expectedRoyaltyAmount = "0"; // Zero Fee when exchange id does not exist

        assert.equal(receiver, expectedRecipient, "Recipient address is incorrect");
        assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");
      });

      it("should update state when voucherInitValues has non zero royaltyPercentage and exchangeId does not exist", async function () {
        // ERC2981 Royalty fee is 10%
        voucherInitValues.royaltyPercentage = "1000"; //10%
        expect(voucherInitValues.isValid()).is.true;
        offer.royaltyInfo = [new RoyaltyInfo([ZeroAddress], [voucherInitValues.royaltyPercentage])];

        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1); // approving the twin handler

        // Create a seller, an offer with condition and a twin with bundle, testing for the events
        await orchestrationHandler
          .connect(assistant)
          .createSellerAndOfferAndTwinWithBundle(
            seller,
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            twin,
            emptyAuthToken,
            voucherInitValues,
            agentId,
            offerFeeLimit
          );

        // Get the collections information
        expectedCloneAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          admin.address
        );
        const [defaultVoucherAddress, additionalCollections] = await accountHandler
          .connect(rando)
          .getSellersCollections(seller.id);
        expect(defaultVoucherAddress).to.equal(expectedCloneAddress, "Wrong default voucher address");
        expect(additionalCollections.length).to.equal(0, "Wrong number of additional collections");

        // Voucher clone contract
        bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);
        expect(await bosonVoucher.contractURI()).to.equal(contractURI, "Wrong contract URI");
        expect(await bosonVoucher.name()).to.equal(
          VOUCHER_NAME + " S" + seller.id + "_C0",
          "Wrong voucher client name"
        );
        expect(await bosonVoucher.symbol()).to.equal(
          VOUCHER_SYMBOL + "_S" + seller.id + "_C0",
          "Wrong voucher client symbol"
        );

        // Prepare random parameters
        let exchangeId = "1234"; // An exchange id that does not exist
        let offerPrice = "1234567"; // A random offer price

        //Exchange exists
        let exists;
        [exists] = await exchangeHandler.connect(rando).getExchangeState(exchangeId);
        expect(exists).to.be.false;

        // Get Royalty Information for Exchange id i.e. Voucher token id
        let receiver, royaltyAmount;
        [receiver, royaltyAmount] = await bosonVoucher.connect(assistant).royaltyInfo(exchangeId, offerPrice);

        // Expectations
        let expectedRecipient = ZeroAddress; //expect zero address when exchange id does not exist
        let expectedRoyaltyAmount = "0"; // Zero Fee when exchange id does not exist

        assert.equal(receiver, expectedRecipient, "Recipient address is incorrect");
        assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");
      });

      it("should ignore any provided ids and assign the next available", async function () {
        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1); // approving the twin handler

        const sellerId = seller.id;
        seller.id = "333";
        offer.id = "555";
        twin.id = "777";

        // Create a seller, an offer with condition and a twin with bundle, testing for the events
        const tx = await orchestrationHandler
          .connect(assistant)
          .createSellerAndOfferAndTwinWithBundle(
            seller,
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            twin,
            emptyAuthToken,
            voucherInitValues,
            agentId,
            offerFeeLimit
          );

        // SellerCreated and OfferCreated events
        await expect(tx)
          .to.emit(orchestrationHandler, "SellerCreated")
          .withArgs(
            sellerId,
            sellerStruct,
            calculateCloneAddress(await accountHandler.getAddress(), beaconProxyAddress, admin.address),
            emptyAuthTokenStruct,
            await assistant.getAddress()
          );

        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            sellerId,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
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
          agent = mockAgent(await other1.getAddress());
          agent.id = agentId;
          expect(agent.isValid()).is.true;

          // Create an agent
          await accountHandler.connect(rando).createAgent(agent);

          agentFee = ((BigInt(offer.price) * BigInt(agent.feePercentage)) / 10000n).toString();
          offerFees.agentFee = agentFee;
          offerFeesStruct = offerFees.toStruct();
        });

        it("should emit a SellerCreated, an OfferCreated, a TwinCreated and a BundleCreated event", async function () {
          // Approving the twinHandler contract to transfer seller's tokens
          await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1); // approving the twin handler

          // Create a seller, an offer with condition and a twin with bundle, testing for the events
          const tx = await orchestrationHandler
            .connect(assistant)
            .createSellerAndOfferAndTwinWithBundle(
              seller,
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              twin,
              emptyAuthToken,
              voucherInitValues,
              agentId,
              offerFeeLimit
            );

          // SellerCreated and OfferCreated events
          await expect(tx)
            .to.emit(orchestrationHandler, "SellerCreated")
            .withArgs(
              seller.id,
              sellerStruct,
              calculateCloneAddress(await accountHandler.getAddress(), beaconProxyAddress, admin.address),
              emptyAuthTokenStruct,
              await assistant.getAddress()
            );

          await expect(tx)
            .to.emit(orchestrationHandler, "OfferCreated")
            .withArgs(
              nextOfferId,
              seller.id,
              compareOfferStructs.bind(offerStruct),
              offerDatesStruct,
              offerDurationsStruct,
              disputeResolutionTermsStruct,
              offerFeesStruct,
              agentId,
              await assistant.getAddress()
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
          assert.equal(
            eventTwinCreated.executedBy.toString(),
            await assistant.getAddress(),
            "Executed by is incorrect"
          );
          assert.equal(twinInstance.toString(), twin.toString(), "Twin struct is incorrect");

          // BundleCreated event
          const eventBundleCreated = getEvent(txReceipt, orchestrationHandler, "BundleCreated");
          const bundleInstance = Bundle.fromStruct(eventBundleCreated.bundle);
          // Validate the instance
          expect(bundleInstance.isValid()).to.be.true;

          assert.equal(eventBundleCreated.bundleId.toString(), bundle.id, "Bundle Id is incorrect");
          assert.equal(eventBundleCreated.sellerId.toString(), bundle.sellerId, "Seller Id is incorrect");
          assert.equal(
            eventBundleCreated.executedBy.toString(),
            await assistant.getAddress(),
            "Executed by is incorrect"
          );
          assert.equal(bundleInstance.toString(), bundle.toString(), "Bundle struct is incorrect");
        });
      });

      context("Preminted offer - createSellerAndPremintedOfferAndTwinWithBundle()", async function () {
        let firstTokenId, lastTokenId, reservedRangeLength, range;
        let premintParameters;

        beforeEach(async function () {
          offer.quantityAvailable = reservedRangeLength = 1;
          offerStruct = offer.toStruct();
          firstTokenId = 1;
          lastTokenId = firstTokenId + reservedRangeLength - 1;
          const tokenIdStart = deriveTokenId(offer.id, firstTokenId);
          range = new Range(
            tokenIdStart.toString(),
            reservedRangeLength.toString(),
            "0",
            "0",
            await assistant.getAddress()
          );
          premintParameters = [reservedRangeLength, await assistant.getAddress()];
        });

        it("should emit a SellerCreated, an OfferCreated, a TwinCreated, a BundleCreated and RangeReserved event", async function () {
          // Approving the twinHandler contract to transfer seller's tokens
          await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1); // approving the twin handler

          // Create a seller, a preminted offer with condition and a twin with bundle, testing for the events
          const tx = await orchestrationHandler
            .connect(assistant)
            .createSellerAndPremintedOfferAndTwinWithBundle(
              seller,
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              premintParameters,
              twin,
              emptyAuthToken,
              voucherInitValues,
              agentId,
              offerFeeLimit
            );

          expectedCloneAddress = calculateCloneAddress(
            await accountHandler.getAddress(),
            beaconProxyAddress,
            admin.address
          );

          // SellerCreated, OfferCreated and RangeReserved events
          await expect(tx)
            .to.emit(orchestrationHandler, "SellerCreated")
            .withArgs(
              seller.id,
              sellerStruct,
              expectedCloneAddress,
              emptyAuthTokenStruct,
              await assistant.getAddress()
            );

          await expect(tx)
            .to.emit(orchestrationHandler, "OfferCreated")
            .withArgs(
              nextOfferId,
              seller.id,
              compareOfferStructs.bind(offerStruct),
              offerDatesStruct,
              offerDurationsStruct,
              disputeResolutionTermsStruct,
              offerFeesStruct,
              agentId,
              await assistant.getAddress()
            );

          await expect(tx)
            .to.emit(orchestrationHandler, "RangeReserved")
            .withArgs(
              nextOfferId,
              offer.sellerId,
              firstTokenId,
              lastTokenId,
              await assistant.getAddress(),
              await assistant.getAddress()
            );

          const expectedRoyaltyRecipientInfoList = new RoyaltyRecipientInfoList([
            new RoyaltyRecipientInfo(ZeroAddress, voucherInitValues.royaltyPercentage),
          ]);

          await expect(tx)
            .to.emit(accountHandler, "RoyaltyRecipientsChanged")
            .withArgs(
              seller.id,
              compareRoyaltyRecipientInfoLists.bind(expectedRoyaltyRecipientInfoList.toStruct()),
              assistant.address
            );

          // Events with structs that contain arrays must be tested differently // ToDo use predicates
          const txReceipt = await tx.wait();

          // TwinCreated event
          const eventTwinCreated = getEvent(txReceipt, orchestrationHandler, "TwinCreated");
          const twinInstance = Twin.fromStruct(eventTwinCreated.twin);
          // Validate the instance
          expect(twinInstance.isValid()).to.be.true;

          assert.equal(eventTwinCreated.twinId.toString(), twin.id, "Twin Id is incorrect");
          assert.equal(eventTwinCreated.sellerId.toString(), twin.sellerId, "Seller Id is incorrect");
          assert.equal(
            eventTwinCreated.executedBy.toString(),
            await assistant.getAddress(),
            "Executed by is incorrect"
          );
          assert.equal(twinInstance.toString(), twin.toString(), "Twin struct is incorrect");

          // BundleCreated event
          const eventBundleCreated = getEvent(txReceipt, orchestrationHandler, "BundleCreated");
          const bundleInstance = Bundle.fromStruct(eventBundleCreated.bundle);
          // Validate the instance
          expect(bundleInstance.isValid()).to.be.true;

          assert.equal(eventBundleCreated.bundleId.toString(), bundle.id, "Bundle Id is incorrect");
          assert.equal(eventBundleCreated.sellerId.toString(), bundle.sellerId, "Seller Id is incorrect");
          assert.equal(
            eventBundleCreated.executedBy.toString(),
            await assistant.getAddress(),
            "Executed by is incorrect"
          );
          assert.equal(bundleInstance.toString(), bundle.toString(), "Bundle struct is incorrect");

          // Voucher clone contract
          bosonVoucher = await getContractAt("IBosonVoucher", expectedCloneAddress);

          await expect(tx).to.emit(bosonVoucher, "ContractURIChanged").withArgs(contractURI);
          await expect(tx).to.emit(bosonVoucher, "RangeReserved").withArgs(nextOfferId, range.toStruct());

          bosonVoucher = await getContractAt("OwnableUpgradeable", expectedCloneAddress);

          await expect(tx)
            .to.emit(bosonVoucher, "OwnershipTransferred")
            .withArgs(ZeroAddress, await assistant.getAddress());
        });

        it("should update state", async function () {
          // Approving the twinHandler contract to transfer seller's tokens
          await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1); // approving the twin handler

          // Create a seller, a preminted offer with condition and a twin with bundle, testing for the events
          await orchestrationHandler
            .connect(assistant)
            .createSellerAndPremintedOfferAndTwinWithBundle(
              seller,
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              premintParameters,
              twin,
              emptyAuthToken,
              voucherInitValues,
              agentId,
              offerFeeLimit
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

          // Quantity available should be 0, since whole range is reserved
          offer.quantityAvailable = "0";

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

          // Get the collections information
          expectedCloneAddress = calculateCloneAddress(
            await accountHandler.getAddress(),
            beaconProxyAddress,
            admin.address
          );
          const [defaultVoucherAddress, additionalCollections] = await accountHandler
            .connect(rando)
            .getSellersCollections(seller.id);
          expect(defaultVoucherAddress).to.equal(expectedCloneAddress, "Wrong default voucher address");
          expect(additionalCollections.length).to.equal(0, "Wrong number of additional collections");

          // Voucher clone contract
          bosonVoucher = await ethers.getContractAt("OwnableUpgradeable", expectedCloneAddress);

          expect(await bosonVoucher.owner()).to.equal(await assistant.getAddress(), "Wrong voucher clone owner");

          bosonVoucher = await getContractAt("IBosonVoucher", expectedCloneAddress);
          expect(await bosonVoucher.contractURI()).to.equal(contractURI, "Wrong contract URI");
          expect(await bosonVoucher.name()).to.equal(
            VOUCHER_NAME + " S" + seller.id + "_C0",
            "Wrong voucher client name"
          );
          expect(await bosonVoucher.symbol()).to.equal(
            VOUCHER_SYMBOL + "_S" + seller.id + "_C0",
            "Wrong voucher client symbol"
          );
          const returnedRange = Range.fromStruct(await bosonVoucher.getRangeByOfferId(offer.id));
          assert.equal(returnedRange.toString(), range.toString(), "Range mismatch");
          const availablePremints = await bosonVoucher.getAvailablePreMints(offer.id);
          assert.equal(availablePremints.toString(), reservedRangeLength, "Available Premints mismatch");
        });
      });

      context("💔 Revert Reasons", async function () {
        it("The orchestration region of protocol is paused", async function () {
          // Pause the orchestration region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Orchestration]);

          // Attempt to orchestrate expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOfferAndTwinWithBundle(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                twin,
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Orchestration);
        });

        it("The sellers region of protocol is paused", async function () {
          // Pause the sellers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Sellers]);

          // Attempt to create a seller, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOfferAndTwinWithBundle(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                twin,
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Sellers);
        });

        it("The offers region of protocol is paused", async function () {
          // Pause the offers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Offers]);

          // Attempt to create an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOfferAndTwinWithBundle(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                twin,
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Offers);
        });

        it("The bundles region of protocol is paused", async function () {
          // Pause the bundles region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Bundles]);

          // Attempt to create a bundle, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOfferAndTwinWithBundle(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                twin,
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Bundles);
        });

        it("The twins region of protocol is paused", async function () {
          // Pause the twins region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Twins]);

          // Attempt to create a twin expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOfferAndTwinWithBundle(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                twin,
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Twins);
        });

        it("The exchanges region of protocol is paused [preminted offers]", async function () {
          // Pause the exchanges region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Exchanges]);

          // Approve twin transfer
          await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1);

          // Attempt to create a twin expecting revert
          const reservedRangeLength = offer.quantityAvailable;
          const premintParameters = [reservedRangeLength, await assistant.getAddress()];
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndPremintedOfferAndTwinWithBundle(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                premintParameters,
                twin,
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Exchanges);
        });
      });
    });

    context("👉 createSellerAndOfferWithConditionAndTwinAndBundle()", async function () {
      beforeEach(async function () {
        // prepare a group struct. We are not passing it as an argument, but just need to validate.
        // The first group id
        nextGroupId = "1";

        offerIds = ["1"];

        condition = mockCondition({
          tokenType: TokenType.MultiToken,
          tokenAddress: await other2.getAddress(),
          method: EvaluationMethod.Threshold,
        });
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
        twin = mockTwin(await bosonToken.getAddress());
        twin.sellerId = seller.id;

        // How that twin looks as a returned struct
        twinStruct = twin.toStruct();
      });

      it("should emit a SellerCreated, an OfferCreated, a GroupCreated, a TwinCreated and a BundleCreated event", async function () {
        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1); // approving the twin handler

        // Create a seller, an offer with condition, twin and bundle
        const tx = await orchestrationHandler
          .connect(assistant)
          .createSellerAndOfferWithConditionAndTwinAndBundle(
            seller,
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            condition,
            twin,
            emptyAuthToken,
            voucherInitValues,
            agentId,
            offerFeeLimit
          );

        expectedCloneAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          admin.address
        );

        // SellerCreated and OfferCreated events
        await expect(tx)
          .to.emit(orchestrationHandler, "SellerCreated")
          .withArgs(seller.id, sellerStruct, expectedCloneAddress, emptyAuthTokenStruct, await assistant.getAddress());

        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            seller.id,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
          );

        const expectedRoyaltyRecipientInfoList = new RoyaltyRecipientInfoList([
          new RoyaltyRecipientInfo(ZeroAddress, voucherInitValues.royaltyPercentage),
        ]);

        await expect(tx)
          .to.emit(accountHandler, "RoyaltyRecipientsChanged")
          .withArgs(
            seller.id,
            compareRoyaltyRecipientInfoLists.bind(expectedRoyaltyRecipientInfoList.toStruct()),
            assistant.address
          );

        // Events with structs that contain arrays must be tested differently // ToDo: use predicates
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
        bosonVoucher = await getContractAt("IBosonVoucher", expectedCloneAddress);

        await expect(tx).to.emit(bosonVoucher, "ContractURIChanged").withArgs(contractURI);

        bosonVoucher = await getContractAt("OwnableUpgradeable", expectedCloneAddress);

        await expect(tx)
          .to.emit(bosonVoucher, "OwnershipTransferred")
          .withArgs(ZeroAddress, await assistant.getAddress());
      });

      it("should update state", async function () {
        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1); // approving the twin handler

        // Create a seller, an offer with condition, twin and bundle
        await orchestrationHandler
          .connect(assistant)
          .createSellerAndOfferWithConditionAndTwinAndBundle(
            seller,
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            condition,
            twin,
            emptyAuthToken,
            voucherInitValues,
            agentId,
            offerFeeLimit
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

        // Get the collections information
        expectedCloneAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          admin.address
        );
        const [defaultVoucherAddress, additionalCollections] = await accountHandler
          .connect(rando)
          .getSellersCollections(seller.id);
        expect(defaultVoucherAddress).to.equal(expectedCloneAddress, "Wrong default voucher address");
        expect(additionalCollections.length).to.equal(0, "Wrong number of additional collections");

        // Voucher clone contract
        bosonVoucher = await ethers.getContractAt("OwnableUpgradeable", expectedCloneAddress);

        expect(await bosonVoucher.owner()).to.equal(await assistant.getAddress(), "Wrong voucher clone owner");

        bosonVoucher = await getContractAt("IBosonVoucher", expectedCloneAddress);
        expect(await bosonVoucher.contractURI()).to.equal(contractURI, "Wrong contract URI");
        expect(await bosonVoucher.name()).to.equal(
          VOUCHER_NAME + " S" + seller.id + "_C0",
          "Wrong voucher client name"
        );
        expect(await bosonVoucher.symbol()).to.equal(
          VOUCHER_SYMBOL + "_S" + seller.id + "_C0",
          "Wrong voucher client symbol"
        );
      });

      it("should update state when voucherInitValues has zero royaltyPercentage and exchangeId does not exist", async function () {
        // ERC2981 Royalty fee is 0%
        voucherInitValues.royaltyPercentage = "0"; //0%
        expect(voucherInitValues.isValid()).is.true;
        offer.royaltyInfo = [new RoyaltyInfo([ZeroAddress], [voucherInitValues.royaltyPercentage])];

        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1); // approving the twin handler

        // Create a seller, an offer with condition, twin and bundle
        await orchestrationHandler
          .connect(assistant)
          .createSellerAndOfferWithConditionAndTwinAndBundle(
            seller,
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            condition,
            twin,
            emptyAuthToken,
            voucherInitValues,
            agentId,
            offerFeeLimit
          );

        // Get the collections information
        expectedCloneAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          admin.address
        );
        const [defaultVoucherAddress, additionalCollections] = await accountHandler
          .connect(rando)
          .getSellersCollections(seller.id);
        expect(defaultVoucherAddress).to.equal(expectedCloneAddress, "Wrong default voucher address");
        expect(additionalCollections.length).to.equal(0, "Wrong number of additional collections");

        // Voucher clone contract
        bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);
        expect(await bosonVoucher.contractURI()).to.equal(contractURI, "Wrong contract URI");
        expect(await bosonVoucher.name()).to.equal(
          VOUCHER_NAME + " S" + seller.id + "_C0",
          "Wrong voucher client name"
        );
        expect(await bosonVoucher.symbol()).to.equal(
          VOUCHER_SYMBOL + "_S" + seller.id + "_C0",
          "Wrong voucher client symbol"
        );

        // Prepare random parameters
        let exchangeId = "1234"; // An exchange id that does not exist
        let offerPrice = "1234567"; // A random offer price

        //Exchange exists
        let exists;
        [exists] = await exchangeHandler.connect(rando).getExchangeState(exchangeId);
        expect(exists).to.be.false;

        // Get Royalty Information for Exchange id i.e. Voucher token id
        let receiver, royaltyAmount;
        [receiver, royaltyAmount] = await bosonVoucher.connect(assistant).royaltyInfo(exchangeId, offerPrice);

        // Expectations
        let expectedRecipient = ZeroAddress; //expect zero address when exchange id does not exist
        let expectedRoyaltyAmount = "0"; // Zero Fee when exchange id does not exist

        assert.equal(receiver, expectedRecipient, "Recipient address is incorrect");
        assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");
      });

      it("should update state when voucherInitValues has non zero royaltyPercentage and exchangeId does not exist", async function () {
        // ERC2981 Royalty fee is 10%
        voucherInitValues.royaltyPercentage = "1000"; //10%
        expect(voucherInitValues.isValid()).is.true;
        offer.royaltyInfo = [new RoyaltyInfo([ZeroAddress], [voucherInitValues.royaltyPercentage])];

        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1); // approving the twin handler

        // Create a seller, an offer with condition, twin and bundle
        await orchestrationHandler
          .connect(assistant)
          .createSellerAndOfferWithConditionAndTwinAndBundle(
            seller,
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            condition,
            twin,
            emptyAuthToken,
            voucherInitValues,
            agentId,
            offerFeeLimit
          );

        // Get the collections information
        expectedCloneAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          admin.address
        );
        const [defaultVoucherAddress, additionalCollections] = await accountHandler
          .connect(rando)
          .getSellersCollections(seller.id);
        expect(defaultVoucherAddress).to.equal(expectedCloneAddress, "Wrong default voucher address");
        expect(additionalCollections.length).to.equal(0, "Wrong number of additional collections");

        // Voucher clone contract
        bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);
        expect(await bosonVoucher.contractURI()).to.equal(contractURI, "Wrong contract URI");
        expect(await bosonVoucher.name()).to.equal(
          VOUCHER_NAME + " S" + seller.id + "_C0",
          "Wrong voucher client name"
        );
        expect(await bosonVoucher.symbol()).to.equal(
          VOUCHER_SYMBOL + "_S" + seller.id + "_C0",
          "Wrong voucher client symbol"
        );

        // Prepare random parameters
        let exchangeId = "1234"; // An exchange id that does not exist
        let offerPrice = "1234567"; // A random offer price

        //Exchange exists
        let exists;
        [exists] = await exchangeHandler.connect(rando).getExchangeState(exchangeId);
        expect(exists).to.be.false;

        // Get Royalty Information for Exchange id i.e. Voucher token id
        let receiver, royaltyAmount;
        [receiver, royaltyAmount] = await bosonVoucher.connect(assistant).royaltyInfo(exchangeId, offerPrice);

        // Expectations
        let expectedRecipient = ZeroAddress; //expect zero address when exchange id does not exist
        let expectedRoyaltyAmount = "0"; // Zero Fee when exchange id does not exist

        assert.equal(receiver, expectedRecipient, "Recipient address is incorrect");
        assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");
      });

      it("should ignore any provided ids and assign the next available", async function () {
        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1); // approving the twin handler

        const sellerId = seller.id;
        seller.id = "333";
        offer.id = "555";
        twin.id = "777";

        // Create a seller, an offer with condition, twin and bundle
        const tx = await orchestrationHandler
          .connect(assistant)
          .createSellerAndOfferWithConditionAndTwinAndBundle(
            seller,
            offer,
            offerDates,
            offerDurations,
            {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            },
            condition,
            twin,
            emptyAuthToken,
            voucherInitValues,
            agentId,
            offerFeeLimit
          );

        // SellerCreated and OfferCreated events
        await expect(tx)
          .to.emit(orchestrationHandler, "SellerCreated")
          .withArgs(
            sellerId,
            sellerStruct,
            calculateCloneAddress(await accountHandler.getAddress(), beaconProxyAddress, admin.address),
            emptyAuthTokenStruct,
            await assistant.getAddress()
          );

        await expect(tx)
          .to.emit(orchestrationHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            sellerId,
            compareOfferStructs.bind(offerStruct),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await assistant.getAddress()
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
          agent = mockAgent(await other1.getAddress());
          agent.id = agentId;
          expect(agent.isValid()).is.true;

          // Create an agent
          await accountHandler.connect(rando).createAgent(agent);

          agentFee = ((BigInt(offer.price) * BigInt(agent.feePercentage)) / 10000n).toString();
          offerFees.agentFee = agentFee;
          offerFeesStruct = offerFees.toStruct();
        });

        it("should emit a SellerCreated, an OfferCreated, a GroupCreated, a TwinCreated and a BundleCreated event", async function () {
          // Approving the twinHandler contract to transfer seller's tokens
          await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1); // approving the twin handler

          expectedCloneAddress = calculateCloneAddress(
            await accountHandler.getAddress(),
            beaconProxyAddress,
            admin.address
          );

          // Create a seller, an offer with condition, twin and bundle
          const tx = await orchestrationHandler
            .connect(assistant)
            .createSellerAndOfferWithConditionAndTwinAndBundle(
              seller,
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              condition,
              twin,
              emptyAuthToken,
              voucherInitValues,
              agentId,
              offerFeeLimit
            );

          // SellerCreated and OfferCreated events
          await expect(tx)
            .to.emit(orchestrationHandler, "SellerCreated")
            .withArgs(
              seller.id,
              sellerStruct,
              expectedCloneAddress,
              emptyAuthTokenStruct,
              await assistant.getAddress()
            );

          await expect(tx)
            .to.emit(orchestrationHandler, "OfferCreated")
            .withArgs(
              nextOfferId,
              seller.id,
              compareOfferStructs.bind(offerStruct),
              offerDatesStruct,
              offerDurationsStruct,
              disputeResolutionTermsStruct,
              offerFeesStruct,
              agentId,
              await assistant.getAddress()
            );

          const expectedRoyaltyRecipientInfoList = new RoyaltyRecipientInfoList([
            new RoyaltyRecipientInfo(ZeroAddress, voucherInitValues.royaltyPercentage),
          ]);

          await expect(tx)
            .to.emit(accountHandler, "RoyaltyRecipientsChanged")
            .withArgs(
              seller.id,
              compareRoyaltyRecipientInfoLists.bind(expectedRoyaltyRecipientInfoList.toStruct()),
              assistant.address
            );

          // Events with structs that contain arrays must be tested differently // ToDo use predicates
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
          bosonVoucher = await getContractAt("IBosonVoucher", expectedCloneAddress);

          await expect(tx).to.emit(bosonVoucher, "ContractURIChanged").withArgs(contractURI);

          bosonVoucher = await getContractAt("OwnableUpgradeable", expectedCloneAddress);

          await expect(tx)
            .to.emit(bosonVoucher, "OwnershipTransferred")
            .withArgs(ZeroAddress, await assistant.getAddress());
        });
      });

      context("Preminted offer - createSellerAndPremintedOfferWithConditionAndTwinAndBundle()", async function () {
        let firstTokenId, lastTokenId, reservedRangeLength, range;
        let premintParameters;

        beforeEach(async function () {
          offer.quantityAvailable = reservedRangeLength = 1;
          offerStruct = offer.toStruct();
          firstTokenId = 1;
          lastTokenId = firstTokenId + reservedRangeLength - 1;
          const tokenIdStart = deriveTokenId(offer.id, firstTokenId);
          range = new Range(
            tokenIdStart.toString(),
            reservedRangeLength.toString(),
            "0",
            "0",
            await assistant.getAddress()
          );
          premintParameters = [reservedRangeLength, await assistant.getAddress()];
        });

        it("should emit a SellerCreated, an OfferCreated, a GroupCreated, a TwinCreated, a BundleCreated and a RangeReserved event", async function () {
          // Approving the twinHandler contract to transfer seller's tokens
          await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1); // approving the twin handler

          // Create a seller, a preminted offer with condition, twin and bundle
          const tx = await orchestrationHandler
            .connect(assistant)
            .createSellerAndPremintedOfferWithConditionAndTwinAndBundle(
              seller,
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              premintParameters,
              condition,
              twin,
              emptyAuthToken,
              voucherInitValues,
              agentId,
              offerFeeLimit
            );

          expectedCloneAddress = calculateCloneAddress(
            await accountHandler.getAddress(),
            beaconProxyAddress,
            admin.address
          );

          // SellerCreated, OfferCreated and RangeReserved events
          await expect(tx)
            .to.emit(orchestrationHandler, "SellerCreated")
            .withArgs(
              seller.id,
              sellerStruct,
              expectedCloneAddress,
              emptyAuthTokenStruct,
              await assistant.getAddress()
            );

          await expect(tx)
            .to.emit(orchestrationHandler, "OfferCreated")
            .withArgs(
              nextOfferId,
              seller.id,
              compareOfferStructs.bind(offerStruct),
              offerDatesStruct,
              offerDurationsStruct,
              disputeResolutionTermsStruct,
              offerFeesStruct,
              agentId,
              await assistant.getAddress()
            );

          await expect(tx)
            .to.emit(orchestrationHandler, "RangeReserved")
            .withArgs(
              nextOfferId,
              offer.sellerId,
              firstTokenId,
              lastTokenId,
              await assistant.getAddress(),
              await assistant.getAddress()
            );

          const expectedRoyaltyRecipientInfoList = new RoyaltyRecipientInfoList([
            new RoyaltyRecipientInfo(ZeroAddress, voucherInitValues.royaltyPercentage),
          ]);

          await expect(tx)
            .to.emit(accountHandler, "RoyaltyRecipientsChanged")
            .withArgs(
              seller.id,
              compareRoyaltyRecipientInfoLists.bind(expectedRoyaltyRecipientInfoList.toStruct()),
              assistant.address
            );

          // Events with structs that contain arrays must be tested differently /todo: use predicates
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
          bosonVoucher = await getContractAt("IBosonVoucher", expectedCloneAddress);

          await expect(tx).to.emit(bosonVoucher, "ContractURIChanged").withArgs(contractURI);
          await expect(tx).to.emit(bosonVoucher, "RangeReserved").withArgs(nextOfferId, range.toStruct());

          bosonVoucher = await getContractAt("OwnableUpgradeable", expectedCloneAddress);

          await expect(tx)
            .to.emit(bosonVoucher, "OwnershipTransferred")
            .withArgs(ZeroAddress, await assistant.getAddress());
        });

        it("should update state", async function () {
          // Approving the twinHandler contract to transfer seller's tokens
          await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1); // approving the twin handler

          // Create a seller, a preminted offer with condition, twin and bundle
          await orchestrationHandler
            .connect(assistant)
            .createSellerAndPremintedOfferWithConditionAndTwinAndBundle(
              seller,
              offer,
              offerDates,
              offerDurations,
              {
                disputeResolverId: disputeResolver.id,
                mutualizerAddress: ZeroAddress
              },
              premintParameters,
              condition,
              twin,
              emptyAuthToken,
              voucherInitValues,
              agentId,
              offerFeeLimit
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

          // Quantity available should be 0, since whole range is reserved
          offer.quantityAvailable = "0";

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

          // Get the collections information
          expectedCloneAddress = calculateCloneAddress(
            await accountHandler.getAddress(),
            beaconProxyAddress,
            admin.address
          );
          const [defaultVoucherAddress, additionalCollections] = await accountHandler
            .connect(rando)
            .getSellersCollections(seller.id);
          expect(defaultVoucherAddress).to.equal(expectedCloneAddress, "Wrong default voucher address");
          expect(additionalCollections.length).to.equal(0, "Wrong number of additional collections");

          // Voucher clone contract
          bosonVoucher = await ethers.getContractAt("OwnableUpgradeable", expectedCloneAddress);

          expect(await bosonVoucher.owner()).to.equal(await assistant.getAddress(), "Wrong voucher clone owner");

          bosonVoucher = await getContractAt("IBosonVoucher", expectedCloneAddress);
          expect(await bosonVoucher.contractURI()).to.equal(contractURI, "Wrong contract URI");
          expect(await bosonVoucher.name()).to.equal(
            VOUCHER_NAME + " S" + seller.id + "_C0",
            "Wrong voucher client name"
          );
          expect(await bosonVoucher.symbol()).to.equal(
            VOUCHER_SYMBOL + "_S" + seller.id + "_C0",
            "Wrong voucher client symbol"
          );
          const returnedRange = Range.fromStruct(await bosonVoucher.getRangeByOfferId(offer.id));
          assert.equal(returnedRange.toString(), range.toString(), "Range mismatch");
          const availablePremints = await bosonVoucher.getAvailablePreMints(offer.id);
          assert.equal(availablePremints.toString(), reservedRangeLength, "Available Premints mismatch");
        });
      });

      context("💔 Revert Reasons", async function () {
        it("The orchestration region of protocol is paused", async function () {
          // Pause the orchestration region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Orchestration]);

          // Attempt to orchestrate expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOfferWithConditionAndTwinAndBundle(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                condition,
                twin,
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Orchestration);
        });

        it("The sellers region of protocol is paused", async function () {
          // Pause the sellers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Sellers]);

          // Attempt to create a seller, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOfferWithConditionAndTwinAndBundle(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                condition,
                twin,
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Sellers);
        });

        it("The offers region of protocol is paused", async function () {
          // Pause the offers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Offers]);

          // Attempt to create an offer, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOfferWithConditionAndTwinAndBundle(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                condition,
                twin,
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Offers);
        });

        it("The groups region of protocol is paused", async function () {
          // Pause the groups region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Groups]);

          // Attempt to create a group, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOfferWithConditionAndTwinAndBundle(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                condition,
                twin,
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Groups);
        });

        it("The twins region of protocol is paused", async function () {
          // Pause the twins region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Twins]);

          // Attempt to create a twin expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOfferWithConditionAndTwinAndBundle(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                condition,
                twin,
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Twins);
        });

        it("The bundles region of protocol is paused", async function () {
          // Pause the bundles region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Bundles]);

          // Attempt to create a group, expecting revert
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndOfferWithConditionAndTwinAndBundle(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                condition,
                twin,
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Bundles);
        });

        it("The exchanges region of protocol is paused [preminted offers]", async function () {
          // Pause the exchanges region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Exchanges]);

          // Approve twin transfer
          await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1);

          // Attempt to create a group, expecting revert
          const reservedRangeLength = offer.quantityAvailable;
          const premintParameters = [reservedRangeLength, await assistant.getAddress()];
          await expect(
            orchestrationHandler
              .connect(assistant)
              .createSellerAndPremintedOfferWithConditionAndTwinAndBundle(
                seller,
                offer,
                offerDates,
                offerDurations,
                {
                  disputeResolverId: disputeResolver.id,
                  mutualizerAddress: ZeroAddress
                },
                premintParameters,
                condition,
                twin,
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              )
          )
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Exchanges);
        });
      });
    });
  });
});
