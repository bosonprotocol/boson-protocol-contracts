const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");

const Role = require("../../scripts/domain/Role");
const Seller = require("../../scripts/domain/Seller");
const { getInterfaceIds } = require('../../scripts/config/supported-interfaces.js');
const { RevertReasons } = require('../../scripts/config/revert-reasons.js');
const { deployProtocolDiamond } = require('../../scripts/util/deploy-protocol-diamond.js');
const { deployProtocolHandlerFacets } = require('../../scripts/util/deploy-protocol-handler-facets.js');
const { deployProtocolConfigFacet } = require('../../scripts/util/deploy-protocol-config-facet.js');


/**
 *  Test the Boson Account Handler interface
 */
 describe("IBosonAccountHandler", function() {

    // Common vars
    let InterfaceIds;
    let accounts, deployer, rando;
    let erc165, protocolDiamond, diamondLoupe, diamondCut, accessController, accountHandler, accountHandlerFacet, configHandlerFacet, protocolConfig, gasLimit;
    let seller, sellerStruct, sellerId, active;
    let expected, nextAccountId;


    before (async function() {
        
        // get interface Ids    
        InterfaceIds = await getInterfaceIds();
    
    })

    beforeEach( async function () {

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
 
        
        // Deploy the Protocol Diamond
        [protocolDiamond, diamondLoupe, diamondCut, accessController] = await deployProtocolDiamond();

        // Temporarily grant UPGRADER role to deployer account
        await accessController.grantRole(Role.UPGRADER, deployer.address);

        // Cut the protocol handler facets into the Diamond
        [accountHandlerFacet] = await deployProtocolHandlerFacets(protocolDiamond, ["AccountHandlerFacet"]);

        // Add config Handler, so seller id starts at 1
        const protocolConfig = [
            '0x0000000000000000000000000000000000000000',
            '0x0000000000000000000000000000000000000000',
            '0'
        ];

        [configHandlerFacet] = await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);

        // Cast Diamond to IERC165
        erc165 = await ethers.getContractAt('IERC165', protocolDiamond.address);

        // Cast Diamond to IBosonAccountHandler
        accountHandler = await ethers.getContractAt('IBosonAccountHandler', protocolDiamond.address);

    });

    // Interface support (ERC-156 provided by ProtocolDiamond, others by deployed facets)
    context("📋 Interfaces", async function () {

        context("👉 supportsInterface()", async function () {

            it("should indicate support for IBosonAccountHandler interface", async function () {

                // Current interfaceId for IBosonAccountHandler
                support = await erc165.supportsInterface(InterfaceIds.IBosonAccountHandler);

                // Test
                await expect(
                    support,
                    "IBosonAccountHandler interface not supported"
                ).is.true;

            });

        });

    });

     // All supported methods
     context("📋 Seller Handler Methods", async function () {

        beforeEach( async function () {

            // The first seller id
            nextAccountId = "1";
            invalidAccountId = "666";

            // Required constructor params
            id = sellerId = "1"; // argument sent to contract for createSeller will be ignored
          
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
                    .to.emit(accountHandler, 'SellerCreated')
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
                    .to.emit(accountHandler, 'SellerCreated')
                    .withArgs(nextAccountId, sellerStruct);

                // wrong seller id should not exist
                [exists, ] = await accountHandler.connect(rando).getSeller(seller.id);
                expect(exists).to.be.false;

                // next seller id should exist
                [exists, ] = await accountHandler.connect(rando).getSeller(nextAccountId);
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
                    .to.emit(accountHandler, 'SellerCreated')
                    .withArgs(nextAccountId, sellerStruct);


            });

            context("💔 Revert Reasons", async function () {

                it("active is false", async function ()  {

                    seller.active = false;

                    // Attempt to Create a seller, expecting revert
                    await expect(accountHandler.connect(admin).createSeller(seller))
                        .to.revertedWith(RevertReasons.SELLER_MUST_BE_ACTIVE);

                });

                it("addresses are the zero address", async function ()  {

                    seller.operator = ethers.constants.AddressZero;

                    // Attempt to Create a seller, expecting revert
                    await expect(accountHandler.connect(admin).createSeller(seller))
                        .to.revertedWith(RevertReasons.INVALID_ADDRESS);

                    seller.operator = operator.address;
                    seller.clerk = ethers.constants.AddressZero;

                    // Attempt to Create a seller, expecting revert
                    await expect(accountHandler.connect(admin).createSeller(seller))
                        .to.revertedWith(RevertReasons.INVALID_ADDRESS);

                    seller.clerk = clerk.address;
                    seller.admin =  ethers.constants.AddressZero;

                    // Attempt to Create a seller, expecting revert
                    await expect(accountHandler.connect(rando).createSeller(seller))
                        .to.revertedWith(RevertReasons.INVALID_ADDRESS);

                });

                it("addresses are not unique to this seller Id", async function ()  {

                    // Create a seller
                    await accountHandler.connect(admin).createSeller(seller);

                    seller.admin = other1.address;
                    seller.clerk = other2.address

                    // Attempt to Create a seller with non-unique operator, expecting revert
                    await expect(accountHandler.connect(rando).createSeller(seller))
                        .to.revertedWith(RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE);

                 
                    seller.admin = admin.address;
                    seller.operator = other1.address;

                    // Attempt to Create a seller with non-unique admin, expecting revert
                    await expect(accountHandler.connect(admin).createSeller(seller))
                        .to.revertedWith(RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE);

                    seller.clerk = clerk.address;
                    seller.admin = other2.address;

                    // Attempt to Create a seller with non-unique clerk, expecting revert
                    await expect(accountHandler.connect(admin).createSeller(seller))
                        .to.revertedWith(RevertReasons.SELLER_ADDRESS_MUST_BE_UNIQUE);

                });

            });

        });

        context("👉 getNextAccountId()", async function () {

            beforeEach( async function () {
         
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
 });