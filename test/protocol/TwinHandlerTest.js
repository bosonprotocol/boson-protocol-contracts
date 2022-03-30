const hre = require("hardhat");
const ethers = hre.ethers;
const { expect, assert } = require("chai");
const { gasLimit } = require("../../environments");

const Role = require("../../scripts/domain/Role");
const Twin = require("../../scripts/domain/Twin");
const Bundle = require("../../scripts/domain/Bundle");
const Offer = require("../../scripts/domain/Offer");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { getEvent } = require("../../scripts/util/test-events.js");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");

/**
 *  Test the Boson Twin Handler interface
 */
describe("IBosonTwinHandler", function () {
  // Common vars
  let InterfaceIds;
  let accounts, deployer, rando, seller;
  let erc165,
    protocolDiamond,
    accessController,
    twinHandler,
    twinStruct,
    bosonToken,
    foreign721,
    foreign1155,
    fallbackError,
    success,
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
    tokenAddress,
    key,
    value;
  let offerHandler, twinHandlerFacet_Factory;
  let bundleStruct;
  let bundle, bundleId, offerIds, twinIds, nextBundleId, invalidBundleId, bundleInstance;
  let offer, oneMonth, oneWeek, exists;
  let offerId,
    price,
    sellerDeposit,
    buyerCancelPenalty,
    quantityAvailable,
    validFromDate,
    validUntilDate,
    redeemableFromDate,
    fulfillmentPeriodDuration,
    voucherValidDuration,
    exchangeToken,
    metadataUri,
    metadataHash,
    voided;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();
  });

  beforeEach(async function () {
    // Make accounts available
    accounts = await ethers.getSigners();
    deployer = accounts[0];
    seller = accounts[1];
    rando = accounts[2];

    // Deploy the Protocol Diamond
    [protocolDiamond, , , accessController] = await deployProtocolDiamond();

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Cut the protocol handler facets into the Diamond
    await deployProtocolHandlerFacets(protocolDiamond, ["TwinHandlerFacet"]);
    await deployProtocolHandlerFacets(protocolDiamond, ["OfferHandlerFacet"]);

    // Add config Handler, so twin id starts at 1
    const protocolConfig = [
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0",
      "100",
    ];
    await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);

    // Cast Diamond to IERC165
    erc165 = await ethers.getContractAt("IERC165", protocolDiamond.address);

    // Cast Diamond to ITwinHandler
    twinHandler = await ethers.getContractAt("IBosonTwinHandler", protocolDiamond.address);

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
      // The first twin id
      nextTwinId = "1";
      invalidTwinId = "222";

      // Required constructor params
      id = sellerId = "1";
      supplyAvailable = "500";
      tokenId = "4096";
      supplyIds = ["1", "2"];
      tokenAddress = bosonToken.address;

      // Create a valid twin, then set fields in tests directly
      twin = new Twin(id, sellerId, supplyAvailable, supplyIds, tokenId, tokenAddress);
      expect(twin.isValid()).is.true;

      // How that twin looks as a returned struct
      twinStruct = twin.toStruct();
    });

    context("👉 createTwin()", async function () {
      it("should emit a TwinCreated event", async function () {
        twin.tokenAddress = bosonToken.address;

        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(seller).approve(twinHandler.address, 1);

        // Create a twin, testing for the event
        const tx = await twinHandler.connect(seller).createTwin(twin, seller.address);
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
        await bosonToken.connect(seller).approve(twinHandler.address, 1);

        // Create a twin, testing for the event
        const tx = await twinHandler.connect(seller).createTwin(twin, seller.address);
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
        await foreign721.connect(seller).mint(twin.tokenId);
        await foreign721.connect(seller).setApprovalForAll(twinHandler.address, true);

        // Create a twin, testing for the event
        const tx = await twinHandler.connect(seller).createTwin(twin, seller.address);
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
        await foreign1155.connect(seller).mint(twin.tokenId, twin.supplyIds[0]);
        await foreign1155.connect(seller).setApprovalForAll(twinHandler.address, true);

        // Create a twin, testing for the event
        const tx = await twinHandler.connect(seller).createTwin(twin, seller.address);
        const txReceipt = await tx.wait();

        const event = getEvent(txReceipt, twinHandler, "TwinCreated");

        twinInstance = Twin.fromStruct(event.twin);
        // Validate the instance
        expect(twinInstance.isValid()).to.be.true;

        assert.equal(event.twinId.toString(), nextTwinId, "Twin Id is incorrect");
        assert.equal(event.sellerId.toString(), twin.sellerId, "Seller Id is incorrect");
        assert.equal(Twin.fromStruct(event.twin).toString(), twin.toString(), "Twin struct is incorrect");
      });

      context("💔 Revert Reasons", async function () {
        it("should revert if protocol is not approved to transfer the ERC20 token", async function () {
          //ERC20 token address
          twin.tokenAddress = bosonToken.address;

          await expect(twinHandler.connect(seller).createTwin(twin, seller.address)).to.revertedWith(
            RevertReasons.NO_TRANSFER_APPROVED
          );
        });

        it("should revert if protocol is not approved to transfer the ERC721 token", async function () {
          //ERC721 token address
          twin.tokenAddress = foreign721.address;

          await expect(twinHandler.connect(seller).createTwin(twin, seller.address)).to.revertedWith(
            RevertReasons.NO_TRANSFER_APPROVED
          );
        });

        it("should revert if protocol is not approved to transfer the ERC1155 token", async function () {
          //ERC1155 token address
          twin.tokenAddress = foreign1155.address;

          await expect(twinHandler.connect(seller).createTwin(twin, seller.address)).to.revertedWith(
            RevertReasons.NO_TRANSFER_APPROVED
          );
        });

        context("Token address is unsupported", async function () {
          it("Token address is a zero address", async function () {
            twin.tokenAddress = ethers.constants.AddressZero;

            await expect(twinHandler.connect(seller).createTwin(twin, seller.address)).to.be.revertedWith(
              RevertReasons.UNSUPPORTED_TOKEN
            );
          });

          it("Token address is a contract address that does not support the isApprovedForAll", async function () {
            twin.tokenAddress = twinHandler.address;

            await expect(twinHandler.connect(seller).createTwin(twin, seller.address)).to.be.revertedWith(
              RevertReasons.UNSUPPORTED_TOKEN
            );
          });

          it("Token address is a contract that reverts from a fallback method", async function () {
            twin.tokenAddress = fallbackError.address;

            await expect(twinHandler.connect(seller).createTwin(twin, seller.address)).to.be.revertedWith(
              RevertReasons.UNSUPPORTED_TOKEN
            );
          });
        });
      });
    });

    context("👉 getTwin()", async function () {
      beforeEach(async function () {
        // Approving the twinHandler contract to transfer seller's tokens
        await bosonToken.connect(seller).approve(twinHandler.address, 1);

        // Create a twin
        await twinHandler.connect(seller).createTwin(twin, seller.address);

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

    context("🗄  Bundle", async function () {
      beforeEach(async function () {
        // Cast Diamond to IOfferHandler
        offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);

        // create 5 twins
        for (let i = 0; i < 5; i++) {
          // Required constructor params for Twin
          id = sellerId = "1";
          supplyAvailable = "1000";
          tokenId = "2048";
          supplyIds = ["3", "4"];
          tokenAddress = bosonToken.address;

          // Create a valid twin.
          twin = new Twin(id, sellerId, supplyAvailable, supplyIds, tokenId, tokenAddress);
          expect(twin.isValid()).is.true;

          // How that twin looks as a returned struct
          twinStruct = twin.toStruct();

          // Approving the twinHandler contract to transfer seller's tokens
          await bosonToken.connect(seller).approve(twinHandler.address, 1);

          // Create a twin.
          await twinHandler.connect(seller).createTwin(twin, seller.address);
        }

        // create 5 offers
        for (let i = 0; i < 5; i++) {
          // Some periods in milliseconds
          oneWeek = 604800 * 1000; //  7 days in milliseconds
          oneMonth = 2678400 * 1000; // 31 days in milliseconds

          // Required constructor params
          offerId = sellerId = "1"; // argument sent to contract for createOffer will be ignored
          price = ethers.utils.parseUnits("1.5", "ether").toString();
          sellerDeposit = price = ethers.utils.parseUnits("0.25", "ether").toString();
          buyerCancelPenalty = price = ethers.utils.parseUnits("0.05", "ether").toString();
          quantityAvailable = "1";
          validFromDate = ethers.BigNumber.from(Date.now()).toString(); // valid from now
          validUntilDate = ethers.BigNumber.from(Date.now() + oneMonth * 6).toString(); // until 6 months
          redeemableFromDate = ethers.BigNumber.from(Date.now() + oneWeek).toString(); // redeemable in 1 week
          fulfillmentPeriodDuration = oneMonth.toString(); // fulfillment period is one month
          voucherValidDuration = oneMonth.toString(); // offers valid for one month
          exchangeToken = ethers.constants.AddressZero.toString(); // Zero addy ~ chain base currency
          metadataHash = "QmYXc12ov6F2MZVZwPs5XeCBbf61cW3wKRk8h3D5NTYj4T";
          metadataUri = `https://ipfs.io/ipfs/${metadataHash}`;
          voided = false;

          // Create a valid offer.
          offer = new Offer(
            offerId,
            sellerId,
            price,
            sellerDeposit,
            buyerCancelPenalty,
            quantityAvailable,
            validFromDate,
            validUntilDate,
            redeemableFromDate,
            fulfillmentPeriodDuration,
            voucherValidDuration,
            exchangeToken,
            metadataUri,
            metadataHash,
            voided
          );

          expect(offer.isValid()).is.true;

          await offerHandler.connect(seller).createOffer(offer);
        }

        // The first bundle id
        bundleId = nextBundleId = "1";
        invalidBundleId = "666";

        // Required constructor params for Bundle
        offerIds = ["2", "3", "5"];
        twinIds = ["2", "3", "5"];

        bundle = new Bundle(bundleId, sellerId, offerIds, twinIds);

        expect(bundle.isValid()).is.true;

        // How that bundle looks as a returned struct
        bundleStruct = bundle.toStruct();

        // initialize twinHandler
        twinHandlerFacet_Factory = await ethers.getContractFactory("TwinHandlerFacet");
      });

      context("👉 createBundle()", async function () {
        it("should emit a BundleCreated event", async function () {
          const tx = await twinHandler.connect(seller).createBundle(bundle);
          const txReceipt = await tx.wait();

          const event = getEvent(txReceipt, twinHandlerFacet_Factory, "BundleCreated");

          bundleInstance = Bundle.fromStruct(event.bundle);
          // Validate the instance
          expect(bundleInstance.isValid()).to.be.true;

          assert.equal(event.bundleId.toString(), nextBundleId, "Bundle Id is incorrect");
          assert.equal(event.sellerId.toString(), bundle.sellerId, "Seller Id is incorrect");
          assert.equal(Bundle.fromStruct(event.bundle).toString(), bundle.toString(), "Bundle struct is incorrect");
        });

        it("should update state", async function () {
          // Create a a bundle
          await twinHandler.connect(seller).createBundle(bundle);

          // Get the offer as a struct
          [, bundleStruct] = await twinHandler.connect(rando).getBundle(bundleId);

          // Parse into entity
          let returnedBundle = Bundle.fromStruct(bundleStruct);

          // Returned values should match the input in createBundle
          for ([key, value] of Object.entries(bundle)) {
            expect(JSON.stringify(returnedBundle[key]) === JSON.stringify(value)).is.true;
          }
        });

        it("should ignore any provided id and assign the next available", async function () {
          bundle.id = "444";

          // Create a bundle, testing for the event
          const tx = await twinHandler.connect(seller).createBundle(bundle);
          const txReceipt = await tx.wait();

          const event = getEvent(txReceipt, twinHandlerFacet_Factory, "BundleCreated");

          bundleInstance = Bundle.fromStruct(event.bundle);
          // Validate the instance
          expect(bundleInstance.isValid()).to.be.true;

          assert.equal(event.bundleId.toString(), nextBundleId, "Bundle Id is incorrect");
          assert.equal(event.sellerId.toString(), bundle.sellerId, "Seller Id is incorrect");
          assert.equal(bundleInstance.toStruct().toString(), bundleStruct.toString(), "Bundle struct is incorrect");

          // wrong bundle id should not exist
          [exists] = await twinHandler.connect(rando).getBundle(bundle.id);
          expect(exists).to.be.false;

          // next bundle id should exist
          [exists] = await twinHandler.connect(rando).getBundle(nextBundleId);
          expect(exists).to.be.true;
        });

        it("should create bundle without any offer", async function () {
          bundle.offerIds = [];

          // Create a bundle, testing for the event
          await twinHandler.connect(seller).createBundle(bundle);

          let returnedBundle;
          // bundle should have no offers
          [, returnedBundle] = await twinHandler.connect(rando).getBundle(nextBundleId);
          assert.equal(returnedBundle.offerIds, bundle.offerIds.toString(), "Offer ids should be empty");
        });

        it("should create bundle without any twin", async function () {
          bundle.twinIds = [];

          // Create a bundle, testing for the event
          await twinHandler.connect(seller).createBundle(bundle);

          let returnedBundle;
          // bundle should have no twins
          [, returnedBundle] = await twinHandler.connect(rando).getBundle(nextBundleId);
          assert.equal(returnedBundle.twinIds, bundle.twinIds.toString(), "Twin ids should be empty");
        });

        xit("should ignore any provided seller and assign seller id of msg.sender", async function () {
          // TODO: add when accounthandler is finished

          bundle.seller = rando;

          // Create a bundle, testing for the event
          await expect(twinHandler.connect(seller).createBundle(bundle))
            .to.emit(twinHandler, "BundleCreated")
            .withArgs(nextBundleId, bundle.sellerId, bundleStruct);
        });
      });

      context("💔 Revert Reasons", async function () {
        xit("Caller is not the seller of all bundles", async function () {
          // TODO when account handler is implemented
        });

        it("Offer is already part of another bundle", async function () {
          // create first bundle
          await twinHandler.connect(seller).createBundle(bundle);

          // Set add offer that is already part of another bundle
          bundle.offerIds = ["1", "2", "4"];

          // Attempt to create an bundle, expecting revert
          await expect(twinHandler.connect(seller).createBundle(bundle)).to.revertedWith(
            RevertReasons.OFFER_MUST_BE_UNIQUE
          );
        });

        it("Offer is duplicated", async function () {
          // Try to add the same offer twice
          bundle.offerIds = ["1", "1", "4"];

          // Attempt to create an bundle, expecting revert
          await expect(twinHandler.connect(seller).createBundle(bundle)).to.revertedWith(
            RevertReasons.OFFER_MUST_BE_UNIQUE
          );
        });

        it("Twin is already part of another bundle", async function () {
          // create first bundle
          await twinHandler.connect(seller).createBundle(bundle);

          // Set offer that is NOT already part of another bundle
          bundle.offerIds = ["1"];
          // Set twin that is already part of another bundle
          bundle.twinIds = ["1", "2", "4"];

          // Attempt to create an bundle, expecting revert
          await expect(twinHandler.connect(seller).createBundle(bundle)).not.to.be.reverted;
        });

        it("Twin is duplicated", async function () {
          // Try to add the same twin twice
          bundle.twinIds = ["1", "1", "4"];

          // Attempt to create an bundle, expecting revert
          await expect(twinHandler.connect(seller).createBundle(bundle)).to.revertedWith(
            RevertReasons.TWIN_ALREADY_EXISTS_IN_SAME_BUNDLE
          );
        });
      });

      context("👉 getBundle()", async function () {
        beforeEach(async function () {
          // Create an bundle
          await twinHandler.connect(seller).createBundle(bundle);

          // id of the current bundle and increment nextBundleId
          id = nextBundleId++;
        });

        it("should return true for exists if bundle is found", async function () {
          // Get the exists flag
          [exists] = await twinHandler.connect(rando).getBundle(bundleId);

          // Validate
          expect(exists).to.be.true;
        });

        it("should return false for exists if bundle is not found", async function () {
          // Get the exists flag
          [exists] = await twinHandler.connect(rando).getBundle(invalidBundleId);

          // Validate
          expect(exists).to.be.false;
        });

        it("should return the details of the bundle as a struct if found", async function () {
          // Get the bundle as a struct
          [, bundleStruct] = await twinHandler.connect(rando).getBundle(bundleId);

          // Parse into entity
          bundle = Bundle.fromStruct(bundleStruct);

          // Validate
          expect(bundle.isValid()).to.be.true;
        });
      });
    });
  });
});
