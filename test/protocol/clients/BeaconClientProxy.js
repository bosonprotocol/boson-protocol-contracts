const { ethers } = require("hardhat");
const { getSigners, getContractFactory } = ethers;
const { expect } = require("chai");

describe("BeaconClientProxy", function () {
  let clientBeacon, rando;
  let clientProxy;

  beforeEach(async function () {
    // Set signers
    [clientBeacon, rando] = await getSigners();

    // deploy proxy
    const ClientProxy = await getContractFactory("BeaconClientProxy");
    clientProxy = await ClientProxy.deploy();

    // init instead of constructors
    await clientProxy.initialize(clientBeacon.address);
  });

  context("initializable", function () {
    context("💔 Revert Reasons", async function () {
      it("should revert if trying to initialize again", async function () {
        await expect(clientProxy.connect(rando).initialize(await rando.getAddress())).to.be.revertedWith(
          "Initializable: contract is already initialized"
        );
      });
    });
  });
});
