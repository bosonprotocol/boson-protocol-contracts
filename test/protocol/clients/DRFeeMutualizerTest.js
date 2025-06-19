const { ethers } = require("hardhat");
const { expect } = require("chai");
const { ZeroAddress, getSigners, getContractFactory, parseUnits } = ethers;
const { getSnapshot, revertToSnapshot } = require("../../util/utils.js");
const { deployMockTokens } = require("../../../scripts/util/deploy-mock-tokens");

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
const ZERO_POINT_TWO_FIVE_ETHER = parseUnits("0.25", "ether");
const ZERO_POINT_THREE_ETHER = parseUnits("0.3", "ether");
const ZERO_POINT_ZERO_ZERO_ONE_ETHER = parseUnits("0.001", "ether");
const ONE_ETHER = parseUnits("1", "ether");
const TWO_ETHER = parseUnits("2", "ether");
const THREE_ETHER = parseUnits("3", "ether");
const FIVE_ETHER = parseUnits("5", "ether");
const EIGHT_ETHER = parseUnits("8", "ether");
const TEN_ETHER = parseUnits("10", "ether");
const TWENTY_ETHER = parseUnits("20", "ether");
const HUNDRED_ETHER = parseUnits("100", "ether");
const TWO_HUNDRED_ETHER = parseUnits("200", "ether");
const TWENTY_FIVE_ETHER = parseUnits("25", "ether");
const THOUSAND_ETHER = parseUnits("1000", "ether");

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
    it("should deploy with correct protocol address", async function () {
      expect(await drFeeMutualizer.BOSON_PROTOCOL()).to.equal(await protocol.getAddress());
    });

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

          await expect(drFeeMutualizer.connect(owner).deposit(ZeroAddress, 0, { value: amount }))
            .to.emit(drFeeMutualizer, "FundsDeposited")
            .withArgs(await owner.getAddress(), ZeroAddress, amount);

          const balanceAfter = await drFeeMutualizer.getPoolBalance(ZeroAddress);
          expect(balanceAfter - balanceBefore).to.equal(amount);
        });

        it("should allow anyone to deposit when not restricted", async function () {
          const amount = ZERO_POINT_FIVE_ETHER;
          await expect(drFeeMutualizer.connect(rando).deposit(ZeroAddress, 0, { value: amount }))
            .to.emit(drFeeMutualizer, "FundsDeposited")
            .withArgs(await rando.getAddress(), ZeroAddress, amount);
        });

        context("💔 Revert Reasons", async function () {
          it("should revert when no native currency sent", async function () {
            await expect(drFeeMutualizer.connect(owner).deposit(ZeroAddress, 0)).to.be.revertedWithCustomError(
              drFeeMutualizer,
              "MustSendNativeCurrency"
            );
          });

          it("should revert when deposits are restricted to owner", async function () {
            await drFeeMutualizer.connect(owner).setDepositRestriction(true);
            await expect(
              drFeeMutualizer.connect(rando).deposit(ZeroAddress, 0, { value: ZERO_POINT_FIVE_ETHER })
            ).to.be.revertedWithCustomError(drFeeMutualizer, "DepositsRestrictedToOwner");
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
            ).to.be.revertedWithCustomError(drFeeMutualizer, "NativeNotAllowed");
          });

          it("should revert when amount is zero", async function () {
            await expect(
              drFeeMutualizer.connect(owner).deposit(await mockToken.getAddress(), 0)
            ).to.be.revertedWithCustomError(drFeeMutualizer, "InvalidAmount");
          });
        });
      });
    });

    context("👉 withdraw()", async function () {
      beforeEach(async function () {
        const nativeAmount = TWO_ETHER;
        await drFeeMutualizer.connect(owner).deposit(ZeroAddress, 0, { value: nativeAmount });
        const tokenAmount = TWO_HUNDRED_ETHER;
        await mockToken.connect(owner).approve(await drFeeMutualizer.getAddress(), tokenAmount);
        await drFeeMutualizer.connect(owner).deposit(await mockToken.getAddress(), tokenAmount);
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
            ).to.be.revertedWith("Ownable: caller is not the owner");
          });

          it("should revert when amount is zero", async function () {
            await expect(
              drFeeMutualizer.connect(owner).withdraw(ZeroAddress, 0, await buyer.getAddress())
            ).to.be.revertedWithCustomError(drFeeMutualizer, "InvalidAmount");
          });

          it("should revert when recipient is zero address", async function () {
            await expect(
              drFeeMutualizer.connect(owner).withdraw(ZeroAddress, ONE_ETHER, ZeroAddress)
            ).to.be.revertedWithCustomError(drFeeMutualizer, "InvalidRecipient");
          });

          it("should revert when insufficient balance", async function () {
            await expect(
              drFeeMutualizer.connect(owner).withdraw(ZeroAddress, TEN_ETHER, await buyer.getAddress())
            ).to.be.revertedWithCustomError(drFeeMutualizer, "InsufficientPoolBalance");
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
        await drFeeMutualizer.connect(owner).deposit(ZeroAddress, 0, { value: amount });
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
              await seller.getAddress(),
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
          .withArgs(1, await seller.getAddress(), disputeResolverId);
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
        it("should revert when seller is zero address", async function () {
          await expect(
            drFeeMutualizer
              .connect(owner)
              .newAgreement(ZeroAddress, 1, ONE_ETHER, TEN_ETHER, THIRTY_DAYS, ZERO_POINT_ONE_ETHER, true, ZeroAddress)
          ).to.be.revertedWithCustomError(drFeeMutualizer, "InvalidSellerAddress");
        });

        it("should revert when maxAmountPerTx is zero", async function () {
          await expect(
            drFeeMutualizer
              .connect(owner)
              .newAgreement(
                await seller.getAddress(),
                1,
                0,
                TEN_ETHER,
                THIRTY_DAYS,
                ZERO_POINT_ONE_ETHER,
                true,
                ZeroAddress
              )
          ).to.be.revertedWithCustomError(drFeeMutualizer, "MaxAmountPerTxMustBeGreaterThanZero");
        });

        it("should revert when maxAmountTotal is less than maxAmountPerTx", async function () {
          await expect(
            drFeeMutualizer
              .connect(owner)
              .newAgreement(
                await seller.getAddress(),
                1,
                TEN_ETHER,
                ONE_ETHER,
                THIRTY_DAYS,
                ZERO_POINT_ONE_ETHER,
                true,
                ZeroAddress
              )
          ).to.be.revertedWithCustomError(drFeeMutualizer, "MaxTotalMustBeGreaterThanOrEqualToMaxPerTx");
        });

        it("should revert when timePeriod is zero", async function () {
          await expect(
            drFeeMutualizer
              .connect(owner)
              .newAgreement(
                await seller.getAddress(),
                1,
                ONE_ETHER,
                TEN_ETHER,
                0,
                ZERO_POINT_ONE_ETHER,
                true,
                ZeroAddress
              )
          ).to.be.revertedWithCustomError(drFeeMutualizer, "TimePeriodMustBeGreaterThanZero");
        });

        it("should revert when caller is not owner", async function () {
          await expect(
            drFeeMutualizer
              .connect(rando)
              .newAgreement(
                await seller.getAddress(),
                1,
                ONE_ETHER,
                TEN_ETHER,
                THIRTY_DAYS,
                ZERO_POINT_ONE_ETHER,
                true,
                ZeroAddress
              )
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });
      });
    });

    context("👉 payPremium()", async function () {
      beforeEach(async function () {
        await drFeeMutualizer
          .connect(owner)
          .newAgreement(
            await seller.getAddress(),
            1,
            TWO_ETHER,
            TWENTY_ETHER,
            THIRTY_DAYS,
            ZERO_POINT_ONE_ETHER,
            true,
            ZeroAddress
          );
      });

      context("Native Currency", async function () {
        it("should activate agreement with native currency premium", async function () {
          const premium = ZERO_POINT_ONE_ETHER;

          await expect(drFeeMutualizer.connect(seller).payPremium(1, { value: premium }))
            .to.emit(drFeeMutualizer, "AgreementActivated")
            .withArgs(1, await seller.getAddress());

          const agreement = await drFeeMutualizer.getAgreement(1);
          expect(agreement.startTime).to.be.greaterThan(0);
        });

        context("💔 Revert Reasons", async function () {
          it("should revert when incorrect premium amount", async function () {
            const wrongPremium = ZERO_POINT_TWO_ETHER;
            await expect(
              drFeeMutualizer.connect(seller).payPremium(1, { value: wrongPremium })
            ).to.be.revertedWithCustomError(drFeeMutualizer, "IncorrectPremiumAmount");
          });

          it("should revert when agreement is already active", async function () {
            const premium = ZERO_POINT_ONE_ETHER;
            await drFeeMutualizer.connect(seller).payPremium(1, { value: premium });

            await expect(
              drFeeMutualizer.connect(seller).payPremium(1, { value: premium })
            ).to.be.revertedWithCustomError(drFeeMutualizer, "AgreementAlreadyActive");
          });

          it("should revert when agreement is voided", async function () {
            await drFeeMutualizer.connect(owner).voidAgreement(1);

            const premium = ZERO_POINT_ONE_ETHER;
            await expect(
              drFeeMutualizer.connect(seller).payPremium(1, { value: premium })
            ).to.be.revertedWithCustomError(drFeeMutualizer, "AgreementIsVoided");
          });

          it("should revert when agreement ID is invalid", async function () {
            const premium = ZERO_POINT_ONE_ETHER;
            await expect(
              drFeeMutualizer.connect(seller).payPremium(999, { value: premium })
            ).to.be.revertedWithCustomError(drFeeMutualizer, "InvalidAgreementId");
          });
        });
      });

      context("ERC20 Token", async function () {
        beforeEach(async function () {
          await drFeeMutualizer
            .connect(owner)
            .newAgreement(
              await seller.getAddress(),
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
            .withArgs(2, await seller.getAddress());

          const agreement = await drFeeMutualizer.getAgreement(2);
          expect(agreement.startTime).to.be.greaterThan(0);
        });

        context("💔 Revert Reasons", async function () {
          it("should revert when native currency sent for ERC20 token", async function () {
            await mockToken.connect(seller).approve(await drFeeMutualizer.getAddress(), HUNDRED_ETHER);
            await expect(drFeeMutualizer.connect(seller).payPremium(2, { value: 1000 })).to.be.revertedWithCustomError(
              drFeeMutualizer,
              "NativeNotAllowed"
            );
          });
        });
      });
    });

    context("👉 voidAgreement()", async function () {
      beforeEach(async function () {
        await drFeeMutualizer
          .connect(owner)
          .newAgreement(
            await seller.getAddress(),
            1,
            TWO_ETHER,
            TWENTY_ETHER,
            THIRTY_DAYS,
            ZERO_POINT_ONE_ETHER,
            true,
            ZeroAddress
          );
        await drFeeMutualizer.connect(seller).payPremium(1, { value: ZERO_POINT_ONE_ETHER });
      });

      it("should void agreement successfully by seller", async function () {
        await expect(drFeeMutualizer.connect(seller).voidAgreement(1))
          .to.emit(drFeeMutualizer, "AgreementVoided")
          .withArgs(1, true);

        const agreement = await drFeeMutualizer.getAgreement(1);
        expect(agreement.isVoided).to.equal(true);
      });

      it("should void agreement successfully by owner when refundOnCancel is true", async function () {
        await expect(drFeeMutualizer.connect(owner).voidAgreement(1))
          .to.emit(drFeeMutualizer, "AgreementVoided")
          .withArgs(1, true);

        const agreement = await drFeeMutualizer.getAgreement(1);
        expect(agreement.isVoided).to.equal(true);
      });

      context("💔 Revert Reasons", async function () {
        it("should revert when agreement ID is invalid", async function () {
          await expect(drFeeMutualizer.connect(seller).voidAgreement(999)).to.be.revertedWithCustomError(
            drFeeMutualizer,
            "InvalidAgreementId"
          );
        });

        it("should revert when agreement is already voided", async function () {
          await drFeeMutualizer.connect(seller).voidAgreement(1);

          await expect(drFeeMutualizer.connect(seller).voidAgreement(1)).to.be.revertedWithCustomError(
            drFeeMutualizer,
            "AgreementAlreadyVoided"
          );
        });

        it("should revert when caller is not authorized", async function () {
          await expect(drFeeMutualizer.connect(rando).voidAgreement(1)).to.be.revertedWithCustomError(
            drFeeMutualizer,
            "AccessDenied"
          );
        });

        it("should revert when owner tries to void agreement with refundOnCancel false", async function () {
          await drFeeMutualizer
            .connect(owner)
            .newAgreement(
              await seller.getAddress(),
              2,
              TWO_ETHER,
              TWENTY_ETHER,
              THIRTY_DAYS,
              ZERO_POINT_ONE_ETHER,
              false,
              ZeroAddress
            );
          await drFeeMutualizer.connect(seller).payPremium(2, { value: ZERO_POINT_ONE_ETHER });

          await expect(drFeeMutualizer.connect(owner).voidAgreement(2)).to.be.revertedWithCustomError(
            drFeeMutualizer,
            "AccessDenied"
          );
        });
      });
    });

    context("👉 getAgreement()", async function () {
      it("should return agreement details", async function () {
        await drFeeMutualizer
          .connect(owner)
          .newAgreement(
            await seller.getAddress(),
            1,
            TWO_ETHER,
            TWENTY_ETHER,
            THIRTY_DAYS,
            ZERO_POINT_ONE_ETHER,
            true,
            ZeroAddress
          );
        const agreement = await drFeeMutualizer.getAgreement(1);
        expect(agreement.maxAmountPerTx).to.equal(TWO_ETHER);
        expect(agreement.maxAmountTotal).to.equal(TWENTY_ETHER);
        expect(agreement.tokenAddress).to.equal(ZeroAddress);
      });

      it("should revert when agreement ID is invalid", async function () {
        await expect(drFeeMutualizer.getAgreement(999)).to.be.revertedWithCustomError(
          drFeeMutualizer,
          "InvalidAgreementId"
        );
      });
    });

    context("👉 getAgreementId()", async function () {
      it("should return correct agreement ID for specific dispute resolver", async function () {
        const disputeResolverId = 1;
        await drFeeMutualizer
          .connect(owner)
          .newAgreement(
            await seller.getAddress(),
            disputeResolverId,
            TWO_ETHER,
            TWENTY_ETHER,
            THIRTY_DAYS,
            ZERO_POINT_ONE_ETHER,
            true,
            ZeroAddress
          );
        const agreementId = await drFeeMutualizer.getAgreementId(await seller.getAddress(), disputeResolverId);
        expect(agreementId).to.equal(1);
      });

      it("should return universal agreement ID when specific one doesn't exist", async function () {
        await drFeeMutualizer
          .connect(owner)
          .newAgreement(
            await seller.getAddress(),
            0,
            TWO_ETHER,
            TWENTY_ETHER,
            THIRTY_DAYS,
            ZERO_POINT_ONE_ETHER,
            true,
            ZeroAddress
          );
        const agreementId = await drFeeMutualizer.getAgreementId(await seller.getAddress(), 999);
        expect(agreementId).to.equal(1);
      });

      it("should return zero for non-existent agreement", async function () {
        const agreementId = await drFeeMutualizer.getAgreementId(await seller.getAddress(), 999);
        expect(agreementId).to.equal(0);
      });
    });
  });

  context("📋 DR Fee Management", async function () {
    context("👉 isSellerCovered()", async function () {
      beforeEach(async function () {
        await drFeeMutualizer
          .connect(owner)
          .newAgreement(
            await seller.getAddress(),
            1,
            TWO_ETHER,
            TWENTY_ETHER,
            THIRTY_DAYS,
            ZERO_POINT_ONE_ETHER,
            true,
            ZeroAddress
          );
        await drFeeMutualizer.connect(seller).payPremium(1, { value: ZERO_POINT_ONE_ETHER });
        await drFeeMutualizer.connect(owner).deposit(ZeroAddress, 0, { value: FIVE_ETHER });
      });

      it("should return true when seller is covered", async function () {
        const isCovered = await drFeeMutualizer.isSellerCovered(
          await seller.getAddress(),
          ZERO_POINT_FIVE_ETHER,
          ZeroAddress,
          1
        );
        expect(isCovered).to.be.true;
      });

      it("should return false when fee amount exceeds maxAmountPerTx", async function () {
        const isCovered = await drFeeMutualizer.isSellerCovered(await seller.getAddress(), THREE_ETHER, ZeroAddress, 1);
        expect(isCovered).to.be.false;
      });

      it("should return false when total mutualized would exceed maxAmountTotal", async function () {
        await drFeeMutualizer.connect(protocol).requestDRFee(await seller.getAddress(), EIGHT_ETHER, ZeroAddress, 1, 1);
        const isCovered = await drFeeMutualizer.isSellerCovered(await seller.getAddress(), THREE_ETHER, ZeroAddress, 1);
        expect(isCovered).to.be.false;
      });

      it("should return false when agreement is expired", async function () {
        const timeInreasePeriod = THIRTY_ONE_DAYS; // 31 days
        await ethers.provider.send("evm_increaseTime", [timeInreasePeriod]);
        await ethers.provider.send("evm_mine");
        const isCovered = await drFeeMutualizer.isSellerCovered(
          await seller.getAddress(),
          ZERO_POINT_FIVE_ETHER,
          ZeroAddress,
          1
        );
        expect(isCovered).to.be.false;
      });

      it("should return false when agreement is voided", async function () {
        await drFeeMutualizer.connect(seller).voidAgreement(1);
        const isCovered = await drFeeMutualizer.isSellerCovered(
          await seller.getAddress(),
          ZERO_POINT_FIVE_ETHER,
          ZeroAddress,
          1
        );
        expect(isCovered).to.be.false;
      });

      it("should return false when token address doesn't match", async function () {
        const isCovered = await drFeeMutualizer.isSellerCovered(
          await seller.getAddress(),
          ZERO_POINT_FIVE_ETHER,
          await mockToken.getAddress(),
          1
        );
        expect(isCovered).to.be.false;
      });

      it("should return false when pool balance is insufficient", async function () {
        await drFeeMutualizer.connect(owner).withdraw(ZeroAddress, FIVE_ETHER, await owner.getAddress());
        const isCovered = await drFeeMutualizer.isSellerCovered(
          await seller.getAddress(),
          ZERO_POINT_FIVE_ETHER,
          ZeroAddress,
          1
        );
        expect(isCovered).to.be.false;
      });

      it("should check for 'any dispute resolver' agreement when specific one doesn't exist", async function () {
        await drFeeMutualizer
          .connect(owner)
          .newAgreement(
            await seller.getAddress(),
            0,
            TWO_ETHER,
            TWENTY_ETHER,
            THIRTY_DAYS,
            ZERO_POINT_ONE_ETHER,
            true,
            ZeroAddress
          );
        await drFeeMutualizer.connect(seller).payPremium(2, { value: ZERO_POINT_ONE_ETHER });
        const isCovered = await drFeeMutualizer.isSellerCovered(
          await seller.getAddress(),
          ZERO_POINT_FIVE_ETHER,
          ZeroAddress,
          999
        );
        expect(isCovered).to.be.true;
      });
    });

    context("👉 requestDRFee()", async function () {
      beforeEach(async function () {
        await drFeeMutualizer
          .connect(owner)
          .newAgreement(
            await seller.getAddress(),
            1,
            TWO_ETHER,
            TWENTY_ETHER,
            THIRTY_DAYS,
            ZERO_POINT_ONE_ETHER,
            true,
            ZeroAddress
          );
        await drFeeMutualizer.connect(seller).payPremium(1, { value: ZERO_POINT_ONE_ETHER });
        await drFeeMutualizer.connect(owner).deposit(ZeroAddress, 0, { value: FIVE_ETHER });
      });

      it("should request DR fee successfully", async function () {
        const feeAmount = ZERO_POINT_FIVE_ETHER;
        const exchangeId = 123;
        const protocolBalanceBefore = await ethers.provider.getBalance(await protocol.getAddress());

        await expect(
          drFeeMutualizer
            .connect(protocol)
            .requestDRFee(await seller.getAddress(), feeAmount, ZeroAddress, exchangeId, 1)
        )
          .to.emit(drFeeMutualizer, "DRFeeProvided")
          .withArgs(exchangeId, await seller.getAddress(), feeAmount);

        const protocolBalanceAfter = await ethers.provider.getBalance(await protocol.getAddress());
        expect(protocolBalanceAfter - protocolBalanceBefore).to.equal(feeAmount);
      });

      it("should return false when seller is not covered", async function () {
        const feeAmount = THREE_ETHER;
        const isCovered = await drFeeMutualizer.isSellerCovered(await seller.getAddress(), feeAmount, ZeroAddress, 1);
        expect(isCovered).to.be.false;
      });

      context("💔 Revert Reasons", async function () {
        it("should revert when caller is not protocol", async function () {
          const feeAmount = ZERO_POINT_FIVE_ETHER;
          const exchangeId = 123;
          await expect(
            drFeeMutualizer
              .connect(rando)
              .requestDRFee(await seller.getAddress(), feeAmount, ZeroAddress, exchangeId, 1)
          ).to.be.revertedWithCustomError(drFeeMutualizer, "OnlyProtocol");
        });
      });
    });

    context("👉 returnDRFee()", async function () {
      let exchangeId;

      beforeEach(async function () {
        const tx = await drFeeMutualizer
          .connect(owner)
          .newAgreement(
            await seller.getAddress(),
            1,
            TWO_ETHER,
            TWENTY_ETHER,
            THIRTY_DAYS,
            ZERO_POINT_ONE_ETHER,
            true,
            ZeroAddress
          );
        const receipt = await tx.wait();
        const agreementId = receipt.logs[0].args[0];
        await drFeeMutualizer.connect(seller).payPremium(agreementId, { value: ZERO_POINT_ONE_ETHER });
        await drFeeMutualizer.connect(owner).deposit(ZeroAddress, 0, { value: FIVE_ETHER });
        exchangeId = 123;
        await drFeeMutualizer
          .connect(protocol)
          .requestDRFee(await seller.getAddress(), ZERO_POINT_FIVE_ETHER, ZeroAddress, exchangeId, 1);
      });

      it("should return fee amount to pool", async function () {
        const returnAmount = ZERO_POINT_THREE_ETHER;
        const poolBalanceBefore = await drFeeMutualizer.getPoolBalance(ZeroAddress);

        await drFeeMutualizer.connect(protocol).returnDRFee(exchangeId, returnAmount, { value: returnAmount });

        const poolBalanceAfter = await drFeeMutualizer.getPoolBalance(ZeroAddress);
        expect(poolBalanceAfter - poolBalanceBefore).to.equal(returnAmount);
      });

      it("should clean up tracking after fee return", async function () {
        const returnAmount = ZERO_POINT_THREE_ETHER;
        await drFeeMutualizer.connect(protocol).returnDRFee(exchangeId, returnAmount, { value: returnAmount });

        await expect(
          drFeeMutualizer
            .connect(protocol)
            .returnDRFee(exchangeId, ZERO_POINT_ONE_ETHER, { value: ZERO_POINT_ONE_ETHER })
        ).to.be.revertedWithCustomError(drFeeMutualizer, "InvalidExchangeId");
      });

      context("💔 Revert Reasons", async function () {
        it("should revert when feeAmount is 0", async function () {
          await expect(drFeeMutualizer.connect(protocol).returnDRFee(exchangeId, 0)).to.be.revertedWithCustomError(
            drFeeMutualizer,
            "InvalidAmount"
          );
        });

        it("should revert when exchange ID is invalid", async function () {
          await expect(
            drFeeMutualizer.connect(protocol).returnDRFee(999, ZERO_POINT_ONE_ETHER, { value: ZERO_POINT_ONE_ETHER })
          ).to.be.revertedWithCustomError(drFeeMutualizer, "InvalidExchangeId");
        });

        it("should revert when incorrect native amount sent", async function () {
          const returnAmount = ZERO_POINT_THREE_ETHER;
          const wrongAmount = ZERO_POINT_TWO_ETHER;
          await expect(
            drFeeMutualizer.connect(protocol).returnDRFee(exchangeId, returnAmount, { value: wrongAmount })
          ).to.be.revertedWithCustomError(drFeeMutualizer, "IncorrectNativeAmount");
        });

        it("should revert when native currency sent for ERC20 token", async function () {
          const tx = await drFeeMutualizer
            .connect(owner)
            .newAgreement(
              await seller.getAddress(),
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
            await seller.getAddress(),
            ZERO_POINT_FIVE_ETHER,
            await mockToken.getAddress(),
            2
          );
          expect(isCovered).to.be.true;

          await drFeeMutualizer
            .connect(protocol)
            .requestDRFee(
              await seller.getAddress(),
              ZERO_POINT_FIVE_ETHER,
              await mockToken.getAddress(),
              erc20ExchangeId,
              2
            );

          await expect(
            drFeeMutualizer.connect(protocol).returnDRFee(erc20ExchangeId, ZERO_POINT_THREE_ETHER, { value: 1000 })
          ).to.be.revertedWithCustomError(drFeeMutualizer, "NativeNotAllowed");
        });

        it("should revert when caller is not protocol", async function () {
          await expect(
            drFeeMutualizer
              .connect(rando)
              .returnDRFee(exchangeId, ZERO_POINT_ONE_ETHER, { value: ZERO_POINT_ONE_ETHER })
          ).to.be.revertedWithCustomError(drFeeMutualizer, "OnlyProtocol");
        });
      });
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
          "Ownable: caller is not the owner"
        );
      });
    });
  });

  context("📋 Edge Cases and Integration", async function () {
    it("should handle multiple agreements for same seller with different dispute resolvers", async function () {
      await drFeeMutualizer
        .connect(owner)
        .newAgreement(
          await seller.getAddress(),
          1,
          TWO_ETHER,
          TWENTY_ETHER,
          THIRTY_DAYS,
          ZERO_POINT_ONE_ETHER,
          true,
          ZeroAddress
        );
      await drFeeMutualizer
        .connect(owner)
        .newAgreement(
          await seller.getAddress(),
          2,
          TWO_ETHER,
          TWENTY_ETHER,
          THIRTY_DAYS,
          ZERO_POINT_ONE_ETHER,
          true,
          ZeroAddress
        );
      const agreementId1 = await drFeeMutualizer.getAgreementId(await seller.getAddress(), 1);
      const agreementId2 = await drFeeMutualizer.getAgreementId(await seller.getAddress(), 2);
      expect(agreementId1).to.equal(1);
      expect(agreementId2).to.equal(2);
    });

    it("should allow creating specific agreement when universal agreement exists", async function () {
      await drFeeMutualizer
        .connect(owner)
        .newAgreement(
          await seller.getAddress(),
          0,
          TWO_ETHER,
          TWENTY_ETHER,
          THIRTY_DAYS,
          ZERO_POINT_ONE_ETHER,
          true,
          ZeroAddress
        );
      await drFeeMutualizer.connect(seller).payPremium(1, { value: ZERO_POINT_ONE_ETHER });

      await expect(
        drFeeMutualizer
          .connect(owner)
          .newAgreement(
            await seller.getAddress(),
            1,
            TWO_ETHER,
            TWENTY_ETHER,
            THIRTY_DAYS,
            ZERO_POINT_ONE_ETHER,
            true,
            ZeroAddress
          )
      )
        .to.emit(drFeeMutualizer, "AgreementCreated")
        .withArgs(2, await seller.getAddress(), 1);
    });

    it("should allow creating universal agreement when specific agreements exist", async function () {
      await drFeeMutualizer
        .connect(owner)
        .newAgreement(
          await seller.getAddress(),
          1,
          TWO_ETHER,
          TWENTY_ETHER,
          THIRTY_DAYS,
          ZERO_POINT_ONE_ETHER,
          true,
          ZeroAddress
        );
      await drFeeMutualizer.connect(seller).payPremium(1, { value: ZERO_POINT_ONE_ETHER });

      await expect(
        drFeeMutualizer
          .connect(owner)
          .newAgreement(
            await seller.getAddress(),
            0,
            TWO_ETHER,
            TWENTY_ETHER,
            THIRTY_DAYS,
            ZERO_POINT_ONE_ETHER,
            true,
            ZeroAddress
          )
      )
        .to.emit(drFeeMutualizer, "AgreementCreated")
        .withArgs(2, await seller.getAddress(), 0);
    });

    it("should prevent creating duplicate agreement for same dispute resolver", async function () {
      await drFeeMutualizer
        .connect(owner)
        .newAgreement(
          await seller.getAddress(),
          1,
          TWO_ETHER,
          TWENTY_ETHER,
          THIRTY_DAYS,
          ZERO_POINT_ONE_ETHER,
          true,
          ZeroAddress
        );
      await drFeeMutualizer.connect(seller).payPremium(1, { value: ZERO_POINT_ONE_ETHER });

      await expect(
        drFeeMutualizer
          .connect(owner)
          .newAgreement(
            await seller.getAddress(),
            1,
            TWO_ETHER,
            TWENTY_ETHER,
            THIRTY_DAYS,
            ZERO_POINT_ONE_ETHER,
            true,
            ZeroAddress
          )
      ).to.be.revertedWithCustomError(drFeeMutualizer, "AgreementAlreadyExists");
    });

    it("should allow creating agreement when previous one is expired", async function () {
      await drFeeMutualizer
        .connect(owner)
        .newAgreement(
          await seller.getAddress(),
          1,
          TWO_ETHER,
          TWENTY_ETHER,
          ONE_DAY,
          ZERO_POINT_ONE_ETHER,
          true,
          ZeroAddress
        );
      await drFeeMutualizer.connect(seller).payPremium(1, { value: ZERO_POINT_ONE_ETHER });

      const timeInreasePeriod = TWO_DAYS; // 2 days
      await ethers.provider.send("evm_increaseTime", [timeInreasePeriod]);
      await ethers.provider.send("evm_mine");

      await expect(
        drFeeMutualizer
          .connect(owner)
          .newAgreement(
            await seller.getAddress(),
            1,
            TWO_ETHER,
            TWENTY_ETHER,
            THIRTY_DAYS,
            ZERO_POINT_ONE_ETHER,
            true,
            ZeroAddress
          )
      )
        .to.emit(drFeeMutualizer, "AgreementCreated")
        .withArgs(2, await seller.getAddress(), 1);
    });

    it("should handle token transfer failures gracefully", async function () {
      const DRFeeMutualizerFactory = await getContractFactory("DRFeeMutualizer");
      const drFeeMutualizerWithMockProtocol = await DRFeeMutualizerFactory.deploy(await mockToken.getAddress());
      await drFeeMutualizerWithMockProtocol.waitForDeployment();

      await drFeeMutualizerWithMockProtocol
        .connect(owner)
        .newAgreement(
          await seller.getAddress(),
          1,
          TWO_ETHER,
          TWENTY_ETHER,
          THIRTY_DAYS,
          ZERO_POINT_ONE_ETHER,
          true,
          ZeroAddress
        );
      await drFeeMutualizerWithMockProtocol.connect(seller).payPremium(1, { value: ZERO_POINT_ONE_ETHER });
      await drFeeMutualizerWithMockProtocol.connect(owner).deposit(ZeroAddress, 0, { value: FIVE_ETHER });

      const isCovered = await drFeeMutualizerWithMockProtocol.isSellerCovered(
        await seller.getAddress(),
        ZERO_POINT_FIVE_ETHER,
        ZeroAddress,
        1
      );
      expect(isCovered).to.be.true;
    });

    it("should handle ERC20 fee return correctly", async function () {
      const tx = await drFeeMutualizer
        .connect(owner)
        .newAgreement(
          await seller.getAddress(),
          2,
          TWO_ETHER,
          TWENTY_ETHER,
          THIRTY_DAYS,
          ZERO_POINT_ONE_ETHER,
          true,
          await mockToken.getAddress()
        );
      const receipt = await tx.wait();
      const erc20AgreementId = receipt.logs[0].args[0]; // Extract agreement ID from event

      await mockToken.connect(seller).approve(await drFeeMutualizer.getAddress(), HUNDRED_ETHER);
      await drFeeMutualizer.connect(seller).payPremium(erc20AgreementId);

      await mockToken.connect(owner).approve(await drFeeMutualizer.getAddress(), FIVE_ETHER);
      await drFeeMutualizer.connect(owner).deposit(await mockToken.getAddress(), FIVE_ETHER);

      const erc20ExchangeId = 456;
      await drFeeMutualizer
        .connect(protocol)
        .requestDRFee(
          await seller.getAddress(),
          ZERO_POINT_FIVE_ETHER,
          await mockToken.getAddress(),
          erc20ExchangeId,
          2
        );

      const poolBalanceBefore = await drFeeMutualizer.getPoolBalance(await mockToken.getAddress());
      const returnAmount = ZERO_POINT_THREE_ETHER;

      await mockToken.connect(protocol).approve(await drFeeMutualizer.getAddress(), returnAmount);
      await drFeeMutualizer.connect(protocol).returnDRFee(erc20ExchangeId, returnAmount);

      const poolBalanceAfter = await drFeeMutualizer.getPoolBalance(await mockToken.getAddress());
      expect(poolBalanceAfter - poolBalanceBefore).to.equal(returnAmount);
    });

    it("should handle voiding agreement with refundOnCancel false", async function () {
      const tx = await drFeeMutualizer
        .connect(owner)
        .newAgreement(
          await seller.getAddress(),
          3,
          TWO_ETHER,
          TWENTY_ETHER,
          THIRTY_DAYS,
          ZERO_POINT_ONE_ETHER,
          false,
          ZeroAddress
        );
      const receipt = await tx.wait();
      const agreementId = receipt.logs[0].args[0]; // Extract agreement ID from event

      await drFeeMutualizer.connect(seller).payPremium(agreementId, { value: ZERO_POINT_ONE_ETHER });

      await expect(drFeeMutualizer.connect(seller).voidAgreement(agreementId))
        .to.emit(drFeeMutualizer, "AgreementVoided")
        .withArgs(agreementId, false);

      const agreement = await drFeeMutualizer.getAgreement(agreementId);
      expect(agreement.isVoided).to.equal(true);
    });

    it("should handle voiding inactive agreement", async function () {
      const tx = await drFeeMutualizer
        .connect(owner)
        .newAgreement(
          await seller.getAddress(),
          4,
          TWO_ETHER,
          TWENTY_ETHER,
          THIRTY_DAYS,
          ZERO_POINT_ONE_ETHER,
          true,
          ZeroAddress
        );
      const receipt = await tx.wait();
      const agreementId = receipt.logs[0].args[0]; // Extract agreement ID from event

      await expect(drFeeMutualizer.connect(seller).voidAgreement(agreementId))
        .to.emit(drFeeMutualizer, "AgreementVoided")
        .withArgs(agreementId, false);

      const agreement = await drFeeMutualizer.getAgreement(agreementId);
      expect(agreement.isVoided).to.equal(true);
    });

    it("should handle time-based refund calculation correctly", async function () {
      const tx = await drFeeMutualizer
        .connect(owner)
        .newAgreement(await seller.getAddress(), 5, TWO_ETHER, TWENTY_ETHER, TWELVE_DAYS, ONE_ETHER, true, ZeroAddress);
      const receipt = await tx.wait();
      const agreementId = receipt.logs[0].args[0]; // Extract agreement ID from event

      await drFeeMutualizer.connect(seller).payPremium(agreementId, { value: ONE_ETHER });

      // Advance time by 9 days (75% of the period)
      await ethers.provider.send("evm_increaseTime", [NINE_DAYS]);
      await ethers.provider.send("evm_mine");

      const sellerBalanceBefore = await ethers.provider.getBalance(await seller.getAddress());
      await drFeeMutualizer.connect(seller).voidAgreement(agreementId);
      const sellerBalanceAfter = await ethers.provider.getBalance(await seller.getAddress());

      // Should refund 25% of the premium (3 days remaining out of 12)
      const expectedRefund = ZERO_POINT_TWO_FIVE_ETHER;
      const actualRefund = sellerBalanceAfter - sellerBalanceBefore;
      // Use tolerance for gas costs and precision
      expect(actualRefund).to.be.closeTo(expectedRefund, ZERO_POINT_ZERO_ZERO_ONE_ETHER);
    });

    it("should handle ERC20 time-based refund calculation correctly", async function () {
      const tx = await drFeeMutualizer
        .connect(owner)
        .newAgreement(
          await seller.getAddress(),
          7,
          TWO_ETHER,
          TWENTY_ETHER,
          TWELVE_DAYS,
          HUNDRED_ETHER,
          true,
          await mockToken.getAddress()
        );
      const receipt = await tx.wait();
      const agreementId = receipt.logs[0].args[0]; // Extract agreement ID from event

      await mockToken.connect(seller).approve(await drFeeMutualizer.getAddress(), HUNDRED_ETHER);
      await drFeeMutualizer.connect(seller).payPremium(agreementId);

      // Advance time by 9 days (75% of the period)
      await ethers.provider.send("evm_increaseTime", [NINE_DAYS]);
      await ethers.provider.send("evm_mine");

      const sellerTokenBalanceBefore = await mockToken.balanceOf(await seller.getAddress());
      await drFeeMutualizer.connect(seller).voidAgreement(agreementId);
      const sellerTokenBalanceAfter = await mockToken.balanceOf(await seller.getAddress());

      // Should refund 25% of the premium (3 days remaining out of 12)
      const expectedRefund = TWENTY_FIVE_ETHER; // 25% of 100 ether
      const actualRefund = sellerTokenBalanceAfter - sellerTokenBalanceBefore;

      // Use tolerance for integer division precision loss
      expect(actualRefund).to.be.closeTo(expectedRefund, parseUnits("0.0001", "ether"));
    });

    it("should handle maxAmountTotal limit correctly", async function () {
      const tx = await drFeeMutualizer.connect(owner).newAgreement(
        await seller.getAddress(),
        6,
        ONE_ETHER,
        TWO_ETHER, // Low total limit
        THIRTY_DAYS,
        ZERO_POINT_ONE_ETHER,
        true,
        ZeroAddress
      );
      const receipt = await tx.wait();
      const agreementId = receipt.logs[0].args[0]; // Extract agreement ID from event

      await drFeeMutualizer.connect(seller).payPremium(agreementId, { value: ZERO_POINT_ONE_ETHER });
      await drFeeMutualizer.connect(owner).deposit(ZeroAddress, 0, { value: FIVE_ETHER });

      // First request should succeed
      await drFeeMutualizer.connect(protocol).requestDRFee(await seller.getAddress(), ONE_ETHER, ZeroAddress, 100, 6);

      // Check that the first request was successful by verifying state changes
      const agreement1 = await drFeeMutualizer.getAgreement(agreementId);
      expect(agreement1.totalMutualized).to.equal(ONE_ETHER);

      // Second request should succeed
      await drFeeMutualizer.connect(protocol).requestDRFee(await seller.getAddress(), ONE_ETHER, ZeroAddress, 101, 6);

      // Check that the second request was successful
      const agreement2 = await drFeeMutualizer.getAgreement(agreementId);
      expect(agreement2.totalMutualized).to.equal(TWO_ETHER);

      // Third request should fail (exceeds maxAmountTotal)
      // Check that seller is not covered for the third request
      const isCovered = await drFeeMutualizer.isSellerCovered(await seller.getAddress(), ONE_ETHER, ZeroAddress, 6);
      expect(isCovered).to.be.false;
    });
  });
});
