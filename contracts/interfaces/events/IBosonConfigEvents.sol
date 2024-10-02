// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { BosonTypes } from "../../domain/BosonTypes.sol";

/**
 * @title IBosonConfigEvents
 *
 * @notice Defines events related to management of configuration within the protocol.
 */
interface IBosonConfigEvents {
    event TokenAddressChanged(address indexed tokenAddress, address indexed executedBy);
    event TreasuryAddressChanged(address indexed treasuryAddress, address indexed executedBy);
    event VoucherBeaconAddressChanged(address indexed voucherBeaconAddress, address indexed executedBy);
    event BeaconProxyAddressChanged(address indexed beaconProxyAddress, address indexed executedBy);
    event PriceDiscoveryAddressChanged(address indexed priceDiscoveryAddress, address indexed executedBy);
    event ProtocolFeePercentageChanged(uint256 feePercentage, address indexed executedBy);
    event ProtocolFeeFlatBosonChanged(uint256 feeFlatBoson, address indexed executedBy);
    event MaxEscalationResponsePeriodChanged(uint256 maxEscalationResponsePeriod, address indexed executedBy);
    event BuyerEscalationFeePercentageChanged(uint256 buyerEscalationFeePercentage, address indexed executedBy);
    event AuthTokenContractChanged(
        BosonTypes.AuthTokenType indexed authTokenType,
        address indexed authTokenContract,
        address indexed executedBy
    );
    event MaxTotalOfferFeePercentageChanged(uint16 maxTotalOfferFeePercentage, address indexed executedBy);
    event MaxRoyaltyPercentageChanged(uint16 maxRoyaltyPercentage, address indexed executedBy);
    event MinResolutionPeriodChanged(uint256 minResolutionPeriod, address indexed executedBy);
    event MaxResolutionPeriodChanged(uint256 maxResolutionPeriod, address indexed executedBy);
    event MinDisputePeriodChanged(uint256 minDisputePeriod, address indexed executedBy);
    event MaxPremintedVouchersChanged(uint256 maxPremintedVouchers, address indexed executedBy);
    event AccessControllerAddressChanged(address indexed accessControllerAddress, address indexed executedBy);
    event FeeTableUpdated(
        address indexed token,
        uint256[] priceRanges,
        uint256[] feePercentages,
        address indexed executedBy
    );
}
