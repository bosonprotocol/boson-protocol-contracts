const shell = require("shelljs");

const { getStateModifyingFunctionsHashes, getSelectors } = require("../../scripts/util/diamond-utils.js");
const axios = require("axios");
const environments = require("../../environments");
const Role = require("../domain/Role");
const tipMultiplier = BigInt(environments.tipMultiplier);
const tipSuggestion = 1500000000n; // js always returns this constant, it does not vary per block
const maxPriorityFeePerGas = tipSuggestion + tipMultiplier;
const { readContracts, getFees } = require("../util/utils.js");
const hre = require("hardhat");
const { oneWeek } = require("../../test/util/constants.js");
const PausableRegion = require("../domain/PausableRegion.js");
const ethers = hre.ethers;
const { getContractFactory, getContractAt, getSigners } = ethers;
const network = hre.network.name;
const abiCoder = new ethers.AbiCoder();
// const { getStateModifyingFunctionsHashes } = require("../../scripts/util/diamond-utils.js");
const tag = "HEAD";
const version = "2.3.0";

const config = {
  // status at 451dc3d. ToDo: update this to the latest commit
  addOrUpgrade: [
    "ConfigHandlerFacet",
    "DisputeResolverHandlerFacet",
    "ExchangeHandlerFacet",
    "FundsHandlerFacet",
    "MetaTransactionsHandlerFacet",
    "OfferHandlerFacet",
    "OrchestrationHandlerFacet1",
    "PauseHandlerFacet",
    "DisputeHandlerFacet",
    "ProtocolInitializationHandlerFacet",
    "SellerHandlerFacet",
    "BundleHandlerFacet",
    "TwinHandlerFacet",
    "GroupHandlerFacet",
  ],
  remove: [],
  skipSelectors: {},
  facetsToInit: {
    // @TODO get correct constructor args
    ExchangeHandlerFacet: { init: [], constructorArgs: [1] },
  }, // must match nextExchangeId at the time of the upgrade
};

async function migrate(env) {
  console.log(`Migration ${tag} started`);
  try {
    console.log("Removing any local changes before upgrading");
    //shell.exec(`git reset @{u}`);
    const statusOutput = shell.exec("git status -s -uno scripts package.json");

    //    if (statusOutput.stdout) {
    //      throw new Error("Local changes found. Please stash them before upgrading");
    //    }

    const { chainId } = await ethers.provider.getNetwork();
    const contractsFile = readContracts(chainId, network, env);

    //    if (contractsFile?.protocolVersion != "2.2.1") {
    //      throw new Error("Current contract version must be 2.2.1");
    //    }

    let contracts = contractsFile?.contracts;

    // Get addresses of currently deployed contracts
    const accessControllerAddress = contracts.find((c) => c.name === "AccessController")?.address;

    const accessController = await getContractAt("AccessController", accessControllerAddress);

    if (env == "upgrade-test" || env == "dry-run") {
      // TODO remove dry run from here
      const signer = (await getSigners())[0].address;
      // Grant PAUSER role to the deployer
      await accessController.grantRole(Role.PAUSER, signer);
    }

    const protocolAddress = contracts.find((c) => c.name === "ProtocolDiamond")?.address;

    console.log("Pausing the Seller region...");
    let pauseHandler = await getContractAt("IBosonPauseHandler", protocolAddress);
    await pauseHandler.pause([PausableRegion.Sellers], await getFees(maxPriorityFeePerGas));

    // Checking old version contracts to get selectors to remove
    // ToDo: at 451dc3d, no selectors to remove. Comment out this section. It will be needed when other changes are merged into main
    const oldTag = "v2.2.1";
    console.log("Checking out contracts on version 2.2.1");
    shell.exec(`rm -rf contracts/*`);
    shell.exec(`git checkout ${oldTag} contracts package.json package-lock.json`);

    shell.exec("npm install");

    console.log("Compiling old contracts");
    await hre.run("clean");
    await hre.run("compile");

    let functionNamesToSelector = {};

    for (const facet of config.addOrUpgrade) {
      const facetContract = await getContractAt(facet, protocolAddress);
      const { signatureToNameMapping } = getSelectors(facetContract, true);
      functionNamesToSelector = { ...functionNamesToSelector, ...signatureToNameMapping };
    }

    const getFunctionHashesClosure = getStateModifyingFunctionsHashes(
      ["SellerHandlerFacet", "OrchestrationHandlerFacet1", "OfferHandlerFacet", "ConfigHandlerFacet"],
      undefined,
      ["createSeller", "updateSeller", "createOffer", "createPremintedOffer"]
    );

    const selectorsToRemove = await getFunctionHashesClosure();
    console.log("selectorsToRemove", selectorsToRemove);

    if (env != "upgrade-test") {
      const creators = await fetchSellerCreators();
      config.initializationData = abiCoder.encode(
        ["uint256", "uint256[]", "address[]"],
        [oneWeek, creators.map((c) => c.id), creators.map((c) => c.creator)]
      );
      console.log("config.initializationData", config.initializationData);
    }

    console.log(`Checking out contracts on version ${tag}`);
    shell.exec(`rm -rf contracts/*`);
    shell.exec(`git checkout ${tag} contracts package.json package-lock.json`);

    shell.exec("npm install");

    console.log("Compiling contracts");
    await hre.run("clean");
    await hre.run("compile");
    console.log("Executing upgrade facets script");
    await hre.run("upgrade-facets", {
      env,
      facetConfig: JSON.stringify(config),
      newVersion: version,
      functionNamesToSelector: JSON.stringify(functionNamesToSelector),
    });

    const selectorsToAdd = await getFunctionHashesClosure();
    const metaTransactionHandlerFacet = await getContractAt("MetaTransactionsHandlerFacet", protocolAddress);
    console.log("Removing selectors", selectorsToRemove.join(","));
    await metaTransactionHandlerFacet.setAllowlistedFunctions(selectorsToRemove, false);
    console.log("Adding selectors", selectorsToAdd.join(","));
    await metaTransactionHandlerFacet.setAllowlistedFunctions(selectorsToAdd, true);

    console.log("Executing upgrade clients script");
    // TODO get correct forwarder address
    const MockForwarder = await getContractFactory("MockForwarder");
    const forwarder = await MockForwarder.deploy();

    const clientConfig = {
      META_TRANSACTION_FORWARDER: {
        hardhat: await forwarder.getAddress(),
      },
    };

    // Upgrade clients
    await hre.run("upgrade-clients", {
      env,
      clientConfig: JSON.stringify(clientConfig),
      newVersion: version,
    });

    console.log("Unpausing all regions...");
    pauseHandler = await getContractAt("IBosonPauseHandler", protocolAddress);
    await pauseHandler.unpause([], await getFees(maxPriorityFeePerGas));

    shell.exec(`git checkout HEAD`);
    console.log(`Migration ${tag} completed`);
  } catch (e) {
    console.error(e);
    shell.exec(`git checkout HEAD`);
    throw `Migration failed with: ${e}`;
  }
}

async function fetchSellerCreators() {
  // TODO make this based on the network
  const url = "https://api.thegraph.com/subgraphs/name/bosonprotocol/polygon";

  const data = {
    query: `query GetSellers {
    sellers(first: 500, orderBy: sellerId, orderDirection: desc) {
      assistant
      sellerId
      logs(where: {type: SELLER_CREATED}) {
        type
        executedBy
      }
    }
  }`,
    variables: null,
    operationName: "GetSellers",
    extensions: {
      headers: null,
    },
  };

  const headers = {
    Accept: "application/json, multipart/mixed",
  };
  const {
    data: {
      data: { sellers },
    },
  } = await axios.post(url, data, { headers });
  return sellers.map((s) => {
    return { id: s.sellerId, creator: s.logs[0].executedBy };
  });
}

exports.migrate = migrate;
