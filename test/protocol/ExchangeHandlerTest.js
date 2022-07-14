const { gasLimit } = require("../../environments");
const hre = require("hardhat");
const ethers = hre.ethers;
const { expect, assert } = require("chai");

const Role = require("../../scripts/domain/Role");
const Exchange = require("../../scripts/domain/Exchange");
const Voucher = require("../../scripts/domain/Voucher");
const Seller = require("../../scripts/domain/Seller");
const Buyer = require("../../scripts/domain/Buyer");
const TokenType = require("../../scripts/domain/TokenType");
const Bundle = require("../../scripts/domain/Bundle");
const ExchangeState = require("../../scripts/domain/ExchangeState");
const Group = require("../../scripts/domain/Group");
const Condition = require("../../scripts/domain/Condition");
const EvaluationMethod = require("../../scripts/domain/EvaluationMethod");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const { mockOffer, mockTwin, mockDisputeResolver } = require("../utils/mock");
const {
  getEvent,
  setNextBlockTimestamp,
  calculateVoucherExpiry,
  prepareDataSignatureParameters,
  calculateContractAddress,
} = require("../../scripts/util/test-utils.js");
const { oneWeek, oneMonth } = require("../utils/constants");

/**
 *  Test the Boson Exchange Handler interface
 */
describe("IBosonExchangeHandler", function () {
  // Common vars
  let InterfaceIds;
  let deployer,
    operator,
    admin,
    clerk,
    treasury,
    rando,
    buyer,
    newOwner,
    fauxClient,
    operatorDR,
    adminDR,
    clerkDR,
    treasuryDR;
  let erc165,
    protocolDiamond,
    accessController,
    accountHandler,
    exchangeHandler,
    offerHandler,
    fundsHandler,
    disputeHandler,
    twinHandler,
    bundleHandler,
    groupHandler;
  let bosonVoucher, voucherImplementation;
  let bosonVoucherClone, bosonVoucherCloneAddress;
  let id, buyerId, offerId, seller, sellerId, nextExchangeId, nextAccountId;
  let block, blockNumber, tx, txReceipt, event;
  let support, newTime;
  let price, sellerPool;
  let voucherRedeemableFrom;
  let fulfillmentPeriod, voucherValid;
  let protocolFeePercentage, protocolFeeFlatBoson;
  let voucher, voucherStruct, committedDate, validUntilDate, redeemedDate, expired;
  let exchange, finalizedDate, state, exchangeStruct, response, exists, buyerStruct;
  let disputeResolver, disputeResolverFees;
  let foreign20, foreign721, foreign1155;
  let twin20, twin721, twin1155, twinIds, bundle, balance, owner;
  let expectedCloneAddress;
  let method, tokenType, tokenAddress, tokenId, threshold, maxCommits, groupId, offerIds, condition, group;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();
  });

  beforeEach(async function () {
    // Make accounts available
    [
      deployer,
      operator,
      admin,
      clerk,
      treasury,
      buyer,
      rando,
      newOwner,
      fauxClient,
      operatorDR,
      adminDR,
      clerkDR,
      treasuryDR,
    ] = await ethers.getSigners();

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
      "DisputeHandlerFacet",
      "TwinHandlerFacet",
      "BundleHandlerFacet",
      "GroupHandlerFacet",
    ]);

    // Deploy the Protocol client implementation/proxy pairs (currently just the Boson Voucher)
    const protocolClientArgs = [accessController.address, protocolDiamond.address];
    const [implementations, beacons, proxies, clients] = await deployProtocolClients(protocolClientArgs, gasLimit);
    [bosonVoucher] = clients;
    const [beacon] = beacons;
    const [proxy] = proxies;
    [voucherImplementation] = implementations;

    // Deploy the mock tokens
    [foreign20, foreign721, foreign1155] = await deployMockTokens(gasLimit, ["Foreign20", "Foreign721", "Foreign1155"]);

    // set protocolFees
    protocolFeePercentage = "200"; // 2 %
    protocolFeeFlatBoson = ethers.utils.parseUnits("0.01", "ether").toString();

    // Add config Handler, so ids start at 1, and so voucher address can be found
    const protocolConfig = [
      // Protocol addresses
      {
        treasuryAddress: ethers.constants.AddressZero,
        tokenAddress: ethers.constants.AddressZero,
        voucherBeaconAddress: beacon.address,
        beaconProxyAddress: proxy.address,
      },
      // Protocol limits
      {
        maxOffersPerGroup: 100,
        maxTwinsPerBundle: 100,
        maxOffersPerBundle: 100,
        maxOffersPerBatch: 100,
        maxTokensPerWithdrawal: 100,
        maxFeesPerDisputeResolver: 100,
        maxEscalationResponsePeriod: oneMonth,
        maxDisputesPerBatch: 100,
      },
      // Protocol fees
      {
        percentage: protocolFeePercentage,
        flatBoson: protocolFeeFlatBoson,
      },
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

    // Cast Diamond to IBosonDisputeHandler
    disputeHandler = await ethers.getContractAt("IBosonDisputeHandler", protocolDiamond.address);

    // Cast Diamond to ITwinHandler
    twinHandler = await ethers.getContractAt("IBosonTwinHandler", protocolDiamond.address);

    // Cast Diamond to IBundleHandler
    bundleHandler = await ethers.getContractAt("IBosonBundleHandler", protocolDiamond.address);

    // Cast Diamond to IGroupHandler
    groupHandler = await ethers.getContractAt("IBosonGroupHandler", protocolDiamond.address);

    // Deploy the mock tokens
    [foreign20, foreign721, foreign1155] = await deployMockTokens(gasLimit, ["Foreign20", "Foreign721", "Foreign1155"]);
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
      id = offerId = sellerId = nextAccountId = "1";
      buyerId = "3"; // created after seller and dispute resolver

      // Create a valid seller
      seller = new Seller(id, operator.address, admin.address, clerk.address, treasury.address, true);
      expect(seller.isValid()).is.true;
      await accountHandler.connect(admin).createSeller(seller);
      expectedCloneAddress = calculateContractAddress(accountHandler.address, "1");

      // Create a valid dispute resolver
      disputeResolver = await mockDisputeResolver(
        operatorDR.address,
        adminDR.address,
        clerkDR.address,
        treasuryDR.address,
        false
      );
      expect(disputeResolver.isValid()).is.true;

      //Create DisputeResolverFee array so offer creation will succeed
      disputeResolverFees = [new DisputeResolverFee(ethers.constants.AddressZero, "Native", "0")];

      // Register and activate the dispute resolver
      await accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees);
      await accountHandler.connect(deployer).activateDisputeResolver(++nextAccountId);

      // Create the offer
      const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
      offer.quantityAvailable = "10";

      // Check if domains are valid
      expect(offer.isValid()).is.true;
      expect(offerDates.isValid()).is.true;
      expect(offerDurations.isValid()).is.true;

      // Create the offer
      await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId);

      // Set used variables
      price = offer.price;
      voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
      voucherValid = offerDurations.voucherValid;
      fulfillmentPeriod = offerDurations.fulfillmentPeriod;
      sellerPool = ethers.utils.parseUnits("15", "ether").toString();

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
        .depositFunds(seller.id, ethers.constants.AddressZero, sellerPool, { value: sellerPool });
    });

    context("👉 commitToOffer()", async function () {
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
        exchange.voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

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

      it("should issue the voucher on the correct clone", async function () {
        // Cast expectedCloneAddress to IBosonVoucher (existing clone)
        bosonVoucherClone = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);

        // Create a new seller to get new clone
        sellerId = "3"; // "1" is the first seller, "2" is DR
        seller = new Seller(sellerId, rando.address, rando.address, rando.address, rando.address, true);
        expect(seller.isValid()).is.true;
        await accountHandler.connect(rando).createSeller(seller);
        expectedCloneAddress = calculateContractAddress(accountHandler.address, "2");
        const bosonVoucherClone2 = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);

        // Create an offer with new seller
        const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();

        // Create the offer
        await offerHandler.connect(rando).createOffer(offer, offerDates, offerDurations, disputeResolverId);

        // Deposit seller funds so the commit will succeed
        await fundsHandler
          .connect(rando)
          .depositFunds(sellerId, ethers.constants.AddressZero, sellerPool, { value: sellerPool });

        const buyer2 = newOwner;

        // Commit to offer, creating a new exchange
        tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });
        const tx2 = await exchangeHandler.connect(deployer).commitToOffer(buyer2.address, ++offerId, { value: price });

        expect(tx).to.emit(bosonVoucherClone, "Transfer").withArgs(ethers.constants.Zero, buyer.address, "1");
        expect(tx2).to.emit(bosonVoucherClone2, "Transfer").withArgs(ethers.constants.Zero, buyer2.address, "2");

        // buyer should own 1 voucher on the clone1 address and buyer2 should own 1 voucher on clone2
        expect(await bosonVoucherClone.balanceOf(buyer.address)).to.equal("1", "Clone 1: buyer 1 balance should be 1");
        expect(await bosonVoucherClone.balanceOf(buyer2.address)).to.equal("0", "Clone 1: buyer 2 balance should be 0");
        expect(await bosonVoucherClone2.balanceOf(buyer.address)).to.equal("0", "Clone 2: buyer 1 balance should be 0");
        expect(await bosonVoucherClone2.balanceOf(buyer2.address)).to.equal(
          "1",
          "Clone 2: buyer 2 balance should be 1"
        );

        // Make sure that vouchers belong to correct buyers and that exist on the correct clone
        expect(await bosonVoucherClone.ownerOf("1")).to.equal(buyer.address, "Voucher 1: Wrong buyer address");
        await expect(bosonVoucherClone.ownerOf("2")).to.revertedWith(RevertReasons.ERC721_NON_EXISTENT);
        expect(await bosonVoucherClone2.ownerOf("2")).to.equal(buyer2.address, "Voucher 2: Wrong buyer address");
        await expect(bosonVoucherClone2.ownerOf("1")).to.revertedWith(RevertReasons.ERC721_NON_EXISTENT);

        // reference boson voucher proxy should not have any vouchers
        expect(await bosonVoucher.balanceOf(buyer.address)).to.equal(
          "0",
          "Reference proxy: buyer 1 balance should be 0"
        );
        expect(await bosonVoucher.balanceOf(buyer2.address)).to.equal(
          "0",
          "Reference proxy: buyer 2 balance should be 0"
        );

        // referecne boson voucher should not have vouchers with id 1 and 2
        await expect(bosonVoucher.ownerOf("1")).to.revertedWith(RevertReasons.ERC721_NON_EXISTENT);
        await expect(bosonVoucher.ownerOf("2")).to.revertedWith(RevertReasons.ERC721_NON_EXISTENT);

        // boson voucher implemenation should not have any vouchers
        expect(await voucherImplementation.balanceOf(buyer.address)).to.equal(
          "0",
          "Voucher implementation: buyer 1 balance should be 0"
        );
        expect(await voucherImplementation.balanceOf(buyer2.address)).to.equal(
          "0",
          "Voucher implementation: buyer 2 balance should be 0"
        );

        // boson voucher implemenation should not have vouchers with id 1 and 2
        await expect(voucherImplementation.ownerOf("1")).to.revertedWith(RevertReasons.ERC721_NON_EXISTENT);
        await expect(voucherImplementation.ownerOf("2")).to.revertedWith(RevertReasons.ERC721_NON_EXISTENT);
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
      });
    });

    context("👉 commitToOffer() with condition", async function () {
      context("✋ Threshold ERC20", async function () {
        beforeEach(async function () {
          // Required constructor params for Condition
          method = EvaluationMethod.Threshold;
          tokenType = TokenType.FungibleToken;
          tokenAddress = foreign20.address;
          tokenId = "0";
          threshold = "50";
          maxCommits = "3";

          // Required constructor params for Group
          groupId = "1";
          offerIds = [offerId];

          // Create Condition
          condition = new Condition(method, tokenType, tokenAddress, tokenId, threshold, maxCommits);
          expect(condition.isValid()).to.be.true;

          // Create Group
          group = new Group(groupId, sellerId, offerIds, condition);
          expect(group.isValid()).is.true;
          await groupHandler.connect(operator).createGroup(group);
        });

        it("should emit a BuyerCommitted event if user meets condition", async function () {
          // mint enough tokens for the buyer
          await foreign20.connect(buyer).mint(buyer.address, threshold);

          // Commit to offer.
          // We're only concerned that the event is emitted, indicating the condition was met
          await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })).to.emit(
            exchangeHandler,
            "BuyerCommitted"
          );
        });

        it("should allow buyer to commit up to the max times for the group", async function () {
          // mint enough tokens for the buyer
          await foreign20.connect(buyer).mint(buyer.address, threshold);

          // Commit to offer the maximum number of times
          for (let i = 0; i < Number(maxCommits); i++) {
            // We're only concerned that the event is emitted, indicating the commit was allowed
            await expect(
              exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
            ).to.emit(exchangeHandler, "BuyerCommitted");
          }
        });

        context("💔 Revert Reasons", async function () {
          /*
           * Reverts if:
           * - buyer does not meet conditions for commit
           */

          it("buyer does not meet condition for commit", async function () {
            // Attempt to commit, expecting revert
            await expect(
              exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
            ).to.revertedWith(RevertReasons.CANNOT_COMMIT);
          });

          it("buyer has exhausted allowable commits", async function () {
            // mint a token for the buyer
            await foreign20.connect(buyer).mint(buyer.address, threshold);

            // Commit to offer the maximum number of times
            for (let i = 0; i < Number(maxCommits); i++) {
              await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });
            }

            // Attempt to commit again after maximum commits has been reached
            await expect(
              exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
            ).to.revertedWith(RevertReasons.CANNOT_COMMIT);
          });
        });
      });

      context("✋ Threshold ERC721", async function () {
        beforeEach(async function () {
          // Required constructor params for Condition
          method = EvaluationMethod.Threshold;
          tokenType = TokenType.NonFungibleToken;
          tokenAddress = foreign721.address;
          tokenId = "0";
          threshold = "5";
          maxCommits = "3";

          // Required constructor params for Group
          groupId = "1";
          offerIds = [offerId];

          // Create Condition
          condition = new Condition(method, tokenType, tokenAddress, tokenId, threshold, maxCommits);
          expect(condition.isValid()).to.be.true;

          // Create Group
          group = new Group(groupId, sellerId, offerIds, condition);
          expect(group.isValid()).is.true;
          await groupHandler.connect(operator).createGroup(group);
        });

        it("should emit a BuyerCommitted event if user meets condition", async function () {
          // mint enough tokens for the buyer
          await foreign721.connect(buyer).mint(tokenId, threshold);

          // Commit to offer.
          // We're only concerned that the event is emitted, indicating the condition was met
          await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })).to.emit(
            exchangeHandler,
            "BuyerCommitted"
          );
        });

        it("should allow buyer to commit up to the max times for the group", async function () {
          // mint enough tokens for the buyer
          await foreign721.connect(buyer).mint(tokenId, threshold);

          // Commit to offer the maximum number of times
          for (let i = 0; i < Number(maxCommits); i++) {
            // We're only concerned that the event is emitted, indicating the commit was allowed
            await expect(
              exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
            ).to.emit(exchangeHandler, "BuyerCommitted");
          }
        });

        context("💔 Revert Reasons", async function () {
          /*
           * Reverts if:
           * - buyer does not meet conditions for commit
           */

          it("buyer does not meet condition for commit", async function () {
            // Attempt to commit, expecting revert
            await expect(
              exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
            ).to.revertedWith(RevertReasons.CANNOT_COMMIT);
          });

          it("buyer has exhausted allowable commits", async function () {
            // mint enough tokens for the buyer
            await foreign721.connect(buyer).mint(tokenId, threshold);

            // Commit to offer the maximum number of times
            for (let i = 0; i < Number(maxCommits); i++) {
              await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });
            }

            // Attempt to commit again after maximum commits has been reached
            await expect(
              exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
            ).to.revertedWith(RevertReasons.CANNOT_COMMIT);
          });
        });
      });

      context("✋ Threshold ERC1155", async function () {
        beforeEach(async function () {
          // Required constructor params for Condition
          method = EvaluationMethod.Threshold;
          tokenType = TokenType.MultiToken;
          tokenAddress = foreign1155.address;
          tokenId = "1";
          threshold = "20";
          maxCommits = "3";

          // Required constructor params for Group
          groupId = "1";
          offerIds = [offerId];

          // Create Condition
          condition = new Condition(method, tokenType, tokenAddress, tokenId, threshold, maxCommits);
          expect(condition.isValid()).to.be.true;

          // Create Group
          group = new Group(groupId, sellerId, offerIds, condition);
          expect(group.isValid()).is.true;
          await groupHandler.connect(operator).createGroup(group);
        });

        it("should emit a BuyerCommitted event if user meets condition", async function () {
          // mint enough tokens for the buyer
          await foreign1155.connect(buyer).mint(tokenId, threshold);

          // Commit to offer.
          // We're only concerned that the event is emitted, indicating the condition was met
          await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })).to.emit(
            exchangeHandler,
            "BuyerCommitted"
          );
        });

        it("should allow buyer to commit up to the max times for the group", async function () {
          // mint enough tokens for the buyer
          await foreign1155.connect(buyer).mint(tokenId, threshold);

          // Commit to offer the maximum number of times
          for (let i = 0; i < Number(maxCommits); i++) {
            // We're only concerned that the event is emitted, indicating the commit was allowed
            await expect(
              exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
            ).to.emit(exchangeHandler, "BuyerCommitted");
          }
        });

        context("💔 Revert Reasons", async function () {
          /*
           * Reverts if:
           * - buyer does not meet conditions for commit
           */

          it("buyer does not meet condition for commit", async function () {
            // Attempt to commit, expecting revert
            await expect(
              exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
            ).to.revertedWith(RevertReasons.CANNOT_COMMIT);
          });

          it("buyer has exhausted allowable commits", async function () {
            // mint enough tokens for the buyer
            await foreign1155.connect(buyer).mint(tokenId, threshold);

            // Commit to offer the maximum number of times
            for (let i = 0; i < Number(maxCommits); i++) {
              await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });
            }

            // Attempt to commit again after maximum commits has been reached
            await expect(
              exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
            ).to.revertedWith(RevertReasons.CANNOT_COMMIT);
          });
        });
      });

      context("✋ SpecificToken ERC721", async function () {
        beforeEach(async function () {
          // Required constructor params for Condition
          method = EvaluationMethod.SpecificToken;
          tokenType = TokenType.NonFungibleToken;
          tokenAddress = foreign721.address;
          tokenId = "12";
          threshold = "0";
          maxCommits = "3";

          // Required constructor params for Group
          groupId = "1";
          offerIds = [offerId];

          // Create Condition
          condition = new Condition(method, tokenType, tokenAddress, tokenId, threshold, maxCommits);
          expect(condition.isValid()).to.be.true;

          // Create Group
          group = new Group(groupId, sellerId, offerIds, condition);
          expect(group.isValid()).is.true;
          await groupHandler.connect(operator).createGroup(group);
        });

        it("should emit a BuyerCommitted event if user meets condition", async function () {
          // mint correct token for the buyer
          await foreign721.connect(buyer).mint(tokenId, "1");

          // Commit to offer.
          // We're only concerned that the event is emitted, indicating the condition was met
          await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })).to.emit(
            exchangeHandler,
            "BuyerCommitted"
          );
        });

        it("should allow buyer to commit up to the max times for the group", async function () {
          // mint correct token for the buyer
          await foreign721.connect(buyer).mint(tokenId, "1");

          // Commit to offer the maximum number of times
          for (let i = 0; i < Number(maxCommits); i++) {
            // We're only concerned that the event is emitted, indicating the commit was allowed
            await expect(
              exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
            ).to.emit(exchangeHandler, "BuyerCommitted");
          }
        });

        context("💔 Revert Reasons", async function () {
          /*
           * Reverts if:
           * - buyer does not meet conditions for commit
           */

          it("buyer does not meet condition for commit", async function () {
            // mint correct token but to another user
            await foreign721.connect(rando).mint(tokenId, "1");

            // Attempt to commit, expecting revert
            await expect(
              exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
            ).to.revertedWith(RevertReasons.CANNOT_COMMIT);
          });

          it("buyer has exhausted allowable commits", async function () {
            // mint correct token for the buyer
            await foreign721.connect(buyer).mint(tokenId, "1");

            // Commit to offer the maximum number of times
            for (let i = 0; i < Number(maxCommits); i++) {
              await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });
            }

            // Attempt to commit again after maximum commits has been reached
            await expect(
              exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price })
            ).to.revertedWith(RevertReasons.CANNOT_COMMIT);
          });
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
        exchange.voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

        // Get the struct
        exchangeStruct = exchange.toStruct();
      });

      it("should emit an ExchangeCompleted event when buyer calls", async function () {
        // Set time forward to the offer's voucherRedeemableFrom
        await setNextBlockTimestamp(Number(voucherRedeemableFrom));

        // Redeem the voucher
        await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

        // Complete the exchange, expecting event
        await expect(exchangeHandler.connect(buyer).completeExchange(exchange.id))
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchange.id, buyer.address);
      });

      it("should update state", async function () {
        // Set time forward to the offer's voucherRedeemableFrom
        await setNextBlockTimestamp(Number(voucherRedeemableFrom));

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
        // Set time forward to the offer's voucherRedeemableFrom
        await setNextBlockTimestamp(Number(voucherRedeemableFrom));

        // Redeem the voucher
        await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

        // Get the current block info
        blockNumber = await ethers.provider.getBlockNumber();
        block = await ethers.provider.getBlock(blockNumber);

        // Set time forward to run out the fulfillment period
        newTime = ethers.BigNumber.from(block.timestamp).add(fulfillmentPeriod).add(1).toNumber();
        await setNextBlockTimestamp(newTime);

        // Complete exchange
        await expect(exchangeHandler.connect(operator).completeExchange(exchange.id))
          .to.emit(exchangeHandler, "ExchangeCompleted")
          .withArgs(offerId, buyerId, exchange.id, operator.address);
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
          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // Redeem the voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Attempt to complete the exchange, expecting revert
          await expect(exchangeHandler.connect(rando).completeExchange(exchange.id)).to.revertedWith(
            RevertReasons.NOT_BUYER_OR_SELLER
          );
        });

        it("caller is seller's operator and offer fulfillment period has not elapsed", async function () {
          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

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
        exchange.voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

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
        exchange.voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

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
        bosonVoucherCloneAddress = calculateContractAddress(exchangeHandler.address, "1");
        bosonVoucherClone = await ethers.getContractAt("IBosonVoucher", bosonVoucherCloneAddress);
        await bosonVoucherClone.connect(buyer).transferFrom(buyer.address, newOwner.address, exchange.id);

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
        exchange.voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

        // Get the struct
        exchangeStruct = exchange.toStruct();
      });

      it("should emit an VoucherExpired event when anyone calls and voucher has expired", async function () {
        // Set time forward past the voucher's validUntilDate
        await setNextBlockTimestamp(Number(voucherRedeemableFrom) + Number(voucherValid) + Number(oneWeek));

        // Expire the voucher, expecting event
        await expect(exchangeHandler.connect(rando).expireVoucher(exchange.id))
          .to.emit(exchangeHandler, "VoucherExpired")
          .withArgs(offerId, exchange.id, rando.address);
      });

      it("should update state when anyone calls and voucher has expired", async function () {
        // Set time forward past the voucher's validUntilDate
        await setNextBlockTimestamp(Number(voucherRedeemableFrom) + Number(voucherValid) + Number(oneWeek));

        // Expire the voucher
        await exchangeHandler.connect(rando).expireVoucher(exchange.id);

        // Get the exchange state
        [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);

        // It should match ExchangeState.Canceled
        assert.equal(response, ExchangeState.Canceled, "Exchange state is incorrect");
      });

      it("should update voucher expired flag when anyone calls and voucher has expired", async function () {
        // Set time forward past the voucher's validUntilDate
        await setNextBlockTimestamp(Number(voucherRedeemableFrom) + Number(voucherValid) + Number(oneWeek));

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
          await setNextBlockTimestamp(Number(voucherRedeemableFrom) + Number(voucherValid) + Number(oneWeek));

          // An invalid exchange id
          id = "666";

          // Attempt to cancel the voucher, expecting revert
          await expect(exchangeHandler.connect(buyer).expireVoucher(id)).to.revertedWith(
            RevertReasons.NO_SUCH_EXCHANGE
          );
        });

        it("exchange is not in committed state", async function () {
          // Set time forward past the voucher's validUntilDate
          await setNextBlockTimestamp(Number(voucherRedeemableFrom) + Number(voucherValid) + Number(oneWeek));

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
        exchange.voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);
        // Get the struct
        exchangeStruct = exchange.toStruct();
      });

      it("should emit a VoucherRedeemed event when buyer calls", async function () {
        // Set time forward to the offer's voucherRedeemableFrom
        await setNextBlockTimestamp(Number(voucherRedeemableFrom));

        // Redeem the voucher, expecting event
        await expect(exchangeHandler.connect(buyer).redeemVoucher(exchange.id))
          .to.emit(exchangeHandler, "VoucherRedeemed")
          .withArgs(offerId, exchange.id, buyer.address);
      });

      it("should update state", async function () {
        // Set time forward to the offer's voucherRedeemableFrom
        await setNextBlockTimestamp(Number(voucherRedeemableFrom));

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
         * - Current time is prior to offer.voucherRedeemableFrom
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

        it("current time is prior to offer's voucherRedeemableFrom", async function () {
          // Attempt to redeem the voucher, expecting revert
          await expect(exchangeHandler.connect(buyer).redeemVoucher(exchange.id)).to.revertedWith(
            RevertReasons.VOUCHER_NOT_REDEEMABLE
          );
        });

        it("current time is after to voucher's validUntilDate", async function () {
          // Set time forward past the voucher's validUntilDate
          await setNextBlockTimestamp(Number(voucherRedeemableFrom) + Number(voucherValid) + Number(oneWeek));

          // Attempt to redeem the voucher, expecting revert
          await expect(exchangeHandler.connect(buyer).redeemVoucher(exchange.id)).to.revertedWith(
            RevertReasons.VOUCHER_NOT_REDEEMABLE
          );
        });
      });
    });

    context("👉 redeemVoucher() with bundle", async function () {
      beforeEach(async function () {
        // Mint some tokens to be bundled
        await foreign20.connect(operator).mint(operator.address, "500");
        await foreign721.connect(operator).mint("0", "1");
        await foreign1155.connect(operator).mint("1", "500");

        // Approve the protocol diamond to transfer seller's tokens
        await foreign20.connect(operator).approve(protocolDiamond.address, "1");
        await foreign721.connect(operator).setApprovalForAll(protocolDiamond.address, true);
        await foreign1155.connect(operator).setApprovalForAll(protocolDiamond.address, true);

        // Create an ERC20 twin
        twin20 = mockTwin(foreign20.address);
        twin20.amount = "1";
        expect(twin20.isValid()).is.true;

        // Create an ERC721 twin
        twin721 = mockTwin(foreign721.address, TokenType.NonFungibleToken);
        twin721.id = "2";
        twin721.amount = "0";

        expect(twin721.isValid()).is.true;

        // Create an ERC1155 twin
        twin1155 = mockTwin(foreign1155.address, TokenType.MultiToken);
        twin1155.id = "3";
        twin1155.tokenId = "1";
        twin1155.amount = "1";

        expect(twin1155.isValid()).is.true;

        // All the twin ids (for mixed bundle)
        twinIds = [twin20.id, twin721.id, twin1155.id];

        // Create twins
        await twinHandler.connect(operator).createTwin(twin20.toStruct());
        await twinHandler.connect(operator).createTwin(twin721.toStruct());
        await twinHandler.connect(operator).createTwin(twin1155.toStruct());
      });

      context("📦 Offer bundled with ERC20 twin", async function () {
        beforeEach(async function () {
          // Create a new bundle
          bundle = new Bundle("1", sellerId, [offerId], [twin20.id]);
          expect(bundle.isValid()).is.true;
          await bundleHandler.connect(operator).createBundle(bundle.toStruct());

          // Commit to offer
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));
        });

        it("should transfer the twin", async function () {
          // Check the buyer's balance of the ERC20
          balance = await foreign20.balanceOf(buyer.address);
          expect(balance).to.equal(0);

          // Redeem the voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Check the buyer's balance of the ERC20
          balance = await foreign20.balanceOf(buyer.address);
          expect(balance).to.equal(1);
        });

        // Skip these tests because we decide that for now we shouldn't revert redeemVoucher if twin transfer failed otherwise buyer will lose cancellation penalty
        context.skip("💔 Revert Reasons", async function () {
          it("unable to transfer the twin", async function () {
            // Remove the approval for the protocal to transfer the seller's tokens
            await foreign20.connect(operator).approve(protocolDiamond.address, "0");

            // Attempt to redeem the voucher, expecting revert
            await expect(exchangeHandler.connect(buyer).redeemVoucher(exchange.id)).to.revertedWith(
              RevertReasons.TWIN_TRANSFER_FAILED
            );
          });
        });
      });

      context("📦 Offer bundled with ERC721 twin", async function () {
        beforeEach(async function () {
          // Create a new bundle
          bundle = new Bundle("1", sellerId, [offerId], [twin721.id]);
          expect(bundle.isValid()).is.true;
          await bundleHandler.connect(operator).createBundle(bundle.toStruct());

          // Commit to offer
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));
        });

        it("should transfer the twin", async function () {
          // Check the operator owns the ERC721
          owner = await foreign721.ownerOf("0");
          expect(owner).to.equal(operator.address);

          // Redeem the voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Check the buyer owns the ERC721
          owner = await foreign721.ownerOf("0");
          expect(owner).to.equal(buyer.address);
        });

        // Skip these tests because we decide that for now we shouldn't revert redeemVoucher if twin transfer failed otherwise buyer will lose cancellation penalty
        context.skip("💔 Revert Reasons", async function () {
          it("unable to transfer the twin", async function () {
            // Remove the approval for the protocal to transfer the seller's tokens
            await foreign721.connect(operator).setApprovalForAll(protocolDiamond.address, false);

            // Attempt to redeem the voucher, expecting revert
            await expect(exchangeHandler.connect(buyer).redeemVoucher(exchange.id)).to.revertedWith(
              RevertReasons.TWIN_TRANSFER_FAILED
            );
          });
        });
      });

      context("📦 Offer bundled with ERC1155 twin", async function () {
        beforeEach(async function () {
          // Create a new bundle
          bundle = new Bundle("1", sellerId, [offerId], [twin1155.id]);
          expect(bundle.isValid()).is.true;
          await bundleHandler.connect(operator).createBundle(bundle.toStruct());

          // Commit to offer
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));
        });

        it("should transfer the twin", async function () {
          // Check the buyer's balance of the ERC1155
          balance = await foreign1155.balanceOf(buyer.address, "1");
          expect(balance).to.equal(0);

          // Redeem the voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Check the buyer's balance of the ERC1155
          balance = await foreign1155.balanceOf(buyer.address, "1");
          expect(balance).to.equal(1);
        });

        context("💔 Revert Reasons", async function () {
          // Skip these tests because we decide that for now we shouldn't revert redeemVoucher if twin transfer failed otherwise buyer will lose cancellation penalty
          it.skip("unable to transfer the twin", async function () {
            // Remove the approval for the protocal to transfer the seller's tokens
            await foreign1155.connect(operator).setApprovalForAll(protocolDiamond.address, false);

            // Attempt to redeem the voucher, expecting revert
            await expect(exchangeHandler.connect(buyer).redeemVoucher(exchange.id)).to.revertedWith(
              RevertReasons.TWIN_TRANSFER_FAILED
            );
          });
        });
      });

      context("📦 Offer bundled with mixed twins", async function () {
        beforeEach(async function () {
          // Create a new bundle
          bundle = new Bundle("1", sellerId, [offerId], twinIds);
          expect(bundle.isValid()).is.true;
          await bundleHandler.connect(operator).createBundle(bundle.toStruct());

          // Commit to offer
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });

          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));
        });

        it("should transfer the twins", async function () {
          // Check the buyer's balance of the ERC20
          balance = await foreign20.balanceOf(buyer.address);
          expect(balance).to.equal(0);

          // Check the operator owns the ERC721
          owner = await foreign721.ownerOf("0");
          expect(owner).to.equal(operator.address);

          // Check the buyer's balance of the ERC1155
          balance = await foreign1155.balanceOf(buyer.address, "1");
          expect(balance).to.equal(0);

          // Redeem the voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Check the buyer's balance of the ERC20
          balance = await foreign20.balanceOf(buyer.address);
          expect(balance).to.equal(1);

          // Check the buyer owns the ERC721
          owner = await foreign721.ownerOf("0");
          expect(owner).to.equal(buyer.address);

          // Check the buyer's balance of the ERC1155
          balance = await foreign1155.balanceOf(buyer.address, "1");
          expect(balance).to.equal(1);
        });

        // Skip these tests because we decide that for now we shouldn't revert redeemVoucher if twin transfer failed otherwise buyer will lose cancellation penalty
        context.skip("💔 Revert Reasons", async function () {
          it("unable to transfer the ERC20 twin", async function () {
            // Remove the approval for the protocal to transfer the seller's tokens
            await foreign20.connect(operator).approve(protocolDiamond.address, "0");

            // Attempt to redeem the voucher, expecting revert
            await expect(exchangeHandler.connect(buyer).redeemVoucher(exchange.id)).to.revertedWith(
              RevertReasons.TWIN_TRANSFER_FAILED
            );
          });

          it("unable to transfer the ERC721 twin", async function () {
            // Remove the approval for the protocal to transfer the seller's tokens
            await foreign721.connect(operator).setApprovalForAll(protocolDiamond.address, false);

            // Attempt to redeem the voucher, expecting revert
            await expect(exchangeHandler.connect(buyer).redeemVoucher(exchange.id)).to.revertedWith(
              RevertReasons.TWIN_TRANSFER_FAILED
            );
          });

          it("unable to transfer the ERC1155 twin", async function () {
            // Remove the approval for the protocal to transfer the seller's tokens
            await foreign1155.connect(operator).setApprovalForAll(protocolDiamond.address, false);

            // Attempt to redeem the voucher, expecting revert
            await expect(exchangeHandler.connect(buyer).redeemVoucher(exchange.id)).to.revertedWith(
              RevertReasons.TWIN_TRANSFER_FAILED
            );
          });
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
        exchange.voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

        // Get the struct
        exchangeStruct = exchange.toStruct();

        // Client used for tests
        bosonVoucherCloneAddress = calculateContractAddress(exchangeHandler.address, "1");
        bosonVoucherClone = await ethers.getContractAt("IBosonVoucher", bosonVoucherCloneAddress);
      });

      it("should emit an VoucherTransferred event when called by CLIENT-roled address", async function () {
        // Get the next buyer id
        nextAccountId = await accountHandler.connect(rando).getNextAccountId();

        // Call onVoucherTransferred, expecting event
        await expect(bosonVoucherClone.connect(buyer).transferFrom(buyer.address, newOwner.address, exchange.id))
          .to.emit(exchangeHandler, "VoucherTransferred")
          .withArgs(offerId, exchange.id, nextAccountId, bosonVoucherClone.address);
      });

      it("should update exchange when new buyer (with existing, active account) is passed", async function () {
        // Get the next buyer id
        nextAccountId = await accountHandler.connect(rando).getNextAccountId();

        // Create a buyer account for the new owner
        await accountHandler.connect(newOwner).createBuyer(new Buyer("0", newOwner.address, true));

        // Call onVoucherTransferred
        await bosonVoucherClone.connect(buyer).transferFrom(buyer.address, newOwner.address, exchange.id);

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
        await bosonVoucherClone.connect(buyer).transferFrom(buyer.address, newOwner.address, exchange.id);

        // Get the exchange
        [exists, response] = await exchangeHandler.connect(rando).getExchange(exchange.id);

        // Marshal response to entity
        exchange = Exchange.fromStruct(response);
        expect(exchange.isValid());

        // Exchange's voucher expired flag should be true
        assert.equal(exchange.buyerId, nextAccountId, "Exchange.buyerId not updated");
      });

      it("should be triggered when a voucher is transferred", async function () {
        // Transfer voucher, expecting event
        await expect(
          bosonVoucherClone.connect(buyer).transferFrom(buyer.address, newOwner.address, exchange.id)
        ).to.emit(exchangeHandler, "VoucherTransferred");
      });

      it("should not be triggered when a voucher is issued", async function () {
        // Get the next buyer id
        nextAccountId = await accountHandler.getNextAccountId();

        // Get the next exchange id
        nextExchangeId = await exchangeHandler.getNextExchangeId();

        // Get a buyer struct
        buyerStruct = new Buyer(nextAccountId, newOwner.address, true).toStruct();

        // Create a buyer account
        await accountHandler.connect(newOwner).createBuyer(new Buyer("0", newOwner.address, true));

        // Grant PROTOCOL role to EOA address for test
        await accessController.grantRole(Role.PROTOCOL, rando.address);

        // Issue voucher, expecting no event
        await expect(bosonVoucherClone.connect(rando).issueVoucher(nextExchangeId, buyerStruct)).to.not.emit(
          exchangeHandler,
          "VoucherTransferred"
        );
      });

      it("should not be triggered when a voucher is burned", async function () {
        // Grant PROTOCOL role to EOA address for test
        await accessController.grantRole(Role.PROTOCOL, rando.address);

        // Burn voucher, expecting no event
        await expect(bosonVoucherClone.connect(rando).burnVoucher(exchange.id)).to.not.emit(
          exchangeHandler,
          "VoucherTransferred"
        );
      });

      context("💔 Revert Reasons", async function () {
        /**
         * Reverts if
         * - Caller is not a clone address associated with the seller
         * - Exchange does not exist
         * - Exchange is not in committed state
         * - Voucher has expired
         * - New buyer's existing account is deactivated
         */

        it("Caller is not a clone address", async function () {
          // Attempt to call onVoucherTransferred, expecting revert
          await expect(
            exchangeHandler.connect(rando).onVoucherTransferred(exchange.id, newOwner.address)
          ).to.revertedWith(RevertReasons.ACCESS_DENIED);
        });

        it("Caller is not a clone address associated with the seller", async function () {
          // Create a new seller to get new clone
          seller = new Seller(id, rando.address, rando.address, rando.address, rando.address, true);
          expect(seller.isValid()).is.true;
          await accountHandler.connect(rando).createSeller(seller);
          expectedCloneAddress = calculateContractAddress(accountHandler.address, "2");
          const bosonVoucherClone2 = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);

          // For the sake of test, mint token on bv2 with the id of token on bv1
          // Temporarily grant PROTOCOL role to deployer account
          await accessController.grantRole(Role.PROTOCOL, deployer.address);
          await bosonVoucherClone2.issueVoucher(exchange.id, new Buyer(buyerId, buyer.address, true));

          // Attempt to call onVoucherTransferred, expecting revert
          await expect(
            bosonVoucherClone2.connect(buyer).transferFrom(buyer.address, newOwner.address, exchange.id)
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
          await setNextBlockTimestamp(Number(voucherRedeemableFrom) + Number(voucherValid) + Number(oneWeek));

          // Attempt to call onVoucherTransferred, expecting revert
          await expect(exchangeHandler.connect(fauxClient).onVoucherTransferred(id, newOwner.address)).to.revertedWith(
            RevertReasons.VOUCHER_HAS_EXPIRED
          );
        });

        it("New buyer's existing account is deactivated", async function () {
          // Get the next buyer id
          nextAccountId = await accountHandler.connect(rando).getNextAccountId();

          // Create a buyer account for the new owner
          await accountHandler.connect(newOwner).createBuyer(new Buyer("0", newOwner.address, true));

          // Update buyer account, deactivating it
          await accountHandler.connect(newOwner).updateBuyer(new Buyer(nextAccountId, newOwner.address, false));

          // Attempt to call onVoucherTransferred, expecting revert
          await expect(
            bosonVoucherClone.connect(buyer).transferFrom(buyer.address, newOwner.address, id)
          ).to.revertedWith(RevertReasons.MUST_BE_ACTIVE);
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
          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // Redeem voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Now in Redeemed state, ask if exchange is finalized
          [exists, response] = await exchangeHandler.connect(rando).isExchangeFinalized(exchange.id);

          // It should not be finalized
          assert.equal(response, false, "Incorrectly reports finalized state");
        });

        it("should return true if exchange is in Completed state", async function () {
          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // Redeem voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Get the current block info
          blockNumber = await ethers.provider.getBlockNumber();
          block = await ethers.provider.getBlock(blockNumber);

          // Set time forward to run out the fulfillment period
          newTime = ethers.BigNumber.from(voucherRedeemableFrom).add(fulfillmentPeriod).add(1).toNumber();
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

      context("👎 disputed exchange", async function () {
        beforeEach(async function () {
          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // Redeem voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Raise a dispute on the exchange
          await disputeHandler.connect(buyer).raiseDispute(exchange.id, "Tastes weird");
        });

        it("should return false if exchange has a dispute in Disputed state", async function () {
          // In Disputed state, ask if exchange is finalized
          [exists, response] = await exchangeHandler.connect(rando).isExchangeFinalized(exchange.id);

          // It should not be finalized
          assert.equal(response, false, "Incorrectly reports finalized state");
        });

        it("should return true if exchange has a dispute in Retracted state", async function () {
          // Retract Dispute
          await disputeHandler.connect(buyer).retractDispute(exchange.id);

          // Now in Retracted state, ask if exchange is finalized
          [exists, response] = await exchangeHandler.connect(rando).isExchangeFinalized(exchange.id);

          // It should be finalized
          assert.equal(response, true, "Incorrectly reports unfinalized state");
        });

        it("should return true if exchange has a dispute in Resolved state", async function () {
          const buyerPercent = "5566"; // 55.66%

          // Set the message Type, needed for signature
          const resolutionType = [
            { name: "exchangeId", type: "uint256" },
            { name: "buyerPercent", type: "uint256" },
          ];

          const customSignatureType = {
            Resolution: resolutionType,
          };

          const message = {
            exchangeId: exchange.id,
            buyerPercent,
          };

          // Collect the signature components
          const { r, s, v } = await prepareDataSignatureParameters(
            buyer, // Operator is the caller, seller should be the signer.
            customSignatureType,
            "Resolution",
            message,
            disputeHandler.address
          );

          // Resolve Dispute
          await disputeHandler.connect(operator).resolveDispute(exchange.id, buyerPercent, r, s, v);

          // Now in Resolved state, ask if exchange is finalized
          [exists, response] = await exchangeHandler.connect(rando).isExchangeFinalized(exchange.id);

          // It should be finalized
          assert.equal(response, true, "Incorrectly reports unfinalized state");
        });

        it("should return false if exchange has a dispute in Escalated state", async function () {
          // Escalate the dispute
          await disputeHandler.connect(buyer).escalateDispute(exchange.id);

          // In Escalated state, ask if exchange is finalized
          [exists, response] = await exchangeHandler.connect(rando).isExchangeFinalized(exchange.id);

          // It should not be finalized
          assert.equal(response, false, "Incorrectly reports finalized state");
        });

        it("should return true if exchange has a dispute in Decided state", async function () {
          // Escalate the dispute
          await disputeHandler.connect(buyer).escalateDispute(exchange.id);

          // Decide Dispute
          await disputeHandler.connect(operatorDR).decideDispute(exchange.id, "1111");

          // Now in Decided state, ask if exchange is finalized
          [exists, response] = await exchangeHandler.connect(rando).isExchangeFinalized(exchange.id);

          // It should be finalized
          assert.equal(response, true, "Incorrectly reports unfinalized state");
        });

        it("should return true if exchange has a dispute in Refused state", async function () {
          // Escalate the dispute
          tx = await disputeHandler.connect(buyer).escalateDispute(exchange.id);

          // Get the block timestamp of the confirmed tx and set escalatedDate
          blockNumber = tx.blockNumber;
          block = await ethers.provider.getBlock(blockNumber);
          const escalatedDate = block.timestamp.toString();

          await setNextBlockTimestamp(Number(escalatedDate) + Number(disputeResolver.escalationResponsePeriod));

          // Expire dispute
          await disputeHandler.connect(rando).expireEscalatedDispute(exchange.id);

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
        exchange.voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

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
        exchange.voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

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
        assert.equal(response, ExchangeState.Committed, "Exchange state is incorrect");
      });
    });
  });
});
