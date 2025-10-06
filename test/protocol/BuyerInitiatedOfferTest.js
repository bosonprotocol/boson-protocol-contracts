const { ethers } = require("hardhat");
const {
  getContractAt,
  ZeroAddress,
  ZeroHash,
  getSigners,
  MaxUint256,
  parseUnits,
  encodeBytes32String,
  getContractFactory,
} = ethers;
const { expect } = require("chai");

const Offer = require("../../scripts/domain/Offer");
const OfferCreator = require("../../scripts/domain/OfferCreator");
const PriceType = require("../../scripts/domain/PriceType");
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
  mockBuyer,
  mockVoucherInitValues,
  mockAuthToken,
  accountId,
} = require("../util/mock");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");

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
  let accountHandler, fundsHandler, exchangeHandler, exchangeCommitHandler, offerHandler, pauseHandler;
  let seller, seller2;
  let offer, offerDates, offerDurations, offerFees;
  let buyerCreatedOffer, sellerCreatedOffer;
  let mockToken;
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
  let weth;

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

    const wethFactory = await getContractFactory("WETH9");
    weth = await wethFactory.deploy();
    await weth.waitForDeployment();

    const contracts = {
      accessController: "AccessController",
      accountHandler: "IBosonAccountHandler",
      offerHandler: "IBosonOfferHandler",
      exchangeHandler: "IBosonExchangeHandler",
      exchangeCommitHandler: "IBosonExchangeCommitHandler",
      fundsHandler: "IBosonFundsHandler",
      disputeHandler: "IBosonDisputeHandler",
      pauseHandler: "IBosonPauseHandler",
      sequentialCommitHandler: "IBosonSequentialCommitHandler",
    };

    [mockToken] = await deployMockTokens(["Foreign20"]);

    ({
      signers: [pauser, admin, treasury, rando, adminDR, treasuryDR, assistant2],
      contractInstances: {
        accountHandler,
        offerHandler,
        exchangeHandler,
        exchangeCommitHandler,
        fundsHandler,
        pauseHandler,
      },
      protocolConfig: [, , , , buyerEscalationDepositPercentage],
    } = await setupTestEnvironment(contracts, { wethAddress: await weth.getAddress() }));

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

    const buyer = mockBuyer(await buyer1.getAddress());
    expect(buyer.isValid()).is.true;
    await accountHandler.connect(buyer1).createBuyer(buyer);
    buyerId = buyer.id;

    const buyerEntity2 = mockBuyer(await buyer2.getAddress());
    expect(buyerEntity2.isValid()).is.true;
    await accountHandler.connect(buyer2).createBuyer(buyerEntity2);
    buyerId2 = buyerEntity2.id;

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
      new DisputeResolverFee(await mockToken.getAddress(), "Foreign20", DRFeeToken),
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

        it("should revert if buyer specifies Discovery price type", async function () {
          buyerCreatedOffer.priceType = PriceType.Discovery;

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
      });
    });
  });

  context("💰 Buyer Fund Management", async function () {
    context("👉 depositFunds() - Buyer Deposits", async function () {
      it("should emit FundsDeposited event when buyer deposits native currency", async function () {
        const depositAmount = parseUnits("2", "ether");

        await expect(
          fundsHandler.connect(buyer1).depositFunds(buyerId, ZeroAddress, depositAmount, {
            value: depositAmount,
          })
        )
          .to.emit(fundsHandler, "FundsDeposited")
          .withArgs(buyerId, await buyer1.getAddress(), ZeroAddress, depositAmount);
      });

      it("should update state when buyer deposits native currency", async function () {
        const depositAmount = parseUnits("2", "ether");

        await fundsHandler.connect(buyer1).depositFunds(buyerId, ZeroAddress, depositAmount, {
          value: depositAmount,
        });

        const buyerFundsArray = await fundsHandler.getAllAvailableFunds(buyerId);
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

        await expect(fundsHandler.connect(buyer1).depositFunds(buyerId, tokenAddress, depositAmount))
          .to.emit(fundsHandler, "FundsDeposited")
          .withArgs(buyerId, await buyer1.getAddress(), tokenAddress, depositAmount);

        const buyerFundsArray = await fundsHandler.getAllAvailableFunds(buyerId);
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
          ).to.be.revertedWithCustomError(fundsHandler, "NoSuchEntity");
        });
      });
    });
  });

  context("🤝 Seller Commitment to Buyer Offers", async function () {
    let price, sellerDeposit;

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

      price = buyerCreatedOffer.price;
      sellerDeposit = buyerCreatedOffer.sellerDeposit;

      // Buyer must deposit payment in advance
      await fundsHandler.connect(buyer1).depositFunds(buyerId, ZeroAddress, price, {
        value: price,
      });
    });

    context("👉 commitToOffer() - Seller Commits", async function () {
      it("should emit SellerCommitted, FundsDeposited, and FundsEncumbered events when seller commits to buyer offer", async function () {
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

        const tx = await exchangeCommitHandler.connect(assistant).commitToBuyerOffer(nextOfferId, sellerParams, {
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
        expect(exchange[2]).to.equal(buyerId); // exchange.buyerId
        expect(exchange[3]).to.equal(0n); // exchange.sellerId (should be 0 initially, assigned later)

        // Check voucher properties (event[4])
        const voucher = event[4];
        expect(voucher[0]).to.be.gt(0); // voucher.committedDate
        expect(voucher[1]).to.be.gt(0); // voucher.validUntilDate

        await expect(tx)
          .to.emit(fundsHandler, "FundsDeposited")
          .withArgs(sellerId, assistant.address, offer.exchangeToken, offer.sellerDeposit);
        await expect(tx)
          .to.emit(fundsHandler, "FundsEncumbered")
          .withArgs(sellerId, offer.exchangeToken, offer.sellerDeposit, assistant.address);
      });

      it("should update state correctly when seller commits to buyer offer", async function () {
        const expectedExchangeId = "1";

        const externalId = "Brand1";
        voucherInitValues.collectionSalt = encodeBytes32String(externalId);
        await accountHandler.connect(assistant).createNewCollection(externalId, voucherInitValues);

        const sellerParams = {
          collectionIndex: 1, // new collection index
          royaltyInfo: {
            recipients: [ZeroAddress],
            bps: [0],
          },
          mutualizerAddress: ZeroAddress,
        };

        await exchangeCommitHandler.connect(assistant).commitToBuyerOffer(nextOfferId, sellerParams, {
          value: sellerDeposit,
        });

        const [existsExchange, exchange] = await exchangeHandler.getExchange(expectedExchangeId);
        expect(existsExchange).to.be.true;
        expect(exchange.buyerId).to.equal(buyerId);

        const [existsOffer, updatedOffer] = await offerHandler.getOffer(nextOfferId);
        expect(existsOffer).to.be.true;
        expect(updatedOffer.sellerId).to.equal(sellerId);
        expect(updatedOffer.collectionIndex).to.equal(1);
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

        await exchangeCommitHandler.connect(assistant).commitToBuyerOffer(nextOfferId, sellerParams, {
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
          exchangeCommitHandler.connect(assistant).commitToBuyerOffer("1", sellerParams, {
            value: sellerDeposit,
          })
        ).to.emit(exchangeCommitHandler, "SellerCommitted");

        await expect(
          exchangeCommitHandler.connect(assistant2).commitToBuyerOffer("2", sellerParams, {
            value: sellerDeposit,
          })
        ).to.emit(exchangeCommitHandler, "SellerCommitted");

        const [, exchange1] = await exchangeHandler.getExchange("1");
        const [, exchange2] = await exchangeHandler.getExchange("2");

        expect(exchange1.buyerId).to.equal(buyerId);
        expect(exchange2.buyerId).to.equal(buyerId2);

        const [, offer1] = await offerHandler.getOffer("1");
        const [, offer2] = await offerHandler.getOffer("2");
        expect(offer1.sellerId).to.equal(sellerId);
        expect(offer2.sellerId).to.equal(sellerId2);
      });

      it("should execute mutualizer address assignment when provided in seller params", async function () {
        const DRFeeNative = parseUnits("0.1", "ether");
        const disputeResolverFees = [new DisputeResolverFee(ZeroAddress, "Native", DRFeeNative)];
        await accountHandler.connect(adminDR).removeFeesFromDisputeResolver(disputeResolver.id, [ZeroAddress]);
        await accountHandler.connect(adminDR).addFeesToDisputeResolver(disputeResolver.id, disputeResolverFees);

        const protocolAddress = await exchangeHandler.getAddress();

        // Deploy mock forwarder for meta-transactions (required by DRFeeMutualizer)
        const MockForwarder = await getContractFactory("MockForwarder");
        const mockForwarder = await MockForwarder.deploy();
        await mockForwarder.waitForDeployment();

        const DRFeeMutualizerFactory = await getContractFactory("DRFeeMutualizer");
        const drFeeMutualizer = await DRFeeMutualizerFactory.deploy(
          protocolAddress,
          await mockForwarder.getAddress(),
          await weth.getAddress()
        );
        await drFeeMutualizer.waitForDeployment();

        // Fund mutualizer with ETH for testing using the deposit function
        await drFeeMutualizer.deposit(ZeroAddress, parseUnits("2", "ether"), {
          value: parseUnits("2", "ether"),
        });

        // Create a simple agreement for the seller to be covered
        const sellerId = "1"; // Standard seller ID
        const maxAmountPerTx = parseUnits("1", "ether");
        const maxAmountTotal = parseUnits("10", "ether");
        const timePeriod = 365 * 24 * 60 * 60; // 1 year
        const premium = parseUnits("0.1", "ether");

        // Create agreement for native currency (ZeroAddress) with universal dispute resolver (0)
        const tx = await drFeeMutualizer.newAgreement(
          sellerId,
          ZeroAddress,
          0, // Universal dispute resolver
          maxAmountPerTx,
          maxAmountTotal,
          timePeriod,
          premium,
          false // refundOnCancel
        );

        const receipt = await tx.wait();
        const agreementCreatedEvent = receipt.logs.find(
          (log) => log.fragment && log.fragment.name === "AgreementCreated"
        );
        const agreementId = agreementCreatedEvent.args.agreementId;

        await drFeeMutualizer.payPremium(agreementId, sellerId, {
          value: premium,
        });

        const sellerParams = {
          collectionIndex: 0,
          royaltyInfo: {
            recipients: [ZeroAddress],
            bps: [0],
          },
          mutualizerAddress: await drFeeMutualizer.getAddress(),
        };

        await expect(
          exchangeCommitHandler.connect(assistant).commitToBuyerOffer(nextOfferId, sellerParams, {
            value: sellerDeposit,
          })
        ).to.emit(exchangeCommitHandler, "SellerCommitted");

        const nextExchangeId = await exchangeHandler.getNextExchangeId();
        const createdExchangeId = (nextExchangeId - BigInt(1)).toString();
        const [existsExchange] = await exchangeHandler.getExchange(createdExchangeId);
        expect(existsExchange).to.be.true;
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
            exchangeCommitHandler.connect(assistant).commitToBuyerOffer(nextOfferId, sellerParams, {
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
            exchangeCommitHandler.connect(assistant).commitToBuyerOffer("2", sellerParams, {
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
            exchangeCommitHandler.connect(rando).commitToBuyerOffer(nextOfferId, sellerParams, {
              value: sellerDeposit,
            })
          ).to.be.revertedWithCustomError(exchangeCommitHandler, "NotAssistant");
        });

        it("should revert if collection index exceeds seller's additional collections", async function () {
          const sellerParams = {
            collectionIndex: 1, // Seller has no additional collections (only default collection 0)
            royaltyInfo: {
              recipients: [ZeroAddress],
              bps: [0],
            },
            mutualizerAddress: ZeroAddress,
          };

          await expect(
            exchangeCommitHandler.connect(assistant).commitToBuyerOffer(nextOfferId, sellerParams, {
              value: sellerDeposit,
            })
          ).to.be.revertedWithCustomError(exchangeCommitHandler, "NoSuchCollection");
        });

        it("should revert if mutualizer is EOA", async function () {
          const sellerParams = {
            collectionIndex: 0,
            royaltyInfo: {
              recipients: [ZeroAddress],
              bps: [0],
            },
            mutualizerAddress: assistant.address,
          };

          await expect(
            exchangeCommitHandler.connect(assistant).commitToBuyerOffer(nextOfferId, sellerParams, {
              value: sellerDeposit,
            })
          ).to.be.revertedWithCustomError(exchangeCommitHandler, RevertReasons.UNSUPPORTED_MUTUALIZER);
        });

        it("should revert if mutualizer does not support IDRFeeMutualizer interface", async function () {
          const sellerParams = {
            collectionIndex: 0,
            royaltyInfo: {
              recipients: [ZeroAddress],
              bps: [0],
            },
            mutualizerAddress: await mockToken.getAddress(),
          };

          await expect(
            exchangeCommitHandler.connect(assistant).commitToBuyerOffer(nextOfferId, sellerParams, {
              value: sellerDeposit,
            })
          ).to.be.revertedWithCustomError(exchangeCommitHandler, RevertReasons.UNSUPPORTED_MUTUALIZER);
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

        await exchangeCommitHandler.connect(assistant).commitToBuyerOffer(nextOfferId, sellerParams, {
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

        await exchangeCommitHandler.connect(assistant).commitToBuyerOffer(nextOfferId, sellerParams);

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
          exchangeCommitHandler.connect(assistant).commitToBuyerOffer(nextOfferId, sellerParams, {
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
          exchangeCommitHandler.connect(assistant).commitToBuyerOffer(nextOfferId, sellerParams, {
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

      const tx = await exchangeCommitHandler.connect(assistant).commitToBuyerOffer("2", sellerParams, {
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

      await exchangeCommitHandler.connect(assistant).commitToBuyerOffer("2", sellerParams, {
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

      await expect(exchangeCommitHandler.connect(assistant).commitToBuyerOffer(nextOfferId, sellerParams)).to.emit(
        exchangeCommitHandler,
        "SellerCommitted"
      );
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

      await exchangeCommitHandler.connect(assistant).commitToBuyerOffer(nextOfferId, sellerParams, {
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

  context("Voiding Buyer-Initiated Offers", async function () {
    beforeEach(async function () {
      // Create a buyer-initiated offer
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

    it("should allow buyer to void their own buyer-initiated offer", async function () {
      // Check offer exists and is not voided before
      const [existsBefore, offerBefore] = await offerHandler.getOffer(nextOfferId);
      expect(existsBefore).to.be.true;
      expect(offerBefore.voided).to.be.false;

      // Buyer should be able to void the offer
      await expect(offerHandler.connect(buyer1).voidOffer(nextOfferId))
        .to.emit(offerHandler, "OfferVoided")
        .withArgs(nextOfferId, buyerId, buyer1.address); // creatorId should be buyerId for buyer-created offers

      // Check offer is now voided
      const [existsAfter, offerAfter] = await offerHandler.getOffer(nextOfferId);
      expect(existsAfter).to.be.true;
      expect(offerAfter.voided).to.be.true;
    });

    it("should prevent random user from voiding buyer-initiated offer", async function () {
      // Random user should not be able to void buyer-created offer
      await expect(offerHandler.connect(rando).voidOffer(nextOfferId)).to.be.revertedWithCustomError(
        offerHandler,
        "NotOfferCreator"
      );
    });

    it("should work with voidOfferBatch for buyer-initiated offers", async function () {
      // Get the ID for the second offer we're about to create
      const secondOfferId = await offerHandler.getNextOfferId();

      // Create another buyer-initiated offer
      const secondOffer = { ...buyerCreatedOffer, id: 0 };
      await offerHandler
        .connect(buyer1)
        .createOffer(
          secondOffer,
          offerDates,
          offerDurations,
          { disputeResolverId: disputeResolver.id, mutualizerAddress: ZeroAddress },
          agentId,
          offerFeeLimit
        );

      await fundsHandler.connect(buyer1).depositFunds(buyerId, ZeroAddress, secondOffer.price, {
        value: secondOffer.price,
      });

      // Void both offers in batch
      await expect(offerHandler.connect(buyer1).voidOfferBatch([nextOfferId, secondOfferId]))
        .to.emit(offerHandler, "OfferVoided")
        .withArgs(nextOfferId, buyerId, buyer1.address)
        .to.emit(offerHandler, "OfferVoided")
        .withArgs(secondOfferId, buyerId, buyer1.address);

      // Check both offers are voided
      const [exists1, offer1] = await offerHandler.getOffer(nextOfferId);
      const [exists2, offer2] = await offerHandler.getOffer(secondOfferId);
      expect(exists1).to.be.true;
      expect(exists2).to.be.true;
      expect(offer1.voided).to.be.true;
      expect(offer2.voided).to.be.true;
    });
  });
});
