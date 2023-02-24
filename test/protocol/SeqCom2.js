const hre = require("hardhat");
const ethers = hre.ethers;
const { expect, assert } = require("chai");

const { deploySuite, upgradeSuite, populateProtocolContract, getProtocolContractState } = require("../util/upgrade");
const Role = require("../../scripts/domain/Role");
const Dispute = require("../../scripts/domain/Dispute");
const Receipt = require("../../scripts/domain/Receipt");
const TwinReceipt = require("../../scripts/domain/TwinReceipt");
const Exchange = require("../../scripts/domain/Exchange");
const Voucher = require("../../scripts/domain/Voucher");
const TokenType = require("../../scripts/domain/TokenType");
const Bundle = require("../../scripts/domain/Bundle");
const ExchangeState = require("../../scripts/domain/ExchangeState");
const DisputeState = require("../../scripts/domain/DisputeState");
const Group = require("../../scripts/domain/Group");
const EvaluationMethod = require("../../scripts/domain/EvaluationMethod");
const PriceDiscovery = require("../../scripts/domain/PriceDiscovery");
const Direction = require("../../scripts/domain/Direction");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployAndCutFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const {
  mockOffer,
  mockTwin,
  mockDisputeResolver,
  mockAuthToken,
  mockVoucherInitValues,
  mockSeller,
  mockVoucher,
  mockExchange,
  mockCondition,
  mockAgent,
  mockBuyer,
  accountId,
} = require("../util/mock");
const {
  getEvent,
  setNextBlockTimestamp,
  calculateVoucherExpiry,
  prepareDataSignatureParameters,
  calculateContractAddress,
  applyPercentage,
  getFacetsWithArgs,
} = require("../util/utils.js");
const { oneWeek, oneMonth, maxPriorityFeePerGas } = require("../util/constants");
const { FundsList } = require("../../scripts/domain/Funds");
const { getSelectors, FacetCutAction } = require("../../scripts/util/diamond-utils.js");

/**
 *  Test the Boson Exchange Handler interface
 */
async function testSeqCom() {
  // Common vars
  let InterfaceIds;
  let deployer,
    pauser,
    assistant,
    admin,
    clerk,
    treasury,
    rando,
    buyer,
    buyer2,
    newOwner,
    fauxClient,
    assistantDR,
    adminDR,
    clerkDR,
    treasuryDR,
    protocolTreasury,
    bosonToken;
  let erc165,
    protocolDiamond,
    accessController,
    accountHandler,
    exchangeHandler,
    offerHandler,
    fundsHandler,
    disputeHandler,
    twinHandler,
    bundleHandler,
    groupHandler,
    pauseHandler,
    configHandler,
    mockMetaTransactionsHandler;
  let bosonVoucher, voucherImplementation;
  let bosonVoucherClone, bosonVoucherCloneAddress;
  let buyerId, offerId, seller, nextExchangeId, nextAccountId, disputeResolverId;
  let block, blockNumber, tx, txReceipt, event;
  let support, newTime;
  let price, sellerPool;
  let voucherRedeemableFrom;
  let disputePeriod, voucherValid;
  let protocolFeePercentage, protocolFeeFlatBoson, buyerEscalationDepositPercentage;
  let voucher, validUntilDate;
  let exchange, response, exists;
  let disputeResolver, disputeResolverFees;
  let foreign20, foreign721, foreign1155;
  let twin20, twin721, twin1155, twinIds, bundle, balance, owner;
  let expectedCloneAddress;
  let groupId, offerIds, condition, group;
  let voucherInitValues, royaltyPercentage1, royaltyPercentage2, seller1Treasury, seller2Treasury;
  let emptyAuthToken;
  let agentId, agent;
  let exchangesToComplete, exchangeId;
  let offer, offerFees;
  let offerDates, offerDurations;
  let weth;



  // Make accounts available
  [
    deployer,
    pauser,
    admin,
    treasury,
    buyer,
    buyer2,
    rando,
    newOwner,
    fauxClient,
    adminDR,
    treasuryDR,
    protocolTreasury,
    bosonToken,
  ] = await ethers.getSigners();

  const { chainId } = await ethers.provider.getNetwork();
console.log("chainId", chainId)

  console.log("signers", (await ethers.getSigners()).length)

  pauser = admin = treasury = buyer = buyer2 = rando = newOwner = fauxClient = adminDR = treasuryDR = protocolTreasury = bosonToken = deployer;

  await network.provider.send("hardhat_setBalance", [
    deployer.address,
    "0x100000000000000000000000000000000000000",
  ]);

    // make all account the same
    assistant = clerk = admin;
    assistantDR = clerkDR = adminDR;

    console.log("UPGRADE SUITE")
  
    protocolAddress = "0x785a225EBAC1b600cA3170C6c7fA3488A203Fc21"
    // await upgradeSuite("HEAD",protocolAddress, {})

  // const wethFactory = await ethers.getContractFactory("WETH9");
  // weth = await wethFactory.deploy();
  // await weth.deployed();

  // Add WETH
  // facetsToDeploy["ExchangeHandlerFacet"].constructorArgs = [weth.address];



  // Cast Diamond to IBosonExchangeHandler
  exchangeHandler = await ethers.getContractAt("IBosonExchangeHandler", protocolAddress);



  // All supported Exchange methods


  // Initial ids for all the things
  exchangeId = offerId = 842;
  expectedCloneAddress = "0x9ede0221b5f7671e4d615c000c85d84086bcd728"



  let priceDiscoveryContract, priceDiscovery, price2;
  let newBuyer;
  let reseller; // for clarity in tests

  // TODO:
  // * ERC20 as exchange token


  // Deploy PriceDiscovery contract
  
  priceDiscoveryContract = {address:"0x00000000006c3852cbEf3e08E8dF289169EdE581"} // seaport address



  reseller = buyer;


  // Price on secondary market
  // price2 = "9950000000000000";
  // "50000000000000"
  price2 = ethers.utils.parseEther("0.01",);
console.log("price2", price2.toString())

  // Prepare calldata for PriceDiscovery contract

  const priceDiscoveryData = "0xfb0f3ee100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000235978e783e000000000000000000000000000dbfe0680c1bc12b0db91e4f8aad186bdf57d9f7300000000000000000000000000000000000000000000000000000000000000000000000000000000000000009ede0221b5f7671e4d615c000c85d84086bcd728000000000000000000000000000000000000000000000000000000000000034a000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000063f8af4c00000000000000000000000000000000000000000000000000000000641d994c0000000000000000000000000000000000000000000000000000000000000000360c6ebe000000000000000000000000000000000000000045ce0a32ec2943370000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f00000000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f00000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000024000000000000000000000000000000000000000000000000000000000000002a0000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000002d79883d20000000000000000000000000000000a26b00c1f0df003000390027140000faa71900000000000000000000000000000000000000000000000000000000000000418b35cf6bf6b56773ccc28fc82612194144987095c3a759648893db7c1587ccaa1ba76b93ba540cbd47fbff49a027e0a2c2aa390e5e01a8d4cba4a856c94e15651c0000000000000000000000000000000000000000000000000000000000000000000000360c6ebe";

  priceDiscovery = new PriceDiscovery(
    price2,
    priceDiscoveryContract.address,
    priceDiscoveryData,
    Direction.Buy
  );

  // Seller needs to deposit weth in order to fill the escrow at the last step
  // Price2 is theoretically the highest amount needed, in practice it will be less (around price2-price)
  // await weth.connect(buyer).deposit({ value: price2 });
  // await weth.connect(buyer).approve(protocolDiamond.address, price2);

  // Approve transfers
  // Buyer does not approve, since its in ETH.
  // Seller approves price discovery to transfer the voucher
  // bosonVoucherClone = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);
  // await bosonVoucherClone.connect(buyer).setApprovalForAll(priceDiscoveryContract.address, true);

  // mockBuyer(buyer.address); // call only to increment account id counter
  // newBuyer = mockBuyer(buyer2.address);
  // exchange.buyerId = newBuyer.id;

  console.log("start commiting")

  tx = await exchangeHandler
    .connect(buyer2)
    .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery, { value: price2 })

  console.log(await tx.wait())



}


testSeqCom()