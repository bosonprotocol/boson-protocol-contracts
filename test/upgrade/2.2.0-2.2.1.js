const hre = require("hardhat");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { getSigners, getContractAt } = hre.ethers;

const { getSnapshot, revertToSnapshot } = require("../util/utils");

const { getStateModifyingFunctionsHashes } = require("../../scripts/util/diamond-utils.js");
const { assert, expect } = require("chai");
const DisputeResolver = require("../../scripts/domain/DisputeResolver");
const Seller = require("../../scripts/domain/Seller");
const { calculateContractAddress } = require("../util/utils.js");
const { mockSeller, mockAuthToken, mockVoucherInitValues } = require("../util/mock");
const { migrate } = require("../../scripts/migrations/migrate_2.2.1.js");

const { deploySuite, populateProtocolContract, getProtocolContractState, revertState } = require("../util/upgrade");
const { getGenericContext } = require("./01_generic");

const version = "2.2.1";

/**
 *  Upgrade test case - After upgrade from 2.2.0 to 2.2.1 everything is still operational
 */
describe("[@skip-on-coverage] After facet upgrade, everything is still operational", function () {
  // Common vars
  let deployer, rando;
  let accountHandler;
  let snapshot;
  let protocolDiamondAddress, mockContracts;
  let contractsAfter;
  let protocolContractStateBefore, protocolContractStateAfter;
  let removedFunctionHashes, addedFunctionHashes;

  // reference protocol state
  let accountContractState;
  let preUpgradeEntities;

  before(async function () {
    try {
      // Make accounts available
      [deployer, rando] = await getSigners();

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

      ({ accountContractState } = protocolContractStateBefore);

      const getFunctionHashesClosure = getStateModifyingFunctionsHashes(
        ["SellerHandlerFacet", "OrchestrationHandlerFacet1"],
        undefined,
        ["createSeller", "updateSeller"]
      );

      removedFunctionHashes = await getFunctionHashesClosure();

      await migrate("upgrade-test");

      // Cast to updated interface
      let newHandlers = {
        accountHandler: "IBosonAccountHandler",
        orchestrationHandler: "IBosonOrchestrationHandler",
      };

      contractsAfter = { ...contractsBefore };

      for (const [handlerName, interfaceName] of Object.entries(newHandlers)) {
        contractsAfter[handlerName] = await getContractAt(interfaceName, protocolDiamondAddress);
      }

      ({ accountHandler } = contractsAfter);

      addedFunctionHashes = await getFunctionHashesClosure();

      snapshot = await getSnapshot();

      const includeTests = [
        "accountContractState",
        "offerContractState",
        "exchangeContractState",
        "bundleContractState",
        "configContractState",
        "disputeContractState",
        "fundsContractState",
        "groupContractState",
        "twinContractState",
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
  // Test methods that were added to see that upgrade was succesful
  context("📋 Breaking changes, new methods and bug fixes", async function () {
    context("Breaking changes", async function () {
      context("DisputeResolverHandlerFacet", async function () {
        it("updateDisputeResolver reverts if no update field has been updated or requested to be updated", async function () {
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

      context("SellerHandlerFacet", async function () {
        it("updateSeller reverts if no update field has been updated or requested to be updated", async function () {
          const { sellers } = preUpgradeEntities;
          const { wallet, id, seller, authToken } = sellers[0];

          // Try to update with same values, should revert
          await expect(accountHandler.connect(wallet).updateSeller(seller, authToken)).to.be.revertedWith(
            RevertReasons.NO_UPDATE_APPLIED
          );

          // Validate if seller data is still the same
          let [, sellerAfter] = await accountHandler.getSeller(id);
          sellerAfter = Seller.fromStruct(sellerAfter);
          expect(sellerAfter).to.deep.equal(seller);
        });

        it("Old seller can update and add metadataUri field", async function () {
          const { sellers } = preUpgradeEntities;
          const { wallet, id, seller, authToken } = sellers[0];

          seller.metadataUri = "metadata";

          const tx = await accountHandler.connect(wallet).updateSeller(seller, authToken);
          expect(tx).to.emit("SellerUpdateApplied");

          // Validate if seller now has metadataUri
          let [, sellerAfter] = await accountHandler.getSeller(id);
          sellerAfter = DisputeResolver.fromStruct(sellerAfter);
          expect(sellerAfter.metadataUri).to.equal(seller.metadataUri);
        });

        it("New seller has metadataUri field", async function () {
          const { nextAccountId } = accountContractState;
          const seller = mockSeller(
            await rando.getAddress(),
            await rando.getAddress(),
            await rando.getAddress(),
            await rando.getAddress(),
            true,
            "metadata"
          );
          const authToken = mockAuthToken();
          const voucherInitValues = mockVoucherInitValues();

          const tx = await accountHandler.connect(rando).createSeller(seller, authToken, voucherInitValues);
          expect(tx)
            .to.emit("SellerCreated")
            .withArgs(
              nextAccountId,
              seller,
              calculateContractAddress(await accountHandler.getAddress(), nextAccountId),
              authToken,
              await rando.getAddress()
            );
        });
      });

      context("MetaTransactionHandlerfacet", async function () {
        it("Function hashes from removedFunctionsHashes list should not be allowlisted", async function () {
          for (const hash of removedFunctionHashes) {
            const [isAllowed] =
              await contractsAfter.metaTransactionsHandler.functions["isFunctionAllowlisted(bytes32)"](hash);
            expect(isAllowed).to.be.false;
          }
        });

        it("Function hashes from from addedFunctionsHashes list should be allowlisted", async function () {
          for (const hash of addedFunctionHashes) {
            const [isAllowed] =
              await contractsAfter.metaTransactionsHandler.functions["isFunctionAllowlisted(bytes32)"](hash);
            expect(isAllowed).to.be.true;
          }
        });

        it("State of metaTxPrivateContractState is not affected besides isAllowlistedState mapping", async function () {
          // make a shallow copy to not modify original protocolContractState as it's used on getGenericContext
          const metaTxPrivateContractStateBefore = { ...protocolContractStateBefore.metaTxPrivateContractState };
          const metaTxPrivateContractStateAfter = { ...protocolContractStateAfter.metaTxPrivateContractState };

          const { isAllowlistedState: isAllowlistedStateBefore } = metaTxPrivateContractStateBefore;
          removedFunctionHashes.forEach((hash) => {
            delete isAllowlistedStateBefore[hash];
          });

          const { isAllowlistedState: isAllowlistedStateAfter } = metaTxPrivateContractStateAfter;
          addedFunctionHashes.forEach((hash) => {
            delete isAllowlistedStateAfter[hash];
          });

          delete metaTxPrivateContractStateBefore.isAllowlistedState;
          delete metaTxPrivateContractStateAfter.isAllowlistedState;

          expect(isAllowlistedStateAfter).to.deep.equal(isAllowlistedStateBefore);
          expect(protocolContractStateAfter.metaTxPrivateContractState).to.deep.equal(
            protocolContractStateBefore.metaTxPrivateContractState
          );
        });
      });
    });
  });
});
