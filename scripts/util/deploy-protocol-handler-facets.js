const { getFacetAddCut } = require("./diamond-utils.js");
const hre = require("hardhat");
const ethers = hre.ethers;
const environments = require("../../environments");
const confirmations = hre.network.name == "hardhat" ? 1 : environments.confirmations;
const { getFees } = require("./utils");

/**
 * Cut the Protocol Handler facets with no-arg initializers
 *
 * Reused between deployment script and unit tests for consistency.
 *
 * @param diamond
 * @param facetNames - list of facet names to deploy and cut
 * @param maxPriorityFeePerGas - maxPriorityFeePerGas for transactions
 * @param doCut - boolean that tells if cut transaction should be done or not (default: true)
 * @returns {Promise<(*|*|*)[]>}
 */
async function deployProtocolHandlerFacets(diamond, facetNames, maxPriorityFeePerGas, doCut = true) {
  // Convert facetNames into expected facetData format
  let facetData = {};
  for (const facetName of facetNames) {
    facetData[facetName] = "";
  }

  // Make the deployment with generic method
  return deployProtocolHandlerFacetsWithArgs(diamond, facetData, maxPriorityFeePerGas, doCut);
}

/**
 * Cut the Protocol Handler facets with initializers with arguments
 *
 * Reused between deployment script and unit tests for consistency.
 *
 * @param diamond
 * @param facetNames - list of facet names to deploy and cut
 * @param args - object {facetName: initializerArguments}
 * @param maxPriorityFeePerGas - maxPriorityFeePerGas for transactions
 * @param doCut - boolean that tells if cut transaction should be done or not (default: true)
 * @returns {Promise<(*|*|*)[]>}
 */
async function deployProtocolHandlerFacetsWithArgs(diamond, facetData, maxPriorityFeePerGas, doCut = true) {
  let deployedFacets = [];

  // Deploy all the handler facets
  for (const facetName of Object.keys(facetData)) {
    // let facetName = facetNames.shift();
    let FacetContractFactory = await ethers.getContractFactory(facetName);
    const facetContract = await FacetContractFactory.deploy(await getFees(maxPriorityFeePerGas));
    await facetContract.deployTransaction.wait(confirmations);

    deployedFacets.push({
      name: facetName,
      contract: facetContract,
    });
  }

  if (doCut) {
    // Cast Diamond to DiamondCutFacet
    const diamondCutFacet = await ethers.getContractAt("DiamondCutFacet", diamond.address);

    // Cut all the facets into the diamond
    for (let i = 0; i < deployedFacets.length; i++) {
      const deployedFacet = deployedFacets[i];

      const callData = deployedFacet.contract.interface.encodeFunctionData("initialize", facetData[deployedFacet.name]);
      const facetCut = getFacetAddCut(deployedFacet.contract, [callData.slice(0, 10)]);
      const transactionResponse = await diamondCutFacet.diamondCut(
        [facetCut],
        deployedFacet.contract.address,
        callData,
        await getFees(maxPriorityFeePerGas)
      );
      await transactionResponse.wait(confirmations);
      deployedFacets[i].cutTransaction = transactionResponse;
    }
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
exports.deployProtocolHandlerFacetsWithArgs = deployProtocolHandlerFacetsWithArgs;
