const hre = require("hardhat");
const ethers = hre.ethers;

const DisputeResolutionTerms = require("../../../scripts/domain/DisputeResolutionTerms");
const { deployProtocolClients } = require("../../../scripts/util/deploy-protocol-clients");
const { getInterfaceIds } = require("../../../scripts/config/supported-interfaces.js");
const { deployProtocolDiamond } = require("../../../scripts/util/deploy-protocol-diamond.js");
const { deployAndCutFacets } = require("../../../scripts/util/deploy-protocol-handler-facets.js");
const Role = require("../../../scripts/domain/Role");
const { DisputeResolverFee } = require("../../../scripts/domain/DisputeResolverFee");
const Range = require("../../../scripts/domain/Range");
const VoucherInitValues = require("../../../scripts/domain/VoucherInitValues");

const { mockOffer, mockExchange, mockVoucher } = require("../../util/mock.js");
const { assert, expect } = require("chai");
const { RevertReasons } = require("../../../scripts/config/revert-reasons");
const { oneWeek, oneMonth, maxPriorityFeePerGas } = require("../../util/constants");
const {
  mockDisputeResolver,
  mockSeller,
  mockVoucherInitValues,
  mockAuthToken,
  mockBuyer,
  accountId,
} = require("../../util/mock");
const {
  applyPercentage,
  calculateContractAddress,
  calculateVoucherExpiry,
  setNextBlockTimestamp,
  getFacetsWithArgs,
} = require("../../util/utils.js");
const { waffle } = hre;
const { deployMockContract } = waffle;
const FormatTypes = ethers.utils.FormatTypes;

describe("IBosonVoucher", function () {
  let interfaceIds;
  let protocolDiamond, accessController;
  let bosonVoucher, offerHandler, accountHandler, exchangeHandler, fundsHandler, configHandler;
  let deployer,
    protocol,
    buyer,
    rando,
    rando2,
    operator,
    admin,
    clerk,
    treasury,
    operatorDR,
    adminDR,
    clerkDR,
    treasuryDR,
    seller,
    protocolTreasury,
    bosonToken;
  let beacon;
  let disputeResolver, disputeResolverFees;
  let emptyAuthToken;
  let agentId;
  let voucherInitValues, contractURI, royaltyPercentage, exchangeId, offerPrice;

  before(async function () {
    // Get interface id
    const { IBosonVoucher, IERC721, IERC2981 } = await getInterfaceIds();
    interfaceIds = { IBosonVoucher, IERC721, IERC2981 };

    // Set signers (fake protocol address to test issue and burn voucher without protocol dependencie)
    [deployer, protocol, buyer, rando, rando2, admin, treasury, adminDR, treasuryDR, protocolTreasury, bosonToken] =
      await ethers.getSigners();
  });

  beforeEach(async function () {
    // make all account the same
    operator = clerk = admin;
    operatorDR = clerkDR = adminDR;

    // Deploy diamond
    [protocolDiamond, , , , accessController] = await deployProtocolDiamond(maxPriorityFeePerGas);

    // Cast Diamond to contract interfaces
    offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);
    accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);
    exchangeHandler = await ethers.getContractAt("IBosonExchangeHandler", protocolDiamond.address);
    fundsHandler = await ethers.getContractAt("IBosonFundsHandler", protocolDiamond.address);
    configHandler = await ethers.getContractAt("IBosonConfigHandler", protocolDiamond.address);

    // Grant roles
    await accessController.grantRole(Role.PROTOCOL, protocol.address);
    await accessController.grantRole(Role.PROTOCOL, protocolDiamond.address);
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    const protocolClientArgs = [protocolDiamond.address];
    const [, beacons, proxies, bv] = await deployProtocolClients(protocolClientArgs, maxPriorityFeePerGas);
    [bosonVoucher] = bv;
    [beacon] = beacons;
    const [proxy] = proxies;

    const protocolFeeFlatBoson = ethers.utils.parseUnits("0.01", "ether").toString();
    const buyerEscalationDepositPercentage = "1000"; // 10%

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
        maxExchangesPerBatch: 100,
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
        maxPremintedVouchers: 10000,
      },
      //Protocol fees
      {
        percentage: 200, // 2%
        flatBoson: protocolFeeFlatBoson,
        buyerEscalationDepositPercentage,
      },
    ];

    const facetNames = [
      "ExchangeHandlerFacet",
      "OfferHandlerFacet",
      "SellerHandlerFacet",
      "DisputeResolverHandlerFacet",
      "FundsHandlerFacet",
      "ProtocolInitializationFacet",
      "ConfigHandlerFacet",
    ];

    const facetsToDeploy = await getFacetsWithArgs(facetNames, protocolConfig);

    // Cut the protocol handler facets into the Diamond
    await deployAndCutFacets(protocolDiamond.address, facetsToDeploy, maxPriorityFeePerGas);

    // Initialize voucher contract
    const sellerId = 1;

    // prepare the VoucherInitValues
    voucherInitValues = mockVoucherInitValues();
    const bosonVoucherInit = await ethers.getContractAt("BosonVoucher", bosonVoucher.address);

    await bosonVoucherInit.initializeVoucher(sellerId, operator.address, voucherInitValues);
  });

  // Interface support
  context("📋 Interfaces", async function () {
    context("👉 supportsInterface()", async function () {
      it("should indicate support for IBosonVoucher, IERC721 and IERC2981 interface", async function () {
        // IBosonVoucher interface
        let support = await bosonVoucher.supportsInterface(interfaceIds["IBosonVoucher"]);
        expect(support, "IBosonVoucher interface not supported").is.true;

        // IERC721 interface
        support = await bosonVoucher.supportsInterface(interfaceIds["IERC721"]);
        expect(support, "IERC721 interface not supported").is.true;

        // IERC2981 interface
        support = await bosonVoucher.supportsInterface(interfaceIds["IERC2981"]);
        expect(support, "IERC2981 interface not supported").is.true;
      });
    });
  });

  context("issueVoucher()", function () {
    let buyerStruct;
    let buyerWallet;

    before(function () {
      buyerStruct = mockBuyer(buyer.address).toStruct();
      buyerWallet = buyerStruct[1];
    });

    after(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    it("should issue a voucher with success", async function () {
      const balanceBefore = await bosonVoucher.balanceOf(buyer.address);
      await bosonVoucher.connect(protocol).issueVoucher(0, buyerWallet);

      const balanceAfter = await bosonVoucher.balanceOf(buyer.address);

      expect(balanceAfter.sub(balanceBefore)).eq(1);
    });

    context("💔 Revert Reasons", async function () {
      it("should revert if caller does not have PROTOCOL role", async function () {
        // Expect revert if random user attempts to issue voucher
        await expect(bosonVoucher.connect(rando).issueVoucher(0, buyerWallet)).to.be.revertedWith(
          RevertReasons.ACCESS_DENIED
        );

        // Grant PROTOCOL role to random user address
        await accessController.grantRole(Role.PROTOCOL, rando.address);

        // Attempt to issue voucher again as a random user
        const balanceBefore = await bosonVoucher.balanceOf(buyer.address);
        await bosonVoucher.connect(rando).issueVoucher(0, buyerWallet);
        const balanceAfter = await bosonVoucher.balanceOf(buyer.address);

        expect(balanceAfter.sub(balanceBefore)).eq(1);
      });

      it("issueVoucher should revert if exchange id falls within a pre-minted offer's range", async function () {
        const offerId = "5";
        const startId = "10";
        const length = "123";
        const tokenId = "15"; // token wihthin reserved range

        // Deploy mock protocol
        const mockProtocol = await deployMockProtocol();

        // Define what should be returned when getExchange is called
        await mockProtocol.mock.getExchange.withArgs(tokenId).returns(true, mockExchange({ offerId }), mockVoucher());

        // Reserve a range
        await bosonVoucher.connect(protocol).reserveRange(offerId, startId, length);

        // Expect revert if random user attempts to issue voucher
        await expect(bosonVoucher.connect(protocol).issueVoucher(tokenId, buyerWallet)).to.be.revertedWith(
          RevertReasons.EXCHANGE_ID_IN_RESERVED_RANGE
        );
      });
    });
  });

  context("reserveRange()", function () {
    let offerId, startId, length;
    let range;

    beforeEach(async function () {
      offerId = "5";
      startId = "10";
      length = "123";

      range = new Range(offerId, startId, length, "0", "0");
    });

    it("Should emit event RangeReserved", async function () {
      // Reserve range, test for event
      await expect(bosonVoucher.connect(protocol).reserveRange(offerId, startId, length))
        .to.emit(bosonVoucher, "RangeReserved")
        .withArgs(offerId, range.toStruct());
    });

    it("Should update state", async function () {
      // Reserve range
      await bosonVoucher.connect(protocol).reserveRange(offerId, startId, length);

      // Get range object from contract
      const returnedRange = Range.fromStruct(await bosonVoucher.getRangeByOfferId(offerId));
      assert.equal(returnedRange.toString(), range.toString(), "Range mismatch");

      // Mock getOffer call, otherwise getAvailablePreMints will return 0
      const mockProtocol = await deployMockProtocol();
      const { offer, offerDates, offerDurations, offerFees } = await mockOffer();
      const disputeResolutionTerms = new DisputeResolutionTerms("0", "0", "0", "0");
      await mockProtocol.mock.getMaxPremintedVouchers.returns("1000");
      await mockProtocol.mock.getOffer.returns(
        true,
        offer,
        offerDates,
        offerDurations,
        disputeResolutionTerms,
        offerFees
      );

      // Get available premints from contract
      const availablePremints = await bosonVoucher.getAvailablePreMints(offerId);
      assert.equal(availablePremints.toString(), length, "Available Premints mismatch");
    });

    context("💔 Revert Reasons", async function () {
      it("caller does not have PROTOCOL role", async function () {
        await expect(bosonVoucher.connect(rando).reserveRange(offerId, startId, length)).to.be.revertedWith(
          RevertReasons.ACCESS_DENIED
        );
      });

      it("Start id is not greater than zero", async function () {
        // Set start id to 0
        startId = 0;

        // Try to reserve range, it should fail
        await expect(bosonVoucher.connect(protocol).reserveRange(offerId, startId, length)).to.be.revertedWith(
          RevertReasons.INVALID_RANGE_START
        );
      });

      it("Offer id is already associated with a range", async function () {
        // Reserve range for an offer
        await bosonVoucher.connect(protocol).reserveRange(offerId, startId, length);

        // Try to reserve range for the same offer, it should fail
        await expect(bosonVoucher.connect(protocol).reserveRange(offerId, startId, length)).to.be.revertedWith(
          RevertReasons.OFFER_RANGE_ALREADY_RESERVED
        );
      });
    });
  });

  context("preMint()", function () {
    let offerId, startId, length, amount;
    let mockProtocol;
    let offer, offerDates, offerDurations, offerFees, disputeResolutionTerms;

    beforeEach(async function () {
      mockProtocol = await deployMockProtocol();
      ({ offer, offerDates, offerDurations, offerFees } = await mockOffer());
      disputeResolutionTerms = new DisputeResolutionTerms("0", "0", "0", "0");
      await mockProtocol.mock.getMaxPremintedVouchers.returns("1000");
      await mockProtocol.mock.getOffer.returns(
        true,
        offer,
        offerDates,
        offerDurations,
        disputeResolutionTerms,
        offerFees
      );

      // reserve a range
      offerId = "5";
      startId = "10";
      length = "1000";
      await bosonVoucher.connect(protocol).reserveRange(offerId, startId, length);

      // amount to mint
      amount = 50;
    });

    it("Should emit Transfer events", async function () {
      // Premint tokens, test for event
      const tx = await bosonVoucher.connect(operator).preMint(offerId, amount);

      // Expect an event for every mint
      for (let i = 0; i < Number(amount); i++) {
        await expect(tx)
          .to.emit(bosonVoucher, "Transfer")
          .withArgs(ethers.constants.AddressZero, operator.address, i + Number(startId));
      }
    });

    it("Should update state", async function () {
      let sellerBalanceBefore = await bosonVoucher.balanceOf(operator.address);

      // Premint tokens
      await bosonVoucher.connect(operator).preMint(offerId, amount);

      // Expect a correct owner for all preminted tokens
      for (let i = 0; i < Number(amount); i++) {
        let tokenId = i + Number(startId);
        let tokenOwner = await bosonVoucher.ownerOf(tokenId);
        assert.equal(tokenOwner, operator.address, `Wrong token owner for token ${tokenId}`);
      }

      // Token that is inside a range, but wasn't preminted yet should not have an owner
      await expect(bosonVoucher.ownerOf(Number(amount) + Number(startId) + 1)).to.be.revertedWith(
        RevertReasons.ERC721_NON_EXISTENT
      );

      // Seller's balance should be updated for the total mint amount
      let sellerBalanceAfter = await bosonVoucher.balanceOf(operator.address);
      assert.equal(sellerBalanceAfter.toNumber(), sellerBalanceBefore.add(amount).toNumber(), "Balance mismatch");

      // Get available premints from contract
      const availablePremints = await bosonVoucher.getAvailablePreMints(offerId);
      assert.equal(availablePremints.toNumber(), Number(length) - Number(amount), "Available Premints mismatch");
    });

    context("💔 Revert Reasons", async function () {
      it("Caller is not the owner", async function () {
        await expect(bosonVoucher.connect(rando).preMint(offerId, amount)).to.be.revertedWith(
          RevertReasons.OWNABLE_NOT_OWNER
        );
      });

      it("Offer id is not associated with a range", async function () {
        // Set invalid offer id
        offerId = 15;

        // Try to premint, it should fail
        await expect(bosonVoucher.connect(operator).preMint(offerId, amount)).to.be.revertedWith(
          RevertReasons.NO_RESERVED_RANGE_FOR_OFFER
        );
      });

      it("Amount to mint is more than remaining un-minted in range", async function () {
        // Mint 50 tokens
        await bosonVoucher.connect(operator).preMint(offerId, amount);

        // Set invalid amount
        amount = "990"; // length is 1000, already minted 50

        // Try to premint, it should fail
        await expect(bosonVoucher.connect(operator).preMint(offerId, amount)).to.be.revertedWith(
          RevertReasons.INVALID_AMOUNT_TO_MINT
        );
      });

      it("Too many to mint in a single transaction", async function () {
        await mockProtocol.mock.getMaxPremintedVouchers.returns("100");

        // Set invalid amount
        amount = "101";

        // Try to premint, it should fail
        await expect(bosonVoucher.connect(operator).preMint(offerId, amount)).to.be.revertedWith(
          RevertReasons.TOO_MANY_TO_MINT
        );
      });

      it("Offer already expired", async function () {
        // Skip to after offer expiration
        await setNextBlockTimestamp(ethers.BigNumber.from(offerDates.validUntil).add(1).toHexString());

        // Try to premint, it should fail
        await expect(bosonVoucher.connect(operator).preMint(offerId, amount)).to.be.revertedWith(
          RevertReasons.OFFER_EXPIRED_OR_VOIDED
        );
      });

      it("Offer is voided", async function () {
        // Make offer voided
        offer.voided = true;
        await mockProtocol.mock.getOffer.returns(
          true,
          offer,
          offerDates,
          offerDurations,
          disputeResolutionTerms,
          offerFees
        );

        // Try to premint, it should fail
        await expect(bosonVoucher.connect(operator).preMint(offerId, amount)).to.be.revertedWith(
          RevertReasons.OFFER_EXPIRED_OR_VOIDED
        );
      });
    });
  });

  context("burnPremintedVouchers()", function () {
    let offerId, startId, length, amount;
    let mockProtocol;
    let offer, offerDates, offerDurations, offerFees, disputeResolutionTerms;
    let maxPremintedVouchers;

    beforeEach(async function () {
      offerId = "5";
      maxPremintedVouchers = "10";

      mockProtocol = await deployMockProtocol();
      ({ offer, offerDates, offerDurations, offerFees } = await mockOffer());
      disputeResolutionTerms = new DisputeResolutionTerms("0", "0", "0", "0");
      await mockProtocol.mock.getMaxPremintedVouchers.returns(maxPremintedVouchers);
      await mockProtocol.mock.getOffer
        .withArgs(offerId)
        .returns(true, offer, offerDates, offerDurations, disputeResolutionTerms, offerFees);

      // reserve a range
      startId = "10";
      length = "1000";
      await bosonVoucher.connect(protocol).reserveRange(offerId, startId, length);

      // amount to mint
      amount = "5";
      await bosonVoucher.connect(operator).preMint(offerId, amount);

      // "void" the offer
      offer.voided = true;
      await mockProtocol.mock.getOffer
        .withArgs(offerId)
        .returns(true, offer, offerDates, offerDurations, disputeResolutionTerms, offerFees);
    });

    it("Should emit Transfer events", async function () {
      // Burn tokens, test for event
      const tx = await bosonVoucher.connect(operator).burnPremintedVouchers(offerId);

      // Number of events emitted should be equal to amount
      assert.equal((await tx.wait()).events.length, Number(amount), "Wrong number of events emitted");

      // Expect an event for every burn
      for (let i = 0; i < Number(amount); i++) {
        await expect(tx)
          .to.emit(bosonVoucher, "Transfer")
          .withArgs(operator.address, ethers.constants.AddressZero, i + Number(startId));
      }
    });

    it("Should update state", async function () {
      let sellerBalanceBefore = await bosonVoucher.balanceOf(operator.address);

      // Burn tokens
      await bosonVoucher.connect(operator).burnPremintedVouchers(offerId);

      // All burned tokens should not have an owner
      for (let i = 0; i < Number(amount); i++) {
        let tokenId = i + Number(startId);
        await expect(bosonVoucher.ownerOf(tokenId)).to.be.revertedWith(RevertReasons.ERC721_NON_EXISTENT);
      }

      // Seller's balance should be decreased for the total burn amount
      let sellerBalanceAfter = await bosonVoucher.balanceOf(operator.address);
      assert.equal(sellerBalanceAfter.toNumber(), sellerBalanceBefore.sub(amount).toNumber(), "Balance mismatch");

      // Get available premints from contract
      const availablePremints = await bosonVoucher.getAvailablePreMints(offerId);
      assert.equal(availablePremints.toNumber(), 0, "Available Premints mismatch");

      // Last burned id should be updated
      const range = new Range(offerId, startId, length, amount, `${Number(startId) + Number(amount) - 1}`);
      const returnedRange = Range.fromStruct(await bosonVoucher.getRangeByOfferId(offerId));
      assert.equal(returnedRange.toString(), range.toString(), "Range mismatch");
    });

    it("Should burn all vouchers if there is less than MaxPremintedVouchers to burn", async function () {
      // Burn tokens, test for event
      let tx = await bosonVoucher.connect(operator).burnPremintedVouchers(offerId);

      // Number of events emitted should be equal to amount
      assert.equal((await tx.wait()).events.length, Number(amount), "Wrong number of events emitted");

      // Last burned id should be updated
      const range = new Range(offerId, startId, length, amount, `${Number(startId) + Number(amount) - 1}`);
      const returnedRange = Range.fromStruct(await bosonVoucher.getRangeByOfferId(offerId));
      assert.equal(returnedRange.toString(), range.toString(), "Range mismatch");

      // Second call should revert since there's nothing to burn
      await expect(bosonVoucher.connect(operator).burnPremintedVouchers(offerId)).to.be.revertedWith(
        RevertReasons.NOTHING_TO_BURN
      );
    });

    it("Should burn only first MaxPremintedVouchers vouchers if there is more than MaxPremintedVouchers to burn", async function () {
      // make offer not voided so premint is possible
      offer.voided = false;
      await mockProtocol.mock.getOffer
        .withArgs(offerId)
        .returns(true, offer, offerDates, offerDurations, disputeResolutionTerms, offerFees);

      // Mint another 10 vouchers, so that there are 15 in total
      await bosonVoucher.connect(operator).preMint(offerId, 10);
      amount = `${Number(amount) + 10}`;

      // "void" the offer
      offer.voided = true;
      await mockProtocol.mock.getOffer
        .withArgs(offerId)
        .returns(true, offer, offerDates, offerDurations, disputeResolutionTerms, offerFees);

      // Burn tokens, test for event
      let tx = await bosonVoucher.connect(operator).burnPremintedVouchers(offerId);

      // Number of events emitted should be equal to maxPremintedVouchers
      assert.equal((await tx.wait()).events.length, Number(maxPremintedVouchers), "Wrong number of events emitted");

      // Last burned id should be updated
      let range = new Range(offerId, startId, length, amount, `${Number(startId) + Number(maxPremintedVouchers) - 1}`);
      let returnedRange = Range.fromStruct(await bosonVoucher.getRangeByOfferId(offerId));
      assert.equal(returnedRange.toString(), range.toString(), "Range mismatch");

      // Second call should burn the difference
      tx = await bosonVoucher.connect(operator).burnPremintedVouchers(offerId);

      // Number of events emitted should be equal to amount
      assert.equal(
        (await tx.wait()).events.length,
        Number(amount) - maxPremintedVouchers,
        "Wrong number of events emitted"
      );

      // Last burned id should be updated
      range = new Range(offerId, startId, length, amount, `${Number(startId) + Number(amount) - 1}`);
      returnedRange = Range.fromStruct(await bosonVoucher.getRangeByOfferId(offerId));
      assert.equal(returnedRange.toString(), range.toString(), "Range mismatch");

      // All burned tokens should not have an owner
      for (let i = 0; i < Number(amount); i++) {
        let tokenId = i + Number(startId);
        await expect(bosonVoucher.ownerOf(tokenId)).to.be.revertedWith(RevertReasons.ERC721_NON_EXISTENT);
      }

      // Second call should revert since there's nothing to burn
      await expect(bosonVoucher.connect(operator).burnPremintedVouchers(offerId)).to.be.revertedWith(
        RevertReasons.NOTHING_TO_BURN
      );
    });

    it("Should skip all vouchers were already commited", async function () {
      let commitedVouchers = [11, 14];

      // Transfer some preminted vouchers
      await mockProtocol.mock.commitToPreMintedOffer.returns();
      await Promise.all(
        commitedVouchers.map((tokenId) =>
          bosonVoucher.connect(operator).transferFrom(operator.address, buyer.address, tokenId)
        )
      );

      // Burn tokens, test for event
      let tx = await bosonVoucher.connect(operator).burnPremintedVouchers(offerId);

      // Number of events emitted should be equal to amount of preminted vouchers decreased by length of commited vouchers
      // We test this to inderectly verify that no events were emitted for commited vouchers
      assert.equal(
        (await tx.wait()).events.length,
        Number(amount) - commitedVouchers.length,
        "Wrong number of events emitted"
      );

      // All burned tokens should not have an owner, but commited ones should
      for (let i = 0; i < Number(amount); i++) {
        let tokenId = i + Number(startId);
        if (commitedVouchers.includes(tokenId)) {
          // Check that owner is buyer.
          expect(await bosonVoucher.ownerOf(tokenId)).to.equal(buyer.address);
        } else {
          // Check that Transfer event was emitted and owner does not exist anymore
          await expect(tx)
            .to.emit(bosonVoucher, "Transfer")
            .withArgs(operator.address, ethers.constants.AddressZero, i + Number(startId));
          await expect(bosonVoucher.ownerOf(tokenId)).to.be.revertedWith(RevertReasons.ERC721_NON_EXISTENT);
        }
      }

      // Last burned id should be updated
      const range = new Range(offerId, startId, length, amount, `${Number(startId) + Number(amount) - 1}`);
      const returnedRange = Range.fromStruct(await bosonVoucher.getRangeByOfferId(offerId));
      assert.equal(returnedRange.toString(), range.toString(), "Range mismatch");
    });

    it("Burning is possible if offer not voided, but just expired", async function () {
      // make offer not voided so premint is possible
      offer.voided = false;
      await mockProtocol.mock.getOffer
        .withArgs(offerId)
        .returns(true, offer, offerDates, offerDurations, disputeResolutionTerms, offerFees);
      // skip to after offer expiration
      await setNextBlockTimestamp(ethers.BigNumber.from(offerDates.validUntil).add(1).toHexString());

      // Burn tokens, test for event
      const tx = await bosonVoucher.connect(operator).burnPremintedVouchers(offerId);

      // Number of events emitted should be equal to amount
      assert.equal((await tx.wait()).events.length, Number(amount), "Wrong number of events emitted");

      // Expect an event for every burn
      for (let i = 0; i < Number(amount); i++) {
        await expect(tx)
          .to.emit(bosonVoucher, "Transfer")
          .withArgs(operator.address, ethers.constants.AddressZero, i + Number(startId));
      }
    });

    context("💔 Revert Reasons", async function () {
      it("Caller is not the owner", async function () {
        await expect(bosonVoucher.connect(rando).burnPremintedVouchers(offerId)).to.be.revertedWith(
          RevertReasons.OWNABLE_NOT_OWNER
        );
      });

      it("Offer id is not associated with a range", async function () {
        // Set invalid offer id
        offerId = 15;

        // Try to burn, it should fail
        await expect(bosonVoucher.connect(operator).burnPremintedVouchers(offerId)).to.be.revertedWith(
          RevertReasons.NO_RESERVED_RANGE_FOR_OFFER
        );
      });

      it("Offer is still valid", async function () {
        // make offer not voided
        offer.voided = false;
        await mockProtocol.mock.getOffer
          .withArgs(offerId)
          .returns(true, offer, offerDates, offerDurations, disputeResolutionTerms, offerFees);

        // Try to burn, it should fail
        await expect(bosonVoucher.connect(operator).burnPremintedVouchers(offerId)).to.be.revertedWith(
          RevertReasons.OFFER_STILL_VALID
        );
      });

      it("Nothing to burn", async function () {
        // Burn tokens
        await bosonVoucher.connect(operator).burnPremintedVouchers(offerId);

        // Try to burn, it should fail
        await expect(bosonVoucher.connect(operator).burnPremintedVouchers(offerId)).to.be.revertedWith(
          RevertReasons.NOTHING_TO_BURN
        );
      });
    });
  });

  context("getAvailablePreMints()", function () {
    let offerId, startId, length, amount;
    let offer, offerDates, offerDurations, offerFees;
    let disputeResolutionTerms;
    let mockProtocol;

    beforeEach(async function () {
      // reserve a range
      offerId = "5";
      startId = "10";
      length = "1000";
      await bosonVoucher.connect(protocol).reserveRange(offerId, startId, length);

      // amount to mint
      amount = 50;

      mockProtocol = await deployMockProtocol();
      ({ offer, offerDates, offerDurations, offerFees } = await mockOffer());
      disputeResolutionTerms = new DisputeResolutionTerms("0", "0", "0", "0");
      await mockProtocol.mock.getMaxPremintedVouchers.returns("1000");
      await mockProtocol.mock.getOffer.returns(
        true,
        offer,
        offerDates,
        offerDurations,
        disputeResolutionTerms,
        offerFees
      );
    });

    it("If nothing was preminted, return full range", async function () {
      // Get available premints from contract
      const availablePremints = await bosonVoucher.getAvailablePreMints(offerId);
      assert.equal(availablePremints.toString(), length, "Available Premints mismatch");
    });

    it("Part of range is preminted", async function () {
      // Premint tokens
      await bosonVoucher.connect(operator).preMint(offerId, amount);

      // Get available premints from contract
      let newAmount = Number(length) - Number(amount);
      let availablePremints = await bosonVoucher.getAvailablePreMints(offerId);
      assert.equal(availablePremints.toNumber(), newAmount, "Available Premints mismatch");

      // Premint again
      await bosonVoucher.connect(operator).preMint(offerId, amount);
      newAmount -= Number(amount);
      availablePremints = await bosonVoucher.getAvailablePreMints(offerId);
      assert.equal(availablePremints.toNumber(), newAmount, "Available Premints mismatch");
    });

    it("Range is fully minted", async function () {
      // Adjust config value
      await configHandler.connect(deployer).setMaxPremintedVouchers(length);

      // Premint tokens
      await bosonVoucher.connect(operator).preMint(offerId, length);

      // Get available premints from contract
      let availablePremints = await bosonVoucher.getAvailablePreMints(offerId);
      assert.equal(availablePremints.toNumber(), 0, "Available Premints mismatch");
    });

    it("Range for offer does not exist", async function () {
      // Set invalid offer id
      offerId = "20";

      // Get available premints from contract
      let availablePremints = await bosonVoucher.getAvailablePreMints(offerId);
      assert.equal(availablePremints.toNumber(), 0, "Available Premints mismatch");
    });

    it("Should be 0 if offer is voided", async function () {
      // void offer
      offer.voided = true;
      await mockProtocol.mock.getOffer.returns(
        true,
        offer,
        offerDates,
        offerDurations,
        disputeResolutionTerms,
        offerFees
      );

      // Get available premints from contract
      let availablePremints = await bosonVoucher.getAvailablePreMints(offerId);
      assert.equal(availablePremints.toNumber(), 0, "Available Premints mismatch");
    });

    it("Should be 0 if offer is expired", async function () {
      // Skip to after offer expiry
      await setNextBlockTimestamp(ethers.BigNumber.from(offerDates.validUntil).add(1).toHexString());

      // Get available premints from contract
      let availablePremints = await bosonVoucher.getAvailablePreMints(offerId);
      assert.equal(availablePremints.toNumber(), 0, "Available Premints mismatch");
    });
  });

  context("getRange()", function () {
    let offerId, startId, length, amount;
    let range;

    beforeEach(async function () {
      // reserve a range
      offerId = "5";
      startId = "10";
      length = "1000";

      range = new Range(offerId, startId, length, "0", "0");

      await bosonVoucher.connect(protocol).reserveRange(offerId, startId, length);

      const mockProtocol = await deployMockProtocol();
      const { offer, offerDates, offerDurations, offerFees } = await mockOffer();
      const disputeResolutionTerms = new DisputeResolutionTerms("0", "0", "0", "0");
      await mockProtocol.mock.getMaxPremintedVouchers.returns("1000");
      await mockProtocol.mock.getOffer.returns(
        true,
        offer,
        offerDates,
        offerDurations,
        disputeResolutionTerms,
        offerFees
      );

      // amount to premint
      amount = "50";
      range.minted = amount;
      await bosonVoucher.connect(operator).preMint(offerId, amount);
    });

    it("Get range object for offer with reserved range", async function () {
      // Get range object from contract
      const returnedRange = Range.fromStruct(await bosonVoucher.getRangeByOfferId(offerId));
      assert.equal(returnedRange.toString(), range.toString(), "Range mismatch");
    });

    it("Get empty range if offer has no reserved ranges", async function () {
      // Set invalid offer and empty range
      offerId = "20";
      range = new Range("0", "0", "0", "0", "0");

      // Get range object from contract
      const returnedRange = Range.fromStruct(await bosonVoucher.getRangeByOfferId(offerId));
      assert.equal(returnedRange.toString(), range.toString(), "Range mismatch");
    });
  });

  context("ownerOf()", function () {
    let offerId, startId, length, amount;
    let offer, offerDates, offerDurations, offerFees, disputeResolutionTerms;
    let mockProtocol;

    context("No preminted tokens", async function () {
      it("Returns true owner if token exists", async function () {
        let tokenId = "100000";
        // Issue ordinary voucher
        await bosonVoucher.connect(protocol).issueVoucher(tokenId, buyer.address);

        // Token owner should be the buyer
        let tokenOwner = await bosonVoucher.ownerOf(tokenId);
        assert.equal(tokenOwner, buyer.address, "Token owner mismatch");
      });

      context("💔 Revert Reasons", async function () {
        it("Token does not exist", async function () {
          let tokenId = "10";
          await expect(bosonVoucher.connect(rando).ownerOf(tokenId)).to.be.revertedWith(
            RevertReasons.ERC721_NON_EXISTENT
          );
        });
      });
    });

    context("With preminted tokens", async function () {
      beforeEach(async function () {
        // reserve a range
        offerId = "5";
        startId = "10";
        length = "150";
        await bosonVoucher.connect(protocol).reserveRange(offerId, startId, length);

        mockProtocol = await deployMockProtocol();
        ({ offer, offerDates, offerDurations, offerFees } = await mockOffer());
        disputeResolutionTerms = new DisputeResolutionTerms("0", "0", "0", "0");
        await mockProtocol.mock.getMaxPremintedVouchers.returns("1000");
        await mockProtocol.mock.getOffer.returns(
          true,
          offer,
          offerDates,
          offerDurations,
          disputeResolutionTerms,
          offerFees
        );

        // amount to premint
        amount = 50;
        await bosonVoucher.connect(operator).preMint(offerId, amount);
      });

      it("Returns true owner if token exists - via issue voucher", async function () {
        let tokenId = "100000";

        // Define what should be returned when getExchange is called
        await mockProtocol.mock.getExchange.withArgs(tokenId).returns(true, mockExchange({ offerId }), mockVoucher());

        // Issue ordinary voucher
        await bosonVoucher.connect(protocol).issueVoucher(tokenId, buyer.address);

        // Token owner should be the buyer
        let tokenOwner = await bosonVoucher.ownerOf(tokenId);
        assert.equal(tokenOwner, buyer.address, "Token owner mismatch");
      });

      it("Returns true owner if token exists - via preminted voucher transfer.", async function () {
        let tokenId = "25"; // tokens between 10 and 60 are preminted

        const mockProtocol = await deployMockProtocol();

        // Define what should be returned when commitToPreMintedOffer is called
        await mockProtocol.mock.commitToPreMintedOffer.returns();

        // Transfer preminted token
        await bosonVoucher.connect(operator).transferFrom(operator.address, buyer.address, tokenId);

        // Token owner should be the buyer
        let tokenOwner = await bosonVoucher.ownerOf(tokenId);
        assert.equal(tokenOwner, buyer.address, "Token owner mismatch");
      });

      it("Returns seller if token is preminted and not transferred yet", async function () {
        // Token owner should be the seller for all preminted tokens
        let startTokenId = Number(startId);
        let endTokenId = startTokenId + Number(amount);
        for (let i = startTokenId; i < endTokenId; i++) {
          let tokenOwner = await bosonVoucher.ownerOf(i);
          assert.equal(tokenOwner, operator.address, `Token owner mismatch ${i}`);
        }
      });

      it("Multiple ranges", async function () {
        // Add five more ranges
        // This tests more getPreMintStatus than ownerOf
        // Might even be put into integration tests
        // Adjust config value
        await configHandler.connect(deployer).setMaxPremintedVouchers("10000");
        let previousOfferId = Number(offerId);
        let previousStartId = Number(startId);
        let ranges = [new Range(offerId, Number(startId), length, amount, "0")];
        length = Number(length);

        for (let i = 0; i < 5; i++) {
          offerId = previousOfferId + (i + 1) * 6;
          startId = previousStartId + length + 100;

          // reserve length
          await bosonVoucher.connect(protocol).reserveRange(offerId, startId, length);

          // amount to premint
          amount = length - i * 30;
          await bosonVoucher.connect(operator).preMint(offerId, amount);
          ranges.push(new Range(offerId, startId, length, amount, "0"));

          previousStartId = startId;
          previousOfferId = offerId;
        }

        let endTokenId = previousStartId + length; // last range end
        let rangeIndex = 0;
        let currentRange = ranges[rangeIndex];
        let currentRangeMintEndId = currentRange.start + currentRange.minted - 1;
        let currentRangeEndId = currentRange.start + length - 1;

        for (let i = 0; i < endTokenId; i++) {
          if (i < currentRange.start) {
            // tokenId not in range
            await expect(bosonVoucher.connect(rando).ownerOf(i)).to.be.revertedWith(RevertReasons.ERC721_NON_EXISTENT);
          } else if (i <= currentRangeMintEndId) {
            // tokenId in range and minted. Seller should be the owner
            let tokenOwner = await bosonVoucher.ownerOf(i);
            assert.equal(tokenOwner, operator.address, `Token owner mismatch ${i}`);
          } else if (i <= currentRangeEndId) {
            // tokenId still in range, but not minted yet
            await expect(bosonVoucher.connect(rando).ownerOf(i)).to.be.revertedWith(RevertReasons.ERC721_NON_EXISTENT);
          } else {
            // tokenId outside the current range
            // Change current range
            if (rangeIndex < ranges.length) {
              currentRange = ranges[++rangeIndex];
              currentRangeMintEndId = currentRange.start + currentRange.minted - 1;
              currentRangeEndId = currentRange.start + currentRange.length - 1;
            }
            // Technically, next range could be consecutive and next call should return seller's address
            // But range construction in this test ensures gaps between ranges
            await expect(bosonVoucher.connect(rando).ownerOf(i)).to.be.revertedWith(RevertReasons.ERC721_NON_EXISTENT);
          }
        }
      });

      it("Consecutive ranges", async function () {
        // Make two consecutive ranges

        let nextOfferId = Number(offerId) + 1;
        let nextStartId = Number(startId) + Number(length);
        let nextLength = "10";
        let nextAmount = "5";

        // reserve length
        await bosonVoucher.connect(protocol).reserveRange(nextOfferId, nextStartId, nextLength);

        // amount to premint
        await bosonVoucher.connect(operator).preMint(nextOfferId, nextAmount);

        // First range - preminted tokens
        let startTokenId = Number(startId);
        let endTokenId = startTokenId + Number(amount);
        for (let i = startTokenId; i < endTokenId; i++) {
          let tokenOwner = await bosonVoucher.ownerOf(i);
          assert.equal(tokenOwner, operator.address, `Token owner mismatch ${i}`);
        }

        // First range - not preminted tokens
        startTokenId = Number(endTokenId);
        endTokenId = Number(startId) + Number(length);
        for (let i = startTokenId; i < endTokenId; i++) {
          await expect(bosonVoucher.connect(rando).ownerOf(i)).to.be.revertedWith(RevertReasons.ERC721_NON_EXISTENT);
        }

        // Second range - preminted tokens
        startTokenId = Number(endTokenId);
        endTokenId = startTokenId + Number(nextAmount);
        for (let i = startTokenId; i < endTokenId; i++) {
          let tokenOwner = await bosonVoucher.ownerOf(i);
          assert.equal(tokenOwner, operator.address, `Token owner mismatch ${i}`);
        }

        // First range - not preminted tokens
        startTokenId = Number(endTokenId);
        endTokenId = Number(startId) + Number(nextLength);
        for (let i = startTokenId; i < endTokenId; i++) {
          await expect(bosonVoucher.connect(rando).ownerOf(i)).to.be.revertedWith(RevertReasons.ERC721_NON_EXISTENT);
        }
      });

      context("💔 Revert Reasons", async function () {
        it("Token is outside any range and not minted", async function () {
          let tokenId = "200000";
          await expect(bosonVoucher.connect(rando).ownerOf(tokenId)).to.be.revertedWith(
            RevertReasons.ERC721_NON_EXISTENT
          );
        });

        it("Token is inside a range, but not minted yet", async function () {
          let startTokenId = Number(startId) + Number(amount);
          let endTokenId = Number(startId) + Number(length);

          // None of reserverd but not preminted tokens should have an owner
          for (let i = startTokenId; i < endTokenId; i++) {
            await expect(bosonVoucher.connect(rando).ownerOf(i)).to.be.revertedWith(RevertReasons.ERC721_NON_EXISTENT);
          }
        });

        it("Token was preminted, transferred and burned", async function () {
          let tokenId = "26";

          // Mock exchange handler methods (easier and more efficient than creating a real offer)
          const mockProtocol = await deployMockProtocol();

          // Define what should be returned when commitToPreMintedOffer is called
          await mockProtocol.mock.commitToPreMintedOffer.returns();

          // Token owner should be the seller
          let tokenOwner = await bosonVoucher.ownerOf(tokenId);
          assert.equal(tokenOwner, operator.address, "Token owner mismatch");

          // Transfer preminted token
          await bosonVoucher.connect(operator).transferFrom(operator.address, buyer.address, tokenId);

          // Token owner should be the buyer
          tokenOwner = await bosonVoucher.ownerOf(tokenId);
          assert.equal(tokenOwner, buyer.address, "Token owner mismatch");

          // Simulate burn
          await bosonVoucher.connect(protocol).burnVoucher(tokenId);

          // Token should have no owner
          await expect(bosonVoucher.connect(rando).ownerOf(tokenId)).to.be.revertedWith(
            RevertReasons.ERC721_NON_EXISTENT
          );
        });

        it("Token was preminted, not transferred and burned", async function () {
          let tokenId = "26";

          // Token owner should be the seller
          let tokenOwner = await bosonVoucher.ownerOf(tokenId);
          assert.equal(tokenOwner, operator.address, "Token owner mismatch");

          // Void the offer
          offer.voided = true;
          await mockProtocol.mock.getOffer.returns(
            true,
            offer,
            offerDates,
            offerDurations,
            disputeResolutionTerms,
            offerFees
          );

          // Burn preminted voucher
          await bosonVoucher.connect(operator).burnPremintedVouchers(offerId);

          // Token should have no owner
          await expect(bosonVoucher.connect(rando).ownerOf(tokenId)).to.be.revertedWith(
            RevertReasons.ERC721_NON_EXISTENT
          );
        });
      });
    });
  });

  context("Token transfers", function () {
    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    const transferFunctions = {
      "transferFrom()": {
        selector: "transferFrom(address,address,uint256)",
      },
      "safeTransferFrom()": {
        selector: "safeTransferFrom(address,address,uint256)",
      },
      "safeTransferFrom() with bytes": {
        selector: "safeTransferFrom(address,address,uint256,bytes)",
        additionalArgs: ["0x"],
      },
    };

    Object.keys(transferFunctions).forEach(function (transferFunction) {
      context(transferFunction, function () {
        let tokenId, offerId;
        let selector = transferFunctions[transferFunction].selector;
        let additionalArgs = transferFunctions[transferFunction].additionalArgs ?? [];

        beforeEach(async function () {
          seller = mockSeller(operator.address, admin.address, clerk.address, treasury.address);

          // Prepare the AuthToken and VoucherInitValues
          emptyAuthToken = mockAuthToken();
          voucherInitValues = mockVoucherInitValues();
          await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

          agentId = "0"; // agent id is optional while creating an offer

          // Create a valid dispute resolver
          disputeResolver = mockDisputeResolver(
            operatorDR.address,
            adminDR.address,
            clerkDR.address,
            treasuryDR.address,
            true
          );

          // Create DisputeResolverFee array so offer creation will succeed
          disputeResolverFees = [new DisputeResolverFee(ethers.constants.AddressZero, "Native", "0")];
          const sellerAllowList = [];

          // Register the dispute resolver
          await accountHandler
            .connect(adminDR)
            .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
        });

        context("Transfer of an actual voucher", async function () {
          beforeEach(async function () {
            // Create an offer
            const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
            await offerHandler
              .connect(operator)
              .createOffer(
                offer.toStruct(),
                offerDates.toStruct(),
                offerDurations.toStruct(),
                disputeResolverId,
                agentId
              );
            await fundsHandler
              .connect(admin)
              .depositFunds(seller.id, ethers.constants.AddressZero, offer.sellerDeposit, {
                value: offer.sellerDeposit,
              });
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offer.id, { value: offer.price });

            tokenId = offerId = "1";
            mockBuyer(); // call it just so accountId is correct

            // Update boson voucher address to actual seller's voucher
            const voucherAddress = calculateContractAddress(accountHandler.address, "1");
            bosonVoucher = await ethers.getContractAt("BosonVoucher", voucherAddress);
          });

          it("Should emit a Transfer event", async function () {
            await expect(
              bosonVoucher.connect(buyer)[selector](buyer.address, rando.address, tokenId, ...additionalArgs)
            )
              .to.emit(bosonVoucher, "Transfer")
              .withArgs(buyer.address, rando.address, tokenId);
          });

          it("Should update state", async function () {
            // Before transfer, buyer should be the owner
            let tokenOwner = await bosonVoucher.ownerOf(tokenId);
            assert.equal(tokenOwner, buyer.address, "Buyer is not the owner");

            await bosonVoucher.connect(buyer)[selector](buyer.address, rando.address, tokenId, ...additionalArgs);

            // After transfer, rando should be the owner
            tokenOwner = await bosonVoucher.ownerOf(tokenId);
            assert.equal(tokenOwner, rando.address, "Rando is not the owner");
          });

          it("Should call onVoucherTransferred", async function () {
            const randoBuyer = mockBuyer();
            await expect(
              bosonVoucher.connect(buyer)[selector](buyer.address, rando.address, tokenId, ...additionalArgs)
            )
              .to.emit(exchangeHandler, "VoucherTransferred")
              .withArgs(offerId, tokenId, randoBuyer.id, bosonVoucher.address);
          });

          it("Transfer on behalf of should work normally", async function () {
            // Approve another address to transfer the voucher
            await bosonVoucher.connect(buyer).setApprovalForAll(rando2.address, true);

            await expect(
              bosonVoucher.connect(rando2)[selector](buyer.address, rando.address, tokenId, ...additionalArgs)
            )
              .to.emit(bosonVoucher, "Transfer")
              .withArgs(buyer.address, rando.address, tokenId);
          });

          it("If seller is the true owner of voucher, transfer should work same as for others", async function () {
            mockBuyer(); // Call to properly update nextAccountId
            await bosonVoucher.connect(buyer)[selector](buyer.address, operator.address, tokenId, ...additionalArgs);

            const tx = await bosonVoucher
              .connect(operator)
              [selector](operator.address, rando.address, tokenId, ...additionalArgs);

            await expect(tx).to.emit(bosonVoucher, "Transfer").withArgs(operator.address, rando.address, tokenId);

            const randoBuyer = mockBuyer();

            await expect(tx)
              .to.emit(exchangeHandler, "VoucherTransferred")
              .withArgs(offerId, tokenId, randoBuyer.id, bosonVoucher.address);
          });

          context("💔 Revert Reasons", async function () {
            it("From does not own the voucher", async function () {
              await expect(
                bosonVoucher.connect(rando)[selector](operator.address, rando.address, tokenId, ...additionalArgs)
              ).to.be.revertedWith(RevertReasons.ERC721_CALLER_NOT_OWNER_OR_APPROVED);
            });
          });
        });

        context("Transfer of a preminted voucher", async function () {
          let voucherRedeemableFrom, voucherValid, offerValid;
          beforeEach(async function () {
            // Create preminted offer
            const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
            await offerHandler
              .connect(operator)
              .createOffer(
                offer.toStruct(),
                offerDates.toStruct(),
                offerDurations.toStruct(),
                disputeResolverId,
                agentId
              );
            await offerHandler.connect(operator).reserveRange(offer.id, offer.quantityAvailable);
            // Pool needs to cover both seller deposit and price
            const pool = ethers.BigNumber.from(offer.sellerDeposit).add(offer.price);
            await fundsHandler.connect(admin).depositFunds(seller.id, ethers.constants.AddressZero, pool, {
              value: pool,
            });

            // Store correct values
            voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
            voucherValid = offerDurations.voucherValid;
            offerValid = offerDates.validUntil;
            tokenId = offerId = "1";

            // Update boson voucher address to actual seller's voucher
            const voucherAddress = calculateContractAddress(accountHandler.address, "1");
            bosonVoucher = await ethers.getContractAt("BosonVoucher", voucherAddress);

            // amount to premint
            await bosonVoucher.connect(operator).preMint(offerId, offer.quantityAvailable);
          });

          it("Should emit a Transfer event", async function () {
            await expect(
              bosonVoucher.connect(operator)[selector](operator.address, rando.address, tokenId, ...additionalArgs)
            )
              .to.emit(bosonVoucher, "Transfer")
              .withArgs(operator.address, rando.address, tokenId);
          });

          it("Should update state", async function () {
            // Before transfer, seller should be the owner
            let tokenOwner = await bosonVoucher.ownerOf(tokenId);
            assert.equal(tokenOwner, operator.address, "Buyer is not the owner");

            await bosonVoucher.connect(operator)[selector](operator.address, rando.address, tokenId, ...additionalArgs);

            // After transfer, rando should be the owner
            tokenOwner = await bosonVoucher.ownerOf(tokenId);
            assert.equal(tokenOwner, rando.address, "Rando is not the owner");
          });

          it("Should call commitToPreMintedOffer", async function () {
            const randoBuyer = mockBuyer();
            const tx = await bosonVoucher
              .connect(operator)
              [selector](operator.address, rando.address, tokenId, ...additionalArgs);

            // Get the block timestamp of the confirmed tx
            const blockNumber = tx.blockNumber;
            const block = await ethers.provider.getBlock(blockNumber);

            // Prepare exchange and voucher for validation
            const exchange = mockExchange({ id: tokenId, offerId, buyerId: randoBuyer.id, finalizedDate: "0" });
            const voucher = mockVoucher({ redeemedDate: "0" });

            // Update the committed date in the expected exchange struct with the block timestamp of the tx
            voucher.committedDate = block.timestamp.toString();
            // Update the validUntilDate date in the expected exchange struct
            voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);
            // First transfer should call commitToPreMintedOffer
            await expect(tx)
              .to.emit(exchangeHandler, "BuyerCommitted")
              .withArgs(offerId, randoBuyer.id, tokenId, exchange.toStruct(), voucher.toStruct(), bosonVoucher.address);
          });

          it("Second transfer should behave as normal voucher transfer", async function () {
            // First transfer should call commitToPreMintedOffer, and not onVoucherTransferred
            let tx = await bosonVoucher
              .connect(operator)
              [selector](operator.address, rando.address, tokenId, ...additionalArgs);
            await expect(tx).to.emit(exchangeHandler, "BuyerCommitted");
            await expect(tx).to.not.emit(exchangeHandler, "VoucherTransferred");

            // Second transfer should call onVoucherTransferred, and not commitToPreMintedOffer
            tx = await bosonVoucher
              .connect(rando)
              [selector](rando.address, operator.address, tokenId, ...additionalArgs);
            await expect(tx).to.emit(exchangeHandler, "VoucherTransferred");
            await expect(tx).to.not.emit(exchangeHandler, "BuyerCommitted");

            // Next transfer should call onVoucherTransferred, and not commitToPreMintedOffer, even if seller is the owner
            tx = await bosonVoucher
              .connect(operator)
              [selector](operator.address, rando.address, tokenId, ...additionalArgs);
            await expect(tx).to.emit(exchangeHandler, "VoucherTransferred");
            await expect(tx).to.not.emit(exchangeHandler, "BuyerCommitted");
          });

          it("Transfer on behalf of should work normally", async function () {
            // Approve another address to transfer the voucher
            await bosonVoucher.connect(operator).setApprovalForAll(rando2.address, true);

            await expect(
              bosonVoucher.connect(rando2)[selector](operator.address, rando.address, tokenId, ...additionalArgs)
            )
              .to.emit(bosonVoucher, "Transfer")
              .withArgs(operator.address, rando.address, tokenId);
          });

          context("💔 Revert Reasons", async function () {
            it("Transfer preminted voucher, but from is not the contract owner", async function () {
              await expect(
                bosonVoucher.connect(rando)[selector](rando.address, buyer.address, tokenId, ...additionalArgs)
              ).to.be.revertedWith(RevertReasons.NO_SILENT_MINT_ALLOWED);
            });

            it("Cannot transfer preminted voucher twice", async function () {
              // Make first transfer
              await bosonVoucher
                .connect(operator)
                [selector](operator.address, buyer.address, tokenId, ...additionalArgs);

              // Second transfer should fail, since voucher has an owner
              await expect(
                bosonVoucher.connect(operator)[selector](operator.address, rando.address, tokenId, ...additionalArgs)
              ).to.be.revertedWith(RevertReasons.ERC721_CALLER_NOT_OWNER_OR_APPROVED);
            });

            it("Transfer preminted voucher, which was committed and burned already", async function () {
              await bosonVoucher
                .connect(operator)
                [selector](operator.address, buyer.address, tokenId, ...additionalArgs);

              // Redeem voucher, effectively burning it
              await setNextBlockTimestamp(ethers.BigNumber.from(voucherRedeemableFrom).toHexString());
              await exchangeHandler.connect(buyer).redeemVoucher(tokenId);

              // Transfer should fail, since voucher has been burned
              await expect(
                bosonVoucher.connect(operator)[selector](operator.address, rando.address, tokenId, ...additionalArgs)
              ).to.be.revertedWith(RevertReasons.ERC721_NON_EXISTENT);
            });

            it("Transfer preminted voucher, which was not committed but burned already", async function () {
              // Void offer
              await offerHandler.connect(operator).voidOffer(offerId);

              // Burn preminted vouchers
              await bosonVoucher.connect(operator).burnPremintedVouchers(offerId);

              // None of reserverd but not preminted tokens should have an owner
              await expect(
                bosonVoucher.connect(operator)[selector](operator.address, rando.address, tokenId, ...additionalArgs)
              ).to.be.revertedWith(RevertReasons.ERC721_NON_EXISTENT);
            });

            it("Transfer preminted voucher, where offer was voided", async function () {
              // Void offer
              await offerHandler.connect(operator).voidOffer(offerId);

              // Transfer should fail, since protocol reverts
              await expect(
                bosonVoucher.connect(operator)[selector](operator.address, rando.address, tokenId, ...additionalArgs)
              ).to.be.revertedWith(RevertReasons.OFFER_HAS_BEEN_VOIDED);
            });

            it("Transfer preminted voucher, where offer has expired", async function () {
              // Skip past offer expiry
              await setNextBlockTimestamp(ethers.BigNumber.from(offerValid).toHexString());

              // Transfer should fail, since protocol reverts
              await expect(
                bosonVoucher.connect(operator)[selector](operator.address, rando.address, tokenId, ...additionalArgs)
              ).to.be.revertedWith(RevertReasons.OFFER_HAS_EXPIRED);
            });
          });
        });
      });
    });
  });

  context("burnVoucher()", function () {
    after(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    it("should burn a voucher with success", async function () {
      const buyerStruct = mockBuyer(buyer.address).toStruct();
      const buyerWallet = buyerStruct[1];
      await bosonVoucher.connect(protocol).issueVoucher(0, buyerWallet);

      const balanceBefore = await bosonVoucher.balanceOf(buyer.address);

      await bosonVoucher.connect(protocol).burnVoucher(0);

      const balanceAfter = await bosonVoucher.balanceOf(buyer.address);

      expect(balanceBefore.sub(balanceAfter)).eq(1);
    });

    it("should revert if caller does not have PROTOCOL role", async function () {
      // Expect revert if random user attempts to burn voucher
      await expect(bosonVoucher.connect(rando).burnVoucher(0)).to.be.revertedWith(RevertReasons.ACCESS_DENIED);

      // Grant PROTOCOL role to random user address
      await accessController.grantRole(Role.PROTOCOL, rando.address);

      // Prepare to burn voucher as a random user
      const buyerStruct = mockBuyer(buyer.address).toStruct();
      const buyerWallet = buyerStruct[1];
      await bosonVoucher.connect(protocol).issueVoucher(0, buyerWallet);
      const balanceBefore = await bosonVoucher.balanceOf(buyer.address);

      //Attempt to burn voucher as a random user
      await bosonVoucher.connect(protocol).burnVoucher(0);
      const balanceAfter = await bosonVoucher.balanceOf(buyer.address);

      expect(balanceBefore.sub(balanceAfter)).eq(1);
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

    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    it("should return the correct tokenURI", async function () {
      const tokenURI = await bosonVoucher.tokenURI(1);
      expect(tokenURI).eq(metadataUri);
    });
  });

  context("transferOwnership()", function () {
    it("should emit OwnershipTransferred", async function () {
      const ownable = await ethers.getContractAt("OwnableUpgradeable", bosonVoucher.address);
      await expect(bosonVoucher.connect(protocol).transferOwnership(rando.address))
        .to.emit(ownable, "OwnershipTransferred")
        .withArgs(operator.address, rando.address);
    });

    it("should transfer ownership with success", async function () {
      await bosonVoucher.connect(protocol).transferOwnership(operator.address);

      const ownable = await ethers.getContractAt("OwnableUpgradeable", bosonVoucher.address);
      const owner = await ownable.owner();

      expect(owner).eq(operator.address, "Wrong owner");
    });

    context("💔 Revert Reasons", async function () {
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

      it("Transfering ownership to 0 is not allowed", async function () {
        // try to transfer ownership to address 0, should fail
        await expect(bosonVoucher.connect(protocol).transferOwnership(ethers.constants.AddressZero)).to.be.revertedWith(
          RevertReasons.OWNABLE_ZERO_ADDRESS
        );
      });
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

    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
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
        expectedRoyaltyAmount = applyPercentage(offerPrice, royaltyPercentage);

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

        it("should revert if royaltyPercentage is greater than max royalty percentage defined in the protocol", async function () {
          // Set royalty fee as 15% (protocol limit is 10%)
          royaltyPercentage = "1500"; //15%

          // royalty percentage too high, expectig revert
          await expect(bosonVoucher.connect(operator).setRoyaltyPercentage(royaltyPercentage)).to.be.revertedWith(
            RevertReasons.ROYALTY_FEE_INVALID
          );
        });
      });
    });

    context("getRoyaltyPercentage()", function () {
      it("should return the royalty fee percentage", async function () {
        // give ownership to operator
        await bosonVoucher.connect(protocol).transferOwnership(operator.address);

        royaltyPercentage = "1000"; //10%
        await bosonVoucher.connect(operator).setRoyaltyPercentage(royaltyPercentage);

        expect(await bosonVoucher.connect(rando).getRoyaltyPercentage()).to.equal(
          royaltyPercentage,
          "Invalid royalty percentage"
        );
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
        expectedRoyaltyAmount = applyPercentage(offerPrice, royaltyPercentage);

        assert.equal(receiver, expectedRecipient, "Recipient address is incorrect");
        assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");

        // Any random address can check the royalty info
        // Now, set royalty fee as 8%
        royaltyPercentage = "800"; //8%
        await bosonVoucher.connect(operator).setRoyaltyPercentage(royaltyPercentage);

        [receiver, royaltyAmount] = await bosonVoucher.connect(rando).royaltyInfo(exchangeId, offerPrice);

        // Expectations
        expectedRecipient = seller.treasury;
        expectedRoyaltyAmount = applyPercentage(offerPrice, royaltyPercentage);

        assert.equal(receiver, expectedRecipient, "Recipient address is incorrect");
        assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");
      });

      it("if exhanfe doesn't exist it should return 0 values", async function () {
        // Set royalty fee as 10%
        royaltyPercentage = "1000"; //10%
        await bosonVoucher.connect(operator).setRoyaltyPercentage(royaltyPercentage);

        // Set inexistentexchangeId
        exchangeId = "100000";
        const [receiver, royaltyAmount] = await bosonVoucher.connect(operator).royaltyInfo(exchangeId, offerPrice);

        // Receiver and amount should be 0
        assert.equal(receiver, ethers.constants.AddressZero, "Recipient address is incorrect");
        assert.equal(royaltyAmount.toNumber(), 0, "Royalty amount is incorrect");
      });
    });

    context("💔 Revert Reasons", async function () {
      it("should revert during create seller if royaltyPercentage is greater than max royalty percentage defined in the protocol", async function () {
        // create invalid voucherInitValues
        royaltyPercentage = "2000"; // 20%
        voucherInitValues = new VoucherInitValues("ContractURI", royaltyPercentage);

        // create another seller
        seller = mockSeller(rando.address, rando.address, rando.address, rando.address);
        seller.id = "2";

        // royalty percentage too high, expectig revert
        await expect(
          accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues)
        ).to.be.revertedWith(RevertReasons.ROYALTY_FEE_INVALID);
      });
    });
  });

  context("getSellerId()", function () {
    it("should return the seller id", async function () {
      // prepare the VoucherInitValues
      voucherInitValues = mockVoucherInitValues();
      expect(voucherInitValues.isValid()).is.true;

      // AuthToken
      emptyAuthToken = mockAuthToken();
      expect(emptyAuthToken.isValid()).is.true;

      seller = mockSeller(operator.address, admin.address, clerk.address, treasury.address);

      await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

      await bosonVoucher.connect(protocol).transferOwnership(operator.address);

      expect(await bosonVoucher.connect(rando).getSellerId()).to.equal(seller.id, "Invalid seller id returned");

      // Reset the accountId iterator
      accountId.next(true);
    });
  });

  async function deployMockProtocol() {
    const exchangeHandlerABI = exchangeHandler.interface.format(FormatTypes.json);
    const configHandlerABI = configHandler.interface.format(FormatTypes.json);
    const offerHandlerABI = offerHandler.interface.format(FormatTypes.json);
    const mockProtocol = await deployMockContract(deployer, [
      ...JSON.parse(exchangeHandlerABI),
      ...JSON.parse(configHandlerABI),
      ...JSON.parse(offerHandlerABI),
    ]); //deploys mock

    // Update protocol address on beacon
    await beacon.connect(deployer).setProtocolAddress(mockProtocol.address);

    await mockProtocol.mock.getAccessControllerAddress.returns(accessController.address);

    return mockProtocol;
  }
});
