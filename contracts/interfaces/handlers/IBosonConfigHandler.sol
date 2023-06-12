// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.18;

import { BosonTypes } from "../../domain/BosonTypes.sol";
import { IBosonConfigEvents } from "../events/IBosonConfigEvents.sol";

/**
 * @title IBosonConfigHandler
 *
 * @notice Handles management of configuration within the protocol.
 *
 * The ERC-165 identifier for this interface is: 0x7ada1012
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
    function setProtocolFeePercentage(uint256 _protocolFeePercentage) external;

    /**
     * @notice Gets the protocol fee percentage.
     *
     * @return the protocol fee percentage
     */
    function getProtocolFeePercentage() external view returns (uint256);

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
     * @notice Gets the flat protocol fee for exchanges in $BOSON.
     *
     * @return the flat fee taken for exchanges in $BOSON
     */
    function getProtocolFeeFlatBoson() external view returns (uint256);

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
    function setMaxTotalOfferFeePercentage(uint16 _maxTotalOfferFeePercentage) external;

    /**
     * @notice Gets the total offer fee percentage limit which will validate the sum of (Protocol Fee percentage + Agent Fee percentage) of an offer fee.
     *
     * @return the maximum total offer fee percentage
     */
    function getMaxTotalOfferFeePercentage() external view returns (uint16);

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
    function setBuyerEscalationDepositPercentage(uint256 _buyerEscalationDepositPercentage) external;

    /**
     * @notice Gets the buyer escalation fee percentage.
     *
     * @return the percentage of the DR fee that will be charged to buyer if they want to escalate the dispute
     */
    function getBuyerEscalationDepositPercentage() external view returns (uint256);

    /**
     * @notice Sets the contract address for the given AuthTokenType.
     *
     * Emits an AuthTokenContractChanged event.
     *
     * Reverts if _authTokenType is None
     * Reverts if _authTokenType is Custom
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
     * @notice Sets the minimum dispute period a seller can specify.
     *
     * Emits a MinDisputePeriodChanged event.
     *
     * Reverts if _minDisputePeriod is zero.
     *
     * @param _minDisputePeriod - the minimum dispute period that a {BosonTypes.Seller} can specify
     */
    function setMinDisputePeriod(uint256 _minDisputePeriod) external;

    /**
     * @notice Gets the minimum dispute period a seller can specify.
     */
    function getMinDisputePeriod() external view returns (uint256);

    /**
     * @notice Sets the access controller address.
     *
     * Emits an AccessControllerAddressChanged event.
     *
     * Reverts if _accessControllerAddress is the zero address
     *
     * @dev Caller must have ADMIN role.
     *
     * @param _accessControllerAddress - access controller address
     */
    function setAccessControllerAddress(address _accessControllerAddress) external;

    /**
     * @notice Gets the access controller address.
     *
     * @return the access controller address
     */
    function getAccessControllerAddress() external view returns (address);
}
