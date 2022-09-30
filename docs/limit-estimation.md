[![banner](images/banner.png)](https://bosonprotocol.io)

<h1 align="center">Boson Protocol V2</h1>

### [Intro](../README.md) | [Audits](audits.md) | [Setup](setup.md) | [Tasks](tasks.md) | [Architecture](architecture.md) | [Domain Model](domain.md) | [State Machines](state-machines.md) | [Happy Path Exchange](happy-path-exchange.md)

# Protocol limit estimation

Certain actions in the protocol require looping over dynamic size arrays. To avoid hitting the block gas limit, special protocol limits were introduced which revert the transaction before the loop even starts. Values for these limits are then determined through estimation process, described here.

## Identifying the limits

First we identify which limits we use at the moment and which functions (or chain of functions) use them. The goal is to identify the external functions which can be called during the estimation.

### List of limits

| limit | used in | remarks |
| :---- | :------ | :------ |
| maxExchangesPerBatch | **completeExchangeBatch** | |
| maxOffersPerGroup | createGroupInternal -> **createGroup** | | 
| maxOffersPerGroup | createGroupInternal -> **createOfferWithCondition** | not a problem, always length 1 |
| maxOffersPerGroup | preUpdateChecks -> addOffersToGroupInternal -> **addOffersToGroup** | |
| maxOffersPerGroup | preUpdateChecks -> addOffersToGroupInternal -> **createOfferAddToGroup** | not a problem, always length 1 |
| maxOffersPerGroup | preUpdateChecks -> **removeOffersFromGroup** |  |
| maxOffersPerBundle | createBundleInternal -> **createBundle** | |
| maxOffersPerBundle | createBundleInternal -> **createTwinAndBundleAfterOffer** | not a problem, always length 1 |
| maxTwinsPerBundle | createBundleInternal -> **createBundle** | |
| maxTwinsPerBundle | createBundleInternal -> **createTwinAndBundleAfterOffer** | not a problem, always length 1 |
| maxOffersPerBatch | **createOfferBatch** | |
| maxOffersPerBatch | **voidOfferBatch** | |
| maxOffersPerBatch | **extendOfferBatch** | |
| maxTokensPerWithdrawal | withdrawFundsInternal -> **withdrawFunds** | |
| maxTokensPerWithdrawal | withdrawFundsInternal -> **withdrawProtocolFees** | |
| maxFeesPerDisputeResolver | **createDisputeResolver** | |
| maxFeesPerDisputeResolver | **addFeesToDisputeResolver** | |
| maxFeesPerDisputeResolver | **removeFeesFromDisputeResolver** | |
| maxDisputesPerBatch | **expireDisputeBatch** | |
| maxAllowedSellers | **createDisputeResolver** | |
| maxAllowedSellers | **addSellersToAllowList** | |
| maxAllowedSellers | **removeSellersFromAllowList** | |

## Estimation config

Config file is placed in `scripts/config/limit-estimation.js`. It has the following fields:
- `blockGasLimit`: block gas limit against which you want to make the estimate
- `safeGasLimitPercent`: percent of total gas block limit that you consider safe for a transaction to actually be included in the block. For example if `blockGasLimit` is `30M` and you don't want your transaction to exceed `15M`, set `safeGasLimitPercent` to `50`.
- `maxArrayLength`: maximum length of the array used during the estimation. This value is typically smaller than actual limits calculated at the end. Increasing this value makes estimation more precise, however it also takes more time. Improvement in the estimate is increasing slower than run time, so setting this to `100` should be more than enough. If you want to speed up the process, setting this to `10` will still give you very good results.
- `limits`: list of limits you want to estimate. Each limit is an object with fields:
  - `name`: name of the limit
  - `methods`: object of pairs `"methodName":"handlerName"` where `methodName` is the name of the external function that uses the limit and `handlerName` is the name of the handler where this function is implemented. Example for limit `maxOffersPerGroup`:
    ``` 
    {
      name: "maxOffersPerGroup",
      methods: {
        createGroup: "IBosonGroupHandler",
        addOffersToGroup: "IBosonGroupHandler",
        removeOffersFromGroup: "IBosonGroupHandler",
      },
    },
    ```

## Setting up the environment

For each of the limits you must prepare an evironment, before it can be tested. For example, before `maxOffersPerGroup` can be tested, protocol contracts must be deployed and enough offers must be created so the limit can actuall be tested. A similar setup is needed for all other methods.

This is done in file `scripts/util/estimate-limits.js`. Each of the limits must have a setup function which accepts `maxArrayLength`, prepares the environment and returns the invocation details that can be then used when invoking the `methods` during the estimation.

Invocation details contain 
- `account`: account that calls the method (important if access is restricted)
- `args`: array of arguments that needs to be passed into method
- `arrayIndex`: index that tells which parameter's length should be varied during the estimation
- `structField`: if array is part of a struct, specify the field name

The returned object must be in form `{ methodName_1: invocationDetails_1, methodName_2: invocationDetails_2, ..., methodName_n: invocationDetails_2}` with details for all methods specified in estimation config.

## Running the script

Scrip is run by calling

```npm run estimate-limits```

During the estimation it outputs the information about the method it is estimating. At the end it stores the estimation details into two files:
- `logs/limit_estimates.json` Data in JSON format
- `logs/limit_estimates.md` Data in MD table

## Results

The results for parameters
- `blockGasLimit`: `30,000,000` (current ethereum mainnet block gas limit)
- `safeGasLimitPercent`: `60`

| limit | max value | safe value |
| :-- | --: | --: |
|maxExchangesPerBatch | 557 | 333|
|maxOffersPerGroup | 388 | 232|
|maxOffersPerBundle | 508 | 303|
|maxTwinsPerBundle | 510 | 304|
|maxOffersPerBatch | 51 | 31|
|maxTokensPerWithdrawal | 491 | 293|
|maxFeesPerDisputeResolver | 305 | 181|
|maxDisputesPerBatch | 302 | 181|
|maxAllowedSellers | 597 | 352|

`max value` is determined based on `blockGasLimit`, while safe value also applies `safeGasLimitPercent`.

### Gas spent for different sizes of arrays
| # | maxExchangesPerBatch | maxOffersPerGroup | maxOffersPerGroup | maxOffersPerGroup | maxOffersPerBundle | maxTwinsPerBundle | maxOffersPerBatch | maxOffersPerBatch | maxOffersPerBatch | maxTokensPerWithdrawal | maxTokensPerWithdrawal | maxFeesPerDisputeResolver | maxFeesPerDisputeResolver | maxFeesPerDisputeResolver | maxDisputesPerBatch | maxAllowedSellers | maxAllowedSellers | maxAllowedSellers |
|--|  ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:|
|  | completeExchangeBatch | createGroup | addOffersToGroup | removeOffersFromGroup | createBundle | createBundle | createOfferBatch | voidOfferBatch | extendOfferBatch | withdrawFunds | withdrawProtocolFees | createDisputeResolver | addFeesToDisputeResolver | removeFeesFromDisputeResolver | expireDisputeBatch | createDisputeResolver | addSellersToAllowList | removeSellersFromAllowList |
| 1 | 184357 | 216179 | 166813 | 339950 | 266339 | 266339 | 645410 | 76369 | 63841 | 98246 | 124263 | 456727 | 168014 | 99325 | 223643 | 720355 | 120611 | 76720 |
| 2 | 237945 | 292824 | 243899 | 362917 | 324373 | 324237 | 1220883 | 111203 | 85650 | 144880 | 193424 | 552740 | 264455 | 145349 | 322061 | 769463 | 169117 | 99602 |
| 3 | 290692 | 369287 | 319811 | 385956 | 382685 | 382414 | 1796358 | 145208 | 107442 | 191521 | 262643 | 649449 | 360736 | 191089 | 420849 | 817790 | 217760 | 122522 |
| 4 | 344271 | 446010 | 396802 | 409687 | 440789 | 440369 | 2371848 | 179853 | 129223 | 238345 | 330958 | 745985 | 457657 | 236552 | 519034 | 866852 | 266659 | 145744 |
| 5 | 397506 | 522438 | 473499 | 432743 | 498656 | 498102 | 2947330 | 213982 | 150777 | 284285 | 399900 | 842313 | 553655 | 282583 | 617217 | 915916 | 315181 | 168453 |
| 6 | 450933 | 599145 | 549901 | 455724 | 556830 | 556142 | 3522863 | 248993 | 172476 | 330931 | 468759 | 939354 | 650340 | 327624 | 716072 | 964978 | 364020 | 191603 |
| 7 | 504557 | 675705 | 626011 | 478855 | 615481 | 614658 | 4098400 | 282740 | 194322 | 377398 | 538021 | 1038389 | 746851 | 373526 | 814350 | 1015980 | 412672 | 214102 |
| 8 | 557350 | 752116 | 703168 | 502121 | 673490 | 672532 | 4673951 | 317493 | 216313 | 423687 | 606770 | 1135642 | 843190 | 418787 | 912629 | 1065136 | 462015 | 237182 |
| 9 | 610704 | 829174 | 779581 | 525383 | 731386 | 730295 | 5289900 | 351745 | 237643 | 470697 | 675733 | 1232882 | 940232 | 464621 | 1013746 | 1114293 | 510385 | 260262 |
| 10 | 664157 | 905366 | 855847 | 548648 | 789928 | 788700 | 5869922 | 386681 | 259853 | 516720 | 744561 | 1325047 | 1039257 | 510454 | 1112302 | 1163448 | 559101 | 283342 |
| 20 | 1199674 | 1672031 | 1622868 | 780097 | 1371424 | 1368854 | 11585194 | 730484 | 476329 | 981216 | 1435505 | 2293894 | 2003996 | 966566 | 2097899 | 1648704 | 1050125 | 511799 |
| 30 | 1731595 | 2440464 | 2391564 | 1012387 | 1955241 | 1951326 | 17350904 | 1078743 | 693892 | 1446838 | 2126474 | 3256561 | 2967075 | 1424971 | 3083565 | 2138411 | 1535807 | 740419 |
| 40 | 2271836 | 3202792 | 3154246 | 1244680 | 2539116 | 2533856 | 23112733 | 1423827 | 911454 | 1913450 | 2817507 | 4248050 | 3934100 | 1882668 | 4069301 | 2628126 | 2025507 | 969085 |
| 50 | 2800719 | 3969835 | 3921550 | 1476974 | 3117065 | 3110472 | 28911628 | 1768963 | 1135500 | 2380130 | 3503226 | 5220856 | 4929416 | 2340381 | 5055106 | 3111881 | 2515218 | 1199241 |
| 60 | 3333793 | 4764194 | 4715895 | 1542105 | 3699938 | 3692002 |   | 2114152 | 1353506 | 2841377 | 3983943 | 6192222 | 5902160 | 2409313 | 6040982 | 3600680 | 2999184 | 1220202 |
| 70 | 3866927 | 5535734 | 5487697 | 1607235 | 4307529 | 4298195 |   | 2459395 | 1566348 | 3307259 | 4471569 | 7137316 | 6853941 | 2478233 | 7030675 | 4113038 | 3487977 | 1241164 |
| 80 | 4424168 | 6302543 | 6256137 | 1672369 | 4893873 | 4883188 |   | 2804690 | 1783781 | 3773180 | 4953126 | 8125585 | 7799011 | 2547183 | 8046950 | 4604672 | 3976781 | 1262132 |
| 90 | 4960338 | 7052123 | 7005985 | 1737566 | 5480275 | 5468239 |   | 3144491 | 2001293 | 4263556 | 5434728 | 9068993 | 8785898 | 2616114 | 9014128 | 5096317 | 4491310 | 1283105 |
| 100 | 5496569 | 7801814 | 7755932 | 1802826 | 6066735 | 6053349 |   | 3489284 | 2218882 | 4732249 | 5916387 | 10051836 | 9729258 | 2685059 | 9977691 | 5587972 | 4982950 | 1304081 |
| **max** | **557** | **388** | **389** | **1733** | **508** | **510** | **51** | **868** | **1375** | **641** | **491** | **305** | **309** | **932** | **302** | **597** | **610** | **1906** |
| safe | 333 | 232 | 232 | 1031 | 303 | 304 | 31 | 520 | 824 | 384 | 293 | 181 | 185 | 557 | 181 | 352 | 365 | 1141 |

## Methodology

As seen from the results above, some limits are relatively high and to actually hit the limit, already the setup would take a lot of time (e.g. for making `>1700` offers to hit limit in `removeOffersFromGroup`). To get the estimates we therefore use the following approach:
- get the actual estimates for relatively small number of differen array lengths
- given how gas is determined, there exist approximate linear relation, which can be written as `gasSpent = intrinsicGas + arrayLength*costPerLoop`. Intrinsic costs here contains all costs that are fixed regardless of the array size.
- use linear regression to estimate `intrinsicGas` and `costPerLoop`
- use these estimates to calculate the biggest `arrayLength` where `gasSpent <= blockGasLimit` which gives the maximum value. To get the safe value we find the biggest `arrayLength` where `gasSpent <= safeGasLimitPercent*blockGasLimit`