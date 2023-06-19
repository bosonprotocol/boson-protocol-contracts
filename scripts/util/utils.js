const hre = require("hardhat");
const { provider, getContractAt } = hre.ethers;
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

  const chainId = (await hre.provider.getNetwork()).chainId;
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

async function getBaseFee() {
  if (hre.network.name == "hardhat" || hre.network.name == "localhost") {
    // getBlock("pending") doesn't work with hardhat. This is the value one gets by calling getBlock("0")
    return "1000000000";
  }
  const { baseFeePerGas } = await provider.getBlock("pending");
  return baseFeePerGas;
}

async function getMaxFeePerGas(maxPriorityFeePerGas) {
  return maxPriorityFeePerGas.add(await getBaseFee());
}

async function getFees() {
  // maxPriorityFeePerGas TODO add back as an argument when js supports 1559 on polygon
  const { gasPrice } = await provider.getFeeData();
  const newGasPrice = gasPrice * BigInt("2");
  //  return { maxPriorityFeePerGas, maxFeePerGas: await getMaxFeePerGas(maxPriorityFeePerGas) }; // TODO use when js supports 1559 on polygon
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
  const accessController = await getContractAt("AccessController", accessControllerAddress);

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
exports.getBaseFee = getBaseFee;
exports.getMaxFeePerGas = getMaxFeePerGas;
exports.getFees = getFees;
exports.checkRole = checkRole;
exports.addressNotFound = addressNotFound;
