const hre = require("hardhat");
const { ZeroAddress, provider, parseUnits } = hre.ethers;

const decache = require("decache");
let Condition = require("../../scripts/domain/Condition.js");
const EvaluationMethod = require("../../scripts/domain/EvaluationMethod");
let Offer = require("../../scripts/domain/Offer");
const GatingType = require("../../scripts/domain/GatingType");
const OfferDates = require("../../scripts/domain/OfferDates");
const OfferFees = require("../../scripts/domain/OfferFees");
const OfferDurations = require("../../scripts/domain/OfferDurations");
const ExchangeState = require("../../scripts/domain/ExchangeState");
const DisputeState = require("../../scripts/domain/DisputeState");
const Twin = require("../../scripts/domain/Twin.js");
const Exchange = require("../../scripts/domain/Exchange.js");
const TwinReceipt = require("../../scripts/domain/TwinReceipt.js");
const TokenType = require("../../scripts/domain/TokenType.js");
const Buyer = require("../../scripts/domain/Buyer");
const VoucherInitValues = require("../../scripts/domain/VoucherInitValues");
const AuthToken = require("../../scripts/domain/AuthToken");
const AuthTokenType = require("../../scripts/domain/AuthTokenType");
const Agent = require("../../scripts/domain/Agent");
const Receipt = require("../../scripts/domain/Receipt");
const Voucher = require("../../scripts/domain/Voucher");
const Dispute = require("../../scripts/domain/Dispute");
const { RoyaltyInfo } = require("../../scripts/domain/RoyaltyInfo");
const { applyPercentage, incrementer } = require("../../test/util/utils.js");
const { oneWeek, oneMonth } = require("./constants.js");
const PriceType = require("../../scripts/domain/PriceType");
let DisputeResolver = require("../../scripts/domain/DisputeResolver.js");
let Seller = require("../../scripts/domain/Seller");
const { ZeroHash } = require("ethers");

const accountId = incrementer();

function mockOfferDurations() {
  // Required constructor params
  const disputePeriod = oneMonth.toString(); // dispute period is one month
  const voucherValid = oneMonth.toString(); // offers valid for one month
  const resolutionPeriod = oneWeek.toString(); // dispute is valid for one week

  // Create a valid offerDurations, then set fields in tests directly
  return new OfferDurations(disputePeriod, voucherValid, resolutionPeriod);
}

async function mockOfferDates() {
  // Get the current block info
  const blockNumber = await provider.getBlockNumber();
  const block = await provider.getBlock(blockNumber);

  const validFrom = BigInt(block.timestamp).toString(); // valid from now
  const validUntil = (BigInt(block.timestamp) + BigInt(oneMonth) * BigInt(6)).toString(); // until 6 months
  const voucherRedeemableFrom = (BigInt(block.timestamp) + BigInt(oneWeek)).toString(); // redeemable in 1 week
  const voucherRedeemableUntil = "0"; // mocks use voucher valid duration rather than fixed date, override in tests as needed

  // Create a valid offerDates, then set fields in tests directly
  return new OfferDates(validFrom, validUntil, voucherRedeemableFrom, voucherRedeemableUntil);
}

// Returns a mock offer with price in native token
async function mockOffer({ refreshModule, legacyOffer } = {}) {
  if (refreshModule) {
    decache("../../scripts/domain/Offer.js");
    Offer = require("../../scripts/domain/Offer.js");
  }

  const id = "1";
  const sellerId = "1"; // argument sent to contract for createOffer will be ignored
  const price = parseUnits("1.5", "ether").toString();
  const sellerDeposit = parseUnits("0.25", "ether").toString();
  const protocolFee = applyPercentage(price, "200");
  const buyerCancelPenalty = parseUnits("0.05", "ether").toString();
  const quantityAvailable = "1";
  const exchangeToken = ZeroAddress.toString(); // Zero addy ~ chain base currency
  const priceType = PriceType.Static;
  const metadataHash = "QmYXc12ov6F2MZVZwPs5XeCBbf61cW3wKRk8h3D5NTYj4T"; // not an actual metadataHash, just some data for tests
  const metadataUri = `https://ipfs.io/ipfs/${metadataHash}`;
  const voided = false;
  const collectionIndex = "0";
  const royaltyInfo = [new RoyaltyInfo([ZeroAddress], ["0"])];

  // Create a valid offer, then set fields in tests directly
  let offer;
  if (legacyOffer) {
    offer = new Offer(
      id,
      sellerId,
      price,
      sellerDeposit,
      buyerCancelPenalty,
      quantityAvailable,
      exchangeToken,
      metadataUri,
      metadataHash,
      voided,
      collectionIndex
    );
  } else {
    offer = new Offer(
      id,
      sellerId,
      price,
      sellerDeposit,
      buyerCancelPenalty,
      quantityAvailable,
      exchangeToken,
      priceType,
      metadataUri,
      metadataHash,
      voided,
      collectionIndex,
      royaltyInfo
    );
  }

  const offerDates = await mockOfferDates();
  const offerDurations = mockOfferDurations();
  const disputeResolverId = "2";
  const mutualizerAddress = ZeroAddress;
  const agentFee = "0";
  const offerFees = mockOfferFees(protocolFee, agentFee);

  return { offer, offerDates, offerDurations, offerFees, drParams: { disputeResolverId, mutualizerAddress } };
}

function mockTwin(tokenAddress, tokenType) {
  tokenType = tokenType ?? TokenType.FungibleToken;
  const id = "1";
  const sellerId = "1";
  const amount = "500";
  const tokenId = "0";
  const supplyAvailable = "1500";
  return new Twin(id, sellerId, amount, supplyAvailable, tokenId, tokenAddress, tokenType);
}

function mockDisputeResolver(
  assistantAddress,
  adminAddress,
  clerkAddress = ZeroAddress,
  treasuryAddress,
  active,
  refreshModule
) {
  if (refreshModule) {
    decache("../../scripts/domain/DisputeResolver.js");
    DisputeResolver = require("../../scripts/domain/DisputeResolver.js");
  }
  const metadataUriDR = `https://ipfs.io/ipfs/disputeResolver1`;
  return new DisputeResolver(
    accountId.next().value,
    oneMonth.toString(),
    assistantAddress,
    adminAddress,
    clerkAddress,
    treasuryAddress,
    metadataUriDR,
    active ?? true
  );
}

function mockSeller(
  assistantAddress,
  adminAddress,
  clerkAddress,
  treasuryAddress,
  active = true,
  metadataUri = "",
  { refreshModule } = {}
) {
  if (refreshModule) {
    decache("../../scripts/domain/Seller.js");
    Seller = require("../../scripts/domain/Seller.js");
  }
  return new Seller(
    accountId.next().value,
    assistantAddress,
    adminAddress,
    clerkAddress,
    treasuryAddress,
    active,
    metadataUri
  );
}

function mockBuyer(wallet) {
  return new Buyer(accountId.next().value, wallet, true);
}

function mockAgent(wallet) {
  const feePercentage = "500"; //5%
  return new Agent(accountId.next().value, feePercentage, wallet, true);
}

function mockOfferFees(protocolFee, agentFee) {
  return new OfferFees(protocolFee.toString(), agentFee.toString());
}

function mockVoucherInitValues() {
  const contractURI = `https://ipfs.io/ipfs/QmW2WQi7j6c7UgJTarActp7tDNikE4B2qXtFCfLPdsgaTQ`;
  const royaltyPercentage = "0"; // 0%
  const collectionSalt = ZeroHash;
  return new VoucherInitValues(contractURI, royaltyPercentage, collectionSalt);
}

function mockAuthToken() {
  return new AuthToken("0", AuthTokenType.None);
}

function mockTwinReceipt(tokenAddress, tokenType) {
  tokenType = tokenType ?? TokenType.FungibleToken;
  const twinId = "1";
  const tokenId = "1";
  const amount = "0";
  return new TwinReceipt(twinId, tokenId, amount, tokenAddress, tokenType);
}

function mockVoucher({ committedDate, validUntilDate, redeemedDate, expired } = {}) {
  return new Voucher(
    committedDate ?? "1661441758",
    validUntilDate ?? "166145000",
    redeemedDate ?? "1661442001",
    expired ?? false
  );
}

function mockExchange({ id, offerId, buyerId, finalizedDate, state } = {}) {
  return new Exchange(
    id ?? "1",
    offerId ?? "1",
    buyerId ?? "1",
    finalizedDate ?? "1661447000",
    state ?? ExchangeState.Committed
  );
}

function mockDispute() {
  const exchangeId = "1";
  const state = DisputeState.Resolving;
  const buyerPercent = "500";

  return new Dispute(exchangeId, state, buyerPercent);
}

async function mockReceipt() {
  const exchange = mockExchange();
  const voucher = mockVoucher();
  const mo = await mockOffer();
  const offer = mo.offer;
  const offerFees = mo.offerFees;
  const buyerId = "1";
  const sellerId = "2";
  const agentId = "3";
  const twinReceipt = mockTwinReceipt(ZeroAddress);
  const condition = mockCondition();

  return new Receipt(
    exchange.id,
    offer.id,
    buyerId,
    sellerId,
    offer.price,
    offer.sellerDeposit,
    offer.buyerCancelPenalty,
    offerFees,
    agentId,
    offer.exchangeToken,
    exchange.finalizedDate,
    condition,
    voucher.committedDate,
    voucher.redeemedDate,
    voucher.expired,
    undefined,
    undefined,
    undefined,
    undefined,
    [twinReceipt]
  );
}

function mockCondition(
  { method, tokenType, tokenAddress, gating, minTokenId, threshold, maxCommits, maxTokenId } = {},
  { refreshModule, legacyCondition } = {}
) {
  if (refreshModule) {
    decache("../../scripts/domain/Condition.js");
    Condition = require("../../scripts/domain/Condition.js");
  }

  if (legacyCondition) {
    const tokenId = minTokenId;
    return new Condition(
      method ?? EvaluationMethod.Threshold,
      tokenType ?? TokenType.FungibleToken,
      tokenAddress ?? ZeroAddress,
      tokenId ?? "0",
      threshold ?? "1",
      maxCommits ?? "1"
    );
  }

  return new Condition(
    method ?? EvaluationMethod.Threshold,
    tokenType ?? TokenType.FungibleToken,
    tokenAddress ?? ZeroAddress,
    gating ?? GatingType.PerAddress,
    minTokenId ?? "0",
    threshold ?? "1",
    maxCommits ?? "1",
    maxTokenId ?? "0"
  );
}

exports.mockOffer = mockOffer;
exports.mockTwin = mockTwin;
exports.mockDisputeResolver = mockDisputeResolver;
exports.mockSeller = mockSeller;
exports.mockBuyer = mockBuyer;
exports.mockVoucherInitValues = mockVoucherInitValues;
exports.mockAuthToken = mockAuthToken;
exports.mockTwinReceipt = mockTwinReceipt;
exports.mockVoucher = mockVoucher;
exports.mockExchange = mockExchange;
exports.mockReceipt = mockReceipt;
exports.mockDispute = mockDispute;
exports.mockCondition = mockCondition;
exports.mockAgent = mockAgent;
exports.accountId = accountId;
