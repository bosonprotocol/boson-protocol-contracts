const hre = require("hardhat");
const ethers = hre.ethers;
const { assert, expect } = require("chai");
const DisputeResolver = require("../../scripts/domain/DisputeResolver");
const { mockDisputeResolver, mockTwin } = require("../util/mock");
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

const oldVersion = "v2.1.0";
const newVersion = "v2.2.0";
const v2_1_0_scripts = "v2.1.0-scripts";

/**
 *  Upgrade test case - After upgrade from 2.1.0 to 2.0.0 everything is still operational
 */
describe("[@skip-on-coverage] After facet upgrade, everything is still operational", function () {
  // Common vars
  let deployer, rando, operator;
  let accountHandler, metaTransactionsHandler, twinHandler;
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

      ({ twinHandler } = protocolContracts);
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
        preUpgradeEntities
      );

      // Upgrade protocol
      // oldHandlers = { accountHandler: accountHandler }; // store old handler to test old events
      ({ accountHandler, metaTransactionsHandler } = await upgradeSuite(newVersion, protocolDiamondAddress, {
        accountHandler: "IBosonAccountHandler",
        metaTransactionsHandler: "IBosonMetaTransactionsHandler",
      }));

      protocolContracts = { ...protocolContracts, accountHandler, metaTransactionsHandler };

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

  after(async function () {
    // Revert to latest state of contracts
    revertState();
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
    });

    context("New methods", async function () {
      context(" 📋 MetaTransactionsHandler", async function () {
        const functionList = [
          "testFunction1(uint256)",
          "testFunction2(uint256)",
          "testFunction3((uint256,address,bool))",
          "testFunction4(uint256[])",
        ];

        const functionHashList = functionList.map((func) => keccak256(toUtf8Bytes(func)));

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
