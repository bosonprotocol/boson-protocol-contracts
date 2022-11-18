const shell = require("shelljs");
const { getStorageAt } = require("@nomicfoundation/hardhat-network-helpers");
const hre = require("hardhat");
const ethers = hre.ethers;
const { keccak256 } = ethers.utils;
const { assert, expect } = require("chai");
const AuthToken = require("../../scripts/domain/AuthToken");
const AuthTokenType = require("../../scripts/domain/AuthTokenType");
const Bundle = require("../../scripts/domain/Bundle");
const Role = require("../../scripts/domain/Role");
const Group = require("../../scripts/domain/Group");
const VoucherInitValues = require("../../scripts/domain/VoucherInitValues");
const TokenType = require("../../scripts/domain/TokenType.js");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const SellerUpdateFields = require("../../scripts/domain/SellerUpdateFields");
const DisputeResolverUpdateFields = require("../../scripts/domain/DisputeResolverUpdateFields");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const {
  mockOffer,
  mockDisputeResolver,
  mockAuthToken,
  mockSeller,
  mockAgent,
  mockBuyer,
  mockCondition,
  mockTwin,
  mockVoucher,
  mockExchange,
} = require("../util/mock");
const { getEvent, calculateVoucherExpiry, setNextBlockTimestamp, paddingType, getMappinStoragePosition } = require("../util/utils.js");
const { oneMonth, oneDay } = require("../util/constants");
const { readContracts } = require("../../scripts/util/utils");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const Exchange = require("../../scripts/domain/Exchange");
const Voucher = require("../../scripts/domain/Voucher");

const oldVersion = "v2.0.0";
const newVersion = "v2.1.0";

/**
 *  Upgrade test case - After upgrade from 2.0.0 to 2.1.0 everything is still operational
 */
describe("[@skip-on-coverage] After facet upgrade, everything is still operational", function () {
  // Common vars
  let deployer, rando, admin, operator, clerk, treasury;
  let accessController,
    accountHandler,
    exchangeHandler,
    offerHandler,
    fundsHandler,
    disputeHandler,
    bundleHandler,
    groupHandler,
    twinHandler,
    configHandler;
  // orchestrationHandler, pauseHandler, metaTransactionsHandler,
  let mockToken, mockConditionalToken, mockTwinTokens, mockTwin20, mockTwin1155;
  let snapshot;
  let protocolDiamondAddress;
  let mockAuthERC721Contract;

  // variable to store entities during each "populateProtocolContract"
  // index 0 contains data before the upgrade, index 1 data after upgrade
  let DRs = [[], []];
  let sellers = [[], []];
  let buyers = [[], []];
  let agents = [[], []];
  let offers = [[], []];
  let groups = [[], []];
  let twins = [[], []];
  let exchanges = [[], []];
  let bundles = [[], []];
  let protocolContractState;

  before(async function () {
    // Make accounts available
    [deployer, rando, admin, operator, clerk, treasury] = await ethers.getSigners();

    // checkout old version
    console.log(`Checking out version ${oldVersion}`);
    shell.exec(`git checkout ${oldVersion} contracts`);

    // run deploy suite, which automatically compiles the contracts
    await hre.run("deploy-suite", { env: "upgrade-test" });

    // Read contract info from file
    const chainId = (await hre.ethers.provider.getNetwork()).chainId;
    const contractsFile = readContracts(chainId, "hardhat", "upgrade-test");

    // Get AccessController abstraction
    const accessControllerInfo = contractsFile.contracts.find((i) => i.name === "AccessController");
    accessController = await ethers.getContractAt("AccessController", accessControllerInfo.address);

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Get protocolDiamondAddress
    protocolDiamondAddress = contractsFile.contracts.find((i) => i.name === "ProtocolDiamond").address;

    // Grant PROTOCOL role to ProtocolDiamond address
    await accessController.grantRole(Role.PROTOCOL, protocolDiamondAddress);

    // Cast Diamond to interfaces
    accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamondAddress);
    bundleHandler = await ethers.getContractAt("IBosonBundleHandler", protocolDiamondAddress);
    disputeHandler = await ethers.getContractAt("IBosonDisputeHandler", protocolDiamondAddress);
    exchangeHandler = await ethers.getContractAt("IBosonExchangeHandler", protocolDiamondAddress);
    fundsHandler = await ethers.getContractAt("IBosonFundsHandler", protocolDiamondAddress);
    groupHandler = await ethers.getContractAt("IBosonGroupHandler", protocolDiamondAddress);
    offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamondAddress);
    // orchestrationHandler = await ethers.getContractAt("IBosonOrchestrationHandler", protocolDiamondAddress);
    twinHandler = await ethers.getContractAt("IBosonTwinHandler", protocolDiamondAddress);
    // pauseHandler = await ethers.getContractAt("IBosonPauseHandler", protocolDiamondAddress);
    // metaTransactionsHandler = await ethers.getContractAt("IBosonMetaTransactionsHandler", protocolDiamondAddress);
    configHandler = await ethers.getContractAt("IBosonConfigHandler", protocolDiamondAddress);

    // create mock token for auth
    [mockAuthERC721Contract] = await deployMockTokens(["Foreign721"]);
    configHandler.connect(deployer).setAuthTokenContract(AuthTokenType.Lens, mockAuthERC721Contract.address);

    // create mock token for offers
    let mockTwin721_1, mockTwin721_2;
    [mockToken, mockConditionalToken, mockTwin721_1, mockTwin721_2, mockTwin20, mockTwin1155] = await deployMockTokens([
      "Foreign20",
      "Foreign20",
      "Foreign721",
      "Foreign721",
      "Foreign20",
      "Foreign1155",
    ]);
    mockTwinTokens = [mockTwin721_1, mockTwin721_2];

    // Populate protocol with data
    await populateProtocolContract();

    // Get current protocol state, which serves as the reference
    // We assume that this state is a true one, relying on our unit and integration tests
    protocolContractState = await getProtocolContractState();

    // Upgrade protocol
    if (newVersion) {
      // checkout the new tag
      console.log(`Checking out version ${newVersion}`);
      shell.exec(`git checkout ${newVersion} contracts`);
    } else {
      // if tag was not created yet, use the latest code
      console.log(`Checking out latest code`);
      shell.exec(`git checkout HEAD contracts`);
    }

    // compile new contracts
    await hre.run("compile");
    await hre.run("upgrade-facets", { env: "upgrade-test" });

    // Cast to updated interface
    accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamondAddress);

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
      const protocolContractStateAfterUpgrade = await getProtocolContractState();

      // State before and after should be equal
      assert.deepEqual(protocolContractState, protocolContractStateAfterUpgrade, "state mismatch after upgrade");
    });
  });

  // Create new protocol entities. Existing data should not be affected
  context("📋 New data after the upgrade do not corrupt the data from before the upgrade", async function () {
    it("State is not affected", async function () {
      await populateProtocolContract(true);

      // Get protocol state after the upgrade
      // First get the data tha should be in location of old data
      const protocolContractStateAfterUpgradeAndActions = await getProtocolContractState(0);

      // Counters are the only values that should be changed
      // We check that the number increased for expected amount
      // This also confirms that entities were actually created
      const accountCount = sellers[1].length + DRs[1].length + agents[1].length + buyers[1].length;
      assert.equal(
        protocolContractStateAfterUpgradeAndActions.accountContractState.nextAccountId.toNumber(),
        protocolContractState.accountContractState.nextAccountId.add(accountCount).toNumber(),
        "nextAccountId mismatch"
      );
      assert.equal(
        protocolContractStateAfterUpgradeAndActions.exchangeContractState.nextExchangeId.toNumber(),
        protocolContractState.exchangeContractState.nextExchangeId.add(exchanges[1].length).toNumber(),
        "nextExchangeId mismatch"
      );
      assert.equal(
        protocolContractStateAfterUpgradeAndActions.groupContractState.nextGroupId.toNumber(),
        protocolContractState.groupContractState.nextGroupId.add(groups[1].length).toNumber(),
        "nextGroupId mismatch"
      );
      assert.equal(
        protocolContractStateAfterUpgradeAndActions.offerContractState.nextOfferId.toNumber(),
        protocolContractState.offerContractState.nextOfferId.add(offers[1].length).toNumber(),
        "nextOfferId mismatch"
      );
      assert.equal(
        protocolContractStateAfterUpgradeAndActions.twinContractState.nextTwinId.toNumber(),
        protocolContractState.twinContractState.nextTwinId.add(twins[1].length).toNumber(),
        "nextTwinId mismatch"
      );
      assert.equal(
        protocolContractStateAfterUpgradeAndActions.bundleContractState.nextBundleId.toNumber(),
        protocolContractState.bundleContractState.nextBundleId.add(bundles[1].length).toNumber()
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
      const offer = offers[0][1].offer; // pick some random offer
      const offerDates = offers[0][1].offerDates; // pick some random offer
      const offerDurations = offers[0][1].offerDurations; // pick some random offer
      const offerPrice = offer.price;
      const buyer = buyers[0][1];
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
      const exchange = exchanges[0][0]; // some exchange that wasn't redeemed/revoked/canceled yet
      const buyerWallet = buyers[0][exchange.buyerIndex].wallet;
      await expect(exchangeHandler.connect(buyerWallet).redeemVoucher(exchange.exchangeId))
        .to.emit(exchangeHandler, "VoucherRedeemed")
        .withArgs(exchange.offerId, exchange.exchangeId, buyerWallet.address);
    });

    it("Revoke old voucher", async function () {
      const exchange = exchanges[0][0]; // some exchange that wasn't redeemed/revoked/canceled yet
      const buyerWallet = buyers[0][exchange.buyerIndex].wallet;
      await expect(exchangeHandler.connect(buyerWallet).cancelVoucher(exchange.exchangeId))
        .to.emit(exchangeHandler, "VoucherCanceled")
        .withArgs(exchange.offerId, exchange.exchangeId, buyerWallet.address);
    });

    it("Cancel old voucher", async function () {
      const exchange = exchanges[0][0]; // some exchange that wasn't redeemed/revoked/canceled yet
      const offer = offers[0].find((o) => o.offer.id == exchange.offerId);
      const seller = sellers[0].find((s) => s.seller.id == offer.offer.sellerId);
      await expect(exchangeHandler.connect(seller.wallet).revokeVoucher(exchange.exchangeId))
        .to.emit(exchangeHandler, "VoucherRevoked")
        .withArgs(exchange.offerId, exchange.exchangeId, seller.wallet.address);
    });

    it("Old buyer commits to new offer", async function () {
      const buyer = buyers[0][2];
      const offerId = await offerHandler.getNextOfferId();
      const exchangeId = await exchangeHandler.getNextExchangeId();

      // create some new offer
      const { offer, offerDates, offerDurations } = await mockOffer();
      offer.id = offerId.toString();
      const disputeResolverId = DRs[0][0].disputeResolver.id;
      const agentId = agents[0][0].agent.id;
      await offerHandler
        .connect(sellers[0][2].wallet)
        .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);
      await fundsHandler
        .connect(sellers[0][2].wallet)
        .depositFunds(sellers[0][2].seller.id, offer.exchangeToken, offer.sellerDeposit, {
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

    it("Update old seller", async function () {
      const oldSeller = sellers[0][3];

      const seller = oldSeller.seller.clone();
      seller.treasury = treasury.address;
      // Treasury is the only values that can be update without address owner authorization
      let sellerStruct = seller.toStruct();

      seller.admin = admin.address;
      seller.operator = operator.address;
      seller.clerk = clerk.address;

      const pendingSellerUpdate = seller.clone();
      pendingSellerUpdate.id = "0";
      pendingSellerUpdate.treasury = ethers.constants.AddressZero;
      pendingSellerUpdate.active = false;
      let pendingSellerUpdateStruct = pendingSellerUpdate.toStruct();

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
          sellerStruct,
          pendingSellerUpdateStruct,
          oldSellerAuthToken,
          pendingAuthTokenStruct,
          oldSeller.wallet.address
        );

      // Testing for the SellerUpdatePending event
      await expect(tx)
        .to.emit(accountHandler, "SellerUpdatePending")
        .withArgs(seller.id, pendingSellerUpdateStruct, pendingAuthTokenStruct, oldSeller.wallet.address);

      // Update seller operator
      tx = await accountHandler.connect(operator).optInToSellerUpdate(seller.id, [SellerUpdateFields.Operator]);

      pendingSellerUpdate.operator = ethers.constants.AddressZero;
      pendingSellerUpdateStruct = pendingSellerUpdate.toStruct();
      seller.clerk = oldSeller.seller.clerk;
      seller.admin = oldSeller.seller.admin;
      sellerStruct = seller.toStruct();

      // Check operator update
      await expect(tx)
        .to.emit(accountHandler, "SellerUpdateApplied")
        .withArgs(
          seller.id,
          sellerStruct,
          pendingSellerUpdateStruct,
          oldSellerAuthToken,
          pendingAuthTokenStruct,
          operator.address
        );

      // Update seller clerk
      tx = await accountHandler.connect(clerk).optInToSellerUpdate(seller.id, [SellerUpdateFields.Clerk]);

      pendingSellerUpdate.clerk = ethers.constants.AddressZero;
      pendingSellerUpdateStruct = pendingSellerUpdate.toStruct();
      seller.clerk = clerk.address;
      seller.admin = oldSeller.seller.admin;
      sellerStruct = seller.toStruct();

      // Check operator update
      await expect(tx)
        .to.emit(accountHandler, "SellerUpdateApplied")
        .withArgs(
          seller.id,
          sellerStruct,
          pendingSellerUpdateStruct,
          oldSellerAuthToken,
          pendingAuthTokenStruct,
          clerk.address
        );

      // Update seller admin
      tx = await accountHandler.connect(admin).optInToSellerUpdate(seller.id, [SellerUpdateFields.Admin]);

      pendingSellerUpdate.admin = ethers.constants.AddressZero;
      pendingSellerUpdateStruct = pendingSellerUpdate.toStruct();
      seller.admin = admin.address;
      sellerStruct = seller.toStruct();

      // Check operator update
      await expect(tx)
        .to.emit(accountHandler, "SellerUpdateApplied")
        .withArgs(
          seller.id,
          sellerStruct,
          pendingSellerUpdateStruct,
          authToken.toStruct(),
          pendingAuthTokenStruct,
          admin.address
        );
    });

    it("Update old dispute resolver", async function () {
      const oldDisputeResolver = DRs[0][1];

      const disputeResolver = oldDisputeResolver.disputeResolver.clone();

      // new operator
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
      // expectedDisputeResolver.active = false;

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

    it("Void old offer", async function () {
      const seller = sellers[0][0];
      const offerId = seller.offerIds[0];

      await expect(offerHandler.connect(seller.wallet).voidOffer(offerId))
        .to.emit(offerHandler, "OfferVoided")
        .withArgs(offerId, seller.seller.id, seller.wallet.address);
    });
  });

  // Test actions that worked in previous version, but should not work anymore, or work differently
  context.skip("📋 Breaking changes", async function () {});

  // utility functions
  async function populateProtocolContract(afterUpgrade = false) {
    // populateProtocolContract can be called before and after update
    // using the same ids would results in clashes in come cases, so use offset to prevent that
    const versionIndex = afterUpgrade ? 1 : 0;
    let accountOffset, offerOffset, groupOffset, exchangeOffset, twinOffset, bundleOffset;
    accountOffset = offerOffset = groupOffset = exchangeOffset = twinOffset = bundleOffset = 0;
    if (afterUpgrade) {
      accountOffset = sellers[0].length + DRs[0].length + agents[0].length + buyers[0].length;
      offerOffset = offers[0].length;
      groupOffset = groups[0].length;
      exchangeOffset = exchanges[0].length;
      twinOffset = twins[0].length;
      bundleOffset = bundles[0].length;
    }

    const entity = {
      SELLER: 0,
      DR: 1,
      AGENT: 2,
      BUYER: 3,
    };

    const DRcount = 3;
    const agentCount = 2;
    const sellerCount = 5;
    const buyerCount = 5;
    const totalCount = DRcount + agentCount + sellerCount + buyerCount;
    const creationOrder = [
      entity.DR,
      entity.AGENT,
      entity.SELLER,
      entity.SELLER,
      entity.DR,
      entity.SELLER,
      entity.DR,
      entity.SELLER,
      entity.AGENT,
      entity.SELLER,
      entity.BUYER,
      entity.BUYER,
      entity.BUYER,
      entity.BUYER,
      entity.BUYER,
    ]; // maybe programatically set the random order, except for the buyers

    for (let i = 0; i < totalCount; i++) {
      const wallet = ethers.Wallet.createRandom();
      const connectedWallet = wallet.connect(ethers.provider);
      //Fund the new wallet
      let tx = {
        to: connectedWallet.address,
        // Convert currency unit from ether to wei
        value: ethers.utils.parseEther("10"),
      };
      await deployer.sendTransaction(tx);

      // create entities
      switch (creationOrder[i]) {
        case entity.DR: {
          const disputeResolver = mockDisputeResolver(wallet.address, wallet.address, wallet.address, wallet.address);
          const disputeResolverFees = [
            new DisputeResolverFee(ethers.constants.AddressZero, "Native", "0"),
            new DisputeResolverFee(mockToken.address, "MockToken", 0),
          ];
          const sellerAllowList = [];
          await accountHandler
            .connect(connectedWallet)
            .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
          DRs[versionIndex].push({ wallet: connectedWallet, disputeResolver, disputeResolverFees, sellerAllowList });

          //ADMIN role activates Dispute Resolver
          await accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id);
          break;
        }
        case entity.SELLER: {
          const seller = mockSeller(wallet.address, wallet.address, wallet.address, wallet.address);
          const id = i + accountOffset;
          let authToken;
          // randomly decide if auth token is used or not
          if (Math.random() > 0.5) {
            // no auth token
            authToken = mockAuthToken();
          } else {
            // use auth token
            seller.admin = ethers.constants.AddressZero;
            await mockAuthERC721Contract.connect(connectedWallet).mint(101 * id, 1);
            authToken = new AuthToken(`${101 * id}`, AuthTokenType.Lens);
          }
          // set unique new voucherInitValues
          const voucherInitValues = new VoucherInitValues(`http://seller${id}.com/uri`, id * 10);
          await accountHandler.connect(connectedWallet).createSeller(seller, authToken, voucherInitValues);
          sellers[versionIndex].push({ wallet: connectedWallet, seller, authToken, voucherInitValues, offerIds: [] });

          // mint mock token to sellers just in case they need them
          await mockToken.mint(connectedWallet.address, "10000000000");
          await mockToken.connect(connectedWallet).approve(protocolDiamondAddress, "10000000000");
          break;
        }
        case entity.AGENT: {
          const agent = mockAgent(wallet.address);
          await accountHandler.connect(connectedWallet).createAgent(agent);
          agents[versionIndex].push({ wallet: connectedWallet, agent });
          break;
        }
        case entity.BUYER: {
          // no need to explicitly create buyer, since it's done automatically during commitToOffer
          const buyer = mockBuyer(wallet.address);
          buyers[versionIndex].push({ wallet: connectedWallet, buyer });

          // mint them conditional token in case they need it
          await mockConditionalToken.mint(wallet.address, "10");
          break;
        }
      }
    }

    // Make explicit allowed sellers list for some DRs
    const sellerIds = sellers[versionIndex].map((s) => s.seller.id);
    for (let i = 0; i < DRs[versionIndex].length; i = i + 2) {
      const DR = DRs[versionIndex][i];
      DR.sellerAllowList = sellerIds;
      await accountHandler.connect(DR.wallet).addSellersToAllowList(DR.disputeResolver.id, sellerIds);
    }

    // create offers - first seller has 5 offers, second 4, third 3 etc
    let offerId = offerOffset;
    for (let i = 0; i < sellers[versionIndex].length; i++) {
      for (let j = i; j >= 0; j--) {
        // Mock offer, offerDates and offerDurations
        const { offer, offerDates, offerDurations } = await mockOffer();

        // Set unique offer properties based on offer id
        offer.id = `${++offerId}`;
        offer.sellerId = sellers[versionIndex][j].seller.id;
        offer.price = `${offerId * 1000}`;
        offer.sellerDeposit = `${offerId * 100}`;
        offer.buyerCancelPenalty = `${offerId * 50}`;
        offer.quantityAvailable = `${(offerId + 1) * 15}`;

        // Default offer is in native token. Change every other to mock token
        if (offerId % 2 == 0) {
          offer.exchangeToken = mockToken.address;
        }

        // Set unique offer dates based on offer id
        const now = offerDates.validFrom;
        offerDates.validFrom = ethers.BigNumber.from(now)
          .add(oneMonth + offerId * 1000)
          .toString();
        offerDates.validUntil = ethers.BigNumber.from(now)
          .add(oneMonth * 6 * (offerId + 1))
          .toString();

        // Set unique offerDurations based on offer id
        offerDurations.disputePeriod = `${(offerId + 1) * oneMonth}`;
        offerDurations.voucherValid = `${(offerId + 1) * oneMonth}`;
        offerDurations.resolutionPeriod = `${(offerId + 1) * oneDay}`;

        // choose one DR and agent
        const disputeResolverId = DRs[versionIndex][offerId % 3].disputeResolver.id;
        const agentId = agents[versionIndex][offerId % 2].agent.id;

        // create an offer
        await offerHandler
          .connect(sellers[versionIndex][j].wallet)
          .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

        offers[versionIndex].push({ offer, offerDates, offerDurations, disputeResolverId, agentId });
        sellers[versionIndex][j].offerIds.push(offerId);

        // Deposit seller funds so the commit will succeed
        const sellerPool = ethers.BigNumber.from(offer.quantityAvailable).mul(offer.price).toString();
        const msgValue = offer.exchangeToken == ethers.constants.AddressZero ? sellerPool : "0";
        await fundsHandler
          .connect(sellers[versionIndex][j].wallet)
          .depositFunds(sellers[versionIndex][j].seller.id, offer.exchangeToken, sellerPool, { value: msgValue });
      }
    }

    // group some offers
    let groupId = groupOffset;
    for (let i = 0; i < sellers[versionIndex].length; i = i + 2) {
      const seller = sellers[versionIndex][i];
      const group = new Group(++groupId, seller.seller.id, seller.offerIds); // group all seller's offers
      const condition = mockCondition({
        tokenAddress: mockConditionalToken.address,
        maxCommits: "10",
      });
      await groupHandler.connect(seller.wallet).createGroup(group, condition);

      groups[versionIndex].push(group);
    }

    // create some twins and bundles
    let twinId = twinOffset;
    let bundleId = bundleOffset;
    for (let i = 1; i < sellers[versionIndex].length; i = i + 2) {
      const seller = sellers[versionIndex][i];
      let twinIds = []; // used for bundle

      // non fungible token
      await mockTwinTokens[0].connect(seller.wallet).setApprovalForAll(protocolDiamondAddress, true);
      await mockTwinTokens[1].connect(seller.wallet).setApprovalForAll(protocolDiamondAddress, true);
      // create multiple ranges
      const twin721 = mockTwin(rando.address, TokenType.NonFungibleToken);
      twin721.amount = "0";
      for (let j = 0; j < 7; j++) {
        twin721.tokenId = `${j * 1000000 + (i + accountOffset) * 100}`;
        twin721.supplyAvailable = `${10000 * (i + accountOffset + 1)}`;
        twin721.tokenAddress = mockTwinTokens[j % 2].address; // oscilate between twins
        twin721.id = ++twinId;
        await twinHandler.connect(seller.wallet).createTwin(twin721);

        twins[versionIndex].push(twin721);
        twinIds.push(twinId);
      }

      // fungible
      const twin20 = mockTwin(mockTwin20.address, TokenType.FungibleToken);
      await mockTwin20.connect(seller.wallet).approve(protocolDiamondAddress, 1);
      twin20.id = ++twinId;
      twin20.amount = i + accountOffset;
      twin20.supplyAvailable = twin20.amount * 100000000;
      await twinHandler.connect(seller.wallet).createTwin(twin20);
      twins[versionIndex].push(twin20);
      twinIds.push(twinId);

      // multitoken twin
      const twin1155 = mockTwin(mockTwin1155.address, TokenType.MultiToken);
      await mockTwin1155.connect(seller.wallet).setApprovalForAll(protocolDiamondAddress, true);
      for (let j = 0; j < 3; j++) {
        twin1155.tokenId = `${j * 30000 + (i + accountOffset) * 300}`;
        twin1155.amount = i + accountOffset + j;
        twin1155.supplyAvailable = `${300000 * (i + accountOffset + 1)}`;
        twin1155.id = ++twinId;
        await twinHandler.connect(seller.wallet).createTwin(twin1155);
        twins[versionIndex].push(twin1155);
        twinIds.push(twinId);
      }

      // create bundle with all seller's twins and offers
      const bundle = new Bundle(++bundleId, seller.seller.id, seller.offerIds, twinIds);
      await bundleHandler.connect(seller.wallet).createBundle(bundle);
      bundles[versionIndex].push(bundle);
    }

    // commit to some offers: first buyer commit to 1 offer, second to 2, third to 3 etc
    await setNextBlockTimestamp(Number(offers[versionIndex][offers[versionIndex].length - 1].offerDates.validFrom)); // When latest offer is valid, also other offers are valid
    let exchangeId = exchangeOffset;
    for (let i = 0; i < buyers[versionIndex].length; i++) {
      for (let j = i; j < buyers[versionIndex].length; j++) {
        const offer = offers[versionIndex][i + j].offer; // some offers will be picked multiple times, some never.
        const offerPrice = offer.price;
        const buyerWallet = buyers[versionIndex][j].wallet;
        let msgValue;
        if (offer.exchangeToken == ethers.constants.AddressZero) {
          msgValue = offerPrice;
        } else {
          // approve token transfer
          msgValue = 0;
          await mockToken.connect(buyerWallet).approve(protocolDiamondAddress, offerPrice);
          await mockToken.mint(buyerWallet.address, offerPrice);
        }
        await exchangeHandler.connect(buyerWallet).commitToOffer(buyerWallet.address, offer.id, { value: msgValue });
        exchanges[versionIndex].push({ exchangeId: ++exchangeId, offerId: offer.id, buyerIndex: j });
      }
    }

    // redeem some vouchers #4
    for (const id of [2, 5, 11, 8]) {
      const exchange = exchanges[versionIndex][id];
      await exchangeHandler
        .connect(buyers[versionIndex][exchange.buyerIndex].wallet)
        .redeemVoucher(exchange.exchangeId);
    }

    // cancel some vouchers #3
    for (const id of [10, 3, 13]) {
      const exchange = exchanges[versionIndex][id];
      await exchangeHandler
        .connect(buyers[versionIndex][exchange.buyerIndex].wallet)
        .cancelVoucher(exchange.exchangeId);
    }

    // revoke some vouchers #2
    for (const id of [4, 6]) {
      const exchange = exchanges[versionIndex][id];
      const offer = offers[versionIndex].find((o) => o.offer.id == exchange.offerId);
      const seller = sellers[versionIndex].find((s) => s.seller.id == offer.offer.sellerId);
      await exchangeHandler.connect(seller.wallet).revokeVoucher(exchange.exchangeId);
    }

    // raise dispute on some exchanges #1
    const id = 5; // must be one of redeemed ones
    const exchange = exchanges[versionIndex][id];
    await disputeHandler.connect(buyers[versionIndex][exchange.buyerIndex].wallet).raiseDispute(exchange.exchangeId);
  }

  async function getProtocolContractState(versionIndex = 0) {
    const [
      accountContractState,
      offerContractState,
      exchangeContractState,
      bundleContractState,
      configContractState,
      disputeContractState,
      fundsContractState,
      groupContractState,
      twinContractState,
      metaTxContractState,
      metaTxPrivateContractState,
      protocolStatusPrivateContractState,
      protocolLookupsPrivateContractState,
    ] = await Promise.all([
      getAccountContractState(versionIndex),
      getOfferContractState(versionIndex),
      getExchangeContractState(versionIndex),
      getBundleContractState(versionIndex),
      getConfigContractState(),
      getDisputeContractState(versionIndex),
      getFundsContractState(versionIndex),
      getGroupContractState(versionIndex),
      getTwinContractState(versionIndex),
      getMetaTxContractState(versionIndex),
      getMetaTxPrivateContractState(),
      getProtocolStatusPrivateContractState(),
      getProtocolLookupsPrivateContractState(versionIndex),
    ]);

    return {
      accountContractState,
      offerContractState,
      exchangeContractState,
      bundleContractState,
      configContractState,
      disputeContractState,
      fundsContractState,
      groupContractState,
      twinContractState,
      metaTxContractState,
      metaTxPrivateContractState,
      protocolStatusPrivateContractState,
      protocolLookupsPrivateContractState,
    };
  }

  async function getAccountContractState(versionIndex) {
    const accountHandlerRando = accountHandler.connect(rando);
    // all id count
    const totalCount =
      DRs[versionIndex].length +
      sellers[versionIndex].length +
      buyers[versionIndex].length +
      agents[versionIndex].length;
    const offset = versionIndex == 1 ? DRs[0].length + sellers[0].length + buyers[0].length + agents[0].length : 0;
    let DRsState = [];
    let sellerState = [];
    let buyersState = [];
    let agentsState = [];
    let allowedSellersState = [];
    let sellerByAddressState = [];
    let sellerByAuthTokenState = [];
    let DRbyAddressState = [];
    let nextAccountId;

    // Query even the ids where it's not expected to get the entity
    for (let id = 1 + offset; id <= totalCount + offset; id++) {
      const [singleSellerState, singleDRsState, singleBuyersState, singleAgentsState] = await Promise.all([
        accountHandlerRando.getSeller(id),
        accountHandlerRando.getDisputeResolver(id),
        accountHandlerRando.getBuyer(id),
        accountHandlerRando.getAgent(id),
      ]);
      sellerState.push(singleSellerState);
      DRsState.push(singleDRsState);
      buyersState.push(singleBuyersState);
      agentsState.push(singleAgentsState);
      for (let id2 = 1 + offset; id2 <= totalCount + offset; id2++) {
        allowedSellersState.push(await accountHandlerRando.areSellersAllowed(id2, [id]));
      }
    }

    for (const seller of sellers[versionIndex]) {
      const sellerAddress = seller.wallet.address;
      const sellerAuthToken = seller.authToken;

      const [singleSellerByAddressState, singleSellerByAuthTokenState, singleDRbyAddressState] = await Promise.all([
        accountHandlerRando.getSellerByAddress(sellerAddress),
        accountHandlerRando.getSellerByAuthToken(sellerAuthToken),
        accountHandlerRando.getDisputeResolverByAddress(sellerAddress),
      ]);
      sellerByAddressState.push(singleSellerByAddressState);
      sellerByAuthTokenState.push(singleSellerByAuthTokenState);
      DRbyAddressState.push(singleDRbyAddressState);
    }

    const otherAccounts = [...DRs[versionIndex], ...agents[versionIndex], ...buyers[versionIndex]];

    for (const account of otherAccounts) {
      const accountAddress = account.wallet.address;

      const [singleSellerByAddressState, singleDRbyAddressState] = await Promise.all([
        accountHandlerRando.getSellerByAddress(accountAddress),
        accountHandlerRando.getDisputeResolverByAddress(accountAddress),
      ]);
      sellerByAddressState.push(singleSellerByAddressState);
      DRbyAddressState.push(singleDRbyAddressState);
    }

    nextAccountId = await accountHandlerRando.getNextAccountId();

    return {
      DRsState,
      sellerState,
      buyersState,
      sellerByAddressState,
      sellerByAuthTokenState,
      DRbyAddressState,
      nextAccountId,
    };
  }

  async function getOfferContractState(versionIndex) {
    const offerHandlerRando = offerHandler.connect(rando);
    // get offers
    let offersState = [];
    let isOfferVoidedState = [];
    let agentIdByOfferState = [];
    for (const offer of offers[versionIndex]) {
      const id = offer.offer.id;
      const [singleOffersState, singleIsOfferVoidedState, singleAgentIdByOfferState] = await Promise.all([
        offerHandlerRando.getOffer(id),
        offerHandlerRando.isOfferVoided(id),
        offerHandlerRando.getAgentIdByOffer(id),
      ]);
      offersState.push(singleOffersState);
      isOfferVoidedState.push(singleIsOfferVoidedState);
      agentIdByOfferState.push(singleAgentIdByOfferState);
    }

    let nextOfferId = await offerHandlerRando.getNextOfferId();

    return { offersState, isOfferVoidedState, agentIdByOfferState, nextOfferId };
  }

  async function getExchangeContractState(versionIndex) {
    const exchangeHandlerRando = exchangeHandler.connect(rando);
    // get exchanges
    let exchangesState = [];
    let exchangeStateState = [];
    let isExchangeFinalizedState = [];
    let receiptsState = [];

    for (const exchange of exchanges[versionIndex]) {
      const id = exchange.exchangeId;
      const [singleExchangesState, singleExchangeStateState, singleIsExchangeFinalizedState] = await Promise.all([
        exchangeHandlerRando.getExchange(id),
        exchangeHandlerRando.getExchangeState(id),
        exchangeHandlerRando.isExchangeFinalized(id),
      ]);
      exchangesState.push(singleExchangesState);
      exchangeStateState.push(singleExchangeStateState);
      isExchangeFinalizedState.push(singleIsExchangeFinalizedState);
      try {
        receiptsState.push(await exchangeHandlerRando.getReceipt(id));
      } catch {
        receiptsState.push(["NOT_FINALIZED"]);
      }
    }

    let nextExchangeId = await exchangeHandlerRando.getNextExchangeId();
    return { exchangesState, exchangeStateState, isExchangeFinalizedState, receiptsState, nextExchangeId };
  }

  async function getBundleContractState(versionIndex) {
    // get bundles
    const bundleHandlerRando = bundleHandler.connect(rando);
    let bundlesState = [];
    let bundleIdByOfferState = [];
    let bundleIdByTwinState = [];
    for (const bundle of bundles[versionIndex]) {
      const id = bundle.id;
      const [singleBundlesState, singleBundleIdByOfferState, singleBundleIdByTwinState] = await Promise.all([
        bundleHandlerRando.getBundle(id),
        bundleHandlerRando.getBundleIdByOffer(id),
        bundleHandlerRando.getBundleIdByTwin(id),
      ]);
      bundlesState.push(singleBundlesState);
      bundleIdByOfferState.push(singleBundleIdByOfferState);
      bundleIdByTwinState.push(singleBundleIdByTwinState);
    }

    let nextBundleId = await bundleHandlerRando.getNextBundleId();
    return { bundlesState, bundleIdByOfferState, bundleIdByTwinState, nextBundleId };
  }

  async function getConfigContractState() {
    const configHandlerRando = configHandler.connect(rando);
    const [
      tokenAddress,
      treasuryAddress,
      voucherBeaconAddress,
      beaconProxyAddress,
      protocolFeePercentage,
      protocolFeeFlatBoson,
      maxOffersPerBatch,
      maxOffersPerGroup,
      maxTwinsPerBundle,
      maxOffersPerBundle,
      maxTokensPerWithdrawal,
      maxFeesPerDisputeResolver,
      maxEscalationResponsePeriod,
      maxDisputesPerBatch,
      maxTotalOfferFeePercentage,
      maxAllowedSellers,
      buyerEscalationDepositPercentage,
      authTokenContractNone,
      authTokenContractCustom,
      authTokenContractLens,
      authTokenContractENS,
      maxExchangesPerBatch,
      maxRoyaltyPecentage,
      maxResolutionPeriod,
      minDisputePeriod,
      accessControllerAddress,
    ] = await Promise.all([
      configHandlerRando.getTokenAddress(),
      configHandlerRando.getTreasuryAddress(),
      configHandlerRando.getVoucherBeaconAddress(),
      configHandlerRando.getBeaconProxyAddress(),
      configHandlerRando.getProtocolFeePercentage(),
      configHandlerRando.getProtocolFeeFlatBoson(),
      configHandlerRando.getMaxOffersPerBatch(),
      configHandlerRando.getMaxOffersPerGroup(),
      configHandlerRando.getMaxTwinsPerBundle(),
      configHandlerRando.getMaxOffersPerBundle(),
      configHandlerRando.getMaxTokensPerWithdrawal(),
      configHandlerRando.getMaxFeesPerDisputeResolver(),
      configHandlerRando.getMaxEscalationResponsePeriod(),
      configHandlerRando.getMaxDisputesPerBatch(),
      configHandlerRando.getMaxTotalOfferFeePercentage(),
      configHandlerRando.getMaxAllowedSellers(),
      configHandlerRando.getBuyerEscalationDepositPercentage(),
      configHandlerRando.getAuthTokenContract(AuthTokenType.None),
      configHandlerRando.getAuthTokenContract(AuthTokenType.Custom),
      configHandlerRando.getAuthTokenContract(AuthTokenType.Lens),
      configHandlerRando.getAuthTokenContract(AuthTokenType.ENS),
      configHandlerRando.getMaxExchangesPerBatch(),
      configHandlerRando.getMaxRoyaltyPecentage(),
      configHandlerRando.getMaxResolutionPeriod(),
      configHandlerRando.getMinDisputePeriod(),
      configHandlerRando.getAccessControllerAddress(),
    ]);

    return {
      tokenAddress,
      treasuryAddress,
      voucherBeaconAddress,
      beaconProxyAddress,
      protocolFeePercentage,
      protocolFeeFlatBoson,
      maxOffersPerBatch,
      maxOffersPerGroup,
      maxTwinsPerBundle,
      maxOffersPerBundle,
      maxTokensPerWithdrawal,
      maxFeesPerDisputeResolver,
      maxEscalationResponsePeriod,
      maxDisputesPerBatch,
      maxTotalOfferFeePercentage,
      maxAllowedSellers,
      buyerEscalationDepositPercentage,
      authTokenContractNone,
      authTokenContractCustom,
      authTokenContractLens,
      authTokenContractENS,
      maxExchangesPerBatch,
      maxRoyaltyPecentage,
      maxResolutionPeriod,
      minDisputePeriod,
      accessControllerAddress,
    };
  }

  async function getDisputeContractState(versionIndex) {
    const disputeHandlerRando = disputeHandler.connect(rando);
    let disputesState = [];
    let disputesStatesState = [];
    let disputeTimeoutState = [];
    let isDisputeFinalizedState = [];

    for (const exchange of exchanges[versionIndex]) {
      const id = exchange.exchangeId;
      const [singleDisputesState, singleDisputesStatesState, singleDisputeTimeoutState, singleIsDisputeFinalizedState] =
        await Promise.all([
          disputeHandlerRando.getDispute(id),
          disputeHandlerRando.getDisputeState(id),
          disputeHandlerRando.getDisputeTimeout(id),
          disputeHandlerRando.isDisputeFinalized(id),
        ]);
      disputesState.push(singleDisputesState);
      disputesStatesState.push(singleDisputesStatesState);
      disputeTimeoutState.push(singleDisputeTimeoutState);
      isDisputeFinalizedState.push(singleIsDisputeFinalizedState);
    }

    return { disputesState, disputesStatesState, disputeTimeoutState, isDisputeFinalizedState };
  }

  async function getFundsContractState(versionIndex) {
    const fundsHandlerRando = fundsHandler.connect(rando);
    // all id count
    const totalCount =
      DRs[versionIndex].length +
      sellers[versionIndex].length +
      buyers[versionIndex].length +
      agents[versionIndex].length;

    const offset = versionIndex == 1 ? DRs[0].length + sellers[0].length + buyers[0].length + agents[0].length : 0;

    // Query even the ids where it's not expected to get the entity
    const accountIds = [...Array(totalCount + offset + 1).keys()].slice(1);
    const groupsState = await Promise.all(accountIds.map((id) => fundsHandlerRando.getAvailableFunds(id)));

    return { groupsState };
  }

  async function getGroupContractState(versionIndex) {
    const groupHandlerRando = groupHandler.connect(rando);
    const offset = versionIndex == 1 ? groups[0].length : 0;
    const groupIds = [...Array(groups[versionIndex].length + offset + 1).keys()].slice(1);
    const groupsState = await Promise.all(groupIds.map((id) => groupHandlerRando.getGroup(id)));

    const nextGroupId = await groupHandlerRando.getNextGroupId();
    return { groupsState, nextGroupId };
  }

  async function getTwinContractState(versionIndex) {
    const twinHandlerRando = twinHandler.connect(rando);
    const offset = versionIndex == 1 ? twins[0].length : 0;
    const twinIds = [...Array(twins[versionIndex].length + offset + 1).keys()].slice(1);
    const twinsState = await Promise.all(twinIds.map((id) => twinHandlerRando.getTwin(id)));

    const nextTwinId = await twinHandlerRando.getNextTwinId();
    return { twinsState, nextTwinId };
  }

  async function getMetaTxContractState() {
    return {};
  }

  async function getMetaTxPrivateContractState() {
    /*
    ProtocolMetaTxInfo storage layout

    #0 [ currentSenderAddress + isMetaTransaction ]
    #1 [ domain separator ]
    #2 [ ] // placeholder for usedNonce
    #3 [ cachedChainId ]
    #4 [ ] // placeholder for inputType
    #5 [ ] // placeholder for hashInfo
    */

    // starting slot
    const metaTxStorageSlot = keccak256(ethers.utils.toUtf8Bytes("boson.protocol.metaTransactions"));
    const metaTxStorageSlotNumber = ethers.BigNumber.from(metaTxStorageSlot);

    // current sender address + isMetaTransaction (they are packed since they are shorter than one slot)
    // should be always be 0x
    const inTransactionInfo = await getStorageAt(protocolDiamondAddress, metaTxStorageSlotNumber.add("0"));

    // domain separator
    const domainSeparator = await getStorageAt(protocolDiamondAddress, metaTxStorageSlotNumber.add("1"));

    // cached chain id
    const cachedChainId = await getStorageAt(protocolDiamondAddress, metaTxStorageSlotNumber.add("3"));

    // input type
    const inputTypeKeys = [
      "commitToOffer(address,uint256)",
      "cancelVoucher(uint256)",
      "redeemVoucher(uint256)",
      "completeExchange(uint256)",
      "withdrawFunds(uint256,address[],uint256[])",
      "retractDispute(uint256)",
      "raiseDispute(uint256)",
      "escalateDispute(uint256)",
      "resolveDispute(uint256,uint256,bytes32,bytes32,uint8)",
    ];

    const inputTypesState = [];
    for (const inputTypeKey of inputTypeKeys) {
      const storageSlot = getMappinStoragePosition(metaTxStorageSlotNumber.add("4"), inputTypeKey, paddingType.NONE);
      inputTypesState.push(await getStorageAt(protocolDiamondAddress, storageSlot));
    }

    // hashInfo
    const hashInfoTypes = {
      Generic: 0,
      CommitToOffer: 1,
      Exchange: 2,
      Funds: 3,
      RaiseDispute: 4,
      ResolveDispute: 5,
    };

    const hashInfoState = [];
    for (const hashInfoType of Object.values(hashInfoTypes)) {
      const storageSlot = getMappinStoragePosition(metaTxStorageSlotNumber.add("5"), hashInfoType, paddingType.START);
      // get also hashFunction
      hashInfoState.push({
        typeHash: await getStorageAt(protocolDiamondAddress, storageSlot),
        functionPointer: await getStorageAt(protocolDiamondAddress, ethers.BigNumber.from(storageSlot).add(1)),
      });
    }

    return { inTransactionInfo, domainSeparator, cachedChainId, inputTypesState, hashInfoState };
  }

  async function getProtocolStatusPrivateContractState() {
    /*
    ProtocolStatus storage layout

    #0 [ pauseScenario ]
    #1 [ reentrancyStatus ]
    #2 [ ] // placeholder for initializedInterfaces
    */

    // starting slot
    const protocolStatusStorageSlot = keccak256(ethers.utils.toUtf8Bytes("boson.protocol.initializers"));
    const protocolStatusStorageSlotNumber = ethers.BigNumber.from(protocolStatusStorageSlot);

    // pause scenario
    const pauseScenario = await getStorageAt(protocolDiamondAddress, protocolStatusStorageSlotNumber.add("0"));

    // reentrancy status
    // defualt: NOT_ENTERED = 1
    const reentrancyStatus = await getStorageAt(protocolDiamondAddress, protocolStatusStorageSlotNumber.add("1"));

    // initializedInterfaces
    const interfaceIds = await getInterfaceIds();

    const initializedInterfacesState = [];
    for (const interfaceId of Object.values(interfaceIds)) {
      const storageSlot = getMappinStoragePosition(
        protocolStatusStorageSlotNumber.add("2"),
        interfaceId,
        paddingType.END
      );
      initializedInterfacesState.push(await getStorageAt(protocolDiamondAddress, storageSlot));
    }

    return { pauseScenario, reentrancyStatus, initializedInterfacesState };
  }

  async function getProtocolLookupsPrivateContractState(versionIndex) {
    /*
    ProtocolLookups storage layout

    Variables marked with X have an external getter and are not handled here
    #0  [ ] // placeholder for exchangeIdsByOffer
    #1  [X] // placeholder for bundleIdByOffer
    #2  [X] // placeholder for bundleIdByTwin
    #3  [ ] // placeholder for groupIdByOffer
    #4  [X] // placeholder for agentIdByOffer
    #5  [X] // placeholder for sellerIdByOperator
    #6  [X] // placeholder for sellerIdByAdmin
    #7  [X] // placeholder for sellerIdByClerk
    #8  [ ] // placeholder for buyerIdByWallet
    #9  [X] // placeholder for disputeResolverIdByOperator
    #10 [X] // placeholder for disputeResolverIdByAdmin
    #11 [X] // placeholder for disputeResolverIdByClerk
    #12 [ ] // placeholder for disputeResolverFeeTokenIndex
    #13 [ ] // placeholder for agentIdByWallet
    #14 [X] // placeholder for availableFunds
    #15 [X] // placeholder for tokenList
    #16 [ ] // placeholder for tokenIndexByAccount
    #17 [ ] // placeholder for cloneAddress
    #18 [ ] // placeholder for voucherCount
    #19 [ ] // placeholder for conditionalCommitsByAddress
    #20 [X] // placeholder for authTokenContracts
    #21 [X] // placeholder for sellerIdByAuthToken
    #22 [ ] // placeholder for twinRangesBySeller
    #23 [ ] // placeholder for twinIdsByTokenAddressAndBySeller
    #24 [X] // placeholder for twinReceiptsByExchange
    #25 [X] // placeholder for allowedSellers
    #26 [ ] // placeholder for allowedSellerIndex
    #27 [X] // placeholder for exchangeCondition
    #28 [ ] // placeholder for offerIdIndexByGroup
    #29 [ ] // placeholder for pendingAddressUpdatesBySeller
    #30 [ ] // placeholder for pendingAuthTokenUpdatesBySeller
    #31 [ ] // placeholder for pendingAddressUpdatesByDisputeResolver
    */

    // starting slot
    const protocolLookupsSlot = keccak256(ethers.utils.toUtf8Bytes("boson.protocol.lookups"));
    const protocolLookupsSlotNumber = ethers.BigNumber.from(protocolLookupsSlot);

    // exchangeIdsByOffer and groupIdByOffer
    let exchangeIdsByOfferState = [];
    let groupIdByOfferState = [];
    for (const offer of offers[versionIndex]) {
      const id = Number(offer.offer.id);
      // exchangeIdsByOffer
      let exchangeIdsByOffer = [];
      const arraySlot = ethers.BigNumber.from(
        getMappinStoragePosition(protocolLookupsSlotNumber.add("0"), id, paddingType.START)
      );
      const arrayLength = ethers.BigNumber.from(await getStorageAt(protocolDiamondAddress, arraySlot)).toNumber();
      const arrayStart = ethers.BigNumber.from(keccak256(arraySlot));
      for (let i = 0; i < arrayLength; i++) {
        exchangeIdsByOffer.push(await getStorageAt(protocolDiamondAddress, arrayStart.add(i)));
      }
      exchangeIdsByOfferState.push(exchangeIdsByOffer);

      // groupIdByOffer
      groupIdByOfferState.push(
        await getStorageAt(
          protocolDiamondAddress,
          getMappinStoragePosition(protocolLookupsSlotNumber.add("3"), id, paddingType.START)
        )
      );
    }

    // buyerIdByWallet, agentIdByWallet, conditionalCommitsByAddress
    let buyerIdByWallet = [];
    let agentIdByWallet = [];
    let conditionalCommitsByAddress = [];

    const accounts = [...sellers[versionIndex], ...DRs[versionIndex], ...agents[versionIndex], ...buyers[versionIndex]];

    for (const account of accounts) {
      const accountAddress = account.wallet.address;

      // buyerIdByWallet
      buyerIdByWallet.push(
        await getStorageAt(
          protocolDiamondAddress,
          getMappinStoragePosition(protocolLookupsSlotNumber.add("8"), accountAddress, paddingType.START)
        )
      );

      // agentIdByWallet
      agentIdByWallet.push(
        await getStorageAt(
          protocolDiamondAddress,
          getMappinStoragePosition(protocolLookupsSlotNumber.add("13"), accountAddress, paddingType.START)
        )
      );

      // conditionalCommitsByAddress
      const firstMappingStorageSlot = ethers.BigNumber.from(
        getMappinStoragePosition(protocolLookupsSlotNumber.add("19"), accountAddress, paddingType.START)
      );
      let commitsPerGroup = [];
      for (const group of groups[versionIndex]) {
        const id = group.id;
        commitsPerGroup.push(
          await getStorageAt(
            protocolDiamondAddress,
            getMappinStoragePosition(firstMappingStorageSlot, id, paddingType.START)
          )
        );
      }
      conditionalCommitsByAddress.push(commitsPerGroup);
    }

    // disputeResolverFeeTokenIndex, tokenIndexByAccount, cloneAddress, voucherCount
    let disputeResolverFeeTokenIndex = [];
    let tokenIndexByAccount = [];
    let cloneAddress = [];
    let voucherCount = [];

    // all id count
    const totalCount =
      DRs[versionIndex].length +
      sellers[versionIndex].length +
      buyers[versionIndex].length +
      agents[versionIndex].length;
    const offset = versionIndex == 1 ? DRs[0].length + sellers[0].length + buyers[0].length + agents[0].length : 0;
    const startId = 1 + offset;
    const endId = totalCount + offset;

    // loop over all ids even where no data is expected
    for (let id = startId; id <= endId; id++) {
      // disputeResolverFeeTokenIndex
      let firstMappingStorageSlot = ethers.BigNumber.from(
        getMappinStoragePosition(protocolLookupsSlotNumber.add("12"), id, paddingType.START)
      );
      disputeResolverFeeTokenIndex.push({
        native: await getStorageAt(
          protocolDiamondAddress,
          getMappinStoragePosition(firstMappingStorageSlot, ethers.constants.AddressZero, paddingType.START)
        ),
        mockToken: await getStorageAt(
          protocolDiamondAddress,
          getMappinStoragePosition(firstMappingStorageSlot, mockToken.address, paddingType.START)
        ),
      });

      // tokenIndexByAccount
      firstMappingStorageSlot = ethers.BigNumber.from(
        getMappinStoragePosition(protocolLookupsSlotNumber.add("16"), id, paddingType.START)
      );
      tokenIndexByAccount.push({
        native: await getStorageAt(
          protocolDiamondAddress,
          getMappinStoragePosition(firstMappingStorageSlot, ethers.constants.AddressZero, paddingType.START)
        ),
        mockToken: await getStorageAt(
          protocolDiamondAddress,
          getMappinStoragePosition(firstMappingStorageSlot, mockToken.address, paddingType.START)
        ),
      });

      // cloneAddress
      cloneAddress.push(
        await getStorageAt(
          protocolDiamondAddress,
          getMappinStoragePosition(protocolLookupsSlotNumber.add("17"), id, paddingType.START)
        )
      );

      // voucherCount
      voucherCount.push(
        await getStorageAt(
          protocolDiamondAddress,
          getMappinStoragePosition(protocolLookupsSlotNumber.add("18"), id, paddingType.START)
        )
      );
    }

    // twinRangesBySeller
    let twinRangesBySeller = [];
    for (let id = startId; id <= endId; id++) {
      const firstMappingStorageSlot = ethers.BigNumber.from(
        getMappinStoragePosition(protocolLookupsSlotNumber.add("22"), id, paddingType.START)
      );
      let ranges = {};
      for (let mockTwin of mockTwinTokens) {
        ranges[mockTwin.address] = [];
        const arraySlot = getMappinStoragePosition(firstMappingStorageSlot, mockTwin.address, paddingType.START);
        const arrayLength = ethers.BigNumber.from(await getStorageAt(protocolDiamondAddress, arraySlot)).toNumber();
        const arrayStart = ethers.BigNumber.from(keccak256(arraySlot));
        for (let i = 0; i < arrayLength * 2; i = i + 2) {
          // each BosonTypes.TokenRange has length 2
          ranges[mockTwin.address].push({
            start: await getStorageAt(protocolDiamondAddress, arrayStart.add(i)),
            end: await getStorageAt(protocolDiamondAddress, arrayStart.add(i + 1)),
          });
        }
      }
      twinRangesBySeller.push(ranges);
    }

    // twinIdsByTokenAddressAndBySeller
    let twinIdsByTokenAddressAndBySeller = [];
    for (let id = startId; id <= endId; id++) {
      const firstMappingStorageSlot = ethers.BigNumber.from(
        getMappinStoragePosition(protocolLookupsSlotNumber.add("23"), id, paddingType.START)
      );
      let twinIds = {};
      for (let mockTwin of mockTwinTokens) {
        twinIds[mockTwin.address] = [];
        const arraySlot = getMappinStoragePosition(firstMappingStorageSlot, mockTwin.address, paddingType.START);
        const arrayLength = ethers.BigNumber.from(await getStorageAt(protocolDiamondAddress, arraySlot)).toNumber();
        const arrayStart = ethers.BigNumber.from(keccak256(arraySlot));
        for (let i = 0; i < arrayLength; i++) {
          twinIds[mockTwin.address].push(await getStorageAt(protocolDiamondAddress, arrayStart.add(i)));
        }
      }
      twinIdsByTokenAddressAndBySeller.push(twinIds);
    }

    // allowedSellerIndex
    let allowedSellerIndex = [];
    for (const DR of DRs[versionIndex]) {
      const firstMappingStorageSlot = ethers.BigNumber.from(
        getMappinStoragePosition(
          protocolLookupsSlotNumber.add("26"),
          ethers.BigNumber.from(DR.disputeResolver.id).toHexString(),
          paddingType.START
        )
      );
      let sellerStatus = [];
      for (const seller of sellers[versionIndex]) {
        sellerStatus.push(
          await getStorageAt(
            protocolDiamondAddress,
            getMappinStoragePosition(
              firstMappingStorageSlot,
              ethers.BigNumber.from(seller.seller.id).toHexString(),
              paddingType.START
            )
          )
        );
      }
      allowedSellerIndex.push(sellerStatus);
    }

    // offerIdIndexByGroup
    let offerIdIndexByGroup = [];
    for (const group of groups[versionIndex]) {
      const id = group.id;
      const firstMappingStorageSlot = ethers.BigNumber.from(
        getMappinStoragePosition(protocolLookupsSlotNumber.add("28"), id, paddingType.START)
      );
      let offerInidices = [];
      for (const offer of offers[versionIndex]) {
        const id2 = Number(offer.offer.id);
        offerInidices.push(
          await getStorageAt(
            protocolDiamondAddress,
            getMappinStoragePosition(firstMappingStorageSlot, id2, paddingType.START)
          )
        );
      }
      offerIdIndexByGroup.push(offerInidices);
    }

    // pendingAddressUpdatesBySeller, pendingAuthTokenUpdatesBySeller, pendingAddressUpdatesByDisputeResolver
    let pendingAddressUpdatesBySeller = [];
    let pendingAuthTokenUpdatesBySeller = [];
    let pendingAddressUpdatesByDisputeResolver = [];

    // Although pending address/auth token update is not yet defined in 2.0.0, we can check that storage slots are empty
    for (let id = startId; id <= endId; id++) {
      // pendingAddressUpdatesBySeller
      let structStorageSlot = ethers.BigNumber.from(
        getMappinStoragePosition(protocolLookupsSlotNumber.add("29"), id, paddingType.START)
      );
      let structFields = [];
      for (let i = 0; i < 5; i++) {
        // BosonTypes.Seller has 6 fields, but last bool is packed in one slot with previous field
        structFields.push(await getStorageAt(protocolDiamondAddress, structStorageSlot.add(i)));
      }
      pendingAddressUpdatesBySeller.push(structFields);

      // pendingAuthTokenUpdatesBySeller
      structStorageSlot = ethers.BigNumber.from(
        getMappinStoragePosition(protocolLookupsSlotNumber.add("30"), id, paddingType.START)
      );
      structFields = [];
      for (let i = 0; i < 2; i++) {
        // BosonTypes.AuthToken has 2 fields
        structFields.push(await getStorageAt(protocolDiamondAddress, structStorageSlot.add(i)));
      }
      pendingAuthTokenUpdatesBySeller.push(structFields);

      // pendingAddressUpdatesByDisputeResolver
      structStorageSlot = ethers.BigNumber.from(
        getMappinStoragePosition(protocolLookupsSlotNumber.add("31"), id, paddingType.START)
      );
      structFields = [];
      for (let i = 0; i < 8; i++) {
        // BosonTypes.DisputeResolver has 8 fields
        structFields.push(await getStorageAt(protocolDiamondAddress, structStorageSlot.add(i)));
      }
      structFields[6] = await getStorageAt(protocolDiamondAddress, keccak256(structStorageSlot.add(6))); // represents field string metadataUri. Technically this value represents the length of the string, but since it should be 0, we don't do further decoding
      pendingAddressUpdatesByDisputeResolver.push(structFields);
    }

    return {
      exchangeIdsByOfferState,
      groupIdByOfferState,
      buyerIdByWallet,
      disputeResolverFeeTokenIndex,
      agentIdByWallet,
      tokenIndexByAccount,
      cloneAddress,
      voucherCount,
      conditionalCommitsByAddress,
      twinRangesBySeller,
      twinIdsByTokenAddressAndBySeller,
      allowedSellerIndex,
      offerIdIndexByGroup,
      pendingAddressUpdatesBySeller,
      pendingAuthTokenUpdatesBySeller,
      pendingAddressUpdatesByDisputeResolver,
    };
  }
});
