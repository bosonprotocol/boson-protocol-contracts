const shell = require("shelljs");
const { readContracts } = require("../util/utils.js");
const hre = require("hardhat");
const ethers = hre.ethers;
const network = hre.network.name;
const { getStateModifyingFunctionsHashes } = require("../../scripts/util/diamond-utils.js");
const tag = "v2.2.1";
const version = "2.2.1";

const config = {
  addOrUpgrade: [
    "AccountHandlerFacet",
    "SellerHandlerFacet",
    "DisputeResolverHandlerFacet",
    "OrchestrationHandlerFacet1",
    "ProtocolInitializationHandlerFacet",
  ],
  remove: [],
  skipSelectors: {},
  facetsToInit: {
    AccountHandlerFacet: { init: [] },
    OrchestrationHandlerFacet1: { init: [] },
  },
  initializationData: "0x",
};

async function migrate(env) {
  console.log(`Migration ${tag} started`);
  try {
    console.log("Removing any local changes before upgrading");
    shell.exec(`git reset @{u}`);
    const statusOutput = shell.exec("git status -s -uno scripts");

    if (statusOutput.stdout) {
      throw new Error("Local changes found. Please stash them before upgrading");
    }

    if (env != "upgrade-test") {
      console.log("Installing dependencies");
      shell.exec(`npm install`);
    }

    const { chainId } = await provider.getNetwork();
    const contractsFile = readContracts(chainId, network, env);

    if (contractsFile?.protocolVersion != "2.2.0") {
      throw new Error("Current contract version must be 2.2.0");
    }

    let contracts = contractsFile?.contracts;

    // Get addresses of currently deployed contracts
    const protocolAddress = contracts.find((c) => c.name === "ProtocolDiamond")?.address;

    // Checking old version contracts to get selectors to remove
    console.log("Checking out contracts on version 2.2.0");
    shell.exec(`rm -rf contracts/*`);
    shell.exec(`git checkout v2.2.0 contracts`);

    console.log("Compiling old contracts");
    await hre.run("clean");
    await hre.run("compile");

    const getFunctionHashesClosure = getStateModifyingFunctionsHashes(
      ["SellerHandlerFacet", "OrchestrationHandlerFacet1"],
      undefined,
      ["createSeller", "updateSeller"]
    );

    const selectorsToRemove = await getFunctionHashesClosure();

    console.log(`Checking out contracts on version ${tag}`);
    shell.exec(`rm -rf contracts/*`);
    shell.exec(`git checkout ${tag} contracts`);

    console.log("Compiling contracts");
    await hre.run("clean");
    await hre.run("compile");

    console.log("Executing upgrade facets script");
    await hre.run("upgrade-facets", {
      env,
      facetConfig: JSON.stringify(config),
      newVersion: version,
    });

    const selectorsToAdd = await getFunctionHashesClosure();

    const metaTransactionHandlerFacet = await getContractAt("MetaTransactionsHandlerFacet", protocolAddress);

    console.log("Removing selectors", selectorsToRemove.join(","));
    await metaTransactionHandlerFacet.setAllowlistedFunctions(selectorsToRemove, false);
    console.log("Adding selectors", selectorsToAdd.join(","));
    await metaTransactionHandlerFacet.setAllowlistedFunctions(selectorsToAdd, true);

    shell.exec(`git checkout HEAD`);
    console.log(`Migration ${tag} completed`);
  } catch (e) {
    console.error(e);
    shell.exec(`git checkout HEAD`);
    throw `Migration failed with: ${e}`;
  }
}

exports.migrate = migrate;
