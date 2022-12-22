/**
 * ERC-165 identifiers for interfaces implemented by the Boson Protocol
 */
const { getInterfaceId } = require("../../scripts/util/diamond-utils.js");
const hre = require("hardhat");

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

  // If cache exists and it's not disabled, return it
  if (interfacesCache && useCache) {
    return interfacesCache;
  }

  // Get interface names
  const interfaces = await getInterfaceNames();

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

// Function to get all interface names
async function getInterfaceNames() {
  // Folder where interfaces are stored
  const prefix = "contracts/interfaces/";
  const skip = ["events", "IERC20.sol", "IERC20Metadata"]; // ERC20 interfaces are skipped since no contract implements them directly.

  // Get build info
  const contractNames = await hre.artifacts.getAllFullyQualifiedNames();

  // Filter out names that are not in interfaces folder and are not in skip list
  let interfaces = contractNames.flatMap((contractName) => {
    const [source, name] = contractName.split(":");

    // If starts with prefix and is not in skip list, return name
    return source.startsWith(`${prefix}`) && !skip.some((s) => source.startsWith(`${prefix}${s}`)) ? name : [];
  });

  return interfaces;
}

exports.getInterfaceIds = getInterfaceIds;
exports.interfaceImplementers = interfaceImplementers;
