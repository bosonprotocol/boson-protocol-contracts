const shell = require("shelljs");
const { assert } = require("chai");
const {
  getStorageLayout,
  compareStorageLayouts,
  populateVoucherContract,
  getVoucherContractState,
} = require("../../util/upgrade");
const { getSnapshot, revertToSnapshot } = require("../../util/utils.js");

// Returns function with test that can be reused in every upgrade
function getGenericContext(
  deployer,
  protocolDiamondAddress,
  protocolContracts,
  mockContracts,
  voucherContractState,
  preUpgradeEntities,
  preUpgradeStorageLayout,
  snapshot,
  { equalCustomTypes, renamedVariables }
) {
  const genericContextFunction = async function () {
    afterEach(async function () {
      // Revert to state right after the upgrade.
      // This is used so the lengthy setup (deploy+upgrade) is done only once.
      await revertToSnapshot(snapshot);
      snapshot = await getSnapshot();
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

        assert(
          compareStorageLayouts(preUpgradeStorageLayout, postUpgradeStorageLayout, equalCustomTypes, renamedVariables),
          "Upgrade breaks storage layout"
        );
      });

      it("State is not affected directly after the update", async function () {
        // Get protocol state after the upgrade
        const voucherContractStateAfterUpgrade = await getVoucherContractState(preUpgradeEntities);

        // State before and after should be equal
        assert.deepEqual(voucherContractStateAfterUpgrade, voucherContractState, "state mismatch after upgrade");
      });
    });

    // Create new voucher data. Existing data should not be affected
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

        // The only thing that should change are buyers's balances, since they committed to new offers and they got vouchers for them.
        // Modify the post upgrade state to reflect the expected changes
        const { buyers, sellers } = preUpgradeEntities;
        const entities = [...sellers, ...buyers];
        for (let i = 0; i < buyers.length; i++) {
          // loop matches the loop in populateVoucherContract
          for (let j = i; j < buyers.length; j++) {
            const offer = preUpgradeEntities.offers[i + j].offer;
            const sellerId = BigInt(offer.creatorId).toString();

            // Find the voucher data for the seller
            const voucherData = voucherContractStateAfterUpgradeAndActions.find(
              (vd) => vd.sellerId.toString() == sellerId
            );

            const buyerWallet = buyers[j].wallet;
            const buyerIndex = entities.findIndex((e) => e.wallet == buyerWallet);

            // Update the balance of the buyer
            voucherData.balanceOf[buyerIndex] = voucherData.balanceOf[buyerIndex] - 1n;
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
  };
  return genericContextFunction;
}

exports.getGenericContext = getGenericContext;
