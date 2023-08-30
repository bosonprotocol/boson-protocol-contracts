const shell = require("shelljs");

const { getStateModifyingFunctionsHashes, getSelectors } = require("../../scripts/util/diamond-utils.js");
const environments = require("../../environments");
const Role = require("../domain/Role");
const tipMultiplier = BigInt(environments.tipMultiplier);
const tipSuggestion = 1500000000n; // js always returns this constant, it does not vary per block
const maxPriorityFeePerGas = tipSuggestion + tipMultiplier;
const { readContracts, getFees, checkRole } = require("../util/utils.js");
const hre = require("hardhat");
const { oneWeek } = require("../../test/util/constants.js");
const PausableRegion = require("../domain/PausableRegion.js");
const ethers = hre.ethers;
const { getContractAt, getSigners } = ethers;
const network = hre.network.name;
const abiCoder = new ethers.AbiCoder();
const tag = "HEAD";
const version = "2.3.0";
const { EXCHANGE_ID_2_2_0 } = require("../config/protocol-parameters");
const { META_TRANSACTION_FORWARDER } = require("../config/client-upgrade");
const confirmations = hre.network.name == "hardhat" ? 1 : environments.confirmations;

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
    ExchangeHandlerFacet: { init: [], constructorArgs: [EXCHANGE_ID_2_2_0[network]] },
  }, // must match nextExchangeId at the time of the upgrade
  initializationData: abiCoder.encode(["uint256", "uint256[]", "address[]"], [oneWeek, [], []]),
};

async function migrate(env) {
  console.log(`Migration ${tag} started`);
  try {
    if (env != "upgrade-test") {
      console.log("Removing any local changes before upgrading");
      shell.exec(`git reset @{u}`);
      const statusOutput = shell.exec("git status -s -uno scripts package.json");

      if (statusOutput.stdout) {
        throw new Error("Local changes found. Please stash them before upgrading");
      }
    }

    const { chainId } = await ethers.provider.getNetwork();
    const contractsFile = readContracts(chainId, network, env);

    if (contractsFile?.protocolVersion != "2.2.1") {
      throw new Error("Current contract version must be 2.2.1");
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

    console.log("Pausing the Seller region...");
    let pauseHandler = await getContractAt("IBosonPauseHandler", protocolAddress);
    const pauseTransaction = await pauseHandler.pause([PausableRegion.Sellers], await getFees(maxPriorityFeePerGas));

    // await 1 block to ensure the pause is effective
    await pauseTransaction.wait(confirmations);

    if (env != "upgrade-test") {
      // Checking old version contracts to get selectors to remove
      console.log("Checking out contracts on version 2.2.1");
      shell.exec(`rm -rf contracts/*`);
      shell.exec(`git checkout v2.2.1 contracts package.json package-lock.json`);
      console.log("Installing dependencies");
      shell.exec("npm install");
      console.log("Compiling old contracts");
      await hre.run("clean");
      await hre.run("compile");
    }

    // Get the list of creators and their ids
    config.initializationData = abiCoder.encode(
      ["uint256"],
      [oneWeek] // ToDo <- from config?
    );
    console.log("Initialization data: ", config.initializationData);

    let functionNamesToSelector = {};

    for (const facet of config.addOrUpgrade) {
      const facetContract = await getContractAt(facet, protocolAddress);
      const { signatureToNameMapping } = getSelectors(facetContract, true);
      functionNamesToSelector = { ...functionNamesToSelector, ...signatureToNameMapping };
    }

    let getFunctionHashesClosure = getStateModifyingFunctionsHashes(
      [
        "SellerHandlerFacet",
        "OfferHandlerFacet",
        "ConfigHandlerFacet",
        "PauseHandlerFacet",
        "GroupHandlerFacet",
        "OrchestrationHandlerFacet1",
      ],
      undefined,
      [
        "createSellerAndOffer",
        "createSellerAndPremintedOffer",
        "createOffer",
        "createPremintedOffer",
        "MaxAllowedSellers",
        "MaxDisputesPerBatch",
        "MaxExchangesPerBatch",
        "MaxFeesPerDisputeResolver",
        "MaxOffersPerBatch",
        "MaxOffersPerGroup",
        "MaxPremintedVouchers",
        "MaxTokensPerWithdrawl",
        "MaxTwinsPerBundle",
        "getAvailableFunds",
        "unpause",
        "createGroup",
        "setGroupCondition",
      ]
    );

    const selectorsToRemove = await getFunctionHashesClosure();

    console.log(`Checking out contracts on version ${tag}`);
    shell.exec(`rm -rf contracts/*`);
    shell.exec(`git checkout ${tag} contracts package.json package-lock.json`);

    console.log("Installing dependencies");
    shell.exec(`npm install`);

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

    getFunctionHashesClosure = getStateModifyingFunctionsHashes(
      [
        "SellerHandlerFacet",
        "OfferHandlerFacet",
        "ConfigHandlerFacet",
        "PauseHandlerFacet",
        "GroupHandlerFacet",
        "OrchestrationHandlerFacet1",
        "ExchangeHandlerFacet",
      ],
      undefined,
      [
        "createSellerAndOffer",
        "createSellerAndPremintedOffer",
        "createOffer",
        "createPremintedOffer",
        "MaxAllowedSellers",
        "MaxDisputesPerBatch",
        "MaxExchangesPerBatch",
        "MaxFeesPerDisputeResolver",
        "MaxOffersPerBatch",
        "MaxOffersPerGroup",
        "MaxPremintedVouchers",
        "MaxTokensPerWithdrawl",
        "MaxTwinsPerBundle",
        "getAvailableFunds",
        "unpause",
        "getPausedRegions",
        "createGroup",
        "setGroupCondition",
        "createNewCollection",
        "MinResolutionPeriod",
        "commitToConditionalOffer",
        "getAllAvailableFunds",
        "getTokenList",
        "getTokenListPaginated",
      ]
    );

    const selectorsToAdd = await getFunctionHashesClosure();
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
    console.log(`Migration ${tag} completed`);
  } catch (e) {
    console.error(e);
    shell.exec(`git checkout HEAD`);
    throw `Migration failed with: ${e}`;
  }
}

exports.migrate = migrate;
