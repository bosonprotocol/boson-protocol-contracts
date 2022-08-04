const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");

const Role = require("../../scripts/domain/Role");
const Seller = require("../../scripts/domain/Seller");
const Buyer = require("../../scripts/domain/Buyer");
const DisputeResolver = require("../../scripts/domain/DisputeResolver");
const Agent = require("../../scripts/domain/Agent");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const AuthToken = require("../../scripts/domain/AuthToken");
const AuthTokenType = require("../../scripts/domain/AuthTokenType");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
const { oneMonth } = require("../utils/constants");

/**
 *  Test the Boson Account Handler interface
 */
describe("IBosonAccountHandler", function () {
  // Common vars
  let InterfaceIds;
  let deployer, rando, operator, admin, clerk, treasury, other1, other2, other3;
  let erc165, protocolDiamond, accessController, accountHandler, gasLimit;
  let seller, active;
  let emptyAuthToken;
  let buyer;
  let disputeResolver;
  let disputeResolverFees;
  let sellerAllowList;
  let metadataUriDR;
  let agent, feePercentage;
  let expected, nextAccountId;
  let support, id;
  let protocolFeePercentage, protocolFeeFlatBoson, buyerEscalationDepositPercentage;
  let contractURI;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();
  });

  beforeEach(async function () {
    // Make accounts available
    [deployer, operator, admin, clerk, treasury, rando, other1, other2, other3] = await ethers.getSigners();

    // Deploy the Protocol Diamond
    [protocolDiamond, , , accessController] = await deployProtocolDiamond();

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Grant PROTOCOL role to ProtocolDiamond address and renounces admin
    await accessController.grantRole(Role.PROTOCOL, protocolDiamond.address);

    // Cut the protocol handler facets into the Diamond
    await deployProtocolHandlerFacets(protocolDiamond, [
      "AccountHandlerFacet",
      "SellerHandlerFacet",
      "BuyerHandlerFacet",
      "DisputeResolverHandlerFacet",
      "AgentHandlerFacet",
    ]);

    // Deploy the Protocol client implementation/proxy pairs (currently just the Boson Voucher)
    const protocolClientArgs = [accessController.address, protocolDiamond.address];
    const [, beacons, proxies] = await deployProtocolClients(protocolClientArgs, gasLimit);
    const [beacon] = beacons;
    const [proxy] = proxies;

    // set protocolFees
    protocolFeePercentage = "200"; // 2 %
    protocolFeeFlatBoson = ethers.utils.parseUnits("0.01", "ether").toString();
    buyerEscalationDepositPercentage = "1000"; // 10%

    // Add config Handler, so ids start at 1, and so voucher address can be found
    const protocolConfig = [
      // Protocol addresses
      {
        treasury: ethers.constants.AddressZero,
        token: ethers.constants.AddressZero,
        voucherBeacon: beacon.address,
        beaconProxy: proxy.address,
      },
      // Protocol limits
      {
        maxExchangesPerBatch: 0,
        maxOffersPerGroup: 0,
        maxTwinsPerBundle: 0,
        maxOffersPerBundle: 0,
        maxOffersPerBatch: 0,
        maxTokensPerWithdrawal: 0,
        maxFeesPerDisputeResolver: 100,
        maxEscalationResponsePeriod: oneMonth,
        maxDisputesPerBatch: 0,
        maxAllowedSellers: 100,
        maxTotalOfferFeePercentage: 4000, //40%
      },
      // Protocol fees
      {
        percentage: protocolFeePercentage,
        flatBoson: protocolFeeFlatBoson,
      },
      buyerEscalationDepositPercentage,
    ];

    await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);

    // Cast Diamond to IERC165
    erc165 = await ethers.getContractAt("IERC165", protocolDiamond.address);

    // Cast Diamond to IBosonAccountHandler. Use this interface to call all individual account handlers
    accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);
  });

  // Interface support (ERC-156 provided by ProtocolDiamond, others by deployed facets)
  context("📋 Interfaces", async function () {
    context("👉 supportsInterface()", async function () {
      it("should indicate support for IBosonAccountHandler interface", async function () {
        // Current interfaceId for IBosonAccountHandler
        support = await erc165.supportsInterface(InterfaceIds.IBosonAccountHandler);

        // Test
        await expect(support, "IBosonAccountHandler interface not supported").is.true;
      });
    });
  });

  // All supported Account Handler methods
  context("📋 Account Handler Methods", async function () {
    beforeEach(async function () {
      // The first seller id
      nextAccountId = "1";

      // Required constructor params
      id = "1"; // argument sent to contract for createSeller will be ignored
      active = true;

      // Create a valid seller, then set fields in tests directly
      seller = new Seller(id, operator.address, admin.address, clerk.address, treasury.address, active);
      expect(seller.isValid()).is.true;

      // Contract URI
      contractURI = `https://ipfs.io/ipfs/QmW2WQi7j6c7UgJTarActp7tDNikE4B2qXtFCfLPdsgaTQ`;

      // AuthToken
      emptyAuthToken = new AuthToken("0", AuthTokenType.None);
      expect(emptyAuthToken.isValid()).is.true;

      // Create a valid buyer
      buyer = new Buyer(id, other1.address, active);
      expect(buyer.isValid()).is.true;

      //Dispute Resolver metadata URI
      metadataUriDR = `https://ipfs.io/ipfs/disputeResolver1`;

      // Create a valid dispute resolver
      disputeResolver = new DisputeResolver(
        id,
        oneMonth.toString(),
        operator.address,
        admin.address,
        clerk.address,
        treasury.address,
        metadataUriDR,
        active
      );
      expect(disputeResolver.isValid()).is.true;

      //Create DisputeResolverFee array
      disputeResolverFees = [
        new DisputeResolverFee(other1.address, "MockToken1", "100"),
        new DisputeResolverFee(other2.address, "MockToken2", "200"),
        new DisputeResolverFee(other3.address, "MockToken3", "300"),
      ];

      // Make a sellerAllowList
      sellerAllowList = ["1"];

      feePercentage = "500"; //5%

      // Create a valid agent, then set fields in tests directly
      agent = new Agent(id, feePercentage, other1.address, active);
      expect(agent.isValid()).is.true;
    });

    context("👉 getNextAccountId()", async function () {
      beforeEach(async function () {
        // AuthToken
        emptyAuthToken = new AuthToken("0", AuthTokenType.None);
        expect(emptyAuthToken.isValid()).is.true;

        // Create a seller
        await accountHandler.connect(admin).createSeller(seller, contractURI, emptyAuthToken);

        // id of the current seller and increment nextAccountId
        id = nextAccountId++;
      });

      it("should return the next account id", async function () {
        // What we expect the next seller id to be
        expected = nextAccountId;

        // Get the next seller id
        nextAccountId = await accountHandler.connect(rando).getNextAccountId();

        // Verify expectation
        expect(nextAccountId.toString() == expected).to.be.true;
      });

      it("should be incremented after a seller is created", async function () {
        //addresses need to be unique to seller Id, so setting them to random addresses here
        seller.operator = rando.address;
        seller.admin = other1.address;
        seller.clerk = other2.address;

        // Create another seller
        await accountHandler.connect(admin).createSeller(seller, contractURI, emptyAuthToken);

        // What we expect the next account id to be
        expected = ++nextAccountId;

        // Get the next account id
        nextAccountId = await accountHandler.connect(rando).getNextAccountId();

        // Verify expectation
        expect(nextAccountId.toString() == expected).to.be.true;
      });

      it("should be incremented after a buyer is created", async function () {
        // Create buyer
        await accountHandler.connect(admin).createBuyer(buyer);

        // What we expect the next account id to be
        expected = ++nextAccountId;

        // Get the next account id
        nextAccountId = await accountHandler.connect(rando).getNextAccountId();

        // Verify expectation
        expect(nextAccountId.toString() == expected).to.be.true;
      });

      it("should be incremented after a dispute resolver is created", async function () {
        // Create a dispute resolver
        await accountHandler
          .connect(rando)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

        // What we expect the next account id to be
        expected = ++nextAccountId;

        // Get the next account id
        nextAccountId = await accountHandler.connect(rando).getNextAccountId();

        // Verify expectation
        expect(nextAccountId.toString() == expected).to.be.true;
      });

      it("should be incremented after an agent is created", async function () {
        // Create an agent
        await accountHandler.connect(rando).createAgent(agent);

        // What we expect the next account id to be
        expected = ++nextAccountId;

        // Get the next account id
        nextAccountId = await accountHandler.connect(rando).getNextAccountId();

        // Verify expectation
        expect(nextAccountId.toString() == expected).to.be.true;
      });

      it("should not be incremented when only getNextAccountId is called", async function () {
        // What we expect the next seller id to be
        expected = nextAccountId;

        // Get the next seller id
        nextAccountId = await accountHandler.connect(rando).getNextAccountId();

        // Verify expectation
        expect(nextAccountId.toString() == expected).to.be.true;

        // Call again
        nextAccountId = await accountHandler.connect(rando).getNextAccountId();

        // Verify expectation
        expect(nextAccountId.toString() == expected).to.be.true;
      });
    });
  });
});
