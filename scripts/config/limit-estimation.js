/**
 * List of limits to test and methods that depend on them.
 * This is used to test the upper limit of elements in array, passed as input arguments, before the gas block limit is hit.
 *
 * If a new limit is added to the smart contracts, this list should be updated.
 */
exports.limitsToEstimate = {
  safeGasLimitPercent: 60,
  maxArrayLength: 100, // length of the array used during the estimation.
  limits: [
    { name: "maxExchangesPerBatch", methods: { completeExchangeBatch: "IBosonExchangeHandler" } },
    {
      name: "maxOffersPerGroup",
      methods: {
        createGroup: "IBosonGroupHandler",
        addOffersToGroup: "IBosonGroupHandler",
        removeOffersFromGroup: "IBosonGroupHandler",
      },
    },
    { name: "maxOffersPerBundle", methods: { createBundle: "IBosonBundleHandler" } },
    { name: "maxTwinsPerBundle", methods: { createBundle: "IBosonBundleHandler" } },
    {
      name: "maxOffersPerBatch",
      methods: {
        createOfferBatch: "IBosonOfferHandler",
        voidOfferBatch: "IBosonOfferHandler",
        extendOfferBatch: "IBosonOfferHandler",
      },
    },
    {
      name: "maxTokensPerWithdrawal",
      methods: { withdrawFunds: "IBosonFundsHandler", withdrawProtocolFees: "IBosonFundsHandler" },
    },
    {
      name: "maxFeesPerDisputeResolver",
      methods: {
        createDisputeResolver: "IBosonAccountHandler",
        addFeesToDisputeResolver: "IBosonAccountHandler",
        removeFeesFromDisputeResolver: "IBosonAccountHandler",
      },
    },
    { name: "maxDisputesPerBatch", methods: { expireDisputeBatch: "IBosonDisputeHandler" } },
    {
      name: "maxAllowedSellers",
      methods: {
        createDisputeResolver: "IBosonAccountHandler",
        addSellersToAllowList: "IBosonAccountHandler",
        removeSellersFromAllowList: "IBosonAccountHandler",
      },
    },
  ],
};
