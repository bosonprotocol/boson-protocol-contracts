const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");

const { gasLimit } = require("../../environments");
const {
  mockBuyer,
  mockSeller,
  mockAuthToken,
  mockVoucherInitValues,
  mockOffer,
  mockDisputeResolver,
  accountId,
  mockExchange,
  mockVoucher,
} = require("../util/mock");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const Role = require("../../scripts/domain/Role");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
const { oneMonth, oneWeek } = require("../util/constants");
const { setNextBlockTimestamp, calculateContractAddress, applyPercentage } = require("../util/utils.js");

/**
 *  Integration test case - exchange and offer operations should remain possible even when token fees are removed from the DR fee list 

 */
describe("[@skip-on-coverage] DR removes fee", function () {
  let accountHandler, offerHandler, exchangeHandler, fundsHandler, disputeHandler;
  let expectedCloneAddress, emptyAuthToken, voucherInitValues;
  let deployer,
    operator,
    admin,
    clerk,
    treasury,
    buyer,
    operatorDR,
    adminDR,
    clerkDR,
    treasuryDR,
    protocolTreasury,
    bosonToken;
  let buyerEscalationDepositPercentage;
  let buyerAccount, seller, disputeResolver;
  let offer, offerDates, offerDurations, disputeResolverId;
  let exchangeId;
  let disputeResolverFeeNative;

  beforeEach(async function () {
    // Make accounts available
    [deployer, admin, treasury, buyer, adminDR, treasuryDR, protocolTreasury, bosonToken] = await ethers.getSigners();

    // make all account the same
    operator = clerk = admin;
    operatorDR = clerkDR = adminDR;

    // Deploy the Protocol Diamond
    const [protocolDiamond, , , , accessController] = await deployProtocolDiamond();

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Grant PROTOCOL role to ProtocolDiamond address and renounces admin
    await accessController.grantRole(Role.PROTOCOL, protocolDiamond.address);

    // Cut the protocol handler facets into the Diamond
    await deployProtocolHandlerFacets(protocolDiamond, [
      "AccountHandlerFacet",
      "SellerHandlerFacet",
      "BuyerHandlerFacet",
      "DisputeResolverHandlerFacet",
      "AgentHandlerFacet",
      "OfferHandlerFacet",
      "ExchangeHandlerFacet",
      "FundsHandlerFacet",
      "DisputeHandlerFacet",
    ]);

    // Deploy the Protocol client implementation/proxy pairs (currently just the Boson Voucher)
    const protocolClientArgs = [protocolDiamond.address];
    const [, beacons, proxies] = await deployProtocolClients(protocolClientArgs, gasLimit);
    const [beacon] = beacons;
    const [proxy] = proxies;

    // set protocolFees
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

    await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);

    // Cast Diamond to IBosonAccountHandler. Use this interface to call all individual account handlers
    accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);

    // Cast Diamond to IBosonOfferHandler.
    offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);

    // Cast Diamond to IBosonExchangeHandler.
    exchangeHandler = await ethers.getContractAt("IBosonExchangeHandler", protocolDiamond.address);

    // Cast Diamond to IBosonFundsHandler.
    fundsHandler = await ethers.getContractAt("IBosonFundsHandler", protocolDiamond.address);

    // Cast Diamond to IBosonDisputeHandler.
    disputeHandler = await ethers.getContractAt("IBosonDisputeHandler", protocolDiamond.address);

    expectedCloneAddress = calculateContractAddress(accountHandler.address, "1");
    emptyAuthToken = mockAuthToken();
    expect(emptyAuthToken.isValid()).is.true;
    voucherInitValues = mockVoucherInitValues();
    expect(voucherInitValues.isValid()).is.true;

    // Create a seller account
    seller = mockSeller(operator.address, admin.address, clerk.address, treasury.address);
    expect(await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues))
      .to.emit(accountHandler, "SellerCreated")
      .withArgs(seller.id, seller.toStruct(), expectedCloneAddress, emptyAuthToken.toStruct(), admin.address);

    // Create a dispute resolver
    disputeResolver = mockDisputeResolver(
      operatorDR.address,
      adminDR.address,
      clerkDR.address,
      treasuryDR.address,
      false
    );
    expect(disputeResolver.isValid()).is.true;

    //Create DisputeResolverFee array so offer creation will succeed
    disputeResolverFeeNative = ethers.utils.parseUnits("1", "ether").toString();
    const disputeResolverFees = [
      new DisputeResolverFee(ethers.constants.AddressZero, "Native", disputeResolverFeeNative),
    ];

    // Make empty seller list, so every seller is allowed
    const sellerAllowList = [];

    // Register and activate the dispute resolver
    await accountHandler.connect(adminDR).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
    await accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id);

    // Create a seller account
    ({ offer, offerDates, offerDurations, disputeResolverId } = await mockOffer());
    offer.quantityAvailable = "3";

    // Check if domains are valid
    expect(offer.isValid()).is.true;
    expect(offerDates.isValid()).is.true;
    expect(offerDurations.isValid()).is.true;

    // Create the offer
    await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, "0");

    // Deposit seller funds so the commit will succeed
    const fundsToDeposit = ethers.BigNumber.from(offer.sellerDeposit).mul(offer.quantityAvailable);
    await fundsHandler.connect(operator).depositFunds(seller.id, ethers.constants.AddressZero, fundsToDeposit, {
      value: fundsToDeposit,
    });

    // Create a buyer account
    buyerAccount = mockBuyer(buyer.address);

    expect(await accountHandler.createBuyer(buyerAccount))
      .to.emit(accountHandler, "BuyerCreated")
      .withArgs(buyerAccount.id, buyerAccount.toStruct(), buyer.address);

    // Set time forward to the offer's voucherRedeemableFrom
    await setNextBlockTimestamp(Number(offerDates.voucherRedeemableFrom));

    for (exchangeId = 1; exchangeId <= 2; exchangeId++) {
      // Commit to offer, creating a new exchange
      await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offer.id, { value: offer.price });

      // Redeem voucher
      await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);
    }
  });

  afterEach(async function () {
    // Reset the accountId iterator
    accountId.next(true);
  });

  it("Buyer should be able to commit to offer even when DR removes fee", async function () {
    // Removes fee
    await expect(
      accountHandler.connect(adminDR).removeFeesFromDisputeResolver(disputeResolver.id, [ethers.constants.AddressZero])
    )
      .to.emit(accountHandler, "DisputeResolverFeesRemoved")
      .withArgs(disputeResolver.id, [ethers.constants.AddressZero], adminDR.address);

    // Commit to offer
    const tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offer.id, { value: offer.price });
    const blockTimestamp = (await ethers.provider.getBlock(tx.blockNumber)).timestamp;

    // Mock voucher
    const voucher = mockVoucher({
      committedDate: blockTimestamp.toString(),
      validUntilDate: (blockTimestamp + Number(offerDurations.voucherValid)).toString(),
      redeemedDate: "0",
    });

    exchangeId = "3";
    // Mock exchange
    const exchange = mockExchange({ id: exchangeId, buyerId: buyerAccount.id, finalizedDate: "0" });

    // Check if offer was committed
    await expect(tx)
      .to.emit(exchangeHandler, "BuyerCommitted")
      .withArgs(offer.id, buyerAccount.id, exchangeId, exchange.toStruct(), voucher.toStruct(), buyer.address);
  });

  context("👉 After raise dispute actions", async function () {
    beforeEach(async function () {
      for (exchangeId = 1; exchangeId <= 2; exchangeId++) {
        // Raise a dispute
        await disputeHandler.connect(buyer).raiseDispute(exchangeId);
      }
    });

    it("Buyer should be able to escalate a dispute even when DR removes fee", async function () {
      const buyerEscalationDepositNative = applyPercentage(disputeResolverFeeNative, buyerEscalationDepositPercentage);

      // Escalate dispute before removing fee
      exchangeId = "1";
      await expect(disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative }))
        .to.emit(disputeHandler, "DisputeEscalated")
        .withArgs(exchangeId, disputeResolver.id, buyer.address);

      // Removes fee
      await expect(
        accountHandler
          .connect(adminDR)
          .removeFeesFromDisputeResolver(disputeResolver.id, [ethers.constants.AddressZero])
      )
        .to.emit(accountHandler, "DisputeResolverFeesRemoved")
        .withArgs(disputeResolver.id, [ethers.constants.AddressZero], adminDR.address);

      // Escalate dispute after removing fee
      exchangeId = "2";
      await expect(disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative }))
        .to.emit(disputeHandler, "DisputeEscalated")
        .withArgs(exchangeId, disputeResolver.id, buyer.address);
    });

    context("👉 After escalate dispute actions", async function () {
      let buyerPercentBasisPoints;
      beforeEach(async function () {
        const buyerEscalationDepositNative = applyPercentage(
          disputeResolverFeeNative,
          buyerEscalationDepositPercentage
        );

        for (exchangeId = 1; exchangeId <= 2; exchangeId++) {
          // Escalate the dispute
          await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });
        }

        // Buyer percent used in tests
        buyerPercentBasisPoints = "4321";
      });

      it("DR should be able to decide dispute even when DR removes fee", async function () {
        exchangeId = "1";
        // Decide the dispute befor removing fee
        await expect(disputeHandler.connect(operatorDR).decideDispute(exchangeId, buyerPercentBasisPoints))
          .to.emit(disputeHandler, "DisputeDecided")
          .withArgs(exchangeId, buyerPercentBasisPoints, operatorDR.address);

        // Removes fee
        await expect(
          accountHandler
            .connect(adminDR)
            .removeFeesFromDisputeResolver(disputeResolver.id, [ethers.constants.AddressZero])
        )
          .to.emit(accountHandler, "DisputeResolverFeesRemoved")
          .withArgs(disputeResolver.id, [ethers.constants.AddressZero], adminDR.address);

        // Decide the dispute after removing fee
        exchangeId = "2";
        await expect(disputeHandler.connect(operatorDR).decideDispute(exchangeId, buyerPercentBasisPoints))
          .to.emit(disputeHandler, "DisputeDecided")
          .withArgs(exchangeId, buyerPercentBasisPoints, operatorDR.address);
      });

      it("DR should be able to refuse to decide dispute even when DR removes fee", async function () {
        // Refuse to decide the dispute before removing fee
        exchangeId = "1";
        await expect(disputeHandler.connect(operatorDR).refuseEscalatedDispute(exchangeId))
          .to.emit(disputeHandler, "EscalatedDisputeRefused")
          .withArgs(exchangeId, operatorDR.address);

        // Removes fee
        await expect(
          accountHandler
            .connect(adminDR)
            .removeFeesFromDisputeResolver(disputeResolver.id, [ethers.constants.AddressZero])
        )
          .to.emit(accountHandler, "DisputeResolverFeesRemoved")
          .withArgs(disputeResolver.id, [ethers.constants.AddressZero], adminDR.address);

        // Refuse to decide the dispute after removing fee
        exchangeId = "2";
        await expect(disputeHandler.connect(operatorDR).refuseEscalatedDispute(exchangeId))
          .to.emit(disputeHandler, "EscalatedDisputeRefused")
          .withArgs(exchangeId, operatorDR.address);
      });
    });
  });
});
