// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../../domain/BosonConstants.sol";
import { IBosonConfigHandler } from "../../interfaces/handlers/IBosonConfigHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { ProtocolBase } from "../bases/ProtocolBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { EIP712Lib } from "../libs/EIP712Lib.sol";

/**
 * @title ConfigHandlerFacet
 *
 * @notice Handles management and queries of various protocol-related settings
 */
contract ConfigHandlerFacet is IBosonConfigHandler, ProtocolBase {
    /**
     * @notice Initializes facet.
     * This function is callable only once.
     *
     * @param _addresses - struct of Boson Protocol addresses (Boson Token (ERC-20) contract, treasury, and Voucher contract)
     * @param _limits - struct with Boson Protocol limits
     * @param _fees - struct of Boson Protocol fees
     */
    function initialize(
        ProtocolLib.ProtocolAddresses calldata _addresses,
        ProtocolLib.ProtocolLimits calldata _limits,
        ProtocolLib.ProtocolFees calldata _fees,
        uint16 _buyerEscalationDepositPercentage
    ) public onlyUnInitialized(type(IBosonConfigHandler).interfaceId) {
        // Register supported interfaces
        DiamondLib.addSupportedInterface(type(IBosonConfigHandler).interfaceId);

        // Initialize protocol config params
        setTokenAddress(_addresses.token);
        setTreasuryAddress(_addresses.treasury);
        setVoucherBeaconAddress(_addresses.voucherBeacon);
        setBeaconProxyAddress(_addresses.beaconProxy);
        setProtocolFeePercentage(_fees.percentage);
        setProtocolFeeFlatBoson(_fees.flatBoson);
        setMaxExchangesPerBatch(_limits.maxExchangesPerBatch);
        setMaxOffersPerGroup(_limits.maxOffersPerGroup);
        setMaxTwinsPerBundle(_limits.maxTwinsPerBundle);
        setMaxOffersPerBundle(_limits.maxOffersPerBundle);
        setMaxOffersPerBatch(_limits.maxOffersPerBatch);
        setMaxTokensPerWithdrawal(_limits.maxTokensPerWithdrawal);
        setMaxFeesPerDisputeResolver(_limits.maxFeesPerDisputeResolver);
        setMaxEscalationResponsePeriod(_limits.maxEscalationResponsePeriod);
        setMaxDisputesPerBatch(_limits.maxDisputesPerBatch);
        setMaxAllowedSellers(_limits.maxAllowedSellers);
        setBuyerEscalationDepositPercentage(_buyerEscalationDepositPercentage);
        setMaxTotalOfferFeePercentage(_limits.maxTotalOfferFeePercentage);
        setMaxRoyaltyPecentage(_limits.maxRoyaltyPecentage);
        setMaxResolutionPeriod(_limits.maxResolutionPeriod);
        setMinFulfillmentPeriod(_limits.minFulfillmentPeriod);

        // Initialize protocol counters
        ProtocolLib.ProtocolCounters storage pc = protocolCounters();
        pc.nextAccountId = 1;
        pc.nextBundleId = 1;
        pc.nextExchangeId = 1;
        pc.nextGroupId = 1;
        pc.nextOfferId = 1;
        pc.nextTwinId = 1;

        // Initialize protocol meta-transaction config params
        ProtocolLib.ProtocolMetaTxInfo storage pmti = protocolMetaTxInfo();
        pmti.domainSeparator = EIP712Lib.domainSeparator("BosonProtocolDiamond", "V1");
    }

    /**
     * @notice Sets the Boson Token (ERC-20 contract) address.
     *
     * Emits a TokenAddressChanged event.
     *
     * Reverts if _tokenAddress is the zero address
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _tokenAddress - the Boson Token (ERC-20 contract) address
     */
    function setTokenAddress(address payable _tokenAddress) public override onlyRole(ADMIN) nonReentrant {
        require(_tokenAddress != address(0), INVALID_ADDRESS);
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
     * Emits a TreasuryAddressChanged event.
     *
     * Reverts if _treasuryAddress is the zero address
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _treasuryAddress - the the multi-sig wallet address
     */
    function setTreasuryAddress(address payable _treasuryAddress) public override onlyRole(ADMIN) nonReentrant {
        require(_treasuryAddress != address(0), INVALID_ADDRESS);
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
     * Emits a VoucherBeaconAddressChanged event.
     *
     * Reverts if _voucherBeaconAddress is the zero address
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _voucherBeaconAddress - the Boson Voucher beacon contract address
     */
    function setVoucherBeaconAddress(address _voucherBeaconAddress) public override onlyRole(ADMIN) nonReentrant {
        require(_voucherBeaconAddress != address(0), INVALID_ADDRESS);
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
     * Emits a BeaconProxyAddressChanged event.
     *
     * Reverts if _beaconProxyAddress is the zero address
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _beaconProxyAddress - reference proxy implementation address
     */
    function setBeaconProxyAddress(address _beaconProxyAddress) public override onlyRole(ADMIN) nonReentrant {
        require(_beaconProxyAddress != address(0), INVALID_ADDRESS);
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
     * @notice Sets the protocol fee percentage.
     *
     * Emits a ProtocolFeePercentageChanged event.
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
    function setProtocolFeePercentage(uint16 _protocolFeePercentage) public override onlyRole(ADMIN) nonReentrant {
        // Make sure percentage is less than 10000
        require(_protocolFeePercentage <= 10000, FEE_PERCENTAGE_INVALID);

        // Store fee percentage
        protocolFees().percentage = _protocolFeePercentage;

        // Notify watchers of state change
        emit ProtocolFeePercentageChanged(_protocolFeePercentage, msgSender());
    }

    /**
     * @notice Gets the protocol fee percentage.
     *
     * @return the protocol fee percentage
     */
    function getProtocolFeePercentage() external view override returns (uint16) {
        return protocolFees().percentage;
    }

    /**
     * @notice Sets the flat protocol fee for exchanges in $BOSON.
     *
     * Emits a ProtocolFeeFlatBosonChanged event.
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
     * @notice Getsthe flat protocol fee for exchanges in $BOSON.
     *
     * @return the flat fee taken for exchanges in $BOSON
     */
    function getProtocolFeeFlatBoson() external view override returns (uint256) {
        return protocolFees().flatBoson;
    }

    /**
     * @notice Sets the maximum numbers of offers that can be added to a group in a single transaction.
     *
     * Emits a MaxOffersPerGroupChanged event.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxOffersPerGroup - the maximum length of {BosonTypes.Group.offerIds}
     */
    function setMaxOffersPerGroup(uint16 _maxOffersPerGroup) public override onlyRole(ADMIN) nonReentrant {
        protocolLimits().maxOffersPerGroup = _maxOffersPerGroup;
        emit MaxOffersPerGroupChanged(_maxOffersPerGroup, msgSender());
    }

    /**
     * @notice Gets the maximum numbers of offers that can be added to a group in a single transaction.
     *
     * @return the maximum numbers of offers that can be added to a group in a single transaction
     */
    function getMaxOffersPerGroup() external view override returns (uint16) {
        return protocolLimits().maxOffersPerGroup;
    }

    /**
     * @notice Sets the maximum numbers of twins that can be added to a bundle in a single transaction.
     *
     * Emits a MaxTwinsPerBundleChanged event.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxTwinsPerBundle - the maximum length of {BosonTypes.Bundle.twinIds}
     */
    function setMaxTwinsPerBundle(uint16 _maxTwinsPerBundle) public override onlyRole(ADMIN) nonReentrant {
        protocolLimits().maxTwinsPerBundle = _maxTwinsPerBundle;
        emit MaxTwinsPerBundleChanged(_maxTwinsPerBundle, msgSender());
    }

    /**
     * @notice Gets the maximum numbers of twins that can be added to a bundle in a single transaction.
     *
     * @return the maximum numbers of twins that can be added to a bundle in a single transaction.
     */
    function getMaxTwinsPerBundle() external view override returns (uint16) {
        return protocolLimits().maxTwinsPerBundle;
    }

    /**
     * @notice Sets the maximum numbers of offers that can be added to a bundle in a single transaction.
     *
     * Emits a MaxOffersPerBundleChanged event.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxOffersPerBundle - the maximum length of {BosonTypes.Bundle.offerIds}
     */
    function setMaxOffersPerBundle(uint16 _maxOffersPerBundle) public override onlyRole(ADMIN) nonReentrant {
        protocolLimits().maxOffersPerBundle = _maxOffersPerBundle;
        emit MaxOffersPerBundleChanged(_maxOffersPerBundle, msgSender());
    }

    /**
     * @notice Gets the maximum numbers of offers that can be added to a bundle in a single transaction.
     *
     * @return the maximum numbers of offers that can be added to a bundle in a single transaction
     */
    function getMaxOffersPerBundle() external view override returns (uint16) {
        return protocolLimits().maxOffersPerBundle;
    }

    /**
     * @notice Sets the maximum numbers of offers that can be created in a single transaction.
     *
     * Emits a MaxOffersPerBatchChanged event.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxOffersPerBatch - the maximum length of {BosonTypes.Offer[]}
     */
    function setMaxOffersPerBatch(uint16 _maxOffersPerBatch) public override onlyRole(ADMIN) nonReentrant {
        protocolLimits().maxOffersPerBatch = _maxOffersPerBatch;
        emit MaxOffersPerBatchChanged(_maxOffersPerBatch, msgSender());
    }

    /**
     * @notice Gets the maximum numbers of offers that can be created in a single transaction.
     *
     * @return the maximum numbers of offers that can be created in a single transaction
     */
    function getMaxOffersPerBatch() external view override returns (uint16) {
        return protocolLimits().maxOffersPerBatch;
    }

    /**
     * @notice Sets the maximum numbers of tokens that can be withdrawn in a single transaction.
     *
     * Emits a MaxTokensPerWithdrawalChanged event.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxTokensPerWithdrawal - the maximum length of token list when calling {FundsHandlerFacet.withdraw}
     */
    function setMaxTokensPerWithdrawal(uint16 _maxTokensPerWithdrawal) public override onlyRole(ADMIN) nonReentrant {
        protocolLimits().maxTokensPerWithdrawal = _maxTokensPerWithdrawal;
        emit MaxTokensPerWithdrawalChanged(_maxTokensPerWithdrawal, msgSender());
    }

    /**
     * @notice Gets the maximum numbers of tokens that can be withdrawn in a single transaction.
     *
     * @return the maximum length of token list when calling {FundsHandlerFacet.withdraw}
     */
    function getMaxTokensPerWithdrawal() external view override returns (uint16) {
        return protocolLimits().maxTokensPerWithdrawal;
    }

    /**
     * @notice Sets the maximum number of dispute resolver fee structs that can be processed in a single transaction.
     *
     * Emits a MaxFeesPerDisputeResolverChanged event.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxFeesPerDisputeResolver - the maximum length of dispute resolver fees list when calling {AccountHandlerFacet.createDisputeResolver} or {AccountHandlerFacet.updateDisputeResolver}
     */
    function setMaxFeesPerDisputeResolver(uint16 _maxFeesPerDisputeResolver)
        public
        override
        onlyRole(ADMIN)
        nonReentrant
    {
        protocolLimits().maxFeesPerDisputeResolver = _maxFeesPerDisputeResolver;
        emit MaxFeesPerDisputeResolverChanged(_maxFeesPerDisputeResolver, msgSender());
    }

    /**
     * @notice Gets the maximum number of dispute resolver fee structs that can be processed in a single transaction.
     *
     * @return the maximum number of dispute resolver fee structs that can be processed in a single transaction
     */
    function getMaxFeesPerDisputeResolver() external view override returns (uint16) {
        return protocolLimits().maxFeesPerDisputeResolver;
    }

    /**
     * @notice Sets the maximum escalation response period a dispute resolver can specify.
     *
     * Emits a MaxEscalationResponsePeriodChanged event.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxEscalationResponsePeriod - the maximum escalation response period that a {BosonTypes.DisputeResolver} can specify
     */
    function setMaxEscalationResponsePeriod(uint256 _maxEscalationResponsePeriod)
        public
        override
        onlyRole(ADMIN)
        nonReentrant
    {
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
     * @notice Sets the maximum number of disputes that can be expired in a single transaction.
     *
     * Emits a MaxDisputesPerBatchChanged event.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxDisputesPerBatch - the maximum number of disputes that can be expired
     */
    function setMaxDisputesPerBatch(uint16 _maxDisputesPerBatch) public override onlyRole(ADMIN) nonReentrant {
        protocolLimits().maxDisputesPerBatch = _maxDisputesPerBatch;
        emit MaxDisputesPerBatchChanged(_maxDisputesPerBatch, msgSender());
    }

    /**
     * @notice Gets the maximum number of disputes that can be expired in a single transaction.
     *
     * @return the maximum number of disputes that can be expired
     */
    function getMaxDisputesPerBatch() external view override returns (uint16) {
        return protocolLimits().maxDisputesPerBatch;
    }

    /**
     * @notice Sets the total offer fee percentage limit which will validate the sum of (Protocol Fee percentage + Agent Fee percentage) of an offer fee.
     *
     * Emits a MaxTotalOfferFeePercentageChanged event.
     *
     * Reverts if the _maxTotalOfferFeePercentage is greater than 10000.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxTotalOfferFeePercentage - the maximum total offer fee percentage
     *
     * N.B. Represent percentage value as an unsigned int by multiplying the percentage by 100:
     * e.g, 1.75% = 175, 100% = 10000
     */
    function setMaxTotalOfferFeePercentage(uint16 _maxTotalOfferFeePercentage)
        public
        override
        onlyRole(ADMIN)
        nonReentrant
    {
        // Make sure percentage is less than 10000
        require(_maxTotalOfferFeePercentage <= 10000, FEE_PERCENTAGE_INVALID);

        // Store fee percentage
        protocolLimits().maxTotalOfferFeePercentage = _maxTotalOfferFeePercentage;

        // Notify watchers of state change
        emit MaxTotalOfferFeePercentageChanged(_maxTotalOfferFeePercentage, msgSender());
    }

    /**
     * @notice Gets the total offer fee percentage limit which will validate the sum of (Protocol Fee percentage + Agent Fee percentage) of an offer fee.
     *
     * @return the maximum total offer fee percentage
     */
    function getMaxTotalOfferFeePercentage() external view override returns (uint16) {
        return protocolLimits().maxTotalOfferFeePercentage;
    }

    /**
     * @notice Sets the maximum royalty percentage that can be set by the seller.
     *
     * Emits a MaxRoyaltyPercentageChanged event.
     *
     * Reverts if the _maxRoyaltyPecentage is greater than 10000.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxRoyaltyPecentage - the maximum royalty percentage
     *
     * N.B. Represent percentage value as an unsigned int by multiplying the percentage by 100:
     * e.g, 1.75% = 175, 100% = 10000
     */
    function setMaxRoyaltyPecentage(uint16 _maxRoyaltyPecentage) public override onlyRole(ADMIN) nonReentrant {
        // Make sure percentage is less than 10000
        require(_maxRoyaltyPecentage <= 10000, FEE_PERCENTAGE_INVALID);

        // Store fee percentage
        protocolLimits().maxRoyaltyPecentage = _maxRoyaltyPecentage;

        // Notify watchers of state change
        emit MaxRoyaltyPercentageChanged(_maxRoyaltyPecentage, msgSender());
    }

    /**
     * @notice Gets the maximum royalty percentage that can be set by the seller.
     *
     * @return the maximum royalty percentage
     */
    function getMaxRoyaltyPecentage() external view override returns (uint16) {
        return protocolLimits().maxRoyaltyPecentage;
    }

    /**
     * @notice Sets the maximum number of seller ids that can be added to or removed from dispute resolver seller allow list in a single transaction.
     *
     * Emits a MaxAllowedSellersChanged event.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxAllowedSellers - the maximum number of seller ids that can be added or removed
     */
    function setMaxAllowedSellers(uint16 _maxAllowedSellers) public override onlyRole(ADMIN) nonReentrant {
        protocolLimits().maxAllowedSellers = _maxAllowedSellers;
        emit MaxAllowedSellersChanged(_maxAllowedSellers, msgSender());
    }

    /**
     * @notice Gets the maximum number of seller ids that can be added to or removed from dispute resolver seller allow list in a single transaction.
     *
     * @return the maximum number of seller ids that can be added or removed
     */
    function getMaxAllowedSellers() external view override returns (uint16) {
        return protocolLimits().maxAllowedSellers;
    }

    /**
     * @notice Sets the buyer escalation fee percentage.
     *
     * Emits a BuyerEscalationFeePercentageChanged event.
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
    function setBuyerEscalationDepositPercentage(uint16 _buyerEscalationDepositPercentage)
        public
        override
        onlyRole(ADMIN)
        nonReentrant
    {
        // Make sure percentage is less than 10000
        require(_buyerEscalationDepositPercentage <= 10000, FEE_PERCENTAGE_INVALID);

        // Store fee percentage
        protocolLookups().buyerEscalationDepositPercentage = _buyerEscalationDepositPercentage;

        // Notify watchers of state change
        emit BuyerEscalationFeePercentageChanged(_buyerEscalationDepositPercentage, msgSender());
    }

    /**
     * @notice Gets the buyer escalation fee percentage.
     *
     * @return the percentage of the DR fee that will be charged to buyer if they want to escalate the dispute
     */
    function getBuyerEscalationDepositPercentage() external view override returns (uint16) {
        return protocolLookups().buyerEscalationDepositPercentage;
    }

    /**
     * @notice Sets the contract address for the given AuthTokenType.
     *
     * Emits an AuthTokenContractChanged event.
     *
     * Reverts if _authTokenType is None
     * Reverts if _authTokenContract is the zero address
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _authTokenType - the auth token type, as an Enum value
     * @param _authTokenContract the address of the auth token contract (e.g. Lens or ENS contract address)
     */
    function setAuthTokenContract(AuthTokenType _authTokenType, address _authTokenContract)
        external
        override
        onlyRole(ADMIN)
        nonReentrant
    {
        require(_authTokenType != AuthTokenType.None, INVALID_AUTH_TOKEN_TYPE);
        require(_authTokenContract != address(0), INVALID_ADDRESS);
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
     * @notice Sets the maximum number of exchanges that can be created in a single transaction.
     *
     * Emits a MaxExchangesPerBatchChanged event.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxExchangesPerBatch - the maximum length of {BosonTypes.Exchange[]}
     */
    function setMaxExchangesPerBatch(uint16 _maxExchangesPerBatch) public override onlyRole(ADMIN) nonReentrant {
        protocolLimits().maxExchangesPerBatch = _maxExchangesPerBatch;
        emit MaxExchangesPerBatchChanged(_maxExchangesPerBatch, msgSender());
    }

    /**
     * @notice Gets the maximum number of exchanges that can be created in a single transaction.
     *
     * @return the maximum length of {BosonTypes.Exchange[]}
     */
    function getMaxExchangesPerBatch() external view override returns (uint16) {
        return protocolLimits().maxExchangesPerBatch;
    }

    /**
     * @notice Sets the maximum resolution period a seller can specify.
     *
     * Emits a MaxResolutionPeriodChanged event.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxResolutionPeriod - the maximum resolution period that a {BosonTypes.Seller} can specify
     */
    function setMaxResolutionPeriod(uint256 _maxResolutionPeriod) public override onlyRole(ADMIN) nonReentrant {
        protocolLimits().maxResolutionPeriod = _maxResolutionPeriod;
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
     * @notice Sets the minimum fulfillment period a seller can specify.
     *
     * Emits a MinFulfillmentPeriodChanged event.
     *
     * @param _minFulfillmentPeriod - the minimum resolution period that a {BosonTypes.Seller} can specify
     */
    function setMinFulfillmentPeriod(uint256 _minFulfillmentPeriod) public override onlyRole(ADMIN) nonReentrant {
        protocolLimits().minFulfillmentPeriod = _minFulfillmentPeriod;
        emit MinFulfillmentPeriodChanged(_minFulfillmentPeriod, msgSender());
    }

    /**
     * @notice Gets the minimum fulfillment period a seller can specify.
     */
    function getMinFulfillmentPeriod() external view override returns (uint256) {
        return protocolLimits().minFulfillmentPeriod;
    }
}
