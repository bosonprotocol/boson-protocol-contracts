const hre = require("hardhat");
const network = hre.network.name;
const { getStateModifyingFunctionsHashes } = require("../../scripts/util/diamond-utils.js");
const protocolConfig = require("./protocol-parameters");

/**
 * Get the configuration data to be passed to the ConfigHandlerFacet initializer
 * @returns { addresses, limits, fees }
 */
function getConfigHandlerInitArgs() {
  return [
    {
      token: protocolConfig.TOKEN[network],
      treasury: protocolConfig.TREASURY[network],
      voucherBeacon: protocolConfig.BEACON[network],
      beaconProxy: protocolConfig.BEACON_PROXY[network],
      priceDiscovery: protocolConfig.PRICE_DISCOVERY[network],
    },
    protocolConfig.limits,
    protocolConfig.protocolFeePercentage,
    protocolConfig.protocolFeeFlatBoson,
    protocolConfig.buyerEscalationDepositPercentage,
  ];
}

/**
 * Get the configuration data to be passed to the MetaTransactionsHandlerFacet initializer
 * @param facets - array of facet names
 * @returns {Object} - array of function hashes
 */
async function getMetaTransactionsHandlerFacetInitArgs(facets) {
  const getFunctionHashesClosure = getStateModifyingFunctionsHashes(facets, ["executeMetaTransaction"]);

  return await getFunctionHashesClosure();
}

/**
 * Config file used to deploy the facets
 *
 * Function getFacets() returns the object that is used by the deploy script. To specify custom deployment parameters, modify return value.
*
 * @param config - optional configuration data to be passed to the ConfigHandlerFacet initializer
 * @returns {Object} - object with facet names as keys and arrays of arguments as values to be passed into initializer
 *              return empty array for facet that doesn't expect any argument 
 * 
 * Example:
 *  {
         Facet4: { init:  ["0xb0b1d2659e8d5846432c66de8615841cc7bcaf49", 3, true], constructorArgs: [] },          
         Facet5: { init: [], constructorArgs: [[2, 3, 5, 7, 11]] },                                       
         Facet6: { init: [], constructorArgs: [] }                                                
     }
 * 
 */
const noArgFacetNames = [
  "AccountHandlerFacet",
  "SellerHandlerFacet",
  "BuyerHandlerFacet",
  "DisputeResolverHandlerFacet",
  "AgentHandlerFacet",
  "BundleHandlerFacet",
  "DisputeHandlerFacet",
  "FundsHandlerFacet",
  "GroupHandlerFacet",
  "OfferHandlerFacet",
  "OrchestrationHandlerFacet1",
  "OrchestrationHandlerFacet2",
  "TwinHandlerFacet",
  "PauseHandlerFacet",
  "ProtocolInitializationHandlerFacet", // args are generated on cutDiamond function
  "SequentialCommitHandlerFacet",
  "PriceDiscoveryHandlerFacet",
  "ExchangeCommitFacet",
];

async function getFacets(config) {
  const ConfigHandlerFacetInitArgs = config ?? getConfigHandlerInitArgs();

  const facetArgs = noArgFacetNames.reduce((acc, facetName) => {
    acc[facetName] = { init: [] };
    return acc;
  }, {});

  facetArgs["ConfigHandlerFacet"] = { init: ConfigHandlerFacetInitArgs };
  facetArgs["ExchangeHandlerFacet"] = {
    init: [],
    constructorArgs: [protocolConfig.EXCHANGE_ID_2_2_0[network], protocolConfig.WrappedNative[network]],
  };
  facetArgs["DisputeHandlerFacet"] = {
    init: [],
    constructorArgs: [protocolConfig.WrappedNative[network]],
  };
  facetArgs["SequentialCommitHandlerFacet"] = {
    init: [],
    constructorArgs: [protocolConfig.WrappedNative[network]],
  };
  facetArgs["PriceDiscoveryHandlerFacet"] = {
    init: [],
    constructorArgs: [protocolConfig.WrappedNative[network]],
  };

  // metaTransactionsHandlerFacet initializer arguments.
  const MetaTransactionsHandlerFacetInitArgs = await getMetaTransactionsHandlerFacetInitArgs(
    Object.keys(facetArgs).concat(["MetaTransactionsHandlerFacet"])
  );

  facetArgs["MetaTransactionsHandlerFacet"] = { init: [MetaTransactionsHandlerFacetInitArgs] };

  return facetArgs;
}

exports.getFacets = getFacets;
exports.getConfigHandlerInitArgs = getConfigHandlerInitArgs;
exports.getMetaTransactionsHandlerFacetInitArgs = getMetaTransactionsHandlerFacetInitArgs;
