const shell = require("shelljs");
const hre = require("hardhat");
const ethers = hre.ethers;
const { ZeroAddress, parseEther, Wallet, provider, getContractFactory, getContractAt, encodeBytes32String } = ethers;
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
const { Collection, CollectionList } = require("../../scripts/domain/Collection");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");

const { FundsList } = require("../../scripts/domain/Funds");
const { getStateModifyingFunctionsHashes } = require("../../scripts/util/diamond-utils.js");
const { toHexString } = require("../../scripts/util/utils.js");
const {
  mockSeller,
  mockAuthToken,
  mockVoucherInitValues,
  mockDisputeResolver,
  mockOffer,
  mockTwin,
  mockCondition,
  accountId,
} = require("../util/mock");
const {
  getSnapshot,
  revertToSnapshot,
  setNextBlockTimestamp,
  getEvent,
  calculateCloneAddress,
  deriveTokenId,
  calculateBosonProxyAddress,
} = require("../util/utils");
const { limits: protocolLimits } = require("../../scripts/config/protocol-parameters.js");

const {
  deploySuite,
  populateProtocolContract,
  getProtocolContractState,
  revertState,
  getStorageLayout,
  getVoucherContractState,
  populateVoucherContract,
} = require("../util/upgrade");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const { getGenericContext } = require("./01_generic");
const { getGenericContext: getGenericContextVoucher } = require("./clients/01_generic");
const { oneWeek, oneMonth, VOUCHER_NAME, VOUCHER_SYMBOL } = require("../util/constants");
const GatingType = require("../../scripts/domain/GatingType.js");

const version = "2.3.0";
const { migrate } = require(`../../scripts/migrations/migrate_${version}.js`);

/**
 *  Upgrade test case - After upgrade from 2.2.1 to 2.3.0 everything is still operational
 */
describe("[@skip-on-coverage] After facet upgrade, everything is still operational", function () {
  this.timeout(1000000);
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
    groupHandler,
    orchestrationHandler;
  let snapshot;
  let protocolDiamondAddress, mockContracts;
  let contractsAfter;
  let protocolContractStateBefore, protocolContractStateAfter;
  let removedFunctionHashes, addedFunctionHashes;

  // reference protocol state
  let preUpgradeEntities;

  before(async function () {
    // temporary update config, so compiler outputs storage layout
    for (const compiler of hre.config.solidity.compilers) {
      if (compiler.settings.outputSelection["*"]["BosonVoucher"]) {
        compiler.settings.outputSelection["*"]["BosonVoucher"].push("storageLayout");
      } else {
        compiler.settings.outputSelection["*"]["BosonVoucher"] = ["storageLayout"];
      }
    }

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

      twinHandler = contractsBefore.twinHandler;
      delete contractsBefore.twinHandler;

      // Populate protocol with data
      preUpgradeEntities = await populateProtocolContract(
        deployer,
        protocolDiamondAddress,
        contractsBefore,
        mockContracts,
        true
      );

      // Add twin handler back
      contractsBefore.twinHandler = twinHandler;

      const preUpgradeStorageLayout = await getStorageLayout("BosonVoucher");
      const preUpgradeEntitiesVoucher = await populateVoucherContract(
        deployer,
        protocolDiamondAddress,
        contractsBefore,
        mockContracts,
        preUpgradeEntities,
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

      const voucherContractState = await getVoucherContractState(preUpgradeEntitiesVoucher);

      ({ bundleHandler, exchangeHandler, twinHandler, disputeHandler } = contractsBefore);

      let getFunctionHashesClosure = getStateModifyingFunctionsHashes(
        [
          "SellerHandlerFacet",
          "OfferHandlerFacet",
          "ConfigHandlerFacet",
          "PauseHandlerFacet",
          "GroupHandlerFacet",
          "OrchestrationHandlerFacet1",
        ],
        undefined,
        [
          "createSeller",
          "createOffer",
          "createPremintedOffer",
          "unpause",
          "createGroup",
          "setGroupCondition",
          "setMaxOffersPerBatch",
          "setMaxOffersPerGroup",
          "setMaxTwinsPerBundle",
          "setMaxOffersPerBundle",
          "setMaxTokensPerWithdrawal",
          "setMaxFeesPerDisputeResolver",
          "setMaxDisputesPerBatch",
          "setMaxAllowedSellers",
          "setMaxExchangesPerBatch",
          "setMaxPremintedVouchers",
        ]
      );

      removedFunctionHashes = await getFunctionHashesClosure();

      // prepare seller creators
      const { sellers } = preUpgradeEntities;

      // Start a seller update (finished in tests)
      accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamondAddress);
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

      shell.exec(`git checkout HEAD scripts`);
      await migrate("upgrade-test");

      // Cast to updated interface
      let newHandlers = {
        accountHandler: "IBosonAccountHandler",
        pauseHandler: "IBosonPauseHandler",
        configHandler: "IBosonConfigHandler",
        offerHandler: "IBosonOfferHandler",
        groupHandler: "IBosonGroupHandler",
        orchestrationHandler: "IBosonOrchestrationHandler",
        fundsHandler: "IBosonFundsHandler",
        exchangeHandler: "IBosonExchangeHandler",
      };

      contractsAfter = { ...contractsBefore };

      for (const [handlerName, interfaceName] of Object.entries(newHandlers)) {
        contractsAfter[handlerName] = await ethers.getContractAt(interfaceName, protocolDiamondAddress);
      }

      ({
        accountHandler,
        pauseHandler,
        configHandler,
        offerHandler,
        groupHandler,
        orchestrationHandler,
        fundsHandler,
        exchangeHandler,
      } = contractsAfter);

      getFunctionHashesClosure = getStateModifyingFunctionsHashes(
        [
          "SellerHandlerFacet",
          "OfferHandlerFacet",
          "ConfigHandlerFacet",
          "PauseHandlerFacet",
          "GroupHandlerFacet",
          "OrchestrationHandlerFacet1",
          "ExchangeHandlerFacet",
        ],
        undefined,
        [
          "createSeller",
          "createOffer",
          "createPremintedOffer",
          "unpause",
          "createGroup",
          "setGroupCondition",
          "createNewCollection",
          "setMinResolutionPeriod",
          "commitToConditionalOffer",
          "updateSellerSalt",
        ]
      );

      addedFunctionHashes = await getFunctionHashesClosure();

      snapshot = await getSnapshot();

      // Get protocol state after the upgrade
      protocolContractStateAfter = await getProtocolContractState(
        protocolDiamondAddress,
        contractsAfter,
        mockContracts,
        preUpgradeEntities
      );

      const includeTests = [
        "offerContractState",
        "bundleContractState",
        "disputeContractState",
        "fundsContractState",
        "twinContractState",
        "protocolStatusPrivateContractState",
      ];

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

      const equalCustomTypes = {
        "t_struct(Range)12648_storage": "t_struct(Range)14254_storage",
      };

      context(
        "Generic tests on Voucher",
        getGenericContextVoucher(
          deployer,
          protocolDiamondAddress,
          contractsAfter,
          mockContracts,
          voucherContractState,
          preUpgradeEntitiesVoucher,
          preUpgradeStorageLayout,
          snapshot,
          equalCustomTypes
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
            DR: { ...dr.DR, clerk: ZeroAddress },
          }));

          // All DR's clerks should be 0
          assert.deepEqual(stateBeforeWithoutClerk, protocolContractStateAfter.accountContractState.DRsState);

          // Lookup by address
          stateBeforeWithoutClerk = protocolContractStateBefore.accountContractState.DRbyAddressState.map((dr) => ({
            ...dr,
            DR: { ...dr.DR, clerk: ZeroAddress },
          }));

          // All DR's clerks should be 0
          assert.deepEqual(stateBeforeWithoutClerk, protocolContractStateAfter.accountContractState.DRbyAddressState);
        });

        it("Existing seller's clerk is changed to 0", async function () {
          // Lookup by id
          let stateBeforeWithoutClerk = protocolContractStateBefore.accountContractState.sellerState.map((s) => ({
            ...s,
            seller: { ...s.seller, clerk: ZeroAddress },
          }));

          // All Seller's clerks should be 0
          assert.deepEqual(stateBeforeWithoutClerk, protocolContractStateAfter.accountContractState.sellerState);

          // Lookup by address
          stateBeforeWithoutClerk = protocolContractStateBefore.accountContractState.sellerByAddressState.map((s) => ({
            ...s,
            seller: { ...s.seller, clerk: ZeroAddress },
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

      context("Protocol limits", async function () {
        let wallets;
        let sellers, DRs, sellerWallet;

        before(async function () {
          ({ sellers, DRs } = preUpgradeEntities);
          ({ wallet: sellerWallet } = sellers[0]);

          wallets = new Array(200);

          for (let i = 0; i < wallets.length; i++) {
            wallets[i] = Wallet.createRandom(provider);
          }

          await Promise.all(
            wallets.map((w) => {
              return provider.send("hardhat_setBalance", [w.address, toHexString(parseEther("10000"))]);
            })
          );

          await provider.send("hardhat_setBalance", [sellerWallet.address, toHexString(parseEther("10000"))]);
        });

        it("can complete more exchanges than maxExchangesPerBatch", async function () {
          const { maxExchangesPerBatch } = protocolLimits;
          const exchangesCount = Number(maxExchangesPerBatch) + 1;
          const startingExchangeId = await exchangeHandler.getNextExchangeId();
          const exchangesToComplete = [...Array(exchangesCount).keys()].map((i) => startingExchangeId + BigInt(i));

          // Create offer with maxExchangesPerBatch+1 items
          const { offer, offerDates, offerDurations } = await mockOffer();
          offer.quantityAvailable = exchangesCount;
          offer.price = offer.buyerCancelPenalty = offer.sellerDeposit = 0;
          const offerId = await offerHandler.getNextOfferId();
          await offerHandler.connect(sellerWallet).createOffer(offer, offerDates, offerDurations, DRs[0].id, "0");
          await setNextBlockTimestamp(Number(offerDates.voucherRedeemableFrom));

          // Commit to offer and redeem voucher
          // Use unique wallets to avoid nonce issues
          const walletSet = wallets.slice(0, exchangesCount);

          for (let i = 0; i < exchangesCount; i++) {
            const tx = await exchangeHandler.connect(walletSet[i]).commitToOffer(walletSet[i].address, offerId);
            const { exchangeId } = getEvent(await tx.wait(), exchangeHandler, "BuyerCommitted");
            await exchangeHandler.connect(walletSet[i]).redeemVoucher(exchangeId);
          }

          const { timestamp } = await ethers.provider.getBlock();
          setNextBlockTimestamp(timestamp + Number(offerDurations.disputePeriod) + 1);

          const tx = await exchangeHandler.connect(sellerWallet).completeExchangeBatch(exchangesToComplete);
          await expect(tx).to.not.be.reverted;
        });

        it("can create/extend/void more offers than maxOffersPerBatch", async function () {
          const { maxOffersPerBatch } = protocolLimits;
          const offerCount = Number(maxOffersPerBatch) + 1;

          const { offer, offerDates, offerDurations } = await mockOffer();
          const offers = new Array(offerCount).fill(offer);
          const offerDatesList = new Array(offerCount).fill(offerDates);
          const offerDurationsList = new Array(offerCount).fill(offerDurations);
          const disputeResolverIds = new Array(offerCount).fill(DRs[0].id);
          const agentIds = new Array(offerCount).fill("0");
          const startingOfferId = await offerHandler.getNextOfferId();

          // Create offers in batch
          await expect(
            offerHandler
              .connect(sellerWallet)
              .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds)
          ).to.not.be.reverted;

          // Extend offers validity
          const newValidUntilDate = (BigInt(offerDates.validUntil) + 10000n).toString();
          const offerIds = [...Array(offerCount).keys()].map((i) => startingOfferId + BigInt(i));
          await expect(offerHandler.connect(sellerWallet).extendOfferBatch(offerIds, newValidUntilDate)).to.not.be
            .reverted;

          // Void offers
          await expect(offerHandler.connect(sellerWallet).voidOfferBatch(offerIds)).to.not.be.reverted;
        });

        it("can create a bundle with more twins than maxTwinsPerBundle", async function () {
          const { maxTwinsPerBundle } = protocolLimits;
          const twinCount = Number(maxTwinsPerBundle) + 1;
          const startingTwinId = await twinHandler.getNextTwinId();
          const twinIds = [...Array(twinCount).keys()].map((i) => startingTwinId + BigInt(i));

          const [twinContract] = await deployMockTokens(["Foreign721"]);
          await twinContract.connect(sellerWallet).setApprovalForAll(await twinHandler.getAddress(), true);

          // Create all twins
          const twin721 = mockTwin(await twinContract.getAddress(), TokenType.NonFungibleToken);
          twin721.amount = "0";
          twin721.supplyAvailable = "1";

          for (let i = 0; i < twinCount; i++) {
            twin721.tokenId = i;
            await twinHandler.connect(sellerWallet).createTwin(twin721);
          }

          // create an offer with only 1 item, so twins' supply available is enough
          const { offer, offerDates, offerDurations } = await mockOffer();
          offer.quantityAvailable = 1;
          const offerId = await offerHandler.getNextOfferId();
          await offerHandler.connect(sellerWallet).createOffer(offer, offerDates, offerDurations, DRs[0].id, "0");

          // Create a bundle with more twins than maxTwinsPerBundle
          const bundle = new Bundle("1", sellers[0].seller.id, [offerId], twinIds);
          await expect(bundleHandler.connect(sellerWallet).createBundle(bundle)).to.not.be.reverted;
        });

        it("can create a bundle with more offers than maxOffersPerBundle", async function () {
          const { maxOffersPerBundle, maxOffersPerBatch } = protocolLimits;
          const offerCount = Number(maxOffersPerBundle) + 1;
          const twinId = await twinHandler.getNextTwinId();
          const startingOfferId = await offerHandler.getNextOfferId();
          const offerIds = [...Array(offerCount).keys()].map((i) => startingOfferId + BigInt(i));

          const { offer, offerDates, offerDurations } = await mockOffer({ refreshModule: true });
          const maxOffersPerBatchInt = Number(maxOffersPerBatch);
          const offers = new Array(maxOffersPerBatchInt).fill(offer);
          const offerDatesList = new Array(maxOffersPerBatchInt).fill(offerDates);
          const offerDurationsList = new Array(maxOffersPerBatchInt).fill(offerDurations);
          const disputeResolverIds = new Array(maxOffersPerBatchInt).fill(DRs[0].id);
          const agentIds = new Array(maxOffersPerBatchInt).fill("0");

          // Create offers in batch
          let offersToCreate = offerCount;
          while (offersToCreate > maxOffersPerBatchInt) {
            await offerHandler
              .connect(sellerWallet)
              .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds);
            offersToCreate -= maxOffersPerBatchInt;
          }
          await offerHandler
            .connect(sellerWallet)
            .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds);

          // At list one twin is needed to create a bundle
          const [twinContract] = await deployMockTokens(["Foreign721"]);
          await twinContract.connect(sellerWallet).setApprovalForAll(await twinHandler.getAddress(), true);
          const twin721 = mockTwin(await twinContract.getAddress(), TokenType.NonFungibleToken);
          twin721.amount = "0";
          await twinHandler.connect(sellerWallet).createTwin(twin721);

          // Create a bundle with more twins than maxTwinsPerBundle
          const bundle = new Bundle("1", sellers[0].seller.id, offerIds, [twinId]);
          await expect(bundleHandler.connect(sellerWallet).createBundle(bundle)).to.not.be.reverted;
        });

        it("can add more offers to a group than maxOffersPerGroup", async function () {
          const { maxOffersPerBundle, maxOffersPerBatch } = protocolLimits;
          const offerCount = Number(maxOffersPerBundle) + 1;
          const startingOfferId = await offerHandler.getNextOfferId();
          const offerIds = [...Array(offerCount).keys()].map((i) => startingOfferId + BigInt(i));
          const { offer, offerDates, offerDurations } = await mockOffer();
          const maxOffersPerBatchInt = Number(maxOffersPerBatch);
          const offers = new Array(maxOffersPerBatchInt).fill(offer);
          const offerDatesList = new Array(maxOffersPerBatchInt).fill(offerDates);
          const offerDurationsList = new Array(maxOffersPerBatchInt).fill(offerDurations);
          const disputeResolverIds = new Array(maxOffersPerBatchInt).fill(DRs[0].id);
          const agentIds = new Array(maxOffersPerBatchInt).fill("0");

          // Create offers in batch
          let offersToCreate = offerCount;
          while (offersToCreate > maxOffersPerBatchInt) {
            await offerHandler
              .connect(sellerWallet)
              .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds);
            offersToCreate -= maxOffersPerBatchInt;
          }
          await offerHandler
            .connect(sellerWallet)
            .createOfferBatch(offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds);

          // Create a group with more offers than maxOffersPerGroup
          const group = new Group("1", sellers[0].seller.id, offerIds);
          const { mockConditionalToken } = mockContracts;
          const condition = mockCondition(
            {
              tokenAddress: await mockConditionalToken.getAddress(),
              maxCommits: "10",
            },
            { refreshModule: true }
          );
          await expect(groupHandler.connect(sellerWallet).createGroup(group, condition)).to.not.be.reverted;
        });

        it("can withdraw more tokens than maxTokensPerWithdrawal", async function () {
          const { maxTokensPerWithdrawal } = protocolLimits;
          const tokenCount = Number(maxTokensPerWithdrawal) + 1;
          const sellerId = sellers[0].seller.id;

          const tokens = await deployMockTokens(new Array(tokenCount).fill("Foreign20"));

          // Mint tokens and deposit them to the seller
          await Promise.all(
            wallets.slice(0, tokenCount).map(async (wallet, i) => {
              const walletAddress = await wallet.getAddress();
              await provider.send("hardhat_setBalance", [walletAddress, toHexString(parseEther("10"))]);
              const token = tokens[i];
              await token.connect(wallet).mint(walletAddress, "1000");
              await token.connect(wallet).approve(await accountHandler.getAddress(), "1000");
              return fundsHandler.connect(wallet).depositFunds(sellerId, await token.getAddress(), "1000");
            })
          );

          // Withdraw more tokens than maxTokensPerWithdrawal
          const tokenAddresses = tokens.map(async (token) => await token.getAddress());
          const amounts = new Array(tokenCount).fill("1000");
          await expect(fundsHandler.connect(sellerWallet).withdrawFunds(sellerId, tokenAddresses, amounts)).to.not.be
            .reverted;
        });

        it("can create a DR with more fees than maxFeesPerDisputeResolver", async function () {
          const { maxFeesPerDisputeResolver } = protocolLimits;
          const feeCount = Number(maxFeesPerDisputeResolver) + 1;

          // we just need some address, so we just use "wallets"
          const disputeResolverFees = wallets.slice(0, feeCount).map((wallet) => {
            return new DisputeResolverFee(wallet.address, "Token", "0");
          });
          const sellerAllowList = [];
          const disputeResolver = mockDisputeResolver(rando.address, rando.address, ZeroAddress, rando.address);

          // Create a DR with more fees than maxFeesPerDisputeResolver
          await expect(
            accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList)
          ).to.not.be.reverted;
        });

        it("can create a DR with more allowed sellers than maxAllowedSellers", async function () {
          const { maxAllowedSellers } = protocolLimits;
          const sellerCount = Number(maxAllowedSellers) + 1;
          const startingSellerId = await accountHandler.getNextAccountId();
          const sellerAllowList = [...Array(sellerCount).keys()].map((i) => startingSellerId + BigInt(i));

          // create new sellers
          const emptyAuthToken = mockAuthToken();
          const voucherInitValues = mockVoucherInitValues();

          for (const wallet of wallets.slice(0, sellerCount)) {
            const walletAddress = await wallet.getAddress();
            const seller = mockSeller(walletAddress, walletAddress, ZeroAddress, walletAddress, true, "", {
              refreshModule: true,
            });
            await provider.send("hardhat_setBalance", [walletAddress, toHexString(parseEther("10"))]);
            await accountHandler.connect(wallet).createSeller(seller, emptyAuthToken, voucherInitValues);
          }

          const disputeResolverFees = [new DisputeResolverFee(ZeroAddress, "Native", "0")];
          const disputeResolver = mockDisputeResolver(rando.address, rando.address, ZeroAddress, rando.address);

          await expect(
            accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList)
          ).to.not.be.reverted;
        });

        it("can expire more disputes than maxDisputesPerBatch", async function () {
          const { maxDisputesPerBatch } = protocolLimits;
          const disputesCount = Number(maxDisputesPerBatch) + 1;
          const startingExchangeId = await exchangeHandler.getNextExchangeId();
          const disputesToExpire = [...Array(disputesCount).keys()].map((i) => startingExchangeId + BigInt(i));
          // Create offer with maxDisputesPerBatch+1 items
          const { offer, offerDates, offerDurations } = await mockOffer();
          offer.quantityAvailable = disputesCount;
          offer.price = offer.buyerCancelPenalty = offer.sellerDeposit = 0;
          const offerId = await offerHandler.getNextOfferId();
          await offerHandler.connect(sellerWallet).createOffer(offer, offerDates, offerDurations, DRs[0].id, "0");

          await setNextBlockTimestamp(Number(offerDates.voucherRedeemableFrom));
          // Commit to offer and redeem voucher
          // Use unique wallets to avoid nonce issues
          const walletSet = wallets.slice(0, disputesCount);
          await Promise.all(
            walletSet.map(async (wallet) => {
              const walletAddress = await wallet.getAddress();
              await provider.send("hardhat_setBalance", [walletAddress, toHexString(parseEther("10"))]);
              const tx = await exchangeHandler.connect(wallet).commitToOffer(walletAddress, offerId);
              const { exchangeId } = getEvent(await tx.wait(), exchangeHandler, "BuyerCommitted");
              await exchangeHandler.connect(wallet).redeemVoucher(exchangeId);
              return disputeHandler.connect(wallet).raiseDispute(exchangeId);
            })
          );

          const { timestamp } = await ethers.provider.getBlock();
          setNextBlockTimestamp(timestamp + Number(offerDurations.resolutionPeriod) + 1);

          // Expire more disputes than maxDisputesPerBatch
          await expect(disputeHandler.connect(sellerWallet).expireDisputeBatch(disputesToExpire)).to.not.be.reverted;
        });

        it("can premint more vouchers than maxPremintedVouchers", async function () {
          const { maxPremintedVouchers } = protocolLimits;
          const voucherCount = Number(maxPremintedVouchers) + 1;
          const offerId = await offerHandler.getNextOfferId();

          // Create offer with maxPremintedVouchers+1 items
          const { offer, offerDates, offerDurations } = await mockOffer();
          offer.quantityAvailable = voucherCount;
          await offerHandler.connect(sellerWallet).createOffer(offer, offerDates, offerDurations, DRs[0].id, "0");

          // reserve range
          await offerHandler.connect(sellerWallet).reserveRange(offerId, voucherCount, sellerWallet.address);

          // Premint more vouchers than maxPremintedVouchers
          const { voucherContractAddress } = sellers[0];

          const bosonVoucher = await getContractAt("BosonVoucher", voucherContractAddress);
          const tx = await bosonVoucher.connect(sellerWallet).preMint(offerId, voucherCount);

          await expect(tx).to.not.be.reverted;
        });
      });

      context("SellerHandler", async function () {
        let seller, emptyAuthToken, voucherInitValues;

        beforeEach(async function () {
          // Fix account id. nextAccountId is 16 and current is 15
          accountId.next();
          seller = mockSeller(assistant.address, assistant.address, assistant.address, assistant.address, true);
          emptyAuthToken = mockAuthToken();
          voucherInitValues = mockVoucherInitValues();
        });

        context("Deprecate clerk", async function () {
          it("Cannot create a new seller with non zero clerk", async function () {
            // Attempt to create a seller with clerk not 0
            await expect(
              accountHandler.connect(assistant).createSeller(seller, emptyAuthToken, voucherInitValues)
            ).to.revertedWith(RevertReasons.CLERK_DEPRECATED);
          });

          it("Cannot update a seller to non zero clerk", async function () {
            seller.clerk = ZeroAddress;
            await accountHandler.connect(assistant).createSeller(seller, emptyAuthToken, voucherInitValues);

            // Attempt to update a seller, expecting revert
            seller.clerk = assistant.address;
            await expect(accountHandler.connect(assistant).updateSeller(seller, emptyAuthToken)).to.revertedWith(
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
            seller = mockSeller(clerk.address, clerk.address, ZeroAddress, clerk.address);
            await expect(accountHandler.connect(clerk).createSeller(seller, emptyAuthToken, voucherInitValues)).to.emit(
              accountHandler,
              "SellerCreated"
            );
          });

          const { sellers } = preUpgradeEntities;
          const { wallet, id } = sellers[2]; // seller 2 assistant was different from clerk

          // Withdraw funds
          await expect(fundsHandler.connect(wallet).withdrawFunds(id, [], [])).to.emit(fundsHandler, "FundsWithdrawn");
        });

        context("Clear pending updates", async function () {
          let pendingSellerUpdate, authToken;
          beforeEach(async function () {
            authToken = new AuthToken("8400", AuthTokenType.Lens);

            pendingSellerUpdate = seller.clone();
            pendingSellerUpdate.admin = ZeroAddress;
            pendingSellerUpdate.clerk = ZeroAddress;
            pendingSellerUpdate.assistant = ZeroAddress;
            pendingSellerUpdate.treasury = ZeroAddress;
            pendingSellerUpdate.active = false;
            pendingSellerUpdate.id = "0";
          });

          it("should clean pending addresses update when calling updateSeller again", async function () {
            // create a seller with auth token
            seller.admin = ZeroAddress;
            seller.clerk = ZeroAddress;
            const nextAccountId = await accountHandler.getNextAccountId();
            seller.id = nextAccountId.toString();

            await mockContracts.mockAuthERC721Contract.connect(assistant).mint(8400, 1);
            authToken = new AuthToken("8400", AuthTokenType.Lens);

            await accountHandler.connect(assistant).createSeller(seller, authToken, voucherInitValues);

            // Start replacing auth token with admin address, but don't complete it
            seller.admin = pendingSellerUpdate.admin = assistant.address;

            await expect(accountHandler.connect(assistant).updateSeller(seller, emptyAuthToken))
              .to.emit(accountHandler, "SellerUpdatePending")
              .withArgs(seller.id, pendingSellerUpdate.toStruct(), emptyAuthToken.toStruct(), assistant.address);

            // Replace admin address with auth token
            seller.admin = pendingSellerUpdate.admin = ZeroAddress;

            await mockContracts.mockAuthERC721Contract.connect(assistant).mint(123, 1);
            authToken.tokenId = "123";

            // Calling updateSeller again, request to replace admin with an auth token
            await expect(accountHandler.connect(assistant).updateSeller(seller, authToken))
              .to.emit(accountHandler, "SellerUpdatePending")
              .withArgs(seller.id, pendingSellerUpdate.toStruct(), authToken.toStruct(), assistant.address);
          });

          it("should clean pending auth token update when calling updateSeller again", async function () {
            seller.clerk = ZeroAddress;
            const nextAccountId = await accountHandler.getNextAccountId();
            seller.id = nextAccountId.toString();

            await accountHandler.connect(assistant).createSeller(seller, emptyAuthToken, voucherInitValues);

            // Start replacing admin address with auth token, but don't complete it
            seller.admin = pendingSellerUpdate.admin = ZeroAddress;
            authToken = new AuthToken("8400", AuthTokenType.Lens);

            await mockContracts.mockAuthERC721Contract.connect(assistant).mint(8400, 1);

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

        context("Create new collection", async function () {
          let beaconProxyAddress;
          before(async function () {
            // Get the beacon proxy address
            beaconProxyAddress = await calculateBosonProxyAddress(protocolDiamondAddress);
          });

          it("New seller can create a new collection", async function () {
            const seller = mockSeller(assistant.address, assistant.address, ZeroAddress, assistant.address);
            seller.id = await accountHandler.getNextAccountId();
            const emptyAuthToken = mockAuthToken();
            const voucherInitValues = mockVoucherInitValues();

            await accountHandler.connect(assistant).createSeller(seller, emptyAuthToken, voucherInitValues);

            const externalId = "new-collection";
            voucherInitValues.collectionSalt = encodeBytes32String(externalId);

            const expectedDefaultAddress = calculateCloneAddress(
              await accountHandler.getAddress(),
              beaconProxyAddress,
              seller.admin
            ); // default
            const expectedCollectionAddress = calculateCloneAddress(
              await accountHandler.getAddress(),
              beaconProxyAddress,
              seller.admin,
              voucherInitValues.collectionSalt
            );
            const tx = await accountHandler.connect(assistant).createNewCollection(externalId, voucherInitValues);

            await expect(tx)
              .to.emit(accountHandler, "CollectionCreated")
              .withArgs(Number(seller.id), 1, expectedCollectionAddress, externalId, assistant.address);

            const expectedCollections = new CollectionList([new Collection(expectedCollectionAddress, externalId)]);

            // Get the collections information
            const [defaultVoucherAddress, collections] = await accountHandler
              .connect(rando)
              .getSellersCollections(seller.id);
            const additionalCollections = CollectionList.fromStruct(collections);

            expect(defaultVoucherAddress).to.equal(expectedDefaultAddress, "Wrong default voucher address");
            expect(additionalCollections).to.deep.equal(expectedCollections, "Wrong additional collections");

            // Voucher clone contract
            let bosonVoucher = await ethers.getContractAt("OwnableUpgradeable", expectedCollectionAddress);

            expect(await bosonVoucher.owner()).to.equal(assistant.address, "Wrong voucher clone owner");

            bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCollectionAddress);

            expect(await bosonVoucher.contractURI()).to.equal(voucherInitValues.contractURI, "Wrong contract URI");
            expect(await bosonVoucher.name()).to.equal(
              VOUCHER_NAME + " S" + seller.id + "_C1",
              "Wrong voucher client name"
            );
            expect(await bosonVoucher.symbol()).to.equal(
              VOUCHER_SYMBOL + "_S" + seller.id + "_C1",
              "Wrong voucher client symbol"
            );
          });

          it("old seller can create a new collection", async function () {
            const { sellers } = preUpgradeEntities;
            const {
              wallet: sellerWallet,
              id: sellerId,
              voucherInitValues,
              voucherContractAddress: expectedDefaultAddress,
            } = sellers[0];
            const externalId = "new-collection";
            voucherInitValues.collectionSalt = encodeBytes32String(externalId);
            beaconProxyAddress = await calculateBosonProxyAddress(protocolDiamondAddress);
            const expectedCollectionAddress = calculateCloneAddress(
              await accountHandler.getAddress(),
              beaconProxyAddress,
              sellerWallet.address,
              voucherInitValues.collectionSalt,
              voucherInitValues.collectionSalt
            );

            await expect(accountHandler.connect(sellerWallet).createNewCollection(externalId, voucherInitValues))
              .to.emit(accountHandler, "CollectionCreated")
              .withArgs(sellerId, 1, expectedCollectionAddress, externalId, sellerWallet.address);

            const expectedCollections = new CollectionList([new Collection(expectedCollectionAddress, externalId)]);

            // Get the collections information
            const [defaultVoucherAddress, collections] = await accountHandler
              .connect(rando)
              .getSellersCollections(sellerId);

            const additionalCollections = CollectionList.fromStruct(collections);

            expect(defaultVoucherAddress).to.equal(expectedDefaultAddress, "Wrong default voucher address");
            expect(additionalCollections).to.deep.equal(expectedCollections, "Wrong additional collections");

            // Voucher clone contract
            let bosonVoucher = await ethers.getContractAt("OwnableUpgradeable", expectedCollectionAddress);

            expect(await bosonVoucher.owner()).to.equal(sellerWallet.address, "Wrong voucher clone owner");

            bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCollectionAddress);
            expect(await bosonVoucher.contractURI()).to.equal(voucherInitValues.contractURI, "Wrong contract URI");
            expect(await bosonVoucher.name()).to.equal(
              VOUCHER_NAME + " S" + sellerId + "_C1",
              "Wrong voucher client name"
            );
            expect(await bosonVoucher.symbol()).to.equal(
              VOUCHER_SYMBOL + "_S" + sellerId + "_C1",
              "Wrong voucher client symbol"
            );
          });
        });

        context("Update seller salt", async function () {
          let beaconProxyAddress;
          before(async function () {
            // Get the beacon proxy address
            beaconProxyAddress = await calculateBosonProxyAddress(protocolDiamondAddress);
          });

          it("New seller can update sellers salt", async function () {
            const seller = mockSeller(assistant.address, assistant.address, ZeroAddress, assistant.address);
            seller.id = await accountHandler.getNextAccountId();
            const emptyAuthToken = mockAuthToken();
            const voucherInitValues = mockVoucherInitValues();

            await accountHandler.connect(assistant).createSeller(seller, emptyAuthToken, voucherInitValues);

            const externalId = "new-collection";
            voucherInitValues.collectionSalt = encodeBytes32String(externalId);

            const newSellerSalt = encodeBytes32String("new-seller-salt");
            await accountHandler.connect(assistant).updateSellerSalt(seller.id, newSellerSalt); // assistant is also the admin in this test

            const expectedCollectionAddress = calculateCloneAddress(
              await accountHandler.getAddress(),
              beaconProxyAddress,
              seller.admin,
              voucherInitValues.collectionSalt,
              newSellerSalt
            );
            const tx = await accountHandler.connect(assistant).createNewCollection(externalId, voucherInitValues);

            await expect(tx)
              .to.emit(accountHandler, "CollectionCreated")
              .withArgs(Number(seller.id), 1, expectedCollectionAddress, externalId, assistant.address);
          });

          it("old seller can create update seller salt", async function () {
            const { sellers } = preUpgradeEntities;
            const { wallet: sellerWallet, id: sellerId, voucherInitValues } = sellers[0];

            const newSellerSalt = encodeBytes32String("new-seller-salt");
            await accountHandler.connect(sellerWallet).updateSellerSalt(sellerId, newSellerSalt);

            const externalId = "new-collection";
            voucherInitValues.collectionSalt = encodeBytes32String(externalId);
            beaconProxyAddress = await calculateBosonProxyAddress(protocolDiamondAddress);
            const expectedCollectionAddress = calculateCloneAddress(
              await accountHandler.getAddress(),
              beaconProxyAddress,
              sellerWallet.address,
              voucherInitValues.collectionSalt,
              newSellerSalt
            );

            await expect(accountHandler.connect(sellerWallet).createNewCollection(externalId, voucherInitValues))
              .to.emit(accountHandler, "CollectionCreated")
              .withArgs(sellerId, 1, expectedCollectionAddress, externalId, sellerWallet.address);
          });
        });

        it("New sellers uses create2 to calculate voucher address", async function () {
          const seller = mockSeller(assistant.address, assistant.address, ZeroAddress, assistant.address);
          seller.id = await accountHandler.getNextAccountId();

          const emptyAuthToken = mockAuthToken();
          const voucherInitValues = mockVoucherInitValues();

          const beaconProxyAddress = await calculateBosonProxyAddress(protocolDiamondAddress);
          const defaultVoucherAddress = calculateCloneAddress(
            await accountHandler.getAddress(),
            beaconProxyAddress,
            seller.admin,
            voucherInitValues.collectionSalt,
            voucherInitValues.collectionSalt
          );

          const tx = await accountHandler.connect(assistant).createSeller(seller, emptyAuthToken, voucherInitValues);
          await expect(tx)
            .to.emit(accountHandler, "SellerCreated")
            .withArgs(
              seller.id,
              seller.toStruct(),
              defaultVoucherAddress,
              emptyAuthToken.toStruct(),
              assistant.address
            );
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
          disputeResolver.clerk = ZeroAddress;
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
          disputeResolver = mockDisputeResolver(clerk.address, clerk.address, ZeroAddress, clerk.address);
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

        it("getPausedRegions function should be available", async function () {
          const pausedRegions = await pauseHandler.getPausedRegions();
          expect(pausedRegions).to.not.reverted;
        });
      });

      context("ConfigHandler", async function () {
        it("After the upgrade, minimal resolution period is set", async function () {
          // Minimal resolution period should be set to 1 week
          const minResolutionPeriod = await configHandler.connect(rando).getMinResolutionPeriod();
          expect(minResolutionPeriod).to.equal(oneWeek);
        });

        it("It is possible to change minimal resolution period", async function () {
          const minResolutionPeriod = BigInt(oneMonth);
          // Set new resolution period
          await expect(configHandler.connect(deployer).setMinResolutionPeriod(minResolutionPeriod))
            .to.emit(configHandler, "MinResolutionPeriodChanged")
            .withArgs(minResolutionPeriod, deployer.address);

          const tx = await configHandler.connect(rando).getMinResolutionPeriod();
          // Verify that new value is stored
          await expect(tx).to.equal(minResolutionPeriod);
        });

        it("State of configContractState is not affected apart from minResolutionPeriod, removed limits and beaconProxy", async function () {
          // make a shallow copy to not modify original protocolContractState as it's used on getGenericContext
          const configContractStateBefore = { ...protocolContractStateBefore.configContractState };
          const configContractStateAfter = { ...protocolContractStateAfter.configContractState };

          const { minResolutionPeriod: minResolutionPeriodAfter, beaconProxyAddress } = configContractStateAfter;

          configContractStateBefore.maxOffersPerBatch = "0";
          configContractStateBefore.maxOffersPerGroup = "0";
          configContractStateBefore.maxOffersPerBundle = "0";
          configContractStateBefore.maxTwinsPerBundle = "0";
          configContractStateBefore.maxTokensPerWithdrawal = "0";
          configContractStateBefore.maxFeesPerDisputeResolver = "0";
          configContractStateBefore.maxEscalationResponsePeriod = "0";
          configContractStateBefore.maxDisputesPerBatch = "0";
          configContractStateBefore.maxAllowedSellers = "0";
          configContractStateBefore.maxExchangesPerBatch = "0";
          configContractStateBefore.maxPremintedVouchers = "0";

          delete configContractStateBefore.minResolutionPeriod;
          delete configContractStateAfter.minResolutionPeriod;
          delete configContractStateBefore.beaconProxyAddress;
          delete configContractStateAfter.beaconProxyAddress;

          const expectedBeaconProxyAddress = await calculateBosonProxyAddress(protocolDiamondAddress);
          expect(minResolutionPeriodAfter).to.equal(oneWeek);
          expect(beaconProxyAddress).to.equal(expectedBeaconProxyAddress);

          expect(configContractStateAfter).to.deep.equal(configContractStateBefore);
        });
      });

      context("OfferHandler", async function () {
        it("Cannot make an offer with too short resolution period", async function () {
          const { sellers, DRs } = preUpgradeEntities;
          const { wallet } = sellers[0];

          // Set dispute duration period to 0
          const { offer, offerDates, offerDurations } = await mockOffer();
          offerDurations.resolutionPeriod = (BigInt(oneWeek) - 10n).toString();

          // Attempt to Create an offer, expecting revert
          await expect(
            offerHandler.connect(wallet).createOffer(offer, offerDates, offerDurations, DRs[0].id, "0")
          ).to.revertedWith(RevertReasons.INVALID_RESOLUTION_PERIOD);
        });

        it("Create an offer with a new collection", async function () {
          const { sellers, DRs, buyers } = preUpgradeEntities;
          const { wallet: sellerWallet, voucherInitValues, seller } = sellers[0];
          const { disputeResolver } = DRs[0];
          const { wallet: buyerWallet } = buyers[0];
          const externalId = "new-collection";
          voucherInitValues.collectionSalt = encodeBytes32String(externalId);

          // Get next ids
          const offerId = await offerHandler.getNextOfferId();
          const exchangeId = await exchangeHandler.getNextExchangeId();
          const tokenId = deriveTokenId(offerId, exchangeId);

          // Create a new collection
          await accountHandler.connect(sellerWallet).createNewCollection(externalId, voucherInitValues);

          const { offer, offerDates, offerDurations } = await mockOffer();
          offer.collectionIndex = "1";

          await expect(
            offerHandler.connect(sellerWallet).createOffer(offer, offerDates, offerDurations, disputeResolver.id, "0")
          ).to.emit(offerHandler, "OfferCreated");

          // Deposit seller funds so the commit will succeed
          const sellerPool = BigInt(offer.quantityAvailable) * BigInt(offer.price);
          await fundsHandler
            .connect(sellerWallet)
            .depositFunds(seller.id, offer.exchangeToken, sellerPool, { value: sellerPool });

          const beaconProxyAddress = await calculateBosonProxyAddress(protocolDiamondAddress);

          // Collection voucher contract
          const expectedCollectionAddress = calculateCloneAddress(
            await accountHandler.getAddress(),
            beaconProxyAddress,
            seller.admin,
            voucherInitValues.collectionSalt,
            voucherInitValues.collectionSalt
          );

          const bosonVoucher = await ethers.getContractAt("IBosonVoucher", expectedCollectionAddress);

          const tx = await exchangeHandler
            .connect(buyerWallet)
            .commitToOffer(buyerWallet.address, offerId, { value: offer.price });

          // Voucher should be minted on a new collection contract
          await expect(tx).to.emit(bosonVoucher, "Transfer").withArgs(ZeroAddress, buyerWallet.address, tokenId);
        });
      });

      context("ExchangeHandler", async function () {
        context("Twin transfers", async function () {
          let mockTwin721Contract, twin721;
          let buyer;
          let exchangeId;
          let sellerWallet, sellerId;

          beforeEach(async function () {
            const { buyers, sellers, DRs } = preUpgradeEntities;
            ({ wallet: sellerWallet, id: sellerId } = sellers[0]);
            ({ wallet: buyer } = buyers[0]);
            // find a DR with no allowlist
            const { disputeResolver } = DRs.find((DR) => DR.sellerAllowList.length == 0);
            const { mockToken, mockTwinTokens } = mockContracts;
            [mockTwin721Contract] = mockTwinTokens;

            // Create twin
            const twinId = await twinHandler.getNextTwinId();
            twin721 = mockTwin(await mockTwin721Contract.getAddress(), TokenType.NonFungibleToken);
            twin721.supplyAvailable = "1";
            twin721.sellerId = sellerId;
            twin721.amount = "0";
            twin721.tokenId = "1";
            // mint last token as will be the one used for the offer
            await mockTwin721Contract.connect(sellerWallet).mint(twin721.supplyAvailable, 1);
            await mockTwin721Contract.connect(sellerWallet).setApprovalForAll(protocolDiamondAddress, true);
            await twinHandler.connect(sellerWallet).createTwin(twin721);

            // Create offer
            const { offer, offerDates, offerDurations } = await mockOffer();
            const offerId = await offerHandler.getNextOfferId();

            await expect(
              offerHandler.connect(sellerWallet).createOffer(offer, offerDates, offerDurations, disputeResolver.id, "0")
            ).to.emit(offerHandler, "OfferCreated");

            // Deposit seller funds so the commit will succeed
            const sellerPool = BigInt(offer.quantityAvailable) * BigInt(offer.price);
            await fundsHandler
              .connect(sellerWallet)
              .depositFunds(sellerId, offer.exchangeToken, sellerPool, { value: sellerPool });

            // Bundle: Required constructor params
            const bundleId = await bundleHandler.getNextBundleId();
            const offerIds = [offerId]; // createBundle() does not accept empty offer ids.
            const twinIds = [twinId];

            // Create a new bundle
            let bundle = new Bundle(bundleId, sellerId, offerIds, twinIds);
            await bundleHandler.connect(sellerWallet).createBundle(bundle);

            exchangeId = await exchangeHandler.getNextExchangeId();
            let msgValue;
            if (offer.exchangeToken == ZeroAddress) {
              msgValue = offer.price;
            } else {
              // approve token transfer
              msgValue = 0;
              await mockToken.connect(buyer).approve(protocolDiamondAddress, offer.price);
              await mockToken.mint(buyer.address, offer.price);
            }
            // Commit to offer
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: msgValue });

            await setNextBlockTimestamp(Number(offerDates.voucherRedeemableFrom));
          });

          it("If a twin is transferred it could be used in a new twin", async function () {
            const tx = await exchangeHandler.connect(buyer).redeemVoucher(exchangeId, { gasLimit: 10000000 });
            const receipt = await tx.wait();
            const event = getEvent(receipt, exchangeHandler, "TwinTransferred");

            const { tokenId } = event;

            // transfer the twin to the original seller
            await mockTwin721Contract.connect(buyer).safeTransferFrom(buyer.address, sellerWallet.address, tokenId);

            // create a new twin with the transferred token
            twin721.id = tokenId;
            twin721.supplyAvailable = 1;
            twin721.amount = "0";
            await expect(twinHandler.connect(sellerWallet).createTwin(twin721)).to.emit(twinHandler, "TwinCreated");
          });

          it("if twin transfer fail, dispute is raised even when buyer is EOA", async function () {
            // Remove the approval for the protocol to transfer the seller's tokens
            await mockTwin721Contract.connect(sellerWallet).setApprovalForAll(protocolDiamondAddress, false);

            const tx = await exchangeHandler.connect(buyer).redeemVoucher(exchangeId, { gasLimit: 10000000 });

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(twin721.id, twin721.tokenAddress, exchangeId, anyValue, twin721.amount, buyer.address);

            // Get the exchange state
            const [, response] = await exchangeHandler.connect(rando).getExchangeState(exchangeId);

            // It should match ExchangeState.Disputed
            assert.equal(response, ExchangeState.Disputed, "Exchange state is incorrect");
          });

          it("if twin transfers consume all available gas, redeem still succeeds, but dispute is raised", async function () {
            const { sellers, offers, buyers } = preUpgradeEntities;
            const { wallet, id: sellerId, offerIds } = sellers[1]; // first seller has condition to all offers
            const offerId = offerIds[offerIds.length - 1];
            const {
              offer: { price, quantityAvailable, exchangeToken },
            } = offers[offerId - 1];
            const { wallet: buyer, id: buyerId } = buyers[0];

            const [foreign20gt, foreign20gt_2] = await deployMockTokens(["Foreign20GasTheft", "Foreign20GasTheft"]);

            // Approve the protocol diamond to transfer seller's tokens
            await foreign20gt.connect(wallet).approve(protocolDiamondAddress, "100");
            await foreign20gt_2.connect(wallet).approve(protocolDiamondAddress, "100");

            // Create two ERC20 twins that will consume all available gas
            const twin20 = mockTwin(await foreign20gt.getAddress());
            twin20.amount = "1";
            twin20.supplyAvailable = quantityAvailable;
            twin20.id = Number(await twinHandler.getNextTwinId());

            await twinHandler.connect(wallet).createTwin(twin20.toStruct());

            const twin20_2 = twin20.clone();
            twin20_2.id = twin20.id + 1;
            twin20_2.tokenAddress = await foreign20gt_2.getAddress();
            await twinHandler.connect(wallet).createTwin(twin20_2.toStruct());

            // Create a new bundle
            const bundle = new Bundle("2", sellerId, [offerId], [twin20.id, twin20_2.id]);
            await bundleHandler.connect(wallet).createBundle(bundle.toStruct());

            let msgValue;
            if (exchangeToken == ZeroAddress) {
              msgValue = price;
            } else {
              // approve token transfer
              msgValue = 0;
              const { mockToken } = mockContracts;
              await mockToken.mint(buyer.address, price);
              await mockToken.connect(buyer).approve(protocolDiamondAddress, price);
            }

            // Commit to offer
            const exchangeId = await exchangeHandler.getNextExchangeId();
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: msgValue });

            // Redeem the voucher
            const tx = await exchangeHandler.connect(buyer).redeemVoucher(exchangeId, { gasLimit: 1000000 }); // limit gas to speed up test

            // Dispute should be raised and both transfers should fail
            await expect(tx)
              .to.emit(disputeHandler, "DisputeRaised")
              .withArgs(exchangeId, buyerId, sellerId, buyer.address);

            await expect(tx)
              .to.emit(exchangeHandler, "TwinTransferFailed")
              .withArgs(twin20.id, twin20.tokenAddress, exchangeId, twin20.tokenId, twin20.amount, buyer.address);

            await expect(tx).to.emit(exchangeHandler, "TwinTransferFailed").withArgs(
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
            assert.equal(response, ExchangeState.Disputed, "Exchange state is incorrect");
          });
        });

        it("commit exactly at offer expiration timestamp", async function () {
          const { offers, buyers } = preUpgradeEntities;
          const { offer, offerDates } = offers[1]; //offer 0 has a condition
          const { wallet: buyer } = buyers[0];
          const { mockToken } = mockContracts;

          await mockToken.mint(buyer.address, offer.price);

          // allow the protocol to transfer the buyer's tokens
          await mockToken.connect(buyer).approve(protocolDiamondAddress, offer.price);

          await setNextBlockTimestamp(Number(offerDates.validUntil));

          // Commit to offer, retrieving the event
          await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offer.id)).to.emit(
            exchangeHandler,
            "BuyerCommitted"
          );
        });

        it("old gated offers work ok with new token gating", async function () {
          const { groups, buyers, offers } = preUpgradeEntities;
          const { wallet: buyer } = buyers[0];
          const { offerIds } = groups[0];
          const { offer } = offers[offerIds[0] - 1];

          const tx = await exchangeHandler
            .connect(buyer)
            .commitToConditionalOffer(buyer.address, offer.id, "0", { value: offer.price });

          // Commit to offer, retrieving the event
          await expect(tx).to.emit(exchangeHandler, "BuyerCommitted");
        });
      });

      context("GroupHandler", async function () {
        it("it's possible to create a group with new token gating", async function () {
          const [conditionToken1155] = await deployMockTokens(["Foreign1155"]);
          // create a condition that was not possible before
          const condition = mockCondition(
            {
              tokenType: TokenType.MultiToken,
              tokenAddress: await conditionToken1155.getAddress(),
              maxTokenId: "15",
              minTokenId: "5",
              method: EvaluationMethod.Threshold,
              threshold: "2",
              gating: GatingType.PerAddress,
            },
            { refreshModule: true }
          );

          const seller = preUpgradeEntities.sellers[1]; // seller does not have any group
          const group = new Group(1, seller.seller.id, seller.offerIds); // group all seller's offers

          await expect(groupHandler.connect(seller.wallet).createGroup(group, condition)).to.emit(
            groupHandler,
            "GroupCreated"
          );
        });
      });

      context("FundsHandler", async function () {
        it("new methods to get funds work", async function () {
          // just check the consistency of the return values
          const { sellers } = preUpgradeEntities;
          const { mockToken } = mockContracts;

          const expectedTokenListSet = new Set([await mockToken.getAddress(), ZeroAddress]);
          for (const seller of sellers) {
            const { id } = seller;

            const tokenList = await fundsHandler.getTokenList(id);
            const tokenListSet = new Set(tokenList);

            if (seller.id == 1) {
              // first seller has only 1 offer with native token
              expect(tokenListSet).to.deep.equal(new Set([ZeroAddress]));
            } else {
              expect(tokenListSet).to.deep.equal(expectedTokenListSet);
            }

            const tokenListPaginated = await fundsHandler.getTokenListPaginated(id, tokenList.length, "0");

            expect(tokenListPaginated).to.deep.equal(tokenList);

            const allAvailableFunds = FundsList.fromStruct(await fundsHandler.getAllAvailableFunds(id));
            const tokenListFromAvailableFunds = allAvailableFunds.funds.map((f) => f.tokenAddress);
            expect(tokenListFromAvailableFunds).to.deep.equal(tokenList);

            const av = await fundsHandler.getAvailableFunds(id, [...tokenList]);
            const availableFunds = FundsList.fromStruct(av);
            expect(availableFunds).to.deep.equal(allAvailableFunds);
          }
        });
      });

      context("OrchestrationHandler", async function () {
        // NB: testing only 1 method to confirm that orchestration is upgraded
        // The rest of the method are tested in the unit tests
        it("should emit a SellerCreated and OfferCreated events with empty auth token", async function () {
          const { DRs } = preUpgradeEntities;

          const { disputeResolver } = DRs.find((DR) => DR.sellerAllowList.length == 0);
          const seller = mockSeller(assistant.address, assistant.address, ZeroAddress, assistant.address);
          const emptyAuthToken = mockAuthToken();
          const voucherInitValues = mockVoucherInitValues();
          const { offer, offerDates, offerDurations } = await mockOffer();

          // Create a seller and an offer, testing for the event
          const tx = await orchestrationHandler
            .connect(assistant)
            .createSellerAndOffer(
              seller,
              offer,
              offerDates,
              offerDurations,
              disputeResolver.id,
              emptyAuthToken,
              voucherInitValues,
              "0"
            );

          await expect(tx).to.emit(orchestrationHandler, "SellerCreated");
          await expect(tx).to.emit(orchestrationHandler, "OfferCreated");

          // Get the beacon proxy address
          const beaconProxyAddress = await calculateBosonProxyAddress(await configHandler.getAddress());

          // expected address of the first clone
          const expectedCloneAddress = calculateCloneAddress(
            await orchestrationHandler.getAddress(),
            beaconProxyAddress,
            assistant.address
          );

          let bosonVoucher = await getContractAt("IBosonVoucher", expectedCloneAddress);

          await expect(tx).to.emit(bosonVoucher, "ContractURIChanged");
          await expect(tx).to.emit(bosonVoucher, "RoyaltyPercentageChanged");
          bosonVoucher = await getContractAt("OwnableUpgradeable", expectedCloneAddress);
          await expect(tx).to.emit(bosonVoucher, "OwnershipTransferred");
        });
      });

      context("MetaTransactionHandler", async function () {
        it("Function hashes from removedFunctionsHashes list should not be allowlisted", async function () {
          for (const hash of removedFunctionHashes) {
            // get function name from hash
            const isFunctionAllowlisted = contractsAfter.metaTransactionsHandler.getFunction(
              "isFunctionAllowlisted(bytes32)"
            );
            const isAllowed = await isFunctionAllowlisted.staticCall(hash);
            expect(isAllowed).to.be.false;
          }
        });

        it("Function hashes from from addedFunctionsHashes list should be allowlisted", async function () {
          for (const hash of addedFunctionHashes) {
            const isFunctionAllowlisted = await contractsAfter.metaTransactionsHandler.getFunction(
              "isFunctionAllowlisted(bytes32)"
            );

            const isAllowed = await isFunctionAllowlisted.staticCall(hash);
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

      context("BosonVoucher", async function () {
        let bosonVoucher;

        beforeEach(async function () {
          const seller = mockSeller(assistant.address, assistant.address, ZeroAddress, assistant.address);
          seller.id = await accountHandler.getNextAccountId();
          const emptyAuthToken = mockAuthToken();
          const voucherInitValues = mockVoucherInitValues();

          await accountHandler.connect(assistant).createSeller(seller, emptyAuthToken, voucherInitValues);

          const beaconProxyAddress = await calculateBosonProxyAddress(protocolDiamondAddress);

          const expectedDefaultAddress = calculateCloneAddress(
            await accountHandler.getAddress(),
            beaconProxyAddress,
            seller.admin
          ); // default
          bosonVoucher = await getContractAt("BosonVoucher", expectedDefaultAddress);
        });

        it("callExternalContract returns whatever External contract returned", async function () {
          // Deploy a random contract
          const MockSimpleContract = await getContractFactory("MockSimpleContract");
          const mockSimpleContract = await MockSimpleContract.deploy();
          await mockSimpleContract.waitForDeployment();

          const calldata = mockSimpleContract.interface.encodeFunctionData("testReturn");
          const returnedValueRaw = await bosonVoucher
            .connect(assistant)
            .callExternalContract.staticCall(await mockSimpleContract.getAddress(), calldata);
          const abiCoder = new ethers.AbiCoder();
          const [returnedValue] = abiCoder.decode(["string"], returnedValueRaw);
          expect(returnedValue).to.equal("TestValue");
        });

        it("tokenURI function should revert if tokenId does not exist", async function () {
          await expect(bosonVoucher.tokenURI(666)).to.be.revertedWith(RevertReasons.ERC721_INVALID_TOKEN_ID);
        });
      });
    });
  });
});
