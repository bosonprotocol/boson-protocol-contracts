const shell = require("shelljs");
const { readContracts } = require("../util/utils.js");
const hre = require("hardhat");
const ethers = hre.ethers;
const network = hre.network.name;
const { getStateModifyingFunctionsHashes } = require("../../scripts/util/diamond-utils.js");
const tag = "v2.2.1-rc.1";

const config = {
  addOrUpgrade: [
    "AccountHandlerFacet",
    "SellerHandlerFacet",
    "DisputeResolverHandlerFacet",
    "OrchestrationHandlerFacet1",
  ],
  remove: [],
  skipSelectors: {},
  facetsToInit: {},
  initializationData: "0x",
};

async function migrate(env) {
  console.log(`Migration ${tag} started`);
  try {
    console.log("Removing any local changes before upgrading");
    shell.exec(`git checkout HEAD`);

    console.log("Installing dependencies");
    shell.exec(`npm install`);
    const { chainId } = await ethers.provider.getNetwork();
    const contractsFile = readContracts(chainId, network, env);

    if (!contractsFile?.protocolVersion != "2.2.0") {
      throw new Error("Current contracts version is not 2.2.0");
    }

    let contracts = contractsFile?.contracts;

    // Get addresses of currently deployed contracts
    const protocolAddress = contracts.find((c) => c.name === "ProtocolDiamond")?.address;

    // Checking current version contracts to get selectors to remove
    console.log("Checking out contracts on version 2.2.0");
    shell.exec(`rm -rf contracts/*`);
    shell.exec(`git checkout v2.2.0 contracts`);

    const getFunctionHashsClosure = getStateModifyingFunctionsHashes(
      ["SellerHandlerFacet", "OrchestrationHandlerFacet1"],
      undefined,
      ["createSeller", "updateSeller"]
    );

    const selectorsToRemove = await getFunctionHashsClosure();

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
    });

    const selectorsToAdd = await getFunctionHashsClosure();

    const metaTransactionHandlerFacet = await ethers.getContractAt("MetaTransactionsHandlerFacet", protocolAddress);

    console.log("Removing selectors", selectorsToRemove.join(","));
    await metaTransactionHandlerFacet.setAllowlistedFunctions(selectorsToRemove, false);
    console.log("Adding selectors", selectorsToAdd.join(","));
    await metaTransactionHandlerFacet.setAllowlistedFunctions(selectorsToAdd, true);

    shell.exec(`git checkout HEAD`);
    console.log(`Migration ${tag} completed`);
  } catch (e) {
    console.error(e);
    shell.exec(`git checkout HEAD`);
  }
}

exports.migrate = migrate;
