const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");
const exchangeHandlerAbi_v2_4_2 = require("@bosonprotocol/common/src/abis/IBosonExchangeHandler.json");

const DockerUtils = require("./utils/docker-utils");
const { readContracts } = require("../../scripts/util/utils");
const { populateProtocolContract, setVersionTags } = require("../util/upgrade");
const { tagsByVersion } = require("./00_config");
const { ACCOUNTS } = require("./utils/accounts");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const ExchangeState = require("../../scripts/domain/ExchangeState");
const { setNextBlockTimestamp, getEvent } = require("../util/utils");
const OfferCreator = require("../../scripts/domain/OfferCreator");
const { RoyaltyInfo } = require("../../scripts/domain/RoyaltyInfo");
const { mockOffer } = require("../util/mock");

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
    // Deploy docker container
    dockerUtils = new DockerUtils();
    await dockerUtils.startContainer();

    // Setup accounts from Docker
    deployer = new ethers.Wallet(ACCOUNTS[0].privateKey, ethers.provider);
    buyer1 = new ethers.Wallet(ACCOUNTS[1].privateKey, ethers.provider);
    buyer2 = new ethers.Wallet(ACCOUNTS[2].privateKey, ethers.provider);

    // Override hardhat's getSigners to use Docker accounts
    hre.ethers.getSigners = async () => {
      return [deployer, buyer1, buyer2];
    };

    // Read protocol addresses from Docker container
    const chainId = Number((await ethers.provider.getNetwork()).chainId);
    const contractsFile = readContracts(chainId, "localhost", "localhost");

    const protocolDiamondAddress = contractsFile.contracts.find((c) => c.name === "ProtocolDiamond")?.address;
    if (!protocolDiamondAddress) {
      throw new Error("ProtocolDiamond address not found");
    }

    // Create protocol contract interfaces
    protocolContracts = {
      accountHandler: await ethers.getContractAt("IBosonAccountHandler", protocolDiamondAddress),
      exchangeHandler: new ethers.Contract(protocolDiamondAddress, exchangeHandlerAbi_v2_4_2, deployer),
      offerHandler: await ethers.getContractAt("IBosonOfferHandler", protocolDiamondAddress),
      fundsHandler: await ethers.getContractAt("IBosonFundsHandler", protocolDiamondAddress),
      disputeHandler: await ethers.getContractAt("IBosonDisputeHandler", protocolDiamondAddress),
      bundleHandler: await ethers.getContractAt("IBosonBundleHandler", protocolDiamondAddress),
      groupHandler: await ethers.getContractAt("IBosonGroupHandler", protocolDiamondAddress),
      twinHandler: await ethers.getContractAt("IBosonTwinHandler", protocolDiamondAddress),
    };

    // Fund the accounts for deploying mock tokens and making transactions
    await ethers.provider.send("hardhat_setBalance", [
      deployer.address,
      "0x1000000000000000000", // 1 ETH
    ]);
    await ethers.provider.send("hardhat_setBalance", [
      buyer1.address,
      "0x1000000000000000000", // 1 ETH
    ]);
    await ethers.provider.send("hardhat_setBalance", [
      buyer2.address,
      "0x1000000000000000000", // 1 ETH
    ]);

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

    // Populate entities
    preUpgradeEntities = await populateProtocolContract(
      deployer,
      protocolDiamondAddress,
      protocolContracts,
      mockContracts,
      true // isBefore = true to use v2.4.2 compatible function signatures
    );

    // Execute migration to v2.5.0
    await hre.run("migrate", {
      newVersion: newVersion,
      env: "localhost",
    });

    // Update protocol address after migration
    const updatedContractsFile = readContracts(chainId, "localhost", "localhost");
    const protocolContract = updatedContractsFile.contracts.find((c) => c.name === "ProtocolDiamond");
    if (!protocolContract) {
      throw new Error("ProtocolDiamond not found in contracts file after migration");
    }
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
      // Get the new v2.5.0 exchange interfaces (reuse other contracts from protocolContracts)
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

        // Fast-forward time past the dispute period
        const offer = preUpgradeEntities.offers.find((o) => o.offer.id == exchange.offerId);
        const disputePeriod = offer.offerDurations.disputePeriod;
        const currentTime = Math.floor(Date.now() / 1000);
        await setNextBlockTimestamp(currentTime + Number(disputePeriod) + 1, true);

        // Complete the exchange
        await exchangeHandler.connect(buyer.wallet).completeExchange(exchange.exchangeId);
        const [, completedExchange] = await exchangeHandler.getExchange(exchange.exchangeId);
        expect(completedExchange.state).to.equal(ExchangeState.Completed);
      });
    });

    describe("New Features Validation", function () {
      it("Buyer-initiated offer", async function () {
        const { ZeroAddress } = ethers;
        const { offer, offerDates, offerDurations } = await mockOffer();

        // Create buyer-initiated offer
        const buyerCreatedOffer = offer.clone();
        buyerCreatedOffer.sellerId = "0";
        buyerCreatedOffer.creator = OfferCreator.Buyer;
        buyerCreatedOffer.buyerId = "1";
        buyerCreatedOffer.collectionIndex = "0";
        buyerCreatedOffer.royaltyInfo = [new RoyaltyInfo([], [])];

        // Create offer and get offer ID from event
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
        const offerId = offerCreatedEvent.offerId.toString();

        console.log("🔍 OfferCreated event details:", {
          offerId: offerCreatedEvent.offerId.toString(),
          sellerId: offerCreatedEvent.sellerId.toString(),
          offer: offerCreatedEvent.offer,
          offerDates: offerCreatedEvent.offerDates,
          offerDurations: offerCreatedEvent.offerDurations,
          disputeResolutionTerms: offerCreatedEvent.disputeResolutionTerms,
          offerFees: offerCreatedEvent.offerFees,
          agentId: offerCreatedEvent.agentId.toString(),
          executedBy: offerCreatedEvent.executedBy,
        });
        console.log("Found OfferCreated event with offer ID:", offerId);

        console.log("✅ Buyer-initiated offer created successfully, offer ID:", offerId);

        // Seller commits to buyer offer
        const seller = preUpgradeEntities.sellers[0];
        const sellerDepositRequired = buyerCreatedOffer.sellerDeposit;
        console.log(`Seller deposit required: ${sellerDepositRequired}`);

        await protocolContracts.fundsHandler
          .connect(seller.wallet)
          .depositFunds(seller.seller.id, ZeroAddress, sellerDepositRequired, { value: sellerDepositRequired });

        console.log("✅ Seller deposited funds successfully");

        console.log("🔍 Debugging seller data:");
        console.log("seller.voucherInitValues:", seller.voucherInitValues);
        console.log("seller.voucherInitValues.royaltyPercentage:", seller.voucherInitValues.royaltyPercentage);

        const sellerParams = {
          collectionIndex: 0,
          royaltyInfo: {
            recipients: [ZeroAddress],
            bps: [seller.voucherInitValues.royaltyPercentage],
          },
          mutualizerAddress: ZeroAddress,
        };

        console.log("🔍 Final sellerParams:", JSON.stringify(sellerParams, null, 2));

        // This fails with error 0xe5bd9639 (unrecognized custom error)
        await exchangeCommitHandler.connect(seller.wallet).commitToBuyerOffer(offerId, sellerParams);

        console.log("✅ Seller successfully committed to buyer-initiated offer");
      });

      it("createOfferAndCommit functionality", async function () {
        // Test the new single transaction offer creation and commit
        // This would test:
        // - Creating offer and committing in one transaction
      });
    });

    describe("Metatx Allowlist", function () {
      it("Should verify old functions are not allowlisted anymore", async function () {
        // Check that legacy meta-transaction functions are not allowlisted anymore
      });

      it("Should verify new functions are allowlisted", async function () {
        // Check that new v2.5.0 meta-transaction functions are properly allowlisted
      });
    });
  });
});
