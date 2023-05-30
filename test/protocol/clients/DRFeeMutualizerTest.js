const { ethers } = require("hardhat");
const { getInterfaceIds } = require("../../../scripts/config/supported-interfaces.js");
const Agreement = require("../../../scripts/domain/Agreement");

const { expect } = require("chai");
const { RevertReasons } = require("../../../scripts/config/revert-reasons");
const { getSnapshot, revertToSnapshot } = require("../../util/utils.js");
const { oneMonth } = require("../../util/constants");

describe("IDRFeeMutualizer", function () {
  let interfaceIds;
  let protocol, mutualizerOwner, rando, assistant;
  let snapshotId;
  let mutualizer;

  before(async function () {
    // Get interface id
    interfaceIds = await getInterfaceIds();

    const mutualizerFactory = await ethers.getContractFactory("DRFeeMutualizer");
    mutualizer = await mutualizerFactory.connect(mutualizerOwner).deploy(protocol.address);

    // Get snapshot id
    snapshotId = await getSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();
  });

  // Interface support
  context("📋 Interfaces", async function () {
    context("👉 supportsInterface()", async function () {
      it("should indicate support for IDRFeeMutualizer", async function () {
        // IBosonVoucher interface
        let support = await mutualizer.supportsInterface(interfaceIds["IDRFeeMutualizer"]);
        expect(support, "IDRFeeMutualizer interface not supported").is.true;
      });
    });
  });

  context("📋 DRMutualizer methods", async function () {
    context("👉 newAgreement()", function () {
      let agreement;

      beforeEach(function () {
        const startTimestamp = ethers.BigNumber.from(Date.now()).div(1000); // valid from now
        const endTimestamp = startTimestamp.add(oneMonth); // valid for 30 days
        agreement = new Agreement(
          assistant.address,
          ethers.constants.AddressZero,
          ethers.utils.parseUnits("1", "ether").toString(),
          ethers.utils.parseUnits("1", "ether").toString(),
          "0",
          startTimestamp.toString(),
          endTimestamp.toString(),
          false,
          false
        );
      });

      it("should emit an AgreementCreated event", async function () {
        // Create a new agreement, test for event
        await expect(mutualizer.connect(mutualizerOwner).newAgreement(agreement))
          .to.emit(mutualizer, "AgreementCreated")
          .withArgs(assistant.address, "1", agreement.toStruct());
      });

      it("should update state", async function () {
        await expect(mutualizer.connect(mutualizerOwner).newAgreement(agreement)).to.emit(
          mutualizer,
          "AgreementCreated"
        );

        // Get agreement object from contract
        const returnedAgreement = Agreement.fromStruct(await mutualizer.getAgreement("1"));

        // Values should match
        expect(returnedAgreement.toString()).eq(agreement.toString());
      });

      context("💔 Revert Reasons", async function () {
        it("caller is not the contract owner", async function () {
          // Expect revert if random user attempts to issue voucher
          await expect(mutualizer.connect(rando).newAgreement(agreement)).to.be.revertedWith(
            RevertReasons.OWNABLE_NOT_OWNER
          );
        });

        it("voided is set to true", async function () {
          agreement.voided = true;

          // Expect revert if voided is true
          await expect(mutualizer.connect(mutualizerOwner).newAgreement(agreement)).to.be.revertedWith(
            RevertReasons.INVALID_AGREEMENT
          );
        });

        it("max mutualized amount per transaction is greater than max total mutualized amount", async function () {
          agreement.maxMutualizedAmountPerTransaction = ethers.BigNumber.from(agreement.maxTotalMutualizedAmount)
            .add(1)
            .toString();

          // Expect revert if max mutualized amount per transaction is greater than max total mutualized amount
          await expect(mutualizer.connect(mutualizerOwner).newAgreement(agreement)).to.be.revertedWith(
            RevertReasons.INVALID_AGREEMENT
          );
        });

        it("max mutualized amount per transaction is 0", async function () {
          agreement.maxMutualizedAmountPerTransaction = "0";

          // Expect revert if max mutualized amount per transaction is 0
          await expect(mutualizer.connect(mutualizerOwner).newAgreement(agreement)).to.be.revertedWith(
            RevertReasons.INVALID_AGREEMENT
          );
        });

        it("end timestamp is not greater than start timestamp", async function () {
          agreement.endTimestamp = ethers.BigNumber.from(agreement.startTimestamp).sub(1).toString();

          // Expect revert if the end timestamp is not greater than start timestamp
          await expect(mutualizer.connect(mutualizerOwner).newAgreement(agreement)).to.be.revertedWith(
            RevertReasons.INVALID_AGREEMENT
          );
        });

        it("end timestamp is not greater than current block timestamp", async function () {
          agreement.endTimestamp = ethers.BigNumber.from(Date.now()).div(1000).sub(1).toString();

          // Expect revert if the end timestamp is not greater than current block timestamp
          await expect(mutualizer.connect(mutualizerOwner).newAgreement(agreement)).to.be.revertedWith(
            RevertReasons.INVALID_AGREEMENT
          );
        });
      });
    });
  });
});
