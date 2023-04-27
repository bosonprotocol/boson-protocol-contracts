const hre = require("hardhat");
const ethers = hre.ethers;
const {
  calculateContractAddress,
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
const { constants } = require("ethers");
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
  let exchangeHandler, priceDiscoveryHandler;
  let weth;
  let seller;
  let seaport;
  let snapshotId;

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
      signers: [, assistant, buyer, DR],
      contractInstances: { accountHandler, offerHandler, fundsHandler, exchangeHandler, priceDiscoveryHandler },
      extraReturnValues: { bosonVoucher },
    } = await setupTestEnvironment(contracts, { wethAddress: weth.address }));

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
    offer.priceType = PriceType.Discovery;

    await offerHandler
      .connect(assistant)
      .createOffer(offer.toStruct(), offerDates.toStruct(), offerDurations.toStruct(), disputeResolverId, "0");

    const voucherAddress = calculateContractAddress(accountHandler.address, seller.id);
    bosonVoucher = await ethers.getContractAt("BosonVoucher", voucherAddress);

    seaport = await ethers.getContractAt("Seaport", SEAPORT_ADDRESS);

    await bosonVoucher.connect(assistant).setApprovalForAllToContract(seaport.address, true);

    fixtures = await seaportFixtures(seaport);

    // Pre mint range
    await offerHandler.connect(assistant).reserveRange(offer.id, offer.quantityAvailable, bosonVoucher.address);
    await bosonVoucher.connect(assistant).preMint(offer.id, offer.quantityAvailable);

    // Deposit seller funds so the commit will succeed
    await fundsHandler
      .connect(assistant)
      .depositFunds(seller.id, ethers.constants.AddressZero, offer.sellerDeposit, { value: offer.sellerDeposit });

    // Get snapshot id
    snapshotId = await getSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();
  });

  it("Seaport criteria-based order is used as price discovery mechanism for a BP offer", async function () {
    // Create seaport offer which tokenId 1
    const seaportOffer = fixtures.getTestVoucher(ItemType.ERC721_WITH_CRITERIA, 0, bosonVoucher.address, 1, 1);
    const consideration = fixtures.getTestToken(
      ItemType.NATIVE,
      0,
      constants.AddressZero,
      offer.price,
      offer.price,
      bosonVoucher.address
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

    await bosonVoucher.connect(assistant).callExternalContract(seaport.address, calldata);
    await bosonVoucher.connect(assistant).setApprovalForAllToContract(seaport.address, true);

    let totalFilled, isValidated;

    ({ isValidated, totalFilled } = await seaport.getOrderStatus(orderHash));
    assert(isValidated, "Order is not validated");
    assert.equal(totalFilled.toNumber(), 0);

    // turn order into advanced order
    order.denominator = 1;
    order.numerator = 1;
    order.extraData = "0x";

    const identifier = deriveTokenId(offer.id, 2);
    const resolvers = [fixtures.getCriteriaResolver(0, SeaportSide.OFFER, 0, identifier, [])];

    const priceDiscoveryData = seaport.interface.encodeFunctionData("fulfillAdvancedOrder", [
      order,
      resolvers,
      constants.HashZero,
      constants.AddressZero,
    ]);

    const priceDiscovery = new PriceDiscovery(value, seaport.address, priceDiscoveryData, Side.Ask);

    // Seller needs to deposit weth in order to fill the escrow at the last step
    await weth.connect(buyer).deposit({ value });
    await weth.connect(buyer).approve(exchangeHandler.address, value);

    const tx = await priceDiscoveryHandler
      .connect(buyer)
      .commitToPriceDiscoveryOffer(buyer.address, offer.id, priceDiscovery, {
        value,
      });

    const receipt = await tx.wait();

    ({ totalFilled } = await seaport.getOrderStatus(orderHash));
    assert.equal(totalFilled.toNumber(), 1);
    const event = getEvent(receipt, seaport, "OrderFulfilled");

    assert.equal(orderHash, event[0]);
  });
});
