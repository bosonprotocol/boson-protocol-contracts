const { deployProtocolHandlerFacetsWithArgs } = require("./deploy-protocol-handler-facets.js");

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
  // Use generic script for facets with initializer with arguments to deploy ConfigHandler Facet
  const deployedFacet = await deployProtocolHandlerFacetsWithArgs(
    diamond,
    { ConfigHandlerFacet: config },
    maxPriorityFeePerGas
  );

  // Return the cut transaction to test the events emitted by the initializer function
  return { facets: [deployedFacet[0].contract], cutTransaction: deployedFacet[0].cutTransaction };
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
