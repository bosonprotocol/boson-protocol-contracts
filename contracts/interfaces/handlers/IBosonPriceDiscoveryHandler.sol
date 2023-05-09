// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;

import { BosonTypes } from "../../domain/BosonTypes.sol";
import { IBosonExchangeEvents } from "../events/IBosonExchangeEvents.sol";
import { IBosonTwinEvents } from "../events/IBosonTwinEvents.sol";
import { IBosonFundsLibEvents } from "../events/IBosonFundsEvents.sol";

/**
 * @title IBosonPriceDiscoveryHandler
 *
 * @notice Handles exchanges associated with offers within the protocol.
 *
 * The ERC-165 identifier for this interface is: 0x3b9a7392
 */
interface IBosonPriceDiscoveryHandler is IBosonExchangeEvents, IBosonFundsLibEvents, IBosonTwinEvents {
    /**
     * @notice Commits to a price discovery offer (first step of an exchange).
     *
     * Emits a BuyerCommitted event if successful.
     * Issues a voucher to the buyer address.
     *
     * Reverts if:
     * - Offer price type is not discovery
     * - Price discovery argument invalid
     * - Exchange exists already
     * - Offer has been voided
     * - Offer has expired
     * - Offer is not yet available for commits
     * - Buyer address is zero
     * - Buyer account is inactive
     * - Buyer is token-gated (conditional commit requirements not met or already used)
     * - Offer price is in native token and caller does not send enough
     * - Offer price is in some ERC20 token and caller also sends native currency
     * - Contract at token address does not support ERC20 function transferFrom
     * - Calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - Received amount differs from the expected value set in price discovery
     * - Seller has less funds available than sellerDeposit
     * - Protocol does not receive the voucher when is ask side
     * - Transfer of voucher to the buyer fails for some reasong (e.g. buyer is contract that doesn't accept voucher)
     * - Call to price discovery contract fails
     *
     * @param _buyer - the buyer's address (caller can commit on behalf of a buyer)
     * @param _tokenIdOrOfferId - the id of the offer to commit to or the id of the voucher when voucher is known
     * @param _priceDiscovery - price discovery data. See BosonTypes.PriceDiscovery
     */
    function commitToPriceDiscoveryOffer(
        address payable _buyer,
        uint256 _tokenIdOrOfferId,
        BosonTypes.PriceDiscovery calldata _priceDiscovery
    ) external payable;
}
