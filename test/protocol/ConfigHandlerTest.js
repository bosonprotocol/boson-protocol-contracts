const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");

const Role = require("../../scripts/domain/Role");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { oneWeek, oneMonth } = require("../utils/constants");
/**
 *  Test the Boson Config Handler interface
 */
describe("IBosonConfigHandler", function () {
  // Common vars
  let InterfaceIds, support;
  let accounts, deployer, rando, token, treasury, voucher;
  let maxOffersPerGroup,
    maxTwinsPerBundle,
    maxOffersPerBundle,
    maxOffersPerBatch,
    maxTokensPerWithdrawal,
    maxFeesPerDisputeResolver,
    maxEscalationResponsePeriod,
    maxDisputesPerBatch;
  let protocolFeePercentage, protocolFeeFlatBoson;
  let erc165, protocolDiamond, accessController, configHandler, gasLimit;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();
  });

  beforeEach(async function () {
    // Make accounts available
    accounts = await ethers.getSigners();
    deployer = accounts[0];
    rando = accounts[1];
    token = accounts[2];
    treasury = accounts[3];
    voucher = accounts[4];

    // Deploy the Protocol Diamond
    [protocolDiamond, , , accessController] = await deployProtocolDiamond();

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Set protocol config
    protocolFeePercentage = 12;
    protocolFeeFlatBoson = ethers.utils.parseUnits("0.01", "ether").toString();
    maxOffersPerGroup = 100;
    maxTwinsPerBundle = 100;
    maxOffersPerBundle = 100;
    maxOffersPerBatch = 100;
    maxTokensPerWithdrawal = 100;
    maxFeesPerDisputeResolver = 100;
    maxEscalationResponsePeriod = oneMonth;
    maxDisputesPerBatch = 100;

    // Cast Diamond to IERC165
    erc165 = await ethers.getContractAt("IERC165", protocolDiamond.address);

    // Cast Diamond to IBosonConfigHandler
    configHandler = await ethers.getContractAt("IBosonConfigHandler", protocolDiamond.address);
  });

  describe("Deploy tests", async function () {
    context("📋 Initializer", async function () {
      it("should initialize the config handler and emit set events", async function () {
        const protocolConfig = [
          // Protocol addresses
          {
            tokenAddress: token.address,
            treasuryAddress: treasury.address,
            voucherAddress: voucher.address,
          },
          // Protocol limits
          {
            maxOffersPerGroup,
            maxTwinsPerBundle,
            maxOffersPerBundle,
            maxOffersPerBatch,
            maxTokensPerWithdrawal,
            maxFeesPerDisputeResolver,
            maxEscalationResponsePeriod,
            maxDisputesPerBatch,
          },
          //Protocol fees
          {
            percentage: protocolFeePercentage,
            flatBoson: protocolFeeFlatBoson,
          },
        ];

        const { cutTransaction } = await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);

        await expect(cutTransaction)
          .to.emit(configHandler, "TokenAddressChanged")
          .withArgs(token.address, deployer.address)
          .to.emit(configHandler, "TreasuryAddressChanged")
          .withArgs(treasury.address, deployer.address)
          .to.emit(configHandler, "VoucherAddressChanged")
          .withArgs(voucher.address, deployer.address)
          .to.emit(configHandler, "ProtocolFeePercentageChanged")
          .withArgs(protocolFeePercentage, deployer.address)
          .to.emit(configHandler, "ProtocolFeeFlatBosonChanged")
          .withArgs(protocolFeeFlatBoson, deployer.address)
          .to.emit(configHandler, "MaxOffersPerGroupChanged")
          .withArgs(maxOffersPerGroup, deployer.address)
          .to.emit(configHandler, "MaxTwinsPerBundleChanged")
          .withArgs(maxTwinsPerBundle, deployer.address)
          .to.emit(configHandler, "MaxOffersPerBundleChanged")
          .withArgs(maxOffersPerBundle, deployer.address)
          .to.emit(configHandler, "MaxOffersPerBatchChanged")
          .withArgs(maxOffersPerBatch, deployer.address)
          .to.emit(configHandler, "MaxTokensPerWithdrawalChanged")
          .withArgs(maxTokensPerWithdrawal, deployer.address)
          .to.emit(configHandler, "MaxFeesPerDisputeResolverChanged")
          .withArgs(maxFeesPerDisputeResolver, deployer.address)
          .to.emit(configHandler, "MaxEscalationResponsePeriodChanged")
          .withArgs(maxEscalationResponsePeriod, deployer.address)
          .to.emit(configHandler, "MaxDisputesPerBatchChanged")
          .withArgs(maxDisputesPerBatch, deployer.address);
      });
    });
  });

  describe("After deploy tests", async function () {
    beforeEach(async function () {
      // Add config Handler, so twin id starts at 1
      const protocolConfig = [
        // Protocol addresses
        {
          treasuryAddress: treasury.address,
          tokenAddress: token.address,
          voucherAddress: voucher.address,
        },
        // Protocol limits
        {
          maxOffersPerGroup,
          maxTwinsPerBundle,
          maxOffersPerBundle,
          maxOffersPerBatch,
          maxTokensPerWithdrawal,
          maxFeesPerDisputeResolver,
          maxEscalationResponsePeriod,
          maxDisputesPerBatch,
        },
        // Protocol fees
        {
          percentage: protocolFeePercentage,
          flatBoson: protocolFeeFlatBoson,
        },
      ];
      await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);
    });

    // Interface support (ERC-156 provided by ProtocolDiamond, others by deployed facets)
    context("📋 Interfaces", async function () {
      context("👉 supportsInterface()", async function () {
        it("should indicate support for IBosonConfigHandler interface", async function () {
          // Current interfaceId for IBosonConfigHandler
          support = await erc165.supportsInterface(InterfaceIds.IBosonConfigHandler);

          // Test
          await expect(support, "IBosonConfigHandler interface not supported").is.true;
        });
      });
    });

    // All supported methods
    context("📋 Setters", async function () {
      context("👉 setMaxOffersPerGroup()", async function () {
        beforeEach(async function () {
          // set new value for max offers per group
          maxOffersPerGroup = 150;
        });

        it("should emit a MaxOffersPerGroupChanged event", async function () {
          // Set new max offer per group, testing for the event
          await expect(configHandler.connect(deployer).setMaxOffersPerGroup(maxOffersPerGroup))
            .to.emit(configHandler, "MaxOffersPerGroupChanged")
            .withArgs(maxOffersPerGroup, deployer.address);
        });

        it("should update state", async function () {
          // Set new max offer per group,
          await configHandler.connect(deployer).setMaxOffersPerGroup(maxOffersPerGroup);

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getMaxOffersPerGroup()).to.equal(maxOffersPerGroup);
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new max offer per group, expecting revert
            await expect(configHandler.connect(rando).setMaxOffersPerGroup(maxOffersPerGroup)).to.revertedWith(
              RevertReasons.ACCESS_DENIED
            );
          });
        });
      });

      context("👉 setMaxTwinsPerBundle()", async function () {
        beforeEach(async function () {
          // set new value for max twins per bundle
          maxTwinsPerBundle = 150;
        });

        it("should emit a MaxTwinsPerBundleChanged event", async function () {
          // Set new max twin per bundle, testing for the event
          await expect(configHandler.connect(deployer).setMaxTwinsPerBundle(maxTwinsPerBundle))
            .to.emit(configHandler, "MaxTwinsPerBundleChanged")
            .withArgs(maxTwinsPerBundle, deployer.address);
        });

        it("should update state", async function () {
          // Set new max twin per bundle,
          await configHandler.connect(deployer).setMaxTwinsPerBundle(maxTwinsPerBundle);

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getMaxTwinsPerBundle()).to.equal(maxTwinsPerBundle);
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new max twin per bundle, expecting revert
            await expect(configHandler.connect(rando).setMaxTwinsPerBundle(maxTwinsPerBundle)).to.revertedWith(
              RevertReasons.ACCESS_DENIED
            );
          });
        });
      });

      context("👉 setMaxOffersPerBundle()", async function () {
        beforeEach(async function () {
          // set new value for max offers per bundle
          maxOffersPerBundle = 150;
        });

        it("should emit a MaxOffersPerBundleChanged event", async function () {
          // Set new max offer per bundle, testing for the event
          await expect(configHandler.connect(deployer).setMaxOffersPerBundle(maxOffersPerBundle))
            .to.emit(configHandler, "MaxOffersPerBundleChanged")
            .withArgs(maxOffersPerBundle, deployer.address);
        });

        it("should update state", async function () {
          // Set new max offer per bundle,
          await configHandler.connect(deployer).setMaxOffersPerBundle(maxOffersPerBundle);

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getMaxOffersPerBundle()).to.equal(maxOffersPerBundle);
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new max offer per bundle, expecting revert
            await expect(configHandler.connect(rando).setMaxOffersPerBundle(maxOffersPerBundle)).to.revertedWith(
              RevertReasons.ACCESS_DENIED
            );
          });
        });
      });

      context("👉 setMaxOffersPerBatch()", async function () {
        beforeEach(async function () {
          // set new value for max offers per batch
          maxOffersPerBatch = 135;
        });

        it("should emit a MaxOffersPerBatchChanged event", async function () {
          // Set new max offer per batch, testing for the event
          await expect(configHandler.connect(deployer).setMaxOffersPerBatch(maxOffersPerBatch))
            .to.emit(configHandler, "MaxOffersPerBatchChanged")
            .withArgs(maxOffersPerBatch, deployer.address);
        });

        it("should update state", async function () {
          // Set new max offer per batch,
          await configHandler.connect(deployer).setMaxOffersPerBatch(maxOffersPerBatch);

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getMaxOffersPerBatch()).to.equal(maxOffersPerBatch);
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new max offer per batch, expecting revert
            await expect(configHandler.connect(rando).setMaxOffersPerBatch(maxOffersPerBatch)).to.revertedWith(
              RevertReasons.ACCESS_DENIED
            );
          });
        });
      });

      context("👉 setMaxTokensPerWithdrawal()", async function () {
        beforeEach(async function () {
          // set new value for max tokens per withdrawal
          maxTokensPerWithdrawal = 598;
        });

        it("should emit a MaxTokensPerWithdrawalChanged event", async function () {
          // Set new max tokens per withdrawal, testing for the event
          await expect(configHandler.connect(deployer).setMaxTokensPerWithdrawal(maxTokensPerWithdrawal))
            .to.emit(configHandler, "MaxTokensPerWithdrawalChanged")
            .withArgs(maxTokensPerWithdrawal, deployer.address);
        });

        it("should update state", async function () {
          // Set new max offer tokens per withdrawal
          await configHandler.connect(deployer).setMaxTokensPerWithdrawal(maxTokensPerWithdrawal);

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getMaxTokensPerWithdrawal()).to.equal(maxTokensPerWithdrawal);
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new tokens per withdrawal, expecting revert
            await expect(
              configHandler.connect(rando).setMaxTokensPerWithdrawal(maxTokensPerWithdrawal)
            ).to.revertedWith(RevertReasons.ACCESS_DENIED);
          });
        });
      });

      context("👉 setTokenAddress()", async function () {
        beforeEach(async function () {
          // set new value for token address
          token = accounts[5];
        });

        it("should emit a TokenAddressChanged event", async function () {
          // Set new token address, testing for the event
          await expect(configHandler.connect(deployer).setTokenAddress(token.address))
            .to.emit(configHandler, "TokenAddressChanged")
            .withArgs(token.address, deployer.address);
        });

        it("should update state", async function () {
          // Set new token address
          await configHandler.connect(deployer).setTokenAddress(token.address);

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getTokenAddress()).to.equal(token.address);
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new token address, expecting revert
            await expect(configHandler.connect(rando).setTokenAddress(token.address)).to.revertedWith(
              RevertReasons.ACCESS_DENIED
            );
          });
        });
      });

      context("👉 setTreasuryAddress()", async function () {
        beforeEach(async function () {
          // set new value for treasury address
          treasury = accounts[5];
        });

        it("should emit a TreasuryAddressChanged event", async function () {
          // Set new treasury address, testing for the event
          await expect(configHandler.connect(deployer).setTreasuryAddress(treasury.address))
            .to.emit(configHandler, "TreasuryAddressChanged")
            .withArgs(treasury.address, deployer.address);
        });

        it("should update state", async function () {
          // Set new treasury address
          await configHandler.connect(deployer).setTreasuryAddress(treasury.address);

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getTreasuryAddress()).to.equal(treasury.address);
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new treasury address, expecting revert
            await expect(configHandler.connect(rando).setTreasuryAddress(treasury.address)).to.revertedWith(
              RevertReasons.ACCESS_DENIED
            );
          });
        });
      });

      context("👉 setVoucherAddress()", async function () {
        beforeEach(async function () {
          // set new value for treasury address
          voucher = accounts[5];
        });

        it("should emit a VoucherAddressChanged event", async function () {
          // Set new treasury address, testing for the event
          await expect(configHandler.connect(deployer).setVoucherAddress(voucher.address))
            .to.emit(configHandler, "VoucherAddressChanged")
            .withArgs(voucher.address, deployer.address);
        });

        it("should update state", async function () {
          // Set new voucher address
          await configHandler.connect(deployer).setVoucherAddress(voucher.address);

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getVoucherAddress()).to.equal(voucher.address);
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new voucher address, expecting revert
            await expect(configHandler.connect(rando).setVoucherAddress(voucher.address)).to.revertedWith(
              RevertReasons.ACCESS_DENIED
            );
          });
        });
      });

      context("👉 setProtocolFeePercentage()", async function () {
        beforeEach(async function () {
          // set new value for treasury address
          protocolFeePercentage = 10000;
        });

        it("should emit a ProtocolFeePercentageChanged event", async function () {
          // Set new treasury address, testing for the event
          await expect(configHandler.connect(deployer).setProtocolFeePercentage(protocolFeePercentage))
            .to.emit(configHandler, "ProtocolFeePercentageChanged")
            .withArgs(protocolFeePercentage, deployer.address);
        });

        it("should update state", async function () {
          // Set new voucher address
          await configHandler.connect(deployer).setProtocolFeePercentage(protocolFeePercentage);

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getProtocolFeePercentage()).to.equal(protocolFeePercentage);
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new voucher address, expecting revert
            await expect(configHandler.connect(rando).setProtocolFeePercentage(protocolFeePercentage)).to.revertedWith(
              RevertReasons.ACCESS_DENIED
            );
          });

          it("protocolFeePercentage must be less than 10000", async function () {
            // Attempt to set new protocolFeePercentage value, expecting revert
            protocolFeePercentage = 10001;
            await expect(
              configHandler.connect(deployer).setProtocolFeePercentage(protocolFeePercentage)
            ).to.revertedWith(RevertReasons.FEE_PERCENTAGE_INVALID);
          });
        });
      });

      context("👉 setProtocolFeeFlatBoson()", async function () {
        beforeEach(async function () {
          // set new value for flat boson protocol fee
          protocolFeeFlatBoson = ethers.utils.parseUnits("0.02", "ether").toString();
        });

        it("should emit a ProtocolFeeFlatBosonChanged event", async function () {
          // Set new flat boson protocol feel, testing for the event
          await expect(configHandler.connect(deployer).setProtocolFeeFlatBoson(protocolFeeFlatBoson))
            .to.emit(configHandler, "ProtocolFeeFlatBosonChanged")
            .withArgs(protocolFeeFlatBoson, deployer.address);
        });

        it("should update state", async function () {
          // Set flat boson protocol fee
          await configHandler.connect(deployer).setProtocolFeeFlatBoson(protocolFeeFlatBoson);

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getProtocolFeePercentage()).to.equal(protocolFeePercentage);
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new voucher address, expecting revert
            await expect(configHandler.connect(rando).setProtocolFeeFlatBoson(protocolFeeFlatBoson)).to.revertedWith(
              RevertReasons.ACCESS_DENIED
            );
          });
        });
      });

      context("👉 setMaxDisputesPerBatch()", async function () {
        beforeEach(async function () {
          // set new value for max disputes per batch
          maxDisputesPerBatch = 135;
        });

        it("should emit a MaxDisputesPerBatchChanged event", async function () {
          // Set new max disputes per batch, testing for the event
          await expect(configHandler.connect(deployer).setMaxDisputesPerBatch(maxDisputesPerBatch))
            .to.emit(configHandler, "MaxDisputesPerBatchChanged")
            .withArgs(maxDisputesPerBatch, deployer.address);
        });

        it("should update state", async function () {
          // Set new max disputes per batch,
          await configHandler.connect(deployer).setMaxDisputesPerBatch(maxDisputesPerBatch);

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getMaxDisputesPerBatch()).to.equal(maxDisputesPerBatch);
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new max disputes per batch, expecting revert
            await expect(configHandler.connect(rando).setMaxDisputesPerBatch(maxDisputesPerBatch)).to.revertedWith(
              RevertReasons.ACCESS_DENIED
            );
          });
        });
      });

      context("👉 setMaxFeesPerDisputeResolver()", async function () {
        beforeEach(async function () {
          // set new value
          maxFeesPerDisputeResolver = 200;
        });

        it("should emit a MaxFeesPerDisputeResolverChanged event", async function () {
          // Set max fees per dispute resolver
          await expect(configHandler.connect(deployer).setMaxFeesPerDisputeResolver(maxFeesPerDisputeResolver))
            .to.emit(configHandler, "MaxFeesPerDisputeResolverChanged")
            .withArgs(maxFeesPerDisputeResolver, deployer.address);
        });

        it("should update state", async function () {
          // Set max fees per dispute resolver
          await configHandler.connect(deployer).setMaxFeesPerDisputeResolver(maxFeesPerDisputeResolver);

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getMaxFeesPerDisputeResolver()).to.equal(maxFeesPerDisputeResolver);
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new value, expecting revert
            await expect(
              configHandler.connect(rando).setMaxFeesPerDisputeResolver(maxFeesPerDisputeResolver)
            ).to.revertedWith(RevertReasons.ACCESS_DENIED);
          });
        });
      });

      context("👉 setMaxEscalationResponsePeriod()", async function () {
        beforeEach(async function () {
          // set new value
          maxEscalationResponsePeriod = ethers.BigNumber.from(oneMonth).add(oneWeek);
        });

        it("should emit a MaxEscalationResponsePeriodChanged event", async function () {
          // Set new escalation response period
          await expect(configHandler.connect(deployer).setMaxEscalationResponsePeriod(maxEscalationResponsePeriod))
            .to.emit(configHandler, "MaxEscalationResponsePeriodChanged")
            .withArgs(maxEscalationResponsePeriod, deployer.address);
        });

        it("should update state", async function () {
          // Set new escalation response period
          await configHandler.connect(deployer).setMaxEscalationResponsePeriod(maxEscalationResponsePeriod);

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getMaxEscalationResponsePeriod()).to.equal(
            maxEscalationResponsePeriod
          );
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new value, expecting revert
            await expect(
              configHandler.connect(rando).setMaxEscalationResponsePeriod(maxEscalationResponsePeriod)
            ).to.revertedWith(RevertReasons.ACCESS_DENIED);
          });
        });
      });
    });

    context("📋 Getters", async function () {
      // here we test only that after the deployments getters show correct values
      // otherwise getters are tested in the "should update state" test of setters

      it("Initial values are correct", async function () {
        // Verify that initial values matches those in constructor
        expect(await configHandler.connect(rando).getTreasuryAddress()).to.equal(
          treasury.address,
          "Invalid treasury address"
        );
        expect(await configHandler.connect(rando).getTokenAddress()).to.equal(token.address, "Invalid token address");
        expect(await configHandler.connect(rando).getVoucherAddress()).to.equal(
          voucher.address,
          "Invalid voucher address"
        );
        expect(await configHandler.connect(rando).getProtocolFeePercentage()).to.equal(
          protocolFeePercentage,
          "Invalid protocol fee percentage"
        );
        expect(await configHandler.connect(rando).getProtocolFeeFlatBoson()).to.equal(
          protocolFeeFlatBoson,
          "Invalid flat boson fee"
        );
        expect(await configHandler.connect(rando).getMaxOffersPerGroup()).to.equal(
          maxOffersPerGroup,
          "Invalid max offers per group"
        );
        expect(await configHandler.connect(rando).getMaxTwinsPerBundle()).to.equal(
          maxTwinsPerBundle,
          "Invalid max twins per bundle"
        );
        expect(await configHandler.connect(rando).getMaxOffersPerBundle()).to.equal(
          maxOffersPerBundle,
          "Invalid max offers per bundle"
        );
        expect(await configHandler.connect(rando).getMaxOffersPerBatch()).to.equal(
          maxOffersPerBatch,
          "Invalid max offers per batch"
        );
        expect(await configHandler.connect(rando).getMaxTokensPerWithdrawal()).to.equal(
          maxTokensPerWithdrawal,
          "Invalid max tokens per withdrawal"
        );
        expect(await configHandler.connect(rando).getMaxFeesPerDisputeResolver()).to.equal(
          maxFeesPerDisputeResolver,
          "Invalid max fees per dispute resolver"
        );
        expect(await configHandler.connect(rando).getMaxEscalationResponsePeriod()).to.equal(
          maxEscalationResponsePeriod,
          "Invalid max escalatio response period"
        );
        expect(await configHandler.connect(rando).getMaxDisputesPerBatch()).to.equal(
          maxDisputesPerBatch,
          "Invalid max disputes per batch"
        );
      });
    });
  });
});
