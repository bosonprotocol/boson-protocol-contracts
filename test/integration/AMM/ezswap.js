const hre = require("hardhat");
const ethers = hre.ethers;
const { constants, BigNumber } = ethers;
const { deployProtocolClients } = require("../../../scripts/util/deploy-protocol-clients");
const { deployProtocolDiamond } = require("../../../scripts/util/deploy-protocol-diamond");
const { deployAndCutFacets } = require("../../../scripts/util/deploy-protocol-handler-facets");
const { getFacetsWithArgs, getEvent, calculateContractAddress, objectToArray } = require("../../util/utils");
const { oneWeek, oneMonth, maxPriorityFeePerGas, LSSVM_PAIR_FACTORY } = require("../../util/constants");

const { mockSeller, mockAuthToken, mockVoucherInitValues, mockOffer, mockDisputeResolver } = require("../../util/mock");
const { assert, expect } = require("chai");
const Role = require("../../../scripts/domain/Role");
const { deployMockTokens } = require("../../../scripts/util/deploy-mock-tokens");
// let { seaportFixtures } = require("./fixtures.js");
const { DisputeResolverFee } = require("../../../scripts/domain/DisputeResolverFee");
const { RevertReasons } = require("../../../scripts/config/revert-reasons");

describe("[@skip-on-coverage] EZSwap integration", function () {
  let lssvmPairFactory, linearCurve;
  let bosonVoucher, bosonToken;
  let deployer, protocol, assistant, buyer, DR, ezswapDeployer;
  let calldata, order, orderHash, valueo, offer;

  before(async function () {
    let protocolTreasury;
    [deployer, protocol, assistant, protocolTreasury, buyer, DR, ezswapDeployer] = await ethers.getSigners();

    let artifact = require("./lssvm/out/LSSVMPairEnumerableETH.sol/LSSVMPairEnumerableETH.json").abi;
    const LSSVMPairEnumerableETH = await ethers.getContractFactory(artifact, ezswapDeployer);
    const lssvmPairEnumerableETH = await LSSVMPairEnumerableETH.deploy();
    await lssvmPairEnumerableETH.deployed();

    artifact = require("./lssvm/out/LSSVMPairEnumerableERC20.sol/LSSVMPairEnumerableERC20.json").abi;
    const LSSVMPairEnumerableERC20 = await ethers.getContractFactory(artifact, ezswapDeployer);
    const lssvmPairEnumerableERC20 = await LSSVMPairEnumerableERC20.deploy();
    await lssvmPairEnumerableERC20.deployed();

    artifact = require("./lssvm/out/LSSVMPairMissingEnumerableETH.sol/LSSVMPairMissingEnumerableETH.json").abi;
    const LSSVMPairMissingEnumerableETH = await ethers.getContractFactory(artifact, ezswapDeployer);
    const lssvmPairMissingEnumerableETH = await LSSVMPairMissingEnumerableETH.deploy();

    artifact = require("./lssvm/out/LSSVMPairMissingEnumerableERC20.sol/LSSVMPairMissingEnumerableERC20.json").abi;
    const LSSVMPairMissingEnumerableERC20 = await ethers.getContractFactory(artifact, ezswapDeployer);
    const lssvmPairMissingEnumerableERC20 = await LSSVMPairMissingEnumerableERC20.deploy();

    artifact = require("./lssvm/out/LSSVMPairFactory.sol/LSSVMPairFactory.json").abi;
    const LSSVMPairFactory = await ethers.getContractFactory(artifact, ezswapDeployer);

    const ezswapFeeMultiplier = "5000000000000000";

    lssvmPairFactory = await LSSVMPairFactory.deploy(
      lssvmPairEnumerableETH.address,
      lssvmPairEnumerableERC20.address,
      lssvmPairMissingEnumerableETH.address,
      lssvmPairMissingEnumerableERC20.address,
      ezswapDeployer.address,
      ezswapFeeMultiplier
    );
    await lssvmPairFactory.deployed();

    // Deploy bonding curves
    artifact = require("./lssvm/out/LinearCurve.json");
    const LinearCurve = await ethers.getContractFactory(artifact, ezswapDeployer);
    linearCurve = await LinearCurve.deploy();
    await linearCurve.deployed();

    // Whitelist bonding curve
    await lssvmPairFactory.setBondingCurveAllowed(linearCurve.address, true);

    // Deploy diamond
    let [protocolDiamond, , , , accessController] = await deployProtocolDiamond(maxPriorityFeePerGas);

    // Cast Diamond to contract interfaces
    const offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);
    const accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);
    const fundsHandler = await ethers.getContractAt("IBosonFundsHandler", protocolDiamond.address);

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

    // Cut the protocol handler facets into the Diamond
    await deployAndCutFacets(protocolDiamond.address, facetsToDeploy, maxPriorityFeePerGas);

    const seller = mockSeller(assistant.address, assistant.address, assistant.address, assistant.address);

    const emptyAuthToken = mockAuthToken();
    const voucherInitValues = mockVoucherInitValues();
    await accountHandler.connect(assistant).createSeller(seller, emptyAuthToken, voucherInitValues);

    const disputeResolver = mockDisputeResolver(DR.address, DR.address, DR.address, DR.address, true);

    const disputeResolverFees = [new DisputeResolverFee(ethers.constants.AddressZero, "Native", "0")];
    const sellerAllowList = [];

    await accountHandler.connect(DR).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

    let offerDates, offerDurations, disputeResolverId;
    ({ offer, offerDates, offerDurations, disputeResolverId } = await mockOffer());
    offer.quantityAvailable = 10;

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
    await offerHandler.connect(assistant).reserveRange(offer.id, offer.quantityAvailable);
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

  it("EZSwap is used as price discovery mechanism for a offer", async function () {
    const poolType = 0; // NFT
    const delta = "100";
    const fee = "0";
    const spotPrice = "1000";
    const nftIds = [];
    await lssvmPairFactory
      .connect(assistant)
      .createPairETH(
        bosonVoucher.address,
        linearCurve.address,
        ethers.constants.AddressZero,
        poolType,
        delta,
        fee,
        spotPrice,
        nftIds
      );
  });
});
