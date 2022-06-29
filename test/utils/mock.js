const hre = require("hardhat");
const ethers = hre.ethers;
const Offer = require("../../scripts/domain/Offer");
const OfferDates = require("../../scripts/domain/OfferDates");
const OfferDurations = require("../../scripts/domain/OfferDurations");
const Twin = require("../../scripts/domain/Twin.js");
const TokenType = require("../../scripts/domain/TokenType.js");
const DisputeResolver = require("../../scripts/domain/DisputeResolver");
const { calculateProtocolFee } = require("../../scripts/util/test-utils.js");
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
  const voucherRedeemableUntil = "0"; // vouchers don't have fixed expiration date

  // Create a valid offerDates, then set fields in tests directly
  return new OfferDates(validFrom, validUntil, voucherRedeemableFrom, voucherRedeemableUntil);
}

// Returns a mock offer with price in native token
async function mockOffer() {
  const id = "1"; // argument sent to contract for createOffer will be ignored
  const sellerId = "1"; // argument sent to contract for createOffer will be ignored
  const price = ethers.utils.parseUnits("1.5", "ether").toString();
  const sellerDeposit = ethers.utils.parseUnits("0.25", "ether").toString();
  const protocolFee = calculateProtocolFee(price, "200");
  const buyerCancelPenalty = ethers.utils.parseUnits("0.05", "ether").toString();
  const quantityAvailable = "1";
  const exchangeToken = ethers.constants.AddressZero.toString(); // Zero addy ~ chain base currency
  const disputeResolverId = "2";
  const metadataHash = "QmYXc12ov6F2MZVZwPs5XeCBbf61cW3wKRk8h3D5NTYj4T"; // not an actual metadataHash, just some data for tests
  const metadataUri = `https://ipfs.io/ipfs/${metadataHash}`;
  const voided = false;

  // Create a valid offer, then set fields in tests directly
  let offer = new Offer(
    id,
    sellerId,
    price,
    sellerDeposit,
    protocolFee,
    buyerCancelPenalty,
    quantityAvailable,
    exchangeToken,
    disputeResolverId,
    metadataUri,
    metadataHash,
    voided
  );

  const offerDates = await mockOfferDates();
  const offerDurations = mockOfferDurations();

  return { offer, offerDates, offerDurations };
}

function mockTwin(tokenAddress, tokenType) {
  tokenType = tokenType ?? TokenType.FungibleToken;
  const id = "1";
  const sellerId = "1";
  const supplyAvailable = "500";
  const tokenId = "0";
  const supplyIds = [];
  return new Twin(id, sellerId, supplyAvailable, supplyIds, tokenId, tokenAddress, tokenType);
}

function mockDisputeResolver(operatorAddress, adminAddress, clerkAddress, treasuryAddress, active) {
  const id = "1";
  const metadataUriDR = `https://ipfs.io/ipfs/disputeResolver1`;
  return new DisputeResolver(id.toString(), oneMonth.toString(), operatorAddress, adminAddress, clerkAddress, treasuryAddress, metadataUriDR, active);
}
exports.mockOffer = mockOffer;
exports.mockTwin = mockTwin;
exports.mockDisputeResolver = mockDisputeResolver;
