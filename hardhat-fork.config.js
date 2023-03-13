const defaultConfig = require("./hardhat.config.js");
const environments = require("./environments");
const { subtask } = require("hardhat/config");
const path = require("node:path");
const { glob } = require("glob");
const { TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS } = require("hardhat/builtin-tasks/task-names");

subtask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS, async (_, { config }) => {
  const contracts = await glob(path.join(config.paths.root, "contracts/**/*.sol"));

  const submodules = await glob(path.join(config.paths.root, "submodules/**/{src,contracts}/**/*.sol"), {
    ignore: [
      path.join(config.paths.root, "submodules/**/node_modules/**"),
      path.join(config.paths.root, "submodules/**/test/**"),
      path.join(config.paths.root, "submodules/**/src/test/*.sol"),
      path.join(config.paths.root, "submodules/**/src/mocks/*.sol"),
      path.join(config.paths.root, "submodules/**/lib/**/*.sol"),
    ],
  });

  // Include files inside lib folder when it is inside src folder
  const submodulesWithLib = await glob(path.join(config.paths.root, "submodules/**/{src,contracts}/lib/**/*.sol"), {
    ignore: [path.join(config.paths.root, "submodules/**/test/**")],
  });

  return [...contracts, ...submodules, ...submodulesWithLib].map(path.normalize);
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
      allowUnlimitedContractSize: true,
    },
  },
};
