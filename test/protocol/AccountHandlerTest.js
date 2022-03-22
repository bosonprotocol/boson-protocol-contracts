const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");

const Role = require("../../scripts/domain/Role");
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
    let erc165, protocolDiamond, diamondLoupe, diamondCut, accessController, accountHandler, accountrHandlerFacet, accountStruct;
    let expected, nextAccountId;

    before (async function() {
        
        // get interface Ids    
        InterfaceIds = await getInterfaceIds();
    
    })

    beforeEach( async function () {

        // Make accounts available
        accounts = await ethers.getSigners();
        deployer = accounts[0];
        seller = accounts[1];
        rando = accounts[2];
        
        // Deploy the Protocol Diamond
        [protocolDiamond, diamondLoupe, diamondCut, accessController] = await deployProtocolDiamond();

        // Temporarily grant UPGRADER role to deployer account
        await accessController.grantRole(Role.UPGRADER, deployer.address);

        // Cut the protocol handler facets into the Diamond
        [accountHandlerFacet] = await deployProtocolHandlerFacets(protocolDiamond, ["AccountHandlerFacet"]);

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

    context("👉 getNextAccountId()", async function () {

        beforeEach( async function () {
            nextAccountId = 0;

            // Create an offer
           // await accountHandler.connect(rando).createAccount(offer);

            // id of the current offer and increment nextAccountId
           // id = nextAccountId++;

        });

        it("should return the next offer id", async function () {

            // What we expect the next offer id to be
            expected = nextAccountId;

            // Get the next offer id
            nextAccountId = await accountHandler.connect(rando).getNextAccountId();

            // Verify expectation
            expect(nextAccountId.toString() == expected).to.be.true;

        });
    
    /*
        Uncomment after create account functions has been implemented

        it("should be incremented after an offer is created", async function () {

            // Create another offer
            await accountHandler.connect(seller).createAccount(offer);

            // What we expect the next offer id to be
            expected = ++nextAccountId;

            // Get the next offer id
            nextAccountId = await accountHandler.connect(rando).getNextAccountId();

            // Verify expectation
            expect(nextAccountId.toString() == expected).to.be.true;

        });
    */

    });

 });