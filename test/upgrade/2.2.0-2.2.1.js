const hre = require("hardhat");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const ethers = hre.ethers;
const { assert, expect } = require("chai");
const DisputeResolver = require("../../scripts/domain/DisputeResolver");
const {
  deploySuite,
  upgradeSuite,
  upgradeClients,
  populateProtocolContract,
  getProtocolContractState,
  revertState,
} = require("../util/upgrade");
const { getGenericContext } = require("./01_generic");

const oldVersion = "v2.2.0";
const newVersion = "v2.2.1-rc.1";
//const v2_1_0_scripts = "v2.1.0-scripts";

/**
 *  Upgrade test case - After upgrade from 2.2.0 to 2.2.1 everything is still operational
 */
describe("[@skip-on-coverage] After facet upgrade, everything is still operational", function () {
  this.timeout(10000000);
  // Common vars
  let deployer;
  let accountHandler;
  let snapshot;
  let protocolDiamondAddress, mockContracts;

  // reference protocol state
  let accountContractState;
  let preUpgradeEntities;

  before(async function () {
    try {
      // Make accounts available
      [deployer, rando] = await ethers.getSigners();

      let contractsBefore;
      ({
        protocolDiamondAddress,
        protocolContracts: contractsBefore,
        mockContracts,
      } = await deploySuite(deployer, oldVersion));
      //      ({ twinHandler} = contractsBefore);

      // Populate protocol with data
      preUpgradeEntities = await populateProtocolContract(
        deployer,
        protocolDiamondAddress,
        contractsBefore,
        mockContracts,
        oldVersion
      );

      // Get current protocol state, which serves as the reference
      // We assume that this state is a true one, relying on our unit and integration tests
      const protocolContractState = await getProtocolContractState(
        protocolDiamondAddress,
        contractsBefore,
        mockContracts,
        preUpgradeEntities,
        oldVersion
      );

      ({ accountContractState } = protocolContractState);

      // upgrade clients
      await upgradeClients(newVersion);

      // Upgrade protocol
      ({ accountHandler } = await upgradeSuite(newVersion, protocolDiamondAddress, {
        accountHandler: "IBosonAccountHandler",
        orchestrationHandler: "IBosonOrchestrationHandler",
      }));

      snapshot = await ethers.provider.send("evm_snapshot", []);

      // Get new account handler contract
      const contractsAfter = {
        ...contractsBefore,
        accountHandler,
      };

      // This context is placed in an uncommon place due to order of test execution.
      // Generic context needs values that are set in "before", however "before" is executed before tests, not before suites
      // and those values are undefined if this is placed outside "before".
      // Normally, this would be solved with mocha's --delay option, but it does not behave as expected when running with hardhat.
      context(
        "Generic tests",
        getGenericContext(
          deployer,
          protocolDiamondAddress,
          contractsBefore,
          contractsAfter,
          mockContracts,
          protocolContractState,
          preUpgradeEntities,
          snapshot,
          newVersion
        )
      );
      //
    } catch (err) {
      // revert to latest version of scripts and contracts
      revertState();
      // stop execution
      assert(false, `Before all reverts with: ${err}`);
    }
  });

  afterEach(async function () {
    // Revert to state right after the upgrade.
    // This is used so the lengthly setup (deploy+upgrade) is done only once.
    await ethers.provider.send("evm_revert", [snapshot]);
    snapshot = await ethers.provider.send("evm_snapshot", []);
  });

  after(async function () {
    revertState();
  });

  // Test actions that worked in previous version, but should not work anymore, or work differently
  // Test methods that were added to see that upgrade was succesful
  context("📋 Breaking changes, new methods and bug fixes", async function () {
    context("Breaking changes", async function () {
      context("DisputeResolverHandler", async function () {
        it("function updateDisputeResolver reverts if no update field has been updated or requested to be updated", async function () {
          // Get next account id
          const { DRs } = preUpgradeEntities;
          const { wallet, id, disputeResolver } = DRs[0];

          // Try to update with same values, should revert
          await expect(accountHandler.connect(wallet).updateDisputeResolver(disputeResolver)).to.be.revertedWith(
            RevertReasons.NO_UPDATE_APPLIED
          );

          // Validate if DR data is still the same
          let [, disputeResolverAfter] = await accountHandler.getDisputeResolver(id);
          disputeResolverAfter = DisputeResolver.fromStruct(disputeResolverAfter);
          expect(disputeResolverAfter).to.deep.equal(disputeResolver);
        });
      });
    });
  });
});
