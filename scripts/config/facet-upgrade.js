/**
 * Config file used to upgrade the facets
 *
 * - addOrUpgrade: list of facets that will be upgraded or added
 * - remove: list of facets that will be completely removed
 * - skip:  mapping "facetName":"listOfFunctionsToBeSkipped". With this you can specify functions that will be ignored during the update.
 *          You don't have to specify "initialize()" since it's ignored by default.
 *          Skip does not apply to facets that are completely removed.
 */
exports.Facets = {
  addOrUpgrade: ["SellerHandlerFacet", "BuyerHandlerFacet"],
  remove: [],
  skip: { SellerHandlerFacet: [] },
};
