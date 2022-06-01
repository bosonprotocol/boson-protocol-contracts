const hre = require("hardhat");
const ethers = hre.ethers;
const { expect, assert } = require("chai");
const { gasLimit } = require("../../environments");

const Exchange = require("../../scripts/domain/Exchange");
const ExchangeState = require("../../scripts/domain/ExchangeState");
const MetaTxExchangeDetails = require("../../scripts/domain/MetaTxExchangeDetails");
const MetaTxOfferDetails = require("../../scripts/domain/MetaTxOfferDetails");
const Offer = require("../../scripts/domain/Offer");
const Role = require("../../scripts/domain/Role");
const Seller = require("../../scripts/domain/Seller");
const Twin = require("../../scripts/domain/Twin");
const Voucher = require("../../scripts/domain/Voucher");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const {
  prepareDataSignatureParameters,
  calculateProtocolFee,
  setNextBlockTimestamp,
} = require("../../scripts/util/test-utils.js");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");

/**
 *  Test the Boson Meta transactions Handler interface
 */
describe("IBosonMetaTransactionsHandler", function () {
  // Common vars
  let InterfaceIds;
  let accounts, deployer, rando, operator, buyer, admin;
  let erc165,
    protocolDiamond,
    accessController,
    accountHandler,
    fundsHandler,
    exchangeHandler,
    offerHandler,
    twinHandler,
    bosonToken,
    support,
    result;
  let metaTransactionsHandler, nonce, functionSignature;
  let seller, sellerId, offerId, id, buyerId;
  let block, blockNumber, clients;
  let bosonVoucher;
  let validOfferDetails,
    offerType,
    metaTransactionType,
    metaTxExchangeType,
    customTransactionType,
    validExchangeDetails,
    exchangeType,
    message;
  let offer,
    price,
    sellerDeposit,
    protocolFee,
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
    voided,
    oneMonth,
    oneWeek;
  let protocolFeePrecentage;
  let voucher, committedDate, redeemedDate, expired;
  let exchange, finalizedDate, state;
  let twin, supplyAvailable, tokenId, supplyIds, tokenAddress, success;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();
  });

  beforeEach(async function () {
    // Make accounts available
    accounts = await ethers.getSigners();
    deployer = accounts[0];
    operator = accounts[1];
    buyer = accounts[3];
    rando = accounts[4];
    admin = accounts[5];

    // Deploy the Protocol Diamond
    [protocolDiamond, , , accessController] = await deployProtocolDiamond();

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Grant PROTOCOL role to ProtocolDiamond address and renounces admin
    await accessController.grantRole(Role.PROTOCOL, protocolDiamond.address);

    // Cut the protocol handler facets into the Diamond
    await deployProtocolHandlerFacets(protocolDiamond, [
      "AccountHandlerFacet",
      "FundsHandlerFacet",
      "ExchangeHandlerFacet",
      "OfferHandlerFacet",
      "TwinHandlerFacet",
      "MetaTransactionsHandlerFacet",
    ]);

    // Deploy the Protocol client implementation/proxy pairs (currently just the Boson Voucher)
    const protocolClientArgs = [accessController.address, protocolDiamond.address];
    [, , clients] = await deployProtocolClients(protocolClientArgs, gasLimit);
    [bosonVoucher] = clients;

    // set protocolFeePrecentage
    protocolFeePrecentage = "200"; // 2 %

    // Add config Handler
    const protocolConfig = [
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      bosonVoucher.address,
      protocolFeePrecentage,
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

    // Cast Diamond to IBosonFundsHandler
    fundsHandler = await ethers.getContractAt("IBosonFundsHandler", protocolDiamond.address);

    // Cast Diamond to IBosonOfferHandler
    offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);

    // Cast Diamond to IBosonExchangeHandler
    exchangeHandler = await ethers.getContractAt("IBosonExchangeHandler", protocolDiamond.address);

    // Cast Diamond to ITwinHandler
    twinHandler = await ethers.getContractAt("IBosonTwinHandler", protocolDiamond.address);

    // Cast Diamond to IBosonMetaTransactionsHandler
    metaTransactionsHandler = await ethers.getContractAt("IBosonMetaTransactionsHandler", protocolDiamond.address);

    // Deploy the mock tokens
    [bosonToken] = await deployMockTokens(gasLimit);
  });

  // Interface support (ERC-156 provided by ProtocolDiamond, others by deployed facets)
  context("📋 Interfaces", async function () {
    context("👉 supportsInterface()", async function () {
      it("should indicate support for IBosonMetaTransactionsHandler interface", async function () {
        // Current interfaceId for IBosonMetaTransactionsHandler
        support = await erc165.supportsInterface(InterfaceIds.IBosonMetaTransactionsHandler);

        // Test
        await expect(support, "IBosonMetaTransactionsHandler interface not supported").is.true;
      });
    });
  });

  // All supported methods
  context("📋 Meta Transactions Handler Methods", async function () {
    context("👉 isUsedNonce()", async function () {
      it("should return false if nonce is not used", async function () {
        // We expect that the nonce is Not used before.
        let expectedResult = false;

        // Set a random nonce
        nonce = parseInt(ethers.utils.randomBytes(8));

        // Check if nonce is used before
        result = await metaTransactionsHandler.connect(operator).isUsedNonce(nonce);

        // Verify the expectation
        assert.equal(result, expectedResult, "Nonce is used");
      });

      it("should be true after executing a meta transaction with nonce", async function () {
        // We expect that the nonce is Not used before.
        let expectedResult = false;
        // Set a random nonce
        nonce = parseInt(ethers.utils.randomBytes(8));
        result = await metaTransactionsHandler.connect(operator).isUsedNonce(nonce);

        // Verify the expectation
        assert.equal(result, expectedResult, "Nonce is used");

        // Create a valid seller for meta transaction
        id = "1";
        seller = new Seller(id, operator.address, operator.address, operator.address, operator.address, true);
        expect(seller.isValid()).is.true;

        // Prepare the function signature for the facet function.
        functionSignature = accountHandler.interface.encodeFunctionData("createSeller", [seller]);

        // Set the message Type
        metaTransactionType = [
          { name: "nonce", type: "uint256" },
          { name: "from", type: "address" },
          { name: "contractAddress", type: "address" },
          { name: "functionName", type: "string" },
          { name: "functionSignature", type: "bytes" },
        ];

        let customTransactionType = {
          MetaTransaction: metaTransactionType,
        };

        // Prepare the message
        let message = {};
        message.nonce = parseInt(nonce);
        message.from = operator.address;
        message.contractAddress = accountHandler.address;
        message.functionName = "createSeller((uint256,address,address,address,address,bool))";
        message.functionSignature = functionSignature;

        // Collect the signature components
        let { r, s, v } = await prepareDataSignatureParameters(
          operator,
          customTransactionType,
          "MetaTransaction",
          message,
          metaTransactionsHandler.address
        );

        // Send as meta transaction
        await metaTransactionsHandler.executeMetaTransaction(
          operator.address,
          message.functionName,
          functionSignature,
          nonce,
          r,
          s,
          v
        );

        // We expect that the nonce is used now. Hence expecting to return true.
        expectedResult = true;
        result = await metaTransactionsHandler.connect(operator).isUsedNonce(nonce);
        assert.equal(result, expectedResult, "Nonce is not used");

        //Verify that another nonce value is unused.
        expectedResult = false;
        nonce = nonce + 1;
        result = await metaTransactionsHandler.connect(rando).isUsedNonce(nonce);
        assert.equal(result, expectedResult, "Nonce is used");
      });
    });

    context("👉 executeMetaTransaction()", async function () {
      beforeEach(async function () {
        // Set a random nonce
        nonce = parseInt(ethers.utils.randomBytes(8));

        // Set the message Type
        metaTransactionType = [
          { name: "nonce", type: "uint256" },
          { name: "from", type: "address" },
          { name: "contractAddress", type: "address" },
          { name: "functionName", type: "string" },
          { name: "functionSignature", type: "bytes" },
        ];

        // Create a valid seller for meta transaction
        id = "1";
        seller = new Seller(id, operator.address, operator.address, operator.address, operator.address, true);
        expect(seller.isValid()).is.true;

        customTransactionType = {
          MetaTransaction: metaTransactionType,
        };

        // Prepare the message
        message = {};
        message.nonce = parseInt(nonce);
      });

      it("Should emit MetaTransactionExecuted event", async () => {
        // Prepare the function signature for the facet function.
        functionSignature = accountHandler.interface.encodeFunctionData("createSeller", [seller]);

        // Prepare the message
        message.from = operator.address;
        message.contractAddress = accountHandler.address;
        message.functionName = "createSeller((uint256,address,address,address,address,bool))";
        message.functionSignature = functionSignature;

        // Collect the signature components
        let { r, s, v } = await prepareDataSignatureParameters(
          operator,
          customTransactionType,
          "MetaTransaction",
          message,
          metaTransactionsHandler.address
        );

        // send a meta transaction, check for event
        await expect(
          metaTransactionsHandler
            .connect(deployer)
            .executeMetaTransaction(operator.address, message.functionName, functionSignature, nonce, r, s, v)
        )
          .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
          .withArgs(operator.address, deployer.address, message.functionName, nonce);

        // Verify that nonce is used. Expect true.
        let expectedResult = true;
        result = await metaTransactionsHandler.connect(operator).isUsedNonce(nonce);
        assert.equal(result, expectedResult, "Nonce is unused");
      });

      it("does not modify revert reasons", async function () {
        // Set seller as inactive
        seller.active = false;

        // Prepare the function signature for the facet function.
        functionSignature = accountHandler.interface.encodeFunctionData("createSeller", [seller]);

        // Prepare the message
        message.from = operator.address;
        message.contractAddress = accountHandler.address;
        message.functionName = "createSeller((uint256,address,address,address,address,bool))";
        message.functionSignature = functionSignature;

        // Collect the signature components
        let { r, s, v } = await prepareDataSignatureParameters(
          operator,
          customTransactionType,
          "MetaTransaction",
          message,
          metaTransactionsHandler.address
        );

        // send a meta transaction, expecting revert
        await expect(
          metaTransactionsHandler.executeMetaTransaction(
            operator.address,
            message.functionName,
            functionSignature,
            nonce,
            r,
            s,
            v
          )
        ).to.revertedWith(RevertReasons.MUST_BE_ACTIVE);
      });

      context("👉 msg.sender is replaced with msgSender()", async function () {
        context("TwinHandler", async function () {
          beforeEach(async function () {
            // Create the seller
            await accountHandler.connect(admin).createSeller(seller);

            // Required constructor params
            id = sellerId = "1";
            supplyAvailable = "500";
            tokenId = "4096";
            supplyIds = ["1", "2"];
            tokenAddress = bosonToken.address;

            // Create a valid twin, then set fields in tests directly
            twin = new Twin(id, sellerId, supplyAvailable, supplyIds, tokenId, tokenAddress);
            expect(twin.isValid()).is.true;

            // Approving the twinHandler contract to transfer seller's tokens
            await bosonToken.connect(operator).approve(twinHandler.address, 1);

            // Create a twin
            await twinHandler.connect(operator).createTwin(twin);

            // Prepare the message
            message.from = operator.address;
            message.contractAddress = twinHandler.address;
          });

          it("removeTwin() can remove a twin", async function () {
            // Expect twin to be found.
            [success] = await twinHandler.connect(rando).getTwin(twin.id);
            expect(success).to.be.true;

            // Prepare the function signature
            functionSignature = twinHandler.interface.encodeFunctionData("removeTwin", [twin.id]);

            // Prepare the message
            message.functionName = "removeTwin(uint256)";
            message.functionSignature = functionSignature;

            // Collect the signature components
            let { r, s, v } = await prepareDataSignatureParameters(
              operator,
              customTransactionType,
              "MetaTransaction",
              message,
              metaTransactionsHandler.address
            );

            // Remove the twin. Send as meta transaction.
            await metaTransactionsHandler.executeMetaTransaction(
              operator.address,
              message.functionName,
              functionSignature,
              nonce,
              r,
              s,
              v
            );

            // Expect twin to be not found.
            [success] = await twinHandler.connect(rando).getTwin(twin.id);
            expect(success).to.be.false;
          });
        });
      });

      context("💔 Revert Reasons", async function () {
        it("Should fail when try to call executeMetaTransaction method itself", async function () {
          // Function signature for executeMetaTransaction function.
          functionSignature = metaTransactionsHandler.interface.encodeFunctionData("executeMetaTransaction", [
            operator.address,
            "executeMetaTransaction",
            ethers.constants.HashZero, // hash of zero
            nonce,
            ethers.utils.randomBytes(32), // random bytes32
            ethers.utils.randomBytes(32), // random bytes32
            parseInt(ethers.utils.randomBytes(8)), // random uint8
          ]);

          // Prepare the message
          message.from = operator.address;
          message.contractAddress = metaTransactionsHandler.address;
          message.functionName = "executeMetaTransaction(address,string,bytes,uint256,bytes32,bytes32,uint8)";
          message.functionSignature = functionSignature;

          // Collect the signature components
          let { r, s, v } = await prepareDataSignatureParameters(
            operator,
            customTransactionType,
            "MetaTransaction",
            message,
            metaTransactionsHandler.address
          );

          // send a meta transaction, expecting revert
          await expect(
            metaTransactionsHandler.executeMetaTransaction(
              operator.address,
              message.functionName,
              functionSignature,
              nonce,
              r,
              s,
              v
            )
          ).to.revertedWith(RevertReasons.INVALID_FUNCTION_SIGNATURE);
        });

        it("Should fail when function name is incorrect", async function () {
          let incorrectFunctionName = "createSeller"; // there are no function argument types here.

          // Prepare the function signature for the facet function.
          functionSignature = accountHandler.interface.encodeFunctionData("createSeller", [seller]);

          // Prepare the message
          message.from = operator.address;
          message.contractAddress = accountHandler.address;
          message.functionName = incorrectFunctionName;
          message.functionSignature = functionSignature;

          // Collect the signature components
          let { r, s, v } = await prepareDataSignatureParameters(
            operator,
            customTransactionType,
            "MetaTransaction",
            message,
            metaTransactionsHandler.address
          );

          // Execute meta transaction, expecting revert.
          await expect(
            metaTransactionsHandler.executeMetaTransaction(
              operator.address,
              message.functionName,
              functionSignature,
              nonce,
              r,
              s,
              v
            )
          ).to.revertedWith(RevertReasons.INVALID_FUNCTION_NAME);
        });

        it("Should fail when replay transaction", async function () {
          // Prepare the function signature for the facet function.
          functionSignature = accountHandler.interface.encodeFunctionData("createSeller", [seller]);

          // Prepare the message
          message.from = operator.address;
          message.contractAddress = accountHandler.address;
          message.functionName = "createSeller((uint256,address,address,address,address,bool))";
          message.functionSignature = functionSignature;

          // Collect the signature components
          let { r, s, v } = await prepareDataSignatureParameters(
            operator,
            customTransactionType,
            "MetaTransaction",
            message,
            metaTransactionsHandler.address
          );

          // Execute the meta transaction.
          await metaTransactionsHandler.executeMetaTransaction(
            operator.address,
            message.functionName,
            functionSignature,
            nonce,
            r,
            s,
            v
          );

          // Execute meta transaction again with the same nonce, expecting revert.
          await expect(
            metaTransactionsHandler.executeMetaTransaction(
              operator.address,
              message.functionName,
              functionSignature,
              nonce,
              r,
              s,
              v
            )
          ).to.revertedWith(RevertReasons.NONCE_USED_ALREADY);
        });

        it("Should fail when Signer and Signature do not match", async function () {
          // Prepare the function signature for the facet function.
          functionSignature = accountHandler.interface.encodeFunctionData("createSeller", [seller]);

          // Prepare the message
          message.from = rando.address;
          message.contractAddress = accountHandler.address;
          message.functionName = "createSeller((uint256,address,address,address,address,bool))";
          message.functionSignature = functionSignature;

          // Collect the signature components
          let { r, s, v } = await prepareDataSignatureParameters(
            rando, // Different user, not operator.
            customTransactionType,
            "MetaTransaction",
            message,
            metaTransactionsHandler.address
          );

          // Execute meta transaction, expecting revert.
          await expect(
            metaTransactionsHandler.executeMetaTransaction(
              operator.address,
              message.functionName,
              functionSignature,
              nonce,
              r,
              s,
              v
            )
          ).to.revertedWith(RevertReasons.SIGNER_AND_SIGNATURE_DO_NOT_MATCH);
        });
      });
    });

    context("👉 executeMetaTxCommitToOffer()", async function () {
      beforeEach(async function () {
        // Set a random nonce
        nonce = parseInt(ethers.utils.randomBytes(8));

        // Initial ids for all the things
        id = offerId = sellerId = "1";

        // Create an offer to commit to
        oneWeek = 604800 * 1000; //  7 days in milliseconds
        oneMonth = 2678400 * 1000; // 31 days in milliseconds

        // Get the current block info
        blockNumber = await ethers.provider.getBlockNumber();
        block = await ethers.provider.getBlock(blockNumber);

        // Required constructor params
        price = ethers.utils.parseUnits("1.5", "ether").toString();
        sellerDeposit = ethers.utils.parseUnits("0.25", "ether").toString();
        protocolFee = calculateProtocolFee(sellerDeposit, price, protocolFeePrecentage);
        buyerCancelPenalty = ethers.utils.parseUnits("0.05", "ether").toString();
        quantityAvailable = "1";
        validFromDate = ethers.BigNumber.from(block.timestamp).toString(); // valid from now
        validUntilDate = ethers.BigNumber.from(block.timestamp)
          .add(oneMonth * 6)
          .toString(); // until 6 months
        redeemableFromDate = ethers.BigNumber.from(block.timestamp).add(oneWeek).toString(); // redeemable in 1 week
        fulfillmentPeriodDuration = oneMonth.toString(); // fulfillment period is one month
        voucherValidDuration = oneMonth.toString(); // offers valid for one month
        exchangeToken = ethers.constants.AddressZero.toString(); // Zero addy ~ chain base currency
        metadataHash = "QmYXc12ov6F2MZVZwPs5XeCBbf61cW3wKRk8h3D5NTYj4T";
        metadataUri = `https://ipfs.io/ipfs/${metadataHash}`;
        voided = false;

        // Create a valid seller
        seller = new Seller(id, operator.address, operator.address, operator.address, operator.address, true);
        expect(seller.isValid()).is.true;
        await accountHandler.connect(operator).createSeller(seller);

        // Create a valid offer entity
        offer = new Offer(
          offerId,
          sellerId,
          price,
          sellerDeposit,
          protocolFee,
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

        // Create the offer
        await offerHandler.connect(operator).createOffer(offer);

        // Set the offer Type
        offerType = [
          { name: "buyer", type: "address" },
          { name: "offerId", type: "uint256" },
        ];

        // Set the message Type
        metaTransactionType = [
          { name: "nonce", type: "uint256" },
          { name: "from", type: "address" },
          { name: "contractAddress", type: "address" },
          { name: "functionName", type: "string" },
          { name: "offerDetails", type: "MetaTxOfferDetails" },
        ];

        customTransactionType = {
          MetaTxCommitToOffer: metaTransactionType,
          MetaTxOfferDetails: offerType,
        };

        // prepare the MetaTxOfferDetails struct
        validOfferDetails = new MetaTxOfferDetails(buyer.address, offer.id);
        expect(validOfferDetails.isValid()).is.true;

        // Prepare the message
        message = {};
        message.nonce = parseInt(nonce);
        message.from = buyer.address;
        message.contractAddress = exchangeHandler.address;
        message.functionName = "commitToOffer(address,uint256)";
        message.offerDetails = validOfferDetails;

        // Deposit native currency to the same seller id
        await fundsHandler
          .connect(rando)
          .depositFunds(seller.id, ethers.constants.AddressZero, sellerDeposit, { value: sellerDeposit });
      });

      it("Should emit MetaTransactionExecuted event", async () => {
        // Collect the signature components
        let { r, s, v } = await prepareDataSignatureParameters(
          buyer,
          customTransactionType,
          "MetaTxCommitToOffer",
          message,
          metaTransactionsHandler.address
        );

        // send a meta transaction, check for event
        await expect(
          metaTransactionsHandler.executeMetaTxCommitToOffer(buyer.address, validOfferDetails, nonce, r, s, v, {
            value: price,
          })
        )
          .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
          .withArgs(buyer.address, deployer.address, message.functionName, nonce);

        // Verify that nonce is used. Expect true.
        let expectedResult = true;
        result = await metaTransactionsHandler.connect(buyer).isUsedNonce(nonce);
        assert.equal(result, expectedResult, "Nonce is unused");
      });

      it("does not modify revert reasons", async function () {
        // An invalid offer id
        offerId = "666";

        // prepare the MetaTxOfferDetails struct
        validOfferDetails = new MetaTxOfferDetails(buyer.address, offerId);
        expect(validOfferDetails.isValid()).is.true;

        // Prepare the message
        message.offerDetails = validOfferDetails;

        // Collect the signature components
        let { r, s, v } = await prepareDataSignatureParameters(
          buyer,
          customTransactionType,
          "MetaTxCommitToOffer",
          message,
          metaTransactionsHandler.address
        );

        // Execute meta transaction, expecting revert.
        await expect(
          metaTransactionsHandler.executeMetaTxCommitToOffer(buyer.address, validOfferDetails, nonce, r, s, v, {
            value: price,
          })
        ).to.revertedWith(RevertReasons.NO_SUCH_OFFER);
      });

      context("💔 Revert Reasons", async function () {
        it("Should fail when replay transaction", async function () {
          // Collect the signature components
          let { r, s, v } = await prepareDataSignatureParameters(
            buyer,
            customTransactionType,
            "MetaTxCommitToOffer",
            message,
            metaTransactionsHandler.address
          );

          // Execute the meta transaction.
          await metaTransactionsHandler.executeMetaTxCommitToOffer(buyer.address, validOfferDetails, nonce, r, s, v, {
            value: price,
          });

          // Execute meta transaction again with the same nonce, expecting revert.
          await expect(
            metaTransactionsHandler.executeMetaTxCommitToOffer(buyer.address, validOfferDetails, nonce, r, s, v, {
              value: price,
            })
          ).to.revertedWith(RevertReasons.NONCE_USED_ALREADY);
        });

        it("Should fail when Signer and Signature do not match", async function () {
          // Prepare the message
          message.from = rando.address;

          // Collect the signature components
          let { r, s, v } = await prepareDataSignatureParameters(
            rando, // Different user, not buyer.
            customTransactionType,
            "MetaTxCommitToOffer",
            message,
            metaTransactionsHandler.address
          );

          // Execute meta transaction, expecting revert.
          await expect(
            metaTransactionsHandler.executeMetaTxCommitToOffer(buyer.address, validOfferDetails, nonce, r, s, v, {
              value: price,
            })
          ).to.revertedWith(RevertReasons.SIGNER_AND_SIGNATURE_DO_NOT_MATCH);
        });
      });
    });

    context("👉 Exchange related ", async function () {
      beforeEach(async function () {
        // Set a random nonce
        nonce = parseInt(ethers.utils.randomBytes(8));

        // Initial ids for all the things
        id = offerId = sellerId = "1";
        buyerId = "2"; // created after seller

        // Create an offer to commit to
        oneWeek = 604800 * 1000; //  7 days in milliseconds
        oneMonth = 2678400 * 1000; // 31 days in milliseconds

        // Get the current block info
        blockNumber = await ethers.provider.getBlockNumber();
        block = await ethers.provider.getBlock(blockNumber);

        // Required constructor params
        price = ethers.utils.parseUnits("1.5", "ether").toString();
        sellerDeposit = ethers.utils.parseUnits("0.25", "ether").toString();
        protocolFee = calculateProtocolFee(sellerDeposit, price, protocolFeePrecentage);
        buyerCancelPenalty = ethers.utils.parseUnits("0.05", "ether").toString();
        quantityAvailable = "1";
        validFromDate = ethers.BigNumber.from(block.timestamp).toString(); // valid from now
        validUntilDate = ethers.BigNumber.from(block.timestamp)
          .add(oneMonth * 6)
          .toString(); // until 6 months
        redeemableFromDate = ethers.BigNumber.from(block.timestamp).add(oneWeek).toString(); // redeemable in 1 week
        fulfillmentPeriodDuration = oneMonth.toString(); // fulfillment period is one month
        voucherValidDuration = oneMonth.toString(); // offers valid for one month
        exchangeToken = ethers.constants.AddressZero.toString(); // Zero addy ~ chain base currency
        metadataHash = "QmYXc12ov6F2MZVZwPs5XeCBbf61cW3wKRk8h3D5NTYj4T";
        metadataUri = `https://ipfs.io/ipfs/${metadataHash}`;
        voided = false;

        // Create a valid seller
        seller = new Seller(id, operator.address, operator.address, operator.address, operator.address, true);
        expect(seller.isValid()).is.true;
        await accountHandler.connect(operator).createSeller(seller);

        // Create a valid offer entity
        offer = new Offer(
          offerId,
          sellerId,
          price,
          sellerDeposit,
          protocolFee,
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

        // Create the offer
        await offerHandler.connect(operator).createOffer(offer);

        // Required voucher constructor params
        committedDate = "0";
        validUntilDate = "0";
        redeemedDate = "0";
        expired = false;
        voucher = new Voucher(committedDate, validUntilDate, redeemedDate, expired);

        // Required exchange constructor params
        finalizedDate = "0";
        state = ExchangeState.Committed;
        exchange = new Exchange(id, offerId, buyerId, finalizedDate, voucher, state);

        // Set the exchange Type
        exchangeType = [{ name: "exchangeId", type: "uint256" }];

        // Set the message Type
        metaTxExchangeType = [
          { name: "nonce", type: "uint256" },
          { name: "from", type: "address" },
          { name: "contractAddress", type: "address" },
          { name: "functionName", type: "string" },
          { name: "exchangeDetails", type: "MetaTxExchangeDetails" },
        ];

        customTransactionType = {
          MetaTxExchange: metaTxExchangeType,
          MetaTxExchangeDetails: exchangeType,
        };

        // Prepare the message
        message = {};
        message.nonce = parseInt(nonce);
        message.contractAddress = exchangeHandler.address;

        // prepare the MetaTxExchangeDetails struct
        validExchangeDetails = new MetaTxExchangeDetails(exchange.id);
        expect(validExchangeDetails.isValid()).is.true;

        // Deposit native currency to the same seller id
        await fundsHandler
          .connect(rando)
          .depositFunds(seller.id, ethers.constants.AddressZero, sellerDeposit, { value: sellerDeposit });

        // Commit to offer
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });
      });

      context("👉 executeMetaTxCancelVoucher()", async function () {
        beforeEach(async function () {
          // Prepare the message
          message.functionName = "cancelVoucher(uint256)";
          message.exchangeDetails = validExchangeDetails;
          message.from = buyer.address;
        });

        it("Should emit MetaTransactionExecuted event", async () => {
          // Collect the signature components
          let { r, s, v } = await prepareDataSignatureParameters(
            buyer,
            customTransactionType,
            "MetaTxExchange",
            message,
            metaTransactionsHandler.address
          );

          // send a meta transaction, check for event
          await expect(
            metaTransactionsHandler.executeMetaTxCancelVoucher(buyer.address, validExchangeDetails, nonce, r, s, v)
          )
            .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
            .withArgs(buyer.address, deployer.address, message.functionName, nonce);

          // Verify that nonce is used. Expect true.
          let expectedResult = true;
          result = await metaTransactionsHandler.connect(buyer).isUsedNonce(nonce);
          assert.equal(result, expectedResult, "Nonce is unused");
        });

        it("does not modify revert reasons", async function () {
          // An invalid exchange id
          id = "666";

          // prepare the MetaTxExchangeDetails struct
          validExchangeDetails = new MetaTxExchangeDetails(id);
          expect(validExchangeDetails.isValid()).is.true;

          // Prepare the message
          message.exchangeDetails = validExchangeDetails;

          // Collect the signature components
          let { r, s, v } = await prepareDataSignatureParameters(
            buyer,
            customTransactionType,
            "MetaTxExchange",
            message,
            metaTransactionsHandler.address
          );

          // Execute meta transaction, expecting revert.
          await expect(
            metaTransactionsHandler.executeMetaTxCancelVoucher(buyer.address, validExchangeDetails, nonce, r, s, v)
          ).to.revertedWith(RevertReasons.NO_SUCH_EXCHANGE);
        });

        context("💔 Revert Reasons", async function () {
          it("Should fail when replay transaction", async function () {
            // Collect the signature components
            let { r, s, v } = await prepareDataSignatureParameters(
              buyer,
              customTransactionType,
              "MetaTxExchange",
              message,
              metaTransactionsHandler.address
            );

            // Execute the meta transaction.
            await metaTransactionsHandler.executeMetaTxCancelVoucher(
              buyer.address,
              validExchangeDetails,
              nonce,
              r,
              s,
              v
            );

            // Execute meta transaction again with the same nonce, expecting revert.
            await expect(
              metaTransactionsHandler.executeMetaTxCancelVoucher(buyer.address, validExchangeDetails, nonce, r, s, v)
            ).to.revertedWith(RevertReasons.NONCE_USED_ALREADY);
          });

          it("Should fail when Signer and Signature do not match", async function () {
            // Prepare the message
            message.from = rando.address;

            // Collect the signature components
            let { r, s, v } = await prepareDataSignatureParameters(
              rando, // Different user, not buyer.
              customTransactionType,
              "MetaTxExchange",
              message,
              metaTransactionsHandler.address
            );

            // Execute meta transaction, expecting revert.
            await expect(
              metaTransactionsHandler.executeMetaTxCancelVoucher(buyer.address, validExchangeDetails, nonce, r, s, v)
            ).to.revertedWith(RevertReasons.SIGNER_AND_SIGNATURE_DO_NOT_MATCH);
          });
        });
      });

      context("👉 executeMetaTxRedeemVoucher()", async function () {
        beforeEach(async function () {
          // Prepare the message
          message.functionName = "redeemVoucher(uint256)";
          message.exchangeDetails = validExchangeDetails;
          message.from = buyer.address;

          // Set time forward to the offer's redeemableFromDate
          await setNextBlockTimestamp(Number(redeemableFromDate));
        });

        it("Should emit MetaTransactionExecuted event", async () => {
          // Collect the signature components
          let { r, s, v } = await prepareDataSignatureParameters(
            buyer,
            customTransactionType,
            "MetaTxExchange",
            message,
            metaTransactionsHandler.address
          );

          // send a meta transaction, check for event
          await expect(
            metaTransactionsHandler.executeMetaTxRedeemVoucher(buyer.address, validExchangeDetails, nonce, r, s, v)
          )
            .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
            .withArgs(buyer.address, deployer.address, message.functionName, nonce);

          // Verify that nonce is used. Expect true.
          let expectedResult = true;
          result = await metaTransactionsHandler.connect(buyer).isUsedNonce(nonce);
          assert.equal(result, expectedResult, "Nonce is unused");
        });

        it("does not modify revert reasons", async function () {
          // An invalid exchange id
          id = "666";

          // prepare the MetaTxExchangeDetails struct
          validExchangeDetails = new MetaTxExchangeDetails(id);
          expect(validExchangeDetails.isValid()).is.true;

          // Prepare the message
          message.exchangeDetails = validExchangeDetails;

          // Collect the signature components
          let { r, s, v } = await prepareDataSignatureParameters(
            buyer,
            customTransactionType,
            "MetaTxExchange",
            message,
            metaTransactionsHandler.address
          );

          // Execute meta transaction, expecting revert.
          await expect(
            metaTransactionsHandler.executeMetaTxRedeemVoucher(buyer.address, validExchangeDetails, nonce, r, s, v)
          ).to.revertedWith(RevertReasons.NO_SUCH_EXCHANGE);
        });

        context("💔 Revert Reasons", async function () {
          it("Should fail when replay transaction", async function () {
            // Collect the signature components
            let { r, s, v } = await prepareDataSignatureParameters(
              buyer,
              customTransactionType,
              "MetaTxExchange",
              message,
              metaTransactionsHandler.address
            );

            // Execute the meta transaction.
            await metaTransactionsHandler.executeMetaTxRedeemVoucher(
              buyer.address,
              validExchangeDetails,
              nonce,
              r,
              s,
              v
            );

            // Execute meta transaction again with the same nonce, expecting revert.
            await expect(
              metaTransactionsHandler.executeMetaTxRedeemVoucher(buyer.address, validExchangeDetails, nonce, r, s, v)
            ).to.revertedWith(RevertReasons.NONCE_USED_ALREADY);
          });

          it("Should fail when Signer and Signature do not match", async function () {
            // Prepare the message
            message.from = rando.address;

            // Collect the signature components
            let { r, s, v } = await prepareDataSignatureParameters(
              rando, // Different user, not buyer.
              customTransactionType,
              "MetaTxExchange",
              message,
              metaTransactionsHandler.address
            );

            // Execute meta transaction, expecting revert.
            await expect(
              metaTransactionsHandler.executeMetaTxRedeemVoucher(buyer.address, validExchangeDetails, nonce, r, s, v)
            ).to.revertedWith(RevertReasons.SIGNER_AND_SIGNATURE_DO_NOT_MATCH);
          });
        });
      });

      context("👉 executeMetaTxCompleteExchange()", async function () {
        beforeEach(async function () {
          // Prepare the message
          message.functionName = "completeExchange(uint256)";
          message.exchangeDetails = validExchangeDetails;
          message.from = buyer.address;

          // Set time forward to the offer's redeemableFromDate
          await setNextBlockTimestamp(Number(redeemableFromDate));

          // Redeem the voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);
        });

        it("Should emit MetaTransactionExecuted event", async () => {
          // Collect the signature components
          let { r, s, v } = await prepareDataSignatureParameters(
            buyer,
            customTransactionType,
            "MetaTxExchange",
            message,
            metaTransactionsHandler.address
          );

          // send a meta transaction, check for event
          await expect(
            metaTransactionsHandler.executeMetaTxCompleteExchange(buyer.address, validExchangeDetails, nonce, r, s, v)
          )
            .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
            .withArgs(buyer.address, deployer.address, message.functionName, nonce);

          // Get the exchange state
          let response;
          [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);
          // It should match ExchangeState.Completed
          assert.equal(response, ExchangeState.Completed, "Exchange state is incorrect");

          // Verify that nonce is used. Expect true.
          let expectedResult = true;
          result = await metaTransactionsHandler.connect(buyer).isUsedNonce(nonce);
          assert.equal(result, expectedResult, "Nonce is unused");
        });

        it("does not modify revert reasons", async function () {
          // An invalid exchange id
          id = "666";

          // prepare the MetaTxExchangeDetails struct
          validExchangeDetails = new MetaTxExchangeDetails(id);
          expect(validExchangeDetails.isValid()).is.true;

          // Prepare the message
          message.exchangeDetails = validExchangeDetails;

          // Collect the signature components
          let { r, s, v } = await prepareDataSignatureParameters(
            buyer,
            customTransactionType,
            "MetaTxExchange",
            message,
            metaTransactionsHandler.address
          );

          // Execute meta transaction, expecting revert.
          await expect(
            metaTransactionsHandler.executeMetaTxCompleteExchange(buyer.address, validExchangeDetails, nonce, r, s, v)
          ).to.revertedWith(RevertReasons.NO_SUCH_EXCHANGE);
        });

        context("💔 Revert Reasons", async function () {
          it("Should fail when replay transaction", async function () {
            // Collect the signature components
            let { r, s, v } = await prepareDataSignatureParameters(
              buyer,
              customTransactionType,
              "MetaTxExchange",
              message,
              metaTransactionsHandler.address
            );

            // Execute the meta transaction.
            await metaTransactionsHandler.executeMetaTxCompleteExchange(
              buyer.address,
              validExchangeDetails,
              nonce,
              r,
              s,
              v
            );

            // Execute meta transaction again with the same nonce, expecting revert.
            await expect(
              metaTransactionsHandler.executeMetaTxCompleteExchange(buyer.address, validExchangeDetails, nonce, r, s, v)
            ).to.revertedWith(RevertReasons.NONCE_USED_ALREADY);
          });

          it("Should fail when Signer and Signature do not match", async function () {
            // Prepare the message
            message.from = rando.address;

            // Collect the signature components
            let { r, s, v } = await prepareDataSignatureParameters(
              rando, // Different user, not buyer.
              customTransactionType,
              "MetaTxExchange",
              message,
              metaTransactionsHandler.address
            );

            // Execute meta transaction, expecting revert.
            await expect(
              metaTransactionsHandler.executeMetaTxCompleteExchange(buyer.address, validExchangeDetails, nonce, r, s, v)
            ).to.revertedWith(RevertReasons.SIGNER_AND_SIGNATURE_DO_NOT_MATCH);
          });
        });
      });
    });
  });
});
