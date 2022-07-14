// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { BosonTypes } from "../../domain/BosonTypes.sol";

/**
 * @title IBosonConfigEvents
 *
 * @notice Events related to management of configuration within the protocol.
 */
interface IBosonConfigEvents {
    event TokenAddressChanged(address indexed tokenAddress, address indexed executedBy);
    event TreasuryAddressChanged(address indexed treasuryAddress, address indexed executedBy);
    event VoucherBeaconAddressChanged(address indexed voucherBeaconAddress, address indexed executedBy);
    event BeaconProxyAddressChanged(address indexed beaconProxyAddress, address indexed executedBy);
    event ProtocolFeePercentageChanged(uint16 feePercentage, address indexed executedBy);
    event ProtocolFeeFlatBosonChanged(uint256 feeFlatBoson, address indexed executedBy);
    event MaxOffersPerGroupChanged(uint16 maxOffersPerGroup, address indexed executedBy);
    event MaxOffersPerBatchChanged(uint16 maxOffersPerBatch, address indexed executedBy);
    event MaxTwinsPerBundleChanged(uint16 maxTwinsPerBundle, address indexed executedBy);
    event MaxOffersPerBundleChanged(uint16 maxOffersPerBundle, address indexed executedBy);
    event MaxTokensPerWithdrawalChanged(uint16 maxTokensPerWithdrawal, address indexed executedBy);
    event MaxFeesPerDisputeResolverChanged(uint16 maxFeesPerDisputeResolver, address indexed executedBy);
    event MaxEscalationResponsePeriodChanged(uint256 maxEscalationResponsePeriod, address indexed executedBy);
    event MaxDisputesPerBatchChanged(uint16 maxDisputesPerBatch, address indexed executedBy);
}
