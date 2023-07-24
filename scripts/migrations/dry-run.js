const shell = require("shelljs");
const { getAddressesFilePath } = require("../util/utils.js");
const hre = require("hardhat");
const { ethers } = hre;
const { provider, getSigners } = hre.ethers;
const network = hre.network.name;

async function setupDryRun(env) {
  let forkedChainId;
  let forkedEnv = env;

  console.warn("This is a dry run. No actual upgrade will be performed");
  ({ chainId: forkedChainId } = await ethers.provider.getNetwork());

  forkedEnv = env;
  const upgraderBalance = await getBalance();
  const blockNumber = await provider.getBlockNumber();

  // change network to hardhat with forking enabled
  hre.config.networks["hardhat"].forking = {
    url: hre.config.networks[network].url,
    enabled: true,
    blockNumber: blockNumber.toString(), // if performance is too slow, try commenting this line out
  };

  hre.config.networks["hardhat"].accounts = [
    { privateKey: hre.config.networks[network].accounts[0], balance: upgraderBalance.toString() },
  ];

  await hre.changeNetwork("hardhat");

  env = "dry-run";

  const { chainId } = await ethers.provider.getNetwork();
  if (chainId != "31337") process.exit(1); // make sure network is hardhat

  // copy addresses file
  shell.cp(getAddressesFilePath(forkedChainId, network, forkedEnv), getAddressesFilePath(chainId, "hardhat", env));

  return { env, upgraderBalance };
}

async function getBalance() {
  const upgraderAddress = (await getSigners())[0].address;
  const upgraderBalance = await provider.getBalance(upgraderAddress);
  return upgraderBalance;
}

// methods to change network and get provider
// copied from "hardhat-change-network" (https://www.npmjs.com/package/hardhat-change-network)
// and adapted to work with new hardhat version
const construction_1 = require("hardhat/internal/core/providers/construction");
const providers = {};
hre.getProvider = async function getProvider(name) {
  if (!providers[name]) {
    // providers[name] = construction_1.createProvider(name, this.config.networks[name], this.config.paths, this.artifacts);
    providers[name] = await construction_1.createProvider(this.config, name, this.artifacts);
  }
  return providers[name];
};
hre.changeNetwork = async function changeNetwork(newNetwork) {
  if (!this.config.networks[newNetwork]) {
    throw new Error(`changeNetwork: Couldn't find network '${newNetwork}'`);
  }
  if (!providers[this.network.name]) {
    providers[this.network.name] = this.network.provider;
  }
  this.network.name = newNetwork;
  this.network.config = this.config.networks[newNetwork];
  this.network.provider = await this.getProvider(newNetwork);
  if (this.ethers) {
    const { HardhatEthersProvider } = require("@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider");
    this.ethers.provider = new HardhatEthersProvider(this.network.provider, newNetwork);
  }
};

exports.setupDryRun = setupDryRun;
exports.getBalance = getBalance;
