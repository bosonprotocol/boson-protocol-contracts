const hre = require("hardhat");
const ethers = hre.ethers;
const { expect, assert } = require("chai");

const Role = require("../../scripts/domain/Role");
const Exchange = require("../../scripts/domain/Exchange");
const Voucher = require("../../scripts/domain/Voucher");
const Offer = require("../../scripts/domain/Offer");
const ExchangeState = require("../../scripts/domain/ExchangeState");
const { getEvent } = require("../../scripts/util/test-events.js");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");

/**
 *  Test the Boson Exchange Handler interface
 */
describe("IBosonExchangeHandler", function () {
  // Common vars
  let InterfaceIds;
  let accounts, deployer, operator;
  let erc165, protocolDiamond, accessController, exchangeHandler, offerHandler, bosonVoucher, gasLimit;
  let id, buyer, buyerId, offer, offerId, sellerId;
  let block, blockNumber, tx, txReceipt, event, clients;
  let support, oneMonth, oneWeek;
  let price,
    sellerDeposit,
    buyerCancelPenalty,
    quantityAvailable,
    validFromDate,
    redeemableFromDate,
    fulfillmentPeriodDuration,
    voucherValidDuration,
    exchangeToken,
    metadataUri,
    metadataHash,
    voided;
  let voucher, voucherStruct, committedDate, validUntilDate, redeemedDate, expired;
  let exchange, finalizedDate, disputed, state, exchangeStruct;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();
  });

  beforeEach(async function () {
    // Get the current block info
    blockNumber = await ethers.provider.getBlockNumber();
    block = await ethers.provider.getBlock(blockNumber);

    // Make accounts available
    accounts = await ethers.getSigners();
    deployer = accounts[0];
    operator = accounts[1];
    buyer = accounts[2];

    // Deploy the Protocol Diamond
    [protocolDiamond, , , accessController] = await deployProtocolDiamond();

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Grant PROTOCOL role to ProtocolDiamond address and renounces admin
    await accessController.grantRole(Role.PROTOCOL, protocolDiamond.address);

    // Cut the protocol handler facets into the Diamond
    await deployProtocolHandlerFacets(protocolDiamond, [
      "AccountHandlerFacet",
      "ExchangeHandlerFacet",
      "OfferHandlerFacet",
    ]);

    // Deploy the Protocol client implementation/proxy pairs (currently just the Boson Voucher)
    const protocolClientArgs = [accessController.address, protocolDiamond.address];
    [, , clients] = await deployProtocolClients(protocolClientArgs, gasLimit);
    [bosonVoucher] = clients;

    // Add config Handler, so ids start at 1, and so voucher address can be found
    const protocolConfig = [
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      bosonVoucher.address,
      "0",
      "0",
    ];

    // Deploy the Config facet, initializing the protocol config
    await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);

    // Cast Diamond to IERC165
    erc165 = await ethers.getContractAt("IERC165", protocolDiamond.address);

    // Cast Diamond to IBosonOfferHandler
    offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);

    // Cast Diamond to IBosonExchangeHandler
    exchangeHandler = await ethers.getContractAt("IBosonExchangeHandler", protocolDiamond.address);
  });

  // Interface support (ERC-156 provided by ProtocolDiamond, others by deployed facets)
  context("📋 Interfaces", async function () {
    context("👉 supportsInterface()", async function () {
      it("should indicate support for IBosonExchangeHandler interface", async function () {
        // Current interfaceId for IBosonExchangeHandler
        support = await erc165.supportsInterface(InterfaceIds.IBosonExchangeHandler);

        // Test
        await expect(support, "IBosonExchangeHandler interface not supported").is.true;
      });
    });
  });

  // All supported Exchange methods
  context("📋 Exchange Handler Methods", async function () {
    beforeEach(async function () {
      // Initial ids for all the things
      id = offerId = buyerId = sellerId = "1";

      // Create an offer to commit to
      oneWeek = 604800 * 1000; //  7 days in milliseconds
      oneMonth = 2678400 * 1000; // 31 days in milliseconds

      // Required constructor params
      price = ethers.utils.parseUnits("1.5", "ether").toString();
      sellerDeposit = price = ethers.utils.parseUnits("0.25", "ether").toString();
      buyerCancelPenalty = price = ethers.utils.parseUnits("0.05", "ether").toString();
      quantityAvailable = "1";
      validFromDate = ethers.BigNumber.from(block.timestamp).toString(); // valid from now
      validUntilDate = ethers.BigNumber.from(block.timestamp)
        .add(oneMonth * 6)
        .toString(); // until 6 months
      redeemableFromDate = ethers.BigNumber.from(block.timestamp).add(oneWeek).toString(); // redeemable in 1 week
      fulfillmentPeriodDuration = oneMonth.toString(); // fulfillment period is one month
      voucherValidDuration = oneMonth.toString(); // offers valid for one month
      exchangeToken = ethers.constants.AddressZero.toString(); // Zero addy ~ chain base currency
      metadataHash = "QmYXc12ov6F2MZVZwPs5XeCBbf61cW3wKRk8h3D5NTYj4T";
      metadataUri = `https://ipfs.io/ipfs/${metadataHash}`;
      voided = false;

      // Create a valid offer entity
      offer = new Offer(
        offerId,
        sellerId,
        price,
        sellerDeposit,
        buyerCancelPenalty,
        quantityAvailable,
        validFromDate,
        validUntilDate,
        redeemableFromDate,
        fulfillmentPeriodDuration,
        voucherValidDuration,
        exchangeToken,
        metadataUri,
        metadataHash,
        voided
      );
      expect(offer.isValid()).is.true;

      // Create the offer
      await offerHandler.connect(operator).createOffer(offer);

      // Required voucher constructor params
      committedDate = "0";
      validUntilDate = "0";
      redeemedDate = "0";
      expired = false;
      voucher = new Voucher(committedDate, validUntilDate, redeemedDate, expired);
      voucherStruct = [committedDate, validUntilDate, redeemedDate, expired];

      // Required exchange constructor params
      finalizedDate = "0";
      disputed = false;
      state = ExchangeState.Committed;
      exchange = new Exchange(id, offerId, buyerId, finalizedDate, voucher, disputed, state);
      exchangeStruct = [id, offerId, buyerId, finalizedDate, voucherStruct, disputed, state];
    });

    context("👉 commitToOffer()", async function () {
      it("should emit a BuyerCommitted event", async function () {
        // Commit to offer, testing for the event
        tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId);
        txReceipt = await tx.wait();
        event = getEvent(txReceipt, exchangeHandler, "BuyerCommitted");

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);

        // Update the committed date in the expected exchange struct with the block timestamp of the tx
        exchange.voucher.committedDate = block.timestamp.toString();
        exchangeStruct = exchange.toStruct();

        assert.equal(event.exchangeId.toString(), id, "Exchange id is incorrect");
        assert.equal(event.offerId.toString(), offerId, "Offer id is incorrect");
        assert.equal(event.buyerId.toString(), offerId, "Buyer id is incorrect");
        assert.equal(
          Exchange.fromStruct(event.exchange).toString(),
          Exchange.fromStruct(exchangeStruct).toString(),
          "Exchange struct is incorrect"
        );
      });

      context("💔 Revert Reasons", async function () {
        /*
         * Reverts if:
         * - offerId is invalid
         * - offer has been voided                    // TODO
         * - offer has expired                        // TODO
         * - offer is not yet available for commits   // TODO
         * - offer's quantity available is zero       // TODO
         * - buyer address is zero
         * - buyer account is inactive                // TODO
         */

        it("buyer address is the zero address", async function () {
          // Attempt to commit, expecting revert
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(ethers.constants.AddressZero, offerId)
          ).to.revertedWith(RevertReasons.INVALID_ADDRESS);
        });

        it("offer id is invalid", async function () {
          // An invalid offer id
          offerId = "666";

          // Attempt to commit, expecting revert
          await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId)).to.revertedWith(
            RevertReasons.NO_SUCH_OFFER
          );
        });
      });
    });
  });
});
