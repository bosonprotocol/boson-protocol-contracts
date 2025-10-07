const shell = require("shelljs");
const _ = require("lodash");
const { getStorageAt } = require("@nomicfoundation/hardhat-network-helpers");
const hre = require("hardhat");
const { expect } = require("chai");
const decache = require("decache");
const {
  id: ethersId,
  keccak256,
  encodeBytes32String,
  ZeroAddress,
  getContractAt,
  Wallet,
  provider,
  parseEther,
  toUtf8Bytes,
  getContractFactory,
  getSigners,
  ZeroHash,
  MaxUint256,
} = hre.ethers;
const AuthToken = require("../../scripts/domain/AuthToken");
const { getMetaTransactionsHandlerFacetInitArgs } = require("../../scripts/config/facet-deploy.js");
const AuthTokenType = require("../../scripts/domain/AuthTokenType");
const Role = require("../../scripts/domain/Role");
const Bundle = require("../../scripts/domain/Bundle");
const Group = require("../../scripts/domain/Group");
const VoucherInitValues = require("../../scripts/domain/VoucherInitValues");
const TokenType = require("../../scripts/domain/TokenType.js");
const Exchange = require("../../scripts/domain/Exchange.js");
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
const { setNextBlockTimestamp, paddingType, getMappingStoragePosition, deriveTokenId } = require("./utils.js");
const { oneMonth, oneDay, oneWeek } = require("./constants");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const { readContracts } = require("../../scripts/util/utils");
const { getFacets } = require("../upgrade/00_config");
const Receipt = require("../../scripts/domain/Receipt");
let Offer = require("../../scripts/domain/Offer");
const OfferFees = require("../../scripts/domain/OfferFees");
const DisputeResolutionTerms = require("../../scripts/domain/DisputeResolutionTerms");
const OfferDurations = require("../../scripts/domain/OfferDurations");
const OfferDates = require("../../scripts/domain/OfferDates");
const Seller = require("../../scripts/domain/Seller");
const DisputeResolver = require("../../scripts/domain/DisputeResolver");
const Agent = require("../../scripts/domain/Agent");
const Buyer = require("../../scripts/domain/Buyer");
const { tagsByVersion } = require("../upgrade/00_config");
let Condition = require("../../scripts/domain/Condition");

// Common vars
let rando;
let preUpgradeInterfaceIds, preUpgradeVersions;
let facets, versionTags;

function getVersionsBeforeTarget(versions, targetVersion) {
  const versionsBefore = versions.filter((v, index, arr) => {
    if (v === "v2.1.0" || v === "latest") return false;
    if (v === targetVersion) {
      arr.splice(index + 1); // Truncate array after the target version
      return false; //
    }
    return true;
  });

  return versionsBefore.map((version) => {
    // Remove "v" prefix and "-rc.${number}" suffix
    return encodeBytes32String(version.replace(/^v/, "").replace(/-rc\.\d+$/, ""));
  });
}

// deploy suite and return deployed contracts
async function deploySuite(deployer, newVersion) {
  // Cache config data
  versionTags = tagsByVersion[newVersion];
  facets = await getFacets();

  // checkout old version
  const { oldVersion: tag, deployScript: scriptsTag, updateDomain } = versionTags;
  console.log(`Fetching tags`);
  shell.exec(`git fetch --force --tags origin`);

  console.log(`Checking out version ${tag}`);
  shell.exec(`rm -rf contracts/*`);
  shell.exec(`git checkout ${tag} contracts/**`);

  if (scriptsTag) {
    console.log(`Checking out scripts on version ${scriptsTag}`);
    shell.exec(`rm -rf scripts/*`);
    shell.exec(`git checkout ${scriptsTag} scripts/**`);
  }

  if (updateDomain) {
    console.log(`Updating the domain definitions to ${tag}`);
    const filesToUpdate = updateDomain.map((file) => `scripts/domain/${file}.js`).join(" ");
    shell.exec(`git checkout ${tag} ${filesToUpdate}`);
  }

  const isOldOZVersion = ["v2.0", "v2.1", "v2.2"].some((v) => tag.startsWith(v));
  if (isOldOZVersion) {
    console.log("Installing correct version of OZ");
    // Temporary install old OZ contracts
    shell.exec("npm i @openzeppelin/contracts-upgradeable@4.7.1");
  }

  const deployConfig = facets.deploy[tag];

  if (!deployConfig) {
    throw new Error(`No deploy config found for tag ${tag}`);
  }

  // versions up to v2.3. have typo in the deploy config, so we need to mimic it here
  if (isOldOZVersion || tag.startsWith("v2.3")) {
    deployConfig["ConfigHandlerFacet"].init[1]["maxRoyaltyPecentage"] =
      deployConfig["ConfigHandlerFacet"].init[1]["maxRoyaltyPercentage"];
  }

  await hre.run("compile");
  // run deploy suite, which automatically compiles the contracts
  await hre.run("deploy-suite", {
    env: "upgrade-test",
    facetConfig: JSON.stringify(deployConfig),
    version: tag.replace(/^v/, ""),
  });

  // Read contract info from file
  const chainId = (await provider.getNetwork()).chainId;
  const contractsFile = readContracts(chainId, "hardhat", "upgrade-test");

  // Get AccessController abstraction
  const accessControllerInfo = contractsFile.contracts.find((i) => i.name === "AccessController");
  const accessController = await getContractAt("AccessController", accessControllerInfo.address);

  // Temporarily grant UPGRADER role to deployer account
  await accessController.grantRole(Role.UPGRADER, await deployer.getAddress());

  // Get protocolDiamondAddress
  const protocolDiamondAddress = contractsFile.contracts.find((i) => i.name === "ProtocolDiamond").address;

  // Grant PROTOCOL role to ProtocolDiamond address
  await accessController.grantRole(Role.PROTOCOL, protocolDiamondAddress);

  // Cast Diamond to interfaces
  const accountHandler = await getContractAt("IBosonAccountHandler", protocolDiamondAddress);
  const bundleHandler = await getContractAt("IBosonBundleHandler", protocolDiamondAddress);
  const disputeHandler = await getContractAt("IBosonDisputeHandler", protocolDiamondAddress);
  const exchangeHandler = await getContractAt("IBosonExchangeHandler", protocolDiamondAddress);
  const fundsHandler = await getContractAt("IBosonFundsHandler", protocolDiamondAddress);
  const groupHandler = await getContractAt("IBosonGroupHandler", protocolDiamondAddress);
  const offerHandler = await getContractAt("IBosonOfferHandler", protocolDiamondAddress);
  const orchestrationHandler = await getContractAt("IBosonOrchestrationHandler", protocolDiamondAddress);
  const twinHandler = await getContractAt("IBosonTwinHandler", protocolDiamondAddress);
  const pauseHandler = await getContractAt("IBosonPauseHandler", protocolDiamondAddress);
  const metaTransactionsHandler = await getContractAt("IBosonMetaTransactionsHandler", protocolDiamondAddress);
  const configHandler = await getContractAt("IBosonConfigHandler", protocolDiamondAddress);
  const ERC165Facet = await getContractAt("ERC165Facet", protocolDiamondAddress);
  const protocolInitializationHandler = await getContractAt(
    "IBosonProtocolInitializationHandler",
    protocolDiamondAddress
  );

  // create mock token for auth - only if not provided
  const authTokenContract = await deployMockTokens(["Foreign721"])[0];
  configHandler.connect(deployer).setAuthTokenContract(AuthTokenType.Lens, await authTokenContract.getAddress());

  // create fresh mock tokens for offers since deploySuite doesn't receive any parameters
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
      protocolInitializationHandler,
    },
    mockContracts: {
      mockAuthERC721Contract: authTokenContract,
      mockToken,
      mockConditionalToken,
      mockTwinTokens,
      mockTwin20,
      mockTwin1155,
    },
    accessController,
  };
}

// upgrade the suite to new version and returns handlers with upgraded interfaces
// upgradedInterfaces is object { handlerName : "interfaceName"}
async function upgradeSuite(protocolDiamondAddress, upgradedInterfaces, overrideFacetConfig) {
  if (!versionTags) {
    throw new Error("Version tags not cached");
  }
  const { newVersion: tag, upgradeScript: scriptsTag, updateDomain } = versionTags;

  shell.exec(`rm -rf contracts/*`);
  shell.exec(`rm -rf scripts/*`);

  if (scriptsTag) {
    console.log(`Checking out scripts on version ${scriptsTag}`);
    shell.exec(`git checkout ${scriptsTag} scripts`);
  } else {
    console.log(`Checking out latest scripts`);
    shell.exec(`git checkout HEAD scripts`);
  }

  if (tag) {
    // checkout the new tag
    console.log(`Checking out version ${tag}`);
    shell.exec(`git checkout ${tag} contracts`);
  } else {
    // if tag was not created yet, use the latest code
    console.log(`Checking out latest code`);
    shell.exec(`git checkout HEAD contracts`);
  }

  if (updateDomain) {
    console.log(`Updating the domain definitions to ${tag || "HEAD"}`);
    const filesToUpdate = updateDomain.map((file) => `scripts/domain/${file}.js`).join(" ");
    shell.exec(`git checkout ${tag || "HEAD"} ${filesToUpdate}`);
  }

  if (!facets) facets = await getFacets();

  let facetConfig = facets.upgrade[tag] || facets.upgrade["latest"];
  if (overrideFacetConfig) {
    facetConfig = _.merge(facetConfig, overrideFacetConfig);
  }

  // compile new contracts
  await hre.run("compile");
  await hre.run("upgrade-facets", {
    env: "upgrade-test",
    facetConfig: JSON.stringify(facetConfig),
  });

  // Cast to updated interface
  let newHandlers = {};
  for (const [handlerName, interfaceName] of Object.entries(upgradedInterfaces)) {
    newHandlers[handlerName] = await getContractAt(interfaceName, protocolDiamondAddress);
  }

  return newHandlers;
}

// upgrade the clients to new version
async function upgradeClients() {
  // Upgrade Clients
  shell.exec(`git checkout HEAD scripts`);
  const tag = versionTags.newVersion;

  // checkout the new tag
  shell.exec(`rm -rf contracts/*`);
  console.log(`Checking out version ${tag}`);
  shell.exec(`git checkout ${tag} contracts`);

  await hre.run("compile");
  // Mock forwarder to test metatx
  const MockForwarder = await getContractFactory("MockForwarder");

  const forwarder = await MockForwarder.deploy();

  const clientConfig = {
    META_TRANSACTION_FORWARDER: {
      hardhat: await forwarder.getAddress(),
    },
  };

  // Upgrade clients
  await hre.run("upgrade-clients", {
    env: "upgrade-test",
    clientConfig: JSON.stringify(clientConfig),
    newVersion: tag.replace("v", ""),
  });

  return forwarder;
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
  { mockToken, mockConditionalToken, mockAuthERC721Contract, mockTwinTokens, mockTwin20, mockTwin1155 },
  isBefore = false
) {
  let DRs = [];
  let sellers = [];
  let buyers = [];
  let agents = [];
  let royaltyRecipients = [];
  let offers = [];
  let groups = [];
  let twins = [];
  let exchanges = [];
  let bundles = [];
  let bosonVouchers = [];

  const entityType = {
    SELLER: 0,
    DR: 1,
    AGENT: 2,
    BUYER: 3,
    ROYALTY_RECIPIENT: 4,
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
    entityType.ROYALTY_RECIPIENT, // For next upgrade, it might make sense to move royalty recipients right after corresponding sellers to ensure correct account ids in tests
    entityType.ROYALTY_RECIPIENT,
    entityType.ROYALTY_RECIPIENT,
  ];

  let nextAccountId = Number(await accountHandler.getNextAccountId());
  for (const entity of entities) {
    const wallet = Wallet.createRandom();
    const connectedWallet = wallet.connect(provider);
    //Fund the new wallet
    let tx = {
      to: await connectedWallet.getAddress(),
      // Convert currency unit from ether to wei
      value: parseEther("10"),
    };
    await deployer.sendTransaction(tx);
    // create entities
    switch (entity) {
      case entityType.DR: {
        const clerkAddress = ZeroAddress;

        const disputeResolver = mockDisputeResolver(
          await wallet.getAddress(),
          await wallet.getAddress(),
          clerkAddress,
          await wallet.getAddress(),
          true,
          true
        );

        const disputeResolverFees = [
          new DisputeResolverFee(ZeroAddress, "Native", "0"),
          new DisputeResolverFee(await mockToken.getAddress(), "MockToken", "0"),
        ];
        const sellerAllowList = [];
        disputeResolver.id = nextAccountId.toString();

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

        break;
      }

      case entityType.SELLER: {
        const clerkAddress = ZeroAddress;
        const seller = mockSeller(wallet.address, wallet.address, clerkAddress, wallet.address, true);
        const id = (seller.id = nextAccountId.toString());

        let authToken;

        // randomly decide if auth token is used or not
        if (Math.random() > 0.5) {
          // no auth token
          authToken = mockAuthToken();
        } else {
          // use auth token
          const tokenId = 101 * id;
          seller.admin = ZeroAddress;
          await mockAuthERC721Contract.connect(deployer).mint(await connectedWallet.getAddress(), tokenId);
          authToken = new AuthToken(tokenId.toString(), AuthTokenType.Lens);
        }

        // set unique new voucherInitValues
        const voucherInitValues = new VoucherInitValues(`http://seller${id}.com/uri`, id * 10, ZeroHash);
        const tx = await accountHandler.connect(connectedWallet).createSeller(seller, authToken, voucherInitValues);

        const receipt = await tx.wait();
        const [, , voucherContractAddress] = receipt.logs.find((e) => e?.fragment?.name === "SellerCreated").args;

        sellers.push({
          wallet: connectedWallet,
          id,
          seller,
          authToken,
          voucherInitValues,
          offerIds: [],
          voucherContractAddress,
        });

        const bosonVoucher = await getContractAt("BosonVoucher", voucherContractAddress);
        bosonVouchers.push(bosonVoucher);

        // mint mock token to sellers just in case they need them
        await mockToken.connect(deployer).mint(await connectedWallet.getAddress(), "10000000000");
        await mockToken.connect(connectedWallet).approve(protocolDiamondAddress, "10000000000");

        break;
      }
      case entityType.AGENT: {
        const agent = mockAgent(await wallet.getAddress());

        await accountHandler.connect(connectedWallet).createAgent(agent);

        agent.id = nextAccountId.toString();
        agents.push({ wallet: connectedWallet, id: agent.id, agent });
        break;
      }
      case entityType.BUYER: {
        // no need to explicitly create buyer, since it's done automatically during commitToOffer
        const buyer = mockBuyer(await wallet.getAddress());
        buyer.id = nextAccountId.toString();
        buyers.push({ wallet: connectedWallet, id: buyer.id, buyer });

        // mint them conditional token in case they need it
        await mockConditionalToken.connect(deployer).mint(await wallet.getAddress(), "10");

        break;
      }
      case entityType.ROYALTY_RECIPIENT: {
        // Just a placeholder for now
        const id = nextAccountId.toString();
        royaltyRecipients.push({ wallet: connectedWallet, id: id });
        break;
      }
    }

    nextAccountId++;
  }

  // Make explicit allowed sellers list for some DRs
  const sellerIds = sellers.map((s) => s.seller.id);
  for (let i = 0; i < DRs.length; i = i + 2) {
    const DR = DRs[i];
    DR.sellerAllowList = sellerIds;
    await accountHandler.connect(DR.wallet).addSellersToAllowList(DR.disputeResolver.id, sellerIds);
  }

  // create offers - first seller has 5 offers, second 4, third 3 etc
  let offerId = Number(await offerHandler.getNextOfferId());
  for (let i = 0; i < sellers.length; i++) {
    for (let j = i; j >= 0; j--) {
      // Mock offer, offerDates and offerDurations
      const { offer, offerDates, offerDurations } = await mockOffer({
        refreshModule: true,
        legacyOffer: isBefore,
      });

      // Set unique offer properties based on offer id
      offer.id = `${offerId}`;
      offer.sellerId = sellers[j].seller.id;
      offer.price = `${offerId * 1000}`;
      offer.sellerDeposit = `${offerId * 100}`;
      offer.buyerCancelPenalty = `${offerId * 50}`;
      offer.quantityAvailable = `${(offerId + 1) * 10}`;

      // Default offer is in native token. Change every other to mock token
      if (offerId % 2 == 0) {
        offer.exchangeToken = await mockToken.getAddress();
      }

      // Set unique offer dates based on offer id
      const now = BigInt(offerDates.validFrom);
      offerDates.validFrom = (now + oneMonth + BigInt(offerId) * 1000n).toString();
      offerDates.validUntil = (now + oneMonth * 6n * BigInt(offerId) + 1n).toString();

      // Set unique offerDurations based on offer id
      offerDurations.disputePeriod = `${(offerId + 1) * Number(oneMonth)}`;
      offerDurations.voucherValid = `${(offerId + 1) * Number(oneMonth)}`;
      offerDurations.resolutionPeriod = `${(offerId + 1) * Number(oneDay) + Number(oneWeek)}`;

      // choose one DR and agent
      const disputeResolverId = DRs[offerId % 3].disputeResolver.id;
      const drParams = {
        disputeResolverId: disputeResolverId,
        mutualizerAddress: ZeroAddress,
      };
      const agentId = agents[offerId % 2].agent.id;
      const offerFeeLimit = MaxUint256; // unlimited offer fee to not affect the tests

      const royaltyInfo = [
        {
          bps: [`${sellers[j].voucherInitValues.royaltyPercentage}`],
          recipients: [ZeroAddress],
        },
      ];

      offer.royaltyInfo = royaltyInfo;
      // create an offer
      if (isBefore) {
        await offerHandler
          .connect(sellers[j].wallet)
          .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId, offerFeeLimit);
      } else {
        await offerHandler
          .connect(sellers[j].wallet)
          .createOffer(offer, offerDates, offerDurations, drParams, agentId, offerFeeLimit);
      }

      offers.push({ offer, offerDates, offerDurations, drParams, agentId, royaltyInfo });
      sellers[j].offerIds.push(offerId);

      // Deposit seller funds so the commit will succeed
      const sellerPool = BigInt(offer.quantityAvailable) * BigInt(offer.price);
      const msgValue = offer.exchangeToken == ZeroAddress ? sellerPool : "0";
      await fundsHandler
        .connect(sellers[j].wallet)
        .depositFunds(sellers[j].seller.id, offer.exchangeToken, sellerPool, { value: msgValue });

      offerId++;
    }
  }

  // group some offers
  let groupId = Number(await groupHandler.getNextGroupId());
  for (let i = 0; i < sellers.length; i = i + 2) {
    const seller = sellers[i];
    const { offerIds } = seller;
    const group = new Group(groupId, seller.seller.id, offerIds); // group all seller's offers
    const condition = mockCondition({
      tokenAddress: await mockConditionalToken.getAddress(),
      maxCommits: "10",
    });
    await groupHandler.connect(seller.wallet).createGroup(group, condition);

    groups.push(group);
    for (const offerId of offerIds) {
      const offer = offers.find((o) => o.offer.id == offerId);
      offer.groupId = groupId;
    }

    groupId++;
  }

  if (twinHandler) {
    // create some twins and bundles
    let twinId = Number(await twinHandler.getNextTwinId());
    let bundleId = Number(await bundleHandler.getNextBundleId());
    for (let i = 1; i < sellers.length; i = i + 2) {
      const seller = sellers[i];
      const sellerId = seller.id;
      let twinIds = []; // used for bundle

      // non fungible token
      await mockTwinTokens[0].connect(seller.wallet).setApprovalForAll(protocolDiamondAddress, true);
      await mockTwinTokens[1].connect(seller.wallet).setApprovalForAll(protocolDiamondAddress, true);

      // create multiple ranges
      const twin721 = mockTwin(ZeroAddress, TokenType.NonFungibleToken);
      twin721.amount = "0";

      // min supply available for twin721 is the total amount to cover all offers bundled
      const minSupplyAvailable = offers
        .map((o) => o.offer)
        .filter((o) => seller.offerIds.includes(Number(o.id)))
        .reduce((acc, o) => acc + Number(o.quantityAvailable), 0);

      for (let j = 0; j < 3; j++) {
        twin721.tokenId = `${sellerId * 1000000 + j * 100000}`;
        twin721.supplyAvailable = minSupplyAvailable;
        twin721.tokenAddress = await mockTwinTokens[j % 2].getAddress(); // oscilate between twins
        twin721.id = twinId;

        await twinHandler.connect(seller.wallet).createTwin(twin721);

        twins.push(twin721);
        twinIds.push(twinId);

        twinId++;
      }

      // fungible
      const twin20 = mockTwin(await mockTwin20.getAddress(), TokenType.FungibleToken);
      twin20.id = twinId;
      twin20.amount = sellerId;
      twin20.supplyAvailable = twin20.amount * 100000000;

      await mockTwin20.connect(seller.wallet).approve(protocolDiamondAddress, twin20.supplyAvailable);

      // mint tokens to be transferred on redeem
      await mockTwin20.connect(seller.wallet).mint(seller.wallet, twin20.supplyAvailable * twin20.amount);
      await twinHandler.connect(seller.wallet).createTwin(twin20);

      twins.push(twin20);
      twinIds.push(twinId);
      twinId++;

      // multitoken twin
      const twin1155 = mockTwin(await mockTwin1155.getAddress(), TokenType.MultiToken);
      twin1155.id = twinId;

      await mockTwin1155.connect(seller.wallet).setApprovalForAll(protocolDiamondAddress, true);
      for (let j = 0; j < 3; j++) {
        twin1155.tokenId = `${j * 30000 + sellerId * 300}`;
        twin1155.amount = sellerId + j;
        twin1155.supplyAvailable = `${300000 * (sellerId + 1)}`;
        twin1155.id = twinId;

        // mint tokens to be transferred on redeem
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
  }

  // commit to some offers: first buyer commit to 1 offer, second to 2, third to 3 etc
  await setNextBlockTimestamp(Number(offers[offers.length - 1].offerDates.validFrom)); // When latest offer is valid, also other offers are valid
  let exchangeId = Number(await exchangeHandler.getNextExchangeId());
  for (let i = 0; i < buyers.length; i++) {
    for (let j = i; j < buyers.length; j++) {
      const { offer, groupId } = offers[i + j]; // some offers will be picked multiple times, some never.
      const offerPrice = offer.price;
      const buyerWallet = buyers[j].wallet;

      let msgValue;
      if (offer.exchangeToken == ZeroAddress) {
        msgValue = offerPrice;
      } else {
        // approve token transfer
        msgValue = 0;
        await mockToken.connect(buyerWallet).approve(protocolDiamondAddress, offerPrice);
        await mockToken.connect(deployer).mint(await buyerWallet.getAddress(), offerPrice);
      }

      if (groupId) {
        // get condition
        let [, , condition] = await groupHandler.getGroup(groupId);
        decache("../../scripts/domain/Condition.js");
        Condition = require("../../scripts/domain/Condition.js");
        condition = Condition.fromStruct(condition);

        // commit to conditional offer
        await exchangeHandler
          .connect(buyerWallet)
          .commitToConditionalOffer(await buyerWallet.getAddress(), offer.id, condition.minTokenId, {
            value: msgValue,
          });
      } else {
        await exchangeHandler
          .connect(buyerWallet)
          .commitToOffer(await buyerWallet.getAddress(), offer.id, { value: msgValue });
      }

      exchanges.push({ exchangeId: exchangeId, offerId: offer.id, buyerIndex: j, sellerId: offer.sellerId });
      exchangeId++;
    }
  }

  // redeem some vouchers #4
  for (const id of [2, 5, 11, 8]) {
    const exchange = exchanges[id - 1];

    // If exchange has twins, mint them so the transfer can succeed
    const offer = offers.find((o) => o.offer.id == exchange.offerId);
    const seller = sellers.find((s) => s.seller.id == offer.offer.sellerId);
    if (twinHandler) {
      const bundle = bundles.find((b) => b.sellerId == seller.id);
      if (!bundle) continue; // no twins for this seller
      const twinsIds = bundle.twinIds;
      for (const twinId of twinsIds) {
        const [, twin] = await twinHandler.getTwin(twinId);
        if (twin.tokenType == TokenType.NonFungibleToken) {
          // Foreign721.mint(tokenId, supply) mints to msg.sender
          const tokenId = BigInt(twin.tokenId) + BigInt(twin.supplyAvailable) - 1n;
          await mockTwinTokens[0].connect(seller.wallet).mint(tokenId, 1);
          await mockTwinTokens[1].connect(seller.wallet).mint(tokenId, 1);
        } else if (twin.tokenType == TokenType.MultiToken) {
          await mockTwin1155.connect(seller.wallet).mint(twin.tokenId, twin.supplyAvailable);
        }
      }
    }

    await exchangeHandler
      .connect(buyers[exchange.buyerIndex].wallet)
      .redeemVoucher(exchange.exchangeId, { gasLimit: 10000000 });
  }

  // cancel some vouchers #3
  for (const id of [10, 3, 13]) {
    const exchange = exchanges[id - 1];
    await exchangeHandler.connect(buyers[exchange.buyerIndex].wallet).cancelVoucher(exchange.exchangeId);
  }

  // revoke some vouchers #2
  for (const id of [4, 6]) {
    const exchange = exchanges[id - 1];
    const offer = offers.find((o) => o.offer.id == exchange.offerId);
    const seller = sellers.find((s) => s.seller.id == offer.offer.sellerId);
    await exchangeHandler.connect(seller.wallet).revokeVoucher(exchange.exchangeId);
  }

  // raise dispute on some exchanges #1
  const id = 5; // must be one of redeemed ones
  const exchange = exchanges[id - 1];
  const offer = offers.find((o) => o.offer.id == exchange.offerId);
  const seller = sellers.find((s) => s.seller.id == offer.offer.sellerId);

  await disputeHandler.connect(buyers[exchange.buyerIndex].wallet).raiseDispute(exchange.exchangeId);
  await disputeHandler.connect(seller.wallet).extendDisputeTimeout(exchange.exchangeId, 4000000000n);

  return { DRs, sellers, buyers, agents, offers, exchanges, bundles, groups, twins, bosonVouchers, royaltyRecipients };
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
  { DRs, sellers, buyers, agents, offers, exchanges, bundles, groups, twins, royaltyRecipients },
  { isBefore, skipFacets } = { isBefore: false, skipFacets: [] }
) {
  rando = (await getSigners())[10]; // random account making the calls

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
    protocolEntitiesPrivateContractState,
  ] = await Promise.all([
    getAccountContractState(accountHandler, { DRs, sellers, buyers, agents }, isBefore),
    getOfferContractState(offerHandler, offers),
    getExchangeContractState(exchangeHandler, exchanges),
    getBundleContractState(bundleHandler, bundles),
    getConfigContractState(configHandler, isBefore),
    getDisputeContractState(disputeHandler, exchanges),
    getFundsContractState(fundsHandler, { DRs, sellers, buyers, agents }, isBefore),
    getGroupContractState(groupHandler, groups),
    getTwinContractState(twinHandler, twins),
    getMetaTxContractState(),
    getMetaTxPrivateContractState(protocolDiamondAddress, skipFacets),
    getProtocolStatusPrivateContractState(protocolDiamondAddress, skipFacets),
    getProtocolLookupsPrivateContractState(
      protocolDiamondAddress,
      { mockToken, mockTwinTokens },
      { sellers, DRs, agents, buyers, offers, groups, twins, royaltyRecipients },
      groupHandler
    ),
    getProtocolEntitiesPrivateContractState(protocolDiamondAddress, { exchanges, royaltyRecipients }),
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
    protocolEntitiesPrivateContractState,
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
  let sellersCollections = [];

  // Query even the ids where it's not expected to get the entity
  for (const account of accounts) {
    const id = account.id;

    DRsState.push(await getDisputeResolver(accountHandlerRando, id, { getBy: "id" }));
    sellerState.push(await getSeller(accountHandlerRando, id, { getBy: "id" }));
    agentsState.push(await getAgent(accountHandlerRando, id));
    buyersState.push(await getBuyer(accountHandlerRando, id));
    sellersCollections.push(await accountHandlerRando.getSellersCollections(id));

    for (const account2 of accounts) {
      const id2 = account2.id;
      allowedSellersState.push(await accountHandlerRando.areSellersAllowed(id2, [id]));
    }
  }

  for (const seller of sellers) {
    const sellerAddress = seller.wallet;
    const sellerAuthToken = seller.authToken;

    sellerByAddressState.push(await getSeller(accountHandlerRando, sellerAddress, { getBy: "address" }));
    sellerByAddressState.push(await getSeller(accountHandlerRando, sellerAuthToken, { getBy: "authToken" }));
    DRbyAddressState.push(await getDisputeResolver(accountHandlerRando, sellerAddress, { getBy: "address" }));
  }

  const otherAccounts = [...DRs, ...agents, ...buyers];

  for (const account of otherAccounts) {
    const accountAddress = account.wallet;

    sellerByAddressState.push(await getSeller(accountHandlerRando, accountAddress, { getBy: "address" }));
    DRbyAddressState.push(await getDisputeResolver(accountHandlerRando, accountAddress, { getBy: "address" }));
  }

  nextAccountId = (await accountHandlerRando.getNextAccountId()).toString();

  return {
    DRsState,
    sellerState,
    buyersState,
    sellerByAddressState,
    sellerByAuthTokenState,
    agentsState,
    DRbyAddressState,
    nextAccountId,
    sellersCollections,
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

    let [exist, offerStruct, offerDates, offerDurations, disputeResolutionTerms, offerFees] = singleOffersState;
    decache("../../scripts/domain/Offer.js");
    Offer = require("../../scripts/domain/Offer.js");

    offerStruct = Offer.fromStruct(offerStruct);
    offerDates = OfferDates.fromStruct(offerDates);
    offerDurations = OfferDurations.fromStruct(offerDurations);
    disputeResolutionTerms = DisputeResolutionTerms.fromStruct(disputeResolutionTerms);
    offerFees = OfferFees.fromStruct(offerFees);

    offersState.push([exist, offerStruct, offerDates, offerDurations, disputeResolutionTerms, offerFees]);
    isOfferVoidedState.push(singleIsOfferVoidedState);
    agentIdByOfferState.push(singleAgentIdByOfferState.toString());
  }

  let nextOfferId = (await offerHandlerRando.getNextOfferId()).toString();

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

    let [exists, exchangeState] = singleExchangesState;
    exchangeState = Exchange.fromStruct(exchangeState);

    exchangesState.push([exists, exchangeState]);
    exchangeStateState.push(singleExchangeStateState);
    isExchangeFinalizedState.push(singleIsExchangeFinalizedState);

    try {
      const receipt = await exchangeHandlerRando.getReceipt(id);
      receiptsState.push(Receipt.fromStruct(receipt));
    } catch {
      receiptsState.push(["NOT_FINALIZED"]);
    }
  }

  let nextExchangeId = (await exchangeHandlerRando.getNextExchangeId()).toString();
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
    maxRoyaltyPercentage,
    maxResolutionPeriod,
    minDisputePeriod,
    accessControllerAddress,
    maxPremintedVouchers,
    minResolutionPeriod,
  ] = await Promise.all([
    configHandlerRando.getTokenAddress(),
    configHandlerRando.getTreasuryAddress(),
    configHandlerRando.getVoucherBeaconAddress(),
    configHandlerRando.getBeaconProxyAddress(),
    configHandlerRando.getProtocolFeePercentage(),
    configHandlerRando.getProtocolFeeFlatBoson(),
    Promise.resolve(0n),
    Promise.resolve(0n),
    Promise.resolve(0n),
    Promise.resolve(0n),
    Promise.resolve(0n),
    Promise.resolve(0n),
    Promise.resolve(0n),
    Promise.resolve(0n),
    configHandlerRando.getMaxTotalOfferFeePercentage(),
    Promise.resolve(0n),
    configHandlerRando.getBuyerEscalationDepositPercentage(),
    configHandlerRando.getAuthTokenContract(AuthTokenType.None),
    configHandlerRando.getAuthTokenContract(AuthTokenType.Custom),
    configHandlerRando.getAuthTokenContract(AuthTokenType.Lens),
    configHandlerRando.getAuthTokenContract(AuthTokenType.ENS),
    Promise.resolve(0n),
    configHandlerRando.getMaxRoyaltyPercentage(),
    configHandlerRando.getMaxResolutionPeriod(),
    configHandlerRando.getMinDisputePeriod(),
    configHandlerRando.getAccessControllerAddress(),
    Promise.resolve(0n),
    configHandlerRando.getMinResolutionPeriod(),
  ]);

  return {
    tokenAddress,
    treasuryAddress,
    voucherBeaconAddress,
    beaconProxyAddress,
    protocolFeePercentage: protocolFeePercentage.toString(),
    protocolFeeFlatBoson: protocolFeeFlatBoson.toString(),
    maxOffersPerBatch: maxOffersPerBatch.toString(),
    maxOffersPerGroup: maxOffersPerGroup.toString(),
    maxTwinsPerBundle: maxTwinsPerBundle.toString(),
    maxOffersPerBundle: maxOffersPerBundle.toString(),
    maxTokensPerWithdrawal: maxTokensPerWithdrawal.toString(),
    maxFeesPerDisputeResolver: maxFeesPerDisputeResolver.toString(),
    maxEscalationResponsePeriod: maxEscalationResponsePeriod.toString(),
    maxDisputesPerBatch: maxDisputesPerBatch.toString(),
    maxTotalOfferFeePercentage: maxTotalOfferFeePercentage.toString(),
    maxAllowedSellers: maxAllowedSellers.toString(),
    buyerEscalationDepositPercentage: buyerEscalationDepositPercentage.toString(),
    authTokenContractNone,
    authTokenContractCustom,
    authTokenContractLens,
    authTokenContractENS,
    maxExchangesPerBatch: maxExchangesPerBatch.toString(),
    maxRoyaltyPercentage: maxRoyaltyPercentage.toString(),
    maxResolutionPeriod: maxResolutionPeriod.toString(),
    minDisputePeriod: minDisputePeriod.toString(),
    accessControllerAddress,
    maxPremintedVouchers: maxPremintedVouchers.toString(),
    minResolutionPeriod: minResolutionPeriod.toString(),
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
  const fundsState = await Promise.all(accountIds.map((id) => fundsHandlerRando.getAllAvailableFunds(id)));

  return { fundsState };
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

async function getMetaTxPrivateContractState(protocolDiamondAddress, skipFacets = []) {
  /*
          ProtocolMetaTxInfo storage layout
      
          #0 [ currentSenderAddress + isMetaTransaction ]
          #1 [ domain separator ]
          #2 [ ] // placeholder for usedNonce
          #3 [ cachedChainId ]
          #4 [ ] // placeholder for inputType
          #5 [ ] // placeholder for hashInfo
          #6 [ ] // placeholder for isAllowlisted
          */

  // starting slot
  const metaTxStorageSlot = keccak256(toUtf8Bytes("boson.protocol.metaTransactions"));
  const metaTxStorageSlotNumber = BigInt(metaTxStorageSlot);

  // current sender address + isMetaTransaction (they are packed since they are shorter than one slot)
  // should be always be 0x
  const inTransactionInfo = await getStorageAt(protocolDiamondAddress, metaTxStorageSlotNumber + 0n);

  // domain separator
  const domainSeparator = await getStorageAt(protocolDiamondAddress, metaTxStorageSlotNumber + 1n);

  // cached chain id
  const cachedChainId = await getStorageAt(protocolDiamondAddress, metaTxStorageSlotNumber + 3n);

  // input type
  const inputTypeKeys = [
    "commitToOffer(address,uint256)",
    "commitToConditionalOffer(address,uint256,uint256)",
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
    const storageSlot = getMappingStoragePosition(metaTxStorageSlotNumber + 4n, inputTypeKey, paddingType.NONE);
    inputTypesState.push(await getStorageAt(protocolDiamondAddress, storageSlot));
  }

  // hashInfo
  const hashInfoTypes = {
    Generic: 0,
    CommitToOffer: 1,
    Exchange: 2,
    Funds: 3,
    CommitToConditionalOffer: 4,
    ResolveDispute: 5,
  };

  const hashInfoState = [];
  for (const hashInfoType of Object.values(hashInfoTypes)) {
    const storageSlot = getMappingStoragePosition(metaTxStorageSlotNumber + 5n, hashInfoType, paddingType.START);
    // get also hashFunction
    hashInfoState.push({
      typeHash: await getStorageAt(protocolDiamondAddress, storageSlot),
      functionPointer: await getStorageAt(protocolDiamondAddress, BigInt(storageSlot) + 1n),
    });
  }
  const isAllowlistedState = {};

  const facets = [
    "AccountHandlerFacet",
    "SellerHandlerFacet",
    "BuyerHandlerFacet",
    "DisputeResolverHandlerFacet",
    "AgentHandlerFacet",
    "BundleHandlerFacet",
    "DisputeHandlerFacet",
    "ExchangeHandlerFacet",
    "FundsHandlerFacet",
    "GroupHandlerFacet",
    "OfferHandlerFacet",
    "TwinHandlerFacet",
    "PauseHandlerFacet",
    "MetaTransactionsHandlerFacet",
    "OrchestrationHandlerFacet1",
    "OrchestrationHandlerFacet2",
    "PriceDiscoveryHandlerFacet",
    "SequentialCommitHandlerFacet",
  ].filter((id) => !skipFacets.includes(id));

  const selectors = await getMetaTransactionsHandlerFacetInitArgs(facets);

  for (const selector of Object.values(selectors)) {
    const storageSlot = getMappingStoragePosition(metaTxStorageSlotNumber + 6n, selector, paddingType.START);
    isAllowlistedState[selector] = await getStorageAt(protocolDiamondAddress, storageSlot);
  }

  return { inTransactionInfo, domainSeparator, cachedChainId, inputTypesState, hashInfoState, isAllowlistedState };
}

async function getProtocolStatusPrivateContractState(protocolDiamondAddress, ignoreInterfaceIds = []) {
  /*
          ProtocolStatus storage layout
      
          #0 [ pauseScenario ]
          #1 [ reentrancyStatus ]
          #2 [ ] // placeholder for initializedInterfaces
          #3 [ ] // placeholder for initializedVersions
          #4 [ version ] - not here as should be updated one very upgrade
          #5 [ incomingVoucherId ] // should always be empty
          #6 [ incomingVoucherCloneAddress ] // should always be empty
          */

  // starting slot
  const protocolStatusStorageSlot = keccak256(toUtf8Bytes("boson.protocol.initializers"));
  const protocolStatusStorageSlotNumber = BigInt(protocolStatusStorageSlot);

  // pause scenario
  const pauseScenario = await getStorageAt(protocolDiamondAddress, protocolStatusStorageSlotNumber + 0n);

  // reentrancy status
  // default: NOT_ENTERED = 1
  const reentrancyStatus = await getStorageAt(protocolDiamondAddress, protocolStatusStorageSlotNumber + 1n);

  // initializedInterfaces
  if (!preUpgradeInterfaceIds) {
    // Only interfaces registered before upgrade are relevant for tests, so we load them only once
    preUpgradeInterfaceIds = await getInterfaceIds(false);

    ignoreInterfaceIds.forEach((id) => {
      delete preUpgradeInterfaceIds[id];
    });
  }

  // initializedInterfaces
  const initializedInterfacesState = [];
  for (const interfaceId of Object.values(preUpgradeInterfaceIds)) {
    const storageSlot = getMappingStoragePosition(protocolStatusStorageSlotNumber + 2n, interfaceId, paddingType.END);
    initializedInterfacesState.push(await getStorageAt(protocolDiamondAddress, storageSlot));
  }

  if (!preUpgradeVersions) {
    preUpgradeVersions = getVersionsBeforeTarget(Object.keys(facets.upgrade), versionTags.newVersion);
  }

  // initializedVersions
  const initializedVersionsState = [];
  for (const version of preUpgradeVersions) {
    const storageSlot = getMappingStoragePosition(protocolStatusStorageSlotNumber + 3n, version, paddingType.END);
    initializedVersionsState.push(await getStorageAt(protocolDiamondAddress, storageSlot));
  }

  // incomingVoucherId
  const incomingVoucherId = await getStorageAt(protocolDiamondAddress, protocolStatusStorageSlotNumber + 5n);
  expect(incomingVoucherId).to.equal(ZeroHash);

  // incomingVoucherCloneAddress
  const incomingVoucherCloneAddress = await getStorageAt(protocolDiamondAddress, protocolStatusStorageSlotNumber + 6n);
  expect(incomingVoucherId).to.equal(ZeroHash);

  return {
    pauseScenario,
    reentrancyStatus,
    initializedInterfacesState,
    initializedVersionsState,
    incomingVoucherId,
    incomingVoucherCloneAddress,
  };
}

async function getProtocolLookupsPrivateContractState(
  protocolDiamondAddress,
  { mockToken, mockTwinTokens },
  { sellers, DRs, agents, buyers, offers, groups, twins, royaltyRecipients },
  groupHandler
) {
  /*
        ProtocolLookups storage layout
    
        Variables marked with X have an external getter and are not handled here
        #0  [ ] // placeholder for exchangeIdsByOffer
        #1  [X] // placeholder for bundleIdByOffer
        #2  [X] // placeholder for bundleIdByTwin
        #3  [ ] // placeholder for groupIdByOffer
        #4  [X] // placeholder for agentIdByOffer
        #5  [X] // placeholder for sellerIdByAssistant
        #6  [X] // placeholder for sellerIdByAdmin
        #7  [X] // placeholder for sellerIdByClerk
        #8  [ ] // placeholder for buyerIdByWallet
        #9  [X] // placeholder for disputeResolverIdByAssistant
        #10 [X] // placeholder for disputeResolverIdByAdmin
        #11 [X] // placeholder for disputeResolverIdByClerk
        #12 [ ] // placeholder for disputeResolverFeeTokenIndex
        #13 [ ] // placeholder for agentIdByWallet
        #14 [X] // placeholder for availableFunds
        #15 [X] // placeholder for tokenList
        #16 [ ] // placeholder for tokenIndexByAccount
        #17 [X] // placeholder for cloneAddress
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
        #32 [ ] // placeholder for rangeIdByTwin
        #33 [ ] // placeholder for conditionalCommitsByTokenId
        #34 [X] // placeholder for additionalCollections
        #35 [ ] // placeholder for sellerSalt
        #36 [ ] // placeholder for isUsedSellerSalt
        #37 [X] // placeholder for royaltyRecipientsBySeller
        #38 [ ] // placeholder for royaltyRecipientIndexBySellerAndRecipient
        #39 [ ] // placeholder for royaltyRecipientIdByWallet
        */

  // starting slot
  const protocolLookupsSlot = keccak256(toUtf8Bytes("boson.protocol.lookups"));
  const protocolLookupsSlotNumber = BigInt(protocolLookupsSlot);

  // exchangeIdsByOffer and groupIdByOffer
  let exchangeIdsByOfferState = [];
  let groupIdByOfferState = [];
  for (const offer of offers) {
    const id = Number(offer.offer.id);
    // exchangeIdsByOffer
    let exchangeIdsByOffer = [];
    const arraySlot = getMappingStoragePosition(protocolLookupsSlotNumber + 0n, id, paddingType.START);
    const arrayLength = await getStorageAt(protocolDiamondAddress, arraySlot);
    const arrayStart = keccak256(arraySlot);
    for (let i = 0n; i < arrayLength; i++) {
      exchangeIdsByOffer.push(await getStorageAt(protocolDiamondAddress, BigInt(arrayStart) + i));
    }
    exchangeIdsByOfferState.push(exchangeIdsByOffer);

    // groupIdByOffer
    groupIdByOfferState.push(
      await getStorageAt(
        protocolDiamondAddress,
        getMappingStoragePosition(protocolLookupsSlotNumber + 3n, id, paddingType.START)
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
        getMappingStoragePosition(protocolLookupsSlotNumber + 8n, accountAddress, paddingType.START)
      )
    );

    // agentIdByWallet
    agentIdByWallet.push(
      await getStorageAt(
        protocolDiamondAddress,
        getMappingStoragePosition(protocolLookupsSlotNumber + 13n, accountAddress, paddingType.START)
      )
    );

    // conditionalCommitsByAddress
    const firstMappingStorageSlot = BigInt(
      getMappingStoragePosition(protocolLookupsSlotNumber + 19n, accountAddress, paddingType.START)
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

  // disputeResolverFeeTokenIndex, tokenIndexByAccount, voucherCount
  let disputeResolverFeeTokenIndex = [];
  let tokenIndexByAccount = [];
  let voucherCount = [];
  let cloneAddress = [];

  // all account ids
  const accountIds = accounts.map((account) => Number(account.id));

  // loop over all ids even where no data is expected
  for (const id of accountIds) {
    // disputeResolverFeeTokenIndex
    let firstMappingStorageSlot = BigInt(
      getMappingStoragePosition(protocolLookupsSlotNumber + 12n, id, paddingType.START)
    );
    disputeResolverFeeTokenIndex.push({
      native: await getStorageAt(
        protocolDiamondAddress,
        getMappingStoragePosition(firstMappingStorageSlot, ZeroAddress, paddingType.START)
      ),
      mockToken: await getStorageAt(
        protocolDiamondAddress,
        getMappingStoragePosition(firstMappingStorageSlot, await mockToken.getAddress(), paddingType.START)
      ),
    });

    // tokenIndexByAccount
    firstMappingStorageSlot = BigInt(getMappingStoragePosition(protocolLookupsSlotNumber + 16n, id, paddingType.START));
    tokenIndexByAccount.push({
      native: await getStorageAt(
        protocolDiamondAddress,
        getMappingStoragePosition(firstMappingStorageSlot, ZeroAddress, paddingType.START)
      ),
      mockToken: await getStorageAt(
        protocolDiamondAddress,
        getMappingStoragePosition(firstMappingStorageSlot, await mockToken.getAddress(), paddingType.START)
      ),
    });

    // cloneAddress
    cloneAddress.push(
      await getStorageAt(
        protocolDiamondAddress,
        getMappingStoragePosition(protocolLookupsSlotNumber + 17n, id, paddingType.START)
      )
    );

    // voucherCount
    voucherCount.push(
      await getStorageAt(
        protocolDiamondAddress,
        getMappingStoragePosition(protocolLookupsSlotNumber + 18n, id, paddingType.START)
      )
    );
  }

  // twinRangesBySeller
  let twinRangesBySeller = [];
  for (const id of accountIds) {
    const firstMappingStorageSlot = BigInt(
      getMappingStoragePosition(protocolLookupsSlotNumber + 22n, id, paddingType.START)
    );
    let ranges = {};
    for (let mockTwin of mockTwinTokens) {
      ranges[await mockTwin.getAddress()] = [];
      const arraySlot = getMappingStoragePosition(
        firstMappingStorageSlot,
        await mockTwin.getAddress(),
        paddingType.START
      );
      const arrayLength = BigInt(await getStorageAt(protocolDiamondAddress, arraySlot));
      const arrayStart = BigInt(keccak256(arraySlot));
      for (let i = 0n; i < arrayLength * 2n; i = i + 2n) {
        // each BosonTypes.TokenRange has length 2
        ranges[await mockTwin.getAddress()].push({
          start: await getStorageAt(protocolDiamondAddress, arrayStart + i),
          end: await getStorageAt(protocolDiamondAddress, arrayStart + i + 1n),
        });
      }
    }
    twinRangesBySeller.push(ranges);
  }

  // twinIdsByTokenAddressAndBySeller
  let twinIdsByTokenAddressAndBySeller = [];
  for (const id of accountIds) {
    const firstMappingStorageSlot = BigInt(
      getMappingStoragePosition(protocolLookupsSlotNumber + 23n, id, paddingType.START)
    );
    let twinIds = {};
    for (let mockTwin of mockTwinTokens) {
      twinIds[await mockTwin.getAddress()] = [];
      const arraySlot = getMappingStoragePosition(
        firstMappingStorageSlot,
        await mockTwin.getAddress(),
        paddingType.START
      );
      const arrayLength = await getStorageAt(protocolDiamondAddress, arraySlot);
      const arrayStart = BigInt(keccak256(arraySlot));
      for (let i = 0n; i < arrayLength; i++) {
        twinIds[await mockTwin.getAddress()].push(await getStorageAt(protocolDiamondAddress, arrayStart + i));
      }
    }
    twinIdsByTokenAddressAndBySeller.push(twinIds);
  }

  // allowedSellerIndex
  let allowedSellerIndex = [];
  for (const DR of DRs) {
    const firstMappingStorageSlot = BigInt(
      getMappingStoragePosition(protocolLookupsSlotNumber + 26n, BigInt(DR.disputeResolver.id), paddingType.START)
    );
    let sellerStatus = [];
    for (const seller of sellers) {
      sellerStatus.push(
        await getStorageAt(
          protocolDiamondAddress,
          getMappingStoragePosition(firstMappingStorageSlot, BigInt(seller.seller.id), paddingType.START)
        )
      );
    }
    allowedSellerIndex.push(sellerStatus);
  }

  // offerIdIndexByGroup, conditionalCommitsByTokenId
  let offerIdIndexByGroup = [];
  let conditionalCommitsByTokenId = [];
  decache("../../scripts/domain/Condition.js");
  Condition = require("../../scripts/domain/Condition.js");

  for (const group of groups) {
    const id = group.id;

    // offerIdIndexByGroup
    const firstMappingStorageSlot = BigInt(
      getMappingStoragePosition(protocolLookupsSlotNumber + 28n, id, paddingType.START)
    );
    let offerIndices = [];
    for (const offer of offers) {
      const id2 = Number(offer.offer.id);
      offerIndices.push(
        await getStorageAt(
          protocolDiamondAddress,
          getMappingStoragePosition(firstMappingStorageSlot, id2, paddingType.START)
        )
      );
    }
    offerIdIndexByGroup.push(offerIndices);

    // conditionalCommitsByTokenId
    // get condition
    let [, , condition] = await groupHandler.getGroup(id);
    condition = Condition.fromStruct(condition);
    let commitsPerTokenId = [];
    for (let tokenId = condition.minTokenId; tokenId <= condition.maxTokenId; tokenId++) {
      const firstMappingStorageSlot = BigInt(
        getMappingStoragePosition(protocolLookupsSlotNumber + 33n, tokenId, paddingType.START)
      );

      commitsPerTokenId.push(
        await getStorageAt(
          protocolDiamondAddress,
          getMappingStoragePosition(firstMappingStorageSlot, id, paddingType.START)
        )
      );
    }

    conditionalCommitsByTokenId.push(commitsPerTokenId);
  }

  // pendingAddressUpdatesBySeller, pendingAuthTokenUpdatesBySeller, pendingAddressUpdatesByDisputeResolver
  let pendingAddressUpdatesBySeller = [];
  let pendingAuthTokenUpdatesBySeller = [];
  let pendingAddressUpdatesByDisputeResolver = [];

  // Although pending address/auth token update is not yet defined in 2.0.0, we can check that storage slots are empty
  for (const id of accountIds) {
    // pendingAddressUpdatesBySeller
    let structStorageSlot = BigInt(getMappingStoragePosition(protocolLookupsSlotNumber + 29n, id, paddingType.START));
    let structFields = [];
    for (let i = 0n; i < 6n; i++) {
      // BosonTypes.Seller has 7 fields, but `address payable treasury` and `bool active` are packed into one slot
      structFields.push(await getStorageAt(protocolDiamondAddress, structStorageSlot + i));
    }
    const metadataUriLength = BigInt(await getStorageAt(protocolDiamondAddress, structStorageSlot + 6n));
    const metadataUriSlot = BigInt(ethersId(structStorageSlot + 6n));
    const occupiedSlots = metadataUriLength / 32n + 1n;
    const metadataUri = [];
    for (let i = 0n; i < occupiedSlots; i++) {
      metadataUri.push(await getStorageAt(protocolDiamondAddress, metadataUriSlot + i));
    }
    structFields.push(metadataUri);

    pendingAddressUpdatesBySeller.push(structFields);

    // pendingAuthTokenUpdatesBySeller
    structStorageSlot = BigInt(getMappingStoragePosition(protocolLookupsSlotNumber + 30n, id, paddingType.START));
    structFields = [];
    for (let i = 0n; i < 2n; i++) {
      // BosonTypes.AuthToken has 2 fields
      structFields.push(await getStorageAt(protocolDiamondAddress, structStorageSlot + i));
    }
    pendingAuthTokenUpdatesBySeller.push(structFields);

    // pendingAddressUpdatesByDisputeResolver
    structStorageSlot = BigInt(getMappingStoragePosition(protocolLookupsSlotNumber + 31n, id, paddingType.START));
    structFields = [];
    for (let i = 0n; i < 8n; i++) {
      // BosonTypes.DisputeResolver has 8 fields
      structFields.push(await getStorageAt(protocolDiamondAddress, structStorageSlot + i));
    }
    structFields[6] = await getStorageAt(protocolDiamondAddress, ethersId(structStorageSlot + 6n)); // represents field string metadataUri. Technically this value represents the length of the string, but since it should be 0, we don't do further decoding
    pendingAddressUpdatesByDisputeResolver.push(structFields);
  }

  // rangeIdByTwin
  let rangeIdByTwin = [];
  for (const twin of twins) {
    const { id } = twin;
    rangeIdByTwin.push(
      await getStorageAt(
        protocolDiamondAddress,
        getMappingStoragePosition(protocolLookupsSlotNumber + 32n, id, paddingType.START)
      )
    );
  }

  // sellerSalt, isUsedSellerSalt
  let sellerSalt = [];
  let isUsedSellerSalt = {};
  for (const seller of sellers) {
    // sellerSalt
    const { id } = seller;
    const salt = await getStorageAt(
      protocolDiamondAddress,
      getMappingStoragePosition(protocolLookupsSlotNumber + 35n, id, paddingType.START)
    );
    sellerSalt.push(salt);

    // isUsedSellerSalt
    isUsedSellerSalt[salt] = await getStorageAt(
      protocolDiamondAddress,
      getMappingStoragePosition(protocolLookupsSlotNumber + 36n, salt, paddingType.START)
    );
  }

  let royaltyRecipientIndexBySellerAndRecipient = [];
  let royaltyRecipientIdByWallet = [];
  // royaltyRecipientIndexBySellerAndRecipient, royaltyRecipientIdByWallet
  for (const royaltyRecipient of royaltyRecipients) {
    const { wallet: royaltyRecipientWallet } = royaltyRecipient;
    const royaltyRecipientAddress = royaltyRecipientWallet.address;

    // royaltyRecipientIndexBySellerAndRecipient
    const royaltyRecipientIndexRecipient = [];
    for (const seller of sellers) {
      const { id } = seller;
      const firstMappingStorageSlot = await getStorageAt(
        protocolDiamondAddress,
        getMappingStoragePosition(protocolLookupsSlotNumber + 38n, id, paddingType.START)
      );

      royaltyRecipientIndexRecipient.push(
        await getStorageAt(
          protocolDiamondAddress,
          getMappingStoragePosition(firstMappingStorageSlot, royaltyRecipientAddress, paddingType.START)
        )
      );
      royaltyRecipientIndexBySellerAndRecipient.push(royaltyRecipientIndexRecipient);
    }

    // royaltyRecipientIdByWallet
    royaltyRecipientIdByWallet.push(
      getStorageAt(
        protocolDiamondAddress,
        getMappingStoragePosition(protocolLookupsSlotNumber + 39n, royaltyRecipientAddress, paddingType.START)
      )
    );
  }

  return {
    exchangeIdsByOfferState,
    groupIdByOfferState,
    buyerIdByWallet,
    disputeResolverFeeTokenIndex,
    agentIdByWallet,
    tokenIndexByAccount,
    voucherCount,
    cloneAddress,
    conditionalCommitsByAddress,
    twinRangesBySeller,
    twinIdsByTokenAddressAndBySeller,
    allowedSellerIndex,
    offerIdIndexByGroup,
    pendingAddressUpdatesBySeller,
    pendingAuthTokenUpdatesBySeller,
    pendingAddressUpdatesByDisputeResolver,
    rangeIdByTwin,
    conditionalCommitsByTokenId,
    sellerSalt,
    isUsedSellerSalt,
  };
}

async function getProtocolEntitiesPrivateContractState(protocolDiamondAddress, { exchanges, royaltyRecipients }) {
  /*
    ProtocolEntities storage layout

    #0-#18 [X] // placeholders for entites {offers}....{authTokens}
    #19 [ ] // placeholder for exchangeCosts
    #20 [ ] // placeholder for royaltyRecipients
  */

  // starting slot
  const protocolEntitiesStorageSlot = keccak256(toUtf8Bytes("boson.protocol.entities"));
  const protocolEntitiesStorageSlotNumber = BigInt(protocolEntitiesStorageSlot);

  // exchangeCosts
  const exchangeCosts = [];
  for (const exchange of exchanges) {
    let exchangeCostByExchange = [];
    const id = exchange.exchangeId;
    const arraySlot = getMappingStoragePosition(protocolEntitiesStorageSlotNumber + 19n, id, paddingType.START);
    const arrayLength = await getStorageAt(protocolDiamondAddress, arraySlot);
    const arrayStart = BigInt(keccak256(arraySlot));
    const structLength = 5n; // BosonTypes.ExchangeCost has 2 fields
    for (let i = 0n; i < arrayLength; i++) {
      const ExchangeCost = [];
      for (let j = 0n; j < structLength; j++) {
        ExchangeCost.push(await getStorageAt(protocolDiamondAddress, BigInt(arrayStart) + i * structLength + j));
      }
      exchangeCostByExchange.push(ExchangeCost);
    }
    exchangeCosts.push(exchangeCostByExchange);
  }

  // royaltyRecipients
  const royaltyRecipientStructs = [];
  const structLength = 2n; // BosonTypes.RoyaltyRecipient has 2 fields
  for (const royaltyRecipient of royaltyRecipients) {
    const { id } = royaltyRecipient;
    const storageSlot = BigInt(
      getMappingStoragePosition(protocolEntitiesStorageSlotNumber + 20n, id, paddingType.START)
    );
    const royaltyRecipientStruct = [];
    for (let i = 0n; i < structLength; i++) {
      royaltyRecipientStruct.push(await getStorageAt(protocolDiamondAddress, storageSlot + i));
    }

    royaltyRecipientStructs.push(royaltyRecipientStruct);
  }

  return { exchangeCosts, royaltyRecipientStructs };
}

async function getStorageLayout(contractName) {
  const { sourceName } = await hre.artifacts.readArtifact(contractName);
  const buildInfo = await hre.artifacts.getBuildInfo(`${sourceName}:${contractName}`);

  const storage = buildInfo.output?.contracts?.[sourceName]?.[contractName]?.storageLayout?.storage;

  return storage;
}

function compareStorageLayouts(storageBefore, storageAfter, equalCustomTypes, renamedVariables) {
  // All old variables must be present in new layout in the same slots
  // New variables can be added if they don't affect the layout
  let storageOk = true;
  for (const stateVariableBefore of storageBefore) {
    let { label } = stateVariableBefore;
    label = renamedVariables[label] || label;
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
      compareTypes(stateVariableAfter.type, stateVariableBefore.type, equalCustomTypes)
    ) {
      storageOk = false;
      console.error("Storage layout mismatch");
    }
  }

  return storageOk;
}

// Sometimes struct labels change even if the structs are the same
// In those cases, manually add the new label to the equalCustomTypes object
function compareTypes(variableTypeAfter, variableTypeBefore, equalCustomTypes) {
  if (variableTypeBefore == variableTypeAfter) return false;

  for (const [oldLabel, newLabel] of Object.entries(equalCustomTypes)) {
    variableTypeBefore = variableTypeBefore.replaceAll(oldLabel, newLabel);
  }

  return variableTypeAfter != variableTypeBefore;
}

async function populateVoucherContract(
  deployer,
  protocolDiamondAddress,
  { accountHandler, exchangeHandler, offerHandler, fundsHandler, groupHandler },
  { mockToken },
  existingEntities,
  isBefore = false
) {
  let DRs;
  let sellers = [];
  let buyers = [];
  let offers = [];
  let bosonVouchers = [];
  let exchanges = [];

  if (existingEntities) {
    // If existing entities are provided, we use them instead of creating new ones
    ({ DRs, sellers, buyers, offers, bosonVouchers } = existingEntities);
  } else {
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

    let nextAccountId = await accountHandler.getNextAccountId();
    for (const entity of entities) {
      const wallet = Wallet.createRandom();
      const connectedWallet = wallet.connect(provider);
      //Fund the new wallet
      let tx = {
        to: await connectedWallet.getAddress(),
        // Convert currency unit from ether to wei
        value: parseEther("10"),
      };
      await deployer.sendTransaction(tx);

      // create entities
      switch (entity) {
        case entityType.DR: {
          const clerkAddress = ZeroAddress;

          const disputeResolver = mockDisputeResolver(
            await wallet.getAddress(),
            await wallet.getAddress(),
            clerkAddress,
            await wallet.getAddress(),
            true,
            true
          );
          const disputeResolverFees = [
            new DisputeResolverFee(ZeroAddress, "Native", "0"),
            new DisputeResolverFee(await mockToken.getAddress(), "MockToken", "0"),
          ];
          const sellerAllowList = [];

          disputeResolver.id = nextAccountId.toString();

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

          break;
        }
        case entityType.SELLER: {
          const seller = mockSeller(
            await wallet.getAddress(),
            await wallet.getAddress(),
            await wallet.getAddress(),
            await wallet.getAddress(),
            true,
            undefined,
            {
              refreshModule: true,
            }
          );
          const id = (seller.id = nextAccountId.toString());
          let authToken = mockAuthToken();

          // set unique new voucherInitValues
          const voucherInitValues = new VoucherInitValues(`http://seller${id}.com/uri`, id * 10, ZeroHash);
          const tx = await accountHandler.connect(connectedWallet).createSeller(seller, authToken, voucherInitValues);
          const receipt = await tx.wait();
          const [, , voucherContractAddress] = receipt.logs.find((e) => e?.fragment?.name === "SellerCreated").args;
          const bosonVoucher = await getContractAt("BosonVoucher", voucherContractAddress);

          sellers.push({
            wallet: connectedWallet,
            id,
            seller,
            authToken,
            voucherInitValues,
            offerIds: [],
            bosonVoucher,
          });
          bosonVouchers.push(bosonVoucher);

          // mint mock token to sellers just in case they need them
          await mockToken.connect(deployer).mint(await connectedWallet.getAddress(), "10000000000");
          await mockToken.connect(connectedWallet).approve(protocolDiamondAddress, "10000000000");
          break;
        }
        case entityType.BUYER: {
          // no need to explicitly create buyer, since it's done automatically during commitToOffer
          const buyer = mockBuyer(await wallet.getAddress());
          buyer.id = nextAccountId.toString();
          buyers.push({ wallet: connectedWallet, id: buyer.id, buyer });
          break;
        }
      }

      nextAccountId++;
    }
  }

  // create offers - first seller has 5 offers, second 4, third 3 etc
  let offerId = Number(await offerHandler.getNextOfferId());
  for (let i = 0; i < sellers.length; i++) {
    for (let j = i; j >= 0; j--) {
      // Mock offer, offerDates and offerDurations
      const { offer, offerDates, offerDurations } = await mockOffer({
        refreshModule: true,
        legacyOffer: isBefore,
      });

      // Set unique offer properties based on offer id
      offer.id = `${offerId}`;
      offer.sellerId = sellers[j].seller.id;
      offer.price = `${offerId * 1000}`;
      offer.sellerDeposit = `${offerId * 100}`;
      offer.buyerCancelPenalty = `${offerId * 50}`;
      offer.quantityAvailable = `${(offerId + 1) * 15}`;

      // Default offer is in native token. Change every other to mock token
      if (offerId % 2 == 0) {
        offer.exchangeToken = await mockToken.getAddress();
      }

      // Set unique offer dates based on offer id
      const now = offerDates.validFrom;
      offerDates.validFrom = (BigInt(now) + oneMonth + BigInt(offerId) * 1000n).toString();
      offerDates.validUntil = (BigInt(now) + oneMonth * 6n * BigInt(offerId + 1)).toString();

      // Set unique offerDurations based on offer id
      offerDurations.disputePeriod = `${(offerId + 1) * Number(oneMonth)}`;
      offerDurations.voucherValid = `${(offerId + 1) * Number(oneMonth)}`;
      offerDurations.resolutionPeriod = `${(offerId + 1) * Number(oneDay) + Number(oneWeek)}`;

      // choose one DR and agent
      const disputeResolverId = DRs[0].disputeResolver.id;
      const agentId = "0";
      const offerFeeLimit = MaxUint256; // unlimited offer fee to not affect the tests

      const royaltyInfo = [
        {
          bps: [`${sellers[j].voucherInitValues.royaltyPercentage}`],
          recipients: [ZeroAddress],
        },
      ];

      offer.royaltyInfo = royaltyInfo;

      // create an offer
      if (isBefore) {
        await offerHandler
          .connect(sellers[j].wallet)
          .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId, offerFeeLimit);
      } else {
        await offerHandler
          .connect(sellers[j].wallet)
          .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId, offerFeeLimit); // < toDo drTerms
      }

      offers.push({ offer, offerDates, offerDurations, disputeResolverId, agentId, royaltyInfo });
      sellers[j].offerIds.push(offerId);

      // Deposit seller funds so the commit will succeed
      const sellerPool = BigInt(offer.quantityAvailable) * BigInt(offer.price);
      const msgValue = offer.exchangeToken == ZeroAddress ? sellerPool : "0";
      await fundsHandler
        .connect(sellers[j].wallet)
        .depositFunds(sellers[j].seller.id, offer.exchangeToken, sellerPool, { value: msgValue });

      offerId++;
    }
  }

  // commit to some offers: first buyer commit to 1 offer, second to 2, third to 3 etc
  await setNextBlockTimestamp(Number(offers[offers.length - 1].offerDates.validFrom)); // When latest offer is valid, also other offers are valid
  let exchangeId = Number(await exchangeHandler.getNextExchangeId());
  for (let i = 0; i < buyers.length; i++) {
    for (let j = i; j < buyers.length; j++) {
      const { offer, groupId } = offers[i + j]; // some offers will be picked multiple times, some never.
      const offerPrice = offer.price;
      const buyerWallet = buyers[j].wallet;
      let msgValue;
      if (offer.exchangeToken == ZeroAddress) {
        msgValue = offerPrice;
      } else {
        // approve token transfer
        msgValue = 0;
        await mockToken.connect(buyerWallet).approve(protocolDiamondAddress, offerPrice);
        await mockToken.connect(deployer).mint(await buyerWallet.getAddress(), offerPrice);
      }

      if (groupId) {
        // get condition
        decache("../../scripts/domain/Condition.js");
        Condition = require("../../scripts/domain/Condition.js");
        let [, , condition] = await groupHandler.getGroup(groupId);
        condition = Condition.fromStruct(condition);

        // commit to conditional offer
        await exchangeHandler
          .connect(buyerWallet)
          .commitToConditionalOffer(await buyerWallet.getAddress(), offer.id, condition.minTokenId, {
            value: msgValue,
          });
      } else {
        await exchangeHandler
          .connect(buyerWallet)
          .commitToOffer(await buyerWallet.getAddress(), offer.id, { value: msgValue });
      }

      exchanges.push({ exchangeId: exchangeId, offerId: offer.id, buyerIndex: j, sellerId: offer.sellerId });
      exchangeId++;
    }
  }

  return { DRs, sellers, buyers, offers, exchanges, bosonVouchers };
}

async function getVoucherContractState({ bosonVouchers, exchanges, sellers, buyers }) {
  let bosonVouchersState = [];
  for (const bosonVoucher of bosonVouchers) {
    // supports interface
    const interfaceIds = await getInterfaceIds(false);

    const supportstInterface = await Promise.all(
      [interfaceIds["IBosonVoucher"], interfaceIds["IERC721"], interfaceIds["IERC2981"]].map((i) =>
        bosonVoucher.supportsInterface(i)
      )
    );

    // no arg getters
    const [sellerId, contractURI, owner, name, symbol] = await Promise.all([
      bosonVoucher.getSellerId(),
      bosonVoucher.contractURI(),
      bosonVoucher.owner(),
      bosonVoucher.name(),
      bosonVoucher.symbol(),
    ]);

    // tokenId related
    const bosonVoucherAddress = await bosonVoucher.getAddress();
    const { id } = sellers.find((s) => s.voucherContractAddress.toLowerCase() == bosonVoucherAddress.toLowerCase());
    const tokenIds = exchanges
      .filter((exchange) => exchange.sellerId == id)
      .map((exchange) => deriveTokenId(exchange.offerId, exchange.exchangeId));
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
    // isApprovedForAll(address owner, address assistant)
    const addresses = [...sellers, ...buyers].map((acc) => acc.wallet);
    const balanceOf = await Promise.all(addresses.map((address) => bosonVoucher.balanceOf(address)));
    const isApprovedForAll = await Promise.all(
      addresses.map((address1) =>
        Promise.all(addresses.map((address2) => bosonVoucher.isApprovedForAll(address1, address2)))
      )
    );

    bosonVouchersState.push({
      supportstInterface,
      sellerId,
      contractURI,
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

function revertState() {
  shell.exec(`rm -rf contracts/* scripts/* package.json package-lock.json`);
  shell.exec(`git checkout HEAD contracts scripts package.json package-lock.json`);
  shell.exec(`git reset HEAD contracts scripts package.json package-lock.json`);
}

function setVersionTags(tags) {
  versionTags = tags;
}

async function getDisputeResolver(accountHandler, value, { getBy }) {
  let exist, DR, DRFees, sellerAllowList;
  if (getBy == "address") {
    [exist, DR, DRFees, sellerAllowList] = await accountHandler.getDisputeResolverByAddress(value);
  } else {
    [exist, DR, DRFees, sellerAllowList] = await accountHandler.getDisputeResolver(value);
  }
  DR = DisputeResolver.fromStruct(DR);
  DRFees = DRFees.map((fee) => DisputeResolverFee.fromStruct(fee));
  sellerAllowList = sellerAllowList.map((sellerId) => sellerId.toString());

  return { exist, DR, DRFees, sellerAllowList };
}

async function getSeller(accountHandler, value, { getBy }) {
  let exist, seller, authToken;

  if (getBy == "address") {
    [exist, seller, authToken] = await accountHandler.getSellerByAddress(value);
  } else if (getBy == "authToken") {
    [exist, seller, authToken] = await accountHandler.getSellerByAuthToken(value);
  } else {
    [exist, seller, authToken] = await accountHandler.getSeller(value);
  }

  seller = Seller.fromStruct(seller);
  authToken = AuthToken.fromStruct(authToken);

  return { exist, seller, authToken };
}

async function getAgent(accountHandler, id) {
  let exist, agent;
  [exist, agent] = await accountHandler.getAgent(id);
  agent = Agent.fromStruct(agent);
  return { exist, agent };
}

async function getBuyer(accountHandler, id) {
  let exist, buyer;
  [exist, buyer] = await accountHandler.getBuyer(id);
  buyer = Buyer.fromStruct(buyer);
  return { exist, buyer };
}

exports.deploySuite = deploySuite;
exports.upgradeSuite = upgradeSuite;
exports.upgradeClients = upgradeClients;
exports.populateProtocolContract = populateProtocolContract;
exports.getProtocolContractState = getProtocolContractState;
exports.getStorageLayout = getStorageLayout;
exports.compareStorageLayouts = compareStorageLayouts;
exports.populateVoucherContract = populateVoucherContract;
exports.getVoucherContractState = getVoucherContractState;
exports.revertState = revertState;
exports.setVersionTags = setVersionTags;
