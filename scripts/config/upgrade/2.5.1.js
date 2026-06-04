const { EXCHANGE_ID_2_2_0, WrappedNative } = require("../protocol-parameters");
const network = require("hardhat").network.name;

async function getFacets() {
  return {
    addOrUpgrade: [
      "DisputeHandlerFacet",
      "ExchangeCommitFacet",
      "ExchangeHandlerFacet",
      "FundsHandlerFacet",
      "MetaTransactionsHandlerFacet",
      "OrchestrationHandlerFacet1",
      "OrchestrationHandlerFacet2",
      "PriceDiscoveryHandlerFacet",
      "SequentialCommitHandlerFacet",
    ],
    remove: [],
    skipSelectors: {},
    facetsToInit: {
      ExchangeHandlerFacet: { constructorArgs: [EXCHANGE_ID_2_2_0[network], WrappedNative[network]] },
      DisputeHandlerFacet: { constructorArgs: [WrappedNative[network]] },
      PriceDiscoveryHandlerFacet: { constructorArgs: [WrappedNative[network]] },
      SequentialCommitHandlerFacet: { constructorArgs: [WrappedNative[network]] },
      OrchestrationHandlerFacet2: { constructorArgs: [EXCHANGE_ID_2_2_0[network]], init: [] },
      MetaTransactionsHandlerFacet: { constructorArgs: [], init: [[]] },
    },
    initializationData: "0x",
  };
}

exports.getFacets = getFacets;
