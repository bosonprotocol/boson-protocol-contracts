const { ethers } = require("hardhat");
const { getSigners, getContractAt, ZeroAddress, parseUnits } = ethers;
const { expect } = require("chai");

const Role = require("../../scripts/domain/Role");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { oneWeek, oneMonth, maxPriorityFeePerGas } = require("../util/constants");
const AuthTokenType = require("../../scripts/domain/AuthTokenType");
const { getFacetsWithArgs, getSnapshot, revertToSnapshot, calculateBosonProxyAddress } = require("../util/utils");
const { deployAndCutFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");

/**
 *  Test the Boson Config Handler interface
 */
describe("IBosonConfigHandler", function () {
  // Common vars
  let InterfaceIds, support;
  let accounts, deployer, rando, token, treasury, beacon;
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
    maxRoyaltyPecentage,
    minResolutionPeriod,
    maxResolutionPeriod,
    minDisputePeriod,
    maxPremintedVouchers;
  let protocolFeePercentage, protocolFeeFlatBoson;
  let erc165, protocolDiamond, accessController, configHandler;
  let snapshotId;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();

    // Make accounts available
    accounts = await getSigners();
    [deployer, rando, token, treasury, beacon] = accounts;

    // Deploy the Protocol Diamond
    [protocolDiamond, , , , accessController] = await deployProtocolDiamond(maxPriorityFeePerGas);

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, await deployer.getAddress());

    // Set protocol config
    protocolFeePercentage = 12;
    protocolFeeFlatBoson = parseUnits("0.01", "ether").toString();
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
    minResolutionPeriod = oneWeek;
    maxResolutionPeriod = oneMonth;
    minDisputePeriod = oneWeek;
    maxPremintedVouchers = 10000;

    // Cast Diamond to IERC165
    erc165 = await getContractAt("ERC165Facet", await protocolDiamond.getAddress());

    // Cast Diamond to IBosonConfigHandler
    configHandler = await getContractAt("IBosonConfigHandler", await protocolDiamond.getAddress());

    // Get snapshot id
    snapshotId = await getSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();
  });

  describe("Deploy tests", async function () {
    context("📋 Initializer", async function () {
      it("should initialize the config handler and emit set events", async function () {
        const proxyAddress = await calculateBosonProxyAddress(await protocolDiamond.getAddress());

        const protocolConfig = [
          // Protocol addresses
          {
            token: await token.getAddress(),
            treasury: await treasury.getAddress(),
            voucherBeacon: await beacon.getAddress(),
            beaconProxy: ZeroAddress,
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
            minResolutionPeriod,
            maxResolutionPeriod,
            minDisputePeriod,
            maxPremintedVouchers,
          },
          //Protocol fees
          {
            percentage: protocolFeePercentage,
            flatBoson: protocolFeeFlatBoson,
            buyerEscalationDepositPercentage,
          },
        ];

        const facetNames = ["ProtocolInitializationHandlerFacet", "ConfigHandlerFacet"];

        const facetsToDeploy = await getFacetsWithArgs(facetNames, protocolConfig);

        // Cut the protocol handler facets into the Diamond
        const { cutTransaction } = await deployAndCutFacets(
          await protocolDiamond.getAddress(),
          facetsToDeploy,
          maxPriorityFeePerGas
        );

        await expect(cutTransaction)
          .to.emit(configHandler, "TokenAddressChanged")
          .withArgs(await token.getAddress(), await deployer.getAddress());

        await expect(cutTransaction)
          .to.emit(configHandler, "TreasuryAddressChanged")
          .withArgs(await treasury.getAddress(), await deployer.getAddress());

        await expect(cutTransaction)
          .to.emit(configHandler, "VoucherBeaconAddressChanged")
          .withArgs(await beacon.getAddress(), await deployer.getAddress());

        await expect(cutTransaction)
          .to.emit(configHandler, "BeaconProxyAddressChanged")
          .withArgs(proxyAddress, await deployer.getAddress());

        await expect(cutTransaction)
          .to.emit(configHandler, "ProtocolFeePercentageChanged")
          .withArgs(protocolFeePercentage, await deployer.getAddress());

        await expect(cutTransaction)
          .to.emit(configHandler, "ProtocolFeeFlatBosonChanged")
          .withArgs(protocolFeeFlatBoson, await deployer.getAddress());

        await expect(cutTransaction)
          .to.emit(configHandler, "MaxExchangesPerBatchChanged")
          .withArgs(maxExchangesPerBatch, await deployer.getAddress());

        await expect(cutTransaction)
          .to.emit(configHandler, "MaxOffersPerGroupChanged")
          .withArgs(maxOffersPerGroup, await deployer.getAddress());

        await expect(cutTransaction)
          .to.emit(configHandler, "MaxTwinsPerBundleChanged")
          .withArgs(maxTwinsPerBundle, await deployer.getAddress());

        await expect(cutTransaction)
          .to.emit(configHandler, "MaxOffersPerBundleChanged")
          .withArgs(maxOffersPerBundle, await deployer.getAddress());

        await expect(cutTransaction)
          .to.emit(configHandler, "MaxOffersPerBatchChanged")
          .withArgs(maxOffersPerBatch, await deployer.getAddress());

        await expect(cutTransaction)
          .to.emit(configHandler, "MaxTokensPerWithdrawalChanged")
          .withArgs(maxTokensPerWithdrawal, await deployer.getAddress());

        await expect(cutTransaction)
          .to.emit(configHandler, "MaxFeesPerDisputeResolverChanged")
          .withArgs(maxFeesPerDisputeResolver, await deployer.getAddress());

        await expect(cutTransaction)
          .to.emit(configHandler, "MaxEscalationResponsePeriodChanged")
          .withArgs(maxEscalationResponsePeriod, await deployer.getAddress());

        await expect(cutTransaction)
          .to.emit(configHandler, "MaxDisputesPerBatchChanged")
          .withArgs(maxDisputesPerBatch, await deployer.getAddress());

        await expect(cutTransaction)
          .to.emit(configHandler, "MaxAllowedSellersChanged")
          .withArgs(maxAllowedSellers, await deployer.getAddress());

        await expect(cutTransaction)
          .to.emit(configHandler, "BuyerEscalationFeePercentageChanged")
          .withArgs(buyerEscalationDepositPercentage, await deployer.getAddress());

        await expect(cutTransaction)
          .to.emit(configHandler, "MaxRoyaltyPercentageChanged")
          .withArgs(maxRoyaltyPecentage, await deployer.getAddress());

        await expect(cutTransaction)
          .to.emit(configHandler, "MinResolutionPeriodChanged")
          .withArgs(minResolutionPeriod, deployer.address);

        await expect(cutTransaction)
          .to.emit(configHandler, "MaxResolutionPeriodChanged")
          .withArgs(maxResolutionPeriod, await deployer.getAddress());

        await expect(cutTransaction)
          .to.emit(configHandler, "MinDisputePeriodChanged")
          .withArgs(minDisputePeriod, await deployer.getAddress());

        await expect(cutTransaction)
          .to.emit(configHandler, "MaxPremintedVouchersChanged")
          .withArgs(maxPremintedVouchers, await deployer.getAddress());
      });
    });
  });

  describe("After deploy tests", async function () {
    before(async function () {
      // Add config Handler, so twin id starts at 1
      const protocolConfig = [
        // Protocol addresses
        {
          treasury: await treasury.getAddress(),
          token: await token.getAddress(),
          voucherBeacon: await beacon.getAddress(),
          beaconProxy: ZeroAddress,
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
          minResolutionPeriod,
          maxResolutionPeriod,
          minDisputePeriod,
          maxPremintedVouchers,
        },
        // Protocol fees
        {
          percentage: protocolFeePercentage,
          flatBoson: protocolFeeFlatBoson,
          buyerEscalationDepositPercentage,
        },
      ];
      const facetNames = ["ProtocolInitializationHandlerFacet", "ConfigHandlerFacet"];

      const facetsToDeploy = await getFacetsWithArgs(facetNames, protocolConfig);

      // Cut the protocol handler facets into the Diamond
      await deployAndCutFacets(await protocolDiamond.getAddress(), facetsToDeploy, maxPriorityFeePerGas);

      // Update id
      snapshotId = await getSnapshot();
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
        let maxOffersPerGroup;
        beforeEach(async function () {
          // set new value for max offers per group
          maxOffersPerGroup = 150;
        });

        it("should emit a MaxOffersPerGroupChanged event", async function () {
          // Set new max offer per group, testing for the event
          await expect(configHandler.connect(deployer).setMaxOffersPerGroup(maxOffersPerGroup))
            .to.emit(configHandler, "MaxOffersPerGroupChanged")
            .withArgs(maxOffersPerGroup, await deployer.getAddress());
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

          it("maxOffersPerGroup is zero", async function () {
            maxOffersPerGroup = 0;

            await expect(configHandler.connect(deployer).setMaxOffersPerGroup(maxOffersPerGroup)).to.revertedWith(
              RevertReasons.VALUE_ZERO_NOT_ALLOWED
            );
          });
        });
      });

      context("👉 setMaxTwinsPerBundle()", async function () {
        let maxTwinsPerBundle;
        beforeEach(async function () {
          // set new value for max twins per bundle
          maxTwinsPerBundle = 150;
        });

        it("should emit a MaxTwinsPerBundleChanged event", async function () {
          // Set new max twin per bundle, testing for the event
          await expect(configHandler.connect(deployer).setMaxTwinsPerBundle(maxTwinsPerBundle))
            .to.emit(configHandler, "MaxTwinsPerBundleChanged")
            .withArgs(maxTwinsPerBundle, await deployer.getAddress());
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

          it("maxTwinsPerBundle is zero", async function () {
            maxTwinsPerBundle = 0;

            await expect(configHandler.connect(deployer).setMaxTwinsPerBundle(maxTwinsPerBundle)).to.revertedWith(
              RevertReasons.VALUE_ZERO_NOT_ALLOWED
            );
          });
        });
      });

      context("👉 setMaxOffersPerBundle()", async function () {
        let maxOffersPerBundle;
        beforeEach(async function () {
          // set new value for max offers per bundle
          maxOffersPerBundle = 150;
        });

        it("should emit a MaxOffersPerBundleChanged event", async function () {
          // Set new max offer per bundle, testing for the event
          await expect(configHandler.connect(deployer).setMaxOffersPerBundle(maxOffersPerBundle))
            .to.emit(configHandler, "MaxOffersPerBundleChanged")
            .withArgs(maxOffersPerBundle, await deployer.getAddress());
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

          it("maxOffersPerBundle is zero", async function () {
            maxOffersPerBundle = 0;

            await expect(configHandler.connect(deployer).setMaxOffersPerBundle(maxOffersPerBundle)).to.revertedWith(
              RevertReasons.VALUE_ZERO_NOT_ALLOWED
            );
          });
        });
      });

      context("👉 setMaxOffersPerBatch()", async function () {
        let maxOffersPerBatch;
        beforeEach(async function () {
          // set new value for max offers per batch
          maxOffersPerBatch = 135;
        });

        it("should emit a MaxOffersPerBatchChanged event", async function () {
          // Set new max offer per batch, testing for the event
          await expect(configHandler.connect(deployer).setMaxOffersPerBatch(maxOffersPerBatch))
            .to.emit(configHandler, "MaxOffersPerBatchChanged")
            .withArgs(maxOffersPerBatch, await deployer.getAddress());
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

          it("maxOffersPerBatch is zero", async function () {
            maxOffersPerBatch = 0;

            await expect(configHandler.connect(deployer).setMaxOffersPerBatch(maxOffersPerBatch)).to.revertedWith(
              RevertReasons.VALUE_ZERO_NOT_ALLOWED
            );
          });
        });
      });

      context("👉 setMaxTokensPerWithdrawal()", async function () {
        let maxTokensPerWithdrawal;
        beforeEach(async function () {
          // set new value for max tokens per withdrawal
          maxTokensPerWithdrawal = 598;
        });

        it("should emit a MaxTokensPerWithdrawalChanged event", async function () {
          // Set new max tokens per withdrawal, testing for the event
          await expect(configHandler.connect(deployer).setMaxTokensPerWithdrawal(maxTokensPerWithdrawal))
            .to.emit(configHandler, "MaxTokensPerWithdrawalChanged")
            .withArgs(maxTokensPerWithdrawal, await deployer.getAddress());
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

          it("maxTokensPerWithdrawal is zero", async function () {
            maxTokensPerWithdrawal = 0;

            await expect(
              configHandler.connect(deployer).setMaxTokensPerWithdrawal(maxTokensPerWithdrawal)
            ).to.revertedWith(RevertReasons.VALUE_ZERO_NOT_ALLOWED);
          });
        });
      });

      context("👉 setTokenAddress()", async function () {
        let token;
        beforeEach(async function () {
          // set new value for token address
          token = accounts[5];
        });

        it("should emit a TokenAddressChanged event", async function () {
          // Set new token address, testing for the event
          await expect(configHandler.connect(deployer).setTokenAddress(await token.getAddress()))
            .to.emit(configHandler, "TokenAddressChanged")
            .withArgs(await token.getAddress(), await deployer.getAddress());
        });

        it("should update state", async function () {
          // Set new token address
          await configHandler.connect(deployer).setTokenAddress(await token.getAddress());

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getTokenAddress()).to.equal(await token.getAddress());
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new token address, expecting revert
            await expect(configHandler.connect(rando).setTokenAddress(await token.getAddress())).to.revertedWith(
              RevertReasons.ACCESS_DENIED
            );
          });

          it("token address is the zero address", async function () {
            // Attempt to set new token address, expecting revert
            await expect(configHandler.connect(deployer).setTokenAddress(ZeroAddress)).to.revertedWith(
              RevertReasons.INVALID_ADDRESS
            );
          });
        });
      });

      context("👉 setTreasuryAddress()", async function () {
        let treasury;
        beforeEach(async function () {
          // set new value for treasury address
          treasury = accounts[5];
        });

        it("should emit a TreasuryAddressChanged event", async function () {
          // Set new treasury address, testing for the event
          await expect(configHandler.connect(deployer).setTreasuryAddress(await treasury.getAddress()))
            .to.emit(configHandler, "TreasuryAddressChanged")
            .withArgs(await treasury.getAddress(), await deployer.getAddress());
        });

        it("should update state", async function () {
          // Set new treasury address
          await configHandler.connect(deployer).setTreasuryAddress(await treasury.getAddress());

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getTreasuryAddress()).to.equal(await treasury.getAddress());
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new treasury address, expecting revert
            await expect(configHandler.connect(rando).setTreasuryAddress(await treasury.getAddress())).to.revertedWith(
              RevertReasons.ACCESS_DENIED
            );
          });

          it("treasury address is the zero address", async function () {
            // Attempt to set new treasury address, expecting revert
            await expect(configHandler.connect(deployer).setTreasuryAddress(ZeroAddress)).to.revertedWith(
              RevertReasons.INVALID_ADDRESS
            );
          });
        });
      });

      context("👉 setVoucherBeaconAddress()", async function () {
        let beacon;
        beforeEach(async function () {
          // set new value for beacon address
          beacon = accounts[9];
        });

        it("should emit a VoucherAddressChanged event", async function () {
          // Set new beacon address, testing for the event
          await expect(configHandler.connect(deployer).setVoucherBeaconAddress(await beacon.getAddress()))
            .to.emit(configHandler, "VoucherBeaconAddressChanged")
            .withArgs(await beacon.getAddress(), await deployer.getAddress());
        });

        it("should update state", async function () {
          // Set new beacon address
          await configHandler.connect(deployer).setVoucherBeaconAddress(await beacon.getAddress());

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getVoucherBeaconAddress()).to.equal(await beacon.getAddress());
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new beacon address, expecting revert
            await expect(
              configHandler.connect(rando).setVoucherBeaconAddress(await beacon.getAddress())
            ).to.revertedWith(RevertReasons.ACCESS_DENIED);
          });

          it("voucher beacon address is the zero address", async function () {
            // Attempt to set new beacon address, expecting revert
            await expect(configHandler.connect(deployer).setVoucherBeaconAddress(ZeroAddress)).to.revertedWith(
              RevertReasons.INVALID_ADDRESS
            );
          });
        });
      });

      context("👉 setBeaconProxyAddress()", async function () {
        let proxy;
        beforeEach(async function () {
          // set new value for proxy address
          proxy = accounts[9];
        });

        it("should emit a BeaconProxyAddressChanged event", async function () {
          // Set new proxy address, testing for the event
          await expect(configHandler.connect(deployer).setBeaconProxyAddress(await proxy.getAddress()))
            .to.emit(configHandler, "BeaconProxyAddressChanged")
            .withArgs(await proxy.getAddress(), await deployer.getAddress());
        });

        it("should update state", async function () {
          // Set new proxy address
          await configHandler.connect(deployer).setBeaconProxyAddress(await proxy.getAddress());

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getBeaconProxyAddress()).to.equal(await proxy.getAddress());
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new proxy address, expecting revert
            await expect(configHandler.connect(rando).setBeaconProxyAddress(await proxy.getAddress())).to.revertedWith(
              RevertReasons.ACCESS_DENIED
            );
          });

          it("beacon proxy address is the zero address", async function () {
            // Attempt to set new proxy address, expecting revert
            await expect(configHandler.connect(deployer).setBeaconProxyAddress(ZeroAddress)).to.revertedWith(
              RevertReasons.INVALID_ADDRESS
            );
          });
        });
      });

      context("👉 setProtocolFeePercentage()", async function () {
        let protocolFeePercentage;
        beforeEach(async function () {
          // set new value for protocol fee precentage
          protocolFeePercentage = 10000;
        });

        it("should emit a ProtocolFeePercentageChanged event", async function () {
          // Set new protocol fee precentage address, testing for the event
          await expect(configHandler.connect(deployer).setProtocolFeePercentage(protocolFeePercentage))
            .to.emit(configHandler, "ProtocolFeePercentageChanged")
            .withArgs(protocolFeePercentage, await deployer.getAddress());
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
        let protocolFeeFlatBoson;
        beforeEach(async function () {
          // set new value for flat boson protocol fee
          protocolFeeFlatBoson = parseUnits("0.02", "ether").toString();
        });

        it("should emit a ProtocolFeeFlatBosonChanged event", async function () {
          // Set new flat boson protocol feel, testing for the event
          await expect(configHandler.connect(deployer).setProtocolFeeFlatBoson(protocolFeeFlatBoson))
            .to.emit(configHandler, "ProtocolFeeFlatBosonChanged")
            .withArgs(protocolFeeFlatBoson, await deployer.getAddress());
        });

        it("should update state", async function () {
          // Set flat boson protocol fee
          await configHandler.connect(deployer).setProtocolFeeFlatBoson(protocolFeeFlatBoson);

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getProtocolFeeFlatBoson()).to.equal(protocolFeeFlatBoson);
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
        let maxDisputesPerBatch;
        beforeEach(async function () {
          // set new value for max disputes per batch
          maxDisputesPerBatch = 135;
        });

        it("should emit a MaxDisputesPerBatchChanged event", async function () {
          // Set new max disputes per batch, testing for the event
          await expect(configHandler.connect(deployer).setMaxDisputesPerBatch(maxDisputesPerBatch))
            .to.emit(configHandler, "MaxDisputesPerBatchChanged")
            .withArgs(maxDisputesPerBatch, await deployer.getAddress());
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

          it("maxDisputesPerBatch is zero", async function () {
            maxDisputesPerBatch = 0;

            await expect(configHandler.connect(deployer).setMaxDisputesPerBatch(maxDisputesPerBatch)).to.revertedWith(
              RevertReasons.VALUE_ZERO_NOT_ALLOWED
            );
          });
        });
      });

      context("👉 setMaxFeesPerDisputeResolver()", async function () {
        let maxFeesPerDisputeResolver;
        beforeEach(async function () {
          // set new value
          maxFeesPerDisputeResolver = 200;
        });

        it("should emit a MaxFeesPerDisputeResolverChanged event", async function () {
          // Set max fees per dispute resolver
          await expect(configHandler.connect(deployer).setMaxFeesPerDisputeResolver(maxFeesPerDisputeResolver))
            .to.emit(configHandler, "MaxFeesPerDisputeResolverChanged")
            .withArgs(maxFeesPerDisputeResolver, await deployer.getAddress());
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

          it("maxFeesPerDisputeResolver is zero", async function () {
            maxFeesPerDisputeResolver = 0;
            await expect(
              configHandler.connect(deployer).setMaxFeesPerDisputeResolver(maxFeesPerDisputeResolver)
            ).to.revertedWith(RevertReasons.VALUE_ZERO_NOT_ALLOWED);
          });
        });
      });

      context("👉 setMaxEscalationResponsePeriod()", async function () {
        let maxEscalationResponsePeriod;
        beforeEach(async function () {
          // set new value
          maxEscalationResponsePeriod = oneMonth + oneWeek;
        });

        it("should emit a MaxEscalationResponsePeriodChanged event", async function () {
          // Set new escalation response period
          await expect(configHandler.connect(deployer).setMaxEscalationResponsePeriod(maxEscalationResponsePeriod))
            .to.emit(configHandler, "MaxEscalationResponsePeriodChanged")
            .withArgs(maxEscalationResponsePeriod, await deployer.getAddress());
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

          it("maxEscalationResponsePeriod is zero", async function () {
            maxEscalationResponsePeriod = 0;
            await expect(
              configHandler.connect(deployer).setMaxEscalationResponsePeriod(maxEscalationResponsePeriod)
            ).to.revertedWith(RevertReasons.VALUE_ZERO_NOT_ALLOWED);
          });
        });
      });

      context("👉 setBuyerEscalationDepositPercentage()", async function () {
        let buyerEscalationDepositPercentage;
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
            .withArgs(buyerEscalationDepositPercentage, await deployer.getAddress());
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
        let maxAllowedSellers;
        beforeEach(async function () {
          // set new value for max allowed sellers
          maxAllowedSellers = 222;
        });

        it("should emit a MaxAllowedSellersChanged event", async function () {
          // Set new max allowed sellers, testing for the event
          await expect(configHandler.connect(deployer).setMaxAllowedSellers(maxAllowedSellers))
            .to.emit(configHandler, "MaxAllowedSellersChanged")
            .withArgs(maxAllowedSellers, await deployer.getAddress());
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

          it("maxAllowedSellers is zero", async function () {
            maxAllowedSellers = 0;
            await expect(configHandler.connect(deployer).setMaxAllowedSellers(maxAllowedSellers)).to.revertedWith(
              RevertReasons.VALUE_ZERO_NOT_ALLOWED
            );
          });
        });
      });

      context("👉 setMaxTotalOfferFeePercentage()", async function () {
        let maxTotalOfferFeePercentage;
        beforeEach(async function () {
          // set new value for Max Total Offer Fee Percentage
          maxTotalOfferFeePercentage = 50;
        });

        it("should emit a MaxTotalOfferFeePercentageChanged event", async function () {
          // set new value for Max Total Offer Fee Percentage, testing for the event
          await expect(configHandler.connect(deployer).setMaxTotalOfferFeePercentage(maxTotalOfferFeePercentage))
            .to.emit(configHandler, "MaxTotalOfferFeePercentageChanged")
            .withArgs(maxTotalOfferFeePercentage, await deployer.getAddress());
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
        let maxRoyaltyPecentage;
        beforeEach(async function () {
          // set new value for Max Royalty Percentage
          maxRoyaltyPecentage = 250;
        });

        it("should emit a MaxRoyaltyPercentageChanged event", async function () {
          // set new value for Max Royalty Percentage, testing for the event
          await expect(configHandler.connect(deployer).setMaxRoyaltyPecentage(maxRoyaltyPecentage))
            .to.emit(configHandler, "MaxRoyaltyPercentageChanged")
            .withArgs(maxRoyaltyPecentage, await deployer.getAddress());
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

          it("maxRoyaltyPecentage is zero", async function () {
            maxRoyaltyPecentage = 0;
            await expect(configHandler.connect(deployer).setMaxRoyaltyPecentage(maxRoyaltyPecentage)).to.revertedWith(
              RevertReasons.VALUE_ZERO_NOT_ALLOWED
            );
          });
        });
      });

      context("👉 setAuthTokenContract()", async function () {
        let authTokenContract;
        beforeEach(async function () {
          // set new value for auth token contract
          authTokenContract = accounts[9];
        });

        it("should emit an AuthTokenContractChanged event", async function () {
          // Set new auth token contract, testing for the event
          await expect(
            configHandler
              .connect(deployer)
              .setAuthTokenContract(AuthTokenType.Lens, await authTokenContract.getAddress())
          )
            .to.emit(configHandler, "AuthTokenContractChanged")
            .withArgs(AuthTokenType.Lens, await authTokenContract.getAddress(), await deployer.getAddress());
        });

        it("should update state", async function () {
          // Set new auth token contract,
          await configHandler
            .connect(deployer)
            .setAuthTokenContract(AuthTokenType.ENS, await authTokenContract.getAddress());

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getAuthTokenContract(AuthTokenType.ENS)).to.equal(
            await authTokenContract.getAddress()
          );
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new auth token contract, expecting revert
            await expect(
              configHandler.connect(rando).setAuthTokenContract(AuthTokenType.ENS, await authTokenContract.getAddress())
            ).to.revertedWith(RevertReasons.ACCESS_DENIED);
          });

          it("_authTokenType is None", async function () {
            // Attempt to set new auth token contract, expecting revert
            await expect(
              configHandler
                .connect(deployer)
                .setAuthTokenContract(AuthTokenType.None, await authTokenContract.getAddress())
            ).to.revertedWith(RevertReasons.INVALID_AUTH_TOKEN_TYPE);
          });

          it("_authTokenType is Custom", async function () {
            // Attempt to set new auth token contract, expecting revert
            await expect(
              configHandler
                .connect(deployer)
                .setAuthTokenContract(AuthTokenType.Custom, await authTokenContract.getAddress())
            ).to.revertedWith(RevertReasons.INVALID_AUTH_TOKEN_TYPE);
          });

          it("_authTokenContract is the zero address", async function () {
            // Attempt to set new auth token contract, expecting revert
            await expect(
              configHandler.connect(deployer).setAuthTokenContract(AuthTokenType.ENS, ZeroAddress)
            ).to.revertedWith(RevertReasons.INVALID_ADDRESS);
          });
        });
      });

      context("👉 setMaxExchangesPerBatch()", async function () {
        let maxExchangesPerBatch;
        beforeEach(async function () {
          // set new value for max exchanges per batch
          maxExchangesPerBatch = 135;
        });

        it("should emit a MaxExchangesPerBatchChanged event", async function () {
          // Set new max exchange per batch, testing for the event
          await expect(configHandler.connect(deployer).setMaxExchangesPerBatch(maxExchangesPerBatch))
            .to.emit(configHandler, "MaxExchangesPerBatchChanged")
            .withArgs(maxExchangesPerBatch, await deployer.getAddress());
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

          it("maxExchangesPerBatch is zero", async function () {
            maxExchangesPerBatch = 0;
            await expect(configHandler.connect(deployer).setMaxExchangesPerBatch(maxExchangesPerBatch)).to.revertedWith(
              RevertReasons.VALUE_ZERO_NOT_ALLOWED
            );
          });
        });
      });

      context("👉 setMinResolutionPeriod()", async function () {
        let minResolutionPeriod;
        beforeEach(async function () {
          // set new value
          minResolutionPeriod = oneWeek * 2n;
        });

        it("should emit a MinResolutionPeriodChanged event", async function () {
          // Set new resolution period
          await expect(configHandler.connect(deployer).setMinResolutionPeriod(minResolutionPeriod))
            .to.emit(configHandler, "MinResolutionPeriodChanged")
            .withArgs(minResolutionPeriod, deployer.address);
        });

        it("should update state", async function () {
          // Set new resolution period
          await configHandler.connect(deployer).setMinResolutionPeriod(minResolutionPeriod);

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getMinResolutionPeriod()).to.equal(minResolutionPeriod);
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new value, expecting revert
            await expect(configHandler.connect(rando).setMinResolutionPeriod(minResolutionPeriod)).to.revertedWith(
              RevertReasons.ACCESS_DENIED
            );
          });

          it("minResolutionPeriod is zero", async function () {
            minResolutionPeriod = 0;
            await expect(configHandler.connect(deployer).setMinResolutionPeriod(minResolutionPeriod)).to.revertedWith(
              RevertReasons.VALUE_ZERO_NOT_ALLOWED
            );
          });
        });
      });

      context("👉 setMaxResolutionPeriod()", async function () {
        let maxResolutionPeriod;
        beforeEach(async function () {
          // set new value
          maxResolutionPeriod = oneMonth + oneWeek;
        });

        it("should emit a MaxResolutionPeriodChanged event", async function () {
          // Set new resolution period
          await expect(configHandler.connect(deployer).setMaxResolutionPeriod(maxResolutionPeriod))
            .to.emit(configHandler, "MaxResolutionPeriodChanged")
            .withArgs(maxResolutionPeriod, await deployer.getAddress());
        });

        it("should update state", async function () {
          // Set new resolution period
          await configHandler.connect(deployer).setMaxResolutionPeriod(maxResolutionPeriod);

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getMaxResolutionPeriod()).to.equal(maxResolutionPeriod);
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new value, expecting revert
            await expect(configHandler.connect(rando).setMaxResolutionPeriod(maxResolutionPeriod)).to.revertedWith(
              RevertReasons.ACCESS_DENIED
            );
          });

          it("maxResolutionPeriod is zero", async function () {
            maxResolutionPeriod = 0;
            await expect(configHandler.connect(deployer).setMaxResolutionPeriod(maxResolutionPeriod)).to.revertedWith(
              RevertReasons.VALUE_ZERO_NOT_ALLOWED
            );
          });
        });
      });

      context("👉 setMinDisputePeriod()", async function () {
        let minDisputePeriod;
        beforeEach(async function () {
          // set new value
          minDisputePeriod = oneMonth - oneWeek;
        });

        it("should emit a MinDisputePeriodChanged event", async function () {
          // Set new minumum dispute period
          await expect(configHandler.connect(deployer).setMinDisputePeriod(minDisputePeriod))
            .to.emit(configHandler, "MinDisputePeriodChanged")
            .withArgs(minDisputePeriod, await deployer.getAddress());
        });

        it("should update state", async function () {
          // Set new minumum dispute period
          await configHandler.connect(deployer).setMinDisputePeriod(minDisputePeriod);

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getMinDisputePeriod()).to.equal(minDisputePeriod);
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new value, expecting revert
            await expect(configHandler.connect(rando).setMinDisputePeriod(minDisputePeriod)).to.revertedWith(
              RevertReasons.ACCESS_DENIED
            );
          });

          it("minDisputePeriod is zero", async function () {
            minDisputePeriod = 0;
            await expect(configHandler.connect(deployer).setMinDisputePeriod(minDisputePeriod)).to.revertedWith(
              RevertReasons.VALUE_ZERO_NOT_ALLOWED
            );
          });
        });
      });

      context("👉 setMaxPremintedVouchers()", async function () {
        let maxPremintedVouchers;
        beforeEach(async function () {
          // set new value
          maxPremintedVouchers = 50000;
        });

        it("should emit a MaxPremintedVouchersChanged event", async function () {
          // Set new minumum dispute period
          await expect(configHandler.connect(deployer).setMaxPremintedVouchers(maxPremintedVouchers))
            .to.emit(configHandler, "MaxPremintedVouchersChanged")
            .withArgs(maxPremintedVouchers, await deployer.getAddress());
        });

        it("should update state", async function () {
          // Set new minumum dispute period
          await configHandler.connect(deployer).setMaxPremintedVouchers(maxPremintedVouchers);

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getMaxPremintedVouchers()).to.equal(maxPremintedVouchers);
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new value, expecting revert
            await expect(configHandler.connect(rando).setMaxPremintedVouchers(maxPremintedVouchers)).to.revertedWith(
              RevertReasons.ACCESS_DENIED
            );
          });

          it("maxPremintedVouchers is zero", async function () {
            maxPremintedVouchers = 0;
            await expect(configHandler.connect(deployer).setMaxPremintedVouchers(maxPremintedVouchers)).to.revertedWith(
              RevertReasons.VALUE_ZERO_NOT_ALLOWED
            );
          });
        });
      });

      context("👉 setAccessControllerAddress()", async function () {
        let newAccessController;
        beforeEach(async function () {
          // set new value
          newAccessController = accounts[9];
        });

        it("should emit an AccessControllerAddressChanged event", async function () {
          // Set new access controller address
          await expect(
            configHandler.connect(deployer).setAccessControllerAddress(await newAccessController.getAddress())
          )
            .to.emit(configHandler, "AccessControllerAddressChanged")
            .withArgs(await newAccessController.getAddress(), await deployer.getAddress());
        });

        it("should update state", async function () {
          // Set new access controller address
          await configHandler.connect(deployer).setAccessControllerAddress(await newAccessController.getAddress());

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getAccessControllerAddress()).to.equal(
            await newAccessController.getAddress()
          );
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new value, expecting revert
            await expect(
              configHandler.connect(rando).setAccessControllerAddress(await newAccessController.getAddress())
            ).to.revertedWith(RevertReasons.ACCESS_DENIED);
          });

          it("_accessControllerAddress is the zero address", async function () {
            // Attempt to set new value, expecting revert
            await expect(configHandler.connect(deployer).setAccessControllerAddress(ZeroAddress)).to.revertedWith(
              RevertReasons.INVALID_ADDRESS
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
          await treasury.getAddress(),
          "Invalid treasury address"
        );
        expect(await configHandler.connect(rando).getTokenAddress()).to.equal(
          await token.getAddress(),
          "Invalid token address"
        );
        expect(await configHandler.connect(rando).getVoucherBeaconAddress()).to.equal(
          await beacon.getAddress(),
          "Invalid voucher beacon address"
        );

        const proxyAddress = await calculateBosonProxyAddress(await protocolDiamond.getAddress());
        expect(await configHandler.connect(rando).getBeaconProxyAddress()).to.equal(
          proxyAddress,
          "Invalid voucher proxy address"
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
          ZeroAddress,
          "Invalid auth token contract address"
        );
        expect(await configHandler.connect(rando).getAuthTokenContract(AuthTokenType.ENS)).to.equal(
          ZeroAddress,
          "Invalid auth token contract address"
        );
        expect(await configHandler.connect(rando).getAuthTokenContract(AuthTokenType.Custom)).to.equal(
          ZeroAddress,
          "Invalid auth token contract address"
        );
        expect(await configHandler.connect(rando).getMaxExchangesPerBatch()).to.equal(
          maxExchangesPerBatch,
          "Invalid max exchanges per batch"
        );
        expect(await configHandler.connect(rando).getMinResolutionPeriod()).to.equal(
          minResolutionPeriod,
          "Invalid min resolution period"
        );
        expect(await configHandler.connect(rando).getMaxResolutionPeriod()).to.equal(
          maxResolutionPeriod,
          "Invalid max resolution period"
        );
        expect(await configHandler.connect(rando).getMinDisputePeriod()).to.equal(
          minDisputePeriod,
          "Invalid min dispute period"
        );
        expect(await configHandler.connect(rando).getMaxPremintedVouchers()).to.equal(
          maxPremintedVouchers,
          "Invalid max preminted vouchers"
        );
      });
    });
  });
});
