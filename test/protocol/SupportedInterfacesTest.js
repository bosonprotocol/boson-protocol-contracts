const hre = require("hardhat");
const ethers = hre.ethers;
const { assert } = require("chai");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");

/**
 *  Test the SupportedInterfaces contract
 *
 *  SupportedInterfaces contract and tests are just a way to easily query
 *  the current ERC-165 interface id of a contract during development.
 */
describe("SupportedInterfaces", function () {
  // Shared args
  let SupportedInterfaces, supportedInterfaces, InterfaceIds;

  before(async function () {
    InterfaceIds = await getInterfaceIds();
  });

  beforeEach(async function () {
    // Deploy the contract
    SupportedInterfaces = await ethers.getContractFactory("SupportedInterfaces");
    supportedInterfaces = await SupportedInterfaces.deploy();
    await supportedInterfaces.deployed();
  });

  context("📋 Interface Ids", async function () {
    context("👉 Protocol Handlers", async function () {
      it("getIBosonAccountHandler() should return expected id", async function () {
        const expected = InterfaceIds.IBosonAccountHandler;
        const actual = await supportedInterfaces.getIBosonAccountHandler();
        //console.log(actual, expected);
        assert.equal(actual, expected);
      });

      it("getIBosonBundleHandler() should return expected id", async function () {
        const expected = InterfaceIds.IBosonBundleHandler;
        const actual = await supportedInterfaces.getIBosonBundleHandler();
        //console.log(actual, expected);
        assert.equal(actual, expected);
      });

      it("getIBosonConfigHandler() should return expected id", async function () {
        const expected = InterfaceIds.IBosonConfigHandler;
        const actual = await supportedInterfaces.getIBosonConfigHandler();
        //console.log(actual, expected);
        assert.equal(actual, expected);
      });

      it("getIBosonDisputeHandler() should return expected id", async function () {
        const expected = InterfaceIds.IBosonDisputeHandler;
        const actual = await supportedInterfaces.getIBosonDisputeHandler();
        //console.log(actual, expected);
        assert.equal(actual, expected);
      });

      it("getIBosonExchangeHandler() should return expected id", async function () {
        const expected = InterfaceIds.IBosonExchangeHandler;
        const actual = await supportedInterfaces.getIBosonExchangeHandler();
        //console.log(actual, expected);
        assert.equal(actual, expected);
      });

      it("getIBosonFundsHandler() should return expected id", async function () {
        const expected = InterfaceIds.IBosonFundsHandler;
        const actual = await supportedInterfaces.getIBosonFundsHandler();
        //console.log(actual, expected);
        assert.equal(actual, expected);
      });

      it("getIBosonGroupHandler() should return expected id", async function () {
        const expected = InterfaceIds.IBosonGroupHandler;
        const actual = await supportedInterfaces.getIBosonGroupHandler();
        //console.log(actual, expected);
        assert.equal(actual, expected);
      });

      it("getIBosonOfferHandler() should return expected id", async function () {
        const expected = InterfaceIds.IBosonOfferHandler;
        const actual = await supportedInterfaces.getIBosonOfferHandler();
        //console.log(actual, expected);
        assert.equal(actual, expected);
      });

      it("getIBosonTwinHandler() should return expected id", async function () {
        const expected = InterfaceIds.IBosonTwinHandler;
        const actual = await supportedInterfaces.getIBosonTwinHandler();
        //console.log(actual, expected);
        assert.equal(actual, expected);
      });

      it("getIBosonOrchestrationHandler() should return expected id", async function () {
        const expected = InterfaceIds.IBosonOrchestrationHandler;
        const actual = await supportedInterfaces.getIBosonOrchestrationHandler();
        assert.equal(actual, expected);
      });
    });

    context("👉 Protocol Clients", async function () {
      it("getIBosonClient() should return expected id", async function () {
        const expected = InterfaceIds.IBosonClient;
        const actual = await supportedInterfaces.getIBosonClient();
        //console.log(actual, expected);
        assert.equal(actual, expected);
      });

      it("getIBosonVoucher() should return expected id", async function () {
        const expected = InterfaceIds.IBosonVoucher;
        const actual = await supportedInterfaces.getIBosonVoucher();
        //console.log(actual, expected);
        assert.equal(actual, expected);
      });
    });
  });
});
