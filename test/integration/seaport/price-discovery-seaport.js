const hre = require("hardhat");

const ethers = hre.ethers;
const { deployProtocolClients } = require("../../../scripts/util/deploy-protocol-clients");
const { deployProtocolDiamond } = require("../../../scripts/util/deploy-protocol-diamond");
const { deployAndCutFacets } = require("../../../scripts/util/deploy-protocol-handler-facets");
const { getFacetsWithArgs, calculateContractAddress, objectToArray } = require("../../util/utils");
const { oneWeek, oneMonth, maxPriorityFeePerGas } = require("../../util/constants");
const { mockSeller, mockAuthToken, mockVoucherInitValues, mockOffer, mockDisputeResolver } = require("../../util/mock");
const { expect, assert } = require("chai");
const Role = require("../../../scripts/domain/Role");
const { deployMockTokens } = require("../../../scripts/util/deploy-mock-tokens");
const { DisputeResolverFee } = require("../../../scripts/domain/DisputeResolverFee");
const Side = require("../../../scripts/domain/Side");
const PriceDiscovery = require("../../../scripts/domain/PriceDiscovery");
const { constants } = require("ethers");
const OfferPrice = require("../../../scripts/domain/OfferPrice");
const { seaportFixtures } = require("./fixtures");
const { SEAPORT_ADDRESS } = require("../../util/constants");

describe("[@skip-on-coverage] seaport integration", function() {
  this.timeout(100000000);
  let lssvmPairFactory;
  let bosonVoucher, bosonToken;
  let deployer, protocol, assistant, buyer, DR, fixtures;
  let offer, offerDates;
  let exchangeHandler;
  let weth;
  let seller;
  let seaport;

  before(async function() {
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

    // Add WETH
    facetsToDeploy["ExchangeHandlerFacet"].constructorArgs = [weth.address];

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

    seaport = await ethers.getContractAt("Seaport", SEAPORT_ADDRESS);

    fixtures = await seaportFixtures(seaport);


    // Pre mint range
    await offerHandler.connect(assistant).reserveRange(offer.id, offer.quantityAvailable, bosonVoucher.address);
    await bosonVoucher.connect(assistant).preMint(offer.id, offer.quantityAvailable);
  });

  it("seaport is used as price discovery mechanism for a offer", async function() {
    await bosonVoucher.connect(assistant).setPriceDiscoveryContract(seaport.address);

    // need to deposit NFTs
    await bosonVoucher.connect(assistant).setApprovalForAllToContract(seaport.address, true);

    // Create seaport offer which tokenId 1
    // const endDate = "0xff00000000000000000000000000";
    const seaportOffer = fixtures.getTestVoucher(1, bosonVoucher.address, 1, 1);
    const consideration = fixtures.getTestToken(
      0,
      undefined,
      offer.price,
      ethers.BigNumber.from(offer.price).add(ethers.utils.parseUnits("1", "ether")),
      exchangeHandler.address
    );

    const { order, orderHash, value } = await fixtures.getOrder(
      bosonVoucher,
      undefined,
      [seaportOffer],
      [consideration],
      0, // full
      offerDates.validFrom, // startDate
      offerDates.validUntil // endDate
    );

    const orders = [objectToArray(order)];
    const calldata = seaport.interface.encodeFunctionData("validate", [orders]);

    await bosonVoucher.connect(assistant).callExternalContract(seaport.address, calldata);
    await bosonVoucher.connect(assistant).setApprovalForAllToContract(seaport.address, true);

    let totalFilled, isValidated;

    ({ isValidated, totalFilled } = await seaport.getOrderStatus(orderHash));
    assert(isValidated, "Order is not validated");
    assert.equal(totalFilled.toNumber(), 0);

    const priceDiscoveryData = seaport.interface.encodeFunctionData("fulfillOrder", [order, constants.HashZero]);

    const priceDiscovery = new PriceDiscovery(value, seaport.address, priceDiscoveryData, Side.Ask);

    // Seller needs to deposit weth in order to fill the escrow at the last step
    // Price is theoretically the highest amount needed
    await weth.connect(buyer).deposit({ value });
    await weth.connect(buyer).approve(exchangeHandler.address, value);

    // Approve transfers
    // Buyer does not approve, since its in ETH.
    // Seller approves price discovery to transfer the voucher
    tx = await exchangeHandler
      .connect(buyer)
      .commitToPreMintedOfferWithPriceDiscovery(buyer.address, offer.id, priceDiscovery, {
        value,
      });

    ({ totalFilled } = await seaport.getOrderStatus(orderHash));
    assert.equal(totalFilled.toNumber(), 1);
    const event = getEvent(receipt, seaport, "OrderFulfilled");

    assert.equal(orderHash, event[0]);
  });
});
