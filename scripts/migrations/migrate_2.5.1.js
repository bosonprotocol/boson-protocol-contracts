const environments = require("../../environments");
const { readContracts, checkRole } = require("../util/utils.js");
const hre = require("hardhat");
const ethers = hre.ethers;
const { getContractAt, getSigners } = ethers;
const network = hre.network.name;
const version = "2.5.1-rc.2";
const confirmations = hre.network.name === "hardhat" ? 1 : environments.confirmations;
const { ACCOUNTS } = require("../../test/upgrade/utils/accounts.js");
const Role = require("../domain/Role");

/**
 * Migration script for v2.5.1
 *
 * Upgrades the protocol from v2.5.0 to v2.5.1.
 *
 * Changes in v2.5.1:
 * - executeMetaTransactionWithTokenTransferAuthorization added to MetaTransactionsHandlerFacet
 * - commitToOfferAndRedeemVoucher, commitToConditionalOfferAndRedeemVoucher,
 *   createOfferCommitAndRedeem added to OrchestrationHandlerFacet2
 * - Internal refactoring and pragma updates across several facets
 */
async function migrate(env) {
  try {
    const { chainId } = await ethers.provider.getNetwork();
    const contractsFile = readContracts(chainId, network, env);

    const currentVersion = contractsFile?.protocolVersion;
    if (currentVersion !== "2.5.0" && currentVersion !== "2.5.0-rc.2") {
      throw new Error(`Current contract version must be 2.5.0 or 2.5.0-rc.2, but found: ${currentVersion}`);
    }

    let contracts = contractsFile?.contracts;

    let signer;
    if (network === "localhost" && env === "localhost") {
      signer = ACCOUNTS[0].address;
    } else {
      signer = (await getSigners())[0].address;
    }

    const protocolAddress = contracts.find((c) => c.name === "ProtocolDiamond")?.address;
    if (!protocolAddress) {
      throw new Error("ProtocolDiamond address not found");
    }

    const accessControllerAddress = contracts.find((c) => c.name === "AccessController")?.address;
    if (!accessControllerAddress) {
      throw new Error("AccessController address not found");
    }

    if (network === "localhost" && env === "localhost") {
      const accessController = await getContractAt("AccessController", accessControllerAddress);
      const hasRole = await accessController.hasRole(Role.UPGRADER, signer);
      if (!hasRole) {
        const adminWallet = new ethers.Wallet(ACCOUNTS[0].privateKey, ethers.provider);
        const accessControllerAsAdmin = accessController.connect(adminWallet);
        const tx = await accessControllerAsAdmin.grantRole(Role.UPGRADER, signer);
        await tx.wait(confirmations);
      }
    }

    checkRole(contracts, "UPGRADER", signer);

    const { getFacets } = require(`../config/upgrade/${version}.js`);
    const facetConfig = await getFacets();

    await hre.run("upgrade-facets", {
      env,
      newVersion: version,
      functionNamesToSelector: "{}",
      facetConfig: JSON.stringify(facetConfig),
    });

    const updatedContractsFile = readContracts(chainId, network, env);
    contracts = updatedContractsFile?.contracts;

    const protocolInitializationFacet = await getContractAt("ProtocolInitializationHandlerFacet", protocolAddress);
    const newVersion = (await protocolInitializationFacet.getVersion()).replace(/\0/g, "");

    return {
      success: true,
      newVersion: newVersion,
    };
  } catch (e) {
    console.error(e);
    throw `Migration failed with: ${e}`;
  }
}

async function migrate_2_5_1(params) {
  return migrate(params.env || "localhost");
}

exports.migrate = migrate;
exports.migrate_2_5_1 = migrate_2_5_1;
