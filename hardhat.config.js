const dotEnvConfig = require('dotenv');
dotEnvConfig.config();

const environments = require('./environments');
require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-web3");
require('hardhat-contract-sizer');
require("hardhat-gas-reporter");
require("solidity-coverage");


module.exports = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      accounts: {mnemonic: environments.hardhat.mnemonic},
      gas: environments.gasLimit
    },
    test: {
      url: environments.test.txNode,
      accounts: environments.test.keys,
      gas: environments.gasLimit
    },
    ropsten: {
      url: environments.ropsten.txNode,
      accounts: environments.ropsten.keys,
      gas: environments.gasLimit
    },
    mainnet: {
      url: environments.mainnet.txNode,
      accounts: environments.mainnet.keys,
      gas: environments.gasLimit
    },
    mumbai: {
      url: environments.mumbai.txNode,
      accounts: environments.mumbai.keys,
      gas: environments.gasLimit
    }
  },
  etherscan: {
    apiKey: {
      mainnet: environments.etherscan.apiKey,
      polygonMumbai: environments.polygonscan.apiKey,
    }
  },
  solidity: {
    version: "0.8.9",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
        details: {
          yul: true
        }
      }
    }
  },
  gasReporter: {
    currency: 'USD',
    enabled: true,
    gasPrice: 300,
    coinmarketcap: environments.coinmarketcap.apiKey,
    showTimeSpent: true,
    showMethodSig: false
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};