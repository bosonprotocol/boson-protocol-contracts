// Start the node
// npx hardhat console --network mumbai

// DEPENDENCIES
const { ethers: ethersv5 } = require("ethersv5");
const { OpenSeaSDK, Chain } = require("opensea-js");
const { Seaport } = require("@opensea/seaport-js");
const { ZeroAddress, getContractAt, MaxUint256 } = ethers;
BigInt.prototype.toJSON = function () {
  return this.toString();
};
const {
    objectToArray,
  } = require("./test/util/utils.js")

// CONFIG
const RPC_URL = "https://polygon-mumbai.g.alchemy.com/v2/Lh0tB9SSPhJh8f6BCMmlDJ7WrmApb_X_";
const CHAIN = Chain.Mumbai;
const PRIVATE_KEY = "###"; // seller
const OPENSEA_CONDUIT = "0x1e0049783f008a0085193e00003d00cd54003c71";
const { SEAPORT_ADDRESS_5: SEAPORT_ADDRESS } = require("./test/util/constants.js");
const WETH_ADDRESS = "0xA6FA4fB5f76172d178d61B04b0ecd319C5d1C0aa";
const PROTOCOL_ADDRESS = "0x76051FC05Ab42D912a737d59a8711f1446712630";

const CONTRACT_ADDRESS = "0x7889dB3b4B605c7Dc3Bc5A47286b7BB20Fac331F"; // voucher, <change
let TOKEN_ID = "245683868916917570620556466565736648671621"; // <change

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
const sellerAddress = await seller.getAddress();
const seaport = await getContractAt("Seaport", SEAPORT_ADDRESS);
const bosonVoucher = await getContractAt("BosonVoucher", CONTRACT_ADDRESS);
const seaportSDK = new Seaport(provider, { seaportVersion: "1.5" });
const [assistant] = await ethers.getSigners();

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

// 4. LIST ON OPENSEA <- this done manually at the moment


// 5. AUCTION <- buyers place bids on opensea

// 6. ACCEPT BID
// get order from the API
let order = await openseaSDK.api.getOrder({
    assetContractAddress: CONTRACT_ADDRESS,
    tokenId: TOKEN_ID,
    side: "bid"});
const Side = require("./scripts/domain/Side.js");
const PriceDiscovery = require("./scripts/domain/PriceDiscovery.js");
const priceDiscoveryHandler = await getContractAt("IBosonPriceDiscoveryHandler", PROTOCOL_ADDRESS)

// approve voucher transfer seller -> protocol
// await bosonVoucher.connect(seller).approve(PROTOCOL_ADDRESS, TOKEN_ID) // does not work?
await bosonVoucher.connect(seller).setApprovalForAll(PROTOCOL_ADDRESS, true);

// generate fulfillment data
const BOSON_PD_CLIENT = "0x74874fF29597b6e01E16475b7BB9D6dC954d0411";
let ffd = await openseaSDK.api.generateFulfillmentData(BOSON_PD_CLIENT, order.orderHash, order.protocolAddress, order.side);
let input = ffd.fulfillment_data.transaction.input_data;

// prepare pricediscovery data
let pdd = seaport.interface.encodeFunctionData("matchAdvancedOrders", objectToArray(input));
let priceDiscovery = new PriceDiscovery(input.orders[1].parameters.consideration[0].startAmount, Side.Bid, SEAPORT_ADDRESS, OPENSEA_CONDUIT, pdd);
await priceDiscoveryHandler.connect(seller).commitToPriceDiscoveryOffer(input.orders[0].parameters.offerer, TOKEN_ID, priceDiscovery);
