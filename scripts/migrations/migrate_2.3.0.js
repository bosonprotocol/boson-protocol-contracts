const shell = require("shelljs");
const { readContracts, getAddressesFilePath } = require("../util/utils.js");
const hre = require("hardhat");
const ethers = hre.ethers;
const network = hre.network.name;
// const { getStateModifyingFunctionsHashes } = require("../../scripts/util/diamond-utils.js");
const tag = "HEAD";
const version = "2.3.0";

const config = {
  // status at 451dc3d. ToDo: update this to the latest commit
  addOrUpgrade: [
    "DisputeResolverHandlerFacet",
    "FundsHandlerFacet",
    "MetaTransactionsHandlerFacet",
    "OfferHandlerFacet",
    "OrchestrationHandlerFacet1",
    "ProtocolInitializationHandlerFacet",
    "SellerHandlerFacet",
    "TwinHandlerFacet",
  ],
  remove: [],
  skipSelectors: {},
  facetsToInit: {},
  initializationData: "0x",
};

async function migrate(env, isDryRun = false) {
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

    let forkedChainId, forkedEnv;
    if (isDryRun) {
      console.warn("This is a dry run. No actual upgrade will be performed");
      ({ chainId: forkedChainId } = await ethers.provider.getNetwork());
      forkedEnv = env;
      const upgraderAddress = (await ethers.getSigners())[0].address;
      const upgraderBalance = await ethers.provider.getBalance(upgraderAddress);

      // change network to hardhat with forking enabled
      hre.config.networks["hardhat"].forking = {
        url: hre.config.networks[network].url,
        enabled: true /*blockNumber: blockNumber.toString()*/,
      };
      hre.config.networks["hardhat"].accounts = [
        { privateKey: hre.config.networks[network].accounts[0], balance: upgraderBalance.toString() },
      ];

      hre.changeNetwork("hardhat");

      env = "upgrade-test";
    }

    const { chainId } = await ethers.provider.getNetwork();

    if (isDryRun) {
      if (chainId != "31337") process.exit(1); // make sure network is hardhat
      shell.cp(getAddressesFilePath(forkedChainId, network, forkedEnv), getAddressesFilePath(chainId, "hardhat", env));
    }

    const contractsFile = readContracts(chainId, network, env);

    if (contractsFile?.protocolVersion != "2.2.1") {
      throw new Error("Current contract version must be 2.2.1");
    }

    // let contracts = contractsFile?.contracts;

    // Get addresses of currently deployed contracts
    // const protocolAddress = contracts.find((c) => c.name === "ProtocolDiamond")?.address;

    // Checking old version contracts to get selectors to remove
    // ToDo: at 451dc3d, no selectors to remove. Comment out this section. It will be needed when other changes are merged into main
    // console.log("Checking out contracts on version 2.2.1");
    // shell.exec(`rm -rf contracts/*`);
    // shell.exec(`git checkout v2.2.1 contracts`);

    // console.log("Compiling old contracts");
    // await hre.run("clean");
    // await hre.run("compile");

    // const getFunctionHashesClosure = getStateModifyingFunctionsHashes(
    //   ["SellerHandlerFacet", "OrchestrationHandlerFacet1"],
    //   undefined,
    //   ["createSeller", "updateSeller"]
    // );

    // const selectorsToRemove = await getFunctionHashesClosure();

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

    // const selectorsToAdd = await getFunctionHashesClosure();

    // const metaTransactionHandlerFacet = await ethers.getContractAt("MetaTransactionsHandlerFacet", protocolAddress);

    // console.log("Removing selectors", selectorsToRemove.join(","));
    // await metaTransactionHandlerFacet.setAllowlistedFunctions(selectorsToRemove, false);
    // console.log("Adding selectors", selectorsToAdd.join(","));
    // await metaTransactionHandlerFacet.setAllowlistedFunctions(selectorsToAdd, true);

    shell.exec(`git checkout HEAD`);
    console.log(`Migration ${tag} completed`);
  } catch (e) {
    console.error(e);
    shell.exec(`git checkout HEAD`);
    throw `Migration failed with: ${e}`;
  }
}

exports.migrate = migrate;
