const hre = require("hardhat");
const { ZeroAddress } = hre.ethers;

const { deployProtocolClientImpls } = require("./deploy-protocol-client-impls.js");
const { deployProtocolClientProxies } = require("./deploy-protocol-client-proxies.js");
const { deployProtocolClientBeacons } = require("./deploy-protocol-client-beacons.js");
const { castProtocolClientProxies } = require("./cast-protocol-client-proxies.js");

/**
 * Deploy the Protocol Client Implementation/Proxy pairs
 *
 * Protocol clients are the contracts in the system that communicate with
 * the ProtocolDiamond directly rather than acting as facets of it.
 *
 * Implementors include:
 * - BosonVoucher
 *
 *  N.B. Intended for use with both test and deployment scripts
 *
 * @param protocolClientArgs
 * @param maxPriorityFeePerGas - maxPriorityFeePerGas for transactions
 * @param implementationArgs - array of arguments to send to implementation constructor
 * @returns {Promise<(*|*|*)[]>}
 */
async function deployProtocolClients(protocolClientArgs, maxPriorityFeePerGas, implementationArgs = [ZeroAddress]) {
  // Deploy Protocol Client implementation contracts
  const protocolClientImpls = await deployProtocolClientImpls(implementationArgs, maxPriorityFeePerGas);

  // Deploy Protocol Client beacon contracts
  const protocolClientBeacons = await deployProtocolClientBeacons(
    protocolClientImpls,
    protocolClientArgs,
    maxPriorityFeePerGas
  );

  // Deploy Protocol Client proxy contracts
  const protocolClientProxies = await deployProtocolClientProxies(protocolClientBeacons, maxPriorityFeePerGas);

  // Cast the proxies to their implementation interfaces
  const protocolClients = await castProtocolClientProxies(protocolClientProxies);

  return [protocolClientImpls, protocolClientBeacons, protocolClientProxies, protocolClients];
}

exports.deployProtocolClients = deployProtocolClients;
