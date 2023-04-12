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
const { expect, assert } = require("chai");
const Role = require("../../../scripts/domain/Role");
const { deployMockTokens } = require("../../../scripts/util/deploy-mock-tokens");
const { DisputeResolverFee } = require("../../../scripts/domain/DisputeResolverFee");
const OfferPrice = require("../../../scripts/domain/OfferPrice");
const PriceDiscovery = require("../../../scripts/domain/PriceDiscovery");
const Side = require("../../../scripts/domain/Side");

const BID_BASE_UNIT = utils.parseUnits("1000", 9);

describe("[@skip-on-coverage] auctionProtocol integration", function() {
  this.timeout(100000000);
  let bosonVoucher, bosonToken;
  let deployer, protocol, assistant, buyer, DR;
  let offer, offerDates;
  let exchangeHandler;
  let weth;
  let seller;

  before(async function() {
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

    // Pre mint range
    await offerHandler.connect(assistant).reserveRange(offer.id, offer.quantityAvailable, assistant.address);
    await bosonVoucher.connect(assistant).preMint(offer.id, offer.quantityAvailable);

    // Deposit seller funds so the commit will succeed
    await fundsHandler
      .connect(assistant)
      .depositFunds(seller.id, constants.AddressZero, offer.sellerDeposit, { value: offer.sellerDeposit });
  });

  it("Works wiht Sneaky auction", async function() {
    const SneakyAuctionFactory = await ethers.getContractFactory("SneakyAuction");
    const sneakyAuction = await SneakyAuctionFactory.deploy();
    await sneakyAuction.deployed();

    await bosonVoucher.connect(assistant).setPriceDiscoveryContract(sneakyAuction.address);
    await bosonVoucher.connect(assistant).setApprovalForAll(sneakyAuction.address, true);

    // Create auctionProtocol offer which tokenId 1
    const tokenId = deriveTokenId(offer.id, 2);

    // Convert the value in Ether to Wei
    const priceInWei = utils.formatUnits(offer.price, "wei");

    // Divide the value in Wei by the BID_BASE_UNIT
    const reservedPrice = BigNumber.from(priceInWei).div(BID_BASE_UNIT);

    await expect(sneakyAuction
      .connect(assistant)
      .createAuction(bosonVoucher.address, tokenId, oneWeek, oneWeek, reservedPrice)).to.emit(sneakyAuction, "AuctionCreated");

    const bidPrice = reservedPrice.add(1);
    const bidPriceInWei = utils.formatUnits(bidPrice.mul(BID_BASE_UNIT), "wei");

    const salt = utils.formatBytes32String("123");

    // get vault address
    const vault = await sneakyAuction.getVaultAddress(bosonVoucher.address, tokenId, 1, buyer.address, bidPrice, salt);

    // deposit bid price into vault
    await buyer.sendTransaction({ to: vault, value: bidPriceInWei });

    await getCurrentBlockAndSetTimeForward(oneWeek)

    // first proof has to be empty
    const proof = {
      // array of bytes 
      accountMerkleProof: [constants.HashZero],
      blockHeaderRLP: constants.HashZero,
    }

    const bid = await sneakyAuction.connect(buyer).revealBid(bosonVoucher.address, tokenId, bidPrice, salt, proof);
    await getCurrentBlockAndSetTimeForward(oneWeek);

    const calldata = sneakyAuction.interface.encodeFunctionData("endAuction", [bosonVoucher.address, tokenId, buyer.address, bidPrice, salt]);
    await bosonVoucher.connect(assistant).callExternalContract(sneakyAuction.address, calldata);
    await bosonVoucher.connect(assistant).setApprovalForAllToContract(sneakyAuction.address, true);

    const priceDiscovery = new PriceDiscovery(offer.price, sneakyAuction.address, calldata, Side.Bid);

    // Seller needs to deposit weth in order to fill the escrow at the last step
    // await weth.connect(buyer).deposit({ value });
    // await weth.connect(buyer).approve(exchangeHandler.address, offer.sellerDepos);
    //
    tx = await exchangeHandler.connect(assistant).commitToOffer(buyer.address, offer.id, priceDiscovery, {
      value: offer.sellerDeposit
    });

    expect(await bosonVoucher.ownerOf(tokenId)).to.equal(buyer.address);
  });
});
