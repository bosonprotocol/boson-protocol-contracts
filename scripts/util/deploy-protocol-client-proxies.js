const hre = require("hardhat");
const ethers = hre.ethers;
const environments = require("../../environments");
const confirmations = hre.network.name === "hardhat" ? 1 : environments.confirmations;
const { getFees } = require("./utils");

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
 * @param maxPriorityFeePerGas - maxPriorityFeePerGas for transactions
 * @returns {Promise<(*|*|*)[]>}
 */
async function deployProtocolClientProxies(protocolClients, maxPriorityFeePerGas) {
  let bosonClientBeacon;

  // Destructure the protocol client implementations
  [bosonClientBeacon] = protocolClients;

  // Deploy the ClientProxy for BosonVoucher
  const ClientProxy = await getContractFactory("BeaconClientProxy");
  const clientProxy = await ClientProxy.deploy(await getFees(maxPriorityFeePerGas));
  await clientProxy.deployTransaction.wait(confirmations);

  // init instead of constructors
  let transactionResponse = await clientProxy.initialize(
    await bosonClientBeacon.getAddress(),
    await getFees(maxPriorityFeePerGas)
  );
  await transactionResponse.wait(confirmations);

  return [clientProxy];
}

exports.deployProtocolClientProxies = deployProtocolClientProxies;
