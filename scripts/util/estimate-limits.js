const hre = require("hardhat");
const ethers = hre.ethers;
const gasLimit = hre.network.config.blockGasLimit;
const simpleStatistic = require("simple-statistics");
const fs = require("fs");

const { limitsToEstimate } = require("../config/limit-estimation");

const Role = require("../domain/Role");
const Bundle = require("../domain/Bundle");
const Group = require("../domain/Group");
const EvaluationMethod = require("../domain/EvaluationMethod");
const { DisputeResolverFee } = require("../domain/DisputeResolverFee");
const { deployProtocolDiamond } = require("../util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../util/deploy-protocol-config-facet.js");
const { deployProtocolClients } = require("../util/deploy-protocol-clients");
const { deployMockTokens } = require("../util/deploy-mock-tokens");
const { oneWeek, oneMonth } = require("../../test/utils/constants");
const {
  mockSeller,
  mockDisputeResolver,
  mockVoucherInitValues,
  mockAuthToken,
  mockCondition,
  mockOffer,
  mockTwin,
  accountId,
} = require("../../test/utils/mock");
const { setNextBlockTimestamp } = require("../util/test-utils.js");

// Common vars
let deployer,
  sellerWallet1,
  sellerWallet2,
  sellerWallet3,
  dr1,
  dr2,
  dr3,
  buyer,
  rando,
  other1,
  other2,
  other3,
  protocolAdmin,
  feeCollector;
let protocolDiamond,
  accessController,
  accountHandler,
  bundleHandler,
  disputeHandler,
  exchangeHandler,
  fundsHandler,
  groupHandler,
  offerHandler,
  twinHandler;
let protocolFeePercentage, protocolFeeFlatBoson, buyerEscalationDepositPercentage;
let handlers = {};
let result = {};

let setupEnvironment = {};

/*
For each limit from limitsToEstimate, a full setup is needed before a function that depends on a limit can be estimated.
Function that prepares an environment must return the object with invocation details for all methods that depened on a limit.
{ method_1: invocationDetails_1, method_2: invocationDetails_2, ..., method_n: invocationDetails_2}

Invocation details contain 
- account: account that calls the method (important if access is restiricted)
- args: array of arguments that needs to be passed into method
- arrayIndex: index that tells which parameter's length should be varied during the estimation
- structField: if array is part of a struct, specify the field name
*/

/*
Setup the environment for "maxAllowedSellers". The following functions depend on it:
- createDisputeResolver
- addSellersToAllowList
- removeSellersFromAllowList
*/
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

  //Create DisputeResolverFee array
  const disputeResolverFees = [
    new DisputeResolverFee(other1.address, "MockToken1", "100"),
    new DisputeResolverFee(other2.address, "MockToken2", "200"),
    new DisputeResolverFee(other3.address, "MockToken3", "300"),
  ];

  const sellerAllowList = [...Array(sellerCount + 1).keys()].slice(1);

  // Dispute resolver 2 - used in "addSellersToAllowList"
  const disputeResolver2 = mockDisputeResolver(dr2.address, dr2.address, dr2.address, dr2.address);
  await accountHandler.createDisputeResolver(disputeResolver2, disputeResolverFees, []);
  const args_2 = [disputeResolver2.id, sellerAllowList];
  const arrayIndex_2 = 1;

  // Dispute resolver 3 - used in "removeSellersFromAllowList"
  const disputeResolver3 = mockDisputeResolver(dr3.address, dr3.address, dr3.address, dr3.address);
  await accountHandler.createDisputeResolver(disputeResolver3, disputeResolverFees, sellerAllowList);
  const args_3 = [disputeResolver3.id, sellerAllowList];
  const arrayIndex_3 = 1;

  const disputeResolver1 = mockDisputeResolver(dr1.address, dr1.address, dr1.address, dr1.address);
  const args_1 = [disputeResolver1, disputeResolverFees, sellerAllowList];
  const arrayIndex_1 = 2;

  return {
    createDisputeResolver: { account: dr1, args: args_1, arrayIndex: arrayIndex_1 },
    addSellersToAllowList: { account: dr2, args: args_2, arrayIndex: arrayIndex_2 },
    removeSellersFromAllowList: { account: dr3, args: args_3, arrayIndex: arrayIndex_3 },
  };
};

/*
Setup the environment for "maxFeesPerDisputeResolver". The following functions depend on it:
- createDisputeResolver
- addFeesToDisputeResolver
- removeFeesFromDisputeResolver
*/
setupEnvironment["maxFeesPerDisputeResolver"] = async function () {
  const feesCount = 10;

  //Create DisputeResolverFee array
  let disputeResolverFees = [];
  for (let i = 0; i < feesCount; i++) {
    const wallet = ethers.Wallet.createRandom();
    disputeResolverFees.push(new DisputeResolverFee(wallet.address, `MockToken${i}`, "100"));
  }

  // Dispute resolver 2 - used in "addFeesToDisputeResolver"
  const disputeResolver2 = mockDisputeResolver(dr2.address, dr2.address, dr2.address, dr2.address);
  await accountHandler.createDisputeResolver(disputeResolver2, [], []);
  const args_2 = [disputeResolver2.id, disputeResolverFees];
  const arrayIndex_2 = 1;

  // Dispute resolver 3 - used in "removeFeesFromDisputeResolver"
  const disputeResolver3 = mockDisputeResolver(dr3.address, dr3.address, dr3.address, dr3.address);
  await accountHandler.createDisputeResolver(disputeResolver3, disputeResolverFees, []);
  const feeTokenAddressesToRemove = disputeResolverFees.map((DRfee) => DRfee.tokenAddress);
  const args_3 = [disputeResolver3.id, feeTokenAddressesToRemove];
  const arrayIndex_3 = 1;

  const disputeResolver1 = mockDisputeResolver(dr1.address, dr1.address, dr1.address, dr1.address);
  const args_1 = [disputeResolver1, disputeResolverFees, []];
  const arrayIndex_1 = 1;

  return {
    createDisputeResolver: { account: dr1, args: args_1, arrayIndex: arrayIndex_1 },
    addFeesToDisputeResolver: { account: dr2, args: args_2, arrayIndex: arrayIndex_2 },
    removeFeesFromDisputeResolver: { account: dr3, args: args_3, arrayIndex: arrayIndex_3 },
  };
};

/*
Setup the environment for "maxOffersPerBatch". The following functions depend on it:
- createOfferBatch
- voidOfferBatch
- extendOfferBatch
*/
setupEnvironment["maxOffersPerBatch"] = async function () {
  // create a seller
  // Required constructor params
  const agentId = "0"; // agent id is optional while creating an offer

  const seller1 = mockSeller(
    sellerWallet1.address,
    sellerWallet1.address,
    sellerWallet1.address,
    sellerWallet1.address
  );
  const voucherInitValues = mockVoucherInitValues();
  const emptyAuthToken = mockAuthToken();

  await accountHandler.connect(sellerWallet1).createSeller(seller1, emptyAuthToken, voucherInitValues);

  // Seller 2 - used in "voidOfferBatch"
  const seller2 = mockSeller(
    sellerWallet2.address,
    sellerWallet2.address,
    sellerWallet2.address,
    sellerWallet2.address
  );
  await accountHandler.connect(sellerWallet2).createSeller(seller2, emptyAuthToken, voucherInitValues);

  // Seller 3 - used in "extendOfferBatch"
  const seller3 = mockSeller(
    sellerWallet3.address,
    sellerWallet3.address,
    sellerWallet3.address,
    sellerWallet3.address
  );
  await accountHandler.connect(sellerWallet3).createSeller(seller3, emptyAuthToken, voucherInitValues);

  const disputeResolver = mockDisputeResolver(dr1.address, dr1.address, dr1.address, dr1.address);
  await accountHandler.createDisputeResolver(
    disputeResolver,
    [new DisputeResolverFee(ethers.constants.AddressZero, "Native", "100")],
    []
  );
  await accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id);

  const offerCount = 10;

  const { offer, offerDates, offerDurations } = await mockOffer();
  const offers = new Array(offerCount).fill(offer);
  const offerDatesList = new Array(offerCount).fill(offerDates);
  const offerDurationsList = new Array(offerCount).fill(offerDurations);
  const disputeResolverIds = new Array(offerCount).fill(disputeResolver.id);
  const agentIds = new Array(offerCount).fill(agentId);

  for (let i = 0; i < offerCount; i++) {
    // Create the offers for voiding/extending
    await offerHandler
      .connect(sellerWallet2)
      .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId);
    await offerHandler
      .connect(sellerWallet3)
      .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId);
  }

  const offerIds = [...Array(offerCount + 1).keys()].slice(1);

  const args_1 = [offers, offerDatesList, offerDurationsList, disputeResolverIds, agentIds];
  const arrayIndex_1 = [0, 1, 2, 3, 4]; // adjusting length of all arguments simultaneously

  // voidOfferBatch inputs
  const args_2 = [offerIds.map((offerId) => 2 * offerId - 1)];
  const arrayIndex_2 = 0;

  // extendOfferBatch
  const newValidUntilDate = ethers.BigNumber.from(offerDates.validUntil).add("10000").toString();
  const args_3 = [offerIds.map((offerId) => 2 * offerId), newValidUntilDate];
  const arrayIndex_3 = 0;

  return {
    createOfferBatch: { account: sellerWallet1, args: args_1, arrayIndex: arrayIndex_1 },
    voidOfferBatch: { account: sellerWallet2, args: args_2, arrayIndex: arrayIndex_2 },
    extendOfferBatch: { account: sellerWallet3, args: args_3, arrayIndex: arrayIndex_3 },
  };
};

/*
Setup the environment for "maxOffersPerGroup". The following functions depend on it:
- createGroup
- addOffersToGroup
- removeOffersFromGroup
*/
setupEnvironment["maxOffersPerGroup"] = async function () {
  // create a seller
  // Required constructor params
  const groupId = "1"; // argument sent to contract for createSeller will be ignored
  const agentId = "0"; // agent id is optional while creating an offer

  const seller1 = mockSeller(
    sellerWallet1.address,
    sellerWallet1.address,
    sellerWallet1.address,
    sellerWallet1.address
  );
  const voucherInitValues = mockVoucherInitValues();
  const emptyAuthToken = mockAuthToken();

  await accountHandler.connect(sellerWallet1).createSeller(seller1, emptyAuthToken, voucherInitValues);

  // Seller 2 - used in "addOffersToGroup"
  const seller2 = mockSeller(
    sellerWallet2.address,
    sellerWallet2.address,
    sellerWallet2.address,
    sellerWallet2.address
  );
  await accountHandler.connect(sellerWallet2).createSeller(seller2, emptyAuthToken, voucherInitValues);

  // Seller 3 - used in "removeOffersFromGroup"

  const seller3 = mockSeller(
    sellerWallet3.address,
    sellerWallet3.address,
    sellerWallet3.address,
    sellerWallet3.address
  );
  await accountHandler.connect(sellerWallet3).createSeller(seller3, emptyAuthToken, voucherInitValues);

  const disputeResolver = mockDisputeResolver(dr1.address, dr1.address, dr1.address, dr1.address);
  await accountHandler.createDisputeResolver(
    disputeResolver,
    [new DisputeResolverFee(ethers.constants.AddressZero, "Native", "100")],
    []
  );
  await accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id);

  const offerCount = 10;

  // Mock offer, offerDates and offerDurations
  const { offer, offerDates, offerDurations } = await mockOffer();

  for (let i = 0; i < offerCount; i++) {
    // Create the offer
    await offerHandler
      .connect(sellerWallet1)
      .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId);
    await offerHandler
      .connect(sellerWallet2)
      .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId);
    await offerHandler
      .connect(sellerWallet3)
      .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId);
  }

  const offerIds = [...Array(offerCount + 1).keys()].slice(1);
  const condition = mockCondition({ method: EvaluationMethod.None, threshold: "0", maxCommits: "0" });

  const group = new Group(groupId, seller1.id, offerIds);

  let group1 = group.clone();
  group1.offerIds = offerIds.map((offerId) => 3 * offerId - 2);
  const args_1 = [group1, condition];
  const arrayIndex_1 = 0;
  const structField_1 = "offerIds";

  let group2 = group.clone();
  group2.offerIds = [];
  await groupHandler.connect(sellerWallet2).createGroup(group2, condition);
  const args_2 = ["1", offerIds.map((offerId) => 3 * offerId - 1)];
  const arrayIndex_2 = 1;

  let group3 = group.clone();
  group3.offerIds = offerIds.map((offerId) => 3 * offerId);
  await groupHandler.connect(sellerWallet3).createGroup(group3, condition);
  const args_3 = ["2", group3.offerIds];
  const arrayIndex_3 = 1;

  return {
    createGroup: { account: sellerWallet1, args: args_1, arrayIndex: arrayIndex_1, structField: structField_1 },
    addOffersToGroup: { account: sellerWallet2, args: args_2, arrayIndex: arrayIndex_2 },
    removeOffersFromGroup: { account: sellerWallet3, args: args_3, arrayIndex: arrayIndex_3 },
  };
};

/*
Setup the environment for "maxOffersPerBundle". The following functions depend on it:
- createBundle
*/
setupEnvironment["maxOffersPerBundle"] = async function () {
  // create a seller
  // Required constructor params
  const agentId = "0"; // agent id is optional while creating an offer

  const seller1 = mockSeller(
    sellerWallet1.address,
    sellerWallet1.address,
    sellerWallet1.address,
    sellerWallet1.address
  );
  const voucherInitValues = mockVoucherInitValues();
  const emptyAuthToken = mockAuthToken();

  await accountHandler.connect(sellerWallet1).createSeller(seller1, emptyAuthToken, voucherInitValues);

  const disputeResolver = mockDisputeResolver(dr1.address, dr1.address, dr1.address, dr1.address);
  await accountHandler.createDisputeResolver(
    disputeResolver,
    [new DisputeResolverFee(ethers.constants.AddressZero, "Native", "100")],
    []
  );
  await accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id);

  const offerCount = 10;

  // Mock offer, offerDates and offerDurations
  const { offer, offerDates, offerDurations } = await mockOffer();

  for (let i = 0; i < offerCount; i++) {
    // Create the offer
    await offerHandler
      .connect(sellerWallet1)
      .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId);
  }

  // Create a valid twin.
  const [bosonToken] = await deployMockTokens(gasLimit);
  const twin = mockTwin(bosonToken.address);
  twin.supplyAvailable = ethers.BigNumber.from(twin.amount).mul(offerCount);

  // Approving the twinHandler contract to transfer seller's tokens
  await bosonToken.connect(sellerWallet1).approve(twinHandler.address, twin.supplyAvailable); // approving the twin handler

  // Create a twin.
  await twinHandler.connect(sellerWallet1).createTwin(twin);
  const twinIds = ["1"];

  const offerIds = [...Array(offerCount + 1).keys()].slice(1);

  const bundle = new Bundle("1", seller1.id, offerIds, twinIds);

  const args_1 = [bundle];
  const arrayIndex_1 = 0;
  const structField_1 = "offerIds";

  return {
    createBundle: { account: sellerWallet1, args: args_1, arrayIndex: arrayIndex_1, structField: structField_1 },
  };
};

/*
Setup the environment for "maxTwinsPerBundle". The following functions depend on it:
- createBundle
*/
setupEnvironment["maxTwinsPerBundle"] = async function () {
  // create a seller
  // Required constructor params
  const agentId = "0"; // agent id is optional while creating an offer

  const seller1 = mockSeller(
    sellerWallet1.address,
    sellerWallet1.address,
    sellerWallet1.address,
    sellerWallet1.address
  );
  const voucherInitValues = mockVoucherInitValues();
  const emptyAuthToken = mockAuthToken();

  await accountHandler.connect(sellerWallet1).createSeller(seller1, emptyAuthToken, voucherInitValues);

  const disputeResolver = mockDisputeResolver(dr1.address, dr1.address, dr1.address, dr1.address);
  await accountHandler.createDisputeResolver(
    disputeResolver,
    [new DisputeResolverFee(ethers.constants.AddressZero, "Native", "100")],
    []
  );
  await accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id);

  const twinCount = 10;

  for (let i = 0; i < twinCount; i++) {
    const [twinContract] = await deployMockTokens(gasLimit, ["Foreign20"]);
    const twin = mockTwin(twinContract.address);

    // Approving the twinHandler contract to transfer seller's tokens
    await twinContract.connect(sellerWallet1).approve(twinHandler.address, twin.supplyAvailable); // approving the twin handler

    // Create a twin.
    await twinHandler.connect(sellerWallet1).createTwin(twin);
  }

  // Create a valid offer.
  // Mock offer, offerDates and offerDurations
  const { offer, offerDates, offerDurations } = await mockOffer();

  // Create the offer
  await offerHandler.connect(sellerWallet1).createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId);

  const offerIds = ["1"];
  const twinIds = [...Array(twinCount + 1).keys()].slice(1);

  const bundle = new Bundle("1", seller1.id, offerIds, twinIds);

  const args_1 = [bundle];
  const arrayIndex_1 = 0;
  const structField_1 = "twinIds";

  return {
    createBundle: { account: sellerWallet1, args: args_1, arrayIndex: arrayIndex_1, structField: structField_1 },
  };
};

/*
Setup the environment for "maxExchangesPerBatch". The following functions depend on it:
- completeExchangeBatch
*/
setupEnvironment["maxExchangesPerBatch"] = async function () {
  // create a seller
  // Required constructor params
  const agentId = "0"; // agent id is optional while creating an offer

  const seller1 = mockSeller(
    sellerWallet1.address,
    sellerWallet1.address,
    sellerWallet1.address,
    sellerWallet1.address
  );
  const voucherInitValues = mockVoucherInitValues();
  const emptyAuthToken = mockAuthToken();

  await accountHandler.connect(sellerWallet1).createSeller(seller1, emptyAuthToken, voucherInitValues);

  const disputeResolver = mockDisputeResolver(dr1.address, dr1.address, dr1.address, dr1.address);
  await accountHandler.createDisputeResolver(
    disputeResolver,
    [new DisputeResolverFee(ethers.constants.AddressZero, "Native", "100")],
    []
  );
  await accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id);

  const exchangesCount = 10;

  // create an offer with big enough quantity
  const { offer, offerDates, offerDurations } = await mockOffer();
  offer.quantityAvailable = exchangesCount;
  // Create the offer
  await offerHandler.connect(sellerWallet1).createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId);

  // Deposit seller funds so the commit will succeed
  const sellerPool = ethers.BigNumber.from(offer.price).mul(exchangesCount);
  await fundsHandler
    .connect(sellerWallet1)
    .depositFunds(seller1.id, ethers.constants.AddressZero, sellerPool, { value: sellerPool });

  await setNextBlockTimestamp(Number(offerDates.voucherRedeemableFrom));
  for (let i = 1; i < exchangesCount + 1; i++) {
    // Commit to offer, creating a new exchange
    await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offer.id, { value: offer.price });

    // Redeem voucher
    await exchangeHandler.connect(buyer).redeemVoucher(i);
  }

  // Set time forward to run out the fulfillment period
  const blockNumber = await ethers.provider.getBlockNumber();
  const block = await ethers.provider.getBlock(blockNumber);
  const newTime = ethers.BigNumber.from(block.timestamp).add(offerDurations.fulfillmentPeriod).add(1).toNumber();
  await setNextBlockTimestamp(newTime);

  const exchangeIds = [...Array(exchangesCount + 1).keys()].slice(1);

  const args_1 = [exchangeIds];
  const arrayIndex_1 = 0;

  return {
    completeExchangeBatch: { account: rando, args: args_1, arrayIndex: arrayIndex_1 },
  };
};

/*
Setup the environment for "maxDisputesPerBatch". The following functions depend on it:
- expireDisputeBatch
*/
setupEnvironment["maxDisputesPerBatch"] = async function () {
  // create a seller
  // Required constructor params
  const agentId = "0"; // agent id is optional while creating an offer

  const seller1 = mockSeller(
    sellerWallet1.address,
    sellerWallet1.address,
    sellerWallet1.address,
    sellerWallet1.address
  );
  const voucherInitValues = mockVoucherInitValues();
  const emptyAuthToken = mockAuthToken();

  await accountHandler.connect(sellerWallet1).createSeller(seller1, emptyAuthToken, voucherInitValues);

  const disputeResolver = mockDisputeResolver(dr1.address, dr1.address, dr1.address, dr1.address);
  await accountHandler.createDisputeResolver(
    disputeResolver,
    [new DisputeResolverFee(ethers.constants.AddressZero, "Native", "100")],
    []
  );
  await accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id);

  const exchangesCount = 10;

  // create an offer with big enough quantity
  const { offer, offerDates, offerDurations } = await mockOffer();
  offer.quantityAvailable = exchangesCount;
  // Create the offer
  await offerHandler.connect(sellerWallet1).createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId);

  // Deposit seller funds so the commit will succeed
  const sellerPool = ethers.BigNumber.from(offer.price).mul(exchangesCount);
  await fundsHandler
    .connect(sellerWallet1)
    .depositFunds(seller1.id, ethers.constants.AddressZero, sellerPool, { value: sellerPool });

  await setNextBlockTimestamp(Number(offerDates.voucherRedeemableFrom));
  for (let i = 1; i < exchangesCount + 1; i++) {
    // Commit to offer, creating a new exchange
    await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offer.id, { value: offer.price });

    // Redeem voucher
    await exchangeHandler.connect(buyer).redeemVoucher(i);

    // Raise dispute
    await disputeHandler.connect(buyer).raiseDispute(i);
  }

  // Set time forward to run out the fulfillment period
  const blockNumber = await ethers.provider.getBlockNumber();
  const block = await ethers.provider.getBlock(blockNumber);
  const newTime = ethers.BigNumber.from(block.timestamp).add(offerDurations.resolutionPeriod).add(1).toNumber();
  await setNextBlockTimestamp(newTime);

  const exchangeIds = [...Array(exchangesCount + 1).keys()].slice(1);

  const args_1 = [exchangeIds];
  const arrayIndex_1 = 0;

  return {
    expireDisputeBatch: { account: rando, args: args_1, arrayIndex: arrayIndex_1 },
  };
};

/*
Setup the environment for "maxDisputesPerBatch". The following functions depend on it:
- expireDisputeBatch
*/
setupEnvironment["maxTokensPerWithdrawal"] = async function () {
  // create a seller
  // Required constructor params
  const agentId = "0"; // agent id is optional while creating an offer

  const seller1 = mockSeller(
    sellerWallet1.address,
    sellerWallet1.address,
    sellerWallet1.address,
    sellerWallet1.address
  );
  const voucherInitValues = mockVoucherInitValues();
  const emptyAuthToken = mockAuthToken();

  await accountHandler.connect(sellerWallet1).createSeller(seller1, emptyAuthToken, voucherInitValues);

  const disputeResolver = mockDisputeResolver(dr1.address, dr1.address, dr1.address, dr1.address);
  await accountHandler.createDisputeResolver(
    disputeResolver,
    [new DisputeResolverFee(ethers.constants.AddressZero, "Native", "100")],
    []
  );
  await accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id);

  const tokenCount = 10;

  const { offer, offerDates, offerDurations } = await mockOffer();
  offerDates.voucherRedeemableFrom = offerDates.validFrom;
  let tokenAddresses = [];
  for (let i = 1; i < tokenCount + 1; i++) {
    // create a token
    const [tokenContract] = await deployMockTokens(gasLimit, ["Foreign20"]);
    tokenAddresses.push(tokenContract.address);

    offer.exchangeToken = tokenContract.address;
    await tokenContract.mint(sellerWallet1.address, offer.sellerDeposit);
    await tokenContract.mint(buyer.address, offer.price);
    await tokenContract.connect(sellerWallet1).approve(protocolDiamond.address, offer.sellerDeposit);
    await tokenContract.connect(buyer).approve(protocolDiamond.address, offer.price);
    await fundsHandler.connect(sellerWallet1).depositFunds(seller1.id, tokenContract.address, offer.sellerDeposit);

    // add token to DR accepted tokens
    await accountHandler
      .connect(dr1)
      .addFeesToDisputeResolver(disputeResolver.id, [new DisputeResolverFee(tokenContract.address, `Token${i}`, "1")]);

    // create the offer
    await offerHandler
      .connect(sellerWallet1)
      .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId);

    // Commit to offer, creating a new exchange
    await exchangeHandler.connect(buyer).commitToOffer(buyer.address, i);

    // Redeem voucher
    await exchangeHandler.connect(buyer).redeemVoucher(i);

    // Raise dispute
    await exchangeHandler.connect(buyer).completeExchange(i);
  }

  // seller withdrawal
  const tokenAmounts_1 = new Array(tokenCount).fill(offer.price);
  const args_1 = [seller1.id, tokenAddresses, tokenAmounts_1];
  const arrayIndex_1 = [1, 2];

  // protocol fee withdrawal
  await accessController.grantRole(Role.FEE_COLLECTOR, feeCollector.address);
  const protocolFee = ethers.BigNumber.from(offer.price).mul(protocolFeePercentage).div(10000);
  const tokenAmounts_2 = new Array(tokenCount).fill(protocolFee);
  const args_2 = [tokenAddresses, tokenAmounts_2];
  const arrayIndex_2 = [0, 1];

  return {
    withdrawFunds: { account: sellerWallet1, args: args_1, arrayIndex: arrayIndex_1 },
    withdrawProtocolFees: { account: feeCollector, args: args_2, arrayIndex: arrayIndex_2 },
  };
};

/*
Invoke the methods that setup the environment and iterate over all limits and pass them to estimation.
At the end it writes the results to json file.
*/
async function estimateLimits() {
  for (const limit of limitsToEstimate.limits) {
    console.log(`## ${limit.name} ##`);
    console.log(`Setting up the environment`);
    await setupCommonEnvironment();
    const inputs = await setupEnvironment[limit.name]();
    console.log(`Estimating the limit`);
    await estimateLimit(limit, inputs, limitsToEstimate.safeGasLimitPercent);
    accountId.next(true);
  }
  fs.writeFileSync(__dirname + "/limit_estimates.json", JSON.stringify(result));
}

/*
Esitmates individual limit. It estimates gas for different lenghts of input array and forwards
the result to function that calculates the actual limit.

It stores the list of point estimates and maximum and safe lenght of the array to results.
*/
async function estimateLimit(limit, inputs, safeGasLimitPercent) {
  result[limit.name] = {};
  for (const [method, handler] of Object.entries(limit.methods)) {
    console.log(`=== ${method} ===`);
    const methodInputs = inputs[method];
    if (methodInputs === undefined) {
      console.log(`Missing setup for ${limit.name}:${method}`);
      continue;
    }

    const maxArrayLength = methodInputs.structField
      ? methodInputs.args[methodInputs.arrayIndex][methodInputs.structField].length
      : methodInputs.args[Array.isArray(methodInputs.arrayIndex) ? methodInputs.arrayIndex[0] : methodInputs.arrayIndex]
          .length;
    let gasEstimates = [];
    for (let o = 0; Math.pow(10, o) <= maxArrayLength; o++) {
      for (let i = 1; i < 10; i++) {
        let arrayLength = i * Math.pow(10, o);
        if (arrayLength > maxArrayLength) arrayLength = maxArrayLength;

        const args = methodInputs.args;
        let adjustedArgs = [...args];

        if (methodInputs.structField) {
          adjustedArgs[methodInputs.arrayIndex] = { ...adjustedArgs[methodInputs.arrayIndex] };
          adjustedArgs[methodInputs.arrayIndex][methodInputs.structField] = args[methodInputs.arrayIndex][
            methodInputs.structField
          ].slice(0, arrayLength);
        } else {
          if (Array.isArray(methodInputs.arrayIndex)) {
            for (const ai of methodInputs.arrayIndex) {
              adjustedArgs[ai] = args[ai].slice(0, arrayLength);
            }
          } else {
            adjustedArgs[methodInputs.arrayIndex] = args[methodInputs.arrayIndex].slice(0, arrayLength);
          }
        }

        const gasEstimate = await handlers[handler]
          .connect(methodInputs.account)
          .estimateGas[method](...adjustedArgs, { gasLimit });
        console.log(arrayLength, gasEstimate);
        gasEstimates.push([gasEstimate.toNumber(), arrayLength]);
        if (arrayLength == maxArrayLength) break;
      }
    }
    const { maxNumber, safeNumber } = calculateLimit(gasEstimates, safeGasLimitPercent);
    result[limit.name][method] = { gasEstimates, maxNumber, safeNumber };
    console.log(`Estimation complete`);
  }
}

/*
Based on point gas estimates calculates the maximum and safe length of the array that can be passed in
Safe length is determined by safeGasLimitPercent which is the percentage amount of block that is considered
safe to be taken
*/
function calculateLimit(gasEstimates, safeGasLimitPercent) {
  const regCoef = simpleStatistic.linearRegression(gasEstimates);
  const line = simpleStatistic.linearRegressionLine(regCoef);

  const maxNumber = Math.floor(line(gasLimit));
  const safeNumber = Math.floor(line((gasLimit * safeGasLimitPercent) / 100));
  return { maxNumber, safeNumber };
}

/*
Deploys protocol contracts, casts facets to interfaces and makes accounts available
*/
async function setupCommonEnvironment() {
  // Make accounts available
  [
    deployer,
    sellerWallet1,
    sellerWallet2,
    sellerWallet3,
    dr1,
    dr2,
    dr3,
    buyer,
    rando,
    other1,
    other2,
    other3,
    protocolAdmin,
    feeCollector,
  ] = await ethers.getSigners();

  // Deploy the Protocol Diamond
  [protocolDiamond, , , , accessController] = await deployProtocolDiamond();

  // Temporarily grant UPGRADER role to deployer account
  await accessController.grantRole(Role.UPGRADER, deployer.address);

  // Grant PROTOCOL role to ProtocolDiamond address and renounces admin
  await accessController.grantRole(Role.PROTOCOL, protocolDiamond.address);

  //Grant ADMIN role to and address that can call restricted functions.
  //This ADMIN role is a protocol-level role. It is not the same an admin address for an account type
  await accessController.grantRole(Role.ADMIN, protocolAdmin.address);

  // Cut the protocol handler facets into the Diamond
  await deployProtocolHandlerFacets(protocolDiamond, [
    "AccountHandlerFacet",
    "BundleHandlerFacet",
    "DisputeHandlerFacet",
    "DisputeResolverHandlerFacet",
    "ExchangeHandlerFacet",
    "FundsHandlerFacet",
    "GroupHandlerFacet",
    "OfferHandlerFacet",
    "SellerHandlerFacet",
    "TwinHandlerFacet",
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

  // Cast Diamond to handlers
  accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);
  bundleHandler = await ethers.getContractAt("IBosonBundleHandler", protocolDiamond.address);
  disputeHandler = await ethers.getContractAt("IBosonDisputeHandler", protocolDiamond.address);
  exchangeHandler = await ethers.getContractAt("IBosonExchangeHandler", protocolDiamond.address);
  fundsHandler = await ethers.getContractAt("IBosonFundsHandler", protocolDiamond.address);
  groupHandler = await ethers.getContractAt("IBosonGroupHandler", protocolDiamond.address);
  offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);
  twinHandler = await ethers.getContractAt("IBosonTwinHandler", protocolDiamond.address);

  handlers = {
    IBosonAccountHandler: accountHandler,
    IBosonBundleHandler: bundleHandler,
    IBosonDisputeHandler: disputeHandler,
    IBosonExchangeHandler: exchangeHandler,
    IBosonFundsHandler: fundsHandler,
    IBosonGroupHandler: groupHandler,
    IBosonOfferHandler: offerHandler,
  };
}

estimateLimits();
