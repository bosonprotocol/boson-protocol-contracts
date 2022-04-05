const { getFacetAddCut } = require("./diamond-utils.js");
const hre = require("hardhat");
const ethers = hre.ethers;

/**
 * Cut the Config Handler facet
 *
 * Reused between deployment script and unit tests for consistency.
 * Deployed separately from other facets, because it requires a config object.
 *
 * @param diamond
 * @param config
 * @param gasLimit - gasLimit for transactions
 * @returns {Promise<(*|*|*)[]>}
 */
async function deployProtocolConfigFacet(diamond, config, gasLimit) {
  // Deploy the ConfigHandler Facet
  const ConfigHandlerFacet = await ethers.getContractFactory("ConfigHandlerFacet");
  const configHandlerFacet = await ConfigHandlerFacet.deploy({ gasLimit });
  await configHandlerFacet.deployed();

  // Cast Diamond to DiamondCutFacet
  const cutFacet = await ethers.getContractAt("DiamondCutFacet", diamond.address);

  // Cut ConfigHandler facet, initializing
  let configInitFunction =
      "initialize(address payable _tokenAddress, address payable _treasuryAddress, address _voucherAddress, uint16 _protocolFeePercentage, uint16 _maxOffersPerGroup, uint16 _maxTwinsPerBundle)";
  const configInterface = new ethers.utils.Interface([`function ${configInitFunction}`]);
  const configCallData = configInterface.encodeFunctionData("initialize", config);
  const configHandlerCut = getFacetAddCut(configHandlerFacet, [configInitFunction]);
  await cutFacet.diamondCut([configHandlerCut], configHandlerFacet.address, configCallData, { gasLimit });

  return [configHandlerFacet];
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
