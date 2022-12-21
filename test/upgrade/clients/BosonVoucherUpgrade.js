const shell = require("shelljs");
const hre = require("hardhat");
const ethers = hre.ethers;
const { assert, expect } = require("chai");
const {
  deploySuite,
  upgradeSuite,
  upgradeClients,
  getStorageLayout,
  compareStorageLayouts,
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

const oldVersion = "v2.1.0";
const newVersion = "HEAD";
const v2_1_0_scripts = "b02a583ddb720bbe36fa6e29c344d35e957deb8b";

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
  });

  afterEach(async function () {
    // Revert to state right after the upgrade.
    // This is used so the lengthly setup (deploy+upgrade) is done only once.
    await ethers.provider.send("evm_revert", [snapshot]);
    snapshot = await ethers.provider.send("evm_snapshot", []);

    // Reset the accountId iterator
    accountId.next(true);
  });

  after(async function () {
    // revert to latest state of contracts
    shell.exec(`rm -rf contracts/*`);
    shell.exec(`git checkout HEAD contracts`);
    shell.exec(`git reset HEAD contracts`);
    shell.exec(`rm -rf scripts/*`);
    shell.exec(`git checkout HEAD scripts`);
    shell.exec(`git reset HEAD scripts`);
  });

  // Voucher state
  context("📋 Right After upgrade", async function () {
    it("Old storage layout should be unaffected", async function () {
      const postUpgradeStorageLayout = await getStorageLayout("BosonVoucher");

      assert(compareStorageLayouts(preUpgradeStorageLayout, postUpgradeStorageLayout), "Upgrade breaks storage layout");
    });

    it("State is not affected directly after the update", async function () {
      // Get protocol state after the upgrade
      const voucherContractStateAfterUpgrade = await getVoucherContractState(preUpgradeEntities);

      // State before and after should be equal
      assert.deepEqual(voucherContractStateAfterUpgrade, voucherContractState, "state mismatch after upgrade");
    });
  });

  // Create new vocuher data. Existing data should not be affected
  context("📋 New data after the upgrade do not corrupt the data from before the upgrade", async function () {
    it("State is not affected", async function () {
      await populateVoucherContract(
        deployer,
        protocolDiamondAddress,
        protocolContracts,
        mockContracts,
        preUpgradeEntities
      );

      // Get protocol state after the upgrade. Get the data that should be in location of old data.
      const voucherContractStateAfterUpgradeAndActions = await getVoucherContractState(preUpgradeEntities);

      // The only thing that should change are buyers's balances, since they comitted to new offers and they got vouchers for them.
      // Modify the post upgrade state to reflect the expected changes
      const { buyers, sellers } = preUpgradeEntities;
      const entities = [...sellers, ...buyers];
      for (let i = 0; i < buyers.length; i++) {
        // loop matches the loop in populateVoucherContract
        for (let j = i; j < buyers.length; j++) {
          const offer = preUpgradeEntities.offers[i + j].offer;
          const sellerId = ethers.BigNumber.from(offer.sellerId).toHexString();

          // Find the voucher data for the seller
          const voucherData = voucherContractStateAfterUpgradeAndActions.find(
            (vd) => vd.sellerId.toHexString() == sellerId
          );

          const buyerWallet = buyers[j].wallet;
          const buyerIndex = entities.findIndex((e) => e.wallet.address == buyerWallet.address);

          // Update the balance of the buyer
          voucherData.balanceOf[buyerIndex] = voucherData.balanceOf[buyerIndex].sub(1);
        }
      }

      // State before and after should be equal
      assert.deepEqual(
        voucherContractState,
        voucherContractStateAfterUpgradeAndActions,
        "state mismatch after upgrade"
      );
    });
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
      console.log(2);
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
