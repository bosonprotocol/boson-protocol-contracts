const hre = require("hardhat");
const { provider, getContractAt } = hre.ethers;
const fs = require("fs");
const addressesDirPath = __dirname + `/../../addresses`;
const Role = require("./../domain/Role");

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

  const chainId = Number((await hre.ethers.provider.getNetwork()).chainId);
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

async function getFees() {
  // const { baseFeePerGas } = await provider.getBlock();
  // TEMP: use gasPrice from provider instead of baseFeePerGas
  let { gasPrice } = await provider.getFeeData();
  gasPrice = (gasPrice * 3n) / 2n;

  // Set maxFeePerGas so it's likely to be accepted by the network
  // maxFeePerGas = maxPriorityFeePerGas + 2 * lastBaseFeePerGas
  // return { maxPriorityFeePerGas, maxFeePerGas: maxPriorityFeePerGas + BigInt(baseFeePerGas) * 2n };
  return { gasPrice };
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

  // Check that caller has specified role.
  const hasRole = await accessController.hasRole(Role[role], address);
  if (!hasRole) {
    console.log(`Admin address does not have ${role} role`);
    process.exit(1);
  }
}
const addressNotFound = (address) => {
  console.log(`${address} address not found for network ${hre.network.name}`);
  process.exit(1);
};

function toHexString(bigNumber, { startPad } = { startPad: 8 }) {
  return "0x" + (startPad ? bigNumber.toString(16).padStart(startPad, "0") : bigNumber.toString(16));
}

// Workaround since hardhat provider doesn't support listAccounts yet (this may be a hardhat bug after ether v6 migration)
async function listAccounts() {
  return await provider.send("eth_accounts", []);
}

exports.getAddressesFilePath = getAddressesFilePath;
exports.writeContracts = writeContracts;
exports.readContracts = readContracts;
exports.delay = delay;
exports.deploymentComplete = deploymentComplete;
exports.getFees = getFees;
exports.checkRole = checkRole;
exports.addressNotFound = addressNotFound;
exports.toHexString = toHexString;
exports.listAccounts = listAccounts;
