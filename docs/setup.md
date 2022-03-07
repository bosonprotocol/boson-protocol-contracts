# Boson Protocol V2 
## [Intro](../README.md) | Setup | [Tasks](tasks.md) | [Architecture](architecture.md) | [Domain Model](domain.md)

## Developer Setup
The stack is a simple one:
* Solidity
* JavaScript
* Node/NPM
* HardHat
* Waffle
* Ethers

### Install Node (also installs NPM)
* Use the latest [LTS (long term support) version](https://nodejs.org/en/download/).

### Install required Node modules
All NPM resources are project local. No global installs required.

```
cd path/to/contracts-v2 
npm install
```

### Configure Environment
- Copy [environments_template.js](../environments_template.js) to `environments.js` and edit to suit.
- API keys are only needed for deploying to public networks.
- `environments.js` is included in `.gitignore` and will not be committed to the repo.
- For your target Ethereum network environment, set:
    * `txNode`: the endpoint for sending ethereum transactions
    * `mnemonic`: a valid ethereum HD wallet seed phrase

- For verifying code and running the gas reporter, set:
    * `etherscan.apiKey`: your etherscan API key
    * `coinmarketcap.apiKey`: your coinmarketcap API key

```javascript
module.exports = {
    "etherscan": {
        "apiKey": "<YOUR_ETHERSCAN_API_KEY>"
    },

  "coinmarketcap": {
    "apiKey": "<YOUR_COINMARKETCAP_API_KEY>"
  },

  "ropsten": {
        "txNode": "https://rinkeby.infura.io/v3/<YOUR_INFURA_API_KEY>",
        "mnemonic": "<YOUR_UNIQUE_TWELVE_WORD_WALLET_SEED_PHRASE>"
  },

  "mainnet": {
        "txNode": "https://mainnet.infura.io/v3/<YOUR_INFURA_API_KEY>",
        "mnemonic": "<YOUR_UNIQUE_TWELVE_WORD_WALLET_SEED_PHRASE>"
    }

};
```