/**
 * List of limits to test and methods that depend on them.
 * This is used to test the upper limit of elements in array, passed as input arguments, before the gas block limit is hit.
 *
 * If a new limit is added to the smart contracts, this list should be updated.
 */
exports.limitsToEstimate = {
  safeGasLimitPercent: 60,
  limits: [
    // { name: "maxExchangesPerBatch", methods: { completeExchangeBatch: "IBosonExchangeHandler" } },
    // {
    //   name: "maxOffersPerGroup",
    //   methods: {
    //     createGroup: "IBosonGroupHandler",
    //     addOffersToGroup: "IBosonGroupHandler",
    //     removeOffersFromGroup: "IBosonGroupHandler",
    //   },
    // },
    { name: "maxOffersPerBundle", methods: { createBundle: "IBosonBundleHandler" } },

    // { name: "maxTwinsPerBundle", methods: {"createBundle":"IBosonBundleHandler"} },
    // { name: "maxOffersPerBatch", methods: ["createOfferBatch", "voidOfferBatch", "extendOfferBatch"] },
    // { name: "maxTokensPerWithdrawal", methods: ["withdrawFunds", "withdrawProtocolFees"] },
    // { name: "maxFeesPerDisputeResolver", methods: ["createDisputeResolver", "addFeesToDisputeResolver", "removeFeesFromDisputeResolver"] },
    // { name: "maxDisputesPerBatch", methods: ["expireDisputeBatch"] },

    // {
    //   name: "maxAllowedSellers",
    //   methods: {
    //     createDisputeResolver: "IBosonAccountHandler",
    //     addSellersToAllowList: "IBosonAccountHandler",
    //     removeSellersFromAllowList: "IBosonAccountHandler",
    //   },
    // },
  ],
};
