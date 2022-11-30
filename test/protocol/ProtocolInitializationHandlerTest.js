const { expect } = require("chai");
const hre = require("hardhat");
const ethers = hre.ethers;

const Role = require("../../scripts/domain/Role");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacetsWithArgs } = require("../../scripts/util/deploy-protocol-handler-facets");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces");
const { maxPriorityFeePerGas } = require("../util/constants");
const { getFees } = require("../../scripts/util/utils");
const { getFacetAddCut, getFacetReplaceCut } = require("../../scripts/util/diamond-utils");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");

describe("ProtocolInitializationHandler", async function () {
  // Common vars
  let InterfaceIds;
  let deployer, rando;
  let protocolInitializationFacet, diamondCutFacet;
  let protocolDiamond, accessController;
  let erc165;

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
    protocolInitializationFacet = await ethers.getContractAt(
      "ProtocolInitializationHandlerFacet",
      protocolDiamond.address
    );
  });

  describe("Deploy tests", async function () {
    context("📋 Initializer", async function () {
      it("Should initialize the version 2.2.0 and emit ProtocolInitialized", async function () {
        const version = ethers.utils.formatBytes32String("2.2.0");

        const [deployedProcolInitializationFacet] = await deployProtocolHandlerFacetsWithArgs(
          protocolDiamond,
          { ProtocolInitializationHandlerFacet: [version] },
          maxPriorityFeePerGas
        );

        const { cutTransaction } = deployedProcolInitializationFacet;

        await expect(cutTransaction).to.emit(protocolInitializationFacet, "ProtocolInitialized").withArgs(version);
      });

      context("💔 Revert Reasons", async function () {
        it("Should revert when calling initialize with same version twice", async function () {
          const ProtocolInitilizationContractFactory = await ethers.getContractFactory(
            "ProtocolInitializationHandlerFacet"
          );
          const protocolInitializationFacetDeployed = await ProtocolInitilizationContractFactory.deploy(
            await getFees(maxPriorityFeePerGas)
          );
          await protocolInitializationFacetDeployed.deployTransaction.wait();

          const version = ethers.utils.formatBytes32String("2.2.0");

          const callData = protocolInitializationFacetDeployed.interface.encodeFunctionData("initialize", [version]);

          let facetCut = getFacetAddCut(protocolInitializationFacetDeployed, [callData.slice(0, 10)]);

          await diamondCutFacet.diamondCut(
            [facetCut],
            protocolInitializationFacetDeployed.address,
            callData,
            await getFees(maxPriorityFeePerGas)
          );

          // Mock a change in the initialize function because diamond cut will revert if contract stay the same
          const ProtocolInitilizationTestContractFactory = await ethers.getContractFactory(
            "ProtocolInitializationHandlerTestFacet"
          );

          const protocolInitializationTestFacet = await ProtocolInitilizationTestContractFactory.deploy(
            await getFees(maxPriorityFeePerGas)
          );

          await protocolInitializationTestFacet.deployTransaction.wait();

          facetCut = getFacetReplaceCut(protocolInitializationTestFacet, [callData.slice(0, 10)]);

          const cutTransaction = diamondCutFacet.diamondCut(
            [facetCut],
            protocolInitializationTestFacet.address,
            callData,
            await getFees(maxPriorityFeePerGas)
          );

          await expect(cutTransaction).to.be.revertedWith(RevertReasons.ALREADY_INITIALIZED);
        });
      });
    });
  });

  describe("After deploy tests", async function () {
    beforeEach(async function () {
      const version = ethers.utils.formatBytes32String("2.2.0");

      await deployProtocolHandlerFacetsWithArgs(
        protocolDiamond,
        { ProtocolInitializationHandlerFacet: [version] },
        maxPriorityFeePerGas
      );
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
  });
});
