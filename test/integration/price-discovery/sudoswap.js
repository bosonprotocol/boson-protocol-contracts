const hre = require("hardhat");

const ethers = hre.ethers;
const {
  mockSeller,
  mockAuthToken,
  mockVoucherInitValues,
  mockOffer,
  mockDisputeResolver,
  accountId,
} = require("../../util/mock");
const { expect } = require("chai");
const { calculateContractAddress, deriveTokenId, setupTestEnvironment } = require("../../util/utils");

const { DisputeResolverFee } = require("../../../scripts/domain/DisputeResolverFee");
const Side = require("../../../scripts/domain/Side");
const PriceDiscovery = require("../../../scripts/domain/PriceDiscovery");
const { constants } = require("ethers");
const PriceType = require("../../../scripts/domain/PriceType");

describe("[@skip-on-coverage] sudoswap integration", function () {
  this.timeout(100000000);
  let lssvmPairFactory, linearCurve;
  let bosonVoucher;
  let deployer, assistant, buyer, DR;
  let offer;
  let exchangeHandler, priceDiscoveryHandler;
  let weth;
  let seller;

  before(async function () {
    accountId.next();

    // Specify contracts needed for this test
    const contracts = {
      accountHandler: "IBosonAccountHandler",
      offerHandler: "IBosonOfferHandler",
      fundsHandler: "IBosonFundsHandler",
      exchangeHandler: "IBosonExchangeHandler",
      priceDiscoveryHandler: "IBosonPriceDiscoveryHandler",
    };

    const wethFactory = await ethers.getContractFactory("WETH9");
    weth = await wethFactory.deploy();
    await weth.deployed();

    let accountHandler, offerHandler, fundsHandler;

    ({
      signers: [deployer, assistant, buyer, DR],
      contractInstances: { accountHandler, offerHandler, fundsHandler, exchangeHandler, priceDiscoveryHandler },
      extraReturnValues: { bosonVoucher },
    } = await setupTestEnvironment(contracts, { wethAddress: weth.address }));

    const LSSVMPairEnumerableETH = await ethers.getContractFactory("LSSVMPairEnumerableETH", deployer);
    const lssvmPairEnumerableETH = await LSSVMPairEnumerableETH.deploy();
    await lssvmPairEnumerableETH.deployed();

    const LSSVMPairEnumerableERC20 = await ethers.getContractFactory("LSSVMPairEnumerableERC20", deployer);
    const lssvmPairEnumerableERC20 = await LSSVMPairEnumerableERC20.deploy();
    await lssvmPairEnumerableERC20.deployed();

    const LSSVMPairMissingEnumerableETH = await ethers.getContractFactory("LSSVMPairMissingEnumerableETH", deployer);
    const lssvmPairMissingEnumerableETH = await LSSVMPairMissingEnumerableETH.deploy();

    const LSSVMPairMissingEnumerableERC20 = await ethers.getContractFactory(
      "LSSVMPairMissingEnumerableERC20",
      deployer
    );
    const lssvmPairMissingEnumerableERC20 = await LSSVMPairMissingEnumerableERC20.deploy();

    const LSSVMPairFactory = await ethers.getContractFactory("LSSVMPairFactory", deployer);

    lssvmPairFactory = await LSSVMPairFactory.deploy(
      lssvmPairEnumerableETH.address,
      lssvmPairMissingEnumerableETH.address,
      lssvmPairEnumerableERC20.address,
      lssvmPairMissingEnumerableERC20.address,
      deployer.address,
      "0"
    );
    await lssvmPairFactory.deployed();

    // Deploy bonding curves
    const LinearCurve = await ethers.getContractFactory("LinearCurve", deployer);
    linearCurve = await LinearCurve.deploy();
    await linearCurve.deployed();

    // Whitelist bonding curve
    await lssvmPairFactory.setBondingCurveAllowed(linearCurve.address, true);

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
    offer.priceType = PriceType.Discovery;

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

  it("Works with wrapper vouchers ", async function () {
    const poolType = 1; // NFT
    const delta = ethers.utils.parseUnits("0.25", "ether").toString();
    const fee = "0";
    const spotPrice = offer.price;
    const nftIds = [];

    const wrappedBosonVoucherFactory = await ethers.getContractFactory("SudoswapWrapper");
    const wrappedBosonVoucher = await wrappedBosonVoucherFactory
      .connect(assistant)
      .deploy(bosonVoucher.address, lssvmPairFactory.address, exchangeHandler.address, weth.address);

    let tx = await lssvmPairFactory
      .connect(assistant)
      .createPairETH(
        wrappedBosonVoucher.address,
        linearCurve.address,
        constants.AddressZero,
        poolType,
        delta,
        fee,
        spotPrice,
        nftIds
      );

    const receipt = await tx.wait();

    const [poolAddress] = receipt.events[1].args;

    // need to deposit NFTs
    await bosonVoucher.connect(assistant).setApprovalForAll(wrappedBosonVoucher.address, true);

    const tokenId = deriveTokenId(offer.id, 1);
    await wrappedBosonVoucher.connect(assistant).wrap(tokenId);

    tx = await wrappedBosonVoucher.connect(assistant).depositNFTs(poolAddress, [tokenId]);

    const pool = await ethers.getContractAt("LSSVMPairMissingEnumerableETH", poolAddress);

    const [, , , inputAmount] = await pool.getBuyNFTQuote(1);

    const swapTokenTx = await pool.swapTokenForAnyNFTs(1, inputAmount, buyer.address, false, constants.AddressZero);

    expect(swapTokenTx).to.emit(pool, "SwapTokenForAnyNFTs");

    const calldata = wrappedBosonVoucher.interface.encodeFunctionData("unwrap", [tokenId]);

    const priceDiscovery = new PriceDiscovery(inputAmount, pool.address, calldata, Side.Ask);

    // see this
    //    await fundsHandler.connect(assistant).depositFunds(seller.id, ethers.constants.AddressZero, inputAmount, {
    //      value: inputAmount,
    //    });

    // Seller needs to deposit weth in order to fill the escrow at the last step
    // Price is theoretically the highest amount needed
    //    await weth.connect(buyer).deposit({ value: inputAmount });
    //   await weth.connect(buyer).approve(exchangeHandler.address, inputAmount);

    // Approve transfers
    // Buyer does not approve, since its in ETH.
    // Seller approves price discovery to transfer the voucher
    // await bosonVoucher.connect(assistant).setApprovalForAll(pool.address, true);
    tx = await priceDiscoveryHandler
      .connect(buyer)
      .commitToPriceDiscoveryOffer(buyer.address, offer.id, priceDiscovery, {
        value: inputAmount,
      });

    await expect(tx).to.not.emit(exchangeHandler, "BuyerCommitted");
    //    await expect(tx).to.emit(pool, "SwapNFTOutPair");
  });
});
