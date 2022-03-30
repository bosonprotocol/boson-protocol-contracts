const { getFacetAddCut } = require("./diamond-utils.js");
const hre = require("hardhat");
const ethers = hre.ethers;

/**
 * Cut the Protocol Handler facets
 *
 * Reused between deployment script and unit tests for consistency.
 *
 * @param diamond
 * @param facetNames - list of facet names to deploy and cut
 * @param gasLimit - gasLimit for transactions
 * @returns {Promise<(*|*|*)[]>}
 */
async function deployProtocolHandlerFacets(diamond, facetNames, gasLimit) {
  let deployedFacets = [];

  // Deploy all the no-arg initializer handler facets
  while (facetNames.length) {
    let facetName = facetNames.shift();
    let FacetContractFactory = await ethers.getContractFactory(facetName);
    const facetContract = await FacetContractFactory.deploy({ gasLimit });
    await facetContract.deployed();
    deployedFacets.push({
      name: facetName,
      contract: facetContract,
    });
  }

  // Cast Diamond to DiamondCutFacet
  const diamondCutFacet = await ethers.getContractAt("DiamondCutFacet", diamond.address);

  // All handler facets currently have no-arg initializers
  let initFunction = "initialize()";
  let initInterface = new ethers.utils.Interface([`function ${initFunction}`]);
  let callData = initInterface.encodeFunctionData("initialize");

  // Cut all the facets into the diamond
  for (let i = 0; i < deployedFacets.length; i++) {
    const deployedFacet = deployedFacets[i];
    const facetCut = getFacetAddCut(deployedFacet.contract, [initFunction]);
    await diamondCutFacet.diamondCut([facetCut], deployedFacet.contract.address, callData, { gasLimit });
  }

  // Return an array of objects with facet name and contract properties
  return deployedFacets;
}

if (require.main === module) {
  deployProtocolHandlerFacets()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

exports.deployProtocolHandlerFacets = deployProtocolHandlerFacets;
