/**
 * Config file used to upgrade the facets
 *
 * - addOrUpgrade: list of facets that will be upgraded or added
 * - remove: list of facets that will be completely removed
 * - skipSelectors:  mapping "facetName":"listOfFunctionsToBeSkipped". With this you can specify functions that will be ignored during the update.
 *          You don't have to specify "initialize()" since it's ignored by default.
 *          Skip does not apply to facets that are completely removed.
 * - initArgs: if facet initializer expects arguments, provide it here. For no-arg initializers you don't have to specify anything.
 * - skipInit": list of facets for which you want to skip initialization call.
 */
exports.Facets = {
  addOrUpgrade: ["MetaTransactionsHandlerFacet"],
  remove: [],
  skipSelectors: { SellerHandlerFacet: [] },
  initArgs: { MetaTransactionsHandlerFacet: [[]] },
  skipInit: ["MetaTransactionsHandlerFacet"],
};
