const hre = require("hardhat");
const ethers = hre.ethers;
const { oneWeek, oneMonth } = require("../../test/utils/constants");

/**
 *  Protocol config parameters, used during the deployment
 *
 */

module.exports = {
  // Protocol configuration params
  fees: {
    percentage: "150", // 1.5%  : 150
    flatBoson: "0",
  },
  limits: {
    maxExchangesPerBatch: "100",
    maxOffersPerGroup: "100",
    maxTwinsPerBundle: "100",
    maxOffersPerBundle: "100",
    maxOffersPerBatch: "100",
    maxTokensPerWithdrawal: "100",
    maxFeesPerDisputeResolver: 100,
    maxEscalationResponsePeriod: oneMonth,
    maxDisputesPerBatch: "100",
    maxAllowedSellers: "100",
    maxTotalOfferFeePercentage: 4000, // 40%
    maxRoyaltyPecentage: 1000, //10%
    maxResolutionPeriod: oneMonth,
    minFulfillmentPeriod: oneWeek,
  },
  buyerEscalationDepositPercentage: "100", // 1%

  // Boson Token (ERC-20) contract address
  TOKEN: {
    mainnet: "0xC477D038d5420C6A9e0b031712f61c5120090de9",
    hardhat: "0x2cDA796787425AF0892F20F6019704F053bCD6bF", //dummy
    localhost: "0x2cDA796787425AF0892F20F6019704F053bCD6bF", //dummy
    test: "0x520ce45DF6d14334257BFdD360a5C22B06E309c7", //dummy
    mumbai: "0x520ce45DF6d14334257BFdD360a5C22B06E309c7", //dummy
  },

  // Treasury contract address
  TREASURY: {
    mainnet: "0x4a25E18076DDcFd646ED14ABC07286c2A4c1256A",
    hardhat: "0x17CDD65bebDe68cd8A4045422Fcff825A0740Ef9", //dummy
    localhost: "0x17CDD65bebDe68cd8A4045422Fcff825A0740Ef9", //dummy
    test: "0x17CDD65bebDe68cd8A4045422Fcff825A0740Ef9", //dummy
    mumbai: "0x17CDD65bebDe68cd8A4045422Fcff825A0740Ef9", //dummy
  },

  // Boson voucher beacon contract address
  BEACON: {
    mainnet: ethers.constants.AddressZero,
    hardhat: "0x494f5238b40119e707582Ce87E0ca3627dB23Bcb", //dummy
    localhost: "0x494f5238b40119e707582Ce87E0ca3627dB23Bcb", //dummy
    test: "0x494f5238b40119e707582Ce87E0ca3627dB23Bcb", //dummy
    mumbai: "0x494f5238b40119e707582Ce87E0ca3627dB23Bcb", //dummy
  },

  // Beacon proxy contract address
  BEACON_PROXY: {
    mainnet: ethers.constants.AddressZero,
    hardhat: "0x4102621Ac55e068e148Da09151ce92102c952aab", //dummy
    localhost: "0x4102621Ac55e068e148Da09151ce92102c952aab", //dummy
    test: "0x4102621Ac55e068e148Da09151ce92102c952aab", //dummy
    mumbai: "0x4102621Ac55e068e148Da09151ce92102c952aab", //dummy
  },
};
