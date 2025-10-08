const environments = require("../../environments");
const { readContracts, checkRole } = require("../util/utils.js");
const hre = require("hardhat");
const ethers = hre.ethers;
const { getContractAt, getSigners } = ethers;
const network = hre.network.name;
const version = "2.5.0-rc.2";
const confirmations = hre.network.name === "hardhat" ? 1 : environments.confirmations;
const { ACCOUNTS } = require("../../test/upgrade/utils/accounts.js");
const Role = require("../domain/Role");

/**
 * Migration script for v2.5.0
 *
 * This migration upgrades the protocol from v2.4.2 to v2.5.0
 *
 * Major changes in v2.5.0:
 * - Enhanced buyer-initiated offers with new ExchangeCommitFacet
 * - New createOfferAndCommit functionality via orchestration facets
 * - Improved dispute resolution mechanisms
 * - Enhanced meta-transaction support (EIP2771)
 * - New price discovery and sequential commit features
 */
async function migrate(env) {
  try {
    const { chainId } = await ethers.provider.getNetwork();
    const contractsFile = readContracts(chainId, network, env);

    // Accept both v2.4.1 and v2.4.2 as valid starting versions for Docker compatibility
    const currentVersion = contractsFile?.protocolVersion;
    if (currentVersion !== "2.4.1" && currentVersion !== "2.4.2") {
      throw new Error(`Current contract version must be 2.4.1 or 2.4.2, but found: ${currentVersion}`);
    }

    let contracts = contractsFile?.contracts;

    // Use Docker accounts for localhost environment
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

    // Get AccessController address (separate from ProtocolDiamond)
    const accessControllerAddress = contracts.find((c) => c.name === "AccessController")?.address;
    if (!accessControllerAddress) {
      throw new Error("AccessController address not found");
    }

    // For localhost environment, grant UPGRADER role to the signer
    if (network === "localhost" && env === "localhost") {
      const accessController = await getContractAt("AccessController", accessControllerAddress);

      // Check if signer already has the role
      const hasRole = await accessController.hasRole(Role.UPGRADER, signer);
      if (!hasRole) {
        // Grant the role using the admin account (first Docker account)
        const adminWallet = new ethers.Wallet(ACCOUNTS[0].privateKey, ethers.provider);
        const accessControllerAsAdmin = accessController.connect(adminWallet);
        const tx = await accessControllerAsAdmin.grantRole(Role.UPGRADER, signer);
        await tx.wait(confirmations);
      }
    }

    // Check if admin has UPGRADER role
    checkRole(contracts, "UPGRADER", signer);

    // Get the facet configuration
    const { getFacets } = require(`../config/upgrade/${version}.js`);
    const facetConfig = await getFacets();

    // Simple call to upgrade-facets
    await hre.run("upgrade-facets", {
      env,
      newVersion: version,
      functionNamesToSelector: "{}",
      facetConfig: JSON.stringify(facetConfig),
    });

    // Re-read contracts file to get updated facet addresses
    const updatedContractsFile = readContracts(chainId, network, env);
    contracts = updatedContractsFile?.contracts;

    // Get the updated version (already set by upgrade-facets)
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

// Legacy function name for compatibility
async function migrate_2_5_0(params) {
  return migrate(params.env || "localhost");
}

exports.migrate = migrate;
exports.migrate_2_5_0 = migrate_2_5_0;
