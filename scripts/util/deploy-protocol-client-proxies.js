const hre = require("hardhat");
const ethers = hre.ethers;
const environments = require("../../environments");
const confirmations = environments.confirmations;

/**
 * Deploy the Protocol Client Proxy contracts
 *
 * Protocol clients are the contracts in the system that communicate with
 * the ProtocolDiamond directly rather than acting as facets of it.
 *
 * Implementors include:
 * - BosonVoucher
 *
 *  N.B. Intended for use with both test and deployment scripts
 *
 * This script accepts the addresses of the implementation contracts
 * and deploys a ProtocolClientProxy for each one.
 *
 * @param protocolClients
 * @param protocolClientArgs
 * @param gasLimit - gasLimit for transactions
 * @param gasPrice: gasPrice for transactions
 * @returns {Promise<(*|*|*)[]>}
 */
async function deployProtocolClientProxies(protocolClients, gasLimit, gasPrice) {
  let bosonClientBeacon;

  // Destructure the protocol client implementations
  [bosonClientBeacon] = protocolClients;

  // Deploy the ClientProxy for BosonVoucher
  const ClientProxy = await ethers.getContractFactory("BeaconClientProxy");
  const clientProxy = await ClientProxy.deploy({ gasLimit: gasLimit, gasPrice: gasPrice });
  await clientProxy.deployTransaction.wait(confirmations);

  // init instead of constructors
  let transactionResponse = await clientProxy.initialize(bosonClientBeacon.address);
  await transactionResponse.wait(confirmations);

  return [clientProxy];
}

if (require.main === module) {
  deployProtocolClientProxies()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

exports.deployProtocolClientProxies = deployProtocolClientProxies;
