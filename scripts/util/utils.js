const hre = require("hardhat");
const ethers = hre.ethers;
const fs = require("fs");
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

async function writeContracts(contracts, env, version) {
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
        protocolVersion: version,
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

async function getFees(maxPriorityFeePerGas) {
  const { lastBaseFeePerGas } = await ethers.provider.getFeeData();
  // Set maxFeePerGas so it's likely to be accepted by the network
  // maxFeePerGas = maxPriorityFeePerGas + 2 * lastBaseFeePerGas
  return { maxPriorityFeePerGas, maxFeePerGas: maxPriorityFeePerGas.add(lastBaseFeePerGas.mul(2)) };
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

exports.getAddressesFilePath = getAddressesFilePath;
exports.writeContracts = writeContracts;
exports.readContracts = readContracts;
exports.delay = delay;
exports.deploymentComplete = deploymentComplete;
exports.getFees = getFees;
exports.checkRole = checkRole;
exports.addressNotFound = addressNotFound;
