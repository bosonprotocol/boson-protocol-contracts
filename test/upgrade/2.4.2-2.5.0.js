const hre = require("hardhat");
const ethers = hre.ethers;
const { keccak256, toUtf8Bytes, ZeroAddress } = ethers;
const { expect } = require("chai");
const exchangeHandlerAbi_v2_4_2 = require("@bosonprotocol/common/src/abis/IBosonExchangeHandler.json");

const DockerUtils = require("./utils/docker-utils");
const { readContracts } = require("../../scripts/util/utils");
const { populateProtocolContract, setVersionTags } = require("../util/upgrade");
const { tagsByVersion } = require("./00_config");
const { ACCOUNTS } = require("./utils/accounts");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const ExchangeState = require("../../scripts/domain/ExchangeState");
const { getEvent, getCurrentBlockAndSetTimeForward, applyPercentage } = require("../util/utils");
const OfferCreator = require("../../scripts/domain/OfferCreator");
const { RoyaltyInfo } = require("../../scripts/domain/RoyaltyInfo");
const { mockOffer, mockCondition, mockVoucherInitValues, mockAuthToken, mockSeller } = require("../util/mock");
const { getStateModifyingFunctionsHashes } = require("../../scripts/util/diamond-utils");
const upgradeConfig = require("../../scripts/config/upgrade/2.5.0.js");
const EvaluationMethod = require("../../scripts/domain/EvaluationMethod");
const { prepareDataSignature } = require("../util/utils");

const newVersion = "2.5.0";

/**
 * Upgrade test case - After upgrade from 2.4.2 to 2.5.0 everything is still operational
 */
describe("[@skip-on-coverage] After facet upgrade, everything is still operational (Docker)", function () {
  this.timeout(1000000);

  let dockerUtils;
  let protocolAddress;
  let deployer;
  let buyer1;
  let buyer2;
  let protocolContracts;
  let mockContracts;
  let preUpgradeEntities;

  before(async function () {
    dockerUtils = new DockerUtils();
    await dockerUtils.startContainer();

    deployer = new ethers.Wallet(ACCOUNTS[0].privateKey, ethers.provider);
    buyer1 = new ethers.Wallet(ACCOUNTS[1].privateKey, ethers.provider);
    buyer2 = new ethers.Wallet(ACCOUNTS[2].privateKey, ethers.provider);

    // Override hardhat's getSigners to use Docker accounts
    hre.ethers.getSigners = async () => {
      return [deployer, buyer1, buyer2];
    };

    const chainId = Number((await ethers.provider.getNetwork()).chainId);
    const contractsFile = readContracts(chainId, "localhost", "localhost");

    const protocolDiamondAddress = contractsFile.contracts.find((c) => c.name === "ProtocolDiamond")?.address;
    if (!protocolDiamondAddress) {
      throw new Error("ProtocolDiamond address not found");
    }

    protocolContracts = {
      accountHandler: await ethers.getContractAt("IBosonAccountHandler", protocolDiamondAddress),
      exchangeHandler: new ethers.Contract(protocolDiamondAddress, exchangeHandlerAbi_v2_4_2, deployer),
      offerHandler: await ethers.getContractAt("IBosonOfferHandler", protocolDiamondAddress),
      fundsHandler: await ethers.getContractAt("IBosonFundsHandler", protocolDiamondAddress),
      disputeHandler: await ethers.getContractAt("IBosonDisputeHandler", protocolDiamondAddress),
      bundleHandler: await ethers.getContractAt("IBosonBundleHandler", protocolDiamondAddress),
      groupHandler: await ethers.getContractAt("IBosonGroupHandler", protocolDiamondAddress),
      twinHandler: await ethers.getContractAt("IBosonTwinHandler", protocolDiamondAddress),
      metaTransactionsHandler: await ethers.getContractAt("IBosonMetaTransactionsHandler", protocolDiamondAddress),
      configHandler: await ethers.getContractAt("IBosonConfigHandler", protocolDiamondAddress),
    };

    // Deploy additional Foreign721 for twin as only 1 has been deployed in the Docker container
    const [additionalForeign721] = await deployMockTokens(["Foreign721"]);
    const additionalForeign721Address = await additionalForeign721.getAddress();

    // Connect to existing deployed mock tokens from Docker container
    mockContracts = {
      mockToken: await ethers.getContractAt("Foreign20", "0x70e0bA845a1A0F2DA3359C97E0285013525FFC49"),
      mockConditionalToken: await ethers.getContractAt("Foreign20", "0x70e0bA845a1A0F2DA3359C97E0285013525FFC49"),
      mockAuthERC721Contract: await ethers.getContractAt(
        "MockNFTAuth721",
        "0x5FbDB2315678afecb367f032d93F642f64180aa3"
      ),
      mockTwinTokens: [
        await ethers.getContractAt("Foreign721", "0x4826533B4897376654Bb4d4AD88B7faFD0C98528"),
        await ethers.getContractAt("Foreign721", additionalForeign721Address),
      ],
      mockTwin20: await ethers.getContractAt("Foreign20", "0x70e0bA845a1A0F2DA3359C97E0285013525FFC49"),
      mockTwin1155: await ethers.getContractAt("Foreign1155", "0x99bbA657f2BbC93c02D617f8bA121cB8Fc104Acf"),
    };

    // Since we are not using deploySuite, we need to set the version tags manually
    setVersionTags(tagsByVersion[newVersion]);

    preUpgradeEntities = await populateProtocolContract(
      deployer,
      protocolDiamondAddress,
      protocolContracts,
      mockContracts,
      true // isBefore = true to use v2.4.2 compatible function signatures
    );

    await hre.run("migrate", {
      newVersion: newVersion,
      env: "localhost",
    });

    const updatedContractsFile = readContracts(chainId, "localhost", "localhost");
    const protocolContract = updatedContractsFile.contracts.find((c) => c.name === "ProtocolDiamond");
    protocolAddress = protocolContract.address;
  });

  after(async function () {
    if (dockerUtils) {
      await dockerUtils.fullCleanup();
    }
  });

  describe("Post Upgrade Tests", function () {
    let exchangeHandler;
    let exchangeCommitHandler;

    before(async function () {
      exchangeHandler = await ethers.getContractAt("IBosonExchangeHandler", protocolAddress);
      exchangeCommitHandler = await ethers.getContractAt("IBosonExchangeCommitHandler", protocolAddress);
    });

    it(`New Protocol Version should be ${newVersion}`, async function () {
      const protocolInitFacet = await ethers.getContractAt("ProtocolInitializationHandlerFacet", protocolAddress);
      const currentVersion = await protocolInitFacet.getVersion();
      // Remove null bytes from version string as contract returns a string with padded null bytes (string(abi.encodePacked(status.version)))
      const versionString = currentVersion.replace(/\0/g, "");
      expect(versionString).to.equal(newVersion);
    });

    describe("Old Offers Compatibility", function () {
      it("Can finalise offers created in v2.4.2", async function () {
        const exchange = preUpgradeEntities.exchanges[0];
        const buyer = preUpgradeEntities.buyers[exchange.buyerIndex];

        const [, exchangeStruct] = await exchangeHandler.getExchange(exchange.exchangeId);
        expect(exchangeStruct.state).to.equal(ExchangeState.Committed);

        await exchangeHandler.connect(buyer.wallet).redeemVoucher(exchange.exchangeId);

        const [, redeemedExchange] = await exchangeHandler.getExchange(exchange.exchangeId);
        expect(redeemedExchange.state).to.equal(ExchangeState.Redeemed);

        const offer = preUpgradeEntities.offers.find((o) => o.offer.id == exchange.offerId);
        await getCurrentBlockAndSetTimeForward(Number(offer.offerDurations.disputePeriod) + 1);

        await exchangeHandler.connect(buyer.wallet).completeExchange(exchange.exchangeId);
        const [, completedExchange] = await exchangeHandler.getExchange(exchange.exchangeId);
        expect(completedExchange.state).to.equal(ExchangeState.Completed);
      });
    });

    describe("New Features Validation", function () {
      it("Buyer-initiated offer", async function () {
        const { ZeroAddress } = ethers;
        const { offer, offerDates, offerDurations } = await mockOffer();

        const nextBuyerId = await protocolContracts.accountHandler.getNextAccountId();

        const buyerCreatedOffer = offer.clone();
        buyerCreatedOffer.sellerId = "0";
        buyerCreatedOffer.creator = OfferCreator.Buyer;
        buyerCreatedOffer.buyerId = nextBuyerId.toString();
        buyerCreatedOffer.collectionIndex = "0";
        buyerCreatedOffer.royaltyInfo = [new RoyaltyInfo([], [])];

        const createOfferTx = await protocolContracts.offerHandler
          .connect(buyer1)
          .createOffer(
            buyerCreatedOffer,
            offerDates,
            offerDurations,
            { disputeResolverId: "1", mutualizerAddress: ZeroAddress },
            "0",
            ethers.MaxUint256
          );

        const receipt = await createOfferTx.wait();
        const offerCreatedEvent = getEvent(receipt, protocolContracts.offerHandler, "OfferCreated");
        const buyerCreatedEvent = getEvent(receipt, protocolContracts.accountHandler, "BuyerCreated");
        const offerId = offerCreatedEvent.offerId.toString();
        const buyerId = buyerCreatedEvent.buyerId.toString();

        const offerPrice = buyerCreatedOffer.price;
        await protocolContracts.fundsHandler
          .connect(buyer1)
          .depositFunds(buyerId, ZeroAddress, offerPrice, { value: offerPrice });

        const seller = preUpgradeEntities.sellers[0];
        const sellerDepositRequired = buyerCreatedOffer.sellerDeposit;

        const sellerParams = {
          collectionIndex: 0,
          royaltyInfo: {
            recipients: [ZeroAddress],
            bps: [seller.voucherInitValues.royaltyPercentage],
          },
          mutualizerAddress: ZeroAddress,
        };

        const commitTx = await exchangeCommitHandler
          .connect(seller.wallet)
          .commitToBuyerOffer(offerId, sellerParams, { value: sellerDepositRequired });

        const commitReceipt = await commitTx.wait();
        const sellerCommittedEvent = getEvent(commitReceipt, exchangeHandler, "SellerCommitted");
        const exchangeId = sellerCommittedEvent.exchangeId.toString();

        const [, exchangeStruct] = await exchangeHandler.getExchange(exchangeId);
        expect(exchangeStruct.state).to.equal(ExchangeState.Committed);

        const voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
        const currentBlock = await ethers.provider.getBlock("latest");
        const secondsToAdd = Math.max(0, Number(voucherRedeemableFrom) - currentBlock.timestamp);
        if (secondsToAdd > 0) {
          await getCurrentBlockAndSetTimeForward(secondsToAdd);
        }

        await exchangeHandler.connect(buyer1).redeemVoucher(exchangeId);

        const [, redeemedExchange] = await exchangeHandler.getExchange(exchangeId);
        expect(redeemedExchange.state).to.equal(ExchangeState.Redeemed);

        const disputePeriod = offerDurations.disputePeriod;
        await getCurrentBlockAndSetTimeForward(Number(disputePeriod) + 1);

        const completeExchangeTx = await exchangeHandler.connect(buyer1).completeExchange(exchangeId);
        const [, completedExchange] = await exchangeHandler.getExchange(exchangeId);
        expect(completedExchange.state).to.equal(ExchangeState.Completed);

        const protocolFeePercent = await protocolContracts.configHandler.getProtocolFeePercentage();
        const protocolFee = applyPercentage(buyerCreatedOffer.price, protocolFeePercent);

        const sellerPayoff =
          BigInt(buyerCreatedOffer.sellerDeposit) + BigInt(buyerCreatedOffer.price) - BigInt(protocolFee);
        await expect(completeExchangeTx)
          .to.emit(exchangeHandler, "FundsReleased")
          .withArgs(exchangeId, seller.id, ZeroAddress, sellerPayoff, buyer1.address);
      });

      it("createOfferAndCommit functionality", async function () {
        const message = {};
        const voucherInitValues = mockVoucherInitValues();
        const emptyAuthToken = mockAuthToken();

        const newSeller = mockSeller(deployer.address, deployer.address, ZeroAddress, deployer.address);

        const createSellerTx = await protocolContracts.accountHandler
          .connect(deployer)
          .createSeller(newSeller, emptyAuthToken, voucherInitValues);

        let receipt = await createSellerTx.wait();
        const sellerCreatedEvent = getEvent(receipt, protocolContracts.accountHandler, "SellerCreated");
        const actualSellerId = sellerCreatedEvent.sellerId.toString();

        const { offer, offerDates, offerDurations } = await mockOffer();

        offer.id = "0"; // Must be 0 for createOfferAndCommit
        offer.sellerId = actualSellerId;
        offer.royaltyInfo = [new RoyaltyInfo([ZeroAddress], ["30"])];
        offer.sellerDeposit = "0";

        const drParams = {
          disputeResolverId: "1",
          mutualizerAddress: ZeroAddress,
        };

        const condition = mockCondition({
          method: EvaluationMethod.None,
          tokenAddress: ZeroAddress,
          threshold: "0",
          maxCommits: "0",
        });

        const agentId = "0";
        const offerFeeLimit = ethers.MaxUint256;

        const sellerParams = {
          collectionIndex: 0,
          royaltyInfo: {
            recipients: [],
            bps: [],
          },
          mutualizerAddress: ZeroAddress,
        };

        const eip712TypeDefinition = {
          FullOffer: [
            { name: "offer", type: "Offer" },
            { name: "offerDates", type: "OfferDates" },
            { name: "offerDurations", type: "OfferDurations" },
            { name: "drParameters", type: "DRParameters" },
            { name: "condition", type: "Condition" },
            { name: "agentId", type: "uint256" },
            { name: "feeLimit", type: "uint256" },
            { name: "useDepositedFunds", type: "bool" },
          ],
          Condition: [
            { name: "method", type: "uint8" },
            { name: "tokenType", type: "uint8" },
            { name: "tokenAddress", type: "address" },
            { name: "gating", type: "uint8" },
            { name: "minTokenId", type: "uint256" },
            { name: "threshold", type: "uint256" },
            { name: "maxCommits", type: "uint256" },
            { name: "maxTokenId", type: "uint256" },
          ],
          DRParameters: [
            { name: "disputeResolverId", type: "uint256" },
            { name: "mutualizerAddress", type: "address" },
          ],
          OfferDurations: [
            { name: "disputePeriod", type: "uint256" },
            { name: "voucherValid", type: "uint256" },
            { name: "resolutionPeriod", type: "uint256" },
          ],
          OfferDates: [
            { name: "validFrom", type: "uint256" },
            { name: "validUntil", type: "uint256" },
            { name: "voucherRedeemableFrom", type: "uint256" },
            { name: "voucherRedeemableUntil", type: "uint256" },
          ],
          Offer: [
            { name: "sellerId", type: "uint256" },
            { name: "price", type: "uint256" },
            { name: "sellerDeposit", type: "uint256" },
            { name: "buyerCancelPenalty", type: "uint256" },
            { name: "quantityAvailable", type: "uint256" },
            { name: "exchangeToken", type: "address" },
            { name: "metadataUri", type: "string" },
            { name: "metadataHash", type: "string" },
            { name: "collectionIndex", type: "uint256" },
            { name: "royaltyInfo", type: "RoyaltyInfo" },
            { name: "creator", type: "uint8" },
            { name: "buyerId", type: "uint256" },
          ],
          RoyaltyInfo: [
            { name: "recipients", type: "address[]" },
            { name: "bps", type: "uint256[]" },
          ],
        };

        const modifiedOffer = offer.clone();
        modifiedOffer.royaltyInfo = modifiedOffer.royaltyInfo[0];

        message.offer = modifiedOffer;
        message.offerDates = offerDates;
        message.offerDurations = offerDurations;
        message.drParameters = drParams;
        message.condition = condition;
        message.agentId = agentId.toString();
        message.feeLimit = offerFeeLimit.toString();
        message.useDepositedFunds = false;

        const signature = await prepareDataSignature(
          deployer,
          eip712TypeDefinition,
          "FullOffer",
          message,
          await exchangeCommitHandler.getAddress()
        );

        const tx = await exchangeCommitHandler.connect(buyer1).createOfferAndCommit(
          [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, false],
          deployer.address,
          buyer1.address,
          signature,
          "0", // conditional token ID
          sellerParams,
          { value: offer.price }
        );

        receipt = await tx.wait();

        const offerCreatedEvent = getEvent(receipt, protocolContracts.offerHandler, "OfferCreated");
        expect(offerCreatedEvent.offerId).to.not.be.null;

        const buyerCommittedEvent = getEvent(receipt, exchangeHandler, "BuyerCommitted");
        expect(buyerCommittedEvent.exchangeId).to.not.be.null;

        const exchangeId = buyerCommittedEvent.exchangeId.toString();

        const [, exchangeStruct] = await exchangeHandler.getExchange(exchangeId);
        expect(exchangeStruct.state).to.equal(ExchangeState.Committed);

        const voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
        const currentBlock = await ethers.provider.getBlock("latest");
        const secondsToAdd = Math.max(0, Number(voucherRedeemableFrom) - currentBlock.timestamp);
        if (secondsToAdd > 0) {
          await getCurrentBlockAndSetTimeForward(secondsToAdd);
        }

        await exchangeHandler.connect(buyer1).redeemVoucher(exchangeId);

        const [, redeemedExchange] = await exchangeHandler.getExchange(exchangeId);
        expect(redeemedExchange.state).to.equal(ExchangeState.Redeemed);

        const disputePeriod = offerDurations.disputePeriod;
        await getCurrentBlockAndSetTimeForward(Number(disputePeriod) + 1);

        const completeExchangeTx = await exchangeHandler.connect(buyer1).completeExchange(exchangeId);
        const [, completedExchange] = await exchangeHandler.getExchange(exchangeId);
        expect(completedExchange.state).to.equal(ExchangeState.Completed);

        const protocolFeePercent = await protocolContracts.configHandler.getProtocolFeePercentage();
        const protocolFee = applyPercentage(offer.price, protocolFeePercent);

        const sellerPayoff = BigInt(offer.sellerDeposit) + BigInt(offer.price) - BigInt(protocolFee);
        await expect(completeExchangeTx)
          .to.emit(exchangeHandler, "FundsReleased")
          .withArgs(exchangeId, actualSellerId, ZeroAddress, sellerPayoff, buyer1.address);
      });
    });

    describe("Metatx Allowlist", function () {
      it("Should verify old functions are not allowlisted anymore", async function () {
        const removedFunctionSignatures_v2_4_2 = [
          "createOffer((uint256,uint256,uint256,uint256,uint256,uint256,address,uint8,string,string,bool,(address[],uint256[])),(uint256,uint256,uint256,uint256),(uint256,uint256,uint256),uint256,uint256)",
          "createOfferBatch((uint256,uint256,uint256,uint256,uint256,uint256,address,uint8,string,string,bool,(address[],uint256[]))[],tuple(uint256,uint256,uint256,uint256)[],(uint256,uint256,uint256)[],uint256[],uint256[])",
        ];

        const removedFunctionHashes = removedFunctionSignatures_v2_4_2.map((sig) => keccak256(toUtf8Bytes(sig)));

        for (const functionHash of removedFunctionHashes) {
          expect(await protocolContracts.metaTransactionsHandler["isFunctionAllowlisted(bytes32)"](functionHash)).to.be
            .false;
        }
      });

      it("Should verify new functions are allowlisted", async function () {
        const { addOrUpgrade } = await upgradeConfig.getFacets();

        const getFunctionHashesClosure = getStateModifyingFunctionsHashes(addOrUpgrade, ["executeMetaTransaction"], []);
        const addedFunctionHashes = await getFunctionHashesClosure();

        for (const functionHash of addedFunctionHashes) {
          expect(await protocolContracts.metaTransactionsHandler["isFunctionAllowlisted(bytes32)"](functionHash)).to.be
            .true;
        }
      });
    });
  });
});
