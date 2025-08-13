const shell = require("shelljs");
const hre = require("hardhat");
const ethers = hre.ethers;
const { ZeroAddress, encodeBytes32String, id, MaxUint256, getContractFactory, getContractAt, provider, parseUnits } =
  ethers;
const { assert, expect } = require("chai");

const { Collection, CollectionList } = require("../../scripts/domain/Collection");
const { RoyaltyRecipientInfo, RoyaltyRecipientInfoList } = require("../../scripts/domain/RoyaltyRecipientInfo.js");
const { RoyaltyInfo } = require("../../scripts/domain/RoyaltyInfo");
const PriceDiscovery = require("../../scripts/domain/PriceDiscovery");
const Side = require("../../scripts/domain/Side");
const PriceType = require("../../scripts/domain/PriceType.js");
const Voucher = require("../../scripts/domain/Voucher.js");
const TokenType = require("../../scripts/domain/TokenType");
const EvaluationMethod = require("../../scripts/domain/EvaluationMethod");
const { RevertReasons } = require("../../scripts/config/revert-reasons");

const {
  getSnapshot,
  revertToSnapshot,
  getEvent,
  calculateCloneAddress,
  deriveTokenId,
  compareRoyaltyInfo,
  calculateVoucherExpiry,
  applyPercentage,
} = require("../util/utils");
const {
  mockOffer,
  mockExchange,
  mockVoucher,
  mockBuyer,
  mockSeller,
  mockCondition,
  mockAuthToken,
  mockVoucherInitValues,
  mockTwin,
} = require("../util/mock");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens.js");
const { getStateModifyingFunctionsHashes } = require("../../scripts/util/diamond-utils.js");

const {
  deploySuite,
  populateProtocolContract,
  getProtocolContractState,
  revertState,
  getStorageLayout,
  getVoucherContractState,
  populateVoucherContract,
} = require("../util/upgrade");
const { getGenericContext } = require("./01_generic");
const { getGenericContext: getGenericContextVoucher } = require("./clients/01_generic");

const version = "2.4.0";
const { migrate } = require(`../../scripts/migrations/migrate_${version}.js`);

/**
 *  Upgrade test case - After upgrade from 2.3.0 to 2.4.0 everything is still operational
 */
describe("[@skip-on-coverage] After facet upgrade, everything is still operational", function () {
  this.timeout(1000000);
  // Common vars
  let deployer, rando, buyer, other1, other2, other3, other4, other5, other6;
  let accountHandler,
    configHandler,
    exchangeHandler,
    twinHandler,
    offerHandler,
    fundsHandler,
    priceDiscoveryHandler,
    sequentialCommitHandler,
    disputeHandler,
    orchestrationHandler,
    groupHandler,
    metaTransactionsHandler;
  let snapshot;
  let protocolDiamondAddress, mockContracts;
  let contractsAfter;
  let protocolContractStateBefore, protocolContractStateAfter;
  let weth;
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
      [deployer, rando, buyer, other1, other2, other3, other4, other5, other6] = await ethers.getSigners();

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
        {
          isBefore: true,
          skipFacets: [
            "IBosonPriceDiscoveryHandler",
            "IBosonSequentialCommitHandler",
            "PriceDiscoveryHandlerFacet",
            "SequentialCommitHandlerFacet",
          ],
        }
      );

      const { offers } = preUpgradeEntities;
      for (let offerState of protocolContractStateBefore.offerContractState.offersState) {
        offerState[1]["priceType"] = PriceType.Static;
        offerState[1]["royaltyInfo"] = offers[Number(offerState[1].id) - 1].royaltyInfo;
      }

      const voucherContractState = await getVoucherContractState(preUpgradeEntitiesVoucher);

      ({ exchangeHandler, twinHandler } = contractsBefore);

      let getFunctionHashesClosure = getStateModifyingFunctionsHashes(
        ["OrchestrationHandlerFacet1", "OfferHandlerFacet", "ConfigHandlerFacet", "ExchangeHandlerFacet"],
        undefined,
        ["createSellerAnd", "createOffer", "createPremintedOffer", "setMaxRoyaltyPecentage", "commitToPreMintedOffer"]
      );

      removedFunctionHashes = await getFunctionHashesClosure();

      shell.exec(`git checkout HEAD scripts`);

      // Add WETH
      const wethFactory = await getContractFactory("WETH9");
      weth = await wethFactory.deploy();
      await weth.waitForDeployment();

      await migrate("upgrade-test", { WrappedNative: await weth.getAddress() });

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
        priceDiscoveryHandler: "IBosonPriceDiscoveryHandler",
        sequentialCommitHandler: "IBosonSequentialCommitHandler",
        disputeHandler: "IBosonDisputeHandler",
        metaTransactionsHandler: "IBosonMetaTransactionsHandler",
      };

      contractsAfter = { ...contractsBefore };

      for (const [handlerName, interfaceName] of Object.entries(newHandlers)) {
        contractsAfter[handlerName] = await ethers.getContractAt(interfaceName, protocolDiamondAddress);
      }

      ({
        accountHandler,
        configHandler,
        exchangeHandler,
        offerHandler,
        fundsHandler,
        priceDiscoveryHandler,
        sequentialCommitHandler,
        disputeHandler,
        orchestrationHandler,
        groupHandler,
        metaTransactionsHandler,
      } = contractsAfter);

      getFunctionHashesClosure = getStateModifyingFunctionsHashes(
        [
          "OrchestrationHandlerFacet1",
          "OfferHandlerFacet",
          "SellerHandlerFacet",
          "ConfigHandlerFacet",
          "PriceDiscoveryHandlerFacet",
          "SequentialCommitHandlerFacet",
          "ExchangeHandlerFacet",
        ],
        undefined,
        [
          "createSellerAnd",
          "createOffer",
          "createPremintedOffer",
          "addRoyaltyRecipients",
          "updateRoyaltyRecipients",
          "removeRoyaltyRecipients",
          "setPriceDiscoveryAddress",
          "setMaxRoyaltyPercentage",
          "onPremintedVoucherTransferred",
          "updateOfferRoyaltyRecipients",
          "updateOfferRoyaltyRecipientsBatch",
          "commitToPriceDiscoveryOffer",
          "sequentialCommitToOffer",
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
        "t_struct(Range)14256_storage": "t_struct(Range)15868_storage",
      };

      const renamedVariables = {
        _isCommitable: "_isCommittable",
        _royaltyPercentage: "_royaltyPercentageUnused",
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
          { equalCustomTypes, renamedVariables }
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
      context("ConfigHandler", async function () {
        it("setMaxRoyaltyPecentage and getMaxRoyaltyPecentage do not work anymore", async function () {
          const handle = id("setMaxRoyaltyPecentage(uint16)").slice(0, 10);
          const newRoyaltyPercentage = 123;
          const abiCoder = new ethers.AbiCoder();
          const encdata = abiCoder.encode(["uint256"], [newRoyaltyPercentage]);
          const setData = handle + encdata.slice(2);

          await expect(
            deployer.sendTransaction({ to: await configHandler.getAddress(), data: setData })
          ).to.be.revertedWith("Diamond: Function does not exist");

          const getData = id("getMaxRoyaltyPecentage").slice(0, 10);

          await expect(
            deployer.sendTransaction({ to: await configHandler.getAddress(), data: getData })
          ).to.be.revertedWith("Diamond: Function does not exist");
        });
      });

      context("Offer handler", async function () {
        it("Create offer accepts fee limit", async function () {
          const seller = preUpgradeEntities.sellers[0];
          const assistant = seller.wallet;
          const { offer, offerDates, offerDurations } = await mockOffer({ refreshModule: true });

          const offerFeeLimit = MaxUint256; // unlimited offer fee to not affect the tests
          const disputeResolverId = preUpgradeEntities.DRs[1].id;
          const agentId = "0";
          offer.royaltyInfo[0].bps = [seller.voucherInitValues.royaltyPercentage];

          // Create the offer, test for the event
          await expect(
            offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId, offerFeeLimit)
          ).to.emit(offerHandler, "OfferCreated");
        });

        it("Old create offer does not work anymore", async function () {
          const inputDataType = [
            "tuple(uint256,uint256,uint256,uint256,uint256,uint256,address,uint8,string,string,bool,uint256)",
            "tuple(uint256,uint256,uint256,uint256)",
            "tuple(uint256,uint256,uint256)",
            "uint256",
            "uint256",
          ];
          const functionName = `createOffer(${inputDataType.join(",").replaceAll("tuple", "")})`;
          const functionSelector = id(functionName).slice(0, 10);

          const seller = preUpgradeEntities.sellers[0];
          const assistant = seller.wallet;
          const { offer, offerDates, offerDurations } = await mockOffer({ refreshModule: true });

          const disputeResolverId = preUpgradeEntities.DRs[1].id;
          const agentId = "0";

          const abiCoder = new ethers.AbiCoder();
          const encdata = abiCoder.encode(inputDataType, [
            offer.toStruct().slice(0, -1),
            offerDates.toStruct(),
            offerDurations.toStruct(),
            disputeResolverId,
            agentId,
          ]);
          const data = functionSelector + encdata.slice(2);

          // Try to create offer with old inputs, expect revert
          await expect(
            assistant.sendTransaction({ to: await offerHandler.getAddress(), data: data })
          ).to.be.revertedWith("Diamond: Function does not exist");
        });
      });

      context("Orchestration handler", async function () {
        let seller, assistant, offer, offerDates, offerDurations, disputeResolverId, agentId, offerFeeLimit;

        beforeEach(async function () {
          assistant = preUpgradeEntities.sellers[0].wallet;
          ({ offer, offerDates, offerDurations } = await mockOffer({ refreshModule: true }));

          offerFeeLimit = MaxUint256; // unlimited offer fee to not affect the tests
          disputeResolverId = preUpgradeEntities.DRs[1].id;
          agentId = "0";
        });

        context("new seller", async function () {
          let emptyAuthToken, voucherInitValues;
          beforeEach(async function () {
            assistant = rando;
            seller = mockSeller(
              await assistant.getAddress(),
              await assistant.getAddress(),
              ZeroAddress,
              await assistant.getAddress()
            );

            emptyAuthToken = mockAuthToken();
            voucherInitValues = mockVoucherInitValues();
          });

          it("createSellerAndOffer", async function () {
            // Create a seller and an offer, testing for the event
            await expect(
              orchestrationHandler
                .connect(assistant)
                .createSellerAndOffer(
                  seller,
                  offer,
                  offerDates,
                  offerDurations,
                  disputeResolverId,
                  emptyAuthToken,
                  voucherInitValues,
                  agentId,
                  offerFeeLimit
                )
            ).to.emit(orchestrationHandler, "OfferCreated");
          });

          it("createSellerAndOfferWithCondition", async function () {
            const condition = mockCondition({
              tokenAddress: await other2.getAddress(),
              tokenType: TokenType.MultiToken,
              method: EvaluationMethod.Threshold,
            });

            // Create a seller and an offer with condition, testing for the events
            const tx = await orchestrationHandler
              .connect(assistant)
              .createSellerAndOfferWithCondition(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolverId,
                condition,
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              );

            await expect(tx).to.emit(orchestrationHandler, "OfferCreated");
          });

          it("createSellerAndOfferAndTwinWithBundle", async function () {
            const [foreign20] = await deployMockTokens(["Foreign20"]);
            const twin = mockTwin(await foreign20.getAddress());

            await foreign20.connect(assistant).mint(assistant.address, 100);
            await foreign20.connect(assistant).approve(await twinHandler.getAddress(), 1); // approving the twin handler

            // Create a seller, an offer with condition and a twin with bundle, testing for the events
            const tx = await orchestrationHandler
              .connect(assistant)
              .createSellerAndOfferAndTwinWithBundle(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolverId,
                twin,
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              );

            await expect(tx).to.emit(orchestrationHandler, "OfferCreated");
          });

          it("createSellerAndOfferWithConditionAndTwinAndBundle", async function () {
            const [foreign20] = await deployMockTokens(["Foreign20"]);
            const twin = mockTwin(await foreign20.getAddress());

            await foreign20.connect(assistant).mint(assistant.address, 100);
            await foreign20.connect(assistant).approve(await twinHandler.getAddress(), 1); // approving the twin handler

            const condition = mockCondition({
              tokenAddress: await other2.getAddress(),
              tokenType: TokenType.MultiToken,
              method: EvaluationMethod.Threshold,
            });

            // Create a seller, an offer with condition, twin and bundle
            const tx = await orchestrationHandler
              .connect(assistant)
              .createSellerAndOfferWithConditionAndTwinAndBundle(
                seller,
                offer,
                offerDates,
                offerDurations,
                disputeResolverId,
                condition,
                twin,
                emptyAuthToken,
                voucherInitValues,
                agentId,
                offerFeeLimit
              );

            await expect(tx).to.emit(orchestrationHandler, "OfferCreated");
          });
        });

        context("existing seller", async function () {
          let sellerMeta;
          beforeEach(async function () {
            sellerMeta = preUpgradeEntities.sellers[0];
            seller = sellerMeta.seller;
            assistant = sellerMeta.wallet;

            offer.royaltyInfo[0].bps = [sellerMeta.voucherInitValues.royaltyPercentage];
          });

          it("createOfferWithCondition", async function () {
            const condition = mockCondition({
              tokenAddress: await other2.getAddress(),
              tokenType: TokenType.MultiToken,
              method: EvaluationMethod.Threshold,
            });

            // Create an offer with condition, testing for the events
            const tx = await orchestrationHandler
              .connect(assistant)
              .createOfferWithCondition(
                offer,
                offerDates,
                offerDurations,
                disputeResolverId,
                condition,
                agentId,
                offerFeeLimit
              );

            // OfferCreated event
            await expect(tx).to.emit(orchestrationHandler, "OfferCreated");
          });

          it("createOfferAddToGroup", async function () {
            const condition = mockCondition({
              tokenType: TokenType.MultiToken,
              tokenAddress: await other2.getAddress(),
              method: EvaluationMethod.Threshold,
              maxCommits: "3",
            });

            const nextGroupId = await groupHandler.getNextGroupId();

            // Create an offer and add it to a group
            await orchestrationHandler
              .connect(assistant)
              .createOfferWithCondition(
                offer,
                offerDates,
                offerDurations,
                disputeResolverId,
                condition,
                agentId,
                offerFeeLimit
              );

            // Create an offer, add it to the existing group, testing for the events
            const tx = await orchestrationHandler
              .connect(assistant)
              .createOfferAddToGroup(
                offer,
                offerDates,
                offerDurations,
                disputeResolverId,
                nextGroupId,
                agentId,
                offerFeeLimit
              );

            // OfferCreated event
            await expect(tx).to.emit(orchestrationHandler, "OfferCreated");
          });

          it("createOfferAndTwinWithBundle", async function () {
            const [foreign20] = await deployMockTokens(["Foreign20"]);
            const twin = mockTwin(await foreign20.getAddress());

            await foreign20.connect(assistant).mint(assistant.address, 100);
            await foreign20.connect(assistant).approve(await twinHandler.getAddress(), 1); // approving the twin handler

            // Create an offer, a twin and a bundle, testing for the events
            const tx = await orchestrationHandler
              .connect(assistant)
              .createOfferAndTwinWithBundle(
                offer,
                offerDates,
                offerDurations,
                disputeResolverId,
                twin,
                agentId,
                offerFeeLimit
              );

            // OfferCreated event
            await expect(tx).to.emit(orchestrationHandler, "OfferCreated");
          });

          it("createOfferWithConditionAndTwinAndBundle", async function () {
            const [foreign20] = await deployMockTokens(["Foreign20"]);
            const twin = mockTwin(await foreign20.getAddress());

            await foreign20.connect(assistant).mint(assistant.address, 100);
            await foreign20.connect(assistant).approve(await twinHandler.getAddress(), 1); // approving the twin handler

            const condition = mockCondition({
              tokenAddress: await other2.getAddress(),
              tokenType: TokenType.MultiToken,
              method: EvaluationMethod.Threshold,
            });

            // Create an offer with condition, twin and bundle
            const tx = await orchestrationHandler
              .connect(assistant)
              .createOfferWithConditionAndTwinAndBundle(
                offer,
                offerDates,
                offerDurations,
                disputeResolverId,
                condition,
                twin,
                agentId,
                offerFeeLimit
              );

            // OfferCreated event
            await expect(tx).to.emit(orchestrationHandler, "OfferCreated");
          });
        });
      });

      context("Funds handler", async function () {
        context("release funds for pre-upgrade exchange works normally", async function () {
          // not a breaking change, but it's a good test to see if the upgrade was successful
          it("COMPLETED", async function () {
            // same as expired/retracted
            // seller: price + deposit, buyer: 0, protocol: fee, agent: fee
            const exchangeId = 2; // redeemed already
            const exchangeMeta = preUpgradeEntities.exchanges[exchangeId - 1];
            const { wallet: buyer } = preUpgradeEntities.buyers[exchangeMeta.buyerIndex];
            const { seller } = preUpgradeEntities.sellers.find((s) => s.id == exchangeMeta.sellerId);
            const { offer, agentId } = preUpgradeEntities.offers.find((o) => o.offer.id == exchangeMeta.offerId);
            const { agent } = preUpgradeEntities.agents.find((a) => a.id == agentId);

            const protocolFeePercent = await configHandler.getProtocolFeePercentage();
            const protocolPayoff = applyPercentage(offer.price, protocolFeePercent);
            const agentPayoff = applyPercentage(offer.price, agent.feePercentage);
            const sellerPayoff =
              BigInt(offer.price) - BigInt(protocolPayoff) + BigInt(offer.sellerDeposit) - BigInt(agentPayoff);
            // Complete the exchange, expecting event
            const tx = await exchangeHandler.connect(buyer).completeExchange(exchangeId);

            await expect(tx)
              .to.emit(exchangeHandler, "FundsReleased")
              .withArgs(exchangeId, seller.id, offer.exchangeToken, sellerPayoff, buyer.address);

            await expect(tx)
              .to.emit(exchangeHandler, "FundsReleased")
              .withArgs(exchangeId, agent.id, offer.exchangeToken, agentPayoff, buyer.address);

            await expect(tx)
              .to.emit(exchangeHandler, "ProtocolFeeCollected")
              .withArgs(exchangeId, offer.exchangeToken, protocolPayoff, buyer.address);
          });

          it("REVOKED", async function () {
            // seller: 0, buyer: price + seller deposit, protocol: 0, agent: 0
            const exchangeId = 1; // committed only
            const exchangeMeta = preUpgradeEntities.exchanges[exchangeId - 1];
            const { id: buyerId } = preUpgradeEntities.buyers[exchangeMeta.buyerIndex];
            const { offer } = preUpgradeEntities.offers.find((o) => o.offer.id == exchangeMeta.offerId);
            const { wallet: assistant } = preUpgradeEntities.sellers.find((s) => s.id == exchangeMeta.sellerId);

            const buyerPayoff = BigInt(offer.price) + BigInt(offer.sellerDeposit);

            // Revoke the voucher, expecting event
            const tx = await exchangeHandler.connect(assistant).revokeVoucher(exchangeId);

            await expect(tx)
              .to.emit(exchangeHandler, "FundsReleased")
              .withArgs(exchangeId, buyerId, offer.exchangeToken, buyerPayoff, assistant.address);

            await expect(tx).to.not.emit(exchangeHandler, "ProtocolFeeCollected");
          });

          it("CANCELED", async function () {
            // seller: buyer cancel penalty + seller deposit, buyer: price - buyer cancel penalty, protocol: 0, agent: 0
            const exchangeId = 1; // committed only
            const exchangeMeta = preUpgradeEntities.exchanges[exchangeId - 1];
            const { wallet: buyer, id: buyerId } = preUpgradeEntities.buyers[exchangeMeta.buyerIndex];
            const { seller } = preUpgradeEntities.sellers.find((s) => s.id == exchangeMeta.sellerId);
            const { offer } = preUpgradeEntities.offers.find((o) => o.offer.id == exchangeMeta.offerId);

            const sellerPayoff = BigInt(offer.buyerCancelPenalty) + BigInt(offer.sellerDeposit);
            const buyerPayoff = BigInt(offer.price) - BigInt(offer.buyerCancelPenalty);

            // Cancel the voucher, expecting event
            const tx = await exchangeHandler.connect(buyer).cancelVoucher(exchangeId);

            await expect(tx)
              .to.emit(exchangeHandler, "FundsReleased")
              .withArgs(exchangeId, seller.id, offer.exchangeToken, sellerPayoff, buyer.address);

            await expect(tx)
              .to.emit(exchangeHandler, "FundsReleased")
              .withArgs(exchangeId, buyerId, offer.exchangeToken, buyerPayoff, buyer.address);

            await expect(tx).to.not.emit(exchangeHandler, "ProtocolFeeCollected");
          });

          it("DECIDED", async function () {
            // same as resolved
            // seller: (price + deposit)*(1-buyerPercent), buyer: (price + deposit)*buyerPercent, protocol: 0, agent: 0
            const exchangeId = 5; // disputed already
            const exchangeMeta = preUpgradeEntities.exchanges[exchangeId - 1];
            const { id: buyerId, wallet: buyer } = preUpgradeEntities.buyers[exchangeMeta.buyerIndex];
            const { seller } = preUpgradeEntities.sellers.find((s) => s.id == exchangeMeta.sellerId);
            const { offer, disputeResolverId } = preUpgradeEntities.offers.find(
              (o) => o.offer.id == exchangeMeta.offerId
            );
            const { wallet: assistantDR } = preUpgradeEntities.DRs.find((d) => d.id == disputeResolverId);

            const buyerPercent = 1234;
            const pot = BigInt(offer.price) + BigInt(offer.sellerDeposit);
            const buyerPayoff = applyPercentage(pot, buyerPercent);
            const sellerPayoff = pot - BigInt(buyerPayoff);

            // escalate dispute, so DR can resolve it
            await disputeHandler.connect(buyer).escalateDispute(exchangeId);

            // Decide the exchange, expecting event
            const tx = await disputeHandler.connect(assistantDR).decideDispute(exchangeId, buyerPercent);

            await expect(tx)
              .to.emit(exchangeHandler, "FundsReleased")
              .withArgs(exchangeId, seller.id, offer.exchangeToken, sellerPayoff, assistantDR.address);

            await expect(tx)
              .to.emit(exchangeHandler, "FundsReleased")
              .withArgs(exchangeId, buyerId, offer.exchangeToken, buyerPayoff, assistantDR.address);

            await expect(tx).to.not.emit(exchangeHandler, "ProtocolFeeCollected");
          });
        });
      });

      context("MetaTransactionHandler", async function () {
        it("Function hashes from removedFunctionsHashes list should not be allowlisted", async function () {
          for (const hash of removedFunctionHashes) {
            // get function name from hash
            const isAllowed = await metaTransactionsHandler["isFunctionAllowlisted(bytes32)"](hash);
            expect(isAllowed).to.be.false;
          }
        });

        it("Function hashes from from addedFunctionsHashes list should be allowlisted", async function () {
          for (const hash of addedFunctionHashes) {
            const isAllowed = await metaTransactionsHandler["isFunctionAllowlisted(bytes32)"](hash);
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

    context("New methods", async function () {
      context("Config handler facet", async function () {
        it("setMaxRoyaltyPercentage replaces setMaxRoyaltyPecentage)", async function () {
          const newRoyaltyPercentage = 123;

          await configHandler.setMaxRoyaltyPercentage(newRoyaltyPercentage);

          const royaltyPercentage = await configHandler.getMaxRoyaltyPercentage();

          expect(royaltyPercentage).to.equal(newRoyaltyPercentage);
        });
      });

      context("Exchange handler facet", async function () {
        it("getEIP2981Royalties", async function () {
          const sellers = preUpgradeEntities.sellers;
          for (const offer of preUpgradeEntities.offers) {
            const seller = sellers.find((s) => s.id == offer.offer.creatorId);

            const [returnedReceiver, returnedRoyaltyPercentage] = await exchangeHandler.getEIP2981Royalties(
              offer.offer.id,
              false
            );

            expect(returnedReceiver).to.equal(seller.wallet.address, `Receiver for offer ${offer.id} is not correct`);
            expect(returnedRoyaltyPercentage).to.equal(
              offer.royaltyInfo[0].bps[0],
              `Percentage for offer ${offer.id} is not correct`
            );
            expect(returnedRoyaltyPercentage).to.equal(
              seller.voucherInitValues.royaltyPercentage,
              `Percentage for offer ${offer.id} is not correct`
            );
          }

          for (const exchange of preUpgradeEntities.exchanges) {
            const seller = sellers.find((s) => s.id == exchange.sellerId);
            const [returnedReceiver, returnedRoyaltyPercentage] = await exchangeHandler.getEIP2981Royalties(
              exchange.exchangeId,
              true
            );
            expect(returnedReceiver).to.equal(
              seller.wallet.address,
              `Receiver for exchange ${exchange.exchangeId} is not correct`
            );
            expect(returnedRoyaltyPercentage).to.equal(
              seller.voucherInitValues.royaltyPercentage,
              `Percentage for exchange ${exchange.exchangeId} is not correct`
            );
          }
        });

        it("getRoyalties", async function () {
          const sellers = preUpgradeEntities.sellers;
          for (const offer of preUpgradeEntities.offers) {
            const seller = sellers.find((s) => s.id == offer.offer.creatorId);

            const queryId = deriveTokenId(offer.offer.id, "999"); // some exchange id that does not exist. Simulates the preminted offer
            const [returnedReceiver, returnedRoyaltyPercentage] = await exchangeHandler.getRoyalties(queryId);

            expect(returnedReceiver).to.deep.equal(
              [seller.wallet.address],
              `Receiver for offer ${offer.offer.id} is not correct`
            );
            expect(returnedRoyaltyPercentage).to.deep.equal(
              offer.royaltyInfo[0].bps,
              `Percentage for offer ${offer.id} is not correct`
            );
            expect(returnedRoyaltyPercentage).to.deep.equal(
              [seller.voucherInitValues.royaltyPercentage],
              `Percentage for offer ${offer.id} is not correct`
            );
          }

          for (const exchange of preUpgradeEntities.exchanges) {
            const seller = sellers.find((s) => s.id == exchange.sellerId);
            const queryId = exchange.exchangeId;

            // test with token id
            const [returnedReceiver, returnedRoyaltyPercentage] = await exchangeHandler.getRoyalties(queryId);
            expect(returnedReceiver).to.deep.equal(
              [seller.wallet.address],
              `Receiver for exchange ${exchange.exchangeId} is not correct`
            );
            expect(returnedRoyaltyPercentage).to.deep.equal(
              [seller.voucherInitValues.royaltyPercentage],
              `Percentage for exchange ${exchange.exchangeId} is not correct`
            );
          }
        });
      });

      context("Seller handler facet", async function () {
        let admin, sellerId, sellerRoyalties;
        let royaltyRecipientInfoList;

        context("Royalty recipients", async function () {
          beforeEach(async function () {
            const seller = preUpgradeEntities.sellers[0];
            admin = seller.wallet;
            sellerId = seller.id;
            sellerRoyalties = seller.voucherInitValues.royaltyPercentage;

            royaltyRecipientInfoList = new RoyaltyRecipientInfoList([
              new RoyaltyRecipientInfo(other1.address, "100"),
              new RoyaltyRecipientInfo(other2.address, "200"),
              new RoyaltyRecipientInfo(other3.address, "300"),
            ]);
          });

          it("Add royalty recipients", async function () {
            const expectedRoyaltyRecipientInfoList = new RoyaltyRecipientInfoList([
              new RoyaltyRecipientInfo(ZeroAddress, sellerRoyalties),
              ...royaltyRecipientInfoList.royaltyRecipientInfos,
            ]);

            // Add royalty recipients
            const tx = await accountHandler
              .connect(admin)
              .addRoyaltyRecipients(sellerId, royaltyRecipientInfoList.toStruct());

            const event = getEvent(await tx.wait(), accountHandler, "RoyaltyRecipientsChanged");

            const returnedRecipientList = RoyaltyRecipientInfoList.fromStruct(event.royaltyRecipients);

            expect(event.sellerId).to.equal(sellerId);
            expect(event.executedBy).to.equal(admin.address);
            expect(returnedRecipientList).to.deep.equal(expectedRoyaltyRecipientInfoList);
          });

          it("Update royalty recipients", async function () {
            // Add royalty recipients
            await accountHandler.connect(admin).addRoyaltyRecipients(sellerId, royaltyRecipientInfoList.toStruct());

            // update data
            const royaltyRecipientInfoIds = [1, 0, 3];
            const royaltyRecipientInfoListUpdates = new RoyaltyRecipientInfoList([
              new RoyaltyRecipientInfo(other4.address, "400"), // change address and percentage, keep name
              new RoyaltyRecipientInfo(ZeroAddress, "150"), // change percentage of default recipient
              new RoyaltyRecipientInfo(other3.address, "300"), // change nothing
            ]);

            const expectedRoyaltyRecipientInfoList = new RoyaltyRecipientInfoList([
              new RoyaltyRecipientInfo(ZeroAddress, "150"),
              new RoyaltyRecipientInfo(other4.address, "400"),
              new RoyaltyRecipientInfo(other2.address, "200"),
              new RoyaltyRecipientInfo(other3.address, "300"),
            ]);

            // Update royalty recipients
            const tx = await accountHandler
              .connect(admin)
              .updateRoyaltyRecipients(sellerId, royaltyRecipientInfoIds, royaltyRecipientInfoListUpdates.toStruct());

            const event = getEvent(await tx.wait(), accountHandler, "RoyaltyRecipientsChanged");

            const returnedRecipientList = RoyaltyRecipientInfoList.fromStruct(event.royaltyRecipients);

            expect(event.sellerId).to.equal(sellerId);
            expect(event.executedBy).to.equal(admin.address);
            expect(returnedRecipientList).to.deep.equal(expectedRoyaltyRecipientInfoList);
          });

          it("Remove royalty recipients", async function () {
            royaltyRecipientInfoList = new RoyaltyRecipientInfoList([
              ...royaltyRecipientInfoList.royaltyRecipientInfos,
              new RoyaltyRecipientInfo(other4.address, "400"),
              new RoyaltyRecipientInfo(other5.address, "500"),
              new RoyaltyRecipientInfo(other6.address, "600"),
            ]);
            // add first set of royalty recipients
            await accountHandler.connect(admin).addRoyaltyRecipients(sellerId, royaltyRecipientInfoList.toStruct());

            // ids to remove
            const royaltyRecipientInfoIds = [1, 3, 4, 6];

            // Removal process: [0,1,2,3,4,5,6]->[0,1,2,3,4,5]->[0,1,2,3,5]->[0,1,2,5]->[0,5,2]
            const expectedRoyaltyRecipientInfoList = new RoyaltyRecipientInfoList([
              new RoyaltyRecipientInfo(ZeroAddress, sellerRoyalties), // default
              royaltyRecipientInfoList.royaltyRecipientInfos[4],
              royaltyRecipientInfoList.royaltyRecipientInfos[1],
            ]);

            // Remove royalty recipients
            const tx = await accountHandler.connect(admin).removeRoyaltyRecipients(sellerId, royaltyRecipientInfoIds);

            const event = getEvent(await tx.wait(), accountHandler, "RoyaltyRecipientsChanged");

            const returnedRecipientList = RoyaltyRecipientInfoList.fromStruct(event.royaltyRecipients);

            expect(event.sellerId).to.equal(sellerId);
            expect(event.executedBy).to.equal(admin.address);
            expect(returnedRecipientList).to.deep.equal(expectedRoyaltyRecipientInfoList);
          });
        });

        it("getSellersCollectionsPaginated()", async function () {
          const seller = preUpgradeEntities.sellers[0];
          const expectedDefaultAddress = seller.voucherContractAddress;
          const voucherInitValues = seller.voucherInitValues;
          const beaconProxyAddress = await configHandler.getBeaconProxyAddress();

          const additionalCollections = new CollectionList([]);
          for (let i = 1; i <= 5; i++) {
            const externalId = `Brand${i}`;
            voucherInitValues.collectionSalt = encodeBytes32String(externalId);
            const expectedCollectionAddress = calculateCloneAddress(
              await accountHandler.getAddress(),
              beaconProxyAddress,
              seller.wallet.address,
              voucherInitValues.collectionSalt
            );
            voucherInitValues.contractURI = `https://brand${i}.com`;

            // Create a new collection
            await accountHandler.connect(seller.wallet).createNewCollection(externalId, voucherInitValues);

            // Add to expected collections
            additionalCollections.collections.push(new Collection(expectedCollectionAddress, externalId));
          }

          const limit = 3;
          const offset = 1;

          const expectedCollections = new CollectionList(
            additionalCollections.collections.slice(offset, offset + limit)
          );

          const [defaultVoucherAddress, collections] = await accountHandler
            .connect(rando)
            .getSellersCollectionsPaginated(seller.id, limit, offset);
          const returnedCollections = CollectionList.fromStruct(collections);

          expect(defaultVoucherAddress).to.equal(expectedDefaultAddress, "Wrong default voucher address");
          expect(returnedCollections).to.deep.equal(expectedCollections, "Wrong additional collections");
        });
      });

      context("Offer handler facet", async function () {
        let seller, admin, assistant;
        let newRoyaltyInfo, expectedRoyaltyInfo;

        context("Royalty recipients", async function () {
          beforeEach(async function () {
            seller = preUpgradeEntities.sellers[0];
            assistant = admin = seller.wallet;

            // Register royalty recipients
            const royaltyRecipientList = new RoyaltyRecipientInfoList([
              new RoyaltyRecipientInfo(other1.address, "50"),
              new RoyaltyRecipientInfo(other2.address, "50"),
              new RoyaltyRecipientInfo(rando.address, "50"),
            ]);

            await accountHandler.connect(admin).addRoyaltyRecipients(seller.id, royaltyRecipientList.toStruct());

            const recipients = [other1.address, other2.address, ZeroAddress, rando.address];
            const bps = ["100", "150", "500", "200"];
            newRoyaltyInfo = new RoyaltyInfo(recipients, bps);

            const expectedRecipients = [...recipients];
            expectedRecipients[2] = seller.wallet.address;
            expectedRoyaltyInfo = new RoyaltyInfo(recipients, bps).toStruct();
          });

          it("Update offer royalty recipients", async function () {
            const offerId = seller.offerIds[0];

            // Update the royalty recipients, testing for the event
            await expect(offerHandler.connect(assistant).updateOfferRoyaltyRecipients(offerId, newRoyaltyInfo))
              .to.emit(offerHandler, "OfferRoyaltyInfoUpdated")
              .withArgs(offerId, seller.id, compareRoyaltyInfo.bind(expectedRoyaltyInfo), assistant.address);
          });

          it("Update offer royalty recipients batch", async function () {
            const offersToUpdate = seller.offerIds;

            // Update the royalty info, testing for the event
            const tx = await offerHandler
              .connect(assistant)
              .updateOfferRoyaltyRecipientsBatch(offersToUpdate, newRoyaltyInfo);
            await expect(tx)
              .to.emit(offerHandler, "OfferRoyaltyInfoUpdated")
              .withArgs(offersToUpdate[0], seller.id, compareRoyaltyInfo.bind(expectedRoyaltyInfo), assistant.address);

            await expect(tx)
              .to.emit(offerHandler, "OfferRoyaltyInfoUpdated")
              .withArgs(offersToUpdate[1], seller.id, compareRoyaltyInfo.bind(expectedRoyaltyInfo), assistant.address);

            await expect(tx)
              .to.emit(offerHandler, "OfferRoyaltyInfoUpdated")
              .withArgs(offersToUpdate[2], seller.id, compareRoyaltyInfo.bind(expectedRoyaltyInfo), assistant.address);
          });
        });
      });

      context("Price discovery handler facet", async function () {
        it("Commit to price discovery offer", async function () {
          // Deploy PriceDiscovery contract
          const PriceDiscoveryFactory = await getContractFactory("PriceDiscoveryMock");
          const priceDiscoveryContract = await PriceDiscoveryFactory.deploy();
          await priceDiscoveryContract.waitForDeployment();

          const seller = preUpgradeEntities.sellers[0];
          const assistant = seller.wallet;

          const mo = await mockOffer({ refreshModule: true });
          const { offer, offerDates, offerDurations } = mo;
          offer.id = await offerHandler.getNextOfferId();
          offer.priceType = PriceType.Discovery;
          offer.price = "0";
          offer.buyerCancelPenalty = "0";
          offer.royaltyInfo[0].bps = [seller.voucherInitValues.royaltyPercentage];
          const offerFeeLimit = MaxUint256; // unlimited offer fee to not affect the tests
          const disputeResolverId = preUpgradeEntities.DRs[1].id;
          const agentId = "0";

          // Mock exchange
          const exchange = mockExchange({
            id: await exchangeHandler.getNextExchangeId(),
            offerId: offer.id,
            finalizedDate: "0",
          });

          // Create the offer, reserve range and premint vouchers
          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId, offerFeeLimit);
          await offerHandler.connect(assistant).reserveRange(offer.id, offer.quantityAvailable, assistant.address);
          const bosonVoucher = await getContractAt("BosonVoucher", seller.voucherContractAddress);
          await bosonVoucher.connect(assistant).preMint(offer.id, offer.quantityAvailable);

          // Deposit seller funds so the commit will succeed
          const sellerPool = offer.sellerDeposit;
          await fundsHandler.connect(assistant).depositFunds(seller.id, ZeroAddress, sellerPool, { value: sellerPool });

          // Price on secondary market
          const price = 100n;
          const tokenId = deriveTokenId(offer.id, exchange.id);

          // Prepare calldata for PriceDiscovery contract
          const order = {
            seller: assistant.address,
            buyer: buyer.address,
            voucherContract: seller.voucherContractAddress,
            tokenId: tokenId,
            exchangeToken: await weth.getAddress(), // when offer is in native, we need to use wrapped native
            price: price,
          };

          const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilBuyOrder", [order]);
          const priceDiscoveryContractAddress = await priceDiscoveryContract.getAddress();

          const priceDiscovery = new PriceDiscovery(
            price,
            Side.Ask,
            priceDiscoveryContractAddress,
            priceDiscoveryContractAddress,
            priceDiscoveryData
          );

          // Approve transfers
          // Buyer needs to approve the protocol to transfer the ETH
          await weth.connect(buyer).deposit({ value: price });
          await weth.connect(buyer).approve(await priceDiscoveryHandler.getAddress(), price);

          // Seller approves price discovery to transfer the voucher
          await bosonVoucher.connect(assistant).setApprovalForAll(await priceDiscoveryContract.getAddress(), true);

          // Seller also approves the protocol to encumber the paid price
          await weth.connect(assistant).approve(await priceDiscoveryHandler.getAddress(), price);

          const newBuyer = mockBuyer(buyer.address);
          newBuyer.id = await accountHandler.getNextAccountId();
          exchange.comitter = newBuyer.id;

          const tx = await priceDiscoveryHandler
            .connect(buyer)
            .commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery);

          // Get the block timestamp of the confirmed tx
          const block = await provider.getBlock(tx.blockNumber);

          // Update the committed date in the expected exchange struct with the block timestamp of the tx
          const voucher = mockVoucher({
            committedDate: block.timestamp.toString(),
            validUntilDate: calculateVoucherExpiry(
              block,
              offerDates.voucherRedeemableFrom,
              offerDurations.voucherValid
            ),
            redeemedDate: "0",
          });

          await expect(tx)
            .to.emit(priceDiscoveryHandler, "BuyerCommitted")
            .withArgs(
              offer.id,
              newBuyer.id,
              exchange.id,
              exchange.toStruct(),
              voucher.toStruct(),
              seller.voucherContractAddress
            );
        });
      });

      context("Sequential commit handler facet", async function () {
        it("Sequential Commit to offer", async function () {
          // Deploy PriceDiscovery contract
          const PriceDiscoveryFactory = await getContractFactory("PriceDiscoveryMock");
          const priceDiscoveryContract = await PriceDiscoveryFactory.deploy();
          await priceDiscoveryContract.waitForDeployment();

          // Create buyer with price discovery client address to not mess up ids in tests
          const priceDiscoveryClientAddress = await configHandler.getPriceDiscoveryAddress();
          await accountHandler.createBuyer(mockBuyer(priceDiscoveryClientAddress));

          const exchangeMeta = preUpgradeEntities.exchanges[0];
          const { offer } = preUpgradeEntities.offers[exchangeMeta.offerId - 1];
          const seller = preUpgradeEntities.sellers.find((s) => s.id == exchangeMeta.sellerId);

          const exchange = mockExchange({
            id: exchangeMeta.exchangeId,
            offerId: offer.id,
            finalizedDate: "0",
          });

          const bosonVoucher = await getContractAt("BosonVoucher", seller.voucherContractAddress);

          const price = offer.price;
          const price2 = (BigInt(price) * 11n) / 10n; // 10% above the original price
          const tokenId = deriveTokenId(exchangeMeta.offerId, exchangeMeta.exchangeId);

          const reseller = preUpgradeEntities.buyers[exchangeMeta.buyerIndex].wallet;

          // Prepare calldata for PriceDiscovery contract
          const order = {
            seller: reseller.address,
            buyer: buyer.address,
            voucherContract: seller.voucherContractAddress,
            tokenId: tokenId,
            exchangeToken: offer.exchangeToken == ZeroAddress ? await weth.getAddress() : offer.exchangeToken, // when offer is in native, we need to use wrapped native
            price: price2,
          };

          const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilBuyOrder", [order]);
          const priceDiscoveryContractAddress = await priceDiscoveryContract.getAddress();

          const priceDiscovery = new PriceDiscovery(
            price2,
            Side.Ask,
            priceDiscoveryContractAddress,
            priceDiscoveryContractAddress,
            priceDiscoveryData
          );

          const exchangeToken = await getContractAt(
            "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
            order.exchangeToken
          );

          // Approve transfers
          // Buyer needs to approve the protocol to transfer the exchange token
          if (offer.exchangeToken == ZeroAddress) {
            await weth.connect(buyer).deposit({ value: price2 });
          } else {
            await exchangeToken.connect(buyer).mint(buyer.address, price2);
          }
          await exchangeToken.connect(buyer).approve(await sequentialCommitHandler.getAddress(), price2);

          // Seller approves price discovery to transfer the voucher
          await bosonVoucher.connect(reseller).setApprovalForAll(await priceDiscoveryContract.getAddress(), true);

          // Seller also approves the protocol to encumber the paid price
          await exchangeToken.connect(reseller).approve(await sequentialCommitHandler.getAddress(), price2);

          const newBuyer = mockBuyer(buyer.address);
          newBuyer.id = await accountHandler.getNextAccountId();
          exchange.comitter = newBuyer.id;

          // Get voucher info before the approval. Sequential commit should not change it
          const [, , returnedVoucher] = await exchangeHandler.getExchange(exchange.id);
          const voucher = Voucher.fromStruct(returnedVoucher);

          // Sequential commit to offer, retrieving the event
          const tx = await sequentialCommitHandler
            .connect(buyer)
            .sequentialCommitToOffer(buyer.address, tokenId, priceDiscovery);

          await expect(tx)
            .to.emit(sequentialCommitHandler, "BuyerCommitted")
            .withArgs(
              exchange.offerId,
              newBuyer.id,
              exchange.id,
              exchange.toStruct(),
              voucher.toStruct(),
              buyer.address
            );
        });
      });

      context("Boson voucher", async function () {
        it("royalty info", async function () {
          for (const exchange of preUpgradeEntities.exchanges) {
            const seller = preUpgradeEntities.sellers.find((s) => s.id == exchange.sellerId);
            const bosonVoucher = await getContractAt("BosonVoucher", seller.voucherContractAddress);

            const [, state] = await exchangeHandler.getExchangeState(exchange.exchangeId);

            const tokenId = deriveTokenId(exchange.offerId, exchange.exchangeId);
            const offerPrice = parseUnits("1", "ether");
            const [receiver, royaltyAmount] = await bosonVoucher.royaltyInfo(tokenId, offerPrice);

            let expectedReceiver, expectedRoyaltyAmount;
            if (state > 0n) {
              // voucher was burned
              expectedReceiver = ZeroAddress;
              expectedRoyaltyAmount = 0n;
            } else {
              expectedReceiver = seller.wallet.address;
              expectedRoyaltyAmount = applyPercentage(offerPrice, seller.voucherInitValues.royaltyPercentage);
            }

            expect(receiver).to.equal(expectedReceiver, `Receiver for exchange ${exchange.exchangeId} is not correct`);
            expect(royaltyAmount).to.equal(
              expectedRoyaltyAmount,
              `Royalty for exchange ${exchange.exchangeId} is not correct`
            );
          }
        });
      });

      context("Price discovery client", async function () {
        it("Can receive voucher only during price discovery", async function () {
          const tokenId = 1;
          const [foreign721] = await deployMockTokens(["Foreign721"]);
          await foreign721.connect(rando).mint(tokenId, 1);

          const bosonPriceDiscovery = await getContractAt(
            "BosonPriceDiscovery",
            await configHandler.getPriceDiscoveryAddress()
          );
          const bosonErrors = await getContractAt("BosonErrors", await bosonPriceDiscovery.getAddress());

          await expect(
            foreign721
              .connect(rando)
              [
                "safeTransferFrom(address,address,uint256)"
              ](rando.address, await bosonPriceDiscovery.getAddress(), tokenId)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.UNEXPECTED_ERC721_RECEIVED);
        });
      });
    });

    context("Bug fixes", async function () {
      context("Funds handler facet", async function () {
        it("FundsEncumbered event is emitted during escalate dispute", async function () {
          const exchangeId = 5; // exchange with dispute
          const exchange = preUpgradeEntities.exchanges[exchangeId - 1];
          const buyer = preUpgradeEntities.buyers[exchange.buyerIndex].wallet;

          let buyerEscalationDeposit = 0; // Currently, DRfees can only be 0

          await expect(
            disputeHandler.connect(buyer).escalateDispute(exchangeId, { value: buyerEscalationDeposit })
          ).to.emit(disputeHandler, "FundsEncumbered");
        });
      });
    });
  });
});
