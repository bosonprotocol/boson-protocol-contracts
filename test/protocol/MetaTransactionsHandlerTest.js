const hre = require("hardhat");
const ethers = hre.ethers;
const { expect, assert } = require("chai");
const { gasLimit } = require("../../environments");

const Exchange = require("../../scripts/domain/Exchange");
const ExchangeState = require("../../scripts/domain/ExchangeState");
const MetaTxExchangeDetails = require("../../scripts/domain/MetaTxExchangeDetails");
const MetaTxFundDetails = require("../../scripts/domain/MetaTxFundDetails");
const MetaTxOfferDetails = require("../../scripts/domain/MetaTxOfferDetails");
const Offer = require("../../scripts/domain/Offer");
const OfferDates = require("../../scripts/domain/OfferDates");
const OfferDurations = require("../../scripts/domain/OfferDurations");
const Role = require("../../scripts/domain/Role");
const Seller = require("../../scripts/domain/Seller");
const DisputeResolver = require("../../scripts/domain/DisputeResolver");
const DisputeState = require("../../scripts/domain/DisputeState");
const { Funds, FundsList } = require("../../scripts/domain/Funds");
const Twin = require("../../scripts/domain/Twin");
const TokenType = require("../../scripts/domain/TokenType");
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
  let accounts, deployer, rando, operator, buyer, admin, clerk, treasury, other1;
  let erc165,
    protocolDiamond,
    accessController,
    accountHandler,
    fundsHandler,
    disputeHandler,
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
    exchangeToken,
    disputeResolverId,
    metadataUri,
    offerChecksum,
    voided,
    oneMonth,
    oneWeek;
  let validFrom, validUntil, voucherRedeemableFrom, voucherRedeemableUntil, offerDates;
  let fulfillmentPeriod, voucherValid, resolutionPeriod, offerDurations;
  let protocolFeePercentage;
  let voucher, committedDate, validUntilDate, redeemedDate, expired;
  let exchange, finalizedDate, state;
  let disputeResolver, active;
  let twin, supplyAvailable, tokenId, supplyIds, tokenAddress, tokenType, success;
  let exchangeId,
    mockToken,
    buyerPayoff,
    offerToken,
    offerNative,
    metaTxFundType,
    fundType,
    validFundDetails,
    buyerBalanceAfter,
    buyerAvailableFunds,
    buyerBalanceBefore,
    expectedBuyerAvailableFunds,
    tokenListBuyer,
    tokenAmountsBuyer;

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
    clerk = accounts[6];
    treasury = accounts[7];
    other1 = accounts[8];

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
      "DisputeHandlerFacet",
      "MetaTransactionsHandlerFacet",
    ]);

    // Deploy the Protocol client implementation/proxy pairs (currently just the Boson Voucher)
    const protocolClientArgs = [accessController.address, protocolDiamond.address];
    [, , clients] = await deployProtocolClients(protocolClientArgs, gasLimit);
    [bosonVoucher] = clients;

    // set protocolFeePercentage
    protocolFeePercentage = "200"; // 2 %

    // Add config Handler
    const protocolConfig = [
      // Protocol addresses
      {
        treasuryAddress: "0x0000000000000000000000000000000000000000",
        tokenAddress: "0x0000000000000000000000000000000000000000",
        voucherAddress: bosonVoucher.address,
      },
      // Protocol limits
      {
        maxOffersPerGroup: 100,
        maxTwinsPerBundle: 100,
        maxOffersPerBundle: 100,
        maxOffersPerBatch: 100,
        maxTokensPerWithdrawal: 100,
      },
      // Protocol fees
      {
        protocolFeePercentage,
      },
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

    // Cast Diamond to IBosonDisputeHandler
    disputeHandler = await ethers.getContractAt("IBosonDisputeHandler", protocolDiamond.address);

    // Cast Diamond to IBosonMetaTransactionsHandler
    metaTransactionsHandler = await ethers.getContractAt("IBosonMetaTransactionsHandler", protocolDiamond.address);

    // Deploy the mock tokens
    [bosonToken, mockToken] = await deployMockTokens(gasLimit, ["BosonToken", "Foreign20"]);
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

      it("Should emit MetaTransactionExecuted event and update state", async () => {
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
            tokenType = TokenType.FungibleToken;

            // Create a valid twin, then set fields in tests directly
            twin = new Twin(id, sellerId, supplyAvailable, supplyIds, tokenId, tokenAddress, tokenType);
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

        // Create a valid seller
        seller = new Seller(id, operator.address, operator.address, operator.address, operator.address, true);
        expect(seller.isValid()).is.true;
        await accountHandler.connect(operator).createSeller(seller);

        // Create a valid dispute resolver
        active = true;
        disputeResolver = new DisputeResolver(id, other1.address, active);
        expect(disputeResolver.isValid()).is.true;

        // Register the dispute resolver
        await accountHandler.connect(rando).createDisputeResolver(disputeResolver);

        // Create an offer to commit to
        oneWeek = 604800 * 1000; //  7 days in milliseconds
        oneMonth = 2678400 * 1000; // 31 days in milliseconds

        // Get the current block info
        blockNumber = await ethers.provider.getBlockNumber();
        block = await ethers.provider.getBlock(blockNumber);

        // Required constructor params
        price = ethers.utils.parseUnits("1.5", "ether").toString();
        sellerDeposit = ethers.utils.parseUnits("0.25", "ether").toString();
        protocolFee = calculateProtocolFee(sellerDeposit, price, protocolFeePercentage);
        buyerCancelPenalty = ethers.utils.parseUnits("0.05", "ether").toString();
        quantityAvailable = "1";
        exchangeToken = ethers.constants.AddressZero.toString(); // Zero addy ~ chain base currency
        disputeResolverId = "2";
        offerChecksum = "QmYXc12ov6F2MZVZwPs5XeCBbf61cW3wKRk8h3D5NTYj4T";
        metadataUri = `https://ipfs.io/ipfs/${offerChecksum}`;
        voided = false;

        // Create a valid offer entity
        offer = new Offer(
          offerId,
          sellerId,
          price,
          sellerDeposit,
          protocolFee,
          buyerCancelPenalty,
          quantityAvailable,
          exchangeToken,
          disputeResolverId,
          metadataUri,
          offerChecksum,
          voided
        );
        expect(offer.isValid()).is.true;

        // Required constructor params
        validFrom = ethers.BigNumber.from(block.timestamp).toString(); // valid from now
        validUntil = ethers.BigNumber.from(block.timestamp)
          .add(oneMonth * 6)
          .toString(); // until 6 months
        voucherRedeemableFrom = ethers.BigNumber.from(block.timestamp).add(oneWeek).toString(); // redeemable in 1 week
        voucherRedeemableUntil = "0"; // vouchers don't have fixed expiration date

        // Create a valid offerDates, then set fields in tests directly
        offerDates = new OfferDates(validFrom, validUntil, voucherRedeemableFrom, voucherRedeemableUntil);

        // Required constructor params
        fulfillmentPeriod = oneMonth.toString(); // fulfillment period is one month
        voucherValid = oneMonth.toString(); // offers valid for one month
        resolutionPeriod = oneWeek.toString(); // dispute is valid for one month

        // Create a valid offerDurations, then set fields in tests directly
        offerDurations = new OfferDurations(fulfillmentPeriod, voucherValid, resolutionPeriod);

        // Create the offer
        await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations);

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

      it("Should emit MetaTransactionExecuted event and update state", async () => {
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
        buyerId = "3"; // created after seller and dispute resolver

        // Create a valid seller
        seller = new Seller(id, operator.address, operator.address, operator.address, operator.address, true);
        expect(seller.isValid()).is.true;
        await accountHandler.connect(operator).createSeller(seller);

        // Create a valid dispute resolver
        active = true;
        disputeResolver = new DisputeResolver(id.toString(), other1.address, active);
        expect(disputeResolver.isValid()).is.true;

        // Register the dispute resolver
        await accountHandler.connect(rando).createDisputeResolver(disputeResolver);

        // Create an offer to commit to
        oneWeek = 604800 * 1000; //  7 days in milliseconds
        oneMonth = 2678400 * 1000; // 31 days in milliseconds

        // Get the current block info
        blockNumber = await ethers.provider.getBlockNumber();
        block = await ethers.provider.getBlock(blockNumber);

        // Required constructor params
        price = ethers.utils.parseUnits("1.5", "ether").toString();
        sellerDeposit = ethers.utils.parseUnits("0.25", "ether").toString();
        protocolFee = calculateProtocolFee(sellerDeposit, price, protocolFeePercentage);
        buyerCancelPenalty = ethers.utils.parseUnits("0.05", "ether").toString();
        quantityAvailable = "1";
        exchangeToken = ethers.constants.AddressZero.toString(); // Zero addy ~ chain base currency
        disputeResolverId = "2";
        offerChecksum = "QmYXc12ov6F2MZVZwPs5XeCBbf61cW3wKRk8h3D5NTYj4T";
        metadataUri = `https://ipfs.io/ipfs/${offerChecksum}`;
        voided = false;

        // Create a valid offer entity
        offer = new Offer(
          id,
          sellerId,
          price,
          sellerDeposit,
          protocolFee,
          buyerCancelPenalty,
          quantityAvailable,
          exchangeToken,
          disputeResolverId,
          metadataUri,
          offerChecksum,
          voided
        );
        expect(offer.isValid()).is.true;

        // Required constructor params
        validFrom = ethers.BigNumber.from(block.timestamp).toString(); // valid from now
        validUntil = ethers.BigNumber.from(block.timestamp)
          .add(oneMonth * 6)
          .toString(); // until 6 months
        voucherRedeemableFrom = ethers.BigNumber.from(block.timestamp).add(oneWeek).toString(); // redeemable in 1 week
        voucherRedeemableUntil = "0"; // vouchers don't have fixed expiration date

        // Create a valid offerDates, then set fields in tests directly
        offerDates = new OfferDates(validFrom, validUntil, voucherRedeemableFrom, voucherRedeemableUntil);
        expect(offerDates.isValid()).is.true;

        // Required constructor params
        fulfillmentPeriod = oneMonth.toString(); // fulfillment period is one month
        voucherValid = oneMonth.toString(); // offers valid for one month
        resolutionPeriod = oneWeek.toString(); // dispute is valid for one month

        // Create a valid offerDurations, then set fields in tests directly
        offerDurations = new OfferDurations(fulfillmentPeriod, voucherValid, resolutionPeriod);
        expect(offerDurations.isValid()).is.true;

        // Create the offer
        await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations);

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

        it("Should emit MetaTransactionExecuted event and update state", async () => {
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

          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));
        });

        it("Should emit MetaTransactionExecuted event and update state", async () => {
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

          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // Redeem the voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);
        });

        it("Should emit MetaTransactionExecuted event and update state", async () => {
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

      context("👉 executeMetaTxRetractDispute()", async function () {
        beforeEach(async function () {
          // Prepare the message
          message.functionName = "retractDispute(uint256)";
          message.exchangeDetails = validExchangeDetails;
          message.from = buyer.address;

          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // Redeem the voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          // Set the dispute reason
          let complaint = "Tastes weird";
          await disputeHandler.connect(buyer).raiseDispute(exchange.id, complaint);
        });

        it("Should emit MetaTransactionExecuted event and update state", async () => {
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
            metaTransactionsHandler.executeMetaTxRetractDispute(buyer.address, validExchangeDetails, nonce, r, s, v)
          )
            .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
            .withArgs(buyer.address, deployer.address, message.functionName, nonce);

          // Get the dispute state
          let response;
          [, response] = await disputeHandler.connect(rando).getDisputeState(exchange.id);
          // It should match DisputeState.Retracted
          assert.equal(response, DisputeState.Retracted, "Dispute state is incorrect");

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
            metaTransactionsHandler.executeMetaTxRetractDispute(buyer.address, validExchangeDetails, nonce, r, s, v)
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
            await metaTransactionsHandler.executeMetaTxRetractDispute(
              buyer.address,
              validExchangeDetails,
              nonce,
              r,
              s,
              v
            );

            // Execute meta transaction again with the same nonce, expecting revert.
            await expect(
              metaTransactionsHandler.executeMetaTxRetractDispute(buyer.address, validExchangeDetails, nonce, r, s, v)
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
              metaTransactionsHandler.executeMetaTxRetractDispute(buyer.address, validExchangeDetails, nonce, r, s, v)
            ).to.revertedWith(RevertReasons.SIGNER_AND_SIGNATURE_DO_NOT_MATCH);
          });
        });
      });
    });

    context("👉 executeMetaTxWithdrawFunds()", async function () {
      beforeEach(async function () {
        // Set a random nonce
        nonce = parseInt(ethers.utils.randomBytes(8));

        // Initial ids for all the things
        id = sellerId = exchangeId = "1";
        buyerId = "3"; // created after a seller and a dispute resolver
        active = true;

        // Create a valid seller
        seller = new Seller(id, operator.address, admin.address, clerk.address, treasury.address, active);
        expect(seller.isValid()).is.true;
        await accountHandler.connect(operator).createSeller(seller);

        // Create a valid dispute resolver
        disputeResolver = new DisputeResolver(id.toString(), other1.address, active);
        expect(disputeResolver.isValid()).is.true;

        // Register the dispute resolver
        await accountHandler.connect(rando).createDisputeResolver(disputeResolver);

        // Create an offer to commit to
        oneWeek = 604800 * 1000; //  7 days in milliseconds
        oneMonth = 2678400 * 1000; // 31 days in milliseconds

        // Get the current block info
        blockNumber = await ethers.provider.getBlockNumber();
        block = await ethers.provider.getBlock(blockNumber);

        // Required constructor params
        price = ethers.utils.parseUnits("1.5", "ether").toString();
        sellerDeposit = ethers.utils.parseUnits("0.25", "ether").toString();
        protocolFee = calculateProtocolFee(sellerDeposit, price, protocolFeePercentage);
        buyerCancelPenalty = ethers.utils.parseUnits("0.05", "ether").toString();
        quantityAvailable = "2";
        exchangeToken = mockToken.address; // Mock token addres
        disputeResolverId = "2";
        offerChecksum = "QmYXc12ov6F2MZVZwPs5XeCBbf61cW3wKRk8h3D5NTYj4T";
        metadataUri = `https://ipfs.io/ipfs/${offerChecksum}`;
        voided = false;

        // Create a valid offer entity
        offerToken = new Offer(
          id,
          sellerId,
          price,
          sellerDeposit,
          protocolFee,
          buyerCancelPenalty,
          quantityAvailable,
          exchangeToken,
          disputeResolverId,
          metadataUri,
          offerChecksum,
          voided
        );
        expect(offerToken.isValid()).is.true;

        offerNative = offerToken.clone();
        offerNative.id = "2";
        offerNative.exchangeToken = ethers.constants.AddressZero;
        expect(offerNative.isValid()).is.true;

        // Required constructor params
        validFrom = ethers.BigNumber.from(block.timestamp).toString(); // valid from now
        validUntil = ethers.BigNumber.from(block.timestamp)
          .add(oneMonth * 6)
          .toString(); // until 6 months
        voucherRedeemableFrom = ethers.BigNumber.from(block.timestamp).add(oneWeek).toString(); // redeemable in 1 week
        voucherRedeemableUntil = "0"; // vouchers don't have fixed expiration date

        // Create a valid offerDates, then set fields in tests directly
        offerDates = new OfferDates(validFrom, validUntil, voucherRedeemableFrom, voucherRedeemableUntil);

        // Required constructor params
        fulfillmentPeriod = oneMonth.toString(); // fulfillment period is one month
        voucherValid = oneMonth.toString(); // offers valid for one month
        resolutionPeriod = oneWeek.toString(); // dispute is valid for one month

        // Create a valid offerDurations, then set fields in tests directly
        offerDurations = new OfferDurations(fulfillmentPeriod, voucherValid, resolutionPeriod);

        // Create both offers
        await offerHandler.connect(operator).createOffer(offerToken, offerDates, offerDurations);
        await offerHandler.connect(operator).createOffer(offerNative, offerDates, offerDurations);

        // top up seller's and buyer's account
        await mockToken.mint(operator.address, sellerDeposit);
        await mockToken.mint(buyer.address, price);

        // approve protocol to transfer the tokens
        await mockToken.connect(operator).approve(protocolDiamond.address, sellerDeposit);
        await mockToken.connect(buyer).approve(protocolDiamond.address, price);

        // deposit to seller's pool
        await fundsHandler.connect(operator).depositFunds(seller.id, mockToken.address, sellerDeposit);
        await fundsHandler.connect(operator).depositFunds(seller.id, ethers.constants.AddressZero, sellerDeposit, {
          value: sellerDeposit,
        });

        // commit to both offers
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id);
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerNative.id, { value: offerNative.price });

        // cancel the voucher, so both seller and buyer have something to withdraw
        await exchangeHandler.connect(buyer).cancelVoucher(exchangeId); // canceling the voucher in tokens
        await exchangeHandler.connect(buyer).cancelVoucher(++exchangeId); // canceling the voucher in the native currency

        // expected payoffs - they are the same for token and native currency
        // buyer: price - buyerCancelPenalty - protocolFee
        buyerPayoff = ethers.BigNumber.from(offerToken.price)
          .sub(offerToken.buyerCancelPenalty)
          .sub(offerToken.protocolFee)
          .toString();

        // prepare the MetaTxFundDetails struct
        tokenListBuyer = [mockToken.address, ethers.constants.AddressZero];
        tokenAmountsBuyer = [buyerPayoff, ethers.BigNumber.from(buyerPayoff).div("2").toString()];
        validFundDetails = new MetaTxFundDetails(buyerId, tokenListBuyer, tokenAmountsBuyer);
        expect(validFundDetails.isValid()).is.true;

        // Prepare the message
        message = {};
        message.nonce = parseInt(nonce);
        message.contractAddress = fundsHandler.address;
        message.functionName = "withdrawFunds(uint256,address[],uint256[])";
        message.fundDetails = validFundDetails;
        message.from = buyer.address;

        // Set the fund Type
        fundType = [
          { name: "entityId", type: "uint256" },
          { name: "tokenList", type: "address[]" },
          { name: "tokenAmounts", type: "uint256[]" },
        ];

        // Set the message Type
        metaTxFundType = [
          { name: "nonce", type: "uint256" },
          { name: "from", type: "address" },
          { name: "contractAddress", type: "address" },
          { name: "functionName", type: "string" },
          { name: "fundDetails", type: "MetaTxFundDetails" },
        ];

        customTransactionType = {
          MetaTxFund: metaTxFundType,
          MetaTxFundDetails: fundType,
        };
      });

      context("Should emit MetaTransactionExecuted event and update state", async () => {
        beforeEach(async function () {
          // Read on chain state
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
          buyerBalanceBefore = await mockToken.balanceOf(buyer.address);

          // Chain state should match the expected available funds before the withdrawal
          expectedBuyerAvailableFunds = new FundsList([
            new Funds(mockToken.address, "Foreign20", buyerPayoff),
            new Funds(ethers.constants.AddressZero, "Native currency", buyerPayoff),
          ]);
          expect(buyerAvailableFunds).to.eql(
            expectedBuyerAvailableFunds,
            "Buyer available funds mismatch before withdrawal"
          );
        });

        it("Withdraws multiple tokens", async () => {
          // Collect the signature components
          let { r, s, v } = await prepareDataSignatureParameters(
            buyer,
            customTransactionType,
            "MetaTxFund",
            message,
            metaTransactionsHandler.address
          );

          // Withdraw funds. Send a meta transaction, check for event.
          await expect(
            metaTransactionsHandler.executeMetaTxWithdrawFunds(buyer.address, validFundDetails, nonce, r, s, v)
          )
            .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
            .withArgs(buyer.address, deployer.address, message.functionName, nonce);

          // Read on chain state
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
          buyerBalanceAfter = await mockToken.balanceOf(buyer.address);

          // Chain state should match the expected available funds after the withdrawal
          // Since all tokens are withdrawn, token should be removed from the list
          expectedBuyerAvailableFunds = new FundsList([
            new Funds(
              ethers.constants.AddressZero,
              "Native currency",
              ethers.BigNumber.from(buyerPayoff).div("2").toString()
            ),
          ]);
          expect(buyerAvailableFunds).to.eql(
            expectedBuyerAvailableFunds,
            "Buyer available funds mismatch after withdrawal"
          );

          // Token balance is increased for the buyer payoff
          expect(buyerBalanceAfter).to.eql(buyerBalanceBefore.add(buyerPayoff), "Buyer token balance mismatch");

          // Verify that nonce is used. Expect true.
          let expectedResult = true;
          result = await metaTransactionsHandler.connect(buyer).isUsedNonce(nonce);
          assert.equal(result, expectedResult, "Nonce is unused");
        });

        it("withdraws all the tokens when we use empty tokenList and tokenAmounts arrays", async () => {
          validFundDetails = new MetaTxFundDetails(buyerId, [], []);
          expect(validFundDetails.isValid()).is.true;

          // Prepare the message
          message.fundDetails = validFundDetails;

          // Collect the signature components
          let { r, s, v } = await prepareDataSignatureParameters(
            buyer,
            customTransactionType,
            "MetaTxFund",
            message,
            metaTransactionsHandler.address
          );

          // Withdraw funds. Send a meta transaction, check for event.
          await expect(
            metaTransactionsHandler.executeMetaTxWithdrawFunds(buyer.address, validFundDetails, nonce, r, s, v)
          )
            .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
            .withArgs(buyer.address, deployer.address, message.functionName, nonce);

          // Read on chain state
          buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
          buyerBalanceAfter = await mockToken.balanceOf(buyer.address);

          // Chain state should match the expected available funds after the withdrawal
          // Since all tokens are withdrawn, funds list should be empty.
          expectedBuyerAvailableFunds = new FundsList([]);
          expect(buyerAvailableFunds).to.eql(
            expectedBuyerAvailableFunds,
            "Buyer available funds mismatch after withdrawal"
          );

          // Token balance is increased for the buyer payoff
          expect(buyerBalanceAfter).to.eql(buyerBalanceBefore.add(buyerPayoff), "Buyer token balance mismatch");

          // Verify that nonce is used. Expect true.
          let expectedResult = true;
          result = await metaTransactionsHandler.connect(buyer).isUsedNonce(nonce);
          assert.equal(result, expectedResult, "Nonce is unused");
        });
      });

      it("does not modify revert reasons", async function () {
        // Set token address to boson token
        validFundDetails = new MetaTxFundDetails(buyerId, [bosonToken.address], [buyerPayoff]);
        expect(validFundDetails.isValid()).is.true;

        // Prepare the message
        message.fundDetails = validFundDetails;

        // Collect the signature components
        let { r, s, v } = await prepareDataSignatureParameters(
          buyer,
          customTransactionType,
          "MetaTxFund",
          message,
          metaTransactionsHandler.address
        );

        // Execute meta transaction, expecting revert.
        await expect(
          metaTransactionsHandler.executeMetaTxWithdrawFunds(buyer.address, validFundDetails, nonce, r, s, v)
        ).to.revertedWith(RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS);
      });

      context("💔 Revert Reasons", async function () {
        it("Should fail when replay transaction", async function () {
          // Collect the signature components
          let { r, s, v } = await prepareDataSignatureParameters(
            buyer,
            customTransactionType,
            "MetaTxFund",
            message,
            metaTransactionsHandler.address
          );

          // Execute the meta transaction.
          await metaTransactionsHandler.executeMetaTxWithdrawFunds(buyer.address, validFundDetails, nonce, r, s, v);

          // Execute meta transaction again with the same nonce, expecting revert.
          await expect(
            metaTransactionsHandler.executeMetaTxWithdrawFunds(buyer.address, validFundDetails, nonce, r, s, v)
          ).to.revertedWith(RevertReasons.NONCE_USED_ALREADY);
        });

        it("Should fail when Signer and Signature do not match", async function () {
          // Prepare the message
          message.from = rando.address;

          // Collect the signature components
          let { r, s, v } = await prepareDataSignatureParameters(
            rando, // Different user, not buyer.
            customTransactionType,
            "MetaTxFund",
            message,
            metaTransactionsHandler.address
          );

          // Execute meta transaction, expecting revert.
          await expect(
            metaTransactionsHandler.executeMetaTxWithdrawFunds(buyer.address, validFundDetails, nonce, r, s, v)
          ).to.revertedWith(RevertReasons.SIGNER_AND_SIGNATURE_DO_NOT_MATCH);
        });
      });
    });
  });
});
