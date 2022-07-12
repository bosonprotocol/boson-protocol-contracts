const hre = require("hardhat");
const ethers = hre.ethers;

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
 * @returns {Promise<(*|*|*)[]>}
 */
async function deployProtocolClientProxies(protocolClients, gasLimit) {
  let bosonBeacon;

  // Destructure the protocol client implementations
  [bosonBeacon] = protocolClients;

  // Deploy the ClientProxy for BosonVoucher
  const ClientProxy = await ethers.getContractFactory("ClientProxyBeacon");
  const clientProxy = await ClientProxy.deploy({ gasLimit });
  await clientProxy.deployed();

  // init instead of constructors
  await clientProxy.initialize(bosonBeacon.address);

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
