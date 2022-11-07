/**
 * Config file used to upgrade the facets
 *
 * - addOrUpgrade: list of facets that will be upgraded or added
 * - remove: list of facets that will be completely removed
 * - skipSelectors:  mapping "facetName":"listOfFunctionsToBeSkipped". With this you can specify functions that will be ignored during the update.
 *          You don't have to specify "initialize()" since it's ignored by default.
 *          Skip does not apply to facets that are completely removed.
 * - initArgs: if facet initializer expects arguments, provide them here. For no-arg initializers you don't have to specify anything.
 * - skipInit": list of facets for which you want to skip initialization call.
 *
 * Example:
    {
      addOrUpgrade: ["Facet1", "Facet2"],
      remove: ["Facet3"],
      skipSelectors: { Facet1: ["function1(address)", "function2(uint256,bool)"] },
      initArgs: { 
        Facet4: ["0xb0b1d2659e8d5846432c66de8615841cc7bcaf49", [2, 3, 5]], 
        Facet5: ["v1.1.0"]
      },
      skipInit: ["Facet2"],
    }
 */
exports.Facets = {
  addOrUpgrade: ["SellerHandlerFacet"],
  remove: [],
  skipSelectors: {},
  initArgs: {},
  skipInit: [],
};
