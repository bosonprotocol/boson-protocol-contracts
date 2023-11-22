// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.21;

import { BosonTypes } from "../../domain/BosonTypes.sol";
import { BosonErrors } from "../../domain/BosonErrors.sol";
import { IBosonExchangeEvents } from "../events/IBosonExchangeEvents.sol";
import { IBosonTwinEvents } from "../events/IBosonTwinEvents.sol";
import { IBosonFundsLibEvents } from "../events/IBosonFundsEvents.sol";

/**
 * @title IBosonPriceDiscoveryHandler
 *
 * @notice Handles exchanges associated with offers within the protocol.
 *
 * The ERC-165 identifier for this interface is: 0xdec319c9
 */
interface IBosonPriceDiscoveryHandler is BosonErrors, IBosonExchangeEvents, IBosonFundsLibEvents, IBosonTwinEvents {
    /**
     * @notice Commits to a price discovery offer (first step of an exchange).
     *
     * Emits a BuyerCommitted event if successful.
     * Issues a voucher to the buyer address.
     *
     * Reverts if:
     * - Offer price type is not price discovery. See BosonTypes.PriceType
     * - Price discovery contract address is zero
     * - Price discovery calldata is empty
     * - Exchange exists already
     * - Offer has been voided
     * - Offer has expired
     * - Offer is not yet available for commits
     * - Buyer address is zero
     * - Buyer account is inactive
     * - Buyer is token-gated (conditional commit requirements not met or already used)
     * - Any reason that PriceDiscoveryBase fulfilOrder reverts. See PriceDiscoveryBase.fulfilOrder
     * - Any reason that ExchangeHandler onPremintedVoucherTransfer reverts. See ExchangeHandler.onPremintedVoucherTransfer
     *
     * @param _buyer - the buyer's address (caller can commit on behalf of a buyer)
     * @param _tokenIdOrOfferId - the id of the offer to commit to or the id of the voucher (if pre-minted)
     * @param _priceDiscovery - price discovery data (if applicable). See BosonTypes.PriceDiscovery
     */
    function commitToPriceDiscoveryOffer(
        address payable _buyer,
        uint256 _tokenIdOrOfferId,
        BosonTypes.PriceDiscovery calldata _priceDiscovery
    ) external payable;
}
