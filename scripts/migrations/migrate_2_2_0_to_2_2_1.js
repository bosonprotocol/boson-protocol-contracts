const shell = require("shelljs");
const { readContracts } = require("../util/utils.js");
const hre = require("hardhat");
const network = hre.network.name;

const { getStateModifyingFunctionsHashes } = require("../../scripts/util/diamond-utils.js");
const ethers = hre.ethers;
const tag = "v2.2.1-rc.1";
const { keccak256, toUtf8Bytes } = require("ethers/lib/utils");

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
    const { chainId } = await ethers.provider.getNetwork();
    const contractsFile = readContracts(chainId, network, env);
    let contracts = contractsFile.contracts;

    // Get addresses of currently deployed contracts
    const protocolAddress = contracts.find((c) => c.name === "ProtocolDiamond")?.address;

    const getFunctionHashsClosure = getStateModifyingFunctionsHashes(
      ["SellerHandlerFacet", "OrchestrationHandlerFacet1", "OrchestrationHandlerFacet2"],
      undefined,
      ["createSeller", "updateSeller"]
    );

    const selectorsToRemove = await getFunctionHashsClosure();

    shell.exec(`rm -rf contracts/*`);

    console.log(`Checking out contracts on version ${tag}`);
    shell.exec(`git checkout HEAD scripts`);

    await hre.run("compile");
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

    console.log(`Migration ${tag} completed`);
  } catch (e) {
    console.error(e);
    shell.exec(`git checkout HEAD contracts`);
  }
}

exports.migrate = migrate;
