/**
 * Config file used to upgrade the facets
 *
 * - names: list of facets that will be upgraded or added
 * - skip:  mapping "facetName":"listOfFunctionsToBeSkipped". With this you can specify functions that will be ignored during the update.
 *          You don't have to specify "initialize()" since it's ignored by default
 */
exports.Facets = {
  names: ["SellerHandlerFacet", "BuyerHandlerFacet"],
  skip: { SellerHandlerFacet: ["getSellerByAddress(address)", "getSeller(uint256)"] },
};
