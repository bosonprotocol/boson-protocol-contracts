const hre = require("hardhat");
const ethers = hre.ethers;
const { expect, assert } = require("chai");

const Role = require("../../scripts/domain/Role");
const Seller = require("../../scripts/domain/Seller");
const Buyer = require("../../scripts/domain/Buyer");
const DisputeResolver = require("../../scripts/domain/DisputeResolver");
const Agent = require("../../scripts/domain/Agent");
const { DisputeResolverFee, DisputeResolverFeeList } = require("../../scripts/domain/DisputeResolverFee");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
const { getEvent, calculateContractAddress } = require("../../scripts/util/test-utils.js");
const { oneWeek, oneMonth } = require("../utils/constants");
const { mockOffer } = require("../utils/mock.js");

/**
 *  Test the Boson Account Handler interface
 */
describe("IBosonAccountHandler", function () {
  // Common vars
  let InterfaceIds;
  let deployer, rando, operator, admin, clerk, treasury, other1, other2, other3, other4, other5;
  let erc165,
    protocolDiamond,
    accessController,
    accountHandler,
    exchangeHandler,
    offerHandler,
    fundsHandler,
    configHandler,
    gasLimit;
  let seller, sellerStruct, active, seller2, seller2Struct, id2;
  let buyer, buyerStruct, buyer2, buyer2Struct;
  let disputeResolver,
    disputeResolverStruct,
    disputeResolver2,
    disputeResolver2Struct,
    expectedDisputeResolver,
    expectedDisputeResolverStruct;
  let disputeResolverFees,
    disputeResolverFeeList,
    disputeResolverFeeListStruct,
    disputeResolverFeeListStruct2,
    disputeResolverFees2,
    feeTokenAddressesToRemove;
  let sellerAllowList, returnedSellerAllowList, idsToCheck, expectedStatus, allowedSellersToAdd, allowedSellersToRemove;
  let metadataUriDR;
  let agent, agentStruct, feePercentage;
  let expected, nextAccountId;
  let support, invalidAccountId, id, key, value, exists;
  let protocolFeePercentage, protocolFeeFlatBoson, buyerEscalationDepositPercentage;
  let offerId;
  let bosonVoucher;
  let expectedCloneAddress;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();
  });

  async function isValidDisputeResolverEvent(
    tx,
    eventName,
    disputeResolverId,
    disputeResolverStruct,
    disputeResolverFeeList,
    disputeResolverFeeListArrayPosition,
    sellerAllowList,
    executedBy
  ) {
    let valid = true;

    const txReceipt = await tx.wait();
    const event = getEvent(txReceipt, accountHandler, eventName);

    try {
      if (eventName == "DisputeResolverCreated") {
        assert.equal(
          event.disputeResolver.toString(),
          disputeResolverStruct.toString(),
          "Dispute Resolver is incorrect"
        );
        expect(DisputeResolver.fromStruct(event.disputeResolver).isValid()).is.true;
        assert.deepEqual(
          event.sellerAllowList.map((v) => v.toString()),
          sellerAllowList,
          "sellerAllowList is incorrect"
        );
      }
      assert.equal(event.disputeResolverId.toString(), disputeResolverId, "Dispute Resolver Id is incorrect");
      assert.equal(event.executedBy, executedBy, "executedBy is incorrect");

      const disputeResolverFeeListStruct = event[disputeResolverFeeListArrayPosition]; //DisputeResolverFees[] is in element 2 of the event array
      const disputeResolverFeeListObject = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct);
      expect(disputeResolverFeeListObject.isValid()).is.true;
      assert.equal(
        disputeResolverFeeListObject.toString(),
        disputeResolverFeeList.toString(),
        "Dispute Resolver Fee List is incorrect"
      );
    } catch (e) {
      console.log("Error in isValidDisputeResolverEvent ", e);
      valid = false;
    }

    return valid;
  }

  beforeEach(async function () {
    // Make accounts available
    [deployer, operator, admin, clerk, treasury, rando, other1, other2, other3, other4, other5] =
      await ethers.getSigners();

    //Dispute Resolver metadata URI
    metadataUriDR = `https://ipfs.io/ipfs/disputeResolver1`;

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
        treasuryAddress: "0x0000000000000000000000000000000000000000",
        tokenAddress: "0x0000000000000000000000000000000000000000",
        voucherBeaconAddress: beacon.address,
        beaconProxyAddress: proxy.address,
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
        maxDisputesPerBatch: 0,
        maxAllowedSellers: 100,
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

    // Cast Diamond to IBosonAccountHandler
    accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);

    // Cast Diamond to IBosonOfferHandler
    offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);

    // Cast Diamond to IBosonExchangeHandler
    exchangeHandler = await ethers.getContractAt("IBosonExchangeHandler", protocolDiamond.address);

    // Cast Diamond to IBosonFundsHandler
    fundsHandler = await ethers.getContractAt("IBosonFundsHandler", protocolDiamond.address);

    //Cast Diamond to IBosonConfigHancler
    configHandler = await ethers.getContractAt("IBosonConfigHandler", protocolDiamond.address);
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

      // expected address of the first clone
      expectedCloneAddress = calculateContractAddress(accountHandler.address, "1");
    });

    context("👉 createSeller()", async function () {
      it("should emit a SellerCreated event", async function () {
        // Create a seller, testing for the event
        await expect(accountHandler.connect(admin).createSeller(seller))
          .to.emit(accountHandler, "SellerCreated")
          .withArgs(seller.id, sellerStruct, expectedCloneAddress, admin.address);
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
          .withArgs(nextAccountId, sellerStruct, expectedCloneAddress, admin.address);

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

        //Create struct again with new addresses
        sellerStruct = seller.toStruct();

        // Create a seller, testing for the event
        await expect(accountHandler.connect(admin).createSeller(seller))
          .to.emit(accountHandler, "SellerCreated")
          .withArgs(nextAccountId, sellerStruct, expectedCloneAddress, admin.address);
      });

      it("should be possible to use non-unique treasury address", async function () {
        // Create a seller, testing for the event
        await expect(accountHandler.connect(rando).createSeller(seller))
          .to.emit(accountHandler, "SellerCreated")
          .withArgs(nextAccountId, sellerStruct, expectedCloneAddress, rando.address);

        nextAccountId++;

        seller.id = nextAccountId;
        seller.operator = other1.address;
        seller.admin = other2.address;
        seller.clerk = other3.address;

        //Create struct again with new addresses
        sellerStruct = seller.toStruct();

        // expected address of the first clone
        expectedCloneAddress = calculateContractAddress(accountHandler.address, "2");

        // Create a seller, testing for the event
        await expect(accountHandler.connect(rando).createSeller(seller))
          .to.emit(accountHandler, "SellerCreated")
          .withArgs(nextAccountId, sellerStruct, expectedCloneAddress, rando.address);
      });

      it("every seller should get a different clone address", async function () {
        // Create a seller, testing for the event
        await expect(accountHandler.connect(admin).createSeller(seller))
          .to.emit(accountHandler, "SellerCreated")
          .withArgs(seller.id, sellerStruct, expectedCloneAddress, admin.address);

        // second seller
        expectedCloneAddress = calculateContractAddress(accountHandler.address, "2");
        seller = new Seller(++id, other1.address, other1.address, other1.address, other1.address, active);

        // Create a seller, testing for the event
        await expect(accountHandler.connect(other1).createSeller(seller))
          .to.emit(accountHandler, "SellerCreated")
          .withArgs(seller.id, seller.toStruct(), expectedCloneAddress, other1.address);
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

        it("addresses are not unique to this seller Id when address used for same role", async function () {
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

        it("addresses are not unique to this seller Id when address used for different role", async function () {
          // Create a seller
          await accountHandler.connect(admin).createSeller(seller);

          //Set seller 2's admin address to seller 1's operator address
          seller.admin = operator.address;
          seller.operator = other2.address;
          seller.clerk = other3.address;

          // Attempt to Create a seller with non-unique operator, expecting revert
          await expect(accountHandler.connect(rando).createSeller(seller)).to.revertedWith(
            RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE
          );

          //Set seller 2's operator address to seller 1's clerk address
          seller.admin = other1.address;
          seller.operator = clerk.address;
          seller.clerk = other3.address;

          // Attempt to Create a seller with non-unique admin, expecting revert
          await expect(accountHandler.connect(admin).createSeller(seller)).to.revertedWith(
            RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE
          );

          //Set seller 2's clerk address to seller 1's admin address
          seller.admin = other1.address;
          seller.operator = other2.address;
          seller.clerk = admin.address;

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
          .withArgs(seller.id, sellerStruct, admin.address);
      });

      it("should emit a SellerUpdated event with correct values if values stay the same", async function () {
        // Update a seller, testing for the event
        await expect(accountHandler.connect(admin).updateSeller(seller))
          .to.emit(accountHandler, "SellerUpdated")
          .withArgs(seller.id, sellerStruct, admin.address);
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

        // expected address of the second clone
        expectedCloneAddress = calculateContractAddress(accountHandler.address, "2");

        //Create seller2, testing for the event
        await expect(accountHandler.connect(rando).createSeller(seller2))
          .to.emit(accountHandler, "SellerCreated")
          .withArgs(seller2.id, seller2Struct, expectedCloneAddress, rando.address);

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
          .withArgs(seller.id, sellerStruct, admin.address);

        seller.admin = other3.address;
        sellerStruct = seller.toStruct();

        // Update a seller, testing for the event
        await expect(accountHandler.connect(other2).updateSeller(seller))
          .to.emit(accountHandler, "SellerUpdated")
          .withArgs(seller.id, sellerStruct, other2.address);

        // Attempt to update the seller with original admin address, expecting revert
        await expect(accountHandler.connect(admin).updateSeller(seller)).to.revertedWith(RevertReasons.NOT_ADMIN);
      });

      it("should be possible to use non-unique treasury address", async function () {
        seller.operator = other1.address;
        seller.admin = other2.address;
        seller.clerk = other3.address;

        //Create struct again with new addresses
        sellerStruct = seller.toStruct();

        // Update a seller, testing for the event
        await expect(accountHandler.connect(admin).updateSeller(seller))
          .to.emit(accountHandler, "SellerUpdated")
          .withArgs(seller.id, sellerStruct, admin.address);
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

        it("addresses are not unique to this seller Id when addresses used for same role", async function () {
          seller.id = "2";
          seller.operator = other1.address;
          seller.admin = other2.address;
          seller.clerk = other3.address;
          seller.treasury = other4.address;
          seller.active = true;
          sellerStruct = seller.toStruct();
          expectedCloneAddress = calculateContractAddress(accountHandler.address, "2");

          //Create second seller
          await expect(accountHandler.connect(rando).createSeller(seller))
            .to.emit(accountHandler, "SellerCreated")
            .withArgs(nextAccountId, sellerStruct, expectedCloneAddress, rando.address);

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

        it("addresses are not unique to this seller Id when address used for different role", async function () {
          seller.id = "2";
          seller.operator = other1.address;
          seller.admin = other2.address;
          seller.clerk = other3.address;
          seller.treasury = other4.address;
          seller.active = true;
          sellerStruct = seller.toStruct();
          expectedCloneAddress = calculateContractAddress(accountHandler.address, "2");

          //Create second seller
          await expect(accountHandler.connect(rando).createSeller(seller))
            .to.emit(accountHandler, "SellerCreated")
            .withArgs(nextAccountId, sellerStruct, expectedCloneAddress, rando.address);

          //Set seller 2's admin address to seller 1's operator address
          seller.admin = operator.address;

          // Attempt to update seller 2 with non-unique operator, expecting revert
          await expect(accountHandler.connect(other2).updateSeller(seller)).to.revertedWith(
            RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE
          );

          //Set seller 2's operator address to seller 1's clerk address
          seller.admin = other2.address;
          seller.operator = clerk.address;

          // Attempt to update a seller with non-unique admin, expecting revert
          await expect(accountHandler.connect(other2).updateSeller(seller)).to.revertedWith(
            RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE
          );

          //Set seller 2's clerk address to seller 1's admin address
          seller.operator = other1.address;
          seller.clerk = admin.address;

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
          .withArgs(buyer.id, buyerStruct, rando.address);
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
          .withArgs(nextAccountId, buyerStruct, rando.address);

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
          .withArgs(buyer.id, buyerStruct, other1.address);
      });

      it("should emit a BuyerUpdated event with correct values if values stay the same", async function () {
        //Update a buyer, testing for the event
        await expect(accountHandler.connect(other1).updateBuyer(buyer))
          .to.emit(accountHandler, "BuyerUpdated")
          .withArgs(buyer.id, buyerStruct, other1.address);
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
          .withArgs(buyer2.id, buyer2Struct, rando.address);

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
          .withArgs(buyer.id, buyerStruct, other1.address);

        buyer.wallet = other3.address;
        buyerStruct = buyer.toStruct();

        // Update buyer, testing for the event
        await expect(accountHandler.connect(other2).updateBuyer(buyer))
          .to.emit(accountHandler, "BuyerUpdated")
          .withArgs(buyer.id, buyerStruct, other2.address);

        // Attempt to update the buyer with original wallet address, expecting revert
        await expect(accountHandler.connect(other1).updateBuyer(buyer)).to.revertedWith(RevertReasons.NOT_BUYER_WALLET);
      });

      context("💔 Revert Reasons", async function () {
        beforeEach(async function () {
          // Initial ids for all the things
          id = await accountHandler.connect(rando).getNextAccountId();
          offerId = await offerHandler.connect(rando).getNextOfferId();

          // Create a valid seller
          seller = new Seller(id.toString(), operator.address, admin.address, clerk.address, treasury.address, active);
          expect(seller.isValid()).is.true;

          // Create a seller
          await accountHandler.connect(admin).createSeller(seller);

          [exists, sellerStruct] = await accountHandler.connect(rando).getSellerByAddress(operator.address);
          expect(exists).is.true;

          // Create a valid dispute resolver
          active = true;
          disputeResolver = new DisputeResolver(
            id.add(1).toString(),
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
            new DisputeResolverFee(ethers.constants.AddressZero, "Native", "0"),
          ];

          // Add seller to sellerAllowList
          sellerAllowList = [seller.id];

          // Register the dispute resolver
          await accountHandler
            .connect(rando)
            .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
          await accountHandler.connect(deployer).activateDisputeResolver(++id);

          // Mock the offer
          let { offer, offerDates, offerDurations } = await mockOffer();

          // Check if domains are valid
          expect(offer.isValid()).is.true;
          expect(offerDates.isValid()).is.true;
          expect(offerDurations.isValid()).is.true;

          // Create the offer
          await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolver.id);

          offerId = offer.id;
          const sellerDeposit = offer.sellerDeposit;

          // Deposit seller funds so the commit will succeed
          await fundsHandler
            .connect(operator)
            .depositFunds(seller.id, ethers.constants.AddressZero, sellerDeposit, { value: sellerDeposit });

          //Commit to offer
          await exchangeHandler.connect(other1).commitToOffer(other1.address, offerId, { value: offer.price });

          const bosonVoucherCloneAddress = calculateContractAddress(exchangeHandler.address, "1");
          bosonVoucher = await ethers.getContractAt("IBosonVoucher", bosonVoucherCloneAddress);
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
            .withArgs(buyer2.id, buyer2Struct, rando.address);

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

  // All supported Dispute Resolver methods
  context("📋 Dispute Resolver Methods", async function () {
    beforeEach(async function () {
      // The first dispute resolver id
      nextAccountId = "1";
      invalidAccountId = "666";

      // Required constructor params
      id = "1"; // argument sent to contract for createDisputeResolver will be ignored

      active = true; //will be ignored by create and update functions

      // Create a valid dispute resolver, then set fields in tests directly
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

      // How that dispute resolver looks as a returned struct
      disputeResolverStruct = disputeResolver.toStruct();

      //Create DisputeResolverFee array
      disputeResolverFees = [
        new DisputeResolverFee(other1.address, "MockToken1", "100"),
        new DisputeResolverFee(other2.address, "MockToken2", "200"),
        new DisputeResolverFee(other3.address, "MockToken3", "300"),
      ];

      disputeResolverFeeList = new DisputeResolverFeeList(disputeResolverFees);

      // Create two additional sellers and create seller allow list
      seller = new Seller(id, operator.address, admin.address, clerk.address, treasury.address, active);
      seller2 = new Seller((++id).toString(), other1.address, other1.address, other1.address, other1.address, active);
      let seller3 = new Seller(
        (++id).toString(),
        other2.address,
        other2.address,
        other2.address,
        other2.address,
        active
      );

      await accountHandler.connect(admin).createSeller(seller);
      await accountHandler.connect(admin).createSeller(seller2);
      await accountHandler.connect(admin).createSeller(seller3);

      // Make a sellerAllowList
      sellerAllowList = ["3", "1"];
    });

    context("👉 createDisputeResolver()", async function () {
      beforeEach(async function () {
        expectedDisputeResolver = new DisputeResolver(
          (++id).toString(),
          oneMonth.toString(),
          operator.address,
          admin.address,
          clerk.address,
          treasury.address,
          metadataUriDR,
          false
        );
        expectedDisputeResolverStruct = expectedDisputeResolver.toStruct();
      });

      it("should emit a DisputeResolverCreated event if Dispute Resolver Fees are supplied", async function () {
        const tx = await accountHandler
          .connect(rando)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
        const valid = await isValidDisputeResolverEvent(
          tx,
          "DisputeResolverCreated",
          expectedDisputeResolver.id,
          expectedDisputeResolverStruct,
          disputeResolverFeeList,
          2,
          sellerAllowList,
          rando.address
        );
        expect(valid).is.true;
      });

      it("should emit a DisputeResolverCreated event if NO Dispute Resolver Fees are supplied", async function () {
        disputeResolverFees = [];
        disputeResolverFeeList = new DisputeResolverFeeList(disputeResolverFees);
        const tx = await accountHandler
          .connect(rando)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
        const valid = await isValidDisputeResolverEvent(
          tx,
          "DisputeResolverCreated",
          expectedDisputeResolver.id,
          expectedDisputeResolverStruct,
          disputeResolverFeeList,
          2,
          sellerAllowList,
          rando.address
        );
        expect(valid).is.true;
      });

      it("should update state if Dispute Resolver Fees and Seller Allow List are supplied", async function () {
        // Create a dispute resolver
        await accountHandler
          .connect(rando)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

        // Get the dispute resolver data as structs
        [, disputeResolverStruct, disputeResolverFeeListStruct, returnedSellerAllowList] = await accountHandler
          .connect(rando)
          .getDisputeResolver(id);

        // Parse into entity
        let returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);
        let returnedDisputeResolverFeeList = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct);
        expect(returnedDisputeResolver.isValid()).is.true;
        expect(returnedDisputeResolverFeeList.isValid()).is.true;

        // Returned values should match the expectedDisputeResolver
        for ([key, value] of Object.entries(expectedDisputeResolver)) {
          expect(JSON.stringify(returnedDisputeResolver[key]) === JSON.stringify(value)).is.true;
        }

        assert.equal(
          returnedDisputeResolverFeeList.toString(),
          disputeResolverFeeList.toString(),
          "Dispute Resolver Fee List is incorrect"
        );

        expect(returnedSellerAllowList.toString()).to.eql(sellerAllowList.toString(), "Allowed list wrong");

        // check that mappings of allowed selleres were updated
        idsToCheck = ["1", "2", "3", "4"];
        expectedStatus = [true, false, true, false]; // 1 and 3 are allowed
        const areSellersAllowed = await accountHandler.connect(rando).areSellersAllowed(id, idsToCheck);

        expect(areSellersAllowed).to.eql(expectedStatus, "Wrong statuses reported");
      });

      it("should update state if NO Dispute Resolver Fees are supplied and seller allow list is empty", async function () {
        disputeResolverFees = [];
        disputeResolverFeeList = new DisputeResolverFeeList(disputeResolverFees);
        sellerAllowList = [];

        // Create a dispute resolver
        await accountHandler
          .connect(rando)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

        // Get the dispute resolver data as structs
        [, disputeResolverStruct, disputeResolverFeeListStruct, returnedSellerAllowList] = await accountHandler
          .connect(rando)
          .getDisputeResolver(id);

        // Parse into entity
        let returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);
        let returnedDisputeResolverFeeList = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct);
        expect(returnedDisputeResolver.isValid()).is.true;
        expect(returnedDisputeResolverFeeList.isValid()).is.true;

        // Returned values should match the expectedDisputeResolver
        for ([key, value] of Object.entries(expectedDisputeResolver)) {
          expect(JSON.stringify(returnedDisputeResolver[key]) === JSON.stringify(value)).is.true;
        }

        assert.equal(
          returnedDisputeResolverFeeList.toString(),
          disputeResolverFeeList.toString(),
          "Dispute Resolver Fee List is incorrect"
        );

        expect(returnedSellerAllowList).to.eql(sellerAllowList, "Allowed list wrong");

        // check that mappings of allowed selleres were updated
        idsToCheck = ["1", "2", "3", "4"];
        expectedStatus = [true, true, true, false]; // ids 1,2 and 3 are sellers so the should be allowed
        const areSellersAllowed = await accountHandler.connect(rando).areSellersAllowed(id, idsToCheck);

        expect(areSellersAllowed).to.eql(expectedStatus, "Wrong statuses reported");
      });

      it("should allow same fee token to be specified for multiple dispute resolvers", async function () {
        // Create a dispute resolver 1
        await accountHandler
          .connect(rando)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

        // Get the dispute resolver data as structs
        [, disputeResolverStruct, disputeResolverFeeListStruct] = await accountHandler
          .connect(rando)
          .getDisputeResolver(expectedDisputeResolver.id);

        // Parse into entity
        let returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);
        let returnedDisputeResolverFeeList = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct);
        expect(returnedDisputeResolver.isValid()).is.true;
        expect(returnedDisputeResolverFeeList.isValid()).is.true;

        // Returned values should match the expectedDisputeResolver
        for ([key, value] of Object.entries(expectedDisputeResolver)) {
          expect(JSON.stringify(returnedDisputeResolver[key]) === JSON.stringify(value)).is.true;
        }

        assert.equal(
          returnedDisputeResolverFeeList.toString(),
          disputeResolverFeeList.toString(),
          "Dispute Resolver Fee List is incorrect"
        );

        // Create a dispute resolver 2
        id2 = ++id;
        disputeResolver2 = new DisputeResolver(
          id2.toString(),
          oneMonth.toString(),
          other1.address,
          other2.address,
          other3.address,
          other4.address,
          metadataUriDR,
          false
        );
        expect(disputeResolver2.isValid()).is.true;

        await accountHandler
          .connect(rando)
          .createDisputeResolver(disputeResolver2, disputeResolverFees, sellerAllowList);

        let disputeResolverStruct2;

        // Get the dispute resolver data as structs
        [, disputeResolverStruct2, disputeResolverFeeListStruct2] = await accountHandler
          .connect(rando)
          .getDisputeResolver(id2);

        // Parse into entity
        let returnedDisputeResolver2 = DisputeResolver.fromStruct(disputeResolverStruct2);
        let returnedDisputeResolverFeeList2 = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct2);
        expect(returnedDisputeResolver2.isValid()).is.true;
        expect(returnedDisputeResolverFeeList2.isValid()).is.true;

        // Returned values should match the expectedDisputeResolver
        for ([key, value] of Object.entries(disputeResolver2)) {
          expect(JSON.stringify(returnedDisputeResolver2[key]) === JSON.stringify(value)).is.true;
        }

        assert.equal(
          returnedDisputeResolverFeeList2.toString(),
          disputeResolverFeeList.toString(),
          "Dispute Resolver Fee List is incorrect"
        );
      });

      it("should ignore any provided id and assign the next available", async function () {
        disputeResolver.id = "444";

        // Create a dispute resolver, testing for the event
        const tx = await accountHandler
          .connect(rando)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
        const valid = await isValidDisputeResolverEvent(
          tx,
          "DisputeResolverCreated",
          expectedDisputeResolver.id,
          expectedDisputeResolverStruct,
          disputeResolverFeeList,
          2,
          sellerAllowList,
          rando.address
        );
        expect(valid).is.true;

        // wrong dispute resolver id should not exist
        [exists] = await accountHandler.connect(rando).getDisputeResolver(disputeResolver.id);
        expect(exists).to.be.false;

        // next dispute resolver id should exist
        [exists] = await accountHandler.connect(rando).getDisputeResolver(id);
        expect(exists).to.be.true;
      });

      it("should be possible to use non-unique treasury address", async function () {
        const tx = await accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees);
        let valid = await isValidDisputeResolverEvent(
          tx,
          "DisputeResolverCreated",
          disputeResolver.id,
          expectedDisputeResolverStruct,
          disputeResolverFeeList,
          2,
          rando.address
        );
        expect(valid).is.true;

        nextAccountId++;

        // Create a valid dispute resolver, then set fields in tests directly
        disputeResolver2 = new DisputeResolver(
          nextAccountId.toString(),
          oneMonth.toString(),
          other1.address,
          other2.address,
          other3.address,
          treasury.address,
          metadataUriDR,
          false
        );
        expect(disputeResolver2.isValid()).is.true;

        expectedDisputeResolverStruct = disputeResolver2.toStruct();

        const tx2 = await accountHandler.connect(rando).createDisputeResolver(disputeResolver2, disputeResolverFees);
        valid = await isValidDisputeResolverEvent(
          tx2,
          "DisputeResolverCreated",
          disputeResolver2.id,
          expectedDisputeResolverStruct,
          disputeResolverFeeList,
          2,
          rando.address
        );
        expect(valid).is.true;
      });

      context("💔 Revert Reasons", async function () {
        it("Any address is the zero address", async function () {
          disputeResolver.operator = ethers.constants.AddressZero;

          // Attempt to Create a DisputeResolver, expecting revert
          await expect(
            accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList)
          ).to.revertedWith(RevertReasons.INVALID_ADDRESS);

          disputeResolver.operator = operator.address;
          disputeResolver.admin = ethers.constants.AddressZero;

          // Attempt to Create a DisputeResolver, expecting revert
          await expect(
            accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList)
          ).to.revertedWith(RevertReasons.INVALID_ADDRESS);

          disputeResolver.admin = admin.address;
          disputeResolver.clerk = ethers.constants.AddressZero;

          // Attempt to Create a DisputeResolver, expecting revert
          await expect(
            accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList)
          ).to.revertedWith(RevertReasons.INVALID_ADDRESS);

          disputeResolver.clerk = clerk.address;
          disputeResolver.treasury = ethers.constants.AddressZero;

          // Attempt to Create a DisputeResolver, expecting revert
          await expect(
            accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList)
          ).to.revertedWith(RevertReasons.INVALID_ADDRESS);
        });

        it("Any address is not unique to this dispute resolver Id for the the same role", async function () {
          id = await accountHandler.connect(rando).getNextAccountId();

          disputeResolver2 = new DisputeResolver(
            id.toString(),
            oneMonth.toString(),
            operator.address,
            other2.address,
            other3.address,
            other4.address,
            metadataUriDR,
            active
          );
          expect(disputeResolver2.isValid()).is.true;
          disputeResolver2Struct = disputeResolver2.toStruct();

          //Create dispute resolver 1
          accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

          // Attempt to create another dispute resolver with same addresses
          await expect(
            accountHandler.connect(rando).createDisputeResolver(disputeResolver2, disputeResolverFees, sellerAllowList)
          ).to.revertedWith(RevertReasons.DISPUTE_RESOLVER_ADDRESS_MUST_BE_UNIQUE);

          //Set each address value to be same as dispute resolver 1 and expect revert
          disputeResolver2.operator = rando.address;
          disputeResolver2.admin = admin.address;

          // Attempt to create another dispute resolver with same addresses
          await expect(
            accountHandler.connect(rando).createDisputeResolver(disputeResolver2, disputeResolverFees, sellerAllowList)
          ).to.revertedWith(RevertReasons.DISPUTE_RESOLVER_ADDRESS_MUST_BE_UNIQUE);

          disputeResolver2.admin = other2.address;
          disputeResolver2.clerk = clerk.address;

          // Attempt to create another dispute resolver with same addresses
          await expect(
            accountHandler.connect(rando).createDisputeResolver(disputeResolver2, disputeResolverFees, sellerAllowList)
          ).to.revertedWith(RevertReasons.DISPUTE_RESOLVER_ADDRESS_MUST_BE_UNIQUE);
        });

        it("Any address is not unique to this dispute resolver Id for a different role", async function () {
          id = await accountHandler.connect(rando).getNextAccountId();

          //Set dispute resolver 2's admin address to dispute resolver 1's operator address
          disputeResolver2 = new DisputeResolver(
            id.toString(),
            oneMonth.toString(),
            other1.address,
            operator.address,
            other3.address,
            other4.address,
            metadataUriDR,
            active
          );
          expect(disputeResolver2.isValid()).is.true;
          disputeResolver2Struct = disputeResolver2.toStruct();

          //Create dispute resolver 1
          accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees);

          // Attempt to create another dispute resolver with non-unique admin address
          await expect(
            accountHandler.connect(rando).createDisputeResolver(disputeResolver2, disputeResolverFees)
          ).to.revertedWith(RevertReasons.DISPUTE_RESOLVER_ADDRESS_MUST_BE_UNIQUE);

          //Set dispute resolver 2's operator address to dispute resolver 1's clerk address
          disputeResolver2.admin = other2.address;
          disputeResolver2.operator = clerk.address;

          // Attempt to create another dispute resolver with non-unique operator address
          await expect(
            accountHandler.connect(rando).createDisputeResolver(disputeResolver2, disputeResolverFees)
          ).to.revertedWith(RevertReasons.DISPUTE_RESOLVER_ADDRESS_MUST_BE_UNIQUE);

          //Set dispute resolver 2's clerk address to dispute resolver 1's admin address
          disputeResolver2.operator = other1.address;
          disputeResolver2.clerk = admin.address;

          // Attempt to create another dispute resolver with non-unique clerk address
          await expect(
            accountHandler.connect(rando).createDisputeResolver(disputeResolver2, disputeResolverFees)
          ).to.revertedWith(RevertReasons.DISPUTE_RESOLVER_ADDRESS_MUST_BE_UNIQUE);
        });

        it("DisputeResolverFees above max", async function () {
          await configHandler.setMaxFeesPerDisputeResolver(2);

          // Attempt to Create a DisputeResolver, expecting revert
          await expect(
            accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList)
          ).to.revertedWith(RevertReasons.INVALID_AMOUNT_DISPUTE_RESOLVER_FEES);
        });

        it("EscalationResponsePeriod is invalid", async function () {
          await configHandler.setMaxEscalationResponsePeriod(oneWeek);

          // Attempt to Create a DisputeResolver, expecting revert
          await expect(
            accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList)
          ).to.revertedWith(RevertReasons.INVALID_ESCALATION_PERIOD);

          disputeResolver.escalationResponsePeriod = 0;

          // Attempt to Create a DisputeResolver, expecting revert
          await expect(
            accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList)
          ).to.revertedWith(RevertReasons.INVALID_ESCALATION_PERIOD);
        });

        it("Duplicate dispute resolver fees", async function () {
          //Create new DisputeResolverFee array
          disputeResolverFees2 = [
            new DisputeResolverFee(other1.address, "MockToken1", "100"),
            new DisputeResolverFee(other2.address, "MockToken2", "200"),
            new DisputeResolverFee(other3.address, "MockToken3", "300"),
            new DisputeResolverFee(other2.address, "MockToken2", "200"),
          ];

          // Create a dispute resolver
          await expect(
            accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees2, sellerAllowList)
          ).to.revertedWith(RevertReasons.DUPLICATE_DISPUTE_RESOLVER_FEES);
        });

        it("DisputeResolverFees above max", async function () {
          sellerAllowList = new Array(101).fill("1");

          // Attempt to Create a DisputeResolver, expecting revert
          await expect(
            accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList)
          ).to.revertedWith(RevertReasons.INVALID_AMOUNT_ALLOWED_SELLERS);
        });

        it("Duplicate dispute resolver fees", async function () {
          //Create new sellerAllowList array
          sellerAllowList = ["3", "2", "8"];

          // Create a dispute resolver
          await expect(
            accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList)
          ).to.revertedWith(RevertReasons.NO_SUCH_SELLER);
        });

        it("Some seller id is duplicated", async function () {
          //Create new sellerAllowList array
          sellerAllowList = ["1", "2", "1"];

          // Create a dispute resolver
          await expect(
            accountHandler.connect(rando).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList)
          ).to.revertedWith(RevertReasons.SELLER_ALREADY_APPROVED);
        });
      });
    });

    context("👉 getDisputeResolver()", async function () {
      beforeEach(async function () {
        //Create DisputeResolverFee array
        disputeResolverFees = [
          new DisputeResolverFee(other1.address, "MockToken1", "100"),
          new DisputeResolverFee(other2.address, "MockToken2", "200"),
          new DisputeResolverFee(other3.address, "MockToken3", "300"),
        ];

        sellerAllowList = ["1"];

        // Create a dispute resolver
        await accountHandler
          .connect(rando)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

        // id of the current dispute resolver and increment nextAccountId
        disputeResolver.id = ++id;
      });

      it("should return true for exists if dispute resolver is found", async function () {
        // Get the exists flag
        [exists] = await accountHandler.connect(rando).getDisputeResolver(disputeResolver.id);

        // Validate
        expect(exists).to.be.true;
      });

      it("should return false for exists if dispute resolver is not found", async function () {
        // Get the exists flag
        [exists] = await accountHandler.connect(rando).getDisputeResolver(invalidAccountId);

        // Validate
        expect(exists).to.be.false;
      });

      it("should return the details of the dispute resolver as structs if found", async function () {
        // Get the dispute resolver as a struct
        [, disputeResolverStruct, disputeResolverFeeListStruct, returnedSellerAllowList] = await accountHandler
          .connect(rando)
          .getDisputeResolver(disputeResolver.id);

        // Parse into entity
        disputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);
        disputeResolverFeeList = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct);

        // Validate
        expect(disputeResolver.isValid()).to.be.true;
        expect(disputeResolverFeeList.isValid()).to.be.true;

        let valid =
          Array.isArray(returnedSellerAllowList) &&
          returnedSellerAllowList.reduce(
            (previousAllowedSeller, currentAllowedSeller) =>
              previousAllowedSeller && typeof ethers.BigNumber.from(currentAllowedSeller) === "object",
            true
          );
        expect(valid).to.be.true;
      });
    });

    context("👉 areSellersAllowed()", async function () {
      beforeEach(async function () {
        //Create DisputeResolverFee array
        disputeResolverFees = [new DisputeResolverFee(other1.address, "MockToken1", "100")];

        // id of the current dispute resolver
        ++id;
      });

      it("Dispute resolver allows all sellers", async function () {
        // Make a sellerAllowList
        sellerAllowList = [];

        // Create a dispute resolver
        await accountHandler
          .connect(rando)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

        idsToCheck = ["1", "2", "3", "4"];
        expectedStatus = [true, true, true, false]; // 1,2 and 3 are sellers, 4 is not a seller

        // Get the statuese flag
        const areSellersAllowed = await accountHandler.connect(rando).areSellersAllowed(id, idsToCheck);

        expect(areSellersAllowed).to.eql(expectedStatus, "Wrong statuses reported");
      });

      it("Dispute resolver has an allow list", async function () {
        // Make a sellerAllowList
        sellerAllowList = ["3", "1"];

        // Create a dispute resolver
        await accountHandler
          .connect(rando)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

        idsToCheck = ["1", "2", "3", "4"];
        expectedStatus = [true, false, true, false]; // 1 and 3 are allowed, 2 is not, 4 is not a seller

        // Get the statuese flag
        const areSellersAllowed = await accountHandler.connect(rando).areSellersAllowed(id, idsToCheck);

        expect(areSellersAllowed).to.eql(expectedStatus, "Wrong statuses reported");
      });

      it("Dispute resolved does not exist", async function () {
        // not DR id
        id = "16";

        idsToCheck = ["1", "2", "3", "4"];
        expectedStatus = [false, false, false, false]; // since DR does not exist everything is false

        // Get the statuese flag
        const areSellersAllowed = await accountHandler.connect(rando).areSellersAllowed(id, idsToCheck);

        expect(areSellersAllowed).to.eql(expectedStatus, "Wrong statuses reported");
      });
    });

    context("👉 updateDisputeResolver()", async function () {
      beforeEach(async function () {
        // Create a dispute resolver from objects in Dispute Resolver Methods beforeEach
        disputeResolver.id = (++id).toString();
        await accountHandler
          .connect(rando)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

        expectedDisputeResolver = disputeResolver.clone();
        expectedDisputeResolver.active = false;
        expectedDisputeResolverStruct = expectedDisputeResolver.toStruct();
      });

      it("should emit a DisputeResolverUpdated event with correct values if values change", async function () {
        disputeResolver.escalationResponsePeriod = Number(
          Number(disputeResolver.escalationResponsePeriod) - oneWeek
        ).toString();
        disputeResolver.operator = other1.address;
        disputeResolver.admin = other2.address;
        disputeResolver.clerk = other3.address;
        disputeResolver.treasury = other4.address;
        disputeResolver.metadataUri = "https://ipfs.io/ipfs/updatedUri";
        disputeResolver.active = true;
        expect(disputeResolver.isValid()).is.true;

        expectedDisputeResolver = disputeResolver.clone();
        expectedDisputeResolver.active = false;
        expectedDisputeResolverStruct = expectedDisputeResolver.toStruct();

        //Update a dispute resolver, testing for the event
        await expect(accountHandler.connect(admin).updateDisputeResolver(disputeResolver))
          .to.emit(accountHandler, "DisputeResolverUpdated")
          .withArgs(disputeResolver.id, expectedDisputeResolverStruct, admin.address);
      });

      it("should emit a DisputeResolverUpdated event with correct values if values stay the same", async function () {
        await expect(accountHandler.connect(admin).updateDisputeResolver(disputeResolver))
          .to.emit(accountHandler, "DisputeResolverUpdated")
          .withArgs(disputeResolver.id, expectedDisputeResolverStruct, admin.address);
      });

      it("should update state of all fields except Id and active flag and fees", async function () {
        disputeResolver.escalationResponsePeriod = Number(
          Number(disputeResolver.escalationResponsePeriod) - oneWeek
        ).toString();
        disputeResolver.operator = other1.address;
        disputeResolver.admin = other2.address;
        disputeResolver.clerk = other3.address;
        disputeResolver.treasury = other4.address;
        disputeResolver.metadataUri = "https://ipfs.io/ipfs/updatedUri";
        disputeResolver.active = true;
        expect(disputeResolver.isValid()).is.true;

        expectedDisputeResolver = disputeResolver.clone();
        expectedDisputeResolver.active = false;

        // Update disupte resolver
        await accountHandler.connect(admin).updateDisputeResolver(disputeResolver);

        // Get the disupte resolver as structs
        [, disputeResolverStruct, disputeResolverFeeListStruct] = await accountHandler
          .connect(rando)
          .getDisputeResolver(disputeResolver.id);

        // Parse into entity
        let returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);
        let returnedDisputeResolverFeeList = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct);
        expect(returnedDisputeResolver.isValid()).is.true;
        expect(returnedDisputeResolverFeeList.isValid()).is.true;

        // Returned values should match the input in updateDisputeResolver
        for ([key, value] of Object.entries(expectedDisputeResolver)) {
          expect(JSON.stringify(returnedDisputeResolver[key]) === JSON.stringify(value)).is.true;
        }
        assert.equal(
          returnedDisputeResolverFeeList.toString(),
          disputeResolverFeeList.toString(),
          "Dispute Resolver Fee List is incorrect"
        );
      });

      it("should update state correctly if values are the same", async function () {
        // Update disupte resolver
        await accountHandler.connect(admin).updateDisputeResolver(disputeResolver);

        [, disputeResolverStruct, disputeResolverFeeListStruct] = await accountHandler
          .connect(rando)
          .getDisputeResolver(expectedDisputeResolver.id);

        // Parse into entity
        let returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);
        let returnedDisputeResolverFeeList = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct);
        expect(returnedDisputeResolver.isValid()).is.true;
        expect(returnedDisputeResolverFeeList.isValid()).is.true;
        expect(returnedDisputeResolver.isValid()).is.true;

        // Returned values should match the input in updateDisputeResolver
        for ([key, value] of Object.entries(expectedDisputeResolver)) {
          expect(JSON.stringify(returnedDisputeResolver[key]) === JSON.stringify(value)).is.true;
        }
        assert.equal(
          returnedDisputeResolverFeeList.toString(),
          disputeResolverFeeList.toString(),
          "Dispute Resolver Fee List is incorrect"
        );
      });

      it("should ignore active flag passed in", async function () {
        disputeResolver.active = true;
        expect(disputeResolver.isValid()).is.true;

        // Update disupte resolver
        await accountHandler.connect(admin).updateDisputeResolver(disputeResolver);

        // Get the disupte resolver as a struct
        [, disputeResolverStruct] = await accountHandler.connect(rando).getDisputeResolver(disputeResolver.id);

        // Parse into entity
        let returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);

        // Returned values should match expected values
        for ([key, value] of Object.entries(expectedDisputeResolver)) {
          expect(JSON.stringify(returnedDisputeResolver[key]) === JSON.stringify(value)).is.true;
        }

        //ADMIN role activates Dispute Resolver
        await accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id);

        disputeResolver.acitve = false;
        expect(disputeResolver.isValid()).is.true;
        expectedDisputeResolver.active = true;
        expect(expectedDisputeResolver.isValid()).is.true;

        // Update disupte resolver
        await accountHandler.connect(admin).updateDisputeResolver(disputeResolver);

        // Get the disupte resolver as a struct
        [, disputeResolverStruct] = await accountHandler.connect(rando).getDisputeResolver(disputeResolver.id);

        // Parse into entity
        returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);

        // Returned values should match expected values
        for ([key, value] of Object.entries(expectedDisputeResolver)) {
          expect(JSON.stringify(returnedDisputeResolver[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should update only one address", async function () {
        disputeResolver.operator = other2.address;
        expect(disputeResolver.isValid()).is.true;

        expectedDisputeResolver = disputeResolver.clone();
        expectedDisputeResolver.active = false;

        disputeResolverStruct = disputeResolver.toStruct();

        // Update disupte resolver
        await accountHandler.connect(admin).updateDisputeResolver(disputeResolver);

        // Get the disupte resolver as a struct
        [, disputeResolverStruct] = await accountHandler.connect(rando).getDisputeResolver(disputeResolver.id);

        // Parse into entity
        let returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);

        // Returned values should match expected values
        for ([key, value] of Object.entries(expectedDisputeResolver)) {
          expect(JSON.stringify(returnedDisputeResolver[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should update the correct dispute resolver", async function () {
        // Configure another dispute resolver
        id2 = ++id;
        disputeResolver2 = new DisputeResolver(
          id2.toString(),
          oneMonth.toString(),
          other1.address,
          other2.address,
          other3.address,
          other4.address,
          metadataUriDR,
          active
        );
        expect(disputeResolver2.isValid()).is.true;

        const expectedDisputeResolver2 = disputeResolver2.clone();
        expectedDisputeResolver2.active = false;
        const expectedDisputeResolverStruct2 = expectedDisputeResolver2.toStruct();

        //Create DisputeResolverFee array
        disputeResolverFees2 = [new DisputeResolverFee(rando.address, "RandomToken", "250")];

        const disputeResolverFeeList2 = new DisputeResolverFeeList(disputeResolverFees2);

        //Create disputeResolver2 testing, for the event
        const tx = await accountHandler
          .connect(rando)
          .createDisputeResolver(disputeResolver2, disputeResolverFees2, sellerAllowList);
        const valid = await isValidDisputeResolverEvent(
          tx,
          "DisputeResolverCreated",
          disputeResolver2.id,
          expectedDisputeResolverStruct2,
          disputeResolverFeeList2,
          2,
          sellerAllowList,
          rando.address
        );
        expect(valid).is.true;

        //Update first dispute resolver values
        disputeResolver.escalationResponsePeriod = Number(
          Number(disputeResolver.escalationResponsePeriod) - oneWeek
        ).toString();
        disputeResolver.operator = rando.address;
        disputeResolver.admin = rando.address;
        disputeResolver.clerk = rando.address;
        disputeResolver.treasury = rando.address;
        disputeResolver.metadataUri = "https://ipfs.io/ipfs/updatedUri";
        disputeResolver.active = false;
        expect(disputeResolver.isValid()).is.true;

        expectedDisputeResolver = disputeResolver.clone();
        expectedDisputeResolverStruct = expectedDisputeResolver.toStruct();

        // Update the first dispute resolver
        await accountHandler.connect(admin).updateDisputeResolver(disputeResolver);

        [, disputeResolverStruct, disputeResolverFeeListStruct] = await accountHandler
          .connect(rando)
          .getDisputeResolver(expectedDisputeResolver.id);

        // Parse into entity
        let returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);
        let returnedDisputeResolverFeeList = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct);
        expect(returnedDisputeResolver.isValid()).is.true;
        expect(returnedDisputeResolverFeeList.isValid()).is.true;

        // Returned values should match expectedDisputeResolver
        for ([key, value] of Object.entries(expectedDisputeResolver)) {
          expect(JSON.stringify(returnedDisputeResolver[key]) === JSON.stringify(value)).is.true;
        }

        assert.equal(
          returnedDisputeResolverFeeList.toString(),
          disputeResolverFeeList.toString(),
          "Dispute Resolver Fee List is incorrect"
        );

        //Check dispute resolver 2 hasn't been changed
        [, disputeResolver2Struct, disputeResolverFeeListStruct2] = await accountHandler
          .connect(rando)
          .getDisputeResolver(disputeResolver2.id);

        // Parse into entity
        let returnedDisputeResolver2 = DisputeResolver.fromStruct(disputeResolver2Struct);
        let returnedDisputeResolverFeeList2 = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct2);
        expect(returnedDisputeResolver2.isValid()).is.true;
        expect(returnedDisputeResolverFeeList2.isValid()).is.true;

        //returnedDisputeResolver2 should still contain original values
        for ([key, value] of Object.entries(expectedDisputeResolver2)) {
          expect(JSON.stringify(returnedDisputeResolver2[key]) === JSON.stringify(value)).is.true;
        }

        assert.equal(
          returnedDisputeResolverFeeList2.toString(),
          disputeResolverFeeList2.toString(),
          "Dispute Resolver Fee List is incorrect"
        );
      });

      it("should be able to only update second time with new admin address", async function () {
        disputeResolver.admin = other2.address;
        expectedDisputeResolver = disputeResolver.clone();
        expectedDisputeResolver.active = false;
        expectedDisputeResolverStruct = expectedDisputeResolver.toStruct();

        //Update a dispute resolver, testing for the event
        await expect(accountHandler.connect(admin).updateDisputeResolver(disputeResolver))
          .to.emit(accountHandler, "DisputeResolverUpdated")
          .withArgs(disputeResolver.id, expectedDisputeResolverStruct, admin.address);

        disputeResolver.admin = other3.address;
        expectedDisputeResolver = disputeResolver.clone();
        expectedDisputeResolver.active = false;
        expectedDisputeResolverStruct = expectedDisputeResolver.toStruct();

        //Update a dispute resolver, testing for the event
        await expect(accountHandler.connect(other2).updateDisputeResolver(disputeResolver))
          .to.emit(accountHandler, "DisputeResolverUpdated")
          .withArgs(disputeResolver.id, expectedDisputeResolverStruct, other2.address);

        // Attempt to update the dispute resolver with original admin address, expecting revert
        await expect(accountHandler.connect(admin).updateDisputeResolver(disputeResolver)).to.revertedWith(
          RevertReasons.NOT_ADMIN
        );
      });

      it("should be possible to use non-unique treasury address", async function () {
        // Update dispute resolver fields
        disputeResolver.operator = other1.address;
        disputeResolver.admin = other2.address;
        disputeResolver.clerk = other3.address;
        disputeResolver.active = false;
        expect(disputeResolver.isValid()).is.true;

        expectedDisputeResolverStruct = disputeResolver.toStruct();

        //Update a dispute resolver, testing for the event
        await expect(accountHandler.connect(admin).updateDisputeResolver(disputeResolver))
          .to.emit(accountHandler, "DisputeResolverUpdated")
          .withArgs(disputeResolver.id, expectedDisputeResolverStruct, admin.address);
      });

      context("💔 Revert Reasons", async function () {
        it("Dispute resolver does not exist", async function () {
          // Set invalid id
          disputeResolver.id = "444";

          // Attempt to update the dispute resolver, expecting revert
          await expect(accountHandler.connect(other1).updateDisputeResolver(disputeResolver)).to.revertedWith(
            RevertReasons.NO_SUCH_DISPUTE_RESOLVER
          );

          // Set invalid id
          disputeResolver.id = "0";

          // Attempt to update the dispute resolver, expecting revert
          await expect(accountHandler.connect(other1).updateDisputeResolver(disputeResolver)).to.revertedWith(
            RevertReasons.NO_SUCH_DISPUTE_RESOLVER
          );
        });

        it("Caller is not dispute resolver admin address", async function () {
          // Attempt to update the disputer resolver, expecting revert
          await expect(accountHandler.connect(other2).updateDisputeResolver(disputeResolver)).to.revertedWith(
            RevertReasons.NOT_ADMIN
          );
        });

        it("Any address is the zero address", async function () {
          disputeResolver.operator = ethers.constants.AddressZero;

          // Attempt to update the disputer resolver, expecting revert
          await expect(accountHandler.connect(admin).updateDisputeResolver(disputeResolver)).to.revertedWith(
            RevertReasons.INVALID_ADDRESS
          );

          disputeResolver.operator = operator.address;
          disputeResolver.admin = ethers.constants.AddressZero;

          // Attempt to update the disputer resolver, expecting revert
          await expect(accountHandler.connect(admin).updateDisputeResolver(disputeResolver)).to.revertedWith(
            RevertReasons.INVALID_ADDRESS
          );

          disputeResolver.admin = admin.address;
          disputeResolver.clerk = ethers.constants.AddressZero;

          // Attempt to update the disputer resolver, expecting revert
          await expect(accountHandler.connect(admin).updateDisputeResolver(disputeResolver)).to.revertedWith(
            RevertReasons.INVALID_ADDRESS
          );

          disputeResolver.clerk = clerk.address;
          disputeResolver.treasury = ethers.constants.AddressZero;

          // Attempt to update the disputer resolver, expecting revert
          await expect(accountHandler.connect(admin).updateDisputeResolver(disputeResolver)).to.revertedWith(
            RevertReasons.INVALID_ADDRESS
          );
        });

        it("Any address is not unique to this dispute resolver Id for the same role", async function () {
          id = await accountHandler.connect(rando).getNextAccountId();

          disputeResolver2 = new DisputeResolver(
            id.toString(),
            oneMonth.toString(),
            other1.address,
            other2.address,
            other3.address,
            other4.address,
            metadataUriDR,
            active
          );
          expect(disputeResolver2.isValid()).is.true;
          disputeResolver2Struct = disputeResolver2.toStruct();
          await accountHandler
            .connect(admin)
            .createDisputeResolver(disputeResolver2, disputeResolverFees, sellerAllowList);

          //Set each address value to be same as disputeResolver2 and expect revert
          disputeResolver.operator = other1.address;

          // Attempt to update dispute resolver 1 with non-unique admin address, expecting revert
          await expect(accountHandler.connect(admin).updateDisputeResolver(disputeResolver)).to.revertedWith(
            RevertReasons.DISPUTE_RESOLVER_ADDRESS_MUST_BE_UNIQUE
          );

          disputeResolver.admin = other2.address;

          // Attempt to update dispute resolver 1 with non-unique admin address, expecting revert
          await expect(accountHandler.connect(admin).updateDisputeResolver(disputeResolver)).to.revertedWith(
            RevertReasons.DISPUTE_RESOLVER_ADDRESS_MUST_BE_UNIQUE
          );

          disputeResolver.clerk = other3.address;

          // Attempt to update dispute resolver 1 with non-unique clerk address, expecting revert
          await expect(accountHandler.connect(admin).updateDisputeResolver(disputeResolver)).to.revertedWith(
            RevertReasons.DISPUTE_RESOLVER_ADDRESS_MUST_BE_UNIQUE
          );
        });

        it("Any address is not unique to this dispute resolver Id for a different role", async function () {
          id = await accountHandler.connect(rando).getNextAccountId();

          disputeResolver2 = new DisputeResolver(
            id.toString(),
            oneMonth.toString(),
            other1.address,
            other2.address,
            other3.address,
            other4.address,
            metadataUriDR,
            active
          );

          expect(disputeResolver2.isValid()).is.true;
          //disputeResolver2Struct = disputeResolver2.toStruct();
          await accountHandler.connect(admin).createDisputeResolver(disputeResolver2, disputeResolverFees);

          //Set dispute resolver 2's admin address to dispute resolver 1's operator address
          disputeResolver2.admin = operator.address;

          // Attempt to update dispute resolver 1 with non-unique admin address, expecting revert
          await expect(accountHandler.connect(other2).updateDisputeResolver(disputeResolver2)).to.revertedWith(
            RevertReasons.DISPUTE_RESOLVER_ADDRESS_MUST_BE_UNIQUE
          );

          //Set dispute resolver 2's operator address to dispute resolver 1's clerk address
          disputeResolver2.admin = other2.address;
          disputeResolver2.operator = clerk.address;

          // Attempt to update dispute resolver 1 with non-unique operator address, expecting revert
          await expect(accountHandler.connect(other2).updateDisputeResolver(disputeResolver2)).to.revertedWith(
            RevertReasons.DISPUTE_RESOLVER_ADDRESS_MUST_BE_UNIQUE
          );

          //Set dispute resolver 2's clerk address to dispute resolver 1's admin address
          disputeResolver2.operator = other1.address;
          disputeResolver2.clerk = admin.address;

          // Attempt to update dispute resolver 1 with non-unique clerk address, expecting revert
          await expect(accountHandler.connect(other2).updateDisputeResolver(disputeResolver2)).to.revertedWith(
            RevertReasons.DISPUTE_RESOLVER_ADDRESS_MUST_BE_UNIQUE
          );
        });

        it("EscalationResponsePeriod is invalid", async function () {
          await configHandler.setMaxEscalationResponsePeriod(oneWeek);

          // Attempt to update a DisputeResolver, expecting revert
          await expect(accountHandler.connect(admin).updateDisputeResolver(disputeResolver)).to.revertedWith(
            RevertReasons.INVALID_ESCALATION_PERIOD
          );

          disputeResolver.escalationResponsePeriod = 0;

          // Attempt to update a DisputeResolver, expecting revert
          await expect(accountHandler.connect(admin).updateDisputeResolver(disputeResolver)).to.revertedWith(
            RevertReasons.INVALID_ESCALATION_PERIOD
          );
        });
      });
    });

    context("👉 addFeesToDisputeResolver()", async function () {
      beforeEach(async function () {
        disputeResolver.id = (++id).toString();
        await accountHandler
          .connect(rando)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

        // How that dispute resolver looks as a returned struct
        disputeResolverStruct = disputeResolver.toStruct();

        expectedDisputeResolver = disputeResolver.clone();
        expectedDisputeResolver.active = false;
        expectedDisputeResolverStruct = expectedDisputeResolver.toStruct();
      });

      it("should emit a DisputeResolverFeesAdded event", async function () {
        const disputeResolverFeesToAdd = [
          new DisputeResolverFee(other4.address, "MockToken4", "400"),
          new DisputeResolverFee(other5.address, "MockToken5", "500"),
        ];

        const addedDisputeResolverFeeList = new DisputeResolverFeeList(disputeResolverFeesToAdd);

        const tx = await accountHandler
          .connect(admin)
          .addFeesToDisputeResolver(disputeResolver.id, disputeResolverFeesToAdd);

        const valid = await isValidDisputeResolverEvent(
          tx,
          "DisputeResolverFeesAdded",
          disputeResolver.id,
          "dummy value",
          addedDisputeResolverFeeList,
          1,
          [],
          admin.address
        );

        expect(valid).is.true;
      });

      it("should update DisputeResolverFee state only", async function () {
        const disputeResolverFeesToAdd = [
          new DisputeResolverFee(other4.address, "MockToken4", "400"),
          new DisputeResolverFee(other5.address, "MockToken5", "500"),
        ];

        const expectedDisputeResovlerFees = (disputeResolverFees = [
          new DisputeResolverFee(other1.address, "MockToken1", "100"),
          new DisputeResolverFee(other2.address, "MockToken2", "200"),
          new DisputeResolverFee(other3.address, "MockToken3", "300"),
          new DisputeResolverFee(other4.address, "MockToken4", "400"),
          new DisputeResolverFee(other5.address, "MockToken5", "500"),
        ]);
        const expectedDisputeResolverFeeList = new DisputeResolverFeeList(expectedDisputeResovlerFees);

        // Add fees to dispute resolver
        await accountHandler.connect(admin).addFeesToDisputeResolver(disputeResolver.id, disputeResolverFeesToAdd);

        // Get the dispute resolver data as structs
        [, disputeResolverStruct, disputeResolverFeeListStruct, returnedSellerAllowList] = await accountHandler
          .connect(rando)
          .getDisputeResolver(disputeResolver.id);

        // Parse into entity
        let returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);
        let returnedDisputeResolverFeeList = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct);
        expect(returnedDisputeResolver.isValid()).is.true;
        expect(returnedDisputeResolverFeeList.isValid()).is.true;

        // Returned values should match expectedDisputeResolver
        for ([key, value] of Object.entries(expectedDisputeResolver)) {
          expect(JSON.stringify(returnedDisputeResolver[key]) === JSON.stringify(value)).is.true;
        }

        assert.equal(
          returnedDisputeResolverFeeList.toString(),
          expectedDisputeResolverFeeList.toString(),
          "Dispute Resolver Fee List is incorrect"
        );

        expect(returnedSellerAllowList.toString()).to.eql(sellerAllowList.toString(), "Allowed list wrong");
      });

      context("💔 Revert Reasons", async function () {
        it("Dispute resolver does not exist", async function () {
          // Set invalid id
          disputeResolver.id = "444";

          // Attempt to add fees to the dispute resolver, expecting revert
          await expect(
            accountHandler.connect(admin).addFeesToDisputeResolver(disputeResolver.id, disputeResolverFees)
          ).to.revertedWith(RevertReasons.NO_SUCH_DISPUTE_RESOLVER);

          // Set invalid id
          disputeResolver.id = "0";

          // Attempt to add fees to the dispute resolver, expecting revert
          await expect(
            accountHandler.connect(admin).addFeesToDisputeResolver(disputeResolver.id, disputeResolverFees)
          ).to.revertedWith(RevertReasons.NO_SUCH_DISPUTE_RESOLVER);
        });

        it("Caller is not dispute resolver admin address", async function () {
          // Attempt to add fees to the dispute resolver, expecting revert
          await expect(
            accountHandler.connect(rando).addFeesToDisputeResolver(disputeResolver.id, disputeResolverFees)
          ).to.revertedWith(RevertReasons.NOT_ADMIN);
        });

        it("DisputeResolverFees empty", async function () {
          disputeResolverFees = [];

          // Attempt to add fees to the dispute resolver, expecting revert
          await expect(
            accountHandler.connect(admin).addFeesToDisputeResolver(disputeResolver.id, disputeResolverFees)
          ).to.revertedWith(RevertReasons.INVALID_AMOUNT_DISPUTE_RESOLVER_FEES);
        });

        it("DisputeResolverFees above max", async function () {
          await configHandler.setMaxFeesPerDisputeResolver(2);

          // Attempt to add fees to the dispute resolver, expecting revert
          await expect(
            accountHandler.connect(admin).addFeesToDisputeResolver(disputeResolver.id, disputeResolverFees)
          ).to.revertedWith(RevertReasons.INVALID_AMOUNT_DISPUTE_RESOLVER_FEES);
        });

        it("Duplicate dispute resolver fees", async function () {
          //Add to DisputeResolverFee array
          disputeResolverFees.push(new DisputeResolverFee(other4.address, "MockToken4", "400"));
          disputeResolverFees.push(new DisputeResolverFee(other5.address, "MockToken5", "500"));
          disputeResolverFeeList = new DisputeResolverFeeList(disputeResolverFees);

          // Attempt to add fees to the dispute resolver, expecting revert
          await expect(
            accountHandler.connect(admin).addFeesToDisputeResolver(disputeResolver.id, disputeResolverFees)
          ).to.revertedWith(RevertReasons.DUPLICATE_DISPUTE_RESOLVER_FEES);
        });
      });
    });

    context("👉 removeFeesFromDisputeResolver()", async function () {
      beforeEach(async function () {
        disputeResolver.id = (++id).toString();
        await accountHandler
          .connect(rando)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

        // How that dispute resolver looks as a returned struct
        disputeResolverStruct = disputeResolver.toStruct();

        expectedDisputeResolver = disputeResolver.clone();
        expectedDisputeResolver.active = false;
        expectedDisputeResolverStruct = expectedDisputeResolver.toStruct();
      });

      it("should emit a DisputeResolverFeesRemoved event", async function () {
        feeTokenAddressesToRemove = [other1.address, other2.address, other3.address];

        await expect(
          accountHandler.connect(admin).removeFeesFromDisputeResolver(disputeResolver.id, feeTokenAddressesToRemove)
        )
          .to.emit(accountHandler, "DisputeResolverFeesRemoved")
          .withArgs(disputeResolver.id, feeTokenAddressesToRemove, admin.address);
      });

      it("should update DisputeResolverFee state only if some DisputeResolverFees are removed", async function () {
        feeTokenAddressesToRemove = [other1.address, other3.address];

        // Remove fees from dispute resolver
        await accountHandler
          .connect(admin)
          .removeFeesFromDisputeResolver(disputeResolver.id, feeTokenAddressesToRemove);

        // Get the dispute resolver data as structs
        [, disputeResolverStruct, disputeResolverFeeListStruct, returnedSellerAllowList] = await accountHandler
          .connect(rando)
          .getDisputeResolver(disputeResolver.id);

        // Parse into entity
        let returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);
        let returnedDisputeResolverFeeList = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct);
        expect(returnedDisputeResolver.isValid()).is.true;
        expect(returnedDisputeResolverFeeList.isValid()).is.true;

        // Returned values should match expectedDisputeResolver
        for ([key, value] of Object.entries(expectedDisputeResolver)) {
          expect(JSON.stringify(returnedDisputeResolver[key]) === JSON.stringify(value)).is.true;
        }

        const expectedisputeResolverFees = [new DisputeResolverFee(other2.address, "MockToken2", "200")];

        const expecteDdisputeResolverFeeList = new DisputeResolverFeeList(expectedisputeResolverFees);
        assert.equal(
          returnedDisputeResolverFeeList.toString(),
          expecteDdisputeResolverFeeList.toString(),
          "Dispute Resolver Fee List is incorrect"
        );

        expect(returnedSellerAllowList.toString()).to.eql(sellerAllowList.toString(), "Allowed list wrong");
      });

      it("should update DisputeResolverFee state only if all DisputeResolverFees are removed", async function () {
        const feeTokenAddressesToRemove = [other1.address, other2.address, other3.address];

        // Remove fees from dispute resolver
        await accountHandler
          .connect(admin)
          .removeFeesFromDisputeResolver(disputeResolver.id, feeTokenAddressesToRemove);

        // Get the dispute resolver data as structs
        [, disputeResolverStruct, disputeResolverFeeListStruct, returnedSellerAllowList] = await accountHandler
          .connect(rando)
          .getDisputeResolver(disputeResolver.id);

        // Parse into entity
        let returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);
        let returnedDisputeResolverFeeList = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct);
        expect(returnedDisputeResolver.isValid()).is.true;
        expect(returnedDisputeResolverFeeList.isValid()).is.true;

        // Returned values should match expectedDisputeResolver
        for ([key, value] of Object.entries(expectedDisputeResolver)) {
          expect(JSON.stringify(returnedDisputeResolver[key]) === JSON.stringify(value)).is.true;
        }

        const expectedisputeResolverFees = [];

        const expecteDdisputeResolverFeeList = new DisputeResolverFeeList(expectedisputeResolverFees);
        assert.equal(
          returnedDisputeResolverFeeList.toString(),
          expecteDdisputeResolverFeeList.toString(),
          "Dispute Resolver Fee List is incorrect"
        );

        expect(returnedSellerAllowList.toString()).to.eql(sellerAllowList.toString(), "Allowed list wrong");
      });

      context("💔 Revert Reasons", async function () {
        beforeEach(async function () {
          feeTokenAddressesToRemove = [other1.address, other2.address, other3.address];
        });
        it("Dispute resolver does not exist", async function () {
          // Set invalid id
          disputeResolver.id = "444";

          // Attempt to remove fees from the dispute resolver, expecting revert
          await expect(
            accountHandler.connect(admin).removeFeesFromDisputeResolver(disputeResolver.id, feeTokenAddressesToRemove)
          ).to.revertedWith(RevertReasons.NO_SUCH_DISPUTE_RESOLVER);

          // Set invalid id
          disputeResolver.id = "0";

          // Attempt to remove fees from the dispute resolver, expecting revert
          await expect(
            accountHandler.connect(admin).removeFeesFromDisputeResolver(disputeResolver.id, feeTokenAddressesToRemove)
          ).to.revertedWith(RevertReasons.NO_SUCH_DISPUTE_RESOLVER);
        });

        it("Caller is not dispute resolver admin address", async function () {
          // Attempt to remove fees from the dispute resolver, expecting revert
          await expect(
            accountHandler.connect(rando).removeFeesFromDisputeResolver(disputeResolver.id, feeTokenAddressesToRemove)
          ).to.revertedWith(RevertReasons.NOT_ADMIN);
        });

        it("DisputeResolverFees empty", async function () {
          feeTokenAddressesToRemove = [];

          // Attempt to remove fees from the dispute resolver, expecting revert
          await expect(
            accountHandler.connect(admin).removeFeesFromDisputeResolver(disputeResolver.id, feeTokenAddressesToRemove)
          ).to.revertedWith(RevertReasons.INVALID_AMOUNT_DISPUTE_RESOLVER_FEES);
        });

        it("DisputeResolverFees above max", async function () {
          await configHandler.setMaxFeesPerDisputeResolver(2);

          // Attempt to remove fees from the dispute resolver, expecting revert
          await expect(
            accountHandler.connect(admin).removeFeesFromDisputeResolver(disputeResolver.id, feeTokenAddressesToRemove)
          ).to.revertedWith(RevertReasons.INVALID_AMOUNT_DISPUTE_RESOLVER_FEES);
        });

        it("DisputeResolverFee in array does not exist for Dispute Resolver", async function () {
          feeTokenAddressesToRemove = [other4.address, other5.address];

          // Attempt to remove fees from the dispute resolver, expecting revert
          await expect(
            accountHandler.connect(admin).removeFeesFromDisputeResolver(disputeResolver.id, feeTokenAddressesToRemove)
          ).to.revertedWith(RevertReasons.DISPUTE_RESOLVER_FEE_NOT_FOUND);
        });
      });
    });

    context("👉 addSellerToAllowList()", async function () {
      beforeEach(async function () {
        // make another seller with id = "4"
        let seller4 = new Seller(
          (++id).toString(),
          other3.address,
          other3.address,
          other3.address,
          other3.address,
          active
        );

        await accountHandler.connect(admin).createSeller(seller4);

        sellerAllowList = ["1", "3"];
        allowedSellersToAdd = ["2", "4"];

        disputeResolver.id = (++id).toString();

        await accountHandler
          .connect(rando)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

        // How that dispute resolver looks as a returned struct
        disputeResolverStruct = disputeResolver.toStruct();

        expectedDisputeResolver = disputeResolver.clone();
        expectedDisputeResolver.active = false;
        expectedDisputeResolverStruct = expectedDisputeResolver.toStruct();
      });

      it("should emit an AllowedSellersAdded event", async function () {
        // add sellers, test for event
        expect(await accountHandler.connect(admin).addSellerToAllowList(disputeResolver.id, allowedSellersToAdd))
          .to.emit(accountHandler, "AllowedSellersAdded")
          .withArgs(disputeResolver.id, allowedSellersToAdd, admin.address);
      });

      it("should update SellerAllowList state only", async function () {
        const expectedSellerAllowList = [...sellerAllowList, ...allowedSellersToAdd];

        // Add seller ids to seller allow list
        await accountHandler.connect(admin).addSellerToAllowList(disputeResolver.id, allowedSellersToAdd);

        // Get the dispute resolver data as structs
        [, disputeResolverStruct, disputeResolverFeeListStruct, returnedSellerAllowList] = await accountHandler
          .connect(rando)
          .getDisputeResolver(id);

        // Parse into entity
        let returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);
        let returnedDisputeResolverFeeList = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct);
        expect(returnedDisputeResolver.isValid()).is.true;
        expect(returnedDisputeResolverFeeList.isValid()).is.true;

        // Returned values should match expectedDisputeResolver
        for ([key, value] of Object.entries(expectedDisputeResolver)) {
          expect(JSON.stringify(returnedDisputeResolver[key]) === JSON.stringify(value)).is.true;
        }

        assert.equal(
          returnedDisputeResolverFeeList.toString(),
          disputeResolverFeeList.toString(),
          "Dispute Resolver Fee List is incorrect"
        );

        expect(returnedSellerAllowList.toString()).to.eql(expectedSellerAllowList.toString(), "Allowed list wrong");

        // check that mappings of allowed selleres were updated
        idsToCheck = ["1", "2", "3", "4"];
        expectedStatus = [true, true, true, true]; // 1 and 3 are allowed
        const areSellersAllowed = await accountHandler.connect(rando).areSellersAllowed(id, idsToCheck);

        expect(areSellersAllowed).to.eql(expectedStatus, "Wrong statuses reported");
      });

      context("💔 Revert Reasons", async function () {
        it("Dispute resolver does not exist", async function () {
          // Set invalid id
          disputeResolver.id = "444";

          // Attempt to add sellers to the allow list, expecting revert
          await expect(
            accountHandler.connect(admin).addSellerToAllowList(disputeResolver.id, allowedSellersToAdd)
          ).to.revertedWith(RevertReasons.NO_SUCH_DISPUTE_RESOLVER);

          // Set invalid id
          disputeResolver.id = "0";

          // Attempt to add sellers to the allow list, expecting revert
          await expect(
            accountHandler.connect(admin).addSellerToAllowList(disputeResolver.id, allowedSellersToAdd)
          ).to.revertedWith(RevertReasons.NO_SUCH_DISPUTE_RESOLVER);
        });

        it("Caller is not dispute resolver admin address", async function () {
          // Attempt to add sellers to the allow list, expecting revert
          await expect(
            accountHandler.connect(rando).addSellerToAllowList(disputeResolver.id, allowedSellersToAdd)
          ).to.revertedWith(RevertReasons.NOT_ADMIN);
        });

        it("SellerAllowList empty", async function () {
          allowedSellersToAdd = [];

          // Attempt to add sellers to the allow list, expecting revert
          await expect(
            accountHandler.connect(admin).addSellerToAllowList(disputeResolver.id, allowedSellersToAdd)
          ).to.revertedWith(RevertReasons.INVALID_AMOUNT_ALLOWED_SELLERS);
        });

        it("SellerAllowList above max", async function () {
          allowedSellersToAdd = new Array(101).fill("1");

          // Attempt to add sellers to the allow list, expecting revert
          await expect(
            accountHandler.connect(admin).addSellerToAllowList(disputeResolver.id, allowedSellersToAdd)
          ).to.revertedWith(RevertReasons.INVALID_AMOUNT_ALLOWED_SELLERS);
        });

        it("Some seller does not exist", async function () {
          // Add invalid id
          allowedSellersToAdd = ["2", "4", "6"];

          // Attempt to add sellers to the allow list, expecting revert
          await expect(
            accountHandler.connect(admin).addSellerToAllowList(disputeResolver.id, allowedSellersToAdd)
          ).to.revertedWith(RevertReasons.NO_SUCH_SELLER);
        });

        it("Seller id is already approved", async function () {
          // New, but duplicated
          allowedSellersToAdd = ["2", "4", "2"];

          // Attempt to add sellers to the allow listr, expecting revert
          await expect(
            accountHandler.connect(admin).addSellerToAllowList(disputeResolver.id, allowedSellersToAdd)
          ).to.revertedWith(RevertReasons.SELLER_ALREADY_APPROVED);

          // Duplicate existing seller id
          allowedSellersToAdd = ["2", "1"];

          // Attempt to add sellers to the allow list, expecting revert
          await expect(
            accountHandler.connect(admin).addSellerToAllowList(disputeResolver.id, allowedSellersToAdd)
          ).to.revertedWith(RevertReasons.SELLER_ALREADY_APPROVED);
        });
      });
    });

    context("👉 removeSellerFromAllowList()", async function () {
      beforeEach(async function () {
        // make another seller with id = "4"
        const seller4 = new Seller(
          (++id).toString(),
          other3.address,
          other3.address,
          other3.address,
          other3.address,
          active
        );

        await accountHandler.connect(admin).createSeller(seller4);

        sellerAllowList = ["1", "3", "2", "4"];
        allowedSellersToRemove = ["1", "2"];

        disputeResolver.id = (++id).toString();

        await accountHandler
          .connect(rando)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

        // How that dispute resolver looks as a returned struct
        disputeResolverStruct = disputeResolver.toStruct();

        expectedDisputeResolver = disputeResolver.clone();
        expectedDisputeResolver.active = false;
        expectedDisputeResolverStruct = expectedDisputeResolver.toStruct();
      });

      it("should emit a AllowedSellersRemoved event", async function () {
        await expect(
          accountHandler.connect(admin).removeSellerFromAllowList(disputeResolver.id, allowedSellersToRemove)
        )
          .to.emit(accountHandler, "AllowedSellersRemoved")
          .withArgs(disputeResolver.id, allowedSellersToRemove, admin.address);
      });

      it("should update SellerAllowList state only if some Allowed Sellers are removed", async function () {
        // Remove fees from dispute resolver
        await accountHandler.connect(admin).removeSellerFromAllowList(disputeResolver.id, allowedSellersToRemove);

        // Get the dispute resolver data as structs
        [, disputeResolverStruct, disputeResolverFeeListStruct, returnedSellerAllowList] = await accountHandler
          .connect(rando)
          .getDisputeResolver(id);

        // Parse into entity
        let returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);
        let returnedDisputeResolverFeeList = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct);
        expect(returnedDisputeResolver.isValid()).is.true;
        expect(returnedDisputeResolverFeeList.isValid()).is.true;

        // Returned values should match expectedDisputeResolver
        for ([key, value] of Object.entries(expectedDisputeResolver)) {
          expect(JSON.stringify(returnedDisputeResolver[key]) === JSON.stringify(value)).is.true;
        }

        assert.equal(
          returnedDisputeResolverFeeList.toString(),
          disputeResolverFeeList.toString(),
          "Dispute Resolver Fee List is incorrect"
        );

        const expectedSellerAllowList = ["4", "3"];
        expect(returnedSellerAllowList.toString()).to.eql(expectedSellerAllowList.toString(), "Allowed list wrong");

        // check that mappings of allowed selleres were updated
        idsToCheck = ["1", "2", "3", "4"];
        expectedStatus = [false, false, true, true]; // 3 and 4 are allowed
        const areSellersAllowed = await accountHandler.connect(rando).areSellersAllowed(id, idsToCheck);

        expect(areSellersAllowed).to.eql(expectedStatus, "Wrong statuses reported");
      });

      it("should update SellerAllowList state only if all allowed sellers are removed", async function () {
        allowedSellersToRemove = sellerAllowList;

        // Remove fees from dispute resolver
        await accountHandler.connect(admin).removeSellerFromAllowList(disputeResolver.id, allowedSellersToRemove);

        // Get the dispute resolver data as structs
        [, disputeResolverStruct, disputeResolverFeeListStruct, returnedSellerAllowList] = await accountHandler
          .connect(rando)
          .getDisputeResolver(id);

        // Parse into entity
        let returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);
        let returnedDisputeResolverFeeList = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct);
        expect(returnedDisputeResolver.isValid()).is.true;
        expect(returnedDisputeResolverFeeList.isValid()).is.true;

        // Returned values should match expectedDisputeResolver
        for ([key, value] of Object.entries(expectedDisputeResolver)) {
          expect(JSON.stringify(returnedDisputeResolver[key]) === JSON.stringify(value)).is.true;
        }

        assert.equal(
          returnedDisputeResolverFeeList.toString(),
          disputeResolverFeeList.toString(),
          "Dispute Resolver Fee List is incorrect"
        );

        const expectedSellerAllowList = [];
        expect(returnedSellerAllowList.toString()).to.eql(expectedSellerAllowList.toString(), "Allowed list wrong");

        // make another seller with id = "6"
        const seller6 = new Seller(
          (++id).toString(),
          other4.address,
          other4.address,
          other4.address,
          other4.address,
          active
        );
        await accountHandler.connect(admin).createSeller(seller6);

        // check that mappings of allowed selleres were updated
        idsToCheck = ["1", "2", "3", "4", "5", "6"];
        expectedStatus = [true, true, true, true, false, true]; // everything was removed, so every seller is allowed. 5 is not a seller
        const areSellersAllowed = await accountHandler.connect(rando).areSellersAllowed(disputeResolver.id, idsToCheck);

        expect(areSellersAllowed).to.eql(expectedStatus, "Wrong statuses reported");
      });

      context("💔 Revert Reasons", async function () {
        it("Dispute resolver does not exist", async function () {
          // Set invalid id
          disputeResolver.id = "444";

          // Attempt to remove sellers from the allowed list, expecting revert
          await expect(
            accountHandler.connect(admin).removeSellerFromAllowList(disputeResolver.id, allowedSellersToRemove)
          ).to.revertedWith(RevertReasons.NO_SUCH_DISPUTE_RESOLVER);

          // Set invalid id
          disputeResolver.id = "0";

          // Attempt to remove sellers from the allowed list, expecting revert
          await expect(
            accountHandler.connect(admin).removeSellerFromAllowList(disputeResolver.id, allowedSellersToRemove)
          ).to.revertedWith(RevertReasons.NO_SUCH_DISPUTE_RESOLVER);
        });

        it("Caller is not dispute resolver admin address", async function () {
          // Attempt to remove sellers from the allowed list, expecting revert
          await expect(
            accountHandler.connect(rando).removeSellerFromAllowList(disputeResolver.id, allowedSellersToRemove)
          ).to.revertedWith(RevertReasons.NOT_ADMIN);
        });

        it("SellerAllowList empty", async function () {
          allowedSellersToRemove = [];

          // Attempt to remove sellers from the allowed list, expecting revert
          await expect(
            accountHandler.connect(admin).removeSellerFromAllowList(disputeResolver.id, allowedSellersToRemove)
          ).to.revertedWith(RevertReasons.INVALID_AMOUNT_ALLOWED_SELLERS);
        });

        it("SellerAllowList above max", async function () {
          allowedSellersToRemove = new Array(101).fill("1");

          // Attempt to remove sellers from the allowed list, expecting revert
          await expect(
            accountHandler.connect(admin).removeSellerFromAllowList(disputeResolver.id, allowedSellersToRemove)
          ).to.revertedWith(RevertReasons.INVALID_AMOUNT_ALLOWED_SELLERS);
        });

        it("Seller id is not approved", async function () {
          // make another seller with id = "6"
          const seller6 = new Seller(
            (++id).toString(),
            other4.address,
            other4.address,
            other4.address,
            other4.address,
            active
          );
          await accountHandler.connect(admin).createSeller(seller6);

          // seller exists, it's not approved
          allowedSellersToRemove = ["2", "4", "6"];

          // Attempt to remove sellers from the allowed list, expecting revert
          await expect(
            accountHandler.connect(admin).removeSellerFromAllowList(disputeResolver.id, allowedSellersToRemove)
          ).to.revertedWith(RevertReasons.SELLER_NOT_APPROVED);

          // remove same id twice
          allowedSellersToRemove = ["2", "4", "2"];

          // Attempt to remove sellers from the allowed list, expecting revert
          await expect(
            accountHandler.connect(admin).removeSellerFromAllowList(disputeResolver.id, allowedSellersToRemove)
          ).to.revertedWith(RevertReasons.SELLER_NOT_APPROVED);
        });
      });
    });

    context("👉 activateDisputeResolver()", async function () {
      beforeEach(async function () {
        disputeResolver.id = (++id).toString();
        await accountHandler
          .connect(rando)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

        // How that dispute resolver looks as a returned struct
        disputeResolverStruct = disputeResolver.toStruct();
      });

      it("should emit a DisputeResolverActivated event", async function () {
        await expect(accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id))
          .to.emit(accountHandler, "DisputeResolverActivated")
          .withArgs(disputeResolver.id, disputeResolverStruct, deployer.address);
      });

      it("should update only active flag state", async function () {
        // Activate disupte resolver
        await accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id);

        [, disputeResolverStruct, disputeResolverFeeListStruct] = await accountHandler
          .connect(rando)
          .getDisputeResolver(id);

        // Parse into entity
        let returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);
        let returnedDisputeResolverFeeList = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct);
        expect(returnedDisputeResolver.isValid()).is.true;
        expect(returnedDisputeResolverFeeList.isValid()).is.true;
        expect(returnedDisputeResolver.isValid()).is.true;

        // Returned values should match the input in activateDisputeResolver
        for ([key, value] of Object.entries(disputeResolver)) {
          expect(JSON.stringify(returnedDisputeResolver[key]) === JSON.stringify(value)).is.true;
        }
        assert.equal(
          returnedDisputeResolverFeeList.toString(),
          disputeResolverFeeList.toString(),
          "Dispute Resolver Fee List is incorrect"
        );
      });

      context("💔 Revert Reasons", async function () {
        it("Dispute resolver does not exist", async function () {
          // Set invalid id
          disputeResolver.id = "444";

          // Attempt to activate the dispute resolver, expecting revert
          await expect(accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id)).to.revertedWith(
            RevertReasons.NO_SUCH_DISPUTE_RESOLVER
          );

          // Set invalid id
          disputeResolver.id = "0";

          // Attempt to activate the dispute resolver, expecting revert
          await expect(accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id)).to.revertedWith(
            RevertReasons.NO_SUCH_DISPUTE_RESOLVER
          );
        });

        it("Caller does not have ADMIN role", async function () {
          //ADMIN role is not the same as DR's admin address

          // Attempt to activate the dispute resolver, expecting revert
          await expect(accountHandler.connect(admin).activateDisputeResolver(disputeResolver.id)).to.revertedWith(
            RevertReasons.ACCESS_DENIED
          );
        });
      });
    });
  });

  // All supported Agent methods
  context("📋 Agent Methods", async function () {
    beforeEach(async function () {
      // The first agent id
      nextAccountId = "1";
      invalidAccountId = "666";

      // Required constructor params
      id = "1"; // argument sent to contract for createAgent will be ignored
      feePercentage = "500"; //5%

      active = true;

      // Create a valid agent, then set fields in tests directly
      agent = new Agent(id, feePercentage, other1.address, active);
      expect(agent.isValid()).is.true;

      // How that agent looks as a returned struct
      agentStruct = agent.toStruct();
    });

    context("👉 createAgent()", async function () {
      it("should emit a AgentCreated event", async function () {
        // Create an agent, testing for the event
        await expect(accountHandler.connect(rando).createAgent(agent))
          .to.emit(accountHandler, "AgentCreated")
          .withArgs(agent.id, agentStruct, rando.address);
      });

      it("should update state", async function () {
        // Create an agent
        await accountHandler.connect(rando).createAgent(agent);

        // Get the agent as a struct
        [, agentStruct] = await accountHandler.connect(rando).getAgent(id);

        // Parse into entity
        let returnedAgent = Agent.fromStruct(agentStruct);

        // Returned values should match the input in createAgent
        for ([key, value] of Object.entries(agent)) {
          expect(JSON.stringify(returnedAgent[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should ignore any provided id and assign the next available", async function () {
        agent.id = "444";

        // Create an agent, testing for the event
        await expect(accountHandler.connect(rando).createAgent(agent))
          .to.emit(accountHandler, "AgentCreated")
          .withArgs(nextAccountId, agentStruct, rando.address);

        // wrong agent id should not exist
        [exists] = await accountHandler.connect(rando).getAgent(agent.id);
        expect(exists).to.be.false;

        // next agent id should exist
        [exists] = await accountHandler.connect(rando).getAgent(nextAccountId);
        expect(exists).to.be.true;
      });

      it("should allow feePercentage of 0", async function () {
        // Create a valid agent with feePercentage = 0, as it is optional
        agent = new Agent(id, "0", other1.address, active);
        expect(agent.isValid()).is.true;

        // How that agent looks as a returned struct
        agentStruct = agent.toStruct();

        // Create an agent, testing for the event
        await expect(accountHandler.connect(rando).createAgent(agent))
          .to.emit(accountHandler, "AgentCreated")
          .withArgs(nextAccountId, agentStruct, rando.address);

        // Get the agent as a struct
        [, agentStruct] = await accountHandler.connect(rando).getAgent(id);

        // Parse into entity
        let returnedAgent = Agent.fromStruct(agentStruct);

        // Returned values should match the input in createAgent
        for ([key, value] of Object.entries(agent)) {
          expect(JSON.stringify(returnedAgent[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should allow feePercentage of 100%", async function () {
        // Create a valid agent with feePercentage = 10000 (100%). Not handy for seller, but technically possible
        agent = new Agent(id, "10000", other1.address, active);
        expect(agent.isValid()).is.true;

        // How that agent looks as a returned struct
        agentStruct = agent.toStruct();

        // Create an agent, testing for the event
        await expect(accountHandler.connect(rando).createAgent(agent))
          .to.emit(accountHandler, "AgentCreated")
          .withArgs(nextAccountId, agentStruct, rando.address);

        // Get the agent as a struct
        [, agentStruct] = await accountHandler.connect(rando).getAgent(id);

        // Parse into entity
        let returnedAgent = Agent.fromStruct(agentStruct);

        // Returned values should match the input in createAgent
        for ([key, value] of Object.entries(agent)) {
          expect(JSON.stringify(returnedAgent[key]) === JSON.stringify(value)).is.true;
        }
      });

      context("💔 Revert Reasons", async function () {
        it("active is false", async function () {
          agent.active = false;

          // Attempt to Create an Agent, expecting revert
          await expect(accountHandler.connect(rando).createAgent(agent)).to.revertedWith(RevertReasons.MUST_BE_ACTIVE);
        });

        it("addresses are the zero address", async function () {
          agent.wallet = ethers.constants.AddressZero;

          // Attempt to Create an Agent, expecting revert
          await expect(accountHandler.connect(rando).createAgent(agent)).to.revertedWith(RevertReasons.INVALID_ADDRESS);
        });

        it("wallet address is not unique to this agentId", async function () {
          // Create an agent
          await accountHandler.connect(rando).createAgent(agent);

          // Attempt to create another buyer with same wallet address
          await expect(accountHandler.connect(rando).createAgent(agent)).to.revertedWith(
            RevertReasons.AGENT_ADDRESS_MUST_BE_UNIQUE
          );
        });

        it("feePercentage is above 100%", async function () {
          //Agent with feePercentage > 10000 (100%)
          agent = new Agent(id, "10001", other1.address, active);
          expect(agent.isValid()).is.true;

          // Attempt to create another buyer with same wallet address
          await expect(accountHandler.connect(rando).createAgent(agent)).to.revertedWith(
            RevertReasons.FEE_PERCENTAGE_INVALID
          );
        });
      });
    });

    context("👉 getAgent()", async function () {
      beforeEach(async function () {
        // Create a agent
        await accountHandler.connect(rando).createAgent(agent);

        // id of the current agent and increment nextAccountId
        id = nextAccountId++;
      });

      it("should return true for exists if agent is found", async function () {
        // Get the exists flag
        [exists] = await accountHandler.connect(rando).getAgent(id);

        // Validate
        expect(exists).to.be.true;
      });

      it("should return false for exists if agent is not found", async function () {
        // Get the exists flag
        [exists] = await accountHandler.connect(rando).getAgent(invalidAccountId);

        // Validate
        expect(exists).to.be.false;
      });

      it("should return the details of the agent as a struct if found", async function () {
        // Get the agent as a struct
        [, agentStruct] = await accountHandler.connect(rando).getAgent(id);

        // Parse into entity
        agent = Agent.fromStruct(agentStruct);

        // Validate
        expect(agent.isValid()).to.be.true;
      });
    });
  });
});
