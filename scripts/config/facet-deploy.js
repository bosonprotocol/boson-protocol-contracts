const hre = require("hardhat");
const network = hre.network.name;
const { getStateModifyingFunctionsHashes } = require("../../scripts/util/diamond-utils.js");
const protocolConfig = require("./protocol-parameters");

/**
 * Get the configuration data to be passed to the ConfigHandlerFacet initializer
 * @returns { addresses, limits, fees }
 */
function getConfig() {
  return [
    {
      token: protocolConfig.TOKEN[network],
      treasury: protocolConfig.TREASURY[network],
      voucherBeacon: protocolConfig.BEACON[network],
      beaconProxy: protocolConfig.BEACON_PROXY[network],
    },
    protocolConfig.limits,
    protocolConfig.fees,
  ];
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
        Facet4: ["0xb0b1d2659e8d5846432c66de8615841cc7bcaf49", 3, true],  // Facet4 expects address, uint256 and bool
        Facet5: [[2, 3, 5, 7, 11]],                                       // Facet5 uint256 array
        Facet6: []                                                        // Facet6 doesn't expect any argument
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
  "ExchangeHandlerFacet",
  "FundsHandlerFacet",
  "GroupHandlerFacet",
  "OfferHandlerFacet",
  "OrchestrationHandlerFacet1",
  "OrchestrationHandlerFacet2",
  "TwinHandlerFacet",
  "PauseHandlerFacet",
  "ProtocolInitializationHandlerFacet", // args are generated on cutDiamond function
  "SequentialCommitHandlerFacet",
];

async function getFacets(config) {
  const ConfigHandlerFacetInitArgs = config ?? getConfig();

  // metaTransactionsHandlerFacet initializer arguments.
  const MetaTransactionsHandlerFacetInitArgs = await getStateModifyingFunctionsHashes(
    [...noArgFacetNames, "MetaTransactionsHandlerFacet"],
    ["executeMetaTransaction(address,string,bytes,uint256,bytes32,bytes32,uint8)"]
  );

  const facetArgs = noArgFacetNames.reduce((acc, facetName) => {
    acc[facetName] = [];
    return acc;
  }, {});

  facetArgs["ConfigHandlerFacet"] = { init: ConfigHandlerFacetInitArgs };
  facetArgs["MetaTransactionsHandlerFacet"] = { init: [MetaTransactionsHandlerFacetInitArgs] };
  facetArgs["ExchangeHandlerFacet"] = { constructorArgs: [protocolConfig.EXCHANGE_ID_2_2_0[network]] };

  return facetArgs;
}

exports.getFacets = getFacets;
