const hre = require("hardhat");
const { expect } = require("chai");
const { utils, BigNumber } = hre.ethers;
const { getStorageAt } = require("@nomicfoundation/hardhat-network-helpers");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { setupTestEnvironment, getSnapshot, revertToSnapshot } = require("../util/utils.js");

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
  let pauser, rando;
  let erc165, pauseHandler, support, regions;
  let snapshotId;
  // uint256 constant ALL_REGIONS_MASK = (1 << (uint256(type(BosonTypes.PausableRegion).max) + 1)) - 1;
  const ALL_REGIONS_MASK = (1 << PausableRegion.Regions.length) - 1;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();

    // Specify contracts needed for this test
    const contracts = {
      erc165: "ERC165Facet",
      pauseHandler: "IBosonPauseHandler",
    };

    ({
      signers: [pauser, rando],
      contractInstances: { erc165, pauseHandler },
    } = await setupTestEnvironment(contracts));

    // Get snapshot id
    snapshotId = await getSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();
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
    let protocolStatusStorageSlotNumber;

    function scenarioToRegions(scenario) {
      const regions = [];
      let region = 0;
      while (scenario > 1) {
        if (scenario % 2 === 1) {
          console.log(region, scenario);
          regions.push(region);
        }
        scenario = Math.floor(scenario / 2);
        region++;
      }
      return regions;
    }

    before(async function () {
      const protocolStatusStorageSlot = utils.keccak256(utils.toUtf8Bytes("boson.protocol.initializers"));
      protocolStatusStorageSlotNumber = BigNumber.from(protocolStatusStorageSlot);
    });

    context("👉 pause()", async function () {
      it("should emit a ProtocolPaused event", async function () {
        // Regions to pause
        regions = [PausableRegion.Offers, PausableRegion.Twins, PausableRegion.Bundles];

        // Pause the protocol, testing for the event
        await expect(pauseHandler.connect(pauser).pause(regions))
          .to.emit(pauseHandler, "ProtocolPaused")
          .withArgs(regions, pauser.address);
      });

      it("should pause all regions when no regions are specified", async function () {
        // Pause the protocol, testing for the event
        await expect(pauseHandler.connect(pauser).pause([]))
          .to.emit(pauseHandler, "ProtocolPaused")
          .withArgs([], pauser.address);

        // Check that all regions are paused
        const pauseScenario = await getStorageAt(pauseHandler.address, protocolStatusStorageSlotNumber);
        expect(BigNumber.from(pauseScenario).toNumber(), "Protocol not paused").to.equal(ALL_REGIONS_MASK);

        // Check that all regions are paused
        const pausedRegions = await pauseHandler.getPauseStatus();
        await expect(pausedRegions).to.deep.equal(scenarioToRegions(ALL_REGIONS_MASK));
      });

      it("Can incrementally pause regions", async function () {
        // Regions to pause
        regions = [PausableRegion.Offers, PausableRegion.Twins, PausableRegion.Bundles];

        // Pause protocol
        await pauseHandler.connect(pauser).pause(regions);

        const oldRegions = regions;
        regions = [PausableRegion.Sellers, PausableRegion.DisputeResolvers];

        // Pause the protocol, testing for the events
        await expect(pauseHandler.connect(pauser).pause(regions))
          .to.emit(pauseHandler, "ProtocolPaused")
          .withArgs(regions, pauser.address);

        // Check that both old and news regions are pause
        const pausedRegions = await pauseHandler.getPauseStatus();
        await expect(pausedRegions).to.deep.equal([...oldRegions, ...regions]);
      });

      it("If region is already paused, shouldn't increment", async function () {
        // Regions to pause
        regions = [PausableRegion.Offers, PausableRegion.Twins, PausableRegion.Bundles];

        // Pause protocol
        await pauseHandler.connect(pauser).pause(regions);

        // Pause protocol again
        await pauseHandler.connect(pauser).pause([PausableRegion.Twins]);

        // Check that regions remains the same
        const pausedRegions = await pauseHandler.getPauseStatus();
        await expect(pausedRegions).to.deep.equal(regions);
      });

      context("💔 Revert Reasons", async function () {
        it("Caller does not have PAUSER role", async function () {
          // Attempt to pause without PAUSER role, expecting revert
          await expect(pauseHandler.connect(rando).pause([])).to.revertedWith(RevertReasons.ACCESS_DENIED);
        });
      });
    });

    context("👉 unpause()", async function () {
      it("should emit a ProtocolUnpaused event", async function () {
        const regions = [PausableRegion.Sellers, PausableRegion.DisputeResolvers];

        // Pause protocol
        await pauseHandler.connect(pauser).pause(regions);

        // Unpause the protocol, testing for the event
        await expect(pauseHandler.connect(pauser).unpause(regions))
          .to.emit(pauseHandler, "ProtocolUnpaused")
          .withArgs(regions, pauser.address);
      });

      it("should be possible to pause again after an unpause", async function () {
        let regions = [PausableRegion.Sellers, PausableRegion.DisputeResolvers];

        // Pause protocol
        await pauseHandler.connect(pauser).pause(regions);

        // Unpause the protocol, testing for the event
        await pauseHandler.connect(pauser).unpause(regions);

        // Pause the protocol, testing for the event
        regions = [PausableRegion.Funds];

        await expect(pauseHandler.connect(pauser).pause(regions))
          .to.emit(pauseHandler, "ProtocolPaused")
          .withArgs(regions, pauser.address);
      });

      it("Can unpause individual regions", async function () {
        // Regions to paused
        regions = [PausableRegion.Offers, PausableRegion.Twins, PausableRegion.Bundles];

        // Pause protocol
        await pauseHandler.connect(pauser).pause(regions);

        // Unpause protocol
        await pauseHandler.connect(pauser).unpause([PausableRegion.Offers]);

        // Check that Offer is not in the paused regions anymore
        const pausedRegions = await pauseHandler.getPausedRegions();
        expect(pausedRegions).to.deep.equal([PausableRegion.Twins, PausableRegion.Bundles]);
      });

      context("💔 Revert Reasons", async function () {
        it("Caller does not have PAUSER role", async function () {
          // Pause protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Exchanges]);

          // Attempt to unpause without PAUSER role, expecting revert
          await expect(pauseHandler.connect(rando).unpause([])).to.revertedWith(RevertReasons.ACCESS_DENIED);
        });

        it("Protocol is not currently paused", async function () {
          // Attempt to unpause while not paused, expecting revert
          await expect(pauseHandler.connect(pauser).unpause([])).to.revertedWith(RevertReasons.NOT_PAUSED);
        });
      });
    });

    context("getPausedRegions()", async function () {
      it("should return the correct pause status", async function () {
        // Regions to paused
        regions = [PausableRegion.Offers, PausableRegion.Buyers, PausableRegion.Orchestration];

        await pauseHandler.connect(pauser).pause(regions);

        const pausedRegions = await pauseHandler.getPausedRegions();

        expect(pausedRegions, "Protocol not paused").to.deep.equal(regions);
      });
    });
  });
});
