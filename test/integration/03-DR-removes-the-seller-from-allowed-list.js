const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");
const environments = require("../../environments");
const network = hre.network.name;

const Role = require("../../scripts/domain/Role");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const { setNextBlockTimestamp, applyPercentage } = require("../util/utils.js");
const { oneWeek, oneMonth } = require("../util/constants");
const {
  mockOffer,
  mockDisputeResolver,
  mockSeller,
  mockAuthToken,
  mockVoucherInitValues,
  accountId,
} = require("../util/mock");

/**
 *  Integration test case - the disputes can be resolved even when approved sellers are removed from the allow list
 */
describe("[@skip-on-coverage] DR removes sellers from the approved seller list", function () {
  // Common vars
  let deployer,
    pauser,
    operator,
    admin,
    clerk,
    treasury,
    buyer,
    other1,
    operatorDR,
    adminDR,
    clerkDR,
    treasuryDR,
    protocolTreasury;
  let protocolDiamond, accessController, accountHandler, exchangeHandler, offerHandler, fundsHandler, disputeHandler;
  let offer, seller;
  let offerDates, offerDurations;
  let buyerEscalationDepositPercentage;
  let exchangeId;
  let disputeResolver, disputeResolverId;
  let buyerPercentBasisPoints;
  let buyerEscalationDepositNative;
  let emptyAuthToken;

  beforeEach(async function () {
    // Make accounts available
    [
      deployer,
      pauser,
      operator,
      admin,
      clerk,
      treasury,
      buyer,
      other1,
      operatorDR,
      adminDR,
      clerkDR,
      treasuryDR,
      protocolTreasury,
    ] = await ethers.getSigners();

    // Deploy the Protocol Diamond
    [protocolDiamond, , , , accessController] = await deployProtocolDiamond();

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Grant PROTOCOL role to ProtocolDiamond address and renounces admin
    await accessController.grantRole(Role.PROTOCOL, protocolDiamond.address);

    // Temporarily grant PAUSER role to pauser account
    await accessController.grantRole(Role.PAUSER, pauser.address);

    // Cut the protocol handler facets into the Diamond
    await deployProtocolHandlerFacets(protocolDiamond, [
      "SellerHandlerFacet",
      "BuyerHandlerFacet",
      "DisputeResolverHandlerFacet",
      "ExchangeHandlerFacet",
      "OfferHandlerFacet",
      "FundsHandlerFacet",
      "DisputeHandlerFacet",
    ]);

    // Deploy the Protocol client implementation/proxy pairs (currently just the Boson Voucher)
    const protocolClientArgs = [protocolDiamond.address];
    const gasLimit = environments[network].gasLimit;
    const [, beacons, proxies] = await deployProtocolClients(protocolClientArgs, gasLimit);
    const [beacon] = beacons;
    const [proxy] = proxies;

    // Deploy the boson token
    const [bosonToken] = await deployMockTokens(gasLimit, ["BosonToken"]);

    // Set protocolFees
    const protocolFeePercentage = "200"; // 2 %
    const protocolFeeFlatBoson = ethers.utils.parseUnits("0.01", "ether").toString();
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

    // Deploy the Config facet, initializing the protocol config
    await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);

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
  });

  context("📋 Dispute Handler Methods", async function () {
    beforeEach(async function () {
      // Initial ids for all the things
      const offerId = "1";
      const agentId = "0"; // agent id is optional while creating an offer

      // Create a valid seller
      seller = mockSeller(operator.address, admin.address, clerk.address, treasury.address);
      expect(seller.isValid()).is.true;

      const seller2 = mockSeller(other1.address, other1.address, other1.address, other1.address);
      expect(seller2.isValid()).is.true;

      // VoucherInitValues
      const voucherInitValues = mockVoucherInitValues();
      expect(voucherInitValues.isValid()).is.true;

      // AuthToken
      emptyAuthToken = mockAuthToken();
      expect(emptyAuthToken.isValid()).is.true;

      // Create seller with id 1
      await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

      // Create seller with id 2
      await accountHandler.connect(other1).createSeller(seller2, emptyAuthToken, voucherInitValues);

      // Create a valid dispute resolver
      disputeResolver = mockDisputeResolver(operatorDR.address, adminDR.address, clerkDR.address, treasuryDR.address);
      expect(disputeResolver.isValid()).is.true;

      // Create DisputeResolverFee array so offer creation will succeed
      const DRFeeNative = ethers.utils.parseUnits("1", "ether").toString();
      const disputeResolverFees = [new DisputeResolverFee(ethers.constants.AddressZero, "Native", DRFeeNative)];

      // Make a sellerAllowList
      const sellerAllowList = ["2", "1"];

      // Register and activate the dispute resolver
      await accountHandler
        .connect(adminDR)
        .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
      await accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id);

      // Buyer escalation deposit used in multiple tests
      buyerEscalationDepositNative = applyPercentage(DRFeeNative, buyerEscalationDepositPercentage);

      // Mock offer
      ({ offer, offerDates, offerDurations, disputeResolverId } = await mockOffer());
      offer.quantityAvailable = "5";

      // Check if domains are valid
      expect(offer.isValid()).is.true;
      expect(offerDates.isValid()).is.true;
      expect(offerDurations.isValid()).is.true;

      // Create the offer
      disputeResolverId = disputeResolver.id;
      await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

      // Set used variables
      const price = offer.price;
      const quantityAvailable = offer.quantityAvailable;
      const sellerDeposit = offer.sellerDeposit;
      const voucherRedeemableFrom = offerDates.voucherRedeemableFrom;

      // Deposit seller funds so the commit will succeed
      const fundsToDeposit = ethers.BigNumber.from(sellerDeposit).mul(quantityAvailable);
      await fundsHandler
        .connect(operator)
        .depositFunds(seller.id, ethers.constants.AddressZero, fundsToDeposit, { value: fundsToDeposit });

      // Set time forward to the offer's voucherRedeemableFrom
      await setNextBlockTimestamp(Number(voucherRedeemableFrom));

      for (exchangeId = 1; exchangeId <= 3; exchangeId++) {
        // Commit to offer, creating a new exchange
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

        // Redeem voucher
        await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);
      }
    });

    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    context("👉 decideDispute()", async function () {
      beforeEach(async function () {
        for (exchangeId = 1; exchangeId <= 3; exchangeId++) {
          // Raise a dispute
          await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Escalate the dispute
          await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });
        }

        // buyer percent used in tests
        buyerPercentBasisPoints = "4321";
      });

      it("should decide dispute even when DR removes approved sellers", async function () {
        exchangeId = 1;
        // Decide the dispute
        await expect(disputeHandler.connect(operatorDR).decideDispute(exchangeId, buyerPercentBasisPoints))
          .to.emit(disputeHandler, "DisputeDecided")
          .withArgs(exchangeId, buyerPercentBasisPoints, operatorDR.address);

        // Remove an approved seller
        let allowedSellersToRemove = ["1"];
        exchangeId = 2;

        await expect(
          accountHandler.connect(adminDR).removeSellersFromAllowList(disputeResolverId, allowedSellersToRemove)
        )
          .to.emit(accountHandler, "AllowedSellersRemoved")
          .withArgs(disputeResolverId, allowedSellersToRemove, adminDR.address);

        // Decide the dispute
        await expect(disputeHandler.connect(operatorDR).decideDispute(exchangeId, buyerPercentBasisPoints))
          .to.emit(disputeHandler, "DisputeDecided")
          .withArgs(exchangeId, buyerPercentBasisPoints, operatorDR.address);

        // Remove another approved seller
        allowedSellersToRemove = ["2"];
        exchangeId = 3;

        await expect(
          accountHandler.connect(adminDR).removeSellersFromAllowList(disputeResolverId, allowedSellersToRemove)
        )
          .to.emit(accountHandler, "AllowedSellersRemoved")
          .withArgs(disputeResolverId, allowedSellersToRemove, adminDR.address);

        // Decide the dispute
        await expect(disputeHandler.connect(operatorDR).decideDispute(exchangeId, buyerPercentBasisPoints))
          .to.emit(disputeHandler, "DisputeDecided")
          .withArgs(exchangeId, buyerPercentBasisPoints, operatorDR.address);
      });
    });

    context("👉 refuseEscalatedDispute()", async function () {
      beforeEach(async function () {
        for (exchangeId = 1; exchangeId <= 3; exchangeId++) {
          // Raise a dispute
          await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          // Escalate the dispute
          await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });
        }
      });

      it("should refuse escalated dispute even when DR removes approved sellers", async function () {
        exchangeId = 1;
        // Refuse the escalated dispute, testing for the event
        await expect(disputeHandler.connect(operatorDR).refuseEscalatedDispute(exchangeId))
          .to.emit(disputeHandler, "EscalatedDisputeRefused")
          .withArgs(exchangeId, operatorDR.address);

        // Remove an approved seller
        let allowedSellersToRemove = ["1"];
        exchangeId = 2;

        await expect(
          accountHandler.connect(adminDR).removeSellersFromAllowList(disputeResolverId, allowedSellersToRemove)
        )
          .to.emit(accountHandler, "AllowedSellersRemoved")
          .withArgs(disputeResolverId, allowedSellersToRemove, adminDR.address);

        // Refuse the escalated dispute, testing for the event
        await expect(disputeHandler.connect(operatorDR).refuseEscalatedDispute(exchangeId))
          .to.emit(disputeHandler, "EscalatedDisputeRefused")
          .withArgs(exchangeId, operatorDR.address);

        // Remove another approved seller
        allowedSellersToRemove = ["2"];
        exchangeId = 3;

        await expect(
          accountHandler.connect(adminDR).removeSellersFromAllowList(disputeResolverId, allowedSellersToRemove)
        )
          .to.emit(accountHandler, "AllowedSellersRemoved")
          .withArgs(disputeResolverId, allowedSellersToRemove, adminDR.address);

        // Refuse the escalated dispute, testing for the event
        await expect(disputeHandler.connect(operatorDR).refuseEscalatedDispute(exchangeId))
          .to.emit(disputeHandler, "EscalatedDisputeRefused")
          .withArgs(exchangeId, operatorDR.address);
      });
    });
  });
});
