const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");

const Role = require("../../scripts/domain/Role");
const Twin = require("../../scripts/domain/Twin");
const { InterfaceIds } = require('../../scripts/config/supported-interfaces.js');
const { deployProtocolDiamond } = require('../../scripts/util/deploy-protocol-diamond.js');
const { deployProtocolHandlerFacets } = require('../../scripts/util/deploy-protocol-handler-facets.js');

/**
 *  Test the Boson Twin Handler interface
 */
describe("IBosonTwinHandler", function() {

    // Common vars
    let accounts, deployer;
    let erc165,
        protocolDiamond,
        diamondLoupe,
        diamondCut,
        accessController,
        twinHandler,
        twinHandlerFacet,
        twinStruct,
        MockBosonToken_Factory,
        MockForeign721_Factory,
        MockForeign1155_Factory,
        contractBosonToken,
        contractForeign721,
        contractForeign1155;
    let twin, nextTwinId, support;
    let id,
        sellerId,
        supplyAvailable,
        supplyIds,
        tokenId,
        tokenAddress;

    beforeEach( async function () {
        // Make accounts available
        accounts = await ethers.getSigners();
        deployer = accounts[0];
        seller = accounts[1];
        
        
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
            nextTwinId = "0";

            // Required constructor params
            id = sellerId = "0";
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

                // Add a twin, testing for the event
                await expect(twinHandler.connect(seller).createTwin(twin))
                    .to.emit(twinHandler, 'TwinCreated')
                    .withArgs(nextTwinId, twin.sellerId);
                
            });

            it("should ignore any provided id and assign the next available", async function () {
                twin.id = "444";

                // Add a twin, testing for the event
                await expect(twinHandler.connect(seller).createTwin(twin))
                    .to.emit(twinHandler, 'TwinCreated')
                    .withArgs(nextTwinId, twin.sellerId);
            });
        });

        context("👉 isTokenTransferApproved()", async function () {
            context("👉 ERC20 ", async function () {
                it("should return false if protocol is Not approved to transfer the token", async function () {
                    twin.tokenAddress = contractBosonToken.address;

                    // Is the transfer approved?
                    tokenIsApproved = await twinHandler.connect(seller).isTokenTransferApproved(
                        twin.tokenAddress,
                        seller.address,
                        ethers.constants.AddressZero
                    );

                    // Verify expectation
                    expect(tokenIsApproved).to.be.false;
                });

                it("should return true if protocol is approved to transfer the token", async function () {
                    twin.tokenAddress = contractBosonToken.address;

                    await expect(contractBosonToken.connect(seller).approve(deployer.address, 1))
                    .to.emit(contractBosonToken, 'Approval')
                    .withArgs(seller.address, deployer.address, 1);


                    // Is the transfer approved?
                    tokenIsApproved = await twinHandler.connect(seller).isTokenTransferApproved(
                        twin.tokenAddress,
                        seller.address,
                        deployer.address
                    );

                    // // Verify expectation
                    expect(tokenIsApproved).to.be.true;
                });
            });

            context("👉 ERC721 ", async function () {
                it("should return false if protocol is Not approved to transfer the token", async function () {
                    twin.tokenAddress = contractForeign721.address;

                    // Is the transfer approved?
                    tokenIsApproved = await twinHandler.connect(seller).isTokenTransferApproved(
                        twin.tokenAddress,
                        seller.address,
                        ethers.constants.AddressZero
                    );

                    // Verify expectation
                    expect(tokenIsApproved).to.be.false;
                });

                it("should return true if protocol is approved to transfer the token", async function () {
                    twin.tokenAddress = contractForeign721.address;

                    await contractForeign721.connect(seller).mint(twin.tokenId);
                    await contractForeign721.connect(seller).setApprovalForAll(deployer.address, true);

                    // Is the transfer approved?
                    tokenIsApproved = await twinHandler.connect(seller).isTokenTransferApproved(
                        twin.tokenAddress,
                        seller.address,
                        deployer.address
                    );

                    // Verify expectation
                    expect(tokenIsApproved).to.be.true;
                });
            });

            context("👉 ERC1155 ", async function () {
                it("should return false if protocol is Not approved to transfer the token", async function () {
                    twin.tokenAddress = contractForeign1155.address;

                    // Is the transfer approved?
                    tokenIsApproved = await twinHandler.connect(seller).isTokenTransferApproved(
                        twin.tokenAddress,
                        seller.address,
                        ethers.constants.AddressZero
                    );

                    // Verify expectation
                    expect(tokenIsApproved).to.be.false;
                });

                it("should return true if protocol is approved to transfer the token", async function () {
                    twin.tokenAddress = contractForeign1155.address;

                    await contractForeign1155.connect(seller).mint(twin.tokenId, twin.supplyIds[0]);
                    await contractForeign1155.connect(seller).setApprovalForAll(deployer.address, true);

                    // Is the transfer approved?
                    tokenIsApproved = await twinHandler.connect(seller).isTokenTransferApproved(
                        twin.tokenAddress,
                        seller.address,
                        deployer.address
                    );

                    // Verify expectation
                    expect(tokenIsApproved).to.be.true;
                });
            });

            context("💔 Revert Reasons", async function () {
                it("Token address is unsupported", async function () {
                    //Unsupported token address
                    twin.tokenAddress = ethers.constants.AddressZero;

                    await expect(twinHandler.connect(seller).isTokenTransferApproved(
                        twin.tokenAddress,
                        seller.address,
                        deployer.address
                    )).to.be.reverted;
                });
            });

        });
    });

});
