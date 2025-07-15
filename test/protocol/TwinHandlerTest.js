const { ethers } = require("hardhat");
const { ZeroAddress, MaxUint256, id: ethersId, getContractAt } = ethers;
const { expect, assert } = require("chai");
const Twin = require("../../scripts/domain/Twin");
const Bundle = require("../../scripts/domain/Bundle");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const TokenType = require("../../scripts/domain/TokenType.js");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const {
  getEvent,
  setupTestEnvironment,
  getSnapshot,
  revertToSnapshot,
  getMappingStoragePosition,
  paddingType,
} = require("../util/utils.js");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const { mockOffer, mockSeller, mockTwin, mockAuthToken, mockVoucherInitValues, accountId } = require("../util/mock");
const { getStorageAt } = require("@nomicfoundation/hardhat-network-helpers");

/**
 *  Test the Boson Twin Handler interface
 */
describe("IBosonTwinHandler", function () {
  // Common vars
  let InterfaceIds;
  let pauser, rando, assistant, admin, clerk, treasury;
  let seller;
  let erc165,
    twinHandler,
    accountHandler,
    bundleHandler,
    offerHandler,
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
    id;
  let bundleId, offerIds, twinIds, bundle;
  let voucherInitValues;
  let emptyAuthToken;
  let snapshotId;
  let bosonErrors;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();

    // Specify contracts needed for this test
    const contracts = {
      erc165: "ERC165Facet",
      accountHandler: "IBosonAccountHandler",
      twinHandler: "IBosonTwinHandler",
      bundleHandler: "IBosonBundleHandler",
      offerHandler: "IBosonOfferHandler",
      pauseHandler: "IBosonPauseHandler",
    };

    ({
      signers: [pauser, admin, treasury, rando],
      contractInstances: { erc165, accountHandler, twinHandler, bundleHandler, offerHandler, pauseHandler },
    } = await setupTestEnvironment(contracts));

    bosonErrors = await getContractAt("BosonErrors", await accountHandler.getAddress());

    // make all account the same
    assistant = admin;
    clerk = { address: ZeroAddress };

    // Deploy the mock tokens
    [bosonToken, foreign721, foreign1155, fallbackError] = await deployMockTokens();

    // Get snapshot id
    snapshotId = await getSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();
  });

  // Interface support (ERC-156 provided by ProtocolDiamond, others by deployed facets)
  context("📋 Interfaces", async function () {
    context("👉 supportsInterface()", async function () {
      it("should indicate support for IBosonTwinHandler interface", async function () {
        // Current interfaceId for IBosonTwinHandler
        support = await erc165.supportsInterface(InterfaceIds.IBosonTwinHandler);

        // Test
        expect(support, "IBosonTwinHandler interface not supported").is.true;
      });
    });
  });

  // All supported methods
  context("📋 Twin Handler Methods", async function () {
    beforeEach(async function () {
      // create a seller
      // Required constructor params
      id = "1"; // argument sent to contract for createSeller will be ignored

      // Create a valid seller, then set fields in tests directly
      seller = mockSeller(
        await assistant.getAddress(),
        await admin.getAddress(),
        clerk.address,
        await treasury.getAddress()
      );
      expect(seller.isValid()).is.true;

      // VoucherInitValues
      voucherInitValues = mockVoucherInitValues();
      expect(voucherInitValues.isValid()).is.true;

      // AuthToken
      emptyAuthToken = mockAuthToken();
      expect(emptyAuthToken.isValid()).is.true;
      await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

      // The first twin id
      nextTwinId = "1";
      invalidTwinId = "222";

      // Create a valid twin, then set fields in tests directly
      twin = mockTwin(await bosonToken.getAddress());
      expect(twin.isValid()).is.true;

      // How that twin looks as a returned struct
      twinStruct = twin.toStruct();
    });

    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    context("👉 createTwin()", async function () {
      it("should emit a TwinCreated event", async function () {
        twin.tokenAddress = await bosonToken.getAddress();

        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1);

        // Create a twin, testing for the event
        const tx = await twinHandler.connect(assistant).createTwin(twin);
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
        await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1);

        // Create a twin, testing for the event
        const tx = await twinHandler.connect(assistant).createTwin(twin);
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
        twin.tokenAddress = await foreign721.getAddress();
        twin.tokenType = TokenType.NonFungibleToken;
        twin.amount = "0";

        // Mint a token and approve twinHandler contract to transfer it
        await foreign721.connect(assistant).mint(twin.tokenId, "1");
        await foreign721.connect(assistant).setApprovalForAll(await twinHandler.getAddress(), true);

        // Create a twin, testing for the event
        const tx = await twinHandler.connect(assistant).createTwin(twin);
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
        twin.tokenAddress = await foreign1155.getAddress();
        twin.tokenType = TokenType.MultiToken;

        // Mint a token and approve twinHandler contract to transfer it
        await foreign1155.connect(assistant).mint(twin.tokenId, twin.amount);
        await foreign1155.connect(assistant).setApprovalForAll(await twinHandler.getAddress(), true);

        // Create a twin, testing for the event
        const tx = await twinHandler.connect(assistant).createTwin(twin);
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

      it("It is possible to add the same ERC721 if ranges do not overlap", async function () {
        twin.supplyAvailable = "10";
        twin.amount = "0";
        twin.tokenId = "5";
        twin.tokenAddress = await foreign721.getAddress();
        twin.tokenType = TokenType.NonFungibleToken;

        // Mint a token and approve twinHandler contract to transfer it
        await foreign721.connect(assistant).mint(twin.tokenId, twin.supplyAvailable);
        await foreign721.connect(assistant).setApprovalForAll(await twinHandler.getAddress(), true);

        // Create first twin with ids range: ["5"..."14"]
        await twinHandler.connect(assistant).createTwin(twin);

        // Create an twin with ids range: ["18" ... "23"]
        twin.tokenId = "18";
        twin.supplyAvailable = "6";
        await expect(twinHandler.connect(assistant).createTwin(twin)).not.to.be.reverted;
      });

      it("It is possible to add an ERC721 with unlimited supply if token is not used yet", async function () {
        twin.supplyAvailable = MaxUint256.toString();
        twin.amount = "0";
        twin.tokenId = "0";
        twin.tokenAddress = await foreign721.getAddress();
        twin.tokenType = TokenType.NonFungibleToken;

        // another erc721 token
        const [foreign721_2] = await deployMockTokens(["Foreign721"]);

        let twin2 = twin.clone();
        twin2.supplyAvailable = "1500";
        twin2.tokenAddress = await foreign721_2.getAddress();

        // Approve twinHandler contract to transfer it
        await foreign721.connect(assistant).setApprovalForAll(await twinHandler.getAddress(), true);
        await foreign721_2.connect(assistant).setApprovalForAll(await twinHandler.getAddress(), true);

        // Create a twin with limited supply
        await twinHandler.connect(assistant).createTwin(twin);

        // Create another twin with unlimited supply
        await expect(twinHandler.connect(assistant).createTwin(twin2)).not.to.be.reverted;
      });

      it("It is possible to add ERC721 even if another ERC721 with unlimited supply exists", async function () {
        twin.supplyAvailable = MaxUint256.toString();
        twin.amount = "0";
        twin.tokenId = "0";
        twin.tokenAddress = await foreign721.getAddress();
        twin.tokenType = TokenType.NonFungibleToken;

        // another erc721 token
        const [foreign721_2] = await deployMockTokens(["Foreign721"]);

        let twin2 = twin.clone();
        twin2.supplyAvailable = "1500";
        twin2.tokenAddress = await foreign721_2.getAddress();

        // Approve twinHandler contract to transfer it
        await foreign721.connect(assistant).setApprovalForAll(await twinHandler.getAddress(), true);
        await foreign721_2.connect(assistant).setApprovalForAll(await twinHandler.getAddress(), true);

        // Create a twin with unlimited supply
        await twinHandler.connect(assistant).createTwin(twin);

        // Create another twin with limited supply
        await expect(twinHandler.connect(assistant).createTwin(twin2)).not.to.be.reverted;
      });

      it("Should ignore twin id set by seller and use nextAccountId on twins entity", async function () {
        twin.id = "666";
        twin.tokenAddress = await bosonToken.getAddress();

        // Approve twinHandler contract to transfer seller's tokens
        await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1);

        await twinHandler.connect(assistant).createTwin(twin);

        let [exists, storedTwin] = await twinHandler.getTwin("666");
        expect(exists).to.be.false;
        expect(storedTwin.id).to.be.equal("0");

        [exists, storedTwin] = await twinHandler.getTwin(nextTwinId);
        expect(exists).to.be.true;
        expect(storedTwin.id).to.be.equal(nextTwinId);
        assert.notEqual(storedTwin.id, twin.id, "Twin Id is incorrect");
      });

      context("💔 Revert Reasons", async function () {
        it("The twins region of protocol is paused", async function () {
          // Pause the twins region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Twins]);

          // Attempt to Remove a twin, expecting revert
          await expect(twinHandler.connect(assistant).createTwin(twin))
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Twins);
        });

        it("Caller not assistant of any seller", async function () {
          // Attempt to Create a twin, expecting revert
          await expect(twinHandler.connect(rando).createTwin(twin)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.NOT_ASSISTANT
          );
        });

        it("protocol is not approved to transfer the ERC20 token", async function () {
          //ERC20 token address
          twin.tokenAddress = await bosonToken.getAddress();

          await expect(twinHandler.connect(assistant).createTwin(twin)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.NO_TRANSFER_APPROVED
          );
        });

        it("protocol is not approved to transfer the ERC721 token", async function () {
          //ERC721 token address
          twin.tokenAddress = await foreign721.getAddress();

          await expect(twinHandler.connect(assistant).createTwin(twin)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.NO_TRANSFER_APPROVED
          );
        });

        it("protocol is not approved to transfer the ERC1155 token", async function () {
          //ERC1155 token address
          twin.tokenAddress = await foreign1155.getAddress();

          await expect(twinHandler.connect(assistant).createTwin(twin)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.NO_TRANSFER_APPROVED
          );
        });

        it("supplyAvailable is zero", async function () {
          // Mint a token and approve twinHandler contract to transfer it
          await foreign721.connect(assistant).mint(twin.tokenId, "1");
          await foreign721.connect(assistant).setApprovalForAll(await twinHandler.getAddress(), true);

          twin.supplyAvailable = "0";
          twin.amount = "0";
          twin.tokenId = "1";
          twin.tokenAddress = await foreign721.getAddress();
          twin.tokenType = TokenType.NonFungibleToken;

          await expect(twinHandler.connect(assistant).createTwin(twin)).to.be.revertedWithCustomError(
            bosonErrors,
            RevertReasons.INVALID_SUPPLY_AVAILABLE
          );
        });

        it("Amount is greater than supply available and token type is FungibleToken", async function () {
          // Approving the twinHandler contract to transfer seller's tokens
          await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1);

          twin.supplyAvailable = "10";
          twin.amount = "20";
          twin.tokenAddress = await bosonToken.getAddress();
          twin.tokenType = TokenType.FungibleToken;

          await expect(twinHandler.connect(assistant).createTwin(twin)).to.be.revertedWithCustomError(
            bosonErrors,
            RevertReasons.INVALID_AMOUNT
          );
        });

        it("Amount is greater than supply available and token type is MultiToken", async function () {
          // Mint a token and approve twinHandler contract to transfer it
          await foreign1155.connect(assistant).mint(twin.tokenId, "1");
          await foreign1155.connect(assistant).setApprovalForAll(await twinHandler.getAddress(), true);

          twin.supplyAvailable = "10";
          twin.amount = "20";
          twin.tokenAddress = await foreign1155.getAddress();
          twin.tokenType = TokenType.MultiToken;

          await expect(twinHandler.connect(assistant).createTwin(twin)).to.be.revertedWithCustomError(
            bosonErrors,
            RevertReasons.INVALID_AMOUNT
          );
        });

        it("Amount is zero and token type is FungibleToken", async function () {
          // Approving the twinHandler contract to transfer seller's tokens
          await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1);

          twin.amount = "0";
          twin.tokenAddress = await bosonToken.getAddress();
          twin.tokenType = TokenType.FungibleToken;

          await expect(twinHandler.connect(assistant).createTwin(twin)).to.be.revertedWithCustomError(
            bosonErrors,
            RevertReasons.INVALID_AMOUNT
          );
        });

        it("Amount is zero and token type is MultiToken", async function () {
          // Mint a token and approve twinHandler contract to transfer it
          await foreign1155.connect(assistant).mint(twin.tokenId, "1");
          await foreign1155.connect(assistant).setApprovalForAll(await twinHandler.getAddress(), true);

          twin.amount = "0";
          twin.tokenAddress = await foreign1155.getAddress();
          twin.tokenType = TokenType.MultiToken;

          await expect(twinHandler.connect(assistant).createTwin(twin)).to.be.revertedWithCustomError(
            bosonErrors,
            RevertReasons.INVALID_AMOUNT
          );
        });

        it("Amount is zero and token type is NonFungibleToken", async function () {
          twin.tokenAddress = await foreign721.getAddress();
          twin.tokenType = TokenType.NonFungibleToken;
          twin.amount = "1";
          twin.tokenId = "1";

          // Mint a token and approve twinHandler contract to transfer it
          await foreign721.connect(assistant).mint(twin.tokenId, "1");
          await foreign721.connect(assistant).setApprovalForAll(await twinHandler.getAddress(), true);

          await expect(twinHandler.connect(assistant).createTwin(twin)).to.be.revertedWithCustomError(
            bosonErrors,
            RevertReasons.INVALID_TWIN_PROPERTY
          );
        });

        it("twin range is already being used in another twin", async function () {
          twin.supplyAvailable = "10";
          twin.amount = "0";
          twin.tokenId = "5";
          twin.tokenAddress = await foreign721.getAddress();
          twin.tokenType = TokenType.NonFungibleToken;

          // Mint a token and approve twinHandler contract to transfer it
          await foreign721.connect(assistant).mint(twin.tokenId, twin.supplyAvailable);
          await foreign721.connect(assistant).setApprovalForAll(await twinHandler.getAddress(), true);

          // Create first twin with ids range: ["5"..."14"]
          await twinHandler.connect(assistant).createTwin(twin);

          // Create another twin with exact same range
          await expect(twinHandler.connect(assistant).createTwin(twin)).to.be.revertedWithCustomError(
            bosonErrors,
            RevertReasons.INVALID_TWIN_TOKEN_RANGE
          );

          // Create an twin with ids range: ["0" ... "5"]
          twin.tokenId = "0";
          twin.supplyAvailable = "6";
          await expect(twinHandler.connect(assistant).createTwin(twin)).to.be.revertedWithCustomError(
            bosonErrors,
            RevertReasons.INVALID_TWIN_TOKEN_RANGE
          );

          // Create an twin with ids range: ["14" ... "18"]
          twin.tokenId = "14";
          twin.supplyAvailable = "5";
          await expect(twinHandler.connect(assistant).createTwin(twin)).to.be.revertedWithCustomError(
            bosonErrors,
            RevertReasons.INVALID_TWIN_TOKEN_RANGE
          );

          // Create an twin with ids range: ["6" ... "9"]
          twin.tokenId = "6";
          twin.supplyAvailable = "4";
          await expect(twinHandler.connect(assistant).createTwin(twin)).to.be.revertedWithCustomError(
            bosonErrors,
            RevertReasons.INVALID_TWIN_TOKEN_RANGE
          );
        });

        it("token address has been used in another twin with unlimited supply", async function () {
          twin.supplyAvailable = MaxUint256;
          twin.tokenType = TokenType.NonFungibleToken;
          twin.tokenAddress = await foreign721.getAddress();
          twin.amount = "0";

          await foreign721.connect(assistant).setApprovalForAll(await twinHandler.getAddress(), true);

          // Create twin with unlimited supply
          await twinHandler.connect(assistant).createTwin(twin);

          // Create new twin with same token address
          twin.supplyAvailable = "2";
          await expect(twinHandler.connect(assistant).createTwin(twin)).to.be.revertedWithCustomError(
            bosonErrors,
            RevertReasons.INVALID_TWIN_TOKEN_RANGE
          );
        });

        it("Supply range overflow", async function () {
          twin.supplyAvailable = ((MaxUint256 / 10n) * 8n).toString();
          twin.tokenType = TokenType.NonFungibleToken;
          twin.tokenAddress = await foreign721.getAddress();
          twin.amount = "0";
          twin.tokenId = (MaxUint256 - BigInt(twin.supplyAvailable) + 1n).toString();

          await foreign721.connect(assistant).setApprovalForAll(await twinHandler.getAddress(), true);

          // Create new twin with same token address
          await expect(twinHandler.connect(assistant).createTwin(twin)).to.be.revertedWithCustomError(
            bosonErrors,
            RevertReasons.INVALID_TWIN_TOKEN_RANGE
          );
        });

        it("Token with unlimited supply with starting tokenId to high", async function () {
          twin.supplyAvailable = MaxUint256.toString();
          twin.tokenType = TokenType.NonFungibleToken;
          twin.tokenAddress = await foreign721.getAddress();
          twin.amount = "0";
          twin.tokenId = ((MaxUint256 + 1n) / 2n + 1n).toString();

          await foreign721.connect(assistant).setApprovalForAll(await twinHandler.getAddress(), true);

          // Create new twin with same token address
          await expect(twinHandler.connect(assistant).createTwin(twin)).to.be.revertedWithCustomError(
            bosonErrors,
            RevertReasons.INVALID_TWIN_TOKEN_RANGE
          );
        });

        context("Token address is unsupported", async function () {
          it("Token address is a zero address", async function () {
            twin.tokenAddress = ZeroAddress;

            await expect(twinHandler.connect(assistant).createTwin(twin)).to.be.revertedWithCustomError(
              bosonErrors,
              RevertReasons.UNSUPPORTED_TOKEN
            );
          });

          it("Token address is a contract address that does not support the isApprovedForAll", async function () {
            twin.tokenAddress = await twinHandler.getAddress();

            await expect(twinHandler.connect(assistant).createTwin(twin)).to.be.revertedWithCustomError(
              bosonErrors,
              RevertReasons.UNSUPPORTED_TOKEN
            );
          });

          it("Token address is a contract that reverts from a fallback method", async function () {
            twin.tokenAddress = await fallbackError.getAddress();

            await expect(twinHandler.connect(assistant).createTwin(twin)).to.be.revertedWithCustomError(
              bosonErrors,
              RevertReasons.UNSUPPORTED_TOKEN
            );
          });

          it("Token address is a contract that doesn't implement IERC721 interface when selected token type is NonFungible", async function () {
            await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1);
            twin.tokenType = TokenType.NonFungibleToken;
            twin.tokenAddress = await bosonToken.getAddress();

            await expect(twinHandler.connect(assistant).createTwin(twin)).to.be.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_TOKEN_ADDRESS
            );
          });

          it("Token address is a contract that doesn't implement IERC1155 interface when selected token type is MultiToken", async function () {
            await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1);
            twin.tokenType = TokenType.MultiToken;
            twin.tokenAddress = await bosonToken.getAddress();

            await expect(twinHandler.connect(assistant).createTwin(twin)).to.be.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_TOKEN_ADDRESS
            );
          });
        });
      });
    });

    context("👉 removeTwin()", async function () {
      beforeEach(async function () {
        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1);

        // Create a twin
        await twinHandler.connect(assistant).createTwin(twin);
      });

      it("should emit a TwinDeleted event", async function () {
        // Expect twin to be found.
        [success] = await twinHandler.connect(rando).getTwin(twin.id);
        expect(success).to.be.true;

        // Remove the twin, testing for the event.
        await expect(twinHandler.connect(assistant).removeTwin(twin.id))
          .to.emit(twinHandler, "TwinDeleted")
          .withArgs(twin.id, twin.sellerId, await assistant.getAddress());

        // Expect twin to be not found.
        [success] = await twinHandler.connect(rando).getTwin(twin.id);
        expect(success).to.be.false;
      });

      it("should make twin range available again if token type is NonFungible", async function () {
        twin.tokenType = TokenType.NonFungibleToken;
        twin.tokenAddress = await foreign721.getAddress();
        twin.amount = "0";
        const expectedNewTwinId = "2";

        await foreign721.connect(assistant).setApprovalForAll(await twinHandler.getAddress(), true);

        // Create a twin with range: [0,1499]
        await twinHandler.connect(assistant).createTwin(twin);

        // Remove twin
        await twinHandler.connect(assistant).removeTwin(expectedNewTwinId);

        // Twin range must be available and createTwin transaction with same range should succeed
        await expect(twinHandler.connect(assistant).createTwin(twin)).to.not.reverted;
      });

      it("If there is NonFungible twin with multiple ranges, the correct one is removed", async function () {
        // create three clones
        // Create a twin with range: [0,1499]
        let twin1 = twin.clone();
        twin1.tokenType = TokenType.NonFungibleToken;
        twin1.tokenAddress = await foreign721.getAddress();
        twin1.amount = "0";
        twin1.id = "2";

        // Create a twin with range: [2000,3499]
        let twin2 = twin1.clone();
        twin2.tokenId = "2000";
        twin2.id = "3";

        // Create a twin with range: [5000,6499]
        let twin3 = twin1.clone();
        twin3.tokenId = "5000";
        twin3.id = "4";

        const protocolDiamondAddress = await twinHandler.getAddress();
        await foreign721.connect(assistant).setApprovalForAll(protocolDiamondAddress, true);

        await twinHandler.connect(assistant).createTwin(twin1);
        await twinHandler.connect(assistant).createTwin(twin2);
        await twinHandler.connect(assistant).createTwin(twin3);

        // Check range by id mappings
        const protocolLookupsSlot = ethersId("boson.protocol.lookups");
        const protocolLookupsSlotNumber = BigInt(protocolLookupsSlot);

        let rangeIdByTwin1Slot = getMappingStoragePosition(protocolLookupsSlotNumber + 32n, "2", paddingType.START);
        let rangeIdByTwin1 = await getStorageAt(protocolDiamondAddress, rangeIdByTwin1Slot);
        expect(rangeIdByTwin1).to.equal(1n);

        let rangeIdByTwin2Slot = getMappingStoragePosition(protocolLookupsSlotNumber + 32n, "3", paddingType.START);
        let rangeIdByTwin2 = await getStorageAt(protocolDiamondAddress, rangeIdByTwin2Slot);
        expect(rangeIdByTwin2).to.equal(2n);

        let rangeIdByTwin3Slot = getMappingStoragePosition(protocolLookupsSlotNumber + 32n, "4", paddingType.START);
        let rangeIdByTwin3 = await getStorageAt(protocolDiamondAddress, rangeIdByTwin3Slot);
        expect(rangeIdByTwin3).to.equal(3n);

        // Remove twin
        await twinHandler.connect(assistant).removeTwin(twin2.id);

        // We don't have getters, so we implicitly test that correct change was done
        // Twin2 should still exists, therefore it should not be possible to create it again
        await expect(twinHandler.connect(assistant).createTwin(twin1)).to.be.revertedWithCustomError(
          bosonErrors,
          RevertReasons.INVALID_TWIN_TOKEN_RANGE
        );
        await expect(twinHandler.connect(assistant).createTwin(twin3)).to.be.revertedWithCustomError(
          bosonErrors,
          RevertReasons.INVALID_TWIN_TOKEN_RANGE
        );
        // Twin2 was removed, therefore it should be possible to be added again
        await expect(twinHandler.connect(assistant).createTwin(twin2)).to.not.reverted;

        // Check range by id mappings
        rangeIdByTwin1 = await getStorageAt(protocolDiamondAddress, rangeIdByTwin1Slot);
        expect(rangeIdByTwin1).to.equal(1n);

        rangeIdByTwin2 = await getStorageAt(protocolDiamondAddress, rangeIdByTwin2Slot);
        expect(rangeIdByTwin2).to.equal(0n);

        rangeIdByTwin3 = await getStorageAt(protocolDiamondAddress, rangeIdByTwin3Slot);
        expect(rangeIdByTwin3).to.equal(2n);
      });

      context("💔 Revert Reasons", async function () {
        it("The twins region of protocol is paused", async function () {
          // Pause the twins region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Twins]);

          // Attempt to Remove a twin, expecting revert
          await expect(twinHandler.connect(assistant).removeTwin(twin.id))
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Twins);
        });

        it("Twin does not exist", async function () {
          let nonExistantTwinId = "999";

          // Attempt to Remove a twin, expecting revert
          await expect(twinHandler.connect(assistant).removeTwin(nonExistantTwinId)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.NO_SUCH_TWIN
          );
        });

        it("Caller is not the seller", async function () {
          // Attempt to Remove a twin, expecting revert
          await expect(twinHandler.connect(rando).removeTwin(twin.id)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.NOT_ASSISTANT
          );
        });

        it("Bundle for twin exists", async function () {
          // Mock offer
          let { offer, offerDates, offerDurations } = await mockOffer();

          // Create an absolute zero offer without DR
          offer.price = offer.sellerDeposit = offer.buyerCancelPenalty = "0";
          let drParams = {
            disputeResolverId: "0",
            mutualizerAddress: ZeroAddress,
          };
          let agentId = "0"; // agent id is optional while creating an offer
          let offerFeeLimit = MaxUint256; // unlimited offer fee to not affect the tests

          // Check if domains are valid
          expect(offer.isValid()).is.true;
          expect(offerDates.isValid()).is.true;
          expect(offerDurations.isValid()).is.true;

          // Create the offer
          await offerHandler
            .connect(assistant)
            .createOffer(offer, offerDates, offerDurations, drParams, agentId, offerFeeLimit);

          // Bundle: Required constructor params
          bundleId = "1";
          offerIds = [offer.id]; // createBundle() does not accept empty offer ids.
          twinIds = [twin.id];

          // Create a new bundle
          bundle = new Bundle(bundleId, seller.id, offerIds, twinIds);
          await bundleHandler.connect(assistant).createBundle(bundle);

          // Attempt to Remove a twin, expecting revert
          await expect(twinHandler.connect(assistant).removeTwin(twin.id)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.BUNDLE_FOR_TWIN_EXISTS
          );
        });
      });
    });

    context("👉 getTwin()", async function () {
      beforeEach(async function () {
        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1);

        // Create a twin
        await twinHandler.connect(assistant).createTwin(twin);

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
        seller = mockSeller(await rando.getAddress(), await rando.getAddress(), ZeroAddress, await rando.getAddress());
        expect(seller.isValid()).is.true;

        // AuthToken
        emptyAuthToken = mockAuthToken();
        expect(emptyAuthToken.isValid()).is.true;
        await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);

        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(rando).approve(await twinHandler.getAddress(), 1);

        // Create a twin
        await twinHandler.connect(rando).createTwin(twin);

        // id of the current twin and increment nextTwinId
        id = nextTwinId++;
      });

      afterEach(async function () {
        // Reset the accountId iterator
        accountId.next(true);
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
        await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1);

        // Create another twin
        await twinHandler.connect(assistant).createTwin(twin);

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
