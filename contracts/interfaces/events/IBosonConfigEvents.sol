// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {BosonTypes} from "../../domain/BosonTypes.sol";

/**
 * @title IBosonConfigEvents
 *
 * @notice Events related to management of configuration within the protocol.
 */
interface IBosonConfigEvents {
    event VoucherAddressChanged(address indexed voucher, address indexed executedBy);
    event TokenAddressChanged(address indexed tokenAddress, address indexed executedBy);
    event TreasuryAddressChanged(address indexed treasuryAddress, address indexed executedBy);
    event ProtocolFeePercentageChanged(uint16 feePercentage, address indexed executedBy);
    event MaxOffersPerGroupChanged(uint16 maxOffersPerGroup, address indexed executedBy);
    event MaxOffersPerBatchChanged(uint16 maxOffersPerBatch, address indexed executedBy);
    event MaxTwinsPerBundleChanged(uint16 maxTwinsPerBundle, address indexed executedBy);
    event MaxOffersPerBundleChanged(uint16 maxOffersPerBundle, address indexed executedBy);
    event MaxTokensPerWithdrawalChanged(uint16 maxOffersPerBundle, address indexed executedBy);    
}
