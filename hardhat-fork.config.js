const defaultConfig = require("./hardhat.config.js");
require("hardhat-preprocessor");
const environments = require("./environments");
const fs = require("fs");
const { subtask } = require("hardhat/config");
const path = require("node:path");
const { glob } = require("glob");
const { TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS } = require("hardhat/builtin-tasks/task-names");
require("hardhat-preprocessor");

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

let brokenLine = false;
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
      transform: (line, { absolutePath }) => {
        if (absolutePath.includes("submodules")) {
          const submodule = absolutePath.split("submodules/")[1].split("/")[0];
          if (line.match(/^\s*import /i) || brokenLine) {
            brokenLine = false;
            if (!line.includes(";")) brokenLine = true;
            for (const [from, to] of getRemappings()) {
              if (line.includes(from)) {
                line = line.replace(from, to.replace("${submodule}", submodule));
                break;
              }
            }
          } else if (line.match(/^\s*pragma /i)) {
            // needed for compatibility with submodules
            line = line.replace(/solidity\s+0\.8\.9/i, "solidity ^0.8.9");
          }
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
