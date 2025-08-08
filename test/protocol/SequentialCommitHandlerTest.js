const { ethers } = require("hardhat");
const { ZeroAddress, getContractFactory, getSigners, parseUnits, provider, getContractAt, MaxUint256 } = ethers;
const { expect } = require("chai");

const Exchange = require("../../scripts/domain/Exchange");
const Voucher = require("../../scripts/domain/Voucher");
const PriceDiscovery = require("../../scripts/domain/PriceDiscovery");
const Side = require("../../scripts/domain/Side");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const { RoyaltyInfo } = require("../../scripts/domain/RoyaltyInfo.js");
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
} = require("../util/utils.js");
const { oneMonth } = require("../util/constants");

/**
 *  Test the Boson Sequential Commit Handler interface
 */
describe("IBosonSequentialCommitHandler", function () {
  // Common vars
  let InterfaceIds;
  let deployer, pauser, assistant, admin, treasury, rando, buyer, buyer2, assistantDR, adminDR, treasuryDR;
  let erc165,
    accountHandler,
    exchangeHandler,
    offerHandler,
    fundsHandler,
    pauseHandler,
    configHandler,
    sequentialCommitHandler;
  let bosonVoucherClone;
  let buyerId, offerId, seller, drParams;
  let block, blockNumber, tx;
  let support;
  let price, sellerPool;
  let voucherRedeemableFrom;
  let voucherValid;
  let protocolFeePercentage;
  let voucher;
  let exchange;
  let disputeResolver, disputeResolverFees;
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
      sequentialCommitHandler: "IBosonSequentialCommitHandler",
    };

    ({
      signers: [pauser, admin, treasury, buyer, buyer2, rando, adminDR, treasuryDR],
      contractInstances: {
        erc165,
        accountHandler,
        offerHandler,
        exchangeHandler,
        fundsHandler,
        configHandler,
        pauseHandler,
        sequentialCommitHandler,
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

    [deployer] = await getSigners();

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
      it("should indicate support for IBosonSequentialCommitHandler interface", async function () {
        // Current interfaceId for IBosonSequentialCommitHandler
        support = await erc165.supportsInterface(InterfaceIds.IBosonSequentialCommitHandler);

        // Test
        expect(support, "IBosonSequentialCommitHandler interface not supported").is.true;
      });
    });
  });

  context("📋 Constructor", async function () {
    it("Deployment fails if wrapped native address is 0", async function () {
      const sequentialCommitFactory = await getContractFactory("SequentialCommitHandlerFacet");

      await expect(sequentialCommitFactory.deploy(ZeroAddress)).to.revertedWithCustomError(
        bosonErrors,
        RevertReasons.INVALID_ADDRESS
      );
    });
  });

  // All supported Sequential commit methods
  context("📋 Sequential Commit Methods", async function () {
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
      disputeResolver = mockDisputeResolver(
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
      ({ offerDates, offerDurations } = mo);
      offer = mo.offer;
      offerFees = mo.offerFees;
      offerFees.protocolFee = applyPercentage(offer.price, protocolFeePercentage);

      offer.quantityAvailable = "10";
      drParams = mo.drParams;

      offerDurations.voucherValid = (oneMonth * 12n).toString();

      // Check if domains are valid
      expect(offer.isValid()).is.true;
      expect(offerDates.isValid()).is.true;
      expect(offerDurations.isValid()).is.true;

      // Create the offer
      await offerHandler
        .connect(assistant)
        .createOffer(offer, offerDates, offerDurations, drParams, agentId, offerFeeLimit);

      // Set used variables
      price = BigInt(offer.price);
      voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
      voucherValid = offerDurations.voucherValid;
      sellerPool = BigInt(offer.sellerDeposit) * BigInt(offer.quantityAvailable);

      // Required voucher constructor params
      voucher = mockVoucher();
      voucher.redeemedDate = "0";

      // Mock exchange
      exchange = mockExchange();

      buyerId = accountId.next().value;
      exchange.buyerId = buyerId;
      exchange.finalizedDate = "0";

      // Deposit seller funds so the commit will succeed
      await fundsHandler.connect(assistant).depositFunds(seller.id, ZeroAddress, sellerPool, { value: sellerPool });
    });

    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    context("👉 sequentialCommitToOffer()", async function () {
      let priceDiscovery, price2;
      let newBuyer;
      let reseller, resellerId; // for clarity in tests

      beforeEach(async function () {
        // Commit to offer with first buyer
        tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await provider.getBlock(blockNumber);

        // Update the committed date in the expected exchange struct with the block timestamp of the tx
        voucher.committedDate = block.timestamp.toString();

        // Update the validUntilDate date in the expected exchange struct
        voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

        reseller = buyer;
        resellerId = buyerId;
      });

      context("Ask order", async function () {
        context("General actions", async function () {
          beforeEach(async function () {
            // Price on secondary market
            price2 = (BigInt(price) * 11n) / 10n; // 10% above the original price
            tokenId = deriveTokenId(offer.id, exchangeId);

            // Prepare calldata for PriceDiscovery contract
            let order = {
              seller: buyer.address,
              buyer: buyer2.address,
              voucherContract: expectedCloneAddress,
              tokenId: tokenId,
              exchangeToken: await weth.getAddress(), // if offer is in ETH, exchangeToken is WETH
              price: price2,
            };

            const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilBuyOrder", [order]);
            const priceDiscoveryContractAddress = await priceDiscoveryContract.getAddress();

            priceDiscovery = new PriceDiscovery(
              price2,
              Side.Ask,
              priceDiscoveryContractAddress,
              priceDiscoveryContractAddress,
              priceDiscoveryData
            );

            // Seller needs to approve the protocol to fill the escrow at the last step
            await weth.connect(buyer).approve(protocolDiamondAddress, price2);

            // Approve transfers
            // Buyer needs to approve price protocol to transfer the ETH
            await weth.connect(buyer2).deposit({ value: price2 });
            await weth.connect(buyer2).approve(await sequentialCommitHandler.getAddress(), price2);

            // Seller approves price discovery to transfer the voucher
            bosonVoucherClone = await getContractAt("IBosonVoucher", expectedCloneAddress);
            await bosonVoucherClone.connect(buyer).setApprovalForAll(await priceDiscoveryContract.getAddress(), true);

            mockBuyer(buyer.address); // call only to increment account id counter
            newBuyer = mockBuyer(buyer2.address);
            exchange.buyerId = newBuyer.id;
          });

          it("should emit FundsEncumbered, FundsReleased, FundsWithdrawn and BuyerCommitted events", async function () {
            // Sequential commit to offer, retrieving the event
            const tx = await sequentialCommitHandler
              .connect(buyer2)
              .sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery);

            await expect(tx)
              .to.emit(sequentialCommitHandler, "FundsEncumbered")
              .withArgs(newBuyer.id, ZeroAddress, price2, buyer2.address);

            const immediatePayout = BigInt(price);
            await expect(tx)
              .to.emit(sequentialCommitHandler, "FundsReleased")
              .withArgs(exchangeId, buyerId, ZeroAddress, immediatePayout, buyer2.address);

            await expect(tx)
              .to.emit(sequentialCommitHandler, "FundsWithdrawn")
              .withArgs(resellerId, reseller.address, ZeroAddress, immediatePayout, buyer2.address);

            await expect(tx)
              .to.emit(sequentialCommitHandler, "BuyerCommitted")
              .withArgs(offerId, newBuyer.id, exchangeId, exchange.toStruct(), voucher.toStruct(), buyer2.address);
          });

          it("should update state", async function () {
            // Escrow amount before
            const escrowBefore = await provider.getBalance(await exchangeHandler.getAddress());

            // Sequential commit to offer
            await sequentialCommitHandler
              .connect(buyer2)
              .sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery);

            // buyer2 is exchange.buyerId
            // Get the exchange as a struct
            const [, exchangeStruct] = await exchangeHandler.connect(rando).getExchange(exchangeId);

            // Parse into entity
            let returnedExchange = Exchange.fromStruct(exchangeStruct);
            expect(returnedExchange.buyerId).to.equal(newBuyer.id);

            // Contract's balance should increase for minimal escrow amount
            const escrowAfter = await provider.getBalance(await exchangeHandler.getAddress());
            expect(escrowAfter).to.equal(escrowBefore + price2 - price);
          });

          it("should transfer the voucher", async function () {
            // buyer is owner of voucher
            const tokenId = deriveTokenId(offer.id, exchangeId);
            expect(await bosonVoucherClone.connect(buyer).ownerOf(tokenId)).to.equal(buyer.address);

            // Sequential commit to offer
            await sequentialCommitHandler
              .connect(buyer2)
              .sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery);

            // buyer2 is owner of voucher
            expect(await bosonVoucherClone.connect(buyer2).ownerOf(tokenId)).to.equal(buyer2.address);
          });

          it("voucher should remain unchanged", async function () {
            // Voucher before
            let [, , voucherStruct] = await exchangeHandler.connect(rando).getExchange(exchangeId);
            let returnedVoucher = Voucher.fromStruct(voucherStruct);
            expect(returnedVoucher).to.deep.equal(voucher);

            // Sequential commit to offer, creating a new exchange
            await sequentialCommitHandler
              .connect(buyer2)
              .sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery);

            // Voucher after
            [, , voucherStruct] = await exchangeHandler.connect(rando).getExchange(exchangeId);
            returnedVoucher = Voucher.fromStruct(voucherStruct);
            expect(returnedVoucher).to.deep.equal(voucher);
          });

          it("only new buyer can redeem voucher", async function () {
            // Sequential commit to offer, creating a new exchange
            await sequentialCommitHandler
              .connect(buyer2)
              .sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery);

            // Old buyer cannot redeem
            await expect(exchangeHandler.connect(buyer).redeemVoucher(exchangeId)).to.be.revertedWithCustomError(
              bosonErrors,
              RevertReasons.NOT_VOUCHER_HOLDER
            );

            // Redeem voucher, test for event
            await setNextBlockTimestamp(Number(voucherRedeemableFrom));
            expect(await exchangeHandler.connect(buyer2).redeemVoucher(exchangeId))
              .to.emit(exchangeHandler, "VoucherRedeemed")
              .withArgs(offerId, exchangeId, buyer2.address);
          });

          it("only new buyer can cancel voucher", async function () {
            // Sequential commit to offer, creating a new exchange
            await sequentialCommitHandler
              .connect(buyer2)
              .sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery);

            // Old buyer cannot redeem
            await expect(exchangeHandler.connect(buyer).cancelVoucher(exchangeId)).to.be.revertedWithCustomError(
              bosonErrors,
              RevertReasons.NOT_VOUCHER_HOLDER
            );

            // Redeem voucher, test for event
            await setNextBlockTimestamp(Number(voucherRedeemableFrom));
            expect(await exchangeHandler.connect(buyer2).cancelVoucher(exchangeId))
              .to.emit(exchangeHandler, "VoucherCanceled")
              .withArgs(offerId, exchangeId, buyer2.address);
          });

          it("should not increment the next exchange id counter", async function () {
            const nextExchangeIdBefore = await exchangeHandler.connect(rando).getNextExchangeId();

            // Sequential commit to offer, creating a new exchange
            await sequentialCommitHandler
              .connect(buyer2)
              .sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery);

            // Get the next exchange id and ensure it was incremented
            const nextExchangeIdAfter = await exchangeHandler.connect(rando).getNextExchangeId();
            expect(nextExchangeIdAfter).to.equal(nextExchangeIdBefore);
          });

          it("Should not decrement quantityAvailable", async function () {
            // Get quantityAvailable before
            const [, { quantityAvailable: quantityAvailableBefore }] = await offerHandler
              .connect(rando)
              .getOffer(offerId);

            // Sequential commit to offer, creating a new exchange
            await sequentialCommitHandler
              .connect(buyer2)
              .sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery);

            // Get quantityAvailable after
            const [, { quantityAvailable: quantityAvailableAfter }] = await offerHandler
              .connect(rando)
              .getOffer(offerId);

            expect(quantityAvailableAfter).to.equal(quantityAvailableBefore, "Quantity available should be the same");
          });

          it("It is possible to commit on someone else's behalf", async function () {
            // Buyer needs to approve the protocol to transfer the ETH
            await weth.connect(rando).deposit({ value: price2 });
            await weth.connect(rando).approve(await sequentialCommitHandler.getAddress(), price2);

            // Sequential commit to offer, retrieving the event
            await expect(
              sequentialCommitHandler.connect(rando).sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery)
            )
              .to.emit(sequentialCommitHandler, "BuyerCommitted")
              .withArgs(offerId, newBuyer.id, exchangeId, exchange.toStruct(), voucher.toStruct(), rando.address);

            // buyer2 is owner of voucher, not rando
            expect(await bosonVoucherClone.connect(buyer2).ownerOf(tokenId)).to.equal(buyer2.address);
          });

          it("It is possible to commit even if offer is voided", async function () {
            // Void the offer
            await offerHandler.connect(assistant).voidOffer(offerId);

            // Committing directly is not possible
            await expect(
              exchangeHandler.connect(buyer2).commitToOffer(buyer2.address, offerId, { value: price })
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_HAS_BEEN_VOIDED);

            // Sequential commit to offer, retrieving the event
            await expect(
              sequentialCommitHandler.connect(buyer2).sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery)
            )
              .to.emit(sequentialCommitHandler, "BuyerCommitted")
              .withArgs(offerId, newBuyer.id, exchangeId, exchange.toStruct(), voucher.toStruct(), buyer2.address);
          });

          it("It is possible to commit even if redemption period has not started yet", async function () {
            // Redemption not yet possible
            await expect(exchangeHandler.connect(buyer).redeemVoucher(exchangeId)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.VOUCHER_NOT_REDEEMABLE
            );

            // Sequential commit to offer, retrieving the event
            await expect(
              sequentialCommitHandler.connect(buyer2).sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery)
            )
              .to.emit(sequentialCommitHandler, "BuyerCommitted")
              .withArgs(offerId, newBuyer.id, exchangeId, exchange.toStruct(), voucher.toStruct(), buyer2.address);
          });

          it("It is possible to commit even if offer has expired", async function () {
            // Advance time to after offer expiry
            await setNextBlockTimestamp(Number(offerDates.validUntil) + 1);

            // Committing directly is not possible
            await expect(
              exchangeHandler.connect(buyer2).commitToOffer(buyer2.address, offerId, { value: price })
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_HAS_EXPIRED);

            // Sequential commit to offer, retrieving the event
            await expect(
              sequentialCommitHandler.connect(buyer2).sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery)
            )
              .to.emit(sequentialCommitHandler, "BuyerCommitted")
              .withArgs(offerId, newBuyer.id, exchangeId, exchange.toStruct(), voucher.toStruct(), buyer2.address);
          });

          it("It is possible to commit even if is sold out", async function () {
            // Commit to all remaining quantity
            for (let i = 1; i < offer.quantityAvailable; i++) {
              await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });
            }

            // Committing directly is not possible
            await expect(
              exchangeHandler.connect(buyer2).commitToOffer(buyer2.address, offerId, { value: price })
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_SOLD_OUT);

            // Sequential commit to offer, retrieving the event
            await expect(
              sequentialCommitHandler.connect(buyer2).sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery)
            )
              .to.emit(sequentialCommitHandler, "BuyerCommitted")
              .withArgs(offerId, newBuyer.id, exchangeId, exchange.toStruct(), voucher.toStruct(), buyer2.address);
          });

          context("💔 Revert Reasons", async function () {
            it("The exchanges region of protocol is paused", async function () {
              // Pause the exchanges region of the protocol
              await pauseHandler.connect(pauser).pause([PausableRegion.Exchanges]);

              // Attempt to sequentially commit, expecting revert
              await expect(
                sequentialCommitHandler.connect(buyer2).sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery)
              )
                .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
                .withArgs(PausableRegion.Exchanges);
            });

            it("The buyers region of protocol is paused", async function () {
              // Pause the buyers region of the protocol
              await pauseHandler.connect(pauser).pause([PausableRegion.Buyers]);

              // Attempt to sequentially commit, expecting revert
              await expect(
                sequentialCommitHandler.connect(buyer2).sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery)
              )
                .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
                .withArgs(PausableRegion.Buyers);
            });

            it("The sequential region of protocol is paused", async function () {
              // Pause the sequential commit region of the protocol
              await pauseHandler.connect(pauser).pause([PausableRegion.SequentialCommit]);

              // Attempt to sequentially commit, expecting revert
              await expect(
                sequentialCommitHandler.connect(buyer2).sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery)
              )
                .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
                .withArgs(PausableRegion.SequentialCommit);
            });

            it("The price discovery region of protocol is paused", async function () {
              // Pause the price discovery region of the protocol
              await pauseHandler.connect(pauser).pause([PausableRegion.PriceDiscovery]);

              // Attempt to sequentially commit, expecting revert
              await expect(
                sequentialCommitHandler.connect(buyer2).sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery)
              )
                .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
                .withArgs(PausableRegion.PriceDiscovery);
            });

            it("buyer address is the zero address", async function () {
              // Attempt to sequentially commit, expecting revert
              await expect(
                sequentialCommitHandler.connect(buyer2).sequentialCommitToOffer(ZeroAddress, exchangeId, priceDiscovery)
              ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_ADDRESS);
            });

            it("exchange id is invalid", async function () {
              // An invalid exchange id
              exchangeId = "666";
              tokenId = deriveTokenId(offer.id, exchangeId);

              // Attempt to sequentially commit, expecting revert
              await expect(
                sequentialCommitHandler.connect(buyer2).sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery)
              ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_EXCHANGE);
            });

            it("voucher not valid anymore", async function () {
              // Go past offer expiration date
              await setNextBlockTimestamp(Number(voucher.validUntilDate) + 1);

              // Attempt to sequentially commit to the expired voucher, expecting revert
              await expect(
                sequentialCommitHandler.connect(buyer2).sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery)
              ).to.revertedWithCustomError(bosonErrors, RevertReasons.VOUCHER_HAS_EXPIRED);
            });

            it("protocol fees to high", async function () {
              // Set protocol fees to 95%
              await configHandler.setProtocolFeePercentage(9500);
              // Set royalty fees to 6%
              await offerHandler
                .connect(assistant)
                .updateOfferRoyaltyRecipients(offer.id, new RoyaltyInfo([ZeroAddress], [600]));

              // Attempt to sequentially commit, expecting revert
              await expect(
                sequentialCommitHandler.connect(buyer2).sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery)
              ).to.revertedWithCustomError(bosonErrors, RevertReasons.FEE_AMOUNT_TOO_HIGH);
            });

            it("price cannot cover the cancellation fee", async function () {
              price2 = BigInt(offer.buyerCancelPenalty) - 1n;
              priceDiscovery.price = price2;

              // Prepare calldata for PriceDiscovery contract
              const order = {
                seller: buyer.address,
                buyer: buyer2.address,
                voucherContract: expectedCloneAddress,
                tokenId: tokenId,
                exchangeToken: await weth.getAddress(),
                price: price2,
              };

              const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilBuyOrder", [order]);
              priceDiscovery.priceDiscoveryData = priceDiscoveryData;

              // Attempt to sequentially commit, expecting revert
              await expect(
                sequentialCommitHandler.connect(buyer2).sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery)
              ).to.revertedWithCustomError(bosonErrors, RevertReasons.PRICE_DOES_NOT_COVER_PENALTY);
            });

            it("insufficient values sent", async function () {
              await weth.connect(buyer2).approve(await sequentialCommitHandler.getAddress(), price);

              // Attempt to sequentially commit, expecting revert
              await expect(
                sequentialCommitHandler.connect(buyer2).sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery)
              ).to.revertedWith(RevertReasons.SAFE_ERC20_LOW_LEVEL_CALL);
            });

            it("price discovery does not send the voucher anywhere", async function () {
              // Deploy bad price discovery contract
              const PriceDiscoveryFactory = await getContractFactory("PriceDiscoveryNoTransfer");
              const priceDiscoveryContract = await PriceDiscoveryFactory.deploy();
              await priceDiscoveryContract.waitForDeployment();

              // Prepare calldata for PriceDiscovery contract
              tokenId = deriveTokenId(offer.id, exchangeId);
              let order = {
                seller: buyer.address,
                buyer: buyer2.address,
                voucherContract: expectedCloneAddress,
                tokenId: tokenId,
                exchangeToken: offer.exchangeToken,
                price: price2,
              };

              const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilBuyOrder", [order]);
              const priceDiscoveryContractAddress = await priceDiscoveryContract.getAddress();
              priceDiscovery = new PriceDiscovery(
                price2,
                Side.Ask,
                priceDiscoveryContractAddress,
                priceDiscoveryContractAddress,
                priceDiscoveryData
              );

              // Attempt to sequentially commit, expecting revert
              await expect(
                sequentialCommitHandler.connect(buyer2).sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery)
              ).to.revertedWithCustomError(bosonErrors, RevertReasons.TOKEN_ID_MISMATCH);
            });

            it("price discovery does not send the voucher to the protocol", async function () {
              // Deploy bad price discovery contract
              const PriceDiscoveryFactory = await getContractFactory("PriceDiscoveryTransferElsewhere");
              const priceDiscoveryContract = await PriceDiscoveryFactory.deploy();
              await priceDiscoveryContract.waitForDeployment();
              await bosonVoucherClone.connect(buyer).setApprovalForAll(await priceDiscoveryContract.getAddress(), true);

              // Prepare calldata for PriceDiscovery contract
              tokenId = deriveTokenId(offer.id, exchangeId);
              let order = {
                seller: buyer.address,
                buyer: buyer2.address,
                voucherContract: expectedCloneAddress,
                tokenId: tokenId,
                exchangeToken: await weth.getAddress(),
                price: price2,
              };

              const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData(
                "fulfilBuyOrderElsewhere",
                [order]
              );
              const priceDiscoveryContractAddress = await priceDiscoveryContract.getAddress();
              priceDiscovery = new PriceDiscovery(
                price2,
                Side.Ask,
                priceDiscoveryContractAddress,
                priceDiscoveryContractAddress,
                priceDiscoveryData
              );

              // Attempt to sequentially commit, expecting revert
              await expect(
                sequentialCommitHandler.connect(buyer2).sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery)
              ).to.revertedWithCustomError(bosonErrors, RevertReasons.VOUCHER_NOT_RECEIVED);
            });

            context("Buyer rejects the voucher", async function () {
              beforeEach(async function () {
                await weth.connect(rando).deposit({ value: price2 });
                await weth.connect(rando).approve(await sequentialCommitHandler.getAddress(), price2);
              });

              it("Buyer contract does not implement the receiver", async function () {
                const [buyerContract] = await deployMockTokens(["Foreign20"]);

                // Sequential commit to offer, expect revert
                await expect(
                  sequentialCommitHandler
                    .connect(rando)
                    .sequentialCommitToOffer(await buyerContract.getAddress(), tokenId, priceDiscovery)
                ).to.revertedWith(RevertReasons.ERC721_NON_RECEIVER);
              });

              it("Buyer contract reverts with custom error", async function () {
                const buyerContractFactory = await getContractFactory("BuyerContract");
                const buyerContract = await buyerContractFactory.deploy();
                await buyerContract.waitForDeployment();

                await buyerContract.setFailType(1); // Type 1 = revert with own error

                // Sequential commit to offer, expect revert
                await expect(
                  sequentialCommitHandler
                    .connect(rando)
                    .sequentialCommitToOffer(await buyerContract.getAddress(), tokenId, priceDiscovery)
                ).to.revertedWith(RevertReasons.BUYER_CONTRACT_REVERT);
              });

              it("Buyer contract returns the wrong selector", async function () {
                const buyerContractFactory = await getContractFactory("BuyerContract");
                const buyerContract = await buyerContractFactory.deploy();
                await buyerContract.waitForDeployment();

                await buyerContract.setFailType(2); // Type 2 = wrong selector

                // Sequential commit to offer, expect revert
                await expect(
                  sequentialCommitHandler
                    .connect(rando)
                    .sequentialCommitToOffer(await buyerContract.getAddress(), tokenId, priceDiscovery)
                ).to.revertedWith(RevertReasons.ERC721_NON_RECEIVER);
              });
            });
          });
        });

        context("Escrow amount", async function () {
          let scenarios = [
            { case: "Increasing price", multiplier: 11 },
            { case: "Constant price", multiplier: 10 },
            { case: "Decreasing price", multiplier: 9 },
          ];

          async function getBalances() {
            const [protocol, seller, sellerWeth, newBuyer, originalSeller] = await Promise.all([
              provider.getBalance(await exchangeHandler.getAddress()),
              provider.getBalance(buyer.address),
              weth.balanceOf(buyer.address),
              weth.balanceOf(buyer2.address),
              provider.getBalance(treasury.address),
            ]);

            return { protocol, seller: seller + sellerWeth, newBuyer, originalSeller };
          }

          scenarios.forEach((scenario) => {
            context(scenario.case, async function () {
              beforeEach(async function () {
                // Price on secondary market
                price2 = (BigInt(price) * BigInt(scenario.multiplier)) / 10n;

                // Prepare calldata for PriceDiscovery contract
                tokenId = deriveTokenId(offer.id, exchangeId);
                let order = {
                  seller: buyer.address,
                  buyer: buyer2.address,
                  voucherContract: expectedCloneAddress,
                  tokenId: tokenId,
                  exchangeToken: await weth.getAddress(),
                  price: price2.toString(),
                };

                const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilBuyOrder", [
                  order,
                ]);
                const priceDiscoveryContractAddress = await priceDiscoveryContract.getAddress();
                priceDiscovery = new PriceDiscovery(
                  price2,
                  Side.Ask,
                  priceDiscoveryContractAddress,
                  priceDiscoveryContractAddress,
                  priceDiscoveryData
                );

                // Approve transfers
                // Seller needs to approve the protocol to fill the escrow at the last step
                await weth.connect(buyer).approve(protocolDiamondAddress, price2);

                // Buyer needs to approve price protocol to transfer the ETH
                await weth.connect(buyer2).deposit({ value: price2 });
                await weth.connect(buyer2).approve(await sequentialCommitHandler.getAddress(), price2);

                // Seller approves price discovery to transfer the voucher
                bosonVoucherClone = await getContractAt("IBosonVoucher", expectedCloneAddress);
                await bosonVoucherClone
                  .connect(buyer)
                  .setApprovalForAll(await priceDiscoveryContract.getAddress(), true);

                mockBuyer(buyer.address); // call only to increment account id counter
                newBuyer = mockBuyer(buyer2.address);
                exchange.buyerId = newBuyer.id;
              });

              const fees = [
                {
                  protocol: 0,
                  royalties: 0,
                },
                {
                  protocol: 500,
                  royalties: 0,
                },
                {
                  protocol: 0,
                  royalties: 600,
                },
                {
                  protocol: 300,
                  royalties: 400, // less than profit
                },
                {
                  protocol: 500,
                  royalties: 700, // more than profit
                },
              ];

              fees.forEach((fee) => {
                it(`protocol fee: ${fee.protocol / 100}%; royalties: ${fee.royalties / 100}%`, async function () {
                  await configHandler.setProtocolFeePercentage(fee.protocol);
                  await offerHandler
                    .connect(assistant)
                    .updateOfferRoyaltyRecipients(offer.id, new RoyaltyInfo([ZeroAddress], [fee.royalties]));

                  const balancesBefore = await getBalances();

                  // Sequential commit to offer
                  await sequentialCommitHandler
                    .connect(buyer2)
                    .sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery, {
                      gasPrice: 0,
                    });

                  const balancesAfter = await getBalances();

                  // Expected changes
                  const expectedBuyerChange = price2;
                  const reducedSecondaryPrice =
                    (BigInt(price2) * BigInt(10000 - fee.protocol - fee.royalties)) / 10000n;
                  const expectedSellerChange = reducedSecondaryPrice <= price ? reducedSecondaryPrice : price;
                  const expectedProtocolChange = price2 - expectedSellerChange;
                  const expectedOriginalSellerChange = 0n;

                  // Contract's balance should increase for minimal escrow amount
                  expect(balancesAfter.protocol).to.equal(balancesBefore.protocol + expectedProtocolChange);
                  expect(balancesAfter.seller).to.equal(balancesBefore.seller + expectedSellerChange);
                  expect(balancesAfter.newBuyer).to.equal(balancesBefore.newBuyer - expectedBuyerChange);
                  expect(balancesAfter.originalSeller).to.equal(
                    balancesBefore.originalSeller + expectedOriginalSellerChange
                  );
                });

                it(`protocol fee: ${fee.protocol / 100}%; royalties: ${
                  fee.royalties / 100
                }% - overpaid`, async function () {
                  await configHandler.setProtocolFeePercentage(fee.protocol);
                  await offerHandler
                    .connect(assistant)
                    .updateOfferRoyaltyRecipients(offer.id, new RoyaltyInfo([ZeroAddress], [fee.royalties]));

                  // Sequential commit to offer. Buyer pays more than needed
                  priceDiscovery.price = price2 * 3n;
                  await weth.connect(buyer2).deposit({ value: price2 * 2n });
                  await weth.connect(buyer2).approve(await sequentialCommitHandler.getAddress(), priceDiscovery.price);

                  const balancesBefore = await getBalances();

                  await sequentialCommitHandler
                    .connect(buyer2)
                    .sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery, {
                      gasPrice: 0,
                    });

                  const balancesAfter = await getBalances();

                  // Expected changes
                  const expectedBuyerChange = price2;
                  const reducedSecondaryPrice = (price2 * BigInt(10000 - fee.protocol - fee.royalties)) / 10000n;
                  const expectedSellerChange = reducedSecondaryPrice <= price ? reducedSecondaryPrice : price;
                  const expectedProtocolChange = price2 - expectedSellerChange;
                  const expectedOriginalSellerChange = 0n;

                  // Contract's balance should increase for minimal escrow amount
                  expect(balancesAfter.protocol).to.equal(balancesBefore.protocol + expectedProtocolChange);
                  expect(balancesAfter.seller).to.equal(balancesBefore.seller + expectedSellerChange);
                  expect(balancesAfter.newBuyer).to.equal(balancesBefore.newBuyer - expectedBuyerChange);
                  expect(balancesAfter.originalSeller).to.equal(
                    balancesBefore.originalSeller + expectedOriginalSellerChange
                  );
                });
              });
            });
          });
        });
      });

      context("Bid order", async function () {
        context("General actions", async function () {
          beforeEach(async function () {
            // Price on secondary market
            price2 = (price * 11n) / 10n; // 10% above the original price

            // Prepare calldata for PriceDiscovery contract
            tokenId = deriveTokenId(offer.id, exchangeId);
            let order = {
              seller: await exchangeHandler.getAddress(), // since protocol owns the voucher, it acts as seller from price discovery mechanism
              buyer: buyer2.address,
              voucherContract: expectedCloneAddress,
              tokenId: tokenId,
              exchangeToken: await weth.getAddress(), // buyer pays in ETH, but they cannot approve ETH, so we use WETH
              price: price2.toString(),
            };

            const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilSellOrder", [order]);
            const priceDiscoveryContractAddress = await priceDiscoveryContract.getAddress();

            priceDiscovery = new PriceDiscovery(
              price2,
              Side.Bid,
              priceDiscoveryContractAddress,
              priceDiscoveryContractAddress,
              priceDiscoveryData
            );

            // Approve transfers
            // Buyer2 needs to approve price discovery to transfer the ETH
            await weth.connect(buyer2).deposit({ value: price2 });
            await weth.connect(buyer2).approve(await priceDiscoveryContract.getAddress(), price2);

            // Seller approves protocol to transfer the voucher
            bosonVoucherClone = await getContractAt("IBosonVoucher", expectedCloneAddress);
            await bosonVoucherClone
              .connect(reseller)
              .setApprovalForAll(await sequentialCommitHandler.getAddress(), true);

            mockBuyer(reseller.address); // call only to increment account id counter
            newBuyer = mockBuyer(buyer2.address);
            exchange.buyerId = newBuyer.id;
          });

          it("should emit FundsEncumbered, FundsReleased, FundsWithdrawn and BuyerCommitted events", async function () {
            // Sequential commit to offer, retrieving the event
            const tx = sequentialCommitHandler
              .connect(reseller)
              .sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery);

            await expect(tx)
              .to.emit(sequentialCommitHandler, "FundsEncumbered")
              .withArgs(newBuyer.id, ZeroAddress, price2, reseller.address);

            const immediatePayout = BigInt(price);
            await expect(tx)
              .to.emit(sequentialCommitHandler, "FundsReleased")
              .withArgs(exchangeId, buyerId, ZeroAddress, immediatePayout, reseller.address);

            await expect(tx)
              .to.emit(sequentialCommitHandler, "FundsWithdrawn")
              .withArgs(resellerId, reseller.address, ZeroAddress, immediatePayout, reseller.address);

            await expect(tx)
              .to.emit(sequentialCommitHandler, "BuyerCommitted")
              .withArgs(offerId, newBuyer.id, exchangeId, exchange.toStruct(), voucher.toStruct(), reseller.address);
          });

          it("should update state", async function () {
            // Escrow amount before
            const escrowBefore = await provider.getBalance(await exchangeHandler.getAddress());

            // Sequential commit to offer
            await sequentialCommitHandler
              .connect(reseller)
              .sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery);

            // buyer2 is exchange.buyerId
            // Get the exchange as a struct
            const [, exchangeStruct] = await exchangeHandler.connect(rando).getExchange(exchangeId);

            // Parse into entity
            let returnedExchange = Exchange.fromStruct(exchangeStruct);
            expect(returnedExchange.buyerId).to.equal(newBuyer.id);

            // Contract's balance should increase for minimal escrow amount
            const escrowAfter = await provider.getBalance(await exchangeHandler.getAddress());
            expect(escrowAfter).to.equal(escrowBefore + price2 - price);
          });

          it("should transfer the voucher", async function () {
            // reseller is owner of voucher
            const tokenId = deriveTokenId(offer.id, exchangeId);
            expect(await bosonVoucherClone.connect(reseller).ownerOf(tokenId)).to.equal(reseller.address);

            // Sequential commit to offer
            await sequentialCommitHandler
              .connect(reseller)
              .sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery);

            // buyer2 is owner of voucher
            expect(await bosonVoucherClone.connect(buyer2).ownerOf(tokenId)).to.equal(buyer2.address);
          });

          it("voucher should remain unchanged", async function () {
            // Voucher before
            let [, , voucherStruct] = await exchangeHandler.connect(rando).getExchange(exchangeId);
            let returnedVoucher = Voucher.fromStruct(voucherStruct);
            expect(returnedVoucher).to.deep.equal(voucher);

            // Sequential commit to offer, creating a new exchange
            await sequentialCommitHandler
              .connect(reseller)
              .sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery);

            // Voucher after
            [, , voucherStruct] = await exchangeHandler.connect(rando).getExchange(exchangeId);
            returnedVoucher = Voucher.fromStruct(voucherStruct);
            expect(returnedVoucher).to.deep.equal(voucher);
          });

          it("only new buyer can redeem voucher", async function () {
            // Sequential commit to offer, creating a new exchange
            await sequentialCommitHandler
              .connect(reseller)
              .sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery);

            // Old buyer cannot redeem
            await expect(exchangeHandler.connect(buyer).redeemVoucher(exchangeId)).to.be.revertedWithCustomError(
              bosonErrors,
              RevertReasons.NOT_VOUCHER_HOLDER
            );

            // Redeem voucher, test for event
            await setNextBlockTimestamp(Number(voucherRedeemableFrom));
            expect(await exchangeHandler.connect(buyer2).redeemVoucher(exchangeId))
              .to.emit(exchangeHandler, "VoucherRedeemed")
              .withArgs(offerId, exchangeId, buyer2.address);
          });

          it("only new buyer can cancel voucher", async function () {
            // Sequential commit to offer, creating a new exchange
            await sequentialCommitHandler
              .connect(reseller)
              .sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery);

            // Old buyer cannot redeem
            await expect(exchangeHandler.connect(buyer).cancelVoucher(exchangeId)).to.be.revertedWithCustomError(
              bosonErrors,
              RevertReasons.NOT_VOUCHER_HOLDER
            );

            // Redeem voucher, test for event
            await setNextBlockTimestamp(Number(voucherRedeemableFrom));
            expect(await exchangeHandler.connect(buyer2).cancelVoucher(exchangeId))
              .to.emit(exchangeHandler, "VoucherCanceled")
              .withArgs(offerId, exchangeId, buyer2.address);
          });

          it("should not increment the next exchange id counter", async function () {
            const nextExchangeIdBefore = await exchangeHandler.connect(rando).getNextExchangeId();

            // Sequential commit to offer, creating a new exchange
            await sequentialCommitHandler
              .connect(reseller)
              .sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery);

            // Get the next exchange id and ensure it was incremented
            const nextExchangeIdAfter = await exchangeHandler.connect(rando).getNextExchangeId();
            expect(nextExchangeIdAfter).to.equal(nextExchangeIdBefore);
          });

          it("Should not decrement quantityAvailable", async function () {
            // Get quantityAvailable before
            const [, { quantityAvailable: quantityAvailableBefore }] = await offerHandler
              .connect(rando)
              .getOffer(offerId);

            // Sequential commit to offer, creating a new exchange
            await sequentialCommitHandler
              .connect(reseller)
              .sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery);

            // Get quantityAvailable after
            const [, { quantityAvailable: quantityAvailableAfter }] = await offerHandler
              .connect(rando)
              .getOffer(offerId);

            expect(quantityAvailableAfter).to.equal(quantityAvailableBefore, "Quantity available should be the same");
          });

          it("It is possible to commit even if offer is voided", async function () {
            // Void the offer
            await offerHandler.connect(assistant).voidOffer(offerId);

            // Committing directly is not possible
            await expect(
              exchangeHandler.connect(buyer2).commitToOffer(buyer2.address, offerId)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_HAS_BEEN_VOIDED);

            // Sequential commit to offer, retrieving the event
            await expect(
              sequentialCommitHandler.connect(reseller).sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery)
            )
              .to.emit(exchangeHandler, "BuyerCommitted")
              .withArgs(offerId, newBuyer.id, exchangeId, exchange.toStruct(), voucher.toStruct(), reseller.address);
          });

          it("It is possible to commit even if redemption period has not started yet", async function () {
            // Redemption not yet possible
            await expect(exchangeHandler.connect(buyer).redeemVoucher(exchangeId)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.VOUCHER_NOT_REDEEMABLE
            );

            // Sequential commit to offer, retrieving the event
            await expect(
              sequentialCommitHandler.connect(reseller).sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery)
            )
              .to.emit(sequentialCommitHandler, "BuyerCommitted")
              .withArgs(offerId, newBuyer.id, exchangeId, exchange.toStruct(), voucher.toStruct(), reseller.address);
          });

          it("It is possible to commit even if offer has expired", async function () {
            // Advance time to after offer expiry
            await setNextBlockTimestamp(Number(offerDates.validUntil) + 1);

            // Committing directly is not possible
            await expect(
              exchangeHandler.connect(buyer2).commitToOffer(buyer2.address, offerId)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_HAS_EXPIRED);

            // Sequential commit to offer, retrieving the event
            await expect(
              sequentialCommitHandler.connect(reseller).sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery)
            )
              .to.emit(sequentialCommitHandler, "BuyerCommitted")
              .withArgs(offerId, newBuyer.id, exchangeId, exchange.toStruct(), voucher.toStruct(), reseller.address);
          });

          it("It is possible to commit even if is sold out", async function () {
            // Commit to all remaining quantity
            for (let i = 1; i < offer.quantityAvailable; i++) {
              await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });
            }

            // Committing directly is not possible
            await expect(
              exchangeHandler.connect(buyer2).commitToOffer(buyer2.address, offerId, { value: price })
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_SOLD_OUT);

            // Sequential commit to offer, retrieving the event
            await expect(
              sequentialCommitHandler.connect(reseller).sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery)
            )
              .to.emit(sequentialCommitHandler, "BuyerCommitted")
              .withArgs(offerId, newBuyer.id, exchangeId, exchange.toStruct(), voucher.toStruct(), reseller.address);
          });

          context("💔 Revert Reasons", async function () {
            it("The exchanges region of protocol is paused", async function () {
              // Pause the exchanges region of the protocol
              await pauseHandler.connect(pauser).pause([PausableRegion.Exchanges]);

              // Attempt to sequentially commit, expecting revert
              await expect(
                sequentialCommitHandler
                  .connect(reseller)
                  .sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery)
              )
                .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
                .withArgs(PausableRegion.Exchanges);
            });

            it("The buyers region of protocol is paused", async function () {
              // Pause the buyers region of the protocol
              await pauseHandler.connect(pauser).pause([PausableRegion.Buyers]);

              // Attempt to sequentially commit, expecting revert
              await expect(
                sequentialCommitHandler
                  .connect(reseller)
                  .sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery)
              )
                .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
                .withArgs(PausableRegion.Buyers);
            });

            it("The sequential region of protocol is paused", async function () {
              // Pause the sequential commit region of the protocol
              await pauseHandler.connect(pauser).pause([PausableRegion.SequentialCommit]);

              // Attempt to sequentially commit, expecting revert
              await expect(
                sequentialCommitHandler
                  .connect(buyer2)
                  .sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery, { value: price2 })
              )
                .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
                .withArgs(PausableRegion.SequentialCommit);
            });

            it("The price discovery region of protocol is paused", async function () {
              // Pause the price discovery region of the protocol
              await pauseHandler.connect(pauser).pause([PausableRegion.PriceDiscovery]);

              // Attempt to sequentially commit, expecting revert
              await expect(
                sequentialCommitHandler
                  .connect(reseller)
                  .sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery)
              )
                .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
                .withArgs(PausableRegion.PriceDiscovery);
            });

            it("buyer address is the zero address", async function () {
              // Attempt to sequentially commit, expecting revert
              await expect(
                sequentialCommitHandler
                  .connect(reseller)
                  .sequentialCommitToOffer(ZeroAddress, exchangeId, priceDiscovery)
              ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_ADDRESS);
            });

            it("exchange id is invalid", async function () {
              // An invalid exchange id
              exchangeId = "666";
              tokenId = deriveTokenId(offer.id, exchangeId);

              // Attempt to sequentially commit, expecting revert
              await expect(
                sequentialCommitHandler
                  .connect(reseller)
                  .sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery)
              ).to.revertedWithCustomError(bosonErrors, RevertReasons.NO_SUCH_EXCHANGE);
            });

            it("voucher not valid anymore", async function () {
              // Go past offer expiration date
              await setNextBlockTimestamp(Number(voucher.validUntilDate) + 1);

              // Attempt to sequentially commit to the expired voucher, expecting revert
              await expect(
                sequentialCommitHandler
                  .connect(reseller)
                  .sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery)
              ).to.revertedWithCustomError(bosonErrors, RevertReasons.VOUCHER_HAS_EXPIRED);
            });

            it("protocol fees to high", async function () {
              // Set protocol fees to 95%
              await configHandler.setProtocolFeePercentage(9500);
              // Set royalty fees to 6%
              await offerHandler
                .connect(assistant)
                .updateOfferRoyaltyRecipients(offer.id, new RoyaltyInfo([ZeroAddress], ["600"]));

              // Attempt to sequentially commit, expecting revert
              await expect(
                sequentialCommitHandler
                  .connect(reseller)
                  .sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery)
              ).to.revertedWithCustomError(bosonErrors, RevertReasons.FEE_AMOUNT_TOO_HIGH);
            });

            it("price cannot cover the cancellation fee", async function () {
              price2 = BigInt(offer.buyerCancelPenalty) - 1n;
              priceDiscovery.price = price2;

              // Prepare calldata for PriceDiscovery contract
              const order = {
                seller: await exchangeHandler.getAddress(), // since protocol owns the voucher, it acts as seller from price discovery mechanism
                buyer: buyer2.address,
                voucherContract: expectedCloneAddress,
                tokenId: tokenId,
                exchangeToken: await weth.getAddress(), // buyer pays in ETH, but they cannot approve ETH, so we use WETH
                price: price2.toString(),
              };

              const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilSellOrder", [
                order,
              ]);
              priceDiscovery.priceDiscoveryData = priceDiscoveryData;

              // Attempt to sequentially commit, expecting revert
              await expect(
                sequentialCommitHandler
                  .connect(reseller)
                  .sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery, { value: price2 })
              ).to.revertedWithCustomError(bosonErrors, RevertReasons.PRICE_DOES_NOT_COVER_PENALTY);
            });

            it("voucher transfer not approved", async function () {
              // revoke approval
              await bosonVoucherClone
                .connect(reseller)
                .setApprovalForAll(await sequentialCommitHandler.getAddress(), false);

              // Attempt to sequentially commit to, expecting revert
              await expect(
                sequentialCommitHandler
                  .connect(reseller)
                  .sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery)
              ).to.revertedWith(RevertReasons.ERC721_CALLER_NOT_OWNER_OR_APPROVED);
            });

            it("price discovery sends less than expected", async function () {
              // Set higher price in price discovery
              priceDiscovery.price = BigInt(priceDiscovery.price) + 1n;

              // Attempt to sequentially commit to, expecting revert
              await expect(
                sequentialCommitHandler
                  .connect(reseller)
                  .sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery)
              ).to.revertedWithCustomError(bosonErrors, RevertReasons.INSUFFICIENT_VALUE_RECEIVED);
            });

            it("Only seller can call, if side is bid", async function () {
              // Sequential commit to offer, retrieving the event
              await expect(
                sequentialCommitHandler.connect(rando).sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery)
              ).to.revertedWithCustomError(bosonErrors, RevertReasons.NOT_VOUCHER_HOLDER);
            });
          });
        });

        context("Escrow amount", async function () {
          let scenarios = [
            { case: "Increasing price", multiplier: 11 },
            { case: "Constant price", multiplier: 10 },
            { case: "Decreasing price", multiplier: 9 },
          ];

          async function getBalances() {
            const [protocol, seller, sellerWeth, newBuyer, newBuyerWeth, originalSeller] = await Promise.all([
              provider.getBalance(await exchangeHandler.getAddress()),
              provider.getBalance(reseller.address),
              weth.balanceOf(reseller.address),
              provider.getBalance(buyer2.address),
              weth.balanceOf(buyer2.address),
              provider.getBalance(treasury.address),
            ]);

            return { protocol, seller: seller + sellerWeth, newBuyer: newBuyer + newBuyerWeth, originalSeller };
          }

          scenarios.forEach((scenario) => {
            context(scenario.case, async function () {
              beforeEach(async function () {
                // Price on secondary market
                price2 = (price * BigInt(scenario.multiplier)) / 10n;

                // Prepare calldata for PriceDiscovery contract
                tokenId = deriveTokenId(offer.id, exchangeId);
                let order = {
                  seller: await exchangeHandler.getAddress(), // since protocol owns the voucher, it acts as seller from price discovery mechanism
                  buyer: buyer2.address,
                  voucherContract: expectedCloneAddress,
                  tokenId: tokenId,
                  exchangeToken: await weth.getAddress(), // buyer pays in ETH, but they cannot approve ETH, so we use WETH
                  price: price2.toString(),
                };

                const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilSellOrder", [
                  order,
                ]);
                const priceDiscoveryContractAddress = await priceDiscoveryContract.getAddress();

                priceDiscovery = new PriceDiscovery(
                  price2,
                  Side.Bid,
                  priceDiscoveryContractAddress,
                  priceDiscoveryContractAddress,
                  priceDiscoveryData
                );

                // Approve transfers
                // Buyer2 needs to approve price discovery to transfer the ETH
                await weth.connect(buyer2).deposit({ value: price2 });
                await weth.connect(buyer2).approve(await priceDiscoveryContract.getAddress(), price2);

                // Seller approves protocol to transfer the voucher
                bosonVoucherClone = await getContractAt("IBosonVoucher", expectedCloneAddress);
                await bosonVoucherClone
                  .connect(reseller)
                  .setApprovalForAll(await sequentialCommitHandler.getAddress(), true);

                mockBuyer(buyer.address); // call only to increment account id counter
                newBuyer = mockBuyer(buyer2.address);
                exchange.buyerId = newBuyer.id;
              });

              const fees = [
                {
                  protocol: 0,
                  royalties: 0,
                },
                {
                  protocol: 500,
                  royalties: 0,
                },
                {
                  protocol: 0,
                  royalties: 600,
                },
                {
                  protocol: 300,
                  royalties: 400, // less than profit
                },
                {
                  protocol: 500,
                  royalties: 700, // more than profit
                },
              ];

              fees.forEach((fee) => {
                it(`protocol fee: ${fee.protocol / 100}%; royalties: ${fee.royalties / 100}%`, async function () {
                  await configHandler.setProtocolFeePercentage(fee.protocol);
                  await offerHandler
                    .connect(assistant)
                    .updateOfferRoyaltyRecipients(offer.id, new RoyaltyInfo([ZeroAddress], [fee.royalties]));

                  const balancesBefore = await getBalances();

                  // Sequential commit to offer
                  await sequentialCommitHandler
                    .connect(reseller)
                    .sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery, {
                      gasPrice: 0,
                    });

                  const balancesAfter = await getBalances();

                  // Expected changes
                  const expectedBuyerChange = price2;
                  const reducedSecondaryPrice = (price2 * BigInt(10000 - fee.protocol - fee.royalties)) / 10000n;
                  const expectedSellerChange = reducedSecondaryPrice <= price ? reducedSecondaryPrice : price;
                  const expectedProtocolChange = price2 - expectedSellerChange;
                  const expectedOriginalSellerChange = 0n;

                  // Contract's balance should increase for minimal escrow amount
                  expect(balancesAfter.protocol).to.equal(balancesBefore.protocol + expectedProtocolChange);
                  expect(balancesAfter.seller).to.equal(balancesBefore.seller + expectedSellerChange);
                  expect(balancesAfter.newBuyer).to.equal(balancesBefore.newBuyer - expectedBuyerChange);
                  expect(balancesAfter.originalSeller).to.equal(
                    balancesBefore.originalSeller + expectedOriginalSellerChange
                  );
                });

                it(`protocol fee: ${fee.protocol / 100}%; royalties: ${
                  fee.royalties / 100
                }% - underpriced`, async function () {
                  await configHandler.setProtocolFeePercentage(fee.protocol);
                  await offerHandler
                    .connect(assistant)
                    .updateOfferRoyaltyRecipients(offer.id, new RoyaltyInfo([ZeroAddress], [fee.royalties]));

                  const balancesBefore = await getBalances();

                  // Sequential commit to offer. Buyer pays more than needed
                  priceDiscovery.price = price2 / 2n;

                  await sequentialCommitHandler
                    .connect(reseller)
                    .sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery, {
                      gasPrice: 0,
                    });

                  const balancesAfter = await getBalances();

                  // Expected changes
                  const expectedBuyerChange = price2;
                  const reducedSecondaryPrice = (price2 * BigInt(10000 - fee.protocol - fee.royalties)) / 10000n;
                  const expectedSellerChange = reducedSecondaryPrice <= price ? reducedSecondaryPrice : price;
                  const expectedProtocolChange = price2 - expectedSellerChange;
                  const expectedOriginalSellerChange = 0n;

                  // Contract's balance should increase for minimal escrow amount
                  expect(balancesAfter.protocol).to.equal(balancesBefore.protocol + expectedProtocolChange);
                  expect(balancesAfter.seller).to.equal(balancesBefore.seller + expectedSellerChange);
                  expect(balancesAfter.newBuyer).to.equal(balancesBefore.newBuyer - expectedBuyerChange);
                  expect(balancesAfter.originalSeller).to.equal(
                    balancesBefore.originalSeller + expectedOriginalSellerChange
                  );
                });

                it(`protocol fee: ${fee.protocol / 100}%; royalties: ${
                  fee.royalties / 100
                }% - non zero msg.value`, async function () {
                  await configHandler.setProtocolFeePercentage(fee.protocol);
                  await offerHandler
                    .connect(assistant)
                    .updateOfferRoyaltyRecipients(offer.id, new RoyaltyInfo([ZeroAddress], [fee.royalties]));

                  const balancesBefore = await getBalances();

                  const sellerMsgValue = parseUnits("0.001", "ether");

                  // Sequential commit to offer
                  await sequentialCommitHandler
                    .connect(reseller)
                    .sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery, {
                      gasPrice: 0,
                      value: sellerMsgValue,
                    });

                  const balancesAfter = await getBalances();

                  // Expected changes
                  const expectedBuyerChange = price2;
                  const reducedSecondaryPrice = (price2 * BigInt(10000 - fee.protocol - fee.royalties)) / 10000n;
                  const expectedSellerChange = reducedSecondaryPrice <= price ? reducedSecondaryPrice : price;
                  const expectedProtocolChange = price2 - expectedSellerChange;
                  const expectedOriginalSellerChange = 0n;

                  // Contract's balance should increase for minimal escrow amount
                  expect(balancesAfter.protocol).to.equal(balancesBefore.protocol + expectedProtocolChange);
                  expect(balancesAfter.seller).to.equal(
                    balancesBefore.seller + expectedSellerChange - sellerMsgValue / 2n
                  ); // PriceDiscovery returns back half of the sent native value
                  expect(balancesAfter.newBuyer).to.equal(balancesBefore.newBuyer - expectedBuyerChange);
                  expect(balancesAfter.originalSeller).to.equal(
                    balancesBefore.originalSeller + expectedOriginalSellerChange
                  );
                });
              });
            });
          });
        });
      });
    });

    context("👉 onERC721Received()", async function () {
      let priceDiscoveryContract, priceDiscovery, price2;
      let reseller; // for clarity in tests

      beforeEach(async function () {
        // Commit to offer with first buyer
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

        reseller = buyer;

        // Price on secondary market
        price2 = (price * 11n) / 10n; // 10% above the original price

        // Approve transfers
        // Seller needs to approve the protocol to fill the escrow at the last step
        await weth.connect(buyer).approve(protocolDiamondAddress, price2);

        // Buyer needs to approve price protocol to transfer the ETH
        await weth.connect(buyer2).deposit({ value: price2 });
        await weth.connect(buyer2).approve(await sequentialCommitHandler.getAddress(), price2);

        // Seller approves price discovery to transfer the voucher
        bosonVoucherClone = await getContractAt("IBosonVoucher", expectedCloneAddress);
      });

      it("should transfer the voucher during sequential commit", async function () {
        // Deploy PriceDiscovery contract
        const PriceDiscoveryFactory = await getContractFactory("PriceDiscoveryMock");
        priceDiscoveryContract = await PriceDiscoveryFactory.deploy();
        await priceDiscoveryContract.waitForDeployment();

        // Prepare calldata for PriceDiscovery contract
        tokenId = deriveTokenId(offer.id, exchangeId);
        let order = {
          seller: reseller.address,
          buyer: buyer2.address,
          voucherContract: expectedCloneAddress,
          tokenId: tokenId,
          exchangeToken: await weth.getAddress(),
          price: price2,
        };

        const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilBuyOrder", [order]);
        const priceDiscoveryContractAddress = await priceDiscoveryContract.getAddress();

        // Seller approves price discovery to transfer the voucher
        await bosonVoucherClone.connect(reseller).setApprovalForAll(await priceDiscoveryContract.getAddress(), true);

        priceDiscovery = new PriceDiscovery(
          price2,
          Side.Ask,
          priceDiscoveryContractAddress,
          priceDiscoveryContractAddress,
          priceDiscoveryData
        );

        // buyer is owner of voucher
        expect(await bosonVoucherClone.connect(buyer).ownerOf(tokenId)).to.equal(buyer.address);

        // Sequential commit to offer
        await sequentialCommitHandler.connect(buyer2).sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery);

        // buyer2 is owner of voucher
        expect(await bosonVoucherClone.connect(buyer2).ownerOf(tokenId)).to.equal(buyer2.address);
      });

      context("💔 Revert Reasons", async function () {
        it("Correct caller, wrong id", async function () {
          // Commit to offer with first buyer once more (so they have two vouchers)
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

          // Deploy Bad PriceDiscovery contract
          const PriceDiscoveryFactory = await getContractFactory("PriceDiscoveryModifyTokenId");
          priceDiscoveryContract = await PriceDiscoveryFactory.deploy();
          await priceDiscoveryContract.waitForDeployment();

          // Prepare calldata for PriceDiscovery contract
          tokenId = deriveTokenId(offer.id, exchangeId);
          let order = {
            seller: reseller.address,
            buyer: buyer2.address,
            voucherContract: expectedCloneAddress,
            tokenId: tokenId,
            exchangeToken: await weth.getAddress(),
            price: price2,
          };

          const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilBuyOrder", [order]);
          const priceDiscoveryContractAddress = await priceDiscoveryContract.getAddress();

          // Seller approves price discovery to transfer the voucher
          await bosonVoucherClone.connect(reseller).setApprovalForAll(await priceDiscoveryContract.getAddress(), true);

          priceDiscovery = new PriceDiscovery(
            price2,
            Side.Ask,
            priceDiscoveryContractAddress,
            priceDiscoveryContractAddress,
            priceDiscoveryData
          );

          // Attempt to sequentially commit, expecting revert
          await expect(
            sequentialCommitHandler.connect(buyer2).sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery)
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
            seller: reseller.address,
            buyer: buyer2.address,
            voucherContract: expectedCloneAddress,
            tokenId: tokenId,
            exchangeToken: await weth.getAddress(),
            price: price2,
          };

          const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilBuyOrder", [order]);
          const priceDiscoveryContractAddress = await priceDiscoveryContract.getAddress();

          // Seller approves price discovery to transfer the voucher
          await bosonVoucherClone.connect(reseller).setApprovalForAll(await priceDiscoveryContract.getAddress(), true);

          priceDiscovery = new PriceDiscovery(
            price2,
            Side.Ask,
            priceDiscoveryContractAddress,
            priceDiscoveryContractAddress,
            priceDiscoveryData
          );

          // Attempt to sequentially commit, expecting revert
          await expect(
            sequentialCommitHandler.connect(buyer2).sequentialCommitToOffer(buyer2.address, tokenId, priceDiscovery)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.UNEXPECTED_ERC721_RECEIVED);
        });

        it("Random erc721 transfer", async function () {
          // Deploy mock erc721 contract
          const [foreign721] = await deployMockTokens(["Foreign721"]);

          const tokenId = 123;
          await foreign721.mint(tokenId, 1);

          // Attempt to sequentially commit, expecting revert
          await expect(
            foreign721["safeTransferFrom(address,address,uint256)"](deployer.address, await bpd.getAddress(), tokenId)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.UNEXPECTED_ERC721_RECEIVED);
        });
      });
    });
  });
});
