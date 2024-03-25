// Start the node
// npx hardhat console --network mumbai

// DEPENDENCIES
const { ZeroAddress, getContractAt, MaxUint256, getContractFactory } = ethers;
BigInt.prototype.toJSON = function () {
  return this.toString();
};


// CONFIG
const WETH_ADDRESS = "0xA6FA4fB5f76172d178d61B04b0ecd319C5d1C0aa";
const PROTOCOL_ADDRESS = "0x76051FC05Ab42D912a737d59a8711f1446712630";

const CONTRACT_ADDRESS = "0x7889dB3b4B605c7Dc3Bc5A47286b7BB20Fac331F"; // voucher, <change
let TOKEN_ID = "245683868916917570620556466565736648671559"; // <change

// INIT
const bosonVoucher = await getContractAt("BosonVoucher", CONTRACT_ADDRESS);
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

// 4. WRAPPER
// create wrapper (if it does not exist yet)
// const PRICE_DISCOVERY_CLIENT = "0x74874fF29597b6e01E16475b7BB9D6dC954d0411";
// const bosonWrapperFactory = await getContractFactory("OpenSeaWrapper");
// const bosonWrapper = await bosonWrapperFactory.deploy(CONTRACT_ADDRESS, PROTOCOL_ADDRESS, WETH_ADDRESS, PRICE_DISCOVERY_CLIENT);
// await bosonWrapper.waitForDeployment()

// if already exists
const WRAPPER_ADDRESS = "0xE4db855b2efF11E562Ef7C5907B0dB970EA87477";
const bosonWrapper = await getContractAt("OpenSeaWrapper", WRAPPER_ADDRESS);

// 5. LIST ON OPENSEA
await bosonVoucher.connect(assistant).setApprovalForAll(WRAPPER_ADDRESS, true);
const price = ethers.parseUnits("0.01", "ether");
const endDate = "1713771401";
await bosonWrapper.connect(assistant).listFixedPriceOrder([TOKEN_ID],price,endDate);

// 6. ACCEPT THE OFFER <- buyers buys the item on OpenSea

// 6. UNWRAP THE VOUCHER BID


// prepare pricediscovery data
const Side = require("./scripts/domain/Side.js");
const PriceDiscovery = require("./scripts/domain/PriceDiscovery.js");
const priceDiscoveryHandler = await getContractAt("IBosonPriceDiscoveryHandler", PROTOCOL_ADDRESS);
let pdd = bosonWrapper.interface.encodeFunctionData("unwrap", [TOKEN_ID]);
let priceDiscovery = new PriceDiscovery(price*975n/1000n, Side.Wrapper, WRAPPER_ADDRESS, WRAPPER_ADDRESS, pdd);
const buyerAddress = "0x2a91A0148EE62fA638bE38C7eE05c29a3e568dD8";
await priceDiscoveryHandler.connect(assistant).commitToPriceDiscoveryOffer(buyerAddress, TOKEN_ID, priceDiscovery);
