const hre = require("hardhat");
const ethers = hre.ethers;
const { assert, expect } = require("chai");
const DisputeResolver = require("../../scripts/domain/DisputeResolver");
const { mockDisputeResolver, mockTwin, mockSeller, mockAuthToken, mockVoucherInitValues } = require("../util/mock");
const {
  deploySuite,
  upgradeSuite,
  populateProtocolContract,
  getProtocolContractState,
  revertState,
} = require("../util/upgrade");
const { getGenericContext } = require("./01_generic");
const { keccak256, toUtf8Bytes } = require("ethers/lib/utils");
const TokenType = require("../../scripts/domain/TokenType");
const Twin = require("../../scripts/domain/Twin");
const { prepareDataSignatureParameters, applyPercentage } = require("../util/utils");
const { RevertReasons } = require("../../scripts/config/revert-reasons");

const oldVersion = "v2.1.0";
const newVersion = "v2.2.0-rc.1";
const v2_1_0_scripts = "v2.1.0-scripts";

/**
 *  Upgrade test case - After upgrade from 2.1.0 to 2.0.0 everything is still operational
 */
describe("[@skip-on-coverage] After facet upgrade, everything is still operational", function () {
  // Common vars
  let deployer, rando, operator;
  let accountHandler,
    metaTransactionsHandler,
    twinHandler,
    protocolInitializationHandler,
    configHandler,
    orchestrationHandler,
    disputeHandler,
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
      [deployer, rando, , operator] = await ethers.getSigners();

      ({ protocolDiamondAddress, protocolContracts, mockContracts } = await deploySuite(
        deployer,
        oldVersion,
        v2_1_0_scripts
      ));
      ({ twinHandler, disputeHandler, exchangeHandler } = protocolContracts);
      ({ mockToken: mockToken } = mockContracts);

      // Populate protocol with data
      preUpgradeEntities = await populateProtocolContract(
        deployer,
        protocolDiamondAddress,
        protocolContracts,
        mockContracts,
        oldVersion
      );

      // Get current protocol state, which serves as the reference
      // We assume that this state is a true one, relying on our unit and integration tests
      protocolContractState = await getProtocolContractState(
        protocolDiamondAddress,
        protocolContracts,
        mockContracts,
        preUpgradeEntities,
        oldVersion
      );

      // Upgrade protocol
      ({ accountHandler, metaTransactionsHandler, protocolInitializationHandler, configHandler, orchestrationHandler } =
        await upgradeSuite(newVersion, protocolDiamondAddress, {
          accountHandler: "IBosonAccountHandler",
          metaTransactionsHandler: "IBosonMetaTransactionsHandler",
          protocolInitializationHandler: "IBosonProtocolInitializationHandler",
          configHandler: "IBosonConfigHandler",
          orchestrationHandler: "IBosonOrchestrationHandler",
        }));

      protocolContracts = {
        ...protocolContracts,
        accountHandler,
        metaTransactionsHandler,
        protocolInitializationHandler,
        configHandler,
      };

      snapshot = await ethers.provider.send("evm_snapshot", []);

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
          mockContracts,
          protocolContractState,
          preUpgradeEntities,
          snapshot,
          newVersion
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
    await ethers.provider.send("evm_revert", [snapshot]);
    snapshot = await ethers.provider.send("evm_snapshot", []);
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
        const DR = mockDisputeResolver(rando.address, rando.address, rando.address, rando.address, true);
        DR.id = nextAccountId.toString();

        await accountHandler.connect(rando).createDisputeResolver(DR, [], []);

        // Validate if new DR is active
        let [, DRCreated] = await accountHandler.getDisputeResolver(DR.id);
        DRCreated = DisputeResolver.fromStruct(DRCreated);
        expect(DRCreated).to.deep.equal(DR);
      });

      context("MetaTransactionsHandler", async function () {
        let seller, functionSignature, metaTransactionType, customTransactionType, nonce, message;

        beforeEach(async function () {
          seller = mockSeller(operator.address, operator.address, operator.address, operator.address);

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

          nonce = parseInt(ethers.utils.randomBytes(8));

          // Prepare the message
          message = {
            nonce,
            from: operator.address,
            contractAddress: accountHandler.address,
            functionName:
              "createSeller((uint256,address,address,address,address,bool),(uint256,uint8),(string,uint256))",
            functionSignature: functionSignature,
          };
        });
        it("Meta transaction should work with allowlisted function", async function () {
          // Collect the signature components
          let { r, s, v } = await prepareDataSignatureParameters(
            operator,
            customTransactionType,
            "MetaTransaction",
            message,
            metaTransactionsHandler.address
          );

          // send a meta transaction, check for event
          await expect(
            metaTransactionsHandler
              .connect(deployer)
              .executeMetaTransaction(operator.address, message.functionName, functionSignature, nonce, r, s, v)
          )
            .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
            .withArgs(operator.address, deployer.address, message.functionName, nonce);
        });

        it("Meta transaction should fail when function name is not allowlisted", async function () {
          message.functionName = "createSeller"; // function with this name does not exist (argument types are missing)

          // Collect the signature components
          let { r, s, v } = await prepareDataSignatureParameters(
            operator,
            customTransactionType,
            "MetaTransaction",
            message,
            metaTransactionsHandler.address
          );

          // Execute meta transaction, expecting revert.
          await expect(
            metaTransactionsHandler
              .connect(operator)
              .executeMetaTransaction(operator.address, message.functionName, functionSignature, nonce, r, s, v)
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
            .withArgs(functionHashList, true, deployer.address);

          // Disable functions
          await expect(metaTransactionsHandler.connect(deployer).setAllowlistedFunctions(functionHashList, false))
            .to.emit(metaTransactionsHandler, "FunctionsAllowlisted")
            .withArgs(functionHashList, false, deployer.address);
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
          expect(await configHandler.connect(rando).getMaxPremintedVouchers()).to.equal("21845");
        });
      });

      context("📋 ConfigHandlerFacet", async function () {
        it("👉 setMaxPremintedVouchers()", async function () {
          // Set new value
          await expect(configHandler.connect(deployer).setMaxPremintedVouchers(100))
            .to.emit(configHandler, "MaxPremintedVouchersChanged")
            .withArgs(100, deployer.address);

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getMaxPremintedVouchers()).to.equal("100");
        });

        it("👉 getMaxPremintedVouchers()", async function () {
          // Verify that new value is stored
          expect(await configHandler.connect(rando).getMaxPremintedVouchers()).to.equal("21845");
        });
      });

      context("📋 OrchestrationHandlerFacet", async function () {
        it("👉 raiseAndEscalateDispute()", async function () {
          const { buyers, exchanges, offers } = preUpgradeEntities;
          const exchangeId = "1";
          // exchangeId 1 = exchanges index 0
          const exchange = exchanges[exchangeId - 1];
          const buyer = buyers[exchange.buyerIndex];
          console.log(exchange);
          const offer = offers.find((o) => o.offer.id === exchange.offerId);
          console.log(offer);
          const disputeResolver = await accountHandler.getDisputeResolver(offer.disputeResolverId);
          console.log(disputeResolver);

          const { configHandler } = protocolContractState;
          console.log(configHandler);

          const exchange2 = await exchangeHandler.getExchange(exchangeId);
          console.log(exchange2);

          // DRFee is 0 because protocol doesn't support DRFee yet
          const buyerEscalationDepositPercentage = "1000"; // 10%

          const buyerEscalationDepositNative = applyPercentage("0", buyerEscalationDepositPercentage);

          // Raise and Escalate a dispute, testing for the event
          await expect(
            orchestrationHandler
              .connect(buyer.wallet)
              .raiseAndEscalateDispute(exchangeId, { value: buyerEscalationDepositNative })
          )
            .to.emit(disputeHandler, "DisputeRaised")
            .withArgs(exchangeId, buyer.id, offer.sellerId, buyer.wallet.address);
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

      // Approve twinHandler to transfer operator tokens
      await mockToken.connect(operator).approve(twinHandler.address, twin.amount);

      // Create twin
      await twinHandler.connect(operator).createTwin(twin);

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
  });
});
