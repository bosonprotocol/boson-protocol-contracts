const defaultConfig = require("./hardhat.config.js");
const environments = require("./environments");

module.exports = {
  ...defaultConfig,
  networks: {
    hardhat: {
      forking: {
        url: environments.polygon.txNode,
      },
      accounts: { mnemonic: environments.hardhat.mnemonic },
    },
  },
};
