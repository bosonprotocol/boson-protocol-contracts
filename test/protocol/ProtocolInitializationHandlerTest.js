const { expect } = require("chai");
const hre = require("hardhat");
const ethers = hre.ethers;

const Role = require("../../scripts/domain/Role");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces");
const { maxPriorityFeePerGas } = require("../util/constants");
const { getFees } = require("../../scripts/util/utils");
const { getFacetAddCut } = require("../../scripts/util/diamond-utils");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");

describe("ProtocolInitializationHandler", async function () {
  // Common vars
  let InterfaceIds;
  let deployer, rando;
  let protocolInitializationFacet, diamondCutFacet;
  let protocolDiamond, accessController;
  let erc165;
  let version;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();
  });

  beforeEach(async function () {
    // Make accounts available
    [deployer, rando] = await ethers.getSigners();

    // Deploy the Protocol Diamond
    [protocolDiamond, , , , accessController] = await deployProtocolDiamond(maxPriorityFeePerGas);

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Temporarily grant UPGRADER role to deployer 1ccount
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Cast Diamond to IERC165
    erc165 = await ethers.getContractAt("ERC165Facet", protocolDiamond.address);

    // Cast Diamond to DiamondCutFacet
    diamondCutFacet = await ethers.getContractAt("DiamondCutFacet", protocolDiamond.address);

    // Cast Diamond to ProtocolInitializationFacet
    protocolInitializationFacet = await ethers.getContractAt("ProtocolInitializationFacet", protocolDiamond.address);

    version = ethers.utils.formatBytes32String("2.2.0");
  });

  describe("Deploy tests", async function () {
    context("📋 Initializer", async function () {
      it("Should initialize version 2.2.0 and emit ProtocolInitialized", async function () {
        const { cutTransaction } = await deployProtocolHandlerFacets(
          protocolDiamond,
          { ProtocolInitializationFacet: [] },
          maxPriorityFeePerGas
        );

        expect(cutTransaction).to.emit(protocolInitializationFacet, "ProtocolInitialized").withArgs(version);
      });

      context("💔 Revert Reasons", async function () {
        let protocolInitializationFacetDeployed;
        beforeEach(async function () {
          const ProtocolInitilizationContractFactory = await ethers.getContractFactory("ProtocolInitializationFacet");
          protocolInitializationFacetDeployed = await ProtocolInitilizationContractFactory.deploy(
            await getFees(maxPriorityFeePerGas)
          );

          await protocolInitializationFacetDeployed.deployTransaction.wait();
        });
        it("Addresses and calldata length mismatch", async function () {
          const callData = protocolInitializationFacetDeployed.interface.encodeFunctionData("initialize", [
            version,
            [rando.address],
            [],
            true,
          ]);

          let facetCut = getFacetAddCut(protocolInitializationFacetDeployed, [callData.slice(0, 10)]);

          const cutArgs = [
            [facetCut],
            protocolInitializationFacetDeployed.address,
            callData,
            await getFees(maxPriorityFeePerGas),
          ];

          await expect(diamondCutFacet.connect(deployer).diamondCut(...cutArgs)).to.revertedWith(
            RevertReasons.ADDRESSES_AND_CALLDATA_MUST_BE_SAME_LENGTH
          );
        });

        it("Version is empty", async function () {
          const callData = protocolInitializationFacetDeployed.interface.encodeFunctionData("initialize", [
            ethers.constants.HashZero,
            [],
            [],
            true,
          ]);

          let facetCut = getFacetAddCut(protocolInitializationFacetDeployed, [callData.slice(0, 10)]);

          const cutArgs = [
            [facetCut],
            protocolInitializationFacetDeployed.address,
            callData,
            await getFees(maxPriorityFeePerGas),
          ];

          await expect(diamondCutFacet.connect(deployer).diamondCut(...cutArgs)).to.revertedWith(
            RevertReasons.VERSION_MUST_BE_SET
          );
        });

        it("Initialize same version twice", async function () {
          const callData = protocolInitializationFacetDeployed.interface.encodeFunctionData("initialize", [
            version,
            [],
            [],
            true,
          ]);

          let facetCut = getFacetAddCut(protocolInitializationFacetDeployed, [callData.slice(0, 10)]);

          await diamondCutFacet.diamondCut(
            [facetCut],
            protocolInitializationFacetDeployed.address,
            callData,
            await getFees(maxPriorityFeePerGas)
          );

          // Mock a new facet to add to diamond so we can call initialize again
          let FacetTestFactory = await ethers.getContractFactory("Test3Facet");
          const testFacet = await FacetTestFactory.deploy(await getFees(maxPriorityFeePerGas));
          await testFacet.deployTransaction.wait();

          const calldataTestFacet = testFacet.interface.encodeFunctionData("initialize", [rando.address]);

          facetCut = getFacetAddCut(testFacet, [calldataTestFacet.slice(0, 10)]);

          const calldataProtocolInitialization = protocolInitializationFacetDeployed.interface.encodeFunctionData(
            "initialize",
            [version, [testFacet.address], [calldataTestFacet], true]
          );

          const cutTransaction = diamondCutFacet.diamondCut(
            [facetCut],
            protocolInitializationFacetDeployed.address,
            calldataProtocolInitialization,
            await getFees(maxPriorityFeePerGas)
          );

          await expect(cutTransaction).to.be.revertedWith(RevertReasons.ALREADY_INITIALIZED);
        });
      });
    });
  });

  describe("After deploy tests", async function () {
    let deployedProtocolInitializationFacet;
    beforeEach(async function () {
      const { deployedFacets } = await deployProtocolHandlerFacets(
        protocolDiamond,
        { ProtocolInitializationFacet: [version, [], [], true] },
        maxPriorityFeePerGas
      );
      deployedProtocolInitializationFacet = deployedFacets[0];
    });

    // Interface support (ERC-156 provided by ProtocolDiamond, others by deployed facets)
    context("📋 Interfaces", async function () {
      context("👉 supportsInterface()", async function () {
        it("should indicate support for IBosonProtocolInitializationHandler interface", async function () {
          // Current interfaceId for IBosonConfigHandler
          const support = await erc165.supportsInterface(InterfaceIds.IBosonProtocolInitializationHandler);

          // Test
          expect(support, "IBosonProtocolInitializationHandler interface not supported").is.true;
        });
      });
    });

    it("Should return the correct version", async function () {
      const version = await protocolInitializationFacet.connect(rando).getVersion();

      expect(ethers.utils.parseBytes32String(version)).to.equal("2.2.0");
    });

    it("Should call facet initializer internally when _addresses and _calldata are supplied", async function () {
      let FacetTestFactory = await ethers.getContractFactory("Test3Facet");
      const testFacet = await FacetTestFactory.deploy(await getFees(maxPriorityFeePerGas));
      await testFacet.deployTransaction.wait();

      const calldataTestFacet = testFacet.interface.encodeFunctionData("initialize", [rando.address]);

      version = ethers.utils.formatBytes32String("2.3.0");
      const calldataProtocolInitialization = deployedProtocolInitializationFacet.contract.interface.encodeFunctionData(
        "initialize",
        [version, [testFacet.address], [calldataTestFacet], true]
      );

      const facetCuts = [getFacetAddCut(testFacet)];

      await diamondCutFacet.diamondCut(
        facetCuts,
        deployedProtocolInitializationFacet.contract.address,
        calldataProtocolInitialization,
        await getFees(maxPriorityFeePerGas)
      );

      const testFacetContract = await ethers.getContractAt("Test3Facet", protocolDiamond.address);

      expect(await testFacetContract.getTestAddress()).to.equal(rando.address);
    });

    context("💔 Revert Reasons", async function () {
      let testFacet, version;

      beforeEach(async function () {
        let FacetTestFactory = await ethers.getContractFactory("Test3Facet");
        testFacet = await FacetTestFactory.deploy(await getFees(maxPriorityFeePerGas));
        await testFacet.deployTransaction.wait();

        version = ethers.utils.formatBytes32String("2.3.0");
      });
      it("Delegate call to initialize fails", async function () {
        const calldataTestFacet = testFacet.interface.encodeFunctionData("initialize", [testFacet.address]);

        const calldataProtocolInitialization =
          deployedProtocolInitializationFacet.contract.interface.encodeFunctionData("initialize", [
            version,
            [testFacet.address],
            [calldataTestFacet],
            true,
          ]);

        const facetCuts = [getFacetAddCut(testFacet)];

        await expect(
          diamondCutFacet.diamondCut(
            facetCuts,
            deployedProtocolInitializationFacet.contract.address,
            calldataProtocolInitialization,
            await getFees(maxPriorityFeePerGas)
          )
        ).to.be.revertedWith(RevertReasons.CONTRACT_NOT_ALLOWED);
      });

      it("Revert with default reason if not supplied by implementation", async () => {
        // If the caller's address is supplied Test3Facet's initializer will revert with no reason
        // and so the diamondCut function will supply it's own reason
        const calldataTestFacet = testFacet.interface.encodeFunctionData("initialize", [deployer.address]);

        const calldataProtocolInitialization =
          deployedProtocolInitializationFacet.contract.interface.encodeFunctionData("initialize", [
            version,
            [testFacet.address],
            [calldataTestFacet],
            true,
          ]);

        const facetCuts = [getFacetAddCut(testFacet)];

        await expect(
          diamondCutFacet.diamondCut(
            facetCuts,
            deployedProtocolInitializationFacet.contract.address,
            calldataProtocolInitialization,
            await getFees(maxPriorityFeePerGas)
          )
        ).to.be.revertedWith(RevertReasons.PROTOCOL_INITIALIZATION_FAILED);
      });
    });
  });
});
