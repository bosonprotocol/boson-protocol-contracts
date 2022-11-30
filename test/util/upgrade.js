const shell = require("shelljs");
const { getStorageAt } = require("@nomicfoundation/hardhat-network-helpers");
const hre = require("hardhat");
const ethers = hre.ethers;
const { keccak256 } = ethers.utils;
const AuthToken = require("../../scripts/domain/AuthToken");
const AuthTokenType = require("../../scripts/domain/AuthTokenType");
const Role = require("../../scripts/domain/Role");
const Bundle = require("../../scripts/domain/Bundle");
const Group = require("../../scripts/domain/Group");
const VoucherInitValues = require("../../scripts/domain/VoucherInitValues");
const TokenType = require("../../scripts/domain/TokenType.js");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const {
  mockOffer,
  mockDisputeResolver,
  mockAuthToken,
  mockSeller,
  mockAgent,
  mockBuyer,
  mockCondition,
  mockTwin,
} = require("./mock");
const {
  setNextBlockTimestamp,
  paddingType,
  getMappingStoragePosition,
  calculateContractAddress,
} = require("./utils.js");
const { oneMonth, oneDay } = require("./constants");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const { readContracts } = require("../../scripts/util/utils");
const { facets } = require("../upgrade/00_config");

// Common vars
let rando;

// deploy suite and return deployed contracts
async function deploySuite(deployer, tag) {
  // checkout old version
  console.log(`Checking out version ${tag}`);
  shell.exec(`git checkout ${tag} contracts`);

  // run deploy suite, which automatically compiles the contracts
  await hre.run("deploy-suite", { env: "upgrade-test", facetConfig: JSON.stringify(facets.deploy[tag]) });

  // Read contract info from file
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  const contractsFile = readContracts(chainId, "hardhat", "upgrade-test");

  // Get AccessController abstraction
  const accessControllerInfo = contractsFile.contracts.find((i) => i.name === "AccessController");
  const accessController = await ethers.getContractAt("AccessController", accessControllerInfo.address);

  // Temporarily grant UPGRADER role to deployer account
  await accessController.grantRole(Role.UPGRADER, deployer.address);

  // Get protocolDiamondAddress
  const protocolDiamondAddress = contractsFile.contracts.find((i) => i.name === "ProtocolDiamond").address;

  // Grant PROTOCOL role to ProtocolDiamond address
  await accessController.grantRole(Role.PROTOCOL, protocolDiamondAddress);

  // Cast Diamond to interfaces
  const accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamondAddress);
  const bundleHandler = await ethers.getContractAt("IBosonBundleHandler", protocolDiamondAddress);
  const disputeHandler = await ethers.getContractAt("IBosonDisputeHandler", protocolDiamondAddress);
  const exchangeHandler = await ethers.getContractAt("IBosonExchangeHandler", protocolDiamondAddress);
  const fundsHandler = await ethers.getContractAt("IBosonFundsHandler", protocolDiamondAddress);
  const groupHandler = await ethers.getContractAt("IBosonGroupHandler", protocolDiamondAddress);
  const offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamondAddress);
  const orchestrationHandler = await ethers.getContractAt("IBosonOrchestrationHandler", protocolDiamondAddress);
  const twinHandler = await ethers.getContractAt("IBosonTwinHandler", protocolDiamondAddress);
  const pauseHandler = await ethers.getContractAt("IBosonPauseHandler", protocolDiamondAddress);
  const metaTransactionsHandler = await ethers.getContractAt("IBosonMetaTransactionsHandler", protocolDiamondAddress);
  const configHandler = await ethers.getContractAt("IBosonConfigHandler", protocolDiamondAddress);
  const ERC165Facet = await ethers.getContractAt("ERC165Facet", protocolDiamondAddress);

  // create mock token for auth
  const [mockAuthERC721Contract] = await deployMockTokens(["Foreign721"]);
  configHandler.connect(deployer).setAuthTokenContract(AuthTokenType.Lens, mockAuthERC721Contract.address);

  // create mock token for offers
  const [mockToken, mockConditionalToken, mockTwin721_1, mockTwin721_2, mockTwin20, mockTwin1155] =
    await deployMockTokens(["Foreign20", "Foreign20", "Foreign721", "Foreign721", "Foreign20", "Foreign1155"]);
  const mockTwinTokens = [mockTwin721_1, mockTwin721_2];

  return {
    protocolDiamondAddress,
    protocolContracts: {
      accountHandler,
      exchangeHandler,
      offerHandler,
      fundsHandler,
      disputeHandler,
      bundleHandler,
      groupHandler,
      twinHandler,
      configHandler,
      orchestrationHandler,
      pauseHandler,
      metaTransactionsHandler,
      ERC165Facet,
    },
    mockContracts: {
      mockAuthERC721Contract,
      mockToken,
      mockConditionalToken,
      mockTwinTokens,
      mockTwin20,
      mockTwin1155,
    },
  };
}

// upgrade the suite to new version and returns handlers with upgraded interfaces
// upgradedInterfaces is object { handlerName : "interfaceName"}
async function upgradeSuite(tag, protocolDiamondAddress, upgradedInterfaces) {
  if (tag) {
    // checkout the new tag
    console.log(`Checking out version ${tag}`);
    shell.exec(`git checkout ${tag} contracts`);
  } else {
    // if tag was not created yet, use the latest code
    console.log(`Checking out latest code`);
    shell.exec(`git checkout HEAD contracts`);
  }

  // compile new contracts
  await hre.run("compile");
  await hre.run("upgrade-facets", { env: "upgrade-test", facetConfig: JSON.stringify(facets.upgrade[tag]) });

  // Cast to updated interface
  let newHandlers = {};
  for (const [handlerName, interfaceName] of Object.entries(upgradedInterfaces)) {
    newHandlers[handlerName] = await ethers.getContractAt(interfaceName, protocolDiamondAddress);
  }

  return newHandlers;
}

// populates protocol with some entities
// returns
/*   DRs
      sellers
      buyers
      agents
      offers
      exchanges
      bundles
      groups
      twins*/
async function populateProtocolContract(
  deployer,
  protocolDiamondAddress,
  {
    accountHandler,
    exchangeHandler,
    offerHandler,
    fundsHandler,
    disputeHandler,
    bundleHandler,
    groupHandler,
    twinHandler,
  },
  { mockToken, mockConditionalToken, mockAuthERC721Contract, mockTwinTokens, mockTwin20, mockTwin1155 }
) {
  let DRs = [];
  let sellers = [];
  let buyers = [];
  let agents = [];
  let offers = [];
  let groups = [];
  let twins = [];
  let exchanges = [];
  let bundles = [];

  const entityType = {
    SELLER: 0,
    DR: 1,
    AGENT: 2,
    BUYER: 3,
  };

  const entities = [
    entityType.DR,
    entityType.AGENT,
    entityType.SELLER,
    entityType.SELLER,
    entityType.DR,
    entityType.SELLER,
    entityType.DR,
    entityType.SELLER,
    entityType.AGENT,
    entityType.SELLER,
    entityType.BUYER,
    entityType.BUYER,
    entityType.BUYER,
    entityType.BUYER,
    entityType.BUYER,
  ];

  for (const entity of entities) {
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
    switch (entity) {
      case entityType.DR: {
        const disputeResolver = mockDisputeResolver(wallet.address, wallet.address, wallet.address, wallet.address);
        const disputeResolverFees = [
          new DisputeResolverFee(ethers.constants.AddressZero, "Native", "0"),
          new DisputeResolverFee(mockToken.address, "MockToken", "0"),
        ];
        const sellerAllowList = [];
        await accountHandler
          .connect(connectedWallet)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
        DRs.push({
          wallet: connectedWallet,
          id: disputeResolver.id,
          disputeResolver,
          disputeResolverFees,
          sellerAllowList,
        });

        //ADMIN role activates Dispute Resolver
        await accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id);
        break;
      }
      case entityType.SELLER: {
        const seller = mockSeller(wallet.address, wallet.address, wallet.address, wallet.address);
        const id = seller.id;
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
        sellers.push({ wallet: connectedWallet, id, seller, authToken, voucherInitValues, offerIds: [] });

        // mint mock token to sellers just in case they need them
        await mockToken.mint(connectedWallet.address, "10000000000");
        await mockToken.connect(connectedWallet).approve(protocolDiamondAddress, "10000000000");
        break;
      }
      case entityType.AGENT: {
        const agent = mockAgent(wallet.address);
        await accountHandler.connect(connectedWallet).createAgent(agent);
        agents.push({ wallet: connectedWallet, id: agent.id, agent });
        break;
      }
      case entityType.BUYER: {
        // no need to explicitly create buyer, since it's done automatically during commitToOffer
        const buyer = mockBuyer(wallet.address);
        buyers.push({ wallet: connectedWallet, id: buyer.id, buyer });

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
  let offerId = (await offerHandler.getNextOfferId()).toNumber();
  for (let i = 0; i < sellers.length; i++) {
    for (let j = i; j >= 0; j--) {
      // Mock offer, offerDates and offerDurations
      const { offer, offerDates, offerDurations } = await mockOffer();

      // Set unique offer properties based on offer id
      offer.id = `${offerId}`;
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

      offerId++;
    }
  }

  // group some offers
  let groupId = (await groupHandler.getNextGroupId()).toNumber();
  for (let i = 0; i < sellers.length; i = i + 2) {
    const seller = sellers[i];
    const group = new Group(groupId, seller.seller.id, seller.offerIds); // group all seller's offers
    const condition = mockCondition({
      tokenAddress: mockConditionalToken.address,
      maxCommits: "10",
    });
    await groupHandler.connect(seller.wallet).createGroup(group, condition);

    groups.push(group);

    groupId++;
  }

  // create some twins and bundles
  let twinId = (await twinHandler.getNextTwinId()).toNumber();
  let bundleId = (await bundleHandler.getNextBundleId()).toNumber();
  for (let i = 1; i < sellers.length; i = i + 2) {
    const seller = sellers[i];
    const sellerId = seller.id;
    let twinIds = []; // used for bundle

    // non fungible token
    await mockTwinTokens[0].connect(seller.wallet).setApprovalForAll(protocolDiamondAddress, true);
    await mockTwinTokens[1].connect(seller.wallet).setApprovalForAll(protocolDiamondAddress, true);
    // create multiple ranges
    const twin721 = mockTwin(ethers.constants.AddressZero, TokenType.NonFungibleToken);
    twin721.amount = "0";
    for (let j = 0; j < 7; j++) {
      twin721.tokenId = `${sellerId * 1000000 + j * 100000}`;
      twin721.supplyAvailable = `${100 * (sellerId + 1)}`;
      twin721.tokenAddress = mockTwinTokens[j % 2].address; // oscilate between twins
      twin721.id = twinId;
      await twinHandler.connect(seller.wallet).createTwin(twin721);

      twins.push(twin721);
      twinIds.push(twinId);

      twinId++;
    }

    // fungible
    const twin20 = mockTwin(mockTwin20.address, TokenType.FungibleToken);
    await mockTwin20.connect(seller.wallet).approve(protocolDiamondAddress, 1);
    twin20.id = twinId;
    twin20.amount = sellerId;
    twin20.supplyAvailable = twin20.amount * 100000000;
    await twinHandler.connect(seller.wallet).createTwin(twin20);
    twins.push(twin20);
    twinIds.push(twinId);
    twinId++;

    // multitoken twin
    const twin1155 = mockTwin(mockTwin1155.address, TokenType.MultiToken);
    await mockTwin1155.connect(seller.wallet).setApprovalForAll(protocolDiamondAddress, true);
    for (let j = 0; j < 3; j++) {
      twin1155.tokenId = `${j * 30000 + sellerId * 300}`;
      twin1155.amount = sellerId + j;
      twin1155.supplyAvailable = `${300000 * (sellerId + 1)}`;
      twin1155.id = twinId;
      await twinHandler.connect(seller.wallet).createTwin(twin1155);
      twins.push(twin1155);
      twinIds.push(twinId);
      twinId++;
    }

    // create bundle with all seller's twins and offers
    const bundle = new Bundle(bundleId, seller.seller.id, seller.offerIds, twinIds);
    await bundleHandler.connect(seller.wallet).createBundle(bundle);
    bundles.push(bundle);
    bundleId++;
  }

  // commit to some offers: first buyer commit to 1 offer, second to 2, third to 3 etc
  await setNextBlockTimestamp(Number(offers[offers.length - 1].offerDates.validFrom)); // When latest offer is valid, also other offers are valid
  let exchangeId = (await exchangeHandler.getNextExchangeId()).toNumber();
  for (let i = 0; i < buyers.length; i++) {
    for (let j = i; j < buyers.length; j++) {
      const offer = offers[i + j].offer; // some offers will be picked multiple times, some never.
      const offerPrice = offer.price;
      const buyerWallet = buyers[j].wallet;
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
      exchanges.push({ exchangeId: exchangeId, offerId: offer.id, buyerIndex: j });
      exchangeId++;
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

  return { DRs, sellers, buyers, agents, offers, exchanges, bundles, groups, twins };
}

// Returns protocol state for provided entities
async function getProtocolContractState(
  protocolDiamondAddress,
  {
    accountHandler,
    exchangeHandler,
    offerHandler,
    fundsHandler,
    disputeHandler,
    bundleHandler,
    groupHandler,
    twinHandler,
    configHandler,
  },
  { mockToken, mockTwinTokens },
  { DRs, sellers, buyers, agents, offers, exchanges, bundles, groups, twins }
) {
  rando = (await ethers.getSigners())[10]; // random account making the calls

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
    getAccountContractState(accountHandler, { DRs, sellers, buyers, agents }),
    getOfferContractState(offerHandler, offers),
    getExchangeContractState(exchangeHandler, exchanges),
    getBundleContractState(bundleHandler, bundles),
    getConfigContractState(configHandler),
    getDisputeContractState(disputeHandler, exchanges),
    getFundsContractState(fundsHandler, { DRs, sellers, buyers, agents }),
    getGroupContractState(groupHandler, groups),
    getTwinContractState(twinHandler, twins),
    getMetaTxContractState(),
    getMetaTxPrivateContractState(protocolDiamondAddress),
    getProtocolStatusPrivateContractState(protocolDiamondAddress),
    getProtocolLookupsPrivateContractState(
      protocolDiamondAddress,
      { mockToken, mockTwinTokens },
      { sellers, DRs, agents, buyers, offers, groups }
    ),
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

async function getAccountContractState(accountHandler, { DRs, sellers, buyers, agents }) {
  const accountHandlerRando = accountHandler.connect(rando);
  // all accounts
  const accounts = [...sellers, ...DRs, ...buyers, ...agents];
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
  for (const account of accounts) {
    const id = account.id;
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
    for (const account2 of accounts) {
      const id2 = account2.id;
      allowedSellersState.push(await accountHandlerRando.areSellersAllowed(id2, [id]));
    }
  }

  for (const seller of sellers) {
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

  const otherAccounts = [...DRs, ...agents, ...buyers];

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

async function getOfferContractState(offerHandler, offers) {
  const offerHandlerRando = offerHandler.connect(rando);
  // get offers
  let offersState = [];
  let isOfferVoidedState = [];
  let agentIdByOfferState = [];
  for (const offer of offers) {
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

async function getExchangeContractState(exchangeHandler, exchanges) {
  const exchangeHandlerRando = exchangeHandler.connect(rando);
  // get exchanges
  let exchangesState = [];
  let exchangeStateState = [];
  let isExchangeFinalizedState = [];
  let receiptsState = [];

  for (const exchange of exchanges) {
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

async function getBundleContractState(bundleHandler, bundles) {
  // get bundles
  const bundleHandlerRando = bundleHandler.connect(rando);
  let bundlesState = [];
  let bundleIdByOfferState = [];
  let bundleIdByTwinState = [];
  for (const bundle of bundles) {
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

async function getConfigContractState(configHandler) {
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

async function getDisputeContractState(disputeHandler, exchanges) {
  const disputeHandlerRando = disputeHandler.connect(rando);
  let disputesState = [];
  let disputesStatesState = [];
  let disputeTimeoutState = [];
  let isDisputeFinalizedState = [];

  for (const exchange of exchanges) {
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

async function getFundsContractState(fundsHandler, { DRs, sellers, buyers, agents }) {
  const fundsHandlerRando = fundsHandler.connect(rando);

  // Query even the ids where it's not expected to get the entity
  const accountIds = [...DRs, ...sellers, ...buyers, ...agents].map((account) => account.id);
  const groupsState = await Promise.all(accountIds.map((id) => fundsHandlerRando.getAvailableFunds(id)));

  return { groupsState };
}

async function getGroupContractState(groupHandler, groups) {
  const groupHandlerRando = groupHandler.connect(rando);
  const groupIds = [...Array(groups.length + 1).keys()].slice(1);
  const groupsState = await Promise.all(groupIds.map((id) => groupHandlerRando.getGroup(id)));

  const nextGroupId = await groupHandlerRando.getNextGroupId();
  return { groupsState, nextGroupId };
}

async function getTwinContractState(twinHandler, twins) {
  const twinHandlerRando = twinHandler.connect(rando);
  const twinIds = [...Array(twins.length + 1).keys()].slice(1);
  const twinsState = await Promise.all(twinIds.map((id) => twinHandlerRando.getTwin(id)));

  const nextTwinId = await twinHandlerRando.getNextTwinId();
  return { twinsState, nextTwinId };
}

async function getMetaTxContractState() {
  return {};
}

async function getMetaTxPrivateContractState(protocolDiamondAddress) {
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
    const storageSlot = getMappingStoragePosition(metaTxStorageSlotNumber.add("4"), inputTypeKey, paddingType.NONE);
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
    const storageSlot = getMappingStoragePosition(metaTxStorageSlotNumber.add("5"), hashInfoType, paddingType.START);
    // get also hashFunction
    hashInfoState.push({
      typeHash: await getStorageAt(protocolDiamondAddress, storageSlot),
      functionPointer: await getStorageAt(protocolDiamondAddress, ethers.BigNumber.from(storageSlot).add(1)),
    });
  }

  return { inTransactionInfo, domainSeparator, cachedChainId, inputTypesState, hashInfoState };
}

async function getProtocolStatusPrivateContractState(protocolDiamondAddress) {
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
    const storageSlot = getMappingStoragePosition(
      protocolStatusStorageSlotNumber.add("2"),
      interfaceId,
      paddingType.END
    );
    initializedInterfacesState.push(await getStorageAt(protocolDiamondAddress, storageSlot));
  }

  return { pauseScenario, reentrancyStatus, initializedInterfacesState };
}

async function getProtocolLookupsPrivateContractState(
  protocolDiamondAddress,
  { mockToken, mockTwinTokens },
  { sellers, DRs, agents, buyers, offers, groups }
) {
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
  for (const offer of offers) {
    const id = Number(offer.offer.id);
    // exchangeIdsByOffer
    let exchangeIdsByOffer = [];
    const arraySlot = ethers.BigNumber.from(
      getMappingStoragePosition(protocolLookupsSlotNumber.add("0"), id, paddingType.START)
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
        getMappingStoragePosition(protocolLookupsSlotNumber.add("3"), id, paddingType.START)
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
        getMappingStoragePosition(protocolLookupsSlotNumber.add("8"), accountAddress, paddingType.START)
      )
    );

    // agentIdByWallet
    agentIdByWallet.push(
      await getStorageAt(
        protocolDiamondAddress,
        getMappingStoragePosition(protocolLookupsSlotNumber.add("13"), accountAddress, paddingType.START)
      )
    );

    // conditionalCommitsByAddress
    const firstMappingStorageSlot = ethers.BigNumber.from(
      getMappingStoragePosition(protocolLookupsSlotNumber.add("19"), accountAddress, paddingType.START)
    );
    let commitsPerGroup = [];
    for (const group of groups) {
      const id = group.id;
      commitsPerGroup.push(
        await getStorageAt(
          protocolDiamondAddress,
          getMappingStoragePosition(firstMappingStorageSlot, id, paddingType.START)
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

  // all account ids
  const accountIds = accounts.map((account) => Number(account.id));

  // loop over all ids even where no data is expected
  for (const id of accountIds) {
    // disputeResolverFeeTokenIndex
    let firstMappingStorageSlot = ethers.BigNumber.from(
      getMappingStoragePosition(protocolLookupsSlotNumber.add("12"), id, paddingType.START)
    );
    disputeResolverFeeTokenIndex.push({
      native: await getStorageAt(
        protocolDiamondAddress,
        getMappingStoragePosition(firstMappingStorageSlot, ethers.constants.AddressZero, paddingType.START)
      ),
      mockToken: await getStorageAt(
        protocolDiamondAddress,
        getMappingStoragePosition(firstMappingStorageSlot, mockToken.address, paddingType.START)
      ),
    });

    // tokenIndexByAccount
    firstMappingStorageSlot = ethers.BigNumber.from(
      getMappingStoragePosition(protocolLookupsSlotNumber.add("16"), id, paddingType.START)
    );
    tokenIndexByAccount.push({
      native: await getStorageAt(
        protocolDiamondAddress,
        getMappingStoragePosition(firstMappingStorageSlot, ethers.constants.AddressZero, paddingType.START)
      ),
      mockToken: await getStorageAt(
        protocolDiamondAddress,
        getMappingStoragePosition(firstMappingStorageSlot, mockToken.address, paddingType.START)
      ),
    });

    // cloneAddress
    cloneAddress.push(
      await getStorageAt(
        protocolDiamondAddress,
        getMappingStoragePosition(protocolLookupsSlotNumber.add("17"), id, paddingType.START)
      )
    );

    // voucherCount
    voucherCount.push(
      await getStorageAt(
        protocolDiamondAddress,
        getMappingStoragePosition(protocolLookupsSlotNumber.add("18"), id, paddingType.START)
      )
    );
  }

  // twinRangesBySeller
  let twinRangesBySeller = [];
  for (const id of accountIds) {
    const firstMappingStorageSlot = ethers.BigNumber.from(
      getMappingStoragePosition(protocolLookupsSlotNumber.add("22"), id, paddingType.START)
    );
    let ranges = {};
    for (let mockTwin of mockTwinTokens) {
      ranges[mockTwin.address] = [];
      const arraySlot = getMappingStoragePosition(firstMappingStorageSlot, mockTwin.address, paddingType.START);
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
  for (const id of accountIds) {
    const firstMappingStorageSlot = ethers.BigNumber.from(
      getMappingStoragePosition(protocolLookupsSlotNumber.add("23"), id, paddingType.START)
    );
    let twinIds = {};
    for (let mockTwin of mockTwinTokens) {
      twinIds[mockTwin.address] = [];
      const arraySlot = getMappingStoragePosition(firstMappingStorageSlot, mockTwin.address, paddingType.START);
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
      getMappingStoragePosition(
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
          getMappingStoragePosition(
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
  for (const group of groups) {
    const id = group.id;
    const firstMappingStorageSlot = ethers.BigNumber.from(
      getMappingStoragePosition(protocolLookupsSlotNumber.add("28"), id, paddingType.START)
    );
    let offerInidices = [];
    for (const offer of offers) {
      const id2 = Number(offer.offer.id);
      offerInidices.push(
        await getStorageAt(
          protocolDiamondAddress,
          getMappingStoragePosition(firstMappingStorageSlot, id2, paddingType.START)
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
  for (const id of accountIds) {
    // pendingAddressUpdatesBySeller
    let structStorageSlot = ethers.BigNumber.from(
      getMappingStoragePosition(protocolLookupsSlotNumber.add("29"), id, paddingType.START)
    );
    let structFields = [];
    for (let i = 0; i < 5; i++) {
      // BosonTypes.Seller has 6 fields, but last bool is packed in one slot with previous field
      structFields.push(await getStorageAt(protocolDiamondAddress, structStorageSlot.add(i)));
    }
    pendingAddressUpdatesBySeller.push(structFields);

    // pendingAuthTokenUpdatesBySeller
    structStorageSlot = ethers.BigNumber.from(
      getMappingStoragePosition(protocolLookupsSlotNumber.add("30"), id, paddingType.START)
    );
    structFields = [];
    for (let i = 0; i < 2; i++) {
      // BosonTypes.AuthToken has 2 fields
      structFields.push(await getStorageAt(protocolDiamondAddress, structStorageSlot.add(i)));
    }
    pendingAuthTokenUpdatesBySeller.push(structFields);

    // pendingAddressUpdatesByDisputeResolver
    structStorageSlot = ethers.BigNumber.from(
      getMappingStoragePosition(protocolLookupsSlotNumber.add("31"), id, paddingType.START)
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

async function getStorageLayout(contractName) {
  const { sourceName } = await hre.artifacts.readArtifact(contractName);
  const buildInfo = await hre.artifacts.getBuildInfo(`${sourceName}:${contractName}`);

  const storage = buildInfo.output?.contracts?.[sourceName]?.[contractName]?.storageLayout?.storage;

  return storage;
}

function compareStorageLayouts(storageBefore, storageAfter) {
  // Ald old variables must be present in new layout in the same slots
  // New variables can be added if they don't affect the layout
  let storageOk = true;
  for (const stateVariableBefore of storageBefore) {
    const { label } = stateVariableBefore;
    if (label == "__gap") {
      // __gap is special variable that does not store any data and can potentially be modified
      // TODO: if changed, validate against new variables
      continue;
    }
    const stateVariableAfter = storageAfter.find((stateVariable) => stateVariable.label === label);
    if (
      !stateVariableAfter ||
      stateVariableAfter.slot != stateVariableBefore.slot ||
      stateVariableAfter.offset != stateVariableBefore.offset ||
      stateVariableAfter.type != stateVariableBefore.type
    ) {
      storageOk = false;
      console.error("Storage layout mismatch");
      console.log("State variable before", stateVariableBefore);
      console.log("State variable after", stateVariableAfter);
    }
  }

  return storageOk;
}

async function populateVoucherContract(
  deployer,
  protocolDiamondAddress,
  { accountHandler, exchangeHandler, offerHandler, fundsHandler },
  { mockToken }
) {
  let DR;
  let sellers = [];
  let buyers = [];
  let offers = [];
  let bosonVouchers = [];
  let exchanges = [];

  let voucherIndex = 1;

  const entityType = {
    SELLER: 0,
    DR: 1,
    AGENT: 2,
    BUYER: 3,
  };

  const entities = [
    entityType.DR,
    entityType.SELLER,
    entityType.SELLER,
    entityType.SELLER,
    entityType.SELLER,
    entityType.SELLER,
    entityType.BUYER,
    entityType.BUYER,
    entityType.BUYER,
    entityType.BUYER,
    entityType.BUYER,
  ];

  for (const entity of entities) {
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
    switch (entity) {
      case entityType.DR: {
        const disputeResolver = mockDisputeResolver(wallet.address, wallet.address, wallet.address, wallet.address);
        const disputeResolverFees = [
          new DisputeResolverFee(ethers.constants.AddressZero, "Native", "0"),
          new DisputeResolverFee(mockToken.address, "MockToken", "0"),
        ];
        const sellerAllowList = [];
        await accountHandler
          .connect(connectedWallet)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
        DR = {
          wallet: connectedWallet,
          id: disputeResolver.id,
          disputeResolver,
          disputeResolverFees,
          sellerAllowList,
        };

        //ADMIN role activates Dispute Resolver
        await accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id);
        break;
      }
      case entityType.SELLER: {
        const seller = mockSeller(wallet.address, wallet.address, wallet.address, wallet.address);
        const id = seller.id;
        let authToken = mockAuthToken();

        // set unique new voucherInitValues
        const voucherInitValues = new VoucherInitValues(`http://seller${id}.com/uri`, id * 10);
        await accountHandler.connect(connectedWallet).createSeller(seller, authToken, voucherInitValues);

        // calculate voucher contract address and cast it to contract instance
        const voucherContractAddress = calculateContractAddress(accountHandler.address, voucherIndex++);
        const bosonVoucher = await ethers.getContractAt("BosonVoucher", voucherContractAddress);

        sellers.push({ wallet: connectedWallet, id, seller, authToken, voucherInitValues, offerIds: [], bosonVoucher });
        bosonVouchers.push(bosonVoucher);

        // mint mock token to sellers just in case they need them
        await mockToken.mint(connectedWallet.address, "10000000000");
        await mockToken.connect(connectedWallet).approve(protocolDiamondAddress, "10000000000");
        break;
      }
      case entityType.BUYER: {
        // no need to explicitly create buyer, since it's done automatically during commitToOffer
        const buyer = mockBuyer(wallet.address);
        buyers.push({ wallet: connectedWallet, id: buyer.id, buyer });
        break;
      }
    }
  }

  // create offers - first seller has 5 offers, second 4, third 3 etc
  let offerId = (await offerHandler.getNextOfferId()).toNumber();
  for (let i = 0; i < sellers.length; i++) {
    for (let j = i; j >= 0; j--) {
      // Mock offer, offerDates and offerDurations
      const { offer, offerDates, offerDurations } = await mockOffer();

      // Set unique offer properties based on offer id
      offer.id = `${offerId}`;
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
      const disputeResolverId = DR.disputeResolver.id;
      const agentId = "0";

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

      offerId++;
    }
  }

  // commit to some offers: first buyer commit to 1 offer, second to 2, third to 3 etc
  await setNextBlockTimestamp(Number(offers[offers.length - 1].offerDates.validFrom)); // When latest offer is valid, also other offers are valid
  let exchangeId = (await exchangeHandler.getNextExchangeId()).toNumber();
  for (let i = 0; i < buyers.length; i++) {
    for (let j = i; j < buyers.length; j++) {
      const offer = offers[i + j].offer; // some offers will be picked multiple times, some never.
      const offerPrice = offer.price;
      const buyerWallet = buyers[j].wallet;
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
      exchanges.push({ exchangeId: exchangeId, offerId: offer.id, buyerIndex: j });
      exchangeId++;
    }
  }

  return { DR, sellers, buyers, offers, exchanges, bosonVouchers };
}

async function getVoucherContractState({ bosonVouchers, exchanges, sellers, buyers }) {
  let bosonVouchersState = [];
  for (const bosonVoucher of bosonVouchers) {
    // supports interface
    const interfaceIds = await getInterfaceIds(false);
    const suppportstInterface = await Promise.all(
      [interfaceIds["IBosonVoucher"], interfaceIds["IERC721"], interfaceIds["IERC2981"]].map((i) =>
        bosonVoucher.supportsInterface(i)
      )
    );

    // no arg getters
    const [sellerId, contractURI, getRoyaltyPercentage, owner, name, symbol] = await Promise.all([
      bosonVoucher.getSellerId(),
      bosonVoucher.contractURI(),
      bosonVoucher.getRoyaltyPercentage(),
      bosonVoucher.owner(),
      bosonVoucher.name(),
      bosonVoucher.symbol(),
    ]);

    // tokenId related
    const tokenIds = exchanges.map((exchange) => exchange.exchangeId); // tokenId and exchangeId are interchangeable
    const ownerOf = await Promise.all(
      tokenIds.map((tokenId) => bosonVoucher.ownerOf(tokenId).catch(() => "invalid token"))
    );
    const tokenURI = await Promise.all(
      tokenIds.map((tokenId) => bosonVoucher.tokenURI(tokenId).catch(() => "invalid token"))
    );
    const getApproved = await Promise.all(
      tokenIds.map((tokenId) => bosonVoucher.getApproved(tokenId).catch(() => "invalid token"))
    );
    const royaltyInfo = await Promise.all(
      tokenIds.map((tokenId) => bosonVoucher.royaltyInfo(tokenId, "100").catch(() => "invalid token"))
    );

    // balanceOf(address owner)
    // isApprovedForAll(address owner, address operator)
    const addresses = [...sellers, ...buyers].map((acc) => acc.wallet.address);
    const balanceOf = await Promise.all(addresses.map((address) => bosonVoucher.balanceOf(address)));
    const isApprovedForAll = await Promise.all(
      addresses.map((address1) =>
        Promise.all(addresses.map((address2) => bosonVoucher.isApprovedForAll(address1, address2)))
      )
    );

    bosonVouchersState.push({
      suppportstInterface,
      sellerId,
      contractURI,
      getRoyaltyPercentage,
      owner,
      name,
      symbol,
      ownerOf,
      tokenURI,
      getApproved,
      royaltyInfo,
      balanceOf,
      isApprovedForAll,
    });
  }
  return bosonVouchersState;
}

exports.deploySuite = deploySuite;
exports.upgradeSuite = upgradeSuite;
exports.populateProtocolContract = populateProtocolContract;
exports.getProtocolContractState = getProtocolContractState;
exports.getStorageLayout = getStorageLayout;
exports.compareStorageLayouts = compareStorageLayouts;
exports.populateVoucherContract = populateVoucherContract;
exports.getVoucherContractState = getVoucherContractState;
