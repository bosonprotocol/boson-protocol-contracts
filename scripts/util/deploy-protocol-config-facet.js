const { getFacetAddCut } = require("./diamond-utils.js");
const hre = require("hardhat");
const ethers = hre.ethers;
const environments = require("../../environments");
const confirmations = environments.confirmations;

/**
 * Cut the Config Handler facet
 *
 * Reused between deployment script and unit tests for consistency.
 * Deployed separately from other facets, because it requires a config object.
 *
 * @param diamond
 * @param config
 * @param gasLimit - gasLimit for transactions
 * @param gasPrice - gasPrice for transactions
 * @returns {Promise<(*|*|*)[]>}
 */
async function deployProtocolConfigFacet(diamond, config, gasLimit, gasPrice) {
  // Deploy the ConfigHandler Facet
  const ConfigHandlerFacet = await ethers.getContractFactory("ConfigHandlerFacet");
  const configHandlerFacet = await ConfigHandlerFacet.deploy({ gasLimit: gasLimit, gasPrice: ethers.utils.parseUnits(gasPrice, 'gwei') });
  await configHandlerFacet.deployTransaction.wait(confirmations);

  // Cast Diamond to DiamondCutFacet
  const cutFacet = await ethers.getContractAt("DiamondCutFacet", diamond.address);

  // Cut ConfigHandler facet, initializing
  const configCallData = ConfigHandlerFacet.interface.encodeFunctionData("initialize", config);
  const configHandlerCut = getFacetAddCut(configHandlerFacet, [configCallData.slice(0, 10)]);
  const diamondCut = await cutFacet.diamondCut([configHandlerCut], configHandlerFacet.address, configCallData, {
    gasLimit: gasLimit, gasPrice: ethers.utils.parseUnits(gasPrice, 'gwei')
  });

  await diamondCut.wait(confirmations);

  // Return the cut transaction to test the events emitted by the initializer function
  return { facets: [configHandlerFacet], cutTransaction: diamondCut };
}

if (require.main === module) {
  deployProtocolConfigFacet()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

exports.deployProtocolConfigFacet = deployProtocolConfigFacet;
