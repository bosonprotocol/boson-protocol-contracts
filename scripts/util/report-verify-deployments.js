const hre = require("hardhat");
//const ethers = hre.ethers;
const fs = require("fs");
const packageFile = require("../../package.json");

/**
 * Utilities for reporting deployments and verifying with
 * Etherscan-based block explorers.
 *
 * Reused between deployment script and unit tests for consistency.
 */

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deploymentComplete(name, address, args, contracts) {
  contracts.push({ name, address, args });
  console.log(`✅ ${name} deployed to: ${address}`);
}

async function verifyOnEtherscan(contract) {
  console.log(`\n📋 Verifying ${contract.name}`);
  try {
    await hre.run("verify:verify", {
      address: contract.address,
      constructorArguments: contract.args,
    });
  } catch (e) {
    console.log(`❌ Failed to verify ${contract.name} on etherscan. ${e.message}`);
  }
}

const addressesDirPath = __dirname + `/../../addresses`;

function getAddressesFilePath(chainId, env, suffix) {
  return `${addressesDirPath}/${chainId}${env ? `-${env.toLowerCase()}` : ""}${suffix ? `-${suffix}` : ""}.json`;
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

async function verifyOnTestEnv(contracts) {
  for (const contract of contracts) {
    console.log(`\n📋 Verifying on test env ${contract.name}`);
    try {
      const code = await hre.ethers.provider.getCode(contract.address);
      if (code === "0x0" || code === "0x") {
        console.log(`❌ Failed to verify ${contract.name} on test env.`);
      }
    } catch (e) {
      console.log(`❌ Failed to verify ${contract.name} on test env. ${e.message}`);
    }
  }
}

exports.delay = delay;
exports.deploymentComplete = deploymentComplete;
exports.verifyOnEtherscan = verifyOnEtherscan;
exports.writeContracts = writeContracts;
exports.verifyOnTestEnv = verifyOnTestEnv;
