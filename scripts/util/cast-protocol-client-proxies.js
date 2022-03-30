const hre = require("hardhat");
const ethers = hre.ethers;

/**
 * Cast the Protocol Client Proxy contracts to their implementation interfaces
 *
 * Protocol clients are the contracts in the system that communicate with
 * the ProtocolDiamond directly rather than acting as facets of it.
 *
 * Implementors include:
 * - BosonVoucher
 *
 *  N.B. Intended for use with both test and deployment scripts
 *
 * This script accepts the addresses of the proxy contracts and returns
 * an array of contract abstractions with the implementation abi
 *
 * @param protocolClientProxies
 * @returns {Promise<(*|*|*)[]>}
 */
async function castProtocolClientProxies(protocolClientProxies) {
  let bosonVoucherProxy;

  // Destructure the protocol client proxies
  [bosonVoucherProxy] = protocolClientProxies;

  // Cast the Proxies to the appropriate interfaces for further interaction
  const bosonVoucher = await ethers.getContractAt("BosonVoucher", bosonVoucherProxy.address);

  return [bosonVoucher];
}

if (require.main === module) {
  castProtocolClientProxies()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

exports.castProtocolClientProxies = castProtocolClientProxies;
