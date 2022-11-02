const dotEnvConfig = require("dotenv");
dotEnvConfig.config();

const environments = require("./environments");
const { task } = require("hardhat/config");
require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-web3");
require("hardhat-contract-sizer");
require("hardhat-gas-reporter");
require("solidity-coverage");

const lazyImport = async (module) => {
  return await require(module);
};

task("deploy-mock-nft-auth", "Deploy mock NFT Auth tokens and mint tokens to addresses").setAction(async () => {
  const { deployAndMintMockNFTAuthTokens } = await lazyImport("./scripts/util/deploy-mock-tokens");
  await deployAndMintMockNFTAuthTokens();
});

task("estimate-limits", "Estimates the maximum values for limits in protocol config").setAction(async () => {
  const { estimateLimits } = await lazyImport("./scripts/util/estimate-limits");
  await estimateLimits();
});

task("create-dispute-resolver", "Creates and activates a dispute resolver")
  .addParam("path", "The path to the dispute resolver json file")
  .addFlag("createOnly", "Only create the dispute resolver")
  .addFlag("activateOnly", "Only activate the dispute resolver")
  .setAction(async ({ path, createOnly, activateOnly }) => {
    const { createAndActivateDR } = await lazyImport("./scripts/util/create-and-activate-DR");
    await createAndActivateDR(path, createOnly, activateOnly);
  });

task("verify-suite", "Verify contracts on the block explorer")
  .addParam("chainId", "The chain id of the deployed contract address file")
  .addParam("env", "The environment of the contract address file")
  .setAction(async ({ chainId, env }) => {
    const { verifySuite } = await lazyImport("./scripts/util/verify-suite");

    // Contract list filter - empty array or use values from the name field of the contract object
    const filter = [];
    await verifySuite(chainId, env, filter);
  });

module.exports = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      accounts: { mnemonic: environments.hardhat.mnemonic },
    },
    localhost: {
      url: environments.localhost.txNode || "http://127.0.0.1:8545",
      accounts: environments.hardhat.mnemonic
        ? { mnemonic: environments.hardhat.mnemonic }
        : environments.localhost.keys,
    },
    test: {
      url: environments.test.txNode,
      accounts: environments.test.keys,
    },
    mainnet: {
      url: environments.mainnet.txNode,
      accounts: environments.mainnet.keys,
    },
    mumbai: {
      url: environments.mumbai.txNode,
      accounts: environments.mumbai.keys,
    },
    polygon: {
      url: environments.polygon.txNode,
      accounts: environments.polygon.keys,
    },
  },
  etherscan: {
    apiKey: {
      mainnet: environments.etherscan.apiKey,
      polygonMumbai: environments.polygonscan.apiKey,
      polygon: environments.polygonscan.apiKey,
    },
  },
  solidity: {
    version: "0.8.9",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
        details: {
          yul: true,
        },
      },
    },
  },
  gasReporter: {
    currency: "USD",
    enabled: true,
    gasPrice: 300,
    coinmarketcap: environments.coinmarketcap.apiKey,
    showTimeSpent: true,
    showMethodSig: false,
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
