const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");

const Role = require("../../scripts/domain/Role");
const Seller = require("../../scripts/domain/Seller");
const Buyer = require("../../scripts/domain/Buyer");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");

/**
 *  Test the Boson Account Handler interface
 */
describe("IBosonAccountHandler", function () {
  // Common vars
  let InterfaceIds;
  let accounts, deployer, rando, operator, admin, clerk, treasury, other1, other2, other3, other4;
  let erc165, protocolDiamond, accessController, accountHandler, gasLimit;
  let seller, sellerStruct, active;
  let buyer, buyerStruct;
  let expected, nextAccountId;
  let support, invalidAccountId, id, key, value, exists;

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

    // Cut the protocol handler facets into the Diamond
    await deployProtocolHandlerFacets(protocolDiamond, ["AccountHandlerFacet"]);

    // Add config Handler, so seller id starts at 1
    const protocolConfig = [
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0",
      "0",
    ];

    await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);

    // Cast Diamond to IERC165
    erc165 = await ethers.getContractAt("IERC165", protocolDiamond.address);

    // Cast Diamond to IBosonAccountHandler
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

        // id of the current seller and increment nextAccountId
        id = nextAccountId++;
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

      it("should return the details of the seller as a struct if found", async function () {
        // Get the seller as a struct
        [, sellerStruct] = await accountHandler.connect(rando).getSeller(id);

        // Parse into entity
        seller = Seller.fromStruct(sellerStruct);

        // Validate
        expect(seller.isValid()).to.be.true;
      });
    });

    context("👉 updateSeller()", async function () {
      beforeEach(async function () {

        // Create a seller
        await accountHandler.connect(admin).createSeller(seller);

        // id of the current seller and increment nextAccountId
        id = nextAccountId++;

        //Set updated values
        seller.id = id.toString(); //same value
        seller.operator = other1.address;
        seller.admin = other2.address;
        seller.clerk = other3.address;
        seller.treasury = other4.address;
        seller.active = false;

        sellerStruct = seller.toStruct();
      });

      it("should emit a SellerUpdated event", async function () {
        // Update a seller, testing for the event
        await expect(accountHandler.connect(admin).updateSeller(seller))
        .to.emit(accountHandler, "SellerUpdated")
        .withArgs(seller.id, sellerStruct);
      });

      it("should update state", async function () {
        // Update a seller
        await accountHandler.connect(admin).updateSeller(seller);

        // Get the seller as a struct
        [, sellerStruct] = await accountHandler.connect(rando).getSeller(id);

        // Parse into entity
        let returnedSeller = Seller.fromStruct(sellerStruct);

        // Returned values should match the input in createSeller
        for ([key, value] of Object.entries(seller)) {
          expect(JSON.stringify(returnedSeller[key]) === JSON.stringify(value)).is.true;
        }
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
          await expect(accountHandler.connect(operator).updateSeller(seller)).to.revertedWith(
            RevertReasons.NOT_ADMIN
          );
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
          seller.id = "2"
          seller.active = true;
          sellerStruct = seller.toStruct();

          //Create second seller (has values other1.address, other2.address, etc.)
          await expect(accountHandler.connect(rando).createSeller(seller))
          .to.emit(accountHandler, "SellerCreated")
          .withArgs(nextAccountId, sellerStruct);

          //Set operator address value to be same as first seller created in Seller Methods beforeEach
          seller.operator = operator.address //already being used by seller 1
     
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
      // The first seller id
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
});
