// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { BosonTypes } from "../../domain/BosonTypes.sol";
import { BosonErrors } from "../../domain/BosonErrors.sol";
import { IBosonExchangeEvents } from "../events/IBosonExchangeEvents.sol";
import { IBosonTwinEvents } from "../events/IBosonTwinEvents.sol";
import { IBosonFundsBaseEvents } from "../events/IBosonFundsEvents.sol";

/**
 * @title IBosonPriceDiscoveryHandler
 *
 * @notice Handles exchanges associated with offers within the protocol.
 *
 * The ERC-165 identifier for this interface is: 0xdec319c9
 */
interface IBosonPriceDiscoveryHandler is BosonErrors, IBosonExchangeEvents, IBosonFundsBaseEvents, IBosonTwinEvents {
    /**
     * @notice Commits to a price discovery offer (first step of an exchange).
     *
     * Emits a BuyerCommitted or SellerCommitted event if successful.
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
     * - Committer address is zero
     * - Committer account is inactive
     * - Buyer is token-gated (conditional commit requirements not met or already used)
     * - Any reason that PriceDiscoveryBase fulfilOrder reverts. See PriceDiscoveryBase.fulfilOrder
     * - Any reason that ExchangeHandler onPremintedVoucherTransfer reverts. See ExchangeHandler.onPremintedVoucherTransfer
     *
     * @param _committer - the seller's or the buyer's address. The caller can commit on behalf of a buyer or a seller.
     * @param _tokenIdOrOfferId - the id of the offer to commit to or the id of the voucher (if pre-minted)
     * @param _priceDiscovery - price discovery data (if applicable). See BosonTypes.PriceDiscovery
     */
    function commitToPriceDiscoveryOffer(
        address payable _committer,
        uint256 _tokenIdOrOfferId,
        BosonTypes.PriceDiscovery calldata _priceDiscovery
    ) external payable;

    /**
     * @notice Commits to a buyer-created price discovery offer with seller-specific parameters (first step of an exchange).
     *
     * Emits a SellerCommitted event if successful.
     * Issues a voucher to the buyer address.
     *
     * Reverts if:
     * - The exchanges region of protocol is paused
     * - The buyers region of protocol is paused
     * - The sellers region of protocol is paused
     * - Offer price type is not price discovery
     * - Offer has been voided
     * - Offer has expired
     * - Offer is not yet available for commits
     * - Committer address is zero
     * - Committer is not a seller assistant
     * - Offer is not buyer-created
     * - Collection index is invalid for the seller
     * - Royalty recipients are not on seller's whitelist
     * - Royalty percentages are below minimum requirements
     * - Total royalty percentage exceeds maximum allowed
     * - Price discovery contract address is zero
     * - Price discovery calldata is empty
     * - Exchange exists already
     * - Any reason that PriceDiscoveryBase fulfilOrder reverts
     *
     * @param _committer - the seller's address. The caller can commit on behalf of a seller.
     * @param _tokenIdOrOfferId - the id of the offer to commit to or the id of the voucher (if pre-minted)
     * @param _priceDiscovery - price discovery data
     * @param _sellerParams - the seller-specific parameters (collection index, royalty info, mutualizer address)
     */
    function commitToBuyerPriceDiscoveryOffer(
        address payable _committer,
        uint256 _tokenIdOrOfferId,
        BosonTypes.PriceDiscovery calldata _priceDiscovery,
        BosonTypes.SellerOfferParams calldata _sellerParams
    ) external payable;
}
