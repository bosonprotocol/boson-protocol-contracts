const hre = require("hardhat");
const environments = require("../environments");
const { getContractFactory } = hre.ethers;
const { readContracts, writeContracts, deploymentComplete, getFees } = require("./util/utils");

const network = hre.network.name;
const confirmations = network == "hardhat" ? 1 : environments.confirmations;

/**
 * Deploy BosonAuthorizedTransferForwarder
 *
 * Reads the existing address file for `chainId-network-env` to find the
 * ProtocolDiamond, deploys the forwarder bound to that diamond, and appends
 * the deployment to the same address file.
 *
 * Run via the hardhat task:
 *
 *   npx hardhat deploy-authorized-transfer-forwarder --network <network> --env <env>
 *
 * Examples:
 *
 *   npx hardhat deploy-authorized-transfer-forwarder --network polygon --env prod
 *   npx hardhat deploy-authorized-transfer-forwarder --network amoy   --env staging
 *   npx hardhat deploy-authorized-transfer-forwarder --network hardhat --env test
 */
async function main(env) {
  await hre.run("compile");

  const chainId = Number((await hre.ethers.provider.getNetwork()).chainId);

  const divider = "-".repeat(80);
  console.log(`${divider}\nBoson Authorized Transfer Forwarder Deployer\n${divider}`);
  console.log(`⛓  Network: ${network}  (chainId ${chainId})`);
  console.log(`🌎 Environment: ${env || "<unset>"}`);
  console.log(`📅 ${new Date()}`);

  // Load the existing protocol address file
  let contractsFile;
  try {
    contractsFile = readContracts(chainId, network, env);
  } catch (err) {
    console.error(`❌ Could not read address file for chainId=${chainId} network=${network} env=${env || "<unset>"}`);
    console.error(`   ${err.message}`);
    process.exit(1);
  }

  const diamond = contractsFile.contracts.find((c) => c.name === "ProtocolDiamond");
  if (!diamond) {
    console.error(`❌ ProtocolDiamond entry not found in the address file`);
    process.exit(1);
  }
  console.log(`💎 ProtocolDiamond: ${diamond.address}`);

  // Refuse to silently overwrite an existing deployment
  const existing = contractsFile.contracts.find((c) => c.name === "BosonAuthorizedTransferForwarder");
  if (existing) {
    console.error(`❌ BosonAuthorizedTransferForwarder already deployed at ${existing.address}`);
    console.error(`   Remove its entry from the address file first if you intend to redeploy.`);
    process.exit(1);
  }

  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    console.error("❌ No deployer account configured for this network");
    process.exit(1);
  }
  console.log(`🔱 Deployer: ${await deployer.getAddress()}`);
  console.log(divider);

  // Deploy
  console.log("🚀 Deploying BosonAuthorizedTransferForwarder...");
  const Factory = await getContractFactory("BosonAuthorizedTransferForwarder");
  const txOverrides = network === "hardhat" ? {} : await getFees();
  const forwarder = await Factory.deploy(diamond.address, txOverrides);
  await forwarder.waitForDeployment(confirmations);
  const address = await forwarder.getAddress();

  // Append to the existing contracts list and rewrite the address file
  const contracts = contractsFile.contracts;
  deploymentComplete("BosonAuthorizedTransferForwarder", address, [diamond.address], "", contracts);

  const path = await writeContracts(contracts, env, contractsFile.protocolVersion);
  console.log(`✅ Address file updated: ${path}`);
  console.log(divider);
}

exports.deployAuthorizedTransferForwarder = main;
