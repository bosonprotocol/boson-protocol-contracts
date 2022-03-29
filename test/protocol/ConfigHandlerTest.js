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
 *  Test the Boson Config Handler interface
 */
 describe("IBosonConfigHandler", function() {

    // Common vars
    let InterfaceIds;
    let accounts, deployer, rando;
    let protocolFee, maxOffersPerGroup;
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
         rando = accounts[1];
         token = accounts[2];
         treasury = accounts[3];
 
        
        // Deploy the Protocol Diamond
        [protocolDiamond, diamondLoupe, diamondCut, accessController] = await deployProtocolDiamond();

        // Temporarily grant UPGRADER role to deployer account
        await accessController.grantRole(Role.UPGRADER, deployer.address);

        // Set protocol config
        protocolFee = 12;
        maxOffersPerGroup = 100;

        const protocolConfig = [
            token.address,
            treasury.address,
            protocolFee,
            maxOffersPerGroup
        ];

        [configHandlerFacet] = await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);

        // Cast Diamond to IERC165
        erc165 = await ethers.getContractAt('IERC165', protocolDiamond.address);

        // Cast Diamond to IBosonConfigHandler
        configHandler = await ethers.getContractAt('IBosonConfigHandler', protocolDiamond.address);

    });

    // Interface support (ERC-156 provided by ProtocolDiamond, others by deployed facets)
    context("📋 Interfaces", async function () {

        context("👉 supportsInterface()", async function () {

            it("should indicate support for IBosonConfigHandler interface", async function () {

                // Current interfaceId for IBosonConfigHandler
                support = await erc165.supportsInterface(InterfaceIds.IBosonConfigHandler);

                // Test
                await expect(
                    support,
                    "IBosonConfigHandler interface not supported"
                ).is.true;

            });

        });

    });

    // All supported methods
    context("📋 Setters", async function () {

    context("👉 setMaxOffersPerGroup()", async function () {
        beforeEach(async function(){
            
            // set new value for max offers per group
            maxOffersPerGroup = 150;
        })

        it("should emit a MaxOffersPerGroupChanged event", async function () {

            // Set new max offer per group, testing for the event
            await expect(configHandler.connect(deployer).setMaxOffersPerGroup(maxOffersPerGroup))
                .to.emit(configHandler, 'MaxOffersPerGroupChanged')
                .withArgs(maxOffersPerGroup, deployer.address);

        });

        it("should update state", async function () {

            // Set new max offer per group,
            await configHandler.connect(deployer).setMaxOffersPerGroup(maxOffersPerGroup);

            // Verify that nev value is stored
            expect(await configHandler.connect(rando).getMaxOffersPerGroup()).to.equal(maxOffersPerGroup);
            
        });


        context("💔 Revert Reasons", async function () {

            it("caller is not the admin", async function ()  {

                // Attempt to Create a seller, expecting revert
                await expect(configHandler.connect(rando).setMaxOffersPerGroup(maxOffersPerGroup))
                    .to.revertedWith(RevertReasons.ACCESS_DENIED);

            });

        });

    });

    });

    context("📋 Getters", async function () {
        // here we test only that after the deployments getters show correct values
        // otherwise getters are tested in the "should update state" test of setters       

        it("Initial values are correct", async function () {

            // Set new max offer per group, testing for the event
            expect(await configHandler.connect(rando).getTreasuryAddress()).to.equal(treasury.address, 'Invalid treasury address');
            expect(await configHandler.connect(rando).getTokenAddress()).to.equal(token.address, 'Invalid token address');
            expect(await configHandler.connect(rando).getProtocolFeePercentage()).to.equal(protocolFee, 'Invalid protocol fee');
            expect(await configHandler.connect(rando).getMaxOffersPerGroup()).to.equal(maxOffersPerGroup, 'Invalid max groups per offer');

        });

     });
     
 });