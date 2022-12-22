const hre = require("hardhat");
const ethers = hre.ethers;
const { assert, expect } = require("chai");
const { mockOffer, mockVoucher, mockExchange } = require("../util/mock");
const { getEvent, calculateVoucherExpiry } = require("../util/utils.js");
const Exchange = require("../../scripts/domain/Exchange");
const Voucher = require("../../scripts/domain/Voucher");
const { populateProtocolContract, getProtocolContractState } = require("../util/upgrade");

// Returns function with test that can be reused in every upgrade
function getGenericContext(
  deployer,
  protocolDiamondAddress,
  protocolContracts,
  mockContracts,
  protocolContractState,
  preUpgradeEntities,
  snapshot
) {
  let postUpgradeEntities;
  let exchangeHandler, offerHandler, fundsHandler, disputeHandler;
  let mockToken;

  ({ exchangeHandler, offerHandler, fundsHandler, disputeHandler } = protocolContracts);
  ({ mockToken } = mockContracts);

  const genericContextFunction = async function () {
    afterEach(async function () {
      // Revert to state right after the upgrade.
      // This is used so the lengthly setup (deploy+upgrade) is done only once.
      await ethers.provider.send("evm_revert", [snapshot]);
      snapshot = await ethers.provider.send("evm_snapshot", []);
    });

    // Protocol state
    context("📋 Right After upgrade", async function () {
      it("State is not affected directly after the update", async function () {
        // Get protocol state after the upgrade
        const protocolContractStateAfterUpgrade = await getProtocolContractState(
          protocolDiamondAddress,
          protocolContracts,
          mockContracts,
          preUpgradeEntities
        );

        // State before and after should be equal
        assert.deepEqual(protocolContractState, protocolContractStateAfterUpgrade, "state mismatch after upgrade");
      });
    });

    // Create new protocol entities. Existing data should not be affected
    context("📋 New data after the upgrade do not corrupt the data from before the upgrade", async function () {
      it("State is not affected", async function () {
        postUpgradeEntities = await populateProtocolContract(
          deployer,
          protocolDiamondAddress,
          protocolContracts,
          mockContracts
        );

        // Get protocol state after the upgrade
        // First get the data that should be in location of old data
        const protocolContractStateAfterUpgradeAndActions = await getProtocolContractState(
          protocolDiamondAddress,
          protocolContracts,
          mockContracts,
          preUpgradeEntities
        );

        // Counters are the only values that should be changed
        // We check that the number increased for expected amount
        // This also confirms that entities were actually created
        const accountCount =
          postUpgradeEntities.sellers.length +
          postUpgradeEntities.DRs.length +
          postUpgradeEntities.agents.length +
          postUpgradeEntities.buyers.length;
        assert.equal(
          protocolContractStateAfterUpgradeAndActions.accountContractState.nextAccountId.toNumber(),
          protocolContractState.accountContractState.nextAccountId.add(accountCount).toNumber(),
          "nextAccountId mismatch"
        );
        assert.equal(
          protocolContractStateAfterUpgradeAndActions.exchangeContractState.nextExchangeId.toNumber(),
          protocolContractState.exchangeContractState.nextExchangeId
            .add(postUpgradeEntities.exchanges.length)
            .toNumber(),
          "nextExchangeId mismatch"
        );
        assert.equal(
          protocolContractStateAfterUpgradeAndActions.groupContractState.nextGroupId.toNumber(),
          protocolContractState.groupContractState.nextGroupId.add(postUpgradeEntities.groups.length).toNumber(),
          "nextGroupId mismatch"
        );
        assert.equal(
          protocolContractStateAfterUpgradeAndActions.offerContractState.nextOfferId.toNumber(),
          protocolContractState.offerContractState.nextOfferId.add(postUpgradeEntities.offers.length).toNumber(),
          "nextOfferId mismatch"
        );
        assert.equal(
          protocolContractStateAfterUpgradeAndActions.twinContractState.nextTwinId.toNumber(),
          protocolContractState.twinContractState.nextTwinId.add(postUpgradeEntities.twins.length).toNumber(),
          "nextTwinId mismatch"
        );
        assert.equal(
          protocolContractStateAfterUpgradeAndActions.bundleContractState.nextBundleId.toNumber(),
          protocolContractState.bundleContractState.nextBundleId.add(postUpgradeEntities.bundles.length).toNumber()
        );

        // State before and after should be equal
        // Remove nextXXid before comparing. Their correct value is verified already
        delete protocolContractStateAfterUpgradeAndActions.accountContractState.nextAccountId;
        delete protocolContractStateAfterUpgradeAndActions.exchangeContractState.nextExchangeId;
        delete protocolContractStateAfterUpgradeAndActions.groupContractState.nextGroupId;
        delete protocolContractStateAfterUpgradeAndActions.offerContractState.nextOfferId;
        delete protocolContractStateAfterUpgradeAndActions.twinContractState.nextTwinId;
        delete protocolContractStateAfterUpgradeAndActions.bundleContractState.nextBundleId;
        delete protocolContractState.accountContractState.nextAccountId;
        delete protocolContractState.exchangeContractState.nextExchangeId;
        delete protocolContractState.groupContractState.nextGroupId;
        delete protocolContractState.offerContractState.nextOfferId;
        delete protocolContractState.twinContractState.nextTwinId;
        delete protocolContractState.bundleContractState.nextBundleId;
        assert.deepEqual(
          protocolContractState,
          protocolContractStateAfterUpgradeAndActions,
          "state mismatch after upgrade"
        );
      });
    });

    // Test that offers and exchanges from before the upgrade can normally be used
    // Check that correct events are emitted. State is not checked since units and integration test should make sure that event and state are consistent
    context("📋 Interactions after the upgrade still work", async function () {
      it("Commit to old offers", async function () {
        const { offer, offerDates, offerDurations } = preUpgradeEntities.offers[1]; // pick some random offer
        const offerPrice = offer.price;
        const buyer = preUpgradeEntities.buyers[1];
        let msgValue;
        if (offer.exchangeToken == ethers.constants.AddressZero) {
          msgValue = offerPrice;
        } else {
          // approve token transfer
          msgValue = 0;
          await mockToken.connect(buyer.wallet).approve(protocolDiamondAddress, offerPrice);
          await mockToken.mint(buyer.wallet.address, offerPrice);
        }

        // Commit to offer
        const exchangeId = await exchangeHandler.getNextExchangeId();
        const tx = await exchangeHandler
          .connect(buyer.wallet)
          .commitToOffer(buyer.wallet.address, offer.id, { value: msgValue });
        const txReceipt = await tx.wait();
        const event = getEvent(txReceipt, exchangeHandler, "BuyerCommitted");

        // Get the block timestamp of the confirmed tx
        const blockNumber = tx.blockNumber;
        const block = await ethers.provider.getBlock(blockNumber);

        // Set expected voucher values
        const voucher = mockVoucher({
          committedDate: block.timestamp.toString(),
          validUntilDate: calculateVoucherExpiry(block, offerDates.voucherRedeemableFrom, offerDurations.voucherValid),
          redeemedDate: "0",
        });

        // Set expected exchange values
        const exchange = mockExchange({
          id: exchangeId.toString(),
          offerId: offer.id,
          buyerId: buyer.buyer.id,
          finalizedDate: "0",
        });

        // Examine event
        assert.equal(event.exchangeId.toString(), exchange.id, "Exchange id is incorrect");
        assert.equal(event.offerId.toString(), offer.id, "Offer id is incorrect");
        assert.equal(event.buyerId.toString(), buyer.buyer.id, "Buyer id is incorrect");

        // Examine the exchange struct
        assert.equal(
          Exchange.fromStruct(event.exchange).toString(),
          exchange.toString(),
          "Exchange struct is incorrect"
        );

        // Examine the voucher struct
        assert.equal(Voucher.fromStruct(event.voucher).toString(), voucher.toString(), "Voucher struct is incorrect");
      });

      it("Redeem old voucher", async function () {
        const exchange = preUpgradeEntities.exchanges[0]; // some exchange that wasn't redeemed/revoked/canceled yet
        const buyerWallet = preUpgradeEntities.buyers[exchange.buyerIndex].wallet;
        await expect(exchangeHandler.connect(buyerWallet).redeemVoucher(exchange.exchangeId))
          .to.emit(exchangeHandler, "VoucherRedeemed")
          .withArgs(exchange.offerId, exchange.exchangeId, buyerWallet.address);
      });

      it("Cancel old voucher", async function () {
        const exchange = preUpgradeEntities.exchanges[0]; // some exchange that wasn't redeemed/revoked/canceled yet
        const buyerWallet = preUpgradeEntities.buyers[exchange.buyerIndex].wallet;
        await expect(exchangeHandler.connect(buyerWallet).cancelVoucher(exchange.exchangeId))
          .to.emit(exchangeHandler, "VoucherCanceled")
          .withArgs(exchange.offerId, exchange.exchangeId, buyerWallet.address);
      });

      it("Revoke old voucher", async function () {
        const exchange = preUpgradeEntities.exchanges[0]; // some exchange that wasn't redeemed/revoked/canceled yet
        const offer = preUpgradeEntities.offers.find((o) => o.offer.id == exchange.offerId);
        const seller = preUpgradeEntities.sellers.find((s) => s.seller.id == offer.offer.sellerId);
        await expect(exchangeHandler.connect(seller.wallet).revokeVoucher(exchange.exchangeId))
          .to.emit(exchangeHandler, "VoucherRevoked")
          .withArgs(exchange.offerId, exchange.exchangeId, seller.wallet.address);
      });

      it("Escalate old dispute", async function () {
        const exchange = preUpgradeEntities.exchanges[5]; // exchange for which dispute was raised
        const buyerWallet = preUpgradeEntities.buyers[exchange.buyerIndex].wallet;
        const offer = preUpgradeEntities.offers.find((o) => o.offer.id == exchange.offerId);
        await expect(disputeHandler.connect(buyerWallet).escalateDispute(exchange.exchangeId))
          .to.emit(disputeHandler, "DisputeEscalated")
          .withArgs(exchange.exchangeId, offer.disputeResolverId, buyerWallet.address);
      });

      it("Old buyer commits to new offer", async function () {
        const buyer = preUpgradeEntities.buyers[2];
        const offerId = await offerHandler.getNextOfferId();
        const exchangeId = await exchangeHandler.getNextExchangeId();

        // Create some new offer
        const { offer, offerDates, offerDurations } = await mockOffer();
        offer.id = offerId.toString();
        const disputeResolverId = preUpgradeEntities.DRs[0].disputeResolver.id;
        const agentId = preUpgradeEntities.agents[0].agent.id;
        const seller = preUpgradeEntities.sellers[2];
        await offerHandler
          .connect(seller.wallet)
          .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);
        await fundsHandler
          .connect(seller.wallet)
          .depositFunds(seller.seller.id, offer.exchangeToken, offer.sellerDeposit, {
            value: offer.sellerDeposit,
          });

        // Commit to offer
        const offerPrice = offer.price;
        const tx = await exchangeHandler
          .connect(buyer.wallet)
          .commitToOffer(buyer.wallet.address, offer.id, { value: offerPrice });
        const txReceipt = await tx.wait();
        const event = getEvent(txReceipt, exchangeHandler, "BuyerCommitted");

        // Get the block timestamp of the confirmed tx
        const blockNumber = tx.blockNumber;
        const block = await ethers.provider.getBlock(blockNumber);

        // Set expected voucher values
        const voucher = mockVoucher({
          committedDate: block.timestamp.toString(),
          validUntilDate: calculateVoucherExpiry(block, offerDates.voucherRedeemableFrom, offerDurations.voucherValid),
          redeemedDate: "0",
        });

        // Set expected exchange values
        const exchange = mockExchange({
          id: exchangeId.toString(),
          offerId: offer.id,
          buyerId: buyer.buyer.id,
          finalizedDate: "0",
        });

        // Examine event
        assert.equal(event.exchangeId.toString(), exchange.id, "Exchange id is incorrect");
        assert.equal(event.offerId.toString(), offer.id, "Offer id is incorrect");
        assert.equal(event.buyerId.toString(), buyer.buyer.id, "Buyer id is incorrect");

        // Examine the exchange struct
        assert.equal(
          Exchange.fromStruct(event.exchange).toString(),
          exchange.toString(),
          "Exchange struct is incorrect"
        );

        // Examine the voucher struct
        assert.equal(Voucher.fromStruct(event.voucher).toString(), voucher.toString(), "Voucher struct is incorrect");
      });

      it("Void old offer", async function () {
        const seller = preUpgradeEntities.sellers[0];
        const offerId = seller.offerIds[0];

        await expect(offerHandler.connect(seller.wallet).voidOffer(offerId))
          .to.emit(offerHandler, "OfferVoided")
          .withArgs(offerId, seller.seller.id, seller.wallet.address);
      });
    });
  };
  return genericContextFunction;
}

exports.getGenericContext = getGenericContext;
