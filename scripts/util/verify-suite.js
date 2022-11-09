const hre = require("hardhat");
const { verifyOnBlockExplorer } = require("./report-verify-deployments");
const { readContracts } = require("./utils");
const { contractList } = require("../config/contract-verification");

/**
 * Verify Boson Protocol V2 contract suite
 *
 * Usage: npx hardhat verify-suite --network <network> --chain-id <chain id> --env <env>
 *
 *  e.g.: npx hardhat verify-suite --network polygon --chain-id 137 --env prod
 *      : reads addresses/137-polygon-prod.json
 *      : verifies each contract listed, with the given constructor args
 *
 * Process:
 *  1.  Edit scripts/config/contract-verification.js. Addresses will be pulled from /addresses/<chainId>-<network>.json or environments file
 *  1a. If you want to verify all contract, leave contractList empty
 *  1b. If you want to verify only a subset of contract, specify them in contractList.
 *      Use names of actual implementations, not interfaces.
 *  2. Run the appropriate npm script in package.json to verify contract for a given network and environment
 *
 * @param chainId - the chain id of the deployed contracts
 * @param env - the environment of the deployed contracts
 * @returns {Promise<void>}
 */
const verifySuite = async (chainId, env) => {
  const network = hre.network.name;
  console.log(chainId, network, env, contractList.length ? contractList : "Verifying everything");

  // Read the contracts for the chain
  const { contracts } = await readContracts(chainId, network, env);

  console.log("🔍 Verifying contracts on block explorer...");
  while (contracts.length) {
    const contract = contracts.shift();
    if (!contractList.length || contractList.includes(contract.name)) {
      await verifyOnBlockExplorer(contract);
    }
  }

  console.log("\n");
};

exports.verifySuite = verifySuite;
