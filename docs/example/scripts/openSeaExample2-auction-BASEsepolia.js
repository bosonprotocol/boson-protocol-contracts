// Start the node
// npx hardhat console --network amoy

// DEPENDENCIES
const { ethers: ethersv5 } = require("ethersv5");
const { OpenSeaSDK, Chain } = require("opensea-js");
// const { ZeroAddress, getContractAt, MaxUint256, getContractFactory } = ethers;
BigInt.prototype.toJSON = function () {
  return this.toString();
};
// const Side = require("./scripts/domain/Side.js");
// const PriceDiscovery = require("./scripts/domain/PriceDiscovery.js");
const { OrderSide } = require("opensea-js/lib/types");
const { ENGLISH_AUCTION_ZONE_TESTNETS } = require("opensea-js/lib/constants");

// CONFIG
const RPC_URL = "https://base-sepolia.g.alchemy.com/v2/PKLj-7u3odGLdgJWZZEQl0vNHYrDhO9a";
const CHAIN = Chain.BaseSepolia;
const PRIVATE_KEY = "0x56d0d07e8b54c1e91e9ab40a8a396b8f665dda811e8b8bb226b2525c7f7e72cd"; // seller
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
// const PROTOCOL_ADDRESS = "0x7de418a7ce94debd057c34ebac232e7027634ade";
// const PRICE_DISCOVERY_CLIENT = "0xFDD51a6DB1cE50d1C33b98782035f3cB1E7E1f14";
const sellerAddress = "0x2a91A0148EE62fA638bE38C7eE05c29a3e568dD8";

const CONTRACT_ADDRESS = "0x8ADa73881c4bE5Acd482658d9090753806328175"; // voucher, <change
let TOKEN_ID = "5444517870735015415413993718908291383414"; // <change


let randomWallet = ethers.Wallet.createRandom().connect(ethers.provider)
// INIT
const provider = new ethersv5.providers.JsonRpcProvider(RPC_URL); // to do replace with v6 provider
// const seller = new ethersv5.Wallet(PRIVATE_KEY, provider);
const seller2 = new ethers.Wallet(PRIVATE_KEY, provider); // another seller
const openseaSDK2 = new OpenSeaSDK(
  randomWallet, // initialize with a random wallet, using provider without signer complicates things
  {
    chain: CHAIN,
    apiKey: "",
  },  
);
// const bosonVoucher = await getContractAt("BosonVoucher", CONTRACT_ADDRESS);
// const [assistant] = await ethers.getSigners();
// const priceDiscoveryHandler = await getContractAt("IBosonPriceDiscoveryHandler", PROTOCOL_ADDRESS);


// CREATE SELLER (ONE TIME)
// const { mockSeller, mockAuthToken, mockVoucherInitValues } = require("./test/util/mock.js");
// const sellerObject = mockSeller(assistant.address, assistant.address, ZeroAddress, assistant.address);
// const emptyAuthToken = mockAuthToken();
// const voucherInitValues = mockVoucherInitValues();
// const accountHandler = await ethers.getContractAt("IBosonAccountHandler", PROTOCOL_ADDRESS);
// await accountHandler.connect(assistant).createSeller(sellerObject, emptyAuthToken, voucherInitValues);

// // CREATE DR (ONE TIME)
// const { DisputeResolverFee } = require("./scripts/domain/DisputeResolverFee.js");
// const { RoyaltyInfo } = require("./scripts/domain/RoyaltyInfo.js");

// const { mockDisputeResolver } = require("./test/util/mock.js");
// const DR = assistant;
// const disputeResolver = mockDisputeResolver(DR.address, DR.address, ZeroAddress, DR.address, true);
// const disputeResolverFees = [new DisputeResolverFee(ZeroAddress, "Native", "0"),
// new DisputeResolverFee(WETH_ADDRESS, "WETH", "0")];
// const sellerAllowList = [];
// await accountHandler.connect(DR).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

// CREATE ORDER
// 1. BOSON PROTOCOL OFFER
// const offerHandler = await getContractAt("IBosonOfferHandler", PROTOCOL_ADDRESS)
// const { mockOffer } = require("./test/util/mock.js");
// const PriceType = require("./scripts/domain/PriceType.js");
// // const { SEAPORT_ADDRESS } = require("../../../test/util/constants.js");
// const { offer, offerDates, offerDurations } = await mockOffer();
// const disputeResolverId = 9; // <change accordingly
// offer.quantityAvailable = 100;
// offer.priceType = PriceType.Discovery;
// offer.sellerDeposit="0";
// offer.exchangeToken = WETH_ADDRESS;
// offer.price = "0";
// offer.buyerCancelPenalty="0";
// offer.royaltyInfo = [new RoyaltyInfo([],[])];
// await offerHandler.connect(assistant).createOffer(offer.toStruct(), offerDates.toStruct(), offerDurations.toStruct(), disputeResolverId, "0", MaxUint256);
// offer.id = "16"; // <change accordingly

// 2. RESERVE RANGE
// await offerHandler.connect(assistant).reserveRange(offer.id, offer.quantityAvailable, assistant.address);

// 3. PREMINT VOUCHER
// const { calculateBosonProxyAddress, calculateCloneAddress } = require("./test/util/utils.js");
// beaconProxyAddress = await calculateBosonProxyAddress(PROTOCOL_ADDRESS);
// voucherAddress = calculateCloneAddress(PROTOCOL_ADDRESS,beaconProxyAddress, seller.admin);
// bosonVoucher = await getContractAt("BosonVoucher", voucherAddress);
// await bosonVoucher.connect(assistant).preMint(offer.id, offer.quantityAvailable);

SEAPORT_ADDRESS = "0x0000000000000068F116a894984e2DB1123eB395"
// await bosonVoucher.connect(assistant).setApprovalForAll(SEAPORT_ADDRESS, true);

// 5. LIST ON OPENSEA

// listing = await openseaSDK2.createListing({
//     asset: {
//         tokenId: TOKEN_ID,
//         tokenAddress: CONTRACT_ADDRESS,
//     },
//     accountAddress: assistant.address,
//     startAmount: "0.01", // <change accordingly
//     endAmount: "0.01", // <change accordingly
//     expirationTime: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 1 day
//     quantity: "1",
//     listingTime: Math.floor(Date.now() / 1000),
//     paymentTokenAddress: WETH_ADDRESS
// });

let asset = {
  tokenId: TOKEN_ID,
  tokenAddress: CONTRACT_ADDRESS,
};
let accountAddress = sellerAddress; // <change accordingly
let paymentTokenAddress = WETH_ADDRESS; // <change accordingly
let listingTime = Math.floor(Date.now() / 1000); // <change accordingly
let expirationTime = Math.floor(Date.now() / 1000) + 60 * 60 * 24; // 1 day
let startAmount = "0.02"
let endAmount = "0.02";


// ^ same but step by step
let { nft } = await openseaSDK2.api.getNFT(asset.tokenAddress, asset.tokenId);
let offerAssetItems2 = openseaSDK2.getNFTItems([nft], [BigInt(1)]);
let { basePrice, endPrice } = await openseaSDK2._getPriceParameters(
      OrderSide.LISTING,
      paymentTokenAddress,
      expirationTime,
      startAmount,
      endAmount,
    );
    const collection = await openseaSDK2.api.getCollection(nft.collection);
    const considerationFeeItems = await openseaSDK2.getFees({
      collection,
      seller: accountAddress,
      paymentTokenAddress,
      startAmount: basePrice,
      endAmount: endPrice,
      excludeOptionalCreatorFees: false,
    });

        let  { actions, executeAllActions } = await openseaSDK2.seaport_v1_6.createOrder(
          {
            offer: offerAssetItems2,
            consideration: considerationFeeItems,
            startTime: listingTime?.toString(),
            endTime:
              expirationTime?.toString(),
            zone: ENGLISH_AUCTION_ZONE_TESTNETS,
            domain: undefined, // <change accordingly
            salt: BigInt(0).toString(),
            restrictedByZone: true,
            allowPartialFills: false,
          },
          accountAddress,
        );

        r = JSON.parse(await actions[0].getMessageToSign())
        delete r.types.EIP712Domain
        let signature = await seller2.signTypedData(r.domain, r.types, r.message)

        // 0x783e489e5dbe7338906b05475a29ad25e07f47753eb30c72632f8c0ba16cb5af0bdbbee011637a58bf49b00c2fc801e5304ded4824ab7e61b3fdf3854053d8041c
        // 0x783e489e5dbe7338906b05475a29ad25e07f47753eb30c72632f8c0ba16cb5af8bdbbee011637a58bf49b00c2fc801e5304ded4824ab7e61b3fdf3854053d804

        // const order = await executeAllActions();
        order = await actions[0].createOrder()
        order.signature = signature.slice(0,-2)
       await openseaSDK2.api.postOrder(order, {
              protocol: "seaport",
              protocolAddress: SEAPORT_ADDRESS,
              side: OrderSide.LISTING,
            });

// 5. AUCTION <- buyers place bids on opensea

// 6. ACCEPT BID
// get order from the API
// let order = await openseaSDK.api.getOrder({
//     assetContractAddress: WRAPPER_ADDRESS,
//     tokenId: TOKEN_ID,
//     side: "bid"});


// generate fulfillment data
// let ffd = await openseaSDK.api.generateFulfillmentData(WRAPPER_ADDRESS, order.orderHash, order.protocolAddress, order.side);

// // buyerOrder = ffd.fulfillment_data.orders[0] // <can this be used for simple oreder?
// let buyerAdvancedOrder = ffd.fulfillment_data.transaction.input_data.orders[0];

// // prepare price discovery data


// // ~~~~~~~~~~~~~~~~~~~~~
// // 2-step unwrap
// await bosonWrapper.connect(assistant).finalizeAuction(TOKEN_ID, buyerAdvancedOrder);

// let pdd = bosonWrapper.interface.encodeFunctionData("unwrap", [TOKEN_ID]);
// // const price = ethers.parseUnits("0.001", "ether"); // from bid on openSea
// // let priceDiscovery = new PriceDiscovery(price*975n/1000n, Side.Wrapper, WRAPPER_ADDRESS, WRAPPER_ADDRESS, pdd);

// let input = ffd.fulfillment_data.transaction.input_data;
// let priceDiscovery = new PriceDiscovery(input.orders[1].parameters.consideration[0].startAmount,  Side.Wrapper, WRAPPER_ADDRESS, WRAPPER_ADDRESS, pdd);
// await priceDiscoveryHandler.connect(seller).commitToPriceDiscoveryOffer(input.orders[0].parameters.offerer, TOKEN_ID, priceDiscovery);

// // ~~~~~~~~~~~~~~~~~~~~~
// // 1-step unwrap [WIP]
// // it must be the owner...
// await bosonVoucher.connect(seller).setApprovalForAll(PROTOCOL_ADDRESS, true);
// let pdd = bosonWrapper.interface.encodeFunctionData("finalizeAuction", [TOKEN_ID, buyerAdvancedOrder]);
// let input = ffd.fulfillment_data.transaction.input_data;
// let priceDiscovery = new PriceDiscovery(input.orders[1].parameters.consideration[0].startAmount,  Side.Wrapper, WRAPPER_ADDRESS, WRAPPER_ADDRESS, pdd);
