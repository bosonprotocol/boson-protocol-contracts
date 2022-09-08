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
     * @notice Sets the address of the Boson Token (ERC-20) contract.
     *
     * Emits a TokenAddressChanged event.
     *
     * @param _tokenAddress - the address of the token contract
     */
    function setTokenAddress(address payable _tokenAddress) external;

    /**
     * @notice The token address getter
     */
    function getTokenAddress() external view returns (address payable);

    /**
     * @notice Sets the address of the Boson Protocol treasury.
     *
     * Emits a TreasuryAddressChanged event.
     *
     * @param _treasuryAddress - the address of the treasury
     */
    function setTreasuryAddress(address payable _treasuryAddress) external;

    /**
     * @notice The treasury address getter
     */
    function getTreasuryAddress() external view returns (address payable);

    /**
     * @notice Sets the address of the Boson Voucher beacon contract.
     *
     * Emits a VoucherBeaconAddressChanged event.
     *
     * @param _voucherBeaconAddress - the address of the Boson Voucher beacon contract.
     */
    function setVoucherBeaconAddress(address _voucherBeaconAddress) external;

    /**
     * @notice The voucherBeacon address getter
     */
    function getVoucherBeaconAddress() external view returns (address);

    /**
     * @notice Sets the address of the Boson Voucher reference proxy implementation
     *
     * Emits a BeaconProxyAddressChanged event.
     *
     * @param _beaconProxyAddress - the address of the reference proxy implementation
     */
    function setBeaconProxyAddress(address _beaconProxyAddress) external;

    /**
     * @notice The beaconProxy address getter
     */
    function getBeaconProxyAddress() external view returns (address);

    /**
     * @notice Sets the protocol fee percentage.
     *
     * Emits a ProtocolFeePercentageChanged event.
     *
     * Represent percentage value as an unsigned int by multiplying the percentage by 100:
     * e.g, 1.75% = 175, 100% = 10000
     *
     * @param _feePercentage - the percentage that will be taken as a fee from the net of a Boson Protocol exchange
     */
    function setProtocolFeePercentage(uint16 _feePercentage) external;

    /**
     * @notice Get the protocol fee percentage
     */
    function getProtocolFeePercentage() external view returns (uint16);

    /**
     * @notice Sets the flat protocol fee for exchanges in $BOSON.
     *
     * Emits a ProtocolFeeFlatBosonChanged event.
     *
     * @param _protocolFeeFlatBoson - Flat fee taken for exchanges in $BOSON
     *
     */
    function setProtocolFeeFlatBoson(uint256 _protocolFeeFlatBoson) external;

    /**
     * @notice Get the flat protocol fee for exchanges in $BOSON
     */
    function getProtocolFeeFlatBoson() external view returns (uint256);

    /**
     * @notice Sets the maximum number of offers that can be created in a single transaction
     *
     * Emits a MaxOffersPerBatchChanged event.
     *
     * @param _maxOffersPerBatch - the maximum length of {BosonTypes.Offer[]}
     */
    function setMaxOffersPerBatch(uint16 _maxOffersPerBatch) external;

    /**
     * @notice Get the maximum offers per batch
     */
    function getMaxOffersPerBatch() external view returns (uint16);

    /**
     * @notice Sets the maximum numbers of offers that can be added to a group in a single transaction
     *
     * Emits a MaxOffersPerGroupChanged event.
     *
     * @param _maxOffersPerGroup - the maximum length of {BosonTypes.Group.offerIds}
     */
    function setMaxOffersPerGroup(uint16 _maxOffersPerGroup) external;

    /**
     * @notice Get the maximum offers per group
     */
    function getMaxOffersPerGroup() external view returns (uint16);

    /**
     * @notice Sets the maximum numbers of twin that can be added to a bundle in a single transaction
     *
     * Emits a MaxTwinsPerBundleChanged event.
     *
     * @param _maxTwinsPerBundle - the maximum length of {BosonTypes.Bundle.twinIds}
     */
    function setMaxTwinsPerBundle(uint16 _maxTwinsPerBundle) external;

    /**
     * @notice Get the maximum twins per bundle
     */
    function getMaxTwinsPerBundle() external view returns (uint16);

    /**
     * @notice Sets the maximum numbers of offer that can be added to a bundle in a single transaction
     *
     * Emits a MaxOffersPerBundleChanged event.
     *
     * @param _maxOffersPerBundle - the maximum length of {BosonTypes.Bundle.offerIds}
     */
    function setMaxOffersPerBundle(uint16 _maxOffersPerBundle) external;

    /**
     * @notice Get the maximum offers per bundle
     */
    function getMaxOffersPerBundle() external view returns (uint16);

    /**
     * @notice Sets the maximum numbers of tokens that can be withdrawn in a single transaction
     *
     * Emits a mMxTokensPerWithdrawalChanged event.
     *
     * @param _maxTokensPerWithdrawal - the maximum length of token list when calling {FundsHandlerFacet.withdraw}
     */
    function setMaxTokensPerWithdrawal(uint16 _maxTokensPerWithdrawal) external;

    /**
     * @notice Get the maximum tokens per withdrawal
     */
    function getMaxTokensPerWithdrawal() external view returns (uint16);

    /**
     * @notice Sets the maximum number of dispute resolver fee structs that can be processed in a single transaction
     *
     * Emits a MaxFeesPerDisputeResolverChanged event.
     *
     * @param _maxFeesPerDisputeResolver - the maximum length of dispute resolver fees list when calling {AccountHandlerFacet.createDisputeResolver} or {AccountHandlerFacet.updateDisputeResolver}
     */
    function setMaxFeesPerDisputeResolver(uint16 _maxFeesPerDisputeResolver) external;

    /**
     * @notice Get the maximum number of dispute resolver fee structs that can be processed in a single transaction
     */
    function getMaxFeesPerDisputeResolver() external view returns (uint16);

    /**
     * @notice Sets the maximum escalation response period a dispute resolver can specify
     *
     * Emits a MaxEscalationResponsePeriodChanged event.
     *
     * @param _maxEscalationResponsePeriod - the maximum escalation response period that a {BosonTypes.DisputeResolver} can specify
     */
    function setMaxEscalationResponsePeriod(uint256 _maxEscalationResponsePeriod) external;

    /**
     * @notice Get the maximum escalation response period a dispute resolver can specify
     */
    function getMaxEscalationResponsePeriod() external view returns (uint256);

    /**
     * @notice Sets the maximum numbers of disputes that can be expired in a single transaction
     *
     * Emits a MaxDisputesPerBatchChanged event.
     *
     * @param _maxDisputesPerBatch - the maximum number of disputes that can be expired
     */
    function setMaxDisputesPerBatch(uint16 _maxDisputesPerBatch) external;

    /**
     * @notice Get the maximum disputes per batch
     */
    function getMaxDisputesPerBatch() external view returns (uint16);

    /**
     * @notice Sets the Total offer fee percentage limit which will validate the sum of (Protocol Fee percentage + Agent Fee percentage) of an offer fee.
     *
     * Emits a MaxTotalOfferFeePercentageChanged event.
     *
     * Reverts if the _maxTotalOfferFeePercentage is greater than 10000.
     *
     * @param _maxTotalOfferFeePercentage - the limit of total offer fee percentage.
     *
     * N.B. Represent percentage value as an unsigned int by multiplying the percentage by 100:
     * e.g, 1.75% = 175, 100% = 10000
     */
    function setMaxTotalOfferFeePercentage(uint16 _maxTotalOfferFeePercentage) external;

    /**
     * @notice Get the maximum total of offer fees allowed in an offer fee
     */
    function getMaxTotalOfferFeePercentage() external view returns (uint16);

    /**
     * @notice Sets the maximum numbers of seller ids that can be added to or removed from dispute resolver seller allow list in a single transaction
     *
     * Emits a MaxAllowedSellersChanged event.
     *
     * @param _maxAllowedSellers - the maximum number of seller ids that can be added or removed
     */
    function setMaxAllowedSellers(uint16 _maxAllowedSellers) external;

    /**
     * @notice Get the maximum number of seller ids that can be added or removed
     */
    function getMaxAllowedSellers() external view returns (uint16);

    /**
     * @notice Sets the buyer escalation fee percentage.
     *
     * Emits a BuyerEscalationFeePercentageChanged event.
     *
     * Reverts if the _buyerEscalationDepositPercentage is greater than 10000.
     *
     * @param _buyerEscalationDepositPercentage - the percentage of the DR fee that will be charged to buyer if they want to escalate the dispute
     *
     * N.B. Represent percentage value as an unsigned int by multiplying the percentage by 100:
     * e.g, 1.75% = 175, 100% = 10000
     */
    function setBuyerEscalationDepositPercentage(uint16 _buyerEscalationDepositPercentage) external;

    /**
     * @notice Get the buyer escalation fee percentage.
     */
    function getBuyerEscalationDepositPercentage() external view returns (uint16);

    /**
     * @notice Sets the contract address for the given AuthTokenType
     *
     * Emits an AuthTokenContractChanged event.
     *
     * Reverts if _authTokenType is None
     * Reverts if _authTokenContract is the zero address
     *
     * @param _authTokenType - the auth token type, as an Enum value
     * @param _authTokenContract the address of the auth token contract (e.g. Lens or ENS contract address)
     */
    function setAuthTokenContract(BosonTypes.AuthTokenType _authTokenType, address _authTokenContract) external;

    /**
     * @notice Get the auth token address for the given AuthTokenType
     * @param _authTokenType - the auth token type, as an Enum value
     */
    function getAuthTokenContract(BosonTypes.AuthTokenType _authTokenType) external view returns (address);

    /*
     * @notice Sets the maximum number of exchanges that can be created in a single transaction
     *
     * Emits a MaxExchangesPerBatchChanged event.
     *
     * @param _maxExchangesPerBatch - the maximum length of {BosonTypes.Exchange[]}
     */
    function setMaxExchangesPerBatch(uint16 _maxExchangesPerBatch) external;

    /**
     * @notice Get the maximum exchanges per batch
     */
    function getMaxExchangesPerBatch() external view returns (uint16);

    /**
     * @notice Sets the maximal royalty percentage that can be set by the seller
     *
     * Emits a MaxRoyaltyPercentageChanged event.
     *
     * Reverts if the _maxRoyaltyPecentage is greater than 10000.
     *
     * @param _maxRoyaltyPecentage - the limit of total offer fee percentage.
     *
     * N.B. Represent percentage value as an unsigned int by multiplying the percentage by 100:
     * e.g, 1.75% = 175, 100% = 10000
     */
    function setMaxRoyaltyPecentage(uint16 _maxRoyaltyPecentage) external;

    /**
     * @notice Get the maximum total of offer fees allowed in an offer fee
     */
    function getMaxRoyaltyPecentage() external view returns (uint16);

    /**
     * @notice Sets the maximum resolution period a seller can specify
     *
     * Emits a MaxResolutionPeriodChanged event.
     *
     * @param _maxResolutionPeriod - the maximum resolution period that a {BosonTypes.Seller} can specify
     */
    function setMaxResolutionPeriod(uint256 _maxResolutionPeriod) external;

    /**
     * @notice Get the maximum resolution period a seller can specify
     */
    function getMaxResolutionPeriod() external view returns (uint256);

    /**
     * @notice Sets the minimum fulfillment period a seller can specify.
     *
     * Emits a MinFulfillmentPeriodChanged event.
     *
     * @param _minFulfillmentPeriod - the minimum resolution period that a {BosonTypes.Seller} can specify
     */
    function setMinFulfillmentPeriod(uint256 _minFulfillmentPeriod) external;

    /**
     * @notice Gets the minimum fulfillment period a seller can specify.
     */
    function getMinFulfillmentPeriod() external view returns (uint256);
}
