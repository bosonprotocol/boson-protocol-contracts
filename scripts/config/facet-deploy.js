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
 * @param config - optional configuration data to be passed to the ConfigHandlerFacet initializer
 * Function getFacets() returns the object that is used by the deploy script. To specify custom deployment parameters, modify return value.
 * Returned value should have the following fields:
 * - noArgFacets: list of facet names that don't expect any argument passed into initializer
 * - argFacets: object that specify facet names and arguments that needs to be passed into initializer in format object {facetName: initializerArguments}
 *               if facet doesn't expect any argument, pass empty array
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
  "OrchestrationHandlerFacet",
  "TwinHandlerFacet",
  "PauseHandlerFacet",
  "ProtocolInitializationFacet", // args are generated on cutDiamond function
];

async function getFacets(config) {
  const ConfigHandlerFacetInitArgs = config ?? getConfig();

  // metaTransactionsHandlerFacet initializer arguments.
  const MetaTransactionsHandlerFacetInitArgs = await getStateModifyingFunctionsHashes(
    [...noArgFacetNames, "MetaTransactionsHandlerFacet"],
    ["executeMetaTransaction(address,string,bytes,uint256,bytes32,bytes32,uint8)"]
  );

  const argFacets = noArgFacetNames.reduce((acc, facetName) => {
    acc[facetName] = [];
    return acc;
  }, {});

  argFacets["ConfigHandlerFacet"] = ConfigHandlerFacetInitArgs;
  argFacets["MetaTransactionsHandlerFacet"] = [MetaTransactionsHandlerFacetInitArgs];

  return argFacets;
}

exports.getFacets = getFacets;
