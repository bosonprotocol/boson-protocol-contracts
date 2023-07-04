const hre = require("hardhat");
const { getSigners } = hre.ethers;

const { deployProtocolClients } = require("../../../scripts/util/deploy-protocol-clients");
const { expect } = require("chai");
const { maxPriorityFeePerGas } = require("../../util/constants");

describe("BeaconClientProxy", function () {
  let protocol, rando;
  let proxy;

  beforeEach(async function () {
    // Set signers (fake protocol address to test issue and burn voucher without protocol dependencie)
    [protocol, rando] = await getSigners();

    // deploy proxy
    const protocolClientArgs = [await protocol.getAddress()];
    const [, , proxies] = await deployProtocolClients(protocolClientArgs, maxPriorityFeePerGas);
    [proxy] = proxies;
  });

  context("initializable", function () {
    context("💔 Revert Reasons", async function () {
      it("should revert if trying to initialize again", async function () {
        await expect(proxy.connect(rando).initialize(await rando.getAddress())).to.be.revertedWith(
          "Initializable: contract is already initialized"
        );
      });
    });
  });
});
