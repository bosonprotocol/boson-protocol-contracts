const hre = require("hardhat");
const { verifyOnBlockExplorer } = require("./report-verify-deployments");
const { readContracts } = require("./utils");

/**
 * Verify Boson Protocol V2 contract suite
 *
 * Usage: npx hardhat verify-suite --network <network> --chain-id <chain id> --env <env>
 *
 *  e.g.: npx hardhat verify-suite --network polygon --chain-id 137 --env prod
 *      : reads addresses/137-polygon-prod.json
 *      : verifies each contract listed, with the given constructor args
 *
 *  If you need to filter the list of contracts to verify,
 *  edit hardhat.config.js temporarily and set the filter
 *  array in the task definition
 *
 * @param chainId - the chain id of the deployed contracts
 * @param env - the chain id of the deployed contracts
 * @param filter - optional list of names to verify (subset of all contacts)
 * @returns {Promise<void>}
 */
const verifySuite = async (chainId, env, filter = []) => {
  const network = hre.network.name;
  console.log(chainId, network, env, filter);

  // Read the contracts for the chain
  const { contracts } = await readContracts(chainId, network, env);

  console.log("🔍 Verifying contracts on block explorer...");
  while (contracts.length) {
    const contract = contracts.shift();
    if (filter.length && filter.includes(contract.name)) {
      await verifyOnBlockExplorer(contract);
    }
  }

  console.log("\n");
};

exports.verifySuite = verifySuite;
