const hre = require("hardhat");
const ethers = hre.ethers;

const { gasLimit } = require("../../../environments");
const { deployProtocolClients } = require("../../../scripts/util/deploy-protocol-clients");
const { getInterfaceIds } = require("../../../scripts/config/supported-interfaces.js");
const { deployProtocolDiamond } = require("../../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../../scripts/util/deploy-protocol-handler-facets.js");
const Buyer = require("../../../scripts/domain/Buyer");
const Role = require("../../../scripts/domain/Role");
const Seller = require("../../../scripts/domain/Seller");
const { mockOffer } = require("../../utils/mock.js");
const { deployProtocolConfigFacet } = require("../../../scripts/util/deploy-protocol-config-facet.js");
const { expect } = require("chai");
const { RevertReasons } = require("../../../scripts/config/revert-reasons");
const { oneMonth } = require("../../utils/constants");
const { mockDisputeResolver } = require("../../utils/mock");

describe("IBosonVoucher", function () {
  let interfaceId;
  let bosonVoucher, offerHandler, accountHandler, exchangeHandler, fundsHandler;
  let deployer, protocol, buyer, rando, operator, admin, clerk, treasury, operatorDR, adminDR, clerkDR, treasuryDR;
  let disputeResolver, disputeResolverFees;

  before(async function () {
    // Get interface id
    const { IBosonVoucher } = await getInterfaceIds();
    interfaceId = IBosonVoucher;
  });

  beforeEach(async function () {
    // Set signers (fake protocol address to test issue and burn voucher without protocol dependencie)
    [deployer, protocol, buyer, rando, operator, admin, clerk, treasury, operatorDR, adminDR, clerkDR, treasuryDR] =
      await ethers.getSigners();

    // Deploy diamond
    const [protocolDiamond, , , accessController] = await deployProtocolDiamond();

    // Cast Diamond to contract interfaces
    offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);
    accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);
    exchangeHandler = await ethers.getContractAt("IBosonExchangeHandler", protocolDiamond.address);
    fundsHandler = await ethers.getContractAt("IBosonFundsHandler", protocolDiamond.address);

    // Grant roles
    await accessController.grantRole(Role.PROTOCOL, protocol.address);
    await accessController.grantRole(Role.PROTOCOL, protocolDiamond.address);
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Cut the protocol handler facets into the Diamond
    await deployProtocolHandlerFacets(protocolDiamond, [
      "ExchangeHandlerFacet",
      "OfferHandlerFacet",
      "AccountHandlerFacet",
      "FundsHandlerFacet",
    ]);

    const protocolClientArgs = [accessController.address, protocolDiamond.address];
    const [, beacons, proxies, bv] = await deployProtocolClients(protocolClientArgs, gasLimit);
    [bosonVoucher] = bv;
    const [beacon] = beacons;
    const [proxy] = proxies;

    const protocolFeeFlatBoson = ethers.utils.parseUnits("0.01", "ether").toString();

    // Add config Handler, so ids start at 1, and so voucher address can be found
    const protocolConfig = [
      // Protocol addresses
      {
        treasuryAddress: ethers.constants.AddressZero,
        tokenAddress: ethers.constants.AddressZero,
        voucherBeaconAddress: beacon.address,
        voucherProxyAddress: proxy.address,
      },
      // Protocol limits
      {
        maxOffersPerGroup: 0,
        maxTwinsPerBundle: 0,
        maxOffersPerBundle: 0,
        maxOffersPerBatch: 0,
        maxTokensPerWithdrawal: 0,
        maxFeesPerDisputeResolver: 100,
        maxEscalationResponsePeriod: oneMonth,
        maxDisputesPerBatch: 100,
      },
      //Protocol fees
      {
        percentage: 200, // 2%
        flatBoson: protocolFeeFlatBoson,
      },
    ];

    await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);
  });

  // Interface support
  context("📋 Interfaces", async function () {
    context("👉 supportsInterface()", async function () {
      it("should indicate support for IBosonVoucher interface", async function () {
        const support = await bosonVoucher.supportsInterface(interfaceId);

        await expect(support, "IBosonVoucher interface not supported").is.true;
      });
    });
  });

  context("issueVoucher()", function () {
    let buyerStruct;

    before(function () {
      buyerStruct = new Buyer(1, buyer.address, true).toStruct();
    });

    it("should issue a voucher with success", async function () {
      const balanceBefore = await bosonVoucher.balanceOf(buyer.address);

      await bosonVoucher.connect(protocol).issueVoucher(0, buyerStruct);

      const balanceAfter = await bosonVoucher.balanceOf(buyer.address);

      expect(balanceAfter.sub(balanceBefore)).eq(1);
    });

    it("should revert if caller does not have PROTOCOL role", async function () {
      await expect(bosonVoucher.connect(rando).issueVoucher(0, buyerStruct)).to.be.revertedWith(
        RevertReasons.ACCESS_DENIED
      );
    });
  });

  context("burnVoucher()", function () {
    it("should burn a voucher with success", async function () {
      await bosonVoucher.connect(protocol).issueVoucher(0, new Buyer(1, buyer.address, true).toStruct());

      const balanceBefore = await bosonVoucher.balanceOf(buyer.address);

      await bosonVoucher.connect(protocol).burnVoucher(0);

      const balanceAfter = await bosonVoucher.balanceOf(buyer.address);

      expect(balanceBefore.sub(balanceAfter)).eq(1);
    });

    it("should revert if caller does not have PROTOCOL role", async function () {
      await expect(bosonVoucher.connect(rando).burnVoucher(0)).to.be.revertedWith(RevertReasons.ACCESS_DENIED);
    });
  });

  context("tokenURI", function () {
    let metadataUri;

    beforeEach(async function () {
      const seller = new Seller("1", operator.address, admin.address, clerk.address, treasury.address, true);

      await accountHandler.connect(admin).createSeller(seller);

      // Create a valid dispute resolver
      disputeResolver = await mockDisputeResolver(
        operatorDR.address,
        adminDR.address,
        clerkDR.address,
        treasuryDR.address,
        false
      );
      expect(disputeResolver.isValid()).is.true;

      //Create empty  DisputeResolverFee array because DR fees will be zero in the beginning;
      disputeResolverFees = [];

      // Register and activate the dispute resolver
      await accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees);
      await accountHandler.connect(deployer).activateDisputeResolver("2");

      const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
      await offerHandler
        .connect(operator)
        .createOffer(offer.toStruct(), offerDates.toStruct(), offerDurations.toStruct(), disputeResolverId);
      await fundsHandler
        .connect(admin)
        .depositFunds(seller.id, ethers.constants.AddressZero, offer.sellerDeposit, { value: offer.sellerDeposit });
      await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offer.id, { value: offer.price });

      metadataUri = offer.metadataUri;
    });

    it("should return the correct tokenURI", async function () {
      const tokenURI = await bosonVoucher.tokenURI(1);
      expect(tokenURI).eq(metadataUri);
    });
  });
});
