const hre = require("hardhat");
const ethers = hre.ethers;
const environments = require("../../environments");
const confirmations = hre.network.name == "hardhat" ? 1 : environments.confirmations;

/**
 * Deploy the Protocol Client Beacon contracts
 *
 * Protocol clients are the contracts in the system that communicate with
 * the ProtocolDiamond directly rather than acting as facets of it.
 *
 *
 *  N.B. Intended for use with both test and deployment scripts
 *
 * This script accepts the addresses of the implementation contracts
 * and deploys a ProtocolClientBeacon for each one.
 *
 * @param protocolClients
 * @param protocolClientArgs
 * @param maxPriorityFeePerGas - maxPriorityFeePerGas for transactions
 * @returns {Promise<(*|*|*)[]>}
 */
async function deployProtocolClientBeacons(protocolClients, protocolClientArgs, maxPriorityFeePerGas) {
  let bosonVoucherImpl;

  // Destructure the protocol client implementations
  [bosonVoucherImpl] = protocolClients;

  // Deploy the ClientBeacon for BosonVoucher
  const ClientBeacon = await ethers.getContractFactory("BosonClientBeacon");
  const clientBeacon = await ClientBeacon.deploy(...protocolClientArgs, bosonVoucherImpl.address, {
    maxPriorityFeePerGas,
  });
  await clientBeacon.deployTransaction.wait(confirmations);

  return [clientBeacon];
}

if (require.main === module) {
  deployProtocolClientBeacons()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

exports.deployProtocolClientBeacons = deployProtocolClientBeacons;
