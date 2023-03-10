const defaultConfig = require("./hardhat.config.js");
const environments = require("./environments");
const { subtask } = require("hardhat/config");
const path = require("node:path");
const { glob } = require("glob");
const { TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS } = require("hardhat/builtin-tasks/task-names");
const fs = require("fs");
require("hardhat-preprocessor");

subtask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS, async (_, { config }) => {
  const contracts = await glob(path.join(config.paths.root, "contracts/**/*.sol"));
  const submodulesContracts = await glob(path.join(config.paths.root, "submodules/**/contracts/*.sol"), {
    ignore: path.join(config.paths.root, "submodules/**/node_modules/**"),
  });

  return [...contracts, ...submodulesContracts].map(path.normalize);
});
module.exports = {
  ...defaultConfig,
  networks: {
    hardhat: {
      forking: {
        url: environments.polygon.txNode,
        blockNumber: 40119033,
      },
      accounts: { mnemonic: environments.hardhat.mnemonic },
    },
  },
  preprocess: {
    eachLine: () => ({
      transform: (line) => {
        // manage clashing imports
        if (line.match(/^\s*import /i)) {
          for (const [from, to] of getRemappings()) {
            if (line.includes(from)) {
              line = line.replace(from, to);
              break;
            }
          }
        } else if (line.match(/^\s*pragma /i)) {
          // needed for compatibility with submodules
          line = line.replace(/solidity\s+0\.8\.9/i, "solidity ^0.8.9");
        }
        return line;
      },
    }),
  },
};

function getRemappings() {
  return fs
    .readFileSync("remappings.txt", "utf8")
    .split("\n")
    .filter(Boolean) // remove empty lines
    .map((line) => line.trim().split("="));
}
