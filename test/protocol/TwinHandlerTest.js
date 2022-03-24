const hre = require("hardhat");
const ethers = hre.ethers;
const { expect, assert } = require("chai");

const Role = require("../../scripts/domain/Role");
const Twin = require("../../scripts/domain/Twin");
const { getInterfaceIds } = require('../../scripts/config/supported-interfaces.js');
const { RevertReasons } = require('../../scripts/config/revert-reasons.js');
const { deployProtocolDiamond } = require('../../scripts/util/deploy-protocol-diamond.js');
const { deployProtocolHandlerFacets } = require('../../scripts/util/deploy-protocol-handler-facets.js');
const { assertEventEmitted } = require("../../testHelpers/events");

/**
 *  Test the Boson Twin Handler interface
 */
describe("IBosonTwinHandler", function() {

    // Common vars
    let InterfaceIds;
    let accounts, deployer, rando;
    let erc165,
        protocolDiamond,
        diamondLoupe,
        diamondCut,
        accessController,
        twinHandler,
        twinHandlerFacet,
        twinStruct,
        TwinHandlerFacet_Factory,
        MockBosonToken_Factory,
        MockForeign721_Factory,
        MockForeign1155_Factory,
        contractBosonToken,
        contractForeign721,
        contractForeign1155;
    let twin, nextTwinId, invalidTwinId, support;
    let id,
        sellerId,
        supplyAvailable,
        supplyIds,
        tokenId,
        tokenAddress;

    before (async function() {
        // get interface Ids
        InterfaceIds = await getInterfaceIds();
    });

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
        [twinHandlerFacet] = await deployProtocolHandlerFacets(protocolDiamond, ["TwinHandlerFacet"]);

        // Cast Diamond to IERC165
        erc165 = await ethers.getContractAt('IERC165', protocolDiamond.address);

        // Cast Diamond to ITwinHandler
        twinHandler = await ethers.getContractAt('IBosonTwinHandler', protocolDiamond.address);

        MockBosonToken_Factory = await ethers.getContractFactory('BosonToken');
        MockForeign721_Factory = await ethers.getContractFactory('Foreign721');
        MockForeign1155_Factory = await ethers.getContractFactory('Foreign1155');

        contractBosonToken = await MockBosonToken_Factory.deploy();
        contractForeign721 = await MockForeign721_Factory.deploy();
        contractForeign1155 = await MockForeign1155_Factory.deploy();

        await contractBosonToken.deployed();
        await contractForeign721.deployed();
        await contractForeign1155.deployed();

        TwinHandlerFacet_Factory = await ethers.getContractFactory('TwinHandlerFacet');
    });

    // Interface support (ERC-156 provided by ProtocolDiamond, others by deployed facets)
    context("📋 Interfaces", async function () {
        context("👉 supportsInterface()", async function () {
            it("should indicate support for IBosonTwinHandler interface", async function () {
                // Current interfaceId for IBosonTwinHandler
                support = await erc165.supportsInterface(InterfaceIds.IBosonTwinHandler);

                // Test
                await expect(
                    support,
                    "IBosonTwinHandler interface not supported"
                ).is.true;
            });
        });
    });

    // All supported methods
    context("📋 Twin Handler Methods", async function () {
        beforeEach( async function () {
            // The first twin id
            nextTwinId = "1";
            invalidTwinId = "222";

            // Required constructor params
            id = sellerId = "1";
            supplyAvailable = "500";
            tokenId = "4096";
            supplyIds = ['1', '2'];
            tokenAddress = contractBosonToken.address;

            // Create a valid twin, then set fields in tests directly
            twin = new Twin(
                id,
                sellerId,
                supplyAvailable,
                supplyIds,
                tokenId,
                tokenAddress
            );
            expect(twin.isValid()).is.true;

            // How that twin looks as a returned struct
            twinStruct = twin.toStruct();
        });

        context("👉 createTwin()", async function () {
            it("should emit a TwinCreated event", async function () {
                twin.tokenAddress = contractBosonToken.address;

                // Approving the twinHandler contract to transfer seller's tokens
                await contractBosonToken.connect(seller).approve(twinHandler.address, 1);

                // Create a twin, testing for the event
                const tx = await twinHandler.connect(seller).createTwin(twin, seller.address);
                const txReceipt = await tx.wait();

                assertEventEmitted(
                    txReceipt,
                    TwinHandlerFacet_Factory,
                    'TwinCreated',
                    function(eventArgs) {
                        assert.equal(
                            eventArgs.twinId.toString(),
                            nextTwinId,
                            'Twin Id is incorrect'
                        );
                        assert.equal(
                            eventArgs.sellerId.toString(),
                            twin.sellerId,
                            'Seller Id is incorrect'
                        );
                        assert.equal(
                            eventArgs.twin[0].toString(),
                            nextTwinId,
                            "Twin struct's id is incorrect"
                        );
                        assert.equal(
                            eventArgs.twin[1].toString(),
                            twin.sellerId,
                            "Twin struct's sellerId is incorrect"
                        );
                        assert.equal(
                            eventArgs.twin[2].toString(),
                            twin.supplyAvailable,
                            "Twin struct's supplyAvailable is incorrect"
                        );
                        assert.equal(
                            eventArgs.twin[3].toString(),
                            twin.supplyIds.toString(),
                            "Twin struct's supplyIds is incorrect"
                        );
                        assert.equal(
                            eventArgs.twin[4].toString(),
                            twin.tokenId.toString(),
                            "Twin struct's tokenId is incorrect"
                        );
                        assert.equal(
                            eventArgs.twin[5],
                            twin.tokenAddress,
                            "Twin struct's tokenAddress is incorrect"
                        );

                        // Unable to match whole eventArgs.twin struct. Hence confirming the Struct size.
                        assert.equal(
                            eventArgs.twin.length,
                            Object.keys(twin).length,
                            "Twin struct does not match"
                        );
                    }
                );
            });

            it("should ignore any provided id and assign the next available", async function () {
                twin.id = "444";

                // Approving the twinHandler contract to transfer seller's tokens
                await contractBosonToken.connect(seller).approve(twinHandler.address, 1);

                // Create a twin, testing for the event
                const tx = await twinHandler.connect(seller).createTwin(twin, seller.address);
                const txReceipt = await tx.wait();

                assertEventEmitted(
                    txReceipt,
                    TwinHandlerFacet_Factory,
                    'TwinCreated',
                    function(eventArgs) {
                        assert.equal(
                            eventArgs.twinId.toString(),
                            nextTwinId,
                            'Twin Id is incorrect'
                        );
                        assert.equal(
                            eventArgs.sellerId.toString(),
                            twin.sellerId,
                            'Seller Id is incorrect'
                        );
                        assert.equal(
                            eventArgs.twin[0].toString(),
                            nextTwinId,
                            "Twin struct's id is incorrect"
                        );
                        assert.equal(
                            eventArgs.twin[1].toString(),
                            twin.sellerId,
                            "Twin struct's sellerId is incorrect"
                        );
                        assert.equal(
                            eventArgs.twin[2].toString(),
                            twin.supplyAvailable,
                            "Twin struct's supplyAvailable is incorrect"
                        );
                        assert.equal(
                            eventArgs.twin[3].toString(),
                            twin.supplyIds.toString(),
                            "Twin struct's supplyIds is incorrect"
                        );
                        assert.equal(
                            eventArgs.twin[4].toString(),
                            twin.tokenId.toString(),
                            "Twin struct's tokenId is incorrect"
                        );
                        assert.equal(
                            eventArgs.twin[5],
                            twin.tokenAddress,
                            "Twin struct's tokenAddress is incorrect"
                        );

                        // Unable to match whole eventArgs.twin struct. Hence confirming the Struct size.
                        assert.equal(
                            eventArgs.twin.length,
                            Object.keys(twin).length,
                            "Twin struct does not match"
                        );
                    }
                );

                // wrong twin id should not exist
                [success, ] = await twinHandler.connect(rando).getTwin(twin.id);
                expect(success).to.be.false;

                // next twin id should exist
                [success, ] = await twinHandler.connect(rando).getTwin(nextTwinId);
                expect(success).to.be.true;
            });

            it("should emit a TwinCreated event for ERC721 token address", async function () {
                twin.tokenAddress = contractForeign721.address;

                // Mint a token and approve twinHandler contract to transfer it
                await contractForeign721.connect(seller).mint(twin.tokenId);
                await contractForeign721.connect(seller).setApprovalForAll(twinHandler.address, true);

                // Create a twin, testing for the event
                const tx = await twinHandler.connect(seller).createTwin(twin, seller.address);
                const txReceipt = await tx.wait();

                assertEventEmitted(
                    txReceipt,
                    TwinHandlerFacet_Factory,
                    'TwinCreated',
                    function(eventArgs) {
                        assert.equal(
                            eventArgs.twinId.toString(),
                            twin.id,
                            'Twin Id is incorrect'
                        );
                        assert.equal(
                            eventArgs.sellerId.toString(),
                            twin.sellerId,
                            'Seller Id is incorrect'
                        );
                        assert.equal(
                            eventArgs.twin[0].toString(),
                            twin.id,
                            "Twin struct's id is incorrect"
                        );
                        assert.equal(
                            eventArgs.twin[1].toString(),
                            twin.sellerId,
                            "Twin struct's sellerId is incorrect"
                        );
                        assert.equal(
                            eventArgs.twin[2].toString(),
                            twin.supplyAvailable,
                            "Twin struct's supplyAvailable is incorrect"
                        );
                        assert.equal(
                            eventArgs.twin[3].toString(),
                            twin.supplyIds.toString(),
                            "Twin struct's supplyIds is incorrect"
                        );
                        assert.equal(
                            eventArgs.twin[4].toString(),
                            twin.tokenId.toString(),
                            "Twin struct's tokenId is incorrect"
                        );
                        assert.equal(
                            eventArgs.twin[5],
                            twin.tokenAddress,
                            "Twin struct's tokenAddress is incorrect"
                        );

                        // Unable to match whole eventArgs.twin struct. Hence confirming the Struct size.
                        assert.equal(
                            eventArgs.twin.length,
                            Object.keys(twin).length,
                            "Twin struct does not match"
                        );
                    }
                );
            });

            it("should emit a TwinCreated event for ERC1155 token address", async function () {
                twin.tokenAddress = contractForeign1155.address;

                // Mint a token and approve twinHandler contract to transfer it
                await contractForeign1155.connect(seller).mint(twin.tokenId, twin.supplyIds[0]);
                await contractForeign1155.connect(seller).setApprovalForAll(twinHandler.address, true);

                // Create a twin, testing for the event
                const tx = await twinHandler.connect(seller).createTwin(twin, seller.address);
                const txReceipt = await tx.wait();

                assertEventEmitted(
                    txReceipt,
                    TwinHandlerFacet_Factory,
                    'TwinCreated',
                    function(eventArgs) {
                        assert.equal(
                            eventArgs.twinId.toString(),
                            twin.id,
                            'Twin Id is incorrect'
                        );
                        assert.equal(
                            eventArgs.sellerId.toString(),
                            twin.sellerId,
                            'Seller Id is incorrect'
                        );
                        assert.equal(
                            eventArgs.twin[2].toString(),
                            twin.supplyAvailable,
                            "Twin struct's supplyAvailable is incorrect"
                        );
                        assert.equal(
                            eventArgs.twin[3].toString(),
                            twin.supplyIds.toString(),
                            "Twin struct's supplyIds is incorrect"
                        );
                        assert.equal(
                            eventArgs.twin[4].toString(),
                            twin.tokenId.toString(),
                            "Twin struct's tokenId is incorrect"
                        );
                        assert.equal(
                            eventArgs.twin[5],
                            twin.tokenAddress,
                            "Twin struct's tokenAddress is incorrect"
                        );
                    }
                );
            });

            context("💔 Revert Reasons", async function () {
                it("should revert if protocol is not approved to transfer the ERC20 token", async function () {
                    //ERC20 token address
                    twin.tokenAddress = contractBosonToken.address;

                    await expect(twinHandler.connect(seller).createTwin(twin, seller.address))
                    .to.revertedWith(RevertReasons.NO_TRANSFER_APPROVED);
                });

                it("should revert if protocol is not approved to transfer the ERC721 token", async function () {
                    //ERC721 token address
                    twin.tokenAddress = contractForeign721.address;

                    await expect(twinHandler.connect(seller).createTwin(twin, seller.address))
                    .to.revertedWith(RevertReasons.NO_TRANSFER_APPROVED);
                });

                it("should revert if protocol is not approved to transfer the ERC1155 token", async function () {
                    //ERC1155 token address
                    twin.tokenAddress = contractForeign1155.address;

                    await expect(twinHandler.connect(seller).createTwin(twin, seller.address))
                    .to.revertedWith(RevertReasons.NO_TRANSFER_APPROVED);
                });

                it("Token address is unsupported", async function () {
                    //Unsupported token address
                    twin.tokenAddress = ethers.constants.AddressZero;

                    await expect(twinHandler.connect(seller).createTwin(twin, seller.address))
                    .to.be.reverted;
                });
            });
        });

        context("👉 getTwin()", async function () {

            beforeEach( async function () {

                // Create a twin
                await twinHandler.connect(seller).createTwin(twin);

                // id of the current twin and increment nextTwinId
                id = nextTwinId++;

            });

            it("should return true for success if twin is found", async function () {

                // Get the success flag
                [success, ] = await twinHandler.connect(rando).getTwin(id);

                // Validate
                expect(success).to.be.true;

            });

            it("should return false for success if twin is not found", async function () {

                // Get the success flag
                [success, ] = await twinHandler.connect(rando).getTwin(invalidTwinId);

                // Validate
                expect(success).to.be.false;

            });

            it("should return the details of the twin as a struct if found", async function () {

                // Get the twin as a struct
                [, twinStruct] = await twinHandler.connect(rando).getTwin(id);

                // Parse into entity
                twin = Twin.fromStruct(twinStruct);

                // Validate
                expect(twin.isValid()).to.be.true;

            });

        });
    });
});
