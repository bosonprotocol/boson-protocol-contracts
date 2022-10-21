/**
 * Config file used to upgrade the facets
 *
 * - addOrUpgrade: list of facets that will be upgraded or added
 * - remove: list of facets that will be completely removed
 * - skip:  mapping "facetName":"listOfFunctionsToBeSkipped". With this you can specify functions that will be ignored during the update.
 *          You don't have to specify "initialize()" since it's ignored by default.
 *          Skip does not apply to facets that are completely removed.
 * - initArgs: if facet initializer expects arguments, provide it here. For no-arg initializers you don't have to specify anything.
 */
exports.Facets = {
  addOrUpgrade: ["SellerHandlerFacet", "BuyerHandlerFacet", "MetaTransactionsHandlerFacet"],
  remove: [],
  skip: { SellerHandlerFacet: [] },
  initArgs: { MetaTransactionsHandlerFacet: [[]] },
};
