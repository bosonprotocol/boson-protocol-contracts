/**
 */
exports.Facets = {
  names: ["SellerHandlerFacet", "BuyerHandlerFacet"],
  skip: { SellerHandlerFacet: ["getSellerByAddress(address)", "getSeller(uint256)"] },
};
