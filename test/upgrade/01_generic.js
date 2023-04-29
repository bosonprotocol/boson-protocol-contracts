const shell = require("shelljs");
const hre = require("hardhat");
const ethers = hre.ethers;
const { assert, expect } = require("chai");
const { mockOffer, mockVoucher, mockExchange } = require("../util/mock");
const { getEvent, calculateVoucherExpiry, getSnapshot, revertToSnapshot } = require("../util/utils.js");
const Exchange = require("../../scripts/domain/Exchange");
const Voucher = require("../../scripts/domain/Voucher");
const { populateProtocolContract, getProtocolContractState, getCurrentVersion } = require("../util/upgrade");

// Returns function with test that can be reused in every upgrade
function getGenericContext(
  deployer,
  protocolDiamondAddress,
  contractsBefore,
  contractsAfter,
  mockContracts,
  protocolContractState,
  preUpgradeEntities,
  snapshot,
  newVersion
) {
  let postUpgradeEntities;
  let { exchangeHandler, offerHandler, fundsHandler, disputeHandler } = contractsBefore;
  let { mockToken } = mockContracts;

  const genericContextFunction = async function () {
    afterEach(async function () {
      // Revert to state right after the upgrade.
      // This is used so the lengthly setup (deploy+upgrade) is done only once.
      await revertToSnapshot(snapshot);
      snapshot = await getSnapshot();
    });

    after(async function () {
      // revert to latest state of contracts
      shell.exec(`rm -rf contracts scripts`);
      shell.exec(`git checkout HEAD contracts scripts`);
      shell.exec(`git reset HEAD contracts scripts`);
    });

    // Version was introduced to protocol status on v2.2.0
    if (newVersion != "v2.1.0") {
      // To this test pass package.json version must be set
      it(`Protocol status version is updated to ${newVersion}`, async function () {
        const version = await contractsAfter.protocolInitializationHandler.getVersion();

        // Slice because of unicode escape notation
        expect(version.slice(0, 5)).to.equal(newVersion);
      });
    }

    // Protocol state
    context("📋 Right After upgrade", async function () {
      it("State is not affected directly after the update", async function () {
        // Get protocol state after the upgrade
        let protocolContractStateAfterUpgrade = await getProtocolContractState(
          protocolDiamondAddress,
          contractsAfter,
          mockContracts,
          preUpgradeEntities
        );

        if (newVersion == "2.2.0") {
          // Meta transactions private state was changed on v2.2.0 and should be tested separately
          // We need to remove the old state from the protocol state
          delete protocolContractStateAfterUpgrade.metaTxPrivateContractState;
          delete protocolContractState.metaTxPrivateContractState;

          // Operator has changed to assistant so we need to test separately
          delete protocolContractState.accountContractState.DRsState;
          delete protocolContractStateAfterUpgrade.accountContractState.DRsState;
          delete protocolContractState.accountContractState.sellerState;
          delete protocolContractStateAfterUpgrade.accountContractState.sellerState;
          delete protocolContractState.accountContractState.sellerByAddressState;
          delete protocolContractStateAfterUpgrade.accountContractState.sellerByAddressState;
          delete protocolContractState.accountContractState.sellerByAuthTokenState;
          delete protocolContractStateAfterUpgrade.accountContractState.sellerByAuthTokenState;
        }

        assert.deepEqual(protocolContractState, protocolContractStateAfterUpgrade);
      });
    });

    // Create new protocol entities. Existing data should not be affected
    context("📋 New data after the upgrade do not corrupt the data from before the upgrade", async function () {
      it.skip("State is not affected", async function () {
        postUpgradeEntities = await populateProtocolContract(
          deployer,
          protocolDiamondAddress,
          contractsAfter,
          mockContracts
        );

        // Get protocol state after the upgrade
        // First get the data that should be in location of old data
        const protocolContractStateAfterUpgradeAndActions = await getProtocolContractState(
          protocolDiamondAddress,
          contractsAfter,
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
          protocolContractStateAfterUpgradeAndActions.accountContractState.nextAccountId,
          Number(protocolContractState.accountContractState.nextAccountId) + accountCount,
          "nextAccountId mismatch"
        );
        assert.equal(
          protocolContractStateAfterUpgradeAndActions.exchangeContractState.nextExchangeId,
          Number(protocolContractState.exchangeContractState.nextExchangeId) + postUpgradeEntities.exchanges.length,
          "nextExchangeId mismatch"
        );
        assert.equal(
          protocolContractStateAfterUpgradeAndActions.groupContractState.nextGroupId,
          Number(protocolContractState.groupContractState.nextGroupId) + postUpgradeEntities.groups.length,
          "nextGroupId mismatch"
        );
        assert.equal(
          protocolContractStateAfterUpgradeAndActions.offerContractState.nextOfferId,
          Number(protocolContractState.offerContractState.nextOfferId) + postUpgradeEntities.offers.length,
          "nextOfferId mismatch"
        );
        assert.equal(
          protocolContractStateAfterUpgradeAndActions.twinContractState.nextTwinId,
          Number(protocolContractState.twinContractState.nextTwinId) + postUpgradeEntities.twins.length,
          "nextTwinId mismatch"
        );
        assert.equal(
          protocolContractStateAfterUpgradeAndActions.bundleContractState.nextBundleId,
          Number(protocolContractState.bundleContractState.nextBundleId) + postUpgradeEntities.bundles.length
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

        if (newVersion == "v2.2.0") {
          // Meta transactions private state was changed on v2.2.0 and should be tested separately
          // We need to remove the old state from the protocol state
          delete protocolContractStateAfterUpgradeAndActions.metaTxPrivateContractState;
          delete protocolContractState.metaTxPrivateContractState;

          // Operator has changed to assistant so we need to test separately
          delete protocolContractState.accountContractState.DRsState;
          delete protocolContractStateAfterUpgradeAndActions.accountContractState.DRsState;
          delete protocolContractState.accountContractState.sellerState;
          delete protocolContractStateAfterUpgradeAndActions.accountContractState.sellerState;
          delete protocolContractState.accountContractState.sellerByAddressState;
          delete protocolContractStateAfterUpgradeAndActions.accountContractState.sellerByAddressState;
          delete protocolContractState.accountContractState.sellerByAuthTokenState;
          delete protocolContractStateAfterUpgradeAndActions.accountContractState.sellerByAuthTokenState;
        }

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
      this.timeout(10000000);
      it.skip("Commit to old offers", async function () {
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

      it.skip("Redeem old voucher", async function () {
        const exchange = preUpgradeEntities.exchanges[0]; // some exchange that wasn't redeemed/revoked/canceled yet
        const buyerWallet = preUpgradeEntities.buyers[exchange.buyerIndex].wallet;
        await expect(exchangeHandler.connect(buyerWallet).redeemVoucher(exchange.exchangeId))
          .to.emit(exchangeHandler, "VoucherRedeemed")
          .withArgs(exchange.offerId, exchange.exchangeId, buyerWallet.address);
      });

      it.skip("Cancel old voucher", async function () {
        const exchange = preUpgradeEntities.exchanges[0]; // some exchange that wasn't redeemed/revoked/canceled yet
        const buyerWallet = preUpgradeEntities.buyers[exchange.buyerIndex].wallet;
        await expect(exchangeHandler.connect(buyerWallet).cancelVoucher(exchange.exchangeId))
          .to.emit(exchangeHandler, "VoucherCanceled")
          .withArgs(exchange.offerId, exchange.exchangeId, buyerWallet.address);
      });

      it.skip("Revoke old voucher", async function () {
        const exchange = preUpgradeEntities.exchanges[0]; // some exchange that wasn't redeemed/revoked/canceled yet
        const offer = preUpgradeEntities.offers.find((o) => o.offer.id == exchange.offerId);
        const seller = preUpgradeEntities.sellers.find((s) => s.seller.id == offer.offer.sellerId);
        await expect(exchangeHandler.connect(seller.wallet).revokeVoucher(exchange.exchangeId))
          .to.emit(exchangeHandler, "VoucherRevoked")
          .withArgs(exchange.offerId, exchange.exchangeId, seller.wallet.address);
      });

      it.skip("Escalate old dispute", async function () {
        const exchange = preUpgradeEntities.exchanges[5 - 1]; // exchange for which dispute was raised

        const buyerWallet = preUpgradeEntities.buyers[exchange.buyerIndex].wallet;
        const offer = preUpgradeEntities.offers.find((o) => o.offer.id == exchange.offerId);
        await expect(disputeHandler.connect(buyerWallet).escalateDispute(exchange.exchangeId))
          .to.emit(disputeHandler, "DisputeEscalated")
          .withArgs(exchange.exchangeId, offer.disputeResolverId, buyerWallet.address);
      });

      it.skip("Old buyer commits to new offer", async function () {
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

      it.skip("Void old offer", async function () {
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
