const hre = require("hardhat");
const ethers = hre.ethers;
const { expect, assert } = require("chai");

const Role = require("../../scripts/domain/Role");
const Exchange = require("../../scripts/domain/Exchange");
const Voucher = require("../../scripts/domain/Voucher");
const Offer = require("../../scripts/domain/Offer");
const MetaTxOfferDetails = require("../../scripts/domain/MetaTxOfferDetails");
const Seller = require("../../scripts/domain/Seller");
const Buyer = require("../../scripts/domain/Buyer");
const ExchangeState = require("../../scripts/domain/ExchangeState");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
const {
  getEvent,
  setNextBlockTimestamp,
  calculateVoucherExpiry,
  prepareDataSignatureParameters,
  calculateProtocolFee,
} = require("../../scripts/util/test-utils.js");

/**
 *  Test the Boson Exchange Handler interface
 */
describe("IBosonExchangeHandler", function () {
  // Common vars
  let InterfaceIds;
  let accounts, deployer, operator, admin, clerk, treasury, rando, buyer, newOwner, game, fauxClient;
  let erc165,
    protocolDiamond,
    accessController,
    accountHandler,
    exchangeHandler,
    offerHandler,
    fundsHandler,
    disputeHandler;
  let bosonVoucher, gasLimit;
  let id, buyerId, offer, offerId, seller, sellerId, nextExchangeId, nextAccountId;
  let block, blockNumber, tx, txReceipt, event, clients;
  let support, oneMonth, oneWeek, newTime;
  let price,
    sellerDeposit,
    protocolFee,
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
  let protocolFeePrecentage;
  let voucher, voucherStruct, committedDate, validUntilDate, redeemedDate, expired;
  let exchange, finalizedDate, state, exchangeStruct, response, exists;
  let metaTransactionsHandler, nonce;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();
  });

  beforeEach(async function () {
    // Make accounts available
    accounts = await ethers.getSigners();
    deployer = accounts[0];
    operator = accounts[1];
    admin = accounts[2];
    clerk = accounts[3];
    treasury = accounts[4];
    buyer = accounts[5];
    rando = accounts[6];
    newOwner = accounts[7];
    game = accounts[8]; // the MR Game that is allowed to push the Dispute into final states
    fauxClient = accounts[9];

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
      "FundsHandlerFacet",
      "MetaTransactionsHandlerFacet",
    ]);

    // Deploy the Protocol client implementation/proxy pairs (currently just the Boson Voucher)
    const protocolClientArgs = [accessController.address, protocolDiamond.address];
    [, , clients] = await deployProtocolClients(protocolClientArgs, gasLimit);
    [bosonVoucher] = clients;
    await accessController.grantRole(Role.CLIENT, bosonVoucher.address);

    // set protocolFeePrecentage
    protocolFeePrecentage = "200"; // 2 %

    // Add config Handler, so ids start at 1, and so voucher address can be found
    const protocolConfig = [
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      bosonVoucher.address,
      protocolFeePrecentage,
      "0",
      "0",
      "0",
      "0",
    ];

    // Deploy the Config facet, initializing the protocol config
    await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);

    // Cast Diamond to IERC165
    erc165 = await ethers.getContractAt("IERC165", protocolDiamond.address);

    // Cast Diamond to IBosonAccountHandler
    accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);

    // Cast Diamond to IBosonOfferHandler
    offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);

    // Cast Diamond to IBosonExchangeHandler
    exchangeHandler = await ethers.getContractAt("IBosonExchangeHandler", protocolDiamond.address);

    // Cast Diamond to IBosonFundsHandler
    fundsHandler = await ethers.getContractAt("IBosonFundsHandler", protocolDiamond.address);

    // Cast Diamond to IBosonMetaTransactionsHandler
    metaTransactionsHandler = await ethers.getContractAt("IBosonMetaTransactionsHandler", protocolDiamond.address);
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
      id = offerId = sellerId = "1";
      buyerId = "2"; // created after seller

      // Create an offer to commit to
      oneWeek = 604800 * 1000; //  7 days in milliseconds
      oneMonth = 2678400 * 1000; // 31 days in milliseconds

      // Get the current block info
      blockNumber = await ethers.provider.getBlockNumber();
      block = await ethers.provider.getBlock(blockNumber);

      // Required constructor params
      price = ethers.utils.parseUnits("1.5", "ether").toString();
      sellerDeposit = ethers.utils.parseUnits("0.25", "ether").toString();
      protocolFee = calculateProtocolFee(sellerDeposit, price, protocolFeePrecentage);
      buyerCancelPenalty = ethers.utils.parseUnits("0.05", "ether").toString();
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

      // Create a valid seller
      seller = new Seller(id, operator.address, admin.address, clerk.address, treasury.address, true);
      expect(seller.isValid()).is.true;
      await accountHandler.connect(admin).createSeller(seller);

      // Create a valid offer entity
      offer = new Offer(
        offerId,
        sellerId,
        price,
        sellerDeposit,
        protocolFee,
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
      state = ExchangeState.Committed;
      exchange = new Exchange(id, offerId, buyerId, finalizedDate, voucher, state);
      exchangeStruct = [id, offerId, buyerId, finalizedDate, voucherStruct, state];

      // Deposit seller funds so the commit will succeed
      await fundsHandler
        .connect(operator)
        .depositFunds(seller.id, ethers.constants.AddressZero, sellerDeposit, { value: sellerDeposit });
    });

    context("👉 commitToOffer()", async function () {
      beforeEach(async function () {
        // Set a random nonce
        nonce = parseInt(ethers.utils.randomBytes(8));
      });

      it("should emit a BuyerCommitted event", async function () {
        // Commit to offer, retrieving the event
        tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });
        txReceipt = await tx.wait();
        event = getEvent(txReceipt, exchangeHandler, "BuyerCommitted");

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);

        // Update the committed date in the expected exchange struct with the block timestamp of the tx
        exchange.voucher.committedDate = block.timestamp.toString();

        // Update the validUntilDate date in the expected exchange struct
        exchange.voucher.validUntilDate = calculateVoucherExpiry(block, redeemableFromDate, voucherValidDuration);

        // Get the struct
        exchangeStruct = exchange.toStruct();

        assert.equal(event.exchangeId.toString(), id, "Exchange id is incorrect");
        assert.equal(event.offerId.toString(), offerId, "Offer id is incorrect");
        assert.equal(event.buyerId.toString(), buyerId, "Buyer id is incorrect");
        assert.equal(
          Exchange.fromStruct(event.exchange).toString(),
          Exchange.fromStruct(exchangeStruct).toString(),
          "Exchange struct is incorrect"
        );
      });

      it("should increment the next exchange id counter", async function () {
        // Commit to offer, creating a new exchange
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

        // Get the next exchange id and ensure it was incremented by the creation of the offer
        nextExchangeId = await exchangeHandler.connect(rando).getNextExchangeId();
        expect(nextExchangeId).to.equal(++id);
      });

      it("[Meta Transaction] should increment the next exchange id counter", async function () {
        // Set the offer Type
        const offerType = [
          { name: "buyer", type: "address" },
          { name: "offerId", type: "uint256" },
        ];

        // prepare the MetaTxOfferDetails struct
        let validOfferDetails = new MetaTxOfferDetails(buyer.address, offer.id, price);
        expect(validOfferDetails.isValid()).is.true;

        const metaTransactionType = [
          { name: "nonce", type: "uint256" },
          { name: "from", type: "address" },
          { name: "contractAddress", type: "address" },
          { name: "functionName", type: "string" },
          { name: "offerDetails", type: "MetaTxOfferDetails" },
        ];

        const customTransactionTypes = {
          MetaTxCommitToOffer: metaTransactionType,
          MetaTxOfferDetails: offerType,
        };

        // Prepare the message
        let message = {};
        message.nonce = parseInt(nonce);
        message.from = operator.address;
        message.contractAddress = exchangeHandler.address;
        message.functionName = "commitToOffer(address,uint256)";
        message.offerDetails = validOfferDetails;

        // Collect the signature components
        let { r, s, v } = await prepareDataSignatureParameters(
          operator,
          customTransactionTypes,
          "MetaTxCommitToOffer",
          message,
          metaTransactionsHandler.address
        );
        // Commit to offer, creating a new exchange. Send as meta transaction.
        await metaTransactionsHandler.executeMetaTxCommitToOffer(operator.address, validOfferDetails, nonce, r, s, v, {
          value: price,
        });

        // Get the next exchange id and ensure it was incremented by the creation of the offer
        nextExchangeId = await exchangeHandler.connect(rando).getNextExchangeId();
        expect(nextExchangeId).to.equal(++id);
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
            exchangeHandler.connect(buyer).commitToOffer(ethers.constants.AddressZero, offerId, { value: price })
          ).to.revertedWith(RevertReasons.INVALID_ADDRESS);
        });

        it("offer id is invalid", async function () {
          // An invalid offer id
          offerId = "666";

          // Attempt to commit, expecting revert
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
          ).to.revertedWith(RevertReasons.NO_SUCH_OFFER);
        });

        it("[Meta Transaction] buyer address is the zero address", async function () {
          // Set the offer Type
          const offerType = [
            { name: "buyer", type: "address" },
            { name: "offerId", type: "uint256" },
          ];

          // prepare the MetaTxOfferDetails struct
          let validOfferDetails = new MetaTxOfferDetails(ethers.constants.AddressZero, offer.id, price);
          expect(validOfferDetails.isValid()).is.true;

          const metaTransactionType = [
            { name: "nonce", type: "uint256" },
            { name: "from", type: "address" },
            { name: "contractAddress", type: "address" },
            { name: "functionName", type: "string" },
            { name: "offerDetails", type: "MetaTxOfferDetails" },
          ];

          const customTransactionTypes = {
            MetaTxCommitToOffer: metaTransactionType,
            MetaTxOfferDetails: offerType,
          };

          // Prepare the message
          let message = {};
          message.nonce = parseInt(nonce);
          message.from = operator.address;
          message.contractAddress = exchangeHandler.address;
          message.functionName = "commitToOffer(address,uint256)";
          message.offerDetails = validOfferDetails;

          // Collect the signature components
          let { r, s, v } = await prepareDataSignatureParameters(
            operator,
            customTransactionTypes,
            "MetaTxCommitToOffer",
            message,
            metaTransactionsHandler.address
          );
          // Commit to offer, creating a new exchange. Send as meta transaction.
          await expect(
            metaTransactionsHandler.executeMetaTxCommitToOffer(operator.address, validOfferDetails, nonce, r, s, v, {
              value: price,
            })
          ).to.revertedWith(RevertReasons.INVALID_ADDRESS);
        });

        it("[Meta Transaction] offer id is invalid", async function () {
          // An invalid offer id
          offerId = "666";

          // Set the offer Type
          const offerType = [
            { name: "buyer", type: "address" },
            { name: "offerId", type: "uint256" },
          ];

          // prepare the MetaTxOfferDetails struct
          let validOfferDetails = new MetaTxOfferDetails(buyer.address, offerId, price);
          expect(validOfferDetails.isValid()).is.true;

          const metaTransactionType = [
            { name: "nonce", type: "uint256" },
            { name: "from", type: "address" },
            { name: "contractAddress", type: "address" },
            { name: "functionName", type: "string" },
            { name: "offerDetails", type: "MetaTxOfferDetails" },
          ];

          const customTransactionTypes = {
            MetaTxCommitToOffer: metaTransactionType,
            MetaTxOfferDetails: offerType,
          };

          // Prepare the message
          let message = {};
          message.nonce = parseInt(nonce);
          message.from = operator.address;
          message.contractAddress = exchangeHandler.address;
          message.functionName = "commitToOffer(address,uint256)";
          message.offerDetails = validOfferDetails;

          // Collect the signature components
          let { r, s, v } = await prepareDataSignatureParameters(
            operator,
            customTransactionTypes,
            "MetaTxCommitToOffer",
            message,
            metaTransactionsHandler.address
          );
          // Commit to offer, creating a new exchange. Send as meta transaction.
          await expect(
            metaTransactionsHandler.executeMetaTxCommitToOffer(operator.address, validOfferDetails, nonce, r, s, v, {
              value: price,
            })
          ).to.revertedWith(RevertReasons.NO_SUCH_OFFER);
        });
      });
    });

    context("👉 completeExchange()", async function () {
      beforeEach(async function () {
        // Commit to offer
        tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);

        // Update the committed date in the expected exchange struct with the block timestamp of the tx
        exchange.voucher.committedDate = block.timestamp.toString();

        // Update the validUntilDate date in the expected exchange struct
        exchange.voucher.validUntilDate = calculateVoucherExpiry(block, redeemableFromDate, voucherValidDuration);

        // Get the struct
        exchangeStruct = exchange.toStruct();
      });

      it("should emit an ExchangeCompleted event when buyer calls", async function () {
        // Set time forward to the offer's redeemableFromDate
        await setNextBlockTimestamp(Number(redeemableFromDate));

        // Redeem the voucher
        await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

        // Complete the exchange, expecting event
        await expect(exchangeHandler.connect(buyer).completeExchange(exchange.id))
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchange.id);
      });

      it("should update state", async function () {
        // Set time forward to the offer's redeemableFromDate
        await setNextBlockTimestamp(Number(redeemableFromDate));

        // Redeem the voucher
        await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

        // Complete the exchange
        await expect(exchangeHandler.connect(buyer).completeExchange(exchange.id));

        // Get the exchange state
        [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

        // It should match ExchangeState.Completed
        assert.equal(response, ExchangeState.Completed, "Exchange state is incorrect");
      });

      it("should emit an ExchangeCompleted event if operator calls after fulfillment period", async function () {
        // Set time forward to the offer's redeemableFromDate
        await setNextBlockTimestamp(Number(redeemableFromDate));

        // Redeem the voucher
        await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

        // Get the current block info
        blockNumber = await ethers.provider.getBlockNumber();
        block = await ethers.provider.getBlock(blockNumber);

        // Set time forward to run out the fulfillment period
        newTime = Number((block.timestamp + Number(fulfillmentPeriodDuration) + 1).toString().substring(0, 11));
        await setNextBlockTimestamp(newTime);

        // Complete exchange
        await expect(exchangeHandler.connect(operator).completeExchange(exchange.id))
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchange.id);
      });

      context("💔 Revert Reasons", async function () {
        /*
         * Reverts if:
         * - Exchange does not exist
         * - Exchange is not in redeemed state
         * - Caller is not buyer or seller's operator
         * - Caller is seller's operator and offer fulfillment period has not elapsed
         */

        it("exchange id is invalid", async function () {
          // An invalid exchange id
          id = "666";

          // Attempt to complete the exchange, expecting revert
          await expect(exchangeHandler.connect(operator).completeExchange(id)).to.revertedWith(
            RevertReasons.NO_SUCH_EXCHANGE
          );
        });

        it("exchange is not in redeemed state", async function () {
          // Cancel the voucher
          await exchangeHandler.connect(buyer).cancelVoucher(exchange.id);

          // Attempt to complete the exchange, expecting revert
          await expect(exchangeHandler.connect(operator).completeExchange(exchange.id)).to.revertedWith(
            RevertReasons.INVALID_STATE
          );
        });

        it("caller is not buyer or seller's operator", async function () {
          // Set time forward to the offer's redeemableFromDate
          await setNextBlockTimestamp(Number(redeemableFromDate));

          // Redeem the voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Attempt to complete the exchange, expecting revert
          await expect(exchangeHandler.connect(rando).completeExchange(exchange.id)).to.revertedWith(
            RevertReasons.NOT_BUYER_OR_SELLER
          );
        });

        it("caller is seller's operator and offer fulfillment period has not elapsed", async function () {
          // Set time forward to the offer's redeemableFromDate
          await setNextBlockTimestamp(Number(redeemableFromDate));

          // Redeem the voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Attempt to complete the exchange, expecting revert
          await expect(exchangeHandler.connect(operator).completeExchange(exchange.id)).to.revertedWith(
            RevertReasons.FULFILLMENT_PERIOD_NOT_ELAPSED
          );
        });
      });
    });

    context("👉 revokeVoucher()", async function () {
      beforeEach(async function () {
        // Commit to offer
        tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);

        // Update the committed date in the expected exchange struct with the block timestamp of the tx
        exchange.voucher.committedDate = block.timestamp.toString();

        // Update the validUntilDate date in the expected exchange struct
        exchange.voucher.validUntilDate = calculateVoucherExpiry(block, redeemableFromDate, voucherValidDuration);

        // Get the struct
        exchangeStruct = exchange.toStruct();
      });

      it("should emit an VoucherRevoked event when seller's operator calls", async function () {
        // Revoke the voucher, expecting event
        await expect(exchangeHandler.connect(operator).revokeVoucher(exchange.id))
          .to.emit(exchangeHandler, "VoucherRevoked")
          .withArgs(offerId, exchange.id, operator.address);
      });

      it("should update state", async function () {
        // Revoke the voucher
        await exchangeHandler.connect(operator).revokeVoucher(exchange.id);

        // Get the exchange state
        [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

        // It should match ExchangeState.Revoked
        assert.equal(response, ExchangeState.Revoked, "Exchange state is incorrect");
      });

      context("💔 Revert Reasons", async function () {
        /*
         * Reverts if
         * - Exchange does not exist
         * - Exchange is not in committed state
         * - Caller is not seller's operator
         */

        it("exchange id is invalid", async function () {
          // An invalid exchange id
          id = "666";

          // Attempt to revoke the voucher, expecting revert
          await expect(exchangeHandler.connect(operator).revokeVoucher(id)).to.revertedWith(
            RevertReasons.NO_SUCH_EXCHANGE
          );
        });

        it("exchange is not in committed state", async function () {
          // Cancel the voucher
          await exchangeHandler.connect(buyer).cancelVoucher(exchange.id);

          // Attempt to revoke the voucher, expecting revert
          await expect(exchangeHandler.connect(operator).revokeVoucher(exchange.id)).to.revertedWith(
            RevertReasons.INVALID_STATE
          );
        });

        it("caller is not seller's operator", async function () {
          // Attempt to complete the exchange, expecting revert
          await expect(exchangeHandler.connect(rando).revokeVoucher(exchange.id)).to.revertedWith(
            RevertReasons.NOT_OPERATOR
          );
        });
      });
    });

    context("👉 cancelVoucher()", async function () {
      beforeEach(async function () {
        // Commit to offer, retrieving the event
        tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);

        // Update the committed date in the expected exchange struct with the block timestamp of the tx
        exchange.voucher.committedDate = block.timestamp.toString();

        // Update the validUntilDate date in the expected exchange struct
        exchange.voucher.validUntilDate = calculateVoucherExpiry(block, redeemableFromDate, voucherValidDuration);

        // Get the struct
        exchangeStruct = exchange.toStruct();
      });

      it("should emit an VoucherCanceled event when original buyer calls", async function () {
        // Cancel the voucher, expecting event
        await expect(exchangeHandler.connect(buyer).cancelVoucher(exchange.id))
          .to.emit(exchangeHandler, "VoucherCanceled")
          .withArgs(offerId, exchange.id, buyer.address);
      });

      it("should emit an VoucherCanceled event when new owner (not a buyer) calls", async function () {
        // Transfer voucher to new owner
        await bosonVoucher.connect(buyer).transferFrom(buyer.address, newOwner.address, exchange.id);

        // Cancel the voucher, expecting event
        await expect(exchangeHandler.connect(newOwner).cancelVoucher(exchange.id))
          .to.emit(exchangeHandler, "VoucherCanceled")
          .withArgs(offerId, exchange.id, newOwner.address);
      });

      it("should update state when buyer calls", async function () {
        // Cancel the voucher
        await exchangeHandler.connect(buyer).cancelVoucher(exchange.id);

        // Get the exchange state
        [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

        // It should match ExchangeState.Canceled
        assert.equal(response, ExchangeState.Canceled, "Exchange state is incorrect");
      });

      context("💔 Revert Reasons", async function () {
        /*
         * Reverts if
         * - Exchange does not exist
         * - Exchange is not in committed state
         * - Caller does not own voucher
         */

        it("exchange id is invalid", async function () {
          // An invalid exchange id
          id = "666";

          // Attempt to cancel the voucher, expecting revert
          await expect(exchangeHandler.connect(buyer).cancelVoucher(id)).to.revertedWith(
            RevertReasons.NO_SUCH_EXCHANGE
          );
        });

        it("exchange is not in committed state", async function () {
          // Revoke the voucher
          await exchangeHandler.connect(operator).revokeVoucher(exchange.id);

          // Attempt to cancel the voucher, expecting revert
          await expect(exchangeHandler.connect(buyer).cancelVoucher(exchange.id)).to.revertedWith(
            RevertReasons.INVALID_STATE
          );
        });

        it("caller does not own voucher", async function () {
          // Attempt to cancel the voucher, expecting revert
          await expect(exchangeHandler.connect(rando).cancelVoucher(exchange.id)).to.revertedWith(
            RevertReasons.NOT_VOUCHER_HOLDER
          );
        });
      });
    });

    context("👉 expireVoucher()", async function () {
      beforeEach(async function () {
        // Commit to offer, retrieving the event
        tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);

        // Update the committed date in the expected exchange struct with the block timestamp of the tx
        exchange.voucher.committedDate = block.timestamp.toString();

        // Update the validUntilDate date in the expected exchange struct
        exchange.voucher.validUntilDate = calculateVoucherExpiry(block, redeemableFromDate, voucherValidDuration);

        // Get the struct
        exchangeStruct = exchange.toStruct();
      });

      it("should emit an VoucherExpired event when anyone calls and voucher has expired", async function () {
        // Set time forward past the voucher's validUntilDate
        await setNextBlockTimestamp(Number(redeemableFromDate) + Number(voucherValidDuration) + Number(oneWeek));

        // Expire the voucher, expecting event
        await expect(exchangeHandler.connect(rando).expireVoucher(exchange.id))
          .to.emit(exchangeHandler, "VoucherExpired")
          .withArgs(offerId, exchange.id, rando.address);
      });

      it("should update state when anyone calls and voucher has expired", async function () {
        // Set time forward past the voucher's validUntilDate
        await setNextBlockTimestamp(Number(redeemableFromDate) + Number(voucherValidDuration) + Number(oneWeek));

        // Expire the voucher
        await exchangeHandler.connect(rando).expireVoucher(exchange.id);

        // Get the exchange state
        [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

        // It should match ExchangeState.Canceled
        assert.equal(response, ExchangeState.Canceled, "Exchange state is incorrect");
      });

      it("should update voucher expired flag when anyone calls and voucher has expired", async function () {
        // Set time forward past the voucher's validUntilDate
        await setNextBlockTimestamp(Number(redeemableFromDate) + Number(voucherValidDuration) + Number(oneWeek));

        // Expire the voucher
        await exchangeHandler.connect(rando).expireVoucher(exchange.id);

        // Get the exchange
        [, response] = await exchangeHandler.connect(rando).getExchange(exchange.id);

        // Marshal response to entity
        exchange = Exchange.fromStruct(response);
        expect(exchange.isValid());

        // Exchange's voucher expired flag should be true
        assert.isTrue(exchange.voucher.expired, "Voucher expired flag not set");
      });

      context("💔 Revert Reasons", async function () {
        /*
         * Reverts if
         * - Exchange does not exist
         * - Exchange is not in committed state
         * - Redemption period has not yet elapsed
         */

        it("exchange id is invalid", async function () {
          // Set time forward past the voucher's validUntilDate
          await setNextBlockTimestamp(Number(redeemableFromDate) + Number(voucherValidDuration) + Number(oneWeek));

          // An invalid exchange id
          id = "666";

          // Attempt to cancel the voucher, expecting revert
          await expect(exchangeHandler.connect(buyer).expireVoucher(id)).to.revertedWith(
            RevertReasons.NO_SUCH_EXCHANGE
          );
        });

        it("exchange is not in committed state", async function () {
          // Set time forward past the voucher's validUntilDate
          await setNextBlockTimestamp(Number(redeemableFromDate) + Number(voucherValidDuration) + Number(oneWeek));

          // Revoke the voucher
          await exchangeHandler.connect(operator).revokeVoucher(exchange.id);

          // Attempt to expire the voucher, expecting revert
          await expect(exchangeHandler.connect(buyer).expireVoucher(exchange.id)).to.revertedWith(
            RevertReasons.INVALID_STATE
          );
        });

        it("Redemption period has not yet elapsed", async function () {
          // Attempt to cancel the voucher, expecting revert
          await expect(exchangeHandler.connect(rando).expireVoucher(exchange.id)).to.revertedWith(
            RevertReasons.VOUCHER_STILL_VALID
          );
        });
      });
    });

    context("👉 redeemVoucher()", async function () {
      beforeEach(async function () {
        // Commit to offer
        tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);

        // Update the committed date in the expected exchange struct with the block timestamp of the tx
        exchange.voucher.committedDate = block.timestamp.toString();

        // Update the validUntilDate date in the expected exchange struct
        exchange.voucher.validUntilDate = calculateVoucherExpiry(block, redeemableFromDate, voucherValidDuration);

        // Get the struct
        exchangeStruct = exchange.toStruct();
      });

      it("should emit a VoucherRedeemed event when buyer calls", async function () {
        // Set time forward to the offer's redeemableFromDate
        await setNextBlockTimestamp(Number(redeemableFromDate));

        // Redeem the voucher, expecting event
        await expect(exchangeHandler.connect(buyer).redeemVoucher(exchange.id))
          .to.emit(exchangeHandler, "VoucherRedeemed")
          .withArgs(offerId, exchange.id, buyer.address);
      });

      it("should update state when buyer calls", async function () {
        // Set time forward to the offer's redeemableFromDate
        await setNextBlockTimestamp(Number(redeemableFromDate));

        // Redeem the voucher
        await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

        // Get the exchange state
        [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

        // It should match ExchangeState.Redeemed
        assert.equal(response, ExchangeState.Redeemed, "Exchange state is incorrect");
      });

      context("💔 Revert Reasons", async function () {
        /*
         * Reverts if
         * - Exchange does not exist
         * - Exchange is not in committed state
         * - Caller does not own voucher
         * - Current time is prior to offer.redeemableFromDate
         * - Current time is after exchange.voucher.validUntilDate
         */

        it("exchange id is invalid", async function () {
          // An invalid exchange id
          id = "666";

          // Attempt to redeem the voucher, expecting revert
          await expect(exchangeHandler.connect(buyer).redeemVoucher(id)).to.revertedWith(
            RevertReasons.NO_SUCH_EXCHANGE
          );
        });

        it("exchange is not in committed state", async function () {
          // Revoke the voucher
          await exchangeHandler.connect(operator).revokeVoucher(exchange.id);

          // Attempt to redeem the voucher, expecting revert
          await expect(exchangeHandler.connect(buyer).redeemVoucher(exchange.id)).to.revertedWith(
            RevertReasons.INVALID_STATE
          );
        });

        it("caller does not own voucher", async function () {
          // Attempt to redeem the voucher, expecting revert
          await expect(exchangeHandler.connect(rando).redeemVoucher(exchange.id)).to.revertedWith(
            RevertReasons.NOT_VOUCHER_HOLDER
          );
        });

        it("current time is prior to offer's redeemableFromDate", async function () {
          // Attempt to redeem the voucher, expecting revert
          await expect(exchangeHandler.connect(buyer).redeemVoucher(exchange.id)).to.revertedWith(
            RevertReasons.VOUCHER_NOT_REDEEMABLE
          );
        });

        it("current time is after to voucher's validUntilDate", async function () {
          // Set time forward past the voucher's validUntilDate
          await setNextBlockTimestamp(Number(redeemableFromDate) + Number(voucherValidDuration) + Number(oneWeek));

          // Attempt to redeem the voucher, expecting revert
          await expect(exchangeHandler.connect(buyer).redeemVoucher(exchange.id)).to.revertedWith(
            RevertReasons.VOUCHER_NOT_REDEEMABLE
          );
        });
      });
    });

    context("👉 onVoucherTransferred()", async function () {
      beforeEach(async function () {
        // Commit to offer, retrieving the event
        tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);

        // Update the committed date in the expected exchange struct with the block timestamp of the tx
        exchange.voucher.committedDate = block.timestamp.toString();

        // Update the validUntilDate date in the expected exchange struct
        exchange.voucher.validUntilDate = calculateVoucherExpiry(block, redeemableFromDate, voucherValidDuration);

        // Get the struct
        exchangeStruct = exchange.toStruct();

        // Grant CLIENT role to an EOA for testing
        await accessController.grantRole(Role.CLIENT, fauxClient.address);
      });

      it("should emit an VoucherTransferred event when called by CLIENT-roled address", async function () {
        // Get the next buyer id
        nextAccountId = await accountHandler.connect(rando).getNextAccountId();

        // Call onVoucherTransferred, expecting event
        await expect(exchangeHandler.connect(fauxClient).onVoucherTransferred(exchange.id, newOwner.address))
          .to.emit(exchangeHandler, "VoucherTransferred")
          .withArgs(offerId, exchange.id, nextAccountId);
      });

      it("should update exchange when new buyer (with existing, active account) is passed", async function () {
        // Get the next buyer id
        nextAccountId = await accountHandler.connect(rando).getNextAccountId();

        // Create a buyer account for the new owner
        await accountHandler.connect(newOwner).createBuyer(new Buyer("0", newOwner.address, true));

        // Call onVoucherTransferred
        await expect(exchangeHandler.connect(fauxClient).onVoucherTransferred(exchange.id, newOwner.address));

        // Get the exchange
        [exists, response] = await exchangeHandler.connect(rando).getExchange(exchange.id);

        // Marshal response to entity
        exchange = Exchange.fromStruct(response);
        expect(exchange.isValid());

        // Exchange's voucher expired flag should be true
        assert.equal(exchange.buyerId, nextAccountId, "Exchange.buyerId not updated");
      });

      it("should update exchange when new buyer (no account) is passed", async function () {
        // Get the next buyer id
        nextAccountId = await accountHandler.connect(rando).getNextAccountId();

        // Call onVoucherTransferred
        await expect(exchangeHandler.connect(fauxClient).onVoucherTransferred(exchange.id, newOwner.address));

        // Get the exchange
        [exists, response] = await exchangeHandler.connect(rando).getExchange(exchange.id);

        // Marshal response to entity
        exchange = Exchange.fromStruct(response);
        expect(exchange.isValid());

        // Exchange's voucher expired flag should be true
        assert.equal(exchange.buyerId, nextAccountId, "Exchange.buyerId not updated");
      });

      context("💔 Revert Reasons", async function () {
        /**
         * Reverts if
         * - Caller does not have CLIENT role
         * - Exchange does not exist
         * - Exchange is not in committed state
         * - Voucher has expired
         * - New buyer's existing account is deactivated
         */

        it("Caller does not have CLIENT role", async function () {
          // Attempt to call onVoucherTransferred, expecting revert
          await expect(
            exchangeHandler.connect(rando).onVoucherTransferred(exchange.id, newOwner.address)
          ).to.revertedWith(RevertReasons.ACCESS_DENIED);
        });

        it("exchange id is invalid", async function () {
          // An invalid exchange id
          id = "666";

          // Attempt to call onVoucherTransferred, expecting revert
          await expect(exchangeHandler.connect(fauxClient).onVoucherTransferred(id, newOwner.address)).to.revertedWith(
            RevertReasons.NO_SUCH_EXCHANGE
          );
        });

        it("exchange is not in committed state", async function () {
          // Revoke the voucher
          await exchangeHandler.connect(operator).revokeVoucher(exchange.id);

          // Attempt to call onVoucherTransferred, expecting revert
          await expect(exchangeHandler.connect(fauxClient).onVoucherTransferred(id, newOwner.address)).to.revertedWith(
            RevertReasons.INVALID_STATE
          );
        });

        it("Voucher has expired", async function () {
          // Set time forward past the voucher's validUntilDate
          await setNextBlockTimestamp(Number(redeemableFromDate) + Number(voucherValidDuration) + Number(oneWeek));

          // Attempt to call onVoucherTransferred, expecting revert
          await expect(exchangeHandler.connect(fauxClient).onVoucherTransferred(id, newOwner.address)).to.revertedWith(
            RevertReasons.VOUCHER_HAS_EXPIRED
          );
        });

        // TODO: Include this test when AccountHandlerFacet.updateBuyer is implemented
        it.skip("New buyer's existing account is deactivated", async function () {
          // Get the next buyer id
          nextAccountId = await accountHandler.connect(rando).getNextAccountId();

          // Create a buyer account for the new owner
          await accountHandler.connect(newOwner).createBuyer(new Buyer("0", newOwner.address, true));

          // Update buyer account, deactivating it
          await accountHandler.connect(newOwner).updateBuyer(new Buyer(nextAccountId, newOwner.address, false));

          // Attempt to call onVoucherTransferred, expecting revert
          await expect(exchangeHandler.connect(fauxClient).onVoucherTransferred(id, newOwner.address)).to.revertedWith(
            RevertReasons.MUST_BE_ACTIVE
          );
        });
      });
    });

    context("👉 isExchangeFinalized()", async function () {
      beforeEach(async function () {
        // Commit to offer, creating a new exchange
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });
      });

      context("👍 undisputed exchange", async function () {
        it("should return false if exchange is in Committed state", async function () {
          // In Committed state, ask if exchange is finalized
          [exists, response] = await exchangeHandler.connect(rando).isExchangeFinalized(exchange.id);

          // It should not be finalized
          assert.equal(response, false, "Incorrectly reports finalized state");
        });

        it("should return false if exchange is in Redeemed state", async function () {
          // Set time forward to the offer's redeemableFromDate
          await setNextBlockTimestamp(Number(redeemableFromDate));

          // Redeem voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Now in Redeemed state, ask if exchange is finalized
          [exists, response] = await exchangeHandler.connect(rando).isExchangeFinalized(exchange.id);

          // It should not be finalized
          assert.equal(response, false, "Incorrectly reports finalized state");
        });

        it("should return true if exchange is in Completed state", async function () {
          // Set time forward to the offer's redeemableFromDate
          await setNextBlockTimestamp(Number(redeemableFromDate));

          // Redeem voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Get the current block info
          blockNumber = await ethers.provider.getBlockNumber();
          block = await ethers.provider.getBlock(blockNumber);

          // Set time forward to run out the fulfillment period
          newTime = Number(
            (Number(redeemableFromDate) + Number(fulfillmentPeriodDuration) + 1).toString().substring(0, 11)
          );
          await setNextBlockTimestamp(newTime);

          // Complete exchange
          await exchangeHandler.connect(operator).completeExchange(exchange.id);

          // Now in Completed state, ask if exchange is finalized
          [exists, response] = await exchangeHandler.connect(rando).isExchangeFinalized(exchange.id);

          // It should be finalized
          assert.equal(response, true, "Incorrectly reports unfinalized state");
        });

        it("should return true if exchange is in Revoked state", async function () {
          // Revoke voucher
          await exchangeHandler.connect(operator).revokeVoucher(exchange.id);

          // Now in Revoked state, ask if exchange is finalized
          [exists, response] = await exchangeHandler.connect(rando).isExchangeFinalized(exchange.id);

          // It should be finalized
          assert.equal(response, true, "Incorrectly reports unfinalized state");
        });

        it("should return true if exchange is in Canceled state", async function () {
          // Cancel voucher
          await exchangeHandler.connect(buyer).cancelVoucher(exchange.id);

          // Now in Canceled state, ask if exchange is finalized
          [exists, response] = await exchangeHandler.connect(rando).isExchangeFinalized(exchange.id);

          // It should be finalized
          assert.equal(response, true, "Incorrectly reports unfinalized state");
        });
      });

      // TODO Include this context when DisputeHandlerFacet.raiseDispute works
      context.skip("👎 disputed exchange", async function () {
        beforeEach(async function () {
          // Raise a dispute on the exchange
          // await disputeHandler.connect(buyer).raiseDispute(exchange.id, "Tastes wierd");
        });

        // TODO Include this test when DisputeHandlerFacet.raiseDispute works
        it.skip("should return false if exchange has a dispute in Disputed state", async function () {
          // In Disputed state, ask if exchange is finalized
          [exists, response] = await exchangeHandler.connect(rando).isExchangeFinalized(exchange.id);

          // It should be finalized
          assert.equal(response, false, "Incorrectly reports unfinalized state");
        });

        // TODO Include this test when DisputeHandlerFacet.retractDispute works
        it.skip("should return true if exchange has a dispute in Retracted state", async function () {
          // Retract Dispute
          [exists, response] = await disputeHandler.connect(buyer).retractDispute(exchange.id);

          // Now in Retracted state, ask if exchange is finalized
          [exists, response] = await exchangeHandler.connect(rando).isExchangeFinalized(exchange.id);

          // It should be finalized
          assert.equal(response, true, "Incorrectly reports unfinalized state");
        });

        // TODO Include this test when DisputeHandlerFacet.resolveDispute works
        it.skip("should return true if exchange has a dispute in Resolved state", async function () {
          // Resolve Dispute
          [exists, response] = await disputeHandler.connect(game).resolveDispute(exchange.id);

          // Now in Resolved state, ask if exchange is finalized
          [exists, response] = await exchangeHandler.connect(rando).isExchangeFinalized(exchange.id);

          // It should be finalized
          assert.equal(response, true, "Incorrectly reports unfinalized state");
        });

        // TODO Include this test when DisputeHandlerFacet.decideDispute works
        it.skip("should return true if exchange has a dispute in Decided state", async function () {
          // Decide Dispute
          [exists, response] = await disputeHandler.connect(game).decideDispute(exchange.id);

          // Now in Decided state, ask if exchange is finalized
          [exists, response] = await exchangeHandler.connect(rando).isExchangeFinalized(exchange.id);

          // It should be finalized
          assert.equal(response, true, "Incorrectly reports unfinalized state");
        });
      });
    });

    context("👉 getNextExchangeId()", async function () {
      it("should return the next exchange id", async function () {
        // Get the next exchange id and compare it to the initial expected id
        nextExchangeId = await exchangeHandler.connect(rando).getNextExchangeId();
        expect(nextExchangeId).to.equal(id);

        // Commit to offer, creating a new exchange
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

        // Get the next exchange id and ensure it was incremented by the creation of the offer
        nextExchangeId = await exchangeHandler.connect(rando).getNextExchangeId();
        expect(nextExchangeId).to.equal(++id);
      });

      it("should not increment the counter", async function () {
        // Get the next exchange id
        nextExchangeId = await exchangeHandler.connect(rando).getNextExchangeId();
        expect(nextExchangeId).to.equal(id);

        // Get the next exchange id and ensure it was not incremented by the previous call
        nextExchangeId = await exchangeHandler.connect(rando).getNextExchangeId();
        expect(nextExchangeId).to.equal(id);
      });
    });

    context("👉 getExchange()", async function () {
      beforeEach(async function () {
        // Commit to offer
        tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);

        // Update the committed date in the expected exchange struct with the block timestamp of the tx
        exchange.voucher.committedDate = block.timestamp.toString();

        // Update the validUntilDate date in the expected exchange struct
        exchange.voucher.validUntilDate = calculateVoucherExpiry(block, redeemableFromDate, voucherValidDuration);

        // Get the struct
        exchangeStruct = exchange.toStruct();
      });

      it("should return true for exists if exchange id is valid", async function () {
        // Get the exchange
        [exists, response] = await exchangeHandler.connect(rando).getExchange(exchange.id);

        // Test existence flag
        expect(exists).to.be.true;
      });

      it("should return false for exists if exchange id is not valid", async function () {
        // Get the exchange
        [exists, response] = await exchangeHandler.connect(rando).getExchange(exchange.id + 10);

        // Test existence flag
        expect(exists).to.be.false;
      });

      it("should return the expected exchange if exchange id is valid", async function () {
        // Get the exchange
        [exists, response] = await exchangeHandler.connect(rando).getExchange(exchange.id);

        // It should match the expected exchange struct
        assert.equal(exchange.toString(), Exchange.fromStruct(response).toString(), "Exchange struct is incorrect");
      });
    });

    context("👉 getExchangeState()", async function () {
      beforeEach(async function () {
        // Commit to offer
        tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);

        // Update the committed date in the expected exchange struct with the block timestamp of the tx
        exchange.voucher.committedDate = block.timestamp.toString();

        // Update the validUntilDate date in the expected exchange struct
        exchange.voucher.validUntilDate = calculateVoucherExpiry(block, redeemableFromDate, voucherValidDuration);

        // Get the struct
        exchangeStruct = exchange.toStruct();
      });

      it("should return true for exists if exchange id is valid", async function () {
        // Get the exchange state
        [exists, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

        // Test existence flag
        expect(exists).to.be.true;
      });

      it("should return false for exists if exchange id is not valid", async function () {
        // Attempt to get the exchange state for invalid exchange
        [exists, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id + 10);

        // Test existence flag
        expect(exists).to.be.false;
      });

      it("should return the expected exchange state if exchange id is valid", async function () {
        // Get the exchange state
        [exists, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

        // It should match ExchangeState.Committed
        assert.equal(exchange.state, ExchangeState.Committed, "Exchange state is incorrect");
      });
    });
  });
});
