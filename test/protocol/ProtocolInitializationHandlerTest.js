const { assert, expect } = require("chai");
const hre = require("hardhat");
const ethers = hre.ethers;

const Role = require("../../scripts/domain/Role");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const {
  getFacetAddCut,
  getSelectors,
  FacetCutAction,
  removeSelectors,
} = require("../../scripts/util/diamond-utils.js");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces");
const { maxPriorityFeePerGas } = require("../util/constants");

const { getFees } = require("../../scripts/util/utils.js");

describe("ProtocolDiamond", async function () {
  // Common vars
  let InterfaceIds;
  let deployer, admin, upgrader, rando;
  let protocolInitializationHandler;
  let protocolDiamond, accessController;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();
  });

  beforeEach(async function () {
    // Make accounts available
    [deployer, admin, upgrader, rando] = await ethers.getSigners();

    // Deploy the Protocol Diamond
    [protocolDiamond, , , , accessController] = await deployProtocolDiamond(maxPriorityFeePerGas);

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Cast Diamond to IERC165
    erc165 = await ethers.getContractAt("ERC165Facet", protocolDiamond.address);

    // Cast Diamond to DiamondCutFacet
    diamondCutFacet = await ethers.getContractAt("DiamondCutFacet", protocolDiamond.address);

    // Deploy ProtocolInitializationHandler
    let FacetContractFactory = await ethers.getContractFactory("ProtocolInitializationHandlerFacet");
    const facetContract = await FacetContractFactory.deploy();

    await facetContract.deployTransaction.wait();

    // Initialize ProtocolInitializationHandler
    const callData = facetContract.interface.encodeFunctionData("initialize", ["2.2.0"]);
    const facetCut = getFacetAddCut(facetContract);

    const transactionResponse = await diamondCutFacet.diamondCut(
      [facetCut],
      facetContract.address,
      callData,
      await getFees(maxPriorityFeePerGas)
    );

    await transactionResponse.wait();

    // Cast Diamond to IBosonConfigHandler
    protocolInitializationHandler = await ethers.getContractAt(
      "IBosonProtocolInitializationHandler",
      protocolDiamond.address
    );
  });

  // Interface support (ERC-156 provided by ProtocolDiamond, others by deployed facets)
  context("📋 Interfaces", async function () {
    context.only("👉 supportsInterface()", async function () {
      it("should indicate support for IBosonConfigHandler interface", async function () {
        // Current interfaceId for IBosonConfigHandler
        support = await erc165.supportsInterface(InterfaceIds.IBosonProtocolInitializationHandler);

        // Test
        expect(support, "IBosonProtocolInitializationHandler interface not supported").is.true;
      });
    });
  });
});
