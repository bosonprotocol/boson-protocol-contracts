// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {BosonTypes} from "../../domain/BosonTypes.sol";
import {IBosonConfigEvents} from "../events/IBosonConfigEvents.sol";

/**
 * @title IBosonConfigHandler
 *
 * @notice Handles management of configuration within the protocol.
 *
 * The ERC-165 identifier for this interface is: 0x41e75f1e
 */
interface IBosonConfigHandler is IBosonConfigEvents {

    /**
     * @notice Sets the address of the Boson Token (ERC-20) contract.
     *
     * Emits a TokenAddressChanged event.
     *
     * @param _token - the address of the token contract
     */
    function setTokenAddress(address payable _token) external;

    /**
     * @notice The tokenAddress getter
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
     * @notice The treasuryAddress getter
     */
    function getTreasuryAddress() external view returns (address payable);

    /**
     * @notice Sets the address of the Voucher NFT address (proxy)
     *
     * Emits a VoucherAddressChanged event.
     *
     * @param _voucher - the address of the nft contract
     */
    function setVoucherAddress(address _voucher) external;

    /**
     * @notice The Voucher address getter
     */
    function getVoucherAddress() external view returns (address);

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
   
}
