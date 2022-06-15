// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {BosonTypes} from "../../domain/BosonTypes.sol";

/**
 * @title IBosonConfigEvents
 *
 * @notice Events related to management of configuration within the protocol.
 */
interface IBosonConfigEvents {
    event VoucherAddressChanged(address indexed voucher, address indexed changedBy);
    event TokenAddressChanged(address indexed tokenAddress, address indexed changedBy);
    event TreasuryAddressChanged(address indexed treasuryAddress, address indexed changedBy);
    event ProtocolFeePercentageChanged(uint16 feePercentage, address indexed changedBy);
    event ProtocolFeeFlatBosonChanged(uint256 feeFlatBoson, address indexed executedBy);
    event MaxOffersPerGroupChanged(uint16 maxOffersPerGroup, address indexed changedBy);
    event MaxOffersPerBatchChanged(uint16 maxOffersPerBatch, address indexed changedBy);
    event MaxTwinsPerBundleChanged(uint16 maxTwinsPerBundle, address indexed changedBy);
    event MaxOffersPerBundleChanged(uint16 maxOffersPerBundle, address indexed changedBy);
    event MaxTokensPerWithdrawalChanged(uint16 maxOffersPerBundle, address indexed changedBy);    
}
