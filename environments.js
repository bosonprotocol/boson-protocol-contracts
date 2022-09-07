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

    // Needed for verifying contract code on Blockscout (test env). Blockscout does not require an API KEY, 
    //so the default dummy value in .env.example can be used.
     "blockscout": {
        "apiKey": process.env.BLOCKSCOUT_API_KEY,
        "apiURL": process.env.BLOCKSCOUT_API,
        "browserURL": process.env.BLOCKSCOUT_BROWSER_URL

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

    // Local node
    //  - if both mnemonic and keys are specified, mnemonic will be used
    //  - if no DEPLOYER_LOCAL_TXNODE is specified, default "http://127.0.0.1:8545" will be used
    "localhost": {
        "mnemonic": process.env.DEPLOYER_LOCAL_MNEMONIC,
        "txNode": process.env.DEPLOYER_LOCAL_TXNODE,
        "keys": [process.env.DEPLOYER_LOCAL_KEY],
        "gasLimit": parseInt(process.env.DEPLOYER_GAS_LIMIT_TEST),
        "adminAddress": process.env.ADMIN_ADDRESS_LOCAL,
        "nftAuthTokenHolders": process.env.AUTH_TOKEN_OWNERS_LOCAL
    },

    // Internal test env
    //  - placeholder private key is first address of test HDWallet used in hardhat network config
    //  - Replace key with pk for deployment
    "test": {
        "txNode": process.env.DEPLOYER_TEST_TXNODE,
        "keys": [process.env.DEPLOYER_TEST_KEY],
        "gasLimit": parseInt(process.env.DEPLOYER_GAS_LIMIT_TEST),
        "adminAddress": process.env.ADMIN_ADDRESS_TEST,
        "nftAuthTokenHolders": process.env.AUTH_TOKEN_OWNERS_TEST
    },

    // Mainnet
    //  - placeholder private key is first address of test HDWallet used in hardhat network config
    //  - Replace key with multisig pk for deployment
    "mainnet": {
        "txNode": process.env.DEPLOYER_MAINNET_TXNODE,
        "keys": [process.env.DEPLOYER_MAINNET_KEY],
        "gasLimit": parseInt(process.env.DEPLOYER_GAS_LIMIT),
        "adminAddress": process.env.ADMIN_ADDRESS_MAINNET
    },

    // Polygon Mumbai testnet
    //  - placeholder private key is first address of test HDWallet used in hardhat network config
    //  - Replace key with multisig pk for deployment
    "mumbai": {
        "txNode": process.env.DEPLOYER_MUMBAI_TXNODE,
        "keys": [process.env.DEPLOYER_MUMBAI_KEY],
        "gasLimit": parseInt(process.env.DEPLOYER_GAS_LIMIT),
        "adminAddress": process.env.ADMIN_ADDRESS_MUMBAI
    }  

};