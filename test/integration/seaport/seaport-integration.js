const { ethers } = require("hardhat");
const { ZeroAddress, BigNumber, getContractAt, ZeroHash } = ethers;
const {
  setupTestEnvironment,
  getEvent,
  calculateBosonProxyAddress,
  calculateCloneAddress,
  objectToArray,
} = require("../../util/utils");
const { SEAPORT_ADDRESS } = require("../../util/constants");

const {
  mockSeller,
  mockAuthToken,
  mockVoucherInitValues,
  mockOffer,
  mockDisputeResolver,
  accountId,
} = require("../../util/mock");
const { assert, expect } = require("chai");
let { seaportFixtures } = require("./fixtures.js");
const { DisputeResolverFee } = require("../../../scripts/domain/DisputeResolverFee");
const ItemType = require("./ItemTypeEnum");

// This test checks whether the Boson Voucher contract can be used as the offerer in Seaport offers.
// We need to handle funds internally on the protocol, and Seaport sends the money to the offerer's account.
// Therefore, we need to use the BV contract as the offerer to manage funds.
// Seaport allows offer creation in two ways: signing a message or calling an on-chain validate function.
// Contract accounts cannot sign messages. Therefore, we have created a function on the BV contract that can run arbitrary methods,
// which only the BV contract owner (assistant) can call.
// Requirements to run this test:
// - Seaport submodule contains a `artifacts` folder inside it. Run `git submodule update --init --recursive` to get it.
// - Set hardhat config to hardhat-fork.config.js. e.g.:
//   npx hardhat test test/integration/seaport/seaport-integration.js --config hardhat-fork.config.js
describe("[@skip-on-coverage] Seaport integration", function () {
  let seaport;
  let bosonVoucher;
  let assistant, buyer, DR;
  let calldata, order, orderHash, value;

  before(async function () {
    accountId.next(true);

    seaport = await getContractAt("Seaport", SEAPORT_ADDRESS);
    seaportFixtures = await seaportFixtures(seaport);

    // Specify contracts needed for this test
    const contracts = {
      accountHandler: "IBosonAccountHandler",
      offerHandler: "IBosonOfferHandler",
      fundsHandler: "IBosonFundsHandler",
    };

    let accountHandler, offerHandler, fundsHandler;
    ({
      signers: [assistant, buyer, DR],
      contractInstances: { accountHandler, offerHandler, fundsHandler },
    } = await setupTestEnvironment(contracts));

    const seller = mockSeller(
      await assistant.getAddress(),
      await assistant.getAddress(),
      ZeroAddress,
      await assistant.getAddress()
    );

    const emptyAuthToken = mockAuthToken();
    const voucherInitValues = mockVoucherInitValues();
    await accountHandler.connect(assistant).createSeller(seller, emptyAuthToken, voucherInitValues);

    const disputeResolver = mockDisputeResolver(
      await DR.getAddress(),
      await DR.getAddress(),
      ZeroAddress,
      await DR.getAddress(),
      true
    );

    const disputeResolverFees = [new DisputeResolverFee(ZeroAddress, "Native", "0")];
    const sellerAllowList = [];

    await accountHandler.connect(DR).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

    const { offer, offerDates, offerDurations, drParams } = await mockOffer();
    offer.quantityAvailable = 10;

    await offerHandler
      .connect(assistant)
      .createOffer(offer.toStruct(), offerDates.toStruct(), offerDurations.toStruct(), drParams, "0");

    const beaconProxyAddress = await calculateBosonProxyAddress(await accountHandler.getAddress());
    const voucherAddress = calculateCloneAddress(await accountHandler.getAddress(), beaconProxyAddress, seller.admin);
    bosonVoucher = await getContractAt("BosonVoucher", voucherAddress);

    // Pool needs to cover both seller deposit and price
    const pool = BigInt(offer.sellerDeposit) + offer.price;
    await fundsHandler.connect(assistant).depositFunds(seller.id, ZeroAddress, pool, {
      value: pool,
    });

    // Pre mint range
    await offerHandler.connect(assistant).reserveRange(offer.id, offer.quantityAvailable, voucherAddress);
    await bosonVoucher.connect(assistant).preMint(offer.id, offer.quantityAvailable);

    // Create seaport offer which tokenId 1
    const endDate = "0xff00000000000000000000000000";
    const seaportOffer = seaportFixtures.getTestVoucher(ItemType.ERC721, 1, voucherAddress, 1, 1);
    const consideration = seaportFixtures.getTestToken(ItemType.NATIVE, 0, undefined, 1, 2, voucherAddress);
    ({ order, orderHash, value } = await seaportFixtures.getOrder(
      bosonVoucher,
      undefined,
      [seaportOffer],
      [consideration],
      0, // full
      0,
      endDate
    ));

    const orders = [objectToArray(order)];
    calldata = seaport.interface.encodeFunctionData("validate", [orders]);
  });

  it("Voucher contract can be used to call seaport validate", async function () {
    const tx = await bosonVoucher.connect(assistant).callExternalContract(await seaport.getAddress(), calldata);
    const receipt = await tx.wait();

    const [, orderParameters] = getEvent(receipt, seaport, "OrderValidated");

    assert.deepEqual(orderParameters, objectToArray(order.parameters));
  });

  it("Seaport is allowed to transfer vouchers", async function () {
    await bosonVoucher.connect(assistant).callExternalContract(await seaport.getAddress(), calldata);
    await bosonVoucher.connect(assistant).setApprovalForAllToContract(await seaport.getAddress(), true);

    let totalFilled, isValidated;

    ({ isValidated, totalFilled } = await seaport.getOrderStatus(orderHash));
    assert(isValidated, "Order is not validated");
    assert.equal(totalFilled, 0n);

    const tx = await seaport.connect(buyer).fulfillOrder(order, ZeroHash, { value });
    const receipt = await tx.wait();

    const event = getEvent(receipt, seaport, "OrderFulfilled");

    ({ totalFilled } = await seaport.getOrderStatus(orderHash));
    assert.equal(totalFilled, 1n);

    assert.equal(orderHash, event[0]);
  });

  context("💔 Revert Reasons", function () {
    it("Boson voucher callExternalContract reverts if the seaport call reverts", async function () {
      order.parameters.totalOriginalConsiderationItems = BigNumber.from(2);
      const orders = [objectToArray(order)];
      calldata = seaport.interface.encodeFunctionData("validate", [orders]);

      await expect(
        bosonVoucher.connect(assistant).callExternalContract(await seaport.getAddress(), calldata)
      ).to.be.revertedWith("0x466aa616"); //MissingOriginalConsiderationItems
    });
  });
});
