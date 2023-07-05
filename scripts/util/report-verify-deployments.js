const hre = require("hardhat");

/**
 * Utilities for reporting deployments and verifying with
 * Etherscan-based block explorers.
 *
 * Reused between deployment script and unit tests for consistency.
 */
async function verifyOnBlockExplorer(contract) {
  console.log(`\n📋 Verifying ${contract.name}`);

  console.log("contract object in verify function ", contract);
  try {
    if (contract.name == "BosonVoucher Logic") contract.name == "BosonVoucher";
    if (contract.name == "BosonVoucher Beacon") {
      await hre.run("verify:verify", {
        contract: "contracts/protocol/clients/proxy/BosonClientBeacon.sol:BosonClientBeacon",
        address: await contract.getAddress(),
        constructorArguments: contract.args,
      });
    } else {
      await hre.run("verify:verify", {
        address: await contract.getAddress(),
        constructorArguments: contract.args,
      });
    }
  } catch (e) {
    console.log(`❌ Failed to verify ${contract.name} on block explorer. ${e.message}`);
  }
}

async function verifyOnTestEnv(contracts) {
  for (const contract of contracts) {
    console.log(`\n📋 Verifying on test env ${contract.name}`);
    try {
      const code = await hre.provider.getCode(await contract.getAddress());
      if (code === "0x0" || code === "0x") {
        console.log(`❌ Failed to verify ${contract.name} on test env.`);
      }
    } catch (e) {
      console.log(`❌ Failed to verify ${contract.name} on test env. ${e.message}`);
    }
  }
}

exports.verifyOnBlockExplorer = verifyOnBlockExplorer;
exports.verifyOnTestEnv = verifyOnTestEnv;
