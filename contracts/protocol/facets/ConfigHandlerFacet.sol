// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import "../../domain/BosonConstants.sol";
import { IBosonConfigHandler } from "../../interfaces/handlers/IBosonConfigHandler.sol";
import { IAccessControl } from "../../interfaces/IAccessControl.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { ProtocolBase } from "../bases/ProtocolBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { EIP712Lib } from "../libs/EIP712Lib.sol";
import { BeaconClientProxy } from "../../protocol/clients/proxy/BeaconClientProxy.sol";

/**
 * @title ConfigHandlerFacet
 *
 * @notice Handles management and queries of various protocol-related settings.
 */
contract ConfigHandlerFacet is IBosonConfigHandler, ProtocolBase {
    /**
     * @notice Initializes facet.
     * This function is callable only once.
     *
     * @param _addresses - struct of Boson Protocol addresses (Boson Token (ERC-20) contract, treasury, and Voucher contract)
     * @param _limits - struct with Boson Protocol limits
     * @param defaultFeePercentage - efault percentage that will be taken as a fee from the net of a Boson Protocol exchange.
     * @param flatBosonFee - flat fee taken for exchanges in $BOSON
     * @param buyerEscalationDepositPercentage - buyer escalation deposit percentage
     */
    function initialize(
        ProtocolLib.ProtocolAddresses calldata _addresses,
        ProtocolLib.ProtocolLimits calldata _limits,
        uint256 defaultFeePercentage,
        uint256 flatBosonFee,
        uint256 buyerEscalationDepositPercentage
    ) public onlyUninitialized(type(IBosonConfigHandler).interfaceId) {
        // Register supported interfaces
        DiamondLib.addSupportedInterface(type(IBosonConfigHandler).interfaceId);

        // Initialize protocol config params
        // _addresses.beaconProxy is ignored, since it's deployed later in this function
        setTokenAddress(_addresses.token);
        setTreasuryAddress(_addresses.treasury);
        setVoucherBeaconAddress(_addresses.voucherBeacon);
        setPriceDiscoveryAddress(_addresses.priceDiscovery);
        setProtocolFeePercentage(defaultFeePercentage); // this sets the default fee percentage if fee table is not configured for the exchange token
        setProtocolFeeFlatBoson(flatBosonFee);
        setMaxEscalationResponsePeriod(_limits.maxEscalationResponsePeriod);
        setBuyerEscalationDepositPercentage(buyerEscalationDepositPercentage);
        setMaxTotalOfferFeePercentage(_limits.maxTotalOfferFeePercentage);
        setMaxRoyaltyPercentage(_limits.maxRoyaltyPercentage);
        setMaxResolutionPeriod(_limits.maxResolutionPeriod);
        setMinResolutionPeriod(_limits.minResolutionPeriod);
        setMinDisputePeriod(_limits.minDisputePeriod);

        // Initialize protocol counters
        ProtocolLib.ProtocolCounters storage pc = protocolCounters();
        pc.nextAccountId = 1;
        pc.nextBundleId = 1;
        pc.nextExchangeId = 1;
        pc.nextGroupId = 1;
        pc.nextOfferId = 1;
        pc.nextTwinId = 1;

        // Initialize reentrancyStatus
        protocolStatus().reentrancyStatus = NOT_ENTERED;

        // Initialize protocol meta-transaction config params
        ProtocolLib.ProtocolMetaTxInfo storage pmti = protocolMetaTxInfo();
        pmti.domainSeparator = EIP712Lib.buildDomainSeparator(PROTOCOL_NAME, PROTOCOL_VERSION);
        pmti.cachedChainId = block.chainid;

        // Deploy Boson Voucher proxy contract
        address beaconProxy = address(new BeaconClientProxy{ salt: VOUCHER_PROXY_SALT }());
        setBeaconProxyAddress(beaconProxy);
    }

    /**
     * @notice Sets the Boson Token (ERC-20 contract) address.
     *
     * Emits a TokenAddressChanged event if successful.
     *
     * Reverts if _tokenAddress is the zero address
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _tokenAddress - the Boson Token (ERC-20 contract) address
     */
    function setTokenAddress(address payable _tokenAddress) public override onlyRole(ADMIN) nonReentrant {
        checkNonZeroAddress(_tokenAddress);
        protocolAddresses().token = _tokenAddress;
        emit TokenAddressChanged(_tokenAddress, msgSender());
    }

    /**
     * @notice Gets the Boson Token (ERC-20 contract) address.
     *
     * @return the Boson Token (ERC-20 contract) address
     */
    function getTokenAddress() external view override returns (address payable) {
        return protocolAddresses().token;
    }

    /**
     * @notice Sets the Boson Protocol multi-sig wallet address.
     *
     * Emits a TreasuryAddressChanged event if successful.
     *
     * Reverts if _treasuryAddress is the zero address
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _treasuryAddress - the the multi-sig wallet address
     */
    function setTreasuryAddress(address payable _treasuryAddress) public override onlyRole(ADMIN) nonReentrant {
        checkNonZeroAddress(_treasuryAddress);
        protocolAddresses().treasury = _treasuryAddress;
        emit TreasuryAddressChanged(_treasuryAddress, msgSender());
    }

    /**
     * @notice Gets the Boson Protocol multi-sig wallet address.
     *
     * @return the Boson Protocol multi-sig wallet address
     */
    function getTreasuryAddress() external view override returns (address payable) {
        return protocolAddresses().treasury;
    }

    /**
     * @notice Sets the Boson Voucher beacon contract address.
     *
     * Emits a VoucherBeaconAddressChanged event if successful.
     *
     * Reverts if _voucherBeaconAddress is the zero address
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _voucherBeaconAddress - the Boson Voucher beacon contract address
     */
    function setVoucherBeaconAddress(address _voucherBeaconAddress) public override onlyRole(ADMIN) nonReentrant {
        checkNonZeroAddress(_voucherBeaconAddress);
        protocolAddresses().voucherBeacon = _voucherBeaconAddress;
        emit VoucherBeaconAddressChanged(_voucherBeaconAddress, msgSender());
    }

    /**
     * @notice Gets the Boson Voucher beacon contract address.
     *
     * @return the Boson Voucher beacon contract address
     */
    function getVoucherBeaconAddress() external view override returns (address) {
        return protocolAddresses().voucherBeacon;
    }

    /**
     * @notice Sets the Boson Voucher reference proxy implementation address.
     *
     * Emits a BeaconProxyAddressChanged event if successful.
     *
     * Reverts if _beaconProxyAddress is the zero address
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _beaconProxyAddress - reference proxy implementation address
     */
    function setBeaconProxyAddress(address _beaconProxyAddress) public override onlyRole(ADMIN) nonReentrant {
        checkNonZeroAddress(_beaconProxyAddress);
        protocolAddresses().beaconProxy = _beaconProxyAddress;
        emit BeaconProxyAddressChanged(_beaconProxyAddress, msgSender());
    }

    /**
     * @notice Gets the beaconProxy address.
     *
     * @return the beaconProxy address
     */
    function getBeaconProxyAddress() external view override returns (address) {
        return protocolAddresses().beaconProxy;
    }

    /**
     * @notice Sets the Boson Price Discovery contract address.
     *
     * Emits a PriceDiscoveryAddressChanged event if successful.
     *
     * Reverts if _priceDiscovery is the zero address
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _priceDiscovery - the Boson Price Discovery contract address
     */
    function setPriceDiscoveryAddress(address _priceDiscovery) public override onlyRole(ADMIN) nonReentrant {
        checkNonZeroAddress(_priceDiscovery);
        protocolAddresses().priceDiscovery = _priceDiscovery;
        emit PriceDiscoveryAddressChanged(_priceDiscovery, msgSender());
    }

    /**
     * @notice Gets the Boson Price Discovery contract address.
     *
     * @return the Boson Price Discovery contract address
     */
    function getPriceDiscoveryAddress() external view override returns (address) {
        return protocolAddresses().priceDiscovery;
    }

    /**
     * @notice Sets the protocol fee percentage.
     *
     * Emits a ProtocolFeePercentageChanged event if successful.
     *
     * Reverts if the _protocolFeePercentage is greater than 10000.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _protocolFeePercentage - the percentage that will be taken as a fee from the net of a Boson Protocol sale or auction (after royalties)
     *
     * N.B. Represent percentage value as an unsigned int by multiplying the percentage by 100:
     * e.g, 1.75% = 175, 100% = 10000
     */
    function setProtocolFeePercentage(uint256 _protocolFeePercentage) public override onlyRole(ADMIN) nonReentrant {
        // Make sure percentage is less than 10000
        checkMaxPercententage(_protocolFeePercentage);

        // Store fee percentage
        protocolFees().percentage = _protocolFeePercentage;

        // Notify watchers of state change
        emit ProtocolFeePercentageChanged(_protocolFeePercentage, msgSender());
    }

    /**
     * @notice Sets the feeTable for a specific token given price ranges and fee tiers for
     * the corresponding price ranges.
     *
     * Reverts if the number of fee percentages does not match the number of price ranges.
     * Reverts if token is Zero address.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _tokenAddress - the address of the token
     * @param _priceRanges - array of token price ranges
     * @param _feePercentages - array of fee percentages corresponding to each price range
     */
    function setProtocolFeeTable(
        address _tokenAddress,
        uint256[] calldata _priceRanges,
        uint256[] calldata _feePercentages
    ) external override onlyRole(ADMIN) nonReentrant {
        if (_priceRanges.length != _feePercentages.length) revert ArrayLengthMismatch();
        // Clear existing price ranges and percentage tiers
        delete protocolFees().tokenPriceRanges[_tokenAddress];
        delete protocolFees().tokenFeePercentages[_tokenAddress];

        if (_priceRanges.length != 0) {
            setTokenPriceRanges(_tokenAddress, _priceRanges);
            setTokenFeePercentages(_tokenAddress, _feePercentages);
        }
        emit FeeTableUpdated(_tokenAddress, _priceRanges, _feePercentages, msgSender());
    }

    /**
     * @notice Gets the default protocol fee percentage.
     *
     * @return the default protocol fee percentage
     */
    function getProtocolFeePercentage() external view override returns (uint256) {
        return protocolFees().percentage;
    }

    /**
     * @notice Retrieves the protocol fee percentage for a given token and price.
     *
     * @dev This function calculates the protocol fee based on the token and price.
     * If the token has a custom fee table, it applies the corresponding fee percentage
     * for the price range. If the token does not have a custom fee table, it falls back
     * to the default protocol fee percentage. If the exchange token is BOSON,
     * this function returns the flatBoson fee
     *
     * @param _exchangeToken - The address of the token being used for the exchange.
     * @param _price - The price of the item or service in the exchange.
     *
     * @return The protocol fee amount based on the token and the price.
     */
    function getProtocolFee(address _exchangeToken, uint256 _price) external view override returns (uint256) {
        return _getProtocolFee(_exchangeToken, _price);
    }

    /**
     * @notice Sets the flat protocol fee for exchanges in $BOSON.
     *
     * Emits a ProtocolFeeFlatBosonChanged event if successful.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _protocolFeeFlatBoson - the flat fee taken for exchanges in $BOSON
     *
     */
    function setProtocolFeeFlatBoson(uint256 _protocolFeeFlatBoson) public override onlyRole(ADMIN) nonReentrant {
        // Store fee percentage
        protocolFees().flatBoson = _protocolFeeFlatBoson;

        // Notify watchers of state change
        emit ProtocolFeeFlatBosonChanged(_protocolFeeFlatBoson, msgSender());
    }

    /**
     * @notice Gets the flat protocol fee for exchanges in $BOSON.
     *
     * @return the flat fee taken for exchanges in $BOSON
     */
    function getProtocolFeeFlatBoson() external view override returns (uint256) {
        return protocolFees().flatBoson;
    }

    /**
     * @notice Sets the maximum escalation response period a dispute resolver can specify.
     *
     * Emits a MaxEscalationResponsePeriodChanged event if successful.
     *
     * Reverts if the _maxEscalationResponsePeriod is zero.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxEscalationResponsePeriod - the maximum escalation response period that a {BosonTypes.DisputeResolver} can specify
     */
    function setMaxEscalationResponsePeriod(
        uint256 _maxEscalationResponsePeriod
    ) public override onlyRole(ADMIN) nonReentrant {
        // Make sure _maxEscalationResponsePeriod is greater than 0
        checkNonZeroValue(_maxEscalationResponsePeriod);

        protocolLimits().maxEscalationResponsePeriod = _maxEscalationResponsePeriod;
        emit MaxEscalationResponsePeriodChanged(_maxEscalationResponsePeriod, msgSender());
    }

    /**
     * @notice Gets the maximum escalation response period a dispute resolver can specify.
     *
     * @return the maximum escalation response period that a {BosonTypes.DisputeResolver} can specify
     */
    function getMaxEscalationResponsePeriod() external view override returns (uint256) {
        return protocolLimits().maxEscalationResponsePeriod;
    }

    /**
     * @notice Sets the total offer fee percentage limit that will validate the sum of (Protocol Fee percentage + Agent Fee percentage) of an offer fee.
     *
     * Emits a MaxTotalOfferFeePercentageChanged event if successful.
     *
     * Reverts if _maxTotalOfferFeePercentage is greater than 10000.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxTotalOfferFeePercentage - the maximum total offer fee percentage
     *
     * N.B. Represent percentage value as an unsigned int by multiplying the percentage by 100:
     * e.g, 1.75% = 175, 100% = 10000
     */
    function setMaxTotalOfferFeePercentage(
        uint16 _maxTotalOfferFeePercentage
    ) public override onlyRole(ADMIN) nonReentrant {
        // Make sure percentage is less than 10000
        checkMaxPercententage(_maxTotalOfferFeePercentage);

        // Store fee percentage
        protocolLimits().maxTotalOfferFeePercentage = _maxTotalOfferFeePercentage;

        // Notify watchers of state change
        emit MaxTotalOfferFeePercentageChanged(_maxTotalOfferFeePercentage, msgSender());
    }

    /**
     * @notice Gets the total offer fee percentage limit that will validate the sum of (Protocol Fee percentage + Agent Fee percentage) of an offer fee.
     *
     * @return the maximum total offer fee percentage
     */
    function getMaxTotalOfferFeePercentage() external view override returns (uint16) {
        return protocolLimits().maxTotalOfferFeePercentage;
    }

    /**
     * @notice Sets the maximum royalty percentage that can be set by the seller.
     *
     * Emits a MaxRoyaltyPercentageChanged event if successful.
     *
     * Reverts if:
     * - The _maxRoyaltyPercentage is zero.
     * - The _maxRoyaltyPercentage is greater than 10000.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxRoyaltyPercentage - the maximum royalty percentage
     *
     * N.B. Represent percentage value as an unsigned int by multiplying the percentage by 100:
     * e.g, 1.75% = 175, 100% = 10000
     */
    function setMaxRoyaltyPercentage(uint16 _maxRoyaltyPercentage) public override onlyRole(ADMIN) nonReentrant {
        // Make sure percentage is greater than 0
        checkNonZeroValue(_maxRoyaltyPercentage);

        // Make sure percentage is less than 10000
        checkMaxPercententage(_maxRoyaltyPercentage);

        // Store fee percentage
        protocolLimits().maxRoyaltyPercentage = _maxRoyaltyPercentage;

        // Notify watchers of state change
        emit MaxRoyaltyPercentageChanged(_maxRoyaltyPercentage, msgSender());
    }

    /**
     * @notice Gets the maximum royalty percentage that can be set by the seller.
     *
     * @return the maximum royalty percentage
     */
    function getMaxRoyaltyPercentage() external view override returns (uint16) {
        return protocolLimits().maxRoyaltyPercentage;
    }

    /**
     * @notice Sets the buyer escalation fee percentage.
     *
     * Emits a BuyerEscalationFeePercentageChanged event if successful.
     *
     * Reverts if the _buyerEscalationDepositPercentage is greater than 10000.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _buyerEscalationDepositPercentage - the percentage of the DR fee that will be charged to buyer if they want to escalate the dispute
     *
     * N.B. Represent percentage value as an unsigned int by multiplying the percentage by 100:
     * e.g, 1.75% = 175, 100% = 10000
     */
    function setBuyerEscalationDepositPercentage(
        uint256 _buyerEscalationDepositPercentage
    ) public override onlyRole(ADMIN) nonReentrant {
        // Make sure percentage is less than 10000
        checkMaxPercententage(_buyerEscalationDepositPercentage);

        // Store fee percentage
        protocolFees().buyerEscalationDepositPercentage = _buyerEscalationDepositPercentage;

        // Notify watchers of state change
        emit BuyerEscalationFeePercentageChanged(_buyerEscalationDepositPercentage, msgSender());
    }

    /**
     * @notice Gets the buyer escalation fee percentage.
     *
     * @return the percentage of the DR fee that will be charged to buyer if they want to escalate the dispute
     */
    function getBuyerEscalationDepositPercentage() external view override returns (uint256) {
        return protocolFees().buyerEscalationDepositPercentage;
    }

    /**
     * @notice Sets the contract address for the given AuthTokenType.
     *
     * Emits an AuthTokenContractChanged event if successful.
     *
     * Reverts if:
     * - _authTokenType is None.
     * - _authTokenType is Custom.
     * - _authTokenContract is the zero address.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _authTokenType - the auth token type, as an Enum value
     * @param _authTokenContract the address of the auth token contract (e.g. Lens or ENS contract address)
     */
    function setAuthTokenContract(
        AuthTokenType _authTokenType,
        address _authTokenContract
    ) external override onlyRole(ADMIN) nonReentrant {
        if (_authTokenType == AuthTokenType.None || _authTokenType == AuthTokenType.Custom)
            revert InvalidAuthTokenType();
        checkNonZeroAddress(_authTokenContract);
        protocolLookups().authTokenContracts[_authTokenType] = _authTokenContract;
        emit AuthTokenContractChanged(_authTokenType, _authTokenContract, msgSender());
    }

    /**
     * @notice Gets the contract address for the given AuthTokenType.
     *
     * @param _authTokenType - the auth token type, as an Enum value
     * @return the address of the auth token contract (e.g. Lens or ENS contract address) for the given AuthTokenType
     */
    function getAuthTokenContract(AuthTokenType _authTokenType) external view returns (address) {
        return protocolLookups().authTokenContracts[_authTokenType];
    }

    /**
     * @notice Sets the minimum resolution period a seller can specify.
     *
     * Emits a MinResolutionPeriodChanged event.
     *
     * Reverts if _minResolutionPeriod is zero.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _minResolutionPeriod - the minimum resolution period that a {BosonTypes.Seller} can specify
     */
    function setMinResolutionPeriod(uint256 _minResolutionPeriod) public override onlyRole(ADMIN) nonReentrant {
        // Make sure _maxResolutionPeriod is greater than 0
        checkNonZeroValue(_minResolutionPeriod);

        // cache protocol limits
        ProtocolLib.ProtocolLimits storage limits = protocolLimits();

        // Make sure _minResolutionPeriod is less than _maxResolutionPeriod
        if (_minResolutionPeriod > limits.maxResolutionPeriod) revert InvalidResolutionPeriod();

        limits.minResolutionPeriod = _minResolutionPeriod;
        emit MinResolutionPeriodChanged(_minResolutionPeriod, msgSender());
    }

    /**
     * @notice Gets the minimum resolution period a seller can specify.
     *
     * @return the minimum resolution period that a {BosonTypes.Seller} can specify
     */
    function getMinResolutionPeriod() external view override returns (uint256) {
        return protocolLimits().minResolutionPeriod;
    }

    /**
     * @notice Sets the maximum resolution period a seller can specify.
     *
     * Emits a MaxResolutionPeriodChanged event if successful.
     *
     * Reverts if the _maxResolutionPeriod is zero.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxResolutionPeriod - the maximum resolution period that a {BosonTypes.Seller} can specify
     */
    function setMaxResolutionPeriod(uint256 _maxResolutionPeriod) public override onlyRole(ADMIN) nonReentrant {
        // Make sure _maxResolutionPeriod is greater than 0
        checkNonZeroValue(_maxResolutionPeriod);

        // cache protocol limits
        ProtocolLib.ProtocolLimits storage limits = protocolLimits();

        // Make sure _maxResolutionPeriod is greater than _minResolutionPeriod
        if (_maxResolutionPeriod < limits.minResolutionPeriod) revert InvalidResolutionPeriod();

        limits.maxResolutionPeriod = _maxResolutionPeriod;
        emit MaxResolutionPeriodChanged(_maxResolutionPeriod, msgSender());
    }

    /**
     * @notice Gets the maximum resolution period a seller can specify.
     *
     * @return the maximum resolution period that a {BosonTypes.Seller} can specify
     */
    function getMaxResolutionPeriod() external view override returns (uint256) {
        return protocolLimits().maxResolutionPeriod;
    }

    /**
     * @notice Sets the minimum dispute period a seller can specify.
     *
     * Emits a MinDisputePeriodChanged event if successful.
     *
     * Reverts if the _minDisputePeriod is zero.
     *
     * @param _minDisputePeriod - the minimum resolution period that a {BosonTypes.Seller} can specify
     */
    function setMinDisputePeriod(uint256 _minDisputePeriod) public override onlyRole(ADMIN) nonReentrant {
        // Make sure _minDisputePeriod is greater than 0
        checkNonZeroValue(_minDisputePeriod);

        protocolLimits().minDisputePeriod = _minDisputePeriod;
        emit MinDisputePeriodChanged(_minDisputePeriod, msgSender());
    }

    /**
     * @notice Gets the minimum dispute period a seller can specify.
     */
    function getMinDisputePeriod() external view override returns (uint256) {
        return protocolLimits().minDisputePeriod;
    }

    /**
     * @notice Sets the access controller address.
     *
     * Emits an AccessControllerAddressChanged event if successful.
     *
     * Reverts if _accessControllerAddress is the zero address
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _accessControllerAddress - access controller address
     */
    function setAccessControllerAddress(
        address _accessControllerAddress
    ) external override onlyRole(ADMIN) nonReentrant {
        checkNonZeroAddress(_accessControllerAddress);
        DiamondLib.diamondStorage().accessController = IAccessControl(_accessControllerAddress);
        emit AccessControllerAddressChanged(_accessControllerAddress, msgSender());
    }

    /**
     * @notice Gets the access controller address.
     *
     * @return the access controller address
     */
    function getAccessControllerAddress() external view returns (address) {
        return address(DiamondLib.diamondStorage().accessController);
    }

    /**
     * @notice Sets the price ranges for a specific token.
     *
     * @param _tokenAddress - the address of the token
     * @param _priceRanges - array of price ranges for the token
     */
    function setTokenPriceRanges(address _tokenAddress, uint256[] calldata _priceRanges) internal {
        for (uint256 i = 1; i < _priceRanges.length; ++i) {
            if(_priceRanges[i] < _priceRanges[i - 1]) revert NonAscendingOrder();
        }
        protocolFees().tokenPriceRanges[_tokenAddress] = _priceRanges;
    }

    /**
     * @notice Sets the fee percentages for a specific token and price ranges.
     *
     * @param _tokenAddress - the address of the token
     * @param _feePercentages - array of fee percentages corresponding to each price range
     */
    function setTokenFeePercentages(address _tokenAddress, uint256[] calldata _feePercentages) internal {
        // Set the fee percentages for the token
        for (uint256 i; i < _feePercentages.length; ++i) {
            checkMaxPercententage(_feePercentages[i]);
        }
        protocolFees().tokenFeePercentages[_tokenAddress] = _feePercentages;
    }

    /**
     * @notice Checks that supplied value is not 0.
     *
     * Reverts if the value is zero
     */
    function checkNonZeroValue(uint256 _value) internal pure {
        if (_value == 0) revert ValueZeroNotAllowed();
    }

    /**
     * @notice Checks that supplied value is not address 0.
     *
     * Reverts if the value is address zero
     */
    function checkNonZeroAddress(address _address) internal pure {
        if (_address == address(0)) revert InvalidAddress();
    }

    /**
     * @notice Checks that supplied value is less or equal to 10000 (100%).
     *
     * Reverts if the value more than 10000
     */
    function checkMaxPercententage(uint256 _percentage) internal pure {
        if (_percentage > HUNDRED_PERCENT) revert InvalidFeePercentage();
    }
}
