const environments = require("../environments");
const hre = require("hardhat");
const network = hre.network.name;

const { verifyOnBlockExplorer, verifyOnTestEnv } = require("./util/report-verify-deployments");
const { readContracts } = require("./util/utils");

/**
 * Verify Boson Protocol V2 contract suite
 * Running with the appropriate npm script in package.json:
 * `npm run verify-suite:mumbai`
 *
 * Running with hardhat
 * `npx hardhat run --network hardhat scripts/verify-suite.js`
 */
async function main() {
  const { contracts } = await readContracts("137", "polygon");

  // Verify on test node if test env
  if (network === "test" || network === "localhost") {
    await verifyOnTestEnv(contracts);
  }

  // Bail now if deploying locally
  if (network === "hardhat" || network === "test" || network === "localhost") process.exit();

  console.log("🔍 Verifying contracts on block explorer...");
  while (contracts.length) {
    const contract = contracts.shift();
    await verifyOnBlockExplorer(contract);
  }

  console.log("\n");

  process.exit(0);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
