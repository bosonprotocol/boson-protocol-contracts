/**
 *  Build and test environment configuration template.
 *
 *  - Copy to environments.js and edit to suit local needs.
 *  - environments.js is in .gitignore and will not be committed
 */
module.exports = {

    // For helping public deployments succeed if default gas doesn't work
    "gasLimit": 20450000,

    // Needed for verifying contract code on Etherscan
    "etherscan": {
        "apiKey": ""
    },

    // Needed for Gas Reporter
    "coinmarketcap": {
        "apiKey": ""
    },


    // Hardhat testnet
    //  - throwaway HDWallet mnemonic for running unit tests, which require more than one address
    "hardhat": {
        "txNode": "",
        "mnemonic": "reduce chair insane vault universe fitness flame motor wood toy vacuum special"
    },

    // Ropsten testnet
    //  - placeholder private key is first address of test HDWallet used in hardhat network config
    //  - Replace key with multisig pk for deployment
    "ropsten": {
        "txNode": "",
        "keys": ["0xb644aa4a6ada1f1a996def5cee46b93922006d78754095525cefeed36f5ab1c0"]
    },

    // Ethereum Mainnet
    //  - placeholder private key is first address of test HDWallet used in hardhat network config
    //  - Replace key with multisig pk for deployment
    "mainnet": {
        "txNode": "",
        "keys": ["0xb644aa4a6ada1f1a996def5cee46b93922006d78754095525cefeed36f5ab1c0"]
    }

};