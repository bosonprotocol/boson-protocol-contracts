const { getStateModifyingFunctionsHashes } = require("../../scripts/util/diamond-utils.js");

/**
 * Config file used to deploy the facets
 *
 * - noArgFacets: list of facet names that don't expect any argument passed into initializer
 * - argFacets: object that specify facet names and arguments that needs to be passed into initializer in format object {facetName: initializerArguments}
 * 
 * Example: 
    {
      noArgFacets: ["Facet1", "Facet2", "Facet3"],
      argFacets: { 
        Facet4: ["0xb0b1d2659e8d5846432c66de8615841cc7bcaf49", 3, true],  // Facet4 expects address, uint256 and bool
        Facet5: [[2, 3, 5, 7, 11]] },                                     // Facet5 uint256 array
    }
 * 
 */

const noArgFacetNames = [
  "AccountHandlerFacet",
  "SellerHandlerFacet",
  "BuyerHandlerFacet",
  "DisputeResolverHandlerFacet",
  "AgentHandlerFacet",
  "BundleHandlerFacet",
  "DisputeHandlerFacet",
  "ExchangeHandlerFacet",
  "FundsHandlerFacet",
  "GroupHandlerFacet",
  "OfferHandlerFacet",
  "OrchestrationHandlerFacet",
  "TwinHandlerFacet",
  "PauseHandlerFacet",
];

async function getFacets() {
  // metaTransactionsHandlerFacet initializer arguments.
  const MetaTransactionsHandlerFacetInitArgs = await getStateModifyingFunctionsHashes(
    [...noArgFacetNames, "MetaTransactionsHandlerFacet"],
    ["executeMetaTransaction(address,string,bytes,uint256,bytes32,bytes32,uint8)"]
  );

  return {
    noArgFacets: noArgFacetNames,
    argFacets: { MetaTransactionsHandlerFacet: [MetaTransactionsHandlerFacetInitArgs] },
  };
}

exports.getFacets = getFacets;
