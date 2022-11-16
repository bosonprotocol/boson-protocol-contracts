const shell = require("shelljs");
const { getStorageAt } = require("@nomicfoundation/hardhat-network-helpers");
const hre = require("hardhat");
const ethers = hre.ethers;
const { keccak256 } = ethers.utils;
const { assert } = require("chai");
const AuthToken = require("../../scripts/domain/AuthToken");
const AuthTokenType = require("../../scripts/domain/AuthTokenType");
const Role = require("../../scripts/domain/Role");
const Group = require("../../scripts/domain/Group");
const VoucherInitValues = require("../../scripts/domain/VoucherInitValues");
const TokenType = require("../../scripts/domain/TokenType.js");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
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
} = require("../util/mock");
const { setNextBlockTimestamp } = require("../util/utils.js");
const { oneMonth, oneDay } = require("../util/constants");
const { readContracts } = require("../../scripts/util/utils");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");

const oldVersion = "v2.0.0";
const newVersion = "v2.1.0";

/**
 *  Upgrade test case - After upgrade from 2.0.0 to 2.1.0 everything is still operational
 */
describe("[@skip-on-coverage] After facet upgrade, everything is still operational", function () {
  // Common vars
  let deployer, rando;
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

  let DRs = [];
  let sellers = [];
  let buyers = [];
  let agents = [];
  let offers = [];
  let groups = [];
  let twins = [];
  let exchanges = [];
  let protocolContractState;

  before(async function () {
    // Make accounts available
    [deployer, rando] = await ethers.getSigners();

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
      "Foreign1155"
    ]);
    mockTwinTokens = [mockTwin721_1, mockTwin721_2];

    // Populate protocol with data
    await populateProtocolContract();

    // Get current protocol state, which serves as the reference
    // We assume that this state is a true one, relying on our unit and integration tests
    protocolContractState = await getProtocolContractState();
    // protocolContractStatepro = await getProtocolContractStateWithPromise();

    // assert.deepEqual(protocolContractState,protocolContractStatepro, "nono")
    // process.exit()
   
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
    // revert to state before path was executed
    await ethers.provider.send("evm_revert", [snapshot]);
    snapshot = await ethers.provider.send("evm_snapshot", []);
  });

  after(async function () {
    // revert to latest state of contracts
    shell.exec(`git checkout HEAD contracts`);
  });

  // Exchange methods
  context("📋 Right After upgrade", async function () {
    it.only("State is not affected directly after the update", async function () {
      // Get protocol state after the upgrade
      const protocolContractStateAfterUpgrade = await getProtocolContractState();

      // State before and after should be equal
      assert.deepEqual(protocolContractState, protocolContractStateAfterUpgrade, "state mismatch after upgrade");
    });
  });

  // Create new protocol entities. Existing data should not be affected
  context.skip("📋 New data after the upgrade do not corrupt data from before the upgrade", async function () {});

  // Test that offers and exchanges from before the upgrade can normally be used
  context.skip("📋 Interactions after the upgrade still work", async function () {});

  // Test actions that worked in previous version, but should not work anymore, or work differently
  context.skip("📋 Breaking changes", async function () {});

  // utility functions
  async function populateProtocolContract() {
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
        value: ethers.utils.parseEther("1"),
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
          DRs.push({ wallet: connectedWallet, disputeResolver, disputeResolverFees, sellerAllowList });

          //ADMIN role activates Dispute Resolver
          await accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id);
          break;
        }
        case entity.SELLER: {
          const seller = mockSeller(wallet.address, wallet.address, wallet.address, wallet.address);
          let authToken;
          // randomly decide if auth token is used or not
          if (Math.random() > 0.5) {
            // no auth token
            authToken = mockAuthToken();
          } else {
            // use auth token
            seller.admin = ethers.constants.AddressZero;
            await mockAuthERC721Contract.connect(connectedWallet).mint(101 * i, 1);
            authToken = new AuthToken(`${101 * i}`, AuthTokenType.Lens);
          }
          // set unique new voucherInitValues
          const voucherInitValues = new VoucherInitValues(`http://seller${i}.com/uri`, i * 10);
          await accountHandler.connect(connectedWallet).createSeller(seller, authToken, voucherInitValues);
          sellers.push({ wallet: connectedWallet, seller, authToken, voucherInitValues, offerIds: [] });

          // mint mock token to sellers just in case they need them
          await mockToken.mint(connectedWallet.address, "10000000000");
          await mockToken.connect(connectedWallet).approve(protocolDiamondAddress, "10000000000");
          break;
        }
        case entity.AGENT: {
          const agent = mockAgent(wallet.address);
          await accountHandler.connect(connectedWallet).createAgent(agent);
          agents.push({ wallet: connectedWallet, agent });
          break;
        }
        case entity.BUYER: {
          // no need to explicitly create buyer, since it's done automatically during commitToOffer
          const buyer = mockBuyer(wallet.address);
          buyers.push({ wallet: connectedWallet, buyer });

          // mint them conditional token in case they need it
          await mockConditionalToken.mint(wallet.address, "10");
          break;
        }
      }
    }

    // Make explicit allowed sellers list for some DRs
    const sellerIds = sellers.map((s) => s.seller.id);
    for (let i = 0; i < DRs.length; i = i + 2) {
      const DR = DRs[i];
      DR.sellerAllowList = sellerIds;
      await accountHandler.connect(DR.wallet).addSellersToAllowList(DR.disputeResolver.id, sellerIds);
    }

    // create offers - first seller has 5 offers, second 4, third 3 etc
    let offerId = 0;
    for (let i = 0; i < sellers.length; i++) {
      for (let j = i; j >= 0; j--) {
        // Mock offer, offerDates and offerDurations
        const { offer, offerDates, offerDurations } = await mockOffer();

        // Set unique offer properties based on offer id
        offer.id = `${++offerId}`;
        offer.sellerId = sellers[j].seller.id;
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
        const disputeResolverId = DRs[offerId % 3].disputeResolver.id;
        const agentId = agents[offerId % 2].agent.id;

        // create an offer
        await offerHandler
          .connect(sellers[j].wallet)
          .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

        offers.push({ offer, offerDates, offerDurations, disputeResolverId, agentId });
        sellers[j].offerIds.push(offerId);

        // Deposit seller funds so the commit will succeed
        const sellerPool = ethers.BigNumber.from(offer.quantityAvailable).mul(offer.price).toString();
        const msgValue = offer.exchangeToken == ethers.constants.AddressZero ? sellerPool : "0";
        await fundsHandler
          .connect(sellers[j].wallet)
          .depositFunds(sellers[j].seller.id, offer.exchangeToken, sellerPool, { value: msgValue });
      }
    }

    // group some offers
    let groupId = 0;
    for (let i = 0; i < sellers.length; i = i + 2) {
      const seller = sellers[i];
      const group = new Group(++groupId, seller.seller.id, seller.offerIds); // group all seller's offers
      const condition = mockCondition({
        tokenAddress: mockConditionalToken.address,
        maxCommits: "10",
      });
      await groupHandler.connect(seller.wallet).createGroup(group, condition);

      groups.push(group);
    }

    // create some twins
    let twinId = 0;
    for (let i = 1; i < sellers.length; i = i + 2) {
      const seller = sellers[i];
      await mockTwinTokens[0].connect(seller.wallet).setApprovalForAll(protocolDiamondAddress, true);
      await mockTwinTokens[1].connect(seller.wallet).setApprovalForAll(protocolDiamondAddress, true);
      // create multiple ranges
      const twin721 = mockTwin(rando.address, TokenType.NonFungibleToken);
      twin721.amount = "0";
      for (let j = 0; j < 7; j++) {
        twin721.tokenId = `${j * 10000 + i * 100}`;
        twin721.supplyAvailable = `${10 * (i + 1)}`;
        twin721.tokenAddress = mockTwinTokens[j % 2].address; // oscilate between twins
        twin721.id = ++twinId;
        await twinHandler.connect(seller.wallet).createTwin(twin721);

        twins.push(twin721);
      }

      const twin20 = mockTwin(mockTwin20.address, TokenType.FungibleToken);
      await mockTwin20.connect(seller.wallet).approve(protocolDiamondAddress, 1);
      twin20.id = ++twinId;
      twin20.amount = i;
      await twinHandler.connect(seller.wallet).createTwin(twin20);
      twins.push(twin20);

      const twin1155 = mockTwin(mockTwin1155.address, TokenType.MultiToken);
      await mockTwin1155.connect(seller.wallet).setApprovalForAll(protocolDiamondAddress, true);
      for (let j = 0; j < 3; j++) {
        twin1155.tokenId = `${j * 30000 + i * 300}`
        twin1155.amount = i+j;
        twin1155.supplyAvailable = `${30 * (i + 1)}`;
        twin1155.id = ++twinId;
        await twinHandler.connect(seller.wallet).createTwin(twin1155);
        twins.push(twin20);
      }
    }

    // commit to some offers: first buyer commit to 1 offer, second to 2, third to 3 etc
    await setNextBlockTimestamp(Number(offers[offers.length - 1].offerDates.validFrom)); // When latest offer is valid, also other offers are valid
    let exchangeId = 0;
    for (let i = 0; i < buyers.length; i++) {
      for (let j = i; j < buyers.length; j++) {
        const offerId = i + j + 1; // some offers will be picked multiple times, some never
        const offerPrice = offers[offerId - 1].offer.price;
        const buyerWallet = buyers[j].wallet;
        let msgValue;
        if (offers[offerId - 1].offer.exchangeToken == ethers.constants.AddressZero) {
          msgValue = offerPrice;
        } else {
          // approve token transfer
          msgValue = 0;
          await mockToken.connect(buyerWallet).approve(protocolDiamondAddress, offerPrice);
        }
        await mockToken.mint(buyerWallet.address, offerPrice);
        await exchangeHandler.connect(buyerWallet).commitToOffer(buyerWallet.address, offerId, { value: msgValue });
        exchanges.push({ exchangeId: ++exchangeId, offerId: offerId, buyerIndex: j });
      }
    }

    // redeem some vouchers #4
    for (const id of [2, 5, 11, 8]) {
      const exchange = exchanges[id];
      await exchangeHandler.connect(buyers[exchange.buyerIndex].wallet).redeemVoucher(exchange.exchangeId);
    }

    // cancel some vouchers #3
    for (const id of [10, 3, 13]) {
      const exchange = exchanges[id];
      await exchangeHandler.connect(buyers[exchange.buyerIndex].wallet).cancelVoucher(exchange.exchangeId);
    }

    // revoke some vouchers #2
    for (const id of [4, 6]) {
      const exchange = exchanges[id];
      const offer = offers.find((o) => o.offer.id == exchange.offerId);
      const seller = sellers.find((s) => s.seller.id == offer.offer.sellerId);
      await exchangeHandler.connect(seller.wallet).revokeVoucher(exchange.exchangeId);
    }

    // raise dispute on some exchanges #1
    const id = 5; // must be one of redeemed ones
    const exchange = exchanges[id];
    await disputeHandler.connect(buyers[exchange.buyerIndex].wallet).raiseDispute(exchange.exchangeId);
  }

  async function getProtocolContractState() {
    const [accountContractState,
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
    protocolLookupsPrivateContractState] =
    await Promise.all([getAccountContractState(),
    getOfferContractState(),
    getExchangeContractState(),
    getBundleContractState(),
    getConfigContractState(),
    getDisputeContractState(),
    getFundsContractState(),
    getGroupContractState(),
    getTwinContractState(),
    getMetaTxContractState(),
    getMetaTxPrivateContractState(),
    getProtocolStatusPrivateContractState(),
    getProtocolLookupsPrivateContractState()])


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

  async function getAccountContractState() {
    const accountHandlerRando = accountHandler.connect(rando);
    // all id count
    const totalCount = DRs.length + sellers.length + buyers.length + agents.length;
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
    for (let id = 1; id <= totalCount; id++) {
      const [singleSellerState, singleDRsState, singleBuyersState, singleAgentsState] = await Promise.all([accountHandlerRando.getSeller(id),
        accountHandlerRando.getDisputeResolver(id),
        accountHandlerRando.getBuyer(id),
        accountHandlerRando.getAgent(id)
      ])
      sellerState.push(singleSellerState);
      DRsState.push(singleDRsState);
      buyersState.push(singleBuyersState);
      agentsState.push(singleAgentsState);
      for (let id2 = 1; id2 <= totalCount; id2++) {
        allowedSellersState.push(await accountHandlerRando.areSellersAllowed(id2, [id]));
      }
    }

    for (const seller of sellers) {
      const sellerAddress = seller.wallet.address;
      const sellerAuthToken = seller.authToken;

      const [singleSellerByAddressState,singleSellerByAuthTokenState,singleDRbyAddressState] = await Promise.all([accountHandlerRando.getSellerByAddress(sellerAddress),
        accountHandlerRando.getSellerByAuthToken(sellerAuthToken),
        accountHandlerRando.getDisputeResolverByAddress(sellerAddress)
      ])
      sellerByAddressState.push(singleSellerByAddressState);
      sellerByAuthTokenState.push(singleSellerByAuthTokenState);
      DRbyAddressState.push(singleDRbyAddressState);
    }

    const otherAccounts = [...DRs, ...agents, ...buyers]

    for (const account of otherAccounts) {
      const accountAddress = account.wallet.address;

      const [singleSellerByAddressState, singleDRbyAddressState] = await Promise.all([accountHandlerRando.getSellerByAddress(accountAddress),accountHandlerRando.getDisputeResolverByAddress(accountAddress)])
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


  async function getOfferContractState() {
    const offerHandlerRando = offerHandler.connect(rando);
    // get offers
    let offersState = [];
    let isOfferVoidedState = [];
    let agentIdByOfferState = [];
    for (let id = 1; id <= offers.length; id++) {
      const [singleOffersState,singleIsOfferVoidedState,singleAgentIdByOfferState] = await Promise.all([offerHandlerRando.getOffer(id),
        offerHandlerRando.isOfferVoided(id),
        offerHandlerRando.getAgentIdByOffer(id)
      ])
      offersState.push(singleOffersState);
      isOfferVoidedState.push(singleIsOfferVoidedState);
      agentIdByOfferState.push(singleAgentIdByOfferState);
    }

    let nextOfferId = await offerHandlerRando.getNextOfferId();

    return { offersState, isOfferVoidedState, agentIdByOfferState, nextOfferId };
  }

  async function getExchangeContractState() {
    const exchangeHandlerRando = exchangeHandler.connect(rando);
    // get exchanges
    let exchangesState = [];
    let exchangeStateState = [];
    let isExchangeFinalizedState = [];
    let receiptsState = [];

    for (let id = 1; id <= exchanges.length; id++) {
      const [singleExchangesState,singleExchangeStateState,singleIsExchangeFinalizedState] = await Promise.all([exchangeHandlerRando.getExchange(id),
        exchangeHandlerRando.getExchangeState(id),
        exchangeHandlerRando.isExchangeFinalized(id)
      ])
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

  
  async function getBundleContractState() {
    // even if there are no bundles explicitly created
    // just make check that after the update, empty bundles are still returned.
    // Also this function will be handy if tests are expanded and actually introduce some bundles.
    const bundleHandlerRando = bundleHandler.connect(rando);
    let bundlesState = [];
    let bundleIdByOfferState = [];
    let bundleIdByTwinState = [];
    for (let id = 1; id < 15; id++) {
      // until we actually have some bundles, check some arbitrary number to see nothing was put in their place

      const [singleBundlesState,singleBundleIdByOfferState,singleBundleIdByTwinState] = await Promise.all([
        bundleHandlerRando.getBundle(id),
        bundleHandlerRando.getBundleIdByOffer(id),
        bundleHandlerRando.getBundleIdByTwin(id)
      ])
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
    accessControllerAddress
  ] = await Promise.all(
    [configHandlerRando.getTokenAddress(),
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
    configHandlerRando.getAccessControllerAddress()])

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
accessControllerAddress
    };
  }

  async function getDisputeContractState() {
    const disputeHandlerRando = disputeHandler.connect(rando);
    let disputesState = [];
    let disputesStatesState = [];
    let disputeTimeoutState = [];
    let isDisputeFinalizedState = [];

    for (let id = 1; id <= exchanges.length; id++) {
      const [singleDisputesState,singleDisputesStatesState,singleDisputeTimeoutState,singleIsDisputeFinalizedState] = await Promise.all([
        disputeHandlerRando.getDispute(id),
        disputeHandlerRando.getDisputeState(id),
        disputeHandlerRando.getDisputeTimeout(id),
        disputeHandlerRando.isDisputeFinalized(id)
      ])
      disputesState.push(singleDisputesState);
      disputesStatesState.push(singleDisputesStatesState);
      disputeTimeoutState.push(singleDisputeTimeoutState);
      isDisputeFinalizedState.push(singleIsDisputeFinalizedState);
    }

    return { disputesState, disputesStatesState, disputeTimeoutState, isDisputeFinalizedState };
  }

  async function getFundsContractState() {
    const fundsHandlerRando = fundsHandler.connect(rando);
    // all id count
    const totalCount = DRs.length + sellers.length + buyers.length + agents.length;

    // Query even the ids where it's not expected to get the entity
    const accountIds = [...Array(totalCount + 1).keys()].slice(1);
    const groupsState = await Promise.all(accountIds.map(id=>fundsHandlerRando.getAvailableFunds(id)))

    return { groupsState };
  }

  async function getGroupContractState() {
    const groupHandlerRando = groupHandler.connect(rando);
    const groupIds = [...Array(groups.length + 1).keys()].slice(1);
    const groupsState = await Promise.all(groupIds.map(id=>groupHandlerRando.getGroup(id)))

    const nextGroupId = await groupHandlerRando.getNextGroupId();
    return { groupsState, nextGroupId };
  }

  async function getTwinContractState() {
    const twinHandlerRando = twinHandler.connect(rando)
    const twinIds = [...Array(twins.length + 1).keys()].slice(1);
    const twinsState = await Promise.all(twinIds.map(id=>twinHandlerRando.getTwin(id)))

    const nextTwinId = await twinHandlerRando.getNextTwinId();
    return { twinsState, nextTwinId };
  }

  async function getMetaTxContractState() {
    return {};
  }

  const paddingType = {
    NONE: 0,
    START: 1,
    END: 2,
  };

  function getMappinStoragePosition(slot, key, padding = paddingType.NONE) {
    let keyBuffer;
    switch (padding) {
      case paddingType.NONE:
        keyBuffer = ethers.utils.toUtf8Bytes(key);
        break;
      case paddingType.START:
        keyBuffer = Buffer.from(ethers.utils.hexZeroPad(key, 32).toString().slice(2), "hex");
        break;
      case paddingType.END:
        keyBuffer = Buffer.from(key.slice(2).padEnd(64, "0"), "hex"); // assume key is prefixed with 0x
        break;
    }
    const pBuffer = Buffer.from(slot.toHexString().slice(2), "hex");
    return keccak256(Buffer.concat([keyBuffer, pBuffer]));
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
      ResolveDisput: 5,
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

  async function getProtocolLookupsPrivateContractState() {
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
    for (let id = 1; id <= offers.length; id++) {
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

    const accounts = [...sellers, ...DRs, ...agents, ...buyers];

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
      for (let id = 1; id <= groups.length; id++) {
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
    const totalCount = DRs.length + sellers.length + buyers.length + agents.length;

    // loop over all ids even where no data is expected
    for (let id = 1; id <= totalCount; id++) {
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
    for (let id = 1; id <= totalCount; id++) {
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
    for (let id = 1; id <= totalCount; id++) {
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
    for (const DR of DRs) {
      const firstMappingStorageSlot = ethers.BigNumber.from(
        getMappinStoragePosition(
          protocolLookupsSlotNumber.add("26"),
          ethers.BigNumber.from(DR.disputeResolver.id).toHexString(),
          paddingType.START
        )
      );
      let sellerStatus = [];
      for (const seller of sellers) {
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
    for (let id = 1; id <= groups.length; id++) {
      const firstMappingStorageSlot = ethers.BigNumber.from(
        getMappinStoragePosition(protocolLookupsSlotNumber.add("28"), id, paddingType.START)
      );
      let offerInidices = [];
      for (let id2 = 1; id2 <= offers.length; id2++) {
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
    for (let id = 1; id <= totalCount; id++) {
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
      structFields[6] = await getStorageAt(protocolDiamondAddress, keccak256(structStorageSlot.add(6))); // represents field string metadataUri. Technically this value represents the lenght of the string, but since it should be 0, we don't do further decoding
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
