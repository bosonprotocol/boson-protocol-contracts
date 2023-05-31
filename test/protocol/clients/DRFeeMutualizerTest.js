const { ethers } = require("hardhat");
const { getInterfaceIds } = require("../../../scripts/config/supported-interfaces.js");
const Agreement = require("../../../scripts/domain/Agreement");
const AgreementStatus = require("../../../scripts/domain/AgreementStatus");

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

  context("📋 DRMutualizer client methods", async function () {
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
        let expectedAgreementStatus = new AgreementStatus(false, false, "0", "0");

        await mutualizer.connect(mutualizerOwner).newAgreement(agreement);

        // Get agreement object from contract
        const [returnedAgreement, returnedAgreementStatus] = await mutualizer.getAgreement("1");
        const returnedAgreementStruct = Agreement.fromStruct(returnedAgreement);
        const returnedAgreementStatusStruct = AgreementStatus.fromStruct(returnedAgreementStatus);

        // Values should match
        expect(returnedAgreementStruct.toString()).eq(agreement.toString());
        expect(returnedAgreementStatusStruct.toString()).eq(expectedAgreementStatus.toString());
      });

      context("💔 Revert Reasons", async function () {
        it("caller is not the contract owner", async function () {
          // Expect revert if random user attempts to issue voucher
          await expect(mutualizer.connect(rando).newAgreement(agreement)).to.be.revertedWith(
            RevertReasons.OWNABLE_NOT_OWNER
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

      context("💰 Native Token", function () {
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
          let expectedAgreementStatus = new AgreementStatus(true, false, "0", "0");

          await mutualizer.connect(assistant).payPremium(agreementId, { value: agreement.premium });

          // Get agreement id and agreement object from contract
          const [returnedAgreementId, returnedAgreement, returnedAgreementStatus] =
            await mutualizer.getConfirmedAgreementBySellerAndToken(agreement.sellerAddress, agreement.token);
          const returnedAgreementStruct = Agreement.fromStruct(returnedAgreement);
          const returnedAgreementStatusStruct = AgreementStatus.fromStruct(returnedAgreementStatus);

          // Values should match
          expect(returnedAgreementStruct.toString()).eq(agreement.toString());
          expect(returnedAgreementStatusStruct.toString()).eq(expectedAgreementStatus.toString());
          expect(returnedAgreementId.toString()).eq(agreementId);
        });

        it("anyone can pay premium on seller's behalf", async function () {
          // Pay the premium, test for event
          await expect(mutualizer.connect(rando).payPremium(agreementId, { value: agreement.premium }))
            .to.emit(mutualizer, "AgreementConfirmed")
            .withArgs(assistant.address, agreementId);
        });

        it("it is possible to substitute an agreement", async function () {
          let expectedAgreementStatus = new AgreementStatus(true, false, "0", "0");

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
          const [returnedAgreementId, returnedAgreement, returnedAgreementStatus] =
            await mutualizer.getConfirmedAgreementBySellerAndToken(agreement.sellerAddress, agreement.token);
          const returnedAgreementStruct = Agreement.fromStruct(returnedAgreement);
          const returnedAgreementStatusStruct = AgreementStatus.fromStruct(returnedAgreementStatus);

          // Values should match
          expect(returnedAgreementStruct.toString()).eq(agreement.toString());
          expect(returnedAgreementStatusStruct.toString()).eq(expectedAgreementStatus.toString());
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

          it("token is native and sent value is not equal to the agreement premium", async function () {
            // Expect revert if sent less than amount
            const value = ethers.BigNumber.from(agreement.premium).sub(1);
            await expect(mutualizer.connect(assistant).payPremium(agreementId, { value })).to.be.revertedWith(
              RevertReasons.INSUFFICIENT_VALUE_RECEIVED
            );
          });
        });
      });

      context("💰 ERC20 tokens", function () {
        beforeEach(async function () {
          agreement.token = foreign20.address;
          await mutualizer.connect(mutualizerOwner).newAgreement(agreement);
          agreementId = "1";

          await foreign20.connect(assistant).mint(assistant.address, agreement.premium);
          await foreign20.connect(assistant).approve(mutualizer.address, agreement.premium);
        });

        it("should emit an AgreementConfirmed event", async function () {
          // Pay the premium, test for event
          await expect(mutualizer.connect(assistant).payPremium(agreementId))
            .to.emit(mutualizer, "AgreementConfirmed")
            .withArgs(assistant.address, agreementId);
        });

        context("💔 Revert Reasons", async function () {
          it("native token is sent along", async function () {
            // Expect revert if native token is sent along
            await expect(
              mutualizer.connect(assistant).payPremium(agreementId, { value: agreement.premium })
            ).to.be.revertedWith(RevertReasons.NATIVE_NOT_ALLOWED);
          });

          it("transferFrom fails", async function () {
            await foreign20.connect(assistant).transfer(rando.address, "1"); // transfer to reduce balance

            // Expect revert if premium higher than token balance
            await expect(mutualizer.connect(assistant).payPremium(agreementId)).to.be.revertedWith(
              RevertReasons.ERC20_EXCEEDS_BALANCE
            );

            const reducedAllowance = ethers.BigNumber.from(agreement.premium).sub(1);
            await foreign20.connect(assistant).approve(mutualizer.address, reducedAllowance);

            // Expect revert if premium higher than allowance
            await expect(mutualizer.connect(assistant).payPremium(agreementId)).to.be.revertedWith(
              RevertReasons.ERC20_INSUFFICIENT_ALLOWANCE
            );
          });

          it("sent value is not equal to the agreement premium", async function () {
            // Deploy ERC20 with fees
            const [foreign20WithFee] = await deployMockTokens(["Foreign20WithFee"]);

            // mint tokens and approve
            await foreign20WithFee.mint(assistant.address, agreement.premium);
            await foreign20WithFee.connect(assistant).approve(mutualizer.address, agreement.premium);

            agreement.token = foreign20WithFee.address;
            await mutualizer.connect(mutualizerOwner).newAgreement(agreement);
            agreementId = "2";

            // Expect revert if received value does not match the premium
            await expect(mutualizer.connect(assistant).payPremium(agreementId)).to.be.revertedWith(
              RevertReasons.INSUFFICIENT_VALUE_RECEIVED
            );
          });

          it("Token address contract does not support transferFrom", async function () {
            // Deploy a contract without the transferFrom
            const [bosonToken] = await deployMockTokens(["BosonToken"]);

            agreement.token = bosonToken.address;
            await mutualizer.connect(mutualizerOwner).newAgreement(agreement);
            agreementId = "2";

            // Expect revert if token does not support transferFrom
            await expect(mutualizer.connect(assistant).payPremium(agreementId)).to.be.revertedWith(
              RevertReasons.SAFE_ERC20_LOW_LEVEL_CALL
            );
          });

          it("Token address is not a contract", async function () {
            agreement.token = mutualizer.address;
            await mutualizer.connect(mutualizerOwner).newAgreement(agreement);
            agreementId = "2";

            // Expect revert if token address is not a contract
            await expect(mutualizer.connect(assistant).payPremium(agreementId)).to.be.revertedWithoutReason();
          });
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
        const [, returnedStatus] = await mutualizer.getAgreement("1");

        // Values should match
        expect(returnedStatus.voided).to.be.true;
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

    context("👉 deposit()", function () {
      let amount;

      beforeEach(async function () {
        amount = ethers.utils.parseUnits("1", "ether");
      });

      context("💰 Native Token", function () {
        it("should emit an FundsDeposited event", async function () {
          // Deposit native token, test for event
          await expect(
            mutualizer.connect(mutualizerOwner).deposit(ethers.constants.AddressZero, amount, { value: amount })
          )
            .to.emit(mutualizer, "FundsDeposited")
            .withArgs(ethers.constants.AddressZero, amount, mutualizerOwner.address);
        });

        it("should update state", async function () {
          await expect(() =>
            mutualizer.connect(mutualizerOwner).deposit(ethers.constants.AddressZero, amount, { value: amount })
          ).to.changeEtherBalances([mutualizerOwner, mutualizer], [amount.mul(-1), amount]);
        });

        context("💔 Revert Reasons", async function () {
          it("value is not equal to _amount", async function () {
            // Expect revert if sent less than amount
            await expect(
              mutualizer
                .connect(mutualizerOwner)
                .deposit(ethers.constants.AddressZero, amount, { value: amount.sub(1) })
            ).to.be.revertedWith(RevertReasons.INSUFFICIENT_VALUE_RECEIVED);
          });
        });
      });

      context("💰 ERC20", function () {
        beforeEach(async function () {
          await foreign20.connect(mutualizerOwner).mint(mutualizerOwner.address, amount);
          await foreign20.connect(mutualizerOwner).approve(mutualizer.address, amount);
        });

        it("should emit an FundsDeposited event", async function () {
          // Deposit ERC20 token, test for event
          await expect(mutualizer.connect(mutualizerOwner).deposit(foreign20.address, amount))
            .to.emit(mutualizer, "FundsDeposited")
            .withArgs(foreign20.address, amount, mutualizerOwner.address);
        });

        it("should update state", async function () {
          await expect(() =>
            mutualizer.connect(mutualizerOwner).deposit(foreign20.address, amount)
          ).to.changeTokenBalances(foreign20, [mutualizerOwner, mutualizer], [amount.mul(-1), amount]);
        });

        context("💔 Revert Reasons", async function () {
          it("native token is sent along", async function () {
            // Expect revert if native token is sent along
            await expect(
              mutualizer.connect(mutualizerOwner).deposit(foreign20.address, amount, { value: 1 })
            ).to.be.revertedWith(RevertReasons.NATIVE_NOT_ALLOWED);
          });

          it("transferFrom fails", async function () {
            amount = amount.add(1);
            await foreign20.connect(mutualizerOwner).approve(mutualizer.address, amount);

            // Expect revert if amount higher than token balance
            await expect(mutualizer.connect(mutualizerOwner).deposit(foreign20.address, amount)).to.be.revertedWith(
              RevertReasons.ERC20_EXCEEDS_BALANCE
            );

            // Expect revert if amount higher than allowance
            await expect(
              mutualizer.connect(mutualizerOwner).deposit(foreign20.address, amount.add(1))
            ).to.be.revertedWith(RevertReasons.ERC20_INSUFFICIENT_ALLOWANCE);
          });

          it("value is not equal to _amount", async function () {
            // Deploy ERC20 with fees
            const [foreign20WithFee] = await deployMockTokens(["Foreign20WithFee"]);

            // mint tokens and approve
            await foreign20WithFee.mint(mutualizerOwner.address, amount);
            await foreign20WithFee.connect(mutualizerOwner).approve(mutualizer.address, amount);

            // Expect revert if value does not match amount
            await expect(
              mutualizer.connect(mutualizerOwner).deposit(foreign20WithFee.address, amount)
            ).to.be.revertedWith(RevertReasons.INSUFFICIENT_VALUE_RECEIVED);
          });

          it("Token address contract does not support transferFrom", async function () {
            // Deploy a contract without the transferFrom
            const [bosonToken] = await deployMockTokens(["BosonToken"]);

            // Attempt to deposit the funds, expecting revert
            await expect(mutualizer.connect(mutualizerOwner).deposit(bosonToken.address, amount)).to.be.revertedWith(
              RevertReasons.SAFE_ERC20_LOW_LEVEL_CALL
            );
          });

          it("Token address is not a contract", async function () {
            // Attempt to deposit the funds, expecting revert
            await expect(
              mutualizer.connect(mutualizerOwner).deposit(assistant.address, amount)
            ).to.be.revertedWithoutReason();
          });
        });
      });

      it("anyone can deposit on mutualizer owner's behalf", async function () {
        // Deposit native token, test for event
        await expect(mutualizer.connect(rando).deposit(ethers.constants.AddressZero, amount, { value: amount }))
          .to.emit(mutualizer, "FundsDeposited")
          .withArgs(ethers.constants.AddressZero, amount, rando.address);
      });
    });

    context("👉 withdraw()", function () {
      let amount, amountToWithdraw;

      beforeEach(async function () {
        amount = ethers.utils.parseUnits("1", "ether");
        await mutualizer.connect(mutualizerOwner).deposit(ethers.constants.AddressZero, amount, { value: amount });

        amountToWithdraw = amount.div(2);
      });

      context("💰 Native Token", function () {
        it("should emit an FundsWithdrawn event", async function () {
          // Withdraw native token, test for event
          await expect(mutualizer.connect(mutualizerOwner).withdraw(ethers.constants.AddressZero, amountToWithdraw))
            .to.emit(mutualizer, "FundsWithdrawn")
            .withArgs(ethers.constants.AddressZero, amountToWithdraw);
        });

        it("should update state", async function () {
          await expect(() =>
            mutualizer.connect(mutualizerOwner).withdraw(ethers.constants.AddressZero, amountToWithdraw)
          ).to.changeEtherBalances([mutualizerOwner, mutualizer], [amountToWithdraw, amountToWithdraw.mul(-1)]);
        });

        it("it is possible to withdraw the full amount", async function () {
          amountToWithdraw = amount;

          // Withdraw native token, test for event
          await expect(mutualizer.connect(mutualizerOwner).withdraw(ethers.constants.AddressZero, amountToWithdraw))
            .to.emit(mutualizer, "FundsWithdrawn")
            .withArgs(ethers.constants.AddressZero, amountToWithdraw);
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the owner", async function () {
            // Expect revert if caller is not the mutualizer owner
            await expect(
              mutualizer.connect(rando).withdraw(ethers.constants.AddressZero, amountToWithdraw)
            ).to.be.revertedWith(RevertReasons.OWNABLE_NOT_OWNER);
          });

          it("amount exceeds available balance", async function () {
            amountToWithdraw = amount.add(1);

            // Expect revert if trying to withdraw more than available balance
            await expect(
              mutualizer.connect(mutualizerOwner).withdraw(ethers.constants.AddressZero, amountToWithdraw)
            ).to.be.revertedWith(RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS);
          });

          it("Transfer of funds failed - no payable fallback or receive", async function () {
            // deploy a contract that cannot receive funds
            const [fallbackErrorContract] = await deployMockTokens(["WithoutFallbackError"]);

            // transfer ownership
            await mutualizer.connect(mutualizerOwner).transferOwnership(fallbackErrorContract.address);

            // Expect revert if mutualizer owner cannot receive funds
            await expect(
              fallbackErrorContract.withdrawMutualizerFunds(
                mutualizer.address,
                ethers.constants.AddressZero,
                amountToWithdraw
              )
            ).to.be.revertedWith(RevertReasons.TOKEN_TRANSFER_FAILED);
          });

          it("Transfer of funds failed - revert in fallback", async function () {
            // deploy a contract that cannot receive funds
            const [fallbackErrorContract] = await deployMockTokens(["FallbackError"]);

            // transfer ownership
            await mutualizer.connect(mutualizerOwner).transferOwnership(fallbackErrorContract.address);

            // Expect revert if mutualizer owner cannot receive funds
            await expect(
              fallbackErrorContract.withdrawMutualizerFunds(
                mutualizer.address,
                ethers.constants.AddressZero,
                amountToWithdraw
              )
            ).to.be.revertedWith(RevertReasons.TOKEN_TRANSFER_FAILED);
          });
        });
      });

      context("💰 ERC20", function () {
        beforeEach(async function () {
          await foreign20.connect(mutualizerOwner).mint(mutualizerOwner.address, amount);
          await foreign20.connect(mutualizerOwner).approve(mutualizer.address, amount);

          await mutualizer.connect(mutualizerOwner).deposit(foreign20.address, amount);

          amountToWithdraw = amount.div(2);
        });

        it("should emit an FundsWithdrawn event", async function () {
          // Withdraw ERC20 token, test for event
          await expect(mutualizer.connect(mutualizerOwner).withdraw(foreign20.address, amountToWithdraw))
            .to.emit(mutualizer, "FundsWithdrawn")
            .withArgs(foreign20.address, amountToWithdraw);
        });

        it("should update state", async function () {
          await expect(() =>
            mutualizer.connect(mutualizerOwner).withdraw(foreign20.address, amountToWithdraw)
          ).to.changeTokenBalances(
            foreign20,
            [mutualizerOwner, mutualizer],
            [amountToWithdraw, amountToWithdraw.mul(-1)]
          );
        });

        context("💔 Revert Reasons", async function () {
          it("amount exceeds available balance", async function () {
            amountToWithdraw = amount.add(1);

            // Expect revert if trying to withdraw more than available balance
            await expect(
              mutualizer.connect(mutualizerOwner).withdraw(foreign20.address, amountToWithdraw)
            ).to.be.revertedWith(RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS);
          });

          it("Transfer of funds failed - ERC20 token does not exist anymore", async function () {
            // destruct foreign20
            await foreign20.destruct();

            // Expect revert if ERC20 does not exist anymore
            await expect(
              mutualizer.connect(mutualizerOwner).withdraw(foreign20.address, amountToWithdraw)
            ).to.be.revertedWithoutReason();
          });

          it("Transfer of funds failed - revert during ERC20 transfer", async function () {
            // foreign20 mockToken
            await foreign20.pause();

            // Expect revert if ERC20 reverts during transfer
            await expect(
              mutualizer.connect(mutualizerOwner).withdraw(foreign20.address, amountToWithdraw)
            ).to.be.revertedWith(RevertReasons.ERC20_PAUSED);
          });

          it("Transfer of funds failed - ERC20 returns false", async function () {
            const [foreign20ReturnFalse] = await deployMockTokens(["Foreign20TransferReturnFalse"]);

            await foreign20ReturnFalse.connect(mutualizerOwner).mint(mutualizerOwner.address, amount);
            await foreign20ReturnFalse.connect(mutualizerOwner).approve(mutualizer.address, amount);
            await mutualizer.connect(mutualizerOwner).deposit(foreign20ReturnFalse.address, amount);

            // Expect revert if ERC20 returns false during transfer
            await expect(
              mutualizer.connect(mutualizerOwner).withdraw(foreign20ReturnFalse.address, amountToWithdraw)
            ).to.be.revertedWith(RevertReasons.SAFE_ERC20_NOT_SUCCEEDED);
          });
        });
      });

      it("anyone can deposit on mutualizer owner's behalf", async function () {
        // Deposit native token, test for event
        await expect(mutualizer.connect(rando).deposit(ethers.constants.AddressZero, amount, { value: amount }))
          .to.emit(mutualizer, "FundsDeposited")
          .withArgs(ethers.constants.AddressZero, amount, rando.address);
      });
    });

    context("👉 getAgreement()", function () {
      it("returns the correct agreement", async function () {
        let expectedAgreementStatus = new AgreementStatus(false, false, "0", "0");

        await mutualizer.connect(mutualizerOwner).newAgreement(agreement);

        // Get agreement object from contract
        const [returnedAgreement, returnedAgreementStatus] = await mutualizer.getAgreement("1");
        const returnedAgreementStruct = Agreement.fromStruct(returnedAgreement);
        const returnedAgreementStatusStruct = AgreementStatus.fromStruct(returnedAgreementStatus);

        // Values should match
        expect(returnedAgreementStruct.toString()).eq(agreement.toString());
        expect(returnedAgreementStatusStruct.toString()).eq(expectedAgreementStatus.toString());
      });

      context("💔 Revert Reasons", async function () {
        it("agreement does not exist", async function () {
          // Index out of bound
          await expect(mutualizer.getAgreement("0")).to.be.revertedWith(RevertReasons.INVALID_AGREEMENT);

          await expect(mutualizer.getAgreement("10")).to.be.revertedWith(RevertReasons.INVALID_AGREEMENT);
        });
      });
    });

    context("👉 getConfirmedAgreementBySellerAndToken()", function () {
      let agreementId;

      beforeEach(async function () {
        agreementId = "1";
        await mutualizer.connect(mutualizerOwner).newAgreement(agreement);
        await mutualizer.connect(assistant).payPremium(agreementId, { value: agreement.premium });
      });

      it("returns the correct agreement", async function () {
        let expectedAgreementStatus = new AgreementStatus(true, false, "0", "0");
        // Get agreement id and agreement object from contract
        const [returnedAgreementId, returnedAgreement, returnedAgreementStatus] =
          await mutualizer.getConfirmedAgreementBySellerAndToken(agreement.sellerAddress, agreement.token);
        const returnedAgreementStruct = Agreement.fromStruct(returnedAgreement);
        const returnedAgreementStatusStruct = AgreementStatus.fromStruct(returnedAgreementStatus);

        // Values should match
        expect(returnedAgreementStruct.toString()).eq(agreement.toString());
        expect(returnedAgreementStatusStruct.toString()).eq(expectedAgreementStatus.toString());
        expect(returnedAgreementId.toString()).eq(agreementId);
      });

      context("💔 Revert Reasons", async function () {
        it("agreement does not exist - no agreement for the token", async function () {
          // Seller has no agreement for the token
          await expect(
            mutualizer.getConfirmedAgreementBySellerAndToken(assistant.address, foreign20.address)
          ).to.be.revertedWith(RevertReasons.INVALID_AGREEMENT);
        });

        it("agreement does not exist - no agreement for the seller", async function () {
          // Rando has no agreement
          await expect(
            mutualizer.getConfirmedAgreementBySellerAndToken(rando.address, ethers.constants.AddressZero)
          ).to.be.revertedWith(RevertReasons.INVALID_AGREEMENT);
        });

        it("agreement not confirmed yet", async function () {
          // Create a new agreement, but don't confirm it
          agreement.token = foreign20.address;
          await mutualizer.connect(mutualizerOwner).newAgreement(agreement);

          // Seller has no agreement for the token
          await expect(
            mutualizer.getConfirmedAgreementBySellerAndToken(assistant.address, foreign20.address)
          ).to.be.revertedWith(RevertReasons.INVALID_AGREEMENT);
        });
      });
    });
  });

  context("📋 DRMutualizer protocol methods", async function () {
    let agreement;

    beforeEach(function () {
      const startTimestamp = ethers.BigNumber.from(Date.now()).div(1000); // valid from now
      const endTimestamp = startTimestamp.add(oneMonth); // valid for 30 days
      agreement = new Agreement(
        assistant.address,
        ethers.constants.AddressZero,
        ethers.utils.parseUnits("1", "ether").toString(),
        ethers.utils.parseUnits("2", "ether").toString(),
        ethers.utils.parseUnits("0.001", "ether").toString(),
        startTimestamp.toString(),
        endTimestamp.toString(),
        false,
        false
      );
    });

    context("👉 requestDRFee()", function () {
      let amount, amountToRequest;

      context("💰 Native Token", function () {
        let agreementId;

        beforeEach(async function () {
          agreementId = "1";

          amount = agreement.maxTotalMutualizedAmount;
          await mutualizer.connect(mutualizerOwner).deposit(ethers.constants.AddressZero, amount, { value: amount });

          // Create a new agreement
          await mutualizer.connect(mutualizerOwner).newAgreement(agreement);
          await mutualizer.connect(assistant).payPremium(agreementId, { value: agreement.premium });

          amountToRequest = ethers.BigNumber.from(agreement.maxMutualizedAmountPerTransaction).div(2);
        });

        it("should emit a DRFeeSent event", async function () {
          // Request DR fee, test for event
          await expect(
            mutualizer
              .connect(protocol)
              .requestDRFee(assistant.address, ethers.constants.AddressZero, amountToRequest, "0x")
          )
            .to.emit(mutualizer, "DRFeeSent")
            .withArgs(protocol.address, ethers.constants.AddressZero, amountToRequest, "1");
        });

        it("should return correct values", async function () {
          // Request DR fee, get return values
          const [isCovered, uuid] = await mutualizer
            .connect(protocol)
            .callStatic.requestDRFee(assistant.address, ethers.constants.AddressZero, amountToRequest, "0x");

          expect(isCovered).to.be.true;
          expect(uuid).to.be.equal("1");
        });

        it("should transfer funds", async function () {
          await expect(() =>
            mutualizer
              .connect(protocol)
              .requestDRFee(assistant.address, ethers.constants.AddressZero, amountToRequest, "0x")
          ).to.changeEtherBalances([protocol, mutualizer], [amountToRequest, amountToRequest.mul(-1)]);
        });

        it("should update state", async function () {
          await mutualizer
            .connect(protocol)
            .requestDRFee(assistant.address, ethers.constants.AddressZero, amountToRequest, "0x");

          let expectedAgreementStatus = new AgreementStatus(true, false, "1", amountToRequest.toString());

          // Get agreement object from contract
          const [, returnedAgreementStatus] = await mutualizer.getAgreement("1");
          const returnedAgreementStatusStruct = AgreementStatus.fromStruct(returnedAgreementStatus);
          expect(returnedAgreementStatusStruct.toString()).eq(expectedAgreementStatus.toString());
        });

        it("it is possible to request max mutualized amount per transaction", async function () {
          amountToRequest = agreement.maxMutualizedAmountPerTransaction;

          // Request DR fee, test for event
          await expect(
            mutualizer
              .connect(protocol)
              .requestDRFee(assistant.address, ethers.constants.AddressZero, amountToRequest, "0x")
          )
            .to.emit(mutualizer, "DRFeeSent")
            .withArgs(protocol.address, ethers.constants.AddressZero, amountToRequest, "1");
        });

        it("it is possible to request max total mutualized amount", async function () {
          amountToRequest = agreement.maxMutualizedAmountPerTransaction;

          // Request twice to reach max total mutualized amount
          await expect(
            mutualizer
              .connect(protocol)
              .requestDRFee(assistant.address, ethers.constants.AddressZero, amountToRequest, "0x")
          )
            .to.emit(mutualizer, "DRFeeSent")
            .withArgs(protocol.address, ethers.constants.AddressZero, amountToRequest, "1");

          await expect(
            mutualizer
              .connect(protocol)
              .requestDRFee(assistant.address, ethers.constants.AddressZero, amountToRequest, "0x")
          )
            .to.emit(mutualizer, "DRFeeSent")
            .withArgs(protocol.address, ethers.constants.AddressZero, amountToRequest, "2");
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the protocol", async function () {
            // Expect revert if caller is not the protocol
            await expect(
              mutualizer
                .connect(rando)
                .requestDRFee(assistant.address, ethers.constants.AddressZero, amountToRequest, "0x")
            ).to.be.revertedWith(RevertReasons.ONLY_PROTOCOL);
          });

          it("agreement does not exist - no agreement for the token", async function () {
            // Seller has no agreement for the token
            await expect(
              mutualizer.connect(protocol).requestDRFee(assistant.address, foreign20.address, amountToRequest, "0x")
            ).to.be.revertedWith(RevertReasons.INVALID_AGREEMENT);
          });

          it("agreement does not exist - no agreement for the seller", async function () {
            // Rando has no agreement
            await expect(
              mutualizer
                .connect(protocol)
                .requestDRFee(rando.address, ethers.constants.AddressZero, amountToRequest, "0x")
            ).to.be.revertedWith(RevertReasons.INVALID_AGREEMENT);
          });

          it("agreement not confirmed yet", async function () {
            // Create a new agreement, but don't confirm it
            agreement.token = foreign20.address;
            await mutualizer.connect(mutualizerOwner).newAgreement(agreement);

            // Seller has no agreement for the token
            await expect(
              mutualizer.connect(protocol).requestDRFee(assistant.address, foreign20.address, amountToRequest, "0x")
            ).to.be.revertedWith(RevertReasons.INVALID_AGREEMENT);
          });

          it("agreement is voided", async function () {
            await mutualizer.connect(mutualizerOwner).voidAgreement(agreementId);

            // Agreement is voided
            await expect(
              mutualizer
                .connect(protocol)
                .requestDRFee(assistant.address, ethers.constants.AddressZero, amountToRequest, "0x")
            ).to.be.revertedWith(RevertReasons.AGREEMENT_VOIDED);
          });

          it("agreement has not started yet", async function () {
            // Create a new agreement with start date in the future
            const startTimestamp = ethers.BigNumber.from(Date.now())
              .div(1000)
              .add(oneMonth / 2); // valid in the future
            agreement.startTimestamp = startTimestamp.toString();
            await mutualizer.connect(mutualizerOwner).newAgreement(agreement);
            await mutualizer.connect(assistant).payPremium(++agreementId, { value: agreement.premium });

            // Agreement has not started yet
            await expect(
              mutualizer
                .connect(protocol)
                .requestDRFee(assistant.address, ethers.constants.AddressZero, amountToRequest, "0x")
            ).to.be.revertedWith(RevertReasons.AGREEMENT_NOT_STARTED);
          });

          it("agreement expired", async function () {
            await setNextBlockTimestamp(ethers.BigNumber.from(agreement.endTimestamp).add(1).toHexString());

            // Agreement expired
            await expect(
              mutualizer
                .connect(protocol)
                .requestDRFee(assistant.address, ethers.constants.AddressZero, amountToRequest, "0x")
            ).to.be.revertedWith(RevertReasons.AGREEMENT_EXPIRED);
          });

          it("fee amount exceeds max mutualized amount per transaction", async function () {
            amountToRequest = ethers.BigNumber.from(agreement.maxMutualizedAmountPerTransaction).add(1);

            // Expect revert if trying to withdraw more than max mutualized amount per transaction
            await expect(
              mutualizer
                .connect(protocol)
                .requestDRFee(assistant.address, ethers.constants.AddressZero, amountToRequest, "0x")
            ).to.be.revertedWith(RevertReasons.EXCEEDED_SINGLE_FEE);
          });

          it("fee amount exceeds max total mutualized amount", async function () {
            amountToRequest = agreement.maxMutualizedAmountPerTransaction;

            // Request twice to reach max total mutualized amount
            await mutualizer
              .connect(protocol)
              .requestDRFee(assistant.address, ethers.constants.AddressZero, amountToRequest, "0x");
            await mutualizer
              .connect(protocol)
              .requestDRFee(assistant.address, ethers.constants.AddressZero, amountToRequest, "0x");

            // Expect revert if requested more than max mutualized amount per transaction
            amountToRequest = "1";
            await expect(
              mutualizer
                .connect(protocol)
                .requestDRFee(assistant.address, ethers.constants.AddressZero, amountToRequest, "0x")
            ).to.be.revertedWith(RevertReasons.EXCEEDED_TOTAL_FEE);
          });

          it("amount exceeds available balance", async function () {
            const amountToWithdraw = ethers.BigNumber.from(agreement.maxTotalMutualizedAmount)
              .add(agreement.premium)
              .sub(amountToRequest)
              .add(1);
            await mutualizer.connect(mutualizerOwner).withdraw(ethers.constants.AddressZero, amountToWithdraw);

            // Expect revert if requested more than available balance
            await expect(
              mutualizer
                .connect(protocol)
                .requestDRFee(assistant.address, ethers.constants.AddressZero, amountToRequest, "0x")
            ).to.be.revertedWith(RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS);
          });
        });
      });

      context("💰 ERC20", function () {
        beforeEach(async function () {
          let agreementId = "1";

          amount = agreement.maxTotalMutualizedAmount;
          await foreign20.connect(mutualizerOwner).mint(mutualizerOwner.address, amount);
          await foreign20.connect(mutualizerOwner).approve(mutualizer.address, amount);
          await mutualizer.connect(mutualizerOwner).deposit(foreign20.address, amount);

          // Create a new agreement
          agreement.token = foreign20.address;
          await mutualizer.connect(mutualizerOwner).newAgreement(agreement);
          // Confirm the agreement
          await foreign20.connect(assistant).mint(assistant.address, agreement.premium);
          await foreign20.connect(assistant).approve(mutualizer.address, agreement.premium);
          await mutualizer.connect(assistant).payPremium(agreementId);

          amountToRequest = ethers.BigNumber.from(agreement.maxMutualizedAmountPerTransaction).div(2);
        });

        it("should emit a DRFeeSent event", async function () {
          // Request DR fee, test for event
          await expect(
            mutualizer.connect(protocol).requestDRFee(assistant.address, foreign20.address, amountToRequest, "0x")
          )
            .to.emit(mutualizer, "DRFeeSent")
            .withArgs(protocol.address, foreign20.address, amountToRequest, "1");
        });

        it("should transfer funds", async function () {
          await expect(() =>
            mutualizer.connect(protocol).requestDRFee(assistant.address, foreign20.address, amountToRequest, "0x")
          ).to.changeTokenBalances(foreign20, [protocol, mutualizer], [amountToRequest, amountToRequest.mul(-1)]);
        });

        context("💔 Revert Reasons", async function () {
          it("amount exceeds available balance", async function () {
            const amountToWithdraw = ethers.BigNumber.from(agreement.maxTotalMutualizedAmount)
              .add(agreement.premium)
              .sub(amountToRequest)
              .add(1);
            await mutualizer.connect(mutualizerOwner).withdraw(foreign20.address, amountToWithdraw);

            // Expect revert if requested more than available balance
            await expect(
              mutualizer.connect(protocol).requestDRFee(assistant.address, foreign20.address, amountToRequest, "0x")
            ).to.be.revertedWith(RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS);
          });

          it("Transfer of funds failed - ERC20 token does not exist anymore", async function () {
            // destruct foreign20
            await foreign20.destruct();

            // Expect revert if ERC20 does not exist anymore
            await expect(
              mutualizer.connect(protocol).requestDRFee(assistant.address, foreign20.address, amountToRequest, "0x")
            ).to.be.revertedWithoutReason();
          });

          it("Transfer of funds failed - revert during ERC20 transfer", async function () {
            // foreign20 mockToken
            await foreign20.pause();

            // Expect revert if ERC20 reverts during transfer
            await expect(
              mutualizer.connect(protocol).requestDRFee(assistant.address, foreign20.address, amountToRequest, "0x")
            ).to.be.revertedWith(RevertReasons.ERC20_PAUSED);
          });
        });
      });
    });

    context("👉 returnDRFee()", function () {
      let amount, DRFee;

      context("💰 Native Token", function () {
        let uuid;

        beforeEach(async function () {
          const agreementId = "1";
          uuid = "1";

          amount = agreement.maxTotalMutualizedAmount;
          await mutualizer.connect(mutualizerOwner).deposit(ethers.constants.AddressZero, amount, { value: amount });

          // Create a new agreement
          await mutualizer.connect(mutualizerOwner).newAgreement(agreement);
          await mutualizer.connect(assistant).payPremium(agreementId, { value: agreement.premium });

          // Request the DR fee
          DRFee = ethers.BigNumber.from(agreement.maxMutualizedAmountPerTransaction).div(2);
          await mutualizer.connect(protocol).requestDRFee(assistant.address, ethers.constants.AddressZero, DRFee, "0x");
        });

        it("should emit a DRFeeReturned event", async function () {
          // Return DR fee, test for event
          await expect(mutualizer.connect(protocol).returnDRFee(uuid, DRFee, "0x", { value: DRFee }))
            .to.emit(mutualizer, "DRFeeReturned")
            .withArgs(uuid, ethers.constants.AddressZero, DRFee, "0x");
        });

        it("should transfer funds", async function () {
          await expect(() =>
            mutualizer.connect(protocol).returnDRFee(uuid, DRFee, "0x", { value: DRFee })
          ).to.changeEtherBalances([protocol, mutualizer], [DRFee.mul(-1), DRFee]);
        });

        it("should update state", async function () {
          let returnedDRFee = DRFee.div(10).mul(9);
          await mutualizer.connect(protocol).returnDRFee(uuid, returnedDRFee, "0x", { value: returnedDRFee });

          let expectedAgreementStatus = new AgreementStatus(true, false, "0", DRFee.sub(returnedDRFee).toString());

          // Get agreement object from contract
          const [, returnedAgreementStatus] = await mutualizer.getAgreement("1");
          const returnedAgreementStatusStruct = AgreementStatus.fromStruct(returnedAgreementStatus);
          expect(returnedAgreementStatusStruct.toString()).eq(expectedAgreementStatus.toString());
        });

        it("It is possible to return 0 fee", async function () {
          DRFee = "0";
          // Return DR fee, test for event
          await expect(mutualizer.connect(protocol).returnDRFee(uuid, DRFee, "0x", { value: DRFee }))
            .to.emit(mutualizer, "DRFeeReturned")
            .withArgs(uuid, ethers.constants.AddressZero, DRFee, "0x");
        });

        it("It is possible to return more than it received", async function () {
          let returnedDRFee = DRFee.div(10).mul(11);
          await mutualizer.connect(protocol).returnDRFee(uuid, returnedDRFee, "0x", { value: returnedDRFee });

          let expectedAgreementStatus = new AgreementStatus(true, false, "0", "0");

          // Get agreement object from contract
          const [, returnedAgreementStatus] = await mutualizer.getAgreement("1");
          const returnedAgreementStatusStruct = AgreementStatus.fromStruct(returnedAgreementStatus);
          expect(returnedAgreementStatusStruct.toString()).eq(expectedAgreementStatus.toString());
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the protocol", async function () {
            // Expect revert if caller is not the protocol
            await expect(mutualizer.connect(rando).returnDRFee(uuid, DRFee, "0x", { value: DRFee })).to.be.revertedWith(
              RevertReasons.ONLY_PROTOCOL
            );
          });

          it("uuid does not exist", async function () {
            uuid = "2";

            // Invalid uuid
            await expect(
              mutualizer.connect(protocol).returnDRFee(uuid, DRFee, "0x", { value: DRFee })
            ).to.be.revertedWith(RevertReasons.INVALID_UUID);
          });

          it("same uuid is used twice", async function () {
            await mutualizer.connect(protocol).returnDRFee(uuid, DRFee, "0x", { value: DRFee });

            // Invalid uuid
            await expect(
              mutualizer.connect(protocol).returnDRFee(uuid, DRFee, "0x", { value: DRFee })
            ).to.be.revertedWith(RevertReasons.INVALID_UUID);
          });

          it("sent value is not equal to _feeAmount", async function () {
            await expect(
              mutualizer.connect(protocol).returnDRFee(uuid, DRFee, "0x", { value: DRFee.add(1) })
            ).to.be.revertedWith(RevertReasons.INSUFFICIENT_VALUE_RECEIVED);
          });
        });
      });

      context("💰 ERC20", function () {
        let uuid;

        beforeEach(async function () {
          const agreementId = "1";
          uuid = "1";

          amount = agreement.maxTotalMutualizedAmount;
          await foreign20.connect(mutualizerOwner).mint(mutualizerOwner.address, amount);
          await foreign20.connect(mutualizerOwner).approve(mutualizer.address, amount);
          await mutualizer.connect(mutualizerOwner).deposit(foreign20.address, amount);

          // Create a new agreement
          agreement.token = foreign20.address;
          await mutualizer.connect(mutualizerOwner).newAgreement(agreement);
          // Confirm the agreement
          await foreign20.connect(assistant).mint(assistant.address, agreement.premium);
          await foreign20.connect(assistant).approve(mutualizer.address, agreement.premium);
          await mutualizer.connect(assistant).payPremium(agreementId);

          // Request the DR fee
          DRFee = ethers.BigNumber.from(agreement.maxMutualizedAmountPerTransaction).div(2);
          await mutualizer.connect(protocol).requestDRFee(assistant.address, foreign20.address, DRFee, "0x");

          // Approve the mutualizer to transfer fees back
          await foreign20.connect(protocol).approve(mutualizer.address, DRFee);
        });

        it("should emit a DRFeeReturned event", async function () {
          // Return DR fee, test for event
          await expect(mutualizer.connect(protocol).returnDRFee(uuid, DRFee, "0x"))
            .to.emit(mutualizer, "DRFeeReturned")
            .withArgs(uuid, foreign20.address, DRFee, "0x");
        });

        it("should transfer funds", async function () {
          await expect(() => mutualizer.connect(protocol).returnDRFee(uuid, DRFee, "0x")).to.changeTokenBalances(
            foreign20,
            [protocol, mutualizer],
            [DRFee.mul(-1), DRFee]
          );
        });

        context("💔 Revert Reasons", async function () {
          it("native token is sent along", async function () {
            // Expect revert if native token is sent along
            await expect(
              mutualizer.connect(protocol).returnDRFee(uuid, DRFee, "0x", { value: DRFee })
            ).to.be.revertedWith(RevertReasons.NATIVE_NOT_ALLOWED);
          });

          it("transferFrom fails", async function () {
            await foreign20.connect(protocol).transfer(rando.address, "1"); // transfer to reduce balance

            // Expect revert if DRFee is higher than token balance
            await expect(mutualizer.connect(protocol).returnDRFee(uuid, DRFee, "0x")).to.be.revertedWith(
              RevertReasons.ERC20_EXCEEDS_BALANCE
            );

            const reducedAllowance = DRFee.sub(1);
            await foreign20.connect(protocol).approve(mutualizer.address, reducedAllowance);

            // Expect revert if premium higher than allowance
            await expect(mutualizer.connect(protocol).returnDRFee(uuid, DRFee, "0x")).to.be.revertedWith(
              RevertReasons.ERC20_INSUFFICIENT_ALLOWANCE
            );
          });

          it("Transfer of funds failed - ERC20 token does not exist anymore", async function () {
            // destruct foreign20
            await foreign20.destruct();

            // Expect revert if ERC20 does not exist anymore
            await expect(mutualizer.connect(protocol).returnDRFee(uuid, DRFee, "0x")).to.be.revertedWithoutReason();
          });
        });
      });
    });

    context("👉 isSellerCovered()", function () {
      let amount, amountToRequest;
      let agreementId;

      beforeEach(async function () {
        agreementId = "1";

        amount = agreement.maxTotalMutualizedAmount;
        await mutualizer.connect(mutualizerOwner).deposit(ethers.constants.AddressZero, amount, { value: amount });

        // Create a new agreement
        await mutualizer.connect(mutualizerOwner).newAgreement(agreement);
        await mutualizer.connect(assistant).payPremium(agreementId, { value: agreement.premium });

        amountToRequest = ethers.BigNumber.from(agreement.maxMutualizedAmountPerTransaction).div(2);
      });

      it("should return true for a valid agreement", async function () {
        expect(
          await mutualizer.isSellerCovered(
            assistant.address,
            ethers.constants.AddressZero,
            amountToRequest,
            protocol.address,
            "0x"
          )
        ).to.be.true;
      });

      it("should return false if _feeRequester is not the protocol", async function () {
        expect(
          await mutualizer.isSellerCovered(
            assistant.address,
            ethers.constants.AddressZero,
            amountToRequest,
            rando.address,
            "0x"
          )
        ).to.be.false;
      });

      it("should return false if agreement does not exist - no agreement for the token", async function () {
        expect(
          await mutualizer.isSellerCovered(
            assistant.address,
            foreign20.address,
            amountToRequest,
            protocol.address,
            "0x"
          )
        ).to.be.false;
      });

      it("should return false if agreement does not exist - no agreement for the seller", async function () {
        expect(
          await mutualizer.isSellerCovered(
            rando.address,
            ethers.constants.AddressZero,
            amountToRequest,
            protocol.address,
            "0x"
          )
        ).to.be.false;
      });

      it("should return false if agreement not confirmed yet", async function () {
        // Create a new agreement, but don't confirm it
        agreement.token = foreign20.address;
        await mutualizer.connect(mutualizerOwner).newAgreement(agreement);

        expect(
          await mutualizer.isSellerCovered(
            assistant.address,
            foreign20.address,
            amountToRequest,
            protocol.address,
            "0x"
          )
        ).to.be.false;
      });

      it("should return false if agreement is voided", async function () {
        await mutualizer.connect(mutualizerOwner).voidAgreement(agreementId);

        expect(
          await mutualizer.isSellerCovered(
            assistant.address,
            ethers.constants.AddressZero,
            amountToRequest,
            protocol.address,
            "0x"
          )
        ).to.be.false;
      });

      it("should return false if agreement has not started yet", async function () {
        // Create a new agreement with start date in the future
        const startTimestamp = ethers.BigNumber.from(Date.now())
          .div(1000)
          .add(oneMonth / 2); // valid in the future
        agreement.startTimestamp = startTimestamp.toString();
        await mutualizer.connect(mutualizerOwner).newAgreement(agreement);
        await mutualizer.connect(assistant).payPremium(++agreementId, { value: agreement.premium });

        expect(
          await mutualizer.isSellerCovered(
            assistant.address,
            ethers.constants.AddressZero,
            amountToRequest,
            protocol.address,
            "0x"
          )
        ).to.be.false;
      });

      it("should return false if agreement expired", async function () {
        await setNextBlockTimestamp(ethers.BigNumber.from(agreement.endTimestamp).add(1).toHexString());

        expect(
          await mutualizer.isSellerCovered(
            assistant.address,
            ethers.constants.AddressZero,
            amountToRequest,
            protocol.address,
            "0x"
          )
        ).to.be.false;
      });

      it("should return false if fee amount exceeds max mutualized amount per transaction", async function () {
        amountToRequest = ethers.BigNumber.from(agreement.maxMutualizedAmountPerTransaction).add(1);

        expect(
          await mutualizer.isSellerCovered(
            assistant.address,
            ethers.constants.AddressZero,
            amountToRequest,
            protocol.address,
            "0x"
          )
        ).to.be.false;
      });

      it("should return false if fee amount exceeds max total mutualized amount", async function () {
        amountToRequest = agreement.maxMutualizedAmountPerTransaction;

        // Request twice to reach max total mutualized amount
        await mutualizer
          .connect(protocol)
          .requestDRFee(assistant.address, ethers.constants.AddressZero, amountToRequest, "0x");
        await mutualizer
          .connect(protocol)
          .requestDRFee(assistant.address, ethers.constants.AddressZero, amountToRequest, "0x");

        expect(
          await mutualizer.isSellerCovered(
            assistant.address,
            ethers.constants.AddressZero,
            amountToRequest,
            protocol.address,
            "0x"
          )
        ).to.be.false;
      });
    });
  });
});
