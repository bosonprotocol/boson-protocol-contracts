const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");

const Role = require("../../scripts/domain/Role");
const Seller = require("../../scripts/domain/Seller");
const Buyer = require("../../scripts/domain/Buyer");
const Offer = require("../../scripts/domain/Offer");
const Resolver = require("../../scripts/domain/Resolver");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { calculateProtocolFee } = require("../../scripts/util/test-utils.js");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");

/**
 *  Test the Boson Account Handler interface
 */
describe("IBosonAccountHandler", function () {
  // Common vars
  let InterfaceIds;
  let accounts, deployer, rando, operator, admin, clerk, treasury, other1, other2, other3, other4;
  let erc165, protocolDiamond, accessController, accountHandler, exchangeHandler, offerHandler, fundsHandler, gasLimit;
  let seller, sellerStruct, active, seller2, seller2Struct, id2;
  let buyer, buyerStruct, buyer2, buyer2Struct;
  let resolver, resolverStruct;
  let expected, nextAccountId;
  let support, invalidAccountId, id, key, value, exists;
  let oneMonth, oneWeek, blockNumber, block, protocolFeePrecentage;
  let bosonVoucher, clients;
  let offerId,
    sellerId,
    price,
    sellerDeposit,
    protocolFee,
    buyerCancelPenalty,
    quantityAvailable,
    validFromDate,
    validUntilDate,
    redeemableFromDate,
    fulfillmentPeriodDuration,
    voucherValidDuration,
    exchangeToken,
    metadataUri,
    metadataHash,
    voided,
    offer;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();
  });

  beforeEach(async function () {
    // Make accounts available
    accounts = await ethers.getSigners();
    deployer = accounts[0];
    operator = accounts[1];
    admin = accounts[2];
    clerk = accounts[3];
    treasury = accounts[4];
    rando = accounts[5];
    other1 = accounts[6];
    other2 = accounts[7];
    other3 = accounts[8];
    other4 = accounts[9];

    // Deploy the Protocol Diamond
    [protocolDiamond, , , accessController] = await deployProtocolDiamond();

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Grant PROTOCOL role to ProtocolDiamond address and renounces admin
    await accessController.grantRole(Role.PROTOCOL, protocolDiamond.address);

    // Cut the protocol handler facets into the Diamond
    await deployProtocolHandlerFacets(protocolDiamond, [
      "AccountHandlerFacet",
      "ExchangeHandlerFacet",
      "OfferHandlerFacet",
      "FundsHandlerFacet",
    ]);

    // Deploy the Protocol client implementation/proxy pairs (currently just the Boson Voucher)
    const protocolClientArgs = [accessController.address, protocolDiamond.address];
    [, , clients] = await deployProtocolClients(protocolClientArgs, gasLimit);
    [bosonVoucher] = clients;
    await accessController.grantRole(Role.CLIENT, bosonVoucher.address);

    // set protocolFeePrecentage
    protocolFeePrecentage = "200"; // 2 %

    // Add config Handler, so ids start at 1, and so voucher address can be found
    const protocolConfig = [
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      bosonVoucher.address,
      protocolFeePrecentage,
      "0",
      "0",
      "0",
      "0",
      "0",
    ];

    await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);

    // Cast Diamond to IERC165
    erc165 = await ethers.getContractAt("IERC165", protocolDiamond.address);

    // Cast Diamond to IBosonAccountHandler
    accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);

    // Cast Diamond to IBosonOfferHandler
    offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);

    // Cast Diamond to IBosonExchangeHandler
    exchangeHandler = await ethers.getContractAt("IBosonExchangeHandler", protocolDiamond.address);

    // Cast Diamond to IBosonFundsHandler
    fundsHandler = await ethers.getContractAt("IBosonFundsHandler", protocolDiamond.address);
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

  // All supported Seller methods
  context("📋 Seller Methods", async function () {
    beforeEach(async function () {
      // The first seller id
      nextAccountId = "1";
      invalidAccountId = "666";

      // Required constructor params
      id = "1"; // argument sent to contract for createSeller will be ignored
      active = true;

      // Create a valid seller, then set fields in tests directly
      seller = new Seller(id, operator.address, admin.address, clerk.address, treasury.address, active);
      expect(seller.isValid()).is.true;

      // How that seller looks as a returned struct
      sellerStruct = seller.toStruct();
    });

    context("👉 createSeller()", async function () {
      it("should emit a SellerCreated event", async function () {
        // Create a seller, testing for the event
        await expect(accountHandler.connect(admin).createSeller(seller))
          .to.emit(accountHandler, "SellerCreated")
          .withArgs(seller.id, sellerStruct);
      });

      it("should update state", async function () {
        // Create a seller
        await accountHandler.connect(admin).createSeller(seller);

        // Get the seller as a struct
        [, sellerStruct] = await accountHandler.connect(rando).getSeller(id);

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);

        // Returned values should match the input in createSeller
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should ignore any provided id and assign the next available", async function () {
        seller.id = "444";

        // Create a seller, testing for the event
        await expect(accountHandler.connect(admin).createSeller(seller))
          .to.emit(accountHandler, "SellerCreated")
          .withArgs(nextAccountId, sellerStruct);

        // wrong seller id should not exist
        [exists] = await accountHandler.connect(rando).getSeller(seller.id);
        expect(exists).to.be.false;

        // next seller id should exist
        [exists] = await accountHandler.connect(rando).getSeller(nextAccountId);
        expect(exists).to.be.true;
      });

      it("should be possible to use the same address for operator, admin, clerk, and treasury", async function () {
        seller.operator = other1.address;
        seller.admin = other1.address;
        seller.clerk = other1.address;
        seller.treasury = other1.address;

        //Create struct againw with new addresses
        sellerStruct = seller.toStruct();

        // Create a seller, testing for the event
        await expect(accountHandler.connect(admin).createSeller(seller))
          .to.emit(accountHandler, "SellerCreated")
          .withArgs(nextAccountId, sellerStruct);
      });

      context("💔 Revert Reasons", async function () {
        it("active is false", async function () {
          seller.active = false;

          // Attempt to Create a seller, expecting revert
          await expect(accountHandler.connect(admin).createSeller(seller)).to.revertedWith(
            RevertReasons.MUST_BE_ACTIVE
          );
        });

        it("addresses are the zero address", async function () {
          seller.operator = ethers.constants.AddressZero;

          // Attempt to Create a seller, expecting revert
          await expect(accountHandler.connect(admin).createSeller(seller)).to.revertedWith(
            RevertReasons.INVALID_ADDRESS
          );

          seller.operator = operator.address;
          seller.clerk = ethers.constants.AddressZero;

          // Attempt to Create a seller, expecting revert
          await expect(accountHandler.connect(admin).createSeller(seller)).to.revertedWith(
            RevertReasons.INVALID_ADDRESS
          );

          seller.clerk = clerk.address;
          seller.admin = ethers.constants.AddressZero;

          // Attempt to Create a seller, expecting revert
          await expect(accountHandler.connect(rando).createSeller(seller)).to.revertedWith(
            RevertReasons.INVALID_ADDRESS
          );
        });

        it("addresses are not unique to this seller Id", async function () {
          // Create a seller
          await accountHandler.connect(admin).createSeller(seller);

          seller.admin = other1.address;
          seller.clerk = other2.address;

          // Attempt to Create a seller with non-unique operator, expecting revert
          await expect(accountHandler.connect(rando).createSeller(seller)).to.revertedWith(
            RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE
          );

          seller.admin = admin.address;
          seller.operator = other1.address;

          // Attempt to Create a seller with non-unique admin, expecting revert
          await expect(accountHandler.connect(admin).createSeller(seller)).to.revertedWith(
            RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE
          );

          seller.clerk = clerk.address;
          seller.admin = other2.address;

          // Attempt to Create a seller with non-unique clerk, expecting revert
          await expect(accountHandler.connect(admin).createSeller(seller)).to.revertedWith(
            RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE
          );
        });
      });
    });

    context("👉 getSeller()", async function () {
      beforeEach(async function () {
        // Create a seller
        await accountHandler.connect(admin).createSeller(seller);

        // Required constructor params
        id = "2"; // argument sent to contract for createSeller will be ignored

        // Create a another seller
        seller2 = new Seller(id, other1.address, other2.address, other3.address, other4.address, active);
        expect(seller2.isValid()).is.true;

        await accountHandler.connect(rando).createSeller(seller2);
      });

      it("should return true for exists if seller is found", async function () {
        // Get the exists flag
        [exists] = await accountHandler.connect(rando).getSeller(id);

        // Validate
        expect(exists).to.be.true;
      });

      it("should return false for exists if seller is not found", async function () {
        // Get the exists flag
        [exists] = await accountHandler.connect(rando).getSeller(invalidAccountId);

        // Validate
        expect(exists).to.be.false;
      });

      it("should return the details of the correct seller as a struct if found", async function () {
        // Get the seller as a struct
        [, sellerStruct] = await accountHandler.connect(rando).getSeller(id);

        // Parse into entity
        seller = Seller.fromStruct(sellerStruct);

        // Validate
        expect(seller.isValid()).to.be.true;
      });
    });

    context("👉 getSellerByAddress()", async function () {
      beforeEach(async function () {
        // Create a seller
        await accountHandler.connect(rando).createSeller(seller);

        // Required constructor params
        id = "2"; // argument sent to contract for createSeller will be ignored
        active = true;

        // Create a another seller
        seller2 = new Seller(id, other1.address, other2.address, other3.address, other4.address, active);
        expect(seller2.isValid()).is.true;

        await accountHandler.connect(rando).createSeller(seller2);
      });

      it("should return the correct seller when searching on operator address", async function () {
        [exists, sellerStruct] = await accountHandler.connect(rando).getSellerByAddress(operator.address);

        expect(exists).is.true;

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);

        // Returned values should match the input in createSeller
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should return the correct seller when searching on admin address", async function () {
        [exists, sellerStruct] = await accountHandler.connect(rando).getSellerByAddress(admin.address);

        expect(exists).is.true;

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);

        // Returned values should match the input in createSeller
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should return the correct seller when searching on clerk address", async function () {
        [exists, sellerStruct] = await accountHandler.connect(rando).getSellerByAddress(clerk.address);

        expect(exists).is.true;

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);

        // Returned values should match the input in createSeller
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should return exists false and default values when searching on treasury address", async function () {
        [exists, sellerStruct] = await accountHandler.connect(rando).getSellerByAddress(treasury.address);

        expect(exists).is.false;

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);

        // Returned values should be the default value for it's data type
        for ([key, value] of Object.entries(returnedSeller)) {
          if (key != "active") {
            expect(value == 0).is.true || expect(value === ethers.constants.AddressZero).is.true;
          } else {
            expect(value).is.false;
          }
        }
      });

      it("should return exists false and default values when searching on unassociated address", async function () {
        [exists, sellerStruct] = await accountHandler.connect(rando).getSellerByAddress(deployer.address);

        expect(exists).is.false;

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);

        // Returned values should be the default value for it's data type
        for ([key, value] of Object.entries(returnedSeller)) {
          if (key != "active") {
            expect(value == 0).is.true || expect(value === ethers.constants.AddressZero).is.true;
          } else {
            expect(value).is.false;
          }
        }
      });
    });

    context("👉 updateSeller()", async function () {
      beforeEach(async function () {
        // Create a seller
        await accountHandler.connect(admin).createSeller(seller);

        // id of the current seller and increment nextAccountId
        id = nextAccountId++;
      });

      it("should emit a SellerUpdated event with correct values if values change", async function () {
        seller.operator = other1.address;
        seller.admin = other2.address;
        seller.clerk = other3.address;
        seller.treasury = other4.address;
        seller.active = false;

        sellerStruct = seller.toStruct();

        // Update a seller, testing for the event
        await expect(accountHandler.connect(admin).updateSeller(seller))
          .to.emit(accountHandler, "SellerUpdated")
          .withArgs(seller.id, sellerStruct);
      });

      it("should emit a SellerUpdated event with correct values if values stay the same", async function () {
        // Update a seller, testing for the event
        await expect(accountHandler.connect(admin).updateSeller(seller))
          .to.emit(accountHandler, "SellerUpdated")
          .withArgs(seller.id, sellerStruct);
      });

      it("should update state of all fields exceipt Id", async function () {
        seller.operator = other1.address;
        seller.admin = other2.address;
        seller.clerk = other3.address;
        seller.treasury = other4.address;
        seller.active = false;

        sellerStruct = seller.toStruct();

        // Update a seller
        await accountHandler.connect(admin).updateSeller(seller);

        // Get the seller as a struct
        [, sellerStruct] = await accountHandler.connect(rando).getSeller(seller.id);

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);

        // Returned values should match the input in updateSeller
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should update state correctly if values are the same", async function () {
        // Update a seller
        await accountHandler.connect(admin).updateSeller(seller);

        // Get the seller as a struct
        [, sellerStruct] = await accountHandler.connect(rando).getSeller(seller.id);

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);

        // Returned values should match the input in updateSeller
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should update only active flag", async function () {
        seller.active = false;

        sellerStruct = seller.toStruct();

        // Update a seller
        await accountHandler.connect(admin).updateSeller(seller);

        // Get the seller as a struct
        [, sellerStruct] = await accountHandler.connect(rando).getSeller(seller.id);

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);

        // Returned values should match the input in updateSeller
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should update only one address", async function () {
        seller.operator = other1.address;

        sellerStruct = seller.toStruct();

        // Update a seller
        await accountHandler.connect(admin).updateSeller(seller);

        // Get the seller as a struct
        [, sellerStruct] = await accountHandler.connect(rando).getSeller(seller.id);

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);

        // Returned values should match the input in updateSeller
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should update the correct seller", async function () {
        // Confgiure another seller
        id2 = nextAccountId++;
        seller2 = new Seller(id2.toString(), other1.address, other2.address, other3.address, other4.address, active);
        expect(seller2.isValid()).is.true;

        seller2Struct = seller2.toStruct();

        //Create seller2, testing for the event
        await expect(accountHandler.connect(rando).createSeller(seller2))
          .to.emit(accountHandler, "SellerCreated")
          .withArgs(seller2.id, seller2Struct);

        //Update first seller
        seller.operator = rando.address;
        seller.admin = rando.address;
        seller.clerk = rando.address;
        seller.treasury = rando.address;
        seller.active = false;

        sellerStruct = seller.toStruct();

        // Update a seller
        await accountHandler.connect(admin).updateSeller(seller);

        // Get the first seller as a struct
        [, sellerStruct] = await accountHandler.connect(rando).getSeller(seller.id);

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);

        // Returned values should match the input in updateSeller
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }

        //Check seller2 hasn't been changed
        [, seller2Struct] = await accountHandler.connect(rando).getSeller(seller2.id);

        // Parse into entity
        let returnedSeller2 = Seller.fromStruct(seller2Struct);

        //returnedSeller2 should still contain original values
        for ([key, value] of Object.entries(seller2)) {
          expect(JSON.stringify(returnedSeller2[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should be able to only update with new admin address", async function () {
        seller.admin = other2.address;
        sellerStruct = seller.toStruct();

        // Update a seller, testing for the event
        await expect(accountHandler.connect(admin).updateSeller(seller))
          .to.emit(accountHandler, "SellerUpdated")
          .withArgs(seller.id, sellerStruct);

        seller.admin = other3.address;
        sellerStruct = seller.toStruct();

        // Update a seller, testing for the event
        await expect(accountHandler.connect(other2).updateSeller(seller))
          .to.emit(accountHandler, "SellerUpdated")
          .withArgs(seller.id, sellerStruct);

        // Attempt to update the seller with original admin address, expecting revert
        await expect(accountHandler.connect(admin).updateSeller(seller)).to.revertedWith(RevertReasons.NOT_ADMIN);
      });

      context("💔 Revert Reasons", async function () {
        it("Seller does not exist", async function () {
          // Set invalid id
          seller.id = "444";

          // Attempt to update the seller, expecting revert
          await expect(accountHandler.connect(admin).updateSeller(seller)).to.revertedWith(
            RevertReasons.NO_SUCH_SELLER
          );

          // Set invalid id
          seller.id = "0";

          // Attempt to update the seller, expecting revert
          await expect(accountHandler.connect(admin).updateSeller(seller)).to.revertedWith(
            RevertReasons.NO_SUCH_SELLER
          );
        });

        it("Caller is not seller admin", async function () {
          // Attempt to update the seller, expecting revert
          await expect(accountHandler.connect(operator).updateSeller(seller)).to.revertedWith(RevertReasons.NOT_ADMIN);
        });

        it("addresses are the zero address", async function () {
          seller.operator = ethers.constants.AddressZero;

          // Attempt to update a seller, expecting revert
          await expect(accountHandler.connect(admin).updateSeller(seller)).to.revertedWith(
            RevertReasons.INVALID_ADDRESS
          );

          seller.operator = other1.address;
          seller.clerk = ethers.constants.AddressZero;

          // Attempt to update a seller, expecting revert

          await expect(accountHandler.connect(admin).updateSeller(seller)).to.revertedWith(
            RevertReasons.INVALID_ADDRESS
          );

          seller.clerk = other3.address;
          seller.admin = ethers.constants.AddressZero;

          // Attempt to update a seller, expecting revert
          await expect(accountHandler.connect(admin).updateSeller(seller)).to.revertedWith(
            RevertReasons.INVALID_ADDRESS
          );
        });

        it("addresses are not unique to this seller Id", async function () {
          seller.id = "2";
          seller.operator = other1.address;
          seller.admin = other2.address;
          seller.clerk = other3.address;
          seller.treasury = other4.address;
          seller.active = true;
          sellerStruct = seller.toStruct();

          //Create second seller
          await expect(accountHandler.connect(rando).createSeller(seller))
            .to.emit(accountHandler, "SellerCreated")
            .withArgs(nextAccountId, sellerStruct);

          //Set operator address value to be same as first seller created in Seller Methods beforeEach
          seller.operator = operator.address; //already being used by seller 1

          // Attempt to update seller 2 with non-unique operator, expecting revert
          await expect(accountHandler.connect(other2).updateSeller(seller)).to.revertedWith(
            RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE
          );

          seller.admin = admin.address; //already being used by seller 1
          seller.operator = other1.address;

          // Attempt to update a seller with non-unique admin, expecting revert
          await expect(accountHandler.connect(other2).updateSeller(seller)).to.revertedWith(
            RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE
          );

          seller.clerk = clerk.address; //already being used by seller 1
          seller.admin = other2.address;

          // Attempt to Update a seller with non-unique clerk, expecting revert
          await expect(accountHandler.connect(other2).updateSeller(seller)).to.revertedWith(
            RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE
          );
        });
      });
    });

    context("👉 getNextAccountId()", async function () {
      beforeEach(async function () {
        // Create a seller
        await accountHandler.connect(admin).createSeller(seller);

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
        await accountHandler.connect(admin).createSeller(seller);

        // What we expect the next account id to be
        expected = ++nextAccountId;

        // Get the next account id
        nextAccountId = await accountHandler.connect(rando).getNextAccountId();

        // Verify expectation
        expect(nextAccountId.toString() == expected).to.be.true;
      });

      it("should not be incremented when only getNextSellerId is called", async function () {
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

  // All supported Buyer methods
  context("📋 Buyer Methods", async function () {
    beforeEach(async function () {
      // The first buyer id
      nextAccountId = "1";
      invalidAccountId = "666";

      // Required constructor params
      id = "1"; // argument sent to contract for createBuyer will be ignored

      active = true;

      // Create a valid buyer, then set fields in tests directly
      buyer = new Buyer(id, other1.address, active);
      expect(buyer.isValid()).is.true;

      // How that buyer looks as a returned struct
      buyerStruct = buyer.toStruct();
    });

    context("👉 createBuyer()", async function () {
      it("should emit a BuyerCreated event", async function () {
        // Create a buyer, testing for the event
        await expect(accountHandler.connect(rando).createBuyer(buyer))
          .to.emit(accountHandler, "BuyerCreated")
          .withArgs(buyer.id, buyerStruct);
      });

      it("should update state", async function () {
        // Create a buyer
        await accountHandler.connect(rando).createBuyer(buyer);

        // Get the buyer as a struct
        [, buyerStruct] = await accountHandler.connect(rando).getBuyer(id);

        // Parse into entity
        let returnedBuyer = Buyer.fromStruct(buyerStruct);

        // Returned values should match the input in createBuyer
        for ([key, value] of Object.entries(buyer)) {
          expect(JSON.stringify(returnedBuyer[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should ignore any provided id and assign the next available", async function () {
        buyer.id = "444";

        // Create a buyer, testing for the event
        await expect(accountHandler.connect(rando).createBuyer(buyer))
          .to.emit(accountHandler, "BuyerCreated")
          .withArgs(nextAccountId, buyerStruct);

        // wrong buyer id should not exist
        [exists] = await accountHandler.connect(rando).getBuyer(buyer.id);
        expect(exists).to.be.false;

        // next buyer id should exist
        [exists] = await accountHandler.connect(rando).getBuyer(nextAccountId);
        expect(exists).to.be.true;
      });

      context("💔 Revert Reasons", async function () {
        it("active is false", async function () {
          buyer.active = false;

          // Attempt to Create a Buyer, expecting revert
          await expect(accountHandler.connect(rando).createBuyer(buyer)).to.revertedWith(RevertReasons.MUST_BE_ACTIVE);
        });

        it("addresses are the zero address", async function () {
          buyer.wallet = ethers.constants.AddressZero;

          // Attempt to Create a Buyer, expecting revert
          await expect(accountHandler.connect(rando).createBuyer(buyer)).to.revertedWith(RevertReasons.INVALID_ADDRESS);
        });

        it("wallet address is not unique to this buyerId", async function () {
          // Create a buyer
          await accountHandler.connect(rando).createBuyer(buyer);

          // Attempt to create another buyer with same wallet address
          await expect(accountHandler.connect(rando).createBuyer(buyer)).to.revertedWith(
            RevertReasons.BUYER_ADDRESS_MUST_BE_UNIQUE
          );
        });
      });
    });

    context("👉 updateBuyer()", async function () {
      beforeEach(async function () {
        // Create a buyer
        await accountHandler.connect(rando).createBuyer(buyer);

        // id of the current buyer and increment nextAccountId
        id = nextAccountId++;
      });

      it("should emit a BuyerUpdated event with correct values if values change", async function () {
        buyer.wallet = other2.address;
        buyer.active = false;
        expect(buyer.isValid()).is.true;

        buyerStruct = buyer.toStruct();

        //Update a buyer, testing for the event
        await expect(accountHandler.connect(other1).updateBuyer(buyer))
          .to.emit(accountHandler, "BuyerUpdated")
          .withArgs(buyer.id, buyerStruct);
      });

      it("should emit a BuyerUpdated event with correct values if values stay the same", async function () {
        //Update a buyer, testing for the event
        await expect(accountHandler.connect(other1).updateBuyer(buyer))
          .to.emit(accountHandler, "BuyerUpdated")
          .withArgs(buyer.id, buyerStruct);
      });

      it("should update state of all fields exceipt Id", async function () {
        buyer.wallet = other2.address;
        buyer.active = false;
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

      it("should update only active flag", async function () {
        buyer.active = false;
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

      it("should update only wallet address", async function () {
        buyer.wallet = other2.address;
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
        id2 = nextAccountId++;
        buyer2 = new Buyer(id2.toString(), other3.address, active);
        expect(buyer2.isValid()).is.true;

        buyer2Struct = buyer2.toStruct();

        //Create buyer2, testing for the event
        await expect(accountHandler.connect(rando).createBuyer(buyer2))
          .to.emit(accountHandler, "BuyerCreated")
          .withArgs(buyer2.id, buyer2Struct);

        //Update first buyer
        buyer.wallet = other2.address;
        buyer.active = false;
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
        buyer.wallet = other2.address;
        buyerStruct = buyer.toStruct();

        // Update buyer, testing for the event
        await expect(accountHandler.connect(other1).updateBuyer(buyer))
          .to.emit(accountHandler, "BuyerUpdated")
          .withArgs(buyer.id, buyerStruct);

        buyer.wallet = other3.address;
        buyerStruct = buyer.toStruct();

        // Update buyer, testing for the event
        await expect(accountHandler.connect(other2).updateBuyer(buyer))
          .to.emit(accountHandler, "BuyerUpdated")
          .withArgs(buyer.id, buyerStruct);

        // Attempt to update the buyer with original wallet address, expecting revert
        await expect(accountHandler.connect(other1).updateBuyer(buyer)).to.revertedWith(RevertReasons.NOT_BUYER_WALLET);
      });

      context("💔 Revert Reasons", async function () {
        beforeEach(async function () {
          // Initial ids for all the things
          id = sellerId = await accountHandler.connect(rando).getNextAccountId();
          offerId = await offerHandler.connect(rando).getNextOfferId();

          // Create a valid seller
          seller = new Seller(id.toString(), operator.address, admin.address, clerk.address, treasury.address, active);
          expect(seller.isValid()).is.true;

          // Create a seller
          await accountHandler.connect(admin).createSeller(seller);

          [exists, sellerStruct] = await accountHandler.connect(rando).getSellerByAddress(operator.address);
          expect(exists).is.true;

          // Create an offer to commit to
          oneWeek = 604800 * 1000; //  7 days in milliseconds
          oneMonth = 2678400 * 1000; // 31 days in milliseconds

          // Get the current block info
          blockNumber = await ethers.provider.getBlockNumber();
          block = await ethers.provider.getBlock(blockNumber);

          // Required constructor params
          price = ethers.utils.parseUnits("1.5", "ether").toString();
          sellerDeposit = ethers.utils.parseUnits("0.25", "ether").toString();
          protocolFee = calculateProtocolFee(sellerDeposit, price, protocolFeePrecentage);
          buyerCancelPenalty = ethers.utils.parseUnits("0.05", "ether").toString();
          quantityAvailable = "1";
          validFromDate = ethers.BigNumber.from(block.timestamp).toString(); // valid from now
          validUntilDate = ethers.BigNumber.from(block.timestamp)
            .add(oneMonth * 6)
            .toString(); // until 6 months
          redeemableFromDate = ethers.BigNumber.from(block.timestamp).add(oneWeek).toString(); // redeemable in 1 week
          fulfillmentPeriodDuration = oneMonth.toString(); // fulfillment period is one month
          voucherValidDuration = oneMonth.toString(); // offers valid for one month
          exchangeToken = ethers.constants.AddressZero.toString(); // Zero addy ~ chain base currency
          metadataHash = "QmYXc12ov6F2MZVZwPs5XeCBbf61cW3wKRk8h3D5NTYj4T";
          metadataUri = `https://ipfs.io/ipfs/${metadataHash}`;
          voided = false;

          // Create a valid offer entity
          offer = new Offer(
            offerId.toString(),
            sellerId.toString(),
            price,
            sellerDeposit,
            protocolFee,
            buyerCancelPenalty,
            quantityAvailable,
            validFromDate,
            validUntilDate,
            redeemableFromDate,
            fulfillmentPeriodDuration,
            voucherValidDuration,
            exchangeToken,
            metadataUri,
            metadataHash,
            voided
          );
          expect(offer.isValid()).is.true;

          // Create the offer
          await offerHandler.connect(operator).createOffer(offer);

          // Deposit seller funds so the commit will succeed
          await fundsHandler
            .connect(operator)
            .depositFunds(seller.id, ethers.constants.AddressZero, sellerDeposit, { value: sellerDeposit });

          //Commit to offer
          await exchangeHandler.connect(other1).commitToOffer(other1.address, offerId, { value: price });

          const balance = await bosonVoucher.connect(rando).balanceOf(other1.address);
          expect(balance).equal(1);
        });

        it("Buyer does not exist", async function () {
          // Set invalid id
          buyer.id = "444";

          // Attempt to update the buyer, expecting revert
          await expect(accountHandler.connect(other1).updateBuyer(buyer)).to.revertedWith(RevertReasons.NO_SUCH_BUYER);

          // Set invalid id
          buyer.id = "0";

          // Attempt to update the buyer, expecting revert
          await expect(accountHandler.connect(other1).updateBuyer(buyer)).to.revertedWith(RevertReasons.NO_SUCH_BUYER);
        });

        it("Caller is not buyer wallet address", async function () {
          // Attempt to update the buyer, expecting revert
          await expect(accountHandler.connect(other2).updateBuyer(buyer)).to.revertedWith(
            RevertReasons.NOT_BUYER_WALLET
          );
        });

        it("wallet address is the zero address", async function () {
          buyer.wallet = ethers.constants.AddressZero;

          // Attempt to update the buyer, expecting revert
          await expect(accountHandler.connect(other1).updateBuyer(buyer)).to.revertedWith(
            RevertReasons.INVALID_ADDRESS
          );
        });

        it("wallet address is unique to this seller Id", async function () {
          id = await accountHandler.connect(rando).getNextAccountId();

          buyer2 = new Buyer(id.toString(), other2.address, active);
          buyer2Struct = buyer2.toStruct();

          //Create second buyer, testing for the event
          await expect(accountHandler.connect(rando).createBuyer(buyer2))
            .to.emit(accountHandler, "BuyerCreated")
            .withArgs(buyer2.id, buyer2Struct);

          //Set wallet address value to be same as first buyer created in Buyer Methods beforeEach
          buyer2.wallet = other1.address; //already being used by buyer 1

          // Attempt to update buyer 2 with non-unique wallet address, expecting revert
          await expect(accountHandler.connect(other2).updateBuyer(buyer2)).to.revertedWith(
            RevertReasons.BUYER_ADDRESS_MUST_BE_UNIQUE
          );
        });

        it("current buyer wallet address has outstanding vouchers", async function () {
          buyer.wallet = other4.address;

          // Attempt to update the buyer, expecting revert
          await expect(accountHandler.connect(other1).updateBuyer(buyer)).to.revertedWith(
            RevertReasons.WALLET_OWNS_VOUCHERS
          );
        });
      });
    });

    context("👉 getBuyer()", async function () {
      beforeEach(async function () {
        // Create a buyer
        await accountHandler.connect(rando).createBuyer(buyer);

        // id of the current buyer and increment nextAccountId
        id = nextAccountId++;
      });

      it("should return true for exists if buyer is found", async function () {
        // Get the exists flag
        [exists] = await accountHandler.connect(rando).getBuyer(id);

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

  // All supported Resolver methods
  context("📋 Resolver Methods", async function () {
    beforeEach(async function () {
      // The first resolver id
      nextAccountId = "1";
      invalidAccountId = "666";

      // Required constructor params
      id = "1"; // argument sent to contract for createResolver will be ignored

      active = true;

      // Create a valid resolver, then set fields in tests directly
      resolver = new Resolver(id, other1.address, active);
      expect(resolver.isValid()).is.true;

      // How that resolver looks as a returned struct
      resolverStruct = resolver.toStruct();
    });

    context("👉 createResolver()", async function () {
      it("should emit a ResolverCreated event", async function () {
        // Create a resolver, testing for the event
        await expect(accountHandler.connect(rando).createResolver(resolver))
          .to.emit(accountHandler, "ResolverCreated")
          .withArgs(resolver.id, resolverStruct);
      });

      it("should update state", async function () {
        // Create a resolver
        await accountHandler.connect(rando).createResolver(resolver);

        // Get the resolver as a struct
        [, resolverStruct] = await accountHandler.connect(rando).getResolver(id);

        // Parse into entity
        let returnedResolver = Resolver.fromStruct(resolverStruct);

        // Returned values should match the input in createResolver
        for ([key, value] of Object.entries(resolver)) {
          expect(JSON.stringify(returnedResolver[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should ignore any provided id and assign the next available", async function () {
        resolver.id = "444";

        // Create a resolver, testing for the event
        await expect(accountHandler.connect(rando).createResolver(resolver))
          .to.emit(accountHandler, "ResolverCreated")
          .withArgs(nextAccountId, resolverStruct);

        // wrong resolver id should not exist
        [exists] = await accountHandler.connect(rando).getResolver(resolver.id);
        expect(exists).to.be.false;

        // next resolver id should exist
        [exists] = await accountHandler.connect(rando).getResolver(nextAccountId);
        expect(exists).to.be.true;
      });

      context("💔 Revert Reasons", async function () {
        it("active is false", async function () {
          resolver.active = false;

          // Attempt to Create a Resolver, expecting revert
          await expect(accountHandler.connect(rando).createResolver(resolver)).to.revertedWith(
            RevertReasons.MUST_BE_ACTIVE
          );
        });

        it("addresses are the zero address", async function () {
          resolver.wallet = ethers.constants.AddressZero;

          // Attempt to Create a Resolver, expecting revert
          await expect(accountHandler.connect(rando).createResolver(resolver)).to.revertedWith(
            RevertReasons.INVALID_ADDRESS
          );
        });

        it("wallet address is not unique to this buyerId", async function () {
          // Create a resolver
          await accountHandler.connect(rando).createResolver(resolver);

          // Attempt to create another resolver with same wallet address
          await expect(accountHandler.connect(rando).createResolver(resolver)).to.revertedWith(
            RevertReasons.RESOLVER_ADDRESS_MUST_BE_UNIQUE
          );
        });
      });
    });

    context("👉 getResolver()", async function () {
      beforeEach(async function () {
        // Create a resolver
        await accountHandler.connect(rando).createResolver(resolver);

        // id of the current resolver and increment nextAccountId
        id = nextAccountId++;
      });

      it("should return true for exists if resolver is found", async function () {
        // Get the exists flag
        [exists] = await accountHandler.connect(rando).getResolver(id);

        // Validate
        expect(exists).to.be.true;
      });

      it("should return false for exists if resolver is not found", async function () {
        // Get the exists flag
        [exists] = await accountHandler.connect(rando).getResolver(invalidAccountId);

        // Validate
        expect(exists).to.be.false;
      });

      it("should return the details of the resolver as a struct if found", async function () {
        // Get the buyer as a struct
        [, resolverStruct] = await accountHandler.connect(rando).getResolver(id);

        // Parse into entity
        resolver = Resolver.fromStruct(resolverStruct);

        // Validate
        expect(resolver.isValid()).to.be.true;
      });
    });
  });
});
