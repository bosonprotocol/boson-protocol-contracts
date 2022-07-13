// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { IBosonConfigHandler } from "../../interfaces/handlers/IBosonConfigHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { ProtocolBase } from "../bases/ProtocolBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { EIP712Lib } from "../libs/EIP712Lib.sol";

/**
 * @title ConfigHandlerFacet
 *
 * @notice Handles management of various protocol-related settings.
 */
contract ConfigHandlerFacet is IBosonConfigHandler, ProtocolBase {
    /**
     * @notice Facet Initializer
     *
     * @param _addresses - struct of Boson Protocol addresses (Boson Token (ERC-20) contract, treasury, and Voucher contract)
     * @param _limits - struct with Boson Protocol limits
     * @param _fees - struct of Boson Protocol fees
     */
    function initialize(
        ProtocolLib.ProtocolAddresses calldata _addresses,
        ProtocolLib.ProtocolLimits calldata _limits,
        ProtocolLib.ProtocolFees calldata _fees
    ) public onlyUnInitialized(type(IBosonConfigHandler).interfaceId) {
        // Register supported interfaces
        DiamondLib.addSupportedInterface(type(IBosonConfigHandler).interfaceId);

        // Initialize protocol config params
        setTokenAddress(_addresses.tokenAddress);
        setTreasuryAddress(_addresses.treasuryAddress);
        setVoucherBeaconAddress(_addresses.voucherBeaconAddress);
        setVoucherProxyAddress(_addresses.voucherProxyAddress);
        setProtocolFeePercentage(_fees.percentage);
        setProtocolFeeFlatBoson(_fees.flatBoson);
        setMaxOffersPerGroup(_limits.maxOffersPerGroup);
        setMaxTwinsPerBundle(_limits.maxTwinsPerBundle);
        setMaxOffersPerBundle(_limits.maxOffersPerBundle);
        setMaxOffersPerBatch(_limits.maxOffersPerBatch);
        setMaxTokensPerWithdrawal(_limits.maxTokensPerWithdrawal);
        setMaxFeesPerDisputeResolver(_limits.maxFeesPerDisputeResolver);
        setMaxEscalationResponsePeriod(_limits.maxEscalationResponsePeriod);
        setMaxDisputesPerBatch(_limits.maxDisputesPerBatch);

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
     * @notice Sets the address of the Boson Protocol token contract.
     *
     * Emits a TokenAddressChanged event.
     *
     * @param _tokenAddress - the address of the token contract
     */
    function setTokenAddress(address payable _tokenAddress) public override onlyRole(ADMIN) {
        protocolAddresses().tokenAddress = _tokenAddress;
        emit TokenAddressChanged(_tokenAddress, msgSender());
    }

    /**
     * @notice The tokenAddress getter
     */
    function getTokenAddress() external view override returns (address payable) {
        return protocolAddresses().tokenAddress;
    }

    /**
     * @notice Sets the address of the Boson Protocol multi-sig wallet.
     *
     * Emits a TreasuryAddressChanged event.
     *
     * @param _treasuryAddress - the address of the multi-sig wallet
     */
    function setTreasuryAddress(address payable _treasuryAddress) public override onlyRole(ADMIN) {
        protocolAddresses().treasuryAddress = _treasuryAddress;
        emit TreasuryAddressChanged(_treasuryAddress, msgSender());
    }

    /**
     * @notice The treasuryAddress getter
     */
    function getTreasuryAddress() external view override returns (address payable) {
        return protocolAddresses().treasuryAddress;
    }

    /**
     * @notice Sets the address of the Boson Voucher beacon contract.
     *
     * Emits a VoucherBeaconAddressChanged event.
     *
     * @param _voucherBeaconAddress - the address of the Boson Voucher beacon contract.
     */
    function setVoucherBeaconAddress(address _voucherBeaconAddress) public override onlyRole(ADMIN) {
        protocolAddresses().voucherBeaconAddress = _voucherBeaconAddress;
        emit VoucherBeaconAddressChanged(_voucherBeaconAddress, msgSender());
    }

    /**
     * @notice The voucherBeaconAddress getter
     */
    function getVoucherBeaconAddress() external view override returns (address) {
        return protocolAddresses().voucherBeaconAddress;
    }

    /**
     * @notice Sets the address of the Boson Voucher reference proxy implementation
     *
     * Emits a VoucherProxyAddressChanged event.
     *
     * @param _voucherProxyAddress - the address of the reference proxy implementation
     */
    function setVoucherProxyAddress(address _voucherProxyAddress) public override onlyRole(ADMIN) {
        protocolAddresses().voucherProxyAddress = _voucherProxyAddress;
        emit VoucherProxyAddressChanged(_voucherProxyAddress, msgSender());
    }

    /**
     * @notice The voucherProxyAddress getter
     */
    function getVoucherProxyAddress() external view override returns (address) {
        return protocolAddresses().voucherProxyAddress;
    }

    /**
     * @notice Sets the protocol fee percentage.
     *
     * Emits a ProtocolFeePercentageChanged event.
     *
     * Reverts if the _protocolFeePercentage is greater than 10000.
     *
     * @param _protocolFeePercentage - the percentage that will be taken as a fee from the net of a Boson Protocol sale or auction (after royalties)
     *
     * N.B. Represent percentage value as an unsigned int by multiplying the percentage by 100:
     * e.g, 1.75% = 175, 100% = 10000
     */
    function setProtocolFeePercentage(uint16 _protocolFeePercentage) public override onlyRole(ADMIN) {
        // Make sure percentage is less than 10000
        require(_protocolFeePercentage <= 10000, FEE_PERCENTAGE_INVALID);

        // Store fee percentage
        protocolFees().percentage = _protocolFeePercentage;

        // Notify watchers of state change
        emit ProtocolFeePercentageChanged(_protocolFeePercentage, msgSender());
    }

    /**
     * @notice Get the protocol fee percentage
     */
    function getProtocolFeePercentage() external view override returns (uint16) {
        return protocolFees().percentage;
    }

    /**
     * @notice Sets the flat protocol fee for exchanges in $BOSON.
     *
     * Emits a ProtocolFeeFlatBosonChanged event.
     *
     * @param _protocolFeeFlatBoson - Flat fee taken for exchanges in $BOSON
     *
     */
    function setProtocolFeeFlatBoson(uint256 _protocolFeeFlatBoson) public override onlyRole(ADMIN) {
        // Store fee percentage
        protocolFees().flatBoson = _protocolFeeFlatBoson;

        // Notify watchers of state change
        emit ProtocolFeeFlatBosonChanged(_protocolFeeFlatBoson, msgSender());
    }

    /**
     * @notice Get the protocol fee percentage
     */
    function getProtocolFeeFlatBoson() external view override returns (uint256) {
        return protocolFees().flatBoson;
    }

    /**
     * @notice Sets the maximum numbers of offers that can be added to a group in a single transaction
     *
     * Emits a MaxOffersPerGroupChanged event.
     *
     * @param _maxOffersPerGroup - the maximum length of {BosonTypes.Group.offerIds}
     */
    function setMaxOffersPerGroup(uint16 _maxOffersPerGroup) public override onlyRole(ADMIN) {
        protocolLimits().maxOffersPerGroup = _maxOffersPerGroup;
        emit MaxOffersPerGroupChanged(_maxOffersPerGroup, msgSender());
    }

    /**
     * @notice Get the maximum offers per group
     */
    function getMaxOffersPerGroup() external view override returns (uint16) {
        return protocolLimits().maxOffersPerGroup;
    }

    /**
     * @notice Sets the maximum numbers of twins that can be added to a bundle in a single transaction
     *
     * Emits a MaxTwinsPerBundleChanged event.
     *
     * @param _maxTwinsPerBundle - the maximum length of {BosonTypes.Bundle.twinIds}
     */
    function setMaxTwinsPerBundle(uint16 _maxTwinsPerBundle) public override onlyRole(ADMIN) {
        protocolLimits().maxTwinsPerBundle = _maxTwinsPerBundle;
        emit MaxTwinsPerBundleChanged(_maxTwinsPerBundle, msgSender());
    }

    /**
     * @notice Get the maximum twins per bundle
     */
    function getMaxTwinsPerBundle() external view override returns (uint16) {
        return protocolLimits().maxTwinsPerBundle;
    }

    /**
     * @notice Sets the maximum numbers of offers that can be added to a bundle in a single transaction
     *
     * Emits a MaxOffersPerBundleChanged event.
     *
     * @param _maxOffersPerBundle - the maximum length of {BosonTypes.Bundle.offerIds}
     */
    function setMaxOffersPerBundle(uint16 _maxOffersPerBundle) public override onlyRole(ADMIN) {
        protocolLimits().maxOffersPerBundle = _maxOffersPerBundle;
        emit MaxOffersPerBundleChanged(_maxOffersPerBundle, msgSender());
    }

    /**
     * @notice Get the maximum offers per bundle
     */
    function getMaxOffersPerBundle() external view override returns (uint16) {
        return protocolLimits().maxOffersPerBundle;
    }

    /**
     * @notice Sets the maximum numbers of offers that can be created in a single transaction
     *
     * Emits a MaxOffersPerBatchChanged event.
     *
     * @param _maxOffersPerBatch - the maximum length of {BosonTypes.Offer[]}
     */
    function setMaxOffersPerBatch(uint16 _maxOffersPerBatch) public override onlyRole(ADMIN) {
        protocolLimits().maxOffersPerBatch = _maxOffersPerBatch;
        emit MaxOffersPerBatchChanged(_maxOffersPerBatch, msgSender());
    }

    /**
     * @notice Get the maximum offers per batch
     */
    function getMaxOffersPerBatch() external view override returns (uint16) {
        return protocolLimits().maxOffersPerBatch;
    }

    /**
     * @notice Sets the maximum numbers of tokens that can be withdrawn in a single transaction
     *
     * Emits a mMxTokensPerWithdrawalChanged event.
     *
     * @param _maxTokensPerWithdrawal - the maximum length of token list when calling {FundsHandlerFacet.withdraw}
     */
    function setMaxTokensPerWithdrawal(uint16 _maxTokensPerWithdrawal) public override onlyRole(ADMIN) {
        protocolLimits().maxTokensPerWithdrawal = _maxTokensPerWithdrawal;
        emit MaxTokensPerWithdrawalChanged(_maxTokensPerWithdrawal, msgSender());
    }

    /**
     * @notice Get the maximum tokens per withdrawal
     */
    function getMaxTokensPerWithdrawal() external view override returns (uint16) {
        return protocolLimits().maxTokensPerWithdrawal;
    }

    /**
     * @notice Sets the maximum number of dispute resolver fee structs that can be processed in a single transaction
     *
     * Emits a MaxFeesPerDisputeResolverChanged event.
     *
     * @param _maxFeesPerDisputeResolver - the maximum length of dispute resolver fees list when calling {AccountHandlerFacet.createDisputeResolver} or {AccountHandlerFacet.updateDisputeResolver}
     */
    function setMaxFeesPerDisputeResolver(uint16 _maxFeesPerDisputeResolver) public override onlyRole(ADMIN) {
        protocolLimits().maxFeesPerDisputeResolver = _maxFeesPerDisputeResolver;
        emit MaxFeesPerDisputeResolverChanged(_maxFeesPerDisputeResolver, msgSender());
    }

    /**
     * @notice Get the maximum number of dispute resolver fee structs that can be processed in a single transaction
     */
    function getMaxFeesPerDisputeResolver() external view override returns (uint16) {
        return protocolLimits().maxFeesPerDisputeResolver;
    }

    /**
     * @notice Sets the maximum escalation response period a dispute resolver can specify
     *
     * Emits a MaxEscalationResponsePeriodChanged event.
     *
     * @param _maxEscalationResponsePeriod - the maximum escalation response period that a {BosonTypes.DisputeResolver} can specify
     */
    function setMaxEscalationResponsePeriod(uint256 _maxEscalationResponsePeriod) public override onlyRole(ADMIN) {
        protocolLimits().maxEscalationResponsePeriod = _maxEscalationResponsePeriod;
        emit MaxEscalationResponsePeriodChanged(_maxEscalationResponsePeriod, msgSender());
    }

    /**
     * @notice Get the maximum escalation response period a dispute resolver can specify
     */
    function getMaxEscalationResponsePeriod() external view override returns (uint256) {
        return protocolLimits().maxEscalationResponsePeriod;
    }

    /**
     * @notice Sets the maximum numbers of disputes that can be expired in a single transaction
     *
     * Emits a MaxDisputesPerBatchChanged event.
     *
     * @param _maxDisputesPerBatch - the maximum number of disputes that can be expired
     */
    function setMaxDisputesPerBatch(uint16 _maxDisputesPerBatch) public override onlyRole(ADMIN) {
        protocolLimits().maxDisputesPerBatch = _maxDisputesPerBatch;
        emit MaxDisputesPerBatchChanged(_maxDisputesPerBatch, msgSender());
    }

    /**
     * @notice Get the maximum disputes per batch
     */
    function getMaxDisputesPerBatch() external view override returns (uint16) {
        return protocolLimits().maxDisputesPerBatch;
    }
}
