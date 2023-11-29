const hre = require("hardhat");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const {
  getContractAt,
  getContractFactory,
  getSigners,
  encodeBytes32String,
  AbiCoder,
  ZeroHash,
  ZeroAddress,
  keccak256,
  toUtf8Bytes,
} = hre.ethers;
const { getSnapshot, revertToSnapshot } = require("../util/utils.js");
const { expect } = require("chai");
const Role = require("../../scripts/domain/Role");
const { mockTwin, mockSeller, mockAuthToken, mockVoucherInitValues } = require("../util/mock");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployAndCutFacets, deployProtocolFacets } = require("../../scripts/util/deploy-protocol-handler-facets");
const { getInterfaceIds, interfaceImplementers } = require("../../scripts/config/supported-interfaces");
const { maxPriorityFeePerGas, oneWeek, oneMonth } = require("../util/constants");

const { getFees } = require("../../scripts/util/utils");
const { getFacetAddCut, getFacetReplaceCut } = require("../../scripts/util/diamond-utils");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { getFacetsWithArgs } = require("../util/utils.js");
const { getV2_2_0DeployConfig } = require("../upgrade/00_config.js");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
const TokenType = require("../../scripts/domain/TokenType");
const { getStorageAt } = require("@nomicfoundation/hardhat-network-helpers");

describe("ProtocolInitializationHandler", async function () {
  // Common vars
  let InterfaceIds;
  let deployer, rando;
  let protocolInitializationFacet, diamondCutFacet;
  let protocolDiamond, accessController;
  let erc165;
  let version;
  let maxPremintedVouchers, initializationData;
  let abiCoder;
  let bosonErrors;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();
  });

  beforeEach(async function () {
    // Make accounts available
    [deployer, rando] = await getSigners();

    // Deploy the Protocol Diamond
    [protocolDiamond, , , , accessController] = await deployProtocolDiamond(maxPriorityFeePerGas);

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, await deployer.getAddress());

    // Temporarily grant UPGRADER role to deployer 1ccount
    await accessController.grantRole(Role.UPGRADER, await deployer.getAddress());

    // Cast Diamond to IERC165
    erc165 = await getContractAt("ERC165Facet", await protocolDiamond.getAddress());

    // Cast Diamond to DiamondCutFacet
    diamondCutFacet = await getContractAt("DiamondCutFacet", await protocolDiamond.getAddress());

    // Cast Diamond to ProtocolInitializationHandlerFacet
    protocolInitializationFacet = await getContractAt(
      "ProtocolInitializationHandlerFacet",
      await protocolDiamond.getAddress()
    );

    bosonErrors = await getContractAt("BosonErrors", await protocolDiamond.getAddress());

    version = "2.2.0";

    abiCoder = AbiCoder.defaultAbiCoder();

    // initialization data for v2.2.0
    maxPremintedVouchers = "1000";

    initializationData = abiCoder.encode(["uint256"], [maxPremintedVouchers]);
  });

  describe("Deploy tests", async function () {
    context("📋 Initializer", async function () {
      it("Should initialize version 2.2.0 and emit ProtocolInitialized", async function () {
        const { cutTransaction } = await deployAndCutFacets(
          await protocolDiamond.getAddress(),
          { ProtocolInitializationHandlerFacet: [] },
          maxPriorityFeePerGas
        );

        expect(cutTransaction).to.emit(protocolInitializationFacet, "ProtocolInitialized").withArgs(version);
      });

      context("💔 Revert Reasons", async function () {
        let protocolInitializationFacetDeployed;

        beforeEach(async function () {
          const ProtocolInitilizationContractFactory = await getContractFactory("ProtocolInitializationHandlerFacet");
          protocolInitializationFacetDeployed = await ProtocolInitilizationContractFactory.deploy();

          await protocolInitializationFacetDeployed.waitForDeployment();
        });

        it("Addresses and calldata length mismatch", async function () {
          version = encodeBytes32String("2.2.0");

          const callData = protocolInitializationFacetDeployed.interface.encodeFunctionData("initialize", [
            version,
            [await rando.getAddress()],
            [],
            true,
            initializationData,
            [],
            [],
          ]);

          let facetCut = await getFacetAddCut(protocolInitializationFacetDeployed, [callData.slice(0, 10)]);

          const cutArgs = [
            [facetCut],
            await protocolInitializationFacetDeployed.getAddress(),
            callData,
            await getFees(maxPriorityFeePerGas),
          ];

          await expect(diamondCutFacet.connect(deployer).diamondCut(...cutArgs)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.ADDRESSES_AND_CALLDATA_LENGTH_MISMATCH
          );
        });

        it("Version is empty", async function () {
          const callData = protocolInitializationFacetDeployed.interface.encodeFunctionData("initialize", [
            ZeroHash,
            [],
            [],
            true,
            initializationData,
            [],
            [],
          ]);

          let facetCut = await getFacetAddCut(protocolInitializationFacetDeployed, [callData.slice(0, 10)]);

          const cutArgs = [
            [facetCut],
            await protocolInitializationFacetDeployed.getAddress(),
            callData,
            await getFees(maxPriorityFeePerGas),
          ];

          await expect(diamondCutFacet.connect(deployer).diamondCut(...cutArgs)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.VERSION_MUST_BE_SET
          );
        });

        it("Initialize same version twice", async function () {
          version = encodeBytes32String("2.2.0");

          const callData = protocolInitializationFacetDeployed.interface.encodeFunctionData("initialize", [
            version,
            [],
            [],
            true,
            initializationData,
            [],
            [],
          ]);

          let facetCut = await getFacetAddCut(protocolInitializationFacetDeployed, [callData.slice(0, 10)]);

          await diamondCutFacet.diamondCut(
            [facetCut],
            await protocolInitializationFacetDeployed.getAddress(),
            callData,
            await getFees(maxPriorityFeePerGas)
          );

          // Mock a new facet to add to diamond so we can call initialize again
          let FacetTestFactory = await getContractFactory("Test3Facet");
          const testFacet = await FacetTestFactory.deploy(await getFees(maxPriorityFeePerGas));
          await testFacet.waitForDeployment();

          const calldataTestFacet = testFacet.interface.encodeFunctionData("initialize", [await rando.getAddress()]);

          facetCut = await getFacetAddCut(testFacet, [calldataTestFacet.slice(0, 10)]);

          const calldataProtocolInitialization = protocolInitializationFacetDeployed.interface.encodeFunctionData(
            "initialize",
            [version, [await testFacet.getAddress()], [calldataTestFacet], true, initializationData, [], []]
          );

          const cutTransaction = diamondCutFacet.diamondCut(
            [facetCut],
            await protocolInitializationFacetDeployed.getAddress(),
            calldataProtocolInitialization,
            await getFees(maxPriorityFeePerGas)
          );

          await expect(cutTransaction).to.be.revertedWithCustomError(bosonErrors, RevertReasons.ALREADY_INITIALIZED);
        });

        it("Initialize is not called via proxy", async function () {
          // The simple version of this test would be to try just any call directly on protocolInitializationFacet
          // This test is more complex to show how actual exploit would work if we didn't check who calls initialize

          // Add protocolInitializationFacet to diamond
          await deployAndCutFacets(
            await protocolDiamond.getAddress(),
            { ProtocolInitializationHandlerFacet: [] },
            maxPriorityFeePerGas
          );

          // Get actual deployed protocolInitializationFacet
          const diamondLoupe = await getContractAt("DiamondLoupeFacet", await protocolDiamond.getAddress());
          const signature = protocolInitializationFacet.interface.fragments.find(
            (f) => f.name == "getVersion"
          ).selector;
          const existingFacetAddress = await diamondLoupe.facetAddress(signature);
          const protocolInitializationFacet2 = await getContractAt(
            "ProtocolInitializationHandlerFacet",
            existingFacetAddress
          );

          // Deploy selfDestruct contract that will be called during initialize
          const SelfDestructorFactory = await getContractFactory("SelfDestructor");
          const selfDestructor = await SelfDestructorFactory.deploy();
          const selfDestructorInitData = selfDestructor.interface.encodeFunctionData("destruct");

          // call initialize
          await expect(
            protocolInitializationFacet2.initialize(
              encodeBytes32String("haha"),
              [await selfDestructor.getAddress()],
              [selfDestructorInitData],
              false,
              "0x",
              [],
              []
            )
          ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.DIRECT_INITIALIZATION_NOT_ALLOWED);
        });
      });
    });
  });

  describe("After deploy tests", async function () {
    let deployedProtocolInitializationHandlerFacet;
    beforeEach(async function () {
      version = "2.2.0";

      const interfaceId = InterfaceIds[interfaceImplementers["ProtocolInitializationHandlerFacet"]];

      const { deployedFacets } = await deployAndCutFacets(
        await protocolDiamond.getAddress(),
        { ProtocolInitializationHandlerFacet: [version, [], [], true] },
        maxPriorityFeePerGas,
        version,
        undefined,
        [interfaceId]
      );
      deployedProtocolInitializationHandlerFacet = deployedFacets[0];
    });

    // Interface support (ERC-156 provided by ProtocolDiamond, others by deployed facets)
    context("📋 Interfaces", async function () {
      context("👉 supportsInterface()", async function () {
        it("Should indicate support for IBosonProtocolInitializationHandler interface", async function () {
          // Current interfaceId for IBosonProtocolInitializationHandler
          const support = await erc165.supportsInterface(InterfaceIds.IBosonProtocolInitializationHandler);

          // Test
          expect(support, "IBosonProtocolInitializationHandler interface not supported").is.true;
        });
      });

      it("Should remove interfaces when supplied", async function () {
        const configHandlerInterface = InterfaceIds[interfaceImplementers["ConfigHandlerFacet"]];
        const accountInterface = InterfaceIds[interfaceImplementers["AccountHandlerFacet"]];

        version = encodeBytes32String("0.0.0");
        const calldataProtocolInitialization =
          deployedProtocolInitializationHandlerFacet.contract.interface.encodeFunctionData("initialize", [
            version,
            [],
            [],
            true,
            "0x",
            [(configHandlerInterface, accountInterface)],
            [],
          ]);

        await diamondCutFacet.diamondCut(
          [],
          await deployedProtocolInitializationHandlerFacet.contract.getAddress(),
          calldataProtocolInitialization,
          await getFees(maxPriorityFeePerGas)
        );

        let support = await erc165.supportsInterface(InterfaceIds.IBosonConfigHandler);

        expect(support, "IBosonConfigHandler interface supported").is.false;

        support = await erc165.supportsInterface(InterfaceIds.IBosonAccountHandler);
        expect(support, "IBosonAccountHandler interface supported").is.false;
      });
    });

    it("Should return the correct version", async function () {
      const version = await protocolInitializationFacet.connect(rando).getVersion();

      // slice because of unicode escape notation
      expect(version.slice(0, 5)).to.equal("2.2.0");
    });

    it("Should call facet initializer internally when _addresses and _calldata are supplied", async function () {
      let FacetTestFactory = await getContractFactory("Test3Facet");
      const testFacet = await FacetTestFactory.deploy(await getFees(maxPriorityFeePerGas));
      await testFacet.waitForDeployment();

      const calldataTestFacet = testFacet.interface.encodeFunctionData("initialize", [await rando.getAddress()]);

      version = encodeBytes32String("0.0.0");
      const calldataProtocolInitialization =
        deployedProtocolInitializationHandlerFacet.contract.interface.encodeFunctionData("initialize", [
          version,
          [await testFacet.getAddress()],
          [calldataTestFacet],
          true,
          "0x",
          [],
          [],
        ]);

      const facetCuts = [await getFacetAddCut(testFacet)];

      await diamondCutFacet.diamondCut(
        facetCuts,
        await deployedProtocolInitializationHandlerFacet.contract.getAddress(),
        calldataProtocolInitialization,
        await getFees(maxPriorityFeePerGas)
      );

      const testFacetContract = await getContractAt("Test3Facet", await protocolDiamond.getAddress());

      expect(await testFacetContract.getTestAddress()).to.equal(await rando.getAddress());
    });

    context("💔 Revert Reasons", async function () {
      let testFacet, version;

      beforeEach(async function () {
        let FacetTestFactory = await getContractFactory("Test3Facet");
        testFacet = await FacetTestFactory.deploy(await getFees(maxPriorityFeePerGas));
        await testFacet.waitForDeployment();

        version = encodeBytes32String("0.0.0");
      });

      it("Delegate call to initialize fails", async function () {
        const calldataTestFacet = testFacet.interface.encodeFunctionData("initialize", [await testFacet.getAddress()]);

        const calldataProtocolInitialization =
          deployedProtocolInitializationHandlerFacet.contract.interface.encodeFunctionData("initialize", [
            version,
            [await testFacet.getAddress()],
            [calldataTestFacet],
            true,
            initializationData,
            [],
            [],
          ]);

        const facetCuts = [await getFacetAddCut(testFacet)];

        await expect(
          diamondCutFacet.diamondCut(
            facetCuts,
            await deployedProtocolInitializationHandlerFacet.contract.getAddress(),
            calldataProtocolInitialization,
            await getFees(maxPriorityFeePerGas)
          )
        ).to.be.revertedWith(RevertReasons.CONTRACT_NOT_ALLOWED);
      });

      it("Default reason if not supplied by implementation", async () => {
        // If the caller's address is supplied Test3Facet's initializer will revert with no reason
        // and so the diamondCut function will supply it's own reason
        const calldataTestFacet = testFacet.interface.encodeFunctionData("initialize", [await deployer.getAddress()]);

        const calldataProtocolInitialization =
          deployedProtocolInitializationHandlerFacet.contract.interface.encodeFunctionData("initialize", [
            version,
            [await testFacet.getAddress()],
            [calldataTestFacet],
            true,
            initializationData,
            [],
            [],
          ]);

        const facetCuts = [await getFacetAddCut(testFacet)];

        await expect(
          diamondCutFacet.diamondCut(
            facetCuts,
            await deployedProtocolInitializationHandlerFacet.contract.getAddress(),
            calldataProtocolInitialization,
            await getFees(maxPriorityFeePerGas)
          )
        ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.PROTOCOL_INITIALIZATION_FAILED);
      });
    });
  });

  describe("initV2_2_0", async function () {
    let deployedProtocolInitializationHandlerFacet;
    let configHandler;
    let facetCut;
    let calldataProtocolInitialization;

    beforeEach(async function () {
      version = "2.1.0";

      // Deploy mock protocol initialization facet which simulates state before v2.2.0
      const ProtocolInitilizationContractFactory = await getContractFactory("MockProtocolInitializationHandlerFacet");
      const mockInitializationFacetDeployed = await ProtocolInitilizationContractFactory.deploy(
        await getFees(maxPriorityFeePerGas)
      );

      await mockInitializationFacetDeployed.waitForDeployment();

      const facetNames = [
        "SellerHandlerFacet",
        "AgentHandlerFacet",
        "DisputeResolverHandlerFacet",
        "OfferHandlerFacet",
        "PauseHandlerFacet",
        "FundsHandlerFacet",
        "ExchangeHandlerFacet",
      ];

      const facetsToDeploy = await getFacetsWithArgs(facetNames);

      // Make initial deployment (simulate v2.1.0)
      await deployAndCutFacets(
        await protocolDiamond.getAddress(),
        facetsToDeploy,
        maxPriorityFeePerGas,
        version,
        mockInitializationFacetDeployed,
        []
      );

      // Deploy v2.2.0 facets
      [{ contract: deployedProtocolInitializationHandlerFacet }, { contract: configHandler }] =
        await deployProtocolFacets(
          ["ProtocolInitializationHandlerFacet", "ConfigHandlerFacet"],
          {},
          maxPriorityFeePerGas
        );

      version = encodeBytes32String("2.2.0");
      // Prepare cut data
      facetCut = await getFacetAddCut(configHandler);
      // Attach correct address to configHandler
      configHandler = configHandler.attach(await protocolDiamond.getAddress());
      // Prepare calldata
      calldataProtocolInitialization = deployedProtocolInitializationHandlerFacet.interface.encodeFunctionData(
        "initialize",
        [version, [], [], true, initializationData, [], []]
      );
    });

    it("Should emit MaxPremintedVouchersChanged event", async function () {
      // Make the cut, check the event
      await expect(
        await diamondCutFacet.diamondCut(
          [facetCut],
          await deployedProtocolInitializationHandlerFacet.getAddress(),
          calldataProtocolInitialization,
          await getFees(maxPriorityFeePerGas)
        )
      )
        .to.emit(configHandler, "MaxPremintedVouchersChanged")
        .withArgs(maxPremintedVouchers, await deployer.getAddress());
    });

    it("Should update state", async function () {
      // Make the cut, check the event
      await diamondCutFacet.diamondCut(
        [facetCut],
        await deployedProtocolInitializationHandlerFacet.getAddress(),
        calldataProtocolInitialization,
        await getFees(maxPriorityFeePerGas)
      );

      const protocolLimitsSlot = BigInt(keccak256(toUtf8Bytes("boson.protocol.limits")));
      const maxPremintedVoucherStorage = await getStorageAt(
        await diamondCutFacet.getAddress(),
        protocolLimitsSlot + 4n
      );

      expect(BigInt(maxPremintedVoucherStorage).toString()).to.equal(maxPremintedVouchers);
    });

    context("💔 Revert Reasons", async function () {
      it("Max preminted vouchers is zero", async function () {
        // set invalid maxPremintedVouchers
        maxPremintedVouchers = "0";
        initializationData = abiCoder.encode(["uint256"], [maxPremintedVouchers]);

        calldataProtocolInitialization = deployedProtocolInitializationHandlerFacet.interface.encodeFunctionData(
          "initialize",
          [version, [], [], true, initializationData, [], []]
        );

        // make diamond cut, expect revert
        await expect(
          diamondCutFacet.diamondCut(
            [facetCut],
            await deployedProtocolInitializationHandlerFacet.getAddress(),
            calldataProtocolInitialization,
            await getFees(maxPriorityFeePerGas)
          )
        ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.VALUE_ZERO_NOT_ALLOWED);
      });

      it("Current version is not 0", async () => {
        // Deploy higher version
        version = "0.0.0";
        const interfaceId = InterfaceIds[interfaceImplementers["ProtocolInitializationHandlerFacet"]];
        const {
          deployedFacets: [{ contract: deployedProtocolInitializationHandlerFacet }],
        } = await deployAndCutFacets(
          await protocolDiamond.getAddress(),
          { ProtocolInitializationHandlerFacet: [version, [], [], true] },
          maxPriorityFeePerGas,
          version,
          undefined,
          [interfaceId]
        );

        // Prepare 2.2.0 deployment
        version = encodeBytes32String("2.2.0");

        // make diamond cut, expect revert
        await expect(
          diamondCutFacet.diamondCut(
            [facetCut],
            await deployedProtocolInitializationHandlerFacet.getAddress(),
            calldataProtocolInitialization,
            await getFees(maxPriorityFeePerGas)
          )
        ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.WRONG_CURRENT_VERSION);
      });
    });
  });

  describe("initV2_2_1", async function () {
    let deployedProtocolInitializationHandlerFacet;
    let facetCut;
    let calldataProtocolInitialization;

    beforeEach(async function () {
      version = "2.2.0";

      const facetsToDeploy = await getV2_2_0DeployConfig();

      // Make initial deployment (simulate v2.2.0)
      await deployAndCutFacets(await protocolDiamond.getAddress(), facetsToDeploy, maxPriorityFeePerGas, version);

      version = "2.2.1";

      // Deploy v2.2.0 facets
      [{ contract: deployedProtocolInitializationHandlerFacet }] = await deployProtocolFacets(
        ["ProtocolInitializationHandlerFacet", "AccountHandlerFacet"],
        {},
        maxPriorityFeePerGas
      );

      // Prepare cut data
      facetCut = await getFacetReplaceCut(deployedProtocolInitializationHandlerFacet, [
        deployedProtocolInitializationHandlerFacet.interface.fragments.find((f) => f.name == "initialize").selector,
      ]);

      // Prepare calldata
      calldataProtocolInitialization = deployedProtocolInitializationHandlerFacet.interface.encodeFunctionData(
        "initialize",
        [encodeBytes32String(version), [], [], true, "0x", [], []]
      );
    });

    it("Should initialize version 2.2.1 and emit ProtocolInitialized", async function () {
      // Make the cut, check the event
      const tx = await diamondCutFacet.diamondCut(
        [facetCut],
        await deployedProtocolInitializationHandlerFacet.getAddress(),
        calldataProtocolInitialization,
        await getFees(maxPriorityFeePerGas)
      );
      expect(tx).to.emit(deployedProtocolInitializationHandlerFacet, "ProtocolInitialized");
    });

    context("💔 Revert Reasons", async function () {
      it("Current version is not 2.2.0", async () => {
        // Deploy higher version
        const wrongVersion = "0.0.0";

        // Prepare calldata
        const calldataProtocolInitializationWrong =
          deployedProtocolInitializationHandlerFacet.interface.encodeFunctionData("initialize", [
            encodeBytes32String(wrongVersion),
            [],
            [],
            true,
            "0x",
            [],
            [],
          ]);

        await diamondCutFacet.diamondCut(
          [facetCut],
          await deployedProtocolInitializationHandlerFacet.getAddress(),
          calldataProtocolInitializationWrong,
          await getFees(maxPriorityFeePerGas)
        );

        const [{ contract: accountHandler }] = await deployProtocolFacets(
          ["AccountHandlerFacet"],
          {},
          maxPriorityFeePerGas
        );

        // Prepare cut data
        facetCut = await getFacetReplaceCut(accountHandler, [
          accountHandler.interface.fragments.find((f) => f.name == "initialize").selector,
        ]);

        // Make diamond cut, expect revert
        await expect(
          diamondCutFacet.diamondCut(
            [facetCut],
            await deployedProtocolInitializationHandlerFacet.getAddress(),
            calldataProtocolInitialization,
            await getFees(maxPriorityFeePerGas)
          )
        ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.WRONG_CURRENT_VERSION);
      });
    });
  });

  describe("initV2_3_0", async function () {
    let deployedProtocolInitializationHandlerFacet, deployedProtocolInitializationHandlerFacetAddress;
    let configHandler;
    let facetCut;
    let calldataProtocolInitialization;
    let minResolutionPeriod;
    let snapshotId;
    let protocolDiamondAddress;

    beforeEach(async function () {
      if (snapshotId) {
        await revertToSnapshot(snapshotId);
        snapshotId = await getSnapshot();
      } else {
        version = "2.2.1";
        protocolDiamondAddress = await protocolDiamond.getAddress();

        // NEED TO ACTUALLY DEPLOY VOUCHER IMPLEMENTATIONS
        const protocolClientArgs = [protocolDiamondAddress];
        const [, beacons] = await deployProtocolClients(
          protocolClientArgs,
          maxPriorityFeePerGas,
          [rando.address] // random address in place of forwarder
        );
        const [beacon] = beacons;

        // @TODO move this to 00_config.js:getFacets
        const facetsToDeploy = await getV2_2_0DeployConfig(); // To deploy 2.2.1, we can use 2.2.0 config
        facetsToDeploy.ConfigHandlerFacet.init[0] = {
          ...facetsToDeploy.ConfigHandlerFacet.init[0],
          voucherBeacon: await beacon.getAddress(),
        };

        let doPreprocess = true; // Due to "hardhat-preprocessor" way of caching, we need a workaround to toggle preprocessing on and off
        // Make initial deployment (simulate v2.2.1)
        // The new config initialization deploys the same voucher proxy as initV2_3_0, which makes the initV2_3_0 test fail
        // One way to approach would be to checkout the contracts from the previous tag.
        // Instead, we will just comment out the voucher proxy initialization in the config handler with preprocess
        hre.config.preprocess = {
          eachLine: () => ({
            transform: (line) => {
              if (doPreprocess) {
                if (
                  line.includes("address beaconProxy = address(new BeaconClientProxy{ salt: VOUCHER_PROXY_SALT }());")
                ) {
                  // comment out the proxy deployment
                  line = "//" + line;
                } else if (line.includes("setBeaconProxyAddress(beaconProxy)")) {
                  // set beacon proxy from config, not the deployed one
                  line = line.replace(
                    "setBeaconProxyAddress(beaconProxy)",
                    "setBeaconProxyAddress(_addresses.beaconProxy)"
                  );
                }
              }
              return line;
            },
          }),
        };

        // Compile old version
        await hre.run("compile");
        await deployAndCutFacets(protocolDiamondAddress, facetsToDeploy, maxPriorityFeePerGas, version);

        // Create a seller so backfilling is possible
        const accountHandler = await getContractAt("IBosonAccountHandler", protocolDiamondAddress);
        const seller = mockSeller(
          await rando.getAddress(),
          await rando.getAddress(),
          ZeroAddress,
          await rando.getAddress()
        );
        const emptyAuthToken = mockAuthToken();
        const voucherInitValues = mockVoucherInitValues();
        await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);

        // Deploy v2.3.0 facets
        // Skip preprocessing and compile new version
        doPreprocess = false;
        await hre.run("compile", { force: true });

        [{ contract: deployedProtocolInitializationHandlerFacet }, { contract: configHandler }] =
          await deployProtocolFacets(
            ["ProtocolInitializationHandlerFacet", "ConfigHandlerFacet", "SellerHandlerFacet"],
            {},
            maxPriorityFeePerGas
          );

        snapshotId = await getSnapshot();
      }
      // Prepare cut data
      facetCut = await getFacetReplaceCut(deployedProtocolInitializationHandlerFacet, [
        deployedProtocolInitializationHandlerFacet.interface.fragments.find((f) => f.name == "initialize").selector,
      ]);

      // initialization data for v2.3.0
      minResolutionPeriod = oneWeek;
      initializationData = abiCoder.encode(["uint256"], [minResolutionPeriod]);

      // Prepare calldata
      version = "2.3.0";
      calldataProtocolInitialization = deployedProtocolInitializationHandlerFacet.interface.encodeFunctionData(
        "initialize",
        [encodeBytes32String(version), [], [], true, initializationData, [], []]
      );

      configHandler = configHandler.attach(protocolDiamondAddress);

      deployedProtocolInitializationHandlerFacetAddress = await deployedProtocolInitializationHandlerFacet.getAddress();

      diamondCutFacet = await getContractAt("DiamondCutFacet", protocolDiamondAddress);
    });

    it("Should emit a MinResolutionPeriodChanged event", async function () {
      // Make the cut, check the event
      await expect(
        diamondCutFacet.diamondCut(
          [facetCut],
          deployedProtocolInitializationHandlerFacetAddress,
          calldataProtocolInitialization
        )
      )
        .to.emit(configHandler, "MinResolutionPeriodChanged")
        .withArgs(minResolutionPeriod, await deployer.getAddress());
    });

    it("Should update state", async function () {
      // Make the cut, check the event
      await diamondCutFacet.diamondCut(
        [facetCut],
        deployedProtocolInitializationHandlerFacetAddress,
        calldataProtocolInitialization
      );

      // Verify that new value is stored
      expect(await configHandler.connect(rando).getMinResolutionPeriod()).to.equal(minResolutionPeriod);
    });

    context("💔 Revert Reasons", async function () {
      it("Next twin id is not 1", async () => {
        // Make a twin
        const twinHandler = await getContractAt("IBosonTwinHandler", protocolDiamondAddress);
        const [bosonToken] = await deployMockTokens();
        await bosonToken.connect(rando).approve(await twinHandler.getAddress(), 1);

        let twin = mockTwin(await bosonToken.getAddress(), TokenType.FungibleToken);
        await twinHandler.connect(rando).createTwin(twin);

        // make diamond cut, expect revert
        await expect(
          diamondCutFacet.diamondCut(
            [facetCut],
            deployedProtocolInitializationHandlerFacetAddress,
            calldataProtocolInitialization
          )
        ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.TWINS_ALREADY_EXIST);
      });

      it("Min resolution period is zero", async function () {
        version = "2.3.0";
        minResolutionPeriod = "0";
        initializationData = abiCoder.encode(["uint256", "uint256[]", "address[]"], [minResolutionPeriod, [], []]);

        calldataProtocolInitialization = deployedProtocolInitializationHandlerFacet.interface.encodeFunctionData(
          "initialize",
          [encodeBytes32String(version), [], [], true, initializationData, [], []]
        );

        // make diamond cut, expect revert
        await expect(
          diamondCutFacet.diamondCut(
            [facetCut],
            deployedProtocolInitializationHandlerFacetAddress,
            calldataProtocolInitialization
          )
        ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.VALUE_ZERO_NOT_ALLOWED);
      });

      it("Min resolution period is greater than max resolution period", async function () {
        version = "2.3.0";
        await configHandler.connect(deployer).setMaxResolutionPeriod(oneMonth);
        minResolutionPeriod = oneMonth + 1n;
        initializationData = abiCoder.encode(["uint256", "uint256[]", "address[]"], [minResolutionPeriod, [], []]);
        calldataProtocolInitialization = deployedProtocolInitializationHandlerFacet.interface.encodeFunctionData(
          "initialize",
          [encodeBytes32String(version), [], [], true, initializationData, [], []]
        );

        await expect(
          diamondCutFacet.diamondCut(
            [facetCut],
            deployedProtocolInitializationHandlerFacetAddress,
            calldataProtocolInitialization
          )
        ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_RESOLUTION_PERIOD);
      });

      it("Current version is not 2.2.1", async () => {
        // replace ProtocolInitializationHandlerFacet with incorrect version
        version = "2.2.2";
        calldataProtocolInitialization = deployedProtocolInitializationHandlerFacet.interface.encodeFunctionData(
          "initialize",
          [encodeBytes32String(version), [], [], true, "0x", [], []]
        );
        [{ contract: deployedProtocolInitializationHandlerFacet }] = await deployProtocolFacets(
          ["ProtocolInitializationHandlerFacet"],
          {},
          maxPriorityFeePerGas
        );
        facetCut = await getFacetReplaceCut(deployedProtocolInitializationHandlerFacet, [
          deployedProtocolInitializationHandlerFacet.interface.fragments.find((f) => f.name == "initialize").selector,
        ]);
        await diamondCutFacet.diamondCut(
          [facetCut],
          await deployedProtocolInitializationHandlerFacet.getAddress(),
          calldataProtocolInitialization
        );

        // Prepare 2.3.0 deployment
        version = "2.3.0";
        calldataProtocolInitialization = deployedProtocolInitializationHandlerFacet.interface.encodeFunctionData(
          "initialize",
          [encodeBytes32String(version), [], [], true, "0x", [], []]
        );
        [{ contract: deployedProtocolInitializationHandlerFacet }] = await deployProtocolFacets(
          ["ProtocolInitializationHandlerFacet"],
          {},
          maxPriorityFeePerGas
        );
        facetCut = await getFacetReplaceCut(deployedProtocolInitializationHandlerFacet, [
          deployedProtocolInitializationHandlerFacet.interface.fragments.find((f) => f.name == "initialize").selector,
        ]);

        // make diamond cut, expect revert
        await expect(
          diamondCutFacet.diamondCut(
            [facetCut],
            await deployedProtocolInitializationHandlerFacet.getAddress(),
            calldataProtocolInitialization
          )
        ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.WRONG_CURRENT_VERSION);
      });
    });
  });
});
