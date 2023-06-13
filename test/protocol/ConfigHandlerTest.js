const { ethers } = require("hardhat");
const { expect } = require("chai");

const Role = require("../../scripts/domain/Role");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { oneWeek, oneMonth, maxPriorityFeePerGas } = require("../util/constants");
const AuthTokenType = require("../../scripts/domain/AuthTokenType");
const { getFacetsWithArgs, getSnapshot, revertToSnapshot } = require("../util/utils");
const { deployAndCutFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");

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
    maxRoyaltyPecentage,
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
    accounts = await ethers.getSigners();
    [deployer, rando, token, treasury, beacon, proxy] = accounts;

    // Deploy the Protocol Diamond
    [protocolDiamond, , , , accessController] = await deployProtocolDiamond(maxPriorityFeePerGas);

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
    maxResolutionPeriod = oneMonth;
    minDisputePeriod = oneWeek;
    maxPremintedVouchers = 10000;

    // Cast Diamond to IERC165
    erc165 = await ethers.getContractAt("ERC165Facet", protocolDiamond.address);

    // Cast Diamond to IBosonConfigHandler
    configHandler = await ethers.getContractAt("IBosonConfigHandler", protocolDiamond.address);

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
          protocolDiamond.address,
          facetsToDeploy,
          maxPriorityFeePerGas
        );

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
          .to.emit(configHandler, "MaxEscalationResponsePeriodChanged")
          .withArgs(maxEscalationResponsePeriod, deployer.address);

        await expect(cutTransaction)
          .to.emit(configHandler, "BuyerEscalationFeePercentageChanged")
          .withArgs(buyerEscalationDepositPercentage, deployer.address);

        await expect(cutTransaction)
          .to.emit(configHandler, "MaxRoyaltyPercentageChanged")
          .withArgs(maxRoyaltyPecentage, deployer.address);

        await expect(cutTransaction)
          .to.emit(configHandler, "MaxResolutionPeriodChanged")
          .withArgs(maxResolutionPeriod, deployer.address);

        await expect(cutTransaction)
          .to.emit(configHandler, "MinDisputePeriodChanged")
          .withArgs(minDisputePeriod, deployer.address);
      });
    });
  });

  describe("After deploy tests", async function () {
    before(async function () {
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
      await deployAndCutFacets(protocolDiamond.address, facetsToDeploy, maxPriorityFeePerGas);

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

          it("token address is the zero address", async function () {
            // Attempt to set new token address, expecting revert
            await expect(configHandler.connect(deployer).setTokenAddress(ethers.constants.AddressZero)).to.revertedWith(
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

          it("treasury address is the zero address", async function () {
            // Attempt to set new treasury address, expecting revert
            await expect(
              configHandler.connect(deployer).setTreasuryAddress(ethers.constants.AddressZero)
            ).to.revertedWith(RevertReasons.INVALID_ADDRESS);
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

          it("voucher beacon address is the zero address", async function () {
            // Attempt to set new beacon address, expecting revert
            await expect(
              configHandler.connect(deployer).setVoucherBeaconAddress(ethers.constants.AddressZero)
            ).to.revertedWith(RevertReasons.INVALID_ADDRESS);
          });
        });
      });

      context("👉 setBeaconProxyAddress()", async function () {
        let proxy;
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

          it("beacon proxy address is the zero address", async function () {
            // Attempt to set new proxy address, expecting revert
            await expect(
              configHandler.connect(deployer).setBeaconProxyAddress(ethers.constants.AddressZero)
            ).to.revertedWith(RevertReasons.INVALID_ADDRESS);
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
        let protocolFeeFlatBoson;
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

      context("👉 setMaxEscalationResponsePeriod()", async function () {
        let maxEscalationResponsePeriod;
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
        let maxRoyaltyPecentage;
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

          it("_authTokenType is None", async function () {
            // Attempt to set new auth token contract, expecting revert
            await expect(
              configHandler.connect(deployer).setAuthTokenContract(AuthTokenType.None, authTokenContract.address)
            ).to.revertedWith(RevertReasons.INVALID_AUTH_TOKEN_TYPE);
          });

          it("_authTokenType is Custom", async function () {
            // Attempt to set new auth token contract, expecting revert
            await expect(
              configHandler.connect(deployer).setAuthTokenContract(AuthTokenType.Custom, authTokenContract.address)
            ).to.revertedWith(RevertReasons.INVALID_AUTH_TOKEN_TYPE);
          });

          it("_authTokenContract is the zero address", async function () {
            // Attempt to set new auth token contract, expecting revert
            await expect(
              configHandler.connect(deployer).setAuthTokenContract(AuthTokenType.ENS, ethers.constants.AddressZero)
            ).to.revertedWith(RevertReasons.INVALID_ADDRESS);
          });
        });
      });

      context("👉 setMaxResolutionPeriod()", async function () {
        let maxResolutionPeriod;
        beforeEach(async function () {
          // set new value
          maxResolutionPeriod = ethers.BigNumber.from(oneMonth).add(oneWeek);
        });

        it("should emit a MaxResolutionPeriodChanged event", async function () {
          // Set new resolution period
          await expect(configHandler.connect(deployer).setMaxResolutionPeriod(maxResolutionPeriod))
            .to.emit(configHandler, "MaxResolutionPeriodChanged")
            .withArgs(maxResolutionPeriod, deployer.address);
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
          minDisputePeriod = ethers.BigNumber.from(oneMonth).sub(oneWeek);
        });

        it("should emit a MinDisputePeriodChanged event", async function () {
          // Set new minumum dispute period
          await expect(configHandler.connect(deployer).setMinDisputePeriod(minDisputePeriod))
            .to.emit(configHandler, "MinDisputePeriodChanged")
            .withArgs(minDisputePeriod, deployer.address);
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

      context("👉 setAccessControllerAddress()", async function () {
        let newAccessController;
        beforeEach(async function () {
          // set new value
          newAccessController = accounts[9];
        });

        it("should emit an AccessControllerAddressChanged event", async function () {
          // Set new access controller address
          await expect(configHandler.connect(deployer).setAccessControllerAddress(newAccessController.address))
            .to.emit(configHandler, "AccessControllerAddressChanged")
            .withArgs(newAccessController.address, deployer.address);
        });

        it("should update state", async function () {
          // Set new access controller address
          await configHandler.connect(deployer).setAccessControllerAddress(newAccessController.address);

          // Verify that new value is stored
          expect(await configHandler.connect(rando).getAccessControllerAddress()).to.equal(newAccessController.address);
        });

        context("💔 Revert Reasons", async function () {
          it("caller is not the admin", async function () {
            // Attempt to set new value, expecting revert
            await expect(
              configHandler.connect(rando).setAccessControllerAddress(newAccessController.address)
            ).to.revertedWith(RevertReasons.ACCESS_DENIED);
          });

          it("_accessControllerAddress is the zero address", async function () {
            // Attempt to set new value, expecting revert
            await expect(
              configHandler.connect(deployer).setAccessControllerAddress(ethers.constants.AddressZero)
            ).to.revertedWith(RevertReasons.INVALID_ADDRESS);
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
        expect(await configHandler.connect(rando).getMaxRoyaltyPecentage()).to.equal(
          maxRoyaltyPecentage,
          "Invalid max royalty percentage"
        );
        //setAuthTokenContract is not called in the initialize function
        expect(await configHandler.connect(rando).getAuthTokenContract(AuthTokenType.Lens)).to.equal(
          ethers.constants.AddressZero,
          "Invalid auth token contract address"
        );
        expect(await configHandler.connect(rando).getAuthTokenContract(AuthTokenType.ENS)).to.equal(
          ethers.constants.AddressZero,
          "Invalid auth token contract address"
        );
        expect(await configHandler.connect(rando).getAuthTokenContract(AuthTokenType.Custom)).to.equal(
          ethers.constants.AddressZero,
          "Invalid auth token contract address"
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
