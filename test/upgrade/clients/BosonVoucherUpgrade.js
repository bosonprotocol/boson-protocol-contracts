const shell = require("shelljs");
const hre = require("hardhat");
const ethers = hre.ethers;
const { assert } = require("chai");
const {
  deploySuite,
  upgradeClients,
  getStorageLayout,
  compareStorageLayouts,
  populateVoucherContract,
  getVoucherContractState,
} = require("../../util/upgrade");

const oldVersion = "v2.1.0";
const newVersion = "HEAD";
const v2_1_0_scripts = "b02a583ddb720bbe36fa6e29c344d35e957deb8b";

/**
 *  Upgrade test case - After upgrade from 2.1.0 to 2.2.0 everything is still operational
 */
describe("[@skip-on-coverage] After client upgrade, everything is still operational", function () {
  // Common vars
  let deployer;

  // reference protocol state
  let voucherContractState;
  let preUpgradeEntities;
  let preUpgradeStorageLayout;
  let protocolDiamondAddress, protocolContracts, mockContracts;

  before(async function () {
    // Make accounts available
    [deployer] = await ethers.getSigners();

    // temporary update config, so compiler outputs storage layout
    for (const compiler of hre.config.solidity.compilers) {
      if (compiler.settings.outputSelection["*"]["BosonVoucher"]) {
        compiler.settings.outputSelection["*"]["BosonVoucher"].push("storageLayout");
      } else {
        compiler.settings.outputSelection["*"]["BosonVoucher"] = ["storageLayout"];
      }
    }

    ({ protocolDiamondAddress, protocolContracts, mockContracts } = await deploySuite(
      deployer,
      oldVersion,
      v2_1_0_scripts
    ));

    preUpgradeStorageLayout = await getStorageLayout("BosonVoucher");
    preUpgradeEntities = await populateVoucherContract(
      deployer,
      protocolDiamondAddress,
      protocolContracts,
      mockContracts
    );
    voucherContractState = await getVoucherContractState(preUpgradeEntities);

    // upgrade clients
    await upgradeClients(newVersion);
  });

  after(async function () {
    // revert to latest state of contracts
    shell.exec(`rm -rf contracts/*`);
    shell.exec(`git checkout HEAD contracts`);
    shell.exec(`git reset HEAD contracts`);
    shell.exec(`rm -rf scripts/*`);
    shell.exec(`git checkout HEAD scripts`);
    shell.exec(`git reset HEAD scripts`);
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

  // Create new vocuher data. Existing data should not be affected
  context("📋 New data after the upgrade do not corrupt the data from before the upgrade", async function () {
    it("State is not affected", async function () {
      await populateVoucherContract(
        deployer,
        protocolDiamondAddress,
        protocolContracts,
        mockContracts,
        preUpgradeEntities
      );

      // Get protocol state after the upgrade. Get the data that should be in location of old data.
      const voucherContractStateAfterUpgradeAndActions = await getVoucherContractState(preUpgradeEntities);

      // The only thing that should change are buyers's balances, since they comitted to new offers and they got vouchers for them.
      // Modify the post upgrade state to reflect the expected changes
      const { buyers, sellers } = preUpgradeEntities;
      const entities = [...sellers, ...buyers];
      for (let i = 0; i < buyers.length; i++) {
        // loop matches the loop in populateVoucherContract
        for (let j = i; j < buyers.length; j++) {
          const offer = preUpgradeEntities.offers[i + j].offer;
          const sellerId = ethers.BigNumber.from(offer.sellerId).toHexString();

          // Find the voucher data for the seller
          const voucherData = voucherContractStateAfterUpgradeAndActions.find(
            (vd) => vd.sellerId.toHexString() == sellerId
          );

          const buyerWallet = buyers[j].wallet;
          const buyerIndex = entities.findIndex((e) => e.wallet.address == buyerWallet.address);

          // Update the balance of the buyer
          voucherData.balanceOf[buyerIndex] = voucherData.balanceOf[buyerIndex].sub(1);
        }
      }

      // State before and after should be equal
      assert.deepEqual(
        voucherContractState,
        voucherContractStateAfterUpgradeAndActions,
        "state mismatch after upgrade"
      );
    });
  });
});
