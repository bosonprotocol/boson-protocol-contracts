const hre = require("hardhat");
const ethers = hre.ethers;
const gasLimit = hre.network.config.blockGasLimit;
const simpleStatistic = require("simple-statistics");
const fs = require("fs");

const { limitsToEstimate } = require("../config/limit-estimation");

const Role = require("../domain/Role");
const { DisputeResolverFee } = require("../domain/DisputeResolverFee");
const { deployProtocolDiamond } = require("../util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../util/deploy-protocol-config-facet.js");
const { deployProtocolClients } = require("../util/deploy-protocol-clients");
const { oneWeek, oneMonth } = require("../../test/utils/constants");
const { mockSeller, mockDisputeResolver, mockVoucherInitValues, mockAuthToken } = require("../../test/utils/mock");

// Common vars
let deployer, pauser, operator, admin, clerk, treasury, other1, other2, other3, protocolAdmin;
let protocolDiamond, accessController, accountHandler;
let protocolFeePercentage, protocolFeeFlatBoson, buyerEscalationDepositPercentage;
let handlers = {};
let result = {};

let setupEnvironment = {};
setupEnvironment["maxAllowedSellers"] = async function () {
  // AuthToken
  const emptyAuthToken = mockAuthToken();
  const voucherInitValues = mockVoucherInitValues();
  const sellerCount = 10;

  for (let i = 0; i < sellerCount; i++) {
    const wallet = ethers.Wallet.createRandom();
    const seller = mockSeller(wallet.address, wallet.address, wallet.address, wallet.address);
    await accountHandler.createSeller(seller, emptyAuthToken, voucherInitValues);
  }

  const disputeResolver = mockDisputeResolver(operator.address, admin.address, clerk.address, treasury.address);

  //Create DisputeResolverFee array
  const disputeResolverFees = [
    new DisputeResolverFee(other1.address, "MockToken1", "100"),
    new DisputeResolverFee(other2.address, "MockToken2", "200"),
    new DisputeResolverFee(other3.address, "MockToken3", "300"),
  ];

  const sellerAllowList = [...Array(sellerCount + 1).keys()].slice(1);
  const args = [disputeResolver, disputeResolverFees, sellerAllowList];
  const arrayIndex = 2;

  return { createDisputeResolver: { account: operator, args, arrayIndex } };
};

async function estimateLimits() {
  await setupCommonEnvironment();
  for (const limit of limitsToEstimate.limits) {
    const inputs = await setupEnvironment[limit.name]();
    await estimateLimit(limit, inputs, limitsToEstimate.safeGasLimitPercent);
  }
  fs.writeFileSync(__dirname + "/limit_estimates.json", JSON.stringify(result));
}

async function estimateLimit(limit, inputs, safeGasLimitPercent) {
  result[limit.name] = {};
  for (const [method, handler] of Object.entries(limit.methods)) {
    const methodInputs = inputs[method];
    if (methodInputs === undefined) {
      console.log(`Missing setup for ${limit.name}:${method}`);
      continue;
    }

    const maxArrayLength = methodInputs.args[methodInputs.arrayIndex].length;
    let gasEstimates = [];
    for (let o = 0; Math.pow(10, o) <= maxArrayLength; o++) {
      console.log("order", o);
      for (let i = 1; i < 10; i++) {
        let arrayLength = i * Math.pow(10, o);
        if (arrayLength > maxArrayLength) arrayLength = maxArrayLength;

        const args = methodInputs.args;
        const adjustedArgs = [
          ...args.slice(0, methodInputs.arrayIndex),
          args[methodInputs.arrayIndex].slice(0, arrayLength),
          ...args.slice(methodInputs.arrayIndex + 1),
        ];

        const gasEstimate = await handlers[handler].estimateGas[method](...adjustedArgs, { gasLimit });
        console.log(arrayLength, gasEstimate);
        gasEstimates.push([gasEstimate.toNumber(), arrayLength]);
        if (arrayLength == maxArrayLength) break;
      }
    }
    const { maxNumber, safeNumber } = calculateLimit(gasEstimates, safeGasLimitPercent);
    result[limit.name][method] = { gasEstimates, maxNumber, safeNumber };
  }
}

function calculateLimit(gasEstimates, safeGasLimitPercent) {
  const regCoef = simpleStatistic.linearRegression(gasEstimates);
  const line = simpleStatistic.linearRegressionLine(regCoef);

  const maxNumber = Math.floor(line(gasLimit));
  const safeNumber = Math.floor(line((gasLimit * safeGasLimitPercent) / 100));
  return { maxNumber, safeNumber };
}

async function setupCommonEnvironment() {
  // Make accounts available
  [deployer, pauser, operator, admin, clerk, treasury, other1, other2, other3, protocolAdmin] =
    await ethers.getSigners();

  // Deploy the Protocol Diamond
  [protocolDiamond, , , , accessController] = await deployProtocolDiamond();

  // Temporarily grant UPGRADER role to deployer account
  await accessController.grantRole(Role.UPGRADER, deployer.address);

  // Grant PROTOCOL role to ProtocolDiamond address and renounces admin
  await accessController.grantRole(Role.PROTOCOL, protocolDiamond.address);

  //Grant ADMIN role to and address that can call restricted functions.
  //This ADMIN role is a protocol-level role. It is not the same an admin address for an account type
  await accessController.grantRole(Role.ADMIN, protocolAdmin.address);

  // Temporarily grant PAUSER role to pauser account
  await accessController.grantRole(Role.PAUSER, pauser.address);

  // Cut the protocol handler facets into the Diamond
  await deployProtocolHandlerFacets(protocolDiamond, [
    "AccountHandlerFacet",
    "SellerHandlerFacet",
    "DisputeResolverHandlerFacet",
    "PauseHandlerFacet",
  ]);

  // Deploy the Protocol client implementation/proxy pairs (currently just the Boson Voucher)
  const protocolClientArgs = [accessController.address, protocolDiamond.address];
  const [, beacons, proxies] = await deployProtocolClients(protocolClientArgs, gasLimit);
  const [beacon] = beacons;
  const [proxy] = proxies;

  // set protocolFees
  protocolFeePercentage = "200"; // 2 %
  protocolFeeFlatBoson = ethers.utils.parseUnits("0.01", "ether").toString();
  buyerEscalationDepositPercentage = "1000"; // 10%

  // Add config Handler, so ids start at 1, and so voucher address can be found
  const protocolConfig = [
    // Protocol addresses
    {
      treasury: ethers.constants.AddressZero,
      token: ethers.constants.AddressZero,
      voucherBeacon: beacon.address,
      beaconProxy: proxy.address,
    },
    // Protocol limits
    {
      maxExchangesPerBatch: 10000,
      maxOffersPerGroup: 10000,
      maxTwinsPerBundle: 10000,
      maxOffersPerBundle: 10000,
      maxOffersPerBatch: 10000,
      maxTokensPerWithdrawal: 10000,
      maxFeesPerDisputeResolver: 10000,
      maxEscalationResponsePeriod: oneMonth,
      maxDisputesPerBatch: 10000,
      maxAllowedSellers: 10000,
      maxTotalOfferFeePercentage: 4000, //40%
      maxRoyaltyPecentage: 1000, //10%
      maxResolutionPeriod: oneMonth,
      minFulfillmentPeriod: oneWeek,
    },
    // Protocol fees
    {
      percentage: protocolFeePercentage,
      flatBoson: protocolFeeFlatBoson,
    },
    buyerEscalationDepositPercentage,
  ];

  await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);

  // Cast Diamond to IBosonAccountHandler. Use this interface to call all individual account handlers
  accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);

  // //Cast Diamond to IBosonConfigHancler
  // configHandler = await ethers.getContractAt("IBosonConfigHandler", protocolDiamond.address);

  // // Cast Diamond to IBosonPauseHandler
  // pauseHandler = await ethers.getContractAt("IBosonPauseHandler", protocolDiamond.address);

  // console.log("done common setup")

  handlers = {
    IBosonAccountHandler: accountHandler,
  };
}

estimateLimits();
