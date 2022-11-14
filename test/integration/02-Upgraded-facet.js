const hre = require("hardhat");
const ethers = hre.ethers;
const { expect, assert } = require("chai");
const Role = require("../../scripts/domain/Role");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const {
  mockOffer,
  mockDisputeResolver,
  mockAuthToken,
  mockVoucherInitValues,
  mockSeller,
  mockVoucher,
  mockExchange,
  accountId,
} = require("../util/mock");
const {
  setNextBlockTimestamp,
  calculateVoucherExpiry,
  prepareDataSignatureParameters,
  applyPercentage,
} = require("../util/utils.js");
const { oneWeek, oneMonth, maxPriorityFeePerGas } = require("../util/constants");
const { getSelectors, FacetCutAction } = require("../../scripts/util/diamond-utils.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");

/**
 *  Integration test case - After Exchange handler facet upgrade, everything is still operational
 */
describe("[@skip-on-coverage] After facet upgrade, everything is still operational", function () {
  // Common vars
  let deployer,
    pauser,
    operator,
    admin,
    clerk,
    treasury,
    rando,
    buyer,
    operatorDR,
    adminDR,
    clerkDR,
    treasuryDR,
    protocolTreasury,
    bosonToken;
  let protocolDiamond,
    accessController,
    accountHandler,
    exchangeHandler,
    offerHandler,
    fundsHandler,
    disputeHandler,
    mockExchangeHandlerUpgrade;
  let buyerId, offerId, seller, disputeResolverId;
  let price, sellerPool;
  let voucherRedeemableFrom;
  let voucherValid;
  let protocolFeePercentage, protocolFeeFlatBoson, buyerEscalationDepositPercentage;
  let voucher;
  let exchange;
  let disputeResolver;
  let agentId;
  let exchangeId;
  let offer, offerToken;
  let offerDates, offerDurations, escalationPeriod, resolutionPeriod;
  let mockToken;
  let buyerEscalationDepositNative, sellerDeposit, buyerPercentBasisPoints;
  let customSignatureType, message;

  beforeEach(async function () {
    // Make accounts available
    [deployer, pauser, admin, treasury, buyer, rando, adminDR, treasuryDR, protocolTreasury, bosonToken] =
      await ethers.getSigners();

    // make all account the same
    operator = clerk = admin;
    operatorDR = clerkDR = adminDR;

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
      [
        "AccountHandlerFacet",
        "AgentHandlerFacet",
        "SellerHandlerFacet",
        "BuyerHandlerFacet",
        "DisputeResolverHandlerFacet",
        "ExchangeHandlerFacet",
        "OfferHandlerFacet",
        "FundsHandlerFacet",
        "DisputeHandlerFacet",
      ],
      maxPriorityFeePerGas
    );

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
        maxExchangesPerBatch: 50,
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

    // Deploy the Config facet, initializing the protocol config
    await deployProtocolConfigFacet(protocolDiamond, protocolConfig, maxPriorityFeePerGas);

    // Cast Diamond to IBosonAccountHandler. Use this interface to call all individual account handlers
    accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);

    // Cast Diamond to IBosonOfferHandler
    offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);

    // Cast Diamond to IBosonExchangeHandler
    exchangeHandler = await ethers.getContractAt("IBosonExchangeHandler", protocolDiamond.address);

    // Cast Diamond to IBosonFundsHandler
    fundsHandler = await ethers.getContractAt("IBosonFundsHandler", protocolDiamond.address);

    // Cast Diamond to IBosonDisputeHandler
    disputeHandler = await ethers.getContractAt("IBosonDisputeHandler", protocolDiamond.address);

    // Initial ids for all the things
    exchangeId = offerId = "1";
    agentId = "0"; // agent id is optional while creating an offer

    // Create a valid seller, then set fields in tests directly
    seller = mockSeller(operator.address, admin.address, clerk.address, treasury.address);
    expect(seller.isValid()).is.true;

    // VoucherInitValues
    const voucherInitValues = mockVoucherInitValues();
    expect(voucherInitValues.isValid()).is.true;

    // AuthToken
    const emptyAuthToken = mockAuthToken();
    expect(emptyAuthToken.isValid()).is.true;

    await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

    [mockToken] = await deployMockTokens(["Foreign20"]);

    // top up operators account
    await mockToken.mint(operator.address, "1000000");

    // approve protocol to transfer the tokens
    await mockToken.connect(operator).approve(protocolDiamond.address, "1000000");
  });

  async function upgradeExchangeHandlerFacet(mockFacet) {
    // Upgrade the Exchange Handler Facet functions
    // DiamondCutFacet
    const cutFacetViaDiamond = await ethers.getContractAt("DiamondCutFacet", protocolDiamond.address);

    // Deploy MockExchangeHandlerFacet
    const MockExchangeHandlerFacet = await ethers.getContractFactory(mockFacet);
    const mockExchangeHandlerFacet = await MockExchangeHandlerFacet.deploy();
    await mockExchangeHandlerFacet.deployed();

    // Define the facet cut
    const facetCuts = [
      {
        facetAddress: mockExchangeHandlerFacet.address,
        action: FacetCutAction.Replace,
        functionSelectors: getSelectors(mockExchangeHandlerFacet),
      },
    ];

    // Send the DiamondCut transaction
    const tx = await cutFacetViaDiamond.connect(deployer).diamondCut(facetCuts, ethers.constants.AddressZero, "0x");

    // Wait for transaction to confirm
    const receipt = await tx.wait();

    // Be certain transaction was successful
    assert.equal(receipt.status, 1, `Diamond upgrade failed: ${tx.hash}`);

    // Cast Diamond to the mock exchange handler facet.
    mockExchangeHandlerUpgrade = await ethers.getContractAt(mockFacet, protocolDiamond.address);
  }

  // Exchange methods
  context("📋 Exchange Handler Methods", async function () {
    beforeEach(async function () {
      // Create a valid dispute resolver
      disputeResolver = mockDisputeResolver(
        operatorDR.address,
        adminDR.address,
        clerkDR.address,
        treasuryDR.address,
        true
      );
      expect(disputeResolver.isValid()).is.true;

      //Create DisputeResolverFee array so offer creation will succeed
      const disputeResolverFees = [new DisputeResolverFee(ethers.constants.AddressZero, "Native", "0")];

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
      offer.quantityAvailable = "10";
      disputeResolverId = mo.disputeResolverId;

      // Check if domains are valid
      expect(offer.isValid()).is.true;
      expect(offerDates.isValid()).is.true;
      expect(offerDurations.isValid()).is.true;

      // Create the offer
      await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

      // Set used variables
      price = offer.price;
      voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
      voucherValid = offerDurations.voucherValid;
      sellerPool = ethers.utils.parseUnits("15", "ether").toString();

      // Required voucher constructor params
      voucher = mockVoucher();
      voucher.redeemedDate = "0";

      // Mock exchange
      exchange = mockExchange();

      buyerId = accountId.next().value;
      exchange.buyerId = buyerId;
      exchange.finalizedDate = "0";

      // Deposit seller funds so the commit will succeed
      await fundsHandler
        .connect(operator)
        .depositFunds(seller.id, ethers.constants.AddressZero, sellerPool, { value: sellerPool });
    });

    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    context("👉 completeExchange()", async function () {
      beforeEach(async function () {
        // Commit to offer
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

        // Upgrade Exchange handler facet
        await upgradeExchangeHandlerFacet("MockExchangeHandlerFacet");
      });

      it("should emit an ExchangeCompleted2 event when buyer calls", async function () {
        // Set time forward to the offer's voucherRedeemableFrom
        await setNextBlockTimestamp(Number(voucherRedeemableFrom));

        // Redeem the voucher
        await mockExchangeHandlerUpgrade.connect(buyer).redeemVoucher(exchange.id);

        // Complete the exchange, expecting event
        await expect(mockExchangeHandlerUpgrade.connect(buyer).completeExchange(exchange.id))
          .to.emit(mockExchangeHandlerUpgrade, "ExchangeCompleted2")
          .withArgs(offerId, buyerId, exchange.id, buyer.address);
      });
    });

    context("👉 completeExchangeBatch()", async function () {
      it("should emit a ExchangeCompleted2 event for all events", async function () {
        // Set time forward to the offer's voucherRedeemableFrom
        await setNextBlockTimestamp(Number(voucherRedeemableFrom));

        for (exchangeId = 1; exchangeId <= 5; exchangeId++) {
          // Commit to offer, creating a new exchange
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });
        }

        // Upgrade Exchange handler facet
        await upgradeExchangeHandlerFacet("MockExchangeHandlerFacet");

        for (exchangeId = 1; exchangeId <= 5; exchangeId++) {
          // Redeem voucher
          await mockExchangeHandlerUpgrade.connect(buyer).redeemVoucher(exchangeId);
        }

        const exchangesToComplete = ["1", "2", "3", "4", "5"];

        // Complete the exchange, expecting event
        const tx = await mockExchangeHandlerUpgrade.connect(buyer).completeExchangeBatch(exchangesToComplete);
        await expect(tx)
          .to.emit(mockExchangeHandlerUpgrade, "ExchangeCompleted2")
          .withArgs(offerId, buyerId, exchangesToComplete[0], buyer.address);

        await expect(tx)
          .to.emit(mockExchangeHandlerUpgrade, "ExchangeCompleted2")
          .withArgs(offerId, buyerId, exchangesToComplete[1], buyer.address);

        await expect(tx)
          .to.emit(mockExchangeHandlerUpgrade, "ExchangeCompleted2")
          .withArgs(offerId, buyerId, exchangesToComplete[2], buyer.address);

        await expect(tx)
          .to.emit(mockExchangeHandlerUpgrade, "ExchangeCompleted2")
          .withArgs(offerId, buyerId, exchangesToComplete[3], buyer.address);

        await expect(tx)
          .to.emit(mockExchangeHandlerUpgrade, "ExchangeCompleted2")
          .withArgs(offerId, buyerId, exchangesToComplete[4], buyer.address);
      });
    });

    context("👉 revokeVoucher()", async function () {
      it("should emit an VoucherRevoked2 event when seller's operator calls", async function () {
        // Commit to offer
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

        // Upgrade Exchange handler facet
        await upgradeExchangeHandlerFacet("MockExchangeHandlerFacet");

        // Revoke the voucher, expecting event
        await expect(mockExchangeHandlerUpgrade.connect(operator).revokeVoucher(exchange.id))
          .to.emit(mockExchangeHandlerUpgrade, "VoucherRevoked2")
          .withArgs(offerId, exchange.id, operator.address);
      });
    });

    context("👉 cancelVoucher()", async function () {
      it("should emit an VoucherCanceled2 event when original buyer calls", async function () {
        // Commit to offer, retrieving the event
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

        // Upgrade Exchange handler facet
        await upgradeExchangeHandlerFacet("MockExchangeHandlerFacet");

        // Cancel the voucher, expecting event
        await expect(mockExchangeHandlerUpgrade.connect(buyer).cancelVoucher(exchange.id))
          .to.emit(mockExchangeHandlerUpgrade, "VoucherCanceled2")
          .withArgs(offerId, exchange.id, buyer.address);
      });
    });

    context("👉 expireVoucher()", async function () {
      it("should emit an VoucherExpired2 event when anyone calls and voucher has expired", async function () {
        // Commit to offer, retrieving the event
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

        // Upgrade Exchange handler facet
        await upgradeExchangeHandlerFacet("MockExchangeHandlerFacet");

        // Set time forward past the voucher's validUntilDate
        await setNextBlockTimestamp(Number(voucherRedeemableFrom) + Number(voucherValid) + Number(oneWeek));

        // Expire the voucher, expecting event
        await expect(mockExchangeHandlerUpgrade.connect(rando).expireVoucher(exchange.id))
          .to.emit(mockExchangeHandlerUpgrade, "VoucherExpired2")
          .withArgs(offerId, exchange.id, rando.address);
      });
    });

    context("👉 redeemVoucher()", async function () {
      it("should emit a VoucherRedeemed2 event when buyer calls", async function () {
        // Commit to offer
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

        // Upgrade Exchange handler facet
        await upgradeExchangeHandlerFacet("MockExchangeHandlerFacet");

        // Set time forward to the offer's voucherRedeemableFrom
        await setNextBlockTimestamp(Number(voucherRedeemableFrom));

        // Redeem the voucher, expecting event
        await expect(mockExchangeHandlerUpgrade.connect(buyer).redeemVoucher(exchange.id))
          .to.emit(mockExchangeHandlerUpgrade, "VoucherRedeemed2")
          .withArgs(offerId, exchange.id, buyer.address);
      });
    });

    context("👉 extendVoucher()", async function () {
      it("should emit an VoucherExtended2 event when seller's operator calls", async function () {
        // Commit to offer
        const tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

        // Get the block timestamp of the confirmed tx
        const blockNumber = tx.blockNumber;
        const block = await ethers.provider.getBlock(blockNumber);

        // Update the committed date in the expected exchange struct with the block timestamp of the tx
        voucher.committedDate = block.timestamp.toString();

        // Update the validUntilDate date in the expected exchange struct
        voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

        // New expiry date for extensions
        const validUntilDate = ethers.BigNumber.from(voucher.validUntilDate).add(oneMonth).toString();

        // Upgrade Exchange handler facet
        await upgradeExchangeHandlerFacet("MockExchangeHandlerFacet");

        // Extend the voucher, expecting event
        await expect(mockExchangeHandlerUpgrade.connect(operator).extendVoucher(exchange.id, validUntilDate))
          .to.emit(mockExchangeHandlerUpgrade, "VoucherExtended2")
          .withArgs(offerId, exchange.id, validUntilDate, operator.address);
      });
    });
  });

  // Dispute methods - single
  context("📋 Dispute Handler Methods", async function () {
    beforeEach(async function () {
      // Create a valid dispute resolver
      disputeResolver = mockDisputeResolver(
        operatorDR.address,
        adminDR.address,
        clerkDR.address,
        treasuryDR.address,
        true
      );
      expect(disputeResolver.isValid()).is.true;

      //Create DisputeResolverFee array so offer creation will succeed
      const DRFeeNative = ethers.utils.parseUnits("1", "ether").toString();
      const disputeResolverFees = [new DisputeResolverFee(ethers.constants.AddressZero, "Native", DRFeeNative)];

      // Make empty seller list, so every seller is allowed
      const sellerAllowList = [];

      // Register the dispute resolver
      await accountHandler
        .connect(adminDR)
        .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

      // buyer escalation deposit used in multiple tests
      buyerEscalationDepositNative = applyPercentage(DRFeeNative, buyerEscalationDepositPercentage);

      // Mock offer
      ({ offer, offerDates, offerDurations, disputeResolverId } = await mockOffer());
      offer.quantityAvailable = "5";

      // Check if domains are valid
      expect(offer.isValid()).is.true;
      expect(offerDates.isValid()).is.true;
      expect(offerDurations.isValid()).is.true;

      // Create the offer
      await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

      // Set used variables
      price = offer.price;
      const quantityAvailable = offer.quantityAvailable;
      sellerDeposit = offer.sellerDeposit;
      voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
      resolutionPeriod = offerDurations.resolutionPeriod;
      escalationPeriod = disputeResolver.escalationResponsePeriod;

      // Deposit seller funds so the commit will succeed
      const fundsToDeposit = ethers.BigNumber.from(sellerDeposit).mul(quantityAvailable);
      await fundsHandler
        .connect(operator)
        .depositFunds(seller.id, ethers.constants.AddressZero, fundsToDeposit, { value: fundsToDeposit });

      buyerId = accountId.next().value;
    });

    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    context("Single", async function () {
      beforeEach(async function () {
        exchangeId = "1";

        // Commit to offer, creating a new exchange
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

        // Set time forward to the offer's voucherRedeemableFrom
        await setNextBlockTimestamp(Number(voucherRedeemableFrom));

        // Upgrade Exchange handler facet
        await upgradeExchangeHandlerFacet("MockExchangeHandlerFacet");

        // Redeem voucher
        await mockExchangeHandlerUpgrade.connect(buyer).redeemVoucher(exchangeId);

        // Set the buyer percent
        buyerPercentBasisPoints = "0";
      });

      context("👉 raiseDispute()", async function () {
        it("should emit a DisputeRaised event", async function () {
          // Raise a dispute, testing for the event
          await expect(disputeHandler.connect(buyer).raiseDispute(exchangeId))
            .to.emit(disputeHandler, "DisputeRaised")
            .withArgs(exchangeId, buyerId, seller.id, buyer.address);
        });
      });

      context("👉 retractDispute()", async function () {
        it("should emit a DisputeRetracted event", async function () {
          // Raise a dispute
          await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Retract the dispute, testing for the event
          await expect(disputeHandler.connect(buyer).retractDispute(exchangeId))
            .to.emit(disputeHandler, "DisputeRetracted")
            .withArgs(exchangeId, buyer.address);
        });
      });

      context("👉 extendDisputeTimeout()", async function () {
        it("should emit a DisputeTimeoutExtended event", async function () {
          // Raise a dispute
          const tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Get the block timestamp of the confirmed tx and set disputedDate
          const blockNumber = tx.blockNumber;
          const block = await ethers.provider.getBlock(blockNumber);
          const disputedDate = block.timestamp.toString();
          const timeout = ethers.BigNumber.from(disputedDate).add(resolutionPeriod).toString();

          // extend timeout for a month
          const newDisputeTimeout = ethers.BigNumber.from(timeout).add(oneMonth).toString();

          // Extend the dispute timeout, testing for the event
          await expect(disputeHandler.connect(operator).extendDisputeTimeout(exchangeId, newDisputeTimeout))
            .to.emit(disputeHandler, "DisputeTimeoutExtended")
            .withArgs(exchangeId, newDisputeTimeout, operator.address);
        });
      });

      context("👉 expireDispute()", async function () {
        it("should emit a DisputeExpired event", async function () {
          // Raise a dispute
          const tx = await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Get the block timestamp of the confirmed tx and set disputedDate
          const blockNumber = tx.blockNumber;
          const block = await ethers.provider.getBlock(blockNumber);
          const disputedDate = block.timestamp.toString();
          const timeout = ethers.BigNumber.from(disputedDate).add(resolutionPeriod).toString();

          // Set time forward past the dispute resolution period
          await setNextBlockTimestamp(Number(timeout) + Number(oneWeek));

          // Expire the dispute, testing for the event
          await expect(disputeHandler.connect(rando).expireDispute(exchangeId))
            .to.emit(disputeHandler, "DisputeExpired")
            .withArgs(exchangeId, rando.address);
        });
      });

      context("👉 resolveDispute()", async function () {
        beforeEach(async function () {
          // Raise a dispute
          await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          buyerPercentBasisPoints = "1234";

          // Set the message Type, needed for signature
          const resolutionType = [
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
        });

        context("👉 buyer is the caller", async function () {
          it("should emit a DisputeResolved event", async function () {
            // Collect the signature components
            const { r, s, v } = await prepareDataSignatureParameters(
              operator, // When buyer is the caller, seller should be the signer.
              customSignatureType,
              "Resolution",
              message,
              disputeHandler.address
            );

            // Resolve the dispute, testing for the event
            await expect(disputeHandler.connect(buyer).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v))
              .to.emit(disputeHandler, "DisputeResolved")
              .withArgs(exchangeId, buyerPercentBasisPoints, buyer.address);
          });
        });

        context("👉 seller is the caller", async function () {
          it("should emit a DisputeResolved event", async function () {
            // Collect the signature components
            const { r, s, v } = await prepareDataSignatureParameters(
              buyer, // When seller is the caller, buyer should be the signer.
              customSignatureType,
              "Resolution",
              message,
              disputeHandler.address
            );

            // Resolve the dispute, testing for the event
            await expect(disputeHandler.connect(operator).resolveDispute(exchangeId, buyerPercentBasisPoints, r, s, v))
              .to.emit(disputeHandler, "DisputeResolved")
              .withArgs(exchangeId, buyerPercentBasisPoints, operator.address);
          });
        });
      });

      context("👉 escalateDispute()", async function () {
        it("should emit a DisputeEscalated event", async function () {
          // Raise a dispute
          await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Escalate the dispute, testing for the event
          await expect(
            disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative })
          )
            .to.emit(disputeHandler, "DisputeEscalated")
            .withArgs(exchangeId, disputeResolverId, buyer.address);
        });
      });

      context("👉 decideDispute()", async function () {
        it("should emit a DisputeDecided event", async function () {
          // Raise a dispute
          await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Escalate the dispute
          await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

          // buyer percent used in tests
          buyerPercentBasisPoints = "4321";

          // Escalate the dispute, testing for the event
          await expect(disputeHandler.connect(operatorDR).decideDispute(exchangeId, buyerPercentBasisPoints))
            .to.emit(disputeHandler, "DisputeDecided")
            .withArgs(exchangeId, buyerPercentBasisPoints, operatorDR.address);
        });
      });

      context("👉 expireEscalatedDispute()", async function () {
        it("should emit a EscalatedDisputeExpired event", async function () {
          // Raise a dispute
          await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Escalate the dispute
          const tx = await disputeHandler
            .connect(buyer)
            .escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

          // Get the block timestamp of the confirmed tx and set escalatedDate
          const blockNumber = tx.blockNumber;
          const block = await ethers.provider.getBlock(blockNumber);
          const escalatedDate = block.timestamp.toString();

          // Set time forward past the dispute escalation period
          await setNextBlockTimestamp(Number(escalatedDate) + Number(escalationPeriod));

          // Expire the escalated dispute, testing for the event
          await expect(disputeHandler.connect(rando).expireEscalatedDispute(exchangeId))
            .to.emit(disputeHandler, "EscalatedDisputeExpired")
            .withArgs(exchangeId, rando.address);
        });
      });

      context("👉 refuseEscalatedDispute()", async function () {
        it("should emit a EscalatedDisputeRefused event", async function () {
          // Raise a dispute
          await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Escalate the dispute
          await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

          // Refuse the escalated dispute, testing for the event
          await expect(disputeHandler.connect(operatorDR).refuseEscalatedDispute(exchangeId))
            .to.emit(disputeHandler, "EscalatedDisputeRefused")
            .withArgs(exchangeId, operatorDR.address);
        });
      });
    });
  });

  // Withdraw Funds
  context("📋 Withdraw Funds", async function () {
    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    context("💸 withdraw", async function () {
      beforeEach(async function () {
        // Initial ids for all the things
        exchangeId = "1";

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
        const disputeResolverFees = [
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
        const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
        offer.quantityAvailable = "2";

        const offerNative = offer;

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

        // top up seller's and buyer's account
        await Promise.all([mockToken.mint(operator.address, sellerDeposit), mockToken.mint(buyer.address, price)]);

        // approve protocol to transfer the tokens
        await Promise.all([
          mockToken.connect(operator).approve(protocolDiamond.address, sellerDeposit),
          mockToken.connect(buyer).approve(protocolDiamond.address, price),
        ]);

        // deposit to seller's pool
        await Promise.all([
          fundsHandler.connect(operator).depositFunds(seller.id, mockToken.address, sellerDeposit),
          fundsHandler
            .connect(operator)
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
        context("cancelVoucher() is working as expected", async function () {
          it("should emit a FundsWithdrawn event", async function () {
            // Upgrade Exchange handler facet
            await upgradeExchangeHandlerFacet("MockExchangeHandlerFacet");
            // cancel the voucher, so both seller and buyer have something to withdraw
            await mockExchangeHandlerUpgrade.connect(buyer).cancelVoucher(exchangeId); // canceling the voucher in tokens
            await mockExchangeHandlerUpgrade.connect(buyer).cancelVoucher(++exchangeId); // canceling the voucher in the native currency

            // expected payoffs - they are the same for token and native currency
            // buyer: price - buyerCancelPenalty
            const buyerPayoff = ethers.BigNumber.from(offerToken.price).sub(offerToken.buyerCancelPenalty).toString();

            // seller: sellerDeposit + buyerCancelPenalty
            const sellerPayoff = ethers.BigNumber.from(offerToken.sellerDeposit)
              .add(offerToken.buyerCancelPenalty)
              .toString();

            // Withdraw funds, testing for the event
            // Withdraw tokens
            const tokenListSeller = [mockToken.address, ethers.constants.AddressZero];
            const tokenListBuyer = [ethers.constants.AddressZero, mockToken.address];

            // Withdraw amounts
            const tokenAmountsSeller = [sellerPayoff, ethers.BigNumber.from(sellerPayoff).div("2").toString()];
            const tokenAmountsBuyer = [buyerPayoff, ethers.BigNumber.from(buyerPayoff).div("5").toString()];

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
        });

        context("cancelVoucher() has a bug and does not finalize any exchange", async function () {
          it("withdrawFunds() should revert", async function () {
            // Upgrade Exchange handler facet
            await upgradeExchangeHandlerFacet("MockExchangeHandlerFacetWithDefect");
            // cancel the voucher, so both seller and buyer have something to withdraw
            await mockExchangeHandlerUpgrade.connect(buyer).cancelVoucher(exchangeId); // canceling the voucher in tokens
            await mockExchangeHandlerUpgrade.connect(buyer).cancelVoucher(++exchangeId); // canceling the voucher in the native currency

            // expected payoffs - they are the same for token and native currency
            // buyer: price - buyerCancelPenalty
            const buyerPayoff = ethers.BigNumber.from(offerToken.price).sub(offerToken.buyerCancelPenalty).toString();

            // seller: sellerDeposit + buyerCancelPenalty
            const sellerPayoff = ethers.BigNumber.from(offerToken.sellerDeposit)
              .add(offerToken.buyerCancelPenalty)
              .toString();

            // Withdraw funds, testing for the event
            // Withdraw tokens
            const tokenListSeller = [mockToken.address, ethers.constants.AddressZero];
            const tokenListBuyer = [ethers.constants.AddressZero, mockToken.address];

            // Withdraw amounts
            const tokenAmountsSeller = [sellerPayoff, ethers.BigNumber.from(sellerPayoff).div("2").toString()];
            const tokenAmountsBuyer = [buyerPayoff, ethers.BigNumber.from(buyerPayoff).div("5").toString()];

            // seller withdrawal
            // Attempt to withdraw the funds, expecting revert
            await expect(
              fundsHandler.connect(clerk).withdrawFunds(seller.id, tokenListSeller, tokenAmountsSeller)
            ).to.revertedWith(RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS);

            // buyer withdrawal
            await expect(
              fundsHandler.connect(buyer).withdrawFunds(buyerId, tokenListBuyer, tokenAmountsBuyer)
            ).to.revertedWith(RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS);
          });
        });
      });
    });
  });
});
