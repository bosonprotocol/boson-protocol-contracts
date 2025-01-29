const dotEnvConfig = require("dotenv");
dotEnvConfig.config();

const environments = require("./environments");
const { task } = require("hardhat/config");
require("@nomicfoundation/hardhat-toolbox");
require("@nomiclabs/hardhat-web3");
require("hardhat-contract-sizer");
require("hardhat-preprocessor");

const lazyImport = async (module) => {
  return await require(module);
};

task("deploy-mock-nft-auth", "Deploy mock NFT Auth tokens and mint tokens to addresses").setAction(async () => {
  const { deployAndMintMockNFTAuthTokens } = await lazyImport("./scripts/util/deploy-mock-tokens");
  await deployAndMintMockNFTAuthTokens();
});

task("estimate-limits", "Estimates the maximum values for limits in protocol config").setAction(async () => {
  const { estimateLimits } = await lazyImport("./scripts/util/estimate-limits");
  await estimateLimits();
});

task("create-dispute-resolver", "Creates a dispute resolver")
  .addParam("path", "The path to the dispute resolver json file")
  .setAction(async ({ path }) => {
    const { createDisputeResolver } = await lazyImport("./scripts/util/create-dispute-resolver");
    await createDisputeResolver(path);
  });

task("verify-suite", "Verify contracts on the block explorer")
  .addParam("env", "The environment of the contract address file")
  .setAction(async ({ env }) => {
    const { verifySuite } = await lazyImport("./scripts/verify-suite");

    await verifySuite(env);
  });

task(
  "deploy-suite",
  "Deploy suite deploys protocol diamond, all facets, client and beacon, and initializes protocol diamond"
)
  .addOptionalParam("env", "The deployment environment")
  .addOptionalParam("facetConfig", "JSON list of facets to deploy")
  .addFlag("dryRun", "Test the deployment without deploying")
  .addFlag("create3", "Use CREATE3 for deployment")
  .setAction(async ({ env, facetConfig, dryRun, create3 }) => {
    let balanceBefore, getBalance;
    if (dryRun) {
      let setupDryRun;
      ({ setupDryRun, getBalance } = await lazyImport(`./scripts/util/dry-run.js`));
      ({ env, deployerBalance: balanceBefore } = await setupDryRun(env));
    }

    const { deploySuite } = await lazyImport("./scripts/deploy-suite.js");
    await deploySuite(env, facetConfig, create3);

    if (dryRun) {
      const balanceAfter = await getBalance();
      const etherSpent = balanceBefore - balanceAfter;

      const { formatUnits } = require("ethers");
      console.log("Ether spent: ", formatUnits(etherSpent, "ether"));
    }
  });

task("upgrade-facets", "Upgrade existing facets, add new facets or remove existing facets")
  .addParam("newVersion", "The version of the protocol to upgrade to")
  .addParam("env", "The deployment environment")
  .addParam("functionNamesToSelector", "JSON list of function names to selectors")
  .addOptionalParam("facetConfig", "JSON list of facets to upgrade")
  .setAction(async ({ env, facetConfig, newVersion, functionNamesToSelector }) => {
    const { upgradeFacets } = await lazyImport("./scripts/upgrade-facets.js");

    await upgradeFacets(env, facetConfig, newVersion, functionNamesToSelector);
  });

task("upgrade-clients", "Upgrade existing clients")
  .addParam("newVersion", "The version of the protocol to upgrade to")
  .addParam("env", "The deployment environment")
  .addOptionalParam("clientConfig", "JSON list of arguments by network to send to implementation constructor")
  .setAction(async ({ env, clientConfig, newVersion }) => {
    const { upgradeClients } = await lazyImport("./scripts/upgrade-clients.js");

    await upgradeClients(env, clientConfig, newVersion);
  });

task("manage-roles", "Grant or revoke access control roles")
  .addOptionalParam("env", "The deployment environment")
  .setAction(async ({ env }) => {
    const { manageRoles } = await lazyImport("./scripts/manage-roles.js");

    await manageRoles(env);
  });

task("detect-changed-contracts", "Detects which contracts have changed between two versions")
  .addPositionalParam("referenceCommit", "Commit/tag/branch to compare to")
  .addOptionalPositionalParam(
    "targetCommit",
    "Commit/tag/branch to compare. If not provided, it will compare to current branch."
  )
  .setAction(async ({ referenceCommit, targetCommit }) => {
    const { detectChangedContract } = await lazyImport("./scripts/util/detect-changed-contracts.js");

    await detectChangedContract(referenceCommit, targetCommit);
  });

task("split-unit-tests-into-chunks", "Splits unit tests into chunks")
  .addPositionalParam("chunks", "Number of chunks to divide the tests into")
  .setAction(async ({ chunks }) => {
    const { splitUnitTestsIntoChunks } = await lazyImport("./scripts/util/split-unit-tests-into-chunks.js");

    await splitUnitTestsIntoChunks(chunks);
  });

task("migrate", "Migrates the protocol to a new version")
  .addPositionalParam("newVersion", "The version to migrate to")
  .addParam("env", "The deployment environment")
  .addFlag("dryRun", "Test the migration without deploying")
  .setAction(async ({ newVersion, env, dryRun }) => {
    let balanceBefore, getBalance;
    if (dryRun) {
      let setupDryRun;
      ({ setupDryRun, getBalance } = await lazyImport(`./scripts/util/dry-run.js`));
      ({ env, deployerBalance: balanceBefore } = await setupDryRun(env));
    }

    const { migrate } = await lazyImport(`./scripts/migrations/migrate_${newVersion}.js`);
    await migrate(env);

    if (dryRun) {
      const balanceAfter = await getBalance();
      const etherSpent = balanceBefore - balanceAfter;

      const { formatUnits } = require("ethers");
      console.log("Ether spent: ", formatUnits(etherSpent, "ether"));
    }
  });

module.exports = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      accounts: { mnemonic: environments.hardhat.mnemonic },
      gasPrice: 0,
      initialBaseFeePerGas: 0,
    },
    localhost: {
      url: environments.localhost.txNode || "http://127.0.0.1:8545",
      accounts: environments.hardhat.mnemonic
        ? { mnemonic: environments.hardhat.mnemonic }
        : environments.localhost.keys,
    },
    test: {
      url: environments.test.txNode,
      accounts: environments.test.keys,
    },
    mainnet: {
      url: environments.mainnet.txNode,
      accounts: environments.mainnet.keys,
    },
    sepolia: {
      url: environments.sepolia.txNode,
      accounts: environments.sepolia.keys,
    },
    amoy: {
      url: environments.amoy.txNode,
      accounts: environments.amoy.keys,
    },
    polygon: {
      url: environments.polygon.txNode,
      accounts: environments.polygon.keys,
    },
    baseSepolia: {
      url: environments.baseSepolia.txNode,
      accounts: environments.baseSepolia.keys,
    },
    base: {
      url: environments.base.txNode,
      accounts: environments.base.keys,
    },
    optimismSepolia: {
      url: environments.optimismSepolia.txNode,
      accounts: environments.optimismSepolia.keys,
    },
    optimism: {
      url: environments.optimism.txNode,
      accounts: environments.optimism.keys,
    },
    arbitrumSepolia: {
      url: environments.arbitrumSepolia.txNode,
      accounts: environments.arbitrumSepolia.keys,
    },
    arbitrum: {
      url: environments.arbitrum.txNode,
      accounts: environments.arbitrum.keys,
    },
  },
  etherscan: {
    apiKey: {
      mainnet: environments.etherscan.apiKey,
      sepolia: environments.etherscan.apiKey,
      polygon: environments.polygonscan.apiKey,
      polygonAmoy: environments.okLink.apiKey,
      base: environments.basescan.apiKey,
      "base-sepolia": environments.basescan.apiKey,
    },
    customChains: [
      {
        network: "polygonAmoy",
        chainId: 80002,
        urls: {
          apiURL: "https://www.oklink.com/api/v5/explorer/contract/verify-source-code-plugin/AMOY_TESTNET",
          browserURL: "https://www.oklink.com/amoy/",
        },
      },
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
      {
        network: "base-sepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
    ],
  },
  solidity: {
    compilers: [
      {
        version: "0.5.17", // Mock weth contract
      },
      {
        version: "0.8.9",
        settings: {
          optimizer: {
            enabled: true,
            runs: 50, // temporary until we upgrade compiler version
            details: {
              yul: true,
            },
          },
          outputSelection: {
            "*": {
              "*": ["evm.bytecode.object", "evm.deployedBytecode*"],
            },
          },
        },
        viaIR: true,
      },
      {
        version: "0.8.21",
        settings: {
          viaIR: false,
          optimizer: {
            enabled: true,
            runs: 200,
            details: {
              yul: true,
            },
          },
          evmVersion: "london", // for ethereum mainnet, use shanghai, for polygon, use london
        },
      },
      {
        version: "0.8.22",
        settings: {
          viaIR: false,
          optimizer: {
            enabled: true,
            runs: 200,
            details: {
              yul: true,
            },
          },
          evmVersion: "london", // for ethereum mainnet, use shanghai, for polygon, use london
        },
      },
      {
        version: "0.8.17",
        settings: {
          optimizer: {
            enabled: true,
            runs: 190,
            details: {
              yul: true,
            },
          },
        },
      },
      {
        version: "0.4.17",
      },
    ],
  },
  gasReporter: {
    currency: "USD",
    enabled: true,
    gasPrice: 300,
    coinmarketcap: environments.coinmarketcap.apiKey,
    showTimeSpent: true,
    showMethodSig: false,
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 100000,
  },
};
