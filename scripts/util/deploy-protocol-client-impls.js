const hre = require("hardhat");
const ethers = hre.ethers;

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
 * @param gasLimit - gasLimit for transactions
 * @returns {Promise<(*|*|*)[]>}
 */
async function deployProtocolClientImpls(gasLimit) {

    // Deploy the BosonVoucher contract
    const BosonVoucher = await ethers.getContractFactory("BosonVoucher");
    const bosonVoucher = await BosonVoucher.deploy({gasLimit});
    await bosonVoucher.deployed();

    return [bosonVoucher];

}

if (require.main === module) {
    deployProtocolClientImpls()
      .then(() => process.exit(0))
      .catch(error => {
        console.error(error)
        process.exit(1)
      })
}

exports.deployProtocolClientImpls = deployProtocolClientImpls;