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
  mockAgent,
  accountId,
} = require("../utils/mock");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const Role = require("../../scripts/domain/Role");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { oneMonth, oneWeek } = require("../utils/constants");
const {
  setNextBlockTimestamp,
  calculateContractAddress,
  prepareDataSignatureParameters,
  applyPercentage,
} = require("../../scripts/util/test-utils.js");

describe("Update account roles addresses", function () {
  let accountHandler, offerHandler, exchangeHandler, fundsHandler, disputeHandler;
  let deployer, operator, admin, clerk, treasury, buyer, rando, operatorDR, adminDR, clerkDR, treasuryDR, agent;
  let buyerEscalationDepositPercentage;

  beforeEach(async function () {
    // Make accounts available
    [deployer, operator, admin, clerk, treasury, buyer, rando, operatorDR, adminDR, clerkDR, treasuryDR, agent] =
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
    buyerEscalationDepositPercentage = "1000"; // 10%

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
        minFulfillmentPeriod: oneWeek,
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
  });

  context("After commit actions", function () {
    let buyerAccount, seller, disputeResolver, agentAccount;
    let offer, offerDates, offerDurations, disputeResolverId;
    let exchangeId;
    let disputeResolverFeeNative;
    let expectedCloneAddress, emptyAuthToken, voucherInitValues;

    beforeEach(async function () {
      expectedCloneAddress = calculateContractAddress(accountHandler.address, "1");
      emptyAuthToken = mockAuthToken();
      expect(emptyAuthToken.isValid()).is.true;
      voucherInitValues = mockVoucherInitValues();
      expect(voucherInitValues.isValid()).is.true;

      // Create a seller account
      seller = mockSeller(operator.address, admin.address, clerk.address, treasury.address);
      await expect(accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues))
        .to.emit(accountHandler, "SellerCreated")
        .withArgs(seller.id, seller.toStruct(), expectedCloneAddress, emptyAuthToken.toStruct(), admin.address);

      // Create a dispute resolver
      disputeResolver = mockDisputeResolver(
        operatorDR.address,
        adminDR.address,
        clerkDR.address,
        treasuryDR.address,
        true
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
      await accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
      await accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id);

      agentAccount = mockAgent(agent.address);
      expect(agentAccount.isValid()).is.true;

      // Create an agent
      await accountHandler.connect(rando).createAgent(agentAccount);

      // Create an offer
      ({ offer, offerDates, offerDurations, disputeResolverId } = await mockOffer());

      offerDurations.fulfillmentPeriod = (oneMonth * 6).toString();

      // Check if domains are valid
      expect(offer.isValid()).is.true;
      expect(offerDates.isValid()).is.true;
      expect(offerDurations.isValid()).is.true;

      // Register the offer
      await offerHandler
        .connect(operator)
        .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentAccount.id);

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

    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    it("Seller should be able to revoke the voucher after updating operator address", async function () {
      seller.operator = rando.address;
      expect(seller.isValid()).is.true;

      // Update the seller wallet, testing for the event
      await expect(accountHandler.connect(admin).updateSeller(seller, emptyAuthToken))
        .to.emit(accountHandler, "SellerUpdated")
        .withArgs(seller.id, seller.toStruct(), emptyAuthToken.toStruct(), admin.address);

      // Revoke the voucher
      await expect(exchangeHandler.connect(rando).revokeVoucher(exchangeId))
        .to.emit(exchangeHandler, "VoucherRevoked")
        .withArgs(offer.id, exchangeId, rando.address);
    });

    it("Seller should be able to extend the voucher after updating operator address", async function () {
      seller.operator = rando.address;
      expect(seller.isValid()).is.true;

      // Update the seller wallet, testing for the event
      await expect(accountHandler.connect(admin).updateSeller(seller, emptyAuthToken))
        .to.emit(accountHandler, "SellerUpdated")
        .withArgs(seller.id, seller.toStruct(), emptyAuthToken.toStruct(), admin.address);

      // Extend the voucher
      const newValidUntil = offerDates.validUntil * 12;
      await expect(exchangeHandler.connect(rando).extendVoucher(exchangeId, newValidUntil))
        .to.emit(exchangeHandler, "VoucherExtended")
        .withArgs(offer.id, exchangeId, newValidUntil, rando.address);
    });

    context("After cancel actions", function () {
      let buyerPayoff, sellerPayoff;
      beforeEach(async function () {
        // Cancel the voucher, so buyer have something to withdraw
        await exchangeHandler.connect(buyer).cancelVoucher(exchangeId);

        // Expected buyer payoff: price - buyerCancelPenalty
        buyerPayoff = ethers.BigNumber.from(offer.price).sub(offer.buyerCancelPenalty).toString();
        // Expected seller payoff: sellerDeposit + buyerCancelPenalty
        sellerPayoff = ethers.BigNumber.from(offer.sellerDeposit).add(offer.buyerCancelPenalty).toString();
      });

      it("Buyer should be able to withdraw funds after updating wallet address", async function () {
        buyerAccount.wallet = rando.address;
        expect(buyerAccount.isValid()).is.true;

        // Update the buyer wallet, testing for the event
        await expect(accountHandler.connect(buyer).updateBuyer(buyerAccount))
          .to.emit(accountHandler, "BuyerUpdated")
          .withArgs(buyerAccount.id, buyerAccount.toStruct(), buyer.address);

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

      it("Seller should be able to withdraw funds after updating clerk address", async function () {
        seller.clerk = rando.address;
        expect(seller.isValid()).is.true;

        // Update the seller wallet, testing for the event
        await expect(accountHandler.connect(admin).updateSeller(seller, emptyAuthToken))
          .to.emit(accountHandler, "SellerUpdated")
          .withArgs(seller.id, seller.toStruct(), emptyAuthToken.toStruct(), admin.address);

        // Attempt to withdraw funds with old seller clerk, should fail
        await expect(
          fundsHandler.connect(clerk).withdrawFunds(seller.id, [ethers.constants.AddressZero], [sellerPayoff])
        ).to.revertedWith(RevertReasons.NOT_AUTHORIZED);

        // Attempt to withdraw funds with new seller clerk, should succeed
        await expect(
          fundsHandler.connect(rando).withdrawFunds(seller.id, [ethers.constants.AddressZero], [sellerPayoff])
        )
          .to.emit(fundsHandler, "FundsWithdrawn")
          .withArgs(seller.id, treasury.address, ethers.constants.AddressZero, sellerPayoff, rando.address);
      });
    });

    context("After redeem actions", async function () {
      beforeEach(async function () {
        // Redeem the voucher so that buyer can update the wallet
        await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);
      });

      it("Agent should be able to withdraw funds after updating wallet address", async function () {
        // Complete the exchange
        await exchangeHandler.connect(buyer).completeExchange(exchangeId);

        agentAccount.wallet = rando.address;
        expect(agentAccount.isValid()).is.true;

        // Update the agent wallet, testing for the event
        await expect(accountHandler.connect(agent).updateAgent(agentAccount))
          .to.emit(accountHandler, "AgentUpdated")
          .withArgs(agentAccount.id, agentAccount.toStruct(), agent.address);

        const agentPayoff = applyPercentage(offer.price, agentAccount.feePercentage);

        // Attempt to withdraw funds with old agent wallet, should fail
        await expect(
          fundsHandler.connect(agent).withdrawFunds(agentAccount.id, [ethers.constants.AddressZero], [agentPayoff])
        ).to.revertedWith(RevertReasons.NOT_AUTHORIZED);

        // Attempt to withdraw funds with new agent wallet, should fail
        await expect(
          fundsHandler.connect(rando).withdrawFunds(agentAccount.id, [ethers.constants.AddressZero], [agentPayoff])
        )
          .to.emit(fundsHandler, "FundsWithdrawn")
          .withArgs(agentAccount.id, rando.address, ethers.constants.AddressZero, agentPayoff, rando.address);
      });

      it("Buyer should be able to raise a dispute after updating wallet address", async function () {
        buyerAccount.wallet = rando.address;
        expect(buyerAccount.isValid()).is.true;

        // Update the buyer wallet, testing for the event
        await expect(accountHandler.connect(buyer).updateBuyer(buyerAccount))
          .to.emit(accountHandler, "BuyerUpdated")
          .withArgs(buyerAccount.id, buyerAccount.toStruct(), buyer.address);

        // Attempt to raise a dispute with old buyer wallet, should fail
        await expect(disputeHandler.connect(buyer).raiseDispute(exchangeId)).to.revertedWith(
          RevertReasons.NOT_VOUCHER_HOLDER
        );

        // Attempt to raise a dispute with new buyer wallet, should succeed
        await expect(disputeHandler.connect(rando).raiseDispute(exchangeId))
          .to.emit(disputeHandler, "DisputeRaised")
          .withArgs(exchangeId, buyerAccount.id, seller.id, rando.address);
      });

      it("Buyer should be able to complete exchange before fulfillment period is over after updating wallet address", async function () {
        buyerAccount.wallet = rando.address;
        expect(buyerAccount.isValid()).is.true;

        // Update the buyer wallet, testing for the event
        await expect(accountHandler.connect(buyer).updateBuyer(buyerAccount))
          .to.emit(accountHandler, "BuyerUpdated")
          .withArgs(buyerAccount.id, buyerAccount.toStruct(), buyer.address);

        // Complete the exchange, expecting event
        const tx = await exchangeHandler.connect(rando).completeExchange(exchangeId);
        await expect(tx)
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offer.id, buyerAccount.id, exchangeId, rando.address);

        const block = await ethers.provider.getBlock(tx.blockNumber);
        const fulfillmentPeriod = Number(offerDurations.fulfillmentPeriod);

        // Expect the fulfillment period to not be over
        expect(block.timestamp).to.be.at.most(fulfillmentPeriod);
      });

      context("After raise dispute actions", async function () {
        let message, customSignatureType, resolutionType, buyerPercent;

        beforeEach(async function () {
          await disputeHandler.connect(buyer).raiseDispute(exchangeId);

          buyerPercent = "1234";

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
            buyerPercentBasisPoints: buyerPercent,
          };
        });

        it("Seller should be able to resolve a dispute after updating operator address", async function () {
          seller.operator = rando.address;
          expect(seller.isValid()).is.true;

          // Update the seller wallet, testing for the event
          await expect(accountHandler.connect(admin).updateSeller(seller, emptyAuthToken))
            .to.emit(accountHandler, "SellerUpdated")
            .withArgs(seller.id, seller.toStruct(), emptyAuthToken.toStruct(), admin.address);

          // Collect the signature components
          const { r, s, v } = await prepareDataSignatureParameters(
            buyer, // When seller is the caller, buyer should be the signer.
            customSignatureType,
            "Resolution",
            message,
            disputeHandler.address
          );

          // Attempt to resolve a dispute with old seller operator, should fail
          await expect(
            disputeHandler.connect(operator).resolveDispute(exchangeId, buyerPercent, r, s, v)
          ).to.revertedWith(RevertReasons.NOT_BUYER_OR_SELLER);

          // Attempt to resolve a dispute with new seller operator, should succeed
          await expect(disputeHandler.connect(rando).resolveDispute(exchangeId, buyerPercent, r, s, v))
            .to.emit(disputeHandler, "DisputeResolved")
            .withArgs(exchangeId, buyerPercent, rando.address);
        });

        it("Buyer should be able to resolve a dispute after updating wallet address", async function () {
          buyerAccount.wallet = rando.address;
          expect(buyerAccount.isValid()).is.true;

          // Update the buyer wallet, testing for the event
          await expect(accountHandler.connect(buyer).updateBuyer(buyerAccount))
            .to.emit(accountHandler, "BuyerUpdated")
            .withArgs(buyerAccount.id, buyerAccount.toStruct(), buyer.address);

          // Collect the signature components
          const { r, s, v } = await prepareDataSignatureParameters(
            operator, // When buyer is the caller, seller should be the signer
            customSignatureType,
            "Resolution",
            message,
            disputeHandler.address
          );

          // Attempt to resolve a dispute with old buyer wallet, should fail
          await expect(disputeHandler.connect(buyer).resolveDispute(exchangeId, buyerPercent, r, s, v)).to.revertedWith(
            RevertReasons.NOT_BUYER_OR_SELLER
          );

          // Attempt to resolve a dispute with new buyer wallet, should succeed
          await expect(disputeHandler.connect(rando).resolveDispute(exchangeId, buyerPercent, r, s, v))
            .to.emit(disputeHandler, "DisputeResolved")
            .withArgs(exchangeId, buyerPercent, rando.address);
        });

        it("If the buyer wallet address was changed, the seller should not be able to resolve a dispute with the old signature", async function () {
          buyerAccount.wallet = rando.address;
          expect(buyerAccount.isValid()).is.true;

          // Update the buyer wallet, testing for the event
          await expect(accountHandler.connect(buyer).updateBuyer(buyerAccount))
            .to.emit(accountHandler, "BuyerUpdated")
            .withArgs(buyerAccount.id, buyerAccount.toStruct(), buyer.address);

          // Collect the signature components
          const { r, s, v } = await prepareDataSignatureParameters(
            buyer, // When buyer is the caller, seller should be the signer
            customSignatureType,
            "Resolution",
            message,
            disputeHandler.address
          );

          // Attempt to resolve a dispute with old buyer wallet, should fail
          await expect(
            disputeHandler.connect(operator).resolveDispute(exchangeId, buyerPercent, r, s, v)
          ).to.revertedWith(RevertReasons.SIGNER_AND_SIGNATURE_DO_NOT_MATCH);
        });

        it("If the seller operator address was changed, the buyer should not be able to resolve a dispute with the old signature", async function () {
          seller.operator = rando.address;
          expect(seller.isValid()).is.true;

          // Update the seller wallet, testing for the event
          await expect(accountHandler.connect(admin).updateSeller(seller, emptyAuthToken))
            .to.emit(accountHandler, "SellerUpdated")
            .withArgs(seller.id, seller.toStruct(), emptyAuthToken.toStruct(), admin.address);

          // Collect the signature components
          const { r, s, v } = await prepareDataSignatureParameters(
            operator, // When buyer is the caller, seller should be the signer
            customSignatureType,
            "Resolution",
            message,
            disputeHandler.address
          );

          // Attempt to resolve a dispute with old buyer wallet, should fail
          await expect(disputeHandler.connect(buyer).resolveDispute(exchangeId, buyerPercent, r, s, v)).to.revertedWith(
            RevertReasons.SIGNER_AND_SIGNATURE_DO_NOT_MATCH
          );
        });

        it("Dispute resolver should be able to decide a dispute after change the operator address", async function () {
          const buyerEscalationDepositNative = applyPercentage(
            disputeResolverFeeNative,
            buyerEscalationDepositPercentage
          );

          // Escalate the dispute
          await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

          disputeResolver.operator = rando.address;
          expect(disputeResolver.isValid()).is.true;

          // Update the dispute resolver operator, testing for the event
          await expect(accountHandler.connect(adminDR).updateDisputeResolver(disputeResolver))
            .to.emit(accountHandler, "DisputeResolverUpdated")
            .withArgs(disputeResolver.id, disputeResolver.toStruct(), adminDR.address);

          const buyerPercent = "1234";

          // Attempt to decide a dispute with old dispute resolver operator, should fail
          await expect(disputeHandler.connect(operator).decideDispute(exchangeId, buyerPercent)).to.revertedWith(
            RevertReasons.NOT_DISPUTE_RESOLVER_OPERATOR
          );

          // Attempt to decide a dispute with new dispute resolver operator, should fail
          await expect(disputeHandler.connect(rando).decideDispute(exchangeId, buyerPercent))
            .to.emit(disputeHandler, "DisputeDecided")
            .withArgs(exchangeId, buyerPercent, rando.address);
        });
      });
    });
  });
});
