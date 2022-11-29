/**
 * Config file used to upgrade the facets
 *
 * - addOrUpgrade: list of facets that will be upgraded or added
 * - remove: list of facets that will be completely removed
 * - skipSelectors:  mapping "facetName":"listOfFunctionsToBeSkipped". With this you can specify functions that will be ignored during the update.
 *          You don't have to specify "initialize()" since it's ignored by default.
 *          Skip does not apply to facets that are completely removed.
 * 
 * Example:
    {
      addOrUpgrade: ["Facet1", "Facet2"],
      remove: ["Facet3"],
      skipSelectors: { Facet1: ["function1(address)", "function2(uint256,bool)"] },
    }
 */
async function getFacets() {
  return {
    addOrUpgrade: ["ProtocolInitializationHandlerFacet"],
    remove: [],
    skipSelectors: {},
  };
}

exports.getFacets = getFacets;
