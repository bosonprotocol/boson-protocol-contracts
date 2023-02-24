const hre = require("hardhat");
const ethers = hre.ethers;
const { expect, assert } = require("chai");

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

  console.log("signers", (await ethers.getSigners()).length)

  pauser = admin = treasury = buyer = buyer2 = rando = newOwner = fauxClient = adminDR = treasuryDR = protocolTreasury = bosonToken = deployer;

  await network.provider.send("hardhat_setBalance", [
    deployer.address,
    "0x100000000000000000000000000000000000000",
  ]);

    // make all account the same
    assistant = clerk = admin;
    assistantDR = clerkDR = adminDR;
  
  // Deploy the Protocol Diamond
  [protocolDiamond, , , , accessController] = await deployProtocolDiamond(maxPriorityFeePerGas);

  // Temporarily grant UPGRADER role to deployer account
  await accessController.grantRole(Role.UPGRADER, deployer.address);

  // Grant PROTOCOL role to ProtocolDiamond address and renounces admin
  await accessController.grantRole(Role.PROTOCOL, protocolDiamond.address);



  // Deploy the Protocol client implementation/proxy pairs (currently just the Boson Voucher)
  const protocolClientArgs = [protocolDiamond.address];
  const [implementations, beacons, proxies, clients] = await deployProtocolClients(
    protocolClientArgs,
    maxPriorityFeePerGas
  );
  [bosonVoucher] = clients;
  const [beacon] = beacons;
  const [proxy] = proxies;
  [voucherImplementation] = implementations;

  // Deploy the mock tokens
  [foreign20, foreign721, foreign1155] = await deployMockTokens(["Foreign20", "Foreign721", "Foreign1155"]);

  // set protocolFees
  protocolFeePercentage = "200"; // 2 %
  protocolFeeFlatBoson = ethers.utils.parseUnits("0.01", "ether").toString();
  buyerEscalationDepositPercentage = "1000"; // 10%

  // Add config Handler, so ids start at 1, and so voucher address can be found
  const protocolConfig = [
    // Protocol addresses
    {
      treasury: protocolTreasury.address,
      token: bosonToken.address,
      voucherBeacon: beacon.address,
      beaconProxy: proxy.address,
    },
    // Protocol limits
    {
      maxExchangesPerBatch: 50,
      maxOffersPerGroup: 100,
      maxTwinsPerBundle: 100,
      maxOffersPerBundle: 100,
      maxOffersPerBatch: 100,
      maxTokensPerWithdrawal: 100,
      maxFeesPerDisputeResolver: 100,
      maxEscalationResponsePeriod: oneMonth,
      maxDisputesPerBatch: 100,
      maxAllowedSellers: 100,
      maxTotalOfferFeePercentage: 4000, //40%
      maxRoyaltyPecentage: 1000, //10%
      maxResolutionPeriod: oneMonth,
      minDisputePeriod: oneWeek,
      maxPremintedVouchers: 1000,
    },
    // Protocol fees
    {
      percentage: protocolFeePercentage,
      flatBoson: protocolFeeFlatBoson,
      buyerEscalationDepositPercentage,
    },
  ];

  const facetNames = [
    "AccountHandlerFacet",
    "AgentHandlerFacet",
    "SellerHandlerFacet",
    "BuyerHandlerFacet",
    "DisputeResolverHandlerFacet",
    "ExchangeHandlerFacet",
    "OfferHandlerFacet",
    "FundsHandlerFacet",
    "DisputeHandlerFacet",
    "TwinHandlerFacet",
    "BundleHandlerFacet",
    "GroupHandlerFacet",
    "PauseHandlerFacet",
    "ProtocolInitializationHandlerFacet",
    "ConfigHandlerFacet",
  ];

  const facetsToDeploy = await getFacetsWithArgs(facetNames, protocolConfig);

  const wethFactory = await ethers.getContractFactory("WETH9");
  weth = await wethFactory.deploy();
  await weth.deployed();

  // Add WETH
  facetsToDeploy["ExchangeHandlerFacet"].constructorArgs = [weth.address];

  // Cut the protocol handler facets into the Diamond
  await deployAndCutFacets(protocolDiamond.address, facetsToDeploy, maxPriorityFeePerGas);

  // Cast Diamond to IERC165
  erc165 = await ethers.getContractAt("ERC165Facet", protocolDiamond.address);

  // Cast Diamond to IBosonAccountHandler. Use this interface to call all individual account handlers
  accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);

  // Cast Diamond to IBosonOfferHandler
  offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);

  // Cast Diamond to IBosonExchangeHandler
  exchangeHandler = await ethers.getContractAt("IBosonExchangeHandler", protocolDiamond.address);

  // Cast Diamond to IBosonFundsHandler
  fundsHandler = await ethers.getContractAt("IBosonFundsHandler", protocolDiamond.address);

  // Cast Diamond to IBosonDisputeHandler
  disputeHandler = await ethers.getContractAt("IBosonDisputeHandler", protocolDiamond.address);

  // Cast Diamond to ITwinHandler
  twinHandler = await ethers.getContractAt("IBosonTwinHandler", protocolDiamond.address);

  // Cast Diamond to IBundleHandler
  bundleHandler = await ethers.getContractAt("IBosonBundleHandler", protocolDiamond.address);

  // Cast Diamond to IGroupHandler
  groupHandler = await ethers.getContractAt("IBosonGroupHandler", protocolDiamond.address);

  // Cast Diamond to IBosonPauseHandler
  pauseHandler = await ethers.getContractAt("IBosonPauseHandler", protocolDiamond.address);

  // Cast Diamond to IConfigHandler
  configHandler = await ethers.getContractAt("IBosonConfigHandler", protocolDiamond.address);

  // Deploy the mock tokens
  [foreign20, foreign721, foreign1155] = await deployMockTokens(["Foreign20", "Foreign721", "Foreign1155"]);




  // All supported Exchange methods


  // Initial ids for all the things
  exchangeId = offerId = "1";
  agentId = "0"; // agent id is optional while creating an offer

  // Create a valid seller
  seller = mockSeller(assistant.address, admin.address, clerk.address, treasury.address);
  expect(seller.isValid()).is.true;

  // AuthToken
  emptyAuthToken = mockAuthToken();
  expect(emptyAuthToken.isValid()).is.true;

  // VoucherInitValues
  seller1Treasury = seller.treasury;
  royaltyPercentage1 = "0"; // 0%
  voucherInitValues = mockVoucherInitValues();
  expect(voucherInitValues.isValid()).is.true;

  await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);
  expectedCloneAddress = calculateContractAddress(accountHandler.address, "1");

  // Create a valid dispute resolver
  disputeResolver = mockDisputeResolver(
    assistantDR.address,
    adminDR.address,
    clerkDR.address,
    treasuryDR.address,
    true
  );
  expect(disputeResolver.isValid()).is.true;

  //Create DisputeResolverFee array so offer creation will succeed
  disputeResolverFees = [new DisputeResolverFee(ethers.constants.AddressZero, "Native", "0")];

  // Make empty seller list, so every seller is allowed
  const sellerAllowList = [];

  // Register the dispute resolver
  await accountHandler
    .connect(adminDR)
    .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

  // Create the offer
  const mo = await mockOffer();
  ({ offerDates, offerDurations } = mo);
  offer = mo.offer;
  offerFees = mo.offerFees;
  offerFees.protocolFee = applyPercentage(offer.price, protocolFeePercentage);

  offer.quantityAvailable = "10";
  disputeResolverId = mo.disputeResolverId;

  offerDurations.voucherValid = (oneMonth * 12).toString();

  // Check if domains are valid
  expect(offer.isValid()).is.true;
  expect(offerDates.isValid()).is.true;
  expect(offerDurations.isValid()).is.true;

  // Create the offer
  await offerHandler.connect(assistant).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

  // Set used variables
  price = offer.price;
  voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
  voucherValid = offerDurations.voucherValid;
  disputePeriod = offerDurations.disputePeriod;
  sellerPool = ethers.utils.parseUnits("15", "ether").toString();

  // Required voucher constructor params
  voucher = mockVoucher();
  voucher.redeemedDate = "0";

  // Mock exchange
  exchange = mockExchange();

  buyerId = accountId.next().value;
  exchange.buyerId = buyerId;
  exchange.finalizedDate = "0";

  // Deposit seller funds so the commit will succeed
  await fundsHandler
    .connect(assistant)
    .depositFunds(seller.id, ethers.constants.AddressZero, sellerPool, { value: sellerPool });




  let priceDiscoveryContract, priceDiscovery, price2;
  let newBuyer;
  let reseller; // for clarity in tests

  // TODO:
  // * ERC20 as exchange token


  // Deploy PriceDiscovery contract
  const PriceDiscoveryFactory = await ethers.getContractFactory("PriceDiscovery");
  priceDiscoveryContract = await PriceDiscoveryFactory.deploy();
  await priceDiscoveryContract.deployed();

        // Commit to offer with first buyer
  tx = await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });
  txReceipt = await tx.wait();
  event = getEvent(txReceipt, exchangeHandler, "BuyerCommitted");

  // Get the block timestamp of the confirmed tx
  blockNumber = tx.blockNumber;
  block = await ethers.provider.getBlock(blockNumber);

  // Update the committed date in the expected exchange struct with the block timestamp of the tx
  voucher.committedDate = block.timestamp.toString();

  // Update the validUntilDate date in the expected exchange struct
  voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

  reseller = buyer;


  // Price on secondary market
  price2 = ethers.BigNumber.from(price).mul(11).div(10).toString(); // 10% above the original price

  // Prepare calldata for PriceDiscovery contract
  let order = {
    seller: buyer.address,
    buyer: buyer2.address,
    voucherContract: expectedCloneAddress,
    tokenId: exchangeId,
    exchangeToken: offer.exchangeToken,
    price: price2,
  };

  const priceDiscoveryData = priceDiscoveryContract.interface.encodeFunctionData("fulfilBuyOrder", [order]);

  priceDiscovery = new PriceDiscovery(
    price2,
    priceDiscoveryContract.address,
    priceDiscoveryData,
    Direction.Buy
  );

  // Seller needs to deposit weth in order to fill the escrow at the last step
  // Price2 is theoretically the highest amount needed, in practice it will be less (around price2-price)
  await weth.connect(buyer).deposit({ value: price2 });
  await weth.connect(buyer).approve(protocolDiamond.address, price2);

  // Approve transfers
  // Buyer does not approve, since its in ETH.
  // Seller approves price discovery to transfer the voucher
  bosonVoucherClone = await ethers.getContractAt("IBosonVoucher", expectedCloneAddress);
  await bosonVoucherClone.connect(buyer).setApprovalForAll(priceDiscoveryContract.address, true);

  mockBuyer(buyer.address); // call only to increment account id counter
  newBuyer = mockBuyer(buyer2.address);
  exchange.buyerId = newBuyer.id;



  tx = await exchangeHandler
    .connect(buyer2)
    .sequentialCommitToOffer(buyer2.address, exchangeId, priceDiscovery, { value: price2 })

  console.log(await tx.wait())



}


testSeqCom()