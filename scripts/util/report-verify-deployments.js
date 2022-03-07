const hre = require("hardhat");

/**
 * Utilities for reporting deployments and verifying with
 * Etherscan-based block explorers.
 *
 * Reused between deployment script and unit tests for consistency.
 */

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function deploymentComplete(name, address, args, contracts) {
    contracts.push({name, address, args});
    console.log(`✅ ${name} deployed to: ${address}`);
}

async function verifyOnEtherscan(contract) {
    console.log(`\n📋 Verifying ${contract.name}`);
    try {
        await hre.run("verify:verify", {
            address: contract.address,
            constructorArguments: contract.args,
        })
    } catch (e) {
        console.log(`❌ Failed to verify ${contract.name} on etherscan. ${e.message}`);
    }
}

exports.delay = delay;
exports.deploymentComplete = deploymentComplete;
exports.verifyOnEtherscan = verifyOnEtherscan;
