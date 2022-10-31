const { gasLimit } = require("../../environments");
const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");

const Role = require("../../scripts/domain/Role");
const TokenType = require("../../scripts/domain/TokenType");
const Group = require("../../scripts/domain/Group");
const EvaluationMethod = require("../../scripts/domain/EvaluationMethod");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
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
  mockCondition,
  accountId,
} = require("../util/mock");
const { applyPercentage } = require("../util/utils.js");
const { oneWeek, oneMonth, maxPriorityFeePerGas } = require("../util/constants");

/**
 *  Test the SnapshotGate example contract
 */
describe("SnapshotGate", function () {
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
    groupHandler
  let buyerId, offerId, seller, disputeResolverId;
  let price, sellerPool;
  let protocolFeePercentage, protocolFeeFlatBoson, buyerEscalationDepositPercentage;
  let voucher, exchange;
  let disputeResolver, disputeResolverFees;
  let foreign20, foreign721, foreign1155;
  let groupId, offerIds, condition, group;
  let voucherInitValues;
  let emptyAuthToken;
  let agentId;
  let offer, offerFees;
  let offerDates, offerDurations;

  beforeEach(async function () {
    // Make accounts available
    [
      deployer,
      pauser,
      admin,
      treasury,
      buyer,
      rando,
      adminDR,
      treasuryDR,
      protocolTreasury,
      bosonToken,
    ] = await ethers.getSigners();

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
        "TwinHandlerFacet",
        "BundleHandlerFacet",
        "GroupHandlerFacet",
        "PauseHandlerFacet",
      ],
      maxPriorityFeePerGas
    );

    // Deploy the Protocol client implementation/proxy pairs (currently just the Boson Voucher)
    const protocolClientArgs = [protocolDiamond.address];
    const [, beacons, proxies,] = await deployProtocolClients(
      protocolClientArgs,
      maxPriorityFeePerGas
    );
    const [beacon] = beacons;
    const [proxy] = proxies;

    // Deploy the mock tokens
    [foreign20, foreign721, foreign1155] = await deployMockTokens(gasLimit, ["Foreign20", "Foreign721", "Foreign1155"]);

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

    // Cast Diamond to IGroupHandler
    groupHandler = await ethers.getContractAt("IBosonGroupHandler", protocolDiamond.address);

    // Deploy the mock tokens
    [foreign20, foreign721, foreign1155] = await deployMockTokens(gasLimit, ["Foreign20", "Foreign721", "Foreign1155"]);
  });

  // All supported Exchange methods
  context("📋 Snapshot Gate Methods", async function () {
    beforeEach(async function () {
      // Initial ids for all the things
      offerId = "1";
      agentId = "0"; // agent id is optional while creating an offer

      // Create a valid seller
      seller = mockSeller(operator.address, admin.address, clerk.address, treasury.address);
      expect(seller.isValid()).is.true;

      // AuthToken
      emptyAuthToken = mockAuthToken();
      expect(emptyAuthToken.isValid()).is.true;

      // VoucherInitValues
      voucherInitValues = mockVoucherInitValues();
      expect(voucherInitValues.isValid()).is.true;

      await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

      // Create a valid dispute resolver
      disputeResolver = mockDisputeResolver(
        operatorDR.address,
        adminDR.address,
        clerkDR.address,
        treasuryDR.address,
        false
      );
      expect(disputeResolver.isValid()).is.true;

      // Create DisputeResolverFee array so offer creation will succeed
      disputeResolverFees = [new DisputeResolverFee(ethers.constants.AddressZero, "Native", "0")];

      // Make empty seller list, so every seller is allowed
      const sellerAllowList = [];

      // Register and activate the dispute resolver
      await accountHandler
        .connect(adminDR)
        .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
      await accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id);

      // Create the offer
      const mo = await mockOffer();
      ({ offerDates, offerDurations } = mo);
      offer = mo.offer;
      offerFees = mo.offerFees;
      offerFees.protocolFee = applyPercentage(offer.price, protocolFeePercentage);

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

    context("👉 commitToOffer() with condition", async function () {

      context("✋ SpecificToken ERC721", async function () {
        beforeEach(async function () {
          // Required constructor params for Group
          groupId = "1";
          offerIds = [offerId];

          // Create Condition
          condition = mockCondition({
            tokenAddress: foreign721.address,
            threshold: "0",
            maxCommits: "3",
            tokenType: TokenType.NonFungibleToken,
            tokenId: "12",
            method: EvaluationMethod.SpecificToken,
          });
          expect(condition.isValid()).to.be.true;

          // Create Group
          group = new Group(groupId, seller.id, offerIds);
          expect(group.isValid()).is.true;
          await groupHandler.connect(operator).createGroup(group, condition);
        });

        it("should emit a BuyerCommitted event if user meets condition", async function () {
          // mint correct token for the buyer
          await foreign721.connect(buyer).mint(condition.tokenId, "1");

          // Commit to offer.
          // We're only concerned that the event is emitted, indicating the condition was met
          await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })).to.emit(
            exchangeHandler,
            "BuyerCommitted"
          );
        });

        it("should allow buyer to commit up to the max times for the group", async function () {
          // mint correct token for the buyer
          await foreign721.connect(buyer).mint(condition.tokenId, "1");

          // Commit to offer the maximum number of times
          for (let i = 0; i < Number(condition.maxCommits); i++) {
            // We're only concerned that the event is emitted, indicating the commit was allowed
            await expect(
              exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
            ).to.emit(exchangeHandler, "BuyerCommitted");
          }
        });

        context("💔 Revert Reasons", async function () {
          it("token id does not exist", async function () {
            // Attempt to commit, expecting revert
            await expect(
              exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
            ).to.revertedWith(RevertReasons.ERC721_NON_EXISTENT);
          });

          it("buyer does not meet condition for commit", async function () {
            // mint correct token but to another user
            await foreign721.connect(rando).mint(condition.tokenId, "1");

            // Attempt to commit, expecting revert
            await expect(
              exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
            ).to.revertedWith(RevertReasons.CANNOT_COMMIT);
          });

          it("buyer has exhausted allowable commits", async function () {
            // mint correct token for the buyer
            await foreign721.connect(buyer).mint(condition.tokenId, "1");

            // Commit to offer the maximum number of times
            for (let i = 0; i < Number(condition.maxCommits); i++) {
              await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });
            }

            // Attempt to commit again after maximum commits has been reached
            await expect(
              exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
            ).to.revertedWith(RevertReasons.CANNOT_COMMIT);
          });
        });
      });

    });

  });
});
