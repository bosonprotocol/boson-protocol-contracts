const { oneWeek, ninetyDays } = require("../../test/util/constants");

/**
 *  Protocol config parameters, used during the deployment
 *
 */

module.exports = {
  // Protocol configuration params
  fees: {
    percentage: "50", // 0.5%  : 50
    flatBoson: "0",
    buyerEscalationDepositPercentage: "1000", // 10%
  },
  limits: {
    maxExchangesPerBatch: "140",
    maxOffersPerGroup: "95",
    maxTwinsPerBundle: "125",
    maxOffersPerBundle: "125",
    maxOffersPerBatch: "12",
    maxTokensPerWithdrawal: "125",
    maxFeesPerDisputeResolver: "75",
    maxEscalationResponsePeriod: ninetyDays.toString(),
    maxDisputesPerBatch: "75",
    maxAllowedSellers: "140",
    maxTotalOfferFeePercentage: "10000", // 100%
    maxRoyaltyPercentage: "10000", //100%
    minResolutionPeriod: oneWeek.toString(),
    maxResolutionPeriod: ninetyDays.toString(),
    minDisputePeriod: oneWeek.toString(),
    maxPremintedVouchers: "10000",
  },

  // Boson Token (ERC-20) contract address
  TOKEN: {
    mainnet: "0xC477D038d5420C6A9e0b031712f61c5120090de9",
    hardhat: "0x2cDA796787425AF0892F20F6019704F053bCD6bF", //dummy
    localhost: "0x2cDA796787425AF0892F20F6019704F053bCD6bF", //dummy
    test: "0x520ce45DF6d14334257BFdD360a5C22B06E309c7", //dummy
    mumbai: "0x1f5431E8679630790E8EbA3a9b41d1BB4d41aeD0",
    polygon: "0x9b3b0703d392321ad24338ff1f846650437a43c9",
    sepolia: "0x791Bf9Da3DEF5D7Cd3A7a748e56720Cd119D53AC",
    amoy: "0x94e32c4bfcA1D3fe08B6F8252ABB47A5B14AC2bD",
  },

  // Treasury contract address
  TREASURY: {
    mainnet: "0x4a25E18076DDcFd646ED14ABC07286c2A4c1256A",
    hardhat: "0x17CDD65bebDe68cd8A4045422Fcff825A0740Ef9", //dummy
    localhost: "0x17CDD65bebDe68cd8A4045422Fcff825A0740Ef9", //dummy
    test: "0x17CDD65bebDe68cd8A4045422Fcff825A0740Ef9", //dummy
    mumbai: "0x17CDD65bebDe68cd8A4045422Fcff825A0740Ef9", //dummy
    polygon: "0x11D0d293751E18FCC56c70E1FB264CeB9f7C3fE7",
    sepolia: "0x2a91A0148EE62fA638bE38C7eE05c29a3e568dD8",
    amoy: "0x2a91A0148EE62fA638bE38C7eE05c29a3e568dD8",
  },

  // Boson voucher beacon contract address
  BEACON: {
    mainnet: "0x494f5238b40119e707582Ce87E0ca3627dB23Bcb", //dummy
    hardhat: "0x494f5238b40119e707582Ce87E0ca3627dB23Bcb", //dummy
    localhost: "0x494f5238b40119e707582Ce87E0ca3627dB23Bcb", //dummy
    test: "0x494f5238b40119e707582Ce87E0ca3627dB23Bcb", //dummy
    mumbai: "0x494f5238b40119e707582Ce87E0ca3627dB23Bcb", //dummy
    polygon: "0x17CDD65bebDe68cd8A4045422Fcff825A0740Ef9", //dummy,
    sepolia: "0x17CDD65bebDe68cd8A4045422Fcff825A0740Ef9", //dummy
    amoy: "0x17CDD65bebDe68cd8A4045422Fcff825A0740Ef9", //dummy
  },

  // Beacon proxy contract address
  BEACON_PROXY: {
    mainnet: "0x4102621Ac55e068e148Da09151ce92102c952aab", //dummy
    hardhat: "0x4102621Ac55e068e148Da09151ce92102c952aab", //dummy
    localhost: "0x4102621Ac55e068e148Da09151ce92102c952aab", //dummy
    test: "0x4102621Ac55e068e148Da09151ce92102c952aab", //dummy
    mumbai: "0x4102621Ac55e068e148Da09151ce92102c952aab", //dummy
    polygon: "0x17CDD65bebDe68cd8A4045422Fcff825A0740Ef9", //dummy
    sepolia: "0x4102621Ac55e068e148Da09151ce92102c952aab", //dummy
    amoy: "0x4102621Ac55e068e148Da09151ce92102c952aab", //dummy
  },

  EXCHANGE_ID_2_2_0: {
    hardhat: 1,
    mumbai: 1, // test: 1, staging: 1
    amoy: 1, // test: 1, staging: 1
    polygon: 413,
    localhost: 1,
    sepolia: 1, // test: 1, staging: 1
    mainnet: 1,
  },

  WrappedNative: {
    mainnet: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    hardhat: "0x4102621Ac55e068e148Da09151ce92102c952aab", //dummy
    localhost: "0x4102621Ac55e068e148Da09151ce92102c952aab", //dummy
    test: "0x4102621Ac55e068e148Da09151ce92102c952aab", //dummy
    mumbai: "0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889",
    polygon: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    sepolia: "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9",
    amoy: "0x52eF3d68BaB452a294342DC3e5f464d7f610f72E",
  },

  PRICE_DISCOVERY: {
    mainnet: "0x4102621Ac55e068e148Da09151ce92102c952aab", //dummy
    hardhat: "0x4102621Ac55e068e148Da09151ce92102c952aab", //dummy
    localhost: "0x4102621Ac55e068e148Da09151ce92102c952aab", //dummy
    test: "0x4102621Ac55e068e148Da09151ce92102c952aab", //dummy
    mumbai: "0x74874fF29597b6e01E16475b7BB9D6dC954d0411",
    polygon: "0x17CDD65bebDe68cd8A4045422Fcff825A0740Ef9", //dummy
    sepolia: "0x789d8727b9ae0A8546489232EB55b6fBE86b21Ac",
    amoy: "0xFFcd4c407B60B0d4351945484F9354d2C9E34EA1",
  },
};
