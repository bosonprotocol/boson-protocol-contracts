const hre = require("hardhat");

const ethers = hre.ethers;
const { deployProtocolClients } = require("../../../scripts/util/deploy-protocol-clients");
const { deployProtocolDiamond } = require("../../../scripts/util/deploy-protocol-diamond");
const { deployAndCutFacets } = require("../../../scripts/util/deploy-protocol-handler-facets");
const { getFacetsWithArgs, calculateContractAddress } = require("../../util/utils");
const { oneWeek, oneMonth, maxPriorityFeePerGas } = require("../../util/constants");
const { mockSeller, mockAuthToken, mockVoucherInitValues, mockOffer, mockDisputeResolver } = require("../../util/mock");
const { expect } = require("chai");
const Role = require("../../../scripts/domain/Role");
const { deployMockTokens } = require("../../../scripts/util/deploy-mock-tokens");
const { DisputeResolverFee } = require("../../../scripts/domain/DisputeResolverFee");
const Side = require("../../../scripts/domain/Side");
const PriceDiscovery = require("../../../scripts/domain/PriceDiscovery");
const { constants } = require("ethers");
const OfferPrice = require("../../../scripts/domain/OfferPrice");

describe("[@skip-on-coverage] sudoswap integration", function() {
  this.timeout(100000000);
  let lssvmPairFactory, linearCurve;
  let bosonVoucher, bosonToken;
  let deployer, protocol, assistant, buyer, DR, sudoswapDeployer;
  let offer;
  let exchangeHandler, fundsHandler;
  let weth;
  let seller;

  before(async function() {
    let protocolTreasury;
    [deployer, protocol, assistant, protocolTreasury, buyer, DR, sudoswapDeployer] = await ethers.getSigners();

    const LSSVMPairEnumerableETH = await ethers.getContractFactory("LSSVMPairEnumerableETH", sudoswapDeployer);
    const lssvmPairEnumerableETH = await LSSVMPairEnumerableETH.deploy();
    await lssvmPairEnumerableETH.deployed();

    const LSSVMPairEnumerableERC20 = await ethers.getContractFactory("LSSVMPairEnumerableERC20", sudoswapDeployer);
    const lssvmPairEnumerableERC20 = await LSSVMPairEnumerableERC20.deploy();
    await lssvmPairEnumerableERC20.deployed();

    const LSSVMPairMissingEnumerableETH = await ethers.getContractFactory(
      "LSSVMPairMissingEnumerableETH",
      sudoswapDeployer
    );
    const lssvmPairMissingEnumerableETH = await LSSVMPairMissingEnumerableETH.deploy();

    const LSSVMPairMissingEnumerableERC20 = await ethers.getContractFactory(
      "LSSVMPairMissingEnumerableERC20",
      sudoswapDeployer
    );
    const lssvmPairMissingEnumerableERC20 = await LSSVMPairMissingEnumerableERC20.deploy();

    const LSSVMPairFactory = await ethers.getContractFactory("LSSVMPairFactory", sudoswapDeployer);

    lssvmPairFactory = await LSSVMPairFactory.deploy(
      lssvmPairEnumerableETH.address,
      lssvmPairMissingEnumerableETH.address,
      lssvmPairEnumerableERC20.address,
      lssvmPairMissingEnumerableERC20.address,
      sudoswapDeployer.address,
      "0"
    );
    await lssvmPairFactory.deployed();

    // Deploy bonding curves
    const LinearCurve = await ethers.getContractFactory("LinearCurve", sudoswapDeployer);
    linearCurve = await LinearCurve.deploy();
    await linearCurve.deployed();

    // Whitelist bonding curve
    await lssvmPairFactory.setBondingCurveAllowed(linearCurve.address, true);

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

    let offerDates, offerDurations, disputeResolverId;
    ({ offer, offerDates, offerDurations, disputeResolverId } = await mockOffer());
    offer.quantityAvailable = 10;
    offer.priceType = OfferPrice.Discovery;

    await offerHandler
      .connect(assistant)
      .createOffer(offer.toStruct(), offerDates.toStruct(), offerDurations.toStruct(), disputeResolverId, "0");

    const voucherAddress = calculateContractAddress(accountHandler.address, seller.id);
    bosonVoucher = await ethers.getContractAt("BosonVoucher", voucherAddress);

    // Pool needs to cover both seller deposit and price
    const pool = ethers.BigNumber.from(offer.sellerDeposit).add(offer.price);
    await fundsHandler.connect(assistant).depositFunds(seller.id, ethers.constants.AddressZero, pool, {
      value: pool,
    });

    // Pre mint range
    await offerHandler.connect(assistant).reserveRange(offer.id, offer.quantityAvailable, assistant.address);
    await bosonVoucher.connect(assistant).preMint(offer.id, offer.quantityAvailable);
  });
  // "_assetRecipient": "The address that will receive the assets traders give during trades. If set to address(0), assets will be sent to the pool address. Not available to TRADE pools. ",
  //        "_bondingCurve": "The bonding curve for the pair to price NFTs, must be whitelisted",
  //        "_delta": "The delta value used by the bonding curve. The meaning of delta depends on the specific curve.",
  //        "_fee": "The fee taken by the LP in each trade. Can only be non-zero if _poolType is Trade.",
  //        "_initialNFTIDs": "The list of IDs of NFTs to transfer from the sender to the pair",
  //        "_nft": "The NFT contract of the collection the pair trades",
  //        "_poolType": "TOKEN, NFT, or TRADE",
  //        "_spotPrice": "The initial selling spot price"

  it("sudoswap is used as price discovery mechanism for a offer", async function() {
    const poolType = 1; // NFT
    const delta = ethers.utils.parseUnits("0.25", "ether").toString();
    const fee = "0";
    const spotPrice = offer.price;
    const nftIds = [];
    let tx = await lssvmPairFactory
      .connect(assistant)
      .createPairETH(
        bosonVoucher.address,
        linearCurve.address,
        constants.AddressZero,
        poolType,
        delta,
        fee,
        spotPrice,
        nftIds
      );

    const receipt = await tx.wait();

    const [contractAddress] = receipt.events[1].args;

    await bosonVoucher.connect(assistant).setPriceDiscoveryContract(contractAddress);

    // need to deposit NFTs
    await bosonVoucher.connect(assistant).setApprovalForAll(lssvmPairFactory.address, true);
    tx = await lssvmPairFactory.connect(assistant).depositNFTs(bosonVoucher.address, [1], contractAddress);

    const priceDiscoveryContract = await ethers.getContractAt("LSSVMPairMissingEnumerableETH", contractAddress);

    const [, , , inputAmount] = await priceDiscoveryContract.getBuyNFTQuote(1);

    const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("swapTokenForAnyNFTs", [
      1,
      inputAmount,
      exchangeHandler.address, // receiver is protocol diamond
      false,
      constants.AddressZero,
    ]);
    const priceDiscovery = new PriceDiscovery(
      inputAmount,
      priceDiscoveryContract.address,
      priceDiscoveryData,
      Side.Ask
    );

    // see this
    await fundsHandler.connect(assistant).depositFunds(seller.id, ethers.constants.AddressZero, inputAmount, {
      value: inputAmount,
    });

    // Seller needs to deposit weth in order to fill the escrow at the last step
    // Price is theoretically the highest amount needed
    await weth.connect(buyer).deposit({ value: inputAmount });
    await weth.connect(buyer).approve(exchangeHandler.address, inputAmount);

    // Approve transfers
    // Buyer does not approve, since its in ETH.
    // Seller approves price discovery to transfer the voucher
    await bosonVoucher.connect(assistant).setApprovalForAll(priceDiscoveryContract.address, true);
    tx = await exchangeHandler
      .connect(buyer)
      .commitToPreMintedOfferWithPriceDiscovery(buyer.address, offer.id, priceDiscovery, {
        value: inputAmount,
      });

    await expect(tx).to.emit(exchangeHandler, "BuyerCommitted");
    await expect(tx).to.emit(priceDiscoveryContract, "SwapNFTOutPair");
  });
});
