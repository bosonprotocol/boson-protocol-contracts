const { ethers } = require("hardhat");
const {
  utils: { keccak256, toUtf8Bytes },
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
    assistant = clerk = admin;
    assistantDR = clerkDR = adminDR;

    [deployer] = await ethers.getSigners();

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
    const cutFacetViaDiamond = await ethers.getContractAt("DiamondCutFacet", protocolDiamondAddress);

    // Deploy MockMetaTransactionsHandlerFacet
    const MockMetaTransactionsHandlerFacet = await ethers.getContractFactory("MockMetaTransactionsHandlerFacet");
    const mockMetaTransactionsHandlerFacet = await MockMetaTransactionsHandlerFacet.deploy();
    await mockMetaTransactionsHandlerFacet.deployed();

    // Define the facet cut
    const facetCuts = [
      {
        facetAddress: mockMetaTransactionsHandlerFacet.address,
        action: FacetCutAction.Add,
        functionSelectors: getSelectors(mockMetaTransactionsHandlerFacet),
      },
    ];

    // Send the DiamondCut transaction
    const tx = await cutFacetViaDiamond.connect(deployer).diamondCut(facetCuts, ethers.constants.AddressZero, "0x");

    // Wait for transaction to confirm
    const receipt = await tx.wait();

    // Be certain transaction was successful
    assert.equal(receipt.status, 1, `Diamond upgrade failed: ${tx.hash}`);

    // Cast Diamond to MockMetaTransactionsHandlerFacet
    mockMetaTransactionsHandler = await ethers.getContractAt(
      "MockMetaTransactionsHandlerFacet",
      protocolDiamondAddress
    );
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
      nonce = parseInt(ethers.utils.randomBytes(8));
    });

    context("👉 isUsedNonce()", async function () {
      let expectedResult;
      beforeEach(async function () {
        expectedResult = false;
      });

      it("should return false if nonce is not used", async function () {
        // Check if nonce is used before
        result = await metaTransactionsHandler.connect(assistant).isUsedNonce(rando.address, nonce);

        // Verify the expectation
        assert.equal(result, expectedResult, "Nonce is used");
      });

      it("should be true after executing a meta transaction with nonce", async function () {
        result = await metaTransactionsHandler.connect(assistant).isUsedNonce(assistant.address, nonce);

        // Verify the expectation
        assert.equal(result, expectedResult, "Nonce is used");

        // Create a valid seller for meta transaction
        seller = mockSeller(assistant.address, assistant.address, assistant.address, assistant.address);
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
        message.from = assistant.address;
        message.contractAddress = accountHandler.address;
        message.functionName =
          "createSeller((uint256,address,address,address,address,bool,string),(uint256,uint8),(string,uint256))";
        message.functionSignature = functionSignature;

        // Collect the signature components
        let { r, s, v } = await prepareDataSignatureParameters(
          assistant,
          customTransactionType,
          "MetaTransaction",
          message,
          metaTransactionsHandler.address
        );

        // Send as meta transaction
        await metaTransactionsHandler.executeMetaTransaction(
          assistant.address,
          message.functionName,
          functionSignature,
          nonce,
          r,
          s,
          v
        );

        // We expect that the nonce is used now. Hence expecting to return true.
        expectedResult = true;
        result = await metaTransactionsHandler.connect(assistant).isUsedNonce(assistant.address, nonce);
        assert.equal(result, expectedResult, "Nonce is not used");

        //Verify that another nonce value is unused.
        expectedResult = false;
        nonce = nonce + 1;
        result = await metaTransactionsHandler.connect(rando).isUsedNonce(assistant.address, nonce);
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
        await accessController.grantRole(Role.ADMIN, admin.address);
      });

      it("should emit a FunctionsAllowlisted event", async function () {
        // Enable functions
        await expect(metaTransactionsHandler.connect(admin).setAllowlistedFunctions(functionHashList, true))
          .to.emit(metaTransactionsHandler, "FunctionsAllowlisted")
          .withArgs(functionHashList, true, admin.address);

        // Disable functions
        await expect(metaTransactionsHandler.connect(admin).setAllowlistedFunctions(functionHashList, false))
          .to.emit(metaTransactionsHandler, "FunctionsAllowlisted")
          .withArgs(functionHashList, false, admin.address);
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
        await accessController.grantRole(Role.ADMIN, admin.address);
      });

      it("after initialization all state modifying functions should be allowlisted", async function () {
        const stateModifyingFunctionsHashes = await getStateModifyingFunctionsHashes(facetNames, [
          "executeMetaTransaction(address,string,bytes,uint256,bytes32,bytes32,uint8)",
        ]);
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
        await accessController.grantRole(Role.ADMIN, admin.address);
      });

      it("after initialization all state modifying functions should be allowlisted", async function () {
        // Get list of state modifying functions
        const stateModifyingFunctions = (await getStateModifyingFunctions(facetNames)).filter(
          (fn) => fn != "executeMetaTransaction(address,string,bytes,uint256,bytes32,bytes32,uint8)"
        );

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
          seller = mockSeller(assistant.address, assistant.address, assistant.address, assistant.address);
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
          message.from = assistant.address;
          message.contractAddress = accountHandler.address;
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
            metaTransactionsHandler.address
          );

          // send a meta transaction, check for event
          await expect(
            metaTransactionsHandler
              .connect(deployer)
              .executeMetaTransaction(assistant.address, message.functionName, functionSignature, nonce, r, s, v)
          )
            .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
            .withArgs(assistant.address, deployer.address, message.functionName, nonce);

          // Verify that nonce is used. Expect true.
          let expectedResult = true;
          result = await metaTransactionsHandler.connect(assistant).isUsedNonce(assistant.address, nonce);
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
            metaTransactionsHandler.address
          );

          // send a meta transaction, does not revert
          await expect(
            metaTransactionsHandler
              .connect(deployer)
              .executeMetaTransaction(assistant.address, message.functionName, functionSignature, nonce, r, s, v)
          )
            .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
            .withArgs(assistant.address, deployer.address, message.functionName, nonce);

          // Verify that nonce is used. Expect true.
          let expectedResult = true;
          result = await metaTransactionsHandler.connect(assistant).isUsedNonce(assistant.address, nonce);
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
            metaTransactionsHandler.address
          );

          // send a meta transaction, expecting revert
          await expect(
            metaTransactionsHandler.executeMetaTransaction(
              assistant.address,
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
            metaTransactionsHandler.address
          ));

          // send a meta transaction, check for event
          await expect(
            metaTransactionsHandler
              .connect(deployer)
              .executeMetaTransaction(assistant.address, message.functionName, functionSignature, nonce, r, s, v)
          )
            .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
            .withArgs(assistant.address, deployer.address, message.functionName, nonce);

          // Verify that nonce is used. Expect true.
          let expectedResult = true;
          result = await metaTransactionsHandler.connect(assistant).isUsedNonce(assistant.address, nonce);
          assert.equal(result, expectedResult, "Nonce is unused");

          // send a meta transaction again, check for event
          seller.assistant = assistantDR.address;
          seller.admin = adminDR.address;
          seller.clerk = clerkDR.address;
          seller.treasury = treasuryDR.address;

          message.from = adminDR.address;

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
            metaTransactionsHandler.address
          ));

          await expect(
            metaTransactionsHandler
              .connect(rando)
              .executeMetaTransaction(adminDR.address, message.functionName, functionSignature, nonce, r, s, v)
          )
            .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
            .withArgs(adminDR.address, rando.address, message.functionName, nonce);

          // Verify that nonce is used. Expect true.
          expectedResult = true;
          result = await metaTransactionsHandler.connect(assistantDR).isUsedNonce(assistantDR.address, nonce);
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
              metaTransactionsHandler.address
            );

            // Pause the metatx region of the protocol
            await pauseHandler.connect(pauser).pause([PausableRegion.MetaTransaction]);

            // Attempt to execute a meta transaction, expecting revert
            await expect(
              metaTransactionsHandler
                .connect(deployer)
                .executeMetaTransaction(assistant.address, message.functionName, functionSignature, nonce, r, s, v)
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
              metaTransactionsHandler.address
            );

            // Execute meta transaction, expecting revert.
            await expect(
              metaTransactionsHandler.executeMetaTransaction(
                assistant.address,
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
              metaTransactionsHandler.address
            );

            // Execute meta transaction, expecting revert.
            await expect(
              metaTransactionsHandler.executeMetaTransaction(
                assistant.address,
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
              metaTransactionsHandler.address
            );

            // Execute meta transaction, expecting revert.
            await expect(
              metaTransactionsHandler.executeMetaTransaction(
                assistant.address,
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
            const fnBytes = ethers.utils.toUtf8Bytes(fn);
            const collisionBytes = "0a7f0f031e";
            const collisionBytesBuffer = Buffer.from(collisionBytes, "hex");
            const fnCollision = Buffer.concat([fnBytes, collisionBytesBuffer]);
            const sigCollision = ethers.utils.keccak256(fnCollision).slice(0, 10);

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
              metaTransactionsHandler.address
            );

            // Execute meta transaction, expecting revert.
            await expect(
              metaTransactionsHandler.executeMetaTransaction(
                assistant.address,
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
              metaTransactionsHandler.address
            );

            // Execute the meta transaction.
            await metaTransactionsHandler.executeMetaTransaction(
              assistant.address,
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
                assistant.address,
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
              rando, // Different user, not assistant.
              customTransactionType,
              "MetaTransaction",
              message,
              metaTransactionsHandler.address
            );

            // Execute meta transaction, expecting revert.
            await expect(
              metaTransactionsHandler.executeMetaTransaction(
                assistant.address,
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
              metaTransactionsHandler.address
            );

            // Execute meta transaction, expecting revert.
            await expect(
              metaTransactionsHandler.executeMetaTransaction(
                assistant.address,
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
                assistant.address,
                message.functionName,
                functionSignature,
                nonce,
                r,
                ethers.constants.MaxUint256, // invalid s signature component
                v
              )
            ).to.revertedWith(RevertReasons.INVALID_SIGNATURE);

            // Execute meta transaction, expecting revert.
            await expect(
              metaTransactionsHandler.executeMetaTransaction(
                assistant.address,
                message.functionName,
                functionSignature,
                nonce,
                r,
                ethers.utils.hexZeroPad("0x", 32), // invalid s signature component
                v
              )
            ).to.revertedWith(RevertReasons.INVALID_SIGNATURE);

            // Execute meta transaction, expecting revert.
            await expect(
              metaTransactionsHandler.executeMetaTransaction(
                assistant.address,
                message.functionName,
                functionSignature,
                nonce,
                ethers.utils.hexZeroPad("0x", 32), // invalid r signature component
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
          seller = mockSeller(assistant.address, assistant.address, assistant.address, assistant.address);
          expect(seller.isValid()).is.true;

          // VoucherInitValues
          voucherInitValues = mockVoucherInitValues();
          expect(voucherInitValues.isValid()).is.true;

          // AuthToken
          emptyAuthToken = mockAuthToken();
          expect(emptyAuthToken.isValid()).is.true;

          await accountHandler.connect(assistant).createSeller(seller, emptyAuthToken, voucherInitValues);

          // Create a valid twin, then set fields in tests directly
          twin = mockTwin(bosonToken.address);
          twin.id = "1";
          twin.sellerId = "1";
          expect(twin.isValid()).is.true;

          // Approving the twinHandler contract to transfer seller's tokens
          await bosonToken.connect(assistant).approve(twinHandler.address, 1);

          // Create a twin
          await twinHandler.connect(assistant).createTwin(twin);

          // Prepare the message
          message = {};
          message.nonce = parseInt(nonce);
          message.from = assistant.address;
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
            assistant,
            customTransactionType,
            "MetaTransaction",
            message,
            metaTransactionsHandler.address
          );

          // Remove the twin. Send as meta transaction.
          await metaTransactionsHandler.executeMetaTransaction(
            assistant.address,
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
          message.from = assistant.address;
          message.contractAddress = metaTransactionsHandler.address;
        });

        it("Should fail when try to call executeMetaTransaction method itself", async function () {
          // Function signature for executeMetaTransaction function.
          functionSignature = metaTransactionsHandler.interface.encodeFunctionData("executeMetaTransaction", [
            assistant.address,
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
            assistant,
            customTransactionType,
            "MetaTransaction",
            message,
            metaTransactionsHandler.address
          );

          // send a meta transaction, expecting revert
          await expect(
            metaTransactionsHandler.executeMetaTransaction(
              assistant.address,
              message.functionName,
              functionSignature,
              nonce,
              r,
              s,
              v
            )
          ).to.revertedWith(RevertReasons.FUNCTION_NOT_ALLOWLISTED);
        });

        context("Reentrancy guard", async function () {
          beforeEach(async function () {
            // Create a valid seller for meta transaction
            seller = mockSeller(assistant.address, assistant.address, assistant.address, assistant.address);
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
              assistantDR.address,
              adminDR.address,
              clerkDR.address,
              treasuryDR.address,
              true
            );
            expect(disputeResolver.isValid()).is.true;

            buyerId = accountId.next().value;

            //Create DisputeResolverFee array so offer creation will succeed
            disputeResolverFees = [new DisputeResolverFee(maliciousToken.address, "maliciousToken", "0")];

            // Make empty seller list, so every seller is allowed
            sellerAllowList = [];

            // Register the dispute resolver
            await accountHandler
              .connect(adminDR)
              .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

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
              .connect(assistant)
              .createOffer(offerToken, offerDates, offerDurations, disputeResolver.id, agentId);

            // top up seller's and buyer's account
            await maliciousToken.mint(assistant.address, sellerDeposit);
            await maliciousToken.mint(buyer.address, price);

            // Approve protocol to transfer the tokens
            await maliciousToken.connect(assistant).approve(protocolDiamondAddress, sellerDeposit);
            await maliciousToken.connect(buyer).approve(protocolDiamondAddress, price);

            // Deposit to seller's pool
            await fundsHandler.connect(assistant).depositFunds(seller.id, maliciousToken.address, sellerDeposit);

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
            const [maliciousToken] = await deployMockTokens(["Foreign20Malicious2"]);
            await maliciousToken.setProtocolAddress(protocolDiamondAddress);

            // Mint and approve protocol to transfer the tokens
            await maliciousToken.mint(rando.address, "1");
            await maliciousToken.connect(rando).approve(protocolDiamondAddress, "1");

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

      context("👉 ExchangeHandlerFacet", async function () {
        beforeEach(async function () {
          offerId = "1";

          // Create a valid seller
          seller = mockSeller(assistant.address, assistant.address, assistant.address, assistant.address);
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
            assistantDR.address,
            adminDR.address,
            clerkDR.address,
            treasuryDR.address,
            true
          );
          expect(disputeResolver.isValid()).is.true;

          //Create DisputeResolverFee array so offer creation will succeed
          disputeResolverFees = [
            new DisputeResolverFee(ethers.constants.AddressZero, "Native", "0"),
            new DisputeResolverFee(mockToken.address, "BosonToken", "0"),
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
          message.contractAddress = exchangeHandler.address;
          message.from = buyer.address;
          message.functionName = "commitToOffer(address,uint256)";

          // Deposit native currency to the same seller id
          await fundsHandler
            .connect(rando)
            .depositFunds(seller.id, ethers.constants.AddressZero, sellerDeposit, { value: sellerDeposit });
        });

        afterEach(async function () {
          // Reset the accountId iterator
          accountId.next(true);
        });

        context("👉 ExchangeHandlerFacet 👉 commitToOffer()", async function () {
          beforeEach(async function () {
            offer.exchangeToken = mockToken.address;

            // Check if domains are valid
            expect(offer.isValid()).is.true;
            expect(offerDates.isValid()).is.true;
            expect(offerDurations.isValid()).is.true;

            // top up seller's and buyer's account
            await mockToken.mint(assistant.address, sellerDeposit);
            await mockToken.mint(buyer.address, price);

            // approve protocol to transfer the tokens
            await mockToken.connect(assistant).approve(protocolDiamondAddress, sellerDeposit);
            await mockToken.connect(buyer).approve(protocolDiamondAddress, price);

            // deposit to seller's pool
            await fundsHandler.connect(assistant).depositFunds(seller.id, mockToken.address, sellerDeposit);

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
              buyer: buyer.address,
              offerId: offer.id,
            };

            // Prepare the message
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

            // Prepare the function signature
            functionSignature = exchangeHandler.interface.encodeFunctionData(
              "commitToOffer",
              Object.values(validOfferDetails)
            );

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
            result = await metaTransactionsHandler.connect(buyer).isUsedNonce(buyer.address, nonce);
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
              metaTransactionsHandler.address
            );

            // Prepare the function signature
            functionSignature = exchangeHandler.interface.encodeFunctionData(
              "commitToOffer",
              Object.values(validOfferDetails)
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
            await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: price });
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
              result = await metaTransactionsHandler.connect(buyer).isUsedNonce(buyer.address, nonce);
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
              result = await metaTransactionsHandler.connect(buyer).isUsedNonce(buyer.address, nonce);
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
              result = await metaTransactionsHandler.connect(buyer).isUsedNonce(buyer.address, nonce);
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
              result = await metaTransactionsHandler.connect(buyer).isUsedNonce(buyer.address, nonce);
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
              result = await metaTransactionsHandler.connect(buyer).isUsedNonce(buyer.address, nonce);
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
              result = await metaTransactionsHandler.connect(buyer).isUsedNonce(buyer.address, nonce);
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
                disputeHandler.address
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
                validDisputeResolutionDetails.buyerPercentBasisPoints,
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
              result = await metaTransactionsHandler.connect(buyer).isUsedNonce(buyer.address, nonce);
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
                metaTransactionsHandler.address
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
      });

      context("👉 OfferHandlerFacet 👉 createOffer() ", async function () {
        beforeEach(async function () {
          // Initial ids for all the things
          offerId = "1";

          // Create a valid seller
          seller = mockSeller(assistant.address, assistant.address, assistant.address, assistant.address);
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
            assistantDR.address,
            adminDR.address,
            clerkDR.address,
            treasuryDR.address,
            true
          );
          expect(disputeResolver.isValid()).is.true;

          //Create DisputeResolverFee array so offer creation will succeed
          disputeResolverFees = [new DisputeResolverFee(mockToken.address, "mockToken", "0")];

          // Make empty seller list, so every seller is allowed
          sellerAllowList = [];

          // Register the dispute resolver
          await accountHandler
            .connect(adminDR)
            .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

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
          await mockToken.mint(assistant.address, sellerDeposit);
          await mockToken.mint(buyer.address, price);

          // approve protocol to transfer the tokens
          await mockToken.connect(assistant).approve(protocolDiamondAddress, sellerDeposit);
          await mockToken.connect(buyer).approve(protocolDiamondAddress, price);

          // deposit to seller's pool
          await fundsHandler.connect(assistant).depositFunds(seller.id, mockToken.address, sellerDeposit);

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
          message.from = assistant.address;
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
            assistant,
            customTransactionType,
            "MetaTransaction",
            message,
            metaTransactionsHandler.address
          );

          // send a meta transaction, check for event
          await expect(
            metaTransactionsHandler.executeMetaTransaction(
              assistant.address,
              message.functionName,
              functionSignature,
              nonce,
              r,
              s,
              v
            )
          )
            .to.emit(metaTransactionsHandler, "MetaTransactionExecuted")
            .withArgs(assistant.address, deployer.address, message.functionName, nonce);

          // Verify that nonce is used. Expect true.
          let expectedResult = true;
          result = await metaTransactionsHandler.connect(assistant).isUsedNonce(assistant.address, nonce);
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
            assistant,
            customTransactionType,
            "MetaTransaction",
            message,
            metaTransactionsHandler.address
          );

          // Execute meta transaction, expecting revert.
          await expect(
            metaTransactionsHandler.executeMetaTransaction(
              assistant.address,
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
              metaTransactionsHandler.address
            );

            // Execute the meta transaction.
            await metaTransactionsHandler.executeMetaTransaction(
              assistant.address,
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
                assistant.address,
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
              rando, // Different user, not seller's assistant.
              customTransactionType,
              "MetaTransaction",
              message,
              metaTransactionsHandler.address
            );

            // Execute meta transaction, expecting revert.
            await expect(
              metaTransactionsHandler.executeMetaTransaction(
                assistant.address,
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
          // Initial ids for all the things
          exchangeId = "1";

          // Create a valid seller
          seller = mockSeller(assistant.address, admin.address, clerk.address, treasury.address);
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
            assistantDR.address,
            adminDR.address,
            clerkDR.address,
            treasuryDR.address,
            true
          );
          expect(disputeResolver.isValid()).is.true;

          //Create DisputeResolverFee array so offer creation will succeed
          disputeResolverFees = [
            new DisputeResolverFee(ethers.constants.AddressZero, "Native", "0"),
            new DisputeResolverFee(mockToken.address, "mockToken", "0"),
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
              .connect(assistant)
              .createOffer(offerNative, offerDates, offerDurations, disputeResolver.id, agentId),
            offerHandler
              .connect(assistant)
              .createOffer(offerToken, offerDates, offerDurations, disputeResolver.id, agentId),
          ]);

          // top up seller's and buyer's account
          await mockToken.mint(assistant.address, sellerDeposit);
          await mockToken.mint(buyer.address, price);

          // approve protocol to transfer the tokens
          await mockToken.connect(assistant).approve(protocolDiamondAddress, sellerDeposit);
          await mockToken.connect(buyer).approve(protocolDiamondAddress, price);

          // deposit to seller's pool
          await fundsHandler.connect(assistant).depositFunds(seller.id, mockToken.address, sellerDeposit);
          await fundsHandler.connect(assistant).depositFunds(seller.id, ethers.constants.AddressZero, sellerDeposit, {
            value: sellerDeposit,
          });

          // commit to both offers
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id);
          await exchangeHandler
            .connect(buyer)
            .commitToOffer(buyer.address, offerNative.id, { value: offerNative.price });

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
            result = await metaTransactionsHandler.connect(buyer).isUsedNonce(buyer.address, nonce);
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
            result = await metaTransactionsHandler.connect(buyer).isUsedNonce(buyer.address, nonce);
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
});
