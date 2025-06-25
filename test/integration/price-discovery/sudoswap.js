const { ethers } = require("hardhat");
const { ZeroAddress, MaxUint256, getContractFactory, getContractAt, parseUnits, provider, id } = ethers;
const {
  mockSeller,
  mockAuthToken,
  mockVoucherInitValues,
  mockOffer,
  mockDisputeResolver,
  accountId,
} = require("../../util/mock");
const { expect } = require("chai");
const {
  calculateBosonProxyAddress,
  calculateCloneAddress,
  deriveTokenId,
  setupTestEnvironment,
} = require("../../util/utils");

const { DisputeResolverFee } = require("../../../scripts/domain/DisputeResolverFee");
const Side = require("../../../scripts/domain/Side");
const PriceDiscovery = require("../../../scripts/domain/PriceDiscovery");
const PriceType = require("../../../scripts/domain/PriceType");

const MASK = (1n << 128n) - 1n;

describe("[@skip-on-coverage] sudoswap integration", function () {
  this.timeout(100000000);
  let lssvmPairFactory, linearCurve;
  let bosonVoucher;
  let deployer, assistant, buyer, DR;
  let offer;
  let exchangeHandler, priceDiscoveryHandler;
  let weth, wethAddress;
  let seller;
  let bpd;

  before(async function () {
    accountId.next();

    // Specify contracts needed for this test
    const contracts = {
      accountHandler: "IBosonAccountHandler",
      offerHandler: "IBosonOfferHandler",
      fundsHandler: "IBosonFundsHandler",
      exchangeHandler: "IBosonExchangeHandler",
      priceDiscoveryHandler: "IBosonPriceDiscoveryHandler",
      configHandler: "IBosonConfigHandler",
    };

    const wethFactory = await getContractFactory("WETH9");
    weth = await wethFactory.deploy();
    await weth.waitForDeployment();
    wethAddress = await weth.getAddress();

    let accountHandler, offerHandler, fundsHandler, configHandler;

    ({
      signers: [deployer, assistant, buyer, DR],
      contractInstances: {
        accountHandler,
        offerHandler,
        fundsHandler,
        exchangeHandler,
        priceDiscoveryHandler,
        configHandler,
      },
      extraReturnValues: { bosonVoucher },
    } = await setupTestEnvironment(contracts, { wethAddress }));

    // Add BosonPriceDiscovery
    const bpdFactory = await getContractFactory("BosonPriceDiscovery");
    bpd = await bpdFactory.deploy(await weth.getAddress(), await priceDiscoveryHandler.getAddress());
    await bpd.waitForDeployment();

    await configHandler.setPriceDiscoveryAddress(await bpd.getAddress());

    const LSSVMPairEnumerableETH = await getContractFactory("LSSVMPairEnumerableETH", deployer);
    const lssvmPairEnumerableETH = await LSSVMPairEnumerableETH.deploy();
    await lssvmPairEnumerableETH.waitForDeployment();

    const LSSVMPairEnumerableERC20 = await getContractFactory("LSSVMPairEnumerableERC20", deployer);
    const lssvmPairEnumerableERC20 = await LSSVMPairEnumerableERC20.deploy();
    await lssvmPairEnumerableERC20.waitForDeployment();

    const LSSVMPairMissingEnumerableETH = await getContractFactory("LSSVMPairMissingEnumerableETH", deployer);
    const lssvmPairMissingEnumerableETH = await LSSVMPairMissingEnumerableETH.deploy();

    const LSSVMPairMissingEnumerableERC20 = await getContractFactory("LSSVMPairMissingEnumerableERC20", deployer);
    const lssvmPairMissingEnumerableERC20 = await LSSVMPairMissingEnumerableERC20.deploy();

    const LSSVMPairFactory = await getContractFactory("LSSVMPairFactory", deployer);

    lssvmPairFactory = await LSSVMPairFactory.deploy(
      await lssvmPairEnumerableETH.getAddress(),
      await lssvmPairMissingEnumerableETH.getAddress(),
      await lssvmPairEnumerableERC20.getAddress(),
      await lssvmPairMissingEnumerableERC20.getAddress(),
      deployer.address,
      "0"
    );
    await lssvmPairFactory.waitForDeployment();

    // Deploy bonding curves
    const LinearCurve = await getContractFactory("LinearCurve", deployer);
    linearCurve = await LinearCurve.deploy();
    await linearCurve.waitForDeployment();

    // Whitelist bonding curve
    await lssvmPairFactory.setBondingCurveAllowed(await linearCurve.getAddress(), true);

    seller = mockSeller(assistant.address, assistant.address, ZeroAddress, assistant.address);

    const emptyAuthToken = mockAuthToken();
    const voucherInitValues = mockVoucherInitValues();
    await accountHandler.connect(assistant).createSeller(seller, emptyAuthToken, voucherInitValues);

    const disputeResolver = mockDisputeResolver(DR.address, DR.address, ZeroAddress, DR.address, true);

    const disputeResolverFees = [new DisputeResolverFee(wethAddress, "WETH", "0")];
    const sellerAllowList = [seller.id];

    await accountHandler.connect(DR).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

    let offerDates, offerDurations, drParams;
    ({ offer, offerDates, offerDurations, drParams } = await mockOffer());
    offer.exchangeToken = wethAddress;
    offer.quantityAvailable = 10;
    offer.priceType = PriceType.Discovery;
    const offerFeeLimit = MaxUint256; // unlimited offer fee to not affect the tests

    await offerHandler
      .connect(assistant)
      .createOffer(
        offer.toStruct(),
        offerDates.toStruct(),
        offerDurations.toStruct(),
        drParams,
        "0",
        offerFeeLimit
      );

    const pool = BigInt(offer.sellerDeposit) * BigInt(offer.quantityAvailable);

    await weth.connect(assistant).deposit({ value: pool });

    // Approves protocol to transfer sellers weth
    await weth.connect(assistant).approve(await fundsHandler.getAddress(), pool);

    // Deposit funds
    await fundsHandler.connect(assistant).depositFunds(seller.id, wethAddress, pool);

    // Reverse range
    await offerHandler.connect(assistant).reserveRange(offer.id, offer.quantityAvailable, assistant.address);

    // Gets boson voucher contract
    const beaconProxyAddress = await calculateBosonProxyAddress(await accountHandler.getAddress());
    const voucherAddress = calculateCloneAddress(await accountHandler.getAddress(), beaconProxyAddress, seller.admin);
    bosonVoucher = await getContractAt("BosonVoucher", voucherAddress);

    // Pre mint range
    await bosonVoucher.connect(assistant).preMint(offer.id, offer.quantityAvailable);
  });

  it("Works with wrapped vouchers", async function () {
    const poolType = 1; // NFT
    const delta = parseUnits("0.25", "ether").toString();
    const fee = "0";
    const spotPrice = offer.price;
    const nftIds = [];

    for (let i = 1; i <= offer.quantityAvailable; i++) {
      const tokenId = deriveTokenId(offer.id, i);
      nftIds.push(tokenId);
    }

    const initialPoolBalance = parseUnits("10", "ether").toString();
    await weth.connect(assistant).deposit({ value: initialPoolBalance });
    await weth.connect(assistant).approve(await lssvmPairFactory.getAddress(), MaxUint256);

    const WrappedBosonVoucherFactory = await getContractFactory("SudoswapWrapper");
    const wrappedBosonVoucher = await WrappedBosonVoucherFactory.connect(assistant).deploy(
      await bosonVoucher.getAddress(),
      await lssvmPairFactory.getAddress(),
      await exchangeHandler.getAddress(),
      wethAddress,
      await bpd.getAddress()
    );
    const wrappedBosonVoucherAddress = await wrappedBosonVoucher.getAddress();

    await bosonVoucher.connect(assistant).setApprovalForAll(wrappedBosonVoucherAddress, true);

    await wrappedBosonVoucher.connect(assistant).wrap(nftIds);

    const createPairERC20Parameters = {
      token: wethAddress,
      nft: wrappedBosonVoucherAddress,
      bondingCurve: await linearCurve.getAddress(),
      assetRecipient: wrappedBosonVoucherAddress,
      poolType,
      delta,
      fee,
      spotPrice,
      initialNFTIDs: nftIds,
      initialTokenBalance: initialPoolBalance,
    };

    await wrappedBosonVoucher.connect(assistant).setApprovalForAll(await lssvmPairFactory.getAddress(), true);

    let tx = await lssvmPairFactory.connect(assistant).createPairERC20(createPairERC20Parameters);

    const { logs } = await tx.wait();

    const NewPairTopic = id("NewPair(address)");
    const [poolAddress] = logs.find((e) => e?.topics[0] === NewPairTopic).args;

    await wrappedBosonVoucher.connect(assistant).setPoolAddress(poolAddress);

    const pool = await getContractAt("LSSVMPairMissingEnumerable", poolAddress);

    const [, , , inputAmount] = await pool.getBuyNFTQuote(1);

    await weth.connect(buyer).deposit({ value: inputAmount * 2n });
    await weth.connect(buyer).approve(wrappedBosonVoucherAddress, inputAmount * 2n);

    const tokenId = deriveTokenId(offer.id, 1);

    const swapTokenTx = await wrappedBosonVoucher.connect(buyer).swapTokenForSpecificNFT(tokenId, inputAmount);

    expect(swapTokenTx).to.emit(pool, "SwapTokenForAnyNFTs");

    const calldata = wrappedBosonVoucher.interface.encodeFunctionData("unwrap", [tokenId]);

    const priceDiscovery = new PriceDiscovery(
      inputAmount,
      Side.Wrapper,
      wrappedBosonVoucherAddress,
      wrappedBosonVoucherAddress,
      calldata
    );

    const protocolBalanceBefore = await weth.balanceOf(await exchangeHandler.getAddress());

    tx = await priceDiscoveryHandler.connect(buyer).commitToPriceDiscoveryOffer(buyer.address, tokenId, priceDiscovery);

    await expect(tx).to.emit(exchangeHandler, "BuyerCommitted");

    const { timestamp } = await provider.getBlock(tx.blockNumber);
    expect(await bosonVoucher.ownerOf(tokenId)).to.equal(buyer.address);

    const protocolBalanceAfter = await weth.balanceOf(await exchangeHandler.getAddress());

    expect(protocolBalanceAfter).to.equal(protocolBalanceBefore + inputAmount);

    const exchangeId = tokenId & MASK;
    const [, , voucher] = await exchangeHandler.getExchange(exchangeId);

    expect(voucher.committedDate).to.equal(timestamp);
  });
});
