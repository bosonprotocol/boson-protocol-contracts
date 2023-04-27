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
    HEAD: {
      // HEAD is a special tag that is used to test upgrades to the latest version
      addOrUpgrade: [
        "ProtocolInitializationHandlerFacet",
        "OfferHandlerFacet",
        "ExchangeHandlerFacet",
        "ConfigHandlerFacet",
        "DisputeResolverHandlerFacet",
      ],
      remove: [],
      skipSelectors: {},
      facetsToInit: {},
      initializationData: "0x0000000000000000000000000000000000000000000000000000000000005555", // input for initV2_2_0, representing maxPremintedVoucher (0x5555=21845)
    },
  },
};

// Versions that have the same deploy config
facets.deploy["v2.1.0"] = facets.deploy["v2.0.0"];

exports.facets = facets;
