/**
 * List of limits to test and methods that depend on them.
 * This is used to test the upper limit of elements in array, passed as input arguments, before the gas block limit is hit.
 *
 * If a new limit is added to the smart contracts, this list should be updated.
 */
exports.limits = {
    safeGasLimitPercent: 60,
    limits: [
        { limit: "maxExchangesPerBatch", methods: ["completeExchangeBatch"] },
        { limit: "maxOffersPerGroup", methods: ["createGroup", "addOffersToGroup", "removeOffersFromGroup"] },
        { limit: "maxOffersPerBundle", methods: ["createBundle"] },
        { limit: "maxTwinsPerBundle", methods: ["createBundle"] },
        { limit: "maxOffersPerBatch", methods: ["createOfferBatch", "voidOfferBatch", "extendOfferBatch"] },
        { limit: "maxTokensPerWithdrawal", methods: ["withdrawFunds", "withdrawProtocolFees"] },
        { limit: "maxFeesPerDisputeResolver", methods: ["createDisputeResolver", "addFeesToDisputeResolver", "removeFeesFromDisputeResolver"] },
        { limit: "maxDisputesPerBatch", methods: ["expireDisputeBatch"] },
        { limit: "maxAllowedSellers", methods: ["createDisputeResolver", "addSellersToAllowList", "removeSellersFromAllowList"] },
    ]
}



