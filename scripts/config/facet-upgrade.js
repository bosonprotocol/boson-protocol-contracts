/**
 * Config file used to upgrade the facets
 *
 * - addOrUpgrade: list of facets that will be upgraded or added
 * - remove: list of facets that will be completely removed
 * - skipSelectors:  mapping "facetName":"listOfFunctionsToBeSkipped". With this you can specify functions that will be ignored during the update.
 *          You don't have to specify "initialize()" since it's ignored by default.
 *          Skip does not apply to facets that are completely removed.
 * - facetsToInit: list of facets that will be initialized on ProtocolInitializationHandlerFacet. 
 *                 if facet initializer or constructor expects arguments, provide them here. For no-arg initializers pass an empty array.
 *                 You don't have to provide ProtocolInitializationHandlerFacet args here because they are generated on cut function.
 * - initializationData: ABI encoded data that is initialized directly on ProtocolInitializationHandlerFacet and not on any other facet, using versions specific init function.
 * 
 * Example:
    {
      addOrUpgrade: ["Facet1", "Facet2"],
      remove: ["Facet3"],
      skipSelectors: { Facet1: ["function1(address)", "function2(uint256,bool)"] },
      facetsToInit: 
         {
             Facet4: { init:  ["0xb0b1d2659e8d5846432c66de8615841cc7bcaf49", 3, true], constructorArgs: [] },          
             Facet5: { init: [], constructorArgs: [[2, 3, 5, 7, 11]] },                                       
             Facet6: []                                                
         },
      initializationData: "0x0000000000000000000000000000000000000000000000000000000000000012"
    }
 */
async function getFacets() {
  return {
    addOrUpgrade: [],
    remove: [],
    skipSelectors: {},
    facetsToInit: {},
    initializationData: "0x",
  };
}

exports.getFacets = getFacets;
