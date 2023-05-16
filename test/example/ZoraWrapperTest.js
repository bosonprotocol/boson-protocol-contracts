// const hre = require("hardhat");
// const ethers = hre.ethers;
// const { expect } = require("chai");

// const Role = require("../../scripts/domain/Role");
// const TokenType = require("../../scripts/domain/TokenType");
// const Group = require("../../scripts/domain/Group");
// const EvaluationMethod = require("../../scripts/domain/EvaluationMethod");
// const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
// const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
// const { deployAndCutFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
// const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
// const {
//   mockOffer,
//   mockDisputeResolver,
//   mockAuthToken,
//   mockVoucherInitValues,
//   mockSeller,
//   mockCondition,
//   accountId,
// } = require("../util/mock");
// const { oneWeek, oneMonth, maxPriorityFeePerGas } = require("../util/constants");
// const { deploySnapshotGateExample } = require("../../scripts/example/SnapshotGate/deploy-snapshot-gate");
// const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
// const { getEvent, getFacetsWithArgs } = require("../util/utils");

// /**
//  *  Test the SnapshotGate example contract
//  */
// describe("SnapshotGate", function () {
//   // Common vars
//   let deployer,
//     pauser,
//     assistant,
//     assistant2,
//     admin,
//     clerk,
//     treasury,
//     rando,
//     assistantDR,
//     adminDR,
//     clerkDR,
//     treasuryDR,
//     protocolTreasury,
//     bosonToken,
//     holder1,
//     holder2,
//     holder3,
//     holder4,
//     holder5;
//   let protocolDiamond, accessController, accountHandler, offerHandler, groupHandler, exchangeHandler;
//   let offerId, seller, seller2, disputeResolverId;
//   let price, foreign20;
//   let protocolFeePercentage, protocolFeeFlatBoson, buyerEscalationDepositPercentage;
//   let disputeResolver, disputeResolverFees;
//   let snapshotGate;
//   let groupId, offerIds, condition, group, groups;
//   let voucherInitValues;
//   let emptyAuthToken;
//   let sellerId, agentId;
//   let offer, offers, otherSellerOfferId;
//   let offerDates, offerDurations;
//   let snapshot, snapshotTokenSupplies, snapshotTokenCount, holders, holderByAddress;

//   beforeEach(async function () {
//     // // Make accounts available
//     // [
//     //   deployer,
//     //   pauser,
//     //   admin,
//     //   treasury,
//     //   rando,
//     //   adminDR,
//     //   treasuryDR,
//     //   protocolTreasury,
//     //   assistant2,
//     //   bosonToken,
//     //   holder1,
//     //   holder2,
//     //   holder3,
//     //   holder4,
//     //   holder5,
//     // ] = await ethers.getSigners();

//     // // make all account the same
//     // assistant = clerk = admin;
//     // assistantDR = clerkDR = adminDR;

//     // // Deploy the Protocol Diamond
//     // [protocolDiamond, , , , accessController] = await deployProtocolDiamond(maxPriorityFeePerGas);

//     // // Temporarily grant UPGRADER role to deployer account
//     // await accessController.grantRole(Role.UPGRADER, deployer.address);

//     // // Grant PROTOCOL role to ProtocolDiamond address and renounces admin
//     // await accessController.grantRole(Role.PROTOCOL, protocolDiamond.address);

//     // // Temporarily grant PAUSER role to pauser account
//     // await accessController.grantRole(Role.PAUSER, pauser.address);

//     // // Deploy the Protocol client implementation/proxy pairs (currently just the Boson Voucher)
//     // const protocolClientArgs = [protocolDiamond.address];
//     // const [, beacons, proxies] = await deployProtocolClients(protocolClientArgs, maxPriorityFeePerGas);
//     // const [beacon] = beacons;
//     // const [proxy] = proxies;

//     // // Set protocolFees
//     // protocolFeePercentage = "200"; // 2 %
//     // protocolFeeFlatBoson = ethers.utils.parseUnits("0.01", "ether").toString();
//     // buyerEscalationDepositPercentage = "1000"; // 10%

//     // // Add config Handler, so ids start at 1, and so voucher address can be found
//     // const protocolConfig = [
//     //   // Protocol addresses
//     //   {
//     //     treasury: protocolTreasury.address,
//     //     token: bosonToken.address,
//     //     voucherBeacon: beacon.address,
//     //     beaconProxy: proxy.address,
//     //   },
//     //   // Protocol limits
//     //   {
//     //     maxExchangesPerBatch: 50,
//     //     maxOffersPerGroup: 100,
//     //     maxTwinsPerBundle: 100,
//     //     maxOffersPerBundle: 100,
//     //     maxOffersPerBatch: 100,
//     //     maxTokensPerWithdrawal: 100,
//     //     maxFeesPerDisputeResolver: 100,
//     //     maxEscalationResponsePeriod: oneMonth,
//     //     maxDisputesPerBatch: 100,
//     //     maxAllowedSellers: 100,
//     //     maxTotalOfferFeePercentage: 4000, //40%
//     //     maxRoyaltyPecentage: 1000, //10%
//     //     maxResolutionPeriod: oneMonth,
//     //     minDisputePeriod: oneWeek,
//     //     maxPremintedVouchers: 10000,
//     //   },
//     //   // Protocol fees
//     //   {
//     //     percentage: protocolFeePercentage,
//     //     flatBoson: protocolFeeFlatBoson,
//     //     buyerEscalationDepositPercentage,
//     //   },
//     // ];

//     // const facetNames = [
//     //   "AccountHandlerFacet",
//     //   "SellerHandlerFacet",
//     //   "DisputeResolverHandlerFacet",
//     //   "ExchangeHandlerFacet",
//     //   "OfferHandlerFacet",
//     //   "GroupHandlerFacet",
//     //   "ProtocolInitializationHandlerFacet",
//     //   "ConfigHandlerFacet",
//     // ];

//     // const facetsToDeploy = await getFacetsWithArgs(facetNames, protocolConfig);

//     // // Cut the protocol handler facets into the Diamond
//     // await deployAndCutFacets(protocolDiamond.address, facetsToDeploy, maxPriorityFeePerGas);

//     // // Cast Diamond to IBosonAccountHandler. Use this interface to call all individual account handlers
//     // accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);

//     // // Cast Diamond to IBosonOfferHandler
//     // offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);

//     // // Cast Diamond to IGroupHandler
//     // groupHandler = await ethers.getContractAt("IBosonGroupHandler", protocolDiamond.address);

//     // // Cast Diamond to IBosonExchangeHandler
//     // exchangeHandler = await ethers.getContractAt("IBosonExchangeHandler", protocolDiamond.address);

//     // // Deploy the SnapshotGate example
//     // sellerId = "1";
//     // [snapshotGate] = await deploySnapshotGateExample(["SnapshotGateToken", "SGT", protocolDiamond.address, sellerId]);

//     // // Deploy the mock tokens
//     // [foreign20] = await deployMockTokens(["Foreign20"]);

//     // // Initial ids for all the things
//     // offerId = "1";
//     // groupId = "1";
//     // agentId = "0"; // agent id is optional while creating an offer

//     // // Create a valid seller
//     // seller = mockSeller(assistant.address, admin.address, clerk.address, treasury.address);
//     // expect(seller.isValid()).is.true;

//     // // Create a second seller
//     // seller2 = mockSeller(assistant2.address, assistant2.address, assistant2.address, assistant2.address);
//     // expect(seller2.isValid()).is.true;

//     // // AuthToken
//     // emptyAuthToken = mockAuthToken();
//     // expect(emptyAuthToken.isValid()).is.true;

//     // // VoucherInitValues
//     // voucherInitValues = mockVoucherInitValues();
//     // expect(voucherInitValues.isValid()).is.true;

//     // // Create the seller
//     // await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

//     // // Create the second seller
//     // await accountHandler.connect(assistant2).createSeller(seller2, emptyAuthToken, voucherInitValues);

//     // // Create a valid dispute resolver
//     // disputeResolver = mockDisputeResolver(
//     //   assistantDR.address,
//     //   adminDR.address,
//     //   clerkDR.address,
//     //   treasuryDR.address,
//     //   true
//     // );
//     // expect(disputeResolver.isValid()).is.true;

//     // // Create DisputeResolverFee array so offer creation will succeed
//     // disputeResolverFees = [
//     //   new DisputeResolverFee(ethers.constants.AddressZero, "Native", "0"),
//     //   new DisputeResolverFee(foreign20.address, "Foriegn20", "0"),
//     // ];

//     // // Make empty seller list, so every seller is allowed
//     // const sellerAllowList = [];

//     // // Register the dispute resolver
//     // await accountHandler.connect(adminDR).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

//     // // Manufacture snapshot for upload
//     // snapshot = []; // { owner : string; tokenId: string; amount: string }[]
//     // snapshotTokenSupplies = {}; // map token ids to supplies
//     // snapshotTokenCount = 5; // create 5 snapshot token ids
//     // holders = [
//     //   // holder accounts
//     //   holder1,
//     //   holder2,
//     //   holder3,
//     //   holder4,
//     //   holder5,
//     // ];

//     // holderByAddress = {
//     //   [holder1.address]: holder1,
//     //   [holder2.address]: holder2,
//     //   [holder3.address]: holder3,
//     //   [holder4.address]: holder4,
//     //   [holder5.address]: holder5,
//     // };

//     // // Each holder will have a random amount of each token
//     // for (let holder of holders) {
//     //   // Mint a bunch of exchange tokens for the holder and approve the gate to transfer them
//     //   const amountToMint = "15000000000000000000";
//     //   await foreign20.connect(holder).mint(holder.address, amountToMint);
//     //   await foreign20.connect(holder).approve(snapshotGate.address, amountToMint);

//     //   // Create snapshot entry for holder / token
//     //   for (let i = 1; i <= snapshotTokenCount; i++) {
//     //     // The token id
//     //     const tokenId = i.toString();

//     //     // Get a random balance 1 - 9
//     //     const balance = Math.floor(Math.random() * 10) + 1;

//     //     // Track the total supply of each token - corresponding offer's qty available must match
//     //     snapshotTokenSupplies[tokenId] = String(Number(snapshotTokenSupplies[tokenId] || 0) + balance);

//     //     // Add snapshot entry
//     //     snapshot.push({
//     //       owner: holder.address,
//     //       tokenId: i.toString(),
//     //       amount: balance.toString(),
//     //     });
//     //   }
//     // }

//     // // Create gated offers in a loop

//     // offers = [];
//     // groups = [];

//     // // Make 2 passes, creating native token offers and then ERC20 offers
//     // for (let j = 0; j < 2; j++) {
//     //   for (let i = 1; i <= snapshotTokenCount; i++) {
//     //     // The token id
//     //     const tokenId = i.toString(); // first and second batches use same token ids
//     //     offerId = Number(snapshotTokenCount * j + i).toString(); // offer id from first or second batch
//     //     groupId = offerId;

//     //     // The supply of this token
//     //     const tokenSupply = snapshotTokenSupplies[tokenId];

//     //     // Create the offer
//     //     const mo = await mockOffer();
//     //     ({ offerDates, offerDurations } = mo);
//     //     offer = mo.offer;
//     //     price = offer.price;

//     //     // Set price in ERC-20 token if on second pass
//     //     if (j > 0) {
//     //       offer.exchangeToken = foreign20.address;
//     //       offer.buyerCancelPenalty = "0";
//     //     }

//     //     offer.sellerDeposit = "0";
//     //     offer.quantityAvailable = tokenSupply;
//     //     disputeResolverId = disputeResolver.id;

//     //     // Check if entities are valid
//     //     expect(offer.isValid()).is.true;
//     //     expect(offerDates.isValid()).is.true;
//     //     expect(offerDurations.isValid()).is.true;

//     //     // Create the offer
//     //     await offerHandler
//     //       .connect(assistant)
//     //       .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);
//     //     offers.push(offer);

//     //     // Required constructor params for Group
//     //     offerIds = [offerId];

//     //     // Create Condition
//     //     condition = mockCondition({
//     //       tokenAddress: snapshotGate.address,
//     //       threshold: "0",
//     //       maxCommits: tokenSupply,
//     //       tokenType: TokenType.NonFungibleToken,
//     //       tokenId: tokenId,
//     //       method: EvaluationMethod.SpecificToken,
//     //     });
//     //     expect(condition.isValid()).to.be.true;

//     //     // Create Group
//     //     group = new Group(groupId, seller.id, offerIds);
//     //     expect(group.isValid()).is.true;
//     //     await groupHandler.connect(assistant).createGroup(group, condition);
//     //     groups.push(group);
//     //   }
//     // }
//     // // End of gated offers creation

//     // // Create second seller offer
//     // const mo = await mockOffer();
//     // ({ offerDates, offerDurations } = mo);
//     // offer = mo.offer;
//     // offer.sellerId = "2"; // second seller
//     // offer.price = price;
//     // offer.sellerDeposit = "0";
//     // offer.quantityAvailable = "5";
//     // offer.buyerCancelPenalty = "0";

//     // // Check if entities are valid
//     // expect(offer.isValid()).is.true;
//     // expect(offerDates.isValid()).is.true;
//     // expect(offerDurations.isValid()).is.true;

//     // // Create the offer
//     // let tx = await offerHandler
//     //   .connect(assistant2)
//     //   .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);
//     // offers.push(offer);

//     // const txReceipt = await tx.wait();
//     // const event = getEvent(txReceipt, offerHandler, "OfferCreated");
//     // otherSellerOfferId = event.offerId;
//   });

//   afterEach(async function () {
//     // Reset the accountId iterator
//     accountId.next(true);
//   });

//   // All supported SnapshotGate methods
//   context("📋 SnapshotGate Methods", async function () {
//     context("👉 appendToSnapshot()", async function () {
//       it("Deployment", async function () {
//         // Deploy the SnapshotGate
//         const ZoraWrapper = await ethers.getContractFactory("ZoraWrapper");
//         const zoraWrapper = await ZoraWrapper.deploy(ethers.constants.AddressZero, ethers.constants.AddressZero);

//         console.log(await zoraWrapper.name());
//       });

//     });

//   });

// });
