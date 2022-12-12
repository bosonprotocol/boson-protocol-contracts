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
 * @param protocolInitializationFacet - ProtocolInitializationFacet contract instance if it was already deployed
 * @param version - version of the protocol
 * @returns {Promise<(*|*|*)[]>}
 */
async function deployProtocolHandlerFacets(
  diamond,
  facetData,
  maxPriorityFeePerGas,
  doCut = true,
  protocolInitializationFacet,
  version = "2.0.0"
) {
  let deployedFacets = [];
  let facetsToInitialize = {};

  if (protocolInitializationFacet) {
    delete facetData.ProtocolInitializationFacet;
  }

  // Deploy all handler facets
  for (const facetName of Object.keys(facetData)) {
    let FacetContractFactory = await ethers.getContractFactory(facetName);
    const facetContract = await FacetContractFactory.deploy(await getFees(maxPriorityFeePerGas));
    await facetContract.deployTransaction.wait(confirmations);

    const deployedFacet = {
      name: facetName,
      contract: facetContract,
    };

    if (facetName !== "ProtocolInitializationFacet") {
      const calldata = facetContract.interface.encodeFunctionData(
        "initialize",
        facetData[facetName].length && facetData[facetName]
      );
      facetsToInitialize[facetContract.address] = calldata;

      deployedFacet.cut = getFacetAddCut(facetContract, [calldata.slice(0, 10)]);
    } else if (!protocolInitializationFacet) {
      protocolInitializationFacet = facetContract;
    }

    deployedFacets.push(deployedFacet);
  }

  let cutTransaction;

  // Cut the diamond with all facets
  if (doCut) {
    version = ethers.utils.formatBytes32String(version);

    cutTransaction = await cutDiamond(
      diamond,
      deployedFacets,
      maxPriorityFeePerGas,
      protocolInitializationFacet,
      version,
      facetsToInitialize,
      false
    );
  }

  // Return an array of objects with facet name and contract properties
  return { deployedFacets, cutTransaction };
}

exports.deployProtocolHandlerFacets = deployProtocolHandlerFacets;
