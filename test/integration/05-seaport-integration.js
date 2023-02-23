const hre = require("hardhat");
const ethers = hre.ethers;
const { constants, BigNumber } = require("ethers");

// const shell = require("shelljs");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond");
const { deployAndCutFacets } = require("../../scripts/util/deploy-protocol-handler-facets");
const { mockVoucherInitValues } = require("../util/mock");
const { getFacetsWithArgs, getEvent } = require("../util/utils");
const { oneWeek, oneMonth, maxPriorityFeePerGas } = require("../util/constants");

const { assert } = require("chai");
const seaportArtifact = require("./seaport/artifacts/contracts/Seaport.sol/Seaport.json");
const Role = require("../../scripts/domain/Role");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const abi = seaportArtifact.abi;

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
  if (typeof input !== "object" || input === null) {
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
  let deployer, protocol, assistant;

  const startDate = new Date();
  const endDate = new Date().setDate(startDate.getDate() + 30);

  before(async function () {
    let protocolTreasury;
    [deployer, protocol, assistant, protocolTreasury] = await ethers.getSigners();
    seaport = await ethers.getContractAt(abi, "0x00000000000001ad428e4906aE43D8F9852d0dD6");

    let protocolDiamond, accessController;

    // Deploy diamond
    [protocolDiamond, , , , accessController] = await deployProtocolDiamond(maxPriorityFeePerGas);

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
    const parameters = {
      offerer: assistant.address,
      zone: constants.AddressZero,
      offer: [
        {
          itemType: 4, // maybe 2
          token: bosonToken.address,
          identifierOrCriteria: 0, // must be a merkle root with a seet of vouchers ids
          startAmount: 1,
          endAmount: 1,
        },
      ],
      consideration: [
        {
          itemType: 0, // native,
          token: constants.AddressZero, // native
          identifierOrCriteria: 0,
          startAmount: 1,
          endAmount: 2,
          recipient: bosonVoucher.address,
        },
      ],
      orderType: 0, // full
      startTime: startDate.getTime(),
      endTime: endDate, // value is already in timestamp
      zoneHash: constants.HashZero,
      salt: 0,
      conduitKey: constants.HashZero,
      totalOriginalConsiderationItems: 1,
    };

    const signature = "0x";
    const order = {
      parameters,
      signature,
    };
    const orders = [objectToArray(order)];

    const calldata = seaport.interface.encodeFunctionData("validate", [orders]);
    const tx = await bosonVoucher.connect(assistant).callExternalContract(seaport.address, calldata);
    const receipt = await tx.wait();

    const [, orderParameters] = getEvent(receipt, seaport, "OrderValidated");

    assert.deepEqual(orderParameters.map(formatStruct), objectToArray(parameters));
  });

  it("Seaport is allowed to transfer vouchers", async function () {});

  context("Revert reasons", function () {
    it("Transaction reverts if the seaport call reverts", function () {});
  });
});
