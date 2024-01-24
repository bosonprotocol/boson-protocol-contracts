const shell = require("shelljs");

const { getStateModifyingFunctionsHashes, getSelectors } = require("../../scripts/util/diamond-utils.js");
const environments = require("../../environments");
const Role = require("../domain/Role");
const tipMultiplier = BigInt(environments.tipMultiplier);
const tipSuggestion = 1500000000n; // js always returns this constant, it does not vary per block
const maxPriorityFeePerGas = tipSuggestion + tipMultiplier;
const { readContracts, getFees, checkRole } = require("../util/utils.js");
const hre = require("hardhat");
const PausableRegion = require("../domain/PausableRegion.js");
const ethers = hre.ethers;
const { getContractAt, getSigners, ZeroAddress } = ethers;
const network = hre.network.name;
const abiCoder = new ethers.AbiCoder();
const tag = "v2.4.0-rc.2";
const version = "2.4.0";
const { EXCHANGE_ID_2_2_0, WrappedNative } = require("../config/protocol-parameters");
const { META_TRANSACTION_FORWARDER } = require("../config/client-upgrade");
const confirmations = hre.network.name == "hardhat" ? 1 : environments.confirmations;

const config = {
  // status at v2.4.0-rc.2
  addOrUpgrade: [
    "AccountHandlerFacet",
    "AgentHandlerFacet",
    "BundleHandlerFacet",
    "BuyerHandlerFacet",
    "ConfigHandlerFacet",
    "DisputeHandlerFacet",
    "DisputeResolverHandlerFacet",
    "ExchangeHandlerFacet",
    "FundsHandlerFacet",
    "GroupHandlerFacet",
    "MetaTransactionsHandlerFacet",
    "OfferHandlerFacet",
    "OrchestrationHandlerFacet1",
    "OrchestrationHandlerFacet2",
    "PauseHandlerFacet",
    "ProtocolInitializationHandlerFacet",
    "SellerHandlerFacet",
    "TwinHandlerFacet",
    "PriceDiscoveryHandlerFacet",
    "SequentialCommitHandlerFacet",
  ],
  remove: [],
  skipSelectors: {},
  facetsToInit: {
    ExchangeHandlerFacet: { init: [], constructorArgs: [EXCHANGE_ID_2_2_0[network]] }, // must match nextExchangeId at the time of the upgrade
    AccountHandlerFacet: { init: [] },
    MetaTransactionsHandlerFacet: { init: [[]] },
    DisputeResolverHandlerFacet: { init: [] },
    OfferHandlerFacet: { init: [] },
    OrchestrationHandlerFacet1: { init: [] },
    PriceDiscoveryHandlerFacet: { init: [], constructorArgs: [WrappedNative[network]] },
    SequentialCommitHandlerFacet: { init: [], constructorArgs: [WrappedNative[network]] },
  },
  initializationData: abiCoder.encode(
    ["uint256[]", "uint256[][]", "uint256[][]", "address"],
    [[], [], [], ZeroAddress]
  ), // dummy; populated in migrate script
};

async function migrate(env) {
  console.log(`Migration ${tag} started`);
  try {
    // if (env != "upgrade-test") {
    //   console.log("Removing any local changes before upgrading");
    //   shell.exec(`git reset @{u}`);
    //   const statusOutput = shell.exec("git status -s -uno scripts package.json");

    //   if (statusOutput.stdout) {
    //     throw new Error("Local changes found. Please stash them before upgrading");
    //   }
    // }

    const { chainId } = await ethers.provider.getNetwork();
    const contractsFile = readContracts(chainId, network, env);

    if (contractsFile?.protocolVersion != "2.3.0") {
      throw new Error("Current contract version must be 2.3.0");
    }

    let contracts = contractsFile?.contracts;

    // Get addresses of currently deployed contracts
    const accessControllerAddress = contracts.find((c) => c.name === "AccessController")?.address;

    const accessController = await getContractAt("AccessController", accessControllerAddress);

    const signer = (await getSigners())[0].address;
    if (env == "upgrade-test") {
      // Grant PAUSER role to the deployer
      await accessController.grantRole(Role.PAUSER, signer);
    } else {
      checkRole(contracts, "PAUSER", signer);
    }

    const protocolAddress = contracts.find((c) => c.name === "ProtocolDiamond")?.address;

    if (env != "upgrade-test") {
      // Checking old version contracts to get selectors to remove
      console.log("Checking out contracts on version 2.3.0");
      shell.exec(`rm -rf contracts/*`);
      shell.exec(`git checkout v2.3.0 contracts package.json package-lock.json`);
      console.log("Installing dependencies");
      shell.exec("npm install");
      console.log("Compiling old contracts");
      await hre.run("clean");
      await hre.run("compile");
    }

    console.log("Pausing the Seller, Offer and Exchanges region...");
    let pauseHandler = await getContractAt("IBosonPauseHandler", protocolAddress);

    const pauseTransaction = await pauseHandler.pause(
      [PausableRegion.Sellers, PausableRegion.Offers, PausableRegion.Exchanges],
      await getFees(maxPriorityFeePerGas)
    );

    // await 1 block to ensure the pause is effective
    await pauseTransaction.wait(confirmations);

    let functionNamesToSelector = {};

    const preUpgradeFacetList = config.addOrUpgrade.filter(
      (f) => !["PriceDiscoveryHandlerFacet", "SequentialCommitHandlerFacet"].includes(f)
    );
    for (const facet of preUpgradeFacetList) {
      const facetContract = await getContractAt(facet, protocolAddress);
      const { signatureToNameMapping } = getSelectors(facetContract, true);
      functionNamesToSelector = { ...functionNamesToSelector, ...signatureToNameMapping };
    }

    let getFunctionHashesClosure = getStateModifyingFunctionsHashes(preUpgradeFacetList, ["executeMetaTransaction"]);

    const oldSelectors = await getFunctionHashesClosure();

    console.log(`Checking out contracts on version ${tag}`);
    shell.exec(`rm -rf contracts/*`);
    shell.exec(`git checkout ${tag} contracts package.json package-lock.json`);

    shell.exec(`git checkout HEAD scripts`);

    console.log("Installing dependencies");
    shell.exec(`npm install`);

    console.log("Compiling contracts");
    await hre.run("clean");
    // If some contract was removed, compilation succeeds, but afterwards it falsely reports missing artifacts
    // This is a workaround to ignore the error
    try {
      await hre.run("compile");
    } catch {}

    // Deploy Boson Price Discovery Client
    console.log("Deploying Boson Price Discovery Client...");
    const bosonPriceDiscoveryFactory = await ethers.getContractFactory("BosonPriceDiscovery");
    const bosonPriceDiscovery = await bosonPriceDiscoveryFactory.deploy(WrappedNative[network], protocolAddress);
    await bosonPriceDiscovery.waitForDeployment();

    // Prepare initialization data
    let sellerIds = [];
    let royaltyPercentages = [];
    let offerIds = [];
    let priceDiscoveryClientAddress = await bosonPriceDiscovery.getAddress();
    config.initializationData = abiCoder.encode(
      ["uint256[]", "uint256[][]", "uint256[][]", "address"],
      [sellerIds, royaltyPercentages, offerIds, priceDiscoveryClientAddress]
    );

    console.log("Executing upgrade facets script");
    await hre.run("upgrade-facets", {
      env,
      facetConfig: JSON.stringify(config),
      newVersion: version,
      functionNamesToSelector: JSON.stringify(functionNamesToSelector),
    });

    getFunctionHashesClosure = getStateModifyingFunctionsHashes(config.addOrUpgrade, ["executeMetaTransaction"]);

    const newSelectors = await getFunctionHashesClosure();
    const unchanged = oldSelectors.filter((value) => newSelectors.includes(value));
    const selectorsToRemove = oldSelectors.filter((value) => !unchanged.includes(value)); // unique old selectors
    const selectorsToAdd = newSelectors.filter((value) => !unchanged.includes(value)); // unique new selectors

    const metaTransactionHandlerFacet = await getContractAt("MetaTransactionsHandlerFacet", protocolAddress);
    console.log("Removing selectors", selectorsToRemove.join(","));
    await metaTransactionHandlerFacet.setAllowlistedFunctions(selectorsToRemove, false);

    // check if functions were removed
    for (const selector of selectorsToRemove) {
      const isFunctionAllowlisted = await metaTransactionHandlerFacet.getFunction("isFunctionAllowlisted(bytes32)");
      const isAllowed = await isFunctionAllowlisted.staticCall(selector);
      if (isAllowed) {
        console.error(`Selector ${selector} was not removed`);
      }
    }

    console.log("Adding selectors", selectorsToAdd.join(","));
    await metaTransactionHandlerFacet.setAllowlistedFunctions(selectorsToAdd, true);

    console.log("Executing upgrade clients script");

    const clientConfig = {
      META_TRANSACTION_FORWARDER,
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
    shell.exec(`git reset HEAD`);
    console.log(`Migration ${tag} completed`);
  } catch (e) {
    console.error(e);
    shell.exec(`git checkout HEAD`);
    shell.exec(`git reset HEAD`);
    throw `Migration failed with: ${e}`;
  }
}

exports.migrate = migrate;
