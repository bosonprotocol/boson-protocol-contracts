const shell = require("shelljs");
const { getAddressesFilePath } = require("../util/utils.js");
const hre = require("hardhat");
const ethers = hre.ethers;
const network = hre.network.name;

async function setupDryRun(env) {
  let forkedChainId, forkedEnv;

  console.warn("This is a dry run. No actual upgrade will be performed");
  ({ chainId: forkedChainId } = await ethers.provider.getNetwork());
  forkedEnv = env;
  const upgraderBalance = await getBalance();

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

  const { chainId } = await ethers.provider.getNetwork();
  if (chainId != "31337") process.exit(1); // make sure network is hardhat

  // copy addresses file
  shell.cp(getAddressesFilePath(forkedChainId, network, forkedEnv), getAddressesFilePath(chainId, "hardhat", env));

  return { env, upgraderBalance };
}

async function getBalance() {
  const upgraderAddress = (await ethers.getSigners())[0].address;
  const upgraderBalance = await ethers.provider.getBalance(upgraderAddress);
  return upgraderBalance;
}

exports.setupDryRun = setupDryRun;
exports.getBalance = getBalance;
