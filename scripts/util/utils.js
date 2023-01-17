const hre = require("hardhat");
const ethers = hre.ethers;
const fs = require("fs");
const packageFile = require("../../package.json");
const addressesDirPath = __dirname + `/../../addresses`;

function getAddressesFilePath(chainId, network, env) {
  return `${addressesDirPath}/${chainId}${network ? `-${network.toLowerCase()}` : ""}${env ? `-${env}` : ""}.json`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deploymentComplete(name, address, args, interfaceId, contracts) {
  contracts.push({ name, address, args, interfaceId });
  console.log(`✅ ${name} deployed to: ${address}`);
}

async function writeContracts(contracts, env) {
  if (!fs.existsSync(addressesDirPath)) {
    fs.mkdirSync(addressesDirPath);
  }

  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  const network = hre.network.name;
  const path = getAddressesFilePath(chainId, network, env);
  fs.writeFileSync(
    path,
    JSON.stringify(
      {
        chainId: chainId,
        network: network || "",
        env: env || "",
        protocolVersion: packageFile.version,
        contracts,
      },
      null,
      2
    ),
    "utf-8"
  );

  return path;
}

function readContracts(chainId, network, env) {
  return JSON.parse(fs.readFileSync(getAddressesFilePath(chainId, network, env), "utf-8"));
}

async function getBaseFee() {
  if (hre.network.name == "hardhat" || hre.network.name == "localhost") {
    // getBlock("pending") doesn't work with hardhat. This is the value one gets by calling getBlock("0")
    return "1000000000";
  }
  const { baseFeePerGas } = await ethers.provider.getBlock("pending");
  return baseFeePerGas;
}

async function getMaxFeePerGas(maxPriorityFeePerGas) {
  return maxPriorityFeePerGas.add(await getBaseFee());
}

async function getFees() {
  // maxPriorityFeePerGas TODO add back as an argument when ethers.js supports 1559 on polygon
  const { gasPrice } = await ethers.provider.getFeeData();
  const newGasPrice = gasPrice.mul(ethers.BigNumber.from("2"));
  //  return { maxPriorityFeePerGas, maxFeePerGas: await getMaxFeePerGas(maxPriorityFeePerGas) }; // TODO use when ethers.js supports 1559 on polygon
  return { gasPrice: newGasPrice };
}

// Check if account has a role
async function checkRole(contracts, role, address) {
  // Get addresses of currently deployed AccessController contract
  const accessControllerAddress = contracts.find((c) => c.name === "AccessController")?.address;
  if (!accessControllerAddress) {
    return addressNotFound("AccessController");
  }

  // Get AccessController abstraction
  const accessController = await ethers.getContractAt("AccessController", accessControllerAddress);

  // Check that caller has upgrader role.
  const hasRole = await accessController.hasRole(role, address);
  if (!hasRole) {
    console.log("Admin address does not have UPGRADER role");
    process.exit(1);
  }
}
const addressNotFound = (address) => {
  console.log(`${address} address not found for network ${hre.network.name}`);
  process.exit(1);
};

/**
 * Require uncached node module
 *
 * Normally, if the same module is required multiple times, the first time it is loaded and cached.
 * If the module is changed during the execution, the cache is not updated, so the old version is returned.
 * This function deletes the cache for the specified module and requires it again.
 *
 * Use case:
 * Upgrade test `test/upgrade/clients/BosonVoucher-2.1.0-2.2.0.js` deploys version 2.1.0 of the contract and then upgrades it to 2.2.0.
 * Since deployment script changed between versions, current deployment script cannot be used to deploy 2.1.0.
 * For first deployment, we checkout old deployment script, which uses `deployProtocolHandlerFacets` from `./util/deploy-protocol-handler-facets.js`.
 * To upgrade to 2.2.0, we switch back to current upgrade script, which uses `deployProtocolFacets` from `./util/deploy-protocol-handler-facets.js`.
 * If the cache is not cleared, requiring module `./util/deploy-protocol-handler-facets.js` returns the old version, where `deployProtocolFacets` does not
 * exist yet and the upgrade fails.
 * If the cache is cleared, the new version is required and the upgrade succeeds.
 *
 * @param {string} module - Module to require
 */
function requireUncached(module) {
  delete require.cache[require.resolve(module)];
  return require(module);
}

exports.getAddressesFilePath = getAddressesFilePath;
exports.writeContracts = writeContracts;
exports.readContracts = readContracts;
exports.delay = delay;
exports.deploymentComplete = deploymentComplete;
exports.getBaseFee = getBaseFee;
exports.getMaxFeePerGas = getMaxFeePerGas;
exports.getFees = getFees;
exports.checkRole = checkRole;
exports.addressNotFound = addressNotFound;
exports.requireUncached = requireUncached;
