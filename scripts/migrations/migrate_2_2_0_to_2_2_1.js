const shell = require("shelljs");
const { readContracts } = require("../util/utils.js");
const hre = require("hardhat");
const network = hre.network.name;
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

    const selectorsToRemove = [
      keccak256(
        toUtf8Bytes("createSeller((uint256,address,address,address,address,bool),(uint256,uint8),(string,uint256))")
      ),
      keccak256(toUtf8Bytes("updateSeller((uint256,address,address,address,address,bool),(uint256,uint8))")),
    ];

    shell.exec(`rm -rf contracts/*`);

    console.log(`Checking out contracts on version ${tag}`);
    shell.exec(`git checkout HEAD scripts`);

    await hre.run("compile");
    await hre.run("upgrade-facets", {
      env,
      facetConfig: JSON.stringify(config),
    });

    const selectorsToAdd = [
      keccak256(
        toUtf8Bytes(
          "createSeller((uint256,address,address,address,address,bool,string),(uint256,uint8),(string,uint256))"
        )
      ),
      keccak256(toUtf8Bytes("updateSeller((uint256,address,address,address,address,bool,string),(uint256,uint8))")),
    ];

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
