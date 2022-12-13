const { getFacetAddCut, cutDiamond } = require("./diamond-utils.js");
const hre = require("hardhat");
const ethers = hre.ethers;
const environments = require("../../environments");
const confirmations = hre.network.name === "hardhat" ? 1 : environments.confirmations;
const { getFees } = require("./utils");

/**
 * Cut the Protocol Handler facets
 *
 * Reused between deployment script and unit tests for consistency.
 *
 * @param diamond
 * @param facetData - object with facet names and corresponding initialization arguments {facetName1: initializerArguments1, facetName2: initializerArguments2, ...}
 *                    if facet doesn't expect any argument, pass empty array
 * @param maxPriorityFeePerGas - maxPriorityFeePerGas for transactions
 * @param doCut - boolean that tells if cut transaction should be done or not (default: true)
 * @returns {Promise<(*|*|*)[]>}
 */
async function deployAndCutFacets(diamond, facetData, maxPriorityFeePerGas) {
  const facetNames = Object.keys(facetData);
  let deployedFacets = await deployProtocolFacets(facetNames, facetData, maxPriorityFeePerGas);

  deployedFacets = deployedFacets.map((facet) => {
    // Facet cut to ProtocolInitializationFacet is added on cutDiamodn function
    if (facet.name != "ProtocolInitializationFacet") {
      facet.cutAdd = getFacetAddCut(facet.contract, [facet.initialize && facet.initialize.slice(0, 10)] || []);
    }
    return facet;
  });

  const cutTransaction = await cutDiamond(
    diamond,
    maxPriorityFeePerGas,
    deployedFacets,
    deployedFacets.find((f) => f.name == "ProtocolInitializationFacet").contract,
    "2.0.0",
    false
  );

  return { deployedFacets, cutTransaction };
}

/**
 * Cut the Protocol Handler facets
 * @TODO
 * Reused between deployment script and unit tests for consistency.
 *
 * @param facetData - object with facet names and corresponding initialization arguments {facetName1: initializerArguments1, facetName2: initializerArguments2, ...}
 *                    if facet doesn't expect any argument, pass empty array
 * @param maxPriorityFeePerGas - maxPriorityFeePerGas for transactions
 * @param doCut - boolean that tells if cut transaction should be done or not (default: true)
 * @param protocolInitializationFacet - ProtocolInitializationFacet contract instance if it was already deployed
 * @param version - version of the protocol
 * @returns {Promise<(*|*|*)[]>}
 */
async function deployProtocolFacets(facetNames, facetsToInit, maxPriorityFeePerGas) {
  let deployedFacets = [];

  // Deploy all handler facets
  for (const facetName of facetNames) {
    let FacetContractFactory = await ethers.getContractFactory(facetName);
    const facetContract = await FacetContractFactory.deploy(await getFees(maxPriorityFeePerGas));
    await facetContract.deployTransaction.wait(confirmations);

    const deployedFacet = {
      name: facetName,
      contract: facetContract,
    };

    if (facetsToInit[facetName] && facetName !== "ProtocolInitializationFacet") {
      const calldata = facetContract.interface.encodeFunctionData(
        "initialize",
        facetsToInit[facetName].length && facetsToInit[facetName]
      );

      deployedFacet.initialize = calldata;
    }

    deployedFacets.push(deployedFacet);
  }

  // Return an array of objects with facet name and contract properties
  return deployedFacets;
}

exports.deployAndCutFacets = deployAndCutFacets;
exports.deployProtocolFacets = deployProtocolFacets;
