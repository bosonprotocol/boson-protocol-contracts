const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");

const Role = require("../../scripts/domain/Role.js");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployAndCutFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { maxPriorityFeePerGas } = require("../util/constants");
const { getFacetsWithArgs } = require("../util/utils.js");

/**
 *  Test the Boson Pause Handler interface
 *
 *  Note: This only tests the pause/unpause functionality.
 *        Every transactional protocol method is tested
 *        for pausability in the test suites for the
 *        facets where they live.
 */
describe("IBosonPauseHandler", function () {
  // Common vars
  let InterfaceIds;
  let deployer, pauser, rando;
  let erc165, protocolDiamond, accessController, pauseHandler, support, regions;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();
  });

  beforeEach(async function () {
    // Make accounts available
    [deployer, pauser, rando] = await ethers.getSigners();

    // Deploy the Protocol Diamond
    [protocolDiamond, , , , accessController] = await deployProtocolDiamond(maxPriorityFeePerGas);

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Temporarily grant PAUSER role to pauser account
    await accessController.grantRole(Role.PAUSER, pauser.address);

    const facetNames = ["PauseHandlerFacet", "ProtocolInitializationHandlerFacet"];

    const facetsToDeploy = await getFacetsWithArgs(facetNames);

    // Cut the protocol handler facets into the Diamond
    await deployAndCutFacets(protocolDiamond.address, facetsToDeploy, maxPriorityFeePerGas);

    // Cast Diamond to IERC165
    erc165 = await ethers.getContractAt("ERC165Facet", protocolDiamond.address);

    // Cast Diamond to IBosonPauseHandler
    pauseHandler = await ethers.getContractAt("IBosonPauseHandler", protocolDiamond.address);
  });

  // Interface support (ERC-156 provided by ProtocolDiamond, others by deployed facets)
  context("📋 Interfaces", async function () {
    context("👉 supportsInterface()", async function () {
      it("should indicate support for IBosonPauseHandler interface", async function () {
        // Current interfaceId for IBosonPauseHandler
        support = await erc165.supportsInterface(InterfaceIds.IBosonPauseHandler);

        // Test
        expect(support, "IBosonPauseHandler interface not supported").is.true;
      });
    });
  });

  // All supported methods
  context("📋 Pause Handler Methods", async function () {
    context("👉 pause()", async function () {
      it("should emit a ProtocolPaused event", async function () {
        // Regions to pause
        regions = [PausableRegion.Offers, PausableRegion.Twins, PausableRegion.Bundles];

        // Pause the protocal, testing for the event
        await expect(pauseHandler.connect(pauser).pause(regions))
          .to.emit(pauseHandler, "ProtocolPaused")
          .withArgs(regions, pauser.address);
      });

      context("💔 Revert Reasons", async function () {
        it("Caller does not have PAUSER role", async function () {
          // Attempt to pause without PAUSER role, expecting revert
          await expect(pauseHandler.connect(rando).pause([])).to.revertedWith(RevertReasons.ACCESS_DENIED);
        });

        it("No regions are specified", async function () {
          // Attempt to pause with no regions, expecting revert
          await expect(pauseHandler.connect(pauser).pause([])).to.revertedWith(RevertReasons.NO_REGIONS_SPECIFIED);
        });

        it("Protocol is already paused", async function () {
          // Pause protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Sellers]);

          // Attempt to pause while already paused, expecting revert
          await expect(pauseHandler.connect(pauser).pause([PausableRegion.Buyers])).to.revertedWith(
            RevertReasons.ALREADY_PAUSED
          );
        });

        it("A region is specified more than once", async function () {
          // Regions to pause
          regions = [PausableRegion.Offers, PausableRegion.Twins, PausableRegion.Bundles, PausableRegion.Twins];

          // Attempt to pause with a duplicate region, expecting revert
          await expect(pauseHandler.connect(pauser).pause(regions)).to.revertedWith(RevertReasons.REGION_DUPLICATED);
        });
      });
    });

    context("👉 unpause()", async function () {
      it("should emit a ProtocolUnpaused event", async function () {
        // Pause protocol
        await pauseHandler.connect(pauser).pause([PausableRegion.Sellers, PausableRegion.DisputeResolvers]);

        // Unpause the protocal, testing for the event
        await expect(pauseHandler.connect(pauser).unpause())
          .to.emit(pauseHandler, "ProtocolUnpaused")
          .withArgs(pauser.address);
      });

      it("should be possible to pause again after an unpause", async function () {
        // Pause protocol
        await pauseHandler.connect(pauser).pause([PausableRegion.Sellers, PausableRegion.DisputeResolvers]);

        // Unpause the protocal, testing for the event
        await pauseHandler.connect(pauser).unpause();

        // Pause the protocal, testing for the event
        regions = [PausableRegion.Funds];
        await expect(pauseHandler.connect(pauser).pause(regions))
          .to.emit(pauseHandler, "ProtocolPaused")
          .withArgs(regions, pauser.address);
      });

      context("💔 Revert Reasons", async function () {
        it("Caller does not have PAUSER role", async function () {
          // Pause protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Exchanges]);

          // Attempt to unpause without PAUSER role, expecting revert
          await expect(pauseHandler.connect(rando).pause([])).to.revertedWith(RevertReasons.ACCESS_DENIED);
        });

        it("Protocol is not currently paused", async function () {
          // Attempt to unpause while not paused, expecting revert
          await expect(pauseHandler.connect(pauser).unpause()).to.revertedWith(RevertReasons.NOT_PAUSED);
        });
      });
    });
  });
});
