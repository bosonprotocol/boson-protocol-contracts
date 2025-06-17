const { ethers } = require("hardhat");
const { assert, expect } = require("chai");
const { ZeroAddress, getSigners, getContractAt, getContractFactory, provider, parseUnits, MaxUint256 } = ethers;

const { getInterfaceIds } = require("../../../scripts/config/supported-interfaces.js");
const Role = require("../../../scripts/domain/Role");
const { DisputeResolverFee } = require("../../../scripts/domain/DisputeResolverFee");
const Range = require("../../../scripts/domain/Range");
const { RoyaltyInfo } = require("../../../scripts/domain/RoyaltyInfo");
const { RoyaltyRecipientInfo, RoyaltyRecipientInfoList } = require("../../../scripts/domain/RoyaltyRecipientInfo.js");
const { Funds, FundsList } = require("../../../scripts/domain/Funds");
const PriceType = require("../../../scripts/domain/PriceType");
const { RevertReasons } = require("../../../scripts/config/revert-reasons");
const {
  mockDisputeResolver,
  mockSeller,
  mockVoucherInitValues,
  mockAuthToken,
  mockBuyer,
  accountId,
  mockVoucher,
  mockExchange,
  mockOffer,
} = require("../../util/mock");
const {
  applyPercentage,
  calculateCloneAddress,
  calculateBosonProxyAddress,
  calculateVoucherExpiry,
  setNextBlockTimestamp,
  setupTestEnvironment,
  getSnapshot,
  revertToSnapshot,
  prepareDataSignatureParameters,
  getEvent,
  deriveTokenId,
} = require("../../util/utils.js");
const { deployMockTokens } = require("../../../scripts/util/deploy-mock-tokens");

describe("IBosonVoucher", function () {
  let interfaceIds;
  let accessController;
  let bosonVoucher, offerHandler, accountHandler, exchangeHandler, fundsHandler, configHandler;
  let deployer,
    protocol,
    buyer,
    rando,
    rando2,
    assistant,
    admin,
    treasury,
    assistantDR,
    adminDR,
    treasuryDR,
    seller,
    foreign20,
    buyerContract,
    buyerContract2;
  let disputeResolver, disputeResolverFees;
  let emptyAuthToken;
  let voucherInitValues, contractURI, royaltyPercentage, exchangeId, offerPrice;
  let forwarder;
  let snapshotId;
  let beaconProxyAddress;
  let agentId;
  let offerFeeLimit;
  let bosonErrors;

  before(async function () {
    accountId.next(true);
    agentId = "0"; // agent id is optional while creating an offer
    offerFeeLimit = MaxUint256; // unlimited offer fee to not affect the tests

    // Get interface id
    const { IBosonVoucher, IERC721, IERC2981 } = await getInterfaceIds();
    interfaceIds = { IBosonVoucher, IERC721, IERC2981 };

    // Mock forwarder to test metatx
    const MockForwarder = await getContractFactory("MockForwarder");

    forwarder = await MockForwarder.deploy();

    // Specify contracts needed for this test
    const contracts = {
      accountHandler: "IBosonAccountHandler",
      offerHandler: "IBosonOfferHandler",
      exchangeHandler: "IBosonExchangeHandler",
      fundsHandler: "IBosonFundsHandler",
      configHandler: "IBosonConfigHandler",
    };

    let bosonClientBeacon;
    ({
      signers: [protocol, buyer, rando, rando2, admin, treasury, adminDR, treasuryDR],
      contractInstances: { accountHandler, offerHandler, exchangeHandler, fundsHandler, configHandler },
      extraReturnValues: { accessController, beacon: bosonClientBeacon },
    } = await setupTestEnvironment(contracts, {
      forwarderAddress: [await forwarder.getAddress()],
    }));

    bosonErrors = await getContractAt("BosonErrors", await accountHandler.getAddress());

    // make all account the same
    assistant = admin;
    assistantDR = adminDR;
    [deployer] = await getSigners();

    // Grant protocol role to eoa so it's easier to test
    await accessController.grantRole(Role.PROTOCOL, await protocol.getAddress());

    // Initialize voucher contract
    const bosonVoucherProxyAddress = await calculateBosonProxyAddress(await accountHandler.getAddress());
    bosonVoucher = await getContractAt("IBosonVoucher", bosonVoucherProxyAddress);

    const clientProxy = await getContractAt("BeaconClientProxy", bosonVoucherProxyAddress);
    await clientProxy.initialize(await bosonClientBeacon.getAddress());

    // prepare the VoucherInitValues
    const sellerId = 1;
    voucherInitValues = mockVoucherInitValues();
    const bosonVoucherInit = await getContractAt("BosonVoucher", bosonVoucherProxyAddress);
    await bosonVoucherInit.initializeVoucher(sellerId, "1", await assistant.getAddress(), voucherInitValues);

    [foreign20, buyerContract, buyerContract2] = await deployMockTokens([
      "Foreign20",
      "BuyerContract",
      "BuyerContract",
    ]);

    // Get the beacon proxy address
    beaconProxyAddress = await calculateBosonProxyAddress(await accountHandler.getAddress());

    // Get snapshot id
    snapshotId = await getSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();

    // Reset
    accountId.next(true);
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

  context("General", async function () {
    it("Contract can receive native token", async function () {
      const balanceBefore = await provider.getBalance(await bosonVoucher.getAddress());

      const amount = parseUnits("1", "ether");

      await admin.sendTransaction({ to: await bosonVoucher.getAddress(), value: amount });

      const balanceAfter = await provider.getBalance(await bosonVoucher.getAddress());
      expect(balanceAfter - balanceBefore).to.eq(amount);
    });

    it("Cannot initialize voucher twice", async function () {
      const initalizableClone = await ethers.getContractAt(
        "IInitializableVoucherClone",
        await bosonVoucher.getAddress()
      );
      await expect(
        initalizableClone.initializeVoucher(2, "1", await assistant.getAddress(), voucherInitValues)
      ).to.be.revertedWith(RevertReasons.INITIALIZABLE_ALREADY_INITIALIZED);
    });
  });

  context("Tests with an actual protocol offer", async function () {
    let offer, offerDates, offerDurations, disputeResolverId;
    let priceDiscoveryOffer;

    before(async function () {
      const bosonVoucherCloneAddress = calculateCloneAddress(
        await accountHandler.getAddress(),
        beaconProxyAddress,
        admin.address
      );
      bosonVoucher = await getContractAt("IBosonVoucher", bosonVoucherCloneAddress);

      seller = mockSeller(
        await assistant.getAddress(),
        await admin.getAddress(),
        ZeroAddress,
        await treasury.getAddress()
      );

      // Prepare the AuthToken and VoucherInitValues
      emptyAuthToken = mockAuthToken();
      voucherInitValues = mockVoucherInitValues();
      await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

      // Create a valid dispute resolver
      disputeResolver = mockDisputeResolver(
        await assistantDR.getAddress(),
        await adminDR.getAddress(),
        ZeroAddress,
        await treasuryDR.getAddress(),
        true
      );

      // Create DisputeResolverFee array so offer creation will succeed
      disputeResolverFees = [new DisputeResolverFee(ZeroAddress, "Native", "0")];
      const sellerAllowList = [];

      // Register the dispute resolver
      await accountHandler
        .connect(adminDR)
        .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

      ({ offer, offerDates, offerDurations, disputeResolverId } = await mockOffer());
      offer.quantityAvailable = "1000";

      await offerHandler
        .connect(assistant)
        .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId, offerFeeLimit);

      const amount = BigInt(offer.sellerDeposit) * BigInt(offer.quantityAvailable);

      await fundsHandler.connect(admin).depositFunds(seller.id, ZeroAddress, amount, {
        value: amount,
      });

      priceDiscoveryOffer = offer.clone();
      priceDiscoveryOffer.id = "2";
      priceDiscoveryOffer.priceType = PriceType.Discovery;
      priceDiscoveryOffer.price = "0";
      priceDiscoveryOffer.sellerDeposit = "0";
      priceDiscoveryOffer.buyerCancelPenalty = "0";
      await offerHandler
        .connect(assistant)
        .createOffer(priceDiscoveryOffer, offerDates, offerDurations, disputeResolverId, agentId, offerFeeLimit);

      // Get snapshot id
      snapshotId = await getSnapshot();
    });

    context("issueVoucher()", function () {
      let buyerStruct;
      let buyerWallet;

      before(async function () {
        buyerStruct = mockBuyer(await buyer.getAddress()).toStruct();
        buyerWallet = buyerStruct[1];
      });

      it("should issue a voucher with success", async function () {
        const balanceBefore = await bosonVoucher.balanceOf(await buyer.getAddress());
        await bosonVoucher.connect(protocol).issueVoucher(0, buyerWallet);

        const balanceAfter = await bosonVoucher.balanceOf(await buyer.getAddress());

        expect(balanceAfter - balanceBefore).eq(1);
      });

      it("should issue a voucher if it does not overlap with range", async function () {
        const offerId = "1";
        const start = "10";
        const length = "123";
        const tokenId = deriveTokenId(offerId, start); // token within reserved range

        // Reserve a range
        await bosonVoucher.connect(protocol).reserveRange(offerId, start, length, await assistant.getAddress());

        // Token id just below the range
        await expect(() =>
          bosonVoucher.connect(protocol).issueVoucher(tokenId - 1n, buyerWallet)
        ).to.changeTokenBalance(bosonVoucher, buyer, 1);

        // Token id just above the range
        await expect(() =>
          bosonVoucher.connect(protocol).issueVoucher(tokenId + BigInt(length), buyerWallet)
        ).to.changeTokenBalance(bosonVoucher, buyer, 1);
      });

      context("💔 Revert Reasons", async function () {
        it("should revert if caller does not have PROTOCOL role", async function () {
          // Expect revert if random user attempts to issue voucher
          await expect(bosonVoucher.connect(rando).issueVoucher(0, buyerWallet)).to.be.revertedWithCustomError(
            bosonErrors,
            RevertReasons.ACCESS_DENIED
          );

          // Grant PROTOCOL role to random user address
          await accessController.grantRole(Role.PROTOCOL, await rando.getAddress());

          // Attempt to issue voucher again as a random user
          const balanceBefore = await bosonVoucher.balanceOf(await buyer.getAddress());
          await bosonVoucher.connect(rando).issueVoucher(0, buyerWallet);
          const balanceAfter = await bosonVoucher.balanceOf(await buyer.getAddress());

          expect(balanceAfter - balanceBefore).eq(1);
        });

        it("issueVoucher should revert if exchange id falls within a pre-minted offer's range", async function () {
          const offerId = "1";
          const start = "10";
          const length = "123";
          const tokenId = deriveTokenId(offerId, "15"); // token within reserved range

          // Reserve a range
          await bosonVoucher.connect(protocol).reserveRange(offerId, start, length, await assistant.getAddress());

          // Expect revert if random user attempts to issue voucher
          await expect(bosonVoucher.connect(protocol).issueVoucher(tokenId, buyerWallet)).to.be.revertedWithCustomError(
            bosonErrors,
            RevertReasons.EXCHANGE_ID_IN_RESERVED_RANGE
          );
        });
      });
    });

    context("reserveRange()", function () {
      let offerId, start, length;
      let range;

      beforeEach(async function () {
        offerId = "1";
        start = "10";
        length = "123";

        const tokenStartId = deriveTokenId(offerId, start);
        range = new Range(tokenStartId.toString(), length, "0", "0", await assistant.getAddress());
      });

      it("Should emit event RangeReserved", async function () {
        // Reserve range, test for event
        await expect(bosonVoucher.connect(protocol).reserveRange(offerId, start, length, await assistant.getAddress()))
          .to.emit(bosonVoucher, "RangeReserved")
          .withArgs(offerId, range.toStruct());
      });

      it("Should update state", async function () {
        // Reserve range
        await bosonVoucher.connect(protocol).reserveRange(offerId, start, length, await assistant.getAddress());

        // Get range object from contract
        const returnedRange = Range.fromStruct(await bosonVoucher.getRangeByOfferId(offerId));
        assert.equal(returnedRange.toString(), range.toString(), "Range mismatch");

        // Get available premints from contract
        const availablePremints = await bosonVoucher.getAvailablePreMints(offerId);
        assert.equal(availablePremints.toString(), length, "Available Premints mismatch");
      });

      context("Owner range is contract", async function () {
        beforeEach(async function () {
          range.owner = await bosonVoucher.getAddress();
        });

        it("Should emit event RangeReserved", async function () {
          // Reserve range, test for event
          await expect(
            bosonVoucher.connect(protocol).reserveRange(offerId, start, length, await bosonVoucher.getAddress())
          )
            .to.emit(bosonVoucher, "RangeReserved")
            .withArgs(offerId, range.toStruct());
        });

        it("Should update state", async function () {
          // Reserve range
          await bosonVoucher.connect(protocol).reserveRange(offerId, start, length, await bosonVoucher.getAddress());

          // Get range object from contract
          const returnedRange = Range.fromStruct(await bosonVoucher.getRangeByOfferId(offerId));
          assert.equal(returnedRange.toString(), range.toString(), "Range mismatch");

          // Get available premints from contract
          const availablePremints = await bosonVoucher.getAvailablePreMints(offerId);
          assert.equal(availablePremints.toString(), length, "Available Premints mismatch");
        });
      });

      context("💔 Revert Reasons", async function () {
        it("caller does not have PROTOCOL role", async function () {
          await expect(
            bosonVoucher.connect(rando).reserveRange(offerId, start, length, await assistant.getAddress())
          ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.ACCESS_DENIED);
        });

        it("Start id is not greater than zero for the first range", async function () {
          // Set start id to 0
          start = 0;

          // Try to reserve range, it should fail
          await expect(
            bosonVoucher.connect(protocol).reserveRange(offerId, start, length, await assistant.getAddress())
          ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_RANGE_START);
        });

        it("Range length is zero", async function () {
          // Set length to 0
          length = "0";

          // Try to reserve range, it should fail
          await expect(
            bosonVoucher.connect(protocol).reserveRange(offerId, start, length, await assistant.getAddress())
          ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_RANGE_LENGTH);
        });

        it("Range length is too large, i.e., would cause an overflow", async function () {
          // Set such numbers that would cause an overflow
          start = MaxUint256 / 2n + 2n;
          length = MaxUint256 / 2n;

          // Try to reserve range, it should fail
          await expect(
            bosonVoucher.connect(protocol).reserveRange(offerId, start, length, await assistant.getAddress())
          ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_RANGE_LENGTH);
        });

        it("Offer id is already associated with a range", async function () {
          // Reserve range for an offer
          await bosonVoucher.connect(protocol).reserveRange(offerId, start, length, await assistant.getAddress());

          start = Number(start) + Number(length) + 1;

          // Try to reserve range for the same offer, it should fail
          await expect(
            bosonVoucher.connect(protocol).reserveRange(offerId, start, length, await assistant.getAddress())
          ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_RANGE_ALREADY_RESERVED);
        });

        it("_to address isn't contract address or contract owner address", async function () {
          // Try to reserve range for rando address, it should fail
          await expect(
            bosonVoucher.connect(protocol).reserveRange(offerId, start, length, await rando.getAddress())
          ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_TO_ADDRESS);
        });
      });
    });

    context("preMint()", function () {
      let offerId, start, length, amount;

      beforeEach(async function () {
        // reserve a range
        offerId = "1";
        start = 10;
        length = "990";
        await bosonVoucher.connect(protocol).reserveRange(offerId, start, length, await assistant.getAddress());

        // amount to mint
        amount = "50";
      });

      it("Should emit Transfer events", async function () {
        // Premint tokens, test for event
        const tx = await bosonVoucher.connect(assistant).preMint(offerId, amount);

        // Expect an event for every mint
        start = deriveTokenId(offerId, start);
        for (let i = 0; i < Number(amount); i++) {
          await expect(tx)
            .to.emit(bosonVoucher, "Transfer")
            .withArgs(ZeroAddress, await assistant.getAddress(), start + BigInt(i));
        }
      });

      it("Should emit VouchersPreMinted event", async function () {
        // Premint tokens, test for event
        const tx = await bosonVoucher.connect(assistant).preMint(offerId, amount);

        start = deriveTokenId(offerId, start);

        await expect(tx)
          .to.emit(bosonVoucher, "VouchersPreMinted")
          .withArgs(offerId, start, start + BigInt(amount) - 1n);
      });

      context("Owner range is contract", async function () {
        beforeEach(async function () {
          offer.id = offerId = ++offerId;

          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId, offerFeeLimit);

          // reserve a range
          start = "1010";
          length = "1000";
          await bosonVoucher.connect(protocol).reserveRange(offerId, start, length, await bosonVoucher.getAddress());
        });

        it("Transfer event should emit contract address", async function () {
          // Premint tokens, test for event
          const tx = await bosonVoucher.connect(assistant).preMint(offerId, amount);

          // Expect an event for every mint
          start = deriveTokenId(offerId, start);
          for (let i = 0; i < Number(amount); i++) {
            await expect(tx)
              .to.emit(bosonVoucher, "Transfer")
              .withArgs(ZeroAddress, await bosonVoucher.getAddress(), start + BigInt(i));
          }
        });

        it("Should update state", async function () {
          let contractBalanceBefore = await bosonVoucher.balanceOf(await bosonVoucher.getAddress());

          // Premint tokens
          await bosonVoucher.connect(assistant).preMint(offerId, amount);

          // Expect a correct owner for all preminted tokens
          start = deriveTokenId(offerId, start);
          for (let i = 0; i < Number(amount); i++) {
            let tokenId = start + BigInt(i);
            let tokenOwner = await bosonVoucher.ownerOf(tokenId);
            assert.equal(tokenOwner, await bosonVoucher.getAddress(), `Wrong token owner for token ${tokenId}`);
          }

          // Token that is inside a range, but wasn't preminted yet should not have an owner
          await expect(bosonVoucher.ownerOf(start + amount + 1)).to.be.revertedWith(
            RevertReasons.ERC721_INVALID_TOKEN_ID
          );

          // Contract's balance should be updated for the total mint amount
          let contractBalanceAfter = await bosonVoucher.balanceOf(await bosonVoucher.getAddress());
          assert.equal(contractBalanceAfter, contractBalanceBefore + BigInt(amount), "Balance mismatch");

          // Get available premints from contract
          const availablePremints = await bosonVoucher.getAvailablePreMints(offerId);
          assert.equal(availablePremints, BigInt(length) - BigInt(amount), "Available Premints mismatch");
        });
      });

      it("Should update state", async function () {
        let sellerBalanceBefore = await bosonVoucher.balanceOf(await assistant.getAddress());

        // Premint tokens
        await bosonVoucher.connect(assistant).preMint(offerId, amount);

        // Expect a correct owner for all preminted tokens
        start = deriveTokenId(offerId, start);
        for (let i = 0; i < Number(amount); i++) {
          let tokenId = start + BigInt(i);
          let tokenOwner = await bosonVoucher.ownerOf(tokenId);
          assert.equal(tokenOwner, await assistant.getAddress(), `Wrong token owner for token ${tokenId}`);
        }

        // Token that is inside a range, but wasn't preminted yet should not have an owner
        await expect(bosonVoucher.ownerOf(start + BigInt(amount) + 1n)).to.be.revertedWith(
          RevertReasons.ERC721_INVALID_TOKEN_ID
        );

        // Seller's balance should be updated for the total mint amount
        let sellerBalanceAfter = await bosonVoucher.balanceOf(await assistant.getAddress());
        assert.equal(sellerBalanceAfter, sellerBalanceBefore + BigInt(amount), "Balance mismatch");

        // Get available premints from contract
        const availablePremints = await bosonVoucher.getAvailablePreMints(offerId);
        assert.equal(availablePremints, BigInt(length) - BigInt(amount), "Available Premints mismatch");
      });

      it("MetaTx: forwarder can execute preMint on behalf of seller", async function () {
        const nonce = Number(await forwarder.getNonce(await assistant.getAddress()));

        const types = {
          ForwardRequest: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "nonce", type: "uint256" },
            { name: "data", type: "bytes" },
          ],
        };

        const functionSignature = bosonVoucher.interface.encodeFunctionData("preMint", [offerId, amount]);

        const message = {
          from: await assistant.getAddress(),
          to: await bosonVoucher.getAddress(),
          nonce: nonce,
          data: functionSignature,
        };

        const { signature } = await prepareDataSignatureParameters(
          assistant,
          types,
          "ForwardRequest",
          message,
          await forwarder.getAddress(),
          "MockForwarder",
          "0.0.1",
          "0Z"
        );

        const tx = await forwarder.execute(message, signature);

        // Expect an event for every mint
        start = deriveTokenId(offerId, start);
        for (let i = 0; i < Number(amount); i++) {
          await expect(tx)
            .to.emit(bosonVoucher, "Transfer")
            .withArgs(ZeroAddress, await assistant.getAddress(), start + BigInt(i));
        }
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
          await expect(bosonVoucher.connect(assistant).preMint(offerId, amount)).to.be.revertedWithCustomError(
            bosonErrors,
            RevertReasons.NO_RESERVED_RANGE_FOR_OFFER
          );
        });

        it("Amount to mint is more than remaining un-minted in range", async function () {
          // Mint 50 tokens
          await bosonVoucher.connect(assistant).preMint(offerId, amount);

          // Set invalid amount
          amount = "990"; // length is 1000, already minted 50

          // Try to premint, it should fail
          await expect(bosonVoucher.connect(assistant).preMint(offerId, amount)).to.be.revertedWithCustomError(
            bosonErrors,
            RevertReasons.INVALID_AMOUNT_TO_MINT
          );
        });

        it("Offer already expired", async function () {
          // Skip to after offer expiration
          await setNextBlockTimestamp(Number(BigInt(offerDates.validUntil) + 1n));

          // Try to premint, it should fail
          await expect(bosonVoucher.connect(assistant).preMint(offerId, amount)).to.be.revertedWithCustomError(
            bosonErrors,
            RevertReasons.OFFER_EXPIRED_OR_VOIDED
          );
        });

        it("Offer is voided", async function () {
          await offerHandler.connect(assistant).voidOffer(offerId);

          // Try to premint, it should fail
          await expect(bosonVoucher.connect(assistant).preMint(offerId, amount)).to.be.revertedWithCustomError(
            bosonErrors,
            RevertReasons.OFFER_EXPIRED_OR_VOIDED
          );
        });
      });
    });

    context("burnPremintedVouchers()", function () {
      let offerId, start, length, amount;

      beforeEach(async function () {
        offerId = "1";

        // reserve a range
        start = "1";
        length = "1000";

        await bosonVoucher.connect(protocol).reserveRange(offerId, start, length, await assistant.getAddress());

        // amount to mint
        amount = "5";
        await bosonVoucher.connect(assistant).preMint(offerId, amount);

        // Void offer
        await offerHandler.connect(assistant).voidOffer(offerId);
      });

      it("Should emit Transfer events", async function () {
        // Burn tokens, test for event
        const tx = await bosonVoucher.connect(assistant).burnPremintedVouchers(offerId, amount);

        // Expect an event for every burn
        start = deriveTokenId(offerId, start);
        for (let i = 0; i < Number(amount); i++) {
          await expect(tx)
            .to.emit(bosonVoucher, "Transfer")
            .withArgs(await assistant.getAddress(), ZeroAddress, start + BigInt(i));
        }
      });

      it("Should update state", async function () {
        let sellerBalanceBefore = await bosonVoucher.balanceOf(await assistant.getAddress());

        // Burn tokens
        await bosonVoucher.connect(assistant).burnPremintedVouchers(offerId, amount);

        // All burned tokens should not have an owner
        const startId = deriveTokenId(offerId, start);
        for (let i = 0; i < Number(amount); i++) {
          let tokenId = startId + BigInt(i);
          await expect(bosonVoucher.ownerOf(tokenId)).to.be.revertedWith(RevertReasons.ERC721_INVALID_TOKEN_ID);
        }

        // Seller's balance should be decreased for the total burn amount
        let sellerBalanceAfter = await bosonVoucher.balanceOf(await assistant.getAddress());
        assert.equal(sellerBalanceAfter, sellerBalanceBefore - BigInt(amount), "Balance mismatch");

        // Get available premints from contract
        const availablePremints = await bosonVoucher.getAvailablePreMints(offerId);
        assert.equal(availablePremints, 0n, "Available Premints mismatch");

        // Last burned id should be updated
        const tokenIdStart = deriveTokenId(offerId, start);
        const lastBurnedId = tokenIdStart + BigInt(amount) - 1n;
        const range = new Range(
          tokenIdStart.toString(),
          length,
          amount,
          lastBurnedId.toString(),
          await assistant.getAddress()
        );
        const returnedRange = Range.fromStruct(await bosonVoucher.getRangeByOfferId(offerId));
        assert.equal(returnedRange.toString(), range.toString(), "Range mismatch");
      });

      context("Contract owner is not owner of preminted vouchers", function () {
        it("Ownership is transferred", async function () {
          // Transfer ownership to rando
          await bosonVoucher.connect(protocol).transferOwnership(await rando.getAddress());

          // Burn tokens, test for event
          let tx;
          await expect(() => {
            tx = bosonVoucher.connect(rando).burnPremintedVouchers(offerId, amount);
            return tx;
          }).to.changeTokenBalance(bosonVoucher, assistant, BigInt(amount) * -1n);

          // Expect an event for every burn, where owner is the old owner (assistant)
          const tokenIdStart = deriveTokenId(offerId, start);
          for (let i = 0; i < Number(amount); i++) {
            await expect(tx)
              .to.emit(bosonVoucher, "Transfer")
              .withArgs(await assistant.getAddress(), ZeroAddress, tokenIdStart + BigInt(i));
          }
        });

        it("Contract itself is the owner", async function () {
          offer.id = offerId = ++offerId;
          offer.quantityAvailable = "2000";

          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId, offerFeeLimit);

          // reserve a range
          start = "2000";
          await bosonVoucher.connect(protocol).reserveRange(offerId, start, length, await bosonVoucher.getAddress());

          // amount to mint
          amount = "10";
          await bosonVoucher.connect(assistant).preMint(offerId, amount);

          await offerHandler.connect(assistant).voidOffer(offerId);

          // Burn tokens, test for event
          let tx;
          await expect(() => {
            tx = bosonVoucher.connect(assistant).burnPremintedVouchers(offerId, amount);
            return tx;
          }).to.changeTokenBalance(bosonVoucher, bosonVoucher, BigInt(amount) * -1n);

          // Expect an event for every burn
          const tokenIdStart = deriveTokenId(offerId, start);
          for (let i = 0; i < Number(amount); i++) {
            await expect(tx)
              .to.emit(bosonVoucher, "Transfer")
              .withArgs(await bosonVoucher.getAddress(), ZeroAddress, tokenIdStart + BigInt(i));
          }
        });
      });

      it("Should burn all vouchers if there is less than MaxPremintedVouchers to burn", async function () {
        // Burn tokens, test for event
        let tx = await bosonVoucher.connect(assistant).burnPremintedVouchers(offerId, amount);

        // Number of events emitted should be equal to amount
        assert.equal((await tx.wait()).logs.length, Number(amount), "Wrong number of events emitted");

        // Last burned id should be updated
        const tokenIdStart = deriveTokenId(offerId, start);
        const lastBurnedId = tokenIdStart + BigInt(amount) - 1n;
        const range = new Range(tokenIdStart.toString(), length, amount, lastBurnedId.toString(), assistant.address);
        const returnedRange = Range.fromStruct(await bosonVoucher.getRangeByOfferId(offerId));
        assert.equal(returnedRange.toString(), range.toString(), "Range mismatch");

        // Second call should revert since there's nothing to burn
        await expect(
          bosonVoucher.connect(assistant).burnPremintedVouchers(offerId, amount)
        ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.AMOUNT_EXCEEDS_RANGE_OR_NOTHING_TO_BURN);
      });

      context("Test that require non-voided offer", function () {
        let assistantAddress;

        beforeEach(async function () {
          // make offer not voided so premint is possible
          offer.voided = false;
          // make offer not voided
          offer.id = offerId = "3"; // Two offers are created in beforeAll
          length = amount = "10";
          start = "1";

          assistantAddress = await assistant.getAddress();
          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId, offerFeeLimit);
          await offerHandler.connect(assistant).reserveRange(offerId, length, assistantAddress);
          await bosonVoucher.connect(assistant).preMint(offerId, length);
        });

        it("Should skip all vouchers that were already committed", async function () {
          let committedVouchers = [2, 4].map((tokenId) => deriveTokenId(offerId, tokenId));

          // Transfer some preminted vouchers
          const buyerAddress = await buyer.getAddress();
          await Promise.all(
            committedVouchers.map((tokenId) =>
              bosonVoucher.connect(assistant).transferFrom(assistantAddress, buyerAddress, tokenId)
            )
          );

          await offerHandler.connect(assistant).voidOffer(offerId);

          // Burn tokens, test for event
          let tx = await bosonVoucher.connect(assistant).burnPremintedVouchers(offerId, amount);

          // All burned tokens should not have an owner, but committed ones should
          const startId = deriveTokenId(offerId, start);
          for (let i = 0; i < Number(length); i++) {
            let tokenId = startId + BigInt(i);
            if (committedVouchers.includes(tokenId)) {
              // Check that owner is buyer.
              expect(await bosonVoucher.ownerOf(tokenId)).to.equal(buyerAddress);
            } else {
              // Check that Transfer event was emitted and owner does not exist anymore
              await expect(tx)
                .to.emit(bosonVoucher, "Transfer")
                .withArgs(await assistant.getAddress(), ZeroAddress, tokenId);
              await expect(bosonVoucher.ownerOf(tokenId)).to.be.revertedWith(RevertReasons.ERC721_INVALID_TOKEN_ID);
            }
          }

          // Last burned id should be updated
          const tokenIdStart = deriveTokenId(offerId, start);
          const lastBurnedId = tokenIdStart + BigInt(amount) - 1n;
          const range = new Range(
            tokenIdStart.toString(),
            length,
            amount,
            lastBurnedId.toString(),
            await assistant.getAddress()
          );
          const returnedRange = Range.fromStruct(await bosonVoucher.getRangeByOfferId(offerId));
          assert.equal(returnedRange.toString(), range.toString(), "Range mismatch");
        });

        it("Burning is possible if offer not voided, but just expired", async function () {
          // skip to after offer expiration
          await setNextBlockTimestamp(Number(BigInt(offerDates.validUntil) + 1n));

          // Burn tokens, test for event
          const tx = await bosonVoucher.connect(assistant).burnPremintedVouchers(offerId, amount);

          // Expect an event for every burn
          start = deriveTokenId(offerId, start);
          for (let i = 0; i < Number(amount); i++) {
            await expect(tx)
              .to.emit(bosonVoucher, "Transfer")
              .withArgs(await assistant.getAddress(), ZeroAddress, start + BigInt(i));
          }
        });
      });

      context("💔 Revert Reasons", async function () {
        it("Caller is not the owner", async function () {
          await expect(bosonVoucher.connect(rando).burnPremintedVouchers(offerId, amount)).to.be.revertedWith(
            RevertReasons.OWNABLE_NOT_OWNER
          );
        });

        it("Offer id is not associated with a range", async function () {
          // Set invalid offer id
          offerId = 15;

          // Try to burn, it should fail
          await expect(
            bosonVoucher.connect(assistant).burnPremintedVouchers(offerId, amount)
          ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.NO_RESERVED_RANGE_FOR_OFFER);
        });

        it("Offer is still valid", async function () {
          // make offer not voided
          offer.id = offerId = ++offerId;

          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId, offerFeeLimit);
          await bosonVoucher.connect(protocol).reserveRange(offerId, start, length, await assistant.getAddress());
          // Mint another 10 vouchers, so that there are 15 in total
          await bosonVoucher.connect(assistant).preMint(offerId, 10);

          // Try to burn, it should fail
          await expect(
            bosonVoucher.connect(assistant).burnPremintedVouchers(offerId, amount)
          ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_STILL_VALID);
        });

        it("Nothing to burn", async function () {
          // Burn tokens
          await bosonVoucher.connect(assistant).burnPremintedVouchers(offerId, amount);

          // Try to burn, it should fail
          await expect(
            bosonVoucher.connect(assistant).burnPremintedVouchers(offerId, amount)
          ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.AMOUNT_EXCEEDS_RANGE_OR_NOTHING_TO_BURN);
        });
      });
    });

    context("getAvailablePreMints()", function () {
      let offerId, start, length, amount;

      beforeEach(async function () {
        // reserve a range
        offerId = "1";
        start = "10";
        length = "990";
        await bosonVoucher.connect(protocol).reserveRange(offerId, start, length, await assistant.getAddress());

        // amount to mint
        amount = 50;
      });

      it("If nothing was preminted, return full range", async function () {
        // Get available premints from contract
        const availablePremints = await bosonVoucher.getAvailablePreMints(offerId);
        assert.equal(availablePremints.toString(), length, "Available Premints mismatch");
      });

      it("Part of range is preminted", async function () {
        // Premint tokens
        await bosonVoucher.connect(assistant).preMint(offerId, amount);

        // Get available premints from contract
        let newAmount = BigInt(length) - BigInt(amount);
        let availablePremints = await bosonVoucher.getAvailablePreMints(offerId);
        assert.equal(availablePremints, newAmount, "Available Premints mismatch");

        // Premint again
        await bosonVoucher.connect(assistant).preMint(offerId, amount);
        newAmount -= BigInt(amount);
        availablePremints = await bosonVoucher.getAvailablePreMints(offerId);
        assert.equal(availablePremints, newAmount, "Available Premints mismatch");
      });

      it("Range is fully minted", async function () {
        // Premint tokens
        await bosonVoucher.connect(assistant).preMint(offerId, length);

        // Get available premints from contract
        let availablePremints = await bosonVoucher.getAvailablePreMints(offerId);
        assert.equal(availablePremints, 0, "Available Premints mismatch");
      });

      it("Range for offer does not exist", async function () {
        // Set invalid offer id
        offerId = "20";

        // Get available premints from contract
        let availablePremints = await bosonVoucher.getAvailablePreMints(offerId);
        assert.equal(availablePremints, 0, "Available Premints mismatch");
      });

      it("Should be 0 if offer is voided", async function () {
        await offerHandler.connect(assistant).voidOffer(offerId);

        // Get available premints from contract
        let availablePremints = await bosonVoucher.getAvailablePreMints(offerId);
        assert.equal(availablePremints, 0, "Available Premints mismatch");
      });

      it("Should be 0 if offer is expired", async function () {
        // Skip to after offer expiry
        await setNextBlockTimestamp(Number(BigInt(offerDates.validUntil) + 1n), true);

        // Get available premints from contract
        let availablePremints = await bosonVoucher.getAvailablePreMints(offerId);
        assert.equal(availablePremints, 0, "Available Premints mismatch");
      });
    });

    context("getRange()", function () {
      let offerId, start, length, amount;
      let range;

      beforeEach(async function () {
        // reserve a range
        offerId = "1";
        start = "10";
        length = "990";
        const tokenIdStart = deriveTokenId(offerId, start);

        range = new Range(tokenIdStart.toString(), length, "0", "0", await assistant.getAddress());

        await bosonVoucher.connect(protocol).reserveRange(offerId, start, length, await assistant.getAddress());

        // amount to premint
        amount = "50";
        range.minted = amount;
        await bosonVoucher.connect(assistant).preMint(offerId, amount);
      });

      it("Get range object for offer with reserved range", async function () {
        // Get range object from contract
        const returnedRange = Range.fromStruct(await bosonVoucher.getRangeByOfferId(offerId));
        assert.equal(returnedRange.toString(), range.toString(), "Range mismatch");
      });

      it("Get empty range if offer has no reserved ranges", async function () {
        // Set invalid offer and empty range
        offerId = "20";
        range = new Range("0", "0", "0", "0", ZeroAddress);

        // Get range object from contract
        const returnedRange = Range.fromStruct(await bosonVoucher.getRangeByOfferId(offerId));
        assert.equal(returnedRange.toString(), range.toString(), "Range mismatch");
      });
    });

    context("ownerOf()", function () {
      let offerId, start, length, amount;

      context("No preminted tokens", async function () {
        it("Returns true owner if token exists", async function () {
          let tokenId = "100000";
          // Issue ordinary voucher
          await bosonVoucher.connect(protocol).issueVoucher(tokenId, await buyer.getAddress());

          // Token owner should be the buyer
          let tokenOwner = await bosonVoucher.ownerOf(tokenId);
          assert.equal(tokenOwner, await buyer.getAddress(), "Token owner mismatch");
        });

        context("💔 Revert Reasons", async function () {
          it("Token does not exist", async function () {
            let tokenId = "10";
            await expect(bosonVoucher.connect(rando).ownerOf(tokenId)).to.be.revertedWith(
              RevertReasons.ERC721_INVALID_TOKEN_ID
            );
          });
        });
      });

      context("With preminted tokens", async function () {
        beforeEach(async function () {
          // reserve a range
          offerId = "1";
          start = "10";
          length = "150";
          await bosonVoucher.connect(protocol).reserveRange(offerId, start, length, await assistant.getAddress());

          // amount to premint
          amount = 50;
          await bosonVoucher.connect(assistant).preMint(offerId, amount);
        });

        it("Returns true owner if token exists - via issue voucher", async function () {
          let tokenId = "100000";

          // Issue ordinary voucher
          await bosonVoucher.connect(protocol).issueVoucher(tokenId, await buyer.getAddress());

          // Token owner should be the buyer
          let tokenOwner = await bosonVoucher.ownerOf(tokenId);
          assert.equal(tokenOwner, await buyer.getAddress(), "Token owner mismatch");
        });

        it("Returns true owner if token exists - via preminted voucher transfer.", async function () {
          let exchangeId = "25"; // tokens between 10 and 60 are preminted
          const tokenId = deriveTokenId(offerId, exchangeId);

          // Transfer preminted token
          await bosonVoucher
            .connect(assistant)
            .transferFrom(await assistant.getAddress(), await buyer.getAddress(), tokenId);

          // Token owner should be the buyer
          let tokenOwner = await bosonVoucher.ownerOf(tokenId);
          assert.equal(tokenOwner, await buyer.getAddress(), "Token owner mismatch");
        });

        it("Returns seller if token is preminted and not transferred yet", async function () {
          // Token owner should be the seller for all preminted tokens
          let startTokenId = deriveTokenId(offerId, start);
          let endTokenId = startTokenId + BigInt(amount);
          for (let i = startTokenId; i < endTokenId; i = i + 1n) {
            let tokenOwner = await bosonVoucher.ownerOf(i);
            assert.equal(tokenOwner, await assistant.getAddress(), `Token owner mismatch ${i.toString()}`);
          }
        });

        it("Multiple ranges", async function () {
          // Add five more ranges
          // This tests more getPreMintStatus than ownerOf
          // Might even be put into integration tests
          let previousOfferId = Number(offerId);
          let previousStartId = Number(start);
          let ranges = [new Range(Number(start), length, amount, "0")];
          length = Number(length);

          offerId = ++previousOfferId;

          while (offerId <= 6) {
            start = previousStartId + length + 100;

            await offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId, offerFeeLimit);

            // reserve length
            await bosonVoucher.connect(protocol).reserveRange(offerId, start, length, await assistant.getAddress());

            // amount to premint
            amount = length - (offerId - 2) * 30;
            await bosonVoucher.connect(assistant).preMint(offerId, amount);
            ranges.push(new Range(start, length, amount, "0"));

            previousStartId = start;
            offerId++;
          }

          let endTokenId = previousStartId + length; // last range end
          let rangeIndex = 0;
          let currentRange = ranges[rangeIndex];
          let currentRangeMintEndId = currentRange.start + currentRange.minted - 1;
          let currentRangeEndId = currentRange.start + length - 1;
          offerId = 1;

          for (let i = 0; i < endTokenId; i++) {
            const tokenId = deriveTokenId(offerId, i);
            if (i < currentRange.start) {
              // tokenId not in range
              await expect(bosonVoucher.connect(rando).ownerOf(tokenId)).to.be.revertedWith(
                RevertReasons.ERC721_INVALID_TOKEN_ID
              );
            } else if (i <= currentRangeMintEndId) {
              // tokenId in range and minted. Seller should be the owner
              let tokenOwner = await bosonVoucher.ownerOf(tokenId);
              assert.equal(tokenOwner, await assistant.getAddress(), `Token owner mismatch ${tokenId.toString()}`);
            } else if (i <= currentRangeEndId) {
              // tokenId still in range, but not minted yet
              await expect(bosonVoucher.connect(rando).ownerOf(tokenId)).to.be.revertedWith(
                RevertReasons.ERC721_INVALID_TOKEN_ID
              );
            } else {
              // tokenId outside the current range
              // Change current range
              if (rangeIndex < ranges.length) {
                currentRange = ranges[++rangeIndex];
                currentRangeMintEndId = currentRange.start + currentRange.minted - 1;
                currentRangeEndId = currentRange.start + currentRange.length - 1;
                offerId++;
              }
              // Technically, next range could be consecutive and next call should return seller's address
              // But range construction in this test ensures gaps between ranges
              await expect(bosonVoucher.connect(rando).ownerOf(tokenId)).to.be.revertedWith(
                RevertReasons.ERC721_INVALID_TOKEN_ID
              );
            }
          }
        });

        it("Consecutive ranges", async function () {
          // Make two consecutive ranges
          let nextOfferId = Number(offerId) + 1;
          let nextStartId = Number(start) + Number(length);
          let nextLength = "10";
          let nextAmount = "5";

          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId, offerFeeLimit);

          // reserve length
          await bosonVoucher
            .connect(protocol)
            .reserveRange(nextOfferId, nextStartId, nextLength, await assistant.getAddress());

          // amount to premint
          await bosonVoucher.connect(assistant).preMint(nextOfferId, nextAmount);

          // First range - preminted tokens
          let startTokenId = deriveTokenId(offerId, start);
          let endTokenId = startTokenId + BigInt(amount);

          for (let i = startTokenId; i < endTokenId; i = i + 1n) {
            let tokenOwner = await bosonVoucher.ownerOf(i);
            assert.equal(tokenOwner, await assistant.getAddress(), `Token owner mismatch ${i.toString()}`);
          }

          // First range - not preminted tokens
          startTokenId = endTokenId;

          let endExchangeId = Number(start) + Number(length);
          endTokenId = deriveTokenId(offerId, endExchangeId);

          for (let i = startTokenId; i < endTokenId; i = i + 1n) {
            await expect(bosonVoucher.connect(rando).ownerOf(i)).to.be.revertedWith(
              RevertReasons.ERC721_INVALID_TOKEN_ID
            );
          }

          // Second range - preminted tokens
          startTokenId = deriveTokenId(nextOfferId, endExchangeId);

          endTokenId = startTokenId + BigInt(nextAmount);
          for (let i = startTokenId; i < endTokenId; i = i + 1n) {
            let tokenOwner = await bosonVoucher.ownerOf(i);
            assert.equal(tokenOwner, await assistant.getAddress(), `Token owner mismatch ${i.toString()}`);
          }

          // Second range - not preminted tokens
          startTokenId = endTokenId;

          endExchangeId += Number(nextLength);
          endTokenId = deriveTokenId(nextOfferId, endExchangeId);

          for (let i = startTokenId; i < endTokenId; i = i + 1n) {
            await expect(bosonVoucher.connect(rando).ownerOf(i)).to.be.revertedWith(
              RevertReasons.ERC721_INVALID_TOKEN_ID
            );
          }
        });

        context("💔 Revert Reasons", async function () {
          it("Token is outside any range and not minted", async function () {
            let tokenId = "200000";
            await expect(bosonVoucher.connect(rando).ownerOf(tokenId)).to.be.revertedWith(
              RevertReasons.ERC721_INVALID_TOKEN_ID
            );
          });

          it("Token is inside a range, but not minted yet", async function () {
            let startTokenId = deriveTokenId(offerId, Number(start) + Number(amount));
            let endTokenId = deriveTokenId(offerId, Number(start) + Number(length));

            // None of reserved but not preminted tokens should have an owner
            for (let i = startTokenId; i < endTokenId; i = i + 1n) {
              await expect(bosonVoucher.connect(rando).ownerOf(i)).to.be.revertedWith(
                RevertReasons.ERC721_INVALID_TOKEN_ID
              );
            }
          });

          it("Token was preminted, transferred and burned", async function () {
            let exchangeId = "26";
            const tokenId = deriveTokenId(offerId, exchangeId);

            // Token owner should be the seller
            let tokenOwner = await bosonVoucher.ownerOf(tokenId);
            assert.equal(tokenOwner, await assistant.getAddress(), "Token owner mismatch");

            // Transfer preminted token
            await bosonVoucher
              .connect(assistant)
              .transferFrom(await assistant.getAddress(), await buyer.getAddress(), tokenId);

            // Token owner should be the buyer
            tokenOwner = await bosonVoucher.ownerOf(tokenId);
            assert.equal(tokenOwner, await buyer.getAddress(), "Token owner mismatch");

            // Simulate burn
            await bosonVoucher.connect(protocol).burnVoucher(tokenId);

            // Token should have no owner
            await expect(bosonVoucher.connect(rando).ownerOf(tokenId)).to.be.revertedWith(
              RevertReasons.ERC721_INVALID_TOKEN_ID
            );
          });

          it("Token was preminted, not transferred and burned", async function () {
            let exchangeId = "26";
            const tokenId = deriveTokenId(offerId, exchangeId);

            // Token owner should be the seller
            let tokenOwner = await bosonVoucher.ownerOf(tokenId);
            assert.equal(tokenOwner, await assistant.getAddress(), "Token owner mismatch");

            await offerHandler.connect(assistant).voidOffer(offerId);

            // Burn preminted voucher
            await bosonVoucher.connect(assistant).burnPremintedVouchers(offerId, amount);

            // Token should have no owner
            await expect(bosonVoucher.connect(rando).ownerOf(tokenId)).to.be.revertedWith(
              RevertReasons.ERC721_INVALID_TOKEN_ID
            );
          });
        });
      });
    });

    context("Token transfers", function () {
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
          let tokenId, offerId, buyerId;
          let selector = transferFunctions[transferFunction].selector;
          let additionalArgs = transferFunctions[transferFunction].additionalArgs ?? [];

          context("Transfer of an actual voucher", async function () {
            beforeEach(async function () {
              exchangeId = offerId = "1";
              tokenId = deriveTokenId(offerId, exchangeId);

              // commit and create buyer account
              await exchangeHandler.commitToOffer(await buyer.getAddress(), offerId, { value: offer.price });
            });

            it("Should emit a Transfer event", async function () {
              await expect(
                bosonVoucher
                  .connect(buyer)
                  [selector](await buyer.getAddress(), await rando.getAddress(), tokenId, ...additionalArgs)
              )
                .to.emit(bosonVoucher, "Transfer")
                .withArgs(await buyer.getAddress(), await rando.getAddress(), tokenId);
            });

            it("Should update state", async function () {
              // Before transfer, buyer should be the owner
              let tokenOwner = await bosonVoucher.ownerOf(tokenId);
              assert.equal(tokenOwner, await buyer.getAddress(), "Buyer is not the owner");

              await bosonVoucher
                .connect(buyer)
                [selector](await buyer.getAddress(), await rando.getAddress(), tokenId, ...additionalArgs);

              // After transfer, rando should be the owner
              tokenOwner = await bosonVoucher.ownerOf(tokenId);
              assert.equal(tokenOwner, await rando.getAddress(), "Rando is not the owner");
            });

            it("Should call onVoucherTransferred", async function () {
              buyerId = 4n;
              await expect(
                bosonVoucher
                  .connect(buyer)
                  [selector](await buyer.getAddress(), await rando.getAddress(), tokenId, ...additionalArgs)
              )
                .to.emit(exchangeHandler, "VoucherTransferred")
                .withArgs(offerId, exchangeId, buyerId, await bosonVoucher.getAddress());
            });

            it("Transfer on behalf of should work normally", async function () {
              // Approve another address to transfer the voucher
              await bosonVoucher.connect(buyer).setApprovalForAll(await rando2.getAddress(), true);

              await expect(
                bosonVoucher
                  .connect(rando2)
                  [selector](await buyer.getAddress(), await rando.getAddress(), tokenId, ...additionalArgs)
              )
                .to.emit(bosonVoucher, "Transfer")
                .withArgs(await buyer.getAddress(), await rando.getAddress(), tokenId);
            });

            it("If seller is the true owner of voucher, transfer should work same as for others", async function () {
              buyerId = 5n;
              await bosonVoucher
                .connect(buyer)
                [selector](await buyer.getAddress(), await assistant.getAddress(), tokenId, ...additionalArgs);

              const tx = await bosonVoucher
                .connect(assistant)
                [selector](await assistant.getAddress(), await rando.getAddress(), tokenId, ...additionalArgs);

              await expect(tx)
                .to.emit(bosonVoucher, "Transfer")
                .withArgs(await assistant.getAddress(), await rando.getAddress(), tokenId);

              await expect(tx)
                .to.emit(exchangeHandler, "VoucherTransferred")
                .withArgs(offerId, exchangeId, buyerId, await bosonVoucher.getAddress());
            });

            context("💔 Revert Reasons", async function () {
              it("From does not own the voucher", async function () {
                await expect(
                  bosonVoucher
                    .connect(rando)
                    [selector](await assistant.getAddress(), await rando.getAddress(), tokenId, ...additionalArgs)
                ).to.be.revertedWith(RevertReasons.ERC721_CALLER_NOT_OWNER_OR_APPROVED);
              });
            });
          });

          context("Transfer of a preminted voucher when owner is assistant", async function () {
            let voucherRedeemableFrom, voucherValid;

            context("Fixed price offer", async function () {
              beforeEach(async function () {
                exchangeId = offerId = "1";
                const amount = "5";

                buyerId = 3n;

                await offerHandler.connect(assistant).reserveRange(offerId, amount, await assistant.getAddress());

                // amount to premint
                await bosonVoucher.connect(assistant).preMint(offerId, amount);
                tokenId = deriveTokenId(offerId, exchangeId);

                voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
                voucherValid = offerDurations.voucherValid;
              });

              it("Should emit a Transfer event", async function () {
                await expect(
                  bosonVoucher
                    .connect(assistant)
                    [selector](await assistant.getAddress(), await rando.getAddress(), tokenId, ...additionalArgs)
                )
                  .to.emit(bosonVoucher, "Transfer")
                  .withArgs(await assistant.getAddress(), await rando.getAddress(), tokenId);
              });

              it("Should update state", async function () {
                // Before transfer, seller should be the owner
                let tokenOwner = await bosonVoucher.ownerOf(tokenId);
                assert.equal(tokenOwner, await assistant.getAddress(), "Seller is not the owner");

                await bosonVoucher
                  .connect(assistant)
                  [selector](await assistant.getAddress(), await rando.getAddress(), tokenId, ...additionalArgs);

                // After transfer, rando should be the owner
                tokenOwner = await bosonVoucher.ownerOf(tokenId);
                assert.equal(tokenOwner, await rando.getAddress(), "Rando is not the owner");
              });

              it("Should call onPremintedVoucherTransferred", async function () {
                const tx = await bosonVoucher
                  .connect(assistant)
                  [selector](await assistant.getAddress(), await rando.getAddress(), tokenId, ...additionalArgs);

                // Get the block timestamp of the confirmed tx
                const blockNumber = tx.blockNumber;
                const block = await provider.getBlock(blockNumber);

                // Prepare exchange and voucher for validation
                const exchange = mockExchange({ id: exchangeId, offerId, buyerId, finalizedDate: "0" });
                const voucher = mockVoucher({ redeemedDate: "0" });

                // Update the committed date in the expected exchange struct with the block timestamp of the tx
                voucher.committedDate = block.timestamp;

                // Update the validUntilDate date in the expected exchange struct
                voucher.validUntilDate = calculateVoucherExpiry(block, voucherRedeemableFrom, voucherValid);

                // First transfer should call onPremintedVoucherTransferred
                await expect(tx)
                  .to.emit(exchangeHandler, "BuyerCommitted")
                  .withArgs(
                    offerId,
                    buyerId,
                    exchangeId,
                    exchange.toStruct(),
                    voucher.toStruct(),
                    await bosonVoucher.getAddress()
                  );
              });

              it("Second transfer should behave as normal voucher transfer", async function () {
                // First transfer should call onPremintedVoucherTransferred, and not onVoucherTransferred
                let tx = await bosonVoucher
                  .connect(assistant)
                  [selector](await assistant.getAddress(), await rando.getAddress(), tokenId, ...additionalArgs);
                await expect(tx).to.emit(exchangeHandler, "BuyerCommitted");
                await expect(tx).to.not.emit(exchangeHandler, "VoucherTransferred");

                // Second transfer should call onVoucherTransferred, and not onPremintedVoucherTransferred
                tx = await bosonVoucher
                  .connect(rando)
                  [selector](await rando.getAddress(), await assistant.getAddress(), tokenId, ...additionalArgs);
                await expect(tx).to.emit(exchangeHandler, "VoucherTransferred");
                await expect(tx).to.not.emit(exchangeHandler, "BuyerCommitted");

                // Next transfer should call onVoucherTransferred, and not onPremintedVoucherTransferred, even if seller is the owner
                tx = await bosonVoucher
                  .connect(assistant)
                  [selector](await assistant.getAddress(), await rando.getAddress(), tokenId, ...additionalArgs);
                await expect(tx).to.emit(exchangeHandler, "VoucherTransferred");
                await expect(tx).to.not.emit(exchangeHandler, "BuyerCommitted");
              });

              it("Transfer on behalf of should work normally", async function () {
                // Approve another address to transfer the voucher
                await bosonVoucher.connect(assistant).setApprovalForAll(await rando2.getAddress(), true);

                await expect(
                  bosonVoucher
                    .connect(rando2)
                    [selector](await assistant.getAddress(), await rando.getAddress(), tokenId, ...additionalArgs)
                )
                  .to.emit(bosonVoucher, "Transfer")
                  .withArgs(await assistant.getAddress(), await rando.getAddress(), tokenId);
              });

              context("💔 Revert Reasons", async function () {
                it("Cannot transfer preminted voucher twice", async function () {
                  // Make first transfer
                  await bosonVoucher
                    .connect(assistant)
                    [selector](await assistant.getAddress(), await buyer.getAddress(), tokenId, ...additionalArgs);

                  // Second transfer should fail, since voucher has an owner
                  await expect(
                    bosonVoucher
                      .connect(assistant)
                      [selector](await assistant.getAddress(), await rando.getAddress(), tokenId, ...additionalArgs)
                  ).to.be.revertedWith(RevertReasons.ERC721_CALLER_NOT_OWNER_OR_APPROVED);
                });

                it("Transfer preminted voucher, which was committed and burned already", async function () {
                  await bosonVoucher
                    .connect(assistant)
                    [selector](await assistant.getAddress(), await buyer.getAddress(), tokenId, ...additionalArgs);

                  // Redeem voucher, effectively burning it
                  await setNextBlockTimestamp(Number(voucherRedeemableFrom));
                  await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

                  // Transfer should fail, since voucher has been burned
                  await expect(
                    bosonVoucher
                      .connect(assistant)
                      [selector](await assistant.getAddress(), await rando.getAddress(), tokenId, ...additionalArgs)
                  ).to.be.revertedWith(RevertReasons.ERC721_INVALID_TOKEN_ID);
                });

                it("Transfer preminted voucher, which was not committed but burned already", async function () {
                  // Void offer
                  await offerHandler.connect(assistant).voidOffer(offerId);

                  // Burn preminted vouchers
                  await bosonVoucher.connect(assistant).burnPremintedVouchers(offerId, "1");

                  // None of reserved but not preminted tokens should have an owner
                  await expect(
                    bosonVoucher
                      .connect(assistant)
                      [selector](await assistant.getAddress(), await rando.getAddress(), tokenId, ...additionalArgs)
                  ).to.be.revertedWith(RevertReasons.ERC721_INVALID_TOKEN_ID);
                });

                it("Transfer preminted voucher, where offer was voided", async function () {
                  // Void offer
                  await offerHandler.connect(assistant).voidOffer(offerId);

                  // Transfer should fail, since protocol reverts
                  await expect(
                    bosonVoucher
                      .connect(assistant)
                      [selector](await assistant.getAddress(), await rando.getAddress(), tokenId, ...additionalArgs)
                  ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_HAS_BEEN_VOIDED);
                });

                it("Transfer preminted voucher, where offer has expired", async function () {
                  // Skip past offer expiry
                  await setNextBlockTimestamp(Number(BigInt(offerDates.validUntil) + 1n));

                  // Transfer should fail, since protocol reverts
                  await expect(
                    bosonVoucher
                      .connect(assistant)
                      [selector](await assistant.getAddress(), await rando.getAddress(), tokenId, ...additionalArgs)
                  ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_HAS_EXPIRED);
                });

                it("Transfer preminted voucher, but from is not the voucher owner", async function () {
                  await bosonVoucher
                    .connect(assistant)
                    [selector](await assistant.getAddress(), await rando.getAddress(), tokenId, ...additionalArgs);

                  // next token id. Make sure that assistant is the owner
                  tokenId = tokenId + 1n;
                  let tokenOwner = await bosonVoucher.ownerOf(tokenId.toString());
                  assert.equal(tokenOwner, await assistant.getAddress(), "Seller is not the owner");

                  // Following call should fail, since rando is not the owner of preminted voucher
                  await expect(
                    bosonVoucher
                      .connect(rando)
                      [selector](await rando.getAddress(), await rando.getAddress(), tokenId, ...additionalArgs)
                  ).to.be.revertedWith(RevertReasons.ERC721_CALLER_NOT_OWNER_OR_APPROVED);
                });
              });
            });

            context("Price discovery offer", async function () {
              let buyerContractAddress;
              beforeEach(async function () {
                exchangeId = await exchangeHandler.getNextExchangeId();
                const amount = "5";
                offerId = priceDiscoveryOffer.id;

                buyerId = 3n;

                await offerHandler.connect(assistant).reserveRange(offerId, amount, await assistant.getAddress());

                // amount to premint
                await bosonVoucher.connect(assistant).preMint(offerId, amount);
                tokenId = deriveTokenId(offerId, exchangeId);

                voucherRedeemableFrom = offerDates.voucherRedeemableFrom;
                voucherValid = offerDurations.voucherValid;

                buyerContractAddress = await buyerContract.getAddress();
              });

              it("Should emit a Transfer event", async function () {
                await expect(
                  bosonVoucher
                    .connect(assistant)
                    [selector](await assistant.getAddress(), buyerContractAddress, tokenId, ...additionalArgs)
                )
                  .to.emit(bosonVoucher, "Transfer")
                  .withArgs(await assistant.getAddress(), buyerContractAddress, tokenId);
              });

              it("Should update state", async function () {
                // Before transfer, seller should be the owner
                let tokenOwner = await bosonVoucher.ownerOf(tokenId);
                assert.equal(tokenOwner, await assistant.getAddress(), "Seller is not the owner");

                await bosonVoucher
                  .connect(assistant)
                  [selector](await assistant.getAddress(), buyerContractAddress, tokenId, ...additionalArgs);

                // After transfer, rando should be the owner
                tokenOwner = await bosonVoucher.ownerOf(tokenId);
                assert.equal(tokenOwner, buyerContractAddress, "Buyer contract is not the owner");
              });

              it("Should call onPremintedVoucherTransferred, but not commit to offer", async function () {
                const tx = await bosonVoucher
                  .connect(assistant)
                  [selector](await assistant.getAddress(), buyerContractAddress, tokenId, ...additionalArgs);

                // First transfer should not result in commit
                await expect(tx).to.not.emit(exchangeHandler, "BuyerCommitted");
              });

              it.skip("Second transfer should behave as normal voucher transfer", async function () {
                // ToDo
              });

              it("Transfer on behalf of should work normally", async function () {
                // Approve another address to transfer the voucher
                await bosonVoucher.connect(assistant).setApprovalForAll(await rando2.getAddress(), true);

                await expect(
                  bosonVoucher
                    .connect(rando2)
                    [selector](await assistant.getAddress(), buyerContractAddress, tokenId, ...additionalArgs)
                )
                  .to.emit(bosonVoucher, "Transfer")
                  .withArgs(await assistant.getAddress(), buyerContractAddress, tokenId);
              });

              context("💔 Revert Reasons", async function () {
                it("Cannot transfer preminted voucher twice", async function () {
                  // Make first transfer
                  await bosonVoucher
                    .connect(assistant)
                    [selector](await assistant.getAddress(), buyerContractAddress, tokenId, ...additionalArgs);

                  // Second transfer should fail, since voucher has an owner
                  await expect(
                    bosonVoucher
                      .connect(assistant)
                      [
                        selector
                      ](await assistant.getAddress(), await buyerContract2.getAddress(), tokenId, ...additionalArgs)
                  ).to.be.revertedWith(RevertReasons.ERC721_CALLER_NOT_OWNER_OR_APPROVED);
                });

                it.skip("Transfer preminted voucher, which was committed and burned already", async function () {
                  // ToDo
                });

                it("Transfer preminted voucher, which was not committed but burned already", async function () {
                  // Void offer
                  await offerHandler.connect(assistant).voidOffer(offerId);

                  // Burn preminted vouchers
                  await bosonVoucher.connect(assistant).burnPremintedVouchers(offerId, "1");

                  // None of reserved but not preminted tokens should have an owner
                  await expect(
                    bosonVoucher
                      .connect(assistant)
                      [selector](await assistant.getAddress(), buyerContractAddress, tokenId, ...additionalArgs)
                  ).to.be.revertedWith(RevertReasons.ERC721_INVALID_TOKEN_ID);
                });

                it("Transfer preminted voucher, where offer was voided", async function () {
                  // Void offer
                  await offerHandler.connect(assistant).voidOffer(offerId);

                  // Transfer should fail, since protocol reverts
                  await expect(
                    bosonVoucher
                      .connect(assistant)
                      [selector](await assistant.getAddress(), buyerContractAddress, tokenId, ...additionalArgs)
                  ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.OFFER_HAS_BEEN_VOIDED);
                });

                it.skip("Transfer preminted voucher, where offer has expired", async function () {
                  // ToDo
                });

                it("Transfer preminted voucher, but from is not the voucher owner", async function () {
                  await bosonVoucher
                    .connect(assistant)
                    [selector](await assistant.getAddress(), buyerContractAddress, tokenId, ...additionalArgs);

                  // next token id. Make sure that assistant is the owner
                  tokenId = tokenId + 1n;
                  let tokenOwner = await bosonVoucher.ownerOf(tokenId.toString());
                  assert.equal(tokenOwner, await assistant.getAddress(), "Seller is not the owner");

                  // Following call should fail, since rando is not the owner of preminted voucher
                  await expect(
                    bosonVoucher
                      .connect(rando)
                      [selector](await rando.getAddress(), buyerContractAddress, tokenId, ...additionalArgs)
                  ).to.be.revertedWith(RevertReasons.ERC721_CALLER_NOT_OWNER_OR_APPROVED);
                });
              });
            });
          });

          context("Transfer of a preminted voucher when owner is contract", async function () {
            beforeEach(async function () {
              exchangeId = offerId = "1";

              tokenId = deriveTokenId(offerId, exchangeId);
              const amount = "5";

              buyerId = 3n;

              await offerHandler.connect(assistant).reserveRange(offerId, amount, await bosonVoucher.getAddress());

              // amount to premint
              await bosonVoucher.connect(assistant).preMint(offerId, amount);
            });

            it("If voucher contract is the owner of voucher, transfer on behalf of should work normally", async function () {
              // Approve another address to transfer the voucher
              await bosonVoucher.connect(assistant).setApprovalForAllToContract(await rando2.getAddress(), true);

              const tx = await bosonVoucher
                .connect(rando2)
                [selector](await bosonVoucher.getAddress(), await rando.getAddress(), tokenId, ...additionalArgs);

              await expect(tx)
                .to.emit(bosonVoucher, "Transfer")
                .withArgs(await bosonVoucher.getAddress(), await rando.getAddress(), tokenId);
            });
          });
        });
      });
    });

    context("tokenURI", function () {
      let metadataUri, offerId;

      beforeEach(async function () {
        offerId = "1";
        metadataUri = offer.metadataUri;
      });

      it("should return the correct tokenURI", async function () {
        const buyerAddress = await buyer.getAddress();

        await exchangeHandler.connect(buyer).commitToOffer(buyerAddress, offerId, { value: offer.price });

        const tokenId = deriveTokenId(offerId, 1);
        const tokenURI = await bosonVoucher.tokenURI(tokenId);
        expect(tokenURI).eq(metadataUri);
      });

      context("pre-minted", async function () {
        let start, tokenId;
        beforeEach(async function () {
          // reserve a range
          start = "10";
          const length = "1";
          await bosonVoucher.connect(protocol).reserveRange(offerId, start, length, await assistant.getAddress());

          // premint
          await bosonVoucher.connect(assistant).preMint(offerId, 1);

          tokenId = deriveTokenId(offerId, start);
        });

        it("should return the correct tokenURI", async function () {
          const tokenURI = await bosonVoucher.tokenURI(tokenId);
          expect(tokenURI).eq(metadataUri);
        });

        it("should return correct tokenURI when token is preminted and transferred", async function () {
          await bosonVoucher
            .connect(assistant)
            .transferFrom(await assistant.getAddress(), await buyer.getAddress(), tokenId);

          const tokenURI = await bosonVoucher.tokenURI(tokenId);
          expect(tokenURI).eq(metadataUri);
        });
      });

      context("💔 Revert Reasons", async function () {
        it("should revert if tokenId does not exist", async function () {
          await expect(bosonVoucher.tokenURI(10)).to.be.revertedWith(RevertReasons.ERC721_INVALID_TOKEN_ID);
        });
      });
    });

    context("EIP2981 NFT Royalty fee", function () {
      let offerId, tokenId;
      beforeEach(async function () {
        offerId = "1";
        exchangeId = "1";
        offerPrice = offer.price;
        tokenId = deriveTokenId(offerId, exchangeId);

        await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: offer.price });
      });

      context("royaltyInfo()", function () {
        let agentId;
        beforeEach(async function () {
          // give ownership to assistant
          await bosonVoucher.connect(protocol).transferOwnership(await assistant.getAddress());

          agentId = 0;
        });

        it("should return a recipient and royalty fee", async function () {
          // First, set royalty fee as 0
          royaltyPercentage = "0"; //0%
          await offerHandler
            .connect(assistant)
            .updateOfferRoyaltyRecipients(offerId, new RoyaltyInfo([ZeroAddress], [royaltyPercentage]));

          let receiver, royaltyAmount;
          [receiver, royaltyAmount] = await bosonVoucher.connect(assistant).royaltyInfo(tokenId, offerPrice);

          // Expectations
          let expectedRecipient = seller.treasury;
          let expectedRoyaltyAmount = "0";

          assert.equal(receiver, expectedRecipient, "Recipient address is incorrect");
          assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");

          // Now, set royalty fee as 10%
          royaltyPercentage = "1000"; //10%
          await offerHandler
            .connect(assistant)
            .updateOfferRoyaltyRecipients(offerId, new RoyaltyInfo([ZeroAddress], [royaltyPercentage]));

          [receiver, royaltyAmount] = await bosonVoucher.connect(assistant).royaltyInfo(tokenId, offerPrice);

          // Expectations
          expectedRecipient = seller.treasury;
          expectedRoyaltyAmount = applyPercentage(offerPrice, royaltyPercentage);

          assert.equal(receiver, expectedRecipient, "Recipient address is incorrect");
          assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");

          // Any random address can check the royalty info
          // Now, set royalty fee as 8%
          royaltyPercentage = "800"; //8%
          await offerHandler
            .connect(assistant)
            .updateOfferRoyaltyRecipients(offerId, new RoyaltyInfo([ZeroAddress], [royaltyPercentage]));

          [receiver, royaltyAmount] = await bosonVoucher.connect(rando).royaltyInfo(tokenId, offerPrice);

          // Expectations
          expectedRecipient = seller.treasury;
          expectedRoyaltyAmount = applyPercentage(offerPrice, royaltyPercentage);

          assert.equal(receiver, expectedRecipient, "Recipient address is incorrect");
          assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");
        });

        it("if exchange doesn't exist it should return 0 values", async function () {
          // Set royalty fee as 10%
          royaltyPercentage = "1000"; //10%
          await offerHandler
            .connect(assistant)
            .updateOfferRoyaltyRecipients(offerId, new RoyaltyInfo([ZeroAddress], [royaltyPercentage]));

          // Set inexistent exchangeId
          exchangeId = "100000";
          const [receiver, royaltyAmount] = await bosonVoucher.connect(assistant).royaltyInfo(exchangeId, offerPrice);

          // Receiver and amount should be 0
          assert.equal(receiver, ZeroAddress, "Recipient address is incorrect");
          assert.equal(royaltyAmount, 0n, "Royalty amount is incorrect");
        });

        it("eip2981 always returns only the first entry as the recipient", async function () {
          await configHandler.connect(deployer).setMaxRoyaltyPercentage("10000");

          // Add multiple royalty recipients
          const royaltyRecipientInfoList = new RoyaltyRecipientInfoList([
            new RoyaltyRecipientInfo(rando.address, "100"),
            new RoyaltyRecipientInfo(rando2.address, "200"),
          ]);
          await accountHandler.connect(admin).addRoyaltyRecipients(seller.id, royaltyRecipientInfoList.toStruct());

          // Create an offer with multiple recipients
          const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
          offer.royaltyInfo = [
            new RoyaltyInfo(
              [rando.address, ZeroAddress, rando2.address],
              ["200", voucherInitValues.royaltyPercentage, "250"]
            ),
          ];
          offer.id = "3"; // Two offers are created in beforeAll

          await offerHandler
            .connect(assistant)
            .createOffer(
              offer.toStruct(),
              offerDates.toStruct(),
              offerDurations.toStruct(),
              disputeResolverId,
              agentId,
              offerFeeLimit
            );
          await fundsHandler
            .connect(admin)
            .depositFunds(seller.id, ZeroAddress, offer.sellerDeposit, { value: offer.sellerDeposit });
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offer.id, { value: offer.price });

          // Set inexistent exchangeId
          exchangeId = "2";
          const tokenId = deriveTokenId(offer.id, exchangeId);
          const [receiver, royaltyAmount] = await bosonVoucher.connect(assistant).royaltyInfo(tokenId, offerPrice);

          // Expectations
          let expectedRecipient = rando.address;
          let expectedRoyaltyAmount = applyPercentage(
            offerPrice,
            Number(voucherInitValues.royaltyPercentage) + 200 + 250
          );

          assert.equal(receiver, expectedRecipient, "Recipient address is incorrect");
          assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");
        });

        it("for offer without royalty recipients, it returns 0 values", async function () {
          // Create an offer with multiple recipients
          const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
          offer.royaltyInfo = [new RoyaltyInfo([], [])];
          offer.id = "3"; // Two offers are created in beforeAll

          await offerHandler
            .connect(assistant)
            .createOffer(
              offer.toStruct(),
              offerDates.toStruct(),
              offerDurations.toStruct(),
              disputeResolverId,
              agentId,
              offerFeeLimit
            );
          await fundsHandler
            .connect(admin)
            .depositFunds(seller.id, ZeroAddress, offer.sellerDeposit, { value: offer.sellerDeposit });
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offer.id, { value: offer.price });

          // Set exchangeId
          const exchangeId = "2";
          const tokenId = deriveTokenId(offer.id, exchangeId);
          const [receiver, royaltyAmount] = await bosonVoucher.connect(assistant).royaltyInfo(tokenId, offerPrice);

          // Expectations
          let expectedRecipient = ZeroAddress;
          let expectedRoyaltyAmount = "0";

          assert.equal(receiver, expectedRecipient, "Recipient address is incorrect");
          assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");
        });

        it("should return a recipient and royalty fee for preminted offers", async function () {
          // Create an offer with multiple recipients
          const { offer, offerDates, offerDurations, disputeResolverId } = await mockOffer();
          offer.royaltyInfo = [new RoyaltyInfo([ZeroAddress], [voucherInitValues.royaltyPercentage])];
          offer.id = "3"; // Two offers are created in beforeAll
          offer.quantityAvailable = 20;

          await offerHandler
            .connect(assistant)
            .createOffer(
              offer.toStruct(),
              offerDates.toStruct(),
              offerDurations.toStruct(),
              disputeResolverId,
              agentId,
              offerFeeLimit
            );
          await fundsHandler
            .connect(admin)
            .depositFunds(seller.id, ZeroAddress, offer.sellerDeposit, { value: offer.sellerDeposit });
          await offerHandler.connect(assistant).reserveRange(offer.id, 20, assistant.address);
          await bosonVoucher.connect(assistant).preMint(offer.id, 20);

          // Set exchangeId
          const exchangeId = "2";
          const tokenId = deriveTokenId(offer.id, exchangeId);
          const [receiver, royaltyAmount] = await bosonVoucher.connect(assistant).royaltyInfo(tokenId, offerPrice);

          // Expectations
          let expectedRecipient = seller.treasury;
          let expectedRoyaltyAmount = applyPercentage(offerPrice, voucherInitValues.royaltyPercentage);

          assert.equal(receiver, expectedRecipient, "Recipient address is incorrect");
          assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");
        });

        it("should return 0 values if token does not exist", async function () {
          // set invalid exchangeId
          exchangeId = "1234";

          let [receiver, royaltyAmount] = await bosonVoucher.connect(assistant).royaltyInfo(exchangeId, offerPrice);

          // Expectations
          let expectedRecipient = ZeroAddress;
          let expectedRoyaltyAmount = "0";

          assert.equal(receiver, expectedRecipient, "Recipient address is incorrect");
          assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");
        });

        it("should return 0 values if voucher was redeemed", async function () {
          await setNextBlockTimestamp("0x" + BigInt(offerDates.voucherRedeemableFrom).toString(16));
          await exchangeHandler.connect(buyer).redeemVoucher(exchangeId);

          let [receiver, royaltyAmount] = await bosonVoucher.connect(assistant).royaltyInfo(exchangeId, offerPrice);
          // Expectations
          let expectedRecipient = ZeroAddress;
          let expectedRoyaltyAmount = "0";

          assert.equal(receiver, expectedRecipient, "Recipient address is incorrect");
          assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");
        });

        it("if exchange doesn't exist it should return 0 values", async function () {
          // Set inexistent exchangeId
          exchangeId = "100000";
          const [receiver, royaltyAmount] = await bosonVoucher.connect(assistant).royaltyInfo(exchangeId, offerPrice);

          // Expectations
          let expectedRecipient = ZeroAddress;
          let expectedRoyaltyAmount = "0";

          assert.equal(receiver, expectedRecipient, "Recipient address is incorrect");
          assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");
        });
      });
    });

    context("withdrawToProtocol", function () {
      let availableFundsAddresses;

      beforeEach(async function () {
        availableFundsAddresses = [ZeroAddress];
      });

      it("Can withdraw native token", async function () {
        const sellersFundsBefore = FundsList.fromStruct(
          await fundsHandler.getAvailableFunds(seller.id, availableFundsAddresses)
        );

        const amount = parseUnits("1", "ether");
        await admin.sendTransaction({ to: await bosonVoucher.getAddress(), value: amount });

        await expect(() => bosonVoucher.connect(rando).withdrawToProtocol([ZeroAddress])).to.changeEtherBalances(
          [bosonVoucher, fundsHandler],
          [amount * -1n, amount]
        );

        const { availableAmount } = sellersFundsBefore.funds.find((fund) => fund.tokenAddress == ZeroAddress);

        // Seller's available balance should increase
        const expectedAvailableFunds = new FundsList([
          new Funds(ZeroAddress, "Native currency", (BigInt(availableAmount) + BigInt(amount)).toString()),
        ]);

        const sellerFundsAfter = FundsList.fromStruct(
          await fundsHandler.getAvailableFunds(seller.id, availableFundsAddresses)
        );

        expect(sellerFundsAfter).to.eql(expectedAvailableFunds);
      });

      it("Can withdraw ERC20", async function () {
        const amount = parseUnits("1", "ether");
        await foreign20.connect(deployer).mint(await deployer.getAddress(), amount);

        await foreign20.connect(deployer).transfer(await bosonVoucher.getAddress(), amount);

        const foreign20Address = await foreign20.getAddress();
        await expect(() => bosonVoucher.connect(rando).withdrawToProtocol([foreign20Address])).to.changeTokenBalances(
          foreign20,
          [bosonVoucher, fundsHandler],
          [amount * -1n, amount]
        );

        // Seller's available balance should increase
        const expectedAvailableFunds = new Funds(foreign20Address, "Foreign20", amount.toString());

        // first item is AddressZero
        availableFundsAddresses.push(foreign20Address);
        const [, sellerFundsAfter] = FundsList.fromStruct(
          await fundsHandler.getAvailableFunds(seller.id, availableFundsAddresses)
        ).funds;
        expect(sellerFundsAfter).to.eql(expectedAvailableFunds);
      });

      it("Should withdraw all tokens when list length > 1", async function () {
        availableFundsAddresses.push(await foreign20.getAddress());
        const { funds: sellerFundsBefore } = FundsList.fromStruct(
          await fundsHandler.getAvailableFunds(seller.id, availableFundsAddresses)
        );

        sellerFundsBefore[1] = new Funds(await foreign20.getAddress(), "Foreign20", "0");

        const amount = parseUnits("1", "ether");
        await admin.sendTransaction({ to: await bosonVoucher.getAddress(), value: amount });
        await foreign20.connect(deployer).mint(await deployer.getAddress(), amount);
        await foreign20.connect(deployer).transfer(await bosonVoucher.getAddress(), amount);

        const foreign20Address = await foreign20.getAddress();
        let tx;
        await expect(() => {
          tx = bosonVoucher.connect(rando).withdrawToProtocol([ZeroAddress, foreign20Address]);
          return tx;
        }).to.changeTokenBalances(foreign20, [bosonVoucher, fundsHandler], [amount * -1n, amount]);
        await expect(() => tx).to.changeEtherBalances([bosonVoucher, fundsHandler], [amount * -1n, amount]);

        const { funds: sellerFundsAfter } = FundsList.fromStruct(
          await fundsHandler.getAvailableFunds(seller.id, availableFundsAddresses)
        );

        expect(
          sellerFundsBefore.map((f) => {
            return { ...f, availableAmount: (BigInt(f.availableAmount) + amount).toString() };
          })
        ).to.eql(sellerFundsAfter);
      });

      it("USDT withdraws correctly", async function () {
        // deploy USDT
        const usdtFactory = await getContractFactory("TetherToken");
        // @param _balance Initial supply of the contract
        // @param _name Token Name
        // @param _symbol Token symbol
        // @param _decimals Token decimals

        const amount = parseUnits("1", "ether");
        const usdtContract = await usdtFactory.connect(deployer).deploy(amount, "Tether USD", "USDT", 6);

        // mint USDT
        await usdtContract.connect(deployer).issue(amount);

        // transfer USDT to bosonVoucher
        await usdtContract.connect(deployer).transfer(await bosonVoucher.getAddress(), amount);

        const usdtContractAddress = await usdtContract.getAddress();
        await expect(() =>
          bosonVoucher.connect(rando).withdrawToProtocol([usdtContractAddress])
        ).to.changeTokenBalances(usdtContract, [bosonVoucher, fundsHandler], [amount * -1n, amount]);

        // Seller's available balance should increase
        const expectedAvailableFunds = new Funds(usdtContractAddress, "Tether USD", amount.toString());

        // first item is AddressZero
        availableFundsAddresses.push(usdtContractAddress);
        const [, sellerFundsAfter] = FundsList.fromStruct(
          await fundsHandler.getAvailableFunds(seller.id, availableFundsAddresses)
        ).funds;
        expect(sellerFundsAfter).to.eql(expectedAvailableFunds);
      });
    });

    context("getSellerId()", function () {
      it("should return the seller id", async function () {
        await bosonVoucher.connect(protocol).transferOwnership(await assistant.getAddress());

        expect(await bosonVoucher.connect(rando).getSellerId()).to.equal(seller.id, "Invalid seller id returned");

        // Reset the accountId iterator
        accountId.next(true);
      });

      it("should return 0 if the seller doesn't exist", async function () {
        await bosonVoucher.connect(protocol).transferOwnership(await rando.getAddress());
        expect(await bosonVoucher.getSellerId()).to.equal(0, "Invalid seller id returned");
      });
    });
  });

  context("burnVoucher()", function () {
    it("should burn a voucher with success", async function () {
      const buyerStruct = mockBuyer(await buyer.getAddress()).toStruct();
      const buyerWallet = buyerStruct[1];

      await bosonVoucher.connect(protocol).issueVoucher(0, buyerWallet);

      const balanceBefore = await bosonVoucher.balanceOf(await buyer.getAddress());

      await bosonVoucher.connect(protocol).burnVoucher(0);

      const balanceAfter = await bosonVoucher.balanceOf(await buyer.getAddress());

      expect(balanceBefore - balanceAfter).eq(1);
    });

    it("should revert if caller does not have PROTOCOL role", async function () {
      // Expect revert if random user attempts to burn voucher
      await expect(bosonVoucher.connect(rando).burnVoucher(0)).to.be.revertedWithCustomError(
        bosonErrors,
        RevertReasons.ACCESS_DENIED
      );

      // Grant PROTOCOL role to random user address
      await accessController.grantRole(Role.PROTOCOL, await rando.getAddress());

      // Prepare to burn voucher as a random user
      const buyerStruct = mockBuyer(await buyer.getAddress()).toStruct();
      const buyerWallet = buyerStruct[1];
      await bosonVoucher.connect(protocol).issueVoucher(0, buyerWallet);
      const balanceBefore = await bosonVoucher.balanceOf(await buyer.getAddress());

      //Attempt to burn voucher as a random user
      await bosonVoucher.connect(protocol).burnVoucher(0);
      const balanceAfter = await bosonVoucher.balanceOf(await buyer.getAddress());

      expect(balanceBefore - balanceAfter).eq(1);
    });
  });

  context("transferOwnership()", function () {
    it("should emit OwnershipTransferred", async function () {
      const ownable = await getContractAt("OwnableUpgradeable", await bosonVoucher.getAddress());
      await expect(bosonVoucher.connect(protocol).transferOwnership(await rando.getAddress()))
        .to.emit(ownable, "OwnershipTransferred")
        .withArgs(await assistant.getAddress(), await rando.getAddress());
    });

    it("should transfer ownership with success", async function () {
      await bosonVoucher.connect(protocol).transferOwnership(await assistant.getAddress());

      const ownable = await getContractAt("OwnableUpgradeable", await bosonVoucher.getAddress());
      const owner = await ownable.owner();

      expect(owner).eq(await assistant.getAddress(), "Wrong owner");
    });

    context("💔 Revert Reasons", async function () {
      it("should revert if caller does not have PROTOCOL role", async function () {
        await expect(
          bosonVoucher.connect(rando).transferOwnership(await assistant.getAddress())
        ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.ACCESS_DENIED);
      });

      it("Even the current owner cannot transfer the ownership", async function () {
        // successfully transfer to assistant
        await bosonVoucher.connect(protocol).transferOwnership(await assistant.getAddress());

        // owner tries to transfer, it should fail
        await expect(
          bosonVoucher.connect(assistant).transferOwnership(await rando.getAddress())
        ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.ACCESS_DENIED);
      });

      it("Current owner cannot renounce the ownership", async function () {
        // successfully transfer to assistant
        await bosonVoucher.connect(protocol).transferOwnership(await assistant.getAddress());

        const ownable = await getContractAt("OwnableUpgradeable", await bosonVoucher.getAddress());

        // owner tries to renounce ownership, it should fail
        await expect(ownable.connect(assistant).renounceOwnership()).to.be.revertedWithCustomError(
          bosonErrors,
          RevertReasons.ACCESS_DENIED
        );
      });

      it("Transferring ownership to 0 is not allowed", async function () {
        // try to transfer ownership to address 0, should fail
        await expect(bosonVoucher.connect(protocol).transferOwnership(ZeroAddress)).to.be.revertedWith(
          RevertReasons.OWNABLE_ZERO_ADDRESS
        );
      });
    });
  });

  context("setContractURI()", function () {
    beforeEach(async function () {
      // give ownership to assistant
      await bosonVoucher.connect(protocol).transferOwnership(await assistant.getAddress());

      contractURI = "newContractURI";
    });

    it("should emit ContractURIChanged event", async function () {
      await expect(bosonVoucher.connect(assistant).setContractURI(contractURI))
        .to.emit(bosonVoucher, "ContractURIChanged")
        .withArgs(contractURI);
    });

    it("should set new contract with success", async function () {
      await bosonVoucher.connect(assistant).setContractURI(contractURI);

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

  context("callExternalContract()", function () {
    let mockSimpleContract, calldata;

    beforeEach(async function () {
      // Deploy a random contract
      const MockSimpleContract = await getContractFactory("MockSimpleContract");
      mockSimpleContract = await MockSimpleContract.deploy();
      await mockSimpleContract.waitForDeployment();

      // Generate calldata
      calldata = mockSimpleContract.interface.encodeFunctionData("testEvent");
    });

    it("Should call external contract and emit its events", async function () {
      const tx = await bosonVoucher
        .connect(assistant)
        .callExternalContract(await mockSimpleContract.getAddress(), calldata);

      const receipt = await tx.wait();
      const event = getEvent(receipt, mockSimpleContract, "TestEvent");

      assert.equal(event._value.toString(), "1");
    });

    it("Should return the external contract return value", async function () {
      const calldata = mockSimpleContract.interface.encodeFunctionData("testReturn");
      const returnedValueRaw = await bosonVoucher
        .connect(assistant)
        .callExternalContract.staticCall(await mockSimpleContract.getAddress(), calldata);
      const abiCoder = new ethers.AbiCoder();
      const [returnedValue] = abiCoder.decode(["string"], returnedValueRaw);
      expect(returnedValue).to.equal("TestValue");
    });

    context("💔 Revert Reasons", async function () {
      it("_to is the zero address", async function () {
        await expect(
          bosonVoucher.connect(assistant).callExternalContract(ZeroAddress, calldata)
        ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_ADDRESS);
      });

      it("Caller is not the contract owner", async function () {
        await expect(
          bosonVoucher.connect(rando).callExternalContract(await mockSimpleContract.getAddress(), calldata)
        ).to.be.revertedWith(RevertReasons.OWNABLE_NOT_OWNER);
      });

      it("External call reverts", async function () {
        calldata = mockSimpleContract.interface.encodeFunctionData("testRevert");

        await expect(
          bosonVoucher.connect(assistant).callExternalContract(await mockSimpleContract.getAddress(), calldata)
        ).to.be.revertedWith("Reverted");
      });

      it("To address is not a contract", async function () {
        await expect(bosonVoucher.connect(assistant).callExternalContract(await rando.getAddress(), calldata)).to.be
          .reverted;
      });

      it("Owner tries to interact with contract with assets", async function () {
        const [erc20, erc721] = await deployMockTokens(["Foreign20", "Foreign721"]);
        const erc20Address = await erc20.getAddress();

        // transfer
        calldata = erc20.interface.encodeFunctionData("transfer", [await assistant.getAddress(), 20]);
        await expect(
          bosonVoucher.connect(assistant).callExternalContract(erc20Address, calldata)
        ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.INTERACTION_NOT_ALLOWED);

        // transferFrom
        calldata = erc20.interface.encodeFunctionData("transferFrom", [
          await bosonVoucher.getAddress(),
          await assistant.getAddress(),
          20,
        ]);
        await expect(
          bosonVoucher.connect(assistant).callExternalContract(erc20Address, calldata)
        ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.INTERACTION_NOT_ALLOWED);

        // approve
        calldata = erc20.interface.encodeFunctionData("approve", [await assistant.getAddress(), 20]);
        await expect(
          bosonVoucher.connect(assistant).callExternalContract(erc20Address, calldata)
        ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.INTERACTION_NOT_ALLOWED);

        // DAI
        const dai = await getContractAt("DAIAliases", ZeroAddress);

        // push
        calldata = dai.interface.encodeFunctionData("push", [await assistant.getAddress(), 20]);
        await expect(
          bosonVoucher.connect(assistant).callExternalContract(erc20Address, calldata)
        ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.INTERACTION_NOT_ALLOWED);

        // move
        calldata = dai.interface.encodeFunctionData("move", [
          await bosonVoucher.getAddress(),
          await assistant.getAddress(),
          20,
        ]);
        await expect(
          bosonVoucher.connect(assistant).callExternalContract(erc20Address, calldata)
        ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.INTERACTION_NOT_ALLOWED);

        // ERC721
        const erc721Address = await erc721.getAddress();
        // transferFrom
        calldata = erc721.interface.encodeFunctionData("transferFrom", [
          await bosonVoucher.getAddress(),
          await assistant.getAddress(),
          20,
        ]);
        await expect(
          bosonVoucher.connect(assistant).callExternalContract(erc721Address, calldata)
        ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.INTERACTION_NOT_ALLOWED);

        // transferFrom
        calldata = erc721.interface.encodeFunctionData("safeTransferFrom(address,address,uint256)", [
          await bosonVoucher.getAddress(),
          await assistant.getAddress(),
          20,
        ]);
        await expect(
          bosonVoucher.connect(assistant).callExternalContract(erc721Address, calldata)
        ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.INTERACTION_NOT_ALLOWED);

        // approve
        calldata = erc721.interface.encodeFunctionData("approve", [await assistant.getAddress(), 20]);
        await expect(
          bosonVoucher.connect(assistant).callExternalContract(erc721Address, calldata)
        ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.INTERACTION_NOT_ALLOWED);

        // setApprovalForAll
        calldata = erc721.interface.encodeFunctionData("setApprovalForAll", [await assistant.getAddress(), true]);
        await expect(
          bosonVoucher.connect(assistant).callExternalContract(erc721Address, calldata)
        ).to.be.revertedWithCustomError(bosonErrors, RevertReasons.INTERACTION_NOT_ALLOWED);
      });
    });
  });

  context("setApprovalForAllToContract", function () {
    it("Should emit ApprovalForAll event", async function () {
      await expect(bosonVoucher.connect(assistant).setApprovalForAllToContract(await rando.getAddress(), true))
        .to.emit(bosonVoucher, "ApprovalForAll")
        .withArgs(await bosonVoucher.getAddress(), await rando.getAddress(), true);
    });

    context("💔 Revert Reasons", async function () {
      it("should revert if caller is not the owner", async function () {
        // Expect revert if random user attempts to set approval
        await expect(
          bosonVoucher.connect(rando).setApprovalForAllToContract(await rando.getAddress(), true)
        ).to.revertedWith(RevertReasons.OWNABLE_NOT_OWNER);
      });

      it("should revert if operator is zero address", async function () {
        // Expect revert if random user attempts to set approval
        await expect(
          bosonVoucher.connect(assistant).setApprovalForAllToContract(ZeroAddress, true)
        ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_ADDRESS);
      });
    });
  });

  context("onERC721Received", function () {
    it("Should return correct selector value", async function () {
      const expectedSelector = bosonVoucher.interface.fragments.find((f) => f.name == "onERC721Received").selector;
      const returnedSelector = await bosonVoucher.onERC721Received.staticCall(
        await assistant.getAddress(),
        await rando.getAddress(),
        "1",
        "0x"
      );
      expect(returnedSelector).to.equal(expectedSelector);
    });
  });
});
