const { EXCHANGE_ID_2_2_0, WrappedNative } = require("../protocol-parameters");
const network = require("hardhat").network.name;

async function getFacets() {
  return {
    addOrUpgrade: [
      "OfferHandlerFacet",
      "ExchangeHandlerFacet",
      "ExchangeCommitFacet",
      "BuyerHandlerFacet",
      "SellerHandlerFacet",
      "AgentHandlerFacet",
      "DisputeHandlerFacet",
      "DisputeResolverHandlerFacet",
      "FundsHandlerFacet",
      "OrchestrationHandlerFacet1",
      "OrchestrationHandlerFacet2",
      "PriceDiscoveryHandlerFacet",
      "SequentialCommitHandlerFacet",
      "MetaTransactionsHandlerFacet",
      "ConfigHandlerFacet",
      "GroupHandlerFacet",
      "TwinHandlerFacet",
      "PauseHandlerFacet",
      "ProtocolInitializationHandlerFacet",
    ],
    remove: [],
    skipSelectors: {},
    facetsToInit: {
      ExchangeHandlerFacet: { constructorArgs: [EXCHANGE_ID_2_2_0[network], WrappedNative[network]], init: [] },
      DisputeHandlerFacet: { constructorArgs: [WrappedNative[network]], init: [] },
      PriceDiscoveryHandlerFacet: { constructorArgs: [WrappedNative[network]] },
      SequentialCommitHandlerFacet: { constructorArgs: [WrappedNative[network]] },
      ExchangeCommitFacet: { constructorArgs: [], init: [] }, // New facet initialization
      MetaTransactionsHandlerFacet: { constructorArgs: [], init: [[]] }, // Init mappings; but don't allowlist
    },
    initializationData: "0x",
  };
}

exports.getFacets = getFacets;
