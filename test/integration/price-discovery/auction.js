const { ethers } = require("hardhat");
const { ZeroAddress, getContractFactory, getContractAt, provider } = ethers;
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
const PriceDiscovery = require("../../../scripts/domain/PriceDiscovery");
const Side = require("../../../scripts/domain/Side");

const MASK = (1n << 128n) - 1n;

describe("[@skip-on-coverage] auction integration", function () {
  let bosonVoucher;
  let assistant, buyer, DR, rando;
  let offer, offerDates;
  let exchangeHandler;
  let priceDiscoveryHandler;
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
      contractInstances: { accountHandler, offerHandler, fundsHandler, exchangeHandler, priceDiscoveryHandler },
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

    let offerDurations, drParams;
    ({ offer, offerDates, offerDurations, drParams } = await mockOffer());
    offer.quantityAvailable = 10;
    offer.priceType = PriceType.Discovery;
    // offer.exchangeToken = weth.address;

    await offerHandler
      .connect(assistant)
      .createOffer(offer.toStruct(), offerDates.toStruct(), offerDurations.toStruct(), drParams, "0");

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

      tokenId = deriveTokenId(offer.id, 2);
    });

    it("Transfer can't happens outside protocol", async function () {
      // 2. Set approval for all
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

      // Set time forward
      await getCurrentBlockAndSetTimeForward(oneWeek);

      // Zora should be the owner of the token
      expect(await bosonVoucher.ownerOf(tokenId)).to.equal(await zoraAuction.getAddress());

      // safe transfer from will fail on onPremintedTransferredHook and transaction should fail
      await expect(zoraAuction.connect(rando).endAuction(auctionId)).to.emit(zoraAuction, "AuctionCanceled");

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
            await zoraAuction.getAddress(),
            await exchangeHandler.getAddress(),
            await weth.getAddress()
          );

        // 3. Wrap voucher
        await bosonVoucher.connect(assistant).setApprovalForAll(await wrappedBosonVoucher.getAddress(), true);
        await wrappedBosonVoucher.connect(assistant).wrap(tokenId);

        // 4. Create an auction
        const tokenContract = await wrappedBosonVoucher.getAddress();
        const duration = oneWeek;
        const reservePrice = 1;
        const curator = assistant.address;
        const curatorFeePercentage = 0;
        const auctionCurrency = offer.exchangeToken;

        await zoraAuction
          .connect(assistant)
          .createAuction(
            tokenId,
            tokenContract,
            duration,
            reservePrice,
            curator,
            curatorFeePercentage,
            auctionCurrency
          );

        auctionId = 0;
        await zoraAuction.connect(assistant).setAuctionApproval(auctionId, true);
      });

      it("Auction ends normally", async function () {
        // 5. Bid
        const amount = 10;

        await zoraAuction.connect(buyer).createBid(auctionId, amount, { value: amount });

        // 6. End auction
        await getCurrentBlockAndSetTimeForward(oneWeek);
        await zoraAuction.connect(assistant).endAuction(auctionId);

        expect(await wrappedBosonVoucher.ownerOf(tokenId)).to.equal(buyer.address);
        expect(await weth.balanceOf(await wrappedBosonVoucher.getAddress())).to.equal(amount);

        // 7. Commit to offer
        const calldata = wrappedBosonVoucher.interface.encodeFunctionData("unwrap", [tokenId]);
        const priceDiscovery = new PriceDiscovery(
          amount,
          Side.Bid,
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
        await zoraAuction.connect(assistant).cancelAuction(auctionId);

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
        await zoraAuction.connect(assistant).cancelAuction(auctionId);

        // 7. Unwrap token via commitToOffer
        const protocolBalanceBefore = await provider.getBalance(await exchangeHandler.getAddress());

        const calldata = wrappedBosonVoucher.interface.encodeFunctionData("unwrap", [tokenId]);
        const priceDiscovery = new PriceDiscovery(
          0,
          Side.Bid,
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
  });
});
