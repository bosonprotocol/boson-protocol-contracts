const hre = require("hardhat");
const ethers = hre.ethers;

const { deployAndCutFacets } = require("../../../scripts/util/deploy-protocol-handler-facets.js");
const { gasLimit } = require("../../../environments");
const { deployProtocolClients } = require("../../../scripts/util/deploy-protocol-clients");
const { deployProtocolDiamond } = require("../../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolClientImpls } = require("../../../scripts/util/deploy-protocol-client-impls.js");
const { deployProtocolClientBeacons } = require("../../../scripts/util/deploy-protocol-client-beacons.js");
const Role = require("../../../scripts/domain/Role");
const { expect } = require("chai");
const { RevertReasons } = require("../../../scripts/config/revert-reasons");
const { oneWeek, oneMonth, maxPriorityFeePerGas } = require("../../util/constants.js");
const { getFacetsWithArgs } = require("../../util/utils.js");

describe("IClientExternalAddresses", function () {
  let accessController, protocolDiamond;
  let deployer, rando, other1, other3, proxy, protocolTreasury, bosonToken;
  let beacon;
  let voucherImplementation, protocolAddress;
  let protocolFeePercentage, protocolFeeFlatBoson, buyerEscalationDepositPercentage;

  beforeEach(async function () {
    // Set signers
    [deployer, rando, other1, other3, proxy, protocolTreasury, bosonToken] = await ethers.getSigners();

    // Deploy accessController
    [protocolDiamond, , , , accessController] = await deployProtocolDiamond(maxPriorityFeePerGas);

    // grant upgrader role
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Deploy client
    const protocolClientArgs = [protocolDiamond.address];
    const [, beacons] = await deployProtocolClients(protocolClientArgs, maxPriorityFeePerGas);
    [beacon] = beacons;

    // set protocolFees
    protocolFeePercentage = "200"; // 2 %
    protocolFeeFlatBoson = ethers.utils.parseUnits("0.01", "ether").toString();
    buyerEscalationDepositPercentage = "1000"; // 10%

    // Add config Handler, so ids start at 1, and so voucher address can be found
    const protocolConfig = [
      // Protocol addresses
      {
        treasury: protocolTreasury.address,
        token: bosonToken.address,
        voucherBeacon: beacon.address,
        beaconProxy: proxy.address,
      },
      // Protocol limits
      {
        maxExchangesPerBatch: 100,
        maxOffersPerGroup: 100,
        maxTwinsPerBundle: 100,
        maxOffersPerBundle: 100,
        maxOffersPerBatch: 100,
        maxTokensPerWithdrawal: 100,
        maxFeesPerDisputeResolver: 100,
        maxEscalationResponsePeriod: oneMonth,
        maxDisputesPerBatch: 100,
        maxAllowedSellers: 100,
        maxTotalOfferFeePercentage: 4000, //40%
        maxRoyaltyPecentage: 1000, //10%
        maxResolutionPeriod: oneMonth,
        minDisputePeriod: oneWeek,
      },
      // Protocol fees
      {
        percentage: protocolFeePercentage,
        flatBoson: protocolFeeFlatBoson,
        buyerEscalationDepositPercentage,
      },
    ];

    const facetNames = ["ConfigHandlerFacet", "ProtocolInitializationFacet"];

    const facetsToDeploy = await getFacetsWithArgs(facetNames, protocolConfig);

    // Cut the protocol handler facets into the Diamond
    await deployAndCutFacets(protocolDiamond.address, facetsToDeploy, maxPriorityFeePerGas);
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
          const protocolClientImpls = await deployProtocolClientImpls(maxPriorityFeePerGas);

          // Deploy Protocol Client beacon contracts
          const protocolClientArgs = [ethers.constants.AddressZero];
          await expect(
            deployProtocolClientBeacons(protocolClientImpls, protocolClientArgs, maxPriorityFeePerGas)
          ).to.revertedWith(RevertReasons.INVALID_ADDRESS);
        });

        it("_impl address is the zero address", async function () {
          // Client args
          const protocolClientArgs = [protocolDiamond.address];

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
