const { ethers } = require("hardhat");
const { getContractAt, ZeroAddress, MaxUint256 } = ethers;
const { expect } = require("chai");

const Buyer = require("../../scripts/domain/Buyer");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const {
  calculateCloneAddress,
  calculateBosonProxyAddress,
  setupTestEnvironment,
  getSnapshot,
  revertToSnapshot,
} = require("../util/utils.js");
const {
  mockOffer,
  mockSeller,
  mockBuyer,
  mockDisputeResolver,
  mockVoucherInitValues,
  mockAuthToken,
  accountId,
} = require("../util/mock.js");

/**
 *  Test the Boson Buyer Handler
 */
describe("BuyerHandler", function () {
  // Common vars
  let pauser, rando, assistant, admin, clerk, treasury, other1, other2, other3, other4;
  let accountHandler, exchangeHandler, offerHandler, fundsHandler, pauseHandler;
  let seller;
  let emptyAuthToken;
  let buyer, buyerStruct, buyer2, buyer2Struct, expectedBuyer, expectedBuyerStruct;
  let disputeResolver;
  let disputeResolverFees;
  let sellerAllowList;
  let invalidAccountId, id, key, value, exists;
  let offerId;
  let bosonVoucher;
  let voucherInitValues;
  let snapshotId;
  let bosonErrors;

  before(async function () {
    accountId.next(true);

    // Specify contracts needed for this test
    const contracts = {
      accountHandler: "IBosonAccountHandler",
      offerHandler: "IBosonOfferHandler",
      exchangeHandler: "IBosonExchangeHandler",
      fundsHandler: "IBosonFundsHandler",
      pauseHandler: "IBosonPauseHandler",
    };

    ({
      signers: [pauser, admin, treasury, rando, other1, other2, other3, other4],
      contractInstances: { accountHandler, offerHandler, exchangeHandler, fundsHandler, pauseHandler },
    } = await setupTestEnvironment(contracts));

    bosonErrors = await getContractAt("BosonErrors", await accountHandler.getAddress());

    // make all account the same
    assistant = admin;
    clerk = { address: ZeroAddress };

    // Get snapshot id
    snapshotId = await getSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();
  });

  // All supported Buyer methods
  context("📋 Buyer Methods", async function () {
    beforeEach(async function () {
      // The first buyer id
      invalidAccountId = "666";

      // Create a valid buyer, then set fields in tests directly
      buyer = mockBuyer(await other1.getAddress());
      expect(buyer.isValid()).is.true;

      // How that buyer looks as a returned struct
      buyerStruct = buyer.toStruct();
    });

    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    context("👉 createBuyer()", async function () {
      it("should emit a BuyerCreated event", async function () {
        // Create a buyer, testing for the event
        await expect(accountHandler.connect(rando).createBuyer(buyer))
          .to.emit(accountHandler, "BuyerCreated")
          .withArgs(buyer.id, buyerStruct, await rando.getAddress());
      });

      it("should update state", async function () {
        // Create a buyer
        await accountHandler.connect(rando).createBuyer(buyer);

        // Get the buyer as a struct
        [, buyerStruct] = await accountHandler.connect(rando).getBuyer(buyer.id);

        // Parse into entity
        let returnedBuyer = Buyer.fromStruct(buyerStruct);

        // Returned values should match the input in createBuyer
        for ([key, value] of Object.entries(buyer)) {
          expect(JSON.stringify(returnedBuyer[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should ignore any provided id and assign the next available", async function () {
        // Create a buyer, testing for the event
        await expect(accountHandler.connect(rando).createBuyer({ ...buyer, id: invalidAccountId }))
          .to.emit(accountHandler, "BuyerCreated")
          .withArgs(buyer.id, buyerStruct, await rando.getAddress());

        // wrong buyer id should not exist
        [exists] = await accountHandler.connect(rando).getBuyer(invalidAccountId);
        expect(exists).to.be.false;

        // next buyer id should exist
        [exists] = await accountHandler.connect(rando).getBuyer(buyer.id);
        expect(exists).to.be.true;
      });

      context("💔 Revert Reasons", async function () {
        it("The buyers region of protocol is paused", async function () {
          // Pause the buyers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Buyers]);

          // Attempt to create a buyer, expecting revert
          await expect(accountHandler.connect(rando).createBuyer(buyer))
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Buyers);
        });

        it("active is false", async function () {
          buyer.active = false;

          // Attempt to Create a Buyer, expecting revert
          await expect(accountHandler.connect(rando).createBuyer(buyer)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.MUST_BE_ACTIVE
          );
        });

        it("addresses are the zero address", async function () {
          buyer.wallet = ZeroAddress;

          // Attempt to Create a Buyer, expecting revert
          await expect(accountHandler.connect(rando).createBuyer(buyer)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.INVALID_ADDRESS
          );
        });

        it("wallet address is not unique to this buyerId", async function () {
          // Create a buyer
          await accountHandler.connect(rando).createBuyer(buyer);

          // Attempt to create another buyer with same wallet address
          await expect(accountHandler.connect(rando).createBuyer(buyer)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.BUYER_ADDRESS_MUST_BE_UNIQUE
          );
        });
      });
    });

    context("👉 updateBuyer()", async function () {
      beforeEach(async function () {
        // Create a buyer
        await accountHandler.connect(rando).createBuyer(buyer);
      });

      it("should emit a BuyerUpdated event with correct values if values change", async function () {
        buyer.wallet = await other2.getAddress();
        buyer.active = false;
        expect(buyer.isValid()).is.true;

        //Update should not change id or active flag
        expectedBuyer = buyer.clone();
        expectedBuyer.active = true;
        expect(expectedBuyer.isValid()).is.true;
        expectedBuyerStruct = expectedBuyer.toStruct();

        //Update a buyer, testing for the event
        await expect(accountHandler.connect(other1).updateBuyer(buyer))
          .to.emit(accountHandler, "BuyerUpdated")
          .withArgs(buyer.id, expectedBuyerStruct, await other1.getAddress());
      });

      it("should emit a BuyerUpdated event with correct values if values stay the same", async function () {
        //Update a buyer, testing for the event
        await expect(accountHandler.connect(other1).updateBuyer(buyer))
          .to.emit(accountHandler, "BuyerUpdated")
          .withArgs(buyer.id, buyerStruct, await other1.getAddress());
      });

      it("should update state of all fields except Id and active flag", async function () {
        buyer.wallet = await other2.getAddress();
        buyer.active = false;
        expect(buyer.isValid()).is.true;

        //Update should not change id or active flag
        expectedBuyer = buyer.clone();
        expectedBuyer.active = true;
        expect(expectedBuyer.isValid()).is.true;

        // Update buyer
        await accountHandler.connect(other1).updateBuyer(buyer);

        // Get the buyer as a struct
        [, buyerStruct] = await accountHandler.connect(rando).getBuyer(buyer.id);

        // Parse into entity
        let returnedBuyer = Buyer.fromStruct(buyerStruct);

        // Returned values should match the expected values
        for ([key, value] of Object.entries(expectedBuyer)) {
          expect(JSON.stringify(returnedBuyer[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should update state correctly if values are the same", async function () {
        // Update buyer
        await accountHandler.connect(other1).updateBuyer(buyer);

        // Get the buyer as a struct
        [, buyerStruct] = await accountHandler.connect(rando).getBuyer(buyer.id);

        // Parse into entity
        let returnedBuyer = Buyer.fromStruct(buyerStruct);

        // Returned values should match the input in updateBuyer
        for ([key, value] of Object.entries(buyer)) {
          expect(JSON.stringify(returnedBuyer[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should update only wallet address", async function () {
        buyer.wallet = await other2.getAddress();
        expect(buyer.isValid()).is.true;

        buyerStruct = buyer.toStruct();

        // Update buyer
        await accountHandler.connect(other1).updateBuyer(buyer);

        // Get the buyer as a struct
        [, buyerStruct] = await accountHandler.connect(rando).getBuyer(buyer.id);

        // Parse into entity
        let returnedBuyer = Buyer.fromStruct(buyerStruct);

        // Returned values should match the input in updateBuyer
        for ([key, value] of Object.entries(buyer)) {
          expect(JSON.stringify(returnedBuyer[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should update the correct buyer", async function () {
        // Confgiure another buyer
        buyer2 = mockBuyer(await other3.getAddress());
        expect(buyer2.isValid()).is.true;

        buyer2Struct = buyer2.toStruct();

        //Create buyer2, testing for the event
        await expect(accountHandler.connect(rando).createBuyer(buyer2))
          .to.emit(accountHandler, "BuyerCreated")
          .withArgs(buyer2.id, buyer2Struct, await rando.getAddress());

        //Update first buyer
        buyer.wallet = await other2.getAddress();
        expect(buyer.isValid()).is.true;

        buyerStruct = buyer.toStruct();

        // Update a buyer
        await accountHandler.connect(other1).updateBuyer(buyer);

        // Get the first buyer as a struct
        [, buyerStruct] = await accountHandler.connect(rando).getBuyer(buyer.id);

        // Parse into entity
        let returnedBuyer = Buyer.fromStruct(buyerStruct);

        // Returned values should match the input in updateBuyer
        for ([key, value] of Object.entries(buyer)) {
          expect(JSON.stringify(returnedBuyer[key]) === JSON.stringify(value)).is.true;
        }

        //Check buyer hasn't been changed
        [, buyer2Struct] = await accountHandler.connect(rando).getBuyer(buyer2.id);

        // Parse into entity
        let returnedSeller2 = Buyer.fromStruct(buyer2Struct);

        //returnedSeller2 should still contain original values
        for ([key, value] of Object.entries(buyer2)) {
          expect(JSON.stringify(returnedSeller2[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should be able to only update second time with new wallet address", async function () {
        buyer.wallet = await other2.getAddress();
        buyerStruct = buyer.toStruct();

        // Update buyer, testing for the event
        await expect(accountHandler.connect(other1).updateBuyer(buyer))
          .to.emit(accountHandler, "BuyerUpdated")
          .withArgs(buyer.id, buyerStruct, await other1.getAddress());

        buyer.wallet = await other3.getAddress();
        buyerStruct = buyer.toStruct();

        // Update buyer, testing for the event
        await expect(accountHandler.connect(other2).updateBuyer(buyer))
          .to.emit(accountHandler, "BuyerUpdated")
          .withArgs(buyer.id, buyerStruct, await other2.getAddress());

        // Attempt to update the buyer with original wallet address, expecting revert
        await expect(accountHandler.connect(other1).updateBuyer(buyer)).to.revertedWithCustomError(
          bosonErrors,
          RevertReasons.NOT_BUYER_WALLET
        );
      });

      context("💔 Revert Reasons", async function () {
        beforeEach(async function () {
          // Initial ids for all the things
          id = await accountHandler.connect(rando).getNextAccountId();
          offerId = await offerHandler.connect(rando).getNextOfferId();
          let agentId = "0"; // agent id is optional while creating an offer
          const offerFeeLimit = MaxUint256; // unlimited offer fee to not affect the tests

          // Create a valid seller
          seller = mockSeller(
            await assistant.getAddress(),
            await admin.getAddress(),
            clerk.address,
            await treasury.getAddress()
          );
          seller.id = id.toString();
          expect(seller.isValid()).is.true;

          // AuthTokens
          emptyAuthToken = mockAuthToken();
          expect(emptyAuthToken.isValid()).is.true;

          // VoucherInitValues
          voucherInitValues = mockVoucherInitValues();
          expect(voucherInitValues.isValid()).is.true;

          // Create a seller
          await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

          [exists] = await accountHandler.connect(rando).getSellerByAddress(await assistant.getAddress());
          expect(exists).is.true;

          // Create a valid dispute resolver
          disputeResolver = mockDisputeResolver(
            await assistant.getAddress(),
            await admin.getAddress(),
            clerk.address,
            await treasury.getAddress(),
            true
          );
          disputeResolver.id = id + 1n;
          expect(disputeResolver.isValid()).is.true;

          //Create DisputeResolverFee array
          disputeResolverFees = [
            new DisputeResolverFee(await other1.getAddress(), "MockToken1", "0"),
            new DisputeResolverFee(await other2.getAddress(), "MockToken2", "0"),
            new DisputeResolverFee(await other3.getAddress(), "MockToken3", "0"),
            new DisputeResolverFee(ZeroAddress, "Native", "0"),
          ];

          // Add seller to sellerAllowList
          sellerAllowList = [seller.id];

          // Register the dispute resolver
          await accountHandler
            .connect(admin)
            .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

          // Mock the offer
          let { offer, offerDates, offerDurations } = await mockOffer();

          // Check if domains are valid
          expect(offer.isValid()).is.true;
          expect(offerDates.isValid()).is.true;
          expect(offerDurations.isValid()).is.true;

          // Create the offer
          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, {
              disputeResolverId: disputeResolver.id,
              mutualizerAddress: ZeroAddress
            }, agentId, offerFeeLimit);

          offerId = offer.id;
          const sellerDeposit = offer.sellerDeposit;

          // Deposit seller funds so the commit will succeed
          await fundsHandler
            .connect(assistant)
            .depositFunds(seller.id, ZeroAddress, sellerDeposit, { value: sellerDeposit });

          //Commit to offer
          await exchangeHandler
            .connect(other1)
            .commitToOffer(await other1.getAddress(), offerId, { value: offer.price });

          const beaconProxyAddress = await calculateBosonProxyAddress(await accountHandler.getAddress());
          const bosonVoucherCloneAddress = calculateCloneAddress(
            await accountHandler.getAddress(),
            beaconProxyAddress,
            admin.address
          );
          bosonVoucher = await getContractAt("IBosonVoucher", bosonVoucherCloneAddress);
          const balance = await bosonVoucher.connect(rando).balanceOf(await other1.getAddress());
          expect(balance).equal(1);
        });

        afterEach(async function () {
          // Reset the accountId iterator
          accountId.next(true);
        });

        it("The buyers region of protocol is paused", async function () {
          // Pause the buyers region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Buyers]);

          // Attempt to update a buyer, expecting revert
          await expect(accountHandler.connect(other1).updateBuyer(buyer))
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Buyers);
        });

        it("Buyer does not exist", async function () {
          // Set invalid id
          buyer.id = "444";

          // Attempt to update the buyer, expecting revert
          await expect(accountHandler.connect(other1).updateBuyer(buyer)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.NO_SUCH_BUYER
          );

          // Set invalid id
          buyer.id = "0";

          // Attempt to update the buyer, expecting revert
          await expect(accountHandler.connect(other1).updateBuyer(buyer)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.NO_SUCH_BUYER
          );
        });

        it("Caller is not buyer wallet address", async function () {
          // Attempt to update the buyer, expecting revert
          await expect(accountHandler.connect(other2).updateBuyer(buyer)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.NOT_BUYER_WALLET
          );
        });

        it("wallet address is the zero address", async function () {
          buyer.wallet = ZeroAddress;

          // Attempt to update the buyer, expecting revert
          await expect(accountHandler.connect(other1).updateBuyer(buyer)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.INVALID_ADDRESS
          );
        });

        it("wallet address is unique to this seller Id", async function () {
          id = await accountHandler.connect(rando).getNextAccountId();

          buyer2 = mockBuyer(await other2.getAddress());
          buyer2.id = id.toString();
          buyer2Struct = buyer2.toStruct();

          //Create second buyer, testing for the event
          await expect(accountHandler.connect(rando).createBuyer(buyer2))
            .to.emit(accountHandler, "BuyerCreated")
            .withArgs(buyer2.id, buyer2Struct, await rando.getAddress());

          //Set wallet address value to be same as first buyer created in Buyer Methods beforeEach
          buyer2.wallet = await other1.getAddress(); //already being used by buyer 1

          // Attempt to update buyer 2 with non-unique wallet address, expecting revert
          await expect(accountHandler.connect(other2).updateBuyer(buyer2)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.BUYER_ADDRESS_MUST_BE_UNIQUE
          );
        });

        it("current buyer wallet address has outstanding vouchers", async function () {
          buyer.wallet = await other4.getAddress();

          // Attempt to update the buyer, expecting revert
          await expect(accountHandler.connect(other1).updateBuyer(buyer)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.WALLET_OWNS_VOUCHERS
          );
        });
      });
    });

    context("👉 getBuyer()", async function () {
      beforeEach(async function () {
        // Create a buyer
        await accountHandler.connect(rando).createBuyer(buyer);
      });

      it("should return true for exists if buyer is found", async function () {
        // Get the exists flag
        [exists] = await accountHandler.connect(rando).getBuyer(buyer.id);

        // Validate
        expect(exists).to.be.true;
      });

      it("should return false for exists if buyer is not found", async function () {
        // Get the exists flag
        [exists] = await accountHandler.connect(rando).getBuyer(invalidAccountId);

        // Validate
        expect(exists).to.be.false;
      });

      it("should return the details of the buyer as a struct if found", async function () {
        // Get the buyer as a struct
        [, buyerStruct] = await accountHandler.connect(rando).getBuyer(id);

        // Parse into entity
        buyer = Buyer.fromStruct(buyerStruct);

        // Validate
        expect(buyer.isValid()).to.be.true;
      });
    });
  });
});
