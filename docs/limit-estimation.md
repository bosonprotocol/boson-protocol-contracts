
## maxExchangesPerBatch
completeExchangeBatch

## maxOffersPerGroup
createGroupInternal
- createGroup
- createOfferWithCondition // not a problem, always length 1
preUpdateChecks
- addOffersToGroupInternal
-- addOffersToGroup
-- createOfferAddToGroup // not a problem, always length 1
- removeOffersFromGroup

## maxOffersPerBundle
createBundleInternal
- createBundle
- createTwinAndBundleAfterOffer // not a problem, always length 1

## maxTwinsPerBundle
createBundleInternal
- createBundle
- createTwinAndBundleAfterOffer // not a problem, always length 1

## maxOffersPerBatch
createOfferBatch
voidOfferBatch
extendOfferBatch

## maxTokensPerWithdrawal
withdrawFundsInternal
- withdrawFunds
- withdrawProtocolFees

## maxFeesPerDisputeResolver
createDisputeResolver
addFeesToDisputeResolver
removeFeesFromDisputeResolver

## maxDisputesPerBatch
expireDisputeBatch

## maxAllowedSellers
createDisputeResolver
addSellersToAllowList
removeSellersFromAllowList