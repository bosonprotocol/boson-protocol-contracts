// setup
const { ethers } = require("ethers"); // v6 ethers
const { ethers: ethersv5 } = require("ethersv5"); // ethers v6 could be used, I was just started with old example with v5
const { OpenSeaSDK, Chain } = require("opensea-js"); // v^7.1.18
const { OrderSide } = require("opensea-js/lib/types");
const { ENGLISH_AUCTION_ZONE_TESTNETS } = require("opensea-js/lib/constants");

const RPC_URL = "https://base-sepolia.g.alchemy.com/v2/###";
const CHAIN = Chain.BaseSepolia;
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006"; // can be obtained from opensea-sdk
SEAPORT_ADDRESS = "0x0000000000000068F116a894984e2DB1123eB395"; // seaport v1.6; can be obtained from opensea-sdk

let randomWallet = ethers.Wallet.createRandom().connect(ethers.provider);
const provider = new ethersv5.providers.JsonRpcProvider(RPC_URL);
const openseaSDK = new OpenSeaSDK(
  randomWallet, // initialize with a random wallet, using a provider without a signer complicates things
  {
    chain: CHAIN,
    apiKey: "",
  }
);

// Input parameters, agent should provide them
const sellerAddress = "0x2a91A0148EE62fA638bE38C7eE05c29a3e568dD8"; // agent's address
const CONTRACT_ADDRESS = "0x8ADa73881c4bE5Acd482658d9090753806328175"; // contract with NFTs; in fermion that's FNFT address
let TOKEN_ID = "5444517870735015415413993718908291383414"; // token to be listed
let paymentTokenAddress = WETH_ADDRESS; // auctions can be done only with WETH, except on mainnet
let listingTime = Math.floor(Date.now() / 1000); // <change accordingly
let expirationTime = Math.floor(Date.now() / 1000) + 60 * 60 * 24; // 1 day
let startAmount = "0.02"; // that means 0.02 WETH, no need to convert to wei, opensea-sdk does it for you
let endAmount = "0.02";

// Prepare the order, this is done by MCP
let asset = {
  tokenId: TOKEN_ID,
  tokenAddress: CONTRACT_ADDRESS,
};

let { nft } = await openseaSDK.api.getNFT(asset.tokenAddress, asset.tokenId);
let offerAssetItems = openseaSDK.getNFTItems([nft], [BigInt(1)]);
let { basePrice, endPrice } = await openseaSDK._getPriceParameters(
  OrderSide.LISTING,
  paymentTokenAddress,
  expirationTime,
  startAmount,
  endAmount
);
let collection = await openseaSDK.api.getCollection(nft.collection);
let considerationFeeItems = await openseaSDK.getFees({
  collection,
  seller: sellerAddress,
  paymentTokenAddress,
  startAmount: basePrice,
  endAmount: endPrice,
  excludeOptionalCreatorFees: false,
});
let { actions } = await openseaSDK.seaport_v1_6.createOrder(
  {
    offer: offerAssetItems,
    consideration: considerationFeeItems,
    startTime: listingTime?.toString(),
    endTime: expirationTime?.toString(),
    zone: ENGLISH_AUCTION_ZONE_TESTNETS,
    domain: undefined,
    salt: BigInt(0).toString(), // can put any random number here
    restrictedByZone: true,
    allowPartialFills: false,
  },
  sellerAddress
);

const messageToSign = await actions[0].getMessageToSign();
// MCP returns `messageToSign` to the agent

// agent actions, outside of MCP
// depending on the how the seller agent handles the wallets, it can be done in different ways
// It's just important is performs EIP712 signature of the `messageToSign`
// 1. if agent is using provider with a signer, it can sign the message directly, with
// rpc call to method `eth_signTypedData_v4` and parameters [sellerAddress, messageToSign]
// Using ethers, it can be done with provider.send("eth_signTypedData_v4", [await user.getAddress(), dataToSign])

// 2. Alternatively, if provider and signer are separated, ethers `signTypedData` can be used as in the example below
let r = JSON.parse(messageToSign);
delete r.types.EIP712Domain; // need to remove EIP712Domain type, otherwise it does not know what is primary type

const PRIVATE_KEY = "0x####"; // seller
const seller2 = new ethers.Wallet(PRIVATE_KEY, provider); // seller
let sellerSignature = await seller2.signTypedData(r.domain, r.types, r.message);
// agent passes the signature to MCP

// MCP finalizes the listing process
const order = await actions[0].createOrder(); // actions[0] are the actions from before
// it's important to properly handle this while waiting on agent's signature
// technically there could be multiple actions, waiting for the agent's signature
// probably there are multiple ways to handle this:
// 1. Create "order" at the same time as "messageToSign" and return both to the agent. Then agent
//    signs it and returns order (unchanged) and signature to MCP. Good since MCP does not need to store it,
//    bad since it requires more data to be sent to the agent and agent should not change the order
// 2. Cache the orders in MCP, give each unique ID, return it to the agent together with `messageToSign`.
//    Agent signs the message and returns the ID and signature to MCP. MCP then retrieves the order by ID.
//    Bad since it requires MCP to store the orders, possibly handle expiration etc.
// 3. ?? sure there are other ways, I don't know what is the standard way to do it

// replace order.signature with the seller's signature
order.signature = sellerSignature.slice(0, -2);

await openseaSDK.api.postOrder(order, {
  protocol: "seaport",
  protocolAddress: SEAPORT_ADDRESS,
  side: OrderSide.LISTING,
});
