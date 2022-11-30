/**
 * ERC-165 identifiers for interfaces implemented by the Boson Protocol
 */
const { getInterfaceId } = require("../../scripts/util/diamond-utils.js");

const interfaces = [
  "IBosonPauseHandler",
  "IBosonConfigHandler",
  "IBosonBundleHandler",
  "IBosonDisputeHandler",
  "IBosonExchangeHandler",
  "IBosonFundsHandler",
  "IBosonGroupHandler",
  "IBosonOfferHandler",
  "IBosonTwinHandler",
  "IBosonAccountHandler",
  "IBosonMetaTransactionsHandler",
  "IBosonOrchestrationHandler",
  "IClientExternalAddresses",
  "IDiamondCut",
  "IDiamondLoupe",
  "IERC165",
  "IERC165Extended",
  "IBosonProtocolInitializationHandler",
  "IBosonVoucher",
  "IERC1155",
  "IERC721",
  "IERC2981",
  "IAccessControl",
];

const interfaceImplementers = {
  AccountHandlerFacet: "IBosonAccountHandler",
  SellerHandlerFacet: "IBosonAccountHandler",
  BuyerHandlerFacet: "IBosonAccountHandler",
  DisputeResolverHandlerFacet: "IBosonAccountHandler",
  AgentHandlerFacet: "IBosonAccountHandler",
  BundleHandlerFacet: "IBosonBundleHandler",
  DisputeHandlerFacet: "IBosonDisputeHandler",
  ExchangeHandlerFacet: "IBosonExchangeHandler",
  FundsHandlerFacet: "IBosonFundsHandler",
  GroupHandlerFacet: "IBosonGroupHandler",
  MetaTransactionsHandlerFacet: "IBosonMetaTransactionsHandler",
  OfferHandlerFacet: "IBosonOfferHandler",
  OrchestrationHandlerFacet: "IBosonOrchestrationHandler",
  TwinHandlerFacet: "IBosonTwinHandler",
  PauseHandlerFacet: "IBosonPauseHandler",
  DiamondLoupeFacet: "IDiamondLoupe",
  DiamondCutFacet: "IDiamondCut",
  ERC165Facet: "IERC165Extended",
  ConfigHandlerFacet: "IBosonConfigHandler",
  ProtocolInitializationHandlerFacet: "IBosonProtocolInitializationHandler",
};

let interfacesCache; // if getInterfaceIds is called multiple times (e.g. during tests), calculate ids only once and store them to cache
async function getInterfaceIds(useCache = true) {
  let interfaceIds = {};

  if (interfacesCache && useCache) {
    return interfacesCache;
  }
  // most of interfaces do not inherit others, so base check can be skipped which greatly reduces computation time
  const skipBaseCheck = interfaces.reduce((skip, iFace) => {
    skip[iFace] = true;
    return skip;
  }, {});
  ["IBosonVoucher", "IERC1155", "IERC721", "IERC2981", "IAccessControl"].forEach((iFace) => {
    skipBaseCheck[iFace] = false;
  });

  for (const iFace of interfaces) {
    interfaceIds[iFace] = await getInterfaceId(iFace, skipBaseCheck[iFace]);
  }

  interfacesCache = interfaceIds;
  return interfaceIds;
}

exports.getInterfaceIds = getInterfaceIds;
exports.interfaceImplementers = interfaceImplementers;
