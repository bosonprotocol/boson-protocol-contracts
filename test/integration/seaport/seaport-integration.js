const hre = require("hardhat");
const ethers = hre.ethers;
const { constants, BigNumber } = ethers;
const { deployProtocolClients } = require("../../../scripts/util/deploy-protocol-clients");
const { deployProtocolDiamond } = require("../../../scripts/util/deploy-protocol-diamond");
const { deployAndCutFacets } = require("../../../scripts/util/deploy-protocol-handler-facets");
const { getFacetsWithArgs, getEvent, calculateContractAddress, objectToArray } = require("../../util/utils");
const { oneWeek, oneMonth, maxPriorityFeePerGas, SEAPORT_ADDRESS } = require("../../util/constants");

const { mockSeller, mockAuthToken, mockVoucherInitValues, mockOffer, mockDisputeResolver } = require("../../util/mock");
const { assert, expect } = require("chai");
const Role = require("../../../scripts/domain/Role");
const { deployMockTokens } = require("../../../scripts/util/deploy-mock-tokens");
let { seaportFixtures } = require("./fixtures.js");
const { DisputeResolverFee } = require("../../../scripts/domain/DisputeResolverFee");
const { RevertReasons } = require("../../../scripts/config/revert-reasons");

// Requirements to run this test:
// - Seaport submodule contains a `artifacts` folder inside it. Run `git submodule update --init --recursive` to get it.
// - Set hardhat config to hardhat-fork.config.js. e.g.:
//   npx hardhat test test/integration/seaport/seaport-integration.js --config ./hardhat-fork.config.js
describe("[@skip-on-coverage] Seaport integration", function () {
  let seaport;
  let bosonVoucher, bosonToken;
  let deployer, protocol, assistant, buyer, DR;
  let calldata, order, orderHash, value;

  before(async function () {
    let protocolTreasury;
    [deployer, protocol, assistant, protocolTreasury, buyer, DR] = await ethers.getSigners();

    const { abi } = require("../../../seaport/artifacts/contracts/Seaport.sol/Seaport.json");
    seaport = await ethers.getContractAt(abi, SEAPORT_ADDRESS);

    seaportFixtures = await seaportFixtures(seaport);

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

    const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
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
    await offerHandler.connect(assistant).reserveRange(offer.id, offer.quantityAvailable, bosonVoucher.address);
    await bosonVoucher.connect(assistant).preMint(offer.id, offer.quantityAvailable);

    // Create seaport offer which tokenId 1
    const endDate = "0xff00000000000000000000000000";
    const seaportOffer = seaportFixtures.getTestVoucher(1, bosonVoucher.address, 1, 1);
    const consideration = seaportFixtures.getTestToken(0, undefined, 1, 2, bosonVoucher.address);
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
    const tx = await bosonVoucher.connect(assistant).callExternalContract(seaport.address, calldata);
    const receipt = await tx.wait();

    const [, orderParameters] = getEvent(receipt, seaport, "OrderValidated");

    assert.deepEqual(orderParameters, objectToArray(order.parameters));
  });

  it("Seaport is allowed to transfer vouchers", async function () {
    await bosonVoucher.connect(assistant).callExternalContract(seaport.address, calldata);
    await bosonVoucher.connect(assistant).setApprovalForAllToContract(seaport.address, true);

    let totalFilled, isValidated;

    ({ isValidated, totalFilled } = await seaport.getOrderStatus(orderHash));
    assert(isValidated, "Order is not validated");
    assert.equal(totalFilled.toNumber(), 0);

    const tx = await seaport.connect(buyer).fulfillOrder(order, constants.HashZero, { value });
    const receipt = await tx.wait();

    const event = getEvent(receipt, seaport, "OrderFulfilled");

    ({ totalFilled } = await seaport.getOrderStatus(orderHash));
    assert.equal(totalFilled.toNumber(), 1);

    assert.equal(orderHash, event[0]);
  });

  context("💔 Revert Reasons", function () {
    it("Boson voucher callExternalContract reverts if the seaport call reverts", async function () {
      order.parameters.totalOriginalConsiderationItems = BigNumber.from(2);
      const orders = [objectToArray(order)];
      calldata = seaport.interface.encodeFunctionData("validate", [orders]);

      await expect(bosonVoucher.connect(assistant).callExternalContract(seaport.address, calldata)).to.be.revertedWith(
        RevertReasons.EXTERNAL_CALL_FAILED
      );
    });
  });
});
