const { ethers } = require("hardhat");
const { getInterfaceIds } = require("../../../scripts/config/supported-interfaces.js");
const Agreement = require("../../../scripts/domain/Agreement");

const { expect } = require("chai");
const { RevertReasons } = require("../../../scripts/config/revert-reasons");
const { getSnapshot, revertToSnapshot, setNextBlockTimestamp } = require("../../util/utils.js");
const { oneMonth } = require("../../util/constants");
const { deployMockTokens } = require("../../../scripts/util/deploy-mock-tokens");

describe("IDRFeeMutualizer + IDRFeeMutualizerClient", function () {
  let interfaceIds;
  let protocol, mutualizerOwner, rando, assistant;
  let snapshotId;
  let mutualizer;
  let foreign20;

  before(async function () {
    // Get interface id
    interfaceIds = await getInterfaceIds();

    [protocol, mutualizerOwner, rando, assistant] = await ethers.getSigners();

    const mutualizerFactory = await ethers.getContractFactory("DRFeeMutualizer");
    mutualizer = await mutualizerFactory.connect(mutualizerOwner).deploy(protocol.address);

    [foreign20] = await deployMockTokens(["Foreign20", "BosonToken"]);

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
      it("should indicate support for IDRFeeMutualizer and IDRFeeMutualizerClient", async function () {
        // IDRFeeMutualizer interface
        let support = await mutualizer.supportsInterface(interfaceIds["IDRFeeMutualizer"]);
        expect(support, "IDRFeeMutualizer interface not supported").is.true;

        // IDRFeeMutualizerClient interface
        support = await mutualizer.supportsInterface(interfaceIds["IDRFeeMutualizerClient"]);
        expect(support, "IDRFeeMutualizerClient interface not supported").is.true;
      });
    });
  });

  context("📋 DRMutualizer methods", async function () {
    let agreement;

    beforeEach(function () {
      const startTimestamp = ethers.BigNumber.from(Date.now()).div(1000); // valid from now
      const endTimestamp = startTimestamp.add(oneMonth); // valid for 30 days
      agreement = new Agreement(
        assistant.address,
        ethers.constants.AddressZero,
        ethers.utils.parseUnits("1", "ether").toString(),
        ethers.utils.parseUnits("1", "ether").toString(),
        ethers.utils.parseUnits("0.001", "ether").toString(),
        startTimestamp.toString(),
        endTimestamp.toString(),
        false,
        false
      );
    });

    context("👉 newAgreement()", function () {
      it("should emit an AgreementCreated event", async function () {
        // Create a new agreement, test for event
        await expect(mutualizer.connect(mutualizerOwner).newAgreement(agreement))
          .to.emit(mutualizer, "AgreementCreated")
          .withArgs(assistant.address, "1", agreement.toStruct());
      });

      it("should update state", async function () {
        await mutualizer.connect(mutualizerOwner).newAgreement(agreement);

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

    context("👉 payPremium()", function () {
      let agreementId;

      beforeEach(async function () {
        // Create a new agreement
        await mutualizer.connect(mutualizerOwner).newAgreement(agreement);

        agreementId = "1";
      });

      it("should emit an AgreementConfirmed event", async function () {
        // Pay the premium, test for event
        await expect(mutualizer.connect(assistant).payPremium(agreementId, { value: agreement.premium }))
          .to.emit(mutualizer, "AgreementConfirmed")
          .withArgs(assistant.address, agreementId);
      });

      it("should update state", async function () {
        await mutualizer.connect(assistant).payPremium(agreementId, { value: agreement.premium });

        // Get agreement id and agreement object from contract
        const [returnedAgreementId, returnedAgreement] = await mutualizer.getAgreementBySellerAndToken(
          assistant.address,
          ethers.constants.AddressZero
        );
        const returnedAgreementStruct = Agreement.fromStruct(returnedAgreement);

        // Values should match
        expect(returnedAgreementStruct.toString()).eq(agreement.toString());
        expect(returnedAgreementId.toString()).eq(agreementId);
      });

      it("anyone can pay premium on seller's behalf", async function () {
        // Pay the premium, test for event
        await expect(mutualizer.connect(rando).payPremium(agreementId, { value: agreement.premium }))
          .to.emit(mutualizer, "AgreementConfirmed")
          .withArgs(assistant.address, agreementId);
      });

      it("premium in ERC20 tokens", async function () {
        agreement.token = foreign20.address;
        await mutualizer.connect(mutualizerOwner).newAgreement(agreement);
        agreementId = "2";

        await foreign20.connect(assistant).mint(assistant.address, agreement.premium);
        await foreign20.connect(assistant).approve(mutualizer.address, agreement.premium);

        // Pay the premium, test for event
        await expect(mutualizer.connect(assistant).payPremium(agreementId))
          .to.emit(mutualizer, "AgreementConfirmed")
          .withArgs(assistant.address, agreementId);
      });

      it("it is possible to substitute an agreement", async function () {
        // Agreement is confirmed
        await mutualizer.connect(assistant).payPremium(agreementId, { value: agreement.premium });

        // Create a new agreement for the same seller and token
        const startTimestamp = ethers.BigNumber.from(Date.now()).div(1000); // valid from now
        const endTimestamp = startTimestamp.add(oneMonth * 2); // valid for 30 days
        agreement = new Agreement(
          assistant.address,
          ethers.constants.AddressZero,
          ethers.utils.parseUnits("2", "ether").toString(),
          ethers.utils.parseUnits("2", "ether").toString(),
          ethers.utils.parseUnits("0.001", "ether").toString(),
          startTimestamp.toString(),
          endTimestamp.toString(),
          false,
          false
        );

        await mutualizer.connect(mutualizerOwner).newAgreement(agreement);
        agreementId = "2";

        await mutualizer.connect(assistant).payPremium(agreementId, { value: agreement.premium });

        // Get agreement id and agreement object from contract
        const [returnedAgreementId, returnedAgreement] = await mutualizer.getAgreementBySellerAndToken(
          assistant.address,
          ethers.constants.AddressZero
        );
        const returnedAgreementStruct = Agreement.fromStruct(returnedAgreement);

        // Values should match
        expect(returnedAgreementStruct.toString()).eq(agreement.toString());
        expect(returnedAgreementId.toString()).eq(agreementId);
      });

      context("💔 Revert Reasons", async function () {
        it("agreement does not exist", async function () {
          // Expect revert if agreement id is out of bound
          agreementId = "100";
          await expect(
            mutualizer.connect(assistant).payPremium(agreementId, { value: agreement.premium })
          ).to.be.revertedWith(RevertReasons.INVALID_AGREEMENT);

          agreementId = "0";
          await expect(
            mutualizer.connect(assistant).payPremium(agreementId, { value: agreement.premium })
          ).to.be.revertedWith(RevertReasons.INVALID_AGREEMENT);
        });

        it("agreement is already confirmed", async function () {
          await mutualizer.connect(assistant).payPremium(agreementId, { value: agreement.premium });

          // Expect revert if already confirmed
          await expect(
            mutualizer.connect(assistant).payPremium(agreementId, { value: agreement.premium })
          ).to.be.revertedWith(RevertReasons.AGREEMENT_ALREADY_CONFIRMED);
        });

        it("agreement is voided", async function () {
          await mutualizer.connect(mutualizerOwner).voidAgreement(agreementId);

          // Expect revert if voided
          await expect(
            mutualizer.connect(assistant).payPremium(agreementId, { value: agreement.premium })
          ).to.be.revertedWith(RevertReasons.AGREEMENT_VOIDED);
        });

        it("agreement expired", async function () {
          await setNextBlockTimestamp(ethers.BigNumber.from(agreement.endTimestamp).add(1).toHexString());

          // Expect revert if expired
          await expect(
            mutualizer.connect(assistant).payPremium(agreementId, { value: agreement.premium })
          ).to.be.revertedWith(RevertReasons.AGREEMENT_EXPIRED);
        });
      });
    });

    context("👉 voidAgreement()", function () {
      let agreementId;

      beforeEach(async function () {
        // Create a new agreement
        await mutualizer.connect(mutualizerOwner).newAgreement(agreement);

        agreementId = "1";
      });

      it("should emit an AgreementVoided event", async function () {
        // Void the agreement, test for event
        await expect(mutualizer.connect(mutualizerOwner).voidAgreement(agreementId))
          .to.emit(mutualizer, "AgreementVoided")
          .withArgs(assistant.address, agreementId);
      });

      it("should update state", async function () {
        await mutualizer.connect(mutualizerOwner).voidAgreement(agreementId);

        // Get agreement object from contract
        const returnedAgreement = Agreement.fromStruct(await mutualizer.getAgreement("1"));

        // Values should match
        expect(returnedAgreement.voided).to.be.true;
      });

      it("seller can void the agreement", async function () {
        // Void the agreement, test for event
        await expect(mutualizer.connect(assistant).voidAgreement(agreementId))
          .to.emit(mutualizer, "AgreementVoided")
          .withArgs(assistant.address, agreementId);
      });

      context("💔 Revert Reasons", async function () {
        it("agreement does not exist", async function () {
          // Expect revert if agreement id is out of bound
          agreementId = "100";
          await expect(mutualizer.connect(mutualizerOwner).voidAgreement(agreementId)).to.be.revertedWith(
            RevertReasons.INVALID_AGREEMENT
          );

          agreementId = "0";
          await expect(mutualizer.connect(mutualizerOwner).voidAgreement(agreementId)).to.be.revertedWith(
            RevertReasons.INVALID_AGREEMENT
          );
        });

        it("caller is not the contract owner or the seller", async function () {
          // Expect revert if rando calls
          await expect(mutualizer.connect(rando).voidAgreement(agreementId)).to.be.revertedWith(
            RevertReasons.NOT_OWNER_OR_SELLER
          );
        });

        it("agreement is voided already", async function () {
          await mutualizer.connect(mutualizerOwner).voidAgreement(agreementId);

          // Expect revert if voided
          await expect(mutualizer.connect(mutualizerOwner).voidAgreement(agreementId)).to.be.revertedWith(
            RevertReasons.AGREEMENT_VOIDED
          );
        });

        it("agreement expired", async function () {
          await setNextBlockTimestamp(ethers.BigNumber.from(agreement.endTimestamp).add(1).toHexString());

          // Expect revert if expired
          await expect(mutualizer.connect(mutualizerOwner).voidAgreement(agreementId)).to.be.revertedWith(
            RevertReasons.AGREEMENT_EXPIRED
          );
        });
      });
    });
  });
});
