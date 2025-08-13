const hre = require("hardhat");
const { ZeroAddress, getContractAt, getSigners, provider, randomBytes, keccak256, toUtf8Bytes } = hre.ethers;
const { assert, expect } = require("chai");
const DisputeResolver = require("../../scripts/domain/DisputeResolver");
const {
  mockDisputeResolver,
  mockTwin,
  mockSeller,
  mockAuthToken,
  mockVoucherInitValues,
  mockOffer,
  mockCondition,
} = require("../util/mock");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const {
  deploySuite,
  upgradeSuite,
  upgradeClients,
  populateProtocolContract,
  getProtocolContractState,
  revertState,
} = require("../util/upgrade");
const { getGenericContext } = require("./01_generic");
const TokenType = require("../../scripts/domain/TokenType");
const Twin = require("../../scripts/domain/Twin");
const { prepareDataSignature, applyPercentage, calculateContractAddress, deriveTokenId } = require("../util/utils");
const { RevertReasons } = require("../../scripts/config/revert-reasons");
const { readContracts } = require("../../scripts/util/utils.js");
const { VOUCHER_NAME, VOUCHER_SYMBOL } = require("../util/constants");

const newVersion = "2.2.0";

/**
 *  Upgrade test case - After upgrade from 2.1.0 to 2.0.0 everything is still operational
 */
describe("[@skip-on-coverage] After facet upgrade, everything is still operational", function () {
  this.timeout(1000000);
  // Common vars
  let deployer, rando, assistant;
  let accountHandler,
    metaTransactionsHandler,
    twinHandler,
    protocolInitializationHandler,
    configHandler,
    orchestrationHandler,
    disputeHandler,
    offerHandler,
    exchangeHandler;
  let snapshot;
  let protocolDiamondAddress, protocolContracts, mockContracts;
  let mockToken;

  // reference protocol state
  let protocolContractState;
  let preUpgradeEntities;

  before(async function () {
    try {
      // Make accounts available
      [deployer, rando, , assistant] = await getSigners();

      ({ protocolDiamondAddress, protocolContracts, mockContracts } = await deploySuite(deployer, newVersion));
      ({ twinHandler, disputeHandler } = protocolContracts);
      ({ mockToken: mockToken } = mockContracts);

      // Populate protocol with data
      preUpgradeEntities = await populateProtocolContract(
        deployer,
        protocolDiamondAddress,
        protocolContracts,
        mockContracts,
        true
      );

      // Get current protocol state, which serves as the reference
      // We assume that this state is a true one, relying on our unit and integration tests
      protocolContractState = await getProtocolContractState(
        protocolDiamondAddress,
        protocolContracts,
        mockContracts,
        preUpgradeEntities
      );

      // upgrade clients
      await upgradeClients(newVersion);

      // Upgrade protocol
      ({
        accountHandler,
        metaTransactionsHandler,
        protocolInitializationHandler,
        configHandler,
        orchestrationHandler,
        offerHandler,
        exchangeHandler,
      } = await upgradeSuite(
        protocolDiamondAddress,
        {
          accountHandler: "IBosonAccountHandler",
          metaTransactionsHandler: "IBosonMetaTransactionsHandler",
          protocolInitializationHandler: "IBosonProtocolInitializationHandler",
          configHandler: "IBosonConfigHandler",
          orchestrationHandler: "IBosonOrchestrationHandler",
          offerHandler: "IBosonOfferHandler",
          exchangeHandler: "IBosonExchangeHandler",
        },
        undefined,
        {
          facetsToInit: {
            ExchangeHandlerFacet: { constructorArgs: [protocolContractState.exchangeContractState.nextExchangeId] },
          },
        }
      ));

      const protocolContractsAfter = {
        ...protocolContracts,
        accountHandler,
        metaTransactionsHandler,
        protocolInitializationHandler,
        configHandler,
        offerHandler,
        exchangeHandler,
      };

      // Get protocol state after the upgrade
      const protocolContractStateAfter = await getProtocolContractState(
        protocolDiamondAddress,
        protocolContractsAfter,
        mockContracts,
        preUpgradeEntities
      );

      snapshot = await provider.send("evm_snapshot", []);

      // This context is placed in an uncommon place due to order of test execution.
      // Generic context needs values that are set in "before", however "before" is executed before tests, not before suites
      // and those values are undefined if this is placed outside "before".
      // Normally, this would be solved with mocha's --delay option, but it does not behave as expected when running with hardhat.
      context(
        "Generic tests",
        getGenericContext(
          deployer,
          protocolDiamondAddress,
          protocolContracts,
          protocolContractsAfter,
          mockContracts,
          protocolContractState,
          protocolContractStateAfter,
          preUpgradeEntities,
          snapshot
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
    // This is used so the lengthly setup (deploy+upgrade) is done only once.
    await provider.send("evm_revert", [snapshot]);
    snapshot = await provider.send("evm_snapshot", []);
  });

  after(async function () {
    revertState();
  });

  // In v2.2.0, Orchestration is split into two facets. This test makes sure that the new orchestration facet is used.
  context("Orchestration facet replacing", async function () {
    it("Diamond forwards calls to new facet", async function () {
      const selectors = [
        "0x34fa96a6", //createOfferAddToGroup
        "0x36358824", //createOfferAndTwinWithBundle
        "0x1b002277", //createOfferWithCondition
        "0x3e03b0f6", //createOfferWithConditionAndTwinAndBundle
        "0x088177c8", //createSellerAndOffer
        "0x05686244", //createSellerAndOfferAndTwinWithBundle
        "0x0b1bb608", //createSellerAndOfferWithCondition
        "0x97a6f155", //createSellerAndOfferWithConditionAndTwinAndBundle
      ];

      const { contracts } = readContracts(31337, "hardhat", "upgrade-test");
      const orchestrationHandler1 = contracts.find((i) => i.name === "OrchestrationHandlerFacet1");
      const diamondLoupe = await getContractAt("DiamondLoupeFacet", protocolDiamondAddress);

      for (const selector of selectors) {
        expect(await diamondLoupe.facetAddress(selector)).to.equal(await orchestrationHandler1.getAddress());
      }
    });
  });

  // Test actions that worked in previous version, but should not work anymore, or work differently
  // Test methods that were added to see that upgrade was succesful
  context("📋 Breaking changes, new methods and bug fixes", async function () {
    context("Breaking changes", async function () {
      it("DR can be activated on creation", async function () {
        // Get next account id
        const { nextAccountId } = protocolContractState.accountContractState;

        // DR shouldn't exist previously
        const [exist] = await accountHandler.getDisputeResolver(nextAccountId);
        expect(exist, "DR should not exist").to.be.false;

        // New DR must be created with active = true
        const DR = mockDisputeResolver(
          await rando.getAddress(),
          await rando.getAddress(),
          await rando.getAddress(),
          await rando.getAddress(),
          true,
          true
        );
        DR.id = nextAccountId.toString();

        await accountHandler.connect(rando).createDisputeResolver(DR, [], []);

        // Validate if new DR is active
        let [, DRCreated] = await accountHandler.getDisputeResolver(DR.id);
        DRCreated = DisputeResolver.fromStruct(DRCreated);
        expect(DRCreated).to.deep.equal(DR);
      });

      it("New voucher contract gets new name and symbol", async function () {
        const { sellers } = preUpgradeEntities;
        const { nextAccountId } = protocolContractState.accountContractState;

        // Create seller
        const seller = mockSeller(
          await assistant.getAddress(),
          await assistant.getAddress(),
          await assistant.getAddress(),
          await assistant.getAddress(),
          true
        );
        await accountHandler.connect(assistant).createSeller(seller, mockAuthToken(), mockVoucherInitValues());

        // Voucher contract
        const expectedCloneAddress = calculateContractAddress(
          await orchestrationHandler.getAddress(),
          sellers.length + 1
        );
        const bosonVoucher = await getContractAt("IBosonVoucher", expectedCloneAddress);

        // Validate voucher name and symbol
        expect(await bosonVoucher.name()).to.equal(
          VOUCHER_NAME + " " + nextAccountId.toString(),
          "Wrong voucher client name"
        );
        expect(await bosonVoucher.symbol()).to.equal(
          VOUCHER_SYMBOL + "_" + nextAccountId.toString(),
          "Wrong voucher client symbol"
        );
      });

      it("Operator has been renamed to assistant", async function () {
        let { accountContractState: accountContractStateAfter } = await getProtocolContractState(
          protocolDiamondAddress,
          protocolContracts,
          mockContracts,
          preUpgradeEntities
        );

        let { accountContractState } = protocolContractState;

        accountContractState.DRsState.map((state) => {
          if (state.DR.operator) {
            state.DR.assistant = state.DR.operator;
          }
          return state;
        });

        accountContractState.sellerState.map((state) => {
          if (state.seller.operator) {
            state.seller.assistant = state.seller.operator;
            delete state.seller.operator;
          }
          return state;
        });

        accountContractState.sellerByAddressState.map((state) => {
          if (state.seller.operator) {
            state.seller.assistant = state.seller.operator;
            delete state.seller.operator;
          }

          return state;
        });

        accountContractState.sellerByAuthTokenState.map((state) => {
          if (state.seller.operator) {
            state.seller.assistant = state.seller.operator;
            delete state.seller.operator;
          }
          return state;
        });

        accountContractState.DRbyAddressState.map((state) => {
          if (state.DR.operator) {
            state.DR.assistant = state.DR.operator;
            delete state.DR.operator;
          }
          return state;
        });

        assert.deepEqual(accountContractStateAfter, accountContractState);
      });

      context("Actions with the last voucher before the upgrade (tokenID=last old token id)", async function () {
        let exchange, buyerWallet, sellerWallet;
        let bosonVoucher, tokenId;

        beforeEach(async function () {
          exchange = preUpgradeEntities.exchanges[preUpgradeEntities.exchanges.length - 1];
          buyerWallet = preUpgradeEntities.buyers[exchange.buyerIndex].wallet;

          const offer = preUpgradeEntities.offers.find((o) => o.offer.id == exchange.offerId);
          const seller = preUpgradeEntities.sellers.find((s) => s.seller.id == offer.offer.creatorId);
          bosonVoucher = await getContractAt("IBosonVoucher", seller.voucherContractAddress);
          tokenId = exchange.exchangeId;
          sellerWallet = seller.wallet;
        });

        it("Redeem old voucher", async function () {
          const tx = await exchangeHandler.connect(buyerWallet).redeemVoucher(exchange.exchangeId);

          // Protocol event
          await expect(tx)
            .to.emit(exchangeHandler, "VoucherRedeemed")
            .withArgs(exchange.offerId, exchange.exchangeId, await buyerWallet.getAddress());

          // Voucher burned event
          await expect(tx)
            .to.emit(bosonVoucher, "Transfer")
            .withArgs(await buyerWallet.getAddress(), ZeroAddress, tokenId);
        });

        it("Cancel old voucher", async function () {
          const tx = await exchangeHandler.connect(buyerWallet).cancelVoucher(exchange.exchangeId);

          // Protocol event
          await expect(tx)
            .to.emit(exchangeHandler, "VoucherCanceled")
            .withArgs(exchange.offerId, exchange.exchangeId, await buyerWallet.getAddress());

          // Voucher burned event
          await expect(tx)
            .to.emit(bosonVoucher, "Transfer")
            .withArgs(await buyerWallet.getAddress(), ZeroAddress, tokenId);
        });

        it("Revoke old voucher", async function () {
          const tx = exchangeHandler.connect(sellerWallet).revokeVoucher(exchange.exchangeId);

          // Protocol event
          await expect(tx)
            .to.emit(exchangeHandler, "VoucherRevoked")
            .withArgs(exchange.offerId, exchange.exchangeId, await sellerWallet.getAddress());

          // Voucher burned event
          await expect(tx)
            .to.emit(bosonVoucher, "Transfer")
            .withArgs(await buyerWallet.getAddress(), ZeroAddress, tokenId);
        });
      });

      context("Actions with the first voucher after the upgrade (tokenID=first new token id)", async function () {
        let exchangeId, buyerWallet, offerId, tokenId, sellerWallet;
        let bosonVoucher;

        beforeEach(async function () {
          exchangeId = await exchangeHandler.getNextExchangeId();
          buyerWallet = preUpgradeEntities.buyers[0].wallet;

          let price;
          ({ id: offerId, price } = preUpgradeEntities.offers[0].offer);
          await exchangeHandler.commitToOffer(await buyerWallet.getAddress(), offerId, { value: price });

          const offer = preUpgradeEntities.offers.find((o) => o.offer.id == offerId);
          const seller = preUpgradeEntities.sellers.find((s) => s.seller.id == offer.offer.creatorId);
          bosonVoucher = await getContractAt("IBosonVoucher", seller.voucherContractAddress);
          tokenId = deriveTokenId(offerId, exchangeId);
          sellerWallet = seller.wallet;
        });

        it("Redeem new voucher", async function () {
          const tx = await exchangeHandler.connect(buyerWallet).redeemVoucher(exchangeId);

          // Protocol event
          await expect(tx)
            .to.emit(exchangeHandler, "VoucherRedeemed")
            .withArgs(offerId, exchangeId, await buyerWallet.getAddress());

          // Voucher burned event
          await expect(tx)
            .to.emit(bosonVoucher, "Transfer")
            .withArgs(await buyerWallet.getAddress(), ZeroAddress, tokenId);
        });

        it("Cancel new voucher", async function () {
          const tx = await exchangeHandler.connect(buyerWallet).cancelVoucher(exchangeId);

          // Protocol event
          await expect(tx)
            .to.emit(exchangeHandler, "VoucherCanceled")
            .withArgs(offerId, exchangeId, await buyerWallet.getAddress());

          // Voucher burned event
          await expect(tx)
            .to.emit(bosonVoucher, "Transfer")
            .withArgs(await buyerWallet.getAddress(), ZeroAddress, tokenId);
        });

        it("Revoke new voucher", async function () {
          const tx = await exchangeHandler.connect(sellerWallet).revokeVoucher(exchangeId);

          // Protocol event
          await expect(tx)
            .to.emit(exchangeHandler, "VoucherRevoked")
            .withArgs(offerId, exchangeId, await sellerWallet.getAddress());

          // Voucher burned event
          await expect(tx)
            .to.emit(bosonVoucher, "Transfer")
            .withArgs(await buyerWallet.getAddress(), ZeroAddress, tokenId);
        });
      });

      context("MetaTransactionsHandler", async function () {
        let seller, functionSignature, metaTransactionType, customTransactionType, nonce, message;

        beforeEach(async function () {
          seller = mockSeller(
            await assistant.getAddress(),
            await assistant.getAddress(),
            await assistant.getAddress(),
            await assistant.getAddress(),
            true
          );

          // Prepare the function signature for the facet function.
          functionSignature = accountHandler.interface.encodeFunctionData("createSeller", [
            seller,
            mockAuthToken(),
            mockVoucherInitValues(),
          ]);

          // Set the message Type
          metaTransactionType = [
            { name: "nonce", type: "uint256" },
            { name: "from", type: "address" },
            { name: "contractAddress", type: "address" },
            { name: "functionName", type: "string" },
            { name: "functionSignature", type: "bytes" },
          ];

          customTransactionType = {
            MetaTransaction: metaTransactionType,
          };

          nonce = parseInt(randomBytes(8));

          // Prepare the message
          message = {
            nonce,
            from: await assistant.getAddress(),
            contractAddress: await accountHandler.getAddress(),
            functionName:
              "createSeller((uint256,address,address,address,address,bool),(uint256,uint8),(string,uint256))",
            functionSignature: functionSignature,
          };
        });

        it("Meta transaction should work with allowlisted function", async function () {
          // Collect the signature components
          let { r, s, v } = await prepareDataSignature(
            assistant,
            customTransactionType,
            "MetaTransaction",
            message,
            await metaTransactionsHandler.getAddress()
          );

          // send a meta transaction, check for event
          await expect(
            metaTransactionsHandler
              .connect(deployer)
              .executeMetaTransaction(
                await assistant.getAddress(),
                message.functionName,
                functionSignature,
                nonce,
                r,
                s,
                v
              )
          )
            .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
            .withArgs(await assistant.getAddress(), await deployer.getAddress(), message.functionName, nonce);
        });

        it("Meta transaction should fail when function name is not allowlisted", async function () {
          message.functionName = "createSeller"; // function with this name does not exist (argument types are missing)

          // Collect the signature components
          let { r, s, v } = await prepareDataSignature(
            assistant,
            customTransactionType,
            "MetaTransaction",
            message,
            await metaTransactionsHandler.getAddress()
          );

          // Execute meta transaction, expecting revert.
          await expect(
            metaTransactionsHandler
              .connect(assistant)
              .executeMetaTransaction(
                await assistant.getAddress(),
                message.functionName,
                functionSignature,
                nonce,
                r,
                s,
                v
              )
          ).to.revertedWith(RevertReasons.FUNCTION_NOT_ALLOWLISTED);
        });

        // Meta transactions hash functions positions were changed after we added new methods setAllowlistedFunctions and getAllowlistedFunctions
        it("functionPointer positions should change", async function () {
          const { metaTxPrivateContractState: oldState } = protocolContractState;

          // Get protocol state after the upgrade
          const { metaTxPrivateContractState: newState } = await getProtocolContractState(
            protocolDiamondAddress,
            protocolContracts,
            mockContracts,
            preUpgradeEntities
          );

          assert.notDeepEqual(
            oldState.hashInfoState.map((x) => x.functionPointer),
            newState.hashInfoState.map((x) => x.functionPointer)
          );
        });
      });
    });

    context("New methods", async function () {
      context("📋 MetaTransactionsHandler", async function () {
        let functionList, functionHashList;

        beforeEach(async function () {
          functionList = [
            "testFunction1(uint256)",
            "testFunction2(uint256)",
            "testFunction3((uint256,address,bool))",
            "testFunction4(uint256[])",
          ];

          functionHashList = functionList.map((func) => keccak256(toUtf8Bytes(func)));
        });

        it("👉 setAllowlistedFunctions()", async function () {
          // Enable functions
          await expect(metaTransactionsHandler.connect(deployer).setAllowlistedFunctions(functionHashList, true))
            .to.emit(metaTransactionsHandler, "FunctionsAllowlisted")
            .withArgs(functionHashList, true, await deployer.getAddress());

          // Disable functions
          await expect(metaTransactionsHandler.connect(deployer).setAllowlistedFunctions(functionHashList, false))
            .to.emit(metaTransactionsHandler, "FunctionsAllowlisted")
            .withArgs(functionHashList, false, await deployer.getAddress());
        });

        it("👉 isFunctionAllowlisted(bytes32)", async function () {
          // Functions should be disabled by default
          for (const func of functionHashList) {
            expect(await metaTransactionsHandler["isFunctionAllowlisted(bytes32)"](func)).to.be.false;
          }

          // Enable functions
          await metaTransactionsHandler.connect(deployer).setAllowlistedFunctions(functionHashList, true);

          // Functions should be enabled
          for (const func of functionHashList) {
            expect(await metaTransactionsHandler["isFunctionAllowlisted(bytes32)"](func)).to.be.true;
          }

          // Disable functions
          await metaTransactionsHandler.connect(deployer).setAllowlistedFunctions(functionHashList, false);

          // Functions should be disabled
          for (const func of functionHashList) {
            expect(await metaTransactionsHandler["isFunctionAllowlisted(bytes32)"](func)).to.be.false;
          }
        });

        it("👉 isFunctionAllowlisted(string)", async function () {
          // Functions should be disabled by default
          for (const func of functionList) {
            expect(await metaTransactionsHandler["isFunctionAllowlisted(string)"](func)).to.be.false;
          }

          // Enable functions
          await metaTransactionsHandler.connect(deployer).setAllowlistedFunctions(functionHashList, true);

          // Functions should be enabled
          for (const func of functionList) {
            expect(await metaTransactionsHandler["isFunctionAllowlisted(string)"](func)).to.be.true;
          }

          // Disable functions
          await metaTransactionsHandler.connect(deployer).setAllowlistedFunctions(functionHashList, false);

          // Functions should be disabled
          for (const func of functionList) {
            expect(await metaTransactionsHandler["isFunctionAllowlisted(string)"](func)).to.be.false;
          }
        });
      });

      context("📋 ProtocolInitializationHandlerFacet", async function () {
        // To this test pass package.json version must be set to 2.2.0
        it("👉 getVersion()", async function () {
          const version = await protocolInitializationHandler.connect(rando).getVersion();

          // Slice because of unicode escape notation
          expect(version.slice(0, 5)).to.equal("2.2.0");
        });

        it("Should call initV2_2_0()", async function () {
          // maxPremintedVouchers is set in initV2_2_0 so we assume that if it is set, the function was called
          expect(await configHandler.connect(rando).getMaxPremintedVouchers()).to.equal("10000");
        });
      });

      context("📋 ConfigHandlerFacet", async function () {
        it("👉 setMaxPremintedVouchers()", async function () {
          // Set new value
          await expect(configHandler.connect(deployer).setMaxPremintedVouchers(100))
            .to.emit(configHandler, "MaxPremintedVouchersChanged")
            .withArgs(100, await deployer.getAddress());

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getMaxPremintedVouchers()).to.equal("100");
        });

        it("👉 getMaxPremintedVouchers()", async function () {
          // Verify that new value is stored
          expect(await configHandler.connect(rando).getMaxPremintedVouchers()).to.equal("10000");
        });
      });

      context("📋 OrchestrationHandlerFacet", async function () {
        it("👉 raiseAndEscalateDispute()", async function () {
          const { buyers, exchanges } = preUpgradeEntities;
          const exchangeId = "2";
          // exchangeId 2 = exchanges index 1
          const exchange = exchanges[exchangeId - 1];
          const buyer = buyers[exchange.buyerIndex];

          const {
            configContractState: { buyerEscalationDepositPercentage },
          } = protocolContractState;

          // DRFee is 0 because protocol doesn't support DRFee yet
          const buyerEscalationDepositNative = applyPercentage("0", buyerEscalationDepositPercentage.toString());

          // Raise and Escalate a dispute, testing for the event
          await expect(
            orchestrationHandler
              .connect(buyer.wallet)
              .raiseAndEscalateDispute(exchangeId, { value: buyerEscalationDepositNative })
          ).to.emit(disputeHandler, "DisputeRaised");
        });

        context("Standard offers", async function () {
          context("Seller does not exist", async function () {
            let seller, disputeResolverId, expectedCloneAddress;
            let offer, offerDates, offerDurations, agentId;
            let authToken, voucherInitValues;

            beforeEach(async function () {
              const {
                sellers,
                DRs: [, disputeResolver], // take DR that has empty allow list
              } = preUpgradeEntities;

              seller = mockSeller(
                await rando.getAddress(),
                await rando.getAddress(),
                await rando.getAddress(),
                await rando.getAddress(),
                true
              );
              disputeResolverId = disputeResolver.id;
              expectedCloneAddress = calculateContractAddress(
                await orchestrationHandler.getAddress(),
                sellers.length + 1
              );

              ({ offer, offerDates, offerDurations } = await mockOffer());
              agentId = 0;

              authToken = mockAuthToken();
              voucherInitValues = mockVoucherInitValues();
            });

            it("👉 createSellerAndOffer", async function () {
              // Create a seller and an offer, testing for the event
              const tx = await orchestrationHandler
                .connect(rando)
                .createSellerAndOffer(
                  seller,
                  offer,
                  offerDates,
                  offerDurations,
                  disputeResolverId,
                  authToken,
                  voucherInitValues,
                  agentId
                );

              // Check that all events are emitted
              await expect(tx).to.emit(orchestrationHandler, "SellerCreated");
              await expect(tx).to.emit(orchestrationHandler, "OfferCreated");

              // Voucher clone contract
              let bosonVoucher = await getContractAt("IBosonVoucher", expectedCloneAddress);
              await expect(tx).to.emit(bosonVoucher, "ContractURIChanged");
              await expect(tx).to.emit(bosonVoucher, "RoyaltyPercentageChanged");

              bosonVoucher = await getContractAt("OwnableUpgradeable", expectedCloneAddress); // Different ABI
              await expect(tx).to.emit(bosonVoucher, "OwnershipTransferred");
            });

            it("👉 createSellerAndOfferWithCondition", async function () {
              const condition = mockCondition({
                tokenAddress: await rando.getAddress(),
                tokenType: TokenType.MultiToken,
                tokenId: "5150",
              });
              // Create a seller and an offer with condition, testing for the events
              const tx = await orchestrationHandler
                .connect(rando)
                .createSellerAndOfferWithCondition(
                  seller,
                  offer,
                  offerDates,
                  offerDurations,
                  disputeResolverId,
                  condition,
                  authToken,
                  voucherInitValues,
                  agentId
                );

              // Check that all events are emitted
              await expect(tx).to.emit(orchestrationHandler, "SellerCreated");
              await expect(tx).to.emit(orchestrationHandler, "OfferCreated");
              await expect(tx).to.emit(orchestrationHandler, "GroupCreated");

              // Voucher clone contract
              let bosonVoucher = await getContractAt("IBosonVoucher", expectedCloneAddress);
              await expect(tx).to.emit(bosonVoucher, "ContractURIChanged");
              await expect(tx).to.emit(bosonVoucher, "RoyaltyPercentageChanged");

              bosonVoucher = await getContractAt("OwnableUpgradeable", expectedCloneAddress);
              await expect(tx).to.emit(bosonVoucher, "OwnershipTransferred");
            });

            context("With twins", async function () {
              let bosonToken, twin;

              beforeEach(async function () {
                [bosonToken] = await deployMockTokens();
                // Approving the twinHandler contract to transfer seller's tokens
                await bosonToken.connect(rando).approve(await twinHandler.getAddress(), 1); // approving the twin handler

                twin = mockTwin(await bosonToken.getAddress());
              });

              it("👉 createSellerAndOfferAndTwinWithBundle", async function () {
                // Create a seller, an offer with condition and a twin with bundle, testing for the events
                const tx = await orchestrationHandler
                  .connect(rando)
                  .createSellerAndOfferAndTwinWithBundle(
                    seller,
                    offer,
                    offerDates,
                    offerDurations,
                    disputeResolverId,
                    twin,
                    authToken,
                    voucherInitValues,
                    agentId
                  );

                // Check that all events are emitted
                await expect(tx).to.emit(orchestrationHandler, "SellerCreated");
                await expect(tx).to.emit(orchestrationHandler, "OfferCreated");
                await expect(tx).to.emit(orchestrationHandler, "TwinCreated");
                await expect(tx).to.emit(orchestrationHandler, "BundleCreated");

                // Voucher clone contract
                let bosonVoucher = await getContractAt("IBosonVoucher", expectedCloneAddress);
                await expect(tx).to.emit(bosonVoucher, "ContractURIChanged");
                await expect(tx).to.emit(bosonVoucher, "RoyaltyPercentageChanged");

                bosonVoucher = await getContractAt("OwnableUpgradeable", expectedCloneAddress);
                await expect(tx).to.emit(bosonVoucher, "OwnershipTransferred");
              });

              it("👉 createSellerAndOfferWithConditionAndTwinAndBundle", async function () {
                const condition = mockCondition({
                  tokenAddress: await rando.getAddress(),
                  tokenType: TokenType.MultiToken,
                  tokenId: "5150",
                });

                // Create a seller, an offer with condition, twin and bundle
                const tx = await orchestrationHandler
                  .connect(rando)
                  .createSellerAndOfferWithConditionAndTwinAndBundle(
                    seller,
                    offer,
                    offerDates,
                    offerDurations,
                    disputeResolverId,
                    condition,
                    twin,
                    authToken,
                    voucherInitValues,
                    agentId
                  );

                // Check that all events are emitted
                await expect(tx).to.emit(orchestrationHandler, "SellerCreated");
                await expect(tx).to.emit(orchestrationHandler, "OfferCreated");
                await expect(tx).to.emit(orchestrationHandler, "GroupCreated");
                await expect(tx).to.emit(orchestrationHandler, "TwinCreated");
                await expect(tx).to.emit(orchestrationHandler, "BundleCreated");

                // Voucher clone contract
                let bosonVoucher = await getContractAt("IBosonVoucher", expectedCloneAddress);
                await expect(tx).to.emit(bosonVoucher, "ContractURIChanged");
                await expect(tx).to.emit(bosonVoucher, "RoyaltyPercentageChanged");

                bosonVoucher = await getContractAt("OwnableUpgradeable", expectedCloneAddress);
                await expect(tx).to.emit(bosonVoucher, "OwnershipTransferred");
              });
            });
          });

          context("Seller exists", async function () {
            let offer, offerDates, offerDurations, agentId, disputeResolverId;

            beforeEach(async function () {
              const {
                sellers: [seller],
                DRs: [, disputeResolver], // take DR that has empty allow list
              } = preUpgradeEntities;

              ({ offer, offerDates, offerDurations } = await mockOffer());
              agentId = 0;
              disputeResolverId = disputeResolver.id;

              assistant = seller.wallet;
            });

            it("👉 createOfferWithCondition", async function () {
              const condition = mockCondition({
                tokenAddress: await rando.getAddress(),
                tokenType: TokenType.MultiToken,
                tokenId: "5150",
              });
              // Create a seller and an offer with condition, testing for the events
              const tx = await orchestrationHandler
                .connect(assistant)
                .createOfferWithCondition(offer, offerDates, offerDurations, disputeResolverId, condition, agentId);

              // Check that all events are emitted
              await expect(tx).to.emit(orchestrationHandler, "OfferCreated");
              await expect(tx).to.emit(orchestrationHandler, "GroupCreated");
            });

            it("👉 createOfferAddToGroup", async function () {
              // Create an offer, add it to the group, testing for the events
              const tx = await orchestrationHandler.connect(assistant).createOfferAddToGroup(
                offer,
                offerDates,
                offerDurations,
                disputeResolverId,
                "1", // seller already has a group with id 1 (from populateProtocolContract)
                agentId
              );

              // Check that all events are emitted
              await expect(tx).to.emit(orchestrationHandler, "OfferCreated");
              await expect(tx).to.emit(orchestrationHandler, "GroupUpdated");
            });

            context("With twins", async function () {
              let bosonToken, twin;

              beforeEach(async function () {
                [bosonToken] = await deployMockTokens();
                // Approving the twinHandler contract to transfer seller's tokens
                await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1); // approving the twin handler

                twin = mockTwin(await bosonToken.getAddress());
              });

              it("👉 createOfferAndTwinWithBundle", async function () {
                // Create a seller, an offer with condition and a twin with bundle, testing for the events
                const tx = await orchestrationHandler
                  .connect(assistant)
                  .createOfferAndTwinWithBundle(offer, offerDates, offerDurations, disputeResolverId, twin, agentId);

                // // Check that all events are emitted
                await expect(tx).to.emit(orchestrationHandler, "OfferCreated");
                await expect(tx).to.emit(orchestrationHandler, "TwinCreated");
                await expect(tx).to.emit(orchestrationHandler, "BundleCreated");
              });

              it("👉 createOfferWithConditionAndTwinAndBundle", async function () {
                const condition = mockCondition({
                  tokenAddress: await rando.getAddress(),
                  tokenType: TokenType.MultiToken,
                  tokenId: "5150",
                });

                // Create a seller, an offer with condition, twin and bundle
                const tx = await orchestrationHandler
                  .connect(assistant)
                  .createOfferWithConditionAndTwinAndBundle(
                    offer,
                    offerDates,
                    offerDurations,
                    disputeResolverId,
                    condition,
                    twin,
                    agentId
                  );

                // Check that all events are emitted
                await expect(tx).to.emit(orchestrationHandler, "OfferCreated");
                await expect(tx).to.emit(orchestrationHandler, "GroupCreated");
                await expect(tx).to.emit(orchestrationHandler, "TwinCreated");
                await expect(tx).to.emit(orchestrationHandler, "BundleCreated");
              });
            });
          });
        });

        context("Preminted offers", async function () {
          context("Seller does not exist", async function () {
            let seller, disputeResolverId, expectedCloneAddress;
            let offer, offerDates, offerDurations, reservedRangeLength, agentId;
            let authToken, voucherInitValues;
            beforeEach(async function () {
              const {
                sellers,
                DRs: [, disputeResolver], // take DR that has empty allow list
              } = preUpgradeEntities;

              seller = mockSeller(
                await rando.getAddress(),
                await rando.getAddress(),
                await rando.getAddress(),
                await rando.getAddress(),
                true
              );
              disputeResolverId = disputeResolver.id;
              expectedCloneAddress = calculateContractAddress(
                await orchestrationHandler.getAddress(),
                sellers.length + 1
              );

              ({ offer, offerDates, offerDurations } = await mockOffer());
              reservedRangeLength = offer.quantityAvailable;
              agentId = 0;

              authToken = mockAuthToken();
              voucherInitValues = mockVoucherInitValues();
            });

            it("👉 createSellerAndPremintedOffer", async function () {
              // Create a seller and a preminted offer, testing for the event
              const tx = await orchestrationHandler
                .connect(rando)
                .createSellerAndPremintedOffer(
                  seller,
                  offer,
                  offerDates,
                  offerDurations,
                  disputeResolverId,
                  reservedRangeLength,
                  await rando.getAddress(),
                  authToken,
                  voucherInitValues,
                  agentId
                );

              // Check that all events are emitted
              await expect(tx).to.emit(orchestrationHandler, "SellerCreated");
              await expect(tx).to.emit(orchestrationHandler, "OfferCreated");
              await expect(tx).to.emit(orchestrationHandler, "RangeReserved");

              // Voucher clone contract
              let bosonVoucher = await getContractAt("IBosonVoucher", expectedCloneAddress);
              await expect(tx).to.emit(bosonVoucher, "ContractURIChanged");
              await expect(tx).to.emit(bosonVoucher, "RoyaltyPercentageChanged");
              await expect(tx).to.emit(bosonVoucher, "RangeReserved");

              bosonVoucher = await getContractAt("OwnableUpgradeable", expectedCloneAddress); // Different ABI
              await expect(tx).to.emit(bosonVoucher, "OwnershipTransferred");
            });

            it("👉 createSellerAndPremintedOfferWithCondition", async function () {
              const condition = mockCondition({
                tokenAddress: await rando.getAddress(),
                tokenType: TokenType.MultiToken,
                tokenId: "5150",
              });
              // Create a seller and a preminted offer with condition, testing for the events
              const tx = await orchestrationHandler
                .connect(rando)
                .createSellerAndPremintedOfferWithCondition(
                  seller,
                  offer,
                  offerDates,
                  offerDurations,
                  disputeResolverId,
                  reservedRangeLength,
                  await rando.getAddress(),
                  condition,
                  authToken,
                  voucherInitValues,
                  agentId
                );

              // Check that all events are emitted
              await expect(tx).to.emit(orchestrationHandler, "SellerCreated");
              await expect(tx).to.emit(orchestrationHandler, "OfferCreated");
              await expect(tx).to.emit(orchestrationHandler, "RangeReserved");
              await expect(tx).to.emit(orchestrationHandler, "GroupCreated");

              // Voucher clone contract
              let bosonVoucher = await getContractAt("IBosonVoucher", expectedCloneAddress);
              await expect(tx).to.emit(bosonVoucher, "ContractURIChanged");
              await expect(tx).to.emit(bosonVoucher, "RoyaltyPercentageChanged");
              await expect(tx).to.emit(bosonVoucher, "RangeReserved");

              bosonVoucher = await getContractAt("OwnableUpgradeable", expectedCloneAddress);
              await expect(tx).to.emit(bosonVoucher, "OwnershipTransferred");
            });

            context("With twins", async function () {
              let bosonToken, twin;

              beforeEach(async function () {
                [bosonToken] = await deployMockTokens();
                // Approving the twinHandler contract to transfer seller's tokens
                await bosonToken.connect(rando).approve(await twinHandler.getAddress(), 1); // approving the twin handler

                twin = mockTwin(await bosonToken.getAddress());
              });

              it("👉 createSellerAndPremintedOfferAndTwinWithBundle", async function () {
                // Create a seller, a preminted offer with condition and a twin with bundle, testing for the events
                const tx = await orchestrationHandler
                  .connect(rando)
                  .createSellerAndPremintedOfferAndTwinWithBundle(
                    seller,
                    offer,
                    offerDates,
                    offerDurations,
                    disputeResolverId,
                    reservedRangeLength,
                    await rando.getAddress(),
                    twin,
                    authToken,
                    voucherInitValues,
                    agentId
                  );

                // Check that all events are emitted
                await expect(tx).to.emit(orchestrationHandler, "SellerCreated");
                await expect(tx).to.emit(orchestrationHandler, "OfferCreated");
                await expect(tx).to.emit(orchestrationHandler, "RangeReserved");
                await expect(tx).to.emit(orchestrationHandler, "TwinCreated");
                await expect(tx).to.emit(orchestrationHandler, "BundleCreated");

                // Voucher clone contract
                let bosonVoucher = await getContractAt("IBosonVoucher", expectedCloneAddress);
                await expect(tx).to.emit(bosonVoucher, "ContractURIChanged");
                await expect(tx).to.emit(bosonVoucher, "RoyaltyPercentageChanged");
                await expect(tx).to.emit(bosonVoucher, "RangeReserved");

                bosonVoucher = await getContractAt("OwnableUpgradeable", expectedCloneAddress);
                await expect(tx).to.emit(bosonVoucher, "OwnershipTransferred");
              });

              it("👉 createSellerAndPremintedOfferWithConditionAndTwinAndBundle", async function () {
                const condition = mockCondition({
                  tokenAddress: await rando.getAddress(),
                  tokenType: TokenType.MultiToken,
                  tokenId: "5150",
                });

                // Create a seller, a preminted offer with condition, twin and bundle
                const tx = await orchestrationHandler
                  .connect(rando)
                  .createSellerAndPremintedOfferWithConditionAndTwinAndBundle(
                    seller,
                    offer,
                    offerDates,
                    offerDurations,
                    disputeResolverId,
                    reservedRangeLength,
                    await rando.getAddress(),
                    condition,
                    twin,
                    authToken,
                    voucherInitValues,
                    agentId
                  );

                // Check that all events are emitted
                await expect(tx).to.emit(orchestrationHandler, "SellerCreated");
                await expect(tx).to.emit(orchestrationHandler, "OfferCreated");
                await expect(tx).to.emit(orchestrationHandler, "RangeReserved");
                await expect(tx).to.emit(orchestrationHandler, "GroupCreated");
                await expect(tx).to.emit(orchestrationHandler, "TwinCreated");
                await expect(tx).to.emit(orchestrationHandler, "BundleCreated");

                // Voucher clone contract
                let bosonVoucher = await getContractAt("IBosonVoucher", expectedCloneAddress);
                await expect(tx).to.emit(bosonVoucher, "ContractURIChanged");
                await expect(tx).to.emit(bosonVoucher, "RoyaltyPercentageChanged");
                await expect(tx).to.emit(bosonVoucher, "RangeReserved");

                bosonVoucher = await getContractAt("OwnableUpgradeable", expectedCloneAddress);
                await expect(tx).to.emit(bosonVoucher, "OwnershipTransferred");
              });
            });
          });

          context("Seller exists", async function () {
            let offer, offerDates, offerDurations, reservedRangeLength, agentId, disputeResolverId;
            let bosonVoucher;

            beforeEach(async function () {
              const {
                sellers: [seller],
                DRs: [, disputeResolver], // take DR that has empty allow list
              } = preUpgradeEntities;

              ({ offer, offerDates, offerDurations } = await mockOffer());
              reservedRangeLength = offer.quantityAvailable;
              agentId = 0;
              disputeResolverId = disputeResolver.id;

              assistant = seller.wallet;

              // Voucher clone contract
              const expectedCloneAddress = calculateContractAddress(await accountHandler.getAddress(), "1");
              bosonVoucher = await getContractAt("IBosonVoucher", expectedCloneAddress);
            });

            it("👉 createPremintedOfferWithCondition", async function () {
              const condition = mockCondition({
                tokenAddress: await rando.getAddress(),
                tokenType: TokenType.MultiToken,
                tokenId: "5150",
              });
              // Create a preminted offer with condition, testing for the events
              const tx = await orchestrationHandler
                .connect(assistant)
                .createPremintedOfferWithCondition(
                  offer,
                  offerDates,
                  offerDurations,
                  disputeResolverId,
                  reservedRangeLength,
                  await assistant.getAddress(),
                  condition,
                  agentId
                );

              // Check that all events are emitted
              await expect(tx).to.emit(orchestrationHandler, "OfferCreated");
              await expect(tx).to.emit(orchestrationHandler, "RangeReserved");
              await expect(tx).to.emit(orchestrationHandler, "GroupCreated");
              await expect(tx).to.emit(bosonVoucher, "RangeReserved");
            });

            it("👉 createPremintedOfferAddToGroup", async function () {
              // Create a preminted offer, add it to the group, testing for the events
              const tx = await orchestrationHandler.connect(assistant).createPremintedOfferAddToGroup(
                offer,
                offerDates,
                offerDurations,
                disputeResolverId,
                reservedRangeLength,
                await assistant.getAddress(),
                "1", // seller already has a group with id 1 (from populateProtocolContract)
                agentId
              );

              // Check that all events are emitted
              await expect(tx).to.emit(orchestrationHandler, "OfferCreated");
              await expect(tx).to.emit(orchestrationHandler, "RangeReserved");
              await expect(tx).to.emit(orchestrationHandler, "GroupUpdated");
              await expect(tx).to.emit(bosonVoucher, "RangeReserved");
            });

            context("With twins", async function () {
              let bosonToken, twin;

              beforeEach(async function () {
                [bosonToken] = await deployMockTokens();
                // Approving the twinHandler contract to transfer seller's tokens
                await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1); // approving the twin handler

                twin = mockTwin(await bosonToken.getAddress());
              });

              it("👉 createPremintedOfferAndTwinWithBundle", async function () {
                // Create a preminted offer with condition and a twin with bundle, testing for the events
                const tx = await orchestrationHandler
                  .connect(assistant)
                  .createPremintedOfferAndTwinWithBundle(
                    offer,
                    offerDates,
                    offerDurations,
                    disputeResolverId,
                    reservedRangeLength,
                    await assistant.getAddress(),
                    twin,
                    agentId
                  );

                // // Check that all events are emitted
                await expect(tx).to.emit(orchestrationHandler, "OfferCreated");
                await expect(tx).to.emit(orchestrationHandler, "RangeReserved");
                await expect(tx).to.emit(orchestrationHandler, "TwinCreated");
                await expect(tx).to.emit(orchestrationHandler, "BundleCreated");
                await expect(tx).to.emit(bosonVoucher, "RangeReserved");
              });

              it("👉 createPremintedOfferWithConditionAndTwinAndBundle", async function () {
                const condition = mockCondition({
                  tokenAddress: await rando.getAddress(),
                  tokenType: TokenType.MultiToken,
                  tokenId: "5150",
                });

                // Create a preminted offer with condition, twin and bundle
                const tx = await orchestrationHandler
                  .connect(assistant)
                  .createPremintedOfferWithConditionAndTwinAndBundle(
                    offer,
                    offerDates,
                    offerDurations,
                    disputeResolverId,
                    reservedRangeLength,
                    await assistant.getAddress(),
                    condition,
                    twin,
                    agentId
                  );

                // Check that all events are emitted
                await expect(tx).to.emit(orchestrationHandler, "OfferCreated");
                await expect(tx).to.emit(orchestrationHandler, "RangeReserved");
                await expect(tx).to.emit(orchestrationHandler, "GroupCreated");
                await expect(tx).to.emit(orchestrationHandler, "TwinCreated");
                await expect(tx).to.emit(orchestrationHandler, "BundleCreated");
                await expect(tx).to.emit(bosonVoucher, "RangeReserved");
              });
            });
          });
        });
      });

      context("Preminted voucher support", async function () {
        let sellers, seller, buyer, assistant;
        let offer;
        beforeEach(async function () {
          // Entities
          ({
            sellers,
            buyers: [buyer],
          } = preUpgradeEntities);
          const offerId = "2";
          ({ offer } = await offerHandler.getOffer(offerId));

          seller = sellers.find((s) => s.id === offer.creatorId.toString());
          assistant = seller.wallet;
        });

        context("📋 ExchangeHandlerFacet", async function () {
          it("👉 commitToPremintedOffer", async function () {
            // Get next token id
            const exchangeId = await exchangeHandler.getNextExchangeId();
            const tokenId = deriveTokenId(offer.id, exchangeId);

            // Reserve range
            await offerHandler
              .connect(assistant)
              .reserveRange(offer.id, offer.quantityAvailable, await assistant.getAddress());

            // TODO: remove this once newVersion is 2.2.0 (not 2.2.0-rc.1)
            await configHandler.connect(deployer).setMaxPremintedVouchers(100);

            // Boson voucher contract address
            const sellerIndex = sellers.findIndex((s) => s.id === seller.id);
            const voucherCloneAddress = calculateContractAddress(await accountHandler.getAddress(), sellerIndex + 1);
            const bosonVoucher = await getContractAt("BosonVoucher", voucherCloneAddress);
            await bosonVoucher.connect(assistant).preMint(offer.id, offer.quantityAvailable);

            // Commit to preminted offer, testing for the event
            await expect(
              bosonVoucher.connect(assistant).transferFrom(await assistant.getAddress(), buyer.wallet, tokenId)
            ).to.emit(exchangeHandler, "BuyerCommitted");
          });
        });

        context("📋 OfferHandlerFacet", async function () {
          it("👉 reserveRange for assistant", async function () {
            // Reserve range
            await expect(
              offerHandler
                .connect(assistant)
                .reserveRange(offer.id, offer.quantityAvailable, await assistant.getAddress())
            ).to.emit(offerHandler, "RangeReserved");
          });

          it("👉 reserveRange to contract", async function () {
            // Voucher contract
            const sellerIndex = sellers.findIndex((s) => s.id === seller.id);
            const expectedCloneAddress = calculateContractAddress(await accountHandler.getAddress(), sellerIndex + 1);
            const bosonVoucher = await getContractAt("IBosonVoucher", expectedCloneAddress);

            await expect(
              offerHandler
                .connect(assistant)
                .reserveRange(offer.id, offer.quantityAvailable, await bosonVoucher.getAddress())
            ).to.emit(offerHandler, "RangeReserved");
          });
        });
      });
    });

    context("Bug fixes", async function () {
      it("Should ignore twin id set by seller and use nextAccountId on twin creation", async function () {});
      // Get next twin id
      const { nextTwinId } = protocolContractState.twinContractState;

      // Twin with id nextTwinId should not exist
      let [exists, storedTwin] = await twinHandler.getTwin(nextTwinId.toString());
      expect(exists).to.be.false;
      expect(storedTwin).to.be.equal("0");

      // Mock new twin
      let twin = mockTwin(mockToken, TokenType.FungibleToken);
      twin.id = "666";

      // Approve twinHandler to transfer assistant tokens
      await mockToken.connect(assistant).approve(await twinHandler.getAddress(), twin.amount);

      // Create twin
      await twinHandler.connect(assistant).createTwin(twin);

      // Twin with id 666 shouldn't exist
      [exists, storedTwin] = await twinHandler.getTwin("666");
      expect(exists).to.be.false;
      expect(storedTwin).to.be.equal("0");

      // Set twin id to nextTwinId
      twin.id = nextTwinId.toString();

      // Twin with id nextTwinId should exist
      [exists, storedTwin] = await twinHandler.getTwin(nextTwinId.toString());
      expect(exists).to.be.true;
      expect(Twin.fromStruct(storedTwin)).to.be.equal(twin.toStruct());
    });

    it("should return the correct tokenURI when token is pre-minted", async function () {
      // Get offer
      const offerId = "2";
      const { offer } = await offerHandler.getOffer(offerId);

      // Get seller assistant
      const { sellers } = preUpgradeEntities;
      const seller = sellers.find((s) => s.id === offer.creatorId.toString());
      const assistant = seller.wallet;

      // Reserve range
      const length = "1";
      const tx = await offerHandler.connect(assistant).reserveRange(offerId, length, await assistant.getAddress());
      const { events } = await tx.wait();
      const { startExchangeId } = events.find((e) => e.event === "RangeReserved").args;

      // Find voucher contract
      const sellerIndex = sellers.findIndex((s) => s.id === seller.id);
      const expectedCloneAddress = calculateContractAddress(await accountHandler.getAddress(), sellerIndex + 1);
      const bosonVoucher = await getContractAt("IBosonVoucher", expectedCloneAddress);

      // Premint
      await bosonVoucher.connect(assistant).preMint(offerId, 1);

      // Get metadata URI
      const voucherId = deriveTokenId(offerId, startExchangeId);
      const tokenURI = await bosonVoucher.tokenURI(voucherId);
      expect(tokenURI).eq(offer.metadataUri);
    });
  });
});
