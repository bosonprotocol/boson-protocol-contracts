const { ethers } = require("hardhat");
const { expect } = require("chai");
const { ZeroAddress, getSigners, getContractFactory, parseUnits } = ethers;
const { getSnapshot, revertToSnapshot, setNextBlockTimestamp } = require("../../util/utils.js");
const { deployMockTokens } = require("../../../scripts/util/deploy-mock-tokens");
const { RevertReasons } = require("../../../scripts/config/revert-reasons.js");

// Time period constants
const ONE_DAY = 24 * 60 * 60;
const TWO_DAYS = 2 * ONE_DAY;
const FOUR_DAYS = 4 * ONE_DAY;
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

// Common test constants
const INVALID_ID = 999;
const ZERO_AMOUNT = 0;
const EXCHANGE_ID_1 = 123;
const EXCHANGE_ID_2 = 456;
const EXCHANGE_ID_3 = 789;

const setupMockProtocolAndMutualizer = async (sellerId, sellerAddress, wethAddress) => {
  const MockProtocolFactory = await getContractFactory("MockBosonProtocolForMutualizer");
  const mockProtocol = await MockProtocolFactory.deploy();
  await mockProtocol.waitForDeployment();
  await mockProtocol.setSeller(sellerId, sellerAddress);

  const MockForwarderFactory = await getContractFactory("MockForwarder");
  const mockForwarder = await MockForwarderFactory.deploy();
  await mockForwarder.waitForDeployment();

  const DRFeeMutualizerFactory = await getContractFactory("DRFeeMutualizer");
  const drFeeMutualizer = await DRFeeMutualizerFactory.deploy(
    await mockProtocol.getAddress(),
    await mockForwarder.getAddress(),
    wethAddress
  );
  await drFeeMutualizer.waitForDeployment();
  return { mockProtocol, drFeeMutualizer, mockForwarder };
};

describe("DRFeeMutualizer", function () {
  let drFeeMutualizer;
  let protocol, owner, seller, buyer, rando, mockToken;
  let snapshotId;
  let weth;

  before(async function () {
    [owner, protocol, seller, buyer, rando] = await getSigners();

    // Add WETH
    const wethFactory = await getContractFactory("WETH9");
    weth = await wethFactory.deploy();
    await weth.waitForDeployment();

    const MockForwarderFactory = await getContractFactory("MockForwarder");
    const mockForwarder = await MockForwarderFactory.deploy();
    await mockForwarder.waitForDeployment();

    const DRFeeMutualizerFactory = await getContractFactory("DRFeeMutualizer");
    drFeeMutualizer = await DRFeeMutualizerFactory.deploy(
      await protocol.getAddress(),
      await mockForwarder.getAddress(),
      await weth.getAddress()
    );
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

    context("💔 Revert Reasons", async function () {
      it("should revert when protocol address is zero", async function () {
        const MockForwarderFactory = await getContractFactory("MockForwarder");
        const mockForwarder = await MockForwarderFactory.deploy();
        await mockForwarder.waitForDeployment();

        const DRFeeMutualizerFactory = await getContractFactory("DRFeeMutualizer");
        await expect(
          DRFeeMutualizerFactory.deploy(ZeroAddress, await mockForwarder.getAddress(), await weth.getAddress())
        ).to.be.revertedWithCustomError(DRFeeMutualizerFactory, RevertReasons.INVALID_PROTOCOL_ADDRESS);
      });

      it("should revert when wrapped native address is zero", async function () {
        const MockForwarderFactory = await getContractFactory("MockForwarder");
        const mockForwarder = await MockForwarderFactory.deploy();
        await mockForwarder.waitForDeployment();

        const DRFeeMutualizerFactory = await getContractFactory("DRFeeMutualizer");
        await expect(
          DRFeeMutualizerFactory.deploy(await protocol.getAddress(), await mockForwarder.getAddress(), ZeroAddress)
        ).to.be.revertedWithCustomError(DRFeeMutualizerFactory, RevertReasons.INVALID_ADDRESS);
      });
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

        it("should allow direct calls when deposits are not restricted", async function () {
          const amount = ONE_ETHER;
          await expect(drFeeMutualizer.connect(seller).deposit(ZeroAddress, amount, { value: amount }))
            .to.emit(drFeeMutualizer, "FundsDeposited")
            .withArgs(await seller.getAddress(), ZeroAddress, amount);
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
              drFeeMutualizer.connect(owner).deposit(ZeroAddress, ZERO_AMOUNT, { value: ZERO_AMOUNT })
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
              drFeeMutualizer.connect(owner).deposit(await mockToken.getAddress(), ZERO_AMOUNT)
            ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.INVALID_AMOUNT);
          });

          it("should revert when native value sent for ERC20 token", async function () {
            const amount = ONE_ETHER;
            await expect(
              drFeeMutualizer
                .connect(owner)
                .deposit(await mockToken.getAddress(), amount, { value: ZERO_POINT_FIVE_ETHER })
            ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.NATIVE_NOT_ALLOWED);
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
              drFeeMutualizer.connect(owner).withdraw(ZeroAddress, ZERO_AMOUNT, await buyer.getAddress())
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
        expect(balance).to.equal(ZERO_AMOUNT);
      });
    });
  });

  context("📋 Agreement Management", async function () {
    let drFeeMutualizer;
    let mockProtocol;
    const sellerId = 1;

    beforeEach(async function () {
      const setup = await setupMockProtocolAndMutualizer(sellerId, seller.address, await weth.getAddress());
      mockProtocol = setup.mockProtocol;
      drFeeMutualizer = setup.drFeeMutualizer;
    });

    context("👉 newAgreement()", async function () {
      const disputeResolverId = 1;
      const agreementId = 1;
      it("should create agreement successfully", async function () {
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
              tokenAddress,
              disputeResolverId,
              maxAmountPerTx,
              maxAmountTotal,
              timePeriod,
              premium,
              refundOnCancel
            )
        )
          .to.emit(drFeeMutualizer, "AgreementCreated")
          .withArgs(agreementId, sellerId, tokenAddress, disputeResolverId);

        const agreement = await drFeeMutualizer.getAgreement(agreementId);
        expect(agreement.maxAmountPerTx).to.equal(maxAmountPerTx);
        expect(agreement.maxAmountTotal).to.equal(maxAmountTotal);
        expect(agreement.timePeriod).to.equal(timePeriod);
        expect(agreement.premium).to.equal(premium);
        expect(agreement.refundOnCancel).to.equal(refundOnCancel);
        expect(agreement.tokenAddress).to.equal(tokenAddress);
        expect(agreement.startTime).to.equal(ZERO_AMOUNT);
        expect(agreement.totalMutualized).to.equal(ZERO_AMOUNT);
        expect(agreement.isVoided).to.equal(false);
      });

      context("💔 Revert Reasons", async function () {
        it("should revert when seller is not found", async function () {
          await expect(
            drFeeMutualizer
              .connect(owner)
              .newAgreement(
                ZERO_AMOUNT,
                ZeroAddress,
                disputeResolverId,
                ONE_ETHER,
                TEN_ETHER,
                THIRTY_DAYS,
                ZERO_POINT_ONE_ETHER,
                true
              )
          ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.INVALID_SELLER_ID);
        });

        it("should revert when maxAmountPerTx is zero", async function () {
          await expect(
            drFeeMutualizer
              .connect(owner)
              .newAgreement(
                sellerId,
                ZeroAddress,
                disputeResolverId,
                ZERO_AMOUNT,
                TEN_ETHER,
                THIRTY_DAYS,
                ZERO_POINT_ONE_ETHER,
                true
              )
          ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.MAX_AMOUNT_PER_TX_MUST_BE_GREATER_THAN_ZERO);
        });

        it("should revert when maxAmountTotal is less than maxAmountPerTx", async function () {
          await expect(
            drFeeMutualizer
              .connect(owner)
              .newAgreement(
                sellerId,
                ZeroAddress,
                disputeResolverId,
                TEN_ETHER,
                ONE_ETHER,
                THIRTY_DAYS,
                ZERO_POINT_ONE_ETHER,
                true
              )
          ).to.be.revertedWithCustomError(
            drFeeMutualizer,
            RevertReasons.MAX_TOTAL_MUST_BE_GREATER_THAN_OR_EQUAL_TO_MAX_PER_TX
          );
        });

        it("should revert when timePeriod is zero", async function () {
          await expect(
            drFeeMutualizer
              .connect(owner)
              .newAgreement(
                sellerId,
                ZeroAddress,
                disputeResolverId,
                ONE_ETHER,
                TEN_ETHER,
                ZERO_AMOUNT,
                ZERO_POINT_ONE_ETHER,
                true
              )
          ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.TIME_PERIOD_MUST_BE_GREATER_THAN_ZERO);
        });

        it("should revert when caller is not owner", async function () {
          await expect(
            drFeeMutualizer
              .connect(rando)
              .newAgreement(
                sellerId,
                ZeroAddress,
                disputeResolverId,
                ONE_ETHER,
                TEN_ETHER,
                THIRTY_DAYS,
                ZERO_POINT_ONE_ETHER,
                true
              )
          ).to.be.revertedWith(RevertReasons.OWNABLE_NOT_OWNER);
        });
      });

      context("Race Condition Prevention (payPremium & newAgreement)", async function () {
        const disputeResolverId = 1;

        it("should automatically void existing non-started agreement when creating new one", async function () {
          // Create first agreement but don't pay premium
          const firstTx = await drFeeMutualizer
            .connect(owner)
            .newAgreement(
              sellerId,
              ZeroAddress,
              disputeResolverId,
              ONE_ETHER,
              TEN_ETHER,
              THIRTY_DAYS,
              ZERO_POINT_ONE_ETHER,
              true
            );
          const firstReceipt = await firstTx.wait();
          const firstAgreementId = firstReceipt.logs[0].args[0];

          // Verify first agreement is in mapping and not voided
          let mappedId = await drFeeMutualizer.getAgreementId(sellerId, ZeroAddress, disputeResolverId);
          expect(mappedId).to.equal(firstAgreementId);
          let firstAgreement = await drFeeMutualizer.getAgreement(firstAgreementId);
          expect(firstAgreement.isVoided).to.be.false;
          expect(firstAgreement.startTime).to.equal(0);

          // Create second agreement for same seller/token/disputeResolver - should void first and create second
          await expect(
            drFeeMutualizer
              .connect(owner)
              .newAgreement(
                sellerId,
                ZeroAddress,
                disputeResolverId,
                TWO_ETHER,
                TWENTY_ETHER,
                THIRTY_DAYS,
                ZERO_POINT_TWO_ETHER,
                true
              )
          )
            .to.emit(drFeeMutualizer, "AgreementVoided")
            .withArgs(firstAgreementId, false, 0)
            .and.to.emit(drFeeMutualizer, "AgreementCreated")
            .withArgs(2, sellerId, ZeroAddress, disputeResolverId);

          // Verify first agreement is now voided
          firstAgreement = await drFeeMutualizer.getAgreement(firstAgreementId);
          expect(firstAgreement.isVoided).to.be.true;

          // Verify mapping now points to second agreement
          mappedId = await drFeeMutualizer.getAgreementId(sellerId, ZeroAddress, disputeResolverId);
          expect(mappedId).to.equal(2);
        });

        it("should prevent payPremium on voided agreement after newAgreement replaces it", async function () {
          // Create first agreement
          const firstTx = await drFeeMutualizer
            .connect(owner)
            .newAgreement(
              sellerId,
              ZeroAddress,
              disputeResolverId,
              ONE_ETHER,
              TEN_ETHER,
              THIRTY_DAYS,
              ZERO_POINT_ONE_ETHER,
              true
            );
          const firstReceipt = await firstTx.wait();
          const firstAgreementId = firstReceipt.logs[0].args[0];

          // Create replacement agreement (should void first one)
          await drFeeMutualizer
            .connect(owner)
            .newAgreement(
              sellerId,
              ZeroAddress,
              disputeResolverId,
              TWO_ETHER,
              TWENTY_ETHER,
              THIRTY_DAYS,
              ZERO_POINT_TWO_ETHER,
              true
            );

          // Try to pay premium on first (now voided) agreement
          const premium = ZERO_POINT_ONE_ETHER;
          await expect(
            drFeeMutualizer.connect(seller).payPremium(firstAgreementId, sellerId, { value: premium })
          ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.AGREEMENT_IS_VOIDED);
        });

        it("should not void existing started agreement when trying to create duplicate", async function () {
          // Create and activate first agreement
          const firstTx = await drFeeMutualizer
            .connect(owner)
            .newAgreement(
              sellerId,
              ZeroAddress,
              disputeResolverId,
              ONE_ETHER,
              TEN_ETHER,
              THIRTY_DAYS,
              ZERO_POINT_ONE_ETHER,
              true
            );
          const firstReceipt = await firstTx.wait();
          const firstAgreementId = firstReceipt.logs[0].args[0];
          await drFeeMutualizer.connect(seller).payPremium(firstAgreementId, sellerId, { value: ZERO_POINT_ONE_ETHER });

          // Try to create duplicate - should revert, not void the active one
          await expect(
            drFeeMutualizer
              .connect(owner)
              .newAgreement(
                sellerId,
                ZeroAddress,
                disputeResolverId,
                TWO_ETHER,
                TWENTY_ETHER,
                THIRTY_DAYS,
                ZERO_POINT_TWO_ETHER,
                true
              )
          ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.AGREEMENT_ALREADY_EXISTS);

          // Verify first agreement is still active and not voided
          const agreement = await drFeeMutualizer.getAgreement(firstAgreementId);
          expect(agreement.isVoided).to.be.false;
          expect(agreement.startTime).to.be.greaterThan(0);
        });

        it("should handle replacing expired non-started agreement", async function () {
          // Create first agreement with short time period but don't activate it
          const firstTx = await drFeeMutualizer.connect(owner).newAgreement(
            sellerId,
            ZeroAddress,
            disputeResolverId,
            ONE_ETHER,
            TEN_ETHER,
            ONE_DAY, // Short period
            ZERO_POINT_ONE_ETHER,
            true
          );
          const firstReceipt = await firstTx.wait();
          const firstAgreementId = firstReceipt.logs[0].args[0];

          // Fast forward time beyond the period (but agreement never started, so not really expired)
          const currentBlock = await ethers.provider.getBlock("latest");
          const futureTimestamp = currentBlock.timestamp + TWO_DAYS;
          await setNextBlockTimestamp(futureTimestamp, true);

          // Create replacement - should still void the non-started agreement
          await expect(
            drFeeMutualizer
              .connect(owner)
              .newAgreement(
                sellerId,
                ZeroAddress,
                disputeResolverId,
                TWO_ETHER,
                TWENTY_ETHER,
                THIRTY_DAYS,
                ZERO_POINT_TWO_ETHER,
                true
              )
          )
            .to.emit(drFeeMutualizer, "AgreementVoided")
            .withArgs(firstAgreementId, false, 0);
        });

        it("should handle replacing already-voided non-started agreement", async function () {
          // Create first agreement
          const firstTx = await drFeeMutualizer
            .connect(owner)
            .newAgreement(
              sellerId,
              ZeroAddress,
              disputeResolverId,
              ONE_ETHER,
              TEN_ETHER,
              THIRTY_DAYS,
              ZERO_POINT_ONE_ETHER,
              true
            );
          const firstReceipt = await firstTx.wait();
          const firstAgreementId = firstReceipt.logs[0].args[0];

          // Manually void the first agreement
          await drFeeMutualizer.connect(seller).voidAgreement(firstAgreementId);

          // Create replacement - should not emit AgreementVoided since already voided
          await expect(
            drFeeMutualizer
              .connect(owner)
              .newAgreement(
                sellerId,
                ZeroAddress,
                disputeResolverId,
                TWO_ETHER,
                TWENTY_ETHER,
                THIRTY_DAYS,
                ZERO_POINT_TWO_ETHER,
                true
              )
          )
            .to.emit(drFeeMutualizer, "AgreementCreated")
            .withArgs(2, sellerId, ZeroAddress, disputeResolverId)
            .and.not.to.emit(drFeeMutualizer, "AgreementVoided");
        });
      });
    });

    context("👉 payPremium()", async function () {
      const disputeResolverId = 1;
      const agreementId = 1;
      beforeEach(async function () {
        await drFeeMutualizer
          .connect(owner)
          .newAgreement(
            sellerId,
            ZeroAddress,
            disputeResolverId,
            TWO_ETHER,
            TWENTY_ETHER,
            THIRTY_DAYS,
            ZERO_POINT_ONE_ETHER,
            true
          );
      });

      context("Native Currency", async function () {
        it("should activate agreement with native currency premium", async function () {
          const premium = ZERO_POINT_ONE_ETHER;

          await expect(drFeeMutualizer.connect(seller).payPremium(agreementId, sellerId, { value: premium }))
            .to.emit(drFeeMutualizer, "AgreementActivated")
            .withArgs(agreementId, sellerId);

          const agreement = await drFeeMutualizer.getAgreement(agreementId);
          expect(agreement.startTime).to.be.greaterThan(0);
        });

        context("💔 Revert Reasons", async function () {
          it("should revert when incorrect premium amount", async function () {
            const wrongPremium = ZERO_POINT_TWO_ETHER;
            await expect(
              drFeeMutualizer.connect(seller).payPremium(agreementId, sellerId, { value: wrongPremium })
            ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.INSUFFICIENT_VALUE_RECEIVED);
          });

          it("should revert when agreement is already active", async function () {
            const premium = ZERO_POINT_ONE_ETHER;
            await drFeeMutualizer.connect(seller).payPremium(agreementId, sellerId, { value: premium });

            await expect(
              drFeeMutualizer.connect(seller).payPremium(agreementId, sellerId, { value: premium })
            ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.AGREEMENT_ALREADY_ACTIVE);
          });

          it("should revert when agreement is voided", async function () {
            await drFeeMutualizer.connect(owner).voidAgreement(agreementId);

            const premium = ZERO_POINT_ONE_ETHER;
            await expect(
              drFeeMutualizer.connect(seller).payPremium(agreementId, sellerId, { value: premium })
            ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.AGREEMENT_IS_VOIDED);
          });

          it("should revert when agreement ID is invalid", async function () {
            const premium = ZERO_POINT_ONE_ETHER;
            await expect(
              drFeeMutualizer.connect(seller).payPremium(INVALID_ID, sellerId, { value: premium })
            ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.INVALID_AGREEMENT_ID);
          });

          it("should revert when agreement ID is zero", async function () {
            const premium = ZERO_POINT_ONE_ETHER;
            await expect(
              drFeeMutualizer.connect(seller).payPremium(ZERO_AMOUNT, sellerId, { value: premium })
            ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.INVALID_AGREEMENT_ID);
          });
        });
      });

      context("ERC20 Token", async function () {
        const erc20SellerId = 2;
        const erc20DisputeResolverId = 2;
        const erc20AgreementId = 2;
        beforeEach(async function () {
          // Register seller ID 2 with the mock protocol
          await mockProtocol.setSeller(erc20SellerId, seller.address);

          await drFeeMutualizer
            .connect(owner)
            .newAgreement(
              erc20SellerId,
              await mockToken.getAddress(),
              erc20DisputeResolverId,
              TWO_ETHER,
              TWENTY_ETHER,
              THIRTY_DAYS,
              HUNDRED_ETHER,
              true
            );
        });

        it("should activate agreement with ERC20 premium", async function () {
          const premium = HUNDRED_ETHER;
          await mockToken.connect(seller).approve(await drFeeMutualizer.getAddress(), premium);

          await expect(drFeeMutualizer.connect(seller).payPremium(erc20AgreementId, erc20SellerId))
            .to.emit(drFeeMutualizer, "AgreementActivated")
            .withArgs(erc20AgreementId, erc20SellerId);

          const agreement = await drFeeMutualizer.getAgreement(erc20AgreementId);
          expect(agreement.startTime).to.be.greaterThan(0);
        });

        context("💔 Revert Reasons", async function () {
          it("should revert when native currency sent for ERC20 token", async function () {
            await mockToken.connect(seller).approve(await drFeeMutualizer.getAddress(), HUNDRED_ETHER);
            await expect(
              drFeeMutualizer
                .connect(seller)
                .payPremium(erc20AgreementId, erc20SellerId, { value: ZERO_POINT_FIVE_ETHER })
            ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.NATIVE_NOT_ALLOWED);
          });
        });
      });
    });

    context("👉 voidAgreement()", async function () {
      const disputeResolverId = 1;
      it("should void agreement successfully by seller", async function () {
        const tx = await drFeeMutualizer
          .connect(owner)
          .newAgreement(
            sellerId,
            ZeroAddress,
            disputeResolverId,
            TWO_ETHER,
            TWENTY_ETHER,
            TWELVE_DAYS,
            ZERO_POINT_THREE_ETHER,
            true
          );
        const receipt = await tx.wait();
        const agreementId = receipt.logs[0].args[0];
        await drFeeMutualizer.connect(seller).payPremium(agreementId, sellerId, { value: ZERO_POINT_THREE_ETHER });
        const agreementStartTime = (await drFeeMutualizer.getAgreement(agreementId)).startTime;
        const futureTimestamp = agreementStartTime + BigInt(FOUR_DAYS);
        await setNextBlockTimestamp(Number(futureTimestamp));

        // refund = premium * remaining time / total time
        // refund = 0.3 * 8 / 12 = 0.2 ETHER
        await expect(drFeeMutualizer.connect(seller).voidAgreement(agreementId))
          .to.emit(drFeeMutualizer, "AgreementVoided")
          .withArgs(agreementId, true, ZERO_POINT_TWO_ETHER);
        const agreement = await drFeeMutualizer.getAgreement(agreementId);
        expect(agreement.isVoided).to.equal(true);
      });

      it("should void agreement successfully by owner when refundOnCancel is true", async function () {
        const tx = await drFeeMutualizer
          .connect(owner)
          .newAgreement(
            sellerId,
            ZeroAddress,
            disputeResolverId,
            TWO_ETHER,
            TWENTY_ETHER,
            TWELVE_DAYS,
            ZERO_POINT_THREE_ETHER,
            true
          );
        const receipt = await tx.wait();
        const agreementId = receipt.logs[0].args[0];
        await drFeeMutualizer.connect(seller).payPremium(agreementId, sellerId, { value: ZERO_POINT_THREE_ETHER });
        const agreementStartTime = (await drFeeMutualizer.getAgreement(agreementId)).startTime;
        const futureTimestamp = agreementStartTime + BigInt(FOUR_DAYS);
        await setNextBlockTimestamp(Number(futureTimestamp));

        // refund = premium * remaining time / total time
        // refund = 0.3 * 4 / 12 = 0.2 ETHER
        await expect(drFeeMutualizer.connect(owner).voidAgreement(agreementId))
          .to.emit(drFeeMutualizer, "AgreementVoided")
          .withArgs(agreementId, true, ZERO_POINT_TWO_ETHER);
        const agreement = await drFeeMutualizer.getAgreement(agreementId);
        expect(agreement.isVoided).to.equal(true);
      });

      it("should void agreement with zero refund amount when calculation results in zero", async function () {
        const tx = await drFeeMutualizer.connect(owner).newAgreement(
          sellerId,
          ZeroAddress,
          disputeResolverId,
          TWO_ETHER,
          TWENTY_ETHER,
          ONE_DAY,
          BigInt(1), // random premium amount
          true
        );
        const receipt = await tx.wait();
        const agreementId = receipt.logs[0].args[0];
        await drFeeMutualizer.connect(seller).payPremium(agreementId, sellerId, { value: BigInt(1) });

        const agreement = await drFeeMutualizer.getAgreement(agreementId);
        const agreementStartTime = agreement.startTime;
        const futureTimestamp = agreementStartTime + BigInt(ONE_DAY) - BigInt(1);
        await setNextBlockTimestamp(Number(futureTimestamp));

        await expect(drFeeMutualizer.connect(seller).voidAgreement(agreementId))
          .to.emit(drFeeMutualizer, "AgreementVoided")
          .withArgs(agreementId, false, ZERO_AMOUNT); // premiumRefunded is false because refundAmount is 0

        const voidedAgreement = await drFeeMutualizer.getAgreement(agreementId);
        expect(voidedAgreement.isVoided).to.equal(true);
      });

      context("💔 Revert Reasons", async function () {
        it("should revert when agreement ID is invalid", async function () {
          await expect(drFeeMutualizer.connect(seller).voidAgreement(INVALID_ID)).to.be.revertedWithCustomError(
            drFeeMutualizer,
            RevertReasons.INVALID_AGREEMENT_ID
          );
        });

        it("should revert when agreement ID is zero", async function () {
          await expect(drFeeMutualizer.connect(seller).voidAgreement(ZERO_AMOUNT)).to.be.revertedWithCustomError(
            drFeeMutualizer,
            RevertReasons.INVALID_AGREEMENT_ID
          );
        });

        it("should revert when agreement is already voided", async function () {
          const tx = await drFeeMutualizer
            .connect(owner)
            .newAgreement(
              sellerId,
              ZeroAddress,
              disputeResolverId,
              TWO_ETHER,
              TWENTY_ETHER,
              THIRTY_DAYS,
              ZERO_POINT_ONE_ETHER,
              true
            );
          const receipt = await tx.wait();
          const agreementId = receipt.logs[0].args[0];
          await drFeeMutualizer.connect(seller).payPremium(agreementId, sellerId, { value: ZERO_POINT_ONE_ETHER });
          await drFeeMutualizer.connect(seller).voidAgreement(agreementId);
          await expect(drFeeMutualizer.connect(seller).voidAgreement(agreementId)).to.be.revertedWithCustomError(
            drFeeMutualizer,
            RevertReasons.AGREEMENT_ALREADY_VOIDED
          );
        });

        it("should revert when caller is not authorized", async function () {
          const tx = await drFeeMutualizer
            .connect(owner)
            .newAgreement(
              sellerId,
              ZeroAddress,
              disputeResolverId,
              TWO_ETHER,
              TWENTY_ETHER,
              THIRTY_DAYS,
              ZERO_POINT_ONE_ETHER,
              true
            );
          const receipt = await tx.wait();
          const agreementId = receipt.logs[0].args[0];
          await drFeeMutualizer.connect(seller).payPremium(agreementId, sellerId, { value: ZERO_POINT_ONE_ETHER });
          await expect(drFeeMutualizer.connect(rando).voidAgreement(agreementId)).to.be.revertedWithCustomError(
            drFeeMutualizer,
            RevertReasons.ACCESS_DENIED
          );
        });

        it("should revert when owner tries to void agreement with refundOnCancel false", async function () {
          const tx = await drFeeMutualizer
            .connect(owner)
            .newAgreement(sellerId, ZeroAddress, 2, TWO_ETHER, TWENTY_ETHER, THIRTY_DAYS, ZERO_POINT_ONE_ETHER, false);
          const receipt = await tx.wait();
          const agreementId = receipt.logs[0].args[0];
          await drFeeMutualizer.connect(seller).payPremium(agreementId, sellerId, { value: ZERO_POINT_ONE_ETHER });
          await expect(drFeeMutualizer.connect(owner).voidAgreement(agreementId)).to.be.revertedWithCustomError(
            drFeeMutualizer,
            RevertReasons.ACCESS_DENIED
          );
        });

        it("should revert when seller not found", async function () {
          const nonExistentSellerId = 999;
          await expect(
            drFeeMutualizer
              .connect(owner)
              .newAgreement(
                nonExistentSellerId,
                ZeroAddress,
                disputeResolverId,
                TWO_ETHER,
                TWENTY_ETHER,
                THIRTY_DAYS,
                ZERO_POINT_ONE_ETHER,
                true
              )
          ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.INVALID_SELLER_ID);
        });
      });
    });

    context("👉 getAgreement()", async function () {
      const disputeResolverId = 1;
      const agreementId = 1;
      it("should return agreement details", async function () {
        await drFeeMutualizer
          .connect(owner)
          .newAgreement(
            sellerId,
            ZeroAddress,
            disputeResolverId,
            TWO_ETHER,
            TWENTY_ETHER,
            THIRTY_DAYS,
            ZERO_POINT_ONE_ETHER,
            true
          );
        const agreement = await drFeeMutualizer.getAgreement(agreementId);
        expect(agreement.maxAmountPerTx).to.equal(TWO_ETHER);
        expect(agreement.maxAmountTotal).to.equal(TWENTY_ETHER);
        expect(agreement.tokenAddress).to.equal(ZeroAddress);
      });

      it("should revert when agreement ID is invalid", async function () {
        await expect(drFeeMutualizer.getAgreement(INVALID_ID)).to.be.revertedWithCustomError(
          drFeeMutualizer,
          RevertReasons.INVALID_AGREEMENT_ID
        );
      });

      it("should revert when agreement ID is zero", async function () {
        await expect(drFeeMutualizer.getAgreement(ZERO_AMOUNT)).to.be.revertedWithCustomError(
          drFeeMutualizer,
          RevertReasons.INVALID_AGREEMENT_ID
        );
      });
    });

    context("👉 getAgreementId()", async function () {
      const disputeResolverId = 1;
      it("should return correct agreement ID for specific dispute resolver", async function () {
        await drFeeMutualizer
          .connect(owner)
          .newAgreement(
            sellerId,
            ZeroAddress,
            disputeResolverId,
            TWO_ETHER,
            TWENTY_ETHER,
            THIRTY_DAYS,
            ZERO_POINT_ONE_ETHER,
            true
          );
        const agreementId = await drFeeMutualizer.getAgreementId(sellerId, ZeroAddress, disputeResolverId);
        expect(agreementId).to.equal(1);
      });

      it("should return universal agreement ID when specific one doesn't exist", async function () {
        await drFeeMutualizer
          .connect(owner)
          .newAgreement(
            sellerId,
            ZeroAddress,
            ZERO_AMOUNT,
            TWO_ETHER,
            TWENTY_ETHER,
            THIRTY_DAYS,
            ZERO_POINT_ONE_ETHER,
            true
          );
        const agreementId = await drFeeMutualizer.getAgreementId(sellerId, ZeroAddress, INVALID_ID);
        expect(agreementId).to.equal(1);
      });

      it("should return zero for non-existent agreement", async function () {
        const agreementId = await drFeeMutualizer.getAgreementId(sellerId, ZeroAddress, INVALID_ID);
        expect(agreementId).to.equal(ZERO_AMOUNT);
      });
    });
  });

  context("📋 DR Fee Management", async function () {
    let drFeeMutualizer;
    let mockProtocol;
    const sellerId = 1;

    beforeEach(async function () {
      const setup = await setupMockProtocolAndMutualizer(sellerId, seller.address, await weth.getAddress());
      mockProtocol = setup.mockProtocol;
      drFeeMutualizer = setup.drFeeMutualizer;
    });

    context("👉 isSellerCovered()", async function () {
      const disputeResolverId = 1;
      const agreementId = 1;
      beforeEach(async function () {
        await drFeeMutualizer
          .connect(owner)
          .newAgreement(
            sellerId,
            ZeroAddress,
            disputeResolverId,
            TWO_ETHER,
            TWENTY_ETHER,
            THIRTY_DAYS,
            ZERO_POINT_ONE_ETHER,
            true
          );
        await drFeeMutualizer.connect(seller).payPremium(agreementId, sellerId, { value: ZERO_POINT_ONE_ETHER });
        await drFeeMutualizer.connect(owner).deposit(ZeroAddress, FIVE_ETHER, { value: FIVE_ETHER });
      });

      it("should return true when seller is covered", async function () {
        const isCovered = await drFeeMutualizer.isSellerCovered(
          sellerId,
          ZERO_POINT_FIVE_ETHER,
          ZeroAddress,
          disputeResolverId
        );
        expect(isCovered).to.be.true;
      });

      it("should return false when no agreement exists for seller", async function () {
        const nonExistentSellerId = 999;
        const isCovered = await drFeeMutualizer.isSellerCovered(
          nonExistentSellerId,
          ZERO_POINT_FIVE_ETHER,
          ZeroAddress,
          disputeResolverId
        );
        expect(isCovered).to.be.false;
      });

      it("should return false when agreement exists but not activated", async function () {
        // Create a new agreement but don't pay premium
        await drFeeMutualizer.connect(owner).newAgreement(
          sellerId,
          ZeroAddress,
          5, // Different dispute resolver
          TWO_ETHER,
          TWENTY_ETHER,
          THIRTY_DAYS,
          ZERO_POINT_ONE_ETHER,
          true
        );

        const isCovered = await drFeeMutualizer.isSellerCovered(
          sellerId,
          ZERO_POINT_FIVE_ETHER,
          ZeroAddress,
          5 // Check for the non-activated agreement
        );
        expect(isCovered).to.be.false;
      });

      it("should return false when fee amount exceeds maxAmountPerTx", async function () {
        const isCovered = await drFeeMutualizer.isSellerCovered(sellerId, THREE_ETHER, ZeroAddress, disputeResolverId);
        expect(isCovered).to.be.false;
      });

      it("should return false when total mutualized would exceed maxAmountTotal", async function () {
        await mockProtocol.callRequestDRFee(
          await drFeeMutualizer.getAddress(),
          sellerId,
          EIGHT_ETHER,
          ZeroAddress,
          1,
          disputeResolverId
        );
        const isCovered = await drFeeMutualizer.isSellerCovered(sellerId, THREE_ETHER, ZeroAddress, disputeResolverId);
        expect(isCovered).to.be.false;
      });

      it("should return false when agreement is expired", async function () {
        const agreement = await drFeeMutualizer.getAgreement(agreementId);
        const agreementStartTime = agreement.startTime;
        const futureTimestamp = agreementStartTime + BigInt(THIRTY_ONE_DAYS);
        await setNextBlockTimestamp(Number(futureTimestamp), true);

        const isCovered = await drFeeMutualizer.isSellerCovered(
          sellerId,
          ZERO_POINT_FIVE_ETHER,
          ZeroAddress,
          disputeResolverId
        );
        expect(isCovered).to.be.false;
      });

      it("should return false when agreement is voided", async function () {
        await drFeeMutualizer.connect(seller).voidAgreement(agreementId);
        const isCovered = await drFeeMutualizer.isSellerCovered(
          sellerId,
          ZERO_POINT_FIVE_ETHER,
          ZeroAddress,
          disputeResolverId
        );
        expect(isCovered).to.be.false;
      });

      it("should return false when token address doesn't match", async function () {
        const isCovered = await drFeeMutualizer.isSellerCovered(
          sellerId,
          ZERO_POINT_FIVE_ETHER,
          await mockToken.getAddress(),
          disputeResolverId
        );
        expect(isCovered).to.be.false;
      });

      it("should return false when pool balance is insufficient", async function () {
        await drFeeMutualizer.connect(owner).withdraw(ZeroAddress, FIVE_ETHER, await owner.getAddress());
        const isCovered = await drFeeMutualizer.isSellerCovered(
          sellerId,
          ZERO_POINT_FIVE_ETHER,
          ZeroAddress,
          disputeResolverId
        );
        expect(isCovered).to.be.false;
      });

      it("should check for 'any dispute resolver' agreement when specific one doesn't exist", async function () {
        await drFeeMutualizer
          .connect(owner)
          .newAgreement(sellerId, ZeroAddress, 0, TWO_ETHER, TWENTY_ETHER, THIRTY_DAYS, ZERO_POINT_ONE_ETHER, true);
        await drFeeMutualizer.connect(seller).payPremium(2, sellerId, { value: ZERO_POINT_ONE_ETHER });
        const isCovered = await drFeeMutualizer.isSellerCovered(
          sellerId,
          ZERO_POINT_FIVE_ETHER,
          ZeroAddress,
          INVALID_ID
        );
        expect(isCovered).to.be.true;
      });

      it("should return false when agreement token doesn't match requested token", async function () {
        const isCovered = await drFeeMutualizer.isSellerCovered(
          sellerId,
          ZERO_POINT_FIVE_ETHER,
          await mockToken.getAddress(), // Different token than agreement
          disputeResolverId
        );
        expect(isCovered).to.be.false;
      });

      it("should return false when total mutualized would exceed maxAmountTotal", async function () {
        // Create a new agreement with smaller limits for easier testing
        const tx = await drFeeMutualizer.connect(owner).newAgreement(
          sellerId,
          ZeroAddress,
          999, // Different dispute resolver to avoid conflicts
          parseUnits("5", "ether"), // maxAmountPerTx
          parseUnits("10", "ether"), // maxAmountTotal (smaller limit)
          THIRTY_DAYS,
          ZERO_POINT_ONE_ETHER,
          true
        );
        const receipt = await tx.wait();
        const newAgreementId = receipt.logs[0].args[0];
        await drFeeMutualizer.connect(seller).payPremium(newAgreementId, sellerId, { value: ZERO_POINT_ONE_ETHER });

        const isCovered = await drFeeMutualizer.isSellerCovered(
          sellerId,
          parseUnits("11", "ether"), // This exceeds maxAmountTotal of 10 ETH
          ZeroAddress,
          999 // Use the new dispute resolver
        );
        expect(isCovered).to.be.false;
      });
    });

    context("👉 requestDRFee()", async function () {
      const disputeResolverId = 1;
      const agreementId = 1;
      beforeEach(async function () {
        await drFeeMutualizer
          .connect(owner)
          .newAgreement(
            sellerId,
            ZeroAddress,
            disputeResolverId,
            TWO_ETHER,
            TWENTY_ETHER,
            THIRTY_DAYS,
            ZERO_POINT_ONE_ETHER,
            true
          );
        await drFeeMutualizer.connect(seller).payPremium(agreementId, sellerId, { value: ZERO_POINT_ONE_ETHER });
        await drFeeMutualizer.connect(owner).deposit(ZeroAddress, FIVE_ETHER, { value: FIVE_ETHER });
      });

      it("should request DR fee successfully", async function () {
        const feeAmount = ZERO_POINT_FIVE_ETHER;
        const exchangeId = EXCHANGE_ID_1;
        const protocolBalanceBefore = await ethers.provider.getBalance(await mockProtocol.getAddress());

        await expect(
          mockProtocol.callRequestDRFee(
            await drFeeMutualizer.getAddress(),
            feeAmount,
            sellerId,
            ZeroAddress,
            exchangeId,
            disputeResolverId
          )
        )
          .to.emit(drFeeMutualizer, "DRFeeProvided")
          .withArgs(exchangeId, sellerId, feeAmount);

        const protocolBalanceAfter = await ethers.provider.getBalance(await mockProtocol.getAddress());
        expect(protocolBalanceAfter - protocolBalanceBefore).to.equal(feeAmount);
      });

      it("should request DR fee successfully using universal agreement fallback", async function () {
        await drFeeMutualizer.connect(owner).newAgreement(
          sellerId,
          ZeroAddress,
          0, // Universal agreement
          TWO_ETHER,
          TWENTY_ETHER,
          THIRTY_DAYS,
          ZERO_POINT_ONE_ETHER,
          true
        );
        await drFeeMutualizer.connect(seller).payPremium(2, sellerId, { value: ZERO_POINT_ONE_ETHER }); // agreementId = 2
        await drFeeMutualizer.connect(owner).deposit(ZeroAddress, FIVE_ETHER, { value: FIVE_ETHER });

        const feeAmount = ZERO_POINT_FIVE_ETHER;
        const exchangeId = EXCHANGE_ID_2;
        const protocolBalanceBefore = await ethers.provider.getBalance(await mockProtocol.getAddress());

        // Request fee for a dispute resolver that doesn't have a specific agreement
        await expect(
          mockProtocol.callRequestDRFee(
            await drFeeMutualizer.getAddress(),
            feeAmount,
            sellerId,
            ZeroAddress,
            exchangeId,
            5 // Different dispute resolver ID
          )
        )
          .to.emit(drFeeMutualizer, "DRFeeProvided")
          .withArgs(exchangeId, sellerId, feeAmount);

        const protocolBalanceAfter = await ethers.provider.getBalance(await mockProtocol.getAddress());
        expect(protocolBalanceAfter - protocolBalanceBefore).to.equal(feeAmount);
      });

      it("should request DR fee successfully (ERC20)", async function () {
        const erc20SellerId = 2;
        const erc20DisputeResolverId = 2;
        const erc20AgreementId = 2;
        // Register seller ID 2 with the mock protocol
        await mockProtocol.setSeller(erc20SellerId, seller.address);

        await drFeeMutualizer
          .connect(owner)
          .newAgreement(
            erc20SellerId,
            await mockToken.getAddress(),
            erc20DisputeResolverId,
            TWO_ETHER,
            TWENTY_ETHER,
            THIRTY_DAYS,
            HUNDRED_ETHER,
            true
          );
        await mockToken.connect(seller).approve(await drFeeMutualizer.getAddress(), HUNDRED_ETHER);
        await drFeeMutualizer.connect(seller).payPremium(erc20AgreementId, erc20SellerId);
        await mockToken.connect(owner).approve(await drFeeMutualizer.getAddress(), FIVE_ETHER);
        await drFeeMutualizer.connect(owner).deposit(await mockToken.getAddress(), FIVE_ETHER);

        const feeAmount = ZERO_POINT_FIVE_ETHER;
        const exchangeId = EXCHANGE_ID_2;
        const protocolBalanceBefore = await mockToken.balanceOf(await mockProtocol.getAddress());

        await expect(
          mockProtocol.callRequestDRFee(
            await drFeeMutualizer.getAddress(),
            feeAmount,
            erc20SellerId,
            await mockToken.getAddress(),
            exchangeId,
            erc20DisputeResolverId
          )
        )
          .to.emit(drFeeMutualizer, "DRFeeProvided")
          .withArgs(exchangeId, erc20SellerId, feeAmount);

        const protocolBalanceAfter = await mockToken.balanceOf(await mockProtocol.getAddress());
        expect(protocolBalanceAfter - protocolBalanceBefore).to.equal(feeAmount);
      });

      it("should return false when seller is not covered", async function () {
        const feeAmount = THREE_ETHER;
        const isCovered = await drFeeMutualizer.isSellerCovered(sellerId, feeAmount, ZeroAddress, disputeResolverId);
        expect(isCovered).to.be.false;
      });

      context("💔 Revert Reasons", async function () {
        it("should revert when caller is not protocol", async function () {
          const feeAmount = ZERO_POINT_FIVE_ETHER;
          const exchangeId = EXCHANGE_ID_1;
          await expect(
            drFeeMutualizer.connect(rando).requestDRFee(sellerId, feeAmount, ZeroAddress, exchangeId, disputeResolverId)
          ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.ONLY_PROTOCOL);
        });

        it("should revert when fee amount is zero", async function () {
          const feeAmount = ZERO_AMOUNT;
          const exchangeId = EXCHANGE_ID_1;
          await expect(
            mockProtocol.callRequestDRFee(
              await drFeeMutualizer.getAddress(),
              feeAmount,
              sellerId,
              ZeroAddress,
              exchangeId,
              disputeResolverId
            )
          ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.INVALID_AMOUNT);
        });
      });
    });

    context("👉 returnDRFee()", async function () {
      let exchangeId;
      const disputeResolverId = 1;

      beforeEach(async function () {
        const tx = await drFeeMutualizer
          .connect(owner)
          .newAgreement(
            sellerId,
            ZeroAddress,
            disputeResolverId,
            TWO_ETHER,
            TWENTY_ETHER,
            THIRTY_DAYS,
            ZERO_POINT_ONE_ETHER,
            true
          );
        const receipt = await tx.wait();
        const agreementId = receipt.logs[0].args[0];
        await drFeeMutualizer.connect(seller).payPremium(agreementId, sellerId, { value: ZERO_POINT_ONE_ETHER });
        await drFeeMutualizer.connect(owner).deposit(ZeroAddress, FIVE_ETHER, { value: FIVE_ETHER });
        exchangeId = EXCHANGE_ID_1;
        await mockProtocol.callRequestDRFee(
          await drFeeMutualizer.getAddress(),
          ZERO_POINT_FIVE_ETHER,
          sellerId,
          ZeroAddress,
          exchangeId,
          disputeResolverId
        );
      });

      it("should return fee amount to pool", async function () {
        const returnAmount = ZERO_POINT_THREE_ETHER;
        const poolBalanceBefore = await drFeeMutualizer.getPoolBalance(ZeroAddress);

        await weth.deposit({ value: returnAmount });
        await weth.transfer(await mockProtocol.getAddress(), returnAmount);
        // await mockProtocol.depositFunds(0, await weth.getAddress(), returnAmount);
        await mockProtocol.callReturnDRFee(
          await drFeeMutualizer.getAddress(),
          exchangeId,
          returnAmount,
          await weth.getAddress()
        );

        const poolBalanceAfter = await drFeeMutualizer.getPoolBalance(ZeroAddress);
        expect(poolBalanceAfter - poolBalanceBefore).to.equal(returnAmount);
      });

      it("should allow returning DR fee with 0 amount and clean up tracking (native)", async function () {
        await expect(
          mockProtocol.callReturnDRFee(await drFeeMutualizer.getAddress(), exchangeId, 0, await weth.getAddress())
        ).to.not.be.reverted;

        await expect(
          mockProtocol.callReturnDRFee(await drFeeMutualizer.getAddress(), exchangeId, 0, await weth.getAddress())
        ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.INVALID_EXCHANGE_ID);
      });

      it("should allow returning DR fee with 0 amount and clean up tracking (ERC20)", async function () {
        const erc20SellerId = 2;
        const erc20DisputeResolverId = 2;
        const erc20AgreementId = 2;
        // Register seller ID 2 with the mock protocol
        await mockProtocol.setSeller(erc20SellerId, seller.address);

        await drFeeMutualizer
          .connect(owner)
          .newAgreement(
            erc20SellerId,
            await mockToken.getAddress(),
            erc20DisputeResolverId,
            TWO_ETHER,
            TWENTY_ETHER,
            THIRTY_DAYS,
            HUNDRED_ETHER,
            true
          );
        await mockToken.connect(seller).approve(await drFeeMutualizer.getAddress(), HUNDRED_ETHER);
        await drFeeMutualizer.connect(seller).payPremium(erc20AgreementId, erc20SellerId);
        await mockToken.connect(owner).approve(await drFeeMutualizer.getAddress(), FIVE_ETHER);
        await drFeeMutualizer.connect(owner).deposit(await mockToken.getAddress(), FIVE_ETHER);
        await mockProtocol.callRequestDRFee(
          await drFeeMutualizer.getAddress(),
          ZERO_POINT_FIVE_ETHER,
          erc20SellerId,
          await mockToken.getAddress(),
          EXCHANGE_ID_3,
          erc20DisputeResolverId
        );
        await mockProtocol.approveToken(await mockToken.getAddress(), await drFeeMutualizer.getAddress(), 0);
        await expect(
          mockProtocol.callReturnDRFee(
            await drFeeMutualizer.getAddress(),
            EXCHANGE_ID_3,
            0,
            await mockToken.getAddress()
          )
        ).to.not.be.reverted;
        await expect(
          mockProtocol.callReturnDRFee(
            await drFeeMutualizer.getAddress(),
            EXCHANGE_ID_3,
            ZERO_POINT_ONE_ETHER,
            await mockToken.getAddress()
          )
        ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.INVALID_EXCHANGE_ID);
      });

      context("💔 Revert Reasons", async function () {
        it("should revert when exchange ID is invalid", async function () {
          await expect(
            mockProtocol.callReturnDRFee(await drFeeMutualizer.getAddress(), INVALID_ID, 0, await weth.getAddress())
          ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.INVALID_EXCHANGE_ID);
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
      const erc20SellerId = 2;
      const erc20DisputeResolverId = 2;
      const erc20TokenAddress = await mockToken.getAddress();
      // Register seller ID 2 with the mock protocol
      await mockProtocol.setSeller(erc20SellerId, seller.address);

      const tx = await drFeeMutualizer
        .connect(owner)
        .newAgreement(
          erc20SellerId,
          erc20TokenAddress,
          erc20DisputeResolverId,
          TWO_ETHER,
          TWENTY_ETHER,
          THIRTY_DAYS,
          ZERO_POINT_ONE_ETHER,
          true
        );
      const receipt = await tx.wait();
      const erc20AgreementId = receipt.logs[0].args[0];

      await mockToken.connect(seller).approve(await drFeeMutualizer.getAddress(), HUNDRED_ETHER);
      await drFeeMutualizer.connect(seller).payPremium(erc20AgreementId, erc20SellerId);

      await mockToken.connect(owner).approve(await drFeeMutualizer.getAddress(), FIVE_ETHER);
      await drFeeMutualizer.connect(owner).deposit(await mockToken.getAddress(), FIVE_ETHER);

      const erc20ExchangeId = EXCHANGE_ID_3;
      await mockProtocol.callRequestDRFee(
        await drFeeMutualizer.getAddress(),
        ZERO_POINT_FIVE_ETHER,
        erc20SellerId,
        erc20TokenAddress,
        erc20ExchangeId,
        erc20DisputeResolverId
      );

      const poolBalanceBefore = await drFeeMutualizer.getPoolBalance(await mockToken.getAddress());
      const returnAmount = ZERO_POINT_THREE_ETHER;

      await mockToken.connect(owner).transfer(await mockProtocol.getAddress(), returnAmount);
      await mockProtocol.approveToken(await mockToken.getAddress(), await drFeeMutualizer.getAddress(), returnAmount);

      await mockProtocol.callReturnDRFee(
        await drFeeMutualizer.getAddress(),
        erc20ExchangeId,
        returnAmount,
        await mockToken.getAddress()
      );

      const poolBalanceAfter = await drFeeMutualizer.getPoolBalance(await mockToken.getAddress());
      expect(poolBalanceAfter - poolBalanceBefore).to.equal(returnAmount);
    });
  });

  context("📋 Edge Cases and Integration", async function () {
    let drFeeMutualizer;
    let mockProtocol;
    const sellerId = 1;

    beforeEach(async function () {
      const setup = await setupMockProtocolAndMutualizer(sellerId, seller.address, await weth.getAddress());
      mockProtocol = setup.mockProtocol;
      drFeeMutualizer = setup.drFeeMutualizer;
    });

    it("should handle multiple agreements for same seller with different dispute resolvers", async function () {
      const disputeResolverId1 = 1;
      const disputeResolverId2 = 2;
      await drFeeMutualizer
        .connect(owner)
        .newAgreement(
          sellerId,
          ZeroAddress,
          disputeResolverId1,
          TWO_ETHER,
          TWENTY_ETHER,
          THIRTY_DAYS,
          ZERO_POINT_ONE_ETHER,
          true
        );
      await drFeeMutualizer
        .connect(owner)
        .newAgreement(
          sellerId,
          ZeroAddress,
          disputeResolverId2,
          TWO_ETHER,
          TWENTY_ETHER,
          THIRTY_DAYS,
          ZERO_POINT_ONE_ETHER,
          true
        );
      const agreementId1 = await drFeeMutualizer.getAgreementId(sellerId, ZeroAddress, disputeResolverId1);
      const agreementId2 = await drFeeMutualizer.getAgreementId(sellerId, ZeroAddress, disputeResolverId2);
      expect(agreementId1).to.equal(1);
      expect(agreementId2).to.equal(2);
    });

    it("should allow creating specific agreement when universal agreement exists", async function () {
      const universalDisputeResolverId = 0;
      const specificDisputeResolverId = 1;
      await drFeeMutualizer
        .connect(owner)
        .newAgreement(
          sellerId,
          ZeroAddress,
          universalDisputeResolverId,
          TWO_ETHER,
          TWENTY_ETHER,
          THIRTY_DAYS,
          ZERO_POINT_ONE_ETHER,
          true
        );
      await drFeeMutualizer.connect(seller).payPremium(1, sellerId, { value: ZERO_POINT_ONE_ETHER });

      await expect(
        drFeeMutualizer
          .connect(owner)
          .newAgreement(
            sellerId,
            ZeroAddress,
            specificDisputeResolverId,
            TWO_ETHER,
            TWENTY_ETHER,
            THIRTY_DAYS,
            ZERO_POINT_ONE_ETHER,
            true
          )
      )
        .to.emit(drFeeMutualizer, "AgreementCreated")
        .withArgs(2, sellerId, ZeroAddress, specificDisputeResolverId);
    });

    it("should allow creating universal agreement when specific agreements exist", async function () {
      const specificDisputeResolverId = 1;
      const universalDisputeResolverId = 0;
      await drFeeMutualizer
        .connect(owner)
        .newAgreement(
          sellerId,
          ZeroAddress,
          specificDisputeResolverId,
          TWO_ETHER,
          TWENTY_ETHER,
          THIRTY_DAYS,
          ZERO_POINT_ONE_ETHER,
          true
        );
      await drFeeMutualizer.connect(seller).payPremium(1, sellerId, { value: ZERO_POINT_ONE_ETHER });

      await expect(
        drFeeMutualizer
          .connect(owner)
          .newAgreement(
            sellerId,
            ZeroAddress,
            universalDisputeResolverId,
            TWO_ETHER,
            TWENTY_ETHER,
            THIRTY_DAYS,
            ZERO_POINT_ONE_ETHER,
            true
          )
      )
        .to.emit(drFeeMutualizer, "AgreementCreated")
        .withArgs(2, sellerId, ZeroAddress, universalDisputeResolverId);
    });

    it("should prevent creating duplicate agreement for same dispute resolver", async function () {
      const disputeResolverId = 1;
      await drFeeMutualizer
        .connect(owner)
        .newAgreement(
          sellerId,
          ZeroAddress,
          disputeResolverId,
          TWO_ETHER,
          TWENTY_ETHER,
          THIRTY_DAYS,
          ZERO_POINT_ONE_ETHER,
          true
        );
      await drFeeMutualizer.connect(seller).payPremium(1, sellerId, { value: ZERO_POINT_ONE_ETHER });

      await expect(
        drFeeMutualizer
          .connect(owner)
          .newAgreement(
            sellerId,
            ZeroAddress,
            disputeResolverId,
            TWO_ETHER,
            TWENTY_ETHER,
            THIRTY_DAYS,
            ZERO_POINT_ONE_ETHER,
            true
          )
      ).to.be.revertedWithCustomError(drFeeMutualizer, RevertReasons.AGREEMENT_ALREADY_EXISTS);
    });

    it("should allow creating agreement when previous one is expired", async function () {
      const disputeResolverId = 1;
      await drFeeMutualizer
        .connect(owner)
        .newAgreement(
          sellerId,
          ZeroAddress,
          disputeResolverId,
          TWO_ETHER,
          TWENTY_ETHER,
          ONE_DAY,
          ZERO_POINT_ONE_ETHER,
          true
        );
      await drFeeMutualizer.connect(seller).payPremium(1, sellerId, { value: ZERO_POINT_ONE_ETHER });

      const currentBlock = await ethers.provider.getBlock("latest");
      const futureTimestamp = currentBlock.timestamp + TWO_DAYS;
      await setNextBlockTimestamp(futureTimestamp, true);

      await expect(
        drFeeMutualizer
          .connect(owner)
          .newAgreement(
            sellerId,
            ZeroAddress,
            disputeResolverId,
            TWO_ETHER,
            TWENTY_ETHER,
            THIRTY_DAYS,
            ZERO_POINT_ONE_ETHER,
            true
          )
      )
        .to.emit(drFeeMutualizer, "AgreementCreated")
        .withArgs(2, sellerId, ZeroAddress, disputeResolverId);
    });

    it("should handle voiding agreement with refundOnCancel false", async function () {
      const disputeResolverId = 3;
      const tx = await drFeeMutualizer
        .connect(owner)
        .newAgreement(
          sellerId,
          ZeroAddress,
          disputeResolverId,
          TWO_ETHER,
          TWENTY_ETHER,
          THIRTY_DAYS,
          ZERO_POINT_ONE_ETHER,
          false
        );
      const receipt = await tx.wait();
      const agreementId = receipt.logs[0].args[0];

      await drFeeMutualizer.connect(seller).payPremium(agreementId, sellerId, { value: ZERO_POINT_ONE_ETHER });

      await expect(drFeeMutualizer.connect(seller).voidAgreement(agreementId))
        .to.emit(drFeeMutualizer, "AgreementVoided")
        .withArgs(agreementId, false, ZERO_AMOUNT);

      const agreement = await drFeeMutualizer.getAgreement(agreementId);
      expect(agreement.isVoided).to.equal(true);
    });

    it("should handle voiding inactive agreement", async function () {
      const disputeResolverId = 4;
      const tx = await drFeeMutualizer
        .connect(owner)
        .newAgreement(
          sellerId,
          ZeroAddress,
          disputeResolverId,
          TWO_ETHER,
          TWENTY_ETHER,
          THIRTY_DAYS,
          ZERO_POINT_ONE_ETHER,
          false
        );
      const receipt = await tx.wait();
      const agreementId = receipt.logs[0].args[0];

      await expect(drFeeMutualizer.connect(seller).voidAgreement(agreementId))
        .to.emit(drFeeMutualizer, "AgreementVoided")
        .withArgs(agreementId, false, ZERO_AMOUNT);

      const agreement = await drFeeMutualizer.getAgreement(agreementId);
      expect(agreement.isVoided).to.equal(true);
    });

    it("should handle time-based refund calculation correctly", async function () {
      const disputeResolverId = 5;
      const tx = await drFeeMutualizer
        .connect(owner)
        .newAgreement(sellerId, ZeroAddress, disputeResolverId, TWO_ETHER, TWENTY_ETHER, TWELVE_DAYS, ONE_ETHER, true);
      const receipt = await tx.wait();
      const agreementId = receipt.logs[0].args[0];

      const protocolBalanceBefore = await ethers.provider.getBalance(await mockProtocol.getAddress());
      await drFeeMutualizer.connect(seller).payPremium(agreementId, sellerId, { value: ONE_ETHER });

      const agreement = await drFeeMutualizer.getAgreement(agreementId);
      const agreementStartTime = agreement.startTime;

      const futureTimestamp = agreementStartTime + BigInt(NINE_DAYS);
      await setNextBlockTimestamp(Number(futureTimestamp));
      // After 9 days out of 12 days, seller should get 3/12 = 25% of premium back
      const expectedRefund = (ONE_ETHER * 3n) / 12n;

      await expect(drFeeMutualizer.connect(seller).voidAgreement(agreementId))
        .to.emit(drFeeMutualizer, "AgreementVoided")
        .withArgs(agreementId, true, expectedRefund);

      const protocolBalanceAfter = await ethers.provider.getBalance(await mockProtocol.getAddress());
      expect(protocolBalanceAfter - protocolBalanceBefore).to.equal(expectedRefund);
    });

    it("should handle ERC20 time-based refund calculation correctly", async function () {
      const disputeResolverId = 7;
      const tx = await drFeeMutualizer
        .connect(owner)
        .newAgreement(
          sellerId,
          await mockToken.getAddress(),
          disputeResolverId,
          TWO_ETHER,
          TWENTY_ETHER,
          TWELVE_DAYS,
          HUNDRED_ETHER,
          true
        );
      const receipt = await tx.wait();
      const agreementId = receipt.logs[0].args[0];

      const protocolBalanceBefore = await mockToken.balanceOf(await mockProtocol.getAddress());
      await mockToken.connect(seller).approve(await drFeeMutualizer.getAddress(), HUNDRED_ETHER);
      await drFeeMutualizer.connect(seller).payPremium(agreementId, sellerId);

      const agreement = await drFeeMutualizer.getAgreement(agreementId);
      const agreementStartTime = agreement.startTime;

      const futureTimestamp = agreementStartTime + BigInt(NINE_DAYS);
      await setNextBlockTimestamp(Number(futureTimestamp));

      // After 9 days out of 12 days, seller should get 3/12 = 25% of premium back
      const expectedRefund = (HUNDRED_ETHER * 3n) / 12n;

      await expect(drFeeMutualizer.connect(seller).voidAgreement(agreementId))
        .to.emit(drFeeMutualizer, "AgreementVoided")
        .withArgs(agreementId, true, expectedRefund);

      const protocolBalanceAfter = await mockToken.balanceOf(await mockProtocol.getAddress());

      expect(protocolBalanceAfter - protocolBalanceBefore).to.equal(expectedRefund);
    });

    it("should handle maxAmountTotal limit correctly", async function () {
      const disputeResolverId = 6;
      const tx = await drFeeMutualizer
        .connect(owner)
        .newAgreement(
          sellerId,
          ZeroAddress,
          disputeResolverId,
          ONE_ETHER,
          TWO_ETHER,
          THIRTY_DAYS,
          ZERO_POINT_ONE_ETHER,
          true
        );
      const receipt = await tx.wait();
      const agreementId = receipt.logs[0].args[0];

      await drFeeMutualizer.connect(seller).payPremium(agreementId, sellerId, { value: ZERO_POINT_ONE_ETHER });
      await drFeeMutualizer.connect(owner).deposit(ZeroAddress, FIVE_ETHER, { value: FIVE_ETHER });

      await mockProtocol.callRequestDRFee(
        await drFeeMutualizer.getAddress(),
        ZERO_POINT_FIVE_ETHER,
        sellerId,
        ZeroAddress,
        EXCHANGE_ID_3,
        disputeResolverId
      );

      const agreement1 = await drFeeMutualizer.getAgreement(agreementId);
      expect(agreement1.totalMutualized).to.equal(ZERO_POINT_FIVE_ETHER);

      await mockProtocol.callRequestDRFee(
        await drFeeMutualizer.getAddress(),
        ZERO_POINT_FIVE_ETHER,
        sellerId,
        ZeroAddress,
        EXCHANGE_ID_3,
        disputeResolverId
      );

      const agreement2 = await drFeeMutualizer.getAgreement(agreementId);
      expect(agreement2.totalMutualized).to.equal(ONE_ETHER);

      let isCovered = await drFeeMutualizer.isSellerCovered(sellerId, ONE_ETHER, ZeroAddress, disputeResolverId);
      expect(isCovered).to.be.true;

      isCovered = await drFeeMutualizer.isSellerCovered(
        sellerId,
        ONE_ETHER + BigInt(1),
        ZeroAddress,
        disputeResolverId
      );
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

  context("📋 Meta-Transactions", async function () {
    let mockForwarder;
    let forwarderAddress;
    let drFeeMutualizerWithForwarder;
    let seller;
    let mockProtocol;

    // Common constants for meta-transaction tests
    const sellerId = 1;
    const disputeResolverId = 1;
    const agreementId = 1;
    const forwarderVersion = "0.0.1";

    beforeEach(async function () {
      [seller] = await getSigners();

      const MockProtocolFactory = await getContractFactory("MockBosonProtocolForMutualizer");
      mockProtocol = await MockProtocolFactory.deploy();
      await mockProtocol.waitForDeployment();
      await mockProtocol.setSeller(sellerId, await seller.getAddress());

      const MockForwarderFactory = await getContractFactory("MockForwarder");
      mockForwarder = await MockForwarderFactory.deploy();
      await mockForwarder.waitForDeployment();
      forwarderAddress = await mockForwarder.getAddress();

      const DRFeeMutualizerFactory = await getContractFactory("DRFeeMutualizer");
      drFeeMutualizerWithForwarder = await DRFeeMutualizerFactory.deploy(
        await mockProtocol.getAddress(),
        forwarderAddress,
        await weth.getAddress()
      );
      await drFeeMutualizerWithForwarder.waitForDeployment();
    });

    it("should verify forwarder setup", async function () {
      expect(await mockForwarder.getNonce(await seller.getAddress())).to.equal(0);
      const isTrustedForwarder = await drFeeMutualizerWithForwarder.isTrustedForwarder(forwarderAddress);
      expect(isTrustedForwarder).to.be.true;
    });

    it("should allow direct calls", async function () {
      const amount = ONE_ETHER;
      await expect(drFeeMutualizerWithForwarder.connect(seller).deposit(ZeroAddress, amount, { value: amount }))
        .to.emit(drFeeMutualizerWithForwarder, "FundsDeposited")
        .withArgs(await seller.getAddress(), ZeroAddress, amount);
    });

    it("should handle meta-transaction deposit", async function () {
      const amount = ONE_ETHER;
      const balanceBefore = await drFeeMutualizerWithForwarder.getPoolBalance(ZeroAddress);
      const forwardRequest = {
        from: await seller.getAddress(),
        to: await drFeeMutualizerWithForwarder.getAddress(),
        nonce: await mockForwarder.getNonce(await seller.getAddress()),
        data: drFeeMutualizerWithForwarder.interface.encodeFunctionData("deposit", [ZeroAddress, amount]),
      };
      const signature = await seller.signTypedData(
        {
          name: "MockForwarder",
          version: forwarderVersion,
          chainId: await ethers.provider.getNetwork().then((n) => n.chainId),
          verifyingContract: forwarderAddress,
        },
        {
          ForwardRequest: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "nonce", type: "uint256" },
            { name: "data", type: "bytes" },
          ],
        },
        forwardRequest
      );

      await expect(mockForwarder.execute(forwardRequest, signature, { value: amount }))
        .to.emit(drFeeMutualizerWithForwarder, "FundsDeposited")
        .withArgs(await seller.getAddress(), ZeroAddress, amount);
      const balanceAfter = await drFeeMutualizerWithForwarder.getPoolBalance(ZeroAddress);
      expect(balanceAfter - balanceBefore).to.equal(amount);
    });

    it("should handle meta-transaction payPremium (native)", async function () {
      const [owner] = await getSigners();
      await drFeeMutualizerWithForwarder
        .connect(owner)
        .newAgreement(
          sellerId,
          ZeroAddress,
          disputeResolverId,
          TWO_ETHER,
          TWENTY_ETHER,
          THIRTY_DAYS,
          ZERO_POINT_ONE_ETHER,
          true
        );

      const premium = ZERO_POINT_ONE_ETHER;
      const forwardRequest = {
        from: await seller.getAddress(),
        to: await drFeeMutualizerWithForwarder.getAddress(),
        nonce: await mockForwarder.getNonce(await seller.getAddress()),
        data: drFeeMutualizerWithForwarder.interface.encodeFunctionData("payPremium", [agreementId, sellerId]),
      };
      const signature = await seller.signTypedData(
        {
          name: "MockForwarder",
          version: forwarderVersion,
          chainId: await ethers.provider.getNetwork().then((n) => n.chainId),
          verifyingContract: forwarderAddress,
        },
        {
          ForwardRequest: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "nonce", type: "uint256" },
            { name: "data", type: "bytes" },
          ],
        },
        forwardRequest
      );

      await expect(mockForwarder.execute(forwardRequest, signature, { value: premium }))
        .to.emit(drFeeMutualizerWithForwarder, "AgreementActivated")
        .withArgs(agreementId, sellerId);

      const agreement = await drFeeMutualizerWithForwarder.getAgreement(agreementId);
      expect(agreement.startTime).to.be.greaterThan(0);
    });

    it("should handle meta-transaction payPremium (ERC20)", async function () {
      const [owner] = await getSigners();
      await drFeeMutualizerWithForwarder
        .connect(owner)
        .newAgreement(
          sellerId,
          await mockToken.getAddress(),
          disputeResolverId,
          TWO_ETHER,
          TWENTY_ETHER,
          THIRTY_DAYS,
          HUNDRED_ETHER,
          true
        );

      await mockToken.connect(seller).approve(await drFeeMutualizerWithForwarder.getAddress(), HUNDRED_ETHER);

      const forwardRequest = {
        from: await seller.getAddress(),
        to: await drFeeMutualizerWithForwarder.getAddress(),
        nonce: await mockForwarder.getNonce(await seller.getAddress()),
        data: drFeeMutualizerWithForwarder.interface.encodeFunctionData("payPremium", [agreementId, sellerId]),
      };
      const signature = await seller.signTypedData(
        {
          name: "MockForwarder",
          version: forwarderVersion,
          chainId: await ethers.provider.getNetwork().then((n) => n.chainId),
          verifyingContract: forwarderAddress,
        },
        {
          ForwardRequest: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "nonce", type: "uint256" },
            { name: "data", type: "bytes" },
          ],
        },
        forwardRequest
      );

      await expect(mockForwarder.execute(forwardRequest, signature))
        .to.emit(drFeeMutualizerWithForwarder, "AgreementActivated")
        .withArgs(agreementId, sellerId);

      const agreement = await drFeeMutualizerWithForwarder.getAgreement(agreementId);
      expect(agreement.startTime).to.be.greaterThan(0);
    });

    it("should handle meta-transaction voidAgreement", async function () {
      const [owner] = await getSigners();
      const tx = await drFeeMutualizerWithForwarder
        .connect(owner)
        .newAgreement(
          sellerId,
          ZeroAddress,
          disputeResolverId,
          TWO_ETHER,
          TWENTY_ETHER,
          TWELVE_DAYS,
          ZERO_POINT_THREE_ETHER,
          true
        );
      const receipt = await tx.wait();
      const agreementId = receipt.logs[0].args[0];
      await drFeeMutualizerWithForwarder
        .connect(seller)
        .payPremium(agreementId, sellerId, { value: ZERO_POINT_THREE_ETHER });
      const agreementStartTime = (await drFeeMutualizerWithForwarder.getAgreement(agreementId)).startTime;
      const futureTimestamp = agreementStartTime + BigInt(FOUR_DAYS);
      await setNextBlockTimestamp(Number(futureTimestamp));

      const forwardRequest = {
        from: await seller.getAddress(),
        to: await drFeeMutualizerWithForwarder.getAddress(),
        nonce: await mockForwarder.getNonce(await seller.getAddress()),
        data: drFeeMutualizerWithForwarder.interface.encodeFunctionData("voidAgreement", [agreementId]),
      };
      const signature = await seller.signTypedData(
        {
          name: "MockForwarder",
          version: forwarderVersion,
          chainId: await ethers.provider.getNetwork().then((n) => n.chainId),
          verifyingContract: forwarderAddress,
        },
        {
          ForwardRequest: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "nonce", type: "uint256" },
            { name: "data", type: "bytes" },
          ],
        },
        forwardRequest
      );

      await expect(mockForwarder.execute(forwardRequest, signature))
        .to.emit(drFeeMutualizerWithForwarder, "AgreementVoided")
        .withArgs(agreementId, true, ZERO_POINT_TWO_ETHER);

      const agreement = await drFeeMutualizerWithForwarder.getAgreement(agreementId);
      expect(agreement.isVoided).to.be.true;
    });

    it("should revert with invalid signature", async function () {
      const amount = ONE_ETHER;
      const forwardRequest = {
        from: await seller.getAddress(),
        to: await drFeeMutualizerWithForwarder.getAddress(),
        nonce: await mockForwarder.getNonce(await seller.getAddress()),
        data: drFeeMutualizerWithForwarder.interface.encodeFunctionData("deposit", [ZeroAddress, amount]),
      };
      // Use wrong signer (buyer instead of seller)
      const [, , , buyer] = await getSigners();
      const signature = await buyer.signTypedData(
        {
          name: "MockForwarder",
          version: forwarderVersion,
          chainId: await ethers.provider.getNetwork().then((n) => n.chainId),
          verifyingContract: forwarderAddress,
        },
        {
          ForwardRequest: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "nonce", type: "uint256" },
            { name: "data", type: "bytes" },
          ],
        },
        forwardRequest
      );
      await expect(mockForwarder.execute(forwardRequest, signature, { value: amount })).to.be.revertedWith(
        "MockForwarder: signature does not match request"
      );
    });

    it("Test context in DRFeeMutualizer", async function () {
      const MockDRFeeMutualizer = await getContractFactory("MockDRFeeMutualizer");
      const mockDRFeeMutualizer = await MockDRFeeMutualizer.deploy(
        await mockProtocol.getAddress(),
        forwarderAddress,
        await weth.getAddress()
      );

      const data = mockDRFeeMutualizer.interface.encodeFunctionData("testMsgData", ["0xdeadbeef"]);
      const tx = await mockDRFeeMutualizer.testMsgData("0xdeadbeef");

      // Verify the event
      await expect(tx)
        .to.emit(mockDRFeeMutualizer, "IncomingData")
        .withArgs(await owner.getAddress(), data, 20);

      // Verify the state
      expect(await mockDRFeeMutualizer.data()).to.equal(data);
      expect(await mockDRFeeMutualizer.sender()).to.equal(await owner.getAddress());
    });
  });

  context("📋 isSellerCovered()", async function () {
    it("should return true when seller is covered", async function () {
      const sellerId = 1;
      const disputeResolverId = 1;
      const { drFeeMutualizer } = await setupMockProtocolAndMutualizer(
        sellerId,
        await seller.getAddress(),
        await weth.getAddress()
      );

      // Create and activate agreement
      await drFeeMutualizer
        .connect(owner)
        .newAgreement(
          sellerId,
          ZeroAddress,
          disputeResolverId,
          ONE_ETHER,
          TEN_ETHER,
          THIRTY_DAYS,
          ZERO_POINT_ONE_ETHER,
          true
        );
      await drFeeMutualizer.connect(seller).payPremium(1, sellerId, { value: ZERO_POINT_ONE_ETHER });
      await drFeeMutualizer.connect(owner).deposit(ZeroAddress, FIVE_ETHER, { value: FIVE_ETHER });

      const isCovered = await drFeeMutualizer.isSellerCovered(
        sellerId,
        ZERO_POINT_FIVE_ETHER,
        ZeroAddress,
        disputeResolverId
      );

      expect(isCovered).to.be.true;
    });

    it("should return false when agreement token address doesn't match", async function () {
      const sellerId = 1;
      const disputeResolverId = 1;
      const { drFeeMutualizer } = await setupMockProtocolAndMutualizer(
        sellerId,
        await seller.getAddress(),
        await weth.getAddress()
      );

      // Create agreement for native currency
      await drFeeMutualizer.connect(owner).newAgreement(
        sellerId,
        ZeroAddress, // Native currency
        disputeResolverId,
        ONE_ETHER,
        TEN_ETHER,
        THIRTY_DAYS,
        ZERO_POINT_ONE_ETHER,
        true
      );
      await drFeeMutualizer.connect(seller).payPremium(1, sellerId, { value: ZERO_POINT_ONE_ETHER });
      await drFeeMutualizer.connect(owner).deposit(ZeroAddress, FIVE_ETHER, { value: FIVE_ETHER });

      // Try to check coverage for ERC20 token (different from agreement)
      const isCovered = await drFeeMutualizer.isSellerCovered(
        sellerId,
        ZERO_POINT_FIVE_ETHER,
        await mockToken.getAddress(), // Different token than agreement
        disputeResolverId
      );

      expect(isCovered).to.be.false;
    });

    it("should return false when fee amount would exceed max total", async function () {
      const sellerId = 1;
      const disputeResolverId = 1;
      const { mockProtocol, drFeeMutualizer } = await setupMockProtocolAndMutualizer(
        sellerId,
        await seller.getAddress(),
        await weth.getAddress()
      );

      // Create agreement with maxAmountPerTx > maxAmountTotal to test total limit
      const maxTotal = ONE_ETHER;
      await drFeeMutualizer.connect(owner).newAgreement(
        sellerId,
        ZeroAddress,
        disputeResolverId,
        ONE_ETHER, // maxAmountPerTx - higher than what we'll test
        maxTotal, // maxAmountTotal - low limit
        THIRTY_DAYS,
        ZERO_POINT_ONE_ETHER,
        true
      );
      await drFeeMutualizer.connect(seller).payPremium(1, sellerId, { value: ZERO_POINT_ONE_ETHER });
      await drFeeMutualizer.connect(owner).deposit(ZeroAddress, FIVE_ETHER, { value: FIVE_ETHER });

      await mockProtocol.callRequestDRFee(
        await drFeeMutualizer.getAddress(),
        ZERO_POINT_FIVE_ETHER,
        sellerId,
        ZeroAddress,
        EXCHANGE_ID_1,
        disputeResolverId
      );

      const agreement = await drFeeMutualizer.getAgreement(1);
      expect(agreement.totalMutualized).to.equal(ZERO_POINT_FIVE_ETHER);

      const isCovered = await drFeeMutualizer.isSellerCovered(
        sellerId,
        ZERO_POINT_FIVE_ETHER + 1n, // This exceeds maxAmountTotal when added to totalMutualized
        ZeroAddress,
        disputeResolverId
      );

      expect(isCovered).to.be.false;
    });
  });

  context("📋 payPremium()", async function () {
    context("💔 Revert Reasons", async function () {
      it("should revert when sellerId does not match agreement", async function () {
        const sellerId = 1;
        const wrongSellerId = 2;
        const disputeResolverId = 1;
        const { drFeeMutualizer } = await setupMockProtocolAndMutualizer(
          sellerId,
          await seller.getAddress(),
          await weth.getAddress()
        );

        // Create agreement for sellerId = 1
        await drFeeMutualizer
          .connect(owner)
          .newAgreement(
            sellerId,
            ZeroAddress,
            disputeResolverId,
            ONE_ETHER,
            TEN_ETHER,
            THIRTY_DAYS,
            ZERO_POINT_ONE_ETHER,
            true
          );

        // Try to pay premium with wrong sellerId
        await expect(
          drFeeMutualizer.connect(seller).payPremium(1, wrongSellerId, { value: ZERO_POINT_ONE_ETHER })
        ).to.be.revertedWithCustomError(drFeeMutualizer, "InvalidSellerId");
      });

      it("should revert when time period would cause overflow", async function () {
        const sellerId = 1;
        const disputeResolverId = 1;
        const { drFeeMutualizer } = await setupMockProtocolAndMutualizer(
          sellerId,
          await seller.getAddress(),
          await weth.getAddress()
        );

        // Create agreement with maximum time period that would cause overflow
        const maxTimePeriod = ethers.MaxUint256;
        await drFeeMutualizer
          .connect(owner)
          .newAgreement(
            sellerId,
            ZeroAddress,
            disputeResolverId,
            ONE_ETHER,
            TEN_ETHER,
            maxTimePeriod,
            ZERO_POINT_ONE_ETHER,
            true
          );

        // Try to pay premium which would cause overflow in time calculation
        await expect(
          drFeeMutualizer.connect(seller).payPremium(1, sellerId, { value: ZERO_POINT_ONE_ETHER })
        ).to.be.revertedWithCustomError(drFeeMutualizer, "AgreementTimePeriodTooLong");
      });
    });
  });
});
