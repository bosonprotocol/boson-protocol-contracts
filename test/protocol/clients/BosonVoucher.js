const hre = require("hardhat");
const ethers = hre.ethers;

const { gasLimit } = require("../../../environments");
const { deployProtocolClients } = require("../../../scripts/util/deploy-protocol-clients");
const { getInterfaceIds } = require("../../../scripts/config/supported-interfaces.js");
const { deployProtocolDiamond } = require("../../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../../scripts/util/deploy-protocol-handler-facets.js");
const Role = require("../../../scripts/domain/Role");
const { DisputeResolverFee } = require("../../../scripts/domain/DisputeResolverFee");
const { mockOffer } = require("../../utils/mock.js");
const { deployProtocolConfigFacet } = require("../../../scripts/util/deploy-protocol-config-facet.js");
const { assert, expect } = require("chai");
const { RevertReasons } = require("../../../scripts/config/revert-reasons");
const { oneMonth } = require("../../utils/constants");
const {
  mockDisputeResolver,
  mockSeller,
  mockVoucherInitValues,
  mockAuthToken,
  mockBuyer,
} = require("../../utils/mock");

describe("IBosonVoucher", function () {
  let interfaceId;
  let bosonVoucher, offerHandler, accountHandler, exchangeHandler, fundsHandler;
  let deployer,
    protocol,
    buyer,
    rando,
    operator,
    admin,
    clerk,
    treasury,
    operatorDR,
    adminDR,
    clerkDR,
    treasuryDR,
    seller;
  let disputeResolver, disputeResolverFees;
  let emptyAuthToken;
  let agentId;
  let voucherInitValues, contractURI, royaltyPercentage, exchangeId, offerPrice;

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
      "SellerHandlerFacet",
      "DisputeResolverHandlerFacet",
      "FundsHandlerFacet",
    ]);

    const protocolClientArgs = [accessController.address, protocolDiamond.address];
    const [, beacons, proxies, bv] = await deployProtocolClients(protocolClientArgs, gasLimit);
    [bosonVoucher] = bv;
    const [beacon] = beacons;
    const [proxy] = proxies;

    const protocolFeeFlatBoson = ethers.utils.parseUnits("0.01", "ether").toString();
    const buyerEscalationDepositPercentage = "1000"; // 10%

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
        maxExchangesPerBatch: 100,
        maxOffersPerGroup: 0,
        maxTwinsPerBundle: 0,
        maxOffersPerBundle: 0,
        maxOffersPerBatch: 0,
        maxTokensPerWithdrawal: 0,
        maxFeesPerDisputeResolver: 100,
        maxEscalationResponsePeriod: oneMonth,
        maxDisputesPerBatch: 100,
        maxAllowedSellers: 100,
        maxTotalOfferFeePercentage: 4000, //40%
      },
      //Protocol fees
      {
        percentage: 200, // 2%
        flatBoson: protocolFeeFlatBoson,
      },
      buyerEscalationDepositPercentage,
    ];

    await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);
  });

  // Interface support
  context("📋 Interfaces", async function () {
    context("👉 supportsInterface()", async function () {
      it("should indicate support for IBosonVoucher interface", async function () {
        const support = await bosonVoucher.supportsInterface(interfaceId);

        expect(support, "IBosonVoucher interface not supported").is.true;
      });
    });
  });

  context("issueVoucher()", function () {
    let buyerStruct;

    before(function () {
      buyerStruct = mockBuyer(buyer.address).toStruct();
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
      await bosonVoucher.connect(protocol).issueVoucher(0, mockBuyer(buyer.address).toStruct());

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
      seller = mockSeller(operator.address, admin.address, clerk.address, treasury.address);

      // prepare the VoucherInitValues
      voucherInitValues = mockVoucherInitValues();
      expect(voucherInitValues.isValid()).is.true;

      // AuthToken
      emptyAuthToken = mockAuthToken();
      expect(emptyAuthToken.isValid()).is.true;

      await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

      agentId = "0"; // agent id is optional while creating an offer

      // Create a valid dispute resolver
      disputeResolver = mockDisputeResolver(
        operatorDR.address,
        adminDR.address,
        clerkDR.address,
        treasuryDR.address,
        false
      );
      expect(disputeResolver.isValid()).is.true;

      //Create DisputeResolverFee array so offer creation will succeed
      disputeResolverFees = [new DisputeResolverFee(ethers.constants.AddressZero, "Native", "0")];

      // Make empty seller list, so every seller is allowed
      const sellerAllowList = [];

      // Register and activate the dispute resolver
      await accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
      await accountHandler.connect(deployer).activateDisputeResolver("2");

      const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
      await offerHandler
        .connect(operator)
        .createOffer(offer.toStruct(), offerDates.toStruct(), offerDurations.toStruct(), disputeResolverId, agentId);
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

  context("transferOwnership()", function () {
    it("should emit OwnershipTransferred", async function () {
      const ownable = await ethers.getContractAt("OwnableUpgradeable", bosonVoucher.address);
      await expect(bosonVoucher.connect(protocol).transferOwnership(operator.address))
        .to.emit(ownable, "OwnershipTransferred")
        .withArgs(ethers.constants.AddressZero, operator.address);
    });

    it("should transfer ownership with success", async function () {
      await bosonVoucher.connect(protocol).transferOwnership(operator.address);

      const ownable = await ethers.getContractAt("OwnableUpgradeable", bosonVoucher.address);
      const owner = await ownable.owner();

      expect(owner).eq(operator.address, "Wrong owner");
    });

    it("should revert if caller does not have PROTOCOL role", async function () {
      await expect(bosonVoucher.connect(rando).transferOwnership(operator.address)).to.be.revertedWith(
        RevertReasons.ACCESS_DENIED
      );
    });

    it("Even the current owner cannot transfer the ownership", async function () {
      // succesfully transfer to operator
      await bosonVoucher.connect(protocol).transferOwnership(operator.address);

      // owner tries to transfer, it should fail
      await expect(bosonVoucher.connect(operator).transferOwnership(rando.address)).to.be.revertedWith(
        RevertReasons.ACCESS_DENIED
      );
    });
  });

  context("setContractURI()", function () {
    beforeEach(async function () {
      // give ownership to operator
      await bosonVoucher.connect(protocol).transferOwnership(operator.address);

      contractURI = "newContractURI";
    });

    it("should emit ContractURIChanged event", async function () {
      await expect(bosonVoucher.connect(operator).setContractURI(contractURI))
        .to.emit(bosonVoucher, "ContractURIChanged")
        .withArgs(contractURI);
    });

    it("should set new contract with success", async function () {
      await bosonVoucher.connect(operator).setContractURI(contractURI);

      const returnedContractURI = await bosonVoucher.contractURI();

      expect(returnedContractURI).eq(contractURI, "Wrong contractURI");
    });

    it("should revert if caller is not the owner", async function () {
      // random caller
      await expect(bosonVoucher.connect(rando).setContractURI(contractURI)).to.be.revertedWith(
        RevertReasons.OWNABLE_NOT_OWNER
      );

      // protocol as the caller
      await expect(bosonVoucher.connect(protocol).setContractURI(contractURI)).to.be.revertedWith(
        RevertReasons.OWNABLE_NOT_OWNER
      );
    });
  });

  context("ERC2981 NFT Royalty fee", function () {
    beforeEach(async function () {
      seller = mockSeller(operator.address, admin.address, clerk.address, treasury.address);

      // prepare the VoucherInitValues
      voucherInitValues = mockVoucherInitValues();
      expect(voucherInitValues.isValid()).is.true;

      // AuthToken
      emptyAuthToken = mockAuthToken();
      expect(emptyAuthToken.isValid()).is.true;

      await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

      agentId = "0"; // agent id is optional while creating an offer

      // Create a valid dispute resolver
      disputeResolver = mockDisputeResolver(
        operatorDR.address,
        adminDR.address,
        clerkDR.address,
        treasuryDR.address,
        false
      );
      expect(disputeResolver.isValid()).is.true;

      //Create DisputeResolverFee array so offer creation will succeed
      disputeResolverFees = [new DisputeResolverFee(ethers.constants.AddressZero, "Native", "0")];

      // Make empty seller list, so every seller is allowed
      const sellerAllowList = [];

      // Register and activate the dispute resolver
      await accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
      await accountHandler.connect(deployer).activateDisputeResolver("2");

      const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
      await offerHandler
        .connect(operator)
        .createOffer(offer.toStruct(), offerDates.toStruct(), offerDurations.toStruct(), disputeResolverId, agentId);
      await fundsHandler
        .connect(admin)
        .depositFunds(seller.id, ethers.constants.AddressZero, offer.sellerDeposit, { value: offer.sellerDeposit });
      await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offer.id, { value: offer.price });

      exchangeId = "1";

      offerPrice = offer.price;
    });

    context("setRoyaltyPercentage()", function () {
      beforeEach(async function () {
        // give ownership to operator
        await bosonVoucher.connect(protocol).transferOwnership(operator.address);
      });

      it("should emit RoyaltyPercentageChanged event", async function () {
        royaltyPercentage = "0"; //0%
        await expect(bosonVoucher.connect(operator).setRoyaltyPercentage(royaltyPercentage))
          .to.emit(bosonVoucher, "RoyaltyPercentageChanged")
          .withArgs(royaltyPercentage);
      });

      it("should set a royalty fee percentage", async function () {
        // First, set royalty fee as 0
        royaltyPercentage = "0"; //0%
        await bosonVoucher.connect(operator).setRoyaltyPercentage(royaltyPercentage);

        let receiver, royaltyAmount;
        [receiver, royaltyAmount] = await bosonVoucher.connect(rando).royaltyInfo(exchangeId, offerPrice);

        // Expectations
        let expectedRecipient = seller.treasury;
        let expectedRoyaltyAmount = "0";

        assert.equal(receiver, expectedRecipient, "Recipient address is incorrect");
        assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");

        // Now, set royalty fee as 10%
        royaltyPercentage = "1000"; //10%
        await bosonVoucher.connect(operator).setRoyaltyPercentage(royaltyPercentage);

        [receiver, royaltyAmount] = await bosonVoucher.connect(rando).royaltyInfo(exchangeId, offerPrice);

        // Expectations
        expectedRecipient = seller.treasury;
        expectedRoyaltyAmount = ethers.BigNumber.from(offerPrice).mul(royaltyPercentage).div("10000").toString();

        assert.equal(receiver, expectedRecipient, "Recipient address is incorrect");
        assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");
      });

      context("💔 Revert Reasons", async function () {
        it("should revert if caller is not the owner", async function () {
          // random caller
          await expect(bosonVoucher.connect(rando).setRoyaltyPercentage(royaltyPercentage)).to.be.revertedWith(
            RevertReasons.OWNABLE_NOT_OWNER
          );

          // protocol as the caller
          await expect(bosonVoucher.connect(protocol).setRoyaltyPercentage(royaltyPercentage)).to.be.revertedWith(
            RevertReasons.OWNABLE_NOT_OWNER
          );
        });

        it("should revert if royaltyPercentage is greater than 100%", async function () {
          // Set royalty fee as 101%
          royaltyPercentage = "10001"; //101%

          // random caller
          await expect(bosonVoucher.connect(operator).setRoyaltyPercentage(royaltyPercentage)).to.be.revertedWith(
            RevertReasons.ROYALTY_FEE_INVALID
          );
        });
      });
    });

    context("royaltyInfo()", function () {
      beforeEach(async function () {
        // give ownership to operator
        await bosonVoucher.connect(protocol).transferOwnership(operator.address);
      });

      it("should return a recipient and royalty fee", async function () {
        // First, set royalty fee as 0
        royaltyPercentage = "0"; //0%
        await bosonVoucher.connect(operator).setRoyaltyPercentage(royaltyPercentage);

        let receiver, royaltyAmount;
        [receiver, royaltyAmount] = await bosonVoucher.connect(operator).royaltyInfo(exchangeId, offerPrice);

        // Expectations
        let expectedRecipient = seller.treasury;
        let expectedRoyaltyAmount = "0";

        assert.equal(receiver, expectedRecipient, "Recipient address is incorrect");
        assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");

        // Now, set royalty fee as 10%
        royaltyPercentage = "1000"; //10%
        await bosonVoucher.connect(operator).setRoyaltyPercentage(royaltyPercentage);

        [receiver, royaltyAmount] = await bosonVoucher.connect(operator).royaltyInfo(exchangeId, offerPrice);

        // Expectations
        expectedRecipient = seller.treasury;
        expectedRoyaltyAmount = ethers.BigNumber.from(offerPrice).mul(royaltyPercentage).div("10000").toString();

        assert.equal(receiver, expectedRecipient, "Recipient address is incorrect");
        assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");

        // Any random address can check the royalty info
        // Now, set royalty fee as 20%
        royaltyPercentage = "2000"; //20%
        await bosonVoucher.connect(operator).setRoyaltyPercentage(royaltyPercentage);

        [receiver, royaltyAmount] = await bosonVoucher.connect(rando).royaltyInfo(exchangeId, offerPrice);

        // Expectations
        expectedRecipient = seller.treasury;
        expectedRoyaltyAmount = ethers.BigNumber.from(offerPrice).mul(royaltyPercentage).div("10000").toString();

        assert.equal(receiver, expectedRecipient, "Recipient address is incorrect");
        assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");
      });
    });
  });
});
