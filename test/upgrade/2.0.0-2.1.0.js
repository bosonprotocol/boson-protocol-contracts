const shell = require("shelljs");
const hre = require("hardhat");
const ethers = hre.ethers;
const { assert, expect } = require("chai");
const Seller = require("../../scripts/domain/Seller");
const AuthToken = require("../../scripts/domain/AuthToken");
const SellerUpdateFields = require("../../scripts/domain/SellerUpdateFields");
const DisputeResolverUpdateFields = require("../../scripts/domain/DisputeResolverUpdateFields");
const DisputeResolver = require("../../scripts/domain/DisputeResolver");
const { DisputeResolverFeeList } = require("../../scripts/domain/DisputeResolverFee");
const { mockOffer, mockAuthToken, mockVoucher, mockExchange } = require("../util/mock");
const { getEvent, calculateVoucherExpiry } = require("../util/utils.js");
const Exchange = require("../../scripts/domain/Exchange");
const Voucher = require("../../scripts/domain/Voucher");
const { deploySuite, upgradeSuite, populateProtocolContract, getProtocolContractState } = require("../util/upgrade");

const oldVersion = "v2.0.0";
const newVersion = "v2.1.0";

/**
 *  Upgrade test case - After upgrade from 2.0.0 to 2.1.0 everything is still operational
 */
describe("[@skip-on-coverage] After facet upgrade, everything is still operational", function () {
  // Common vars
  let deployer, rando, admin, operator, clerk, treasury;
  let accountHandler, exchangeHandler, offerHandler, fundsHandler, oldHandlers;
  let ERC165Facet;
  let mockToken;
  let snapshot;
  let protocolDiamondAddress, protocolContracts, mockContracts;

  // reference protocol state
  let protocolContractState;
  let preUpgradeEntities, postUpgradeEntities;

  before(async function () {
    // Make accounts available
    [deployer, rando, admin, operator, clerk, treasury] = await ethers.getSigners();

    ({ protocolDiamondAddress, protocolContracts, mockContracts } = await deploySuite(deployer, oldVersion));

    ({ accountHandler, exchangeHandler, offerHandler, fundsHandler, ERC165Facet } = protocolContracts);

    ({ mockToken } = mockContracts);

    // Populate protocol with data
    preUpgradeEntities = await populateProtocolContract(
      deployer,
      protocolDiamondAddress,
      protocolContracts,
      mockContracts
    );

    // Get current protocol state, which serves as the reference
    // We assume that this state is a true one, relying on our unit and integration tests
    protocolContractState = await getProtocolContractState(
      protocolDiamondAddress,
      protocolContracts,
      mockContracts,
      preUpgradeEntities
    );

    // Upgrade protocol
    oldHandlers = { accountHandler: accountHandler }; // store to test old events
    ({ accountHandler, ERC165Facet } = await upgradeSuite(newVersion, protocolDiamondAddress, {
      accountHandler: "IBosonAccountHandler",
      ERC165Facet: "ERC165Facet",
    }));
    protocolContracts.accountHandler = accountHandler;

    snapshot = await ethers.provider.send("evm_snapshot", []);
  });

  afterEach(async function () {
    // revert to state right after the upgrade
    // this is used so the lengthly setup (deploy+upgrade) is done only once
    await ethers.provider.send("evm_revert", [snapshot]);
    snapshot = await ethers.provider.send("evm_snapshot", []);
  });

  after(async function () {
    // revert to latest state of contracts
    shell.exec(`git checkout HEAD contracts`);
  });

  // Exchange methods
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
      // First get the data tha should be in location of old data
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
        protocolContractState.exchangeContractState.nextExchangeId.add(postUpgradeEntities.exchanges.length).toNumber(),
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
      // remove nextXXid before comparing. Their correct value is verified already
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
      assert.equal(Exchange.fromStruct(event.exchange).toString(), exchange.toString(), "Exchange struct is incorrect");

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
      const buyerWallet = buyers[0][exchange.buyerIndex].wallet;
      const offer = offers[0].find((o) => o.offer.id == exchange.offerId);
      await expect(disputeHandler.connect(buyerWallet).escalateDispute(exchange.exchangeId))
        .to.emit(disputeHandler, "DisputeEscalated")
        .withArgs(exchange.exchangeId, offer.disputeResolverId, buyerWallet.address);
    });

    it("Old buyer commits to new offer", async function () {
      const buyer = preUpgradeEntities.buyers[2];
      const offerId = await offerHandler.getNextOfferId();
      const exchangeId = await exchangeHandler.getNextExchangeId();

      // create some new offer
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
      assert.equal(Exchange.fromStruct(event.exchange).toString(), exchange.toString(), "Exchange struct is incorrect");

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

  // Test actions that worked in previous version, but should not work anymore, or work differently
  // Test methods that were added to see that upgrade was succesful
  context("📋 Breaking changes and new methods", async function () {
    context("Breaking changes", async function () {
      it("Seller addresses are not updated in one step, expect for the treasury", async function () {
        const oldSeller = preUpgradeEntities.sellers[3];

        const seller = oldSeller.seller.clone();

        seller.admin = admin.address;
        seller.operator = operator.address;
        seller.clerk = clerk.address;
        seller.treasury = treasury.address;

        const authToken = mockAuthToken();

        // Update seller
        await expect(accountHandler.connect(oldSeller.wallet).updateSeller(seller, authToken)).to.not.emit(
          oldHandlers.accountHandler,
          "SellerUpdated"
        );

        // Querying the seller id should return the old seller
        const [, sellerStruct, emptyAuthTokenStruct] = await accountHandler
          .connect(rando)
          .getSeller(oldSeller.seller.id);

        // Parse into entity
        const returnedSeller = Seller.fromStruct(sellerStruct);
        const returnedAuthToken = AuthToken.fromStruct(emptyAuthTokenStruct);

        // Returned values should match the input in createSeller, excpt the treasury, which is updated in one step
        const expectedSeller = oldSeller.seller.clone();
        expectedSeller.treasury = seller.treasury;
        for (const [key, value] of Object.entries(expectedSeller)) {
          assert.equal(JSON.stringify(returnedSeller[key]), JSON.stringify(value), `${key} mismatch`);
        }

        // Returned auth token values should match the input in createSeller
        for (const [key, value] of Object.entries(oldSeller.authToken)) {
          assert.equal(JSON.stringify(returnedAuthToken[key]), JSON.stringify(value), `${key} mismatch`);
        }
      });

      it("Dispute resolver is not updated in one step", async function () {
        const oldDisputeResolver = preUpgradeEntities.DRs[2];

        const disputeResolver = oldDisputeResolver.disputeResolver.clone();

        // new dispute resolver values
        disputeResolver.escalationResponsePeriod = Number(
          Number(disputeResolver.escalationResponsePeriod) - 100
        ).toString();
        disputeResolver.operator = operator.address;
        disputeResolver.admin = admin.address;
        disputeResolver.clerk = clerk.address;
        disputeResolver.treasury = treasury.address;
        disputeResolver.metadataUri = "https://ipfs.io/ipfs/updatedUri";
        disputeResolver.active = false;

        // Update dispute resolver
        await expect(
          accountHandler.connect(oldDisputeResolver.wallet).updateDisputeResolver(disputeResolver)
        ).to.not.emit(oldHandlers.accountHandler, "DisputeResolverUpdated");

        // Querying the dispute resolver id should return the old dispute resolver
        // Get the dispute resolver data as structs
        const [, disputeResolverStruct, disputeResolverFeeListStruct, returnedSellerAllowList] = await accountHandler
          .connect(rando)
          .getDisputeResolver(disputeResolver.id);

        // Parse into entity
        const returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);
        const returnedDisputeResolverFeeList = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct);

        // Returned values should match the expectedDisputeResolver
        const expectedDisputeResolver = oldDisputeResolver.disputeResolver.clone();
        expectedDisputeResolver.escalationResponsePeriod = disputeResolver.escalationResponsePeriod;
        expectedDisputeResolver.treasury = disputeResolver.treasury;
        expectedDisputeResolver.metadataUri = disputeResolver.metadataUri;
        for (const [key, value] of Object.entries(expectedDisputeResolver)) {
          assert.equal(JSON.stringify(returnedDisputeResolver[key]), JSON.stringify(value), `${key} mismatch`);
        }

        assert.equal(
          returnedDisputeResolverFeeList.toString(),
          new DisputeResolverFeeList(oldDisputeResolver.disputeResolverFees).toString(),
          "Dispute Resolver Fee List is incorrect"
        );

        expect(returnedSellerAllowList.toString()).to.eql(
          oldDisputeResolver.sellerAllowList.toString(),
          "Allowed list wrong"
        );
      });
    });

    context("New methods", async function () {
      it("Supported interface can be added", async function () {
        const interfaceId = "0xaabbccdd";

        // Verify that interface does not exist yet
        let support = await ERC165Facet.supportsInterface(interfaceId);
        expect(support, "Interface should not be supported").is.false;

        // Add interface
        await ERC165Facet.connect(deployer).addSupportedInterface(interfaceId);

        // Verify it was added
        support = await ERC165Facet.supportsInterface(interfaceId);
        expect(support, "Interface should be supported").is.true;
      });

      it("Supported interface can be removed", async function () {
        const interfaceId = "0xddccbbaa";
        // Add interface
        await ERC165Facet.connect(deployer).addSupportedInterface(interfaceId);

        // Verify that interface exist
        let support = await ERC165Facet.supportsInterface(interfaceId);
        expect(support, "Interface should be supported").is.true;

        // Remove interface
        await ERC165Facet.connect(deployer).removeSupportedInterface(interfaceId);

        // Verify it was removed
        support = await ERC165Facet.supportsInterface(interfaceId);
        expect(support, "Interface should not be supported").is.false;
      });

      it("Seller can be updated in two steps", async function () {
        const oldSeller = preUpgradeEntities.sellers[3];

        const seller = oldSeller.seller.clone();
        seller.treasury = treasury.address;
        seller.admin = admin.address;
        seller.operator = operator.address;
        seller.clerk = clerk.address;

        const pendingSellerUpdate = seller.clone();
        pendingSellerUpdate.id = "0";
        pendingSellerUpdate.treasury = ethers.constants.AddressZero;
        pendingSellerUpdate.active = false;

        const expectedSeller = oldSeller.seller.clone();
        // Treasury is the only value that can be updated without address owner authorization
        expectedSeller.treasury = seller.treasury;

        const authToken = mockAuthToken();
        const pendingAuthToken = authToken.clone();
        const oldSellerAuthToken = oldSeller.authToken.toStruct();
        const pendingAuthTokenStruct = pendingAuthToken.toStruct();

        // Update seller
        let tx = await accountHandler.connect(oldSeller.wallet).updateSeller(seller, authToken);

        // Testing for the SellerUpdateApplied event
        await expect(tx)
          .to.emit(accountHandler, "SellerUpdateApplied")
          .withArgs(
            seller.id,
            expectedSeller.toStruct(),
            pendingSellerUpdate.toStruct(),
            oldSellerAuthToken,
            pendingAuthTokenStruct,
            oldSeller.wallet.address
          );

        // Testing for the SellerUpdatePending event
        await expect(tx)
          .to.emit(accountHandler, "SellerUpdatePending")
          .withArgs(seller.id, pendingSellerUpdate.toStruct(), pendingAuthTokenStruct, oldSeller.wallet.address);

        // Update seller operator
        tx = await accountHandler.connect(operator).optInToSellerUpdate(seller.id, [SellerUpdateFields.Operator]);

        pendingSellerUpdate.operator = ethers.constants.AddressZero;
        expectedSeller.operator = seller.operator;

        // Check operator update
        await expect(tx)
          .to.emit(accountHandler, "SellerUpdateApplied")
          .withArgs(
            seller.id,
            expectedSeller.toStruct(),
            pendingSellerUpdate.toStruct(),
            oldSellerAuthToken,
            pendingAuthTokenStruct,
            operator.address
          );

        // Update seller clerk
        tx = await accountHandler.connect(clerk).optInToSellerUpdate(seller.id, [SellerUpdateFields.Clerk]);

        pendingSellerUpdate.clerk = ethers.constants.AddressZero;
        expectedSeller.clerk = seller.clerk;

        // Check operator update
        await expect(tx)
          .to.emit(accountHandler, "SellerUpdateApplied")
          .withArgs(
            seller.id,
            expectedSeller.toStruct(),
            pendingSellerUpdate.toStruct(),
            oldSellerAuthToken,
            pendingAuthTokenStruct,
            clerk.address
          );

        // Update seller admin
        tx = await accountHandler.connect(admin).optInToSellerUpdate(seller.id, [SellerUpdateFields.Admin]);

        pendingSellerUpdate.admin = ethers.constants.AddressZero;
        expectedSeller.admin = seller.admin;

        // Check operator update
        await expect(tx)
          .to.emit(accountHandler, "SellerUpdateApplied")
          .withArgs(
            seller.id,
            expectedSeller.toStruct(),
            pendingSellerUpdate.toStruct(),
            authToken.toStruct(),
            pendingAuthTokenStruct,
            admin.address
          );
      });

      it("Dispute resolver can be updated in two steps", async function () {
        const oldDisputeResolver = preUpgradeEntities.DRs[1];

        const disputeResolver = oldDisputeResolver.disputeResolver.clone();

        // new dispute resolver values
        disputeResolver.escalationResponsePeriod = Number(
          Number(disputeResolver.escalationResponsePeriod) - 100
        ).toString();
        disputeResolver.operator = operator.address;
        disputeResolver.admin = admin.address;
        disputeResolver.clerk = clerk.address;
        disputeResolver.treasury = treasury.address;
        disputeResolver.metadataUri = "https://ipfs.io/ipfs/updatedUri";
        disputeResolver.active = false;

        const disputeResolverPendingUpdate = disputeResolver.clone();
        disputeResolverPendingUpdate.id = "0";
        disputeResolverPendingUpdate.escalationResponsePeriod = "0";
        disputeResolverPendingUpdate.metadataUri = "";
        disputeResolverPendingUpdate.treasury = ethers.constants.AddressZero;

        const expectedDisputeResolver = oldDisputeResolver.disputeResolver.clone();
        expectedDisputeResolver.escalationResponsePeriod = disputeResolver.escalationResponsePeriod;
        expectedDisputeResolver.treasury = disputeResolver.treasury;
        expectedDisputeResolver.metadataUri = disputeResolver.metadataUri;

        // Update dispute resolver
        await expect(accountHandler.connect(oldDisputeResolver.wallet).updateDisputeResolver(disputeResolver))
          .to.emit(accountHandler, "DisputeResolverUpdatePending")
          .withArgs(disputeResolver.id, disputeResolverPendingUpdate.toStruct(), oldDisputeResolver.wallet.address);

        // Approve operator update
        expectedDisputeResolver.operator = disputeResolver.operator;
        disputeResolverPendingUpdate.operator = ethers.constants.AddressZero;

        await expect(
          accountHandler
            .connect(operator)
            .optInToDisputeResolverUpdate(disputeResolver.id, [DisputeResolverUpdateFields.Operator])
        )
          .to.emit(accountHandler, "DisputeResolverUpdateApplied")
          .withArgs(
            disputeResolver.id,
            expectedDisputeResolver.toStruct(),
            disputeResolverPendingUpdate.toStruct(),
            operator.address
          );

        // Approve admin update
        expectedDisputeResolver.admin = disputeResolver.admin;
        disputeResolverPendingUpdate.admin = ethers.constants.AddressZero;

        await expect(
          accountHandler
            .connect(admin)
            .optInToDisputeResolverUpdate(disputeResolver.id, [DisputeResolverUpdateFields.Admin])
        )
          .to.emit(accountHandler, "DisputeResolverUpdateApplied")
          .withArgs(
            disputeResolver.id,
            expectedDisputeResolver.toStruct(),
            disputeResolverPendingUpdate.toStruct(),
            admin.address
          );

        // Approve clerk update
        expectedDisputeResolver.clerk = disputeResolver.clerk;
        disputeResolverPendingUpdate.clerk = ethers.constants.AddressZero;

        await expect(
          accountHandler
            .connect(clerk)
            .optInToDisputeResolverUpdate(disputeResolver.id, [DisputeResolverUpdateFields.Clerk])
        )
          .to.emit(accountHandler, "DisputeResolverUpdateApplied")
          .withArgs(
            disputeResolver.id,
            expectedDisputeResolver.toStruct(),
            disputeResolverPendingUpdate.toStruct(),
            clerk.address
          );
      });
    });
  });
});
