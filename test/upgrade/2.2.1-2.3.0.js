const hre = require("hardhat");
// const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const ethers = hre.ethers;
const { getSnapshot, revertToSnapshot } = require("../util/utils");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const SellerUpdateFields = require("../../scripts/domain/SellerUpdateFields");
const DisputeResolverUpdateFields = require("../../scripts/domain/DisputeResolverUpdateFields");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const Role = require("../../scripts/domain/Role");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const AuthToken = require("../../scripts/domain/AuthToken");
const AuthTokenType = require("../../scripts/domain/AuthTokenType");

const { getStateModifyingFunctionsHashes } = require("../../scripts/util/diamond-utils.js");
const { assert, expect } = require("chai");
const { mockSeller, mockAuthToken, mockVoucherInitValues, mockDisputeResolver, mockOffer } = require("../util/mock");

const { deploySuite, populateProtocolContract, getProtocolContractState, revertState } = require("../util/upgrade");
const { getGenericContext } = require("./01_generic");
const { oneWeek, oneMonth } = require("../util/constants");

const version = "2.3.0";
const { migrate } = require(`../../scripts/migrations/migrate_${version}.js`);

/**
 *  Upgrade test case - After upgrade from 2.2.1 to 2.3.0 everything is still operational
 */
describe("[@skip-on-coverage] After facet upgrade, everything is still operational", function () {
  // Common vars
  let deployer, rando, clerk, pauser, assistant, assistantDR;
  let accessController;
  let accountHandler, fundsHandler, pauseHandler, configHandler, offerHandler;
  let snapshot;
  let protocolDiamondAddress, mockContracts;
  let contractsAfter;
  let protocolContractStateBefore, protocolContractStateAfter;
  let removedFunctionHashes, addedFunctionHashes;

  // reference protocol state
  let preUpgradeEntities;

  before(async function () {
    try {
      // Make accounts available
      [deployer, rando, clerk, pauser, assistant, assistantDR] = await ethers.getSigners();

      let contractsBefore;

      ({
        protocolDiamondAddress,
        protocolContracts: contractsBefore,
        mockContracts,
        accessController,
      } = await deploySuite(deployer, version));

      // Populate protocol with data
      preUpgradeEntities = await populateProtocolContract(
        deployer,
        protocolDiamondAddress,
        contractsBefore,
        mockContracts,
        true
      );

      // Start a seller update (finished in tests)
      accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamondAddress);
      const { sellers } = preUpgradeEntities;
      let { wallet, id, seller, authToken } = sellers[0];
      seller.clerk = rando.address;
      await accountHandler.connect(wallet).updateSeller(seller, authToken);

      ({ wallet, id, seller, authToken } = sellers[1]);
      seller.clerk = rando.address;
      seller.assistant = rando.address;
      await accountHandler.connect(wallet).updateSeller(seller, authToken);

      ({ wallet, id, seller, authToken } = sellers[2]);
      seller.clerk = clerk.address;
      await accountHandler.connect(wallet).updateSeller(seller, authToken);
      await accountHandler.connect(clerk).optInToSellerUpdate(id, [SellerUpdateFields.Clerk]);

      const { DRs } = preUpgradeEntities;
      let disputeResolver;
      ({ wallet, disputeResolver } = DRs[0]);
      disputeResolver.clerk = rando.address;
      await accountHandler.connect(wallet).updateDisputeResolver(disputeResolver);

      ({ wallet, disputeResolver } = DRs[1]);
      disputeResolver.clerk = rando.address;
      disputeResolver.assistant = rando.address;
      await accountHandler.connect(wallet).updateDisputeResolver(disputeResolver);

      // Get current protocol state, which serves as the reference
      // We assume that this state is a true one, relying on our unit and integration tests
      protocolContractStateBefore = await getProtocolContractState(
        protocolDiamondAddress,
        contractsBefore,
        mockContracts,
        preUpgradeEntities,
        true
      );

      ({ fundsHandler } = contractsBefore);

      // ({ accountContractState } = protocolContractStateBefore);

      const getFunctionHashesClosure = getStateModifyingFunctionsHashes(
        ["ConfigHandlerFacet", "PauseHandlerFacet"],
        undefined,
        ["setMinResolutionPeriod", "unpause"]
      );

      removedFunctionHashes = await getFunctionHashesClosure();

      await migrate("upgrade-test");

      // Cast to updated interface
      let newHandlers = {
        accountHandler: "IBosonAccountHandler",
        pauseHandler: "IBosonPauseHandler",
        configHandler: "IBosonConfigHandler",
        offerHandler: "IBosonOfferHandler",
      };

      contractsAfter = { ...contractsBefore };

      for (const [handlerName, interfaceName] of Object.entries(newHandlers)) {
        contractsAfter[handlerName] = await ethers.getContractAt(interfaceName, protocolDiamondAddress);
      }

      ({ accountHandler, pauseHandler, configHandler, offerHandler } = contractsAfter);

      addedFunctionHashes = await getFunctionHashesClosure();

      snapshot = await getSnapshot();

      const includeTests = [
        // "accountContractState", // Clerk deprecated
        "offerContractState",
        "exchangeContractState",
        "bundleContractState",
        // "configContractState", // minResolutionPeriod changed
        "disputeContractState",
        "fundsContractState",
        "groupContractState",
        "twinContractState",
        // "metaTxPrivateContractState", // isAllowlisted changed
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

      context("SellerHandler", async function () {
        let seller, emptyAuthToken, voucherInitValues;

        beforeEach(async function () {
          seller = mockSeller(rando.address, rando.address, rando.address, rando.address);
          emptyAuthToken = mockAuthToken();
          voucherInitValues = mockVoucherInitValues();
        });

        it("Cannot create a new seller with non zero clerk", async function () {
          // Attempt to create a seller with clerk not 0
          await expect(
            accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues)
          ).to.revertedWith(RevertReasons.CLERK_DEPRECATED);
        });

        context("Deprecate clerk", async function () {
          it("Cannot update a seller to non zero clerk", async function () {
            seller.clerk = ethers.constants.AddressZero;
            await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);

            // Attempt to update a seller, expecting revert
            seller.clerk = rando.address;
            await expect(accountHandler.connect(rando).updateSeller(seller, emptyAuthToken)).to.revertedWith(
              RevertReasons.CLERK_DEPRECATED
            );
          });

          it("Cannot opt-in to non zero clerk  [no other pending update]", async function () {
            const { sellers } = preUpgradeEntities;
            const { id } = sellers[0];

            // Attempt to update a seller, expecting revert
            await expect(
              accountHandler.connect(rando).optInToSellerUpdate(id, [SellerUpdateFields.Clerk])
            ).to.revertedWith(RevertReasons.NO_PENDING_UPDATE_FOR_ACCOUNT);
          });

          it("Cannot opt-in to non zero clerk [other pending updates]", async function () {
            const { sellers } = preUpgradeEntities;
            const { id } = sellers[1];

            // Attempt to update a seller, expecting revert
            await expect(
              accountHandler.connect(rando).optInToSellerUpdate(id, [SellerUpdateFields.Clerk])
            ).to.revertedWith(RevertReasons.CLERK_DEPRECATED);
          });

          it("It's possible to create a new account that uses the same address as some old clerk address", async function () {
            // "clerk" was used as a clerk address for seller[2] before the upgrade
            seller = mockSeller(clerk.address, clerk.address, ethers.constants.AddressZero, clerk.address);
            await expect(accountHandler.connect(clerk).createSeller(seller, emptyAuthToken, voucherInitValues)).to.emit(
              accountHandler,
              "SellerCreated"
            );
          });

          it("It's possible to withdraw funds with assistant address", async function () {
            const { sellers } = preUpgradeEntities;
            const { wallet, id } = sellers[2]; // seller 2 assistant was different from clerk

            // Withdraw funds
            await expect(fundsHandler.connect(wallet).withdrawFunds(id, [], [])).to.emit(
              fundsHandler,
              "FundsWithdrawn"
            );
          });
        });

        context("Clear pending updates", async function () {
          let pendingSellerUpdate, authToken;
          beforeEach(async function () {
            authToken = new AuthToken("8400", AuthTokenType.Lens);

            pendingSellerUpdate = mockSeller(
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
              false
            );
            pendingSellerUpdate.id = "0";
          });

          it("should clean pending addresses update when calling updateSeller again", async function () {
            // create a seller with auth token
            seller.admin = ethers.constants.AddressZero;
            authToken = new AuthToken("8400", AuthTokenType.Lens);
            await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);

            // Start replacing auth token with admin address, but don't complete it
            seller.admin = pendingSellerUpdate.admin = assistant.address;
            await expect(accountHandler.connect(assistant).updateSeller(seller, emptyAuthToken))
              .to.emit(accountHandler, "SellerUpdatePending")
              .withArgs(seller.id, pendingSellerUpdate.toStruct(), emptyAuthToken.toStruct(), assistant.address);

            // Replace admin address with auth token
            seller.admin = pendingSellerUpdate.admin = ethers.constants.AddressZero;
            authToken.tokenId = "123";

            // Calling updateSeller again, request to replace admin with an auth token
            await expect(accountHandler.connect(assistant).updateSeller(seller, authToken))
              .to.emit(accountHandler, "SellerUpdatePending")
              .withArgs(seller.id, pendingSellerUpdate.toStruct(), authToken.toStruct(), assistant.address);
          });

          it("should clean pending auth token update when calling updateSeller again", async function () {
            await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);

            // Start replacing admin address with auth token, but don't complete it
            seller.admin = ethers.constants.AddressZero;
            authToken = new AuthToken("8400", AuthTokenType.Lens);
            await expect(accountHandler.connect(assistant).updateSeller(seller, authToken))
              .to.emit(accountHandler, "SellerUpdatePending")
              .withArgs(seller.id, pendingSellerUpdate.toStruct(), authToken.toStruct(), assistant.address);

            // Replace auth token with admin address
            seller.admin = pendingSellerUpdate.admin = rando.address;

            // Calling updateSeller for the second time, request to replace auth token with admin
            await expect(accountHandler.connect(assistant).updateSeller(seller, emptyAuthToken))
              .to.emit(accountHandler, "SellerUpdatePending")
              .withArgs(seller.id, pendingSellerUpdate.toStruct(), emptyAuthToken.toStruct(), assistant.address);
          });
        });
      });

      context("DisputeResolverHandler", async function () {
        let disputeResolver, disputeResolverFees, sellerAllowList;

        beforeEach(async function () {
          disputeResolver = mockDisputeResolver(rando.address, rando.address, rando.address, rando.address);
          disputeResolverFees = [];
          sellerAllowList = [];
        });

        it("Cannot create a new DR with non zero clerk", async function () {
          // Attempt to create a DR with clerk not 0
          await expect(
            accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList)
          ).to.revertedWith(RevertReasons.CLERK_DEPRECATED);
        });

        it("Cannot update a DR to non zero clerk", async function () {
          disputeResolver.clerk = ethers.constants.AddressZero;
          await accountHandler
            .connect(rando)
            .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

          // Attempt to update a DR, expecting revert
          disputeResolver.clerk = rando.address;
          await expect(accountHandler.connect(rando).updateDisputeResolver(disputeResolver)).to.revertedWith(
            RevertReasons.CLERK_DEPRECATED
          );
        });

        it("Cannot opt-in to non zero clerk [no other pending update]", async function () {
          const { DRs } = preUpgradeEntities;
          const { id } = DRs[0];

          // Attempt to update a DR, expecting revert
          await expect(
            accountHandler.connect(rando).optInToDisputeResolverUpdate(id, [DisputeResolverUpdateFields.Clerk])
          ).to.revertedWith(RevertReasons.NO_PENDING_UPDATE_FOR_ACCOUNT);
        });

        it("Cannot opt-in to non zero clerk [other pending updates]", async function () {
          const { DRs } = preUpgradeEntities;
          const { id } = DRs[1];

          // Attempt to update a DR, expecting revert
          await expect(
            accountHandler.connect(rando).optInToDisputeResolverUpdate(id, [DisputeResolverUpdateFields.Clerk])
          ).to.revertedWith(RevertReasons.CLERK_DEPRECATED);
        });

        it("It's possible to create a new account that uses the same address as some old clerk address", async function () {
          // "clerk" was used as a clerk address for DR[2] before the upgrade
          disputeResolver = mockDisputeResolver(
            clerk.address,
            clerk.address,
            ethers.constants.AddressZero,
            clerk.address
          );
          await expect(
            accountHandler.connect(clerk).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList)
          ).to.emit(accountHandler, "DisputeResolverCreated");
        });
      });

      context("PauseHandler", async function () {
        it("should emit a ProtocolUnpaused event", async function () {
          // Grant PAUSER role to pauser account
          await accessController.grantRole(Role.PAUSER, pauser.address);

          const regions = [PausableRegion.Sellers, PausableRegion.DisputeResolvers];

          // Pause protocol
          await pauseHandler.connect(pauser).pause(regions);

          // Unpause the protocol, testing for the event
          await expect(pauseHandler.connect(pauser).unpause(regions))
            .to.emit(pauseHandler, "ProtocolUnpaused")
            .withArgs(regions, pauser.address);
        });
      });

      context("ConfigHandler", async function () {
        it("After the upgrade, minimal resolution period is set", async function () {
          // Minimal resolution period should be set to 1 week
          const minResolutionPeriod = await configHandler.connect(rando).getMinResolutionPeriod();
          expect(minResolutionPeriod).to.equal(oneWeek);
        });

        it("It is possible to change minimal resolution period", async function () {
          const minResolutionPeriod = oneMonth;
          // Set new resolution period
          await expect(configHandler.connect(deployer).setMinResolutionPeriod(minResolutionPeriod))
            .to.emit(configHandler, "MinResolutionPeriodChanged")
            .withArgs(minResolutionPeriod, deployer.address);

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getMinResolutionPeriod()).to.equal(minResolutionPeriod);
        });
      });

      context("OfferHandler", async function () {
        let offer, offerDates, offerDurations, disputeResolver, agentId;

        beforeEach(async function () {
          // Create a seller
          const seller = mockSeller(
            assistant.address,
            assistant.address,
            ethers.constants.AddressZero,
            assistant.address
          );
          const voucherInitValues = mockVoucherInitValues();
          const emptyAuthToken = mockAuthToken();
          await accountHandler.connect(assistant).createSeller(seller, emptyAuthToken, voucherInitValues);

          // Create a valid resolver
          disputeResolver = mockDisputeResolver(
            assistantDR.address,
            assistantDR.address,
            ethers.constants.AddressZero,
            assistantDR.address,
            true
          );
          const disputeResolverFees = [new DisputeResolverFee(ethers.constants.AddressZero, "Native", "0")];
          await accountHandler.connect(assistantDR).createDisputeResolver(disputeResolver, disputeResolverFees, []);

          // Mock offer
          ({ offer, offerDates, offerDurations } = await mockOffer());
        });

        it("Cannot make an offer with too short resolution period", async function () {
          // Set dispute duration period to 0
          offerDurations.resolutionPeriod = ethers.BigNumber.from(oneWeek).sub(10).toString();

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(assistant).createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId)
          ).to.revertedWith(RevertReasons.INVALID_RESOLUTION_PERIOD);
        });

        it("State of configContractState is not affected apart from minResolutionPeriod", async function () {
          // make a shallow copy to not modify original protocolContractState as it's used on getGenericContext
          const configContractStateBefore = { ...protocolContractStateBefore.configContractState };
          const configContractStateAfter = { ...protocolContractStateAfter.configContractState };

          const { minResolutionPeriod: minResolutionPeriodBefore } = configContractStateBefore;
          const { minResolutionPeriod: minResolutionPeriodAfter } = configContractStateAfter;

          delete configContractStateBefore.minResolutionPeriod;
          delete configContractStateAfter.minResolutionPeriod;

          expect(minResolutionPeriodAfter).to.deep.equal(minResolutionPeriodBefore);
          expect(protocolContractStateAfter.configContractState).to.deep.equal(
            protocolContractStateBefore.configContractState
          );
        });
      });

      context("MetaTransactionHandler", async function () {
        it("Function hashes from removedFunctionsHashes list should not be allowlisted", async function () {
          for (const hash of removedFunctionHashes) {
            const [isAllowed] = await contractsAfter.metaTransactionsHandler.functions[
              "isFunctionAllowlisted(bytes32)"
            ](hash);
            expect(isAllowed).to.be.false;
          }
        });

        it("Function hashes from from addedFunctionsHashes list should be allowlisted", async function () {
          for (const hash of addedFunctionHashes) {
            const [isAllowed] = await contractsAfter.metaTransactionsHandler.functions[
              "isFunctionAllowlisted(bytes32)"
            ](hash);
            expect(isAllowed).to.be.true;
          }
        });

        it("State of metaTxPrivateContractState is not affected apart from isAllowlistedState mapping", async function () {
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
