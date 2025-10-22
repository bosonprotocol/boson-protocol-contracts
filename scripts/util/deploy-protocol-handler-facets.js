const { getFacetAddCut, cutDiamond, getInitializeCalldata } = require("./diamond-utils.js");
const hre = require("hardhat");
const { getContractFactory } = hre.ethers;
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
 * @param version - optional version of the protocol
 * @param initializationFacet - optional initialization facet if it was already deployed
 * @param interfacesToAdd - optional interfaces to add to the diamond
 * @returns {Promise<(*|*|*)[]>}
 */
async function deployAndCutFacets(
  diamond,
  facetData,
  maxPriorityFeePerGas,
  version = "2.2.0",
  initializationFacet,
  interfacesToAdd = []
) {
  const facetNames = Object.keys(facetData);
  let deployedFacets = await deployProtocolFacets(facetNames, facetData, maxPriorityFeePerGas);

  const facetsToInit = deployedFacets.filter((facet) => facet.initialize) ?? [];

  initializationFacet =
    initializationFacet || deployedFacets.find((f) => f.name == "ProtocolInitializationHandlerFacet").contract;

  const initializeCalldata = await getInitializeCalldata(
    facetsToInit,
    version,
    false,
    "0x", // no initialization data
    initializationFacet,
    undefined,
    interfacesToAdd
  );

  deployedFacets = await Promise.all(
    deployedFacets.map(async (facet) => {
      const cut =
        facet.name === "ProtocolInitializationHandlerFacet"
          ? await getFacetAddCut(facet.contract, [initializeCalldata.slice(0, 10)])
          : await getFacetAddCut(facet.contract, facet.initialize ? [facet.initialize.slice(0, 10)] : []);

      facet.cut.push(cut);
      return facet;
    })
  );

  const cutTransaction = await cutDiamond(
    diamond,
    maxPriorityFeePerGas,
    deployedFacets,
    await initializationFacet.getAddress(),
    initializeCalldata
  );

  return { deployedFacets, cutTransaction };
}

/**
 * Cut the Protocol Handler facets
 *
 * Reused between deployment script and unit tests for consistency.
 *
 * @param facetNames - array of facet names to deploy
 * @param facetsToInit - object with facet names and corresponding constructor and/or initialization arguments
 *                       {facetName1: {constructorArgs: constructorArgs1, init: initializerArguments1}, facetName2: {init: initializerArguments2}, ...}
 *                       provide only for facets that have constructor or should be initialized
 * @param maxPriorityFeePerGas - maxPriorityFeePerGas for transactions
 * @returns {Promise<(*|*|*)[]>}
 */
async function deployProtocolFacets(facetNames, facetsToInit, maxPriorityFeePerGas, deployer = null) {
  let deployedFacets = [];

  // Deploy all handler facets
  for (const facetName of facetNames) {
    let FacetContractFactory;

    // Use specific deployer for localhost Docker environment
    if (deployer) {
      FacetContractFactory = await getContractFactory(facetName, deployer);
    } else {
      FacetContractFactory = await getContractFactory(facetName);
    }

    const constructorArgs = (facetsToInit[facetName] && facetsToInit[facetName].constructorArgs) || [];
    const facetContract = await FacetContractFactory.deploy(...constructorArgs, await getFees(maxPriorityFeePerGas));
    await facetContract.deploymentTransaction().wait(confirmations);

    const deployedFacet = {
      name: facetName,
      contract: facetContract,
      cut: [],
      constructorArgs,
    };

    if (facetsToInit[facetName] && facetsToInit[facetName].init && facetName !== "ProtocolInitializationHandlerFacet") {
      const calldata = facetContract.interface.encodeFunctionData(
        "initialize",
        (facetsToInit[facetName].init.length && facetsToInit[facetName].init) || []
      );

      deployedFacet.initialize = calldata;
    }

    deployedFacets.push(deployedFacet);
  }

  // Return an array of objects with facet name, contract properties and initialize calldata
  return deployedFacets;
}

exports.deployAndCutFacets = deployAndCutFacets;
exports.deployProtocolFacets = deployProtocolFacets;
