const { ethers } = require("hardhat");
const { ZeroAddress, getContractFactory, getContractAt } = ethers;
const { RevertReasons } = require("../../../scripts/config/revert-reasons");

const {
  deriveTokenId,
  getCurrentBlockAndSetTimeForward,
  setupTestEnvironment,
  revertToSnapshot,
  getSnapshot,
  calculateBosonProxyAddress,
  calculateCloneAddress,
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

const MASK = (1n << 128n) - 1n;

describe("[@skip-on-coverage] auction integration", function () {
  let bosonVoucher;
  let assistant, buyer, DR, rando;
  let offer, offerDates;
  let exchangeHandler;
  let weth;
  let seller;
  let snapshotId;

  before(async function () {
    accountId.next(true);

    // Specify contracts needed for this test
    const contracts = {
      accountHandler: "IBosonAccountHandler",
      offerHandler: "IBosonOfferHandler",
      fundsHandler: "IBosonFundsHandler",
      exchangeHandler: "IBosonExchangeHandler",
      priceDiscoveryHandler: "IBosonPriceDiscoveryHandler",
    };

    const wethFactory = await getContractFactory("WETH9");
    weth = await wethFactory.deploy();
    await weth.waitForDeployment();

    let accountHandler, offerHandler, fundsHandler;

    ({
      signers: [assistant, buyer, DR, rando],
      contractInstances: { accountHandler, offerHandler, fundsHandler, exchangeHandler },
      extraReturnValues: { bosonVoucher },
    } = await setupTestEnvironment(contracts, { wethAddress: await weth.getAddress() }));

    seller = mockSeller(assistant.address, assistant.address, ZeroAddress, assistant.address);

    const emptyAuthToken = mockAuthToken();
    const voucherInitValues = mockVoucherInitValues();
    await accountHandler.connect(assistant).createSeller(seller, emptyAuthToken, voucherInitValues);

    const disputeResolver = mockDisputeResolver(DR.address, DR.address, ZeroAddress, DR.address, true);

    const disputeResolverFees = [
      new DisputeResolverFee(ZeroAddress, "Native Currency", "0"),
      new DisputeResolverFee(await weth.getAddress(), "WETH", "0"),
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

    const beaconProxyAddress = await calculateBosonProxyAddress(await accountHandler.getAddress());
    const voucherAddress = calculateCloneAddress(await accountHandler.getAddress(), beaconProxyAddress, seller.admin);
    bosonVoucher = await getContractAt("BosonVoucher", voucherAddress);

    // Pre mint range
    await offerHandler.connect(assistant).reserveRange(offer.id, offer.quantityAvailable, assistant.address);
    await bosonVoucher.connect(assistant).preMint(offer.id, offer.quantityAvailable);

    // Deposit seller funds so the commit will succeed
    await fundsHandler
      .connect(assistant)
      .depositFunds(seller.id, ZeroAddress, offer.sellerDeposit, { value: offer.sellerDeposit });

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
      const ZoraAuctionFactory = await getContractFactory("AuctionHouse");
      zoraAuction = await ZoraAuctionFactory.deploy(await weth.getAddress());

      // 2. Set approval for all
      tokenId = deriveTokenId(offer.id, 2);
      await bosonVoucher.connect(assistant).setApprovalForAll(await zoraAuction.getAddress(), true);

      // 3. Create an auction
      const tokenContract = await bosonVoucher.getAddress();
      const duration = oneWeek;
      const reservePrice = 1;
      const curator = ZeroAddress;
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
      expect(await bosonVoucher.ownerOf(tokenId)).to.equal(await zoraAuction.getAddress());
    });

    it("Transfer can't happens outside protocol", async function () {
      // safe transfer from will fail on onPremintedTransferredHook and transaction should fail
      await expect(zoraAuction.connect(rando).endAuction(auctionId)).to.be.revertedWith(RevertReasons.ACCESS_DENIED);

      // Exchange doesn't exist
      const exchangeId = tokenId & MASK;
      const [exist, ,] = await exchangeHandler.getExchange(exchangeId);

      expect(exist).to.equal(false);
    });
  });
});
