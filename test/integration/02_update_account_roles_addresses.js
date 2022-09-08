const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");
const {
  mockBuyer,
  mockSeller,
  mockAuthToken,
  mockVoucherInitValues,
  mockOffer,
  mockDisputeResolver,
} = require("../utils/mock");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const Role = require("../../scripts/domain/Role");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { oneMonth } = require("../utils/constants");
const { setNextBlockTimestamp, calculateContractAddress } = require("../../scripts/util/test-utils.js");

describe.only("Update account roles addresses", function () {
  let accountHandler, offerHandler, exchangeHandler, fundsHandler, disputeHandler;
  let expectedCloneAddress, emptyAuthToken, voucherInitValues;
  let gasLimit;
  let deployer, operator, admin, clerk, treasury, buyer, rando, operatorDR, adminDR, clerkDR, treasuryDR;

  before(async function () {
    // Make accounts available
    [deployer, operator, admin, clerk, treasury, buyer, rando, operatorDR, adminDR, clerkDR, treasuryDR] =
      await ethers.getSigners();

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
    const protocolClientArgs = [accessController.address, protocolDiamond.address];
    const [, beacons, proxies] = await deployProtocolClients(protocolClientArgs, gasLimit);
    const [beacon] = beacons;
    const [proxy] = proxies;

    // set protocolFees
    const protocolFeePercentage = "200"; // 2 %
    const protocolFeeFlatBoson = ethers.utils.parseUnits("0.01", "ether").toString();
    const buyerEscalationDepositPercentage = "1000"; // 10%

    // Add config Handler, so ids start at 1, and so voucher address can be found
    const protocolConfig = [
      // Protocol addresses
      {
        treasury: ethers.constants.AddressZero,
        token: ethers.constants.AddressZero,
        voucherBeacon: beacon.address,
        beaconProxy: proxy.address,
      },
      // Protocol limits
      {
        maxExchangesPerBatch: 0,
        maxOffersPerGroup: 0,
        maxTwinsPerBundle: 0,
        maxOffersPerBundle: 0,
        maxOffersPerBatch: 0,
        maxTokensPerWithdrawal: 1,
        maxFeesPerDisputeResolver: 100,
        maxEscalationResponsePeriod: oneMonth,
        maxDisputesPerBatch: 0,
        maxAllowedSellers: 100,
        maxTotalOfferFeePercentage: 4000, //40%
        maxRoyaltyPecentage: 1000, //10%
        maxResolutionPeriod: oneMonth,
      },
      // Protocol fees
      {
        percentage: protocolFeePercentage,
        flatBoson: protocolFeeFlatBoson,
      },
      buyerEscalationDepositPercentage,
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

    // expected address of the first clone
    expectedCloneAddress = calculateContractAddress(accountHandler.address, "1");
    emptyAuthToken = mockAuthToken();
    voucherInitValues = mockVoucherInitValues();
    expect(emptyAuthToken.isValid()).is.true;
  });

  context("Buyer", function () {
    let buyerAccount;
    let offer, offerDates;
    let exchangeId;
    let seller;

    beforeEach(async function () {
      // Create a seller account
      seller = mockSeller(operator.address, admin.address, clerk.address, treasury.address);
      expect(await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues))
        .to.emit(accountHandler, "SellerCreated")
        .withArgs(seller.id, seller.toStruct(), expectedCloneAddress, emptyAuthToken.toStruct(), admin.address);

      // Create a dispute resolver
      const disputeResolver = mockDisputeResolver(
        operatorDR.address,
        adminDR.address,
        clerkDR.address,
        treasuryDR.address,
        false
      );
      expect(disputeResolver.isValid()).is.true;

      //Create DisputeResolverFee array so offer creation will succeed
      const disputeResolverFees = [new DisputeResolverFee(ethers.constants.AddressZero, "Native", "0")];

      // Make empty seller list, so every seller is allowed
      const sellerAllowList = [];

      // Register and activate the dispute resolver
      await accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
      await accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id);

      // Create a seller account
      const mo = await mockOffer();
      const { offerDurations, disputeResolverId } = mo;
      offer = mo.offer;
      offerDates = mo.offerDates;

      // Check if domains are valid
      expect(offer.isValid()).is.true;
      expect(offerDates.isValid()).is.true;
      expect(offerDurations.isValid()).is.true;

      // Create the offer
      await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, "0");

      // Deposit seller funds so the commit will succeed
      await fundsHandler
        .connect(operator)
        .depositFunds(seller.id, ethers.constants.AddressZero, offer.sellerDeposit, { value: offer.sellerDeposit });

      // Create a buyer account
      buyerAccount = mockBuyer(buyer.address);

      expect(await accountHandler.createBuyer(buyerAccount))
        .to.emit(accountHandler, "BuyerCreated")
        .withArgs(buyerAccount.id, buyerAccount.toStruct(), buyer.address);

      // Set time forward to the offer's voucherRedeemableFrom
      await setNextBlockTimestamp(Number(offerDates.voucherRedeemableFrom));

      // Commit to offer
      await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offer.id, { value: offer.price });

      exchangeId = "1";
    });

    it("should be able to withdraw funds after change the wallet address", async function () {
      // Cancel the voucher, so buyer have something to withdraw
      await exchangeHandler.connect(buyer).cancelVoucher(exchangeId);

      // Expected buyer payoff: price - buyerCancelPenalty
      let buyerPayoff = ethers.BigNumber.from(offer.price).sub(offer.buyerCancelPenalty).toString();

      buyerAccount.wallet = rando.address;
      expect(buyerAccount.isValid()).is.true;

      // Update the buyer wallet, testing for the event
      expect(await accountHandler.connect(buyer).updateBuyer(buyerAccount))
        .to.emit(accountHandler, "BuyerUpdated")
        .withArgs(buyer.id, buyerAccount.toStruct(), buyer.address);

      // Attempt to withdraw funds with old buyer wallet, should fail
      await expect(
        fundsHandler.connect(buyer).withdrawFunds(buyerAccount.id, [ethers.constants.AddressZero], [buyerPayoff])
      ).to.revertedWith(RevertReasons.NOT_AUTHORIZED);

      // Attempt to withdraw funds with new buyer wallet, should succeed
      await expect(
        fundsHandler.connect(rando).withdrawFunds(buyerAccount.id, [ethers.constants.AddressZero], [buyerPayoff])
      )
        .to.emit(fundsHandler, "FundsWithdrawn")
        .withArgs(buyerAccount.id, rando.address, ethers.constants.AddressZero, buyerPayoff, rando.address);
    });

    it.only("should be able to raise a dispute after change the wallet address", async function () {
      // Redeem the voucher so that buyer can update the wallet
      await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

      buyerAccount.wallet = rando.address;
      expect(buyerAccount.isValid()).is.true;

      // Update the buyer wallet, testing for the event
      expect(await accountHandler.connect(buyer).updateBuyer(buyerAccount))
        .to.emit(accountHandler, "BuyerUpdated")
        .withArgs(buyer.id, buyerAccount.toStruct(), buyer.address);

      // Attempt to raise a dispute with old buyer wallet, should fail
      await expect(disputeHandler.connect(buyer).raiseDispute(exchangeId)).to.revertedWith(
        RevertReasons.NOT_VOUCHER_HOLDER
      );

      // Attempt to raise a dispute with new buyer wallet, should succeed
      await expect(disputeHandler.connect(rando).raiseDispute(exchangeId))
        .to.emit(disputeHandler, "DisputeRaised")
        .withArgs(exchangeId, buyerAccount.id, seller.id, rando.address);
    });
  });
});
