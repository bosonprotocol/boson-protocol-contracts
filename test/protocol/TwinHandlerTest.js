const hre = require("hardhat");
const ethers = hre.ethers;
const { expect, assert } = require("chai");
const { gasLimit } = require("../../environments");

const Role = require("../../scripts/domain/Role");
const Seller = require("../../scripts/domain/Seller");
const Twin = require("../../scripts/domain/Twin");
const TokenType = require("../../scripts/domain/TokenType");
const Bundle = require("../../scripts/domain/Bundle");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { getEvent } = require("../../scripts/util/test-utils.js");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");

/**
 *  Test the Boson Twin Handler interface
 */
describe("IBosonTwinHandler", function () {
  // Common vars
  let InterfaceIds;
  let accounts, deployer, rando, operator, admin, clerk, treasury;
  let seller, active;
  let erc165,
    protocolDiamond,
    accessController,
    twinHandler,
    accountHandler,
    bundleHandler,
    twinStruct,
    bosonToken,
    foreign721,
    foreign1155,
    fallbackError,
    success,
    expected,
    twin,
    nextTwinId,
    invalidTwinId,
    support,
    twinInstance,
    id,
    sellerId,
    supplyAvailable,
    supplyIds,
    tokenId,
    tokenAddress;
  let bundleId, offerIds, twinIds, bundle, tokenType;

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

    // Deploy the Protocol Diamond
    [protocolDiamond, , , accessController] = await deployProtocolDiamond();

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Cut the protocol handler facets into the Diamond
    await deployProtocolHandlerFacets(protocolDiamond, [
      "AccountHandlerFacet",
      "TwinHandlerFacet",
      "BundleHandlerFacet",
    ]);

    // Add config Handler, so twin id starts at 1
    const protocolConfig = [
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0",
      "100",
      "100",
      "100",
      "100",
      "100",
    ];

    // Deploy the Config facet, initializing the protocol config
    await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);

    // Cast Diamond to IERC165
    erc165 = await ethers.getContractAt("IERC165", protocolDiamond.address);

    // Cast Diamond to IBosonAccountHandler
    accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);

    // Cast Diamond to ITwinHandler
    twinHandler = await ethers.getContractAt("IBosonTwinHandler", protocolDiamond.address);

    // Cast Diamond to IBundleHandler
    bundleHandler = await ethers.getContractAt("IBosonBundleHandler", protocolDiamond.address);

    // Deploy the mock tokens
    [bosonToken, foreign721, foreign1155, fallbackError] = await deployMockTokens(gasLimit);
  });

  // Interface support (ERC-156 provided by ProtocolDiamond, others by deployed facets)
  context("📋 Interfaces", async function () {
    context("👉 supportsInterface()", async function () {
      it("should indicate support for IBosonTwinHandler interface", async function () {
        // Current interfaceId for IBosonTwinHandler
        support = await erc165.supportsInterface(InterfaceIds.IBosonTwinHandler);

        // Test
        await expect(support, "IBosonTwinHandler interface not supported").is.true;
      });
    });
  });

  // All supported methods
  context("📋 Twin Handler Methods", async function () {
    beforeEach(async function () {
      // create a seller
      // Required constructor params
      id = "1"; // argument sent to contract for createSeller will be ignored
      active = true;

      // Create a valid seller, then set fields in tests directly
      seller = new Seller(id, operator.address, admin.address, clerk.address, treasury.address, active);
      expect(seller.isValid()).is.true;

      await accountHandler.connect(admin).createSeller(seller);

      // The first twin id
      nextTwinId = "1";
      invalidTwinId = "222";

      // Required constructor params
      id = sellerId = "1";
      supplyAvailable = "500";
      tokenId = "0"; // has to be zero, even if not used.
      supplyIds = [];
      tokenAddress = bosonToken.address;
      tokenType = TokenType.FungibleToken;

      // Create a valid twin, then set fields in tests directly
      twin = new Twin(id, sellerId, supplyAvailable, supplyIds, tokenId, tokenAddress, tokenType);
      expect(twin.isValid()).is.true;

      // How that twin looks as a returned struct
      twinStruct = twin.toStruct();
    });

    context("👉 createTwin()", async function () {
      it("should emit a TwinCreated event", async function () {
        twin.tokenAddress = bosonToken.address;

        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(operator).approve(twinHandler.address, 1);

        // Create a twin, testing for the event
        const tx = await twinHandler.connect(operator).createTwin(twin);
        const txReceipt = await tx.wait();

        const event = getEvent(txReceipt, twinHandler, "TwinCreated");

        twinInstance = Twin.fromStruct(event.twin);
        // Validate the instance
        expect(twinInstance.isValid()).to.be.true;

        assert.equal(event.twinId.toString(), nextTwinId, "Twin Id is incorrect");
        assert.equal(event.sellerId.toString(), twin.sellerId, "Seller Id is incorrect");
        assert.equal(Twin.fromStruct(event.twin).toString(), twin.toString(), "Twin struct is incorrect");
      });

      it("should ignore any provided id and assign the next available", async function () {
        twin.id = "444";

        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(operator).approve(twinHandler.address, 1);

        // Create a twin, testing for the event
        const tx = await twinHandler.connect(operator).createTwin(twin);
        const txReceipt = await tx.wait();

        const event = getEvent(txReceipt, twinHandler, "TwinCreated");

        twinInstance = Twin.fromStruct(event.twin);
        // Validate the instance
        expect(twinInstance.isValid()).to.be.true;

        assert.equal(event.twinId.toString(), nextTwinId, "Twin Id is incorrect");
        assert.equal(event.sellerId.toString(), twin.sellerId, "Seller Id is incorrect");
        assert.notEqual(Twin.fromStruct(event.twin).toString(), twin.toString(), "Twin struct is incorrect");

        // should match the expected twin
        let expectedTwin = twin.clone();
        expectedTwin.id = nextTwinId;
        assert.equal(
          Twin.fromStruct(event.twin).toString(),
          expectedTwin.toString(),
          "Expected Twin struct is incorrect"
        );

        // wrong twin id should not exist
        [success] = await twinHandler.connect(rando).getTwin(twin.id);
        expect(success).to.be.false;

        // next twin id should exist
        [success] = await twinHandler.connect(rando).getTwin(nextTwinId);
        expect(success).to.be.true;
      });

      it("should emit a TwinCreated event for ERC721 token address", async function () {
        twin.tokenAddress = foreign721.address;

        // Mint a token and approve twinHandler contract to transfer it
        await foreign721.connect(operator).mint(twin.tokenId);
        await foreign721.connect(operator).setApprovalForAll(twinHandler.address, true);

        // Create a twin, testing for the event
        const tx = await twinHandler.connect(operator).createTwin(twin);
        const txReceipt = await tx.wait();

        const event = getEvent(txReceipt, twinHandler, "TwinCreated");

        twinInstance = Twin.fromStruct(event.twin);
        // Validate the instance
        expect(twinInstance.isValid()).to.be.true;

        assert.equal(event.twinId.toString(), nextTwinId, "Twin Id is incorrect");
        assert.equal(event.sellerId.toString(), twin.sellerId, "Seller Id is incorrect");
        assert.equal(Twin.fromStruct(event.twin).toString(), twin.toString(), "Twin struct is incorrect");
      });

      it("should emit a TwinCreated event for ERC1155 token address", async function () {
        twin.tokenAddress = foreign1155.address;

        // Mint a token and approve twinHandler contract to transfer it
        await foreign1155.connect(operator).mint(twin.tokenId, twin.supplyAvailable);
        await foreign1155.connect(operator).setApprovalForAll(twinHandler.address, true);

        // Create a twin, testing for the event
        const tx = await twinHandler.connect(operator).createTwin(twin);
        const txReceipt = await tx.wait();
        const event = getEvent(txReceipt, twinHandler, "TwinCreated");

        // Validate the instance
        twinInstance = Twin.fromStruct(event.twin);
        expect(twinInstance.isValid()).to.be.true;

        // Test fields
        assert.equal(event.twinId.toString(), nextTwinId, "Twin Id is incorrect");
        assert.equal(event.sellerId.toString(), twin.sellerId, "Seller Id is incorrect");
        assert.equal(Twin.fromStruct(event.twin).toString(), twin.toString(), "Twin struct is incorrect");
      });

      context("💔 Revert Reasons", async function () {
        it("Caller not operator of any seller", async function () {
          // Attempt to Create a twin, expecting revert
          await expect(twinHandler.connect(rando).createTwin(twin)).to.revertedWith(RevertReasons.NOT_OPERATOR);
        });

        it("should revert if protocol is not approved to transfer the ERC20 token", async function () {
          //ERC20 token address
          twin.tokenAddress = bosonToken.address;

          await expect(twinHandler.connect(operator).createTwin(twin)).to.revertedWith(
            RevertReasons.NO_TRANSFER_APPROVED
          );
        });

        it("should revert if protocol is not approved to transfer the ERC721 token", async function () {
          //ERC721 token address
          twin.tokenAddress = foreign721.address;

          await expect(twinHandler.connect(operator).createTwin(twin)).to.revertedWith(
            RevertReasons.NO_TRANSFER_APPROVED
          );
        });

        it("should revert if protocol is not approved to transfer the ERC1155 token", async function () {
          //ERC1155 token address
          twin.tokenAddress = foreign1155.address;

          await expect(twinHandler.connect(operator).createTwin(twin)).to.revertedWith(
            RevertReasons.NO_TRANSFER_APPROVED
          );
        });

        context("Token address is unsupported", async function () {
          it("Token address is a zero address", async function () {
            twin.tokenAddress = ethers.constants.AddressZero;

            await expect(twinHandler.connect(operator).createTwin(twin)).to.be.revertedWith(
              RevertReasons.UNSUPPORTED_TOKEN
            );
          });

          it("Token address is a contract address that does not support the isApprovedForAll", async function () {
            twin.tokenAddress = twinHandler.address;

            await expect(twinHandler.connect(operator).createTwin(twin)).to.be.revertedWith(
              RevertReasons.UNSUPPORTED_TOKEN
            );
          });

          it("Token address is a contract that reverts from a fallback method", async function () {
            twin.tokenAddress = fallbackError.address;

            await expect(twinHandler.connect(operator).createTwin(twin)).to.be.revertedWith(
              RevertReasons.UNSUPPORTED_TOKEN
            );
          });
        });
      });
    });

    context("👉 getTwin()", async function () {
      beforeEach(async function () {
        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(operator).approve(twinHandler.address, 1);

        // Create a twin
        await twinHandler.connect(operator).createTwin(twin);

        // id of the current twin and increment nextTwinId
        id = nextTwinId++;
      });

      it("should return true for success if twin is found", async function () {
        // Get the success flag
        [success] = await twinHandler.connect(rando).getTwin(id);

        // Validate
        expect(success).to.be.true;
      });

      it("should return false for success if twin is not found", async function () {
        // Get the success flag
        [success] = await twinHandler.connect(rando).getTwin(invalidTwinId);

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

    context("👉 getNextTwinId()", async function () {
      beforeEach(async function () {
        // Create another valid seller.
        seller = new Seller(id, rando.address, rando.address, rando.address, rando.address, active);
        expect(seller.isValid()).is.true;
        await accountHandler.connect(rando).createSeller(seller);

        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(rando).approve(twinHandler.address, 1);

        // Create a twin
        await twinHandler.connect(rando).createTwin(twin);

        // id of the current twin and increment nextTwinId
        id = nextTwinId++;
      });

      it("should return the next twin id", async function () {
        // What we expect the next twin id to be
        expected = nextTwinId;

        // Get the next twin id
        nextTwinId = await twinHandler.connect(rando).getNextTwinId();

        // Verify expectation
        expect(nextTwinId.toString() == expected).to.be.true;
      });

      it("should be incremented after a twin is created", async function () {
        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(operator).approve(twinHandler.address, 1);

        // Create another twin
        await twinHandler.connect(operator).createTwin(twin);

        // What we expect the next twin id to be
        expected = ++nextTwinId;

        // Get the next twin id
        nextTwinId = await twinHandler.connect(rando).getNextTwinId();

        // Verify expectation
        expect(nextTwinId.toString() == expected).to.be.true;
      });

      it("should not be incremented when only getNextTwinId is called", async function () {
        // What we expect the next twin id to be
        expected = nextTwinId;

        // Get the next twin id
        nextTwinId = await twinHandler.connect(rando).getNextTwinId();

        // Verify expectation
        expect(nextTwinId.toString() == expected).to.be.true;

        // Call again
        nextTwinId = await twinHandler.connect(rando).getNextTwinId();

        // Verify expectation
        expect(nextTwinId.toString() == expected).to.be.true;
      });
    });

    context("👉 removeTwin()", async function () {
      beforeEach(async function () {
        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(operator).approve(twinHandler.address, 1);

        // Create a twin
        await twinHandler.connect(operator).createTwin(twin);
      });

      it("should emit a TwinDeleted event", async function () {
        // Expect twin to be found.
        [success] = await twinHandler.connect(rando).getTwin(twin.id);
        expect(success).to.be.true;

        // Remove the twin, testing for the event.
        await expect(twinHandler.connect(operator).removeTwin(twin.id))
          .to.emit(twinHandler, "TwinDeleted")
          .withArgs(twin.id, twin.sellerId);

        // Expect twin to be not found.
        [success] = await twinHandler.connect(rando).getTwin(twin.id);
        expect(success).to.be.false;
      });

      context("💔 Revert Reasons", async function () {
        it("Twin does not exist", async function () {
          let nonExistantTwinId = "999";

          // Attempt to Remove a twin, expecting revert
          await expect(twinHandler.connect(operator).removeTwin(nonExistantTwinId)).to.revertedWith(
            RevertReasons.NO_SUCH_TWIN
          );
        });

        it("Caller is not the seller", async function () {
          // Attempt to Remove a twin, expecting revert
          await expect(twinHandler.connect(rando).removeTwin(twin.id)).to.revertedWith(RevertReasons.NOT_OPERATOR);
        });

        it("Twin has bundles", async function () {
          // Bundle: Required constructor params
          bundleId = "1";
          offerIds = [];
          twinIds = [twin.id];

          // Create a new bundle
          bundle = new Bundle(bundleId, sellerId, offerIds, twinIds);
          await bundleHandler.connect(operator).createBundle(bundle);

          // Attempt to Remove a twin, expecting revert
          await expect(twinHandler.connect(operator).removeTwin(twin.id)).to.revertedWith(
            RevertReasons.TWIN_HAS_BUNDLES
          );
        });
      });
    });
  });
});
