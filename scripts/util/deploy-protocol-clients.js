const { deployProtocolClientImpls } = require("./deploy-protocol-client-impls.js");
const { deployProtocolClientProxies } = require("./deploy-protocol-client-proxies.js");
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
 * @param gasLimit - gasLimit for transactions
 * @returns {Promise<(*|*|*)[]>}
 */
async function deployProtocolClients(protocolClientArgs, gasLimit) {
  // Deploy Protocol Client implementation contracts
  const protocolClientImpls = await deployProtocolClientImpls(gasLimit);

  // Deploy Protocol Client proxy contracts
  const protocolClientProxies = await deployProtocolClientProxies(protocolClientImpls, protocolClientArgs, gasLimit);

  // Cast the proxies to their implementation interfaces
  const protocolClients = await castProtocolClientProxies(protocolClientProxies);

  return [protocolClientImpls, protocolClientProxies, protocolClients];
}

if (require.main === module) {
  deployProtocolClients()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

exports.deployProtocolClients = deployProtocolClients;
