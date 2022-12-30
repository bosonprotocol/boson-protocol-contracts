/*
Immutable facet configs for deployment and upgrade, used in upgrade test.

This file contains deployment and upgrade configs for each tag. Format of config must adhere to format specified in
- scripts/config/facet-deploy.js
- scripts/config/facet-upgrade.js
*/

const { getStateModifyingFunctionsHashes } = require("../../scripts/util/diamond-utils");

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
  "OrchestrationHandlerFacet1",
  "OrchestrationHandlerFacet2",
  "TwinHandlerFacet",
  "PauseHandlerFacet",
];

async function getFacets() {
  const MetaTransactionsHandlerFacetInitArgs = await getStateModifyingFunctionsHashes(
    [...noArgFacetNames, "MetaTransactionsHandlerFacet"],
    ["executeMetaTransaction(address,string,bytes,uint256,bytes32,bytes32,uint8)"]
  );

  // Versions that have the same deploy config
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
      "v2.2.0-rc.1": {
        addOrUpgrade: [
          "MetaTransactionsHandlerFacet",
          "TwinHandlerFacet",
          "ProtocolInitializationHandlerFacet",
          "OfferHandlerFacet",
          "ExchangeHandlerFacet",
          "ConfigHandlerFacet",
          "DisputeResolverHandlerFacet",
          "OrchestrationHandlerFacet1",
          "OrchestrationHandlerFacet2",
        ],
        remove: ["OrchestrationHandlerFacet"],
        skipSelectors: {},
        facetsToInit: {
          MetaTransactionsHandlerFacet: [MetaTransactionsHandlerFacetInitArgs],
        },

        initializationData: "0x0000000000000000000000000000000000000000000000000000000000005555", // input for initV2_2_0, representing maxPremintedVoucher (0x5555=21845)
      },
      HEAD: {
        // HEAD is a special tag that is used to test upgrades to the latest version
        addOrUpgrade: [
          "MetaTransactionsHandlerFacet",
          "TwinHandlerFacet",
          "ProtocolInitializationHandlerFacet",
          "OfferHandlerFacet",
          "ExchangeHandlerFacet",
          "ConfigHandlerFacet",
          "DisputeResolverHandlerFacet",
          "OrchestrationHandlerFacet1",
          "OrchestrationHandlerFacet2",
        ],
        remove: [],
        skipSelectors: {},
        facetsToInit: {
          MetaTransactionsHandlerFacet: [MetaTransactionsHandlerFacetInitArgs],
        },
        initializationData: "0x0000000000000000000000000000000000000000000000000000000000005555", // input for initV2_2_0, representing maxPremintedVoucher (0x5555=21845)
      },
    },
  };

  facets.deploy["v2.1.0"] = facets.deploy["v2.0.0"];
  return facets;
}

exports.getFacets = getFacets;
