const hre = require("hardhat");
const ethers = hre.ethers;
const fs = require("fs");
const packageFile = require("../../package.json");

const addressesDirPath = __dirname + `/../../addresses`;

function getAddressesFilePath(chainId, env, suffix) {
  return `${addressesDirPath}/${chainId}${env ? `-${env.toLowerCase()}` : ""}${suffix ? `-${suffix}` : ""}.json`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deploymentComplete(name, address, args, contracts) {
  contracts.push({ name, address, args });
  console.log(`✅ ${name} deployed to: ${address}`);
}

async function writeContracts(contracts) {
  if (!fs.existsSync(addressesDirPath)) {
    fs.mkdirSync(addressesDirPath);
  }

  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  const env = hre.network.name;
  fs.writeFileSync(
    getAddressesFilePath(chainId, env),
    JSON.stringify(
      {
        chainId: chainId,
        env: env || "",
        protocolVersion: packageFile.version,
        contracts,
      },
      null,
      2
    ),
    "utf-8"
  );
}

function readContracts(chainId, env) {
  return JSON.parse(fs.readFileSync(getAddressesFilePath(chainId, env), "utf-8"));
}

async function getBaseFee() {
  if (hre.network.name == "hardhat") {
    // getBlock("pending") doesn't work with hardhat. This is the value one gets by calling getBlock("0")
    return "1000000000";
  }
  const { baseFeePerGas } = await ethers.provider.getBlock("pending");
  return baseFeePerGas;
}

async function getMaxFeePerGas(maxPriorityFeePerGas) {
  return maxPriorityFeePerGas.add(await getBaseFee());
}

async function getFees(maxPriorityFeePerGas) {
  return { maxPriorityFeePerGas, maxFeePerGas: await getMaxFeePerGas(maxPriorityFeePerGas) };
}

exports.getAddressesFilePath = getAddressesFilePath;
exports.writeContracts = writeContracts;
exports.readContracts = readContracts;
exports.delay = delay;
exports.deploymentComplete = deploymentComplete;
exports.getBaseFee = getBaseFee;
exports.getMaxFeePerGas = getMaxFeePerGas;
exports.getFees = getFees;
