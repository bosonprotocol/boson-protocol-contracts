const hre = require("hardhat");
const ethers = hre.ethers;
const environments = require("../../environments");
const confirmations = hre.network.name == "hardhat" ? 1 : environments.confirmations;
const { getFees } = require("./utils");

/**
 * Deploy the Protocol Client implementation contracts
 *
 * Protocol clients are the contracts in the system that communicate with
 * the ProtocolDiamond directly rather than acting as facets of it.
 *
 * Implementors include:
 * - BosonVoucher
 *
 *  N.B. Intended for use with both test and deployment scripts
 *
 * @param maxPriorityFeePerGas - maxPriorityFeePerGas for transactions
 * @returns {Promise<(*|*|*)[]>}
 */
async function deployProtocolClientImpls(maxPriorityFeePerGas) {
  // Deploy the BosonVoucher contract
  const BosonVoucher = await ethers.getContractFactory("BosonVoucher");
  const bosonVoucher = await BosonVoucher.deploy(await getFees(maxPriorityFeePerGas));
  await bosonVoucher.deployTransaction.wait(confirmations);

  return [bosonVoucher];
}

if (require.main === module) {
  deployProtocolClientImpls()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

exports.deployProtocolClientImpls = deployProtocolClientImpls;
