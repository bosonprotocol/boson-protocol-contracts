const { getFacetAddCut } = require("./diamond-utils.js");
const hre = require("hardhat");
const ethers = hre.ethers;
const environments = require("../../environments");
const confirmations = hre.network.name === "hardhat" ? 1 : environments.confirmations;
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
 * @param facetData - object with facet names and corresponding initialization arguments {facetName1: initializerArguments1, facetName2: initializerArguments2, ...}
 * @param maxPriorityFeePerGas - maxPriorityFeePerGas for transactions
 * @param doCut - boolean that tells if cut transaction should be done or not (default: true)
 * @returns {Promise<(*|*|*)[]>}
 */
async function deployProtocolHandlerFacetsWithArgs(
  diamond,
  facetData,
  maxPriorityFeePerGas,
  doCut = true,
  protocolInitializationFacet
) {
  let deployedFacets = [];
  let facetsToInitialize = {};

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
      const calldata = facetContract.interface.encodeFunctionData("initialize", facetData[facetName]);
      facetsToInitialize[facetContract.address] = calldata;

      deployedFacet.cut = getFacetAddCut(facetContract, calldata.slice(0, 10));
    } else {
      protocolInitializationFacet = facetContract;
    }

    deployedFacets.push(deployedFacet);
  }

  // Cut the diamond with all facets
  if (doCut) {
    const version = ethers.utils.formatBytes32String("2.2.0");

    await cutDiamond(
      diamond,
      deployedFacets,
      maxPriorityFeePerGas,
      protocolInitializationFacet,
      version,
      facetsToInitialize
    );
  }

  // Return an array of objects with facet name and contract properties
  return deployedFacets;
}

async function cutDiamond(
  diamond,
  deployedFacets,
  maxPriorityFeePerGas,
  protocolInitializationFacet,
  version,
  facetsToInitialize,
  isUpgrade = false
) {
  const diamondCutFacet = await ethers.getContractAt("DiamondCutFacet", diamond.address);

  const args = [version, Object.keys(facetsToInitialize) ?? [], Object.values(facetsToInitialize) ?? [], isUpgrade];

  const calldataProtocolInitialization = protocolInitializationFacet.interface.encodeFunctionData(
    "initializeProtocol",
    args
  );

  // Remove initializeProtocol from selectors if is present
  deployedFacets = deployedFacets.map((f) => {
    if (f.name == "ProtocolInitializationFacet") {
      f.cut = getFacetAddCut(f.contract, [calldataProtocolInitialization.slice(0, 10)]);
    }
    return f;
  });

  const transactionResponse = await diamondCutFacet.diamondCut(
    deployedFacets.map((facet) => facet.cut),
    protocolInitializationFacet.address,
    calldataProtocolInitialization,
    await getFees(maxPriorityFeePerGas)
  );

  await transactionResponse.wait(confirmations);

  return transactionResponse;
}

exports.deployProtocolHandlerFacets = deployProtocolHandlerFacets;
exports.deployProtocolHandlerFacetsWithArgs = deployProtocolHandlerFacetsWithArgs;
