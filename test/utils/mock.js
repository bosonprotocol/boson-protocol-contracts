const hre = require("hardhat");
const ethers = hre.ethers;
const Offer = require("../../scripts/domain/Offer");
const OfferDates = require("../../scripts/domain/OfferDates");
const OfferFees = require("../../scripts/domain/OfferFees");
const OfferDurations = require("../../scripts/domain/OfferDurations");
const ExchangeState = require("../../scripts/domain/ExchangeState");
const DisputeState = require("../../scripts/domain/DisputeState");
const Twin = require("../../scripts/domain/Twin.js");
const Exchange = require("../../scripts/domain/Exchange.js");
const TwinReceipt = require("../../scripts/domain/TwinReceipt.js");
const TokenType = require("../../scripts/domain/TokenType.js");
const DisputeResolver = require("../../scripts/domain/DisputeResolver");
const Receipt = require("../../scripts/domain/Receipt");
const Voucher = require("../../scripts/domain/Voucher");
const Dispute = require("../../scripts/domain/Dispute");
const { applyPercentage } = require("../../scripts/util/test-utils.js");
const { oneWeek, oneMonth } = require("./constants.js");

function mockOfferDurations() {
  // Required constructor params
  const fulfillmentPeriod = oneMonth.toString(); // fulfillment period is one month
  const voucherValid = oneMonth.toString(); // offers valid for one month
  const resolutionPeriod = oneWeek.toString(); // dispute is valid for one month

  // Create a valid offerDurations, then set fields in tests directly
  return new OfferDurations(fulfillmentPeriod, voucherValid, resolutionPeriod);
}

async function mockOfferDates() {
  // Get the current block info
  const blockNumber = await ethers.provider.getBlockNumber();
  const block = await ethers.provider.getBlock(blockNumber);

  const validFrom = ethers.BigNumber.from(block.timestamp).toString(); // valid from now
  const validUntil = ethers.BigNumber.from(block.timestamp)
    .add(oneMonth * 6)
    .toString(); // until 6 months
  const voucherRedeemableFrom = ethers.BigNumber.from(block.timestamp).add(oneWeek).toString(); // redeemable in 1 week
  const voucherRedeemableUntil = "0"; // mocks use voucher valid duration rather than fixed date, override in tests as needed

  // Create a valid offerDates, then set fields in tests directly
  return new OfferDates(validFrom, validUntil, voucherRedeemableFrom, voucherRedeemableUntil);
}

// Returns a mock offer with price in native token
async function mockOffer() {
  const id = "1"; // argument sent to contract for createOffer will be ignored
  const sellerId = "1"; // argument sent to contract for createOffer will be ignored
  const price = ethers.utils.parseUnits("1.5", "ether").toString();
  const sellerDeposit = ethers.utils.parseUnits("0.25", "ether").toString();
  const protocolFee = applyPercentage(price, "200");
  const buyerCancelPenalty = ethers.utils.parseUnits("0.05", "ether").toString();
  const quantityAvailable = "1";
  const exchangeToken = ethers.constants.AddressZero.toString(); // Zero addy ~ chain base currency
  const metadataHash = "QmYXc12ov6F2MZVZwPs5XeCBbf61cW3wKRk8h3D5NTYj4T"; // not an actual metadataHash, just some data for tests
  const metadataUri = `https://ipfs.io/ipfs/${metadataHash}`;
  const voided = false;

  // Create a valid offer, then set fields in tests directly
  let offer = new Offer(
    id,
    sellerId,
    price,
    sellerDeposit,
    buyerCancelPenalty,
    quantityAvailable,
    exchangeToken,
    metadataUri,
    metadataHash,
    voided
  );

  const offerDates = await mockOfferDates();
  const offerDurations = mockOfferDurations();
  const disputeResolverId = "2";
  const agentFee = "0";
  const offerFees = mockOfferFees(protocolFee, agentFee);

  return { offer, offerDates, offerDurations, disputeResolverId, offerFees };
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

function mockDisputeResolver(operatorAddress, adminAddress, clerkAddress, treasuryAddress, active) {
  const id = "1";
  const metadataUriDR = `https://ipfs.io/ipfs/disputeResolver1`;
  return new DisputeResolver(
    id.toString(),
    oneMonth.toString(),
    operatorAddress,
    adminAddress,
    clerkAddress,
    treasuryAddress,
    metadataUriDR,
    active
  );
}

function mockOfferFees(protocolFee, agentFee) {
  return new OfferFees(protocolFee, agentFee);
}

function mockTwinReceipt(tokenAddress, tokenType) {
  tokenType = tokenType ?? TokenType.FungibleToken;
  const twinId = "1";
  const tokenId = "1";
  const amount = "0";
  return new TwinReceipt(twinId, tokenId, amount, tokenAddress, tokenType);
}

function mockVoucher() {
  // Required voucher constructor params
  const committedDate = "1661441758";
  const validUntilDate = "166145000";
  const redeemedDate = "1661442001";
  const expired = false;
  return new Voucher(committedDate, validUntilDate, redeemedDate, expired);
}

function mockExchange() {
  const id = "1";
  const offerId = "1";
  const buyerId = "1";
  const finalizedDate = "1661447000";
  const voucher = mockVoucher();
  const state = ExchangeState.Committed;
  return new Exchange(id, offerId, buyerId, finalizedDate, voucher, state);
}
function mockDispute() {
  const exchangeId = "1";
  const complaint = "Tastes weird";
  const state = DisputeState.Resolving;
  const buyerPercent = "500";

  return new Dispute(exchangeId, complaint, state, buyerPercent);
}

async function mockReceipt() {
  const exchange = mockExchange();
  const { offer } = await mockOffer();
  const dispute = mockDispute();
  const twinReceipt = mockTwinReceipt(ethers.constants.AddressZero);
  return new Receipt(exchange, offer, dispute, twinReceipt);
}

exports.mockOffer = mockOffer;
exports.mockTwin = mockTwin;
exports.mockDisputeResolver = mockDisputeResolver;
exports.mockTwinReceipt = mockTwinReceipt;
exports.mockVoucher = mockVoucher;
exports.mockExchange = mockExchange;
exports.mockReceipt = mockReceipt;
exports.mockDispute = mockDispute;
