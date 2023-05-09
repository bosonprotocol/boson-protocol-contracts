const defaultConfig = require("./hardhat.config.js");
require("hardhat-preprocessor");
const environments = require("./environments");
const fs = require("fs");
const { subtask } = require("hardhat/config");
const path = require("node:path");
const { glob } = require("glob");
const { TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS } = require("hardhat/builtin-tasks/task-names");

subtask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS, async (_, { config }, runSuper) => {
  const files = await runSuper();

  const submodules = await glob(path.join(config.paths.root, "submodules/**/{src,contracts}/**/*.sol"), {
    ignore: [
      path.join(config.paths.root, "submodules/**/node_modules/**"),
      path.join(config.paths.root, "submodules/**/test/**"),
      path.join(config.paths.root, "submodules/**/src/test/*.sol"),
      path.join(config.paths.root, "submodules/**/src/mocks/*.sol"),
      path.join(config.paths.root, "submodules/**/lib/**/*.sol"),
      path.join(config.paths.root, "submodules/**/artifacts/**"),
      path.join(config.paths.root, "submodules/**/typechain-types/**"),
    ],
  });

  // Include files inside lib folder when it is inside src folder
  const submodulesWithLib = await glob(path.join(config.paths.root, "submodules/**/{src,contracts}/lib/**/*.sol"), {
    ignore: [
      path.join(config.paths.root, "submodules/**/test/**"),
      path.join(config.paths.root, "submodules/**/artifacts/**"),
    ],
  });

  return [...files, ...submodules, ...submodulesWithLib].map(path.normalize);
});

function getRemappings() {
  return fs
    .readFileSync("remappings.txt", "utf8")
    .split("\n")
    .filter(Boolean) // remove empty lines
    .map((line) => line.trim().split("="));
}

module.exports = {
  ...defaultConfig,
  networks: {
    hardhat: {
      forking: {
        url: environments.polygon.txNode,
        blockNumber: 40119033,
      },
      accounts: { mnemonic: environments.hardhat.mnemonic },
      allowUnlimitedContractSize: true,
    },
  },
  preprocess: {
    eachLine: () => ({
      transform: (line) => {
        if (line.match(/^\s*import /i)) {
          for (const [from, to] of getRemappings()) {
            if (line.includes(from)) {
              line = line.replace(from, to);
              break;
            }
          }
        }
        return line;
      },
    }),
  },
};
