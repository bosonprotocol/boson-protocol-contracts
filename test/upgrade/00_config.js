/*
Immutable facet configs for deployment and upgrade, used in upgrade test.

This file contains deployment and upgrade configs for each tag. Format of config must adhere to format specified in
- scripts/config/facet-deploy.js
- scripts/config/facet-upgrade.js

*/

const facets = {
  deploy: {
    "v2.0.0": {
      noArgFacets: [
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
        "MetaTransactionsHandlerFacet",
      ],
      argFacets: {},
    },
  },
  upgrade: {
    "v2.1.0": {
      addOrUpgrade: ["ERC165Facet", "AccountHandlerFacet", "SellerHandlerFacet", "DisputeResolverHandlerFacet"],
      remove: [],
      skipSelectors: {},
      initArgs: {},
      skipInit: ["ERC165Facet"],
    },
  },
};

// Versions that have the same deploy config
facets.deploy["v2.1.0"] = facets.deploy["v2.0.0"];

exports.facets = facets;
