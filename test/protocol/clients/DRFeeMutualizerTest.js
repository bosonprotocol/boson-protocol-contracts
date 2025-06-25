const { ethers } = require("hardhat");
const { expect } = require("chai");
const { ZeroAddress, getSigners, getContractFactory, parseUnits } = ethers;
const { getSnapshot, revertToSnapshot, setNextBlockTimestamp } = require("../../util/utils.js");
const { deployMockTokens } = require("../../../scripts/util/deploy-mock-tokens");
const { RevertReasons } = require("../../../scripts/config/revert-reasons.js");

// Time period constants
const ONE_DAY = 24 * 60 * 60;
const TWO_DAYS = 2 * ONE_DAY;
const NINE_DAYS = 9 * ONE_DAY;
const TWELVE_DAYS = 12 * ONE_DAY;
const THIRTY_DAYS = 30 * ONE_DAY;
const THIRTY_ONE_DAYS = 31 * ONE_DAY;

// Ether amount constants
const ZERO_POINT_ONE_ETHER = parseUnits("0.1", "ether");
const ZERO_POINT_TWO_ETHER = parseUnits("0.2", "ether");
const ZERO_POINT_FIVE_ETHER = parseUnits("0.5", "ether");
const ZERO_POINT_THREE_ETHER = parseUnits("0.3", "ether");
const ONE_ETHER = parseUnits("1", "ether");
const TWO_ETHER = parseUnits("2", "ether");
const THREE_ETHER = parseUnits("3", "ether");
const FIVE_ETHER = parseUnits("5", "ether");
const EIGHT_ETHER = parseUnits("8", "ether");
const TEN_ETHER = parseUnits("10", "ether");
const TWENTY_ETHER = parseUnits("20", "ether");
const HUNDRED_ETHER = parseUnits("100", "ether");
const TWO_HUNDRED_ETHER = parseUnits("200", "ether");
const THOUSAND_ETHER = parseUnits("1000", "ether");

const setupMockProtocolAndMutualizer = async (sellerId, sellerAddress) => {
  const MockProtocolFactory = await getContractFactory("MockProtocol");
  const mockProtocol = await MockProtocolFactory.deploy();
  await mockProtocol.waitForDeployment();
  await mockProtocol.setSeller(sellerId, sellerAddress);

  const [owner] = await getSigners();
  await owner.sendTransaction({
    to: await mockProtocol.getAddress(),
    value: ethers.parseEther("10"),
  });

  const DRFeeMutualizerFactory = await getContractFactory("DRFeeMutualizer");
  const drFeeMutualizer = await DRFeeMutualizerFactory.deploy(await mockProtocol.getAddress());
  await drFeeMutualizer.waitForDeployment();
  return { mockProtocol, drFeeMutualizer };
};

describe("DRFeeMutualizer", function () {
  let drFeeMutualizer;
  let protocol, owner, seller, buyer, rando, mockToken;
  let snapshotId;

  before(async function () {
    [owner, protocol, seller, buyer, rando] = await getSigners();
    const DRFeeMutualizerFactory = await getContractFactory("DRFeeMutualizer");
    drFeeMutualizer = await DRFeeMutualizerFactory.deploy(await protocol.getAddress());
    await drFeeMutualizer.waitForDeployment();
    [mockToken] = await deployMockTokens(["Foreign20"]);
    await mockToken.mint(await owner.getAddress(), THOUSAND_ETHER);
    await mockToken.mint(await seller.getAddress(), THOUSAND_ETHER);
    await mockToken.mint(await protocol.getAddress(), THOUSAND_ETHER);
    snapshotId = await getSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();
  });

  context("📋 Constructor", async function () {
    it("should set owner correctly", async function () {
      expect(await drFeeMutualizer.owner()).to.equal(await owner.getAddress());
    });
  });

  context("📋 Pool Management", async function () {
    context("👉 deposit()", async function () {
      context("Native Currency", async function () {
        it("should deposit native currency successfully", async function () {
          const amount = ONE_ETHER;
          const balanceBefore = await drFeeMutualizer.getPoolBalance(ZeroAddress);

          await expect(drFeeMutualizer.connect(owner).deposit(ZeroAddress, amount, { value: amount }))
            .to.emit(drFeeMutualizer, "FundsDeposited")
            .withArgs(await owner.getAddress(), ZeroAddress, amount);

          const balanceAfter = await drFeeMutualizer.getPoolBalance(ZeroAddress);
          expect(balanceAfter - balanceBefore).to.equal(amount);
        });

        it("should allow anyone to deposit when not restricted", async function () {
          const amount = ZERO_POINT_FIVE_ETHER;
          await expect(drFeeMutualizer.connect(rando).deposit(ZeroAddress, amount, { value: amount }))
            .to.emit(drFeeMutualizer, "FundsDeposited")
            .withArgs(await rando.getAddress(), ZeroAddress, amount);
        });

        context("💔 Revert Reasons", async function () {
          it("should revert when no native currency sent", async function () {
            await expect(drFeeMutualizer.connect(owner).deposit(ZeroAddress, ONE_ETHER)).to.be.revertedWithCustomError(
              drFeeMutualizer,
              RevertReasons.INSUFFICIENT_VALUE_RECEIVED
            );
          });

          it("should revert when deposits are restricted to owner", async function () {
            await drFeeMutualizer.connect(owner).setDepositRestriction(true);
            await expect(
              drFeeMutualizer
                .connect(rando)
                .deposit(ZeroAddress, ZERO_POINT_FIVE_ETHER, { value: ZERO_POINT_FIVE_ETHER })
            ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.DEPOSITS_RESTRICTED_TO_OWNER);
          });

          it("should revert when amount is zero", async function () {
            await expect(
              drFeeMutualizer.connect(owner).deposit(ZeroAddress, 0, { value: 0 })
            ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.INVALID_AMOUNT);
          });
        });
      });

      context("ERC20 Token", async function () {
        it("should deposit ERC20 token successfully", async function () {
          const amount = HUNDRED_ETHER;
          await mockToken.connect(owner).approve(await drFeeMutualizer.getAddress(), amount);

          const balanceBefore = await drFeeMutualizer.getPoolBalance(await mockToken.getAddress());

          await expect(drFeeMutualizer.connect(owner).deposit(await mockToken.getAddress(), amount))
            .to.emit(drFeeMutualizer, "FundsDeposited")
            .withArgs(await owner.getAddress(), await mockToken.getAddress(), amount);

          const balanceAfter = await drFeeMutualizer.getPoolBalance(await mockToken.getAddress());
          expect(balanceAfter - balanceBefore).to.equal(amount);
        });

        context("💔 Revert Reasons", async function () {
          it("should revert when native currency sent with ERC20 deposit", async function () {
            const amount = HUNDRED_ETHER;
            await mockToken.connect(owner).approve(await drFeeMutualizer.getAddress(), amount);

            await expect(
              drFeeMutualizer.connect(owner).deposit(await mockToken.getAddress(), amount, { value: 1000 })
            ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.NATIVE_NOT_ALLOWED);
          });

          it("should revert when amount is zero", async function () {
            await expect(
              drFeeMutualizer.connect(owner).deposit(await mockToken.getAddress(), 0)
            ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.INVALID_AMOUNT);
          });
        });
      });
    });

    context("👉 withdraw()", async function () {
      beforeEach(async function () {
        await drFeeMutualizer.connect(owner).deposit(ZeroAddress, TWO_ETHER, { value: TWO_ETHER });
        await mockToken.connect(owner).approve(await drFeeMutualizer.getAddress(), TWO_HUNDRED_ETHER);
        await drFeeMutualizer.connect(owner).deposit(await mockToken.getAddress(), TWO_HUNDRED_ETHER);
      });

      context("Native Currency", async function () {
        it("should withdraw native currency successfully", async function () {
          const amount = ONE_ETHER;
          const balanceBefore = await ethers.provider.getBalance(await buyer.getAddress());

          await expect(drFeeMutualizer.connect(owner).withdraw(ZeroAddress, amount, await buyer.getAddress()))
            .to.emit(drFeeMutualizer, "FundsWithdrawn")
            .withArgs(await buyer.getAddress(), ZeroAddress, amount);

          const balanceAfter = await ethers.provider.getBalance(await buyer.getAddress());
          expect(balanceAfter - balanceBefore).to.equal(amount);
        });

        context("💔 Revert Reasons", async function () {
          it("should revert when caller is not owner", async function () {
            await expect(
              drFeeMutualizer.connect(rando).withdraw(ZeroAddress, ONE_ETHER, await buyer.getAddress())
            ).to.be.revertedWith(RevertReasons.OWNABLE_NOT_OWNER);
          });

          it("should revert when amount is zero", async function () {
            await expect(
              drFeeMutualizer.connect(owner).withdraw(ZeroAddress, 0, await buyer.getAddress())
            ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.INVALID_AMOUNT);
          });

          it("should revert when recipient is zero address", async function () {
            await expect(
              drFeeMutualizer.connect(owner).withdraw(ZeroAddress, ONE_ETHER, ZeroAddress)
            ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.INVALID_RECIPIENT);
          });

          it("should revert when insufficient balance", async function () {
            await expect(
              drFeeMutualizer.connect(owner).withdraw(ZeroAddress, TEN_ETHER, await buyer.getAddress())
            ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.INSUFFICIENT_POOL_BALANCE);
          });
        });
      });

      context("ERC20 Token", async function () {
        it("should withdraw ERC20 token successfully", async function () {
          const amount = HUNDRED_ETHER;
          const balanceBefore = await mockToken.balanceOf(await buyer.getAddress());

          await expect(
            drFeeMutualizer.connect(owner).withdraw(await mockToken.getAddress(), amount, await buyer.getAddress())
          )
            .to.emit(drFeeMutualizer, "FundsWithdrawn")
            .withArgs(await buyer.getAddress(), await mockToken.getAddress(), amount);

          const balanceAfter = await mockToken.balanceOf(await buyer.getAddress());
          expect(balanceAfter - balanceBefore).to.equal(amount);
        });
      });
    });

    context("👉 getPoolBalance()", async function () {
      it("should return correct pool balance", async function () {
        const amount = ONE_ETHER;
        await drFeeMutualizer.connect(owner).deposit(ZeroAddress, amount, { value: amount });
        const balance = await drFeeMutualizer.getPoolBalance(ZeroAddress);
        expect(balance).to.equal(amount);
      });

      it("should return zero for non-existent token", async function () {
        const balance = await drFeeMutualizer.getPoolBalance(await rando.getAddress());
        expect(balance).to.equal(0);
      });
    });
  });

  context("📋 Agreement Management", async function () {
    let drFeeMutualizer;
    const sellerId = 1;

    beforeEach(async function () {
      const setup = await setupMockProtocolAndMutualizer(sellerId, seller.address);
      drFeeMutualizer = setup.drFeeMutualizer;
    });

    context("👉 newAgreement()", async function () {
      it("should create agreement successfully", async function () {
        const disputeResolverId = 1;
        const maxAmountPerTx = ONE_ETHER;
        const maxAmountTotal = TEN_ETHER;
        const timePeriod = THIRTY_DAYS;
        const premium = ZERO_POINT_ONE_ETHER;
        const refundOnCancel = true;
        const tokenAddress = ZeroAddress;

        await expect(
          drFeeMutualizer
            .connect(owner)
            .newAgreement(
              sellerId,
              disputeResolverId,
              maxAmountPerTx,
              maxAmountTotal,
              timePeriod,
              premium,
              refundOnCancel,
              tokenAddress
            )
        )
          .to.emit(drFeeMutualizer, "AgreementCreated")
          .withArgs(1, sellerId, disputeResolverId);

        const agreement = await drFeeMutualizer.getAgreement(1);
        expect(agreement.maxAmountPerTx).to.equal(maxAmountPerTx);
        expect(agreement.maxAmountTotal).to.equal(maxAmountTotal);
        expect(agreement.timePeriod).to.equal(timePeriod);
        expect(agreement.premium).to.equal(premium);
        expect(agreement.refundOnCancel).to.equal(refundOnCancel);
        expect(agreement.tokenAddress).to.equal(tokenAddress);
        expect(agreement.startTime).to.equal(0);
        expect(agreement.totalMutualized).to.equal(0);
        expect(agreement.isVoided).to.equal(false);
      });

      context("💔 Revert Reasons", async function () {
        it("should revert when sellerId is zero", async function () {
          await expect(
            drFeeMutualizer
              .connect(owner)
              .newAgreement(0, 1, ONE_ETHER, TEN_ETHER, THIRTY_DAYS, ZERO_POINT_ONE_ETHER, true, ZeroAddress)
          ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.INVALID_SELLER_ID);
        });

        it("should revert when maxAmountPerTx is zero", async function () {
          await expect(
            drFeeMutualizer
              .connect(owner)
              .newAgreement(sellerId, 1, 0, TEN_ETHER, THIRTY_DAYS, ZERO_POINT_ONE_ETHER, true, ZeroAddress)
          ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.MAX_AMOUNT_PER_TX_MUST_BE_GREATER_THAN_ZERO);
        });

        it("should revert when maxAmountTotal is less than maxAmountPerTx", async function () {
          await expect(
            drFeeMutualizer
              .connect(owner)
              .newAgreement(sellerId, 1, TEN_ETHER, ONE_ETHER, THIRTY_DAYS, ZERO_POINT_ONE_ETHER, true, ZeroAddress)
          ).to.be.revertedWithCustomError(
            drFeeMutualizer,
            RevertReasons.MAX_TOTAL_MUST_BE_GREATER_THAN_OR_EQUAL_TO_MAX_PER_TX
          );
        });

        it("should revert when timePeriod is zero", async function () {
          await expect(
            drFeeMutualizer
              .connect(owner)
              .newAgreement(sellerId, 1, ONE_ETHER, TEN_ETHER, 0, ZERO_POINT_ONE_ETHER, true, ZeroAddress)
          ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.TIME_PERIOD_MUST_BE_GREATER_THAN_ZERO);
        });

        it("should revert when caller is not owner", async function () {
          await expect(
            drFeeMutualizer
              .connect(rando)
              .newAgreement(sellerId, 1, ONE_ETHER, TEN_ETHER, THIRTY_DAYS, ZERO_POINT_ONE_ETHER, true, ZeroAddress)
          ).to.be.revertedWith(RevertReasons.OWNABLE_NOT_OWNER);
        });
      });
    });

    context("👉 payPremium()", async function () {
      beforeEach(async function () {
        await drFeeMutualizer
          .connect(owner)
          .newAgreement(sellerId, 1, TWO_ETHER, TWENTY_ETHER, THIRTY_DAYS, ZERO_POINT_ONE_ETHER, true, ZeroAddress);
      });

      context("Native Currency", async function () {
        it("should activate agreement with native currency premium", async function () {
          const premium = ZERO_POINT_ONE_ETHER;

          await expect(drFeeMutualizer.connect(seller).payPremium(1, { value: premium }))
            .to.emit(drFeeMutualizer, "AgreementActivated")
            .withArgs(1, sellerId);

          const agreement = await drFeeMutualizer.getAgreement(1);
          expect(agreement.startTime).to.be.greaterThan(0);
        });

        context("💔 Revert Reasons", async function () {
          it("should revert when incorrect premium amount", async function () {
            const wrongPremium = ZERO_POINT_TWO_ETHER;
            await expect(
              drFeeMutualizer.connect(seller).payPremium(1, { value: wrongPremium })
            ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.INSUFFICIENT_VALUE_RECEIVED);
          });

          it("should revert when agreement is already active", async function () {
            const premium = ZERO_POINT_ONE_ETHER;
            await drFeeMutualizer.connect(seller).payPremium(1, { value: premium });

            await expect(
              drFeeMutualizer.connect(seller).payPremium(1, { value: premium })
            ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.AGREEMENT_ALREADY_ACTIVE);
          });

          it("should revert when agreement is voided", async function () {
            await drFeeMutualizer.connect(owner).voidAgreement(1);

            const premium = ZERO_POINT_ONE_ETHER;
            await expect(
              drFeeMutualizer.connect(seller).payPremium(1, { value: premium })
            ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.AGREEMENT_IS_VOIDED);
          });

          it("should revert when agreement ID is invalid", async function () {
            const premium = ZERO_POINT_ONE_ETHER;
            await expect(
              drFeeMutualizer.connect(seller).payPremium(999, { value: premium })
            ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.INVALID_AGREEMENT_ID);
          });
        });
      });

      context("ERC20 Token", async function () {
        beforeEach(async function () {
          await drFeeMutualizer
            .connect(owner)
            .newAgreement(
              2,
              2,
              TWO_ETHER,
              TWENTY_ETHER,
              THIRTY_DAYS,
              HUNDRED_ETHER,
              true,
              await mockToken.getAddress()
            );
        });

        it("should activate agreement with ERC20 premium", async function () {
          const premium = HUNDRED_ETHER;
          await mockToken.connect(seller).approve(await drFeeMutualizer.getAddress(), premium);

          await expect(drFeeMutualizer.connect(seller).payPremium(2))
            .to.emit(drFeeMutualizer, "AgreementActivated")
            .withArgs(2, 2);

          const agreement = await drFeeMutualizer.getAgreement(2);
          expect(agreement.startTime).to.be.greaterThan(0);
        });

        context("💔 Revert Reasons", async function () {
          it("should revert when native currency sent for ERC20 token", async function () {
            await mockToken.connect(seller).approve(await drFeeMutualizer.getAddress(), HUNDRED_ETHER);
            await expect(drFeeMutualizer.connect(seller).payPremium(2, { value: 1000 })).to.be.revertedWithCustomError(
              drFeeMutualizer,
              RevertReasons.NATIVE_NOT_ALLOWED
            );
          });
        });
      });
    });

    context("👉 voidAgreement()", async function () {
      it("should void agreement successfully by seller", async function () {
        const tx = await drFeeMutualizer
          .connect(owner)
          .newAgreement(sellerId, 1, TWO_ETHER, TWENTY_ETHER, THIRTY_DAYS, ZERO_POINT_ONE_ETHER, true, ZeroAddress);
        const receipt = await tx.wait();
        const agreementId = receipt.logs[0].args[0];
        await drFeeMutualizer.connect(seller).payPremium(agreementId, { value: ZERO_POINT_ONE_ETHER });
        await expect(drFeeMutualizer.connect(seller).voidAgreement(agreementId))
          .to.emit(drFeeMutualizer, "AgreementVoided")
          .withArgs(agreementId, true);
        const agreement = await drFeeMutualizer.getAgreement(agreementId);
        expect(agreement.isVoided).to.equal(true);
      });

      it("should void agreement successfully by owner when refundOnCancel is true", async function () {
        const tx = await drFeeMutualizer
          .connect(owner)
          .newAgreement(sellerId, 1, TWO_ETHER, TWENTY_ETHER, THIRTY_DAYS, ZERO_POINT_ONE_ETHER, true, ZeroAddress);
        const receipt = await tx.wait();
        const agreementId = receipt.logs[0].args[0];
        await drFeeMutualizer.connect(seller).payPremium(agreementId, { value: ZERO_POINT_ONE_ETHER });
        await expect(drFeeMutualizer.connect(owner).voidAgreement(agreementId))
          .to.emit(drFeeMutualizer, "AgreementVoided")
          .withArgs(agreementId, true);
        const agreement = await drFeeMutualizer.getAgreement(agreementId);
        expect(agreement.isVoided).to.equal(true);
      });

      context("💔 Revert Reasons", async function () {
        it("should revert when agreement ID is invalid", async function () {
          await expect(drFeeMutualizer.connect(seller).voidAgreement(999)).to.be.revertedWithCustomError(
            drFeeMutualizer,
            RevertReasons.INVALID_AGREEMENT_ID
          );
        });

        it("should revert when agreement is already voided", async function () {
          const tx = await drFeeMutualizer
            .connect(owner)
            .newAgreement(sellerId, 1, TWO_ETHER, TWENTY_ETHER, THIRTY_DAYS, ZERO_POINT_ONE_ETHER, true, ZeroAddress);
          const receipt = await tx.wait();
          const agreementId = receipt.logs[0].args[0];
          await drFeeMutualizer.connect(seller).payPremium(agreementId, { value: ZERO_POINT_ONE_ETHER });
          await drFeeMutualizer.connect(seller).voidAgreement(agreementId);
          await expect(drFeeMutualizer.connect(seller).voidAgreement(agreementId)).to.be.revertedWithCustomError(
            drFeeMutualizer,
            RevertReasons.AGREEMENT_ALREADY_VOIDED
          );
        });

        it("should revert when caller is not authorized", async function () {
          const tx = await drFeeMutualizer
            .connect(owner)
            .newAgreement(sellerId, 1, TWO_ETHER, TWENTY_ETHER, THIRTY_DAYS, ZERO_POINT_ONE_ETHER, true, ZeroAddress);
          const receipt = await tx.wait();
          const agreementId = receipt.logs[0].args[0];
          await drFeeMutualizer.connect(seller).payPremium(agreementId, { value: ZERO_POINT_ONE_ETHER });
          await expect(drFeeMutualizer.connect(rando).voidAgreement(agreementId)).to.be.revertedWithCustomError(
            drFeeMutualizer,
            RevertReasons.ACCESS_DENIED
          );
        });

        it("should revert when owner tries to void agreement with refundOnCancel false", async function () {
          const tx = await drFeeMutualizer
            .connect(owner)
            .newAgreement(sellerId, 2, TWO_ETHER, TWENTY_ETHER, THIRTY_DAYS, ZERO_POINT_ONE_ETHER, false, ZeroAddress);
          const receipt = await tx.wait();
          const agreementId = receipt.logs[0].args[0];
          await drFeeMutualizer.connect(seller).payPremium(agreementId, { value: ZERO_POINT_ONE_ETHER });
          await expect(drFeeMutualizer.connect(owner).voidAgreement(agreementId)).to.be.revertedWithCustomError(
            drFeeMutualizer,
            RevertReasons.ACCESS_DENIED
          );
        });
      });
    });

    context("👉 getAgreement()", async function () {
      it("should return agreement details", async function () {
        await drFeeMutualizer
          .connect(owner)
          .newAgreement(sellerId, 1, TWO_ETHER, TWENTY_ETHER, THIRTY_DAYS, ZERO_POINT_ONE_ETHER, true, ZeroAddress);
        const agreement = await drFeeMutualizer.getAgreement(1);
        expect(agreement.maxAmountPerTx).to.equal(TWO_ETHER);
        expect(agreement.maxAmountTotal).to.equal(TWENTY_ETHER);
        expect(agreement.tokenAddress).to.equal(ZeroAddress);
      });

      it("should revert when agreement ID is invalid", async function () {
        await expect(drFeeMutualizer.getAgreement(999)).to.be.revertedWithCustomError(
          drFeeMutualizer,
          RevertReasons.INVALID_AGREEMENT_ID
        );
      });
    });

    context("👉 getAgreementId()", async function () {
      it("should return correct agreement ID for specific dispute resolver", async function () {
        const disputeResolverId = 1;
        await drFeeMutualizer
          .connect(owner)
          .newAgreement(
            sellerId,
            disputeResolverId,
            TWO_ETHER,
            TWENTY_ETHER,
            THIRTY_DAYS,
            ZERO_POINT_ONE_ETHER,
            true,
            ZeroAddress
          );
        const agreementId = await drFeeMutualizer.getAgreementId(sellerId, disputeResolverId);
        expect(agreementId).to.equal(1);
      });

      it("should return universal agreement ID when specific one doesn't exist", async function () {
        await drFeeMutualizer
          .connect(owner)
          .newAgreement(sellerId, 0, TWO_ETHER, TWENTY_ETHER, THIRTY_DAYS, ZERO_POINT_ONE_ETHER, true, ZeroAddress);
        const agreementId = await drFeeMutualizer.getAgreementId(sellerId, 999);
        expect(agreementId).to.equal(1);
      });

      it("should return zero for non-existent agreement", async function () {
        const agreementId = await drFeeMutualizer.getAgreementId(sellerId, 999);
        expect(agreementId).to.equal(0);
      });
    });
  });

  context("📋 DR Fee Management", async function () {
    let drFeeMutualizer;
    let mockProtocol;
    const sellerId = 1;

    beforeEach(async function () {
      const setup = await setupMockProtocolAndMutualizer(sellerId, seller.address);
      mockProtocol = setup.mockProtocol;
      drFeeMutualizer = setup.drFeeMutualizer;
    });

    context("👉 isSellerCovered()", async function () {
      beforeEach(async function () {
        await drFeeMutualizer
          .connect(owner)
          .newAgreement(sellerId, 1, TWO_ETHER, TWENTY_ETHER, THIRTY_DAYS, ZERO_POINT_ONE_ETHER, true, ZeroAddress);
        await drFeeMutualizer.connect(seller).payPremium(1, { value: ZERO_POINT_ONE_ETHER });
        await drFeeMutualizer.connect(owner).deposit(ZeroAddress, FIVE_ETHER, { value: FIVE_ETHER });
      });

      it("should return true when seller is covered", async function () {
        const isCovered = await drFeeMutualizer.isSellerCovered(sellerId, ZERO_POINT_FIVE_ETHER, ZeroAddress, 1);
        expect(isCovered).to.be.true;
      });

      it("should return false when fee amount exceeds maxAmountPerTx", async function () {
        const isCovered = await drFeeMutualizer.isSellerCovered(sellerId, THREE_ETHER, ZeroAddress, 1);
        expect(isCovered).to.be.false;
      });

      it("should return false when total mutualized would exceed maxAmountTotal", async function () {
        await mockProtocol.callRequestDRFee(
          await drFeeMutualizer.getAddress(),
          sellerId,
          EIGHT_ETHER,
          ZeroAddress,
          1,
          1
        );
        const isCovered = await drFeeMutualizer.isSellerCovered(sellerId, THREE_ETHER, ZeroAddress, 1);
        expect(isCovered).to.be.false;
      });

      it("should return false when agreement is expired", async function () {
        // Get the agreement start time directly from the contract
        const agreement = await drFeeMutualizer.getAgreement(1);
        const agreementStartTime = agreement.startTime;

        // Advance time by 31 days from when agreement was activated
        const futureTimestamp = agreementStartTime + BigInt(THIRTY_ONE_DAYS);
        await setNextBlockTimestamp(Number(futureTimestamp), true);

        const isCovered = await drFeeMutualizer.isSellerCovered(sellerId, ZERO_POINT_FIVE_ETHER, ZeroAddress, 1);
        expect(isCovered).to.be.false;
      });

      it("should return false when agreement is voided", async function () {
        await drFeeMutualizer.connect(seller).voidAgreement(1);
        const isCovered = await drFeeMutualizer.isSellerCovered(sellerId, ZERO_POINT_FIVE_ETHER, ZeroAddress, 1);
        expect(isCovered).to.be.false;
      });

      it("should return false when token address doesn't match", async function () {
        const isCovered = await drFeeMutualizer.isSellerCovered(
          sellerId,
          ZERO_POINT_FIVE_ETHER,
          await mockToken.getAddress(),
          1
        );
        expect(isCovered).to.be.false;
      });

      it("should return false when pool balance is insufficient", async function () {
        await drFeeMutualizer.connect(owner).withdraw(ZeroAddress, FIVE_ETHER, await owner.getAddress());
        const isCovered = await drFeeMutualizer.isSellerCovered(sellerId, ZERO_POINT_FIVE_ETHER, ZeroAddress, 1);
        expect(isCovered).to.be.false;
      });

      it("should check for 'any dispute resolver' agreement when specific one doesn't exist", async function () {
        await drFeeMutualizer
          .connect(owner)
          .newAgreement(sellerId, 0, TWO_ETHER, TWENTY_ETHER, THIRTY_DAYS, ZERO_POINT_ONE_ETHER, true, ZeroAddress);
        await drFeeMutualizer.connect(seller).payPremium(2, { value: ZERO_POINT_ONE_ETHER });
        const isCovered = await drFeeMutualizer.isSellerCovered(sellerId, ZERO_POINT_FIVE_ETHER, ZeroAddress, 999);
        expect(isCovered).to.be.true;
      });
    });

    context("👉 requestDRFee()", async function () {
      beforeEach(async function () {
        await drFeeMutualizer
          .connect(owner)
          .newAgreement(sellerId, 1, TWO_ETHER, TWENTY_ETHER, THIRTY_DAYS, ZERO_POINT_ONE_ETHER, true, ZeroAddress);
        await drFeeMutualizer.connect(seller).payPremium(1, { value: ZERO_POINT_ONE_ETHER });
        await drFeeMutualizer.connect(owner).deposit(ZeroAddress, FIVE_ETHER, { value: FIVE_ETHER });
      });

      it("should request DR fee successfully", async function () {
        const feeAmount = ZERO_POINT_FIVE_ETHER;
        const exchangeId = 123;
        const protocolBalanceBefore = await ethers.provider.getBalance(await mockProtocol.getAddress());

        await expect(
          mockProtocol.callRequestDRFee(
            await drFeeMutualizer.getAddress(),
            sellerId,
            feeAmount,
            ZeroAddress,
            exchangeId,
            1
          )
        )
          .to.emit(drFeeMutualizer, "DRFeeProvided")
          .withArgs(exchangeId, sellerId, feeAmount);

        const protocolBalanceAfter = await ethers.provider.getBalance(await mockProtocol.getAddress());
        expect(protocolBalanceAfter - protocolBalanceBefore).to.equal(feeAmount);
      });

      it("should request DR fee successfully (ERC20)", async function () {
        await drFeeMutualizer
          .connect(owner)
          .newAgreement(2, 2, TWO_ETHER, TWENTY_ETHER, THIRTY_DAYS, HUNDRED_ETHER, true, await mockToken.getAddress());
        await mockToken.connect(seller).approve(await drFeeMutualizer.getAddress(), HUNDRED_ETHER);
        await drFeeMutualizer.connect(seller).payPremium(2);
        await mockToken.connect(owner).approve(await drFeeMutualizer.getAddress(), FIVE_ETHER);
        await drFeeMutualizer.connect(owner).deposit(await mockToken.getAddress(), FIVE_ETHER);

        const feeAmount = ZERO_POINT_FIVE_ETHER;
        const exchangeId = 456;
        const protocolBalanceBefore = await mockToken.balanceOf(await mockProtocol.getAddress());

        await expect(
          mockProtocol.callRequestDRFee(
            await drFeeMutualizer.getAddress(),
            2,
            feeAmount,
            await mockToken.getAddress(),
            exchangeId,
            2
          )
        )
          .to.emit(drFeeMutualizer, "DRFeeProvided")
          .withArgs(exchangeId, 2, feeAmount);

        const protocolBalanceAfter = await mockToken.balanceOf(await mockProtocol.getAddress());
        expect(protocolBalanceAfter - protocolBalanceBefore).to.equal(feeAmount);
      });

      it("should return false when seller is not covered", async function () {
        const feeAmount = THREE_ETHER;
        const isCovered = await drFeeMutualizer.isSellerCovered(sellerId, feeAmount, ZeroAddress, 1);
        expect(isCovered).to.be.false;
      });

      context("💔 Revert Reasons", async function () {
        it("should revert when caller is not protocol", async function () {
          const feeAmount = ZERO_POINT_FIVE_ETHER;
          const exchangeId = 123;
          await expect(
            drFeeMutualizer.connect(rando).requestDRFee(sellerId, feeAmount, ZeroAddress, exchangeId, 1)
          ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.ONLY_PROTOCOL);
        });
      });
    });

    context("👉 returnDRFee()", async function () {
      let exchangeId;

      beforeEach(async function () {
        const tx = await drFeeMutualizer
          .connect(owner)
          .newAgreement(sellerId, 1, TWO_ETHER, TWENTY_ETHER, THIRTY_DAYS, ZERO_POINT_ONE_ETHER, true, ZeroAddress);
        const receipt = await tx.wait();
        const agreementId = receipt.logs[0].args[0];
        await drFeeMutualizer.connect(seller).payPremium(agreementId, { value: ZERO_POINT_ONE_ETHER });
        await drFeeMutualizer.connect(owner).deposit(ZeroAddress, FIVE_ETHER, { value: FIVE_ETHER });
        exchangeId = 123;
        await mockProtocol.callRequestDRFee(
          await drFeeMutualizer.getAddress(),
          sellerId,
          ZERO_POINT_FIVE_ETHER,
          ZeroAddress,
          exchangeId,
          1
        );
      });

      it("should return fee amount to pool", async function () {
        const returnAmount = ZERO_POINT_THREE_ETHER;
        const poolBalanceBefore = await drFeeMutualizer.getPoolBalance(ZeroAddress);

        await mockProtocol.callReturnDRFee(await drFeeMutualizer.getAddress(), exchangeId, returnAmount, {
          value: returnAmount,
        });

        const poolBalanceAfter = await drFeeMutualizer.getPoolBalance(ZeroAddress);
        expect(poolBalanceAfter - poolBalanceBefore).to.equal(returnAmount);
      });

      it("should allow returning DR fee with 0 amount and clean up tracking (native)", async function () {
        await expect(mockProtocol.callReturnDRFee(await drFeeMutualizer.getAddress(), exchangeId, 0, { value: 0 })).to
          .not.be.reverted;

        await expect(
          mockProtocol.callReturnDRFee(await drFeeMutualizer.getAddress(), exchangeId, ZERO_POINT_ONE_ETHER, {
            value: ZERO_POINT_ONE_ETHER,
          })
        ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.INVALID_EXCHANGE_ID);
      });

      it("should allow returning DR fee with 0 amount and clean up tracking (ERC20)", async function () {
        await drFeeMutualizer
          .connect(owner)
          .newAgreement(2, 2, TWO_ETHER, TWENTY_ETHER, THIRTY_DAYS, HUNDRED_ETHER, true, await mockToken.getAddress());
        await mockToken.connect(seller).approve(await drFeeMutualizer.getAddress(), HUNDRED_ETHER);
        await drFeeMutualizer.connect(seller).payPremium(2);
        await mockToken.connect(owner).approve(await drFeeMutualizer.getAddress(), FIVE_ETHER);
        await drFeeMutualizer.connect(owner).deposit(await mockToken.getAddress(), FIVE_ETHER);
        const erc20ExchangeId = 789;
        await mockProtocol.callRequestDRFee(
          await drFeeMutualizer.getAddress(),
          2,
          ZERO_POINT_FIVE_ETHER,
          await mockToken.getAddress(),
          erc20ExchangeId,
          2
        );
        await mockProtocol.approveToken(await mockToken.getAddress(), await drFeeMutualizer.getAddress(), 0);
        await expect(mockProtocol.callReturnDRFee(await drFeeMutualizer.getAddress(), erc20ExchangeId, 0)).to.not.be
          .reverted;
        await expect(
          mockProtocol.callReturnDRFee(await drFeeMutualizer.getAddress(), erc20ExchangeId, ZERO_POINT_ONE_ETHER)
        ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.INVALID_EXCHANGE_ID);
      });

      context("💔 Revert Reasons", async function () {
        it("should revert when exchange ID is invalid", async function () {
          await expect(
            mockProtocol.callReturnDRFee(await drFeeMutualizer.getAddress(), 999, ZERO_POINT_ONE_ETHER, {
              value: ZERO_POINT_ONE_ETHER,
            })
          ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.INVALID_EXCHANGE_ID);
        });

        it("should revert when incorrect native amount sent", async function () {
          const returnAmount = ZERO_POINT_THREE_ETHER;
          const wrongAmount = ZERO_POINT_TWO_ETHER;
          await expect(
            mockProtocol.callReturnDRFee(await drFeeMutualizer.getAddress(), exchangeId, returnAmount, {
              value: wrongAmount,
            })
          ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.INSUFFICIENT_VALUE_RECEIVED);
        });

        it("should revert when native currency sent for ERC20 token", async function () {
          const tx = await drFeeMutualizer
            .connect(owner)
            .newAgreement(
              2,
              2,
              TWO_ETHER,
              TWENTY_ETHER,
              THIRTY_DAYS,
              HUNDRED_ETHER,
              true,
              await mockToken.getAddress()
            );
          const receipt = await tx.wait();
          const erc20AgreementId = receipt.logs[0].args[0];
          await mockToken.connect(seller).approve(await drFeeMutualizer.getAddress(), HUNDRED_ETHER);
          await drFeeMutualizer.connect(seller).payPremium(erc20AgreementId);

          await mockToken.connect(owner).approve(await drFeeMutualizer.getAddress(), FIVE_ETHER);
          await drFeeMutualizer.connect(owner).deposit(await mockToken.getAddress(), FIVE_ETHER);

          const erc20ExchangeId = 456;

          const isCovered = await drFeeMutualizer.isSellerCovered(
            2,
            ZERO_POINT_FIVE_ETHER,
            await mockToken.getAddress(),
            2
          );
          expect(isCovered).to.be.true;

          await mockProtocol.callRequestDRFee(
            await drFeeMutualizer.getAddress(),
            2,
            ZERO_POINT_FIVE_ETHER,
            await mockToken.getAddress(),
            erc20ExchangeId,
            2
          );

          await expect(
            mockProtocol.callReturnDRFee(await drFeeMutualizer.getAddress(), erc20ExchangeId, ZERO_POINT_THREE_ETHER, {
              value: 1000,
            })
          ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.NATIVE_NOT_ALLOWED);
        });

        it("should revert when caller is not protocol", async function () {
          await expect(
            drFeeMutualizer
              .connect(rando)
              .returnDRFee(exchangeId, ZERO_POINT_ONE_ETHER, { value: ZERO_POINT_ONE_ETHER })
          ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.ONLY_PROTOCOL);
        });
      });
    });

    it("should handle ERC20 fee return correctly", async function () {
      const tx = await drFeeMutualizer
        .connect(owner)
        .newAgreement(
          2,
          2,
          TWO_ETHER,
          TWENTY_ETHER,
          THIRTY_DAYS,
          ZERO_POINT_ONE_ETHER,
          true,
          await mockToken.getAddress()
        );
      const receipt = await tx.wait();
      const erc20AgreementId = receipt.logs[0].args[0];

      await mockToken.connect(seller).approve(await drFeeMutualizer.getAddress(), HUNDRED_ETHER);
      await drFeeMutualizer.connect(seller).payPremium(erc20AgreementId);

      await mockToken.connect(owner).approve(await drFeeMutualizer.getAddress(), FIVE_ETHER);
      await drFeeMutualizer.connect(owner).deposit(await mockToken.getAddress(), FIVE_ETHER);

      const erc20ExchangeId = 456;
      await mockProtocol.callRequestDRFee(
        await drFeeMutualizer.getAddress(),
        2,
        ZERO_POINT_FIVE_ETHER,
        await mockToken.getAddress(),
        erc20ExchangeId,
        2
      );

      const poolBalanceBefore = await drFeeMutualizer.getPoolBalance(await mockToken.getAddress());
      const returnAmount = ZERO_POINT_THREE_ETHER;

      await mockToken.connect(owner).transfer(await mockProtocol.getAddress(), returnAmount);
      await mockProtocol.approveToken(await mockToken.getAddress(), await drFeeMutualizer.getAddress(), returnAmount);

      await mockProtocol.callReturnDRFee(await drFeeMutualizer.getAddress(), erc20ExchangeId, returnAmount);

      const poolBalanceAfter = await drFeeMutualizer.getPoolBalance(await mockToken.getAddress());
      expect(poolBalanceAfter - poolBalanceBefore).to.equal(returnAmount);
    });
  });

  context("📋 Edge Cases and Integration", async function () {
    let drFeeMutualizer;
    let mockProtocol;
    const sellerId = 1;

    beforeEach(async function () {
      const setup = await setupMockProtocolAndMutualizer(sellerId, seller.address);
      mockProtocol = setup.mockProtocol;
      drFeeMutualizer = setup.drFeeMutualizer;
    });

    it("should handle multiple agreements for same seller with different dispute resolvers", async function () {
      await drFeeMutualizer
        .connect(owner)
        .newAgreement(sellerId, 1, TWO_ETHER, TWENTY_ETHER, THIRTY_DAYS, ZERO_POINT_ONE_ETHER, true, ZeroAddress);
      await drFeeMutualizer
        .connect(owner)
        .newAgreement(sellerId, 2, TWO_ETHER, TWENTY_ETHER, THIRTY_DAYS, ZERO_POINT_ONE_ETHER, true, ZeroAddress);
      const agreementId1 = await drFeeMutualizer.getAgreementId(sellerId, 1);
      const agreementId2 = await drFeeMutualizer.getAgreementId(sellerId, 2);
      expect(agreementId1).to.equal(1);
      expect(agreementId2).to.equal(2);
    });

    it("should allow creating specific agreement when universal agreement exists", async function () {
      await drFeeMutualizer
        .connect(owner)
        .newAgreement(sellerId, 0, TWO_ETHER, TWENTY_ETHER, THIRTY_DAYS, ZERO_POINT_ONE_ETHER, true, ZeroAddress);
      await drFeeMutualizer.connect(seller).payPremium(1, { value: ZERO_POINT_ONE_ETHER });

      await expect(
        drFeeMutualizer
          .connect(owner)
          .newAgreement(sellerId, 1, TWO_ETHER, TWENTY_ETHER, THIRTY_DAYS, ZERO_POINT_ONE_ETHER, true, ZeroAddress)
      )
        .to.emit(drFeeMutualizer, "AgreementCreated")
        .withArgs(2, sellerId, 1);
    });

    it("should allow creating universal agreement when specific agreements exist", async function () {
      await drFeeMutualizer
        .connect(owner)
        .newAgreement(sellerId, 1, TWO_ETHER, TWENTY_ETHER, THIRTY_DAYS, ZERO_POINT_ONE_ETHER, true, ZeroAddress);
      await drFeeMutualizer.connect(seller).payPremium(1, { value: ZERO_POINT_ONE_ETHER });

      await expect(
        drFeeMutualizer
          .connect(owner)
          .newAgreement(sellerId, 0, TWO_ETHER, TWENTY_ETHER, THIRTY_DAYS, ZERO_POINT_ONE_ETHER, true, ZeroAddress)
      )
        .to.emit(drFeeMutualizer, "AgreementCreated")
        .withArgs(2, sellerId, 0);
    });

    it("should prevent creating duplicate agreement for same dispute resolver", async function () {
      await drFeeMutualizer
        .connect(owner)
        .newAgreement(sellerId, 1, TWO_ETHER, TWENTY_ETHER, THIRTY_DAYS, ZERO_POINT_ONE_ETHER, true, ZeroAddress);
      await drFeeMutualizer.connect(seller).payPremium(1, { value: ZERO_POINT_ONE_ETHER });

      await expect(
        drFeeMutualizer
          .connect(owner)
          .newAgreement(sellerId, 1, TWO_ETHER, TWENTY_ETHER, THIRTY_DAYS, ZERO_POINT_ONE_ETHER, true, ZeroAddress)
      ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.AGREEMENT_ALREADY_EXISTS);
    });

    it("should allow creating agreement when previous one is expired", async function () {
      await drFeeMutualizer
        .connect(owner)
        .newAgreement(sellerId, 1, TWO_ETHER, TWENTY_ETHER, ONE_DAY, ZERO_POINT_ONE_ETHER, true, ZeroAddress);
      await drFeeMutualizer.connect(seller).payPremium(1, { value: ZERO_POINT_ONE_ETHER });

      // Get current block timestamp and advance by 2 days
      const currentBlock = await ethers.provider.getBlock("latest");
      const futureTimestamp = currentBlock.timestamp + TWO_DAYS;
      await setNextBlockTimestamp(futureTimestamp, true);

      await expect(
        drFeeMutualizer
          .connect(owner)
          .newAgreement(sellerId, 1, TWO_ETHER, TWENTY_ETHER, THIRTY_DAYS, ZERO_POINT_ONE_ETHER, true, ZeroAddress)
      )
        .to.emit(drFeeMutualizer, "AgreementCreated")
        .withArgs(2, sellerId, 1);
    });

    it("should handle voiding agreement with refundOnCancel false", async function () {
      const MockProtocolFactory = await getContractFactory("MockProtocol");
      const mockProtocol = await MockProtocolFactory.deploy();
      await mockProtocol.waitForDeployment();

      const DRFeeMutualizerFactory = await getContractFactory("DRFeeMutualizer");
      const drFeeMutualizerWithMock = await DRFeeMutualizerFactory.deploy(await mockProtocol.getAddress());
      await drFeeMutualizerWithMock.waitForDeployment();

      await mockProtocol.setSeller(3, await seller.getAddress());

      const tx = await drFeeMutualizerWithMock
        .connect(owner)
        .newAgreement(3, 3, TWO_ETHER, TWENTY_ETHER, THIRTY_DAYS, ZERO_POINT_ONE_ETHER, false, ZeroAddress);
      const receipt = await tx.wait();
      const agreementId = receipt.logs[0].args[0];

      await drFeeMutualizerWithMock.connect(seller).payPremium(agreementId, { value: ZERO_POINT_ONE_ETHER });

      await expect(drFeeMutualizerWithMock.connect(seller).voidAgreement(agreementId))
        .to.emit(drFeeMutualizerWithMock, "AgreementVoided")
        .withArgs(agreementId, false);

      const agreement = await drFeeMutualizerWithMock.getAgreement(agreementId);
      expect(agreement.isVoided).to.equal(true);
    });

    it("should handle voiding inactive agreement", async function () {
      const MockProtocolFactory = await getContractFactory("MockProtocol");
      const mockProtocol = await MockProtocolFactory.deploy();
      await mockProtocol.waitForDeployment();

      const DRFeeMutualizerFactory = await getContractFactory("DRFeeMutualizer");
      const drFeeMutualizerWithMock = await DRFeeMutualizerFactory.deploy(await mockProtocol.getAddress());
      await drFeeMutualizerWithMock.waitForDeployment();

      await mockProtocol.setSeller(4, await seller.getAddress());

      const tx = await drFeeMutualizerWithMock
        .connect(owner)
        .newAgreement(4, 4, TWO_ETHER, TWENTY_ETHER, THIRTY_DAYS, ZERO_POINT_ONE_ETHER, true, ZeroAddress);
      const receipt = await tx.wait();
      const agreementId = receipt.logs[0].args[0];

      await expect(drFeeMutualizerWithMock.connect(seller).voidAgreement(agreementId))
        .to.emit(drFeeMutualizerWithMock, "AgreementVoided")
        .withArgs(agreementId, false);

      const agreement = await drFeeMutualizerWithMock.getAgreement(agreementId);
      expect(agreement.isVoided).to.equal(true);
    });

    it("should handle time-based refund calculation correctly", async function () {
      const MockProtocolFactory = await getContractFactory("MockProtocol");
      const mockProtocol = await MockProtocolFactory.deploy();
      await mockProtocol.waitForDeployment();

      const DRFeeMutualizerFactory = await getContractFactory("DRFeeMutualizer");
      const drFeeMutualizerWithMock = await DRFeeMutualizerFactory.deploy(await mockProtocol.getAddress());
      await drFeeMutualizerWithMock.waitForDeployment();

      await mockProtocol.setSeller(5, await seller.getAddress());

      const tx = await drFeeMutualizerWithMock
        .connect(owner)
        .newAgreement(5, 5, TWO_ETHER, TWENTY_ETHER, TWELVE_DAYS, ONE_ETHER, true, ZeroAddress);
      const receipt = await tx.wait();
      const agreementId = receipt.logs[0].args[0];

      const protocolBalanceBefore = await ethers.provider.getBalance(await mockProtocol.getAddress());
      await drFeeMutualizerWithMock.connect(seller).payPremium(agreementId, { value: ONE_ETHER });

      // Get the agreement start time directly from the contract
      const agreement = await drFeeMutualizerWithMock.getAgreement(agreementId);
      const agreementStartTime = agreement.startTime;

      // Advance time by 9 days from when agreement was activated
      const futureTimestamp = agreementStartTime + BigInt(NINE_DAYS);
      await setNextBlockTimestamp(Number(futureTimestamp));

      await expect(drFeeMutualizerWithMock.connect(seller).voidAgreement(agreementId))
        .to.emit(drFeeMutualizerWithMock, "AgreementVoided")
        .withArgs(agreementId, true);

      const protocolBalanceAfter = await ethers.provider.getBalance(await mockProtocol.getAddress());
      // After 9 days out of 12 days, seller should get 3/12 = 25% of premium back
      const expectedRefund = (ONE_ETHER * 3n) / 12n;
      expect(protocolBalanceAfter - protocolBalanceBefore).to.equal(expectedRefund);
    });

    it("should handle ERC20 time-based refund calculation correctly", async function () {
      const MockProtocolFactory = await getContractFactory("MockProtocol");
      const mockProtocol = await MockProtocolFactory.deploy();
      await mockProtocol.waitForDeployment();

      const DRFeeMutualizerFactory = await getContractFactory("DRFeeMutualizer");
      const drFeeMutualizerWithMock = await DRFeeMutualizerFactory.deploy(await mockProtocol.getAddress());
      await drFeeMutualizerWithMock.waitForDeployment();

      await mockProtocol.setSeller(7, await seller.getAddress());

      const tx = await drFeeMutualizerWithMock
        .connect(owner)
        .newAgreement(7, 7, TWO_ETHER, TWENTY_ETHER, TWELVE_DAYS, HUNDRED_ETHER, true, await mockToken.getAddress());
      const receipt = await tx.wait();
      const agreementId = receipt.logs[0].args[0];

      const protocolBalanceBefore = await mockToken.balanceOf(await mockProtocol.getAddress());
      await mockToken.connect(seller).approve(await drFeeMutualizerWithMock.getAddress(), HUNDRED_ETHER);
      await drFeeMutualizerWithMock.connect(seller).payPremium(agreementId);

      // Get the agreement start time directly from the contract
      const agreement = await drFeeMutualizerWithMock.getAgreement(agreementId);
      const agreementStartTime = agreement.startTime;

      // Advance time by 9 days from when agreement was activated
      const futureTimestamp = agreementStartTime + BigInt(NINE_DAYS);
      await setNextBlockTimestamp(Number(futureTimestamp));

      await expect(drFeeMutualizerWithMock.connect(seller).voidAgreement(agreementId))
        .to.emit(drFeeMutualizerWithMock, "AgreementVoided")
        .withArgs(agreementId, true);

      const protocolBalanceAfter = await mockToken.balanceOf(await mockProtocol.getAddress());
      // After 9 days out of 12 days, seller should get 3/12 = 25% of premium back
      const expectedRefund = (HUNDRED_ETHER * 3n) / 12n;
      expect(protocolBalanceAfter - protocolBalanceBefore).to.equal(expectedRefund);
    });

    it("should handle maxAmountTotal limit correctly", async function () {
      const tx = await drFeeMutualizer
        .connect(owner)
        .newAgreement(6, 6, ONE_ETHER, TWO_ETHER, THIRTY_DAYS, ZERO_POINT_ONE_ETHER, true, ZeroAddress);
      const receipt = await tx.wait();
      const agreementId = receipt.logs[0].args[0];

      await drFeeMutualizer.connect(seller).payPremium(agreementId, { value: ZERO_POINT_ONE_ETHER });
      await drFeeMutualizer.connect(owner).deposit(ZeroAddress, FIVE_ETHER, { value: FIVE_ETHER });

      await mockProtocol.callRequestDRFee(await drFeeMutualizer.getAddress(), 6, ONE_ETHER, ZeroAddress, 100, 6);

      const agreement1 = await drFeeMutualizer.getAgreement(agreementId);
      expect(agreement1.totalMutualized).to.equal(ONE_ETHER);

      await mockProtocol.callRequestDRFee(await drFeeMutualizer.getAddress(), 6, ONE_ETHER, ZeroAddress, 101, 6);

      const agreement2 = await drFeeMutualizer.getAgreement(agreementId);
      expect(agreement2.totalMutualized).to.equal(TWO_ETHER);

      const isCovered = await drFeeMutualizer.isSellerCovered(6, ONE_ETHER, ZeroAddress, 6);
      expect(isCovered).to.be.false;
    });
  });

  context("📋 Admin Functions", async function () {
    context("👉 setDepositRestriction()", async function () {
      it("should set deposit restriction successfully", async function () {
        await drFeeMutualizer.connect(owner).setDepositRestriction(true);
        expect(await drFeeMutualizer.depositRestrictedToOwner()).to.be.true;

        await drFeeMutualizer.connect(owner).setDepositRestriction(false);
        expect(await drFeeMutualizer.depositRestrictedToOwner()).to.be.false;
      });

      it("should revert when caller is not owner", async function () {
        await expect(drFeeMutualizer.connect(rando).setDepositRestriction(true)).to.be.revertedWith(
          RevertReasons.OWNABLE_NOT_OWNER
        );
      });
    });
  });
});
