const hre = require("hardhat");
const { ethers } = hre;
const { utils, BigNumber, constants } = ethers;
const { deployProtocolClients } = require("../../../scripts/util/deploy-protocol-clients");
const { deployProtocolDiamond } = require("../../../scripts/util/deploy-protocol-diamond");
const { deployAndCutFacets } = require("../../../scripts/util/deploy-protocol-handler-facets");

const {
  getFacetsWithArgs,
  calculateContractAddress,
  deriveTokenId,
  getCurrentBlockAndSetTimeForward,
} = require("../../util/utils");
const { oneWeek, oneMonth, maxPriorityFeePerGas } = require("../../util/constants");
const {
  mockSeller,
  mockAuthToken,
  mockVoucherInitValues,
  mockOffer,
  mockDisputeResolver,
  accountId,
} = require("../../util/mock");
const { expect } = require("chai");
const Role = require("../../../scripts/domain/Role");
const { deployMockTokens } = require("../../../scripts/util/deploy-mock-tokens");
const { DisputeResolverFee } = require("../../../scripts/domain/DisputeResolverFee");
const OfferPrice = require("../../../scripts/domain/OfferPrice");
const PriceDiscovery = require("../../../scripts/domain/PriceDiscovery");
const Side = require("../../../scripts/domain/Side");

describe("[@skip-on-coverage] auction integration", function () {
  this.timeout(100000000);
  let bosonVoucher, bosonToken;
  let deployer, protocol, assistant, buyer, DR;
  let offer, offerDates;
  let exchangeHandler;
  let weth;
  let seller;

  before(async function () {
    accountId.next(true);

    let protocolTreasury;
    [deployer, protocol, assistant, protocolTreasury, buyer, DR] = await ethers.getSigners();

    // Deploy diamond
    let [protocolDiamond, , , , accessController] = await deployProtocolDiamond(maxPriorityFeePerGas);

    // Cast Diamond to contract interfaces
    const offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);
    const accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);
    const fundsHandler = await ethers.getContractAt("IBosonFundsHandler", protocolDiamond.address);
    exchangeHandler = await ethers.getContractAt("IBosonExchangeHandler", protocolDiamond.address);

    // Grant roles
    await accessController.grantRole(Role.PROTOCOL, protocol.address);
    await accessController.grantRole(Role.PROTOCOL, protocolDiamond.address);
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    const protocolClientArgs = [protocolDiamond.address];

    const [, beacons, proxies, bv] = await deployProtocolClients(protocolClientArgs, maxPriorityFeePerGas);

    [bosonVoucher] = bv;
    const [beacon] = beacons;
    const [proxy] = proxies;

    const protocolFeeFlatBoson = utils.parseUnits("0.01", "ether").toString();
    const buyerEscalationDepositPercentage = "1000"; // 10%

    [bosonToken] = await deployMockTokens();

    // Add config Handler, so ids start at 1, and so voucher address can be found
    const protocolConfig = [
      // Protocol addresses
      {
        treasury: protocolTreasury.address,
        token: bosonToken.address,
        voucherBeacon: beacon.address,
        beaconProxy: proxy.address,
      },
      // Protocol limits
      {
        maxExchangesPerBatch: 100,
        maxOffersPerGroup: 100,
        maxTwinsPerBundle: 100,
        maxOffersPerBundle: 100,
        maxOffersPerBatch: 100,
        maxTokensPerWithdrawal: 100,
        maxFeesPerDisputeResolver: 100,
        maxEscalationResponsePeriod: oneMonth,
        maxDisputesPerBatch: 100,
        maxAllowedSellers: 100,
        maxTotalOfferFeePercentage: 4000, //40%
        maxRoyaltyPecentage: 1000, //10%
        maxResolutionPeriod: oneMonth,
        minDisputePeriod: oneWeek,
        maxPremintedVouchers: 10000,
      },
      //Protocol fees
      {
        percentage: 200, // 2%
        flatBoson: protocolFeeFlatBoson,
        buyerEscalationDepositPercentage,
      },
    ];

    const facetNames = [
      "ExchangeHandlerFacet",
      "OfferHandlerFacet",
      "SellerHandlerFacet",
      "DisputeResolverHandlerFacet",
      "FundsHandlerFacet",
      "ProtocolInitializationHandlerFacet",
      "ConfigHandlerFacet",
    ];

    const facetsToDeploy = await getFacetsWithArgs(facetNames, protocolConfig);

    const wethFactory = await ethers.getContractFactory("WETH9");
    weth = await wethFactory.deploy();
    await weth.deployed();

    facetsToDeploy["ExchangeHandlerFacet"].constructorArgs = [1, weth.address];

    // Cut the protocol handler facets into the Diamond
    await deployAndCutFacets(protocolDiamond.address, facetsToDeploy, maxPriorityFeePerGas);

    seller = mockSeller(assistant.address, assistant.address, assistant.address, assistant.address);

    const emptyAuthToken = mockAuthToken();
    const voucherInitValues = mockVoucherInitValues();
    await accountHandler.connect(assistant).createSeller(seller, emptyAuthToken, voucherInitValues);

    const disputeResolver = mockDisputeResolver(DR.address, DR.address, DR.address, DR.address, true);

    const disputeResolverFees = [new DisputeResolverFee(weth.address, "WETH", "0")];
    const sellerAllowList = [seller.id];

    await accountHandler.connect(DR).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

    let offerDurations, disputeResolverId;
    ({ offer, offerDates, offerDurations, disputeResolverId } = await mockOffer());
    offer.quantityAvailable = 10;
    offer.priceType = OfferPrice.Discovery;
    offer.exchangeToken = weth.address;

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
  });

  it("Works with Zora auction", async function () {
    let tokenId, zoraAuction;
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
    });

    it("Auction ends normally", async function () {
      // 5. Bid
      const auctionId = 0;
      const amount = 10;

      await zoraAuction.connect(buyer).createBid(auctionId, amount, { value: amount });

      // 6. Encode endAuction data
      await getCurrentBlockAndSetTimeForward(oneWeek);

      expect(await bosonVoucher.ownerOf(tokenId)).to.equal(zoraAuction.address);
      expect(await weth.balanceOf(assistant.address)).to.equal(amount);

      const calldata = zoraAuction.interface.encodeFunctionData("endAuction", [auctionId]);
      const priceDiscovery = new PriceDiscovery(amount, zoraAuction.address, calldata, Side.Bid);

      const protocolBalanceBefore = await ethers.provider.getBalance(exchangeHandler.address);

      // 7. Commit to offer
      const tx = await exchangeHandler.connect(assistant).commitToOffer(buyer.address, offer.id, priceDiscovery);
      const { timestamp } = await ethers.provider.getBlock(tx.blockNumber);

      expect(await bosonVoucher.ownerOf(tokenId)).to.equal(buyer.address);
      expect(await ethers.provider.getBalance(exchangeHandler.address)).to.equal(protocolBalanceBefore.add(amount));

      const MASK = BigNumber.from(2).pow(128).sub(1);
      const exchangeId = tokenId.and(MASK);
      const [, , voucher] = await exchangeHandler.getExchange(exchangeId);

      expect(voucher.committedDate).to.equal(timestamp);
    });
  });
});
