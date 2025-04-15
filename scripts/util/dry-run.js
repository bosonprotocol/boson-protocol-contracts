const shell = require("shelljs");
const { getAddressesFilePath } = require("./utils.js");
const hre = require("hardhat");
const { ethers } = hre;
const { getSigners, parseEther, getContractAt } = hre.ethers;
const network = hre.network.name;
const environments = require("../../environments");

async function setupDryRun(env) {
  let forkedChainId;
  let forkedEnv = env;

  console.warn("This is a dry run. No actual upgrade will be performed");
  ({ chainId: forkedChainId } = await ethers.provider.getNetwork());

  forkedEnv = env;

  let deployerBalance = await getBalance();
  // const blockNumber = await ethers.provider.getBlockNumber();

  // if deployerBalance is 0, set it to 100 ether
  if (deployerBalance == 0n) deployerBalance = parseEther("100", "ether");

  // change network to hardhat with forking enabled
  hre.config.networks["hardhat"].forking = {
    url: hre.config.networks[network].url,
    enabled: true,
    // blockNumber: "0x" + blockNumber.toString(16), // if performance is too slow, try commenting this line out
  };

  hre.config.networks["hardhat"].accounts = [
    { privateKey: hre.config.networks[network].accounts[0], balance: deployerBalance.toString() },
  ];
  await hre.changeNetwork("hardhat");

  env = `${env}-dry-run`;

  const { chainId } = await ethers.provider.getNetwork();
  if (chainId != "31337") process.exit(1); // make sure network is hardhat

  // Initialize fork state with a dummy transfer.
  const deployer = (await getSigners())[0];
  await deployer.sendTransaction({ to: deployer.address, value: 0 });

  // copy addresses file
  shell.cp(getAddressesFilePath(forkedChainId, network, forkedEnv), getAddressesFilePath(chainId, "hardhat", env));

  const adminAddressConfig = environments[network].adminAddress;
  const upgraderAddress = (await getSigners())[0].address;
  if (adminAddressConfig != upgraderAddress) {
    console.log("Sending 1 ether to the admin");
    const upgrader = await ethers.getSigner(upgraderAddress);
    await upgrader.sendTransaction({ to: adminAddressConfig, value: parseEther("1", "ether") });
    deployerBalance -= parseEther("1", "ether");

    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [adminAddressConfig],
    });

    const admin = await ethers.getSigner(adminAddressConfig);

    // give roles to upgrader
    const { readContracts } = require("./../util/utils");
    const contractsFile = readContracts(chainId, "hardhat", env);
    const accessControllerInfo = contractsFile.contracts.find((i) => i.name === "AccessController");

    // Get AccessController abstraction
    const accessController = await getContractAt("AccessController", accessControllerInfo.address, admin);

    const Role = require("./../domain/Role");
    console.log("Granting roles to upgrader");
    await accessController.grantRole(Role.ADMIN, upgraderAddress);
    await accessController.grantRole(Role.PAUSER, upgraderAddress);
    await accessController.grantRole(Role.UPGRADER, upgraderAddress);
  }

  return { env, deployerBalance };
}

async function getBalance() {
  const upgraderAddress = (await getSigners())[0].address;
  const upgraderBalance = await ethers.provider.getBalance(upgraderAddress);
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
