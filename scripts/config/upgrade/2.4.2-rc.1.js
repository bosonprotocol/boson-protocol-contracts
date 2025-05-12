const { EXCHANGE_ID_2_2_0, WrappedNative } = require("../protocol-parameters");
const network = require("hardhat").network.name;

async function getFacets() {
  return {
    addOrUpgrade: [
      "ConfigHandlerFacet",
      "DisputeHandlerFacet",
      "ExchangeHandlerFacet",
      "OfferHandlerFacet",
      "OrchestrationHandlerFacet1",
      "PriceDiscoveryHandlerFacet",
      "SequentialCommitHandlerFacet",
    ],
    remove: [],
    skipSelectors: {},
    facetsToInit: {
      ExchangeHandlerFacet: { constructorArgs: [EXCHANGE_ID_2_2_0[network]] },
      PriceDiscoveryHandlerFacet: { constructorArgs: [WrappedNative[network]] },
      SequentialCommitHandlerFacet: { constructorArgs: [WrappedNative[network]] },
    },
    initializationData: "0x",
  };
}

exports.getFacets = getFacets;
