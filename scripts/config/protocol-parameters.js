const hre = require("hardhat");
const ethers = hre.ethers;
const { oneMonth } = require("../../test/utils/constants");

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
  },
  buyerEscalationDepositPercentage: "100", // 1%

  // Boson Token (ERC-20) contract address
  TOKEN: {
    mainnet: "0xC477D038d5420C6A9e0b031712f61c5120090de9",
    hardhat: ethers.constants.AddressZero,
    localhost: ethers.constants.AddressZero,
    test: "0x520ce45DF6d14334257BFdD360a5C22B06E309c7",
    mumbai: ethers.constants.AddressZero,
  },

  // Treasury contract address
  TREASURY: {
    mainnet: "0x4a25E18076DDcFd646ED14ABC07286c2A4c1256A",
    hardhat: ethers.constants.AddressZero,
    localhost: ethers.constants.AddressZero,
    test: ethers.constants.AddressZero,
    mumbai: ethers.constants.AddressZero,
  },

  // Boson voucher beacon contract address
  BEACON: {
    mainnet: ethers.constants.AddressZero,
    hardhat: ethers.constants.AddressZero,
    localhost: ethers.constants.AddressZero,
    test: ethers.constants.AddressZero,
    mumbai: ethers.constants.AddressZero,
  },

  // Beacon proxy contract address
  BEACON_PROXY: {
    mainnet: ethers.constants.AddressZero,
    hardhat: ethers.constants.AddressZero,
    localhost: ethers.constants.AddressZero,
    test: ethers.constants.AddressZero,
    mumbai: ethers.constants.AddressZero,
  },
};
