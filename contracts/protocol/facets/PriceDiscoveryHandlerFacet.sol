// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { BuyerBase } from "../bases/BuyerBase.sol";
import { IBosonPriceDiscoveryHandler } from "../../interfaces/handlers/IBosonPriceDiscoveryHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { BuyerBase } from "../bases/BuyerBase.sol";
import { FundsLib } from "../libs/FundsLib.sol";
import "../../domain/BosonConstants.sol";
import { PriceDiscoveryBase } from "../bases/PriceDiscoveryBase.sol";

/**
 * @title PriceDiscoveryHandlerFacet
 *
 * @notice Handles exchanges associated with offers within the protocol.
 */
contract PriceDiscoveryHandlerFacet is IBosonPriceDiscoveryHandler, PriceDiscoveryBase, BuyerBase {
    /**
     * @notice
     * For offers with native exchange token, it is expected that the price discovery contracts will
     * operate with wrapped native token. Set the address of the wrapped native token in the constructor.
     *
     * @param _wNative - the address of the wrapped native token
     */
    //solhint-disable-next-line
    constructor(address _wNative) PriceDiscoveryBase(_wNative) {}

    /**
     * @notice Facet Initializer
     * This function is callable only once.
     */
    function initialize() public onlyUninitialized(type(IBosonPriceDiscoveryHandler).interfaceId) {
        DiamondLib.addSupportedInterface(type(IBosonPriceDiscoveryHandler).interfaceId);
    }

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
        PriceDiscovery calldata _priceDiscovery
    ) external payable override exchangesNotPaused buyersNotPaused nonReentrant {
        // Make sure buyer address is not zero address
        if (_buyer == address(0)) revert InvalidAddress();

        bool isTokenId;
        uint256 offerId = _tokenIdOrOfferId >> 128;
        // if `_tokenIdOrOfferId` is a token id, then upper 128 bits represent the offer id.
        // Therefore, if `offerId` is not 0, then `_tokenIdOrOfferId` represents a token id
        // and if `offerId` is 0, then `_tokenIdOrOfferId` represents an offer id.
        // N.B. token ids, corresponding to exchanges from v2.2.0 and earlier, have zero upper 128 bits
        // and it seems we could confuse them with offer ids. However, the offers frm that time are all
        // of type PriceType.Static and therefore will never be used here.

        if (offerId == 0) {
            offerId = _tokenIdOrOfferId;
        } else {
            isTokenId = true;
        }

        // Fetch offer with offerId
        Offer storage offer = getValidOffer(offerId);

        // Make sure offer type is price discovery. Otherwise, use commitToOffer
        if (offer.priceType != PriceType.Discovery) revert InvalidPriceType();
        uint256 sellerId = offer.sellerId;

        uint256 actualPrice;
        {
            // Get seller address
            address _seller;
            (, Seller storage seller, ) = fetchSeller(sellerId);
            _seller = seller.assistant;

            // Calls price discovery contract and gets the actual price. Use token id if caller has provided one, otherwise use offer id and accepts any voucher.
            actualPrice = fulfilOrder(isTokenId ? _tokenIdOrOfferId : 0, offer, _priceDiscovery, _seller, _buyer);
        }

        // Fetch token id on protocol status
        uint256 tokenId = protocolStatus().incomingVoucherId;

        uint256 exchangeId = tokenId & type(uint128).max;

        // Get sequential commits for this exchange
        ExchangeCosts[] storage exchangeCosts = protocolEntities().exchangeCosts[exchangeId];

        // Calculate fees
        address exchangeToken = offer.exchangeToken;
        uint256 protocolFeeAmount = _getProtocolFee(exchangeToken, actualPrice);

        {
            // Calculate royalties
            (RoyaltyInfo storage royaltyInfo, uint256 royaltyInfoIndex, ) = fetchRoyalties(offerId, false);
            uint256 royaltyAmount = (getTotalRoyaltyPercentage(royaltyInfo.bps) * actualPrice) / HUNDRED_PERCENT;

            // Verify that fees and royalties are not higher than the price.
            if (protocolFeeAmount + royaltyAmount > actualPrice) revert FeeAmountTooHigh();

            // Store exchange costs so it can be released later. This is the first cost entry for this exchange.
            exchangeCosts.push(
                ExchangeCosts({
                    resellerId: sellerId,
                    price: actualPrice,
                    protocolFeeAmount: protocolFeeAmount,
                    royaltyAmount: royaltyAmount,
                    royaltyInfoIndex: royaltyInfoIndex
                })
            );
        }
        // Clear incoming voucher id and incoming voucher address
        clearPriceDiscoveryStorage();

        (, uint256 buyerId) = getBuyerIdByWallet(_buyer);
        if (actualPrice > 0) {
            // If exchange token is 0, we need to unwrap it
            if (exchangeToken == address(0)) {
                wNative.withdraw(actualPrice);
            }

            emit FundsEncumbered(buyerId, exchangeToken, actualPrice, msgSender());
            // Not emitting BuyerCommitted since it's emitted in commitToOfferInternal
        }
    }
}
