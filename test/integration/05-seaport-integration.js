const hre = require("hardhat");
const ethers = hre.ethers;
const { constants, BigNumber } = ethers;

// const shell = require("shelljs");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond");
const { deployAndCutFacets } = require("../../scripts/util/deploy-protocol-handler-facets");
const { mockVoucherInitValues } = require("../util/mock");
const { getFacetsWithArgs, getEvent, toHex } = require("../util/utils");
const { oneWeek, oneMonth, maxPriorityFeePerGas } = require("../util/constants");

const { assert } = require("chai");
const Role = require("../../scripts/domain/Role");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const { abi } = require("./seaport/artifacts/contracts/Seaport.sol/Seaport.json");
let { seaportFixtures } = require("./seaport/fixtures.js");
const { getBasicOrderParameters } = require("./seaport/utils");

const formatStruct = (input) => {
  // convert BigNumber to number
  if (BigNumber.isBigNumber(input)) {
    return input.toNumber();
  }

  // If the input is not an object, return it as-is
  if (typeof input !== "object" || input === null) {
    return input;
  }

  // If the input is an array, convert its elements recursively
  if (Array.isArray(input)) {
    return input.map((p) => formatStruct(p));
  }

  // If the input is an object, convert its properties recursively
  const keys = Object.keys(input);
  const result = {};
  for (const key of keys) {
    const value = formatStruct(input[key]);
    result[key] = value;
  }
};

const objectToArray = (input) => {
  // If the input is not an object, return it as-is
  if (BigNumber.isBigNumber(input) || typeof input !== "object" || input === null) {
    return input;
  }

  // If the input is an array, convert its elements recursively
  if (Array.isArray(input)) {
    return input.map((element) => objectToArray(element));
  }

  // If the input is an object, convert its properties recursively
  const keys = Object.keys(input);
  const result = new Array(keys.length);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const value = objectToArray(input[key]);
    result[i] = value;
  }
  return result;
};

describe("[@skip-on-coverage] Seaport integration", function () {
  this.timeout(10000000);
  let seaport;
  let bosonVoucher, bosonToken;
  let deployer, protocol, assistant, buyer;

  const startDate = new Date();
  const endDate = new Date().setDate(startDate.getDate() + 30);

  before(async function () {
    let protocolTreasury;
    [deployer, protocol, assistant, protocolTreasury, buyer] = await ethers.getSigners();

    seaport = await ethers.getContractAt(abi, "0x00000000000001ad428e4906aE43D8F9852d0dD6");

    const { chainId } = await ethers.provider.getNetwork();

    seaportFixtures = await seaportFixtures(chainId);

    // Deploy diamond
    let [protocolDiamond, , , , accessController] = await deployProtocolDiamond(maxPriorityFeePerGas);

    // Cast Diamond to contract interfaces
    // offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);
    // accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);
    // exchangeHandler = await ethers.getContractAt("IBosonExchangeHandler", protocolDiamond.address);
    // fundsHandler = await ethers.getContractAt("IBosonFundsHandler", protocolDiamond.address);
    // configHandler = await ethers.getContractAt("IBosonConfigHandler", protocolDiamond.address);

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

    // Initialize voucher contract
    const sellerId = 1;

    // prepare the VoucherInitValues
    const voucherInitValues = mockVoucherInitValues();
    const bosonVoucherInit = await ethers.getContractAt("BosonVoucher", bosonVoucher.address);

    await bosonVoucherInit.initializeVoucher(sellerId, assistant.address, voucherInitValues);
  });

  it("Voucher contract can be used as a bridge between seaport and seller operations", async function () {
    const offer = seaportFixtures.getTestVoucher(0, bosonVoucher.address, 1, 1);
    const consideration = seaportFixtures.getTestToken(0, undefined, 1, 2, bosonVoucher.address);
    const { order } = seaportFixtures.getOrder(
      bosonVoucher,
      undefined,
      [offer],
      [consideration],
      0, // full
      startDate.getTime(),
      endDate
    );

    const orders = [objectToArray(order)];
    const calldata = seaport.interface.encodeFunctionData("validate", [orders]);
    const tx = await bosonVoucher.connect(assistant).callExternalContract(seaport.address, calldata);
    const receipt = await tx.wait();

    const [, orderParameters] = getEvent(receipt, seaport, "OrderValidated");

    assert.deepEqual(orderParameters, objectToArray(order.parameters));
  });

  it.only("Seaport is allowed to transfer vouchers", async function () {
    const offer = seaportFixtures.getTestVoucher(0, bosonVoucher.address, 1, 1);
    const consideration = seaportFixtures.getTestToken(0, undefined, 1, 2, bosonVoucher.address);
    const { order, value } = seaportFixtures.getOrder(
      bosonVoucher,
      undefined,
      [offer],
      [consideration],
      0, // full
      startDate.getTime(),
      endDate
    );

    const orders = [objectToArray(order)];
    const calldata = seaport.interface.encodeFunctionData("validate", [orders]);
    await bosonVoucher.connect(assistant).callExternalContract(seaport.address, calldata);

    const basicOrderParameters = getBasicOrderParameters(order);

    console.log(order.parameters.startTime);
    console.log(order.parameters.endTime);
    const tx = await seaport.connect(buyer).fulfillBasicOrder(basicOrderParameters, { value });
    const receipt = await tx.wait();
  });

  context("Revert reasons", function () {
    it("Transaction reverts if the seaport call reverts", function () {});
  });
});
