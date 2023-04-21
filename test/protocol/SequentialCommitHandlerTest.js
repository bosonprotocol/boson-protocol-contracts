const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");

const Exchange = require("../../scripts/domain/Exchange");
const Voucher = require("../../scripts/domain/Voucher");
const PriceDiscovery = require("../../scripts/domain/PriceDiscovery");
const Side = require("../../scripts/domain/Side");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
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
  calculateContractAddress,
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
  let deployer,
    pauser,
    assistant,
    admin,
    clerk,
    treasury,
    rando,
    buyer,
    buyer2,
    assistantDR,
    adminDR,
    clerkDR,
    treasuryDR;
  let erc165,
    accountHandler,
    exchangeHandler,
    offerHandler,
    fundsHandler,
    pauseHandler,
    configHandler,
    sequentialCommitHandler;
  let bosonVoucherClone;
  let buyerId, offerId, seller, disputeResolverId;
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

  before(async function () {
    accountId.next(true);

    // get interface Ids
    InterfaceIds = await getInterfaceIds();

    // Add WETH
    const wethFactory = await ethers.getContractFactory("WETH9");
    weth = await wethFactory.deploy();
    await weth.deployed();

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
      protocolConfig: [, , { percentage: protocolFeePercentage }],
      diamondAddress: protocolDiamondAddress,
    } = await setupTestEnvironment(contracts, { wethAddress: weth.address }));

    // make all account the same
    assistant = clerk = admin;
    assistantDR = clerkDR = adminDR;

    [deployer] = await ethers.getSigners();

    // Deploy PriceDiscovery contract
    const PriceDiscoveryFactory = await ethers.getContractFactory("PriceDiscovery");
    priceDiscoveryContract = await PriceDiscoveryFactory.deploy();
    await priceDiscoveryContract.deployed();

    // Get snapshot id
    snapshotId = await getSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();
  });

  // Interface support (ERC-156 provided by ProtocolDiamond, others by deployed facets)
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

  // All supported Sequential commit methods
  context("📋 Sequential Commit Methods", async function () {
    beforeEach(async function () {
      // Initial ids for all the things
      exchangeId = offerId = "1";
      agentId = "0"; // agent id is optional while creating an offer

      // Create a valid seller
      seller = mockSeller(assistant.address, admin.address, clerk.address, treasury.address);
      expect(seller.isValid()).is.true;

      // AuthToken
      emptyAuthToken = mockAuthToken();
      expect(emptyAuthToken.isValid()).is.true;

      // VoucherInitValues
      voucherInitValues = mockVoucherInitValues();
      expect(voucherInitValues.isValid()).is.true;

      await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);
      expectedCloneAddress = calculateContractAddress(accountHandler.address, "1");

      // Create a valid dispute resolver
      disputeResolver = mockDisputeResolver(
        assistantDR.address,
        adminDR.address,
        clerkDR.address,
        treasuryDR.address,
        true
      );
      expect(disputeResolver.isValid()).is.true;

      //Create DisputeResolverFee array so offer creation will succeed
      disputeResolverFees = [new DisputeResolverFee(ethers.constants.AddressZero, "Native", "0")];

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
      disputeResolverId = mo.disputeResolverId;

      offerDurations.voucherValid = (oneMonth * 12).toString();

      // Check if domains are valid
      expect(offer.isValid()).is.true;
      expect(offerDates.isValid()).is.true;
      expect(offerDurations.isValid()).is.true;

      // Create the offer
      await offerHandler.connect(assistant).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

      // Set used variables
      price = offer.price;
      voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
      voucherValid = offerDurations.voucherValid;
      sellerPool = ethers.utils.parseUnits("15", "ether").toString();

      // Required voucher constructor params
      voucher = mockVoucher();
      voucher.redeemedDate = "0";

      // Mock exchange
      exchange = mockExchange();

      buyerId = accountId.next().value;
      exchange.buyerId = buyerId;
      exchange.finalizedDate = "0";

      // Deposit seller funds so the commit will succeed
      await fundsHandler
        .connect(assistant)
        .depositFunds(seller.id, ethers.constants.AddressZero, sellerPool, { value: sellerPool });
    });

    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    context("👉 sequentialCommitToOffer()", async function () {
      let priceDiscovery, price2;
      let newBuyer;
      let reseller; // for clarity in tests

      // before(async function () {
      //   // Deploy PriceDiscovery contract
      //   const PriceDiscoveryFactory = await ethers.getContractFactory("PriceDiscovery");
      //   priceDiscoveryContract = await PriceDiscoveryFactory.deploy();
      //   await priceDiscoveryContract.deployed();
      // });

      beforeEach(async function () {
        // Commit to offer with first buyer
        tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

        // Get the block timestamp of the confirmed tx
        blockNumber = tx.blockNumber;
        block = await ethers.provider.getBlock(blockNumber);

        // Update the committed date in the expected exchange struct with the block timestamp of the tx
        voucher.committedDate = block.timestamp.toString();

        // Update the validUntilDate date in the expected exchange struct
        voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

        reseller = buyer;
      });

      context("Ask order", async function () {
        context("General actions", async function () {
          beforeEach(async function () {
            // Price on secondary market
            price2 = ethers.BigNumber.from(price).mul(11).div(10).toString(); // 10% above the original price

            // Prepare calldata for PriceDiscovery contract
            let order = {
              seller: buyer.address,
              buyer: buyer2.address,
              voucherContract: expectedCloneAddress,
              tokenId: deriveTokenId(offer.id, exchangeId),
              exchangeToken: offer.exchangeToken,
              price: price2,
            };

            const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilBuyOrder", [order]);

            priceDiscovery = new PriceDiscovery(price2, priceDiscoveryContract.address, priceDiscoveryData, Side.Ask);

            // Seller needs to deposit weth in order to fill the escrow at the last step
            // Price2 is theoretically the highest amount needed, in practice it will be less (around price2-price)
            await weth.connect(buyer).deposit({ value: price2 });
            await weth.connect(buyer).approve(protocolDiamondAddress, price2);

            // Approve transfers
            // Buyer does not approve, since its in ETH.
            // Seller approves price discovery to transfer the voucher
            bosonVoucherClone = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);
            await bosonVoucherClone.connect(buyer).setApprovalForAll(priceDiscoveryContract.address, true);

            mockBuyer(buyer.address); // call only to increment account id counter
            newBuyer = mockBuyer(buyer2.address);
            exchange.buyerId = newBuyer.id;
          });

          it("should emit a BuyerCommitted event", async function () {
            // Sequential commit to offer, retrieving the event
            await expect(
              sequentialCommitHandler
                .connect(buyer2)
                .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery, { value: price2 })
            )
              .to.emit(sequentialCommitHandler, "BuyerCommitted")
              .withArgs(offerId, newBuyer.id, exchangeId, exchange.toStruct(), voucher.toStruct(), buyer2.address);
          });

          it("should update state", async function () {
            // Escrow amount before
            const escrowBefore = await ethers.provider.getBalance(exchangeHandler.address);

            // Sequential commit to offer
            await sequentialCommitHandler
              .connect(buyer2)
              .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery, { value: price2 });

            // buyer2 is exchange.buyerId
            // Get the exchange as a struct
            const [, exchangeStruct] = await exchangeHandler.connect(rando).getExchange(exchangeId);

            // Parse into entity
            let returnedExchange = Exchange.fromStruct(exchangeStruct);
            expect(returnedExchange.buyerId).to.equal(newBuyer.id);

            // Contract's balance should increase for minimal escrow amount
            const escrowAfter = await ethers.provider.getBalance(exchangeHandler.address);
            expect(escrowAfter).to.equal(escrowBefore.add(price2).sub(price));
          });

          it("should transfer the voucher", async function () {
            // buyer is owner of voucher
            const tokenId = deriveTokenId(offer.id, exchangeId);
            expect(await bosonVoucherClone.connect(buyer).ownerOf(tokenId)).to.equal(buyer.address);

            // Sequential commit to offer
            await sequentialCommitHandler
              .connect(buyer2)
              .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery, { value: price2 });

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
              .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery, { value: price2 });

            // Voucher after
            [, , voucherStruct] = await exchangeHandler.connect(rando).getExchange(exchangeId);
            returnedVoucher = Voucher.fromStruct(voucherStruct);
            expect(returnedVoucher).to.deep.equal(voucher);
          });

          it("only new buyer can redeem voucher", async function () {
            // Sequential commit to offer, creating a new exchange
            await sequentialCommitHandler
              .connect(buyer2)
              .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery, { value: price2 });

            // Old buyer cannot redeem
            await expect(exchangeHandler.connect(buyer).redeemVoucher(exchangeId)).to.be.revertedWith(
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
              .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery, { value: price2 });

            // Old buyer cannot redeem
            await expect(exchangeHandler.connect(buyer).cancelVoucher(exchangeId)).to.be.revertedWith(
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
              .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery, { value: price2 });

            // Get the next exchange id and ensure it was incremented by the creation of the offer
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
              .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery, { value: price2 });

            // Get quantityAvailable after
            const [, { quantityAvailable: quantityAvailableAfter }] = await offerHandler
              .connect(rando)
              .getOffer(offerId);

            expect(quantityAvailableAfter).to.equal(quantityAvailableBefore, "Quantity available should be the same");
          });

          it("It is possible to commit on someone else's behalf", async function () {
            // Sequential commit to offer, retrieving the event
            await expect(
              sequentialCommitHandler
                .connect(rando)
                .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery, { value: price2 })
            )
              .to.emit(sequentialCommitHandler, "BuyerCommitted")
              .withArgs(offerId, newBuyer.id, exchangeId, exchange.toStruct(), voucher.toStruct(), rando.address);

            // buyer2 is owner of voucher, not rando
            const tokenId = deriveTokenId(offer.id, exchangeId);
            expect(await bosonVoucherClone.connect(buyer2).ownerOf(tokenId)).to.equal(buyer2.address);
          });

          it("It is possible to commit even if offer is voided", async function () {
            // Void the offer
            await offerHandler.connect(assistant).voidOffer(offerId);

            // Committing directly is not possible
            await expect(
              exchangeHandler.connect(buyer2).commitToOffer(buyer2.address, offerId, { value: price })
            ).to.revertedWith(RevertReasons.OFFER_HAS_BEEN_VOIDED);

            // Sequential commit to offer, retrieving the event
            await expect(
              sequentialCommitHandler
                .connect(buyer2)
                .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery, { value: price2 })
            )
              .to.emit(sequentialCommitHandler, "BuyerCommitted")
              .withArgs(offerId, newBuyer.id, exchangeId, exchange.toStruct(), voucher.toStruct(), buyer2.address);
          });

          it("It is possible to commit even if redemption period has not started yet", async function () {
            // Redemption not yet possible
            await expect(exchangeHandler.connect(buyer).redeemVoucher(exchangeId)).to.revertedWith(
              RevertReasons.VOUCHER_NOT_REDEEMABLE
            );

            // Sequential commit to offer, retrieving the event
            await expect(
              sequentialCommitHandler
                .connect(buyer2)
                .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery, { value: price2 })
            )
              .to.emit(sequentialCommitHandler, "BuyerCommitted")
              .withArgs(offerId, newBuyer.id, exchangeId, exchange.toStruct(), voucher.toStruct(), buyer2.address);
          });

          it("It is possible to commit even if offer has expired", async function () {
            // Advance time to after offer expiry
            await setNextBlockTimestamp(Number(offerDates.validUntil));

            // Committing directly is not possible
            await expect(
              exchangeHandler.connect(buyer2).commitToOffer(buyer2.address, offerId, { value: price })
            ).to.revertedWith(RevertReasons.OFFER_HAS_EXPIRED);

            // Sequential commit to offer, retrieving the event
            await expect(
              sequentialCommitHandler
                .connect(buyer2)
                .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery, { value: price2 })
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
            ).to.revertedWith(RevertReasons.OFFER_SOLD_OUT);

            // Sequential commit to offer, retrieving the event
            await expect(
              sequentialCommitHandler
                .connect(buyer2)
                .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery, { value: price2 })
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
                sequentialCommitHandler
                  .connect(buyer2)
                  .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery, { value: price2 })
              ).to.revertedWith(RevertReasons.REGION_PAUSED);
            });

            it("The buyers region of protocol is paused", async function () {
              // Pause the buyers region of the protocol
              await pauseHandler.connect(pauser).pause([PausableRegion.Buyers]);

              // Attempt to sequentially commit, expecting revert
              await expect(
                sequentialCommitHandler
                  .connect(buyer2)
                  .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery, { value: price2 })
              ).to.revertedWith(RevertReasons.REGION_PAUSED);
            });

            it("buyer address is the zero address", async function () {
              // Attempt to sequentially commit, expecting revert
              await expect(
                sequentialCommitHandler
                  .connect(buyer2)
                  .sequentialCommitToOffer(ethers.constants.AddressZero, exchangeId, priceDiscovery, { value: price2 })
              ).to.revertedWith(RevertReasons.INVALID_ADDRESS);
            });

            it("exchange id is invalid", async function () {
              // An invalid offer id
              exchangeId = "666";

              // Attempt to sequentially commit, expecting revert
              await expect(
                sequentialCommitHandler
                  .connect(buyer2)
                  .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery, { value: price2 })
              ).to.revertedWith(RevertReasons.NO_SUCH_EXCHANGE);
            });

            it("voucher not valid anymore", async function () {
              // Go past offer expiration date
              await setNextBlockTimestamp(Number(voucher.validUntilDate));

              // Attempt to sequentially commit to the expired voucher, expecting revert
              await expect(
                sequentialCommitHandler
                  .connect(buyer2)
                  .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery, { value: price2 })
              ).to.revertedWith(RevertReasons.VOUCHER_HAS_EXPIRED);
            });

            it("protocol fees to high", async function () {
              // Set protocol fees to 95%
              await configHandler.setProtocolFeePercentage(9500);
              // Set royalty fees to 6%
              await bosonVoucherClone.connect(assistant).setRoyaltyPercentage(600);

              // Attempt to sequentially commit, expecting revert
              await expect(
                sequentialCommitHandler
                  .connect(buyer2)
                  .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery, { value: price2 })
              ).to.revertedWith(RevertReasons.FEE_AMOUNT_TOO_HIGH);
            });

            it("insufficient values sent", async function () {
              // Attempt to sequentially commit, expecting revert
              await expect(
                sequentialCommitHandler
                  .connect(buyer2)
                  .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery, { value: price })
              ).to.revertedWith(RevertReasons.INSUFFICIENT_VALUE_RECEIVED);
            });

            it("price discovery does not send the voucher to the protocol", async function () {
              // Deploy bad price discovery contract
              const PriceDiscoveryFactory = await ethers.getContractFactory("PriceDiscoveryNoTransfer");
              const priceDiscoveryContract = await PriceDiscoveryFactory.deploy();
              await priceDiscoveryContract.deployed();

              // Prepare calldata for PriceDiscovery contract
              let order = {
                seller: buyer.address,
                buyer: buyer2.address,
                voucherContract: expectedCloneAddress,
                tokenId: deriveTokenId(offer.id, exchangeId),
                exchangeToken: offer.exchangeToken,
                price: price2,
              };

              const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilBuyOrder", [order]);

              priceDiscovery = new PriceDiscovery(price2, priceDiscoveryContract.address, priceDiscoveryData, Side.Ask);

              // Attempt to sequentially commit, expecting revert
              await expect(
                sequentialCommitHandler
                  .connect(buyer2)
                  .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery, { value: price2 })
              ).to.revertedWith(RevertReasons.VOUCHER_NOT_RECEIVED);
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
              ethers.provider.getBalance(exchangeHandler.address),
              ethers.provider.getBalance(buyer.address),
              weth.balanceOf(buyer.address),
              ethers.provider.getBalance(buyer2.address),
              ethers.provider.getBalance(treasury.address),
            ]);

            return { protocol, seller: seller.add(sellerWeth), newBuyer, originalSeller };
          }

          scenarios.forEach((scenario) => {
            context(scenario.case, async function () {
              beforeEach(async function () {
                // Price on secondary market
                price2 = ethers.BigNumber.from(price).mul(scenario.multiplier).div(10).toString();

                // Prepare calldata for PriceDiscovery contract
                let order = {
                  seller: buyer.address,
                  buyer: buyer2.address,
                  voucherContract: expectedCloneAddress,
                  tokenId: deriveTokenId(offer.id, exchangeId),
                  exchangeToken: offer.exchangeToken,
                  price: price2,
                };

                const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilBuyOrder", [
                  order,
                ]);

                priceDiscovery = new PriceDiscovery(
                  price2,
                  priceDiscoveryContract.address,
                  priceDiscoveryData,
                  Side.Ask
                );

                // Seller needs to deposit weth in order to fill the escrow at the last step
                // Price2 is theoretically the highest amount needed, in practice it will be less (around price2-price)
                await weth.connect(buyer).deposit({ value: price2 }); // you don't need to approve whole amount, just what goes in escrow
                await weth.connect(buyer).approve(protocolDiamondAddress, price2);

                // Approve transfers
                // Buyer does not approve, since its in ETH.
                // Seller approves price discovery to transfer the voucher
                bosonVoucherClone = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);
                await bosonVoucherClone.connect(buyer).setApprovalForAll(priceDiscoveryContract.address, true);

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
                  await bosonVoucherClone.connect(assistant).setRoyaltyPercentage(fee.royalties);

                  const balancesBefore = await getBalances();

                  // Sequential commit to offer
                  await sequentialCommitHandler
                    .connect(buyer2)
                    .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery, {
                      value: price2,
                      gasPrice: 0,
                    });

                  const balancesAfter = await getBalances();

                  // Expected changes
                  const expectedBuyerChange = price2;
                  const reducedSecondaryPrice = ethers.BigNumber.from(price2)
                    .mul(10000 - fee.protocol - fee.royalties)
                    .div(10000);
                  const expectedSellerChange = reducedSecondaryPrice.lte(price) ? reducedSecondaryPrice : price;
                  const expectedProtocolChange = ethers.BigNumber.from(price2).sub(expectedSellerChange);
                  const expectedOriginalSellerChange = 0;

                  // Contract's balance should increase for minimal escrow amount
                  expect(balancesAfter.protocol).to.equal(balancesBefore.protocol.add(expectedProtocolChange));
                  expect(balancesAfter.seller).to.equal(balancesBefore.seller.add(expectedSellerChange));
                  expect(balancesAfter.newBuyer).to.equal(balancesBefore.newBuyer.sub(expectedBuyerChange));
                  expect(balancesAfter.originalSeller).to.equal(
                    balancesBefore.originalSeller.add(expectedOriginalSellerChange)
                  );
                });

                it(`protocol fee: ${fee.protocol / 100}%; royalties: ${
                  fee.royalties / 100
                }% - overpaid`, async function () {
                  await configHandler.setProtocolFeePercentage(fee.protocol);
                  await bosonVoucherClone.connect(assistant).setRoyaltyPercentage(fee.royalties);

                  const balancesBefore = await getBalances();

                  // Sequential commit to offer. Buyer pays more than needed
                  priceDiscovery.price = ethers.BigNumber.from(price2).mul(3).toString();

                  await sequentialCommitHandler
                    .connect(buyer2)
                    .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery, {
                      value: priceDiscovery.price,
                      gasPrice: 0,
                    });

                  const balancesAfter = await getBalances();

                  // Expected changes
                  const expectedBuyerChange = price2;
                  const reducedSecondaryPrice = ethers.BigNumber.from(price2)
                    .mul(10000 - fee.protocol - fee.royalties)
                    .div(10000);
                  const expectedSellerChange = reducedSecondaryPrice.lte(price) ? reducedSecondaryPrice : price;
                  const expectedProtocolChange = ethers.BigNumber.from(price2).sub(expectedSellerChange);
                  const expectedOriginalSellerChange = 0;

                  // Contract's balance should increase for minimal escrow amount
                  expect(balancesAfter.protocol).to.equal(balancesBefore.protocol.add(expectedProtocolChange));
                  expect(balancesAfter.seller).to.equal(balancesBefore.seller.add(expectedSellerChange));
                  expect(balancesAfter.newBuyer).to.equal(balancesBefore.newBuyer.sub(expectedBuyerChange));
                  expect(balancesAfter.originalSeller).to.equal(
                    balancesBefore.originalSeller.add(expectedOriginalSellerChange)
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
            price2 = ethers.BigNumber.from(price).mul(11).div(10).toString(); // 10% above the original price

            // Prepare calldata for PriceDiscovery contract
            let order = {
              seller: exchangeHandler.address, // since protocol owns the voucher, it acts as seller from price discovery mechanism
              buyer: buyer2.address,
              voucherContract: expectedCloneAddress,
              tokenId: deriveTokenId(offer.id, exchangeId),
              exchangeToken: weth.address, // buyer pays in ETH, but they cannot approve ETH, so we use WETH
              price: price2,
            };

            const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilSellOrder", [order]);

            priceDiscovery = new PriceDiscovery(price2, priceDiscoveryContract.address, priceDiscoveryData, Side.Bid);

            // Approve transfers
            // Buyer2 needs to approve price discovery to transfer the ETH
            await weth.connect(buyer2).deposit({ value: price2 });
            await weth.connect(buyer2).approve(priceDiscoveryContract.address, price2);

            // Seller approves protocol to transfer the voucher
            bosonVoucherClone = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);
            await bosonVoucherClone.connect(reseller).setApprovalForAll(exchangeHandler.address, true);

            mockBuyer(reseller.address); // call only to increment account id counter
            newBuyer = mockBuyer(buyer2.address);
            exchange.buyerId = newBuyer.id;
          });

          it("should emit a BuyerCommitted event", async function () {
            // Sequential commit to offer, retrieving the event
            await expect(
              sequentialCommitHandler
                .connect(reseller)
                .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery)
            )
              .to.emit(sequentialCommitHandler, "BuyerCommitted")
              .withArgs(offerId, newBuyer.id, exchangeId, exchange.toStruct(), voucher.toStruct(), reseller.address);
          });

          it("should update state", async function () {
            // Escrow amount before
            const escrowBefore = await ethers.provider.getBalance(exchangeHandler.address);

            // Sequential commit to offer
            await sequentialCommitHandler
              .connect(reseller)
              .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery);

            // buyer2 is exchange.buyerId
            // Get the exchange as a struct
            const [, exchangeStruct] = await exchangeHandler.connect(rando).getExchange(exchangeId);

            // Parse into entity
            let returnedExchange = Exchange.fromStruct(exchangeStruct);
            expect(returnedExchange.buyerId).to.equal(newBuyer.id);

            // Contract's balance should increase for minimal escrow amount
            const escrowAfter = await ethers.provider.getBalance(exchangeHandler.address);
            expect(escrowAfter).to.equal(escrowBefore.add(price2).sub(price));
          });

          it("should transfer the voucher", async function () {
            // reseller is owner of voucher
            const tokenId = deriveTokenId(offer.id, exchangeId);
            expect(await bosonVoucherClone.connect(reseller).ownerOf(tokenId)).to.equal(reseller.address);

            // Sequential commit to offer
            await sequentialCommitHandler
              .connect(reseller)
              .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery);

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
              .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery);

            // Voucher after
            [, , voucherStruct] = await exchangeHandler.connect(rando).getExchange(exchangeId);
            returnedVoucher = Voucher.fromStruct(voucherStruct);
            expect(returnedVoucher).to.deep.equal(voucher);
          });

          it("only new buyer can redeem voucher", async function () {
            // Sequential commit to offer, creating a new exchange
            await sequentialCommitHandler
              .connect(reseller)
              .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery);

            // Old buyer cannot redeem
            await expect(exchangeHandler.connect(buyer).redeemVoucher(exchangeId)).to.be.revertedWith(
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
              .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery);

            // Old buyer cannot redeem
            await expect(exchangeHandler.connect(buyer).cancelVoucher(exchangeId)).to.be.revertedWith(
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
              .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery);

            // Get the next exchange id and ensure it was incremented by the creation of the offer
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
              .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery);

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
            await expect(exchangeHandler.connect(buyer2).commitToOffer(buyer2.address, offerId)).to.revertedWith(
              RevertReasons.OFFER_HAS_BEEN_VOIDED
            );

            // Sequential commit to offer, retrieving the event
            await expect(
              sequentialCommitHandler
                .connect(reseller)
                .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery)
            )
              .to.emit(exchangeHandler, "BuyerCommitted")
              .withArgs(offerId, newBuyer.id, exchangeId, exchange.toStruct(), voucher.toStruct(), reseller.address);
          });

          it("It is possible to commit even if redemption period has not started yet", async function () {
            // Redemption not yet possible
            await expect(exchangeHandler.connect(buyer).redeemVoucher(exchangeId)).to.revertedWith(
              RevertReasons.VOUCHER_NOT_REDEEMABLE
            );

            // Sequential commit to offer, retrieving the event
            await expect(
              sequentialCommitHandler
                .connect(reseller)
                .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery)
            )
              .to.emit(sequentialCommitHandler, "BuyerCommitted")
              .withArgs(offerId, newBuyer.id, exchangeId, exchange.toStruct(), voucher.toStruct(), reseller.address);
          });

          it("It is possible to commit even if offer has expired", async function () {
            // Advance time to after offer expiry
            await setNextBlockTimestamp(Number(offerDates.validUntil));

            // Committing directly is not possible
            await expect(exchangeHandler.connect(buyer2).commitToOffer(buyer2.address, offerId)).to.revertedWith(
              RevertReasons.OFFER_HAS_EXPIRED
            );

            // Sequential commit to offer, retrieving the event
            await expect(
              sequentialCommitHandler
                .connect(reseller)
                .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery)
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
            ).to.revertedWith(RevertReasons.OFFER_SOLD_OUT);

            // Sequential commit to offer, retrieving the event
            await expect(
              sequentialCommitHandler
                .connect(reseller)
                .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery)
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
                  .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery)
              ).to.revertedWith(RevertReasons.REGION_PAUSED);
            });

            it("The buyers region of protocol is paused", async function () {
              // Pause the buyers region of the protocol
              await pauseHandler.connect(pauser).pause([PausableRegion.Buyers]);

              // Attempt to sequentially commit, expecting revert
              await expect(
                sequentialCommitHandler
                  .connect(reseller)
                  .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery)
              ).to.revertedWith(RevertReasons.REGION_PAUSED);
            });

            it("buyer address is the zero address", async function () {
              // Attempt to sequentially commit, expecting revert
              await expect(
                sequentialCommitHandler
                  .connect(reseller)
                  .sequentialCommitToOffer(ethers.constants.AddressZero, exchangeId, priceDiscovery)
              ).to.revertedWith(RevertReasons.INVALID_ADDRESS);
            });

            it("exchange id is invalid", async function () {
              // An invalid offer id
              exchangeId = "666";

              // Attempt to sequentially commit, expecting revert
              await expect(
                sequentialCommitHandler
                  .connect(reseller)
                  .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery)
              ).to.revertedWith(RevertReasons.NO_SUCH_EXCHANGE);
            });

            it("voucher not valid anymore", async function () {
              // Go past offer expiration date
              await setNextBlockTimestamp(Number(voucher.validUntilDate));

              // Attempt to sequentially commit to the expired voucher, expecting revert
              await expect(
                sequentialCommitHandler
                  .connect(reseller)
                  .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery)
              ).to.revertedWith(RevertReasons.VOUCHER_HAS_EXPIRED);
            });

            it("protocol fees to high", async function () {
              // Set protocol fees to 95%
              await configHandler.setProtocolFeePercentage(9500);
              // Set royalty fees to 6%
              await bosonVoucherClone.connect(assistant).setRoyaltyPercentage(600);

              // Attempt to sequentially commit, expecting revert
              await expect(
                sequentialCommitHandler
                  .connect(reseller)
                  .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery)
              ).to.revertedWith(RevertReasons.FEE_AMOUNT_TOO_HIGH);
            });

            it("voucher transfer not approved", async function () {
              // revoke approval
              await bosonVoucherClone.connect(reseller).setApprovalForAll(exchangeHandler.address, false);

              // Attempt to sequentially commit to, expecting revert
              await expect(
                sequentialCommitHandler
                  .connect(reseller)
                  .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery)
              ).to.revertedWith(RevertReasons.ERC721_CALLER_NOT_OWNER_OR_APPROVED);
            });

            it("price discovery sends less than expected", async function () {
              // Set higher price in price discovery
              priceDiscovery.price = ethers.BigNumber.from(priceDiscovery.price).add(1);

              // Attempt to sequentially commit to, expecting revert
              await expect(
                sequentialCommitHandler
                  .connect(reseller)
                  .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery)
              ).to.revertedWith(RevertReasons.INSUFFICIENT_VALUE_RECEIVED);
            });

            it("Only seller can call, if side is bid", async function () {
              // Sequential commit to offer, retrieving the event
              await expect(
                sequentialCommitHandler
                  .connect(rando)
                  .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery)
              ).to.revertedWith(RevertReasons.NOT_VOUCHER_HOLDER);
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
              ethers.provider.getBalance(exchangeHandler.address),
              ethers.provider.getBalance(reseller.address),
              weth.balanceOf(reseller.address),
              ethers.provider.getBalance(buyer2.address),
              weth.balanceOf(buyer2.address),
              ethers.provider.getBalance(treasury.address),
            ]);

            return { protocol, seller: seller.add(sellerWeth), newBuyer: newBuyer.add(newBuyerWeth), originalSeller };
          }

          scenarios.forEach((scenario) => {
            context(scenario.case, async function () {
              beforeEach(async function () {
                // Price on secondary market
                price2 = ethers.BigNumber.from(price).mul(scenario.multiplier).div(10).toString();

                // Prepare calldata for PriceDiscovery contract
                let order = {
                  seller: exchangeHandler.address, // since protocol owns the voucher, it acts as seller from price discovery mechanism
                  buyer: buyer2.address,
                  voucherContract: expectedCloneAddress,
                  tokenId: deriveTokenId(offer.id, exchangeId),
                  exchangeToken: weth.address, // buyer pays in ETH, but they cannot approve ETH, so we use WETH
                  price: price2,
                };

                const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilSellOrder", [
                  order,
                ]);

                priceDiscovery = new PriceDiscovery(
                  price2,
                  priceDiscoveryContract.address,
                  priceDiscoveryData,
                  Side.Bid
                );

                // Approve transfers
                // Buyer2 needs to approve price discovery to transfer the ETH
                await weth.connect(buyer2).deposit({ value: price2 });
                await weth.connect(buyer2).approve(priceDiscoveryContract.address, price2);

                // Seller approves protocol to transfer the voucher
                bosonVoucherClone = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);
                await bosonVoucherClone.connect(reseller).setApprovalForAll(exchangeHandler.address, true);

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
                  await bosonVoucherClone.connect(assistant).setRoyaltyPercentage(fee.royalties);

                  const balancesBefore = await getBalances();

                  // Sequential commit to offer
                  await sequentialCommitHandler
                    .connect(reseller)
                    .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery, {
                      gasPrice: 0,
                    });

                  const balancesAfter = await getBalances();

                  // Expected changes
                  const expectedBuyerChange = price2;
                  const reducedSecondaryPrice = ethers.BigNumber.from(price2)
                    .mul(10000 - fee.protocol - fee.royalties)
                    .div(10000);
                  const expectedSellerChange = reducedSecondaryPrice.lte(price) ? reducedSecondaryPrice : price;
                  const expectedProtocolChange = ethers.BigNumber.from(price2).sub(expectedSellerChange);
                  const expectedOriginalSellerChange = 0;

                  // Contract's balance should increase for minimal escrow amount
                  expect(balancesAfter.protocol).to.equal(balancesBefore.protocol.add(expectedProtocolChange));
                  expect(balancesAfter.seller).to.equal(balancesBefore.seller.add(expectedSellerChange));
                  expect(balancesAfter.newBuyer).to.equal(balancesBefore.newBuyer.sub(expectedBuyerChange));
                  expect(balancesAfter.originalSeller).to.equal(
                    balancesBefore.originalSeller.add(expectedOriginalSellerChange)
                  );
                });

                it(`protocol fee: ${fee.protocol / 100}%; royalties: ${
                  fee.royalties / 100
                }% - underpriced`, async function () {
                  await configHandler.setProtocolFeePercentage(fee.protocol);
                  await bosonVoucherClone.connect(assistant).setRoyaltyPercentage(fee.royalties);

                  const balancesBefore = await getBalances();

                  // Sequential commit to offer. Buyer pays more than needed
                  priceDiscovery.price = ethers.BigNumber.from(price2).div(2).toString();

                  await sequentialCommitHandler
                    .connect(reseller)
                    .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery, {
                      gasPrice: 0,
                    });

                  const balancesAfter = await getBalances();

                  // Expected changes
                  const expectedBuyerChange = price2;
                  const reducedSecondaryPrice = ethers.BigNumber.from(price2)
                    .mul(10000 - fee.protocol - fee.royalties)
                    .div(10000);
                  const expectedSellerChange = reducedSecondaryPrice.lte(price) ? reducedSecondaryPrice : price;
                  const expectedProtocolChange = ethers.BigNumber.from(price2).sub(expectedSellerChange);
                  const expectedOriginalSellerChange = 0;

                  // Contract's balance should increase for minimal escrow amount
                  expect(balancesAfter.protocol).to.equal(balancesBefore.protocol.add(expectedProtocolChange));
                  expect(balancesAfter.seller).to.equal(balancesBefore.seller.add(expectedSellerChange));
                  expect(balancesAfter.newBuyer).to.equal(balancesBefore.newBuyer.sub(expectedBuyerChange));
                  expect(balancesAfter.originalSeller).to.equal(
                    balancesBefore.originalSeller.add(expectedOriginalSellerChange)
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
        price2 = ethers.BigNumber.from(price).mul(11).div(10).toString(); // 10% above the original price

        // Seller needs to deposit weth in order to fill the escrow at the last step
        // Price2 is theoretically the highest amount needed, in practice it will be less (around price2-price)
        await weth.connect(buyer).deposit({ value: price2 });
        await weth.connect(buyer).approve(protocolDiamondAddress, price2);

        // Approve transfers
        // Buyer does not approve, since its in ETH.
        // Seller approves price discovery to transfer the voucher
        bosonVoucherClone = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);
      });

      it("should transfer the voucher during sequential commit", async function () {
        // Deploy PriceDiscovery contract
        const PriceDiscoveryFactory = await ethers.getContractFactory("PriceDiscovery");
        priceDiscoveryContract = await PriceDiscoveryFactory.deploy();
        await priceDiscoveryContract.deployed();

        // Prepare calldata for PriceDiscovery contract
        let order = {
          seller: reseller.address,
          buyer: buyer2.address,
          voucherContract: expectedCloneAddress,
          tokenId: deriveTokenId(offer.id, exchangeId),
          exchangeToken: offer.exchangeToken,
          price: price2,
        };

        const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilBuyOrder", [order]);

        // Seller approves price discovery to transfer the voucher
        await bosonVoucherClone.connect(reseller).setApprovalForAll(priceDiscoveryContract.address, true);

        priceDiscovery = new PriceDiscovery(price2, priceDiscoveryContract.address, priceDiscoveryData, Side.Ask);

        // buyer is owner of voucher
        const tokenId = deriveTokenId(offer.id, exchangeId);
        expect(await bosonVoucherClone.connect(buyer).ownerOf(tokenId)).to.equal(buyer.address);

        // Sequential commit to offer
        await sequentialCommitHandler
          .connect(buyer2)
          .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery, { value: price2 });

        // buyer2 is owner of voucher
        expect(await bosonVoucherClone.connect(buyer2).ownerOf(tokenId)).to.equal(buyer2.address);
      });

      context("💔 Revert Reasons", async function () {
        it("Correct caller, wrong id", async function () {
          // Commit to offer with first buyer once more (so they have two vouchers)
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

          // Deploy Bad PriceDiscovery contract
          const PriceDiscoveryFactory = await ethers.getContractFactory("PriceDiscoveryModifyTokenId");
          priceDiscoveryContract = await PriceDiscoveryFactory.deploy();
          await priceDiscoveryContract.deployed();

          // Prepare calldata for PriceDiscovery contract
          let order = {
            seller: reseller.address,
            buyer: buyer2.address,
            voucherContract: expectedCloneAddress,
            tokenId: deriveTokenId(offer.id, exchangeId),
            exchangeToken: offer.exchangeToken,
            price: price2,
          };

          const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilBuyOrder", [order]);

          // Seller approves price discovery to transfer the voucher
          await bosonVoucherClone.connect(reseller).setApprovalForAll(priceDiscoveryContract.address, true);

          priceDiscovery = new PriceDiscovery(price2, priceDiscoveryContract.address, priceDiscoveryData, Side.Ask);

          // Attempt to sequentially commit, expecting revert
          await expect(
            sequentialCommitHandler
              .connect(buyer2)
              .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery, { value: price2 })
          ).to.revertedWith(RevertReasons.UNEXPECTED_ERC721_RECEIVED);
        });

        it("Correct token id, wrong caller", async function () {
          // Deploy mock erc721 contract
          const [foreign721] = await deployMockTokens(["Foreign721"]);

          // Deploy Bad PriceDiscovery contract
          const PriceDiscoveryFactory = await ethers.getContractFactory("PriceDiscoveryModifyVoucherContract");
          priceDiscoveryContract = await PriceDiscoveryFactory.deploy(foreign721.address);
          await priceDiscoveryContract.deployed();

          // Prepare calldata for PriceDiscovery contract
          let order = {
            seller: reseller.address,
            buyer: buyer2.address,
            voucherContract: expectedCloneAddress,
            tokenId: deriveTokenId(offer.id, exchangeId),
            exchangeToken: offer.exchangeToken,
            price: price2,
          };

          const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilBuyOrder", [order]);

          // Seller approves price discovery to transfer the voucher
          await bosonVoucherClone.connect(reseller).setApprovalForAll(priceDiscoveryContract.address, true);

          priceDiscovery = new PriceDiscovery(price2, priceDiscoveryContract.address, priceDiscoveryData, Side.Ask);

          // Attempt to sequentially commit, expecting revert
          await expect(
            sequentialCommitHandler
              .connect(buyer2)
              .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery, { value: price2 })
          ).to.revertedWith(RevertReasons.UNEXPECTED_ERC721_RECEIVED);
        });

        it("Random erc721 transfer", async function () {
          // Deploy mock erc721 contract
          const [foreign721] = await deployMockTokens(["Foreign721"]);

          const tokenId = 123;
          await foreign721.mint(tokenId, 1);

          // Attempt to sequentially commit, expecting revert
          await expect(
            foreign721["safeTransferFrom(address,address,uint256)"](deployer.address, protocolDiamondAddress, tokenId)
          ).to.revertedWith(RevertReasons.UNEXPECTED_ERC721_RECEIVED);
        });
      });
    });
  });
});
