const shell = require("shelljs");
const hre = require("hardhat");
const ethers = hre.ethers;
const { assert } = require("chai");
const AuthToken = require("../../scripts/domain/AuthToken");
const AuthTokenType = require("../../scripts/domain/AuthTokenType");
const Role = require("../../scripts/domain/Role");
const VoucherInitValues = require("../../scripts/domain/VoucherInitValues");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const { mockOffer, mockDisputeResolver, mockAuthToken, mockSeller, mockAgent, mockBuyer } = require("../util/mock");
const { setNextBlockTimestamp } = require("../util/utils.js");
const { oneMonth, oneDay } = require("../util/constants");
const { readContracts } = require("../../scripts/util/utils");

/**
 *  Integration test case - After Exchange handler facet upgrade, everything is still operational
 */
describe("[@skip-on-coverage] After facet upgrade, everything is still operational", function () {
  // Common vars
  let deployer, rando;
  let accessController, accountHandler, exchangeHandler, offerHandler, fundsHandler, disputeHandler;
  // bundleHandler, groupHandler, orchestrationHandler, twinHandler, pauseHandler, metaTransactionsHandler,
  let mockToken;
  let snapshot;
  let protocolDiamondAddress;
  let mockAuthERC721Contract;

  let DRs = [];
  let sellers = [];
  let buyers = [];
  let agents = [];
  let offers = [];
  let exchanges = [];
  let protocolContractState;

  before(async function () {
    // Make accounts available
    [deployer, rando] = await ethers.getSigners();

    // checkout old version
    const oldVersion = "v2.0.0";
    console.log(`Checking out version ${oldVersion}`);
    shell.exec(`git checkout ${oldVersion} contracts`);

    // run deploy suite, which automatically compiles the contracts
    await hre.run("deploy-suite", { env: "upgrade-test" });

    // Read contract info from file
    const chainId = (await hre.ethers.provider.getNetwork()).chainId;
    const contractsFile = readContracts(chainId, "hardhat", "upgrade-test");

    // Get AccessController abstraction
    const accessControllerInfo = contractsFile.contracts.find((i) => i.name === "AccessController");
    accessController = await ethers.getContractAt("AccessController", accessControllerInfo.address);

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Get protocolDiamondAddress
    protocolDiamondAddress = contractsFile.contracts.find((i) => i.name === "ProtocolDiamond").address;

    // Grant PROTOCOL role to ProtocolDiamond address and renounces admin
    await accessController.grantRole(Role.PROTOCOL, protocolDiamondAddress);

    // Cast Diamond to interfaces
    accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamondAddress);
    // bundleHandler = await ethers.getContractAt("IBosonBundleHandler", protocolDiamondAddress);
    disputeHandler = await ethers.getContractAt("IBosonDisputeHandler", protocolDiamondAddress);
    exchangeHandler = await ethers.getContractAt("IBosonExchangeHandler", protocolDiamondAddress);
    fundsHandler = await ethers.getContractAt("IBosonFundsHandler", protocolDiamondAddress);
    // groupHandler = await ethers.getContractAt("IBosonGroupHandler", protocolDiamondAddress);
    offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamondAddress);
    // orchestrationHandler = await ethers.getContractAt("IBosonOrchestrationHandler", protocolDiamondAddress);
    // twinHandler = await ethers.getContractAt("IBosonTwinHandler", protocolDiamondAddress);
    // pauseHandler = await ethers.getContractAt("IBosonPauseHandler", protocolDiamondAddress);
    // metaTransactionsHandler = await ethers.getContractAt("IBosonMetaTransactionsHandler", protocolDiamondAddress);

    // create mock token for auth
    [mockAuthERC721Contract] = await deployMockTokens(["Foreign721"]);
    const configHandler = await ethers.getContractAt("IBosonConfigHandler", protocolDiamondAddress);
    configHandler.connect(deployer).setAuthTokenContract(AuthTokenType.Lens, mockAuthERC721Contract.address);

    // create mock token for offers
    [mockToken] = await deployMockTokens(["Foreign20"]);

    // Populate protocol with data
    await populateProtocolContract();

    // Get current protocol state, which serves as the reference
    // We assume that this state is a true one, relying on our unit and integration tests
    protocolContractState = await getProtocolContractState();

    // Upgrade protocol
    const newVersion = "v2.1.0";
    if (newVersion) {
      // checkout the new tag
      console.log(`Checking out version ${newVersion}`);
      shell.exec(`git checkout ${newVersion} contracts`);
    } else {
      // if tag was not created yet, use the latest code
      console.log(`Checking out latest code`);
      shell.exec(`git checkout HEAD contracts`);
    }

    // compile new contracts
    await hre.run("compile");
    await hre.run("upgrade-facets", { env: "upgrade-test" });

    // Cast to updated interface
    accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamondAddress);

    snapshot = await ethers.provider.send("evm_snapshot", []);
  });

  afterEach(async function () {
    // revert to state before path was executed
    await ethers.provider.send("evm_revert", [snapshot]);
    snapshot = await ethers.provider.send("evm_snapshot", []);
  });

  after(async function () {
    // revert to latest state of contracts
    shell.exec(`git checkout HEAD contracts`);
  });

  // beforeEach(async function () {

  // });

  const entity = {
    SELLER: 0,
    DR: 1,
    AGENT: 2,
    BUYER: 3,
  };

  async function populateProtocolContract() {
    const DRcount = 3;
    const agentCount = 2;
    const sellerCount = 5;
    const buyerCount = 5;
    const totalCount = DRcount + agentCount + sellerCount + buyerCount;
    const creationOrder = [
      entity.DR,
      entity.AGENT,
      entity.SELLER,
      entity.SELLER,
      entity.DR,
      entity.SELLER,
      entity.DR,
      entity.SELLER,
      entity.AGENT,
      entity.SELLER,
      entity.BUYER,
      entity.BUYER,
      entity.BUYER,
      entity.BUYER,
      entity.BUYER,
    ]; // maybe programatically set the random order, expect for the buyers

    for (let i = 0; i < totalCount; i++) {
      const wallet = ethers.Wallet.createRandom();
      const connectedWallet = wallet.connect(ethers.provider);
      //Fund the new wallet
      let tx = {
        to: connectedWallet.address,
        // Convert currency unit from ether to wei
        value: ethers.utils.parseEther("1"),
      };
      await deployer.sendTransaction(tx);

      // create entities
      switch (creationOrder[i]) {
        case entity.DR: {
          const disputeResolver = mockDisputeResolver(wallet.address, wallet.address, wallet.address, wallet.address);
          const disputeResolverFees = [
            new DisputeResolverFee(ethers.constants.AddressZero, "Native", "0"),
            new DisputeResolverFee(mockToken.address, "MockToken", 0),
          ];
          const sellerAllowList = [];
          await accountHandler
            .connect(connectedWallet)
            .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
          DRs.push({ wallet: connectedWallet, disputeResolver, disputeResolverFees, sellerAllowList });

          //ADMIN role activates Dispute Resolver
          await accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id);
          break;
        }
        case entity.SELLER: {
          const seller = mockSeller(wallet.address, wallet.address, wallet.address, wallet.address);
          let authToken;
          // randomly decide if auth token is used or not
          if (Math.random() > 0.5) {
            // no auth token
            authToken = mockAuthToken();
          } else {
            // use auth token
            seller.admin = ethers.constants.AddressZero;
            await mockAuthERC721Contract.connect(connectedWallet).mint(101 * i, 1);
            authToken = new AuthToken(`${101 * i}`, AuthTokenType.Lens);
          }
          // set unique new voucherInitValues
          const voucherInitValues = new VoucherInitValues(`http://seller${i}.com/uri`, i * 10);
          await accountHandler.connect(connectedWallet).createSeller(seller, authToken, voucherInitValues);
          sellers.push({ wallet: connectedWallet, seller, authToken, voucherInitValues });

          // mint mock token to sellers just in case they need them
          await mockToken.mint(connectedWallet.address, "10000000000");
          await mockToken.connect(connectedWallet).approve(protocolDiamondAddress, "10000000000");
          break;
        }
        case entity.AGENT: {
          const agent = mockAgent(wallet.address);
          await accountHandler.connect(connectedWallet).createAgent(agent);
          agents.push({ wallet: connectedWallet, agent });
          break;
        }
        case entity.BUYER: {
          // no need to explicitly create buyer, since it's done automatically during commitToOffer
          const buyer = mockBuyer(wallet.address);
          buyers.push({ wallet: connectedWallet, buyer });
          break;
        }
      }
    }

    // create offers - first seller has 5 offers, second 4, third 3 etc
    let offerId = 0;
    for (let i = 0; i < sellers.length; i++) {
      for (let j = i; j >= 0; j--) {
        // Mock offer, offerDates and offerDurations
        const { offer, offerDates, offerDurations } = await mockOffer();

        // Set unique offer properties based on offer id
        offer.id = `${++offerId}`;
        offer.sellerId = sellers[j].seller.id;
        offer.price = `${offerId * 1 * 1000}`;
        offer.sellerDeposit = `${offerId * 1 * 100}`;
        offer.buyerCancelPenalty = `${offerId * 1 * 50}`;
        offer.quantityAvailable = `${(offerId + 1) * 15}`;

        // Default offer is in native token. Change every other to mock token
        if (offerId % 2 == 0) {
          offer.exchangeToken = mockToken.address;
        }

        // Set unique offer dates based on offer id
        const now = offerDates.validFrom;
        offerDates.validFrom = ethers.BigNumber.from(now)
          .add(oneMonth + offerId * 1000)
          .toString();
        offerDates.validUntil = ethers.BigNumber.from(now)
          .add(oneMonth * 6 * (offerId + 1))
          .toString();

        // Set unique offerDurations based on offer id
        offerDurations.disputePeriod = `${(offerId + 1) * oneMonth}`;
        offerDurations.voucherValid = `${(offerId + 1) * oneMonth}`;
        offerDurations.resolutionPeriod = `${(offerId + 1) * oneDay}`;

        // choose one DR and agent
        const disputeResolverId = DRs[offerId % 3].disputeResolver.id;
        const agentId = agents[offerId % 2].agent.id;

        // create an offer
        await offerHandler
          .connect(sellers[j].wallet)
          .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);

        offers.push({ offer, offerDates, offerDurations, disputeResolverId, agentId });

        // Deposit seller funds so the commit will succeed
        const sellerPool = ethers.BigNumber.from(offer.quantityAvailable).mul(offer.price).toString();
        const msgValue = offer.exchangeToken == ethers.constants.AddressZero ? sellerPool : "0";
        await fundsHandler
          .connect(sellers[j].wallet)
          .depositFunds(sellers[j].seller.id, offer.exchangeToken, sellerPool, { value: msgValue });
      }
    }

    // commit to some offers: first buyer commit to 1 offer, second to 2, third to 3 etc
    await setNextBlockTimestamp(Number(offers[offers.length - 1].offerDates.validFrom)); // When latest offer is valid, also other ffers are valid
    let exchangeId = 0;
    for (let i = 0; i < buyers.length; i++) {
      for (let j = i; j < buyers.length; j++) {
        const offerId = i + j + 1; // some offers will be picked multiple times, some never
        const offerPrice = offers[offerId - 1].offer.price;
        const buyerWallet = buyers[j].wallet;
        let msgValue;
        if (offers[offerId - 1].offer.exchangeToken == ethers.constants.AddressZero) {
          msgValue = offerPrice;
        } else {
          // approve token transfer
          msgValue = 0;
          await mockToken.connect(buyerWallet).approve(protocolDiamondAddress, offerPrice);
        }
        await mockToken.mint(buyerWallet.address, offerPrice);
        await exchangeHandler.connect(buyerWallet).commitToOffer(buyerWallet.address, offerId, { value: msgValue });
        exchanges.push({ exchangeId: ++exchangeId, buyerIndex: j });
      }
    }

    // redeem some vouchers #4
    for (const id of [2, 5, 11, 8]) {
      const exchange = exchanges[id];
      await exchangeHandler.connect(buyers[exchange.buyerIndex].wallet).redeemVoucher(exchange.exchangeId);
    }

    // cancel some vouchers #3
    for (const id of [10, 3, 13]) {
      const exchange = exchanges[id];
      await exchangeHandler.connect(buyers[exchange.buyerIndex].wallet).redeemVoucher(exchange.exchangeId);
    }

    // revoke some vouchers #2
    for (const id of [4, 6]) {
      const exchange = exchanges[id];
      await exchangeHandler.connect(buyers[exchange.buyerIndex].wallet).redeemVoucher(exchange.exchangeId);
    }

    // raise dispute on some exchanges #1
    const id = 5; // must be one of redeemed ones
    const exchange = exchanges[id];
    await disputeHandler.connect(buyers[exchange.buyerIndex].wallet).raiseDispute(exchange.exchangeId);
  }

  async function getProtocolContractState() {
    // all id count
    const totalCount = DRs.length + sellers.length + buyers.length + agents.length;
    let DRsState = [];
    let sellerState = [];
    let buyersState = [];
    let agentsState = [];

    // Query even the ids where it's not expected to get the entity
    for (let id = 1; id <= totalCount; id++) {
      sellerState.push(await accountHandler.connect(rando).getSeller(id));
      DRsState.push(await accountHandler.connect(rando).getDisputeResolver(id));
      buyersState.push(await accountHandler.connect(rando).getBuyer(id));
      agentsState.push(await accountHandler.connect(rando).getAgent(id));
    }

    // get offers
    let offersState = [];
    for (let id = 1; id <= offers.length; id++) {
      offersState.push(await offerHandler.connect(rando).getOffer(id));
    }

    // get exchanges
    let exchangesState = [];
    for (let id = 1; id <= offers.length; id++) {
      exchangesState.push(await exchangeHandler.connect(rando).getExchange(id));
    }

    return { DRsState, sellerState, buyersState, agentsState, offersState };
  }

  // Exchange methods
  context("📋 Right After upgrade", async function () {
    it.only("State is not affected directly after the update", async function () {
      // Get protocol state after the upgrade
      const protocolContractStateAfterUpgrade = await getProtocolContractState();

      // State before and after should be equal
      assert.deepEqual(protocolContractState, protocolContractStateAfterUpgrade, "state mismatch after upgrade");
    });
  });

  // Create new protocol entities. Existing data should not be affected
  context.skip("📋 New data after the upgrade do not corrupt data from before the upgrade", async function () {});

  // Test that offers and exchanges from before the upgrade can normally be used
  context.skip("📋 Interactions after the upgrade still work", async function () {});

  // Test actions that worked in previous version, but should not work anymore, or work differently
  context.skip("📋 Breaking changes", async function () {});
});
