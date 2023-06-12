const hre = require("hardhat");
// const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const ethers = hre.ethers;
const { getSnapshot, revertToSnapshot } = require("../util/utils");

// const { getStateModifyingFunctionsHashes } = require("../../scripts/util/diamond-utils.js");
const { assert, expect } = require("chai");

const { deploySuite, populateProtocolContract, getProtocolContractState, revertState } = require("../util/upgrade");
const { getGenericContext } = require("./01_generic");

const version = "2.3.0";
const { migrate } = require(`../../scripts/migrations/migrate_${version}.js`);

/**
 *  Upgrade test case - After upgrade from 2.2.1 to 2.3.0 everything is still operational
 */
describe("[@skip-on-coverage] After facet upgrade, everything is still operational", function () {
  // Common vars
  let deployer;
  let snapshot;
  let protocolDiamondAddress, mockContracts;
  let contractsAfter;
  let protocolContractStateBefore, protocolContractStateAfter;
  // let removedFunctionHashes, addedFunctionHashes;

  // reference protocol state
  let preUpgradeEntities;

  before(async function () {
    try {
      // Make accounts available
      [deployer] = await ethers.getSigners();

      let contractsBefore;

      ({
        protocolDiamondAddress,
        protocolContracts: contractsBefore,
        mockContracts,
      } = await deploySuite(deployer, version));

      // Populate protocol with data
      preUpgradeEntities = await populateProtocolContract(
        deployer,
        protocolDiamondAddress,
        contractsBefore,
        mockContracts,
        true
      );

      // Get current protocol state, which serves as the reference
      // We assume that this state is a true one, relying on our unit and integration tests
      protocolContractStateBefore = await getProtocolContractState(
        protocolDiamondAddress,
        contractsBefore,
        mockContracts,
        preUpgradeEntities,
        true
      );

      // ({ accountContractState } = protocolContractStateBefore);

      // const getFunctionHashesClosure = getStateModifyingFunctionsHashes(
      //   ["SellerHandlerFacet", "OrchestrationHandlerFacet1"],
      //   undefined,
      //   ["createSeller", "updateSeller"]
      // );

      // removedFunctionHashes = await getFunctionHashesClosure();

      await migrate("upgrade-test");

      // Cast to updated interface
      let newHandlers = {
        accountHandler: "IBosonAccountHandler",
        orchestrationHandler: "IBosonOrchestrationHandler",
      };

      contractsAfter = { ...contractsBefore };

      for (const [handlerName, interfaceName] of Object.entries(newHandlers)) {
        contractsAfter[handlerName] = await ethers.getContractAt(interfaceName, protocolDiamondAddress);
      }

      // ({ accountHandler } = contractsAfter);

      // addedFunctionHashes = await getFunctionHashesClosure();

      snapshot = await getSnapshot();

      const includeTests = [
        // "accountContractState", // Clerk deprecated
        "offerContractState",
        "exchangeContractState",
        "bundleContractState",
        "configContractState",
        "disputeContractState",
        "fundsContractState",
        "groupContractState",
        "twinContractState",
        "metaTxPrivateContractState",
        "protocolStatusPrivateContractState",
        "protocolLookupsPrivateContractState",
      ];

      // Get protocol state after the upgrade
      protocolContractStateAfter = await getProtocolContractState(
        protocolDiamondAddress,
        contractsAfter,
        mockContracts,
        preUpgradeEntities
      );

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
          protocolContractStateBefore,
          protocolContractStateAfter,
          preUpgradeEntities,
          snapshot,
          includeTests
        )
      );
    } catch (err) {
      // revert to latest version of scripts and contracts
      revertState();
      // stop execution
      assert(false, `Before all reverts with: ${err}`);
    }
  });

  afterEach(async function () {
    // Revert to state right after the upgrade.
    // This is used so the lengthy setup (deploy+upgrade) is done only once.
    await revertToSnapshot(snapshot);
    snapshot = await getSnapshot();
  });

  after(async function () {
    revertState();
  });

  // To this test pass package.json version must be set
  it(`Protocol status version is updated to ${version}`, async function () {
    // Slice because of unicode escape notation
    expect((await contractsAfter.protocolInitializationHandler.getVersion()).replace(/\0/g, "")).to.equal(version);
  });

  // Test actions that worked in previous version, but should not work anymore, or work differently
  // Test methods that were added to see that upgrade was successful
  context("📋 Breaking changes, new methods and bug fixes", async function () {
    context("Breaking changes", async function () {
      context("accountContractState", async function () {
        it("Existing DR's clerk is changed to 0", async function () {
          // Lookup by id
          let stateBeforeWithoutClerk = protocolContractStateBefore.accountContractState.DRsState.map((dr) => ({
            ...dr,
            DR: { ...dr.DR, clerk: ethers.constants.AddressZero },
          }));

          // All DR's clerks should be 0
          assert.deepEqual(stateBeforeWithoutClerk, protocolContractStateAfter.accountContractState.DRsState);

          // Lookup by address
          stateBeforeWithoutClerk = protocolContractStateBefore.accountContractState.DRbyAddressState.map((dr) => ({
            ...dr,
            DR: { ...dr.DR, clerk: ethers.constants.AddressZero },
          }));

          // All DR's clerks should be 0
          assert.deepEqual(stateBeforeWithoutClerk, protocolContractStateAfter.accountContractState.DRbyAddressState);
        });

        it("Existing seller's clerk is changed to 0", async function () {
          // Lookup by id
          let stateBeforeWithoutClerk = protocolContractStateBefore.accountContractState.sellerState.map((s) => ({
            ...s,
            seller: { ...s.seller, clerk: ethers.constants.AddressZero },
          }));

          // All Seller's clerks should be 0
          assert.deepEqual(stateBeforeWithoutClerk, protocolContractStateAfter.accountContractState.sellerState);

          // Lookup by address
          stateBeforeWithoutClerk = protocolContractStateBefore.accountContractState.sellerByAddressState.map((s) => ({
            ...s,
            seller: { ...s.seller, clerk: ethers.constants.AddressZero },
          }));

          // All Seller's clerks should be 0
          assert.deepEqual(
            stateBeforeWithoutClerk,
            protocolContractStateAfter.accountContractState.sellerByAddressState
          );
        });

        it("Other account state should not be affected", async function () {
          // Agent's and buyer's state should be unaffected
          assert.deepEqual(
            protocolContractStateBefore.accountContractState.buyersState,
            protocolContractStateAfter.accountContractState.buyersState
          );
          assert.deepEqual(
            protocolContractStateBefore.accountContractState.agentsState,
            protocolContractStateAfter.accountContractState.agentsState
          );
        });
      });
    });
  });
});
