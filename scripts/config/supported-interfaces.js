/**
 * ERC-165 identifiers for interfaces implemented by the Boson Protocol
 */
const { getInterfaceId } = require("../../scripts/util/diamond-utils.js");
const hre = require("hardhat");
const { interfacesWithMultipleArtifacts } = require("../util/constants.js");

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
  OrchestrationHandlerFacet1: "IBosonOrchestrationHandler",
  OrchestrationHandlerFacet2: "IBosonOrchestrationHandler",
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

  [
    "IBosonVoucher",
    "contracts/interfaces/IERC1155.sol:IERC1155",
    "contracts/interfaces/IERC721.sol:IERC721",
    "contracts/interfaces/IERC2981.sol:IERC2981",
    "IAccessControl",
  ].forEach((iFace) => {
    skipBaseCheck[iFace] = false;
  });

  for (const iFace of interfaces) {
    interfaceIds[iFace] = await getInterfaceId(
      iFace,
      skipBaseCheck[iFace],
      interfacesWithMultipleArtifacts.includes(iFace.split(":").pop())
    );
  }
  const cleanedInterfaceIds = {};

  for (const key in interfaceIds) {
    const newKey = key.includes(":") ? key.split(":").pop() : key;
    cleanedInterfaceIds[newKey] = interfaceIds[key];
  }

  interfacesCache = cleanedInterfaceIds;
  return cleanedInterfaceIds;
}

// Function to get all interface names
async function getInterfaceNames() {
  // Folder where interfaces are stored
  const skip = ["events", "IERC20.sol", "IERC20Metadata"]; // ERC20 interfaces are skipped since no contract implements them directly.

  // Get build info
  const contractNames = await hre.artifacts.getAllFullyQualifiedNames();

  // Filter out names that are not in interfaces folder and are not in skip list
  let interfaces = contractNames.flatMap((contractName) => {
    const [source, name] = contractName.split(":");

    // If starts with prefix and is not in skip list, return name
    return /.*contracts\/interfaces\/(.*)/.test(source) &&
      !skip.some((s) => new RegExp(`.*contracts/interfaces/${s}`).test(source))
      ? interfacesWithMultipleArtifacts.includes(name)
        ? contractName
        : name
      : [];
  });

  return interfaces;
}

exports.getInterfaceIds = getInterfaceIds;
exports.interfaceImplementers = interfaceImplementers;
