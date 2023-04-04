const hre = require("hardhat");
const ethers = hre.ethers;
const { deployProtocolClients } = require("../../../scripts/util/deploy-protocol-clients");
const { deployProtocolDiamond } = require("../../../scripts/util/deploy-protocol-diamond");
const { deployAndCutFacets } = require("../../../scripts/util/deploy-protocol-handler-facets");
const {
  getFacetsWithArgs,
  calculateContractAddress,
  objectToArray,
  getEvent,
  deriveTokenId,
  incrementer,
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
const { expect, assert } = require("chai");
const Role = require("../../../scripts/domain/Role");
const { deployMockTokens } = require("../../../scripts/util/deploy-mock-tokens");
const { DisputeResolverFee } = require("../../../scripts/domain/DisputeResolverFee");
const { constants } = require("ethers");
const OfferPrice = require("../../../scripts/domain/OfferPrice");
const { AUCTION_HOUSE_ADDRESS } = require("../../util/constants");

describe("[@skip-on-coverage] auctionProtocol integration", function () {
  this.timeout(100000000);
  let bosonVoucher, bosonToken;
  let deployer, protocol, assistant, buyer, DR;
  let fixtures;
  let offer, offerDates;
  let exchangeHandler;
  let weth;
  let seller;
  let auctionProtocol;

  before(async function () {
    accountId.next(true);

    let protocolTreasury;
    [deployer, protocol, assistant, protocolTreasury, buyer, DR] = await ethers.getSigners();

    // Deploy diamond
    let [protocolDiamond, , , , accessController] = await deployProtocolDiamond(maxPriorityFeePerGas);

    // Cast Diamond to contract interfaces
    const offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);
    const accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);
    fundsHandler = await ethers.getContractAt("IBosonFundsHandler", protocolDiamond.address);
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

    const protocolFeeFlatBoson = ethers.utils.parseUnits("0.01", "ether").toString();
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

    const disputeResolverFees = [new DisputeResolverFee(constants.AddressZero, "Native", "0")];
    const sellerAllowList = [seller.id];

    await accountHandler.connect(DR).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

    let offerDurations, disputeResolverId;
    ({ offer, offerDates, offerDurations, disputeResolverId } = await mockOffer());
    offer.quantityAvailable = 10;
    offer.priceType = OfferPrice.Discovery;

    await offerHandler
      .connect(assistant)
      .createOffer(offer.toStruct(), offerDates.toStruct(), offerDurations.toStruct(), disputeResolverId, "0");

    const voucherAddress = calculateContractAddress(accountHandler.address, seller.id);
    bosonVoucher = await ethers.getContractAt("BosonVoucher", voucherAddress);

    const AuctionHouseFactory = await ethers.getContractFactory("AuctionHouse");
    auctionProtocol = await AuctionHouseFactory.deploy(weth.address);

    // Pre mint range
    await offerHandler.connect(assistant).reserveRange(offer.id, offer.quantityAvailable, assistant.address);
    await bosonVoucher.connect(assistant).preMint(offer.id, offer.quantityAvailable);

    await bosonVoucher.connect(assistant).setPriceDiscoveryContract(auctionProtocol.address);
    await bosonVoucher.connect(assistant).setApprovalForAll(auctionProtocol.address, true);

    // Deposit seller funds so the commit will succeed
    await fundsHandler
      .connect(assistant)
      .depositFunds(seller.id, ethers.constants.AddressZero, offer.sellerDeposit, { value: offer.sellerDeposit });
  });

  it("auctionProtocol criteria-based order is used as price discovery mechanism for a BP offer", async function () {
    // Create auctionProtocol offer which tokenId 1
    const tokenId = deriveTokenId(offer.id, 2);

    await auctionProtocol.connect(assistant).createAuction(
      tokenId,
      bosonVoucher.address,
      60 * 60 * 24 * 7, // 1 week
      offer.price,
      ethers.constants.AddressZero,
      0,
      ethers.constants.AddressZero
    );

    const auctionId = 0;
    await auctionProtocol.connect(buyer).createBid(auctionId, offer.price, { value: offer.price });

    const [, , , , duration, firstBidTime] = await auctionProtocol.auctions(auctionId);
    const endTime = firstBidTime.add(duration);

    await ethers.provider.send("evm_setNextBlockTimestamp", [endTime.toNumber()]);

    await auctionProtocol.endAuction(0);

    expect(await bosonVoucher.ownerOf(tokenId)).to.equal(buyer.address);

    // const calldata = auctionProtocol.interface.encodeFunctionData("endAuction", [orders]);
    // await bosonVoucher.connect(assistant).callExternalContract(auctionProtocol.addr ess, calldata);
    // await bosonVoucher.connect(assistant).setApprovalForAllToContract(auctionProtocol.address, true);
    // const priceDiscoveryData = auctionProtocol.interface.encodeFunctionData("fulfillAdvancedOrder", [
    //   order,
    //   resolvers,
    //   constants.HashZero,
    //   constants.AddressZero,
    // ]);
    // const priceDiscovery = new PriceDiscovery(value, auctionProtocol.address, priceDiscoveryData, Side.Ask);
    // // Seller needs to deposit weth in order to fill the escrow at the last step
    // await weth.connect(buyer).deposit({ value });
    // await weth.connect(buyer).approve(exchangeHandler.address, value);
    // tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offer.id, priceDiscovery, {
    //   value,
    // });
  });
});
