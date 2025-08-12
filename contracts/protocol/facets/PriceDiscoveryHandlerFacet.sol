// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { BuyerBase } from "../bases/BuyerBase.sol";
import { OfferBase } from "../bases/OfferBase.sol";
import { IBosonPriceDiscoveryHandler } from "../../interfaces/handlers/IBosonPriceDiscoveryHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import "../../domain/BosonConstants.sol";
import { PriceDiscoveryBase } from "../bases/PriceDiscoveryBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";

/**
 * @title PriceDiscoveryHandlerFacet
 *
 * @notice Handles exchanges associated with offers within the protocol.
 */
contract PriceDiscoveryHandlerFacet is IBosonPriceDiscoveryHandler, PriceDiscoveryBase, BuyerBase, OfferBase {
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
        PriceDiscovery calldata _priceDiscovery
    ) external payable override exchangesNotPaused buyersNotPaused sellersNotPaused nonReentrant {
        // Make sure committer address is not zero address
        if (_committer == address(0)) revert InvalidAddress();

        // Create empty seller params for backward compatibility
        RoyaltyInfo memory emptyRoyalty;
        SellerOfferParams memory emptySellerParams = SellerOfferParams(0, emptyRoyalty, payable(address(0)));
        commitToPriceDiscoveryOfferInternal(_committer, _tokenIdOrOfferId, _priceDiscovery, emptySellerParams);
    }

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
        PriceDiscovery calldata _priceDiscovery,
        SellerOfferParams calldata _sellerParams
    ) external payable override exchangesNotPaused buyersNotPaused sellersNotPaused nonReentrant {
        if (_committer == address(0)) revert InvalidAddress();

        uint256 offerId = _tokenIdOrOfferId >> 128;
        if (offerId == 0) {
            offerId = _tokenIdOrOfferId;
        }

        Offer storage offer = getValidOffer(offerId);
        if (offer.priceType != PriceType.Discovery) revert InvalidPriceType();
        if (offer.creator != OfferCreator.Buyer) revert InvalidOfferCreator();

        (bool sellerExists, ) = getSellerIdByAssistant(_committer);
        if (!sellerExists) revert NotAssistant();

        SellerOfferParams memory sellerParams = SellerOfferParams(
            _sellerParams.collectionIndex,
            _sellerParams.royaltyInfo,
            _sellerParams.mutualizerAddress
        );

        commitToPriceDiscoveryOfferInternal(_committer, _tokenIdOrOfferId, _priceDiscovery, sellerParams);
    }

    /**
     * @notice Internal function to commit to a price discovery offer, handling both seller and buyer created offers
     *
     * @param _committer - the seller's or the buyer's address
     * @param _tokenIdOrOfferId - the id of the offer to commit to or the id of the voucher (if pre-minted)
     * @param _priceDiscovery - price discovery data
     * @param _sellerParams - seller-specific parameters (collection index, royalty info, mutualizer address)
     */
    function commitToPriceDiscoveryOfferInternal(
        address payable _committer,
        uint256 _tokenIdOrOfferId,
        PriceDiscovery calldata _priceDiscovery,
        SellerOfferParams memory _sellerParams
    ) internal {
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

        // Determine buyer and seller addresses based on offer creator
        address payable buyerAddress;
        address sellerAddress;

        if (offer.creator == OfferCreator.Buyer) {
            // Buyer-created offer: seller is committing
            // Validate seller and get seller address
            (bool sellerExists, uint256 sellerIdFromCommitter) = getSellerIdByAssistant(_committer);
            if (!sellerExists) revert NotAssistant();

            // Update offer with actual seller ID
            offer.sellerId = sellerIdFromCommitter;
            sellerId = sellerIdFromCommitter;

            // Handle seller parameters for buyer-created offers
            {
                ProtocolLib.ProtocolLookups storage lookups = protocolLookups();
                if (_sellerParams.collectionIndex > 0) {
                    if (lookups.additionalCollections[sellerId].length < _sellerParams.collectionIndex) {
                        revert NoSuchCollection();
                    }
                }

                validateRoyaltyInfo(lookups, protocolLimits(), sellerId, _sellerParams.royaltyInfo);

                offer.collectionIndex = _sellerParams.collectionIndex;
                offer.royaltyInfo[0] = _sellerParams.royaltyInfo;

                if (_sellerParams.mutualizerAddress != address(0)) {
                    DisputeResolutionTerms storage disputeTerms = fetchDisputeResolutionTerms(offerId);
                    disputeTerms.mutualizerAddress = _sellerParams.mutualizerAddress;
                }
            }

            // Get seller address
            (, Seller storage seller, ) = fetchSeller(sellerId);
            sellerAddress = seller.assistant;

            // Get buyer address from stored buyerId
            (, Buyer storage buyer) = fetchBuyer(offer.buyerId);
            buyerAddress = buyer.wallet;
        } else {
            // Seller-created offer: buyer is committing (existing logic)
            buyerAddress = _committer;

            // Get seller address
            (, Seller storage seller, ) = fetchSeller(sellerId);
            sellerAddress = seller.assistant;
        }

        uint256 actualPrice;
        {
            // Calls price discovery contract and gets the actual price. Use token id if caller has provided one, otherwise use offer id and accepts any voucher.
            actualPrice = fulfilOrder(
                isTokenId ? _tokenIdOrOfferId : 0,
                offer,
                _priceDiscovery,
                sellerAddress,
                buyerAddress
            );
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

        (, uint256 buyerId) = getBuyerIdByWallet(buyerAddress);
        if (actualPrice > 0) {
            // If exchange token is 0, we need to unwrap it
            if (exchangeToken == address(0)) {
                wNative.withdraw(actualPrice);
            }

            emit FundsEncumbered(buyerId, exchangeToken, actualPrice, _msgSender());
            // Not emitting BuyerCommitted since it's emitted in commitToOfferInternal
        }
    }
}
