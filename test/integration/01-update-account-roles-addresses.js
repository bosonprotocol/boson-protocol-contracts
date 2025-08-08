const { ethers } = require("hardhat");
const { ZeroAddress, provider, getContractAt, MaxUint256 } = ethers;
const { expect } = require("chai");

const {
  mockBuyer,
  mockSeller,
  mockAuthToken,
  mockVoucherInitValues,
  mockOffer,
  mockDisputeResolver,
  mockAgent,
  accountId,
} = require("../util/mock");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const SellerUpdateFields = require("../../scripts/domain/SellerUpdateFields");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { oneMonth } = require("../util/constants");
const {
  setNextBlockTimestamp,
  calculateCloneAddress,
  calculateBosonProxyAddress,
  prepareDataSignature,
  applyPercentage,
  setupTestEnvironment,
  getSnapshot,
  revertToSnapshot,
} = require("../util/utils.js");
const DisputeResolverUpdateFields = require("../../scripts/domain/DisputeResolverUpdateFields");

/**
 *  Integration test case - operations should remain possible after updating account roles addresses.
 */
describe("[@skip-on-coverage] Update account roles addresses", function () {
  let accountHandler, offerHandler, exchangeHandler, exchangeCommitHandler, fundsHandler, disputeHandler;
  let assistant, admin, clerk, treasury, buyer, rando, assistantDR, adminDR, clerkDR, treasuryDR, agent;
  let buyerEscalationDepositPercentage, redeemedDate;
  let snapshotId;
  let beaconProxyAddress;
  let bosonErrors;

  before(async function () {
    accountId.next(true);

    // Specify contracts needed for this test
    const contracts = {
      accountHandler: "IBosonAccountHandler",
      offerHandler: "IBosonOfferHandler",
      exchangeHandler: "IBosonExchangeHandler",
      exchangeCommitHandler: "IBosonExchangeCommitHandler",
      fundsHandler: "IBosonFundsHandler",
      disputeHandler: "IBosonDisputeHandler",
    };

    let protocolDiamondAddress;
    ({
      diamondAddress: protocolDiamondAddress,
      signers: [admin, treasury, buyer, rando, adminDR, treasuryDR, agent],
      contractInstances: {
        accountHandler,
        offerHandler,
        exchangeHandler,
        exchangeCommitHandler,
        fundsHandler,
        disputeHandler,
      },
      protocolConfig: [, , , , buyerEscalationDepositPercentage],
    } = await setupTestEnvironment(contracts));

    bosonErrors = await getContractAt("BosonErrors", await accountHandler.getAddress());

    // make all account the same
    assistant = admin;
    assistantDR = adminDR;
    clerk = clerkDR = { address: ZeroAddress };

    // Get the beacon proxy address
    beaconProxyAddress = await calculateBosonProxyAddress(protocolDiamondAddress);

    // Get snapshot id
    snapshotId = await getSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();
  });

  context("After commit actions", function () {
    let buyerAccount, seller, disputeResolver, agentAccount, sellerPendingUpdate;
    let offer, offerDates, offerDurations, drParams;
    let exchangeId;
    let disputeResolverFeeNative;
    let expectedCloneAddress, emptyAuthToken, voucherInitValues;

    beforeEach(async function () {
      expectedCloneAddress = calculateCloneAddress(
        await accountHandler.getAddress(),
        beaconProxyAddress,
        admin.address
      );
      emptyAuthToken = mockAuthToken();
      expect(emptyAuthToken.isValid()).is.true;
      voucherInitValues = mockVoucherInitValues();
      expect(voucherInitValues.isValid()).is.true;

      // Create a seller account
      seller = mockSeller(
        await assistant.getAddress(),
        await admin.getAddress(),
        clerk.address,
        await treasury.getAddress()
      );
      await expect(accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues))
        .to.emit(accountHandler, "SellerCreated")
        .withArgs(
          seller.id,
          seller.toStruct(),
          expectedCloneAddress,
          emptyAuthToken.toStruct(),
          await admin.getAddress()
        );

      // Create a dispute resolver
      disputeResolver = mockDisputeResolver(
        await assistantDR.getAddress(),
        await adminDR.getAddress(),
        clerkDR.address,
        await treasuryDR.getAddress(),
        true
      );
      expect(disputeResolver.isValid()).is.true;

      //Create DisputeResolverFee array so offer creation will succeed
      disputeResolverFeeNative = "0";
      const disputeResolverFees = [new DisputeResolverFee(ZeroAddress, "Native", disputeResolverFeeNative)];

      // Make empty seller list, so every seller is allowed
      const sellerAllowList = [];

      // Register the dispute resolver
      await accountHandler
        .connect(adminDR)
        .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

      agentAccount = mockAgent(await agent.getAddress());
      expect(agentAccount.isValid()).is.true;

      // Create an agent
      await accountHandler.connect(rando).createAgent(agentAccount);

      // Create an offer
      ({ offer, offerDates, offerDurations, drParams } = await mockOffer());

      offerDurations.disputePeriod = (oneMonth * 6n).toString();

      // Check if domains are valid
      expect(offer.isValid()).is.true;
      expect(offerDates.isValid()).is.true;
      expect(offerDurations.isValid()).is.true;

      // Register the offer
      const offerFeeLimit = MaxUint256;
      await offerHandler
        .connect(assistant)
        .createOffer(offer, offerDates, offerDurations, drParams, agentAccount.id, offerFeeLimit);

      // Deposit seller funds so the commit will succeed
      await fundsHandler
        .connect(assistant)
        .depositFunds(seller.id, ZeroAddress, offer.sellerDeposit, { value: offer.sellerDeposit });

      // Create a buyer account
      buyerAccount = mockBuyer(await buyer.getAddress());

      expect(await accountHandler.createBuyer(buyerAccount))
        .to.emit(accountHandler, "BuyerCreated")
        .withArgs(buyerAccount.id, buyerAccount.toStruct(), await buyer.getAddress());

      // Set time forward to the offer's voucherRedeemableFrom
      await setNextBlockTimestamp(Number(offerDates.voucherRedeemableFrom));

      // Commit to offer
      await exchangeCommitHandler
        .connect(buyer)
        .commitToOffer(await buyer.getAddress(), offer.id, { value: offer.price });

      exchangeId = "1";

      const addressZero = ZeroAddress;
      sellerPendingUpdate = mockSeller(addressZero, addressZero, addressZero, addressZero);
      sellerPendingUpdate.id = "0";
      sellerPendingUpdate.active = false;
    });

    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    it("Seller should be able to revoke the voucher after updating assistant address", async function () {
      seller.assistant = await rando.getAddress();
      expect(seller.isValid()).is.true;
      sellerPendingUpdate.assistant = await rando.getAddress();

      // Update the seller wallet, testing for the event
      await expect(accountHandler.connect(admin).updateSeller(seller, emptyAuthToken))
        .to.emit(accountHandler, "SellerUpdatePending")
        .withArgs(seller.id, sellerPendingUpdate.toStruct(), emptyAuthToken.toStruct(), await admin.getAddress());

      sellerPendingUpdate.assistant = ZeroAddress;

      // Approve the update
      await expect(accountHandler.connect(rando).optInToSellerUpdate(seller.id, [SellerUpdateFields.Assistant]))
        .to.emit(accountHandler, "SellerUpdateApplied")
        .withArgs(
          seller.id,
          seller.toStruct(),
          sellerPendingUpdate.toStruct(),
          emptyAuthToken.toStruct(),
          emptyAuthToken.toStruct(),
          await rando.getAddress()
        );

      // Revoke the voucher
      await expect(exchangeHandler.connect(rando).revokeVoucher(exchangeId))
        .to.emit(exchangeHandler, "VoucherRevoked")
        .withArgs(offer.id, exchangeId, await rando.getAddress());
    });

    it("Seller should be able to extend the voucher after updating assistant address", async function () {
      seller.assistant = await rando.getAddress();
      expect(seller.isValid()).is.true;
      sellerPendingUpdate.assistant = await rando.getAddress();

      // Update the seller wallet, testing for the event
      await expect(accountHandler.connect(admin).updateSeller(seller, emptyAuthToken))
        .to.emit(accountHandler, "SellerUpdatePending")
        .withArgs(seller.id, sellerPendingUpdate.toStruct(), emptyAuthToken.toStruct(), await admin.getAddress());

      sellerPendingUpdate.assistant = ZeroAddress;

      // Approve the update
      await expect(accountHandler.connect(rando).optInToSellerUpdate(seller.id, [SellerUpdateFields.Assistant]))
        .to.emit(accountHandler, "SellerUpdateApplied")
        .withArgs(
          seller.id,
          seller.toStruct(),
          sellerPendingUpdate.toStruct(),
          emptyAuthToken.toStruct(),
          emptyAuthToken.toStruct(),
          await rando.getAddress()
        );

      // Extend the voucher
      const newValidUntil = offerDates.validUntil * 12;
      await expect(exchangeHandler.connect(rando).extendVoucher(exchangeId, newValidUntil))
        .to.emit(exchangeHandler, "VoucherExtended")
        .withArgs(offer.id, exchangeId, newValidUntil, await rando.getAddress());
    });

    context("After cancel actions", function () {
      let buyerPayoff, sellerPayoff;
      beforeEach(async function () {
        // Cancel the voucher, so buyer have something to withdraw
        await exchangeHandler.connect(buyer).cancelVoucher(exchangeId);

        // Expected buyer payoff: price - buyerCancelPenalty
        buyerPayoff = (BigInt(offer.price) - BigInt(offer.buyerCancelPenalty)).toString();
        // Expected seller payoff: sellerDeposit + buyerCancelPenalty
        sellerPayoff = (BigInt(offer.sellerDeposit) + BigInt(offer.buyerCancelPenalty)).toString();
      });

      it("Buyer should be able to withdraw funds after updating wallet address", async function () {
        buyerAccount.wallet = await rando.getAddress();
        expect(buyerAccount.isValid()).is.true;

        // Update the buyer wallet, testing for the event
        await expect(accountHandler.connect(buyer).updateBuyer(buyerAccount))
          .to.emit(accountHandler, "BuyerUpdated")
          .withArgs(buyerAccount.id, buyerAccount.toStruct(), await buyer.getAddress());

        // Attempt to withdraw funds with old buyer wallet, should fail
        await expect(
          fundsHandler.connect(buyer).withdrawFunds(buyerAccount.id, [ZeroAddress], [buyerPayoff])
        ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_AUTHORIZED);

        // Attempt to withdraw funds with new buyer wallet, should succeed
        await expect(fundsHandler.connect(rando).withdrawFunds(buyerAccount.id, [ZeroAddress], [buyerPayoff]))
          .to.emit(fundsHandler, "FundsWithdrawn")
          .withArgs(buyerAccount.id, await rando.getAddress(), ZeroAddress, buyerPayoff, await rando.getAddress());
      });

      it("Seller should be able to withdraw funds after updating assistant address", async function () {
        seller.assistant = await rando.getAddress();
        expect(seller.isValid()).is.true;
        sellerPendingUpdate.assistant = await rando.getAddress();

        // Update the seller wallet, testing for the event
        await expect(accountHandler.connect(admin).updateSeller(seller, emptyAuthToken))
          .to.emit(accountHandler, "SellerUpdatePending")
          .withArgs(seller.id, sellerPendingUpdate.toStruct(), emptyAuthToken.toStruct(), await admin.getAddress());

        sellerPendingUpdate.assistant = ZeroAddress;

        // Approve the update
        await expect(accountHandler.connect(rando).optInToSellerUpdate(seller.id, [SellerUpdateFields.Assistant]))
          .to.emit(accountHandler, "SellerUpdateApplied")
          .withArgs(
            seller.id,
            seller.toStruct(),
            sellerPendingUpdate.toStruct(),
            emptyAuthToken.toStruct(),
            emptyAuthToken.toStruct(),
            await rando.getAddress()
          );

        // Attempt to withdraw funds with old seller assistant, should fail
        await expect(
          fundsHandler.connect(assistant).withdrawFunds(seller.id, [ZeroAddress], [sellerPayoff])
        ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_AUTHORIZED);

        // Attempt to withdraw funds with new seller assistant, should succeed
        await expect(fundsHandler.connect(rando).withdrawFunds(seller.id, [ZeroAddress], [sellerPayoff]))
          .to.emit(fundsHandler, "FundsWithdrawn")
          .withArgs(seller.id, await treasury.getAddress(), ZeroAddress, sellerPayoff, await rando.getAddress());
      });
    });

    context("After redeem actions", async function () {
      beforeEach(async function () {
        // Redeem the voucher so that buyer can update the wallet
        const tx = await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);
        const block = await provider.getBlock(tx.blockNumber);
        redeemedDate = BigInt(block.timestamp);
      });

      it("Agent should be able to withdraw funds after updating wallet address", async function () {
        // Complete the exchange
        await exchangeHandler.connect(buyer).completeExchange(exchangeId);

        agentAccount.wallet = await rando.getAddress();
        expect(agentAccount.isValid()).is.true;

        // Update the agent wallet, testing for the event
        await expect(accountHandler.connect(agent).updateAgent(agentAccount))
          .to.emit(accountHandler, "AgentUpdated")
          .withArgs(agentAccount.id, agentAccount.toStruct(), await agent.getAddress());

        const agentPayoff = applyPercentage(offer.price, agentAccount.feePercentage);

        // Attempt to withdraw funds with old agent wallet, should fail
        await expect(
          fundsHandler.connect(agent).withdrawFunds(agentAccount.id, [ZeroAddress], [agentPayoff])
        ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_AUTHORIZED);

        // Attempt to withdraw funds with new agent wallet, should fail
        await expect(fundsHandler.connect(rando).withdrawFunds(agentAccount.id, [ZeroAddress], [agentPayoff]))
          .to.emit(fundsHandler, "FundsWithdrawn")
          .withArgs(agentAccount.id, await rando.getAddress(), ZeroAddress, agentPayoff, await rando.getAddress());
      });

      it("Buyer should be able to raise dispute after updating wallet address", async function () {
        buyerAccount.wallet = await rando.getAddress();
        expect(buyerAccount.isValid()).is.true;

        // Update the buyer wallet, testing for the event
        await expect(accountHandler.connect(buyer).updateBuyer(buyerAccount))
          .to.emit(accountHandler, "BuyerUpdated")
          .withArgs(buyerAccount.id, buyerAccount.toStruct(), await buyer.getAddress());

        // Attempt to raise a dispute with old buyer wallet, should fail
        await expect(disputeHandler.connect(buyer).raiseDispute(exchangeId)).to.revertedWithCustomError(
          bosonErrors,
          RevertReasons.NOT_VOUCHER_HOLDER
        );

        // Attempt to raise a dispute with new buyer wallet, should succeed
        await expect(disputeHandler.connect(rando).raiseDispute(exchangeId))
          .to.emit(disputeHandler, "DisputeRaised")
          .withArgs(exchangeId, buyerAccount.id, seller.id, await rando.getAddress());
      });

      it("Buyer should be able to complete exchange before dispute period is over after updating wallet address", async function () {
        buyerAccount.wallet = await rando.getAddress();
        expect(buyerAccount.isValid()).is.true;

        // Update the buyer wallet, testing for the event
        await expect(accountHandler.connect(buyer).updateBuyer(buyerAccount))
          .to.emit(accountHandler, "BuyerUpdated")
          .withArgs(buyerAccount.id, buyerAccount.toStruct(), await buyer.getAddress());

        // Complete the exchange, expecting event
        const tx = await exchangeHandler.connect(rando).completeExchange(exchangeId);
        await expect(tx)
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offer.id, buyerAccount.id, exchangeId, await rando.getAddress());

        const block = await provider.getBlock(tx.blockNumber);
        const disputePeriodEnd = redeemedDate + BigInt(offerDurations.disputePeriod);

        // Expect the dispute period to not be over
        expect(block.timestamp).to.be.at.most(disputePeriodEnd);
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

        it("Seller should be able to resolve dispute after updating assistant address", async function () {
          seller.assistant = await rando.getAddress();
          expect(seller.isValid()).is.true;
          sellerPendingUpdate.assistant = await rando.getAddress();

          // Update the seller wallet, testing for the event
          await expect(accountHandler.connect(admin).updateSeller(seller, emptyAuthToken))
            .to.emit(accountHandler, "SellerUpdatePending")
            .withArgs(seller.id, sellerPendingUpdate.toStruct(), emptyAuthToken.toStruct(), await admin.getAddress());

          sellerPendingUpdate.assistant = ZeroAddress;

          // Approve the update
          await expect(accountHandler.connect(rando).optInToSellerUpdate(seller.id, [SellerUpdateFields.Assistant]))
            .to.emit(accountHandler, "SellerUpdateApplied")
            .withArgs(
              seller.id,
              seller.toStruct(),
              sellerPendingUpdate.toStruct(),
              emptyAuthToken.toStruct(),
              emptyAuthToken.toStruct(),
              await rando.getAddress()
            );

          // Collect the signature components
          const signature = await prepareDataSignature(
            buyer, // When seller is the caller, buyer should be the signer.
            customSignatureType,
            "Resolution",
            message,
            await disputeHandler.getAddress()
          );

          // Attempt to resolve a dispute with old seller assistant, should fail
          await expect(
            disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercent, signature)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_BUYER_OR_SELLER);

          // Attempt to resolve a dispute with new seller assistant, should succeed
          await expect(disputeHandler.connect(rando).resolveDispute(exchangeId, buyerPercent, signature))
            .to.emit(disputeHandler, "DisputeResolved")
            .withArgs(exchangeId, buyerPercent, await rando.getAddress());
        });

        it("Buyer should be able to resolve dispute after updating wallet address", async function () {
          buyerAccount.wallet = await rando.getAddress();
          expect(buyerAccount.isValid()).is.true;

          // Update the buyer wallet, testing for the event
          await expect(accountHandler.connect(buyer).updateBuyer(buyerAccount))
            .to.emit(accountHandler, "BuyerUpdated")
            .withArgs(buyerAccount.id, buyerAccount.toStruct(), await buyer.getAddress());

          // Collect the signature components
          const signature = await prepareDataSignature(
            assistant, // When buyer is the caller, seller should be the signer
            customSignatureType,
            "Resolution",
            message,
            await disputeHandler.getAddress()
          );

          // Attempt to resolve a dispute with old buyer wallet, should fail
          await expect(
            disputeHandler.connect(buyer).resolveDispute(exchangeId, buyerPercent, signature)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_BUYER_OR_SELLER);

          // Attempt to resolve a dispute with new buyer wallet, should succeed
          await expect(disputeHandler.connect(rando).resolveDispute(exchangeId, buyerPercent, signature))
            .to.emit(disputeHandler, "DisputeResolved")
            .withArgs(exchangeId, buyerPercent, await rando.getAddress());
        });

        it("If the buyer wallet address was changed, the seller should not be able to resolve a dispute with the old signature", async function () {
          buyerAccount.wallet = await rando.getAddress();
          expect(buyerAccount.isValid()).is.true;

          // Update the buyer wallet, testing for the event
          await expect(accountHandler.connect(buyer).updateBuyer(buyerAccount))
            .to.emit(accountHandler, "BuyerUpdated")
            .withArgs(buyerAccount.id, buyerAccount.toStruct(), await buyer.getAddress());

          // Collect the signature components
          const signature = await prepareDataSignature(
            buyer, // When buyer is the caller, seller should be the signer
            customSignatureType,
            "Resolution",
            message,
            await disputeHandler.getAddress()
          );

          // Attempt to resolve a dispute with old buyer wallet, should fail
          await expect(
            disputeHandler.connect(assistant).resolveDispute(exchangeId, buyerPercent, signature)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.SIGNATURE_VALIDATION_FAILED);
        });

        it("If the seller assistant address was changed, the buyer should not be able to resolve a dispute with the old signature", async function () {
          seller.assistant = await rando.getAddress();
          expect(seller.isValid()).is.true;
          sellerPendingUpdate.assistant = await rando.getAddress();

          // Update the seller wallet, testing for the event
          await expect(accountHandler.connect(admin).updateSeller(seller, emptyAuthToken))
            .to.emit(accountHandler, "SellerUpdatePending")
            .withArgs(seller.id, sellerPendingUpdate.toStruct(), emptyAuthToken.toStruct(), await admin.getAddress());

          sellerPendingUpdate.assistant = ZeroAddress;

          // Approve the update
          await expect(accountHandler.connect(rando).optInToSellerUpdate(seller.id, [SellerUpdateFields.Assistant]))
            .to.emit(accountHandler, "SellerUpdateApplied")
            .withArgs(
              seller.id,
              seller.toStruct(),
              sellerPendingUpdate.toStruct(),
              emptyAuthToken.toStruct(),
              emptyAuthToken.toStruct(),
              await rando.getAddress()
            );

          // Collect the signature components
          const signature = await prepareDataSignature(
            assistant, // When buyer is the caller, seller should be the signer
            customSignatureType,
            "Resolution",
            message,
            await disputeHandler.getAddress()
          );

          // Attempt to resolve a dispute with old buyer wallet, should fail
          await expect(
            disputeHandler.connect(buyer).resolveDispute(exchangeId, buyerPercent, signature)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.SIGNATURE_VALIDATION_FAILED);
        });

        it("Buyer should be able to retract dispute after updating wallet address", async function () {
          buyerAccount.wallet = await rando.getAddress();
          expect(buyerAccount.isValid()).is.true;

          // Update the buyer wallet, testing for the event
          await expect(accountHandler.connect(buyer).updateBuyer(buyerAccount))
            .to.emit(accountHandler, "BuyerUpdated")
            .withArgs(buyerAccount.id, buyerAccount.toStruct(), await buyer.getAddress());

          // Attempt to retract a dispute with old buyer, should fail
          await expect(disputeHandler.connect(buyer).retractDispute(exchangeId)).to.be.revertedWithCustomError(
            bosonErrors,
            RevertReasons.NOT_VOUCHER_HOLDER
          );

          // Attempt to retract a dispute with new buyer, should succeed
          await expect(disputeHandler.connect(rando).retractDispute(exchangeId))
            .to.emit(disputeHandler, "DisputeRetracted")
            .withArgs(exchangeId, await rando.getAddress());
        });

        context("After escalte dispute actions", function () {
          beforeEach(async function () {
            const buyerEscalationDepositNative = applyPercentage(
              disputeResolverFeeNative,
              buyerEscalationDepositPercentage
            );

            // Escalate the dispute
            await disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDepositNative });

            disputeResolver.assistant = await rando.getAddress();
            expect(disputeResolver.isValid()).is.true;

            // Update the dispute resolver assistant
            await accountHandler.connect(adminDR).updateDisputeResolver(disputeResolver);
            await accountHandler
              .connect(rando)
              .optInToDisputeResolverUpdate(disputeResolver.id, [DisputeResolverUpdateFields.Assistant]);
          });

          it("Dispute resolver should be able to decide dispute after change the assistant address", async function () {
            const buyerPercent = "1234";

            // Attempt to decide a dispute with old dispute resolver assistant, should fail
            await expect(
              disputeHandler.connect(assistantDR).decideDispute(exchangeId, buyerPercent)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_DISPUTE_RESOLVER_ASSISTANT);

            // Attempt to decide a dispute with new dispute resolver assistant, should fail
            await expect(disputeHandler.connect(rando).decideDispute(exchangeId, buyerPercent))
              .to.emit(disputeHandler, "DisputeDecided")
              .withArgs(exchangeId, buyerPercent, await rando.getAddress());
          });

          it("Dispute resolver should be able to refuse to decide a dispute after change the assistant address", async function () {
            // Attempt to refuse to decide a dispute with old dispute resolver assistant, should fail
            await expect(
              disputeHandler.connect(assistantDR).refuseEscalatedDispute(exchangeId)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_DISPUTE_RESOLVER_ASSISTANT);

            // Attempt to refuse a dispute with new dispute resolver assistant, should fail
            await expect(disputeHandler.connect(rando).refuseEscalatedDispute(exchangeId))
              .to.emit(disputeHandler, "EscalatedDisputeRefused")
              .withArgs(exchangeId, await rando.getAddress());
          });
        });
      });
    });
  });
});
