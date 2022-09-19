// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { BosonTypes } from "../../domain/BosonTypes.sol";
import { IBosonConfigEvents } from "../events/IBosonConfigEvents.sol";

/**
 * @title IBosonConfigHandler
 *
 * @notice Handles management of configuration within the protocol.
 *
 * The ERC-165 identifier for this interface is: 0x5bf232b9
 */
interface IBosonConfigHandler is IBosonConfigEvents {
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
    function setTokenAddress(address payable _tokenAddress) external;

    /**
     * @notice Gets the Boson Token (ERC-20 contract) address.
     *
     * @return the Boson Token (ERC-20 contract) address
     */
    function getTokenAddress() external view returns (address payable);

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
    function setTreasuryAddress(address payable _treasuryAddress) external;

    /**
     * @notice Gets the Boson Protocol multi-sig wallet address.
     *
     * @return the Boson Protocol multi-sig wallet address
     */
    function getTreasuryAddress() external view returns (address payable);

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
    function setVoucherBeaconAddress(address _voucherBeaconAddress) external;

    /**
     * @notice Gets the Boson Voucher beacon contract address.
     *
     * @return the Boson Voucher beacon contract address
     */
    function getVoucherBeaconAddress() external view returns (address);

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
    function setBeaconProxyAddress(address _beaconProxyAddress) external;

    /**
     * @notice Gets the beaconProxy address.
     *
     * @return the beaconProxy address
     */
    function getBeaconProxyAddress() external view returns (address);

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
    function setProtocolFeePercentage(uint16 _protocolFeePercentage) external;

    /**
     * @notice Gets the protocol fee percentage.
     *
     * @return the protocol fee percentage
     */
    function getProtocolFeePercentage() external view returns (uint16);

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
    function setProtocolFeeFlatBoson(uint256 _protocolFeeFlatBoson) external;

    /**
     * @notice Getsthe flat protocol fee for exchanges in $BOSON.
     *
     * @return the flat fee taken for exchanges in $BOSON
     */
    function getProtocolFeeFlatBoson() external view returns (uint256);

    /**
     * @notice Sets the maximum numbers of offers that can be created in a single transaction.
     *
     * Emits a MaxOffersPerBatchChanged event.
     *
     * Reverts if _maxOffersPerBatch is zero.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxOffersPerBatch - the maximum length of {BosonTypes.Offer[]}
     */
    function setMaxOffersPerBatch(uint16 _maxOffersPerBatch) external;

    /**
     * @notice Gets the maximum numbers of offers that can be created in a single transaction.
     *
     * @return the maximum numbers of offers that can be created in a single transaction
     */
    function getMaxOffersPerBatch() external view returns (uint16);

    /**
     * @notice Sets the maximum numbers of offers that can be added to a group in a single transaction.
     *
     * Emits a MaxOffersPerGroupChanged event.
     *
     * Reverts if _maxOffersPerGroup is zero.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxOffersPerGroup - the maximum length of {BosonTypes.Group.offerIds}
     */
    function setMaxOffersPerGroup(uint16 _maxOffersPerGroup) external;

    /**
     * @notice Gets the maximum numbers of offers that can be added to a group in a single transaction.
     *
     * @return the maximum numbers of offers that can be added to a group in a single transaction
     */
    function getMaxOffersPerGroup() external view returns (uint16);

    /**
     * @notice Sets the maximum numbers of twins that can be added to a bundle in a single transaction.
     *
     * Emits a MaxTwinsPerBundleChanged event.
     *
     * Reverts if _maxTwinsPerBundle is zero.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxTwinsPerBundle - the maximum length of {BosonTypes.Bundle.twinIds}
     */
    function setMaxTwinsPerBundle(uint16 _maxTwinsPerBundle) external;

    /**
     * @notice Gets the maximum numbers of twins that can be added to a bundle in a single transaction.
     *
     * @return the maximum numbers of twins that can be added to a bundle in a single transaction.
     */
    function getMaxTwinsPerBundle() external view returns (uint16);

    /**
     * @notice Sets the maximum numbers of offers that can be added to a bundle in a single transaction.
     *
     * Emits a MaxOffersPerBundleChanged event.
     *
     * Reverts if _maxOffersPerBundle is zero.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxOffersPerBundle - the maximum length of {BosonTypes.Bundle.offerIds}
     */
    function setMaxOffersPerBundle(uint16 _maxOffersPerBundle) external;

    /**
     * @notice Gets the maximum numbers of offers that can be added to a bundle in a single transaction.
     *
     * @return the maximum numbers of offers that can be added to a bundle in a single transaction
     */
    function getMaxOffersPerBundle() external view returns (uint16);

    /**
     * @notice Sets the maximum numbers of tokens that can be withdrawn in a single transaction.
     *
     * Emits a MaxTokensPerWithdrawalChanged event.
     *
     * Reverts if _maxTokensPerWithdrawal is zero.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxTokensPerWithdrawal - the maximum length of token list when calling {FundsHandlerFacet.withdraw}
     */
    function setMaxTokensPerWithdrawal(uint16 _maxTokensPerWithdrawal) external;

    /**
     * @notice Gets the maximum numbers of tokens that can be withdrawn in a single transaction.
     *
     * @return the maximum length of token list when calling {FundsHandlerFacet.withdraw}
     */
    function getMaxTokensPerWithdrawal() external view returns (uint16);

    /**
     * @notice Sets the maximum number of dispute resolver fee structs that can be processed in a single transaction.
     *
     * Emits a MaxFeesPerDisputeResolverChanged event.
     *
     * Reverts if _maxFeesPerDisputeResolver is zero.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxFeesPerDisputeResolver - the maximum length of dispute resolver fees list when calling {AccountHandlerFacet.createDisputeResolver} or {AccountHandlerFacet.updateDisputeResolver}
     */
    function setMaxFeesPerDisputeResolver(uint16 _maxFeesPerDisputeResolver) external;

    /**
     * @notice Gets the maximum number of dispute resolver fee structs that can be processed in a single transaction.
     *
     * @return the maximum number of dispute resolver fee structs that can be processed in a single transaction
     */
    function getMaxFeesPerDisputeResolver() external view returns (uint16);

    /**
     * @notice Sets the maximum escalation response period a dispute resolver can specify.
     *
     * Emits a MaxEscalationResponsePeriodChanged event.
     *
     * Reverts if _maxEscalationResponsePeriod is zero.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxEscalationResponsePeriod - the maximum escalation response period that a {BosonTypes.DisputeResolver} can specify
     */
    function setMaxEscalationResponsePeriod(uint256 _maxEscalationResponsePeriod) external;

    /**
     * @notice Gets the maximum escalation response period a dispute resolver can specify.
     *
     * @return the maximum escalation response period that a {BosonTypes.DisputeResolver} can specify
     */
    function getMaxEscalationResponsePeriod() external view returns (uint256);

    /**
     * @notice Sets the maximum number of disputes that can be expired in a single transaction.
     *
     * Emits a MaxDisputesPerBatchChanged event.
     *
     * Reverts if _maxDisputesPerBatch is zero.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxDisputesPerBatch - the maximum number of disputes that can be expired
     */
    function setMaxDisputesPerBatch(uint16 _maxDisputesPerBatch) external;

    /**
     * @notice Gets the maximum number of disputes that can be expired in a single transaction.
     *
     * @return the maximum number of disputes that can be expired
     */
    function getMaxDisputesPerBatch() external view returns (uint16);

    /**
     * @notice Sets the total offer fee percentage limit which will validate the sum of (Protocol Fee percentage + Agent Fee percentage) of an offer fee.
     *
     * Emits a MaxTotalOfferFeePercentageChanged event.
     *
     * Reverts if:
     * - The _maxTotalOfferFeePercentage is zero.
     * - The _maxTotalOfferFeePercentage is greater than 10000.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxTotalOfferFeePercentage - the maximum total offer fee percentage
     *
     * N.B. Represent percentage value as an unsigned int by multiplying the percentage by 100:
     * e.g, 1.75% = 175, 100% = 10000
     */
    function setMaxTotalOfferFeePercentage(uint16 _maxTotalOfferFeePercentage) external;

    /**
     * @notice Gets the total offer fee percentage limit which will validate the sum of (Protocol Fee percentage + Agent Fee percentage) of an offer fee.
     *
     * @return the maximum total offer fee percentage
     */
    function getMaxTotalOfferFeePercentage() external view returns (uint16);

    /**
     * @notice Sets the maximum number of seller ids that can be added to or removed from dispute resolver seller allow list in a single transaction.
     *
     * Emits a MaxAllowedSellersChanged event.
     *
     * Reverts if _maxAllowedSellers is zero.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxAllowedSellers - the maximum number of seller ids that can be added or removed
     */
    function setMaxAllowedSellers(uint16 _maxAllowedSellers) external;

    /**
     * @notice Gets the maximum number of seller ids that can be added to or removed from dispute resolver seller allow list in a single transaction.
     *
     * @return the maximum number of seller ids that can be added or removed
     */
    function getMaxAllowedSellers() external view returns (uint16);

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
    function setBuyerEscalationDepositPercentage(uint16 _buyerEscalationDepositPercentage) external;

    /**
     * @notice Gets the buyer escalation fee percentage.
     *
     * @return the percentage of the DR fee that will be charged to buyer if they want to escalate the dispute
     */
    function getBuyerEscalationDepositPercentage() external view returns (uint16);

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
    function setAuthTokenContract(BosonTypes.AuthTokenType _authTokenType, address _authTokenContract) external;

    /**
     * @notice Gets the contract address for the given AuthTokenType.
     *
     * @param _authTokenType - the auth token type, as an Enum value
     * @return the address of the auth token contract (e.g. Lens or ENS contract address) for the given AuthTokenType
     */
    function getAuthTokenContract(BosonTypes.AuthTokenType _authTokenType) external view returns (address);

    /**
     * @notice Sets the maximum number of exchanges that can be created in a single transaction.
     *
     * Emits a MaxExchangesPerBatchChanged event.
     *
     * Reverts if _maxExchangesPerBatch is zero.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxExchangesPerBatch - the maximum length of {BosonTypes.Exchange[]}
     */
    function setMaxExchangesPerBatch(uint16 _maxExchangesPerBatch) external;

    /**
     * @notice Gets the maximum number of exchanges that can be created in a single transaction.
     *
     * @return the maximum length of {BosonTypes.Exchange[]}
     */
    function getMaxExchangesPerBatch() external view returns (uint16);

    /**
     * @notice Sets the maximum royalty percentage that can be set by the seller.
     *
     * Emits a MaxRoyaltyPercentageChanged event.
     *
     * Reverts if:
     * - The _maxRoyaltyPercentage is zero.
     * - The _maxRoyaltyPecentage is greater than 10000.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxRoyaltyPecentage - the maximum royalty percentage
     *
     * N.B. Represent percentage value as an unsigned int by multiplying the percentage by 100:
     * e.g, 1.75% = 175, 100% = 10000
     */
    function setMaxRoyaltyPecentage(uint16 _maxRoyaltyPecentage) external;

    /**
     * @notice Gets the maximum royalty percentage that can be set by the seller.
     *
     * @return the maximum royalty percentage
     */
    function getMaxRoyaltyPecentage() external view returns (uint16);

    /**
     * @notice Sets the maximum resolution period a seller can specify.
     *
     * Emits a MaxResolutionPeriodChanged event.
     *
     * Reverts if _maxResolutionPeriod is zero.
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _maxResolutionPeriod - the maximum resolution period that a {BosonTypes.Seller} can specify
     */
    function setMaxResolutionPeriod(uint256 _maxResolutionPeriod) external;

    /**
     * @notice Gets the maximum resolution period a seller can specify.
     *
     * @return the maximum resolution period that a {BosonTypes.Seller} can specify
     */
    function getMaxResolutionPeriod() external view returns (uint256);

    /**
     * @notice Sets the minimum fulfillment period a seller can specify.
     *
     * Emits a MinFulfillmentPeriodChanged event.
     *
     * Reverts if _minFulfillmentPeriod is zero.
     *
     * @param _minFulfillmentPeriod - the minimum resolution period that a {BosonTypes.Seller} can specify
     */
    function setMinFulfillmentPeriod(uint256 _minFulfillmentPeriod) external;

    /**
     * @notice Gets the minimum fulfillment period a seller can specify.
     */
    function getMinFulfillmentPeriod() external view returns (uint256);
}
