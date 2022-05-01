const hre = require("hardhat");
const ethers = hre.ethers;
const { expect, assert } = require("chai");
const { gasLimit } = require("../../environments");

const Role = require("../../scripts/domain/Role");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { prepareDataSignatureParameters } = require("../../scripts/util/test-utils.js");

/**
 *  Test the Boson Meta transactions Handler interface
 */
describe.only("IBosonMetaTransactionsHandler", function () {
  // Common vars
  let InterfaceIds;
  let accounts, deployer, rando, operator;
  let erc165, protocolDiamond, accessController, twinHandler, support;
  let metaTransactionsHandler, nonce, functionSignature;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();
  });

  beforeEach(async function () {
    // Make accounts available
    accounts = await ethers.getSigners();
    deployer = accounts[0];
    operator = accounts[1];
    rando = accounts[3];

    // Deploy the Protocol Diamond
    [protocolDiamond, , , accessController] = await deployProtocolDiamond();

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Cut the protocol handler facets into the Diamond
    await deployProtocolHandlerFacets(protocolDiamond, ["TwinHandlerFacet", "MetaTransactionsHandlerFacet"]);

    // Add config Handler
    const protocolConfig = [
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0",
      "100",
      "100",
      "100",
      "100",
    ];

    // Deploy the Config facet, initializing the protocol config
    await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);

    // Cast Diamond to IERC165
    erc165 = await ethers.getContractAt("IERC165", protocolDiamond.address);

    // Cast Diamond to ITwinHandler
    twinHandler = await ethers.getContractAt("IBosonTwinHandler", protocolDiamond.address);

    // Cast Diamond to IBosonMetaTransactionsHandler
    metaTransactionsHandler = await ethers.getContractAt("IBosonMetaTransactionsHandler", protocolDiamond.address);
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
    context("👉 getNonce()", async function () {
      it("should return correct nonce value", async function () {
        // What we expect the initial nonce value will be.
        let expectedNonce = "0";

        // Get the nonce value
        nonce = await metaTransactionsHandler.connect(operator).getNonce(operator.address);

        // Verify the expectation
        assert.equal(nonce.toString(), expectedNonce, "Nonce is incorrect");
      });

      it("should be incremented after executing any meta transaction", async function () {
        // Verify the initial nonce value is zero
        let expectedNonce = "0";
        nonce = await metaTransactionsHandler.connect(operator).getNonce(operator.address);
        assert.equal(nonce.toString(), expectedNonce, "Nonce is incorrect");

        // Prepare the function signature for any facet function.
        functionSignature = twinHandler.interface.encodeFunctionData("getNextTwinId");
        // Collect the signature components
        let { r, s, v } = await prepareDataSignatureParameters(
          operator,
          nonce,
          functionSignature,
          metaTransactionsHandler.address
        );
        // Get next twin id. Send as meta transaction
        await metaTransactionsHandler.executeMetaTransaction(operator.address, functionSignature, r, s, v);

        //Verify that nonce value for operator increments by 1.
        expectedNonce = "1";
        nonce = await metaTransactionsHandler.connect(operator).getNonce(operator.address);
        assert.equal(nonce.toString(), expectedNonce, "Nonce is incorrect");

        //Verify that nonce value for rando stays the same.
        expectedNonce = "0";
        nonce = await metaTransactionsHandler.connect(rando).getNonce(rando.address);
        assert.equal(nonce.toString(), expectedNonce, "Nonce is incorrect");
      });
    });
  });
});
