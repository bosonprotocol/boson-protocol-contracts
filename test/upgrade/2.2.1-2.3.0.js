const hre = require("hardhat");
const ethers = hre.ethers;
const { assert, expect } = require("chai");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const SellerUpdateFields = require("../../scripts/domain/SellerUpdateFields");
const DisputeResolverUpdateFields = require("../../scripts/domain/DisputeResolverUpdateFields");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const Role = require("../../scripts/domain/Role");
const AuthToken = require("../../scripts/domain/AuthToken");
const AuthTokenType = require("../../scripts/domain/AuthTokenType");
const Bundle = require("../../scripts/domain/Bundle");
const ExchangeState = require("../../scripts/domain/ExchangeState");
const Group = require("../../scripts/domain/Group");
const TokenType = require("../../scripts/domain/TokenType.js");
const EvaluationMethod = require("../../scripts/domain/EvaluationMethod");

const { getStateModifyingFunctionsHashes } = require("../../scripts/util/diamond-utils.js");
const {
  mockSeller,
  mockAuthToken,
  mockVoucherInitValues,
  mockDisputeResolver,
  mockOffer,
  mockTwin,
  mockCondition,
} = require("../util/mock");
const { getSnapshot, revertToSnapshot, setNextBlockTimestamp, getEvent } = require("../util/utils");

const { deploySuite, populateProtocolContract, getProtocolContractState, revertState } = require("../util/upgrade");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const { getGenericContext } = require("./01_generic");
const { oneWeek, oneMonth } = require("../util/constants");

const version = "2.3.0";
const { migrate } = require(`../../scripts/migrations/migrate_${version}.js`);

/**
 *  Upgrade test case - After upgrade from 2.2.1 to 2.3.0 everything is still operational
 */
describe("[@skip-on-coverage] After facet upgrade, everything is still operational", function () {
  // Common vars
  let deployer, rando, clerk, pauser, assistant;
  let accessController;
  let accountHandler,
    fundsHandler,
    pauseHandler,
    configHandler,
    offerHandler,
    bundleHandler,
    exchangeHandler,
    twinHandler,
    disputeHandler,
    groupHandler;
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
      [deployer, rando, clerk, pauser, assistant] = await ethers.getSigners();

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

      ({ bundleHandler, fundsHandler, exchangeHandler, twinHandler, disputeHandler } = contractsBefore);

      const getFunctionHashesClosure = getStateModifyingFunctionsHashes(
        ["ConfigHandlerFacet", "PauseHandlerFacet", "GroupHandlerFacet"],
        undefined,
        ["setMinResolutionPeriod", "unpause", "createGroup"] //ToDo: revise
      );

      removedFunctionHashes = await getFunctionHashesClosure();

      await migrate("upgrade-test");

      // Cast to updated interface
      let newHandlers = {
        accountHandler: "IBosonAccountHandler",
        pauseHandler: "IBosonPauseHandler",
        configHandler: "IBosonConfigHandler",
        offerHandler: "IBosonOfferHandler",
        groupHandler: "IBosonGroupHandler",
      };

      contractsAfter = { ...contractsBefore };

      for (const [handlerName, interfaceName] of Object.entries(newHandlers)) {
        contractsAfter[handlerName] = await ethers.getContractAt(interfaceName, protocolDiamondAddress);
      }

      ({ accountHandler, pauseHandler, configHandler, offerHandler, groupHandler } = contractsAfter);

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
        it("Cannot make an offer with too short resolution period", async function () {
          const { sellers, DRs } = preUpgradeEntities;
          const { wallet } = sellers[0];

          // Set dispute duration period to 0
          const { offer, offerDates, offerDurations } = await mockOffer();
          offerDurations.resolutionPeriod = ethers.BigNumber.from(oneWeek).sub(10).toString();

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(wallet).createOffer(offer, offerDates, offerDurations, DRs[0].id, "0")
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

      context("ExchangeHandler", async function () {
        context("Twin transfers", async function () {
          let mockTwin721Contract, twin721;
          let buyer, buyerId;
          let exchangeId;
          let seller;

          beforeEach(async function () {
            const {
              bundles: [bundle],
              buyers,
              twins,
              offers,
              sellers,
            } = preUpgradeEntities;
            const {
              sellerId,
              offerIds: [offerId],
              twinIds,
            } = bundle;
            seller = sellers.find((s) => s.id == sellerId);
            ({ wallet: buyer, id: buyerId } = buyers[0]);
            const twin721id = twinIds[0]; // bundle has 3 twins, we want the first one (ERC721)
            twin721 = twins[twin721id - 1];
            const {
              offer: { exchangeToken, price: offerPrice },
            } = offers[offerId - 1];

            const { mockTwinTokens, mockToken } = mockContracts;
            mockTwin721Contract = mockTwinTokens.find((twinContract) => twinContract.address == twin721.address);

            exchangeId = (await exchangeHandler.getNextExchangeId()).toNumber();
            let msgValue;
            if (exchangeToken == ethers.constants.AddressZero) {
              msgValue = offerPrice;
            } else {
              // approve token transfer
              msgValue = 0;
              await mockToken.connect(buyer).approve(protocolDiamondAddress, offerPrice);
              await mockToken.mint(buyer.address, offerPrice);
            }
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: msgValue });
          });

          it("If a twin is transferred it could be used in a new twin", async function () {
            const tx = await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);
            const event = getEvent(await tx.wait(), exchangeHandler, "TwinTransferred");
            const { tokenId } = event;
            const { wallet: sellerWallet } = seller;

            // transfer the twin to the original seller
            await mockTwin721Contract.connect(buyer).safeTransferFrom(buyer.address, sellerWallet.address, tokenId);

            // create a new twin with the transferred token
            twin721.id = tokenId;
            twin721.supplyAvailable = 1;
            await expect(twinHandler.connect(sellerWallet).createTwin(twin721)).to.emit(twinHandler, "TwinCreated");
          });

          it("if twin transfer fail, dispute is raised even when buyer is EOA", async function () {
            // Remove the approval for the protocol to transfer the seller's tokens
            await mockTwin721Contract.connect(assistant).setApprovalForAll(protocolDiamondAddress, false);

            const tx = await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

            await expect(tx)
              .to.emit(disputeHandler, "DisputeRaised")
              .withArgs(exchangeId, buyerId, seller.id, buyer.address);

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(twin721.id, twin721.tokenAddress, exchangeId, anyValue, twin721.amount, buyer.address);

            // Get the exchange state
            const [, response] = await exchangeHandler.connect(rando).getExchangeState(exchangeId);

            // It should match ExchangeState.Disputed
            assert.equal(response, ExchangeState.Disputed, "Exchange state is incorrect");
          });

          it("if twin transfers consume all available gas, redeem still succeeds, but exchange is revoked", async function () {
            const { sellers, offers, buyers } = preUpgradeEntities;
            const {
              wallet,
              id: sellerId,
              offerIds: [offerId],
            } = sellers[0];
            const {
              offer: { price },
            } = offers[offerId - 1];
            const { wallet: buyer } = buyers[0];

            const [foreign20gt, foreign20gt_2] = await deployMockTokens(["Foreign20GasTheft", "Foreign20GasTheft"]);

            // Approve the protocol diamond to transfer seller's tokens
            await foreign20gt.connect(wallet).approve(protocolDiamondAddress, "100");
            await foreign20gt_2.connect(wallet).approve(protocolDiamondAddress, "100");

            // Create two ERC20 twins that will consume all available gas
            const twin20 = mockTwin(foreign20gt.address);
            twin20.amount = "1";
            twin20.supplyAvailable = "100";
            twin20.id = "1";

            await twinHandler.connect(wallet).createTwin(twin20.toStruct());

            const twin20_2 = twin20.clone();
            twin20_2.id = "5";
            twin20_2.tokenAddress = foreign20gt_2.address;
            await twinHandler.connect(wallet).createTwin(twin20_2.toStruct());

            // Create a new bundle
            const bundle = new Bundle("2", sellerId, [offerId], [twin20.id, twin20_2.id]);
            await bundleHandler.connect(wallet).createBundle(bundle.toStruct());

            // Commit to offer
            const exchangeId = await exchangeHandler.getNextExchangeId();
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

            // Redeem the voucher
            const tx = await exchangeHandler.connect(buyer).redeemVoucher(exchangeId, { gasLimit: 1000000 }); // limit gas to speed up test

            // Voucher should be revoked and both transfers should fail
            await expect(tx).to.emit(exchangeHandler, "VoucherRevoked").withArgs(offerId, exchangeId, buyer.address);

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(twin20.id, twin20.tokenAddress, exchangeId, twin20.tokenId, twin20.amount, buyer.address);

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(
                twin20_2.id,
                twin20_2.tokenAddress,
                exchangeId,
                twin20_2.tokenId,
                twin20_2.amount,
                buyer.address
              );

            // Get the exchange state
            const [, response] = await exchangeHandler.connect(rando).getExchangeState(exchangeId);

            // It should match ExchangeState.Revoked
            assert.equal(response, ExchangeState.Revoked, "Exchange state is incorrect");
          });
        });

        it("commit exactly at offer expiration timestamp", async function () {
          const { offers, buyers } = preUpgradeEntities;
          const { offer, offerDates } = offers[0];
          const { wallet: buyer } = buyers[0];

          await setNextBlockTimestamp(Number(offerDates.validUntil));

          // Commit to offer, retrieving the event
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(buyer.address, offer.id, { value: offer.price })
          ).to.emit(exchangeHandler, "BuyerCommitted");
        });

        it("old gated offers work ok with new token gating", async function () {
          const { groups, buyers, offers } = preUpgradeEntities;
          const { wallet: buyer } = buyers[0];
          const { offerIds } = groups[0];
          const offer = offers[offerIds[0]];

          // Commit to offer, retrieving the event
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(buyer.address, offer.id, { value: offer.price })
          ).to.emit(exchangeHandler, "BuyerCommitted");
        });
      });

      context("GroupHandler", async function () {
        it("it's possible to create a group with new token gating", async function () {
          const [conditionToken1155] = await deployMockTokens(["Foreign1155"]);
          // create a condition that was not possible before
          const condition = mockCondition({
            tokenType: TokenType.MultiToken,
            tokenAddress: conditionToken1155.address,
            length: "10",
            tokenId: "5",
            method: EvaluationMethod.SpecificToken,
            threshold: "2",
          });

          const seller = preUpgradeEntities.sellers[1]; // seller does not have any group
          const group = new Group(1, seller.seller.id, seller.offerIds); // group all seller's offers

          await expect(groupHandler.connect(assistant).createGroup(group, condition)).to.emit(
            groupHandler,
            "GroupCreated"
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
