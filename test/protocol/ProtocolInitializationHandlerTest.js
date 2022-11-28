const { assert, expect } = require("chai");
const hre = require("hardhat");
const ethers = hre.ethers;

const Role = require("../../scripts/domain/Role");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const {
  deployProtocolHandlerFacetsWithArgs,
  deployProtocolHandlerFacets,
} = require("../../scripts/util/deploy-protocol-handler-facets");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces");
const { maxPriorityFeePerGas } = require("../util/constants");

describe.only("ProtocolInitializationHandler", async function () {
  // Common vars
  let InterfaceIds;
  let deployer, admin, rando;
  let protocolInitializationHandler;
  let protocolDiamond, accessController;
  let erc165;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();
  });

  beforeEach(async function () {
    // Make accounts available
    [deployer, admin, rando] = await ethers.getSigners();

    // Deploy the Protocol Diamond
    [protocolDiamond, , , , accessController] = await deployProtocolDiamond(maxPriorityFeePerGas);

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Cut the protocol handler facets into the Diamond
    // await deployProtocolHandlerFacets(
    //   protocolDiamond,
    //   ["DisputeResolverHandlerFacet", "TwinHandlerFacet"],
    //   maxPriorityFeePerGas
    // );

    // Cast Diamond to IERC165
    erc165 = await ethers.getContractAt("ERC165Facet", protocolDiamond.address);

    protocolInitializationHandler = await ethers.getContractAt(
      "ProtocolInitializationHandlerFacet",
      protocolDiamond.address
    );
  });

  describe("Deploy tests", async function () {
    context("📋 Initializer", async function () {
      it("should initialize the version 2.1.0 and emit ProtocolInitialized", async function () {
        const version = ethers.utils.formatBytes32String("2.2.0");

        const [deployedProcolInitializationFacet] = await deployProtocolHandlerFacetsWithArgs(
          protocolDiamond,
          { ProtocolInitializationHandlerFacet: [version] },
          maxPriorityFeePerGas
        );

        const { cutTransaction } = deployedProcolInitializationFacet;

        await expect(cutTransaction).to.emit(protocolInitializationHandler, "ProtocolInitialized").withArgs(version);
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
  });
});
