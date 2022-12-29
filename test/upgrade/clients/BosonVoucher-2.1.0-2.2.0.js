const hre = require("hardhat");
const ethers = hre.ethers;
const { assert, expect } = require("chai");
const {
  deploySuite,
  upgradeSuite,
  upgradeClients,
  getStorageLayout,
  populateVoucherContract,
  getVoucherContractState,
} = require("../../util/upgrade");
const {
  mockDisputeResolver,
  mockSeller,
  mockVoucherInitValues,
  mockAuthToken,
  mockOffer,
  accountId,
} = require("../../util/mock");
const { calculateContractAddress } = require("../../util/utils");
const Range = require("../../../scripts/domain/Range");
const { DisputeResolverFee } = require("../../../scripts/domain/DisputeResolverFee");
const { getGenericContext } = require("./01_generic");

const oldVersion = "v2.1.0";
const newVersion = "HEAD";
// Script that was used to deploy v2.1.0 was created after v2.1.0 tag was created.
// This is the commit hash when deployment happened, so it represents the state of the code at that time.
const v2_1_0_scripts = "v2.1.0-scripts";

let snapshot;

/**
 *  Upgrade test case - After upgrade from 2.1.0 to 2.2.0 everything is still operational
 */
describe("[@skip-on-coverage] After client upgrade, everything is still operational", function () {
  // Common vars
  let deployer, operator;

  // reference protocol state
  let voucherContractState;
  let preUpgradeEntities;
  let preUpgradeStorageLayout;
  let protocolDiamondAddress, protocolContracts, mockContracts;

  // facet handlers
  let offerHandler, accountHandler, fundsHandler, exchangeHandler, configHandler;
  let bosonVoucher;

  before(async function () {
    // Make accounts available
    [deployer, operator] = await ethers.getSigners();

    // temporary update config, so compiler outputs storage layout
    for (const compiler of hre.config.solidity.compilers) {
      if (compiler.settings.outputSelection["*"]["BosonVoucher"]) {
        compiler.settings.outputSelection["*"]["BosonVoucher"].push("storageLayout");
      } else {
        compiler.settings.outputSelection["*"]["BosonVoucher"] = ["storageLayout"];
      }
    }

    ({ protocolDiamondAddress, protocolContracts, mockContracts } = await deploySuite(
      deployer,
      oldVersion,
      v2_1_0_scripts
    ));

    ({ accountHandler, fundsHandler, exchangeHandler } = protocolContracts);

    preUpgradeStorageLayout = await getStorageLayout("BosonVoucher");
    preUpgradeEntities = await populateVoucherContract(
      deployer,
      protocolDiamondAddress,
      protocolContracts,
      mockContracts
    );
    voucherContractState = await getVoucherContractState(preUpgradeEntities);

    // upgrade clients
    await upgradeClients(newVersion);

    // upgrade suite
    ({ offerHandler, configHandler } = await upgradeSuite(newVersion, protocolDiamondAddress, {
      offerHandler: "IBosonOfferHandler",
      configHandler: "IBosonConfigHandler",
    }));

    snapshot = await ethers.provider.send("evm_snapshot", []);

    // This context is placed in an uncommon place due to order of test execution.
    // Generic context needs values that are set in "before", however "before" is executed before tests, not before suites
    // and those values are undefined if this is placed outside "before".
    // Normally, this would be solved with mocha's --delay option, but it does not behave as expected when running with hardhat.
    context(
      "Generic tests",
      getGenericContext(
        deployer,
        protocolDiamondAddress,
        protocolContracts,
        mockContracts,
        voucherContractState,
        preUpgradeEntities,
        preUpgradeStorageLayout,
        snapshot
      )
    );
  });

  afterEach(async function () {
    // Revert to state right after the upgrade.
    // This is used so the lengthly setup (deploy+upgrade) is done only once.
    await ethers.provider.send("evm_revert", [snapshot]);
    snapshot = await ethers.provider.send("evm_snapshot", []);

    // Reset the accountId iterator
    accountId.next(true);
  });

  // Test methods that were added to see that upgrade was succesful
  // Extensive unit tests for this methods are in /test/protocol/clients/BosonVoucherTest.js
  context("📋 New methods", async function () {
    let offerId, start, length, amount;
    let sellerId, disputeResolverId;

    beforeEach(async function () {
      // Create a seller
      sellerId = await accountHandler.getNextAccountId();
      const seller = mockSeller(operator.address, operator.address, operator.address, operator.address);
      const voucherInitValues = mockVoucherInitValues();
      const emptyAuthToken = mockAuthToken();
      await accountHandler.connect(operator).createSeller(seller, emptyAuthToken, voucherInitValues);

      const agentId = "0"; // agent id is optional while creating an offer

      // Create a valid dispute resolver
      disputeResolverId = await accountHandler.getNextAccountId();
      const disputeResolver = mockDisputeResolver(
        operator.address,
        operator.address,
        operator.address,
        operator.address,
        true
      );
      const disputeResolverFees = [new DisputeResolverFee(ethers.constants.AddressZero, "Native", "0")];
      const sellerAllowList = [];
      await accountHandler
        .connect(operator)
        .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

      // Create an offer
      offerId = await offerHandler.getNextOfferId();
      const { offer, offerDates, offerDurations } = await mockOffer();
      offer.quantityAvailable = "100";
      await offerHandler
        .connect(operator)
        .createOffer(offer.toStruct(), offerDates.toStruct(), offerDurations.toStruct(), disputeResolverId, agentId);

      await fundsHandler
        .connect(operator)
        .depositFunds(sellerId, ethers.constants.AddressZero, offer.sellerDeposit, { value: offer.sellerDeposit });

      start = await exchangeHandler.getNextExchangeId();
      length = "80";
      amount = "50"; // amount to mint

      bosonVoucher = await ethers.getContractAt(
        "BosonVoucher",
        calculateContractAddress(exchangeHandler.address, preUpgradeEntities.sellers.length + 1)
      );

      // Adjust maximum preminted vouchers
      await configHandler.connect(deployer).setMaxPremintedVouchers(1000);
    });

    it("reserveRange()", async function () {
      // Reserve range, test for event
      await expect(offerHandler.connect(operator).reserveRange(offerId, length)).to.emit(bosonVoucher, "RangeReserved");
    });

    it("preMint()", async function () {
      // Reserve range
      await offerHandler.connect(operator).reserveRange(offerId, length);

      // Premint tokens, test for event
      await expect(bosonVoucher.connect(operator).preMint(offerId, amount)).to.emit(bosonVoucher, "Transfer");
    });

    it("burnPremintedVouchers()", async function () {
      // Reserve range and premint tokens
      await offerHandler.connect(operator).reserveRange(offerId, length);
      await bosonVoucher.connect(operator).preMint(offerId, amount);

      // void the offer
      await offerHandler.connect(operator).voidOffer(offerId);

      // Burn preminted vouchers, test for event
      await expect(bosonVoucher.connect(operator).burnPremintedVouchers(offerId)).to.emit(bosonVoucher, "Transfer");
    });

    it("getRange()", async function () {
      // Reserve range
      await offerHandler.connect(operator).reserveRange(offerId, length);

      const range = new Range(offerId.toString(), start.toString(), length, "0", "0");

      // Get range object from contract
      const returnedRange = Range.fromStruct(await bosonVoucher.getRangeByOfferId(offerId));
      assert.equal(returnedRange.toString(), range.toString(), "Range mismatch");
    });

    it("getAvailablePreMints()", async function () {
      // Reserve range
      await offerHandler.connect(operator).reserveRange(offerId, length);

      // Get available premints from contract
      const availablePremints = await bosonVoucher.getAvailablePreMints(offerId);
      assert.equal(availablePremints.toString(), length, "Available Premints mismatch");
    });
  });
});
