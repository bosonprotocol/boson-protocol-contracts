// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.21;

import { BuyerBase } from "../bases/BuyerBase.sol";
import { IBosonPriceDiscoveryHandler } from "../../interfaces/handlers/IBosonPriceDiscoveryHandler.sol";
import { IBosonVoucher } from "../../interfaces/clients/IBosonVoucher.sol";
import { ITwinToken } from "../../interfaces/ITwinToken.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { BuyerBase } from "../bases/BuyerBase.sol";
import { DisputeBase } from "../bases/DisputeBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { FundsLib } from "../libs/FundsLib.sol";
import "../../domain/BosonConstants.sol";
import { IERC1155 } from "../../interfaces/IERC1155.sol";
import { IERC721 } from "../../interfaces/IERC721.sol";
import { IERC20 } from "../../interfaces/IERC20.sol";
import { IERC721Receiver } from "../../interfaces/IERC721Receiver.sol";
import { PriceDiscoveryBase } from "../bases/PriceDiscoveryBase.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title PriceDiscoveryHandlerFacet
 *
 * @notice Handles exchanges associated with offers within the protocol.
 */
contract PriceDiscoveryHandlerFacet is IBosonPriceDiscoveryHandler, PriceDiscoveryBase, BuyerBase {
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
    ) external payable override exchangesNotPaused buyersNotPaused {
        // Make sure caller provided price discovery data
        require(
            _priceDiscovery.priceDiscoveryContract != address(0) && _priceDiscovery.priceDiscoveryData.length > 0,
            INVALID_PRICE_DISCOVERY
        );

        bool isTokenId;
        uint256 offerId;

        // First try to fetch offer with _tokenIdOrOfferId
        (bool exists, Offer storage offer) = fetchOffer(_tokenIdOrOfferId);

        if (exists) {
            // Set offer id if offer exists
            offerId = _tokenIdOrOfferId;
        } else {
            // Extract offerId from _tokenIdOrOfferId
            offerId = _tokenIdOrOfferId >> 128;

            // Fetch offer with offerId
            (exists, offer) = fetchOffer(offerId);

            // Make sure offer exists
            require(exists, NO_SUCH_OFFER);

            // Sinalize that _tokenIdOrOfferId is a token id
            isTokenId = true;
        }

        // Make sure offer exists, is available, and isn't void, expired, or sold out
        require(exists, NO_SUCH_OFFER);

        // Make sure offer type is price discovery. Otherwise, use commitToOffer
        require(offer.priceType == PriceType.Discovery, INVALID_PRICE_TYPE);

        uint256 actualPrice;

        // Calls price discovery contract and gets the actual price. Use token id if caller has provided one, otherwise use offer id and accepts any voucher.
        if (!isTokenId) {
            actualPrice = fulfilOrder(0, offer, _priceDiscovery, _buyer);
        } else {
            actualPrice = fulfilOrder(_tokenIdOrOfferId, offer, _priceDiscovery, _buyer);
        }

        // Fetch token id on protocol status
        uint256 tokenId = protocolStatus().incomingVoucherId;

        uint256 exchangeId = tokenId & type(uint128).max;

        // Get sequential commits for this exchange
        ExchangeCosts[] storage exchangeCosts = protocolEntities().exchangeCosts[exchangeId];

        // Calculate fees
        uint256 protocolFeeAmount = getProtocolFee(offer.exchangeToken, actualPrice);

        // Calculate royalties
        (, uint256 royaltyAmount) = IBosonVoucher(protocolLookups().cloneAddress[offer.sellerId]).royaltyInfo(
            exchangeId,
            actualPrice
        );

        // Verify that fees and royalties are not higher than the price.
        require((protocolFeeAmount + royaltyAmount) <= actualPrice, FEE_AMOUNT_TOO_HIGH);

        uint256 buyerId = getValidBuyer(_buyer);

        // Storage exchange costs so it can be released later. This is the first cost entry for this exchange.
        exchangeCosts.push(
            ExchangeCosts({
                resellerId: buyerId,
                price: actualPrice,
                protocolFeeAmount: protocolFeeAmount,
                royaltyAmount: royaltyAmount
            })
        );

        // Clear incoming voucher id and incoming voucher address
        clearStorage();
    }
}
