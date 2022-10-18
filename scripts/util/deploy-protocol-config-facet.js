const { getFacetAddCut } = require("./diamond-utils.js");
const hre = require("hardhat");
const ethers = hre.ethers;
const environments = require("../../environments");
const confirmations = hre.network.name == "hardhat" ? 1 : environments.confirmations;
const { getFees } = require("./utils");

/**
 * Cut the Config Handler facet
 *
 * Reused between deployment script and unit tests for consistency.
 * Deployed separately from other facets, because it requires a config object.
 *
 * @param diamond
 * @param config
 * @param maxPriorityFeePerGas - maxPriorityFeePerGas for transactions
 * @returns {Promise<(*|*|*)[]>}
 */
async function deployProtocolConfigFacet(diamond, config, maxPriorityFeePerGas) {
  // Deploy the ConfigHandler Facet
  const ConfigHandlerFacet = await ethers.getContractFactory("ConfigHandlerFacet");
  const configHandlerFacet = await ConfigHandlerFacet.deploy(await getFees(maxPriorityFeePerGas));
  await configHandlerFacet.deployTransaction.wait(confirmations);

  // Cast Diamond to DiamondCutFacet
  const cutFacet = await ethers.getContractAt("DiamondCutFacet", diamond.address);

  // Cut ConfigHandler facet, initializing
  const configCallData = ConfigHandlerFacet.interface.encodeFunctionData("initialize", config);
  const configHandlerCut = getFacetAddCut(configHandlerFacet, [configCallData.slice(0, 10)]);
  const diamondCut = await cutFacet.diamondCut(
    [configHandlerCut],
    configHandlerFacet.address,
    configCallData,
    await getFees(maxPriorityFeePerGas)
  );

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
