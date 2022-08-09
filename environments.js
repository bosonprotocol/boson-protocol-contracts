/**
 *  Build and test environment configuration.
 *
 *  - Translates environment vars into JSON objects
 *  - Environment vars are defined in .env and
 */

require('dotenv').config()

module.exports = {
    "confirmations": parseInt(process.env.CONFIRMATIONS),

    // Needed for verifying contract code on Etherscan
    "etherscan": {
        "apiKey": process.env.DEPLOYER_ETHERSCAN_API_KEY
    },

    // Needed for verifying contract code on Polygonscan
    "polygonscan": {
        "apiKey": process.env.DEPLOYER_POLYGONSCAN_API_KEY
    },

    // Needed for Gas Reporter
    "coinmarketcap": {
        "apiKey": process.env.GAS_REPORTER_COINMARKETCAP_API_KEY
    },

    // Hardhat testnet
    //  - throwaway HDWallet mnemonic for running unit tests, which require more than one address
    "hardhat": {
        "mnemonic": process.env.DEPLOYER_HARDHAT_MNEMONIC,
        "gasLimit": parseInt(process.env.DEPLOYER_GAS_LIMIT_TEST),
    },

    // Internal test env
    //  - placeholder private key is first address of test HDWallet used in hardhat network config
    //  - Replace key with pk for deployment
    "test": {
        "txNode": process.env.DEPLOYER_TEST_TXNODE,
        "keys": [process.env.DEPLOYER_TEST_KEY],
        "gasLimit": parseInt(process.env.DEPLOYER_GAS_LIMIT_TEST),
    },

    // Ethereum Mainnet
    //  - placeholder private key is first address of test HDWallet used in hardhat network config
    //  - Replace key with multisig pk for deployment
    "mainnet": {
        "txNode": process.env.DEPLOYER_MAINNET_TXNODE,
        "keys": [process.env.DEPLOYER_MAINNET_KEY],
        "gasLimit": parseInt(process.env.DEPLOYER_GAS_LIMIT),
    },

    // Polygon Mumbai testnet
    //  - placeholder private key is first address of test HDWallet used in hardhat network config
    //  - Replace key with multisig pk for deployment
    "mumbai": {
        "txNode": process.env.DEPLOYER_MUMBAI_TXNODE,
        "keys": [process.env.DEPLOYER_MUMBAI_KEY],
        "gasLimit": parseInt(process.env.DEPLOYER_GAS_LIMIT),
    }  

};