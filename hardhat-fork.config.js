const defaultConfig = require("./hardhat.config.js");
const environments = require("./environments");
const { task, subtask } = require("hardhat/config");
const path = require("node:path");
const fs = require("fs");
const { glob } = require("glob");
const { TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS } = require("hardhat/builtin-tasks/task-names");

subtask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS, async (_, { config }) => {
  const contracts = await glob(path.join(config.paths.root, "contracts/**/*.sol"));
  const submodulesContracts = await glob(
    path.join(config.paths.root, "submodules/**/contracts/*.sol"),
    { ignore: path.join(config.paths.root, "submodules/**/node_modules/**") }
  );

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
};
