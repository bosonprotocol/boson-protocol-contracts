const { ethers } = require("hardhat");
const { ZeroHash, ZeroAddress, getContractAt, getContractFactory, MaxUint256 } = ethers;

const {
  calculateBosonProxyAddress,
  calculateCloneAddress,
  deriveTokenId,
  getEvent,
  setupTestEnvironment,
  revertToSnapshot,
  getSnapshot,
  objectToArray,
} = require("../../util/utils");

const {
  mockSeller,
  mockAuthToken,
  mockVoucherInitValues,
  mockOffer,
  mockDisputeResolver,
  accountId,
} = require("../../util/mock");
const { assert } = require("chai");
const { DisputeResolverFee } = require("../../../scripts/domain/DisputeResolverFee");
const SeaportSide = require("../seaport/SideEnum");
const Side = require("../../../scripts/domain/Side");
const PriceDiscovery = require("../../../scripts/domain/PriceDiscovery");
const PriceType = require("../../../scripts/domain/PriceType");
const { seaportFixtures } = require("../seaport/fixtures");
const { SEAPORT_ADDRESS } = require("../../util/constants");
const ItemType = require("../seaport/ItemTypeEnum");

describe("[@skip-on-coverage] seaport integration", function () {
  this.timeout(100000000);
  let bosonVoucher;
  let assistant, buyer, DR;
  let fixtures;
  let offer, offerDates;
  let priceDiscoveryHandler, fundsHandler;
  let weth;
  let seller;
  let seaport;
  let snapshotId;
  let bpd;

  before(async function () {
    accountId.next();
    // Specify contracts needed for this test
    const contracts = {
      accountHandler: "IBosonAccountHandler",
      offerHandler: "IBosonOfferHandler",
      fundsHandler: "IBosonFundsHandler",
      priceDiscoveryHandler: "IBosonPriceDiscoveryHandler",
      configHandler: "IBosonConfigHandler",
    };

    const wethFactory = await getContractFactory("WETH9");
    weth = await wethFactory.deploy();
    await weth.waitForDeployment();

    let accountHandler, offerHandler, configHandler;

    ({
      signers: [, assistant, buyer, DR],
      contractInstances: { accountHandler, offerHandler, priceDiscoveryHandler, fundsHandler, configHandler },
      extraReturnValues: { bosonVoucher },
    } = await setupTestEnvironment(contracts, {
      wethAddress: await weth.getAddress(),
    }));

    // Add BosonPriceDiscovery
    const bpdFactory = await getContractFactory("BosonPriceDiscovery");
    bpd = await bpdFactory.deploy(await weth.getAddress(), await priceDiscoveryHandler.getAddress());
    await bpd.waitForDeployment();

    await configHandler.setPriceDiscoveryAddress(await bpd.getAddress());

    seller = mockSeller(assistant.address, assistant.address, ZeroAddress, assistant.address);

    const emptyAuthToken = mockAuthToken();
    const voucherInitValues = mockVoucherInitValues();
    await accountHandler.connect(assistant).createSeller(seller, emptyAuthToken, voucherInitValues);

    const disputeResolver = mockDisputeResolver(DR.address, DR.address, ZeroAddress, DR.address, true);

    const disputeResolverFees = [new DisputeResolverFee(ZeroAddress, "Native", "0")];
    const sellerAllowList = [seller.id];

    await accountHandler.connect(DR).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

    let offerDurations, drParams;
    ({ offer, offerDates, offerDurations, drParams } = await mockOffer());
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

    const beaconProxyAddress = await calculateBosonProxyAddress(await accountHandler.getAddress());
    const voucherAddress = calculateCloneAddress(await accountHandler.getAddress(), beaconProxyAddress, seller.admin);
    bosonVoucher = await getContractAt("BosonVoucher", voucherAddress);

    seaport = await getContractAt("Seaport", SEAPORT_ADDRESS);

    await bosonVoucher.connect(assistant).setApprovalForAllToContract(SEAPORT_ADDRESS, true);

    fixtures = await seaportFixtures(seaport);

    // Pre mint range
    await offerHandler.connect(assistant).reserveRange(offer.id, offer.quantityAvailable, voucherAddress);
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

  it("Seaport criteria-based order is used as price discovery mechanism for a BP offer", async function () {
    // Create seaport offer which tokenId 1
    const seaportOffer = fixtures.getTestVoucher(
      ItemType.ERC721_WITH_CRITERIA,
      0,
      await bosonVoucher.getAddress(),
      1,
      1
    );
    const consideration = fixtures.getTestToken(
      ItemType.NATIVE,
      0,
      ZeroAddress,
      offer.price,
      offer.price,
      await bosonVoucher.getAddress()
    );

    const { order, orderHash, value } = await fixtures.getOrder(
      bosonVoucher,
      undefined,
      [seaportOffer], //offer
      [consideration],
      0, // full
      offerDates.validFrom, // startDate
      offerDates.validUntil // endDate
    );

    const orders = [objectToArray(order)];
    const calldata = seaport.interface.encodeFunctionData("validate", [orders]);

    const seaportAddress = await seaport.getAddress();
    await bosonVoucher.connect(assistant).callExternalContract(seaportAddress, calldata);
    await bosonVoucher.connect(assistant).setApprovalForAllToContract(seaportAddress, true);

    let totalFilled, isValidated;

    ({ isValidated, totalFilled } = await seaport.getOrderStatus(orderHash));
    assert(isValidated, "Order is not validated");
    assert.equal(totalFilled, 0n);

    // turn order into advanced order
    order.denominator = 1;
    order.numerator = 1;
    order.extraData = "0x";

    const identifier = deriveTokenId(offer.id, 2);
    const resolvers = [fixtures.getCriteriaResolver(0, SeaportSide.OFFER, 0, identifier, [])];

    const priceDiscoveryData = seaport.interface.encodeFunctionData("fulfillAdvancedOrder", [
      order,
      resolvers,
      ZeroHash,
      ZeroAddress,
    ]);

    const priceDiscovery = new PriceDiscovery(value, Side.Ask, seaportAddress, seaportAddress, priceDiscoveryData);

    // Seller needs to deposit in order to fill the escrow at the last step
    await fundsHandler.connect(assistant).depositFunds(seller.id, ZeroAddress, value, { value: value });

    const tx = await priceDiscoveryHandler
      .connect(buyer)
      .commitToPriceDiscoveryOffer(buyer.address, identifier, priceDiscovery, {
        value,
      });

    const receipt = await tx.wait();

    ({ totalFilled } = await seaport.getOrderStatus(orderHash));
    assert.equal(totalFilled, 1n);
    const event = getEvent(receipt, seaport, "OrderFulfilled");

    assert.equal(orderHash, event[0]);
  });
});
