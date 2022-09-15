const hre = require("hardhat");
const ethers = hre.ethers;

const { gasLimit } = require("../../../environments");
const { deployProtocolClients } = require("../../../scripts/util/deploy-protocol-clients");
const { deployProtocolDiamond } = require("../../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolClientImpls } = require("../../../scripts/util/deploy-protocol-client-impls.js");
const { deployProtocolClientBeacons } = require("../../../scripts/util/deploy-protocol-client-beacons.js");
const Role = require("../../../scripts/domain/Role");
const { expect } = require("chai");
const { RevertReasons } = require("../../../scripts/config/revert-reasons");

describe("IClientExternalAddresses", function () {
  let accessController;
  let deployer, protocol, rando, other1, other2, other3;
  let beacon;
  let voucherImplementation, protocolAddress;

  beforeEach(async function () {
    // Set signers
    [deployer, protocol, rando, other1, other2, other3] = await ethers.getSigners();

    // Deploy accessController
    [, , , , accessController] = await deployProtocolDiamond();

    // grant upgrader role
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Deploy client
    const protocolClientArgs = [accessController.address, protocol.address];
    const [, beacons] = await deployProtocolClients(protocolClientArgs, gasLimit);
    [beacon] = beacons;
  });

  // Interface support
  context("📋 Setters", async function () {
    context("👉 setImplementation()", async function () {
      beforeEach(async function () {
        // set new value for voucher implementation
        voucherImplementation = other1.address; // random address, just for test
      });

      it("should emit a Upgraded event", async function () {
        // Set new implementation, testing for the event
        await expect(beacon.connect(deployer).setImplementation(voucherImplementation))
          .to.emit(beacon, "Upgraded")
          .withArgs(voucherImplementation, deployer.address);
      });

      it("should update state", async function () {
        // Set new implementation
        await beacon.connect(deployer).setImplementation(voucherImplementation);

        // Verify that new value is stored
        expect(await beacon.connect(rando).getImplementation()).to.equal(voucherImplementation);
      });

      context("💔 Revert Reasons", async function () {
        it("caller is not the admin", async function () {
          // Attempt to set new implementation, expecting revert
          await expect(beacon.connect(rando).setImplementation(voucherImplementation)).to.revertedWith(
            RevertReasons.ACCESS_DENIED
          );
        });
      });
    });

    context("👉 setAccessController()", async function () {
      beforeEach(async function () {
        // set new value for access controller
        accessController = other2.address; // random address, just for test
      });

      it("should emit a AccessControllerAddressChanged event", async function () {
        // Set new access controller, testing for the event
        await expect(beacon.connect(deployer).setAccessController(accessController))
          .to.emit(beacon, "AccessControllerAddressChanged")
          .withArgs(accessController, deployer.address);
      });

      it("should update state", async function () {
        // Set new access controller
        await beacon.connect(deployer).setAccessController(accessController);

        // Verify that new value is stored
        expect(await beacon.connect(rando).getAccessController()).to.equal(accessController);
      });

      context("💔 Revert Reasons", async function () {
        it("caller is not the admin", async function () {
          // Attempt to set new access controller, expecting revert
          await expect(beacon.connect(rando).setAccessController(accessController)).to.revertedWith(
            RevertReasons.ACCESS_DENIED
          );
        });
      });
    });

    context("👉 setProtocolAddress()", async function () {
      beforeEach(async function () {
        // set new value for protocol address
        protocolAddress = other3.address; // random address, just for test
      });

      it("should emit a ProtocolAddressChanged event", async function () {
        // Set new protocol address, testing for the event
        await expect(beacon.connect(deployer).setProtocolAddress(protocolAddress))
          .to.emit(beacon, "ProtocolAddressChanged")
          .withArgs(protocolAddress, deployer.address);
      });

      it("should update state", async function () {
        // Set new protocol address
        await beacon.connect(deployer).setProtocolAddress(protocolAddress);

        // Verify that new value is stored
        expect(await beacon.connect(rando).getProtocolAddress()).to.equal(protocolAddress);
      });

      context("💔 Revert Reasons", async function () {
        it("caller is not the admin", async function () {
          // Attempt to set new protocol address, expecting revert
          await expect(beacon.connect(rando).setProtocolAddress(protocolAddress)).to.revertedWith(
            RevertReasons.ACCESS_DENIED
          );
        });
      });
    });

    context("👉 constructor", async function () {
      context("💔 Revert Reasons", async function () {
        it("_protocolAddress address is the zero address", async function () {
          // Deploy Protocol Client implementation contracts
          const protocolClientImpls = await deployProtocolClientImpls(gasLimit);

          // Deploy Protocol Client beacon contracts
          const protocolClientArgs = [accessController.address, ethers.constants.AddressZero];
          await expect(deployProtocolClientBeacons(protocolClientImpls, protocolClientArgs, gasLimit)).to.revertedWith(
            RevertReasons.INVALID_ADDRESS
          );
        });

        it("_impl address is the zero address", async function () {
          // Client args
          const protocolClientArgs = [accessController.address, protocol.address];

          // Deploy the ClientBeacon for BosonVoucher
          const ClientBeacon = await ethers.getContractFactory("BosonClientBeacon");
          await expect(ClientBeacon.deploy(...protocolClientArgs, ethers.constants.AddressZero, { gasLimit })).to.revertedWith(
            RevertReasons.INVALID_ADDRESS
          );
        });
      });
    });
  });
});
