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
  facetsToInit: {
    AccountHandlerFacet: { init: [] },
    OrchestrationHandlerFacet1: { init: [] },
  },
  initializationData: "0x",
};

async function migrate(env) {
  console.log(`Migration ${tag} started`);
  try {
    // Checking scrips in HEAD to remove any local changes before running npm install
    console.log("Checking out scripts on HEAD");
    shell.exec(`git checkout HEAD scripts`);

    console.log("Installing dependencies");
    shell.exec(`npm install`);
    const { chainId } = await ethers.provider.getNetwork();
    const contractsFile = readContracts(chainId, network, env);
    let contracts = contractsFile.contracts;

    // Get addresses of currently deployed contracts
    const protocolAddress = contracts.find((c) => c.name === "ProtocolDiamond")?.address;

    const getFunctionHashsClosure = getStateModifyingFunctionsHashes(
      ["SellerHandlerFacet", "OrchestrationHandlerFacet1"],
      undefined,
      ["createSeller", "updateSeller"]
    );

    const selectorsToRemove = await getFunctionHashsClosure();

    shell.exec(`rm -rf contracts/*`);

    console.log(`Checking out contracts on version ${tag}`);
    shell.exec(`git checkout ${tag} contracts`);

    console.log("Compiling contracts");
    await hre.run("clean");
    await hre.run("compile");

    // @TODO save logs
    console.log("Granting roles");
    await hre.run("manage-roles");

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