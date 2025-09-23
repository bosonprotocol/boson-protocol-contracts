// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { BosonTypes } from "../../domain/BosonTypes.sol";
import { BosonErrors } from "../../domain/BosonErrors.sol";
import { IBosonExchangeEvents } from "../events/IBosonExchangeEvents.sol";
import { IBosonFundsEvents, IBosonFundsBaseEvents } from "../events/IBosonFundsEvents.sol";

/**
 * @title ISequentialCommitHandler
 *
 * @notice Handles sequential commits.
 *
 * The ERC-165 identifier for this interface is: 0x34780cc6
 */
interface IBosonSequentialCommitHandler is BosonErrors, IBosonExchangeEvents, IBosonFundsEvents, IBosonFundsBaseEvents {
    /**
     * @notice Commits to an existing exchange. Price discovery is offloaded to external contract.
     *
     * Emits a BuyerCommitted event if successful.
     * Transfers voucher to the buyer address.
     *
     * Reverts if:
     * - The exchanges region of protocol is paused
     * - The buyers region of protocol is paused
     * - Buyer address is zero
     * - Exchange does not exist
     * - Exchange is not in Committed state
     * - Voucher has expired
     * - It is a bid order and:
     *   - Caller is not the voucher holder
     *   - Voucher owner did not approve protocol to transfer the voucher
     *   - Price received from price discovery is lower than the expected price
     * - It is a ask order and:
     *   - Offer price is in native token and caller does not send enough
     *   - Offer price is in some ERC20 token and caller also sends native currency
     *   - Calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     *   - Received ERC20 token amount differs from the expected value
     *   - Protocol does not receive the voucher
     *   - Transfer of voucher to the buyer fails for some reason (e.g. buyer is contract that doesn't accept voucher)
     *   - Reseller did not approve protocol to transfer exchange token in escrow
     * - Call to price discovery contract fails
     * - Protocol fee and royalties combined exceed the secondary price
     * - The secondary price cannot cover the buyer's cancellation penalty
     * - Transfer of exchange token fails
     *
     * @param _buyer - the buyer's address (caller can commit on behalf of a buyer)
     * @param _exchangeId - the id of the exchange to commit to
     * @param _priceDiscovery - the fully populated BosonTypes.PriceDiscovery struct
     */
    function sequentialCommitToOffer(
        address payable _buyer,
        uint256 _exchangeId,
        BosonTypes.PriceDiscovery calldata _priceDiscovery
    ) external payable;
}
