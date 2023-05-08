// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;

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
import { Address } from "../../ext_libs/Address.sol";
import { IERC1155 } from "../../interfaces/IERC1155.sol";
import { IERC721 } from "../../interfaces/IERC721.sol";
import { IERC20 } from "../../interfaces/IERC20.sol";
import { IERC721Receiver } from "../../interfaces/IERC721Receiver.sol";
import { PriceDiscoveryBase } from "../bases/PriceDiscoveryBase.sol";

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
     * - Calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - Received ERC20 token amount differs from the expected value
     * - Transfer of voucher to the buyer fails for some reason (e.g. buyer is contract that doesn't accept voucher)
     * - Current owner is not price discovery contract
     * - Last voucher owner not found
     * - Call to price discovery contract fails
     * - Exchange doesn't exist after the call to price discovery contract
     * - Exchange is not in the committed state
     * - Price received from price discovery is lower than the expected price
     * - Reseller did not approve protocol to transfer exchange token in escrow
     * - New voucher owner is not buyer wallet
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
        bool isOfferId;
        uint256 offerId = _tokenIdOrOfferId;

        (bool exists, Offer storage offer) = fetchOffer(offerId);

        if (!exists) {
            offerId = _tokenIdOrOfferId >> 128;

            (exists, offer) = fetchOffer(offerId);
        } else {
            isOfferId = true;
        }

        // Make sure offer exists, is available, and isn't void, expired, or sold out
        require(exists, NO_SUCH_OFFER);

        require(offer.priceType == PriceType.Discovery, INVALID_PRICE_TYPE);

        // Make sure caller provided price discovery data
        require(
            _priceDiscovery.price > 0 &&
                _priceDiscovery.priceDiscoveryContract != address(0) &&
                _priceDiscovery.priceDiscoveryData.length > 0,
            INVALID_PRICE_DISCOVERY
        );

        uint256 actualPrice;

        if (isOfferId) {
            // @TODO can't be bid here
            actualPrice = fulfilOrder(0, offer, _priceDiscovery, _buyer);
        } else {
            actualPrice = fulfilOrder(_tokenIdOrOfferId, offer, _priceDiscovery, _buyer);
        }

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

        exchangeCosts.push(
            ExchangeCosts({
                resellerId: buyerId,
                price: actualPrice,
                protocolFeeAmount: protocolFeeAmount,
                royaltyAmount: royaltyAmount
            })
        );

        clearStorage(tokenId);
    }
}
