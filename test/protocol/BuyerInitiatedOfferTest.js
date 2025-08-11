const { ethers } = require("hardhat");
const { getContractAt, ZeroAddress, ZeroHash, getSigners, MaxUint256, parseUnits, getContractFactory } = ethers;
const { expect } = require("chai");

const Offer = require("../../scripts/domain/Offer");
const OfferCreator = require("../../scripts/domain/OfferCreator");
const PriceDiscovery = require("../../scripts/domain/PriceDiscovery");
const Side = require("../../scripts/domain/Side");
const PriceType = require("../../scripts/domain/PriceType.js");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const DisputeResolutionTerms = require("../../scripts/domain/DisputeResolutionTerms");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const ExchangeState = require("../../scripts/domain/ExchangeState");
const { RoyaltyInfo } = require("../../scripts/domain/RoyaltyInfo");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const {
  applyPercentage,
  calculateCloneAddress,
  calculateBosonProxyAddress,
  setupTestEnvironment,
  getSnapshot,
  revertToSnapshot,
  deriveTokenId,
  compareOfferStructs,
  getEvent,
} = require("../util/utils.js");
const {
  mockOffer,
  mockDisputeResolver,
  mockSeller,
  mockVoucherInitValues,
  mockAuthToken,
  accountId,
} = require("../util/mock");

/**
 * Test the Buyer-Initiated Exchange feature (BPIP-9)
 */
describe("Buyer-Initiated Exchange", function () {
  // Common vars
  let pauser,
    rando,
    assistant,
    admin,
    clerk,
    treasury,
    assistantDR,
    adminDR,
    clerkDR,
    treasuryDR,
    buyer1,
    buyer2,
    assistant2;
  let accountHandler,
    fundsHandler,
    exchangeHandler,
    exchangeCommitHandler,
    offerHandler,
    configHandler,
    pauseHandler,
    priceDiscoveryHandler;
  let seller, seller2;
  let offer, offerDates, offerDurations, offerFees;
  let buyerCreatedOffer, sellerCreatedOffer;
  let mockToken, bosonToken, weth;
  let buyerEscalationDepositPercentage;
  let buyerId, buyerId2, sellerId, sellerId2;
  let offerDatesStruct, offerDurationsStruct, offerFeesStruct;
  let disputeResolverFees, disputeResolver;
  let disputeResolutionTerms, disputeResolutionTermsStruct;
  let voucherInitValues, emptyAuthToken;
  let agentId, offerFeeLimit;
  let snapshot;
  let DRFeeNative, DRFeeToken;
  let sellerAllowList;
  let nextOfferId;
  let priceDiscoveryContract, bpd, protocolDiamondAddress;

  before(async function () {
    [
      ,
      pauser,
      rando,
      assistant,
      admin,
      clerk,
      treasury,
      assistantDR,
      adminDR,
      clerkDR,
      treasuryDR,
      buyer1,
      buyer2,
      assistant2,
    ] = await getSigners();

    const contracts = {
      accessController: "AccessController",
      accountHandler: "IBosonAccountHandler",
      offerHandler: "IBosonOfferHandler",
      exchangeHandler: "IBosonExchangeHandler",
      exchangeCommitHandler: "IBosonExchangeCommitHandler",
      fundsHandler: "IBosonFundsHandler",
      configHandler: "IBosonConfigHandler",
      disputeHandler: "IBosonDisputeHandler",
      pauseHandler: "IBosonPauseHandler",
      sequentialCommitHandler: "IBosonSequentialCommitHandler",
      priceDiscoveryHandler: "IBosonPriceDiscoveryHandler",
    };

    [mockToken, bosonToken] = await deployMockTokens(["Foreign20", "BosonToken"]);

    const wethFactory = await getContractFactory("WETH9");
    weth = await wethFactory.deploy();
    await weth.waitForDeployment();

    ({
      signers: [pauser, admin, treasury, rando, adminDR, treasuryDR, assistant2],
      contractInstances: {
        accountHandler,
        offerHandler,
        exchangeHandler,
        exchangeCommitHandler,
        fundsHandler,
        configHandler,
        pauseHandler,
        priceDiscoveryHandler,
      },
      protocolConfig: [, , , , buyerEscalationDepositPercentage],
      diamondAddress: protocolDiamondAddress,
    } = await setupTestEnvironment(contracts, {
      bosonTokenAddress: await bosonToken.getAddress(),
      wethAddress: await weth.getAddress(),
    }));

    const bpdFactory = await getContractFactory("BosonPriceDiscovery");
    bpd = await bpdFactory.deploy(await weth.getAddress(), protocolDiamondAddress);
    await bpd.waitForDeployment();

    await configHandler.setPriceDiscoveryAddress(await bpd.getAddress());

    const PriceDiscoveryFactory = await getContractFactory("PriceDiscoveryMock");
    priceDiscoveryContract = await PriceDiscoveryFactory.deploy();
    await priceDiscoveryContract.waitForDeployment();

    assistant = admin;
    assistantDR = adminDR;
    clerk = clerkDR = { address: ZeroAddress };

    // Get snapshot id
    snapshot = await getSnapshot();
  });

  beforeEach(async function () {
    await revertToSnapshot(snapshot);
    snapshot = await getSnapshot();

    accountId.next(true);

    seller = mockSeller(
      await assistant.getAddress(),
      await admin.getAddress(),
      clerk.address,
      await treasury.getAddress()
    );
    expect(seller.isValid()).is.true;

    voucherInitValues = mockVoucherInitValues();
    expect(voucherInitValues.isValid()).is.true;

    emptyAuthToken = mockAuthToken();
    expect(emptyAuthToken.isValid()).is.true;
    await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);
    sellerId = seller.id;

    seller2 = mockSeller(
      await assistant2.getAddress(),
      await assistant2.getAddress(),
      clerk.address,
      await treasury.getAddress()
    );
    expect(seller2.isValid()).is.true;
    await accountHandler.connect(assistant2).createSeller(seller2, emptyAuthToken, voucherInitValues);
    sellerId2 = seller2.id;

    buyerId = "4"; // First buyer to be auto-created
    buyerId2 = "5"; // Second buyer to be auto-created

    disputeResolver = mockDisputeResolver(
      await assistantDR.getAddress(),
      await adminDR.getAddress(),
      clerkDR.address,
      await treasuryDR.getAddress(),
      true
    );
    expect(disputeResolver.isValid()).is.true;

    DRFeeNative = "0";
    DRFeeToken = "0";
    disputeResolverFees = [
      new DisputeResolverFee(ZeroAddress, "Native", DRFeeNative),
      new DisputeResolverFee(await bosonToken.getAddress(), "Boson", DRFeeToken),
      new DisputeResolverFee(await mockToken.getAddress(), "Foreign20", DRFeeToken), // Add support for ERC20 tests
    ];

    // Any seller is allowed
    sellerAllowList = [];

    await accountHandler.connect(adminDR).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

    nextOfferId = "1";

    ({ offer, offerDates, offerDurations, offerFees } = await mockOffer());

    // Valid seller-created offer
    sellerCreatedOffer = offer.clone();
    sellerCreatedOffer.creator = OfferCreator.Seller;
    sellerCreatedOffer.buyerId = "0";

    //Valid buyer-created offer
    buyerCreatedOffer = offer.clone();
    buyerCreatedOffer.sellerId = "0";
    buyerCreatedOffer.creator = OfferCreator.Buyer;
    buyerCreatedOffer.buyerId = buyerId;
    buyerCreatedOffer.collectionIndex = "0";
    buyerCreatedOffer.royaltyInfo = [new RoyaltyInfo([], [])];

    offerDatesStruct = offerDates.toStruct();
    offerDurationsStruct = offerDurations.toStruct();
    offerFeesStruct = offerFees.toStruct();

    disputeResolutionTerms = new DisputeResolutionTerms(
      disputeResolver.id,
      disputeResolver.escalationResponsePeriod,
      DRFeeNative,
      applyPercentage(DRFeeNative, buyerEscalationDepositPercentage),
      ZeroAddress
    );
    disputeResolutionTermsStruct = disputeResolutionTerms.toStruct();

    agentId = "0";
    offerFeeLimit = MaxUint256;
  });

  afterEach(async function () {
    accountId.next(true);
  });

  context("📋 Buyer Offer Creation", async function () {
    context("👉 createOffer() - Buyer Created", async function () {
      it("should emit an OfferCreated event when buyer creates offer", async function () {
        await expect(
          offerHandler
            .connect(buyer1)
            .createOffer(
              buyerCreatedOffer,
              offerDates,
              offerDurations,
              { disputeResolverId: disputeResolver.id, mutualizerAddress: ZeroAddress },
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            nextOfferId,
            buyerCreatedOffer.sellerId, // Should be 0 for buyer-created offers
            compareOfferStructs.bind(buyerCreatedOffer.toStruct()),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await buyer1.getAddress()
          );
      });

      it("should update state correctly for buyer-created offers", async function () {
        await offerHandler
          .connect(buyer1)
          .createOffer(
            buyerCreatedOffer,
            offerDates,
            offerDurations,
            { disputeResolverId: disputeResolver.id, mutualizerAddress: ZeroAddress },
            agentId,
            offerFeeLimit
          );

        const [exists, storedOffer] = await offerHandler.getOffer(nextOfferId);
        expect(exists).to.be.true;

        const storedOfferDomain = Offer.fromStruct(storedOffer);
        expect(storedOfferDomain.creator).to.equal(OfferCreator.Buyer);
        expect(storedOfferDomain.buyerId).to.equal(buyerId);
        expect(storedOfferDomain.sellerId).to.equal("0");
        expect(storedOfferDomain.collectionIndex).to.equal("0");
        expect(storedOfferDomain.royaltyInfo).to.have.length(1);
        expect(storedOfferDomain.royaltyInfo[0].recipients).to.have.length(0);
        expect(storedOfferDomain.royaltyInfo[0].bps).to.have.length(0);
      });

      it("should allow multiple buyers to create offers", async function () {
        await offerHandler
          .connect(buyer1)
          .createOffer(
            buyerCreatedOffer,
            offerDates,
            offerDurations,
            { disputeResolverId: disputeResolver.id, mutualizerAddress: ZeroAddress },
            agentId,
            offerFeeLimit
          );

        const buyerCreatedOffer2 = buyerCreatedOffer.clone();
        buyerCreatedOffer2.buyerId = buyerId2;
        buyerCreatedOffer2.id = "2"; // Set expected offer ID

        await expect(
          offerHandler
            .connect(buyer2)
            .createOffer(
              buyerCreatedOffer2,
              offerDates,
              offerDurations,
              { disputeResolverId: disputeResolver.id, mutualizerAddress: ZeroAddress },
              agentId,
              offerFeeLimit
            )
        )
          .to.emit(offerHandler, "OfferCreated")
          .withArgs(
            "2", // offerId
            "0", // sellerId
            compareOfferStructs.bind(buyerCreatedOffer2.toStruct()),
            offerDatesStruct,
            offerDurationsStruct,
            disputeResolutionTermsStruct,
            offerFeesStruct,
            agentId,
            await buyer2.getAddress()
          );
      });

      it("should auto-create buyer when unregistered account creates offer", async function () {
        const tx = await offerHandler
          .connect(rando)
          .createOffer(
            buyerCreatedOffer,
            offerDates,
            offerDurations,
            { disputeResolverId: disputeResolver.id, mutualizerAddress: ZeroAddress },
            agentId,
            offerFeeLimit
          );

        await expect(tx).to.emit(offerHandler, "OfferCreated");
        await expect(tx).to.emit(accountHandler, "BuyerCreated");
      });

      it("should allow seller wallet to create buyer offer", async function () {
        const buyerOfferFromSeller = buyerCreatedOffer.clone();
        buyerOfferFromSeller.creator = OfferCreator.Buyer;
        buyerOfferFromSeller.buyerId = buyerId2;

        const tx = await offerHandler
          .connect(assistant)
          .createOffer(
            buyerOfferFromSeller,
            offerDates,
            offerDurations,
            { disputeResolverId: disputeResolver.id, mutualizerAddress: ZeroAddress },
            agentId,
            offerFeeLimit
          );

        await expect(tx).to.emit(offerHandler, "OfferCreated");
        await expect(tx).to.emit(accountHandler, "BuyerCreated");

        const nextOfferIdAfter = await offerHandler.getNextOfferId();
        const createdOfferId = (nextOfferIdAfter - BigInt(1)).toString();
        const [exists, offer] = await offerHandler.getOffer(createdOfferId);
        expect(exists).to.be.true;
        expect(offer.creator).to.equal(OfferCreator.Buyer);
        expect(offer.sellerId).to.equal("0");
      });

      context("💔 Revert Reasons", async function () {
        it("should revert if buyer specifies sellerId", async function () {
          buyerCreatedOffer.sellerId = sellerId;

          await expect(
            offerHandler
              .connect(buyer1)
              .createOffer(
                buyerCreatedOffer,
                offerDates,
                offerDurations,
                { disputeResolverId: disputeResolver.id, mutualizerAddress: ZeroAddress },
                agentId,
                offerFeeLimit
              )
          ).to.be.revertedWithCustomError(offerHandler, "InvalidBuyerOfferFields");
        });

        it("should revert if buyer specifies collectionIndex", async function () {
          buyerCreatedOffer.collectionIndex = "1";

          await expect(
            offerHandler
              .connect(buyer1)
              .createOffer(
                buyerCreatedOffer,
                offerDates,
                offerDurations,
                { disputeResolverId: disputeResolver.id, mutualizerAddress: ZeroAddress },
                agentId,
                offerFeeLimit
              )
          ).to.be.revertedWithCustomError(offerHandler, "InvalidBuyerOfferFields");
        });

        it("should revert if buyer specifies royaltyInfo", async function () {
          buyerCreatedOffer.royaltyInfo = [new RoyaltyInfo([ZeroAddress], ["100"])];

          await expect(
            offerHandler
              .connect(buyer1)
              .createOffer(
                buyerCreatedOffer,
                offerDates,
                offerDurations,
                { disputeResolverId: disputeResolver.id, mutualizerAddress: ZeroAddress },
                agentId,
                offerFeeLimit
              )
          ).to.be.revertedWithCustomError(offerHandler, "InvalidBuyerOfferFields");
        });

        it("should revert if non-seller tries to create seller offer", async function () {
          const sellerOffer = sellerCreatedOffer.clone();
          sellerOffer.creator = OfferCreator.Seller;

          await expect(
            offerHandler
              .connect(rando)
              .createOffer(
                sellerOffer,
                offerDates,
                offerDurations,
                { disputeResolverId: disputeResolver.id, mutualizerAddress: ZeroAddress },
                agentId,
                offerFeeLimit
              )
          ).to.be.revertedWithCustomError(offerHandler, "NotAssistant");
        });
      });
    });
  });

  context("💰 Buyer Fund Management", async function () {
    let actualBuyerId;

    beforeEach(async function () {
      // Create a buyer offer first - this will auto-create the buyer
      const tx = await offerHandler
        .connect(buyer1)
        .createOffer(
          buyerCreatedOffer,
          offerDates,
          offerDurations,
          { disputeResolverId: disputeResolver.id, mutualizerAddress: ZeroAddress },
          agentId,
          offerFeeLimit
        );

      const receipt = await tx.wait();
      const event = getEvent(receipt, accountHandler, "BuyerCreated");
      actualBuyerId = event.buyerId;
    });

    context("👉 depositFunds() - Buyer Deposits", async function () {
      it("should emit FundsDeposited event when buyer deposits native currency", async function () {
        const depositAmount = parseUnits("2", "ether");

        await expect(
          fundsHandler.connect(buyer1).depositFunds(actualBuyerId, ZeroAddress, depositAmount, {
            value: depositAmount,
          })
        )
          .to.emit(fundsHandler, "FundsDeposited")
          .withArgs(actualBuyerId, await buyer1.getAddress(), ZeroAddress, depositAmount);
      });

      it("should update state when buyer deposits native currency", async function () {
        const depositAmount = parseUnits("2", "ether");

        await fundsHandler.connect(buyer1).depositFunds(actualBuyerId, ZeroAddress, depositAmount, {
          value: depositAmount,
        });

        const buyerFundsArray = await fundsHandler.getAllAvailableFunds(actualBuyerId);
        expect(buyerFundsArray).to.have.lengthOf(1);
        expect(buyerFundsArray[0].tokenAddress).to.equal(ZeroAddress);
        expect(buyerFundsArray[0].tokenName).to.equal("Native currency");
        expect(buyerFundsArray[0].availableAmount).to.equal(depositAmount);
      });

      it("should allow buyer to deposit ERC20 tokens", async function () {
        const depositAmount = parseUnits("100", "ether");
        const tokenAddress = await mockToken.getAddress();

        // Mint tokens to buyer and approve protocol
        await mockToken.mint(await buyer1.getAddress(), depositAmount);
        await mockToken.connect(buyer1).approve(await fundsHandler.getAddress(), depositAmount);

        await expect(fundsHandler.connect(buyer1).depositFunds(actualBuyerId, tokenAddress, depositAmount))
          .to.emit(fundsHandler, "FundsDeposited")
          .withArgs(actualBuyerId, await buyer1.getAddress(), tokenAddress, depositAmount);

        const buyerFundsArray = await fundsHandler.getAllAvailableFunds(actualBuyerId);
        expect(buyerFundsArray).to.have.lengthOf(1);
        expect(buyerFundsArray[0].tokenAddress).to.equal(tokenAddress);
        expect(buyerFundsArray[0].tokenName).to.equal("Foreign20");
        expect(buyerFundsArray[0].availableAmount).to.equal(depositAmount);
      });

      context("💔 Revert Reasons", async function () {
        it("should revert if buyer ID does not exist", async function () {
          const invalidBuyerId = "999";
          const depositAmount = parseUnits("1", "ether");

          await expect(
            fundsHandler.connect(buyer1).depositFunds(invalidBuyerId, ZeroAddress, depositAmount, {
              value: depositAmount,
            })
          ).to.be.revertedWithCustomError(fundsHandler, "NoSuchSeller");
        });
      });
    });
  });

  context("🤝 Seller Commitment to Buyer Offers", async function () {
    let price, sellerDeposit, actualBuyerId;

    beforeEach(async function () {
      const tx = await offerHandler
        .connect(buyer1)
        .createOffer(
          buyerCreatedOffer,
          offerDates,
          offerDurations,
          { disputeResolverId: disputeResolver.id, mutualizerAddress: ZeroAddress },
          agentId,
          offerFeeLimit
        );

      const receipt = await tx.wait();
      const event = getEvent(receipt, accountHandler, "BuyerCreated");
      actualBuyerId = event ? event.buyerId : "4";

      price = buyerCreatedOffer.price;
      sellerDeposit = buyerCreatedOffer.sellerDeposit;

      // Buyer must deposit payment in advance using actual buyer ID
      await fundsHandler.connect(buyer1).depositFunds(actualBuyerId, ZeroAddress, price, {
        value: price,
      });
    });

    context("👉 commitToOffer() - Seller Commits", async function () {
      it("should emit SellerCommitted event when seller commits to buyer offer", async function () {
        const expectedExchangeId = "1";

        // Create seller parameters struct
        const sellerParams = {
          collectionIndex: 0,
          royaltyInfo: {
            recipients: [ZeroAddress],
            bps: [0],
          },
          mutualizerAddress: ZeroAddress,
        };

        const tx = await exchangeCommitHandler
          .connect(assistant)
          .commitToBuyerOffer(await assistant.getAddress(), nextOfferId, sellerParams, {
            value: sellerDeposit,
          });

        const receipt = await tx.wait();
        const event = getEvent(receipt, exchangeCommitHandler, "SellerCommitted");

        expect(event[0]).to.equal(BigInt(nextOfferId)); // offerId
        expect(event[1]).to.equal(BigInt(sellerId)); // sellerId
        expect(event[2]).to.equal(BigInt(expectedExchangeId)); // exchangeId
        expect(event[5]).to.equal(await assistant.getAddress()); // executedBy

        // Check exchange properties (event[3])
        const exchange = event[3];
        expect(exchange[0]).to.equal(BigInt(expectedExchangeId)); // exchange.id
        expect(exchange[1]).to.equal(BigInt(nextOfferId)); // exchange.offerId
        expect(exchange[2]).to.equal(actualBuyerId); // exchange.buyerId
        expect(exchange[3]).to.equal(0n); // exchange.sellerId (should be 0 initially, assigned later)

        // Check voucher properties (event[4])
        const voucher = event[4];
        expect(voucher[0]).to.be.gt(0); // voucher.committedDate
        expect(voucher[1]).to.be.gt(0); // voucher.validUntilDate
      });

      it("should update state correctly when seller commits to buyer offer", async function () {
        const expectedExchangeId = "1";

        // Create seller parameters struct
        const sellerParams = {
          collectionIndex: 0,
          royaltyInfo: {
            recipients: [ZeroAddress],
            bps: [0],
          },
          mutualizerAddress: ZeroAddress,
        };

        await exchangeCommitHandler
          .connect(assistant)
          .commitToBuyerOffer(await assistant.getAddress(), nextOfferId, sellerParams, {
            value: sellerDeposit,
          });

        const [existsExchange, exchange] = await exchangeHandler.getExchange(expectedExchangeId);
        expect(existsExchange).to.be.true;
        expect(exchange.buyerId).to.equal(actualBuyerId);

        const [existsOffer, updatedOffer] = await offerHandler.getOffer(nextOfferId);
        expect(existsOffer).to.be.true;
        expect(updatedOffer.sellerId).to.equal(sellerId);
      });

      it("should mint voucher to buyer when seller commits", async function () {
        const expectedExchangeId = "1";

        // Create seller parameters struct
        const sellerParams = {
          collectionIndex: 0,
          royaltyInfo: {
            recipients: [ZeroAddress],
            bps: [0],
          },
          mutualizerAddress: ZeroAddress,
        };

        await exchangeCommitHandler
          .connect(assistant)
          .commitToBuyerOffer(await assistant.getAddress(), nextOfferId, sellerParams, {
            value: sellerDeposit,
          });

        const [existsOffer, updatedOffer] = await offerHandler.getOffer(nextOfferId);
        expect(existsOffer).to.be.true;
        expect(updatedOffer.sellerId).to.equal(sellerId);

        const voucherTokenId = deriveTokenId(nextOfferId, expectedExchangeId);
        const voucherCloneAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          await calculateBosonProxyAddress(await accountHandler.getAddress()),
          seller.assistant,
          ZeroHash
        );
        const voucherContract = await getContractAt("IBosonVoucher", voucherCloneAddress);
        const voucherOwner = await voucherContract.ownerOf(voucherTokenId);
        expect(voucherOwner).to.equal(await buyer1.getAddress());
      });

      it("should handle multiple sellers committing to different buyer offers", async function () {
        const buyerCreatedOffer2 = buyerCreatedOffer.clone();
        buyerCreatedOffer2.buyerId = buyerId2;

        await offerHandler
          .connect(buyer2)
          .createOffer(
            buyerCreatedOffer2,
            offerDates,
            offerDurations,
            { disputeResolverId: disputeResolver.id, mutualizerAddress: ZeroAddress },
            agentId,
            offerFeeLimit
          );

        await fundsHandler.connect(buyer2).depositFunds(buyerId2, ZeroAddress, price, {
          value: price,
        });

        const sellerParams = {
          collectionIndex: 0,
          royaltyInfo: {
            recipients: [ZeroAddress],
            bps: [0],
          },
          mutualizerAddress: ZeroAddress,
        };

        await expect(
          exchangeCommitHandler.connect(assistant).commitToBuyerOffer(await assistant.getAddress(), "1", sellerParams, {
            value: sellerDeposit,
          })
        ).to.emit(exchangeCommitHandler, "SellerCommitted");

        await expect(
          exchangeCommitHandler
            .connect(assistant2)
            .commitToBuyerOffer(await assistant2.getAddress(), "2", sellerParams, {
              value: sellerDeposit,
            })
        ).to.emit(exchangeCommitHandler, "SellerCommitted");

        const [, exchange1] = await exchangeHandler.getExchange("1");
        const [, exchange2] = await exchangeHandler.getExchange("2");

        expect(exchange1.buyerId).to.equal(actualBuyerId);
        expect(exchange2.buyerId).to.equal(buyerId2);

        const [, offer1] = await offerHandler.getOffer("1");
        const [, offer2] = await offerHandler.getOffer("2");
        expect(offer1.sellerId).to.equal(sellerId);
        expect(offer2.sellerId).to.equal(sellerId2);
      });

      context("💔 Revert Reasons", async function () {
        it("should revert if seller has insufficient deposit funds", async function () {
          const insufficientDeposit = parseUnits("0.1", "ether"); // Less than required

          const sellerParams = {
            collectionIndex: 0,
            royaltyInfo: {
              recipients: [ZeroAddress],
              bps: [0],
            },
            mutualizerAddress: ZeroAddress,
          };

          await expect(
            exchangeCommitHandler
              .connect(assistant)
              .commitToBuyerOffer(await assistant.getAddress(), nextOfferId, sellerParams, {
                value: insufficientDeposit,
              })
          ).to.be.revertedWithCustomError(exchangeCommitHandler, "InsufficientValueReceived");
        });

        it("should revert if buyer has insufficient payment funds", async function () {
          const buyerCreatedOffer2 = buyerCreatedOffer.clone();
          buyerCreatedOffer2.buyerId = buyerId2;

          await offerHandler
            .connect(buyer2)
            .createOffer(
              buyerCreatedOffer2,
              offerDates,
              offerDurations,
              { disputeResolverId: disputeResolver.id, mutualizerAddress: ZeroAddress },
              agentId,
              offerFeeLimit
            );

          const sellerParams = {
            collectionIndex: 0,
            royaltyInfo: {
              recipients: [ZeroAddress],
              bps: [0],
            },
            mutualizerAddress: ZeroAddress,
          };

          await expect(
            exchangeCommitHandler
              .connect(assistant)
              .commitToBuyerOffer(await assistant.getAddress(), "2", sellerParams, {
                value: sellerDeposit,
              })
          ).to.be.revertedWithCustomError(exchangeCommitHandler, "InsufficientAvailableFunds");
        });

        it("should revert if non-seller tries to commit to buyer offer", async function () {
          const sellerParams = {
            collectionIndex: 0,
            royaltyInfo: {
              recipients: [ZeroAddress],
              bps: [0],
            },
            mutualizerAddress: ZeroAddress,
          };

          await expect(
            exchangeCommitHandler
              .connect(rando)
              .commitToBuyerOffer(await rando.getAddress(), nextOfferId, sellerParams, {
                value: sellerDeposit,
              })
          ).to.be.revertedWithCustomError(exchangeCommitHandler, "NotAssistant");
        });
      });
    });
  });

  context("🔄 Fund Flow Validation", async function () {
    let price, sellerDeposit;
    let tokenAddress;

    beforeEach(async function () {
      price = parseUnits("1.5", "ether");
      sellerDeposit = parseUnits("0.25", "ether");
      tokenAddress = await mockToken.getAddress();
    });

    context("👉 Native Currency Flows", async function () {
      beforeEach(async function () {
        // Create buyer offer with native currency
        buyerCreatedOffer.exchangeToken = ZeroAddress;
        buyerCreatedOffer.price = price.toString();
        buyerCreatedOffer.sellerDeposit = sellerDeposit.toString();

        await offerHandler
          .connect(buyer1)
          .createOffer(
            buyerCreatedOffer,
            offerDates,
            offerDurations,
            { disputeResolverId: disputeResolver.id, mutualizerAddress: ZeroAddress },
            agentId,
            offerFeeLimit
          );
      });

      it("should properly encumber buyer payment and seller deposit", async function () {
        let buyerFundsArray = await fundsHandler.getAllAvailableFunds(buyerId);
        let sellerFundsArray = await fundsHandler.getAllAvailableFunds(sellerId);
        // validate no funds initially
        expect(buyerFundsArray.length).to.equal(0);
        expect(sellerFundsArray.length).to.equal(0);

        await fundsHandler.connect(buyer1).depositFunds(buyerId, ZeroAddress, price, {
          value: price,
        });

        // buyer should have available funds
        buyerFundsArray = await fundsHandler.getAllAvailableFunds(buyerId);
        expect(buyerFundsArray).to.have.lengthOf(1);
        expect(buyerFundsArray[0].availableAmount).to.equal(price);

        const sellerParams = {
          collectionIndex: 0,
          royaltyInfo: {
            recipients: [ZeroAddress],
            bps: [0],
          },
          mutualizerAddress: ZeroAddress,
        };

        await exchangeCommitHandler
          .connect(assistant)
          .commitToBuyerOffer(await assistant.getAddress(), nextOfferId, sellerParams, {
            value: sellerDeposit,
          });

        // Check funds after commitment
        buyerFundsArray = await fundsHandler.getAllAvailableFunds(buyerId);
        sellerFundsArray = await fundsHandler.getAllAvailableFunds(sellerId);

        // Funds should be encumbered
        expect(buyerFundsArray.length).to.equal(0);
        expect(sellerFundsArray.length).to.equal(0);
      });
    });

    context("👉 ERC20 Token Flows", async function () {
      beforeEach(async function () {
        buyerCreatedOffer.exchangeToken = tokenAddress;
        buyerCreatedOffer.price = price.toString();
        buyerCreatedOffer.sellerDeposit = sellerDeposit.toString();

        await offerHandler
          .connect(buyer1)
          .createOffer(
            buyerCreatedOffer,
            offerDates,
            offerDurations,
            { disputeResolverId: disputeResolver.id, mutualizerAddress: ZeroAddress },
            agentId,
            offerFeeLimit
          );
      });

      it("should handle ERC20 token buyer payments and seller deposits", async function () {
        await mockToken.mint(await buyer1.getAddress(), price);
        await mockToken.connect(buyer1).approve(await fundsHandler.getAddress(), price);

        await mockToken.mint(await assistant.getAddress(), sellerDeposit);
        await mockToken.connect(assistant).approve(await exchangeCommitHandler.getAddress(), sellerDeposit);

        await fundsHandler.connect(buyer1).depositFunds(buyerId, tokenAddress, price);

        const sellerParams = {
          collectionIndex: 0,
          royaltyInfo: {
            recipients: [ZeroAddress],
            bps: [0],
          },
          mutualizerAddress: ZeroAddress,
        };

        await exchangeCommitHandler
          .connect(assistant)
          .commitToBuyerOffer(await assistant.getAddress(), nextOfferId, sellerParams);

        const [existsExchange, exchange] = await exchangeHandler.getExchange("1");
        expect(existsExchange).to.be.true;
        expect(exchange.buyerId).to.equal(buyerId);
        expect(exchange.offerId).to.equal(nextOfferId); // Exchange references the buyer-created offer
      });
    });
  });

  context("🔒 Regional Pause Functionality", async function () {
    beforeEach(async function () {
      await offerHandler
        .connect(buyer1)
        .createOffer(
          buyerCreatedOffer,
          offerDates,
          offerDurations,
          { disputeResolverId: disputeResolver.id, mutualizerAddress: ZeroAddress },
          agentId,
          offerFeeLimit
        );

      await fundsHandler.connect(buyer1).depositFunds(buyerId, ZeroAddress, buyerCreatedOffer.price, {
        value: buyerCreatedOffer.price,
      });
    });

    context("💔 Revert Reasons", async function () {
      it("should prevent buyer offer creation when offers region is paused", async function () {
        await pauseHandler.connect(pauser).pause([PausableRegion.Offers]);

        const newBuyerOffer = buyerCreatedOffer.clone();
        newBuyerOffer.buyerId = buyerId2;

        await expect(
          offerHandler
            .connect(buyer2)
            .createOffer(
              newBuyerOffer,
              offerDates,
              offerDurations,
              { disputeResolverId: disputeResolver.id, mutualizerAddress: ZeroAddress },
              agentId,
              offerFeeLimit
            )
        ).to.be.revertedWithCustomError(offerHandler, "RegionPaused");
      });

      it("should prevent seller commitment when exchanges region is paused", async function () {
        await pauseHandler.connect(pauser).pause([PausableRegion.Exchanges]);

        const sellerParams = {
          collectionIndex: 0,
          royaltyInfo: {
            recipients: [ZeroAddress],
            bps: [0],
          },
          mutualizerAddress: ZeroAddress,
        };

        await expect(
          exchangeCommitHandler
            .connect(assistant)
            .commitToBuyerOffer(await assistant.getAddress(), nextOfferId, sellerParams, {
              value: buyerCreatedOffer.sellerDeposit,
            })
        ).to.be.revertedWithCustomError(exchangeCommitHandler, "RegionPaused");
      });

      it("should prevent seller commitment when sellers region is paused", async function () {
        await pauseHandler.connect(pauser).pause([PausableRegion.Sellers]);

        const sellerParams = {
          collectionIndex: 0,
          royaltyInfo: {
            recipients: [ZeroAddress],
            bps: [0],
          },
          mutualizerAddress: ZeroAddress,
        };

        await expect(
          exchangeCommitHandler
            .connect(assistant)
            .commitToBuyerOffer(await assistant.getAddress(), nextOfferId, sellerParams, {
              value: buyerCreatedOffer.sellerDeposit,
            })
        ).to.be.revertedWithCustomError(exchangeCommitHandler, "RegionPaused");
      });
    });
  });

  context("Compatibility with Existing Flows", async function () {
    beforeEach(async function () {
      await offerHandler
        .connect(assistant)
        .createOffer(
          sellerCreatedOffer,
          offerDates,
          offerDurations,
          { disputeResolverId: disputeResolver.id, mutualizerAddress: ZeroAddress },
          agentId,
          offerFeeLimit
        );

      await offerHandler
        .connect(buyer1)
        .createOffer(
          buyerCreatedOffer,
          offerDates,
          offerDurations,
          { disputeResolverId: disputeResolver.id, mutualizerAddress: ZeroAddress },
          agentId,
          offerFeeLimit
        );

      await fundsHandler.connect(assistant).depositFunds(sellerId, ZeroAddress, sellerCreatedOffer.sellerDeposit, {
        value: sellerCreatedOffer.sellerDeposit,
      });

      await fundsHandler.connect(buyer1).depositFunds(buyerId, ZeroAddress, buyerCreatedOffer.price, {
        value: buyerCreatedOffer.price,
      });
    });

    it("should handle traditional buyer commitment to seller offer", async function () {
      const tx = await exchangeCommitHandler.connect(buyer1).commitToOffer(await buyer1.getAddress(), "1", {
        value: sellerCreatedOffer.price,
      });

      const receipt = await tx.wait();
      const event = getEvent(receipt, exchangeCommitHandler, "BuyerCommitted");
      expect(event).to.not.be.null;

      expect(event[0]).to.equal(BigInt("1")); // offerId
      expect(event[1]).to.equal(BigInt(buyerId)); // buyerId

      const actualExchangeId = event[2];
      expect(actualExchangeId).to.be.greaterThan(0);
      expect(event[5]).to.equal(await buyer1.getAddress());
    });

    it("should handle new seller commitment to buyer offer", async function () {
      const sellerParams = {
        collectionIndex: 0,
        royaltyInfo: {
          recipients: [ZeroAddress],
          bps: [0],
        },
        mutualizerAddress: ZeroAddress,
      };

      const tx = await exchangeCommitHandler
        .connect(assistant)
        .commitToBuyerOffer(await assistant.getAddress(), "2", sellerParams, {
          value: buyerCreatedOffer.sellerDeposit,
        });

      // Get the SellerCommitted event from transaction
      const receipt = await tx.wait();
      const event = getEvent(receipt, exchangeCommitHandler, "SellerCommitted");
      expect(event).to.not.be.null;

      // Verify event args
      expect(event[0]).to.equal(BigInt("2")); // offerId
      expect(event[1]).to.equal(BigInt(sellerId)); // sellerId
      // Don't hardcode exchangeId, use what was actually emitted
      const actualExchangeId = event[2];
      expect(actualExchangeId).to.be.greaterThan(0); // exchangeId should be positive
      expect(event[5]).to.equal(await assistant.getAddress()); // executedBy
    });

    it("should maintain separate exchange lifecycles for both flow types", async function () {
      // Commit to both offers
      await exchangeCommitHandler.connect(buyer1).commitToOffer(await buyer1.getAddress(), "1", {
        value: sellerCreatedOffer.price,
      });

      const sellerParams = {
        collectionIndex: 0,
        royaltyInfo: {
          recipients: [ZeroAddress],
          bps: [0],
        },
        mutualizerAddress: ZeroAddress,
      };

      await exchangeCommitHandler
        .connect(assistant)
        .commitToBuyerOffer(await assistant.getAddress(), "2", sellerParams, {
          value: buyerCreatedOffer.sellerDeposit,
        });

      const nextExchangeId = await exchangeHandler.getNextExchangeId();
      const exchange1Id = (nextExchangeId - BigInt(2)).toString(); // Second to last created
      const exchange2Id = (nextExchangeId - BigInt(1)).toString(); // Last created

      // Both exchanges should exist and be in committed state
      const [exists1, exchange1] = await exchangeHandler.getExchange(exchange1Id);
      const [exists2, exchange2] = await exchangeHandler.getExchange(exchange2Id);

      expect(exists1).to.be.true;
      expect(exists2).to.be.true;
      expect(exchange1.state).to.equal(ExchangeState.Committed);
      expect(exchange2.state).to.equal(ExchangeState.Committed);

      expect(exchange1.buyerId).to.equal(buyerId); // Traditional: buyer commits
      expect(exchange2.buyerId).to.equal(buyerId); // Buyer-initiated: seller commits

      // Verify correct offers are associated
      expect(exchange1.offerId).to.equal("1"); // Traditional seller offer
      expect(exchange2.offerId).to.equal("2"); // Buyer-initiated offer
    });
  });

  context("Edge Cases & Boundary Conditions", async function () {
    it("should handle boundary conditions - zero seller deposit amounts", async function () {
      buyerCreatedOffer.sellerDeposit = "0";

      await offerHandler
        .connect(buyer1)
        .createOffer(
          buyerCreatedOffer,
          offerDates,
          offerDurations,
          { disputeResolverId: disputeResolver.id, mutualizerAddress: ZeroAddress },
          agentId,
          offerFeeLimit
        );

      await fundsHandler.connect(buyer1).depositFunds(buyerId, ZeroAddress, buyerCreatedOffer.price, {
        value: buyerCreatedOffer.price,
      });

      const sellerParams = {
        collectionIndex: 0,
        royaltyInfo: {
          recipients: [ZeroAddress],
          bps: [0],
        },
        mutualizerAddress: ZeroAddress,
      };

      await expect(
        exchangeCommitHandler
          .connect(assistant)
          .commitToBuyerOffer(await assistant.getAddress(), nextOfferId, sellerParams)
      ).to.emit(exchangeCommitHandler, "SellerCommitted");
    });

    context("💔 Revert Reasons", async function () {
      it("should revert when buyer tries to commit to their own offer", async function () {
        await offerHandler
          .connect(buyer1)
          .createOffer(
            buyerCreatedOffer,
            offerDates,
            offerDurations,
            { disputeResolverId: disputeResolver.id, mutualizerAddress: ZeroAddress },
            agentId,
            offerFeeLimit
          );

        await fundsHandler.connect(buyer1).depositFunds(buyerId, ZeroAddress, buyerCreatedOffer.price, {
          value: buyerCreatedOffer.price,
        });

        const sellerParams = {
          collectionIndex: 0,
          royaltyInfo: {
            recipients: [ZeroAddress],
            bps: [0],
          },
          mutualizerAddress: ZeroAddress,
        };

        await expect(
          exchangeCommitHandler
            .connect(buyer1)
            .commitToBuyerOffer(await buyer1.getAddress(), nextOfferId, sellerParams, {
              value: buyerCreatedOffer.sellerDeposit,
            })
        ).to.be.revertedWithCustomError(exchangeCommitHandler, "NotAssistant");
      });
    });
  });

  context("👑 Royalty Info", async function () {
    beforeEach(async function () {
      await offerHandler
        .connect(buyer1)
        .createOffer(
          buyerCreatedOffer,
          offerDates,
          offerDurations,
          { disputeResolverId: disputeResolver.id, mutualizerAddress: ZeroAddress },
          agentId,
          offerFeeLimit
        );

      await fundsHandler.connect(buyer1).depositFunds(buyerId, ZeroAddress, buyerCreatedOffer.price, {
        value: buyerCreatedOffer.price,
      });
    });

    it("should set default royalty info when seller commits to buyer offer", async function () {
      const [existsBefore, offerBefore] = await offerHandler.getOffer(nextOfferId);
      expect(existsBefore).to.be.true;
      expect(offerBefore.royaltyInfo).to.have.length(1);
      expect(offerBefore.royaltyInfo[0].recipients).to.have.length(0);
      expect(offerBefore.royaltyInfo[0].bps).to.have.length(0);

      const sellerParams = {
        collectionIndex: 0,
        royaltyInfo: {
          recipients: [ZeroAddress],
          bps: [0],
        },
        mutualizerAddress: ZeroAddress,
      };

      await exchangeCommitHandler
        .connect(assistant)
        .commitToBuyerOffer(await assistant.getAddress(), nextOfferId, sellerParams, {
          value: buyerCreatedOffer.sellerDeposit,
        });

      const [existsAfter, offerAfter] = await offerHandler.getOffer(nextOfferId);
      expect(existsAfter).to.be.true;
      expect(offerAfter.sellerId).to.equal(sellerId); // Seller should be assigned
      expect(offerAfter.royaltyInfo).to.have.length(1); // Royalty info should be added

      const royaltyInfo = offerAfter.royaltyInfo[0];
      expect(royaltyInfo.recipients).to.have.length(1);
      expect(royaltyInfo.recipients[0]).to.equal(ZeroAddress); // Protocol uses address(0) to represent treasury
      expect(royaltyInfo.bps).to.have.length(1);
      expect(royaltyInfo.bps[0]).to.equal(0);
    });
  });

  context("🔍 Price Discovery for Buyer Offers", async function () {
    let buyerCreatedPriceDiscoveryOffer;

    beforeEach(async function () {
      buyerCreatedPriceDiscoveryOffer = buyerCreatedOffer.clone();
      buyerCreatedPriceDiscoveryOffer.priceType = PriceType.Discovery;
      buyerCreatedPriceDiscoveryOffer.price = "0";
      buyerCreatedPriceDiscoveryOffer.buyerCancelPenalty = "0";
      // Note: quantityAvailable must be 1 for buyer-created offers

      await offerHandler
        .connect(buyer1)
        .createOffer(
          buyerCreatedPriceDiscoveryOffer,
          offerDates,
          offerDurations,
          { disputeResolverId: disputeResolver.id, mutualizerAddress: ZeroAddress },
          agentId,
          offerFeeLimit
        );

      await fundsHandler
        .connect(assistant)
        .depositFunds(sellerId, ZeroAddress, buyerCreatedPriceDiscoveryOffer.sellerDeposit, {
          value: buyerCreatedPriceDiscoveryOffer.sellerDeposit,
        });
    });

    context("👉 Seller Commits to Buyer Price Discovery Offer", async function () {
      let priceDiscovery, price;

      beforeEach(async function () {
        price = parseUnits("0.1", "ether");
        const priceDiscoveryData = "0x1234";
        const priceDiscoveryContractAddress = await priceDiscoveryContract.getAddress();

        priceDiscovery = new PriceDiscovery(
          price,
          Side.Ask,
          priceDiscoveryContractAddress,
          priceDiscoveryContractAddress,
          priceDiscoveryData
        );

        await weth.connect(buyer1).deposit({ value: price });
        await weth.connect(buyer1).approve(await priceDiscoveryHandler.getAddress(), price);
        await weth.connect(assistant).approve(await priceDiscoveryHandler.getAddress(), price);
      });

      context("💔 Revert Reasons", async function () {
        it("should revert if non-seller tries to commit to buyer price discovery offer", async function () {
          await expect(
            priceDiscoveryHandler
              .connect(rando)
              .commitToPriceDiscoveryOffer(await rando.getAddress(), nextOfferId, priceDiscovery)
          ).to.be.revertedWithCustomError(priceDiscoveryHandler, "NotAssistant");
        });

        it("should revert if buyers region is paused", async function () {
          await pauseHandler.connect(pauser).pause([PausableRegion.Buyers]);

          await expect(
            priceDiscoveryHandler
              .connect(assistant)
              .commitToPriceDiscoveryOffer(await assistant.getAddress(), nextOfferId, priceDiscovery)
          ).to.be.revertedWithCustomError(priceDiscoveryHandler, "RegionPaused");
        });

        it("should revert if sellers region is paused", async function () {
          await pauseHandler.connect(pauser).pause([PausableRegion.Sellers]);

          await expect(
            priceDiscoveryHandler
              .connect(assistant)
              .commitToPriceDiscoveryOffer(await assistant.getAddress(), nextOfferId, priceDiscovery)
          ).to.be.revertedWithCustomError(priceDiscoveryHandler, "RegionPaused");
        });

        it("should revert if exchanges region is paused", async function () {
          await pauseHandler.connect(pauser).pause([PausableRegion.Exchanges]);

          await expect(
            priceDiscoveryHandler
              .connect(assistant)
              .commitToPriceDiscoveryOffer(await assistant.getAddress(), nextOfferId, priceDiscovery)
          ).to.be.revertedWithCustomError(priceDiscoveryHandler, "RegionPaused");
        });
      });
    });
  });
});
