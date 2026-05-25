const hre = require("hardhat");
const ethers = hre.ethers;
const { ZeroAddress, AbiCoder, Signature, MaxUint256, zeroPadValue, randomBytes, getContractFactory } = ethers;
const { expect } = require("chai");

const { abis } = require("@bosonprotocol/common");
const DockerUtils = require("./utils/docker-utils");
const { readContracts } = require("../../scripts/util/utils");
const { populateProtocolContract, setVersionTags } = require("../util/upgrade");
const { tagsByVersion } = require("./00_config");
const { ACCOUNTS } = require("./utils/accounts");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const ExchangeState = require("../../scripts/domain/ExchangeState");
const EvaluationMethod = require("../../scripts/domain/EvaluationMethod");
const TokenType = require("../../scripts/domain/TokenType");
const GatingType = require("../../scripts/domain/GatingType");
const Group = require("../../scripts/domain/Group");
const Condition = require("../../scripts/domain/Condition");
const { getEvent, getCurrentBlockAndSetTimeForward, prepareDataSignature } = require("../util/utils");
const { mockOffer, mockVoucherInitValues, mockAuthToken, mockSeller, mockCondition } = require("../util/mock");
const { getStateModifyingFunctionsHashes } = require("../../scripts/util/diamond-utils");
const upgradeConfig = require("../../scripts/config/upgrade/2.5.1-rc.1.js");

const newVersion = "2.5.1"; // passed to migrate task; maps to migrate_2.5.1.js
const expectedOnChainVersion = "2.5.1-rc.1"; // the string the migration stores on-chain

// ERC3009 helpers — mirrors MetaTransactionsERC3009Test.js
const TokenTransferAuthorizationStrategy = { None: 0, ERC3009: 1 };

const RECEIVE_WITH_AUTHORIZATION_TYPES = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

const META_TRANSACTION_TYPES = {
  MetaTransaction: [
    { name: "nonce", type: "uint256" },
    { name: "from", type: "address" },
    { name: "contractAddress", type: "address" },
    { name: "functionName", type: "string" },
    { name: "functionSignature", type: "bytes" },
  ],
};

async function signReceiveWithAuthorization(signer, token, params) {
  const { chainId } = await ethers.provider.getNetwork();
  const domain = {
    name: await token.name(),
    version: "1",
    chainId,
    verifyingContract: await token.getAddress(),
  };
  const sig = await signer.signTypedData(domain, RECEIVE_WITH_AUTHORIZATION_TYPES, params);
  const split = Signature.from(sig);
  return { v: split.v, r: split.r, s: split.s };
}

function encodeAuthEntry({ validAfter, validBefore, nonce, v, r, s }) {
  const erc3009Data = AbiCoder.defaultAbiCoder().encode(
    ["uint256", "uint256", "bytes32", "uint8", "bytes32", "bytes32"],
    [validAfter, validBefore, nonce, v, r, s]
  );
  return AbiCoder.defaultAbiCoder().encode(
    ["uint8", "bytes"],
    [TokenTransferAuthorizationStrategy.ERC3009, erc3009Data]
  );
}

/**
 * Upgrade test — After upgrade from 2.5.0 to 2.5.1 everything is still operational (Docker)
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

    hre.ethers.getSigners = async () => {
      return [deployer, buyer1, buyer2];
    };

    const chainId = Number((await ethers.provider.getNetwork()).chainId);
    const contractsFile = readContracts(chainId, "localhost", "localhost");

    const protocolDiamondAddress = contractsFile.contracts.find((c) => c.name === "ProtocolDiamond")?.address;
    if (!protocolDiamondAddress) {
      throw new Error("ProtocolDiamond address not found");
    }

    // Combine exchange + commit ABIs — upgrade.js calls commitToOffer/commitToConditionalOffer
    // on exchangeHandler which moved from ExchangeHandler to ExchangeCommitFacet in 2.5.0
    const combinedExchangeAbi = [...abis.IBosonExchangeHandlerABI, ...abis.IBosonExchangeCommitHandlerABI];

    protocolContracts = {
      accountHandler: await ethers.getContractAt("IBosonAccountHandler", protocolDiamondAddress),
      exchangeHandler: new ethers.Contract(protocolDiamondAddress, combinedExchangeAbi, deployer),
      offerHandler: await ethers.getContractAt("IBosonOfferHandler", protocolDiamondAddress),
      fundsHandler: await ethers.getContractAt("IBosonFundsHandler", protocolDiamondAddress),
      disputeHandler: await ethers.getContractAt("IBosonDisputeHandler", protocolDiamondAddress),
      bundleHandler: await ethers.getContractAt("IBosonBundleHandler", protocolDiamondAddress),
      groupHandler: await ethers.getContractAt("IBosonGroupHandler", protocolDiamondAddress),
      twinHandler: await ethers.getContractAt("IBosonTwinHandler", protocolDiamondAddress),
      metaTransactionsHandler: await ethers.getContractAt("IBosonMetaTransactionsHandler", protocolDiamondAddress),
      configHandler: await ethers.getContractAt("IBosonConfigHandler", protocolDiamondAddress),
    };

    // Deploy additional Foreign721 for twin testing (populateProtocolContract needs two)
    const [additionalForeign721] = await deployMockTokens(["Foreign721"]);

    mockContracts = {
      // In 2.5.0 Docker the token addresses shifted vs 2.4.2 Docker:
      // Foreign20 → 0x70e0..., Foreign721 → 0x4826..., Foreign1155 → 0x99bb...
      mockToken: await ethers.getContractAt("Foreign20", "0x70e0bA845a1A0F2DA3359C97E0285013525FFC49"),
      mockConditionalToken: await ethers.getContractAt("Foreign20", "0x70e0bA845a1A0F2DA3359C97E0285013525FFC49"),
      mockAuthERC721Contract: await ethers.getContractAt(
        "MockNFTAuth721",
        "0x5FbDB2315678afecb367f032d93F642f64180aa3"
      ),
      mockTwinTokens: [
        await ethers.getContractAt("Foreign721", "0x4826533B4897376654Bb4d4AD88B7faFD0C98528"),
        additionalForeign721,
      ],
      mockTwin20: await ethers.getContractAt("Foreign20", "0x70e0bA845a1A0F2DA3359C97E0285013525FFC49"),
      mockTwin1155: await ethers.getContractAt("Foreign1155", "0x99bbA657f2BbC93c02D617f8bA121cB8Fc104Acf"),
    };

    setVersionTags(tagsByVersion[newVersion]);

    preUpgradeEntities = await populateProtocolContract(
      deployer,
      protocolDiamondAddress,
      protocolContracts,
      mockContracts,
      false // isBefore = false: Docker container already runs 2.5.0 contracts
    );

    await hre.run("migrate", {
      newVersion: newVersion,
      env: "localhost",
    });

    const updatedContractsFile = readContracts(chainId, "localhost", "localhost");
    protocolAddress = updatedContractsFile.contracts.find((c) => c.name === "ProtocolDiamond").address;
  });

  after(async function () {
    if (dockerUtils) {
      await dockerUtils.fullCleanup();
    }
  });

  describe("Post Upgrade Tests", function () {
    let exchangeHandler;
    let orchestrationHandler;
    let groupHandler;
    let offerHandler;

    before(async function () {
      exchangeHandler = await ethers.getContractAt("IBosonExchangeHandler", protocolAddress);
      orchestrationHandler = await ethers.getContractAt("IBosonOrchestrationHandler", protocolAddress);
      groupHandler = await ethers.getContractAt("IBosonGroupHandler", protocolAddress);
      offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolAddress);
      protocolContracts.metaTransactionsHandler = await ethers.getContractAt(
        "IBosonMetaTransactionsHandler",
        protocolAddress
      );
      protocolContracts.accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolAddress);
    });

    it(`New Protocol Version should be ${expectedOnChainVersion}`, async function () {
      const protocolInitFacet = await ethers.getContractAt("ProtocolInitializationHandlerFacet", protocolAddress);
      const currentVersion = await protocolInitFacet.getVersion();
      const versionString = currentVersion.replace(/\0/g, "");
      expect(versionString).to.equal(expectedOnChainVersion);
    });

    describe("Old Offers Compatibility", function () {
      it("Can finalise offers created in v2.5.0", async function () {
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
      let sharedSellerId;

      before(async function () {
        // Create one seller (buyer2 as assistant) shared across all new-feature tests
        const newSeller = mockSeller(buyer2.address, buyer2.address, ZeroAddress, buyer2.address);
        const emptyAuthToken = mockAuthToken();
        const voucherInitValues = mockVoucherInitValues();

        const sellerTx = await protocolContracts.accountHandler
          .connect(buyer2)
          .createSeller(newSeller, emptyAuthToken, voucherInitValues);
        const sellerReceipt = await sellerTx.wait();
        const sellerCreatedEvent = getEvent(sellerReceipt, protocolContracts.accountHandler, "SellerCreated");
        sharedSellerId = sellerCreatedEvent.sellerId.toString();
      });

      it("executeMetaTransactionWithTokenTransferAuthorization (ERC3009)", async function () {
        // Deploy a mock ERC3009 token
        const MockERC3009 = await getContractFactory("MockERC3009Token", deployer);
        const erc3009Token = await MockERC3009.deploy("Test USDC", "tUSDC");
        await erc3009Token.waitForDeployment();

        const tokenAddress = await erc3009Token.getAddress();
        const amount = "1000";

        // Mint tokens to deployer (metatx user) — NO approve() needed
        await erc3009Token.connect(deployer).mint(deployer.address, amount);

        // Pick any seller from pre-upgrade entities to deposit into
        const seller = preUpgradeEntities.sellers[0];
        const sellerId = seller.id;

        // Build the depositFunds meta-transaction
        const fundsHandlerInterface = (await ethers.getContractAt("IBosonFundsHandler", protocolAddress)).interface;
        const fnSig = fundsHandlerInterface.encodeFunctionData("depositFunds", [sellerId, tokenAddress, amount]);
        const nonce = parseInt(randomBytes(8));

        const metaTxMessage = {
          nonce,
          from: deployer.address,
          contractAddress: protocolAddress,
          functionName: "depositFunds(uint256,address,uint256)",
          functionSignature: fnSig,
        };
        const metaTxSignature = await prepareDataSignature(
          deployer,
          META_TRANSACTION_TYPES,
          "MetaTransaction",
          metaTxMessage,
          protocolAddress
        );

        // Build the ERC3009 receiveWithAuthorization entry
        const validAfter = 0;
        const validBefore = MaxUint256;
        const authNonce = zeroPadValue("0x" + Buffer.from(randomBytes(32)).toString("hex"), 32);
        const { v, r, s } = await signReceiveWithAuthorization(deployer, erc3009Token, {
          from: deployer.address,
          to: protocolAddress,
          value: amount,
          validAfter,
          validBefore,
          nonce: authNonce,
        });
        const authEntry = encodeAuthEntry({ validAfter, validBefore, nonce: authNonce, v, r, s });
        const queue = [authEntry];

        await expect(
          protocolContracts.metaTransactionsHandler
            .connect(buyer1)
            .executeMetaTransactionWithTokenTransferAuthorization(
              deployer.address,
              metaTxMessage.functionName,
              fnSig,
              nonce,
              metaTxSignature,
              queue
            )
        )
          .to.emit(protocolContracts.metaTransactionsHandler, "MetaTransactionExecuted")
          .withArgs(deployer.address, buyer1.address, metaTxMessage.functionName, nonce);
      });

      it("commitToOfferAndRedeemVoucher", async function () {
        const { offer, offerDates, offerDurations } = await mockOffer();
        offer.price = "0";
        offer.sellerDeposit = "0";
        offer.buyerCancelPenalty = "0";
        offerDates.voucherRedeemableFrom = "0";

        const createTx = await offerHandler
          .connect(buyer2)
          .createOffer(
            offer,
            offerDates,
            offerDurations,
            { disputeResolverId: "0", mutualizerAddress: ZeroAddress },
            "0",
            MaxUint256
          );
        const createReceipt = await createTx.wait();
        const offerCreatedEvent = getEvent(createReceipt, offerHandler, "OfferCreated");
        const offerId = offerCreatedEvent.offerId.toString();

        const tx = await orchestrationHandler.connect(buyer1).commitToOfferAndRedeemVoucher(offerId);

        await expect(tx).to.emit(exchangeHandler, "VoucherRedeemed");

        const buyerCommittedEvent = getEvent(await tx.wait(), exchangeHandler, "BuyerCommitted");
        const exchangeId = buyerCommittedEvent.exchangeId.toString();

        const [, exchangeStruct] = await exchangeHandler.getExchange(exchangeId);
        expect(exchangeStruct.state).to.equal(ExchangeState.Redeemed);
      });

      it("commitToConditionalOfferAndRedeemVoucher", async function () {
        const sellerId = sharedSellerId;

        // Create conditional offer (absolute-zero, redeemable immediately)
        const { offer, offerDates, offerDurations } = await mockOffer();
        offer.price = "0";
        offer.sellerDeposit = "0";
        offer.buyerCancelPenalty = "0";
        offerDates.voucherRedeemableFrom = "0";

        const createTx = await offerHandler
          .connect(buyer2)
          .createOffer(
            offer,
            offerDates,
            offerDurations,
            { disputeResolverId: "0", mutualizerAddress: ZeroAddress },
            "0",
            MaxUint256
          );
        const createReceipt = await createTx.wait();
        const offerCreatedEvent = getEvent(createReceipt, offerHandler, "OfferCreated");
        const offerId = offerCreatedEvent.offerId.toString();

        // Deploy a Foreign721 and mint token 42 to buyer1
        const [foreign721] = await deployMockTokens(["Foreign721"]);
        const conditionalTokenId = "42";
        await foreign721.connect(deployer).mint(conditionalTokenId, "1");
        await foreign721.connect(deployer).transferFrom(deployer.address, buyer1.address, conditionalTokenId);

        // Create group with NFT ownership condition
        const condition = new Condition(
          EvaluationMethod.SpecificToken,
          TokenType.NonFungibleToken,
          await foreign721.getAddress(),
          GatingType.PerTokenId,
          conditionalTokenId, // minTokenId
          "0", // threshold
          "1", // maxCommits
          conditionalTokenId // maxTokenId
        );
        const group = new Group("1", sellerId, [offerId]);
        await groupHandler.connect(buyer2).createGroup(group, condition);

        const tx = await orchestrationHandler
          .connect(buyer1)
          .commitToConditionalOfferAndRedeemVoucher(offerId, conditionalTokenId);

        await expect(tx).to.emit(exchangeHandler, "VoucherRedeemed");
        await expect(tx).to.emit(exchangeHandler, "BuyerCommitted");

        const buyerCommittedEvent = getEvent(await tx.wait(), exchangeHandler, "BuyerCommitted");
        const exchangeId = buyerCommittedEvent.exchangeId.toString();

        const [, exchangeStruct] = await exchangeHandler.getExchange(exchangeId);
        expect(exchangeStruct.state).to.equal(ExchangeState.Redeemed);
      });

      it("createOfferCommitAndRedeem", async function () {
        const sellerId = sharedSellerId;

        // Build offer (absolute-zero, redeemable immediately)
        const { offer, offerDates, offerDurations } = await mockOffer();
        offer.id = "0"; // signals "create me"
        offer.sellerId = sellerId;
        offer.price = "0";
        offer.sellerDeposit = "0";
        offer.buyerCancelPenalty = "0";
        offerDates.voucherRedeemableFrom = "0";

        const drParams = { disputeResolverId: "0", mutualizerAddress: ZeroAddress };
        const condition = mockCondition({ method: EvaluationMethod.None, threshold: "0", maxCommits: "0" });
        const agentId = "0";
        const offerFeeLimit = MaxUint256;

        // EIP-712 FullOffer type definition (must match ExchangeCommitBase.sol verifyOffer payload)
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

        // The signed offer uses a single RoyaltyInfo struct; on-chain call uses the array form
        const signedOffer = offer.clone();
        signedOffer.royaltyInfo = signedOffer.royaltyInfo[0];

        const message = {
          offer: signedOffer,
          offerDates,
          offerDurations,
          drParameters: drParams,
          condition,
          agentId: agentId.toString(),
          feeLimit: offerFeeLimit.toString(),
          useDepositedFunds: false,
        };

        const signature = await prepareDataSignature(
          buyer2, // seller's assistant
          eip712TypeDefinition,
          "FullOffer",
          message,
          protocolAddress
        );

        const tx = await orchestrationHandler.connect(buyer1).createOfferCommitAndRedeem(
          [offer, offerDates, offerDurations, drParams, condition, agentId, offerFeeLimit, false],
          buyer2.address, // offerCreator = seller's assistant
          signature,
          "0" // conditionalTokenId
        );

        const receipt = await tx.wait();

        const offerCreatedEvent = getEvent(receipt, offerHandler, "OfferCreated");
        expect(offerCreatedEvent.offerId).to.not.be.null;

        const buyerCommittedEvent = getEvent(receipt, exchangeHandler, "BuyerCommitted");
        expect(buyerCommittedEvent.exchangeId).to.not.be.null;

        const exchangeId = buyerCommittedEvent.exchangeId.toString();
        const [, exchangeStruct] = await exchangeHandler.getExchange(exchangeId);
        expect(exchangeStruct.state).to.equal(ExchangeState.Redeemed);
      });
    });

    describe("Metatx Allowlist", function () {
      it("Should verify new functions are allowlisted", async function () {
        const { addOrUpgrade } = await upgradeConfig.getFacets();

        const getFunctionHashesClosure = getStateModifyingFunctionsHashes(
          addOrUpgrade,
          ["executeMetaTransaction", "executeMetaTransactionWithTokenTransferAuthorization"],
          []
        );
        const addedFunctionHashes = await getFunctionHashesClosure();

        for (const functionHash of addedFunctionHashes) {
          expect(await protocolContracts.metaTransactionsHandler["isFunctionAllowlisted(bytes32)"](functionHash)).to.be
            .true;
        }
      });
    });
  });
});
