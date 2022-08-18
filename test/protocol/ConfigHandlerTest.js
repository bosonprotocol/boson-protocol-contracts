const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");

const Role = require("../../scripts/domain/Role");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { oneWeek, oneMonth } = require("../utils/constants");
const AuthTokenType = require("../../scripts/domain/AuthTokenType");

/**
 *  Test the Boson Config Handler interface
 */
describe("IBosonConfigHandler", function () {
  // Common vars
  let InterfaceIds, support;
  let accounts, deployer, rando, token, treasury, beacon, proxy;
  let maxOffersPerGroup,
    maxTwinsPerBundle,
    maxOffersPerBundle,
    maxOffersPerBatch,
    maxExchangesPerBatch,
    maxTokensPerWithdrawal,
    maxFeesPerDisputeResolver,
    maxEscalationResponsePeriod,
    maxDisputesPerBatch,
    maxAllowedSellers,
    buyerEscalationDepositPercentage,
    maxTotalOfferFeePercentage,
    maxRoyaltyPecentage;
  let protocolFeePercentage, protocolFeeFlatBoson;
  let erc165, protocolDiamond, accessController, configHandler, gasLimit;
  let authTokenContract;

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
    beacon = accounts[4];
    proxy = accounts[5];

    // Deploy the Protocol Diamond
    [protocolDiamond, , , , accessController] = await deployProtocolDiamond();

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Set protocol config
    protocolFeePercentage = 12;
    protocolFeeFlatBoson = ethers.utils.parseUnits("0.01", "ether").toString();
    maxExchangesPerBatch = 100;
    maxOffersPerGroup = 100;
    maxTwinsPerBundle = 100;
    maxOffersPerBundle = 100;
    maxOffersPerBatch = 100;
    maxTokensPerWithdrawal = 100;
    maxFeesPerDisputeResolver = 100;
    maxEscalationResponsePeriod = oneMonth;
    maxDisputesPerBatch = 100;
    maxAllowedSellers = 100;
    buyerEscalationDepositPercentage = 100;
    maxTotalOfferFeePercentage = 4000; // 40%
    maxRoyaltyPecentage = 1000; // 10%

    // Cast Diamond to IERC165
    erc165 = await ethers.getContractAt("ERC165Facet", protocolDiamond.address);

    // Cast Diamond to IBosonConfigHandler
    configHandler = await ethers.getContractAt("IBosonConfigHandler", protocolDiamond.address);
  });

  describe("Deploy tests", async function () {
    context("📋 Initializer", async function () {
      it("should initialize the config handler and emit set events", async function () {
        const protocolConfig = [
          // Protocol addresses
          {
            token: token.address,
            treasury: treasury.address,
            voucherBeacon: beacon.address,
            beaconProxy: proxy.address,
          },
          // Protocol limits
          {
            maxExchangesPerBatch,
            maxOffersPerGroup,
            maxTwinsPerBundle,
            maxOffersPerBundle,
            maxOffersPerBatch,
            maxTokensPerWithdrawal,
            maxFeesPerDisputeResolver,
            maxEscalationResponsePeriod,
            maxDisputesPerBatch,
            maxAllowedSellers,
            maxTotalOfferFeePercentage,
            maxRoyaltyPecentage,
          },
          //Protocol fees
          {
            percentage: protocolFeePercentage,
            flatBoson: protocolFeeFlatBoson,
          },
          buyerEscalationDepositPercentage,
        ];

        const { cutTransaction } = await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);

        await expect(cutTransaction)
          .to.emit(configHandler, "TokenAddressChanged")
          .withArgs(token.address, deployer.address);

        await expect(cutTransaction)
          .to.emit(configHandler, "TreasuryAddressChanged")
          .withArgs(treasury.address, deployer.address);

        await expect(cutTransaction)
          .to.emit(configHandler, "VoucherBeaconAddressChanged")
          .withArgs(beacon.address, deployer.address);

        await expect(cutTransaction)
          .to.emit(configHandler, "BeaconProxyAddressChanged")
          .withArgs(proxy.address, deployer.address);

        await expect(cutTransaction)
          .to.emit(configHandler, "ProtocolFeePercentageChanged")
          .withArgs(protocolFeePercentage, deployer.address);

        await expect(cutTransaction)
          .to.emit(configHandler, "ProtocolFeeFlatBosonChanged")
          .withArgs(protocolFeeFlatBoson, deployer.address);

        await expect(cutTransaction)
          .to.emit(configHandler, "MaxExchangesPerBatchChanged")
          .withArgs(maxExchangesPerBatch, deployer.address);

        await expect(cutTransaction)
          .to.emit(configHandler, "MaxOffersPerGroupChanged")
          .withArgs(maxOffersPerGroup, deployer.address);

        await expect(cutTransaction)
          .to.emit(configHandler, "MaxTwinsPerBundleChanged")
          .withArgs(maxTwinsPerBundle, deployer.address);

        await expect(cutTransaction)
          .to.emit(configHandler, "MaxOffersPerBundleChanged")
          .withArgs(maxOffersPerBundle, deployer.address);

        await expect(cutTransaction)
          .to.emit(configHandler, "MaxOffersPerBatchChanged")
          .withArgs(maxOffersPerBatch, deployer.address);

        await expect(cutTransaction)
          .to.emit(configHandler, "MaxTokensPerWithdrawalChanged")
          .withArgs(maxTokensPerWithdrawal, deployer.address);

        await expect(cutTransaction)
          .to.emit(configHandler, "MaxFeesPerDisputeResolverChanged")
          .withArgs(maxFeesPerDisputeResolver, deployer.address);

        await expect(cutTransaction)
          .to.emit(configHandler, "MaxEscalationResponsePeriodChanged")
          .withArgs(maxEscalationResponsePeriod, deployer.address);

        await expect(cutTransaction)
          .to.emit(configHandler, "MaxDisputesPerBatchChanged")
          .withArgs(maxDisputesPerBatch, deployer.address);

        await expect(cutTransaction)
          .to.emit(configHandler, "MaxAllowedSellersChanged")
          .withArgs(maxAllowedSellers, deployer.address);

        await expect(cutTransaction)
          .to.emit(configHandler, "BuyerEscalationFeePercentageChanged")
          .withArgs(buyerEscalationDepositPercentage, deployer.address);

        await expect(cutTransaction)
          .to.emit(configHandler, "MaxRoyaltyPercentageChanged")
          .withArgs(maxRoyaltyPecentage, deployer.address);
      });
    });
  });

  describe("After deploy tests", async function () {
    beforeEach(async function () {
      // Add config Handler, so twin id starts at 1
      const protocolConfig = [
        // Protocol addresses
        {
          treasury: treasury.address,
          token: token.address,
          voucherBeacon: beacon.address,
          beaconProxy: proxy.address,
        },
        // Protocol limits
        {
          maxExchangesPerBatch,
          maxOffersPerGroup,
          maxTwinsPerBundle,
          maxOffersPerBundle,
          maxOffersPerBatch,
          maxTokensPerWithdrawal,
          maxFeesPerDisputeResolver,
          maxEscalationResponsePeriod,
          maxDisputesPerBatch,
          maxAllowedSellers,
          maxTotalOfferFeePercentage,
          maxRoyaltyPecentage,
        },
        // Protocol fees
        {
          percentage: protocolFeePercentage,
          flatBoson: protocolFeeFlatBoson,
        },
        buyerEscalationDepositPercentage,
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
          expect(support, "IBosonConfigHandler interface not supported").is.true;
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

      context("👉 setVoucherBeaconAddress()", async function () {
        beforeEach(async function () {
          // set new value for beacon address
          beacon = accounts[9];
        });

        it("should emit a VoucherAddressChanged event", async function () {
          // Set new beacon address, testing for the event
          await expect(configHandler.connect(deployer).setVoucherBeaconAddress(beacon.address))
            .to.emit(configHandler, "VoucherBeaconAddressChanged")
            .withArgs(beacon.address, deployer.address);
        });

        it("should update state", async function () {
          // Set new beacon address
          await configHandler.connect(deployer).setVoucherBeaconAddress(beacon.address);

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getVoucherBeaconAddress()).to.equal(beacon.address);
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new beacon address, expecting revert
            await expect(configHandler.connect(rando).setVoucherBeaconAddress(beacon.address)).to.revertedWith(
              RevertReasons.ACCESS_DENIED
            );
          });
        });
      });

      context("👉 setBeaconProxyAddress()", async function () {
        beforeEach(async function () {
          // set new value for proxy address
          proxy = accounts[9];
        });

        it("should emit a VoucherAddressChanged event", async function () {
          // Set new proxy address, testing for the event
          await expect(configHandler.connect(deployer).setBeaconProxyAddress(proxy.address))
            .to.emit(configHandler, "BeaconProxyAddressChanged")
            .withArgs(proxy.address, deployer.address);
        });

        it("should update state", async function () {
          // Set new proxy address
          await configHandler.connect(deployer).setBeaconProxyAddress(proxy.address);

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getBeaconProxyAddress()).to.equal(proxy.address);
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new proxy address, expecting revert
            await expect(configHandler.connect(rando).setBeaconProxyAddress(proxy.address)).to.revertedWith(
              RevertReasons.ACCESS_DENIED
            );
          });
        });
      });

      context("👉 setProtocolFeePercentage()", async function () {
        beforeEach(async function () {
          // set new value for protocol fee precentage
          protocolFeePercentage = 10000;
        });

        it("should emit a ProtocolFeePercentageChanged event", async function () {
          // Set new protocol fee precentage address, testing for the event
          await expect(configHandler.connect(deployer).setProtocolFeePercentage(protocolFeePercentage))
            .to.emit(configHandler, "ProtocolFeePercentageChanged")
            .withArgs(protocolFeePercentage, deployer.address);
        });

        it("should update state", async function () {
          // Set new protocol fee precentage
          await configHandler.connect(deployer).setProtocolFeePercentage(protocolFeePercentage);

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getProtocolFeePercentage()).to.equal(protocolFeePercentage);
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new protocol fee precentage, expecting revert
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

      context("👉 setBuyerEscalationDepositPercentage()", async function () {
        beforeEach(async function () {
          // set new value for buyer escalation deposit percentage
          buyerEscalationDepositPercentage = 50;
        });

        it("should emit a BuyerEscalationFeePercentageChanged event", async function () {
          // Set new buyer escalation deposit percentage, testing for the event
          await expect(
            configHandler.connect(deployer).setBuyerEscalationDepositPercentage(buyerEscalationDepositPercentage)
          )
            .to.emit(configHandler, "BuyerEscalationFeePercentageChanged")
            .withArgs(buyerEscalationDepositPercentage, deployer.address);
        });

        it("should update state", async function () {
          // Set new buyer escalation deposit percentage
          await configHandler.connect(deployer).setBuyerEscalationDepositPercentage(buyerEscalationDepositPercentage);

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getBuyerEscalationDepositPercentage()).to.equal(
            buyerEscalationDepositPercentage
          );
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new buyer escalation deposit percentage, expecting revert
            await expect(
              configHandler.connect(rando).setBuyerEscalationDepositPercentage(buyerEscalationDepositPercentage)
            ).to.revertedWith(RevertReasons.ACCESS_DENIED);
          });

          it("protocolFeePercentage must be less than 10000", async function () {
            // Attempt to set new buyer escalation deposit percentage, expecting revert
            buyerEscalationDepositPercentage = 10001;
            await expect(
              configHandler.connect(deployer).setBuyerEscalationDepositPercentage(buyerEscalationDepositPercentage)
            ).to.revertedWith(RevertReasons.FEE_PERCENTAGE_INVALID);
          });
        });
      });

      context("👉 setMaxAllowedSellers()", async function () {
        beforeEach(async function () {
          // set new value for max allowed sellers
          maxAllowedSellers = 222;
        });

        it("should emit a MaxAllowedSellersChanged event", async function () {
          // Set new max allowed sellers, testing for the event
          await expect(configHandler.connect(deployer).setMaxAllowedSellers(maxAllowedSellers))
            .to.emit(configHandler, "MaxAllowedSellersChanged")
            .withArgs(maxAllowedSellers, deployer.address);
        });

        it("should update state", async function () {
          // Set new max allowed sellers,
          await configHandler.connect(deployer).setMaxAllowedSellers(maxAllowedSellers);

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getMaxAllowedSellers()).to.equal(maxAllowedSellers);
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new max allowed sellers, expecting revert
            await expect(configHandler.connect(rando).setMaxAllowedSellers(maxAllowedSellers)).to.revertedWith(
              RevertReasons.ACCESS_DENIED
            );
          });
        });
      });

      context("👉 setMaxTotalOfferFeePercentage()", async function () {
        beforeEach(async function () {
          // set new value for Max Total Offer Fee Percentage
          maxTotalOfferFeePercentage = 50;
        });

        it("should emit a MaxTotalOfferFeePercentageChanged event", async function () {
          // set new value for Max Total Offer Fee Percentage, testing for the event
          await expect(configHandler.connect(deployer).setMaxTotalOfferFeePercentage(maxTotalOfferFeePercentage))
            .to.emit(configHandler, "MaxTotalOfferFeePercentageChanged")
            .withArgs(maxTotalOfferFeePercentage, deployer.address);
        });

        it("should update state", async function () {
          // set new value for Max Total Offer Fee Percentage
          await configHandler.connect(deployer).setMaxTotalOfferFeePercentage(maxTotalOfferFeePercentage);

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getMaxTotalOfferFeePercentage()).to.equal(
            maxTotalOfferFeePercentage
          );
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new value for Max Total Offer Fee Percentage, expecting revert
            await expect(
              configHandler.connect(rando).setMaxTotalOfferFeePercentage(maxTotalOfferFeePercentage)
            ).to.revertedWith(RevertReasons.ACCESS_DENIED);
          });

          it("maxTotalOfferFeePercentage must be less than 10000", async function () {
            // Attempt to set new value for Max Total Offer Fee Percentage, expecting revert
            maxTotalOfferFeePercentage = 10001;
            await expect(
              configHandler.connect(deployer).setMaxTotalOfferFeePercentage(maxTotalOfferFeePercentage)
            ).to.revertedWith(RevertReasons.FEE_PERCENTAGE_INVALID);
          });
        });
      });

      context("👉 setMaxRoyaltyPecentage()", async function () {
        beforeEach(async function () {
          // set new value for Max Royalty Percentage
          maxRoyaltyPecentage = 250;
        });

        it("should emit a MaxRoyaltyPercentageChanged event", async function () {
          // set new value for Max Royalty Percentage, testing for the event
          await expect(configHandler.connect(deployer).setMaxRoyaltyPecentage(maxRoyaltyPecentage))
            .to.emit(configHandler, "MaxRoyaltyPercentageChanged")
            .withArgs(maxRoyaltyPecentage, deployer.address);
        });

        it("should update state", async function () {
          // set new value for Max Royalty Percentage
          await configHandler.connect(deployer).setMaxRoyaltyPecentage(maxRoyaltyPecentage);

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getMaxRoyaltyPecentage()).to.equal(maxRoyaltyPecentage);
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new value for Max Royalty Percentage, expecting revert
            await expect(configHandler.connect(rando).setMaxRoyaltyPecentage(maxRoyaltyPecentage)).to.revertedWith(
              RevertReasons.ACCESS_DENIED
            );
          });

          it("maxRoyaltyPecentage must be less than 10000", async function () {
            // Attempt to set new value for Max Royalty Percentage, expecting revert
            maxRoyaltyPecentage = 10001;
            await expect(configHandler.connect(deployer).setMaxRoyaltyPecentage(maxRoyaltyPecentage)).to.revertedWith(
              RevertReasons.FEE_PERCENTAGE_INVALID
            );
          });
        });
      });

      context("👉 setAuthTokenContract()", async function () {
        beforeEach(async function () {
          // set new value for auth token contract
          authTokenContract = accounts[9];
        });

        it("should emit an AuthTokenContractChanged event", async function () {
          // Set new auth token contract, testing for the event
          await expect(
            configHandler.connect(deployer).setAuthTokenContract(AuthTokenType.Lens, authTokenContract.address)
          )
            .to.emit(configHandler, "AuthTokenContractChanged")
            .withArgs(AuthTokenType.Lens, authTokenContract.address, deployer.address);
        });

        it("should update state", async function () {
          // Set new auth token contract,
          await configHandler.connect(deployer).setAuthTokenContract(AuthTokenType.ENS, authTokenContract.address);

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getAuthTokenContract(AuthTokenType.ENS)).to.equal(
            authTokenContract.address
          );
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new auth token contract, expecting revert
            await expect(
              configHandler.connect(rando).setAuthTokenContract(AuthTokenType.ENS, authTokenContract.address)
            ).to.revertedWith(RevertReasons.ACCESS_DENIED);
          });
        });
      });

      context("👉 setMaxExchangesPerBatch()", async function () {
        beforeEach(async function () {
          // set new value for max exchanges per batch
          maxExchangesPerBatch = 135;
        });

        it("should emit a MaxExchangesPerBatchChanged event", async function () {
          // Set new max exchange per batch, testing for the event
          await expect(configHandler.connect(deployer).setMaxExchangesPerBatch(maxExchangesPerBatch))
            .to.emit(configHandler, "MaxExchangesPerBatchChanged")
            .withArgs(maxExchangesPerBatch, deployer.address);
        });

        it("should update state", async function () {
          // Set new max exchange per batch,
          await configHandler.connect(deployer).setMaxExchangesPerBatch(maxExchangesPerBatch);

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getMaxExchangesPerBatch()).to.equal(maxExchangesPerBatch);
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new max exchange per batch, expecting revert
            await expect(configHandler.connect(rando).setMaxExchangesPerBatch(maxExchangesPerBatch)).to.revertedWith(
              RevertReasons.ACCESS_DENIED
            );
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
        expect(await configHandler.connect(rando).getVoucherBeaconAddress()).to.equal(
          beacon.address,
          "Invalid voucher address"
        );
        expect(await configHandler.connect(rando).getBeaconProxyAddress()).to.equal(
          proxy.address,
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
        expect(await configHandler.connect(rando).getMaxAllowedSellers()).to.equal(
          maxAllowedSellers,
          "Invalid max allowed sellers"
        );
        expect(await configHandler.connect(rando).getBuyerEscalationDepositPercentage()).to.equal(
          buyerEscalationDepositPercentage,
          "Invalid buyer escalation deposit"
        );
        expect(await configHandler.connect(rando).getMaxTotalOfferFeePercentage()).to.equal(
          maxTotalOfferFeePercentage,
          "Invalid max total offer fee percentage"
        );
        expect(await configHandler.connect(rando).getMaxRoyaltyPecentage()).to.equal(
          maxRoyaltyPecentage,
          "Invalid max royalty percentage"
        );
        //setAuthTokenContract is not called in the initialize function
        expect(await configHandler.connect(rando).getAuthTokenContract(AuthTokenType.Lens)).to.equal(
          ethers.constants.AddressZero,
          "Invalid auth token contract address"
        );

        expect(await configHandler.connect(rando).getMaxExchangesPerBatch()).to.equal(
          maxExchangesPerBatch,
          "Invalid max exchanges per batch"
        );
      });
    });
  });
});
