const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");

const Role = require("../../scripts/domain/Role");
const Seller = require("../../scripts/domain/Seller");
const { getInterfaceIds } = require('../../scripts/config/supported-interfaces.js');
const { RevertReasons } = require('../../scripts/config/revert-reasons.js');
const { deployProtocolDiamond } = require('../../scripts/util/deploy-protocol-diamond.js');
const { deployProtocolHandlerFacets } = require('../../scripts/util/deploy-protocol-handler-facets.js');

/**
 *  Test the Boson Account Handler interface
 */
 describe("IBosonAccountHandler", function() {

    // Common vars
    let InterfaceIds;
    let accounts, deployer, rando;
    let erc165, protocolDiamond, diamondLoupe, diamondCut, accessController, accountHandler, accountrHandlerFacet;
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
 
        
        // Deploy the Protocol Diamond
        [protocolDiamond, diamondLoupe, diamondCut, accessController] = await deployProtocolDiamond();

        // Temporarily grant UPGRADER role to deployer account
        await accessController.grantRole(Role.UPGRADER, deployer.address);

        // Cut the protocol handler facets into the Diamond
        [accountrHandlerFacet] = await deployProtocolHandlerFacets(protocolDiamond, ["AccountHandlerFacet"]);

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

            // The first offer id
            nextAccountId = "0";
            invalidAccountId = "666";

            // Required constructor params
            id = sellerId = "0"; // argument sent to contract for createOffer will be ignored
          
            active = true;

            // Create a valid offer, then set fields in tests directly
            seller = new Seller(id, operator.address, admin.address, clerk.address, treasury.address, active);
            expect(seller.isValid()).is.true;

            // How that offer looks as a returned struct
            sellerStruct = seller.toStruct();

        });

        context("👉 getNextAccountId()", async function () {

            beforeEach( async function () {
         
                // Create a seller
                await accountHandler.connect(admin).createSeller(seller);

                // id of the current offer and increment nextAccountId
                id = nextAccountId++;

            });

            it("should return the next offer id", async function () {

                // What we expect the next offer id to be
                expected = nextAccountId;

                // Get the next offer id
                nextAccountId = await accountHandler.connect(rando).getNextAccountId();

                // Verify expectation
                expect(nextAccountId.toString() == expected).to.be.true;

            });
        

            it("should be incremented after a seller is created", async function () {

                // Create another seller
                await accountHandler.connect(admin).createSeller(seller);

                // What we expect the next account id to be
                expected = ++nextAccountId;

                // Get the next account id
                nextAccountId = await accountHandler.connect(rando).getNextAccountId();

                // Verify expectation
                expect(nextAccountId.toString() == expected).to.be.true;

            });
        

        });
     });
 });