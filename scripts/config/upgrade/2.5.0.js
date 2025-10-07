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
      ExchangeHandlerFacet: { constructorArgs: [EXCHANGE_ID_2_2_0[network], WrappedNative[network]] },
      DisputeHandlerFacet: { constructorArgs: [WrappedNative[network]] },
      PriceDiscoveryHandlerFacet: { constructorArgs: [WrappedNative[network]] },
      SequentialCommitHandlerFacet: { constructorArgs: [WrappedNative[network]] },
      ExchangeCommitFacet: { constructorArgs: [] }, // New facet initialization
    },
    initializationData: "0x",
  };
}

exports.getFacets = getFacets;
