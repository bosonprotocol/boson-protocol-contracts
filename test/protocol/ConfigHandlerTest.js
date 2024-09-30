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
  let accounts, deployer, rando, token, treasury, beacon, priceDiscovery;
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
    maxRoyaltyPercentage,
    minResolutionPeriod,
    maxResolutionPeriod,
    minDisputePeriod,
    maxPremintedVouchers;
  let protocolFeePercentage, protocolFeeFlatBoson;
  let erc165, protocolDiamond, accessController, configHandler;
  let snapshotId;
  let bosonErrors;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();

    // Make accounts available
    accounts = await getSigners();
    [deployer, rando, token, treasury, beacon, priceDiscovery] = accounts;

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
    maxRoyaltyPercentage = 1000; // 10%
    minResolutionPeriod = oneWeek;
    maxResolutionPeriod = oneMonth;
    minDisputePeriod = oneWeek;
    maxPremintedVouchers = 10000;

    // Cast Diamond to IERC165
    erc165 = await getContractAt("ERC165Facet", await protocolDiamond.getAddress());

    // Cast Diamond to IBosonConfigHandler
    configHandler = await getContractAt("IBosonConfigHandler", await protocolDiamond.getAddress());

    bosonErrors = await getContractAt("BosonErrors", await protocolDiamond.getAddress());

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
            priceDiscovery: priceDiscovery.address,
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
            maxRoyaltyPercentage,

            minResolutionPeriod,
            maxResolutionPeriod,
            minDisputePeriod,
            maxPremintedVouchers,
          },
          //Protocol fees
          protocolFeePercentage,
          protocolFeeFlatBoson,
          buyerEscalationDepositPercentage,
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
          .to.emit(configHandler, "PriceDiscoveryAddressChanged")
          .withArgs(priceDiscovery.address, await deployer.getAddress());

        await expect(cutTransaction)
          .to.emit(configHandler, "ProtocolFeePercentageChanged")
          .withArgs(protocolFeePercentage, await deployer.getAddress());

        await expect(cutTransaction)
          .to.emit(configHandler, "ProtocolFeeFlatBosonChanged")
          .withArgs(protocolFeeFlatBoson, await deployer.getAddress());

        await expect(cutTransaction)
          .to.emit(configHandler, "MaxEscalationResponsePeriodChanged")
          .withArgs(maxEscalationResponsePeriod, await deployer.getAddress());

        await expect(cutTransaction)
          .to.emit(configHandler, "BuyerEscalationFeePercentageChanged")
          .withArgs(buyerEscalationDepositPercentage, await deployer.getAddress());

        await expect(cutTransaction)
          .to.emit(configHandler, "MaxRoyaltyPercentageChanged")
          .withArgs(maxRoyaltyPercentage, await deployer.getAddress());

        await expect(cutTransaction)
          .to.emit(configHandler, "MaxResolutionPeriodChanged")
          .withArgs(maxResolutionPeriod, await deployer.getAddress());

        await expect(cutTransaction)
          .to.emit(configHandler, "MinDisputePeriodChanged")
          .withArgs(minDisputePeriod, await deployer.getAddress());
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
          priceDiscovery: priceDiscovery.address,
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
          maxRoyaltyPercentage,
          minResolutionPeriod,
          maxResolutionPeriod,
          minDisputePeriod,
          maxPremintedVouchers,
        },
        // Protocol fees
        protocolFeePercentage,
        protocolFeeFlatBoson,
        buyerEscalationDepositPercentage,
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
            await expect(
              configHandler.connect(rando).setTokenAddress(await token.getAddress())
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.ACCESS_DENIED);
          });

          it("token address is the zero address", async function () {
            // Attempt to set new token address, expecting revert
            await expect(configHandler.connect(deployer).setTokenAddress(ZeroAddress)).to.revertedWithCustomError(
              bosonErrors,
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
            await expect(
              configHandler.connect(rando).setTreasuryAddress(await treasury.getAddress())
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.ACCESS_DENIED);
          });

          it("treasury address is the zero address", async function () {
            // Attempt to set new treasury address, expecting revert
            await expect(configHandler.connect(deployer).setTreasuryAddress(ZeroAddress)).to.revertedWithCustomError(
              bosonErrors,
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
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.ACCESS_DENIED);
          });

          it("voucher beacon address is the zero address", async function () {
            // Attempt to set new beacon address, expecting revert
            await expect(
              configHandler.connect(deployer).setVoucherBeaconAddress(ZeroAddress)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_ADDRESS);
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
            await expect(
              configHandler.connect(rando).setBeaconProxyAddress(await proxy.getAddress())
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.ACCESS_DENIED);
          });

          it("beacon proxy address is the zero address", async function () {
            // Attempt to set new proxy address, expecting revert
            await expect(configHandler.connect(deployer).setBeaconProxyAddress(ZeroAddress)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.INVALID_ADDRESS
            );
          });
        });
      });

      context("👉 setPriceDiscoveryAddress()", async function () {
        let priceDiscovery;
        beforeEach(async function () {
          // set new value for price discovery address
          priceDiscovery = accounts[9];
        });

        it("should emit a PriceDiscoveryAddressChanged event", async function () {
          // Set new price discovery address, testing for the event
          await expect(configHandler.connect(deployer).setPriceDiscoveryAddress(await priceDiscovery.getAddress()))
            .to.emit(configHandler, "PriceDiscoveryAddressChanged")
            .withArgs(await priceDiscovery.getAddress(), await deployer.getAddress());
        });

        it("should update state", async function () {
          // Set new price discovery address
          await configHandler.connect(deployer).setPriceDiscoveryAddress(await priceDiscovery.getAddress());

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getPriceDiscoveryAddress()).to.equal(
            await priceDiscovery.getAddress()
          );
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new price discovery address, expecting revert
            await expect(
              configHandler.connect(rando).setPriceDiscoveryAddress(await priceDiscovery.getAddress())
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.ACCESS_DENIED);
          });

          it("price discovery address is the zero address", async function () {
            // Attempt to set new price discovery address, expecting revert
            await expect(
              configHandler.connect(deployer).setPriceDiscoveryAddress(ZeroAddress)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_ADDRESS);
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
            await expect(
              configHandler.connect(rando).setProtocolFeePercentage(protocolFeePercentage)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.ACCESS_DENIED);
          });

          it("protocolFeePercentage must be less than 10000", async function () {
            // Attempt to set new protocolFeePercentage value, expecting revert
            protocolFeePercentage = 10001;
            await expect(
              configHandler.connect(deployer).setProtocolFeePercentage(protocolFeePercentage)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.FEE_PERCENTAGE_INVALID);
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
            await expect(
              configHandler.connect(rando).setProtocolFeeFlatBoson(protocolFeeFlatBoson)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.ACCESS_DENIED);
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
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.ACCESS_DENIED);
          });

          it("maxEscalationResponsePeriod is zero", async function () {
            maxEscalationResponsePeriod = 0;
            await expect(
              configHandler.connect(deployer).setMaxEscalationResponsePeriod(maxEscalationResponsePeriod)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.VALUE_ZERO_NOT_ALLOWED);
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
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.ACCESS_DENIED);
          });

          it("protocolFeePercentage must be less than 10000", async function () {
            // Attempt to set new buyer escalation deposit percentage, expecting revert
            buyerEscalationDepositPercentage = 10001;
            await expect(
              configHandler.connect(deployer).setBuyerEscalationDepositPercentage(buyerEscalationDepositPercentage)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.FEE_PERCENTAGE_INVALID);
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
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.ACCESS_DENIED);
          });

          it("maxTotalOfferFeePercentage must be less than 10000", async function () {
            // Attempt to set new value for Max Total Offer Fee Percentage, expecting revert
            maxTotalOfferFeePercentage = 10001;
            await expect(
              configHandler.connect(deployer).setMaxTotalOfferFeePercentage(maxTotalOfferFeePercentage)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.FEE_PERCENTAGE_INVALID);
          });
        });
      });

      context("👉 setMaxRoyaltyPercentage()", async function () {
        let maxRoyaltyPercentage;
        beforeEach(async function () {
          // set new value for Max Royalty Percentage
          maxRoyaltyPercentage = 250;
        });

        it("should emit a MaxRoyaltyPercentageChanged event", async function () {
          // set new value for Max Royalty Percentage, testing for the event
          await expect(configHandler.connect(deployer).setMaxRoyaltyPercentage(maxRoyaltyPercentage))
            .to.emit(configHandler, "MaxRoyaltyPercentageChanged")
            .withArgs(maxRoyaltyPercentage, await deployer.getAddress());
        });

        it("should update state", async function () {
          // set new value for Max Royalty Percentage
          await configHandler.connect(deployer).setMaxRoyaltyPercentage(maxRoyaltyPercentage);

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getMaxRoyaltyPercentage()).to.equal(maxRoyaltyPercentage);
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new value for Max Royalty Percentage, expecting revert
            await expect(
              configHandler.connect(rando).setMaxRoyaltyPercentage(maxRoyaltyPercentage)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.ACCESS_DENIED);
          });

          it("maxRoyaltyPercentage must be less than 10000", async function () {
            // Attempt to set new value for Max Royalty Percentage, expecting revert
            maxRoyaltyPercentage = 10001;
            await expect(
              configHandler.connect(deployer).setMaxRoyaltyPercentage(maxRoyaltyPercentage)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.FEE_PERCENTAGE_INVALID);
          });

          it("maxRoyaltyPercentage is zero", async function () {
            maxRoyaltyPercentage = 0;
            await expect(
              configHandler.connect(deployer).setMaxRoyaltyPercentage(maxRoyaltyPercentage)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.VALUE_ZERO_NOT_ALLOWED);
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
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.ACCESS_DENIED);
          });

          it("_authTokenType is None", async function () {
            // Attempt to set new auth token contract, expecting revert
            await expect(
              configHandler
                .connect(deployer)
                .setAuthTokenContract(AuthTokenType.None, await authTokenContract.getAddress())
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_AUTH_TOKEN_TYPE);
          });

          it("_authTokenType is Custom", async function () {
            // Attempt to set new auth token contract, expecting revert
            await expect(
              configHandler
                .connect(deployer)
                .setAuthTokenContract(AuthTokenType.Custom, await authTokenContract.getAddress())
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_AUTH_TOKEN_TYPE);
          });

          it("_authTokenContract is the zero address", async function () {
            // Attempt to set new auth token contract, expecting revert
            await expect(
              configHandler.connect(deployer).setAuthTokenContract(AuthTokenType.ENS, ZeroAddress)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_ADDRESS);
          });
        });
      });

      context("👉 setMinResolutionPeriod()", async function () {
        let minResolutionPeriod;
        beforeEach(async function () {
          // set new value
          minResolutionPeriod = oneWeek;
        });

        it("should emit a MinResolutionPeriodChanged event", async function () {
          // Set new resolution period
          await expect(configHandler.connect(deployer).setMinResolutionPeriod(minResolutionPeriod))
            .to.emit(configHandler, "MinResolutionPeriodChanged")
            .withArgs(minResolutionPeriod, await deployer.getAddress());
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
            await expect(
              configHandler.connect(rando).setMinResolutionPeriod(minResolutionPeriod)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.ACCESS_DENIED);
          });

          it("minResolutionPeriod is zero", async function () {
            minResolutionPeriod = 0;
            await expect(
              configHandler.connect(deployer).setMinResolutionPeriod(minResolutionPeriod)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.VALUE_ZERO_NOT_ALLOWED);
          });

          it("minResolutionPeriod is greater than maxResolutionPeriod", async function () {
            const maxResolutionPeriod = oneMonth;
            await configHandler.connect(deployer).setMaxResolutionPeriod(maxResolutionPeriod);

            minResolutionPeriod = maxResolutionPeriod + 1n;
            await expect(
              configHandler.connect(deployer).setMinResolutionPeriod(minResolutionPeriod)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_RESOLUTION_PERIOD);
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
            await expect(
              configHandler.connect(rando).setMaxResolutionPeriod(maxResolutionPeriod)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.ACCESS_DENIED);
          });

          it("maxResolutionPeriod is zero", async function () {
            maxResolutionPeriod = 0;
            await expect(
              configHandler.connect(deployer).setMaxResolutionPeriod(maxResolutionPeriod)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.VALUE_ZERO_NOT_ALLOWED);
          });

          it("maxResolutionPeriod is less than minResolutionPeriod", async function () {
            const minResolutionPeriod = oneWeek;
            await configHandler.connect(deployer).setMinResolutionPeriod(minResolutionPeriod);

            const maxResolutionPeriod = minResolutionPeriod - 1n;
            await expect(
              configHandler.connect(deployer).setMaxResolutionPeriod(maxResolutionPeriod)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_RESOLUTION_PERIOD);
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
            await expect(configHandler.connect(rando).setMinDisputePeriod(minDisputePeriod)).to.revertedWithCustomError(
              bosonErrors,
              RevertReasons.ACCESS_DENIED
            );
          });

          it("minDisputePeriod is zero", async function () {
            minDisputePeriod = 0;
            await expect(
              configHandler.connect(deployer).setMinDisputePeriod(minDisputePeriod)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.VALUE_ZERO_NOT_ALLOWED);
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
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.ACCESS_DENIED);
          });

          it("_accessControllerAddress is the zero address", async function () {
            // Attempt to set new value, expecting revert
            await expect(
              configHandler.connect(deployer).setAccessControllerAddress(ZeroAddress)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INVALID_ADDRESS);
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
        expect(await configHandler.connect(rando).getPriceDiscoveryAddress()).to.equal(
          priceDiscovery.address,
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
        expect(await configHandler.connect(rando).getMaxEscalationResponsePeriod()).to.equal(
          maxEscalationResponsePeriod,
          "Invalid max escalatio response period"
        );
        expect(await configHandler.connect(rando).getBuyerEscalationDepositPercentage()).to.equal(
          buyerEscalationDepositPercentage,
          "Invalid buyer escalation deposit"
        );
        expect(await configHandler.connect(rando).getMaxTotalOfferFeePercentage()).to.equal(
          maxTotalOfferFeePercentage,
          "Invalid max total offer fee percentage"
        );
        expect(await configHandler.connect(rando).getMaxRoyaltyPercentage()).to.equal(
          maxRoyaltyPercentage,
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
      });
    });
  });
});
