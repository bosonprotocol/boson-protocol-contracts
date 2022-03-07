/**
 *  Build and test environment configuration template.
 *
 *  - Copy to environments.js and edit to suit local needs.
 *  - environments.js is in .gitignore and will not be committed
 */

require('dotenv').config()

module.exports = {

    // For helping public deployments succeed if default gas doesn't work
    "gasLimit": parseInt(process.env.DEPLOYER_GAS_LIMIT),

    // Needed for verifying contract code on Etherscan
    "etherscan": {
        "apiKey": process.env.ETHERSCAN_API_KEY,
    },

    // Needed for Gas Reporter
    "coinmarketcap": {
        "apiKey": ""
    },

    // Hardhat testnet
    //  - throwaway HDWallet mnemonic for running unit tests, which require more than one address
    "hardhat": {
        "mnemonic": process.env.DEPLOYER_HARDHAT_MNEMONIC
    },

    // Ropsten testnet
    //  - placeholder private key is first address of test HDWallet used in hardhat network config
    //  - Replace key with multisig pk for deployment
    "ropsten": {
        "txNode": process.env.DEPLOYER_ROPSTEN_TXNODE,
        "keys": [process.env.DEPLOYER_ROPSTEN_KEY]
    },

    // Ethereum Mainnet
    //  - placeholder private key is first address of test HDWallet used in hardhat network config
    //  - Replace key with multisig pk for deployment
    "mainnet": {
        "txNode": process.env.DEPLOYER_MAINNET_TXNODE,
        "keys": [process.env.DEPLOYER_MAINNET_KEY]
    }

};
