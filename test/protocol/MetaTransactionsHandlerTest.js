const hre = require("hardhat");
const ethers = hre.ethers;
const { expect, assert } = require("chai");
const { gasLimit } = require("../../environments");

const Buyer = require("../../scripts/domain/Buyer");
const ExchangeState = require("../../scripts/domain/ExchangeState");
const Role = require("../../scripts/domain/Role");
const DisputeState = require("../../scripts/domain/DisputeState");
const { Funds, FundsList } = require("../../scripts/domain/Funds");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const { prepareDataSignatureParameters, setNextBlockTimestamp } = require("../../scripts/util/test-utils.js");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
const {
  mockOffer,
  mockTwin,
  mockDisputeResolver,
  mockVoucherInitValues,
  mockSeller,
  mockAuthToken,
  accountId,
  mockExchange,
} = require("../utils/mock");
const { oneMonth } = require("../utils/constants");
/**
 *  Test the Boson Meta transactions Handler interface
 */
describe("IBosonMetaTransactionsHandler", function () {
  // Common vars
  let InterfaceIds;
  let deployer, pauser, rando, operator, buyer, admin, clerk, treasury, operatorDR, adminDR, clerkDR, treasuryDR;
  let erc165,
    protocolDiamond,
    accessController,
    accountHandler,
    fundsHandler,
    disputeHandler,
    exchangeHandler,
    offerHandler,
    twinHandler,
    pauseHandler,
    bosonToken,
    support,
    result;
  let metaTransactionsHandler, nonce, functionSignature;
  let seller, offerId, buyerId;
  let validOfferDetails,
    offerType,
    metaTransactionType,
    metaTxExchangeType,
    customTransactionType,
    validExchangeDetails,
    exchangeType,
    message;
  let offer, offerDates, offerDurations;
  let sellerDeposit, price;
  let voucherRedeemableFrom;
  let protocolFeePercentage, protocolFeeFlatBoson, buyerEscalationDepositPercentage;
  let exchange;
  let disputeResolver, disputeResolverFees;
  let twin, success;
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
  let buyerPercent, validDisputeResolutionDetails, signatureSplits;
  let sellerAllowList;
  let voucherInitValues;
  let emptyAuthToken;
  let agentId;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();
  });

  beforeEach(async function () {
    // Make accounts available
    [deployer, pauser, operator, buyer, rando, admin, clerk, treasury, operatorDR, adminDR, clerkDR, treasuryDR] =
      await ethers.getSigners();

    // Deploy the Protocol Diamond
    [protocolDiamond, , , , accessController] = await deployProtocolDiamond();

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Grant PROTOCOL role to ProtocolDiamond address and renounces admin
    await accessController.grantRole(Role.PROTOCOL, protocolDiamond.address);

    // Temporarily grant PAUSER role to pauser account
    await accessController.grantRole(Role.PAUSER, pauser.address);

    // Cut the protocol handler facets into the Diamond
    await deployProtocolHandlerFacets(protocolDiamond, [
      "SellerHandlerFacet",
      "DisputeResolverHandlerFacet",
      "FundsHandlerFacet",
      "ExchangeHandlerFacet",
      "OfferHandlerFacet",
      "TwinHandlerFacet",
      "DisputeHandlerFacet",
      "MetaTransactionsHandlerFacet",
      "PauseHandlerFacet",
      "BuyerHandlerFacet",
    ]);

    // Deploy the Protocol client implementation/proxy pairs (currently just the Boson Voucher)
    const protocolClientArgs = [accessController.address, protocolDiamond.address];
    const [, beacons, proxies] = await deployProtocolClients(protocolClientArgs, gasLimit);
    const [beacon] = beacons;
    const [proxy] = proxies;

    // Deploy the boson token
    [bosonToken] = await deployMockTokens(gasLimit, ["BosonToken"]);

    // set protocolFees
    protocolFeePercentage = "200"; // 2 %
    protocolFeeFlatBoson = ethers.utils.parseUnits("0.01", "ether").toString();
    buyerEscalationDepositPercentage = "1000"; // 10%

    agentId = "0"; // agent id is optional while creating an offer

    // Add config Handler
    const protocolConfig = [
      // Protocol addresses
      {
        treasury: ethers.constants.AddressZero,
        token: bosonToken.address,
        voucherBeacon: beacon.address,
        beaconProxy: proxy.address,
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
        maxRoyaltyPecentage: 1000, //10%
        maxResolutionPeriod: oneMonth,
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
    erc165 = await ethers.getContractAt("ERC165Facet", protocolDiamond.address);

    // Cast Diamond to IBosonAccountHandler. Use this interface to call all individual account handlers
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

    // Cast Diamond to IBosonPauseHandler
    pauseHandler = await ethers.getContractAt("IBosonPauseHandler", protocolDiamond.address);

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
        expect(support, "IBosonMetaTransactionsHandler interface not supported").is.true;
      });
    });
  });

  // All supported methods
  context("📋 Meta Transactions Handler Methods", async function () {
    context("👉 isUsedNonce()", async function () {
      let expectedResult = false;
      beforeEach(async function () {
        expectedResult = false;

        nonce = parseInt(ethers.utils.randomBytes(8));
      });

      it("should return false if nonce is not used", async function () {
        // Check if nonce is used before
        result = await metaTransactionsHandler.connect(operator).isUsedNonce(nonce);

        // Verify the expectation
        assert.equal(result, expectedResult, "Nonce is used");
      });

      it("should be true after executing a meta transaction with nonce", async function () {
        result = await metaTransactionsHandler.connect(operator).isUsedNonce(nonce);

        // Verify the expectation
        assert.equal(result, expectedResult, "Nonce is used");

        // Create a valid seller for meta transaction
        seller = mockSeller(operator.address, operator.address, operator.address, operator.address);
        expect(seller.isValid()).is.true;

        // VoucherInitValues
        voucherInitValues = mockVoucherInitValues();
        expect(voucherInitValues.isValid()).is.true;

        // AuthToken
        emptyAuthToken = mockAuthToken();
        expect(emptyAuthToken.isValid()).is.true;

        // Prepare the function signature for the facet function.
        functionSignature = accountHandler.interface.encodeFunctionData("createSeller", [
          seller,
          emptyAuthToken,
          voucherInitValues,
        ]);

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
        message.functionName =
          "createSeller((uint256,address,address,address,address,bool),(uint256,uint8),(string,uint96))";
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
        // Create a valid seller for meta transaction
        seller = mockSeller(operator.address, operator.address, operator.address, operator.address);
        expect(seller.isValid()).is.true;

        // VoucherInitValues
        voucherInitValues = mockVoucherInitValues();
        expect(voucherInitValues.isValid()).is.true;

        // AuthToken
        emptyAuthToken = mockAuthToken();
        expect(emptyAuthToken.isValid()).is.true;

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

        customTransactionType = {
          MetaTransaction: metaTransactionType,
        };

        // Prepare the message
        message = {};
        message.nonce = parseInt(nonce);
        message.from = operator.address;
      });

      afterEach(async function () {
        // Reset the accountId iterator
        accountId.next(true);
      });

      context("AccountHandler", async function () {
        beforeEach(async function () {
          message.contractAddress = accountHandler.address;
          message.functionName =
            "createSeller((uint256,address,address,address,address,bool),(uint256,uint8),(string,uint96))";
        });

        it("Should emit MetaTransactionExecuted event and update state", async () => {
          // Prepare the function signature for the facet function.
          functionSignature = accountHandler.interface.encodeFunctionData("createSeller", [
            seller,
            emptyAuthToken,
            voucherInitValues,
          ]);

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
          functionSignature = accountHandler.interface.encodeFunctionData("createSeller", [
            seller,
            emptyAuthToken,
            voucherInitValues,
          ]);

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

        context("💔 Revert Reasons", async function () {
          beforeEach(async function () {
            // Prepare the function signature for the facet function.
            functionSignature = accountHandler.interface.encodeFunctionData("createSeller", [
              seller,
              emptyAuthToken,
              voucherInitValues,
            ]);

            message.functionSignature = functionSignature;
          });

          it("The meta transactions region of protocol is paused", async function () {
            // Collect the signature components
            let { r, s, v } = await prepareDataSignatureParameters(
              operator,
              customTransactionType,
              "MetaTransaction",
              message,
              metaTransactionsHandler.address
            );

            // Pause the metatx region of the protocol
            await pauseHandler.connect(pauser).pause([PausableRegion.MetaTransaction]);

            // Attempt to execute a meta transaction, expecting revert
            await expect(
              metaTransactionsHandler
                .connect(deployer)
                .executeMetaTransaction(operator.address, message.functionName, functionSignature, nonce, r, s, v)
            ).to.revertedWith(RevertReasons.REGION_PAUSED);
          });

          it("Should fail when function name is incorrect", async function () {
            let incorrectFunctionName = "createSeller"; // there are no function argument types here.

            // Prepare the function signature for the facet function.
            functionSignature = accountHandler.interface.encodeFunctionData("createSeller", [
              seller,
              emptyAuthToken,
              voucherInitValues,
            ]);

            // Prepare the message
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
            functionSignature = accountHandler.interface.encodeFunctionData("createSeller", [
              seller,
              emptyAuthToken,
              voucherInitValues,
            ]);

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
            functionSignature = accountHandler.interface.encodeFunctionData("createSeller", [
              seller,
              emptyAuthToken,
              voucherInitValues,
            ]);

            // Prepare the message
            message.from = rando.address;
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

      context("👉 msg.sender is replaced with msgSender()", async function () {
        context("TwinHandler", async function () {
          beforeEach(async function () {
            await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

            // Create a valid twin, then set fields in tests directly
            twin = mockTwin(bosonToken.address);
            twin.id = "1";
            twin.sellerId = "1";
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

        context("Reentrancy guard", async function () {
          beforeEach(async function () {
            // Create a valid seller
            await accountHandler.connect(operator).createSeller(seller, emptyAuthToken, voucherInitValues);
          });

          it("Should fail on reenter", async function () {
            // Deploy malicious contracts
            const [maliciousToken] = await deployMockTokens(gasLimit, ["Foreign20Malicious"]);
            await maliciousToken.setProtocolAddress(protocolDiamond.address);

            // Initial ids for all the things
            exchangeId = "1";

            // Create a valid dispute resolver
            disputeResolver = mockDisputeResolver(
              operatorDR.address,
              adminDR.address,
              clerkDR.address,
              treasuryDR.address,
              false
            );
            expect(disputeResolver.isValid()).is.true;

            buyerId = accountId.next().value;

            //Create DisputeResolverFee array so offer creation will succeed
            disputeResolverFees = [new DisputeResolverFee(maliciousToken.address, "maliciousToken", "0")];

            // Make empty seller list, so every seller is allowed
            sellerAllowList = [];

            // Register and activate the dispute resolver
            await accountHandler
              .connect(rando)
              .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
            await accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id);

            const { offer, ...mo } = await mockOffer();
            ({ offerDates, offerDurations } = mo);
            offerToken = offer;
            offerToken.exchangeToken = maliciousToken.address;

            price = offer.price;
            sellerDeposit = offer.sellerDeposit;

            // Check if domains are valid
            expect(offerToken.isValid()).is.true;
            expect(offerDates.isValid()).is.true;
            expect(offerDurations.isValid()).is.true;

            // Create the offer
            await offerHandler
              .connect(operator)
              .createOffer(offerToken, offerDates, offerDurations, disputeResolver.id, agentId);

            // top up seller's and buyer's account
            await maliciousToken.mint(operator.address, sellerDeposit);
            await maliciousToken.mint(buyer.address, price);

            // Approve protocol to transfer the tokens
            await maliciousToken.connect(operator).approve(protocolDiamond.address, sellerDeposit);
            await maliciousToken.connect(buyer).approve(protocolDiamond.address, price);

            // Deposit to seller's pool
            await fundsHandler.connect(operator).depositFunds(seller.id, maliciousToken.address, sellerDeposit);

            // Commit to the offer
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id);

            // Cancel the voucher, so both seller and buyer have something to withdraw
            await exchangeHandler.connect(buyer).cancelVoucher(exchangeId); // canceling the voucher in tokens

            // Expected payoffs - they are the same for token and native currency
            // Buyer: price - buyerCancelPenalty
            buyerPayoff = ethers.BigNumber.from(offerToken.price).sub(offerToken.buyerCancelPenalty).toString();

            // Prepare validFundDetails
            tokenListBuyer = [maliciousToken.address];
            tokenAmountsBuyer = [buyerPayoff];
            validFundDetails = {
              entityId: buyerId,
              tokenList: tokenListBuyer,
              tokenAmounts: tokenAmountsBuyer,
            };

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

            // Prepare the function signature
            functionSignature = fundsHandler.interface.encodeFunctionData("withdrawFunds", [
              validFundDetails.entityId,
              validFundDetails.tokenList,
              validFundDetails.tokenAmounts,
            ]);

            // Collect the signature components
            let { r, s, v } = await prepareDataSignatureParameters(
              buyer,
              customTransactionType,
              "MetaTxFund",
              message,
              metaTransactionsHandler.address
            );

            let [, buyerStruct] = await accountHandler.getBuyer(buyerId);
            const buyerBefore = Buyer.fromStruct(buyerStruct);

            // Execute the meta transaction.
            await expect(
              metaTransactionsHandler.executeMetaTransaction(
                buyer.address,
                message.functionName,
                functionSignature,
                nonce,
                r,
                s,
                v
              )
            ).to.revertedWith(RevertReasons.REENTRANCY_GUARD);

            [, buyerStruct] = await accountHandler.getBuyer(buyerId);
            const buyerAfter = Buyer.fromStruct(buyerStruct);
            assert.equal(buyerAfter.toString(), buyerBefore.toString(), "Buyer should not change");
          });

          it("Should emit MetaTransactionExecuted event and update state", async () => {
            // Deploy malicious contracts
            const [maliciousToken] = await deployMockTokens(gasLimit, ["Foreign20Malicious2"]);
            await maliciousToken.setProtocolAddress(protocolDiamond.address);

            // Mint and approve protocol to transfer the tokens
            await maliciousToken.mint(rando.address, "1");
            await maliciousToken.connect(rando).approve(protocolDiamond.address, "1");

            // Just make a random metaTx signature to some view function that will delete "currentSender"
            // Prepare the function signature for the facet function.
            functionSignature = exchangeHandler.interface.encodeFunctionData("getNextExchangeId");

            // Prepare the message
            message.nonce = "0";
            message.from = rando.address;
            message.contractAddress = accountHandler.address;
            message.functionName = "getNextExchangeId()";
            message.functionSignature = functionSignature;

            // Collect the signature components
            let { r, s, v } = await prepareDataSignatureParameters(
              rando,
              customTransactionType,
              "MetaTransaction",
              message,
              metaTransactionsHandler.address
            );

            await maliciousToken.setMetaTxBytes(rando.address, functionSignature, r, s, v);

            // Prepare the function signature for the facet function.
            functionSignature = fundsHandler.interface.encodeFunctionData("depositFunds", [
              seller.id,
              maliciousToken.address,
              "1",
            ]);

            // Prepare the message
            message.nonce = nonce;
            message.from = rando.address;
            message.contractAddress = accountHandler.address;
            message.functionName = "depositFunds(uint256,address,uint256)";
            message.functionSignature = functionSignature;

            // Collect the signature components
            ({ r, s, v } = await prepareDataSignatureParameters(
              rando,
              customTransactionType,
              "MetaTransaction",
              message,
              metaTransactionsHandler.address
            ));

            // send a meta transaction, expect revert
            await expect(
              metaTransactionsHandler
                .connect(deployer)
                .executeMetaTransaction(rando.address, message.functionName, functionSignature, nonce, r, s, v)
            ).to.revertedWith(RevertReasons.REENTRANCY_GUARD);
          });
        });
      });
    });

    context("👉 ExchangeHandlerFacet 👉 commitToOffer()", async function () {
      beforeEach(async function () {
        // Set a random nonce
        nonce = parseInt(ethers.utils.randomBytes(8));

        // Initial ids for all the things
        offerId = "1";

        // Create a valid seller
        seller = mockSeller(operator.address, operator.address, operator.address, operator.address);
        expect(seller.isValid()).is.true;

        // VoucherInitValues
        voucherInitValues = mockVoucherInitValues();
        expect(voucherInitValues.isValid()).is.true;

        // AuthToken
        emptyAuthToken = mockAuthToken();
        expect(emptyAuthToken.isValid()).is.true;

        await accountHandler.connect(operator).createSeller(seller, emptyAuthToken, voucherInitValues);

        // Create a valid dispute resolver
        disputeResolver = mockDisputeResolver(
          operatorDR.address,
          adminDR.address,
          clerkDR.address,
          treasuryDR.address,
          false
        );
        expect(disputeResolver.isValid()).is.true;

        //Create DisputeResolverFee array so offer creation will succeed
        disputeResolverFees = [new DisputeResolverFee(mockToken.address, "mockToken", "0")];

        // Make empty seller list, so every seller is allowed
        sellerAllowList = [];

        // Register and activate the dispute resolver
        await accountHandler
          .connect(rando)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
        await accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id);

        // Valid offer domains
        ({ offer, offerDates, offerDurations } = await mockOffer());
        offer.exchangeToken = mockToken.address;

        // Check if domains are valid
        expect(offer.isValid()).is.true;
        expect(offerDates.isValid()).is.true;
        expect(offerDurations.isValid()).is.true;

        // Set used variables
        sellerDeposit = offer.sellerDeposit;
        price = offer.price;
        voucherRedeemableFrom = offerDates.voucherRedeemableFrom;

        // top up seller's and buyer's account
        await mockToken.mint(operator.address, sellerDeposit);
        await mockToken.mint(buyer.address, price);

        // approve protocol to transfer the tokens
        await mockToken.connect(operator).approve(protocolDiamond.address, sellerDeposit);
        await mockToken.connect(buyer).approve(protocolDiamond.address, price);

        // deposit to seller's pool
        await fundsHandler.connect(operator).depositFunds(seller.id, mockToken.address, sellerDeposit);

        // Create the offer
        await offerHandler
          .connect(operator)
          .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId);

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

        // prepare validOfferDetails
        validOfferDetails = {
          buyer: buyer.address,
          offerId: offer.id,
        };

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

      afterEach(async function () {
        // Reset the accountId iterator
        accountId.next(true);
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

        // Prepare the function signature
        functionSignature = exchangeHandler.interface.encodeFunctionData("commitToOffer", [
          validOfferDetails.buyer,
          validOfferDetails.offerId,
        ]);

        // Expect that buyer has token balance matching the offer price.
        const buyerBalanceBefore = await mockToken.balanceOf(buyer.address);
        assert.equal(buyerBalanceBefore, price, "Buyer initial token balance mismatch");

        // send a meta transaction, check for event
        await expect(
          metaTransactionsHandler.executeMetaTransaction(
            buyer.address,
            message.functionName,
            functionSignature,
            nonce,
            r,
            s,
            v
          )
        )
          .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
          .withArgs(buyer.address, deployer.address, message.functionName, nonce);

        // Expect that buyer (meta tx signer) has paid the tokens to commit to an offer.
        const buyerBalanceAfter = await mockToken.balanceOf(buyer.address);
        assert.equal(buyerBalanceAfter, "0", "Buyer final token balance mismatch");

        // Verify that nonce is used. Expect true.
        let expectedResult = true;
        result = await metaTransactionsHandler.connect(buyer).isUsedNonce(nonce);
        assert.equal(result, expectedResult, "Nonce is unused");
      });

      it("does not modify revert reasons", async function () {
        // An invalid offer id
        offerId = "666";

        // prepare validOfferDetails
        validOfferDetails = {
          buyer: buyer.address,
          offerId: offerId,
        };

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

        // Prepare the function signature
        functionSignature = exchangeHandler.interface.encodeFunctionData("commitToOffer", [
          validOfferDetails.buyer,
          validOfferDetails.offerId,
        ]);

        // Execute meta transaction, expecting revert.
        await expect(
          metaTransactionsHandler.executeMetaTransaction(
            buyer.address,
            message.functionName,
            functionSignature,
            nonce,
            r,
            s,
            v
          )
        ).to.revertedWith(RevertReasons.NO_SUCH_OFFER);
      });

      context("💔 Revert Reasons", async function () {
        beforeEach(async function () {
          // Prepare the function signature
          functionSignature = exchangeHandler.interface.encodeFunctionData("commitToOffer", [
            validOfferDetails.buyer,
            validOfferDetails.offerId,
          ]);
        });

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
          await metaTransactionsHandler.executeMetaTransaction(
            buyer.address,
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
              buyer.address,
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
            metaTransactionsHandler.executeMetaTransaction(
              buyer.address,
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

    context("👉 Exchange related ", async function () {
      beforeEach(async function () {
        // Set a random nonce
        nonce = parseInt(ethers.utils.randomBytes(8));

        // Initial ids for all the things
        offerId = "1";
        buyerId = "3"; // created after seller and dispute resolver

        // Create a valid seller
        seller = mockSeller(operator.address, operator.address, operator.address, operator.address);
        expect(seller.isValid()).is.true;

        // VoucherInitValues
        voucherInitValues = mockVoucherInitValues();
        expect(voucherInitValues.isValid()).is.true;

        // AuthToken
        emptyAuthToken = mockAuthToken();
        expect(emptyAuthToken.isValid()).is.true;
        await accountHandler.connect(operator).createSeller(seller, emptyAuthToken, voucherInitValues);

        // Create a valid dispute resolver
        disputeResolver = mockDisputeResolver(
          operatorDR.address,
          adminDR.address,
          clerkDR.address,
          treasuryDR.address,
          false
        );
        expect(disputeResolver.isValid()).is.true;

        //Create DisputeResolverFee array so offer creation will succeed
        disputeResolverFees = [new DisputeResolverFee(ethers.constants.AddressZero, "Native", "0")];

        // Make empty seller list, so every seller is allowed
        sellerAllowList = [];

        // Register and activate the dispute resolver
        await accountHandler
          .connect(rando)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
        await accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id);

        // Create the offer
        ({ offer, offerDates, offerDurations } = await mockOffer());
        expect(offer.isValid()).is.true;
        expect(offerDates.isValid()).is.true;
        expect(offerDurations.isValid()).is.true;
        await offerHandler
          .connect(operator)
          .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId);

        sellerDeposit = offer.sellerDeposit;
        price = offer.price;
        voucherRedeemableFrom = offerDates.voucherRedeemableFrom;

        // Required exchange constructor params
        exchange = mockExchange({ buyerId, finalizedDate: "0" });

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

        // prepare validExchangeDetails
        validExchangeDetails = {
          exchangeId: exchange.id,
        };

        // Deposit native currency to the same seller id
        await fundsHandler
          .connect(rando)
          .depositFunds(seller.id, ethers.constants.AddressZero, sellerDeposit, { value: sellerDeposit });

        // Commit to offer
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });
      });

      afterEach(async function () {
        // Reset the accountId iterator
        accountId.next(true);
      });

      context("👉 ExchangeHandlerFacet 👉 cancelVoucher()", async function () {
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

          // Prepare the function signature
          functionSignature = exchangeHandler.interface.encodeFunctionData("cancelVoucher", [
            validExchangeDetails.exchangeId,
          ]);

          // send a meta transaction, check for event
          await expect(
            metaTransactionsHandler.executeMetaTransaction(
              buyer.address,
              message.functionName,
              functionSignature,
              nonce,
              r,
              s,
              v
            )
          )
            .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
            .withArgs(buyer.address, deployer.address, message.functionName, nonce);

          // Verify that nonce is used. Expect true.
          let expectedResult = true;
          result = await metaTransactionsHandler.connect(buyer).isUsedNonce(nonce);
          assert.equal(result, expectedResult, "Nonce is unused");
        });

        it("does not modify revert reasons", async function () {
          // prepare validExchangeDetails
          validExchangeDetails = {
            exchangeId: "666",
          };

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

          // Prepare the function signature
          functionSignature = exchangeHandler.interface.encodeFunctionData("cancelVoucher", [
            validExchangeDetails.exchangeId,
          ]);

          // Execute meta transaction, expecting revert.
          await expect(
            metaTransactionsHandler.executeMetaTransaction(
              buyer.address,
              message.functionName,
              functionSignature,
              nonce,
              r,
              s,
              v
            )
          ).to.revertedWith(RevertReasons.NO_SUCH_EXCHANGE);
        });

        context("💔 Revert Reasons", async function () {
          beforeEach(async function () {
            // Prepare the function signature
            functionSignature = exchangeHandler.interface.encodeFunctionData("cancelVoucher", [
              validExchangeDetails.exchangeId,
            ]);
          });

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
            await metaTransactionsHandler.executeMetaTransaction(
              buyer.address,
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
                buyer.address,
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
              metaTransactionsHandler.executeMetaTransaction(
                buyer.address,
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

      context("👉 ExchangeHandlerFacet 👉 redeemVoucher()", async function () {
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

          // Prepare the function signature
          functionSignature = exchangeHandler.interface.encodeFunctionData("redeemVoucher", [
            validExchangeDetails.exchangeId,
          ]);

          // send a meta transaction, check for event
          await expect(
            metaTransactionsHandler.executeMetaTransaction(
              buyer.address,
              message.functionName,
              functionSignature,
              nonce,
              r,
              s,
              v
            )
          )
            .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
            .withArgs(buyer.address, deployer.address, message.functionName, nonce);

          // Verify that nonce is used. Expect true.
          let expectedResult = true;
          result = await metaTransactionsHandler.connect(buyer).isUsedNonce(nonce);
          assert.equal(result, expectedResult, "Nonce is unused");
        });

        it("does not modify revert reasons", async function () {
          // prepare validExchangeDetails
          validExchangeDetails = {
            exchangeId: "666",
          };

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

          // Prepare the function signature
          functionSignature = exchangeHandler.interface.encodeFunctionData("redeemVoucher", [
            validExchangeDetails.exchangeId,
          ]);

          // Execute meta transaction, expecting revert.
          await expect(
            metaTransactionsHandler.executeMetaTransaction(
              buyer.address,
              message.functionName,
              functionSignature,
              nonce,
              r,
              s,
              v
            )
          ).to.revertedWith(RevertReasons.NO_SUCH_EXCHANGE);
        });

        context("💔 Revert Reasons", async function () {
          beforeEach(async function () {
            // Prepare the function signature
            functionSignature = exchangeHandler.interface.encodeFunctionData("redeemVoucher", [
              validExchangeDetails.exchangeId,
            ]);
          });

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
            await metaTransactionsHandler.executeMetaTransaction(
              buyer.address,
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
                buyer.address,
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
              metaTransactionsHandler.executeMetaTransaction(
                buyer.address,
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

      context("👉 ExchangeHandlerFacet 👉 completeExchange()", async function () {
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

          // Prepare the function signature
          functionSignature = exchangeHandler.interface.encodeFunctionData("completeExchange", [
            validExchangeDetails.exchangeId,
          ]);

          // send a meta transaction, check for event
          await expect(
            metaTransactionsHandler.executeMetaTransaction(
              buyer.address,
              message.functionName,
              functionSignature,
              nonce,
              r,
              s,
              v
            )
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
          // prepare validExchangeDetails
          validExchangeDetails = {
            exchangeId: "666",
          };

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

          // Prepare the function signature
          functionSignature = exchangeHandler.interface.encodeFunctionData("completeExchange", [
            validExchangeDetails.exchangeId,
          ]);

          // Execute meta transaction, expecting revert.
          await expect(
            metaTransactionsHandler.executeMetaTransaction(
              buyer.address,
              message.functionName,
              functionSignature,
              nonce,
              r,
              s,
              v
            )
          ).to.revertedWith(RevertReasons.NO_SUCH_EXCHANGE);
        });

        context("💔 Revert Reasons", async function () {
          beforeEach(async function () {
            // Prepare the function signature
            functionSignature = exchangeHandler.interface.encodeFunctionData("completeExchange", [
              validExchangeDetails.exchangeId,
            ]);
          });

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
            await metaTransactionsHandler.executeMetaTransaction(
              buyer.address,
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
                buyer.address,
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
              metaTransactionsHandler.executeMetaTransaction(
                buyer.address,
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

      context("👉 DisputeHandlerFacet 👉 retractDispute()", async function () {
        beforeEach(async function () {
          // Prepare the message
          message.functionName = "retractDispute(uint256)";
          message.exchangeDetails = validExchangeDetails;
          message.from = buyer.address;

          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // Redeem the voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          await disputeHandler.connect(buyer).raiseDispute(exchange.id);
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

          // Prepare the function signature
          functionSignature = disputeHandler.interface.encodeFunctionData("retractDispute", [
            validExchangeDetails.exchangeId,
          ]);

          // send a meta transaction, check for event
          await expect(
            metaTransactionsHandler.executeMetaTransaction(
              buyer.address,
              message.functionName,
              functionSignature,
              nonce,
              r,
              s,
              v
            )
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
          // prepare validExchangeDetails
          validExchangeDetails = {
            exchangeId: "666",
          };

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

          // Prepare the function signature
          functionSignature = disputeHandler.interface.encodeFunctionData("retractDispute", [
            validExchangeDetails.exchangeId,
          ]);

          // Execute meta transaction, expecting revert.
          await expect(
            metaTransactionsHandler.executeMetaTransaction(
              buyer.address,
              message.functionName,
              functionSignature,
              nonce,
              r,
              s,
              v
            )
          ).to.revertedWith(RevertReasons.NO_SUCH_EXCHANGE);
        });

        context("💔 Revert Reasons", async function () {
          beforeEach(async function () {
            // Prepare the function signature
            functionSignature = disputeHandler.interface.encodeFunctionData("retractDispute", [
              validExchangeDetails.exchangeId,
            ]);
          });

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
            await metaTransactionsHandler.executeMetaTransaction(
              buyer.address,
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
                buyer.address,
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
              metaTransactionsHandler.executeMetaTransaction(
                buyer.address,
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

      context("👉 DisputeHandlerFacet 👉 raiseDispute()", async function () {
        beforeEach(async function () {
          // prepare validExchangeDetails
          validExchangeDetails = {
            exchangeId: exchange.id,
          };

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
          message.functionName = "raiseDispute(uint256)";
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

          // Prepare the function signature
          functionSignature = disputeHandler.interface.encodeFunctionData("raiseDispute", [
            validExchangeDetails.exchangeId,
          ]);

          // send a meta transaction, check for event
          await expect(
            metaTransactionsHandler.executeMetaTransaction(
              buyer.address,
              message.functionName,
              functionSignature,
              nonce,
              r,
              s,
              v
            )
          )
            .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
            .withArgs(buyer.address, deployer.address, message.functionName, nonce);

          // Get the exchange state
          let response;
          [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);
          // It should match ExchangeState.Disputed
          assert.equal(response, ExchangeState.Disputed, "Exchange state is incorrect");

          // Verify that nonce is used. Expect true.
          let expectedResult = true;
          result = await metaTransactionsHandler.connect(buyer).isUsedNonce(nonce);
          assert.equal(result, expectedResult, "Nonce is unused");
        });

        it("does not modify revert reasons", async function () {
          // prepare validExchangeDetails
          validExchangeDetails = {
            exchangeId: "666",
          };

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

          // Prepare the function signature
          functionSignature = disputeHandler.interface.encodeFunctionData("raiseDispute", [
            validExchangeDetails.exchangeId,
          ]);

          // Execute meta transaction, expecting revert.
          await expect(
            metaTransactionsHandler.executeMetaTransaction(
              buyer.address,
              message.functionName,
              functionSignature,
              nonce,
              r,
              s,
              v
            )
          ).to.revertedWith(RevertReasons.NO_SUCH_EXCHANGE);
        });

        context("💔 Revert Reasons", async function () {
          beforeEach(async function () {
            // Prepare the function signature
            functionSignature = disputeHandler.interface.encodeFunctionData("raiseDispute", [
              validExchangeDetails.exchangeId,
            ]);
          });

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
            await metaTransactionsHandler.executeMetaTransaction(
              buyer.address,
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
                buyer.address,
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
              metaTransactionsHandler.executeMetaTransaction(
                buyer.address,
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

      context("👉 DisputeHandlerFacet 👉 escalateDispute()", async function () {
        beforeEach(async function () {
          // Prepare the message
          message.functionName = "escalateDispute(uint256)";
          message.exchangeDetails = validExchangeDetails;
          message.from = buyer.address;

          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // Redeem the voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          await disputeHandler.connect(buyer).raiseDispute(exchange.id);
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

          // Prepare the function signature
          functionSignature = disputeHandler.interface.encodeFunctionData("escalateDispute", [
            validExchangeDetails.exchangeId,
          ]);

          // send a meta transaction, check for event
          await expect(
            metaTransactionsHandler.executeMetaTransaction(
              buyer.address,
              message.functionName,
              functionSignature,
              nonce,
              r,
              s,
              v
            )
          )
            .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
            .withArgs(buyer.address, deployer.address, message.functionName, nonce);

          // Get the dispute state
          let response;
          [, response] = await disputeHandler.connect(rando).getDisputeState(exchange.id);
          // It should match DisputeState.Escalated
          assert.equal(response, DisputeState.Escalated, "Dispute state is incorrect");

          // Verify that nonce is used. Expect true.
          let expectedResult = true;
          result = await metaTransactionsHandler.connect(buyer).isUsedNonce(nonce);
          assert.equal(result, expectedResult, "Nonce is unused");
        });

        it("does not modify revert reasons", async function () {
          // prepare validExchangeDetails
          validExchangeDetails = {
            exchangeId: "666",
          };

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

          // Prepare the function signature
          functionSignature = disputeHandler.interface.encodeFunctionData("escalateDispute", [
            validExchangeDetails.exchangeId,
          ]);

          // Execute meta transaction, expecting revert.
          await expect(
            metaTransactionsHandler.executeMetaTransaction(
              buyer.address,
              message.functionName,
              functionSignature,
              nonce,
              r,
              s,
              v
            )
          ).to.revertedWith(RevertReasons.NO_SUCH_EXCHANGE);
        });

        context("💔 Revert Reasons", async function () {
          beforeEach(async function () {
            // Prepare the function signature
            functionSignature = disputeHandler.interface.encodeFunctionData("escalateDispute", [
              validExchangeDetails.exchangeId,
            ]);
          });

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
            await metaTransactionsHandler.executeMetaTransaction(
              buyer.address,
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
                buyer.address,
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
              metaTransactionsHandler.executeMetaTransaction(
                buyer.address,
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

      context("👉 DisputeHandlerFacet 👉 resolveDispute()", async function () {
        beforeEach(async function () {
          // Set time forward to the offer's voucherRedeemableFrom
          await setNextBlockTimestamp(Number(voucherRedeemableFrom));

          // Redeem the voucher
          await exchangeHandler.connect(buyer).redeemVoucher(exchange.id);

          await disputeHandler.connect(buyer).raiseDispute(exchange.id);

          buyerPercent = "1234";

          // Set the message Type, needed for signature
          let resolutionType = [
            { name: "exchangeId", type: "uint256" },
            { name: "buyerPercent", type: "uint256" },
          ];

          let customSignatureType2 = {
            Resolution: resolutionType,
          };

          let message2 = {
            exchangeId: exchange.id,
            buyerPercent,
          };

          // Collect the signature components
          signatureSplits = await prepareDataSignatureParameters(
            operator, // When buyer is the caller, seller should be the signer.
            customSignatureType2,
            "Resolution",
            message2,
            disputeHandler.address
          );

          // prepare validDisputeResolutionDetails
          validDisputeResolutionDetails = {
            exchangeId: exchange.id,
            buyerPercent: buyerPercent,
            sigR: signatureSplits.r,
            sigS: signatureSplits.s,
            sigV: signatureSplits.v.toString(),
          };

          // Set the Dispute Resolution Type
          let disputeResolutionType = [
            { name: "exchangeId", type: "uint256" },
            { name: "buyerPercent", type: "uint256" },
            { name: "sigR", type: "bytes32" },
            { name: "sigS", type: "bytes32" },
            { name: "sigV", type: "uint8" },
          ];

          // Set the message Type
          let metaTxDisputeResolutionType = [
            { name: "nonce", type: "uint256" },
            { name: "from", type: "address" },
            { name: "contractAddress", type: "address" },
            { name: "functionName", type: "string" },
            { name: "disputeResolutionDetails", type: "MetaTxDisputeResolutionDetails" },
          ];

          customTransactionType = {
            MetaTxDisputeResolution: metaTxDisputeResolutionType,
            MetaTxDisputeResolutionDetails: disputeResolutionType,
          };

          // Prepare the message
          message.functionName = "resolveDispute(uint256,uint256,bytes32,bytes32,uint8)";
          message.disputeResolutionDetails = validDisputeResolutionDetails;
          message.from = buyer.address;
        });

        it("Should emit MetaTransactionExecuted event and update state", async () => {
          // Collect the signature components
          let { r, s, v } = await prepareDataSignatureParameters(
            buyer,
            customTransactionType,
            "MetaTxDisputeResolution",
            message,
            metaTransactionsHandler.address
          );

          // Prepare the function signature
          functionSignature = disputeHandler.interface.encodeFunctionData("resolveDispute", [
            validDisputeResolutionDetails.exchangeId,
            validDisputeResolutionDetails.buyerPercent,
            validDisputeResolutionDetails.sigR,
            validDisputeResolutionDetails.sigS,
            validDisputeResolutionDetails.sigV,
          ]);

          // send a meta transaction, check for event
          await expect(
            metaTransactionsHandler.executeMetaTransaction(
              buyer.address,
              message.functionName,
              functionSignature,
              nonce,
              r,
              s,
              v
            )
          )
            .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
            .withArgs(buyer.address, deployer.address, message.functionName, nonce);

          // Get the dispute state
          let response;
          [, response] = await disputeHandler.connect(rando).getDisputeState(exchange.id);
          // It should match DisputeState.Resolved
          assert.equal(response, DisputeState.Resolved, "Dispute state is incorrect");

          // Verify that nonce is used. Expect true.
          let expectedResult = true;
          result = await metaTransactionsHandler.connect(buyer).isUsedNonce(nonce);
          assert.equal(result, expectedResult, "Nonce is unused");
        });

        it("does not modify revert reasons", async function () {
          // Set buyer percent above 100%
          buyerPercent = "12000"; // 120%

          // prepare validDisputeResolutionDetails
          validDisputeResolutionDetails = {
            exchangeId: exchange.id,
            buyerPercent: buyerPercent,
            sigR: signatureSplits.r,
            sigS: signatureSplits.s,
            sigV: signatureSplits.v.toString(),
          };

          // Prepare the message
          message.disputeResolutionDetails = validDisputeResolutionDetails;

          // Collect the signature components
          let { r, s, v } = await prepareDataSignatureParameters(
            buyer,
            customTransactionType,
            "MetaTxDisputeResolution",
            message,
            metaTransactionsHandler.address
          );

          // Prepare the function signature
          functionSignature = disputeHandler.interface.encodeFunctionData("resolveDispute", [
            validDisputeResolutionDetails.exchangeId,
            validDisputeResolutionDetails.buyerPercent,
            validDisputeResolutionDetails.sigR,
            validDisputeResolutionDetails.sigS,
            validDisputeResolutionDetails.sigV,
          ]);

          // Execute meta transaction, expecting revert.
          await expect(
            metaTransactionsHandler.executeMetaTransaction(
              buyer.address,
              message.functionName,
              functionSignature,
              nonce,
              r,
              s,
              v
            )
          ).to.revertedWith(RevertReasons.INVALID_BUYER_PERCENT);
        });

        context("💔 Revert Reasons", async function () {
          beforeEach(async function () {
            // Prepare the function signature
            functionSignature = disputeHandler.interface.encodeFunctionData("resolveDispute", [
              validDisputeResolutionDetails.exchangeId,
              validDisputeResolutionDetails.buyerPercent,
              validDisputeResolutionDetails.sigR,
              validDisputeResolutionDetails.sigS,
              validDisputeResolutionDetails.sigV,
            ]);
          });

          it("Should fail when replay transaction", async function () {
            // Collect the signature components
            let { r, s, v } = await prepareDataSignatureParameters(
              buyer,
              customTransactionType,
              "MetaTxDisputeResolution",
              message,
              metaTransactionsHandler.address
            );

            // Execute the meta transaction.
            await metaTransactionsHandler.executeMetaTransaction(
              buyer.address,
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
                buyer.address,
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
            // Prepare the message
            message.from = rando.address;

            // Collect the signature components
            let { r, s, v } = await prepareDataSignatureParameters(
              rando, // Different user, not buyer.
              customTransactionType,
              "MetaTxDisputeResolution",
              message,
              metaTransactionsHandler.address
            );

            // Execute meta transaction, expecting revert.
            await expect(
              metaTransactionsHandler.executeMetaTransaction(
                buyer.address,
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
    });

    context("👉 OfferHandlerFacet 👉 createOffer() ", async function () {
      beforeEach(async function () {
        // Set a random nonce
        nonce = parseInt(ethers.utils.randomBytes(8));

        // Initial ids for all the things
        offerId = "1";

        // Create a valid seller
        seller = mockSeller(operator.address, operator.address, operator.address, operator.address);
        expect(seller.isValid()).is.true;

        // VoucherInitValues
        voucherInitValues = mockVoucherInitValues();
        expect(voucherInitValues.isValid()).is.true;

        // AuthToken
        emptyAuthToken = mockAuthToken();
        expect(emptyAuthToken.isValid()).is.true;

        await accountHandler.connect(operator).createSeller(seller, emptyAuthToken, voucherInitValues);

        // Create a valid dispute resolver
        disputeResolver = mockDisputeResolver(
          operatorDR.address,
          adminDR.address,
          clerkDR.address,
          treasuryDR.address,
          false
        );
        expect(disputeResolver.isValid()).is.true;

        //Create DisputeResolverFee array so offer creation will succeed
        disputeResolverFees = [new DisputeResolverFee(mockToken.address, "mockToken", "0")];

        // Make empty seller list, so every seller is allowed
        sellerAllowList = [];

        // Register and activate the dispute resolver
        await accountHandler
          .connect(rando)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
        await accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id);

        // Valid offer domains
        ({ offer, offerDates, offerDurations } = await mockOffer());
        offer.exchangeToken = mockToken.address;

        // Check if domains are valid
        expect(offer.isValid()).is.true;
        expect(offerDates.isValid()).is.true;
        expect(offerDurations.isValid()).is.true;

        // Set used variables
        sellerDeposit = offer.sellerDeposit;
        price = offer.price;
        voucherRedeemableFrom = offerDates.voucherRedeemableFrom;

        // top up seller's and buyer's account
        await mockToken.mint(operator.address, sellerDeposit);
        await mockToken.mint(buyer.address, price);

        // approve protocol to transfer the tokens
        await mockToken.connect(operator).approve(protocolDiamond.address, sellerDeposit);
        await mockToken.connect(buyer).approve(protocolDiamond.address, price);

        // deposit to seller's pool
        await fundsHandler.connect(operator).depositFunds(seller.id, mockToken.address, sellerDeposit);

        // Prepare the function signature for the facet function.
        functionSignature = offerHandler.interface.encodeFunctionData("createOffer", [
          offer,
          offerDates,
          offerDurations,
          disputeResolver.id,
          agentId,
        ]);

        // Set the message Type
        metaTransactionType = [
          { name: "nonce", type: "uint256" },
          { name: "from", type: "address" },
          { name: "contractAddress", type: "address" },
          { name: "functionName", type: "string" },
          { name: "functionSignature", type: "bytes" },
        ];

        customTransactionType = {
          MetaTransaction: metaTransactionType,
        };

        // Prepare the message
        message = {};
        message.nonce = parseInt(nonce);
        message.from = operator.address;
        message.contractAddress = offerHandler.address;
        message.functionName =
          "createOffer((uint256,uint256,uint256,uint256,uint256,uint256,address,string,string,bool),(uint256,uint256,uint256,uint256),(uint256,uint256,uint256),uint256,uint256)";
        message.functionSignature = functionSignature;
      });

      afterEach(async function () {
        // Reset the accountId iterator
        accountId.next(true);
      });

      it("Should emit MetaTransactionExecuted event and update state", async () => {
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
          metaTransactionsHandler.executeMetaTransaction(
            operator.address,
            message.functionName,
            functionSignature,
            nonce,
            r,
            s,
            v
          )
        )
          .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
          .withArgs(operator.address, deployer.address, message.functionName, nonce);

        // Verify that nonce is used. Expect true.
        let expectedResult = true;
        result = await metaTransactionsHandler.connect(operator).isUsedNonce(nonce);
        assert.equal(result, expectedResult, "Nonce is unused");
      });

      it("does not modify revert reasons", async function () {
        // Reverse the from and until dates
        offerDates.validFrom = ethers.BigNumber.from(Date.now() + oneMonth * 6).toString(); // 6 months from now
        offerDates.validUntil = ethers.BigNumber.from(Date.now()).toString(); // now

        // Prepare the function signature for the facet function.
        functionSignature = offerHandler.interface.encodeFunctionData("createOffer", [
          offer,
          offerDates,
          offerDurations,
          disputeResolver.id,
          agentId,
        ]);

        // Prepare the message
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
        ).to.revertedWith(RevertReasons.OFFER_PERIOD_INVALID);
      });

      context("💔 Revert Reasons", async function () {
        it("Should fail when replay transaction", async function () {
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
          // Prepare the message
          message.from = rando.address;

          // Collect the signature components
          let { r, s, v } = await prepareDataSignatureParameters(
            rando, // Different user, not seller's operator.
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

    context("👉 FundsHandlerFacet 👉 withdrawFunds()", async function () {
      beforeEach(async function () {
        // Set a random nonce
        nonce = parseInt(ethers.utils.randomBytes(8));

        // Initial ids for all the things
        exchangeId = "1";
        buyerId = "3"; // created after a seller and a dispute resolver

        // Create a valid seller
        seller = mockSeller(operator.address, admin.address, clerk.address, treasury.address);
        expect(seller.isValid()).is.true;

        // VoucherInitValues
        voucherInitValues = mockVoucherInitValues();
        expect(voucherInitValues.isValid()).is.true;

        // AuthToken
        emptyAuthToken = mockAuthToken();
        expect(emptyAuthToken.isValid()).is.true;
        await accountHandler.connect(operator).createSeller(seller, emptyAuthToken, voucherInitValues);

        // Create a valid dispute resolver
        disputeResolver = mockDisputeResolver(
          operatorDR.address,
          adminDR.address,
          clerkDR.address,
          treasuryDR.address,
          false
        );
        expect(disputeResolver.isValid()).is.true;

        //Create DisputeResolverFee array so offer creation will succeed
        disputeResolverFees = [
          new DisputeResolverFee(ethers.constants.AddressZero, "Native", "0"),
          new DisputeResolverFee(mockToken.address, "mockToken", "0"),
        ];

        // Make empty seller list, so every seller is allowed
        sellerAllowList = [];

        // Register and activate the dispute resolver
        await accountHandler
          .connect(rando)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
        await accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id);

        const { offer, ...mo } = await mockOffer();
        ({ offerDates, offerDurations } = mo);
        offerNative = offer;
        offerToken = offerNative.clone();
        offerToken.id = "2";
        offerToken.exchangeToken = mockToken.address;

        price = offer.price;
        sellerDeposit = offer.sellerDeposit;

        // Check if domains are valid
        expect(offerNative.isValid()).is.true;
        expect(offerDates.isValid()).is.true;
        expect(offerDurations.isValid()).is.true;

        // Create both offers
        await Promise.all([
          offerHandler
            .connect(operator)
            .createOffer(offerNative, offerDates, offerDurations, disputeResolver.id, agentId),
          offerHandler
            .connect(operator)
            .createOffer(offerToken, offerDates, offerDurations, disputeResolver.id, agentId),
        ]);

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
        // buyer: price - buyerCancelPenalty
        buyerPayoff = ethers.BigNumber.from(offerToken.price).sub(offerToken.buyerCancelPenalty).toString();

        // prepare validFundDetails
        tokenListBuyer = [mockToken.address, ethers.constants.AddressZero];
        tokenAmountsBuyer = [buyerPayoff, ethers.BigNumber.from(buyerPayoff).div("2").toString()];
        validFundDetails = {
          entityId: buyerId,
          tokenList: tokenListBuyer,
          tokenAmounts: tokenAmountsBuyer,
        };

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

      afterEach(async function () {
        // Reset the accountId iterator
        accountId.next(true);
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

          // Prepare the function signature
          functionSignature = fundsHandler.interface.encodeFunctionData("withdrawFunds", [
            validFundDetails.entityId,
            validFundDetails.tokenList,
            validFundDetails.tokenAmounts,
          ]);

          // Withdraw funds. Send a meta transaction, check for event.
          await expect(
            metaTransactionsHandler.executeMetaTransaction(
              buyer.address,
              message.functionName,
              functionSignature,
              nonce,
              r,
              s,
              v
            )
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
          validFundDetails = {
            entityId: buyerId,
            tokenList: [],
            tokenAmounts: [],
          };

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

          // Prepare the function signature
          functionSignature = fundsHandler.interface.encodeFunctionData("withdrawFunds", [
            validFundDetails.entityId,
            validFundDetails.tokenList,
            validFundDetails.tokenAmounts,
          ]);

          // Withdraw funds. Send a meta transaction, check for event.
          await expect(
            metaTransactionsHandler.executeMetaTransaction(
              buyer.address,
              message.functionName,
              functionSignature,
              nonce,
              r,
              s,
              v
            )
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

        it("does not modify revert reasons", async function () {
          // Set token address to boson token
          validFundDetails = {
            entityId: buyerId,
            tokenList: [bosonToken.address],
            tokenAmounts: [buyerPayoff],
          };

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

          // Prepare the function signature
          functionSignature = fundsHandler.interface.encodeFunctionData("withdrawFunds", [
            validFundDetails.entityId,
            validFundDetails.tokenList,
            validFundDetails.tokenAmounts,
          ]);

          // Execute meta transaction, expecting revert.
          await expect(
            metaTransactionsHandler.executeMetaTransaction(
              buyer.address,
              message.functionName,
              functionSignature,
              nonce,
              r,
              s,
              v
            )
          ).to.revertedWith(RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS);
        });
      });

      context("💔 Revert Reasons", async function () {
        beforeEach(async function () {
          // Prepare the function signature
          functionSignature = fundsHandler.interface.encodeFunctionData("withdrawFunds", [
            validFundDetails.entityId,
            validFundDetails.tokenList,
            validFundDetails.tokenAmounts,
          ]);
        });

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
          await metaTransactionsHandler.executeMetaTransaction(
            buyer.address,
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
              buyer.address,
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
            metaTransactionsHandler.executeMetaTransaction(
              buyer.address,
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
  });
});
