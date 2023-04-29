const hre = require("hardhat");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const ethers = hre.ethers;
const { getSnapshot, revertToSnapshot } = require("../util/utils");
const { assert, expect } = require("chai");
const DisputeResolver = require("../../scripts/domain/DisputeResolver");
const Seller = require("../../scripts/domain/Seller");
const { calculateContractAddress } = require("../util/utils.js");
const { mockSeller, mockAuthToken, mockVoucherInitValues } = require("../util/mock");

const {
  deploySuite,
  upgradeSuite,
  upgradeClients,
  populateProtocolContract,
  getProtocolContractState,
  revertState,
} = require("../util/upgrade");
const { getGenericContext } = require("./01_generic");

const version = "2.2.1";

/**
 *  Upgrade test case - After upgrade from 2.2.0 to 2.2.1 everything is still operational
 */
describe("[@skip-on-coverage] After facet upgrade, everything is still operational", function () {
  this.timeout(10000000);
  // Common vars
  let deployer, rando;
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
      const protocolContractState = await getProtocolContractState(
        protocolDiamondAddress,
        contractsBefore,
        mockContracts,
        preUpgradeEntities,
        true
      );

      ({ accountContractState } = protocolContractState);

      // upgrade clients
      await upgradeClients();

      // Upgrade protocol
      ({ accountHandler } = await upgradeSuite(protocolDiamondAddress, {
        accountHandler: "IBosonAccountHandler",
        orchestrationHandler: "IBosonOrchestrationHandler",
      }));

      snapshot = await getSnapshot();

      // Get new account handler contract
      const contractsAfter = {
        ...contractsBefore,
        accountHandler,
      };

      // This context is placed in an uncommon place due to order of test execution.
      // Generic context needs values that are set in "before", however "before" is executed before tests, not before suites
      // and those values are undefined if this is placed outside "before".
      // Normally, this would be solved with mocha's --delay option, but it.skip does not behave as expected when running with hardhat.
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
          version
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

  // Test actions that worked in previous version, but should not work anymore, or work differently
  // Test methods that were added to see that upgrade was succesful
  context("📋 Breaking changes, new methods and bug fixes", async function () {
    context("Breaking changes", async function () {
      context("DisputeResolverHandlerFacet", async function () {
        it.skip("updateDisputeResolver reverts if no update field has been updated or requested to be updated", async function () {
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
        it.skip("updateSeller reverts if no update field has been updated or requested to be updated", async function () {
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

        it.skip("Old seller can update and add metadataUri field", async function () {
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

        it.skip("New seller has metadataUri field", async function () {
          const { nextAccountId } = accountContractState;
          const seller = mockSeller(rando.address, rando.address, rando.address, rando.address, true, "metadata");
          const authToken = mockAuthToken();
          const voucherInitValues = mockVoucherInitValues();

          const tx = await accountHandler.connect(rando).createSeller(seller, authToken, voucherInitValues);
          expect(tx)
            .to.emit("SellerCreated")
            .withArgs(
              nextAccountId,
              seller,
              calculateContractAddress(accountHandler.address, nextAccountId),
              authToken,
              rando.address
            );
        });
      });
    });
  });
});
