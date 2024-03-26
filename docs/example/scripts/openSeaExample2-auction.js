// Start the node
// npx hardhat console --network mumbai

// DEPENDENCIES
const { ethers: ethersv5 } = require("ethersv5");
const { OpenSeaSDK, Chain } = require("opensea-js");
const { ZeroAddress, getContractAt, MaxUint256, getContractFactory } = ethers;
BigInt.prototype.toJSON = function () {
  return this.toString();
};
const Side = require("./scripts/domain/Side.js");
const PriceDiscovery = require("./scripts/domain/PriceDiscovery.js");

// CONFIG
const RPC_URL = "https://polygon-mumbai.g.alchemy.com/v2/Lh0tB9SSPhJh8f6BCMmlDJ7WrmApb_X_";
const CHAIN = Chain.Mumbai;
const PRIVATE_KEY = "###"; // seller
const WETH_ADDRESS = "0xA6FA4fB5f76172d178d61B04b0ecd319C5d1C0aa";
const PROTOCOL_ADDRESS = "0x76051FC05Ab42D912a737d59a8711f1446712630";
const PRICE_DISCOVERY_CLIENT = "0x74874fF29597b6e01E16475b7BB9D6dC954d0411";

const CONTRACT_ADDRESS = "0x7889dB3b4B605c7Dc3Bc5A47286b7BB20Fac331F"; // voucher, <change
let TOKEN_ID = "245683868916917570620556466565736648671527"; // <change

// INIT
const provider = new ethersv5.providers.JsonRpcProvider(RPC_URL);
const seller = new ethersv5.Wallet(PRIVATE_KEY, provider);
const openseaSDK = new OpenSeaSDK(
  provider,
  {
    chain: CHAIN,
    apiKey: "",
  },
  undefined,
  seller
);
const bosonVoucher = await getContractAt("BosonVoucher", CONTRACT_ADDRESS);
const [assistant] = await ethers.getSigners();
const priceDiscoveryHandler = await getContractAt("IBosonPriceDiscoveryHandler", PROTOCOL_ADDRESS);


// CREATE SELLER (ONE TIME)
const { mockSeller, mockAuthToken, mockVoucherInitValues } = require("./test/util/mock.js");
const sellerObject = mockSeller(assistant.address, assistant.address, ZeroAddress, assistant.address);
const emptyAuthToken = mockAuthToken();
const voucherInitValues = mockVoucherInitValues();
const accountHandler = await ethers.getContractAt("IBosonAccountHandler", PROTOCOL_ADDRESS);
await accountHandler.connect(assistant).createSeller(sellerObject, emptyAuthToken, voucherInitValues);

// CREATE DR (ONE TIME)
const { DisputeResolverFee } = require("./scripts/domain/DisputeResolverFee.js");
const { RoyaltyInfo } = require("./scripts/domain/RoyaltyInfo.js");

const { mockDisputeResolver } = require("./test/util/mock.js");
const DR = assistant;
const disputeResolver = mockDisputeResolver(DR.address, DR.address, ZeroAddress, DR.address, true);
const disputeResolverFees = [new DisputeResolverFee(ZeroAddress, "Native", "0"),
new DisputeResolverFee(WETH_ADDRESS, "WETH", "0")];
const sellerAllowList = [];
await accountHandler.connect(DR).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

// CREATE ORDER
// 1. BOSON PROTOCOL OFFER
const offerHandler = await getContractAt("IBosonOfferHandler", PROTOCOL_ADDRESS)
const { mockOffer } = require("./test/util/mock.js");
const PriceType = require("./scripts/domain/PriceType.js");
const { offer, offerDates, offerDurations } = await mockOffer();
const disputeResolverId = 177; // <change accordingly
offer.quantityAvailable = 100;
offer.priceType = PriceType.Discovery;
offer.sellerDeposit="0";
offer.exchangeToken = WETH_ADDRESS;
offer.price = "0";
offer.buyerCancelPenalty="0";
offer.royaltyInfo = [new RoyaltyInfo([],[])];
await offerHandler.connect(assistant).createOffer(offer.toStruct(), offerDates.toStruct(), offerDurations.toStruct(), disputeResolverId, "0", MaxUint256);
offer.id = "722"; // <change accordingly

// 2. RESERVE RANGE
await offerHandler.connect(assistant).reserveRange(offer.id, offer.quantityAvailable, assistant.address);

// 3. PREMINT VOUCHER
// const { calculateBosonProxyAddress, calculateCloneAddress } = require("./test/util/utils.js");
// beaconProxyAddress = await calculateBosonProxyAddress(PROTOCOL_ADDRESS);
// voucherAddress = calculateCloneAddress(PROTOCOL_ADDRESS,beaconProxyAddress, seller.admin);
// bosonVoucher = await getContractAt("BosonVoucher", voucherAddress);
await bosonVoucher.connect(assistant).preMint(offer.id, offer.quantityAvailable);

// 4. WRAPPER
// create wrapper (if it does not exist yet)

const bosonWrapperFactory = await getContractFactory("OpenSeaWrapper");
const bosonWrapper = await bosonWrapperFactory.deploy(CONTRACT_ADDRESS, PROTOCOL_ADDRESS, WETH_ADDRESS, PRICE_DISCOVERY_CLIENT);
await bosonWrapper.waitForDeployment();

// if already exists
const WRAPPER_ADDRESS = "0xD12E9291475bAC889A1386F079D625854bE94D02";
const bosonWrapper = await getContractAt("OpenSeaWrapper", WRAPPER_ADDRESS);


// 5. LIST ON OPENSEA
// wrap
await bosonVoucher.connect(assistant).setApprovalForAll(WRAPPER_ADDRESS, true);
await bosonWrapper.connect(assistant).wrapForAuction([TOKEN_ID]);
// list manually on opensea

// 5. AUCTION <- buyers place bids on opensea

// 6. ACCEPT BID
// get order from the API
let order = await openseaSDK.api.getOrder({
    assetContractAddress: WRAPPER_ADDRESS,
    tokenId: TOKEN_ID,
    side: "bid"});


// generate fulfillment data
let ffd = await openseaSDK.api.generateFulfillmentData(WRAPPER_ADDRESS, order.orderHash, order.protocolAddress, order.side);

// buyerOrder = ffd.fulfillment_data.orders[0] // <can this be used for simple oreder?
let buyerAdvancedOrder = ffd.fulfillment_data.transaction.input_data.orders[0];

// prepare price discovery data


// ~~~~~~~~~~~~~~~~~~~~~
// 2-step unwrap
await bosonWrapper.connect(assistant).finalizeAuction(TOKEN_ID, buyerAdvancedOrder);

let pdd = bosonWrapper.interface.encodeFunctionData("unwrap", [TOKEN_ID]);
// const price = ethers.parseUnits("0.001", "ether"); // from bid on openSea
// let priceDiscovery = new PriceDiscovery(price*975n/1000n, Side.Wrapper, WRAPPER_ADDRESS, WRAPPER_ADDRESS, pdd);

let input = ffd.fulfillment_data.transaction.input_data;
let priceDiscovery = new PriceDiscovery(input.orders[1].parameters.consideration[0].startAmount,  Side.Wrapper, WRAPPER_ADDRESS, WRAPPER_ADDRESS, pdd);
await priceDiscoveryHandler.connect(seller).commitToPriceDiscoveryOffer(input.orders[0].parameters.offerer, TOKEN_ID, priceDiscovery);

// ~~~~~~~~~~~~~~~~~~~~~
// 1-step unwrap [WIP]
// it must be the owner...
await bosonVoucher.connect(seller).setApprovalForAll(PROTOCOL_ADDRESS, true);
let pdd = bosonWrapper.interface.encodeFunctionData("finalizeAuction", [TOKEN_ID, buyerAdvancedOrder]);
let input = ffd.fulfillment_data.transaction.input_data;
let priceDiscovery = new PriceDiscovery(input.orders[1].parameters.consideration[0].startAmount,  Side.Wrapper, WRAPPER_ADDRESS, WRAPPER_ADDRESS, pdd);
