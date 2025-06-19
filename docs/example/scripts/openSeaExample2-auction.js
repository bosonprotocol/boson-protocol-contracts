// Start the node
// npx hardhat console --network amoy

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
const RPC_URL = "https://polygon-amoy.g.alchemy.com/v2/cnfviRYteDvsidvvGh7WwNqzTB3wsUlM";
const CHAIN = Chain.Amoy;
const PRIVATE_KEY = "0x56d0d07e8b54c1e91e9ab40a8a396b8f665dda811e8b8bb226b2525c7f7e72cd"; // seller
const WETH_ADDRESS = "0x52eF3d68BaB452a294342DC3e5f464d7f610f72E";
const PROTOCOL_ADDRESS = "0x7de418a7ce94debd057c34ebac232e7027634ade";
const PRICE_DISCOVERY_CLIENT = "0xF4f02BAE43cf66fca47eBaC58657586Aa951D135";
const sellerAddress = "0x2a91A0148EE62fA638bE38C7eE05c29a3e568dD8";

const CONTRACT_ADDRESS = "0x8ADa73881c4bE5Acd482658d9090753806328175"; // voucher, <change
let TOKEN_ID = "108890357414700308308279874378165827667747"; // <change

// INIT
const provider = new ethersv5.providers.JsonRpcProvider(RPC_URL);
const seller = new ethersv5.Wallet(PRIVATE_KEY, provider);
const openseaSDK = new OpenSeaSDK(
  seller,
  {
    chain: CHAIN,
    apiKey: "",
  },
  undefined,
  
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
const disputeResolverId2 = 85; // <change accordingly
offer.quantityAvailable = 100;
offer.priceType = PriceType.Discovery;
offer.sellerDeposit="0";
offer.exchangeToken = WETH_ADDRESS;
offer.price = "0";
offer.buyerCancelPenalty="0";
offer.royaltyInfo = [new RoyaltyInfo([],[])];
await offerHandler.connect(assistant).createOffer(offer.toStruct(), offerDates.toStruct(), offerDurations.toStruct(), disputeResolverId2, "0", MaxUint256);
offer.id = "320"; // <change accordingly

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
const bosonWrapper = await bosonWrapperFactory.deploy(CONTRACT_ADDRESS, PROTOCOL_ADDRESS, WRAPPED_NATIVE, PRICE_DISCOVERY_CLIENT);
await bosonWrapper.waitForDeployment();

// if already exists
const WRAPPER_ADDRESS = "0x21631eC6DB0042d06e992dae7c7aAC0EaF627B60";
const bosonWrapper = await getContractAt("OpenSeaWrapper", WRAPPER_ADDRESS);


// 5. LIST ON OPENSEA
// wrap
await bosonVoucher.connect(assistant).setApprovalForAll(WRAPPER_ADDRESS, true);
await bosonWrapper.connect(assistant).wrapForAuction([TOKEN_ID]);
// list manually on opensea
listing = await openseaSDK.createListing({
    asset: {
        tokenId: TOKEN_ID,
        tokenAddress: WRAPPER_ADDRESS,
    },
    accountAddress: assistant.address,
    startAmount: "0.01", // <change accordingly
    endAmount: "0.01", // <change accordingly
    expirationTime: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 1 day
    quantity: "1",
    listingTime: Math.floor(Date.now() / 1000),
    paymentTokenAddress: "0x52eF3d68BaB452a294342DC3e5f464d7f610f72E"
});


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
