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
const PriceType = require("../../../scripts/domain/PriceType");
const MASK = ethers.BigNumber.from(2).pow(128).sub(1);

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

    const disputeResolverFees = [new DisputeResolverFee(weth.address, "WETH", "0")];
    const sellerAllowList = [seller.id];

    await accountHandler.connect(DR).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

    let offerDates, offerDurations, disputeResolverId;
    ({ offer, offerDates, offerDurations, disputeResolverId } = await mockOffer());
    offer.exchangeToken = weth.address;
    offer.quantityAvailable = 10;
    offer.priceType = PriceType.Discovery;

    await offerHandler
      .connect(assistant)
      .createOffer(offer.toStruct(), offerDates.toStruct(), offerDurations.toStruct(), disputeResolverId, "0");

    const pool = ethers.BigNumber.from(offer.sellerDeposit).mul(offer.quantityAvailable);

    await weth.connect(assistant).deposit({ value: pool });

    // Approves protocol to transfer sellers weth
    await weth.connect(assistant).approve(fundsHandler.address, pool);

    // Deposit funds
    await fundsHandler.connect(assistant).depositFunds(seller.id, weth.address, pool);

    // Reverse range
    await offerHandler.connect(assistant).reserveRange(offer.id, offer.quantityAvailable, assistant.address);

    // Gets boson voucher contract
    const voucherAddress = calculateContractAddress(accountHandler.address, seller.id);
    bosonVoucher = await ethers.getContractAt("BosonVoucher", voucherAddress);

    // Pre mint range
    await bosonVoucher.connect(assistant).preMint(offer.id, offer.quantityAvailable);
  });

  it("Works with wrapper vouchers", async function () {
    const poolType = 1; // NFT
    const delta = ethers.utils.parseUnits("0.25", "ether").toString();
    const fee = "0";
    const spotPrice = offer.price;
    const nftIds = [];

    for (let i = 1; i <= offer.quantityAvailable; i++) {
      const tokenId = deriveTokenId(offer.id, i);
      nftIds.push(tokenId);
    }

    const initialPoolBalance = ethers.utils.parseUnits("10", "ether").toString();
    await weth.connect(assistant).deposit({ value: initialPoolBalance });
    await weth.connect(assistant).approve(lssvmPairFactory.address, ethers.constants.MaxUint256);

    const WrappedBosonVoucherFactory = await ethers.getContractFactory("SudoswapWrapper");
    const wrappedBosonVoucher = await WrappedBosonVoucherFactory.connect(assistant).deploy(
      bosonVoucher.address,
      lssvmPairFactory.address,
      exchangeHandler.address,
      weth.address
    );

    await bosonVoucher.connect(assistant).setApprovalForAll(wrappedBosonVoucher.address, true);

    await wrappedBosonVoucher.connect(assistant).wrap(nftIds);

    const createPairERC20Parameters = {
      token: weth.address,
      nft: wrappedBosonVoucher.address,
      bondingCurve: linearCurve.address,
      assetRecipient: wrappedBosonVoucher.address,
      poolType,
      delta,
      fee,
      spotPrice,
      initialNFTIDs: nftIds,
      initialTokenBalance: initialPoolBalance,
    };

    await wrappedBosonVoucher.connect(assistant).setApprovalForAll(lssvmPairFactory.address, true);

    let tx = await lssvmPairFactory.connect(assistant).createPairERC20(createPairERC20Parameters);

    const { events } = await tx.wait();

    const [poolAddress] = events.find((e) => e.event == "NewPair").args;

    await wrappedBosonVoucher.connect(assistant).setPoolAddress(poolAddress);

    const pool = await ethers.getContractAt("LSSVMPairMissingEnumerable", poolAddress);

    const [, , , inputAmount] = await pool.getBuyNFTQuote(1);

    await weth.connect(buyer).deposit({ value: inputAmount.mul(2) });
    await weth.connect(buyer).approve(wrappedBosonVoucher.address, inputAmount.mul(2));

    const tokenId = deriveTokenId(offer.id, 1);

    const swapTokenTx = await wrappedBosonVoucher.connect(buyer).swapTokenForSpecificNFT(tokenId, inputAmount);

    expect(swapTokenTx).to.emit(pool, "SwapTokenForAnyNFTs");

    const calldata = wrappedBosonVoucher.interface.encodeFunctionData("unwrap", [tokenId]);

    const priceDiscovery = new PriceDiscovery(inputAmount, wrappedBosonVoucher.address, calldata, Side.Ask);

    const protocolBalanceBefore = await weth.balanceOf(exchangeHandler.address);

    tx = await priceDiscoveryHandler.connect(buyer).commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery);

    await expect(tx).to.emit(exchangeHandler, "BuyerCommitted");

    const { timestamp } = await ethers.provider.getBlock(tx.blockNumber);
    expect(await bosonVoucher.ownerOf(tokenId)).to.equal(buyer.address);

    const protocolBalanceAfter = await weth.balanceOf(exchangeHandler.address);

    expect(protocolBalanceAfter).to.equal(protocolBalanceBefore.add(inputAmount));

    const exchangeId = tokenId.and(MASK);
    const [, , voucher] = await exchangeHandler.getExchange(exchangeId);

    expect(voucher.committedDate).to.equal(timestamp);
  });
});
