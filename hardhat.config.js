const dotEnvConfig = require('dotenv');
dotEnvConfig.config();

const environments = require('./environments');
const {task} = require("hardhat/config");
require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-web3");
require('hardhat-contract-sizer');
require("hardhat-gas-reporter");
require("solidity-coverage");

const lazyImport = async (module) => {
    return await require(module);
}

task("deploy-mock-nft-auth", "Deploy mock NFT Auth tokens and mint tokens to addresses")
    .setAction(async () => {
        const {deployAndMintMockNFTAuthTokens} = await lazyImport('./scripts/util/deploy-mock-tokens')
        await deployAndMintMockNFTAuthTokens();
    })

task("estimate-limits", "Estimates the maximum values for limits in protocol config")
    .setAction(async () => {
        const {estimateLimits} = await lazyImport('./scripts/util/estimate-limits')
        await estimateLimits();
    })

module.exports = {
    defaultNetwork: "hardhat",
    networks: {
        hardhat: {
            accounts: {mnemonic: environments.hardhat.mnemonic},
            gas: environments.hardhat.gasLimit
        },
        localhost: {
            url: environments.localhost.txNode || "http://127.0.0.1:8545",
            accounts: environments.hardhat.mnemonic ? {mnemonic: environments.hardhat.mnemonic} : environments.localhost.keys,
            gas: environments.localhost.gasLimit
        },
        test: {
            url: environments.test.txNode,
            accounts: environments.test.keys,
            gas: environments.test.gasLimit
        },
        mainnet: {
            url: environments.mainnet.txNode,
            accounts: environments.mainnet.keys,
            gas: environments.mainnet.gasLimit
        },
        mumbai: {
            url: environments.mumbai.txNode,
            accounts: environments.mumbai.keys,
            gas: environments.mumbai.gasLimit
        }
    },
    etherscan: {
        apiKey: {
            mainnet: environments.etherscan.apiKey,
            polygonMumbai: environments.polygonscan.apiKey,
        }
    },
    solidity: {
        version: "0.8.17",
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
