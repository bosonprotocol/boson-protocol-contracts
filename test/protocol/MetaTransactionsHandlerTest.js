const { ethers } = require("hardhat");
const {
  keccak256,
  toUtf8Bytes,
  ZeroAddress,
  getContractAt,
  getContractFactory,
  getSigners,
  randomBytes,
  zeroPadBytes,
  ZeroHash,
  MaxUint256,
} = ethers;
const { expect, assert } = require("chai");

const Buyer = require("../../scripts/domain/Buyer");
const ExchangeState = require("../../scripts/domain/ExchangeState");
const Role = require("../../scripts/domain/Role");
const DisputeState = require("../../scripts/domain/DisputeState");
const { Funds, FundsList } = require("../../scripts/domain/Funds");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const {
  prepareDataSignatureParameters,
  setNextBlockTimestamp,
  setupTestEnvironment,
  getSnapshot,
  revertToSnapshot,
} = require("../util/utils.js");
const {
  mockOffer,
  mockTwin,
  mockDisputeResolver,
  mockVoucherInitValues,
  mockSeller,
  mockAuthToken,
  accountId,
  mockExchange,
} = require("../util/mock");
const { oneMonth } = require("../util/constants");
const {
  getSelectors,
  FacetCutAction,
  getStateModifyingFunctions,
  getStateModifyingFunctionsHashes,
} = require("../../scripts/util/diamond-utils.js");

/**
 *  Test the Boson Meta transactions Handler interface
 */
describe("IBosonMetaTransactionsHandler", function () {
  // Common vars
  let InterfaceIds;
  let deployer, pauser, rando, assistant, buyer, admin, clerk, treasury, assistantDR, adminDR, clerkDR, treasuryDR;
  let erc165,
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
    result,
    mockMetaTransactionsHandler;
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
  let buyerPercentBasisPoints, validDisputeResolutionDetails, signatureSplits;
  let sellerAllowList;
  let voucherInitValues;
  let emptyAuthToken;
  let agentId;
  let facetNames;
  let protocolDiamondAddress;
  let snapshotId;

  before(async function () {
    accountId.next(true);

    // get interface Ids
    InterfaceIds = await getInterfaceIds();

    // Specify facets needed for this test
    facetNames = [
      "SellerHandlerFacet",
      "DisputeResolverHandlerFacet",
      "FundsHandlerFacet",
      "ExchangeHandlerFacet",
      "OfferHandlerFacet",
      "TwinHandlerFacet",
      "DisputeHandlerFacet",
      "PauseHandlerFacet",
      "BuyerHandlerFacet",
      "MetaTransactionsHandlerFacet",
      "ProtocolInitializationHandlerFacet",
    ];

    // Specify contracts needed for this test
    const contracts = {
      erc165: "ERC165Facet",
      accountHandler: "IBosonAccountHandler",
      twinHandler: "IBosonTwinHandler",
      offerHandler: "IBosonOfferHandler",
      exchangeHandler: "IBosonExchangeHandler",
      fundsHandler: "IBosonFundsHandler",
      disputeHandler: "IBosonDisputeHandler",
      metaTransactionsHandler: "IBosonMetaTransactionsHandler",
      pauseHandler: "IBosonPauseHandler",
    };

    ({
      signers: [pauser, buyer, rando, admin, treasury, adminDR, treasuryDR],
      contractInstances: {
        erc165,
        accountHandler,
        twinHandler,
        offerHandler,
        exchangeHandler,
        fundsHandler,
        disputeHandler,
        metaTransactionsHandler,
        pauseHandler,
      },
      extraReturnValues: { accessController },
      diamondAddress: protocolDiamondAddress,
    } = await setupTestEnvironment(contracts));

    // make all account the same
    assistant = admin;
    assistantDR = adminDR;
    clerk = clerkDR = { address: ZeroAddress };

    [deployer] = await getSigners();

    // Deploy the mock tokens
    [bosonToken, mockToken] = await deployMockTokens(["BosonToken", "Foreign20"]);

    // Agent id is optional when creating an offer
    agentId = "0";

    // Get snapshot id
    snapshotId = await getSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();
  });

  async function upgradeMetaTransactionsHandlerFacet() {
    // Upgrade the ExchangeHandlerFacet functions
    // DiamondCutFacet
    const cutFacetViaDiamond = await getContractAt("DiamondCutFacet", protocolDiamondAddress);

    // Deploy MockMetaTransactionsHandlerFacet
    const MockMetaTransactionsHandlerFacet = await getContractFactory("MockMetaTransactionsHandlerFacet");
    const mockMetaTransactionsHandlerFacet = await MockMetaTransactionsHandlerFacet.deploy();
    await mockMetaTransactionsHandlerFacet.deployed();

    // Define the facet cut
    const facetCuts = [
      {
        facetAddress: await mockMetaTransactionsHandlerFacet.getAddress(),
        action: FacetCutAction.Add,
        functionSelectors: getSelectors(mockMetaTransactionsHandlerFacet),
      },
    ];

    // Send the DiamondCut transaction
    const tx = await cutFacetViaDiamond.connect(deployer).diamondCut(facetCuts, ZeroAddress, "0x");

    // Wait for transaction to confirm
    const receipt = await tx.wait();

    // Be certain transaction was successful
    assert.equal(receipt.status, 1, `Diamond upgrade failed: ${tx.hash}`);

    // Cast Diamond to MockMetaTransactionsHandlerFacet
    mockMetaTransactionsHandler = await getContractAt("MockMetaTransactionsHandlerFacet", protocolDiamondAddress);
  }

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
    beforeEach(async function () {
      nonce = parseInt(randomBytes(8));
    });

    context("👉 isUsedNonce()", async function () {
      let expectedResult;
      beforeEach(async function () {
        expectedResult = false;
      });

      it("should return false if nonce is not used", async function () {
        // Check if nonce is used before
        result = await metaTransactionsHandler.connect(assistant).isUsedNonce(await rando.getAddress(), nonce);

        // Verify the expectation
        assert.equal(result, expectedResult, "Nonce is used");
      });

      it("should be true after executing a meta transaction with nonce", async function () {
        result = await metaTransactionsHandler.connect(assistant).isUsedNonce(await assistant.getAddress(), nonce);

        // Verify the expectation
        assert.equal(result, expectedResult, "Nonce is used");

        // Create a valid seller for meta transaction
        seller = mockSeller(
          await assistant.getAddress(),
          await assistant.getAddress(),
          ZeroAddress,
          await assistant.getAddress()
        );
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
        message.from = await assistant.getAddress();
        message.contractAddress = await accountHandler.getAddress();
        message.functionName =
          "createSeller((uint256,address,address,address,address,bool,string),(uint256,uint8),(string,uint256))";
        message.functionSignature = functionSignature;

        // Collect the signature components
        let { r, s, v } = await prepareDataSignatureParameters(
          assistant,
          customTransactionType,
          "MetaTransaction",
          message,
          await metaTransactionsHandler.getAddress()
        );

        // Send as meta transaction
        await metaTransactionsHandler.executeMetaTransaction(
          await assistant.getAddress(),
          message.functionName,
          functionSignature,
          nonce,
          r,
          s,
          v
        );

        // We expect that the nonce is used now. Hence expecting to return true.
        expectedResult = true;
        result = await metaTransactionsHandler.connect(assistant).isUsedNonce(await assistant.getAddress(), nonce);
        assert.equal(result, expectedResult, "Nonce is not used");

        //Verify that another nonce value is unused.
        expectedResult = false;
        nonce = nonce + 1;
        result = await metaTransactionsHandler.connect(rando).isUsedNonce(await assistant.getAddress(), nonce);
        assert.equal(result, expectedResult, "Nonce is used");
      });
    });

    context("👉 setAllowlistedFunctions()", async function () {
      let functionHashList;
      beforeEach(async function () {
        // A list of random functions
        const functionList = [
          "testFunction1(uint256)",
          "testFunction2(uint256)",
          "testFunction3((uint256,address,bool))",
          "testFunction4(uint256[])",
        ];

        functionHashList = functionList.map((func) => keccak256(toUtf8Bytes(func)));

        // Grant UPGRADER role to admin account
        await accessController.grantRole(Role.ADMIN, await admin.getAddress());
      });

      it("should emit a FunctionsAllowlisted event", async function () {
        // Enable functions
        await expect(metaTransactionsHandler.connect(admin).setAllowlistedFunctions(functionHashList, true))
          .to.emit(metaTransactionsHandler, "FunctionsAllowlisted")
          .withArgs(functionHashList, true, await admin.getAddress());

        // Disable functions
        await expect(metaTransactionsHandler.connect(admin).setAllowlistedFunctions(functionHashList, false))
          .to.emit(metaTransactionsHandler, "FunctionsAllowlisted")
          .withArgs(functionHashList, false, await admin.getAddress());
      });

      it("should update state", async function () {
        // Functions should be disabled by default
        for (const func of functionHashList) {
          expect(await metaTransactionsHandler["isFunctionAllowlisted(bytes32)"](func)).to.be.false;
        }

        // Enable functions
        await metaTransactionsHandler.connect(admin).setAllowlistedFunctions(functionHashList, true);

        // Functions should be enabled
        for (const func of functionHashList) {
          expect(await metaTransactionsHandler["isFunctionAllowlisted(bytes32)"](func)).to.be.true;
        }

        // Disable functions
        await metaTransactionsHandler.connect(admin).setAllowlistedFunctions(functionHashList, false);

        // Functions should be disabled
        for (const func of functionHashList) {
          expect(await metaTransactionsHandler["isFunctionAllowlisted(bytes32)"](func)).to.be.false;
        }
      });

      context("💔 Revert Reasons", async function () {
        it("caller is not the admin", async function () {
          // Attempt to set new max offer per group, expecting revert
          await expect(
            metaTransactionsHandler.connect(rando).setAllowlistedFunctions(functionHashList, true)
          ).to.revertedWith(RevertReasons.ACCESS_DENIED);
        });
      });
    });

    context("👉 isFunctionAllowlisted(bytes32)", async function () {
      let functionHashList;
      beforeEach(async function () {
        // A list of random functions
        const functionList = [
          "testFunction1(uint256)",
          "testFunction2(uint256)",
          "testFunction3((uint256,address,bool))",
          "testFunction4(uint256[])",
        ];

        functionHashList = functionList.map((func) => keccak256(toUtf8Bytes(func)));

        // Grant UPGRADER role to admin account
        await accessController.grantRole(Role.ADMIN, await admin.getAddress());
      });

      it("after initialization all state modifying functions should be allowlisted", async function () {
        const stateModifyingFunctionsClosure = getStateModifyingFunctionsHashes(facetNames, [
          "executeMetaTransaction(address,string,bytes,uint256,bytes32,bytes32,uint8)",
        ]);
        const stateModifyingFunctionsHashes = await stateModifyingFunctionsClosure();

        // Functions should be enabled
        for (const func of stateModifyingFunctionsHashes) {
          expect(await metaTransactionsHandler["isFunctionAllowlisted(bytes32)"](func)).to.be.true;
        }
      });

      it("should return correct value", async function () {
        // Functions should be disabled by default
        for (const func of functionHashList) {
          expect(await metaTransactionsHandler["isFunctionAllowlisted(bytes32)"](func)).to.be.false;
        }

        // Enable functions
        await metaTransactionsHandler.connect(admin).setAllowlistedFunctions(functionHashList, true);

        // Functions should be enabled
        for (const func of functionHashList) {
          expect(await metaTransactionsHandler["isFunctionAllowlisted(bytes32)"](func)).to.be.true;
        }

        // Disable functions
        await metaTransactionsHandler.connect(admin).setAllowlistedFunctions(functionHashList, false);

        // Functions should be disabled
        for (const func of functionHashList) {
          expect(await metaTransactionsHandler["isFunctionAllowlisted(bytes32)"](func)).to.be.false;
        }
      });
    });

    context("👉 isFunctionAllowlisted(string)", async function () {
      let functionList, functionHashList;
      beforeEach(async function () {
        // A list of random functions
        functionList = [
          "testFunction1(uint256)",
          "testFunction2(uint256)",
          "testFunction3((uint256,address,bool))",
          "testFunction4(uint256[])",
        ];

        functionHashList = functionList.map((func) => keccak256(toUtf8Bytes(func)));

        // Grant UPGRADER role to admin account
        await accessController.grantRole(Role.ADMIN, await admin.getAddress());
      });

      it("after initialization all state modifying functions should be allowlisted", async function () {
        // Get list of state modifying functions
        const stateModifyingFunctions = await getStateModifyingFunctions(facetNames, [
          "executeMetaTransaction(address,string,bytes,uint256,bytes32,bytes32,uint8)",
          "initialize()",
        ]);

        for (const func of stateModifyingFunctions) {
          expect(await metaTransactionsHandler["isFunctionAllowlisted(string)"](func)).to.be.true;
        }
      });

      it("should return correct value", async function () {
        // Functions should be disabled by default
        for (const func of functionList) {
          expect(await metaTransactionsHandler["isFunctionAllowlisted(string)"](func)).to.be.false;
        }

        // Enable functions
        await metaTransactionsHandler.connect(admin).setAllowlistedFunctions(functionHashList, true);

        // Functions should be enabled
        for (const func of functionList) {
          expect(await metaTransactionsHandler["isFunctionAllowlisted(string)"](func)).to.be.true;
        }

        // Disable functions
        await metaTransactionsHandler.connect(admin).setAllowlistedFunctions(functionHashList, false);

        // Functions should be disabled
        for (const func of functionList) {
          expect(await metaTransactionsHandler["isFunctionAllowlisted(string)"](func)).to.be.false;
        }
      });
    });

    context("👉 executeMetaTransaction()", async function () {
      beforeEach(async function () {
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
      });

      afterEach(async function () {
        // Reset the accountId iterator
        accountId.next(true);
      });

      context("👉 AccountHandlerFacet 👉 createSeller()", async function () {
        beforeEach(async function () {
          // Create a valid seller for meta transaction
          seller = mockSeller(
            await assistant.getAddress(),
            await assistant.getAddress(),
            ZeroAddress,
            await assistant.getAddress()
          );
          expect(seller.isValid()).is.true;

          // VoucherInitValues
          voucherInitValues = mockVoucherInitValues();
          expect(voucherInitValues.isValid()).is.true;

          // AuthToken
          emptyAuthToken = mockAuthToken();
          expect(emptyAuthToken.isValid()).is.true;

          // Prepare the message
          message = {};
          message.nonce = parseInt(nonce);
          message.from = await assistant.getAddress();
          message.contractAddress = await accountHandler.getAddress();
          message.functionName =
            "createSeller((uint256,address,address,address,address,bool,string),(uint256,uint8),(string,uint256))";
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
            assistant,
            customTransactionType,
            "MetaTransaction",
            message,
            await metaTransactionsHandler.getAddress()
          );

          // send a meta transaction, check for event
          await expect(
            metaTransactionsHandler
              .connect(deployer)
              .executeMetaTransaction(
                await assistant.getAddress(),
                message.functionName,
                functionSignature,
                nonce,
                r,
                s,
                v
              )
          )
            .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
            .withArgs(await assistant.getAddress(), await deployer.getAddress(), message.functionName, nonce);

          // Verify that nonce is used. Expect true.
          let expectedResult = true;
          result = await metaTransactionsHandler.connect(assistant).isUsedNonce(await assistant.getAddress(), nonce);
          assert.equal(result, expectedResult, "Nonce is unused");
        });

        it("Should build a new domain separator if cachedChainId does not match with chain id used in signature", async function () {
          await upgradeMetaTransactionsHandlerFacet();

          // update the cached chain id
          await mockMetaTransactionsHandler.setCachedChainId(123456);

          // Prepare the function signature for the facet function.
          functionSignature = accountHandler.interface.encodeFunctionData("createSeller", [
            seller,
            emptyAuthToken,
            voucherInitValues,
          ]);

          message.functionSignature = functionSignature;

          // Collect the signature components
          let { r, s, v } = await prepareDataSignatureParameters(
            assistant,
            customTransactionType,
            "MetaTransaction",
            message,
            await metaTransactionsHandler.getAddress()
          );

          // send a meta transaction, does not revert
          await expect(
            metaTransactionsHandler
              .connect(deployer)
              .executeMetaTransaction(
                await assistant.getAddress(),
                message.functionName,
                functionSignature,
                nonce,
                r,
                s,
                v
              )
          )
            .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
            .withArgs(await assistant.getAddress(), await deployer.getAddress(), message.functionName, nonce);

          // Verify that nonce is used. Expect true.
          let expectedResult = true;
          result = await metaTransactionsHandler.connect(assistant).isUsedNonce(await assistant.getAddress(), nonce);
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
            assistant,
            customTransactionType,
            "MetaTransaction",
            message,
            await metaTransactionsHandler.getAddress()
          );

          // send a meta transaction, expecting revert
          await expect(
            metaTransactionsHandler.executeMetaTransaction(
              await assistant.getAddress(),
              message.functionName,
              functionSignature,
              nonce,
              r,
              s,
              v
            )
          ).to.revertedWith(RevertReasons.MUST_BE_ACTIVE);
        });

        it("Should allow different signers to use same nonce", async () => {
          let r, s, v;

          // Prepare the function signature for the facet function.
          functionSignature = accountHandler.interface.encodeFunctionData("createSeller", [
            seller,
            emptyAuthToken,
            voucherInitValues,
          ]);

          message.functionSignature = functionSignature;

          // Collect the signature components
          ({ r, s, v } = await prepareDataSignatureParameters(
            assistant,
            customTransactionType,
            "MetaTransaction",
            message,
            await metaTransactionsHandler.getAddress()
          ));

          // send a meta transaction, check for event
          await expect(
            metaTransactionsHandler
              .connect(deployer)
              .executeMetaTransaction(
                await assistant.getAddress(),
                message.functionName,
                functionSignature,
                nonce,
                r,
                s,
                v
              )
          )
            .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
            .withArgs(await assistant.getAddress(), await deployer.getAddress(), message.functionName, nonce);

          // Verify that nonce is used. Expect true.
          let expectedResult = true;
          result = await metaTransactionsHandler.connect(assistant).isUsedNonce(await assistant.getAddress(), nonce);
          assert.equal(result, expectedResult, "Nonce is unused");

          // send a meta transaction again, check for event
          seller.assistant = await assistantDR.getAddress();
          seller.admin = await adminDR.getAddress();
          seller.clerk = clerkDR.address;
          seller.treasury = await treasuryDR.getAddress();

          message.from = await adminDR.getAddress();

          // Prepare the function signature for the facet function.
          functionSignature = accountHandler.interface.encodeFunctionData("createSeller", [
            seller,
            emptyAuthToken,
            voucherInitValues,
          ]);

          message.functionSignature = functionSignature;

          // Collect the signature components
          ({ r, s, v } = await prepareDataSignatureParameters(
            adminDR,
            customTransactionType,
            "MetaTransaction",
            message,
            await metaTransactionsHandler.getAddress()
          ));

          await expect(
            metaTransactionsHandler
              .connect(rando)
              .executeMetaTransaction(
                await adminDR.getAddress(),
                message.functionName,
                functionSignature,
                nonce,
                r,
                s,
                v
              )
          )
            .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
            .withArgs(await adminDR.getAddress(), await rando.getAddress(), message.functionName, nonce);

          // Verify that nonce is used. Expect true.
          expectedResult = true;
          result = await metaTransactionsHandler
            .connect(assistantDR)
            .isUsedNonce(await assistantDR.getAddress(), nonce);
          assert.equal(result, expectedResult, "Nonce is unused");
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
              assistant,
              customTransactionType,
              "MetaTransaction",
              message,
              await metaTransactionsHandler.getAddress()
            );

            // Pause the metatx region of the protocol
            await pauseHandler.connect(pauser).pause([PausableRegion.MetaTransaction]);

            // Attempt to execute a meta transaction, expecting revert
            await expect(
              metaTransactionsHandler
                .connect(deployer)
                .executeMetaTransaction(
                  await assistant.getAddress(),
                  message.functionName,
                  functionSignature,
                  nonce,
                  r,
                  s,
                  v
                )
            ).to.revertedWith(RevertReasons.REGION_PAUSED);
          });

          it("Should fail when function name is not allowlisted", async function () {
            // Remove function from allowlist
            await metaTransactionsHandler.setAllowlistedFunctions(
              [keccak256(toUtf8Bytes(message.functionName))],
              false
            );

            // Prepare the function signature for the facet function.
            functionSignature = accountHandler.interface.encodeFunctionData("createSeller", [
              seller,
              emptyAuthToken,
              voucherInitValues,
            ]);

            // Prepare the message
            message.functionSignature = functionSignature;

            // Collect the signature components
            let { r, s, v } = await prepareDataSignatureParameters(
              assistant,
              customTransactionType,
              "MetaTransaction",
              message,
              await metaTransactionsHandler.getAddress()
            );

            // Execute meta transaction, expecting revert.
            await expect(
              metaTransactionsHandler.executeMetaTransaction(
                await assistant.getAddress(),
                message.functionName,
                functionSignature,
                nonce,
                r,
                s,
                v
              )
            ).to.revertedWith(RevertReasons.FUNCTION_NOT_ALLOWLISTED);
          });

          it("Should fail when function name is not allowlisted - incorrect name", async function () {
            let incorrectFunctionName = "createSeller"; // function with this name does not exist (argument types are missing)

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
              assistant,
              customTransactionType,
              "MetaTransaction",
              message,
              await metaTransactionsHandler.getAddress()
            );

            // Execute meta transaction, expecting revert.
            await expect(
              metaTransactionsHandler.executeMetaTransaction(
                await assistant.getAddress(),
                message.functionName,
                functionSignature,
                nonce,
                r,
                s,
                v
              )
            ).to.revertedWith(RevertReasons.FUNCTION_NOT_ALLOWLISTED);
          });

          it("Should fail when function name is incorrect", async function () {
            let incorrectFunctionName = "redeemVoucher(uint256)"; // function name is allowlisted, but different than what we encode in next step

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
              assistant,
              customTransactionType,
              "MetaTransaction",
              message,
              await metaTransactionsHandler.getAddress()
            );

            // Execute meta transaction, expecting revert.
            await expect(
              metaTransactionsHandler.executeMetaTransaction(
                await assistant.getAddress(),
                message.functionName,
                functionSignature,
                nonce,
                r,
                s,
                v
              )
            ).to.revertedWith(RevertReasons.INVALID_FUNCTION_NAME);
          });

          it("Should fail when function name is incorrect, even if selector is correct [collision]", async function () {
            // Prepare a function, which selector collide with another funtion selector
            // In this case certain bytes are appended to redeemVoucher so it gets the same selector as cancelVoucher
            const fn = `redeemVoucher(uint256)`;
            const fnBytes = toUtf8Bytes(fn);
            const collisionBytes = "0a7f0f031e";
            const collisionBytesBuffer = Buffer.from(collisionBytes, "hex");
            const fnCollision = Buffer.concat([fnBytes, collisionBytesBuffer]);
            const sigCollision = keccak256(fnCollision).slice(0, 10);

            // Prepare the function signature for the facet function.
            functionSignature = exchangeHandler.interface.encodeFunctionData("cancelVoucher", [1]);

            // Make sure that collision actually exists
            assert.equal(sigCollision, functionSignature.slice(0, 10));

            // Prepare the message
            message.functionName = fnCollision.toString(); // malicious function name
            message.functionSignature = functionSignature; // true function signature

            // Collect the signature components
            let { r, s, v } = await prepareDataSignatureParameters(
              assistant,
              customTransactionType,
              "MetaTransaction",
              message,
              await metaTransactionsHandler.getAddress()
            );

            // Execute meta transaction, expecting revert.
            await expect(
              metaTransactionsHandler.executeMetaTransaction(
                await assistant.getAddress(),
                message.functionName,
                functionSignature,
                nonce,
                r,
                s,
                v
              )
            ).to.revertedWith(RevertReasons.FUNCTION_NOT_ALLOWLISTED);
          });

          it("Should fail when replaying a transaction", async function () {
            // Prepare the function signature for the facet function.
            functionSignature = accountHandler.interface.encodeFunctionData("createSeller", [
              seller,
              emptyAuthToken,
              voucherInitValues,
            ]);

            message.functionSignature = functionSignature;

            // Collect the signature components
            let { r, s, v } = await prepareDataSignatureParameters(
              assistant,
              customTransactionType,
              "MetaTransaction",
              message,
              await metaTransactionsHandler.getAddress()
            );

            // Execute the meta transaction.
            await metaTransactionsHandler.executeMetaTransaction(
              await assistant.getAddress(),
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
                await assistant.getAddress(),
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
            message.from = await rando.getAddress();
            message.functionSignature = functionSignature;

            // Collect the signature components
            let { r, s, v } = await prepareDataSignatureParameters(
              rando, // Different user, not assistant.
              customTransactionType,
              "MetaTransaction",
              message,
              await metaTransactionsHandler.getAddress()
            );

            // Execute meta transaction, expecting revert.
            await expect(
              metaTransactionsHandler.executeMetaTransaction(
                await assistant.getAddress(),
                message.functionName,
                functionSignature,
                nonce,
                r,
                s,
                v
              )
            ).to.revertedWith(RevertReasons.SIGNER_AND_SIGNATURE_DO_NOT_MATCH);
          });

          it("Should fail if signature is invalid", async function () {
            // Prepare the function signature for the facet function.
            functionSignature = accountHandler.interface.encodeFunctionData("createSeller", [
              seller,
              emptyAuthToken,
              voucherInitValues,
            ]);

            // Prepare the message
            message.functionSignature = functionSignature;

            // Collect the signature components
            let { r, s, v } = await prepareDataSignatureParameters(
              assistant,
              customTransactionType,
              "MetaTransaction",
              message,
              await metaTransactionsHandler.getAddress()
            );

            // Execute meta transaction, expecting revert.
            await expect(
              metaTransactionsHandler.executeMetaTransaction(
                await assistant.getAddress(),
                message.functionName,
                functionSignature,
                nonce,
                r,
                s,
                "0" // invalid v signature component
              )
            ).to.revertedWith(RevertReasons.INVALID_SIGNATURE);

            // Execute meta transaction, expecting revert.
            await expect(
              metaTransactionsHandler.executeMetaTransaction(
                await assistant.getAddress(),
                message.functionName,
                functionSignature,
                nonce,
                r,
                MaxUint256, // invalid s signature component
                v
              )
            ).to.revertedWith(RevertReasons.INVALID_SIGNATURE);

            // Execute meta transaction, expecting revert.
            await expect(
              metaTransactionsHandler.executeMetaTransaction(
                await assistant.getAddress(),
                message.functionName,
                functionSignature,
                nonce,
                r,
                zeroPadBytes("0x", 32), // invalid s signature component
                v
              )
            ).to.revertedWith(RevertReasons.INVALID_SIGNATURE);

            // Execute meta transaction, expecting revert.
            await expect(
              metaTransactionsHandler.executeMetaTransaction(
                await assistant.getAddress(),
                message.functionName,
                functionSignature,
                nonce,
                zeroPadBytes("0x", 32), // invalid r signature component
                s,
                v
              )
            ).to.revertedWith(RevertReasons.INVALID_SIGNATURE);
          });
        });
      });

      context("👉TwinHandler 👉 removeTwin()", async function () {
        beforeEach(async function () {
          // Create a valid seller for meta transaction
          seller = mockSeller(
            await assistant.getAddress(),
            await assistant.getAddress(),
            ZeroAddress,
            await assistant.getAddress()
          );
          expect(seller.isValid()).is.true;

          // VoucherInitValues
          voucherInitValues = mockVoucherInitValues();
          expect(voucherInitValues.isValid()).is.true;

          // AuthToken
          emptyAuthToken = mockAuthToken();
          expect(emptyAuthToken.isValid()).is.true;

          await accountHandler.connect(assistant).createSeller(seller, emptyAuthToken, voucherInitValues);

          // Create a valid twin, then set fields in tests directly
          twin = mockTwin(await bosonToken.getAddress());
          twin.id = "1";
          twin.sellerId = "1";
          expect(twin.isValid()).is.true;

          // Approving the twinHandler contract to transfer seller's tokens
          await bosonToken.connect(assistant).approve(await twinHandler.getAddress(), 1);

          // Create a twin
          await twinHandler.connect(assistant).createTwin(twin);

          // Prepare the message
          message = {};
          message.nonce = parseInt(nonce);
          message.from = await assistant.getAddress();
          message.contractAddress = await twinHandler.getAddress();
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
            assistant,
            customTransactionType,
            "MetaTransaction",
            message,
            await metaTransactionsHandler.getAddress()
          );

          // Remove the twin. Send as meta transaction.
          await metaTransactionsHandler.executeMetaTransaction(
            await assistant.getAddress(),
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

      context("💔 Revert Reasons", async function () {
        beforeEach(async function () {
          // Prepare the message
          message = {};
          message.nonce = parseInt(nonce);
          message.from = await assistant.getAddress();
          message.contractAddress = await metaTransactionsHandler.getAddress();
        });

        it("Should fail when try to call executeMetaTransaction method itself", async function () {
          // Function signature for executeMetaTransaction function.
          functionSignature = metaTransactionsHandler.interface.encodeFunctionData("executeMetaTransaction", [
            await assistant.getAddress(),
            "executeMetaTransaction",
            ZeroHash, // hash of zero
            nonce,
            randomBytes(32), // random bytes32
            randomBytes(32), // random bytes32
            parseInt(randomBytes(8)), // random uint8
          ]);

          // Prepare the message
          message.contractAddress = await metaTransactionsHandler.getAddress();
          message.functionName = "executeMetaTransaction(address,string,bytes,uint256,bytes32,bytes32,uint8)";
          message.functionSignature = functionSignature;

          // Collect the signature components
          let { r, s, v } = await prepareDataSignatureParameters(
            assistant,
            customTransactionType,
            "MetaTransaction",
            message,
            await metaTransactionsHandler.getAddress()
          );

          // send a meta transaction, expecting revert
          await expect(
            metaTransactionsHandler.executeMetaTransaction(
              await assistant.getAddress(),
              message.functionName,
              functionSignature,
              nonce,
              r,
              s,
              v
            )
          ).to.revertedWith(RevertReasons.FUNCTION_NOT_ALLOWLISTED);
        });

        it("Returns default revert reason if called function reverts without a reason", async function () {
          // Create a valid seller for meta transaction
          seller = mockSeller(
            await assistant.getAddress(),
            await assistant.getAddress(),
            ZeroAddress,
            await assistant.getAddress()
          );
          voucherInitValues = mockVoucherInitValues();
          emptyAuthToken = mockAuthToken();
          await accountHandler.connect(assistant).createSeller(seller, emptyAuthToken, voucherInitValues);

          // Depositing funds, where token address is not a contract address reverts without a reason.
          functionSignature = fundsHandler.interface.encodeFunctionData("depositFunds", [
            seller.id,
            await rando.getAddress(),
            "10",
          ]);

          // Prepare the message
          message.functionName = "depositFunds(uint256,address,uint256)";
          message.functionSignature = functionSignature;

          // Collect the signature components
          let { r, s, v } = await prepareDataSignatureParameters(
            assistant,
            customTransactionType,
            "MetaTransaction",
            message,
            await metaTransactionsHandler.getAddress()
          );

          // send a meta transaction, expecting revert
          await expect(
            metaTransactionsHandler.executeMetaTransaction(
              await assistant.getAddress(),
              message.functionName,
              functionSignature,
              nonce,
              r,
              s,
              v
            )
          ).to.revertedWith(RevertReasons.FUNCTION_CALL_NOT_SUCCESSFUL);
        });

        context("Reentrancy guard", async function () {
          beforeEach(async function () {
            // Create a valid seller for meta transaction
            seller = mockSeller(
              await assistant.getAddress(),
              await assistant.getAddress(),
              ZeroAddress,
              await assistant.getAddress()
            );
            expect(seller.isValid()).is.true;

            // VoucherInitValues
            voucherInitValues = mockVoucherInitValues();
            expect(voucherInitValues.isValid()).is.true;

            // AuthToken
            emptyAuthToken = mockAuthToken();
            expect(emptyAuthToken.isValid()).is.true;

            // Create a valid seller
            await accountHandler.connect(assistant).createSeller(seller, emptyAuthToken, voucherInitValues);
          });

          it("Should fail on reenter", async function () {
            // Deploy malicious contracts
            const [maliciousToken] = await deployMockTokens(["Foreign20Malicious"]);
            await maliciousToken.setProtocolAddress(protocolDiamondAddress);

            // Initial ids for all the things
            exchangeId = "1";

            // Create a valid dispute resolver
            disputeResolver = mockDisputeResolver(
              await assistantDR.getAddress(),
              await adminDR.getAddress(),
              clerkDR.address,
              await treasuryDR.getAddress(),
              true
            );
            expect(disputeResolver.isValid()).is.true;

            buyerId = accountId.next().value;

            //Create DisputeResolverFee array so offer creation will succeed
            disputeResolverFees = [new DisputeResolverFee(await maliciousToken.getAddress(), "maliciousToken", "0")];

            // Make empty seller list, so every seller is allowed
            sellerAllowList = [];

            // Register the dispute resolver
            await accountHandler
              .connect(adminDR)
              .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

            const { offer, ...mo } = await mockOffer();
            ({ offerDates, offerDurations } = mo);
            offerToken = offer;
            offerToken.exchangeToken = await maliciousToken.getAddress();

            price = offer.price;
            sellerDeposit = offer.sellerDeposit;

            // Check if domains are valid
            expect(offerToken.isValid()).is.true;
            expect(offerDates.isValid()).is.true;
            expect(offerDurations.isValid()).is.true;

            // Create the offer
            await offerHandler
              .connect(assistant)
              .createOffer(offerToken, offerDates, offerDurations, disputeResolver.id, agentId);

            // top up seller's and buyer's account
            await maliciousToken.mint(await assistant.getAddress(), sellerDeposit);
            await maliciousToken.mint(await buyer.getAddress(), price);

            // Approve protocol to transfer the tokens
            await maliciousToken.connect(assistant).approve(protocolDiamondAddress, sellerDeposit);
            await maliciousToken.connect(buyer).approve(protocolDiamondAddress, price);

            // Deposit to seller's pool
            await fundsHandler
              .connect(assistant)
              .depositFunds(seller.id, await maliciousToken.getAddress(), sellerDeposit);

            // Commit to the offer
            await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerToken.id);

            // Cancel the voucher, so both seller and buyer have something to withdraw
            await exchangeHandler.connect(buyer).cancelVoucher(exchangeId); // canceling the voucher in tokens

            // Expected payoffs - they are the same for token and native currency
            // Buyer: price - buyerCancelPenalty
            buyerPayoff = BigInt(offerToken.price) - offerToken.buyerCancelPenalty.toString();

            // Prepare validFundDetails
            tokenListBuyer = [await maliciousToken.getAddress()];
            tokenAmountsBuyer = [buyerPayoff];
            validFundDetails = {
              entityId: buyerId,
              tokenList: tokenListBuyer,
              tokenAmounts: tokenAmountsBuyer,
            };

            // Prepare the message
            message = {};
            message.nonce = parseInt(nonce);
            message.contractAddress = await fundsHandler.getAddress();
            message.functionName = "withdrawFunds(uint256,address[],uint256[])";
            message.fundDetails = validFundDetails;
            message.from = await buyer.getAddress();

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
              await metaTransactionsHandler.getAddress()
            );

            let [, buyerStruct] = await accountHandler.getBuyer(buyerId);
            const buyerBefore = Buyer.fromStruct(buyerStruct);

            // Execute the meta transaction.
            await expect(
              metaTransactionsHandler.executeMetaTransaction(
                await buyer.getAddress(),
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
            const [maliciousToken] = await deployMockTokens(["Foreign20Malicious2"]);
            await maliciousToken.setProtocolAddress(protocolDiamondAddress);

            // Mint and approve protocol to transfer the tokens
            await maliciousToken.mint(await rando.getAddress(), "1");
            await maliciousToken.connect(rando).approve(protocolDiamondAddress, "1");

            // Just make a random metaTx signature to some view function that will delete "currentSender"
            // Prepare the function signature for the facet function.
            functionSignature = exchangeHandler.interface.encodeFunctionData("getNextExchangeId");

            // Prepare the message
            message.nonce = "0";
            message.from = await rando.getAddress();
            message.contractAddress = await accountHandler.getAddress();
            message.functionName = "getNextExchangeId()";
            message.functionSignature = functionSignature;

            // Collect the signature components
            let { r, s, v } = await prepareDataSignatureParameters(
              rando,
              customTransactionType,
              "MetaTransaction",
              message,
              await metaTransactionsHandler.getAddress()
            );

            await maliciousToken.setMetaTxBytes(await rando.getAddress(), functionSignature, r, s, v);

            // Prepare the function signature for the facet function.
            functionSignature = fundsHandler.interface.encodeFunctionData("depositFunds", [
              seller.id,
              await maliciousToken.getAddress(),
              "1",
            ]);

            // Prepare the message
            message.nonce = nonce;
            message.from = await rando.getAddress();
            message.contractAddress = await accountHandler.getAddress();
            message.functionName = "depositFunds(uint256,address,uint256)";
            message.functionSignature = functionSignature;

            // Collect the signature components
            ({ r, s, v } = await prepareDataSignatureParameters(
              rando,
              customTransactionType,
              "MetaTransaction",
              message,
              await metaTransactionsHandler.getAddress()
            ));

            // send a meta transaction, expect revert
            await expect(
              metaTransactionsHandler
                .connect(deployer)
                .executeMetaTransaction(
                  await rando.getAddress(),
                  message.functionName,
                  functionSignature,
                  nonce,
                  r,
                  s,
                  v
                )
            ).to.revertedWith(RevertReasons.REENTRANCY_GUARD);
          });
        });
      });

      context("👉 ExchangeHandlerFacet", async function () {
        beforeEach(async function () {
          offerId = "1";

          // Create a valid seller
          seller = mockSeller(
            await assistant.getAddress(),
            await assistant.getAddress(),
            ZeroAddress,
            await assistant.getAddress()
          );
          expect(seller.isValid()).is.true;

          // VoucherInitValues
          voucherInitValues = mockVoucherInitValues();
          expect(voucherInitValues.isValid()).is.true;

          // AuthToken
          emptyAuthToken = mockAuthToken();
          expect(emptyAuthToken.isValid()).is.true;
          await accountHandler.connect(assistant).createSeller(seller, emptyAuthToken, voucherInitValues);

          // Create a valid dispute resolver
          disputeResolver = mockDisputeResolver(
            await assistantDR.getAddress(),
            await adminDR.getAddress(),
            clerkDR.address,
            await treasuryDR.getAddress(),
            true
          );
          expect(disputeResolver.isValid()).is.true;

          //Create DisputeResolverFee array so offer creation will succeed
          disputeResolverFees = [
            new DisputeResolverFee(ZeroAddress, "Native", "0"),
            new DisputeResolverFee(await mockToken.getAddress(), "BosonToken", "0"),
          ];

          // Make empty seller list, so every seller is allowed
          sellerAllowList = [];

          // Register the dispute resolver
          await accountHandler
            .connect(adminDR)
            .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

          buyerId = accountId.next().value;

          // Create the offer
          ({ offer, offerDates, offerDurations } = await mockOffer());
          expect(offer.isValid()).is.true;
          expect(offerDates.isValid()).is.true;
          expect(offerDurations.isValid()).is.true;

          sellerDeposit = offer.sellerDeposit;
          price = offer.price;
          voucherRedeemableFrom = offerDates.voucherRedeemableFrom;

          // Set the message Type
          metaTransactionType = [
            { name: "nonce", type: "uint256" },
            { name: "from", type: "address" },
            { name: "contractAddress", type: "address" },
            { name: "functionName", type: "string" },
          ];

          // Prepare the message
          message = {};
          message.nonce = parseInt(nonce);
          message.contractAddress = await exchangeHandler.getAddress();
          message.from = await buyer.getAddress();
          message.functionName = "commitToOffer(address,uint256)";

          // Deposit native currency to the same seller id
          await fundsHandler
            .connect(rando)
            .depositFunds(seller.id, ZeroAddress, sellerDeposit, { value: sellerDeposit });
        });

        afterEach(async function () {
          // Reset the accountId iterator
          accountId.next(true);
        });

        context("👉 ExchangeHandlerFacet 👉 commitToOffer()", async function () {
          beforeEach(async function () {
            offer.exchangeToken = await mockToken.getAddress();

            // Check if domains are valid
            expect(offer.isValid()).is.true;
            expect(offerDates.isValid()).is.true;
            expect(offerDurations.isValid()).is.true;

            // top up seller's and buyer's account
            await mockToken.mint(await assistant.getAddress(), sellerDeposit);
            await mockToken.mint(await buyer.getAddress(), price);

            // approve protocol to transfer the tokens
            await mockToken.connect(assistant).approve(protocolDiamondAddress, sellerDeposit);
            await mockToken.connect(buyer).approve(protocolDiamondAddress, price);

            // deposit to seller's pool
            await fundsHandler.connect(assistant).depositFunds(seller.id, await mockToken.getAddress(), sellerDeposit);

            // Create the offer
            await offerHandler
              .connect(assistant)
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
            ];

            metaTransactionType.push({ name: "offerDetails", type: "MetaTxOfferDetails" });

            customTransactionType = {
              MetaTxCommitToOffer: metaTransactionType,
              MetaTxOfferDetails: offerType,
            };

            // prepare validOfferDetails
            validOfferDetails = {
              buyer: await buyer.getAddress(),
              offerId: offer.id,
            };

            // Prepare the message
            message.offerDetails = validOfferDetails;

            // Deposit native currency to the same seller id
            await fundsHandler
              .connect(rando)
              .depositFunds(seller.id, ZeroAddress, sellerDeposit, { value: sellerDeposit });
          });

          it("Should emit MetaTransactionExecuted event and update state", async () => {
            // Collect the signature components
            let { r, s, v } = await prepareDataSignatureParameters(
              buyer,
              customTransactionType,
              "MetaTxCommitToOffer",
              message,
              await metaTransactionsHandler.getAddress()
            );

            // Prepare the function signature
            functionSignature = exchangeHandler.interface.encodeFunctionData(
              "commitToOffer",
              Object.values(validOfferDetails)
            );

            // Expect that buyer has token balance matching the offer price.
            const buyerBalanceBefore = await mockToken.balanceOf(await buyer.getAddress());
            assert.equal(buyerBalanceBefore, price, "Buyer initial token balance mismatch");

            // send a meta transaction, check for event
            await expect(
              metaTransactionsHandler.executeMetaTransaction(
                await buyer.getAddress(),
                message.functionName,
                functionSignature,
                nonce,
                r,
                s,
                v
              )
            )
              .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
              .withArgs(await buyer.getAddress(), await deployer.getAddress(), message.functionName, nonce);

            // Expect that buyer (meta tx signer) has paid the tokens to commit to an offer.
            const buyerBalanceAfter = await mockToken.balanceOf(await buyer.getAddress());
            assert.equal(buyerBalanceAfter, "0", "Buyer final token balance mismatch");

            // Verify that nonce is used. Expect true.
            let expectedResult = true;
            result = await metaTransactionsHandler.connect(buyer).isUsedNonce(await buyer.getAddress(), nonce);
            assert.equal(result, expectedResult, "Nonce is unused");
          });

          it("does not modify revert reasons", async function () {
            // An invalid offer id
            offerId = "666";

            // prepare validOfferDetails
            validOfferDetails.offerId = offerId;

            // Prepare the message
            message.offerDetails = validOfferDetails;

            // Collect the signature components
            let { r, s, v } = await prepareDataSignatureParameters(
              buyer,
              customTransactionType,
              "MetaTxCommitToOffer",
              message,
              await metaTransactionsHandler.getAddress()
            );

            // Prepare the function signature
            functionSignature = exchangeHandler.interface.encodeFunctionData(
              "commitToOffer",
              Object.values(validOfferDetails)
            );

            // Execute meta transaction, expecting revert.
            await expect(
              metaTransactionsHandler.executeMetaTransaction(
                await buyer.getAddress(),
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
              functionSignature = exchangeHandler.interface.encodeFunctionData(
                "commitToOffer",
                Object.values(validOfferDetails)
              );
            });

            it("Should fail when replay transaction", async function () {
              // Collect the signature components
              let { r, s, v } = await prepareDataSignatureParameters(
                buyer,
                customTransactionType,
                "MetaTxCommitToOffer",
                message,
                await metaTransactionsHandler.getAddress()
              );

              // Execute the meta transaction.
              await metaTransactionsHandler.executeMetaTransaction(
                await buyer.getAddress(),
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
                  await buyer.getAddress(),
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
              message.from = await rando.getAddress();

              // Collect the signature components
              let { r, s, v } = await prepareDataSignatureParameters(
                rando, // Different user, not buyer.
                customTransactionType,
                "MetaTxCommitToOffer",
                message,
                await metaTransactionsHandler.getAddress()
              );

              // Execute meta transaction, expecting revert.
              await expect(
                metaTransactionsHandler.executeMetaTransaction(
                  await buyer.getAddress(),
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

        context("👉 MetaTxExchange", async function () {
          beforeEach(async function () {
            await offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId);

            // Required exchange constructor params
            exchange = mockExchange({ buyerId, finalizedDate: "0" });

            // Set the exchange Type
            exchangeType = [{ name: "exchangeId", type: "uint256" }];

            metaTransactionType.push({ name: "exchangeDetails", type: "MetaTxExchangeDetails" });

            customTransactionType = {
              MetaTxExchange: metaTransactionType,
              MetaTxExchangeDetails: exchangeType,
            };

            // prepare validExchangeDetails
            validExchangeDetails = {
              exchangeId: exchange.id,
            };

            message.exchangeDetails = validExchangeDetails;

            // Commit to offer
            await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerId, { value: price });
          });

          context("👉 ExchangeHandlerFacet 👉 cancelVoucher()", async function () {
            beforeEach(async function () {
              // Prepare the message
              message.functionName = "cancelVoucher(uint256)";
            });

            it("Should emit MetaTransactionExecuted event and update state", async () => {
              // Collect the signature components
              let { r, s, v } = await prepareDataSignatureParameters(
                buyer,
                customTransactionType,
                "MetaTxExchange",
                message,
                await metaTransactionsHandler.getAddress()
              );

              // Prepare the function signature
              functionSignature = exchangeHandler.interface.encodeFunctionData("cancelVoucher", [
                validExchangeDetails.exchangeId,
              ]);

              // send a meta transaction, check for event
              await expect(
                metaTransactionsHandler.executeMetaTransaction(
                  await buyer.getAddress(),
                  message.functionName,
                  functionSignature,
                  nonce,
                  r,
                  s,
                  v
                )
              )
                .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
                .withArgs(await buyer.getAddress(), await deployer.getAddress(), message.functionName, nonce);

              // Verify that nonce is used. Expect true.
              let expectedResult = true;
              result = await metaTransactionsHandler.connect(buyer).isUsedNonce(await buyer.getAddress(), nonce);
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
                await metaTransactionsHandler.getAddress()
              );

              // Prepare the function signature
              functionSignature = exchangeHandler.interface.encodeFunctionData("cancelVoucher", [
                validExchangeDetails.exchangeId,
              ]);

              // Execute meta transaction, expecting revert.
              await expect(
                metaTransactionsHandler.executeMetaTransaction(
                  await buyer.getAddress(),
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
                  await metaTransactionsHandler.getAddress()
                );

                // Execute the meta transaction.
                await metaTransactionsHandler.executeMetaTransaction(
                  await buyer.getAddress(),
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
                    await buyer.getAddress(),
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
                message.from = await rando.getAddress();

                // Collect the signature components
                let { r, s, v } = await prepareDataSignatureParameters(
                  rando, // Different user, not buyer.
                  customTransactionType,
                  "MetaTxExchange",
                  message,
                  await metaTransactionsHandler.getAddress()
                );

                // Execute meta transaction, expecting revert.
                await expect(
                  metaTransactionsHandler.executeMetaTransaction(
                    await buyer.getAddress(),
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
                await metaTransactionsHandler.getAddress()
              );

              // Prepare the function signature
              functionSignature = exchangeHandler.interface.encodeFunctionData("redeemVoucher", [
                validExchangeDetails.exchangeId,
              ]);

              // send a meta transaction, check for event
              await expect(
                metaTransactionsHandler.executeMetaTransaction(
                  await buyer.getAddress(),
                  message.functionName,
                  functionSignature,
                  nonce,
                  r,
                  s,
                  v
                )
              )
                .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
                .withArgs(await buyer.getAddress(), await deployer.getAddress(), message.functionName, nonce);

              // Verify that nonce is used. Expect true.
              let expectedResult = true;
              result = await metaTransactionsHandler.connect(buyer).isUsedNonce(await buyer.getAddress(), nonce);
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
                await metaTransactionsHandler.getAddress()
              );

              // Prepare the function signature
              functionSignature = exchangeHandler.interface.encodeFunctionData("redeemVoucher", [
                validExchangeDetails.exchangeId,
              ]);

              // Execute meta transaction, expecting revert.
              await expect(
                metaTransactionsHandler.executeMetaTransaction(
                  await buyer.getAddress(),
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
                  await metaTransactionsHandler.getAddress()
                );

                // Execute the meta transaction.
                await metaTransactionsHandler.executeMetaTransaction(
                  await buyer.getAddress(),
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
                    await buyer.getAddress(),
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
                message.from = await rando.getAddress();

                // Collect the signature components
                let { r, s, v } = await prepareDataSignatureParameters(
                  rando, // Different user, not buyer.
                  customTransactionType,
                  "MetaTxExchange",
                  message,
                  await metaTransactionsHandler.getAddress()
                );

                // Execute meta transaction, expecting revert.
                await expect(
                  metaTransactionsHandler.executeMetaTransaction(
                    await buyer.getAddress(),
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
                await metaTransactionsHandler.getAddress()
              );

              // Prepare the function signature
              functionSignature = exchangeHandler.interface.encodeFunctionData("completeExchange", [
                validExchangeDetails.exchangeId,
              ]);

              // send a meta transaction, check for event
              await expect(
                metaTransactionsHandler.executeMetaTransaction(
                  await buyer.getAddress(),
                  message.functionName,
                  functionSignature,
                  nonce,
                  r,
                  s,
                  v
                )
              )
                .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
                .withArgs(await buyer.getAddress(), await deployer.getAddress(), message.functionName, nonce);

              // Get the exchange state
              let response;
              [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);
              // It should match ExchangeState.Completed
              assert.equal(response, ExchangeState.Completed, "Exchange state is incorrect");

              // Verify that nonce is used. Expect true.
              let expectedResult = true;
              result = await metaTransactionsHandler.connect(buyer).isUsedNonce(await buyer.getAddress(), nonce);
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
                await metaTransactionsHandler.getAddress()
              );

              // Prepare the function signature
              functionSignature = exchangeHandler.interface.encodeFunctionData("completeExchange", [
                validExchangeDetails.exchangeId,
              ]);

              // Execute meta transaction, expecting revert.
              await expect(
                metaTransactionsHandler.executeMetaTransaction(
                  await buyer.getAddress(),
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
                  await metaTransactionsHandler.getAddress()
                );

                // Execute the meta transaction.
                await metaTransactionsHandler.executeMetaTransaction(
                  await buyer.getAddress(),
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
                    await buyer.getAddress(),
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
                message.from = await rando.getAddress();

                // Collect the signature components
                let { r, s, v } = await prepareDataSignatureParameters(
                  rando, // Different user, not buyer.
                  customTransactionType,
                  "MetaTxExchange",
                  message,
                  await metaTransactionsHandler.getAddress()
                );

                // Execute meta transaction, expecting revert.
                await expect(
                  metaTransactionsHandler.executeMetaTransaction(
                    await buyer.getAddress(),
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
                await metaTransactionsHandler.getAddress()
              );

              // Prepare the function signature
              functionSignature = disputeHandler.interface.encodeFunctionData("retractDispute", [
                validExchangeDetails.exchangeId,
              ]);

              // send a meta transaction, check for event
              await expect(
                metaTransactionsHandler.executeMetaTransaction(
                  await buyer.getAddress(),
                  message.functionName,
                  functionSignature,
                  nonce,
                  r,
                  s,
                  v
                )
              )
                .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
                .withArgs(await buyer.getAddress(), await deployer.getAddress(), message.functionName, nonce);

              // Get the dispute state
              let response;
              [, response] = await disputeHandler.connect(rando).getDisputeState(exchange.id);
              // It should match DisputeState.Retracted
              assert.equal(response, DisputeState.Retracted, "Dispute state is incorrect");

              // Verify that nonce is used. Expect true.
              let expectedResult = true;
              result = await metaTransactionsHandler.connect(buyer).isUsedNonce(await buyer.getAddress(), nonce);
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
                await metaTransactionsHandler.getAddress()
              );

              // Prepare the function signature
              functionSignature = disputeHandler.interface.encodeFunctionData("retractDispute", [
                validExchangeDetails.exchangeId,
              ]);

              // Execute meta transaction, expecting revert.
              await expect(
                metaTransactionsHandler.executeMetaTransaction(
                  await buyer.getAddress(),
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
                  await metaTransactionsHandler.getAddress()
                );

                // Execute the meta transaction.
                await metaTransactionsHandler.executeMetaTransaction(
                  await buyer.getAddress(),
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
                    await buyer.getAddress(),
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
                message.from = await rando.getAddress();

                // Collect the signature components
                let { r, s, v } = await prepareDataSignatureParameters(
                  rando, // Different user, not buyer.
                  customTransactionType,
                  "MetaTxExchange",
                  message,
                  await metaTransactionsHandler.getAddress()
                );

                // Execute meta transaction, expecting revert.
                await expect(
                  metaTransactionsHandler.executeMetaTransaction(
                    await buyer.getAddress(),
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
              message.from = await buyer.getAddress();

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
                await metaTransactionsHandler.getAddress()
              );

              // Prepare the function signature
              functionSignature = disputeHandler.interface.encodeFunctionData("raiseDispute", [
                validExchangeDetails.exchangeId,
              ]);

              // send a meta transaction, check for event
              await expect(
                metaTransactionsHandler.executeMetaTransaction(
                  await buyer.getAddress(),
                  message.functionName,
                  functionSignature,
                  nonce,
                  r,
                  s,
                  v
                )
              )
                .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
                .withArgs(await buyer.getAddress(), await deployer.getAddress(), message.functionName, nonce);

              // Get the exchange state
              let response;
              [, response] = await exchangeHandler.connect(rando).getExchangeState(exchange.id);
              // It should match ExchangeState.Disputed
              assert.equal(response, ExchangeState.Disputed, "Exchange state is incorrect");

              // Verify that nonce is used. Expect true.
              let expectedResult = true;
              result = await metaTransactionsHandler.connect(buyer).isUsedNonce(await buyer.getAddress(), nonce);
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
                await metaTransactionsHandler.getAddress()
              );

              // Prepare the function signature
              functionSignature = disputeHandler.interface.encodeFunctionData("raiseDispute", [
                validExchangeDetails.exchangeId,
              ]);

              // Execute meta transaction, expecting revert.
              await expect(
                metaTransactionsHandler.executeMetaTransaction(
                  await buyer.getAddress(),
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
                  await metaTransactionsHandler.getAddress()
                );

                // Execute the meta transaction.
                await metaTransactionsHandler.executeMetaTransaction(
                  await buyer.getAddress(),
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
                    await buyer.getAddress(),
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
                message.from = await rando.getAddress();

                // Collect the signature components
                let { r, s, v } = await prepareDataSignatureParameters(
                  rando, // Different user, not buyer.
                  customTransactionType,
                  "MetaTxExchange",
                  message,
                  await metaTransactionsHandler.getAddress()
                );

                // Execute meta transaction, expecting revert.
                await expect(
                  metaTransactionsHandler.executeMetaTransaction(
                    await buyer.getAddress(),
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
                await metaTransactionsHandler.getAddress()
              );

              // Prepare the function signature
              functionSignature = disputeHandler.interface.encodeFunctionData("escalateDispute", [
                validExchangeDetails.exchangeId,
              ]);

              // send a meta transaction, check for event
              await expect(
                metaTransactionsHandler.executeMetaTransaction(
                  await buyer.getAddress(),
                  message.functionName,
                  functionSignature,
                  nonce,
                  r,
                  s,
                  v
                )
              )
                .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
                .withArgs(await buyer.getAddress(), await deployer.getAddress(), message.functionName, nonce);

              // Get the dispute state
              let response;
              [, response] = await disputeHandler.connect(rando).getDisputeState(exchange.id);
              // It should match DisputeState.Escalated
              assert.equal(response, DisputeState.Escalated, "Dispute state is incorrect");

              // Verify that nonce is used. Expect true.
              let expectedResult = true;
              result = await metaTransactionsHandler.connect(buyer).isUsedNonce(await buyer.getAddress(), nonce);
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
                await metaTransactionsHandler.getAddress()
              );

              // Prepare the function signature
              functionSignature = disputeHandler.interface.encodeFunctionData("escalateDispute", [
                validExchangeDetails.exchangeId,
              ]);

              // Execute meta transaction, expecting revert.
              await expect(
                metaTransactionsHandler.executeMetaTransaction(
                  await buyer.getAddress(),
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
                  await metaTransactionsHandler.getAddress()
                );

                // Execute the meta transaction.
                await metaTransactionsHandler.executeMetaTransaction(
                  await buyer.getAddress(),
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
                    await buyer.getAddress(),
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
                message.from = await rando.getAddress();

                // Collect the signature components
                let { r, s, v } = await prepareDataSignatureParameters(
                  rando, // Different user, not buyer.
                  customTransactionType,
                  "MetaTxExchange",
                  message,
                  await metaTransactionsHandler.getAddress()
                );

                // Execute meta transaction, expecting revert.
                await expect(
                  metaTransactionsHandler.executeMetaTransaction(
                    await buyer.getAddress(),
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

              buyerPercentBasisPoints = "1234";

              // Set the message Type, needed for signature
              let resolutionType = [
                { name: "exchangeId", type: "uint256" },
                { name: "buyerPercentBasisPoints", type: "uint256" },
              ];

              let customSignatureType2 = {
                Resolution: resolutionType,
              };

              let message2 = {
                exchangeId: exchange.id,
                buyerPercentBasisPoints,
              };

              // Collect the signature components
              signatureSplits = await prepareDataSignatureParameters(
                assistant, // When buyer is the caller, seller should be the signer.
                customSignatureType2,
                "Resolution",
                message2,
                await disputeHandler.getAddress()
              );

              // prepare validDisputeResolutionDetails
              validDisputeResolutionDetails = {
                exchangeId: exchange.id,
                buyerPercentBasisPoints,
                sigR: signatureSplits.r,
                sigS: signatureSplits.s,
                sigV: signatureSplits.v.toString(),
              };

              // Set the Dispute Resolution Type
              let disputeResolutionType = [
                { name: "exchangeId", type: "uint256" },
                { name: "buyerPercentBasisPoints", type: "uint256" },
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
              message.from = await buyer.getAddress();
            });

            it("Should emit MetaTransactionExecuted event and update state", async () => {
              // Collect the signature components
              let { r, s, v } = await prepareDataSignatureParameters(
                buyer,
                customTransactionType,
                "MetaTxDisputeResolution",
                message,
                await metaTransactionsHandler.getAddress()
              );

              // Prepare the function signature
              functionSignature = disputeHandler.interface.encodeFunctionData("resolveDispute", [
                validDisputeResolutionDetails.exchangeId,
                validDisputeResolutionDetails.buyerPercentBasisPoints,
                validDisputeResolutionDetails.sigR,
                validDisputeResolutionDetails.sigS,
                validDisputeResolutionDetails.sigV,
              ]);

              // send a meta transaction, check for event
              await expect(
                metaTransactionsHandler.executeMetaTransaction(
                  await buyer.getAddress(),
                  message.functionName,
                  functionSignature,
                  nonce,
                  r,
                  s,
                  v
                )
              )
                .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
                .withArgs(await buyer.getAddress(), await deployer.getAddress(), message.functionName, nonce);

              // Get the dispute state
              let response;
              [, response] = await disputeHandler.connect(rando).getDisputeState(exchange.id);
              // It should match DisputeState.Resolved
              assert.equal(response, DisputeState.Resolved, "Dispute state is incorrect");

              // Verify that nonce is used. Expect true.
              let expectedResult = true;
              result = await metaTransactionsHandler.connect(buyer).isUsedNonce(await buyer.getAddress(), nonce);
              assert.equal(result, expectedResult, "Nonce is unused");
            });

            it("does not modify revert reasons", async function () {
              // Set buyer percent above 100%
              buyerPercentBasisPoints = "12000"; // 120%

              // prepare validDisputeResolutionDetails
              validDisputeResolutionDetails = {
                exchangeId: exchange.id,
                buyerPercentBasisPoints,
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
                await metaTransactionsHandler.getAddress()
              );

              // Prepare the function signature
              functionSignature = disputeHandler.interface.encodeFunctionData("resolveDispute", [
                validDisputeResolutionDetails.exchangeId,
                validDisputeResolutionDetails.buyerPercentBasisPoints,
                validDisputeResolutionDetails.sigR,
                validDisputeResolutionDetails.sigS,
                validDisputeResolutionDetails.sigV,
              ]);

              // Execute meta transaction, expecting revert.
              await expect(
                metaTransactionsHandler.executeMetaTransaction(
                  await buyer.getAddress(),
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
                  validDisputeResolutionDetails.buyerPercentBasisPoints,
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
                  await metaTransactionsHandler.getAddress()
                );

                // Execute the meta transaction.
                await metaTransactionsHandler.executeMetaTransaction(
                  await buyer.getAddress(),
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
                    await buyer.getAddress(),
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
                message.from = await rando.getAddress();

                // Collect the signature components
                let { r, s, v } = await prepareDataSignatureParameters(
                  rando, // Different user, not buyer.
                  customTransactionType,
                  "MetaTxDisputeResolution",
                  message,
                  await metaTransactionsHandler.getAddress()
                );

                // Execute meta transaction, expecting revert.
                await expect(
                  metaTransactionsHandler.executeMetaTransaction(
                    await buyer.getAddress(),
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

      context("👉 OfferHandlerFacet 👉 createOffer() ", async function () {
        beforeEach(async function () {
          // Initial ids for all the things
          offerId = "1";

          // Create a valid seller
          seller = mockSeller(
            await assistant.getAddress(),
            await assistant.getAddress(),
            ZeroAddress,
            await assistant.getAddress()
          );
          expect(seller.isValid()).is.true;

          // VoucherInitValues
          voucherInitValues = mockVoucherInitValues();
          expect(voucherInitValues.isValid()).is.true;

          // AuthToken
          emptyAuthToken = mockAuthToken();
          expect(emptyAuthToken.isValid()).is.true;

          await accountHandler.connect(assistant).createSeller(seller, emptyAuthToken, voucherInitValues);

          // Create a valid dispute resolver
          disputeResolver = mockDisputeResolver(
            await assistantDR.getAddress(),
            await adminDR.getAddress(),
            clerkDR.address,
            await treasuryDR.getAddress(),
            true
          );
          expect(disputeResolver.isValid()).is.true;

          //Create DisputeResolverFee array so offer creation will succeed
          disputeResolverFees = [new DisputeResolverFee(await mockToken.getAddress(), "mockToken", "0")];

          // Make empty seller list, so every seller is allowed
          sellerAllowList = [];

          // Register the dispute resolver
          await accountHandler
            .connect(adminDR)
            .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

          // Valid offer domains
          ({ offer, offerDates, offerDurations } = await mockOffer());
          offer.exchangeToken = await mockToken.getAddress();

          // Check if domains are valid
          expect(offer.isValid()).is.true;
          expect(offerDates.isValid()).is.true;
          expect(offerDurations.isValid()).is.true;

          // Set used variables
          sellerDeposit = offer.sellerDeposit;
          price = offer.price;
          voucherRedeemableFrom = offerDates.voucherRedeemableFrom;

          // top up seller's and buyer's account
          await mockToken.mint(await assistant.getAddress(), sellerDeposit);
          await mockToken.mint(await buyer.getAddress(), price);

          // approve protocol to transfer the tokens
          await mockToken.connect(assistant).approve(protocolDiamondAddress, sellerDeposit);
          await mockToken.connect(buyer).approve(protocolDiamondAddress, price);

          // deposit to seller's pool
          await fundsHandler.connect(assistant).depositFunds(seller.id, await mockToken.getAddress(), sellerDeposit);

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
          message.from = await assistant.getAddress();
          message.contractAddress = await offerHandler.getAddress();
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
            assistant,
            customTransactionType,
            "MetaTransaction",
            message,
            await metaTransactionsHandler.getAddress()
          );

          // send a meta transaction, check for event
          await expect(
            metaTransactionsHandler.executeMetaTransaction(
              await assistant.getAddress(),
              message.functionName,
              functionSignature,
              nonce,
              r,
              s,
              v
            )
          )
            .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
            .withArgs(await assistant.getAddress(), await deployer.getAddress(), message.functionName, nonce);

          // Verify that nonce is used. Expect true.
          let expectedResult = true;
          result = await metaTransactionsHandler.connect(assistant).isUsedNonce(await assistant.getAddress(), nonce);
          assert.equal(result, expectedResult, "Nonce is unused");
        });

        it("does not modify revert reasons", async function () {
          // Reverse the from and until dates
          offerDates.validFrom = BigInt(Date.now() + oneMonth * 6).toString(); // 6 months from now
          offerDates.validUntil = BigInt(Date.now()).toString(); // now

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
            assistant,
            customTransactionType,
            "MetaTransaction",
            message,
            await metaTransactionsHandler.getAddress()
          );

          // Execute meta transaction, expecting revert.
          await expect(
            metaTransactionsHandler.executeMetaTransaction(
              await assistant.getAddress(),
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
              assistant,
              customTransactionType,
              "MetaTransaction",
              message,
              await metaTransactionsHandler.getAddress()
            );

            // Execute the meta transaction.
            await metaTransactionsHandler.executeMetaTransaction(
              await assistant.getAddress(),
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
                await assistant.getAddress(),
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
            message.from = await rando.getAddress();

            // Collect the signature components
            let { r, s, v } = await prepareDataSignatureParameters(
              rando, // Different user, not seller's assistant.
              customTransactionType,
              "MetaTransaction",
              message,
              await metaTransactionsHandler.getAddress()
            );

            // Execute meta transaction, expecting revert.
            await expect(
              metaTransactionsHandler.executeMetaTransaction(
                await assistant.getAddress(),
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

      context.only("👉 FundsHandlerFacet 👉 withdrawFunds()", async function () {
        beforeEach(async function () {
          // Initial ids for all the things
          exchangeId = "1";

          // Create a valid seller
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

          // Create a valid dispute resolver
          disputeResolver = mockDisputeResolver(
            await assistantDR.getAddress(),
            await adminDR.getAddress(),
            clerkDR.address,
            await treasuryDR.getAddress(),
            true
          );
          expect(disputeResolver.isValid()).is.true;

          //Create DisputeResolverFee array so offer creation will succeed
          disputeResolverFees = [
            new DisputeResolverFee(ZeroAddress, "Native", "0"),
            new DisputeResolverFee(await mockToken.getAddress(), "mockToken", "0"),
          ];

          buyerId = accountId.next().value;

          // Make empty seller list, so every seller is allowed
          sellerAllowList = [];

          // Register the dispute resolver
          await accountHandler
            .connect(adminDR)
            .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

          const { offer, ...mo } = await mockOffer();
          ({ offerDates, offerDurations } = mo);
          offerNative = offer;
          offerToken = offerNative.clone();
          offerToken.id = "2";
          offerToken.exchangeToken = await mockToken.getAddress();

          price = offer.price;
          sellerDeposit = offer.sellerDeposit;

          // Check if domains are valid
          expect(offerNative.isValid()).is.true;
          expect(offerDates.isValid()).is.true;
          expect(offerDurations.isValid()).is.true;

          // Create both offers
          await Promise.all([
            offerHandler
              .connect(assistant)
              .createOffer(offerNative, offerDates, offerDurations, disputeResolver.id, agentId),
            offerHandler
              .connect(assistant)
              .createOffer(offerToken, offerDates, offerDurations, disputeResolver.id, agentId),
          ]);

          // top up seller's and buyer's account
          await mockToken.mint(await assistant.getAddress(), sellerDeposit);
          await mockToken.mint(await buyer.getAddress(), price);

          // approve protocol to transfer the tokens
          await mockToken.connect(assistant).approve(protocolDiamondAddress, sellerDeposit);
          await mockToken.connect(buyer).approve(protocolDiamondAddress, price);

          // deposit to seller's pool
          await fundsHandler.connect(assistant).depositFunds(seller.id, await mockToken.getAddress(), sellerDeposit);
          await fundsHandler.connect(assistant).depositFunds(seller.id, ZeroAddress, sellerDeposit, {
            value: sellerDeposit,
          });

          // commit to both offers
          await exchangeHandler.connect(buyer).commitToOffer(await buyer.getAddress(), offerToken.id);
          await exchangeHandler
            .connect(buyer)
            .commitToOffer(await buyer.getAddress(), offerNative.id, { value: offerNative.price });

          // cancel the voucher, so both seller and buyer have something to withdraw
          await exchangeHandler.connect(buyer).cancelVoucher(exchangeId); // canceling the voucher in tokens
          await exchangeHandler.connect(buyer).cancelVoucher(++exchangeId); // canceling the voucher in the native currency

          // expected payoffs - they are the same for token and native currency
          // buyer: price - buyerCancelPenalty
          buyerPayoff = BigInt(offerToken.price) - BigInt(offerToken.buyerCancelPenalty);

          // prepare validFundDetails
          tokenListBuyer = [await mockToken.getAddress(), ZeroAddress];
          tokenAmountsBuyer = [buyerPayoff, (BigInt(buyerPayoff) / 2n).toString()];
          validFundDetails = {
            entityId: buyerId,
            tokenList: tokenListBuyer,
            tokenAmounts: tokenAmountsBuyer,
          };

          // Prepare the message
          message = {};
          message.nonce = parseInt(nonce);
          message.contractAddress = await fundsHandler.getAddress();
          message.functionName = "withdrawFunds(uint256,address[],uint256[])";
          message.fundDetails = validFundDetails;
          message.from = await buyer.getAddress();

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
            buyerBalanceBefore = await mockToken.balanceOf(await buyer.getAddress());

            // Chain state should match the expected available funds before the withdrawal
            expectedBuyerAvailableFunds = new FundsList([
              new Funds(await mockToken.getAddress(), "Foreign20", buyerPayoff),
              new Funds(ZeroAddress, "Native currency", buyerPayoff),
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
              await metaTransactionsHandler.getAddress()
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
                await buyer.getAddress(),
                message.functionName,
                functionSignature,
                nonce,
                r,
                s,
                v
              )
            )
              .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
              .withArgs(await buyer.getAddress(), await deployer.getAddress(), message.functionName, nonce);

            // Read on chain state
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            buyerBalanceAfter = await mockToken.balanceOf(await buyer.getAddress());

            // Chain state should match the expected available funds after the withdrawal
            // Since all tokens are withdrawn, token should be removed from the list
            expectedBuyerAvailableFunds = new FundsList([
              new Funds(ZeroAddress, "Native currency", BigInt(buyerPayoff) / "2".toString()),
            ]);
            expect(buyerAvailableFunds).to.eql(
              expectedBuyerAvailableFunds,
              "Buyer available funds mismatch after withdrawal"
            );

            // Token balance is increased for the buyer payoff
            expect(buyerBalanceAfter).to.eql(buyerBalanceBefore + buyerPayoff, "Buyer token balance mismatch");

            // Verify that nonce is used. Expect true.
            let expectedResult = true;
            result = await metaTransactionsHandler.connect(buyer).isUsedNonce(await buyer.getAddress(), nonce);
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
              await metaTransactionsHandler.getAddress()
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
                await buyer.getAddress(),
                message.functionName,
                functionSignature,
                nonce,
                r,
                s,
                v
              )
            )
              .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
              .withArgs(await buyer.getAddress(), await deployer.getAddress(), message.functionName, nonce);

            // Read on chain state
            buyerAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(buyerId));
            buyerBalanceAfter = await mockToken.balanceOf(await buyer.getAddress());

            // Chain state should match the expected available funds after the withdrawal
            // Since all tokens are withdrawn, funds list should be empty.
            expectedBuyerAvailableFunds = new FundsList([]);
            expect(buyerAvailableFunds).to.eql(
              expectedBuyerAvailableFunds,
              "Buyer available funds mismatch after withdrawal"
            );

            // Token balance is increased for the buyer payoff
            expect(buyerBalanceAfter).to.eql(buyerBalanceBefore + buyerPayoff, "Buyer token balance mismatch");

            // Verify that nonce is used. Expect true.
            let expectedResult = true;
            result = await metaTransactionsHandler.connect(buyer).isUsedNonce(await buyer.getAddress(), nonce);
            assert.equal(result, expectedResult, "Nonce is unused");
          });

          it("does not modify revert reasons", async function () {
            // Set token address to boson token
            validFundDetails = {
              entityId: buyerId,
              tokenList: [await bosonToken.getAddress()],
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
              await metaTransactionsHandler.getAddress()
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
                await buyer.getAddress(),
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
              await metaTransactionsHandler.getAddress()
            );

            // Execute the meta transaction.
            await metaTransactionsHandler.executeMetaTransaction(
              await buyer.getAddress(),
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
                await buyer.getAddress(),
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
            message.from = await rando.getAddress();

            // Collect the signature components
            let { r, s, v } = await prepareDataSignatureParameters(
              rando, // Different user, not buyer.
              customTransactionType,
              "MetaTxFund",
              message,
              await metaTransactionsHandler.getAddress()
            );

            // Execute meta transaction, expecting revert.
            await expect(
              metaTransactionsHandler.executeMetaTransaction(
                await buyer.getAddress(),
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
});
