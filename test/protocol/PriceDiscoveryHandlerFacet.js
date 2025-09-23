const { ethers } = require("hardhat");
const { ZeroAddress, getContractFactory, parseUnits, provider, getContractAt, MaxUint256 } = ethers;
const { expect } = require("chai");

const Exchange = require("../../scripts/domain/Exchange");
const PriceDiscovery = require("../../scripts/domain/PriceDiscovery");
const Side = require("../../scripts/domain/Side");
const PriceType = require("../../scripts/domain/PriceType.js");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const { FundsList } = require("../../scripts/domain/Funds");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const {
  mockOffer,
  mockDisputeResolver,
  mockAuthToken,
  mockVoucherInitValues,
  mockSeller,
  mockVoucher,
  mockExchange,
  mockBuyer,
  accountId,
} = require("../util/mock");
const {
  setNextBlockTimestamp,
  calculateVoucherExpiry,
  calculateBosonProxyAddress,
  calculateCloneAddress,
  applyPercentage,
  setupTestEnvironment,
  getSnapshot,
  revertToSnapshot,
  deriveTokenId,
  getCurrentBlockAndSetTimeForward,
} = require("../util/utils.js");
const { oneWeek, oneMonth } = require("../util/constants");
const { RoyaltyInfo } = require("../../scripts/domain/RoyaltyInfo.js");

/**
 *  Test the Boson Price Discovery Handler interface
 */
describe("IPriceDiscoveryHandlerFacet", function () {
  // Common vars
  let InterfaceIds;
  let pauser, assistant, admin, treasury, rando, buyer, assistantDR, adminDR, treasuryDR;
  let erc165,
    accountHandler,
    exchangeHandler,
    offerHandler,
    fundsHandler,
    pauseHandler,
    configHandler,
    priceDiscoveryHandler;
  let bosonVoucherClone;
  let offerId, seller;
  let block, tx;
  let support;
  let price, sellerPool;
  let voucherRedeemableFrom;
  let voucherValid;
  let protocolFeePercentage;
  let voucher;
  let exchange;
  let drParams, disputeResolverFees;
  let expectedCloneAddress;
  let voucherInitValues;
  let emptyAuthToken;
  let agentId;
  let exchangeId;
  let offer, offerFees;
  let offerDates, offerDurations;
  let weth;
  let protocolDiamondAddress;
  let snapshotId;
  let priceDiscoveryContract;
  let tokenId;
  let bosonVoucher;
  let offerFeeLimit;
  let bosonErrors;
  let bpd;

  before(async function () {
    accountId.next(true);

    // get interface Ids
    InterfaceIds = await getInterfaceIds();

    // Add WETH
    const wethFactory = await getContractFactory("WETH9");
    weth = await wethFactory.deploy();
    await weth.waitForDeployment();

    // Specify contracts needed for this test
    const contracts = {
      erc165: "ERC165Facet",
      accountHandler: "IBosonAccountHandler",
      offerHandler: "IBosonOfferHandler",
      exchangeHandler: "IBosonExchangeHandler",
      fundsHandler: "IBosonFundsHandler",
      configHandler: "IBosonConfigHandler",
      pauseHandler: "IBosonPauseHandler",
      priceDiscoveryHandler: "IBosonPriceDiscoveryHandler",
    };

    ({
      signers: [pauser, admin, treasury, buyer, rando, adminDR, treasuryDR],
      contractInstances: {
        erc165,
        accountHandler,
        offerHandler,
        exchangeHandler,
        fundsHandler,
        configHandler,
        pauseHandler,
        priceDiscoveryHandler,
      },
      protocolConfig: [, , protocolFeePercentage],
      diamondAddress: protocolDiamondAddress,
    } = await setupTestEnvironment(contracts, {
      wethAddress: await weth.getAddress(),
    }));

    bosonErrors = await getContractAt("BosonErrors", await configHandler.getAddress());

    // Add BosonPriceDiscovery
    const bpdFactory = await getContractFactory("BosonPriceDiscovery");
    bpd = await bpdFactory.deploy(await weth.getAddress(), protocolDiamondAddress);
    await bpd.waitForDeployment();

    await configHandler.setPriceDiscoveryAddress(await bpd.getAddress());

    // make all account the same
    assistant = admin;
    assistantDR = adminDR;

    // Deploy PriceDiscovery contract
    const PriceDiscoveryFactory = await getContractFactory("PriceDiscoveryMock");
    priceDiscoveryContract = await PriceDiscoveryFactory.deploy();
    await priceDiscoveryContract.waitForDeployment();

    // Get snapshot id
    snapshotId = await getSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();
  });

  // Interface support (ERC-156 provided by ProtocolDiamond, others by waitForDeployment facets)
  context("📋 Interfaces", async function () {
    context("👉 supportsInterface()", async function () {
      it("should indicate support for IPriceDiscoveryHandlerFacet interface", async function () {
        // Current interfaceId for IBosonPriceDiscoveryHandler
        support = await erc165.supportsInterface(InterfaceIds.IBosonPriceDiscoveryHandler);

        // Test
        expect(support, "PriceDiscoveryHandlerFacet interface not supported").is.true;
      });
    });
  });

  context("📋 Constructor", async function () {
    it("Deployment fails if wrapped native address is 0", async function () {
      const priceDiscoveryFactory = await getContractFactory("PriceDiscoveryHandlerFacet");

      await expect(priceDiscoveryFactory.deploy(ZeroAddress)).to.revertedWithCustomError(
        bosonErrors,
        RevertReasons.INVALID_ADDRESS
      );
    });
  });

  // All supported Price discovery methods
  context("📋 Price discovery Methods", async function () {
    beforeEach(async function () {
      // Initial ids for all the things
      exchangeId = offerId = "1";
      agentId = "0"; // agent id is optional while creating an offer
      offerFeeLimit = MaxUint256; // unlimited offer fee to not affect the tests

      // Create a valid seller
      seller = mockSeller(assistant.address, admin.address, ZeroAddress, treasury.address);
      expect(seller.isValid()).is.true;

      // AuthToken
      emptyAuthToken = mockAuthToken();
      expect(emptyAuthToken.isValid()).is.true;

      // VoucherInitValues
      voucherInitValues = mockVoucherInitValues();
      expect(voucherInitValues.isValid()).is.true;

      await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

      const beaconProxyAddress = await calculateBosonProxyAddress(protocolDiamondAddress);
      expectedCloneAddress = calculateCloneAddress(protocolDiamondAddress, beaconProxyAddress, admin.address);

      // Create a valid dispute resolver
      const disputeResolver = mockDisputeResolver(
        assistantDR.address,
        adminDR.address,
        ZeroAddress,
        treasuryDR.address,
        true
      );
      expect(disputeResolver.isValid()).is.true;

      //Create DisputeResolverFee array so offer creation will succeed
      disputeResolverFees = [new DisputeResolverFee(ZeroAddress, "Native", "0")];

      // Make empty seller list, so every seller is allowed
      const sellerAllowList = [];

      // Register the dispute resolver
      await accountHandler
        .connect(adminDR)
        .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

      // Create the offer
      const mo = await mockOffer();
      ({ offerDates, offerDurations, drParams } = mo);
      offer = mo.offer;
      offer.priceType = PriceType.Discovery;
      offer.price = "0";
      offer.buyerCancelPenalty = "0";
      offerFees = mo.offerFees;
      offerFees.protocolFee = applyPercentage(offer.price, protocolFeePercentage);

      offer.quantityAvailable = "10";

      offerDurations.voucherValid = (oneMonth * 12n).toString();

      // Check if domains are valid
      expect(offer.isValid()).is.true;
      expect(offerDates.isValid()).is.true;
      expect(offerDurations.isValid()).is.true;

      // Create the offer, reserve range and premint vouchers
      await offerHandler
        .connect(assistant)
        .createOffer(offer, offerDates, offerDurations, drParams, agentId, offerFeeLimit);
      await offerHandler.connect(assistant).reserveRange(offer.id, offer.quantityAvailable, assistant.address);
      bosonVoucher = await getContractAt("BosonVoucher", expectedCloneAddress);
      await bosonVoucher.connect(assistant).preMint(offer.id, offer.quantityAvailable);

      // Set used variables
      voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
      voucherValid = offerDurations.voucherValid;
      sellerPool = offer.sellerDeposit;

      // Required voucher constructor params
      voucher = mockVoucher();
      voucher.redeemedDate = "0";

      // Mock exchange
      exchange = mockExchange();
      exchange.finalizedDate = "0";

      // Deposit seller funds so the commit will succeed
      await fundsHandler.connect(assistant).depositFunds(seller.id, ZeroAddress, sellerPool, { value: sellerPool });
    });

    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    context("👉 commitToPriceDiscoveryOffer()", async function () {
      let priceDiscovery;
      let newBuyer;

      context("Ask order", async function () {
        let order;
        beforeEach(async function () {
          // Price on secondary market
          price = 100n;
          tokenId = deriveTokenId(offer.id, exchangeId);

          // Prepare calldata for PriceDiscovery contract
          order = {
            seller: assistant.address,
            buyer: buyer.address,
            voucherContract: expectedCloneAddress,
            tokenId: tokenId,
            exchangeToken: await weth.getAddress(), // when offer is in native, we need to use wrapped native
            price: price,
          };

          const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilBuyOrder", [order]);
          const priceDiscoveryContractAddress = await priceDiscoveryContract.getAddress();

          priceDiscovery = new PriceDiscovery(
            price,
            Side.Ask,
            priceDiscoveryContractAddress,
            priceDiscoveryContractAddress,
            priceDiscoveryData
          );

          // Approve transfers
          // Buyer needs to approve the protocol to transfer the ETH
          await weth.connect(buyer).deposit({ value: price });
          await weth.connect(buyer).approve(await priceDiscoveryHandler.getAddress(), price);

          // Seller approves price discovery to transfer the voucher
          bosonVoucherClone = await getContractAt("IBosonVoucher", expectedCloneAddress);
          await bosonVoucher.connect(assistant).setApprovalForAll(await priceDiscoveryContract.getAddress(), true);

          // Seller also approves the protocol to encumber the paid price
          await weth.connect(assistant).approve(await priceDiscoveryHandler.getAddress(), price);

          newBuyer = mockBuyer(buyer.address);
          exchange.buyerId = newBuyer.id;
        });

        it("should emit FundsDeposited, FundsEncumbered and BuyerCommitted events", async function () {
          // Commit to offer
          tx = await priceDiscoveryHandler
            .connect(buyer)
            .commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery);

          // Get the block timestamp of the confirmed tx
          block = await provider.getBlock(tx.blockNumber);

          // Update the committed date in the expected exchange struct with the block timestamp of the tx
          voucher.committedDate = block.timestamp.toString();
          voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

          // Test for events
          // Seller deposit
          await expect(tx)
            .to.emit(priceDiscoveryHandler, "FundsEncumbered")
            .withArgs(seller.id, ZeroAddress, offer.sellerDeposit, expectedCloneAddress);

          // Buyers funds
          await expect(tx)
            .to.emit(priceDiscoveryHandler, "FundsDeposited")
            .withArgs(newBuyer.id, buyer.address, ZeroAddress, price);

          await expect(tx)
            .to.emit(priceDiscoveryHandler, "FundsEncumbered")
            .withArgs(newBuyer.id, ZeroAddress, price, buyer.address);

          await expect(tx)
            .to.emit(priceDiscoveryHandler, "BuyerCommitted")
            .withArgs(offerId, newBuyer.id, exchangeId, exchange.toStruct(), voucher.toStruct(), expectedCloneAddress);
        });

        it("should update state", async function () {
          // Escrow amount before
          const escrowBefore = await provider.getBalance(await priceDiscoveryHandler.getAddress());
          const buyerBefore = await weth.balanceOf(buyer.address);
          const { funds: sellerAvailableFundsBefore } = FundsList.fromStruct(
            await fundsHandler.getAvailableFunds(seller.id, [ZeroAddress])
          );

          // Commit to offer
          await priceDiscoveryHandler
            .connect(buyer)
            .commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery, { gasPrice: 0 });

          // Get the exchange as a struct
          const [, exchangeStruct] = await exchangeHandler.connect(rando).getExchange(exchangeId);

          // Parse into entity
          let returnedExchange = Exchange.fromStruct(exchangeStruct);
          expect(returnedExchange.buyerId).to.equal(newBuyer.id);

          // Contract's balance should increase for the amount of the price
          const escrowAfter = await provider.getBalance(await priceDiscoveryHandler.getAddress());
          expect(escrowAfter).to.equal(escrowBefore + price);

          // Buyer's balance should decrease
          const buyerAfter = await weth.balanceOf(buyer.address);
          expect(buyerAfter).to.equal(buyerBefore - price);

          // Seller's available funds should decrease for the amount of the seller deposit
          const { funds: sellerAvailableFundsAfter } = FundsList.fromStruct(
            await fundsHandler.getAvailableFunds(seller.id, [ZeroAddress])
          );
          expect(BigInt(sellerAvailableFundsAfter[0].availableAmount)).to.equal(
            BigInt(sellerAvailableFundsBefore[0].availableAmount) - BigInt(offer.sellerDeposit)
          );
        });

        it("should transfer the voucher", async function () {
          // seller is owner of voucher
          expect(await bosonVoucherClone.ownerOf(tokenId)).to.equal(assistant.address);

          // Commit to offer
          await priceDiscoveryHandler
            .connect(buyer)
            .commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery);

          // buyer is owner of voucher
          expect(await bosonVoucherClone.ownerOf(tokenId)).to.equal(buyer.address);
        });

        it("should not increment the next exchange id counter", async function () {
          const nextExchangeIdBefore = await exchangeHandler.getNextExchangeId();

          // Commit to offer, creating a new exchange
          await priceDiscoveryHandler
            .connect(buyer)
            .commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery);

          // Get the next exchange id and ensure it was no incremented
          const nextExchangeIdAfter = await exchangeHandler.getNextExchangeId();
          expect(nextExchangeIdAfter).to.equal(nextExchangeIdBefore);
        });

        it("Should not decrement quantityAvailable", async function () {
          // Get quantityAvailable before
          const [, { quantityAvailable: quantityAvailableBefore }] = await offerHandler
            .connect(rando)
            .getOffer(offerId);

          // Commit to offer, creating a new exchange
          await priceDiscoveryHandler
            .connect(buyer)
            .commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery);

          // Get quantityAvailable after
          const [, { quantityAvailable: quantityAvailableAfter }] = await offerHandler.connect(rando).getOffer(offerId);

          expect(quantityAvailableAfter).to.equal(quantityAvailableBefore, "Quantity available should be the same");
        });

        it("It is possible to commit on someone else's behalf", async function () {
          await weth.connect(rando).deposit({ value: price });
          await weth.connect(rando).approve(await priceDiscoveryHandler.getAddress(), price);

          const buyerBefore = await weth.balanceOf(buyer.address);
          const callerBefore = await weth.balanceOf(rando.address);

          // Commit to offer
          tx = await priceDiscoveryHandler
            .connect(rando)
            .commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery, { gasPrice: 0 });

          // Get the block timestamp of the confirmed tx
          block = await provider.getBlock(tx.blockNumber);

          // Update the committed date in the expected exchange struct with the block timestamp of the tx
          voucher.committedDate = block.timestamp.toString();
          voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

          await expect(tx)
            .to.emit(priceDiscoveryHandler, "BuyerCommitted")
            .withArgs(offerId, newBuyer.id, exchangeId, exchange.toStruct(), voucher.toStruct(), expectedCloneAddress);

          // Buyer is owner of voucher, not rando
          expect(await bosonVoucherClone.ownerOf(tokenId)).to.equal(buyer.address);

          // Buyer's balance should not change
          const buyerAfter = await weth.balanceOf(buyer.address);
          expect(buyerAfter).to.equal(buyerBefore);

          // Caller's balance should decrease
          const callerAfter = await weth.balanceOf(rando.address);
          expect(callerAfter).to.equal(callerBefore - price);
        });

        it("Works if the buyer provides offerId instead of tokenId", async function () {
          // Commit to offer
          tx = await priceDiscoveryHandler
            .connect(buyer)
            .commitToPriceDiscoveryOffer(buyer.address, offer.id, priceDiscovery);

          // Get the block timestamp of the confirmed tx
          block = await provider.getBlock(tx.blockNumber);

          // Update the committed date in the expected exchange struct with the block timestamp of the tx
          voucher.committedDate = block.timestamp.toString();
          voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

          // Test for events
          // Seller deposit
          await expect(tx)
            .to.emit(priceDiscoveryHandler, "FundsEncumbered")
            .withArgs(seller.id, ZeroAddress, offer.sellerDeposit, expectedCloneAddress);

          // Buyers funds - in ask order, they are taken from the seller deposit
          await expect(tx)
            .to.emit(priceDiscoveryHandler, "FundsDeposited")
            .withArgs(newBuyer.id, buyer.address, ZeroAddress, price);

          await expect(tx)
            .to.emit(priceDiscoveryHandler, "FundsEncumbered")
            .withArgs(newBuyer.id, ZeroAddress, price, buyer.address);

          await expect(tx)
            .to.emit(priceDiscoveryHandler, "BuyerCommitted")
            .withArgs(offerId, newBuyer.id, exchangeId, exchange.toStruct(), voucher.toStruct(), expectedCloneAddress);
        });

        it("It is possible to commit to price discovery offer if sequential commit region is paused", async function () {
          // Pause the sequential commit region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.SequentialCommit]);

          // Commit to offer
          await expect(
            priceDiscoveryHandler.connect(buyer).commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
          ).to.emit(priceDiscoveryHandler, "BuyerCommitted");
        });

        context("💔 Revert Reasons", async function () {
          it("The exchanges region of protocol is paused", async function () {
            // Pause the exchanges region of the protocol
            await pauseHandler.connect(pauser).pause([PausableRegion.Exchanges]);

            // Attempt to commit, expecting revert
            await expect(
              priceDiscoveryHandler.connect(buyer).commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
            )
              .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
              .withArgs(PausableRegion.Exchanges);
          });

          it("The buyers region of protocol is paused", async function () {
            // Pause the buyers region of the protocol
            await pauseHandler.connect(pauser).pause([PausableRegion.Buyers]);

            // Attempt to commit, expecting revert
            await expect(
              priceDiscoveryHandler.connect(buyer).commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
            )
              .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
              .withArgs(PausableRegion.Buyers);
          });

          it("The price discovery region of protocol is paused", async function () {
            // Pause the price discovery region of the protocol
            await pauseHandler.connect(pauser).pause([PausableRegion.PriceDiscovery]);

            // Attempt to sequentially commit, expecting revert
            await expect(
              priceDiscoveryHandler.connect(buyer).commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
            )
              .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
              .withArgs(PausableRegion.PriceDiscovery);
          });

          it("buyer address is the zero address", async function () {
            // Attempt to commit, expecting revert
            await expect(
              priceDiscoveryHandler.connect(buyer).commitToPriceDiscoveryOffer(ZeroAddress, tokenId, priceDiscovery)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_ADDRESS);
          });

          it("token id is invalid", async function () {
            // An invalid token id
            exchangeId = "666";
            tokenId = deriveTokenId(offer.id, exchangeId);
            order.tokenId = tokenId;
            const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilBuyOrder", [order]);
            priceDiscovery.priceDiscoveryData = priceDiscoveryData;

            // Attempt to commit, expecting revert
            await expect(
              priceDiscoveryHandler.connect(buyer).commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
            ).to.revertedWith(RevertReasons.ERC721_INVALID_TOKEN_ID);
          });

          it("offer is voided", async function () {
            // Void the offer first
            await offerHandler.connect(assistant).voidOffer(offerId);

            // Attempt to commit to the voided offer, expecting revert
            await expect(
              priceDiscoveryHandler.connect(buyer).commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_HAS_BEEN_VOIDED);
          });

          it("offer is not yet available for commits", async function () {
            // Create an offer with staring date in the future
            // get current block timestamp
            const block = await provider.getBlock("latest");

            // set validFrom date in the past
            offerDates.validFrom = (BigInt(block.timestamp) + oneMonth * 6n).toString(); // 6 months in the future
            offerDates.validUntil = BigInt(offerDates.validFrom + 10).toString(); // just after the valid from so it succeeds.

            offer.id = "2";
            exchangeId = await exchangeHandler.getNextExchangeId();
            let tokenId = deriveTokenId(offer.id, exchangeId);
            await offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, drParams, agentId, offerFeeLimit);
            await offerHandler.connect(assistant).reserveRange(offer.id, offer.quantityAvailable, assistant.address);
            await bosonVoucher.connect(assistant).preMint(offer.id, offer.quantityAvailable);

            // Attempt to commit to the not available offer, expecting revert
            order.tokenId = tokenId;
            const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilBuyOrder", [order]);
            priceDiscovery.priceDiscoveryData = priceDiscoveryData;
            await expect(
              priceDiscoveryHandler.connect(buyer).commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_NOT_AVAILABLE);
          });

          it("offer has expired", async function () {
            // Go past offer expiration date
            await setNextBlockTimestamp(Number(offerDates.validUntil) + 1);

            // Attempt to commit to the expired offer, expecting revert
            await expect(
              priceDiscoveryHandler.connect(buyer).commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_HAS_EXPIRED);
          });

          it.skip("offer sold", async function () {
            // maybe for offers without explicit token id
          });

          it("protocol fees too high", async function () {
            // Set protocol fees to 95%
            await configHandler.setProtocolFeePercentage(9500);
            // Set royalty fees to 6%
            await offerHandler
              .connect(assistant)
              .updateOfferRoyaltyRecipients(offer.id, new RoyaltyInfo([ZeroAddress], [600]));

            // Attempt to commit, expecting revert
            await expect(
              priceDiscoveryHandler.connect(buyer).commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.FEE_AMOUNT_TOO_HIGH);
          });

          it("insufficient values sent", async function () {
            price = price - 1n;
            await weth.connect(buyer).approve(await priceDiscoveryHandler.getAddress(), price);

            // Attempt to commit, expecting revert
            await expect(
              priceDiscoveryHandler.connect(buyer).commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
            ).to.revertedWith(RevertReasons.SAFE_ERC20_LOW_LEVEL_CALL);
          });

          it("price discovery does not send the voucher anywhere", async function () {
            // Deploy bad price discovery contract
            const PriceDiscoveryFactory = await getContractFactory("PriceDiscoveryNoTransfer");
            const priceDiscoveryContract = await PriceDiscoveryFactory.deploy();
            await priceDiscoveryContract.waitForDeployment();

            // Prepare calldata for PriceDiscovery contract
            tokenId = deriveTokenId(offer.id, exchangeId);
            order.tokenId = tokenId;

            const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilBuyOrder", [order]);
            const priceDiscoveryContractAddress = await priceDiscoveryContract.getAddress();
            priceDiscovery = new PriceDiscovery(
              price,
              Side.Ask,
              priceDiscoveryContractAddress,
              priceDiscoveryContractAddress,
              priceDiscoveryData
            );

            // Attempt to commit, expecting revert
            await expect(
              priceDiscoveryHandler.connect(buyer).commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.TOKEN_ID_MISMATCH);
          });

          it("price discovery does not send the voucher to the protocol", async function () {
            // Deploy bad price discovery contract
            const PriceDiscoveryFactory = await getContractFactory("PriceDiscoveryTransferElsewhere");
            const priceDiscoveryContract = await PriceDiscoveryFactory.deploy();
            await priceDiscoveryContract.waitForDeployment();
            await bosonVoucherClone
              .connect(assistant)
              .setApprovalForAll(await priceDiscoveryContract.getAddress(), true);

            // Prepare calldata for PriceDiscovery contract
            tokenId = deriveTokenId(offer.id, exchangeId);
            order.tokenId = tokenId;

            const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilBuyOrderElsewhere", [
              order,
            ]);
            const priceDiscoveryContractAddress = await priceDiscoveryContract.getAddress();
            priceDiscovery = new PriceDiscovery(
              price,
              Side.Ask,
              priceDiscoveryContractAddress,
              priceDiscoveryContractAddress,
              priceDiscoveryData
            );

            // Attempt to commit, expecting revert
            await expect(
              priceDiscoveryHandler.connect(buyer).commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.VOUCHER_NOT_RECEIVED);
          });

          it("price discovery address is not set", async function () {
            // An invalid price discovery address
            priceDiscovery.priceDiscoveryContract = ZeroAddress;

            // Attempt to commit, expecting revert
            await expect(
              priceDiscoveryHandler.connect(buyer).commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_PRICE_DISCOVERY);
          });

          it("price discovery data is empty", async function () {
            // An empty price discovery data
            priceDiscovery.priceDiscoveryData = "0x";

            // Attempt to commit, expecting revert
            await expect(
              priceDiscoveryHandler.connect(buyer).commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_PRICE_DISCOVERY);
          });

          it("conduit address is not set", async function () {
            // An invalid conduit address
            priceDiscovery.conduit = ZeroAddress;

            // Attempt to commit, expecting revert
            await expect(
              priceDiscoveryHandler.connect(buyer).commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_CONDUIT_ADDRESS);
          });

          it("Transferred voucher is part of a different offer", async function () {
            // create 2nd offer
            const newOffer = offer.clone();
            newOffer.id = "2";
            await offerHandler
              .connect(assistant)
              .createOffer(newOffer, offerDates, offerDurations, drParams, agentId, offerFeeLimit);
            await offerHandler
              .connect(assistant)
              .reserveRange(newOffer.id, newOffer.quantityAvailable, assistant.address);
            await bosonVoucher.connect(assistant).preMint(newOffer.id, newOffer.quantityAvailable);

            const newExchangeId = "12";
            const newTokenId = deriveTokenId(newOffer.id, newExchangeId);

            order.tokenId = newTokenId;
            const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilBuyOrder", [order]);
            const priceDiscoveryContractAddress = await priceDiscoveryContract.getAddress();

            priceDiscovery = new PriceDiscovery(
              price,
              Side.Ask,
              priceDiscoveryContractAddress,
              priceDiscoveryContractAddress,
              priceDiscoveryData
            );

            // Attempt to commit, expecting revert
            await expect(
              priceDiscoveryHandler.connect(buyer).commitToPriceDiscoveryOffer(buyer.address, offer.id, priceDiscovery)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.TOKEN_ID_MISMATCH);
          });
        });
      });

      context("Bid order", async function () {
        let order;
        beforeEach(async function () {
          // Price market
          price = 100n;

          // Prepare calldata for PriceDiscovery contract
          tokenId = deriveTokenId(offer.id, exchangeId);
          order = {
            seller: await priceDiscoveryHandler.getAddress(), // since protocol owns the voucher, it acts as seller from price discovery mechanism
            buyer: buyer.address,
            voucherContract: expectedCloneAddress,
            tokenId: tokenId,
            exchangeToken: await weth.getAddress(), // buyer pays in ETH, but they cannot approve ETH, so we use WETH
            price: price,
          };

          const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilSellOrder", [order]);
          const priceDiscoveryContractAddress = await priceDiscoveryContract.getAddress();

          priceDiscovery = new PriceDiscovery(
            price,
            Side.Bid,
            priceDiscoveryContractAddress,
            priceDiscoveryContractAddress,
            priceDiscoveryData
          );

          // Approve transfers
          // Buyer needs to approve price discovery to transfer the ETH
          await weth.connect(buyer).deposit({ value: price });
          await weth.connect(buyer).approve(await priceDiscoveryContract.getAddress(), price);

          // Seller approves protocol to transfer the voucher
          bosonVoucherClone = await getContractAt("IBosonVoucher", expectedCloneAddress);
          await bosonVoucherClone.connect(assistant).setApprovalForAll(await priceDiscoveryHandler.getAddress(), true);

          newBuyer = mockBuyer(buyer.address);
          exchange.buyerId = newBuyer.id;
        });

        it("should emit FundsDeposited, FundsEncumbered and BuyerCommitted events", async function () {
          // Commit to offer, retrieving the event
          const tx = await priceDiscoveryHandler
            .connect(assistant)
            .commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery);

          // Get the block timestamp of the confirmed tx
          block = await provider.getBlock(tx.blockNumber);

          // Update the committed date in the expected exchange struct with the block timestamp of the tx
          voucher.committedDate = block.timestamp.toString();
          voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

          // Test for events
          // Seller deposit
          await expect(tx)
            .to.emit(priceDiscoveryHandler, "FundsEncumbered")
            .withArgs(seller.id, ZeroAddress, offer.sellerDeposit, expectedCloneAddress);

          // Buyers funds - in bid order, they are taken directly from the buyer
          await expect(tx)
            .to.emit(priceDiscoveryHandler, "FundsDeposited")
            .withArgs(newBuyer.id, assistant.address, ZeroAddress, price);

          await expect(tx)
            .to.emit(priceDiscoveryHandler, "FundsEncumbered")
            .withArgs(newBuyer.id, ZeroAddress, price, assistant.address);

          await expect(tx)
            .to.emit(priceDiscoveryHandler, "BuyerCommitted")
            .withArgs(offerId, newBuyer.id, exchangeId, exchange.toStruct(), voucher.toStruct(), expectedCloneAddress);
        });

        it("should update state", async function () {
          // Escrow amount before
          const escrowBefore = await provider.getBalance(await exchangeHandler.getAddress());
          const buyerBefore = await weth.balanceOf(buyer.address);
          const { funds: sellerAvailableFundsBefore } = FundsList.fromStruct(
            await fundsHandler.getAvailableFunds(seller.id, [ZeroAddress])
          );

          // Commit to offer
          await priceDiscoveryHandler
            .connect(assistant)
            .commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery);

          // Get the exchange as a struct
          const [, exchangeStruct] = await exchangeHandler.connect(rando).getExchange(exchangeId);

          // Parse into entity
          let returnedExchange = Exchange.fromStruct(exchangeStruct);
          expect(returnedExchange.buyerId).to.equal(newBuyer.id);

          // Contract's balance should increase for the amount of the price
          const escrowAfter = await provider.getBalance(await exchangeHandler.getAddress());
          expect(escrowAfter).to.equal(escrowBefore + price);

          // Buyer's balance should decrease
          const buyerAfter = await weth.balanceOf(buyer.address);
          expect(buyerAfter).to.equal(buyerBefore - price);

          // Seller's available funds should decrease for the amount of the seller deposit
          const { funds: sellerAvailableFundsAfter } = FundsList.fromStruct(
            await fundsHandler.getAvailableFunds(seller.id, [ZeroAddress])
          );
          expect(BigInt(sellerAvailableFundsAfter[0].availableAmount)).to.equal(
            BigInt(sellerAvailableFundsBefore[0].availableAmount) - BigInt(offer.sellerDeposit)
          );
        });

        it("should transfer the voucher", async function () {
          // reseller is owner of voucher
          expect(await bosonVoucherClone.ownerOf(tokenId)).to.equal(assistant.address);

          // Commit to offer
          await priceDiscoveryHandler
            .connect(assistant)
            .commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery);

          // buyer2 is owner of voucher
          expect(await bosonVoucherClone.ownerOf(tokenId)).to.equal(buyer.address);
        });

        it("should not increment the next exchange id counter", async function () {
          const nextExchangeIdBefore = await exchangeHandler.connect(rando).getNextExchangeId();

          // Commit to offer, creating a new exchange
          await priceDiscoveryHandler
            .connect(assistant)
            .commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery);

          // Get the next exchange id and ensure it was incremented
          const nextExchangeIdAfter = await exchangeHandler.connect(rando).getNextExchangeId();
          expect(nextExchangeIdAfter).to.equal(nextExchangeIdBefore);
        });

        it("Should not decrement quantityAvailable", async function () {
          // Get quantityAvailable before
          const [, { quantityAvailable: quantityAvailableBefore }] = await offerHandler
            .connect(rando)
            .getOffer(offerId);

          // Commit to offer, creating a new exchange
          await priceDiscoveryHandler
            .connect(assistant)
            .commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery);

          // Get quantityAvailable after
          const [, { quantityAvailable: quantityAvailableAfter }] = await offerHandler.connect(rando).getOffer(offerId);

          expect(quantityAvailableAfter).to.equal(quantityAvailableBefore, "Quantity available should be the same");
        });

        it("It is possible to commit to price discovery offer if sequential commit region is paused", async function () {
          // Pause the sequential commit region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.SequentialCommit]);

          // Commit to offer
          await expect(
            priceDiscoveryHandler.connect(assistant).commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
          ).to.emit(priceDiscoveryHandler, "BuyerCommitted");
        });

        context("💔 Revert Reasons", async function () {
          it("The exchanges region of protocol is paused", async function () {
            // Pause the exchanges region of the protocol
            await pauseHandler.connect(pauser).pause([PausableRegion.Exchanges]);

            // Attempt to commit, expecting revert
            await expect(
              priceDiscoveryHandler
                .connect(assistant)
                .commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
            )
              .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
              .withArgs(PausableRegion.Exchanges);
          });

          it("The buyers region of protocol is paused", async function () {
            // Pause the buyers region of the protocol
            await pauseHandler.connect(pauser).pause([PausableRegion.Buyers]);

            // Attempt to commit, expecting revert
            await expect(
              priceDiscoveryHandler
                .connect(assistant)
                .commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
            )
              .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
              .withArgs(PausableRegion.Buyers);
          });

          it("The price discovery region of protocol is paused", async function () {
            // Pause the price discovery region of the protocol
            await pauseHandler.connect(pauser).pause([PausableRegion.PriceDiscovery]);

            // Attempt to sequentially commit, expecting revert
            await expect(
              priceDiscoveryHandler
                .connect(assistant)
                .commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
            )
              .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
              .withArgs(PausableRegion.PriceDiscovery);
          });

          it("buyer address is the zero address", async function () {
            // Attempt to commit, expecting revert
            await expect(
              priceDiscoveryHandler.connect(assistant).commitToPriceDiscoveryOffer(ZeroAddress, tokenId, priceDiscovery)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_ADDRESS);
          });

          it("offer id is invalid", async function () {
            // An invalid token id
            offerId = "666";
            tokenId = deriveTokenId(offerId, exchangeId);

            // Attempt to commit, expecting revert
            await expect(
              priceDiscoveryHandler
                .connect(assistant)
                .commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_OFFER);
          });

          it("token id is invalid", async function () {
            // An invalid token id
            exchangeId = "666";
            tokenId = deriveTokenId(offer.id, exchangeId);

            // Attempt to commit, expecting revert
            await expect(
              priceDiscoveryHandler
                .connect(assistant)
                .commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
            ).to.revertedWith(RevertReasons.ERC721_INVALID_TOKEN_ID);
          });

          it("offer is voided", async function () {
            // Void the offer first
            await offerHandler.connect(assistant).voidOffer(offerId);

            // Attempt to commit to the voided offer, expecting revert
            await expect(
              priceDiscoveryHandler
                .connect(assistant)
                .commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery, { value: price })
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_HAS_BEEN_VOIDED);
          });

          it("offer is not yet available for commits", async function () {
            // Create an offer with staring date in the future
            // get current block timestamp
            const block = await provider.getBlock("latest");

            // set validFrom date in the past
            offerDates.validFrom = (BigInt(block.timestamp) + oneMonth * 6n).toString(); // 6 months in the future
            offerDates.validUntil = BigInt(offerDates.validFrom + 10).toString(); // just after the valid from so it succeeds.

            offer.id = "2";
            exchangeId = await exchangeHandler.getNextExchangeId();
            let tokenId = deriveTokenId(offer.id, exchangeId);
            await offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, drParams, agentId, offerFeeLimit);
            await offerHandler.connect(assistant).reserveRange(offer.id, offer.quantityAvailable, assistant.address);
            await bosonVoucher.connect(assistant).preMint(offer.id, offer.quantityAvailable);

            // Attempt to commit to the not available offer, expecting revert
            order.tokenId = tokenId;
            const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilSellOrder", [order]);
            priceDiscovery.priceDiscoveryData = priceDiscoveryData;
            await expect(
              priceDiscoveryHandler
                .connect(assistant)
                .commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery, { value: price })
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_NOT_AVAILABLE);
          });

          it("offer has expired", async function () {
            // Go past offer expiration date
            await setNextBlockTimestamp(Number(offerDates.validUntil) + 1);

            // Attempt to commit to the expired offer, expecting revert
            await expect(
              priceDiscoveryHandler
                .connect(assistant)
                .commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery, { value: price })
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_HAS_EXPIRED);
          });

          it.skip("offer sold", async function () {
            // maybe for offers without explicit token id
          });

          it("protocol fees to high", async function () {
            // Set protocol fees to 95%
            await configHandler.setProtocolFeePercentage(9500);
            // Set royalty fees to 6%
            await offerHandler
              .connect(assistant)
              .updateOfferRoyaltyRecipients(offer.id, new RoyaltyInfo([ZeroAddress], [600]));

            // Attempt to commit, expecting revert
            await expect(
              priceDiscoveryHandler
                .connect(assistant)
                .commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.FEE_AMOUNT_TOO_HIGH);
          });

          it("voucher transfer not approved", async function () {
            // revoke approval
            await bosonVoucherClone
              .connect(assistant)
              .setApprovalForAll(await priceDiscoveryHandler.getAddress(), false);

            // Attempt to commit to, expecting revert
            await expect(
              priceDiscoveryHandler
                .connect(assistant)
                .commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
            ).to.revertedWith(RevertReasons.ERC721_CALLER_NOT_OWNER_OR_APPROVED);
          });

          it("price discovery sends less than expected", async function () {
            // Set higher price in price discovery
            priceDiscovery.price = BigInt(priceDiscovery.price) + 1n;

            // Attempt to commit to, expecting revert
            await expect(
              priceDiscoveryHandler
                .connect(assistant)
                .commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INSUFFICIENT_VALUE_RECEIVED);
          });

          it("Only seller can call, if side is bid", async function () {
            // Commit to offer, retrieving the event
            await expect(
              priceDiscoveryHandler.connect(rando).commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_VOUCHER_HOLDER);
          });

          it("price discovery address is not set", async function () {
            // An invalid price discovery address
            priceDiscovery.priceDiscoveryContract = ZeroAddress;

            // Attempt to commit, expecting revert
            await expect(
              priceDiscoveryHandler
                .connect(assistant)
                .commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_PRICE_DISCOVERY);
          });

          it("price discovery data is empty", async function () {
            // An empty price discovery data
            priceDiscovery.priceDiscoveryData = "0x";

            // Attempt to commit, expecting revert
            await expect(
              priceDiscoveryHandler
                .connect(assistant)
                .commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_PRICE_DISCOVERY);
          });

          it("conduit address is not set", async function () {
            // An invalid conduit address
            priceDiscovery.conduit = ZeroAddress;

            // Attempt to commit, expecting revert
            await expect(
              priceDiscoveryHandler
                .connect(assistant)
                .commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_CONDUIT_ADDRESS);
          });
        });
      });

      context("Wrapped voucher", async function () {
        const MASK = (1n << 128n) - 1n;
        context("Mock auction", async function () {
          let tokenId, mockAuction, amount, auctionId;

          beforeEach(async function () {
            // 1. Deploy Mock Auction
            const MockAuctionFactory = await getContractFactory("MockAuction");
            mockAuction = await MockAuctionFactory.deploy(await weth.getAddress());

            tokenId = deriveTokenId(offer.id, 2);
          });

          it("Transfer can't happens outside protocol", async function () {
            // 2. Set approval for all
            await bosonVoucher.connect(assistant).setApprovalForAll(await mockAuction.getAddress(), true);

            // 3. Create an auction
            const tokenContract = await bosonVoucher.getAddress();
            const auctionCurrency = offer.exchangeToken;
            const curator = ZeroAddress;

            await mockAuction.connect(assistant).createAuction(tokenId, tokenContract, auctionCurrency, curator);

            // 4. Bid
            auctionId = 0;
            amount = 10;
            await mockAuction.connect(buyer).createBid(auctionId, amount, { value: amount });

            // Set time forward
            await getCurrentBlockAndSetTimeForward(oneWeek);

            // Zora should be the owner of the token
            expect(await bosonVoucher.ownerOf(tokenId)).to.equal(await mockAuction.getAddress());

            // safe transfer from will fail on onPremintedTransferredHook and transaction should fail
            await expect(mockAuction.connect(rando).endAuction(auctionId)).to.be.revertedWithCustomError(
              bosonErrors,
              RevertReasons.VOUCHER_TRANSFER_NOT_ALLOWED
            );

            // Exchange doesn't exist
            const exchangeId = tokenId & MASK;
            const [exist, ,] = await exchangeHandler.getExchange(exchangeId);

            expect(exist).to.equal(false);
          });

          context("Works with Zora auction wrapper", async function () {
            let wrappedBosonVoucher;

            beforeEach(async function () {
              // 2. Create wrapped voucher
              const wrappedBosonVoucherFactory = await ethers.getContractFactory("ZoraWrapper");
              wrappedBosonVoucher = await wrappedBosonVoucherFactory
                .connect(assistant)
                .deploy(
                  await bosonVoucher.getAddress(),
                  await mockAuction.getAddress(),
                  await exchangeHandler.getAddress(),
                  await weth.getAddress(),
                  await bpd.getAddress()
                );

              // 3. Wrap voucher
              await bosonVoucher.connect(assistant).setApprovalForAll(await wrappedBosonVoucher.getAddress(), true);
              await wrappedBosonVoucher.connect(assistant).wrap(tokenId);

              // 4. Create an auction
              const tokenContract = await wrappedBosonVoucher.getAddress();
              const curator = assistant.address;
              const auctionCurrency = offer.exchangeToken;

              await mockAuction.connect(assistant).createAuction(tokenId, tokenContract, auctionCurrency, curator);

              auctionId = 0;
            });

            it("Auction ends normally", async function () {
              // 5. Bid
              const amount = 10;

              await mockAuction.connect(buyer).createBid(auctionId, amount, { value: amount });

              // 6. End auction
              await getCurrentBlockAndSetTimeForward(oneWeek);
              await mockAuction.connect(assistant).endAuction(auctionId);

              expect(await wrappedBosonVoucher.ownerOf(tokenId)).to.equal(buyer.address);
              expect(await weth.balanceOf(await wrappedBosonVoucher.getAddress())).to.equal(amount);

              // 7. Commit to offer
              const calldata = wrappedBosonVoucher.interface.encodeFunctionData("unwrap", [tokenId]);
              const priceDiscovery = new PriceDiscovery(
                amount,
                Side.Wrapper,
                await wrappedBosonVoucher.getAddress(),
                await wrappedBosonVoucher.getAddress(),
                calldata
              );

              const protocolBalanceBefore = await provider.getBalance(await exchangeHandler.getAddress());

              const tx = await priceDiscoveryHandler
                .connect(assistant)
                .commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery);
              const { timestamp } = await provider.getBlock(tx.blockNumber);

              expect(await bosonVoucher.ownerOf(tokenId)).to.equal(buyer.address);
              expect(await provider.getBalance(await exchangeHandler.getAddress())).to.equal(
                protocolBalanceBefore + BigInt(amount)
              );

              const exchangeId = tokenId & MASK;
              const [, , voucher] = await exchangeHandler.getExchange(exchangeId);

              expect(voucher.committedDate).to.equal(timestamp);
            });

            it("Cancel auction", async function () {
              // 6. Cancel auction
              await mockAuction.connect(assistant).cancelAuction(auctionId);

              // 7. Unwrap token
              const protocolBalanceBefore = await provider.getBalance(await exchangeHandler.getAddress());
              await wrappedBosonVoucher.connect(assistant).unwrap(tokenId);

              expect(await bosonVoucher.ownerOf(tokenId)).to.equal(assistant.address);
              expect(await provider.getBalance(await exchangeHandler.getAddress())).to.equal(protocolBalanceBefore);

              const exchangeId = tokenId & MASK;
              const [exists, , voucher] = await exchangeHandler.getExchange(exchangeId);

              expect(exists).to.equal(false);
              expect(voucher.committedDate).to.equal(0);
            });

            it("Cancel auction and unwrap via commitToPriceDiscoveryOffer", async function () {
              // How sensible is this scenario? Should it be prevented?

              // 6. Cancel auction
              await mockAuction.connect(assistant).cancelAuction(auctionId);

              // 7. Unwrap token via commitToOffer
              const protocolBalanceBefore = await provider.getBalance(await exchangeHandler.getAddress());

              const calldata = wrappedBosonVoucher.interface.encodeFunctionData("unwrap", [tokenId]);
              const priceDiscovery = new PriceDiscovery(
                0,
                Side.Wrapper,
                await wrappedBosonVoucher.getAddress(),
                await wrappedBosonVoucher.getAddress(),
                calldata
              );
              const tx = await priceDiscoveryHandler
                .connect(assistant)
                .commitToPriceDiscoveryOffer(assistant.address, tokenId, priceDiscovery);
              const { timestamp } = await provider.getBlock(tx.blockNumber);

              expect(await bosonVoucher.ownerOf(tokenId)).to.equal(assistant.address);
              expect(await provider.getBalance(await exchangeHandler.getAddress())).to.equal(protocolBalanceBefore);

              const exchangeId = tokenId & MASK;
              const [exists, , voucher] = await exchangeHandler.getExchange(exchangeId);

              expect(exists).to.equal(true);
              expect(voucher.committedDate).to.equal(timestamp);
            });
          });

          context("💔 Revert Reasons", async function () {
            let price;
            let wrappedBosonVoucher;
            beforeEach(async function () {
              // Deploy wrapped voucher contract
              const wrappedBosonVoucherFactory = await ethers.getContractFactory("MockWrapper");
              wrappedBosonVoucher = await wrappedBosonVoucherFactory
                .connect(assistant)
                .deploy(
                  await bosonVoucher.getAddress(),
                  await mockAuction.getAddress(),
                  await exchangeHandler.getAddress(),
                  await weth.getAddress(),
                  await bpd.getAddress()
                );

              // Price discovery data
              price = 10n;
              const calldata = wrappedBosonVoucher.interface.encodeFunctionData("unwrap", [tokenId]);
              priceDiscovery = new PriceDiscovery(
                price,
                Side.Wrapper,
                await wrappedBosonVoucher.getAddress(),
                await wrappedBosonVoucher.getAddress(),
                calldata
              );
            });

            it("Committing with offer id", async function () {
              const tokenIdOrOfferId = offer.id;

              // Attempt to commit, expecting revert
              await expect(
                priceDiscoveryHandler
                  .connect(assistant)
                  .commitToPriceDiscoveryOffer(buyer.address, tokenIdOrOfferId, priceDiscovery)
              ).to.revertedWithCustomError(bosonErrors, RevertReasons.TOKEN_ID_MANDATORY);
            });

            it("Price discovery is not the owner", async function () {
              // Attempt to commit, expecting revert
              await expect(
                priceDiscoveryHandler
                  .connect(assistant)
                  .commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
              ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_VOUCHER_HOLDER);
            });

            context("Malfunctioning wrapper", async function () {
              beforeEach(async function () {
                // 3. Wrap voucher
                await bosonVoucher.connect(assistant).setApprovalForAll(await wrappedBosonVoucher.getAddress(), true);
                await wrappedBosonVoucher.connect(assistant).wrap(tokenId);

                // 4. Create an auction
                const tokenContract = await wrappedBosonVoucher.getAddress();
                const curator = assistant.address;
                const auctionCurrency = offer.exchangeToken;

                await mockAuction.connect(assistant).createAuction(tokenId, tokenContract, auctionCurrency, curator);

                auctionId = 0;

                await mockAuction.connect(buyer).createBid(auctionId, price, { value: price });

                // 6. End auction
                await getCurrentBlockAndSetTimeForward(oneWeek);
                await mockAuction.connect(assistant).endAuction(auctionId);

                expect(await wrappedBosonVoucher.ownerOf(tokenId)).to.equal(buyer.address);
                expect(await weth.balanceOf(await wrappedBosonVoucher.getAddress())).to.equal(price);
              });

              it("Wrapper sends some ether", async function () {
                // send some ether to wrapper
                await wrappedBosonVoucher.topUp({ value: parseUnits("1", "ether") });

                // Attempt to commit, expecting revert
                await expect(
                  priceDiscoveryHandler
                    .connect(assistant)
                    .commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
                ).to.revertedWithCustomError(bosonErrors, RevertReasons.NATIVE_NOT_ALLOWED);
              });

              it("Price mismatch", async function () {
                priceDiscovery.price += 10n;

                // Attempt to commit, expecting revert
                await expect(
                  priceDiscoveryHandler
                    .connect(assistant)
                    .commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
                ).to.revertedWithCustomError(bosonErrors, RevertReasons.PRICE_MISMATCH);
              });

              it("Negative price", async function () {
                // Deposit some weth to the protocol
                const wethAddress = await weth.getAddress();
                await weth.connect(assistant).deposit({ value: parseUnits("1", "ether") });
                await weth.connect(assistant).transfer(await bpd.getAddress(), parseUnits("1", "ether"));

                const calldata = weth.interface.encodeFunctionData("transfer", [
                  rando.address,
                  parseUnits("1", "ether"),
                ]);
                priceDiscovery = new PriceDiscovery(price, Side.Wrapper, wethAddress, wethAddress, calldata);

                // Transfer the voucher to weth to pass the "is owner" check
                // Use token that was not wrapped yet
                tokenId = deriveTokenId(offer.id, 3);
                await bosonVoucher.connect(assistant).transferFrom(assistant.address, wethAddress, tokenId);

                // Attempt to commit, expecting revert
                await expect(
                  priceDiscoveryHandler
                    .connect(assistant)
                    .commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
                ).to.revertedWithCustomError(bosonErrors, RevertReasons.NEGATIVE_PRICE_NOT_ALLOWED);
              });
            });
          });
        });
      });
    });

    context("👉 onERC721Received()", async function () {
      let priceDiscoveryContract, priceDiscovery;

      beforeEach(async function () {
        // Price
        price = 100n;

        // Approve transfers
        // Buyer does not approve, since its in ETH.
        // Seller approves price discovery to transfer the voucher
        bosonVoucherClone = await getContractAt("IBosonVoucher", expectedCloneAddress);
      });

      context("💔 Revert Reasons", async function () {
        it("Correct caller, wrong id", async function () {
          // Deploy Bad PriceDiscovery contract
          const PriceDiscoveryFactory = await getContractFactory("PriceDiscoveryModifyTokenId");
          priceDiscoveryContract = await PriceDiscoveryFactory.deploy();
          await priceDiscoveryContract.waitForDeployment();

          // Prepare calldata for PriceDiscovery contract
          tokenId = deriveTokenId(offer.id, exchangeId);
          let order = {
            seller: assistant.address,
            buyer: buyer.address,
            voucherContract: expectedCloneAddress,
            tokenId: tokenId,
            exchangeToken: await weth.getAddress(),
            price: price,
          };

          const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilBuyOrder", [order]);
          const priceDiscoveryContractAddress = await priceDiscoveryContract.getAddress();

          // Buyer needs to approve price discovery to transfer the ETH
          await weth.connect(buyer).deposit({ value: price });
          await weth.connect(buyer).approve(await priceDiscoveryHandler.getAddress(), price);

          // Seller approves price discovery to transfer the voucher
          await bosonVoucherClone.connect(assistant).setApprovalForAll(await priceDiscoveryContract.getAddress(), true);

          priceDiscovery = new PriceDiscovery(
            price,
            Side.Ask,
            priceDiscoveryContractAddress,
            priceDiscoveryContractAddress,
            priceDiscoveryData
          );

          // Attempt to commit, expecting revert
          await expect(
            priceDiscoveryHandler.connect(buyer).commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.TOKEN_ID_MISMATCH);
        });

        it("Correct token id, wrong caller", async function () {
          // Deploy mock erc721 contract
          const [foreign721] = await deployMockTokens(["Foreign721"]);

          // Deploy Bad PriceDiscovery contract
          const PriceDiscoveryFactory = await getContractFactory("PriceDiscoveryModifyVoucherContract");
          priceDiscoveryContract = await PriceDiscoveryFactory.deploy(await foreign721.getAddress());
          await priceDiscoveryContract.waitForDeployment();

          // Prepare calldata for PriceDiscovery contract
          tokenId = deriveTokenId(offer.id, exchangeId);
          let order = {
            seller: assistant.address,
            buyer: buyer.address,
            voucherContract: expectedCloneAddress,
            tokenId: tokenId,
            exchangeToken: await weth.getAddress(),
            price: price,
          };

          const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilBuyOrder", [order]);
          const priceDiscoveryContractAddress = await priceDiscoveryContract.getAddress();

          // Buyer needs to approve price discovery to transfer the ETH
          await weth.connect(buyer).deposit({ value: price });
          await weth.connect(buyer).approve(await priceDiscoveryHandler.getAddress(), price);

          // Seller approves price discovery to transfer the voucher
          await bosonVoucherClone.connect(assistant).setApprovalForAll(await priceDiscoveryContract.getAddress(), true);

          priceDiscovery = new PriceDiscovery(
            price,
            Side.Ask,
            priceDiscoveryContractAddress,
            priceDiscoveryContractAddress,
            priceDiscoveryData
          );

          // Attempt to commit, expecting revert
          await expect(
            priceDiscoveryHandler.connect(buyer).commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.UNEXPECTED_ERC721_RECEIVED);
        });
      });
    });

    context("👉 onPremintedVoucherTransferred()", async function () {
      context("💔 Revert Reasons", async function () {
        it("Only the initial owner can transfer the preminted voucher without starting the commit", async function () {
          const priceDiscoveryContractAddress = await priceDiscoveryContract.getAddress();

          // Transfer a preminted voucher to the price discovery contract
          // Make sure it does not trigger the commit
          const tokenId = deriveTokenId(offer.id, exchangeId);
          await expect(
            bosonVoucher.connect(assistant).transferFrom(assistant.address, priceDiscoveryContractAddress, tokenId)
          ).to.not.emit(priceDiscoveryHandler, "BuyerCommitted");

          // Call fulfilBuyOrder, which transfers the voucher to the buyer, expect revert
          const order = {
            seller: priceDiscoveryContractAddress,
            buyer: buyer.address,
            voucherContract: expectedCloneAddress,
            tokenId: tokenId,
            exchangeToken: offer.exchangeToken,
            price: "0",
          };

          await expect(priceDiscoveryContract.fulfilBuyOrder(order)).to.be.revertedWithCustomError(
            bosonErrors,
            RevertReasons.VOUCHER_TRANSFER_NOT_ALLOWED
          );
        });

        it("The preminted voucher cannot be transferred to EOA without starting the commit", async function () {
          // Transfer a preminted voucher to rando EOA and expect revert
          // Make sure it does not trigger the commit
          const tokenId = deriveTokenId(offer.id, exchangeId);
          await expect(
            bosonVoucher.connect(assistant).transferFrom(assistant.address, rando.address, tokenId)
          ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.VOUCHER_TRANSFER_NOT_ALLOWED);
        });
      });
    });
  });
});
