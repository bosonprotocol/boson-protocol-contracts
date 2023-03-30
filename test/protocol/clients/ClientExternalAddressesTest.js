const { ethers } = require("hardhat");

const { gasLimit } = require("../../../environments");
const { deployProtocolClientImpls } = require("../../../scripts/util/deploy-protocol-client-impls.js");
const { deployProtocolClientBeacons } = require("../../../scripts/util/deploy-protocol-client-beacons.js");
const { expect } = require("chai");
const { RevertReasons } = require("../../../scripts/config/revert-reasons");
const { maxPriorityFeePerGas } = require("../../util/constants.js");
const { setupTestEnvironment, getSnapshot, revertToSnapshot } = require("../../util/utils.js");

describe("IClientExternalAddresses", function () {
  let deployer, rando, other1, other3;
  let beacon;
  let voucherImplementation, protocolAddress;
  let snapshotId;
  let protocolDiamondAddress;

  before(async function () {
    // Specify contracts needed for this test
    const contracts = {};

    ({
      signers: [rando, other1, other3],
      diamondAddress: protocolDiamondAddress,
      extraReturnValues: { beacon },
    } = await setupTestEnvironment(contracts, { returnClient: true }));

    [deployer] = await ethers.getSigners();

    // Get snapshot id
    snapshotId = await getSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();
  });

  // Interface support
  context("📋 Setters", async function () {
    context("👉 setImplementation()", async function () {
      beforeEach(async function () {
        // set new value for voucher implementation
        voucherImplementation = other1.address; // random address, just for test
      });

      it("should emit an Upgraded event", async function () {
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

        it("implementation address is the zero address", async function () {
          // Attempt to set new implementation, expecting revert
          await expect(beacon.connect(deployer).setImplementation(ethers.constants.AddressZero)).to.revertedWith(
            RevertReasons.INVALID_ADDRESS
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

        it("protocol address is the zero address", async function () {
          // Attempt to set new protocol address, expecting revert
          await expect(beacon.connect(deployer).setProtocolAddress(ethers.constants.AddressZero)).to.revertedWith(
            RevertReasons.INVALID_ADDRESS
          );
        });
      });
    });

    context("👉 constructor", async function () {
      context("💔 Revert Reasons", async function () {
        it("_protocolAddress address is the zero address", async function () {
          // Deploy Protocol Client implementation contracts
          const protocolClientImpls = await deployProtocolClientImpls(
            [ethers.constants.AddressZero],
            maxPriorityFeePerGas
          );

          // Deploy Protocol Client beacon contracts
          const protocolClientArgs = [ethers.constants.AddressZero];
          await expect(
            deployProtocolClientBeacons(protocolClientImpls, protocolClientArgs, maxPriorityFeePerGas)
          ).to.revertedWith(RevertReasons.INVALID_ADDRESS);
        });

        it("_impl address is the zero address", async function () {
          // Client args
          const protocolClientArgs = [protocolDiamondAddress];

          // Deploy the ClientBeacon for BosonVoucher
          const ClientBeacon = await ethers.getContractFactory("BosonClientBeacon");
          await expect(
            ClientBeacon.deploy(...protocolClientArgs, ethers.constants.AddressZero, { gasLimit })
          ).to.revertedWith(RevertReasons.INVALID_ADDRESS);
        });
      });
    });
  });
});
