const hre = require("hardhat");
const ethers = hre.ethers;
const { expect, assert } = require("chai");
const { gasLimit } = require("../../environments");

const Role = require("../../scripts/domain/Role");
const Seller = require("../../scripts/domain/Seller");
const AuthToken = require("../../scripts/domain/AuthToken");
const AuthTokenType = require("../../scripts/domain/AuthTokenType");
const Twin = require("../../scripts/domain/Twin");
const Bundle = require("../../scripts/domain/Bundle");
const TokenType = require("../../scripts/domain/TokenType.js");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const VoucherInitValues = require("../../scripts/domain/VoucherInitValues");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { getEvent } = require("../../scripts/util/test-utils.js");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const { mockTwin } = require("../utils/mock");
const { oneMonth } = require("../utils/constants");

/**
 *  Test the Boson Twin Handler interface
 */
describe("IBosonTwinHandler", function () {
  // Common vars
  let InterfaceIds;
  let deployer, pauser, rando, operator, admin, clerk, treasury;
  let seller, active;
  let erc165,
    protocolDiamond,
    accessController,
    twinHandler,
    accountHandler,
    bundleHandler,
    pauseHandler,
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
    sellerId;
  let bundleId, offerIds, twinIds, bundle;
  let protocolFeePercentage, protocolFeeFlatBoson, buyerEscalationDepositPercentage;
  let voucherInitValues, contractURI, royaltyPercentage;
  let emptyAuthToken;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();
  });

  beforeEach(async function () {
    // Make accounts available
    [deployer, pauser, operator, admin, clerk, treasury, rando] = await ethers.getSigners();

    // Deploy the Protocol Diamond
    [protocolDiamond, , , accessController] = await deployProtocolDiamond();

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Temporarily grant PAUSER role to pauser account
    await accessController.grantRole(Role.PAUSER, pauser.address);

    // Cut the protocol handler facets into the Diamond
    await deployProtocolHandlerFacets(protocolDiamond, [
      "SellerHandlerFacet",
      "TwinHandlerFacet",
      "BundleHandlerFacet",
      "PauseHandlerFacet",
    ]);

    // Deploy the mock tokens
    [bosonToken, foreign721, foreign1155, fallbackError] = await deployMockTokens(gasLimit);

    // set protocolFees
    protocolFeePercentage = "200"; // 2 %
    protocolFeeFlatBoson = ethers.utils.parseUnits("0.01", "ether").toString();
    buyerEscalationDepositPercentage = "1000"; // 10%

    // Add config Handler, so twin id starts at 1
    const protocolConfig = [
      // Protocol addresses
      {
        treasury: ethers.constants.AddressZero,
        token: bosonToken.address,
        voucherBeacon: ethers.constants.AddressZero,
        beaconProxy: ethers.constants.AddressZero,
      },
      // Protocol limits
      {
        maxExchangesPerBatch: 100,
        maxOffersPerGroup: 100,
        maxTwinsPerBundle: 100,
        maxOffersPerBundle: 100,
        maxOffersPerBatch: 100,
        maxTokensPerWithdrawal: 100,
        maxFeesPerDisputeResolver: 100,
        maxEscalationResponsePeriod: oneMonth,
        maxDisputesPerBatch: 100,
        maxAllowedSellers: 100,
        maxTotalOfferFeePercentage: 4000, //40%
      },
      // Protocol fees
      {
        percentage: protocolFeePercentage,
        flatBoson: protocolFeeFlatBoson,
      },
      buyerEscalationDepositPercentage,
    ];
    // Deploy the Config facet, initializing the protocol config
    await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);

    // Cast Diamond to IERC165
    erc165 = await ethers.getContractAt("IERC165", protocolDiamond.address);

    // Cast Diamond to IBosonAccountHandler. Use this interface to call all individual account handlers
    accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);

    // Cast Diamond to IBosonTwinHandler
    twinHandler = await ethers.getContractAt("IBosonTwinHandler", protocolDiamond.address);

    // Cast Diamond to IBosonBundleHandler
    bundleHandler = await ethers.getContractAt("IBosonBundleHandler", protocolDiamond.address);

    // Cast Diamond to IBosonPauseHandler
    pauseHandler = await ethers.getContractAt("IBosonPauseHandler", protocolDiamond.address);
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

      // VoucherInitValues
      contractURI = `https://ipfs.io/ipfs/QmW2WQi7j6c7UgJTarActp7tDNikE4B2qXtFCfLPdsgaTQ`;
      royaltyPercentage = "0"; // 0%
      voucherInitValues = new VoucherInitValues(contractURI, royaltyPercentage);
      expect(voucherInitValues.isValid()).is.true;

      // AuthToken
      emptyAuthToken = new AuthToken("0", AuthTokenType.None);
      expect(emptyAuthToken.isValid()).is.true;
      await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

      // The first twin id
      nextTwinId = sellerId = "1";
      invalidTwinId = "222";

      // Create a valid twin, then set fields in tests directly
      twin = mockTwin(bosonToken.address);
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
        await foreign721.connect(operator).mint(twin.tokenId, "1");
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
        await foreign1155.connect(operator).mint(twin.tokenId, twin.amount);
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
        it("The twins region of protocol is paused", async function () {
          // Pause the twins region of the protocol
          await pauseHandler
            .connect(pauser)
            .pause([PausableRegion.Offers, PausableRegion.Twins, PausableRegion.Bundles]);

          // Attempt to Remove a twin, expecting revert
          await expect(twinHandler.connect(operator).removeTwin(twin.id)).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("Caller not operator of any seller", async function () {
          // Attempt to Create a twin, expecting revert
          await expect(twinHandler.connect(rando).createTwin(twin)).to.revertedWith(RevertReasons.NOT_OPERATOR);
        });

        it("protocol is not approved to transfer the ERC20 token", async function () {
          //ERC20 token address
          twin.tokenAddress = bosonToken.address;

          await expect(twinHandler.connect(operator).createTwin(twin)).to.revertedWith(
            RevertReasons.NO_TRANSFER_APPROVED
          );
        });

        it("protocol is not approved to transfer the ERC721 token", async function () {
          //ERC721 token address
          twin.tokenAddress = foreign721.address;

          await expect(twinHandler.connect(operator).createTwin(twin)).to.revertedWith(
            RevertReasons.NO_TRANSFER_APPROVED
          );
        });

        it("protocol is not approved to transfer the ERC1155 token", async function () {
          //ERC1155 token address
          twin.tokenAddress = foreign1155.address;

          await expect(twinHandler.connect(operator).createTwin(twin)).to.revertedWith(
            RevertReasons.NO_TRANSFER_APPROVED
          );
        });

        it("supplyAvailable is zero", async function () {
          // Mint a token and approve twinHandler contract to transfer it
          await foreign721.connect(operator).mint(twin.tokenId, "1");
          await foreign721.connect(operator).setApprovalForAll(twinHandler.address, true);

          twin.supplyAvailable = "0";
          twin.amount = "0";
          twin.tokenId = "1";
          twin.tokenAddress = foreign721.address;
          twin.tokenType = TokenType.NonFungibleToken;

          await expect(twinHandler.connect(operator).createTwin(twin)).to.be.revertedWith(
            RevertReasons.INVALID_SUPPLY_AVAILABLE
          );
        });

        it("Amount is zero and token type is FungibleToken", async function () {
          // Approving the twinHandler contract to transfer seller's tokens
          await bosonToken.connect(operator).approve(twinHandler.address, 1);

          twin.amount = "0";
          twin.tokenAddress = bosonToken.address;
          twin.tokenType = TokenType.FungibleToken;

          await expect(twinHandler.connect(operator).createTwin(twin)).to.be.revertedWith(RevertReasons.INVALID_AMOUNT);
        });

        it("Amount is zero and token type is MultiToken", async function () {
          // Mint a token and approve twinHandler contract to transfer it
          await foreign1155.connect(operator).mint(twin.tokenId, "1");
          await foreign1155.connect(operator).setApprovalForAll(twinHandler.address, true);

          twin.amount = "0";
          twin.tokenAddress = foreign1155.address;
          twin.tokenType = TokenType.MultiToken;

          await expect(twinHandler.connect(operator).createTwin(twin)).to.be.revertedWith(RevertReasons.INVALID_AMOUNT);
        });

        it("Amount is zero and token type is NonFungibleToken", async function () {
          twin.tokenAddress = foreign721.address;
          twin.tokenType = TokenType.NonFungibleToken;
          twin.amount = "1";
          twin.tokenId = "1";

          // Mint a token and approve twinHandler contract to transfer it
          await foreign721.connect(operator).mint(twin.tokenId, "1");
          await foreign721.connect(operator).setApprovalForAll(twinHandler.address, true);

          await expect(twinHandler.connect(operator).createTwin(twin)).to.be.revertedWith(
            RevertReasons.INVALID_TWIN_PROPERTY
          );
        });

        it("twin range is already being used in another twin", async function () {
          twin.supplyAvailable = "10";
          twin.amount = "0";
          twin.tokenId = "5";
          twin.tokenAddress = foreign721.address;
          twin.tokenType = TokenType.NonFungibleToken;

          // Mint a token and approve twinHandler contract to transfer it
          await foreign721.connect(operator).mint(twin.tokenId, twin.supplyAvailable);
          await foreign721.connect(operator).setApprovalForAll(twinHandler.address, true);

          // Create first twin with ids range: ["5"..."14"]
          await twinHandler.connect(operator).createTwin(twin);

          // Create another twin with exact same range
          await expect(twinHandler.connect(operator).createTwin(twin)).to.be.revertedWith(
            RevertReasons.INVALID_TWIN_TOKEN_RANGE
          );

          // Create an twin with ids range: ["0" ... "5"]
          twin.tokenId = "0";
          twin.supplyAvailable = "6";
          await expect(twinHandler.connect(operator).createTwin(twin)).to.be.revertedWith(
            RevertReasons.INVALID_TWIN_TOKEN_RANGE
          );

          // Create an twin with ids range: ["14" ... "18"]
          twin.tokenId = "14";
          twin.supplyAvailable = "5";
          await expect(twinHandler.connect(operator).createTwin(twin)).to.be.revertedWith(
            RevertReasons.INVALID_TWIN_TOKEN_RANGE
          );

          // Create an twin with ids range: ["6" ... "9"]
          twin.tokenId = "6";
          twin.supplyAvailable = "4";
          await expect(twinHandler.connect(operator).createTwin(twin)).to.be.revertedWith(
            RevertReasons.INVALID_TWIN_TOKEN_RANGE
          );
        });

        it("token address has been used in another twin with unlimited supply", async function () {
          twin.supplyAvailable = ethers.constants.MaxUint256;
          twin.tokenType = TokenType.NonFungibleToken;
          twin.tokenAddress = foreign721.address;
          twin.amount = "0";

          await foreign721.connect(operator).setApprovalForAll(twinHandler.address, true);

          // Create twin with unlimited supply
          await twinHandler.connect(operator).createTwin(twin);

          // Create new twin with same token address
          await expect(twinHandler.connect(operator).createTwin(twin)).to.be.revertedWith(
            RevertReasons.INVALID_TWIN_TOKEN_RANGE
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

          it("Token address is a contract that doesn't implement IERC721 interface when selected token type is NonFungible", async function () {
            await bosonToken.connect(operator).approve(twinHandler.address, 1);
            twin.tokenType = TokenType.NonFungibleToken;
            twin.tokenAddress = bosonToken.address;

            await expect(twinHandler.connect(operator).createTwin(twin)).to.be.revertedWith(
              RevertReasons.INVALID_TOKEN_ADDRESS
            );
          });

          it("Token address is a contract that doesn't implement IERC1155 interface when selected token type is MultiToken", async function () {
            await bosonToken.connect(operator).approve(twinHandler.address, 1);
            twin.tokenType = TokenType.MultiToken;
            twin.tokenAddress = bosonToken.address;

            await expect(twinHandler.connect(operator).createTwin(twin)).to.be.revertedWith(
              RevertReasons.INVALID_TOKEN_ADDRESS
            );
          });
        });
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
          .withArgs(twin.id, twin.sellerId, operator.address);

        // Expect twin to be not found.
        [success] = await twinHandler.connect(rando).getTwin(twin.id);
        expect(success).to.be.false;
      });

      it("should make twin range available again if token type is NonFungible", async function () {
        twin.tokenType = TokenType.NonFungibleToken;
        twin.tokenAddress = foreign721.address;
        twin.amount = "0";
        const expectedNewTwinId = "2";

        await foreign721.connect(operator).setApprovalForAll(twinHandler.address, true);

        // Create a twin with range: [0,1499]
        await twinHandler.connect(operator).createTwin(twin);

        // Remove twin
        await twinHandler.connect(operator).removeTwin(expectedNewTwinId);

        // Twin range must be available and createTwin transaction with same range should succeed
        await expect(twinHandler.connect(operator).createTwin(twin)).to.not.reverted;
      });

      context("💔 Revert Reasons", async function () {
        it("The twins region of protocol is paused", async function () {
          // Pause the twins region of the protocol
          await pauseHandler
            .connect(pauser)
            .pause([PausableRegion.Offers, PausableRegion.Twins, PausableRegion.Bundles]);

          // Attempt to Remove a twin, expecting revert
          await expect(twinHandler.connect(operator).removeTwin(twin.id)).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

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

        it("Bundle for twin exists", async function () {
          // Bundle: Required constructor params
          bundleId = "1";
          offerIds = [];
          twinIds = [twin.id];

          // Create a new bundle
          bundle = new Bundle(bundleId, sellerId, offerIds, twinIds);
          await bundleHandler.connect(operator).createBundle(bundle);

          // Attempt to Remove a twin, expecting revert
          await expect(twinHandler.connect(operator).removeTwin(twin.id)).to.revertedWith(
            RevertReasons.BUNDLE_FOR_TWIN_EXISTS
          );
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

        // AuthToken
        emptyAuthToken = new AuthToken("0", AuthTokenType.None);
        expect(emptyAuthToken.isValid()).is.true;
        await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);

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
  });
});
