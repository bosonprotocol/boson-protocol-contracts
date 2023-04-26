const hre = require("hardhat");
const { ethers } = hre;
const { BigNumber, constants } = ethers;
const { RevertReasons } = require("../../../scripts/config/revert-reasons");

const {
  calculateContractAddress,
  deriveTokenId,
  getCurrentBlockAndSetTimeForward,
  setupTestEnvironment,
  revertToSnapshot,
  getSnapshot,
} = require("../../util/utils");
const { oneWeek } = require("../../util/constants");
const {
  mockSeller,
  mockAuthToken,
  mockVoucherInitValues,
  mockOffer,
  mockDisputeResolver,
  accountId,
} = require("../../util/mock");
const { expect } = require("chai");
const { DisputeResolverFee } = require("../../../scripts/domain/DisputeResolverFee");
const PriceType = require("../../../scripts/domain/PriceType");
const PriceDiscovery = require("../../../scripts/domain/PriceDiscovery");
const Side = require("../../../scripts/domain/Side");

const MASK = BigNumber.from(2).pow(128).sub(1);

describe("[@skip-on-coverage] auction integration", function () {
  accountId.next(true);
  this.timeout(100000000);
  let bosonVoucher;
  let assistant, buyer, DR, rando;
  let offer, offerDates;
  let exchangeHandler;
  let weth;
  let seller;
  let snapshotId;

  before(async function () {
    // Specify contracts needed for this test
    const contracts = {
      accountHandler: "IBosonAccountHandler",
      offerHandler: "IBosonOfferHandler",
      fundsHandler: "IBosonFundsHandler",
      exchangeHandler: "IBosonExchangeHandler",
    };

    const wethFactory = await ethers.getContractFactory("WETH9");
    weth = await wethFactory.deploy();
    await weth.deployed();

    let accountHandler, offerHandler, fundsHandler;

    ({
      signers: [assistant, buyer, DR, rando],
      contractInstances: { accountHandler, offerHandler, fundsHandler, exchangeHandler },
      extraReturnValues: { bosonVoucher },
    } = await setupTestEnvironment(contracts, { wethAddress: weth.address }));

    seller = mockSeller(assistant.address, assistant.address, assistant.address, assistant.address);

    const emptyAuthToken = mockAuthToken();
    const voucherInitValues = mockVoucherInitValues();
    await accountHandler.connect(assistant).createSeller(seller, emptyAuthToken, voucherInitValues);

    const disputeResolver = mockDisputeResolver(DR.address, DR.address, DR.address, DR.address, true);

    const disputeResolverFees = [
      new DisputeResolverFee(constants.AddressZero, "Native Currency", "0"),
      new DisputeResolverFee(weth.address, "WETH", "0"),
    ];
    const sellerAllowList = [seller.id];

    await accountHandler.connect(DR).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

    let offerDurations, disputeResolverId;
    ({ offer, offerDates, offerDurations, disputeResolverId } = await mockOffer());
    offer.quantityAvailable = 10;
    offer.priceType = PriceType.Discovery;
    // offer.exchangeToken = weth.address;

    await offerHandler
      .connect(assistant)
      .createOffer(offer.toStruct(), offerDates.toStruct(), offerDurations.toStruct(), disputeResolverId, "0");

    const voucherAddress = calculateContractAddress(accountHandler.address, seller.id);
    bosonVoucher = await ethers.getContractAt("BosonVoucher", voucherAddress);

    // Pre mint range
    await offerHandler.connect(assistant).reserveRange(offer.id, offer.quantityAvailable, assistant.address);
    await bosonVoucher.connect(assistant).preMint(offer.id, offer.quantityAvailable);

    // Deposit seller funds so the commit will succeed
    await fundsHandler
      .connect(assistant)
      .depositFunds(seller.id, constants.AddressZero, offer.sellerDeposit, { value: offer.sellerDeposit });

    // Get snapshot id
    snapshotId = await getSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();
  });

  context("Zora auction", async function () {
    let tokenId, zoraAuction, amount, auctionId;

    beforeEach(async function () {
      // 1. Deploy Zora Auction
      const ZoraAuctionFactory = await ethers.getContractFactory("AuctionHouse");
      zoraAuction = await ZoraAuctionFactory.deploy(weth.address);

      // 2. Set approval for all
      tokenId = deriveTokenId(offer.id, 2);
      await bosonVoucher.connect(assistant).setApprovalForAll(zoraAuction.address, true);

      // 3. Create an auction
      const tokenContract = bosonVoucher.address;
      const duration = oneWeek;
      const reservePrice = 1;
      const curator = ethers.constants.AddressZero;
      const curatorFeePercentage = 0;
      const auctionCurrency = offer.exchangeToken;

      await zoraAuction
        .connect(assistant)
        .createAuction(tokenId, tokenContract, duration, reservePrice, curator, curatorFeePercentage, auctionCurrency);

      // 4. Bid
      auctionId = 0;
      amount = 10;
      await zoraAuction.connect(buyer).createBid(auctionId, amount, { value: amount });

      // 5. Set time forward
      await getCurrentBlockAndSetTimeForward(oneWeek);

      // Zora should be the owner of the token
      expect(await bosonVoucher.ownerOf(tokenId)).to.equal(zoraAuction.address);
    });

    // Zora uses safeTransferFrom and WETH doesn't support it
    it("Should revert when seller is not using wrappers offer is native currency", async function () {
      // Caller should approve WETH because price discovery bids doesn't work with native currency
      await weth.connect(assistant).approve(exchangeHandler.address, amount);

      //  Encode calldata for endAuction
      const calldata = zoraAuction.interface.encodeFunctionData("endAuction", [auctionId]);
      const priceDiscovery = new PriceDiscovery(amount, zoraAuction.address, calldata, Side.Bid);

      //  Commit to offer, expecting revert
      await expect(
        exchangeHandler.connect(assistant).commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery)
      ).to.be.revertedWith(RevertReasons.INSUFFICIENT_VALUE_RECEIVED);
    });

    // Buyes doesn't get buyer protection
    it("Auction ends normally if finalise directly into Zora", async function () {
      const protocolBalanceBefore = await ethers.provider.getBalance(exchangeHandler.address);

      await zoraAuction.connect(rando).endAuction(auctionId);

      expect(await bosonVoucher.ownerOf(tokenId)).to.equal(buyer.address);
      expect(await ethers.provider.getBalance(exchangeHandler.address)).to.equal(protocolBalanceBefore.add(amount));

      const exchangeId = tokenId.and(MASK);
      const [exist, ,] = await exchangeHandler.getExchange(exchangeId);

      expect(exist).to.equal(true);
    });
  });
});
