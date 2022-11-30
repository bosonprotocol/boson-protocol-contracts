const shell = require("shelljs");
const hre = require("hardhat");
const ethers = hre.ethers;
const { assert } = require("chai");
const {
  deploySuite,
  getStorageLayout,
  compareStorageLayouts,
  populateVoucherContract,
  getVoucherContractState,
} = require("../../util/upgrade");

const oldVersion = "v2.1.0";
const newVersion = "preminted-voucher";

/**
 *  Upgrade test case - After upgrade from 2.0.0 to 2.1.0 everything is still operational
 */
describe("[@skip-on-coverage] After facet upgrade, everything is still operational", function () {
  // Common vars
  let deployer;

  // reference protocol state
  let voucherContractState;
  let preUpgradeEntities;
  let preUpgradeStorageLayout;

  before(async function () {
    // Make accounts available
    [deployer] = await ethers.getSigners();

    // temporary update config, so compiler outputs storage layout
    for (const compiler of hre.config.solidity.compilers) {
      if (compiler.settings.outputSelection["*"]["BosonVoucher"]) {
        compiler.settings.outputSelection["*"]["BosonVoucher"].push("storageLayout"); // change * to BosonVoucher
      } else {
        compiler.settings.outputSelection["*"]["BosonVoucher"] = ["storageLayout"];
      }
    }

    const { protocolDiamondAddress, protocolContracts, mockContracts } = await deploySuite(deployer, oldVersion);

    preUpgradeStorageLayout = await getStorageLayout("BosonVoucher");
    preUpgradeEntities = await populateVoucherContract(
      deployer,
      protocolDiamondAddress,
      protocolContracts,
      mockContracts
    );
    voucherContractState = await getVoucherContractState(preUpgradeEntities);

    // Upgrade protocol
    if (newVersion) {
      // checkout the new tag
      console.log(`Checking out version ${newVersion}`);
      shell.exec(`git checkout ${newVersion} contracts`);
    } else {
      // if tag was not created yet, use the latest code
      console.log(`Checking out latest code`);
      shell.exec(`git checkout HEAD contracts`);
    }

    // Upgrade clients
    await hre.run("compile");
    await hre.run("upgrade-clients", { env: "upgrade-test" });
  });

  after(async function () {
    // revert to latest state of contracts
    shell.exec(`git checkout HEAD contracts`);
  });

  // Voucher state
  context("📋 Right After upgrade", async function () {
    it("Old storage layout should be unaffected", async function () {
      const postUpgradeStorageLayout = await getStorageLayout("BosonVoucher");

      assert(compareStorageLayouts(preUpgradeStorageLayout, postUpgradeStorageLayout), "Upgrade breaks storage layout");
    });

    it("State is not affected directly after the update", async function () {
      // Get protocol state after the upgrade
      const voucherContractStateAfterUpgrade = await getVoucherContractState(preUpgradeEntities);

      // State before and after should be equal
      assert.deepEqual(voucherContractStateAfterUpgrade, voucherContractState, "state mismatch after upgrade");
    });
  });
});
