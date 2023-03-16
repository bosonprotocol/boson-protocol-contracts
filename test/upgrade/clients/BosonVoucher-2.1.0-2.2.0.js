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
  revertState,
} = require("../../util/upgrade");
const {
  mockDisputeResolver,
  mockSeller,
  mockVoucherInitValues,
  mockAuthToken,
  mockOffer,
  accountId,
} = require("../../util/mock");
const { calculateContractAddress, prepareDataSignatureParameters, deriveTokenId } = require("../../util/utils");
const Range = require("../../../scripts/domain/Range");
const { DisputeResolverFee } = require("../../../scripts/domain/DisputeResolverFee");
const { getGenericContext } = require("./01_generic");
const SellerUpdateFields = require("../../../scripts/domain/SellerUpdateFields");

const oldVersion = "v2.1.0";
const newVersion = "v2.2.0";
// Script that was used to deploy v2.1.0 was created after v2.1.0 tag was created.
// This is the commit hash when deployment happened, so it represents the state of the code at that time.
const v2_1_0_scripts = "v2.1.0-scripts";

let snapshot;

/**
 *  Upgrade test case - After upgrade from 2.1.0 to 2.2.0 everything is still operational
 */
describe("[@skip-on-coverage] After client upgrade, everything is still operational", function () {
  // Common vars
  let deployer, assistant;

  // reference protocol state
  let voucherContractState;
  let preUpgradeEntities;
  let preUpgradeStorageLayout;
  let protocolDiamondAddress, protocolContracts, mockContracts;

  // facet handlers
  let offerHandler, accountHandler, fundsHandler, exchangeHandler, configHandler;
  let bosonVoucher;
  let forwarder;

  before(async function () {
    try {
      // Make accounts available
      [deployer, assistant] = await ethers.getSigners();

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

      ({ fundsHandler, exchangeHandler } = protocolContracts);

      preUpgradeStorageLayout = await getStorageLayout("BosonVoucher");
      preUpgradeEntities = await populateVoucherContract(
        deployer,
        protocolDiamondAddress,
        protocolContracts,
        mockContracts,
        undefined, // no existing entities
        oldVersion
      );
      voucherContractState = await getVoucherContractState(preUpgradeEntities);

      // upgrade clients
      forwarder = await upgradeClients(newVersion);

      // upgrade suite
      ({ offerHandler, configHandler, accountHandler } = await upgradeSuite(
        newVersion,
        protocolDiamondAddress,
        {
          offerHandler: "IBosonOfferHandler",
          configHandler: "IBosonConfigHandler",
          accountHandler: "IBosonAccountHandler",
        },
        undefined,
        {
          facetsToInit: {
            ExchangeHandlerFacet: { constructorArgs: [preUpgradeEntities.exchanges.length + 1] },
          },
        }
      ));

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
    } catch (err) {
      // revert to latest version of scripts and contracts
      revertState();
      // stop execution
      assert(false, `Before all reverts with: ${err}`);
    }
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
    let sellerId, disputeResolverId, offer, offerDates, offerDurations, agentId;

    beforeEach(async function () {
      // Create a seller
      sellerId = await accountHandler.getNextAccountId();
      const seller = mockSeller(assistant.address, assistant.address, assistant.address, assistant.address, true);
      const voucherInitValues = mockVoucherInitValues();
      const emptyAuthToken = mockAuthToken();
      await accountHandler.connect(assistant).createSeller(seller, emptyAuthToken, voucherInitValues);

      agentId = "0"; // agent id is optional while creating an offer

      // Create a valid dispute resolver
      disputeResolverId = await accountHandler.getNextAccountId();
      const disputeResolver = mockDisputeResolver(
        assistant.address,
        assistant.address,
        assistant.address,
        assistant.address,
        true,
        true
      );
      const disputeResolverFees = [new DisputeResolverFee(ethers.constants.AddressZero, "Native", "0")];
      const sellerAllowList = [];
      await accountHandler
        .connect(assistant)
        .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

      // Create an offer
      offerId = await offerHandler.getNextOfferId();
      ({ offer, offerDates, offerDurations } = await mockOffer());
      offer.quantityAvailable = "100";

      await offerHandler
        .connect(assistant)
        .createOffer(offer.toStruct(), offerDates.toStruct(), offerDurations.toStruct(), disputeResolverId, agentId);

      await fundsHandler
        .connect(assistant)
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
      // Reserve range for the assistant, test for event
      await expect(offerHandler.connect(assistant).reserveRange(offerId, length, assistant.address)).to.emit(
        bosonVoucher,
        "RangeReserved"
      );

      await offerHandler
        .connect(assistant)
        .createOffer(offer.toStruct(), offerDates.toStruct(), offerDurations.toStruct(), disputeResolverId, agentId);

      ++offerId;

      // Reserve range for the contract, test for event
      await expect(offerHandler.connect(assistant).reserveRange(offerId, length, bosonVoucher.address)).to.emit(
        bosonVoucher,
        "RangeReserved"
      );
    });

    context("preMint()", async function () {
      it("seller can pre mint vouchers", async function () {
        // Reserve range
        await offerHandler.connect(assistant).reserveRange(offerId, length, assistant.address);

        // Premint tokens, test for event
        await expect(bosonVoucher.connect(assistant).preMint(offerId, amount)).to.emit(bosonVoucher, "Transfer");
      });

      it("MetaTx: forwarder can pre mint on behalf of seller on old vouchers", async function () {
        const sellersLength = preUpgradeEntities.sellers.length;

        // Gets last seller created before upgrade
        let {
          seller,
          authToken,
          offerIds: [offerId],
          wallet,
        } = preUpgradeEntities.sellers[sellersLength - 1];

        // reassign assistant because signer must be on provider default accounts in order to call eth_signTypedData_v4
        assistant = (await ethers.getSigners())[2];
        seller.assistant = assistant.address;
        await accountHandler.connect(wallet).updateSeller(seller, authToken);
        await accountHandler.connect(assistant).optInToSellerUpdate(seller.id, [SellerUpdateFields.Assistant]);

        // Reserve range
        await offerHandler.connect(assistant).reserveRange(offerId, length, assistant.address);

        // Get last seller voucher
        bosonVoucher = await ethers.getContractAt(
          "BosonVoucher",
          calculateContractAddress(exchangeHandler.address, sellersLength)
        );

        const nonce = Number(await forwarder.getNonce(assistant.address));

        const types = {
          ForwardRequest: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "nonce", type: "uint256" },
            { name: "data", type: "bytes" },
          ],
        };

        const functionSignature = bosonVoucher.interface.encodeFunctionData("preMint", [offerId, amount]);

        const message = {
          from: assistant.address,
          to: bosonVoucher.address,
          nonce: nonce,
          data: functionSignature,
        };

        const { signature } = await prepareDataSignatureParameters(
          assistant,
          types,
          "ForwardRequest",
          message,
          forwarder.address,
          "MockForwarder",
          "0.0.1",
          "0Z"
        );
        const tx = await forwarder.execute(message, signature);

        await expect(tx).to.emit(bosonVoucher, "Transfer");
      });
    });

    it("burnPremintedVouchers()", async function () {
      // Reserve range and premint tokens
      await offerHandler.connect(assistant).reserveRange(offerId, length, assistant.address);
      await bosonVoucher.connect(assistant).preMint(offerId, amount);

      // void the offer
      await offerHandler.connect(assistant).voidOffer(offerId);

      // Burn preminted vouchers, test for event
      await expect(bosonVoucher.connect(assistant).burnPremintedVouchers(offerId)).to.emit(bosonVoucher, "Transfer");
    });

    it("getRange()", async function () {
      // Reserve range
      await offerHandler.connect(assistant).reserveRange(offerId, length, assistant.address);

      const startTokenId = deriveTokenId(offerId, start);
      const range = new Range(startTokenId.toString(), length, "0", "0", assistant.address);

      // Get range object from contract
      const returnedRange = Range.fromStruct(await bosonVoucher.getRangeByOfferId(offerId));
      assert.equal(returnedRange.toString(), range.toString(), "Range mismatch");
    });

    it("getAvailablePreMints()", async function () {
      // Reserve range
      await offerHandler.connect(assistant).reserveRange(offerId, length, assistant.address);

      // Get available premints from contract
      const availablePremints = await bosonVoucher.getAvailablePreMints(offerId);
      assert.equal(availablePremints.toString(), length, "Available Premints mismatch");
    });
  });
});
